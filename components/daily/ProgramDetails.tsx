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

type AvailableSession = {
  id: string;
  startDate?: string | null;
  endDate?: string | null;
  modality?: string | null;
  distanceMode?: string | null;
  locationAddress?: string | null;
  scheduleBlocks?: unknown;
  maxParticipants: number;
  placesRemaining: number;
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

function formatDate(value?: string | null) {
  if (!value) return "Date à confirmer";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function sessionPeriod(session: AvailableSession) {
  if (!session.startDate) return "Dates à confirmer";
  if (!session.endDate || session.endDate === session.startDate) return formatDate(session.startDate);
  return `Du ${formatDate(session.startDate)} au ${formatDate(session.endDate)}`;
}

function modalityLabel(session: AvailableSession) {
  if (session.modality === "presentiel") return "Présentiel";
  if (session.modality === "distanciel") return "Distanciel";
  if (session.modality === "mixte") return "Mixte";
  return session.modality || "Modalité à confirmer";
}

function saveSessionChoice(token: string, sessionId: string) {
  window.localStorage.setItem(`selen-daily-session-choice-${token}`, sessionId);
  const value = encodeURIComponent(`${token}.${sessionId}`);
  document.cookie = `selen_daily_session_choice=${value}; Path=/api/daily-registration/${token}; Max-Age=86400; SameSite=Lax`;
}

export default function ProgramDetails({ token }: { token: string }) {
  const [formation, setFormation] = useState<FormationProgram | null>(null);
  const [registrationKind, setRegistrationKind] = useState<"session" | "formation" | null>(null);
  const [availableSessions, setAvailableSessions] = useState<AvailableSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/daily-registration/${token}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (cancelled) return;

      setFormation(data?.session?.daily_formations ?? null);
      const kind = data?.registrationKind === "formation" ? "formation" : "session";
      setRegistrationKind(kind);

      if (kind !== "formation") {
        setSessionsLoaded(true);
        return;
      }

      const savedChoice = window.localStorage.getItem(`selen-daily-session-choice-${token}`) ?? "";
      const sessionsResponse = await fetch(`/api/daily-registration/${token}/available-sessions`, { cache: "no-store" });
      const sessionsData = await sessionsResponse.json().catch(() => null);
      if (cancelled) return;

      const sessions = sessionsResponse.ok && Array.isArray(sessionsData?.sessions)
        ? sessionsData.sessions as AvailableSession[]
        : [];
      setAvailableSessions(sessions);
      setSessionsLoaded(true);

      if (savedChoice && sessions.some((session) => session.id === savedChoice)) {
        setSelectedSessionId(savedChoice);
        saveSessionChoice(token, savedChoice);
      } else if (savedChoice) {
        window.localStorage.removeItem(`selen-daily-session-choice-${token}`);
      }
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

      {registrationKind === "formation" ? (
        <div style={styles.sessionSection}>
          <div>
            <p style={styles.kicker}>Planning disponible</p>
            <h3 style={styles.sessionTitle}>Choisissez votre session</h3>
            <p style={styles.muted}>
              Si des dates sont proposées, sélectionnez celles qui vous conviennent. Votre place sera confirmée après contrôle du dossier et signature de la convention.
            </p>
          </div>

          {!sessionsLoaded ? <p style={styles.muted}>Recherche des prochaines sessions...</p> : null}

          {sessionsLoaded && availableSessions.length === 0 ? (
            <div style={styles.infoBox}>
              <strong>Aucune session ouverte n&apos;est proposée pour le moment.</strong>
              <span>Vous pouvez tout de même transmettre votre candidature. L&apos;organisme pourra ensuite vous proposer des dates.</span>
            </div>
          ) : null}

          {availableSessions.length > 0 ? (
            <div style={styles.sessionGrid} role="radiogroup" aria-label="Sessions disponibles">
              {availableSessions.map((session) => {
                const selected = selectedSessionId === session.id;
                return (
                  <label key={session.id} style={{ ...styles.sessionOption, ...(selected ? styles.sessionOptionSelected : {}) }}>
                    <input
                      type="radio"
                      name="daily_public_session_choice"
                      value={session.id}
                      checked={selected}
                      onChange={() => {
                        setSelectedSessionId(session.id);
                        saveSessionChoice(token, session.id);
                      }}
                    />
                    <span style={styles.sessionOptionContent}>
                      <strong>{sessionPeriod(session)}</strong>
                      <span>{modalityLabel(session)}{session.locationAddress ? ` · ${session.locationAddress}` : ""}</span>
                      <span style={styles.places}>
                        {session.placesRemaining === 1
                          ? "1 place disponible"
                          : `${session.placesRemaining} places disponibles`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

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
  sessionSection: { display: "grid", gap: "0.85rem", borderTop: "1px solid rgba(178,138,98,0.3)", paddingTop: "1rem" },
  sessionTitle: { margin: "0.2rem 0 0.35rem", color: "var(--ink)", fontSize: "1.15rem" },
  sessionGrid: { display: "grid", gap: "0.65rem" },
  sessionOption: {
    display: "flex",
    gap: "0.75rem",
    alignItems: "flex-start",
    border: "1px solid var(--sepia-mid)",
    background: "rgba(255,255,255,0.2)",
    padding: "0.85rem",
    cursor: "pointer",
  },
  sessionOptionSelected: {
    borderColor: "var(--rust)",
    boxShadow: "inset 3px 0 0 var(--rust)",
    background: "rgba(138,75,36,0.06)",
  },
  sessionOptionContent: { display: "grid", gap: "0.2rem", color: "var(--ink)", lineHeight: 1.45 },
  places: { color: "var(--rust)", fontWeight: 800, fontSize: "0.9rem" },
  infoBox: {
    display: "grid",
    gap: "0.3rem",
    border: "1px solid var(--sepia-mid)",
    background: "rgba(178,138,98,0.08)",
    padding: "0.85rem",
    color: "var(--ink)",
    lineHeight: 1.5,
  },
};
