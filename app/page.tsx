import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";

export default function Home() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f] overflow-hidden">
      <Header />

      {/* HERO */}
      <section className="border-b-4 border-[#b28a62] bg-[#efe3cf] relative">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-center text-xs uppercase tracking-[0.45em] text-[#8a6243]">
            Gazette Selen • Édition spéciale
          </p>

          <div className="relative mt-6 border-y-4 border-[#3e2a1f] py-10 text-center">
            <h1 className="text-5xl font-bold leading-[0.95] md:text-7xl">
              L’administratif
              <br />
              de formation,
              <br />
              raconté autrement ✨
            </h1>

            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-[#5a4031]">
              Chez Selen, nous accompagnons les formateurs et organismes de
              formation qui veulent transmettre sereinement… sans se perdre dans
              le brouillard administratif.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/nos-prestations"
                className="border-2 border-[#3e2a1f] bg-[#3e2a1f] px-6 py-3 text-white transition hover:opacity-90"
              >
                Découvrir nos prestations
              </Link>

              <a
                href="https://calendly.com/romaric-paymal/rdv-romaric-paymal"
                target="_blank"
                rel="noreferrer"
                className="border-2 border-[#3e2a1f] px-6 py-3 text-[#3e2a1f] transition hover:bg-[#3e2a1f] hover:text-white"
              >
                Parlons de vos besoins
              </a>
            </div>

            <img
              src="/selion.png"
              alt="Sélion"
              className="absolute -right-6 -bottom-10 w-36 md:w-44 animate-float-soft"
            />
          </div>
        </div>
      </section>

      {/* POURQUOI SELEN EXISTE + GIF */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1fr_1fr]">
          <article className="gazette-card p-8">
            <div className="gazette-band" />
            <p className="gazette-label">Édito</p>

            <h2 className="mt-4 text-4xl font-bold leading-tight">
              Pourquoi Selen existe ...
            </h2>

            <p className="mt-6 leading-8 text-[#5a4031]">
              Depuis <strong>2017</strong>, nous accompagnons des organismes de
              formation dans leur gestion administrative et pédagogique au
              quotidien. Nous intervenons également comme{" "}
              <strong>auditeurs Qualiopi</strong>.
            </p>

            <p className="mt-4 leading-8 text-[#5a4031]">
              Et une phrase revient souvent :
              <strong> “Moi, je veux former… pas gérer des papiers.”</strong>
            </p>

            <p className="mt-4 leading-8 text-[#5a4031]">
              Entre les obligations réglementaires, les dossiers stagiaires, la
              préparation des audits, la conformité et la charge mentale…
              beaucoup avancent dans un brouillard administratif qui finit par
              leur voler du temps et de l’énergie.
            </p>

            <p className="mt-4 leading-8 text-[#5a4031]">
              Nous avons donc choisi de mettre notre expertise au service des{" "}
              <strong>phobiques de l’administratif</strong>, pour rendre ces
              sujets plus compréhensibles, plus humains… et surtout plus
              rassurants.
            </p>
          </article>

          <article className="gazette-card p-4">
            <div className="gazette-band" />
            <div className="overflow-hidden border border-[#ccb79b] bg-[#f4e8d6]">
              <img
                src="/gif-papiers.gif"
                alt="Le chaos administratif"
                className="h-[320px] w-full object-cover"
              />
            </div>

            <div className="px-3 pb-3 pt-5">
              <p className="gazette-label">À la une</p>

              <h2 className="mt-4 text-3xl font-bold leading-tight">
                Quand les papiers prennent le dessus…
              </h2>

              <p className="mt-4 leading-8 text-[#5a4031]">
                Beaucoup de formateurs veulent transmettre, pas courir après des
                dossiers, des relances et des obligations floues.
              </p>

              <p className="mt-3 leading-8 text-[#5a4031]">
                Selen est né pour remettre de l’ordre dans ce chaos, avec plus
                de clarté, plus de méthode… et beaucoup moins de brouillard.
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* A LA UNE */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-8 border-y-2 border-[#3e2a1f] py-4 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-[#8a6243]">
            À la une
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <article className="gazette-card p-7">
            <div className="gazette-band" />
            <p className="gazette-label">Rubrique</p>

            <h3 className="mt-4 text-3xl font-bold">Audit blanc</h3>

            <p className="mt-4 leading-8 text-[#5a4031]">
              Un audit Qualiopi peut vite devenir une source de stress. On ne
              sait jamais vraiment si ce que l’on a préparé est suffisant… ni
              comment l’auditeur va regarder les choses.
            </p>

            <p className="mt-4 leading-8 text-[#5a4031]">
              L’audit blanc permet de faire le point avant l’échéance. Il met en
              lumière ce qui est déjà solide, ce qui manque encore, et ce qui
              mérite simplement d’être clarifié.
            </p>

            <p className="mt-4 leading-8 text-[#5a4031]">
              L’objectif n’est pas de vous juger, mais de vous permettre
              d’avancer avec une vision plus nette et une préparation beaucoup
              plus sereine.
            </p>
          </article>

          <article className="gazette-card p-7">
            <div className="gazette-band" />
            <p className="gazette-label">Rubrique</p>

            <h3 className="mt-4 text-3xl font-bold">Préparation Qualiopi</h3>

            <p className="mt-4 leading-8 text-[#5a4031]">
              Beaucoup d’organismes avancent avec de bonnes intentions, mais
              sans structure administrative vraiment claire. Cela peut
              fonctionner un temps… jusqu’au moment où un audit ou une montée en
              activité révèle les failles.
            </p>

            <p className="mt-4 leading-8 text-[#5a4031]">
              Préparer Qualiopi, ce n’est pas empiler des documents pour faire
              joli. C’est construire une organisation cohérente, compréhensible
              et réellement exploitable dans votre quotidien.
            </p>

            <p className="mt-4 leading-8 text-[#5a4031]">
              Une bonne préparation permet de poser des bases solides, de
              retrouver de la lisibilité… et d’aborder la suite avec beaucoup
              plus de confiance.
            </p>
          </article>

          <article className="gazette-card p-7">
            <div className="gazette-band" />
            <p className="gazette-label">Rubrique</p>

            <h3 className="mt-4 text-3xl font-bold">Gestion quotidienne</h3>

            <p className="mt-4 leading-8 text-[#5a4031]">
              Convocations, relances, conventions, attestations, classements… la
              gestion administrative de formation finit vite par devenir un
              bruit de fond permanent.
            </p>

            <p className="mt-4 leading-8 text-[#5a4031]">
              Ce temps grignoté semaine après semaine finit par peser sur
              l’énergie, la disponibilité et parfois même sur la qualité de la
              transmission.
            </p>

            <p className="mt-4 leading-8 text-[#5a4031]">
              Déléguer cette partie, c’est retrouver de l’espace mental, une
              organisation plus fluide et la possibilité de se recentrer sur son
              vrai métier.
            </p>
          </article>
        </div>
      </section>

      {/* PRESTATIONS */}
      <section className="mx-auto max-w-6xl px-6 py-4">
        <div className="mb-8 border-y-2 border-[#3e2a1f] py-4 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-[#8a6243]">
            Nos prestations
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <article className="gazette-card p-8">
            <div className="gazette-band" />
            <p className="gazette-label">Accompagnement</p>
            <h3 className="mt-4 text-2xl font-bold">Selen Review</h3>
            <p className="mt-4 leading-8 text-[#5a4031]">
              Faire le point avant l’audit, identifier les écarts et avancer
              avec plus de sérénité.
            </p>
          </article>

          <article className="gazette-card p-8">
            <div className="gazette-band" />
            <p className="gazette-label">Accompagnement</p>
            <h3 className="mt-4 text-2xl font-bold">Selen Prepa</h3>
            <p className="mt-4 leading-8 text-[#5a4031]">
              Mettre en place une structure administrative plus claire et plus
              conforme.
            </p>
          </article>

          <article className="gazette-card p-8">
            <div className="gazette-band" />
            <p className="gazette-label">Service continu</p>
            <h3 className="mt-4 text-2xl font-bold">Selen Daily</h3>
            <p className="mt-4 leading-8 text-[#5a4031]">
              Déléguer ce qui vous pèse pour vous recentrer sur votre vrai
              métier.
            </p>
          </article>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/nos-prestations"
            className="inline-block border-2 border-[#3e2a1f] px-6 py-3 text-[#3e2a1f] transition hover:bg-[#3e2a1f] hover:text-white"
          >
            Voir toutes nos prestations 📜
          </Link>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-14">
        <div className="border border-[#3e2a1f] bg-[#3e2a1f] px-8 py-12 text-[#f7ead6] shadow-[0_10px_30px_rgba(62,42,31,0.15)]">
          <div className="grid gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center">
            <div className="text-center md:text-left">
              <p className="text-xs uppercase tracking-[0.35em] text-[#d8b38d]">
                Dernière page
              </p>

              <h2 className="mt-4 text-4xl font-bold md:text-5xl">
                Réserver votre appel ✨
              </h2>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#f0dcc3]">
                Que vous soyez au début, en pleine structuration ou à l’approche
                d’un audit, un échange simple peut déjà vous aider à voir plus
                clair sur la suite.
              </p>

              <a
                href="https://calendly.com/romaric-paymal/rdv-romaric-paymal"
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-block border-2 border-[#f7ead6] px-6 py-3 text-[#f7ead6] transition hover:bg-[#f7ead6] hover:text-[#3e2a1f]"
              >
                Réserver un appel
              </a>
            </div>

            <div className="overflow-hidden border border-[#d8b38d] bg-[#4a3124] p-3">
              <img
                src="/telephone.gif"
                alt="Réserver un appel"
                className="h-[260px] w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
