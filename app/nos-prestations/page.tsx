import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";

export default function PrestationsPage() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <ScrollReveal />

      {/* ═══ HERO ═══ */}
      <section className="relative border-b border-[#b28a62]/40 pb-10 md:pb-14 pt-8 md:pt-10 text-center">
        <div className="gazette-masthead-rule px-4 md:px-6 mb-5 max-w-4xl mx-auto">
          <span className="font-['Cinzel'] text-[0.52rem] md:text-[0.58rem] uppercase tracking-[0.4em] text-[#8a6243]">
            Édition spéciale · Nos prestations
          </span>
        </div>

        <h1 className="font-['Playfair_Display'] text-4xl sm:text-5xl md:text-7xl font-black text-[#3e2a1f] px-4">
          Nos prestations
          <sup className="text-xl md:text-2xl text-[#b28a62] ml-1">✨</sup>
        </h1>

        <div className="gazette-masthead-rule mt-5 max-w-xs md:max-w-3xl mx-auto px-4 md:px-6">
          <span className="font-['EB_Garamond'] text-sm italic text-[#6e4a32] px-3">
            Des accompagnements pensés pour avancer avec clarté
          </span>
        </div>

        <p className="mx-auto mt-5 max-w-2xl px-5 text-base md:text-lg leading-7 md:leading-8 text-[#5a4031]">
          Pour les organismes de formation qui veulent avancer avec plus de
          clarté… et beaucoup moins de brouillard administratif.
        </p>
      </section>

      {/* ═══ GRID PRESTATIONS ═══ */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pb-16 md:pb-20 pt-10 md:pt-14">
        <div className="reveal-stagger grid gap-8 md:gap-10 md:grid-cols-2">
          {/* REVIEW */}
          <article className="gazette-card relative p-6 md:p-10">
            <div className="gazette-band" />

            <div className="pt-4">
              <div className="flex items-center gap-3 md:gap-4 mb-5">
                <img
                  src="/Logo_Selen_Review.png"
                  className="w-16 md:w-24 selen-float selen-hover"
                  alt="Selen Review"
                />
                <div>
                  <span className="gazette-label block mb-2">
                    Accompagnement
                  </span>
                  <h2 className="font-['Playfair_Display'] text-2xl md:text-4xl font-bold">
                    Selen Review
                  </h2>
                </div>
              </div>
              <p className="leading-7 text-[#5a4031] text-[0.95rem]">
                Audit blanc Qualiopi pour identifier clairement les écarts avant
                le passage de l'auditeur.
              </p>
              <ul className="mt-5 space-y-2 text-[#5a4031]">
                {[
                  "Analyse des documents",
                  "Vérification des indicateurs",
                  "Identification des écarts",
                  "Recommandations concrètes",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-[0.9rem]"
                  >
                    <span className="text-[#b28a62] text-xs shrink-0">✦</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-6 border border-[#b28a62]/30 bg-white/40 p-5 text-center">
                <p className="gazette-byline">Tarif</p>
                <p className="mt-2 font-['Playfair_Display'] text-4xl md:text-5xl font-semibold text-[#3e2a1f]">
                  397{" "}
                  <span className="text-xl md:text-2xl text-[#6e4a32]">€</span>
                </p>
              </div>
            </div>
          </article>

          {/* PREPA */}
          <article className="gazette-card relative p-6 md:p-10">
            <div className="gazette-band" />

            <div className="pt-4">
              <div className="flex items-center gap-3 md:gap-4 mb-5">
                <img
                  src="/Logo_Selen_Prepa.png"
                  className="w-16 md:w-24 selen-float-delay selen-hover"
                  alt="Selen Prepa"
                />
                <div>
                  <span className="gazette-label block mb-2">
                    Accompagnement
                  </span>
                  <h2 className="font-['Playfair_Display'] text-2xl md:text-4xl font-bold">
                    Selen Prepa
                  </h2>
                </div>
              </div>
              <p className="leading-7 text-[#5a4031] text-[0.95rem]">
                Mise en place d'un système administratif conforme clé en main.
              </p>
              <ul className="mt-5 space-y-2 text-[#5a4031]">
                {[
                  "Documents structurés et conformes",
                  "Accompagnement à la constitution du dossier",
                  "Préparation complète à l'audit",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-[0.9rem]"
                  >
                    <span className="text-[#b28a62] text-xs shrink-0">✦</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-6 border border-[#b28a62]/30 bg-white/40 p-5 text-center">
                <p className="gazette-byline">Tarif</p>
                <p className="mt-2 font-['Playfair_Display'] text-4xl md:text-5xl font-semibold text-[#3e2a1f]">
                  900{" "}
                  <span className="text-xl md:text-2xl text-[#6e4a32]">€</span>
                </p>
              </div>
            </div>
          </article>

          {/* DAILY — full width */}
          <article className="gazette-card relative p-6 md:p-10 md:col-span-2">
            <div className="gazette-band" />

            <div className="pt-4">
              <div className="flex items-center gap-3 md:gap-4 mb-5 md:justify-center">
                <img
                  src="/Logo_Selen_Daily.png"
                  className="w-16 md:w-28 selen-float-delay selen-hover"
                  alt="Selen Daily"
                />
                <div>
                  <span className="gazette-label block mb-2">
                    Service récurrent
                  </span>
                  <h2 className="font-['Playfair_Display'] text-2xl md:text-4xl font-bold">
                    Selen Daily
                  </h2>
                </div>
              </div>
              <p className="md:text-center leading-7 text-[#5a4031] text-[0.95rem] md:max-w-xl md:mx-auto">
                Gestion administrative quotidienne avec un agent dédié — pour
                vous recentrer sur votre vrai métier.
              </p>
              <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#5a4031] md:max-w-xl md:mx-auto">
                {[
                  "Création et envoi des documents",
                  "Relances apprenants",
                  "Suivi administratif complet",
                  "Classement et organisation",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-[0.9rem]"
                  >
                    <span className="text-[#b28a62] text-xs shrink-0">✦</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-6 border border-[#b28a62]/30 bg-white/40 p-5">
                <p className="gazette-byline text-center mb-4">Tarifs</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 text-center">
                  {[
                    { volume: "< 25 apprenants/mois", price: "160 €" },
                    { volume: "< 50 apprenants/mois", price: "320 €" },
                    { volume: "> 50 apprenants/mois", price: "560 €" },
                    { volume: "Volume supérieur", price: "Sur devis" },
                  ].map(({ volume, price }) => (
                    <div
                      key={volume}
                      className="border border-[#b28a62]/20 bg-white/30 p-3 md:p-4"
                    >
                      <p className="text-[0.72rem] md:text-[0.78rem] text-[#6e4a32] leading-4 md:leading-5">
                        {volume}
                      </p>
                      <p className="mt-2 font-['Playfair_Display'] text-xl md:text-2xl font-semibold text-[#3e2a1f]">
                        {price}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>

          {/* NEWS */}
          <article className="relative border border-dashed border-[#b28a62]/50 bg-[#f8efdf]/60 p-6 md:p-10 opacity-80">
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/Logo_Selen_News.png"
                className="w-14 md:w-20 selen-float-delay2 selen-hover"
                alt="Selen News"
              />
              <div>
                <span className="gazette-label block mb-2">Veille</span>
                <h2 className="font-['Playfair_Display'] text-2xl md:text-3xl font-bold">
                  Selen News
                </h2>
              </div>
            </div>
            <p className="leading-7 text-[#5a4031] text-[0.93rem]">
              Outil de veille pour suivre les évolutions du secteur formation.
            </p>
            <p className="mt-4 font-['EB_Garamond'] italic text-[#8a6243] text-[0.88rem]">
              — Offre prévue prochainement.
            </p>
          </article>

          {/* STUDIO */}
          <article className="relative border border-dashed border-[#b28a62]/50 bg-[#f8efdf]/60 p-6 md:p-10 opacity-80">
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/Logo_Selen_Studio.png"
                className="w-14 md:w-20 selen-float selen-hover"
                alt="Selen Studio"
              />
              <div>
                <span className="gazette-label block mb-2">Plateforme</span>
                <h2 className="font-['Playfair_Display'] text-2xl md:text-3xl font-bold">
                  Selen Studio
                </h2>
              </div>
            </div>
            <p className="leading-7 text-[#5a4031] text-[0.93rem]">
              Plateforme complète centralisant la gestion, l'audit blanc et la
              veille.
            </p>
            <p className="mt-4 font-['EB_Garamond'] italic text-[#8a6243] text-[0.88rem]">
              — Disponible plus tard.
            </p>
          </article>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="mx-auto max-w-5xl px-4 md:px-6 pb-20 md:pb-24">
        <div className="reveal relative overflow-hidden border border-[#bfa77f] bg-[#3e2a1f] px-6 md:px-10 py-12 md:py-16 text-center shadow-[0_30px_80px_rgba(62,42,31,0.35)]">
          <div className="pointer-events-none absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,#d6b98a,transparent_60%)]" />
          <h2 className="relative font-['Playfair_Display'] text-3xl md:text-5xl font-bold leading-tight text-[#f7ead6]">
            Parlons simplement
            <br />
            <em className="text-[#d4a85c] not-italic">de votre situation ✨</em>
          </h2>
          <p className="relative mx-auto mt-5 max-w-xl text-base md:text-lg leading-7 md:leading-8 text-[#e6d5bb]">
            Un échange rapide peut souvent faire gagner{" "}
            <strong>des semaines de flou administratif.</strong>
          </p>
          <a
            href="https://calendly.com/romaric-paymal/rdv-romaric-paymal"
            target="_blank"
            rel="noreferrer"
            className="relative mt-8 inline-flex items-center justify-center rounded-full bg-[#d4a85c] px-8 py-4 font-semibold text-[#3e2a1f] shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition-all duration-300 hover:-translate-y-1 w-full sm:w-auto"
          >
            Réserver un appel
          </a>
        </div>
      </section>

      <Footer />
    </main>
  );
}
