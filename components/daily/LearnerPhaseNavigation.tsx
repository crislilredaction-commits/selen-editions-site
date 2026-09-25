"use client";

import { useEffect, useMemo, useState } from "react";

type Json = Record<string, any>;
type Props = { role: string; token: string };
type Phase = "before" | "during" | "after";

const labels: Record<Phase, string> = {
  before: "Avant la formation",
  during: "Pendant la formation",
  after: "Après la formation",
};

const text = (value: unknown) => String(value ?? "").trim();
const positioningDone = (value: unknown) => ["completed", "validated", "done"].includes(text(value));

function sessionPhase(session: Json | undefined): Phase {
  const now = Date.now();
  const start = session?.start_date ? new Date(`${session.start_date}T00:00:00`).getTime() : Number.NaN;
  const end = session?.end_date ? new Date(`${session.end_date}T23:59:59`).getTime() : Number.NaN;
  if (Number.isFinite(start) && now < start) return "before";
  if (Number.isFinite(end) && now > end) return "after";
  return "during";
}

function docLabel(doc: Json) {
  if (doc.document_type === "convocation") return "Convocation";
  if (doc.document_type === "registration_positioning") return "Inscription / positionnement";
  if (doc.document_type === "training_program") return "Programme de formation";
  if (doc.document_type === "completion_certificate") return "Certificat de réalisation";
  return doc.logical_name || "Document";
}

export default function LearnerPhaseNavigation({ role, token }: Props) {
  const [data, setData] = useState<Json | null>(null);
  const [resources, setResources] = useState<Json[]>([]);
  const [selected, setSelected] = useState<Phase>("before");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/daily-portal/${token}`, { cache: "no-store" }),
      fetch(`/api/daily-portal/${token}/resources`, { cache: "no-store" }),
    ]).then(async ([portalResponse, resourcesResponse]) => {
      const portal = await portalResponse.json().catch(() => ({}));
      const docs = await resourcesResponse.json().catch(() => ({}));
      if (!portalResponse.ok) throw new Error(portal.error ?? "Parcours indisponible.");
      setData(portal);
      setResources(resourcesResponse.ok ? docs.documents ?? [] : []);
      setSelected(sessionPhase(portal.session));
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Parcours indisponible."));
  }, [token]);

  const current = sessionPhase(data?.session);
  const actions = useMemo(() => {
    if (!data) return [] as Array<{ label: string; detail: string; href?: string; done?: boolean }>;
    if (selected === "before") {
      const positioning = positioningDone(data.enrolment?.positioning_status);
      const convocation = resources.find((doc) => doc.document_type === "convocation");
      return [
        { label: "Programme de formation", detail: "Téléchargez le programme complet de votre formation au format PDF.", href: `/api/daily-portal/${token}/program` },
        positioning
          ? { label: "Positionnement", detail: "Votre positionnement est enregistré.", done: true }
          : { label: "Positionnement", detail: "Le questionnaire reste consultable tant que votre inscription est active.", href: `/daily/portail/${role}/${token}/positionnement` },
        convocation
          ? { label: "Convocation", detail: "Retrouvez les informations pratiques de la session.", href: `/api/daily-portal/${token}/document?id=${convocation.id}` }
          : { label: "Convocation", detail: "Aucune convocation publiée pour le moment." },
      ];
    }
    if (selected === "during") {
      return [
        { label: "Présences & émargement", detail: "Consultez vos créneaux et retrouvez un émargement oublié lié à cette session.", href: `/daily/portail/${role}/${token}/presence` },
      ];
    }
    return [
      { label: "Évaluation de fin de formation", detail: "Retrouvez votre évaluation après la session.", href: `/daily/portail/${role}/${token}/evaluation` },
      { label: "Présences & émargement", detail: "Un émargement oublié reste accessible depuis l’historique de cette session.", href: `/daily/portail/${role}/${token}/presence` },
    ];
  }, [data, resources, role, selected, token]);

  return <section style={{ maxWidth: 1100, margin: "1rem auto", padding: "0 1rem", color: "var(--ink)" }}>
    <div style={{ border: "1px solid var(--sepia-mid)", background: "var(--paper)", padding: "1rem" }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--rust)" }}>Mon parcours</p>
      <h2 style={{ margin: ".35rem 0 .5rem" }}>Avant · Pendant · Après</h2>
      <p style={{ margin: "0 0 1rem", color: "var(--ink-soft)", lineHeight: 1.55 }}>Vous pouvez consulter librement les trois étapes. L’étape actuelle est seulement mise en évidence : elle ne bloque jamais l’accès aux autres.</p>
      {error ? <p style={{ padding: ".7rem", border: "1px solid #a64" }}>{error}</p> : null}
      <div role="tablist" aria-label="Étapes de la formation" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
        {(Object.keys(labels) as Phase[]).map((phase) => <button key={phase} type="button" role="tab" aria-selected={selected === phase} onClick={() => setSelected(phase)} style={{ padding: ".75rem .55rem", border: selected === phase ? "2px solid var(--rust)" : "1px solid var(--sepia-mid)", background: current === phase ? "rgba(201,160,85,.18)" : "transparent", color: "var(--ink)", fontWeight: 800, cursor: "pointer" }}>{labels[phase]}{current === phase ? " · étape actuelle" : ""}</button>)}
      </div>
      <div role="tabpanel" style={{ marginTop: 12, display: "grid", gap: 8 }}>
        {actions.map((action) => <div key={action.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: ".8rem", border: "1px solid var(--sepia-mid)", flexWrap: "wrap" }}><div><strong>{action.label}</strong><p style={{ margin: ".25rem 0 0", color: "var(--ink-soft)", fontSize: 14 }}>{action.detail}</p></div>{action.href ? <a href={action.href} target={action.href.startsWith("/api/") ? "_blank" : undefined} rel={action.href.startsWith("/api/") ? "noreferrer" : undefined} style={{ fontWeight: 800, color: "var(--rust)" }}>Ouvrir</a> : action.done ? <span style={{ fontWeight: 800 }}>Fait</span> : null}</div>)}
      </div>
      {resources.length ? <details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer", fontWeight: 800 }}>Documents de cette session ({resources.length})</summary><div style={{ display: "grid", gap: 6, marginTop: 8 }}>{resources.map((doc) => <a key={doc.id} href={`/api/daily-portal/${token}/document?id=${doc.id}`} target="_blank" rel="noreferrer" style={{ color: "var(--rust)", fontWeight: 700 }}>{docLabel(doc)}</a>)}</div></details> : null}
    </div>
  </section>;
}
