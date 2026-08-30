"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Certification = {
  id: string;
  title: string;
  issuer?: string | null;
  reference?: string | null;
  obtained_on?: string | null;
  valid_until?: string | null;
  validity_mode: "lifetime" | "limited" | "unknown";
  note?: string | null;
};

type Proof = { id: string; name: string; mime_type?: string | null; url?: string | null };
type State = {
  trainer: { display_name?: string | null };
  certifications: Certification[];
  proofByCertification: Record<string, Proof>;
};

type FormState = {
  id: string;
  title: string;
  issuer: string;
  reference: string;
  obtained_on: string;
  validity_mode: "lifetime" | "limited" | "unknown";
  valid_until: string;
  note: string;
};

const emptyForm: FormState = {
  id: "",
  title: "",
  issuer: "",
  reference: "",
  obtained_on: "",
  validity_mode: "unknown",
  valid_until: "",
  note: "",
};

export default function TrainerCertificationsPage() {
  const [data, setData] = useState<State | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [proofBusyId, setProofBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/client/daily/trainer-certifications", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? "Chargement impossible.");
    setData(payload as State);
  }, []);

  useEffect(() => {
    void load()
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Chargement impossible."))
      .finally(() => setLoading(false));
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/client/daily/trainer-certifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Enregistrement impossible.");
      return;
    }
    setForm(emptyForm);
    await load();
    setMessage(form.id ? "Certification mise à jour." : "Certification ajoutée à votre dossier.");
  }

  async function uploadProof(certificationId: string, file: File) {
    setProofBusyId(certificationId);
    setError("");
    setMessage("");
    const body = new FormData();
    body.set("certification_id", certificationId);
    body.set("file", file);
    const response = await fetch("/api/client/daily/trainer-certifications/proof", { method: "POST", body });
    const payload = await response.json().catch(() => null);
    setProofBusyId("");
    if (!response.ok) {
      setError(payload?.error ?? "Ajout du justificatif impossible.");
      return;
    }
    await load();
    setMessage("Justificatif enregistré. La nouvelle version remplace la précédente sans supprimer l’historique.");
  }

  function edit(certification: Certification) {
    setForm({
      id: certification.id,
      title: certification.title,
      issuer: certification.issuer ?? "",
      reference: certification.reference ?? "",
      obtained_on: certification.obtained_on ?? "",
      validity_mode: certification.validity_mode ?? "unknown",
      valid_until: certification.valid_until ?? "",
      note: certification.note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="gazette-paper" style={styles.page}>
      <Link href="/client/daily/formateur/suivi-annuel" style={styles.back}>← Mon suivi formateur</Link>
      <header className="gazette-cta" style={styles.hero}>
        <p className="gazette-label">Selen Daily · Formateur</p>
        <h1 className="gazette-hero-title">Mes certifications</h1>
        <p style={styles.muted}>Tenez vos qualifications professionnelles à jour et joignez, lorsque vous en disposez, un justificatif PDF ou image.</p>
      </header>

      {error ? <p style={styles.error}>{error}</p> : null}
      {message ? <p style={styles.success}>{message}</p> : null}

      <form onSubmit={save} style={styles.card}>
        <div style={styles.titleRow}>
          <div>
            <p className="gazette-label">{form.id ? "Modification" : "Nouvelle certification"}</p>
            <h2 style={styles.cardTitle}>{form.id ? "Mettre à jour la certification" : "Ajouter une certification"}</h2>
          </div>
          {form.id ? <button type="button" className="btn-ghost" onClick={() => setForm(emptyForm)}><span>Annuler</span></button> : null}
        </div>
        <div style={styles.twoCols}>
          <Field label="Intitulé" value={form.title} required onChange={(value) => setForm((current) => ({ ...current, title: value }))} />
          <Field label="Organisme certificateur" value={form.issuer} onChange={(value) => setForm((current) => ({ ...current, issuer: value }))} />
          <Field label="Référence / numéro" value={form.reference} onChange={(value) => setForm((current) => ({ ...current, reference: value }))} />
          <Field label="Date d’obtention" type="date" value={form.obtained_on} onChange={(value) => setForm((current) => ({ ...current, obtained_on: value }))} />
        </div>
        <label style={styles.field}>
          <span style={styles.label}>Durée de validité</span>
          <select style={styles.input} value={form.validity_mode} onChange={(event) => setForm((current) => ({ ...current, validity_mode: event.target.value as FormState["validity_mode"], valid_until: event.target.value === "limited" ? current.valid_until : "" }))}>
            <option value="unknown">Non précisée</option>
            <option value="lifetime">Sans limite connue</option>
            <option value="limited">Durée limitée</option>
          </select>
        </label>
        {form.validity_mode === "limited" ? (
          <Field label="Valide jusqu’au" type="date" value={form.valid_until} required onChange={(value) => setForm((current) => ({ ...current, valid_until: value }))} />
        ) : null}
        <label style={styles.field}>
          <span style={styles.label}>Précisions facultatives</span>
          <textarea style={{ ...styles.input, minHeight: 90 }} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
        </label>
        <button className="btn-ink" type="submit" disabled={busy}><span>{busy ? "Enregistrement…" : form.id ? "Enregistrer les modifications" : "Ajouter la certification"}</span></button>
      </form>

      <section style={styles.card}>
        <p className="gazette-label">Votre dossier</p>
        <h2 style={styles.cardTitle}>{data?.trainer.display_name || "Formateur"}</h2>
        {loading ? <p>Chargement…</p> : data?.certifications.length ? (
          <div style={styles.list}>
            {data.certifications.map((certification) => {
              const proof = data.proofByCertification[certification.id];
              return (
                <article key={certification.id} style={styles.item}>
                  <div style={styles.titleRow}>
                    <div>
                      <strong style={styles.itemTitle}>{certification.title}</strong>
                      <p style={styles.meta}>{[certification.issuer, certification.reference].filter(Boolean).join(" · ") || "Organisme certificateur non précisé"}</p>
                    </div>
                    <button type="button" className="btn-ghost" onClick={() => edit(certification)}><span>Modifier</span></button>
                  </div>
                  <p style={styles.meta}>{describeValidity(certification)}</p>
                  {certification.note ? <p style={styles.note}>{certification.note}</p> : null}
                  <div style={styles.proofRow}>
                    {proof?.url ? <a href={proof.url} target="_blank" rel="noreferrer" style={styles.proofLink}>Voir le justificatif actuel</a> : <span style={styles.muted}>Aucun justificatif déposé.</span>}
                    <label style={styles.fileButton}>
                      {proofBusyId === certification.id ? "Envoi en cours…" : proof ? "Remplacer le justificatif" : "Ajouter un justificatif"}
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                        disabled={proofBusyId === certification.id}
                        style={{ display: "none" }}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadProof(certification.id, file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <p style={styles.hint}>PDF, JPG, PNG ou WEBP · 10 Mo maximum.</p>
                </article>
              );
            })}
          </div>
        ) : <p style={styles.muted}>Aucune certification n’est encore enregistrée.</p>}
      </section>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label style={styles.field}><span style={styles.label}>{label}</span><input style={styles.input} type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} /></label>;
}

function describeValidity(certification: Certification) {
  const obtained = formatDate(certification.obtained_on);
  if (certification.validity_mode === "lifetime") return `${obtained ? `Obtenue le ${obtained} · ` : ""}Sans limite de validité connue`;
  if (certification.validity_mode === "limited") return `${obtained ? `Obtenue le ${obtained} · ` : ""}Valide jusqu’au ${formatDate(certification.valid_until) || "date à préciser"}`;
  return obtained ? `Obtenue le ${obtained} · Validité non précisée` : "Dates non précisées";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem 4rem" },
  back: { color: "var(--rust)", textDecoration: "none" },
  hero: { marginTop: "1rem", padding: "1.5rem", border: "1px solid var(--sepia-mid)" },
  muted: { color: "var(--ink-soft)", lineHeight: 1.55 },
  card: { marginTop: "1rem", padding: "1.25rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)", display: "grid", gap: ".9rem" },
  cardTitle: { margin: ".2rem 0 0", color: "var(--ink)" },
  titleRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" },
  twoCols: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: ".8rem" },
  field: { display: "grid", gap: ".35rem" },
  label: { color: "var(--ink)", fontWeight: 800, fontSize: ".92rem" },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid rgba(178,138,98,.55)", background: "rgba(255,250,239,.86)", color: "var(--ink)", padding: ".7rem", fontSize: ".95rem" },
  list: { display: "grid", gap: ".8rem" },
  item: { border: "1px solid rgba(178,138,98,.36)", background: "rgba(255,250,239,.52)", padding: "1rem" },
  itemTitle: { color: "var(--ink)", fontSize: "1.05rem" },
  meta: { margin: ".3rem 0 0", color: "var(--ink-soft)", lineHeight: 1.5 },
  note: { color: "var(--ink)", lineHeight: 1.55 },
  proofRow: { display: "flex", alignItems: "center", gap: ".7rem", flexWrap: "wrap", marginTop: ".8rem" },
  proofLink: { color: "var(--rust)", fontWeight: 800, textDecoration: "none" },
  fileButton: { display: "inline-block", cursor: "pointer", border: "1px solid var(--rust)", background: "rgba(138,75,36,.08)", color: "var(--rust)", padding: ".65rem .85rem", fontWeight: 800 },
  hint: { margin: ".35rem 0 0", fontSize: ".88rem", color: "var(--ink-soft)" },
  success: { padding: ".8rem 1rem", background: "rgba(61,106,74,.1)", border: "1px solid rgba(61,106,74,.35)" },
  error: { padding: ".8rem 1rem", color: "#8a2d24", background: "rgba(138,45,36,.08)", border: "1px solid rgba(138,45,36,.25)" },
};
