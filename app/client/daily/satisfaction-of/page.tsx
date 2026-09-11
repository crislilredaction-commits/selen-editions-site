"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type SessionItem = {
  id: string;
  reference: string | null;
  startDate: string | null;
  endDate: string | null;
  formationTitle: string;
  response: { overall_rating: number; strengths: string | null; improvements: string | null; free_comment: string | null; submitted_at: string } | null;
};

export default function OfSatisfactionPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [rating, setRating] = useState(5);
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const pending = useMemo(() => sessions.filter((item) => !item.response), [sessions]);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/client/daily/of-satisfaction", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(data.error ?? "Impossible de charger les sessions clôturées.");
    else {
      setSessions(data.sessions ?? []);
      setSessionId((current) => current || data.sessions?.find((item: SessionItem) => !item.response)?.id || "");
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/client/daily/of-satisfaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, overall_rating: rating, strengths, improvements, free_comment: suggestions }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 207) { setMessage(data.error ?? "Impossible d’enregistrer votre retour."); return; }
    setMessage("Merci. Votre retour sur Selen Daily a bien été enregistré.");
    setStrengths(""); setImprovements(""); setSuggestions(""); setRating(5); setSessionId("");
    await load();
  }

  return <main className="mx-auto max-w-4xl space-y-6 p-6">
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Après la formation</p><h1 className="text-3xl font-bold">Votre avis sur Selen Daily</h1><p className="mt-2 text-sm text-neutral-600">Ce retour concerne votre expérience de la plateforme et de l’organisation Daily. Il est distinct des questionnaires Qualiopi adressés aux parties prenantes.</p></div>
      <Link className="rounded-lg border px-3 py-2 text-sm font-medium" href="/client/daily/sessions">Retour aux sessions</Link>
    </div>

    {!loading && pending.length > 0 && <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
      <label className="block text-sm font-semibold">Session clôturée<select className="mt-1 w-full rounded-lg border p-2" value={sessionId} onChange={(event) => setSessionId(event.target.value)} required><option value="">Choisir une session</option>{pending.map((item) => <option key={item.id} value={item.id}>{item.formationTitle}{item.reference ? ` · ${item.reference}` : ""}</option>)}</select></label>
      <label className="block text-sm font-semibold">Note globale de Selen Daily : {rating}/5<input className="mt-2 w-full" type="range" min="1" max="5" step="1" value={rating} onChange={(event) => setRating(Number(event.target.value))} /></label>
      <label className="block text-sm font-semibold">Ce que vous avez apprécié<textarea className="mt-1 min-h-24 w-full rounded-lg border p-3" value={strengths} onChange={(event) => setStrengths(event.target.value)} /></label>
      <label className="block text-sm font-semibold">Ce qui a moins bien fonctionné<textarea className="mt-1 min-h-24 w-full rounded-lg border p-3" value={improvements} onChange={(event) => setImprovements(event.target.value)} /></label>
      <label className="block text-sm font-semibold">Vos suggestions<textarea className="mt-1 min-h-24 w-full rounded-lg border p-3" value={suggestions} onChange={(event) => setSuggestions(event.target.value)} /></label>
      <button className="rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white" type="submit">Envoyer mon avis</button>
    </form>}

    {!loading && sessions.length === 0 && <div className="rounded-xl border bg-white p-5 text-sm text-neutral-600">Le questionnaire apparaîtra ici lorsqu’un dossier de session sera clôturé.</div>}
    {!loading && sessions.length > 0 && pending.length === 0 && <div className="rounded-xl border bg-white p-5 text-sm text-neutral-600">Tous les retours disponibles ont déjà été transmis. Merci.</div>}
    {message && <p className="rounded-lg bg-neutral-100 p-3 text-sm">{message}</p>}

    {sessions.some((item) => item.response) && <section className="space-y-3"><h2 className="text-xl font-bold">Retours déjà transmis</h2>{sessions.filter((item) => item.response).map((item) => <article key={item.id} className="rounded-xl border bg-white p-4"><div className="flex justify-between gap-4"><strong>{item.formationTitle}</strong><span className="text-sm font-semibold">{item.response?.overall_rating}/5</span></div><p className="mt-1 text-xs text-neutral-500">{item.reference ?? "Session"} · transmis le {new Date(item.response!.submitted_at).toLocaleDateString("fr-FR")}</p></article>)}</section>}
  </main>;
}
