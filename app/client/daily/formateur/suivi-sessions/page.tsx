"use client";

import { useEffect, useMemo, useState } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type Session = {
  id: string;
  internal_reference?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  daily_formations?: { title?: string | null } | { title?: string | null }[] | null;
};
type Learner = { id?: string; first_name?: string | null; last_name?: string | null; email?: string | null };
type Enrolment = { id: string; learner_id?: string; status: string; positioning_status?: string | null; prerequisites_status?: string | null; daily_learners?: Learner | Learner[] | null };
type SupportNeed = { enrolment_id: string; has_specific_needs: boolean; planned_accommodations?: string | null; contact_requested?: boolean };
type Entry = {
  id: string;
  enrolment_id?: string | null;
  entry_type: "incident" | "adaptation" | "note" | "absence";
  level: "info" | "attention" | "critical";
  occurred_at: string;
  summary: string;
  description?: string | null;
  action_taken?: string | null;
  status: "open" | "resolved";
  author_role?: string | null;
  author_name?: string | null;
};

function formationTitle(session: Session) {
  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  return formation?.title ?? session.internal_reference ?? "Session Daily";
}

function learnerName(enrolment?: Enrolment) {
  if (!enrolment) return "";
  const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
  return [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant";
}

function formatDate(value?: string | null) {
  if (!value) return "Date à préciser";
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR");
}

const typeLabels: Record<Entry["entry_type"], string> = {
  note: "Note de suivi",
  incident: "Incident / cas particulier",
  adaptation: "Adaptation mise en place",
  absence: "Absence signalée",
};
const levelLabels: Record<Entry["level"], string> = {
  info: "Information",
  attention: "À suivre",
  critical: "Critique",
};

export default function TrainerSessionFollowupPage() {
  const [requestedEnrolmentId, setRequestedEnrolmentId] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [supportNeeds, setSupportNeeds] = useState<SupportNeed[]>([]);
  const [entryType, setEntryType] = useState<Entry["entry_type"]>("note");
  const [level, setLevel] = useState<Entry["level"]>("attention");
  const [enrolmentId, setEnrolmentId] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedSession = useMemo(() => sessions.find((session) => session.id === sessionId), [sessions, sessionId]);
  const stats = useMemo(() => ({
    notes: entries.filter((entry) => entry.entry_type === "note").length,
    open: entries.filter((entry) => entry.entry_type !== "note" && entry.status === "open").length,
    critical: entries.filter((entry) => entry.entry_type !== "note" && entry.status === "open" && entry.level === "critical").length,
  }), [entries]);

  async function loadSessions(preferredSessionId = "") {
    const response = await fetch("/api/client/daily/trainer-followup", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Chargement impossible.");
    setSessions(data.sessions ?? []);
    setSessionId((current) => {
      if (current) return current;
      return (data.sessions ?? []).some((session: Session) => session.id === preferredSessionId)
        ? preferredSessionId
        : data.sessions?.[0]?.id || "";
    });
  }

  async function loadSession(id: string) {
    if (!id) {
      setEntries([]);
      setEnrolments([]);
      setSupportNeeds([]);
      return;
    }
    setError("");
    const response = await fetch(`/api/client/daily/trainer-followup?session_id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Chargement impossible.");
    setEntries(data.entries ?? []);
    setEnrolments(data.enrolments ?? []);
    setSupportNeeds(data.supportNeeds ?? []);
    if (requestedEnrolmentId && (data.enrolments ?? []).some((item: Enrolment) => item.id === requestedEnrolmentId)) setEnrolmentId(requestedEnrolmentId);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preferredSessionId = params.get("session") ?? "";
    setRequestedEnrolmentId(params.get("enrolment") ?? "");
    void loadSessions(preferredSessionId);
  }, []);
  useEffect(() => { void loadSession(sessionId); }, [sessionId]);

  async function createEntry() {
    if (!sessionId || !summary.trim()) return setError("Choisissez une session et ajoutez un résumé.");
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/client/daily/trainer-followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: requestId,
        action: "create",
        session_id: sessionId,
        entry_type: entryType,
        level: entryType === "note" ? "info" : level,
        enrolment_id: enrolmentId || null,
        summary,
        description,
        action_taken: entryType === "note" ? null : actionTaken,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Enregistrement impossible.");
    setSummary("");
    setDescription("");
    setActionTaken("");
    setRequestId(crypto.randomUUID());
    setEnrolmentId("");
    setMessage(entryType === "note" ? "Note de suivi enregistrée." : "Élément de suivi enregistré.");
    await loadSession(sessionId);
  }

  async function resolve(entry: Entry) {
    const action = window.prompt("Action réalisée / issue de la situation", entry.action_taken ?? "") ?? "";
    if (!action.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/client/daily/trainer-followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", session_id: sessionId, id: entry.id, action_taken: action }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Mise à jour impossible.");
    setMessage("Situation marquée comme traitée.");
    await loadSession(sessionId);
  }

  return (
    <main className="gazette-paper" style={styles.page}>
      <header style={styles.hero}>
        <p className="gazette-label" style={styles.eyebrow}>Selen Daily · Espace formateur</p>
        <h1 style={styles.title}>Suivi de mes sessions</h1>
        <p style={styles.lead}>
          Consignez une note utile au suivi ou signalez un incident, un cas particulier ou une adaptation mise en place. Les notes restent dans le dossier sans créer de blocage de clôture.
        </p>
      </header>

      {error ? <p role="alert" style={styles.error}>{error}</p> : null}
      {message ? <p role="status" style={styles.success}>{message}</p> : null}

      <section style={styles.summaryGrid} aria-label="Synthèse du suivi de la session">
        <SummaryMetric label="Notes consignées" value={stats.notes} />
        <SummaryMetric label="Situations ouvertes" value={stats.open} />
        <SummaryMetric label="Situations critiques" value={stats.critical} emphasis={stats.critical > 0} />
      </section>

      <SelenCard>
        <SelenCardTitle>Session concernée</SelenCardTitle>
        {sessionId ? <TrainerPedagogicalTools sessionId={sessionId} enrolments={enrolments} /> : null}
        <label style={styles.field}>
          <span style={styles.label}>Session</span>
          <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} style={styles.input}>
            <option value="">Choisir une session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {formationTitle(session)}{session.start_date ? ` · ${formatDate(session.start_date)}` : ""}
              </option>
            ))}
          </select>
        </label>
        {selectedSession ? (
          <p style={styles.sessionMeta}>
            {formatDate(selectedSession.start_date)}{selectedSession.end_date ? ` → ${formatDate(selectedSession.end_date)}` : ""}
          </p>
        ) : null}
      </SelenCard>

      {sessionId ? (
        <section style={styles.section} aria-labelledby="session-learners-title">
          <SelenCard>
            <SelenCardTitle><span id="session-learners-title">Apprenants de la session</span></SelenCardTitle>
            <p style={styles.help}>Fiches en lecture seule, limitées à vos sessions affectées. Les coordonnées et adaptations affichées servent uniquement au suivi pédagogique.</p>
            {enrolments.length === 0 ? <p style={styles.empty}>Aucun apprenant actif dans cette session.</p> : (
              <div style={styles.learnerGrid}>
                {enrolments.map((enrolment) => {
                  const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
                  const support = supportNeeds.find((item) => item.enrolment_id === enrolment.id);
                  return <article key={enrolment.id} id={`learner-${enrolment.id}`} style={{ ...styles.learnerCard, ...(requestedEnrolmentId === enrolment.id ? styles.learnerCardSelected : {}) }}>
                    <div><strong>{learnerName(enrolment)}</strong>{learner?.email ? <p style={styles.entryMeta}>{learner.email}</p> : null}</div>
                    <dl style={styles.learnerFacts}>
                      <div><dt>Inscription</dt><dd>{enrolment.status}</dd></div>
                      <div><dt>Positionnement</dt><dd>{enrolment.positioning_status || "Non démarré"}</dd></div>
                      <div><dt>Prérequis</dt><dd>{enrolment.prerequisites_status || "Non vérifiés"}</dd></div>
                    </dl>
                    {support?.has_specific_needs ? <p style={styles.adaptation}><strong>Adaptation :</strong> {support.planned_accommodations || "À organiser avec l’organisme"}{support.contact_requested ? " · échange demandé" : ""}</p> : null}
                    <a href={`?session=${encodeURIComponent(sessionId)}&enrolment=${encodeURIComponent(enrolment.id)}#learner-${encodeURIComponent(enrolment.id)}`} style={styles.learnerLink}>Ouvrir cette fiche apprenant</a>
                  </article>;
                })}
              </div>
            )}
          </SelenCard>
        </section>
      ) : null}

      {sessionId ? (
        <section style={styles.section}>
          <SelenCard>
            <SelenCardTitle>Ajouter au suivi</SelenCardTitle>
            <p style={styles.help}>
              Une note sert de mémoire de session. Un incident ou une adaptation ouverte remonte aussi dans le suivi Selen tant qu’il n’est pas traité.
            </p>
            <div style={styles.formGrid}>
              <label style={styles.field}>
                <span style={styles.label}>Type</span>
                <select value={entryType} onChange={(event) => setEntryType(event.target.value as Entry["entry_type"])} style={styles.input}>
                  <option value="note">Note libre de suivi</option>
                  <option value="incident">Incident / cas particulier</option>
                  <option value="adaptation">Adaptation mise en place</option>
                  <option value="absence">Absence apprenant à qualifier</option>
                </select>
              </label>
              {entryType !== "note" ? (
                <label style={styles.field}>
                  <span style={styles.label}>Niveau</span>
                  <select value={level} onChange={(event) => setLevel(event.target.value as Entry["level"])} style={styles.input}>
                    <option value="info">Information</option>
                    <option value="attention">À suivre</option>
                    <option value="critical">Critique</option>
                  </select>
                </label>
              ) : null}
              <label style={styles.field}>
                <span style={styles.label}>Apprenant concerné</span>
                <select value={enrolmentId} onChange={(event) => setEnrolmentId(event.target.value)} style={styles.input}>
                  <option value="">Session entière / aucun en particulier</option>
                  {enrolments.map((enrolment) => (
                    <option key={enrolment.id} value={enrolment.id}>{learnerName(enrolment)}</option>
                  ))}
                </select>
              </label>
            </div>
            <label style={styles.fieldSpaced}>
              <span style={styles.label}>Résumé</span>
              <input
                maxLength={240}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder={entryType === "note" ? "Ex. point abordé avec le groupe en fin de matinée" : "Ex. difficulté particulière rencontrée"}
                style={styles.input}
              />
            </label>
            <label style={styles.fieldSpaced}>
              <span style={styles.label}>Détails</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} style={styles.textarea} />
            </label>
            {entryType !== "note" ? (
              <label style={styles.fieldSpaced}>
                <span style={styles.label}>Action déjà mise en place</span>
                <textarea value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} rows={2} style={styles.textarea} />
              </label>
            ) : null}
            <div style={styles.actionRow}>
              <SelenButton type="button" disabled={busy} onClick={() => void createEntry()}>
                {busy ? "Enregistrement…" : "Enregistrer dans le dossier"}
              </SelenButton>
            </div>
          </SelenCard>
        </section>
      ) : null}

      {sessionId ? (
        <section style={styles.historySection}>
          <div>
            <h2 style={styles.sectionTitle}>Historique</h2>
            <p style={styles.help}>Les éléments les plus récents sont affichés en premier.</p>
          </div>
          <div style={styles.historyList}>
            {entries.length === 0 ? (
              <p style={styles.empty}>Aucun élément de suivi enregistré pour cette session.</p>
            ) : entries.map((entry) => {
              const enrolment = enrolments.find((item) => item.id === entry.enrolment_id);
              const operationalOpen = entry.entry_type !== "note" && entry.status === "open";
              return (
                <SelenCard key={entry.id}>
                  <div style={styles.entryHeader}>
                    <div>
                      <SelenCardTitle>{typeLabels[entry.entry_type]} · {entry.summary}</SelenCardTitle>
                      <p style={styles.entryMeta}>
                        {new Date(entry.occurred_at).toLocaleString("fr-FR")}
                        {entry.entry_type !== "note" ? ` · ${levelLabels[entry.level]}` : ""}
                        {enrolment ? ` · ${learnerName(enrolment)}` : ""}
                      </p>
                      <p style={styles.entryMeta}>
                        <strong>Ajouté par :</strong> {entry.author_name || "Auteur non renseigné (historique antérieur)"}{entry.author_role ? ` · ${entry.author_role}` : ""}
                      </p>
                    </div>
                    <span style={{ ...styles.statusBadge, ...(operationalOpen && entry.level === "critical" ? styles.criticalBadge : {}) }}>
                      {entry.entry_type === "note" ? "Consignée" : entry.status === "resolved" ? "Traitée" : "Ouverte"}
                    </span>
                  </div>
                  {entry.description ? <p style={styles.entryText}>{entry.description}</p> : null}
                  {entry.action_taken ? <p style={styles.entryText}><strong>Action :</strong> {entry.action_taken}</p> : null}
                  {operationalOpen ? (
                    <div style={styles.actionRow}>
                      <SelenButton type="button" disabled={busy} onClick={() => void resolve(entry)}>Marquer comme traité</SelenButton>
                    </div>
                  ) : null}
                </SelenCard>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function TrainerPedagogicalTools({sessionId,enrolments}:{sessionId:string;enrolments:Enrolment[]}) {
  const [slots,setSlots]=useState<any[]>([]),[records,setRecords]=useState<any[]>([]),[documents,setDocuments]=useState<any[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function refresh(){const r=await fetch(`/api/client/daily/trainer-session-workspace?session_id=${encodeURIComponent(sessionId)}`,{cache:"no-store"});const d=await r.json().catch(()=>({}));if(r.ok){setSlots(d.slots??[]);setRecords(d.records??[]);setDocuments(d.documents??[])}}
  useEffect(()=>{void refresh()},[sessionId]);
  async function upload(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage("");const fd=new FormData(event.currentTarget);fd.set("session_id",sessionId);const r=await fetch("/api/client/daily/trainer-session-workspace",{method:"POST",body:fd});const d=await r.json().catch(()=>({}));setBusy(false);setMessage(r.ok?"Document enregistré dans la session.":d.error??"Import impossible.");if(r.ok){(event.currentTarget as HTMLFormElement).reset();await refresh()}}
  return <div style={{display:"grid",gap:12,marginBottom:16}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
      <div style={styles.metricCard}><span style={styles.metricLabel}>Créneaux d’émargement</span><strong>{slots.length}</strong></div>
      <div style={styles.metricCard}><span style={styles.metricLabel}>Présences recueillies</span><strong>{records.filter(r=>r.status==="present").length}</strong></div>
      <div style={styles.metricCard}><span style={styles.metricLabel}>Ressources / preuves</span><strong>{documents.length}</strong></div>
    </div>
    <form onSubmit={upload} style={{display:"grid",gap:8,padding:12,border:"1px solid var(--sepia-mid)",borderRadius:12}}>
      <strong>Ressource, feuille papier ou évaluation externe</strong>
      <select name="kind" required style={styles.input}><option value="resource">Ressource pédagogique</option><option value="attendance_paper">Feuille d’émargement signée</option><option value="external_evaluation">Évaluation externe</option></select>
      <input name="title" placeholder="Titre du document" style={styles.input}/>
      <label style={styles.field}><span style={styles.label}>Disponible à partir de (ressource)</span><input name="available_from" type="datetime-local" style={styles.input}/><small style={styles.help}>Laissez vide pour rendre la ressource disponible immédiatement.</small></label>
      <select name="enrolment_id" style={styles.input}><option value="">Session entière</option>{enrolments.map(e=><option key={e.id} value={e.id}>{learnerName(e)}</option>)}</select>
      <select name="slot_id" style={styles.input}><option value="">Créneau si preuve d’émargement</option>{slots.map(s=><option key={s.id} value={s.id}>{s.slot_date} · {String(s.starts_at).slice(0,5)}-{String(s.ends_at).slice(0,5)} {s.label??""}</option>)}</select>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><input name="score" type="number" min="0" max="20" step=".25" placeholder="Note /20 (évaluation)" style={styles.input}/><select name="acquisition_level" style={styles.input}><option value="">Niveau d’acquisition</option><option value="acquis">Acquis</option><option value="en_cours">En cours d’acquisition</option><option value="non_acquis">Non acquis</option></select></div>
      <textarea name="comment" rows={2} placeholder="Commentaire / résultat / précision" style={styles.textarea}/>
      <input name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
      <button disabled={busy} style={{padding:10,fontWeight:800}}>{busy?"Import…":"Importer dans la session"}</button>{message?<small>{message}</small>:null}
    </form>
    {documents.length ? <div style={{display:"grid",gap:8}}><strong>Documents importés</strong>{documents.map(document=>{
      const metadata=document.metadata&&typeof document.metadata==="object"?document.metadata:{};
      const learner=enrolments.find(item=>item.id===document.enrolment_id);
      const availableFrom=typeof metadata.available_from==="string"?metadata.available_from:"";
      const author=typeof metadata.trainer_name==="string"?metadata.trainer_name:"";
      return <article key={document.id} style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",padding:10,border:"1px solid var(--sepia-mid)",borderRadius:10}}><div><strong>{document.logical_name}</strong><p style={styles.entryMeta}>{document.document_type==="trainer_resource"?"Ressource pédagogique":document.document_type==="attendance_paper_evidence"?"Preuve d’émargement":"Évaluation externe"}{learner?` · ${learnerName(learner)}`:" · session entière"}{author?` · ${author}`:""} · importé le {new Date(document.created_at).toLocaleString("fr-FR")}{availableFrom?` · disponible le ${new Date(availableFrom).toLocaleString("fr-FR")}`:""}</p></div><a href={`/api/client/daily/trainer-session-workspace/document?session_id=${encodeURIComponent(sessionId)}&id=${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">Consulter</a></article>})}</div>:null}
    {slots.length?<a href={`/api/client/daily/trainer-session-workspace/attendance-sheet?session_id=${encodeURIComponent(sessionId)}`} target="_blank" rel="noreferrer">Télécharger la feuille d’émargement préremplie</a>:null}
  </div>
}

function SummaryMetric({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <article style={{ ...styles.metricCard, ...(emphasis ? styles.metricCardAlert : {}) }}>
      <span style={styles.metricLabel}>{label}</span>
      <strong style={styles.metricValue}>{value}</strong>
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "2rem 1rem 4rem", color: "var(--ink)" },
  hero: { display: "grid", gap: ".45rem", padding: "1.35rem", marginBottom: "1rem", border: "1px solid var(--sepia-mid)", borderRadius: 18, background: "var(--paper)" },
  eyebrow: { margin: 0, color: "var(--rust)" },
  title: { margin: 0, color: "var(--ink)", fontSize: "clamp(1.9rem,4vw,2.8rem)" },
  lead: { maxWidth: 820, margin: 0, color: "var(--ink-soft)", lineHeight: 1.65 },
  error: { padding: ".8rem 1rem", border: "1px solid var(--rust)", borderRadius: 12, background: "rgba(138,75,36,.08)", color: "var(--rust)" },
  success: { padding: ".8rem 1rem", border: "1px solid rgba(74,122,74,.45)", borderRadius: 12, background: "rgba(74,122,74,.08)", color: "var(--ink)" },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: ".75rem", marginBottom: "1rem" },
  metricCard: { display: "grid", gap: ".25rem", padding: ".9rem 1rem", border: "1px solid var(--sepia-mid)", borderRadius: 14, background: "var(--paper)" },
  metricCardAlert: { borderColor: "var(--rust)", background: "rgba(138,75,36,.06)" },
  metricLabel: { color: "var(--ink-soft)", fontSize: ".82rem" },
  metricValue: { color: "var(--ink)", fontSize: "1.35rem" },
  section: { marginTop: "1rem" },
  historySection: { display: "grid", gap: ".8rem", marginTop: "1.35rem" },
  sectionTitle: { margin: 0, color: "var(--ink)" },
  help: { margin: ".35rem 0 .9rem", color: "var(--ink-soft)", lineHeight: 1.55, fontSize: ".92rem" },
  field: { display: "grid", gap: ".4rem" },
  fieldSpaced: { display: "grid", gap: ".4rem", marginTop: ".8rem" },
  label: { color: "var(--ink)", fontWeight: 750, fontSize: ".9rem" },
  input: { width: "100%", minHeight: 44, boxSizing: "border-box", padding: ".7rem .75rem", border: "1px solid var(--sepia-mid)", borderRadius: 10, background: "var(--paper)", color: "var(--ink)" },
  textarea: { width: "100%", boxSizing: "border-box", padding: ".7rem .75rem", border: "1px solid var(--sepia-mid)", borderRadius: 10, background: "var(--paper)", color: "var(--ink)", resize: "vertical" },
  sessionMeta: { marginBottom: 0, color: "var(--ink-soft)", fontSize: ".9rem" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: ".75rem" },
  actionRow: { display: "flex", justifyContent: "flex-start", marginTop: ".9rem" },
  historyList: { display: "grid", gap: ".75rem" },
  learnerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: ".75rem" },
  learnerCard: { display: "grid", gap: ".65rem", padding: ".9rem", border: "1px solid var(--sepia-mid)", borderRadius: 12, background: "var(--paper)" },
  learnerCardSelected: { borderColor: "var(--rust)", boxShadow: "0 0 0 2px rgba(138,75,36,.12)" },
  learnerFacts: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: ".45rem", margin: 0, fontSize: ".78rem" },
  adaptation: { margin: 0, padding: ".6rem", borderRadius: 8, background: "rgba(210,145,65,.10)", fontSize: ".82rem", lineHeight: 1.45 },
  learnerLink: { color: "var(--rust)", fontWeight: 750, fontSize: ".85rem" },
  empty: { margin: 0, padding: "1rem", border: "1px dashed var(--sepia-mid)", borderRadius: 14, color: "var(--ink-soft)" },
  entryHeader: { display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap", alignItems: "flex-start" },
  entryMeta: { margin: ".35rem 0 0", color: "var(--ink-soft)", fontSize: ".82rem", lineHeight: 1.45 },
  entryText: { color: "var(--ink)", lineHeight: 1.55 },
  statusBadge: { display: "inline-flex", alignItems: "center", padding: ".3rem .6rem", border: "1px solid var(--sepia-mid)", borderRadius: 999, background: "rgba(201,160,85,.08)", color: "var(--ink)", fontSize: ".8rem", fontWeight: 750 },
  criticalBadge: { borderColor: "var(--rust)", background: "rgba(138,75,36,.08)", color: "var(--rust)" },
};
