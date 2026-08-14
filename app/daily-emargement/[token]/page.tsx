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
    canvas.height = Math.floor(180 * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = "#3f2b1d";
    context.fillStyle = "#fffaf0";
    context.fillRect(0, 0, rect.width, 180);
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

  return (
    <main style={{ minHeight: "100vh", padding: "1.5rem", background: "#f7efe2", color: "#3f2b1d" }}>
      <section style={{ maxWidth: 720, margin: "2rem auto", padding: "1.25rem", background: "#fffaf0", border: "1px solid #c9a055" }}>
        <p style={{ fontWeight: 800, color: "#8a4b24" }}>Selen Daily · Émargement</p>
        {error ? <p style={{ padding: ".75rem", border: "1px solid #8a4b24" }}>{error}</p> : null}
        {notice ? <p style={{ padding: ".75rem", border: "1px solid #6a8a4a" }}>{notice}</p> : null}
        {data ? <>
          <h1>{data.session.title}</h1>
          <p>{new Date(`${data.slot.slot_date}T12:00:00`).toLocaleDateString("fr-FR")} · {data.slot.starts_at.slice(0, 5)} à {data.slot.ends_at.slice(0, 5)}</p>
          {data.slot.label ? <p>{data.slot.label}</p> : null}
          {data.alreadySigned ? <p style={{ padding: ".75rem", border: "1px solid #6a8a4a" }}>Votre présence est enregistrée{data.signedAt ? ` depuis le ${new Date(data.signedAt).toLocaleString("fr-FR")}` : ""}.</p> : <>
            {data.accessType === "shared" ? <div style={{ display: "grid", gap: ".75rem", marginBottom: "1rem" }}>
              <label style={{ display: "grid", gap: ".4rem" }}>E-mail d'inscription<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setCodeSent(false); setVerificationId(""); setCode(""); }} style={{ padding: ".7rem" }} /></label>
              <button type="button" onClick={() => void requestCode()} disabled={sendingCode} style={{ width: "fit-content", padding: ".65rem .9rem", fontWeight: 700 }}>{sendingCode ? "Envoi..." : codeSent ? "Renvoyer un code" : "Recevoir mon code"}</button>
              {codeSent ? <label style={{ display: "grid", gap: ".4rem" }}>Code reçu par e-mail<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} style={{ padding: ".7rem", letterSpacing: ".3rem", fontWeight: 800 }} /></label> : null}
            </div> : null}
            <label style={{ display: "flex", gap: ".6rem", margin: "1rem 0" }}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{data.consentText}</span></label>
            <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} style={{ width: "100%", height: 180, border: "1px solid #b28a62", background: "#fff", touchAction: "none" }} />
            <button type="button" onClick={() => void submit()} disabled={saving} style={{ marginTop: "1rem", padding: ".8rem 1rem", fontWeight: 800 }}>{saving ? "Enregistrement..." : "Confirmer ma présence"}</button>
          </>}
        </> : !error ? <p>Ouverture du lien...</p> : null}
      </section>
    </main>
  );
}
