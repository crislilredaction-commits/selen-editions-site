import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function CgvCguPage() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />

      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="gazette-card p-8 md:p-10">
          <div className="gazette-band" />
          <p className="gazette-label">Conditions</p>

          <h1 className="mt-4 text-4xl font-bold md:text-5xl">CGV / CGU</h1>

          <div className="mt-8 space-y-8 leading-8 text-[#5a4031]">
            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Conditions générales d’utilisation
              </h2>

              <p className="mt-3">
                Les présentes conditions générales d’utilisation ont pour objet
                de définir les modalités d’accès et d’utilisation du site
                <strong> selen-editions.fr</strong>.
              </p>

              <p className="mt-3">
                Toute navigation sur le site implique l’acceptation pleine et
                entière des présentes conditions.
              </p>

              <p className="mt-3">
                Le site présente des informations relatives aux prestations,
                outils, ressources et contenus éditoriaux proposés par Selen
                Editions. Ces informations sont fournies à titre informatif et
                ne constituent pas un conseil juridique individualisé.
              </p>

              <p className="mt-3">
                Selen Editions se réserve le droit de modifier, suspendre ou
                interrompre tout ou partie du site à tout moment, sans préavis.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Conditions générales de vente
              </h2>

              <p className="mt-3">
                Les présentes conditions générales de vente s’appliquent aux
                prestations proposées par Selen Editions, notamment les
                accompagnements administratifs, les audits blancs, les
                préparations Qualiopi, les prestations de gestion quotidienne et
                les outils ou services numériques proposés à la vente.
              </p>

              <p className="mt-3">
                Toute commande ou validation d’un devis implique l’acceptation
                pleine et entière des présentes conditions.
              </p>

              <p className="mt-3">
                Les prestations sont décrites sur le site, par devis, ou dans
                tout document commercial transmis au client. Les tarifs sont
                indiqués en euros. Sauf mention contraire, ils peuvent être
                modifiés à tout moment pour les futures commandes.
              </p>

              <p className="mt-3">
                Les modalités de paiement, délais d’exécution, conditions
                particulières, livrables et éventuelles limitations sont
                précisés dans le devis, le contrat ou la proposition commerciale
                transmise au client.
              </p>

              <p className="mt-3">
                En cas de prestation intellectuelle ou d’accompagnement
                personnalisé déjà commencé, aucun remboursement ne pourra être
                exigé pour la partie déjà réalisée, sauf disposition légale
                contraire.
              </p>

              <p className="mt-3">
                Selen Editions est tenue à une obligation de moyens et non de
                résultat. Le client demeure responsable de ses choix, de ses
                documents, de ses déclarations et de l’usage qu’il fait des
                outils, contenus ou recommandations fournis.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Litiges et droit applicable
              </h2>

              <p className="mt-3">
                Les présentes CGU et CGV sont soumises au droit français.
              </p>

              <p className="mt-3">
                En cas de litige, les parties s’efforceront de rechercher une
                solution amiable avant toute action judiciaire. À défaut
                d’accord amiable, les tribunaux compétents seront ceux du
                ressort de l’éditeur du site, sauf disposition légale impérative
                contraire.
              </p>
            </section>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
