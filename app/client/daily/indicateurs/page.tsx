"use client";

import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import LoadingMascot from "@/components/ui/LoadingMascot";

type FormationIndicator = {
  formation_id: string;
  title: string;
  learners: number;
  abandonments: number;
  successful_assessments: number;
  success_rate: number;
  satisfaction_responses: number;
  satisfaction_average: number | null;
};

type Indicators = {
  totals: {
    learners: number;
    abandonments: number;
    successful_assessments: number;
    success_rate: number;
    satisfaction_responses: number;
    satisfaction_average: number | null;
  };
  formations: FormationIndicator[];
};

function rating(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}/5`;
}

function rate(value: number) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

export default function DailyIndicatorsPage() {
  const [indicators, setIndicators] = useState<Indicators | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await assistanceFetch("/api/client/daily/indicators", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Impossible de charger vos indicateurs.");
        if (!cancelled) setIndicators(payload.indicators ?? null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Impossible de charger vos indicateurs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <LoadingMascot message="Sélion calcule vos indicateurs de formation…" />;

  if (error) {
    return <main style={styles.page}><div style={styles.error}>{error}</div></main>;
  }

  if (!indicators) {
    return <main style={styles.page}><div style={styles.card}><h1 style={styles.h1}>Indicateurs de formation</h1><p>Vous n’avez pas accès aux données de sessions nécessaires à ce suivi.</p></div></main>;
  }

  const totals = indicators.totals;
  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <p style={styles.kicker}>Selen Daily · pilotage</p>
        <h1 style={styles.h1}>Vos indicateurs de formation</h1>
        <p style={styles.lead}>Daily présente uniquement les quatre indicateurs métier retenus : satisfaction, nombre d’apprenants, réussite à l’évaluation finale et abandons. Une annulation n’est jamais comptée comme un abandon.</p>
      </header>

      <section style={styles.cards}>
        <Metric label="Satisfaction" value={rating(totals.satisfaction_average)} detail={`${totals.satisfaction_responses} réponse${totals.satisfaction_responses > 1 ? "s" : ""} exploitée${totals.satisfaction_responses > 1 ? "s" : ""}`} />
        <Metric label="Apprenants" value={String(totals.learners)} detail="Apprenants actifs sur les sessions terminées" />
        <Metric label="Réussite finale" value={rate(totals.success_rate)} detail={`${totals.successful_assessments} résultat${totals.successful_assessments > 1 ? "s" : ""} Acquis`} />
        <Metric label="Abandons" value={String(totals.abandonments)} detail="Uniquement les inscriptions explicitement marquées Abandon" />
      </section>

      <section style={{ ...styles.card, marginTop: 20 }}>
        <div style={styles.sectionTitle}>
          <div>
            <p style={styles.kicker}>Par formation</p>
            <h2 style={styles.h2}>Lecture détaillée</h2>
          </div>
          <span style={styles.badge}>{indicators.formations.length} formation{indicators.formations.length > 1 ? "s" : ""}</span>
        </div>

        {indicators.formations.length === 0 ? (
          <p style={styles.muted}>Aucune session exploitable n’est encore disponible pour calculer des indicateurs.</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Formation</th>
                  <th style={styles.th}>Apprenants</th>
                  <th style={styles.th}>Satisfaction</th>
                  <th style={styles.th}>Réussite</th>
                  <th style={styles.th}>Abandons</th>
                </tr>
              </thead>
              <tbody>
                {indicators.formations.map((item) => (
                  <tr key={item.formation_id}>
                    <td style={styles.td}><strong>{item.title}</strong></td>
                    <td style={styles.td}>{item.learners}</td>
                    <td style={styles.td}>{rating(item.satisfaction_average)}</td>
                    <td style={styles.td}>{rate(item.success_rate)}</td>
                    <td style={styles.td}>{item.abandonments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article style={styles.card}><p style={styles.kicker}>{label}</p><strong style={styles.metric}>{value}</strong><p style={styles.muted}>{detail}</p></article>;
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "2rem 1rem 4rem", color: "#392a19" },
  header: { marginBottom: 20 },
  kicker: { margin: 0, textTransform: "uppercase", letterSpacing: ".14em", font: "800 11px Arial, sans-serif", color: "#9b682d" },
  h1: { margin: ".45rem 0", fontSize: "clamp(2rem,4vw,3rem)" },
  h2: { margin: ".35rem 0 0", fontSize: 24 },
  lead: { maxWidth: 820, lineHeight: 1.65, color: "#756149" },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 },
  card: { background: "#f8f0dc", border: "1px solid #d9c391", boxShadow: "0 8px 20px rgba(57,42,25,.08)", padding: 20 },
  metric: { display: "block", fontSize: 30, marginTop: 8, color: "#7a2e22" },
  muted: { color: "#756149", lineHeight: 1.55 },
  sectionTitle: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 },
  badge: { padding: ".4rem .65rem", border: "1px solid #d0b57d", background: "#fff8e8", fontWeight: 800, fontSize: 12 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 700 },
  th: { textAlign: "left", padding: "10px 9px", borderBottom: "1px solid #cdb47f", color: "#76502b", fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" },
  td: { padding: "12px 9px", borderBottom: "1px solid rgba(205,180,127,.55)", verticalAlign: "top" },
  error: { padding: 16, border: "1px solid #9a412f", background: "rgba(154,65,47,.07)", color: "#7a2e22" },
};
