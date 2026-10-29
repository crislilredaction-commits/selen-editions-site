"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DiscountCodeBox, {
  type AppliedDiscount,
} from "@/components/DiscountCodeBox";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type OfferKey = "unique" | "trois-fois";

type Offer = {
  key: OfferKey;
  label: string;
  title: string;
  price: string;
  amountCents: number;
  description: string;
  stripeModeLabel: string;
};

const OFFERS: Record<OfferKey, Offer> = {
  unique: {
    key: "unique",
    label: "Paiement unique",
    title: "Auto-audit Qualiopi",
    price: "99 €",
    amountCents: 9900,
    description: "Accès complet à l’auto-audit Qualiopi pendant 3 mois.",
    stripeModeLabel: "Paiement en une fois",
  },
  "trois-fois": {
    key: "trois-fois",
    label: "Paiement en 3 fois",
    title: "Auto-audit Qualiopi",
    price: "3 × 33 €",
    amountCents: 9900,
    description: "Même accès complet pendant 3 mois, avec paiement fractionné.",
    stripeModeLabel: "Paiement fractionné",
  },
};

function AutoAuditPaymentContent() {
  const searchParams = useSearchParams();

  const selectedOfferKey = useMemo<OfferKey>(() => {
    const offer = searchParams.get("offre");

    if (offer === "trois-fois") return "trois-fois";

    return "unique";
  }, [searchParams]);

  const selectedOffer = OFFERS[selectedOfferKey];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [discount, setDiscount] = useState<AppliedDiscount | null>(null);

  async function startStripeCheckout() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stripe/create-auto-audit-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offer: selectedOffer.key,
          clientEmail,
          discountCode: discount?.code ?? null,
        }),
      });

      const rawResponse = await response.text();

      let data: { url?: string; freeRedirectUrl?: string; error?: string } = {};

      try {
        data = JSON.parse(rawResponse);
      } catch {
        throw new Error(
          `La route Stripe n'a pas renvoyé du JSON. Réponse reçue : ${rawResponse.slice(
            0,
            180,
          )}`,
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Impossible de démarrer le paiement Stripe pour le moment.",
        );
      }

      if (data?.freeRedirectUrl) {
        window.location.href = data.freeRedirectUrl;
        return;
      }

      if (!data?.url) {
        throw new Error("Stripe n’a pas retourné de lien de paiement.");
      }

      window.location.href = data.url;
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Une erreur est survenue pendant la préparation du paiement.",
      );
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        padding: "2rem 1.5rem 4rem",
      }}
    >
      <header
        className="gazette-cta"
        style={{ padding: "2rem", marginBottom: "1.5rem" }}
      >
        <div style={{ position: "relative", zIndex: 1 }}>
          <p className="gazette-label">Paiement sécurisé</p>

          <h1
            className="gazette-hero-title"
            style={{ color: "var(--parchment)", marginBottom: "0.5rem" }}
          >
            Finaliser votre accès à l’auto-audit Qualiopi
          </h1>

          <p
            style={{
              color: "var(--sepia-mid)",
              lineHeight: 1.65,
              maxWidth: 760,
            }}
          >
            Après validation du paiement, votre espace client sera activé et
            vous pourrez accéder à l’auto-audit pendant 3 mois.
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
              borderLeft: "4px solid var(--ocre-dark)",
              padding: "1.2rem",
            }}
          >
            <p className="gazette-label">Offre sélectionnée</p>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.4rem" }}>
              {selectedOffer.title}
            </h2>

            <p
              style={{
                fontSize: "2.2rem",
                color: "var(--ocre-dark)",
                fontWeight: 700,
                margin: "0.2rem 0",
              }}
            >
              {selectedOffer.price}
            </p>

            <p
              style={{
                color: "var(--ink-soft)",
                lineHeight: 1.6,
                marginBottom: "1rem",
              }}
            >
              {selectedOffer.description}
            </p>

            <div
              style={{
                display: "grid",
                gap: "0.7rem",
                color: "var(--ink-soft)",
                lineHeight: 1.6,
              }}
            >
              <p>✅ Accès pendant 3 mois.</p>
              <p>✅ Questionnaire profil et indicateurs applicables.</p>
              <p>✅ Diagnostic par indicateur.</p>
              <p>✅ Documents modèles selon les non-conformités détectées.</p>
              <p>✅ Bilan final et export Excel de votre plan d’action.</p>
              <p>
                ✅ Tarif réservé de 199 € pour l’audit blanc après auto-audit.
              </p>
            </div>
          </article>

          <article
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1.2rem",
            }}
          >
            <p className="gazette-label">Changer d’option</p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.8rem",
              }}
            >
              {Object.values(OFFERS).map((offer) => {
                const isSelected = offer.key === selectedOffer.key;

                return (
                  <Link
                    key={offer.key}
                    href={`/paiement/auto-audit?offre=${offer.key}`}
                    style={{
                      display: "block",
                      textDecoration: "none",
                      border: isSelected
                        ? "2px solid var(--ocre-gold)"
                        : "1px solid var(--sepia-mid)",
                      background: isSelected
                        ? "rgba(201,160,85,0.12)"
                        : "rgba(255,255,255,0.28)",
                      padding: "1rem",
                      color: "var(--ink-soft)",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: "var(--font-cinzel)",
                        fontSize: "0.58rem",
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--ocre-dark)",
                        marginBottom: "0.4rem",
                      }}
                    >
                      {offer.label}
                    </p>

                    <p
                      style={{
                        fontSize: "1.4rem",
                        color: "var(--ink)",
                        fontWeight: 700,
                        marginBottom: "0.35rem",
                      }}
                    >
                      {offer.price}
                    </p>

                    <p style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
                      {offer.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </article>

          <article
            style={{
              background: "rgba(178,138,98,0.08)",
              border: "1px dashed var(--sepia-mid)",
              padding: "1.2rem",
            }}
          >
            <p className="gazette-label">Après le paiement</p>

            <p style={{ color: "var(--ink-soft)", lineHeight: 1.7 }}>
              Une fois le paiement validé via Stripe, votre compte client sera
              créé ou activé automatiquement. Vous recevrez vos informations
              d’accès et pourrez commencer votre auto-audit depuis l’espace
              client.
            </p>
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
              borderLeft: "4px solid var(--ocre-gold)",
              padding: "1.2rem",
            }}
          >
            <p className="gazette-label">Récapitulatif</p>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.4rem" }}>
              {selectedOffer.stripeModeLabel}
            </h2>

            <p
              style={{
                fontSize: "2rem",
                color: "var(--ocre-dark)",
                fontWeight: 700,
                margin: "0.2rem 0 0.8rem",
              }}
            >
              {selectedOffer.price}
            </p>

            <p
              style={{
                color: "var(--ink-faint)",
                fontSize: "0.9rem",
                lineHeight: 1.5,
                marginBottom: "1rem",
              }}
            >
              Accès à l’auto-audit Qualiopi pendant 3 mois.
            </p>

            <DiscountCodeBox
              amountCents={selectedOffer.amountCents}
              clientEmail={clientEmail}
              onClientEmailChange={setClientEmail}
              discount={discount}
              onDiscountChange={setDiscount}
            />

            <button
              type="button"
              className="btn-ink"
              onClick={startStripeCheckout}
              disabled={loading}
              style={{
                width: "100%",
                opacity: loading ? 0.55 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              <span>
                {loading ? "Préparation du paiement…" : "Payer avec Stripe"}
              </span>
            </button>

            <p
              style={{
                color: "var(--ink-faint)",
                fontSize: "0.8rem",
                lineHeight: 1.45,
                marginTop: "0.8rem",
              }}
            >
              Le paiement est sécurisé par Stripe. Vos accès seront activés
              après validation du paiement.
            </p>
          </article>

          <div style={{ display: "grid", gap: "0.5rem" }}>
            <Link href="/selen-review" className="btn-ink">
              <span>← Retour à Selen Review</span>
            </Link>

            <Link href="/auto-audit-qualiopi" className="btn-ink">
              <span>Retour à la page auto-audit</span>
            </Link>

            <Link href="/nos-prestations" className="btn-ink">
              <span>Retour aux prestations</span>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function AutoAuditPaymentPage() {
  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <Header />

      <Suspense
        fallback={
          <div style={{ minHeight: "60vh", padding: "3rem 1.5rem" }}>
            <p style={{ textAlign: "center", color: "var(--ink-faint)" }}>
              Chargement de l’offre…
            </p>
          </div>
        }
      >
        <AutoAuditPaymentContent />
      </Suspense>

      <Footer />
    </main>
  );
}
