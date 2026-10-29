"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

function AutoAuditSuccessContent() {
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
            Votre auto-audit Qualiopi est en route ✨
          </h1>

          <p
            style={{
              color: "var(--sepia-mid)",
              lineHeight: 1.65,
              maxWidth: 720,
            }}
          >
            Merci pour votre achat. Votre accès à l’auto-audit Qualiopi est
            activé pour une durée de 3 mois. Un email de connexion vient de vous
            être envoyé : pensez à vérifier vos courriers indésirables si vous
            ne le voyez pas arriver dans les prochaines minutes.
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
              Accéder à votre espace client
            </h2>

            <p
              style={{
                color: "var(--ink-soft)",
                lineHeight: 1.65,
                marginBottom: "1rem",
              }}
            >
              Votre espace client regroupe l’accès à l’auto-audit, votre
              questionnaire profil, vos indicateurs, vos notes et votre bilan
              final.
            </p>

            <div
              style={{
                display: "flex",
                gap: "0.7rem",
                flexWrap: "wrap",
              }}
            >
              <Link href="/client" className="btn-ink">
                <span>Ouvrir mon espace client →</span>
              </Link>

              <Link href="/client/login" className="btn-ink">
                <span>Me connecter</span>
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
            <p className="gazette-label">Ce que vous allez pouvoir faire</p>

            <div
              style={{
                display: "grid",
                gap: "0.6rem",
                color: "var(--ink-soft)",
                lineHeight: 1.6,
              }}
            >
              <p>
                ✅ Déterminer les indicateurs Qualiopi applicables à votre
                profil.
              </p>
              <p>✅ Vérifier vos preuves indicateur par indicateur.</p>
              <p>✅ Identifier les risques de non-conformité.</p>
              <p>✅ Télécharger les modèles utiles selon vos réponses.</p>
              <p>
                ✅ Générer un bilan Excel avec vos notes et pistes de
                correction.
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
            <p className="gazette-label">Bon à savoir</p>

            <p
              style={{
                color: "var(--ink-soft)",
                lineHeight: 1.65,
                marginBottom: "0.7rem",
              }}
            >
              Après l’auto-audit, vous pourrez réserver un audit blanc avec un
              auditeur certifié au tarif réservé de <strong>199 €</strong>.
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
              Votre achat a été confirmé par Stripe. L’accès est lié à l’adresse
              email utilisée pendant le paiement. Vous n’avez pas de mot de
              passe à retenir : la connexion se fait grâce au lien sécurisé reçu
              par email.
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
            <Link href="/client" className="btn-ink">
              <span>Aller à mon espace client</span>
            </Link>

            <Link href="/selen-review" className="btn-ink">
              <span>Retour à Selen Review</span>
            </Link>

            <Link href="/auto-audit-qualiopi" className="btn-ink">
              <span>Retour à la page auto-audit</span>
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

export default function AutoAuditSuccessPage() {
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
        <AutoAuditSuccessContent />
      </Suspense>

      <Footer />
    </main>
  );
}
