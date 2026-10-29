"use client";

import { useEffect, useState } from "react";

import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Session = {
  id: string;
  internal_reference?: string | null;
  daily_formations?: { title?: string | null } | { title?: string | null }[] | null;
};

type Learner = { first_name?: string | null; last_name?: string | null; email?: string | null };
type Enrolment = { id: string; daily_learners?: Learner | Learner[] | null };
type Evidence = { id: string; enrolment_id: string; logical_name: string; status: string; version: number; created_at: string };

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formationLabel(session: Session) {
  return one(session.daily_formations)?.title || session.internal_reference || "Session Daily";
}

function learnerLabel(enrolment: Enrolment) {
  const learner = one(enrolment.daily_learners);
  return [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant";
}

export default function DailyEvaluationEvidencePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [enrolmentId, setEnrolmentId] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await assistanceFetch("/api/client/daily/end-evaluations", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? "Chargement impossible.");
      setSessions(data.sessions ?? []);
    })();
  }, []);

  useEffect(() => {
    setEnrolments([]);
    setEvidence([]);
    setEnrolmentId("");
    if (!sessionId) return;

    void (async () => {
      const response = await assistanceFetch(`/api/client/daily/end-evaluations?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? "Chargement des apprenants impossible.");
      setEnrolments(data.overview?.enrolments ?? []);
      setEvidence(data.overview?.evidence ?? []);
    })();
  }, [sessionId]);

  async function upload() {
    if (!sessionId || !enrolmentId || !file) {
      setError("Choisissez la session, l’apprenant et le fichier à déposer.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const body = new FormData();
    body.set("session_id", sessionId);
    body.set("enrolment_id", enrolmentId);
    body.set("file", file);
    const stableRequestId = requestId || crypto.randomUUID();
    setRequestId(stableRequestId);
    body.set("request_id", stableRequestId);

    const response = await assistanceFetch("/api/client/daily/end-evaluations/evidence", {
      method: "POST",
      body,
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(data.error ?? "Téléversement impossible.");
      return;
    }

    setFile(null);
    setRequestId("");
    const input = document.getElementById("evaluation-evidence-file") as HTMLInputElement | null;
    if (input) input.value = "";
    setMessage("La preuve d’évaluation a été enregistrée. La version précédente reste dans l’historique.");
    const refresh = await assistanceFetch(`/api/client/daily/end-evaluations?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const refreshed = await refresh.json().catch(() => ({}));
    if (refresh.ok) setEvidence(refreshed.overview?.evidence ?? []);
  }

  const currentEvidence = evidence.find((item) => item.enrolment_id === enrolmentId);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem 4rem", color: "#3f2b1d" }}>
      <p style={{ fontWeight: 800, color: "#8a4b24" }}>Selen Daily · Évaluation des acquis</p>
      <h1>Déposer une évaluation réalisée hors Selen</h1>
      <p style={{ maxWidth: 760 }}>
        Si l’évaluation a été réalisée sur papier ou avec un autre outil, déposez ici sa copie. Un PDF ou une photo suffit pour la V1. La pièce est conservée dans le dossier de la session et passe au contrôle Selen.
      </p>

      {error ? <p style={{ padding: ".8rem", border: "1px solid #8a4b24", background: "#fff7f0" }}>{error}</p> : null}
      {message ? <p style={{ padding: ".8rem", border: "1px solid #6a8a4a", background: "#f8fff3" }}>{message}</p> : null}

      <section style={{ display: "grid", gap: "1rem", padding: "1.2rem", border: "1px solid #d8b989", background: "#fffaf0" }}>
        {currentEvidence ? <div style={{ padding: ".8rem", border: "1px solid #d8b989", background: "#fffdf7" }}>
          <strong>Preuve actuelle · version {currentEvidence.version}</strong>
          <div style={{ marginTop: ".35rem" }}>
            <a href={`/api/client/daily/end-evaluations/evidence?document_id=${encodeURIComponent(currentEvidence.id)}`} target="_blank" rel="noreferrer">Consulter {currentEvidence.logical_name}</a>
          </div>
          <small>Un nouveau dépôt remplacera cette version sans supprimer son historique.</small>
        </div> : null}

        <label style={{ display: "grid", gap: ".4rem" }}>
          Session
          <select value={sessionId} onChange={(event) => { setSessionId(event.target.value); setRequestId(""); }} style={{ padding: ".75rem" }}>
            <option value="">Choisir une session</option>
            {sessions.map((session) => <option key={session.id} value={session.id}>{formationLabel(session)}</option>)}
          </select>
        </label>

        <label style={{ display: "grid", gap: ".4rem" }}>
          Apprenant
          <select value={enrolmentId} onChange={(event) => { setEnrolmentId(event.target.value); setRequestId(""); }} disabled={!sessionId} style={{ padding: ".75rem" }}>
            <option value="">Choisir un apprenant</option>
            {enrolments.map((enrolment) => <option key={enrolment.id} value={enrolment.id}>{learnerLabel(enrolment)}</option>)}
          </select>
        </label>

        <label style={{ display: "grid", gap: ".4rem" }}>
          Copie de l’évaluation
          <input
            id="evaluation-evidence-file"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); setRequestId(""); }}
          />
          <small>PDF, JPG ou PNG · 10 Mo maximum.</small>
        </label>

        <button type="button" disabled={busy || !file || !sessionId || !enrolmentId} onClick={() => void upload()} style={{ width: "fit-content", padding: ".75rem 1rem", fontWeight: 800 }}>
          {busy ? "Dépôt en cours…" : currentEvidence ? "Remplacer la preuve actuelle" : "Téléverser dans Selen"}
        </button>
      </section>
    </main>
  );
}
