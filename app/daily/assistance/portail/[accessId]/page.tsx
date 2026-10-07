import type { CSSProperties } from "react";
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

function personName(value: RelatedLearner | null | undefined) {
  return [value?.first_name, value?.last_name]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export default async function DelegatedPortalPreview({ params, searchParams }: Props) {
  const { accessId } = await params;
  const token = String((await searchParams).assistanceToken ?? "").trim();
  const admin = getAdminSupabase();
  const assistance = await verifyAgentAssistance(admin, token);
  const scopedAccessId = String(assistance?.metadata?.portal_access_id ?? "");
  if (!assistance || assistance.metadata?.scope !== "portal_preview" || scopedAccessId !== accessId) {
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

  const formation = related(session.daily_formations) as { title?: string | null; global_objective?: string | null } | null;
  const learnerIdentity = learner ? related(learner.daily_learners) as RelatedLearner | null : null;

  return <main style={s.page}>
    <header style={s.hero}>
      <p style={s.kicker}>Consultation déléguée · {access.portal_type === "learner" ? "espace apprenant" : "espace formateur"}</p>
      <h1 style={s.title}>{formation?.title || session.internal_reference || "Session Daily"}</h1>
      <p style={s.lead}>Contexte OF vérifié. Cette vue est strictement en lecture seule : aucune réponse, signature, présence, évaluation, satisfaction ou réclamation ne peut être créée au nom du titulaire.</p>
    </header>

    <section style={s.grid}>
      <article style={s.card}>
        <h2 style={s.h2}>Titulaire de l’espace</h2>
        <p><strong>{access.entity_name || personName(learnerIdentity) || "Identité non renseignée"}</strong></p>
        <p style={s.muted}>{access.entity_email || learnerIdentity?.email || "Email non renseigné"}</p>
        <p style={s.muted}>Statut du lien : {access.status}{access.viewed_at ? " · déjà ouvert par le titulaire" : " · non encore ouvert par le titulaire"}</p>
      </article>
      <article style={s.card}>
        <h2 style={s.h2}>Session</h2>
        <p><strong>Dates :</strong> {session.start_date || "à préciser"}{session.end_date ? ` → ${session.end_date}` : ""}</p>
        <p><strong>Modalité :</strong> {session.modality || "à préciser"}</p>
        <p><strong>Lieu :</strong> {session.location_address || session.remote_url || "à préciser"}</p>
        {formation?.global_objective ? <p><strong>Objectif :</strong> {formation.global_objective}</p> : null}
      </article>

      {learner ? <article style={{ ...s.card, ...s.full }}>
        <h2 style={s.h2}>Avancement de l’apprenant</h2>
        <div style={s.row}><span>Inscription</span><strong>{learner.status}</strong></div>
        <div style={s.row}><span>Positionnement</span><strong>{learner.positioning_status || "not_started"}</strong></div>
        <div style={s.row}><span>Prérequis</span><strong>{learner.prerequisites_status || "not_reviewed"}</strong></div>
      </article> : null}

      {access.portal_type === "trainer" ? <>
        <article style={{ ...s.card, ...s.full }}>
          <h2 style={s.h2}>Participants visibles par le formateur</h2>
          {rows.length === 0 ? <p style={s.muted}>Aucun inscrit actif.</p> : rows.map((row) => { const item = related(row.daily_learners) as RelatedLearner | null; return <div key={row.id} style={s.row}><span>{personName(item) || item?.email || "Apprenant"}</span><strong>{row.positioning_status || "not_started"} · {row.prerequisites_status || "not_reviewed"}</strong></div>; })}
        </article>
        <article style={{ ...s.card, ...s.full }}>
          <h2 style={s.h2}>Suivi de session</h2>
          {(followup ?? []).length === 0 ? <p style={s.muted}>Aucune entrée de suivi.</p> : (followup ?? []).map((entry) => <div key={entry.id} style={s.row}><span>{entry.summary}</span><strong>{entry.entry_type} · {entry.status}</strong></div>)}
        </article>
      </> : null}
      <article style={{ ...s.card, ...s.full }}>
        <h2 style={s.h2}>Ressources disponibles</h2>
        {resources.length===0?<p style={s.muted}>Aucune ressource disponible dans cet espace.</p>:resources.map(resource=><div key={resource.id} style={s.row}><span>{resource.logical_name}</span><a href={`/daily/assistance/portail/${encodeURIComponent(access.id)}/document?assistanceToken=${encodeURIComponent(token)}&id=${encodeURIComponent(resource.id)}`} target="_blank" rel="noreferrer">Consulter</a></div>)}
      </article>
    </section>
  </main>;
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1040, margin: "0 auto", padding: "2rem 1rem 5rem", color: "#3e2a1f" },
  hero: { display: "grid", gap: 8, marginBottom: 16, padding: "1.4rem", border: "1px solid #c8a87a", background: "#fff8e8" },
  kicker: { margin: 0, color: "#8a4b24", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", fontSize: 12 },
  title: { margin: 0, fontSize: "clamp(1.8rem,4vw,2.5rem)" },
  lead: { margin: 0, lineHeight: 1.55, maxWidth: 820 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 12 },
  card: { padding: 18, border: "1px solid #c8a87a", background: "#fffdf8" },
  full: { gridColumn: "1 / -1" },
  h2: { margin: "0 0 10px", fontSize: 20 },
  muted: { color: "#765d49", lineHeight: 1.45 },
  row: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid #ead8ba" },
};
