"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Training = {
  id: string;
  training_kind: "completed" | "planned";
  title: string;
  provider?: string | null;
  completed_on?: string | null;
  attestation_document_id?: string | null;
  note?: string | null;
};

type Certification = {
  id: string;
  title: string;
  issuer?: string | null;
  reference?: string | null;
  obtained_on?: string | null;
  validity_mode?: string | null;
  valid_until?: string | null;
  note?: string | null;
};

type Review = {
  id: string;
  status: "draft" | "submitted";
  strengths?: string | null;
  weaknesses?: string | null;
  improvement_areas?: string | null;
  proposed_solutions?: string | null;
  submitted_at?: string | null;
  manager_notified_at?: string | null;
  reminder_count?: number | null;
  manager_appreciation?: string | null;
  manager_improvement_areas?: string | null;
  manager_actions?: string | null;
  manager_completed_at?: string | null;
};

type Trainer = {
  id: string;
  display_name?: string | null;
  professional_email?: string | null;
  status?: string | null;
  specialties?: string[] | null;
  cv_updated_at?: string | null;
  cv_review_due_at?: string | null;
  review: Review | null;
  trainings: Training[];
  certifications: Certification[];
};

type Payload = { year: number; trainers: Trainer[] };

export default function TrainerAnnualManagerOverviewPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/client/daily/trainer-annual-reviews", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? "Chargement du suivi formateur impossible.");
    setData(payload as Payload);
  }, []);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Chargement impossible.")).finally(() => setLoading(false));
  }, [load]);

  const submitted = data?.trainers.filter((trainer) => trainer.review?.status === "submitted").length ?? 0;
  const pending = data?.trainers.length ? data.trainers.length - submitted : 0;
  const cvDue = data?.trainers.filter((trainer) => isDue(trainer.cv_review_due_at)).length ?? 0;
  const expiredCertifications = data?.trainers.reduce(
    (count, trainer) => count + trainer.certifications.filter((certification) => isExpiredCertification(certification)).length,
    0,
  ) ?? 0;

  return (
    <main className="gazette-paper" style={styles.page}>
      <Link href="/client/daily/organisation" style={styles.back}>← Mon organisme</Link>
      <header className="gazette-cta" style={styles.hero}>
        <p className="gazette-label">Selen Daily · Suivi des compétences</p>
        <h1 className="gazette-hero-title">Suivi annuel des formateurs {data?.year ?? ""}</h1>
        <p style={styles.muted}>Consultez les auto-évaluations, formations, CV et certifications. Vous pouvez compléter une appréciation ou des actions de votre côté, sans aucune obligation.</p>
      </header>

      {error ? <p style={styles.error}>{error}</p> : null}
      {loading ? <p>Chargement…</p> : data ? (
        <>
          <section style={styles.metrics}>
            <Metric value={data.trainers.length} label="Formateurs" />
            <Metric value={submitted} label="Auto-évaluations reçues" />
            <Metric value={pending} label="À compléter" />
            <Metric value={cvDue} label="CV à actualiser" />
            <Metric value={expiredCertifications} label="Certifications expirées" />
          </section>

          <section style={styles.list}>
            {data.trainers.length === 0 ? <p style={styles.card}>Aucun formateur enregistré.</p> : data.trainers.map((trainer) => {
              const reviewStatus = trainer.review?.status === "submitted" ? "Reçue" : trainer.review ? "En cours" : "Non commencée";
              const opened = openId === trainer.id;
              const expired = trainer.certifications.filter((certification) => isExpiredCertification(certification));
              return (
                <article key={trainer.id} style={styles.card}>
                  <div style={styles.headerRow}>
                    <div>
                      <h2 style={styles.name}>{trainer.display_name || "Formateur"}</h2>
                      <p style={styles.muted}>{trainer.professional_email || "Email non renseigné"}</p>
                    </div>
                    <div style={styles.badges}>
                      <span style={trainer.review?.status === "submitted" ? styles.goodBadge : styles.waitBadge}>Auto-évaluation : {reviewStatus}</span>
                      <span style={isDue(trainer.cv_review_due_at) ? styles.warningBadge : styles.neutralBadge}>CV : {cvLabel(trainer)}</span>
                      {expired.length > 0 ? <span style={styles.errorBadge}>{expired.length} certification{expired.length > 1 ? "s" : ""} expirée{expired.length > 1 ? "s" : ""}</span> : null}
                    </div>
                  </div>

                  {expired.length > 0 ? (
                    <p style={styles.certificationAlert}>Une certification déclarée comme temporaire a dépassé sa date de validité. Vérifiez-la avant toute affectation nécessitant cette certification.</p>
                  ) : null}

                  {trainer.review?.status === "submitted" ? (
                    <>
                      <p style={styles.muted}>Transmise le {formatDate(trainer.review.submitted_at)} · {trainer.trainings.filter((item) => item.training_kind === "completed").length} formation(s) suivie(s) · {trainer.trainings.filter((item) => item.training_kind === "planned").length} envisagée(s).</p>
                      <button className="btn-ghost" onClick={() => setOpenId(opened ? null : trainer.id)}><span>{opened ? "Masquer" : "Consulter et compléter"}</span></button>
                      {opened ? <ReviewDetails trainer={trainer} onSaved={load} /> : null}
                    </>
                  ) : (
                    <>
                      <p style={styles.info}>Le questionnaire obligatoire n’est pas encore transmis. Les relances pourront continuer jusqu’à complétion.</p>
                      {trainer.certifications.length > 0 ? <button className="btn-ghost" onClick={() => setOpenId(opened ? null : trainer.id)}><span>{opened ? "Masquer les certifications" : "Voir les certifications"}</span></button> : null}
                      {opened ? <CertificationDetails certifications={trainer.certifications} /> : null}
                    </>
                  )}
                </article>
              );
            })}
          </section>
        </>
      ) : null}
    </main>
  );
}

function ReviewDetails({ trainer, onSaved }: { trainer: Trainer; onSaved: () => Promise<void> }) {
  const review = trainer.review;
  const [managerAppreciation, setManagerAppreciation] = useState(review?.manager_appreciation ?? "");
  const [managerImprovementAreas, setManagerImprovementAreas] = useState(review?.manager_improvement_areas ?? "");
  const [managerActions, setManagerActions] = useState(review?.manager_actions ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!review) return null;
  const completed = trainer.trainings.filter((item) => item.training_kind === "completed");
  const planned = trainer.trainings.filter((item) => item.training_kind === "planned");
  const hasManagerContribution = Boolean(review.manager_appreciation || review.manager_improvement_areas || review.manager_actions);

  async function saveManagerContribution() {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/client/daily/trainer-annual-reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        review_id: review?.id,
        manager_appreciation: managerAppreciation,
        manager_improvement_areas: managerImprovementAreas,
        manager_actions: managerActions,
      }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Enregistrement impossible.");
      return;
    }
    await onSaved();
    const hasContent = Boolean(managerAppreciation.trim() || managerImprovementAreas.trim() || managerActions.trim());
    setMessage(hasContent ? "Contribution enregistrée." : "Contribution retirée. La partie dirigeant restera absente du document final.");
  }

  return (
    <div style={styles.details}>
      <Detail title="Points forts" value={review.strengths} />
      <Detail title="Points faibles / difficultés" value={review.weaknesses} />
      <Detail title="Axes d’amélioration" value={review.improvement_areas} />
      <Detail title="Solutions proposées" value={review.proposed_solutions} />
      <div>
        <h3>Formations suivies</h3>
        {completed.length ? <ul>{completed.map((item) => <li key={item.id}><strong>{item.title}</strong>{item.provider ? ` · ${item.provider}` : ""}{item.completed_on ? ` · ${formatDate(item.completed_on)}` : ""}{item.attestation_document_id ? " · attestation reçue" : ""}</li>)}</ul> : <p style={styles.muted}>Aucune formation déclarée.</p>}
      </div>
      <div>
        <h3>Formations envisagées</h3>
        {planned.length ? <ul>{planned.map((item) => <li key={item.id}><strong>{item.title}</strong>{item.provider ? ` · ${item.provider}` : ""}{item.note ? ` · ${item.note}` : ""}</li>)}</ul> : <p style={styles.muted}>Aucune formation envisagée déclarée.</p>}
      </div>
      <CertificationDetails certifications={trainer.certifications} />

      <section style={styles.managerBox}>
        <h3 style={{ marginTop: 0 }}>Contribution du dirigeant <span style={styles.optional}>facultative</span></h3>
        <p style={styles.muted}>Vous pouvez compléter ce point après lecture. Si les trois champs restent vides, cette partie ne devra pas apparaître sur le document final.</p>
        {hasManagerContribution && review.manager_completed_at ? <p style={styles.managerMeta}>Dernière contribution enregistrée le {formatDate(review.manager_completed_at)}.</p> : null}
        <label style={styles.field}><strong>Appréciation</strong><textarea rows={4} value={managerAppreciation} onChange={(event) => setManagerAppreciation(event.target.value)} style={styles.textarea} placeholder="Votre appréciation, si vous souhaitez en ajouter une…" /></label>
        <label style={styles.field}><strong>Axes d’amélioration confirmés ou ajustés</strong><textarea rows={4} value={managerImprovementAreas} onChange={(event) => setManagerImprovementAreas(event.target.value)} style={styles.textarea} placeholder="Facultatif" /></label>
        <label style={styles.field}><strong>Actions proposées ou décidées</strong><textarea rows={4} value={managerActions} onChange={(event) => setManagerActions(event.target.value)} style={styles.textarea} placeholder="Facultatif" /></label>
        {error ? <p style={styles.error}>{error}</p> : null}
        {message ? <p style={styles.success}>{message}</p> : null}
        <button className="btn-ink" disabled={busy} onClick={() => void saveManagerContribution()}><span>{busy ? "Enregistrement…" : "Enregistrer ma contribution"}</span></button>
      </section>
    </div>
  );
}

function CertificationDetails({ certifications }: { certifications: Certification[] }) {
  return (
    <div style={styles.certifications}>
      <h3>Certifications déclarées</h3>
      {certifications.length === 0 ? <p style={styles.muted}>Aucune certification enregistrée.</p> : (
        <ul>
          {certifications.map((certification) => {
            const expired = isExpiredCertification(certification);
            return (
              <li key={certification.id} style={expired ? styles.expiredCertification : undefined}>
                <strong>{certification.title}</strong>
                {certification.issuer ? ` · ${certification.issuer}` : ""}
                {certification.valid_until ? ` · valable jusqu’au ${formatDate(certification.valid_until)}` : certification.validity_mode === "unlimited" ? " · sans date de fin" : " · validité à préciser"}
                {expired ? " · EXPIRÉE" : ""}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Detail({ title, value }: { title: string; value?: string | null }) {
  return <div><h3>{title}</h3><p style={styles.answer}>{value || "Non renseigné"}</p></div>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div style={styles.metric}><strong style={styles.metricValue}>{value}</strong><span>{label}</span></div>;
}

function cvLabel(trainer: Trainer) {
  if (!trainer.cv_updated_at) return "à déposer";
  if (isDue(trainer.cv_review_due_at)) return "à actualiser";
  return `à jour jusqu’au ${formatDate(trainer.cv_review_due_at)}`;
}

function isExpiredCertification(certification: Certification) {
  if (!certification.valid_until) return false;
  const expiry = new Date(`${certification.valid_until}T23:59:59.999Z`).getTime();
  return !Number.isNaN(expiry) && expiry < Date.now();
}

function isDue(value?: string | null) {
  if (!value) return true;
  const due = new Date(value).getTime();
  return Number.isNaN(due) || due <= Date.now();
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR").format(date);
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "1.5rem 1rem 4rem" },
  back: { color: "var(--rust)", textDecoration: "none" },
  hero: { marginTop: "1rem", padding: "1.5rem", border: "1px solid var(--sepia-mid)" },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: ".8rem", marginTop: "1rem" },
  metric: { padding: "1rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)", display: "grid", gap: ".2rem" },
  metricValue: { fontSize: "1.8rem", color: "var(--rust)" },
  list: { display: "grid", gap: "1rem", marginTop: "1rem" },
  card: { padding: "1.25rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" },
  badges: { display: "flex", gap: ".45rem", flexWrap: "wrap" },
  name: { margin: 0 },
  muted: { color: "var(--ink-soft)", lineHeight: 1.5 },
  info: { padding: ".75rem", background: "rgba(201,160,85,.08)", color: "var(--ink-soft)" },
  certificationAlert: { padding: ".75rem", background: "rgba(138,45,36,.08)", color: "#8a2d24", border: "1px solid rgba(138,45,36,.2)" },
  certifications: { marginTop: ".8rem" },
  expiredCertification: { color: "#8a2d24", fontWeight: 700 },
  details: { marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed var(--sepia-mid)", display: "grid", gap: ".8rem" },
  answer: { whiteSpace: "pre-wrap", lineHeight: 1.6 },
  managerBox: { marginTop: ".5rem", padding: "1rem", border: "1px solid var(--sepia-mid)", background: "rgba(201,160,85,.05)", display: "grid", gap: ".8rem" },
  managerMeta: { margin: 0, fontSize: ".9rem", color: "var(--ink-soft)" },
  optional: { fontSize: ".75rem", fontWeight: 700, color: "var(--ink-soft)", marginLeft: ".35rem" },
  field: { display: "grid", gap: ".4rem" },
  textarea: { width: "100%", boxSizing: "border-box", padding: ".75rem", border: "1px solid var(--sepia-mid)", background: "#fffdf8", font: "inherit", lineHeight: 1.5 },
  success: { padding: ".7rem .8rem", margin: 0, background: "rgba(61,106,74,.1)", border: "1px solid rgba(61,106,74,.3)" },
  goodBadge: { padding: ".35rem .55rem", background: "rgba(61,106,74,.1)", color: "#3d6a4a", fontWeight: 800, fontSize: ".85rem" },
  waitBadge: { padding: ".35rem .55rem", background: "rgba(201,160,85,.12)", color: "#7d571d", fontWeight: 800, fontSize: ".85rem" },
  warningBadge: { padding: ".35rem .55rem", background: "rgba(154,91,22,.1)", color: "#9a5b16", fontWeight: 800, fontSize: ".85rem" },
  errorBadge: { padding: ".35rem .55rem", background: "rgba(138,45,36,.1)", color: "#8a2d24", fontWeight: 800, fontSize: ".85rem" },
  neutralBadge: { padding: ".35rem .55rem", background: "rgba(80,70,60,.07)", color: "var(--ink-soft)", fontWeight: 800, fontSize: ".85rem" },
  error: { padding: ".8rem 1rem", color: "#8a2d24", background: "rgba(138,45,36,.08)", border: "1px solid rgba(138,45,36,.25)" },
};
