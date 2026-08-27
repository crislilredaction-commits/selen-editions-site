import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PDF_TYPES = new Set(["application/pdf"]);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const KINDS = {
  organisation_logo: { documentType: "organisation_logo", accepted: IMAGE_TYPES },
  insee_notice: { documentType: "insee_notice", accepted: PDF_TYPES },
  qualiopi_certificate: { documentType: "qualiopi_certificate", accepted: PDF_TYPES },
  bpf: { documentType: "bpf", accepted: PDF_TYPES },
  trainer_cv: { documentType: "trainer_cv", accepted: DOCUMENT_TYPES },
  training_program_source: { documentType: "training_program_source", accepted: DOCUMENT_TYPES },
  positioning_questionnaire_source: { documentType: "positioning_questionnaire_source", accepted: DOCUMENT_TYPES },
} as const;

function safePart(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "document";
}

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "trainings");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const kind = String(formData?.get("kind") ?? "") as keyof typeof KINDS;
  const slot = safePart(String(formData?.get("slot") ?? "principal"));
  const config = KINDS[kind];

  if (!(file instanceof File) || !config) return NextResponse.json({ error: "Fichier ou type de document invalide." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Le fichier doit peser moins de 10 Mo." }, { status: 400 });
  if (!config.accepted.has(file.type as never)) return NextResponse.json({ error: "Ce format de fichier n’est pas accepté pour ce document." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const logicalName = `${kind}-${slot}`;
  const { data: previousRows, error: previousError } = await context.admin
    .from("daily_documents")
    .select("id,version,is_current")
    .eq("organisation_id", context.organisationId)
    .eq("document_type", config.documentType)
    .eq("linked_object_type", "organisation")
    .eq("linked_object_id", context.organisationId)
    .eq("logical_name", logicalName)
    .order("version", { ascending: false })
    .limit(1);
  if (previousError) return NextResponse.json({ error: previousError.message }, { status: 500 });

  const previous = previousRows?.[0] ?? null;
  const version = Number(previous?.version ?? 0) + 1;
  const storagePath = `daily/${context.organisationId}/onboarding/${kind}/${slot}/${Date.now()}-${safePart(file.name)}`;
  const { error: uploadError } = await context.admin.storage.from("documents").upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  if (previous?.is_current) {
    const { error } = await context.admin.from("daily_documents").update({ is_current: false, updated_by: context.user.id }).eq("id", previous.id);
    if (error) {
      await context.admin.storage.from("documents").remove([storagePath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data: document, error: insertError } = await context.admin.from("daily_documents").insert({
    organisation_id: context.organisationId,
    document_type: config.documentType,
    linked_object_type: "organisation",
    linked_object_id: context.organisationId,
    version,
    status: "to_check",
    logical_name: logicalName,
    bucket: "documents",
    storage_path: storagePath,
    mime_type: file.type,
    size_bytes: file.size,
    sha256,
    created_by: context.user.id,
    updated_by: context.user.id,
    is_current: true,
    previous_document_id: previous?.id ?? null,
    metadata: { original_filename: file.name, upload_kind: kind, slot, source: "daily_client" },
  }).select("id").single();

  if (insertError || !document) {
    await context.admin.storage.from("documents").remove([storagePath]);
    if (previous?.id) await context.admin.from("daily_documents").update({ is_current: true }).eq("id", previous.id);
    return NextResponse.json({ error: insertError?.message ?? "Enregistrement du document impossible." }, { status: 500 });
  }

  return NextResponse.json({ id: document.id, url: `/api/client/daily/uploads?id=${document.id}`, name: file.name });
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["trainings", "sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Document manquant." }, { status: 400 });
  const { data: document, error } = await context.admin.from("daily_documents")
    .select("bucket,storage_path")
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .single();
  if (error || !document) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  const { data: signed, error: signError } = await context.admin.storage.from(document.bucket).createSignedUrl(document.storage_path, 120);
  if (signError || !signed?.signedUrl) return NextResponse.json({ error: "Téléchargement indisponible." }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
