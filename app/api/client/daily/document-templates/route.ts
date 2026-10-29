import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDailyOrganisationBillingUserId, getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safePart(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "modele";
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["trainings", "sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const id = new URL(req.url).searchParams.get("id");
  const billingUserId = await getDailyOrganisationBillingUserId(context.organisationId, context.user.id);

  if (id) {
    const { data: template, error } = await context.admin
      .from("daily_document_templates")
      .select("id,storage_path")
      .eq("id", id)
      .eq("user_id", billingUserId)
      .single();
    if (error || !template?.storage_path) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
    const { data: signed, error: signError } = await context.admin.storage.from("documents").createSignedUrl(template.storage_path, 120);
    if (signError || !signed?.signedUrl) return NextResponse.json({ error: "Téléchargement indisponible." }, { status: 500 });
    return NextResponse.redirect(signed.signedUrl);
  }

  const { data, error } = await context.admin
    .from("daily_document_templates")
    .select("id,document_type,template_source,template_name,template_version,public_url,status,created_at,updated_at")
    .eq("user_id", billingUserId)
    .eq("status", "active")
    .order("document_type", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "trainings");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const billingUserId = await getDailyOrganisationBillingUserId(context.organisationId, context.user.id);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const documentType = safePart(clean(form?.get("document_type")));
  const templateName = clean(form?.get("template_name")) || documentType;

  if (!(file instanceof File) || !documentType) return NextResponse.json({ error: "Fichier et type de modèle requis." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Le fichier doit peser moins de 10 Mo." }, { status: 400 });
  if (!ACCEPTED.has(file.type)) return NextResponse.json({ error: "Format accepté : PDF, DOC ou DOCX." }, { status: 400 });

  const { data: latest, error: latestError } = await context.admin
    .from("daily_document_templates")
    .select("id,template_version")
    .eq("user_id", billingUserId)
    .eq("document_type", documentType)
    .eq("template_source", "CLIENT")
    .order("template_version", { ascending: false })
    .limit(1);
  if (latestError) return NextResponse.json({ error: latestError.message }, { status: 500 });

  const version = Number(latest?.[0]?.template_version ?? 0) + 1;
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `daily/${context.organisationId}/templates/${documentType}/v${version}-${Date.now()}-${safePart(file.name)}`;
  const { error: uploadError } = await context.admin.storage.from("documents").upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  await context.admin
    .from("daily_document_templates")
    .update({ status: "archived" })
    .eq("user_id", billingUserId)
    .eq("document_type", documentType)
    .eq("template_source", "CLIENT")
    .eq("status", "active");

  const { data, error } = await context.admin.from("daily_document_templates").insert({
    user_id: billingUserId,
    document_type: documentType,
    template_source: "CLIENT",
    template_name: templateName,
    template_version: version,
    storage_path: storagePath,
    public_url: `/api/client/daily/document-templates`,
    variable_schema: { original_filename: file.name, mime_type: file.type, size_bytes: file.size, sha256 },
    status: "active",
  }).select("id,document_type,template_name,template_version,status").single();

  if (error || !data) {
    await context.admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: error?.message ?? "Enregistrement du modèle impossible." }, { status: 500 });
  }
  return NextResponse.json({ template: data });
}

export async function DELETE(req: Request) {
  const context = await getDailyOrganisationContext(req, "trainings");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const billingUserId = await getDailyOrganisationBillingUserId(context.organisationId, context.user.id);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Modèle requis." }, { status: 400 });
  const { error } = await context.admin.from("daily_document_templates").update({ status: "archived" }).eq("id", id).eq("user_id", billingUserId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
