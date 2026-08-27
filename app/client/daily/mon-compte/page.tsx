"use client";

import { useEffect, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

type WorkspaceResponse = { workspace?: { organisation?: Record<string, unknown>; capabilities?: Record<string, boolean> } };
type OnboardingResponse = { onboarding?: Record<string, unknown>; subscription?: Record<string, unknown> | null };

function text(value: unknown) { return String(value ?? ""); }
function money(cents: unknown) {
  const value = Number(cents ?? 0);
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value / 100);
}

export default function DailyAccountPage() {
  const [workspace, setWorkspace] = useState<WorkspaceResponse["workspace"] | null>(null);
  const [onboarding, setOnboarding] = useState<Record<string, unknown> | null>(null);
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ administrative_email: "", administrative_phone: "", administrative_address: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/client/daily/workspace", { cache: "no-store" }),
      fetch("/api/client/daily/onboarding", { cache: "no-store" }),
    ]).then(async ([workspaceRes, onboardingRes]) => {
      const workspaceBody = await workspaceRes.json().catch(() => ({})) as WorkspaceResponse;
      const onboardingBody = await onboardingRes.json().catch(() => ({})) as OnboardingResponse;
      if (!workspaceRes.ok || !onboardingRes.ok) throw new Error("Impossible de charger votre compte Daily.");
      const ws = workspaceBody.workspace ?? null;
      const org = ws?.organisation ?? {};
      setWorkspace(ws);
      setOnboarding(onboardingBody.onboarding ?? null);
      setSubscription(onboardingBody.subscription ?? null);
      setForm({
        administrative_email: text(org.administrative_email),
        administrative_phone: text(org.administrative_phone),
        administrative_address: text(org.administrative_address || org.address),
      });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Chargement impossible.")).finally(() => setLoading(false));
  }, []);

  async function saveAdministrative() {
    setSaving(true); setMessage(""); setError("");
    const res = await fetch("/api/client/daily/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_safe_profile", values: form }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { setWorkspace(body.workspace ?? workspace); setMessage("Informations administratives mises à jour."); }
    else setError(body.error ?? "Modification impossible.");
    setSaving(false);
  }

  async function openBillingPortal() {
    setError("");
    const res = await fetch("/api/client/daily/billing-portal", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) { setError(body.error ?? "Portail de facturation indisponible."); return; }
    window.location.href = body.url;
  }

  if (loading) return <LoadingMascot message="Sélion ouvre votre espace organisme…" />;
  const org = workspace?.organisation ?? {};
  const legalName = text(org.legal_name || org.name || onboarding?.organisation_name || "Mon organisme");
  const docs = [
    ["Avis INSEE", onboarding?.insee_document_url],
    ["Certificat Qualiopi", onboarding?.qualiopi_certificate_url],
    ["BPF / document NDA", onboarding?.nda_or_bpf_document_url],
    ["Livret d’accueil", onboarding?.welcome_booklet_url],
  ] as Array<[string, unknown]>;

  return <main style={s.page}>
    <div style={s.wrap}>
      <header style={s.hero}><p style={s.kicker}>Selen Daily · Mon compte</p><h1 style={s.h1}>Mon profil & mon organisme</h1><p style={s.lead}>Retrouvez ici les informations administratives, les documents permanents et votre abonnement Daily.</p></header>
      {message ? <p style={s.success}>{message}</p> : null}
      {error ? <p style={s.error}>{error}</p> : null}

      <section style={s.grid}>
        <article style={s.card}>
          <h2 style={s.h2}>Organisme de formation</h2>
          <Info label="Raison sociale" value={legalName} />
          <Info label="SIRET" value={text(org.siret || onboarding?.siret) || "Non renseigné"} />
          <Info label="NDA" value={text(org.nda_number || onboarding?.nda_number) || "Non renseigné"} />
          <Info label="Statut Qualiopi" value={text(org.qualiopi_status || onboarding?.qualiopi_status) === "yes" ? "Certifié Qualiopi" : text(org.qualiopi_status || onboarding?.qualiopi_status) || "Non renseigné"} />
          <p style={s.note}>Les modifications d’identité légale, SIRET, NDA ou Qualiopi passent par une demande de modification contrôlée afin de préserver l’historique de conformité.</p>
        </article>

        <article style={s.card}>
          <h2 style={s.h2}>Coordonnées administratives</h2>
          <Field label="Email administratif" value={form.administrative_email} onChange={(v) => setForm({ ...form, administrative_email: v })} />
          <Field label="Téléphone" value={form.administrative_phone} onChange={(v) => setForm({ ...form, administrative_phone: v })} />
          <Field label="Adresse administrative" value={form.administrative_address} onChange={(v) => setForm({ ...form, administrative_address: v })} />
          <button type="button" onClick={saveAdministrative} disabled={saving} style={s.primary}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </article>
      </section>

      <section style={s.card}>
        <h2 style={s.h2}>Documents de l’organisme</h2>
        <div style={s.docGrid}>{docs.map(([label, url]) => <div key={label} style={s.doc}><strong>{label}</strong>{url ? <a href={text(url)} target="_blank" rel="noreferrer" style={s.link}>Voir le document →</a> : <span style={s.muted}>Document non fourni</span>}</div>)}</div>
        <p style={s.note}>Les remplacements de documents permanents seront centralisés dans cet espace afin de conserver les versions nécessaires aux futurs audits Live.</p>
      </section>

      <section style={s.card}>
        <h2 style={s.h2}>Abonnement Selen Daily</h2>
        <div style={s.subGrid}>
          <Info label="Statut" value={text(subscription?.status || "actif")} />
          <Info label="Formule" value={text(subscription?.current_tier || "Daily")} />
          <Info label="Mensualité actuelle" value={money(subscription?.base_monthly_amount_cents)} />
          <Info label="Période annuelle" value={`${text(subscription?.annual_period_start) || "—"} → ${text(subscription?.annual_period_end) || "—"}`} />
        </div>
        <div style={s.actions}>
          <button type="button" onClick={openBillingPortal} style={s.primary}>Gérer ma carte ou mon abonnement</button>
          <button type="button" disabled style={s.disabled}>Générer ma facture annuelle</button>
        </div>
        <p style={s.note}>La facture annuelle sera activée après définition de la règle comptable exacte pour regrouper les mensualités sans créer de double facturation.</p>
      </section>
    </div>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) { return <div style={s.info}><span style={s.label}>{label}</span><strong>{value}</strong></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label style={s.field}><span style={s.label}>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} style={s.input} /></label>; }

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "linear-gradient(180deg,#eadfbf,#e0cf9f)", color: "#392a19", padding: "2rem 1rem 5rem" },
  wrap: { maxWidth: 1050, margin: "0 auto", display: "grid", gap: "1rem" },
  hero: { background: "#f8f0dc", border: "1px solid #d9c391", padding: "1.6rem 1.8rem" },
  kicker: { textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 800, color: "#9b682d" },
  h1: { fontFamily: "Georgia,serif", fontSize: "clamp(2rem,5vw,3rem)", margin: ".4rem 0" },
  lead: { color: "#725e46", lineHeight: 1.6 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "1rem" },
  card: { background: "#f8f0dc", border: "1px solid #d9c391", padding: "1.4rem 1.5rem", boxShadow: "0 8px 20px rgba(57,42,25,.08)" },
  h2: { fontFamily: "Georgia,serif", marginTop: 0 },
  info: { display: "grid", gap: 4, borderBottom: "1px solid rgba(160,106,44,.2)", padding: ".7rem 0" },
  label: { color: "#806c52", fontSize: 12, fontWeight: 700 },
  field: { display: "grid", gap: 5, marginBottom: ".8rem" },
  input: { border: "1px solid #cdb785", background: "#fffaf0", padding: ".7rem", color: "#392a19" },
  primary: { border: "1px solid #7a2e22", background: "#7a2e22", color: "#f8f0dc", padding: ".75rem 1rem", fontWeight: 800, cursor: "pointer" },
  disabled: { border: "1px solid #b9aa8b", background: "#e7dfcb", color: "#8c806a", padding: ".75rem 1rem", fontWeight: 800 },
  note: { color: "#7d6a51", fontSize: 13, lineHeight: 1.55 },
  docGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: ".7rem" },
  doc: { border: "1px solid rgba(160,106,44,.22)", padding: ".9rem", display: "grid", gap: 8, background: "rgba(255,250,240,.55)" },
  link: { color: "#7a2e22", fontWeight: 800, textDecoration: "none", fontSize: 13 },
  muted: { color: "#95866e", fontSize: 13 },
  subGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "0 1rem" },
  actions: { display: "flex", flexWrap: "wrap", gap: ".7rem", marginTop: "1rem" },
  success: { border: "1px solid #668153", background: "rgba(102,129,83,.1)", padding: ".8rem", color: "#455a3b" },
  error: { border: "1px solid #a64b3b", background: "#fff2ee", padding: ".8rem", color: "#7d2e22" },
};
