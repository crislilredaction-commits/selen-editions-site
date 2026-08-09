import { NextResponse } from "next/server";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";

export async function GET(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions", { allowAssistanceRead: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Convocation introuvable." }, { status: 400 });

  const { data: convocation, error } = await context.admin
    .from("daily_convocations")
    .select("id,document_name,storage_path,session_id")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!convocation?.storage_path) {
    return NextResponse.json({ error: "Fichier convocation introuvable." }, { status: 404 });
  }

  const { data: session, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id")
    .eq("id", convocation.session_id)
    .eq("organisation_id", context.organisationId)
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Convocation introuvable pour cet organisme." }, { status: 404 });

  const { data, error: signedUrlError } = await context.admin.storage
    .from("documents")
    .createSignedUrl(convocation.storage_path, 60 * 5, {
      download: convocation.document_name ?? true,
    });

  if (signedUrlError || !data?.signedUrl) {
    return NextResponse.json(
      { error: signedUrlError?.message ?? "Impossible de generer le lien." },
      { status: 500 },
    );
  }

  if (context.assisted && context.assistance) {
    await logAgentAssistanceAction({
      supabase: context.admin,
      req,
      assistance: context.assistance,
      action: "download_daily_convocation",
      actionLabel: "Convocation Daily téléchargée en mode assistance agent",
      metadata: { convocation_id: convocation.id },
    });
  }

  return NextResponse.redirect(data.signedUrl);
}
