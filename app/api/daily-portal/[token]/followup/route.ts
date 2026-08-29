import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };
const ENTRY_TYPES = new Set(["incident", "adaptation"]);
const LEVELS = new Set(["info", "attention", "critical"]);
const STATUSES = new Set(["open", "resolved"]);
const text = (value: unknown) => String(value ?? "").trim();

async function trainerAccess(token: string) {
  const admin = getAdminSupabase();
  const { data: access, error } = await admin.from("daily_portal_access_tokens").select("id,portal_type,session_id,status,expires_at").eq("token", token).maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!access || access.portal_type !== "trainer") return { ok: false as const, status: 403, error: "Accès formateur requis." };
  if (access.expires_at && new Date(access.expires_at).getTime() < Date.now()) return { ok: false as const, status: 410, error: "Ce lien a expiré." };
  if (["revoked", "expired"].includes(String(access.status ?? ""))) return { ok: false as const, status: 403, error: "Cet accès n’est plus actif." };
  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,organisation_id").eq("id", access.session_id).neq("status", "archived").maybeSingle();
  if (sessionError) return { ok: false as const, status: 500, error: sessionError.message };
  if (!session) return { ok: false as const, status: 404, error: "Session introuvable." };
  return { ok: true as const, admin, access, session };
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params; const auth = await trainerAccess(text(token));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin.from("daily_session_followup_entries").select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at").eq("session_id", auth.access.session_id).order("occurred_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params; const auth = await trainerAccess(text(token));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const entryType = text(body.entry_type), level = text(body.level), summary = text(body.summary);
  if (!ENTRY_TYPES.has(entryType) || !LEVELS.has(level) || !summary) return NextResponse.json({ error: "Type, niveau et constat sont requis." }, { status: 400 });
  const { data, error } = await auth.admin.from("daily_session_followup_entries").insert({ organisation_id: auth.session.organisation_id, session_id: auth.access.session_id, enrolment_id: text(body.enrolment_id) || null, entry_type: entryType, level, summary, description: text(body.description) || null, action_taken: text(body.action_taken) || null, status: "open" }).select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data }, { status: 201 });
}

export async function PATCH(request: Request, { params }: Params) {
  const { token } = await params; const auth = await trainerAccess(text(token));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>; const id = text(body.id), status = text(body.status);
  if (!id || !STATUSES.has(status)) return NextResponse.json({ error: "Suivi ou statut invalide." }, { status: 400 });
  const { data, error } = await auth.admin.from("daily_session_followup_entries").update({ action_taken: text(body.action_taken) || null, status, resolved_at: status === "resolved" ? new Date().toISOString() : null }).eq("id", id).eq("session_id", auth.access.session_id).select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}
