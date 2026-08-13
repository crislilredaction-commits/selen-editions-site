"use client";

import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Session = { id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; daily_formations?: { title?: string } | { title?: string }[] | null };
type Slot = { id: string; slot_date: string; starts_at: string; ends_at: string; mode: string; status: string; daily_attendance_records?: { enrolment_id: string; status: string }[] };
type Enrolment = { id: string; status: string; daily_learners?: { first_name?: string | null; last_name?: string | null; email?: string | null } | { first_name?: string | null; last_name?: string | null; email?: string | null }[] | null };
type Overview = { slots: Slot[]; enrolments: Enrolment[] };

function formationTitle(session: Session) {
  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  return formation?.title ?? session.internal_reference ?? "Session Daily";
}
function learnerName(enrolment: Enrolment) {
  const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
  return [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant";
}

export default function DailyPresencePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadSessions() {
    const response = await assistanceFetch("/api/client/daily/attendance", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Chargement impossible.");
    setSessions(data.sessions ?? []);
    setSessionId((current) => current || data.sessions?.[0]?.id || "");
  }
  async function loadOverview(id: string) {
    if (!id) return setOverview(null);
    const response = await assistanceFetch(`/api/client/daily/attendance?session_id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Chargement impossible.");
    setOverview(data.overview ?? null);
  }
  useEffect(() => { void loadSessions(); }, []);
  useEffect(() => { void loadOverview(sessionId); }, [sessionId]);

  async function run(payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    const response = await assistanceFetch("/api/client/daily/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Action impossible.");
    if (data.path) {
      const url = `${window.location.origin}${data.path}`;
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      setMessage(`Lien créé et copié : ${url}`);
    } else setMessage("Mise à jour enregistrée.");
    await loadOverview(sessionId);
  }

  return <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1rem 4rem", color: "#3f2b1d" }}>
    <p style={{ fontWeight: 800, color: "#8a4b24" }}>Selen Daily · Pendant la formation</p>
    <h1>Présences & émargements</h1>
    <p>Prépare les créneaux, génère les liens d'émargement et suis les présences.</p>
    {error ? <p style={{ padding: ".7rem", border: "1px solid #8a4b24" }}>{error}</p> : null}
    {message ? <p style={{ padding: ".7rem", border: "1px solid #6a8a4a" }}>{message}</p> : null}
    <section style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", marginBottom: "1rem" }}>
      <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} style={{ width: "100%", padding: ".7rem" }}>
        <option value="">Choisir une session</option>
        {sessions.map((session) => <option key={session.id} value={session.id}>{formationTitle(session)}</option>)}
      </select>
      {sessionId && overview?.slots.length === 0 ? <button disabled={busy} onClick={() => void run({ action: "prepare_session" })} style={{ marginTop: ".8rem", padding: ".7rem" }}>Préparer l'émargement</button> : null}
    </section>
    {overview?.slots.map((slot) => <section key={slot.id} style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", marginBottom: "1rem" }}>
      <h2>{new Date(`${slot.slot_date}T12:00:00`).toLocaleDateString("fr-FR")} · {slot.starts_at.slice(0, 5)}–{slot.ends_at.slice(0, 5)}</h2>
      <p>{slot.mode.replaceAll("_", " ")} · {slot.status}</p>
      {slot.mode !== "distanciel_asynchrone" && slot.status !== "closed" ? <button disabled={busy} onClick={() => void run({ action: "create_link", slot_id: slot.id })} style={{ padding: ".55rem" }}>Créer le lien d'émargement</button> : null}
      <div style={{ marginTop: ".8rem" }}>{overview.enrolments.map((enrolment) => {
        const record = slot.daily_attendance_records?.find((row) => row.enrolment_id === enrolment.id);
        return <div key={enrolment.id} style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap", padding: ".55rem 0", borderTop: "1px solid #ead8bc" }}>
          <strong style={{ minWidth: 180 }}>{learnerName(enrolment)}</strong><span>{record?.status ?? "pending"}</span>
          {slot.mode === "distanciel_asynchrone" && slot.status !== "closed" ? <button disabled={busy} onClick={() => void run({ action: "create_link", slot_id: slot.id, enrolment_id: enrolment.id })}>Lien individuel</button> : null}
          {record?.status !== "present" ? <><button disabled={busy} onClick={() => void run({ action: "set_absence", slot_id: slot.id, enrolment_id: enrolment.id, status: "absent" })}>Absent</button><button disabled={busy} onClick={() => void run({ action: "set_absence", slot_id: slot.id, enrolment_id: enrolment.id, status: "excused" })}>Justifiée</button></> : null}
        </div>;
      })}</div>
      {slot.status !== "closed" ? <button disabled={busy} onClick={() => void run({ action: "close_slot", slot_id: slot.id })} style={{ marginTop: ".8rem" }}>Clore le créneau</button> : null}
    </section>)}
  </main>;
}
