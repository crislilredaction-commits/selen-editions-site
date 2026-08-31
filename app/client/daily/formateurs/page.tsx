"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

type Trainer = { id?: string; display_name?: string; professional_email?: string | null; phone?: string | null; status?: string | null };

export default function DailyTrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/client/daily/workspace", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Chargement impossible.");
      setTrainers(body.workspace?.trainers ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createTrainer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/client/daily/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_trainer",
          display_name: values.get("display_name"),
          professional_email: values.get("professional_email"),
          phone: values.get("phone"),
          engagement_type: values.get("engagement_type") || "external",
          status: "draft",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Création du formateur impossible.");
      setTrainers(body.workspace?.trainers ?? []);
      form.reset();
      setShowCreate(false);
      setMessage("Formateur ajouté.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création du formateur impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingMascot message="Sélion rassemble vos formateurs…" />;

  return <main style={s.page}>
    <div style={s.wrap}>
      <header style={s.hero}><p style={s.kicker}>Selen Daily · Formateurs</p><h1 style={s.h1}>Mes formateurs</h1><p style={s.lead}>Centralisez les profils, compétences et suivis nécessaires à vos dossiers de formation et à Qualiopi.</p></header>
      {error ? <p style={s.error}>{error}</p> : null}
      {message ? <p style={s.success}>{message}</p> : null}

      <section style={s.card}>
        <button type="button" onClick={() => setShowCreate((value) => !value)} aria-expanded={showCreate} style={s.toggleButton}>
          <span>Ajouter un nouveau formateur</span>
          <span aria-hidden>{showCreate ? "▲" : "▼"}</span>
        </button>
        {showCreate ? (
          <form onSubmit={createTrainer} style={s.form}>
            <div style={s.formGrid}>
              <label style={s.fieldLabel}>Nom et prénom *<input name="display_name" required placeholder="Ex. Marie Dupont" style={s.input} /></label>
              <label style={s.fieldLabel}>Email professionnel<input name="professional_email" type="email" placeholder="marie@organisme.fr" style={s.input} /></label>
              <label style={s.fieldLabel}>Téléphone<input name="phone" placeholder="06…" style={s.input} /></label>
              <label style={s.fieldLabel}>Statut<select name="engagement_type" defaultValue="external" style={s.input}><option value="external">Formateur externe</option><option value="employee">Formateur salarié</option><option value="owner">Dirigeant / formateur</option></select></label>
            </div>
            <button type="submit" disabled={saving} style={{...s.primaryButton,opacity:saving?.65:1}}>{saving ? "Ajout en cours…" : "Ajouter le formateur"}</button>
          </form>
        ) : <p style={s.collapseHelp}>Le formulaire reste masqué tant que vous n’avez pas besoin d’ajouter un formateur.</p>}
      </section>

      <section style={s.links}>
        <Link href="/client/daily/formateurs/suivi-annuel" style={s.linkCard}><strong>Suivi annuel des formateurs</strong><span>Compétences, veille et développement professionnel →</span></Link>
        <Link href="/client/daily/formateurs/certifications" style={s.linkCard}><strong>Certifications des formateurs</strong><span>Consulter les certifications et leurs justificatifs →</span></Link>
      </section>
      <section style={s.card}>
        <h2 style={s.h2}>{trainers.length} formateur{trainers.length > 1 ? "s" : ""} référencé{trainers.length > 1 ? "s" : ""}</h2>
        {trainers.length === 0 ? <p style={s.muted}>Aucun formateur n’est encore référencé.</p> : <div style={s.list}>{trainers.map((trainer, index) => <article key={trainer.id ?? index} style={s.row}><div><strong>{trainer.display_name || "Formateur"}</strong><p style={s.muted}>{trainer.professional_email || "Email non renseigné"}{trainer.phone ? ` · ${trainer.phone}` : ""}</p></div><span style={s.badge}>{trainer.status || "brouillon"}</span></article>)}</div>}
      </section>
    </div>
  </main>;
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "2rem 1rem 5rem", background: "linear-gradient(180deg,#eadfbf,#e0cf9f)", color: "#392a19" },
  wrap: { maxWidth: 950, margin: "0 auto", display: "grid", gap: "1rem" },
  hero: { background: "#f8f0dc", border: "1px solid #d9c391", padding: "1.5rem" },
  kicker: { textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 800, color: "#9b682d" },
  h1: { fontFamily: "Georgia,serif", fontSize: "clamp(2rem,5vw,3rem)", margin: ".4rem 0" },
  lead: { color: "#725e46", lineHeight: 1.6 },
  links: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: ".8rem" },
  linkCard: { background: "#f8f0dc", border: "1px solid #d9c391", padding: "1rem 1.1rem", color: "#392a19", textDecoration: "none", display: "grid", gap: 5 },
  card: { background: "#f8f0dc", border: "1px solid #d9c391", padding: "1.4rem" },
  toggleButton: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", border: 0, background: "transparent", padding: 0, color: "#392a19", fontSize: "1.05rem", fontWeight: 800, cursor: "pointer", textAlign: "left" },
  collapseHelp: { color: "#806c52", fontSize: 13, margin: ".55rem 0 0" },
  form: { display: "grid", gap: ".85rem", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #d9c391" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: ".75rem" },
  fieldLabel: { display: "grid", gap: ".35rem", fontSize: 13, fontWeight: 700, color: "#5c4933" },
  input: { width: "100%", boxSizing: "border-box", minHeight: 42, padding: ".65rem .7rem", border: "1px solid #c9ae78", background: "white", color: "#392a19" },
  primaryButton: { width: "fit-content", padding: ".7rem 1rem", border: "1px solid #7a2e22", borderRadius: 6, background: "#7a2e22", color: "#f8f0dc", fontWeight: 800, cursor: "pointer" },
  h2: { fontFamily: "Georgia,serif", marginTop: 0 },
  list: { display: "grid", gap: ".6rem" },
  row: { border: "1px solid rgba(160,106,44,.22)", padding: ".9rem 1rem", display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" },
  muted: { color: "#806c52", marginBottom: 0 },
  badge: { fontSize: 11, textTransform: "uppercase", background: "#7a2e22", color: "#f8f0dc", padding: ".35rem .5rem" },
  error: { border: "1px solid #a64b3b", background: "#fff2ee", padding: ".8rem", color: "#7d2e22" },
  success: { border: "1px solid #748c54", background: "#f2f6e8", padding: ".8rem", color: "#4f6338" },
};
