"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ClientSupportBar from "@/components/ClientSupportBar";
import { assistanceFetch, withAssistanceToken } from "@/components/AgentAssistanceBanner";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

type DailyStatus = "draft" | "review" | "validated" | "correction_requested" | "archived";
type PositioningQuestion = {
  id: string;
  label: string;
  help_text: string;
  required: boolean;
  type: "single_choice" | "multiple_choice" | "free_text" | "scale_1_5";
  options: string[];
  order: number;
};
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
  detailed_program_document_url?: string | null;
  public_registration_token?: string | null;
  public_registration_enabled?: boolean | null;
  spontaneous_registration_task_status?: string | null;
  positioning_mode?: string | null;
  positioning_questions?: PositioningQuestion[] | null;
  [key: string]: string | number | boolean | PositioningQuestion[] | null | undefined;
};
type ScheduleBlock = { date: string; start: string; end: string; note: string };
type Participant = { first_name: string; last_name: string; email: string; phone?: string };
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
type DailyConventionSignature = {
  id: string;
  signatory_type: string;
  signatory_name: string | null;
  status: string | null;
  signed_at: string | null;
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
type DailySession = {
  id: string;
  formation_id: string;
  modality: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  schedule_blocks?: ScheduleBlock[] | null;
  companies?: Company[] | null;
  beneficiaries?: Participant[] | null;
  individual_beneficiaries?: Participant[] | null;
  registration_token?: string | null;
  registration_status?: string | null;
  adaptation_needed?: boolean | null;
  daily_registration_recipients?: RegistrationRecipient[] | null;
  daily_conventions?: DailyConvention[] | null;
  daily_convocations?: DailyConvocation[] | null;
  daily_portal_access_tokens?: DailyPortalAccess[] | null;
  daily_formations?: Pick<Formation, "id" | "title" | "status" | "version"> | null;
  [key: string]: unknown;
};
type FormValue = string | number | boolean | null | undefined;
type FormState = Record<string, FormValue | PositioningQuestion[] | string[]>;
type SaveStatus = "idle" | "saving" | "saved" | "error";

const DETAILED_PROGRAM_EXAMPLE = `Module 1\nDurée :\nChapitre 1 :\nChapitre 2 :\n\nModule 2\nDurée :\nChapitre 1 :\nChapitre 2 :`;

const emptyFormation = {
  title: "",
  global_objective: "",
  learning_objectives: [""],
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
  detailed_program_document_url: "",
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
  if (status === "sent") return "envoyé avec soin";
  if (status === "error") return "à reprendre";
  if (status === "skipped") return "à compléter avant envoi";
  return "en préparation";
}

function formatConventionSignatureStatus(convention: DailyConvention) {
  const signatures = convention.daily_convention_signatures ?? [];
  if (signatures.length === 0) return "Signature en préparation";
  if (signatures.every((signature) => signature.status === "signed")) return "Signée";
  if (signatures.some((signature) => signature.status === "signed")) return "Signature partielle";
  return "À signer";
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
    ["Dossiers envoyés", hasSent ? "terminé" : "en attente"],
    ["Dossiers complétés", allSentCompleted ? "terminé" : hasSent ? "à suivre" : "à venir"],
    ["Conventions", conventions.length > 0 ? "terminé" : "en attente"],
    ["Signatures", allSigned ? "terminé" : signatures.length > 0 ? "à faire" : "à venir"],
    ["Convocations générées", convocations.length > 0 ? "terminé" : "en attente"],
    ["Convocations envoyées", sentConvocations.length > 0 ? "terminé" : convocations.length > 0 ? "à faire" : "à venir"],
    ["Formation", "à venir"],
  ];
}

function help(text: string) {
  return (
    <span title={text} style={s.helpBubble}>?</span>
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
  const [openError, setOpenError] = useState("");
  const [formationAutosaveStatus, setFormationAutosaveStatus] = useState<SaveStatus>("idle");
  const [email, setEmail] = useState<string | null>(null);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [sessions, setSessions] = useState<DailySession[]>([]);
  const [formationForm, setFormationForm] = useState<FormState>(emptyFormation);
  const [editingFormationId, setEditingFormationId] = useState("");
  const [lastCreatedFormationId, setLastCreatedFormationId] = useState("");

  const loadDaily = useCallback(async () => {
    const [formationRes, sessionRes] = await Promise.all([
      assistanceFetch("/api/client/daily/formations", { cache: "no-store" }),
      assistanceFetch("/api/client/daily/sessions", { cache: "no-store" }),
    ]);
    const formationData = await formationRes.json().catch(() => null);
    const sessionData = await sessionRes.json().catch(() => null);
    if (!formationRes.ok) throw new Error(formationData?.error ?? "Chargement formations impossible.");
    if (!sessionRes.ok) throw new Error(sessionData?.error ?? "Chargement sessions impossible.");
    setFormations((formationData.formations ?? []) as Formation[]);
    setSessions((sessionData.sessions ?? []) as DailySession[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError || !data.user) {
          router.replace("/client/login");
          return;
        }
        const userEmail = data.user.email ?? null;
        if (cancelled) return;
        setEmail(userEmail);
        try {
          const draft = window.localStorage.getItem("selen-daily-formation-draft");
          if (draft) {
            setFormationForm({ ...emptyFormation, ...JSON.parse(draft), contact_email: userEmail ?? "" });
            setFormationAutosaveStatus("saved");
          } else {
            setFormationForm((current) => ({ ...current, contact_email: userEmail ?? "" }));
          }
        } catch {
          setFormationAutosaveStatus("error");
          setFormationForm((current) => ({ ...current, contact_email: userEmail ?? "" }));
        }

        const onboardingRes = await assistanceFetch("/api/client/daily/onboarding", { cache: "no-store" });
        const onboardingData = await onboardingRes.json().catch(() => null);
        if (!onboardingRes.ok) {
          if (!cancelled) {
            setOpenError(onboardingData?.error ?? "Impossible d'ouvrir Selen Daily. Revenez au bureau Selen ou contactez Selen.");
            setLoading(false);
          }
          return;
        }
        if (onboardingData?.onboarding?.status !== "completed") {
          router.replace("/client/daily/onboarding");
          return;
        }
        await loadDaily();
        if (!cancelled) setLoading(false);
      } catch (bootError) {
        if (!cancelled) {
          setOpenError(bootError instanceof Error ? bootError.message : "Impossible d'ouvrir Selen Daily pour le moment.");
          setLoading(false);
        }
      }
    }
    void boot();
    return () => { cancelled = true; };
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

  const lastCreatedFormation = useMemo(
    () => formations.find((formation) => formation.id === lastCreatedFormationId) ?? null,
    [formations, lastCreatedFormationId],
  );

  function updateFormation(key: string, value: FormValue | string[]) {
    setFormationForm((current) => ({ ...current, [key]: value }));
  }

  function updatePositioningQuestions(questions: PositioningQuestion[]) {
    setFormationForm((current) => ({ ...current, positioning_questions: questions }));
  }

  async function submitFormation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const res = await assistanceFetch("/api/client/daily/formations", {
      method: editingFormationId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formationForm, id: editingFormationId || undefined }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "L'enregistrement n'a pas abouti. Vous pouvez réessayer dans un instant.");
      return;
    }
    const savedFormation = data?.formation as Formation | undefined;
    setMessage(data?.versioned ? "Nouvelle version bien reçue. Selen va la relire avant validation." : "Formation enregistrée.");
    if (!editingFormationId && savedFormation?.id) setLastCreatedFormationId(savedFormation.id);
    window.localStorage.removeItem("selen-daily-formation-draft");
    setFormationAutosaveStatus("idle");
    setFormationForm({ ...emptyFormation, contact_email: email ?? "" });
    setEditingFormationId("");
    await loadDaily();
  }

  async function archiveFormation(id: string) {
    if (!window.confirm("Archiver ou supprimer cette formation selon les sessions associées ?")) return;
    const res = await assistanceFetch("/api/client/daily/formations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Cette action n'a pas pu être réalisée pour le moment.");
      return;
    }
    setMessage(data?.archived ? "Formation archivée, son historique reste conservé." : "Formation retirée.");
    await loadDaily();
  }

  function editFormation(formation: Formation) {
    setEditingFormationId(formation.id);
    setLastCreatedFormationId("");
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

  async function archiveSession(id: string) {
    if (!window.confirm("Archiver cette session ?")) return;
    const res = await assistanceFetch("/api/client/daily/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "L'archivage n'a pas pu être effectué pour le moment.");
      return;
    }
    setMessage("Session archivée. Son historique reste disponible.");
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

  if (loading) return <main className="gazette-paper" style={s.page}><p style={s.muted}>Ouverture de Selen Daily...</p></main>;

  if (openError) {
    return (
      <main className="gazette-paper" style={{ minHeight: "100vh" }}>
        <ClientSupportBar email={email} context="Selen Daily" />
        <div style={s.page}>
          <Link href="/client" style={s.homeLink}>Retour au bureau Selen</Link>
          <section style={s.card}>
            <p className="gazette-label">Selen Daily</p>
            <h1 style={s.cardTitle}>Ouverture impossible</h1>
            <p style={s.error}>{openError}</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <ClientSupportBar email={email} context="Selen Daily" />
      <div style={s.page}>
        <Link href="/client" style={s.homeLink}>Retour au bureau Selen</Link>
        <div style={s.compactHeading}>
          <p className="gazette-label">Selen Daily</p>
          <h1 style={s.cardTitle}>Créer une formation</h1>
        </div>

        <p style={formationAutosaveStatus === "error" ? s.warning : s.muted}>
          {formationAutosaveStatus === "saving" ? "Enregistrement du brouillon..." : formationAutosaveStatus === "saved" ? "Brouillon enregistré" : formationAutosaveStatus === "error" ? "Le brouillon n'a pas pu être enregistré" : ""}
        </p>

        <form onSubmit={submitFormation} style={s.card}>
          <p className="gazette-label">Formation Daily</p>
          <h2 style={s.cardTitle}>{editingFormationId ? "Modifier la formation" : "Créer une formation"}</h2>

          <Input label="Intitulé de la formation" value={formationForm.title} onChange={(value) => updateFormation("title", value)} required />
          <Textarea label="Objectif principal" value={formationForm.global_objective} onChange={(value) => updateFormation("global_objective", value)} required />
          <p style={s.helpText}>Commencez par un verbe d&apos;action à l&apos;infinitif décrivant ce que le participant saura faire à l&apos;issue de la formation.</p>

          <div style={s.dynamic}>
            <div style={s.dynamicHead}>
              <strong>Objectifs pédagogiques</strong>
              <button type="button" className="btn-ghost" onClick={() => updateFormation("learning_objectives", [...((formationForm.learning_objectives as string[]) ?? []), ""])}><span>Ajouter un objectif</span></button>
            </div>
            {((formationForm.learning_objectives as string[]) ?? [""]).map((objective, index) => (
              <div key={index} style={s.objectiveRow}>
                <Input label={`Objectif ${index + 1}`} value={objective} onChange={(value) => updateFormation("learning_objectives", ((formationForm.learning_objectives as string[]) ?? []).map((item, itemIndex) => itemIndex === index ? value : item))} required={index === 0} />
                {((formationForm.learning_objectives as string[]) ?? []).length > 1 ? <button type="button" className="btn-ghost" onClick={() => updateFormation("learning_objectives", ((formationForm.learning_objectives as string[]) ?? []).filter((_, itemIndex) => itemIndex !== index))}><span>Retirer</span></button> : null}
              </div>
            ))}
          </div>

          <Textarea label="Public visé" value={formationForm.target_audience} onChange={(value) => updateFormation("target_audience", value)} required />
          <Textarea label="Prérequis" value={formationForm.prerequisites} onChange={(value) => updateFormation("prerequisites", value)} required />
          <p style={s.helpText}>Indiquez uniquement les conditions réellement nécessaires. Chaque prérequis déclaré doit pouvoir être vérifié.</p>

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
          <Input label="Délais d'accès" value={formationForm.access_delays} onChange={(value) => updateFormation("access_delays", value)} required />
          <Input label="Tarif TTC" value={formationForm.price} onChange={(value) => updateFormation("price", value)} required />

          <Textarea
            label="Contenu détaillé de la formation"
            value={formationForm.detailed_program}
            onChange={(value) => updateFormation("detailed_program", value)}
            required
            rows={10}
            placeholder={DETAILED_PROGRAM_EXAMPLE}
          />
          <p style={s.helpText}>Présentez le contenu sous la forme Module, Durée, puis Chapitres. Ajoutez autant de modules et de chapitres que nécessaire.</p>

          <FileUploadField label="Programme de formation (Word ou PDF)" kind="training_program_source" value={String(formationForm.detailed_program_document_url ?? "")} onUploaded={(url) => updateFormation("detailed_program_document_url", url)} accept=".doc,.docx,.pdf" />
          <a href="/templates/modele-programme-formation-selen.docx" download style={s.downloadLink}><span aria-hidden="true">⇩</span> Télécharger la trame de programme Selen</a>

          <Textarea label="Moyens pédagogiques et techniques mobilisés" value={formationForm.pedagogical_resources} onChange={(value) => updateFormation("pedagogical_resources", value)} required />
          <Textarea label="Modalités d'évaluation des acquis" value={formationForm.evaluation_methods} onChange={(value) => updateFormation("evaluation_methods", value)} required />

          <PositioningQuestionnaireEditor
            mode={String(formationForm.positioning_mode ?? "off_platform")}
            questions={Array.isArray(formationForm.positioning_questions) ? formationForm.positioning_questions.filter((question): question is PositioningQuestion => typeof question === "object" && question !== null && "type" in question) : []}
            onModeChange={(value) => updateFormation("positioning_mode", value)}
            onQuestionsChange={updatePositioningQuestions}
          />
          <p style={s.helpText}>Le positionnement permet d&apos;évaluer le niveau de départ et d&apos;identifier les besoins d&apos;adaptation.</p>
          <FileUploadField label="Questionnaire de positionnement existant (Word ou PDF), facultatif" kind="positioning_questionnaire_source" value={String(formationForm.positioning_document_url ?? "")} onUploaded={(url) => updateFormation("positioning_document_url", url)} accept=".doc,.docx,.pdf" />

          <label style={s.check}>
            <input type="checkbox" checked={Boolean(formationForm.results_pending)} onChange={(event) => updateFormation("results_pending", event.target.checked)} />
            Nouvelle formation / pas encore d&apos;indicateurs de résultats
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
          <p style={s.helpText}>Ces coordonnées sont celles de l&apos;organisme de formation et seront visibles par les personnes qui consultent le dossier d&apos;inscription.</p>

          {lastCreatedFormation ? (
            <div style={s.successBox}>
              <strong>Formation créée : {lastCreatedFormation.title}</strong>
              {lastCreatedFormation.public_registration_token ? (
                <>
                  <span style={s.label}>Lien d&apos;inscription</span>
                  <input style={s.input} readOnly value={getRegistrationUrl(lastCreatedFormation.public_registration_token)} />
                  <button type="button" className="btn-ghost" onClick={() => void copyRegistrationLink(lastCreatedFormation.public_registration_token)}><span>Copier le lien</span></button>
                </>
              ) : <span>Le lien d&apos;inscription est en cours de préparation.</span>}
              <div style={s.actions}>
                <Link href={`/client/daily/sessions?formation=${lastCreatedFormation.id}`} className="btn-ink"><span>Créer une session</span></Link>
                <button type="button" className="btn-ghost" onClick={() => { setLastCreatedFormationId(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}><span>Créer une autre formation</span></button>
                <Link href="/client/daily" className="btn-ghost"><span>Créer la session plus tard</span></Link>
              </div>
            </div>
          ) : null}

          <div style={s.actions}>
            <div style={s.actionMessages}>
              {message ? <p style={s.notice}>{message}</p> : null}
              {error ? <p style={s.error}>{error}</p> : null}
            </div>
            <button className="btn-ink" type="submit" disabled={saving}>
              <span>{saving ? "Enregistrement..." : editingFormationId ? "Enregistrer la modification" : "Créer la formation"}</span>
            </button>
            {editingFormationId ? <button type="button" className="btn-ghost" onClick={() => { setEditingFormationId(""); setFormationForm({ ...emptyFormation, contact_email: email ?? "" }); }}><span>Annuler</span></button> : null}
          </div>
        </form>

        <section style={s.grid}>
          <ListCard title="Formations" empty="Aucune formation Daily pour le moment.">
            {formations.map((formation) => (
              <article key={formation.id} style={s.listItem}>
                <strong>{formation.title}</strong>
                <span>{formatStatus(formation.status)} - v{formation.version ?? 1}</span>
                <p>{formation.duration_hours} h / {formation.duration_days} j - {formation.modality}</p>
                {formation.public_registration_token ? (
                  <div style={s.linkBox}>
                    <strong>Lien d&apos;inscription</strong>
                    <input style={s.input} readOnly value={getRegistrationUrl(formation.public_registration_token)} />
                    <p style={s.muted}>Retrouvez ici le lien public de cette formation à tout moment.</p>
                    {formation.spontaneous_registration_task_status === "to_attach" ? <p style={s.warning}>Une demande reçue doit être rattachée à une session.</p> : null}
                    <div style={s.actions}>
                      <button type="button" className="btn-ghost" onClick={() => void copyRegistrationLink(formation.public_registration_token)}><span>Copier le lien</span></button>
                      <Link href={`/client/daily/sessions?formation=${formation.id}`} className="btn-ink"><span>Créer une session</span></Link>
                    </div>
                  </div>
                ) : null}
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
                <p>{(session.individual_beneficiaries ?? []).length} apprenant(s) individuel(s) · {(session.companies ?? []).length} entreprise(s)</p>
                <div style={s.linkBox}>
                  <strong>Timeline globale</strong>
                  {sessionTimeline(session).map(([label, status]) => <span key={label}>{label} : {status}</span>)}
                </div>
                {session.registration_token ? (
                  <div style={s.linkBox}>
                    <strong>Lien d&apos;inscription de la session</strong>
                    <input style={s.input} readOnly value={getRegistrationUrl(session.registration_token)} />
                    <button type="button" className="btn-ghost" onClick={() => void copyRegistrationLink(session.registration_token)}><span>Copier le lien</span></button>
                  </div>
                ) : null}
                {session.daily_registration_recipients?.length ? (
                  <div style={s.linkBox}>
                    <strong>Suivi des dossiers envoyés</strong>
                    {session.daily_registration_recipients.map((recipient) => <span key={recipient.id}>{recipient.recipient_name || recipient.recipient_email || "Destinataire"} : {formatRecipientStatus(recipient.status)}</span>)}
                  </div>
                ) : null}
                <div style={s.linkBox}>
                  <strong>Conventions</strong>
                  {session.daily_conventions?.length ? session.daily_conventions.map((convention) => (
                    <div key={convention.id} style={s.signatureMiniBox}>
                      <a href={withAssistanceToken(`/api/client/daily/conventions/download?id=${convention.id}`)} target="_blank" rel="noreferrer" style={s.inlineLink}>
                        {convention.recipient_type === "company" ? "Entreprise" : "Bénéficiaire"} {convention.company_name || convention.recipient_name || "Daily"} - v{convention.version} - {formatConventionSignatureStatus(convention)}
                      </a>
                    </div>
                  )) : <span>Non générée.</span>}
                </div>
                <div style={s.linkBox}>
                  <strong>Convocations</strong>
                  {session.daily_convocations?.length ? session.daily_convocations.map((convocation) => (
                    <a key={convocation.id} href={withAssistanceToken(`/api/client/daily/convocations/download?id=${convocation.id}`)} target="_blank" rel="noreferrer" style={s.inlineLink}>
                      {convocation.recipient_type === "trainer" ? "Formateur" : convocation.recipient_type === "company" ? "Entreprise" : "Bénéficiaire"} {convocation.company_name || convocation.recipient_name || "Daily"} - v{convocation.version}
                    </a>
                  )) : <span>À venir après préparation.</span>}
                </div>
                {session.daily_portal_access_tokens?.length ? (
                  <div style={s.linkBox}>
                    <strong>Portails</strong>
                    {session.daily_portal_access_tokens.map((portal) => (
                      <span key={portal.id}>{portal.portal_type === "learner" ? "Apprenant" : portal.portal_type === "enterprise" ? "Entreprise" : "Formateur"} {portal.entity_name || portal.entity_email || ""} : <a href={portalUrl(portal.portal_type, portal.token)} target="_blank" rel="noreferrer" style={s.inlineLink}>ouvrir</a></span>
                    ))}
                  </div>
                ) : null}
                {session.adaptation_needed ? <p style={s.warning}>Une adaptation ou un point d&apos;attention a été signalé.</p> : null}
                <div style={s.actions}>
                  <Link href={`/client/daily/sessions?session=${session.id}`} className="btn-ghost"><span>Modifier</span></Link>
                  <button type="button" className="btn-ghost" onClick={() => void archiveSession(session.id)}><span>Archiver</span></button>
                </div>
              </article>
            ))}
          </ListCard>
        </section>
      </div>
    </main>
  );
}

function Input({ label, helpText, value, onChange, type = "text", required = false }: { label: string; helpText?: string; value: FormValue | PositioningQuestion[] | string[]; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <div style={s.field}>{fieldLabel(label, helpText)}<input style={s.input} type={type} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} required={required} /></div>;
}

function Textarea({ label, helpText, value, onChange, required = false, rows = 3, placeholder = "" }: { label: string; helpText?: string; value: FormValue | PositioningQuestion[] | string[]; onChange: (value: string) => void; required?: boolean; rows?: number; placeholder?: string }) {
  return <div style={s.field}>{fieldLabel(label, helpText)}<textarea style={{ ...s.input, minHeight: rows * 34, paddingTop: 10 }} value={String(value ?? "")} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} required={required} /></div>;
}

function FileUploadField({ label, kind, value, onUploaded, accept }: { label: string; kind: string; value: string; onUploaded: (url: string) => void; accept: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setUploadError("");
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    const response = await assistanceFetch("/api/client/daily/uploads", { method: "POST", body });
    const data = await response.json().catch(() => null);
    setUploading(false);
    if (!response.ok) {
      setUploadError(data?.error ?? "Import impossible.");
      return;
    }
    onUploaded(String(data.url ?? ""));
  }

  return (
    <div style={s.field}>
      <span style={s.label}>{label}</span>
      <input ref={inputRef} type="file" accept={accept} disabled={uploading} style={{ display: "none" }} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      <button type="button" style={s.fileButton} disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? "Import en cours…" : "Choisir un fichier"}</button>
      {!uploading && value ? <span style={s.uploaded}>Document importé ✓</span> : null}
      {uploadError ? <span style={s.warning}>{uploadError}</span> : null}
    </div>
  );
}

function PositioningQuestionnaireEditor({ mode, questions, onModeChange, onQuestionsChange }: { mode: string; questions: PositioningQuestion[]; onModeChange: (value: string) => void; onQuestionsChange: (questions: PositioningQuestion[]) => void }) {
  function reorder(nextQuestions: PositioningQuestion[]) {
    onQuestionsChange(nextQuestions.map((question, index) => ({ ...question, order: index + 1 })));
  }
  function addQuestion() {
    reorder([...questions, { id: `question_${Date.now()}`, label: "", help_text: "", required: true, type: "free_text", options: [], order: questions.length + 1 }]);
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
    [next[index], next[target]] = [next[target], next[index]];
    reorder(next);
  }
  function duplicateQuestion(index: number) {
    const source = questions[index];
    reorder([...questions.slice(0, index + 1), { ...source, id: `question_${Date.now()}`, label: `${source.label} - copie` }, ...questions.slice(index + 1)]);
  }

  return (
    <section style={s.dynamic}>
      <div style={s.dynamicHead}>
        <strong>Questionnaire de positionnement</strong>
        {mode === "selen" ? <button type="button" className="btn-ghost" onClick={addQuestion}><span>Ajouter une question</span></button> : null}
      </div>
      <label style={s.check}><input type="radio" name="positioning_mode_choice" checked={mode === "selen"} onChange={() => onModeChange("selen")} /> Je veux intégrer le positionnement dans Selen</label>
      <label style={s.check}><input type="radio" name="positioning_mode_choice" checked={mode !== "selen"} onChange={() => onModeChange("off_platform")} /> Je ferai le positionnement hors plateforme</label>
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
              <Input label="Intitulé de la question" value={question.label} onChange={(value) => updateQuestion(index, { label: value })} required />
              <Input label="Aide / précision facultative" value={question.help_text} onChange={(value) => updateQuestion(index, { help_text: value })} />
              <div style={s.twoCols}>
                <label style={s.field}>
                  <span style={s.label}>Type de réponse</span>
                  <select style={s.input} value={question.type} onChange={(event) => updateQuestion(index, { type: event.target.value as PositioningQuestion["type"], options: [] })}>
                    <option value="single_choice">Choix unique</option><option value="multiple_choice">Choix multiple</option><option value="free_text">Texte libre</option><option value="scale_1_5">Échelle de 1 à 5</option>
                  </select>
                </label>
                <label style={s.check}><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, { required: event.target.checked })} /> Question obligatoire</label>
              </div>
              {["single_choice", "multiple_choice"].includes(question.type) ? <Textarea label="Options de réponse, une par ligne" value={question.options.join("\n")} onChange={(value) => updateQuestion(index, { options: value.split("\n") })} rows={3} /> : null}
            </article>
          ))}
          {questions.length === 0 ? <p style={s.muted}>Ajoutez au moins une question avant l&apos;envoi en validation.</p> : null}
        </div>
      ) : <p style={s.notice}>Le positionnement restera réalisé hors plateforme.</p>}
    </section>
  );
}

function ListCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section style={s.card}><p className="gazette-label">Suivi</p><h2 style={s.cardTitle}>{title}</h2>{hasChildren ? children : <p style={s.muted}>{empty}</p>}</section>;
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1220, margin: "0 auto", padding: "2rem 1.5rem 4rem" },
  compactHeading: { marginBottom: "1rem", display: "grid", gap: "0.25rem" },
  homeLink: { display: "inline-flex", marginBottom: "1rem", color: "var(--rust)", fontWeight: 800, textDecoration: "none" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "1rem", marginTop: "1rem", marginBottom: "1rem" },
  card: { background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", padding: "1.2rem", display: "grid", gap: "0.9rem", marginBottom: "1rem" },
  cardTitle: { color: "var(--ink)", margin: 0 },
  field: { display: "grid", gap: "0.35rem" },
  label: { color: "var(--ink)", fontWeight: 700, fontSize: "0.92rem" },
  input: { width: "100%", border: "1px solid rgba(178,138,98,0.55)", background: "rgba(255,250,239,0.82)", color: "var(--ink)", padding: "0.7rem", fontSize: "0.95rem", boxSizing: "border-box" },
  twoCols: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.7rem" },
  threeCols: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.7rem" },
  check: { display: "flex", gap: "0.55rem", alignItems: "center", color: "var(--ink-soft)", lineHeight: 1.4 },
  actions: { display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" },
  actionMessages: { flex: "1 1 300px" },
  notice: { border: "1px solid rgba(106,138,74,0.45)", background: "rgba(106,138,74,0.08)", color: "#496532", padding: "0.75rem", lineHeight: 1.5 },
  warning: { color: "var(--rust)", fontWeight: 700, margin: 0 },
  error: { border: "1px solid var(--rust)", background: "rgba(138,75,36,0.08)", color: "var(--rust)", padding: "0.75rem", lineHeight: 1.5 },
  muted: { color: "var(--ink-soft)", lineHeight: 1.6 },
  helpText: { color: "var(--ink-soft)", lineHeight: 1.5, margin: "-0.35rem 0 0.25rem", fontSize: "0.9rem" },
  helpBubble: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", border: "1px solid var(--sepia-mid)", color: "var(--rust)", fontSize: 12, fontWeight: 800, marginLeft: 6 },
  dynamic: { display: "grid", gap: "0.6rem", border: "1px solid rgba(178,138,98,0.28)", padding: "0.8rem" },
  dynamicHead: { display: "flex", justifyContent: "space-between", gap: "0.6rem", alignItems: "center", color: "var(--ink)", flexWrap: "wrap" },
  objectiveRow: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.6rem", alignItems: "end" },
  uploaded: { color: "#496532", fontWeight: 700 },
  fileButton: { justifySelf: "start", border: "1px solid var(--rust)", background: "rgba(255,250,239,0.9)", color: "var(--rust)", padding: "0.65rem 1rem", fontSize: "0.95rem", fontWeight: 800, cursor: "pointer", borderRadius: 4 },
  companyBox: { display: "grid", gap: "0.55rem", border: "1px solid rgba(178,138,98,0.22)", padding: "0.7rem", background: "rgba(255,250,239,0.42)" },
  linkBox: { display: "grid", gap: "0.5rem", border: "1px solid rgba(106,138,74,0.35)", background: "rgba(106,138,74,0.06)", padding: "0.75rem" },
  successBox: { display: "grid", gap: "0.7rem", border: "2px solid rgba(106,138,74,0.55)", background: "rgba(106,138,74,0.08)", padding: "1rem" },
  signatureMiniBox: { display: "grid", gap: "0.3rem", borderTop: "1px solid rgba(106,138,74,0.22)", paddingTop: "0.45rem" },
  inlineLink: { color: "var(--rust)", fontWeight: 800, textDecoration: "none" },
  downloadLink: { display: "inline-flex", alignItems: "center", gap: "0.45rem", width: "fit-content", color: "var(--rust)", fontWeight: 800, textDecoration: "none", border: "1px solid rgba(138,75,36,0.45)", padding: "0.6rem 0.8rem" },
  listItem: { display: "grid", gap: "0.35rem", border: "1px solid rgba(178,138,98,0.32)", background: "rgba(248,239,223,0.45)", padding: "0.9rem", color: "var(--ink-soft)" },
};
