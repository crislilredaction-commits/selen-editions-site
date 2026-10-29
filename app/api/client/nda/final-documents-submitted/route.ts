import { NextResponse } from "next/server";
import {
  getDossierSnapshot,
  getAssignedAgentId,
} from "@/lib/server/notifications";
import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";

const FINAL_DOCUMENTS_SUBMITTED_MESSAGE =
  "Le client a déposé ses documents finaux pour vérification du dossier NDA.";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const dossierId = String(body?.dossierId ?? "").trim();

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const supabase = getAdminSupabase();
    const access = await verifyClientNdaDossierAccess(supabase, dossierId, req);

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    if (access.dossier.type && access.dossier.type !== "nda") {
      return NextResponse.json(
        { error: "Ce dossier n'est pas un parcours NDA." },
        { status: 403 },
      );
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentMessage, error: recentMessageError } = await supabase
      .from("messages")
      .select("id")
      .eq("dossier_id", dossierId)
      .eq("content", FINAL_DOCUMENTS_SUBMITTED_MESSAGE)
      .gte("created_at", oneHourAgo)
      .limit(1)
      .maybeSingle();

    if (recentMessageError) {
      return NextResponse.json(
        { error: recentMessageError.message },
        { status: 500 },
      );
    }

    let messageId = recentMessage?.id ?? null;
    let notificationCreated = false;

    if (!recentMessage) {
      const { data: message, error: messageError } = await supabase
        .from("messages")
        .insert({
          dossier_id: dossierId,
          sender_type: "system",
          content: FINAL_DOCUMENTS_SUBMITTED_MESSAGE,
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

      messageId = message.id;

      const assignedAgentId = await getAssignedAgentId(supabase, dossierId);
      const snapshot = await getDossierSnapshot(supabase, dossierId);

      const { error: notificationError } = await supabase
        .from("notifications")
        .insert({
          type: "client_submitted_nda_final_documents",
          title: "Documents finaux NDA déposés",
          content: FINAL_DOCUMENTS_SUBMITTED_MESSAGE,
          dossier_id: dossierId,
          dossier_title: snapshot.dossierTitle,
          organisation_name: snapshot.organisationName,
          link_path: snapshot.linkPath,
          source_message_id: messageId,
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

      notificationCreated = true;
    }

    if (
      access.dossier.status !== "archived" &&
      access.dossier.status !== "compliant"
    ) {
      const { error: dossierUpdateError } = await supabase
        .from("dossiers")
        .update({ status: "under_review" })
        .eq("id", dossierId);

      if (dossierUpdateError) {
        return NextResponse.json(
          { error: dossierUpdateError.message },
          { status: 500 },
        );
      }
    }

    if (access.mode === "agent_assistance" && access.assistance) {
      await logAgentAssistanceAction({
        supabase,
        req,
        assistance: access.assistance,
        dossierId,
        action: "mark_final_documents_submitted",
        actionLabel:
          "Documents finaux marqués comme déposés en mode assistance agent",
        newState: {
          message_id: messageId,
          dossier_status: "under_review",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      messageId,
      notificationCreated,
      deduped: Boolean(recentMessage),
      assistanceMode: access.mode === "agent_assistance",
      message:
        access.mode === "agent_assistance"
          ? "Action réalisée en mode assistance agent."
          : undefined,
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
