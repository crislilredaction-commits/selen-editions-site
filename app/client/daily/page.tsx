"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ClientSupportBar from "@/components/ClientSupportBar";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

type DailyStatus = "draft" | "review" | "validated" | "correction_requested" | "archived";
type Formation = {
  id: string;
  title: string;
  status: DailyStatus;
  version?: number | null;
  duration_hours?: number | string | null;
  duration_days?: number | string | null;
  modality?: string | null;
  result_beneficiary_count?: number | string | null;
  result_satisfaction_rate?: number | string | null;
  result_success_rate?: number | string | null;
  contact_email?: string | null;
  positioning_mode?: string | null;
  positioning_questions?: PositioningQuestion[] | null;
  [key: string]: string | number | boolean | PositioningQuestion[] | null | undefined;
};
type DailySession = {
  id: string;
  formation_id: string;
  modality: string;
  status: string;
  schedule_blocks?: ScheduleBlock[] | null;
  companies?: Company[] | null;
  beneficiaries?: Participant[] | null;
  individual_beneficiaries?: Participant[] | null;
  registration_token?: string | null;
  registration_status?: string | null;
  registration_summary?: Record<string, unknown> | null;
  adaptation_needed?: boolean | null;
  daily_registration_recipients?: RegistrationRecipient[] | null;
  daily_conventions?: DailyConvention[] | null;
  daily_convocations?: DailyConvocation[] | null;
  daily_portal_access_tokens?: DailyPortalAccess[] | null;
  daily_formations?: Pick<Formation, "id" | "title" | "status" | "version"> | null;
  [key: string]: string | number | boolean | ScheduleBlock[] | Company[] | Participant[] | RegistrationRecipient[] | DailyConvention[] | DailyConvocation[] | DailyPortalAccess[] | Pick<Formation, "id" | "title" | "status" | "version"> | Record<string, unknown> | null | undefined;
};
type ScheduleBlock = { date: string; start: string; end: string; note: string };
type Participant = { first_name: string; last_name: string; email: string };
type Company = { name: string; address: string; siret: string; email: string; participants: Participant[] };
type RegistrationRecipient = {
  id: string;
  recipient_type: string;
  recipient_name: string | null;
  recipient_email: string | null;
  status: string;
  sent_at: string | null;
  last_error: string | null;
};
type DailyConvention = {
  id: string;
  recipient_type: string;
  recipient_key: string;
  recipient_name: string | null;
  company_name: string | null;
  version: number;
  document_name: string | null;
  status: string | null;
  generated_at: string | null;
  daily_convention_signatures?: DailyConventionSignature[] | null;
};
type DailyConventionSignature = {
  id: string;
  signatory_type: string;
  signatory_name: string | null;
  status: string | null;
  signed_at: string | null;
};
type DailyPortalAccess = {
  id: string;
  portal_type: "learner" | "enterprise" | "trainer";
  entity_name: string | null;
  entity_email: string | null;
  token: string;
  status: string | null;
  viewed_at: string | null;
};
type DailyConvocation = {
  id: string;
  recipient_type: string;
  recipient_key: string;
  recipient_name: string | null;
  company_name: string | null;
  version: number;
  document_name: string | null;
  status: string | null;
  sent_at: string | null;
  generated_at: string | null;
};
type PositioningQuestion = {
  id: string;
  label: string;
  help_text: string;
  required: boolean;
  type: "single_choice" | "multiple_choice" | "free_text" | "scale_1_5";
  options: string[];
  order: number;
};
type DailyTrainer = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
};
type FormValue = string | number | boolean | null | undefined;
type FormState = Record<string, FormValue | PositioningQuestion[]>;
type SaveStatus = "idle" | "saving" | "saved" | "error";

const emptyFormation = {
  title: "",
  global_objective: "",
  target_audience: "",
  prerequisites: "",
  duration_hours: "",
  duration_days: "",
  modality: "presentiel",
  modality_details: "",
  access_delays: "",
  registration_methods: "",
  price: "",
  detailed_program: "",
  accessibility: "",
  disability_referent: "",
  pedagogical_resources: "",
  evaluation_methods: "",
  results_pending: true,
  result_beneficiary_count: "",
  result_satisfaction_rate: "",
  result_success_rate: "",
  contact_phone: "",
  contact_email: "",
  contact_website: "",
  updated_visible_at: new Date().toISOString().slice(0, 10),
  positioning_mode: "off_platform",
  positioning_questions: [] as PositioningQuestion[],
  status: "draft",
};

const emptySession = {
  formation_id: "",
  modality: "presentiel",
  distance_mode: "synchrone",
  blended_elearning_periods: "",
  blended_in_person_days: "",
  location_address: "",
  remote_url: "",
  status: "ready",
};

function formatStatus(status?: string) {
  if (status === "draft") return "Brouillon";
  if (status === "review") return "En validation Selen";
  if (status === "validated") return "Validée";
  if (status === "correction_requested") return "À corriger";
  if (status === "archived") return "Archivée";
  if (status === "ready") return "Prête";
  return "À suivre";
}

function formatRegistrationStatus(status?: string | null) {
  if (status === "to_prepare") return "À préparer";
  if (status === "to_review") return "À vérifier";
  if (status === "ready_to_send") return "Prêt à envoyer";
  if (status === "sent") return "Envoyé";
  if (status === "responses_received") return "Réponses reçues";
  if (status === "summary_to_review") return "Synthèse à relire";
  if (status === "summary_validated") return "Synthèse validée";
  return "À préparer";
}

function formatRecipientStatus(status?: string | null) {
  if (status === "sent") return "envoyé";
  if (status === "error") return "erreur";
  if (status === "skipped") return "non envoyé";
  return "en attente";
}

function formatConventionSignatureStatus(convention: DailyConvention) {
  const signatures = convention.daily_convention_signatures ?? [];
  if (signatures.length === 0) return "Signature a preparer";
  if (signatures.every((signature) => signature.status === "signed")) return "Signee";
  if (signatures.some((signature) => signature.status === "signed")) return "Signature partielle";
  return "A signer";
}

function portalUrl(type: DailyPortalAccess["portal_type"], token: string) {
  const role = type === "learner" ? "apprenant" : type === "enterprise" ? "entreprise" : "formateur";
  if (typeof window === "undefined") return `/daily/portail/${role}/${token}`;
  return `${window.location.origin}/daily/portail/${role}/${token}`;
}

function sessionTimeline(session: DailySession) {
  const recipients = session.daily_registration_recipients ?? [];
  const conventions = session.daily_conventions ?? [];
  const signatures = conventions.flatMap((convention) => convention.daily_convention_signatures ?? []);
  const hasSent = recipients.some((recipient) => recipient.status === "sent");
  const allSentCompleted = recipients.length > 0 && recipients.every((recipient) => recipient.status === "sent");
  const allSigned = signatures.length > 0 && signatures.every((signature) => signature.status === "signed");
  const convocations = session.daily_convocations ?? [];
  const sentConvocations = convocations.filter((convocation) => convocation.status === "sent");
  return [
    ["Dossiers envoyes", hasSent ? "termine" : "en attente"],
    ["Dossiers completes", allSentCompleted ? "termine" : hasSent ? "a suivre" : "a venir"],
    ["Conventions", conventions.length > 0 ? "termine" : "en attente"],
    ["Signatures", allSigned ? "termine" : signatures.length > 0 ? "a faire" : "a venir"],
    ["Convocations generees", convocations.length > 0 ? "termine" : "en attente"],
    ["Convocations envoyees", sentConvocations.length > 0 ? "termine" : convocations.length > 0 ? "a faire" : "a venir"],
    ["Formation", "a venir"],
  ];
}

function help(text: string) {
  return (
    <span
      title={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: "1px solid var(--sepia-mid)",
        color: "var(--rust)",
        fontSize: 12,
        fontWeight: 800,
        marginLeft: 6,
      }}
    >
      ?
    </span>
  );
}

function fieldLabel(label: string, helpText?: string) {
  return (
    <label style={s.label}>
      {label}
      {helpText ? help(helpText) : null}
    </label>
  );
}

export default function ClientDailyPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formationAutosaveStatus, setFormationAutosaveStatus] = useState<SaveStatus>("idle");
  const [email, setEmail] = useState<string | null>(null);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [sessions, setSessions] = useState<DailySession[]>([]);
  const [dailyTrainers, setDailyTrainers] = useState<DailyTrainer[]>([]);
  const [formationForm, setFormationForm] = useState<FormState>(emptyFormation);
  const [editingFormationId, setEditingFormationId] = useState("");
  const [sessionForm, setSessionForm] = useState<FormState>(emptySession);
  const [editingSessionId, setEditingSessionId] = useState("");
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([
    { date: "", start: "", end: "", note: "" },
  ]);
  const [companies, setCompanies] = useState<Company[]>([
    { name: "", address: "", siret: "", email: "", participants: [{ first_name: "", last_name: "", email: "" }] },
  ]);
  const [beneficiaries, setBeneficiaries] = useState<Participant[]>([
    { first_name: "", last_name: "", email: "" },
  ]);
  const [individualBeneficiaries, setIndividualBeneficiaries] = useState<Participant[]>([
    { first_name: "", last_name: "", email: "" },
  ]);
  const [selectedTrainerIds, setSelectedTrainerIds] = useState<string[]>([]);

  const activeFormations = formations.filter((formation) => formation.status !== "archived");

  const loadDaily = useCallback(async () => {
    const [formationRes, sessionRes] = await Promise.all([
      fetch("/api/client/daily/formations", { cache: "no-store" }),
      fetch("/api/client/daily/sessions", { cache: "no-store" }),
    ]);
    const formationData = await formationRes.json().catch(() => null);
    const sessionData = await sessionRes.json().catch(() => null);
    if (!formationRes.ok) throw new Error(formationData?.error ?? "Chargement formations impossible.");
    if (!sessionRes.ok) throw new Error(sessionData?.error ?? "Chargement sessions impossible.");
    setFormations((formationData.formations ?? []) as Formation[]);
    setSessions((sessionData.sessions ?? []) as DailySession[]);
  }, []);

  useEffect(() => {
    async function boot() {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) {
        router.replace("/client/login");
        return;
      }
      const userEmail = data.user.email ?? null;
      setEmail(userEmail);
      try {
        const draft = window.localStorage.getItem("selen-daily-formation-draft");
        if (draft) {
          setFormationForm({ ...emptyFormation, ...JSON.parse(draft), contact_email: userEmail ?? "" });
          setFormationAutosaveStatus("saved");
        } else {
          setFormationForm((current) => ({
            ...current,
            contact_email: userEmail ?? "",
          }));
        }
      } catch {
        setFormationAutosaveStatus("error");
        setFormationForm((current) => ({
          ...current,
          contact_email: userEmail ?? "",
        }));
      }
      const onboardingRes = await fetch("/api/client/daily/onboarding", {
        cache: "no-store",
      });
      const onboardingData = await onboardingRes.json().catch(() => null);
      if (
        onboardingRes.ok &&
        onboardingData?.onboarding?.status !== "completed"
      ) {
        router.replace("/client/daily/onboarding");
        return;
      }
      setDailyTrainers((onboardingData?.trainers ?? []) as DailyTrainer[]);
      await loadDaily();
      setLoading(false);
    }
    void boot();
  }, [loadDaily, router, supabase]);

  useEffect(() => {
    if (loading) return;
    window.queueMicrotask(() => setFormationAutosaveStatus("saving"));
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem("selen-daily-formation-draft", JSON.stringify(formationForm));
        setFormationAutosaveStatus("saved");
      } catch {
        setFormationAutosaveStatus("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [formationForm, loading]);

  function updateFormation(key: string, value: FormValue) {
    setFormationForm((current) => ({ ...current, [key]: value }));
  }

  function updatePositioningQuestions(questions: PositioningQuestion[]) {
    setFormationForm((current) => ({ ...current, positioning_questions: questions }));
  }

  function updateSession(key: string, value: FormValue) {
    setSessionForm((current) => ({ ...current, [key]: value }));
  }

  async function submitFormation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/client/daily/formations", {
      method: editingFormationId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...formationForm,
        id: editingFormationId || undefined,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Sauvegarde impossible.");
      return;
    }
    setMessage(data?.versioned ? "Nouvelle version créée et envoyée en validation Selen." : "Formation enregistrée.");
    window.localStorage.removeItem("selen-daily-formation-draft");
    setFormationAutosaveStatus("idle");
    setFormationForm({ ...emptyFormation, contact_email: email ?? "" });
    setEditingFormationId("");
    await loadDaily();
  }

  async function archiveFormation(id: string) {
    if (!window.confirm("Archiver ou supprimer cette formation selon les sessions associées ?")) return;
    const res = await fetch("/api/client/daily/formations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Action impossible.");
      return;
    }
    setMessage(data?.archived ? "Formation archivée car une session y est associée." : "Formation supprimée.");
    await loadDaily();
  }

  function editFormation(formation: Formation) {
    setEditingFormationId(formation.id);
    setFormationForm({
      ...emptyFormation,
      ...formation,
      result_beneficiary_count: formation.result_beneficiary_count ?? "",
      result_satisfaction_rate: formation.result_satisfaction_rate ?? "",
      result_success_rate: formation.result_success_rate ?? "",
      contact_email: formation.contact_email ?? email ?? "",
      positioning_mode: formation.positioning_mode ?? "off_platform",
      positioning_questions: Array.isArray(formation.positioning_questions) ? formation.positioning_questions : [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function normalizeRows<T extends Record<string, string>>(rows: T[], requiredKey: keyof T) {
    return rows.filter((row) => String(row[requiredKey] ?? "").trim());
  }

  function normalizeParticipants(rows: Participant[]) {
    return rows.filter((row) => row.first_name.trim() || row.last_name.trim() || row.email.trim());
  }

  function normalizeCompanies(rows: Company[]) {
    return rows
      .map((company) => ({
        ...company,
        participants: normalizeParticipants(company.participants ?? []),
      }))
      .filter(
        (company) =>
          company.name.trim() ||
          company.address.trim() ||
          company.siret.trim() ||
          company.participants.length > 0,
      );
  }

  async function submitSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/client/daily/sessions", {
      method: editingSessionId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...sessionForm,
        id: editingSessionId || undefined,
        schedule_blocks: normalizeRows(scheduleBlocks, "date"),
        companies: normalizeCompanies(companies),
        beneficiaries: normalizeParticipants(beneficiaries),
        individual_beneficiaries: normalizeParticipants(individualBeneficiaries),
        trainer_ids: selectedTrainerIds,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Sauvegarde session impossible.");
      return;
    }
    setMessage(data?.validationWarning ?? "Session enregistrée.");
    setSessionForm(emptySession);
    setEditingSessionId("");
    setScheduleBlocks([{ date: "", start: "", end: "", note: "" }]);
    setCompanies([{ name: "", address: "", siret: "", email: "", participants: [{ first_name: "", last_name: "", email: "" }] }]);
    setBeneficiaries([{ first_name: "", last_name: "", email: "" }]);
    setIndividualBeneficiaries([{ first_name: "", last_name: "", email: "" }]);
    setSelectedTrainerIds([]);
    await loadDaily();
  }

  function editSession(session: DailySession) {
    setEditingSessionId(session.id);
    setSessionForm({
      ...emptySession,
      formation_id: session.formation_id,
      modality: session.modality,
      distance_mode: String(session.distance_mode ?? "synchrone"),
      blended_elearning_periods: String(session.blended_elearning_periods ?? ""),
      blended_in_person_days: String(session.blended_in_person_days ?? ""),
      location_address: String(session.location_address ?? ""),
      remote_url: String(session.remote_url ?? ""),
      status: session.status,
    });
    setScheduleBlocks(session.schedule_blocks?.length ? session.schedule_blocks : [{ date: "", start: "", end: "", note: "" }]);
    setCompanies(session.companies?.length ? session.companies : [{ name: "", address: "", siret: "", email: "", participants: [{ first_name: "", last_name: "", email: "" }] }]);
    setBeneficiaries(session.beneficiaries?.length ? session.beneficiaries : [{ first_name: "", last_name: "", email: "" }]);
    setIndividualBeneficiaries(
      session.individual_beneficiaries?.length ? session.individual_beneficiaries : [{ first_name: "", last_name: "", email: "" }],
    );
    setSelectedTrainerIds(Array.isArray(session.trainer_ids) ? session.trainer_ids.map(String) : []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function archiveSession(id: string) {
    if (!window.confirm("Archiver cette session ?")) return;
    const res = await fetch("/api/client/daily/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Archivage impossible.");
      return;
    }
    setMessage("Session archivée.");
    await loadDaily();
  }

  function getRegistrationUrl(token?: string | null) {
    if (!token || typeof window === "undefined") return "";
    return `${window.location.origin}/daily-inscription/${token}`;
  }

  async function copyRegistrationLink(token?: string | null) {
    const url = getRegistrationUrl(token);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setMessage("Lien d'inscription copié.");
  }

  if (loading) {
    return (
      <main className="gazette-paper" style={s.page}>
        <p style={s.muted}>Ouverture de Selen Daily...</p>
      </main>
    );
  }

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <ClientSupportBar email={email} context="Selen Daily" />
      <div style={s.page}>
        <Link href="/client" style={s.homeLink}>Retour au bureau Selen</Link>
        <header className="gazette-cta" style={s.hero}>
          <p className="gazette-label">Selen Daily</p>
          <h1 className="gazette-hero-title" style={s.heroTitle}>Formations et sessions</h1>
          <p style={s.heroText}>
            Créez vos programmes de formation, préparez vos sessions et laissez Selen
            {" vérifier les éléments avant l'envoi des documents officiels."}
          </p>
        </header>

        {message ? <p style={s.notice}>{message}</p> : null}
        {error ? <p style={s.error}>{error}</p> : null}
        <p style={formationAutosaveStatus === "error" ? s.warning : s.muted}>
          {formationAutosaveStatus === "saving"
            ? "Enregistrement du brouillon..."
            : formationAutosaveStatus === "saved"
              ? "Brouillon enregistre"
              : formationAutosaveStatus === "error"
                ? "Erreur d'enregistrement du brouillon"
                : ""}
        </p>

        <section style={s.grid}>
          <form onSubmit={submitFormation} style={s.card}>
            <p className="gazette-label">Formation Daily</p>
            <h2 style={s.cardTitle}>{editingFormationId ? "Modifier la formation" : "Créer une formation"}</h2>

            <Input label="Intitulé de la formation" value={formationForm.title} onChange={(value) => updateFormation("title", value)} required />
            <Textarea label="Objectif global" value={formationForm.global_objective} onChange={(value) => updateFormation("global_objective", value)} required />
            <Textarea label="Public visé" value={formationForm.target_audience} onChange={(value) => updateFormation("target_audience", value)} required />
            <Textarea label="Prérequis" value={formationForm.prerequisites} onChange={(value) => updateFormation("prerequisites", value)} required />

            <div style={s.twoCols}>
              <Input label="Durée en heures" type="number" value={formationForm.duration_hours} onChange={(value) => updateFormation("duration_hours", value)} required />
              <Input label="Durée en jours" type="number" value={formationForm.duration_days} onChange={(value) => updateFormation("duration_days", value)} required />
            </div>

            {fieldLabel("Modalités pédagogiques")}
            <select style={s.input} value={String(formationForm.modality ?? "")} onChange={(event) => updateFormation("modality", event.target.value)}>
              <option value="presentiel">Présentiel</option>
              <option value="distanciel">Distanciel</option>
              <option value="mixte">Mixte</option>
            </select>
            <Textarea label="Précisions sur les modalités" value={formationForm.modality_details} onChange={(value) => updateFormation("modality_details", value)} required />
            <Input label={"Délais d'accès"} value={formationForm.access_delays} onChange={(value) => updateFormation("access_delays", value)} required />
            <Textarea label={"Modalités d'inscription"} value={formationForm.registration_methods} onChange={(value) => updateFormation("registration_methods", value)} required />
            <Input label="Tarif" value={formationForm.price} onChange={(value) => updateFormation("price", value)} required />
            <Textarea label="Contenu / programme détaillé" value={formationForm.detailed_program} onChange={(value) => updateFormation("detailed_program", value)} required rows={6} />
            <Textarea
              label="Accessibilité handicap"
              helpText={"Indiquez les modalités d'accueil, d'adaptation ou d'orientation prévues pour les personnes en situation de handicap."}
              value={formationForm.accessibility}
              onChange={(value) => updateFormation("accessibility", value)}
              required
            />
            <Input label="Référent handicap si existant" value={formationForm.disability_referent} onChange={(value) => updateFormation("disability_referent", value)} />
            <Textarea label="Moyens pédagogiques et techniques mobilisés" value={formationForm.pedagogical_resources} onChange={(value) => updateFormation("pedagogical_resources", value)} required />
            <Textarea
              label={"Modalités d'évaluation des acquis"}
              helpText="Expliquez comment vous vérifiez que les objectifs de la formation sont atteints."
              value={formationForm.evaluation_methods}
              onChange={(value) => updateFormation("evaluation_methods", value)}
              required
            />

            <PositioningQuestionnaireEditor
              mode={String(formationForm.positioning_mode ?? "off_platform")}
              questions={Array.isArray(formationForm.positioning_questions) ? formationForm.positioning_questions : []}
              onModeChange={(value) => updateFormation("positioning_mode", value)}
              onQuestionsChange={updatePositioningQuestions}
            />

            <label style={s.check}>
              <input
                type="checkbox"
                checked={Boolean(formationForm.results_pending)}
                onChange={(event) => updateFormation("results_pending", event.target.checked)}
              />
              {"Nouvelle formation / pas encore d'indicateurs de résultats"}
              {help("Les indicateurs de résultats pourront être complétés après les premières sessions.")}
            </label>

            {!formationForm.results_pending ? (
              <div style={s.threeCols}>
                <Input label="Nombre de bénéficiaires" type="number" value={formationForm.result_beneficiary_count} onChange={(value) => updateFormation("result_beneficiary_count", value)} />
                <Input label="Taux de satisfaction (%)" type="number" value={formationForm.result_satisfaction_rate} onChange={(value) => updateFormation("result_satisfaction_rate", value)} />
                <Input label="Taux de réussite (%)" type="number" value={formationForm.result_success_rate} onChange={(value) => updateFormation("result_success_rate", value)} />
              </div>
            ) : null}

            <div style={s.threeCols}>
              <Input label="Téléphone" value={formationForm.contact_phone} onChange={(value) => updateFormation("contact_phone", value)} required />
              <Input label="Email" type="email" value={formationForm.contact_email} onChange={(value) => updateFormation("contact_email", value)} required />
              <Input label="Site internet" value={formationForm.contact_website} onChange={(value) => updateFormation("contact_website", value)} />
            </div>
            <Input label={"Date d'actualisation visible"} type="date" value={formationForm.updated_visible_at} onChange={(value) => updateFormation("updated_visible_at", value)} required />

            <div style={s.actions}>
              <button className="btn-ink" type="submit" disabled={saving}>
                <span>{saving ? "Enregistrement..." : editingFormationId ? "Enregistrer la modification" : "Créer la formation"}</span>
              </button>
              {editingFormationId ? (
                <button type="button" className="btn-ghost" onClick={() => { setEditingFormationId(""); setFormationForm({ ...emptyFormation, contact_email: email ?? "" }); }}>
                  <span>Annuler</span>
                </button>
              ) : null}
            </div>
          </form>

          <form onSubmit={submitSession} style={s.card}>
            <p className="gazette-label">Session associée</p>
            <h2 style={s.cardTitle}>{editingSessionId ? "Modifier la session" : "Créer une session"}</h2>

            {fieldLabel("Formation")}
            <select style={s.input} value={String(sessionForm.formation_id ?? "")} onChange={(event) => updateSession("formation_id", event.target.value)} required>
              <option value="">Sélectionner une formation</option>
              {activeFormations.map((formation) => (
                <option key={formation.id} value={formation.id}>
                  {formation.title} - {formatStatus(formation.status)}
                </option>
              ))}
            </select>

            {sessionForm.formation_id && activeFormations.find((formation) => formation.id === sessionForm.formation_id)?.status !== "validated" ? (
              <p style={s.notice}>
                {"La session est prête à accueillir les inscriptions. Les documents officiels partiront quand le programme, le positionnement et l'évaluation auront été validés."}
              </p>
            ) : null}

            {fieldLabel("Modalité", "Blended learning / mixte : alternance de temps à distance et de jours en présentiel.")}
            <select style={s.input} value={String(sessionForm.modality ?? "")} onChange={(event) => updateSession("modality", event.target.value)}>
              <option value="presentiel">Présentiel</option>
              <option value="distanciel">Distanciel</option>
              <option value="mixte">Blended learning / mixte</option>
            </select>

            {sessionForm.modality === "distanciel" ? (
              <>
                {fieldLabel("Organisation à distance", "À distance en direct = visio avec horaires. À distance à son rythme = e-learning asynchrone.")}
                <select style={s.input} value={String(sessionForm.distance_mode ?? "")} onChange={(event) => updateSession("distance_mode", event.target.value)}>
                  <option value="synchrone">À distance en direct</option>
                  <option value="asynchrone">À distance à son rythme</option>
                </select>
              </>
            ) : null}

            {sessionForm.modality === "mixte" ? (
              <>
                <Textarea label="Périodes en e-learning" value={sessionForm.blended_elearning_periods} onChange={(value) => updateSession("blended_elearning_periods", value)} />
                <Textarea label="Jours en présentiel" value={sessionForm.blended_in_person_days} onChange={(value) => updateSession("blended_in_person_days", value)} />
              </>
            ) : null}

            <DynamicRows
              title="Dates et horaires"
              rows={scheduleBlocks}
              setRows={setScheduleBlocks}
              fields={[
                ["date", "Date"],
                ["start", "Début"],
                ["end", "Fin"],
                ["note", "Note"],
              ]}
              blank={{ date: "", start: "", end: "", note: "" }}
            />

            {(sessionForm.modality === "presentiel" || sessionForm.modality === "mixte") ? (
              <Textarea label="Adresse physique" value={sessionForm.location_address} onChange={(value) => updateSession("location_address", value)} required />
            ) : null}
            {(sessionForm.modality === "distanciel" || sessionForm.modality === "mixte") ? (
              <Input label="Lien visio / plateforme" value={sessionForm.remote_url} onChange={(value) => updateSession("remote_url", value)} required />
            ) : null}

            <CompanyRows rows={companies} setRows={setCompanies} />
            <DynamicRows
              title="Bénéficiaires rattachés à une entreprise"
              rows={beneficiaries}
              setRows={setBeneficiaries}
              fields={[["first_name", "Prénom"], ["last_name", "Nom"], ["email", "Email"]]}
              blank={{ first_name: "", last_name: "", email: "" }}
            />
            <DynamicRows
              title="Bénéficiaires individuels"
              rows={individualBeneficiaries}
              setRows={setIndividualBeneficiaries}
              fields={[["first_name", "Prénom"], ["last_name", "Nom"], ["email", "Email"]]}
              blank={{ first_name: "", last_name: "", email: "" }}
            />

            {dailyTrainers.length > 0 ? (
              <div style={s.dynamic}>
                <strong>Formateurs associés à la session</strong>
                {dailyTrainers.map((trainer) => {
                  const checked = selectedTrainerIds.includes(trainer.id);
                  return (
                    <label key={trainer.id} style={s.check}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setSelectedTrainerIds((current) =>
                            event.target.checked
                              ? [...current, trainer.id]
                              : current.filter((id) => id !== trainer.id),
                          )
                        }
                      />
                      {trainer.first_name} {trainer.last_name}
                    </label>
                  );
                })}
              </div>
            ) : null}

            <div style={s.actions}>
              <button className="btn-ink" type="submit" disabled={saving || activeFormations.length === 0}>
                <span>{editingSessionId ? "Enregistrer la session" : "Créer la session"}</span>
              </button>
              {editingSessionId ? (
                <button type="button" className="btn-ghost" onClick={() => setEditingSessionId("")}>
                  <span>Annuler</span>
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section style={s.grid}>
          <ListCard title="Formations" empty="Aucune formation Daily pour le moment.">
            {formations.map((formation) => (
              <article key={formation.id} style={s.listItem}>
                <strong>{formation.title}</strong>
                <span>{formatStatus(formation.status)} - v{formation.version ?? 1}</span>
                <p>{formation.duration_hours} h / {formation.duration_days} j - {formation.modality}</p>
                <div style={s.actions}>
                  <button type="button" className="btn-ghost" onClick={() => editFormation(formation)}><span>Modifier</span></button>
                  <button type="button" className="btn-ghost" onClick={() => archiveFormation(formation.id)}><span>Archiver / supprimer</span></button>
                </div>
              </article>
            ))}
          </ListCard>

          <ListCard title="Sessions" empty="Aucune session Daily pour le moment.">
            {sessions.map((session) => (
              <article key={session.id} style={s.listItem}>
                <strong>{session.daily_formations?.title ?? "Formation"}</strong>
                <span>{formatStatus(session.status)} - {session.modality}</span>
                <span>Dossier d&apos;inscription : {formatRegistrationStatus(session.registration_status)}</span>
                <p>{(session.schedule_blocks ?? []).length} bloc(s) planifié(s)</p>
                <p>
                  {(session.individual_beneficiaries ?? []).length} apprenant(s) individuel(s) ·{" "}
                  {(session.companies ?? []).length} entreprise(s)
                </p>
                <div style={s.linkBox}>
                  <strong>Timeline globale</strong>
                  {sessionTimeline(session).map(([label, status]) => (
                    <span key={label}>{label} : {status}</span>
                  ))}
                </div>
                {session.registration_token ? (
                  <div style={s.linkBox}>
                    <strong>Lien d&apos;inscription</strong>
                    <input style={s.input} readOnly value={getRegistrationUrl(session.registration_token)} />
                    <p style={s.muted}>
                      Votre lien d&apos;inscription est prêt. Selen vérifie le dossier avant envoi aux participants,
                      pour éviter les oublis et garder un dossier propre.
                    </p>
                    <button type="button" className="btn-ghost" onClick={() => void copyRegistrationLink(session.registration_token)}>
                      <span>Copier le lien</span>
                    </button>
                  </div>
                ) : null}
                {session.daily_registration_recipients?.length ? (
                  <div style={s.linkBox}>
                    <strong>Suivi des dossiers envoyés</strong>
                    {session.daily_registration_recipients.map((recipient) => (
                      <span key={recipient.id}>
                        {recipient.recipient_name || recipient.recipient_email || "Destinataire"} :{" "}
                        {formatRecipientStatus(recipient.status)}
                        {recipient.sent_at ? ` le ${new Date(recipient.sent_at).toLocaleDateString("fr-FR")}` : ""}
                        {recipient.last_error ? ` - ${recipient.last_error}` : ""}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={s.muted}>Dossiers en attente de validation Selen avant envoi.</p>
                )}
                <div style={s.linkBox}>
                  <strong>Conventions</strong>
                  {session.daily_conventions?.length ? (
                    session.daily_conventions.map((convention) => (
                      <div key={convention.id} style={s.signatureMiniBox}>
                        <a
                          href={`/api/client/daily/conventions/download?id=${convention.id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={s.inlineLink}
                        >
                          {convention.recipient_type === "company" ? "Entreprise" : "Beneficiaire"}{" "}
                          {convention.company_name || convention.recipient_name || "Daily"} - v{convention.version}
                          {convention.generated_at ? ` - ${new Date(convention.generated_at).toLocaleDateString("fr-FR")}` : ""}
                          {" - "}{formatConventionSignatureStatus(convention)}
                        </a>
                        {convention.daily_convention_signatures?.map((signature) => (
                          <span key={signature.id}>
                            {signature.signatory_type} : {signature.status === "signed" ? "signee" : "en attente"}
                            {signature.signed_at ? ` le ${new Date(signature.signed_at).toLocaleDateString("fr-FR")}` : ""}
                          </span>
                        ))}
                      </div>
                    ))
                  ) : (
                    <span>Non generee. Selen la prepare apres verification des informations utiles.</span>
                  )}
                </div>
                <div style={s.linkBox}>
                  <strong>Convocations</strong>
                  {session.daily_convocations?.length ? (
                    session.daily_convocations.map((convocation) => (
                      <a
                        key={convocation.id}
                        href={`/api/client/daily/convocations/download?id=${convocation.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={s.inlineLink}
                      >
                        {convocation.recipient_type === "trainer" ? "Formateur" : convocation.recipient_type === "company" ? "Entreprise" : "Beneficiaire"}{" "}
                        {convocation.company_name || convocation.recipient_name || "Daily"} - v{convocation.version}
                        {convocation.status === "sent" && convocation.sent_at ? ` - envoyee le ${new Date(convocation.sent_at).toLocaleDateString("fr-FR")}` : " - generee"}
                      </a>
                    ))
                  ) : (
                    <span>A venir apres generation par Selen.</span>
                  )}
                </div>
                {session.daily_portal_access_tokens?.length ? (
                  <div style={s.linkBox}>
                    <strong>Portails</strong>
                    {session.daily_portal_access_tokens.map((portal) => (
                      <span key={portal.id}>
                        {portal.portal_type === "learner" ? "Apprenant" : portal.portal_type === "enterprise" ? "Entreprise" : "Formateur"}{" "}
                        {portal.entity_name || portal.entity_email || ""} :{" "}
                        <a href={portalUrl(portal.portal_type, portal.token)} target="_blank" rel="noreferrer" style={s.inlineLink}>
                          ouvrir
                        </a>
                        {portal.status === "viewed" ? " - consulte" : " - a transmettre"}
                      </span>
                    ))}
                  </div>
                ) : null}
                {session.registration_status === "summary_to_review" || session.registration_status === "summary_validated" ? (
                  <p style={s.notice}>Des réponses ont été reçues et sont en cours de suivi par Selen.</p>
                ) : null}
                {session.adaptation_needed ? (
                  <p style={s.warning}>Une adaptation ou un point d&apos;attention a été signalé.</p>
                ) : null}
                {session.daily_formations?.status !== "validated" ? (
                  <p style={s.warning}>Documents officiels en attente de validation Selen.</p>
                ) : null}
                <div style={s.actions}>
                  <button type="button" className="btn-ghost" onClick={() => editSession(session)}><span>Modifier</span></button>
                  <button type="button" className="btn-ghost" onClick={() => archiveSession(session.id)}><span>Archiver</span></button>
                </div>
              </article>
            ))}
          </ListCard>
        </section>
      </div>
    </main>
  );
}

function Input({ label, helpText, value, onChange, type = "text", required = false }: { label: string; helpText?: string; value: FormValue | PositioningQuestion[]; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <div style={s.field}>
      {fieldLabel(label, helpText)}
      <input style={s.input} type={type} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} required={required} />
    </div>
  );
}

function Textarea({ label, helpText, value, onChange, required = false, rows = 3 }: { label: string; helpText?: string; value: FormValue | PositioningQuestion[]; onChange: (value: string) => void; required?: boolean; rows?: number }) {
  return (
    <div style={s.field}>
      {fieldLabel(label, helpText)}
      <textarea style={{ ...s.input, minHeight: rows * 34, paddingTop: 10 }} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} required={required} />
    </div>
  );
}

function CompanyRows({ rows, setRows }: { rows: Company[]; setRows: (rows: Company[]) => void }) {
  const blankParticipant = { first_name: "", last_name: "", email: "" };
  const blankCompany = { name: "", address: "", siret: "", email: "", participants: [blankParticipant] };

  function updateCompany(index: number, patch: Partial<Company>) {
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function updateParticipant(companyIndex: number, participantIndex: number, patch: Partial<Participant>) {
    setRows(
      rows.map((company, rowIndex) => {
        if (rowIndex !== companyIndex) return company;
        return {
          ...company,
          participants: company.participants.map((participant, itemIndex) =>
            itemIndex === participantIndex ? { ...participant, ...patch } : participant,
          ),
        };
      }),
    );
  }

  return (
    <div style={s.dynamic}>
      <div style={s.dynamicHead}>
        <strong>Entreprises</strong>
        <button type="button" className="btn-ghost" onClick={() => setRows([...rows, { ...blankCompany, participants: [{ ...blankParticipant }] }])}>
          <span>Ajouter</span>
        </button>
      </div>
      {rows.map((company, index) => (
        <div key={index} style={s.companyBox}>
          <div style={s.rowGrid}>
            <input style={s.input} placeholder="Nom de l'entreprise" value={company.name} onChange={(event) => updateCompany(index, { name: event.target.value })} />
            <input style={s.input} placeholder="Adresse" value={company.address} onChange={(event) => updateCompany(index, { address: event.target.value })} />
            <input style={s.input} placeholder="SIRET" value={company.siret} onChange={(event) => updateCompany(index, { siret: event.target.value })} />
            <input style={s.input} placeholder="Email entreprise" value={company.email} onChange={(event) => updateCompany(index, { email: event.target.value })} />
            <button type="button" className="btn-ghost" onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>
              <span>Retirer</span>
            </button>
          </div>
          <strong>Participants de l&apos;entreprise</strong>
          {(company.participants ?? []).map((participant, participantIndex) => (
            <div key={participantIndex} style={s.rowGrid}>
              <input style={s.input} placeholder="Prénom" value={participant.first_name} onChange={(event) => updateParticipant(index, participantIndex, { first_name: event.target.value })} />
              <input style={s.input} placeholder="Nom" value={participant.last_name} onChange={(event) => updateParticipant(index, participantIndex, { last_name: event.target.value })} />
              <input style={s.input} placeholder="Email" value={participant.email} onChange={(event) => updateParticipant(index, participantIndex, { email: event.target.value })} />
              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  updateCompany(index, {
                    participants: company.participants.filter((_, itemIndex) => itemIndex !== participantIndex),
                  })
                }
              >
                <span>Retirer</span>
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => updateCompany(index, { participants: [...(company.participants ?? []), { ...blankParticipant }] })}
          >
            <span>Ajouter un participant</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function DynamicRows<T extends Record<string, string>>({ title, rows, setRows, fields, blank }: { title: string; rows: T[]; setRows: (rows: T[]) => void; fields: [keyof T, string][]; blank: T }) {
  return (
    <div style={s.dynamic}>
      <div style={s.dynamicHead}>
        <strong>{title}</strong>
        <button type="button" className="btn-ghost" onClick={() => setRows([...rows, { ...blank }])}><span>Ajouter</span></button>
      </div>
      {rows.map((row, index) => (
        <div key={index} style={s.rowGrid}>
          {fields.map(([key, label]) => (
            <input
              key={String(key)}
              style={s.input}
              placeholder={label}
              value={String(row[key] ?? "")}
              onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item))}
            />
          ))}
          <button type="button" className="btn-ghost" onClick={() => setRows(rows.filter((_, itemIndex) => itemIndex !== index))}><span>Retirer</span></button>
        </div>
      ))}
    </div>
  );
}

function PositioningQuestionnaireEditor({
  mode,
  questions,
  onModeChange,
  onQuestionsChange,
}: {
  mode: string;
  questions: PositioningQuestion[];
  onModeChange: (value: string) => void;
  onQuestionsChange: (questions: PositioningQuestion[]) => void;
}) {
  function reorder(nextQuestions: PositioningQuestion[]) {
    onQuestionsChange(nextQuestions.map((question, index) => ({ ...question, order: index + 1 })));
  }

  function addQuestion() {
    reorder([
      ...questions,
      {
        id: `question_${Date.now()}`,
        label: "",
        help_text: "",
        required: true,
        type: "free_text",
        options: [],
        order: questions.length + 1,
      },
    ]);
  }

  function updateQuestion(index: number, patch: Partial<PositioningQuestion>) {
    reorder(questions.map((question, itemIndex) => itemIndex === index ? { ...question, ...patch } : question));
  }

  function removeQuestion(index: number) {
    if (!window.confirm("Supprimer cette question de positionnement ?")) return;
    reorder(questions.filter((_, itemIndex) => itemIndex !== index));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    const current = next[index];
    next[index] = next[target];
    next[target] = current;
    reorder(next);
  }

  function duplicateQuestion(index: number) {
    const source = questions[index];
    reorder([
      ...questions.slice(0, index + 1),
      { ...source, id: `question_${Date.now()}`, label: `${source.label} - copie` },
      ...questions.slice(index + 1),
    ]);
  }

  return (
    <section style={s.dynamic}>
      <div style={s.dynamicHead}>
        <strong>Questionnaire de positionnement</strong>
        {mode === "selen" ? (
          <button type="button" className="btn-ghost" onClick={addQuestion}>
            <span>Ajouter une question</span>
          </button>
        ) : null}
      </div>

      <label style={s.check}>
        <input
          type="radio"
          name="positioning_mode_choice"
          checked={mode === "selen"}
          onChange={() => onModeChange("selen")}
        />
        Je veux integrer le positionnement dans Selen
      </label>
      <label style={s.check}>
        <input
          type="radio"
          name="positioning_mode_choice"
          checked={mode !== "selen"}
          onChange={() => onModeChange("off_platform")}
        />
        Je ferai le positionnement hors plateforme
      </label>

      {mode !== "selen" ? (
        <p style={s.notice}>
          Vous pourrez importer ou conserver votre preuve de positionnement selon vos modalites habituelles.
          Selen indiquera simplement que le positionnement est realise hors plateforme.
        </p>
      ) : null}

      {mode === "selen" ? (
        <div style={s.dynamic}>
          {questions.map((question, index) => (
            <article key={question.id} style={s.companyBox}>
              <div style={s.dynamicHead}>
                <strong>Question {index + 1}</strong>
                <div style={s.actions}>
                  <button type="button" className="btn-ghost" onClick={() => moveQuestion(index, -1)}><span>Monter</span></button>
                  <button type="button" className="btn-ghost" onClick={() => moveQuestion(index, 1)}><span>Descendre</span></button>
                  <button type="button" className="btn-ghost" onClick={() => duplicateQuestion(index)}><span>Dupliquer</span></button>
                  <button type="button" className="btn-ghost" onClick={() => removeQuestion(index)}><span>Supprimer</span></button>
                </div>
              </div>
              <Input label="Intitule de la question" value={question.label} onChange={(value) => updateQuestion(index, { label: value })} required />
              <Input label="Aide / precision facultative" value={question.help_text} onChange={(value) => updateQuestion(index, { help_text: value })} />
              <div style={s.twoCols}>
                <label style={s.field}>
                  <span style={s.label}>Type de reponse</span>
                  <select
                    style={s.input}
                    value={question.type}
                    onChange={(event) => updateQuestion(index, { type: event.target.value as PositioningQuestion["type"], options: [] })}
                  >
                    <option value="single_choice">Choix unique</option>
                    <option value="multiple_choice">Choix multiple</option>
                    <option value="free_text">Texte libre</option>
                    <option value="scale_1_5">Echelle de 1 a 5</option>
                  </select>
                </label>
                <label style={s.check}>
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(event) => updateQuestion(index, { required: event.target.checked })}
                  />
                  Question obligatoire
                </label>
              </div>
              {["single_choice", "multiple_choice"].includes(question.type) ? (
                <Textarea
                  label="Options de reponse, une par ligne"
                  value={question.options.join("\n")}
                  onChange={(value) => updateQuestion(index, { options: value.split("\n").map((option) => option.trim()).filter(Boolean) })}
                  rows={3}
                />
              ) : null}
            </article>
          ))}
          {questions.length === 0 ? <p style={s.muted}>Ajoutez au moins une question avant l&apos;envoi en validation.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function ListCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section style={s.card}>
      <p className="gazette-label">Suivi</p>
      <h2 style={s.cardTitle}>{title}</h2>
      {hasChildren ? children : <p style={s.muted}>{empty}</p>}
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1220, margin: "0 auto", padding: "2rem 1.5rem 4rem" },
  homeLink: { display: "inline-flex", marginBottom: "1rem", color: "var(--rust)", fontWeight: 800, textDecoration: "none" },
  hero: { padding: "2rem", marginBottom: "1.5rem" },
  heroTitle: { color: "var(--parchment)", marginBottom: "0.5rem" },
  heroText: { color: "var(--sepia-mid)", lineHeight: 1.65, maxWidth: 760 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "1rem", marginBottom: "1rem" },
  card: { background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", padding: "1.2rem", display: "grid", gap: "0.9rem" },
  cardTitle: { color: "var(--ink)", margin: 0 },
  field: { display: "grid", gap: "0.35rem" },
  label: { color: "var(--ink)", fontWeight: 700, fontSize: "0.92rem" },
  input: { width: "100%", border: "1px solid rgba(178,138,98,0.55)", background: "rgba(255,250,239,0.82)", color: "var(--ink)", padding: "0.7rem", fontSize: "0.95rem", boxSizing: "border-box" },
  twoCols: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.7rem" },
  threeCols: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.7rem" },
  check: { display: "flex", gap: "0.55rem", alignItems: "center", color: "var(--ink-soft)", lineHeight: 1.4 },
  actions: { display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" },
  notice: { border: "1px solid rgba(106,138,74,0.45)", background: "rgba(106,138,74,0.08)", color: "#496532", padding: "0.75rem", lineHeight: 1.5 },
  warning: { color: "var(--rust)", fontWeight: 700, margin: 0 },
  error: { border: "1px solid var(--rust)", background: "rgba(138,75,36,0.08)", color: "var(--rust)", padding: "0.75rem", lineHeight: 1.5 },
  muted: { color: "var(--ink-soft)", lineHeight: 1.6 },
  dynamic: { display: "grid", gap: "0.6rem", border: "1px solid rgba(178,138,98,0.28)", padding: "0.8rem" },
  dynamicHead: { display: "flex", justifyContent: "space-between", gap: "0.6rem", alignItems: "center", color: "var(--ink)" },
  rowGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.5rem", alignItems: "center" },
  companyBox: { display: "grid", gap: "0.55rem", border: "1px solid rgba(178,138,98,0.22)", padding: "0.7rem", background: "rgba(255,250,239,0.42)" },
  linkBox: { display: "grid", gap: "0.5rem", border: "1px solid rgba(106,138,74,0.35)", background: "rgba(106,138,74,0.06)", padding: "0.75rem" },
  signatureMiniBox: { display: "grid", gap: "0.3rem", borderTop: "1px solid rgba(106,138,74,0.22)", paddingTop: "0.45rem" },
  inlineLink: { color: "var(--rust)", fontWeight: 800, textDecoration: "none" },
  listItem: { display: "grid", gap: "0.35rem", border: "1px solid rgba(178,138,98,0.32)", background: "rgba(248,239,223,0.45)", padding: "0.9rem", color: "var(--ink-soft)" },
};
