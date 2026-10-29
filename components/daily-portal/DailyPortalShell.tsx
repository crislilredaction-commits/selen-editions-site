"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

const ROLE_LABELS: Record<string, string> = {
  apprenant: "Espace apprenant",
  learner: "Espace apprenant",
  formateur: "Espace formateur",
  trainer: "Espace formateur",
  entreprise: "Espace entreprise",
  enterprise: "Espace entreprise",
};

export function DailyPortalShell({
  children,
  role,
}: {
  children: ReactNode;
  role: string;
  token: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [signingOut, setSigningOut] = useState(false);
  const label = ROLE_LABELS[role] ?? "Espace Daily";

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.assign("/client/login");
  }

  return (
    <div>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "1rem 1rem 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ color: "var(--ink)" }}>{label}</strong>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          style={{
            border: "1px solid var(--sepia-mid)",
            background: "var(--paper)",
            color: "var(--ink)",
            padding: ".65rem .85rem",
            fontWeight: 800,
            cursor: signingOut ? "wait" : "pointer",
            opacity: signingOut ? 0.6 : 1,
          }}
        >
          {signingOut ? "Déconnexion…" : "Se déconnecter"}
        </button>
      </div>
      {children}
    </div>
  );
}
