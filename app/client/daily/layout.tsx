import Link from "next/link";

export default function DailyClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav
        aria-label="Navigation Selen Daily"
        style={{
          display: "flex",
          justifyContent: "center",
          gap: ".55rem",
          flexWrap: "wrap",
          padding: ".75rem 1rem",
          borderBottom: "1px solid var(--sepia-mid)",
          background: "var(--paper)",
        }}
      >
        <Link href="/client/daily/formations" style={linkStyle}>Formations</Link>
        <Link href="/client/daily/sessions" style={linkStyle}>Sessions</Link>
        <Link href="/client/daily/dossiers" style={linkStyle}>Dossiers de session</Link>
        <Link href="/client/daily" style={linkStyle}>Suivi & documents</Link>
        <Link href="/client/daily/organisation" style={linkStyle}>Mon organisme</Link>
      </nav>
      {children}
    </>
  );
}

const linkStyle: React.CSSProperties = {
  color: "var(--rust)",
  textDecoration: "none",
  border: "1px solid var(--sepia-mid)",
  padding: ".5rem .8rem",
  background: "rgba(201,160,85,.08)",
};
