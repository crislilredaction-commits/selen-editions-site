import { NextResponse } from "next/server";
import { resolveLearnerOwnPositioning, learnerPositioningEvidence } from "@/lib/server/dailyLearnerOwnPositioning";
import { downloadPositioning, loadOriginalPositioning, OwnPositioningError } from "@/lib/server/dailyOwnPositioning";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token.trim()) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  try {
    const context = await resolveLearnerOwnPositioning(token.trim());
    const documentId = new URL(request.url).searchParams.get("id");
    const document = documentId ? await learnerPositioningEvidence(context, undefined, documentId) : await loadOriginalPositioning(context.admin, context.formation);
    if (!document) throw new OwnPositioningError("Document introuvable.", 404);
    return await downloadPositioning(context.admin, document);
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof OwnPositioningError ? cause.message : "Téléchargement indisponible." }, { status: cause instanceof OwnPositioningError ? cause.status : 500 });
  }
}
