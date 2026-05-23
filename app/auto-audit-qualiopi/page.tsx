import Link from "next/link";

export default function AutoAuditQualiopiPage() {
  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "2rem 1.5rem 4rem",
        }}
      >
        <header
          className="gazette-cta"
          style={{ padding: "2.2rem", marginBottom: "1.5rem" }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            <p className="gazette-label">Auto-audit Qualiopi</p>

            <h1
              className="gazette-hero-title"
              style={{
                color: "var(--parchment)",
                marginBottom: "0.7rem",
                maxWidth: 850,
              }}
            >
              Vérifiez votre conformité Qualiopi avant que l’auditeur ne le
              fasse
            </h1>

            <p
              style={{
                color: "var(--sepia-mid)",
                lineHeight: 1.7,
                maxWidth: 760,
                fontSize: "1rem",
              }}
            >
              Un outil guidé pour identifier vos indicateurs applicables,
              repérer les risques de non-conformité, télécharger les modèles
              utiles et repartir avec un plan d’action clair.
            </p>

            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                flexWrap: "wrap",
                marginTop: "1.4rem",
              }}
            >
              <Link
                href="/paiement/auto-audit?offre=unique"
                className="btn-ink"
              >
                <span>Commencer mon auto-audit — 99 €</span>
              </Link>

              <Link
                href="/paiement/auto-audit?offre=trois-fois"
                className="btn-ink"
              >
                <span>Payer en 3 × 33 €</span>
              </Link>
            </div>
          </div>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          {[
            {
              title: "Vous savez quoi corriger",
              text: "L’outil vous indique les indicateurs en défaut, les points à vérifier et les priorités avant votre audit.",
            },
            {
              title: "Vous gagnez du temps",
              text: "Plus besoin de relire seul le référentiel pendant des heures : chaque indicateur est expliqué en langage clair.",
            },
            {
              title: "Vous repartez avec un plan",
              text: "À la fin, vous téléchargez un fichier Excel avec vos notes, vos diagnostics et les actions à mener.",
            },
          ].map((item) => (
            <article
              key={item.title}
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                borderLeft: "4px solid var(--ocre-dark)",
                padding: "1.1rem",
              }}
            >
              <p className="gazette-label">✦</p>
              <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                {item.title}
              </h2>
              <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
                {item.text}
              </p>
            </article>
          ))}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)",
            gap: "1.25rem",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "1rem" }}>
            <article
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1.2rem",
              }}
            >
              <p className="gazette-label">Ce que contient l’accès</p>

              <h2 style={{ color: "var(--ink)", marginBottom: "0.7rem" }}>
                Un parcours complet, indicateur par indicateur
              </h2>

              <div
                style={{
                  display: "grid",
                  gap: "0.65rem",
                  color: "var(--ink-soft)",
                  lineHeight: 1.6,
                }}
              >
                <p>
                  ✅ Questionnaire profil pour déterminer vos indicateurs
                  applicables.
                </p>
                <p>
                  ✅ Vérification de l’usage des marques Qualiopi, du certificat
                  et du logo.
                </p>
                <p>
                  ✅ Questions guidées pour chaque indicateur du référentiel.
                </p>
                <p>
                  ✅ Diagnostic : conforme, à vérifier, risque mineur ou risque
                  majeur.
                </p>
                <p>✅ Documents modèles proposés selon vos réponses.</p>
                <p>
                  ✅ Notes personnelles pour préparer votre dossier d’audit.
                </p>
                <p>✅ Bilan final avec export Excel et pistes de correction.</p>
              </div>
            </article>

            <article
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1.2rem",
              }}
            >
              <p className="gazette-label">Pour qui ?</p>

              <h2 style={{ color: "var(--ink)", marginBottom: "0.7rem" }}>
                Formateurs, OF, CFA, VAE, bilans de compétences
              </h2>

              <p style={{ color: "var(--ink-soft)", lineHeight: 1.7 }}>
                L’auto-audit s’adresse aux organismes de formation, formateurs
                indépendants, CFA, prestataires VAE et bilans de compétences qui
                veulent vérifier leur niveau de préparation avant un audit
                initial, de surveillance ou de renouvellement.
              </p>
            </article>

            <article
              style={{
                background: "rgba(178,138,98,0.08)",
                border: "1px dashed var(--sepia-mid)",
                padding: "1.2rem",
              }}
            >
              <p className="gazette-label">Important</p>

              <h2 style={{ color: "var(--ink)", marginBottom: "0.7rem" }}>
                Ce n’est pas une certification
              </h2>

              <p style={{ color: "var(--ink-soft)", lineHeight: 1.7 }}>
                L’auto-audit ne remplace pas la décision d’un certificateur et
                ne garantit pas l’obtention ou le maintien de la certification.
                Il vous aide à repérer vos points faibles, structurer vos
                corrections et préparer votre dossier plus sereinement.
              </p>
            </article>
          </div>

          <aside
            id="tarifs"
            style={{
              position: "sticky",
              top: "1.5rem",
              display: "grid",
              gap: "1rem",
            }}
          >
            <article
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                borderLeft: "4px solid var(--ocre-gold)",
                padding: "1.2rem",
              }}
            >
              <p className="gazette-label">Tarif</p>

              <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                3 mois d’accès
              </h2>

              <p
                style={{
                  fontSize: "2.2rem",
                  color: "var(--ocre-dark)",
                  margin: "0.2rem 0",
                  fontWeight: 700,
                }}
              >
                99 €
              </p>

              <p
                style={{
                  color: "var(--ink-faint)",
                  fontSize: "0.92rem",
                  lineHeight: 1.5,
                  marginBottom: "1rem",
                }}
              >
                Paiement en une fois, accès à l’auto-audit pendant 3 mois.
              </p>

              <Link
                href="/paiement/auto-audit?offre=unique"
                className="btn-ink"
              >
                <span>Payer 99 €</span>
              </Link>
            </article>

            <article
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1.2rem",
              }}
            >
              <p className="gazette-label">Paiement fractionné</p>

              <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                3 × 33 €
              </h2>

              <p
                style={{
                  color: "var(--ink-faint)",
                  fontSize: "0.92rem",
                  lineHeight: 1.5,
                  marginBottom: "1rem",
                }}
              >
                Même accès de 3 mois, paiement en trois fois.
              </p>

              <Link
                href="/paiement/auto-audit?offre=trois-fois"
                className="btn-ink"
              >
                <span>Choisir 3 × 33 €</span>
              </Link>
            </article>

            <article
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1.2rem",
              }}
            >
              <p className="gazette-label">Après l’auto-audit</p>

              <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                Audit blanc à tarif réservé
              </h2>

              <p
                style={{
                  color: "var(--ink-soft)",
                  fontSize: "0.92rem",
                  lineHeight: 1.6,
                }}
              >
                Après avoir réalisé votre auto-audit, vous pourrez réserver un
                audit blanc avec un auditeur certifié au tarif réservé de{" "}
                <strong>199 €</strong>.
              </p>

              <p
                style={{
                  color: "var(--ink-faint)",
                  fontSize: "0.86rem",
                  lineHeight: 1.5,
                  marginTop: "0.6rem",
                }}
              >
                L’audit blanc direct, sans auto-audit préalable, sera proposé à
                397 €.
              </p>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}
