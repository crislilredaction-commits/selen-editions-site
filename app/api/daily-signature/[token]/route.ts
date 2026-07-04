import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };

const CONSENT_TEXT =
  "Je reconnais avoir pris connaissance de la convention de formation et accepte de la signer electroniquement.";

function cleanToken(value?: string | null) {
  return String(value ?? "").trim();
}

function text(body: Record<string, unknown>, key: string) {
  return String(body[key] ?? "").trim();
}

async function findSignature(token: string) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("daily_convention_signatures")
    .select(`
      *,
      daily_conventions(
        id,
        document_name,
        recipient_type,
        recipient_name,
        company_name,
        version,
        generated_at,
        daily_sessions(
          id,
          daily_formations(title)
        )
      )
    `)
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

function isExpired(expiresAt?: string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const clean = cleanToken(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const supabase = getAdminSupabase();
  const signature = await findSignature(clean);
  if (!signature) return NextResponse.json({ error: "Lien de signature introuvable." }, { status: 404 });

  if (isExpired(signature.expires_at) && signature.status !== "signed") {
    await supabase
      .from("daily_convention_signatures")
      .update({ status: "expired", last_error: "Lien expire." })
      .eq("id", signature.id);
    return NextResponse.json({ error: "Ce lien de signature a expire." }, { status: 410 });
  }

  if (signature.status === "pending") {
    await supabase
      .from("daily_convention_signatures")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", signature.id);
    signature.status = "viewed";
    signature.viewed_at = new Date().toISOString();
  }

  return NextResponse.json({
    signature,
    consentText: CONSENT_TEXT,
    conservationText: "Cette signature sera horodatee et conservee dans le dossier de formation.",
  });
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const clean = cleanToken(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const consentAccepted = body.consent === true;
  const signatureData = text(body, "signature_data");
  if (!consentAccepted) {
    return NextResponse.json({ error: "Le consentement est obligatoire." }, { status: 400 });
  }
  if (!signatureData.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ error: "La signature dessinee est obligatoire." }, { status: 400 });
  }

  const supabase = getAdminSupabase();
  const signature = await findSignature(clean);
  if (!signature) return NextResponse.json({ error: "Lien de signature introuvable." }, { status: 404 });
  if (signature.status === "signed") {
    return NextResponse.json({
      ok: true,
      alreadySigned: true,
      signedAt: signature.signed_at,
    });
  }
  if (isExpired(signature.expires_at)) {
    await supabase
      .from("daily_convention_signatures")
      .update({ status: "expired", last_error: "Lien expire." })
      .eq("id", signature.id);
    return NextResponse.json({ error: "Ce lien de signature a expire." }, { status: 410 });
  }

  const signedAt = new Date().toISOString();
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent");
  const proofHash = createHash("sha256")
    .update([
      signature.convention_id,
      signature.signatory_type,
      signature.signatory_email ?? "",
      signedAt,
      CONSENT_TEXT,
      signatureData,
    ].join("|"))
    .digest("hex");

  const { data, error } = await supabase
    .from("daily_convention_signatures")
    .update({
      status: "signed",
      consent_text: CONSENT_TEXT,
      signature_data: signatureData,
      signed_at: signedAt,
      viewed_at: signature.viewed_at ?? signedAt,
      ip_address: ipAddress,
      user_agent: userAgent,
      proof_hash: proofHash,
      last_error: null,
    })
    .eq("id", signature.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, signature: data });
}
