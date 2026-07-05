import Image from "next/image";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import Link from "next/link";

export default function PrepaNdaPage() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <ScrollReveal />

      {/* ───────────── Hero ───────────── */}
      <section className="relative overflow-hidden px-4 md:px-6 pt-16 md:pt-24 pb-14 md:pb-20">
        {/* Sélion qui veille discrètement sur le dossier */}
        <div className="pointer-events-none absolute -right-6 top-6 hidden w-28 opacity-90 md:block lg:-right-2 lg:w-36 selen-float">
          <Image
            src="/selion.png"
            alt=""
            width={160}
            height={160}
            aria-hidden="true"
          />
        </div>

        <div className="mx-auto max-w-5xl text-center reveal is-visible">
          <p className="gazette-label mx-auto w-fit">
            Gazette Selen · Édition Prépa NDA
          </p>

          <div className="gazette-hero-border mt-6">
            <h1 className="gazette-hero-title text-4xl md:text-6xl">
              Obtenir votre{" "}
              <span className="gold-shimmer">
                numéro de déclaration d’activité
              </span>{" "}
              sans vous perdre dans l’administratif
            </h1>
          </div>

          <p className="mx-auto mt-6 max-w-3xl text-base md:text-lg leading-8 text-[#5a4031]">
            Selen vous accompagne dans la préparation de votre dossier NDA :
            vérification des pièces, reformulation du programme, documents à
            signer, dépôt sur Mon Activité Formation et suivi jusqu’à la réponse
            de la DREETS.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/paiement/prepa-nda" className="btn-ink text-center">
              <span>Acheter la Prépa NDA — 390 €</span>
            </Link>

            <Link href="/nos-prestations" className="btn-ghost text-center">
              <span>Voir toutes les prestations</span>
            </Link>
          </div>

          <p className="gazette-byline mt-8">
            Par l’équipe Selen · Dossier réglementaire
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="gazette-dot-rule">
          <span>✦</span>
        </div>
      </div>

      <section className="mx-auto max-w-5xl px-4 md:px-6 pt-12 md:pt-16 pb-16 md:pb-20">
        {/* ───────────── Pour qui / objectif / accompagnement ───────────── */}
        <div className="gazette-section-title reveal is-visible">
          <h2 className="whitespace-nowrap font-['Cinzel'] text-sm tracking-[0.2em] uppercase text-[#8a6243]">
            Comment ça se passe
          </h2>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3 reveal-stagger is-visible">
          <article className="gazette-card p-6">
            <div className="gazette-band" />
            <p className="gazette-label">Pour qui ?</p>

            <h3 className="mt-3 font-['Playfair_Display'] text-2xl font-bold">
              Les formateurs qui démarrent
            </h3>

            <p className="mt-4 leading-7 text-[#5a4031]">
              Vous voulez créer officiellement votre activité de formation et
              obtenir votre numéro de déclaration d’activité auprès de la
              DREETS.
            </p>
          </article>

          <article className="gazette-card p-6">
            <div className="gazette-band" />
            <p className="gazette-label">Objectif</p>

            <h3 className="mt-3 font-['Playfair_Display'] text-2xl font-bold">
              Un dossier clair et prêt à déposer
            </h3>

            <p className="mt-4 leading-7 text-[#5a4031]">
              Nous vous aidons à réunir les bonnes pièces, structurer votre
              programme et préparer les documents attendus pour le dépôt.
            </p>
          </article>

          <article className="gazette-card p-6">
            <div className="gazette-band" />
            <p className="gazette-label">Accompagnement</p>

            <h3 className="mt-3 font-['Playfair_Display'] text-2xl font-bold">
              Un agent Selen à vos côtés
            </h3>

            <p className="mt-4 leading-7 text-[#5a4031]">
              Votre dossier est suivi dans votre bureau Selen, avec échanges via
              la messagerie Selen et accompagnement en cas de retour DREETS.
            </p>
          </article>
        </div>

        {/* ───────────── Pull-quote éditorial ───────────── */}
        <div className="mt-14 md:mt-16 flex items-start justify-center gap-4 text-center reveal is-visible">
          <span className="gazette-ornament leading-none">“</span>
          <p className="max-w-2xl pt-3 font-['Playfair_Display'] text-xl md:text-2xl italic leading-snug text-[#3e2a1f]">
            On ne devient pas formateur pour courir après un numéro de
            déclaration d’activité, un programme reformulé ou une convention à
            signer.
          </p>
        </div>

        {/* ───────────── Ce qui est inclus ───────────── */}
        <div className="mt-14 md:mt-16 gazette-card p-6 md:p-8 reveal is-visible">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
            <div>
              <p className="gazette-label">Ce qui est inclus</p>

              <h2 className="mt-3 font-['Playfair_Display'] text-3xl md:text-4xl font-bold">
                Une préparation complète du dossier NDA
              </h2>

              <p className="gazette-dropcap mt-6 leading-7 text-[#5a4031]">
                Chaque dossier NDA suit le même fil rouge : vérifier, clarifier,
                préparer, déposer. Concrètement, Selen s’occupe de six étapes
                pour vous :
              </p>

              <ul className="mt-6 grid gap-3 text-[#5a4031]">
                {[
                  "Vérification des premières pièces : programme, CV, avis INSEE ou justificatif d’existence.",
                  "Analyse de cohérence entre le programme, les compétences et le public visé.",
                  "Reformulation du programme si nécessaire.",
                  "Préparation des documents à signer : convention, programme, liste des formateurs.",
                  "Guidage pour le dépôt sur Mon Activité Formation.",
                  "Suivi après dépôt et accompagnement en cas de courrier de refus.",
                ].map((item) => (
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
                  Dossier
                  <br />
                  suivi
                  <br />✦
                </span>
              </div>

              <p className="gazette-byline">Tarif</p>

              <p className="mt-3 font-['Playfair_Display'] text-5xl font-semibold text-[#3e2a1f]">
                390 <span className="text-2xl text-[#6e4a32]">€</span>
              </p>

              <p className="mt-4 leading-7 text-[#5a4031]">
                Paiement sécurisé. Après validation, votre Bureau Selen et votre
                dossier Prépa NDA sont créés automatiquement.
              </p>

              <Link
                href="/paiement/prepa-nda"
                className="btn-ink mt-6 inline-flex text-center"
              >
                <span>Commencer ma Prépa NDA</span>
              </Link>
            </aside>
          </div>
        </div>

        {/* ───────────── À retenir ───────────── */}
        <div className="mt-8 gazette-card p-6 md:p-8 reveal is-visible">
          <p className="gazette-label">À retenir</p>

          <h2 className="mt-3 font-['Playfair_Display'] text-3xl md:text-4xl font-bold">
            Selen prépare, vous validez, puis vous déposez
          </h2>

          <p className="mt-4 max-w-3xl leading-8 text-[#5a4031]">
            Le dépôt officiel reste fait depuis votre compte Mon Activité
            Formation, mais vous n’êtes pas seul devant le formulaire : votre
            bureau Selen vous guide jusqu’au dépôt, puis vous aide à suivre la
            réponse de la DREETS.
          </p>
        </div>
      </section>

      {/* ───────────── CTA final ───────────── */}
      <section className="px-4 md:px-6 pb-16 md:pb-20">
        <div className="gazette-cta mx-auto max-w-5xl p-8 md:p-12 text-center reveal is-visible">
          <p className="gazette-label gazette-label--on-dark">Dernière page</p>

          <h2 className="mt-4 font-['Playfair_Display'] text-3xl md:text-4xl font-bold text-[#f8f0e3]">
            Prêt·e à sortir du brouillard administratif ?
          </h2>

          <p className="mx-auto mt-4 max-w-2xl leading-7 text-[#e0d0b8]">
            Un échange simple suffit pour savoir si la Prépa NDA correspond à
            votre situation, avant même de commencer.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/paiement/prepa-nda"
              className="btn-ink-light text-center"
            >
              <span>Acheter la Prépa NDA — 390 €</span>
            </Link>

            <Link
              href="/prendre-rendez-vous"
              className="btn-ink-light text-center"
            >
              <span>Réserver un appel</span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
