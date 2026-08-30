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
type Learner = { first_name?: string | null; last_name?: string | null; email?: string | null };
type Enrolment = { id: string; status: string; daily_learners?: Learner | Learner[] | null };
type Entry = {
  id: string;
  enrolment_id?: string | null;
  entry_type: "incident" | "adaptation" | "note";
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
};
const levelLabels: Record<Entry["level"], string> = {
  info: "Information",
  attention: "À suivre",
  critical: "Critique",
};

export default function TrainerSessionFollowupPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [entryType, setEntryType] = useState<Entry["entry_type"]>("note");
  const [level, setLevel] = useState<Entry["level"]>("attention");
  const [enrolmentId, setEnrolmentId] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedSession = useMemo(() => sessions.find((session) => session.id === sessionId), [sessions, sessionId]);
  const stats = useMemo(() => ({
    notes: entries.filter((entry) => entry.entry_type === "note").length,
    open: entries.filter((entry) => entry.entry_type !== "note" && entry.status === "open").length,
    critical: entries.filter((entry) => entry.entry_type !== "note" && entry.status === "open" && entry.level === "critical").length,
  }), [entries]);

  async function loadSessions() {
    const response = await fetch("/api/client/daily/trainer-followup", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Chargement impossible.");
    setSessions(data.sessions ?? []);
    setSessionId((current) => current || data.sessions?.[0]?.id || "");
  }

  async function loadSession(id: string) {
    if (!id) {
      setEntries([]);
      setEnrolments([]);
      return;
    }
    setError("");
    const response = await fetch(`/api/client/daily/trainer-followup?session_id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Chargement impossible.");
    setEntries(data.entries ?? []);
    setEnrolments(data.enrolments ?? []);
  }

  useEffect(() => { void loadSessions(); }, []);
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
  empty: { margin: 0, padding: "1rem", border: "1px dashed var(--sepia-mid)", borderRadius: 14, color: "var(--ink-soft)" },
  entryHeader: { display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap", alignItems: "flex-start" },
  entryMeta: { margin: ".35rem 0 0", color: "var(--ink-soft)", fontSize: ".82rem", lineHeight: 1.45 },
  entryText: { color: "var(--ink)", lineHeight: 1.55 },
  statusBadge: { display: "inline-flex", alignItems: "center", padding: ".3rem .6rem", border: "1px solid var(--sepia-mid)", borderRadius: 999, background: "rgba(201,160,85,.08)", color: "var(--ink)", fontSize: ".8rem", fontWeight: 750 },
  criticalBadge: { borderColor: "var(--rust)", background: "rgba(138,75,36,.08)", color: "var(--rust)" },
};
