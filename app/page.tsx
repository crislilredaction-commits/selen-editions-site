import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import Link from "next/link";

export default function Home() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f] overflow-hidden">
      <Header />
      <ScrollReveal />

      {/* ═══ HERO ═══ */}
      <section className="relative border-b-2 border-[#b28a62]/40 bg-gradient-to-b from-[#ebe0ca] to-[#efe3cf]">
        <div className="gazette-masthead-rule px-4 md:px-6 py-3 max-w-6xl mx-auto">
          <span className="font-['Cinzel'] text-[0.52rem] md:text-[0.58rem] uppercase tracking-[0.4em] md:tracking-[0.55em] text-[#8a6243] text-center">
            Gazette Selen · Édition spéciale · Formation & Clarté
          </span>
        </div>

        <div className="mx-auto max-w-6xl px-4 md:px-6 pb-10 md:pb-12 pt-2 md:pt-4">
          <div className="gazette-hero-border px-3 md:px-4 py-10 md:py-12 text-center relative">
            {/* Ornements coins — réduits sur mobile */}
            <span className="absolute top-3 left-3 text-[#b28a62] text-base md:text-xl opacity-40 font-['Playfair_Display'] italic">
              ❧
            </span>
            <span className="absolute top-3 right-3 text-[#b28a62] text-base md:text-xl opacity-40 font-['Playfair_Display'] italic">
              ❧
            </span>
            <span className="absolute bottom-3 left-3 text-[#b28a62] text-base md:text-xl opacity-40 font-['Playfair_Display'] italic rotate-180">
              ❧
            </span>
            <span className="absolute bottom-3 right-3 text-[#b28a62] text-base md:text-xl opacity-40 font-['Playfair_Display'] italic rotate-180">
              ❧
            </span>

            <h1 className="gazette-hero-title text-4xl sm:text-5xl md:text-7xl text-[#3e2a1f] px-2">
              L'administratif
              <br />
              <em className="not-italic text-[#8a4b24]">de formation,</em>
              <br />
              raconté autrement
              <sup className="text-xl md:text-3xl text-[#b28a62] ml-1">✨</sup>
            </h1>

            <div className="gazette-masthead-rule mt-6 mb-5 max-w-xs md:max-w-xl mx-auto">
              <span className="text-[0.55rem] font-['Cinzel'] uppercase tracking-widest text-[#b28a62] px-3">
                par l'équipe Selen
              </span>
            </div>

            <p className="mx-auto max-w-xl text-base md:text-lg leading-7 md:leading-8 text-[#5a4031] font-['EB_Garamond'] px-2">
              Nous accompagnons les formateurs et organismes de formation qui
              veulent
              <em> transmettre sereinement</em>… sans se perdre dans le
              brouillard administratif.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row flex-wrap justify-center gap-3">
              <Link
                href="/nos-prestations"
                className="btn-ink w-full sm:w-auto text-center"
              >
                <span>Découvrir nos prestations</span>
              </Link>
              <a
                href="https://calendly.com/romaric-paymal/rdv-romaric-paymal"
                target="_blank"
                rel="noreferrer"
                className="btn-ink w-full sm:w-auto text-center"
              >
                <span>Parlons de vos besoins</span>
              </a>
            </div>

            {/* Mascotte — cachée sur très petit écran, repositionnée sur md+ */}
            <img
              src="/selion.png"
              alt="Sélion"
              className="hidden sm:block absolute -right-2 md:-right-4 -bottom-10 md:-bottom-12 w-28 md:w-44 animate-float-soft drop-shadow-lg"
            />
          </div>
        </div>
      </section>

      {/* ═══ ÉDITO + IMAGE ═══ */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 py-12 md:py-16">
        <div className="reveal-stagger grid gap-8 md:gap-10 md:grid-cols-[1.05fr_0.95fr]">
          <article className="gazette-card p-6 md:p-10">
            <div className="gazette-band" />
            <div className="pt-3">
              <span className="gazette-label">Édito</span>
              <h2 className="mt-5 font-['Playfair_Display'] text-3xl md:text-4xl font-bold leading-tight">
                Pourquoi Selen
                <br />
                <em className="text-[#8a4b24]">existe…</em>
              </h2>
              <p className="gazette-ornament mt-1 select-none">"</p>
              <p className="gazette-dropcap mt-2 leading-7 md:leading-8 text-[#5a4031]">
                Depuis <strong>2017</strong>, nous accompagnons des organismes
                de formation dans leur gestion administrative et pédagogique au
                quotidien. Nous intervenons également comme{" "}
                <strong>auditeurs Qualiopi</strong>.
              </p>
              <p className="mt-4 leading-7 md:leading-8 text-[#5a4031]">
                Et une phrase revient souvent&nbsp;:
                <br />
                <em className="font-semibold text-[#3e2a1f]">
                  "Moi, je veux former… pas gérer des papiers."
                </em>
              </p>
              <p className="mt-4 leading-7 md:leading-8 text-[#5a4031]">
                Entre les obligations réglementaires, les dossiers stagiaires,
                la préparation des audits et la charge mentale… beaucoup
                avancent dans un brouillard administratif qui finit par voler du
                temps et de l'énergie.
              </p>
              <div className="mt-5 border-t border-[#b28a62]/30 pt-4">
                <p className="leading-7 text-[#5a4031]">
                  Nous avons choisi de mettre notre expertise au service des{" "}
                  <strong>phobiques de l'administratif</strong>, pour rendre ces
                  sujets plus compréhensibles, plus humains… et surtout plus
                  rassurants.
                </p>
              </div>
            </div>
          </article>

          <article className="gazette-card overflow-hidden p-0">
            <div className="gazette-band" />
            <div className="h-[220px] md:h-[280px] overflow-hidden">
              <img
                src="/gif-papiers.gif"
                alt="Le chaos administratif"
                className="h-full w-full object-cover"
                style={{ filter: "sepia(0.18) contrast(1.05)" }}
              />
            </div>
            <div className="p-5 md:p-7">
              <span className="gazette-label">À la une</span>
              <h2 className="mt-4 font-['Playfair_Display'] text-2xl md:text-3xl font-bold leading-tight">
                Quand les papiers
                <br />
                <em className="text-[#8a4b24]">prennent le dessus…</em>
              </h2>
              <p className="mt-4 leading-7 text-[#5a4031] text-[0.95rem]">
                Beaucoup de formateurs veulent transmettre, pas courir après des
                dossiers, des relances et des obligations floues.
              </p>
              <p className="mt-3 leading-7 text-[#6e4a32] text-[0.88rem]">
                Selen est né pour remettre de l'ordre dans ce chaos — avec plus
                de clarté, plus de méthode, et beaucoup moins de brouillard.
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* ═══ À LA UNE — 3 rubriques ═══ */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 py-8 md:py-12">
        <div className="reveal mb-8">
          <div className="gazette-section-title text-center justify-center">
            <span className="font-['Cinzel'] text-[0.6rem] md:text-[0.65rem] uppercase tracking-[0.4em] md:tracking-[0.5em] text-[#8a6243] px-4 md:px-6">
              À la une
            </span>
          </div>
        </div>

        <div className="reveal-stagger grid gap-5 md:gap-7 md:grid-cols-3">
          {[
            {
              label: "Rubrique",
              title: "Audit blanc",
              p1: "Un audit Qualiopi peut vite devenir une source de stress. On ne sait jamais vraiment si ce que l'on a préparé est suffisant.",
              p2: "L'audit blanc permet de faire le point avant l'échéance — ce qui est solide, ce qui manque, ce qui mérite d'être clarifié.",
              italic:
                "L'objectif\u00a0: vous permettre d'avancer avec une vision nette et une préparation sereine.",
            },
            {
              label: "Rubrique",
              title: "Préparation Qualiopi",
              p1: "Préparer Qualiopi, ce n'est pas empiler des documents pour faire joli. C'est construire une organisation cohérente et exploitable au quotidien.",
              p2: "Une bonne préparation pose des bases solides et permet d'aborder la suite avec beaucoup plus de confiance.",
              italic: "Des fondations claires. Une organisation qui tient.",
            },
            {
              label: "Rubrique",
              title: "Gestion quotidienne",
              p1: "Convocations, relances, conventions, attestations… la gestion administrative finit vite par devenir un bruit de fond permanent.",
              p2: "Déléguer cette partie, c'est retrouver de l'espace mental, une organisation plus fluide et la possibilité de se recentrer sur son vrai métier.",
              italic: "Moins de bruit. Plus d'essentiel.",
            },
          ].map(({ label, title, p1, p2, italic }) => (
            <article key={title} className="gazette-card p-5 md:p-7">
              <div className="gazette-band" />
              <div className="pt-2">
                <span className="gazette-label">{label}</span>
                <h3 className="mt-4 font-['Playfair_Display'] text-2xl md:text-3xl font-bold leading-tight">
                  {title}
                </h3>
                <div className="mt-1 h-px w-8 bg-[#b28a62]/50" />
                <p className="mt-4 leading-7 text-[#5a4031] text-[0.93rem]">
                  {p1}
                </p>
                <p className="mt-3 leading-7 text-[#5a4031] text-[0.93rem]">
                  {p2}
                </p>
                <p className="mt-3 leading-7 text-[#6e4a32] text-[0.88rem] italic">
                  {italic}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ═══ PRESTATIONS APERÇU ═══ */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 py-8 md:py-12">
        <div className="reveal mb-8">
          <div className="gazette-section-title text-center justify-center">
            <span className="font-['Cinzel'] text-[0.6rem] md:text-[0.65rem] uppercase tracking-[0.4em] md:tracking-[0.5em] text-[#8a6243] px-4 md:px-6">
              Nos prestations
            </span>
          </div>
        </div>

        <div className="reveal-stagger grid gap-5 md:gap-7 md:grid-cols-3">
          {[
            {
              label: "Accompagnement",
              title: "Selen Review",
              text: "Faire le point avant l'audit, identifier les écarts et avancer avec plus de sérénité.",
              tag: "Audit blanc",
            },
            {
              label: "Accompagnement",
              title: "Selen Prepa",
              text: "Mettre en place une structure administrative plus claire et plus conforme.",
              tag: "Préparation",
            },
            {
              label: "Service continu",
              title: "Selen Daily",
              text: "Déléguer ce qui vous pèse pour vous recentrer sur votre vrai métier.",
              tag: "Gestion",
            },
          ].map(({ label, title, text, tag }) => (
            <article key={title} className="gazette-card p-5 md:p-7">
              <div className="gazette-band" />
              <div className="pt-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <span className="gazette-label">{label}</span>
                  <span className="mt-0.5 text-[0.6rem] text-[#b28a62] font-['Cinzel'] uppercase tracking-wider border border-[#b28a62]/30 px-2 py-0.5">
                    {tag}
                  </span>
                </div>
                <h3 className="mt-4 font-['Playfair_Display'] text-xl md:text-2xl font-bold">
                  {title}
                </h3>
                <p className="mt-3 leading-7 text-[#5a4031] text-[0.93rem]">
                  {text}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="reveal mt-8 text-center">
          <Link href="/nos-prestations" className="btn-ink inline-block">
            <span>Voir toutes nos prestations ✦</span>
          </Link>
        </div>
      </section>

      {/* ═══ CTA FINAL ═══ */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pb-16 md:pb-20 pt-8 md:pt-10">
        <div className="reveal gazette-cta px-6 md:px-8 py-10 md:py-14 shadow-[0_20px_60px_rgba(62,42,31,0.2)]">
          <div className="grid gap-8 md:gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div className="text-center md:text-left">
              <div className="flex items-center gap-3 mb-5 justify-center md:justify-start">
                <span className="h-px flex-1 max-w-[50px] bg-[#b28a62]/40" />
                <span className="font-['Cinzel'] text-[0.55rem] uppercase tracking-[0.4em] text-[#b28a62]">
                  Dernière page
                </span>
                <span className="h-px flex-1 max-w-[50px] bg-[#b28a62]/40" />
              </div>

              <h2 className="font-['Playfair_Display'] text-3xl md:text-5xl font-bold text-[#f7ead6] leading-tight">
                Réserver
                <br />
                <em className="text-[#c9a055]">votre appel ✨</em>
              </h2>

              <p className="mt-5 text-base md:text-lg leading-7 md:leading-8 text-[#d4c4a8] max-w-sm mx-auto md:mx-0">
                Que vous soyez au début, en pleine structuration ou à l'approche
                d'un audit — un échange simple peut déjà vous aider à voir plus
                clair.
              </p>

              <a
                href="https://calendly.com/romaric-paymal/rdv-romaric-paymal"
                target="_blank"
                rel="noreferrer"
                className="mt-7 inline-block btn-ink btn-ink-light w-full sm:w-auto text-center"
              >
                <span>Réserver un appel</span>
              </a>
            </div>

            {/* GIF — masqué sur mobile pour alléger */}
            <div className="hidden md:block relative">
              <div
                className="overflow-hidden border border-[#b28a62]/30 p-2"
                style={{
                  boxShadow:
                    "0 0 0 1px rgba(201,160,85,0.1), inset 0 0 30px rgba(0,0,0,0.2)",
                }}
              >
                <img
                  src="/telephone.gif"
                  alt="Réserver un appel"
                  className="h-[260px] w-full object-cover"
                  style={{ filter: "sepia(0.25) contrast(0.95)" }}
                />
              </div>
              <span className="absolute -top-2 -left-2 w-4 h-4 border-t border-l border-[#c9a055]/50" />
              <span className="absolute -top-2 -right-2 w-4 h-4 border-t border-r border-[#c9a055]/50" />
              <span className="absolute -bottom-2 -left-2 w-4 h-4 border-b border-l border-[#c9a055]/50" />
              <span className="absolute -bottom-2 -right-2 w-4 h-4 border-b border-r border-[#c9a055]/50" />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
