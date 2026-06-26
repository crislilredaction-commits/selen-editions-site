import { NextResponse } from "next/server";

import { createSupportTicket } from "@/lib/server/supportTickets";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | {
        email?: unknown;
        context?: unknown;
        pageUrl?: unknown;
        message?: unknown;
      }
    | null;

  const message = cleanText(payload?.message);
  const context = cleanText(payload?.context) || "l'espace client Selen";
  const pageUrl = cleanText(payload?.pageUrl);
  const providedEmail = cleanText(payload?.email).toLowerCase();

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const accountEmail = data.user?.email?.trim().toLowerCase() ?? "";
  const clientName =
    cleanText(data.user?.user_metadata?.full_name) ||
    cleanText(data.user?.user_metadata?.name);

  const result = await createSupportTicket({
    clientName,
    clientEmail: accountEmail || providedEmail,
    subject: `Message client Selen - ${context}`,
    category: "question",
    message,
    pageUrl,
    metadata: {
      source: "client_support_message",
      page_url: pageUrl || null,
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    ticketId: result.ticketId,
    acknowledgementSent: result.acknowledgementSent,
  });
}
