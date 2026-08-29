"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import FormationSourceUpload from "@/components/daily/FormationSourceUpload";
import LoadingMascot from "@/components/ui/LoadingMascot";
import { FORMATION_GUIDANCE } from "@/lib/daily/formationGuidance";

type PositioningQuestion = { id: string; label: string; help_text: string; required: boolean; type: "single_choice" | "multiple_choice" | "free_text" | "scale_1_5"; options: string[]; order: number };
type AssessmentQuestion = { id: string; label: string; type: "single_choice" | "multiple_choice" | "free_text"; options: string[]; correct_answers: string[]; points: number; required: boolean; order: number };
type Trainer = { id: string; display_name: string; status: string };
type Formation = {
  id: string; title: string; global_objective: string; learning_objectives: string[]; allowed_trainer_ids: string[]; target_audience: string; prerequisites: string;
  duration_hours: number | string; duration_days: number | string; modality: string; access_delays: string; registration_methods: string; price: string;
  detailed_program_document_url?: string | null; positioning_questionnaire_document_url?: string | null; accessibility: string; disability_referent?: string | null;
  pedagogical_methods: string; pedagogical_resources: string; evaluation_methods: string; contact_phone: string; contact_email: string; contact_website?: string | null;
  positioning_mode: "off_platform" | "selen"; positioning_questions: PositioningQuestion[]; learning_assessment_mode?: "external" | "selen_quiz";
  learning_assessment_instructions?: string | null; learning_assessment_questions?: AssessmentQuestion[] | null; results_pending: boolean; result_beneficiary_count?: number | null;
  result_satisfaction_rate?: number | null; result_success_rate?: number | null; status: string; version: number; validation_note?: string | null; updated_at: string;
  public_registration_token?: string | null; public_registration_enabled?: boolean | null;
};
type Workspace = { capabilities?: { trainings?: boolean }; trainers?: Trainer[] };
type FormState = {
  title: string; global_objective: string; learning_objectives: string[]; allowed_trainer_ids: string[]; target_audience: string; prerequisites: string;
  duration_hours: string; duration_days: string; modality: string; access_delays: string; registration_methods: string; price: string;
  detailed_program_document_url: string; positioning_questionnaire_document_url: string; accessibility: string; disability_referent: string; pedagogical_methods: string;
  pedagogical_resources: string; evaluation_methods: string; contact_phone: string; contact_email: string; contact_website: string; positioning_mode: "off_platform" | "selen";
  positioning_questions: PositioningQuestion[]; results_pending: boolean; result_beneficiary_count: number | null; result_satisfaction_rate: number | null; result_success_rate: number | null; status: string;
};

const emptyForm: FormState = {
  title: "", global_objective: "", learning_objectives: [""], allowed_trainer_ids: [], target_audience: "", prerequisites: "", duration_hours: "", duration_days: "",
  modality: "presentiel", access_delays: "", registration_methods: "Les modalités d'inscription sont préparées et suivies par Selen Daily.", price: "", detailed_program_document_url: "",
  positioning_questionnaire_document_url: "", accessibility: "La formation est accessible aux personnes en situation de handicap. Les besoins d'adaptation sont analysés dans le dossier d'inscription et suivis par Selen.",
  disability_referent: "", pedagogical_methods: "", pedagogical_resources: "", evaluation_methods: "", contact_phone: "", contact_email: "", contact_website: "",
  positioning_mode: "off_platform", positioning_questions: [], results_pending: true, result_beneficiary_count: null, result_satisfaction_rate: null, result_success_rate: null, status: "draft",
};

function statusLabel(status: string) {
  return ({ draft: "Brouillon · vérification Selen", review: "En validation Selen", validated: "Validée", correction_requested: "À corriger", archived: "Archivée" } as Record<string, string>)[status] ?? status;
}
function newPositioningQuestion(index: number): PositioningQuestion { return { id: crypto.randomUUID(), label: "", help_text: "", required: true, type: "free_text", options: [], order: index + 1 }; }
function newAssessmentQuestion(index: number): AssessmentQuestion { return { id: crypto.randomUUID(), label: "", type: "single_choice", options: ["", ""], correct_answers: [], points: 1, required: true, order: index + 1 }; }
function registrationUrl(token?: string | null) { if (!token || typeof window === "undefined") return ""; return `${window.location.origin}/daily-inscription/${token}`; }

export default function DailyFormationsManager() {
  const router = useRouter();
  const [formations, setFormations] = useState<Formation[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [assessmentMode, setAssessmentMode] = useState<"external" | "selen_quiz">("external");
  const [assessmentInstructions, setAssessmentInstructions] = useState("");
  const [assessmentQuestions, setAssessmentQuestions] = useState<AssessmentQuestion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginalStatus, setEditingOriginalStatus] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [formationRes, workspaceRes] = await Promise.all([
        assistanceFetch("/api/client/daily/formations", { cache: "no-store" }),
        assistanceFetch("/api/client/daily/workspace", { cache: "no-store" }),
      ]);
      const formationData = await formationRes.json().catch(() => ({}));
      const workspaceData = await workspaceRes.json().catch(() => ({}));
      if (!formationRes.ok) throw new Error(formationData.error ?? "Impossible de charger les formations.");
      if (!workspaceRes.ok) throw new Error(workspaceData.error ?? "Impossible de charger votre organisme.");
      setFormations(formationData.formations ?? []); setWorkspace(workspaceData.workspace ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chargement impossible."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const activeTrainers = useMemo(() => (workspace?.trainers ?? []).filter((trainer) => !["rejected", "archived"].includes(trainer.status)), [workspace]);
  const visibleFormations = useMemo(() => formations.filter((formation) => formation.status !== "archived").sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()), [formations]);
  const editingFormation = useMemo(() => formations.find((f) => f.id === editingId) ?? null, [formations, editingId]);

  function resetForm(close = true) {
    setEditingId(null); setEditingOriginalStatus(null); setForm({ ...emptyForm, learning_objectives: [""], allowed_trainer_ids: [], positioning_questions: [] });
    setAssessmentMode("external"); setAssessmentInstructions(""); setAssessmentQuestions([]); if (close) setFormOpen(false); setError("");
  }
  function startNew() { resetForm(false); setMessage(""); setFormOpen(true); }
  function editFormation(formation: Formation) {
    setMessage(""); setEditingId(formation.id); setEditingOriginalStatus(formation.status);
    setForm({
      title: formation.title ?? "", global_objective: formation.global_objective ?? "", learning_objectives: formation.learning_objectives?.length ? formation.learning_objectives : [""],
      allowed_trainer_ids: formation.allowed_trainer_ids ?? [], target_audience: formation.target_audience ?? "", prerequisites: formation.prerequisites ?? "", duration_hours: String(formation.duration_hours ?? ""),
      duration_days: String(formation.duration_days ?? ""), modality: formation.modality ?? "presentiel", access_delays: formation.access_delays ?? "", registration_methods: formation.registration_methods ?? emptyForm.registration_methods,
      price: formation.price ?? "", detailed_program_document_url: formation.detailed_program_document_url ?? "", positioning_questionnaire_document_url: formation.positioning_questionnaire_document_url ?? "",
      accessibility: formation.accessibility ?? emptyForm.accessibility, disability_referent: formation.disability_referent ?? "", pedagogical_methods: formation.pedagogical_methods ?? "",
      pedagogical_resources: formation.pedagogical_resources ?? "", evaluation_methods: formation.evaluation_methods ?? "", contact_phone: formation.contact_phone ?? "", contact_email: formation.contact_email ?? "",
      contact_website: formation.contact_website ?? "", positioning_mode: formation.positioning_mode ?? "off_platform", positioning_questions: formation.positioning_questions ?? [], results_pending: formation.results_pending ?? true,
      result_beneficiary_count: formation.result_beneficiary_count ?? null, result_satisfaction_rate: formation.result_satisfaction_rate ?? null, result_success_rate: formation.result_success_rate ?? null,
      status: formation.status === "validated" ? "review" : formation.status,
    });
    setAssessmentMode(formation.learning_assessment_mode ?? "external"); setAssessmentInstructions(formation.learning_assessment_instructions ?? ""); setAssessmentQuestions(formation.learning_assessment_questions ?? []);
    setFormOpen(true); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      if (assessmentMode === "selen_quiz" && assessmentQuestions.length === 0) throw new Error("Ajoutez au moins une question à l’évaluation finale ou choisissez le scan après la session.");
      const response = await assistanceFetch("/api/client/daily/formations", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editingId, status: editingId ? form.status : "draft" }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      const formationId = data.formation?.id as string | undefined; if (!formationId) throw new Error("La formation a été enregistrée mais son identifiant n’a pas été retourné.");
      const assessmentRes = await assistanceFetch("/api/client/daily/formations/assessment-inline", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: formationId, mode: assessmentMode, instructions: assessmentInstructions, questions: assessmentQuestions }) });
      const assessmentData = await assessmentRes.json().catch(() => ({})); if (!assessmentRes.ok) throw new Error(assessmentData.error ?? "La formation est enregistrée, mais l’évaluation finale n’a pas pu être attachée.");
      if (!editingId) { router.push(`/client/daily/sessions/new?formation=${encodeURIComponent(formationId)}`); return; }
      const wasValidated = editingOriginalStatus === "validated";
      resetForm(true); setMessage(wasValidated ? "Nouvelle version envoyée à Selen. La version validée actuelle reste publiée jusqu’à validation." : "Formation mise à jour et renvoyée à Selen pour vérification.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  }

  async function action(actionName: "duplicate" | "archive", id: string) {
    setError(""); setMessage("");
    const response = await assistanceFetch("/api/client/daily/formations", { method: actionName === "archive" ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(actionName === "archive" ? { id } : { action: "duplicate", id }) });
    const data = await response.json().catch(() => ({})); if (!response.ok) return setError(data.error ?? "Action impossible.");
    setMessage(actionName === "duplicate" ? "Copie créée en brouillon." : "Formation archivée."); await load();
  }
  async function copyRegistrationLink(token?: string | null) { const url = registrationUrl(token); if (!url) return; await navigator.clipboard.writeText(url); setMessage("Lien d'inscription copié."); }

  if (loading) return <LoadingMascot message="Sélion rassemble vos formations…" />;
  if (workspace && workspace.capabilities?.trainings === false) return <main style={s.main}><h1>Formations</h1><p>Votre accès ne comprend pas la gestion des formations.</p></main>;

  return <main style={s.main}>
    <header style={s.hero}><div><p style={s.eyebrow}>Selen Daily · Catalogue</p><h1 style={s.h1}>Formations</h1><p style={s.lead}>Créez vos programmes, transmettez-les à Selen pour validation et conservez automatiquement leurs versions.</p></div><div style={s.stat}><strong>{visibleFormations.length}</strong><span>formations actives</span></div></header>
    {error ? <div style={s.error}>{error}</div> : null}{message ? <div style={s.success}>{message}</div> : null}

    <section style={s.accordion}>
      <button type="button" onClick={() => formOpen ? resetForm(true) : startNew()} style={s.accordionButton} aria-expanded={formOpen}><span><b>{editingId ? "Modifier la formation" : "Créer une nouvelle formation"}</b><small>{formOpen ? "Refermer le formulaire" : "Ouvrir le formulaire de création"}</small></span><span style={s.chevron}>{formOpen ? "−" : "+"}</span></button>
      {formOpen ? <form onSubmit={save} style={s.formPanel}>
        {editingOriginalStatus === "validated" ? <InfoBox>La version actuellement validée reste publiée et conserve son lien d’inscription jusqu’à ce que Selen valide vos modifications.</InfoBox> : null}
        {editingOriginalStatus === "correction_requested" ? <InfoBox><b>Retour Selen :</b> {editingFormation?.validation_note || "Des corrections sont demandées."}<br />Vos corrections repartent en validation sans créer une version supplémentaire.</InfoBox> : null}

        <SectionTitle title="Le programme" subtitle="Les informations utilisées dans le programme officiel et les documents de formation." />
        <div style={s.formGrid}>
          <Field label="Intitulé *"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={s.input} /></Field>
          <Field label="Objectif principal *" help={FORMATION_GUIDANCE.globalObjective}><textarea required value={form.global_objective} onChange={(e) => setForm({ ...form, global_objective: e.target.value })} style={s.textarea} /></Field>
          <div style={s.full}><label style={s.label}>Objectifs pédagogiques *</label>{form.learning_objectives.map((objective, index) => <div key={index} style={s.row}><input required value={objective} onChange={(e) => setForm((current) => ({ ...current, learning_objectives: current.learning_objectives.map((item, i) => i === index ? e.target.value : item) }))} placeholder={`Objectif ${index + 1}`} style={{ ...s.input, flex: 1 }} />{form.learning_objectives.length > 1 ? <button type="button" style={s.smallButton} onClick={() => setForm((current) => ({ ...current, learning_objectives: current.learning_objectives.filter((_, i) => i !== index) }))}>Retirer</button> : null}</div>)}<button type="button" style={s.secondary} onClick={() => setForm((current) => ({ ...current, learning_objectives: [...current.learning_objectives, ""] }))}>+ Ajouter un objectif</button></div>
          <Field label="Public visé *"><textarea required value={form.target_audience} onChange={(e) => setForm({ ...form, target_audience: e.target.value })} style={s.textarea} /></Field>
          <Field label="Prérequis *" help={FORMATION_GUIDANCE.prerequisites}><textarea required value={form.prerequisites} onChange={(e) => setForm({ ...form, prerequisites: e.target.value })} style={s.textarea} /></Field>
          <Field label="Durée en heures *"><input type="number" min="0.5" step="0.5" required value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} style={s.input} /></Field>
          <Field label="Durée en jours *"><input type="number" min="0.5" step="0.5" required value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} style={s.input} /></Field>
          <Field label="Modalité *"><select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })} style={s.input}><option value="presentiel">Présentiel</option><option value="distanciel">Distanciel</option><option value="mixte">Mixte</option></select></Field>
          <Field label="Délais d'accès *"><input required value={form.access_delays} onChange={(e) => setForm({ ...form, access_delays: e.target.value })} style={s.input} /></Field>
          <Field label="Tarif *"><div style={s.money}><input type="number" min="0" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={s.input} /><strong>€ TTC</strong></div></Field>
          <div style={s.full}><FormationSourceUpload kind="training_program_source" label="Programme détaillé Word ou PDF" value={form.detailed_program_document_url} onUploaded={(url) => setForm((current) => ({ ...current, detailed_program_document_url: url }))} help="Importez votre programme en PDF, DOC ou DOCX. Selen utilise ce document comme contenu détaillé de référence." /><a href="/templates/modele-programme-formation-selen.docx" style={s.link}>Télécharger le modèle de programme Selen (facultatif)</a></div>
          <Field full label="Méthodes pédagogiques"><textarea value={form.pedagogical_methods} onChange={(e) => setForm({ ...form, pedagogical_methods: e.target.value })} style={s.textarea} /></Field>
          <Field full label="Moyens pédagogiques et techniques *" help={FORMATION_GUIDANCE.pedagogicalResources}><textarea required value={form.pedagogical_resources} onChange={(e) => setForm({ ...form, pedagogical_resources: e.target.value })} style={s.textarea} /></Field>
          <Field full label="Modalités d’évaluation *"><textarea required value={form.evaluation_methods} onChange={(e) => setForm({ ...form, evaluation_methods: e.target.value })} style={s.textarea} /></Field>
        </div>

        <SectionTitle title="Test de positionnement" subtitle={FORMATION_GUIDANCE.positioning} />
        <ChoiceRow value={form.positioning_mode} onChange={(value) => setForm({ ...form, positioning_mode: value as "off_platform" | "selen" })} choices={[{ value: "off_platform", title: "Votre questionnaire Word/PDF", detail: "Importez votre propre questionnaire ; les réponses pourront ensuite être classées par apprenant." }, { value: "selen", title: "Questionnaire Selen", detail: "Les apprenants répondent directement dans leur parcours." }]} />
        {form.positioning_mode === "off_platform" ? <FormationSourceUpload kind="positioning_questionnaire_source" label="Questionnaire de positionnement Word ou PDF" value={form.positioning_questionnaire_document_url} onUploaded={(url) => setForm((current) => ({ ...current, positioning_questionnaire_document_url: url }))} /> : <QuestionBuilder questions={form.positioning_questions} add={() => setForm((current) => ({ ...current, positioning_questions: [...current.positioning_questions, newPositioningQuestion(current.positioning_questions.length)] }))} remove={(index) => setForm((current) => ({ ...current, positioning_questions: current.positioning_questions.filter((_, i) => i !== index) }))} render={(q, i) => <PositioningEditor question={q} index={i} update={(index, patch) => setForm((current) => ({ ...current, positioning_questions: current.positioning_questions.map((item, j) => j === index ? { ...item, ...patch, order: j + 1 } : item) }))} />} />}

        <SectionTitle title="Évaluation finale des acquis" subtitle="Choisissez un questionnaire Selen ou une évaluation externe à classer après la session." />
        <ChoiceRow value={assessmentMode} onChange={(value) => setAssessmentMode(value as "external" | "selen_quiz")} choices={[{ value: "external", title: "Hors Selen / scan", detail: "La copie sera importée dans le dossier de chaque apprenant." }, { value: "selen_quiz", title: "Questionnaire Selen", detail: "L’évaluation est réalisée directement dans le parcours." }]} />
        {assessmentMode === "selen_quiz" ? <div style={s.stack}><Field full label="Consignes"><textarea value={assessmentInstructions} onChange={(e) => setAssessmentInstructions(e.target.value)} style={s.textarea} /></Field><QuestionBuilder questions={assessmentQuestions} add={() => setAssessmentQuestions((current) => [...current, newAssessmentQuestion(current.length)])} remove={(index) => setAssessmentQuestions((current) => current.filter((_, i) => i !== index))} render={(q, i) => <AssessmentEditor question={q} index={i} update={(index, patch) => setAssessmentQuestions((current) => current.map((item, j) => j === index ? { ...item, ...patch, order: j + 1 } : item))} />} /></div> : null}

        <SectionTitle title="Informations complémentaires" subtitle={FORMATION_GUIDANCE.contact} />
        <div style={s.formGrid}>
          <Field full label="Accessibilité"><textarea value={form.accessibility} onChange={(e) => setForm({ ...form, accessibility: e.target.value })} style={s.textarea} /></Field>
          <Field label="Référent handicap"><input value={form.disability_referent} onChange={(e) => setForm({ ...form, disability_referent: e.target.value })} style={s.input} /></Field>
          <Field label="Téléphone de l’organisme *"><input required value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} style={s.input} /></Field>
          <Field label="Email de l’organisme *"><input type="email" required value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} style={s.input} /></Field>
          <Field label="Site internet"><input value={form.contact_website} onChange={(e) => setForm({ ...form, contact_website: e.target.value })} style={s.input} /></Field>
          <div style={s.full}><label style={s.label}>Formateurs autorisés</label><div style={s.checkboxGrid}>{activeTrainers.map((trainer) => <label key={trainer.id} style={s.check}><input type="checkbox" checked={form.allowed_trainer_ids.includes(trainer.id)} onChange={(e) => setForm((current) => ({ ...current, allowed_trainer_ids: e.target.checked ? [...current.allowed_trainer_ids, trainer.id] : current.allowed_trainer_ids.filter((id) => id !== trainer.id) }))} />{trainer.display_name}</label>)}{activeTrainers.length === 0 ? <span style={s.muted}>Aucun formateur actif enregistré.</span> : null}</div></div>
        </div>
        <div style={s.formActions}><button type="submit" disabled={saving} style={s.primary}>{saving ? "Enregistrement…" : editingOriginalStatus === "validated" ? "Envoyer la nouvelle version à Selen" : editingId ? "Enregistrer les modifications" : "Créer la formation"}</button><button type="button" style={s.secondary} onClick={() => resetForm(true)}>Annuler</button></div>
      </form> : null}
    </section>

    <section style={s.listSection}><div><p style={s.eyebrow}>Catalogue</p><h2 style={s.h2}>Formations déjà saisies</h2></div>{visibleFormations.length === 0 ? <div style={s.empty}>Aucune formation enregistrée pour le moment.</div> : <div style={s.cards}>{visibleFormations.map((formation) => <article key={formation.id} style={s.formationCard}><div style={s.cardHead}><div><span style={s.badge}>{statusLabel(formation.status)}</span><h3 style={s.h3}>{formation.title}</h3><p style={s.muted}>{formation.duration_hours} h · {formation.duration_days} j · {formation.modality}</p></div><strong style={s.version}>v{formation.version}</strong></div><p style={s.objective}>{formation.global_objective}</p>{formation.validation_note ? <p style={s.note}>Retour Selen : {formation.validation_note}</p> : null}<div style={s.actions}><button type="button" style={s.secondary} onClick={() => editFormation(formation)}>Modifier</button><button type="button" style={s.secondary} onClick={() => void action("duplicate", formation.id)}>Dupliquer</button>{formation.public_registration_enabled && formation.public_registration_token ? <button type="button" style={s.secondary} onClick={() => void copyRegistrationLink(formation.public_registration_token)}>Copier le lien d'inscription</button> : null}<button type="button" style={s.danger} onClick={() => void action("archive", formation.id)}>Archiver</button></div></article>)}</div>}</section>
  </main>;
}

function InfoBox({ children }: { children: React.ReactNode }) { return <div style={s.info}>{children}</div>; }
function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div style={s.sectionTitle}><h3 style={s.h3}>{title}</h3><p style={s.muted}>{subtitle}</p></div>; }
function Field({ label, help, children, full = false }: { label: string; help?: string; children: React.ReactNode; full?: boolean }) { return <label style={{ ...s.field, ...(full ? s.full : {}) }}><span style={s.label}>{label}</span>{help ? <small style={s.help}>{help}</small> : null}{children}</label>; }
function ChoiceRow({ value, onChange, choices }: { value: string; onChange: (value: string) => void; choices: { value: string; title: string; detail: string }[] }) { return <div style={s.choiceGrid}>{choices.map((choice) => <label key={choice.value} style={{ ...s.choice, ...(value === choice.value ? s.choiceActive : {}) }}><input type="radio" checked={value === choice.value} onChange={() => onChange(choice.value)} /><span><b>{choice.title}</b><small>{choice.detail}</small></span></label>)}</div>; }
function QuestionBuilder<T>({ questions, add, remove, render }: { questions: T[]; add: () => void; remove: (index: number) => void; render: (question: T, index: number) => React.ReactNode }) { return <div style={s.stack}>{questions.map((question, index) => <article key={index} style={s.questionCard}><div style={s.questionHead}><b>Question {index + 1}</b><button type="button" style={s.smallButton} onClick={() => remove(index)}>Retirer</button></div>{render(question, index)}</article>)}<button type="button" style={s.secondary} onClick={add}>+ Ajouter une question</button></div>; }
function PositioningEditor({ question, index, update }: { question: PositioningQuestion; index: number; update: (index: number, patch: Partial<PositioningQuestion>) => void }) { const choices = question.type === "single_choice" || question.type === "multiple_choice"; return <div style={s.stack}><input value={question.label} onChange={(e) => update(index, { label: e.target.value })} placeholder="Question" style={s.input} /><select value={question.type} onChange={(e) => update(index, { type: e.target.value as PositioningQuestion["type"], options: ["single_choice", "multiple_choice"].includes(e.target.value) ? question.options : [] })} style={s.input}><option value="free_text">Réponse libre</option><option value="single_choice">Choix unique</option><option value="multiple_choice">Choix multiples</option><option value="scale_1_5">Échelle 1 à 5</option></select>{choices ? <Options options={question.options} onChange={(options) => update(index, { options })} /> : null}</div>; }
function AssessmentEditor({ question, index, update }: { question: AssessmentQuestion; index: number; update: (index: number, patch: Partial<AssessmentQuestion>) => void }) { const choices = question.type !== "free_text"; return <div style={s.stack}><input value={question.label} onChange={(e) => update(index, { label: e.target.value })} placeholder="Question" style={s.input} /><select value={question.type} onChange={(e) => update(index, { type: e.target.value as AssessmentQuestion["type"], options: e.target.value === "free_text" ? [] : question.options.length ? question.options : ["", ""], correct_answers: e.target.value === "free_text" ? [] : question.correct_answers })} style={s.input}><option value="single_choice">Choix unique</option><option value="multiple_choice">Choix multiples</option><option value="free_text">Réponse libre</option></select>{choices ? <Options options={question.options} onChange={(options) => update(index, { options })} /> : null}</div>; }
function Options({ options, onChange }: { options: string[]; onChange: (options: string[]) => void }) { return <div style={s.stack}>{options.map((option, index) => <div key={index} style={s.row}><input value={option} onChange={(e) => onChange(options.map((item, i) => i === index ? e.target.value : item))} style={{ ...s.input, flex: 1 }} placeholder={`Option ${index + 1}`} />{options.length > 1 ? <button type="button" style={s.smallButton} onClick={() => onChange(options.filter((_, i) => i !== index))}>−</button> : null}</div>)}<button type="button" style={s.smallButton} onClick={() => onChange([...options, ""])}>+ Option</button></div>; }

const s: Record<string, React.CSSProperties> = {
  main: { maxWidth: 1120, margin: "0 auto", padding: "2rem 1rem 5rem", color: "#3f2b1d" }, hero: { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "center", padding: "1.6rem", border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 18, marginBottom: 18 }, eyebrow: { margin: 0, fontSize: 11, fontWeight: 800, color: "#8a4b24", letterSpacing: ".11em", textTransform: "uppercase" },
  h1: { margin: ".3rem 0 .45rem", fontSize: 34 }, h2: { margin: ".25rem 0", fontSize: 24 }, h3: { margin: ".2rem 0", fontSize: 19 }, lead: { margin: 0, maxWidth: 760, lineHeight: 1.6, color: "#705744" }, muted: { margin: ".25rem 0", color: "#806a58", lineHeight: 1.5 }, stat: { minWidth: 130, textAlign: "center", padding: "1rem", borderRadius: 16, background: "#f2e3c4", display: "grid", gap: 3 },
  error: { padding: "1rem", border: "1px solid #b96c59", background: "#fff2ed", borderRadius: 12, marginBottom: 14 }, success: { padding: "1rem", border: "1px solid #8aa36c", background: "#f6fff0", borderRadius: 12, marginBottom: 14 }, info: { padding: "1rem", border: "1px solid #d4b36e", background: "#fff7df", borderRadius: 12, lineHeight: 1.55 },
  accordion: { border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 18, overflow: "hidden", marginBottom: 28 }, accordionButton: { width: "100%", border: 0, background: "transparent", padding: "1.2rem 1.35rem", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#4a321f", textAlign: "left", cursor: "pointer" }, chevron: { fontSize: 28, color: "#8a4b24" },
  formPanel: { padding: "0 1.35rem 1.4rem", display: "grid", gap: 22 }, formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }, field: { display: "grid", gap: 6 }, full: { gridColumn: "1 / -1" }, label: { fontSize: 13, fontWeight: 800 }, help: { color: "#806a58", lineHeight: 1.45 }, input: { width: "100%", boxSizing: "border-box", padding: ".72rem", border: "1px solid #d8b989", borderRadius: 10, background: "white", color: "#3f2b1d" }, textarea: { width: "100%", boxSizing: "border-box", minHeight: 92, padding: ".72rem", border: "1px solid #d8b989", borderRadius: 10, background: "white", resize: "vertical" },
  row: { display: "flex", gap: 8, alignItems: "center" }, stack: { display: "grid", gap: 10 }, sectionTitle: { borderTop: "1px solid #ead8b7", paddingTop: 18 }, choiceGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 10 }, choice: { display: "flex", gap: 10, alignItems: "flex-start", padding: "1rem", border: "1px solid #dec79e", borderRadius: 14, background: "#fff" }, choiceActive: { borderColor: "#8a4b24", background: "#fff7ee" },
  questionCard: { border: "1px solid #e0c99d", borderRadius: 14, background: "white", padding: "1rem" }, questionHead: { display: "flex", justifyContent: "space-between", marginBottom: 10 }, primary: { border: 0, borderRadius: 10, background: "#74401f", color: "white", padding: ".72rem 1rem", fontWeight: 800, cursor: "pointer" }, secondary: { border: "1px solid #c9ad7d", borderRadius: 10, background: "#fffaf0", color: "#5d3b22", padding: ".65rem .9rem", fontWeight: 700, cursor: "pointer" }, smallButton: { border: "1px solid #d8b989", borderRadius: 8, background: "white", color: "#6a4528", padding: ".45rem .65rem", cursor: "pointer" }, danger: { border: "1px solid #c79688", borderRadius: 10, background: "#fff6f2", color: "#934d3a", padding: ".65rem .9rem", fontWeight: 700, cursor: "pointer" },
  formActions: { display: "flex", gap: 10, flexWrap: "wrap" }, actions: { display: "flex", gap: 8, flexWrap: "wrap" }, checkboxGrid: { display: "flex", gap: 10, flexWrap: "wrap" }, check: { display: "flex", gap: 6, alignItems: "center", padding: ".55rem .7rem", border: "1px solid #dec79e", borderRadius: 10 }, money: { display: "flex", gap: 8, alignItems: "center" }, link: { display: "inline-block", marginTop: 7, color: "#74401f", fontWeight: 700 },
  listSection: { display: "grid", gap: 14 }, cards: { display: "grid", gap: 12 }, formationCard: { padding: "1.2rem", border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 16 }, cardHead: { display: "flex", justifyContent: "space-between", gap: 15 }, badge: { display: "inline-block", fontSize: 11, fontWeight: 800, padding: ".3rem .55rem", borderRadius: 999, background: "#f0dfbd", color: "#6d421f" }, version: { color: "#9a7448" }, objective: { lineHeight: 1.55 }, note: { padding: ".75rem", background: "#fff1e6", borderRadius: 10 }, empty: { padding: "2rem", textAlign: "center", border: "1px dashed #d8b989", borderRadius: 16, color: "#806a58" },
};
