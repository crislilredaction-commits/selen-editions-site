import { NextResponse } from "next/server";
import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";
import { createAgentNotification } from "@/lib/server/notifications";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const dossierId = String(body?.dossierId ?? "").trim();
    const content = String(body?.content ?? "").trim();

    if (!dossierId || !content) {
      return NextResponse.json(
        { error: "dossierId ou contenu manquant." },
        { status: 400 },
      );
    }

    const supabase = getAdminSupabase();
    const access = await verifyClientNdaDossierAccess(supabase, dossierId, req);

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    if (access.mode === "agent_assistance") {
      return NextResponse.json(
        {
          error:
            "L’envoi d’un message au nom du client est réservé au client connecté.",
        },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        dossier_id: dossierId,
        sender_type: "client",
        content,
        read_by_agent_at: null,
      })
      .select("id, content, sender_type, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await createAgentNotification({
      supabase,
      dossierId,
      type: "client_message",
      title: "Nouveau message client",
      content: "Le client a envoye un message depuis son dossier NDA.",
    });

    return NextResponse.json({ success: true, item: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
