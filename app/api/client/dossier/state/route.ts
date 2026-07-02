import { NextResponse } from "next/server";

import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";

const SIGNING_DOCUMENT_TYPES = [
  "programme_formation",
  "convention_formation",
  "liste_formateurs",
];

const PROGRAM_VALIDATED_STATUSES = [
  "program_validated",
  "validated",
  "validated_by_client",
];
const PROGRAM_REFUSED_STATUSES = [
  "refused_by_client",
  "correction_requested",
  "changes_requested",
];
const NDA_PHASE_KEYS = [
  "initial_reception",
  "program_analysis",
  "signing_documents",
  "final_return",
  "ready_for_deposit",
] as const;

type NdaPhaseKey = (typeof NDA_PHASE_KEYS)[number];
type NdaPhaseValidations = Partial<Record<NdaPhaseKey, unknown>>;

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function buildStep(
  number: number,
  label: string,
  currentStep: number,
  status: string,
) {
  return {
    number,
    label,
    active: number === currentStep,
    status,
  };
}

function normalizeNdaPhaseValidations(value: unknown): NdaPhaseValidations {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    NDA_PHASE_KEYS.flatMap((key) => (source[key] ? [[key, source[key]]] : [])),
  ) as NdaPhaseValidations;
}

function hasValidatedPhase(
  validations: NdaPhaseValidations,
  phaseKey: NdaPhaseKey,
) {
  return Boolean(validations[phaseKey]);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dossierId = searchParams.get("dossierId");

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const supabase = getAdminSupabase();
    const access = await verifyClientNdaDossierAccess(supabase, dossierId);

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const dossier = access.dossier;

    const { data: ndaVariables, error: ndaVariablesError } = await supabase
      .from("nda_variables")
      .select(
        `
        client_nom,
        client_adresse,
        client_representant_prenom,
        client_representant_nom,
        stagiaire_prenom,
        stagiaire_nom,
        stagiaire_fonction,
        stagiaire_adresse,
        stagiaire_email,
        stagiaire_telephone,
        client_siret,
        date_formation_prevue,
        lieu_formation,
        lieu_signature_convention,
        date_signature_convention,
        representant_prenom,
        representant_nom,
        formateur_prenom,
        formateur_nom,
        formateur_email,
        intitule_formation,
        duree_formation,
        tarif_formation,
        modalite,
        nda_deposit_specific_code,
        nda_deposit_specific_code_label,
        nda_deposit_status,
        nda_deposit_submitted_at,
        nda_deposit_refusal_received_at,
        nda_obtained_at,
        nda_phase_validations
      `,
      )
      .eq("dossier_id", dossierId)
      .maybeSingle();

    if (ndaVariablesError) {
      return NextResponse.json(
        { error: ndaVariablesError.message },
        { status: 500 },
      );
    }

    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select(
        `
        id,
        name,
        document_type,
        document_role,
        review_status,
        requires_client_action,
        is_visible_to_client,
        source,
        status,
        created_at
      `,
      )
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false });

    if (docsError) {
      return NextResponse.json({ error: docsError.message }, { status: 500 });
    }

    const { data: latestProgramVersion, error: latestProgramVersionError } =
      await supabase
        .from("dossier_program_versions")
        .select("id, status, version_type, client_decision, client_decision_at")
        .eq("dossier_id", dossierId)
        .eq("version_type", "client_sent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (latestProgramVersionError) {
      return NextResponse.json(
        { error: latestProgramVersionError.message },
        { status: 500 },
      );
    }

    const programDecision = latestProgramVersion?.client_decision ?? null;
    const programVersionStatus = latestProgramVersion?.status ?? null;
    const dossierStatus = dossier.status ?? "";
    const ndaPhaseValidations = normalizeNdaPhaseValidations(
      ndaVariables?.nda_phase_validations,
    );

    const safeDocuments = (documents ?? []).map((document) => ({
      id: document.id,
      name: document.name,
      document_type: document.document_type,
      document_role: document.document_role,
      review_status: document.review_status,
      requires_client_action: document.requires_client_action,
      status: document.status,
      created_at: document.created_at,
    }));

    const clientUploadedDocuments = safeDocuments.filter(
      (document) =>
        documents?.some(
          (sourceDocument) =>
            sourceDocument.id === document.id &&
            (sourceDocument.source === "client_upload" ||
              sourceDocument.document_role === "initial_client_document") &&
            sourceDocument.document_role !== "client_returned_document",
        ) ?? false,
    );

    const finalReturnedDocuments = safeDocuments.filter(
      (document) =>
        documents?.some(
          (sourceDocument) =>
            sourceDocument.id === document.id &&
            sourceDocument.source === "client_upload" &&
            sourceDocument.document_role === "client_returned_document",
        ) ?? false,
    );

    const publishedDocuments = safeDocuments.filter(
      (document) =>
        documents?.some(
          (sourceDocument) =>
            sourceDocument.id === document.id &&
            sourceDocument.is_visible_to_client === true &&
            sourceDocument.source !== "client_upload" &&
            sourceDocument.document_role !== "initial_client_document" &&
            sourceDocument.document_role !== "client_returned_document",
        ) ?? false,
    );

    const signingDocuments = safeDocuments.filter(
      (document) =>
        documents?.some(
          (sourceDocument) =>
            sourceDocument.id === document.id &&
            sourceDocument.is_visible_to_client === true &&
            sourceDocument.document_role === "client_to_complete" &&
            sourceDocument.review_status === "pending_client" &&
            SIGNING_DOCUMENT_TYPES.includes(sourceDocument.document_type),
        ) ?? false,
    );

    const step1Submitted = hasValidatedPhase(
      ndaPhaseValidations,
      "initial_reception",
    );
    const signingDocumentsReady = signingDocuments.length > 0;
    const clientVisibleDocuments = publishedDocuments;
    const isInitialDocumentsSubmitted = step1Submitted;
    const isProgramValidated =
      programDecision === "validated" ||
      PROGRAM_VALIDATED_STATUSES.includes(programVersionStatus ?? "");
    const isProgramRefused =
      programDecision === "refused" ||
      PROGRAM_REFUSED_STATUSES.includes(programVersionStatus ?? "");
    const isProgramSentToClient =
      Boolean(latestProgramVersion) ||
      isProgramValidated;
    const isClientDetailsSubmitted = [
      ndaVariables?.client_nom,
      ndaVariables?.client_siret,
      ndaVariables?.stagiaire_prenom,
      ndaVariables?.stagiaire_nom,
      ndaVariables?.stagiaire_email,
      ndaVariables?.date_formation_prevue,
      ndaVariables?.lieu_formation,
    ].every(hasText);
    const isDepositSubmitted =
      ndaVariables?.nda_deposit_status === "dreets_pending" ||
      Boolean(ndaVariables?.nda_deposit_submitted_at);
    const isDepositRefused =
      ndaVariables?.nda_deposit_status === "refusal_received" ||
      Boolean(ndaVariables?.nda_deposit_refusal_received_at);
    const isNdaObtained =
      ndaVariables?.nda_deposit_status === "nda_obtained" ||
      Boolean(ndaVariables?.nda_obtained_at);
    const isDepositProcedureOpen =
      hasValidatedPhase(ndaPhaseValidations, "ready_for_deposit") &&
      !isDepositSubmitted &&
      !isDepositRefused &&
      !isNdaObtained;
    const canShowDepositProcedure = isDepositProcedureOpen;
    const isFinalReview =
      !isDepositProcedureOpen &&
      !isDepositSubmitted &&
      !isDepositRefused &&
      !isNdaObtained &&
      finalReturnedDocuments.length > 0;
    const areDocumentsBeingPrepared =
      isClientDetailsSubmitted &&
      !isDepositProcedureOpen &&
      !isDepositSubmitted &&
      !isDepositRefused &&
      !isNdaObtained;
    const currentStep = isDepositSubmitted || isDepositRefused || isNdaObtained
      ? 8
      : isDepositProcedureOpen
        ? 7
        : hasValidatedPhase(ndaPhaseValidations, "signing_documents")
          ? 6
          : hasValidatedPhase(ndaPhaseValidations, "program_analysis")
            ? 5
            : isProgramSentToClient || isProgramRefused
              ? 4
              : isInitialDocumentsSubmitted
                ? 3
                : 2;
    const steps = [
      buildStep(1, "Démarrage du dossier", currentStep, "À lire"),
      buildStep(
        2,
        "Informations et documents initiaux",
        currentStep,
        isInitialDocumentsSubmitted ? "Terminé" : "Action requise",
      ),
      buildStep(
        3,
        "Analyse par Selen",
        currentStep,
        hasValidatedPhase(ndaPhaseValidations, "program_analysis")
          ? "Terminé"
          : isInitialDocumentsSubmitted
            ? "En cours"
            : "À venir",
      ),
      buildStep(
        4,
        "Validation du programme",
        currentStep,
        isProgramValidated
          ? "Terminé"
          : isProgramRefused
            ? "Correction demandée"
            : isProgramSentToClient
              ? "Action requise"
              : "À venir",
      ),
      buildStep(
        5,
        "Premier client à former",
        currentStep,
        hasValidatedPhase(ndaPhaseValidations, "signing_documents")
          ? "Terminé"
          : hasValidatedPhase(ndaPhaseValidations, "program_analysis")
            ? "Action requise"
            : "À venir",
      ),
      buildStep(
        6,
        "Documents en préparation",
        currentStep,
        isDepositProcedureOpen
          ? "Terminé"
          : hasValidatedPhase(ndaPhaseValidations, "final_return")
            ? "VÃ©rification finale"
            : isFinalReview
            ? "Vérification finale"
            : signingDocumentsReady
              ? "Documents à signer"
              : isClientDetailsSubmitted
                ? "En cours"
                : "À venir",
      ),
      buildStep(
        7,
        "Procédure de dépôt",
        currentStep,
        isDepositSubmitted || isDepositRefused || isNdaObtained
          ? "Terminé"
          : isDepositProcedureOpen
            ? "Disponible"
            : "À venir",
      ),
      buildStep(
        8,
        "Suivi du dépôt",
        currentStep,
        isNdaObtained
          ? "NDA obtenu"
          : isDepositRefused
            ? "Courrier transmis"
            : isDepositSubmitted
              ? "En attente"
              : "À venir",
      ),
    ];
    const currentStepLabel =
      steps.find((step) => step.number === currentStep)?.label ?? "";

    return NextResponse.json({
      dossier: {
        id: dossier.id,
        status: dossier.status,
        title: dossier.title,
      },
      dossierStatus,
      currentStep,
      currentStepLabel,
      steps,
      isInitialDocumentsSubmitted,
      isProgramSentToClient,
      isProgramValidated,
      isProgramRefused,
      isClientDetailsSubmitted,
      areDocumentsBeingPrepared,
      isDepositProcedureOpen,
      canShowDepositProcedure,
      ndaPhaseValidations,
      ndaTracking: {
        nda_deposit_specific_code:
          ndaVariables?.nda_deposit_specific_code ?? null,
        nda_deposit_specific_code_label:
          ndaVariables?.nda_deposit_specific_code_label ?? null,
        nda_deposit_status: ndaVariables?.nda_deposit_status ?? null,
        nda_deposit_submitted_at:
          ndaVariables?.nda_deposit_submitted_at ?? null,
        nda_deposit_refusal_received_at:
          ndaVariables?.nda_deposit_refusal_received_at ?? null,
        nda_obtained_at: ndaVariables?.nda_obtained_at ?? null,
      },
      step1Submitted,
      programDecision,
      programVersionStatus,
      latestProgramVersion: latestProgramVersion ?? null,
      step1: {
        organisation_name: access.organisation?.name ?? "",
        organisation_email: access.organisation?.email ?? "",
        organisation_phone: access.organisation?.phone ?? "",
        representant_prenom: ndaVariables?.representant_prenom ?? "",
        representant_nom: ndaVariables?.representant_nom ?? "",
        formateur_prenom: ndaVariables?.formateur_prenom ?? "",
        formateur_nom: ndaVariables?.formateur_nom ?? "",
        formateur_email: ndaVariables?.formateur_email ?? "",
        formation_intitule: ndaVariables?.intitule_formation ?? "",
        formation_duree: ndaVariables?.duree_formation ?? "",
        formation_tarif: ndaVariables?.tarif_formation ?? "",
        formation_modalite: ndaVariables?.modalite ?? "",
      },
      signingDocumentsReady,
      clientVisibleDocuments,
      clientUploadedDocuments,
      finalReturnedDocuments,
      publishedDocuments,
      signingDocuments,
      step2: {
        client_nom: ndaVariables?.client_nom ?? "",
        client_adresse: ndaVariables?.client_adresse ?? "",
        client_representant_prenom:
          ndaVariables?.client_representant_prenom ?? "",
        client_representant_nom: ndaVariables?.client_representant_nom ?? "",
        stagiaire_prenom: ndaVariables?.stagiaire_prenom ?? "",
        stagiaire_nom: ndaVariables?.stagiaire_nom ?? "",
        stagiaire_fonction: ndaVariables?.stagiaire_fonction ?? "",
        stagiaire_adresse: ndaVariables?.stagiaire_adresse ?? "",
        stagiaire_email: ndaVariables?.stagiaire_email ?? "",
        stagiaire_telephone: ndaVariables?.stagiaire_telephone ?? "",
        client_siret: ndaVariables?.client_siret ?? "",
        date_formation_prevue: ndaVariables?.date_formation_prevue ?? "",
        lieu_formation: ndaVariables?.lieu_formation ?? "",
        lieu_signature_convention:
          ndaVariables?.lieu_signature_convention ?? "",
        date_signature_convention:
          ndaVariables?.date_signature_convention ?? "",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
