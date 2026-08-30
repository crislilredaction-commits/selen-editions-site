"use client";

import { FormEvent, useEffect, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

type Procedure = {
  id: string;
  procedure_type: "learner_administration" | "stakeholder_satisfaction" | "absence_dropout";
  title: string;
  purpose: string | null;
  steps: string;
  responsibilities: string | null;
  evidence: string | null;
  status: "draft" | "active";
  reviewed_at: string | null;
  updated_at: string;
};

const prompts: Record<Procedure["procedure_type"], { purpose: string; steps: string; responsibilities: string; evidence: string }> = {
  learner_administration: {
    purpose: "Décrivez l’objectif de votre parcours administratif, de l’inscription à la remise des documents de fin de formation.",
    steps: "Décrivez les étapes dans l’ordre : informations recueillies, vérifications, documents remis, moments de remise et suivi.",
    responsibilities: "Précisez qui réalise ou contrôle chaque étape dans votre organisme.",
    evidence: "Indiquez les traces conservées : emails, accusés, documents signés, exports, dossiers de session…",
  },
  stakeholder_satisfaction: {
    purpose: "Expliquez comment vous recueillez et exploitez la satisfaction des apprenants, formateurs, entreprises et autres parties prenantes concernées.",
    steps: "Décrivez quand les questionnaires sont envoyés, comment les réponses sont suivies et comment les retours sont analysés.",
    responsibilities: "Précisez qui suit les réponses, les relances et les éventuelles actions d’amélioration.",
    evidence: "Indiquez les traces conservées : questionnaires, synthèses, relances et décisions prises.",
  },
  absence_dropout: {
    purpose: "Expliquez votre dispositif de prévention et de traitement des absences, ruptures de parcours et abandons.",
    steps: "Décrivez la détection, la prise de contact, la recherche de solution, les adaptations possibles et la clôture du suivi.",
    responsibilities: "Précisez qui alerte, qui contacte l’apprenant et qui décide des mesures à mettre en place.",
    evidence: "Indiquez les traces conservées : feuilles de présence, échanges, incidents, décisions et actions menées.",
  },
};

export default function DailyProceduresPage() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/client/daily/procedures", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Procédures indisponibles.");
      setProcedures((body.procedures ?? []) as Procedure[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(event: FormEvent<HTMLFormElement>, procedure: Procedure) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(procedure.procedure_type);
    setError("");
    setMessage("");
    const response = await fetch("/api/client/daily/procedures", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        procedureType: procedure.procedure_type,
        purpose: form.get("purpose"),
        steps: form.get("steps"),
        responsibilities: form.get("responsibilities"),
        evidence: form.get("evidence"),
        status: form.get("status"),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving("");
    if (!response.ok) {
      setError(body.error ?? "Enregistrement impossible.");
      return;
    }
    setProcedures((current) => current.map((item) => item.procedure_type === procedure.procedure_type ? body.procedure : item));
    setMessage("Votre procédure a bien été enregistrée.");
  }

  if (loading) return <LoadingMascot message="Sélion rassemble vos procédures…" />;

  return <main style={s.page}><div style={s.wrap}>
    <header style={s.card}>
      <p style={s.kicker}>Selen Daily · Qualité</p>
      <h1 style={s.h1}>Procédures internes</h1>
      <p style={s.muted}>Formalisez ici vos façons de faire. Ces procédures restent celles de votre organisme : Selen vous aide à les structurer et à conserver leur trace, sans exposer ses propres méthodes internes.</p>
    </header>
    {error ? <p style={s.error}>{error}</p> : null}
    {message ? <p style={s.ok}>{message}</p> : null}

    {procedures.map((procedure) => {
      const guidance = prompts[procedure.procedure_type];
      return <form key={procedure.id} onSubmit={(event) => void save(event, procedure)} style={s.card}>
        <div style={s.head}>
          <div><p style={s.kicker}>Procédure</p><h2 style={s.h2}>{procedure.title}</h2></div>
          <span style={procedure.status === "active" ? s.badgeOk : s.badgeDraft}>{procedure.status === "active" ? "Active" : "Brouillon"}</span>
        </div>
        <Field name="purpose" label="Objectif et périmètre" initial={procedure.purpose ?? ""} help={guidance.purpose} />
        <Field name="steps" label="Déroulement de la procédure" initial={procedure.steps} help={guidance.steps} rows={7} required />
        <Field name="responsibilities" label="Rôles et responsabilités" initial={procedure.responsibilities ?? ""} help={guidance.responsibilities} />
        <Field name="evidence" label="Traces et preuves conservées" initial={procedure.evidence ?? ""} help={guidance.evidence} />
        <div style={s.actions}>
          <label style={s.label}>État
            <select name="status" defaultValue={procedure.status} style={s.input}><option value="draft">Brouillon</option><option value="active">Active</option></select>
          </label>
          <button type="submit" disabled={saving === procedure.procedure_type} style={s.button}>{saving === procedure.procedure_type ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>;
    })}
  </div></main>;
}

function Field({ name, label, initial, help, rows = 4, required = false }: { name: string; label: string; initial: string; help: string; rows?: number; required?: boolean }) {
  return <label style={s.label}>{label}<textarea name={name} defaultValue={initial} rows={rows} required={required} style={s.input} /><small style={s.help}>{help}</small></label>;
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "linear-gradient(180deg,#eadfbf,#e0cf9f)", padding: "2rem 1rem 5rem", color: "#392a19" },
  wrap: { maxWidth: 980, margin: "auto", display: "grid", gap: 16 },
  card: { background: "#f8f0dc", border: "1px solid #d9c391", padding: "1.5rem", boxShadow: "0 8px 20px rgba(57,42,25,.08)", display: "grid", gap: 14 },
  kicker: { textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 800, color: "#9b682d", margin: 0 },
  h1: { fontFamily: "Georgia,serif", fontSize: "clamp(2rem,5vw,3rem)", margin: ".3rem 0" },
  h2: { fontFamily: "Georgia,serif", margin: ".25rem 0 0" },
  muted: { color: "#725e46", lineHeight: 1.6 },
  head: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" },
  label: { display: "grid", gap: 6, fontWeight: 800 },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #cdb785", background: "#fffaf0", padding: 10, color: "#392a19", font: "inherit" },
  help: { color: "#725e46", fontWeight: 400, lineHeight: 1.45 },
  actions: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap", borderTop: "1px solid #d9c391", paddingTop: 12 },
  button: { border: "1px solid #7a2e22", background: "#7a2e22", color: "#fff8e8", padding: ".72rem 1rem", fontWeight: 800, cursor: "pointer" },
  badgeOk: { padding: ".4rem .65rem", border: "1px solid #668153", color: "#455a3b" },
  badgeDraft: { padding: ".4rem .65rem", border: "1px solid #b5792d", color: "#7b4e19" },
  ok: { border: "1px solid #668153", padding: 10, color: "#455a3b", background: "#f3f8ef" },
  error: { border: "1px solid #a64b3b", padding: 10, color: "#7d2e22", background: "#fff2ee" },
};
