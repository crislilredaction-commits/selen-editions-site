"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import DailyFriendlyBanner from "@/components/daily/DailyFriendlyBanner";

export default function DailyClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/client/daily";
  const isStandaloneFlow = pathname === "/client/daily/onboarding" || pathname === "/client/daily/invitation";
  const showDashboardBack = !isDashboard && !isStandaloneFlow;
  const showFriendlyBanner = !isStandaloneFlow;
  const showClaimLink = !isStandaloneFlow && pathname !== "/client/daily/reclamations";
  const isQualitySection = ["/client/daily/qualite", "/client/daily/qualiopi", "/client/daily/procedures", "/client/daily/indicateurs"].includes(pathname);
  const isDocumentSection = ["/client/daily/generateur-documents", "/client/daily/modeles-documents", "/client/daily/documents-apprenants"].includes(pathname);
  const isOrganisationSection = ["/client/daily/organisation", "/client/daily/formateurs", "/client/daily/apprenants", "/client/daily/mon-compte"].includes(pathname);
  const contextualLinks = isQualitySection
    ? [
        { href: "/client/daily/qualite", label: "Suivi qualité" },
        { href: "/client/daily/qualiopi", label: "Cycle Qualiopi" },
        { href: "/client/daily/procedures", label: "Procédures internes" },
        { href: "/client/daily/indicateurs", label: "Indicateurs formation" },
      ]
    : isDocumentSection
      ? [
          { href: "/client/daily/generateur-documents", label: "Générer un dossier" },
          { href: "/client/daily/modeles-documents", label: "Modèles de documents" },
          { href: "/client/daily/documents-apprenants", label: "Ressources apprenants" },
        ]
      : isOrganisationSection
        ? [
            { href: "/client/daily/organisation", label: "Mon organisme" },
            { href: "/client/daily/formateurs", label: "Formateurs" },
            { href: "/client/daily/apprenants", label: "Apprenants" },
            { href: "/client/daily/mon-compte", label: "Mon compte" },
          ]
        : [];

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  const routeClasses = [
    pathname === "/client/daily/sessions" ? "daily-route-sessions" : "",
    pathname === "/client/daily/organisation" ? "daily-route-organisation" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="gazette-paper min-h-screen text-[#3e2a1f]">
      <style jsx global>{dailyGazetteCss}</style>
      {!isStandaloneFlow ? (
        <header className="daily-gazette-header border-b-2 border-[#b28a62]/40 bg-gradient-to-b from-[#ebe0ca] to-[#efe3cf]">
          <div className="gazette-masthead-rule mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
            <Link href="/client/daily" className="font-['Playfair_Display'] text-2xl font-bold tracking-tight text-[#3e2a1f] no-underline md:text-3xl">
              Selen <em className="not-italic text-[#8a4b24]">Daily</em>
            </Link>
            <div className="daily-header-tools">
              <span className="hidden font-['Cinzel'] text-[0.55rem] uppercase tracking-[0.35em] text-[#8a6243] sm:block">Votre espace de gestion formation</span>
              <Link href="/client/daily/organisation" className="daily-header-organisation-link">Mon organisme</Link>
            </div>
          </div>
        </header>
      ) : null}

      {showFriendlyBanner ? <DailyFriendlyBanner /> : null}

      {!isStandaloneFlow && (showDashboardBack || contextualLinks.length > 0) ? (
        <div className={`daily-context-bar ${isQualitySection ? "quality" : ""}`} aria-label="Navigation Selen Daily">
          {showDashboardBack ? <Link href="/client/daily" className="daily-gazette-navlink">← Tableau de bord</Link> : null}
          {isDocumentSection ? <span className="daily-document-title">Gestion documentaire</span> : null}
          {isOrganisationSection ? <span className="daily-document-title">Espace organisme</span> : null}
          {contextualLinks.map((link) => (
            <Link key={link.href} href={link.href} className={`daily-gazette-navlink ${pathname === link.href ? "active" : ""}`}>{link.label}</Link>
          ))}
        </div>
      ) : null}

      <div className={!isStandaloneFlow ? `daily-client-gazette${routeClasses ? ` ${routeClasses}` : ""}` : undefined}>{children}</div>

      {showClaimLink ? (
        <footer aria-label="Réclamations Selen Daily" style={claimFooterStyle} className="border-t border-[#b28a62]/35">
          <div className="flex items-center justify-between gap-4">
            <span className="font-['Cinzel'] text-[0.55rem] uppercase tracking-[0.25em] text-[#8a6243]">Selen Daily · votre administratif, plus clair</span>
            <Link href="/client/daily/reclamations" className="font-['Cinzel'] text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[#8a4b24] underline decoration-[#b28a62]/50 underline-offset-4">Réclamations</Link>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

const claimFooterStyle: React.CSSProperties = { maxWidth: 1152, margin: "2rem auto 0", padding: "1.5rem 1rem" };

const dailyGazetteCss = `
.daily-client-gazette{color:#3e2a1f;font-family:"EB Garamond",Georgia,serif}
.daily-client-gazette>main{width:min(100%,1180px)!important;margin-inline:auto!important;box-sizing:border-box}
.daily-client-gazette>main,.daily-client-gazette main{background:transparent!important;color:#3e2a1f!important}
.daily-client-gazette h1,.daily-client-gazette h2,.daily-client-gazette h3,.daily-client-gazette h4{color:#3e2a1f!important;font-family:"Playfair Display",Georgia,serif!important;letter-spacing:-.01em}
.daily-client-gazette p,.daily-client-gazette label,.daily-client-gazette li,.daily-client-gazette td,.daily-client-gazette th,.daily-client-gazette small,.daily-client-gazette span{font-family:"EB Garamond",Georgia,serif}
.daily-client-gazette section,.daily-client-gazette article,.daily-client-gazette aside{border-color:rgba(178,138,98,.42)!important}
.daily-client-gazette input,.daily-client-gazette select,.daily-client-gazette textarea{border:1px solid #c8a87a!important;border-radius:0!important;background:rgba(255,250,239,.84)!important;color:#3e2a1f!important;font-family:"EB Garamond",Georgia,serif!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.7)!important}
.daily-client-gazette input:focus,.daily-client-gazette select:focus,.daily-client-gazette textarea:focus{outline:2px solid rgba(138,75,36,.18)!important;border-color:#8a4b24!important}
.daily-client-gazette button,.daily-client-gazette a[role="button"]{border-radius:0!important;font-family:"Cinzel",serif!important;letter-spacing:.05em}
.daily-client-gazette table{border-color:#c8a87a!important;background:rgba(248,239,223,.62)!important}
.daily-client-gazette thead,.daily-client-gazette th{background:rgba(224,208,184,.72)!important;color:#3e2a1f!important;font-family:"Cinzel",serif!important;text-transform:uppercase;letter-spacing:.05em}
.daily-client-gazette [class*="card"],.daily-client-gazette [class*="panel"],.daily-client-gazette [class*="surface"],.daily-client-gazette [class*="box"]{border-color:rgba(178,138,98,.42)!important}
.daily-route-sessions article button{padding:.42rem .58rem!important;font-size:.76rem!important;line-height:1.2!important}
.daily-header-tools{display:flex;align-items:center;gap:14px}
.daily-header-organisation-link{border:1px solid rgba(178,138,98,.55);background:rgba(255,250,239,.72);color:#8a4b24;padding:.5rem .72rem;text-decoration:none;font-family:"Cinzel",serif;font-size:.6rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.daily-header-organisation-link:hover{background:#8a4b24;color:#fff8e8;border-color:#8a4b24}
.daily-context-bar{max-width:1180px;margin:14px auto 0;padding:0 16px;display:flex;flex-wrap:wrap;gap:8px;box-sizing:border-box;align-items:center}
.daily-context-bar.quality{justify-content:flex-end}
.daily-document-title{margin-right:auto;font-family:"Cinzel",serif!important;font-size:.68rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#6f4a2b}
.daily-gazette-navlink{border:1px solid rgba(178,138,98,.55);background:rgba(255,250,239,.72);color:#8a4b24;padding:.55rem .85rem;text-decoration:none;font-family:"Cinzel",serif;font-size:.64rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.daily-gazette-navlink:hover,.daily-gazette-navlink.active{background:#8a4b24;color:#fff8e8;border-color:#8a4b24}
@media(max-width:640px){
.daily-gazette-header .gazette-masthead-rule::before,.daily-gazette-header .gazette-masthead-rule::after{display:none}
.daily-client-gazette{font-size:16px}
.daily-header-tools{gap:8px}
.daily-header-organisation-link{padding:.48rem .58rem;font-size:.56rem;letter-spacing:.07em}
.daily-context-bar.quality{justify-content:flex-start}
.daily-context-bar{overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px;scrollbar-width:thin}
.daily-document-title{white-space:nowrap;margin-right:4px}
.daily-gazette-navlink{white-space:nowrap}
.daily-route-organisation>main{padding-left:14px!important;padding-right:14px!important;overflow:hidden}
.daily-route-organisation main form,.daily-route-organisation main fieldset,.daily-route-organisation main section,.daily-route-organisation main div{min-width:0}
.daily-route-organisation main input,.daily-route-organisation main select,.daily-route-organisation main textarea,.daily-route-organisation main button{max-width:100%;box-sizing:border-box}
.daily-route-organisation main button{white-space:normal}
}
`;
