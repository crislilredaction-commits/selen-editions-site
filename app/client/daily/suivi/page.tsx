"use client";

import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Session = { id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; daily_formations?: { title?: string } | { title?: string }[] | null };
type Learner = { first_name?: string | null; last_name?: string | null; email?: string | null };
type Enrolment = { id: string; status: string; daily_learners?: Learner | Learner[] | null };
type Entry = { id: string; enrolment_id?: string | null; entry_type: "incident" | "adaptation"; level: "info" | "attention" | "critical"; occurred_at: string; summary: string; description?: string | null; action_taken?: string | null; status: "open" | "resolved"; resolved_at?: string | null; author_role?: string | null; author_name?: string | null };

function formationTitle(session: Session) {
  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  return formation?.title ?? session.internal_reference ?? "Session Daily";
}
function learner(enrolment?: Enrolment) {
  if (!enrolment) return null;
  const value = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
  return value ?? null;
}
function learnerName(enrolment?: Enrolment) {
  const value = learner(enrolment);
  return [value?.first_name, value?.last_name].filter(Boolean).join(" ") || value?.email || "Apprenant";
}

export default function DailySessionFollowupPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [entryType, setEntryType] = useState<"incident" | "adaptation">("incident");
  const [level, setLevel] = useState<"info" | "attention" | "critical">("attention");
  const [enrolmentId, setEnrolmentId] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await assistanceFetch("/api/client/daily/followup", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? "Chargement impossible.");
      setSessions(data.sessions ?? []);
      setSessionId((current) => current || data.sessions?.[0]?.id || "");
    })();
  }, []);

  async function load(id: string) {
    if (!id) { setEntries([]); setEnrolments([]); return; }
    setError("");
    const response = await assistanceFetch(`/api/client/daily/followup?session_id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Chargement impossible.");
    setEntries(data.entries ?? []);
    setEnrolments(data.enrolments ?? []);
  }
  useEffect(() => { void load(sessionId); }, [sessionId]);

  async function createEntry() {
    if (!summary.trim()) return setError("Ajoutez un résumé de ce qui s'est passé.");
    setBusy(true); setError(""); setMessage("");
    const response = await assistanceFetch("/api/client/daily/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, action: "create", entry_type: entryType, level, enrolment_id: enrolmentId || null, summary, description, action_taken: actionTaken }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Enregistrement impossible.");
    setSummary(""); setDescription(""); setActionTaken(""); setEnrolmentId("");
    setMessage(entryType === "adaptation" ? "Adaptation enregistrée." : "Incident enregistré.");
    await load(sessionId);
  }

  async function resolve(entry: Entry) {
    const action = window.prompt("Action réalisée / issue de la situation", entry.action_taken ?? "") ?? "";
    if (!action.trim()) return;
    setBusy(true); setError(""); setMessage("");
    const response = await assistanceFetch("/api/client/daily/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, action: "resolve", id: entry.id, action_taken: action }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Mise à jour impossible.");
    setMessage("Suivi clôturé et conservé dans le dossier de session.");
    await load(sessionId);
  }

  return <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1rem 4rem", color: "#3f2b1d" }}>
    <p style={{ fontWeight: 800, color: "#8a4b24" }}>Selen Daily · Pendant la formation</p>
    <h1>Déroulement, incidents & adaptations</h1>
    <p>Consignez uniquement les événements utiles au dossier : difficulté rencontrée, incident ou adaptation effectivement mise en place.</p>
    {error ? <p style={{ padding: ".7rem", border: "1px solid #8a4b24" }}>{error}</p> : null}
    {message ? <p style={{ padding: ".7rem", border: "1px solid #6a8a4a" }}>{message}</p> : null}

    <section style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", marginBottom: "1rem" }}>
      <label style={{ display: "grid", gap: ".4rem" }}>Session
        <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} style={{ padding: ".7rem" }}>
          <option value="">Choisir une session</option>
          {sessions.map((session) => <option key={session.id} value={session.id}>{formationTitle(session)}</option>)}
        </select>
      </label>
    </section>

    {sessionId ? <section style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", marginBottom: "1rem", display: "grid", gap: ".75rem" }}>
      <h2 style={{ margin: 0 }}>Ajouter un élément de suivi</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: ".7rem" }}>
        <label style={{ display: "grid", gap: ".35rem" }}>Type<select value={entryType} onChange={(event) => setEntryType(event.target.value as "incident" | "adaptation")} style={{ padding: ".6rem" }}><option value="incident">Incident / difficulté</option><option value="adaptation">Adaptation mise en place</option></select></label>
        <label style={{ display: "grid", gap: ".35rem" }}>Niveau<select value={level} onChange={(event) => setLevel(event.target.value as "info" | "attention" | "critical")} style={{ padding: ".6rem" }}><option value="info">Information</option><option value="attention">À suivre</option><option value="critical">Critique</option></select></label>
        <label style={{ display: "grid", gap: ".35rem" }}>Apprenant concerné<select value={enrolmentId} onChange={(event) => setEnrolmentId(event.target.value)} style={{ padding: ".6rem" }}><option value="">Session entière / aucun en particulier</option>{enrolments.map((item) => <option key={item.id} value={item.id}>{learnerName(item)}</option>)}</select></label>
      </div>
      <label style={{ display: "grid", gap: ".35rem" }}>Résumé<input maxLength={240} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Ex. support agrandi et pauses supplémentaires" style={{ padding: ".65rem" }} /></label>
      <label style={{ display: "grid", gap: ".35rem" }}>Contexte / description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} style={{ padding: ".65rem" }} /></label>
      <label style={{ display: "grid", gap: ".35rem" }}>Action déjà mise en place<textarea value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} rows={2} style={{ padding: ".65rem" }} /></label>
      <button type="button" disabled={busy} onClick={() => void createEntry()} style={{ width: "fit-content", padding: ".7rem .95rem", fontWeight: 800 }}>Enregistrer</button>
    </section> : null}

    {sessionId ? <section style={{ display: "grid", gap: ".75rem" }}>
      <h2>Historique de la session</h2>
      {entries.length === 0 ? <p>Aucun incident ni adaptation enregistré.</p> : entries.map((entry) => {
        const enrolment = enrolments.find((item) => item.id === entry.enrolment_id);
        return <article key={entry.id} style={{ padding: "1rem", background: "#fffaf0", border: entry.level === "critical" ? "2px solid #8a4b24" : "1px solid #d8b989" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: ".7rem", flexWrap: "wrap" }}><strong>{entry.entry_type === "adaptation" ? "Adaptation" : "Incident"} · {entry.summary}</strong><span>{entry.status === "resolved" ? "Traité" : "Ouvert"}</span></div>
          <p style={{ marginBottom: ".3rem" }}>{new Date(entry.occurred_at).toLocaleString("fr-FR")} · {entry.level}{enrolment ? ` · ${learnerName(enrolment)}` : ""}</p>
          <p style={{ marginTop: 0, color: "#70503b", fontSize: ".9rem" }}><strong>Ajouté par :</strong> {entry.author_name || "Auteur non renseigné (historique antérieur)"}{entry.author_role ? ` · ${entry.author_role}` : ""}</p>
          {entry.description ? <p>{entry.description}</p> : null}
          {entry.action_taken ? <p><strong>Action :</strong> {entry.action_taken}</p> : null}
          {entry.status === "open" ? <button type="button" disabled={busy} onClick={() => void resolve(entry)}>Marquer comme traité</button> : null}
        </article>;
      })}
    </section> : null}
  </main>;
}
