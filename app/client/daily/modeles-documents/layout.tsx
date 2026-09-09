import Link from "next/link";
import type { ReactNode } from "react";

export default function DocumentModelsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav aria-label="Choix du document contractuel" style={navStyle}>
        <strong style={{ marginRight: "auto" }}>Documents contractuels</strong>
        <Link href="/client/daily/modeles-documents" style={linkStyle}>Convention de formation professionnelle</Link>
        <Link href="/client/daily/modeles-documents/contrat-formation" style={linkStyle}>Contrat de formation professionnelle</Link>
      </nav>
      {children}
    </>
  );
}

const navStyle: React.CSSProperties = {
  maxWidth: 1120,
  margin: "1rem auto 0",
  padding: "0 1rem",
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  boxSizing: "border-box",
};
const linkStyle: React.CSSProperties = {
  minHeight: 44,
  padding: ".65rem .8rem",
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #cdb785",
  background: "#fffaf0",
  color: "#7a2e22",
  fontWeight: 800,
  textDecoration: "none",
  boxSizing: "border-box",
};
