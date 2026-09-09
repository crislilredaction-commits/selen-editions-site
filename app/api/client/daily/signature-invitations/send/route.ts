import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { prepareDailySignatureInvitationEmail, sendDailySignatureInvitation } from "@/lib/server/dailySignatureInvitationEmails";
import { ensureDailySignatureFollowupReminder } from "@/lib/server/dailySignatureFollowupReminders";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function ensureReminderWithoutBreakingSend(admin: any, input: Parameters<typeof ensureDailySignatureFollowupReminder>[1]) {
  try {
    return await ensureDailySignatureFollowupReminder(admin, input);
  } catch (error) {
    console.error("Daily : invitation envoyée mais relance H+72 non enregistrée", error);
    return null;
  }
}

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

  const { data: convention, error: conventionError } = await context.admin
    .from("daily_conventions")
    .select("id,session_id,recipient_name,recipient_email,company_name,document_name,version,daily_sessions(id,internal_reference,daily_formations(title))")
    .eq("id", signature.convention_id)
    .eq("organisation_id", context.organisationId)
    .eq("session_id", signature.session_id)
    .maybeSingle();
  if (conventionError) return NextResponse.json({ error: conventionError.message }, { status: 500 });
  if (!convention) return NextResponse.json({ error: "Convention introuvable pour cet organisme." }, { status: 404 });

  const terminalStatuses = ["signed", "expired", "cancelled", "revoked"];
  if (terminalStatuses.includes(String(signature.status))) {
    return NextResponse.json({ error: "Cette demande de signature n’est plus envoyable." }, { status: 409 });
  }
  if (signature.expires_at && new Date(signature.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Le lien de signature a expiré." }, { status: 409 });
  }

  const email = text(signature.signatory_email || convention.recipient_email).toLowerCase();
  const signatoryName = text(signature.signatory_name || convention.recipient_name || convention.company_name);
  if (!email) return NextResponse.json({ error: "Aucune adresse e-mail n’est enregistrée pour ce signataire." }, { status: 400 });

  const reminderInput = (sentAt: string) => ({
    organisationId: context.organisationId,
    sessionId: convention.session_id,
    conventionId: convention.id,
    signatureId: signature.id,
    signatoryType: signature.signatory_type,
    signatoryName,
    signatoryEmail: email,
    documentName: convention.document_name,
    sentAt,
  });

  const { data: previous } = await context.admin
    .from("daily_communications")
    .select("id,status,sent_at,delivered_at,provider_message_id")
    .eq("organisation_id", context.organisationId)
    .eq("session_id", convention.session_id)
    .eq("communication_type", "convention_signature")
    .eq("recipient_email", email)
    .contains("metadata", { signature_id: signature.id })
    .in("status", ["queued", "sent", "delivered"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previous) {
    const reminder = previous.sent_at ? await ensureReminderWithoutBreakingSend(context.admin, reminderInput(previous.sent_at)) : null;
    return NextResponse.json({
      ok: true,
      alreadyRecorded: true,
      communicationId: previous.id,
      status: previous.status,
      sentAt: previous.sent_at,
      deliveredAt: previous.delivered_at,
      followupReminderRecorded: Boolean(reminder),
    });
  }

  const session = one(convention.daily_sessions as any);
  const formation = one(session?.daily_formations as any);
  const formationTitle = text(formation?.title) || "Formation Selen Daily";
  const signatureUrl = `${new URL(req.url).origin}/daily-signature/${encodeURIComponent(signature.token)}`;
  const emailInput = {
    email,
    signatoryName,
    documentName: text(convention.document_name) || "Convention de formation professionnelle",
    formationTitle,
    signatureUrl,
    expiresAt: signature.expires_at,
  };
  const prepared = prepareDailySignatureInvitationEmail(emailInput);

  const { data: communication, error: evidenceError } = await context.admin
    .from("daily_communications")
    .insert({
      organisation_id: context.organisationId,
      session_id: convention.session_id,
      communication_type: "convention_signature",
      channel: "email",
      recipient_email: email,
      recipient_name: signatoryName || null,
      subject: prepared.subject,
      text_body: prepared.text,
      html_body: prepared.html,
      provider: "resend",
      status: "queued",
      created_by: context.user.id,
      metadata: {
        convention_id: convention.id,
        convention_version: convention.version,
        signature_id: signature.id,
        signatory_type: signature.signatory_type,
      },
    })
    .select("id")
    .single();

  if (evidenceError || !communication) {
    return NextResponse.json({ error: "La preuve d’envoi n’a pas pu être réservée. Aucun e-mail n’a été envoyé." }, { status: 500 });
  }

  const sent = await sendDailySignatureInvitation(emailInput);
  if (!sent.sent) {
    const failedAt = new Date().toISOString();
    await context.admin.from("daily_communications").update({
      status: "failed",
      failed_at: failedAt,
      failure_reason: sent.reason,
    }).eq("id", communication.id);
    return NextResponse.json({ error: "L’invitation de signature n’a pas pu être envoyée. La tentative est conservée." }, { status: 503 });
  }

  const sentAt = new Date().toISOString();
  const { error: finalizeError } = await context.admin
    .from("daily_communications")
    .update({
      provider_message_id: sent.message.providerMessageId,
      status: "sent",
      sent_at: sentAt,
      failed_at: null,
      failure_reason: null,
    })
    .eq("id", communication.id);

  if (finalizeError) console.error("Daily : invitation envoyée mais preuve non finalisée", finalizeError);
  const reminder = await ensureReminderWithoutBreakingSend(context.admin, reminderInput(sentAt));

  return NextResponse.json({
    ok: true,
    sentTo: email,
    sentAt,
    evidenceRecorded: !finalizeError,
    communicationId: communication.id,
    followupReminderRecorded: Boolean(reminder),
  });
}
