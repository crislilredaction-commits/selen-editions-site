import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import Link from "next/link";

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
            Un catalogue clair, à ouvrir selon vos besoins
          </span>
        </div>

        <p className="mx-auto mt-5 max-w-2xl px-5 text-base md:text-lg leading-7 md:leading-8 text-[#5a4031]">
          Auto-audit, audit blanc, préparation Qualiopi, gestion quotidienne,
          veille ou plateforme complète : ouvrez uniquement les rubriques qui
          vous concernent.
        </p>
      </section>

      {/* ═══ CATALOGUE EN DÉROULANT ═══ */}
      <section className="mx-auto max-w-5xl px-4 md:px-6 pb-16 md:pb-20 pt-10 md:pt-14">
        <div className="reveal-stagger space-y-5">
          {/* SELEN REVIEW */}
          <details className="gazette-card relative overflow-hidden p-0 group">
            <summary className="cursor-pointer list-none p-6 md:p-8">
              <div className="gazette-band" />

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 md:gap-4">
                  <img
                    src="/Logo_Selen_Review.png"
                    className="w-16 md:w-24 selen-float selen-hover"
                    alt="Selen Review"
                  />

                  <div>
                    <span className="gazette-label block mb-2">
                      Préparation à l&apos;audit
                    </span>

                    <h2 className="font-['Playfair_Display'] text-2xl md:text-4xl font-bold">
                      Selen Review
                    </h2>

                    <p className="mt-2 text-[#6e4a32] text-sm md:text-base">
                      Préparer votre audit Qualiopi en autonomie ou accompagné
                      par un auditeur.
                    </p>
                  </div>
                </div>

                <span className="text-[#8a6243] font-['Cinzel'] text-xs uppercase tracking-[0.25em]">
                  Déplier
                </span>
              </div>
            </summary>

            <div className="px-6 md:px-8 pb-8 md:pb-10">
              <div className="border-t border-[#b28a62]/30 pt-6">
                <p className="leading-7 text-[#5a4031] text-[0.98rem] md:max-w-3xl">
                  Selen Review regroupe les solutions de préparation à
                  l&apos;audit. Vous pouvez commencer seul avec
                  l&apos;auto-audit Qualiopi, puis demander un audit blanc
                  accompagné si vous souhaitez sécuriser votre dossier avec un
                  regard humain.
                </p>

                <div className="mt-7 grid gap-5 md:grid-cols-2">
                  <div className="border border-[#b28a62]/30 bg-white/40 p-5 md:p-6">
                    <span className="gazette-label">En autonomie</span>

                    <h3 className="mt-3 font-['Playfair_Display'] text-2xl md:text-3xl font-bold">
                      Auto-audit Qualiopi
                    </h3>

                    <p className="mt-3 leading-7 text-[#5a4031] text-[0.93rem]">
                      Un outil guidé pour vérifier vos indicateurs, repérer les
                      risques de non-conformité, télécharger les modèles utiles
                      et générer votre bilan final.
                    </p>

                    <ul className="mt-5 space-y-2 text-[#5a4031]">
                      {[
                        "Questionnaire profil et indicateurs applicables",
                        "Diagnostic indicateur par indicateur",
                        "Documents modèles selon vos réponses",
                        "Notes personnelles et bilan final Excel",
                        "Accès pendant 3 mois",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-3 text-[0.9rem]"
                        >
                          <span className="text-[#b28a62] text-xs shrink-0">
                            ✦
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-6 border border-[#b28a62]/30 bg-[#f8efdf]/70 p-5 text-center">
                      <p className="gazette-byline">Tarif</p>

                      <p className="mt-2 font-['Playfair_Display'] text-4xl md:text-5xl font-semibold text-[#3e2a1f]">
                        99{" "}
                        <span className="text-xl md:text-2xl text-[#6e4a32]">
                          €
                        </span>
                      </p>

                      <p className="mt-2 text-[#6e4a32] text-sm">ou 3 × 33 €</p>
                    </div>

                    <div className="mt-5 flex flex-col sm:flex-row gap-3">
                      <Link
                        href="/selen-review"
                        className="btn-ink text-center"
                      >
                        <span>Voir Selen Review</span>
                      </Link>

                      <Link
                        href="/paiement/auto-audit?offre=unique"
                        className="btn-ink text-center"
                      >
                        <span>Accéder pour 99 €</span>
                      </Link>
                    </div>
                  </div>

                  <div className="border border-[#b28a62]/30 bg-white/40 p-5 md:p-6">
                    <span className="gazette-label">Avec un auditeur</span>

                    <h3 className="mt-3 font-['Playfair_Display'] text-2xl md:text-3xl font-bold">
                      Audit blanc accompagné
                    </h3>

                    <p className="mt-3 leading-7 text-[#5a4031] text-[0.93rem]">
                      Un auditeur analyse votre situation, échange avec vous,
                      relève les écarts et vous remet un retour structuré pour
                      préparer votre audit plus sereinement.
                    </p>

                    <ul className="mt-5 space-y-2 text-[#5a4031]">
                      {[
                        "Rendez-vous avec un auditeur",
                        "Analyse humaine de votre préparation",
                        "Identification des écarts et points de vigilance",
                        "Conseils concrets pour sécuriser le dossier",
                        "Rapport d’audit blanc dans l’espace client à venir",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-3 text-[0.9rem]"
                        >
                          <span className="text-[#b28a62] text-xs shrink-0">
                            ✦
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <div className="border border-[#b28a62]/30 bg-[#f8efdf]/70 p-4 text-center">
                        <p className="gazette-byline">Après auto-audit</p>

                        <p className="mt-2 font-['Playfair_Display'] text-3xl md:text-4xl font-semibold text-[#3e2a1f]">
                          199{" "}
                          <span className="text-lg md:text-xl text-[#6e4a32]">
                            €
                          </span>
                        </p>

                        <p className="mt-2 text-[#6e4a32] text-xs leading-5">
                          Tarif réservé aux clients ayant réalisé
                          l&apos;auto-audit.
                        </p>
                      </div>

                      <div className="border border-[#b28a62]/30 bg-[#f8efdf]/70 p-4 text-center">
                        <p className="gazette-byline">En direct</p>

                        <p className="mt-2 font-['Playfair_Display'] text-3xl md:text-4xl font-semibold text-[#3e2a1f]">
                          397{" "}
                          <span className="text-lg md:text-xl text-[#6e4a32]">
                            €
                          </span>
                        </p>

                        <p className="mt-2 text-[#6e4a32] text-xs leading-5">
                          Sans passage préalable par l&apos;auto-audit.
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 border-t border-[#b28a62]/30 pt-4">
                      <p className="font-['EB_Garamond'] italic text-[#8a6243] text-[0.9rem] leading-6">
                        Le tarif réservé de 199 € sera proposé depuis l’espace
                        client aux personnes ayant acheté l’auto-audit.
                      </p>

                      <div className="mt-5">
                        <Link
                          href="/paiement/audit-blanc"
                          className="btn-ink text-center inline-block"
                        >
                          <span>Réserver un audit blanc direct — 397 €</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </details>

          {/* SELEN PREPA */}
          <details className="gazette-card relative overflow-hidden p-0 group">
            <summary className="cursor-pointer list-none p-6 md:p-8">
              <div className="gazette-band" />

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 md:gap-4">
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

                    <p className="mt-2 text-[#6e4a32] text-sm md:text-base">
                      Préparer votre déclaration d’activité ou votre audit
                      Qualiopi avec un accompagnement humain.
                    </p>
                  </div>
                </div>

                <span className="text-[#8a6243] font-['Cinzel'] text-xs uppercase tracking-[0.25em]">
                  Déplier
                </span>
              </div>
            </summary>

            <div className="px-6 md:px-8 pb-8 md:pb-10">
              <div className="border-t border-[#b28a62]/30 pt-6">
                <p className="leading-7 text-[#5a4031] text-[0.95rem]">
                  Selen Prepa accompagne les formateurs et petits organismes de
                  formation dans les étapes sensibles : obtenir un numéro de
                  déclaration d’activité, structurer un dossier conforme ou
                  préparer un audit Qualiopi avec méthode.
                </p>

                <div className="mt-6 grid gap-5 lg:grid-cols-3">
                  <article className="border border-[#b28a62]/30 bg-white/45 p-5">
                    <p className="gazette-label">Déclaration d’activité</p>

                    <h3 className="mt-3 font-['Playfair_Display'] text-2xl md:text-3xl font-bold">
                      Prépa NDA
                    </h3>

                    <p className="mt-3 leading-7 text-[#5a4031] text-[0.93rem]">
                      Pour les formateurs qui veulent obtenir leur numéro de
                      déclaration d’activité sans se perdre dans les pièces, les
                      codes, les documents à signer et la procédure DREETS.
                    </p>

                    <ul className="mt-5 space-y-2 text-[#5a4031]">
                      {[
                        "Vérification des pièces de départ",
                        "Relecture et reformulation du programme",
                        "Préparation des documents à signer",
                        "Guidage pour le dépôt sur Mon Activité Formation",
                        "Suivi en cas de demande ou de refus DREETS",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-3 text-[0.9rem]"
                        >
                          <span className="text-[#b28a62] text-xs shrink-0">
                            ✦
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-6 border border-[#b28a62]/30 bg-[#f8efdf]/70 p-4 text-center">
                      <p className="gazette-byline">Tarif</p>

                      <p className="mt-2 font-['Playfair_Display'] text-4xl font-semibold text-[#3e2a1f]">
                        390 <span className="text-xl text-[#6e4a32]">€</span>
                      </p>
                    </div>

                    <div className="mt-5 flex flex-col gap-3">
                      <Link href="/prepa-nda" className="btn-ink text-center">
                        <span>Découvrir la Prépa NDA</span>
                      </Link>

                      <Link
                        href="/paiement/prepa-nda"
                        className="btn-ink text-center"
                      >
                        <span>Acheter la Prépa NDA — 390 €</span>
                      </Link>
                    </div>
                  </article>

                  <article className="border border-[#b28a62]/30 bg-white/35 p-5">
                    <p className="gazette-label">Audit initial</p>

                    <h3 className="mt-3 font-['Playfair_Display'] text-2xl md:text-3xl font-bold">
                      Prépa Qualiopi initial
                    </h3>

                    <p className="mt-3 leading-7 text-[#5a4031] text-[0.93rem]">
                      Pour structurer votre organisme avant un premier audit
                      Qualiopi : documents, preuves, organisation et logique de
                      conformité.
                    </p>

                    <ul className="mt-5 space-y-2 text-[#5a4031]">
                      {[
                        "Documents structurés et conformes",
                        "Accompagnement à la constitution du dossier",
                        "Préparation complète à l’audit initial",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-3 text-[0.9rem]"
                        >
                          <span className="text-[#b28a62] text-xs shrink-0">
                            ✦
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-6 border border-[#b28a62]/30 bg-[#f8efdf]/70 p-4 text-center">
                      <p className="gazette-byline">Tarif</p>

                      <p className="mt-2 font-['Playfair_Display'] text-4xl font-semibold text-[#3e2a1f]">
                        900 <span className="text-xl text-[#6e4a32]">€</span>
                      </p>
                    </div>
                  </article>

                  <article className="border border-[#b28a62]/30 bg-white/35 p-5">
                    <p className="gazette-label">
                      Surveillance ou renouvellement
                    </p>

                    <h3 className="mt-3 font-['Playfair_Display'] text-2xl md:text-3xl font-bold">
                      Prépa Qualiopi avancée
                    </h3>

                    <p className="mt-3 leading-7 text-[#5a4031] text-[0.93rem]">
                      Pour les organismes déjà certifiés qui doivent préparer un
                      audit de surveillance, de renouvellement ou remettre de
                      l’ordre dans leurs preuves.
                    </p>

                    <ul className="mt-5 space-y-2 text-[#5a4031]">
                      {[
                        "Revue des preuves existantes",
                        "Identification des écarts",
                        "Préparation du dossier d’audit",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-3 text-[0.9rem]"
                        >
                          <span className="text-[#b28a62] text-xs shrink-0">
                            ✦
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-6 border border-[#b28a62]/30 bg-[#f8efdf]/70 p-4 text-center">
                      <p className="gazette-byline">Tarif</p>

                      <p className="mt-2 font-['Playfair_Display'] text-4xl font-semibold text-[#3e2a1f]">
                        1200 <span className="text-xl text-[#6e4a32]">€</span>
                      </p>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </details>

          {/* SELEN DAILY */}
          <details className="gazette-card relative overflow-hidden p-0 group">
            <summary className="cursor-pointer list-none p-6 md:p-8">
              <div className="gazette-band" />

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 md:gap-4">
                  <img
                    src="/Logo_Selen_Daily.png"
                    className="w-16 md:w-24 selen-float-delay selen-hover"
                    alt="Selen Daily"
                  />

                  <div>
                    <span className="gazette-label block mb-2">
                      Service récurrent
                    </span>

                    <h2 className="font-['Playfair_Display'] text-2xl md:text-4xl font-bold">
                      Selen Daily
                    </h2>

                    <p className="mt-2 text-[#6e4a32] text-sm md:text-base">
                      Gestion administrative quotidienne avec un agent dédié.
                    </p>
                  </div>
                </div>

                <span className="text-[#8a6243] font-['Cinzel'] text-xs uppercase tracking-[0.25em]">
                  Déplier
                </span>
              </div>
            </summary>

            <div className="px-6 md:px-8 pb-8 md:pb-10">
              <div className="border-t border-[#b28a62]/30 pt-6">
                <p className="leading-7 text-[#5a4031] text-[0.95rem]">
                  Gestion administrative quotidienne avec un agent dédié — pour
                  vous recentrer sur votre vrai métier.
                </p>

                <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#5a4031]">
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
            </div>
          </details>

          {/* SELEN NEWS */}
          <details className="relative border border-dashed border-[#b28a62]/50 bg-[#f8efdf]/60 opacity-80 overflow-hidden">
            <summary className="cursor-pointer list-none p-6 md:p-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
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

                    <p className="mt-2 text-[#6e4a32] text-sm">
                      Outil de veille pour suivre les évolutions du secteur.
                    </p>
                  </div>
                </div>

                <span className="text-[#8a6243] font-['Cinzel'] text-xs uppercase tracking-[0.25em]">
                  Déplier
                </span>
              </div>
            </summary>

            <div className="px-6 md:px-8 pb-8">
              <div className="border-t border-[#b28a62]/30 pt-5">
                <p className="leading-7 text-[#5a4031] text-[0.93rem]">
                  Outil de veille pour suivre les évolutions du secteur
                  formation, les obligations Qualiopi, les actualités et les
                  ressources utiles.
                </p>

                <p className="mt-4 font-['EB_Garamond'] italic text-[#8a6243] text-[0.88rem]">
                  — Offre prévue prochainement.
                </p>
              </div>
            </div>
          </details>

          {/* SELEN STUDIO */}
          <details className="relative border border-dashed border-[#b28a62]/50 bg-[#f8efdf]/60 opacity-80 overflow-hidden">
            <summary className="cursor-pointer list-none p-6 md:p-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
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

                    <p className="mt-2 text-[#6e4a32] text-sm">
                      Plateforme complète pour centraliser gestion, audit blanc
                      et veille.
                    </p>
                  </div>
                </div>

                <span className="text-[#8a6243] font-['Cinzel'] text-xs uppercase tracking-[0.25em]">
                  Déplier
                </span>
              </div>
            </summary>

            <div className="px-6 md:px-8 pb-8">
              <div className="border-t border-[#b28a62]/30 pt-5">
                <p className="leading-7 text-[#5a4031] text-[0.93rem]">
                  Plateforme complète centralisant la gestion administrative,
                  les outils d&apos;audit blanc, la veille et les futures
                  fonctionnalités Selen.
                </p>

                <p className="mt-4 font-['EB_Garamond'] italic text-[#8a6243] text-[0.88rem]">
                  — Disponible plus tard.
                </p>
              </div>
            </div>
          </details>
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

          <Link
            href="/prendre-rendez-vous"
            className="relative mt-8 inline-flex items-center justify-center rounded-full bg-[#d4a85c] px-8 py-4 font-semibold text-[#3e2a1f] shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition-all duration-300 hover:-translate-y-1 w-full sm:w-auto"
          >
            Réserver un appel
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
