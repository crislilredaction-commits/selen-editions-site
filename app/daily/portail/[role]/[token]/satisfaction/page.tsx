"use client";

import { FormEvent, useEffect, useState } from "react";
import Header from "@/components/Header";

type SatisfactionData = {
  available: boolean;
  availableFrom: string;
  alreadySubmitted: boolean;
  response?: { submitted_at?: string | null } | null;
  portalType: "enterprise" | "trainer";
  stakeholder: { name?: string | null; email?: string | null; label: string };
  session: { reference?: string | null; endDate?: string | null; formationTitle: string };
};

type FormState = {
  overall_rating: string;
  objectives_rating: string;
  trainer_rating: string;
  organisation_rating: string;
  would_recommend: string;
  strengths: string;
  improvements: string;
  free_comment: string;
};

const initialForm: FormState = {
  overall_rating: "",
  objectives_rating: "",
  trainer_rating: "",
  organisation_rating: "",
  would_recommend: "",
  strengths: "",
  improvements: "",
  free_comment: "",
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

export default function StakeholderSatisfactionPage({ params }: { params: { role: string; token: string } }) {
  const { token } = params;
  const [data, setData] = useState<SatisfactionData | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/daily-portal/${token}/satisfaction`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      setLoading(false);
      if (!res.ok) {
        setError(payload?.error ?? "Questionnaire indisponible.");
        return;
      }
      setData(payload);
    }
    void load();
  }, [token]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.overall_rating) {
      setError("Merci d’indiquer votre satisfaction globale.");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/daily-portal/${token}/satisfaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        overall_rating: Number(form.overall_rating),
        objectives_rating: form.objectives_rating ? Number(form.objectives_rating) : null,
        trainer_rating: form.trainer_rating ? Number(form.trainer_rating) : null,
        organisation_rating: form.organisation_rating ? Number(form.organisation_rating) : null,
        would_recommend: form.would_recommend === "yes" ? true : form.would_recommend === "no" ? false : null,
      }),
    });
    const payload = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(payload?.error ?? "Impossible d’enregistrer votre réponse.");
      return;
    }
    setSuccess(true);
  }

  const isTrainer = data?.portalType === "trainer";
  const portalRole = data?.portalType ?? "enterprise";
  const label = isTrainer ? "formateur" : "commanditaire";

  return (
    <main className="gazette-paper" style={s.page}>
      <Header />
      <section style={s.hero}>
        <p className="gazette-label">Selen Daily · satisfaction {label}</p>
        <h1 style={s.title}>Votre retour sur la formation</h1>
        <p style={s.subtitle}>
          {data?.session.formationTitle ?? "Formation Daily"}. Quelques minutes suffisent pour nous aider à mesurer la qualité de la prestation et les axes d’amélioration.
        </p>
        <a href={`/daily/portail/${portalRole}/${token}`} style={s.back}>← Retour au portail</a>
      </section>

      {loading ? <p style={s.state}>Chargement du questionnaire...</p> : null}
      {error ? <p style={s.error}>{error}</p> : null}

      {data && !data.available ? (
        <section style={s.panel}>
          <h2 style={s.panelTitle}>Questionnaire à venir</h2>
          <p style={s.text}>
            {isTrainer
              ? `Le questionnaire formateur sera disponible à partir du ${formatDate(data.availableFrom)}, dernier jour de la formation.`
              : `Le questionnaire commanditaire sera disponible à partir du ${formatDate(data.availableFrom)}, soit 10 jours après la fin de la formation.`}
          </p>
        </section>
      ) : null}

      {data?.alreadySubmitted || success ? (
        <section style={s.panel}>
          <h2 style={s.panelTitle}>Merci pour votre retour</h2>
          <p style={s.text}>Votre questionnaire a bien été enregistré. Il sera intégré à l’analyse de satisfaction de la session.</p>
        </section>
      ) : null}

      {data?.available && !data.alreadySubmitted && !success ? (
        <form onSubmit={submit} style={s.form}>
          <section style={s.panel}>
            <h2 style={s.panelTitle}>Évaluation</h2>
            <RatingField label="Satisfaction globale *" value={form.overall_rating} onChange={(value) => setField("overall_rating", value)} />
            <RatingField label="Atteinte des objectifs" value={form.objectives_rating} onChange={(value) => setField("objectives_rating", value)} />
            {isTrainer ? null : (
              <RatingField label="Qualité de l’intervention du formateur" value={form.trainer_rating} onChange={(value) => setField("trainer_rating", value)} />
            )}
            <RatingField label="Organisation et suivi administratif" value={form.organisation_rating} onChange={(value) => setField("organisation_rating", value)} />
            <label style={s.field}>
              <span>{isTrainer ? "Recommanderiez-vous l’organisation de cette session ?" : "Recommanderiez-vous cette formation ?"}</span>
              <select value={form.would_recommend} onChange={(event) => setField("would_recommend", event.target.value)} style={s.input}>
                <option value="">Non renseigné</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
              </select>
            </label>
          </section>

          <section style={s.panel}>
            <h2 style={s.panelTitle}>Votre appréciation</h2>
            <TextField label="Points forts" value={form.strengths} onChange={(value) => setField("strengths", value)} />
            <TextField label="Points à améliorer" value={form.improvements} onChange={(value) => setField("improvements", value)} />
            <TextField label="Commentaire libre" value={form.free_comment} onChange={(value) => setField("free_comment", value)} />
          </section>

          <button type="submit" disabled={submitting} style={s.button}>
            {submitting ? "Enregistrement..." : "Transmettre mon questionnaire"}
          </button>
          <p style={s.notice}>Votre réponse est rattachée à la session concernée et utilisée pour l’analyse qualité de l’organisme de formation.</p>
        </form>
      ) : null}
    </main>
  );
}

function RatingField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={s.field}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={s.input}>
        <option value="">Non renseigné</option>
        <option value="1">1 · Très insatisfait</option>
        <option value="2">2 · Insatisfait</option>
        <option value="3">3 · Satisfaisant</option>
        <option value="4">4 · Très satisfaisant</option>
        <option value="5">5 · Excellent</option>
      </select>
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={s.field}>
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} maxLength={4000} style={{ ...s.input, resize: "vertical" }} />
    </label>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "1rem", color: "var(--ink)" },
  hero: { maxWidth: 780, margin: "1rem auto", display: "grid", gap: "0.55rem" },
  title: { color: "var(--ink)", margin: 0, fontSize: "clamp(1.7rem, 4vw, 2.6rem)" },
  subtitle: { color: "var(--ink-soft)", lineHeight: 1.65, margin: 0 },
  back: { color: "var(--rust)", fontWeight: 800, textDecoration: "none", width: "fit-content" },
  form: { maxWidth: 780, margin: "1rem auto 3rem", display: "grid", gap: "1rem" },
  panel: { maxWidth: 780, margin: "1rem auto", display: "grid", gap: "1rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", padding: "1rem" },
  panelTitle: { margin: 0, color: "var(--ink)", fontSize: "1.15rem" },
  field: { display: "grid", gap: "0.4rem", color: "var(--ink)", fontWeight: 700, fontSize: "0.95rem" },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid var(--sepia-mid)", background: "var(--paper)", color: "var(--ink)", padding: "0.75rem", font: "inherit" },
  button: { border: 0, background: "var(--rust)", color: "#fff", fontWeight: 800, padding: "0.9rem 1.1rem", cursor: "pointer" },
  notice: { margin: 0, color: "var(--ink-soft)", fontSize: "0.85rem", lineHeight: 1.55 },
  state: { maxWidth: 780, margin: "1rem auto", color: "var(--ink-soft)" },
  error: { maxWidth: 780, margin: "1rem auto", border: "1px solid var(--rust)", background: "rgba(138,75,36,0.08)", color: "var(--rust)", padding: "0.75rem" },
  text: { margin: 0, color: "var(--ink-soft)", lineHeight: 1.65 },
};
