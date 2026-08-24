import type { ReactNode } from "react";

export default async function DailyStakeholderPortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ role: string; token: string }>;
}) {
  const { role, token } = await params;

  return (
    <>
      {children}
      <aside style={s.panel} aria-label="Réclamations et suggestions">
        <div style={s.content}>
          <div style={s.copy}>
            <strong>Une réclamation ou une suggestion ?</strong>
            <span>Vous pouvez la transmettre directement à Selen depuis votre espace.</span>
          </div>
          <a href={`/daily/portail/${role}/${token}/feedback`} style={s.link}>
            Ouvrir le formulaire
          </a>
        </div>
      </aside>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    position: "sticky",
    bottom: 0,
    zIndex: 20,
    padding: "0.75rem 1rem",
    background: "rgba(248,243,232,0.97)",
    borderTop: "1px solid var(--sepia-mid)",
    boxShadow: "0 -8px 24px rgba(80,58,39,0.08)",
  },
  content: {
    maxWidth: 1040,
    margin: "0 auto",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
  },
  copy: { display: "grid", gap: "0.15rem", color: "var(--ink)", lineHeight: 1.4 },
  link: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    padding: "0.7rem 0.9rem",
    background: "var(--rust)",
    color: "white",
    fontWeight: 800,
    textDecoration: "none",
  },
};
