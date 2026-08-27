"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Formation = { id: string; title: string; status: string; version: number };
type Trainer = { id: string; display_name: string; status: string; professional_email?: string | null };
type Workspace = {
  organisation?: { name?: string };
  capabilities?: { sessions?: boolean };
  trainers?: Trainer[];
};
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
  registration_status?: string | null;
  daily_formations?: Formation | null;
};

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

function statusLabel(status: string) {
  if (status === "draft") return "Brouillon";
  if (status === "ready") return "Prête";
  if (status === "archived") return "Archivée";
  return status;
}

function registrationLabel(status?: string | null) {
  if (status === "to_prepare") return "Inscriptions à préparer";
  if (status === "to_review") return "À vérifier";
  if (status === "ready_to_send") return "Prêt à envoyer";
  if (status === "sent") return "Envoyé";
  if (status === "responses_received") return "Réponses reçues";
  if (status === "summary_to_review") return "Synthèse à relire";
  if (status === "summary_validated") return "Synthèse validée";
  return "À préparer";
}

export default function DailySessionsPage() {
  const searchParams = useSearchParams();
  const queryAppliedRef = useRef(false);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [form, setForm] = useState<SessionForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [formationRes, sessionRes, workspaceRes] = await Promise.all([
        assistanceFetch("/api/client/daily/formations", { cache: "no-store" }),
        assistanceFetch("/api/client/daily/sessions", { cache: "no-store" }),
        assistanceFetch("/api/client/daily/workspace", { cache: "no-store" }),
      ]);
      const formationData = await formationRes.json().catch(() => ({}));
      const sessionData = await sessionRes.json().catch(() => ({}));
      const workspaceData = await workspaceRes.json().catch(() => ({}));
      if (!formationRes.ok) throw new Error(formationData.error ?? "Impossible de charger les formations.");
      if (!sessionRes.ok) throw new Error(sessionData.error ?? "Impossible de charger les sessions.");
      if (!workspaceRes.ok) throw new Error(workspaceData.error ?? "Impossible de charger votre organisme.");
      setFormations((formationData.formations ?? []).filter((formation: Formation) => formation.status !== "archived"));
      setSessions(sessionData.sessions ?? []);
      setWorkspace(workspaceData.workspace ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const trainers = useMemo(
    () => (workspace?.trainers ?? []).filter((trainer) => !["rejected", "archived"].includes(trainer.status)),
    [workspace],
  );
  const visibleSessions = useMemo(
    () => sessions.filter((session) => showArchived || session.status !== "archived"),
    [sessions, showArchived],
  );

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm, schedule_blocks: [{ date: "", start: "09:00", end: "17:00", note: "" }], companies: [{ name: "", address: "", siret: "", email: "", participants: [] }] });
    setError("");
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
      schedule_blocks: session.schedule_blocks?.length ? session.schedule_blocks : [{ date: "", start: "09:00", end: "17:00", note: "" }],
      location_address: session.location_address ?? "",
      remote_url: session.remote_url ?? "",
      companies: session.companies?.length ? session.companies : [{ name: "", address: "", siret: "", email: "", participants: [] }],
      beneficiaries: session.beneficiaries ?? [],
      individual_beneficiaries: session.individual_beneficiaries ?? [],
      trainer_ids: session.trainer_ids ?? [],
      status: session.status,
    });
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
    if (formationId && formations.some((formation) => formation.id === formationId)) {
      setForm((current) => ({ ...current, formation_id: formationId }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    queryAppliedRef.current = true;
  }, [formations, loading, searchParams, sessions]);

  function updateBlock(index: number, patch: Partial<ScheduleBlock>) {
    setForm((current) => ({ ...current, schedule_blocks: current.schedule_blocks.map((block, i) => i === index ? { ...block, ...patch } : block) }));
  }

  function updateCompany(patch: Partial<Company>) {
    setForm((current) => ({ ...current, companies: [{ ...(current.companies[0] ?? { name: "", address: "", siret: "", email: "", participants: [] }), ...patch }] }));
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
      setMessage(editingId ? "Session mise à jour." : "Session créée.");
      if (data.validationWarning) setMessage(`${editingId ? "Session mise à jour." : "Session créée."} ${data.validationWarning}`);
      queryAppliedRef.current = true;
      resetForm();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(id: string) {
    setError(""); setMessage("");
    const response = await assistanceFetch("/api/client/daily/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "duplicate", id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Duplication impossible.");
    setMessage("Session dupliquée en brouillon. Pense à ajuster les dates.");
    await load();
  }

  async function archive(id: string) {
    setError(""); setMessage("");
    const response = await assistanceFetch("/api/client/daily/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Archivage impossible.");
    setMessage("Session archivée.");
    await load();
  }

  if (loading) return <main style={styles.main}><p>Chargement des sessions…</p></main>;
  if (workspace && workspace.capabilities?.sessions === false) {
    return <main style={styles.main}><h1>Sessions</h1><p>Ton accès ne comprend pas la gestion des sessions.</p></main>;
  }

  const company = form.companies[0] ?? { name: "", address: "", siret: "", email: "", participants: [] };

  return (
    <main style={styles.main}>
      <header style={styles.hero}>
        <div>
          <p style={styles.eyebrow}>Selen Daily · Exploitation</p>
          <h1 style={styles.h1}>Sessions</h1>
          <p style={styles.lead}>Crée ici une session seulement quand tu as des dates ou une action de formation à planifier. La formation reste réutilisable autant de fois que nécessaire.</p>
        </div>
        <div style={styles.stat}><strong>{sessions.filter((s) => s.status !== "archived").length}</strong><span>sessions actives</span></div>
      </header>

      {error ? <div style={styles.error}>{error}</div> : null}
      {message ? <div style={styles.success}>{message}</div> : null}

      <section style={styles.card}>
        <div style={styles.sectionTitle}>
          <div><h2 style={styles.h2}>{editingId ? "Modifier la session" : "Nouvelle session"}</h2><p style={styles.muted}>La formation est préselectionnée lorsque tu arrives depuis sa fiche.</p></div>
          {editingId ? <button type="button" onClick={resetForm} style={styles.secondary}>Annuler</button> : null}
        </div>

        <form onSubmit={save} style={styles.form}>
          <Field label="Formation *"><select required value={form.formation_id} onChange={(e) => setForm({ ...form, formation_id: e.target.value })} style={styles.input}><option value="">Choisir une formation</option>{formations.map((formation) => <option key={formation.id} value={formation.id}>{formation.title} · v{formation.version} · {formation.status}</option>)}</select></Field>
          <Field label="Référence interne"><input value={form.internal_reference} onChange={(e) => setForm({ ...form, internal_reference: e.target.value })} placeholder="Ex. SES-2026-014" style={styles.input} /></Field>
          <Field label="Capacité maximale"><input type="number" min="1" step="1" value={form.max_participants} onChange={(e) => setForm({ ...form, max_participants: e.target.value })} style={styles.input} /></Field>
          <Field label="Statut"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={styles.input}><option value="draft">Brouillon</option><option value="ready">Prête</option></select></Field>
          <Field label="Date de début *"><input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={styles.input} /></Field>
          <Field label="Date de fin *"><input type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={styles.input} /></Field>
          <Field label="Modalité *"><select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })} style={styles.input}><option value="presentiel">Présentiel</option><option value="distanciel">Distanciel</option><option value="mixte">Mixte</option></select></Field>
          {form.modality === "distanciel" ? <Field label="Mode à distance"><select value={form.distance_mode} onChange={(e) => setForm({ ...form, distance_mode: e.target.value })} style={styles.input}><option value="synchrone">Synchrone / direct</option><option value="asynchrone">Asynchrone / à son rythme</option></select></Field> : null}
          {(form.modality === "presentiel" || form.modality === "mixte") ? <Field label="Adresse de formation *"><input required value={form.location_address} onChange={(e) => setForm({ ...form, location_address: e.target.value })} style={styles.input} /></Field> : null}
          {(form.modality === "distanciel" || form.modality === "mixte") ? <Field label="Lien visio / plateforme *"><input required value={form.remote_url} onChange={(e) => setForm({ ...form, remote_url: e.target.value })} style={styles.input} /></Field> : null}
          {form.modality === "mixte" ? <><Field label="Périodes e-learning"><textarea value={form.blended_elearning_periods} onChange={(e) => setForm({ ...form, blended_elearning_periods: e.target.value })} style={styles.textarea} /></Field><Field label="Jours en présentiel"><textarea value={form.blended_in_person_days} onChange={(e) => setForm({ ...form, blended_in_person_days: e.target.value })} style={styles.textarea} /></Field></> : null}

          <div style={styles.full}>
            <label style={styles.label}>Planning détaillé *</label>
            {form.schedule_blocks.map((block, index) => (
              <div key={index} style={styles.scheduleRow}>
                <input type="date" value={block.date} onChange={(e) => updateBlock(index, { date: e.target.value })} style={styles.input} />
                <input type="time" value={block.start} onChange={(e) => updateBlock(index, { start: e.target.value })} style={styles.input} />
                <input type="time" value={block.end} onChange={(e) => updateBlock(index, { end: e.target.value })} style={styles.input} />
                <input value={block.note} onChange={(e) => updateBlock(index, { note: e.target.value })} placeholder="Pause, module, précision…" style={styles.input} />
                {form.schedule_blocks.length > 1 ? <button type="button" style={styles.smallButton} onClick={() => setForm({ ...form, schedule_blocks: form.schedule_blocks.filter((_, i) => i !== index) })}>Retirer</button> : null}
              </div>
            ))}
            <button type="button" style={styles.secondary} onClick={() => setForm({ ...form, schedule_blocks: [...form.schedule_blocks, { date: form.end_date || form.start_date, start: "09:00", end: "17:00", note: "" }] })}>+ Ajouter un bloc</button>
          </div>

          <div style={styles.full}>
            <label style={styles.label}>Formateur(s)</label>
            {trainers.length === 0 ? <p style={styles.muted}>Aucun formateur actif dans la fiche organisme. Tu peux préparer la session sans formateur et l&apos;affecter plus tard.</p> : <div style={styles.checkGrid}>{trainers.map((trainer) => <label key={trainer.id} style={styles.checkbox}><input type="checkbox" checked={form.trainer_ids.includes(trainer.id)} onChange={(e) => setForm({ ...form, trainer_ids: e.target.checked ? [...form.trainer_ids, trainer.id] : form.trainer_ids.filter((id) => id !== trainer.id) })} /> <span><strong>{trainer.display_name}</strong>{trainer.professional_email ? ` · ${trainer.professional_email}` : ""} · {trainer.status}</span></label>)}</div>}
          </div>

          <div style={styles.full}><h3 style={styles.h3}>Commanditaire / entreprise</h3></div>
          <Field label="Entreprise"><input value={company.name} onChange={(e) => updateCompany({ name: e.target.value })} style={styles.input} /></Field>
          <Field label="SIRET"><input value={company.siret} onChange={(e) => updateCompany({ siret: e.target.value })} style={styles.input} /></Field>
          <Field label="Email"><input type="email" value={company.email} onChange={(e) => updateCompany({ email: e.target.value })} style={styles.input} /></Field>
          <Field label="Adresse"><input value={company.address} onChange={(e) => updateCompany({ address: e.target.value })} style={styles.input} /></Field>

          <div style={styles.full}><button type="submit" disabled={saving || formations.length === 0} style={styles.primary}>{saving ? "Enregistrement…" : editingId ? "Enregistrer la session" : "Créer la session"}</button>{formations.length === 0 ? <p style={styles.warning}>Crée d&apos;abord une formation dans le catalogue.</p> : null}</div>
        </form>
      </section>

      <section style={styles.card}>
        <div style={styles.sectionTitle}>
          <div><h2 style={styles.h2}>Sessions planifiées</h2><p style={styles.muted}>La duplication conserve le cadre, puis tu ajustes les dates et la référence.</p></div>
          <label style={styles.checkbox}><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Voir les archivées</label>
        </div>
        {visibleSessions.length === 0 ? <p style={styles.muted}>Aucune session pour le moment.</p> : <div style={styles.list}>{visibleSessions.map((session) => <article key={session.id} style={styles.listCard}><div style={{ flex: 1 }}><div style={styles.row}><strong>{session.daily_formations?.title ?? "Formation"}</strong><span style={styles.badge}>{statusLabel(session.status)}</span>{session.internal_reference ? <span style={styles.badge}>{session.internal_reference}</span> : null}</div><p style={styles.muted}>{session.start_date ?? "?"} → {session.end_date ?? "?"} · {session.modality}{session.max_participants ? ` · capacité ${session.max_participants}` : ""}</p><p style={styles.muted}>{registrationLabel(session.registration_status)} · {session.trainer_ids?.length ?? 0} formateur(s)</p></div><div style={styles.actions}>{session.status !== "archived" ? <button type="button" style={styles.secondary} onClick={() => editSession(session)}>Modifier</button> : null}<button type="button" style={styles.secondary} onClick={() => void duplicate(session.id)}>Dupliquer</button>{session.status !== "archived" ? <button type="button" style={styles.smallButton} onClick={() => void archive(session.id)}>Archiver</button> : null}</div></article>)}</div>}
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={styles.field}><span style={styles.label}>{label}</span>{children}</label>; }

const styles: Record<string, React.CSSProperties> = {
  main: { maxWidth: 1180, margin: "0 auto", padding: "2rem 1rem 4rem", color: "var(--ink)" },
  hero: { display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.5rem" },
  eyebrow: { textTransform: "uppercase", letterSpacing: ".12em", fontSize: 12, color: "var(--rust)", fontWeight: 800 },
  h1: { fontSize: "clamp(2rem,5vw,3.4rem)", margin: ".2rem 0" },
  h2: { margin: 0, fontSize: "1.35rem" },
  h3: { margin: ".2rem 0", fontSize: "1rem" },
  lead: { maxWidth: 760, color: "var(--ink-soft)", lineHeight: 1.6 },
  stat: { minWidth: 150, padding: "1rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)", display: "grid", gap: 4 },
  card: { background: "var(--paper)", border: "1px solid var(--sepia-mid)", padding: "1.25rem", marginBottom: "1.25rem", boxShadow: "0 10px 30px rgba(59,45,33,.05)" },
  sectionTitle: { display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" },
  form: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: "1rem" },
  field: { display: "grid", gap: 6, alignContent: "start" },
  full: { gridColumn: "1 / -1", display: "grid", gap: 8 },
  label: { fontWeight: 750, fontSize: 14 },
  input: { width: "100%", padding: ".72rem .78rem", border: "1px solid var(--sepia-mid)", background: "#fffdf8", color: "var(--ink)", boxSizing: "border-box" },
  textarea: { width: "100%", minHeight: 88, padding: ".72rem .78rem", border: "1px solid var(--sepia-mid)", background: "#fffdf8", color: "var(--ink)", boxSizing: "border-box", resize: "vertical" },
  scheduleRow: { display: "grid", gridTemplateColumns: "1.1fr .7fr .7fr 1.5fr auto", gap: ".5rem", alignItems: "end" },
  checkGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: ".5rem" },
  primary: { border: 0, background: "var(--rust)", color: "white", padding: ".8rem 1rem", fontWeight: 800, cursor: "pointer" },
  secondary: { border: "1px solid var(--sepia-mid)", background: "rgba(201,160,85,.08)", color: "var(--rust)", padding: ".6rem .8rem", fontWeight: 700, cursor: "pointer" },
  smallButton: { border: "1px solid #c8b8a4", background: "transparent", color: "var(--ink-soft)", padding: ".5rem .7rem", cursor: "pointer" },
  row: { display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" },
  checkbox: { display: "inline-flex", gap: 7, alignItems: "center", fontSize: 14 },
  error: { padding: ".8rem 1rem", background: "#fff0ee", border: "1px solid #d9998e", marginBottom: "1rem" },
  success: { padding: ".8rem 1rem", background: "#eff8ef", border: "1px solid #99bd99", marginBottom: "1rem" },
  warning: { padding: ".6rem .7rem", background: "#fff8e6", borderLeft: "3px solid #c99f55" },
  muted: { color: "var(--ink-soft)", margin: ".35rem 0", fontSize: 14 },
  list: { display: "grid", gap: ".75rem" },
  listCard: { display: "flex", gap: "1rem", justifyContent: "space-between", flexWrap: "wrap", borderTop: "1px solid var(--sepia-mid)", paddingTop: "1rem" },
  badge: { display: "inline-block", border: "1px solid var(--sepia-mid)", padding: ".2rem .45rem", fontSize: 12, background: "rgba(201,160,85,.08)" },
  actions: { display: "flex", gap: ".45rem", flexWrap: "wrap", alignItems: "flex-start" },
};
