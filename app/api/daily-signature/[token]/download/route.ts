import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };

function cleanToken(value?: string | null) {
  return String(value ?? "").trim();
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const clean = cleanToken(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data: signature, error } = await supabase
    .from("daily_convention_signatures")
    .select("id,status,expires_at,daily_conventions(document_name,storage_path)")
    .eq("token", clean)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!signature) return NextResponse.json({ error: "Lien de signature introuvable." }, { status: 404 });
  if (
    signature.status !== "signed" &&
    signature.expires_at &&
    new Date(signature.expires_at).getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "Ce lien de signature a expire." }, { status: 410 });
  }

  const convention = Array.isArray(signature.daily_conventions)
    ? signature.daily_conventions[0]
    : signature.daily_conventions;
  if (!convention?.storage_path) {
    return NextResponse.json({ error: "Convention introuvable." }, { status: 404 });
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

  return NextResponse.redirect(signedUrlData.signedUrl);
}
