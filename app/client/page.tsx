"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import ClientSupportBar from "@/components/ClientSupportBar";

type UserInfo = {
  email?: string | null;
};

type ToolAccess = {
  id: string;
  email: string;
  tool_key: string;
  status: string;
  access_starts_at: string;
  access_expires_at: string;
  offer: string | null;
  amount_paid: number | null;
  currency: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "Non renseignée";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function getRemainingDays(value?: string | null) {
  if (!value) return 0;

  const today = new Date();
  const expiresAt = new Date(value);
  const diff = expiresAt.getTime() - today.getTime();

  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatOffer(value?: string | null) {
  if (value === "unique") return "Paiement unique — 99 €";
  if (value === "trois-fois") return "Paiement en 3 fois — 3 × 33 €";
  return "Offre non renseignée";
}

export default function ClientDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [toolAccess, setToolAccess] = useState<ToolAccess | null>(null);
  const [error, setError] = useState("");

  const remainingDays = getRemainingDays(toolAccess?.access_expires_at);

  const hasActiveAccess =
    Boolean(toolAccess) && toolAccess?.status === "active" && remainingDays > 0;

  useEffect(() => {
    async function loadClientSpace() {
      setLoading(true);
      setError("");

      const { data, error: authError } = await supabase.auth.getUser();

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!data.user) {
        router.push("/client/login");
        return;
      }

      setUserInfo({
        email: data.user.email,
      });

      const { data: accessData, error: accessError } = await supabase
        .from("client_tool_access")
        .select(
          "id, email, tool_key, status, access_starts_at, access_expires_at, offer, amount_paid, currency",
        )
        .eq("tool_key", "preaudit_qualiopi")
        .maybeSingle();

      if (accessError) {
        setError(
          `Impossible de vérifier votre accès auto-audit. ${accessError.message}`,
        );
        setLoading(false);
        return;
      }

      setToolAccess(accessData);
      setLoading(false);
    }

    loadClientSpace();
  }, [router, supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/client/login");
  }

  if (loading) {
    return (
      <main
        className="gazette-paper"
        style={{ minHeight: "100vh", padding: "3rem 1.5rem" }}
      >
        <p style={{ textAlign: "center", color: "var(--ink-faint)" }}>
          Ouverture de votre espace client…
        </p>
      </main>
    );
  }

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <ClientSupportBar
        email={userInfo?.email}
        context="l’espace client Selen"
      />
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "2rem 1.5rem 4rem",
        }}
      >
        <header
          className="gazette-cta"
          style={{ padding: "2rem", marginBottom: "1.5rem" }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            <p className="gazette-label">Espace client</p>

            <h1
              className="gazette-hero-title"
              style={{ color: "var(--parchment)", marginBottom: "0.5rem" }}
            >
              Bienvenue dans votre espace Selen
            </h1>

            <p style={{ color: "var(--sepia-mid)", lineHeight: 1.65 }}>
              Retrouvez ici vos outils Qualiopi, votre auto-audit, vos notes et
              votre bilan final.
            </p>

            {userInfo?.email && (
              <p
                style={{
                  color: "rgba(240,220,190,0.75)",
                  fontSize: "0.9rem",
                  marginTop: "0.8rem",
                }}
              >
                Connecté avec : {userInfo.email}
              </p>
            )}
          </div>
        </header>

        {error && (
          <div
            style={{
              border: "1px solid var(--rust)",
              borderLeft: "4px solid var(--rust)",
              background: "rgba(138,75,36,0.06)",
              padding: "1rem",
              marginBottom: "1rem",
              color: "var(--rust)",
            }}
          >
            {error}
          </div>
        )}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <article
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              borderLeft: hasActiveAccess
                ? "4px solid #6a8a4a"
                : "4px solid var(--rust)",
              padding: "1.2rem",
            }}
          >
            <p className="gazette-label">Auto-audit Qualiopi</p>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
              {hasActiveAccess ? "Accès actif" : "Accès non actif"}
            </h2>

            {hasActiveAccess ? (
              <>
                <p
                  style={{
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                    marginBottom: "0.8rem",
                  }}
                >
                  Votre accès à l’auto-audit est actif jusqu’au{" "}
                  <strong>{formatDate(toolAccess?.access_expires_at)}</strong>.
                </p>

                <p
                  style={{
                    color: "#6a8a4a",
                    fontWeight: 700,
                    marginBottom: "1rem",
                  }}
                >
                  Il vous reste environ {remainingDays} jour
                  {remainingDays > 1 ? "s" : ""} d’accès.
                </p>

                <p
                  style={{
                    color: "var(--ink-faint)",
                    fontSize: "0.9rem",
                    lineHeight: 1.5,
                    marginBottom: "1rem",
                  }}
                >
                  Offre : {formatOffer(toolAccess?.offer)}
                </p>

                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn-ink"
                    onClick={() => router.push("/client/preaudit")}
                  >
                    <span>Commencer ou reprendre mon auto-audit →</span>
                  </button>

                  <button
                    type="button"
                    className="btn-ink"
                    onClick={() => router.push("/client/preaudit/final")}
                  >
                    <span>Voir mon bilan final</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <p
                  style={{
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                    marginBottom: "1rem",
                  }}
                >
                  Aucun accès actif à l’auto-audit Qualiopi n’est associé à ce
                  compte, ou votre accès de 3 mois est terminé.
                </p>

                <button
                  type="button"
                  className="btn-ink"
                  onClick={() => router.push("/auto-audit-qualiopi")}
                >
                  <span>Découvrir l’auto-audit Qualiopi</span>
                </button>
              </>
            )}
          </article>

          <article
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1.2rem",
            }}
          >
            <p className="gazette-label">Ce que contient l’outil</p>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
              Votre grimoire de préparation
            </h2>

            <div
              style={{
                display: "grid",
                gap: "0.45rem",
                color: "var(--ink-soft)",
                lineHeight: 1.55,
                fontSize: "0.95rem",
              }}
            >
              <p>✅ Questionnaire profil</p>
              <p>✅ Vérification usage des marques Qualiopi</p>
              <p>✅ Diagnostic indicateur par indicateur</p>
              <p>✅ Modèles de documents selon vos réponses</p>
              <p>✅ Notes personnelles</p>
              <p>✅ Bilan final avec export Excel</p>
            </div>
          </article>

          <article
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1.2rem",
            }}
          >
            <article
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                borderLeft: "4px solid var(--ocre-gold)",
                padding: "1.2rem",
              }}
            >
              <p className="gazette-label">Selen Review</p>

              <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                Audit blanc Qualiopi
              </h2>

              <p
                style={{
                  color: "var(--ink-soft)",
                  lineHeight: 1.6,
                  marginBottom: "1rem",
                }}
              >
                Retrouvez ici votre dossier d’audit blanc, vos rendez-vous, les
                consignes de préparation, puis le rapport transmis par
                l’auditeur et les documents correctifs éventuels.
              </p>

              <div
                style={{
                  display: "grid",
                  gap: "0.5rem",
                  color: "var(--ink-faint)",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                  marginBottom: "1rem",
                }}
              >
                <p>✦ Audit blanc direct : 397 €</p>
                <p>✦ Tarif après auto-audit : 199 €</p>
                <p>✦ Réservation Calendly après paiement</p>
              </div>

              <button
                type="button"
                className="btn-ink"
                onClick={() => router.push("/client/audit-blanc")}
              >
                <span>Accéder à mon audit blanc →</span>
              </button>
            </article>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
              Audit blanc après auto-audit
            </h2>

            <p
              style={{
                color: "var(--ink-soft)",
                lineHeight: 1.6,
                marginBottom: "1rem",
              }}
            >
              Après votre auto-audit, vous pourrez réserver un audit blanc avec
              un auditeur certifié au tarif réservé de <strong>199 €</strong>.
            </p>

            <p
              style={{
                color: "var(--ink-faint)",
                fontSize: "0.9rem",
                lineHeight: 1.5,
              }}
            >
              L’audit blanc direct, sans passage par l’auto-audit, sera proposé
              séparément à 397 €.
            </p>
          </article>
        </section>

        <section
          style={{
            background: "rgba(178,138,98,0.08)",
            border: "1px dashed var(--sepia-mid)",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <p className="gazette-label">Gestion du compte</p>

          <p
            style={{
              color: "var(--ink-soft)",
              lineHeight: 1.6,
              marginBottom: "0.8rem",
            }}
          >
            Vous pouvez vous déconnecter à tout moment. Vos accès et vos données
            de préaudit restent liés à votre adresse email.
          </p>

          <button type="button" className="btn-ink" onClick={signOut}>
            <span>Se déconnecter</span>
          </button>
        </section>
      </div>
    </main>
  );
}
