"use client";

import { useEffect, useRef } from "react";

export default function ApplicationSignature({
  consentText,
  consent,
  onConsentChange,
  onSignatureChange,
}: {
  consentText: string;
  consent: boolean;
  onConsentChange: (value: boolean) => void;
  onSignatureChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(190 * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = "#3f2b1d";
    context.fillStyle = "#fffaf0";
    context.fillRect(0, 0, rect.width, 190);
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.lineTo(position.x, position.y);
    context.stroke();
  }

  function stopDrawing() {
    if (!drawingRef.current || !canvasRef.current) return;
    drawingRef.current = false;
    onSignatureChange(canvasRef.current.toDataURL("image/png"));
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.fillStyle = "#fffaf0";
    context.fillRect(0, 0, rect.width, 190);
    onSignatureChange("");
  }

  return (
    <section style={styles.wrapper}>
      <div>
        <h3 style={styles.title}>Signature du dossier</h3>
        <p style={styles.muted}>Signez directement avec votre doigt ou votre souris. La signature et l&apos;heure d&apos;envoi seront conservées avec vos réponses.</p>
      </div>
      <label style={styles.check}>
        <input type="checkbox" checked={consent} onChange={(event) => onConsentChange(event.target.checked)} />
        <span>{consentText || "Je certifie l'exactitude des informations renseignées dans ce dossier de candidature."}</span>
      </label>
      <canvas
        ref={canvasRef}
        aria-label="Zone de signature du dossier de candidature"
        style={styles.canvas}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
      />
      <button type="button" className="btn-ghost" style={styles.clearButton} onClick={clearSignature}>
        <span>Effacer la signature</span>
      </button>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: "grid", gap: "0.75rem", borderTop: "1px solid rgba(178,138,98,0.35)", paddingTop: "1rem", marginTop: "0.25rem" },
  title: { margin: 0, color: "var(--ink)" },
  muted: { margin: 0, color: "var(--ink-soft)", lineHeight: 1.5 },
  check: { display: "flex", gap: "0.7rem", alignItems: "flex-start", lineHeight: 1.5, color: "var(--ink)" },
  canvas: { width: "100%", height: 190, border: "1px solid rgba(178,138,98,0.55)", background: "#fffaf0", touchAction: "none" },
  clearButton: { width: "fit-content" },
};
