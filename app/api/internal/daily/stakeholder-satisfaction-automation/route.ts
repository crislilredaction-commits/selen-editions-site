import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import {
  prepareDailyStakeholderSatisfactionEmail,
  sendDailyStakeholderSatisfactionEmail,
} from "@/lib/server/dailyStakeholderSatisfactionEmails";

const COMMUNICATION_TYPE = "stakeholder_satisfaction_request";
const PHONE_FOLLOWUP_SOURCE = "satisfaction_phone_followup";
const REMINDER_OFFSETS_DAYS = [2, 4] as const;
const RESPONSE_WINDOW_DAYS = 30;

type StakeholderType = "company" | "trainer";
type PortalType = "enterprise" | "trainer";
type Formation = { title?: string | null };
type SessionRow = {
  id: string;
  organisation_id: string;
  internal_reference: string | null;
  end_date: string | null;
  daily_formations: Formation | Formation[] | null;
};
type PortalRow = {
  id: string;
  session_id: string;
  portal_type: PortalType;
  entity_key: string;
  entity_name: string | null;
  entity_email: string | null;
  token: string;
  status: string;
  expires_at: string | null;
};
type ResponseRow = { session_id: string; stakeholder_type: StakeholderType; entity_key: string };
type CommunicationRow = {
  session_id: string | null;
  recipient_email: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};
type PhoneActionRow = { id: string; source_id: string | null; status: string };
type AutomationStage = "initial" | "j2" | "j4";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function dateInParis(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function shiftDate(dateValue: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function daysBetween(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T12:00:00Z`).getTime();
  const to = new Date(`${toDate}T12:00:00Z`).getTime();
  return Math.floor((to - from) / 86_400_000);
}
function authorized(req: Request) {
  const expected = process.env.DAILY_AUTOMATION_SECRET?.trim();
  if (!expected) return { ok: false as const, status: 503, error: "DAILY_AUTOMATION_SECRET manquant." };
  const received = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!received || received !== expected) return { ok: false as const, status: 401, error: "Accès refusé." };
  return { ok: true as const };
}
function stakeholderTypeForPortal(portal: PortalRow): StakeholderType {
  return portal.portal_type === "enterprise" ? "company" : "trainer";
}
function entityMatches(row: CommunicationRow, portal: PortalRow) {
  return row.session_id === portal.session_id
    && text(row.recipient_email).toLowerCase() === text(portal.entity_email).toLowerCase()
    && text(row.metadata?.stakeholder_type) === stakeholderTypeForPortal(portal)
    && text(row.metadata?.entity_key) === portal.entity_key;
}
function successfulStages(rows: CommunicationRow[], portal: PortalRow) {
  return new Set(
    rows
      .filter((row) => entityMatches(row, portal) && ["sent", "delivered"].includes(row.status))
      .map((row) => text(row.metadata?.automation_stage))
      .filter(Boolean),
  );
}
function queuedStage(rows: CommunicationRow[], portal: PortalRow, stage: AutomationStage) {
  return rows.some((row) => entityMatches(row, portal)
    && ["queued", "sent", "delivered"].includes(row.status)
    && text(row.metadata?.automation_stage) === stage);
}
function stageDue(ageDays: number, stages: Set<string>): AutomationStage | null {
  if (!stages.has("initial")) return ageDays >= 0 ? "initial" : null;
  if (!stages.has("j2")) return ageDays >= REMINDER_OFFSETS_DAYS[0] ? "j2" : null;
  if (!stages.has("j4")) return ageDays >= REMINDER_OFFSETS_DAYS[1] ? "j4" : null;
  return null;
}

export async function GET(req: Request) {
  const access = authorized(req);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const requestUrl = new URL(req.url);
  const execute = requestUrl.searchParams.get("execute") === "1";
  const today = dateInParis();
  const earliestEndDate = shiftDate(today, -RESPONSE_WINDOW_DAYS);
  const admin = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,internal_reference,end_date,daily_formations(title)")
    .gte("end_date", earliestEndDate)
    .lte("end_date", today)
    .neq("status", "archived")
    .order("end_date", { ascending: true });
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  const sessions = (sessionData ?? []) as SessionRow[];
  if (sessions.length === 0) {
    return NextResponse.json({ ok: true, execute, date: today, due: 0, processed: 0, skipped: 0, failed: 0 });
  }
  const sessionIds = sessions.map((session) => session.id);

  const [portalsResult, responsesResult, communicationsResult, phoneActionsResult] = await Promise.all([
    admin.from("daily_portal_access_tokens")
      .select("id,session_id,portal_type,entity_key,entity_name,entity_email,token,status,expires_at")
      .in("session_id", sessionIds).in("portal_type", ["enterprise", "trainer"]).in("status", ["pending", "viewed"]),
    admin.from("daily_stakeholder_satisfaction_responses")
      .select("session_id,stakeholder_type,entity_key")
      .in("session_id", sessionIds).in("stakeholder_type", ["company", "trainer"]),
    admin.from("daily_communications")
      .select("session_id,recipient_email,status,sent_at,created_at,metadata")
      .in("session_id", sessionIds).eq("communication_type", COMMUNICATION_TYPE)
      .in("status", ["queued", "sent", "delivered", "failed"]),
    admin.from("daily_quality_actions")
      .select("id,source_id,status")
      .eq("source_type", PHONE_FOLLOWUP_SOURCE).in("status", ["open", "planned"]),
  ]);
  const readError = portalsResult.error ?? responsesResult.error ?? communicationsResult.error ?? phoneActionsResult.error;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const portals = (portalsResult.data ?? []) as PortalRow[];
  const responses = (responsesResult.data ?? []) as ResponseRow[];
  const communications = (communicationsResult.data ?? []) as CommunicationRow[];
  const phoneActions = (phoneActionsResult.data ?? []) as PhoneActionRow[];
  const responseKeys = new Set(responses.map((row) => `${row.session_id}:${row.stakeholder_type}:${row.entity_key}`));
  const phoneActionBySource = new Map(phoneActions.filter((row) => row.source_id).map((row) => [row.source_id as string, row]));
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));

  let due = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let phoneTasksCreated = 0;
  let phoneTasksClosed = 0;
  const details: Array<{ session_id: string; entity_key: string; stakeholder_type: StakeholderType; status: string; stage?: AutomationStage }> = [];

  for (const portal of portals) {
    const session = sessionMap.get(portal.session_id);
    const stakeholderType = stakeholderTypeForPortal(portal);
    if (!session?.end_date) { skipped += 1; continue; }
    const responseKey = `${portal.session_id}:${stakeholderType}:${portal.entity_key}`;
    const phoneAction = phoneActionBySource.get(portal.id);

    if (responseKeys.has(responseKey)) {
      if (execute && phoneAction) {
        const { error } = await admin.from("daily_quality_actions")
          .update({ status: "closed", implemented_at: new Date().toISOString(), implemented_improvement: "Réponse satisfaction reçue : relance téléphonique devenue sans objet." })
          .eq("id", phoneAction.id).in("status", ["open", "planned"]);
        if (!error) phoneTasksClosed += 1;
      }
      skipped += 1;
      details.push({ session_id: portal.session_id, entity_key: portal.entity_key, stakeholder_type: stakeholderType, status: "already_submitted" });
      continue;
    }
    if (!text(portal.entity_email)) {
      skipped += 1;
      details.push({ session_id: portal.session_id, entity_key: portal.entity_key, stakeholder_type: stakeholderType, status: "missing_email" });
      continue;
    }
    if (portal.expires_at && new Date(portal.expires_at).getTime() < Date.now()) {
      skipped += 1;
      details.push({ session_id: portal.session_id, entity_key: portal.entity_key, stakeholder_type: stakeholderType, status: "portal_expired" });
      continue;
    }

    const ageDays = daysBetween(session.end_date, today);
    if (ageDays < 0 || ageDays > RESPONSE_WINDOW_DAYS) { skipped += 1; continue; }
    const stages = successfulStages(communications, portal);
    const stage = stageDue(ageDays, stages);

    if (!stage && stages.has("j4") && !phoneAction) {
      due += 1;
      if (execute) {
        const label = stakeholderType === "company" ? "entreprise" : "formateur";
        const { error } = await admin.from("daily_quality_actions").insert({
          organisation_id: session.organisation_id,
          session_id: session.id,
          category: "corrective_action",
          source_type: PHONE_FOLLOWUP_SOURCE,
          source_id: portal.id,
          title: `Relance téléphonique satisfaction — ${label}`,
          observation: `Aucune réponse après les relances email J+2 et J+4 pour ${text(portal.entity_name) || text(portal.entity_email)}.`,
          proposed_solution: "Contacter la partie prenante par téléphone et consigner le résultat de la relance.",
          status: "open",
          created_by: null,
        });
        if (error) failed += 1;
        else { phoneTasksCreated += 1; processed += 1; }
      }
      details.push({ session_id: session.id, entity_key: portal.entity_key, stakeholder_type: stakeholderType, status: execute ? "phone_task_created" : "phone_task_due" });
      continue;
    }

    if (!stage || queuedStage(communications, portal, stage)) { skipped += 1; continue; }
    due += 1;
    if (!execute) {
      details.push({ session_id: portal.session_id, entity_key: portal.entity_key, stakeholder_type: stakeholderType, status: "due", stage });
      continue;
    }

    const formation = one(session.daily_formations);
    const formationTitle = text(formation?.title) || "Formation Selen Daily";
    const sessionReference = text(session.internal_reference) || formationTitle;
    const email = text(portal.entity_email).toLowerCase();
    const satisfactionUrl = new URL(`/daily/portail/${portal.portal_type}/${portal.token}/satisfaction`, requestUrl.origin).toString();
    const reminder = stage !== "initial";
    const emailInput = { email, recipientName: text(portal.entity_name), formationTitle, sessionReference, satisfactionUrl, reminder, stakeholderType };
    const prepared = prepareDailyStakeholderSatisfactionEmail(emailInput);

    const { data: communication, error: evidenceError } = await admin.from("daily_communications").insert({
      organisation_id: session.organisation_id,
      session_id: session.id,
      enrolment_id: null,
      communication_type: COMMUNICATION_TYPE,
      channel: "email",
      recipient_email: email,
      recipient_name: text(portal.entity_name) || null,
      subject: prepared.subject,
      text_body: prepared.text,
      html_body: prepared.html,
      provider: "resend",
      status: "queued",
      created_by: null,
      metadata: { stakeholder_type: stakeholderType, portal_type: portal.portal_type, entity_key: portal.entity_key, portal_access_id: portal.id, reminder, automation_stage: stage, response_window_days: RESPONSE_WINDOW_DAYS },
    }).select("id").single();
    if (evidenceError || !communication) { failed += 1; continue; }

    const sent = await sendDailyStakeholderSatisfactionEmail(emailInput);
    if (!sent.sent) {
      await admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: sent.reason }).eq("id", communication.id);
      failed += 1;
      details.push({ session_id: session.id, entity_key: portal.entity_key, stakeholder_type: stakeholderType, status: sent.reason, stage });
      continue;
    }
    const { error: finalizeError } = await admin.from("daily_communications").update({ provider_message_id: sent.message.providerMessageId, status: "sent", sent_at: new Date().toISOString(), failed_at: null, failure_reason: null }).eq("id", communication.id);
    processed += 1;

    if (stage === "j4" && !phoneAction) {
      const label = stakeholderType === "company" ? "entreprise" : "formateur";
      const { error: phoneError } = await admin.from("daily_quality_actions").insert({
        organisation_id: session.organisation_id,
        session_id: session.id,
        category: "corrective_action",
        source_type: PHONE_FOLLOWUP_SOURCE,
        source_id: portal.id,
        title: `Relance téléphonique satisfaction — ${label}`,
        observation: `Aucune réponse après les relances email J+2 et J+4 pour ${text(portal.entity_name) || email}.`,
        proposed_solution: "Contacter la partie prenante par téléphone et consigner le résultat de la relance.",
        status: "open",
        created_by: null,
      });
      if (phoneError) failed += 1;
      else phoneTasksCreated += 1;
    }
    details.push({ session_id: session.id, entity_key: portal.entity_key, stakeholder_type: stakeholderType, status: finalizeError ? "sent_evidence_finalize_failed" : "sent", stage });
  }

  return NextResponse.json({
    ok: failed === 0,
    execute,
    date: today,
    due,
    processed,
    skipped,
    failed,
    reminder_offsets_days: REMINDER_OFFSETS_DAYS,
    response_window_days: RESPONSE_WINDOW_DAYS,
    phone_tasks_created: phoneTasksCreated,
    phone_tasks_closed: phoneTasksClosed,
    details,
  }, { status: failed === 0 ? 200 : 207 });
}

export async function POST(req: Request) {
  return GET(req);
}
