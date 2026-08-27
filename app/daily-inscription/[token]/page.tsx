"use client";

import { use, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import ApplicationSignature from "@/components/daily/ApplicationSignature";
import ProgramDetails from "@/components/daily/ProgramDetails";

type RegistrationMode = "beneficiary" | "company";
type Participant = { first_name: string; last_name: string; email: string };
type PositioningQuestion = {
  id: string;
  label: string;
  help_text?: string;
  required?: boolean;
  type: "single_choice" | "multiple_choice" | "free_text" | "scale_1_5";
  options?: string[];
  order?: number;
};
type PublicSession = {
  daily_formations?: {
    title?: string | null;
    positioning_mode?: string | null;
    positioning_questions?: PositioningQuestion[] | null;
  } | null;
};

const fundingOptions = ["personnel", "entreprise", "opco", "cpf", "autre"] as const;
const modalities = ["presentiel", "distanciel", "mixte"] as const;

function initialMode() {
  if (typeof window === "undefined") return "beneficiary";
  return new URLSearchParams(window.location.search).get("type") === "company"
    ? "company"
    : "beneficiary";
}

export default function DailyRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [session, setSession] = useState<PublicSession | null>(null);
  const [mode, setMode] = useState<RegistrationMode>(initialMode);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<Participant[]>([
    { first_name: "", last_name: "", email: "" },
  ]);
  const [signatureConsentText, setSignatureConsentText] = useState("");
  const [signatureConsent, setSignatureConsent] = useState(false);
  const [signatureData, setSignatureData] = useState("");

  const positioningQuestions = useMemo(() => {
    const questions = session?.daily_formations?.positioning_questions;
    return Array.isArray(questions)
      ? [...questions].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      : [];
  }, [session]);

  const hasSelenPositioning =
    mode === "beneficiary" &&
    session?.daily_formations?.positioning_mode === "selen" &&
    positioningQuestions.length > 0;
  const totalSteps = mode === "company" ? 6 : hasSelenPositioning ? 7 : 6;

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/daily-registration/${token}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      setLoading(false);
      if (!res.ok) {
        setError(data?.error ?? "Lien d'inscription indisponible.");
        return;
      }
      setSession(data.session);
      setSignatureConsentText(data.signatureConsentText ?? "");
      try {
        const draft = window.localStorage.getItem(`selen-daily-registration-${token}`);
        if (!draft) return;
        const parsed = JSON.parse(draft) as {
          mode?: RegistrationMode;
          step?: number;
          form?: Record<string, string>;
          participants?: Participant[];
        };
        setMode(parsed.mode ?? initialMode());
        setStep(parsed.step ?? 0);
        setForm(parsed.form ?? {});
        setParticipants(parsed.participants ?? [{ first_name: "", last_name: "", email: "" }]);
        setAutosaveStatus("saved");
      } catch {
        setAutosaveStatus("error");
      }
    }
    void load();
  }, [token]);

  useEffect(() => {
    if (!token || saved) return;
    window.queueMicrotask(() => setAutosaveStatus("saving"));
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          `selen-daily-registration-${token}`,
          JSON.stringify({ mode, step, form, participants }),
        );
        setAutosaveStatus("saved");
      } catch {
        setAutosaveStatus("error");
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [token, mode, step, form, participants, saved]);

  const progress = useMemo(() => Math.round(((step + 1) / totalSteps) * 100), [step, totalSteps]);

  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateParticipant(index: number, patch: Partial<Participant>) {
    setParticipants((current) =>
      current.map((participant, itemIndex) =>
        itemIndex === index ? { ...participant, ...patch } : participant,
      ),
    );
  }

  function buildNeedAnswers() {
    if (mode === "company") {
      return {
        company_name: form.company_name,
        company_siret: form.company_siret,
        company_address: form.company_address,
        admin_contact_name: form.admin_contact_name,
        admin_contact_role: form.admin_contact_role,
        admin_contact_email: form.admin_contact_email,
        admin_contact_phone: form.admin_contact_phone,
        training_contact_name: form.training_contact_name,
        training_contact_role: form.training_contact_role,
        training_contact_email: form.training_contact_email,
        training_contact_phone: form.training_contact_phone,
        funding: form.funding,
        funding_other: form.funding_other,
        expressed_need: form.expressed_need,
        employee_objectives: form.employee_objectives,
        request_context: form.request_context,
        constraints: form.constraints,
        preferred_modality: form.preferred_modality,
        details: form.details,
        specific_requests: form.specific_requests,
        adaptation_needed_answer: form.company_adaptation_needed,
        company_adaptation_details: form.company_adaptation_details,
      };
    }

    return {
      birth_date: form.birth_date,
      phone: form.phone,
      postal_address: form.postal_address,
      professional_situation: form.professional_situation,
      highest_diploma: form.highest_diploma,
      current_knowledge_level: form.current_knowledge_level,
      funding: form.funding,
      funding_other: form.funding_other,
      expectations: form.expectations,
      expressed_need: form.expressed_need,
      objective: form.objective,
      motivations: form.motivations,
      constraints: form.constraints,
      availability: form.availability,
      preferred_modality: form.preferred_modality,
      details: form.details,
      adaptation_needed_answer: form.adaptation_needed,
      adaptation_details: form.adaptation_details,
    };
  }

  function buildPositioningAnswers() {
    if (!hasSelenPositioning) return {};
    return {
      mode: "selen",
      questions: positioningQuestions.map((question) => ({
        id: question.id,
        label: question.label,
        type: question.type,
        required: Boolean(question.required),
        answer: question.type === "multiple_choice"
          ? String(form[`positioning_${question.id}`] ?? "").split("|||").filter(Boolean)
          : form[`positioning_${question.id}`] ?? "",
      })),
    };
  }

  function validatePositioning() {
    if (!hasSelenPositioning) return true;
    const missing = positioningQuestions.some((question) => {
      if (!question.required) return false;
      return !String(form[`positioning_${question.id}`] ?? "").trim();
    });
    if (missing) {
      setError("Quelques questions de positionnement restent à compléter. Prenez le temps de les renseigner, puis envoyez vos réponses.");
      return false;
    }
    return true;
  }

  function validateContactDetails() {
    if (mode === "beneficiary" && !String(form.phone ?? "").trim()) {
      setError("Merci d'ajouter un téléphone. Il permettra à Selen ou à l'organisme de formation de vous recontacter facilement si une précision est nécessaire.");
      return false;
    }
    return true;
  }

  function validateSignature() {
    if (!signatureConsent) {
      setError("Merci de confirmer l'exactitude des informations du dossier avant de l'envoyer.");
      return false;
    }
    if (!signatureData.startsWith("data:image/png;base64,")) {
      setError("Merci de signer le dossier dans l'encadré prévu avant de l'envoyer.");
      return false;
    }
    return true;
  }

  async function submit() {
    if (!validateContactDetails()) return;
    if (!validatePositioning()) return;
    if (!validateSignature()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/daily-registration/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: mode,
        respondent_first_name: mode === "beneficiary" ? form.first_name : form.admin_contact_name,
        respondent_last_name: mode === "beneficiary" ? form.last_name : "",
        respondent_email: mode === "beneficiary" ? form.email : form.admin_contact_email,
        company_name: form.company_name,
        participants: participants.filter((participant) => participant.first_name || participant.last_name || participant.email),
        need_answers: buildNeedAnswers(),
        positioning_answers: buildPositioningAnswers(),
        signature_consent: signatureConsent,
        signature_data: signatureData,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Vos réponses n'ont pas pu être transmises. Vous pouvez réessayer dans un instant.");
      return;
    }
    window.localStorage.removeItem(`selen-daily-registration-${token}`);
    setSaved(true);
  }

  if (loading) return <main className="gazette-paper" style={s.page}>Ouverture de votre dossier d&apos;inscription...</main>;
  if (error && !session) return <main className="gazette-paper" style={s.page}>{error}</main>;

  if (saved) {
    return (
      <main className="gazette-paper min-h-screen">
        <Header />
        <section style={s.page}>
          <article style={s.card}>
            <p className="gazette-label">Selen Daily</p>
            <h1 style={s.title}>Merci, votre dossier signé est bien transmis</h1>
            <p style={s.muted}>Selen va le relire avec l&apos;organisme de formation pour préparer votre entrée en formation dans de bonnes conditions.</p>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="gazette-paper min-h-screen">
      <Header />
      <section style={s.page}>
        <article style={s.hero}>
          <p className="gazette-label">Selen Daily</p>
          <h1 style={s.title}>Préparons votre formation</h1>
          <p style={s.muted}>{session?.daily_formations?.title ?? "Formation Selen Daily"}</p>
          <div style={s.progressOuter}><div style={{ ...s.progressInner, width: `${progress}%` }} /></div>
          <p style={s.autosave}>
            {autosaveStatus === "saving"
              ? "Enregistrement..."
              : autosaveStatus === "saved"
                ? "Enregistré"
                : autosaveStatus === "error"
                  ? "Le brouillon n'a pas pu être enregistré"
                  : ""}
          </p>
        </article>

        <ProgramDetails token={token} />

        {error ? <p style={s.error}>{error}</p> : null}

        <article style={s.card}>
          {step === 0 ? (
            <Welcome mode={mode} setMode={setMode} />
          ) : mode === "beneficiary" ? (
            <BeneficiaryStep
              step={step}
              form={form}
              update={update}
              hasSelenPositioning={hasSelenPositioning}
              positioningQuestions={positioningQuestions}
            />
          ) : (
            <CompanyStep
              step={step}
              form={form}
              update={update}
              participants={participants}
              setParticipants={setParticipants}
              updateParticipant={updateParticipant}
            />
          )}

          {step === totalSteps - 1 ? (
            <ApplicationSignature
              consentText={signatureConsentText}
              consent={signatureConsent}
              onConsentChange={setSignatureConsent}
              onSignatureChange={setSignatureData}
            />
          ) : null}

          <div style={s.actions}>
            {step > 0 ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  if (step === totalSteps - 1) {
                    setSignatureConsent(false);
                    setSignatureData("");
                  }
                  setStep(step - 1);
                }}
              >
                <span>Retour</span>
              </button>
            ) : null}
            {step < totalSteps - 1 ? (
              <button type="button" className="btn-ink" onClick={() => setStep(step + 1)}><span>Continuer</span></button>
            ) : (
              <button type="button" className="btn-ink" disabled={saving} onClick={() => void submit()}>
                <span>{saving ? "Transmission..." : "Signer et envoyer mon dossier"}</span>
              </button>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function Welcome({ mode, setMode }: { mode: RegistrationMode; setMode: (mode: RegistrationMode) => void }) {
  return (
    <div style={s.stack}>
      <h2 style={s.sectionTitle}>Nous allons vous poser quelques questions</h2>
      <p style={s.muted}>
        Nous allons vous poser quelques questions pour préparer votre formation dans les meilleures conditions.
        Il n&apos;y a pas de bonne ou de mauvaise réponse.
      </p>
      <div style={s.toggle}>
        <button type="button" className={mode === "beneficiary" ? "btn-ink" : "btn-ghost"} onClick={() => setMode("beneficiary")}>
          <span>Je suis apprenant</span>
        </button>
        <button type="button" className={mode === "company" ? "btn-ink" : "btn-ghost"} onClick={() => setMode("company")}>
          <span>Je représente une entreprise</span>
        </button>
      </div>
    </div>
  );
}

function BeneficiaryStep({
  step,
  form,
  update,
  hasSelenPositioning,
  positioningQuestions,
}: {
  step: number;
  form: Record<string, string>;
  update: (key: string, value: string) => void;
  hasSelenPositioning: boolean;
  positioningQuestions: PositioningQuestion[];
}) {
  if (step === 1) {
    return (
      <div style={s.stack}>
        <h2 style={s.sectionTitle}>Vos coordonnées et votre situation</h2>
        <div style={s.grid}>
          <Input label="Prénom" value={form.first_name} onChange={(value) => update("first_name", value)} />
          <Input label="Nom" value={form.last_name} onChange={(value) => update("last_name", value)} />
          <Input label="Date de naissance" type="date" value={form.birth_date} onChange={(value) => update("birth_date", value)} />
          <Input label="Téléphone fortement recommandé" value={form.phone} onChange={(value) => update("phone", value)} required />
          <Input label="Email" type="email" value={form.email} onChange={(value) => update("email", value)} />
          <Input label="Situation professionnelle actuelle" value={form.professional_situation} onChange={(value) => update("professional_situation", value)} />
          <Input label="Plus haut diplôme obtenu" value={form.highest_diploma} onChange={(value) => update("highest_diploma", value)} />
        </div>
        <Textarea label="Adresse postale" value={form.postal_address} onChange={(value) => update("postal_address", value)} />
      </div>
    );
  }
  if (step === 2) return <FundingFields form={form} update={update} allowed={fundingOptions} />;
  if (step === 3) {
    return (
      <div style={s.stack}>
        <h2 style={s.sectionTitle}>Votre besoin</h2>
        <Textarea label="Vos attentes" value={form.expectations} onChange={(value) => update("expectations", value)} />
        <Textarea label="Le besoin que vous exprimez" value={form.expressed_need} onChange={(value) => update("expressed_need", value)} />
        <Textarea label="Votre objectif professionnel ou personnel" value={form.objective} onChange={(value) => update("objective", value)} />
        <Textarea label="Vos motivations" value={form.motivations} onChange={(value) => update("motivations", value)} />
        <Textarea label="Votre niveau de connaissance actuel dans le domaine de la formation" value={form.current_knowledge_level} onChange={(value) => update("current_knowledge_level", value)} />
      </div>
    );
  }
  if (step === 4) {
    return (
      <div style={s.stack}>
        <h2 style={s.sectionTitle}>Organisation</h2>
        <Textarea label="Contraintes : temps, organisation, matériel, transport, disponibilités..." value={form.constraints} onChange={(value) => update("constraints", value)} />
        <Textarea label="Disponibilités" value={form.availability} onChange={(value) => update("availability", value)} />
        <Select label="Modalité souhaitée" value={form.preferred_modality} onChange={(value) => update("preferred_modality", value)} options={modalities} />
        <Textarea label="Précisions utiles" value={form.details} onChange={(value) => update("details", value)} />
      </div>
    );
  }
  if (step === 6) {
    return (
      <div style={s.stack}>
        <h2 style={s.sectionTitle}>Positionnement</h2>
        <p style={s.notice}>Ces questions aident à préparer votre entrée en formation. Répondez simplement avec les éléments dont vous disposez.</p>
        {positioningQuestions.map((question) => (
          <PositioningQuestionField
            key={question.id}
            question={question}
            value={form[`positioning_${question.id}`] ?? ""}
            onChange={(value) => update(`positioning_${question.id}`, value)}
          />
        ))}
      </div>
    );
  }
  return (
    <div style={s.stack}>
      <h2 style={s.sectionTitle}>Adaptation et positionnement</h2>
      <Select label="Avez-vous besoin d'un aménagement particulier pour suivre cette formation dans de bonnes conditions ?" value={form.adaptation_needed} onChange={(value) => update("adaptation_needed", value)} options={["non", "oui"]} />
      {form.adaptation_needed === "oui" ? (
        <Textarea label="Pouvez-vous nous expliquer ce qui vous aiderait ?" value={form.adaptation_details} onChange={(value) => update("adaptation_details", value)} />
      ) : null}
      {!hasSelenPositioning ? (
        <p style={s.notice}>Le positionnement sera complété selon les modalités prévues par l&apos;organisme.</p>
      ) : null}
    </div>
  );
}

function CompanyStep({
  step,
  form,
  update,
  participants,
  setParticipants,
  updateParticipant,
}: {
  step: number;
  form: Record<string, string>;
  update: (key: string, value: string) => void;
  participants: Participant[];
  setParticipants: (participants: Participant[]) => void;
  updateParticipant: (index: number, patch: Partial<Participant>) => void;
}) {
  if (step === 1) {
    return (
      <div style={s.stack}>
        <h2 style={s.sectionTitle}>Entreprise</h2>
        <Input label="Nom de l'entreprise" value={form.company_name} onChange={(value) => update("company_name", value)} />
        <Input label="SIRET" value={form.company_siret} onChange={(value) => update("company_siret", value)} />
        <Textarea label="Adresse" value={form.company_address} onChange={(value) => update("company_address", value)} />
      </div>
    );
  }
  if (step === 2) {
    return (
      <div style={s.stack}>
        <h2 style={s.sectionTitle}>Contacts</h2>
        <div style={s.grid}>
          <Input label="Contact administratif - nom" value={form.admin_contact_name} onChange={(value) => update("admin_contact_name", value)} />
          <Input label="Fonction" value={form.admin_contact_role} onChange={(value) => update("admin_contact_role", value)} />
          <Input label="Email" type="email" value={form.admin_contact_email} onChange={(value) => update("admin_contact_email", value)} />
          <Input label="Téléphone" value={form.admin_contact_phone} onChange={(value) => update("admin_contact_phone", value)} />
          <Input label="Contact formation - nom" value={form.training_contact_name} onChange={(value) => update("training_contact_name", value)} />
          <Input label="Fonction" value={form.training_contact_role} onChange={(value) => update("training_contact_role", value)} />
          <Input label="Email" type="email" value={form.training_contact_email} onChange={(value) => update("training_contact_email", value)} />
          <Input label="Téléphone" value={form.training_contact_phone} onChange={(value) => update("training_contact_phone", value)} />
        </div>
      </div>
    );
  }
  if (step === 3) return <FundingFields form={form} update={update} allowed={["entreprise", "opco", "cpf", "autre"]} />;
  if (step === 4) {
    return (
      <div style={s.stack}>
        <h2 style={s.sectionTitle}>Besoin entreprise</h2>
        <Textarea label="Besoin exprimé par l'entreprise" value={form.expressed_need} onChange={(value) => update("expressed_need", value)} />
        <Textarea label="Objectifs attendus pour les salariés" value={form.employee_objectives} onChange={(value) => update("employee_objectives", value)} />
        <Textarea label="Contexte de la demande" value={form.request_context} onChange={(value) => update("request_context", value)} />
        <Textarea label="Contraintes organisationnelles" value={form.constraints} onChange={(value) => update("constraints", value)} />
        <Select label="Modalités souhaitées" value={form.preferred_modality} onChange={(value) => update("preferred_modality", value)} options={modalities} />
        <Textarea label="Précisions" value={form.details} onChange={(value) => update("details", value)} />
        <Textarea label="Demandes ou points d'attention particuliers" value={form.specific_requests} onChange={(value) => update("specific_requests", value)} />
      </div>
    );
  }
  if (step === 5) {
    return (
      <div style={s.stack}>
        <h2 style={s.sectionTitle}>Participants</h2>
        <ParticipantRows rows={participants} setRows={setParticipants} updateParticipant={updateParticipant} />
      </div>
    );
  }
  return (
    <div style={s.stack}>
      <h2 style={s.sectionTitle}>Adaptation connue</h2>
      <Select label="Un besoin d'aménagement est-il connu pour un ou plusieurs salariés ?" value={form.company_adaptation_needed} onChange={(value) => update("company_adaptation_needed", value)} options={["non", "oui"]} />
      {form.company_adaptation_needed === "oui" ? (
        <Textarea label="Précision sur l'aménagement connu" value={form.company_adaptation_details} onChange={(value) => update("company_adaptation_details", value)} />
      ) : null}
      <p style={s.notice}>Chaque participant salarié pourra ensuite avoir son propre positionnement individuel.</p>
    </div>
  );
}

function PositioningQuestionField({
  question,
  value,
  onChange,
}: {
  question: PositioningQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = Array.isArray(question.options) ? question.options : [];
  const selectedValues = value ? value.split("|||") : [];

  function toggleOption(option: string) {
    const next = selectedValues.includes(option)
      ? selectedValues.filter((item) => item !== option)
      : [...selectedValues, option];
    onChange(next.join("|||"));
  }

  return (
    <fieldset style={s.questionBox}>
      <legend style={s.questionLegend}>
        {question.label}
        {question.required ? " *" : ""}
      </legend>
      {question.help_text ? <p style={s.muted}>{question.help_text}</p> : null}
      {question.type === "free_text" ? (
        <textarea style={{ ...s.input, minHeight: 96 }} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : null}
      {question.type === "scale_1_5" ? (
        <div style={s.choiceGrid}>
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              type="button"
              className={value === String(score) ? "btn-ink" : "btn-ghost"}
              onClick={() => onChange(String(score))}
            >
              <span>{score}</span>
            </button>
          ))}
        </div>
      ) : null}
      {question.type === "single_choice" ? (
        <div style={s.choiceGrid}>
          {options.map((option) => (
            <label key={option} style={s.choice}>
              <input type="radio" checked={value === option} onChange={() => onChange(option)} />
              {option}
            </label>
          ))}
        </div>
      ) : null}
      {question.type === "multiple_choice" ? (
        <div style={s.choiceGrid}>
          {options.map((option) => (
            <label key={option} style={s.choice}>
              <input type="checkbox" checked={selectedValues.includes(option)} onChange={() => toggleOption(option)} />
              {option}
            </label>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

function FundingFields({ form, update, allowed }: { form: Record<string, string>; update: (key: string, value: string) => void; allowed: readonly string[] }) {
  return (
    <div style={s.stack}>
      <h2 style={s.sectionTitle}>Financement</h2>
      <Select label="Mode de financement envisagé" value={form.funding} onChange={(value) => update("funding", value)} options={allowed} />
      {form.funding === "autre" ? (
        <Input label="Précisez le financement" value={form.funding_other} onChange={(value) => update("funding_other", value)} />
      ) : null}
    </div>
  );
}

function ParticipantRows({ rows, setRows, updateParticipant }: { rows: Participant[]; setRows: (rows: Participant[]) => void; updateParticipant: (index: number, patch: Partial<Participant>) => void }) {
  return (
    <div style={s.subcard}>
      <strong>Liste des participants à vérifier ou compléter</strong>
      {rows.map((row, index) => (
        <div key={index} style={s.grid}>
          <Input label="Prénom" value={row.first_name} onChange={(value) => updateParticipant(index, { first_name: value })} />
          <Input label="Nom" value={row.last_name} onChange={(value) => updateParticipant(index, { last_name: value })} />
          <Input label="Email" type="email" value={row.email} onChange={(value) => updateParticipant(index, { email: value })} />
        </div>
      ))}
      <button type="button" className="btn-ghost" onClick={() => setRows([...rows, { first_name: "", last_name: "", email: "" }])}>
        <span>Ajouter un participant</span>
      </button>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false }: { label: string; value?: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label style={s.field}>
      <span>{label}</span>
      <input style={s.input} type={type} value={value ?? ""} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Textarea({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <label style={s.field}>
      <span>{label}</span>
      <textarea style={{ ...s.input, minHeight: 96 }} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value?: string; onChange: (value: string) => void; options: readonly string[] }) {
  return (
    <label style={s.field}>
      <span>{label}</span>
      <select style={s.input} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Sélectionner</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 940, margin: "0 auto", padding: "2rem 1.5rem 4rem", display: "grid", gap: "1rem" },
  hero: { background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", padding: "1.2rem", display: "grid", gap: "0.7rem" },
  card: { background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", padding: "1.2rem", display: "grid", gap: "1rem" },
  title: { color: "var(--ink)", margin: 0 },
  sectionTitle: { color: "var(--ink)", margin: 0 },
  muted: { color: "var(--ink-soft)", lineHeight: 1.6 },
  notice: { border: "1px solid rgba(106,138,74,0.45)", background: "rgba(106,138,74,0.08)", color: "#496532", padding: "0.75rem", lineHeight: 1.5 },
  error: { border: "1px solid var(--rust)", background: "rgba(138,75,36,0.08)", color: "var(--rust)", padding: "0.75rem" },
  autosave: { color: "var(--ink-soft)", minHeight: 22, margin: 0 },
  progressOuter: { height: 8, border: "1px solid rgba(178,138,98,0.45)", background: "rgba(255,250,239,0.7)" },
  progressInner: { height: "100%", background: "var(--ocre-gold)", transition: "width 180ms ease" },
  stack: { display: "grid", gap: "0.9rem" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.7rem" },
  field: { display: "grid", gap: "0.35rem", color: "var(--ink)", fontWeight: 700 },
  input: { width: "100%", border: "1px solid rgba(178,138,98,0.55)", background: "rgba(255,250,239,0.82)", color: "var(--ink)", padding: "0.7rem", fontSize: "0.95rem", boxSizing: "border-box" },
  actions: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.7rem" },
  toggle: { display: "flex", flexWrap: "wrap", gap: "0.6rem" },
  subcard: { display: "grid", gap: "0.7rem", border: "1px solid rgba(178,138,98,0.28)", padding: "0.8rem" },
  questionBox: { display: "grid", gap: "0.65rem", border: "1px solid rgba(178,138,98,0.35)", padding: "0.85rem" },
  questionLegend: { color: "var(--ink)", fontWeight: 800, padding: "0 0.3rem" },
  choiceGrid: { display: "flex", flexWrap: "wrap", gap: "0.55rem" },
  choice: { display: "inline-flex", gap: "0.4rem", alignItems: "center", border: "1px solid rgba(178,138,98,0.35)", padding: "0.55rem 0.7rem", color: "var(--ink)" },
};