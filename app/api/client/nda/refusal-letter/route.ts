import { NextResponse } from "next/server";

import {
  getAssignedAgentId,
  getDossierSnapshot,
} from "@/lib/server/notifications";
import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";

const REFUSAL_LETTER_MESSAGE =
  "Le client a déposé un courrier de refus DREETS pour étude.";

function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const formData = await req.formData();
    const file = formData.get("file");
    const dossierId = String(formData.get("dossierId") ?? "").trim();

    if (!(file instanceof File) || !dossierId) {
      return NextResponse.json(
        { error: "file ou dossierId manquant." },
        { status: 400 },
      );
    }

    const access = await verifyClientNdaDossierAccess(supabase, dossierId);

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const organisationId = access.dossier.organisation_id;
    const safeName = sanitizeFileName(file.name || "courrier-refus-nda.pdf");
    const storagePath = `${organisationId}/${dossierId}/refusal/${Date.now()}-${safeName}`;
    const fileBuffer = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Storage: ${uploadError.message}` },
        { status: 500 },
      );
    }

    const { data: document, error: insertError } = await supabase
      .from("documents")
      .insert({
        name: file.name,
        document_type: "nda_refusal_letter",
        status: "uploaded",
        source: "client_upload",
        document_role: "client_returned_document",
        review_status: "received",
        is_visible_to_client: false,
        requires_client_action: false,
        metadata: {},
        storage_path: storagePath,
        organisation_id: organisationId,
        dossier_id: dossierId,
        scope: "dossier",
      })
      .select(
        "id, name, document_type, document_role, review_status, requires_client_action, status, created_at",
      )
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: `Database: ${insertError.message}` },
        { status: 500 },
      );
    }

    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        dossier_id: dossierId,
        sender_type: "system",
        content: REFUSAL_LETTER_MESSAGE,
        read_by_agent_at: null,
      })
      .select("id")
      .single();

    if (messageError) {
      return NextResponse.json(
        { error: messageError.message },
        { status: 500 },
      );
    }

    const assignedAgentId = await getAssignedAgentId(supabase, dossierId);
    const snapshot = await getDossierSnapshot(supabase, dossierId);

    const { error: notificationError } = await supabase
      .from("notifications")
      .insert({
        type: "client_uploaded_nda_refusal_letter",
        title: "Courrier de refus DREETS déposé",
        content: REFUSAL_LETTER_MESSAGE,
        dossier_id: dossierId,
        dossier_title: snapshot.dossierTitle,
        organisation_name: snapshot.organisationName,
        link_path: snapshot.linkPath,
        source_message_id: message.id,
        target_role: "agent",
        target_user_id: assignedAgentId,
        escalation_at: new Date(
          Date.now() + 72 * 60 * 60 * 1000,
        ).toISOString(),
      });

    if (notificationError) {
      return NextResponse.json(
        { error: notificationError.message },
        { status: 500 },
      );
    }

    const refusalReceivedAt = new Date().toISOString();
    const nextDepositStatus = "refusal_received";

    const { error: trackingUpdateError } = await supabase
      .from("nda_variables")
      .upsert(
        {
          dossier_id: dossierId,
          organisation_id: access.dossier.organisation_id,
          nda_deposit_status: nextDepositStatus,
          nda_deposit_refusal_received_at: refusalReceivedAt,
        },
        { onConflict: "dossier_id" },
      );

    if (trackingUpdateError) {
      return NextResponse.json(
        { error: trackingUpdateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      document,
      ndaTracking: {
        nda_deposit_status: nextDepositStatus,
        nda_deposit_refusal_received_at: refusalReceivedAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
