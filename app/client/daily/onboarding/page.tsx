"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ClientSupportBar from "@/components/ClientSupportBar";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Trainer = {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  cv_url: string;
  cv_pending: boolean;
  trainer_access_planned: boolean;
  is_manager: boolean;
};
type SupportTask = { key?: string; label?: string; status?: string };
type OnboardingForm = {
  status: "not_started" | "in_progress" | "completed";
  current_step: number;
  setup_choice: "self" | "video" | "";
  organisation_name: string;
  siret: string;
  nda_number: string;
  address: string;
  manager_first_name: string;
  manager_last_name: string;
  qualiopi_status: "yes" | "no" | "planned" | "";
  insee_document_pending: boolean;
  insee_document_url: string;
  qualiopi_certificate_pending: boolean;
  qualiopi_certificate_url: string;
  nda_or_bpf_document_pending: boolean;
  nda_or_bpf_document_url: string;
  first_nda_year: boolean;
  welcome_booklet_pending: boolean;
  welcome_booklet_url: string;
  platform_contact_first_name: string;
  platform_contact_last_name: string;
  platform_contact_role: string;
  platform_contact_email: string;
  organisation_logo_url: string;
  platform_contact_is_manager: boolean;
};

const emptyForm: OnboardingForm = {
  status: "not_started",
  current_step: 1,
  setup_choice: "",
  organisation_name: "",
  siret: "",
  nda_number: "",
  address: "",
  manager_first_name: "",
  manager_last_name: "",
  qualiopi_status: "",
  insee_document_pending: false,
  insee_document_url: "",
  qualiopi_certificate_pending: false,
  qualiopi_certificate_url: "",
  nda_or_bpf_document_pending: false,
  nda_or_bpf_document_url: "",
  first_nda_year: false,
  welcome_booklet_pending: false,
  welcome_booklet_url: "",
  platform_contact_first_name: "",
  platform_contact_last_name: "",
  platform_contact_role: "",
  platform_contact_email: "",
  organisation_logo_url: "",
  platform_contact_is_manager: false,
};

const blankTrainer: Trainer = {
  first_name: "",
  last_name: "",
  email: "",
  cv_url: "",
  cv_pending: false,
  trainer_access_planned: true,
  is_manager: false,
};

function statusLabel(status: SaveStatus) {
  if (status === "saving") return "Enregistrement...";
  if (status === "saved") return "Enregistré";
  if (status === "error") return "Erreur d'enregistrement";
  return "Prêt";
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isFirstNdaYear(supportTasks: unknown) {
  return Array.isArray(supportTasks) && (supportTasks as SupportTask[]).some(
    (task) => task?.key === "bpf_first_nda_year" && task?.status === "not_applicable",
  );
}

export default function DailyOnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState<OnboardingForm>(emptyForm);
  const [trainers, setTrainers] = useState<Trainer[]>([{ ...blankTrainer }]);
  const loadedRef = useRef(false);

  const save = useCallback(async (nextForm: OnboardingForm, nextTrainers: Trainer[]) => {
    setSaveStatus("saving");
    setError("");
    const res = await assistanceFetch("/api/client/daily/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...nextForm,
        trainers: nextTrainers,
        document_templates: [],
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setSaveStatus("error");
      setError(data?.error ?? "Enregistrement impossible.");
      return false;
    }
    setSaveStatus("saved");
    return true;
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
        if (cancelled) return;
        setEmail(data.user.email ?? null);

        const res = await assistanceFetch("/api/client/daily/onboarding", { cache: "no-store" });
        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          console.warn("Selen Daily onboarding : ouverture impossible.", {
            status: res.status,
            error: payload?.error,
          });
          if (!cancelled) {
            setError(
              payload?.error ??
                "Impossible d'ouvrir le paramétrage Selen Daily. Revenez au bureau Selen ou contactez Selen.",
            );
            setForm((current) => ({
              ...current,
              platform_contact_email: data.user?.email ?? "",
            }));
          }
          return;
        }

        if (payload?.onboarding) {
          if (!cancelled) {
            setForm({
              ...emptyForm,
              ...payload.onboarding,
              setup_choice: payload.onboarding.setup_choice ?? "",
              qualiopi_status: payload.onboarding.qualiopi_status ?? "",
              first_nda_year: isFirstNdaYear(payload.onboarding.support_tasks),
              platform_contact_email: payload.onboarding.platform_contact_email ?? data.user.email ?? "",
              organisation_logo_url: payload.onboarding.organisation_logo_url ?? "",
              platform_contact_is_manager:
                payload.onboarding.platform_contact_first_name === payload.onboarding.manager_first_name &&
                payload.onboarding.platform_contact_last_name === payload.onboarding.manager_last_name &&
                payload.onboarding.platform_contact_email === data.user.email,
            });
          }
        }

        if (!cancelled && payload?.trainers?.length) {
          setTrainers(payload.trainers.map((trainer: Trainer) => ({
            ...blankTrainer,
            ...trainer,
            cv_url: trainer.cv_url ?? "",
            cv_pending: Boolean(trainer.cv_pending),
            is_manager: false,
          })));
        }
        loadedRef.current = true;
      } catch (bootError) {
        console.error("Selen Daily onboarding : chargement impossible.", bootError);
        if (!cancelled) {
          setError(
            bootError instanceof Error
              ? bootError.message
              : "Impossible d'ouvrir le paramétrage Selen Daily.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = window.setTimeout(() => {
      void save({ ...form, status: form.status === "completed" ? "completed" : "in_progress" }, trainers);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [form, save, trainers]);

  function update<K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function goTo(step: number) {
    const next = { ...form, current_step: step, status: "in_progress" as const };
    setForm(next);
    await save(next, trainers);
  }

  async function finish() {
    const next = { ...form, current_step: 7, status: "completed" as const };
    setForm(next);
    const ok = await save(next, trainers);
    if (ok) router.push("/client/daily");
  }

  async function requestAssistance() {
    const next = { ...form, setup_choice: "video" as const, status: "in_progress" as const };
    setForm(next);
    await save(next, trainers);
  }

  function updateTrainer(index: number, patch: Partial<Trainer>) {
    setTrainers((current) =>
      current.map((trainer, trainerIndex) =>
        trainerIndex === index ? { ...trainer, ...patch } : trainer,
      ),
    );
  }

  if (loading) {
    return (
      <main className="gazette-paper" style={s.page}>
        <p style={s.muted}>Ouverture du grimoire Daily...</p>
      </main>
    );
  }

  if (error && !loadedRef.current) {
    return (
      <main className="gazette-paper" style={{ minHeight: "100vh" }}>
        <ClientSupportBar email={email} context="le paramétrage Selen Daily" />
        <div style={s.page}>
          <section style={s.card}>
            <p className="gazette-label">Selen Daily</p>
            <h1 style={s.title}>Paramétrage indisponible</h1>
            <p style={s.error}>{error}</p>
            <button type="button" className="btn-ink" onClick={() => router.push("/client")}>
              <span>Retour au bureau Selen</span>
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <ClientSupportBar email={email} context="le paramétrage Selen Daily" />
      <div style={s.page}>
        <div style={s.compactHeading}>
          <p className="gazette-label">Selen Daily</p>
          <h1 style={s.title}>Paramétrage initial</h1>
          <p style={saveStatus === "error" ? s.saveError : s.saveStatus}>{statusLabel(saveStatus)}</p>
        </div>

        {error ? <p style={s.error}>{error}</p> : null}

        <nav style={s.steps}>
          {[1, 2, 3, 4, 5, 6, 7].map((step) => (
            <button key={step} type="button" onClick={() => void goTo(step)} style={step === form.current_step ? s.stepActive : s.step}>
              {step}
            </button>
          ))}
        </nav>

        <section style={s.card}>
          {form.current_step === 1 ? (
            <div style={s.stack}>
              <p className="gazette-label">Étape 1</p>
              <h2 style={s.title}>On commence doucement</h2>
              <p style={s.muted}>Choisissez comment vous préférez paramétrer votre espace. Vous pourrez revenir plus tard, chaque champ est sauvegardé automatiquement.</p>
              <div style={s.choiceGrid}>
                <button type="button" style={form.setup_choice === "self" ? s.choiceOn : s.choice} onClick={() => update("setup_choice", "self")}>Je paramètre moi-même</button>
                <button type="button" style={form.setup_choice === "video" ? s.choiceOn : s.choice} onClick={() => update("setup_choice", "video")}>Je souhaite être accompagné</button>
              </div>
              {form.setup_choice === "video" ? (
                <div style={s.appointmentBox}>
                  <strong>{"Préparons d'abord votre rendez-vous"}</strong>
                  <p>{"Commencez par transmettre les documents demandés dans les étapes suivantes. Selen pourra ainsi préremplir au maximum votre espace avant l'échange et limiter les saisies manuelles."}</p>
                  <p style={{ margin: 0 }}>Le rendez-vous de mise en place pourra être planifié au minimum 24 h après la transmission des documents nécessaires.</p>
                  <button type="button" className="btn-ink" onClick={() => void goTo(2)}><span>Commencer par transmettre mes informations</span></button>
                  <a href="/support" style={s.inlineLink}>Contacter Selen si besoin</a>
                </div>
              ) : null}
            </div>
          ) : null}

          {form.current_step === 2 ? (
            <div style={s.stack}>
              <p className="gazette-label">Étape 2</p>
              <h2 style={s.title}>Informations de l&apos;organisme</h2>
              <Input label="Nom de l&apos;organisme de formation" value={form.organisation_name} onChange={(value) => update("organisation_name", value)} />
              <div style={s.field}>
                <Input label="Numéro NDA" value={form.nda_number} onChange={(value) => update("nda_number", value)} />
                <p style={s.fieldHint}>Si votre organisme possède déjà un numéro de déclaration d&apos;activité, il doit être renseigné ici.</p>
              </div>
              <FileUploadField label="Logo de l'organisme" kind="organisation_logo" accept=".png,.jpg,.jpeg,.webp" value={form.organisation_logo_url} onUploaded={(url) => update("organisation_logo_url", url)} />
              <div style={s.twoCols}>
                <Input label="Prénom du dirigeant" value={form.manager_first_name} onChange={(value) => update("manager_first_name", value)} />
                <Input label="Nom du dirigeant" value={form.manager_last_name} onChange={(value) => update("manager_last_name", value)} />
              </div>
              <label style={s.label}>Qualiopi</label>
              <select style={s.input} value={form.qualiopi_status} onChange={(event) => update("qualiopi_status", event.target.value as OnboardingForm["qualiopi_status"])}>
                <option value="">Sélectionner</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
                <option value="planned">Prévu par la suite</option>
              </select>
              {form.qualiopi_status === "planned" ? <p style={s.notice}>{"Aucun souci. Quand le moment viendra, Selen pourra vous aider à préparer le chemin vers Qualiopi."}</p> : null}
              <div style={s.stackSmall}>
                <FileUploadField label="Avis de situation INSEE (PDF)" kind="insee_notice" accept=".pdf" value={form.insee_document_url} onUploaded={(url) => { update("insee_document_url", url); update("insee_document_pending", false); }} />
                <p style={s.muted}>Le SIRET et l&apos;adresse seront repris depuis cet avis puis vérifiés avant validation.</p>
                <label style={s.check}><input type="checkbox" checked={form.insee_document_pending} onChange={(event) => update("insee_document_pending", event.target.checked)} /> Avis INSEE à fournir plus tard</label>
                {form.qualiopi_status === "yes" ? <><FileUploadField label="Certificat Qualiopi (PDF)" kind="qualiopi_certificate" accept=".pdf" value={form.qualiopi_certificate_url} onUploaded={(url) => { update("qualiopi_certificate_url", url); update("qualiopi_certificate_pending", false); }} /><label style={s.check}><input type="checkbox" checked={form.qualiopi_certificate_pending} onChange={(event) => update("qualiopi_certificate_pending", event.target.checked)} /> Certificat Qualiopi à fournir plus tard</label></> : null}
                <label style={s.check}>
                  <input
                    type="checkbox"
                    checked={form.first_nda_year}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      first_nda_year: event.target.checked,
                      nda_or_bpf_document_pending: event.target.checked ? false : current.nda_or_bpf_document_pending,
                      nda_or_bpf_document_url: event.target.checked ? "" : current.nda_or_bpf_document_url,
                    }))}
                  />
                  C&apos;est ma première année de NDA
                </label>
                {form.first_nda_year ? (
                  <p style={s.notice}>Aucun BPF n&apos;est demandé pour cette première année de NDA.</p>
                ) : (
                  <>
                    <FileUploadField label="Dernier BPF (PDF)" kind="bpf" accept=".pdf" value={form.nda_or_bpf_document_url} onUploaded={(url) => { update("nda_or_bpf_document_url", url); update("nda_or_bpf_document_pending", false); }} />
                    <label style={s.check}><input type="checkbox" checked={form.nda_or_bpf_document_pending} onChange={(event) => update("nda_or_bpf_document_pending", event.target.checked)} /> BPF à fournir plus tard</label>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {form.current_step === 3 ? <TextStep title="Le fil de l'eau" text="Plus vous utilisez Selen au fil de l'eau, moins vous courez après les preuves au moment de l'audit." /> : null}

          {form.current_step === 4 ? (
            <div style={s.stack}>
              <p className="gazette-label">Étape 4</p>
              <h2 style={s.title}>Formateurs</h2>
              <p style={s.muted}>{"Un accès formateur sera créé pour chaque formateur afin qu'il puisse consulter les informations utiles à ses sessions : dates, participants, besoins d'adaptation et documents de préparation."}</p>
              {trainers.map((trainer, index) => (
                <div key={trainer.id ?? index} style={s.trainer}>
                  <label style={s.check}><input type="checkbox" checked={trainer.is_manager} onChange={(event) => updateTrainer(index, event.target.checked ? { is_manager: true, first_name: form.manager_first_name, last_name: form.manager_last_name, email: email ?? form.platform_contact_email } : { is_manager: false })} /> Le formateur est également le dirigeant de l&apos;organisme</label>
                  <div style={s.twoCols}>
                    <Input label="Prénom" value={trainer.first_name} onChange={(value) => updateTrainer(index, { first_name: value })} disabled={trainer.is_manager} />
                    <Input label="Nom" value={trainer.last_name} onChange={(value) => updateTrainer(index, { last_name: value })} disabled={trainer.is_manager} />
                  </div>
                  <Input label="Email" value={trainer.email} onChange={(value) => updateTrainer(index, { email: value })} disabled={trainer.is_manager} />
                  <FileUploadField label="CV du formateur (Word ou PDF)" kind="trainer_cv" slot={`trainer-${index + 1}`} accept=".doc,.docx,.pdf" value={trainer.cv_url} onUploaded={(url) => updateTrainer(index, { cv_url: url, cv_pending: false })} />
                  <label style={s.check}><input type="checkbox" checked={trainer.cv_pending} onChange={(event) => updateTrainer(index, { cv_pending: event.target.checked })} /> CV à fournir plus tard</label>
                  <p style={s.muted}>Le formateur pourra consulter ses sessions, les informations utiles sur les participants et les adaptations prévues, accéder aux documents de préparation et renseigner son suivi. Il ne pourra pas administrer l&apos;organisme, ses utilisateurs ni les autres formateurs. Son accès ne sera pas envoyé immédiatement : après vérification de son profil par Selen, il recevra son invitation par email avant sa première session affectée.</p>
                </div>
              ))}
              <button type="button" style={s.outlineButton} onClick={() => setTrainers((current) => [...current, { ...blankTrainer }])}>
                Ajouter un formateur
              </button>
            </div>
          ) : null}

          {form.current_step === 5 ? <TextStep title="Les bons liens, au bon moment" text="Ces informations permettront de préparer les bons documents, d&apos;envoyer les bons liens, et d&apos;éviter les oublis." /> : null}

          {form.current_step === 6 ? (
            <div style={s.stack}>
              <p className="gazette-label">Étape 6</p>
              <h2 style={s.title}>Interlocuteur plateforme</h2>
              <p style={s.muted}>Indiquez ici la personne qui sera la plus amenée à administrer l&apos;organisme et ses activités depuis Selen.</p>
              <label style={s.check}><input type="checkbox" checked={form.platform_contact_is_manager} onChange={(event) => setForm((current) => event.target.checked ? { ...current, platform_contact_is_manager: true, platform_contact_first_name: current.manager_first_name, platform_contact_last_name: current.manager_last_name, platform_contact_email: email ?? current.platform_contact_email } : { ...current, platform_contact_is_manager: false })} /> L&apos;interlocuteur plateforme est le dirigeant</label>
              <div style={s.twoCols}>
                <Input label="Prénom" value={form.platform_contact_first_name} onChange={(value) => update("platform_contact_first_name", value)} disabled={form.platform_contact_is_manager} />
                <Input label="Nom" value={form.platform_contact_last_name} onChange={(value) => update("platform_contact_last_name", value)} disabled={form.platform_contact_is_manager} />
              </div>
              <Input label="Fonction / qualité" value={form.platform_contact_role} onChange={(value) => update("platform_contact_role", value)} />
              <Input label="Email de contact" value={form.platform_contact_email} onChange={(value) => update("platform_contact_email", value)} disabled={form.platform_contact_is_manager} />
            </div>
          ) : null}

          {form.current_step === 7 ? (
            <div style={s.stack}>
              <p className="gazette-label">Confirmation</p>
              <h2 style={s.title}>Votre espace Daily est prêt à démarrer</h2>
              <p style={s.muted}>Vous pourrez modifier ces informations plus tard depuis les paramètres Daily. La prochaine étape utile : créer votre première formation.</p>
              <button type="button" className="btn-ink" onClick={() => void finish()}><span>Terminer et créer ma première formation</span></button>
            </div>
          ) : null}

          {form.current_step > 1 && form.setup_choice === "self" ? (
            <div style={s.assistanceBox}>
              <div>
                <strong>Besoin d&apos;être accompagné finalement&nbsp;?</strong>
                <p style={s.assistanceText}>Vous pouvez changer d&apos;avis à tout moment. Les informations déjà saisies sont conservées et aideront Selen à préparer le rendez-vous.</p>
              </div>
              <button type="button" className="btn-ghost" onClick={() => void requestAssistance()}><span>Je souhaite être accompagné</span></button>
            </div>
          ) : null}

          {form.current_step > 1 && form.setup_choice === "video" ? (
            <div style={s.appointmentBox}>
              <strong>Demande d&apos;accompagnement prise en compte</strong>
              <p style={{ margin: 0 }}>Continuez à transmettre les informations et documents disponibles. Le rendez-vous pourra être planifié au minimum 24 h après leur transmission.</p>
              <a href="/support" style={s.inlineLink}>Contacter Selen si besoin</a>
            </div>
          ) : null}

          <div style={s.actions}>
            <button type="button" className="btn-ghost" disabled={form.current_step <= 1} onClick={() => void goTo(Math.max(1, form.current_step - 1))}><span>Précédent</span></button>
            {form.current_step < 7 ? <button type="button" className="btn-ink" onClick={() => void goTo(Math.min(7, form.current_step + 1))}><span>Continuer</span></button> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function TextStep({ title, text: value }: { title: string; text: string }) {
  return (
    <div style={s.stack}>
      <p className="gazette-label">Respiration</p>
      <h2 style={s.title}>{title}</h2>
      <p style={s.quote}>{value}</p>
    </div>
  );
}

function Input({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label style={s.field}>
      <span style={s.label}>{label}</span>
      <input style={s.input} value={text(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function FileUploadField({ label, kind, slot = "principal", value, onUploaded, accept }: { label: string; kind: string; slot?: string; value: string; onUploaded: (url: string) => void; accept: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setUploadError("");
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    body.set("slot", slot);
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
      <input ref={inputRef} type="file" accept={accept} disabled={uploading} style={s.fileInput} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      <button type="button" style={s.fileButton} disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? "Import en cours…" : "Choisir un fichier"}</button>
      {!uploading && value ? <span style={s.uploaded}>Document importé ✓</span> : null}
      {uploadError ? <span style={s.saveError}>{uploadError}</span> : null}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 980, margin: "0 auto", padding: "2rem 1.5rem 4rem" },
  compactHeading: { marginBottom: "1rem", display: "grid", gap: "0.25rem" },
  hero: { padding: "2rem", marginBottom: "1rem" },
  heroTitle: { color: "var(--parchment)", marginBottom: "0.5rem" },
  heroText: { color: "var(--sepia-mid)", lineHeight: 1.65, maxWidth: 720 },
  saveStatus: { color: "#6a8a4a", fontWeight: 800, marginTop: "0.8rem" },
  saveError: { color: "var(--rust)", fontWeight: 800, marginTop: "0.8rem" },
  error: { border: "1px solid var(--rust)", background: "rgba(138,75,36,0.08)", color: "var(--rust)", padding: "0.75rem" },
  steps: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem" },
  step: { width: 34, height: 34, borderRadius: 999, border: "1px solid var(--sepia-mid)", background: "rgba(255,255,255,0.2)", color: "var(--ink)" },
  stepActive: { width: 34, height: 34, borderRadius: 999, border: "1px solid var(--rust)", background: "var(--rust)", color: "var(--parchment)", fontWeight: 800 },
  card: { background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", padding: "1.25rem", display: "grid", gap: "1rem" },
  stack: { display: "grid", gap: "0.9rem" },
  stackSmall: { display: "grid", gap: "0.45rem" },
  title: { margin: 0, color: "var(--ink)", fontFamily: "var(--font-serif, 'Playfair Display')" },
  muted: { color: "var(--ink-soft)", lineHeight: 1.65 },
  quote: { color: "var(--rust)", fontSize: "1.35rem", lineHeight: 1.5, fontFamily: "var(--font-serif, 'Playfair Display')", margin: 0 },
  choiceGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.8rem" },
  choice: { border: "1px solid rgba(178,138,98,0.45)", background: "rgba(255,255,255,0.35)", color: "var(--ink)", padding: "1rem", fontWeight: 800 },
  choiceOn: { border: "1px solid var(--rust)", background: "rgba(138,75,36,0.1)", color: "var(--rust)", padding: "1rem", fontWeight: 900 },
  notice: { border: "1px solid rgba(106,138,74,0.45)", background: "rgba(106,138,74,0.08)", color: "#496532", padding: "0.8rem", lineHeight: 1.55 },
  appointmentBox: { border: "1px solid rgba(106,138,74,0.45)", background: "rgba(106,138,74,0.08)", color: "var(--ink)", padding: "1rem", lineHeight: 1.55, display: "grid", gap: "0.75rem" },
  assistanceBox: { border: "1px solid rgba(178,138,98,0.45)", background: "rgba(255,255,255,0.28)", color: "var(--ink)", padding: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" },
  assistanceText: { color: "var(--ink-soft)", lineHeight: 1.55, margin: "0.35rem 0 0", maxWidth: 620 },
  inlineLink: { color: "var(--rust)", fontWeight: 800, textDecoration: "none" },
  twoCols: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.75rem" },
  field: { display: "grid", gap: "0.35rem" },
  fieldHint: { color: "var(--ink-soft)", fontSize: "0.88rem", lineHeight: 1.45, margin: 0 },
  label: { color: "var(--ink)", fontWeight: 800 },
  input: { width: "100%", border: "1px solid rgba(178,138,98,0.55)", background: "rgba(255,250,239,0.86)", color: "var(--ink)", padding: "0.7rem", fontSize: "0.95rem", boxSizing: "border-box" },
  fileInput: { display: "none" },
  fileButton: { justifySelf: "start", border: "1px solid var(--rust)", background: "rgba(255,250,239,0.9)", color: "var(--rust)", padding: "0.65rem 1rem", fontSize: "0.95rem", fontWeight: 800, cursor: "pointer", borderRadius: 4 },
  outlineButton: { justifySelf: "start", border: "1px solid var(--rust)", background: "rgba(255,250,239,0.9)", color: "var(--rust)", padding: "0.65rem 1rem", fontSize: "0.95rem", fontWeight: 800, cursor: "pointer", borderRadius: 4 },
  uploaded: { color: "#496532", fontWeight: 700 },
  check: { color: "var(--ink-soft)", display: "flex", gap: "0.5rem", alignItems: "center" },
  trainer: { display: "grid", gap: "0.7rem", border: "1px solid rgba(178,138,98,0.28)", padding: "0.85rem" },
  actions: { display: "flex", gap: "0.7rem", justifyContent: "space-between", flexWrap: "wrap", borderTop: "1px solid rgba(178,138,98,0.28)", paddingTop: "1rem" },
};
