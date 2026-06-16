"use client";

import {
  articleCategories,
  formatArticleDate,
  getArticleCover,
  type Article,
  type ArticleCategory,
} from "@/lib/articles";
import Link from "next/link";
import { useMemo, useState } from "react";

type ArticlesListProps = {
  articles: Article[];
};

type Filter = "Tous" | ArticleCategory;

export default function ArticlesList({ articles }: ArticlesListProps) {
  const [activeFilter, setActiveFilter] = useState<Filter>("Tous");

  const filteredArticles = useMemo(() => {
    if (activeFilter === "Tous") return articles;
    return articles.filter((article) => article.category === activeFilter);
  }, [activeFilter, articles]);

  const [leadArticle, ...otherArticles] = filteredArticles;

  return (
    <div className="reveal">
      <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
        {(["Tous", ...articleCategories] as Filter[]).map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveFilter(category)}
            className={`border px-4 py-2 font-['Cinzel'] text-[0.65rem] uppercase tracking-[0.16em] transition-all duration-300 ${
              activeFilter === category
                ? "border-[#3e2a1f] bg-[#3e2a1f] text-[#f7ead6]"
                : "border-[#b28a62]/50 bg-[#f8efdf]/50 text-[#8a6243] hover:border-[#3e2a1f] hover:text-[#3e2a1f]"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {leadArticle ? (
        <div className="space-y-7">
          <FeaturedArticleCard article={leadArticle} />

          {otherArticles.length > 0 ? (
            <div className="grid gap-5 md:gap-7 md:grid-cols-2">
              {otherArticles.map((article) => (
                <SmallArticleCard key={article.slug} article={article} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="gazette-card p-6 text-center">
          <div className="gazette-band" />
          <p className="text-[#5a4031]">
            Aucun article n&apos;est encore publié dans cette rubrique.
          </p>
        </div>
      )}
    </div>
  );
}

function FeaturedArticleCard({ article }: { article: Article }) {
  const cover = getArticleCover(article);

  return (
    <article className="gazette-card overflow-hidden p-0">
      <div className="gazette-band" />

      <div className="grid md:grid-cols-[1fr_1.12fr]">
        {cover ? (
          <div className="h-64 md:h-full min-h-[280px] overflow-hidden bg-[#efe3cf]">
            <img
              src={cover}
              alt={article.coverAlt}
              className="h-full w-full object-cover"
              style={{ filter: "sepia(0.18) contrast(1.04)" }}
            />
          </div>
        ) : null}

        <div className="p-6 md:p-9">
          <span className="gazette-label">{article.category}</span>

          <p className="mt-4 gazette-byline">
            À la une · {formatArticleDate(article.publishedAt)} ·{" "}
            {article.readingTime}
          </p>

          <h2 className="mt-5 font-['Playfair_Display'] text-3xl md:text-5xl font-bold leading-tight">
            {article.title}
          </h2>

          <p className="mt-5 text-base md:text-lg leading-7 md:leading-8 text-[#5a4031]">
            {article.excerpt}
          </p>

          <Link
            href={`/articles/${article.slug}`}
            className="mt-7 inline-block btn-ink"
          >
            <span>Lire l&apos;article ✦</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

function SmallArticleCard({ article }: { article: Article }) {
  const cover = getArticleCover(article);

  return (
    <article className="gazette-card p-5 md:p-7">
      <div className="gazette-band" />

      {cover ? (
        <div className="mb-5 h-40 overflow-hidden border border-[#b28a62]/25 bg-[#efe3cf]">
          <img
            src={cover}
            alt={article.coverAlt}
            className="h-full w-full object-cover"
            style={{ filter: "sepia(0.16) contrast(1.02)" }}
          />
        </div>
      ) : null}

      <span className="gazette-label">{article.category}</span>

      <p className="mt-3 gazette-byline">
        {formatArticleDate(article.publishedAt)} · {article.readingTime}
      </p>

      <h3 className="mt-4 font-['Playfair_Display'] text-2xl md:text-3xl font-bold leading-tight">
        {article.title}
      </h3>

      <p className="mt-4 leading-7 text-[#5a4031] text-[0.93rem]">
        {article.excerpt}
      </p>

      <Link
        href={`/articles/${article.slug}`}
        className="mt-5 inline-block font-['Cinzel'] text-[0.68rem] uppercase tracking-[0.16em] text-[#8a4b24] hover:text-[#3e2a1f]"
      >
        Lire l&apos;article ✦
      </Link>
    </article>
  );
}
