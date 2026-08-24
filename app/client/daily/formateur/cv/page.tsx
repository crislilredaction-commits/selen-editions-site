"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type TrainerState = {
  trainer: {
    display_name?: string | null;
    cv_updated_at?: string | null;
    cv_review_due_at?: string | null;
  };
};

export default function TrainerCvPage() {
  const [data, setData] = useState<TrainerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/client/daily/trainer-annual-review", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? "Chargement impossible.");
    setData(payload as TrainerState);
  }, []);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Chargement impossible.")).finally(() => setLoading(false));
  }, [load]);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/client/daily/trainer-annual-review/cv", { method: "POST", body });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Mise à jour du CV impossible.");
      return;
    }
    await load();
    setMessage("Votre CV est à jour. Selen vous le redemandera dans un an.");
  }

  return (
    <main className="gazette-paper" style={styles.page}>
      <Link href="/client/daily/formateur/suivi-annuel" style={styles.back}>← Mon suivi formateur</Link>
      <header className="gazette-cta" style={styles.hero}>
        <p className="gazette-label">Selen Daily · Formateur</p>
        <h1 className="gazette-hero-title">Mon CV</h1>
        <p style={styles.muted}>Une mise à jour par an suffit. Chaque nouvelle version est conservée dans votre dossier formateur.</p>
      </header>

      {error ? <p style={styles.error}>{error}</p> : null}
      {message ? <p style={styles.success}>{message}</p> : null}

      <section style={styles.card}>
        {loading ? <p>Chargement…</p> : data ? (
          <>
            <h2 style={{ marginTop: 0 }}>{data.trainer.display_name || "Formateur"}</h2>
            <dl style={styles.dl}>
              <div><dt style={styles.term}>Dernière mise à jour</dt><dd style={styles.value}>{formatDate(data.trainer.cv_updated_at) || "Aucune mise à jour enregistrée"}</dd></div>
              <div><dt style={styles.term}>Prochaine mise à jour</dt><dd style={styles.value}>{formatDate(data.trainer.cv_review_due_at) || "À faire maintenant"}</dd></div>
            </dl>
            <label style={styles.fileButton}>
              {busy ? "Envoi en cours…" : "Déposer mon CV à jour"}
              <input
                type="file"
                accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.doc,.docx"
                disabled={busy}
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <p style={styles.hint}>PDF, DOC ou DOCX · 10 Mo maximum.</p>
          </>
        ) : null}
      </section>
    </main>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 860, margin: "0 auto", padding: "1.5rem 1rem 4rem" },
  back: { color: "var(--rust)", textDecoration: "none" },
  hero: { marginTop: "1rem", padding: "1.5rem", border: "1px solid var(--sepia-mid)" },
  card: { marginTop: "1rem", padding: "1.25rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)" },
  muted: { color: "var(--ink-soft)", lineHeight: 1.55 },
  dl: { display: "grid", gap: "1rem", margin: "1.25rem 0" },
  term: { fontWeight: 800 },
  value: { margin: ".25rem 0 0", color: "var(--ink-soft)" },
  fileButton: { display: "inline-block", cursor: "pointer", border: "1px solid var(--rust)", background: "rgba(138,75,36,.08)", color: "var(--rust)", padding: ".7rem 1rem", fontWeight: 800 },
  hint: { fontSize: ".9rem", color: "var(--ink-soft)" },
  success: { padding: ".8rem 1rem", background: "rgba(61,106,74,.1)", border: "1px solid rgba(61,106,74,.35)" },
  error: { padding: ".8rem 1rem", color: "#8a2d24", background: "rgba(138,45,36,.08)", border: "1px solid rgba(138,45,36,.25)" },
};
