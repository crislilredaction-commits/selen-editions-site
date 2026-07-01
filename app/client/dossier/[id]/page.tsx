"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ClientMessagingPanel from "@/components/ClientMessagingPanel";
import ClientProgramProposal from "@/components/ClientProgramProposal";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocKey = "cv" | "programme" | "insee" | "kbis";
type FinalDocKey =
  | "conventionSignee"
  | "programmeFormationSigne"
  | "diplomesFormateurPrincipal"
  | "casierJudiciaireN3"
  | "statutActiviteFormationAdulte"
  | "listeFormateursSignee"
  | "statutsSociete";

type NdaTracking = {
  nda_deposit_specific_code?: string | null;
  nda_deposit_specific_code_label?: string | null;
  nda_deposit_status?: string | null;
  nda_deposit_submitted_at?: string | null;
  nda_deposit_refusal_received_at?: string | null;
  nda_obtained_at?: string | null;
};

type ConfirmationDialogState = {
  title: string;
  message: string;
  actionLabel?: string;
} | null;

type MessageRow = {
  id: string;
  content: string;
  sender_type: "agent" | "client";
  created_at: string;
};

interface DocState {
  file: File | null;
  uploading: boolean;
}

type NdaDocument = {
  id: string;
  name: string | null;
  document_type: string | null;
  document_role: string | null;
  review_status: string | null;
  requires_client_action?: boolean | null;
  status: string | null;
  created_at: string | null;
};

type NdaProgressStep = {
  number: number;
  label: string;
  active: boolean;
  status: string;
};

type LoadClientStateOptions = {
  showLoading?: boolean;
  forceFormSync?: boolean;
};

const FINAL_REVIEW_STATUSES = ["under_review", "final_review"];
const NDA_DEPOSIT_READY_STATUSES = [
  "ready_for_deposit",
  "deposit_ready",
  "nda_deposit_ready",
  "ready_for_deposit_nda",
  "ready_for_nda_deposit",
  "ready_to_deposit",
  "ready_for_submission",
  "ready_for_nda_submission",
  "nda_ready_for_deposit",
  "deposit_procedure_ready",
  "compliant",
];
const NDA_DEPOSIT_SUBMITTED_STATUSES = [
  "nda_deposit_submitted",
  "deposit_submitted",
  "submitted_to_dreets",
  "waiting_dreets",
];
const NDA_REFUSED_STATUSES = ["nda_refused", "refused_by_dreets"];
const NDA_OBTAINED_STATUSES = ["nda_obtained"];
const PROGRAM_SENT_STATUSES = [
  "program_sent_to_client",
  "programme_sent_to_client",
  "sent_to_client",
  "client_sent",
  "pending_client",
  "waiting_client_validation",
];
const PROGRAM_REFUSED_STATUSES = [
  "refused_by_client",
  "correction_requested",
  "changes_requested",
];
const PROGRAM_VALIDATED_STATUSES = [
  "validated_by_client",
  "validated",
  "program_validated",
];
const OFFICIAL_NDA_DEPOSIT_URL =
  "https://efpconnect.emploi.gouv.fr/auth/realms/efp/protocol/cas/login?TARGET=https%3A%2F%2Fwww.monactiviteformation.emploi.gouv.fr%2Fmon-activite-formation%2F";
const TVA_EXEMPTION_CERFA_URL =
  "https://www.impots.gouv.fr/sites/default/files/formulaires/3511-sd/2026/3511-sd_4894.pdf";
const CRIMINAL_RECORD_REQUEST_URL = "https://casier-judiciaire.justice.gouv.fr";

const STEP_REASSURANCE_MESSAGES: Record<number, string> = {
  1: "Vous pouvez quitter cette page dès que vous avez terminé votre lecture. Selen garde le fil, même si votre café refroidit moins vite que l'administration. Vous recevrez un email lorsqu'une nouvelle action sera nécessaire.",
  2: "Une fois vos informations et documents envoyés, vous pouvez fermer la page sereinement. Nous prenons le relais, sans tambour ni formulaire caché. Un email vous préviendra dès que vous devrez intervenir.",
  3: "Votre dossier est entre les mains de Selen. Vous pouvez quitter la page : l'analyse avance côté équipe, et un email vous réveillera doucement quand une action sera attendue.",
  4: "Après votre validation ou votre demande de modification, vous pouvez souffler et fermer l'onglet. Nous nous occupons de la suite, avec sérieux et sans confettis administratifs. Vous recevrez un email au prochain mouvement.",
  5: "Quand les coordonnées du client à former sont transmises, vous pouvez partir l'esprit léger. Selen prépare les documents, et promis, l'email fera signe quand ce sera à vous de jouer.",
  6: "Vos documents sont en préparation ou en vérification. Vous pouvez quitter la page sans surveiller le four : nous vous enverrons un email dès qu'une nouvelle action sera nécessaire.",
  7: "Une fois le dépôt effectué ou les documents récupérés, vous pouvez fermer la page tranquillement. Selen reste en veille élégante, et un email vous préviendra si une suite vous attend.",
  8: "Le dossier est dans sa phase de suivi. Vous pouvez quitter la page : nous gardons un oeil sur la suite et vous recevrez un email dès qu'une action sera nécessaire.",
};

function getStepReassuranceMessage(stepNumber: number) {
  return (
    STEP_REASSURANCE_MESSAGES[stepNumber] ??
    "Vous pouvez quitter cette page sereinement. Selen garde le fil et vous recevrez un email lorsqu'une nouvelle action sera nécessaire."
  );
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

export default function ClientNdaPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const dossierId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);
  const [docs, setDocs] = useState<Record<DocKey, DocState>>({
    cv: { file: null, uploading: false },
    programme: { file: null, uploading: false },
    insee: { file: null, uploading: false },
    kbis: { file: null, uploading: false },
  });
  const [finalDocs, setFinalDocs] = useState<Record<FinalDocKey, DocState>>({
    conventionSignee: { file: null, uploading: false },
    programmeFormationSigne: { file: null, uploading: false },
    diplomesFormateurPrincipal: { file: null, uploading: false },
    casierJudiciaireN3: { file: null, uploading: false },
    statutActiviteFormationAdulte: { file: null, uploading: false },
    listeFormateursSignee: { file: null, uploading: false },
    statutsSociete: { file: null, uploading: false },
  });

  const [form, setForm] = useState({
    organisation_name: "",
    organisation_email: "",
    organisation_phone: "",
    representant_prenom: "",
    representant_nom: "",
    formateur_prenom: "",
    formateur_nom: "",
    formateur_email: "",
    formation_intitule: "",
    formation_duree: "",
    formation_tarif: "",
    formation_modalite: "",
  });

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [dossierStatus, setDossierStatus] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [currentStepLabel, setCurrentStepLabel] = useState(
    "Démarrage du dossier",
  );
  const [progressSteps, setProgressSteps] = useState<NdaProgressStep[]>([
    {
      number: 1,
      label: "Démarrage du dossier",
      active: true,
      status: "À lire",
    },
  ]);
  const [canShowDepositProcedure, setCanShowDepositProcedure] = useState(false);
  const [isDepositProcedureOpen, setIsDepositProcedureOpen] = useState(false);
  const [isInitialDocumentsSubmitted, setIsInitialDocumentsSubmitted] =
    useState(false);
  const [isProgramSentToClientFromState, setIsProgramSentToClientFromState] =
    useState(false);
  const [isProgramValidatedFromState, setIsProgramValidatedFromState] =
    useState(false);
  const [isProgramRefusedFromState, setIsProgramRefusedFromState] =
    useState(false);
  const [isClientDetailsSubmittedFromState, setIsClientDetailsSubmittedFromState] =
    useState(false);
  const [areDocumentsBeingPreparedFromState, setAreDocumentsBeingPreparedFromState] =
    useState(false);
  const [ndaTracking, setNdaTracking] = useState<NdaTracking | null>(null);
  const [ndaDepositSpecificCode, setNdaDepositSpecificCode] = useState<
    string | null
  >(null);
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [refusalSubmitting, setRefusalSubmitting] = useState(false);
  const [showRefusalUpload, setShowRefusalUpload] = useState(false);
  const [refusalLetterFile, setRefusalLetterFile] = useState<File | null>(null);
  const [refusalMessage, setRefusalMessage] = useState<string | null>(null);
  const [confirmationDialog, setConfirmationDialog] =
    useState<ConfirmationDialogState>(null);
  const [lastAutoRefreshAt, setLastAutoRefreshAt] = useState<string | null>(
    null,
  );
  const [programProposal, setProgramProposal] = useState<any | null>(null);
  const [programDecision, setProgramDecision] = useState<string | null>(null);
  const [programVersionStatus, setProgramVersionStatus] = useState<
    string | null
  >(null);
  const [step1Submitted, setStep1Submitted] = useState(false);
  const [showStep1Details, setShowStep1Details] = useState(false);
  const [clientUploadedDocuments, setClientUploadedDocuments] = useState<
    NdaDocument[]
  >([]);
  const [publishedDocuments, setPublishedDocuments] = useState<NdaDocument[]>(
    [],
  );
  const [clientVisibleDocuments, setClientVisibleDocuments] = useState<
    NdaDocument[]
  >([]);
  const [signingDocuments, setSigningDocuments] = useState<NdaDocument[]>([]);
  const [signingDocumentsReady, setSigningDocumentsReady] = useState(false);
  const [finalReturnedDocuments, setFinalReturnedDocuments] = useState<
    NdaDocument[]
  >([]);
  const [step2Form, setStep2Form] = useState({
    client_nom: "",
    client_adresse: "",
    client_representant_prenom: "",
    client_representant_nom: "",
    stagiaire_prenom: "",
    stagiaire_nom: "",
    stagiaire_fonction: "",
    stagiaire_adresse: "",
    stagiaire_email: "",
    stagiaire_telephone: "",
    client_siret: "",
    date_formation_prevue: "",
    lieu_formation: "",
    lieu_signature_convention: "",
    date_signature_convention: "",
  });
  const isStep1DirtyRef = useRef(false);
  const isStep2DirtyRef = useRef(false);

  function updateStep2Form<K extends keyof typeof step2Form>(
    key: K,
    value: (typeof step2Form)[K],
  ) {
    isStep2DirtyRef.current = true;
    setStep2Form((prev) => ({ ...prev, [key]: value }));
  }

  function updateForm<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    isStep1DirtyRef.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleFileDrop(key: DocKey, file: File) {
    setDocs((prev) => ({ ...prev, [key]: { file, uploading: false } }));
  }

  function showConfirmation(
    title: string,
    message: string,
    actionLabel = "J'ai compris",
  ) {
    setConfirmationDialog({ title, message, actionLabel });
  }

  function handleFinalFileDrop(key: FinalDocKey, file: File) {
    setFinalDocs((prev) => ({ ...prev, [key]: { file, uploading: false } }));
  }

  const loadClientState = useCallback(
    async ({
      showLoading = true,
      forceFormSync = false,
    }: LoadClientStateOptions = {}) => {
      try {
        if (!dossierId) {
          setAccessLoading(false);
          setAccessError("Aucun dossier NDA n'a été trouvé dans l'URL.");
          return;
        }

        if (showLoading) {
          setAccessLoading(true);
        }
        setAccessError(null);

        const { data: authData } = await supabase.auth.getUser();

        if (!authData.user) {
          router.replace("/client/login");
          return;
        }

        const stateRes = await fetch(
          `/api/client/dossier/state?dossierId=${encodeURIComponent(dossierId)}`,
          {
            cache: "no-store",
          },
        );

        const stateData = await stateRes.json().catch(() => null);

        if (!stateRes.ok) {
          setAccessError(
            stateData?.error ??
              "Vous n'êtes pas autorisé à consulter ce dossier NDA.",
          );
          return;
        }

        setStep1Submitted(Boolean(stateData?.step1Submitted));
        setDossierStatus(
          stateData?.dossierStatus ?? stateData?.dossier?.status ?? null,
        );
        setCurrentStep(Number(stateData?.currentStep ?? 1));
        setCurrentStepLabel(
          stateData?.currentStepLabel ?? "Démarrage du dossier",
        );
        setProgressSteps(
          Array.isArray(stateData?.steps) && stateData.steps.length > 0
            ? (stateData.steps as NdaProgressStep[])
            : [
                {
                  number: Number(stateData?.currentStep ?? 1),
                  label:
                    stateData?.currentStepLabel ?? "Démarrage du dossier",
                  active: true,
                  status: "En cours",
                },
              ],
        );
        setCanShowDepositProcedure(Boolean(stateData?.canShowDepositProcedure));
        setIsDepositProcedureOpen(Boolean(stateData?.isDepositProcedureOpen));
        setIsInitialDocumentsSubmitted(
          Boolean(stateData?.isInitialDocumentsSubmitted),
        );
        setIsProgramSentToClientFromState(
          Boolean(stateData?.isProgramSentToClient),
        );
        setIsProgramValidatedFromState(Boolean(stateData?.isProgramValidated));
        setIsProgramRefusedFromState(Boolean(stateData?.isProgramRefused));
        setIsClientDetailsSubmittedFromState(
          Boolean(stateData?.isClientDetailsSubmitted),
        );
        setAreDocumentsBeingPreparedFromState(
          Boolean(stateData?.areDocumentsBeingPrepared),
        );
        setNdaTracking(stateData?.ndaTracking ?? null);
        setNdaDepositSpecificCode(
          stateData?.ndaTracking?.nda_deposit_specific_code ??
            stateData?.ndaTracking?.nda_deposit_specific_code_label ??
            null,
        );
        setProgramDecision(stateData?.programDecision ?? null);
        setProgramVersionStatus(stateData?.programVersionStatus ?? null);
        setClientUploadedDocuments(
          (stateData?.clientUploadedDocuments ?? []) as NdaDocument[],
        );
        setFinalReturnedDocuments(
          (stateData?.finalReturnedDocuments ?? []) as NdaDocument[],
        );
        setPublishedDocuments(
          (stateData?.publishedDocuments ?? []) as NdaDocument[],
        );
        setClientVisibleDocuments(
          (stateData?.clientVisibleDocuments ??
            stateData?.publishedDocuments ??
            []) as NdaDocument[],
        );

        setSigningDocuments(
          (stateData?.signingDocuments ?? []) as NdaDocument[],
        );
        setSigningDocumentsReady(Boolean(stateData?.signingDocumentsReady));

        if (stateData?.step1 && (forceFormSync || !isStep1DirtyRef.current)) {
          setForm({
            organisation_name: stateData.step1.organisation_name ?? "",
            organisation_email: stateData.step1.organisation_email ?? "",
            organisation_phone: stateData.step1.organisation_phone ?? "",
            representant_prenom: stateData.step1.representant_prenom ?? "",
            representant_nom: stateData.step1.representant_nom ?? "",
            formateur_prenom: stateData.step1.formateur_prenom ?? "",
            formateur_nom: stateData.step1.formateur_nom ?? "",
            formateur_email: stateData.step1.formateur_email ?? "",
            formation_intitule: stateData.step1.formation_intitule ?? "",
            formation_duree: stateData.step1.formation_duree ?? "",
            formation_tarif: stateData.step1.formation_tarif ?? "",
            formation_modalite: stateData.step1.formation_modalite ?? "",
          });
        }

        if (stateData?.step2 && (forceFormSync || !isStep2DirtyRef.current)) {
          setStep2Form({
            client_nom: stateData.step2.client_nom ?? "",
            client_adresse: stateData.step2.client_adresse ?? "",
            client_representant_prenom:
              stateData.step2.client_representant_prenom ?? "",
            client_representant_nom:
              stateData.step2.client_representant_nom ?? "",
            stagiaire_prenom: stateData.step2.stagiaire_prenom ?? "",
            stagiaire_nom: stateData.step2.stagiaire_nom ?? "",
            stagiaire_fonction: stateData.step2.stagiaire_fonction ?? "",
            stagiaire_adresse: stateData.step2.stagiaire_adresse ?? "",
            stagiaire_email: stateData.step2.stagiaire_email ?? "",
            stagiaire_telephone: stateData.step2.stagiaire_telephone ?? "",
            client_siret: stateData.step2.client_siret ?? "",
            date_formation_prevue: stateData.step2.date_formation_prevue ?? "",
            lieu_formation: stateData.step2.lieu_formation ?? "",
            lieu_signature_convention:
              stateData.step2.lieu_signature_convention ?? "",
            date_signature_convention:
              stateData.step2.date_signature_convention ?? "",
          });
        }

        const programRes = await fetch(
          `/api/client/program/latest?dossierId=${encodeURIComponent(dossierId)}`,
          {
            cache: "no-store",
          },
        );
        const programData = await programRes.json().catch(() => null);

        if (programRes.ok) {
          setProgramProposal(programData?.version ?? null);
          setProgramVersionStatus(
            programData?.version?.status ?? stateData?.programVersionStatus ?? null,
          );
          setProgramDecision(
            programData?.version?.client_decision ??
              stateData?.programDecision ??
              null,
          );
        }
      } catch {
        setAccessError("Impossible de charger ce dossier NDA.");
      } finally {
        setAccessLoading(false);
      }
    },
    [dossierId, router, supabase],
  );

  async function closeConfirmationDialog() {
    setConfirmationDialog(null);
    await loadClientState({ showLoading: false });
  }

  useEffect(() => {
    loadClientState();
  }, [loadClientState]);

  useEffect(() => {
    const refreshStateQuietly = () => {
      if (document.visibilityState !== "visible" || saving) {
        return;
      }

      loadClientState({ showLoading: false }).then(() => {
        setLastAutoRefreshAt(
          new Intl.DateTimeFormat("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date()),
        );
      });
    };

    const intervalId = window.setInterval(refreshStateQuietly, 8000);
    window.addEventListener("focus", refreshStateQuietly);
    document.addEventListener("visibilitychange", refreshStateQuietly);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshStateQuietly);
      document.removeEventListener("visibilitychange", refreshStateQuietly);
    };
  }, [loadClientState, saving]);

  async function saveStep1() {
    if (!dossierId) {
      throw new Error("Aucun dossierId trouvé dans l'URL.");
    }

    const res = await fetch("/api/client/dossier/step-1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dossierId,
        ...form,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error ?? "Erreur lors de l'enregistrement.");
    }

    return data;
  }

  async function uploadOneDocument(documentType: string, file: File) {
    if (!dossierId) {
      throw new Error("Aucun dossierId trouvé dans l'URL.");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("dossierId", dossierId);
    formData.append("documentType", documentType);

    const res = await fetch("/api/client/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(
        data?.error ?? `Erreur lors de l'upload du document ${documentType}.`,
      );
    }
  }

  async function uploadOneFinalDocument(documentType: string, file: File) {
    if (!dossierId) {
      throw new Error("Aucun dossierId trouvé dans l'URL.");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("dossierId", dossierId);
    formData.append("documentType", documentType);

    const res = await fetch("/api/client/dossier/final-upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      throw new Error(
        data?.error ?? `Erreur lors de l'upload du document ${documentType}.`,
      );
    }
  }

  async function notifyFinalDocumentsSubmitted() {
    try {
      const res = await fetch("/api/client/nda/final-documents-submitted", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dossierId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.warn(
          "Notification agent documents finaux non envoyée.",
          data?.error ?? res.statusText,
        );
      }
    } catch (error) {
      console.warn("Notification agent documents finaux non envoyée.", error);
    }
  }

  async function handleOfficialDepositSubmitted() {
    try {
      setDepositSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const res = await fetch("/api/client/nda/deposit-submitted", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dossierId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(
          data?.error ?? "Impossible d'enregistrer le dépôt officiel.",
        );
      }

      setNdaTracking((current) => ({
        ...(current ?? {}),
        nda_deposit_status:
          data?.ndaTracking?.nda_deposit_status ?? "dreets_pending",
        nda_deposit_submitted_at:
          data?.ndaTracking?.nda_deposit_submitted_at ??
          new Date().toISOString(),
      }));
      setSuccessMessage("Votre dépôt officiel a bien été enregistré.");
      showConfirmation(
        "Dépôt officiel enregistré",
        "Nous avons bien noté que votre dossier NDA a été déposé sur la plateforme officielle. Selen reste à vos côtés pendant l'attente du retour DREETS. Vous serez informé par email dès qu'une action sera attendue de votre part.",
      );
      await loadClientState({ showLoading: false });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    } finally {
      setDepositSubmitting(false);
    }
  }

  async function handleSubmitRefusalLetter() {
    try {
      setRefusalSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      setRefusalMessage(null);

      if (!refusalLetterFile) {
        throw new Error(
          "Ajoutez le courrier de refus reçu avant de l'envoyer.",
        );
      }

      const formData = new FormData();
      formData.append("file", refusalLetterFile);
      formData.append("dossierId", dossierId);

      const res = await fetch("/api/client/nda/refusal-letter", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(
          data?.error ?? "Impossible d'envoyer le courrier de refus.",
        );
      }

      setNdaTracking((current) => ({
        ...(current ?? {}),
        nda_deposit_status:
          data?.ndaTracking?.nda_deposit_status ?? "refusal_received",
        nda_deposit_refusal_received_at:
          data?.ndaTracking?.nda_deposit_refusal_received_at ??
          new Date().toISOString(),
      }));
      setRefusalLetterFile(null);
      setShowRefusalUpload(false);
      setRefusalMessage(
        "Votre courrier a été transmis à Selen. Un agent va l'étudier pour vous indiquer la suite.",
      );
      showConfirmation(
        "Courrier transmis à Selen",
        "Nous avons bien reçu votre courrier de refus. Selen va l'étudier pour comprendre les points à reprendre. Vous recevrez un email lorsqu'une suite sera disponible dans votre espace client.",
      );
      await loadClientState({ showLoading: false });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    } finally {
      setRefusalSubmitting(false);
    }
  }

  async function handleSubmitEssentialInfos() {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const hasExistingRequiredDocument = (documentType: string) =>
        clientUploadedDocuments.some(
          (document) => document.document_type === documentType,
        );

      const missingRequiredDocuments = [
        {
          label: "CV formateur",
          documentType: "cv_formateur",
          file: docs.cv.file,
        },
        {
          label: "Programme de formation",
          documentType: "programme_formation",
          file: docs.programme.file,
        },
        {
          label: "Avis INSEE",
          documentType: "avis_insee",
          file: docs.insee.file,
        },
      ].filter(
        (document) =>
          !document.file && !hasExistingRequiredDocument(document.documentType),
      );

      if (missingRequiredDocuments.length > 0) {
        throw new Error(
          `Document(s) obligatoire(s) manquant(s) : ${missingRequiredDocuments
            .map((document) => document.label)
            .join(", ")}.`,
        );
      }

      await saveStep1();

      if (docs.cv.file) {
        await uploadOneDocument("cv_formateur", docs.cv.file);
      }
      if (docs.programme.file) {
        await uploadOneDocument("programme_formation", docs.programme.file);
      }
      if (docs.insee.file) {
        await uploadOneDocument("avis_insee", docs.insee.file);
      }
      if (docs.kbis.file) {
        await uploadOneDocument("kbis", docs.kbis.file);
      }

      isStep1DirtyRef.current = false;
      await loadClientState({ showLoading: false, forceFormSync: true });

      setDocs({
        cv: { file: null, uploading: false },
        programme: { file: null, uploading: false },
        insee: { file: null, uploading: false },
        kbis: { file: null, uploading: false },
      });

      setSuccessMessage("Vos informations essentielles ont bien été envoyées.");
      showConfirmation(
        "Informations reçues",
        "Nous avons bien reçu vos informations essentielles et vos premiers documents. Selen va maintenant vérifier les éléments transmis. Vous recevrez un email dès que votre programme sera prêt à être consulté ou dès qu'une action sera attendue de votre part.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await saveStep1();
      isStep1DirtyRef.current = false;

      setSuccessMessage("Vos informations ont bien été enregistrées.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveStep2() {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const res = await fetch("/api/client/dossier/step-2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dossierId,
          ...step2Form,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error ??
            "Erreur lors de l'enregistrement des coordonnées client.",
        );
      }

      isStep2DirtyRef.current = false;
      await loadClientState({ showLoading: false, forceFormSync: true });

      setSuccessMessage("Les coordonnées du client ont bien été enregistrées.");
      showConfirmation(
        "Coordonnées transmises",
        "Vos coordonnées client ont bien été transmises à Selen. Nous allons préparer les documents nécessaires à votre dossier. Vous recevrez un email dès qu'ils seront prêts et mis à disposition dans votre espace client.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitFinalDocuments() {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const selectedFinalDocuments = finalDocumentItems.filter(
        (item) => finalDocs[item.key].file,
      );
      const hasReturnedFinalDocument = (documentType: string) =>
        finalReturnedDocuments.some(
          (document) => document.document_type === documentType,
        );
      const missingRequiredDocuments = finalDocumentItems.filter(
        (item) =>
          item.required &&
          !finalDocs[item.key].file &&
          !hasReturnedFinalDocument(item.documentType),
      );

      if (missingRequiredDocuments.length > 0) {
        throw new Error(
          `Document(s) obligatoire(s) manquant(s) : ${missingRequiredDocuments
            .map((item) => item.name)
            .join(", ")}.`,
        );
      }

      if (selectedFinalDocuments.length === 0) {
        throw new Error(
          "Ajoutez au moins un document signé ou une pièce finale.",
        );
      }

      for (const item of selectedFinalDocuments) {
        const file = finalDocs[item.key].file;

        if (file) {
          await uploadOneFinalDocument(item.documentType, file);
        }
      }

      void notifyFinalDocumentsSubmitted();

      await loadClientState({ showLoading: false });

      setFinalDocs({
        conventionSignee: { file: null, uploading: false },
        programmeFormationSigne: { file: null, uploading: false },
        diplomesFormateurPrincipal: { file: null, uploading: false },
        casierJudiciaireN3: { file: null, uploading: false },
        statutActiviteFormationAdulte: { file: null, uploading: false },
        listeFormateursSignee: { file: null, uploading: false },
        statutsSociete: { file: null, uploading: false },
      });

      setSuccessMessage("Vos documents signés ont bien été déposés.");
      showConfirmation(
        "Documents reçus",
        "Nous avons bien reçu vos documents. Selen va effectuer la vérification finale de votre dossier. Vous recevrez un email dès que la suite sera disponible.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    } finally {
      setSaving(false);
    }
  }

  const clientDecision =
    programDecision ?? programProposal?.client_decision ?? null;
  const hasProgramProposal = Boolean(programProposal);
  const normalizedDossierStatus = dossierStatus ?? "";
  const normalizedProgramStatus =
    programVersionStatus ?? programProposal?.status ?? "";
  const isProgramValidated =
    isProgramValidatedFromState ||
    clientDecision === "validated" ||
    PROGRAM_VALIDATED_STATUSES.includes(normalizedProgramStatus);
  const isProgramRefused =
    isProgramRefusedFromState ||
    clientDecision === "refused" ||
    PROGRAM_REFUSED_STATUSES.includes(normalizedProgramStatus);
  const isProgramSentToClient =
    isProgramSentToClientFromState ||
    hasProgramProposal || PROGRAM_SENT_STATUSES.includes(normalizedDossierStatus);
  const isProgramPendingDecision =
    isProgramSentToClient && !isProgramValidated && !isProgramRefused;
  const ndaDepositStatus = ndaTracking?.nda_deposit_status ?? null;
  const isNdaObtained =
    ndaDepositStatus === "nda_obtained" ||
    Boolean(ndaTracking?.nda_obtained_at) ||
    NDA_OBTAINED_STATUSES.includes(normalizedDossierStatus);
  const isNdaDepositSubmitted =
    ndaDepositStatus === "dreets_pending" ||
    Boolean(ndaTracking?.nda_deposit_submitted_at) ||
    NDA_DEPOSIT_SUBMITTED_STATUSES.includes(normalizedDossierStatus);
  const isNdaRefused =
    ndaDepositStatus === "refusal_received" ||
    Boolean(ndaTracking?.nda_deposit_refusal_received_at) ||
    NDA_REFUSED_STATUSES.includes(normalizedDossierStatus);
  const isNdaDepositReady =
    canShowDepositProcedure ||
    (isDepositProcedureOpen &&
      !isNdaObtained &&
      !isNdaDepositSubmitted &&
      !isNdaRefused);
  const isFinalReview =
    !isNdaObtained &&
    !isNdaDepositSubmitted &&
    !isNdaRefused &&
    !isNdaDepositReady &&
    finalReturnedDocuments.length > 0 &&
    FINAL_REVIEW_STATUSES.includes(normalizedDossierStatus);
  const isPastSigningWorkflow =
    isFinalReview ||
    isNdaDepositReady ||
    isNdaDepositSubmitted ||
    isNdaRefused ||
    isNdaObtained;
  const isStep2Submitted =
    isClientDetailsSubmittedFromState ||
    [
      step2Form.client_nom,
      step2Form.client_siret,
      step2Form.stagiaire_prenom,
      step2Form.stagiaire_nom,
      step2Form.stagiaire_email,
      step2Form.date_formation_prevue,
      step2Form.lieu_formation,
    ].every((value) => value.trim().length > 0);
  const showStep2 =
    step1Submitted && isProgramValidated && !isPastSigningWorkflow;
  const showStep2Form = showStep2 && !isStep2Submitted;
  const showSigningDocumentsAction =
    showStep2 && signingDocumentsReady && !isFinalReview;
  const showDocumentsPreparationWaiting =
    areDocumentsBeingPreparedFromState &&
    showStep2 &&
    isStep2Submitted &&
    !signingDocumentsReady &&
    !isFinalReview;
  const finalDocumentItems: Array<{
    key: FinalDocKey;
    name: string;
    documentType: string;
    status: "Obligatoire" | "Si concerné";
    statusColor: "required" | "optional";
    required: boolean;
    description: string;
    notice: string;
  }> = [
    {
      key: "conventionSignee",
      name: "Convention de formation signée",
      documentType: "convention_signee",
      status: "Obligatoire",
      statusColor: "required",
      required: true,
      description:
        "Déposez la convention complétée et signée avec la mention demandée.",
      notice: "Format accepté : PDF, DOCX.",
    },
    {
      key: "programmeFormationSigne",
      name: "Programme de formation signé",
      documentType: "programme_formation_signe",
      status: "Obligatoire",
      statusColor: "required",
      required: true,
      description:
        "Déposez le programme signé après vérification des informations.",
      notice: "Format accepté : PDF, DOCX.",
    },
    {
      key: "diplomesFormateurPrincipal",
      name: "Copies des diplômes / attestations de formation du formateur",
      documentType: "diplomes_formateur_principal",
      status: "Obligatoire",
      statusColor: "required",
      required: true,
      description:
        "Déposez les diplômes, attestations de formation ou justificatifs de compétence du formateur principal.",
      notice: "Format accepté : PDF, DOCX.",
    },
    {
      key: "casierJudiciaireN3",
      name: "Casier judiciaire n°3 du dirigeant",
      documentType: "casier_judiciaire_n3",
      status: "Obligatoire",
      statusColor: "required",
      required: true,
      description:
        "Déposez le casier judiciaire n°3 du dirigeant pour le contrôle final.",
      notice: "Format accepté : PDF, DOCX.",
    },

    {
      key: "listeFormateursSignee",
      name: "Liste des formateurs signée",
      documentType: "liste_formateurs_signee",
      status: "Obligatoire",
      statusColor: "required",
      required: true,
      description:
        "Déposez la liste des formateurs signée pour permettre le contrôle final du dossier.",
      notice: "Format accepté : PDF, DOCX.",
    },
    {
      key: "statutsSociete",
      name: "Statuts de la société",
      documentType: "statuts_societe",
      status: "Si concerné",
      statusColor: "optional",
      required: false,
      description:
        "Déposez les statuts de la société uniquement si votre structure en dispose.",
      notice: "Format accepté : PDF, DOCX.",
    },
  ];
  const activeStepNumber = currentStep;

  const steps = progressSteps;
  const activeProgressStep =
    steps.find((step) => step.active) ??
    steps.find((step) => step.number === activeStepNumber) ??
    steps[0];
  const stepReassuranceMessage = getStepReassuranceMessage(activeStepNumber);
  const completedProgressSteps = steps.filter(
    (step) => step.number < activeStepNumber,
  );
  const upcomingProgressSteps = steps.filter(
    (step) => step.number > activeStepNumber,
  );

  if (accessLoading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 100%)",
          color: "#3a261a",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <p style={{ color: "#6f5b49" }}>Chargement de votre dossier NDA...</p>
      </main>
    );
  }

  if (accessError) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 100%)",
          color: "#3a261a",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <section
          style={{
            width: "min(720px, 100%)",
            border: "1px solid #d8c3a8",
            background: "rgba(255,252,247,0.92)",
            padding: "1.5rem",
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#8a4b24",
              marginBottom: 8,
              fontFamily: "sans-serif",
            }}
          >
            Acces dossier NDA
          </p>

          <h1 style={{ margin: "0 0 0.75rem", color: "#3a261a" }}>
            Dossier indisponible
          </h1>

          <p style={{ color: "#5f4d3d", lineHeight: 1.7, marginBottom: 16 }}>
            {accessError}
          </p>

          <button
            type="button"
            className="btn-ink"
            onClick={() => router.push("/client")}
          >
            <span>Retour a mon espace client</span>
          </button>
        </section>
      </main>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 100%)",
        color: "#3a261a",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* HEADER                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header
        style={{
          borderBottom: "1px solid #ddd0bd",
          background: "#f4efe6",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 2.5rem",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "1px solid #dcc9af",
                background: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <img
                src="/logo-selen-editions.png"
                alt="Selen Editions"
                style={{ width: 30, height: 30, objectFit: "contain" }}
              />
            </div>
            <div>
              <p
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                Selen Editions
              </p>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: "#8b7a67",
                  margin: 0,
                  fontFamily: "sans-serif",
                }}
              >
                Espace client
              </p>
            </div>
          </div>

          {/* Nav droite */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/client"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #d8c3a8",
                background: "#fffaf3",
                color: "#4b2e1e",
                padding: "8px 12px",
                borderRadius: 2,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "sans-serif",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textDecoration: "none",
              }}
            >
              Retour à mon espace client
            </Link>
            <Btn variant="ghost" size="sm">
              Réserver un appel
            </Btn>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* BANDEAU PROGRESSION                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          background: "#4b2e1e",
          borderBottom: "1px solid #3a2212",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 2.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "14px 0",
              flexWrap: "wrap",
            }}
          >
            {activeProgressStep ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: "2px solid #c98b49",
                    background: "#c98b49",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                    fontFamily: "sans-serif",
                  }}
                >
                  {activeProgressStep.number}
                </div>
                <div>
                  <p
                    style={{
                      margin: 0,
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: "sans-serif",
                    }}
                  >
                    {activeProgressStep.label}
                  </p>
                  <p
                    style={{
                      margin: "3px 0 0",
                      color: "#e9d2b5",
                      fontSize: 11,
                      fontFamily: "sans-serif",
                    }}
                  >
                    {activeProgressStep.status}
                  </p>
                </div>
              </div>
            ) : null}
            {upcomingProgressSteps.length > 0 ? (
              <p
                style={{
                  margin: 0,
                  color: "rgba(255,255,255,0.68)",
                  fontSize: 11,
                  fontFamily: "sans-serif",
                }}
              >
                Ensuite : {upcomingProgressSteps[0].label}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* HERO                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section
        style={{
          borderBottom: "1px solid #c9b79c",
          padding: "3.5rem 0 3rem",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 2.5rem",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 40,
            alignItems: "center",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 10,
                letterSpacing: "0.35em",
                textTransform: "uppercase",
                color: "#9c5a2e",
                marginBottom: 14,
                fontFamily: "sans-serif",
              }}
            >
              {`Accompagnement NDA · Étape ${activeStepNumber} sur 8`}
            </p>
            <h1
              style={{
                fontSize: "clamp(2.2rem, 5vw, 3.5rem)",
                fontWeight: 600,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                margin: "0 0 20px",
                color: "#3a261a",
              }}
            >
              {showSigningDocumentsAction ? (
                <>
                  Vos documents{" "}
                  <span style={{ color: "#9c5a2e" }}>à signer</span>,
                  <br />
                  prêts à télécharger
                </>
              ) : showStep2 ? (
                <>
                  Coordonnées du{" "}
                  <span style={{ color: "#9c5a2e" }}>client à former</span>,
                  <br />
                  pas à pas
                </>
              ) : (
                <>
                  Vos premières{" "}
                  <span style={{ color: "#9c5a2e" }}>informations</span>,
                  <br />
                  pas à pas
                </>
              )}
            </h1>
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.75,
                color: "#5f4d3d",
                maxWidth: 560,
                margin: 0,
              }}
            >
              {showSigningDocumentsAction
                ? "Vos documents contractuels sont prêts. Téléchargez-les, signez-les, puis déposez les documents signés et les pièces finales dans l'espace prévu plus bas."
                : showStep2
                  ? "Cette étape nous permet de préparer les documents contractuels et administratifs liés à votre future action de formation."
                  : "Cette première étape nous permet de lancer votre accompagnement, de préparer vos futurs documents et de vous guider sans vous demander d'informations inutiles."}{" "}
            </p>
          </div>

          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: "50%",
              border: "1px solid #d9c9b2",
              background:
                "radial-gradient(circle, #fffaf3 0%, #f2e8d9 70%, #eadcc8 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <img
              src="/selion.png"
              alt="Mascotte Selen"
              style={{ width: 128, height: 128, objectFit: "contain" }}
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <main
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "2.5rem 2.5rem 5rem",
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: 28,
          alignItems: "start",
        }}
      >
        {/* ====================== COLONNE GAUCHE ========================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card>
            <Badge>Suite du dossier</Badge>
            <p style={{ ...styles.body, marginTop: 10 }}>
              {stepReassuranceMessage}
            </p>
          </Card>

          {!step1Submitted ? <NdaWelcomeCard /> : null}

          {!step1Submitted ? (
            <>
              <Card>
                <Badge>Étape 1</Badge>
                <h2 style={styles.cardTitle}>Avant de commencer</h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    marginTop: 16,
                  }}
                >
                  <p style={styles.body}>
                    Ici, nous recueillons les informations indispensables pour
                    lancer votre accompagnement et préparer vos documents.
                  </p>
                  <p style={styles.body}>
                    Nous ne vous demandons pas tout d&apos;un coup :
                    l&apos;objectif est de vous faire avancer étape par étape,
                    sans surcharge.
                  </p>
                  <p
                    style={{
                      ...styles.body,
                      fontStyle: "italic",
                      color: "#7f6b58",
                    }}
                  >
                    Étape suivante : lorsque vous aurez trouvé votre client ou
                    votre session, vous nous transmettrez les coordonnées
                    utiles, les dates et le lieu de formation.
                  </p>
                </div>
              </Card>

              <SimpleFormCard
                badge="Indispensable"
                title="Organisme de formation"
                intro="Ces informations nous servent à ouvrir correctement votre accompagnement et à préparer les futurs documents au nom de votre organisme."
              >
                <Field
                  label="Raison sociale"
                  placeholder="Ex. Nom organisme"
                  value={form.organisation_name}
                  onChange={(value) => updateForm("organisation_name", value)}
                />
                <Field
                  label="Email"
                  placeholder="contact@exemple.fr"
                  type="email"
                  value={form.organisation_email}
                  onChange={(value) => updateForm("organisation_email", value)}
                />
                <Field
                  label="Téléphone"
                  placeholder="06 00 00 00 00"
                  value={form.organisation_phone}
                  onChange={(value) => updateForm("organisation_phone", value)}
                />
              </SimpleFormCard>

              <SimpleFormCard
                badge="Indispensable"
                title="Représentant de l'organisme"
                intro="Nous utiliserons ces informations pour compléter les documents administratifs liés à votre organisme."
              >
                <Field
                  label="Prénom"
                  placeholder="Prénom"
                  value={form.representant_prenom}
                  onChange={(value) => updateForm("representant_prenom", value)}
                />
                <Field
                  label="Nom"
                  placeholder="Nom"
                  value={form.representant_nom}
                  onChange={(value) => updateForm("representant_nom", value)}
                />
              </SimpleFormCard>

              <SimpleFormCard
                badge="Indispensable"
                title="Formateur principal"
                intro="Ces informations nous permettent d'identifier correctement le formateur principal et de préparer les documents associés."
              >
                <Field
                  label="Prénom"
                  placeholder="Prénom"
                  value={form.formateur_prenom}
                  onChange={(value) => updateForm("formateur_prenom", value)}
                />
                <Field
                  label="Nom"
                  placeholder="Nom"
                  value={form.formateur_nom}
                  onChange={(value) => updateForm("formateur_nom", value)}
                />
                <Field
                  label="Email"
                  placeholder="formateur@exemple.fr"
                  type="email"
                  full
                  value={form.formateur_email}
                  onChange={(value) => updateForm("formateur_email", value)}
                />
              </SimpleFormCard>

              <Card>
                <Badge>Indispensable</Badge>
                <h2 style={styles.cardTitle}>Formation</h2>
                <p style={{ ...styles.body, margin: "12px 0 20px" }}>
                  Nous avons besoin ici de l'intitulé exact, de la durée, du
                  tarif et de la modalité. Les dates, le lieu précis et les
                  informations stagiaire seront demandés à l'étape suivante.
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  <Field
                    label="Intitulé exact de la formation"
                    placeholder="Ex. Création et gestion d'entreprise"
                    full
                    value={form.formation_intitule}
                    onChange={(value) =>
                      updateForm("formation_intitule", value)
                    }
                  />
                  <Field
                    label="Durée"
                    placeholder="35 heures"
                    value={form.formation_duree}
                    onChange={(value) => updateForm("formation_duree", value)}
                  />
                  <Field
                    label="Tarif"
                    placeholder="Ex. 1 200 € TTC"
                    value={form.formation_tarif}
                    onChange={(value) => updateForm("formation_tarif", value)}
                  />
                  <SelectField
                    label="Modalité"
                    options={["Présentiel", "Distanciel", "Mixte"]}
                    value={form.formation_modalite}
                    onChange={(value) =>
                      updateForm("formation_modalite", value)
                    }
                  />
                </div>
                <Notice style={{ marginTop: 16 }}>
                  Le programme doit être cohérent avec les diplômes et la
                  qualification du formateur. En cas d'écart, un ajustement
                  pourra être nécessaire avant validation.
                </Notice>
              </Card>

              <Card>
                <Badge>Documents</Badge>
                <h2 style={styles.cardTitle}>Pièces à déposer</h2>
                <p style={{ ...styles.body, margin: "12px 0 20px" }}>
                  Ces pièces nous permettent de vérifier la cohérence de votre
                  activité et de préparer le traitement administratif dans de
                  bonnes conditions.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  <DocDropZone
                    docKey="cv"
                    name="CV formateur"
                    status="Obligatoire"
                    statusColor="required"
                    description="Le CV doit mentionner les formations dispensées, les diplômes obtenus et l'expérience professionnelle du formateur."
                    notice="Format accepté : PDF, DOCX. Assurez-vous que le CV est à jour et reflète les compétences liées à la formation."
                    state={docs.cv}
                    onDrop={(f) => handleFileDrop("cv", f)}
                  />
                  <DocDropZone
                    docKey="programme"
                    name="Programme de formation"
                    status="Obligatoire"
                    statusColor="required"
                    description="Le programme doit être en rapport avec les diplômes du formateur. Si votre programme n'est pas conforme ou risque d'être refusé, une reformulation vous sera proposée."
                    notice="Format accepté : PDF, DOCX. Nous vous proposons un modèle à télécharger si vous n'en avez pas encore."
                    state={docs.programme}
                    onDrop={(f) => handleFileDrop("programme", f)}
                    downloadLabel="Télécharger le modèle de programme de formation"
                    downloadHref="/templates/modele-programme-formation-selen.docx"
                  />
                  <DocDropZone
                    docKey="insee"
                    name="Avis INSEE"
                    status="Obligatoire"
                    statusColor="required"
                    description="L'avis de situation SIRENE (INSEE) permet de vérifier l'existence légale de votre organisme et votre code APE."
                    notice={
                      <>
                        Téléchargeable gratuitement sur{" "}
                        <a
                          href="https://avis-situation-sirene.insee.fr/"
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "#9c5a2e",
                            fontWeight: 600,
                            textDecoration: "underline",
                            textUnderlineOffset: 2,
                          }}
                        >
                          le site de l’INSEE
                        </a>
                        . Doit dater de moins de 3 mois.
                      </>
                    }
                    state={docs.insee}
                    onDrop={(f) => handleFileDrop("insee", f)}
                  />
                  <DocDropZone
                    docKey="kbis"
                    name="Extrait KBIS"
                    status="Si concerné"
                    statusColor="optional"
                    description="Le KBIS est requis pour les sociétés commerciales. Il n’est pas attendu pour les micro-entreprises."
                    notice={
                      <>
                        À récupérer sur{" "}
                        <a
                          href="https://www.infogreffe.fr/kbis-documents/extrait-kbis?gad_source=1&gad_campaignid=23156315645&gbraid=0AAAAA90djejbDaanrl7BHHLn2O3kybwqB&gclid=Cj0KCQjwmunNBhDbARIsAOndKpm7ss8JfBpadw7vJdKBPyRo3mOxmvFG3a1cMhvucrhq4MNQLetqRWwaAuX1EALw_wcB"
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "#9c5a2e",
                            fontWeight: 600,
                            textDecoration: "underline",
                            textUnderlineOffset: 2,
                          }}
                        >
                          Infogreffe
                        </a>
                        . Pas de KBIS pour les micro-entreprises.
                      </>
                    }
                    state={docs.kbis}
                    onDrop={(f) => handleFileDrop("kbis", f)}
                  />
                </div>

                <Notice style={{ marginTop: 20 }}>
                  Vous avez un document ou une image et vous souhaitez le
                  transformer en PDF ? Le site{" "}
                  <a
                    href="https://www.ilovepdf.com/fr/"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "#9c5a2e",
                      fontWeight: 600,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    iLovePDF
                  </a>{" "}
                  permet de convertir gratuitement vos documents en PDF.
                </Notice>
              </Card>

              {!showSigningDocumentsAction ? (
                <DocumentSections
                  dossierId={dossierId}
                  clientUploadedDocuments={clientUploadedDocuments}
                  publishedDocuments={publishedDocuments}
                  signingDocuments={signingDocuments}
                />
              ) : null}

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "flex-end",
                  paddingTop: 8,
                  flexWrap: "wrap",
                }}
              >
                <Btn variant="ghost" onClick={handleSaveDraft}>
                  {saving
                    ? "Enregistrement..."
                    : "Enregistrer mes informations"}
                </Btn>
                <Btn variant="primary" onClick={handleSubmitEssentialInfos}>
                  {saving
                    ? "Envoi en cours..."
                    : "Envoyer mes informations essentielles →"}
                </Btn>

                {errorMessage && (
                  <Notice
                    style={{
                      marginTop: 8,
                      border: "1px solid #e7b8b8",
                      background: "#fff1f1",
                      color: "#8a2f2f",
                      width: "100%",
                    }}
                  >
                    {errorMessage}
                  </Notice>
                )}

                {successMessage && (
                  <Notice
                    style={{
                      marginTop: 8,
                      border: "1px solid #cfe3c3",
                      background: "#f4fbef",
                      color: "#446236",
                      width: "100%",
                    }}
                  >
                    {successMessage}
                  </Notice>
                )}
              </div>
            </>
          ) : (
            <>
              <Card>
                <Badge>Étape 1 terminée</Badge>
                <h2 style={styles.cardTitle}>
                  Merci, votre dossier a bien été transmis
                </h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    marginTop: 16,
                  }}
                >
                  <p style={styles.body}>
                    Un agent va maintenant prendre en charge votre dossier. Il
                    pourra vous contacter si certains éléments doivent être
                    précisés ou complétés.
                  </p>
                  <p style={styles.body}>
                    La prochaine étape consiste à vérifier et, si nécessaire, à
                    retravailler votre programme afin qu’il soit cohérent avec
                    les diplômes du formateur et les attentes de l’instruction
                    du dossier.
                  </p>
                  <Notice>
                    Notre objectif est de vous proposer un programme conforme,
                    cohérent et défendable, afin d’optimiser les chances
                    d’acceptation de votre demande.
                  </Notice>
                </div>
              </Card>

              <Card>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <Badge>Vos informations</Badge>
                    <h2 style={{ ...styles.cardTitle, marginTop: 6 }}>
                      Informations déjà transmises
                    </h2>
                  </div>

                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowStep1Details((prev) => !prev)}
                  >
                    {showStep1Details ? "Masquer" : "Afficher"}
                  </Btn>
                </div>

                {showStep1Details ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      marginTop: 16,
                    }}
                  >
                    <Notice>
                      Vous pouvez consulter les éléments transmis. Si une
                      correction est nécessaire, votre agent vous l’indiquera
                      directement dans la messagerie.
                    </Notice>

                    <div style={{ ...styles.body }}>
                      <strong>Organisme :</strong>{" "}
                      {form.organisation_name || "—"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Email :</strong> {form.organisation_email || "—"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Téléphone :</strong>{" "}
                      {form.organisation_phone || "—"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Formateur :</strong>{" "}
                      {form.formateur_prenom || "—"} {form.formateur_nom || ""}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Formation :</strong>{" "}
                      {form.formation_intitule || "—"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Durée :</strong> {form.formation_duree || "—"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Modalité :</strong>{" "}
                      {form.formation_modalite || "—"}
                    </div>
                  </div>
                ) : null}
              </Card>

              {canShowDepositProcedure ||
              isNdaDepositSubmitted ||
              isNdaRefused ||
              isNdaObtained ? (
                <NdaDepositProcedureSection
                  availableDocuments={clientVisibleDocuments}
                  dossierId={dossierId}
                  specificCode={ndaDepositSpecificCode}
                  depositSubmitting={depositSubmitting}
                  refusalSubmitting={refusalSubmitting}
                  isDepositSubmitted={isNdaDepositSubmitted}
                  isNdaObtained={isNdaObtained}
                  isNdaRefused={isNdaRefused}
                  refusalLetterFile={refusalLetterFile}
                  refusalMessage={refusalMessage}
                  showRefusalUpload={showRefusalUpload}
                  onDepositSubmitted={handleOfficialDepositSubmitted}
                  onRefusalFileChange={setRefusalLetterFile}
                  onRefusalSubmit={handleSubmitRefusalLetter}
                  onToggleRefusalUpload={() =>
                    setShowRefusalUpload((current) => !current)
                  }
                />
              ) : isFinalReview ? (
                <FinalReviewStatusSection />
              ) : null}

              {!isPastSigningWorkflow && !isProgramSentToClient ? (
                <Card>
                  <Badge>Travail du programme</Badge>
                  <h2 style={styles.cardTitle}>
                    Prochaine étape : votre programme
                  </h2>
                  <p style={{ ...styles.body, margin: "12px 0 0" }}>
                    Un agent va analyser les éléments transmis et vous proposer,
                    si nécessaire, une version conforme de votre programme, en
                    accord avec les diplômes du formateur et les exigences du
                    dossier.
                  </p>
                  <p style={{ ...styles.body, margin: "12px 0 0" }}>
                    Cette proposition apparaîtra ici dès qu’elle sera prête.
                  </p>
                </Card>
              ) : isProgramPendingDecision ? (
                <Card>
                  <Badge>Travail du programme</Badge>
                  <h2 style={styles.cardTitle}>Votre programme est prêt</h2>
                  <p style={{ ...styles.body, margin: "12px 0 0" }}>
                    Votre conseiller a préparé une proposition de programme.
                    Vous pouvez maintenant la consulter, la valider ou demander
                    une modification.
                  </p>
                </Card>
              ) : isProgramRefused ? (
                <Card>
                  <Badge>En attente</Badge>
                  <h2 style={styles.cardTitle}>
                    Votre retour a bien été transmis
                  </h2>
                  <p style={{ ...styles.body, margin: "12px 0 0" }}>
                    Votre conseiller va reprendre votre demande et revenir vers
                    vous avec une nouvelle proposition de programme.
                  </p>
                </Card>
              ) : isProgramValidated && !isPastSigningWorkflow ? (
                <Card>
                  <Badge>Étape 2</Badge>
                  <h2 style={styles.cardTitle}>
                    Prochaine étape : les coordonnées du client à former
                  </h2>
                  <p style={{ ...styles.body, margin: "12px 0 0" }}>
                    {showSigningDocumentsAction
                      ? "Les coordonnées du client ont bien été transmises. Vos documents à signer sont maintenant disponibles ci-dessous."
                      : "Votre programme a bien été validé. Vous pouvez maintenant renseigner les coordonnées du client à qui vous allez dispenser cette formation."}
                  </p>
                </Card>
              ) : null}

              {!isPastSigningWorkflow && !isProgramSentToClient ? (
                <Card>
                  <Badge>En attente</Badge>
                  <h2 style={styles.cardTitle}>Programme en cours d’étude</h2>
                  <p style={{ ...styles.body, margin: "12px 0 0" }}>
                    Votre dossier est actuellement en cours d’analyse. Dès qu’un
                    agent aura préparé une proposition de programme, elle
                    s’affichera dans cet espace.
                  </p>
                </Card>
              ) : isProgramPendingDecision && hasProgramProposal ? (
                <ClientProgramProposal
                  dossierId={dossierId}
                  program={programProposal}
                />
              ) : isProgramPendingDecision ? (
                <Card>
                  <Badge>Validation du programme</Badge>
                  <h2 style={styles.cardTitle}>
                    Votre programme est prêt à être validé
                  </h2>
                  <p style={{ ...styles.body, margin: "12px 0 0" }}>
                    Une proposition de programme vous a été transmise. Si elle
                    n'apparaît pas encore, rechargez la page dans quelques
                    instants ou contactez Selen.
                  </p>
                </Card>
              ) : isProgramRefused ? (
                <Card>
                  <Badge>En attente</Badge>
                  <h2 style={styles.cardTitle}>
                    Votre demande de modification a bien été transmise
                  </h2>
                  <p style={{ ...styles.body, margin: "12px 0 0" }}>
                    Votre conseiller va relire votre retour et revenir vers vous
                    avec une nouvelle proposition de programme.
                  </p>
                </Card>
              ) : isProgramValidated && !isPastSigningWorkflow ? (
                <>
                  {showStep2Form ? (
                    <>
                      <Card>
                        <Badge>Étape 2</Badge>
                        <h2 style={styles.cardTitle}>
                          Coordonnées du client à former
                        </h2>
                        <p style={{ ...styles.body, margin: "12px 0 0" }}>
                          Renseignez les informations connues sur votre premier
                          client professionnel. Les aides sont placées au fil du
                          formulaire pour vous guider champ par champ.
                        </p>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 22,
                            marginTop: 20,
                          }}
                        >
                          <Step2Section
                            title="Client professionnel / signataire"
                            description="Indiquez ici l'identité du premier client ou bénéficiaire professionnel pour lequel vous allez réaliser votre première formation. Le client doit être un professionnel disposant d'un numéro SIRET."
                          >
                            <Field
                              label="Nom / raison sociale du client"
                              placeholder="Ex. Atelier Martin SAS"
                              help="Nom officiel ou raison sociale à reprendre dans les documents."
                              full
                              value={step2Form.client_nom}
                              onChange={(value) =>
                                updateStep2Form("client_nom", value)
                              }
                            />
                            <Field
                              label="Adresse du client professionnel"
                              placeholder="Adresse complète du client professionnel"
                              help="Adresse qui devra apparaître dans les documents contractuels."
                              full
                              value={step2Form.client_adresse}
                              onChange={(value) =>
                                updateStep2Form("client_adresse", value)
                              }
                            />
                            <Field
                              label="Prénom représentant client"
                              placeholder="Prénom du signataire"
                              value={step2Form.client_representant_prenom}
                              onChange={(value) =>
                                updateStep2Form(
                                  "client_representant_prenom",
                                  value,
                                )
                              }
                            />
                            <Field
                              label="Nom représentant client"
                              placeholder="Nom du signataire"
                              value={step2Form.client_representant_nom}
                              onChange={(value) =>
                                updateStep2Form(
                                  "client_representant_nom",
                                  value,
                                )
                              }
                            />
                            <Field
                              label="SIRET client"
                              placeholder="123 456 789 00012"
                              help="Le SIRET confirme que le client est un professionnel."
                              value={step2Form.client_siret}
                              onChange={(value) =>
                                updateStep2Form("client_siret", value)
                              }
                            />
                          </Step2Section>

                          <Step2Section
                            title="Stagiaire / bénéficiaire"
                            description="Ces informations permettront d'identifier la personne formée dans les documents préparés. L'email servira à reprendre correctement les coordonnées du bénéficiaire."
                          >
                            <Field
                              label="Prénom stagiaire"
                              placeholder="Prénom"
                              value={step2Form.stagiaire_prenom}
                              onChange={(value) =>
                                updateStep2Form("stagiaire_prenom", value)
                              }
                            />
                            <Field
                              label="Nom stagiaire"
                              placeholder="Nom"
                              value={step2Form.stagiaire_nom}
                              onChange={(value) =>
                                updateStep2Form("stagiaire_nom", value)
                              }
                            />
                            <Field
                              label="Fonction stagiaire"
                              placeholder="Ex. Responsable administratif"
                              value={step2Form.stagiaire_fonction}
                              onChange={(value) =>
                                updateStep2Form("stagiaire_fonction", value)
                              }
                            />
                            <Field
                              label="Adresse stagiaire"
                              placeholder="Adresse complète du stagiaire"
                              help="Adresse à utiliser si elle doit figurer dans les documents."
                              full
                              value={step2Form.stagiaire_adresse}
                              onChange={(value) =>
                                updateStep2Form("stagiaire_adresse", value)
                              }
                            />
                            <Field
                              label="Email stagiaire"
                              placeholder="stagiaire@exemple.fr"
                              type="email"
                              help="Cet email permettra d'identifier le bénéficiaire dans le dossier."
                              value={step2Form.stagiaire_email}
                              onChange={(value) =>
                                updateStep2Form("stagiaire_email", value)
                              }
                            />
                            <Field
                              label="Téléphone stagiaire"
                              placeholder="06 00 00 00 00"
                              value={step2Form.stagiaire_telephone}
                              onChange={(value) =>
                                updateStep2Form("stagiaire_telephone", value)
                              }
                            />
                          </Step2Section>

                          <Step2Section
                            title="Action de formation"
                            description="Ces informations serviront à préparer les documents liés à votre première action de formation. Prévoyez une date réaliste et indiquez une adresse précise ou un lien de visioconférence utilisable."
                          >
                            <Field
                              label="Date prévue de début"
                              placeholder="Sélectionnez une date"
                              type="date"
                              value={step2Form.date_formation_prevue}
                              onChange={(value) =>
                                updateStep2Form("date_formation_prevue", value)
                              }
                            />
                            <Field
                              label="Lieu ou lien de formation"
                              placeholder="Adresse précise ou lien Zoom / Meet / Teams"
                              help="Indiquez un lieu précis ou un lien de connexion réellement utilisable en cas de contrôle."
                              full
                              value={step2Form.lieu_formation}
                              onChange={(value) =>
                                updateStep2Form("lieu_formation", value)
                              }
                            />
                          </Step2Section>

                          <Step2Section
                            title="Signature / règlement"
                            description="Indiquez le lieu et la date qui devront apparaître dans les documents contractuels."
                          >
                            <Field
                              label="Lieu de signature"
                              placeholder="Ex. Paris"
                              value={step2Form.lieu_signature_convention}
                              onChange={(value) =>
                                updateStep2Form(
                                  "lieu_signature_convention",
                                  value,
                                )
                              }
                            />
                            <Field
                              label="Date de signature"
                              placeholder="Sélectionnez une date"
                              type="date"
                              value={step2Form.date_signature_convention}
                              onChange={(value) =>
                                updateStep2Form(
                                  "date_signature_convention",
                                  value,
                                )
                              }
                            />
                          </Step2Section>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: 20,
                          }}
                        >
                          <Btn variant="primary" onClick={handleSaveStep2}>
                            {saving
                              ? "Enregistrement..."
                              : "Enregistrer les coordonnées du client →"}
                          </Btn>
                          {errorMessage && (
                            <Notice
                              style={{
                                marginTop: 12,
                                border: "1px solid #e7b8b8",
                                background: "#fff1f1",
                                color: "#8a2f2f",
                              }}
                            >
                              {errorMessage}
                            </Notice>
                          )}

                          {successMessage && (
                            <Notice
                              style={{
                                marginTop: 12,
                                border: "1px solid #cfe3c3",
                                background: "#f4fbef",
                                color: "#446236",
                              }}
                            >
                              {successMessage}
                            </Notice>
                          )}
                        </div>
                      </Card>
                    </>
                  ) : null}
                  {showDocumentsPreparationWaiting ? (
                    <Card>
                      <Badge>Documents en préparation</Badge>
                      <h2 style={styles.cardTitle}>
                        Vos documents sont en préparation
                      </h2>
                      <p style={{ ...styles.body, margin: "12px 0 0" }}>
                        Les coordonnées du client ont bien été transmises à
                        Selen. Nous préparons les documents nécessaires à votre
                        dossier NDA.
                      </p>
                      <Notice style={{ marginTop: 16 }}>
                        Vous recevrez un email dès que les documents à signer
                        seront prêts et mis à disposition dans votre espace
                        client.
                      </Notice>
                    </Card>
                  ) : null}
                  {showSigningDocumentsAction ? (
                    <>
                      <SigningDocumentsSection
                        dossierId={dossierId}
                        documents={signingDocuments}
                      />

                      <FinalDocumentsUploadSection
                        finalDocs={finalDocs}
                        finalDocumentItems={finalDocumentItems}
                        finalReturnedDocuments={finalReturnedDocuments}
                        saving={saving}
                        errorMessage={errorMessage}
                        successMessage={successMessage}
                        onDrop={handleFinalFileDrop}
                        onSubmit={handleSubmitFinalDocuments}
                      />

                      <DocumentSections
                        dossierId={dossierId}
                        clientUploadedDocuments={clientUploadedDocuments}
                        publishedDocuments={publishedDocuments}
                        signingDocuments={signingDocuments}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>

        {/* ====================== COLONNE DROITE ========================= */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            position: "sticky",
            top: 88,
          }}
        >
          {/* Parcours */}
          <Card>
            <p style={styles.label}>Votre parcours</p>
            {activeProgressStep ? (
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  gap: 12,
                  border: "1px solid #d9c9b2",
                  background: "#fff8ed",
                  padding: 12,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    border: "1.5px solid #4b2e1e",
                    background: "#f6efe4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#4b2e1e",
                    flexShrink: 0,
                    fontFamily: "sans-serif",
                  }}
                >
                  {activeProgressStep.number}
                </div>
                <div style={{ paddingTop: 2 }}>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#3a261a",
                      margin: 0,
                      fontFamily: "sans-serif",
                    }}
                  >
                    {activeProgressStep.label}
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "#9c5a2e",
                      margin: "4px 0 0",
                      fontFamily: "sans-serif",
                    }}
                  >
                    {activeProgressStep.status}
                  </p>
                </div>
              </div>
            ) : null}

            {completedProgressSteps.length > 0 ? (
              <details style={{ marginTop: 14 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    color: "#6f5b49",
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "sans-serif",
                  }}
                >
                  Historique des phases terminées
                </summary>
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {completedProgressSteps.map((step) => (
                    <div key={step.number} style={{ display: "flex", gap: 10 }}>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: "1px solid #d9c9b2",
                          background: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#8b7a67",
                          flexShrink: 0,
                          fontFamily: "sans-serif",
                        }}
                      >
                        {step.number}
                      </div>
                      <div>
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#7a6b5d",
                            margin: 0,
                            fontFamily: "sans-serif",
                          }}
                        >
                          {step.label}
                        </p>
                        <p
                          style={{
                            fontSize: 10,
                            color: "#9a8a78",
                            margin: "2px 0 0",
                            fontFamily: "sans-serif",
                          }}
                        >
                          {step.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            {upcomingProgressSteps.length > 0 ? (
              <Notice style={{ marginTop: 14 }}>
                Prochaine phase : {upcomingProgressSteps[0].label}.
              </Notice>
            ) : null}
            <p
              style={{
                ...styles.body,
                marginTop: 14,
                fontSize: 12,
                color: "#8b7a67",
              }}
            >
              Actualisation automatique activée
              {lastAutoRefreshAt
                ? ` · dernière mise à jour ${lastAutoRefreshAt}`
                : ""}
              .
            </p>
          </Card>

          {process.env.NODE_ENV === "development" ? (
            <Card>
              <p style={styles.label}>Debug parcours</p>
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                <p style={{ ...styles.body, fontSize: 12 }}>
                  <strong>dossierStatus :</strong> {dossierStatus ?? "—"}
                </p>
                <p style={{ ...styles.body, fontSize: 12 }}>
                  <strong>currentStep :</strong> {currentStep} ·{" "}
                  {currentStepLabel}
                </p>
                <p style={{ ...styles.body, fontSize: 12 }}>
                  <strong>canShowDepositProcedure :</strong>{" "}
                  {canShowDepositProcedure ? "true" : "false"}
                </p>
                <p style={{ ...styles.body, fontSize: 12 }}>
                  <strong>documents visibles :</strong>{" "}
                  {clientVisibleDocuments.length}
                </p>
              </div>
            </Card>
          ) : null}

          <Card>
            <p style={styles.label}>Messagerie</p>
            <div style={{ marginTop: 14 }}>
              <ClientMessagingPanel
                dossierId={dossierId}
                initialMessages={[]}
              />
            </div>
          </Card>
        </div>
      </main>

      {confirmationDialog ? (
        <ConfirmationDialog
          title={confirmationDialog.title}
          message={confirmationDialog.message}
          actionLabel={confirmationDialog.actionLabel ?? "J'ai compris"}
          onClose={closeConfirmationDialog}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocDropZone
// ---------------------------------------------------------------------------

function NdaWelcomeCard() {
  return (
    <Card>
      <Badge>Démarrage du dossier</Badge>
      <h2 style={styles.cardTitle}>Comment va se passer votre Prépa NDA ?</h2>
      <p style={{ ...styles.body, margin: "12px 0 0" }}>
        Votre dossier va être monté progressivement avec l'aide de Selen. À
        chaque étape, nous vous indiquerons les informations à transmettre et
        les actions attendues. Lorsque votre intervention sera nécessaire, vous
        serez informé par email.
      </p>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <Notice>Vous transmettez vos informations et documents initiaux.</Notice>
        <Notice>
          Selen analyse votre programme et votre parcours, puis peut vous
          soumettre une proposition de programme pour validation.
        </Notice>
        <Notice>
          Vous devrez ensuite disposer d'un premier client ou bénéficiaire
          professionnel pour finaliser le dossier.
        </Notice>
        <Notice>
          Selen préparera les documents nécessaires, puis vous serez guidé pour
          déposer votre demande de déclaration d'activité.
        </Notice>
      </div>

      <Notice style={{ marginTop: 16 }}>
        Pour déposer une demande de NDA, vous devrez justifier d'une première
        action de formation réelle ou prévue. Vous devrez donc identifier un
        premier client ou bénéficiaire à former, idéalement dans les 1 à 3 mois
        à venir. Vous pouvez commencer à le chercher dès maintenant.
      </Notice>

      <div
        style={{
          marginTop: 16,
          borderTop: "1px solid #ead9bf",
          paddingTop: 16,
        }}
      >
        <h3 style={styles.subTitle}>
          À préparer pour la suite du dossier
        </h3>
        <ul
          style={{
            margin: "0 0 0 18px",
            padding: 0,
            color: "#5f4d3d",
            lineHeight: 1.7,
            fontFamily: "sans-serif",
            fontSize: 14,
          }}
        >
          <li>Chercher un premier client ou bénéficiaire professionnel ;</li>
          <li>Rassembler les éléments liés à la première formation ;</li>
          <li>Conserver les documents transmis par Selen ;</li>
          <li>
            Demander votre extrait de casier judiciaire bulletin n°3 si
            nécessaire pour le dossier.
          </li>
        </ul>

        <Notice style={{ marginTop: 14 }}>
          Vous pouvez demander votre extrait de casier judiciaire bulletin n°3 en
          ligne sur le site officiel du ministère de la Justice. La demande est
          gratuite. Le document vous sera utile pour compléter votre dossier.
          <br />
          <a
            href={CRIMINAL_RECORD_REQUEST_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-block",
              marginTop: 8,
              color: "#8a4b24",
              fontWeight: 700,
            }}
          >
            Demander mon bulletin n°3
          </a>
        </Notice>
      </div>
    </Card>
  );
}

function ConfirmationDialog({
  title,
  message,
  actionLabel,
  onClose,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nda-confirmation-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "grid",
        placeItems: "center",
        background: "rgba(58,38,26,0.38)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          border: "1px solid #d8c3a8",
          background: "#fffaf3",
          boxShadow: "0 24px 70px rgba(58,38,26,0.28)",
          padding: "1.4rem",
          borderRadius: 4,
        }}
      >
        <Badge>Bien reçu</Badge>
        <h2 id="nda-confirmation-title" style={styles.cardTitle}>
          {title}
        </h2>
        <p style={{ ...styles.body, margin: "12px 0 0" }}>{message}</p>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 18,
          }}
        >
          <Btn variant="primary" onClick={onClose}>
            {actionLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function FinalReviewStatusSection() {
  return (
    <Card>
      <Badge>Vérification finale</Badge>
      <h2 style={styles.cardTitle}>
        Votre dossier est en vérification par Selen
      </h2>
      <p style={{ ...styles.body, margin: "12px 0 0" }}>
        Vos documents signés et pièces finales ont été transmis. Votre
        conseiller vérifie maintenant le dossier avant de vous indiquer la
        procédure de dépôt NDA.
      </p>
      <Notice style={{ marginTop: 16 }}>
        Vous n'avez rien d'autre à déposer pour le moment. Si une précision est
        nécessaire, votre conseiller vous contactera depuis cet espace.
      </Notice>
    </Card>
  );
}

function NdaDepositProcedureSection({
  availableDocuments,
  dossierId,
  specificCode,
  depositSubmitting,
  refusalSubmitting,
  isDepositSubmitted,
  isNdaObtained,
  isNdaRefused,
  refusalLetterFile,
  refusalMessage,
  showRefusalUpload,
  onDepositSubmitted,
  onRefusalFileChange,
  onRefusalSubmit,
  onToggleRefusalUpload,
}: {
  availableDocuments: NdaDocument[];
  dossierId: string;
  specificCode: string | null;
  depositSubmitting: boolean;
  refusalSubmitting: boolean;
  isDepositSubmitted: boolean;
  isNdaObtained: boolean;
  isNdaRefused: boolean;
  refusalLetterFile: File | null;
  refusalMessage: string | null;
  showRefusalUpload: boolean;
  onDepositSubmitted: () => void;
  onRefusalFileChange: (file: File | null) => void;
  onRefusalSubmit: () => void;
  onToggleRefusalUpload: () => void;
}) {
  const displayedSpecificCode =
    specificCode && specificCode.trim().length > 0
      ? specificCode
      : "À confirmer par Selen";

  if (isNdaObtained) {
    return (
      <Card>
        <Badge>NDA obtenu</Badge>
        <h2 style={styles.cardTitle}>
          🎉 Félicitations ! Votre numéro de déclaration d'activité est obtenu !
          🎆✨
        </h2>
        <p style={{ ...styles.body, margin: "12px 0 0" }}>
          Votre organisme apparaît désormais dans la liste publique des
          organismes de formation. Votre démarche NDA est validée.
        </p>

        <div style={{ marginTop: 18 }}>
          <h3 style={styles.subTitle}>Exonération de TVA formation</h3>
          <Notice>
            Vous pouvez télécharger le formulaire CERFA 3511-SD si vous
            souhaitez demander l'exonération de TVA applicable aux activités de
            formation. Il devra être complété puis envoyé par courrier à la
            DREETS de votre région. L'envoi postal n'est pas automatisé par
            Selen.
          </Notice>
          <a
            href={TVA_EXEMPTION_CERFA_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-ink"
            style={{ marginTop: 14, display: "inline-flex" }}
          >
            <span>Télécharger le CERFA d'exonération de TVA</span>
          </a>
        </div>
      </Card>
    );
  }

  if (isDepositSubmitted || isNdaRefused) {
    return (
      <Card>
        <Badge>Retour DREETS</Badge>
        <h2 style={styles.cardTitle}>
          Votre dossier est déposé, il ne reste plus qu'à patienter
        </h2>
        <p style={{ ...styles.body, margin: "12px 0 0" }}>
          Bravo pour cette étape importante. Votre dossier a été déposé sur la
          plateforme officielle. La DREETS va maintenant l'étudier et vous
          transmettre une réponse.
        </p>
        <Notice style={{ marginTop: 16 }}>
          Vous avez fait une grosse partie du chemin. Selen reste à vos côtés
          pour la suite.
        </Notice>

        {refusalMessage ? (
          <Notice
            style={{
              marginTop: 16,
              border: "1px solid #cfe3c3",
              background: "#f4fbef",
              color: "#446236",
            }}
          >
            {refusalMessage}
          </Notice>
        ) : null}

        {isNdaRefused ? (
          <Notice style={{ marginTop: 16 }}>
            Votre courrier de refus a été transmis à Selen. Un agent va
            l'étudier pour vous indiquer la suite.
          </Notice>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <Btn variant="ghost" onClick={onToggleRefusalUpload}>
            {showRefusalUpload
              ? "Masquer le dépôt du courrier"
              : "J'ai reçu un courrier de refus"}
          </Btn>
        </div>

        {showRefusalUpload ? (
          <div
            style={{
              marginTop: 16,
              borderTop: "1px solid #ead9bf",
              paddingTop: 16,
            }}
          >
            <h3 style={styles.subTitle}>Déposer le courrier de refus</h3>
            <p style={{ ...styles.body, margin: "0 0 12px" }}>
              Ajoutez le courrier reçu de la DREETS. Selen l'analysera pour vous
              indiquer les prochaines étapes.
            </p>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(event) =>
                onRefusalFileChange(event.target.files?.[0] ?? null)
              }
              style={{
                width: "100%",
                border: "1px solid #d9ccb9",
                background: "#fffdfa",
                padding: "10px 12px",
                fontFamily: "sans-serif",
              }}
            />
            {refusalLetterFile ? (
              <p style={{ ...styles.body, margin: "10px 0 0" }}>
                Fichier sélectionné : <strong>{refusalLetterFile.name}</strong>
              </p>
            ) : null}
            <div style={{ marginTop: 14 }}>
              <Btn variant="primary" onClick={onRefusalSubmit}>
                {refusalSubmitting
                  ? "Transmission..."
                  : "Transmettre le courrier à Selen"}
              </Btn>
            </div>
          </div>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <Badge>Procédure de dépôt</Badge>
      <h2 style={styles.cardTitle}>Votre dossier NDA est prêt à être déposé</h2>

      <p style={{ ...styles.body, margin: "12px 0 0" }}>
        Vos documents sont prêts. Vous pouvez maintenant déposer votre demande
        de déclaration d’activité en suivant la procédure ci-dessous.
      </p>

      <a
        href={OFFICIAL_NDA_DEPOSIT_URL}
        target="_blank"
        rel="noreferrer"
        className="btn-ink"
        style={{ marginTop: 18, display: "inline-flex" }}
      >
        <span>Accéder à la plateforme de dépôt</span>
      </a>

      <div style={{ marginTop: 18 }}>
        <DocumentList
          dossierId={dossierId}
          title="Documents validés à télécharger"
          emptyText="Les documents validés sont en cours de mise à disposition. Si le problème persiste, contactez Selen."
          documents={availableDocuments}
          downloadable
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <h3 style={styles.subTitle}>Codes à utiliser</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <Notice>
            <strong>Code général :</strong> 333 - Enseignements pour adultes
          </Notice>
          <Notice>
            <strong>Code spécifique au domaine de formation :</strong>{" "}
            {displayedSpecificCode}
          </Notice>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h3 style={styles.subTitle}>Procédure de dépôt</h3>

        <div style={{ display: "grid", gap: 12 }}>
          <Notice>
            <strong>1. Accédez à la plateforme officielle</strong>
            <p style={{ ...styles.body, margin: "8px 0 0" }}>
              Cliquez sur <strong>“Accéder à la plateforme de dépôt”</strong>,
              puis connectez-vous à votre espace Mon Activité Formation ou créez
              votre accès si nécessaire.
            </p>
          </Notice>

          <Notice>
            <strong>2. Lancez la démarche de déclaration d’activité</strong>
            <p style={{ ...styles.body, margin: "8px 0 0" }}>
              Choisissez la démarche liée à la déclaration d’activité d’un
              organisme de formation, puis renseignez les informations de votre
              organisme.
            </p>
          </Notice>

          <Notice>
            <strong>3. Renseignez les codes d’activité</strong>
            <p style={{ ...styles.body, margin: "8px 0 0" }}>
              Indiquez le code général{" "}
              <strong>333 - Enseignements pour adultes</strong>, puis le code
              spécifique au domaine de formation fourni par Selen.
            </p>
          </Notice>

          <Notice>
            <strong>4. Déposez les documents préparés</strong>
            <p style={{ ...styles.body, margin: "8px 0 10px" }}>
              Déposez les documents disponibles dans votre espace client Selen,
              notamment :
            </p>
            <ul style={{ ...styles.body, margin: "0 0 0 18px", padding: 0 }}>
              <li>La convention de formation signée ;</li>
              <li>Le programme de formation signé ;</li>
              <li>La liste des formateurs signée ;</li>
              <li>Le CV, les diplômes ou attestations utiles ;</li>
              <li>Le casier judiciaire n°3 ;</li>
              <li>Le justificatif d’existence ou l’avis INSEE ;</li>
              <li>Toute autre pièce demandée selon votre situation.</li>
            </ul>
          </Notice>

          <Notice>
            <strong>5. Vérifiez et validez le dépôt</strong>
            <p style={{ ...styles.body, margin: "8px 0 0" }}>
              Relisez attentivement les informations saisies, puis validez le
              dépôt sur la plateforme officielle. Conservez le récapitulatif ou
              l’accusé de dépôt si la plateforme vous en fournit un.
            </p>
          </Notice>

          <Notice>
            <strong>
              Important : surveillez votre messagerie Mon Activité Formation
            </strong>
            <p style={{ ...styles.body, margin: "8px 0 0" }}>
              La DREETS peut vous envoyer un message directement dans la
              messagerie interne de votre espace Mon Activité Formation, sans
              toujours vous prévenir par email. Pensez à consulter régulièrement
              cette messagerie après le dépôt.
            </p>
            <p style={{ ...styles.body, margin: "8px 0 0" }}>
              Pour toute question ou en cas de doute, votre agent Selen reste
              disponible via la messagerie de votre espace client Selen.
            </p>
          </Notice>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Btn variant="primary" onClick={onDepositSubmitted}>
          {depositSubmitting ? "Enregistrement..." : "J'ai déposé mon dossier"}
        </Btn>
      </div>
    </Card>
  );
}

function DocumentSections({
  dossierId,
  clientUploadedDocuments,
  publishedDocuments,
  signingDocuments,
}: {
  dossierId: string;
  clientUploadedDocuments: NdaDocument[];
  publishedDocuments: NdaDocument[];
  signingDocuments: NdaDocument[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const signingDocumentIds = new Set(signingDocuments.map((doc) => doc.id));

  const otherPublishedDocuments = publishedDocuments.filter(
    (document) => !signingDocumentIds.has(document.id),
  );

  return (
    <Card>
      <Badge>Documents du dossier</Badge>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h2 style={styles.cardTitle}>Vos documents</h2>
        <Btn variant="ghost" size="sm" onClick={() => setIsOpen((v) => !v)}>
          {isOpen
            ? "Masquer les documents du dossier"
            : "Afficher les documents du dossier"}
        </Btn>
      </div>

      {isOpen ? (
        <div style={{ marginTop: 18 }}>
          <DocumentList
            dossierId={dossierId}
            title="Vos documents déposés"
            emptyText="Aucun document déposé n'est encore visible ici."
            documents={clientUploadedDocuments}
          />

          <div style={{ height: 18 }} />

          <DocumentList
            dossierId={dossierId}
            title="Documents mis à disposition par Selen"
            emptyText="Aucun document n'a encore été mis à disposition par Selen."
            documents={otherPublishedDocuments}
            showClientAction
            downloadable
          />
        </div>
      ) : null}
    </Card>
  );
}

function SigningDocumentsSection({
  dossierId,
  documents,
}: {
  dossierId: string;
  documents: NdaDocument[];
}) {
  return (
    <Card>
      <Badge>Documents à signer</Badge>
      <h2 style={styles.cardTitle}>Vos documents contractuels sont prêts</h2>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginTop: 16,
        }}
      >
        <p style={styles.body}>
          Les coordonnées ont été transmises et vos documents à signer sont
          disponibles ci-dessous.
        </p>

        <Notice>
          Téléchargez chaque document, vérifiez les informations, signez-les
          manuellement avec la mention demandée, puis déposez les documents
          signés et les pièces finales dans l'espace prévu ci-dessous.
        </Notice>
      </div>

      <div style={{ marginTop: 18 }}>
        <DocumentList
          dossierId={dossierId}
          title="Documents à télécharger et signer"
          emptyText="Aucun document à signer n'est disponible pour le moment."
          documents={documents}
          showClientAction
          downloadable
        />
      </div>
    </Card>
  );
}

function FinalDocumentsUploadSection({
  finalDocs,
  finalDocumentItems,
  finalReturnedDocuments,
  saving,
  errorMessage,
  successMessage,
  onDrop,
  onSubmit,
}: {
  finalDocs: Record<FinalDocKey, DocState>;
  finalDocumentItems: Array<{
    key: FinalDocKey;
    name: string;
    documentType: string;
    status: "Obligatoire" | "Si concerné";
    statusColor: "required" | "optional";
    required: boolean;
    description: string;
    notice: string;
  }>;
  finalReturnedDocuments: NdaDocument[];
  saving: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  onDrop: (key: FinalDocKey, file: File) => void;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <Badge>Contrôle final</Badge>
      <h2 style={styles.cardTitle}>
        Déposer les documents signés et pièces finales
      </h2>

      <Notice style={{ marginTop: 16, marginBottom: 18 }}>
        Si vous avez plusieurs fichiers pour une même pièce justificative, vous
        pouvez les regrouper en un seul PDF avant dépôt. Par exemple, vous
        pouvez utiliser un outil comme{" "}
        <a
          href="https://www.ilovepdf.com/fr/fusionner_pdf"
          target="_blank"
          rel="noreferrer"
          style={{
            color: "#9c5a2e",
            fontWeight: 600,
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          iLovePDF
        </a>{" "}
        pour fusionner plusieurs documents PDF en un seul fichier.
      </Notice>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        {finalDocumentItems.map((item) => (
          <DocDropZone
            key={item.key}
            docKey={item.key}
            name={item.name}
            status={item.status}
            statusColor={item.statusColor}
            description={item.description}
            notice={item.notice}
            state={finalDocs[item.key]}
            onDrop={(file) => onDrop(item.key, file)}
          />
        ))}
      </div>

      <Notice style={{ marginTop: 18 }}>
        Une fois tous les documents déposés, votre conseiller vérifiera le
        dossier final avant préparation du dépôt NDA.
      </Notice>

      <div style={{ marginTop: 18 }}>
        <DocumentList
          dossierId=""
          title="Documents finaux déjà déposés"
          emptyText="Aucun document final n'a encore été déposé."
          documents={finalReturnedDocuments}
          preferTypeLabel
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 20,
        }}
      >
        <Btn variant="primary" onClick={onSubmit}>
          {saving ? "Dépôt en cours..." : "Déposer les documents sélectionnés"}
        </Btn>

        {errorMessage ? (
          <Notice
            style={{
              marginTop: 8,
              border: "1px solid #e7b8b8",
              background: "#fff1f1",
              color: "#8a2f2f",
              width: "100%",
            }}
          >
            {errorMessage}
          </Notice>
        ) : null}

        {successMessage ? (
          <Notice
            style={{
              marginTop: 8,
              border: "1px solid #cfe3c3",
              background: "#f4fbef",
              color: "#446236",
              width: "100%",
            }}
          >
            {successMessage}
          </Notice>
        ) : null}
      </div>
    </Card>
  );
}

function DocumentList({
  dossierId,
  title,
  emptyText,
  documents,
  showClientAction = false,
  downloadable = false,
  preferTypeLabel = false,
}: {
  dossierId: string;
  title: string;
  emptyText: string;
  documents: NdaDocument[];
  showClientAction?: boolean;
  downloadable?: boolean;
  preferTypeLabel?: boolean;
}) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload(document: NdaDocument) {
    try {
      setDownloadingId(document.id);
      setDownloadError(null);

      const res = await fetch(
        `/api/client/documents/download?dossierId=${encodeURIComponent(
          dossierId,
        )}&documentId=${encodeURIComponent(document.id)}`,
        { cache: "no-store" },
      );

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.url) {
        throw new Error(
          data?.error ?? "Impossible de préparer le lien de téléchargement.",
        );
      }

      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "Impossible de télécharger ce document.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section>
      <h3
        style={{
          fontSize: 15,
          margin: "0 0 10px",
          color: "#3a261a",
          fontFamily: "sans-serif",
        }}
      >
        {title}
      </h3>

      {downloadError ? (
        <Notice
          style={{
            marginBottom: 10,
            border: "1px solid #e7b8b8",
            background: "#fff1f1",
            color: "#8a2f2f",
          }}
        >
          {downloadError}
        </Notice>
      ) : null}

      {documents.length === 0 ? (
        <Notice>{emptyText}</Notice>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {documents.map((document) => (
            <div
              key={document.id}
              style={{
                border: "1px solid #ead9bf",
                background: "#fffdfa",
                borderRadius: 4,
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    color: "#3a261a",
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "sans-serif",
                  }}
                >
                  {preferTypeLabel
                    ? formatDocumentType(document.document_type)
                    : document.name ||
                      formatDocumentType(document.document_type)}
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    color: "#7a6453",
                    fontSize: 12,
                    fontFamily: "sans-serif",
                  }}
                >
                  {formatDocumentType(document.document_type)}
                  {document.created_at
                    ? ` · ${formatShortDate(document.created_at)}`
                    : ""}
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {showClientAction && document.requires_client_action ? (
                  <DocumentBadge tone="warning">Action requise</DocumentBadge>
                ) : null}

                <DocumentBadge tone={getDocumentStatusTone(document)}>
                  {formatDocumentStatus(document)}
                </DocumentBadge>

                {downloadable ? (
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(document)}
                  >
                    {downloadingId === document.id
                      ? "Préparation..."
                      : "Télécharger"}
                  </Btn>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DocumentBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "neutral" | "success" | "warning";
}) {
  const tones: Record<typeof tone, React.CSSProperties> = {
    neutral: {
      color: "#6f5a45",
      background: "#fbf3e4",
      borderColor: "#ead9bf",
    },
    success: {
      color: "#446236",
      background: "#f4fbef",
      borderColor: "#cfe3c3",
    },
    warning: {
      color: "#8a4b24",
      background: "#fff4e8",
      borderColor: "#e6bf8a",
    },
  };

  return (
    <span
      style={{
        border: "1px solid",
        borderRadius: 999,
        padding: "4px 9px",
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "sans-serif",
        ...tones[tone],
      }}
    >
      {children}
    </span>
  );
}

function formatDocumentStatus(document: NdaDocument) {
  if (document.review_status === "received") return "Reçu";
  if (document.review_status === "needs_correction") return "À corriger";
  if (document.review_status === "validated") return "Validé";
  if (document.review_status === "not_reviewed") return "En attente";
  if (document.review_status === "pending_client") return "À compléter";
  if (document.status === "uploaded") return "Reçu";
  return "En attente";
}

function getDocumentStatusTone(document: NdaDocument) {
  if (document.review_status === "validated") return "success";
  if (
    document.review_status === "needs_correction" ||
    document.requires_client_action
  ) {
    return "warning";
  }

  return "neutral";
}

function formatDocumentType(value?: string | null) {
  if (!value) return "Document";

  const labels: Record<string, string> = {
    convention_signee: "Convention de formation signée",
    programme_formation_signe: "Programme de formation signé",
    diplomes_formateur_principal:
      "Copies des diplômes / attestations de formation",
    casier_judiciaire_n3: "Casier judiciaire n°3",
    statut_activite_formation_adulte:
      "Justificatif / statut activité de formation adulte",
    liste_formateurs_signee: "Liste des formateurs signée",
    statuts_societe: "Statuts de la société",
  };

  if (labels[value]) {
    return labels[value];
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function DocDropZone({
  name,
  status,
  statusColor,
  description,
  notice,
  state,
  onDrop,
  downloadLabel,
  downloadHref,
}: {
  docKey: DocKey | FinalDocKey;
  name: string;
  status: string;
  statusColor: "required" | "optional";
  description: string;
  notice: React.ReactNode;
  state: DocState;
  onDrop: (file: File) => void;
  downloadLabel?: string;
  downloadHref?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onDrop(file);
  }

  const statusStyles: Record<string, React.CSSProperties> = {
    required: {
      background: "#fdf0e8",
      color: "#9c5a2e",
      border: "1px solid #e8c9a8",
    },
    optional: {
      background: "#f4f0ea",
      color: "#7a6b5d",
      border: "1px solid #ddd0bd",
    },
  };

  return (
    <div
      style={{
        borderRadius: 4,
        border: "1px solid #e2d7c5",
        background: "#fffdfa",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid #ede5d8",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <p
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#3a261a",
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {name}
          </p>
          <span
            style={{
              ...statusStyles[statusColor],
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              borderRadius: 100,
              padding: "3px 9px",
              whiteSpace: "nowrap",
              fontFamily: "sans-serif",
            }}
          >
            {status}
          </span>
        </div>

        <p
          style={{
            fontSize: 12,
            color: "#7e6e5d",
            margin: 0,
            lineHeight: 1.55,
            fontFamily: "sans-serif",
          }}
        >
          {description}
        </p>

        {downloadHref && downloadLabel && (
          <div style={{ marginTop: 10 }}>
            <a
              href={downloadHref}
              download
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#9c5a2e",
                fontWeight: 600,
                textDecoration: "underline",
                textUnderlineOffset: 2,
                fontFamily: "sans-serif",
                fontSize: 13,
              }}
            >
              {downloadLabel}
            </a>
          </div>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: "14px 16px",
          background: dragging ? "#f5ede0" : "#f8f1e8",
          borderBottom: "1px solid #ede5d8",
          cursor: "pointer",
          transition: "background 0.15s",
          textAlign: "center",
          border: dragging ? "1.5px dashed #9c5a2e" : "1.5px dashed #cdb99f",
          marginRight: 12,
          marginBottom: 0,
          marginLeft: 12,
          borderRadius: 3,
          marginTop: 12,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          style={{ display: "none" }}
          accept=".pdf,.doc,.docx"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onDrop(f);
          }}
        />

        {state.file ? (
          <div>
            <p
              style={{
                fontSize: 12,
                color: "#4b2e1e",
                fontWeight: 600,
                margin: "0 0 2px",
                fontFamily: "sans-serif",
              }}
            >
              ✓ {state.file.name}
            </p>
            <p
              style={{
                fontSize: 11,
                color: "#8b7a67",
                margin: 0,
                fontFamily: "sans-serif",
              }}
            >
              Cliquer pour remplacer
            </p>
          </div>
        ) : (
          <div>
            <p
              style={{
                fontSize: 12,
                color: "#6c5a49",
                margin: "0 0 2px",
                fontFamily: "sans-serif",
              }}
            >
              Déposer un fichier ici
            </p>
            <p
              style={{
                fontSize: 11,
                color: "#9c8878",
                margin: 0,
                fontFamily: "sans-serif",
              }}
            >
              ou cliquer pour sélectionner · PDF, DOCX
            </p>
          </div>
        )}
      </div>

      <div
        style={{
          padding: "10px 16px 12px",
          background: "#fbf7f2",
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: "#7a6453",
            margin: 0,
            lineHeight: 1.5,
            fontFamily: "sans-serif",
            fontStyle: "italic",
          }}
        >
          {notice}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composants UI partagés
// ---------------------------------------------------------------------------

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: 4,
        border: "1px solid #deceb7",
        background: "rgba(255,252,247,0.88)",
        padding: "1.5rem",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid #d8c3a8",
        background: "#f7eee2",
        padding: "3px 10px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "#9c5a2e",
        marginBottom: 10,
        fontFamily: "sans-serif",
        borderRadius: 2,
      }}
    >
      {children}
    </div>
  );
}

function Notice({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: 3,
        border: "1px solid #ead9bf",
        background: "#fbf3e4",
        padding: "12px 14px",
        fontSize: 13,
        lineHeight: 1.65,
        color: "#6f5a45",
        fontFamily: "sans-serif",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SimpleFormCard({
  title,
  badge,
  intro,
  children,
}: {
  title: string;
  badge: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <Badge>{badge}</Badge>
      <h2 style={styles.cardTitle}>{title}</h2>
      <p style={{ ...styles.body, margin: "12px 0 20px" }}>{intro}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {children}
      </div>
    </Card>
  );
}

function Step2Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        borderTop: "1px solid #ead9bf",
        paddingTop: 18,
      }}
    >
      <h3
        style={{
          margin: "0 0 14px",
          color: "#3a261a",
          fontSize: 16,
          fontWeight: 600,
          fontFamily: "sans-serif",
        }}
      >
        {title}
      </h3>
      {description ? (
        <Notice style={{ marginBottom: 14 }}>{description}</Notice>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  placeholder,
  help,
  type = "text",
  full = false,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  help?: string;
  type?: string;
  full?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label
      style={{ display: "block", gridColumn: full ? "1 / -1" : undefined }}
    >
      <span
        style={{
          display: "block",
          marginBottom: 6,
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#7f6b58",
          fontFamily: "sans-serif",
        }}
      >
        {label}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: "100%",
          border: "1px solid #d9ccb9",
          background: "#fffdfa",
          padding: "10px 14px",
          fontSize: 14,
          color: "#3a261a",
          outline: "none",
          fontFamily: "sans-serif",
          borderRadius: 3,
          boxSizing: "border-box",
        }}
        onFocus={(e) => {
          e.target.style.borderColor = "#9c5a2e";
          e.target.style.boxShadow = "0 0 0 2px rgba(156,90,46,0.12)";
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "#d9ccb9";
          e.target.style.boxShadow = "none";
        }}
      />
      {help ? (
        <span
          style={{
            display: "block",
            marginTop: 6,
            color: "#8b7a67",
            fontSize: 12,
            lineHeight: 1.45,
            fontFamily: "sans-serif",
          }}
        >
          {help}
        </span>
      ) : null}
    </label>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          marginBottom: 6,
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#7f6b58",
          fontFamily: "sans-serif",
        }}
      >
        {label}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: "100%",
          border: "1px solid #d9ccb9",
          background: "#fffdfa",
          padding: "10px 14px",
          fontSize: 14,
          color: "#3a261a",
          outline: "none",
          fontFamily: "sans-serif",
          borderRadius: 3,
          appearance: "none",
          cursor: "pointer",
        }}
      >
        <option value="">Sélectionner</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Btn({
  children,
  variant,
  size,
  full,
  onClick,
}: {
  children: React.ReactNode;
  variant: "primary" | "ghost";
  size?: "sm";
  full?: boolean;
  onClick?: () => void;
}) {
  const base: React.CSSProperties = {
    border: "none",
    cursor: "pointer",
    fontFamily: "sans-serif",
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    transition: "opacity 0.15s, background 0.15s",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 2,
    width: full ? "100%" : undefined,
  };

  const sizeStyles: React.CSSProperties =
    size === "sm"
      ? { fontSize: 11, padding: "8px 14px" }
      : { fontSize: 12, padding: "12px 20px" };

  const variantStyles: React.CSSProperties =
    variant === "primary"
      ? { background: "#4b2e1e", color: "white", border: "1px solid #4b2e1e" }
      : {
          background: "transparent",
          color: "#4b2e1e",
          border: "1px solid #c9b79c",
        };

  return (
    <button
      onClick={onClick}
      style={{ ...base, ...sizeStyles, ...variantStyles }}
      onMouseEnter={(e) => {
        (e.target as HTMLButtonElement).style.opacity = "0.82";
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLButtonElement).style.opacity = "1";
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Styles partagés
// ---------------------------------------------------------------------------

const styles = {
  cardTitle: {
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1.2,
    color: "#3a261a",
    margin: 0,
    letterSpacing: "-0.01em",
  } as React.CSSProperties,

  body: {
    fontSize: 14,
    lineHeight: 1.7,
    color: "#5f4d3d",
    margin: 0,
    fontFamily: "sans-serif",
  } as React.CSSProperties,

  label: {
    fontSize: 10,
    letterSpacing: "0.28em",
    textTransform: "uppercase" as const,
    color: "#9c5a2e",
    margin: 0,
    fontFamily: "sans-serif",
  } as React.CSSProperties,

  subTitle: {
    margin: "0 0 10px",
    color: "#3a261a",
    fontSize: 16,
    fontWeight: 600,
    fontFamily: "sans-serif",
  } as React.CSSProperties,
};
