import { NextResponse } from "next/server";
import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const dossierId = String(body?.dossierId ?? "").trim();

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const supabase = getAdminSupabase();
    const access = await verifyClientNdaDossierAccess(supabase, dossierId);

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const { error } = await supabase
      .from("messages")
      .update({ read_by_client_at: new Date().toISOString() })
      .eq("dossier_id", dossierId)
      .eq("sender_type", "agent")
      .is("read_by_client_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
