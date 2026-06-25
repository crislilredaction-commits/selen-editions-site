import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import {
  formatArticleDate,
  getArticleCover,
  type Article,
} from "@/lib/articles";
import Link from "next/link";

type ArticlePageProps = {
  article: Article;
};

export default function ArticlePage({ article }: ArticlePageProps) {
  const cover = getArticleCover(article);

  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <ScrollReveal />

      <section className="relative border-b-2 border-[#b28a62]/40 bg-gradient-to-b from-[#ebe0ca] to-[#efe3cf] pb-10 md:pb-14 pt-8 md:pt-10">
        <div className="mx-auto max-w-5xl px-4 md:px-6 text-center">
          <Link
            href="/articles"
            className="font-['Cinzel'] text-[0.62rem] uppercase tracking-[0.18em] text-[#8a6243] hover:text-[#3e2a1f]"
          >
            ← Retour aux articles
          </Link>

          <div className="gazette-masthead-rule mt-5 mb-5 max-w-3xl mx-auto">
            <span className="font-['Cinzel'] text-[0.55rem] uppercase tracking-[0.32em] text-[#8a6243] px-3">
              Gazette Selen · Article
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="gazette-label">{article.category}</span>
            <span className="gazette-byline">
              {formatArticleDate(article.publishedAt)}
            </span>
            <span className="gazette-byline">{article.readingTime}</span>
          </div>

          <h1 className="mt-6 font-['Playfair_Display'] text-4xl sm:text-5xl md:text-6xl font-black leading-tight text-[#3e2a1f]">
            {article.title}
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-base md:text-xl leading-7 md:leading-8 text-[#5a4031]">
            {article.introduction}
          </p>
        </div>
      </section>

      <article className="mx-auto max-w-4xl px-4 md:px-6 py-10 md:py-14">
        {cover ? (
          <figure className="reveal mb-8 overflow-hidden border border-[#b28a62]/35 bg-[#f8efdf] p-2 shadow-[0_18px_55px_rgba(62,42,31,0.12)]">
            <img
              src={cover}
              alt={article.coverAlt}
              className="h-[260px] w-full object-cover md:h-[360px]"
              style={{ filter: "sepia(0.16) contrast(1.03)" }}
            />
          </figure>
        ) : null}

        <div className="reveal gazette-card p-6 md:p-10">
          <div className="gazette-band" />

          <div className="pt-3">
            <div className="gazette-masthead-rule mb-8">
              <span className="font-['Cinzel'] text-[0.55rem] uppercase tracking-[0.32em] text-[#8a6243] px-3">
                Feuilleton administratif
              </span>
            </div>

          <div className="space-y-8">
            {article.sections.map(({ title, body }) => (
              <section
                key={title}
                className="border-b border-[#b28a62]/25 pb-8 last:border-b-0 last:pb-0"
              >
                <h2 className="font-['Playfair_Display'] text-2xl md:text-3xl font-bold leading-tight text-[#3e2a1f]">
                  {title}
                </h2>

                <p className="mt-4 leading-7 md:leading-8 text-[#5a4031]">
                  {body}
                </p>
              </section>
            ))}

            <div className="border border-[#b28a62]/30 bg-white/35 p-5 md:p-6">
              <p className="gazette-label">À retenir</p>
              <p className="mt-4 font-['Playfair_Display'] text-2xl md:text-3xl font-semibold leading-snug text-[#8a4b24]">
                {article.conclusion}
              </p>
            </div>
            </div>
          </div>
        </div>
      </article>

      <section className="mx-auto max-w-4xl px-4 md:px-6 pb-16 md:pb-20">
        <div className="reveal gazette-cta px-6 md:px-8 py-9 md:py-11 text-center">
          <h2 className="font-['Playfair_Display'] text-3xl md:text-4xl font-bold text-[#f7ead6] leading-tight">
            Besoin de remettre de l&apos;ordre dans vos dossiers ?
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-base md:text-lg leading-7 text-[#d4c4a8]">
            Découvrez les prestations Selen ou réservez un échange simple pour
            parler de votre organisation.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/nos-prestations" className="btn-ink btn-ink-light">
              <span>Voir les prestations</span>
            </Link>

            <Link
              href="/prendre-rendez-vous"
              className="btn-ink btn-ink-light"
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
