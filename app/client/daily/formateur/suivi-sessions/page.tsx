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

  async function loadSessions() {
    const response = await fetch("/api/client/daily/trainer-followup", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Chargement impossible.");
    setSessions(data.sessions ?? []);
    setSessionId((current) => current || data.sessions?.[0]?.id || "");
  }

  async function loadSession(id: string) {
    if (!id) { setEntries([]); setEnrolments([]); return; }
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
    setBusy(true); setError(""); setMessage("");
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
    setSummary(""); setDescription(""); setActionTaken(""); setEnrolmentId("");
    setMessage(entryType === "note" ? "Note de suivi enregistrée." : "Élément de suivi enregistré.");
    await loadSession(sessionId);
  }

  async function resolve(entry: Entry) {
    const action = window.prompt("Action réalisée / issue de la situation", entry.action_taken ?? "") ?? "";
    if (!action.trim()) return;
    setBusy(true); setError(""); setMessage("");
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
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "2rem 1rem 4rem", color: "var(--ink, #3f2b1d)" }}>
      <p style={{ fontWeight: 800, color: "var(--rust, #8a4b24)" }}>Selen Daily · Espace formateur</p>
      <h1>Suivi de mes sessions</h1>
      <p>Consigne librement une note utile au suivi, ou signale un incident, un cas particulier ou une adaptation mise en place. Les notes restent dans le dossier de la session sans créer de blocage de clôture.</p>

      {error ? <p style={{ padding: ".75rem", border: "1px solid var(--rust, #8a4b24)", borderRadius: 10 }}>{error}</p> : null}
      {message ? <p style={{ padding: ".75rem", border: "1px solid #6a8a4a", borderRadius: 10 }}>{message}</p> : null}

      <SelenCard>
        <SelenCardTitle>Session concernée</SelenCardTitle>
        <label style={{ display: "grid", gap: ".4rem" }}>
          <span>Session</span>
          <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} style={{ padding: ".7rem", borderRadius: 8 }}>
            <option value="">Choisir une session</option>
            {sessions.map((session) => <option key={session.id} value={session.id}>{formationTitle(session)}{session.start_date ? ` · ${new Date(`${session.start_date}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}</option>)}
          </select>
        </label>
        {selectedSession ? <p style={{ marginBottom: 0, opacity: .75 }}>{selectedSession.start_date ? new Date(`${selectedSession.start_date}T12:00:00`).toLocaleDateString("fr-FR") : "Date à préciser"}{selectedSession.end_date ? ` → ${new Date(`${selectedSession.end_date}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}</p> : null}
      </SelenCard>

      {sessionId ? <section style={{ marginTop: "1rem" }}>
        <SelenCard>
          <SelenCardTitle>Ajouter au suivi</SelenCardTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: ".75rem" }}>
            <label style={{ display: "grid", gap: ".35rem" }}>Type
              <select value={entryType} onChange={(event) => setEntryType(event.target.value as Entry["entry_type"])} style={{ padding: ".65rem", borderRadius: 8 }}>
                <option value="note">Note libre de suivi</option>
                <option value="incident">Incident / cas particulier</option>
                <option value="adaptation">Adaptation mise en place</option>
              </select>
            </label>
            {entryType !== "note" ? <label style={{ display: "grid", gap: ".35rem" }}>Niveau
              <select value={level} onChange={(event) => setLevel(event.target.value as Entry["level"])} style={{ padding: ".65rem", borderRadius: 8 }}>
                <option value="info">Information</option>
                <option value="attention">À suivre</option>
                <option value="critical">Critique</option>
              </select>
            </label> : null}
            <label style={{ display: "grid", gap: ".35rem" }}>Apprenant concerné
              <select value={enrolmentId} onChange={(event) => setEnrolmentId(event.target.value)} style={{ padding: ".65rem", borderRadius: 8 }}>
                <option value="">Session entière / aucun en particulier</option>
                {enrolments.map((enrolment) => <option key={enrolment.id} value={enrolment.id}>{learnerName(enrolment)}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: "grid", gap: ".35rem", marginTop: ".75rem" }}>Résumé
            <input maxLength={240} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder={entryType === "note" ? "Ex. point abordé avec le groupe en fin de matinée" : "Ex. difficulté particulière rencontrée"} style={{ padding: ".7rem", borderRadius: 8 }} />
          </label>
          <label style={{ display: "grid", gap: ".35rem", marginTop: ".75rem" }}>Détails
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} style={{ padding: ".7rem", borderRadius: 8 }} />
          </label>
          {entryType !== "note" ? <label style={{ display: "grid", gap: ".35rem", marginTop: ".75rem" }}>Action déjà mise en place
            <textarea value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} rows={2} style={{ padding: ".7rem", borderRadius: 8 }} />
          </label> : null}
          <div style={{ marginTop: ".9rem" }}><SelenButton type="button" disabled={busy} onClick={() => void createEntry()}>Enregistrer dans le dossier</SelenButton></div>
        </SelenCard>
      </section> : null}

      {sessionId ? <section style={{ marginTop: "1.25rem" }}>
        <h2>Historique</h2>
        <div style={{ display: "grid", gap: ".75rem" }}>
          {entries.length === 0 ? <p>Aucun élément de suivi enregistré pour cette session.</p> : entries.map((entry) => {
            const enrolment = enrolments.find((item) => item.id === entry.enrolment_id);
            return <SelenCard key={entry.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
                <SelenCardTitle>{typeLabels[entry.entry_type]} · {entry.summary}</SelenCardTitle>
                {entry.entry_type !== "note" ? <span>{entry.status === "resolved" ? "Traité" : "Ouvert"}</span> : <span>Consignée</span>}
              </div>
              <p style={{ margin: ".35rem 0", opacity: .72 }}>{new Date(entry.occurred_at).toLocaleString("fr-FR")}{entry.entry_type !== "note" ? ` · ${levelLabels[entry.level]}` : ""}{enrolment ? ` · ${learnerName(enrolment)}` : ""}</p>
              {entry.description ? <p>{entry.description}</p> : null}
              {entry.action_taken ? <p><strong>Action :</strong> {entry.action_taken}</p> : null}
              {entry.entry_type !== "note" && entry.status === "open" ? <SelenButton type="button" disabled={busy} onClick={() => void resolve(entry)}>Marquer comme traité</SelenButton> : null}
            </SelenCard>;
          })}
        </div>
      </section> : null}
    </main>
  );
}
