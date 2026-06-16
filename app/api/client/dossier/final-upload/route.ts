import { NextResponse } from "next/server";

import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";

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
    const documentType = String(formData.get("documentType") ?? "").trim();

    if (!(file instanceof File) || !dossierId || !documentType) {
      return NextResponse.json(
        { error: "file, dossierId ou documentType manquant." },
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
    const safeName = sanitizeFileName(file.name || "document-signe.pdf");
    const storagePath = `${organisationId}/${dossierId}/final/${Date.now()}-${safeName}`;
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

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
        document_type: documentType,
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

    return NextResponse.json({ ok: true, document });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
