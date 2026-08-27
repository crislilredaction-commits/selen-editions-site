"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

type Trainer = { id?: string; display_name?: string; professional_email?: string | null; status?: string | null };

export default function DailyTrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/client/daily/workspace", { cache: "no-store" })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => res.ok ? setTrainers(body.workspace?.trainers ?? []) : setError(body.error ?? "Chargement impossible."))
      .catch(() => setError("Chargement impossible."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingMascot message="Sélion rassemble vos formateurs…" />;

  return <main style={s.page}>
    <div style={s.wrap}>
      <header style={s.hero}><p style={s.kicker}>Selen Daily · Formateurs</p><h1 style={s.h1}>Mes formateurs</h1><p style={s.lead}>Centralisez les profils, compétences et suivis nécessaires à vos dossiers de formation et à Qualiopi.</p></header>
      {error ? <p style={s.error}>{error}</p> : null}
      <section style={s.links}>
        <Link href="/client/daily/formateurs/suivi-annuel" style={s.linkCard}><strong>Suivi annuel des formateurs</strong><span>Compétences, veille et développement professionnel →</span></Link>
      </section>
      <section style={s.card}>
        <h2 style={s.h2}>{trainers.length} formateur{trainers.length > 1 ? "s" : ""} référencé{trainers.length > 1 ? "s" : ""}</h2>
        {trainers.length === 0 ? <p style={s.muted}>Aucun formateur n’est encore référencé.</p> : <div style={s.list}>{trainers.map((trainer, index) => <article key={trainer.id ?? index} style={s.row}><div><strong>{trainer.display_name || "Formateur"}</strong><p style={s.muted}>{trainer.professional_email || "Email non renseigné"}</p></div><span style={s.badge}>{trainer.status || "brouillon"}</span></article>)}</div>}
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
  h2: { fontFamily: "Georgia,serif", marginTop: 0 },
  list: { display: "grid", gap: ".6rem" },
  row: { border: "1px solid rgba(160,106,44,.22)", padding: ".9rem 1rem", display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" },
  muted: { color: "#806c52", marginBottom: 0 },
  badge: { fontSize: 11, textTransform: "uppercase", background: "#7a2e22", color: "#f8f0dc", padding: ".35rem .5rem" },
  error: { border: "1px solid #a64b3b", background: "#fff2ee", padding: ".8rem", color: "#7d2e22" },
};
