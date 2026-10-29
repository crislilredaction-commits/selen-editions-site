import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";

const MAX_SIZE = 10 * 1024 * 1024;
const TYPES = new Set([
  "training_agreement",
  "convocation",
  "attendance_sheet",
  "completion_certificate",
  "achievement_certificate",
  "internal_rules",
  "welcome_booklet",
]);

function safe(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "document";
}

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const sessionId = String(form?.get("session_id") ?? "").trim();
  const documentType = String(form?.get("document_type") ?? "").trim();
  const beneficiary = String(form?.get("beneficiary") ?? "").trim();

  if (!(file instanceof File) || file.type !== "application/pdf") {
    return NextResponse.json({ error: "Importez uniquement un PDF." }, { status: 400 });
  }
  if (!TYPES.has(documentType)) {
    return NextResponse.json({ error: "Type de document invalide." }, { status: 400 });
  }
  if (!sessionId) {
    return NextResponse.json({ error: "Sélectionnez la session concernée." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Le PDF doit peser moins de 10 Mo." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id,formation_id")
    .eq("id", sessionId)
    .eq("organisation_id", context.organisationId)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const logicalName = `manual-${documentType}${beneficiary ? `-${safe(beneficiary)}` : ""}`;
  const baseVersionQuery = () => context.admin
    .from("daily_documents")
    .select("id,version,is_current")
    .eq("organisation_id", context.organisationId)
    .eq("document_type", documentType)
    .eq("linked_object_type", "session")
    .eq("linked_object_id", sessionId)
    .eq("logical_name", logicalName);

  const [latestResult, currentResult] = await Promise.all([
    baseVersionQuery().order("version", { ascending: false }).limit(1),
    baseVersionQuery().eq("is_current", true).order("version", { ascending: false }).limit(1),
  ]);
  const versionReadError = latestResult.error ?? currentResult.error;
  if (versionReadError) {
    return NextResponse.json({ error: versionReadError.message }, { status: 500 });
  }

  const latest = latestResult.data?.[0] ?? null;
  const current = currentResult.data?.[0] ?? null;
  const version = Number(latest?.version ?? 0) + 1;
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `daily/${context.organisationId}/sessions/${sessionId}/manual/${documentType}/${Date.now()}-${safe(file.name)}`;
  const { error: uploadError } = await context.admin.storage
    .from("documents")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  if (current) {
    const { error: supersedeError } = await context.admin
      .from("daily_documents")
      .update({ is_current: false, updated_by: context.user.id })
      .eq("id", current.id)
      .eq("organisation_id", context.organisationId)
      .eq("is_current", true);
    if (supersedeError) {
      await context.admin.storage.from("documents").remove([storagePath]);
      return NextResponse.json({ error: supersedeError.message }, { status: 500 });
    }
  }

  const { data: document, error } = await context.admin
    .from("daily_documents")
    .insert({
      organisation_id: context.organisationId,
      formation_id: session.formation_id,
      session_id: sessionId,
      document_type: documentType,
      linked_object_type: "session",
      linked_object_id: sessionId,
      logical_name: logicalName,
      version,
      status: "to_check",
      bucket: "documents",
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      sha256,
      created_by: context.user.id,
      updated_by: context.user.id,
      is_current: true,
      previous_document_id: current?.id ?? latest?.id ?? null,
      metadata: {
        source: "manual_client_import",
        beneficiary: beneficiary || null,
        original_filename: file.name,
      },
    })
    .select("id,version,status")
    .single();

  if (error || !document) {
    await context.admin.storage.from("documents").remove([storagePath]);
    if (current?.id) {
      await context.admin
        .from("daily_documents")
        .update({ is_current: true, updated_by: context.user.id })
        .eq("id", current.id)
        .eq("organisation_id", context.organisationId);
    }
    return NextResponse.json(
      { error: error?.message ?? "Enregistrement impossible." },
      { status: 500 },
    );
  }

  return NextResponse.json({ document });
}
