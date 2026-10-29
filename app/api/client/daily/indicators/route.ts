import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import { loadDailyTrainingIndicators } from "@/lib/server/dailyTrainingIndicators";

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.assisted && !context.capabilities?.sessions) return NextResponse.json({ indicators: null });

  try {
    const indicators = await loadDailyTrainingIndicators(context.admin, context.organisationId);
    return NextResponse.json({ indicators }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indicateurs indisponibles.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
