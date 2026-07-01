"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { checkPreauditAccess } from "../../../lib/checkPreauditAccess";
import ClientSupportBar from "@/components/ClientSupportBar";

type Answer = "yes" | "partial" | "no" | "unknown";
type Diagnostic = "a_verifier" | "majeure" | "mineure" | "conforme";

type Question = {
  id: string;
  question_order: number;
  question: string;
  help_text: string | null;
  is_critical: boolean;
  affects_major: boolean;
  affects_minor: boolean;
  display_condition: Record<string, unknown> | null;
};

type SummaryRow = {
  indicatorNumber: number;
  title: string;
  diagnostic: Diagnostic;
  answeredCount: number;
  totalQuestions: number;
  issues: string[];
  note: string;
  advice: string;
};

type BrandSummary = {
  diagnostic: string;
  user_notes: string;
};

function computeDiagnostic(
  indicatorNumber: number,
  questions: Question[],
  answers: Record<string, Answer>,
): Diagnostic {
  let hasMajor = false;
  let hasMinor = false;
  let answered = 0;

  questions.forEach((q) => {
    const answer = answers[q.id];

    if (!answer) return;

    answered++;

    if (answer === "no") {
      if (q.affects_major) hasMajor = true;
      else if (q.affects_minor) hasMinor = true;
    }

    if (answer === "partial") {
      if (
        (indicatorNumber === 10 ||
          indicatorNumber === 11 ||
          indicatorNumber === 12 ||
          indicatorNumber === 14 ||
          indicatorNumber === 15 ||
          indicatorNumber === 16 ||
          indicatorNumber === 20 ||
          indicatorNumber === 21 ||
          indicatorNumber === 22 ||
          indicatorNumber === 26 ||
          indicatorNumber === 27 ||
          indicatorNumber === 28 ||
          indicatorNumber === 29 ||
          indicatorNumber === 31 ||
          indicatorNumber === 32) &&
        q.affects_major
      ) {
        hasMajor = true;
      } else {
        hasMinor = true;
      }
    }
  });

  if (questions.length === 0) return "a_verifier";

  const requiredAnswers = Math.min(5, questions.length);

  if (answered < requiredAnswers) return "a_verifier";
  if (hasMajor) return "majeure";
  if (hasMinor) return "mineure";
  return "conforme";
}

function getIssues(questions: Question[], answers: Record<string, Answer>) {
  const issues: string[] = [];

  questions.forEach((q) => {
    const answer = answers[q.id];

    if (!answer) return;

    if (answer === "no" && q.affects_major) {
      issues.push(`❌ ${q.question}`);
    }

    if (answer === "partial" && q.affects_major) {
      issues.push(`⚠️ ${q.question}`);
    }

    if (answer === "no" && q.affects_minor) {
      issues.push(`⚠️ ${q.question}`);
    }
  });

  return issues;
}

function diagnosticLabel(diagnostic: Diagnostic) {
  if (diagnostic === "majeure") return "Non-conformité majeure probable";
  if (diagnostic === "mineure") return "Non-conformité mineure probable";
  if (diagnostic === "conforme") return "Conforme selon vos réponses";
  return "À vérifier";
}

function diagnosticEmoji(diagnostic: Diagnostic) {
  if (diagnostic === "majeure") return "🔴";
  if (diagnostic === "mineure") return "🟠";
  if (diagnostic === "conforme") return "✅";
  return "⚪";
}

function diagnosticColor(diagnostic: Diagnostic) {
  if (diagnostic === "majeure") return "var(--rust)";
  if (diagnostic === "mineure") return "var(--ocre-gold)";
  if (diagnostic === "conforme") return "#6a8a4a";
  return "var(--ink-faint)";
}

function getVisibleQuestions(
  questions: Question[],
  profileData: Record<string, unknown>,
) {
  return questions.filter((q) => {
    const condition = q.display_condition ?? {};

    if (Object.keys(condition).length === 0) return true;

    const key = condition.profile_question_key as string | undefined;
    const operator = condition.operator as string | undefined;
    const value = condition.value;

    if (!key) return true;

    const actual = profileData[key];

    if (operator === "equals") {
      return actual === value;
    }

    if (operator === "contains") {
      return Array.isArray(actual) && actual.includes(value);
    }

    return true;
  });
}

function getAdvice(indicatorNumber: number, diagnostic: Diagnostic) {
  if (diagnostic === "conforme") {
    return "Conserver les preuves et vérifier qu’elles sont faciles à retrouver le jour de l’audit.";
  }

  if (diagnostic === "a_verifier") {
    return "Compléter les réponses manquantes, vérifier les preuves disponibles et relancer le préaudit après mise à jour.";
  }

  const common =
    "Identifier les preuves manquantes, compléter ou corriger les documents concernés, conserver une trace datée, puis refaire le préaudit.";

  const advices: Record<number, string> = {
    1: "Compléter les informations publiques avant contractualisation : programme, prérequis, délais, tarifs, accessibilité, résultats et contacts. Vérifier que ces informations sont accessibles avant signature.",
    2: "Définir des indicateurs de résultats adaptés, indiquer la période et le volume concernés, puis les diffuser au public.",
    4: "Formaliser l’analyse du besoin avant l’entrée en formation et conserver la preuve du recueil des informations.",
    5: "Reformuler les objectifs en compétences observables et vérifier que les évaluations permettent de mesurer leur atteinte.",
    6: "Relier les contenus, moyens, modalités et adaptations aux besoins identifiés en amont.",
    7: "Créer ou compléter le tableau de correspondance entre référentiel, compétences, contenus et évaluations.",
    8: "Mettre en place un positionnement avant l’entrée en formation et tracer les adaptations décidées.",
    9: "Transmettre les informations avant démarrage et conserver la preuve d’envoi ou de remise.",
    10: "Tracer la réalisation effective de la prestation : émargement, planning, suivi, adaptations, échanges et preuves d’accompagnement.",
    11: "Relier chaque objectif à une modalité d’évaluation et conserver les résultats des bénéficiaires.",
    12: "Mettre en place un suivi des présences, absences, abandons et relances avec preuves de traitement.",
    13: "Formaliser la coordination centre / entreprise / apprenti à l’aide d’un livret ou carnet de liaison.",
    14: "Tracer les actions d’accompagnement socio-professionnel, éducatif et citoyen proposées aux apprentis.",
    15: "Prouver la transmission des droits, devoirs, règles de santé et sécurité aux apprentis.",
    16: "Formaliser la procédure de présentation à la certification et conserver les preuves de respect des exigences du certificateur.",
    17: "Vérifier que les moyens humains, techniques, matériels et locaux sont adaptés à la prestation auditée.",
    18: "Identifier les fonctions nécessaires, même si elles sont portées par une seule personne, et conserver les preuves de coordination.",
    19: "Prouver la mise à disposition effective des ressources pédagogiques : email, espace en ligne, remise en main propre ou autre trace.",
    20: "Identifier les référents, le conseil de perfectionnement et les actions associées, avec preuves de fonctionnement.",
    21: "Regrouper les diplômes, attestations, certifications et justificatifs de compétences des intervenants.",
    22: "Formaliser le plan de développement des compétences, même pour un indépendant, et conserver les preuves de formation ou veille.",
    23: "Tracer la veille légale et réglementaire, l’analyse réalisée et les mises à jour éventuelles.",
    24: "Tracer la veille métier et montrer comment elle influence les contenus, supports ou prestations.",
    25: "Tracer la veille pédagogique et technologique, avec analyse et décision d’intégration ou non.",
    26: "Identifier un réseau handicap mobilisable et compléter les coordonnées des acteurs locaux.",
    27: "Sécuriser la sous-traitance avec contrat, charte Qualiopi et preuves de contrôle des interventions.",
    28: "Formaliser les partenaires socio-économiques mobilisés et conserver les preuves d’échanges ou conventions.",
    29: "Tracer les actions d’insertion ou de poursuite d’études proposées aux apprentis.",
    30: "Organiser le recueil de satisfaction, prévoir les relances et conserver les retours des parties prenantes.",
    31: "Tracer chaque difficulté, aléa ou réclamation : réception, analyse, réponse, action et clôture.",
    32: "Transformer les retours, aléas et réclamations en actions d’amélioration suivies et prouvées.",
  };

  return advices[indicatorNumber] ?? common;
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeExcelCell(value: unknown) {
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function downloadExcel(rows: SummaryRow[], brandSummary: BrandSummary | null) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);

  const excelRows = [
    [
      "Indicateur",
      "Titre",
      "Diagnostic",
      "Réponses",
      "Points à corriger",
      "Notes prises pendant le préaudit",
      "Comment régler la non-conformité",
    ],
    ...(brandSummary
      ? [
          [
            "Usage des marques",
            "Vérification Qualiopi / certificat / logo",
            brandSummary.diagnostic,
            "-",
            brandSummary.diagnostic === "conforme"
              ? "Aucun point bloquant détecté."
              : "Vérifier les règles d’usage du certificat, du logo et des mentions Qualiopi.",
            brandSummary.user_notes || "",
            "Corriger les supports concernés, retirer les usages ambigus et vérifier la présence de la mention obligatoire lorsque le logo est utilisé.",
          ],
        ]
      : []),
    ...rows.map((row) => [
      `Indicateur ${row.indicatorNumber}`,
      row.title,
      diagnosticLabel(row.diagnostic),
      `${row.answeredCount}/${row.totalQuestions}`,
      row.issues.length
        ? row.issues.join("\n")
        : "Aucun point bloquant détecté.",
      row.note || "",
      row.advice,
    ]),
  ];

  const xmlRows = excelRows
    .map(
      (row) => `<Row>${row.map((cell) => makeExcelCell(cell)).join("")}</Row>`,
    )
    .join("");

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Bilan préaudit">
    <Table>${xmlRows}</Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `bilan-preaudit-qualiopi-${date}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatAuditType(value?: string | null) {
  if (value === "initial") return "Initial";
  if (value === "surveillance") return "Surveillance";
  if (value === "renouvellement") return "Renouvellement";
  return "Non renseigné";
}

function formatCategories(categories: string[]) {
  if (!categories.length) return "Non renseigné";

  return categories
    .map((category) => {
      if (category === "AF") return "Actions de formation";
      if (category === "BDC") return "Bilans de compétences";
      if (category === "BC") return "Bilans de compétences";
      if (category === "BILAN") return "Bilans de compétences";
      if (category === "VAE") return "VAE";
      if (category === "CFA") return "Apprentissage / CFA";
      return category;
    })
    .join(", ");
}

export default function PreauditFinalPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [brandSummary, setBrandSummary] = useState<BrandSummary | null>(null);
  const [auditType, setAuditType] = useState<string | null>(null);
  const [isNewEntrant, setIsNewEntrant] = useState(false);
  const [certificationCategories, setCertificationCategories] = useState<
    string[]
  >([]);
  const [canModifyPreaudit, setCanModifyPreaudit] = useState(false);

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPurpose, setContactPurpose] = useState("audit_blanc");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState("");

  const defectiveRows = summaryRows.filter(
    (row) => row.diagnostic === "majeure" || row.diagnostic === "mineure",
  );

  const toVerifyRows = summaryRows.filter(
    (row) => row.diagnostic === "a_verifier",
  );

  const conformeRows = summaryRows.filter(
    (row) => row.diagnostic === "conforme",
  );

  useEffect(() => {
    async function loadFinalSummary() {
      setLoading(true);
      setError("");

      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        router.push("/client/login");
        return;
      }

      const accessCheck = await checkPreauditAccess(supabase);
      setCanModifyPreaudit(accessCheck.ok);

      const storedSessionId = localStorage.getItem("preaudit_session_id");

      if (!storedSessionId) {
        router.push("/client/preaudit");
        return;
      }

      setSessionId(storedSessionId);

      const { data: pageRaw, error: sessionError } = await supabase.rpc(
        "get_preaudit_profile_page",
        { p_session_id: storedSessionId },
      );

      if (sessionError || !pageRaw) {
        setError(
          `Impossible de charger le bilan du préaudit. ${
            sessionError?.message ?? ""
          }`,
        );
        setLoading(false);
        return;
      }

      const page = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;
      const sessionRow = page.session;

      if (!sessionRow?.id) {
        setError("Session préaudit introuvable.");
        setLoading(false);
        return;
      }

      const applicableIndicators: number[] =
        sessionRow.applicable_indicators ?? [];

      const rawProfileData = sessionRow.profile_data ?? {};

      const categories = Array.isArray(rawProfileData.action_categories)
        ? rawProfileData.action_categories.map(String)
        : [];

      setAuditType(sessionRow.audit_type ?? null);
      setIsNewEntrant(Boolean(sessionRow.is_new_entrant));
      setCertificationCategories(categories);

      const profileData = {
        ...rawProfileData,
        is_new_entrant: sessionRow.is_new_entrant ?? false,
        audit_type: sessionRow.audit_type ?? null,
      };

      const rows = await Promise.all(
        applicableIndicators.map(async (indicatorNumber) => {
          const { data: indicatorData } = await supabase
            .from("preaudit_indicators")
            .select("title, simplified_title")
            .eq("number", indicatorNumber)
            .single();

          const { data: questionData } = await supabase
            .from("preaudit_questions")
            .select(
              "id, question_order, question, help_text, is_critical, affects_major, affects_minor, display_condition",
            )
            .eq("indicator_number", indicatorNumber)
            .order("question_order", { ascending: true });

          const allQuestions = (questionData ?? []) as Question[];
          const visibleQuestions = getVisibleQuestions(
            allQuestions,
            profileData,
          );

          const { data: answerData } = await supabase.rpc(
            "get_preaudit_indicator_answers",
            {
              p_session_id: sessionRow.id,
              p_indicator_number: indicatorNumber,
            },
          );

          const answers: Record<string, Answer> = {};

          (answerData ?? []).forEach(
            (row: { question_id: string; answer: string }) => {
              if (["yes", "partial", "no", "unknown"].includes(row.answer)) {
                answers[row.question_id] = row.answer as Answer;
              }
            },
          );

          const { data: noteData } = await supabase.rpc(
            "get_preaudit_indicator_note",
            {
              p_session_id: sessionRow.id,
              p_indicator_number: indicatorNumber,
            },
          );

          const visibleQuestionIds = new Set(
            visibleQuestions.map((question) => question.id),
          );

          const answeredCount = Object.keys(answers).filter((id) =>
            visibleQuestionIds.has(id),
          ).length;

          const diagnostic = computeDiagnostic(
            indicatorNumber,
            visibleQuestions,
            answers,
          );

          const issues = getIssues(visibleQuestions, answers);

          return {
            indicatorNumber,
            title:
              indicatorData?.simplified_title ||
              indicatorData?.title ||
              `Indicateur ${indicatorNumber}`,
            diagnostic,
            answeredCount,
            totalQuestions: visibleQuestions.length,
            issues,
            note: noteData ? String(noteData) : "",
            advice: getAdvice(indicatorNumber, diagnostic),
          };
        }),
      );

      setSummaryRows(rows);

      const { data: brandData } = await supabase.rpc(
        "get_preaudit_brand_usage_check",
        { p_session_id: sessionRow.id },
      );

      if (brandData) {
        const brandRow = Array.isArray(brandData) ? brandData[0] : brandData;

        setBrandSummary({
          diagnostic: brandRow?.diagnostic ?? "a_verifier",
          user_notes: brandRow?.user_notes ?? "",
        });
      }

      setLoading(false);
    }

    loadFinalSummary();
  }, [router, supabase]);

  async function openContactEmail() {
    const purposeLabel =
      contactPurpose === "audit_blanc"
        ? "Demande de rendez-vous pour un audit blanc"
        : "Question sur le préaudit / audit Qualiopi";

    const subject =
      contactPurpose === "audit_blanc"
        ? "Demande d’audit blanc Qualiopi"
        : "Question suite au préaudit Qualiopi";

    const body = [
      `Bonjour,`,
      ``,
      `Je souhaite vous contacter suite à mon préaudit Qualiopi.`,
      ``,
      `Objet : ${purposeLabel}`,
      ``,
      `Profil préaudit :`,
      `- Type d’audit : ${formatAuditType(auditType)}`,
      `- Nouvel entrant : ${isNewEntrant ? "Oui" : "Non"}`,
      `- Catégories d’actions concernées : ${formatCategories(
        certificationCategories,
      )}`,
      ``,
      `Résumé du préaudit :`,
      `- Indicateurs en défaut : ${defectiveRows.length}`,
      `- Indicateurs à vérifier : ${toVerifyRows.length}`,
      `- Indicateurs conformes selon les réponses : ${conformeRows.length}`,
      ``,
      `Coordonnées :`,
      `- Nom : ${contactName || "Non renseigné"}`,
      `- Email : ${contactEmail || "Non renseigné"}`,
      ``,
      `Message :`,
      contactMessage || "Non renseigné",
      ``,
      contactPurpose === "audit_blanc"
        ? "Je suis intéressé(e) par l’audit blanc avec un auditeur certifié, au tarif de 199 € pour une demi-journée."
        : "Je souhaite poser une question sur le déroulement de l’audit, le choix du certificateur ou les corrections à réaliser.",
      ``,
      `Merci,`,
    ].join("\n");

    setContactError("");
    setContactSent(false);
    setContactSending(true);

    try {
      const response = await fetch("/api/support/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientName: contactName,
          clientEmail: contactEmail,
          subject,
          category: contactPurpose === "audit_blanc" ? "audit" : "question",
          toolSlug: "preaudit-qualiopi",
          pageUrl:
            typeof window !== "undefined"
              ? window.location.href
              : "Page bilan final préaudit",
          message: body,
          metadata: {
            source: "preaudit_final_contact_form",
            tool_slug: "preaudit-qualiopi",
          },
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Impossible d'envoyer la demande.");
      }

      setContactSent(true);
      setContactMessage("");
    } catch (sendError) {
      setContactError(
        sendError instanceof Error
          ? sendError.message
          : "Impossible d'envoyer la demande.",
      );
    } finally {
      setContactSending(false);
    }
  }

  if (loading) {
    return (
      <main
        className="gazette-paper"
        style={{ minHeight: "100vh", padding: "3rem 1.5rem" }}
      >
        <p style={{ textAlign: "center", color: "var(--ink-faint)" }}>
          Préparation du bilan final du préaudit…
        </p>
      </main>
    );
  }

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <ClientSupportBar
        context="l’auto-audit Qualiopi"
        toolSlug="preaudit-qualiopi"
      />
      <div
        style={{
          maxWidth: 1180,
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
              Votre bilan final
            </h1>

            <p style={{ color: "var(--sepia-mid)", lineHeight: 1.65 }}>
              Bravo, vous êtes allé au bout du préaudit ✨ Ce bilan vous aide à
              prioriser les corrections, retrouver vos notes et préparer un plan
              d’action avant votre audit.
            </p>
          </div>
        </header>

        {error && (
          <div
            style={{
              border: "1px solid var(--rust)",
              borderLeft: "4px solid var(--rust)",
              background: "rgba(138,75,36,0.06)",
              padding: "1rem",
              marginBottom: "1rem",
              color: "var(--rust)",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.8rem",
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1rem",
            }}
          >
            <p className="gazette-label">En défaut</p>
            <p style={{ fontSize: "2rem", color: "var(--rust)", margin: 0 }}>
              {defectiveRows.length}
            </p>
            <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>
              Indicateur(s) avec risque mineur ou majeur.
            </p>
          </div>

          <div
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1rem",
            }}
          >
            <p className="gazette-label">À vérifier</p>
            <p
              style={{ fontSize: "2rem", color: "var(--ocre-dark)", margin: 0 }}
            >
              {toVerifyRows.length}
            </p>
            <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>
              Indicateur(s) incomplets ou à reprendre.
            </p>
          </div>

          <div
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1rem",
            }}
          >
            <p className="gazette-label">Conformes</p>
            <p style={{ fontSize: "2rem", color: "#6a8a4a", margin: 0 }}>
              {conformeRows.length}
            </p>
            <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>
              Indicateur(s) sans point bloquant détecté.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 360px",
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
              <p className="gazette-label">Document Excel</p>

              <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                À quoi sert votre export ?
              </h2>

              <p
                style={{
                  color: "var(--ink-soft)",
                  lineHeight: 1.65,
                  marginBottom: "0.8rem",
                }}
              >
                Le fichier Excel vous sert de plan d’action. Il liste les
                indicateurs, vos notes, les points à corriger et une piste de
                résolution pour chaque non-conformité probable. Vous pouvez le
                conserver, le compléter, puis refaire le préaudit après vos
                corrections.
              </p>

              <button
                type="button"
                className="btn-ink"
                onClick={() => downloadExcel(summaryRows, brandSummary)}
              >
                <span>📥 Télécharger mon bilan Excel</span>
              </button>
            </div>

            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1rem",
              }}
            >
              <p className="gazette-label">Indicateurs en défaut</p>

              {defectiveRows.length > 0 ? (
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {defectiveRows.map((row) => (
                    <article
                      key={row.indicatorNumber}
                      style={{
                        border: "1px solid var(--sepia-mid)",
                        borderLeft: `4px solid ${diagnosticColor(
                          row.diagnostic,
                        )}`,
                        padding: "0.9rem",
                        background: "rgba(255,255,255,0.35)",
                      }}
                    >
                      <p
                        style={{
                          fontFamily: "var(--font-cinzel)",
                          fontSize: "0.6rem",
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          color: "var(--ocre-dark)",
                        }}
                      >
                        Indicateur {row.indicatorNumber}
                      </p>

                      <h3
                        style={{ color: "var(--ink)", marginBottom: "0.3rem" }}
                      >
                        {row.title}
                      </h3>

                      <p
                        style={{
                          color: diagnosticColor(row.diagnostic),
                          fontWeight: 700,
                          marginBottom: "0.5rem",
                        }}
                      >
                        {diagnosticEmoji(row.diagnostic)}{" "}
                        {diagnosticLabel(row.diagnostic)}
                      </p>

                      {row.issues.length > 0 && (
                        <div style={{ display: "grid", gap: "0.35rem" }}>
                          {row.issues.slice(0, 4).map((issue, index) => (
                            <p
                              key={index}
                              style={{
                                color: "var(--ink-soft)",
                                fontSize: "0.9rem",
                                lineHeight: 1.45,
                                margin: 0,
                              }}
                            >
                              {issue}
                            </p>
                          ))}
                        </div>
                      )}

                      <p
                        style={{
                          marginTop: "0.75rem",
                          color: "var(--ink-faint)",
                          lineHeight: 1.5,
                          fontSize: "0.9rem",
                        }}
                      >
                        ✦ {row.advice}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--ink-faint)", lineHeight: 1.6 }}>
                  Aucun indicateur en défaut détecté. Pensez tout de même à
                  vérifier vos preuves et à conserver les traces utiles.
                </p>
              )}
            </div>

            {canModifyPreaudit && toVerifyRows.length > 0 && (
              <div
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1rem",
                }}
              >
                <p className="gazette-label">À revoir</p>

                <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
                  Certains indicateurs restent à vérifier, souvent parce que les
                  réponses sont incomplètes. Reprenez-les avant de considérer
                  votre préaudit comme terminé.
                </p>

                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
                >
                  {toVerifyRows.map((row) => (
                    <button
                      key={row.indicatorNumber}
                      type="button"
                      className="btn-ink"
                      onClick={() =>
                        router.push(`/client/preaudit/${row.indicatorNumber}`)
                      }
                    >
                      <span>Indicateur {row.indicatorNumber}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1rem",
              }}
            >
              <p className="gazette-label">Refaire le préaudit</p>

              <p
                style={{
                  color: "var(--ink-soft)",
                  fontSize: "0.92rem",
                  lineHeight: 1.6,
                }}
              >
                Une fois vos corrections réalisées, relancez le préaudit pour
                vérifier que les points bloquants ont disparu.
              </p>

              {canModifyPreaudit ? (
              <button
                type="button"
                className="btn-ink"
                onClick={() => router.push("/client/preaudit")}
              >
                <span>Reprendre mon profil</span>
              </button>
              ) : null}
            </div>

            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1rem",
              }}
            >
              <p className="gazette-label">Besoin d’un œil humain ?</p>

              <p
                style={{
                  color: "var(--ink-soft)",
                  fontSize: "0.92rem",
                  lineHeight: 1.6,
                }}
              >
                Vous pouvez demander un rendez-vous avec un auditeur certifié
                pour poser vos questions (gratuitement) ou un audit blanc.
                Option payante Audit blanc:{" "}
                <strong>199 € pour une demi-journée</strong>.
              </p>

              <div
                style={{
                  padding: "0.75rem",
                  border: "1px dashed var(--sepia-mid)",
                  background: "rgba(178,138,98,0.08)",
                  color: "var(--ink-faint)",
                  fontSize: "0.85rem",
                  lineHeight: 1.5,
                  marginBottom: "0.75rem",
                }}
              >
                <strong>Profil transmis dans l’email :</strong>
                <br />
                Type d’audit : {formatAuditType(auditType)}
                <br />
                Catégories : {formatCategories(certificationCategories)}
                <br />
                Nouvel entrant : {isNewEntrant ? "Oui" : "Non"}
              </div>

              <div style={{ display: "grid", gap: "0.6rem" }}>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Votre nom"
                  style={{
                    padding: "0.6rem",
                    border: "1px solid var(--sepia-mid)",
                    background: "rgba(255,255,255,0.55)",
                  }}
                />

                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Votre email"
                  style={{
                    padding: "0.6rem",
                    border: "1px solid var(--sepia-mid)",
                    background: "rgba(255,255,255,0.55)",
                  }}
                />

                <select
                  value={contactPurpose}
                  onChange={(e) => setContactPurpose(e.target.value)}
                  style={{
                    padding: "0.6rem",
                    border: "1px solid var(--sepia-mid)",
                    background: "rgba(255,255,255,0.55)",
                  }}
                >
                  <option value="audit_blanc">
                    Prendre RDV pour un audit blanc
                  </option>
                  <option value="question">
                    Poser une question sur l’audit
                  </option>
                </select>

                <textarea
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="Votre message..."
                  style={{
                    minHeight: "110px",
                    padding: "0.6rem",
                    border: "1px solid var(--sepia-mid)",
                    background: "rgba(255,255,255,0.55)",
                    resize: "vertical",
                  }}
                />

                <button
                  type="button"
                  className="btn-ink"
                  onClick={openContactEmail}
                  disabled={contactSending}
                >
                  <span>
                    {contactSending ? "Envoi..." : "Envoyer ma demande"}
                  </span>
                </button>

                {contactSent ? (
                  <p style={{ color: "#4f6f36", fontSize: "0.88rem" }}>
                    Votre demande a bien été transmise à Selen.
                  </p>
                ) : null}

                {contactError ? (
                  <p style={{ color: "var(--rust)", fontSize: "0.88rem" }}>
                    {contactError}
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              className="btn-ink"
              onClick={() => router.push("/client")}
            >
              <span>Retour espace client</span>
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}
