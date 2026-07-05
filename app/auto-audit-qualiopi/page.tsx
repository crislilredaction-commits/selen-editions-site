import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";

const highlights = [
  {
    label: "Clarté",
    title: "Vous savez quoi corriger",
    text: "L’outil vous indique les indicateurs en défaut, les points à vérifier et les priorités avant votre audit.",
  },
  {
    label: "Temps",
    title: "Vous avancez sans tourner en rond",
    text: "Chaque indicateur est expliqué en langage clair pour éviter de relire seul le référentiel pendant des heures.",
  },
  {
    label: "Bilan",
    title: "Vous repartez avec un plan",
    text: "À la fin, vous téléchargez un fichier Excel avec vos notes, vos diagnostics et les actions à mener.",
  },
];

const included = [
  "Questionnaire profil pour déterminer vos indicateurs applicables.",
  "Vérification de l’usage des marques Qualiopi, du certificat et du logo.",
  "Questions guidées pour chaque indicateur du référentiel.",
  "Diagnostic : conforme, à vérifier, risque mineur ou risque majeur.",
  "Documents modèles proposés selon vos réponses.",
  "Notes personnelles pour préparer votre dossier d’audit.",
  "Bilan final avec export Excel et pistes de correction.",
];

export default function AutoAuditQualiopiPage() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <ScrollReveal />

      <section className="relative overflow-hidden px-4 md:px-6 pt-16 md:pt-24 pb-14 md:pb-20">
        <div className="pointer-events-none absolute -left-8 top-10 hidden w-28 opacity-90 md:block lg:left-4 lg:w-36 selen-float-delay">
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
            Gazette Selen · Édition Préaudit
          </p>

          <div className="gazette-hero-border mt-6">
            <h1 className="gazette-hero-title text-4xl md:text-6xl">
              Vérifiez votre{" "}
              <span className="gold-shimmer">conformité Qualiopi</span>{" "}
              avant que l’auditeur ne le fasse
            </h1>
          </div>

          <p className="mx-auto mt-6 max-w-3xl text-base md:text-lg leading-8 text-[#5a4031]">
            Un outil guidé pour identifier vos indicateurs applicables, repérer
            les risques de non-conformité, télécharger les modèles utiles et
            repartir avec un plan d’action clair.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/paiement/auto-audit?offre=unique"
              className="btn-ink text-center"
            >
              <span>Commencer mon auto-audit — 99 €</span>
            </Link>

            <Link
              href="/paiement/auto-audit?offre=trois-fois"
              className="btn-ghost text-center"
            >
              <span>Payer en 3 × 33 €</span>
            </Link>
          </div>

          <p className="gazette-byline mt-8">
            Par l’équipe Selen · Diagnostic Qualiopi
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="gazette-dot-rule">
          <span>✦</span>
        </div>
      </div>

      <section className="mx-auto max-w-5xl px-4 md:px-6 pt-12 md:pt-16 pb-16 md:pb-20">
        <div className="gazette-section-title reveal is-visible">
          <h2 className="whitespace-nowrap font-['Cinzel'] text-sm tracking-[0.2em] uppercase text-[#8a6243]">
            Ce que vous obtenez
          </h2>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3 reveal-stagger is-visible">
          {highlights.map((item) => (
            <article key={item.title} className="gazette-card p-6">
              <div className="gazette-band" />
              <p className="gazette-label">{item.label}</p>
              <h3 className="mt-3 font-['Playfair_Display'] text-2xl font-bold">
                {item.title}
              </h3>
              <p className="mt-4 leading-7 text-[#5a4031]">{item.text}</p>
            </article>
          ))}
        </div>

        <div className="mt-14 md:mt-16 flex items-start justify-center gap-4 text-center reveal is-visible">
          <span className="gazette-ornament leading-none">“</span>
          <p className="max-w-2xl pt-3 font-['Playfair_Display'] text-xl md:text-2xl italic leading-snug text-[#3e2a1f]">
            L’objectif n’est pas de cocher des cases au hasard, mais de savoir
            précisément ce qui peut attirer l’attention d’un auditeur.
          </p>
        </div>

        <div className="mt-14 md:mt-16 gazette-card p-6 md:p-8 reveal is-visible">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
            <div>
              <p className="gazette-label">Ce que contient l’accès</p>
              <h2 className="mt-3 font-['Playfair_Display'] text-3xl md:text-4xl font-bold">
                Un parcours complet, indicateur par indicateur
              </h2>
              <p className="gazette-dropcap mt-6 leading-7 text-[#5a4031]">
                Vous avancez dans un parcours structuré pour faire le point sur
                votre préparation, repérer les zones fragiles et garder une trace
                exploitable avant l’audit.
              </p>

              <ul className="mt-6 grid gap-3 text-[#5a4031]">
                {included.map((item) => (
                  <li key={item} className="flex gap-3 leading-7">
                    <span className="text-[#b28a62] shrink-0">✦</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <aside className="relative border border-[#b28a62]/30 bg-[#f8efdf]/70 p-6 text-center">
              <div className="gazette-seal">
                <span>
                  3 mois
                  <br />
                  d’accès
                  <br />✦
                </span>
              </div>

              <p className="gazette-byline">Tarif</p>
              <p className="mt-3 font-['Playfair_Display'] text-5xl font-semibold text-[#3e2a1f]">
                99 <span className="text-2xl text-[#6e4a32]">€</span>
              </p>
              <p className="mt-2 text-[#6e4a32]">ou 3 × 33 €</p>
              <p className="mt-4 leading-7 text-[#5a4031]">
                Paiement sécurisé. Après validation, votre accès est activé dans
                Le bureau Selen.
              </p>
              <Link
                href="/paiement/auto-audit?offre=unique"
                className="btn-ink mt-6 inline-flex text-center"
              >
                <span>Accéder à l’auto-audit</span>
              </Link>
            </aside>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <article className="gazette-card p-6 md:p-8 reveal is-visible">
            <div className="gazette-band" />
            <p className="gazette-label">Pour qui ?</p>
            <h2 className="mt-3 font-['Playfair_Display'] text-3xl font-bold">
              Formateurs, OF, CFA, VAE, bilans de compétences
            </h2>
            <p className="mt-4 leading-8 text-[#5a4031]">
              L’auto-audit s’adresse aux organismes qui veulent vérifier leur
              niveau de préparation avant un audit initial, de surveillance ou
              de renouvellement.
            </p>
          </article>

          <article className="gazette-card p-6 md:p-8 reveal is-visible">
            <div className="gazette-band" />
            <p className="gazette-label">Important</p>
            <h2 className="mt-3 font-['Playfair_Display'] text-3xl font-bold">
              Ce n’est pas une certification
            </h2>
            <p className="mt-4 leading-8 text-[#5a4031]">
              L’auto-audit ne remplace pas la décision d’un certificateur. Il
              aide à repérer les points faibles, structurer les corrections et
              préparer le dossier plus sereinement.
            </p>
          </article>
        </div>
      </section>

      <section className="px-4 md:px-6 pb-16 md:pb-20">
        <div className="gazette-cta mx-auto max-w-5xl p-8 md:p-12 text-center reveal is-visible">
          <p className="gazette-label gazette-label--on-dark">Dernière page</p>
          <h2 className="mt-4 font-['Playfair_Display'] text-3xl md:text-4xl font-bold text-[#f8f0e3]">
            Prêt·e à regarder votre dossier avec méthode ?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-[#e0d0b8]">
            Commencez par l’auto-audit, puis réservez un audit blanc si vous
            souhaitez un regard humain sur vos preuves.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/paiement/auto-audit?offre=unique"
              className="btn-ink-light text-center"
            >
              <span>Commencer — 99 €</span>
            </Link>
            <Link href="/selen-review" className="btn-ink-light text-center">
              <span>Voir Selen Review</span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
