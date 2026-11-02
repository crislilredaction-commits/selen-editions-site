import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";

function privateJson(body: unknown, init: { status?: number } = {}) {
  return NextResponse.json(body, { ...init, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions", { allowAssistanceRead: true });
  if (!context.ok) {
    return privateJson({ error: context.error }, { status: context.status });
  }

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) {
    return privateJson({ error: "Document manquant." }, { status: 400 });
  }

  const { data: document, error } = await context.admin
    .from("daily_documents")
    .select("id,organisation_id,document_type,bucket,storage_path")
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .in("document_type", ["attendance_summary", "completion_certificate"])
    .in("status", ["published", "signed"])
    .eq("is_current", true)
    .is("archived_at", null)
    .maybeSingle();

  if (error) return privateJson({ error: "Lecture des documents de fin temporairement indisponible." }, { status: 503 });
  if (!document) return privateJson({ error: "Document introuvable." }, { status: 404 });
  if (!document.bucket || !document.storage_path) {
    return privateJson({ error: "Fichier de fin de formation indisponible." }, { status: 503 });
  }

  try {
    const { data: signed, error: signError } = await context.admin.storage
      .from(document.bucket)
      .createSignedUrl(document.storage_path, 120);
    if (signError || !signed?.signedUrl) throw new Error("storage_unavailable");
    return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return privateJson({ error: "Téléchargement temporairement indisponible." }, { status: 503 });
  }
}
