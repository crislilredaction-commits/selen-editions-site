"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function SelenDailyCheckoutPage() {
  const [clientEmail, setClientEmail] = useState("");
  const [acceptedPricingRule, setAcceptedPricingRule] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/stripe/create-daily-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientEmail, acceptedPricingRule }),
    });
    const data = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok || !data?.url) {
      setError(data?.error ?? "Impossible d'ouvrir le paiement Selen Daily.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <section className="mx-auto max-w-3xl px-4 md:px-6 py-12 md:py-16">
        <article className="gazette-card p-6 md:p-9">
          <div className="gazette-band" />
          <p className="gazette-label">Selen Daily</p>
          <h1 className="mt-4 font-['Playfair_Display'] text-4xl md:text-5xl font-bold">
            Démarrer l&apos;abonnement Daily
          </h1>
          <p className="mt-5 leading-7 text-[#5a4031]">
            Selen Daily est à <strong>89 € TTC/mois</strong> jusqu&apos;à 150
            apprenants par an. À partir du 151e apprenant inscrit sur l&apos;année,
            l&apos;abonnement passera automatiquement à <strong>149 € TTC/mois</strong>.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="font-semibold">Email client</span>
              <input
                value={clientEmail}
                onChange={(event) => setClientEmail(event.target.value)}
                type="email"
                className="border border-[#b28a62]/50 bg-white/60 px-4 py-3"
                placeholder="vous@organisme.fr"
              />
            </label>

            <label className="flex gap-3 leading-6 text-[#5a4031]">
              <input
                type="checkbox"
                checked={acceptedPricingRule}
                onChange={(event) => setAcceptedPricingRule(event.target.checked)}
              />
              <span>
                J&apos;accepte la règle de palier : 89 € TTC/mois jusqu&apos;à 150
                apprenants par an, puis 149 € TTC/mois à partir du 151e apprenant
                inscrit sur l&apos;année.
              </span>
            </label>

            {error ? (
              <p className="border border-[#8a4b24] bg-[#8a4b24]/10 p-3 text-[#8a4b24]">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              className="btn-ink"
              disabled={loading}
              onClick={() => void startCheckout()}
            >
              <span>{loading ? "Ouverture..." : "Payer 89 € TTC / mois"}</span>
            </button>
          </div>
        </article>
      </section>
      <Footer />
    </main>
  );
}
