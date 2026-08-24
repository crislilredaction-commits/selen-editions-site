import type { ReactNode } from "react";

export default async function DailyStakeholderPortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ role: string; token: string }>;
}) {
  const { role, token } = await params;
  const isLearner = role === "apprenant" || role === "learner";

  return (
    <>
      {children}
      <aside style={s.panel} aria-label="Actions du portail">
        <div style={s.content}>
          <div style={s.copy}>
            <strong>Besoin d’agir depuis votre espace ?</strong>
            <span>{isLearner ? "Votre évaluation de fin et le formulaire de réclamation restent accessibles ici." : "Vous pouvez transmettre une réclamation ou une suggestion directement à Selen."}</span>
          </div>
          <div style={s.actions}>
            {isLearner ? (
              <a href={`/daily/portail/${role}/${token}/evaluation`} style={s.secondaryLink}>
                Mon évaluation
              </a>
            ) : null}
            <a href={`/daily/portail/${role}/${token}/feedback`} style={s.link}>
              Réclamation / suggestion
            </a>
          </div>
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
  actions: { display: "flex", flexWrap: "wrap", gap: "0.55rem", alignItems: "center" },
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
  secondaryLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    padding: "0.7rem 0.9rem",
    border: "1px solid var(--rust)",
    color: "var(--rust)",
    background: "var(--paper)",
    fontWeight: 800,
    textDecoration: "none",
  },
};
