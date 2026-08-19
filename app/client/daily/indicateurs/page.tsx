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

function value(value: number | null | undefined, suffix = "") {
  return value == null ? "—" : `${value}${suffix}`;
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
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1rem 4rem", color: "#3f2b1d" }}>
      <p style={{ fontWeight: 800, color: "#8a4b24" }}>Selen Daily · Pilotage</p>
      <h1>Satisfaction & indicateurs de performance</h1>
      <p style={{ maxWidth: 820 }}>
        Cette vue consolide les retours réellement reçus et les résultats pédagogiques enregistrés dans Daily. Les indicateurs restent descriptifs : Selen aide à lire les tendances sans inventer de seuil de conformité ou de réussite à la place de l’organisme.
      </p>

      {error ? <p style={{ padding: ".8rem", border: "1px solid #8a4b24", background: "#fffaf0" }}>{error}</p> : null}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: ".8rem", margin: "1.4rem 0" }}>
        <Metric label="Sessions suivies" value={summary?.sessions ?? 0} />
        <Metric label="Apprenants actifs" value={summary?.learners ?? 0} />
        <Metric label="Réponses satisfaction" value={summary?.satisfaction_responses ?? 0} />
        <Metric label="Satisfaction moyenne" value={value(summary?.overall_satisfaction_average, "/5")} />
        <Metric label="Recommandation" value={value(summary?.recommendation_rate, "%")} />
        <Metric label="Évaluations finalisées" value={value(summary?.assessment_completion_rate, "%")} />
        <Metric label="Acquis ou partiellement acquis" value={value(summary?.positive_outcome_rate, "%")} />
      </section>

      <section style={{ display: "grid", gap: "1rem" }}>
        <div>
          <h2 style={{ marginBottom: ".35rem" }}>Lecture par session</h2>
          <p style={{ marginTop: 0, color: "#6d5746" }}>Les valeurs manquantes restent volontairement affichées comme non disponibles plutôt que transformées en zéro.</p>
        </div>
        {sessions.length === 0 ? <p>Aucune session Daily à analyser pour le moment.</p> : null}
        {sessions.map((session) => (
          <article key={session.id} style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".8rem", flexWrap: "wrap", alignItems: "start" }}>
              <div>
                <strong style={{ fontSize: "1.05rem" }}>{session.formation || session.internal_reference || "Session Daily"}</strong>
                <div style={{ marginTop: ".25rem", color: "#6d5746", fontSize: ".9rem" }}>{period(session.start_date, session.end_date)}</div>
              </div>
              <span style={{ padding: ".3rem .55rem", border: "1px solid #d8b989", borderRadius: 999, background: "#fffdf7", fontSize: ".85rem" }}>{session.learners} apprenant{session.learners > 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: ".65rem", marginTop: ".9rem" }}>
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
  return <div style={{ padding: "1rem", border: "1px solid #d8b989", borderRadius: 12, background: "#fffaf0" }}><div style={{ fontSize: ".82rem", color: "#6d5746" }}>{label}</div><strong style={{ display: "block", marginTop: ".25rem", fontSize: "1.45rem" }}>{metricValue}</strong></div>;
}

function SmallMetric({ label, value: metricValue, detail }: { label: string; value: string; detail?: string }) {
  return <div style={{ padding: ".7rem", borderLeft: "3px solid #d8b989", background: "#fffdf7" }}><div style={{ fontSize: ".78rem", color: "#6d5746" }}>{label}</div><strong style={{ display: "block", marginTop: ".2rem" }}>{metricValue}</strong>{detail ? <span style={{ fontSize: ".78rem", color: "#6d5746" }}>{detail}</span> : null}</div>;
}
