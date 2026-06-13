"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ClientMessagingPanel from "@/components/ClientMessagingPanel";
import ClientProgramProposal from "@/components/ClientProgramProposal";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocKey = "cv" | "programme" | "insee" | "kbis";

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
  const [programProposal, setProgramProposal] = useState<any | null>(null);
  const [programDecision, setProgramDecision] = useState<string | null>(null);
  const [step1Submitted, setStep1Submitted] = useState(false);
  const [showStep1Details, setShowStep1Details] = useState(false);
  const [step2Form, setStep2Form] = useState({
    stagiaire_prenom: "",
    stagiaire_nom: "",
    stagiaire_adresse: "",
    stagiaire_email: "",
    stagiaire_telephone: "",
    client_siret: "",
    date_formation_prevue: "",
    lieu_formation: "",
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

  useEffect(() => {
    async function loadClientState() {
      try {
        if (!dossierId) {
          setAccessLoading(false);
          setAccessError("Aucun dossier NDA n'a ete trouve dans l'URL.");
          return;
        }

        setAccessLoading(true);
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
              "Vous n'etes pas autorise a consulter ce dossier NDA.",
          );
          return;
        }

        setStep1Submitted(Boolean(stateData?.step1Submitted));
        setProgramDecision(stateData?.programDecision ?? null);

        if (stateData?.step2) {
          setStep2Form({
            stagiaire_prenom: stateData.step2.stagiaire_prenom ?? "",
            stagiaire_nom: stateData.step2.stagiaire_nom ?? "",
            stagiaire_adresse: stateData.step2.stagiaire_adresse ?? "",
            stagiaire_email: stateData.step2.stagiaire_email ?? "",
            stagiaire_telephone: stateData.step2.stagiaire_telephone ?? "",
            client_siret: stateData.step2.client_siret ?? "",
            date_formation_prevue: stateData.step2.date_formation_prevue ?? "",
            lieu_formation: stateData.step2.lieu_formation ?? "",
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
    }

    loadClientState();
  }, [dossierId, router, supabase]);

  async function saveStep1() {
    if (!dossierId) {
      throw new Error("Aucun dossierId trouvÃ© dans lâ€™URL.");
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
      throw new Error(data?.error ?? "Erreur lors de lâ€™enregistrement.");
    }

    return data;
  }

  async function uploadOneDocument(documentType: string, file: File) {
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
      throw new Error(data?.error ?? `Erreur upload ${documentType}`);
    }
  }

  async function handleSubmitEssentialInfos() {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      setStep1Submitted(true);

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

      setSuccessMessage("Vos informations essentielles ont bien Ã©tÃ© envoyÃ©es.");
      setStep1Submitted(true);
      router.refresh();
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

      setSuccessMessage("Vos informations ont bien Ã©tÃ© enregistrÃ©es.");
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
            "Erreur lors de lâ€™enregistrement des coordonnÃ©es client.",
        );
      }

      setSuccessMessage("Les coordonnÃ©es du client ont bien Ã©tÃ© enregistrÃ©es.");
      router.refresh();
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
  const showStep2 = step1Submitted && isProgramValidated;
  const isProgramRefused = clientDecision === "refused";
  const isProgramPendingDecision = hasProgramProposal && !clientDecision;
  const activeStepNumber = !step1Submitted
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
      label: "Dépôt initial",
      active: activeStepNumber === 1,
      status: step1Submitted ? "Terminé" : "En cours",
    },
    {
      number: 2,
      label: "Analyse du programme",
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
      label: "Dossier NDA à compléter",
      active: activeStepNumber === 4,
      status: isProgramValidated
        ? "En cours"
        : "Disponible après validation du programme",
    },
    {
      number: 5,
      label: "Vérification agent",
      active: false,
      status: "À venir",
    },
    {
      number: 6,
      label: "Dossier prêt pour dépôt",
      active: false,
      status: "À venir",
    },
    {
      number: 7,
      label: "Résultat DREETS",
      active: false,
      status: "À venir",
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
              RÃ©server un appel
            </Btn>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* BANDEAU PROGRESSION â€” Ã‰TAPE 1/4                                     */}
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

                {/* SÃ©parateur */}
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
              {showStep2 ? (
                <>
                  CoordonnÃ©es du{" "}
                  <span style={{ color: "#9c5a2e" }}>client Ã  former</span>,
                  <br />
                  pas Ã  pas
                </>
              ) : (
                <>
                  Vos premiÃ¨res{" "}
                  <span style={{ color: "#9c5a2e" }}>informations</span>,
                  <br />
                  pas Ã  pas
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
              {showStep2
                ? "Cette Ã©tape nous permet de prÃ©parer les documents contractuels et administratifs liÃ©s Ã  votre future action de formation."
                : "Cette premiÃ¨re Ã©tape nous permet de lancer votre accompagnement, de prÃ©parer vos futurs documents et de vous guider sans vous demander d'informations inutiles."}
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
                <Badge>Ã‰tape 1</Badge>
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
                    lancer votre accompagnement et prÃ©parer vos documents.
                  </p>
                  <p style={styles.body}>
                    Nous ne vous demandons pas tout d&apos;un coup :
                    l&apos;objectif est de vous faire avancer Ã©tape par Ã©tape,
                    sans surcharge.
                  </p>
                  <p
                    style={{
                      ...styles.body,
                      fontStyle: "italic",
                      color: "#7f6b58",
                    }}
                  >
                    Ã‰tape suivante : lorsque vous aurez trouvÃ© votre client ou
                    votre session, vous nous transmettrez les coordonnÃ©es
                    utiles, les dates et le lieu de formation.
                  </p>
                </div>
              </Card>

              <SimpleFormCard
                badge="Indispensable"
                title="Organisme de formation"
                intro="Ces informations nous servent Ã  ouvrir correctement votre accompagnement et Ã  prÃ©parer les futurs documents au nom de votre organisme."
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
                  label="TÃ©lÃ©phone"
                  placeholder="06 00 00 00 00"
                  value={form.organisation_phone}
                  onChange={(value) => updateForm("organisation_phone", value)}
                />
              </SimpleFormCard>

              <SimpleFormCard
                badge="Indispensable"
                title="ReprÃ©sentant de l'organisme"
                intro="Nous utiliserons ces informations pour complÃ©ter les documents administratifs liÃ©s Ã  votre organisme."
              >
                <Field
                  label="PrÃ©nom"
                  placeholder="PrÃ©nom"
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
                intro="Ces informations nous permettent d'identifier correctement le formateur principal et de prÃ©parer les documents associÃ©s."
              >
                <Field
                  label="PrÃ©nom"
                  placeholder="PrÃ©nom"
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
                <p style={{ ...styles.body, marginTop: 12, marginBottom: 20 }}>
                  Nous avons besoin ici de l'intitulÃ© exact, de la durÃ©e, du
                  tarif et de la modalitÃ©. Les dates, le lieu prÃ©cis et les
                  informations stagiaire seront demandÃ©s Ã  l'Ã©tape suivante.
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  <Field
                    label="IntitulÃ© exact de la formation"
                    placeholder="Ex. CrÃ©ation et gestion d'entreprise"
                    full
                    value={form.formation_intitule}
                    onChange={(value) =>
                      updateForm("formation_intitule", value)
                    }
                  />
                  <Field
                    label="DurÃ©e"
                    placeholder="35 heures"
                    value={form.formation_duree}
                    onChange={(value) => updateForm("formation_duree", value)}
                  />
                  <Field
                    label="Tarif"
                    placeholder="Ex. 1 200 â‚¬ TTC"
                    value={form.formation_tarif}
                    onChange={(value) => updateForm("formation_tarif", value)}
                  />
                  <SelectField
                    label="ModalitÃ©"
                    options={["PrÃ©sentiel", "Distanciel", "Mixte"]}
                    value={form.formation_modalite}
                    onChange={(value) =>
                      updateForm("formation_modalite", value)
                    }
                  />
                </div>
                <Notice style={{ marginTop: 16 }}>
                  Le programme doit Ãªtre cohÃ©rent avec les diplÃ´mes et la
                  qualification du formateur. En cas d'Ã©cart, un ajustement
                  pourra Ãªtre nÃ©cessaire avant validation.
                </Notice>
              </Card>

              <Card>
                <Badge>Documents</Badge>
                <h2 style={styles.cardTitle}>PiÃ¨ces Ã  dÃ©poser</h2>
                <p style={{ ...styles.body, marginTop: 12, marginBottom: 20 }}>
                  Ces piÃ¨ces nous permettent de vÃ©rifier la cohÃ©rence de votre
                  activitÃ© et de prÃ©parer le traitement administratif dans de
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
                    description="Le CV doit mentionner les formations dispensÃ©es, les diplÃ´mes obtenus et l'expÃ©rience professionnelle du formateur."
                    notice="Format acceptÃ© : PDF, DOCX. Assurez-vous que le CV est Ã  jour et reflÃ¨te les compÃ©tences liÃ©es Ã  la formation."
                    state={docs.cv}
                    onDrop={(f) => handleFileDrop("cv", f)}
                  />
                  <DocDropZone
                    docKey="programme"
                    name="Programme de formation"
                    status="Obligatoire"
                    statusColor="required"
                    description="Le programme doit Ãªtre en rapport avec les diplÃ´mes du formateur. Si votre programme n'est pas conforme ou risque d'Ãªtre refusÃ©, une reformulation vous sera proposÃ©e."
                    notice="Format acceptÃ© : PDF, DOCX. Nous vous proposons un modÃ¨le Ã  tÃ©lÃ©charger si vous n'en avez pas encore."
                    state={docs.programme}
                    onDrop={(f) => handleFileDrop("programme", f)}
                    downloadLabel="TÃ©lÃ©charger le modÃ¨le de programme de formation"
                    downloadHref="/templates/modele-programme-formation-selen.docx"
                  />
                  <DocDropZone
                    docKey="insee"
                    name="Avis INSEE"
                    status="Obligatoire"
                    statusColor="required"
                    description="L'avis de situation SIRENE (INSEE) permet de vÃ©rifier l'existence lÃ©gale de votre organisme et votre code APE."
                    notice={
                      <>
                        TÃ©lÃ©chargeable gratuitement sur{" "}
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
                          le site de lâ€™INSEE
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
                    status="Si concernÃ©"
                    statusColor="optional"
                    description="Le KBIS est requis pour les sociÃ©tÃ©s commerciales. Il nâ€™est pas attendu pour les micro-entreprises."
                    notice={
                      <>
                        Ã€ rÃ©cupÃ©rer sur{" "}
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
                    : "Envoyer mes informations essentielles â†’"}
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
                <Badge>Ã‰tape 1 terminÃ©e</Badge>
                <h2 style={styles.cardTitle}>
                  Merci, votre dossier a bien Ã©tÃ© transmis
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
                    pourra vous contacter si certains Ã©lÃ©ments doivent Ãªtre
                    prÃ©cisÃ©s ou complÃ©tÃ©s.
                  </p>
                  <p style={styles.body}>
                    La prochaine Ã©tape consiste Ã  vÃ©rifier et, si nÃ©cessaire, Ã 
                    retravailler votre programme afin quâ€™il soit cohÃ©rent avec
                    les diplÃ´mes du formateur et les attentes de lâ€™instruction
                    du dossier.
                  </p>
                  <Notice>
                    Notre objectif est de vous proposer un programme conforme,
                    cohÃ©rent et dÃ©fendable, afin dâ€™optimiser les chances
                    dâ€™acceptation de votre demande.
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
                      Informations dÃ©jÃ  transmises
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
                      Vous pouvez consulter les Ã©lÃ©ments transmis. Si une
                      correction est nÃ©cessaire, votre agent vous lâ€™indiquera
                      directement dans la messagerie.
                    </Notice>

                    <div style={{ ...styles.body }}>
                      <strong>Organisme :</strong>{" "}
                      {form.organisation_name || "â€”"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Email :</strong> {form.organisation_email || "â€”"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>TÃ©lÃ©phone :</strong>{" "}
                      {form.organisation_phone || "â€”"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Formateur :</strong>{" "}
                      {form.formateur_prenom || "â€”"} {form.formateur_nom || ""}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Formation :</strong>{" "}
                      {form.formation_intitule || "â€”"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>DurÃ©e :</strong> {form.formation_duree || "â€”"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>ModalitÃ© :</strong>{" "}
                      {form.formation_modalite || "â€”"}
                    </div>
                  </div>
                ) : null}
              </Card>

              {!hasProgramProposal ? (
                <Card>
                  <Badge>Travail du programme</Badge>
                  <h2 style={styles.cardTitle}>
                    Prochaine Ã©tape : votre programme
                  </h2>
                  <p style={{ ...styles.body, marginTop: 12 }}>
                    Un agent va analyser les Ã©lÃ©ments transmis et vous proposer,
                    si nÃ©cessaire, une version conforme de votre programme, en
                    accord avec les diplÃ´mes du formateur et les exigences du
                    dossier.
                  </p>
                  <p style={{ ...styles.body, marginTop: 12 }}>
                    Cette proposition apparaÃ®tra ici dÃ¨s quâ€™elle sera prÃªte.
                  </p>
                </Card>
              ) : isProgramPendingDecision ? (
                <Card>
                  <Badge>Travail du programme</Badge>
                  <h2 style={styles.cardTitle}>Votre programme est prÃªt</h2>
                  <p style={{ ...styles.body, marginTop: 12 }}>
                    Votre conseiller a prÃ©parÃ© une proposition de programme.
                    Vous pouvez maintenant la consulter, la valider ou demander
                    une modification.
                  </p>
                </Card>
              ) : isProgramRefused ? (
                <Card>
                  <Badge>En attente</Badge>
                  <h2 style={styles.cardTitle}>
                    Votre retour a bien Ã©tÃ© transmis
                  </h2>
                  <p style={{ ...styles.body, marginTop: 12 }}>
                    Votre conseiller va reprendre votre demande et revenir vers
                    vous avec une nouvelle proposition de programme.
                  </p>
                </Card>
              ) : isProgramValidated ? (
                <Card>
                  <Badge>Ã‰tape 2</Badge>
                  <h2 style={styles.cardTitle}>
                    Prochaine Ã©tape : les coordonnÃ©es du client Ã  former
                  </h2>
                  <p style={{ ...styles.body, marginTop: 12 }}>
                    Votre programme a bien Ã©tÃ© validÃ©. Vous pouvez maintenant
                    renseigner les coordonnÃ©es du client Ã  qui vous allez
                    dispenser cette formation.
                  </p>
                </Card>
              ) : null}

              {!hasProgramProposal ? (
                <Card>
                  <Badge>En attente</Badge>
                  <h2 style={styles.cardTitle}>Programme en cours dâ€™Ã©tude</h2>
                  <p style={{ ...styles.body, marginTop: 12 }}>
                    Votre dossier est actuellement en cours dâ€™analyse. DÃ¨s quâ€™un
                    agent aura prÃ©parÃ© une proposition de programme, elle
                    sâ€™affichera dans cet espace.
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
                    Votre demande de modification a bien Ã©tÃ© transmise
                  </h2>
                  <p style={{ ...styles.body, marginTop: 12 }}>
                    Votre conseiller va relire votre retour et revenir vers vous
                    avec une nouvelle proposition de programme.
                  </p>
                </Card>
              ) : isProgramValidated ? (
                <>
                  <Card>
                    <Badge>Ã‰tape 2</Badge>
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
                        Maintenant que votre programme est validÃ©, vous devez
                        renseigner les coordonnÃ©es du client Ã  qui vous allez
                        dispenser cette formation.
                      </p>

                      <Notice>
                        Le client doit Ãªtre un <strong>professionnel</strong>{" "}
                        disposant dâ€™un
                        <strong> numÃ©ro SIRET</strong>.
                      </Notice>

                      <Notice>
                        Le client ne doit pas Ãªtre un proche : Ã©vitez la famille
                        et les amis proches.
                      </Notice>

                      <Notice>
                        Les dates de formation doivent Ãªtre prÃ©vues entre
                        <strong> 1 mois minimum</strong> et
                        <strong> 3 mois maximum</strong>.
                      </Notice>

                      <Notice>
                        La formation peut avoir lieu{" "}
                        <strong>en prÃ©sentiel</strong> ou
                        <strong> en visioconfÃ©rence</strong>.
                      </Notice>

                      <Notice>
                        Des contrÃ´les de la DREETS sont possibles : contrÃ´le sur
                        place, contrÃ´le Ã  distance via votre lien de
                        visioconfÃ©rence, ou contrÃ´le administratif avec demande
                        de preuves de rÃ©alisation (Ã©margements, Ã©valuations,
                        supports, etc.).
                      </Notice>

                      <Notice>
                        Il est donc important dâ€™indiquer une adresse prÃ©cise ou
                        un vrai lien de connexion utilisable.
                      </Notice>

                      <Notice>
                        <strong>
                          En cas de doute, rÃ©servez un appel afin dâ€™Ã©changer
                          avec un conseiller expert.
                        </strong>
                      </Notice>
                    </div>
                  </Card>

                  <Card>
                    <Badge>Ã‰tape 2</Badge>
                    <h2 style={styles.cardTitle}>
                      CoordonnÃ©es du client Ã  former
                    </h2>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 16,
                        marginTop: 20,
                      }}
                    >
                      <Field
                        label="PrÃ©nom du stagiaire"
                        placeholder="PrÃ©nom"
                        value={step2Form.stagiaire_prenom}
                        onChange={(value) =>
                          updateStep2Form("stagiaire_prenom", value)
                        }
                      />

                      <Field
                        label="Nom du stagiaire"
                        placeholder="Nom"
                        value={step2Form.stagiaire_nom}
                        onChange={(value) =>
                          updateStep2Form("stagiaire_nom", value)
                        }
                      />

                      <Field
                        label="Adresse postale"
                        placeholder="Adresse complÃ¨te"
                        full
                        value={step2Form.stagiaire_adresse}
                        onChange={(value) =>
                          updateStep2Form("stagiaire_adresse", value)
                        }
                      />

                      <Field
                        label="Email"
                        placeholder="email@exemple.fr"
                        type="email"
                        value={step2Form.stagiaire_email}
                        onChange={(value) =>
                          updateStep2Form("stagiaire_email", value)
                        }
                      />

                      <Field
                        label="TÃ©lÃ©phone"
                        placeholder="06 00 00 00 00"
                        value={step2Form.stagiaire_telephone}
                        onChange={(value) =>
                          updateStep2Form("stagiaire_telephone", value)
                        }
                      />

                      <Field
                        label="NÂ° SIRET"
                        placeholder="123 456 789 00012"
                        value={step2Form.client_siret}
                        onChange={(value) =>
                          updateStep2Form("client_siret", value)
                        }
                      />

                      <Field
                        label="Date souhaitÃ©e de la formation"
                        placeholder="SÃ©lectionnez une date"
                        type="date"
                        value={step2Form.date_formation_prevue}
                        onChange={(value) =>
                          setStep2Form((current) => ({
                            ...current,
                            date_formation_prevue: value,
                          }))
                        }
                      />

                      <Field
                        label="Lieu ou lien de la formation"
                        placeholder="Adresse prÃ©cise ou lien Zoom / Meet / Teams"
                        full
                        value={step2Form.lieu_formation}
                        onChange={(value) =>
                          updateStep2Form("lieu_formation", value)
                        }
                      />
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
                          : "Enregistrer les coordonnÃ©es du client â†’"}
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
  docKey: DocKey;
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
          margin: "0 12px 0",
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
              âœ“ {state.file.name}
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
              DÃ©poser un fichier ici
            </p>
            <p
              style={{
                fontSize: 11,
                color: "#9c8878",
                margin: 0,
                fontFamily: "sans-serif",
              }}
            >
              ou cliquer pour sÃ©lectionner Â· PDF, DOCX
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
// Composants UI partagÃ©s
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
        <option value="">SÃ©lectionner</option>
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
// Styles partagÃ©s
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
};
