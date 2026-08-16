"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Review = {
  id: string;
  review_year: number;
  status: "draft" | "submitted";
  strengths?: string | null;
  weaknesses?: string | null;
  improvement_areas?: string | null;
  proposed_solutions?: string | null;
  submitted_at?: string | null;
  reminder_count?: number | null;
};

type Training = {
  id: string;
  training_kind: "completed" | "planned";
  title: string;
  provider?: string | null;
  completed_on?: string | null;
  attestation_document_id?: string | null;
  note?: string | null;
};

type Payload = {
  year: number;
  trainer: { id: string; display_name?: string | null; cv_updated_at?: string | null; cv_review_due_at?: string | null };
  review: Review | null;
  trainings: Training[];
};

const emptyForm = {
  strengths: "",
  weaknesses: "",
  improvement_areas: "",
  proposed_solutions: "",
};

export default function TrainerAnnualReviewPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/client/daily/trainer-annual-review", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? "Chargement du suivi annuel impossible.");
    const next = payload as Payload;
    setData(next);
    setForm({
      strengths: next.review?.strengths ?? "",
      weaknesses: next.review?.weaknesses ?? "",
      improvement_areas: next.review?.improvement_areas ?? "",
      proposed_solutions: next.review?.proposed_solutions ?? "",
    });
  }, []);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Chargement impossible.")).finally(() => setLoading(false));
  }, [load]);

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/client/daily/trainer-annual-review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "L’action n’a pas abouti.");
      return false;
    }
    if (payload?.review !== undefined) {
      const next = payload as Payload;
      setData(next);
      setForm({
        strengths: next.review?.strengths ?? "",
        weaknesses: next.review?.weaknesses ?? "",
        improvement_areas: next.review?.improvement_areas ?? "",
        proposed_solutions: next.review?.proposed_solutions ?? "",
      });
    } else {
      await load();
    }
    setMessage(success);
    return true;
  }

  async function uploadAttestation(trainingId: string, file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    const body = new FormData();
    body.set("training_id", trainingId);
    body.set("file", file);
    const response = await fetch("/api/client/daily/trainer-annual-review/attestation", { method: "POST", body });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Téléversement de l’attestation impossible.");
      return;
    }
    await load();
    setMessage("Attestation ajoutée.");
  }

  if (loading) return <main style={styles.page}><p>Ouverture de votre suivi annuel…</p></main>;
  if (!data) return <main style={styles.page}><Link href="/client/daily">← Daily</Link><section style={styles.card}><h1>Mon suivi annuel</h1><p style={styles.error}>{error}</p></section></main>;

  const submitted = data.review?.status === "submitted";
  const completed = data.trainings.filter((item) => item.training_kind === "completed");
  const planned = data.trainings.filter((item) => item.training_kind === "planned");
  const completedMissingAttestation = completed.filter((item) => !item.attestation_document_id).length;

  return (
    <main className="gazette-paper" style={styles.page}>
      <Link href="/client/daily/organisation" style={styles.back}>← Mon organisme</Link>
      <header className="gazette-cta" style={styles.hero}>
        <p className="gazette-label">Selen Daily · Formateur</p>
        <h1 className="gazette-hero-title">Mon auto-évaluation {data.year}</h1>
        <p style={styles.heroText}>{data.trainer.display_name || "Formateur"} · un point annuel simple pour garder une trace de vos compétences et de vos besoins de développement.</p>
      </header>

      {message ? <p style={styles.success}>{message}</p> : null}
      {error ? <p style={styles.error}>{error}</p> : null}

      {submitted ? (
        <section style={styles.statusCard}>
          <strong>✓ Auto-évaluation transmise</strong>
          <p style={styles.muted}>Transmise le {formatDate(data.review?.submitted_at)}. Elle reste conservée comme preuve annuelle et n’est plus modifiable.</p>
        </section>
      ) : (
        <section style={styles.statusCard}>
          <strong>À compléter cette année</strong>
          <p style={styles.muted}>Le questionnaire reste en brouillon jusqu’à votre envoi final. Selen pourra vous relancer tant qu’il n’est pas terminé.</p>
        </section>
      )}

      <section style={styles.card}>
        <h2 style={styles.title}>1. Votre regard sur l’année écoulée</h2>
        <form onSubmit={(event) => { event.preventDefault(); void patch({ action: "save_review", ...form }, "Brouillon enregistré."); }} style={styles.form}>
          <TextArea label="Mes points forts" value={form.strengths} disabled={submitted} onChange={(value) => setForm((current) => ({ ...current, strengths: value }))} placeholder="Ce que vous maîtrisez particulièrement bien aujourd’hui…" />
          <TextArea label="Mes points faibles ou difficultés" value={form.weaknesses} disabled={submitted} onChange={(value) => setForm((current) => ({ ...current, weaknesses: value }))} placeholder="Les sujets sur lesquels vous êtes moins à l’aise ou souhaitez progresser…" />
          <TextArea label="Mes axes d’amélioration" value={form.improvement_areas} disabled={submitted} onChange={(value) => setForm((current) => ({ ...current, improvement_areas: value }))} placeholder="Les compétences ou pratiques que vous souhaitez renforcer…" />
          <TextArea label="Solutions ou actions proposées" value={form.proposed_solutions} disabled={submitted} onChange={(value) => setForm((current) => ({ ...current, proposed_solutions: value }))} placeholder="Formation, veille, accompagnement, mise en pratique, tutorat…" />
          {!submitted ? <button className="btn-ink" disabled={busy}><span>{busy ? "Enregistrement…" : "Enregistrer le brouillon"}</span></button> : null}
        </form>
      </section>

      <section style={styles.card}>
        <h2 style={styles.title}>2. Formations suivies pendant l’année</h2>
        <p style={styles.muted}>Ajoutez les formations réellement suivies et joignez leur attestation. L’attestation est nécessaire avant l’envoi final.</p>
        {completed.length === 0 ? <p style={styles.empty}>Aucune formation ajoutée.</p> : completed.map((training) => (
          <div key={training.id} style={styles.row}>
            <div style={{ flex: 1 }}>
              <strong>{training.title}</strong>
              <p style={styles.muted}>{[training.provider, formatDate(training.completed_on)].filter(Boolean).join(" · ")}</p>
              <p style={training.attestation_document_id ? styles.good : styles.warning}>{training.attestation_document_id ? "✓ Attestation ajoutée" : "Attestation à ajouter"}</p>
            </div>
            {!submitted && !training.attestation_document_id ? <label style={styles.fileButton}>Ajouter l’attestation<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} style={{ display: "none" }} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttestation(training.id, file); event.currentTarget.value = ""; }} /></label> : null}
          </div>
        ))}
        {!submitted ? <TrainingForm kind="completed" busy={busy} onSubmit={(values) => patch({ action: "add_training", training_kind: "completed", ...values }, "Formation suivie ajoutée.")} /> : null}
      </section>

      <section style={styles.card}>
        <h2 style={styles.title}>3. Formations envisagées pour l’année à venir</h2>
        <p style={styles.muted}>Il ne s’agit pas d’un engagement : indiquez simplement les besoins ou formations que vous envisagez.</p>
        {planned.length === 0 ? <p style={styles.empty}>Aucune formation envisagée ajoutée.</p> : planned.map((training) => (
          <div key={training.id} style={styles.row}>
            <div><strong>{training.title}</strong><p style={styles.muted}>{training.provider || "Organisme à déterminer"}{training.note ? ` · ${training.note}` : ""}</p></div>
          </div>
        ))}
        {!submitted ? <TrainingForm kind="planned" busy={busy} onSubmit={(values) => patch({ action: "add_training", training_kind: "planned", ...values }, "Formation envisagée ajoutée.")} /> : null}
      </section>

      {!submitted ? (
        <section style={styles.submitCard}>
          <h2 style={styles.title}>Transmettre mon auto-évaluation</h2>
          <p style={styles.muted}>Après transmission, elle ne sera plus modifiable. Le responsable de votre organisme pourra en prendre connaissance.</p>
          {completedMissingAttestation > 0 ? <p style={styles.warning}>{completedMissingAttestation} attestation{completedMissingAttestation > 1 ? "s" : ""} manque{completedMissingAttestation > 1 ? "nt" : ""} encore.</p> : null}
          <button className="btn-ink" disabled={busy || completedMissingAttestation > 0} onClick={() => void patch({ action: "submit_review" }, "Auto-évaluation transmise.")}><span>{busy ? "Transmission…" : "Transmettre définitivement"}</span></button>
        </section>
      ) : null}
    </main>
  );
}

function TextArea({ label, value, disabled, placeholder, onChange }: { label: string; value: string; disabled: boolean; placeholder: string; onChange: (value: string) => void }) {
  return <label style={styles.field}><span style={styles.label}>{label}</span><textarea rows={5} value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} style={styles.textarea} /></label>;
}

function TrainingForm({ kind, busy, onSubmit }: { kind: "completed" | "planned"; busy: boolean; onSubmit: (values: Record<string, string>) => Promise<boolean> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const ok = await onSubmit(values);
    if (ok) form.reset();
  }
  return <form onSubmit={submit} style={styles.trainingForm}>
    <strong>{kind === "completed" ? "Ajouter une formation suivie" : "Ajouter une formation envisagée"}</strong>
    <input name="title" required placeholder="Intitulé de la formation" style={styles.input} />
    <input name="provider" placeholder="Organisme / prestataire (facultatif)" style={styles.input} />
    {kind === "completed" ? <label style={styles.field}><span style={styles.label}>Date de fin</span><input name="completed_on" required type="date" style={styles.input} /></label> : null}
    <input name="note" placeholder={kind === "planned" ? "Objectif ou précision (facultatif)" : "Note (facultatif)"} style={styles.input} />
    <button className="btn-ghost" disabled={busy}><span>Ajouter</span></button>
  </form>;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR").format(date);
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 980, margin: "0 auto", padding: "1.5rem 1rem 4rem" },
  back: { color: "var(--rust)", textDecoration: "none" },
  hero: { marginTop: "1rem", padding: "1.5rem", border: "1px solid var(--sepia-mid)" },
  heroText: { maxWidth: 720, lineHeight: 1.6 },
  card: { marginTop: "1rem", padding: "1.25rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)" },
  statusCard: { marginTop: "1rem", padding: "1rem 1.25rem", border: "1px solid var(--sepia-mid)", background: "rgba(201,160,85,.08)" },
  submitCard: { marginTop: "1rem", padding: "1.25rem", border: "2px solid var(--rust)", background: "rgba(138,75,36,.05)" },
  title: { marginTop: 0 },
  form: { display: "grid", gap: "1rem" },
  field: { display: "grid", gap: ".4rem" },
  label: { fontWeight: 700 },
  textarea: { width: "100%", boxSizing: "border-box", padding: ".75rem", border: "1px solid var(--sepia-mid)", background: "#fffdf8", font: "inherit", lineHeight: 1.5 },
  input: { width: "100%", boxSizing: "border-box", padding: ".7rem", border: "1px solid var(--sepia-mid)", background: "#fffdf8", font: "inherit" },
  row: { display: "flex", gap: "1rem", alignItems: "center", justifyContent: "space-between", padding: ".9rem 0", borderBottom: "1px solid rgba(120,90,50,.15)" },
  trainingForm: { marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed var(--sepia-mid)", display: "grid", gap: ".7rem" },
  muted: { color: "var(--ink-soft)", lineHeight: 1.5, marginBottom: ".4rem" },
  empty: { color: "var(--ink-soft)", fontStyle: "italic" },
  good: { color: "#3d6a4a", fontWeight: 700, margin: 0 },
  warning: { color: "#9a5b16", fontWeight: 700 },
  success: { padding: ".8rem 1rem", background: "rgba(61,106,74,.1)", border: "1px solid rgba(61,106,74,.35)" },
  error: { padding: ".8rem 1rem", color: "#8a2d24", background: "rgba(138,45,36,.08)", border: "1px solid rgba(138,45,36,.25)" },
  fileButton: { cursor: "pointer", border: "1px solid var(--rust)", padding: ".55rem .75rem", color: "var(--rust)", fontWeight: 700, whiteSpace: "nowrap" },
};
