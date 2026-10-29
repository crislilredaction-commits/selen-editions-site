import { NextResponse } from "next/server";

import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const authSupabase = await createServerSupabaseClient();
  const { data, error } = await authSupabase.auth.getUser();
  const email = data.user?.email?.trim().toLowerCase();

  if (error || !email) {
    return NextResponse.json(
      { error: "Connexion client requise." },
      { status: 401 },
    );
  }

  const supabase = getAdminSupabase();
  const { data: tickets, error: ticketsError } = await supabase
    .from("support_tickets")
    .select("id, subject, category, status, priority, last_message_at, created_at")
    .eq("client_email", email)
    .order("last_message_at", { ascending: false })
    .limit(5);

  if (ticketsError) {
    return NextResponse.json(
      { error: ticketsError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ tickets: tickets ?? [] });
}
