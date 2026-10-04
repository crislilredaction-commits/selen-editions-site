import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { completeDailySourceTicket, prepareDailySourceTicket, DailySourceUploadError } from "@/lib/server/dailyFormationSourceUpload";

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "trainings");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Demande d’import invalide." }, { status: 400 });
  try {
    const data = body.action === "prepare" ? await prepareDailySourceTicket(req, context, body)
      : body.action === "complete" ? await completeDailySourceTicket(req, context, body.authorization) : null;
    if (!data) throw new DailySourceUploadError("Demande d’import invalide.");
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof DailySourceUploadError ? cause.message : "Import indisponible. Réessayez la vérification." },
      { status: cause instanceof DailySourceUploadError ? cause.status : 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
