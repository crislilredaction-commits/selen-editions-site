import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { prepareDailySignatureFollowupEmail, sendDailySignatureFollowup } from "@/lib/server/dailySignatureInvitationEmails";

const WINDOW_MS = 10 * 60 * 1000;
const SLA_MS = 72 * 60 * 60 * 1000;
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function one<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) return NextResponse.json({ error: "L’assistance agent est en lecture seule." }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const signatureId = text(body.signature_id);
  if (!signatureId) return NextResponse.json({ error: "Signature manquante." }, { status: 400 });

  const { data: signature, error: signatureError } = await context.admin
    .from("daily_convention_signatures")
    .select("id,convention_id,session_id,signatory_type,signatory_name,signatory_email,token,status,expires_at")
    .eq("id", signatureId)
    .maybeSingle();
  if (signatureError) return NextResponse.json({ error: signatureError.message }, { status: 500 });
  if (!signature) return NextResponse.json({ error: "Signature introuvable." }, { status: 404 });
  if (["signed", "expired", "cancelled", "revoked"].includes(String(signature.status))) {
    return NextResponse.json({ error: "Cette signature ne peut plus être relancée." }, { status: 409 });
  }

  const { data: convention, error: conventionError } = await context.admin
    .from("daily_conventions")
    .select("id,session_id,recipient_name,recipient_email,company_name,document_name,daily_sessions(id,daily_formations(title))")
    .eq("id", signature.convention_id)
    .eq("organisation_id", context.organisationId)
    .eq("session_id", signature.session_id)
    .maybeSingle();
  if (conventionError) return NextResponse.json({ error: conventionError.message }, { status: 500 });
  if (!convention) return NextResponse.json({ error: "Convention introuvable pour cet organisme." }, { status: 404 });

  const email = text(signature.signatory_email || convention.recipient_email).toLowerCase();
  const signatoryName = text(signature.signatory_name || convention.recipient_name || convention.company_name);
  if (!email) return NextResponse.json({ error: "Aucune adresse e-mail n’est enregistrée pour ce signataire." }, { status: 400 });

  const { data: initial } = await context.admin
    .from("daily_communications")
    .select("id,sent_at")
    .eq("organisation_id", context.organisationId)
    .eq("session_id", convention.session_id)
    .eq("communication_type", "convention_signature")
    .contains("metadata", { signature_id: signature.id })
    .in("status", ["sent", "delivered"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!initial?.sent_at) return NextResponse.json({ error: "Aucun envoi initial confirmé n’est enregistré." }, { status: 409 });
  if (Date.now() - new Date(initial.sent_at).getTime() < SLA_MS) {
    return NextResponse.json({ error: "La relance manuelle sera disponible 72 h après l’envoi initial." }, { status: 409 });
  }

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: recent } = await context.admin
    .from("daily_communications")
    .select("id,sent_at,status")
    .eq("organisation_id", context.organisationId)
    .eq("session_id", convention.session_id)
    .eq("communication_type", "convention_signature_followup")
    .contains("metadata", { signature_id: signature.id })
    .gte("created_at", since)
    .in("status", ["queued", "sent", "delivered"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) return NextResponse.json({ ok: true, alreadyRecorded: true, communicationId: recent.id, sentAt: recent.sent_at });

  const session = one(convention.daily_sessions as any);
  const formation = one(session?.daily_formations as any);
  const input = {
    email,
    signatoryName,
    documentName: text(convention.document_name) || "Convention de formation professionnelle",
    formationTitle: text(formation?.title) || "Formation Selen Daily",
    signatureUrl: `${new URL(req.url).origin}/daily-signature/${encodeURIComponent(signature.token)}`,
    expiresAt: signature.expires_at,
  };
  const prepared = prepareDailySignatureFollowupEmail(input);

  const { data: communication, error: evidenceError } = await context.admin
    .from("daily_communications")
    .insert({
      organisation_id: context.organisationId,
      session_id: convention.session_id,
      communication_type: "convention_signature_followup",
      channel: "email",
      recipient_email: email,
      recipient_name: signatoryName || null,
      subject: prepared.subject,
      text_body: prepared.text,
      html_body: prepared.html,
      provider: "resend",
      status: "queued",
      created_by: context.user.id,
      metadata: { signature_id: signature.id, convention_id: convention.id, source: "daily", trigger: "manual_followup" },
    })
    .select("id")
    .single();
  if (evidenceError || !communication) return NextResponse.json({ error: "La relance n’a pas pu être réservée. Aucun e-mail n’a été envoyé." }, { status: 500 });

  const sent = await sendDailySignatureFollowup(input);
  if (!sent.sent) {
    await context.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: sent.reason }).eq("id", communication.id);
    return NextResponse.json({ error: "La relance n’a pas pu être envoyée. La tentative est conservée." }, { status: 503 });
  }

  const sentAt = new Date().toISOString();
  await context.admin.from("daily_communications").update({ provider_message_id: sent.message.providerMessageId, status: "sent", sent_at: sentAt, failed_at: null, failure_reason: null }).eq("id", communication.id);
  return NextResponse.json({ ok: true, sentAt, communicationId: communication.id });
}
