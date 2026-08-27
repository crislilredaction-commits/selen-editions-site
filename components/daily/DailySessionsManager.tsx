"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import LoadingMascot from "@/components/ui/LoadingMascot";

type Formation = { id: string; title: string; status: string; version: number };
type Trainer = { id: string; display_name: string; status: string };
type Workspace = { capabilities?: { sessions?: boolean }; trainers?: Trainer[] };
type ScheduleBlock = { date: string; start: string; end: string; note: string };
type Company = { name: string; address: string; siret: string; email: string; participants: unknown[] };
type Session = {
  id: string;
  formation_id: string;
  internal_reference?: string | null;
  max_participants?: number | null;
  modality: string;
  distance_mode?: string | null;
  blended_elearning_periods?: string | null;
  blended_in_person_days?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  schedule_blocks: ScheduleBlock[];
  location_address?: string | null;
  remote_url?: string | null;
  companies: Company[];
  beneficiaries: unknown[];
  individual_beneficiaries: unknown[];
  trainer_ids: string[];
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  daily_formations?: Formation | Formation[] | null;
};
type Completion = { percentage: number; completed: number; expected: number; dossierStatus: string | null; completedAt: string | null };
type Learner = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null };
type Enrolment = { id: string; status: string; positioning_status?: string | null; learner_id: string; daily_learners?: Learner | Learner[] | null };
type EvidenceDocument = { id: string; enrolment_id: string; document_type: string; status: string; logical_name: string; created_at: string };
type EvidenceContext = { enrolments: Enrolment[]; documents: EvidenceDocument[]; assessmentResponses: { id: string; enrolment_id: string; submitted_at: string }[] };

type SessionForm = {
  formation_id: string;
  internal_reference: string;
  max_participants: string;
  modality: string;
  distance_mode: string;
  blended_elearning_periods: string;
  blended_in_person_days: string;
  start_date: string;
  end_date: string;
  schedule_blocks: ScheduleBlock[];
  location_address: string;
  remote_url: string;
  companies: Company[];
  beneficiaries: unknown[];
  individual_beneficiaries: unknown[];
  trainer_ids: string[];
  status: string;
};

const emptyForm: SessionForm = {
  formation_id: "",
  internal_reference: "",
  max_participants: "",
  modality: "presentiel",
  distance_mode: "synchrone",
  blended_elearning_periods: "",
  blended_in_person_days: "",
  start_date: "",
  end_date: "",
  schedule_blocks: [{ date: "", start: "09:00", end: "17:00", note: "" }],
  location_address: "",
  remote_url: "",
  companies: [{ name: "", address: "", siret: "", email: "", participants: [] }],
  beneficiaries: [],
  individual_beneficiaries: [],
  trainer_ids: [],
  status: "draft",
};

function formationOf(session: Session) {
  return Array.isArray(session.daily_formations) ? session.daily_formations[0] ?? null : session.daily_formations ?? null;
}
function learnerOf(enrolment: Enrolment) {
  return Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] ?? null : enrolment.daily_learners ?? null;
}
function learnerName(enrolment: Enrolment) {
  const learner = learnerOf(enrolment);
  return [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant";
}
function formatDate(value?: string | null) {
  if (!value) return "Date à définir";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
function modalityLabel(session: Session) {
  if (session.modality === "distanciel" && session.distance_mode === "asynchrone") return "Distanciel asynchrone";
  if (session.modality === "distanciel") return "Distanciel synchrone";
  if (session.modality === "mixte") return "Mixte";
  return "Présentiel";
}

export default function DailySessionsManager() {
  const searchParams = useSearchParams();
  const queryAppliedRef = useRef(false);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [completion, setCompletion] = useState<Record<string, Completion>>({});
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [form, setForm] = useState<SessionForm>({ ...emptyForm });
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [evidenceSessionId, setEvidenceSessionId] = useState<string | null>(null);
  const [evidenceContext, setEvidenceContext] = useState<EvidenceContext | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [uploadingKey, setUploadingKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [formationRes, sessionRes, workspaceRes, completionRes] = await Promise.all([
        assistanceFetch("/api/client/daily/formations", { cache: "no-store" }),
        assistanceFetch("/api/client/daily/sessions", { cache: "no-store" }),
        assistanceFetch("/api/client/daily/workspace", { cache: "no-store" }),
        assistanceFetch("/api/client/daily/sessions/completion", { cache: "no-store" }),
      ]);
      const [formationData, sessionData, workspaceData, completionData] = await Promise.all([
        formationRes.json().catch(() => ({})), sessionRes.json().catch(() => ({})), workspaceRes.json().catch(() => ({})), completionRes.json().catch(() => ({})),
      ]);
      if (!formationRes.ok) throw new Error(formationData.error ?? "Impossible de charger les formations.");
      if (!sessionRes.ok) throw new Error(sessionData.error ?? "Impossible de charger les sessions.");
      if (!workspaceRes.ok) throw new Error(workspaceData.error ?? "Impossible de charger votre espace.");
      if (!completionRes.ok) throw new Error(completionData.error ?? "Impossible de calculer la complétude.");
      setFormations((formationData.formations ?? []).filter((formation: Formation) => formation.status !== "archived"));
      setSessions((sessionData.sessions ?? []).filter((session: Session) => session.status !== "archived"));
      setWorkspace(workspaceData.workspace ?? null);
      setCompletion(completionData.completion ?? {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const trainers = useMemo(() => (workspace?.trainers ?? []).filter((trainer) => !["rejected", "archived"].includes(trainer.status)), [workspace]);
  const plannedSessions = useMemo(() => sessions.filter((session) => completion[session.id]?.dossierStatus !== "completed").sort(sortSessions), [sessions, completion]);
  const closedSessions = useMemo(() => sessions.filter((session) => completion[session.id]?.dossierStatus === "completed").sort(sortSessions), [sessions, completion]);

  function resetForm(close = true) {
    setEditingId(null);
    setForm({ ...emptyForm, schedule_blocks: [{ date: "", start: "09:00", end: "17:00", note: "" }], companies: [{ name: "", address: "", siret: "", email: "", participants: [] }] });
    if (close) setFormOpen(false);
    setError("");
  }

  function openNew(formationId = "") {
    resetForm(false);
    setMessage("");
    setForm((current) => ({ ...current, formation_id: formationId }));
    setFormOpen(true);
  }

  function editSession(session: Session) {
    setEditingId(session.id);
    setForm({
      formation_id: session.formation_id,
      internal_reference: session.internal_reference ?? "",
      max_participants: session.max_participants ? String(session.max_participants) : "",
      modality: session.modality,
      distance_mode: session.distance_mode ?? "synchrone",
      blended_elearning_periods: session.blended_elearning_periods ?? "",
      blended_in_person_days: session.blended_in_person_days ?? "",
      start_date: session.start_date ?? "",
      end_date: session.end_date ?? "",
      schedule_blocks: session.schedule_blocks?.length ? session.schedule_blocks : [{ date: session.start_date ?? "", start: "09:00", end: "17:00", note: "" }],
      location_address: session.location_address ?? "",
      remote_url: session.remote_url ?? "",
      companies: session.companies?.length ? session.companies : [{ name: "", address: "", siret: "", email: "", participants: [] }],
      beneficiaries: session.beneficiaries ?? [],
      individual_beneficiaries: session.individual_beneficiaries ?? [],
      trainer_ids: session.trainer_ids ?? [],
      status: session.status,
    });
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    if (loading || queryAppliedRef.current) return;
    const sessionId = searchParams.get("session");
    if (sessionId) {
      const session = sessions.find((item) => item.id === sessionId);
      if (session) editSession(session);
      queryAppliedRef.current = true;
      return;
    }
    const formationId = searchParams.get("formation");
    if (formationId && formations.some((formation) => formation.id === formationId)) openNew(formationId);
    queryAppliedRef.current = true;
  }, [formations, loading, searchParams, sessions]);

  function setStartDate(value: string) {
    setForm((current) => ({
      ...current,
      start_date: value,
      end_date: current.end_date || value,
      schedule_blocks: current.schedule_blocks.map((block, index) => index === 0 && (!block.date || block.date === current.start_date) ? { ...block, date: value } : block),
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await assistanceFetch("/api/client/daily/sessions", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editingId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      setMessage(`${editingId ? "Session mise à jour." : "Session créée."}${data.validationWarning ? ` ${data.validationWarning}` : ""}`);
      queryAppliedRef.current = true;
      resetForm(true);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(id: string) {
    const response = await assistanceFetch("/api/client/daily/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "duplicate", id }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Duplication impossible.");
    setMessage("Session dupliquée en brouillon. Pensez à ajuster les dates.");
    await load();
  }

  async function archive(id: string) {
    const response = await assistanceFetch("/api/client/daily/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Archivage impossible.");
    setMessage("Session archivée.");
    await load();
  }

  async function openEvidence(sessionId: string) {
    if (evidenceSessionId === sessionId) { setEvidenceSessionId(null); setEvidenceContext(null); return; }
    setEvidenceSessionId(sessionId);
    setEvidenceLoading(true);
    setEvidenceContext(null);
    try {
      const response = await assistanceFetch(`/api/client/daily/sessions/${encodeURIComponent(sessionId)}/evidence-context`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Impossible de charger les apprenants.");
      setEvidenceContext(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement des preuves impossible.");
    } finally {
      setEvidenceLoading(false);
    }
  }

  async function uploadEvidence(sessionId: string, enrolmentId: string, kind: "positioning" | "learning_assessment", file: File | null) {
    if (!file) return;
    const key = `${enrolmentId}:${kind}`;
    setUploadingKey(key);
    setError("");
    try {
      const formData = new FormData();
      formData.set("session_id", sessionId);
      formData.set("enrolment_id", enrolmentId);
      formData.set("kind", kind);
      formData.set("file", file);
      const response = await assistanceFetch("/api/client/daily/evidence", { method: "POST", body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Import impossible.");
      setMessage(kind === "positioning" ? "Test de positionnement classé dans le dossier de l’apprenant." : "Évaluation finale classée dans le dossier de l’apprenant.");
      await openEvidenceRefresh(sessionId);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import impossible.");
    } finally {
      setUploadingKey("");
    }
  }

  async function openEvidenceRefresh(sessionId: string) {
    const response = await assistanceFetch(`/api/client/daily/sessions/${encodeURIComponent(sessionId)}/evidence-context`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setEvidenceContext(data);
  }

  if (loading) return <LoadingMascot message="Sélion rassemble vos sessions…" />;
  if (workspace && workspace.capabilities?.sessions === false) return <main style={styles.main}><h1>Sessions</h1><p>Votre accès ne comprend pas la gestion des sessions.</p></main>;

  const company = form.companies[0] ?? { name: "", address: "", siret: "", email: "", participants: [] };

  return <main style={styles.main}>
    <header style={styles.hero}><div><p style={styles.eyebrow}>Selen Daily · Sessions</p><h1 style={styles.h1}>Sessions</h1><p style={styles.lead}>Les sessions sont séparées entre celles qui restent à piloter et celles dont le dossier est réellement clôturé.</p></div><div style={styles.stat}><strong>{plannedSessions.length}</strong><span>à piloter</span></div></header>
    {error ? <div style={styles.error}>{error}</div> : null}{message ? <div style={styles.success}>{message}</div> : null}

    <section style={styles.accordion}>
      <button type="button" style={styles.accordionButton} onClick={() => formOpen ? resetForm(true) : openNew()} aria-expanded={formOpen}><span><b>{editingId ? "Modifier la session" : "Créer une nouvelle session"}</b><small>{formOpen ? "Refermer le formulaire" : "Ouvrir seulement quand une date ou une action est à planifier"}</small></span><span style={styles.chevron}>{formOpen ? "−" : "+"}</span></button>
      {formOpen ? <form onSubmit={save} style={styles.formPanel}>
        <div style={styles.formGrid}>
          <Field label="Formation *"><select required value={form.formation_id} onChange={(e) => setForm({ ...form, formation_id: e.target.value })} style={styles.input}><option value="">Choisir une formation</option>{formations.map((formation) => <option key={formation.id} value={formation.id}>{formation.title} · v{formation.version}</option>)}</select></Field>
          <Field label="Référence interne"><input value={form.internal_reference} onChange={(e) => setForm({ ...form, internal_reference: e.target.value })} style={styles.input} placeholder="Ex. SES-2026-014" /></Field>
          <Field label="Capacité maximale"><input type="number" min="1" value={form.max_participants} onChange={(e) => setForm({ ...form, max_participants: e.target.value })} style={styles.input} /></Field>
          <Field label="Statut"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={styles.input}><option value="draft">Brouillon</option><option value="ready">Prête</option></select></Field>
          <Field label="Date de début *"><input type="date" required value={form.start_date} onChange={(e) => setStartDate(e.target.value)} style={styles.input} /></Field>
          <Field label="Date de fin *"><input type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={styles.input} /></Field>
          <Field label="Modalité *"><select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })} style={styles.input}><option value="presentiel">Présentiel</option><option value="distanciel">Distanciel</option><option value="mixte">Mixte</option></select></Field>
          {form.modality === "distanciel" ? <Field label="Mode à distance"><select value={form.distance_mode} onChange={(e) => setForm({ ...form, distance_mode: e.target.value })} style={styles.input}><option value="synchrone">Synchrone / direct</option><option value="asynchrone">Asynchrone / à son rythme</option></select></Field> : null}
          {(form.modality === "presentiel" || form.modality === "mixte") ? <Field full label="Adresse de formation *"><input required value={form.location_address} onChange={(e) => setForm({ ...form, location_address: e.target.value })} style={styles.input} /></Field> : null}
          {(form.modality === "distanciel" || form.modality === "mixte") ? <Field full label="Lien visio / plateforme *"><input required value={form.remote_url} onChange={(e) => setForm({ ...form, remote_url: e.target.value })} style={styles.input} /></Field> : null}
          {form.modality === "mixte" ? <><Field full label="Périodes e-learning"><textarea value={form.blended_elearning_periods} onChange={(e) => setForm({ ...form, blended_elearning_periods: e.target.value })} style={styles.textarea} /></Field><Field full label="Jours en présentiel"><textarea value={form.blended_in_person_days} onChange={(e) => setForm({ ...form, blended_in_person_days: e.target.value })} style={styles.textarea} /></Field></> : null}
        </div>

        <div style={styles.section}><h3 style={styles.h3}>Horaires</h3>{form.schedule_blocks.map((block, index) => <div key={index} style={styles.scheduleRow}><input type="date" required value={block.date} onChange={(e) => setForm((current) => ({ ...current, schedule_blocks: current.schedule_blocks.map((item, i) => i === index ? { ...item, date: e.target.value } : item) }))} style={styles.input} /><input type="time" required value={block.start} onChange={(e) => setForm((current) => ({ ...current, schedule_blocks: current.schedule_blocks.map((item, i) => i === index ? { ...item, start: e.target.value } : item) }))} style={styles.input} /><input type="time" required value={block.end} onChange={(e) => setForm((current) => ({ ...current, schedule_blocks: current.schedule_blocks.map((item, i) => i === index ? { ...item, end: e.target.value } : item) }))} style={styles.input} />{form.schedule_blocks.length > 1 ? <button type="button" style={styles.smallButton} onClick={() => setForm((current) => ({ ...current, schedule_blocks: current.schedule_blocks.filter((_, i) => i !== index) }))}>Retirer</button> : null}</div>)}<button type="button" style={styles.secondary} onClick={() => setForm((current) => ({ ...current, schedule_blocks: [...current.schedule_blocks, { date: current.end_date || current.start_date, start: "09:00", end: "17:00", note: "" }] }))}>+ Ajouter une journée / plage</button></div>

        <div style={styles.formGrid}><Field label="Entreprise cliente"><input value={company.name} onChange={(e) => setForm((current) => ({ ...current, companies: [{ ...company, name: e.target.value }] }))} style={styles.input} /></Field><Field label="Email interlocuteur"><input type="email" value={company.email} onChange={(e) => setForm((current) => ({ ...current, companies: [{ ...company, email: e.target.value }] }))} style={styles.input} /></Field></div>

        <div style={styles.section}><h3 style={styles.h3}>Formateurs</h3><div style={styles.checkboxGrid}>{trainers.map((trainer) => <label key={trainer.id} style={styles.check}><input type="checkbox" checked={form.trainer_ids.includes(trainer.id)} onChange={(e) => setForm((current) => ({ ...current, trainer_ids: e.target.checked ? [...current.trainer_ids, trainer.id] : current.trainer_ids.filter((id) => id !== trainer.id) }))} />{trainer.display_name}</label>)}</div></div>
        <div style={styles.actions}><button type="submit" disabled={saving} style={styles.primary}>{saving ? "Enregistrement…" : editingId ? "Enregistrer les modifications" : "Créer la session"}</button><button type="button" style={styles.secondary} onClick={() => resetForm(true)}>Annuler</button></div>
      </form> : null}
    </section>

    <section style={styles.columns}>
      <SessionColumn title="Sessions planifiées" subtitle="En cours de préparation ou de réalisation" sessions={plannedSessions} empty="Aucune session planifiée." completion={completion} edit={editSession} duplicate={duplicate} archive={archive} openEvidence={openEvidence} evidenceSessionId={evidenceSessionId} evidenceLoading={evidenceLoading} evidenceContext={evidenceContext} uploadEvidence={uploadEvidence} uploadingKey={uploadingKey} />
      <SessionColumn title="Sessions clôturées" subtitle="Dossier de session terminé" sessions={closedSessions} empty="Aucune session clôturée." completion={completion} edit={editSession} duplicate={duplicate} archive={archive} openEvidence={openEvidence} evidenceSessionId={evidenceSessionId} evidenceLoading={evidenceLoading} evidenceContext={evidenceContext} uploadEvidence={uploadEvidence} uploadingKey={uploadingKey} />
    </section>
  </main>;
}

function sortSessions(a: Session, b: Session) {
  const dateA = a.start_date ?? a.created_at ?? "";
  const dateB = b.start_date ?? b.created_at ?? "";
  return dateB.localeCompare(dateA);
}

function SessionColumn(props: {
  title: string; subtitle: string; sessions: Session[]; empty: string; completion: Record<string, Completion>;
  edit: (session: Session) => void; duplicate: (id: string) => Promise<void>; archive: (id: string) => Promise<void>;
  openEvidence: (id: string) => Promise<void>; evidenceSessionId: string | null; evidenceLoading: boolean; evidenceContext: EvidenceContext | null;
  uploadEvidence: (sessionId: string, enrolmentId: string, kind: "positioning" | "learning_assessment", file: File | null) => Promise<void>; uploadingKey: string;
}) {
  return <div style={styles.column}><div><h2 style={styles.h2}>{props.title}</h2><p style={styles.muted}>{props.subtitle}</p></div>{props.sessions.length === 0 ? <div style={styles.empty}>{props.empty}</div> : props.sessions.map((session) => {
    const formation = formationOf(session);
    const stats = props.completion[session.id] ?? { percentage: 0, completed: 0, expected: 0, dossierStatus: null, completedAt: null };
    return <article key={session.id} style={styles.sessionCard}>
      <div style={styles.cardHead}><div><span style={styles.badge}>{modalityLabel(session)}</span><h3 style={styles.h3}>{formation?.title ?? "Formation"}</h3><p style={styles.muted}>{formatDate(session.start_date)}{session.end_date && session.end_date !== session.start_date ? ` → ${formatDate(session.end_date)}` : ""}{session.internal_reference ? ` · ${session.internal_reference}` : ""}</p></div><strong style={styles.percent}>{stats.percentage}%</strong></div>
      <div style={styles.progressTrack}><div style={{ ...styles.progressBar, width: `${stats.percentage}%` }} /></div><p style={styles.progressText}>{stats.expected > 0 ? `${stats.completed} éléments conformes ou recueillis sur ${stats.expected}` : "Les preuves apparaîtront ici au fur et à mesure du dossier."}</p>
      <div style={styles.actions}><button type="button" style={styles.secondary} onClick={() => props.edit(session)}>Modifier</button><button type="button" style={styles.secondary} onClick={() => void props.openEvidence(session.id)}>Preuves apprenants</button><button type="button" style={styles.secondary} onClick={() => void props.duplicate(session.id)}>Dupliquer</button><button type="button" style={styles.danger} onClick={() => void props.archive(session.id)}>Archiver</button></div>
      {props.evidenceSessionId === session.id ? <EvidencePanel session={session} loading={props.evidenceLoading} context={props.evidenceContext} upload={props.uploadEvidence} uploadingKey={props.uploadingKey} /> : null}
    </article>;
  })}</div>;
}

function EvidencePanel({ session, loading, context, upload, uploadingKey }: { session: Session; loading: boolean; context: EvidenceContext | null; upload: (sessionId: string, enrolmentId: string, kind: "positioning" | "learning_assessment", file: File | null) => Promise<void>; uploadingKey: string }) {
  if (loading) return <div style={styles.evidencePanel}><LoadingMascot fullScreen={false} message="Sélion classe les dossiers apprenants…" /></div>;
  if (!context || context.enrolments.length === 0) return <div style={styles.evidencePanel}><p style={styles.muted}>Aucun apprenant rattaché à cette session pour le moment.</p></div>;
  return <div style={styles.evidencePanel}><div><b>Documents et preuves par apprenant</b><p style={styles.muted}>PDF, JPG ou PNG. Chaque import est classé automatiquement sous formation + session + apprenant pour Audit Live.</p></div>{context.enrolments.map((enrolment) => {
    const positioningDocs = context.documents.filter((doc) => doc.enrolment_id === enrolment.id && doc.document_type === "positioning_evidence");
    const assessmentDocs = context.documents.filter((doc) => doc.enrolment_id === enrolment.id && doc.document_type === "learning_assessment_evidence");
    const hasAssessmentForm = context.assessmentResponses.some((response) => response.enrolment_id === enrolment.id);
    return <div key={enrolment.id} style={styles.learnerRow}><div><b>{learnerName(enrolment)}</b><small>{learnerOf(enrolment)?.email ?? ""}</small></div><UploadCell label="Test de positionnement" done={positioningDocs.length > 0 || ["completed", "validated", "done"].includes(String(enrolment.positioning_status ?? ""))} busy={uploadingKey === `${enrolment.id}:positioning`} onFile={(file) => void upload(session.id, enrolment.id, "positioning", file)} /><UploadCell label="Évaluation finale" done={assessmentDocs.length > 0 || hasAssessmentForm} busy={uploadingKey === `${enrolment.id}:learning_assessment`} onFile={(file) => void upload(session.id, enrolment.id, "learning_assessment", file)} /></div>;
  })}</div>;
}

function UploadCell({ label, done, busy, onFile }: { label: string; done: boolean; busy: boolean; onFile: (file: File | null) => void }) {
  return <label style={{ ...styles.uploadCell, ...(done ? styles.uploadDone : {}) }}><span><b>{done ? "✓ " : ""}{label}</b><small>{done ? "Preuve déjà présente. Vous pouvez ajouter une nouvelle copie si nécessaire." : "Importer si le formulaire Selen n’a pas été utilisé."}</small></span><input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }} /><em>{busy ? "Import…" : "Choisir un fichier"}</em></label>;
}

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label style={{ ...styles.field, ...(full ? styles.full : {}) }}><span style={styles.label}>{label}</span>{children}</label>;
}

const styles: Record<string, React.CSSProperties> = {
  main: { maxWidth: 1180, margin: "0 auto", padding: "2rem 1rem 5rem", color: "#3f2b1d" }, hero: { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "center", padding: "1.6rem", border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 18, marginBottom: 18 }, eyebrow: { margin: 0, fontSize: 11, fontWeight: 800, color: "#8a4b24", letterSpacing: ".11em", textTransform: "uppercase" }, h1: { margin: ".3rem 0 .45rem", fontSize: 34 }, h2: { margin: ".2rem 0", fontSize: 22 }, h3: { margin: ".25rem 0", fontSize: 18 }, lead: { margin: 0, maxWidth: 760, lineHeight: 1.6, color: "#705744" }, muted: { margin: ".2rem 0", color: "#806a58", lineHeight: 1.5 }, stat: { minWidth: 120, textAlign: "center", padding: "1rem", borderRadius: 16, background: "#f2e3c4", display: "grid" }, error: { padding: "1rem", border: "1px solid #b96c59", background: "#fff2ed", borderRadius: 12, marginBottom: 14 }, success: { padding: "1rem", border: "1px solid #8aa36c", background: "#f6fff0", borderRadius: 12, marginBottom: 14 },
  accordion: { border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 18, overflow: "hidden", marginBottom: 26 }, accordionButton: { width: "100%", border: 0, background: "transparent", padding: "1.2rem 1.35rem", display: "flex", justifyContent: "space-between", textAlign: "left", color: "#4a321f", cursor: "pointer" }, chevron: { fontSize: 28, color: "#8a4b24" }, formPanel: { padding: "0 1.35rem 1.4rem", display: "grid", gap: 20 }, formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }, field: { display: "grid", gap: 6 }, full: { gridColumn: "1 / -1" }, label: { fontSize: 13, fontWeight: 800 }, input: { width: "100%", boxSizing: "border-box", padding: ".72rem", border: "1px solid #d8b989", borderRadius: 10, background: "white" }, textarea: { width: "100%", boxSizing: "border-box", minHeight: 90, padding: ".72rem", border: "1px solid #d8b989", borderRadius: 10, resize: "vertical" }, section: { display: "grid", gap: 10, borderTop: "1px solid #ead8b7", paddingTop: 15 }, scheduleRow: { display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr auto", gap: 8, alignItems: "center" }, checkboxGrid: { display: "flex", gap: 8, flexWrap: "wrap" }, check: { padding: ".55rem .7rem", border: "1px solid #dec79e", borderRadius: 10, display: "flex", gap: 6 },
  columns: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 18, alignItems: "start" }, column: { display: "grid", gap: 12 }, sessionCard: { padding: "1.1rem", border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 16, boxShadow: "0 8px 20px rgba(80,55,30,.06)" }, cardHead: { display: "flex", justifyContent: "space-between", gap: 12 }, badge: { display: "inline-block", padding: ".28rem .5rem", borderRadius: 999, background: "#f0dfbd", color: "#6d421f", fontSize: 11, fontWeight: 800 }, percent: { fontSize: 26, color: "#74401f" }, progressTrack: { height: 10, background: "#eadfc9", borderRadius: 999, overflow: "hidden", marginTop: 12 }, progressBar: { height: "100%", background: "linear-gradient(90deg,#a66b38,#6f8b56)", borderRadius: 999 }, progressText: { fontSize: 12, color: "#806a58", margin: ".4rem 0 .8rem" }, actions: { display: "flex", gap: 7, flexWrap: "wrap" }, primary: { border: 0, borderRadius: 10, background: "#74401f", color: "white", padding: ".72rem 1rem", fontWeight: 800, cursor: "pointer" }, secondary: { border: "1px solid #c9ad7d", borderRadius: 10, background: "#fffaf0", color: "#5d3b22", padding: ".6rem .8rem", fontWeight: 700, cursor: "pointer" }, smallButton: { border: "1px solid #d8b989", borderRadius: 8, background: "white", color: "#6a4528", padding: ".45rem .65rem" }, danger: { border: "1px solid #c79688", borderRadius: 10, background: "#fff6f2", color: "#934d3a", padding: ".6rem .8rem", fontWeight: 700, cursor: "pointer" }, empty: { padding: "1.5rem", border: "1px dashed #d8b989", borderRadius: 14, textAlign: "center", color: "#806a58" },
  evidencePanel: { display: "grid", gap: 10, marginTop: 12, padding: "1rem", borderRadius: 12, background: "#f7ecd8", border: "1px solid #dfc69a" }, learnerRow: { display: "grid", gridTemplateColumns: "minmax(140px,.8fr) 1fr 1fr", gap: 8, alignItems: "stretch", paddingTop: 9, borderTop: "1px solid #e1cfad" }, uploadCell: { display: "grid", gap: 6, padding: ".7rem", border: "1px dashed #b99566", borderRadius: 10, background: "#fffaf0", cursor: "pointer" }, uploadDone: { borderStyle: "solid", borderColor: "#8ca36e", background: "#f7fff1" },
};
