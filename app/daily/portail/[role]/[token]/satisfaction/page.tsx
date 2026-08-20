"use client";

import { FormEvent, useEffect, useState } from "react";
import Header from "@/components/Header";

type ContextData = {
  stakeholderType: "company" | "trainer";
  entityName: string | null;
  entityEmail: string | null;
  formationTitle: string;
  dueDate: string;
  isDue: boolean;
  completed: boolean;
  submittedAt: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function RatingField({ label, name, required = false }: { label: string; name: string; required?: boolean }) {
  return (
    <label style={s.field}>
      <span style={s.label}>{label}{required ? " *" : ""}</span>
      <select name={name} required={required} defaultValue="" style={s.input}>
        <option value="">Non renseigné</option>
        {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
      </select>
    </label>
  );
}

export default function StakeholderSatisfactionPage({ params }: { params: { role: string; token: string } }) {
  const { role, token } = params;
  const [context, setContext] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/daily-stakeholder-satisfaction/${token}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      setLoading(false);
      if (!response.ok) {
        setError(payload?.error ?? "Questionnaire indisponible.");
        return;
      }
      setContext(payload);
      setDone(Boolean(payload.completed));
    }
    void load();
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      overall_rating: form.get("overall_rating"),
      objectives_rating: form.get("objectives_rating"),
      trainer_rating: form.get("trainer_rating"),
      organisation_rating: form.get("organisation_rating"),
      would_recommend: form.get("would_recommend") === "yes" ? true : form.get("would_recommend") === "no" ? false : null,
      strengths: form.get("strengths"),
      improvements: form.get("improvements"),
      free_comment: form.get("free_comment"),
    };

    const response = await fetch(`/api/daily-stakeholder-satisfaction/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setError(result?.error ?? "Impossible d'enregistrer votre réponse.");
      return;
    }
    setDone(true);
  }

  return (
    <main className="gazette-paper" style={s.page}>
      <Header />
      <section style={s.hero}>
        <p className="gazette-label">Selen Daily · Satisfaction</p>
        <h1 style={s.title}>Votre retour sur la formation</h1>
        <p style={s.subtitle}>
          {context ? `Formation : ${context.formationTitle}` : "Chargement du questionnaire..."}
        </p>
      </section>

      {loading ? <p style={s.message}>Ouverture du questionnaire...</p> : null}
      {error ? <p style={s.error}>{error}</p> : null}

      {context && !context.isDue && !done ? (
        <section style={s.card}>
          <strong>Questionnaire à venir</strong>
          <p style={s.paragraph}>Il sera disponible à partir du {formatDate(context.dueDate)}.</p>
          <a href={`/daily/portail/${role}/${token}`} style={s.link}>Retour au portail</a>
        </section>
      ) : null}

      {context && done ? (
        <section style={s.card}>
          <strong>Merci, votre réponse est enregistrée.</strong>
          <p style={s.paragraph}>{context.submittedAt ? `Réponse transmise le ${formatDate(context.submittedAt)}.` : "Votre avis a bien été pris en compte."}</p>
          <a href={`/daily/portail/${role}/${token}`} style={s.link}>Retour au portail</a>
        </section>
      ) : null}

      {context && context.isDue && !done ? (
        <form onSubmit={submit} style={s.card}>
          <p style={s.paragraph}>
            {context.stakeholderType === "company"
              ? "Ce questionnaire à froid est proposé au commanditaire dix jours après la fin de la session."
              : "Ce questionnaire permet de recueillir votre retour de formateur à la fin de la session."}
          </p>
          <RatingField label="Satisfaction globale" name="overall_rating" required />
          <RatingField label="Atteinte des objectifs" name="objectives_rating" />
          <RatingField label="Qualité de l'intervention du formateur" name="trainer_rating" />
          <RatingField label="Organisation de la formation" name="organisation_rating" />

          <label style={s.field}>
            <span style={s.label}>Recommanderiez-vous cette formation ?</span>
            <select name="would_recommend" defaultValue="" style={s.input}>
              <option value="">Non renseigné</option>
              <option value="yes">Oui</option>
              <option value="no">Non</option>
            </select>
          </label>

          <label style={s.field}>
            <span style={s.label}>Points forts</span>
            <textarea name="strengths" rows={4} style={s.textarea} />
          </label>
          <label style={s.field}>
            <span style={s.label}>Axes d'amélioration</span>
            <textarea name="improvements" rows={4} style={s.textarea} />
          </label>
          <label style={s.field}>
            <span style={s.label}>Commentaire libre</span>
            <textarea name="free_comment" rows={4} style={s.textarea} />
          </label>

          <button type="submit" disabled={saving} style={s.button}>
            {saving ? "Enregistrement..." : "Envoyer mon avis"}
          </button>
          <a href={`/daily/portail/${role}/${token}`} style={s.link}>Retour au portail</a>
        </form>
      ) : null}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "1rem", color: "var(--ink)" },
  hero: { maxWidth: 760, margin: "1rem auto", display: "grid", gap: "0.5rem" },
  title: { margin: 0, color: "var(--ink)", fontSize: "clamp(1.8rem, 5vw, 2.7rem)" },
  subtitle: { margin: 0, color: "var(--ink-soft)", lineHeight: 1.6 },
  card: { maxWidth: 760, margin: "1rem auto 3rem", display: "grid", gap: "1rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", padding: "clamp(1rem, 4vw, 1.5rem)" },
  field: { display: "grid", gap: "0.4rem" },
  label: { fontWeight: 800 },
  input: { minHeight: 44, width: "100%", border: "1px solid var(--sepia-mid)", background: "var(--paper)", color: "var(--ink)", padding: "0.65rem" },
  textarea: { width: "100%", border: "1px solid var(--sepia-mid)", background: "var(--paper)", color: "var(--ink)", padding: "0.65rem", resize: "vertical" },
  button: { minHeight: 46, border: 0, background: "var(--rust)", color: "#fffaf0", fontWeight: 800, cursor: "pointer", padding: "0.75rem 1rem" },
  link: { color: "var(--rust)", fontWeight: 800, textDecoration: "none" },
  paragraph: { margin: 0, color: "var(--ink-soft)", lineHeight: 1.6 },
  message: { maxWidth: 760, margin: "1rem auto", color: "var(--ink-soft)" },
  error: { maxWidth: 760, margin: "1rem auto", border: "1px solid var(--rust)", background: "rgba(138,75,36,0.08)", color: "var(--rust)", padding: "0.75rem" },
};
