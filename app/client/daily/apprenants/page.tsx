"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Learner = { id: string; first_name: string; last_name: string; email?: string | null; phone?: string | null; company_name?: string | null; job_title?: string | null; status: string };
type Session = { id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; daily_formations?: { title?: string | null } | null };
type Enrolment = { id: string; session_id: string; learner_id: string; status: string; funding_type: string; funding_organisation?: string | null; positioning_status: string; prerequisites_status: string; daily_learners?: Learner | null; daily_sessions?: Session | null };
type SupportNeed = { enrolment_id: string; has_specific_needs: boolean; needs_description?: string | null; planned_accommodations?: string | null; contact_requested: boolean };

const card: React.CSSProperties = { border: "1px solid var(--sepia-mid)", background: "var(--paper)", padding: "1rem", borderRadius: 8 };
const field: React.CSSProperties = { width: "100%", padding: ".6rem", border: "1px solid var(--sepia-mid)", background: "white" };

export default function DailyLearnersPage() {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [supportNeeds, setSupportNeeds] = useState<SupportNeed[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedLearner, setSelectedLearner] = useState("");
  const [selectedSession, setSelectedSession] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [learnersRes, sessionsRes] = await Promise.all([
        assistanceFetch("/api/client/daily/learners", { cache: "no-store" }),
        assistanceFetch("/api/client/daily/sessions", { cache: "no-store" }),
      ]);
      const learnerData = await learnersRes.json().catch(() => ({}));
      const sessionData = await sessionsRes.json().catch(() => ({}));
      if (!learnersRes.ok) throw new Error(learnerData.error ?? "Impossible de charger les apprenants.");
      if (!sessionsRes.ok) throw new Error(sessionData.error ?? "Impossible de charger les sessions.");
      setLearners(learnerData.learners ?? []);
      setEnrolments(learnerData.enrolments ?? []);
      setSupportNeeds(learnerData.supportNeeds ?? []);
      setSessions((sessionData.sessions ?? []).filter((session: { status?: string }) => session.status !== "archived"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const supportByEnrolment = useMemo(() => new Map(supportNeeds.map((item) => [item.enrolment_id, item])), [supportNeeds]);

  async function createLearner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await assistanceFetch("/api/client/daily/learners", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "learner", first_name: form.get("first_name"), last_name: form.get("last_name"), email: form.get("email"), phone: form.get("phone"), company_name: form.get("company_name"), job_title: form.get("job_title") }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Création impossible.");
    else { setMessage("Apprenant ajouté."); event.currentTarget.reset(); await load(); }
    setSaving(false);
  }

  async function enrol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await assistanceFetch("/api/client/daily/learners", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enrolment", learner_id: selectedLearner, session_id: selectedSession, funding_type: form.get("funding_type"), funding_organisation: form.get("funding_organisation"), company_name: form.get("company_name"), company_contact_name: form.get("company_contact_name"), company_contact_email: form.get("company_contact_email") }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Inscription impossible.");
    else { setMessage("Apprenant inscrit à la session."); setSelectedLearner(""); setSelectedSession(""); event.currentTarget.reset(); await load(); }
    setSaving(false);
  }

  async function updateEnrolment(id: string, patch: Record<string, string>) {
    setError(""); setMessage("");
    const response = await assistanceFetch("/api/client/daily/learners", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Mise à jour impossible.");
    setMessage("Inscription mise à jour."); await load();
  }

  async function saveSupport(event: FormEvent<HTMLFormElement>, enrolmentId: string) {
    event.preventDefault(); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const hasNeeds = form.get("has_specific_needs") === "on";
    const response = await assistanceFetch("/api/client/daily/learners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "support", enrolment_id: enrolmentId, has_specific_needs: hasNeeds, needs_description: form.get("needs_description"), planned_accommodations: form.get("planned_accommodations"), contact_requested: form.get("contact_requested") === "on" }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Enregistrement impossible.");
    setMessage("Besoins d’adaptation mis à jour."); await load();
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1rem", display: "grid", gap: "1rem" }}>
      <header><p style={{ color: "var(--rust)", fontWeight: 700 }}>SELEN DAILY</p><h1>Apprenants & inscriptions</h1><p>Un apprenant est enregistré une seule fois dans votre organisme, puis peut être inscrit à plusieurs sessions.</p></header>
      {error && <p style={{ color: "#a33" }}>{error}</p>}{message && <p style={{ color: "#476b3b" }}>{message}</p>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "1rem" }}>
        <form onSubmit={createLearner} style={card}><h2>Nouvel apprenant</h2><div style={{ display: "grid", gap: ".65rem" }}>
          <input name="first_name" placeholder="Prénom *" required style={field}/><input name="last_name" placeholder="Nom *" required style={field}/><input name="email" type="email" placeholder="Email" style={field}/><input name="phone" placeholder="Téléphone" style={field}/><input name="company_name" placeholder="Entreprise" style={field}/><input name="job_title" placeholder="Fonction" style={field}/><button disabled={saving}>Ajouter l’apprenant</button>
        </div></form>
        <form onSubmit={enrol} style={card}><h2>Inscrire à une session</h2><div style={{ display: "grid", gap: ".65rem" }}>
          <select required value={selectedLearner} onChange={(e)=>setSelectedLearner(e.target.value)} style={field}><option value="">Choisir un apprenant</option>{learners.filter(l=>l.status==="active").map(l=><option key={l.id} value={l.id}>{l.first_name} {l.last_name}</option>)}</select>
          <select required value={selectedSession} onChange={(e)=>setSelectedSession(e.target.value)} style={field}><option value="">Choisir une session</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.daily_formations?.title ?? "Session"} · {s.internal_reference ?? s.start_date ?? s.id.slice(0,8)}</option>)}</select>
          <select name="funding_type" defaultValue="unknown" style={field}><option value="unknown">Financement à préciser</option><option value="employer">Employeur</option><option value="opco">OPCO</option><option value="public_funder">Financeur public</option><option value="self_funded">Autofinancement</option><option value="other">Autre</option></select>
          <input name="funding_organisation" placeholder="Nom du financeur" style={field}/><input name="company_name" placeholder="Entreprise commanditaire" style={field}/><input name="company_contact_name" placeholder="Contact entreprise" style={field}/><input name="company_contact_email" type="email" placeholder="Email du contact" style={field}/><button disabled={saving}>Créer l’inscription</button>
        </div></form>
      </section>

      <section style={card}><h2>Répertoire des apprenants</h2>{learners.length===0 ? <p>Aucun apprenant pour le moment.</p> : <div style={{ display: "grid", gap: ".6rem" }}>{learners.map(l=><div key={l.id} style={{ borderTop: "1px solid var(--sepia-mid)", paddingTop: ".6rem" }}><strong>{l.first_name} {l.last_name}</strong>{l.email ? ` · ${l.email}` : ""}{l.company_name ? ` · ${l.company_name}` : ""}{l.job_title ? ` · ${l.job_title}` : ""}</div>)}</div>}</section>

      <section style={{ display: "grid", gap: "1rem" }}><h2>Inscriptions</h2>{enrolments.length===0 ? <p>Aucune inscription.</p> : enrolments.map((e)=>{ const n=supportByEnrolment.get(e.id); return <article key={e.id} style={card}>
        <h3>{e.daily_learners?.first_name} {e.daily_learners?.last_name}</h3><p>{e.daily_sessions?.daily_formations?.title ?? "Session"} · {e.daily_sessions?.internal_reference ?? e.daily_sessions?.start_date ?? ""}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: ".6rem" }}>
          <label>Statut<select value={e.status} onChange={(ev)=>void updateEnrolment(e.id,{status:ev.target.value})} style={field}><option value="invited">Invité</option><option value="pending">En attente</option><option value="confirmed">Confirmé</option><option value="declined">Refusé</option><option value="cancelled">Annulé</option><option value="completed">Terminé</option></select></label>
          <label>Positionnement<select value={e.positioning_status} onChange={(ev)=>void updateEnrolment(e.id,{positioning_status:ev.target.value})} style={field}><option value="not_started">Non démarré</option><option value="sent">Envoyé</option><option value="submitted">Répondu</option><option value="reviewed">Relu</option></select></label>
          <label>Prérequis<select value={e.prerequisites_status} onChange={(ev)=>void updateEnrolment(e.id,{prerequisites_status:ev.target.value})} style={field}><option value="not_reviewed">Non vérifiés</option><option value="met">Validés</option><option value="not_met">Non remplis</option><option value="to_clarify">À clarifier</option></select></label>
        </div>
        <form onSubmit={(ev)=>void saveSupport(ev,e.id)} style={{ marginTop: "1rem", display: "grid", gap: ".5rem" }}>
          <label><input type="checkbox" name="has_specific_needs" defaultChecked={n?.has_specific_needs ?? false}/> Besoins d’adaptation ou d’accessibilité à prévoir</label>
          <textarea name="needs_description" defaultValue={n?.needs_description ?? ""} placeholder="Décrire uniquement les besoins utiles à l’organisation de la formation" style={field}/><textarea name="planned_accommodations" defaultValue={n?.planned_accommodations ?? ""} placeholder="Adaptations prévues" style={field}/><label><input type="checkbox" name="contact_requested" defaultChecked={n?.contact_requested ?? false}/> Un échange complémentaire est nécessaire</label><button>Enregistrer les adaptations</button>
        </form>
      </article>;})}</section>
    </main>
  );
}
