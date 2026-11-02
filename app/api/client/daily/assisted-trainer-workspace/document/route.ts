import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";
import { readDailyAssistedTrainerSession } from "@/lib/server/dailyAssistedTrainerWorkspace";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const types = ["trainer_resource", "attendance_paper_evidence", "learning_assessment_evidence"];
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const privateJson = (error: string, status: number) => NextResponse.json({ error }, { status, headers: PRIVATE_HEADERS });

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["trainers", "sessions"]);
  if (!context.ok) return privateJson(context.error, context.status);
  if (!context.assisted || !context.assistance) return privateJson("Assistance Studio active requise.", 403);
  const params = new URL(request.url).searchParams;
  const trainerId = params.get("trainer_id") ?? "";
  const sessionId = params.get("session_id") ?? "";
  const documentId = params.get("id") ?? "";
  if (![trainerId, sessionId, documentId].every(id => uuid.test(id))) return privateJson("Paramètres invalides.", 400);

  let session: Awaited<ReturnType<typeof readDailyAssistedTrainerSession>>;
  try { session = await readDailyAssistedTrainerSession(context, trainerId, sessionId); }
  catch { return privateJson("Vérification de l'affectation temporairement indisponible.", 503); }
  if (!session || !session.documents.some((document: { id: string }) => document.id === documentId))
    return privateJson("Document introuvable.", 404);

  let document: { bucket: string | null; storage_path: string | null } | null;
  try {
    const result = await context.admin.from("daily_documents").select("id,bucket,storage_path")
      .eq("id", documentId).eq("organisation_id", context.organisationId).eq("session_id", sessionId)
      .eq("is_current", true).neq("status", "archived").in("document_type", types).maybeSingle();
    if (result.error) return privateJson("Téléchargement temporairement indisponible.", 503);
    document = result.data;
  } catch { return privateJson("Téléchargement temporairement indisponible.", 503); }
  if (!document || document.bucket !== "documents" || !document.storage_path?.startsWith(`daily/${context.organisationId}/`))
    return privateJson("Document introuvable.", 404);

  try {
    await logAgentAssistanceAction({
      supabase: context.admin, req: request, assistance: context.assistance,
      action: "delegated_trainer_document_read", actionLabel: "Consultation d'un document formateur en délégation",
      metadata: { trainer_profile_id: trainerId, session_id: sessionId, document_id: documentId, read_only: true },
    });
    const { data, error } = await context.admin.storage.from("documents").createSignedUrl(document.storage_path, 120);
    if (error || !data?.signedUrl) return privateJson("Téléchargement temporairement indisponible.", 503);
    return NextResponse.redirect(data.signedUrl, { headers: PRIVATE_HEADERS });
  } catch { return privateJson("Téléchargement temporairement indisponible.", 503); }
}
