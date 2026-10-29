import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import { loadDailySessionFollowupSnapshot } from "@/lib/server/dailySessionFollowupSummary";

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.assisted && !context.capabilities?.sessions) return NextResponse.json({ summary: null });

  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim();
  if (!sessionId) return NextResponse.json({ error: "Session requise." }, { status: 400 });

  try {
    const snapshot = await loadDailySessionFollowupSnapshot(context.admin, context.organisationId, sessionId);
    return NextResponse.json({ summary: snapshot.summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Récapitulatif indisponible.";
    return NextResponse.json({ error: message }, { status: message === "Session introuvable." ? 404 : 500 });
  }
}
