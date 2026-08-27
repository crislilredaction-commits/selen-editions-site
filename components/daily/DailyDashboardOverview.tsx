"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Formation = {
  id: string;
  title: string;
  status: string;
  modality?: string | null;
  public_registration_token?: string | null;
  spontaneous_registration_task_status?: string | null;
};

type Session = {
  id: string;
  formation_id: string;
  start_date?: string | null;
  end_date?: string | null;
  status: string;
  modality?: string | null;
  distance_mode?: string | null;
  daily_formations?: { title?: string | null } | null;
};

function formatDate(value?: string | null) {
  if (!value) return "Date à définir";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export default function DailyDashboardOverview() {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [formationRes, sessionRes] = await Promise.all([
          assistanceFetch("/api/client/daily/formations", { cache: "no-store" }),
          assistanceFetch("/api/client/daily/sessions", { cache: "no-store" }),
        ]);
        const formationData = await formationRes.json().catch(() => ({}));
        const sessionData = await sessionRes.json().catch(() => ({}));
        if (!cancelled) {
          setFormations((formationData.formations ?? []).filter((formation: Formation) => formation.status !== "archived"));
          setSessions((sessionData.sessions ?? []).filter((session: Session) => session.status !== "archived"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const futureSessions = useMemo(
    () => sessions.filter((session) => !session.start_date || session.start_date >= today).sort((a, b) => String(a.start_date ?? "9999").localeCompare(String(b.start_date ?? "9999"))),
    [sessions, today],
  );
  const requestsToPlan = useMemo(
    () => formations.filter((formation) => formation.spontaneous_registration_task_status === "to_attach" && !futureSessions.some((session) => session.formation_id === formation.id)),
    [formations, futureSessions],
  );

  const readySessions = futureSessions.filter((session) => session.status === "ready").length;
  const next = futureSessions[0] ?? null;

  return (
    <section style={s.wrap} aria-label="Tableau de bord Selen Daily">
      <div style={s.welcome}>
        <div>
          <p style={s.eyebrow}>Selen Daily</p>
          <h1 style={s.title}>Votre activité, en un coup d’œil ✨</h1>
          <p style={s.lead}>{loading ? "Selen rassemble vos informations…" : requestsToPlan.length > 0 ? "Une demande attend votre attention. Vous êtes au bon endroit pour la transformer en prochaine étape." : "Tout avance. Gardez le cap, Selen vous montre seulement ce qui mérite vraiment votre attention."}</p>
        </div>
        <Link href="/client/daily/a-faire" style={s.primaryLink}>Voir ce qui est à faire</Link>
      </div>

      <div style={s.metrics}>
        <article style={s.metricCard}><span style={s.icon}>📚</span><strong style={s.metric}>{formations.length}</strong><span>formation{formations.length > 1 ? "s" : ""}</span></article>
        <article style={s.metricCard}><span style={s.icon}>🗓️</span><strong style={s.metric}>{futureSessions.length}</strong><span>session{futureSessions.length > 1 ? "s" : ""} à venir</span></article>
        <article style={s.metricCard}><span style={s.icon}>✅</span><strong style={s.metric}>{readySessions}</strong><span>session{readySessions > 1 ? "s" : ""} prête{readySessions > 1 ? "s" : ""}</span></article>
        <article style={{ ...s.metricCard, ...(requestsToPlan.length ? s.alertMetric : {}) }}><span style={s.icon}>📞</span><strong style={s.metric}>{requestsToPlan.length}</strong><span>date{requestsToPlan.length > 1 ? "s" : ""} à caler</span></article>
      </div>

      <div style={s.columns}>
        <article style={s.card}>
          <div style={s.cardHead}><div><p style={s.eyebrow}>Prochaine étape</p><h2 style={s.h2}>{next ? next.daily_formations?.title ?? "Session à venir" : "Aucune session planifiée"}</h2></div><span style={s.bigIcon}>{next ? "🚀" : "🌱"}</span></div>
          {next ? <><p style={s.date}>{formatDate(next.start_date)}</p><p style={s.muted}>{next.modality === "distanciel" && next.distance_mode === "asynchrone" ? "Distanciel asynchrone" : next.modality === "distanciel" ? "Distanciel synchrone" : next.modality === "presentiel" ? "Présentiel" : "Mixte"}</p><Link href={`/client/daily/sessions?session=${next.id}`} style={s.secondaryLink}>Ouvrir la session</Link></> : <><p style={s.muted}>Créez une session lorsque vous avez une date, ou laissez la formation ouverte aux demandes d’inscription.</p><Link href="/client/daily/formations" style={s.secondaryLink}>Voir mes formations</Link></>}
        </article>

        <article style={s.card}>
          <div style={s.cardHead}><div><p style={s.eyebrow}>À surveiller</p><h2 style={s.h2}>Demandes sans date</h2></div><span style={s.bigIcon}>👀</span></div>
          {requestsToPlan.length === 0 ? <p style={s.good}>Rien d’urgent ici. Vos demandes disposent d’une session planifiée ou aucune nouvelle demande n’attend de date.</p> : <div style={s.stack}>{requestsToPlan.slice(0, 3).map((formation) => <div key={formation.id} style={s.notice}><strong>{formation.title}</strong><span>Une inscription a été reçue sans session disponible. Une date doit être calée avec le formateur, puis le candidat devra être recontacté.</span><Link href={`/client/daily/sessions?formation=${formation.id}`} style={s.secondaryLink}>Planifier une session</Link></div>)}</div>}
        </article>
      </div>

      <div style={s.quick}>
        <Link href="/client/daily/formations" style={s.quickCard}><span>📘</span><strong>Formations</strong><small>Programmes et lien d’inscription</small></Link>
        <Link href="/client/daily/sessions" style={s.quickCard}><span>📅</span><strong>Sessions</strong><small>Dates, formateurs et organisation</small></Link>
        <Link href="/client/daily/apprenants" style={s.quickCard}><span>🧑‍🎓</span><strong>Apprenants</strong><small>Dossiers et suivi</small></Link>
        <Link href="/client/daily/documents" style={s.quickCard}><span>🗂️</span><strong>Documents</strong><small>Préformation et conformité</small></Link>
      </div>
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1180, margin: "0 auto", padding: "1.5rem 1rem .25rem", color: "var(--ink)" },
  welcome: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", padding: "1.4rem", border: "1px solid var(--sepia-mid)", borderRadius: 22, background: "linear-gradient(135deg, rgba(255,250,239,.98), rgba(201,160,85,.13))", boxShadow: "0 14px 38px rgba(59,45,33,.07)" },
  eyebrow: { margin: 0, textTransform: "uppercase", letterSpacing: ".12em", fontSize: 11, fontWeight: 900, color: "var(--rust)" },
  title: { margin: ".25rem 0", fontSize: "clamp(1.8rem,4vw,3rem)" },
  lead: { margin: ".35rem 0 0", maxWidth: 760, lineHeight: 1.55, color: "var(--ink-soft)" },
  primaryLink: { textDecoration: "none", background: "var(--rust)", color: "white", borderRadius: 999, padding: ".8rem 1rem", fontWeight: 850 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: ".8rem", marginTop: ".9rem" },
  metricCard: { border: "1px solid var(--sepia-mid)", background: "var(--paper)", borderRadius: 18, padding: "1rem", display: "grid", gap: 3, boxShadow: "0 8px 24px rgba(59,45,33,.05)" },
  alertMetric: { borderColor: "#d3a758", background: "#fff8e8" },
  icon: { fontSize: 24 }, metric: { fontSize: 28 },
  columns: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: ".9rem", marginTop: ".9rem" },
  card: { border: "1px solid var(--sepia-mid)", background: "var(--paper)", borderRadius: 20, padding: "1.1rem", boxShadow: "0 10px 30px rgba(59,45,33,.05)" },
  cardHead: { display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }, h2: { margin: ".2rem 0", fontSize: "1.25rem" }, bigIcon: { fontSize: 30 },
  date: { fontWeight: 850, fontSize: "1.1rem", marginBottom: ".2rem" }, muted: { color: "var(--ink-soft)", lineHeight: 1.5 }, good: { color: "#496532", background: "rgba(106,138,74,.08)", borderRadius: 14, padding: ".8rem", lineHeight: 1.5 },
  stack: { display: "grid", gap: ".65rem" }, notice: { display: "grid", gap: ".35rem", padding: ".8rem", background: "#fff8e8", border: "1px solid #e6c98f", borderRadius: 14, lineHeight: 1.45 },
  secondaryLink: { width: "fit-content", textDecoration: "none", color: "var(--rust)", border: "1px solid var(--sepia-mid)", borderRadius: 999, padding: ".5rem .7rem", fontWeight: 800, marginTop: ".35rem" },
  quick: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: ".7rem", marginTop: ".9rem" },
  quickCard: { textDecoration: "none", color: "var(--ink)", border: "1px solid var(--sepia-mid)", background: "var(--paper)", borderRadius: 18, padding: ".9rem", display: "grid", gap: 4, boxShadow: "0 8px 22px rgba(59,45,33,.04)" },
};
