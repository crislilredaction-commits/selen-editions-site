import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import { getSortedArticles } from "@/lib/articles";
import ArticlesList from "./ArticlesList";

const sortedArticles = getSortedArticles();

export default function ArticlesPage() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <ScrollReveal />

      <section className="relative border-b border-[#b28a62]/40 pb-10 md:pb-14 pt-8 md:pt-10 text-center">
        <div className="gazette-masthead-rule px-4 md:px-6 mb-5 max-w-4xl mx-auto">
          <span className="font-['Cinzel'] text-[0.52rem] md:text-[0.58rem] uppercase tracking-[0.4em] text-[#8a6243]">
            Gazette Selen · Articles & ressources
          </span>
        </div>

        <h1 className="font-['Playfair_Display'] text-4xl sm:text-5xl md:text-7xl font-black text-[#3e2a1f] px-4">
          Articles & ressources
          <sup className="text-xl md:text-2xl text-[#b28a62] ml-1">✨</sup>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl px-5 text-base md:text-lg leading-7 md:leading-8 text-[#5a4031]">
          Des contenus simples, pratiques et orientés terrain pour mieux vivre
          Qualiopi, la gestion administrative et le suivi de vos formations.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 md:px-6 py-12 md:py-16">
        <ArticlesList articles={sortedArticles} />
      </section>

      <Footer />
    </main>
  );
}
