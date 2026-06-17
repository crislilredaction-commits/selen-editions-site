import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";

export default function PrepaNdaSuccessPage() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />

      <section className="mx-auto max-w-4xl px-4 md:px-6 py-16 md:py-24">
        <div className="gazette-card p-6 md:p-10 text-center">
          <p className="gazette-label">Paiement confirmé</p>

          <h1 className="mt-4 font-['Playfair_Display'] text-4xl md:text-5xl font-bold leading-tight">
            Votre dossier Prépa NDA est en cours d’ouverture
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base md:text-lg leading-8 text-[#5a4031]">
            Merci pour votre confiance. Votre paiement a bien été validé. Votre
            espace client Selen va être activé automatiquement et votre dossier
            Prépa NDA sera ouvert dans Studio.
          </p>

          <div className="mt-8 border border-[#b28a62]/30 bg-[#f8efdf]/70 p-5 text-left">
            <h2 className="font-['Playfair_Display'] text-2xl font-bold">
              Et maintenant ?
            </h2>

            <ul className="mt-4 grid gap-3 text-[#5a4031] leading-7">
              <li className="flex gap-3">
                <span className="text-[#b28a62] shrink-0">✦</span>
                <span>
                  Vous allez recevoir un email contenant votre lien d’accès à
                  l’espace client Selen.
                </span>
              </li>

              <li className="flex gap-3">
                <span className="text-[#b28a62] shrink-0">✦</span>
                <span>
                  Depuis votre espace, vous pourrez déposer les premières pièces
                  nécessaires à la préparation de votre dossier NDA.
                </span>
              </li>

              <li className="flex gap-3">
                <span className="text-[#b28a62] shrink-0">✦</span>
                <span>
                  Un agent Selen vérifiera ensuite votre dossier et vous
                  accompagnera jusqu’au dépôt sur Mon Activité Formation.
                </span>
              </li>
            </ul>
          </div>

          <p className="mt-6 text-sm leading-6 text-[#6e4a32]">
            Si l’email n’arrive pas dans les prochaines minutes, pensez à
            vérifier vos spams. Vous pourrez aussi nous écrire à{" "}
            <a
              href="mailto:hello@selen-editions.fr"
              className="underline underline-offset-4"
            >
              hello@selen-editions.fr
            </a>
            .
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/client" className="btn-ink text-center">
              <span>Accéder à mon espace client</span>
            </Link>

            <Link href="/nos-prestations" className="btn-ghost text-center">
              <span>Retour aux prestations</span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
