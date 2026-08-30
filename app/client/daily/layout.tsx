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
  const contextualLinks = pathname === "/client/daily/qualite"
    ? [
        { href: "/client/daily/qualiopi", label: "Cycle Qualiopi" },
        { href: "/client/daily/procedures", label: "Procédures internes" },
      ]
    : pathname === "/client/daily/qualiopi" || pathname === "/client/daily/procedures"
      ? [{ href: "/client/daily/qualite", label: "Suivi Qualité" }]
      : [];

  return (
    <>
      {showFriendlyBanner ? <DailyFriendlyBanner /> : null}
      {showDashboardBack ? (
        <div style={backBarStyle}>
          <Link href="/client/daily" style={backLinkStyle}>
            ← Retour au tableau de bord
          </Link>
          {contextualLinks.map((link) => <Link key={link.href} href={link.href} style={backLinkStyle}>{link.label}</Link>)}
        </div>
      ) : null}
      {children}
    </>
  );
}

const backBarStyle: React.CSSProperties = {
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
