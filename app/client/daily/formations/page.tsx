"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Question = { id: string; label: string; help_text: string; required: boolean; type: "single_choice" | "multiple_choice" | "free_text" | "scale_1_5"; options: string[]; order: number };
type Trainer = { id: string; display_name: string; status: string; professional_email?: string | null };
type Formation = {
  id: string; title: string; global_objective: string; learning_objectives: string[]; allowed_trainer_ids: string[];
  target_audience: string; prerequisites: string; duration_hours: number | string; duration_days: number | string;
  modality: string; modality_details: string; access_delays: string; registration_methods: string; price: string;
  detailed_program: string; accessibility: string; disability_referent?: string | null; pedagogical_methods: string;
  pedagogical_resources: string; evaluation_methods: string; contact_phone: string; contact_email: string; contact_website?: string | null;
  positioning_mode: string; positioning_questions: Question[]; results_pending: boolean; result_beneficiary_count?: number | null;
  result_satisfaction_rate?: number | null; result_success_rate?: number | null; status: string; version: number;
  validation_note?: string | null; updated_at: string;
};
type Workspace = { organisation?: { name?: string }; capabilities?: { trainings?: boolean }; trainers?: Trainer[] };
type FormState = Omit<Formation, "id" | "version" | "updated_at" | "validation_note">;

const emptyForm: FormState = {
  title: "", global_objective: "", learning_objectives: [""], allowed_trainer_ids: [], target_audience: "", prerequisites: "",
  duration_hours: "", duration_days: "", modality: "presentiel", modality_details: "", access_delays: "",
  registration_methods: "Les modalités d'inscription sont préparées et suivies par Selen Daily.", price: "", detailed_program: "",
  accessibility: "La formation est accessible aux personnes en situation de handicap. Les besoins d'adaptation sont analysés dans le dossier d'inscription et suivis par Selen.",
  disability_referent: "", pedagogical_methods: "", pedagogical_resources: "", evaluation_methods: "", contact_phone: "",
  contact_email: "", contact_website: "", positioning_mode: "off_platform", positioning_questions: [], results_pending: true,
  result_beneficiary_count: null, result_satisfaction_rate: null, result_success_rate: null, status: "draft",
};

function statusLabel(status: string) {
  return ({ draft: "Brouillon", review: "En validation Selen", validated: "Validée", correction_requested: "À corriger", archived: "Archivée" } as Record<string, string>)[status] ?? status;
}
function newQuestion(index: number): Question {
  return { id: crypto.randomUUID(), label: "", help_text: "", required: true, type: "free_text", options: [], order: index + 1 };
}

export default function DailyFormationsPage() {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showArchived, setShowArchived] = useState(false);

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

  const activeTrainers = useMemo(() => (workspace?.trainers ?? []).filter((t) => !["rejected", "archived"].includes(t.status)), [workspace]);
  const visibleFormations = useMemo(() => formations.filter((formation) => showArchived || formation.status !== "archived"), [formations, showArchived]);

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm, learning_objectives: [""], allowed_trainer_ids: [], positioning_questions: [] });
    setError("");
  }
  function editFormation(formation: Formation) {
    setMessage(""); setEditingId(formation.id);
    setForm({
      title: formation.title, global_objective: formation.global_objective,
      learning_objectives: formation.learning_objectives?.length ? formation.learning_objectives : [""],
      allowed_trainer_ids: formation.allowed_trainer_ids ?? [], target_audience: formation.target_audience, prerequisites: formation.prerequisites,
      duration_hours: formation.duration_hours, duration_days: formation.duration_days, modality: formation.modality, modality_details: formation.modality_details,
      access_delays: formation.access_delays, registration_methods: formation.registration_methods, price: formation.price, detailed_program: formation.detailed_program,
      accessibility: formation.accessibility, disability_referent: formation.disability_referent ?? "", pedagogical_methods: formation.pedagogical_methods ?? "",
      pedagogical_resources: formation.pedagogical_resources, evaluation_methods: formation.evaluation_methods, contact_phone: formation.contact_phone,
      contact_email: formation.contact_email, contact_website: formation.contact_website ?? "", positioning_mode: formation.positioning_mode,
      positioning_questions: formation.positioning_questions ?? [], results_pending: formation.results_pending,
      result_beneficiary_count: formation.result_beneficiary_count ?? null, result_satisfaction_rate: formation.result_satisfaction_rate ?? null,
      result_success_rate: formation.result_success_rate ?? null, status: formation.status === "validated" ? "review" : formation.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function updateObjective(index: number, value: string) {
    setForm((current) => ({ ...current, learning_objectives: current.learning_objectives.map((objective, i) => i === index ? value : objective) }));
  }
  function updateQuestion(index: number, patch: Partial<Question>) {
    setForm((current) => ({ ...current, positioning_questions: current.positioning_questions.map((question, i) => i === index ? { ...question, ...patch, order: i + 1 } : question) }));
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const response = await assistanceFetch("/api/client/daily/formations", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editingId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      resetForm();
      setMessage(data.versioned ? "Nouvelle version créée et envoyée en validation Selen." : editingId ? "Formation mise à jour." : "Formation créée.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  }
  async function action(action: "duplicate" | "archive", id: string) {
    setError(""); setMessage("");
    const response = await assistanceFetch("/api/client/daily/formations", {
      method: action === "archive" ? "DELETE" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "archive" ? { id } : { action: "duplicate", id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Action impossible.");
    setMessage(action === "duplicate" ? "Copie créée en brouillon." : data.archived ? "Formation archivée." : "Formation supprimée.");
    await load();
  }

  if (loading) return <main style={styles.main}><p>Chargement du catalogue…</p></main>;
  if (workspace && workspace.capabilities?.trainings === false) return <main style={styles.main}><h1>Formations</h1><p>Ton accès ne comprend pas la gestion des formations.</p></main>;

  return <main style={styles.main}>
    <header style={styles.hero}><div><p style={styles.eyebrow}>Selen Daily · Catalogue</p><h1 style={styles.h1}>Formations</h1><p style={styles.lead}>Une formation est un modèle réutilisable. Les dates, participants et affectations opérationnelles vivent ensuite dans les sessions.</p></div><div style={styles.stat}><strong>{formations.filter((f) => f.status !== "archived").length}</strong><span>formations actives</span></div></header>
    {error ? <div style={styles.error}>{error}</div> : null}{message ? <div style={styles.success}>{message}</div> : null}

    <section style={styles.card}>
      <div style={styles.sectionTitle}><div><h2 style={styles.h2}>{editingId ? "Modifier la formation" : "Nouvelle formation"}</h2><p style={styles.muted}>Les informations structurantes alimenteront les programmes et futurs documents Daily.</p></div>{editingId ? <button type="button" onClick={resetForm} style={styles.secondary}>Annuler</button> : null}</div>
      <form onSubmit={save} style={styles.form}>
        <Field label="Intitulé *"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={styles.input} /></Field>
        <Field label="Objectif global *"><textarea required value={form.global_objective} onChange={(e) => setForm({ ...form, global_objective: e.target.value })} style={styles.textarea} /></Field>
        <div style={styles.full}><label style={styles.label}>Objectifs pédagogiques *</label>{form.learning_objectives.map((objective, index) => <div key={index} style={styles.row}><input value={objective} onChange={(e) => updateObjective(index, e.target.value)} placeholder={`Objectif ${index + 1}`} style={{ ...styles.input, flex: 1 }} />{form.learning_objectives.length > 1 ? <button type="button" style={styles.smallButton} onClick={() => setForm({ ...form, learning_objectives: form.learning_objectives.filter((_, i) => i !== index) })}>Retirer</button> : null}</div>)}<button type="button" style={styles.secondary} onClick={() => setForm({ ...form, learning_objectives: [...form.learning_objectives, ""] })}>+ Ajouter un objectif</button></div>
        <Field label="Public visé *"><textarea required value={form.target_audience} onChange={(e) => setForm({ ...form, target_audience: e.target.value })} style={styles.textarea} /></Field>
        <Field label="Prérequis *"><textarea required value={form.prerequisites} onChange={(e) => setForm({ ...form, prerequisites: e.target.value })} style={styles.textarea} /></Field>
        <Field label="Durée en heures *"><input type="number" min="0.5" step="0.5" required value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} style={styles.input} /></Field>
        <Field label="Durée en jours *"><input type="number" min="0.5" step="0.5" required value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} style={styles.input} /></Field>
        <Field label="Modalité *"><select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })} style={styles.input}><option value="presentiel">Présentiel</option><option value="distanciel">Distanciel</option><option value="mixte">Mixte</option></select></Field>
        <Field label="Précisions sur la modalité *"><input required value={form.modality_details} onChange={(e) => setForm({ ...form, modality_details: e.target.value })} style={styles.input} /></Field>
        <Field label="Délais d'accès *"><input required value={form.access_delays} onChange={(e) => setForm({ ...form, access_delays: e.target.value })} style={styles.input} /></Field>
        <Field label="Tarif / règle tarifaire *"><input required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={styles.input} /></Field>
        <Field label="Programme détaillé *"><textarea required value={form.detailed_program} onChange={(e) => setForm({ ...form, detailed_program: e.target.value })} style={styles.largeTextarea} /></Field>
        <Field label="Méthodes pédagogiques *"><textarea required value={form.pedagogical_methods} onChange={(e) => setForm({ ...form, pedagogical_methods: e.target.value })} placeholder="Expositive, démonstrative, active, mises en situation…" style={styles.largeTextarea} /></Field>
        <Field label="Moyens et ressources pédagogiques *"><textarea required value={form.pedagogical_resources} onChange={(e) => setForm({ ...form, pedagogical_resources: e.target.value })} style={styles.largeTextarea} /></Field>
        <Field label="Modalités d'évaluation *"><textarea required value={form.evaluation_methods} onChange={(e) => setForm({ ...form, evaluation_methods: e.target.value })} style={styles.largeTextarea} /></Field>
        <Field label="Modalités d'inscription"><textarea value={form.registration_methods} onChange={(e) => setForm({ ...form, registration_methods: e.target.value })} style={styles.textarea} /></Field>
        <Field label="Accessibilité"><textarea value={form.accessibility} onChange={(e) => setForm({ ...form, accessibility: e.target.value })} style={styles.textarea} /></Field>
        <Field label="Référent handicap"><input value={form.disability_referent ?? ""} onChange={(e) => setForm({ ...form, disability_referent: e.target.value })} style={styles.input} /></Field>
        <Field label="Téléphone de contact *"><input required value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} style={styles.input} /></Field>
        <Field label="Email de contact *"><input type="email" required value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} style={styles.input} /></Field>
        <Field label="Site web"><input value={form.contact_website ?? ""} onChange={(e) => setForm({ ...form, contact_website: e.target.value })} style={styles.input} /></Field>

        <div style={styles.full}><label style={styles.label}>Formateurs autorisés</label><p style={styles.muted}>Laisse vide pour autoriser tous les formateurs actifs de l'organisme. Sinon, les sessions de cette formation ne proposeront que les personnes cochées.</p>{activeTrainers.length === 0 ? <p style={styles.muted}>Aucun formateur actif n'est encore renseigné.</p> : <div style={styles.checkGrid}>{activeTrainers.map((trainer) => <label key={trainer.id} style={styles.checkbox}><input type="checkbox" checked={form.allowed_trainer_ids.includes(trainer.id)} onChange={(e) => setForm({ ...form, allowed_trainer_ids: e.target.checked ? [...form.allowed_trainer_ids, trainer.id] : form.allowed_trainer_ids.filter((id) => id !== trainer.id) })} /><span><strong>{trainer.display_name}</strong>{trainer.professional_email ? ` · ${trainer.professional_email}` : ""}</span></label>)}</div>}</div>

        <Field label="Positionnement"><select value={form.positioning_mode} onChange={(e) => setForm({ ...form, positioning_mode: e.target.value, positioning_questions: e.target.value === "selen" && form.positioning_questions.length === 0 ? [newQuestion(0)] : form.positioning_questions })} style={styles.input}><option value="off_platform">Hors plateforme</option><option value="selen">Questionnaire Selen</option></select></Field>
        {form.positioning_mode === "selen" ? <div style={styles.full}><label style={styles.label}>Questions de positionnement</label>{form.positioning_questions.map((question, index) => <div key={question.id} style={styles.questionCard}><div style={styles.grid2}><Field label={`Question ${index + 1}`}><input value={question.label} onChange={(e) => updateQuestion(index, { label: e.target.value })} style={styles.input} /></Field><Field label="Type"><select value={question.type} onChange={(e) => updateQuestion(index, { type: e.target.value as Question["type"], options: ["single_choice", "multiple_choice"].includes(e.target.value) ? question.options : [] })} style={styles.input}><option value="free_text">Texte libre</option><option value="single_choice">Choix unique</option><option value="multiple_choice">Choix multiple</option><option value="scale_1_5">Échelle 1 à 5</option></select></Field></div>{["single_choice", "multiple_choice"].includes(question.type) ? <Field label="Options (une par ligne)"><textarea value={question.options.join("\n")} onChange={(e) => updateQuestion(index, { options: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })} style={styles.textarea} /></Field> : null}<label style={styles.checkbox}><input type="checkbox" checked={question.required} onChange={(e) => updateQuestion(index, { required: e.target.checked })} /> Réponse obligatoire</label><button type="button" style={styles.smallButton} onClick={() => setForm({ ...form, positioning_questions: form.positioning_questions.filter((_, i) => i !== index) })}>Retirer la question</button></div>)}<button type="button" style={styles.secondary} onClick={() => setForm({ ...form, positioning_questions: [...form.positioning_questions, newQuestion(form.positioning_questions.length)] })}>+ Ajouter une question</button></div> : null}
        <Field label="Statut de travail"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={styles.input}><option value="draft">Brouillon</option><option value="review">Envoyer en validation Selen</option>{editingId ? <option value="correction_requested">À corriger</option> : null}</select></Field>
        <div style={styles.full}><button disabled={saving} type="submit" style={styles.primary}>{saving ? "Enregistrement…" : editingId ? "Enregistrer les modifications" : "Créer la formation"}</button></div>
      </form>
    </section>

    <section style={styles.card}><div style={styles.sectionTitle}><div><h2 style={styles.h2}>Catalogue</h2><p style={styles.muted}>Duplique une formation récurrente au lieu de tout ressaisir.</p></div><label style={styles.checkbox}><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Voir les archivées</label></div>{visibleFormations.length === 0 ? <p style={styles.muted}>Aucune formation pour le moment.</p> : <div style={styles.list}>{visibleFormations.map((formation) => <article key={formation.id} style={styles.listCard}><div style={{ flex: 1 }}><div style={styles.row}><strong>{formation.title}</strong><span style={styles.badge}>{statusLabel(formation.status)}</span><span style={styles.muted}>v{formation.version}</span></div><p style={styles.muted}>{formation.duration_hours} h · {formation.duration_days} j · {formation.modality} · {formation.allowed_trainer_ids?.length ? `${formation.allowed_trainer_ids.length} formateur(s) autorisé(s)` : "tous les formateurs actifs"}</p><p>{formation.global_objective}</p>{formation.validation_note ? <p style={styles.warning}>Retour Selen : {formation.validation_note}</p> : null}</div><div style={styles.actions}>{formation.status !== "archived" ? <a href={`/client/daily/sessions?formation_id=${encodeURIComponent(formation.id)}`} style={styles.sessionLink}>Créer une nouvelle session</a> : null}{formation.status !== "archived" ? <button type="button" style={styles.secondary} onClick={() => editFormation(formation)}>Modifier</button> : null}<button type="button" style={styles.secondary} onClick={() => void action("duplicate", formation.id)}>Dupliquer</button>{formation.status !== "archived" ? <button type="button" style={styles.smallButton} onClick={() => void action("archive", formation.id)}>Archiver</button> : null}</div></article>)}</div>}</section>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={styles.field}><span style={styles.label}>{label}</span>{children}</label>; }
const styles: Record<string, React.CSSProperties> = {
  main: { maxWidth: 1180, margin: "0 auto", padding: "2rem 1rem 4rem", color: "var(--ink)" }, hero: { display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.5rem" },
  eyebrow: { textTransform: "uppercase", letterSpacing: ".12em", fontSize: 12, color: "var(--rust)", fontWeight: 800 }, h1: { fontSize: "clamp(2rem,5vw,3.4rem)", margin: ".2rem 0" }, h2: { margin: 0, fontSize: "1.35rem" }, lead: { maxWidth: 760, color: "var(--ink-soft)", lineHeight: 1.6 },
  stat: { minWidth: 150, padding: "1rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)", display: "grid", gap: 4 }, card: { background: "var(--paper)", border: "1px solid var(--sepia-mid)", padding: "1.25rem", marginBottom: "1.25rem", boxShadow: "0 10px 30px rgba(59,45,33,.05)" },
  sectionTitle: { display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" }, form: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1rem" }, field: { display: "grid", gap: 6, alignContent: "start" }, full: { gridColumn: "1 / -1", display: "grid", gap: 8 }, label: { fontWeight: 750, fontSize: 14 },
  input: { width: "100%", padding: ".72rem .78rem", border: "1px solid var(--sepia-mid)", background: "#fffdf8", color: "var(--ink)", boxSizing: "border-box" }, textarea: { width: "100%", minHeight: 88, padding: ".72rem .78rem", border: "1px solid var(--sepia-mid)", background: "#fffdf8", color: "var(--ink)", boxSizing: "border-box", resize: "vertical" }, largeTextarea: { width: "100%", minHeight: 150, padding: ".72rem .78rem", border: "1px solid var(--sepia-mid)", background: "#fffdf8", color: "var(--ink)", boxSizing: "border-box", resize: "vertical" },
  primary: { border: 0, background: "var(--rust)", color: "white", padding: ".8rem 1rem", fontWeight: 800, cursor: "pointer" }, sessionLink: { border: 0, borderRadius: 0, background: "var(--rust)", color: "white", padding: ".6rem .8rem", fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-block" }, secondary: { border: "1px solid var(--sepia-mid)", background: "rgba(201,160,85,.08)", color: "var(--rust)", padding: ".6rem .8rem", fontWeight: 700, cursor: "pointer" }, smallButton: { border: "1px solid #c8b8a4", background: "transparent", color: "var(--ink-soft)", padding: ".5rem .7rem", cursor: "pointer" }, row: { display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }, grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: ".8rem" }, checkGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: ".5rem" }, questionCard: { border: "1px solid var(--sepia-mid)", padding: ".8rem", display: "grid", gap: ".7rem", background: "rgba(201,160,85,.04)" }, checkbox: { display: "inline-flex", gap: 7, alignItems: "center", fontSize: 14 }, error: { padding: ".8rem 1rem", background: "#fff0ee", border: "1px solid #d9998e", marginBottom: "1rem" }, success: { padding: ".8rem 1rem", background: "#eff8ef", border: "1px solid #99bd99", marginBottom: "1rem" }, warning: { padding: ".6rem .7rem", background: "#fff8e6", borderLeft: "3px solid #c99f55" }, muted: { color: "var(--ink-soft)", margin: ".35rem 0", fontSize: 14 }, list: { display: "grid", gap: ".75rem" }, listCard: { display: "flex", gap: "1rem", justifyContent: "space-between", flexWrap: "wrap", borderTop: "1px solid var(--sepia-mid)", paddingTop: "1rem" }, badge: { display: "inline-block", border: "1px solid var(--sepia-mid)", padding: ".2rem .45rem", fontSize: 12, background: "rgba(201,160,85,.08)" }, actions: { display: "flex", gap: ".45rem", flexWrap: "wrap", alignItems: "flex-start" },
};
