import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import {
  prepareDailyStakeholderSatisfactionEmail,
  sendDailyStakeholderSatisfactionEmail,
} from "@/lib/server/dailyStakeholderSatisfactionEmails";

const COMMUNICATION_TYPE = "stakeholder_satisfaction_request";
const REMINDER_DAYS = 3;
const OPEN_OFFSET_DAYS = 10;
const RESPONSE_WINDOW_DAYS = 30;

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
  entity_key: string;
  entity_name: string | null;
  entity_email: string | null;
  token: string;
  status: string;
  expires_at: string | null;
};
type ResponseRow = { session_id: string; entity_key: string };
type CommunicationRow = {
  session_id: string | null;
  recipient_email: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

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

function entityMatches(row: CommunicationRow, portal: PortalRow) {
  return row.session_id === portal.session_id
    && text(row.recipient_email).toLowerCase() === text(portal.entity_email).toLowerCase()
    && text(row.metadata?.stakeholder_type) === "company"
    && text(row.metadata?.entity_key) === portal.entity_key;
}

function latestSuccessfulCommunication(rows: CommunicationRow[], portal: PortalRow) {
  return rows
    .filter((row) => entityMatches(row, portal) && ["sent", "delivered"].includes(row.status))
    .sort((a, b) => new Date(b.sent_at ?? b.created_at).getTime() - new Date(a.sent_at ?? a.created_at).getTime())[0] ?? null;
}

function alreadyQueuedToday(rows: CommunicationRow[], portal: PortalRow, today: string) {
  return rows.some((row) =>
    entityMatches(row, portal)
    && ["queued", "sent", "delivered"].includes(row.status)
    && text(row.metadata?.automation_day) === today,
  );
}

export async function GET(req: Request) {
  const access = authorized(req);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const requestUrl = new URL(req.url);
  const execute = requestUrl.searchParams.get("execute") === "1";
  const today = dateInParis();
  const latestEndDate = shiftDate(today, -OPEN_OFFSET_DAYS);
  const earliestEndDate = shiftDate(today, -(OPEN_OFFSET_DAYS + RESPONSE_WINDOW_DAYS));
  const admin = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,internal_reference,end_date,daily_formations(title)")
    .gte("end_date", earliestEndDate)
    .lte("end_date", latestEndDate)
    .neq("status", "archived")
    .order("end_date", { ascending: true });
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  const sessions = (sessionData ?? []) as SessionRow[];
  if (sessions.length === 0) {
    return NextResponse.json({ ok: true, execute, date: today, due: 0, processed: 0, skipped: 0, failed: 0 });
  }
  const sessionIds = sessions.map((session) => session.id);

  const [portalsResult, responsesResult, communicationsResult] = await Promise.all([
    admin
      .from("daily_portal_access_tokens")
      .select("id,session_id,entity_key,entity_name,entity_email,token,status,expires_at")
      .in("session_id", sessionIds)
      .eq("portal_type", "enterprise")
      .in("status", ["pending", "viewed"]),
    admin
      .from("daily_stakeholder_satisfaction_responses")
      .select("session_id,entity_key")
      .in("session_id", sessionIds)
      .eq("stakeholder_type", "company"),
    admin
      .from("daily_communications")
      .select("session_id,recipient_email,status,sent_at,created_at,metadata")
      .in("session_id", sessionIds)
      .eq("communication_type", COMMUNICATION_TYPE)
      .in("status", ["queued", "sent", "delivered", "failed"]),
  ]);

  const readError = portalsResult.error ?? responsesResult.error ?? communicationsResult.error;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const portals = (portalsResult.data ?? []) as PortalRow[];
  const responses = (responsesResult.data ?? []) as ResponseRow[];
  const communications = (communicationsResult.data ?? []) as CommunicationRow[];
  const responseKeys = new Set(responses.map((row) => `${row.session_id}:${row.entity_key}`));
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));

  let due = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const details: Array<{ session_id: string; entity_key: string; status: string; reminder?: boolean }> = [];

  for (const portal of portals) {
    const session = sessionMap.get(portal.session_id);
    if (!session?.end_date) {
      skipped += 1;
      continue;
    }
    if (!text(portal.entity_email)) {
      skipped += 1;
      details.push({ session_id: portal.session_id, entity_key: portal.entity_key, status: "missing_email" });
      continue;
    }
    if (portal.expires_at && new Date(portal.expires_at).getTime() < Date.now()) {
      skipped += 1;
      details.push({ session_id: portal.session_id, entity_key: portal.entity_key, status: "portal_expired" });
      continue;
    }
    if (responseKeys.has(`${portal.session_id}:${portal.entity_key}`)) {
      skipped += 1;
      details.push({ session_id: portal.session_id, entity_key: portal.entity_key, status: "already_submitted" });
      continue;
    }
    if (alreadyQueuedToday(communications, portal, today)) {
      skipped += 1;
      details.push({ session_id: portal.session_id, entity_key: portal.entity_key, status: "already_queued_today" });
      continue;
    }

    const availableFrom = shiftDate(session.end_date, OPEN_OFFSET_DAYS);
    const closesOn = shiftDate(availableFrom, RESPONSE_WINDOW_DAYS);
    if (!availableFrom || today < availableFrom || today > closesOn) {
      skipped += 1;
      continue;
    }

    const latest = latestSuccessfulCommunication(communications, portal);
    const latestDay = latest ? dateInParis(new Date(latest.sent_at ?? latest.created_at)) : null;
    if (latestDay && daysBetween(latestDay, today) < REMINDER_DAYS) {
      skipped += 1;
      details.push({ session_id: portal.session_id, entity_key: portal.entity_key, status: "reminder_not_due" });
      continue;
    }

    const reminder = Boolean(latest);
    due += 1;
    if (!execute) {
      details.push({ session_id: portal.session_id, entity_key: portal.entity_key, status: "due", reminder });
      continue;
    }

    const formation = one(session.daily_formations);
    const formationTitle = text(formation?.title) || "Formation Selen Daily";
    const sessionReference = text(session.internal_reference) || formationTitle;
    const email = text(portal.entity_email).toLowerCase();
    const satisfactionUrl = new URL(`/daily/portail/enterprise/${portal.token}/satisfaction`, requestUrl.origin).toString();
    const emailInput = {
      email,
      recipientName: text(portal.entity_name),
      formationTitle,
      sessionReference,
      satisfactionUrl,
      reminder,
    };
    const prepared = prepareDailyStakeholderSatisfactionEmail(emailInput);

    const { data: communication, error: evidenceError } = await admin
      .from("daily_communications")
      .insert({
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
        metadata: {
          automation_day: today,
          stakeholder_type: "company",
          entity_key: portal.entity_key,
          portal_access_id: portal.id,
          reminder,
          available_from: availableFrom,
          response_window_days: RESPONSE_WINDOW_DAYS,
        },
      })
      .select("id")
      .single();

    if (evidenceError || !communication) {
      failed += 1;
      details.push({ session_id: session.id, entity_key: portal.entity_key, status: "evidence_failed", reminder });
      continue;
    }

    const sent = await sendDailyStakeholderSatisfactionEmail(emailInput);
    if (!sent.sent) {
      const failedAt = new Date().toISOString();
      await admin
        .from("daily_communications")
        .update({ status: "failed", failed_at: failedAt, failure_reason: sent.reason })
        .eq("organisation_id", session.organisation_id)
        .eq("id", communication.id);
      failed += 1;
      details.push({ session_id: session.id, entity_key: portal.entity_key, status: sent.reason, reminder });
      continue;
    }

    const sentAt = new Date().toISOString();
    const { error: finalizeError } = await admin
      .from("daily_communications")
      .update({
        provider_message_id: sent.message.providerMessageId,
        status: "sent",
        sent_at: sentAt,
        failed_at: null,
        failure_reason: null,
      })
      .eq("organisation_id", session.organisation_id)
      .eq("id", communication.id);

    processed += 1;
    details.push({
      session_id: session.id,
      entity_key: portal.entity_key,
      status: finalizeError ? "sent_evidence_finalize_failed" : "sent",
      reminder,
    });
  }

  return NextResponse.json(
    {
      ok: failed === 0,
      execute,
      date: today,
      due,
      processed,
      skipped,
      failed,
      cadence_days: REMINDER_DAYS,
      opens_after_days: OPEN_OFFSET_DAYS,
      response_window_days: RESPONSE_WINDOW_DAYS,
      details,
    },
    { status: failed === 0 ? 200 : 207 },
  );
}

export async function POST(req: Request) {
  return GET(req);
}
