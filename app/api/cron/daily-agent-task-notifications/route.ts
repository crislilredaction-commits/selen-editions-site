import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getActiveDailyTaskOrganisationIds } from "@/lib/server/dailyAgentTaskScope";
import { dailyAgentTaskUrl, sendDailyAgentTaskEmail } from "@/lib/server/dailyAgentTaskEmails";
import { emailDeliveryId } from "@/lib/server/dailyLearnerEmailDelivery";

type Admin = ReturnType<typeof getAdminSupabase>;
type Row = Record<string, any>;
type TaskSource = { organisationId: string; sessionId: string | null; eventAt: string; linkPath: string };
const KINDS = ["daily_checklist", "daily_session_checklist", "daily_program"];
const email = (value: unknown) => typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;

function authorized(req: Request) {
  const expected = process.env.CRON_SECRET?.trim() || process.env.DAILY_AUTOMATION_SECRET?.trim();
  return Boolean(expected && req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() === expected);
}

function recipientsFor(profileId: string | null, agents: Row[], admins: Row[]) {
  const assigned = agents.find(agent => agent.id === profileId && email(agent.email));
  const candidates = assigned ? [assigned] : [...agents.filter(agent => agent.role === "admin"), ...admins];
  return [...new Map(candidates.filter(row => email(row.email)).map(row => [email(row.email)!, { email: email(row.email)!, name: [row.first_name, row.last_name].filter(Boolean).join(" ") }])).values()];
}

async function syncSources(admin: Admin, organisationIds: string[], assignmentByOrg: Map<string, Row>, agents: Row[], organisations: Map<string, Row>) {
  const [organisationItems, sessionItems, formations] = await Promise.all([
    admin.from("daily_organisation_checklist_items").select("id,organisation_id,signaled_at,status").in("organisation_id", organisationIds),
    admin.from("daily_session_checklist_items").select("id,organisation_id,session_id,signaled_at,status,responsibility").in("organisation_id", organisationIds),
    admin.from("daily_formations").select("id,organisation_id,title,status,creation_mode,detailed_program_document_url,agent_review_signaled_at,created_at,updated_at").in("organisation_id", organisationIds),
  ]);
  if (organisationItems.error || sessionItems.error || formations.error) throw new Error("Impossible de vérifier les tâches Daily.");
  const sources = new Map<string, TaskSource>();
  for (const item of organisationItems.data ?? []) {
    const { error } = await admin.rpc("daily_sync_checklist_notification", { p_item_id: item.id });
    if (error) throw new Error("Synchronisation organisme indisponible.");
    if (["to_review", "blocked"].includes(item.status)) sources.set(`daily_checklist:${item.id}`, { organisationId: item.organisation_id, sessionId: null, eventAt: item.signaled_at, linkPath: `/agent/daily/organisations/${item.organisation_id}?tab=checklist` });
  }
  for (const item of sessionItems.data ?? []) {
    const { error } = await admin.rpc("daily_sync_session_checklist_notification", { p_item_id: item.id });
    if (error) throw new Error("Synchronisation session indisponible.");
    if (["todo", "to_review", "blocked"].includes(item.status) && ["selen", "shared"].includes(item.responsibility)) sources.set(`daily_session_checklist:${item.id}`, { organisationId: item.organisation_id, sessionId: item.session_id, eventAt: item.signaled_at, linkPath: "" });
  }
  for (const formation of formations.data ?? []) {
    const sourceKey = `daily_program:${formation.id}`;
    const importedDraft = formation.status === "draft" && formation.creation_mode === "program_import" && Boolean(formation.detailed_program_document_url);
    if (formation.status !== "review" && !importedDraft) {
      const { error } = await admin.from("notifications").update({ dismissed_at: new Date().toISOString() }).eq("source_key", sourceKey).eq("source_kind", "daily_program").is("dismissed_at", null);
      if (error) throw new Error("Clôture de notification indisponible.");
      continue;
    }
    const eventAt = formation.agent_review_signaled_at ?? (importedDraft ? formation.created_at : formation.updated_at);
    const profile = agents.find(agent => agent.id === assignmentByOrg.get(formation.organisation_id)?.agent_profile_id && email(agent.email));
    const linkPath = `/agent/daily/formations/${formation.id}`;
    const org = organisations.get(formation.organisation_id);
    const { error } = await admin.from("notifications").upsert({ id: emailDeliveryId(sourceKey), type: "daily_program", title: importedDraft ? "Programme importé à compléter" : "Programme à contrôler", content: formation.title, organisation_name: org?.legal_name || org?.name || "Organisme Daily", link_path: linkPath,
      source_key: sourceKey, source_kind: "daily_program", target_role: profile ? "agent" : "admin", target_agent_profile_id: profile?.id ?? null, target_user_id: profile?.user_id ?? null, created_at: eventAt, dismissed_at: null,
    }, { onConflict: "id" });
    if (error) throw new Error("Notification de programme indisponible.");
    sources.set(sourceKey, { organisationId: formation.organisation_id, sessionId: null, eventAt, linkPath });
  }
  return sources;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  try {
    const admin = getAdminSupabase();
    const organisationIds = await getActiveDailyTaskOrganisationIds(admin);
    if (!organisationIds.length) return NextResponse.json({ ok: true, due: 0, processed: 0, pending: 0, failed: 0, skipped: 0 });
    const [agentResult, adminResult, assignmentResult, organisationResult] = await Promise.all([
      admin.from("agent_profiles").select("id,user_id,email,first_name,last_name,role").eq("is_active", true),
      admin.from("selen_admin_users").select("email").eq("is_active", true).eq("role", "admin"),
      admin.from("daily_organisation_assignments").select("organisation_id,agent_profile_id").in("organisation_id", organisationIds),
      admin.from("organisations").select("id,name,legal_name").in("id", organisationIds),
    ]);
    if (agentResult.error || adminResult.error || assignmentResult.error || organisationResult.error) throw new Error("Routage des tâches indisponible.");
    const agents = agentResult.data ?? [], admins = adminResult.data ?? [];
    const assignments = new Map<string, Row>((assignmentResult.data ?? []).map(row => [row.organisation_id, row]));
    const organisations = new Map<string, Row>((organisationResult.data ?? []).map(row => [row.id, row]));
    const sources = await syncSources(admin, organisationIds, assignments, agents, organisations);
    let due = 0, processed = 0, pending = 0, failed = 0, skipped = 0;
    // Visit pages after unresolved/unroutable rows. email_sent_at is a summary;
    // the durable event/recipient proof controls retries and reassignments.
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await admin.from("notifications").select("id,title,content,organisation_name,link_path,target_agent_profile_id,source_key,source_kind,email_sent_at,created_at")
        .in("source_kind", KINDS).is("dismissed_at", null).order("id", { ascending: true }).range(offset, offset + 99);
      if (error) throw new Error("File de notifications indisponible.");
      const notifications = data ?? [];
      due += notifications.length;
      for (const notification of notifications) {
        const source = sources.get(notification.source_key);
        if (!source || !source.eventAt || !Number.isFinite(Date.parse(source.eventAt))) { skipped++; continue; }
        const org = organisations.get(source.organisationId);
        if (!org) { skipped++; continue; }
        const recipients = recipientsFor(assignments.get(source.organisationId)?.agent_profile_id ?? null, agents, admins);
        if (!recipients.length) { skipped++; continue; }
        const linkPath = source.linkPath || notification.link_path;
        try { dailyAgentTaskUrl(linkPath); } catch { failed++; continue; }
        if (notification.email_sent_at && Date.parse(notification.email_sent_at) >= Date.parse(source.eventAt)) {
          const { data: evidence, error: historyError } = await admin.from("daily_communications").select("id").eq("organisation_id", source.organisationId).eq("communication_type", "agent_task").contains("metadata", { notification_id: notification.id, event_at: source.eventAt }).limit(1);
          if (historyError) { failed++; continue; }
          if (!evidence?.length) { skipped++; continue; }
        }
        const profile = agents.find(agent => agent.id === assignments.get(source.organisationId)?.agent_profile_id && email(agent.email));
        const { data: routed, error: routingError } = await admin.from("notifications").update({ target_role: profile ? "agent" : "admin", target_agent_profile_id: profile?.id ?? null, target_user_id: profile?.user_id ?? null })
          .eq("id", notification.id).eq("source_key", notification.source_key).eq("created_at", notification.created_at).is("dismissed_at", null).select("id").maybeSingle();
        if (routingError) { failed++; continue; }
        if (!routed) { pending++; continue; }
        const results = [];
        for (const recipient of recipients) results.push(await sendDailyAgentTaskEmail(admin, { email: recipient.email, recipientName: recipient.name, title: notification.title, content: notification.content,
          organisationName: org.legal_name || org.name, organisationId: source.organisationId, sessionId: source.sessionId, notificationId: notification.id, eventAt: source.eventAt, sourceKey: notification.source_key, linkPath }));
        if (results.some(result => result.status === "send_failed")) { failed++; continue; }
        if (results.some(result => result.status === "pending")) { pending++; continue; }
        const sentAt = results.map(result => "sentAt" in result ? result.sentAt : null).filter((value): value is string => typeof value === "string").sort().at(-1);
        if (!sentAt) { pending++; continue; }
        const { data: marked, error: markError } = await admin.from("notifications").update({ email_sent_at: sentAt }).eq("id", notification.id).eq("source_key", notification.source_key).is("dismissed_at", null).select("id").maybeSingle();
        if (markError || !marked) pending++; else processed++;
      }
      if (notifications.length < 100) break;
    }
    return NextResponse.json({ ok: failed === 0 && pending === 0 && skipped === 0, due, processed, pending, failed, skipped, routing: "assigned_agent_else_admins", presence_filter: "not_available_canonically" }, { status: failed || pending || skipped ? 207 : 200 });
  } catch { return NextResponse.json({ error: "Traitement des notifications Daily indisponible." }, { status: 500 }); }
}

export async function POST(req: Request) { return GET(req); }
