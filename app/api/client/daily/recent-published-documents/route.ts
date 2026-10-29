import { NextResponse } from "next/server";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

export async function GET() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const organisationId = context.workspace.membership.organisation_id;
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await context.supabase
    .from("daily_documents")
    .select("id,document_type,logical_name,published_at,status,session_id,formation_id,learner_id")
    .eq("organisation_id", organisationId)
    .eq("is_current", true)
    .not("published_at", "is", null)
    .gte("published_at", since.toISOString())
    .order("published_at", { ascending: false })
    .limit(5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ documents: data ?? [] });
}
