import Link from "next/link";

const card = {
  display: "grid",
  gap: 10,
  padding: 22,
  border: "1px solid #eadfce",
  borderRadius: 18,
  background: "#fffdf8",
  color: "#3d2d26",
  textDecoration: "none",
  boxShadow: "0 8px 24px rgba(68, 42, 28, 0.06)",
} as const;

export default function DailyNewFormationPage() {
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px 56px", color: "#3d2d26" }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#8a4b24" }}>
        Selen Daily · Nouvelle formation
      </p>
      <h1 style={{ margin: "8px 0 10px", fontSize: "clamp(30px, 5vw, 46px)", lineHeight: 1.05 }}>Comment souhaitez-vous créer la formation ?</h1>
      <p style={{ maxWidth: 720, margin: "0 0 26px", color: "#705e53", lineHeight: 1.6 }}>
        Vous pouvez partir de votre programme existant ou renseigner la formation directement dans Selen. Votre document original reste la référence lorsqu’il est importé.
      </p>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }} aria-label="Choix du mode de création">
        <Link href="/client/daily/formations?creation=programme" style={card}>
          <span aria-hidden="true" style={{ fontSize: 28 }}>📄</span>
          <strong style={{ fontSize: 20 }}>Importer mon programme</strong>
          <span style={{ color: "#705e53", lineHeight: 1.55 }}>
            Pour un programme déjà rédigé en PDF ou Word. Selen conserve le fichier original et vous guide ensuite uniquement sur les informations complémentaires nécessaires.
          </span>
          <span style={{ fontWeight: 800, color: "#8a4b24" }}>Choisir l’import →</span>
        </Link>

        <Link href="/client/daily/formations?creation=formulaire" style={card}>
          <span aria-hidden="true" style={{ fontSize: 28 }}>✍️</span>
          <strong style={{ fontSize: 20 }}>Remplir le formulaire Selen</strong>
          <span style={{ color: "#705e53", lineHeight: 1.55 }}>
            Pour construire le programme dans Selen à partir des champs structurés de la formation.
          </span>
          <span style={{ fontWeight: 800, color: "#8a4b24" }}>Choisir le formulaire →</span>
        </Link>
      </section>

      <aside style={{ marginTop: 22, padding: "16px 18px", borderRadius: 14, background: "#f7f0e5", lineHeight: 1.55 }}>
        <strong>Dans les deux cas :</strong> Selen vous demandera séparément si la formation comporte des prérequis, puis vous proposera le positionnement et l’évaluation finale. Le dépôt d’un justificatif de prérequis ne vaudra jamais validation automatique.
      </aside>
    </main>
  );
}
