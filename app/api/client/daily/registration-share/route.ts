import { NextResponse } from "next/server";
import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const STATUSES = new Set(["to_attach", "attached"]);

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["trainings", "sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const { data, error } = await context.admin
    .from("daily_formations")
    .select("id,title,version,status,public_registration_token,public_registration_enabled,spontaneous_registration_task_status,updated_at")
    .eq("organisation_id", context.organisationId)
    .eq("status", "validated")
    .eq("public_registration_enabled", true)
    .not("public_registration_token", "is", null)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ formations: data ?? [] });
}

export async function PATCH(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(req, "trainings");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  const status = String(body.status ?? "").trim();
  if (!id || !STATUSES.has(status)) return NextResponse.json({ error: "Mise à jour invalide." }, { status: 400 });

  const { data, error } = await context.admin
    .from("daily_formations")
    .update({ spontaneous_registration_task_status: status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .eq("status", "validated")
    .select("id,spontaneous_registration_task_status")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });

  return NextResponse.json({ formation: data });
}
