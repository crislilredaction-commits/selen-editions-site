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

type SupportTicket = {
  id: string;
  subject: string | null;
  category: string | null;
  status: string | null;
  last_message_at: string | null;
  created_at: string | null;
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

function hasExpiredToolAccess(access?: ToolAccess | null) {
  if (!access) return false;
  if (hasActiveToolAccess(access)) return false;
  return access.status !== "cancelled";
}

function formatSupportStatus(status?: string | null) {
  if (status === "open") return "Ouvert";
  if (status === "pending") return "En attente";
  if (status === "resolved") return "Résolu";
  if (status === "closed") return "Fermé";
  return "À suivre";
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
  const [dailyAccess, setDailyAccess] = useState<ToolAccess | null>(null);
  const [ndaDossiers, setNdaDossiers] = useState<NdaDossier[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [error, setError] = useState("");

  const preauditRemainingDays = getRemainingDays(preauditAccess?.ends_at);
  const auditBlancRemainingDays = getRemainingDays(auditBlancAccess?.ends_at);

  const hasActivePreauditAccess = hasActiveToolAccess(preauditAccess);
  const hasActiveAuditBlancAccess = hasActiveToolAccess(auditBlancAccess);
  const hasPreauditReadAccess = Boolean(preauditAccess);
  const hasAuditBlancReadAccess = Boolean(auditBlancAccess);
  const hasExpiredPreauditAccess = hasExpiredToolAccess(preauditAccess);
  const hasDailyAccess = hasActiveToolAccess(dailyAccess);

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
        .in("tool_slug", [
          "preaudit-qualiopi",
          "audit-blanc-qualiopi",
          "selen-daily",
        ])
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

        const daily =
          accesses.find((access) => access.tool_slug === "selen-daily") ?? null;

        setDailyAccess(daily);

        if (hasActiveToolAccess(daily)) {
          try {
            const onboardingRes = await fetch("/api/client/daily/onboarding", {
              cache: "no-store",
            });
            const onboardingData = await onboardingRes.json().catch(() => null);

            if (
              onboardingRes.ok &&
              onboardingData?.onboarding?.status !== "completed"
            ) {
              router.replace("/client/daily/onboarding");
              return;
            }
          } catch (dailyError) {
            console.warn(
              "Impossible de vérifier le paramétrage Selen Daily :",
              dailyError,
            );
          }
        }
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

      try {
        const supportRes = await fetch("/api/client/support-tickets", {
          cache: "no-store",
        });

        const supportData = await supportRes.json().catch(() => null);

        if (supportRes.ok) {
          setSupportTickets((supportData?.tickets ?? []) as SupportTicket[]);
        } else {
          console.warn("Aucun ticket support récupéré :", supportData);
        }
      } catch (supportError) {
        console.warn("Erreur récupération tickets support :", supportError);
      }

      setLoading(false);
    }

    loadClientSpace();
  }, [router, supabase]);

  useEffect(() => {
    if (loading) return;

    if (
      ndaDossiers.length === 1 &&
      !hasPreauditReadAccess &&
      !hasAuditBlancReadAccess
    ) {
      router.replace(`/client/dossier/${ndaDossiers[0].id}`);
    }
  }, [
    loading,
    ndaDossiers,
    hasPreauditReadAccess,
    hasAuditBlancReadAccess,
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

        {hasDailyAccess ||
        hasNdaDossier ||
        hasPreauditReadAccess ||
        hasAuditBlancReadAccess ? (
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

            {hasPreauditReadAccess ? (
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
                  {hasActivePreauditAccess
                    ? "Votre auto-audit est actif"
                    : "Votre auto-audit est en lecture seule"}
                </h2>

                <p
                  style={{
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                    marginBottom: "0.8rem",
                  }}
                >
                  {hasExpiredPreauditAccess ? (
                    <>
                      L&apos;accès actif au préaudit est expiré. Votre bilan final
                      reste consultable, mais les réponses et modifications ne
                      sont plus disponibles gratuitement.
                    </>
                  ) : isPreauditUnlimited ? (
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

                {hasActivePreauditAccess && !isPreauditUnlimited ? (
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
                  {hasActivePreauditAccess ? (
                  <button
                    type="button"
                    className="btn-ink"
                    onClick={() => router.push("/client/preaudit")}
                  >
                    <span>Commencer ou reprendre mon auto-audit →</span>
                  </button>
                  ) : null}

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

            {hasAuditBlancReadAccess ? (
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
                  {hasActiveAuditBlancAccess
                    ? "Votre audit blanc Qualiopi"
                    : "Votre audit blanc est en lecture seule"}
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

                {hasActiveAuditBlancAccess && !isAuditBlancUnlimited ? (
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

            <article
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                borderLeft: "4px solid var(--rust)",
                padding: "1.2rem",
              }}
            >
              <p className="gazette-label">Selen Daily</p>

              <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                Vos formations et sessions
              </h2>

              <p
                style={{
                  color: "var(--ink-soft)",
                  lineHeight: 1.6,
                  marginBottom: "1rem",
                }}
              >
                Créez vos formations, préparez les sessions associées et laissez
                Selen vérifier les éléments avant l’envoi des documents
                officiels.
              </p>

              <button
                type="button"
                className="btn-ink"
                onClick={() => router.push("/client/daily")}
              >
                <span>Accéder à Selen Daily →</span>
              </button>
            </article>
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
              En cas de doute, passez par{" "}
              <a
                href="/support"
                style={{ color: "var(--rust)" }}
              >
                le bouton Prévenir Selen
              </a>
              .
            </p>
          </section>
        )}

        <section
          style={{
            background: "var(--paper)",
            border: "1px solid var(--sepia-mid)",
            borderLeft: "4px solid var(--rust)",
            padding: "1.2rem",
            marginBottom: "1.5rem",
          }}
        >
          <p className="gazette-label">Support</p>

          <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
            Prévenir Selen
          </h2>

          <p
            style={{
              color: "var(--ink-soft)",
              lineHeight: 1.6,
              marginBottom: "1rem",
              maxWidth: 780,
            }}
          >
            Une question, un problème d&apos;accès, une réclamation ou une demande
            particulière ? Votre message ouvre un ticket suivi par Selen dans
            Studio.
          </p>

          <div
            style={{
              display: "flex",
              gap: "0.6rem",
              flexWrap: "wrap",
              marginBottom: "1.2rem",
            }}
          >
            <button
              type="button"
              className="btn-ink"
              onClick={() => router.push("/support")}
            >
              <span>Prévenir Selen →</span>
            </button>

            <a
              href="#historique-demandes"
              className="btn-ghost"
              style={{ textDecoration: "none" }}
            >
              <span>Historique des demandes</span>
            </a>
          </div>

          <div id="historique-demandes">
            <p className="gazette-label">Historique des demandes</p>

            {supportTickets.length > 0 ? (
              <div style={{ display: "grid", gap: "0.7rem" }}>
                {supportTickets.map((ticket) => (
                  <article
                    key={ticket.id}
                    style={{
                      border: "1px solid rgba(178,138,98,0.35)",
                      background: "rgba(248,239,223,0.45)",
                      padding: "0.9rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.8rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <strong style={{ color: "var(--ink)" }}>
                        {ticket.subject || "Demande support"}
                      </strong>
                      <span
                        className="gazette-label"
                        style={{ color: "var(--rust)" }}
                      >
                        {formatSupportStatus(ticket.status)}
                      </span>
                    </div>

                    <p
                      style={{
                        color: "var(--ink-soft)",
                        fontSize: "0.9rem",
                        marginTop: "0.4rem",
                      }}
                    >
                      {ticket.category || "Support"} · dernière mise à jour le{" "}
                      {formatDate(ticket.last_message_at ?? ticket.created_at)}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p
                style={{
                  color: "var(--ink-soft)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                Aucune demande support n&apos;a encore été ouverte avec cette
                adresse.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
