"use client";

import { useEffect, useState } from "react";

type FormationProgram = {
  title?: string | null;
  global_objective?: string | null;
  target_audience?: string | null;
  prerequisites?: string | null;
  duration_hours?: number | string | null;
  duration_days?: number | string | null;
  modality?: string | null;
  modality_details?: string | null;
  access_delays?: string | null;
  registration_methods?: string | null;
  price?: string | null;
  detailed_program?: string | null;
  detailed_program_document_url?: string | null;
  accessibility?: string | null;
  pedagogical_resources?: string | null;
  pedagogical_methods?: string | null;
  evaluation_methods?: string | null;
};

function Value({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return (
    <div style={styles.value}>
      <strong>{label}</strong>
      <span style={styles.preline}>{String(value)}</span>
    </div>
  );
}

export default function ProgramDetails({ token }: { token: string }) {
  const [formation, setFormation] = useState<FormationProgram | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/daily-registration/${token}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (!cancelled) setFormation(data?.session?.daily_formations ?? null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!formation) return null;

  const duration = [
    formation.duration_hours ? `${formation.duration_hours} h` : "",
    formation.duration_days ? `${formation.duration_days} jour(s)` : "",
  ].filter(Boolean).join(" · ");

  return (
    <section style={styles.card} aria-label="Programme de la formation">
      <div style={styles.heading}>
        <div>
          <p style={styles.kicker}>Formation choisie</p>
          <h2 style={styles.title}>{formation.title ?? "Programme de formation"}</h2>
          <p style={styles.muted}>Vous pouvez consulter le programme avant de compléter votre dossier.</p>
        </div>
        <button type="button" className={open ? "btn-ghost" : "btn-ink"} onClick={() => setOpen((value) => !value)}>
          <span>{open ? "Masquer le programme" : "Consulter le programme"}</span>
        </button>
      </div>

      {open ? (
        <div style={styles.content}>
          <Value label="Objectif" value={formation.global_objective} />
          <Value label="Public concerné" value={formation.target_audience} />
          <Value label="Prérequis" value={formation.prerequisites} />
          <Value label="Durée" value={duration} />
          <Value label="Modalité" value={formation.modality} />
          <Value label="Précisions sur la modalité" value={formation.modality_details} />
          <Value label="Délai d'accès" value={formation.access_delays} />
          <Value label="Modalités d'inscription" value={formation.registration_methods} />
          <Value label="Tarif" value={formation.price} />
          <Value label="Programme détaillé" value={formation.detailed_program} />
          <Value label="Méthodes pédagogiques" value={formation.pedagogical_methods} />
          <Value label="Moyens pédagogiques et techniques" value={formation.pedagogical_resources} />
          <Value label="Évaluation" value={formation.evaluation_methods} />
          <Value label="Accessibilité" value={formation.accessibility} />
          {formation.detailed_program_document_url ? (
            <a
              className="btn-ghost"
              href={formation.detailed_program_document_url}
              target="_blank"
              rel="noreferrer"
              style={styles.link}
            >
              <span>Ouvrir le document programme</span>
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--paper)",
    border: "1px solid var(--sepia-mid)",
    borderLeft: "4px solid var(--ocre-gold)",
    padding: "1.2rem",
    display: "grid",
    gap: "1rem",
  },
  heading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "1rem",
  },
  kicker: { margin: 0, color: "var(--ink-soft)", fontWeight: 800, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em" },
  title: { margin: "0.25rem 0", color: "var(--ink)" },
  muted: { margin: 0, color: "var(--ink-soft)", lineHeight: 1.5 },
  content: { display: "grid", gap: "0.85rem", borderTop: "1px solid rgba(178,138,98,0.3)", paddingTop: "1rem" },
  value: { display: "grid", gap: "0.25rem", color: "var(--ink)", lineHeight: 1.5 },
  preline: { whiteSpace: "pre-line" },
  link: { width: "fit-content", textDecoration: "none" },
};
