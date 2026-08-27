"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import LoadingMascot from "@/components/ui/LoadingMascot";

type Formation = {
  id: string;
  title: string;
  status: string;
  modality?: string | null;
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

type Workspace = {
  organisation?: { name?: string | null } | null;
};

function formatDate(value?: string | null) {
  if (!value) return "Date à définir";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function formatModality(session: Session) {
  if (session.modality === "distanciel" && session.distance_mode === "asynchrone") return "Distanciel à votre rythme";
  if (session.modality === "distanciel") return "Distanciel en direct";
  if (session.modality === "presentiel") return "Présentiel";
  if (session.modality === "mixte") return "Mixte";
  return "Modalité à préciser";
}

function FeatherIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M20 4c-6 0-11 3-13 9-1 3-1 5 0 7 2-1 4-3 5-6M9 16 20 4" /></svg>;
}
function BookIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5z" /></svg>;
}
function CalendarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="5.5" width="16" height="14.5" rx="1.5" /><path d="M4 10h16M8 3.5v3M16 3.5v3" /></svg>;
}
function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.3l2.2 2.2 4.8-5" /></svg>;
}
function PhoneIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 4.5c0 4 2 12 13.5 15 1 .3 1.5-1 .8-1.8l-3-3.4c-.5-.6-1.3-.7-1.9-.2l-1.3 1.1c-2-1.2-4-3.2-5.2-5.2l1.1-1.3c.5-.6.4-1.4-.2-1.9L6.5 3.7c-.8-.7-2.1-.2-1.8.8z" /></svg>;
}
function UserIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" /></svg>;
}
function FolderIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 7.5c0-1 .8-1.5 1.7-1.5h4l1.8 2h6.8c1 0 1.7.7 1.7 1.5v9c0 1-.8 1.7-1.7 1.7H5.7C4.8 20.2 4 19.5 4 18.5z" /></svg>;
}
function Fleuron() {
  return <div className="daily-fleuron"><span /><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M12 3v18M12 3c-3 2-5 4-5 7s2 4 5 4M12 3c3 2 5 4 5 7s-2 4-5 4M7 21c2-1.5 3-3 5-3s3 1.5 5 3" /></svg><span /></div>;
}

export default function DailyDashboardOverview() {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [formationRes, sessionRes, workspaceRes] = await Promise.all([
          assistanceFetch("/api/client/daily/formations", { cache: "no-store" }),
          assistanceFetch("/api/client/daily/sessions", { cache: "no-store" }),
          assistanceFetch("/api/client/daily/workspace", { cache: "no-store" }),
        ]);
        const formationData = await formationRes.json().catch(() => ({}));
        const sessionData = await sessionRes.json().catch(() => ({}));
        const workspaceData = await workspaceRes.json().catch(() => ({}));
        if (!formationRes.ok || !sessionRes.ok) throw new Error("Impossible de charger l'activité Daily.");
        if (!cancelled) {
          setFormations((formationData.formations ?? []).filter((formation: Formation) => formation.status !== "archived"));
          setSessions((sessionData.sessions ?? []).filter((session: Session) => session.status !== "archived"));
          if (workspaceRes.ok) setWorkspace(workspaceData.workspace ?? null);
        }
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Chargement impossible.");
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
  const organisationName = workspace?.organisation?.name?.trim() || null;

  if (loading) {
    return <LoadingMascot message="Sélion rassemble votre activité…" />;
  }

  return (
    <main className="daily-dashboard-shell">
      <style>{dashboardCss}</style>
      <div className="daily-frame">
        <span className="daily-corner tl" /><span className="daily-corner tr" /><span className="daily-corner bl" /><span className="daily-corner br" />
        <div className="daily-wrap">
          <section className="daily-hero">
            <div className="daily-hero-copy">
              <div className="daily-eyebrow"><span className="daily-feather"><FeatherIcon /></span>Selen Daily</div>
              <h1>Votre activité, en un coup d&apos;œil</h1>
              <div className="daily-hero-rule" />
              <p>{requestsToPlan.length > 0 ? "Une demande mérite votre attention. Rien ne presse dans le vide : Selen vous montre exactement où agir." : <>Tout avance{organisationName ? ` chez ${organisationName}` : ""}. Gardez le cap, Selen vous montre seulement ce qui mérite vraiment votre attention.</>}</p>
            </div>
            <div className="daily-hero-actions">
              <Link href="/client/daily/a-faire" className="daily-primary">Voir ce qui est à faire</Link>
              <Link href="/client" className="daily-service-link">Mes autres services Selen</Link>
            </div>
          </section>

          {loadError ? <div className="daily-error">{loadError}</div> : null}

          <section className="daily-grid-stats">
            <Stat icon={<BookIcon />} number={formations.length} label={`formation${formations.length > 1 ? "s" : ""}`} />
            <Stat icon={<CalendarIcon />} number={futureSessions.length} label={`session${futureSessions.length > 1 ? "s" : ""} à venir`} />
            <Stat icon={<CheckIcon />} number={readySessions} label={`session${readySessions > 1 ? "s" : ""} prête${readySessions > 1 ? "s" : ""}`} />
            <Stat icon={<PhoneIcon />} number={requestsToPlan.length} label={`date${requestsToPlan.length > 1 ? "s" : ""} à caler`} alert={requestsToPlan.length > 0} />
          </section>

          <Fleuron />

          <section className="daily-grid-mid">
            <article className="daily-card daily-mid-card">
              <div className="daily-mid-eyebrow"><CalendarIcon />Prochaine étape</div>
              <h2>{next ? next.daily_formations?.title ?? "Session à venir" : "Aucune session planifiée"}</h2>
              {next ? <><p className="daily-mid-date">{formatDate(next.start_date)}</p><p className="daily-mid-format">{formatModality(next)}</p><Link href={`/client/daily/sessions?session=${next.id}`} className="daily-ghost">Ouvrir la session</Link></> : <><p className="daily-mid-date">Votre planning est libre pour le moment.</p><p className="daily-mid-format">Une session apparaîtra ici dès qu&apos;elle sera créée.</p><Link href="/client/daily/formations" className="daily-ghost">Voir les formations</Link></>}
            </article>

            <article className="daily-card daily-mid-card">
              <div className="daily-mid-eyebrow"><PhoneIcon />À surveiller</div>
              <h2>Demandes sans date</h2>
              {requestsToPlan.length === 0 ? <div className="daily-watch good">Rien d&apos;urgent ici. Vos demandes disposent d&apos;une session planifiée ou aucune nouvelle demande n&apos;attend de date.</div> : <div className="daily-request-list">{requestsToPlan.slice(0, 3).map((formation) => <div key={formation.id} className="daily-watch alert"><strong>{formation.title}</strong><span>Une inscription a été reçue sans session disponible. Une date doit être calée avec le formateur.</span><Link href={`/client/daily/sessions?formation=${formation.id}`} className="daily-inline-link">Planifier la session</Link></div>)}</div>}
            </article>
          </section>

          <Fleuron />

          <section className="daily-grid-nav">
            <NavCard href="/client/daily/formations" icon={<BookIcon />} title="Formations" subtitle="Programmes et lien d'inscription" />
            <NavCard href="/client/daily/sessions" icon={<CalendarIcon />} title="Sessions" subtitle="Dates, formateurs et organisation" />
            <NavCard href="/client/daily/apprenants" icon={<UserIcon />} title="Apprenants" subtitle="Dossiers et suivi" />
            <NavCard href="/client/daily/documents" icon={<FolderIcon />} title="Documents" subtitle="Préformation et conformité" />
          </section>

          <div className="daily-footer-mark"><span><FeatherIcon /></span>Selen Studio</div>
        </div>
      </div>
    </main>
  );
}

function Stat({ icon, number, label, alert = false }: { icon: React.ReactNode; number: number; label: string; alert?: boolean }) {
  return <article className={`daily-card daily-stat${alert ? " alert" : ""}`}><div className="daily-seal">{icon}</div><div className="daily-stat-num">{number}</div><div className="daily-stat-label">{label}</div></article>;
}

function NavCard({ href, icon, title, subtitle }: { href: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return <Link href={href} className="daily-card daily-nav-card"><div className="daily-nav-icon">{icon}</div><h3>{title}</h3><p>{subtitle}</p></Link>;
}

const dashboardCss = `
.daily-dashboard-shell{min-height:100vh;padding:44px 18px 80px;color:#392a19;background:radial-gradient(ellipse at 50% -10%,rgba(255,247,225,.5),transparent 55%),radial-gradient(circle at 8% 15%,rgba(255,255,255,.28),transparent 35%),radial-gradient(circle at 92% 88%,rgba(57,42,25,.10),transparent 45%),linear-gradient(180deg,#eadfbf 0%,#e0cf9f 100%);font-family:Georgia,'Times New Roman',serif}
.daily-frame{max-width:1120px;margin:0 auto;position:relative;padding:26px 30px 34px;border:1px solid rgba(160,106,44,.4);border-radius:4px}.daily-frame:before{content:'';position:absolute;inset:7px;border:1px solid rgba(160,106,44,.4);border-radius:2px;pointer-events:none}.daily-wrap{max-width:1040px;margin:0 auto;position:relative;z-index:1}.daily-corner{position:absolute;width:26px;height:26px;border-color:#a06a2c;opacity:.65}.daily-corner.tl{top:-2px;left:-2px;border-top:1px solid;border-left:1px solid}.daily-corner.tr{top:-2px;right:-2px;border-top:1px solid;border-right:1px solid}.daily-corner.bl{bottom:-2px;left:-2px;border-bottom:1px solid;border-left:1px solid}.daily-corner.br{bottom:-2px;right:-2px;border-bottom:1px solid;border-right:1px solid}
.daily-hero{position:relative;background:#f8f0dc;border:1px solid #d9c391;border-radius:2px;padding:42px 46px 46px;box-shadow:0 1px 2px rgba(57,42,25,.08),0 10px 24px rgba(57,42,25,.10);display:flex;justify-content:space-between;align-items:flex-start;gap:34px;flex-wrap:wrap;overflow:hidden}.daily-hero:before,.daily-card:before{content:'';position:absolute;inset:8px;border:1px solid rgba(160,106,44,.17);pointer-events:none}.daily-hero-copy{max-width:650px;position:relative;z-index:1}.daily-eyebrow,.daily-mid-eyebrow{display:flex;align-items:center;gap:9px;font-size:12px;letter-spacing:.17em;text-transform:uppercase;color:#a06a2c;font-weight:700}.daily-feather,.daily-footer-mark span{width:18px;height:18px;display:inline-flex}.daily-hero h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(2.2rem,5vw,3rem);line-height:1.08;margin:12px 0 16px;font-weight:600}.daily-hero-rule{width:70px;height:2px;background:linear-gradient(90deg,#c08a3e,transparent);margin-bottom:18px}.daily-hero p{font-size:17px;color:#7a6549;line-height:1.65;margin:0}.daily-hero-actions{display:grid;gap:12px;position:relative;z-index:1}.daily-primary{background:linear-gradient(180deg,#6b4423,#5c3a1e);color:#f4e6c8;text-decoration:none;padding:14px 24px;border-radius:3px;font-weight:700;text-align:center;box-shadow:0 4px 10px rgba(57,42,25,.24)}.daily-service-link{color:#5c3a1e;text-align:center;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(160,106,44,.35);padding-bottom:4px}.daily-error{margin-top:18px;padding:12px 14px;background:#fff1ed;border:1px solid #c58c7d;color:#7a2e22}
.daily-grid-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:30px}.daily-card{background:#f8f0dc;border:1px solid #d9c391;border-radius:2px;box-shadow:0 1px 2px rgba(57,42,25,.08),0 10px 24px rgba(57,42,25,.10);position:relative}.daily-stat{padding:26px 22px 24px;display:flex;flex-direction:column;gap:14px}.daily-stat.alert{border-color:#b97b3b}.daily-seal{width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at 32% 28%,#9c4432,#7a2e22 55%,#5a1f17 100%);display:flex;align-items:center;justify-content:center;color:#e9c99a;box-shadow:0 3px 6px rgba(57,42,25,.3),inset 0 1px 1px rgba(255,255,255,.25)}.daily-seal svg{width:20px;height:20px}.daily-stat-num{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:36px;line-height:1}.daily-stat-label{font-size:15px;color:#7a6549;font-style:italic}
.daily-fleuron{display:flex;align-items:center;gap:14px;margin:34px 0 26px;color:#a06a2c}.daily-fleuron span{flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(160,106,44,.4) 40%,rgba(160,106,44,.4) 60%,transparent)}.daily-fleuron svg{width:20px;height:20px}.daily-grid-mid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.daily-mid-card{padding:28px 30px}.daily-mid-eyebrow svg{width:16px;height:16px}.daily-mid-card h2{font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;margin:16px 0 5px}.daily-mid-date{font-size:16px;color:#7a6549;font-style:italic;margin:2px 0 4px}.daily-mid-format{font-size:14.5px;color:#a5906c;margin:0 0 20px}.daily-ghost{display:inline-block;background:transparent;border:1.5px solid rgba(160,106,44,.4);color:#5c3a1e;text-decoration:none;font-size:14.5px;font-weight:700;padding:10px 20px;border-radius:2px}.daily-request-list{display:grid;gap:10px}.daily-watch{border-radius:2px;padding:16px 18px;margin-top:12px;font-size:14.5px;line-height:1.55;display:grid;gap:6px}.daily-watch.good{background:rgba(95,122,82,.1);border:1px solid rgba(95,122,82,.25);color:#455a3b}.daily-watch.alert{background:rgba(160,106,44,.09);border:1px solid rgba(160,106,44,.28)}.daily-inline-link{color:#7a2e22;font-weight:700;text-decoration:none}
.daily-grid-nav{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}.daily-nav-card{padding:26px 22px;text-decoration:none;color:#392a19;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}.daily-nav-card:hover{transform:translateY(-3px) rotate(-.25deg);border-color:rgba(160,106,44,.4);box-shadow:0 10px 20px rgba(57,42,25,.14)}.daily-nav-icon{color:#a06a2c;margin-bottom:15px}.daily-nav-icon svg{width:23px;height:23px}.daily-nav-card h3{font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:600;margin:0 0 4px}.daily-nav-card p{font-size:14px;color:#7a6549;margin:0;font-style:italic}.daily-footer-mark{text-align:center;margin-top:38px;color:#a5906c;font-size:12px;letter-spacing:.14em;text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:10px}
@media(max-width:820px){.daily-frame{padding:20px 18px 28px}.daily-grid-stats,.daily-grid-nav{grid-template-columns:repeat(2,1fr)}.daily-grid-mid{grid-template-columns:1fr}.daily-hero{padding:32px 28px}.daily-hero-actions{width:100%}.daily-primary{width:100%}}
@media(max-width:520px){.daily-dashboard-shell{padding:20px 8px 50px}.daily-frame{border-left:0;border-right:0}.daily-frame:before{display:none}.daily-grid-stats,.daily-grid-nav{grid-template-columns:1fr 1fr;gap:10px}.daily-stat{padding:20px 16px}.daily-seal{width:40px;height:40px}.daily-stat-num{font-size:30px}.daily-nav-card{padding:20px 16px}}
`;
