"use client";

import { FormEvent, useEffect, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

type Settings = {
  required: boolean;
  enabled: boolean;
  qualiopiStatus: string;
  qualiopiValidFrom: string | null;
  qualiopiValidUntil: string | null;
  qualiopiSurveillanceAuditDate: string | null;
  qualiopiSurveillanceWindowStart: string | null;
  qualiopiSurveillanceWindowEnd: string | null;
  qualiopiRenewalReminderOn: string | null;
};

const fr = (value?: string | null) => value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(`${value}T00:00:00`)) : "—";

export default function DailyQualiopiPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [auditDate, setAuditDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/client/daily/quality-settings", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Cycle Qualiopi indisponible.");
      setSettings(data as Settings);
      setAuditDate(String(data.qualiopiSurveillanceAuditDate ?? ""));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveAuditDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auditDate) return;
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/client/daily/quality-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auditDate }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? "Enregistrement impossible.");
      return;
    }
    setSettings(data as Settings);
    setAuditDate(String(data.qualiopiSurveillanceAuditDate ?? auditDate));
    setMessage("La date de votre audit de surveillance est enregistrée. Selen prépare maintenant le suivi pré-audit.");
  }

  if (loading) return <LoadingMascot message="Sélion rassemble votre cycle Qualiopi…" />;

  return <main style={s.page}><div style={s.wrap}>
    <header style={s.card}>
      <p style={s.kicker}>Selen Daily · Qualiopi</p>
      <h1 style={s.h1}>Votre cycle de certification</h1>
      <p style={s.muted}>Retrouvez ici les dates utiles de votre cycle Qualiopi et renseignez votre audit de surveillance dès qu’il est planifié.</p>
    </header>

    {error ? <p style={s.error}>{error}</p> : null}
    {message ? <p style={s.ok}>{message}</p> : null}

    {!settings?.required ? <section style={s.card}>
      <h2>Certification non active</h2>
      <p style={s.muted}>Votre organisme n’est pas actuellement enregistré comme certifié Qualiopi. Le suivi du cycle apparaîtra ici lorsque la certification sera active.</p>
    </section> : <>
      <section style={s.grid}>
        <DateCard label="Début du cycle" value={settings.qualiopiValidFrom} />
        <DateCard label="Fin du cycle" value={settings.qualiopiValidUntil} />
        <DateCard label="Ouverture surveillance" value={settings.qualiopiSurveillanceWindowStart} />
        <DateCard label="Fin de fenêtre surveillance" value={settings.qualiopiSurveillanceWindowEnd} />
        <DateCard label="Rappel renouvellement" value={settings.qualiopiRenewalReminderOn} />
      </section>

      <section style={s.card}>
        <p style={s.kicker}>Audit de surveillance</p>
        <h2 style={{ marginTop: 4 }}>Date planifiée</h2>
        <p style={s.muted}>L’audit de surveillance doit se situer dans la fenêtre prévue pour votre cycle. Dès que vous renseignez sa date, Selen déclenche le suivi pré-audit auprès de l’agent qui accompagne votre organisme.</p>
        <form onSubmit={saveAuditDate} style={s.form}>
          <label style={s.label}>Date de l’audit
            <input
              type="date"
              value={auditDate}
              min={settings.qualiopiSurveillanceWindowStart ?? undefined}
              max={settings.qualiopiSurveillanceWindowEnd ?? undefined}
              onChange={(event) => setAuditDate(event.target.value)}
              required
              style={s.input}
            />
          </label>
          <button type="submit" disabled={saving || !auditDate} style={s.button}>{saving ? "Enregistrement…" : "Enregistrer la date"}</button>
        </form>
        {settings.qualiopiSurveillanceAuditDate ? <p style={s.okText}>Date actuellement enregistrée : <strong>{fr(settings.qualiopiSurveillanceAuditDate)}</strong>.</p> : null}
      </section>
    </>}
  </div></main>;
}

function DateCard({ label, value }: { label: string; value?: string | null }) {
  return <article style={s.dateCard}><span style={s.dateLabel}>{label}</span><strong style={s.dateValue}>{fr(value)}</strong></article>;
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "linear-gradient(180deg,#eadfbf,#e0cf9f)", padding: "2rem 1rem 5rem", color: "#392a19" },
  wrap: { maxWidth: 980, margin: "auto", display: "grid", gap: 16 },
  card: { background: "#f8f0dc", border: "1px solid #d9c391", padding: "1.5rem", boxShadow: "0 8px 20px rgba(57,42,25,.08)" },
  kicker: { textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 800, color: "#9b682d", margin: 0 },
  h1: { fontFamily: "Georgia,serif", fontSize: "clamp(2rem,5vw,3rem)", margin: ".3rem 0" },
  muted: { color: "#725e46", lineHeight: 1.6 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 },
  dateCard: { background: "#fffaf0", border: "1px solid #d9c391", padding: 14, display: "grid", gap: 6 },
  dateLabel: { color: "#725e46", fontSize: 12 },
  dateValue: { fontSize: 15 },
  form: { display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginTop: 18 },
  label: { fontWeight: 800, minWidth: 220 },
  input: { display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, border: "1px solid #cdb785", background: "#fffaf0", padding: 10, color: "#392a19" },
  button: { border: "1px solid #7a2e22", background: "#7a2e22", color: "#fff8e8", padding: ".72rem 1rem", fontWeight: 800, cursor: "pointer" },
  ok: { border: "1px solid #668153", padding: 10, color: "#455a3b", background: "#f3f8ef" },
  okText: { color: "#455a3b", marginBottom: 0 },
  error: { border: "1px solid #a64b3b", padding: 10, color: "#7d2e22", background: "#fff2ee" },
};
