"use client";

import { FormEvent, useState } from "react";

type SubmissionType = "complaint" | "suggestion";

export default function NewFeedbackForm() {
  const [submissionType, setSubmissionType] = useState<SubmissionType>("suggestion");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      const request = await fetch("/api/client/daily/stakeholder-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionType, subject, message }),
      });
      const payload = await request.json().catch(() => ({}));
      if (!request.ok) throw new Error(payload.error || "Le message n’a pas pu être transmis.");
      setReference(String(payload.reference ?? ""));
      setSubject("");
      setMessage("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le message n’a pas pu être transmis.");
    } finally {
      setPending(false);
    }
  }

  if (reference) {
    return (
      <section style={s.success}>
        <strong>Votre message a bien été transmis à Selen.</strong>
        <span>Référence : {reference}</span>
        <span>Il sera examiné par Selen avant toute transmission à votre organisme.</span>
        <button type="button" onClick={() => setReference("")} style={s.secondaryButton}>
          Envoyer un autre message
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} style={s.form}>
      <div>
        <h2 style={s.title}>Transmettre une réclamation ou une suggestion</h2>
        <p style={s.help}>Ce message est reçu d’abord par Selen. Il n’est pas transmis automatiquement à l’organisme.</p>
      </div>

      <fieldset style={s.fieldset}>
        <legend style={s.legend}>Nature du message</legend>
        <label style={s.choice}>
          <input
            type="radio"
            name="submissionType"
            checked={submissionType === "suggestion"}
            onChange={() => setSubmissionType("suggestion")}
          />
          Suggestion
        </label>
        <label style={s.choice}>
          <input
            type="radio"
            name="submissionType"
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
          disabled={pending}
          style={s.input}
        />
      </label>

      <label style={s.label}>
        Votre message
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={6000}
          rows={7}
          required
          disabled={pending}
          style={s.textarea}
        />
      </label>

      <button type="submit" disabled={pending} style={s.button}>
        {pending ? "Transmission…" : "Envoyer à Selen"}
      </button>
      {error ? <p style={s.error}>{error}</p> : null}
    </form>
  );
}

const s: Record<string, React.CSSProperties> = {
  form: { display: "grid", gap: "1rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)", padding: "1rem", marginBottom: "1.25rem" },
  title: { margin: 0, color: "var(--ink)", fontSize: "1.15rem" },
  help: { margin: ".35rem 0 0", color: "var(--ink-soft)", lineHeight: 1.5 },
  fieldset: { border: "1px solid var(--sepia-mid)", padding: ".85rem", display: "flex", flexWrap: "wrap", gap: "1rem" },
  legend: { fontWeight: 800, padding: "0 .35rem" },
  choice: { display: "flex", alignItems: "center", gap: ".45rem" },
  label: { display: "grid", gap: ".4rem", fontWeight: 800 },
  input: { width: "100%", boxSizing: "border-box", padding: ".8rem", border: "1px solid var(--sepia-mid)", background: "white", font: "inherit" },
  textarea: { width: "100%", boxSizing: "border-box", padding: ".8rem", border: "1px solid var(--sepia-mid)", background: "white", font: "inherit", resize: "vertical" },
  button: { border: 0, width: "fit-content", minHeight: 44, padding: ".75rem 1rem", background: "var(--rust)", color: "white", fontWeight: 800, cursor: "pointer" },
  secondaryButton: { border: "1px solid var(--rust)", width: "fit-content", minHeight: 44, padding: ".65rem .8rem", background: "transparent", color: "var(--rust)", fontWeight: 800, cursor: "pointer" },
  error: { margin: 0, color: "var(--rust)" },
  success: { display: "grid", gap: ".55rem", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", background: "var(--paper)", padding: "1rem", marginBottom: "1.25rem" },
};
