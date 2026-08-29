"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type ActionItem = {
  id: string;
  kind: "dossier" | "positioning" | "prerequisite" | "adaptation" | "trainer" | "onboarding" | "quality" | "registration";
  priority: "high" | "medium" | "normal";
  title: string;
  detail: string;
  href: string;
  sessionId?: string | null;
  sessionLabel?: string | null;
};

type ActionResponse = {
  actions: ActionItem[];
  counts: { total: number; high: number; dossier: number; learners: number; trainers: number; onboarding?: number; quality?: number; registration?: number };
};

const kindLabel: Record<ActionItem["kind"], string> = {
  dossier: "Dossier de session",
  positioning: "Positionnement",
  prerequisite: "Prérequis",
  adaptation: "Adaptation",
  trainer: "Intervenant",
  onboarding: "Paramétrage",
  quality: "Suivi Qualité",
  registration: "Inscription publique",
};

export default function DailyActionCenterPage() {
  const [data, setData] = useState<ActionResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | ActionItem["kind"]>("all");

  useEffect(() => {
    let cancelled = false;
    assistanceFetch("/api/client/daily/action-center", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok) {
          setError(body?.error ?? "Impossible de charger les actions Daily.");
          return;
        }
        setData(body as ActionResponse);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les actions Daily.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const actions = useMemo(() => {
    const rows = data?.actions ?? [];
    return filter === "all" ? rows : rows.filter((item) => item.kind === filter);
  }, [data, filter]);

  return (
    <main className="gazette-paper" style={s.page}>
      <header className="gazette-cta" style={s.hero}>
        <p className="gazette-label">Selen Daily · À faire</p>
        <h1 className="gazette-hero-title" style={s.heroTitle}>Ce qui mérite votre attention</h1>
        <p style={s.heroText}>Daily rassemble ici uniquement les points qui attendent réellement une action de votre organisme.</p>
      </header>

      {loading ? <p style={s.muted}>Préparation de votre point Daily...</p> : null}
      {error ? <p style={s.error}>{error}</p> : null}

      {!loading && !error && data ? (
        <>
          <section style={s.metrics} aria-label="Synthèse des actions">
            <Metric value={data.counts.total} label="actions à traiter" />
            <Metric value={data.counts.high} label="prioritaires" emphasis={data.counts.high > 0} />
            <Metric value={data.counts.registration ?? 0} label="liens à diffuser" emphasis={(data.counts.registration ?? 0) > 0} />
            <Metric value={data.counts.dossier} label="dans les dossiers" />
            <Metric value={data.counts.learners} label="côté apprenants" />
            <Metric value={data.counts.trainers} label="intervenants à associer" />
            <Metric value={data.counts.onboarding ?? 0} label="documents à fournir" />
            <Metric value={data.counts.quality ?? 0} label="suivi qualité" />
          </section>

          <div style={s.filters}>
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>Tout</FilterButton>
            <FilterButton active={filter === "registration"} onClick={() => setFilter("registration")}>Liens d'inscription</FilterButton>
            <FilterButton active={filter === "onboarding"} onClick={() => setFilter("onboarding")}>Documents à fournir</FilterButton>
            <FilterButton active={filter === "dossier"} onClick={() => setFilter("dossier")}>Dossiers</FilterButton>
            <FilterButton active={filter === "positioning"} onClick={() => setFilter("positioning")}>Positionnements</FilterButton>
            <FilterButton active={filter === "prerequisite"} onClick={() => setFilter("prerequisite")}>Prérequis</FilterButton>
            <FilterButton active={filter === "adaptation"} onClick={() => setFilter("adaptation")}>Adaptations</FilterButton>
            <FilterButton active={filter === "trainer"} onClick={() => setFilter("trainer")}>Intervenants</FilterButton>
            <FilterButton active={filter === "quality"} onClick={() => setFilter("quality")}>Suivi Qualité</FilterButton>
          </div>

          {data.actions.length === 0 ? (
            <section style={s.empty}>
              <strong>Rien à faire pour le moment.</strong>
              <p style={s.muted}>Les dossiers avancent sans action attendue de votre côté. Une rare victoire administrative, profitez-en.</p>
            </section>
          ) : actions.length === 0 ? (
            <p style={s.muted}>Aucune action dans cette catégorie.</p>
          ) : (
            <section style={s.list}>
              {actions.map((item) => (
                <article key={item.id} style={{ ...s.card, ...(item.priority === "high" ? s.highCard : item.kind === "registration" ? s.registrationCard : {}) }}>
                  <div style={s.cardHead}>
                    <div>
                      <span style={item.priority === "high" ? s.highBadge : item.kind === "registration" ? s.registrationBadge : item.priority === "medium" ? s.mediumBadge : s.badge}>
                        {item.kind === "registration" ? "Programme validé" : item.priority === "high" ? "Prioritaire" : item.priority === "medium" ? "À prévoir" : kindLabel[item.kind]}
                      </span>
                      {item.priority !== "normal" && item.kind !== "registration" ? <span style={s.kind}>{kindLabel[item.kind]}</span> : null}
                    </div>
                    {item.sessionLabel ? <span style={s.session}>{item.sessionLabel}</span> : null}
                  </div>
                  <h2 style={s.title}>{item.title}</h2>
                  <p style={s.detail}>{item.detail}</p>
                  <Link href={item.href} style={s.link}>{item.kind === "registration" ? "Voir le lien et le QR code →" : "Ouvrir l’espace concerné →"}</Link>
                </article>
              ))}
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}

function Metric({ value, label, emphasis = false }: { value: number; label: string; emphasis?: boolean }) {
  return <div style={{ ...s.metric, ...(emphasis ? s.metricEmphasis : {}) }}><strong style={s.metricValue}>{value}</strong><span>{label}</span></div>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} style={{ ...s.filterButton, ...(active ? s.filterActive : {}) }}>{children}</button>;
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "2rem clamp(1rem, 4vw, 3rem) 4rem", color: "var(--ink)" }, hero: { maxWidth: 980, margin: "0 auto 1.5rem", padding: "1.4rem" }, heroTitle: { margin: ".25rem 0 .55rem", fontSize: "clamp(1.8rem, 5vw, 3rem)" }, heroText: { margin: 0, maxWidth: 760, lineHeight: 1.6 },
  metrics: { maxWidth: 980, margin: "0 auto 1.2rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: ".7rem" }, metric: { border: "1px solid var(--sepia-mid)", background: "rgba(255,250,240,.7)", padding: ".9rem", display: "grid", gap: ".2rem" }, metricEmphasis: { border: "2px solid #9a6b32", background: "rgba(181,121,45,.08)" }, metricValue: { fontSize: "1.7rem", color: "var(--rust)" },
  filters: { maxWidth: 980, margin: "0 auto 1rem", display: "flex", flexWrap: "wrap", gap: ".5rem" }, filterButton: { border: "1px solid var(--sepia-mid)", background: "var(--paper)", color: "var(--rust)", padding: ".55rem .75rem", cursor: "pointer", fontWeight: 700 }, filterActive: { background: "var(--rust)", color: "#fffaf0", borderColor: "var(--rust)" },
  list: { maxWidth: 980, margin: "0 auto", display: "grid", gap: ".8rem" }, card: { border: "1px solid var(--sepia-mid)", background: "rgba(255,250,240,.82)", padding: "1rem 1.1rem" }, highCard: { borderLeft: "5px solid #9a412f" }, registrationCard: { borderLeft: "5px solid #71875d", background: "rgba(236,247,226,.72)" }, cardHead: { display: "flex", gap: ".75rem", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" },
  badge: { display: "inline-block", padding: ".22rem .5rem", border: "1px solid var(--sepia-mid)", fontSize: ".78rem", fontWeight: 800 }, mediumBadge: { display: "inline-block", padding: ".22rem .5rem", border: "1px solid #b5792d", background: "rgba(181,121,45,.1)", fontSize: ".78rem", fontWeight: 800 }, highBadge: { display: "inline-block", padding: ".22rem .5rem", border: "1px solid #9a412f", background: "rgba(154,65,47,.1)", color: "#7b2f21", fontSize: ".78rem", fontWeight: 800 }, registrationBadge: { display: "inline-block", padding: ".22rem .5rem", border: "1px solid #71875d", background: "rgba(113,135,93,.12)", color: "#4e693b", fontSize: ".78rem", fontWeight: 800 },
  kind: { marginLeft: ".45rem", fontSize: ".78rem", color: "var(--sepia-dark)" }, session: { fontSize: ".85rem", color: "var(--sepia-dark)" }, title: { margin: ".7rem 0 .35rem", fontSize: "1.1rem" }, detail: { margin: "0 0 .75rem", lineHeight: 1.5 }, link: { color: "var(--rust)", fontWeight: 800, textDecoration: "none" }, empty: { maxWidth: 980, margin: "1rem auto", border: "1px solid #6f8b58", background: "rgba(111,139,88,.08)", padding: "1rem 1.2rem" }, muted: { color: "var(--sepia-dark)" }, error: { maxWidth: 980, margin: "1rem auto", padding: ".8rem", border: "1px solid #9a412f", color: "#7b2f21" },
};
