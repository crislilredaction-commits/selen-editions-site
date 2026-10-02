import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { sendDailyAgentTaskEmail } from "@/lib/server/dailyAgentTaskEmails";

type NotificationRow = {
  id: string;
  title: string;
  content: string | null;
  organisation_name: string | null;
  target_role: string | null;
  target_agent_profile_id: string | null;
  source_key: string | null;
  source_kind: string | null;
  email_sent_at: string | null;
};

function authorized(req: Request) {
  const expected = process.env.CRON_SECRET?.trim() || process.env.DAILY_AUTOMATION_SECRET?.trim();
  if (!expected) return false;
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() === expected;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  const admin = getAdminSupabase();

  // La fonction de synchronisation session existe déjà en production. On la rejoue ici
  // pour couvrir les tâches de session sans ajouter/modifier de trigger ou de RLS.
  const { data: sessionItems, error: sessionError } = await admin
    .from("daily_session_checklist_items")
    .select("id")
    .in("status", ["todo", "to_review", "blocked"])
    .in("responsibility", ["shared", "selen"])
    .not("signaled_at", "is", null);
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  for (const item of sessionItems ?? []) {
    const { error } = await admin.rpc("daily_sync_session_checklist_notification", { p_item_id: item.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data, error } = await admin
    .from("notifications")
    .select("id,title,content,organisation_name,target_role,target_agent_profile_id,source_key,source_kind,email_sent_at")
    .in("source_kind", ["daily_checklist", "daily_session_checklist"])
    .is("dismissed_at", null)
    .is("email_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const notifications = (data ?? []) as NotificationRow[];
  const { data: activeAgents, error: agentError } = await admin
    .from("agent_profiles")
    .select("id,email,first_name,last_name,role")
    .eq("is_active", true);
  if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 });
  const { data: activeAdmins, error: adminError } = await admin
    .from("selen_admin_users")
    .select("email")
    .eq("is_active", true)
    .eq("role", "admin");
  if (adminError) return NextResponse.json({ error: adminError.message }, { status: 500 });

  let processed = 0;
  let failed = 0;
  let skipped = 0;
  for (const notification of notifications) {
    const assigned = activeAgents?.find((agent) => agent.id === notification.target_agent_profile_id);
    const recipients = notification.target_agent_profile_id
      ? (assigned?.email ? [{ email: assigned.email, name: [assigned.first_name, assigned.last_name].filter(Boolean).join(" ") }] : [])
      : [
          ...(activeAgents ?? []).filter((agent) => agent.role === "admin" && agent.email).map((agent) => ({ email: agent.email, name: [agent.first_name, agent.last_name].filter(Boolean).join(" ") })),
          ...(activeAdmins ?? []).filter((entry) => entry.email).map((entry) => ({ email: entry.email, name: "" })),
        ];
    const uniqueRecipients = [...new Map(recipients.map((recipient) => [recipient.email.toLowerCase(), recipient])).values()];
    if (!uniqueRecipients.length) { skipped += 1; continue; }

    const sent = await sendDailyAgentTaskEmail({
      email: uniqueRecipients.map((recipient) => recipient.email),
      recipientName: notification.target_agent_profile_id ? uniqueRecipients[0]?.name : "l’équipe Selen",
      title: notification.title,
      content: notification.content,
      organisationName: notification.organisation_name,
    });
    if (!sent.sent) { failed += 1; continue; }
    const { error: markError } = await admin.from("notifications").update({ email_sent_at: new Date().toISOString() }).eq("id", notification.id).is("email_sent_at", null);
    if (markError) failed += 1;
    else processed += 1;
  }

  return NextResponse.json({
    ok: failed === 0,
    due: notifications.length,
    processed,
    failed,
    skipped,
    routing: "assigned_agent_else_admins",
    presence_filter: "not_available_canonically",
  }, { status: failed === 0 ? 200 : 207 });
}

export async function POST(req: Request) {
  return GET(req);
}
