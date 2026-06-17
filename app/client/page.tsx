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

  const hasActivePreauditAccess = hasActiveToolAccess(preauditAccess);
  const hasActiveAuditBlancAccess = hasActiveToolAccess(auditBlancAccess);

  const isPreauditUnlimited = preauditAccess?.access_type === "unlimited";
  const isAuditBlancUnlimited = auditBlancAccess?.access_type === "unlimited";

  const hasNdaDossier = ndaDossiers.length > 0;

  useEffect(() => {
    async function loadClientSpace() {
      setLoading(true);
      setError("");

      const { data, error: authError } = await supabase.auth.getUser();

      if (authError || !data.user) {
        router.replace("/client/login");
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
        console.warn("Impossible de vérifier les accès outils :", accessError);
      } else {
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
      }

      try {
        const ndaRes = await fetch("/api/client/nda-dossiers", {
          cache: "no-store",
        });

        const ndaData = await ndaRes.json().catch(() => null);

        if (ndaRes.ok) {
          setNdaDossiers((ndaData?.dossiers ?? []) as NdaDossier[]);
        } else {
          console.warn("Aucun dossier NDA récupéré :", ndaData);
        }
      } catch (ndaError) {
        console.warn("Erreur récupération dossiers NDA :", ndaError);
      }

      setLoading(false);
    }

    loadClientSpace();
  }, [router, supabase]);

  useEffect(() => {
    if (loading) return;

    if (
      ndaDossiers.length === 1 &&
      !hasActivePreauditAccess &&
      !hasActiveAuditBlancAccess
    ) {
      router.replace(`/client/dossier/${ndaDossiers[0].id}`);
    }
  }, [
    loading,
    ndaDossiers,
    hasActivePreauditAccess,
    hasActiveAuditBlancAccess,
    router,
  ]);

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
              Retrouvez ici uniquement les dossiers, outils et accompagnements
              liés à vos achats.
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

            <button
              type="button"
              onClick={signOut}
              className="btn-ghost"
              style={{ marginTop: "1rem" }}
            >
              <span>Se déconnecter</span>
            </button>
          </div>
        </header>

        {error ? (
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
        ) : null}

        {hasNdaDossier ||
        hasActivePreauditAccess ||
        hasActiveAuditBlancAccess ? (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            {hasNdaDossier ? (
              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  borderLeft: "4px solid var(--ocre-gold)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Prépa NDA</p>

                <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                  Votre dossier de déclaration d’activité
                </h2>

                <p
                  style={{
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                    marginBottom: "1rem",
                  }}
                >
                  Accédez à votre dossier NDA, déposez vos pièces, suivez les
                  échanges avec votre agent et avancez jusqu’au dépôt sur Mon
                  Activité Formation.
                </p>

                <div style={{ display: "grid", gap: "0.7rem" }}>
                  {ndaDossiers.map((dossier) => (
                    <button
                      key={dossier.id}
                      type="button"
                      className="btn-ink"
                      onClick={() =>
                        router.push(`/client/dossier/${dossier.id}`)
                      }
                    >
                      <span>
                        {dossier.title || "Accéder à mon dossier NDA"} →
                      </span>
                    </button>
                  ))}
                </div>
              </article>
            ) : null}

            {hasActivePreauditAccess ? (
              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  borderLeft: "4px solid #6a8a4a",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Auto-audit Qualiopi</p>

                <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                  Votre auto-audit est actif
                </h2>

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

                {!isPreauditUnlimited ? (
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
                ) : null}

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
              </article>
            ) : null}

            {hasActiveAuditBlancAccess ? (
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
                  Votre audit blanc Qualiopi
                </h2>

                <p
                  style={{
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                    marginBottom: "1rem",
                  }}
                >
                  Retrouvez votre dossier d’audit blanc, vos rendez-vous, les
                  consignes de préparation, le rapport transmis par l’auditeur
                  et les documents correctifs éventuels.
                </p>

                {!isAuditBlancUnlimited ? (
                  <p
                    style={{
                      color: "#6a8a4a",
                      fontWeight: 700,
                      marginBottom: "1rem",
                    }}
                  >
                    Accès actif jusqu’au {formatDate(auditBlancAccess?.ends_at)}
                    . Il reste environ {auditBlancRemainingDays ?? 0} jour
                    {(auditBlancRemainingDays ?? 0) > 1 ? "s" : ""}.
                  </p>
                ) : null}

                <button
                  type="button"
                  className="btn-ink"
                  onClick={() => router.push("/client/audit-blanc")}
                >
                  <span>Accéder à mon audit blanc →</span>
                </button>
              </article>
            ) : null}
          </section>
        ) : (
          <section className="gazette-card" style={{ padding: "1.5rem" }}>
            <p className="gazette-label">Aucun espace actif</p>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
              Aucun dossier ou outil actif n’est associé à ce compte
            </h2>

            <p
              style={{
                color: "var(--ink-soft)",
                lineHeight: 1.7,
                maxWidth: 760,
              }}
            >
              Si vous venez de finaliser un paiement, l’ouverture de votre
              espace peut prendre quelques instants. Vérifiez également que vous
              êtes connecté avec la même adresse email que celle utilisée lors
              du paiement.
            </p>

            <p
              style={{
                color: "var(--ink-soft)",
                lineHeight: 1.7,
                maxWidth: 760,
                marginTop: "0.8rem",
              }}
            >
              En cas de doute, contactez Selen à{" "}
              <a
                href="mailto:hello@selen-editions.fr"
                style={{ color: "var(--rust)" }}
              >
                hello@selen-editions.fr
              </a>
              .
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
