"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

type Formation = {
  id: string;
  title: string;
  version: number;
  public_registration_token: string;
  spontaneous_registration_task_status: "none" | "to_attach" | "attached" | "archived";
};

type ResponseBody = { formations?: Formation[]; error?: string };

function shortUrl(token: string) {
  if (typeof window === "undefined") return `/i/${token}`;
  return `${window.location.origin}/i/${token}`;
}

export default function RegistrationSharePage() {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/client/daily/registration-share", { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as ResponseBody;
      if (!response.ok) throw new Error(body.error ?? "Impossible de charger vos liens d'inscription.");
      setFormations(body.formations ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pendingCount = useMemo(() => formations.filter((formation) => formation.spontaneous_registration_task_status === "to_attach").length, [formations]);

  async function copy(token: string) {
    await navigator.clipboard.writeText(shortUrl(token));
    setMessage("Lien d'inscription copié. Vous pouvez maintenant l'ajouter à votre site ou à votre communication.");
  }

  async function markAttached(id: string) {
    setSavingId(id);
    setError("");
    const response = await fetch("/api/client/daily/registration-share", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "attached" }),
    });
    const body = await response.json().catch(() => ({})) as ResponseBody;
    if (!response.ok) setError(body.error ?? "La confirmation n'a pas pu être enregistrée.");
    else {
      setMessage("C'est noté : le lien d'inscription est intégré à votre communication. ✓");
      await load();
    }
    setSavingId("");
  }

  if (loading) return <LoadingMascot message="Sélion prépare vos liens d'inscription…" />;

  return (
    <main style={s.page}>
      <header style={s.hero}>
        <div>
          <p style={s.kicker}>Selen Daily · Inscriptions</p>
          <h1 style={s.h1}>Diffusez vos dossiers d'inscription</h1>
          <p style={s.lead}>Une fois votre programme validé par Selen, vous pouvez intégrer son lien court ou son QR code à votre site internet, vos emails, vos réseaux sociaux ou vos supports imprimés.</p>
        </div>
        <div style={s.metric}><strong>{pendingCount}</strong><span>lien{pendingCount > 1 ? "s" : ""} à diffuser</span></div>
      </header>

      {error ? <div style={s.error}>{error}</div> : null}
      {message ? <div style={s.success}>{message}</div> : null}

      {formations.length === 0 ? (
        <section style={s.empty}>
          <strong>Aucun lien d'inscription disponible pour le moment.</strong>
          <p style={s.muted}>Les liens apparaîtront ici dès qu'un programme aura été validé par Selen.</p>
        </section>
      ) : (
        <section style={s.list}>
          {formations.map((formation) => {
            const url = shortUrl(formation.public_registration_token);
            const done = formation.spontaneous_registration_task_status === "attached";
            return (
              <article key={formation.id} style={{ ...s.card, ...(done ? s.doneCard : {}) }}>
                <div style={s.cardMain}>
                  <div style={s.cardHead}>
                    <div>
                      <span style={done ? s.doneBadge : s.badge}>{done ? "Lien diffusé ✓" : "À intégrer"}</span>
                      <h2 style={s.h2}>{formation.title}</h2>
                      <p style={s.muted}>Programme validé · version {formation.version}</p>
                    </div>
                  </div>

                  <div style={s.linkBox}>
                    <span style={s.label}>Lien court</span>
                    <code style={s.code}>{url}</code>
                    <div style={s.actions}>
                      <button type="button" style={s.primary} onClick={() => void copy(formation.public_registration_token)}>Copier le lien</button>
                      <a href={url} target="_blank" rel="noreferrer" style={s.secondary}>Tester le lien</a>
                    </div>
                  </div>

                  {!done ? (
                    <div style={s.confirmBox}>
                      <p style={s.muted}>Lorsque vous avez ajouté ce lien ou le QR code à votre site ou à vos supports, confirmez-le ici pour retirer cette action de votre liste « À faire ».</p>
                      <button type="button" disabled={savingId === formation.id} style={s.confirm} onClick={() => void markAttached(formation.id)}>
                        {savingId === formation.id ? "Enregistrement…" : "✓ J'ai intégré ce lien"}
                      </button>
                    </div>
                  ) : null}
                </div>

                <aside style={s.qrBox}>
                  <img src={`/api/public-registration-qr/${encodeURIComponent(formation.public_registration_token)}`} alt={`QR code d'inscription pour ${formation.title}`} width={190} height={190} style={s.qr} />
                  <a href={`/api/public-registration-qr/${encodeURIComponent(formation.public_registration_token)}?download=1`} style={s.download}>Télécharger le QR code</a>
                  <small style={s.small}>Le QR code ouvre exactement le même dossier que le lien court.</small>
                </aside>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: "0 auto", padding: "2rem 1rem 5rem", color: "#3f2b1d" },
  hero: { display: "flex", justifyContent: "space-between", gap: 22, alignItems: "center", padding: "1.5rem", border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 18, marginBottom: 16 },
  kicker: { margin: 0, fontSize: 11, fontWeight: 800, color: "#8a4b24", textTransform: "uppercase", letterSpacing: ".12em" },
  h1: { margin: ".3rem 0 .5rem", fontSize: 32 }, h2: { margin: ".35rem 0", fontSize: 22 },
  lead: { margin: 0, maxWidth: 760, color: "#705744", lineHeight: 1.6 }, muted: { margin: ".25rem 0", color: "#806a58", lineHeight: 1.5 },
  metric: { minWidth: 130, textAlign: "center", padding: "1rem", borderRadius: 15, background: "#f2e3c4", display: "grid", gap: 2 },
  list: { display: "grid", gap: 14 }, card: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 230px", gap: 20, padding: "1.25rem", border: "1px solid #d8b989", background: "#fffaf0", borderRadius: 16 }, doneCard: { borderColor: "#94a979", background: "#f9fff3" }, cardMain: { display: "grid", gap: 14 }, cardHead: { display: "flex", justifyContent: "space-between", gap: 12 },
  badge: { display: "inline-block", padding: ".28rem .55rem", borderRadius: 999, background: "#f1dfb8", color: "#76461e", fontSize: 11, fontWeight: 800 }, doneBadge: { display: "inline-block", padding: ".28rem .55rem", borderRadius: 999, background: "#deebcf", color: "#4e693b", fontSize: 11, fontWeight: 800 },
  linkBox: { display: "grid", gap: 7 }, label: { fontSize: 12, fontWeight: 800 }, code: { display: "block", maxWidth: "100%", overflowWrap: "anywhere", padding: ".8rem", border: "1px solid #d8b989", background: "white", borderRadius: 9 }, actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  primary: { border: 0, borderRadius: 9, background: "#74401f", color: "white", padding: ".68rem .9rem", fontWeight: 800, cursor: "pointer" }, secondary: { display: "inline-flex", alignItems: "center", border: "1px solid #c9ad7d", borderRadius: 9, background: "#fffaf0", color: "#5d3b22", padding: ".62rem .85rem", fontWeight: 700, textDecoration: "none" },
  confirmBox: { padding: ".85rem", border: "1px solid #dfc796", background: "#fff7df", borderRadius: 10 }, confirm: { marginTop: 8, border: "1px solid #71875d", borderRadius: 9, background: "#71875d", color: "white", padding: ".65rem .85rem", fontWeight: 800, cursor: "pointer" },
  qrBox: { display: "grid", justifyItems: "center", alignContent: "start", gap: 8, padding: 12, border: "1px solid #dfc796", background: "white", borderRadius: 12 }, qr: { maxWidth: "100%", height: "auto" }, download: { color: "#74401f", fontWeight: 800, textDecoration: "none", textAlign: "center" }, small: { color: "#806a58", textAlign: "center", lineHeight: 1.4 },
  error: { padding: "1rem", border: "1px solid #b96c59", background: "#fff2ed", borderRadius: 12, marginBottom: 14 }, success: { padding: "1rem", border: "1px solid #8aa36c", background: "#f6fff0", borderRadius: 12, marginBottom: 14 }, empty: { padding: "2rem", border: "1px dashed #d8b989", background: "#fffaf0", textAlign: "center", borderRadius: 14 },
};
