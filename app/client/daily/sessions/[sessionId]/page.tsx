"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Learner = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null };
type Enrolment = { id: string; learner_id: string; status: string; positioning_status?: string | null; prerequisites_status?: string | null; daily_learners?: Learner | Learner[] | null };
type Document = { id: string; enrolment_id: string; document_type: string; status: string; logical_name?: string | null };
type Evidence = { enrolments: Enrolment[]; documents: Document[]; assessmentResponses: { enrolment_id: string; submitted_at: string }[] };
type Session = { id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; modality?: string; location_address?: string | null; remote_url?: string | null; schedule_blocks?: { date: string; start: string; end: string; note?: string | null }[]; companies?: { name?: string | null; email?: string | null; participants?: unknown[] }[]; max_participants?: number | null; daily_formations?: { title?: string | null } | { title?: string | null }[] | null };

const panel: React.CSSProperties = { border: "1px solid var(--sepia-mid)", borderRadius: 16, padding: "1.25rem", background: "var(--paper)", minWidth: 0 };
function status(value?: string | null) {
  if (!value || value === "pending" || value === "not_started") return "À venir";
  if (value === "submitted") return "Reçue";
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

export default function DailySessionDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const [session, setSession] = useState<Session | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  const formation = session?.daily_formations;
  const title = Array.isArray(formation) ? formation[0]?.title : formation?.title;
  return <main style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(1rem, 3vw, 2rem)", display: "grid", gap: "1.25rem", minWidth: 0 }}>
    <Link href="/client/daily/sessions">← Retour aux sessions</Link>
    {loading ? <p role="status">Chargement du dossier de session…</p> : null}
    {error ? <p role="alert" style={{ color: "#a32b26" }}>{error}</p> : null}
    {session && evidence ? <>
      <header style={panel}>
        <h1 style={{ fontSize: "1.7rem", fontWeight: 750 }}>{title || "Dossier de session"}</h1>
        <p>{session.internal_reference || "Sans référence"} · {session.start_date || "Date à définir"}{session.end_date ? ` au ${session.end_date}` : ""}</p>
        <p>{session.modality || "Modalité à définir"}{session.location_address ? ` · ${session.location_address}` : ""}</p>
        <p>{evidence.enrolments.length} dossier(s) apprenant(s) suivi(s), dont {evidence.enrolments.filter(row => row.status === "abandoned").length} abandon(s) conservé(s) dans l’historique.</p>
        <Link href={`/client/daily/documents-avant-formation?session_id=${encodeURIComponent(session.id)}`}>Documents avant formation →</Link>
      </header>
      <section style={panel} aria-label="Organisation de la session">
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Organisation et intervenants</h2>
        <p>Capacité prévue : {session.max_participants ?? "Non renseignée"}</p>
        {session.remote_url ? <p>Lien de formation à distance : <a href={session.remote_url} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere", textDecoration: "underline" }}>Ouvrir la salle virtuelle</a></p> : null}
        {session.schedule_blocks?.length ? <details style={{ marginTop: ".75rem" }}><summary>Planning détaillé ({session.schedule_blocks.length} créneau(x))</summary><ul style={{ paddingLeft: "1.25rem" }}>{session.schedule_blocks.map((block, index) => <li key={index}>{block.date || "Date à définir"} · {block.start || "?"} – {block.end || "?"}{block.note ? ` · ${block.note}` : ""}</li>)}</ul></details> : null}
        {session.companies?.filter(company => company.name?.trim()).length ? <details style={{ marginTop: ".75rem" }}><summary>Entreprises rattachées ({session.companies.filter(company => company.name?.trim()).length})</summary><ul style={{ paddingLeft: "1.25rem" }}>{session.companies.filter(company => company.name?.trim()).map((company, index) => <li key={index} style={{ overflowWrap: "anywhere" }}><strong>{company.name}</strong>{company.email ? ` · ${company.email}` : ""}</li>)}</ul></details> : null}
      </section>
      <section style={{ display: "grid", gap: "1rem" }} aria-label="Parcours administratifs des apprenants">
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Apprenants et parcours administratifs</h2>
        {evidence.enrolments.length === 0 ? <p style={panel}>Aucun apprenant inscrit pour le moment.</p> : evidence.enrolments.map(row => {
          const learner = learnerOf(row);
          const documents = evidence.documents.filter(doc => doc.enrolment_id === row.id);
          const assessmentCount = evidence.assessmentResponses.filter(item => item.enrolment_id === row.id).length;
          return <article key={row.id} style={panel}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, overflowWrap: "anywhere" }}>{[learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant"}</h3>
            {["abandoned", "cancelled", "declined"].includes(row.status) ? <p role="status">Inscription clôturée ({row.status}) : preuves antérieures conservées.</p> : null}
            {learner?.email ? <p style={{ overflowWrap: "anywhere" }}>{learner.email}</p> : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: ".65rem", marginTop: "1rem" }}>
              {([["Inscription", row.status], ["Positionnement", row.positioning_status], ["Évaluation reçue", assessmentCount || documents.some(doc => doc.document_type === "learning_assessment_evidence") ? "submitted" : "pending"]] as const).map(([label, value]) =>
                <div key={label} style={{ padding: ".75rem", border: "1px solid var(--sepia-mid)", borderRadius: 10, minWidth: 0 }}>
                  <strong>{label}</strong><p>{status(value)}</p>
                </div>)}
            </div>
            <p style={{ marginTop: ".85rem" }}>Positionnement : {documents.filter(doc => doc.document_type === "positioning_evidence").length} preuve(s). Évaluation finale : {documents.filter(doc => doc.document_type === "learning_assessment_evidence").length} document(s) et {assessmentCount} réponse(s) au questionnaire. Les autres pièces administratives ne sont pas encore intégrées à ce récapitulatif.</p>
            <p style={{ marginTop: ".5rem" }}>Prérequis, signatures et autres démarches : consulter la fiche apprenant pour les informations disponibles. Le suivi consolidé sera ajouté ici après raccordement aux données fiables.</p>
            {documents.length ? <details style={{ marginTop: "1rem" }}><summary>Preuves recensées ({documents.length})</summary><ul style={{ paddingLeft: "1.25rem" }}>{documents.map(doc => <li key={doc.id} style={{ overflowWrap: "anywhere" }}>{doc.logical_name || doc.document_type} · {status(doc.status)} · <EvidenceDownload id={doc.id} name={doc.logical_name || doc.document_type} /></li>)}</ul></details> : null}
            <Link href={`/client/daily/apprenants?learner=${encodeURIComponent(row.learner_id)}`} style={{ display: "inline-block", marginTop: ".85rem" }}>Ouvrir la fiche apprenant →</Link>
          </article>;
        })}
      </section>
    </> : null}
  </main>;
}
