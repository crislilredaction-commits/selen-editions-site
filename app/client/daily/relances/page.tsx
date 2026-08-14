"use client";

import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Session = {
  id: string;
  internal_reference?: string | null;
  daily_formations?: { title?: string | null } | { title?: string | null }[] | null;
};
type RecordRow = { enrolment_id: string; status: string };
type Slot = {
  id: string;
  slot_date: string;
  starts_at: string;
  ends_at: string;
  label?: string | null;
  status: string;
  daily_attendance_records?: RecordRow[] | null;
};
type Enrolment = {
  id: string;
  status: string;
  daily_learners?: { first_name?: string | null; last_name?: string | null; email?: string | null } | { first_name?: string | null; last_name?: string | null; email?: string | null }[] | null;
};
type Overview = { slots: Slot[]; enrolments: Enrolment[] };

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formationTitle(session: Session) {
  return one(session.daily_formations)?.title || session.internal_reference || "Session Daily";
}

function learnerLabel(enrolment: Enrolment) {
  const learner = one(enrolment.daily_learners);
  const name = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ").trim();
  return name || learner?.email || "Apprenant";
}

export default function DailyRemindersPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    assistanceFetch("/api/client/daily/attendance", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok) return setError(body.error ?? "Chargement impossible.");
        const rows = (body.sessions ?? []) as Session[];
        setSessions(rows);
        setSessionId(rows[0]?.id ?? "");
      })
      .catch(() => { if (!cancelled) setError("Chargement impossible."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sessionId) { setOverview(null); return; }
    let cancelled = false;
    setError("");
    assistanceFetch(`/api/client/daily/attendance?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok) return setError(body.error ?? "Chargement impossible.");
        setOverview(body.overview ?? null);
      })
      .catch(() => { if (!cancelled) setError("Chargement impossible."); });
    return () => { cancelled = true; };
  }, [sessionId]);

  async function remind(slot: Slot, enrolment: Enrolment) {
    const key = `${slot.id}:${enrolment.id}`;
    setBusyKey(key);
    setError("");
    setMessage("");
    const response = await assistanceFetch("/api/client/daily/attendance/reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, slot_id: slot.id, enrolment_id: enrolment.id }),
    });
    const body = await response.json().catch(() => ({}));
    setBusyKey("");
    if (!response.ok) return setError(body.error ?? "La relance n'a pas pu être envoyée.");
    setMessage(`Relance envoyée à ${body.sentTo}. Un nouveau lien personnel a été généré.`);
  }

  const openSlots = (overview?.slots ?? []).filter((slot) => !["closed", "cancelled"].includes(slot.status));
  const pendingCount = openSlots.reduce((total, slot) => total + (overview?.enrolments ?? []).filter((enrolment) => {
    const record = slot.daily_attendance_records?.find((row) => row.enrolment_id === enrolment.id);
    return record?.status !== "present";
  }).length, 0);

  return (
    <main className="gazette-paper" style={s.page}>
      <header className="gazette-cta" style={s.hero}>
        <p className="gazette-label">Selen Daily · Relances</p>
        <h1 className="gazette-hero-title" style={s.heroTitle}>Relancer un émargement</h1>
        <p style={s.heroText}>Envoyez une relance ciblée uniquement aux apprenants dont la présence reste à confirmer. Chaque relance crée un nouveau lien personnel et invalide l'ancien lien individuel.</p>
      </header>

      <section style={s.panel}>
        <label style={s.label}>Session</label>
        <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} style={s.select}>
          <option value="">Choisir une session</option>
          {sessions.map((session) => <option key={session.id} value={session.id}>{formationTitle(session)}</option>)}
        </select>
        {overview ? <p style={s.muted}>{pendingCount} émargement{pendingCount > 1 ? "s" : ""} encore à confirmer sur les créneaux ouverts.</p> : null}
      </section>

      {error ? <p style={s.error}>{error}</p> : null}
      {message ? <p style={s.notice}>{message}</p> : null}

      {overview && openSlots.length === 0 ? <section style={s.empty}><strong>Aucune relance disponible.</strong><p style={s.muted}>Les créneaux sont clos ou aucun émargement n'est actuellement ouvert.</p></section> : null}

      {openSlots.map((slot) => {
        const pending = overview?.enrolments.filter((enrolment) => {
          const record = slot.daily_attendance_records?.find((row) => row.enrolment_id === enrolment.id);
          return record?.status !== "present";
        }) ?? [];
        return (
          <section key={slot.id} style={s.card}>
            <div style={s.cardHead}>
              <div>
                <strong>{new Date(`${slot.slot_date}T12:00:00`).toLocaleDateString("fr-FR")} · {slot.starts_at.slice(0, 5)} à {slot.ends_at.slice(0, 5)}</strong>
                {slot.label ? <p style={s.muted}>{slot.label}</p> : null}
              </div>
              <span style={s.counter}>{pending.length} à confirmer</span>
            </div>
            {pending.length === 0 ? <p style={s.muted}>Tout le monde a émargé sur ce créneau.</p> : pending.map((enrolment) => {
              const learner = one(enrolment.daily_learners);
              const key = `${slot.id}:${enrolment.id}`;
              return (
                <div key={enrolment.id} style={s.row}>
                  <div>
                    <strong>{learnerLabel(enrolment)}</strong>
                    <div style={s.muted}>{learner?.email || "Aucune adresse e-mail"}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-ink"
                    disabled={busyKey === key || !learner?.email}
                    onClick={() => void remind(slot, enrolment)}
                  >
                    <span>{busyKey === key ? "Envoi..." : "Envoyer une relance"}</span>
                  </button>
                </div>
              );
            })}
          </section>
        );
      })}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", maxWidth: 1000, margin: "0 auto", padding: "2rem 1rem 4rem", color: "var(--ink)" },
  hero: { padding: "1.4rem", marginBottom: "1rem" },
  heroTitle: { margin: ".25rem 0 .55rem", fontSize: "clamp(1.8rem,5vw,3rem)" },
  heroText: { margin: 0, lineHeight: 1.6, maxWidth: 780 },
  panel: { border: "1px solid var(--sepia-mid)", background: "rgba(255,250,240,.82)", padding: "1rem", marginBottom: "1rem" },
  label: { display: "block", fontWeight: 800, marginBottom: ".4rem" },
  select: { width: "100%", padding: ".7rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)", color: "var(--ink)" },
  card: { border: "1px solid var(--sepia-mid)", background: "rgba(255,250,240,.82)", padding: "1rem", marginBottom: ".8rem" },
  cardHead: { display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginBottom: ".5rem" },
  counter: { padding: ".25rem .55rem", border: "1px solid var(--sepia-mid)", fontSize: ".8rem", fontWeight: 800 },
  row: { display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid rgba(201,160,85,.35)", padding: ".8rem 0" },
  muted: { color: "var(--sepia-dark)", margin: ".25rem 0" },
  error: { border: "1px solid #9a412f", color: "#7b2f21", padding: ".8rem" },
  notice: { border: "1px solid #6f8b58", background: "rgba(111,139,88,.08)", padding: ".8rem" },
  empty: { border: "1px solid #6f8b58", background: "rgba(111,139,88,.08)", padding: "1rem" },
};
