"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import DailySessionCreationIntro from "@/components/daily/DailySessionCreationIntro";
import LoadingMascot from "@/components/ui/LoadingMascot";

type Formation = { id: string; title: string; status: string; version: number; modality?: string | null };
type Trainer = { id: string; display_name: string; status: string };
type ScheduleBlock = { date: string; start: string; end: string; note: string };

export default function DailyFirstSessionCreator() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formationId = searchParams.get("formation") ?? "";
  const [formations, setFormations] = useState<Formation[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    formation_id: formationId, internal_reference: "", max_participants: "", modality: "presentiel", distance_mode: "synchrone",
    blended_elearning_periods: "", blended_in_person_days: "", start_date: "", end_date: "", schedule_blocks: [{ date: "", start: "09:00", end: "17:00", note: "" }] as ScheduleBlock[],
    location_address: "", remote_url: "", companies: [{ name: "", address: "", siret: "", email: "", participants: [] as unknown[] }], beneficiaries: [] as unknown[], individual_beneficiaries: [] as unknown[], trainer_ids: [] as string[], status: "draft",
  });

  useEffect(() => {
    void (async () => {
      try {
        const [formationRes, workspaceRes] = await Promise.all([
          assistanceFetch("/api/client/daily/formations", { cache: "no-store" }), assistanceFetch("/api/client/daily/workspace", { cache: "no-store" }),
        ]);
        const [formationData, workspaceData] = await Promise.all([formationRes.json().catch(() => ({})), workspaceRes.json().catch(() => ({}))]);
        if (!formationRes.ok) throw new Error(formationData.error ?? "Impossible de charger les formations.");
        if (!workspaceRes.ok) throw new Error(workspaceData.error ?? "Impossible de charger votre espace.");
        const available = (formationData.formations ?? []).filter((item: Formation) => item.status !== "archived");
        setFormations(available); setTrainers((workspaceData.workspace?.trainers ?? []).filter((trainer: Trainer) => !["rejected", "archived"].includes(trainer.status)));
        const selected = available.find((item: Formation) => item.id === formationId);
        setForm((current) => ({ ...current, formation_id: selected?.id ?? current.formation_id, modality: selected?.modality ?? current.modality }));
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Chargement impossible."); }
      finally { setLoading(false); }
    })();
  }, [formationId]);

  const selectedFormation = useMemo(() => formations.find((item) => item.id === form.formation_id), [formations, form.formation_id]);
  const company = form.companies[0];

  function setStartDate(value: string) {
    setForm((current) => ({ ...current, start_date: value, end_date: current.end_date || value, schedule_blocks: current.schedule_blocks.map((block, index) => index === 0 && !block.date ? { ...block, date: value } : block) }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await assistanceFetch("/api/client/daily/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Création de la session impossible.");
      router.push("/client/daily/sessions"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Création impossible."); }
    finally { setSaving(false); }
  }

  if (loading) return <LoadingMascot message="Sélion prépare la première session…" />;

  return <main style={s.main}>
    <DailySessionCreationIntro formationTitle={selectedFormation?.title} />
    {error ? <div style={s.error}>{error}</div> : null}
    <form onSubmit={submit} style={s.card}>
      <div style={s.grid}>
        <Field label="Formation *"><select required value={form.formation_id} onChange={(e) => setForm({ ...form, formation_id: e.target.value })} style={s.input}><option value="">Choisir une formation</option>{formations.map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}</select></Field>
        <Field label="Référence interne"><input value={form.internal_reference} onChange={(e) => setForm({ ...form, internal_reference: e.target.value })} style={s.input} placeholder="Ex. SES-2026-014" /></Field>
        <Field label="Date de début *"><input type="date" required value={form.start_date} onChange={(e) => setStartDate(e.target.value)} style={s.input} /></Field>
        <Field label="Date de fin *"><input type="date" required value={form.end_date} min={form.start_date || undefined} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={s.input} /></Field>
        <Field label="Capacité maximale"><input type="number" min="1" value={form.max_participants} onChange={(e) => setForm({ ...form, max_participants: e.target.value })} style={s.input} /></Field>
        <Field label="Modalité *"><select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })} style={s.input}><option value="presentiel">Présentiel</option><option value="distanciel">Distanciel</option><option value="mixte">Mixte</option></select></Field>
        {form.modality === "distanciel" ? <Field label="Mode à distance"><select value={form.distance_mode} onChange={(e) => setForm({ ...form, distance_mode: e.target.value })} style={s.input}><option value="synchrone">Synchrone / direct</option><option value="asynchrone">Asynchrone / à son rythme</option></select></Field> : null}
        {(form.modality === "presentiel" || form.modality === "mixte") ? <Field full label="Adresse de formation *"><input required value={form.location_address} onChange={(e) => setForm({ ...form, location_address: e.target.value })} style={s.input} /></Field> : null}
        {(form.modality === "distanciel" || form.modality === "mixte") ? <Field full label="Lien visio / plateforme *"><input required value={form.remote_url} onChange={(e) => setForm({ ...form, remote_url: e.target.value })} style={s.input} /></Field> : null}
      </div>

      <section style={s.section}><h2 style={s.h2}>Horaires</h2>{form.schedule_blocks.map((block, index) => <div key={index} style={s.schedule}><input type="date" required value={block.date} onChange={(e) => setForm((current) => ({ ...current, schedule_blocks: current.schedule_blocks.map((item, i) => i === index ? { ...item, date: e.target.value } : item) }))} style={s.input} /><input type="time" required value={block.start} onChange={(e) => setForm((current) => ({ ...current, schedule_blocks: current.schedule_blocks.map((item, i) => i === index ? { ...item, start: e.target.value } : item) }))} style={s.input} /><input type="time" required value={block.end} onChange={(e) => setForm((current) => ({ ...current, schedule_blocks: current.schedule_blocks.map((item, i) => i === index ? { ...item, end: e.target.value } : item) }))} style={s.input} />{form.schedule_blocks.length > 1 ? <button type="button" style={s.small} onClick={() => setForm((current) => ({ ...current, schedule_blocks: current.schedule_blocks.filter((_, i) => i !== index) }))}>Retirer</button> : null}</div>)}<button type="button" style={s.secondary} onClick={() => setForm((current) => ({ ...current, schedule_blocks: [...current.schedule_blocks, { date: current.end_date || current.start_date, start: "09:00", end: "17:00", note: "" }] }))}>+ Ajouter une plage</button></section>

      <section style={s.section}><h2 style={s.h2}>Entreprise cliente <small style={s.optional}>(facultatif)</small></h2><div style={s.grid}><Field label="Raison sociale"><input value={company.name} onChange={(e) => setForm((current) => ({ ...current, companies: [{ ...company, name: e.target.value }] }))} style={s.input} /></Field><Field label="Email interlocuteur"><input type="email" value={company.email} onChange={(e) => setForm((current) => ({ ...current, companies: [{ ...company, email: e.target.value }] }))} style={s.input} /></Field></div></section>

      <section style={s.section}><h2 style={s.h2}>Formateur(s)</h2><div style={s.checks}>{trainers.map((trainer) => <label key={trainer.id} style={s.check}><input type="checkbox" checked={form.trainer_ids.includes(trainer.id)} onChange={(e) => setForm((current) => ({ ...current, trainer_ids: e.target.checked ? [...current.trainer_ids, trainer.id] : current.trainer_ids.filter((id) => id !== trainer.id) }))} />{trainer.display_name}</label>)}{trainers.length === 0 ? <p style={s.muted}>Vous pourrez associer un formateur plus tard.</p> : null}</div></section>

      <div style={s.actions}><button type="submit" disabled={saving} style={s.primary}>{saving ? "Création…" : "Créer la session"}</button><button type="button" style={s.secondary} onClick={() => router.push("/client/daily/formations")}>Créer plus tard</button></div>
    </form>
  </main>;
}

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) { return <label style={{ ...s.field, ...(full ? s.full : {}) }}><span style={s.label}>{label}</span>{children}</label>; }
const s: Record<string, React.CSSProperties> = {
  main: { maxWidth: 1000, margin: "0 auto", padding: "2rem 1rem 5rem", color: "#3f2b1d" }, card: { display: "grid", gap: 22, padding: "1.3rem", border: "1px solid #d8b989", borderRadius: 16, background: "#fffaf0" }, grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14 }, field: { display: "grid", gap: 6 }, full: { gridColumn: "1 / -1" }, label: { fontSize: 13, fontWeight: 800 }, input: { width: "100%", boxSizing: "border-box", padding: ".72rem", border: "1px solid #d8b989", borderRadius: 10, background: "white" }, section: { display: "grid", gap: 10, paddingTop: 16, borderTop: "1px solid #ead8b7" }, h2: { margin: 0, fontSize: 19 }, schedule: { display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr auto", gap: 8, alignItems: "center" }, checks: { display: "flex", gap: 8, flexWrap: "wrap" }, check: { display: "flex", gap: 6, alignItems: "center", padding: ".55rem .7rem", border: "1px solid #dec79e", borderRadius: 10, background: "white" }, actions: { display: "flex", gap: 10, flexWrap: "wrap" }, primary: { border: 0, borderRadius: 10, background: "#74401f", color: "white", padding: ".72rem 1rem", fontWeight: 800, cursor: "pointer" }, secondary: { border: "1px solid #c9ad7d", borderRadius: 10, background: "#fffaf0", color: "#5d3b22", padding: ".65rem .9rem", fontWeight: 700, cursor: "pointer" }, small: { border: "1px solid #d8b989", borderRadius: 8, background: "white", color: "#6a4528", padding: ".45rem .65rem" }, error: { padding: "1rem", border: "1px solid #b96c59", background: "#fff2ed", borderRadius: 12, marginBottom: 14 }, muted: { margin: 0, color: "#806a58" }, optional: { fontWeight: 400, color: "#806a58" },
};
