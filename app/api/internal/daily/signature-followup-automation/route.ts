import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import {
  prepareDailySignatureFollowupEmail,
  sendDailySignatureFollowup,
} from "@/lib/server/dailySignatureInvitationEmails";
import {
  DAILY_SIGNATURE_J3_STAGE,
  DAILY_SIGNATURE_REMINDER_TYPE,
  moveDailySignatureReminderToPhoneCall,
  resolveDailySignatureFollowupReminder,
} from "@/lib/server/dailySignatureFollowupReminders";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
function authorized(req: Request) {
  const expected = process.env.DAILY_AUTOMATION_SECRET?.trim();
  if (!expected) return { ok: false as const, status: 503, error: "DAILY_AUTOMATION_SECRET manquant." };
  const received = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!received || received !== expected) return { ok: false as const, status: 401, error: "Accès refusé." };
  return { ok: true as const };
}

export async function GET(req: Request) {
  const access = authorized(req);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const url = new URL(req.url);
  const execute = url.searchParams.get("execute") === "1";
  const now = new Date();
  const nowIso = now.toISOString();
  const admin = getAdminSupabase();

  const { data, error } = await admin
    .from("client_reminders")
    .select("id,client_email,due_at,status,metadata")
    .eq("reminder_type", DAILY_SIGNATURE_REMINDER_TYPE)
    .eq("status", "ready")
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = (data ?? []).filter((row) => text(row.metadata?.followup_stage) === DAILY_SIGNATURE_J3_STAGE);
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const details: Array<{ reminder_id: string; signature_id?: string; status: string }> = [];

  for (const reminder of candidates) {
    const metadata = (reminder.metadata ?? {}) as Record<string, unknown>;
    const signatureId = text(metadata.signature_id);
    const organisationId = text(metadata.organisation_id);
    const sessionId = text(metadata.session_id);
    const conventionId = text(metadata.convention_id);
    const initialSentAt = text(metadata.initial_sent_at || metadata.sent_at);
    if (!signatureId || !organisationId || !sessionId || !conventionId || !initialSentAt) {
      skipped += 1;
      details.push({ reminder_id: reminder.id, status: "metadata_incomplete" });
      continue;
    }

    const { data: signature, error: signatureError } = await admin
      .from("daily_convention_signatures")
      .select("id,convention_id,session_id,signatory_name,signatory_email,token,status,signed_at,expires_at")
      .eq("id", signatureId)
      .eq("convention_id", conventionId)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (signatureError || !signature) {
      failed += 1;
      details.push({ reminder_id: reminder.id, signature_id: signatureId, status: signatureError ? "signature_read_failed" : "signature_missing" });
      continue;
    }
    if (signature.status === "signed" || signature.signed_at) {
      if (execute) await resolveDailySignatureFollowupReminder(admin, signatureId, signature.signed_at ?? nowIso);
      skipped += 1;
      details.push({ reminder_id: reminder.id, signature_id: signatureId, status: "already_signed" });
      continue;
    }
    if (["expired", "cancelled", "revoked", "refused"].includes(String(signature.status))) {
      if (execute) await resolveDailySignatureFollowupReminder(admin, signatureId, nowIso);
      skipped += 1;
      details.push({ reminder_id: reminder.id, signature_id: signatureId, status: "signature_terminal" });
      continue;
    }

    const { data: convention, error: conventionError } = await admin
      .from("daily_conventions")
      .select("id,organisation_id,session_id,recipient_name,recipient_email,company_name,document_name,daily_sessions(id,internal_reference,daily_formations(title))")
      .eq("id", conventionId)
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (conventionError || !convention) {
      failed += 1;
      details.push({ reminder_id: reminder.id, signature_id: signatureId, status: conventionError ? "convention_read_failed" : "convention_missing" });
      continue;
    }

    const email = text(signature.signatory_email || reminder.client_email || convention.recipient_email).toLowerCase();
    const signatoryName = text(signature.signatory_name || convention.recipient_name || convention.company_name);
    const session = one(convention.daily_sessions as any);
    const formation = one(session?.daily_formations as any);
    const formationTitle = text(formation?.title) || "Formation Selen Daily";
    const documentName = text(convention.document_name) || "document de formation";
    if (!email || !signature.token) {
      skipped += 1;
      details.push({ reminder_id: reminder.id, signature_id: signatureId, status: "recipient_or_token_missing" });
      continue;
    }

    const { data: previous } = await admin
      .from("daily_communications")
      .select("id,status,sent_at")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId)
      .eq("communication_type", "convention_signature_followup")
      .eq("recipient_email", email)
      .contains("metadata", { signature_id: signatureId, followup_stage: DAILY_SIGNATURE_J3_STAGE })
      .in("status", ["queued", "sent", "delivered"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previous?.sent_at) {
      if (execute) {
        const { data: claimed } = await admin.from("client_reminders").update({ status: "postponed" }).eq("id", reminder.id).eq("status", "ready").select("id").maybeSingle();
        if (claimed) await moveDailySignatureReminderToPhoneCall(admin, { reminderId: reminder.id, initialSentAt, documentName, automaticEmailSentAt: previous.sent_at, metadata });
      }
      skipped += 1;
      details.push({ reminder_id: reminder.id, signature_id: signatureId, status: "already_sent" });
      continue;
    }

    if (!execute) {
      details.push({ reminder_id: reminder.id, signature_id: signatureId, status: "due" });
      continue;
    }

    // Réservation atomique du rappel : un second exécuteur ne pourra pas envoyer le même email en parallèle.
    const { data: claimed, error: claimError } = await admin
      .from("client_reminders")
      .update({ status: "postponed" })
      .eq("id", reminder.id)
      .eq("status", "ready")
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) {
      skipped += 1;
      details.push({ reminder_id: reminder.id, signature_id: signatureId, status: claimError ? "claim_failed" : "already_claimed" });
      continue;
    }

    const signatureUrl = `${url.origin}/daily-signature/${encodeURIComponent(signature.token)}`;
    const emailInput = { email, signatoryName, documentName, formationTitle, signatureUrl, expiresAt: signature.expires_at };
    const prepared = prepareDailySignatureFollowupEmail(emailInput);
    const { data: communication, error: evidenceError } = await admin.from("daily_communications").insert({
      organisation_id: organisationId,
      session_id: sessionId,
      communication_type: "convention_signature_followup",
      channel: "email",
      recipient_email: email,
      recipient_name: signatoryName || null,
      subject: prepared.subject,
      text_body: prepared.text,
      html_body: prepared.html,
      provider: "resend",
      status: "queued",
      created_by: null,
      metadata: { signature_id: signatureId, convention_id: conventionId, followup_stage: DAILY_SIGNATURE_J3_STAGE, automatic: true },
    }).select("id").single();

    if (evidenceError || !communication) {
      await admin.from("client_reminders").update({ status: "ready", due_at: reminder.due_at }).eq("id", reminder.id).eq("status", "postponed");
      failed += 1;
      details.push({ reminder_id: reminder.id, signature_id: signatureId, status: "evidence_failed" });
      continue;
    }

    const sent = await sendDailySignatureFollowup(emailInput);
    if (!sent.sent) {
      const failedAt = new Date().toISOString();
      await Promise.all([
        admin.from("daily_communications").update({ status: "failed", failed_at: failedAt, failure_reason: sent.reason }).eq("id", communication.id).eq("organisation_id", organisationId),
        admin.from("client_reminders").update({ status: "ready", due_at: reminder.due_at }).eq("id", reminder.id).eq("status", "postponed"),
      ]);
      failed += 1;
      details.push({ reminder_id: reminder.id, signature_id: signatureId, status: sent.reason });
      continue;
    }

    const sentAt = new Date().toISOString();
    const { error: finalizeError } = await admin.from("daily_communications").update({
      provider_message_id: sent.message.providerMessageId,
      status: "sent",
      sent_at: sentAt,
      failed_at: null,
      failure_reason: null,
    }).eq("id", communication.id).eq("organisation_id", organisationId);

    if (finalizeError) {
      failed += 1;
      details.push({ reminder_id: reminder.id, signature_id: signatureId, status: "sent_evidence_finalize_failed" });
      continue;
    }

    await moveDailySignatureReminderToPhoneCall(admin, {
      reminderId: reminder.id,
      initialSentAt,
      documentName,
      automaticEmailSentAt: sentAt,
      metadata,
    });
    processed += 1;
    details.push({ reminder_id: reminder.id, signature_id: signatureId, status: "sent_and_phone_scheduled" });
  }

  return NextResponse.json({ ok: failed === 0, execute, due: candidates.length, processed, skipped, failed, details }, { status: failed === 0 ? 200 : 207 });
}

export async function POST(req: Request) {
  return GET(req);
}
