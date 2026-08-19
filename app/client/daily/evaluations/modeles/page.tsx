"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type QuestionType = "single_choice" | "multiple_choice" | "free_text" | "scale_1_5";
type Question = {
  id: string;
  label: string;
  help_text: string;
  required: boolean;
  type: QuestionType;
  options: string[];
  correct_answers: string[];
  points: number;
  order: number;
};
type Formation = {
  id: string;
  title: string;
  status: string;
  version: number;
  learning_assessment_mode?: string | null;
  learning_assessment_instructions?: string | null;
  learning_assessment_questions?: Question[] | null;
};

function newQuestion(order: number): Question {
  return {
    id: crypto.randomUUID(),
    label: "",
    help_text: "",
    required: true,
    type: "single_choice",
    options: ["", ""],
    correct_answers: [],
    points: 1,
    order,
  };
}

export default function LearningAssessmentTemplatesPage() {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState("off_platform");
  const [instructions, setInstructions] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(() => formations.find((formation) => formation.id === selectedId) ?? null, [formations, selectedId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await assistanceFetch("/api/client/daily/learning-assessment-templates", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Impossible de charger les modèles d'évaluation.");
      setFormations(data.formations ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) {
      setMode("off_platform");
      setInstructions("");
      setQuestions([]);
      return;
    }
    setMode(selected.learning_assessment_mode === "selen" ? "selen" : "off_platform");
    setInstructions(selected.learning_assessment_instructions ?? "");
    setQuestions((selected.learning_assessment_questions ?? []).map((question, index) => ({
      ...question,
      id: question.id || crypto.randomUUID(),
      help_text: question.help_text ?? "",
      required: question.required !== false,
      options: question.options ?? [],
      correct_answers: question.correct_answers ?? [],
      points: Number(question.points ?? 1),
      order: index + 1,
    })));
  }, [selected]);

  function updateQuestion(index: number, patch: Partial<Question>) {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch, order: questionIndex + 1 } : question));
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      const oldValue = question.options[optionIndex];
      const options = question.options.map((option, i) => i === optionIndex ? value : option);
      const correct_answers = question.correct_answers.map((answer) => answer === oldValue ? value : answer).filter(Boolean);
      return { ...question, options, correct_answers };
    }));
  }

  function toggleCorrect(questionIndex: number, option: string, checked: boolean) {
    if (!option.trim()) return;
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      const answers = question.type === "single_choice"
        ? (checked ? [option] : [])
        : checked
          ? [...new Set([...question.correct_answers, option])]
          : question.correct_answers.filter((answer) => answer !== option);
      return { ...question, correct_answers: answers };
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await assistanceFetch("/api/client/daily/learning-assessment-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formation_id: selectedId, mode, instructions, questions }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      setMessage("Le modèle d'évaluation a été enregistré dans une nouvelle version de la formation.");
      await load();
      if (data.formation?.id) setSelectedId(data.formation.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main style={styles.main}><p>Chargement des évaluations…</p></main>;

  return <main style={styles.main}>
    <header style={styles.hero}>
      <div>
        <p style={styles.eyebrow}>Selen Daily · Évaluations</p>
        <h1 style={styles.h1}>Modèles d'évaluation des acquis</h1>
        <p style={styles.lead}>Prépare l'évaluation liée à une formation. Si elle est gérée dans Selen, elle pourra ensuite être envoyée automatiquement aux apprenants le dernier jour.</p>
      </div>
    </header>

    {error ? <div style={styles.error}>{error}</div> : null}
    {message ? <div style={styles.success}>{message}</div> : null}

    <form onSubmit={save} style={styles.card}>
      <label style={styles.label}>Formation</label>
      <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} style={styles.input} required>
        <option value="">Sélectionner une formation</option>
        {formations.map((formation) => <option key={formation.id} value={formation.id}>{formation.title} · v{formation.version}</option>)}
      </select>

      {selected ? <>
        <div style={styles.choiceRow}>
          <label style={styles.choice}><input type="radio" name="mode" checked={mode === "off_platform"} onChange={() => setMode("off_platform")} /> Évaluation réalisée hors Selen</label>
          <label style={styles.choice}><input type="radio" name="mode" checked={mode === "selen"} onChange={() => setMode("selen")} /> Questionnaire géré dans Selen</label>
        </div>

        {mode === "off_platform" ? <div style={styles.info}>Le dernier jour, Selen rappellera au formateur de déposer une copie de l'évaluation réalisée afin de conserver la preuve dans le dossier.</div> : <>
          <label style={styles.label}>Consignes pour l'apprenant</label>
          <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} style={styles.textarea} placeholder="Ex. Répondez sans aide extérieure. Une seule réponse est attendue sauf indication contraire." />

          <div style={styles.sectionTitle}>
            <div><h2 style={styles.h2}>Questions</h2><p style={styles.muted}>QCM, réponses multiples, texte libre ou échelle 1 à 5.</p></div>
            <button type="button" style={styles.secondary} onClick={() => setQuestions((current) => [...current, newQuestion(current.length + 1)])}>+ Ajouter une question</button>
          </div>

          {questions.length === 0 ? <div style={styles.info}>Ajoute au moins une question pour activer l'évaluation Selen.</div> : null}
          <div style={styles.stack}>
            {questions.map((question, questionIndex) => <article key={question.id} style={styles.questionCard}>
              <div style={styles.questionHeader}>
                <strong>Question {questionIndex + 1}</strong>
                <button type="button" style={styles.dangerLink} onClick={() => setQuestions((current) => current.filter((_, index) => index !== questionIndex).map((item, index) => ({ ...item, order: index + 1 })))}>Retirer</button>
              </div>
              <label style={styles.label}>Question</label>
              <input value={question.label} onChange={(event) => updateQuestion(questionIndex, { label: event.target.value })} style={styles.input} required />
              <label style={styles.label}>Aide facultative</label>
              <input value={question.help_text} onChange={(event) => updateQuestion(questionIndex, { help_text: event.target.value })} style={styles.input} />
              <div style={styles.grid}>
                <div><label style={styles.label}>Type</label><select value={question.type} onChange={(event) => updateQuestion(questionIndex, { type: event.target.value as QuestionType, correct_answers: [] })} style={styles.input}><option value="single_choice">Une seule réponse</option><option value="multiple_choice">Plusieurs réponses</option><option value="free_text">Texte libre</option><option value="scale_1_5">Échelle 1 à 5</option></select></div>
                <div><label style={styles.label}>Points</label><input type="number" min="0.5" step="0.5" value={question.points} onChange={(event) => updateQuestion(questionIndex, { points: Number(event.target.value) || 1 })} style={styles.input} /></div>
              </div>
              <label style={styles.choice}><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(questionIndex, { required: event.target.checked })} /> Réponse obligatoire</label>

              {["single_choice", "multiple_choice"].includes(question.type) ? <div style={styles.options}>
                <label style={styles.label}>Réponses proposées et bonne(s) réponse(s)</label>
                {question.options.map((option, optionIndex) => <div key={optionIndex} style={styles.optionRow}>
                  <input value={option} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} placeholder={`Réponse ${optionIndex + 1}`} style={{ ...styles.input, flex: 1 }} />
                  <label style={styles.choice}><input type={question.type === "single_choice" ? "radio" : "checkbox"} name={question.type === "single_choice" ? `correct-${question.id}` : undefined} checked={question.correct_answers.includes(option) && Boolean(option)} onChange={(event) => toggleCorrect(questionIndex, option, event.target.checked)} /> Bonne réponse</label>
                  {question.options.length > 2 ? <button type="button" style={styles.dangerLink} onClick={() => updateQuestion(questionIndex, { options: question.options.filter((_, index) => index !== optionIndex), correct_answers: question.correct_answers.filter((answer) => answer !== option) })}>Retirer</button> : null}
                </div>)}
                <button type="button" style={styles.secondary} onClick={() => updateQuestion(questionIndex, { options: [...question.options, ""] })}>+ Ajouter une réponse</button>
              </div> : null}
            </article>)}
          </div>
        </>}

        <div style={styles.actions}><button type="submit" disabled={saving} style={styles.primary}>{saving ? "Enregistrement…" : "Enregistrer le modèle"}</button></div>
      </> : null}
    </form>
  </main>;
}

const styles: Record<string, React.CSSProperties> = {
  main: { maxWidth: 1100, margin: "0 auto", padding: "2rem 1rem 4rem", color: "var(--ink)" },
  hero: { marginBottom: "1.25rem", padding: "1.5rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)", borderRadius: 18 },
  eyebrow: { margin: 0, color: "var(--rust)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", fontSize: 12 },
  h1: { margin: ".35rem 0 .5rem", fontSize: "clamp(1.9rem,4vw,3rem)" },
  h2: { margin: 0, fontSize: "1.15rem" },
  lead: { margin: 0, maxWidth: 780, opacity: .78, lineHeight: 1.6 },
  card: { border: "1px solid var(--sepia-mid)", background: "var(--paper)", borderRadius: 18, padding: "1.25rem", display: "grid", gap: "1rem" },
  label: { display: "block", fontWeight: 750, marginBottom: ".35rem" },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid var(--sepia-mid)", borderRadius: 12, padding: ".75rem .85rem", background: "rgba(255,255,255,.45)", color: "inherit" },
  textarea: { width: "100%", minHeight: 110, boxSizing: "border-box", border: "1px solid var(--sepia-mid)", borderRadius: 12, padding: ".75rem .85rem", background: "rgba(255,255,255,.45)", color: "inherit", resize: "vertical" },
  choiceRow: { display: "flex", flexWrap: "wrap", gap: "1rem" },
  choice: { display: "inline-flex", alignItems: "center", gap: ".45rem", fontWeight: 650 },
  info: { border: "1px solid var(--sepia-mid)", borderRadius: 12, padding: ".85rem", background: "rgba(201,160,85,.08)", lineHeight: 1.5 },
  sectionTitle: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginTop: ".5rem" },
  muted: { margin: ".25rem 0 0", opacity: .7, fontSize: 14 },
  stack: { display: "grid", gap: "1rem" },
  questionCard: { border: "1px solid var(--sepia-mid)", borderRadius: 14, padding: "1rem", background: "rgba(255,255,255,.25)", display: "grid", gap: ".75rem" },
  questionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: ".8rem" },
  options: { display: "grid", gap: ".65rem" },
  optionRow: { display: "flex", alignItems: "center", gap: ".65rem", flexWrap: "wrap" },
  actions: { display: "flex", justifyContent: "flex-end", paddingTop: ".5rem" },
  primary: { border: 0, borderRadius: 12, padding: ".8rem 1rem", background: "var(--rust)", color: "#fffaf0", fontWeight: 800, cursor: "pointer" },
  secondary: { border: "1px solid var(--sepia-mid)", borderRadius: 12, padding: ".65rem .8rem", background: "rgba(201,160,85,.08)", color: "var(--rust)", fontWeight: 750, cursor: "pointer" },
  dangerLink: { border: 0, background: "transparent", color: "#8a2f25", fontWeight: 750, cursor: "pointer", padding: ".3rem" },
  error: { marginBottom: "1rem", border: "1px solid #b45145", background: "rgba(180,81,69,.08)", padding: ".85rem", borderRadius: 12 },
  success: { marginBottom: "1rem", border: "1px solid #668b63", background: "rgba(102,139,99,.08)", padding: ".85rem", borderRadius: 12 },
};
