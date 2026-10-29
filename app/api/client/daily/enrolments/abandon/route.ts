import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { confirmDailyEnrolmentAbandonment } from "@/lib/server/dailyConfirmedAbandonment";

const text = (value: unknown) => String(value ?? "").trim();

export async function POST(request: Request) {
  const context = await getDailyOrganisationContext(request, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = text(body.session_id), enrolmentId = text(body.enrolment_id), reason = text(body.reason), occurredAt = text(body.occurred_at);
  if (!sessionId || !enrolmentId || !reason || !occurredAt) return NextResponse.json({ error: "Inscription, date d’abandon et motif sont requis." }, { status: 400 });
  try {
    const result = await confirmDailyEnrolmentAbandonment(context.admin, {
      organisationId: context.organisationId,
      sessionId,
      enrolmentId,
      reason,
      occurredAt,
      authorName: "Organisme de formation",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirmation de l’abandon impossible.";
    const status = message.includes("introuvable") ? 404 : message.includes("déjà inactive") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
