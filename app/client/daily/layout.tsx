"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DailyFriendlyBanner from "@/components/daily/DailyFriendlyBanner";

export default function DailyClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/client/daily";
  const isStandaloneFlow = pathname === "/client/daily/onboarding" || pathname === "/client/daily/invitation";
  const showDashboardBack = !isDashboard && !isStandaloneFlow;
  const showFriendlyBanner = !isStandaloneFlow;
  const showClaimLink = !isStandaloneFlow && pathname !== "/client/daily/reclamations";
  const contextualLinks = pathname === "/client/daily/qualite"
    ? [
        { href: "/client/daily/qualiopi", label: "Cycle Qualiopi" },
        { href: "/client/daily/procedures", label: "Procédures internes" },
        { href: "/client/daily/indicateurs", label: "Indicateurs formation" },
      ]
    : pathname === "/client/daily/qualiopi" || pathname === "/client/daily/procedures" || pathname === "/client/daily/indicateurs"
      ? [{ href: "/client/daily/qualite", label: "Suivi Qualité" }]
      : [];

  return (
    <div className="gazette-paper min-h-screen text-[#3e2a1f]">
      {!isStandaloneFlow ? (
        <header className="border-b-2 border-[#b28a62]/40 bg-gradient-to-b from-[#ebe0ca] to-[#efe3cf]">
          <div className="gazette-masthead-rule mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
            <Link href="/client/daily" className="font-['Playfair_Display'] text-2xl font-bold tracking-tight text-[#3e2a1f] no-underline md:text-3xl">
              Selen <em className="not-italic text-[#8a4b24]">Daily</em>
            </Link>
            <span className="hidden font-['Cinzel'] text-[0.55rem] uppercase tracking-[0.35em] text-[#8a6243] sm:block">
              Votre espace de gestion formation
            </span>
          </div>
        </header>
      ) : null}

      {showFriendlyBanner ? <DailyFriendlyBanner /> : null}

      {!isStandaloneFlow && (showDashboardBack || contextualLinks.length > 0) ? (
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 pt-4 md:px-6" aria-label="Navigation Selen Daily">
          {showDashboardBack ? (
            <Link href="/client/daily" className="font-['Cinzel'] text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#8a4b24] no-underline border border-[#b28a62]/40 bg-[#fffaf0]/70 px-4 py-2 hover:bg-[#efe3cf]">
              ← Tableau de bord
            </Link>
          ) : null}
          {contextualLinks.map((link) => (
            <Link key={link.href} href={link.href} className="font-['Cinzel'] text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#8a4b24] no-underline border border-[#b28a62]/40 bg-[#fffaf0]/70 px-4 py-2 hover:bg-[#efe3cf]">
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className={!isStandaloneFlow ? "daily-client-gazette" : undefined}>{children}</div>

      {showClaimLink ? (
        <footer className="mx-auto mt-8 max-w-6xl border-t border-[#b28a62]/35 px-4 py-6 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <span className="font-['Cinzel'] text-[0.55rem] uppercase tracking-[0.25em] text-[#8a6243]">Selen Daily · votre administratif, plus clair</span>
            <Link href="/client/daily/reclamations" className="font-['Cinzel'] text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[#8a4b24] underline decoration-[#b28a62]/50 underline-offset-4">
              Réclamations
            </Link>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
