"use client";

import { useEffect, useRef, useState } from "react";

type Data = {
  accessType: "shared" | "individual";
  session: { title: string };
  slot: { slot_date: string; starts_at: string; ends_at: string; label?: string | null };
  learner?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null;
  alreadySigned?: boolean;
  signedAt?: string | null;
  consentText: string;
  requiresEmailCode?: boolean;
};

const SIGNATURE_HEIGHT = 220;

export default function DailyAttendancePage({ params }: { params: { token: string } }) {
  const token = params.token;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);
  const [data, setData] = useState<Data | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  useEffect(() => {
    fetch(`/api/daily-attendance/${token}`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!response.ok) return setError(body?.error ?? "Lien indisponible.");
        setData(body);
        if (body?.learner?.email) setEmail(body.learner.email);
      })
      .catch(() => setError("Lien indisponible."));
  }, [token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.alreadySigned) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(SIGNATURE_HEIGHT * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = "#3f2b1d";
    context.fillStyle = "#fffaf0";
    context.fillRect(0, 0, rect.width, SIGNATURE_HEIGHT);
  }, [data]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    drawn.current = true;
    const value = point(event);
    context.beginPath();
    context.moveTo(value.x, value.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const value = point(event);
    context.lineTo(value.x, value.y);
    context.stroke();
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.fillStyle = "#fffaf0";
    context.fillRect(0, 0, rect.width, SIGNATURE_HEIGHT);
    drawn.current = false;
    drawing.current = false;
    setError("");
  }

  async function requestCode() {
    if (!email.trim()) return setError("Renseignez votre e-mail d'inscription.");
    setSendingCode(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/daily-attendance/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_code", email: email.trim().toLowerCase() }),
    });
    const body = await response.json().catch(() => null);
    setSendingCode(false);
    if (!response.ok) return setError(body?.error ?? "Le code n'a pas pu être envoyé.");
    setVerificationId(body?.verificationId ?? "");
    setCodeSent(true);
    setNotice("Un code à 6 chiffres vient d'être envoyé à votre adresse e-mail. Il est valable 10 minutes.");
  }

  async function submit() {
    if (!data || !canvasRef.current || !drawn.current || !consent) return setError("Confirmez votre accord puis signez.");
    if (data.accessType === "shared") {
      if (!email.trim()) return setError("Renseignez votre e-mail d'inscription.");
      if (!verificationId || !/^\d{6}$/.test(code)) return setError("Demandez puis saisissez le code à 6 chiffres reçu par e-mail.");
    }
    setSaving(true);
    setError("");
    const response = await fetch(`/api/daily-attendance/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        verification_id: verificationId,
        code,
        consent,
        signature_data: canvasRef.current.toDataURL("image/png"),
      }),
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return setError(body?.error ?? "Émargement impossible.");
    setData((current) => current ? { ...current, alreadySigned: true, signedAt: body?.signedAt ?? new Date().toISOString() } : current);
    setNotice("Votre présence est enregistrée et la preuve d'émargement est conservée dans le dossier de formation.");
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 50,
    padding: ".75rem .85rem",
    border: "1px solid #b28a62",
    borderRadius: 8,
    background: "#fff",
    color: "#3f2b1d",
    fontSize: 16,
  };

  const primaryButtonStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 50,
    padding: ".8rem 1rem",
    borderRadius: 8,
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
  };

  return (
    <main style={{ minHeight: "100vh", boxSizing: "border-box", padding: "max(.75rem, env(safe-area-inset-top)) .75rem max(1rem, env(safe-area-inset-bottom))", background: "#f7efe2", color: "#3f2b1d" }}>
      <section style={{ width: "100%", maxWidth: 620, boxSizing: "border-box", margin: "0 auto", padding: "clamp(1rem, 4vw, 1.5rem)", background: "#fffaf0", border: "1px solid #c9a055", borderRadius: 12 }}>
        <p style={{ marginTop: 0, fontWeight: 800, color: "#8a4b24" }}>Selen Daily · Émargement</p>
        <div style={{ display: "flex", gap: ".7rem", alignItems: "flex-start", margin: "0 0 1rem", padding: ".85rem", border: "1px solid #c9a055", borderRadius: 10, background: "#f7efe2", lineHeight: 1.5 }}>
          <span aria-hidden="true" style={{ fontSize: "1.35rem", lineHeight: 1 }}>📱</span>
          <div><strong>Le téléphone est recommandé.</strong><br /><span style={{ fontSize: ".95rem" }}>Pour émarger facilement, ouvrez cette page sur votre smartphone : la signature au doigt y est plus simple et plus rapide.</span></div>
        </div>
        {error ? <p role="alert" style={{ padding: ".75rem", border: "1px solid #8a4b24", borderRadius: 8 }}>{error}</p> : null}
        {notice ? <p style={{ padding: ".75rem", border: "1px solid #6a8a4a", borderRadius: 8 }}>{notice}</p> : null}
        {data ? <>
          <h1 style={{ marginBottom: ".5rem", fontSize: "clamp(1.5rem, 7vw, 2.1rem)", lineHeight: 1.15 }}>{data.session.title}</h1>
          <p style={{ lineHeight: 1.55 }}>{new Date(`${data.slot.slot_date}T12:00:00`).toLocaleDateString("fr-FR")} · {data.slot.starts_at.slice(0, 5)} à {data.slot.ends_at.slice(0, 5)}</p>
          {data.slot.label ? <p>{data.slot.label}</p> : null}
          {data.alreadySigned ? <p style={{ padding: ".85rem", border: "1px solid #6a8a4a", borderRadius: 8, lineHeight: 1.5 }}>Votre présence est enregistrée{data.signedAt ? ` depuis le ${new Date(data.signedAt).toLocaleString("fr-FR")}` : ""}.</p> : <>
            {data.accessType === "shared" ? <div style={{ display: "grid", gap: ".85rem", marginBottom: "1.1rem" }}>
              <label style={{ display: "grid", gap: ".45rem", fontWeight: 700 }}>E-mail d'inscription<input type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setCodeSent(false); setVerificationId(""); setCode(""); }} style={fieldStyle} /></label>
              <button type="button" onClick={() => void requestCode()} disabled={sendingCode} style={primaryButtonStyle}>{sendingCode ? "Envoi..." : codeSent ? "Renvoyer un code" : "Recevoir mon code"}</button>
              {codeSent ? <label style={{ display: "grid", gap: ".45rem", fontWeight: 700 }}>Code reçu par e-mail<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} style={{ ...fieldStyle, textAlign: "center", letterSpacing: ".35rem", fontSize: "1.25rem", fontWeight: 800 }} /></label> : null}
            </div> : null}
            <label style={{ display: "flex", gap: ".75rem", alignItems: "flex-start", margin: "1.1rem 0", lineHeight: 1.5, cursor: "pointer" }}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} style={{ width: 22, height: 22, flex: "0 0 auto", marginTop: 1 }} /><span>{data.consentText}</span></label>
            <p style={{ margin: "0 0 .45rem", fontWeight: 700 }}>Signez avec votre doigt dans le cadre :</p>
            <canvas ref={canvasRef} aria-label="Zone de signature" onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} style={{ display: "block", width: "100%", height: SIGNATURE_HEIGHT, boxSizing: "border-box", border: "1px solid #b28a62", borderRadius: 8, background: "#fffaf0", touchAction: "none" }} />
            <div style={{ display: "grid", gap: ".7rem", marginTop: ".8rem" }}>
              <button type="button" onClick={clearSignature} disabled={saving} style={{ ...primaryButtonStyle, background: "transparent", color: "#3f2b1d", border: "1px solid #b28a62", fontWeight: 700 }}>Effacer et recommencer</button>
              <button type="button" onClick={() => void submit()} disabled={saving} style={primaryButtonStyle}>{saving ? "Enregistrement..." : "Confirmer ma présence"}</button>
            </div>
          </>}
        </> : !error ? <p>Ouverture du lien...</p> : null}
      </section>
    </main>
  );
}
