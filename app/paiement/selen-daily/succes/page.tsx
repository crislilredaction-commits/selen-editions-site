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
            Merci. Votre paiement est confirmé et votre espace Selen Daily est en
            cours d&apos;activation.
          </p>
          <p className="mx-auto mt-4 max-w-xl leading-7 text-[#5a4031]">
            Vous allez recevoir à l&apos;adresse utilisée lors du paiement un email
            intitulé <strong>« Bienvenue dans Selen Daily »</strong>. Il contient
            le lien qui vous permet de créer votre mot de passe puis de commencer
            le paramétrage de votre organisme.
          </p>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#6d5140]">
            L&apos;email arrive généralement en quelques minutes. Si vous ne le voyez
            pas après 10 minutes, vérifiez vos courriers indésirables avant de
            contacter Selen.
          </p>
          <Link href="/client" className="btn-ink mt-7 inline-flex">
            <span>J&apos;ai déjà mes accès</span>
          </Link>
        </article>
      </section>
      <Footer />
    </main>
  );
}
