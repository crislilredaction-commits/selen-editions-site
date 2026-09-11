import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getLearnerSatisfactionAvailability, parisLocalDateTimeToInstant } from "@/lib/daily/endOfTraining";
import { prepareDailyTrainerSatisfactionReminder, sendDailyTrainerSatisfactionReminder } from "@/lib/server/dailyTrainerSatisfactionReminderEmails";

const COMMUNICATION_TYPE = "trainer_satisfaction_reminder";

type Json = Record<string, unknown>;
type Trainer = { id: string; display_name: string | null; professional_email: string | null; status: string | null };
type Session = { id: string; organisation_id: string; end_date: string | null; trainer_ids: unknown; status: string | null; daily_formations: { title?: string | null; learning_assessment_mode?: string | null } | { title?: string | null; learning_assessment_mode?: string | null }[] | null };
type Slot = { session_id: string; slot_date: string; ends_at: string };
type Enrolment = { id: string; session_id: string; status: string | null };

function text(value: unknown) { return String(value ?? "").trim(); }
function one<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function ids(value: unknown) { return Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : []; }
function active(status: string | null) { return !["declined", "cancelled", "abandoned"].includes(text(status).toLowerCase()); }
function authorized(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const automationSecret = process.env.DAILY_AUTOMATION_SECRET?.trim();
  if (!cronSecret && !automationSecret) return { ok: false as const, status: 503, error: "Secret d’automatisation manquant." };
  const received = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (cronSecret && received === cronSecret) return { ok: true as const, cron: true as const };
  if (automationSecret && received === automationSecret) return { ok: true as const, cron: false as const };
  return { ok: false as const, status: 401, error: "Accès refusé." };
}
function finalSlot(rows: Slot[]) {
  return [...rows].sort((a, b) => `${b.slot_date}T${b.ends_at}`.localeCompare(`${a.slot_date}T${a.ends_at}`))[0] ?? null;
}

export async function GET(req: Request) {
  const access = authorized(req);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const url = new URL(req.url);
  const execute = access.cron || url.searchParams.get("execute") === "1";
  const now = new Date();
  const admin = getAdminSupabase();

  const { data: sessionRows, error: sessionError } = await admin.from("daily_sessions")
    .select("id,organisation_id,end_date,trainer_ids,status,daily_formations(title,learning_assessment_mode)")
    .not("end_date", "is", null).neq("status", "archived");
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  const sessions = ((sessionRows ?? []) as Session[]).filter((session) => one(session.daily_formations)?.learning_assessment_mode === "external" && ids(session.trainer_ids).length > 0);
  if (!sessions.length) return NextResponse.json({ ok: true, execute, due: 0, processed: 0, skipped: 0, failed: 0, details: [] });

  const sessionIds = sessions.map((session) => session.id);
  const trainerIds = [...new Set(sessions.flatMap((session) => ids(session.trainer_ids)))];
  const [slotsR, enrolmentsR, trainersR, communicationsR, tokensR] = await Promise.all([
    admin.from("daily_attendance_slots").select("session_id,slot_date,ends_at").in("session_id", sessionIds),
    admin.from("daily_session_enrolments").select("id,session_id,status").in("session_id", sessionIds),
    admin.from("daily_trainer_profiles").select("id,display_name,professional_email,status").in("id", trainerIds).not("status", "in", "(rejected,archived)"),
    admin.from("daily_communications").select("id,session_id,recipient_email,status,metadata").in("session_id", sessionIds).eq("communication_type", COMMUNICATION_TYPE).in("status", ["queued", "sent", "delivered"]),
    admin.from("daily_portal_access_tokens").select("session_id,entity_email,token,status,expires_at").in("session_id", sessionIds).eq("portal_type", "trainer").not("status", "in", "(revoked,expired)"),
  ]);
  const readError = slotsR.error ?? enrolmentsR.error ?? trainersR.error ?? communicationsR.error ?? tokensR.error;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const slots = (slotsR.data ?? []) as Slot[];
  const enrolments = (enrolmentsR.data ?? []) as Enrolment[];
  const trainers = new Map(((trainersR.data ?? []) as Trainer[]).map((trainer) => [trainer.id, trainer]));
  const communications = communicationsR.data ?? [];
  const tokens = tokensR.data ?? [];
  let due = 0, processed = 0, skipped = 0, failed = 0;
  const details: Array<{ session_id: string; trainer_id: string; status: string }> = [];

  for (const session of sessions) {
    const formation = one(session.daily_formations);
    const last = finalSlot(slots.filter((slot) => slot.session_id === session.id));
    if (!last || !session.end_date) { skipped++; continue; }
    const finalSlotEnd = parisLocalDateTimeToInstant(last.slot_date, last.ends_at);
    if (!finalSlotEnd) { skipped++; continue; }
    const availability = getLearnerSatisfactionAvailability({ mode: "external", assessmentSubmitted: false, endDate: session.end_date, finalSlot: last, now });
    if (!availability.available) continue;
    if (finalSlotEnd.getTime() < now.getTime()) continue;
    const learnerCount = enrolments.filter((row) => row.session_id === session.id && active(row.status)).length;
    if (!learnerCount) { skipped++; continue; }
    const formationTitle = text(formation?.title) || "Formation Selen Daily";

    for (const trainerId of ids(session.trainer_ids)) {
      const trainer = trainers.get(trainerId);
      const email = text(trainer?.professional_email).toLowerCase();
      if (!trainer || !email) { skipped++; details.push({ session_id: session.id, trainer_id: trainerId, status: "missing_trainer_email" }); continue; }
      const already = communications.some((row) => row.session_id === session.id && text(row.recipient_email).toLowerCase() === email && row.metadata && typeof row.metadata === "object" && text((row.metadata as Json).trainer_profile_id) === trainerId);
      if (already) { skipped++; details.push({ session_id: session.id, trainer_id: trainerId, status: "already_sent" }); continue; }
      due++;
      if (!execute) { details.push({ session_id: session.id, trainer_id: trainerId, status: "due" }); continue; }
      const token = tokens.find((row) => row.session_id === session.id && text(row.entity_email).toLowerCase() === email && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()));
      const workspaceUrl = token?.token ? `${url.origin}/daily/portail/trainer/${encodeURIComponent(token.token)}` : null;
      const input = { email, trainerName: text(trainer.display_name), formationTitle, learnerCount, workspaceUrl };
      const prepared = prepareDailyTrainerSatisfactionReminder(input);
      const { data: communication, error: evidenceError } = await admin.from("daily_communications").insert({
        organisation_id: session.organisation_id, session_id: session.id, communication_type: COMMUNICATION_TYPE, channel: "email",
        recipient_email: email, recipient_name: text(trainer.display_name) || null, subject: prepared.subject, text_body: prepared.text,
        html_body: prepared.html, provider: "resend", status: "queued", created_by: null,
        metadata: { trainer_profile_id: trainerId, automation: true, trigger: "external_assessment_h_minus_2", learner_count: learnerCount, final_slot_end: finalSlotEnd.toISOString() },
      }).select("id").single();
      if (evidenceError || !communication) { failed++; details.push({ session_id: session.id, trainer_id: trainerId, status: "evidence_failed" }); continue; }
      const sent = await sendDailyTrainerSatisfactionReminder(input);
      if (!sent.sent) {
        await admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: sent.reason }).eq("id", communication.id);
        failed++; details.push({ session_id: session.id, trainer_id: trainerId, status: sent.reason }); continue;
      }
      const { error: finalizeError } = await admin.from("daily_communications").update({ provider_message_id: sent.message.providerMessageId, status: "sent", sent_at: new Date().toISOString(), failed_at: null, failure_reason: null }).eq("id", communication.id);
      if (finalizeError) failed++; else processed++;
      details.push({ session_id: session.id, trainer_id: trainerId, status: finalizeError ? "sent_evidence_finalize_failed" : "sent" });
    }
  }
  return NextResponse.json({ ok: failed === 0, execute, due, processed, skipped, failed, details }, { status: failed === 0 ? 200 : 207 });
}
export async function POST(req: Request) { return GET(req); }
