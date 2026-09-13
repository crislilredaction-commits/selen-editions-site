"use client";

import { useEffect, useRef, useState } from "react";

const SIGNATURE_HEIGHT = 210;
type Json = Record<string, any>;
type Props = { role: string; token: string; slotId: string };

export default function LateAttendanceForm({ role, token, slotId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);
  const [slot, setSlot] = useState<Json | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/daily-portal/${token}/attendance`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error ?? "Créneau indisponible.");
        const found = (body.slots ?? []).find((item: Json) => item.id === slotId);
        if (!found) throw new Error("Créneau introuvable dans cette session.");
        const record = (found.attendance ?? [])[0];
        if (found.phase !== "closed") throw new Error("Ce créneau n’est pas encore terminé.");
        if (record?.status === "present") throw new Error("Votre présence est déjà enregistrée pour ce créneau.");
        if (record?.status && record.status !== "pending") throw new Error("Ce créneau possède déjà un statut de présence qui doit être vérifié par l’organisme.");
        setSlot(found);
      }).catch((cause) => setError(cause instanceof Error ? cause.message : "Créneau indisponible."));
  }, [slotId, token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !slot) return;
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
  }, [slot]);

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

  async function submit() {
    if (!canvasRef.current || !drawn.current || !consent) return setError("Confirmez votre accord puis signez.");
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/daily-portal/${token}/late-attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: slotId, consent: true, signature_data: canvasRef.current.toDataURL("image/png") }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "Régularisation impossible.");
    setNotice(`Présence enregistrée le ${new Date(body.signedAt).toLocaleString("fr-FR")}. Cette date réelle est conservée dans la preuve d’émargement.`);
  }

  return <main style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem 5rem", color: "var(--ink)" }}>
    <a href={`/daily/portail/${role}/${token}/presence`} style={{ color: "var(--rust)", fontWeight: 800, textDecoration: "none" }}>← Retour aux présences</a>
    <h1>Régulariser un émargement oublié</h1>
    <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>Cette régularisation ne modifie ni la date du créneau ni l’historique de la session. La preuve enregistrera l’heure exacte à laquelle vous signez maintenant.</p>
    {error ? <p role="alert" style={{ padding: 12, border: "1px solid #a64" }}>{error}</p> : null}
    {notice ? <p style={{ padding: 12, border: "1px solid #7a8" }}>{notice}</p> : null}
    {slot && !notice ? <section style={{ padding: 16, border: "1px solid var(--sepia-mid)", background: "var(--paper)" }}>
      <p><strong>Créneau concerné :</strong> {new Date(`${slot.date}T12:00:00`).toLocaleDateString("fr-FR")} · {String(slot.startsAt).slice(0,5)} à {String(slot.endsAt).slice(0,5)}</p>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "1rem 0", lineHeight: 1.5 }}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} style={{ width: 22, height: 22 }} /><span>Je confirme que cette signature correspond à ma présence sur le créneau indiqué et j’accepte la conservation de la preuve d’émargement dans mon dossier de formation.</span></label>
      <p style={{ fontWeight: 800 }}>Signez dans le cadre :</p>
      <canvas ref={canvasRef} aria-label="Zone de signature" onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} style={{ display: "block", width: "100%", height: SIGNATURE_HEIGHT, border: "1px solid var(--sepia-mid)", background: "#fffaf0", touchAction: "none" }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><button type="button" onClick={clearSignature} disabled={saving}>Effacer</button><button type="button" onClick={() => void submit()} disabled={saving}>{saving ? "Enregistrement…" : "Confirmer ma présence maintenant"}</button></div>
    </section> : null}
  </main>;
}
