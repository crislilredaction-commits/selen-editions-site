import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";
import { readDailyAssistedTrainerSession } from "@/lib/server/dailyAssistedTrainerWorkspace";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const types = ["trainer_resource", "attendance_paper_evidence", "learning_assessment_evidence"];

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["trainers", "sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.assisted || !context.assistance) return NextResponse.json({ error: "Assistance Studio active requise." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const trainerId = params.get("trainer_id") ?? "";
  const sessionId = params.get("session_id") ?? "";
  const documentId = params.get("id") ?? "";
  if (![trainerId, sessionId, documentId].every(id => uuid.test(id))) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  const session = await readDailyAssistedTrainerSession(context, trainerId, sessionId);
  if (!session || !session.documents.some((document: { id: string }) => document.id === documentId)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  const { data: document, error } = await context.admin.from("daily_documents").select("id,bucket,storage_path").eq("id", documentId).eq("organisation_id", context.organisationId).eq("session_id", sessionId).eq("is_current", true).neq("status", "archived").in("document_type", types).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!document) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  await logAgentAssistanceAction({ supabase: context.admin, req: request, assistance: context.assistance, action: "delegated_trainer_document_read", actionLabel: "Consultation d'un document formateur en délégation", metadata: { trainer_profile_id: trainerId, session_id: sessionId, document_id: documentId, read_only: true } });
  const { data: signed, error: signedError } = await context.admin.storage.from(document.bucket).createSignedUrl(document.storage_path, 120);
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: "Document indisponible." }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
