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
        <Link href="/client/daily/a-faire" style={actionLinkStyle}>À faire</Link>
        <Link href="/client/daily/formations" style={linkStyle}>Formations</Link>
        <Link href="/client/daily/formations/evaluation" style={linkStyle}>Modèles d’évaluation</Link>
        <Link href="/client/daily/sessions" style={linkStyle}>Sessions</Link>
        <Link href="/client/daily/presences" style={linkStyle}>Présences</Link>
        <Link href="/client/daily/relances" style={linkStyle}>Relances</Link>
        <Link href="/client/daily/communications" style={linkStyle}>Communications</Link>
        <Link href="/client/daily/suivi" style={linkStyle}>Déroulement</Link>
        <Link href="/client/daily/evaluations" style={linkStyle}>Évaluations & satisfaction</Link>
        <Link href="/client/daily/evaluations/preuves" style={linkStyle}>Preuves d’évaluation</Link>
        <Link href="/client/daily/documents-fin" style={linkStyle}>Documents de fin</Link>
        <Link href="/client/daily/reclamations" style={linkStyle}>Réclamations & suggestions</Link>
        <Link href="/client/daily/apprenants" style={linkStyle}>Apprenants</Link>
        <Link href="/client/daily/documents" style={linkStyle}>Documents préformation</Link>
        <Link href="/client/daily/dossiers" style={linkStyle}>Dossiers de session</Link>
        <Link href="/client/daily" style={linkStyle}>Suivi & documents</Link>
        <Link href="/client/daily/organisation" style={linkStyle}>Mon organisme</Link>
        <Link href="/client/daily/formateur/suivi-sessions" style={linkStyle}>Suivi de mes sessions</Link>
        <Link href="/client/daily/formateur/suivi-annuel" style={linkStyle}>Mon suivi formateur</Link>
        <Link href="/client/daily/formateur/cv" style={linkStyle}>Mon CV</Link>
        <Link href="/client/daily/formateurs/suivi-annuel" style={linkStyle}>Suivi des formateurs</Link>
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

const actionLinkStyle: React.CSSProperties = {
  ...linkStyle,
  fontWeight: 800,
  borderColor: "var(--rust)",
  background: "rgba(138,75,36,.1)",
};
