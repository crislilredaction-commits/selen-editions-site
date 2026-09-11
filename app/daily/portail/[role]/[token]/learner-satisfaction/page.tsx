"use client";

import { FormEvent, useEffect, useState } from "react";
import Header from "@/components/Header";

type Data = {
  available: boolean;
  availableFrom: string | null;
  alreadySubmitted: boolean;
  mode: string;
  session: { formationTitle: string };
};

type FormState = {
  overall_rating: string;
  objectives_rating: string;
  trainer_rating: string;
  organisation_rating: string;
  content_rating: string;
  pace_rating: string;
  would_recommend: string;
  strengths: string;
  improvements: string;
  adaptation_feedback: string;
  free_comment: string;
};

const initial: FormState = { overall_rating: "", objectives_rating: "", trainer_rating: "", organisation_rating: "", content_rating: "", pace_rating: "", would_recommend: "", strengths: "", improvements: "", adaptation_feedback: "", free_comment: "" };

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value));
}

export default function LearnerSatisfactionPage({ params }: { params: { role: string; token: string } }) {
  const { role, token } = params;
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<FormState>(initial);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    void fetch(`/api/daily-portal/${token}/learner-satisfaction`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json().catch(() => null) }))
      .then(({ response, payload }) => {
        setLoading(false);
        if (!response.ok) return setError(payload?.error ?? "Questionnaire indisponible.");
        setData(payload);
      });
  }, [token]);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.overall_rating || !form.objectives_rating) return setError("La satisfaction globale et l’atteinte des objectifs sont obligatoires.");
    setSending(true); setError("");
    const response = await fetch(`/api/daily-portal/${token}/learner-satisfaction`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, overall_rating: Number(form.overall_rating), objectives_rating: Number(form.objectives_rating), trainer_rating: form.trainer_rating ? Number(form.trainer_rating) : null, organisation_rating: form.organisation_rating ? Number(form.organisation_rating) : null, content_rating: form.content_rating ? Number(form.content_rating) : null, pace_rating: form.pace_rating ? Number(form.pace_rating) : null, would_recommend: form.would_recommend === "yes" ? true : form.would_recommend === "no" ? false : null }),
    });
    const payload = await response.json().catch(() => null); setSending(false);
    if (!response.ok) return setError(payload?.error ?? "Enregistrement impossible.");
    setSuccess(true);
  }

  return <main className="gazette-paper" style={s.page}>
    <Header />
    <section style={s.hero}><p className="gazette-label">Selen Daily · satisfaction apprenant</p><h1 style={s.title}>Votre retour sur la formation</h1><p style={s.subtitle}>{data?.session.formationTitle ?? "Formation Daily"}</p><a href={`/daily/portail/${role}/${token}`} style={s.link}>← Retour à mon espace</a></section>
    {loading ? <p style={s.state}>Chargement…</p> : null}{error ? <p style={s.error}>{error}</p> : null}
    {data && !data.available && !data.alreadySubmitted ? <section style={s.panel}><h2 style={s.h2}>Questionnaire à venir</h2><p>{data.mode === "selen_quiz" ? "Transmettez d’abord votre évaluation de fin de formation. La satisfaction s’ouvrira juste après." : data.availableFrom ? `Le questionnaire s’ouvrira le ${formatDate(data.availableFrom)}, environ deux heures avant la fin planifiée.` : "Le questionnaire s’ouvrira en fin de session."}</p>{data.mode === "selen_quiz" ? <a href={`/daily/portail/${role}/${token}/evaluation`} style={s.link}>Ouvrir mon évaluation</a> : null}</section> : null}
    {data?.alreadySubmitted || success ? <section style={s.panel}><h2 style={s.h2}>Merci pour votre retour</h2><p>Votre réponse est enregistrée et rattachée à votre session.</p></section> : null}
    {data?.available && !data.alreadySubmitted && !success ? <form onSubmit={submit} style={s.form}>
      <section style={s.panel}><h2 style={s.h2}>Évaluation</h2><Rating label="Satisfaction globale *" value={form.overall_rating} onChange={(v) => field("overall_rating", v)} /><Rating label="Atteinte des objectifs *" value={form.objectives_rating} onChange={(v) => field("objectives_rating", v)} /><Rating label="Qualité du formateur" value={form.trainer_rating} onChange={(v) => field("trainer_rating", v)} /><Rating label="Organisation" value={form.organisation_rating} onChange={(v) => field("organisation_rating", v)} /><Rating label="Contenu" value={form.content_rating} onChange={(v) => field("content_rating", v)} /><Rating label="Rythme" value={form.pace_rating} onChange={(v) => field("pace_rating", v)} /><label style={s.field}><span>Recommanderiez-vous cette formation ?</span><select value={form.would_recommend} onChange={(e) => field("would_recommend", e.target.value)} style={s.input}><option value="">Non renseigné</option><option value="yes">Oui</option><option value="no">Non</option></select></label></section>
      <section style={s.panel}><h2 style={s.h2}>Votre appréciation</h2><Text label="Points forts" value={form.strengths} onChange={(v) => field("strengths", v)} /><Text label="Points à améliorer" value={form.improvements} onChange={(v) => field("improvements", v)} /><Text label="Adaptations ou besoins particuliers" value={form.adaptation_feedback} onChange={(v) => field("adaptation_feedback", v)} /><Text label="Commentaire libre" value={form.free_comment} onChange={(v) => field("free_comment", v)} /></section>
      <button disabled={sending} style={s.button}>{sending ? "Enregistrement…" : "Transmettre mon questionnaire"}</button>
    </form> : null}
  </main>;
}

function Rating({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label style={s.field}><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} style={s.input}><option value="">Non renseigné</option>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}/5</option>)}</select></label>; }
function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label style={s.field}><span>{label}</span><textarea rows={4} maxLength={4000} value={value} onChange={(e) => onChange(e.target.value)} style={{ ...s.input, resize: "vertical" }} /></label>; }
const s: Record<string, React.CSSProperties> = { page:{minHeight:"100vh",padding:"1rem",color:"var(--ink)"},hero:{maxWidth:780,margin:"1rem auto",display:"grid",gap:"0.55rem"},title:{margin:0,fontSize:"clamp(1.7rem,4vw,2.6rem)"},subtitle:{color:"var(--ink-soft)"},state:{maxWidth:780,margin:"1rem auto"},form:{maxWidth:780,margin:"1rem auto 3rem",display:"grid",gap:"1rem"},panel:{maxWidth:780,margin:"1rem auto",display:"grid",gap:"1rem",background:"var(--paper)",border:"1px solid var(--sepia-mid)",borderLeft:"4px solid var(--ocre-gold)",padding:"1rem"},h2:{margin:0,fontSize:"1.15rem"},field:{display:"grid",gap:"0.4rem",fontWeight:700},input:{width:"100%",boxSizing:"border-box",border:"1px solid var(--sepia-mid)",background:"var(--paper)",color:"var(--ink)",padding:"0.75rem",font:"inherit"},button:{border:0,background:"var(--rust)",color:"#fff",fontWeight:800,padding:"0.9rem 1.1rem",cursor:"pointer"},link:{color:"var(--rust)",fontWeight:800,textDecoration:"none",width:"fit-content"},error:{maxWidth:780,margin:"1rem auto",border:"1px solid var(--rust)",background:"rgba(138,75,36,0.08)",color:"var(--rust)",padding:"0.75rem"} };
