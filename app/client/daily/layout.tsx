"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DailyFriendlyBanner from "@/components/daily/DailyFriendlyBanner";

export default function DailyClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/client/daily";
  const isStandaloneFlow =
    pathname === "/client/daily/onboarding" ||
    pathname === "/client/daily/invitation";
  const showDashboardBack = !isDashboard && !isStandaloneFlow;
  const showFriendlyBanner = !isStandaloneFlow;
  const showQuickActions = !isStandaloneFlow;
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
    <>
      {showFriendlyBanner ? <DailyFriendlyBanner /> : null}
      {showQuickActions && (showDashboardBack || contextualLinks.length > 0) ? (
        <div style={quickBarStyle} aria-label="Navigation Selen Daily">
          {showDashboardBack ? (
            <Link href="/client/daily" style={backLinkStyle}>
              ← Retour au tableau de bord
            </Link>
          ) : null}
          {contextualLinks.map((link) => (
            <Link key={link.href} href={link.href} style={backLinkStyle}>
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
      {children}
      {showClaimLink ? (
        <div style={claimFooterStyle} aria-label="Réclamations Selen Daily">
          <Link href="/client/daily/reclamations" style={claimLinkStyle}>
            Réclamations
          </Link>
        </div>
      ) : null}
    </>
  );
}

const quickBarStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "1rem 1rem 0",
  display: "flex",
  justifyContent: "flex-start",
  gap: ".65rem",
  flexWrap: "wrap",
};

const backLinkStyle: React.CSSProperties = {
  color: "var(--rust)",
  textDecoration: "none",
  border: "1px solid var(--sepia-mid)",
  background: "rgba(255,250,239,.82)",
  padding: ".65rem .9rem",
  fontWeight: 800,
  borderRadius: 3,
  boxShadow: "0 4px 14px rgba(59,45,33,.05)",
};

const claimFooterStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "1.5rem auto 0",
  padding: "0 1rem 1.5rem",
  display: "flex",
  justifyContent: "flex-start",
};

const claimLinkStyle: React.CSSProperties = {
  ...backLinkStyle,
  border: "1px solid var(--rust)",
  background: "rgba(138,75,36,.08)",
};
