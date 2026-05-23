"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type OfferKey = "direct" | "reserved_after_auto_audit";

const OFFERS: Record<
  OfferKey,
  {
    key: OfferKey;
    label: string;
    title: string;
    price: string;
    description: string;
    note: string;
  }
> = {
  direct: {
    key: "direct",
    label: "Audit blanc direct",
    title: "Audit blanc Qualiopi accompagné",
    price: "397 €",
    description:
      "Audit blanc accompagné par un auditeur, sans passage préalable par l’auto-audit.",
    note: "Après paiement, vous pourrez réserver votre rendez-vous Calendly depuis votre espace client.",
  },
  reserved_after_auto_audit: {
    key: "reserved_after_auto_audit",
    label: "Après auto-audit",
    title: "Audit blanc Qualiopi au tarif réservé",
    price: "199 €",
    description:
      "Tarif réservé aux clients ayant déjà acheté l’auto-audit Qualiopi.",
    note: "Ce tarif sera accessible depuis l’espace client après l’auto-audit.",
  },
};

function AuditBlancPaymentContent() {
  const searchParams = useSearchParams();

  const selectedOfferKey = useMemo<OfferKey>(() => {
    // Pour l’instant, le paiement public est uniquement l’audit blanc direct.
    // Le tarif réservé après auto-audit sera ajouté depuis l’espace client.
    return "direct";
  }, []);

  const selectedOffer = OFFERS[selectedOfferKey];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startStripeCheckout() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stripe/create-audit-blanc-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offer: selectedOffer.key,
        }),
      });

      const rawResponse = await response.text();

      let data: { url?: string; error?: string } = {};

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
            Réserver votre audit blanc Qualiopi
          </h1>

          <p
            style={{
              color: "var(--sepia-mid)",
              lineHeight: 1.65,
              maxWidth: 760,
            }}
          >
            Après paiement, votre dossier audit blanc sera créé dans votre
            espace client. Vous pourrez ensuite choisir votre rendez-vous
            Calendly.
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
              <p>✅ Rendez-vous avec un auditeur.</p>
              <p>✅ Analyse humaine de votre préparation.</p>
              <p>✅ Identification des écarts et points de vigilance.</p>
              <p>✅ Rapport d’audit blanc transmis dans l’espace client.</p>
              <p>✅ Documents correctifs disponibles selon les besoins.</p>
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
              {selectedOffer.note}
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
              {selectedOffer.label}
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
              Le paiement est sécurisé par Stripe. Votre dossier sera créé après
              validation du paiement.
            </p>
          </article>

          <div style={{ display: "grid", gap: "0.5rem" }}>
            <Link href="/selen-review" className="btn-ink">
              <span>← Retour à Selen Review</span>
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

export default function AuditBlancPaymentPage() {
  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <Header />

      <Suspense
        fallback={
          <div style={{ minHeight: "60vh", padding: "3rem 1.5rem" }}>
            <p style={{ textAlign: "center", color: "var(--ink-faint)" }}>
              Chargement de l’offre audit blanc…
            </p>
          </div>
        }
      >
        <AuditBlancPaymentContent />
      </Suspense>

      <Footer />
    </main>
  );
}
