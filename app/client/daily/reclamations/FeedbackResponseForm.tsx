"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function FeedbackResponseForm({ id, initialResponse = "" }: { id: string; initialResponse?: string }) {
  const router = useRouter();
  const [response, setResponse] = useState(initialResponse);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const trimmed = response.trim();
    if (!trimmed) {
      setError("Renseignez une réponse avant l’enregistrement.");
      return;
    }

    setPending(true);
    setError("");
    try {
      const request = await fetch("/api/client/daily/stakeholder-feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, response: trimmed }),
      });
      const payload = await request.json().catch(() => ({}));
      if (!request.ok) throw new Error(payload.error || "La réponse n’a pas pu être enregistrée.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La réponse n’a pas pu être enregistrée.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ marginTop: "1rem", paddingTop: ".9rem", borderTop: "1px solid rgba(178,138,98,.25)" }}>
      <label htmlFor={`feedback-response-${id}`} style={{ display: "grid", gap: ".4rem", fontWeight: 800 }}>
        Réponse de l’organisme
        <textarea
          id={`feedback-response-${id}`}
          value={response}
          onChange={(event) => setResponse(event.target.value)}
          rows={5}
          maxLength={6000}
          disabled={pending}
          placeholder="Indiquez la réponse ou les mesures prises. Selen gardera la demande ouverte jusqu’à sa clôture."
          style={{ width: "100%", boxSizing: "border-box", padding: ".8rem", border: "1px solid var(--sepia-mid)", background: "white", font: "inherit", resize: "vertical" }}
        />
      </label>
      <div style={{ display: "flex", gap: ".7rem", alignItems: "center", flexWrap: "wrap", marginTop: ".65rem" }}>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          style={{ border: 0, padding: ".75rem .9rem", background: "var(--rust)", color: "white", fontWeight: 800, cursor: pending ? "wait" : "pointer", opacity: pending ? .7 : 1 }}
        >
          {pending ? "Enregistrement…" : initialResponse ? "Mettre à jour la réponse" : "Enregistrer la réponse"}
        </button>
        <span style={{ color: "var(--ink-soft)", fontSize: ".86rem" }}>
          L’enregistrement ne clôture pas automatiquement la demande.
        </span>
      </div>
      {error ? <p style={{ color: "var(--rust)", marginBottom: 0, fontSize: ".88rem" }}>{error}</p> : null}
    </div>
  );
}
