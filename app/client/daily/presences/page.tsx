"use client";

import { useEffect, useRef, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Session = { id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; daily_formations?: { title?: string } | { title?: string }[] | null };
type ScheduleBlock = { date?: string; start?: string; end?: string; note?: string };
type Slot = { id: string; slot_date: string; starts_at: string; ends_at: string; mode: string; status: string; daily_attendance_records?: { enrolment_id: string; status: string }[] };
type Enrolment = { id: string; status: string; daily_learners?: { first_name?: string | null; last_name?: string | null; email?: string | null } | { first_name?: string | null; last_name?: string | null; email?: string | null }[] | null };
type Overview = { session: { modality?: string | null; distance_mode?: string | null; schedule_blocks?: ScheduleBlock[] | null }; slots: Slot[]; enrolments: Enrolment[] };
type GeneratedAccess = { url: string; channel: "qr" | "chat" | "link" };

type QrApi = {
  toCanvas: (canvas: HTMLCanvasElement, value: string, options: Record<string, unknown>, callback: (error?: Error | null) => void) => void;
};

function formationTitle(session: Session) {
  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  return formation?.title ?? session.internal_reference ?? "Session Daily";
}
function learnerName(enrolment: Enrolment) {
  const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
  return [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant";
}
function blockKey(block: ScheduleBlock, index: number) {
  return `${block.date ?? "date"}-${block.start ?? "start"}-${block.end ?? "end"}-${index + 1}`;
}

let qrLibraryPromise: Promise<QrApi> | null = null;
function loadQrLibrary() {
  if (typeof window === "undefined") return Promise.reject(new Error("Navigateur indisponible."));
  const existing = (window as unknown as { QRCode?: QrApi }).QRCode;
  if (existing) return Promise.resolve(existing);
  if (qrLibraryPromise) return qrLibraryPromise;
  qrLibraryPromise = new Promise<QrApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      const api = (window as unknown as { QRCode?: QrApi }).QRCode;
      if (api) resolve(api);
      else reject(new Error("Le module QR n'a pas pu être initialisé."));
    };
    script.onerror = () => reject(new Error("Le module QR n'a pas pu être chargé."));
    document.head.appendChild(script);
  });
  return qrLibraryPromise;
}

export default function DailyPresencePage() {
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [blockModes, setBlockModes] = useState<Record<string, string>>({});
  const [generatedAccess, setGeneratedAccess] = useState<GeneratedAccess | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadSessions() {
    const response = await assistanceFetch("/api/client/daily/attendance", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Chargement impossible.");
    setSessions(data.sessions ?? []);
    setSessionId((current) => current || data.sessions?.[0]?.id || "");
  }
  async function loadOverview(id: string) {
    if (!id) return setOverview(null);
    const response = await assistanceFetch(`/api/client/daily/attendance?session_id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? "Chargement impossible.");
    const next = data.overview ?? null;
    setOverview(next);
    if (next?.session?.modality === "mixte" && (next?.slots?.length ?? 0) === 0) {
      const defaults: Record<string, string> = {};
      (next.session.schedule_blocks ?? []).forEach((block: ScheduleBlock, index: number) => {
        defaults[blockKey(block, index)] = "presentiel";
      });
      setBlockModes(defaults);
    } else setBlockModes({});
  }
  useEffect(() => { void loadSessions(); }, []);
  useEffect(() => { setGeneratedAccess(null); void loadOverview(sessionId); }, [sessionId]);

  useEffect(() => {
    if (generatedAccess?.channel !== "qr" || !qrCanvasRef.current) return;
    let cancelled = false;
    void loadQrLibrary()
      .then((qr) => {
        if (cancelled || !qrCanvasRef.current) return;
        qr.toCanvas(qrCanvasRef.current, generatedAccess.url, { width: 280, margin: 2, errorCorrectionLevel: "M" }, (qrError) => {
          if (!cancelled && qrError) setError("Le QR code n'a pas pu être affiché. Le lien reste disponible juste en dessous.");
        });
      })
      .catch(() => {
        if (!cancelled) setError("Le QR code n'a pas pu être affiché. Le lien reste disponible juste en dessous.");
      });
    return () => { cancelled = true; };
  }, [generatedAccess]);

  async function run(payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    const response = await assistanceFetch("/api/client/daily/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Action impossible.");
    if (data.path) {
      const url = `${window.location.origin}${data.path}`;
      const channel = data.channel === "qr" || data.channel === "chat" ? data.channel : "link";
      setGeneratedAccess({ url, channel });
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      setMessage(channel === "qr" ? "Accès QR créé. Le lien a aussi été copié." : "Lien créé et copié.");
    } else {
      setGeneratedAccess(null);
      setMessage("Mise à jour enregistrée.");
    }
    await loadOverview(sessionId);
  }

  const blocks = overview?.session.schedule_blocks ?? [];

  return <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1rem 4rem", color: "#3f2b1d" }}>
    <p style={{ fontWeight: 800, color: "#8a4b24" }}>Selen Daily · Pendant la formation</p>
    <h1>Présences & émargements</h1>
    <p>Prépare les créneaux, génère les accès d'émargement et suis les présences.</p>
    {error ? <p style={{ padding: ".7rem", border: "1px solid #8a4b24" }}>{error}</p> : null}
    {message ? <p style={{ padding: ".7rem", border: "1px solid #6a8a4a" }}>{message}</p> : null}
    {generatedAccess ? <section style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #c9a055", marginBottom: "1rem", textAlign: generatedAccess.channel === "qr" ? "center" : "left" }}>
      {generatedAccess.channel === "qr" ? <>
        <h2 style={{ marginTop: 0 }}>QR d'émargement présentiel</h2>
        <p>Affiche ce QR aux participants. L'identité sera confirmée par e-mail et code avant signature.</p>
        <canvas ref={qrCanvasRef} aria-label="QR code d'émargement" style={{ maxWidth: "100%", height: "auto" }} />
      </> : <h2 style={{ marginTop: 0 }}>{generatedAccess.channel === "chat" ? "Lien à publier dans le chat" : "Lien individuel"}</h2>}
      <p style={{ overflowWrap: "anywhere" }}><a href={generatedAccess.url} target="_blank" rel="noreferrer">{generatedAccess.url}</a></p>
    </section> : null}
    <section style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", marginBottom: "1rem" }}>
      <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} style={{ width: "100%", padding: ".7rem" }}>
        <option value="">Choisir une session</option>
        {sessions.map((session) => <option key={session.id} value={session.id}>{formationTitle(session)}</option>)}
      </select>
      {sessionId && overview?.slots.length === 0 ? <>
        {overview.session.modality === "mixte" ? <div style={{ display: "grid", gap: ".65rem", marginTop: ".9rem" }}>
          <strong>Mode d'émargement par créneau</strong>
          {blocks.map((block, index) => {
            const key = blockKey(block, index);
            return <label key={key} style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) minmax(190px,.6fr)", gap: ".75rem", alignItems: "center" }}>
              <span>{block.date || "Date"} · {block.start || "--:--"}–{block.end || "--:--"}{block.note ? ` · ${block.note}` : ""}</span>
              <select value={blockModes[key] ?? "presentiel"} onChange={(event) => setBlockModes((current) => ({ ...current, [key]: event.target.value }))} style={{ padding: ".55rem" }}>
                <option value="presentiel">Présentiel · QR</option>
                <option value="distanciel_synchrone">Distanciel direct · chat</option>
                <option value="distanciel_asynchrone">Distanciel asynchrone · lien individuel</option>
              </select>
            </label>;
          })}
        </div> : null}
        <button disabled={busy} onClick={() => void run({ action: "prepare_session", block_modes: blockModes })} style={{ marginTop: ".8rem", padding: ".7rem" }}>Préparer l'émargement</button>
      </> : null}
    </section>
    {overview?.slots.map((slot) => <section key={slot.id} style={{ padding: "1rem", background: "#fffaf0", border: "1px solid #d8b989", marginBottom: "1rem" }}>
      <h2>{new Date(`${slot.slot_date}T12:00:00`).toLocaleDateString("fr-FR")} · {slot.starts_at.slice(0, 5)}–{slot.ends_at.slice(0, 5)}</h2>
      <p>{slot.mode.replaceAll("_", " ")} · {slot.status}</p>
      {slot.mode !== "distanciel_asynchrone" && slot.status !== "closed" ? <button disabled={busy} onClick={() => void run({ action: "create_link", slot_id: slot.id })} style={{ padding: ".55rem" }}>{slot.mode === "presentiel" ? "Créer et afficher le QR" : "Créer le lien à partager dans le chat"}</button> : null}
      <div style={{ marginTop: ".8rem" }}>{overview.enrolments.map((enrolment) => {
        const record = slot.daily_attendance_records?.find((row) => row.enrolment_id === enrolment.id);
        return <div key={enrolment.id} style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap", padding: ".55rem 0", borderTop: "1px solid #ead8bc" }}>
          <strong style={{ minWidth: 180 }}>{learnerName(enrolment)}</strong><span>{record?.status ?? "pending"}</span>
          {slot.mode === "distanciel_asynchrone" && slot.status !== "closed" ? <button disabled={busy} onClick={() => void run({ action: "create_link", slot_id: slot.id, enrolment_id: enrolment.id })}>Lien individuel</button> : null}
          {record?.status !== "present" ? <><button disabled={busy} onClick={() => void run({ action: "set_absence", slot_id: slot.id, enrolment_id: enrolment.id, status: "absent" })}>Absent</button><button disabled={busy} onClick={() => void run({ action: "set_absence", slot_id: slot.id, enrolment_id: enrolment.id, status: "excused" })}>Justifiée</button></> : null}
        </div>;
      })}</div>
      {slot.status !== "closed" ? <button disabled={busy} onClick={() => void run({ action: "close_slot", slot_id: slot.id })} style={{ marginTop: ".8rem" }}>Clore le créneau</button> : null}
    </section>)}
  </main>;
}
