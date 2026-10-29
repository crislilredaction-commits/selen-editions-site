"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Proof = { id: string; name: string; mime_type?: string | null; size_bytes?: number | null; url: string };
type Certification = { id: string; title: string; issuer?: string | null; reference?: string | null; obtained_on?: string | null; validity_mode?: string | null; valid_until?: string | null; note?: string | null; proof?: Proof | null };
type Trainer = { id: string; display_name?: string | null; professional_email?: string | null; status?: string | null; specialties?: string[] | null; certifications: Certification[] };
type Payload = { trainers: Trainer[]; assisted?: boolean };

export default function TrainerCertificationRegisterPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const assistanceToken = params.get("assistanceToken");
    const suffix = assistanceToken ? `?assistanceToken=${encodeURIComponent(assistanceToken)}` : "";
    fetch(`/api/client/daily/trainer-certification-register${suffix}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? "Chargement des certifications impossible.");
        setData(payload as Payload);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Chargement impossible."))
      .finally(() => setLoading(false));
  }, []);

  const total = data?.trainers.reduce((count, trainer) => count + trainer.certifications.length, 0) ?? 0;
  const expired = data?.trainers.reduce((count, trainer) => count + trainer.certifications.filter(isExpired).length, 0) ?? 0;

  return <main className="gazette-paper" style={styles.page}>
    <Link href="/client/daily/formateurs" style={styles.back}>← Formateurs</Link>
    <header className="gazette-cta" style={styles.hero}>
      <p className="gazette-label">Selen Daily · Formateurs</p>
      <h1 className="gazette-hero-title">Certifications des formateurs</h1>
      <p style={styles.muted}>Consultez les certifications déclarées par les formateurs et leurs justificatifs. Cet espace est strictement en lecture seule.</p>
      {data?.assisted ? <p style={styles.assistance}>Mode assistance agent : consultation uniquement, aucune modification n’est disponible.</p> : null}
    </header>

    {error ? <p style={styles.error}>{error}</p> : null}
    {loading ? <p>Chargement…</p> : data ? <>
      <section style={styles.metrics}>
        <Metric value={data.trainers.length} label="Formateurs" />
        <Metric value={total} label="Certifications" />
        <Metric value={expired} label="Expirées" />
      </section>
      <section style={styles.list}>
        {data.trainers.length === 0 ? <p style={styles.card}>Aucun formateur enregistré.</p> : data.trainers.map((trainer) => <article key={trainer.id} style={styles.card}>
          <h2 style={styles.name}>{trainer.display_name || "Formateur"}</h2>
          <p style={styles.muted}>{trainer.professional_email || "Email non renseigné"}</p>
          {trainer.certifications.length === 0 ? <p style={styles.muted}>Aucune certification déclarée.</p> : <ul style={styles.certList}>
            {trainer.certifications.map((certification) => {
              const certificationExpired = isExpired(certification);
              return <li key={certification.id} style={styles.certification}>
                <div>
                  <strong>{certification.title}</strong>{certificationExpired ? <span style={styles.expired}> Expirée</span> : null}
                  <p style={styles.meta}>{[certification.issuer, certification.reference, certification.obtained_on ? `obtenue le ${formatDate(certification.obtained_on)}` : null, certification.valid_until ? `valable jusqu’au ${formatDate(certification.valid_until)}` : null].filter(Boolean).join(" · ") || "Détails non renseignés"}</p>
                  {certification.note ? <p style={styles.note}>{certification.note}</p> : null}
                </div>
                {certification.proof ? <a href={certification.proof.url} target="_blank" rel="noreferrer" className="btn-ghost"><span>Voir le justificatif</span></a> : <span style={styles.noProof}>Justificatif non déposé</span>}
              </li>;
            })}
          </ul>}
        </article>)}
      </section>
    </> : null}
  </main>;
}

function isExpired(certification: Certification) {
  if (!certification.valid_until) return false;
  const expiry = new Date(`${certification.valid_until}T23:59:59.999Z`).getTime();
  return !Number.isNaN(expiry) && expiry < Date.now();
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR").format(date);
}
function Metric({ value, label }: { value: number; label: string }) {
  return <div style={styles.metric}><strong style={styles.metricValue}>{value}</strong><span>{label}</span></div>;
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "1.5rem 1rem 4rem" },
  back: { color: "var(--rust)", textDecoration: "none" },
  hero: { marginTop: "1rem", padding: "1.5rem", border: "1px solid var(--sepia-mid)" },
  muted: { color: "var(--ink-soft)", lineHeight: 1.6 },
  assistance: { marginTop: ".8rem", padding: ".75rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)", fontWeight: 700 },
  error: { padding: ".8rem", border: "1px solid #a64b3b", background: "#fff2ee", color: "#7d2e22" },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".8rem", marginTop: "1rem" },
  metric: { padding: "1rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)", display: "grid", gap: ".2rem" },
  metricValue: { fontSize: "1.8rem", color: "var(--rust)" },
  list: { display: "grid", gap: "1rem", marginTop: "1rem" },
  card: { padding: "1.2rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)" },
  name: { margin: 0 },
  certList: { listStyle: "none", padding: 0, display: "grid", gap: ".7rem" },
  certification: { borderTop: "1px solid var(--sepia-mid)", paddingTop: ".8rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" },
  meta: { margin: ".3rem 0 0", color: "var(--ink-soft)", fontSize: 13 },
  note: { margin: ".35rem 0 0", fontSize: 13 },
  expired: { color: "#8c2f23", fontSize: 12, fontWeight: 800, textTransform: "uppercase" },
  noProof: { color: "var(--ink-soft)", fontSize: 12 },
};
