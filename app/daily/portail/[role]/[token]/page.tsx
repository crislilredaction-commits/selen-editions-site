"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";

type JsonRecord = Record<string, unknown>;
type PortalData = {
  access: {
    portalType: "learner" | "enterprise" | "trainer";
    roleLabel: string;
    entityName: string | null;
    entityEmail: string | null;
  };
  session: JsonRecord & {
    schedule_blocks?: JsonRecord[] | null;
    location_address?: string | null;
    remote_url?: string | null;
    adaptation_needed?: boolean | null;
    daily_formations?: {
      title?: string | null;
      duration_hours?: string | number | null;
      duration_days?: string | number | null;
      modality?: string | null;
    } | null;
  };
  onboarding?: {
    organisation_name?: string | null;
    platform_contact_email?: string | null;
  } | null;
  learner?: JsonRecord | null;
  company?: JsonRecord | null;
  companies?: JsonRecord[];
  participants?: JsonRecord[];
  trainers?: JsonRecord[];
  responses?: JsonRecord[];
  conventions?: Array<JsonRecord & {
    id: string;
    version?: number | null;
    document_name?: string | null;
    daily_convention_signatures?: Array<JsonRecord & {
      signatory_type?: string | null;
      token?: string | null;
      status?: string | null;
      signed_at?: string | null;
    }> | null;
  }>;
  convocations?: Array<JsonRecord & {
    id: string;
    version?: number | null;
    document_name?: string | null;
    status?: string | null;
    sent_at?: string | null;
  }>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function fullName(row?: JsonRecord | null) {
  return [row?.first_name, row?.last_name].map(text).filter(Boolean).join(" ");
}

function scheduleText(blocks?: JsonRecord[] | null) {
  if (!Array.isArray(blocks) || blocks.length === 0) return "Dates à venir";
  return blocks
    .map((block) => [block.date, block.start && block.end ? `${block.start}-${block.end}` : "", block.note].map(text).filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n") || "Dates à venir";
}

function signatureStatus(conventions: PortalData["conventions"] = []) {
  const signatures = conventions.flatMap((convention) => convention.daily_convention_signatures ?? []);
  if (conventions.length === 0) return "a_venir";
  if (signatures.length === 0) return "en_attente";
  if (signatures.every((signature) => signature.status === "signed")) return "termine";
  return "a_faire";
}

function statusLabel(status: string) {
  if (status === "termine") return "terminé";
  if (status === "a_faire") return "à faire";
  if (status === "en_attente") return "en attente";
  return "à venir";
}

function timelineFor(data: PortalData) {
  const responses = data.responses ?? [];
  const conventions = data.conventions ?? [];
  const hasResponse = responses.length > 0;
  const hasPositioning = responses.some((response) => {
    const positioning = response.positioning_answers;
    return positioning && typeof positioning === "object" && Object.keys(positioning).length > 0;
  });
  const hasConvention = conventions.length > 0;
  const hasConvocation = (data.convocations ?? []).length > 0;
  const hasSentConvocation = (data.convocations ?? []).some((convocation) => convocation.status === "sent" || convocation.status === "viewed");
  const signature = signatureStatus(conventions);

  if (data.access.portalType === "enterprise") {
    return [
      ["Dossier entreprise", hasResponse ? "termine" : "a_faire"],
      ["Participants", (data.participants ?? []).length > 0 ? "termine" : "a_faire"],
      ["Conventions", hasConvention ? "termine" : "en_attente"],
      ["Signatures", signature],
      ["Convocations", hasSentConvocation ? "termine" : hasConvocation ? "a_faire" : "a_venir"],
      ["Formation", "a_venir"],
      ["Certificats", "a_venir"],
    ];
  }

  if (data.access.portalType === "trainer") {
    return [
      ["Session créée", "termine"],
      ["Dossiers reçus", hasResponse ? "termine" : "en_attente"],
      ["Positionnements reçus", hasPositioning ? "termine" : "en_attente"],
      ["Adaptations à traiter", data.session.adaptation_needed ? "a_faire" : "en_attente"],
      ["Convention/signatures", signature],
      ["Convocation", hasSentConvocation ? "termine" : hasConvocation ? "a_faire" : "a_venir"],
      ["Formation", "a_venir"],
    ];
  }

  return [
    ["Dossier d'inscription", hasResponse ? "termine" : "a_faire"],
    ["Positionnement", hasPositioning ? "termine" : "en_attente"],
    ["Convention", hasConvention ? "termine" : "en_attente"],
    ["Signature", signature],
    ["Convocation", hasSentConvocation ? "termine" : hasConvocation ? "a_faire" : "a_venir"],
    ["Formation", "a_venir"],
    ["Evaluation", "a_venir"],
    ["Satisfaction", "a_venir"],
    ["Certificat", "a_venir"],
  ];
}

export default function DailyPortalPage({ params }: { params: { role: string; token: string } }) {
  const { token } = params;
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/daily-portal/${token}`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      setLoading(false);
      if (!res.ok) {
        setError(payload?.error ?? "Ce portail n'est pas disponible pour le moment. Vous pouvez contacter Selen si besoin.");
        return;
      }
      setData(payload);
    }
    void load();
  }, [token]);

  const timeline = useMemo(() => data ? timelineFor(data) : [], [data]);
  const formation = data?.session.daily_formations;
  const trainers = data?.trainers ?? [];
  const conventions = data?.conventions ?? [];
  const convocations = data?.convocations ?? [];
  const pendingSignature = conventions
    .flatMap((convention) => convention.daily_convention_signatures ?? [])
    .find((signature) => signature.status !== "signed" && signature.token);

  return (
    <main className="gazette-paper" style={s.page}>
      <Header />
      <section style={s.hero}>
        <p className="gazette-label">Portail Selen Daily</p>
        <h1 style={s.title}>{data?.access.entityName || formation?.title || "Session Daily"}</h1>
        <p style={s.subtitle}>
          {data ? `Vue ${data.access.roleLabel} pour ${formation?.title ?? "votre formation"}.` : "Ouverture de votre portail..."}
        </p>
      </section>

      {loading ? <p style={s.muted}>Ouverture de votre portail Selen Daily...</p> : null}
      {error ? <p style={s.error}>{error}</p> : null}

      {data ? (
        <section style={s.grid}>
          <article style={s.card}>
            <strong>Session</strong>
            <span>{formation?.title ?? "Formation Daily"}</span>
            <span>{scheduleText(data.session.schedule_blocks)}</span>
            <span>{text(data.session.location_address) || text(data.session.remote_url) || "Lieu à venir"}</span>
            <span>Organisme : {data.onboarding?.organisation_name ?? "Organisme de formation"}</span>
            {trainers.length > 0 ? <span>Formateur : {trainers.map(fullName).filter(Boolean).join(", ")}</span> : null}
          </article>

          <article style={s.card}>
            <strong>Timeline</strong>
            {timeline.map(([label, status]) => (
              <div key={label} style={s.timelineRow}>
                <span>{label}</span>
                <em>{statusLabel(status)}</em>
              </div>
            ))}
          </article>

          <article style={s.card}>
            <strong>À prévoir</strong>
            {data.responses?.length ? null : <span>Compléter le dossier d&apos;inscription si Selen vous a transmis le lien.</span>}
            {pendingSignature?.token ? (
              <a href={`/daily-signature/${pendingSignature.token}`} style={s.link}>Signer la convention</a>
            ) : null}
            {conventions.length > 0 ? <span>Consulter ou télécharger la convention disponible.</span> : null}
            {convocations.length > 0 ? <span>Consulter ou télécharger la convocation.</span> : null}
            {data.session.adaptation_needed && data.access.portalType === "trainer" ? <span>Vérifier les adaptations utiles à la session.</span> : null}
            {data.responses?.length && !pendingSignature && conventions.length === 0 ? <span>Aucune action immédiate pour le moment.</span> : null}
          </article>

          <article style={s.card}>
            <strong>Documents</strong>
            {conventions.map((convention) => (
              <a key={convention.id} href={`/api/daily-portal/${token}/convention?id=${convention.id}`} target="_blank" rel="noreferrer" style={s.link}>
                {convention.document_name ?? `Convention v${convention.version ?? 1}`}
              </a>
            ))}
            {convocations.map((convocation) => (
              <a key={convocation.id} href={`/api/daily-portal/${token}/convocation?id=${convocation.id}`} target="_blank" rel="noreferrer" style={s.link}>
                {convocation.document_name ?? `Convocation v${convocation.version ?? 1}`}
              </a>
            ))}
            {conventions.length === 0 ? <span>Convention à venir.</span> : null}
            {convocations.length === 0 ? <span>Convocation à venir.</span> : null}
            <span>Certificat à venir.</span>
          </article>

          {data.access.portalType !== "learner" ? (
            <article style={s.card}>
              <strong>Participants</strong>
              {(data.participants ?? []).map((participant, index) => (
                <span key={`${text(participant.email)}_${index}`}>
                  {fullName(participant) || text(participant.email) || "Participant"} - dossier {data.responses?.some((response) => text(response.respondent_email).toLowerCase() === text(participant.email).toLowerCase()) ? "reçu" : "en attente"}
                </span>
              ))}
              {(data.participants ?? []).length === 0 ? <span>Participants à venir.</span> : null}
            </article>
          ) : null}

          {data.access.portalType === "trainer" ? (
            <article style={s.card}>
              <strong>Besoins et positionnements</strong>
              {(data.responses ?? []).map((response) => (
                <span key={text(response.id)}>
                  {fullName(response) || text(response.company_name) || "Réponse reçue"} - {response.adaptation_needed ? "adaptation signalée" : "à consulter"}
                </span>
              ))}
              {(data.responses ?? []).length === 0 ? <span>Aucune réponse reçue pour le moment.</span> : null}
            </article>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "1rem", color: "var(--ink)" },
  hero: { maxWidth: 1040, margin: "1rem auto", display: "grid", gap: "0.5rem" },
  title: { color: "var(--ink)", margin: 0, fontSize: "clamp(1.7rem, 4vw, 2.6rem)" },
  subtitle: { color: "var(--ink-soft)", lineHeight: 1.6, margin: 0 },
  grid: { maxWidth: 1040, margin: "1rem auto 3rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" },
  card: { display: "grid", gap: "0.65rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", padding: "1rem", lineHeight: 1.5 },
  timelineRow: { display: "flex", justifyContent: "space-between", gap: "1rem", borderBottom: "1px solid rgba(178,138,98,0.24)", paddingBottom: "0.35rem" },
  link: { color: "var(--rust)", fontWeight: 800, textDecoration: "none" },
  error: { maxWidth: 1040, margin: "1rem auto", border: "1px solid var(--rust)", background: "rgba(138,75,36,0.08)", color: "var(--rust)", padding: "0.75rem" },
  muted: { maxWidth: 1040, margin: "1rem auto", color: "var(--ink-soft)" },
};
