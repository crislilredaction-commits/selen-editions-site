"use client";

import { useEffect, useMemo, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Session = { id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; daily_formations?: { title?: string } | { title?: string }[] | null };
type Learner = { first_name?: string | null; last_name?: string | null; email?: string | null };
type Enrolment = { id: string; status: string; daily_learners?: Learner | Learner[] | null };
type Assessment = { id: string; enrolment_id: string; outcome: string; score?: number | null; score_max?: number | null; method?: string | null; notes?: string | null; assessed_at?: string | null };
type Feedback = { id: string; enrolment_id: string; overall_rating: number; objectives_rating: number; trainer_rating?: number | null; organisation_rating?: number | null; content_rating?: number | null; pace_rating?: number | null; would_recommend?: boolean | null; strengths?: string | null; improvements?: string | null; adaptation_feedback?: string | null; free_comment?: string | null; submitted_at: string };
type QuizQuestion = { id: string; label: string; type: "single_choice" | "multiple_choice" | "free_text"; options?: string[]; correct_answers?: string[]; points?: number; required?: boolean; order?: number };
type QuizResponse = { id: string; enrolment_id: string; question_snapshot: QuizQuestion[]; answers: Record<string, string | string[]>; auto_score?: number | null; score_max?: number | null; requires_manual_review: boolean; submitted_at: string };
type Overview = { enrolments: Enrolment[]; assessments: Assessment[]; feedback: Feedback[]; quizResponses: QuizResponse[] };

const EMPTY_OVERVIEW: Overview = { enrolments: [], assessments: [], feedback: [], quizResponses: [] };

function formationTitle(session: Session) {
  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  return formation?.title ?? session.internal_reference ?? "Session Daily";
}
function learnerValue(enrolment?: Enrolment) {
  const value = enrolment ? (Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners) : null;
  return value ?? null;
}
function learnerName(enrolment?: Enrolment) {
  const value = learnerValue(enrolment);
  return [value?.first_name, value?.last_name].filter(Boolean).join(" ") || value?.email || "Apprenant";
}
function answerText(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Sans réponse";
  return value?.trim() || "Sans réponse";
}
function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-FR");
}

export default function DailyEndEvaluationsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [overview, setOverview] = useState<Overview>(EMPTY_OVERVIEW);
  const [drafts, setDrafts] = useState<Record<string, Partial<Assessment>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await assistanceFetch("/api/client/daily/end-evaluations", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? "Chargement impossible.");
      setSessions(data.sessions ?? []);
      setSessionId((current) => current || data.sessions?.[0]?.id || "");
    })();
  }, []);

  async function load(id: string) {
    if (!id) return setOverview(EMPTY_OVERVIEW);
    setError(""); setMessage(""); setGeneratedLink("");
    const response = await assistanceFetch(`/api/client/daily/end-evaluations?session_id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Chargement impossible.");
    const next = data.overview ?? EMPTY_OVERVIEW;
    setOverview({
      enrolments: next.enrolments ?? [],
      assessments: next.assessments ?? [],
      feedback: next.feedback ?? [],
      quizResponses: next.quizResponses ?? [],
    });
    setDrafts(Object.fromEntries((next.assessments ?? []).map((item: Assessment) => [item.enrolment_id, item])));
  }
  useEffect(() => { void load(sessionId); }, [sessionId]);

  const feedbackByEnrolment = useMemo(() => new Map(overview.feedback.map((item) => [item.enrolment_id, item])), [overview.feedback]);
  const quizByEnrolment = useMemo(() => new Map(overview.quizResponses.map((item) => [item.enrolment_id, item])), [overview.quizResponses]);

  async function prepare() {
    setBusy(true); setError(""); setMessage("");
    const response = await assistanceFetch("/api/client/daily/end-evaluations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", session_id: sessionId }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Préparation impossible.");
    setMessage("Les évaluations de fin sont prêtes pour les apprenants actifs.");
    await load(sessionId);
  }

  async function saveAssessment(enrolmentId: string) {
    const draft = drafts[enrolmentId] ?? {};
    setBusy(true); setError(""); setMessage("");
    const response = await assistanceFetch("/api/client/daily/end-evaluations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_assessment", session_id: sessionId, enrolment_id: enrolmentId, outcome: draft.outcome ?? "pending", score: draft.score ?? null, score_max: draft.score_max ?? null, method: draft.method ?? "", notes: draft.notes ?? "" }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Évaluation impossible à enregistrer.");
    setMessage("Évaluation des acquis enregistrée.");
    await load(sessionId);
  }

  async function createFeedbackLink(enrolmentId: string) {
    setBusy(true); setError(""); setMessage(""); setGeneratedLink("");
    const response = await assistanceFetch("/api/client/daily/end-evaluations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_feedback_link", session_id: sessionId, enrolment_id: enrolmentId }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Lien impossible à générer.");
    const origin = window.location.origin;
    const link = `${origin}${data.path}`;
    setGeneratedLink(link);
    try { await navigator.clipboard.writeText(link); setMessage("Lien de satisfaction copié dans le presse-papiers."); } catch { setMessage("Lien de satisfaction généré."); }
  }

  async function sendFeedbackRequest(enrolmentId: string) {
    setBusy(true); setError(""); setMessage(""); setGeneratedLink("");
    const response = await assistanceFetch("/api/client/daily/end-evaluations/send-satisfaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, enrolment_id: enrolmentId }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Demande de satisfaction impossible à envoyer.");
    const proof = data.evidenceRecorded === false
      ? " L’e-mail est parti, mais la preuve technique doit être contrôlée par Selen."
      : " L’envoi est conservé dans Communications.";
    setMessage(`Questionnaire envoyé à ${data.sentTo}.${proof}`);
  }

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1rem 4rem", color: "#3f2b1d" }}>
    <p style={{ fontWeight: 800, color: "#8a4b24" }}>Selen Daily · Fin de formation</p>
    <h1>Évaluation des acquis & satisfaction</h1>
    <p>Prépare les évaluations, enregistre le résultat de chaque apprenant et collecte son retour de satisfaction. Daily peut envoyer le lien individuel directement à l’adresse enregistrée et conserver la preuve du message.</p>
    {error ? <p style={{ padding: ".7rem", border: "1px solid #8a4b24" }}>{error}</p> : null}
    {message ? <p style={{ padding: ".7rem", border: "1px solid #6a8a4a" }}>{message}</p> : null}
    {generatedLink ? <p style={{ wordBreak: "break-all", padding: ".7rem", background: "#fffaf0", border: "1px solid #d8b989" }}>{generatedLink}</p> : null}

    <section style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", marginBottom: "1rem", display: "flex", gap: ".7rem", flexWrap: "wrap", alignItems: "end" }}>
      <label style={{ display: "grid", gap: ".4rem", minWidth: 260 }}>Session<select value={sessionId} onChange={(event) => setSessionId(event.target.value)} style={{ padding: ".7rem" }}><option value="">Choisir une session</option>{sessions.map((session) => <option key={session.id} value={session.id}>{formationTitle(session)}</option>)}</select></label>
      {sessionId ? <button type="button" disabled={busy} onClick={() => void prepare()} style={{ padding: ".7rem .9rem", fontWeight: 800 }}>Préparer les évaluations</button> : null}
    </section>

    {overview.enrolments.length === 0 && sessionId ? <p>Aucun apprenant actif dans cette session.</p> : null}
    <section style={{ display: "grid", gap: "1rem" }}>
      {overview.enrolments.map((enrolment) => {
        const current = drafts[enrolment.id] ?? { outcome: "pending" };
        const feedback = feedbackByEnrolment.get(enrolment.id);
        const quiz = quizByEnrolment.get(enrolment.id);
        const questions = [...(quiz?.question_snapshot ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return <article key={enrolment.id} style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", borderRadius: 12, display: "grid", gap: ".75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: ".7rem", flexWrap: "wrap" }}><strong>{learnerName(enrolment)}</strong><span>{feedback ? `Satisfaction reçue · ${feedback.overall_rating}/5` : "Satisfaction en attente"}</span></div>

          {quiz ? <details open={Boolean(quiz.requires_manual_review && current.outcome === "pending")} style={{ padding: ".85rem", border: "1px solid #d8b989", borderRadius: 10, background: "#fffdf7" }}>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>
              Questionnaire Selen transmis{quiz.auto_score != null && quiz.score_max != null ? ` · score automatique ${quiz.auto_score}/${quiz.score_max}` : ""}
            </summary>
            <p style={{ marginBottom: ".65rem", color: "#6d5746", fontSize: ".9rem" }}>
              Reçu le {formatDate(quiz.submitted_at)}. {quiz.requires_manual_review ? "Les réponses libres nécessitent une appréciation humaine." : "Le score automatique aide à la lecture mais ne décide pas du résultat pédagogique."} Le résultat final reste à valider ci-dessous.
            </p>
            <div style={{ display: "grid", gap: ".6rem" }}>
              {questions.map((question, index) => <div key={question.id || index} style={{ padding: ".7rem", borderLeft: "3px solid #d8b989", background: "#fffaf0" }}>
                <strong style={{ display: "block", marginBottom: ".35rem" }}>{index + 1}. {question.label}</strong>
                <div style={{ fontSize: ".9rem" }}><strong>Réponse apprenant :</strong> {answerText(quiz.answers?.[question.id])}</div>
                {question.type !== "free_text" && (question.correct_answers?.length ?? 0) > 0 ? <div style={{ marginTop: ".25rem", fontSize: ".85rem", color: "#6d5746" }}><strong>Réponse attendue :</strong> {question.correct_answers?.join(", ")}</div> : null}
              </div>)}
            </div>
          </details> : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: ".65rem" }}>
            <label style={{ display: "grid", gap: ".3rem" }}>Résultat<select value={current.outcome ?? "pending"} onChange={(event) => setDrafts((all) => ({ ...all, [enrolment.id]: { ...current, outcome: event.target.value } }))} style={{ padding: ".6rem" }}><option value="pending">À évaluer</option><option value="achieved">Acquis</option><option value="partially_achieved">Partiellement acquis</option><option value="not_achieved">Non acquis</option><option value="not_applicable">Non applicable</option></select></label>
            <label style={{ display: "grid", gap: ".3rem" }}>Score<input type="number" min="0" step="0.01" value={current.score ?? ""} onChange={(event) => setDrafts((all) => ({ ...all, [enrolment.id]: { ...current, score: event.target.value === "" ? null : Number(event.target.value) } }))} style={{ padding: ".6rem" }} /></label>
            <label style={{ display: "grid", gap: ".3rem" }}>Sur<input type="number" min="0.01" step="0.01" value={current.score_max ?? ""} onChange={(event) => setDrafts((all) => ({ ...all, [enrolment.id]: { ...current, score_max: event.target.value === "" ? null : Number(event.target.value) } }))} style={{ padding: ".6rem" }} /></label>
            <label style={{ display: "grid", gap: ".3rem" }}>Méthode<input value={current.method ?? ""} onChange={(event) => setDrafts((all) => ({ ...all, [enrolment.id]: { ...current, method: event.target.value } }))} placeholder="Quiz, mise en situation..." style={{ padding: ".6rem" }} /></label>
          </div>
          <label style={{ display: "grid", gap: ".3rem" }}>Notes<textarea rows={2} value={current.notes ?? ""} onChange={(event) => setDrafts((all) => ({ ...all, [enrolment.id]: { ...current, notes: event.target.value } }))} style={{ padding: ".6rem" }} /></label>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}><button type="button" disabled={busy} onClick={() => void saveAssessment(enrolment.id)} style={{ fontWeight: 800 }}>Enregistrer l'évaluation</button>{!feedback ? <><button type="button" disabled={busy} onClick={() => void sendFeedbackRequest(enrolment.id)} style={{fontWeight:800}}>Envoyer le questionnaire</button><button type="button" disabled={busy} onClick={() => void createFeedbackLink(enrolment.id)}>Créer le lien sans envoi</button></> : null}</div>
          {feedback ? <details><summary>Voir le retour de satisfaction</summary><p>Objectifs : {feedback.objectives_rating}/5 · Formateur : {feedback.trainer_rating ?? "-"}/5 · Organisation : {feedback.organisation_rating ?? "-"}/5 · Contenu : {feedback.content_rating ?? "-"}/5 · Rythme : {feedback.pace_rating ?? "-"}/5</p>{feedback.strengths ? <p><strong>Points forts :</strong> {feedback.strengths}</p> : null}{feedback.improvements ? <p><strong>Améliorations :</strong> {feedback.improvements}</p> : null}{feedback.adaptation_feedback ? <p><strong>Adaptations :</strong> {feedback.adaptation_feedback}</p> : null}{feedback.free_comment ? <p><strong>Commentaire :</strong> {feedback.free_comment}</p> : null}</details> : null}
        </article>;
      })}
    </section>
  </main>;
}
