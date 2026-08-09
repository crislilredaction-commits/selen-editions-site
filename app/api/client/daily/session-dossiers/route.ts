import { NextResponse } from "next/server";
import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["sessions", "trainings"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const [{ data: sessions, error: sessionError }, { data: dossiers, error: dossierError }, { data: checklist, error: checklistError }] = await Promise.all([
    context.admin.from("daily_sessions").select("id,formation_id,internal_reference,start_date,end_date,status").eq("organisation_id", context.organisationId).neq("status", "archived").order("start_date"),
    context.admin.from("daily_session_dossiers").select("session_id,status,completed_at,updated_at").eq("organisation_id", context.organisationId),
    context.admin.from("daily_session_checklist_items").select("id,session_id,item_key,phase,responsibility,label,description,status,due_at,note,position").eq("organisation_id", context.organisationId).neq("responsibility", "selen").order("position"),
  ]);
  if (sessionError || dossierError || checklistError) return NextResponse.json({ error: sessionError?.message || dossierError?.message || checklistError?.message }, { status: 500 });
  const formationIds = [...new Set((sessions ?? []).map((s) => s.formation_id).filter(Boolean))];
  const { data: formations } = formationIds.length ? await context.admin.from("daily_formations").select("id,title").in("id", formationIds) : { data: [] };
  return NextResponse.json({ sessions: sessions ?? [], dossiers: dossiers ?? [], checklist: checklist ?? [], formations: formations ?? [] });
}

export async function PATCH(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationReadContext(req, ["sessions", "trainings"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const itemId = String(body.item_id ?? "");
  const status = String(body.status ?? "");
  const note = String(body.note ?? "").trim();
  const allowed = new Set(["todo", "in_progress", "to_review", "validated", "blocked", "not_applicable"]);
  if (!itemId || !allowed.has(status)) return NextResponse.json({ error: "Mise à jour invalide." }, { status: 400 });
  const { data: item } = await context.admin.from("daily_session_checklist_items").select("id,responsibility").eq("id", itemId).eq("organisation_id", context.organisationId).maybeSingle();
  if (!item || !["client", "shared"].includes(item.responsibility)) return NextResponse.json({ error: "Ce point n’est pas modifiable depuis l’espace client." }, { status: 403 });
  const { data, error } = await context.admin.from("daily_session_checklist_items").update({ status, note: note || null }).eq("id", itemId).eq("organisation_id", context.organisationId).select("id,status,note").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
