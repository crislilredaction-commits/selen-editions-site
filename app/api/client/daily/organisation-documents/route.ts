import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";

const MAX_SIZE = 10 * 1024 * 1024;
const FIELDS: Record<string, string> = {
  insee: "insee_document_url",
  qualiopi: "qualiopi_certificate_url",
  bpf: "nda_or_bpf_document_url",
};

function safe(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "document";
}

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "legal_profile");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const type = String(form?.get("type") ?? "").trim();
  const column = FIELDS[type];
  if (!column) return NextResponse.json({ error: "Type de document invalide." }, { status: 400 });
  if (!(file instanceof File) || file.size <= 0) return NextResponse.json({ error: "Sélectionnez un document." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Le document doit peser moins de 10 Mo." }, { status: 400 });
  const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) return NextResponse.json({ error: "Formats acceptés : PDF, JPG, PNG ou WebP." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const storagePath = `daily/${context.organisationId}/organisation/${type}/${Date.now()}-${safe(file.name)}`;
  const { error: uploadError } = await context.admin.storage.from("documents").upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicData } = context.admin.storage.from("documents").getPublicUrl(storagePath);
  const url = publicData.publicUrl;
  const { error: updateError } = await context.admin
    .from("daily_onboarding")
    .update({ [column]: url, updated_at: new Date().toISOString() })
    .eq("user_id", context.user.id);

  if (updateError) {
    await context.admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url, type });
}
