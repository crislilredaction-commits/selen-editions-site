"use client";

import Image from "next/image";
import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";

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
      <ScrollReveal />

      <section className="relative overflow-hidden px-4 md:px-6 pt-16 md:pt-24 pb-14 md:pb-20">
        <div className="pointer-events-none absolute -right-6 top-8 hidden w-28 opacity-90 md:block lg:right-4 lg:w-36 selen-float-delay">
          <Image
            src="/Logo_Selen_Daily.png"
            alt=""
            width={160}
            height={160}
            aria-hidden="true"
          />
        </div>

        <div className="mx-auto max-w-5xl text-center reveal is-visible">
          <p className="gazette-label mx-auto w-fit">
            Gazette Selen · Édition Daily
          </p>

          <div className="gazette-hero-border mt-6">
            <h1 className="gazette-hero-title text-4xl md:text-6xl">
              Confier votre{" "}
              <span className="gold-shimmer">gestion Qualiopi quotidienne</span>{" "}
              à Selen
            </h1>
          </div>

          <p className="mx-auto mt-6 max-w-3xl text-base md:text-lg leading-8 text-[#5a4031]">
            Selen Daily vous aide à garder vos formations, sessions, documents
            et rappels administratifs dans un cadre clair, avec un agent Selen
            pour suivre les points qui demandent vraiment votre attention.
          </p>

          <p className="gazette-byline mt-8">
            Abonnement mensuel · Suivi humain et structuré
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="gazette-dot-rule">
          <span>✦</span>
        </div>
      </div>

      <section className="mx-auto max-w-5xl px-4 md:px-6 pt-12 md:pt-16 pb-16 md:pb-20">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] items-start">
          <div className="grid gap-6 reveal-stagger is-visible">
            {[
              {
                label: "Organisation",
                title: "Formations et sessions au même endroit",
                text: "Vous renseignez vos formations et sessions, puis Selen vous aide à préparer les éléments administratifs au bon moment.",
              },
              {
                label: "Suivi",
                title: "Un agent Selen garde le fil",
                text: "Votre agent vérifie les documents, suit les retours et vous rappelle uniquement les actions qui nécessitent votre intervention.",
              },
              {
                label: "Rythme",
                title: "Des rappels utiles sans surcharge",
                text: "Les étapes importantes restent visibles, sans multiplier les notifications inutiles.",
              },
            ].map((item) => (
              <article key={item.title} className="gazette-card p-6">
                <div className="gazette-band" />
                <p className="gazette-label">{item.label}</p>
                <h2 className="mt-3 font-['Playfair_Display'] text-2xl md:text-3xl font-bold">
                  {item.title}
                </h2>
                <p className="mt-4 leading-7 text-[#5a4031]">{item.text}</p>
              </article>
            ))}
          </div>

          <article className="gazette-card p-6 md:p-9 reveal is-visible">
            <div className="gazette-band" />
            <div className="gazette-seal">
              <span>
                Daily
                <br />
                suivi
                <br />✦
              </span>
            </div>

            <p className="gazette-label">Selen Daily</p>
            <h2 className="mt-4 font-['Playfair_Display'] text-3xl md:text-4xl font-bold">
              Démarrer l&apos;abonnement
            </h2>
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
                  onChange={(event) =>
                    setAcceptedPricingRule(event.target.checked)
                  }
                />
                <span>
                  J&apos;accepte la règle de palier : 89 € TTC/mois jusqu&apos;à
                  150 apprenants par an, puis 149 € TTC/mois à partir du 151e
                  apprenant inscrit sur l&apos;année.
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
        </div>
      </section>
      <Footer />
    </main>
  );
}
