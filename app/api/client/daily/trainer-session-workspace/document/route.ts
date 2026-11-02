import { NextResponse } from "next/server";
import { getAssignedDailyTrainerSession, getDailyTrainerWorkspaceContext } from "@/lib/server/dailyTrainerWorkspaceContext";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = ["trainer_resource", "attendance_paper_evidence", "learning_assessment_evidence"];
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const privateJson = (error: string, status: number) => NextResponse.json({ error }, { status, headers: PRIVATE_HEADERS });

export async function GET(request: Request) {
  const context = await getDailyTrainerWorkspaceContext();
  if (!context.ok) return privateJson(context.error, context.status);
  const params = new URL(request.url).searchParams;
  const sessionId = params.get("session_id") ?? "";
  const documentId = params.get("id") ?? "";
  if (!UUID.test(sessionId) || !UUID.test(documentId)) return privateJson("Paramètres invalides.", 400);

  let session: Awaited<ReturnType<typeof getAssignedDailyTrainerSession>>;
  try { session = await getAssignedDailyTrainerSession(context, sessionId); }
  catch { return privateJson("Impossible de vérifier l’affectation de cette session.", 503); }
  if (!session) return privateJson("Document introuvable.", 404);

  let document: { bucket: string | null; storage_path: string | null } | null;
  try {
    const result = await context.admin.from("daily_documents")
      .select("id,bucket,storage_path")
      .eq("id", documentId).eq("organisation_id", context.orgId).eq("session_id", sessionId)
      .eq("is_current", true).neq("status", "archived").in("document_type", TYPES).maybeSingle();
    if (result.error) return privateJson("Téléchargement temporairement indisponible.", 503);
    document = result.data;
  } catch { return privateJson("Téléchargement temporairement indisponible.", 503); }
  // Only private documents belonging to the authenticated organisation can be signed.
  if (!document || document.bucket !== "documents" || !document.storage_path?.startsWith(`daily/${context.orgId}/`))
    return privateJson("Document introuvable.", 404);

  try {
    const { data, error } = await context.admin.storage.from("documents").createSignedUrl(document.storage_path, 120);
    if (error || !data?.signedUrl) return privateJson("Téléchargement temporairement indisponible.", 503);
    return NextResponse.redirect(data.signedUrl, { headers: PRIVATE_HEADERS });
  } catch { return privateJson("Téléchargement temporairement indisponible.", 503); }
}
