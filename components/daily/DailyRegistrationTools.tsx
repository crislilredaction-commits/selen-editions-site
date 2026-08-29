"use client";

import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Formation = {
  id: string;
  title: string;
  version: number | null;
  public_registration_token: string;
  spontaneous_registration_task_status: string | null;
};

export default function DailyRegistrationTools() {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await assistanceFetch("/api/client/daily/registration-share", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setFormations(data.formations ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function copy(token: string) {
    const url = `${window.location.origin}/i/${token}`;
    await navigator.clipboard.writeText(url);
    setMessage("Lien d'inscription copié.");
  }

  if (loading || formations.length === 0) return null;

  return (
    <section style={s.section}>
      <div style={s.heading}>
        <div>
          <p style={s.eyebrow}>Inscriptions</p>
          <h2 style={s.h2}>Liens et QR codes de vos formations validées</h2>
          <p style={s.lead}>Utilisez-les directement sur votre site internet, vos emails, vos réseaux sociaux ou vos supports imprimés.</p>
        </div>
      </div>

      {message ? <p style={s.success}>{message}</p> : null}

      <div style={s.grid}>
        {formations.map((formation) => {
          const shortPath = `/i/${formation.public_registration_token}`;
          const qrPath = `/api/public-registration-qr/${encodeURIComponent(formation.public_registration_token)}`;
          return (
            <article key={formation.id} style={s.card}>
              <div>
                <span style={s.badge}>Programme validé</span>
                <h3 style={s.h3}>{formation.title}</h3>
                <p style={s.muted}>Version {formation.version ?? 1}</p>
              </div>

              <div style={s.tools}>
                <div style={s.linkColumn}>
                  <label style={s.label}>Lien court d'inscription</label>
                  <code style={s.code}>{typeof window !== "undefined" ? `${window.location.origin}${shortPath}` : shortPath}</code>
                  <div style={s.actions}>
                    <button type="button" style={s.primary} onClick={() => void copy(formation.public_registration_token)}>Copier le lien</button>
                    <a href={shortPath} target="_blank" rel="noreferrer" style={s.secondary}>Tester le lien</a>
                  </div>
                </div>

                <div style={s.qrColumn}>
                  <img src={qrPath} alt={`QR code d'inscription — ${formation.title}`} width={150} height={150} style={s.qr} />
                  <a href={`${qrPath}?download=1`} style={s.secondary}>Télécharger le QR code</a>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  section: { maxWidth: 1120, margin: "0 auto 5rem", padding: "0 1rem", color: "#3f2b1d" },
  heading: { marginBottom: 14 },
  eyebrow: { margin: 0, fontSize: 11, fontWeight: 800, color: "#8a4b24", letterSpacing: ".11em", textTransform: "uppercase" },
  h2: { margin: ".25rem 0", fontSize: 24 },
  h3: { margin: ".35rem 0", fontSize: 19 },
  lead: { margin: 0, color: "#705744", lineHeight: 1.55 },
  muted: { margin: 0, color: "#806a58", fontSize: 13 },
  success: { padding: ".75rem 1rem", border: "1px solid #8aa36c", background: "#f6fff0", borderRadius: 10 },
  grid: { display: "grid", gap: 12 },
  card: { padding: "1.2rem", border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 16, display: "grid", gap: 14 },
  badge: { display: "inline-block", fontSize: 11, fontWeight: 800, padding: ".3rem .55rem", borderRadius: 999, background: "#edf5e7", color: "#4f6f3c" },
  tools: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 180px", gap: 18, alignItems: "center" },
  linkColumn: { display: "grid", gap: 8 },
  qrColumn: { display: "grid", gap: 8, justifyItems: "center" },
  label: { fontSize: 12, fontWeight: 800 },
  code: { display: "block", maxWidth: "100%", overflowWrap: "anywhere", padding: ".7rem", border: "1px solid #dec79e", borderRadius: 9, background: "white" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  primary: { border: 0, borderRadius: 9, background: "#74401f", color: "white", padding: ".65rem .9rem", fontWeight: 800, cursor: "pointer" },
  secondary: { display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", border: "1px solid #c9ad7d", borderRadius: 9, background: "#fffaf0", color: "#5d3b22", padding: ".65rem .9rem", fontWeight: 700 },
  qr: { border: "1px solid #dec79e", borderRadius: 10, background: "white", padding: 6 },
};
