import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function cancellationError(error: { code?: string | null; message?: string | null }) {
  if (error.code === "22023" || error.message === "daily_cancel_invalid_input")
    return { status: 400, message: "Inscription, motif et date de désinscription sont requis." };
  if (error.code === "P0002" || error.message === "daily_cancel_enrolment_not_found")
    return { status: 404, message: "Inscription introuvable." };
  if (error.message === "daily_cancel_session_started")
    return { status: 409, message: "La session a commencé : utilisez la procédure d’abandon avec conservation des preuves." };
  if (error.code === "23514" || error.message === "daily_cancel_enrolment_already_closed")
    return { status: 409, message: "Cette inscription est déjà clôturée." };
  return { status: 500, message: "Désinscription impossible. Aucun changement partiel n’a été conservé." };
}

/** Désinscription individuelle atomique avant formation, sans effacer l'historique. */
export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions", { allowAssistanceWrite: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await req.json().catch(() => null);
  const enrolmentId = text(body?.enrolment_id);
  const reason = text(body?.reason);
  const occurredAt = text(body?.occurred_at);
  const date = new Date(occurredAt);
  if (!enrolmentId || !reason || !occurredAt || !Number.isFinite(date.getTime()))
    return NextResponse.json({ error: "Inscription, motif et date de désinscription sont requis." }, { status: 400 });

  const { data, error } = await context.admin.rpc("daily_cancel_enrolment", {
    p_organisation_id: context.organisationId,
    p_enrolment_id: enrolmentId,
    p_reason: reason,
    p_occurred_at: date.toISOString(),
    p_actor_user_id: context.user.id,
    p_author_name: "Organisme de formation",
  });

  if (error) {
    const mapped = cancellationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  const result = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return NextResponse.json({ ok: true, ...result });
}
