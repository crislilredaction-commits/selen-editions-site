"use client";

import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Summary = {
  sessions: number;
  learners: number;
  satisfaction_responses: number;
  overall_satisfaction_average: number | null;
  recommendation_rate: number | null;
  assessment_completion_rate: number | null;
  positive_outcome_rate: number | null;
};

type SessionMetric = {
  id: string;
  formation?: string | null;
  internal_reference?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  learners: number;
  learner_feedback_count: number;
  stakeholder_feedback_count: number;
  learner_overall_average: number | null;
  stakeholder_overall_average: number | null;
  recommendation_rate: number | null;
  assessment_completion_rate: number | null;
  positive_outcome_rate: number | null;
};

function value(metric: number | null | undefined, suffix = "") {
  return metric == null ? "—" : `${metric}${suffix}`;
}

function period(start?: string | null, end?: string | null) {
  if (!start && !end) return "Dates non renseignées";
  const format = (raw?: string | null) => raw ? new Date(`${raw}T12:00:00`).toLocaleDateString("fr-FR") : "—";
  return `${format(start)} → ${format(end)}`;
}

export default function DailyPerformancePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sessions, setSessions] = useState<SessionMetric[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await assistanceFetch("/api/client/daily/performance", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? "Chargement impossible.");
      setSummary(data.summary ?? null);
      setSessions(data.sessions ?? []);
    })();
  }, []);

  return (
    <main className="gazette-paper" style={styles.page}>
      <header style={styles.hero}>
        <p className="gazette-label" style={styles.eyebrow}>Selen Daily · Pilotage</p>
        <h1 style={styles.title}>Satisfaction & indicateurs de performance</h1>
        <p style={styles.lead}>
          Cette vue consolide les retours réellement reçus et les résultats pédagogiques enregistrés dans Daily. Les indicateurs restent descriptifs : Selen aide à lire les tendances sans inventer de seuil de conformité ou de réussite à la place de l’organisme.
        </p>
      </header>

      {error ? <p style={styles.error}>{error}</p> : null}

      <section aria-label="Synthèse des indicateurs" style={styles.metricsGrid}>
        <Metric label="Sessions suivies" value={summary?.sessions ?? 0} />
        <Metric label="Apprenants actifs" value={summary?.learners ?? 0} />
        <Metric label="Réponses satisfaction" value={summary?.satisfaction_responses ?? 0} />
        <Metric label="Satisfaction moyenne" value={value(summary?.overall_satisfaction_average, "/5")} />
        <Metric label="Recommandation" value={value(summary?.recommendation_rate, "%")} />
        <Metric label="Évaluations finalisées" value={value(summary?.assessment_completion_rate, "%")} />
        <Metric label="Acquis ou partiellement acquis" value={value(summary?.positive_outcome_rate, "%")} />
      </section>

      <section style={styles.sessionSection}>
        <div>
          <h2 style={styles.sectionTitle}>Lecture par session</h2>
          <p style={styles.muted}>Les valeurs manquantes restent volontairement affichées comme non disponibles plutôt que transformées en zéro.</p>
        </div>

        {sessions.length === 0 ? <p style={styles.empty}>Aucune session Daily à analyser pour le moment.</p> : null}

        {sessions.map((session) => (
          <article key={session.id} style={styles.sessionCard}>
            <div style={styles.sessionHeader}>
              <div>
                <strong style={styles.sessionTitle}>{session.formation || session.internal_reference || "Session Daily"}</strong>
                <div style={styles.sessionPeriod}>{period(session.start_date, session.end_date)}</div>
              </div>
              <span style={styles.badge}>{session.learners} apprenant{session.learners > 1 ? "s" : ""}</span>
            </div>
            <div style={styles.smallMetricsGrid}>
              <SmallMetric label="Satisfaction apprenants" value={value(session.learner_overall_average, "/5")} detail={`${session.learner_feedback_count} réponse(s)`} />
              <SmallMetric label="Autres parties prenantes" value={value(session.stakeholder_overall_average, "/5")} detail={`${session.stakeholder_feedback_count} réponse(s)`} />
              <SmallMetric label="Recommandation" value={value(session.recommendation_rate, "%")} />
              <SmallMetric label="Évaluations finalisées" value={value(session.assessment_completion_rate, "%")} />
              <SmallMetric label="Acquis / partiellement acquis" value={value(session.positive_outcome_rate, "%")} />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function Metric({ label, value: metricValue }: { label: string; value: string | number }) {
  return (
    <article style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <strong style={styles.metricValue}>{metricValue}</strong>
    </article>
  );
}

function SmallMetric({ label, value: metricValue, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div style={styles.smallMetric}>
      <div style={styles.smallMetricLabel}>{label}</div>
      <strong style={styles.smallMetricValue}>{metricValue}</strong>
      {detail ? <span style={styles.smallMetricDetail}>{detail}</span> : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "2rem 1rem 4rem", color: "var(--ink)" },
  hero: { padding: "1.35rem", border: "1px solid var(--sepia-mid)", borderRadius: 18, background: "var(--paper)", display: "grid", gap: ".45rem" },
  eyebrow: { margin: 0, color: "var(--rust)" },
  title: { margin: 0, fontSize: "clamp(1.9rem,4vw,3rem)", color: "var(--ink)" },
  lead: { maxWidth: 850, margin: 0, color: "var(--ink-soft)", lineHeight: 1.65 },
  error: { padding: ".85rem 1rem", border: "1px solid var(--rust)", borderRadius: 12, background: "rgba(138,75,36,.08)", color: "var(--rust)" },
  metricsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: ".8rem", margin: "1rem 0 1.4rem" },
  metricCard: { padding: "1rem", border: "1px solid var(--sepia-mid)", borderRadius: 16, background: "var(--paper)", minHeight: 92 },
  metricLabel: { fontSize: ".82rem", color: "var(--ink-soft)", lineHeight: 1.35 },
  metricValue: { display: "block", marginTop: ".35rem", fontSize: "1.45rem", color: "var(--ink)" },
  sessionSection: { display: "grid", gap: "1rem" },
  sectionTitle: { margin: 0, color: "var(--ink)" },
  muted: { margin: ".3rem 0 0", color: "var(--ink-soft)", lineHeight: 1.5 },
  empty: { margin: 0, padding: "1rem", border: "1px dashed var(--sepia-mid)", borderRadius: 14, color: "var(--ink-soft)" },
  sessionCard: { padding: "1rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderRadius: 18 },
  sessionHeader: { display: "flex", justifyContent: "space-between", gap: ".8rem", flexWrap: "wrap", alignItems: "flex-start" },
  sessionTitle: { fontSize: "1.05rem", color: "var(--ink)" },
  sessionPeriod: { marginTop: ".25rem", color: "var(--ink-soft)", fontSize: ".9rem" },
  badge: { padding: ".35rem .65rem", border: "1px solid var(--sepia-mid)", borderRadius: 999, background: "rgba(201,160,85,.08)", color: "var(--ink)", fontSize: ".85rem", fontWeight: 700 },
  smallMetricsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: ".65rem", marginTop: ".9rem" },
  smallMetric: { padding: ".75rem", borderLeft: "3px solid var(--ocre-gold)", borderRadius: "0 10px 10px 0", background: "rgba(201,160,85,.06)" },
  smallMetricLabel: { fontSize: ".78rem", color: "var(--ink-soft)" },
  smallMetricValue: { display: "block", marginTop: ".2rem", color: "var(--ink)" },
  smallMetricDetail: { fontSize: ".78rem", color: "var(--ink-soft)" },
};
