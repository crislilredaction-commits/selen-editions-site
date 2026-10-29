"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import LoadingMascot from "@/components/ui/LoadingMascot";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

type Formation = { id: string; title: string; status: string; spontaneous_registration_task_status?: string | null };
type Session = { id: string; formation_id: string; start_date?: string | null; status: string; modality?: string | null; distance_mode?: string | null; daily_formations?: { title?: string | null } | null };
type Workspace = { organisation?: Record<string, unknown> | null; trainers?: Array<Record<string, unknown>> };
type ActionItem = { id: string; priority: "high" | "medium" | "normal"; title: string; detail: string; href: string; sessionLabel?: string | null };
type Onboarding = {
  organisation_name?: string | null;
  manager_first_name?: string | null;
  manager_last_name?: string | null;
  qualiopi_status?: string | null;
  quality_tracking_enabled?: boolean | null;
  first_nda_year?: boolean | null;
  insee_document_url?: string | null;
  qualiopi_certificate_url?: string | null;
  nda_or_bpf_document_url?: string | null;
  welcome_booklet_url?: string | null;
};

const rank: Record<ActionItem["priority"], number> = { high: 0, medium: 1, normal: 2 };

function fmtDate(value?: string | null) {
  if (!value) return "Date à définir";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function fmtModality(session: Session) {
  if (session.modality === "distanciel" && session.distance_mode === "asynchrone") return "Distanciel à votre rythme";
  if (session.modality === "distanciel") return "Distanciel en direct";
  if (session.modality === "presentiel") return "Présentiel";
  if (session.modality === "mixte") return "Mixte";
  return "Modalité à préciser";
}

function missingDocumentActions(onboarding: Onboarding | null): ActionItem[] {
  if (!onboarding) return [];
  const items: ActionItem[] = [];
  const add = (id: string, title: string) => items.push({
    id: `missing-doc:${id}`,
    priority: "medium",
    title,
    detail: "Ce document manque encore dans les paramètres initiaux de votre organisme.",
    href: "/client/daily/onboarding?step=2",
    sessionLabel: "Paramètres initiaux",
  });
  if (!onboarding.insee_document_url) add("insee", "Avis INSEE à fournir");
  if (onboarding.qualiopi_status === "yes" && !onboarding.qualiopi_certificate_url) add("qualiopi", "Certificat Qualiopi à fournir");
  if (!onboarding.first_nda_year && !onboarding.nda_or_bpf_document_url) add("bpf", "Dernier BPF à fournir");
  if (!onboarding.welcome_booklet_url) add("welcome", "Livret d'accueil à fournir");
  return items;
}

export default function DailyDashboardOverview() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const responses = await Promise.all([
          assistanceFetch("/api/client/daily/formations", { cache: "no-store" }),
          assistanceFetch("/api/client/daily/sessions", { cache: "no-store" }),
          assistanceFetch("/api/client/daily/workspace", { cache: "no-store" }),
          assistanceFetch("/api/client/daily/action-center", { cache: "no-store" }),
          assistanceFetch("/api/client/daily/onboarding", { cache: "no-store" }),
        ]);
        const [formationRes, sessionRes, workspaceRes, actionRes, onboardingRes] = responses;
        const [formationData, sessionData, workspaceData, actionData, onboardingData] = await Promise.all(
          responses.map((response) => response.json().catch(() => ({}))),
        );
        if (!formationRes.ok || !sessionRes.ok) throw new Error("Impossible de charger l'activité Daily.");
        if (cancelled) return;
        setFormations((formationData.formations ?? []).filter((formation: Formation) => formation.status !== "archived"));
        setSessions((sessionData.sessions ?? []).filter((session: Session) => session.status !== "archived"));
        if (workspaceRes.ok) setWorkspace(workspaceData.workspace ?? null);
        if (actionRes.ok) setActions(actionData.actions ?? []);
        if (onboardingRes.ok) setOnboarding(onboardingData.onboarding ?? null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Chargement impossible.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const futureSessions = useMemo(() => sessions
    .filter((session) => !session.start_date || session.start_date >= today)
    .sort((a, b) => String(a.start_date ?? "9999").localeCompare(String(b.start_date ?? "9999"))), [sessions, today]);
  const requestsToPlan = useMemo(() => formations.filter((formation) =>
    formation.spontaneous_registration_task_status === "to_attach"
    && !futureSessions.some((session) => session.formation_id === formation.id),
  ), [formations, futureSessions]);
  const sortedActions = useMemo(() => {
    const merged = [...actions];
    const existingTitles = new Set(merged.map((item) => item.title));
    for (const item of missingDocumentActions(onboarding)) if (!existingTitles.has(item.title)) merged.push(item);
    return merged.sort((a, b) => rank[a.priority] - rank[b.priority]);
  }, [actions, onboarding]);
  const next = futureSessions[0] ?? null;
  const organisationName = String(workspace?.organisation?.name ?? onboarding?.organisation_name ?? "Mon organisme");
  const managerName = [onboarding?.manager_first_name, onboarding?.manager_last_name].filter(Boolean).join(" ") || "Mon profil";
  const isQualiopi = onboarding?.qualiopi_status === "yes";
  const qualityEnabled = isQualiopi || onboarding?.quality_tracking_enabled !== false;
  const trainerCount = workspace?.trainers?.length ?? 0;

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.assign("/client/login");
  }

  if (loading) return <LoadingMascot message="Sélion rassemble votre activité…" />;

  return (
    <main className="dash-shell">
      <style>{css}</style>
      <div className="dash-frame">
        <header className="dash-topline">
          <div>
            <div className="dash-kicker">Selen Daily</div>
            <h1>Votre activité, en un coup d'œil</h1>
            <p>{sortedActions.length ? "Selen vous montre les actions qui demandent réellement votre intervention." : "Tout est à jour. Vous pouvez vous concentrer sur vos prochaines formations."}</p>
          </div>
          <div className="top-actions">
            <Link href="/client" className="service-link">Mes autres services Selen</Link>
            <button type="button" className="logout-button" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Déconnexion…" : "Se déconnecter"}</button>
          </div>
        </header>

        {error ? <div className="dash-error">{error}</div> : null}

        <div className="dash-layout">
          <div className="dash-main">
            <Link href="/client/daily/mon-compte" className="profile-card card">
              <div className="avatar">{managerName.slice(0, 1).toUpperCase()}</div>
              <div className="profile-copy">
                <span className="eyebrow">Mon profil & mon organisme</span>
                <h2>{managerName}</h2>
                <p>{organisationName}</p>
                <small>Informations administratives, documents et abonnement</small>
              </div>
              <span className="arrow">→</span>
            </Link>

            <section className="task-card card">
              <div className="section-head">
                <div><span className="eyebrow">À faire</span><h2>{sortedActions.length ? `${sortedActions.length} tâche${sortedActions.length > 1 ? "s" : ""} à traiter` : "Tout est à jour"}</h2></div>
                {sortedActions.length ? <span className="count">{sortedActions.length}</span> : null}
              </div>
              {sortedActions.length === 0 ? <div className="empty">✓ Aucune action n'attend votre intervention.</div> : (
                <div className="task-list">{sortedActions.map((item) => (
                  <Link href={item.href} key={item.id} className={`task ${item.priority}`}>
                    <span className="box" /><span className="task-copy"><strong>{item.title}</strong><small>{item.sessionLabel ? `${item.sessionLabel} · ` : ""}{item.detail}</small></span><span>→</span>
                  </Link>
                ))}</div>
              )}
            </section>

            <div className="main-grid">
              <article className="card info-card"><span className="eyebrow">Prochaine session</span><h2>{next?.daily_formations?.title ?? "Aucune session planifiée"}</h2>{next ? <><p className="bigline">{fmtDate(next.start_date)}</p><p>{fmtModality(next)}</p><Link href={`/client/daily/sessions?session=${next.id}`} className="text-link">Ouvrir la session →</Link></> : <p>Votre planning est libre pour le moment.</p>}</article>
              <article className="card info-card"><span className="eyebrow">À surveiller</span><h2>Demandes sans date</h2>{requestsToPlan.length === 0 ? <div className="good">Aucune demande n'attend de date.</div> : requestsToPlan.slice(0, 3).map((formation) => <Link key={formation.id} href={`/client/daily/sessions?formation=${formation.id}`} className="watch-item"><strong>{formation.title}</strong><span>Planifier une session →</span></Link>)}</article>
            </div>
          </div>

          <aside className="dash-sidebar" aria-label="Navigation Daily">
            <SidebarCard href="/client/daily/formations" icon="📚" title="Formations" detail={`${formations.length} active${formations.length > 1 ? "s" : ""}`} />
            <SidebarCard href="/client/daily/sessions" icon="📅" title="Sessions" detail={`${futureSessions.length} à venir`} />
            <SidebarCard href="/client/daily/apprenants" icon="👥" title="Apprenants" detail="Dossiers et suivi" />
            <SidebarCard href="/client/daily/documents" icon="📁" title="Documents" detail="Pièces et conformité" />
            <SidebarCard href="/client/daily/formateurs" icon="🎓" title="Formateurs" detail={`${trainerCount} référencé${trainerCount > 1 ? "s" : ""}`} />
            <SidebarCard href="/client/daily/qualite" icon="✓" title="Suivi Qualité" detail={isQualiopi ? "Obligatoire · Qualiopi" : qualityEnabled ? "Actif · optionnel" : "Désactivé"} badge={isQualiopi ? "Obligatoire" : undefined} muted={!qualityEnabled} />
          </aside>
        </div>
      </div>
    </main>
  );
}

function SidebarCard({ href, icon, title, detail, badge, muted = false }: { href: string; icon: string; title: string; detail: string; badge?: string; muted?: boolean }) {
  return <Link href={href} className={`side-card card${muted ? " muted" : ""}`}><span className="side-icon">{icon}</span><span className="side-copy"><strong>{title}</strong><small>{detail}</small></span>{badge ? <span className="badge">{badge}</span> : <span className="arrow">→</span>}</Link>;
}

const css = `
.dash-shell{min-height:100vh;padding:34px 18px 70px;color:#392a19;background:linear-gradient(180deg,#eadfbf 0%,#e0cf9f 100%);font-family:Georgia,'Times New Roman',serif}.dash-frame{max-width:1180px;margin:auto;border:1px solid rgba(160,106,44,.42);padding:30px;position:relative}.dash-frame:before{content:'';position:absolute;inset:7px;border:1px solid rgba(160,106,44,.25);pointer-events:none}.dash-topline{position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:24px}.dash-kicker,.eyebrow{font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:800;color:#9b682d}.dash-topline h1{font-size:clamp(2rem,4vw,3rem);margin:8px 0 10px}.dash-topline p{margin:0;color:#756149;max-width:690px;line-height:1.6}.top-actions{display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.service-link{color:#5c3a1e;font-weight:700;text-decoration:none;border-bottom:1px solid #a06a2c;padding-bottom:3px;white-space:nowrap}.logout-button{border:1px solid #a06a2c;background:transparent;color:#5c3a1e;padding:8px 11px;font:700 12px Arial,sans-serif;cursor:pointer}.logout-button:disabled{opacity:.55;cursor:default}.dash-layout{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:22px}.dash-main{display:grid;gap:20px}.dash-sidebar{display:grid;gap:12px;align-content:start;position:sticky;top:18px}.card{background:#f8f0dc;border:1px solid #d9c391;box-shadow:0 8px 20px rgba(57,42,25,.09);text-decoration:none;color:inherit}.profile-card{display:grid;grid-template-columns:64px 1fr 24px;gap:16px;align-items:center;padding:22px 24px}.profile-card:hover,.side-card:hover,.task:hover,.watch-item:hover{border-color:#a06a2c}.avatar{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:#7a2e22;color:#f4e6c8;font-size:25px;font-weight:700}.profile-copy h2{margin:5px 0 2px;font-size:22px}.profile-copy p{margin:0;color:#725e46}.profile-copy small{display:block;margin-top:6px;color:#917a5d}.arrow{color:#a06a2c;font-size:20px}.task-card{padding:24px}.section-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.section-head h2,.info-card h2{margin:7px 0 0;font-size:23px}.count{min-width:38px;height:38px;padding:0 10px;border-radius:999px;display:grid;place-items:center;background:#7a2e22;color:#f4e6c8;font-weight:800}.task-list{display:grid;gap:8px;margin-top:18px;max-height:350px;overflow:auto}.task{display:grid;grid-template-columns:20px 1fr 20px;gap:12px;align-items:center;padding:12px 14px;border:1px solid rgba(160,106,44,.22);background:rgba(255,250,240,.65);text-decoration:none;color:inherit}.task.high{border-left:4px solid #9a412f}.task.medium{border-left:4px solid #b5792d}.box{width:17px;height:17px;border:1.5px solid #a06a2c;background:#fffaf0}.task-copy{display:grid;gap:3px}.task-copy small{color:#78644c;line-height:1.35}.empty,.good{margin-top:18px;padding:14px 16px;background:rgba(95,122,82,.09);border:1px solid rgba(95,122,82,.22);color:#455a3b}.main-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.info-card{padding:22px}.info-card p{color:#78644c;line-height:1.5}.bigline{font-size:17px;font-style:italic}.text-link{font-weight:800;color:#7a2e22;text-decoration:none}.watch-item{display:grid;gap:4px;margin-top:10px;padding:11px 12px;border:1px solid rgba(160,106,44,.22);text-decoration:none;color:inherit}.watch-item span{font-size:12px;color:#7a2e22}.side-card{min-height:70px;padding:15px;display:grid;grid-template-columns:42px 1fr auto;gap:12px;align-items:center}.side-card.muted{opacity:.55}.side-icon{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#7a2e22;color:#f4e6c8;font-family:Arial,sans-serif;font-weight:800}.side-copy{display:grid;gap:3px}.side-copy strong{font-size:16px}.side-copy small{color:#806c52;font-family:Arial,sans-serif;font-size:11px}.badge{font-family:Arial,sans-serif;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;padding:5px 6px;background:#7a2e22;color:#f4e6c8}.dash-error{position:relative;z-index:1;margin-bottom:18px;padding:12px;border:1px solid #a64b3b;background:#fff2ee;color:#7d2e22}
@media(max-width:900px){.dash-layout{grid-template-columns:1fr}.dash-sidebar{position:static;grid-template-columns:repeat(2,minmax(0,1fr));grid-row:1}.dash-main{grid-row:2}.dash-topline{flex-direction:column}.top-actions{justify-content:flex-start}.main-grid{grid-template-columns:1fr}}
@media(max-width:560px){.dash-shell{padding:18px 8px 45px}.dash-frame{padding:20px 14px}.dash-sidebar{grid-template-columns:1fr}.profile-card{grid-template-columns:50px 1fr 18px;padding:18px}.avatar{width:46px;height:46px}.task-card{padding:18px}}
`;