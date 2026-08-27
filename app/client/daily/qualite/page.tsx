"use client";

import { useEffect, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

type Settings = { required: boolean; enabled: boolean };

export default function DailyQualityPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/client/daily/quality-settings", { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => res.ok ? setSettings(body) : setError(body.error ?? "Réglage indisponible."))
      .catch(() => setError("Réglage indisponible."));
  }, []);

  async function toggle() {
    if (!settings || settings.required) return;
    setSaving(true);
    const res = await fetch("/api/client/daily/quality-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !settings.enabled }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setSettings(body);
    else setError(body.error ?? "Modification impossible.");
    setSaving(false);
  }

  if (!settings && !error) return <LoadingMascot message="Sélion prépare votre suivi qualité…" />;

  return <main style={s.page}>
    <section style={s.card}>
      <p style={s.kicker}>Selen Daily · Suivi Qualité</p>
      <h1 style={s.h1}>Suivi Qualité</h1>
      {error ? <p style={s.error}>{error}</p> : null}
      {settings ? <>
        <div style={s.status}>
          <strong>{settings.required ? "Obligatoire pour votre organisme" : settings.enabled ? "Suivi activé" : "Suivi désactivé"}</strong>
          <p style={s.text}>{settings.required
            ? "Votre organisme est déclaré Qualiopi. Le suivi qualité reste actif afin de conserver les preuves et actions utiles à vos audits."
            : "Votre organisme n'est pas déclaré Qualiopi. Vous pouvez conserver ce suivi par choix ou le désactiver."}</p>
        </div>
        {!settings.required ? <button type="button" onClick={toggle} disabled={saving} style={s.button}>
          {saving ? "Enregistrement…" : settings.enabled ? "Désactiver le suivi qualité" : "Activer le suivi qualité"}
        </button> : null}
      </> : null}
    </section>
  </main>;
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "2rem 1rem 4rem", background: "linear-gradient(180deg,#eadfbf,#e0cf9f)", color: "#392a19" },
  card: { maxWidth: 820, margin: "0 auto", background: "#f8f0dc", border: "1px solid #d9c391", padding: "2rem", boxShadow: "0 10px 24px rgba(57,42,25,.1)" },
  kicker: { textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 800, color: "#9b682d" },
  h1: { fontFamily: "Georgia,serif", fontSize: "clamp(2rem,5vw,3rem)", margin: ".5rem 0 1.5rem" },
  status: { border: "1px solid #d9c391", background: "rgba(255,250,240,.65)", padding: "1rem 1.2rem" },
  text: { lineHeight: 1.6, color: "#725e46", marginBottom: 0 },
  button: { marginTop: "1rem", border: "1px solid #7a2e22", background: "#7a2e22", color: "#f8f0dc", padding: ".75rem 1rem", fontWeight: 800, cursor: "pointer" },
  error: { border: "1px solid #a64b3b", background: "#fff2ee", color: "#7d2e22", padding: ".8rem" },
};
