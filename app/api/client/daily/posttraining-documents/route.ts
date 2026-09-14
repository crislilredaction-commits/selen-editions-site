import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import {
  generatePosttrainingDocuments,
  POSTTRAINING_DOCUMENT_TYPES,
  PosttrainingDocumentError,
} from "@/lib/server/dailyPosttrainingDocuments";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions", { allowAssistanceRead: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const sessionId = new URL(req.url).searchParams.get("session_id") ?? "";
  let query = context.admin
    .from("daily_documents")
    .select("*")
    .eq("organisation_id", context.organisationId)
    .in("document_type", [...POSTTRAINING_DOCUMENT_TYPES])
    .eq("is_current", true)
    .order("created_at", { ascending: false });
  if (sessionId) query = query.contains("metadata", { session_id: sessionId });
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) {
    return NextResponse.json({ error: "L’assistance agent est en lecture seule." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = text(body.session_id);
  if (!sessionId) return NextResponse.json({ error: "Session manquante." }, { status: 400 });

  try {
    const result = await generatePosttrainingDocuments({
      admin: context.admin,
      organisationId: context.organisationId,
      userId: context.user.id,
      sessionId,
      mode: "manual",
    });
    return NextResponse.json({
      documents: result.documents,
      count: result.count,
      eligibleCertificates: result.eligibleCertificates,
    });
  } catch (cause) {
    const status = cause instanceof PosttrainingDocumentError ? cause.status : 400;
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Génération impossible." },
      { status },
    );
  }
}
