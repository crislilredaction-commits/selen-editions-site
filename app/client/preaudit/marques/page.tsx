"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { checkPreauditAccess } from "../../../lib/checkPreauditAccess";
import ClientSupportBar from "@/components/ClientSupportBar";

type BrandAnswer = "yes" | "no" | "";
type Diagnostic = "a_verifier" | "majeure" | "conforme";

type BrandQuestion = {
  key: string;
  question: string;
  help: string;
  expectedAnswer: "yes" | "no";
  skipConformityCheck?: boolean;
  condition?: (answers: Record<string, BrandAnswer>) => boolean;
};

function formatAuditType(value?: string | null) {
  if (value === "initial") return "Initial";
  if (value === "surveillance") return "Surveillance";
  if (value === "renouvellement") return "Renouvellement";
  return "Non renseigné";
}

function diagnosticLabel(diagnostic: Diagnostic) {
  if (diagnostic === "majeure") return "⚠️ Risque de non-conformité majeure";
  if (diagnostic === "conforme") return "✅ Conforme selon vos réponses";
  return "… En cours d’analyse";
}

function diagnosticColor(diagnostic: Diagnostic) {
  if (diagnostic === "majeure") return "var(--rust)";
  if (diagnostic === "conforme") return "#6a8a4a";
  return "var(--ink-faint)";
}

function getQuestions(auditType?: string | null): BrandQuestion[] {
  if (auditType === "initial") {
    return [
      {
        key: "initial_website_mentions",
        question:
          "Votre site internet mentionne-t-il Qualiopi, un organisme certificateur ou le Cofrac ?",
        help: "En audit initial, l’organisme n’est pas encore certifié. Il ne doit pas laisser penser qu’une certification est déjà acquise.",
        expectedAnswer: "no",
      },
      {
        key: "initial_email_mentions",
        question:
          "Vos signatures email, emails commerciaux ou documents de présentation mentionnent-ils Qualiopi, un certificateur ou le Cofrac ?",
        help: "Les supports commerciaux ne doivent pas créer de confusion avant l’obtention réelle de la certification.",
        expectedAnswer: "no",
      },
      {
        key: "initial_social_mentions",
        question:
          "Vos réseaux sociaux mentionnent-ils Qualiopi, un certificateur ou le Cofrac ?",
        help: "Les publications, biographies ou visuels ne doivent pas suggérer que l’organisme est déjà certifié.",
        expectedAnswer: "no",
      },
      {
        key: "initial_training_documents_mentions",
        question:
          "Vos programmes, fiches formation, devis, conventions, catalogues ou supports commerciaux mentionnent-ils Qualiopi ?",
        help: "Les documents liés aux formations ne doivent pas intégrer une mention ambiguë ou prématurée.",
        expectedAnswer: "no",
      },
      {
        key: "initial_logo_or_certificate_visible",
        question:
          "Le logo Qualiopi ou un certificat Qualiopi apparaît-il quelque part ?",
        help: "Avant certification, le logo et le certificat ne doivent pas être utilisés.",
        expectedAnswer: "no",
      },
    ];
  }

  return [
    {
      key: "certificate_on_website",
      question: "Le certificat Qualiopi est-il diffusé sur le site internet ?",
      help: "Le certificat doit pouvoir être diffusé ou rendu accessible par un canal vérifiable.",
      expectedAnswer: "yes",
      skipConformityCheck: true,
    },
    {
      key: "certificate_by_email_or_social",
      question:
        "Si le certificat n’est pas diffusé sur le site, est-il diffusé par email ou sur un réseau social ?",
      help: "Cette option permet de couvrir les organismes qui ne diffusent pas le certificat directement sur leur site.",
      expectedAnswer: "yes",
      condition: (answers) => answers.certificate_on_website === "no",
    },
    {
      key: "certificate_diffusion_proof",
      question: "Conservez-vous une preuve de diffusion du certificat ?",
      help: "Exemples : capture du site, email envoyé, publication réseau social, preuve de transmission au client ou au bénéficiaire.",
      expectedAnswer: "yes",
    },
    {
      key: "has_in_person_training",
      question:
        "Réalisez-vous des formations en présentiel, en tout ou partie ?",
      help: "Cette question permet de vérifier si l’affichage du certificat dans les locaux est concerné.",
      expectedAnswer: "yes",
      skipConformityCheck: true,
    },
    {
      key: "certificate_displayed_in_premises",
      question:
        "Si vous réalisez du présentiel, le certificat est-il affiché dans les locaux utilisés pour la formation ?",
      help: "Lorsque les formations se déroulent en présentiel, le certificat doit être affiché dans les locaux concernés.",
      expectedAnswer: "yes",
      condition: (answers) => answers.has_in_person_training === "yes",
    },
    {
      key: "uses_qualiopi_logo",
      question: "Utilisez-vous le logo Qualiopi ?",
      help: "L’utilisation du logo n’est pas obligatoire. Répondez “Non” si vous ne l’utilisez pas.",
      expectedAnswer: "no",
      skipConformityCheck: true,
    },
    {
      key: "logo_has_mandatory_sentence",
      question:
        "Si vous utilisez le logo, est-il toujours accompagné de la phrase obligatoire mentionnant les catégories d’actions certifiées ?",
      help: "La phrase doit préciser les catégories d’actions certifiées : actions de formation, bilans de compétences, VAE ou apprentissage.",
      expectedAnswer: "yes",
      condition: (answers) => answers.uses_qualiopi_logo === "yes",
    },
    {
      key: "logo_only_organization_supports",
      question:
        "Le logo est-il utilisé uniquement sur des supports présentant l’organisme ?",
      help: "Exemples autorisés : page de présentation de l’organisme, signature email, réseaux sociaux, catalogue global ou plaquette institutionnelle.",
      expectedAnswer: "yes",
      condition: (answers) => answers.uses_qualiopi_logo === "yes",
    },
    {
      key: "logo_absent_training_pages",
      question:
        "Le logo est-il absent des pages ou documents présentant une formation en particulier ?",
      help: "Le logo ne doit pas laisser penser qu’une formation précise est certifiée. C’est l’organisme qui est certifié.",
      expectedAnswer: "yes",
      condition: (answers) => answers.uses_qualiopi_logo === "yes",
    },
    {
      key: "logo_absent_training_materials",
      question:
        "Le logo est-il absent des documents utilisés pendant la formation ?",
      help: "Exemples : supports de cours, exercices, feuilles d’émargement, attestations, certificats de réalisation ou documents pédagogiques.",
      expectedAnswer: "yes",
      condition: (answers) => answers.uses_qualiopi_logo === "yes",
    },
    {
      key: "logo_no_training_confusion",
      question:
        "L’usage du logo évite-t-il toute confusion laissant penser qu’une formation est certifiée Qualiopi ?",
      help: "Le logo doit toujours renvoyer à la certification de l’organisme, jamais à une formation isolée.",
      expectedAnswer: "yes",
      condition: (answers) => answers.uses_qualiopi_logo === "yes",
    },
    {
      key: "logo_not_modified",
      question:
        "Le logo respecte-t-il le format officiel, sans modification, détournement ou usage isolé ?",
      help: "Le logo ne doit pas être modifié, recadré, déformé ou utilisé d’une manière qui change son sens.",
      expectedAnswer: "yes",
      condition: (answers) => answers.uses_qualiopi_logo === "yes",
    },
  ];
}

function getVisibleQuestions(
  questions: BrandQuestion[],
  answers: Record<string, BrandAnswer>,
) {
  return questions.filter((q) => {
    if (!q.condition) return true;
    return q.condition(answers);
  });
}

function computeDiagnostic(
  questions: BrandQuestion[],
  answers: Record<string, BrandAnswer>,
): Diagnostic {
  const visibleQuestions = getVisibleQuestions(questions, answers);
  const hasUnanswered = visibleQuestions.some((q) => !answers[q.key]);

  if (hasUnanswered) return "a_verifier";

  const hasIssue = visibleQuestions
    .filter((q) => !q.skipConformityCheck)
    .some((q) => answers[q.key] !== q.expectedAnswer);

  return hasIssue ? "majeure" : "conforme";
}

function getIssues(
  questions: BrandQuestion[],
  answers: Record<string, BrandAnswer>,
) {
  return getVisibleQuestions(questions, answers)
    .filter(
      (q) =>
        !q.skipConformityCheck &&
        answers[q.key] &&
        answers[q.key] !== q.expectedAnswer,
    )
    .map((q) => q.question);
}

export default function BrandUsageCheckPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [auditType, setAuditType] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<Record<string, unknown>>({});
  const [answers, setAnswers] = useState<Record<string, BrandAnswer>>({});
  const [notes, setNotes] = useState("");

  const questions = useMemo(() => getQuestions(auditType), [auditType]);

  const visibleQuestions = useMemo(
    () => getVisibleQuestions(questions, answers),
    [questions, answers],
  );

  const diagnostic = computeDiagnostic(questions, answers);
  const issues = getIssues(questions, answers);

  const answeredCount = visibleQuestions.filter((q) => answers[q.key]).length;

  const progress =
    visibleQuestions.length > 0
      ? Math.round((answeredCount / visibleQuestions.length) * 100)
      : 0;

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        router.push("/client/login");
        return;
      }

      const storedSessionId = localStorage.getItem("preaudit_session_id");

      if (!storedSessionId) {
        router.push("/client/preaudit");
        return;
      }

      const { data, error: loadError } = await supabase.rpc(
        "get_preaudit_brand_usage_check",
        { p_session_id: storedSessionId },
      );

      if (loadError || !data) {
        setError(
          `Impossible de charger la vérification des marques. ${
            loadError?.message ?? ""
          }`,
        );
        setLoading(false);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;

      if (!row?.session_id) {
        setError("Session introuvable dans la réponse du serveur.");
        setLoading(false);
        return;
      }

      setSessionId(row.session_id);
      setAuditType(row.audit_type ?? "initial");
      setProfileData(row.profile_data ?? {});
      setAnswers((row.answers ?? {}) as Record<string, BrandAnswer>);
      setNotes(row.user_notes ?? "");
      setLoading(false);
    }

    load();
  }, [router, supabase]);

  function updateAnswer(questionKey: string, value: BrandAnswer) {
    setAnswers((prev) => ({
      ...prev,
      [questionKey]: value,
    }));
  }

  async function saveCurrentBrandCheck(): Promise<boolean> {
    if (!sessionId) {
      setError("Session préaudit introuvable.");
      return false;
    }

    const currentDiagnostic = computeDiagnostic(questions, answers);

    const { error: saveError } = await supabase.rpc(
      "save_preaudit_brand_usage_check",
      {
        p_session_id: sessionId,
        p_answers: answers,
        p_user_notes: notes,
        p_diagnostic: currentDiagnostic,
      },
    );

    if (saveError) {
      console.error("ERREUR SAVE MARQUES :", {
        message: saveError.message,
        details: saveError.details,
        hint: saveError.hint,
        code: saveError.code,
      });

      setError(
        `Erreur sauvegarde marques : ${saveError.message || saveError.code}`,
      );

      return false;
    }

    return true;
  }

  async function saveAndGoNext() {
    setSaving(true);
    setError("");

    const saved = await saveCurrentBrandCheck();

    if (!saved) {
      setSaving(false);
      return;
    }

    localStorage.setItem("preaudit_brand_usage_checked_at", String(Date.now()));

    setSaving(false);
    router.push("/client/preaudit/1");
  }

  if (loading) {
    return (
      <main
        className="gazette-paper"
        style={{ minHeight: "100vh", padding: "3rem" }}
      >
        <p style={{ textAlign: "center", color: "var(--ink-faint)" }}>
          Chargement de la vérification des marques…
        </p>
      </main>
    );
  }

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <ClientSupportBar context="l’auto-audit Qualiopi" />
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          padding: "2rem 1.5rem 4rem",
        }}
      >
        <header
          className="gazette-cta"
          style={{ padding: "2rem", marginBottom: "1.5rem" }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            <p className="gazette-label">Préaudit Qualiopi</p>

            <h1
              className="gazette-hero-title"
              style={{ color: "var(--parchment)", marginBottom: "0.5rem" }}
            >
              Usage des marques, certificat et logo
            </h1>

            <p style={{ color: "var(--sepia-mid)", lineHeight: 1.6 }}>
              Cette étape vérifie que l’usage de la marque Qualiopi, du
              certificat, du logo, des certificateurs et du Cofrac ne crée pas
              de confusion.
            </p>

            <div style={{ marginTop: "1.25rem" }}>
              <div
                style={{
                  height: "6px",
                  width: "100%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(178,138,98,0.2)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progress}%`,
                    background:
                      "linear-gradient(90deg, var(--ocre-dark), var(--ocre-gold))",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "0.4rem",
                  fontFamily: "var(--font-cinzel, 'Cinzel', serif)",
                  fontSize: "0.58rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(200,168,122,0.6)",
                }}
              >
                <span>
                  {answeredCount} / {visibleQuestions.length} réponses
                </span>
                <span>{progress} %</span>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div
            style={{
              border: "1px solid var(--rust)",
              borderLeft: "4px solid var(--rust)",
              padding: "1rem",
              marginBottom: "1rem",
              color: "var(--rust)",
              background: "rgba(138,75,36,0.05)",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 340px",
            gap: "1.25rem",
            alignItems: "start",
          }}
        >
          <section style={{ display: "grid", gap: "1rem" }}>
            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                borderLeft: "4px solid var(--ocre-dark)",
                padding: "1rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cinzel)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--ocre-dark)",
                  marginBottom: "0.5rem",
                }}
              >
                ✦ Rappel important
              </p>

              {auditType === "initial" ? (
                <p
                  style={{
                    fontSize: "0.92rem",
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                  }}
                >
                  En audit initial, l’organisme n’est pas encore certifié. Il ne
                  doit donc pas mentionner Qualiopi, un certificateur ou le
                  Cofrac d’une manière qui pourrait laisser croire que la
                  certification est déjà obtenue.
                </p>
              ) : (
                <div
                  style={{
                    fontSize: "0.92rem",
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                    display: "grid",
                    gap: "0.6rem",
                  }}
                >
                  <p>
                    En surveillance ou renouvellement, le certificat doit être
                    diffusé ou accessible, et son affichage doit être prévu dans
                    les locaux lorsque les formations se déroulent en
                    présentiel.
                  </p>

                  <p>
                    Le logo Qualiopi n’est pas obligatoire. Lorsqu’il est
                    utilisé, il doit présenter l’organisme certifié, jamais une
                    formation isolée.
                  </p>

                  <p
                    style={{
                      padding: "0.8rem",
                      background: "rgba(178,138,98,0.08)",
                      border: "1px dashed var(--sepia-mid)",
                    }}
                  >
                    Mention obligatoire avec le logo : “La certification qualité
                    a été délivrée au titre de la ou des catégories d’actions
                    suivantes : [catégories certifiées].”
                  </p>
                </div>
              )}
            </div>

            {visibleQuestions.map((q, index) => {
              const value = answers[q.key];

              return (
                <article
                  key={q.key}
                  style={{
                    background: "var(--paper)",
                    border: "1px solid var(--sepia-mid)",
                    padding: "1rem",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-cinzel, serif)",
                      fontSize: "0.65rem",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--ocre-dark)",
                      marginBottom: "0.35rem",
                    }}
                  >
                    Question {index + 1}
                  </p>

                  <h2
                    style={{
                      fontSize: "1rem",
                      color: "var(--ink)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {q.question}
                  </h2>

                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--ink-faint)",
                      fontStyle: "italic",
                      lineHeight: 1.5,
                      marginBottom: "0.75rem",
                    }}
                  >
                    {q.help}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {[
                      { label: "Oui", value: "yes" as BrandAnswer },
                      { label: "Non", value: "no" as BrandAnswer },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateAnswer(q.key, option.value)}
                        style={{
                          padding: "0.45rem 0.9rem",
                          border: "1px solid var(--sepia-mid)",
                          background:
                            value === option.value
                              ? "var(--ocre-gold)"
                              : "transparent",
                          color:
                            value === option.value
                              ? "#1a1410"
                              : "var(--ink-soft)",
                          cursor: "pointer",
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}

            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cinzel)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--ocre-dark)",
                  marginBottom: "0.6rem",
                }}
              >
                Notes ou éléments à vérifier
              </p>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  void saveCurrentBrandCheck();
                }}
                placeholder="Ex : vérifier la signature email, retirer le logo d’un programme, ajouter la phrase obligatoire sous le logo, récupérer une preuve de diffusion du certificat..."
                style={{
                  width: "100%",
                  minHeight: "120px",
                  padding: "0.6rem",
                  border: "1px solid var(--sepia-mid)",
                  background: "rgba(255,255,255,0.6)",
                  fontSize: "0.9rem",
                  color: "var(--ink-soft)",
                  resize: "vertical",
                }}
              />
            </div>
          </section>

          <aside
            style={{
              position: "sticky",
              top: "1.5rem",
              display: "grid",
              gap: "0.9rem",
            }}
          >
            <div
              style={{
                border: "1px solid var(--sepia-mid)",
                borderLeft: `4px solid ${diagnosticColor(diagnostic)}`,
                background:
                  diagnostic === "majeure"
                    ? "rgba(138,75,36,0.07)"
                    : diagnostic === "conforme"
                      ? "rgba(80,120,60,0.07)"
                      : "rgba(90,64,49,0.05)",
                padding: "1rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cinzel)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--ocre-dark)",
                  marginBottom: "0.5rem",
                }}
              >
                ✦ Diagnostic
              </p>

              <p
                style={{
                  fontWeight: 700,
                  color: diagnosticColor(diagnostic),
                  marginBottom: "0.35rem",
                }}
              >
                {diagnosticLabel(diagnostic)}
              </p>

              <p
                style={{
                  fontSize: "0.92rem",
                  color: "var(--ink-faint)",
                  lineHeight: 1.5,
                }}
              >
                {diagnostic === "majeure"
                  ? "Un ou plusieurs usages semblent non conformes ou ambigus. Ils doivent être corrigés avant audit."
                  : diagnostic === "conforme"
                    ? "Les réponses ne montrent pas de problème d’usage des marques."
                    : "Répondez aux questions pour obtenir un premier diagnostic."}
              </p>
            </div>

            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cinzel)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--ocre-dark)",
                  marginBottom: "0.6rem",
                }}
              >
                Points à corriger
              </p>

              {issues.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gap: "0.45rem",
                    fontSize: "0.9rem",
                    color: "var(--ink-soft)",
                  }}
                >
                  {issues.map((issue, index) => (
                    <div
                      key={index}
                      style={{
                        borderLeft: "2px solid var(--rust)",
                        paddingLeft: "0.5rem",
                        lineHeight: 1.4,
                      }}
                    >
                      ⚠️ {issue}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--ink-faint)", fontSize: "0.92rem" }}>
                  Aucun point bloquant détecté pour l’instant.
                </p>
              )}
            </div>

            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cinzel)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--ocre-dark)",
                  marginBottom: "0.6rem",
                }}
              >
                Profil d’audit
              </p>

              <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>
                Type : {formatAuditType(auditType)}
              </p>

              <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>
                Catégories :{" "}
                {Array.isArray(profileData.action_categories)
                  ? profileData.action_categories.join(", ")
                  : "Non renseigné"}
              </p>
            </div>

            <div style={{ display: "grid", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => router.push("/client/preaudit")}
                className="btn-ink"
              >
                <span>← Modifier mon profil</span>
              </button>

              <button
                type="button"
                onClick={saveAndGoNext}
                disabled={saving}
                className="btn-ink"
                style={{
                  opacity: saving ? 0.45 : 1,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                <span>
                  {saving ? "Sauvegarde…" : "Continuer vers l’indicateur 1 →"}
                </span>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
