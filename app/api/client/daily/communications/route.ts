import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";

export async function GET(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id")?.trim() || null;
  let query = context.admin
    .from("daily_communications")
    .select("id,session_id,enrolment_id,communication_type,recipient_email,recipient_name,subject,text_body,provider,provider_message_id,status,sent_at,delivered_at,failed_at,failure_reason,created_at,metadata")
    .eq("organisation_id", context.organisationId)
    .order("created_at", { ascending: false })
    .limit(250);

  if (sessionId) query = query.eq("session_id", sessionId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ communications: data ?? [] });
}
