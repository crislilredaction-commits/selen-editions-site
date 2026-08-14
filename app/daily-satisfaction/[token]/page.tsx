"use client";

import { useEffect, useState } from "react";

type Data = {
  session: { title: string; startDate?: string | null; endDate?: string | null };
  learner: { firstName?: string; lastName?: string };
  alreadySubmitted: boolean;
  submittedAt?: string | null;
};

const QUESTIONS = [
  ["overall_rating", "Votre satisfaction globale"],
  ["objectives_rating", "Les objectifs annoncés ont-ils été atteints ?"],
  ["trainer_rating", "Le formateur / la formatrice"],
  ["organisation_rating", "L'organisation de la formation"],
  ["content_rating", "Le contenu et les supports"],
  ["pace_rating", "Le rythme de la formation"],
] as const;

export default function DailySatisfactionPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [data, setData] = useState<Data | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [adaptationFeedback, setAdaptationFeedback] = useState("");
  const [freeComment, setFreeComment] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/daily-feedback/${token}`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!response.ok) return setError(body?.error ?? "Lien indisponible.");
        setData(body);
      })
      .catch(() => setError("Lien indisponible."));
  }, [token]);

  async function submit() {
    if (QUESTIONS.some(([key]) => !ratings[key])) return setError("Merci de noter chaque critère de 1 à 5.");
    setSaving(true);
    setError("");
    const response = await fetch(`/api/daily-feedback/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...ratings,
        would_recommend: wouldRecommend,
        strengths,
        improvements,
        adaptation_feedback: adaptationFeedback,
        free_comment: freeComment,
      }),
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return setError(body?.error ?? "Votre réponse n'a pas pu être enregistrée.");
    const submittedAt = body?.submittedAt ?? new Date().toISOString();
    setData((current) => current ? { ...current, alreadySubmitted: true, submittedAt } : current);
    setNotice("Merci. Votre retour a bien été enregistré.");
  }

  return (
    <main style={{ minHeight: "100vh", padding: "1.5rem", background: "#f7efe2", color: "#3f2b1d" }}>
      <section style={{ maxWidth: 760, margin: "2rem auto", padding: "1.25rem", background: "#fffaf0", border: "1px solid #c9a055", display: "grid", gap: "1rem" }}>
        <p style={{ fontWeight: 800, color: "#8a4b24", margin: 0 }}>Selen Daily · Satisfaction</p>
        {error ? <p style={{ padding: ".75rem", border: "1px solid #8a4b24" }}>{error}</p> : null}
        {notice ? <p style={{ padding: ".75rem", border: "1px solid #6a8a4a" }}>{notice}</p> : null}
        {data ? <>
          <h1 style={{ margin: 0 }}>{data.session.title}</h1>
          <p>Bonjour {[data.learner.firstName, data.learner.lastName].filter(Boolean).join(" ") || ""}. Votre retour nous aide à améliorer concrètement les prochaines sessions.</p>
          {data.alreadySubmitted ? <p style={{ padding: ".75rem", border: "1px solid #6a8a4a" }}>Votre questionnaire a déjà été transmis{data.submittedAt ? ` le ${new Date(data.submittedAt).toLocaleString("fr-FR")}` : ""}.</p> : <>
            {QUESTIONS.map(([key, label]) => <fieldset key={key} style={{ border: "1px solid #d7b98a", padding: ".9rem" }}>
              <legend style={{ fontWeight: 700 }}>{label}</legend>
              <div style={{ display: "flex", gap: ".55rem", flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5].map((value) => <label key={value} style={{ display: "flex", gap: ".25rem", alignItems: "center" }}>
                  <input type="radio" name={key} checked={ratings[key] === value} onChange={() => setRatings((current) => ({ ...current, [key]: value }))} /> {value}
                </label>)}
              </div>
            </fieldset>)}
            <fieldset style={{ border: "1px solid #d7b98a", padding: ".9rem" }}>
              <legend style={{ fontWeight: 700 }}>Recommanderiez-vous cette formation ?</legend>
              <label style={{ marginRight: "1rem" }}><input type="radio" checked={wouldRecommend === true} onChange={() => setWouldRecommend(true)} /> Oui</label>
              <label><input type="radio" checked={wouldRecommend === false} onChange={() => setWouldRecommend(false)} /> Non</label>
            </fieldset>
            <label style={{ display: "grid", gap: ".4rem" }}>Ce que vous avez particulièrement apprécié<textarea value={strengths} onChange={(event) => setStrengths(event.target.value)} rows={3} style={{ padding: ".7rem" }} /></label>
            <label style={{ display: "grid", gap: ".4rem" }}>Ce qui pourrait être amélioré<textarea value={improvements} onChange={(event) => setImprovements(event.target.value)} rows={3} style={{ padding: ".7rem" }} /></label>
            <label style={{ display: "grid", gap: ".4rem" }}>Adaptations ou aménagements : votre retour<textarea value={adaptationFeedback} onChange={(event) => setAdaptationFeedback(event.target.value)} rows={3} style={{ padding: ".7rem" }} /></label>
            <label style={{ display: "grid", gap: ".4rem" }}>Autre commentaire<textarea value={freeComment} onChange={(event) => setFreeComment(event.target.value)} rows={3} style={{ padding: ".7rem" }} /></label>
            <button type="button" onClick={() => void submit()} disabled={saving} style={{ width: "fit-content", padding: ".8rem 1rem", fontWeight: 800 }}>{saving ? "Enregistrement..." : "Envoyer mon retour"}</button>
          </>}
        </> : !error ? <p>Ouverture du questionnaire...</p> : null}
      </section>
    </main>
  );
}
