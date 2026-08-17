import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import FeedbackResponseForm from "./FeedbackResponseForm";
import NewFeedbackForm from "./NewFeedbackForm";

type FeedbackRow = {
  id: string;
  session_id: string | null;
  submission_type: string;
  stakeholder_type: string;
  submitter_name: string;
  subject: string;
  message: string;
  status: string;
  selen_review_note: string | null;
  forwarded_at: string | null;
  organisation_response: string | null;
  resolved_at: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  complaint: "Réclamation",
  suggestion: "Suggestion",
};

const STAKEHOLDER_LABELS: Record<string, string> = {
  learner: "Apprenant",
  trainer: "Formateur",
  company: "Entreprise",
  client: "Client",
  other: "Autre partie prenante",
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function DailyManagerFeedbackPage() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) {
    return <main style={s.page}><section style={s.card}><h1>Réclamations & suggestions</h1><p>{context.error}</p></section></main>;
  }

  const roles = context.workspace.membership.roles ?? [];
  const isManager = roles.includes("manager");
  let rows: FeedbackRow[] = [];

  if (isManager) {
    const admin = getAdminSupabase();
    const organisationId = context.workspace.membership.organisation_id;
    const { data, error } = await admin
      .from("daily_stakeholder_feedback")
      .select("id,session_id,submission_type,stakeholder_type,submitter_name,subject,message,status,selen_review_note,forwarded_at,organisation_response,resolved_at,created_at")
      .eq("organisation_id", organisationId)
      .in("status", ["forwarded_to_organisation", "resolved"])
      .order("forwarded_at", { ascending: false, nullsFirst: false })
      .limit(300);

    if (error) throw new Error(error.message);
    rows = (data ?? []) as FeedbackRow[];
  }

  return (
    <main style={s.page}>
      <section style={s.hero}>
        <p className="gazette-label">Selen Daily</p>
        <h1 style={s.title}>Réclamations & suggestions</h1>
        <p style={s.subtitle}>
          Toute partie prenante connectée peut écrire directement à Selen. Les demandes ne sont transmises à l’organisme qu’après revue.
        </p>
      </section>

      <NewFeedbackForm />

      {isManager ? (
        <>
          <section style={s.metrics}>
            <Metric value={rows.filter((item) => item.status === "forwarded_to_organisation").length} label="À traiter" />
            <Metric value={rows.filter((item) => item.status === "resolved").length} label="Résolues" />
          </section>

          <section style={s.list}>
            {rows.length === 0 ? (
              <article style={s.card}>
                <h2 style={s.cardTitle}>Aucune demande transmise</h2>
                <p style={s.muted}>Les messages restent d’abord dans la file privée Selen. Ils n’apparaissent ici qu’après revue et transmission.</p>
              </article>
            ) : rows.map((item) => (
              <article key={item.id} style={s.card}>
                <div style={s.row}>
                  <div>
                    <h2 style={s.cardTitle}>{item.subject}</h2>
                    <p style={s.muted}>
                      {TYPE_LABELS[item.submission_type] ?? item.submission_type} · {STAKEHOLDER_LABELS[item.stakeholder_type] ?? item.stakeholder_type} · {item.submitter_name}
                    </p>
                  </div>
                  <span style={item.status === "resolved" ? s.badgeDone : s.badgeOpen}>
                    {item.status === "resolved" ? "Résolue" : "À traiter"}
                  </span>
                </div>

                <dl style={s.details}>
                  <Info label="Transmise par Selen" value={formatDateTime(item.forwarded_at)} />
                  <Info label="Message initial" value={item.message} multiline />
                  {item.selen_review_note ? <Info label="Note Selen" value={item.selen_review_note} multiline /> : null}
                  {item.organisation_response ? <Info label="Réponse enregistrée" value={item.organisation_response} multiline /> : null}
                  {item.resolved_at ? <Info label="Clôturée le" value={formatDateTime(item.resolved_at)} /> : null}
                </dl>

                <p style={s.reference}>Référence : {item.id}{item.session_id ? ` · Session ${item.session_id}` : ""}</p>
                {item.status === "forwarded_to_organisation" ? (
                  <FeedbackResponseForm id={item.id} initialResponse={item.organisation_response ?? ""} />
                ) : null}
              </article>
            ))}
          </section>
        </>
      ) : (
        <section style={s.card}>
          <h2 style={s.cardTitle}>Suivi par Selen</h2>
          <p style={s.muted}>La vue de traitement des demandes transmises à l’organisme reste réservée au dirigeant ou responsable.</p>
        </section>
      )}
    </main>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <article style={s.metric}><strong style={s.metricValue}>{value}</strong><span>{label}</span></article>;
}

function Info({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return <div><dt style={s.dt}>{label}</dt><dd style={{ ...s.dd, whiteSpace: multiline ? "pre-wrap" : "normal" }}>{value}</dd></div>;
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 980, margin: "0 auto", padding: "2rem 1rem 4rem" },
  hero: { display: "grid", gap: ".45rem", marginBottom: "1.25rem" },
  title: { margin: 0, color: "var(--ink)", fontSize: "clamp(1.8rem, 4vw, 2.6rem)" },
  subtitle: { margin: 0, color: "var(--ink-soft)", lineHeight: 1.6 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: ".8rem", marginBottom: "1rem" },
  metric: { border: "1px solid var(--sepia-mid)", background: "var(--paper)", padding: "1rem", display: "grid", gap: ".25rem" },
  metricValue: { fontSize: "1.8rem", color: "var(--rust)" },
  list: { display: "grid", gap: "1rem" },
  card: { border: "1px solid var(--sepia-mid)", background: "var(--paper)", padding: "1rem" },
  cardTitle: { margin: 0, color: "var(--ink)", fontSize: "1.15rem" },
  muted: { margin: ".35rem 0 0", color: "var(--ink-soft)", lineHeight: 1.5 },
  row: { display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" },
  badgeOpen: { padding: ".35rem .55rem", border: "1px solid var(--rust)", color: "var(--rust)", fontWeight: 800, fontSize: ".82rem" },
  badgeDone: { padding: ".35rem .55rem", border: "1px solid #5e7f5e", color: "#476847", fontWeight: 800, fontSize: ".82rem" },
  details: { display: "grid", gap: ".75rem", margin: "1rem 0 0" },
  dt: { fontWeight: 800, color: "var(--ink)" },
  dd: { margin: ".2rem 0 0", color: "var(--ink-soft)", lineHeight: 1.55 },
  reference: { margin: "1rem 0 0", paddingTop: ".65rem", borderTop: "1px solid rgba(178,138,98,.25)", color: "var(--ink-soft)", fontSize: ".78rem" },
};
