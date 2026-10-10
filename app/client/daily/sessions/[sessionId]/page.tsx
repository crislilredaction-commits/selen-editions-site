"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Learner = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null };
type Enrolment = { id: string; learner_id: string; status: string; positioning_status?: string | null; prerequisites_status?: string | null; daily_learners?: Learner | Learner[] | null };
type Document = { id: string; enrolment_id: string; document_type: string; status: string; logical_name?: string | null };
type Evidence = { enrolments: Enrolment[]; documents: Document[]; assessmentResponses: { enrolment_id: string; submitted_at: string }[] };
type Session = { id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; modality?: string; location_address?: string | null; remote_url?: string | null; schedule_blocks?: { date: string; start: string; end: string; note?: string | null }[]; companies?: { name?: string | null; email?: string | null; participants?: unknown[] }[]; max_participants?: number | null; daily_portal_access_tokens?: { id: string; portal_type: string; entity_name?: string | null; entity_email?: string | null; status?: string | null; viewed_at?: string | null }[]; daily_registration_recipients?: { id: string; recipient_type: string; recipient_name?: string | null; recipient_email?: string | null; status?: string | null; sent_at?: string | null; last_error?: string | null }[]; daily_convocations?: { id: string; recipient_type: string; recipient_name?: string | null; company_name?: string | null; status?: string | null; sent_at?: string | null }[]; daily_conventions?: { id: string; recipient_type: string; recipient_name?: string | null; company_name?: string | null; status?: string | null; daily_convention_signatures?: { id: string; signatory_type: string; signatory_name?: string | null; status?: string | null; signed_at?: string | null }[] }[]; daily_formations?: { title?: string | null } | { title?: string | null }[] | null };

const panel: React.CSSProperties = { border: "1px solid var(--sepia-mid)", borderRadius: 16, padding: "1.25rem", background: "var(--paper)", minWidth: 0 };
function status(value?: string | null) {
  if (!value || value === "pending" || value === "not_started") return "À venir";
  if (value === "submitted") return "Reçue";
  if (value === "abandoned") return "Abandonnée";
  if (value === "cancelled") return "Annulée";
  if (value === "declined") return "Refusée";
  if (["completed", "validated", "approved", "signed", "done"].includes(value)) return "Terminé";
  if (["rejected", "failed", "blocked", "cancelled", "abandoned", "declined"].includes(value)) return "Bloqué";
  return "En cours";
}
function learnerOf(row: Enrolment) { return Array.isArray(row.daily_learners) ? row.daily_learners[0] : row.daily_learners; }

function EvidenceDownload({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true); setError("");
    let url: string | null = null;
    try {
      const response = await assistanceFetch(`/api/client/daily/uploads?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Document indisponible.");
      const blob = await response.blob();
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const type = blob.type;
      const extension = type.includes("wordprocessingml") ? "docx" : type.includes("msword") ? "doc" : type.includes("png") ? "png" : type.includes("jpeg") ? "jpg" : "pdf";
      link.href = url; link.download = `preuve-${id}.${extension}`; link.click();
    } catch { setError("Téléchargement impossible."); }
    finally { if (url) { const objectUrl = url; window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); } setBusy(false); }
  }
  return <><button type="button" onClick={() => void download()} disabled={busy} aria-label={`Télécharger ${name}`} style={{ textDecoration: "underline" }}>{busy ? "Téléchargement…" : "Télécharger"}</button>{error ? <span role="alert"> {error}</span> : null}</>;
}

function AbandonmentForm({ enrolmentId, busy, onConfirm }: { enrolmentId: string; busy: boolean; onConfirm: (enrolmentId: string, date: string, reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  if (!open) return <button type="button" onClick={() => setOpen(true)}>Confirmer un abandon</button>;
  return <form onSubmit={event => { event.preventDefault(); if (date && reason.trim() && !busy) void onConfirm(enrolmentId, date, reason.trim()); }} style={{ display: "grid", gap: ".65rem", marginTop: ".85rem" }}>
    <strong>Abandon définitif de cette inscription</strong>
    <label>Date de l’abandon <input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
    <label>Motif <textarea required value={reason} onChange={event => setReason(event.target.value)} style={{ display: "block", width: "100%", minHeight: 70 }} /></label>
    <p>La confirmation arrête les accès et actions futures. Les preuves antérieures sont conservées.</p>
    <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
      <button type="submit" disabled={busy || !date || !reason.trim()}>{busy ? "Confirmation…" : "Confirmer définitivement"}</button>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); setReason(""); }}>Annuler</button>
    </div>
  </form>;
}

export default function DailySessionDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const [session, setSession] = useState<Session | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadingKey, setUploadingKey] = useState("");
  const [abandoningKey, setAbandoningKey] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError("");
      try {
        const [sessionResponse, evidenceResponse] = await Promise.all([
          assistanceFetch("/api/client/daily/sessions", { cache: "no-store" }),
          assistanceFetch(`/api/client/daily/sessions/${encodeURIComponent(sessionId)}/evidence-context`, { cache: "no-store" }),
        ]);
        const [sessionData, evidenceData] = await Promise.all([sessionResponse.json(), evidenceResponse.json()]);
        if (!sessionResponse.ok || !evidenceResponse.ok) throw new Error(sessionData.error || evidenceData.error || "Dossier indisponible.");
        const found = (sessionData.sessions ?? []).find((item: Session) => item.id === sessionId);
        if (!found) throw new Error("Cette session est introuvable ou inaccessible.");
        if (active) { setSession(found); setEvidence(evidenceData); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Chargement impossible."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [sessionId]);
  async function uploadEvidence(enrolmentId: string, kind: "positioning" | "learning_assessment", file: File | null) {
    if (!file) return;
    const key = `${enrolmentId}:${kind}`;
    setUploadingKey(key); setError(""); setMessage("");
    try {
      const form = new FormData();
      form.set("session_id", sessionId);
      form.set("enrolment_id", enrolmentId);
      form.set("kind", kind);
      form.set("file", file);
      const response = await assistanceFetch("/api/client/daily/evidence", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Import impossible.");
      const refreshed = await assistanceFetch(`/api/client/daily/sessions/${encodeURIComponent(sessionId)}/evidence-context`, { cache: "no-store" });
      if (!refreshed.ok) throw new Error("Import enregistré, mais actualisation indisponible.");
      setEvidence(await refreshed.json());
      setMessage("Preuve enregistrée dans le dossier de l’apprenant.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import impossible."); }
    finally { setUploadingKey(""); }
  }
  async function confirmAbandonment(enrolmentId: string, date: string, reason: string) {
    setAbandoningKey(enrolmentId); setError(""); setMessage("");
    try {
      const response = await assistanceFetch("/api/client/daily/enrolments/abandon", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, enrolment_id: enrolmentId, occurred_at: date, reason }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Confirmation impossible.");
      const refreshed = await assistanceFetch(`/api/client/daily/sessions/${encodeURIComponent(sessionId)}/evidence-context`, { cache: "no-store" });
      if (!refreshed.ok) throw new Error("Abandon enregistré, mais actualisation indisponible.");
      setEvidence(await refreshed.json());
      setMessage("Abandon confirmé. Historique et preuves conservés.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confirmation impossible."); }
    finally { setAbandoningKey(""); }
  }
  const activeEnrolments = evidence?.enrolments.filter(row => !["abandoned", "cancelled", "declined"].includes(row.status)) ?? [];
  const completedStatuses = ["completed", "validated", "approved", "done"];
  const formation = session?.daily_formations;
  const title = Array.isArray(formation) ? formation[0]?.title : formation?.title;
  return <main style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(1rem, 3vw, 2rem)", display: "grid", gap: "1.25rem", minWidth: 0 }}>
    <Link href="/client/daily/sessions">← Retour aux sessions</Link>
    {loading ? <p role="status">Chargement du dossier de session…</p> : null}
    {error ? <p role="alert" style={{ color: "#a32b26" }}>{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {session && evidence ? <>
      <header style={panel}>
        <h1 style={{ fontSize: "1.7rem", fontWeight: 750 }}>{title || "Dossier de session"}</h1>
        <p>{session.internal_reference || "Sans référence"} · {session.start_date || "Date à définir"}{session.end_date ? ` au ${session.end_date}` : ""}</p>
        <p>{session.modality || "Modalité à définir"}{session.location_address ? ` · ${session.location_address}` : ""}</p>
        <p>{evidence.enrolments.length} dossier(s) apprenant(s) suivi(s), dont {evidence.enrolments.filter(row => row.status === "abandoned").length} abandon(s) conservé(s) dans l’historique.</p>
        <p>Inscriptions actives : {activeEnrolments.length} · Dossiers clôturés : {evidence.enrolments.length - activeEnrolments.length}</p>
        <p>Prérequis terminés : {activeEnrolments.filter(row => completedStatuses.includes(row.prerequisites_status ?? "")).length} / {activeEnrolments.length} · Positionnements terminés : {activeEnrolments.filter(row => completedStatuses.includes(row.positioning_status ?? "")).length} / {activeEnrolments.length} (inscriptions actives uniquement)</p>
        <Link href={`/client/daily/documents-avant-formation?session_id=${encodeURIComponent(session.id)}`}>Documents avant formation →</Link>
      </header>
      <nav aria-label="Rubriques du dossier" style={{ display: "flex", flexWrap: "wrap", gap: ".75rem" }}>{([["organisation", "Organisation"], ["acces", "Accès"], ["envois", "Envois"], ["conventions", "Conventions"], ["apprenants", "Apprenants"]] as const).map(([id, label]) => <a key={id} href={`#${id}`} style={{ padding: ".45rem .7rem", border: "1px solid var(--sepia-mid)", borderRadius: 9, textDecoration: "underline" }}>{label}</a>)}</nav>
      <section id="organisation" style={panel} aria-label="Organisation de la session">
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Organisation et intervenants</h2>
        <p>Capacité prévue : {session.max_participants ?? "Non renseignée"}</p>
        <p>Entreprises rattachées : {session.companies?.filter(company => company.name?.trim()).length ?? 0} · Destinataires administratifs : {session.daily_registration_recipients?.length ?? 0}</p>
        {session.remote_url ? <p>Lien de formation à distance : <a href={session.remote_url} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere", textDecoration: "underline" }}>Ouvrir la salle virtuelle</a></p> : null}
        {session.schedule_blocks?.length ? <details style={{ marginTop: ".75rem" }}><summary>Planning détaillé ({session.schedule_blocks.length} créneau(x))</summary><ul style={{ paddingLeft: "1.25rem" }}>{session.schedule_blocks.map((block, index) => <li key={index}>{block.date || "Date à définir"} · {block.start || "?"} – {block.end || "?"}{block.note ? ` · ${block.note}` : ""}</li>)}</ul></details> : null}
        {session.companies?.filter(company => company.name?.trim()).length ? <details style={{ marginTop: ".75rem" }}><summary>Entreprises rattachées ({session.companies.filter(company => company.name?.trim()).length})</summary><ul style={{ paddingLeft: "1.25rem" }}>{session.companies.filter(company => company.name?.trim()).map((company, index) => <li key={index} style={{ overflowWrap: "anywhere" }}><strong>{company.name}</strong>{company.email ? ` · ${company.email}` : ""}</li>)}</ul></details> : null}
      </section>
      <section id="acces" style={panel}><h2>Accès aux espaces</h2><p>{session.daily_portal_access_tokens?.length ?? 0} accès recensés, dont {session.daily_portal_access_tokens?.filter(access => Boolean(access.viewed_at)).length ?? 0} consultés.</p>{session.daily_portal_access_tokens?.length ? <details><summary>Consulter les destinataires</summary><ul>{session.daily_portal_access_tokens.map(access => <li key={access.id} style={{ overflowWrap: "anywhere" }}>{access.entity_name || access.entity_email || access.portal_type} · {access.portal_type} · {access.viewed_at ? "Consulté" : "Non consulté"}</li>)}</ul></details> : null}</section>
      <section id="envois" style={panel} aria-label="Envois et convocations">
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Envois et convocations</h2>
        <p>Suivi des destinataires et des convocations enregistrés pour cette session.</p>
        <p>{session.daily_registration_recipients?.length ?? 0} envoi(s) d’inscription et {session.daily_convocations?.length ?? 0} convocation(s).</p>
        <p>Envois en erreur : {session.daily_registration_recipients?.filter(recipient => ["failed", "blocked", "rejected"].includes(recipient.status ?? "") || Boolean(recipient.last_error && !recipient.sent_at)).length ?? 0} · Convocations envoyées : {session.daily_convocations?.filter(convocation => Boolean(convocation.sent_at)).length ?? 0}</p>
        <details style={{ marginTop: ".75rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Afficher les destinataires et leurs statuts</summary>
          <div style={{ display: "grid", gap: ".75rem", marginTop: ".75rem" }}>
          {(session.daily_registration_recipients ?? []).map(recipient => <div key={recipient.id} style={{ border: "1px solid var(--sepia-mid)", borderRadius: 10, padding: ".75rem", overflowWrap: "anywhere" }}>
            <strong>{recipient.recipient_name || recipient.recipient_email || recipient.recipient_type}</strong>
            <p>Envoi d’inscription : {status(recipient.status)}{recipient.sent_at ? ` · Envoyé le ${recipient.sent_at.slice(0, 10)}` : ""}</p>
            {recipient.last_error && !recipient.sent_at ? <p role="alert">Dernière erreur d’envoi : {recipient.last_error}</p> : null}
          </div>)}
          {(session.daily_convocations ?? []).map(convocation => <div key={convocation.id} style={{ border: "1px solid var(--sepia-mid)", borderRadius: 10, padding: ".75rem", overflowWrap: "anywhere" }}>
            <strong>Convocation · {convocation.recipient_name || convocation.company_name || convocation.recipient_type}</strong>
            <p>{status(convocation.status)}{convocation.sent_at ? ` · Envoyée le ${convocation.sent_at.slice(0, 10)}` : ""}</p>
          </div>)}
          {!session.daily_registration_recipients?.length && !session.daily_convocations?.length ? <p>Aucun envoi ou convocation recensé.</p> : null}
          </div>
        </details>
      </section>
      <section id="conventions" style={panel} aria-label="Conventions et signatures">
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Conventions et signatures</h2>
        <p>{session.daily_conventions?.length ?? 0} convention(s) recensée(s) · {session.daily_conventions?.reduce((total, convention) => total + (convention.daily_convention_signatures?.filter(signature => signature.status === "signed").length ?? 0), 0) ?? 0} signature(s) enregistrée(s).</p>
        {!session.daily_conventions?.length ? <p>Aucune convention recensée pour cette session.</p> : <div style={{ display: "grid", gap: ".85rem", marginTop: ".85rem" }}>
          {session.daily_conventions.map(convention => <details key={convention.id} style={{ border: "1px solid var(--sepia-mid)", borderRadius: 10, padding: ".75rem", minWidth: 0 }}>
            <summary style={{ cursor: "pointer", overflowWrap: "anywhere" }}>{convention.company_name || convention.recipient_name || convention.recipient_type || "Convention"} · {status(convention.status)} · {convention.daily_convention_signatures?.length ?? 0} signataire(s)</summary>
            {convention.daily_convention_signatures?.length ? <ul style={{ paddingLeft: "1.25rem" }}>{convention.daily_convention_signatures.map(signature => <li key={signature.id} style={{ overflowWrap: "anywhere" }}>{signature.signatory_name || signature.signatory_type} : {status(signature.status)}{signature.signed_at ? ` · Signé le ${signature.signed_at.slice(0, 10)}` : ""}</li>)}</ul> : <p>Signataires non renseignés.</p>}
          </details>)}
        </div>}
      </section>
      <section id="apprenants" style={{ display: "grid", gap: "1rem" }} aria-label="Parcours administratifs des apprenants">
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Apprenants et parcours administratifs</h2>
        <p>Ouvre le dossier d’un apprenant pour consulter ses étapes, justificatifs et actions. Les dossiers clôturés restent accessibles pour l’historique.</p>
        {evidence.enrolments.length === 0 ? <p style={panel}>Aucun apprenant inscrit pour le moment.</p> : evidence.enrolments.map(row => {
          const learner = learnerOf(row);
          const documents = evidence.documents.filter(doc => doc.enrolment_id === row.id);
          const assessmentCount = evidence.assessmentResponses.filter(item => item.enrolment_id === row.id).length;
          return <details key={row.id} style={panel}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "1.1rem", overflowWrap: "anywhere" }}>{[learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant"} · {["abandoned", "cancelled", "declined"].includes(row.status) ? "Dossier clôturé" : status(row.status)}</summary>
            {["abandoned", "cancelled", "declined"].includes(row.status) ? <p role="status">Inscription clôturée ({row.status}) : preuves antérieures conservées.</p> : null}
            {learner?.email ? <p style={{ overflowWrap: "anywhere" }}>{learner.email}</p> : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: ".65rem", marginTop: "1rem" }}>
              {([["Inscription", row.status], ["Positionnement", row.positioning_status], ["Prérequis", row.prerequisites_status], ["Évaluation reçue", assessmentCount || documents.some(doc => doc.document_type === "learning_assessment_evidence") ? "submitted" : "pending"]] as const).map(([label, value]) =>
                <div key={label} style={{ padding: ".75rem", border: "1px solid var(--sepia-mid)", borderRadius: 10, minWidth: 0 }}>
                  <strong>{label}</strong><p>{status(value)}</p>
                </div>)}
            </div>
            {!["abandoned", "cancelled", "declined"].includes(row.status) ? <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", marginTop: ".85rem" }}>
              {(["positioning", "learning_assessment"] as const).map(kind => <label key={kind} style={{ display: "grid", gap: ".3rem", minWidth: 0 }}>
                <strong>{kind === "positioning" ? "Importer un positionnement" : "Importer une évaluation finale"}</strong>
                <input type="file" accept="application/pdf,image/jpeg,image/png" disabled={Boolean(uploadingKey)} onChange={event => { void uploadEvidence(row.id, kind, event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
                {uploadingKey === `${row.id}:${kind}` ? <small>Import en cours…</small> : null}
              </label>)}
            </div> : null}
            <p style={{ marginTop: ".85rem" }}>Positionnement : {documents.filter(doc => doc.document_type === "positioning_evidence").length} preuve(s). Évaluation finale : {documents.filter(doc => doc.document_type === "learning_assessment_evidence").length} document(s) et {assessmentCount} réponse(s) au questionnaire. Les autres pièces administratives ne sont pas encore intégrées à ce récapitulatif.</p>
            <p style={{ marginTop: ".5rem" }}>Les conventions et signatures sont détaillées ci-dessus. Les autres démarches restent consultables depuis la fiche apprenant. Le suivi consolidé sera ajouté ici après raccordement aux données fiables.</p>
            {documents.length ? <details style={{ marginTop: "1rem" }}><summary>Preuves recensées ({documents.length})</summary><ul style={{ paddingLeft: "1.25rem" }}>{documents.map(doc => <li key={doc.id} style={{ overflowWrap: "anywhere" }}>{doc.logical_name || doc.document_type} · {status(doc.status)} · <EvidenceDownload id={doc.id} name={doc.logical_name || doc.document_type} /></li>)}</ul></details> : null}
            {!["abandoned", "cancelled", "declined"].includes(row.status) ? <div style={{ marginTop: ".9rem" }}><AbandonmentForm enrolmentId={row.id} busy={abandoningKey === row.id} onConfirm={confirmAbandonment} /></div> : null}
            <Link href={`/client/daily/apprenants?learner=${encodeURIComponent(row.learner_id)}`} style={{ display: "inline-block", marginTop: ".85rem" }}>Ouvrir la fiche apprenant →</Link>
          </details>;
        })}
      </section>
    </> : null}
  </main>;
}
