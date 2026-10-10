"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Learner = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null };
type Enrolment = { id: string; learner_id: string; status: string; positioning_status?: string | null; prerequisites_status?: string | null; daily_learners?: Learner | Learner[] | null };
type Document = { id: string; enrolment_id: string; document_type: string; status: string; logical_name?: string | null };
type Evidence = { enrolments: Enrolment[]; documents: Document[]; assessmentResponses: { enrolment_id: string; submitted_at: string }[] };
type Session = { id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; modality?: string; location_address?: string | null; remote_url?: string | null; daily_formations?: { title?: string | null } | { title?: string | null }[] | null };

const panel: React.CSSProperties = { border: "1px solid var(--sepia-mid)", borderRadius: 16, padding: "1.25rem", background: "var(--paper)", minWidth: 0 };
function status(value?: string | null) {
  if (!value || value === "pending" || value === "not_started") return "À venir";
  if (["completed", "validated", "approved", "signed", "done", "submitted"].includes(value)) return "Terminé";
  if (["rejected", "failed", "blocked", "cancelled", "abandoned", "declined"].includes(value)) return "Bloqué";
  return "En cours";
}
function learnerOf(row: Enrolment) { return Array.isArray(row.daily_learners) ? row.daily_learners[0] : row.daily_learners; }

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
        <p>{evidence.enrolments.length} apprenant(s) inscrit(s)</p>
        <Link href={`/client/daily/documents-avant-formation?session_id=${encodeURIComponent(session.id)}`}>Documents avant formation →</Link>
      </header>
      <section style={{ display: "grid", gap: "1rem" }} aria-label="Parcours administratifs des apprenants">
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Apprenants et parcours administratifs</h2>
        {evidence.enrolments.length === 0 ? <p style={panel}>Aucun apprenant inscrit pour le moment.</p> : evidence.enrolments.map(row => {
          const learner = learnerOf(row);
          const documents = evidence.documents.filter(doc => doc.enrolment_id === row.id);
          const assessmentCount = evidence.assessmentResponses.filter(item => item.enrolment_id === row.id).length;
          return <article key={row.id} style={panel}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, overflowWrap: "anywhere" }}>{[learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant"}</h3>
            {learner?.email ? <p style={{ overflowWrap: "anywhere" }}>{learner.email}</p> : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: ".65rem", marginTop: "1rem" }}>
              {([["Inscription", row.status], ["Positionnement", row.positioning_status], ["Prérequis", row.prerequisites_status], ["Documents", documents.length ? "in_progress" : "pending"], ["Évaluations", assessmentCount ? "submitted" : "pending"]] as const).map(([label, value]) =>
                <div key={label} style={{ padding: ".75rem", border: "1px solid var(--sepia-mid)", borderRadius: 10, minWidth: 0 }}>
                  <strong>{label}</strong><p>{status(value)}</p>
                </div>)}
            </div>
            {documents.length ? <details style={{ marginTop: "1rem" }}><summary>Documents et preuves ({documents.length})</summary><ul style={{ paddingLeft: "1.25rem" }}>{documents.map(doc => <li key={doc.id} style={{ overflowWrap: "anywhere" }}>{doc.logical_name || doc.document_type} · {status(doc.status)}</li>)}</ul></details> : null}
            <Link href={`/client/daily/apprenants?learner_id=${encodeURIComponent(row.learner_id)}`} style={{ display: "inline-block", marginTop: ".85rem" }}>Consulter la fiche apprenant →</Link>
          </article>;
        })}
      </section>
    </> : null}
  </main>;
}
