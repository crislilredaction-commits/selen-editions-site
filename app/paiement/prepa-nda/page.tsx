"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { useState } from "react";

export default function PrepaNdaPaymentPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startStripeCheckout() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stripe/create-prepa-nda-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />

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
              Finaliser votre Prépa NDA
            </h1>

            <p
              style={{
                color: "var(--sepia-mid)",
                lineHeight: 1.65,
                maxWidth: 760,
              }}
            >
              Après validation du paiement, votre espace client sera activé et
              votre dossier Prépa NDA sera créé automatiquement.
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
                Prépa NDA - Déclaration d’activité
              </h2>

              <p
                style={{
                  fontSize: "2.2rem",
                  color: "var(--ocre-dark)",
                  fontWeight: 700,
                  margin: "0.2rem 0",
                }}
              >
                390 €
              </p>

              <p
                style={{
                  color: "var(--ink-soft)",
                  lineHeight: 1.6,
                  marginBottom: "1rem",
                }}
              >
                Accompagnement à la préparation du dossier de déclaration
                d’activité d’un organisme de formation.
              </p>

              <div
                style={{
                  display: "grid",
                  gap: "0.7rem",
                  color: "var(--ink-soft)",
                  lineHeight: 1.6,
                }}
              >
                <p>✅ Vérification des pièces de départ.</p>
                <p>✅ Analyse et reformulation du programme si nécessaire.</p>
                <p>✅ Préparation des documents à signer.</p>
                <p>✅ Guidage pour le dépôt sur Mon Activité Formation.</p>
                <p>✅ Suivi en cas de demande ou de refus DREETS.</p>
              </div>
            </article>

            <article
              style={{
                background: "rgba(248,239,223,0.7)",
                border: "1px solid rgba(178,138,98,0.35)",
                padding: "1.2rem",
              }}
            >
              <p className="gazette-label">Après le paiement</p>

              <h2 style={{ color: "var(--ink)", marginTop: "0.4rem" }}>
                Votre dossier sera ouvert automatiquement
              </h2>

              <p
                style={{
                  color: "var(--ink-soft)",
                  lineHeight: 1.7,
                  marginTop: "0.8rem",
                }}
              >
                Vous recevrez un email avec votre lien d’accès à l’espace client
                Selen. Vous pourrez ensuite déposer les premiers éléments
                nécessaires à la préparation du dossier NDA.
              </p>
            </article>
          </section>

          <aside
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1.2rem",
              position: "sticky",
              top: 96,
            }}
          >
            <p className="gazette-label">Récapitulatif</p>

            <h2
              style={{
                color: "var(--ink)",
                fontFamily: "var(--font-serif)",
                fontSize: "1.6rem",
                marginTop: "0.4rem",
              }}
            >
              Prépa NDA
            </h2>

            <div
              style={{
                borderTop: "1px solid rgba(178,138,98,0.35)",
                borderBottom: "1px solid rgba(178,138,98,0.35)",
                margin: "1rem 0",
                padding: "1rem 0",
                display: "grid",
                gap: "0.7rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Prestation</span>
                <strong>390 €</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Total</span>
                <strong>390 €</strong>
              </div>
            </div>

            <button
              type="button"
              className="btn-ink"
              onClick={startStripeCheckout}
              disabled={loading}
              style={{
                width: "100%",
                justifyContent: "center",
                opacity: loading ? 0.7 : 1,
                cursor: loading ? "wait" : "pointer",
              }}
            >
              <span>
                {loading
                  ? "Préparation du paiement..."
                  : "Payer et ouvrir mon dossier"}
              </span>
            </button>

            <p
              style={{
                color: "var(--ink-soft)",
                fontSize: "0.85rem",
                lineHeight: 1.55,
                marginTop: "0.9rem",
              }}
            >
              Paiement sécurisé par Stripe. Selen ne conserve pas vos données de
              carte bancaire.
            </p>

            <div style={{ marginTop: "1rem" }}>
              <Link href="/prepa-nda" style={{ color: "var(--rust)" }}>
                ← Retour à la présentation de l’offre
              </Link>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </main>
  );
}
