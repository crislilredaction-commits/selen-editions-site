import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

function clean(value: unknown, max = 6000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function getManagerContext() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return context;
  const roles = context.workspace.membership.roles ?? [];
  if (!roles.includes("manager")) {
    return { ok: false as const, status: 403, error: "Cette action est réservée au dirigeant ou responsable de l’organisme." };
  }
  return { ...context, organisationId: context.workspace.membership.organisation_id };
}

export async function PATCH(req: Request) {
  const context = await getManagerContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = clean(body.id, 100);
  const response = clean(body.response, 6000);
  if (!id || !response) {
    return NextResponse.json({ error: "La référence et la réponse sont obligatoires." }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: current, error: readError } = await admin
    .from("daily_stakeholder_feedback")
    .select("id,status,organisation_id")
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Demande introuvable pour votre organisme." }, { status: 404 });
  if (current.status !== "forwarded_to_organisation") {
    return NextResponse.json({ error: "Cette demande n’est pas disponible pour une nouvelle réponse." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("daily_stakeholder_feedback")
    .update({ organisation_response: response, updated_at: now })
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .eq("status", "forwarded_to_organisation")
    .select("id,status,organisation_response,updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, feedback: data });
}
