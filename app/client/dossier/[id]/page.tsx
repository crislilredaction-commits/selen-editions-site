"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

const FINAL_REVIEW_STATUSES = ["under_review", "final_review"];
const NDA_DEPOSIT_SUBMITTED_STATUSES = [
  "nda_deposit_submitted",
  "deposit_submitted",
  "submitted_to_dreets",
  "waiting_dreets",
];
const NDA_REFUSED_STATUSES = ["nda_refused", "refused_by_dreets"];
const NDA_OBTAINED_STATUSES = ["nda_obtained"];
const OFFICIAL_NDA_DEPOSIT_URL =
  "https://efpconnect.emploi.gouv.fr/auth/realms/efp/protocol/cas/login?TARGET=https%3A%2F%2Fwww.monactiviteformation.emploi.gouv.fr%2Fmon-activite-formation%2F";
const TVA_EXEMPTION_CERFA_URL =
  "https://www.impots.gouv.fr/sites/default/files/formulaires/3511-sd/2026/3511-sd_4894.pdf";

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
  const [ndaTracking, setNdaTracking] = useState<NdaTracking | null>(null);
  const [ndaDepositSpecificCode, setNdaDepositSpecificCode] = useState<
    string | null
  >(null);
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [refusalSubmitting, setRefusalSubmitting] = useState(false);
  const [showRefusalUpload, setShowRefusalUpload] = useState(false);
  const [refusalLetterFile, setRefusalLetterFile] = useState<File | null>(null);
  const [refusalMessage, setRefusalMessage] = useState<string | null>(null);
  const [programProposal, setProgramProposal] = useState<any | null>(null);
  const [programDecision, setProgramDecision] = useState<string | null>(null);
  const [step1Submitted, setStep1Submitted] = useState(false);
  const [showStep1Details, setShowStep1Details] = useState(false);
  const [clientUploadedDocuments, setClientUploadedDocuments] = useState<
    NdaDocument[]
  >([]);
  const [publishedDocuments, setPublishedDocuments] = useState<NdaDocument[]>(
    [],
  );
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

  function updateStep2Form<K extends keyof typeof step2Form>(
    key: K,
    value: (typeof step2Form)[K],
  ) {
    setStep2Form((prev) => ({ ...prev, [key]: value }));
  }

  function updateForm<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleFileDrop(key: DocKey, file: File) {
    setDocs((prev) => ({ ...prev, [key]: { file, uploading: false } }));
  }

  function handleFinalFileDrop(key: FinalDocKey, file: File) {
    setFinalDocs((prev) => ({ ...prev, [key]: { file, uploading: false } }));
  }

  const loadClientState = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
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
        setDossierStatus(stateData?.dossier?.status ?? null);
        setNdaTracking(stateData?.ndaTracking ?? null);
        setNdaDepositSpecificCode(
          stateData?.ndaTracking?.nda_deposit_specific_code ??
            stateData?.ndaTracking?.nda_deposit_specific_code_label ??
            null,
        );
        setProgramDecision(stateData?.programDecision ?? null);
        setClientUploadedDocuments(
          (stateData?.clientUploadedDocuments ?? []) as NdaDocument[],
        );
        setFinalReturnedDocuments(
          (stateData?.finalReturnedDocuments ?? []) as NdaDocument[],
        );
        setPublishedDocuments(
          (stateData?.publishedDocuments ?? []) as NdaDocument[],
        );

        setSigningDocuments(
          (stateData?.signingDocuments ?? []) as NdaDocument[],
        );
        setSigningDocumentsReady(Boolean(stateData?.signingDocumentsReady));

        if (stateData?.step2) {
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
        }
      } catch {
        setAccessError("Impossible de charger ce dossier NDA.");
      } finally {
        setAccessLoading(false);
      }
    },
    [dossierId, router, supabase],
  );

  useEffect(() => {
    loadClientState();
  }, [loadClientState]);

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

      await loadClientState({ showLoading: false });

      setDocs({
        cv: { file: null, uploading: false },
        programme: { file: null, uploading: false },
        insee: { file: null, uploading: false },
        kbis: { file: null, uploading: false },
      });

      setSuccessMessage("Vos informations essentielles ont bien été envoyées.");
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

      setSuccessMessage("Les coordonnées du client ont bien été enregistrées.");
      router.refresh();
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
  const isProgramValidated = clientDecision === "validated";
  const normalizedDossierStatus = dossierStatus ?? "";
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
    normalizedDossierStatus === "compliant" &&
    !isNdaObtained &&
    !isNdaDepositSubmitted &&
    !isNdaRefused;
  const isFinalReview =
    !isNdaObtained &&
    !isNdaDepositSubmitted &&
    !isNdaRefused &&
    !isNdaDepositReady &&
    FINAL_REVIEW_STATUSES.includes(normalizedDossierStatus);
  const isPastSigningWorkflow =
    isFinalReview ||
    isNdaDepositReady ||
    isNdaDepositSubmitted ||
    isNdaRefused ||
    isNdaObtained;
  const showStep2 =
    step1Submitted && isProgramValidated && !isPastSigningWorkflow;
  const showStep2Form = showStep2 && !signingDocumentsReady;
  const showSigningDocumentsAction =
    showStep2 && signingDocumentsReady && !isFinalReview;
  const isProgramRefused = clientDecision === "refused";
  const isProgramPendingDecision = hasProgramProposal && !clientDecision;
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
  const activeStepNumber =
    isNdaObtained || isNdaDepositSubmitted || isNdaRefused
      ? 7
      : isNdaDepositReady
        ? 6
        : isFinalReview
          ? 5
          : !step1Submitted
            ? 1
            : isProgramRefused
              ? 2
              : !hasProgramProposal
                ? 2
                : isProgramPendingDecision
                  ? 3
                  : isProgramValidated
                    ? 4
                    : 2;

  const steps = [
    {
      number: 1,
      label: "Documents initiaux déposés",
      active: activeStepNumber === 1,
      status: step1Submitted ? "Terminé" : "En cours",
    },
    {
      number: 2,
      label: "Programme en préparation",
      active: activeStepNumber === 2,
      status: isProgramRefused
        ? "Retour transmis"
        : step1Submitted
          ? "En cours"
          : "À venir",
    },
    {
      number: 3,
      label: "Validation du programme",
      active: activeStepNumber === 3,
      status: isProgramValidated
        ? "Terminé"
        : hasProgramProposal && !clientDecision
          ? "Action requise"
          : "À venir",
    },
    {
      number: 4,
      label: "Documents à signer et pièces finales",
      active: activeStepNumber === 4,
      status:
        isFinalReview || isNdaDepositReady
          ? "Terminé"
          : signingDocumentsReady
            ? "Documents à signer"
            : isProgramValidated
              ? "Coordonnées à renseigner"
              : "Disponible après validation du programme",
    },
    {
      number: 5,
      label: "Vérification finale par Selen",
      active: activeStepNumber === 5,
      status: isNdaDepositReady
        ? "Terminé"
        : isFinalReview
          ? "En cours"
          : "À venir",
    },
    {
      number: 6,
      label: "Procédure de dépôt NDA",
      active: activeStepNumber === 6,
      status:
        isNdaObtained || isNdaDepositSubmitted || isNdaRefused
          ? "Terminé"
          : isNdaDepositReady
            ? "Disponible"
            : "À venir",
    },
    {
      number: 7,
      label: "Résultat DREETS",
      active: activeStepNumber === 7,
      status: isNdaObtained
        ? "NDA obtenu"
        : isNdaRefused
          ? "Courrier transmis"
          : isNdaDepositSubmitted
            ? "En attente"
            : "À venir",
    },
  ];

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
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" size="sm">
              Réserver un appel
            </Btn>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* BANDEAU PROGRESSION — ÉTAPE 1/4                                     */}
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
          {/* Stepper */}
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              overflowX: "auto",
            }}
          >
            {steps.map((step, i) => (
              <React.Fragment key={step.number}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 0",
                    flex: step.active ? "none" : "1 1 auto",
                    minWidth: 0,
                    opacity: step.active ? 1 : 0.45,
                    position: "relative",
                  }}
                >
                  {/* Indicateur actif */}
                  {step.active && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 2,
                        background: "#c98b49",
                      }}
                    />
                  )}

                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      border: step.active
                        ? "2px solid #c98b49"
                        : "1.5px solid rgba(255,255,255,0.3)",
                      background: step.active ? "#c98b49" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: step.active ? "#fff" : "rgba(255,255,255,0.7)",
                      flexShrink: 0,
                      fontFamily: "sans-serif",
                    }}
                  >
                    {step.number}
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "sans-serif",
                      fontWeight: step.active ? 600 : 400,
                      color: step.active ? "#fff" : "rgba(255,255,255,0.65)",
                      whiteSpace: "nowrap",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Séparateur */}
                {i < steps.length - 1 && (
                  <div
                    style={{
                      width: 32,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M4 2l4 4-4 4"
                        stroke="rgba(255,255,255,0.25)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </React.Fragment>
            ))}
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
              {`Accompagnement NDA · Étape ${activeStepNumber} sur 7`}
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

              {isNdaDepositReady ||
              isNdaDepositSubmitted ||
              isNdaRefused ||
              isNdaObtained ? (
                <NdaDepositProcedureSection
                  availableDocuments={publishedDocuments}
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

              {!isPastSigningWorkflow && !hasProgramProposal ? (
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

              {!isPastSigningWorkflow && !hasProgramProposal ? (
                <Card>
                  <Badge>En attente</Badge>
                  <h2 style={styles.cardTitle}>Programme en cours d’étude</h2>
                  <p style={{ ...styles.body, margin: "12px 0 0" }}>
                    Votre dossier est actuellement en cours d’analyse. Dès qu’un
                    agent aura préparé une proposition de programme, elle
                    s’affichera dans cet espace.
                  </p>
                </Card>
              ) : isProgramPendingDecision ? (
                <ClientProgramProposal
                  dossierId={dossierId}
                  program={programProposal}
                />
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
                          Avant de renseigner votre client
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
                            Maintenant que votre programme est validé, vous
                            devez renseigner les coordonnées du client à qui
                            vous allez dispenser cette formation.
                          </p>

                          <Notice>
                            Le client doit être un{" "}
                            <strong>professionnel</strong> disposant d’un
                            <strong> numéro SIRET</strong>.
                          </Notice>

                          <Notice>
                            Le client ne doit pas être un proche : évitez la
                            famille et les amis proches.
                          </Notice>

                          <Notice>
                            Les dates de formation doivent être prévues entre
                            <strong> 1 mois minimum</strong> et
                            <strong> 3 mois maximum</strong>.
                          </Notice>

                          <Notice>
                            La formation peut avoir lieu{" "}
                            <strong>en présentiel</strong> ou
                            <strong> en visioconférence</strong>.
                          </Notice>

                          <Notice>
                            Des contrôles de la DREETS sont possibles : contrôle
                            sur place, contrôle à distance via votre lien de
                            visioconférence, ou contrôle administratif avec
                            demande de preuves de réalisation (émargements,
                            évaluations, supports, etc.).
                          </Notice>

                          <Notice>
                            Il est donc important d’indiquer une adresse précise
                            ou un vrai lien de connexion utilisable.
                          </Notice>

                          <Notice>
                            <strong>
                              En cas de doute, réservez un appel afin d’échanger
                              avec un conseiller expert.
                            </strong>
                          </Notice>
                        </div>
                      </Card>

                      <Card>
                        <Badge>Étape 2</Badge>
                        <h2 style={styles.cardTitle}>
                          Coordonnées du client à former
                        </h2>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 22,
                            marginTop: 20,
                          }}
                        >
                          <Step2Section title="Client professionnel / signataire">
                            <Field
                              label="Nom / raison sociale du client"
                              placeholder="Ex. Atelier Martin SAS"
                              full
                              value={step2Form.client_nom}
                              onChange={(value) =>
                                updateStep2Form("client_nom", value)
                              }
                            />
                            <Field
                              label="Adresse du client professionnel"
                              placeholder="Adresse complète du client professionnel"
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
                              value={step2Form.client_siret}
                              onChange={(value) =>
                                updateStep2Form("client_siret", value)
                              }
                            />
                          </Step2Section>

                          <Step2Section title="Stagiaire / bénéficiaire">
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

                          <Step2Section title="Action de formation">
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
                              full
                              value={step2Form.lieu_formation}
                              onChange={(value) =>
                                updateStep2Form("lieu_formation", value)
                              }
                            />
                          </Step2Section>

                          <Step2Section title="Signature / règlement">
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
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {steps.map((step) => (
                <div key={step.number} style={{ display: "flex", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: step.active
                        ? "1.5px solid #4b2e1e"
                        : "1.5px solid #d9c9b2",
                      background: step.active ? "#f6efe4" : "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      color: step.active ? "#4b2e1e" : "#8b7a67",
                      flexShrink: 0,
                      fontFamily: "sans-serif",
                    }}
                  >
                    {step.number}
                  </div>
                  <div style={{ paddingTop: 6 }}>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: step.active ? "#3a261a" : "#7a6b5d",
                        margin: 0,
                        fontFamily: "sans-serif",
                      }}
                    >
                      {step.label}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: step.active ? "#9c5a2e" : "#9a8a78",
                        margin: "4px 0 0",
                        fontFamily: "sans-serif",
                      }}
                    >
                      {step.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocDropZone
// ---------------------------------------------------------------------------

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
      <Badge>Procédure de dépôt NDA</Badge>
      <h2 style={styles.cardTitle}>Votre dossier NDA est prêt à être déposé</h2>

      <p style={{ ...styles.body, margin: "12px 0 0" }}>
        Selen a vérifié les documents de votre dossier. Vous pouvez maintenant
        déposer votre demande de déclaration d'activité sur la plateforme
        officielle.
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
          title="Documents à déposer ou récupérer"
          emptyText="Aucun document de dépôt n'est encore disponible dans cet espace."
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
              <li>la convention de formation signée ;</li>
              <li>le programme de formation signé ;</li>
              <li>la liste des formateurs signée ;</li>
              <li>le CV, les diplômes ou attestations utiles ;</li>
              <li>le casier judiciaire n°3 ;</li>
              <li>le justificatif d’existence ou l’avis INSEE ;</li>
              <li>toute autre pièce demandée selon votre situation.</li>
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
  children,
}: {
  title: string;
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  placeholder,
  type = "text",
  full = false,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
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
