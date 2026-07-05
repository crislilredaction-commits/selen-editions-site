import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import Image from "next/image";
import Link from "next/link";

export default function SelenReviewPage() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <ScrollReveal />

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden px-4 md:px-6 pt-16 md:pt-24 pb-14 md:pb-20">
        <div className="pointer-events-none absolute -right-6 top-8 hidden w-28 opacity-90 md:block lg:right-4 lg:w-36 selen-float">
          <Image
            src="/Logo_Selen_Review.png"
            alt=""
            width={160}
            height={160}
            aria-hidden="true"
          />
        </div>

        <div className="mx-auto max-w-5xl text-center reveal is-visible">
          <p className="gazette-label mx-auto w-fit">
            Gazette Selen · Édition Review
          </p>

          <div className="gazette-hero-border mt-6">
            <h1 className="gazette-hero-title text-4xl md:text-6xl">
              Préparer votre audit{" "}
              <span className="gold-shimmer">sans avancer à l’aveugle</span>
            </h1>
          </div>

          <p className="mx-auto mt-6 max-w-3xl text-base md:text-lg leading-8 text-[#5a4031]">
            Selen Review vous aide à faire le point avant votre audit Qualiopi :
            vérifier vos preuves, repérer les écarts, structurer vos corrections
            et choisir le bon niveau d&apos;accompagnement.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row flex-wrap justify-center gap-4">
            <Link href="/auto-audit-qualiopi" className="btn-ink text-center">
              <span>Commencer par l&apos;auto-audit</span>
            </Link>

            <Link
              href="/paiement/auto-audit?offre=unique"
              className="btn-ghost text-center"
            >
              <span>Accéder pour 99 €</span>
            </Link>
          </div>

          <p className="gazette-byline mt-8">
            En autonomie avec l&apos;auto-audit · accompagné avec un auditeur
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="gazette-dot-rule">
          <span>✦</span>
        </div>
      </div>

      {/* ═══ INTRO ═══ */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 py-10 md:py-14">
        <div className="reveal gazette-card p-6 md:p-10">
          <div className="gazette-band" />

          <div className="pt-3">
            <span className="gazette-label">Le principe</span>

            <h2 className="mt-5 font-['Playfair_Display'] text-3xl md:text-4xl font-bold leading-tight">
              Deux façons de préparer
              <br />
              <em className="text-[#8a4b24]">votre audit Qualiopi</em>
            </h2>

            <p className="mt-5 leading-7 md:leading-8 text-[#5a4031]">
              Tout le monde n’a pas besoin du même niveau d’accompagnement. Si
              vous voulez d’abord faire le point seul, l’auto-audit vous guide
              indicateur par indicateur. Si vous voulez un regard humain,
              l’audit blanc accompagné permet de travailler avec un auditeur.
            </p>

            <p className="mt-4 leading-7 md:leading-8 text-[#5a4031]">
              L’idée est simple : vous commencez au bon niveau, sans payer tout
              de suite pour une prestation humaine si vous avez surtout besoin
              d’un premier diagnostic structuré.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ DEUX PARCOURS ═══ */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pb-10 md:pb-14">
        <div className="reveal-stagger grid gap-6 md:grid-cols-2">
          {/* AUTO AUDIT */}
          <article className="gazette-card p-6 md:p-8 border-l-4 border-[#8a4b24]">
            <div className="gazette-band" />

            <div className="pt-2">
              <span className="gazette-label">Parcours 1 · En autonomie</span>

              <h2 className="mt-4 font-['Playfair_Display'] text-3xl md:text-4xl font-bold leading-tight">
                Auto-audit
                <br />
                <em className="text-[#8a4b24]">Qualiopi</em>
              </h2>

              <p className="mt-4 leading-7 text-[#5a4031]">
                Vous avancez seul, à votre rythme, dans un outil guidé. Vous
                répondez aux questions, vous identifiez les indicateurs en
                défaut, vous téléchargez les modèles utiles et vous repartez
                avec un bilan Excel.
              </p>

              <ul className="mt-5 space-y-2 text-[#5a4031]">
                {[
                  "Questionnaire profil pour déterminer les indicateurs applicables",
                  "Vérification de l’usage des marques Qualiopi",
                  "Diagnostic indicateur par indicateur",
                  "Documents modèles proposés selon vos réponses",
                  "Notes personnelles et bilan final exportable",
                  "Accès pendant 3 mois",
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

              <div className="mt-6 border border-[#b28a62]/30 bg-[#f8efdf]/70 p-5 text-center">
                <p className="gazette-byline">Tarif</p>

                <p className="mt-2 font-['Playfair_Display'] text-4xl md:text-5xl font-semibold text-[#3e2a1f]">
                  99{" "}
                  <span className="text-xl md:text-2xl text-[#6e4a32]">€</span>
                </p>

                <p className="mt-2 text-[#6e4a32] text-sm">ou 3 × 33 €</p>
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/paiement/auto-audit?offre=unique"
                  className="btn-ink text-center"
                >
                  <span>Commencer maintenant</span>
                </Link>
              </div>
            </div>
          </article>

          {/* AUDIT BLANC */}
          <article className="gazette-card p-6 md:p-8">
            <div className="gazette-band" />

            <div className="pt-2">
              <span className="gazette-label">
                Parcours 2 · Avec un auditeur
              </span>

              <h2 className="mt-4 font-['Playfair_Display'] text-3xl md:text-4xl font-bold leading-tight">
                Audit blanc
                <br />
                <em className="text-[#8a4b24]">accompagné</em>
              </h2>

              <p className="mt-4 leading-7 text-[#5a4031]">
                Vous travaillez avec un auditeur. L’objectif n’est plus
                seulement de vous auto-évaluer, mais d’obtenir un regard
                extérieur sur vos preuves, vos écarts, vos points faibles et les
                corrections à prioriser.
              </p>

              <ul className="mt-5 space-y-2 text-[#5a4031]">
                {[
                  "Rendez-vous avec un auditeur",
                  "Analyse humaine de votre préparation",
                  "Identification des écarts et points de vigilance",
                  "Conseils concrets pour sécuriser votre dossier",
                  "Rapport d’audit blanc prévu dans l’espace client",
                  "Réservation guidée après paiement",
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

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="border border-[#b28a62]/30 bg-[#f8efdf]/70 p-4 text-center">
                  <p className="gazette-byline">Après auto-audit</p>

                  <p className="mt-2 font-['Playfair_Display'] text-3xl md:text-4xl font-semibold text-[#3e2a1f]">
                    199{" "}
                    <span className="text-lg md:text-xl text-[#6e4a32]">€</span>
                  </p>

                  <p className="mt-2 text-[#6e4a32] text-xs leading-5">
                    Tarif réservé aux clients ayant acheté l&apos;auto-audit.
                  </p>
                </div>

                <div className="border border-[#b28a62]/30 bg-[#f8efdf]/70 p-4 text-center">
                  <p className="gazette-byline">En direct</p>

                  <p className="mt-2 font-['Playfair_Display'] text-3xl md:text-4xl font-semibold text-[#3e2a1f]">
                    397{" "}
                    <span className="text-lg md:text-xl text-[#6e4a32]">€</span>
                  </p>

                  <p className="mt-2 text-[#6e4a32] text-xs leading-5">
                    Sans passage préalable par l&apos;auto-audit.
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t border-[#b28a62]/30 pt-4">
                <p className="font-['EB_Garamond'] italic text-[#8a6243] text-[0.9rem] leading-6">
                  Le tarif réservé de 199 € sera proposé depuis l’espace client
                  aux personnes ayant acheté l’auto-audit.
                </p>

                <div className="mt-5">
                  <Link
                    href="/paiement/audit-blanc"
                    className="btn-ink text-center inline-block"
                  >
                    <span>Réserver un audit blanc directement</span>
                  </Link>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* ═══ COMPARATIF ═══ */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 py-8 md:py-12">
        <div className="reveal mb-8">
          <div className="gazette-section-title text-center justify-center">
            <span className="font-['Cinzel'] text-[0.6rem] md:text-[0.65rem] uppercase tracking-[0.4em] md:tracking-[0.5em] text-[#8a6243] px-4 md:px-6">
              Quel parcours choisir ?
            </span>
          </div>
        </div>

        <div className="reveal-stagger grid gap-5 md:grid-cols-2">
          <article className="gazette-card p-6 md:p-8">
            <div className="gazette-band" />

            <div className="pt-2">
              <span className="gazette-label">Choisissez l’auto-audit si…</span>

              <ul className="mt-5 space-y-3 text-[#5a4031] leading-7">
                <li>✦ Vous voulez d’abord savoir où vous en êtes.</li>
                <li>
                  ✦ Vous avez besoin d’un diagnostic structuré mais autonome.
                </li>
                <li>✦ Vous voulez repérer vos indicateurs en défaut.</li>
                <li>
                  ✦ Vous souhaitez télécharger des modèles et corriger seul.
                </li>
                <li>
                  ✦ Vous voulez préparer un futur audit blanc plus efficacement.
                </li>
              </ul>
            </div>
          </article>

          <article className="gazette-card p-6 md:p-8">
            <div className="gazette-band" />

            <div className="pt-2">
              <span className="gazette-label">
                Choisissez l’audit blanc si…
              </span>

              <ul className="mt-5 space-y-3 text-[#5a4031] leading-7">
                <li>✦ Vous voulez un regard humain sur votre dossier.</li>
                <li>✦ Vous approchez d’un audit officiel.</li>
                <li>
                  ✦ Vous avez besoin qu’un auditeur challenge vos preuves.
                </li>
                <li>✦ Vous voulez un retour structuré et priorisé.</li>
                <li>
                  ✦ Vous préférez être accompagné plutôt que tout vérifier seul.
                </li>
              </ul>
            </div>
          </article>
        </div>
      </section>

      {/* ═══ NOTE PRODUIT FUTUR ═══ */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 py-8 md:py-12">
        <div className="reveal border border-dashed border-[#b28a62]/50 bg-[#f8efdf]/70 p-6 md:p-8">
          <span className="gazette-label">Important</span>

          <h2 className="mt-4 font-['Playfair_Display'] text-2xl md:text-3xl font-bold">
            Se préparer avant l'audit change tout
          </h2>

          <p className="mt-4 leading-7 text-[#5a4031]">
            L'audit blanc Selen permet d'identifier les points à renforcer avant
            le passage de l'auditeur et d'aborder votre audit avec plus de
            sérénité
          </p>
        </div>
      </section>

      {/* ═══ CTA FINAL ═══ */}
      <section className="px-4 md:px-6 pb-16 md:pb-20 pt-4">
        <div className="gazette-cta mx-auto max-w-5xl p-8 md:p-12 text-center reveal is-visible">
          <p className="gazette-label gazette-label--on-dark">Dernière page</p>

          <h2 className="mt-4 font-['Playfair_Display'] text-3xl md:text-4xl font-bold text-[#f8f0e3]">
            Commencer par clarifier votre dossier
          </h2>

          <p className="mx-auto mt-4 max-w-2xl leading-7 text-[#e0d0b8]">
            L’auto-audit vous permet de faire le premier tri avant de demander
            un accompagnement plus poussé.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auto-audit-qualiopi"
              className="btn-ink-light text-center"
            >
              <span>Découvrir l’auto-audit</span>
            </Link>

            <Link
              href="/paiement/auto-audit?offre=unique"
              className="btn-ink-light text-center"
            >
              <span>Accéder pour 99 €</span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
