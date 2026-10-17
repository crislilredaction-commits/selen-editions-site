import DailyStakeholderWorkspace from "@/components/daily/DailyStakeholderWorkspace";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { verifyAgentAssistance } from "@/lib/server/agentAssistance";
import {DAILY_PORTAL_RESOURCE_STATUSES,DAILY_PORTAL_RESOURCE_TYPES,isDailyPortalResourceVisible} from "@/lib/server/dailyPortalResourceVisibility";

type Props = {
  params: Promise<{ accessId: string }>;
  searchParams: Promise<{ assistanceToken?: string }>;
};

type RelatedLearner = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

function related<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function email(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export default async function DelegatedPortalPreview({ params, searchParams }: Props) {
  const { accessId } = await params;
  const token = String((await searchParams).assistanceToken ?? "").trim();
  const admin = getAdminSupabase();
  const assistance = await verifyAgentAssistance(admin, token);
  const scope = String(assistance?.metadata?.scope ?? "");
  const scopedAccessId = String(assistance?.metadata?.portal_access_id ?? "");
  const exactPortalPreview = scope === "portal_preview" && scopedAccessId === accessId;
  const delegatedWorkspace = scope === "daily_workspace";
  if (!assistance || (!exactPortalPreview && !delegatedWorkspace)) {
    notFound();
  }

  const { data: access } = await admin
    .from("daily_portal_access_tokens")
    .select("id,session_id,portal_type,entity_key,entity_name,entity_email,status,expires_at,viewed_at")
    .eq("id", accessId)
    .in("portal_type", ["learner", "trainer"])
    .maybeSingle();
  const expired = Boolean(access?.expires_at && new Date(access.expires_at).getTime() < Date.now());
  if (!access || ["revoked", "expired"].includes(String(access.status ?? "")) || expired) notFound();

  const { data: session } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,internal_reference,start_date,end_date,modality,location_address,remote_url,status,daily_formations(id,title,global_objective)")
    .eq("id", access.session_id)
    .eq("organisation_id", assistance.organisation_id)
    .neq("status", "archived")
    .maybeSingle();
  if (!session) notFound();

  const { data: enrolments } = await admin
    .from("daily_session_enrolments")
    .select("id,learner_id,status,positioning_status,prerequisites_status,daily_learners(id,first_name,last_name,email)")
    .eq("session_id", session.id)
    .eq("organisation_id", assistance.organisation_id)
    .not("status", "in", "(declined,cancelled,abandoned)");
  const rows = enrolments ?? [];
  const targetEmail = email(access.entity_email);
  const learner = access.portal_type === "learner"
    ? rows.find((row) => {
        const linked = related(row.daily_learners) as RelatedLearner | null;
        return access.entity_key === `learner:${row.learner_id}` || Boolean(targetEmail && email(linked?.email) === targetEmail);
      }) ?? null
    : null;
  if (access.portal_type === "learner" && !learner) notFound();

  const {data:resourceRows}=await admin.from("daily_documents").select("id,document_type,linked_object_type,linked_object_id,logical_name,created_at,metadata,session_id,enrolment_id,learner_id").eq("organisation_id",assistance.organisation_id).eq("is_current",true).in("status",DAILY_PORTAL_RESOURCE_STATUSES).in("document_type",DAILY_PORTAL_RESOURCE_TYPES).order("created_at",{ascending:false});
  const resources=(resourceRows??[]).filter(resource=>isDailyPortalResourceVisible({resource,role:access.portal_type,sessionId:session.id,enrolmentIds:learner?[String(learner.id)]:[],learnerIds:learner?[String(learner.learner_id)]:[]}));

  const { data: followup } = access.portal_type === "trainer"
    ? await admin
        .from("daily_session_followup_entries")
        .select("id,entry_type,level,summary,status,created_at")
        .eq("session_id", session.id)
        .eq("organisation_id", assistance.organisation_id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  const headerList = await headers();
  await admin.from("selen_agent_assistance_logs").insert({
    assistance_token_id: assistance.id,
    agent_user_id: assistance.agent_user_id,
    agent_email: assistance.agent_email,
    organisation_id: assistance.organisation_id,
    dossier_id: assistance.dossier_id,
    action: "delegated_portal_viewed",
    action_label: `Espace ${access.portal_type === "learner" ? "apprenant" : "formateur"} consulté en délégation`,
    ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip"),
    user_agent: headerList.get("user-agent"),
    metadata: { mode: "agent_assistance", scope: "portal_preview", portal_access_id: access.id, session_id: session.id },
  });


  const previewData = {
    access: { portalType: access.portal_type, entityName: access.entity_name, entityEmail: access.entity_email },
    session,
    enrolment: learner,
    participants: access.portal_type === "trainer" ? rows.map(row => {
      const person = related(row.daily_learners) as RelatedLearner | null;
      return { id: row.id, first_name: person?.first_name, last_name: person?.last_name, email: person?.email };
    }) : [],
    participantProgress: access.portal_type === "trainer" ? rows.map(row => {
      const person = related(row.daily_learners) as RelatedLearner | null;
      return { id: row.id, firstName: person?.first_name, lastName: person?.last_name, email: person?.email, positioningStatus: row.positioning_status, prerequisitesStatus: row.prerequisites_status };
    }) : [],
  };
  const documentBaseUrl = exactPortalPreview
    ? `/daily/assistance/portail/${encodeURIComponent(accessId)}/document?assistanceToken=${encodeURIComponent(token)}&id=`
    : undefined;
  return <DailyStakeholderWorkspace role={access.portal_type} token="" preview={{ data: previewData, resources: resources.map(resource => ({ ...resource, id: resource.id })), followup: followup ?? [], documentBaseUrl }} />;
}
