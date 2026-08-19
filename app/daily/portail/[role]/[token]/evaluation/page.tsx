"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";

type Question = {
  id: string;
  label: string;
  type: "single_choice" | "multiple_choice" | "free_text";
  options: string[];
  points: number;
  required: boolean;
  order: number;
};

type Assessment = {
  mode: string;
  title: string;
  instructions: string;
  endDate: string;
  available: boolean;
  submitted: boolean;
  submittedAt: string | null;
  autoScore: number | null;
  scoreMax: number | null;
  requiresManualReview: boolean;
  questions: Question[];
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-FR");
}

export default function LearnerAssessmentPage({ params }: { params: { role: string; token: string } }) {
  const { role, token } = params;
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/daily-portal/${token}/assessment`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      setLoading(false);
      if (!response.ok) {
        setError(payload?.error ?? "Évaluation indisponible.");
        return;
      }
      setAssessment(payload.assessment);
    }
    void load();
  }, [token]);

  const orderedQuestions = useMemo(
    () => [...(assessment?.questions ?? [])].sort((a, b) => a.order - b.order),
    [assessment?.questions],
  );

  function setSingle(questionId: string, value: string) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  function toggleMultiple(questionId: string, value: string) {
    setAnswers((current) => {
      const selected = Array.isArray(current[questionId]) ? current[questionId] as string[] : [];
      return {
        ...current,
        [questionId]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
      };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!assessment || sending) return;
    setSending(true);
    setError("");
    setSuccess("");

    const response = await fetch(`/api/daily-portal/${token}/assessment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const payload = await response.json().catch(() => null);
    setSending(false);
    if (!response.ok) {
      setError(payload?.error ?? "La transmission a échoué.");
      return;
    }

    setAssessment((current) => current ? {
      ...current,
      submitted: true,
      submittedAt: payload.submittedAt ?? new Date().toISOString(),
      autoScore: payload.autoScore ?? null,
      scoreMax: payload.scoreMax ?? null,
      requiresManualReview: Boolean(payload.requiresManualReview),
      questions: [],
    } : current);
    setSuccess("Votre évaluation a bien été transmise. Le formateur pourra maintenant la valider.");
  }

  return (
    <main className="gazette-paper" style={styles.page}>
      <Header />
      <section style={styles.hero}>
        <p className="gazette-label">Selen Daily · Évaluation des acquis</p>
        <h1 style={styles.title}>{assessment?.title || "Évaluation de fin de formation"}</h1>
        <p style={styles.subtitle}>Questionnaire individuel accessible depuis votre espace apprenant.</p>
      </section>

      <section style={styles.content}>
        {loading ? <article style={styles.card}>Chargement de votre évaluation…</article> : null}
        {error ? <p style={styles.error}>{error}</p> : null}
        {success ? <p style={styles.success}>{success}</p> : null}

        {assessment && assessment.mode !== "selen_quiz" ? (
          <article style={styles.card}>
            <strong>Évaluation réalisée avec votre formateur</strong>
            <span>Cette formation utilise une évaluation externe à Selen. Votre formateur conserve et transmettra la preuve correspondante.</span>
          </article>
        ) : null}

        {assessment?.submitted ? (
          <article style={styles.card}>
            <strong>Évaluation transmise</strong>
            <span>Transmission : {formatDate(assessment.submittedAt)}</span>
            {assessment.scoreMax !== null && assessment.autoScore !== null ? (
              <span>Partie automatiquement corrigée : {assessment.autoScore} / {assessment.scoreMax} points.</span>
            ) : null}
            {assessment.requiresManualReview ? <span>Une ou plusieurs réponses libres doivent encore être relues par le formateur.</span> : null}
            <a href={`/daily/portail/${role}/${token}`} style={styles.link}>Retour à mon espace</a>
          </article>
        ) : null}

        {assessment && assessment.mode === "selen_quiz" && !assessment.available && !assessment.submitted ? (
          <article style={styles.card}>
            <strong>Disponible le dernier jour</strong>
            <span>Le questionnaire sera accessible ici à partir du {assessment.endDate || "dernier jour de la formation"}.</span>
            <a href={`/daily/portail/${role}/${token}`} style={styles.link}>Retour à mon espace</a>
          </article>
        ) : null}

        {assessment && assessment.mode === "selen_quiz" && assessment.available && !assessment.submitted ? (
          <form onSubmit={submit} style={styles.form}>
            {assessment.instructions ? <article style={styles.info}>{assessment.instructions}</article> : null}
            {orderedQuestions.map((question, index) => (
              <article key={question.id} style={styles.card}>
                <div style={styles.questionHeader}>
                  <strong>{index + 1}. {question.label}</strong>
                  <span style={styles.points}>{question.points} pt{question.points > 1 ? "s" : ""}</span>
                </div>
                {question.required ? <small style={styles.muted}>Réponse obligatoire</small> : null}

                {question.type === "free_text" ? (
                  <textarea
                    value={typeof answers[question.id] === "string" ? answers[question.id] as string : ""}
                    onChange={(event) => setSingle(question.id, event.target.value)}
                    rows={5}
                    style={styles.textarea}
                    placeholder="Votre réponse"
                  />
                ) : null}

                {question.type === "single_choice" ? (
                  <div style={styles.options}>
                    {question.options.map((option) => (
                      <label key={option} style={styles.option}>
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          checked={answers[question.id] === option}
                          onChange={() => setSingle(question.id, option)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                ) : null}

                {question.type === "multiple_choice" ? (
                  <div style={styles.options}>
                    {question.options.map((option) => {
                      const selected = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : [];
                      return (
                        <label key={option} style={styles.option}>
                          <input
                            type="checkbox"
                            value={option}
                            checked={selected.includes(option)}
                            onChange={() => toggleMultiple(question.id, option)}
                          />
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            ))}

            <div style={styles.actions}>
              <a href={`/daily/portail/${role}/${token}`} style={styles.secondary}>Retour</a>
              <button type="submit" disabled={sending} style={styles.primary}>
                {sending ? "Transmission…" : "Transmettre mon évaluation"}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "1rem", color: "var(--ink)" },
  hero: { maxWidth: 860, margin: "1rem auto", display: "grid", gap: "0.5rem" },
  title: { color: "var(--ink)", margin: 0, fontSize: "clamp(1.7rem, 4vw, 2.6rem)" },
  subtitle: { color: "var(--ink-soft)", lineHeight: 1.6, margin: 0 },
  content: { maxWidth: 860, margin: "1rem auto 3rem", display: "grid", gap: "1rem" },
  form: { display: "grid", gap: "1rem" },
  card: { display: "grid", gap: "0.7rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", padding: "1rem", lineHeight: 1.5 },
  info: { background: "rgba(178,138,98,0.10)", border: "1px solid var(--sepia-mid)", padding: "1rem", lineHeight: 1.6 },
  questionHeader: { display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" },
  points: { color: "var(--rust)", fontWeight: 800, whiteSpace: "nowrap" },
  muted: { color: "var(--ink-soft)" },
  options: { display: "grid", gap: "0.55rem" },
  option: { display: "flex", gap: "0.6rem", alignItems: "flex-start", cursor: "pointer", padding: "0.45rem 0" },
  textarea: { width: "100%", resize: "vertical", boxSizing: "border-box", border: "1px solid var(--sepia-mid)", background: "var(--paper)", color: "var(--ink)", padding: "0.8rem", font: "inherit", lineHeight: 1.5 },
  actions: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" },
  primary: { border: 0, background: "var(--rust)", color: "var(--paper)", padding: "0.8rem 1rem", fontWeight: 800, cursor: "pointer" },
  secondary: { color: "var(--rust)", fontWeight: 800, textDecoration: "none" },
  link: { color: "var(--rust)", fontWeight: 800, textDecoration: "none" },
  error: { border: "1px solid var(--rust)", background: "rgba(138,75,36,0.08)", color: "var(--rust)", padding: "0.75rem" },
  success: { border: "1px solid var(--olive)", background: "rgba(84,110,72,0.08)", color: "var(--ink)", padding: "0.75rem" },
};
