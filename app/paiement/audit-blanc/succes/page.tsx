"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

function AuditBlancSuccessContent() {
  const searchParams = useSearchParams();

  const sessionId = useMemo(() => {
    return searchParams.get("session_id") ?? "";
  }, [searchParams]);

  return (
    <div
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "2rem 1.5rem 4rem",
      }}
    >
      <header
        className="gazette-cta"
        style={{ padding: "2.2rem", marginBottom: "1.5rem" }}
      >
        <div style={{ position: "relative", zIndex: 1 }}>
          <p className="gazette-label">Paiement validé</p>

          <h1
            className="gazette-hero-title"
            style={{
              color: "var(--parchment)",
              marginBottom: "0.6rem",
            }}
          >
            Votre audit blanc est réservé ✨
          </h1>

          <p
            style={{
              color: "var(--sepia-mid)",
              lineHeight: 1.65,
              maxWidth: 720,
            }}
          >
            Merci pour votre achat. Votre dossier d’audit blanc Qualiopi vient
            d’être créé dans votre espace client. Vous pouvez maintenant choisir
            votre ou vos créneaux de rendez-vous.
          </p>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          gap: "1.25rem",
          alignItems: "start",
        }}
        className="preaudit-grid"
      >
        <div style={{ display: "grid", gap: "1rem" }}>
          <article
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              borderLeft: "4px solid var(--ocre-dark)",
              padding: "1.2rem",
            }}
          >
            <p className="gazette-label">Prochaine étape</p>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.6rem" }}>
              Planifier votre audit blanc
            </h2>

            <p
              style={{
                color: "var(--ink-soft)",
                lineHeight: 1.65,
                marginBottom: "1rem",
              }}
            >
              Dans votre espace audit blanc, vous pourrez choisir un rendez-vous
              unique de 3h30 ou deux rendez-vous d’1h45, selon ce qui vous
              convient le mieux.
            </p>

            <div
              style={{
                display: "flex",
                gap: "0.7rem",
                flexWrap: "wrap",
              }}
            >
              <Link
                href="/prendre-rendez-vous?source=client_space&appointmentType=audit_3h30"
                className="btn-ink"
              >
                <span>Réserver 3h30 →</span>
              </Link>

              <Link
                href="/prendre-rendez-vous?source=client_space&appointmentType=audit_2x1h45"
                className="btn-ink"
              >
                <span>Réserver 2 × 1h45</span>
              </Link>

              <Link href="/client" className="btn-ink">
                <span>Retour espace client</span>
              </Link>
            </div>
          </article>

          <article
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1.2rem",
            }}
          >
            <p className="gazette-label">Avant le rendez-vous</p>

            <div
              style={{
                display: "grid",
                gap: "0.6rem",
                color: "var(--ink-soft)",
                lineHeight: 1.6,
              }}
            >
              <p>
                ✅ Préparez vos documents Qualiopi : programmes, conventions,
                convocations, émargements, évaluations, questionnaires et
                preuves de suivi.
              </p>
              <p>
                ✅ Gardez vos preuves de diffusion, d’envoi ou de remise à
                portée de main.
              </p>
              <p>
                ✅ Si vous avez déjà réalisé l’auto-audit, ouvrez votre bilan
                final et vos notes.
              </p>
              <p>
                ✅ Le jour du rendez-vous, l’auditeur vous guidera indicateur
                par indicateur.
              </p>
            </div>
          </article>

          <article
            style={{
              background: "rgba(178,138,98,0.08)",
              border: "1px dashed var(--sepia-mid)",
              padding: "1.2rem",
            }}
          >
            <p className="gazette-label">Rapport final</p>

            <p
              style={{
                color: "var(--ink-soft)",
                lineHeight: 1.65,
                marginBottom: "0.7rem",
              }}
            >
              Après l’audit blanc, votre rapport sera déposé dans votre espace
              client. Les documents correctifs proposés par l’auditeur pourront
              également être mis à disposition au même endroit.
            </p>

            <p
              style={{
                color: "var(--ink-faint)",
                fontSize: "0.9rem",
                lineHeight: 1.5,
              }}
            >
              Vous recevrez les informations utiles directement dans votre
              espace audit blanc.
            </p>
          </article>
        </div>

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
              borderLeft: "4px solid var(--ocre-gold)",
              padding: "1.2rem",
            }}
          >
            <p className="gazette-label">Statut</p>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
              Paiement reçu
            </h2>

            <p
              style={{
                color: "var(--ink-soft)",
                lineHeight: 1.6,
                marginBottom: "1rem",
              }}
            >
              Votre achat a été confirmé par Stripe. Le dossier audit blanc est
              lié à l’adresse email utilisée pendant le paiement.
            </p>

            {sessionId && (
              <p
                style={{
                  color: "var(--ink-faint)",
                  fontSize: "0.78rem",
                  lineHeight: 1.45,
                  wordBreak: "break-all",
                }}
              >
                Référence Stripe : {sessionId}
              </p>
            )}
          </article>

          <div style={{ display: "grid", gap: "0.5rem" }}>
            <Link href="/client/audit-blanc" className="btn-ink">
              <span>Aller à mon audit blanc</span>
            </Link>

            <Link href="/client" className="btn-ink">
              <span>Retour espace client</span>
            </Link>

            <Link href="/selen-review" className="btn-ink">
              <span>Retour à Selen Review</span>
            </Link>

            <Link href="/nos-prestations" className="btn-ink">
              <span>Retour aux prestations</span>
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default function AuditBlancSuccessPage() {
  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <Header />

      <Suspense
        fallback={
          <div style={{ minHeight: "60vh", padding: "3rem 1.5rem" }}>
            <p style={{ textAlign: "center", color: "var(--ink-faint)" }}>
              Chargement de la confirmation…
            </p>
          </div>
        }
      >
        <AuditBlancSuccessContent />
      </Suspense>

      <Footer />
    </main>
  );
}
