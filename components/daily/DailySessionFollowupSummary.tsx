"use client";

import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type SignatureItem = {
  id: string; document_name?: string | null; recipient_type?: string | null; recipient_name?: string | null; recipient_email?: string | null; company_name?: string | null;
  signatory_type?: string | null; signatory_name?: string | null; signatory_email?: string | null; status: string; created_at?: string | null;
  sent_at?: string | null; delivery_status?: string | null; delivered_at?: string | null; opened_at?: string | null; clicked_at?: string | null; bounced_at?: string | null; complained_at?: string | null; followup_due_at?: string | null;
  viewed_at?: string | null; signed_at?: string | null; expires_at?: string | null; last_error?: string | null;
};

type Summary = {
  learners: { active: number }; attendance: { decided: number; total: number }; assessments: { completed: number; expected: number };
  satisfaction: { responses: number; expected: number; average_rating: number | null };
  signatures: { total: number; pending: number; viewed: number; signed: number; expired: number; failed: number; items: SignatureItem[] };
  followup: { open: number; resolved: number; incidents: number; adaptations: number };
};

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div style={{ padding: ".85rem", border: "1px solid #d8b989", background: "#fff" }}><div style={{ fontSize: ".82rem", color: "#70503b" }}>{label}</div><strong style={{ display: "block", marginTop: ".15rem", fontSize: "1.25rem" }}>{value}</strong>{detail ? <span style={{ display: "block", marginTop: ".15rem", fontSize: ".78rem", color: "#70503b" }}>{detail}</span> : null}</div>;
}
function frDateTime(value?: string | null) { if (!value) return "Non tracé"; return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function statusLabel(status: string) { if (status === "signed") return "Signé"; if (status === "viewed") return "Consulté · signature attendue"; if (status === "expired") return "Expiré"; if (status === "failed" || status === "error") return "Échec"; if (status === "cancelled" || status === "revoked") return "Annulé"; return "Signature attendue"; }
function deliveryLabel(item: SignatureItem) {
  if (!item.sent_at) return "Non envoyé / preuve absente";
  if (item.complained_at) return "Signalé comme indésirable";
  if (item.bounced_at) return "Rejeté";
  if (item.clicked_at) return "Lien cliqué";
  if (item.opened_at) return "Ouverture détectée";
  if (item.delivered_at) return "Délivré";
  return item.delivery_status === "failed" ? "Échec d’envoi" : "Envoyé";
}

export default function DailySessionFollowupSummary({ sessionId }: { sessionId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null); const [error, setError] = useState(""); const [pdfBusy, setPdfBusy] = useState(false);
  useEffect(() => { if (!sessionId) { setSummary(null); setError(""); return; } let cancelled = false; void (async () => { setError(""); const response = await assistanceFetch(`/api/client/daily/followup-summary?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" }); const data = await response.json().catch(() => ({})); if (cancelled) return; if (!response.ok) { setSummary(null); setError(data.error ?? "Récapitulatif indisponible."); return; } setSummary(data.summary ?? null); })(); return () => { cancelled = true; }; }, [sessionId]);
  async function downloadPdf() { if (!sessionId || pdfBusy) return; setPdfBusy(true); setError(""); try { const response = await assistanceFetch(`/api/client/daily/followup-summary/pdf?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" }); if (!response.ok) { const data = await response.json().catch(() => ({})); setError(data.error ?? "Téléchargement du PDF impossible."); return; } const blob = await response.blob(); const disposition = response.headers.get("content-disposition") ?? ""; const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "fiche-suivi-session.pdf"; const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); } finally { setPdfBusy(false); } }
  if (error && !summary) return <p style={{ padding: ".7rem", border: "1px solid #d8b989", color: "#70503b" }}>{error}</p>; if (!summary) return null;
  const rating = summary.satisfaction.average_rating; const signatures = summary.signatures ?? { total: 0, pending: 0, viewed: 0, signed: 0, expired: 0, failed: 0, items: [] };
  return <section style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", marginBottom: "1rem" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "flex-start", flexWrap: "wrap" }}><div><h2 style={{ marginTop: 0, marginBottom: ".35rem" }}>Récapitulatif de la session</h2><p style={{ color: "#70503b", marginTop: 0 }}>Ces indicateurs sont calculés à partir du dossier de session existant. Ils ne créent aucune donnée parallèle.</p></div><button type="button" disabled={pdfBusy} onClick={() => void downloadPdf()} style={{ minHeight: 44, padding: ".65rem .85rem", fontWeight: 800 }}>{pdfBusy ? "Préparation du PDF…" : "Télécharger la fiche PDF"}</button></div>
    {error ? <p style={{ padding: ".6rem", border: "1px solid #d8b989", color: "#70503b" }}>{error}</p> : null}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".65rem" }}><Metric label="Apprenants actifs" value={summary.learners.active} /><Metric label="Émargements renseignés" value={`${summary.attendance.decided}/${summary.attendance.total}`} detail="Créneaux apprenant décidés" /><Metric label="Évaluations finales" value={`${summary.assessments.completed}/${summary.assessments.expected}`} /><Metric label="Satisfaction apprenants" value={`${summary.satisfaction.responses}/${summary.satisfaction.expected}`} detail={rating === null ? "Aucune note reçue" : `Note moyenne : ${rating.toFixed(1)}/5`} /><Metric label="Signatures" value={`${signatures.signed}/${signatures.total}`} detail={`${signatures.pending} en attente · ${signatures.expired} expirée(s) · ${signatures.failed} échec(s)`} /><Metric label="Suivis ouverts" value={summary.followup.open} detail={`${summary.followup.resolved} traité(s)`} /><Metric label="Événements consignés" value={summary.followup.incidents + summary.followup.adaptations} detail={`${summary.followup.incidents} incident(s) · ${summary.followup.adaptations} adaptation(s)`} /></div>
    <div style={{ marginTop: "1rem", borderTop: "1px solid #d8b989", paddingTop: "1rem" }}><h3 style={{ margin: "0 0 .35rem" }}>Documents à signer</h3><p style={{ marginTop: 0, color: "#70503b", lineHeight: 1.5 }}>« Signé » provient uniquement de la signature enregistrée. « Ouverture détectée » est un signal du fournisseur email, jamais une preuve absolue de lecture. Les 72 h ne sont calculées qu’à partir d’un envoi réellement tracé.</p>
      {signatures.items.length === 0 ? <p style={{ color: "#70503b" }}>Aucun document avec signature n’est enregistré pour cette session.</p> : <div style={{ display: "grid", gap: ".6rem" }}>{signatures.items.map((item) => <article key={item.id} style={{ padding: ".8rem", border: "1px solid #d8b989", background: "#fff" }}><div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}><strong>{item.document_name || "Document à signer"}</strong><span style={{ fontWeight: 800 }}>{statusLabel(item.status)}</span></div><p style={{ margin: ".35rem 0", color: "#70503b" }}>{item.signatory_name || item.recipient_name || item.company_name || item.signatory_email || item.recipient_email || "Signataire non renseigné"}{item.signatory_type ? ` · ${item.signatory_type}` : ""}</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: ".35rem", fontSize: ".85rem", color: "#70503b" }}><span>Email : {deliveryLabel(item)}</span><span>Envoi : {frDateTime(item.sent_at)}</span><span>Consultation document : {frDateTime(item.viewed_at)}</span><span>Signature : {frDateTime(item.signed_at)}</span><span>Expiration : {frDateTime(item.expires_at)}</span>{item.sent_at && item.status !== "signed" ? <span>Relance 72 h : {frDateTime(item.followup_due_at)}</span> : null}</div>{item.last_error ? <p style={{ marginBottom: 0, color: "#7b2f21" }}>Erreur : {item.last_error}</p> : null}</article>)}</div>}
    </div>
  </section>;
}
