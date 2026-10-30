import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

const MAX_SIZE = 10 * 1024 * 1024;
function clean(value: unknown) { return String(value ?? "").trim(); }
function safe(value: string) { return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "contrat.pdf"; }
async function managerContext() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return context;
  if (!context.workspace.capabilities.trainers && !context.workspace.capabilities.trainers_all)
    return { ok: false as const, status: 403, error: "Accès aux formateurs requis." };
  return { ...context, organisationId: context.workspace.membership.organisation_id, admin: getAdminSupabase() };
}
async function trainerOwned(admin: ReturnType<typeof getAdminSupabase>, organisationId: string, trainerId: string) {
  const { data, error } = await admin.from("daily_trainer_profiles")
    .select("id,display_name").eq("id", trainerId).eq("organisation_id", organisationId).maybeSingle();
  if (error) throw new Error("Lecture du formateur indisponible.");
  return data;
}

export async function GET(req: Request) {
  const context = await managerContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const trainerId = new URL(req.url).searchParams.get("trainer_id")?.trim() || "";
  if (!trainerId) return NextResponse.json({ error: "Formateur requis." }, { status: 400 });
  let trainer: Awaited<ReturnType<typeof trainerOwned>>;
  try { trainer = await trainerOwned(context.admin, context.organisationId, trainerId); }
  catch { return NextResponse.json({ error: "Impossible de vérifier ce formateur." }, { status: 500 }); }
  if (!trainer) return NextResponse.json({ error: "Formateur introuvable." }, { status: 404 });

  const [{ data: sessionRows, error: sessionError }, { data: orders, error: orderError }, { data: documents, error: documentError }] = await Promise.all([
    context.admin.from("daily_sessions").select("id,internal_reference,start_date,end_date,status,trainer_ids,daily_formations(title)").eq("organisation_id", context.organisationId).neq("status", "archived").order("start_date", { ascending: false }),
    context.admin.from("daily_mission_orders").select("id,trainer_profile_id,order_type,start_date,end_date,status,missions,mission_details,created_at").eq("organisation_id", context.organisationId).eq("trainer_profile_id", trainerId).order("created_at", { ascending: false }),
    context.admin.from("daily_documents").select("id,document_type,logical_name,status,bucket,storage_path,mime_type,created_at,updated_at,metadata,is_current").eq("organisation_id", context.organisationId).eq("linked_object_type", "trainer_profile").eq("linked_object_id", trainerId).eq("is_current", true).in("document_type", ["trainer_cv", "trainer_contract"]).order("created_at", { ascending: false }),
  ]);
  const error = sessionError ?? orderError ?? documentError;
  if (error) return NextResponse.json({ error: "Impossible de charger le dossier formateur." }, { status: 500 });
  const sessions = (sessionRows ?? []).filter(s => Array.isArray(s.trainer_ids) && s.trainer_ids.map(String).includes(trainerId));
  const files = [] as Array<Record<string, unknown>>;
  for (const doc of documents ?? []) {
    let url: string | null = null;
    if (doc.bucket && doc.storage_path) {
      const signed = await context.admin.storage.from(doc.bucket).createSignedUrl(doc.storage_path, 900);
      if (signed.error) return NextResponse.json({ error: "Impossible de préparer le téléchargement du document." }, { status: 500 });
      url = signed.data?.signedUrl ?? null;
    }
    files.push({ ...doc, url });
  }
  return NextResponse.json({ trainer, sessions, orders: orders ?? [], documents: files });
}

export async function POST(req: Request) {
  const context = await managerContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const form = await req.formData().catch(() => null);
  const trainerId = clean(form?.get("trainer_id"));
  const file = form?.get("file");
  if (!trainerId) return NextResponse.json({ error: "Formateur requis." }, { status: 400 });
  if (!(file instanceof File) || file.type !== "application/pdf") return NextResponse.json({ error: "Importez le contrat en PDF." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_SIZE) return NextResponse.json({ error: "Le PDF doit peser moins de 10 Mo." }, { status: 400 });
  let trainer: Awaited<ReturnType<typeof trainerOwned>>;
  try { trainer = await trainerOwned(context.admin, context.organisationId, trainerId); }
  catch { return NextResponse.json({ error: "Impossible de vérifier ce formateur." }, { status: 500 }); }
  if (!trainer) return NextResponse.json({ error: "Formateur introuvable." }, { status: 404 });

  const baseQuery = () => context.admin.from("daily_documents")
    .select("id,version,is_current")
    .eq("organisation_id", context.organisationId)
    .eq("document_type", "trainer_contract")
    .eq("linked_object_type", "trainer_profile")
    .eq("linked_object_id", trainerId);
  const [latestResult, currentResult] = await Promise.all([
    baseQuery().order("version", { ascending: false }).limit(1),
    baseQuery().eq("is_current", true).order("version", { ascending: false }).limit(1),
  ]);
  if (latestResult.error || currentResult.error)
    return NextResponse.json({ error: "Impossible de vérifier les versions du contrat." }, { status: 500 });
  const latest = latestResult.data?.[0] ?? null;
  const current = currentResult.data?.[0] ?? null;
  const version = Number(latest?.version ?? 0) + 1;
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `daily/${context.organisationId}/trainer/${trainerId}/contracts/${Date.now()}-${safe(file.name)}`;
  const { error: uploadError } = await context.admin.storage.from("documents").upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: "Impossible de téléverser le contrat." }, { status: 500 });

  if (current) {
    const { error: supersedeError } = await context.admin.from("daily_documents")
      .update({ is_current: false, updated_by: context.user.id })
      .eq("id", current.id).eq("organisation_id", context.organisationId).eq("is_current", true);
    if (supersedeError) {
      await context.admin.storage.from("documents").remove([path]);
      return NextResponse.json({ error: "Impossible de remplacer le contrat actuel." }, { status: 500 });
    }
  }

  const { data: document, error } = await context.admin.from("daily_documents").insert({
    organisation_id: context.organisationId, document_type: "trainer_contract", linked_object_type: "trainer_profile", linked_object_id: trainerId,
    logical_name: "contrat-formateur", version, status: "active", bucket: "documents", storage_path: path, mime_type: file.type,
    size_bytes: file.size, sha256, created_by: context.user.id, updated_by: context.user.id, is_current: true,
    previous_document_id: current?.id ?? latest?.id ?? null,
    metadata: { source: "daily_manager_import", original_filename: file.name },
  }).select("id,version,status,created_at").single();
  if (error || !document) {
    await context.admin.storage.from("documents").remove([path]);
    if (current) {
      const { error: restoreError } = await context.admin.from("daily_documents")
        .update({ is_current: true, updated_by: context.user.id })
        .eq("id", current.id).eq("organisation_id", context.organisationId);
      if (restoreError) return NextResponse.json({ error: "Import échoué ; restauration du contrat précédent impossible. Intervention nécessaire." }, { status: 500 });
    }
    return NextResponse.json({ error: "Enregistrement du contrat impossible ; version précédente conservée." }, { status: 500 });
  }
  return NextResponse.json({ document });
}
