import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function SelenDailySuccessPage() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <section className="mx-auto max-w-3xl px-4 md:px-6 py-12 md:py-16">
        <article className="gazette-card p-6 md:p-9 text-center">
          <div className="gazette-band" />
          <p className="gazette-label">Selen Daily</p>
          <h1 className="mt-4 font-['Playfair_Display'] text-4xl md:text-5xl font-bold">
            Abonnement activé
          </h1>
          <p className="mx-auto mt-5 max-w-xl leading-7 text-[#5a4031]">
            Merci. Votre accès Selen Daily est en préparation. Connectez-vous à
            votre espace client pour terminer le paramétrage initial.
          </p>
          <Link href="/client" className="btn-ink mt-7 inline-flex">
            <span>Ouvrir mon espace client</span>
          </Link>
        </article>
      </section>
      <Footer />
    </main>
  );
}
