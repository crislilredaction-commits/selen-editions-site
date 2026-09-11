"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

type ActorType = "organisation" | "trainer";
type DecisionStatus = "pending" | "agent_review" | "accepted";
type DecisionRow = {
  id: string;
  actor_type: ActorType;
  decision: "accepted" | "refused";
  comment?: string | null;
  decided_at: string;
};
type SessionRow = {
  id: string;
  formation_id: string;
  internal_reference?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
};
type RegistrationRequest = {
  id: string;
  formation_id: string;
  applicant_label: string;
  formation_title: string;
  response_type: "beneficiary" | "company";
  respondent_email?: string | null;
  company_name?: string | null;
  participants?: unknown;
  adaptation_needed?: boolean | null;
  submitted_at?: string | null;
  attached_session_id?: string | null;
  materialized_at?: string | null;
  materialized_count?: number;
  decision_status: DecisionStatus;
  accepted_at?: string | null;
  agent_review_requested_at?: string | null;
  can_decide: boolean;
  can_materialize?: boolean;
  decisions: DecisionRow[];
};
type ResponseBody = { requests?: RegistrationRequest[]; sessions?: SessionRow[]; actor_types?: ActorType[]; materialized?: boolean; error?: string };

function statusLabel(status: DecisionStatus) {
  if (status === "accepted") return "Acceptée";
  if (status === "agent_review") return "Transmise à Selen";
  return "À décider";
}
function participantCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}
function sessionLabel(session: SessionRow) {
  const dates = session.start_date ? `${new Date(`${session.start_date}T12:00:00`).toLocaleDateString("fr-FR")}${session.end_date && session.end_date !== session.start_date ? ` → ${new Date(`${session.end_date}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}` : "dates à préciser";
  return `${session.internal_reference || "Session"} · ${dates}`;
}

export default function RegistrationRequestsPage() {
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [actorTypes, setActorTypes] = useState<ActorType[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const isManager = actorTypes.includes("organisation");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/client/daily/registration-requests", { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as ResponseBody;
      if (!response.ok) throw new Error(body.error ?? "Impossible de charger les candidatures.");
      const nextRequests = body.requests ?? [];
      const nextSessions = body.sessions ?? [];
      setRequests(nextRequests);
      setSessions(nextSessions);
      setActorTypes(body.actor_types ?? []);
      setSelectedSessions((current) => {
        const next = { ...current };
        for (const request of nextRequests) {
          if (next[request.id]) continue;
          const compatible = nextSessions.filter((session) => session.formation_id === request.formation_id);
          const preferred = compatible.find((session) => session.id === request.attached_session_id) ?? compatible[0];
          if (preferred) next[request.id] = preferred.id;
        }
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pending = useMemo(() => requests.filter((request) => request.decision_status === "pending"), [requests]);
  const history = useMemo(() => requests.filter((request) => request.decision_status !== "pending"), [requests]);

  async function decide(request: RegistrationRequest, decision: "accepted" | "refused") {
    const actorType: ActorType = actorTypes.includes("organisation") ? "organisation" : "trainer";
    const wording = decision === "accepted"
      ? `Accepter la candidature de ${request.applicant_label} ? Un seul accord OF ou formateur suffit et la candidature sera immédiatement considérée comme acceptée.`
      : `Refuser la candidature de ${request.applicant_label} ? Aucun refus n'est automatique : le dossier sera transmis à Selen pour revue.`;
    if (!window.confirm(wording)) return;
    const comment = window.prompt("Commentaire facultatif", "") ?? "";
    setBusyId(request.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/client/daily/registration-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: request.id, actor_type: actorType, decision, comment }),
      });
      const body = await response.json().catch(() => ({})) as ResponseBody;
      if (!response.ok) throw new Error(body.error ?? "Décision impossible.");
      if (decision === "accepted") {
        if (body.materialized) setMessage("Candidature acceptée et inscription créée automatiquement dans la session.");
        else if (isManager) setMessage("Candidature acceptée. Choisissez maintenant la session pour créer l'inscription sans ressaisie.");
        else setMessage("Candidature acceptée. L'organisme choisira la session pour finaliser l'inscription.");
      } else {
        setMessage("Refus enregistré. La candidature est maintenant transmise à Selen pour revue.");
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Décision impossible.");
    } finally {
      setBusyId("");
    }
  }

  async function materialize(request: RegistrationRequest) {
    const sessionId = selectedSessions[request.id] ?? "";
    if (!sessionId) return setError("Choisissez la session dans laquelle inscrire le candidat.");
    setBusyId(request.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/client/daily/registration-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "materialize", request_id: request.id, session_id: sessionId }),
      });
      const body = await response.json().catch(() => ({})) as ResponseBody;
      if (!response.ok) throw new Error(body.error ?? "Inscription impossible.");
      setMessage("Inscription créée dans la session. Les données du candidat sont maintenant rangées dans Apprenants et dans le dossier de session.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inscription impossible.");
    } finally {
      setBusyId("");
    }
  }

  if (loading) return <LoadingMascot message="Sélion rassemble les candidatures…" />;

  return (
    <main style={s.page}>
      <header style={s.hero}>
        <div>
          <p style={s.kicker}>Selen Daily · Candidatures</p>
          <h1 style={s.h1}>Validez les demandes d'inscription</h1>
          <p style={s.lead}>L'accord de l'organisme <strong>ou</strong> du formateur affecté suffit. Une fois la candidature acceptée, Daily crée l'apprenant et son inscription dans la session sans ressaisie.</p>
        </div>
        <div style={s.metric}><strong>{pending.length}</strong><span>à décider</span></div>
      </header>

      {error ? <p role="alert" style={s.error}>{error}</p> : null}
      {message ? <p role="status" style={s.success}>{message}</p> : null}

      {pending.length === 0 ? (
        <section style={s.empty}><strong>Aucune candidature n'attend votre décision.</strong><p style={s.muted}>Les nouvelles demandes apparaîtront ici automatiquement.</p></section>
      ) : (
        <section style={s.list} aria-label="Candidatures à décider">
          {pending.map((request) => (
            <article key={request.id} style={s.card}>
              <div style={s.cardHead}><span style={s.pendingBadge}>À décider</span><span style={s.date}>{request.submitted_at ? new Date(request.submitted_at).toLocaleString("fr-FR") : ""}</span></div>
              <h2 style={s.h2}>{request.applicant_label}</h2>
              <p style={s.formation}>{request.formation_title}</p>
              <div style={s.metaGrid}>
                <span><strong>Demande :</strong> {request.response_type === "company" ? "Entreprise" : "Bénéficiaire"}</span>
                {request.respondent_email ? <span><strong>Email :</strong> {request.respondent_email}</span> : null}
                {participantCount(request.participants) ? <span><strong>Participants :</strong> {participantCount(request.participants)}</span> : null}
                <span><strong>Session :</strong> {request.attached_session_id ? "déjà ciblée" : "à définir après accord"}</span>
                {request.adaptation_needed ? <span style={s.attention}><strong>Attention :</strong> besoin d'adaptation signalé</span> : null}
              </div>
              <div style={s.actions}>
                <button type="button" disabled={busyId === request.id} style={s.accept} onClick={() => void decide(request, "accepted")}>{busyId === request.id ? "Enregistrement…" : "Accepter la candidature"}</button>
                <button type="button" disabled={busyId === request.id} style={s.refuse} onClick={() => void decide(request, "refused")}>Refuser et transmettre à Selen</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {history.length ? (
        <section style={s.history}>
          <h2 style={s.sectionTitle}>Décisions récentes</h2>
          <div style={s.list}>
            {history.map((request) => {
              const compatibleSessions = sessions.filter((session) => session.formation_id === request.formation_id);
              return (
                <article key={request.id} style={s.historyCard}>
                  <div style={s.cardHead}>
                    <strong>{request.applicant_label}</strong>
                    <span style={request.materialized_at ? s.createdBadge : request.decision_status === "accepted" ? s.acceptedBadge : s.reviewBadge}>
                      {request.materialized_at ? "Inscription créée" : statusLabel(request.decision_status)}
                    </span>
                  </div>
                  <p style={s.muted}>{request.formation_title}</p>
                  {request.materialized_at ? (
                    <p style={s.createdText}>{request.materialized_count ?? 0} inscription{(request.materialized_count ?? 0) > 1 ? "s" : ""} liée{(request.materialized_count ?? 0) > 1 ? "s" : ""} à cette candidature.</p>
                  ) : request.decision_status === "accepted" && isManager ? (
                    <div style={s.materializeBox}>
                      <strong>Choisir la session</strong>
                      {compatibleSessions.length ? (
                        <>
                          <select value={selectedSessions[request.id] ?? ""} onChange={(event) => setSelectedSessions((current) => ({ ...current, [request.id]: event.target.value }))} style={s.select}>
                            <option value="">Choisir une session</option>
                            {compatibleSessions.map((session) => <option key={session.id} value={session.id}>{sessionLabel(session)}</option>)}
                          </select>
                          <button type="button" disabled={busyId === request.id} style={s.accept} onClick={() => void materialize(request)}>{busyId === request.id ? "Création…" : "Créer l'inscription dans cette session"}</button>
                        </>
                      ) : <p style={s.muted}>Aucune session compatible n'est encore disponible pour cette formation.</p>}
                    </div>
                  ) : request.decision_status === "accepted" ? (
                    <p style={s.muted}>Candidature acceptée. L'organisme choisira la session avant création de l'inscription.</p>
                  ) : null}
                  {request.decisions[0]?.comment ? <p style={s.comment}>« {request.decisions[0].comment} »</p> : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:{maxWidth:980,margin:"0 auto",padding:"2rem 1rem 5rem",color:"var(--ink)"},hero:{display:"flex",justifyContent:"space-between",gap:18,alignItems:"center",padding:"1.4rem",border:"1px solid var(--sepia-mid)",background:"var(--paper)",marginBottom:16},kicker:{margin:0,fontWeight:800,color:"var(--rust)",textTransform:"uppercase",letterSpacing:".12em",fontSize:11},h1:{margin:".35rem 0 .5rem",fontSize:"clamp(1.9rem,4vw,2.7rem)"},h2:{margin:".6rem 0 .25rem",fontSize:22},lead:{margin:0,maxWidth:720,lineHeight:1.55},metric:{minWidth:110,textAlign:"center",display:"grid",gap:2,padding:"1rem",border:"1px solid var(--sepia-mid)",background:"rgba(255,250,240,.75)"},list:{display:"grid",gap:12},card:{padding:"1.1rem",border:"1px solid var(--sepia-mid)",background:"rgba(255,250,240,.82)"},historyCard:{padding:".85rem 1rem",border:"1px solid var(--sepia-mid)",background:"rgba(255,250,240,.62)"},cardHead:{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"},pendingBadge:{padding:".22rem .5rem",background:"#fff3d7",border:"1px solid #b5792d",fontWeight:800,fontSize:12},acceptedBadge:{padding:".22rem .5rem",background:"#eef7e6",border:"1px solid #71875d",fontWeight:800,fontSize:12},createdBadge:{padding:".22rem .5rem",background:"#e7f5df",border:"1px solid #55713f",color:"#3f5f2d",fontWeight:800,fontSize:12},reviewBadge:{padding:".22rem .5rem",background:"#fff0e8",border:"1px solid #9a6b32",fontWeight:800,fontSize:12},date:{fontSize:13,color:"var(--sepia-dark)"},formation:{margin:"0 0 .8rem",fontWeight:700,color:"var(--rust)"},metaGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:8,lineHeight:1.45},attention:{color:"#8a2e22"},actions:{display:"flex",flexWrap:"wrap",gap:8,marginTop:16},accept:{border:"1px solid #60784c",background:"#60784c",color:"white",padding:".7rem .9rem",fontWeight:800,cursor:"pointer"},refuse:{border:"1px solid #9a412f",background:"transparent",color:"#7b2f21",padding:".7rem .9rem",fontWeight:800,cursor:"pointer"},history:{marginTop:28},sectionTitle:{fontSize:22,marginBottom:10},comment:{margin:".4rem 0 0",fontStyle:"italic"},materializeBox:{marginTop:12,padding:12,border:"1px solid var(--sepia-mid)",background:"rgba(246,239,224,.7)",display:"grid",gap:8},select:{width:"100%",padding:".65rem",border:"1px solid var(--sepia-mid)",background:"var(--paper)"},createdText:{margin:".45rem 0 0",color:"#49643e",fontWeight:700},empty:{padding:"1.4rem",border:"1px dashed var(--sepia-mid)",background:"rgba(255,250,240,.6)"},muted:{margin:".3rem 0",color:"var(--sepia-dark)"},error:{padding:".8rem",border:"1px solid #9a412f",color:"#7b2f21",background:"#fff4ef"},success:{padding:".8rem",border:"1px solid #71875d",color:"#49643e",background:"#f5fff0"}
};
