"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ClientSupportBar from "@/components/ClientSupportBar";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type AuditBlancCase = {
  id: string;
  client_email: string;
  status: string;
  offer: string;
  price_paid: number | null;
  currency: string | null;
  calendly_mode: string | null;
  calendly_event_1_start: string | null;
  calendly_event_1_end: string | null;
  calendly_event_1_url: string | null;
  calendly_event_2_start: string | null;
  calendly_event_2_end: string | null;
  calendly_event_2_url: string | null;
  meeting_url: string | null;
  report_status: string;
  report_storage_path: string | null;
  created_at: string;
  updated_at: string;
};

type AuditBlancDocument = {
  id: string;
  name: string;
  document_type: string;
  storage_path: string;
  public_url: string | null;
  created_at: string;
};

type ClientAuditSummary = {
  case_id: string;
  brand_usage_diagnostic: string | null;
  conformes: number;
  mineures: number;
  majeures: number;
  a_verifier: number;
  total_renseignes: number;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Non planifié";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatus(status?: string | null) {
  if (status === "paid") return "Paiement validé";
  if (status === "booking_pending") return "Rendez-vous à planifier";
  if (status === "partially_booked") return "Un rendez-vous sur deux réservé";
  if (status === "booked") return "Rendez-vous réservé";
  if (status === "in_progress") return "Audit blanc en cours";
  if (status === "report_ready") return "Rapport disponible";
  if (status === "completed") return "Audit blanc terminé";
  if (status === "cancelled") return "Annulé";
  return "Statut à vérifier";
}

function formatOffer(offer?: string | null) {
  if (offer === "direct") return "Audit blanc direct — 397 €";
  if (offer === "reserved_after_auto_audit") {
    return "Audit blanc après auto-audit — 199 €";
  }
  if (offer === "manual") return "Dossier créé manuellement";
  return "Offre audit blanc";
}

function statusColor(status?: string | null) {
  if (status === "report_ready" || status === "completed") return "#6a8a4a";
  if (status === "booked" || status === "in_progress")
    return "var(--ocre-dark)";
  if (status === "booking_pending" || status === "partially_booked") {
    return "var(--ocre-gold)";
  }
  if (status === "cancelled") return "var(--rust)";
  return "var(--ink-faint)";
}

function diagnosticLabel(value?: string | null) {
  if (value === "conforme") return "✅ Conforme";
  if (value === "mineure") return "⚠️ Mineure";
  if (value === "majeure") return "🚨 Majeure";
  if (value === "a_verifier") return "… À vérifier";
  return "Non renseigné";
}

function diagnosticColor(value?: string | null) {
  if (value === "conforme") return "#6a8a4a";
  if (value === "mineure") return "var(--ocre-gold)";
  if (value === "majeure") return "var(--rust)";
  return "var(--ink-faint)";
}

function extractStoragePath(value?: string | null) {
  if (!value) return "";

  const marker = "/storage/v1/object/public/selen-documents/";
  const markerIndex = value.indexOf(marker);

  if (markerIndex >= 0) {
    return value.slice(markerIndex + marker.length);
  }

  return value.replace(/^\/+/, "");
}

function isAuditReportDocument(doc: AuditBlancDocument) {
  return (
    doc.document_type === "rapport_audit_blanc_pdf" ||
    doc.document_type === "rapport_audit_blanc"
  );
}

function sortDocumentsByCreatedAtDesc(
  docs: AuditBlancDocument[],
): AuditBlancDocument[] {
  return [...docs].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export default function ClientAuditBlancPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const calendlySingleUrl =
    process.env.NEXT_PUBLIC_CALENDLY_AUDIT_BLANC_3H30_URL?.trim() || "";

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [auditCase, setAuditCase] = useState<AuditBlancCase | null>(null);
  const [documents, setDocuments] = useState<AuditBlancDocument[]>([]);
  const [error, setError] = useState("");

  const [summary, setSummary] = useState<ClientAuditSummary | null>(null);

  const latestReportDocument =
    sortDocumentsByCreatedAtDesc(documents.filter(isAuditReportDocument))[0] ??
    null;

  const correctiveDocuments = documents.filter(
    (doc) => !isAuditReportDocument(doc),
  );

  function getDocumentHref(doc: AuditBlancDocument) {
    const storagePath = extractStoragePath(doc.storage_path || doc.public_url);

    if (!storagePath) {
      return doc.public_url ?? "#";
    }

    return supabase.storage.from("selen-documents").getPublicUrl(storagePath)
      .data.publicUrl;
  }

  useEffect(() => {
    async function loadAuditBlanc() {
      setLoading(true);
      setError("");

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        router.replace("/client/login");
        return;
      }

      const userEmail = authData.user.email ?? null;
      const cleanEmail = userEmail?.trim().toLowerCase() ?? null;

      setEmail(cleanEmail);

      if (!cleanEmail) {
        setError("Aucune adresse email n’est associée à votre compte client.");
        setLoading(false);
        return;
      }

      const { data: caseData, error: caseError } = await supabase
        .from("audit_blanc_cases")
        .select(
          "id, client_email, status, offer, price_paid, currency, calendly_mode, calendly_event_1_start, calendly_event_1_end, calendly_event_1_url, calendly_event_2_start, calendly_event_2_end, calendly_event_2_url, meeting_url, report_status, report_storage_path, created_at, updated_at",
        )
        .eq("client_email", cleanEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (caseError) {
        setError(
          `Impossible de charger votre audit blanc. ${caseError.message}`,
        );
        setLoading(false);
        return;
      }

      setAuditCase(caseData);

      if (caseData?.id) {
        const { data: summaryData, error: summaryError } = await supabase.rpc(
          "get_audit_blanc_client_summary",
          {
            p_case_id: caseData.id,
          },
        );

        if (summaryError) {
          setError(
            `Impossible de charger la synthèse. ${summaryError.message}`,
          );
          setLoading(false);
          return;
        }

        const summaryRow = Array.isArray(summaryData)
          ? summaryData[0]
          : summaryData;

        setSummary((summaryRow ?? null) as ClientAuditSummary | null);
      }

      if (caseData?.id) {
        const { data: documentData, error: documentError } = await supabase
          .from("audit_blanc_documents")
          .select(
            "id, name, document_type, storage_path, public_url, created_at",
          )
          .eq("case_id", caseData.id)
          .eq("is_visible_to_client", true)
          .order("created_at", { ascending: false });

        if (documentError) {
          setError(
            `Impossible de charger les documents. ${documentError.message}`,
          );
          setLoading(false);
          return;
        }

        setDocuments(documentData ?? []);
      }

      setLoading(false);
    }

    loadAuditBlanc();
  }, [router, supabase]);

  if (loading) {
    return (
      <main className="gazette-paper" style={{ minHeight: "100vh" }}>
        <Header />
        <ClientSupportBar email={email} context="l’espace audit blanc" />

        <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--ink-faint)" }}>
            Chargement de votre dossier audit blanc…
          </p>
        </div>

        <Footer />
      </main>
    );
  }

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <Header />
      <ClientSupportBar email={email} context="l’espace audit blanc" />

      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "2rem 1.5rem 4rem",
        }}
      >
        <header
          className="gazette-cta"
          style={{ padding: "2rem", marginBottom: "1.5rem" }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            <p className="gazette-label">Selen Review</p>

            <h1
              className="gazette-hero-title"
              style={{ color: "var(--parchment)", marginBottom: "0.5rem" }}
            >
              Votre audit blanc Qualiopi
            </h1>

            <p
              style={{
                color: "var(--sepia-mid)",
                lineHeight: 1.65,
                maxWidth: 760,
              }}
            >
              Retrouvez ici vos rendez-vous, les consignes de préparation, puis
              votre rapport d’audit blanc et les documents correctifs transmis
              par l’auditeur.
            </p>
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

        {!auditCase ? (
          <section
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1.4rem",
            }}
          >
            <p className="gazette-label">Aucun dossier actif</p>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.6rem" }}>
              Vous n’avez pas encore d’audit blanc réservé.
            </h2>

            <p
              style={{
                color: "var(--ink-soft)",
                lineHeight: 1.65,
                marginBottom: "1rem",
              }}
            >
              L’audit blanc est une prestation accompagnée avec un auditeur. Il
              pourra être réservé directement, ou à tarif préférentiel si vous
              avez déjà réalisé l’auto-audit Qualiopi.
            </p>

            <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
              <Link href="/selen-review" className="btn-ink">
                <span>Voir Selen Review</span>
              </Link>

              <Link href="/client" className="btn-ink">
                <span>Retour espace client</span>
              </Link>
            </div>
          </section>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 340px",
              gap: "1.25rem",
              alignItems: "start",
            }}
            className="preaudit-grid"
          >
            <section style={{ display: "grid", gap: "1rem" }}>
              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  borderLeft: `4px solid ${statusColor(auditCase.status)}`,
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Statut du dossier</p>

                <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                  {formatStatus(auditCase.status)}
                </h2>

                <p
                  style={{
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                    marginBottom: "0.7rem",
                  }}
                >
                  Offre : {formatOffer(auditCase.offer)}
                </p>

                <p
                  style={{
                    color: "var(--ink-faint)",
                    fontSize: "0.9rem",
                    lineHeight: 1.5,
                  }}
                >
                  Dossier créé le {formatDateTime(auditCase.created_at)}
                </p>
              </article>

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Rendez-vous</p>

                <h2 style={{ color: "var(--ink)", marginBottom: "0.7rem" }}>
                  Planifier ou retrouver vos créneaux
                </h2>

                {auditCase.calendly_event_1_start ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "0.6rem",
                      color: "var(--ink-soft)",
                      lineHeight: 1.6,
                    }}
                  >
                    <p>
                      <strong>Créneau 1 :</strong>{" "}
                      {formatDateTime(auditCase.calendly_event_1_start)}
                    </p>

                    {auditCase.calendly_event_2_start && (
                      <p>
                        <strong>Créneau 2 :</strong>{" "}
                        {formatDateTime(auditCase.calendly_event_2_start)}
                      </p>
                    )}

                    {auditCase.meeting_url && (
                      <a
                        href={auditCase.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ink"
                        style={{
                          display: "inline-block",
                          width: "fit-content",
                        }}
                      >
                        <span>Rejoindre la visio</span>
                      </a>
                    )}
                  </div>
                ) : (
                  <>
                    <p
                      style={{
                        color: "var(--ink-soft)",
                        lineHeight: 1.65,
                        marginBottom: "1rem",
                      }}
                    >
                      Réservez votre créneau d’audit blanc de 3h30. Si vous avez
                      choisi un format en deux rendez-vous d’1h45, réservez ce
                      premier créneau : le second rendez-vous sera programmé
                      avec vous pendant la première session.
                    </p>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "0.8rem",
                      }}
                    >
                      <a
                        href={calendlySingleUrl || "#"}
                        target={calendlySingleUrl ? "_blank" : undefined}
                        rel="noreferrer"
                        className="btn-ink"
                        style={{
                          textAlign: "center",
                          opacity: calendlySingleUrl ? 1 : 0.55,
                          pointerEvents: calendlySingleUrl ? "auto" : "none",
                        }}
                      >
                        <span>Réserver mon audit blanc</span>
                      </a>
                    </div>

                    <p
                      style={{
                        color: "var(--ink-faint)",
                        fontSize: "0.88rem",
                        lineHeight: 1.5,
                        marginTop: "0.8rem",
                      }}
                    >
                      Note : si votre audit blanc est prévu en deux sessions, le
                      second rendez-vous sera fixé directement avec l’auditeur
                      lors du premier échange.
                    </p>

                    {!calendlySingleUrl && (
                      <p
                        style={{
                          color: "var(--ink-faint)",
                          fontSize: "0.88rem",
                          lineHeight: 1.5,
                          marginTop: "0.8rem",
                        }}
                      >
                        Le lien de réservation Calendly sera ajouté très
                        prochainement.
                      </p>
                    )}
                  </>
                )}
              </article>

              <article
                style={{
                  background: "rgba(178,138,98,0.08)",
                  border: "1px dashed var(--sepia-mid)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Avant votre audit blanc</p>

                <h2 style={{ color: "var(--ink)", marginBottom: "0.6rem" }}>
                  Les consignes de préparation
                </h2>

                <div
                  style={{
                    display: "grid",
                    gap: "0.6rem",
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                  }}
                >
                  <p>
                    ✦ Préparez les documents que vous utilisez réellement le
                    jour de l’audit : programmes, conventions, convocations,
                    émargements, évaluations, questionnaires, tableaux de suivi.
                  </p>
                  <p>
                    ✦ Gardez à portée de main vos preuves de diffusion, d’envoi,
                    de remise ou de suivi.
                  </p>
                  <p>
                    ✦ Si vous avez déjà réalisé l’auto-audit, ouvrez votre bilan
                    final et vos notes : cela fera gagner beaucoup de temps.
                  </p>
                  <p>
                    ✦ Le jour du rendez-vous, l’auditeur vous guidera indicateur
                    par indicateur et notera les écarts ou points de vigilance.
                  </p>
                </div>
              </article>

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  borderLeft: "4px solid var(--ocre-gold)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Synthèse de l’audit blanc</p>

                <h2 style={{ color: "var(--ink)", marginBottom: "0.7rem" }}>
                  Votre état d’avancement
                </h2>

                {!summary ? (
                  <p
                    style={{
                      color: "var(--ink-faint)",
                      fontSize: "0.92rem",
                      lineHeight: 1.5,
                    }}
                  >
                    La synthèse sera disponible lorsque l’auditeur aura commencé
                    l’analyse.
                  </p>
                ) : (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(165px, 1fr))",
                        gap: "0.8rem",
                        alignItems: "stretch",
                      }}
                    >
                      {[
                        {
                          label: "Marques",
                          value: diagnosticLabel(
                            summary.brand_usage_diagnostic,
                          ),
                          color: diagnosticColor(
                            summary.brand_usage_diagnostic,
                          ),
                          background: "rgba(255,255,255,0.35)",
                          isText: true,
                        },
                        {
                          label: "Conformes",
                          value: summary.conformes,
                          color: "#4f6f36",
                          background: "rgba(106,138,74,0.08)",
                        },
                        {
                          label: "Mineures",
                          value: summary.mineures,
                          color: "var(--ocre-dark)",
                          background: "rgba(201,160,85,0.1)",
                        },
                        {
                          label: "Majeures",
                          value: summary.majeures,
                          color: "var(--rust)",
                          background: "rgba(138,75,36,0.08)",
                        },
                        {
                          label: "À vérifier",
                          value: summary.a_verifier,
                          color: "var(--ink-faint)",
                          background: "rgba(90,64,49,0.05)",
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            border: "1px solid var(--sepia-mid)",
                            background: item.background,
                            padding: "0.9rem",
                            minHeight: "120px",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            gap: "0.7rem",
                          }}
                        >
                          <p
                            style={{
                              fontFamily: "var(--font-cinzel, 'Cinzel', serif)",
                              fontSize: "0.58rem",
                              letterSpacing: "0.18em",
                              textTransform: "uppercase",
                              color: "var(--ocre-dark)",
                              margin: 0,
                              lineHeight: 1.4,
                              wordBreak: "normal",
                            }}
                          >
                            {item.label}
                          </p>

                          <p
                            style={{
                              color: item.color,
                              fontSize: item.isText ? "1.05rem" : "1.9rem",
                              fontWeight: 800,
                              margin: 0,
                              lineHeight: 1.15,
                            }}
                          >
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <p
                      style={{
                        color: "var(--ink-faint)",
                        fontSize: "0.9rem",
                        lineHeight: 1.5,
                        marginTop: "0.8rem",
                      }}
                    >
                      Cette synthèse reprend les constats saisis par l’auditeur
                      pendant l’audit blanc. Le rapport final détaille les
                      points à corriger et les actions recommandées.
                    </p>
                  </>
                )}
              </article>

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  borderLeft: "4px solid var(--ocre-dark)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Rapport d’audit blanc</p>

                <h2 style={{ color: "var(--ink)", marginBottom: "0.7rem" }}>
                  Votre rapport PDF
                </h2>

                {latestReportDocument ? (
                  <div style={{ display: "grid", gap: "0.55rem" }}>
                    {[
                      latestReportDocument,
                    ].map((doc) => (
                      <a
                        key={doc.id}
                        href={getDocumentHref(doc)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ink"
                        style={{
                          display: "inline-block",
                          width: "fit-content",
                        }}
                      >
                        <span>📥 Télécharger {doc.name}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p
                    style={{
                      color: "var(--ink-faint)",
                      fontSize: "0.92rem",
                      lineHeight: 1.5,
                    }}
                  >
                    Le rapport PDF n’est pas encore disponible. Il apparaîtra
                    ici lorsque l’auditeur l’aura généré et publié dans votre
                    espace client.
                  </p>
                )}
              </article>

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Rapport et documents</p>

                <h2 style={{ color: "var(--ink)", marginBottom: "0.7rem" }}>
                  Vos documents transmis par l’auditeur
                </h2>

                {correctiveDocuments.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.55rem" }}>
                    {correctiveDocuments.map((doc) => (
                      <a
                        key={doc.id}
                        href={getDocumentHref(doc)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "block",
                          color: "var(--ink-soft)",
                          textDecoration: "none",
                          borderLeft: "2px solid var(--ocre-gold)",
                          paddingLeft: "0.6rem",
                          lineHeight: 1.45,
                        }}
                      >
                        📥 {doc.name}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p
                    style={{
                      color: "var(--ink-faint)",
                      fontSize: "0.92rem",
                      lineHeight: 1.5,
                    }}
                  >
                    Aucun document correctif n’a encore été publié. Ils
                    apparaîtront ici lorsque l’auditeur les aura transmis.
                  </p>
                )}
              </article>
            </section>

            <aside
              style={{
                position: "sticky",
                top: "1.5rem",
                display: "grid",
                gap: "1rem",
              }}
            >
              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1rem",
                }}
              >
                <p className="gazette-label">Résumé</p>

                <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
                  <strong>Statut :</strong> {formatStatus(auditCase.status)}
                </p>

                <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
                  <strong>Offre :</strong> {formatOffer(auditCase.offer)}
                </p>

                <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
                  <strong>Rapport :</strong>{" "}
                  {auditCase.report_status === "ready" ||
                  auditCase.report_status === "sent"
                    ? "Disponible"
                    : "En attente"}
                </p>
              </article>

              <div style={{ display: "grid", gap: "0.5rem" }}>
                <Link href="/client" className="btn-ink">
                  <span>Retour espace client</span>
                </Link>

                <Link href="/client/preaudit/final" className="btn-ink">
                  <span>Voir mon bilan auto-audit</span>
                </Link>

                <Link href="/selen-review" className="btn-ink">
                  <span>Retour Selen Review</span>
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
