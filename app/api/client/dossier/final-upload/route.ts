import { NextResponse } from "next/server";

import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";
import { createUniqueStorageFileName } from "@/lib/server/storageFileNames";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function validateUpload(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return "Format non autorisé. Utilisez un fichier PDF, DOC ou DOCX.";
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return "Format non autorisé. Utilisez un fichier PDF, DOC ou DOCX.";
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return "Le fichier est trop volumineux. La taille maximale est de 10 Mo.";
  }

  return null;
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

    const validationError = validateUpload(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const access = await verifyClientNdaDossierAccess(supabase, dossierId, req);

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const organisationId = access.dossier.organisation_id;
    const safeStorageName = createUniqueStorageFileName(
      file.name,
      "document-signe.pdf",
    );
    const storagePath = `${organisationId}/${dossierId}/final/${safeStorageName}`;
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

    if (access.mode === "agent_assistance" && access.assistance) {
      await logAgentAssistanceAction({
        supabase,
        req,
        assistance: access.assistance,
        dossierId,
        action: "replace_or_upload_final_document",
        actionLabel:
          "Document final déposé/remplacé en mode assistance agent",
        newState: {
          document_id: document.id,
          name: file.name,
          document_type: documentType,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      document,
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
