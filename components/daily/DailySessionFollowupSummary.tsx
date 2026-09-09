"use client";

import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type SignatureItem = {
  id: string;
  document_name?: string | null;
  recipient_type?: string | null;
  recipient_name?: string | null;
  recipient_email?: string | null;
  company_name?: string | null;
  signatory_type?: string | null;
  signatory_name?: string | null;
  signatory_email?: string | null;
  status: string;
  created_at?: string | null;
  viewed_at?: string | null;
  signed_at?: string | null;
  expires_at?: string | null;
  last_error?: string | null;
  email_status?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
  failure_reason?: string | null;
  followup_due_at?: string | null;
  needs_followup?: boolean;
};

type Summary = {
  learners: { active: number };
  attendance: { decided: number; total: number };
  assessments: { completed: number; expected: number };
  satisfaction: { responses: number; expected: number; average_rating: number | null };
  signatures: { total: number; pending: number; viewed: number; signed: number; expired: number; failed: number; followup_due?: number; items: SignatureItem[] };
  followup: { open: number; resolved: number; incidents: number; adaptations: number };
};

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div style={{ padding: ".85rem", border: "1px solid #d8b989", background: "#fff" }}>
    <div style={{ fontSize: ".82rem", color: "#70503b" }}>{label}</div>
    <strong style={{ display: "block", marginTop: ".15rem", fontSize: "1.25rem" }}>{value}</strong>
    {detail ? <span style={{ display: "block", marginTop: ".15rem", fontSize: ".78rem", color: "#70503b" }}>{detail}</span> : null}
  </div>;
}

function frDateTime(value?: string | null) {
  if (!value) return "Non tracé";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function signatureStatusLabel(item: SignatureItem) {
  if (item.status === "signed") return "Signé";
  if (item.status === "viewed") return "Consulté · signature attendue";
  if (item.status === "expired") return "Expiré";
  if (item.status === "failed" || item.status === "error") return "Échec";
  if (item.status === "cancelled" || item.status === "revoked") return "Annulé";
  if (item.needs_followup) return "Signature attendue · relance requise";
  return "Signature attendue";
}

function emailStatusLabel(item: SignatureItem) {
  if (item.email_status === "delivered") return "Délivré";
  if (item.email_status === "sent") return "Envoyé";
  if (item.email_status === "bounced") return "Rejeté";
  if (item.email_status === "failed") return "Échec";
  if (item.email_status === "queued") return "Envoi en cours";
  return "Non envoyé";
}

export default function DailySessionFollowupSummary({ sessionId }: { sessionId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState<string | null>(null);
  const [followupBusy, setFollowupBusy] = useState<string | null>(null);

  async function loadSummary() {
    if (!sessionId) { setSummary(null); setError(""); return; }
    setError("");
    const response = await assistanceFetch(`/api/client/daily/followup-summary?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setSummary(null); setError(data.error ?? "Récapitulatif indisponible."); return; }
    setSummary(data.summary ?? null);
  }

  useEffect(() => { void loadSummary(); }, [sessionId]);

  async function sendSignatureInvitation(signatureId: string) {
    if (sendBusy) return;
    setSendBusy(signatureId);
    setError("");
    setNotice("");
    try {
      const response = await assistanceFetch("/api/client/daily/signature-invitations/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signature_id: signatureId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error ?? "Envoi de l’invitation impossible."); return; }
      setNotice(data.alreadyRecorded ? "L’invitation était déjà enregistrée : aucun doublon n’a été envoyé." : "Invitation de signature envoyée et preuve d’envoi enregistrée.");
      await loadSummary();
    } finally {
      setSendBusy(null);
    }
  }

  async function sendSignatureFollowup(signatureId: string) {
    if (followupBusy) return;
    setFollowupBusy(signatureId);
    setError("");
    setNotice("");
    try {
      const response = await assistanceFetch("/api/client/daily/signature-invitations/followup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signature_id: signatureId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error ?? "Relance de signature impossible."); return; }
      setNotice(data.alreadyRecorded ? "Une relance vient déjà d’être enregistrée : aucun doublon n’a été envoyé." : "Relance de signature envoyée et journalisée.");
      await loadSummary();
    } finally {
      setFollowupBusy(null);
    }
  }

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
  const signatures = summary.signatures ?? { total: 0, pending: 0, viewed: 0, signed: 0, expired: 0, failed: 0, followup_due: 0, items: [] };
  return <section style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", marginBottom: "1rem" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <h2 style={{ marginTop: 0, marginBottom: ".35rem" }}>Récapitulatif de la session</h2>
        <p style={{ color: "#70503b", marginTop: 0 }}>Ces indicateurs sont calculés à partir du dossier de session existant. Ils ne créent aucune donnée parallèle.</p>
      </div>
      <button type="button" disabled={pdfBusy} onClick={() => void downloadPdf()} style={{ minHeight: 44, padding: ".65rem .85rem", fontWeight: 800 }}>
        {pdfBusy ? "Préparation du PDF…" : "Télécharger la fiche PDF"}
      </button>
    </div>
    {error ? <p role="alert" style={{ padding: ".6rem", border: "1px solid #d8b989", color: "#70503b" }}>{error}</p> : null}
    {notice ? <p role="status" style={{ padding: ".6rem", border: "1px solid #d8b989", color: "#315b3d" }}>{notice}</p> : null}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".65rem" }}>
      <Metric label="Apprenants actifs" value={summary.learners.active} />
      <Metric label="Émargements renseignés" value={`${summary.attendance.decided}/${summary.attendance.total}`} detail="Créneaux apprenant décidés" />
      <Metric label="Évaluations finales" value={`${summary.assessments.completed}/${summary.assessments.expected}`} />
      <Metric label="Satisfaction apprenants" value={`${summary.satisfaction.responses}/${summary.satisfaction.expected}`} detail={rating === null ? "Aucune note reçue" : `Note moyenne : ${rating.toFixed(1)}/5`} />
      <Metric label="Signatures" value={`${signatures.signed}/${signatures.total}`} detail={`${signatures.pending} en attente · ${signatures.followup_due ?? 0} relance(s) H+72 · ${signatures.failed} échec(s)`} />
      <Metric label="Suivis ouverts" value={summary.followup.open} detail={`${summary.followup.resolved} traité(s)`} />
      <Metric label="Événements consignés" value={summary.followup.incidents + summary.followup.adaptations} detail={`${summary.followup.incidents} incident(s) · ${summary.followup.adaptations} adaptation(s)`} />
    </div>

    <div style={{ marginTop: "1rem", borderTop: "1px solid #d8b989", paddingTop: "1rem" }}>
      <h3 style={{ margin: "0 0 .35rem" }}>Documents à signer</h3>
      <p style={{ marginTop: 0, color: "#70503b", lineHeight: 1.5 }}>L’envoi vient du journal d’e-mails. « Signé » vient uniquement de la preuve de signature. Une consultation reste distincte. Une relance devient due 72 h après un envoi réellement enregistré.</p>
      {signatures.items.length === 0 ? <p style={{ color: "#70503b" }}>Aucun document avec signature n’est enregistré pour cette session.</p> : <div style={{ display: "grid", gap: ".6rem" }}>
        {signatures.items.map((item) => {
          const terminal = ["signed", "expired", "cancelled", "revoked"].includes(item.status);
          return <article key={item.id} style={{ padding: ".8rem", border: "1px solid #d8b989", background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
              <strong>{item.document_name || "Document à signer"}</strong>
              <span style={{ fontWeight: 800 }}>{signatureStatusLabel(item)}</span>
            </div>
            <p style={{ margin: ".35rem 0", color: "#70503b" }}>{item.signatory_name || item.recipient_name || item.company_name || item.signatory_email || item.recipient_email || "Signataire non renseigné"}{item.signatory_type ? ` · ${item.signatory_type}` : ""}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: ".35rem", fontSize: ".85rem", color: "#70503b" }}>
              <span>E-mail : {emailStatusLabel(item)}</span>
              <span>Envoi : {frDateTime(item.sent_at)}</span>
              <span>Délivrance : {frDateTime(item.delivered_at)}</span>
              <span>Consultation : {frDateTime(item.viewed_at)}</span>
              <span>Signature : {frDateTime(item.signed_at)}</span>
              <span>Échéance H+72 : {frDateTime(item.followup_due_at)}</span>
              <span>Expiration : {frDateTime(item.expires_at)}</span>
            </div>
            {item.needs_followup ? <p style={{ margin: ".55rem 0 0", fontWeight: 800, color: "#7b2f21" }}>Client à relancer : délai de 72 h dépassé sans signature.</p> : null}
            {item.failure_reason || item.last_error ? <p style={{ marginBottom: 0, color: "#7b2f21" }}>Erreur : {item.failure_reason || item.last_error}</p> : null}
            {!item.sent_at && !terminal ? <button type="button" disabled={sendBusy !== null || followupBusy !== null} onClick={() => void sendSignatureInvitation(item.id)} style={{ minHeight: 44, marginTop: ".7rem", padding: ".6rem .8rem", fontWeight: 800 }}>
              {sendBusy === item.id ? "Envoi…" : "Envoyer l’invitation de signature"}
            </button> : null}
            {item.sent_at && item.needs_followup && !terminal ? <button type="button" disabled={followupBusy !== null || sendBusy !== null} onClick={() => void sendSignatureFollowup(item.id)} style={{ minHeight: 44, marginTop: ".7rem", padding: ".6rem .8rem", fontWeight: 800 }}>
              {followupBusy === item.id ? "Relance…" : "Relancer la signature"}
            </button> : null}
          </article>;
        })}
      </div>}
    </div>
  </section>;
}
