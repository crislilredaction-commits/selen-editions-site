"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import LoadingMascot from "@/components/ui/LoadingMascot";

type PositioningQuestion = {
  id: string;
  label: string;
  help_text: string;
  required: boolean;
  type: "single_choice" | "multiple_choice" | "free_text" | "scale_1_5";
  options: string[];
  order: number;
};

type AssessmentQuestion = {
  id: string;
  label: string;
  type: "single_choice" | "multiple_choice" | "free_text";
  options: string[];
  correct_answers: string[];
  points: number;
  required: boolean;
  order: number;
};

type Trainer = { id: string; display_name: string; status: string };
type Formation = {
  id: string;
  title: string;
  global_objective: string;
  learning_objectives: string[];
  allowed_trainer_ids: string[];
  target_audience: string;
  prerequisites: string;
  duration_hours: number | string;
  duration_days: number | string;
  modality: string;
  modality_details: string;
  access_delays: string;
  registration_methods: string;
  price: string;
  detailed_program: string;
  accessibility: string;
  disability_referent?: string | null;
  pedagogical_methods: string;
  pedagogical_resources: string;
  evaluation_methods: string;
  contact_phone: string;
  contact_email: string;
  contact_website?: string | null;
  positioning_mode: "off_platform" | "selen";
  positioning_questions: PositioningQuestion[];
  learning_assessment_mode?: "external" | "selen_quiz";
  learning_assessment_instructions?: string | null;
  learning_assessment_questions?: AssessmentQuestion[] | null;
  results_pending: boolean;
  result_beneficiary_count?: number | null;
  result_satisfaction_rate?: number | null;
  result_success_rate?: number | null;
  status: string;
  version: number;
  validation_note?: string | null;
  updated_at: string;
  public_registration_token?: string | null;
  public_registration_enabled?: boolean | null;
};
type Workspace = { organisation?: { name?: string }; capabilities?: { trainings?: boolean }; trainers?: Trainer[] };

type FormState = {
  title: string;
  global_objective: string;
  learning_objectives: string[];
  allowed_trainer_ids: string[];
  target_audience: string;
  prerequisites: string;
  duration_hours: string;
  duration_days: string;
  modality: string;
  modality_details: string;
  access_delays: string;
  registration_methods: string;
  price: string;
  detailed_program: string;
  accessibility: string;
  disability_referent: string;
  pedagogical_methods: string;
  pedagogical_resources: string;
  evaluation_methods: string;
  contact_phone: string;
  contact_email: string;
  contact_website: string;
  positioning_mode: "off_platform" | "selen";
  positioning_questions: PositioningQuestion[];
  results_pending: boolean;
  result_beneficiary_count: number | null;
  result_satisfaction_rate: number | null;
  result_success_rate: number | null;
  status: string;
};

const emptyForm: FormState = {
  title: "",
  global_objective: "",
  learning_objectives: [""],
  allowed_trainer_ids: [],
  target_audience: "",
  prerequisites: "",
  duration_hours: "",
  duration_days: "",
  modality: "presentiel",
  modality_details: "",
  access_delays: "",
  registration_methods: "Les modalités d'inscription sont préparées et suivies par Selen Daily.",
  price: "",
  detailed_program: "",
  accessibility: "La formation est accessible aux personnes en situation de handicap. Les besoins d'adaptation sont analysés dans le dossier d'inscription et suivis par Selen.",
  disability_referent: "",
  pedagogical_methods: "",
  pedagogical_resources: "",
  evaluation_methods: "",
  contact_phone: "",
  contact_email: "",
  contact_website: "",
  positioning_mode: "off_platform",
  positioning_questions: [],
  results_pending: true,
  result_beneficiary_count: null,
  result_satisfaction_rate: null,
  result_success_rate: null,
  status: "draft",
};

function statusLabel(status: string) {
  return ({ draft: "Brouillon · vérification Selen", review: "En validation Selen", validated: "Validée", correction_requested: "À corriger", archived: "Archivée" } as Record<string, string>)[status] ?? status;
}

function newPositioningQuestion(index: number): PositioningQuestion {
  return { id: crypto.randomUUID(), label: "", help_text: "", required: true, type: "free_text", options: [], order: index + 1 };
}

function newAssessmentQuestion(index: number): AssessmentQuestion {
  return { id: crypto.randomUUID(), label: "", type: "single_choice", options: ["", ""], correct_answers: [], points: 1, required: true, order: index + 1 };
}

function registrationUrl(token?: string | null) {
  if (!token || typeof window === "undefined") return "";
  return `${window.location.origin}/daily-inscription/${token}`;
}

export default function DailyFormationsManager() {
  const router = useRouter();
  const [formations, setFormations] = useState<Formation[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [assessmentMode, setAssessmentMode] = useState<"external" | "selen_quiz">("external");
  const [assessmentInstructions, setAssessmentInstructions] = useState("");
  const [assessmentQuestions, setAssessmentQuestions] = useState<AssessmentQuestion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [formationRes, workspaceRes] = await Promise.all([
        assistanceFetch("/api/client/daily/formations", { cache: "no-store" }),
        assistanceFetch("/api/client/daily/workspace", { cache: "no-store" }),
      ]);
      const formationData = await formationRes.json().catch(() => ({}));
      const workspaceData = await workspaceRes.json().catch(() => ({}));
      if (!formationRes.ok) throw new Error(formationData.error ?? "Impossible de charger les formations.");
      if (!workspaceRes.ok) throw new Error(workspaceData.error ?? "Impossible de charger votre organisme.");
      setFormations(formationData.formations ?? []);
      setWorkspace(workspaceData.workspace ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeTrainers = useMemo(() => (workspace?.trainers ?? []).filter((trainer) => !["rejected", "archived"].includes(trainer.status)), [workspace]);
  const visibleFormations = useMemo(() => formations.filter((formation) => formation.status !== "archived").sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()), [formations]);

  function resetForm(close = true) {
    setEditingId(null);
    setForm({ ...emptyForm, learning_objectives: [""], allowed_trainer_ids: [], positioning_questions: [] });
    setAssessmentMode("external");
    setAssessmentInstructions("");
    setAssessmentQuestions([]);
    if (close) setFormOpen(false);
    setError("");
  }

  function startNew() {
    setLastCreatedId(null);
    resetForm(false);
    setMessage("");
    setFormOpen(true);
  }

  function editFormation(formation: Formation) {
    setLastCreatedId(null);
    setMessage("");
    setEditingId(formation.id);
    setForm({
      title: formation.title ?? "",
      global_objective: formation.global_objective ?? "",
      learning_objectives: formation.learning_objectives?.length ? formation.learning_objectives : [""],
      allowed_trainer_ids: formation.allowed_trainer_ids ?? [],
      target_audience: formation.target_audience ?? "",
      prerequisites: formation.prerequisites ?? "",
      duration_hours: String(formation.duration_hours ?? ""),
      duration_days: String(formation.duration_days ?? ""),
      modality: formation.modality ?? "presentiel",
      modality_details: formation.modality_details ?? "",
      access_delays: formation.access_delays ?? "",
      registration_methods: formation.registration_methods ?? emptyForm.registration_methods,
      price: formation.price ?? "",
      detailed_program: formation.detailed_program ?? "",
      accessibility: formation.accessibility ?? emptyForm.accessibility,
      disability_referent: formation.disability_referent ?? "",
      pedagogical_methods: formation.pedagogical_methods ?? "",
      pedagogical_resources: formation.pedagogical_resources ?? "",
      evaluation_methods: formation.evaluation_methods ?? "",
      contact_phone: formation.contact_phone ?? "",
      contact_email: formation.contact_email ?? "",
      contact_website: formation.contact_website ?? "",
      positioning_mode: formation.positioning_mode ?? "off_platform",
      positioning_questions: formation.positioning_questions ?? [],
      results_pending: formation.results_pending ?? true,
      result_beneficiary_count: formation.result_beneficiary_count ?? null,
      result_satisfaction_rate: formation.result_satisfaction_rate ?? null,
      result_success_rate: formation.result_success_rate ?? null,
      status: formation.status === "validated" ? "review" : formation.status,
    });
    setAssessmentMode(formation.learning_assessment_mode ?? "external");
    setAssessmentInstructions(formation.learning_assessment_instructions ?? "");
    setAssessmentQuestions(formation.learning_assessment_questions ?? []);
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updatePositioningQuestion(index: number, patch: Partial<PositioningQuestion>) {
    setForm((current) => ({ ...current, positioning_questions: current.positioning_questions.map((question, i) => i === index ? { ...question, ...patch, order: i + 1 } : question) }));
  }

  function updateAssessmentQuestion(index: number, patch: Partial<AssessmentQuestion>) {
    setAssessmentQuestions((current) => current.map((question, i) => i === index ? { ...question, ...patch, order: i + 1 } : question));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (assessmentMode === "selen_quiz" && assessmentQuestions.length === 0) throw new Error("Ajoutez au moins une question à l’évaluation finale ou choisissez le scan après la session.");
      const response = await assistanceFetch("/api/client/daily/formations", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editingId, status: editingId ? form.status : "draft" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      const formationId = data.formation?.id as string | undefined;
      if (!formationId) throw new Error("La formation a été créée mais son identifiant n’a pas été retourné.");

      const assessmentRes = await assistanceFetch("/api/client/daily/formations/assessment-inline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: formationId, mode: assessmentMode, instructions: assessmentInstructions, questions: assessmentQuestions }),
      });
      const assessmentData = await assessmentRes.json().catch(() => ({}));
      if (!assessmentRes.ok) throw new Error(assessmentData.error ?? "La formation est enregistrée, mais l’évaluation finale n’a pas pu être attachée.");

      const wasEditing = Boolean(editingId);
      if (!wasEditing) setLastCreatedId(formationId);
      resetForm(true);
      setMessage(wasEditing
        ? "Formation mise à jour. Selen vérifie la nouvelle version avant validation."
        : "Formation enregistrée en brouillon. Selen vérifie maintenant le programme pour détecter les erreurs et s’assurer de sa conformité avant validation.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function action(actionName: "duplicate" | "archive", id: string) {
    setError("");
    setMessage("");
    const response = await assistanceFetch("/api/client/daily/formations", {
      method: actionName === "archive" ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actionName === "archive" ? { id } : { action: "duplicate", id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Action impossible.");
    setMessage(actionName === "duplicate" ? "Copie créée en brouillon et soumise à la même vérification Selen." : "Formation archivée.");
    await load();
  }

  async function copyRegistrationLink(token?: string | null) {
    const url = registrationUrl(token);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setMessage("Lien d'inscription copié.");
  }

  if (loading) return <LoadingMascot message="Sélion rassemble vos formations…" />;
  if (workspace && workspace.capabilities?.trainings === false) return <main style={styles.main}><h1>Formations</h1><p>Votre accès ne comprend pas la gestion des formations.</p></main>;

  return (
    <main style={styles.main}>
      <header style={styles.hero}>
        <div><p style={styles.eyebrow}>Selen Daily · Catalogue</p><h1 style={styles.h1}>Formations</h1><p style={styles.lead}>Retrouvez vos programmes déjà saisis. La création reste rangée tant que vous n’en avez pas besoin.</p></div>
        <div style={styles.stat}><strong>{visibleFormations.length}</strong><span>formations actives</span></div>
      </header>

      {error ? <div style={styles.error}>{error}</div> : null}
      {message ? <div style={styles.success}>{message}</div> : null}

      {lastCreatedId ? <section style={styles.completionCard}>
        <div><p style={styles.eyebrow}>Formation créée</p><h2 style={styles.h2}>Elle reste en brouillon pendant la vérification Selen</h2><p style={styles.muted}>Selen vérifie le programme afin de repérer d’éventuelles erreurs et de s’assurer que les informations sont cohérentes et conformes avant validation. Vous pouvez déjà préparer sa session.</p></div>
        <div style={styles.actions}><button type="button" style={styles.primary} onClick={() => router.push(`/client/daily/sessions?formation=${encodeURIComponent(lastCreatedId)}`)}>Créer une session</button><button type="button" style={styles.secondary} onClick={() => router.push("/client/daily")}>Tableau de bord</button></div>
      </section> : null}

      <section style={styles.accordion}>
        <button type="button" onClick={() => formOpen ? resetForm(true) : startNew()} style={styles.accordionButton} aria-expanded={formOpen}>
          <span><b>{editingId ? "Modifier la formation" : "Créer une nouvelle formation"}</b><small>{formOpen ? "Refermer le formulaire" : "Ouvrir le formulaire de création"}</small></span><span style={styles.chevron}>{formOpen ? "−" : "+"}</span>
        </button>
        {formOpen ? <form onSubmit={save} style={styles.formPanel}>
          <SectionTitle title="Le programme" subtitle="Les éléments qui serviront aux documents et à la vérification Selen." />
          <div style={styles.formGrid}>
            <Field label="Intitulé *"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={styles.input} /></Field>
            <Field label="Objectif global *"><textarea required value={form.global_objective} onChange={(e) => setForm({ ...form, global_objective: e.target.value })} style={styles.textarea} /></Field>
            <div style={styles.full}><label style={styles.label}>Objectifs pédagogiques *</label>{form.learning_objectives.map((objective, index) => <div key={index} style={styles.row}><input required value={objective} onChange={(e) => setForm((current) => ({ ...current, learning_objectives: current.learning_objectives.map((item, i) => i === index ? e.target.value : item) }))} placeholder={`Objectif ${index + 1}`} style={{ ...styles.input, flex: 1 }} />{form.learning_objectives.length > 1 ? <button type="button" style={styles.smallButton} onClick={() => setForm((current) => ({ ...current, learning_objectives: current.learning_objectives.filter((_, i) => i !== index) }))}>Retirer</button> : null}</div>)}<button type="button" style={styles.secondary} onClick={() => setForm((current) => ({ ...current, learning_objectives: [...current.learning_objectives, ""] }))}>+ Ajouter un objectif</button></div>
            <Field label="Public visé *"><textarea required value={form.target_audience} onChange={(e) => setForm({ ...form, target_audience: e.target.value })} style={styles.textarea} /></Field>
            <Field label="Prérequis *"><textarea required value={form.prerequisites} onChange={(e) => setForm({ ...form, prerequisites: e.target.value })} style={styles.textarea} /></Field>
            <Field label="Durée en heures *"><input type="number" min="0.5" step="0.5" required value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} style={styles.input} /></Field>
            <Field label="Durée en jours *"><input type="number" min="0.5" step="0.5" required value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} style={styles.input} /></Field>
            <Field label="Modalité *"><select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })} style={styles.input}><option value="presentiel">Présentiel</option><option value="distanciel">Distanciel</option><option value="mixte">Mixte</option></select></Field>
            <Field label="Précisions sur la modalité *"><input required value={form.modality_details} onChange={(e) => setForm({ ...form, modality_details: e.target.value })} style={styles.input} /></Field>
            <Field label="Délais d'accès *"><input required value={form.access_delays} onChange={(e) => setForm({ ...form, access_delays: e.target.value })} style={styles.input} /></Field>
            <Field label="Tarif / règle tarifaire *"><input required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={styles.input} /></Field>
            <Field full label="Programme détaillé"><textarea value={form.detailed_program} onChange={(e) => setForm({ ...form, detailed_program: e.target.value })} style={styles.largeTextarea} /></Field>
            <Field full label="Méthodes pédagogiques"><textarea value={form.pedagogical_methods} onChange={(e) => setForm({ ...form, pedagogical_methods: e.target.value })} style={styles.textarea} /></Field>
            <Field full label="Moyens et ressources pédagogiques *"><textarea required value={form.pedagogical_resources} onChange={(e) => setForm({ ...form, pedagogical_resources: e.target.value })} style={styles.textarea} /></Field>
            <Field full label="Modalités d’évaluation générales *"><textarea required value={form.evaluation_methods} onChange={(e) => setForm({ ...form, evaluation_methods: e.target.value })} style={styles.textarea} placeholder="Ex. test de positionnement, exercices, évaluation finale…" /></Field>
          </div>

          <SectionTitle title="Test de positionnement" subtitle="Questionnaire Selen ou document réalisé hors plateforme puis importé dans la session." />
          <ChoiceRow value={form.positioning_mode} onChange={(value) => setForm({ ...form, positioning_mode: value as "off_platform" | "selen" })} choices={[{ value: "off_platform", title: "Hors Selen / scan", detail: "Le test sera réalisé autrement et le document pourra être importé pour chaque apprenant." }, { value: "selen", title: "Questionnaire Selen", detail: "L’apprenant répond directement dans son parcours." }]} />
          {form.positioning_mode === "selen" ? <QuestionBuilder questions={form.positioning_questions} add={() => setForm((current) => ({ ...current, positioning_questions: [...current.positioning_questions, newPositioningQuestion(current.positioning_questions.length)] }))} remove={(index) => setForm((current) => ({ ...current, positioning_questions: current.positioning_questions.filter((_, i) => i !== index) }))} render={(question, index) => <PositioningQuestionEditor question={question} index={index} update={updatePositioningQuestion} />} /> : null}

          <SectionTitle title="Évaluation finale des acquis" subtitle="Comme pour le positionnement : questionnaire Selen ou évaluation papier/externe à scanner après la session." />
          <ChoiceRow value={assessmentMode} onChange={(value) => setAssessmentMode(value as "external" | "selen_quiz")} choices={[{ value: "external", title: "Hors Selen / scan après session", detail: "Le formateur ou un responsable importera la copie pour chaque apprenant." }, { value: "selen_quiz", title: "Questionnaire Selen", detail: "L’évaluation sera proposée dans le parcours de fin de formation." }]} />
          {assessmentMode === "selen_quiz" ? <div style={styles.stack}>
            <Field full label="Consignes pour l’apprenant"><textarea value={assessmentInstructions} onChange={(e) => setAssessmentInstructions(e.target.value)} style={styles.textarea} /></Field>
            <QuestionBuilder questions={assessmentQuestions} add={() => setAssessmentQuestions((current) => [...current, newAssessmentQuestion(current.length)])} remove={(index) => setAssessmentQuestions((current) => current.filter((_, i) => i !== index))} render={(question, index) => <AssessmentQuestionEditor question={question} index={index} update={updateAssessmentQuestion} />} />
          </div> : null}

          <SectionTitle title="Informations complémentaires" subtitle="Accessibilité, contacts et formateurs autorisés." />
          <div style={styles.formGrid}>
            <Field full label="Accessibilité"><textarea value={form.accessibility} onChange={(e) => setForm({ ...form, accessibility: e.target.value })} style={styles.textarea} /></Field>
            <Field label="Référent handicap"><input value={form.disability_referent} onChange={(e) => setForm({ ...form, disability_referent: e.target.value })} style={styles.input} /></Field>
            <Field label="Téléphone de contact *"><input required value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} style={styles.input} /></Field>
            <Field label="Email de contact *"><input type="email" required value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} style={styles.input} /></Field>
            <Field label="Site internet"><input value={form.contact_website} onChange={(e) => setForm({ ...form, contact_website: e.target.value })} style={styles.input} /></Field>
            <div style={styles.full}><label style={styles.label}>Formateurs autorisés</label><div style={styles.checkboxGrid}>{activeTrainers.map((trainer) => <label key={trainer.id} style={styles.check}><input type="checkbox" checked={form.allowed_trainer_ids.includes(trainer.id)} onChange={(e) => setForm((current) => ({ ...current, allowed_trainer_ids: e.target.checked ? [...current.allowed_trainer_ids, trainer.id] : current.allowed_trainer_ids.filter((id) => id !== trainer.id) }))} />{trainer.display_name}</label>)}{activeTrainers.length === 0 ? <span style={styles.muted}>Aucun formateur actif enregistré.</span> : null}</div></div>
          </div>

          <div style={styles.formActions}><button type="submit" disabled={saving} style={styles.primary}>{saving ? "Enregistrement…" : editingId ? "Enregistrer la nouvelle version" : "Créer la formation"}</button><button type="button" style={styles.secondary} onClick={() => resetForm(true)}>Annuler</button></div>
        </form> : null}
      </section>

      <section style={styles.listSection}>
        <div><p style={styles.eyebrow}>Catalogue</p><h2 style={styles.h2}>Formations déjà saisies</h2></div>
        {visibleFormations.length === 0 ? <div style={styles.empty}>Aucune formation enregistrée pour le moment.</div> : <div style={styles.cards}>{visibleFormations.map((formation) => <article key={formation.id} style={styles.formationCard}>
          <div style={styles.cardHead}><div><span style={styles.badge}>{statusLabel(formation.status)}</span><h3 style={styles.h3}>{formation.title}</h3><p style={styles.muted}>{formation.duration_hours} h · {formation.duration_days} j · {formation.modality}</p></div><strong style={styles.version}>v{formation.version}</strong></div>
          <p style={styles.objective}>{formation.global_objective}</p>
          <div style={styles.miniGrid}><span>🧭 Positionnement : <b>{formation.positioning_mode === "selen" ? "questionnaire Selen" : "scan / externe"}</b></span><span>✅ Évaluation finale : <b>{formation.learning_assessment_mode === "selen_quiz" ? "questionnaire Selen" : "scan / externe"}</b></span></div>
          {formation.validation_note ? <p style={styles.note}>Retour Selen : {formation.validation_note}</p> : null}
          <div style={styles.actions}><button type="button" style={styles.secondary} onClick={() => editFormation(formation)}>Modifier</button><button type="button" style={styles.secondary} onClick={() => void action("duplicate", formation.id)}>Dupliquer</button>{formation.public_registration_enabled && formation.public_registration_token ? <button type="button" style={styles.secondary} onClick={() => void copyRegistrationLink(formation.public_registration_token)}>Copier le lien d'inscription</button> : null}<button type="button" style={styles.danger} onClick={() => void action("archive", formation.id)}>Archiver</button></div>
        </article>)}</div>}
      </section>
    </main>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div style={styles.sectionTitle}><div><h3 style={styles.h3}>{title}</h3><p style={styles.muted}>{subtitle}</p></div></div>;
}
function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label style={{ ...styles.field, ...(full ? styles.full : {}) }}><span style={styles.label}>{label}</span>{children}</label>;
}
function ChoiceRow({ value, onChange, choices }: { value: string; onChange: (value: string) => void; choices: { value: string; title: string; detail: string }[] }) {
  return <div style={styles.choiceGrid}>{choices.map((choice) => <label key={choice.value} style={{ ...styles.choice, ...(value === choice.value ? styles.choiceActive : {}) }}><input type="radio" checked={value === choice.value} onChange={() => onChange(choice.value)} /><span><b>{choice.title}</b><small>{choice.detail}</small></span></label>)}</div>;
}
function QuestionBuilder<T>({ questions, add, remove, render }: { questions: T[]; add: () => void; remove: (index: number) => void; render: (question: T, index: number) => React.ReactNode }) {
  return <div style={styles.stack}>{questions.map((question, index) => <article key={index} style={styles.questionCard}><div style={styles.questionHead}><b>Question {index + 1}</b><button type="button" style={styles.smallButton} onClick={() => remove(index)}>Retirer</button></div>{render(question, index)}</article>)}<button type="button" style={styles.secondary} onClick={add}>+ Ajouter une question</button></div>;
}
function PositioningQuestionEditor({ question, index, update }: { question: PositioningQuestion; index: number; update: (index: number, patch: Partial<PositioningQuestion>) => void }) {
  const hasOptions = ["single_choice", "multiple_choice"].includes(question.type);
  return <div style={styles.stack}><input value={question.label} onChange={(e) => update(index, { label: e.target.value })} placeholder="Question" style={styles.input} /><select value={question.type} onChange={(e) => update(index, { type: e.target.value as PositioningQuestion["type"], options: ["single_choice", "multiple_choice"].includes(e.target.value) ? question.options : [] })} style={styles.input}><option value="free_text">Réponse libre</option><option value="single_choice">Choix unique</option><option value="multiple_choice">Choix multiples</option><option value="scale_1_5">Échelle 1 à 5</option></select>{hasOptions ? <OptionEditor options={question.options} onChange={(options) => update(index, { options })} /> : null}</div>;
}
function AssessmentQuestionEditor({ question, index, update }: { question: AssessmentQuestion; index: number; update: (index: number, patch: Partial<AssessmentQuestion>) => void }) {
  const hasOptions = question.type !== "free_text";
  return <div style={styles.stack}><input value={question.label} onChange={(e) => update(index, { label: e.target.value })} placeholder="Question" style={styles.input} /><div style={styles.row}><select value={question.type} onChange={(e) => update(index, { type: e.target.value as AssessmentQuestion["type"], options: e.target.value === "free_text" ? [] : question.options.length >= 2 ? question.options : ["", ""], correct_answers: e.target.value === "free_text" ? [] : question.correct_answers })} style={{ ...styles.input, flex: 1 }}><option value="single_choice">Choix unique</option><option value="multiple_choice">Choix multiples</option><option value="free_text">Réponse libre</option></select><input type="number" min="0.5" step="0.5" value={question.points} onChange={(e) => update(index, { points: Number(e.target.value) || 1 })} style={{ ...styles.input, width: 100 }} /></div>{hasOptions ? <div style={styles.stack}>{question.options.map((option, optionIndex) => <div key={optionIndex} style={styles.row}><input type={question.type === "single_choice" ? "radio" : "checkbox"} name={`answer-${question.id}`} checked={question.correct_answers.includes(option) && Boolean(option)} onChange={(e) => { const next = question.type === "single_choice" ? (e.target.checked ? [option] : []) : e.target.checked ? [...new Set([...question.correct_answers, option])] : question.correct_answers.filter((answer) => answer !== option); update(index, { correct_answers: next }); }} /><input value={option} onChange={(e) => { const old = option; const nextOptions = question.options.map((item, i) => i === optionIndex ? e.target.value : item); update(index, { options: nextOptions, correct_answers: question.correct_answers.map((answer) => answer === old ? e.target.value : answer) }); }} style={{ ...styles.input, flex: 1 }} placeholder={`Réponse ${optionIndex + 1}`} /></div>)}<button type="button" style={styles.smallButton} onClick={() => update(index, { options: [...question.options, ""] })}>+ Réponse</button></div> : <small style={styles.muted}>La réponse libre sera conservée pour appréciation du formateur.</small>}</div>;
}
function OptionEditor({ options, onChange }: { options: string[]; onChange: (options: string[]) => void }) {
  return <div style={styles.stack}>{options.map((option, index) => <div key={index} style={styles.row}><input value={option} onChange={(e) => onChange(options.map((item, i) => i === index ? e.target.value : item))} style={{ ...styles.input, flex: 1 }} placeholder={`Option ${index + 1}`} />{options.length > 1 ? <button type="button" style={styles.smallButton} onClick={() => onChange(options.filter((_, i) => i !== index))}>−</button> : null}</div>)}<button type="button" style={styles.smallButton} onClick={() => onChange([...options, ""])}>+ Option</button></div>;
}

const styles: Record<string, React.CSSProperties> = {
  main: { maxWidth: 1120, margin: "0 auto", padding: "2rem 1rem 5rem", color: "#3f2b1d" },
  hero: { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "center", padding: "1.6rem", border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 18, marginBottom: 18 },
  eyebrow: { margin: 0, fontSize: 11, fontWeight: 800, color: "#8a4b24", letterSpacing: ".11em", textTransform: "uppercase" },
  h1: { margin: ".3rem 0 .45rem", fontSize: 34 }, h2: { margin: ".25rem 0", fontSize: 24 }, h3: { margin: ".2rem 0", fontSize: 19 },
  lead: { margin: 0, maxWidth: 760, lineHeight: 1.6, color: "#705744" }, muted: { margin: ".25rem 0", color: "#806a58", lineHeight: 1.5 },
  stat: { minWidth: 130, textAlign: "center", padding: "1rem", borderRadius: 16, background: "#f2e3c4", display: "grid", gap: 3 },
  error: { padding: "1rem", border: "1px solid #b96c59", background: "#fff2ed", borderRadius: 12, marginBottom: 14 },
  success: { padding: "1rem", border: "1px solid #8aa36c", background: "#f6fff0", borderRadius: 12, marginBottom: 14 },
  completionCard: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", padding: "1.25rem", border: "1px solid #c8a464", background: "#fff7df", borderRadius: 16, marginBottom: 16 },
  accordion: { border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 18, overflow: "hidden", marginBottom: 28 },
  accordionButton: { width: "100%", border: 0, background: "transparent", padding: "1.2rem 1.35rem", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#4a321f", textAlign: "left", cursor: "pointer" },
  chevron: { fontSize: 28, color: "#8a4b24" },
  formPanel: { padding: "0 1.35rem 1.4rem", display: "grid", gap: 22 }, formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 },
  field: { display: "grid", gap: 6 }, full: { gridColumn: "1 / -1" }, label: { fontSize: 13, fontWeight: 800 },
  input: { width: "100%", boxSizing: "border-box", padding: ".72rem", border: "1px solid #d8b989", borderRadius: 10, background: "white", color: "#3f2b1d" }, textarea: { width: "100%", boxSizing: "border-box", minHeight: 92, padding: ".72rem", border: "1px solid #d8b989", borderRadius: 10, background: "white", resize: "vertical" }, largeTextarea: { width: "100%", boxSizing: "border-box", minHeight: 160, padding: ".72rem", border: "1px solid #d8b989", borderRadius: 10, background: "white", resize: "vertical" },
  row: { display: "flex", gap: 8, alignItems: "center" }, stack: { display: "grid", gap: 10 }, sectionTitle: { borderTop: "1px solid #ead8b7", paddingTop: 18 },
  choiceGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 10 }, choice: { display: "flex", gap: 10, alignItems: "flex-start", padding: "1rem", border: "1px solid #dec79e", borderRadius: 14, background: "#fff" }, choiceActive: { borderColor: "#8a4b24", background: "#fff7ee" },
  questionCard: { border: "1px solid #e0c99d", borderRadius: 14, background: "white", padding: "1rem" }, questionHead: { display: "flex", justifyContent: "space-between", marginBottom: 10 },
  primary: { border: 0, borderRadius: 10, background: "#74401f", color: "white", padding: ".72rem 1rem", fontWeight: 800, cursor: "pointer" }, secondary: { border: "1px solid #c9ad7d", borderRadius: 10, background: "#fffaf0", color: "#5d3b22", padding: ".65rem .9rem", fontWeight: 700, cursor: "pointer" }, smallButton: { border: "1px solid #d8b989", borderRadius: 8, background: "white", color: "#6a4528", padding: ".45rem .65rem", cursor: "pointer" }, danger: { border: "1px solid #c79688", borderRadius: 10, background: "#fff6f2", color: "#934d3a", padding: ".65rem .9rem", fontWeight: 700, cursor: "pointer" },
  formActions: { display: "flex", gap: 10, flexWrap: "wrap" }, actions: { display: "flex", gap: 8, flexWrap: "wrap" }, checkboxGrid: { display: "flex", gap: 10, flexWrap: "wrap" }, check: { display: "flex", gap: 6, alignItems: "center", padding: ".55rem .7rem", border: "1px solid #dec79e", borderRadius: 10 },
  listSection: { display: "grid", gap: 14 }, cards: { display: "grid", gap: 12 }, formationCard: { padding: "1.2rem", border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 16 }, cardHead: { display: "flex", justifyContent: "space-between", gap: 15 }, badge: { display: "inline-block", fontSize: 11, fontWeight: 800, padding: ".3rem .55rem", borderRadius: 999, background: "#f0dfbd", color: "#6d421f" }, version: { color: "#9a7448" }, objective: { lineHeight: 1.55 }, miniGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 8, padding: ".8rem", background: "#f7ecd6", borderRadius: 12, margin: ".8rem 0" }, note: { padding: ".75rem", background: "#fff1e6", borderRadius: 10 }, empty: { padding: "2rem", textAlign: "center", border: "1px dashed #d8b989", borderRadius: 16, color: "#806a58" },
};
