import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { DAILY_FORMATION_SOURCE_KINDS, DAILY_SOURCE_MAX_BYTES, dailyFormationSourceMime, type DailyFormationSourceKind } from "@/lib/daily/formationSourceUpload";
import { positioningSourceDocumentId } from "@/lib/daily/ownPositioning";

type Context = Extract<Awaited<ReturnType<typeof getDailyOrganisationContext>>, { ok: true }>;
type Source = { id: string; kind: DailyFormationSourceKind; name: string; mime_type: string; size_bytes: number; sha256: string; storage_path: string; previous_document_id: string | null; slot: string; source_formation_id: string | null; expected_source_reference: string | null };
type Ticket = Source & { organisation_id: string; actor: string; assistance_id: string | null; expires_at: number };
export class DailySourceUploadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = /^[a-f0-9]{64}$/i;
const domain = "selen-daily-client-source-v1\0";
function mac(value: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new DailySourceUploadError("Import indisponible.", 503);
  return createHmac("sha256", key).update(domain + value).digest();
}
function encode(ticket: Ticket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return payload + "." + mac(payload).toString("base64url");
}
function decode(value: unknown): Ticket {
  if (typeof value !== "string" || value.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value)) throw new DailySourceUploadError("Autorisation d’import invalide.");
  const [payload, signature] = value.split(".");
  const provided = Buffer.from(signature, "base64url"), expected = mac(payload);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new DailySourceUploadError("Autorisation d’import invalide.");
  let ticket: Ticket;
  try { ticket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch { throw new DailySourceUploadError("Autorisation d’import invalide."); }
  if (!ticket || !Number.isFinite(ticket.expires_at) || ticket.expires_at < Date.now()) throw new DailySourceUploadError("L’autorisation d’import a expiré. Choisissez à nouveau le fichier.", 409);
  return ticket;
}
function assertContext(ticket: Ticket, context: Context) {
  if (ticket.organisation_id !== context.organisationId || ticket.actor !== context.user.id || ticket.assistance_id !== (context.assistance?.id ?? null)) {
    throw new DailySourceUploadError("L’accès à cet import a changé. Rechargez le formulaire.", 403);
  }
}
async function freshContext(req: Request, ticket: Ticket) {
  const context = await getDailyOrganisationContext(req, "trainings");
  if (!context.ok) throw new DailySourceUploadError(context.error, context.status);
  assertContext(ticket, context); return context;
}
function sourcePayload(source: Source) {
  return { id: source.id, kind: source.kind, name: source.name, mime_type: source.mime_type, size_bytes: source.size_bytes,
    sha256: source.sha256, storage_path: source.storage_path, previous_document_id: source.previous_document_id, slot: source.slot,
    source_formation_id: source.source_formation_id ?? null, expected_source_reference: source.expected_source_reference ?? null };
}
async function register(context: Context, source: Source) {
  const { data, error } = await context.admin.rpc("daily_register_client_formation_source", {
    p_organisation_id: context.organisationId, p_actor: context.user.id, p_source: sourcePayload(source),
  });
  const document = Array.isArray(data) ? data.length === 1 ? data[0] : null : data;
  if (error || document?.id !== source.id) throw new DailySourceUploadError("Le document n’a pas pu être confirmé. Réessayez la vérification.", 409);
  return { id: document.id as string, url: `/api/client/daily/uploads?id=${document.id}`, name: source.name };
}
async function previousSource(context: Context, kind: DailyFormationSourceKind, reference: unknown, slot: string, formationId: string | null, canonicalReference: string | null) {
  if (reference === undefined || reference === null || reference === "") return null;
  const id = positioningSourceDocumentId(reference);
  if (!id) throw new DailySourceUploadError("Document original invalide.");
  const { data, error } = await context.admin.from("daily_documents").select("id,is_current,status,signed_at,archived_at,formation_id,bucket,storage_path,metadata,created_by")
    .eq("id", id).eq("organisation_id", context.organisationId).eq("document_type", kind)
    .eq("linked_object_type", "organisation").eq("linked_object_id", context.organisationId).maybeSingle();
  if (error || !data || !data.is_current || data.archived_at || data.status === "archived" || (data.formation_id && data.formation_id !== formationId) || data.bucket !== "documents"
    || !data.storage_path.startsWith(`daily/${context.organisationId}/`)) throw new DailySourceUploadError("Le document original a changé. Rechargez la formation.", 409);
  if (formationId && reference === canonicalReference) return id;
  if (data.metadata?.source !== "daily_client" || data.metadata?.slot !== slot || data.created_by !== context.user.id || data.status === "signed" || data.signed_at) throw new DailySourceUploadError("Cet original ne correspond pas au formulaire ouvert. Rechargez la formation.", 409);
  const linked = await context.admin.from("daily_formations").select("id").eq("organisation_id", context.organisationId).neq("status", "archived")
    .or(`detailed_program_document_url.eq.${reference},positioning_questionnaire_document_url.eq.${reference},learning_assessment_document_url.eq.${reference}`).limit(1).maybeSingle();
  if (linked.error || linked.data) throw new DailySourceUploadError("Cet original est déjà utilisé par une formation. Rechargez le catalogue.", 409);
  return id;
}

async function formationReference(context: Context, kind: DailyFormationSourceKind, value: unknown) {
  if (value === undefined || value === null || value === "") return { source_formation_id: null, expected_source_reference: null };
  if (typeof value !== "string" || !uuid.test(value)) throw new DailySourceUploadError("Formation invalide.");
  const { data, error } = await context.admin.from("daily_formations").select("id,detailed_program_document_url,positioning_questionnaire_document_url,learning_assessment_document_url")
    .eq("id", value).eq("organisation_id", context.organisationId).neq("status", "archived").maybeSingle();
  if (error || !data) throw new DailySourceUploadError("La formation n’est plus disponible. Rechargez le catalogue.", 409);
  const field = kind === "training_program_source" ? "detailed_program_document_url" : kind === "positioning_questionnaire_source" ? "positioning_questionnaire_document_url" : "learning_assessment_document_url";
  return { source_formation_id: value, expected_source_reference: data[field] as string | null };
}

export async function prepareDailySourceTicket(req: Request, context: Context, body: Record<string, unknown>) {
  const { kind, name, mime_type: mime, size_bytes: size, sha256, slot } = body;
  if (!(DAILY_FORMATION_SOURCE_KINDS as readonly unknown[]).includes(kind) || typeof name !== "string" || !name.trim() || name.length > 255
    || /[\u0000-\u001f]/.test(name) || typeof mime !== "string" || !dailyFormationSourceMime(name, mime)
    || !Number.isSafeInteger(size) || Number(size) < 1 || Number(size) > DAILY_SOURCE_MAX_BYTES || typeof sha256 !== "string" || !hash.test(sha256)
    || typeof slot !== "string" || !uuid.test(slot)) throw new DailySourceUploadError("Choisissez un fichier PDF, DOC ou DOCX de 10 Mo maximum.");
  const id = randomUUID(), typedKind = kind as DailyFormationSourceKind;
  const binding = await formationReference(context, typedKind, body.formation_id);
  const ticket: Ticket = { id, organisation_id: context.organisationId, actor: context.user.id, assistance_id: context.assistance?.id ?? null,
    kind: typedKind, name, mime_type: dailyFormationSourceMime(name, mime)!, size_bytes: Number(size), sha256: sha256.toLowerCase(), slot,
    ...binding, previous_document_id: await previousSource(context, typedKind, body.previous_document_url, slot, binding.source_formation_id, binding.expected_source_reference),
    storage_path: `daily/${context.organisationId}/catalogue-sources/${kind}/${id}`, expires_at: Date.now() + 30 * 60 * 1000 };
  const authorization = encode(ticket);
  const { data, error } = await context.admin.storage.from("documents").createSignedUploadUrl(ticket.storage_path, { upsert: false });
  if (error || !data?.token) throw new DailySourceUploadError("Import indisponible.", 503);
  await freshContext(req, ticket);
  return { authorization, path: ticket.storage_path, token: data.token };
}

export async function completeDailySourceTicket(req: Request, context: Context, authorization: unknown) {
  const ticket = decode(authorization); assertContext(ticket, context);
  const bucket = context.admin.storage.from("documents");
  // Check object metadata before downloading: an upload token may otherwise
  // send more bytes than the declared size. Then verify the actual full file.
  const info = await bucket.info(ticket.storage_path);
  if (info.error || info.data?.size !== ticket.size_bytes || info.data?.contentType !== ticket.mime_type) throw new DailySourceUploadError("Le transfert n’est pas complet ou le format du fichier a changé. Réessayez la vérification.", 409);
  const file = await bucket.download(ticket.storage_path);
  if (file.error || !file.data || file.data.size !== ticket.size_bytes || file.data.type !== ticket.mime_type) throw new DailySourceUploadError("Le transfert n’a pas pu être vérifié. Réessayez la vérification.", 409);
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  if (bytes.length !== ticket.size_bytes || createHash("sha256").update(bytes).digest("hex") !== ticket.sha256) throw new DailySourceUploadError("Le fichier transféré ne correspond pas au fichier choisi.", 409);
  const current = await freshContext(req, ticket);
  return register(current, ticket);
}

// Compatibility with an older open Daily page. Source originals use the same
// atomic registration and never retire/delete an original during an upload.
export async function uploadLegacyDailySource(req: Request, context: Context, file: File, kind: DailyFormationSourceKind, slot: string) {
  const mime = dailyFormationSourceMime(file.name, file.type);
  if (!mime || file.size < 1 || file.size > DAILY_SOURCE_MAX_BYTES) throw new DailySourceUploadError("Choisissez un fichier PDF, DOC ou DOCX de 10 Mo maximum.");
  const previous = await context.admin.from("daily_documents").select("id,metadata,created_by,status,signed_at").eq("organisation_id", context.organisationId).eq("document_type", kind)
    .eq("linked_object_type", "organisation").eq("linked_object_id", context.organisationId)
    .or(`logical_name.eq.${kind}-${slot},metadata->>slot.eq.${slot}`).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previous.error) throw new DailySourceUploadError("Lecture du document original indisponible.", 503);
  let previousId: string | null = null;
  if (previous.data?.metadata?.source === "daily_client" && previous.data.metadata.slot === slot && previous.data.created_by === context.user.id && previous.data.status !== "signed" && !previous.data.signed_at) {
    const reference = `/api/client/daily/uploads?id=${previous.data.id}`;
    const linked = await context.admin.from("daily_formations").select("id").eq("organisation_id", context.organisationId).neq("status", "archived")
      .or(`detailed_program_document_url.eq.${reference},positioning_questionnaire_document_url.eq.${reference},learning_assessment_document_url.eq.${reference}`).limit(1).maybeSingle();
    if (linked.error) throw new DailySourceUploadError("Lecture du document original indisponible.", 503);
    if (!linked.data) previousId = await previousSource(context, kind, reference, slot, null, null);
  }
  const id = randomUUID(), bytes = new Uint8Array(await file.arrayBuffer());
  const source: Source = { id, kind, name: file.name, mime_type: mime, size_bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), slot,
    previous_document_id: previousId, source_formation_id: null, expected_source_reference: null, storage_path: `daily/${context.organisationId}/catalogue-sources/${kind}/${id}` };
  const identity = { ...source, organisation_id: context.organisationId, actor: context.user.id, assistance_id: context.assistance?.id ?? null, expires_at: Date.now() };
  const uploaded = await context.admin.storage.from("documents").upload(source.storage_path, bytes, { contentType: mime, cacheControl: "0", upsert: false });
  if (uploaded.error) throw new DailySourceUploadError("Import indisponible.", 503);
  return register(await freshContext(req, identity), source);
}
