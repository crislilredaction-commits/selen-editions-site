import { NextResponse } from "next/server";
import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

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
  if (!id || status !== "attached") return NextResponse.json({ error: "Mise à jour invalide." }, { status: 400 });

  // One-way completion: retries keep the first confirmation timestamp and
  // cannot reopen a task that has already disappeared from the action center.
  const { data, error } = await context.admin
    .from("daily_formations")
    .update({ spontaneous_registration_task_status: "attached", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .eq("status", "validated")
    .eq("public_registration_enabled", true)
    .not("public_registration_token", "is", null)
    .in("spontaneous_registration_task_status", ["to_attach", "none"])
    .select("id,spontaneous_registration_task_status")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data) return NextResponse.json({ formation: data });

  const existing = await context.admin
    .from("daily_formations")
    .select("id,spontaneous_registration_task_status")
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .eq("status", "validated")
    .eq("public_registration_enabled", true)
    .not("public_registration_token", "is", null)
    .eq("spontaneous_registration_task_status", "attached")
    .maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (existing.data) return NextResponse.json({ formation: existing.data });
  return NextResponse.json({ error: "Lien indisponible ou état modifié. Actualisez la page." }, { status: 409 });
}
