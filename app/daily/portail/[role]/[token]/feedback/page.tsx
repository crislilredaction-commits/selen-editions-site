"use client";

import { FormEvent, useEffect, useState } from "react";
import Header from "@/components/Header";

type FormContext = {
  stakeholderType: string;
  submitterName: string;
  submitterEmail: string;
};

export default function StakeholderFeedbackPage({ params }: { params: { role: string; token: string } }) {
  const { role, token } = params;
  const [context, setContext] = useState<FormContext | null>(null);
  const [submissionType, setSubmissionType] = useState<"complaint" | "suggestion">("suggestion");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/daily-stakeholder-feedback/${token}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      setLoading(false);
      if (!response.ok) {
        setError(payload?.error ?? "Ce formulaire n'est pas disponible pour le moment.");
        return;
      }
      setContext(payload);
    }
    void load();
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSending(true);
    const response = await fetch(`/api/daily-stakeholder-feedback/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionType, subject, message }),
    });
    const payload = await response.json().catch(() => null);
    setSending(false);
    if (!response.ok) {
      setError(payload?.error ?? "L'envoi n'a pas pu être enregistré.");
      return;
    }
    setReference(String(payload?.reference ?? ""));
  }

  return (
    <main className="gazette-paper" style={s.page}>
      <Header />
      <section style={s.hero}>
        <p className="gazette-label">Selen Daily</p>
        <h1 style={s.title}>Réclamation ou suggestion</h1>
        <p style={s.subtitle}>
          Votre message est d'abord reçu par Selen. Il est examiné avant toute transmission à l'organisme de formation.
        </p>
        <a href={`/daily/portail/${role}/${token}`} style={s.back}>← Retour au portail</a>
      </section>

      {loading ? <p style={s.notice}>Ouverture du formulaire...</p> : null}
      {error ? <p style={s.error}>{error}</p> : null}

      {context && !reference ? (
        <form onSubmit={submit} style={s.form}>
          <div style={s.identity}>
            <strong>{context.submitterName || "Partie prenante Daily"}</strong>
            {context.submitterEmail ? <span>{context.submitterEmail}</span> : null}
          </div>

          <fieldset style={s.fieldset}>
            <legend style={s.legend}>Nature du message</legend>
            <label style={s.choice}>
              <input
                type="radio"
                name="submissionType"
                value="suggestion"
                checked={submissionType === "suggestion"}
                onChange={() => setSubmissionType("suggestion")}
              />
              Suggestion
            </label>
            <label style={s.choice}>
              <input
                type="radio"
                name="submissionType"
                value="complaint"
                checked={submissionType === "complaint"}
                onChange={() => setSubmissionType("complaint")}
              />
              Réclamation
            </label>
          </fieldset>

          <label style={s.label}>
            Objet
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={200}
              required
              style={s.input}
              placeholder="Ex. organisation, accessibilité, déroulement..."
            />
          </label>

          <label style={s.label}>
            Votre message
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={6000}
              required
              rows={8}
              style={s.textarea}
              placeholder="Décrivez les faits ou votre suggestion le plus précisément possible."
            />
          </label>

          <p style={s.help}>Les informations de votre portail permettent à Selen de rattacher le message à la bonne session.</p>
          <button type="submit" disabled={sending} style={s.button}>
            {sending ? "Envoi..." : "Envoyer à Selen"}
          </button>
        </form>
      ) : null}

      {reference ? (
        <section style={s.success}>
          <strong>Votre message a bien été transmis à Selen.</strong>
          <span>Référence : {reference}</span>
          <span>Il sera examiné avant toute transmission à l'organisme de formation.</span>
          <a href={`/daily/portail/${role}/${token}`} style={s.back}>Retour au portail</a>
        </section>
      ) : null}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "1rem", color: "var(--ink)" },
  hero: { maxWidth: 760, margin: "1rem auto", display: "grid", gap: "0.5rem" },
  title: { margin: 0, color: "var(--ink)", fontSize: "clamp(1.7rem, 5vw, 2.5rem)" },
  subtitle: { margin: 0, color: "var(--ink-soft)", lineHeight: 1.6 },
  back: { color: "var(--rust)", fontWeight: 800, textDecoration: "none", width: "fit-content" },
  notice: { maxWidth: 760, margin: "1rem auto", color: "var(--ink-soft)" },
  error: { maxWidth: 760, margin: "1rem auto", border: "1px solid var(--rust)", background: "rgba(138,75,36,0.08)", color: "var(--rust)", padding: "0.8rem" },
  form: { maxWidth: 760, margin: "1rem auto 3rem", display: "grid", gap: "1rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", padding: "clamp(1rem, 4vw, 1.5rem)" },
  identity: { display: "grid", gap: "0.2rem", paddingBottom: "0.75rem", borderBottom: "1px solid rgba(178,138,98,0.28)" },
  fieldset: { border: "1px solid var(--sepia-mid)", padding: "0.85rem", display: "flex", flexWrap: "wrap", gap: "1rem" },
  legend: { fontWeight: 800, padding: "0 0.35rem" },
  choice: { display: "flex", gap: "0.45rem", alignItems: "center" },
  label: { display: "grid", gap: "0.4rem", fontWeight: 800 },
  input: { width: "100%", padding: "0.8rem", border: "1px solid var(--sepia-mid)", background: "white", font: "inherit" },
  textarea: { width: "100%", padding: "0.8rem", border: "1px solid var(--sepia-mid)", background: "white", font: "inherit", resize: "vertical" },
  help: { margin: 0, color: "var(--ink-soft)", lineHeight: 1.5, fontSize: "0.92rem" },
  button: { border: 0, padding: "0.9rem 1rem", background: "var(--rust)", color: "white", fontWeight: 800, cursor: "pointer" },
  success: { maxWidth: 760, margin: "1rem auto 3rem", display: "grid", gap: "0.7rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", padding: "1rem" },
};
