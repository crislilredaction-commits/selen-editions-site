import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getAssistedClientUser, logAgentAssistanceAction } from "@/lib/server/agentAssistance";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

async function requireClient() {
  const authSupabase = await createServerSupabaseClient();
  const { data, error } = await authSupabase.auth.getUser();
  const user = data.user;
  if (error || !user?.id) {
    return { ok: false as const, error: "Connexion client requise.", status: 401 };
  }
  return { ok: true as const, user };
}

export async function GET(req: Request) {
  const supabase = getAdminSupabase();
  const assisted = await getAssistedClientUser(supabase, req);
  const auth = assisted ? { ok: true as const, user: assisted.user } : await requireClient();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Convention introuvable." }, { status: 400 });

  const { data: convention, error } = await supabase
    .from("daily_conventions")
    .select("id,document_name,storage_path,user_id")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!convention?.storage_path) {
    return NextResponse.json({ error: "Fichier convention introuvable." }, { status: 404 });
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("documents")
    .createSignedUrl(convention.storage_path, 60 * 5, {
      download: convention.document_name ?? true,
    });

  if (signedUrlError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: signedUrlError?.message ?? "Impossible de generer le lien de telechargement." },
      { status: 500 },
    );
  }

  if (assisted) {
    await logAgentAssistanceAction({
      supabase,
      req,
      assistance: assisted.assistance,
      action: "download_daily_convention",
      actionLabel: "Convention Daily téléchargée en mode assistance agent",
      metadata: { convention_id: convention.id },
    });
  }

  return NextResponse.redirect(signedUrlData.signedUrl);
}
