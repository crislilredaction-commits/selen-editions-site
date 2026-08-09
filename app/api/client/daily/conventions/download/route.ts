import { NextResponse } from "next/server";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";

export async function GET(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions", { allowAssistanceRead: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Convention introuvable." }, { status: 400 });

  const { data: convention, error } = await context.admin
    .from("daily_conventions")
    .select("id,document_name,storage_path,session_id")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!convention?.storage_path) {
    return NextResponse.json({ error: "Fichier convention introuvable." }, { status: 404 });
  }

  const { data: session, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id")
    .eq("id", convention.session_id)
    .eq("organisation_id", context.organisationId)
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Convention introuvable pour cet organisme." }, { status: 404 });

  const { data: signedUrlData, error: signedUrlError } = await context.admin.storage
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

  if (context.assisted && context.assistance) {
    await logAgentAssistanceAction({
      supabase: context.admin,
      req,
      assistance: context.assistance,
      action: "download_daily_convention",
      actionLabel: "Convention Daily téléchargée en mode assistance agent",
      metadata: { convention_id: convention.id },
    });
  }

  return NextResponse.redirect(signedUrlData.signedUrl);
}
