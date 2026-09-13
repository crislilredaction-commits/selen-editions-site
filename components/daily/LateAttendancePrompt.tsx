"use client";

import { useEffect, useMemo, useState } from "react";

type Json = Record<string, any>;
type Props = { role: string; token: string };

export default function LateAttendancePrompt({ role, token }: Props) {
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/daily-portal/${token}/attendance`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error ?? "Présences indisponibles.");
        setData(body);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Présences indisponibles."));
  }, [token]);

  const forgotten = useMemo(() => {
    if (role !== "learner" && role !== "apprenant") return [];
    return (data?.slots ?? []).filter((slot: Json) =>
      slot.phase === "closed" && (slot.attendance ?? []).some((entry: Json) => entry.status === "pending"),
    );
  }, [data, role]);

  if ((role !== "learner" && role !== "apprenant") || (!error && forgotten.length === 0)) return null;

  return <section style={{ maxWidth: 900, margin: "-3rem auto 4rem", padding: "0 1rem", color: "var(--ink)" }}>
    <div style={{ padding: 16, border: "1px solid var(--sepia-mid)", background: "var(--paper)" }}>
      <h2 style={{ marginTop: 0 }}>Émargement oublié</h2>
      <p style={{ color: "var(--ink-soft)", lineHeight: 1.55 }}>Un créneau terminé peut encore être régularisé depuis cette session. La date enregistrée sera celle de votre signature réelle, jamais la date théorique du créneau.</p>
      {error ? <p style={{ padding: 10, border: "1px solid #a64" }}>{error}</p> : null}
      <div style={{ display: "grid", gap: 8 }}>{forgotten.map((slot: Json) => <div key={slot.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: 10, border: "1px solid var(--sepia-mid)", flexWrap: "wrap" }}><div><strong>{new Date(`${slot.date}T12:00:00`).toLocaleDateString("fr-FR")} · {String(slot.startsAt).slice(0,5)} à {String(slot.endsAt).slice(0,5)}</strong>{slot.label ? <p style={{ margin: ".25rem 0 0", color: "var(--ink-soft)" }}>{slot.label}</p> : null}</div><a href={`/daily/portail/${role}/${token}/presence/${slot.id}/rattrapage`} style={{ fontWeight: 800, color: "var(--rust)" }}>Émarger maintenant</a></div>)}</div>
    </div>
  </section>;
}
