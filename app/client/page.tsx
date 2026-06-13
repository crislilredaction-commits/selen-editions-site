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
  user_id: string;
  tool_slug: string;
  status: string;
  access_type: "limited" | "unlimited" | string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type NdaDossier = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
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
  if (!value) return null;

  const today = new Date();
  const expiresAt = new Date(value);
  const diff = expiresAt.getTime() - today.getTime();

  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function hasActiveToolAccess(access?: ToolAccess | null) {
  if (!access) return false;
  if (access.status !== "active") return false;

  if (access.access_type === "unlimited") return true;

  if (access.access_type === "limited") {
    if (!access.starts_at || !access.ends_at) return false;

    const now = new Date();
    return new Date(access.starts_at) <= now && new Date(access.ends_at) >= now;
  }

  return false;
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
  const [preauditAccess, setPreauditAccess] = useState<ToolAccess | null>(null);
  const [auditBlancAccess, setAuditBlancAccess] = useState<ToolAccess | null>(
    null,
  );
  const [ndaDossiers, setNdaDossiers] = useState<NdaDossier[]>([]);
  const [error, setError] = useState("");

  const preauditRemainingDays = getRemainingDays(preauditAccess?.ends_at);
  const auditBlancRemainingDays = getRemainingDays(auditBlancAccess?.ends_at);

  const hasActiveAccess = hasActiveToolAccess(preauditAccess);
  const hasActiveAuditBlancAccess = hasActiveToolAccess(auditBlancAccess);

  const isPreauditUnlimited = preauditAccess?.access_type === "unlimited";
  const isAuditBlancUnlimited = auditBlancAccess?.access_type === "unlimited";

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
        .from("selen_client_tool_access")
        .select(
          "id, user_id, tool_slug, status, access_type, starts_at, ends_at, created_at, updated_at",
        )
        .eq("user_id", data.user.id)
        .in("tool_slug", ["preaudit-qualiopi", "audit-blanc-qualiopi"])
        .order("created_at", { ascending: false });

      if (accessError) {
        setError(
          `Impossible de vérifier vos accès Selen. ${accessError.message}`,
        );
        setLoading(false);
        return;
      }

      const accesses = (accessData ?? []) as ToolAccess[];

      setPreauditAccess(
        accesses.find((access) => access.tool_slug === "preaudit-qualiopi") ??
          null,
      );

      setAuditBlancAccess(
        accesses.find(
          (access) => access.tool_slug === "audit-blanc-qualiopi",
        ) ?? null,
      );

      const ndaRes = await fetch("/api/client/nda-dossiers", {
        cache: "no-store",
      });
      const ndaData = await ndaRes.json().catch(() => null);

      if (ndaRes.ok) {
        setNdaDossiers((ndaData?.dossiers ?? []) as NdaDossier[]);
      }

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
                  {isPreauditUnlimited ? (
                    <>
                      Votre accès à l’auto-audit est actif en{" "}
                      <strong>illimité</strong>.
                    </>
                  ) : (
                    <>
                      Votre accès à l’auto-audit est actif jusqu’au{" "}
                      <strong>{formatDate(preauditAccess?.ends_at)}</strong>.
                    </>
                  )}
                </p>

                {isPreauditUnlimited ? (
                  <p
                    style={{
                      color: "#6a8a4a",
                      fontWeight: 700,
                      marginBottom: "1rem",
                    }}
                  >
                    Votre accès n’a pas de date d’expiration.
                  </p>
                ) : (
                  <p
                    style={{
                      color: "#6a8a4a",
                      fontWeight: 700,
                      marginBottom: "1rem",
                    }}
                  >
                    Il vous reste environ {preauditRemainingDays ?? 0} jour
                    {(preauditRemainingDays ?? 0) > 1 ? "s" : ""} d’accès.
                  </p>
                )}

                <p
                  style={{
                    color: "var(--ink-faint)",
                    fontSize: "0.9rem",
                    lineHeight: 1.5,
                    marginBottom: "1rem",
                  }}
                >
                  Offre :{" "}
                  {isPreauditUnlimited
                    ? "Accès offert illimité"
                    : "Accès offert"}
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

          {ndaDossiers.length > 0 && (
            <article
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                borderLeft: "4px solid var(--ocre-gold)",
                padding: "1.2rem",
              }}
            >
              <p className="gazette-label">Dossier NDA</p>

              <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                Votre accompagnement NDA
              </h2>

              <p
                style={{
                  color: "var(--ink-soft)",
                  lineHeight: 1.6,
                  marginBottom: "1rem",
                }}
              >
                Reprenez votre dossier de déclaration d'activité et suivez les
                échanges avec votre agent.
              </p>

              <button
                type="button"
                className="btn-ink"
                onClick={() => router.push(`/client/dossier/${ndaDossiers[0].id}`)}
              >
                <span>Accéder à mon dossier NDA →</span>
              </button>
            </article>
          )}

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

              {hasActiveAuditBlancAccess ? (
                <>
                  <p
                    style={{
                      color: "#6a8a4a",
                      fontWeight: 700,
                      marginBottom: "1rem",
                    }}
                  >
                    {isAuditBlancUnlimited
                      ? "Votre accès à l’audit blanc est actif en illimité."
                      : `Votre accès à l’audit blanc est actif jusqu’au ${formatDate(
                          auditBlancAccess?.ends_at,
                        )}.`}
                  </p>

                  <button
                    type="button"
                    className="btn-ink"
                    onClick={() => router.push("/client/audit-blanc")}
                  >
                    <span>Accéder à mon audit blanc →</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-ink"
                  onClick={() => router.push("/selen-review")}
                >
                  <span>Découvrir l’audit blanc →</span>
                </button>
              )}
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
