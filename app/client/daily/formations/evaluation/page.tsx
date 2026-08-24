"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type QuestionType = "single_choice" | "multiple_choice" | "free_text";
type Question = {
  id: string;
  label: string;
  type: QuestionType;
  options: string[];
  correct_answers: string[];
  points: number;
  required: boolean;
  order: number;
};
type Formation = {
  id: string;
  title: string;
  status: string;
  version: number;
  learning_assessment_mode: "external" | "selen_quiz";
  learning_assessment_instructions?: string | null;
  learning_assessment_questions?: Question[] | null;
};

function newQuestion(index: number): Question {
  return {
    id: crypto.randomUUID(),
    label: "",
    type: "single_choice",
    options: ["", ""],
    correct_answers: [],
    points: 1,
    required: true,
    order: index + 1,
  };
}

export default function LearningAssessmentBuilderPage() {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [formationId, setFormationId] = useState("");
  const [mode, setMode] = useState<"external" | "selen_quiz">("external");
  const [instructions, setInstructions] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await assistanceFetch("/api/client/daily/formations/learning-assessment", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Chargement impossible.");
      setFormations(data.formations ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => formations.find((formation) => formation.id === formationId) ?? null, [formations, formationId]);

  useEffect(() => {
    if (!selected) {
      setMode("external");
      setInstructions("");
      setQuestions([]);
      return;
    }
    setMode(selected.learning_assessment_mode ?? "external");
    setInstructions(selected.learning_assessment_instructions ?? "");
    setQuestions((selected.learning_assessment_questions ?? []).map((question, index) => ({ ...question, order: index + 1 })));
  }, [selected]);

  function updateQuestion(index: number, patch: Partial<Question>) {
    setQuestions((current) => current.map((question, i) => i === index ? { ...question, ...patch, order: i + 1 } : question));
  }

  function changeType(index: number, type: QuestionType) {
    const question = questions[index];
    if (!question) return;
    updateQuestion(index, {
      type,
      options: type === "free_text" ? [] : question.options.length >= 2 ? question.options : ["", ""],
      correct_answers: type === "free_text" ? [] : question.correct_answers,
    });
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    const question = questions[questionIndex];
    if (!question) return;
    const previous = question.options[optionIndex] ?? "";
    const options = question.options.map((option, index) => index === optionIndex ? value : option);
    const correct_answers = question.correct_answers.map((answer) => answer === previous ? value : answer).filter(Boolean);
    updateQuestion(questionIndex, { options, correct_answers });
  }

  function toggleCorrect(questionIndex: number, option: string, checked: boolean) {
    const question = questions[questionIndex];
    if (!question || !option.trim()) return;
    if (question.type === "single_choice") {
      updateQuestion(questionIndex, { correct_answers: checked ? [option] : [] });
      return;
    }
    updateQuestion(questionIndex, {
      correct_answers: checked
        ? [...new Set([...question.correct_answers, option])]
        : question.correct_answers.filter((answer) => answer !== option),
    });
  }

  async function save() {
    if (!formationId) return setError("Choisissez une formation.");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await assistanceFetch("/api/client/daily/formations/learning-assessment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: formationId, mode, instructions, questions }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      setMessage("Évaluation enregistrée dans une nouvelle version de la formation.");
      await load();
      if (data.formation?.id) setFormationId(data.formation.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "2rem 1rem 4rem", color: "#3f2b1d" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#8a4b24", letterSpacing: ".08em", textTransform: "uppercase" }}>Selen Daily · Formations</p>
        <h1 style={{ marginBottom: ".5rem" }}>Évaluation des acquis</h1>
        <p style={{ maxWidth: 760, margin: 0, lineHeight: 1.6 }}>
          Choisissez si l’évaluation sera réalisée hors Selen ou construisez un questionnaire Daily. Le questionnaire sera ensuite utilisable dans le parcours apprenant de la session.
        </p>
      </header>

      {error ? <div style={{ padding: ".85rem 1rem", border: "1px solid #a35f3c", background: "#fff5ee", marginBottom: "1rem" }}>{error}</div> : null}
      {message ? <div style={{ padding: ".85rem 1rem", border: "1px solid #6d8b53", background: "#f7fff2", marginBottom: "1rem" }}>{message}</div> : null}

      <section style={{ border: "1px solid #d8b989", background: "#fffaf0", padding: "1.2rem", display: "grid", gap: "1rem" }}>
        <label style={{ display: "grid", gap: ".4rem", fontWeight: 700 }}>
          Formation
          <select value={formationId} onChange={(event) => setFormationId(event.target.value)} disabled={loading} style={{ padding: ".75rem", border: "1px solid #d8b989", background: "white" }}>
            <option value="">Choisir une formation</option>
            {formations.map((formation) => <option key={formation.id} value={formation.id}>{formation.title} · v{formation.version}</option>)}
          </select>
        </label>

        {selected ? <>
          <div style={{ display: "grid", gap: ".65rem" }}>
            <strong>Mode d’évaluation</strong>
            <label style={{ display: "flex", gap: ".55rem", alignItems: "flex-start" }}>
              <input type="radio" name="assessment-mode" checked={mode === "external"} onChange={() => setMode("external")} />
              <span><b>Évaluation réalisée hors Selen</b><br /><small>Le formateur déposera ensuite une photo ou un PDF comme preuve.</small></span>
            </label>
            <label style={{ display: "flex", gap: ".55rem", alignItems: "flex-start" }}>
              <input type="radio" name="assessment-mode" checked={mode === "selen_quiz"} onChange={() => setMode("selen_quiz")} />
              <span><b>Questionnaire Selen</b><br /><small>Daily présentera le questionnaire à l’apprenant dans son parcours de fin de formation.</small></span>
            </label>
          </div>

          {mode === "selen_quiz" ? <>
            <label style={{ display: "grid", gap: ".4rem" }}>
              Consignes pour l’apprenant
              <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} style={{ padding: ".75rem", border: "1px solid #d8b989", resize: "vertical" }} placeholder="Ex. Répondez à toutes les questions sans support de cours." />
            </label>

            <div style={{ display: "grid", gap: "1rem" }}>
              {questions.map((question, questionIndex) => (
                <article key={question.id} style={{ border: "1px solid #e0c99d", background: "white", padding: "1rem", display: "grid", gap: ".8rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "center" }}>
                    <strong>Question {questionIndex + 1}</strong>
                    <button type="button" onClick={() => setQuestions((current) => current.filter((_, index) => index !== questionIndex))}>Retirer</button>
                  </div>
                  <input value={question.label} onChange={(event) => updateQuestion(questionIndex, { label: event.target.value })} placeholder="Intitulé de la question" style={{ padding: ".7rem", border: "1px solid #d8b989" }} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: ".8rem" }}>
                    <label style={{ display: "grid", gap: ".35rem" }}>Type
                      <select value={question.type} onChange={(event) => changeType(questionIndex, event.target.value as QuestionType)} style={{ padding: ".65rem" }}>
                        <option value="single_choice">Choix unique</option>
                        <option value="multiple_choice">Choix multiples</option>
                        <option value="free_text">Réponse libre</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: ".35rem" }}>Points
                      <input type="number" min="0.5" step="0.5" value={question.points} onChange={(event) => updateQuestion(questionIndex, { points: Number(event.target.value) || 1 })} style={{ padding: ".65rem" }} />
                    </label>
                  </div>

                  {question.type !== "free_text" ? <div style={{ display: "grid", gap: ".55rem" }}>
                    <strong style={{ fontSize: 13 }}>Réponses proposées et bonne(s) réponse(s)</strong>
                    {question.options.map((option, optionIndex) => (
                      <div key={optionIndex} style={{ display: "flex", gap: ".55rem", alignItems: "center" }}>
                        <input
                          type={question.type === "single_choice" ? "radio" : "checkbox"}
                          name={`correct-${question.id}`}
                          checked={question.correct_answers.includes(option) && Boolean(option)}
                          onChange={(event) => toggleCorrect(questionIndex, option, event.target.checked)}
                          aria-label="Bonne réponse"
                        />
                        <input value={option} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} placeholder={`Réponse ${optionIndex + 1}`} style={{ flex: 1, padding: ".65rem", border: "1px solid #d8b989" }} />
                        {question.options.length > 2 ? <button type="button" onClick={() => {
                          const removed = question.options[optionIndex];
                          updateQuestion(questionIndex, {
                            options: question.options.filter((_, index) => index !== optionIndex),
                            correct_answers: question.correct_answers.filter((answer) => answer !== removed),
                          });
                        }}>−</button> : null}
                      </div>
                    ))}
                    <button type="button" onClick={() => updateQuestion(questionIndex, { options: [...question.options, ""] })} style={{ width: "fit-content" }}>+ Ajouter une réponse</button>
                  </div> : <p style={{ margin: 0, fontSize: 13, opacity: .75 }}>La réponse libre sera conservée pour appréciation par le formateur ; elle n’est pas corrigée automatiquement en V1.</p>}
                </article>
              ))}
              <button type="button" onClick={() => setQuestions((current) => [...current, newQuestion(current.length)])} style={{ width: "fit-content", padding: ".65rem .9rem" }}>+ Ajouter une question</button>
            </div>
          </> : <p style={{ margin: 0, padding: ".8rem", background: "rgba(138,75,36,.06)" }}>Daily attendra une copie de l’évaluation réalisée et la transmettra au contrôle Selen.</p>}

          <button type="button" onClick={() => void save()} disabled={saving} style={{ width: "fit-content", padding: ".8rem 1.05rem", fontWeight: 800, background: "#8a4b24", color: "white", border: 0 }}>
            {saving ? "Enregistrement…" : "Enregistrer l’évaluation"}
          </button>
        </> : null}
      </section>
    </main>
  );
}
