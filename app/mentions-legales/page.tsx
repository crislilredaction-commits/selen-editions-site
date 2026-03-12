import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function MentionsLegalesPage() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />

      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="gazette-card p-8 md:p-10">
          <div className="gazette-band" />
          <p className="gazette-label">Informations légales</p>

          <h1 className="mt-4 text-4xl font-bold md:text-5xl">
            Mentions légales
          </h1>

          <div className="mt-8 space-y-8 leading-8 text-[#5a4031]">
            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Éditeur du site
              </h2>
              <p className="mt-3">
                Le site <strong>selen-editions.fr</strong> est édité par :
              </p>
              <p className="mt-3">
                <strong>Selen Editions</strong>
                <br />
                Statut juridique : Entreprise individuelle
                <br />
                Adresse : 1, rue de Vallant, Droupt Saint Basle
                <br />
                Email : hello@selen-editions.fr
                <br />
                Numéro SIRET : 81772377800038
                <br />
                Directeur de la publication : Pascale Barthaux
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Hébergement
              </h2>
              <p className="mt-3">Le site est hébergé par :</p>
              <p className="mt-3">
                <strong>Vercel Inc.</strong>
                <br />
                440 N Barranca Ave #4133
                <br />
                Covina, CA 91723
                <br />
                États-Unis
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Propriété intellectuelle
              </h2>
              <p className="mt-3">
                L’ensemble des contenus présents sur ce site, notamment les
                textes, visuels, logos, mascottes, illustrations, éléments
                graphiques, structure du site et univers visuel, sont protégés
                par le droit de la propriété intellectuelle.
              </p>
              <p className="mt-3">
                Sauf mention contraire, ces éléments sont la propriété exclusive
                de Selen Editions. Toute reproduction, représentation,
                adaptation, diffusion ou exploitation, même partielle, sans
                autorisation écrite préalable est interdite.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[#3e2a1f]">
                Responsabilité
              </h2>
              <p className="mt-3">
                Les informations diffusées sur le site sont fournies à titre
                informatif. Selen Editions s’efforce de proposer des contenus
                exacts et à jour, sans pouvoir garantir l’absence totale
                d’erreurs, d’omissions ou d’indisponibilités.
              </p>
              <p className="mt-3">
                L’utilisateur reste seul responsable de l’usage qu’il fait des
                informations consultées sur le site.
              </p>
            </section>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
