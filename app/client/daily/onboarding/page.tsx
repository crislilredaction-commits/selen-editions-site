"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ClientSupportBar from "@/components/ClientSupportBar";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Trainer = {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  cv_pending: boolean;
  trainer_access_planned: boolean;
};
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
  qualiopi_certificate_pending: boolean;
  nda_or_bpf_document_pending: boolean;
  platform_contact_first_name: string;
  platform_contact_last_name: string;
  platform_contact_role: string;
  platform_contact_email: string;
  organisation_logo_url: string;
  convocation_template_url: string;
  convention_template_url: string;
  politique_handicap_template_url: string;
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
  qualiopi_certificate_pending: false,
  nda_or_bpf_document_pending: false,
  platform_contact_first_name: "",
  platform_contact_last_name: "",
  platform_contact_role: "",
  platform_contact_email: "",
  organisation_logo_url: "",
  convocation_template_url: "",
  convention_template_url: "",
  politique_handicap_template_url: "",
};

const blankTrainer: Trainer = {
  first_name: "",
  last_name: "",
  email: "",
  cv_pending: false,
  trainer_access_planned: false,
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
    const res = await fetch("/api/client/daily/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...nextForm,
        trainers: nextTrainers,
        document_templates: [
          { document_type: "convocation", template_name: "Modele convocation client", public_url: nextForm.convocation_template_url },
          { document_type: "convention", template_name: "Modele convention client", public_url: nextForm.convention_template_url },
          { document_type: "politique_handicap", template_name: "Politique handicap client", public_url: nextForm.politique_handicap_template_url },
        ],
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
    async function boot() {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) {
        router.replace("/client/login");
        return;
      }
      setEmail(data.user.email ?? null);

      const res = await fetch("/api/client/daily/onboarding", { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (res.ok && payload?.onboarding) {
        const templates = Array.isArray(payload.documentTemplates) ? payload.documentTemplates : [];
        const templateUrl = (type: string) =>
          text(templates.find((template: Record<string, unknown>) => template.document_type === type)?.public_url);
        setForm({
          ...emptyForm,
          ...payload.onboarding,
          setup_choice: payload.onboarding.setup_choice ?? "",
          qualiopi_status: payload.onboarding.qualiopi_status ?? "",
          platform_contact_email: payload.onboarding.platform_contact_email ?? data.user.email ?? "",
          organisation_logo_url: payload.onboarding.organisation_logo_url ?? "",
          convocation_template_url: templateUrl("convocation"),
          convention_template_url: templateUrl("convention"),
          politique_handicap_template_url: templateUrl("politique_handicap"),
        });
      } else {
        setForm((current) => ({
          ...current,
          platform_contact_email: data.user?.email ?? "",
        }));
      }
      if (payload?.trainers?.length) setTrainers(payload.trainers);
      loadedRef.current = true;
      setLoading(false);
    }
    void boot();
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

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <ClientSupportBar email={email} context="le paramétrage Selen Daily" />
      <div style={s.page}>
        <header className="gazette-cta" style={s.hero}>
          <p className="gazette-label">Bienvenue dans Selen Daily</p>
          <h1 className="gazette-hero-title" style={s.heroTitle}>
            Paramétrage initial
          </h1>
          <p style={s.heroText}>
            {"On va préparer ton espace en quelques étapes pour que tes formations, documents et suivis soient bien rangés dès le départ."}
          </p>
          <p style={saveStatus === "error" ? s.saveError : s.saveStatus}>
            {statusLabel(saveStatus)}
          </p>
        </header>

        {error ? <p style={s.error}>{error}</p> : null}

        <nav style={s.steps}>
          {[1, 2, 3, 4, 5, 6, 7].map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => void goTo(step)}
              style={step === form.current_step ? s.stepActive : s.step}
            >
              {step}
            </button>
          ))}
        </nav>

        <section style={s.card}>
          {form.current_step === 1 ? (
            <div style={s.stack}>
              <p className="gazette-label">Étape 1</p>
              <h2 style={s.title}>On commence doucement</h2>
              <p style={s.muted}>
                Choisis comment tu préfères paramétrer ton espace. Tu pourras revenir
                plus tard, chaque champ est sauvegardé automatiquement.
              </p>
              <div style={s.choiceGrid}>
                <button type="button" style={form.setup_choice === "self" ? s.choiceOn : s.choice} onClick={() => update("setup_choice", "self")}>
                  Je paramètre seul
                </button>
                <button type="button" style={form.setup_choice === "video" ? s.choiceOn : s.choice} onClick={() => update("setup_choice", "video")}>
                  Je préfère être accompagné en visio
                </button>
              </div>
              {form.setup_choice === "video" ? (
                <div style={s.notice}>
                  <p>{"On prépare tout ensemble, tu n'as pas besoin de savoir où ranger chaque document."}</p>
                  <a href="/prendre-rendez-vous" className="btn-ink">
                    <span>Prendre rendez-vous</span>
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}

          {form.current_step === 2 ? (
            <div style={s.stack}>
              <p className="gazette-label">Étape 2</p>
              <h2 style={s.title}>Informations de l&apos;organisme</h2>
              <Input label="Nom de l&apos;organisme de formation" value={form.organisation_name} onChange={(value) => update("organisation_name", value)} />
              <Input label="SIRET" value={form.siret} onChange={(value) => update("siret", value)} />
              <Input label="Numéro NDA, facultatif" value={form.nda_number} onChange={(value) => update("nda_number", value)} />
              <Input label="Logo de l'organisme, URL du fichier" value={form.organisation_logo_url} onChange={(value) => update("organisation_logo_url", value)} />
              <Textarea label="Adresse" value={form.address} onChange={(value) => update("address", value)} />
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
              {form.qualiopi_status === "planned" ? (
                <p style={s.notice}>{"Aucun souci. Quand le moment viendra, Selen pourra t'aider à préparer le chemin vers Qualiopi."}</p>
              ) : null}
              <div style={s.stackSmall}>
                <strong>Bibliotheque documentaire</strong>
                <p style={s.muted}>Les modeles client sont prioritaires. Si aucun modele n&apos;est renseigne, Selen utilise son modele par defaut.</p>
                <Input label="Modele client - convocation" value={form.convocation_template_url} onChange={(value) => update("convocation_template_url", value)} />
                <Input label="Modele client - convention" value={form.convention_template_url} onChange={(value) => update("convention_template_url", value)} />
                <Input label="Politique handicap / document client" value={form.politique_handicap_template_url} onChange={(value) => update("politique_handicap_template_url", value)} />
              </div>
              <div style={s.stackSmall}>
                <label style={s.check}><input type="checkbox" checked={form.insee_document_pending} onChange={(event) => update("insee_document_pending", event.target.checked)} /> Avis INSEE à fournir plus tard</label>
                <label style={s.check}><input type="checkbox" checked={form.qualiopi_certificate_pending} onChange={(event) => update("qualiopi_certificate_pending", event.target.checked)} /> Certificat Qualiopi à fournir plus tard</label>
                <label style={s.check}><input type="checkbox" checked={form.nda_or_bpf_document_pending} onChange={(event) => update("nda_or_bpf_document_pending", event.target.checked)} /> Attestation NDA ou dernier BPF à fournir plus tard</label>
              </div>
            </div>
          ) : null}

          {form.current_step === 3 ? (
            <TextStep title="Le fil de l'eau" text="Plus tu utilises Selen au fil de l'eau, moins tu cours après les preuves au moment de l'audit." />
          ) : null}

          {form.current_step === 4 ? (
            <div style={s.stack}>
              <p className="gazette-label">Étape 4</p>
              <h2 style={s.title}>Formateurs</h2>
              <p style={s.muted}>
                Ces formateurs pourront ensuite être sélectionnés lors de la création
                d&apos;une session. L&apos;accès formateur est seulement préparé pour la suite.
              </p>
              {trainers.map((trainer, index) => (
                <div key={trainer.id ?? index} style={s.trainer}>
                  <div style={s.twoCols}>
                    <Input label="Prénom" value={trainer.first_name} onChange={(value) => updateTrainer(index, { first_name: value })} />
                    <Input label="Nom" value={trainer.last_name} onChange={(value) => updateTrainer(index, { last_name: value })} />
                  </div>
                  <Input label="Email" value={trainer.email} onChange={(value) => updateTrainer(index, { email: value })} />
                  <label style={s.check}><input type="checkbox" checked={trainer.cv_pending} onChange={(event) => updateTrainer(index, { cv_pending: event.target.checked })} /> CV à fournir si Qualiopi</label>
                  <label style={s.check}><input type="checkbox" checked={trainer.trainer_access_planned} onChange={(event) => updateTrainer(index, { trainer_access_planned: event.target.checked })} /> Prévoir un accès formateur plus tard</label>
                </div>
              ))}
              <button type="button" className="btn-ghost" onClick={() => setTrainers((current) => [...current, { ...blankTrainer }])}>
                <span>Ajouter un formateur</span>
              </button>
            </div>
          ) : null}

          {form.current_step === 5 ? (
            <TextStep title="Les bons liens, au bon moment" text="Ces informations permettront de préparer les bons documents, d&apos;envoyer les bons liens, et d&apos;éviter les oublis." />
          ) : null}

          {form.current_step === 6 ? (
            <div style={s.stack}>
              <p className="gazette-label">Étape 6</p>
              <h2 style={s.title}>Interlocuteur plateforme</h2>
              <p style={s.muted}>
                Ce prénom servira pour dire bonjour dans la plateforme et dans les
                mails. L&apos;email recevra les communications de suivi si besoin.
              </p>
              <div style={s.twoCols}>
                <Input label="Prénom" value={form.platform_contact_first_name} onChange={(value) => update("platform_contact_first_name", value)} />
                <Input label="Nom" value={form.platform_contact_last_name} onChange={(value) => update("platform_contact_last_name", value)} />
              </div>
              <Input label="Fonction / qualité" value={form.platform_contact_role} onChange={(value) => update("platform_contact_role", value)} />
              <Input label="Email de contact" value={form.platform_contact_email} onChange={(value) => update("platform_contact_email", value)} />
            </div>
          ) : null}

          {form.current_step === 7 ? (
            <div style={s.stack}>
              <p className="gazette-label">Confirmation</p>
              <h2 style={s.title}>Ton espace Daily est prêt à démarrer</h2>
              <p style={s.muted}>
                Tu pourras modifier ces informations plus tard depuis les paramètres
                Daily. La prochaine étape utile : créer ta première formation.
              </p>
              <button type="button" className="btn-ink" onClick={() => void finish()}>
                <span>Terminer et créer ma première formation</span>
              </button>
            </div>
          ) : null}

          <div style={s.actions}>
            <button type="button" className="btn-ghost" disabled={form.current_step <= 1} onClick={() => void goTo(Math.max(1, form.current_step - 1))}>
              <span>Précédent</span>
            </button>
            {form.current_step < 7 ? (
              <button type="button" className="btn-ink" onClick={() => void goTo(Math.min(7, form.current_step + 1))}>
                <span>Continuer</span>
              </button>
            ) : null}
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

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={s.field}>
      <span style={s.label}>{label}</span>
      <input style={s.input} value={text(value)} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={s.field}>
      <span style={s.label}>{label}</span>
      <textarea style={{ ...s.input, minHeight: 92, paddingTop: 10 }} value={text(value)} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 980, margin: "0 auto", padding: "2rem 1.5rem 4rem" },
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
  twoCols: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.75rem" },
  field: { display: "grid", gap: "0.35rem" },
  label: { color: "var(--ink)", fontWeight: 800 },
  input: { width: "100%", border: "1px solid rgba(178,138,98,0.55)", background: "rgba(255,250,239,0.86)", color: "var(--ink)", padding: "0.7rem", fontSize: "0.95rem", boxSizing: "border-box" },
  check: { color: "var(--ink-soft)", display: "flex", gap: "0.5rem", alignItems: "center" },
  trainer: { display: "grid", gap: "0.7rem", border: "1px solid rgba(178,138,98,0.28)", padding: "0.85rem" },
  actions: { display: "flex", gap: "0.7rem", justifyContent: "space-between", flexWrap: "wrap", borderTop: "1px solid rgba(178,138,98,0.28)", paddingTop: "1rem" },
};
