"use client";

import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Summary = {
  learners: { active: number };
  attendance: { decided: number; total: number };
  assessments: { completed: number; expected: number };
  satisfaction: { responses: number; expected: number; average_rating: number | null };
  followup: { open: number; resolved: number; incidents: number; adaptations: number };
};

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div style={{ padding: ".85rem", border: "1px solid #d8b989", background: "#fff" }}>
    <div style={{ fontSize: ".82rem", color: "#70503b" }}>{label}</div>
    <strong style={{ display: "block", marginTop: ".15rem", fontSize: "1.25rem" }}>{value}</strong>
    {detail ? <span style={{ display: "block", marginTop: ".15rem", fontSize: ".78rem", color: "#70503b" }}>{detail}</span> : null}
  </div>;
}

export default function DailySessionFollowupSummary({ sessionId }: { sessionId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!sessionId) { setSummary(null); setError(""); return; }
    let cancelled = false;
    void (async () => {
      setError("");
      const response = await assistanceFetch(`/api/client/daily/followup-summary?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) { setSummary(null); setError(data.error ?? "Récapitulatif indisponible."); return; }
      setSummary(data.summary ?? null);
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  async function downloadPdf() {
    if (!sessionId || pdfBusy) return;
    setPdfBusy(true);
    setError("");
    try {
      const response = await assistanceFetch(`/api/client/daily/followup-summary/pdf?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Téléchargement du PDF impossible.");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "fiche-suivi-session.pdf";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setPdfBusy(false);
    }
  }

  if (error && !summary) return <p style={{ padding: ".7rem", border: "1px solid #d8b989", color: "#70503b" }}>{error}</p>;
  if (!summary) return null;

  const rating = summary.satisfaction.average_rating;
  return <section style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", marginBottom: "1rem" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <h2 style={{ marginTop: 0, marginBottom: ".35rem" }}>Récapitulatif de la session</h2>
        <p style={{ color: "#70503b", marginTop: 0 }}>Ces indicateurs sont calculés à partir du dossier de session existant. Ils ne créent aucune donnée parallèle.</p>
      </div>
      <button type="button" disabled={pdfBusy} onClick={() => void downloadPdf()} style={{ padding: ".65rem .85rem", fontWeight: 800 }}>
        {pdfBusy ? "Préparation du PDF…" : "Télécharger la fiche PDF"}
      </button>
    </div>
    {error ? <p style={{ padding: ".6rem", border: "1px solid #d8b989", color: "#70503b" }}>{error}</p> : null}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".65rem" }}>
      <Metric label="Apprenants actifs" value={summary.learners.active} />
      <Metric label="Émargements renseignés" value={`${summary.attendance.decided}/${summary.attendance.total}`} detail="Créneaux apprenant décidés" />
      <Metric label="Évaluations finales" value={`${summary.assessments.completed}/${summary.assessments.expected}`} />
      <Metric label="Satisfaction apprenants" value={`${summary.satisfaction.responses}/${summary.satisfaction.expected}`} detail={rating === null ? "Aucune note reçue" : `Note moyenne : ${rating.toFixed(1)}/5`} />
      <Metric label="Suivis ouverts" value={summary.followup.open} detail={`${summary.followup.resolved} traité(s)`} />
      <Metric label="Événements consignés" value={summary.followup.incidents + summary.followup.adaptations} detail={`${summary.followup.incidents} incident(s) · ${summary.followup.adaptations} adaptation(s)`} />
    </div>
  </section>;
}
