import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function PolitiqueConfidentialitePage() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />

      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="gazette-card p-8 md:p-10">
          <div className="gazette-band" />
          <p className="gazette-label">Protection des données</p>

          <h1 className="mt-4 text-4xl font-bold md:text-5xl">
            Politique de confidentialité
          </h1>

          <div className="mt-8 space-y-8 leading-8 text-[#5a4031]">
            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Données collectées
              </h2>
              <p className="mt-3">
                Selen Editions peut être amené à collecter certaines données
                personnelles lorsque vous utilisez le site, remplissez un
                formulaire, réservez un appel, téléchargez une ressource ou
                prenez contact.
              </p>
              <p className="mt-3">
                Ces données peuvent inclure, selon les cas : nom, prénom,
                adresse email, numéro de téléphone, nom de structure,
                informations relatives à vos besoins ou à votre activité.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Finalités du traitement
              </h2>
              <p className="mt-3">
                Les données collectées sont utilisées pour :
              </p>
              <ul className="mt-3 list-disc pl-6">
                <li>répondre à vos demandes de contact ;</li>
                <li>organiser un échange ou un rendez-vous ;</li>
                <li>envoyer des informations, ressources ou documents ;</li>
                <li>proposer des prestations adaptées à votre situation ;</li>
                <li>
                  assurer le suivi administratif et commercial de la relation.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Base légale
              </h2>
              <p className="mt-3">
                Les traitements sont fondés, selon les cas, sur votre
                consentement, l’exécution de mesures précontractuelles ou
                contractuelles, ou l’intérêt légitime de Selen Editions à
                développer et sécuriser son activité.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Durée de conservation
              </h2>
              <p className="mt-3">
                Les données sont conservées pendant une durée proportionnée à la
                finalité pour laquelle elles ont été collectées.
              </p>
              <p className="mt-3">
                Les données de contact peuvent notamment être conservées pendant
                la durée nécessaire au suivi de la relation commerciale, puis
                archivées ou supprimées conformément aux obligations légales.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Destinataires des données
              </h2>
              <p className="mt-3">
                Les données sont destinées à Selen Editions et, si nécessaire, à
                certains prestataires techniques utilisés pour le fonctionnement
                du site ou l’organisation de rendez-vous, dans la limite
                nécessaire à leurs missions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Vos droits
              </h2>
              <p className="mt-3">
                Conformément à la réglementation applicable, vous disposez d’un
                droit d’accès, de rectification, d’effacement, d’opposition, de
                limitation et, dans certains cas, de portabilité de vos données.
              </p>
              <p className="mt-3">
                Vous pouvez exercer ces droits en écrivant à :
                <br />
                <strong>hello@selen-editions.fr</strong>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Cookies et outils tiers
              </h2>
              <p className="mt-3">
                Le site peut utiliser des outils techniques ou services tiers
                nécessaires à son bon fonctionnement, à la mesure d’audience ou
                à la prise de rendez-vous. Une information complémentaire pourra
                être affichée si des cookies ou traceurs non strictement
                nécessaires sont mis en place.
              </p>
            </section>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
