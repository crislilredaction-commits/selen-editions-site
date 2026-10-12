import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

export async function POST(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["sessions", "trainings"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await req.json().catch(() => ({}));
  const actionId = typeof body.action_id === "string" ? body.action_id.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : null;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : null;
  if (!actionId || actionId.length > 500) return NextResponse.json({ error: "Tâche invalide." }, { status: 400 });

  const { error } = await context.admin.from("daily_action_dismissals").upsert({
    organisation_id: context.organisationId,
    action_id: actionId,
    action_title: title,
    reason,
    completed_by: context.user.id,
    completed_at: new Date().toISOString(),
  }, { onConflict: "organisation_id,action_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
