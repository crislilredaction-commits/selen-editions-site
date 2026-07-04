"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";

type SignaturePayload = {
  id: string;
  signatory_type: string;
  signatory_name: string | null;
  signatory_email: string | null;
  status: string;
  signed_at: string | null;
  daily_conventions?: {
    document_name?: string | null;
    recipient_type?: string | null;
    recipient_name?: string | null;
    company_name?: string | null;
    version?: number | null;
    generated_at?: string | null;
    daily_sessions?: {
      daily_formations?: { title?: string | null } | null;
    } | null;
  } | null;
};

export default function DailySignaturePage({ params }: { params: { token: string } }) {
  const token = params.token;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [consent, setConsent] = useState(false);
  const [signature, setSignature] = useState<SignaturePayload | null>(null);
  const [consentText, setConsentText] = useState("");
  const [conservationText, setConservationText] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/daily-signature/${token}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      setLoading(false);
      if (!res.ok) {
        setError(data?.error ?? "Lien de signature indisponible.");
        return;
      }
      setSignature(data.signature);
      setConsentText(data.consentText ?? "");
      setConservationText(data.conservationText ?? "");
    }
    void load();
  }, [token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || signature?.status === "signed") return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(190 * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#3f2b1d";
    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(0, 0, rect.width, 190);
  }, [signature?.status]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    hasDrawnRef.current = true;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function stopDrawing() {
    drawingRef.current = false;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(0, 0, rect.width, 190);
    hasDrawnRef.current = false;
  }

  async function submit() {
    if (!consent) {
      setError("Merci de cocher le consentement avant de signer.");
      return;
    }
    if (!hasDrawnRef.current || !canvasRef.current) {
      setError("Merci de dessiner votre signature.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/daily-signature/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consent,
        signature_data: canvasRef.current.toDataURL("image/png"),
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Signature impossible.");
      return;
    }
    setSignature((current) => current ? { ...current, status: "signed", signed_at: data.signature?.signed_at ?? new Date().toISOString() } : current);
    setSuccess("Convention signee. Merci, la preuve est horodatee et conservee dans le dossier.");
  }

  const convention = Array.isArray(signature?.daily_conventions)
    ? signature?.daily_conventions[0]
    : signature?.daily_conventions;
  const formationTitle = convention?.daily_sessions?.daily_formations?.title ?? "Formation Daily";
  const alreadySigned = signature?.status === "signed";

  return (
    <main className="gazette-paper" style={s.page}>
      <Header />
      <section style={s.card}>
        <p className="gazette-label">Signature Selen Daily</p>
        <h1 style={s.title}>{formationTitle}</h1>
        {loading ? <p style={s.muted}>Chargement du lien de signature...</p> : null}
        {error ? <p style={s.error}>{error}</p> : null}
        {success ? <p style={s.notice}>{success}</p> : null}
        {signature ? (
          <>
            <div style={s.summary}>
              <p><strong>Signataire</strong><span>{signature.signatory_name || signature.signatory_email || "Non renseigne"}</span></p>
              <p><strong>Role</strong><span>{signature.signatory_type}</span></p>
              <p><strong>Convention</strong><span>{convention?.document_name ?? "Convention Daily"}</span></p>
            </div>

            <a href={`/api/daily-signature/${token}/download`} target="_blank" rel="noreferrer" style={s.download}>
              Consulter / telecharger la convention
            </a>

            {alreadySigned ? (
              <p style={s.notice}>
                Cette convention a deja ete signee le {signature.signed_at ? new Date(signature.signed_at).toLocaleString("fr-FR") : "date conservee"}.
              </p>
            ) : (
              <>
                <label style={s.check}>
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                  <span>{consentText}</span>
                </label>
                <p style={s.muted}>{conservationText}</p>
                <canvas
                  ref={canvasRef}
                  style={s.canvas}
                  onPointerDown={startDrawing}
                  onPointerMove={draw}
                  onPointerUp={stopDrawing}
                  onPointerCancel={stopDrawing}
                />
                <div style={s.actions}>
                  <button type="button" className="btn-ghost" onClick={clearSignature}>
                    <span>Effacer la signature</span>
                  </button>
                  <button type="button" className="btn-ink" onClick={() => void submit()} disabled={saving}>
                    <span>{saving ? "Signature..." : "Signer la convention"}</span>
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "1rem", color: "var(--ink)" },
  card: { maxWidth: 760, margin: "1rem auto 3rem", display: "grid", gap: "1rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", borderLeft: "4px solid var(--ocre-gold)", padding: "1rem" },
  title: { margin: 0, color: "var(--ink)", fontSize: "clamp(1.6rem, 4vw, 2.4rem)" },
  summary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" },
  canvas: { width: "100%", height: 190, border: "1px solid rgba(178,138,98,0.55)", background: "#fffaf0", touchAction: "none" },
  check: { display: "flex", gap: "0.7rem", alignItems: "flex-start", lineHeight: 1.5 },
  actions: { display: "flex", gap: "0.7rem", flexWrap: "wrap" },
  download: { color: "var(--rust)", fontWeight: 800, textDecoration: "none" },
  notice: { border: "1px solid rgba(106,138,74,0.45)", background: "rgba(106,138,74,0.08)", color: "#496532", padding: "0.75rem", lineHeight: 1.5 },
  error: { border: "1px solid var(--rust)", background: "rgba(138,75,36,0.08)", color: "var(--rust)", padding: "0.75rem", lineHeight: 1.5 },
  muted: { color: "var(--ink-soft)", lineHeight: 1.6 },
};
