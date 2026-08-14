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

  const communications = data ?? [];
  const ids = communications.map((row) => row.id);
  const documentsByCommunication = new Map<string, unknown[]>();

  if (ids.length > 0) {
    const { data: linkedDocuments, error: linkedError } = await context.admin
      .from("daily_communication_documents")
      .select("communication_id,document_id,document_type,logical_name,document_version,sha256,storage_path,created_at")
      .in("communication_id", ids);
    if (linkedError) return NextResponse.json({ error: linkedError.message }, { status: 500 });

    for (const linked of linkedDocuments ?? []) {
      const current = documentsByCommunication.get(linked.communication_id) ?? [];
      current.push(linked);
      documentsByCommunication.set(linked.communication_id, current);
    }
  }

  return NextResponse.json({
    communications: communications.map((row) => ({
      ...row,
      documents: documentsByCommunication.get(row.id) ?? [],
    })),
  });
}
