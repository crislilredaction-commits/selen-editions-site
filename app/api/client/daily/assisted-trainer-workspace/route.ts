import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";
import { listDailyAssistedTrainerSpaces, readDailyAssistedTrainerSession } from "@/lib/server/dailyAssistedTrainerWorkspace";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["trainers", "sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.assisted || !context.assistance) return NextResponse.json({ error: "Une assistance Studio active est requise." }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const trainerId = params.get("trainer_id"), sessionId = params.get("session_id");
  if ((trainerId || sessionId) && (!uuid.test(trainerId ?? "") || !uuid.test(sessionId ?? ""))) return NextResponse.json({ error: "Formateur et session valides requis." }, { status: 400 });
  try {
    if (!trainerId || !sessionId) return NextResponse.json({ spaces: await listDailyAssistedTrainerSpaces(context), readOnly: true });
    const data = await readDailyAssistedTrainerSession(context, trainerId, sessionId);
    if (!data) return NextResponse.json({ error: "Session non affectée à ce formateur dans l’organisme assisté." }, { status: 404 });
    await logAgentAssistanceAction({ supabase: context.admin, req, assistance: context.assistance,
      action: "delegated_trainer_workspace_read", actionLabel: "Consultation du suivi formateur en délégation",
      metadata: { trainer_profile_id: trainerId, session_id: sessionId, read_only: true } });
    return NextResponse.json(data);
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Espace formateur indisponible." }, { status: 500 }); }
}

export async function POST() {
  return NextResponse.json({ error: "La consultation déléguée est en lecture seule. Le titulaire réalise ses signatures depuis son propre accès." }, { status: 403 });
}
