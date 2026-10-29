import { NextResponse } from "next/server";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

function text(body: Record<string, unknown>, key: string) { return String(body[key] ?? "").trim(); }

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["trainings", "sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const { data, error } = await context.admin
    .from("daily_watch_submissions")
    .select("id,watch_type,title,source_url,summary,analysis_and_improvement,share_requested,status,studio_review_note,reviewed_at,published_watch_entry_id,created_at,updated_at")
    .eq("organisation_id", context.organisationId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submissions: data ?? [] });
}

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "trainings");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const watchType = text(body, "watch_type");
  const title = text(body, "title");
  const sourceUrl = text(body, "source_url") || null;
  const summary = text(body, "summary") || null;
  const analysis = text(body, "analysis_and_improvement") || null;
  const shareRequested = Boolean(body.share_requested);
  if (!["regulatory", "pedagogy", "technology"].includes(watchType)) return NextResponse.json({ error: "Type de veille invalide." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Le titre est requis." }, { status: 400 });
  if (sourceUrl) {
    try { const u = new URL(sourceUrl); if (!["http:", "https:"].includes(u.protocol)) throw new Error(); }
    catch { return NextResponse.json({ error: "Le lien source doit être une URL http ou https valide." }, { status: 400 }); }
  }
  const now = new Date().toISOString();
  const { data, error } = await context.admin.from("daily_watch_submissions").insert({
    organisation_id: context.organisationId,
    watch_type: watchType,
    title,
    source_url: sourceUrl,
    summary,
    analysis_and_improvement: analysis,
    share_requested: shareRequested,
    status: shareRequested ? "pending" : "private",
    created_by: context.user.id,
    updated_at: now,
  }).select("id,watch_type,title,source_url,summary,analysis_and_improvement,share_requested,status,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submission: data }, { status: 201 });
}
