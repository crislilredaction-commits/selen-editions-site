"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import { PROGRAMME_ACCEPT_ATTRIBUTE } from "@/lib/daily/formationGuidance";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";
import { DAILY_SOURCE_MAX_BYTES, dailyFormationSourceMime, prepareDailyFormationSourceUpload, type DailyFormationSourceKind, type DailySourceUploadState } from "@/lib/daily/formationSourceUpload";

type Props = { kind: DailyFormationSourceKind; label: string; value?: string | null; formationId?: string | null; onUploaded: (url: string) => void; onStateChange: (state: DailySourceUploadState) => void; help?: string; disabled?: boolean };

export default function FormationSourceUpload({ kind, label, value, formationId, onUploaded, onStateChange, help, disabled = false }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [slot] = useState(() => crypto.randomUUID());
  const active = useRef(true), inFlight = useRef(false), authorization = useRef<string | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function request(body: Record<string, unknown>) {
    const response = await assistanceFetch("/api/client/daily/uploads/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Import impossible.");
    return data;
  }
  async function complete() {
    const data = await request({ action: "complete", authorization: authorization.current });
    if (!data.url) throw new Error("L’import n’a pas pu être confirmé.");
    if (!active.current) return;
    setFileName(data.name); onUploaded(String(data.url)); authorization.current = null;
    setError(""); onStateChange("idle");
  }
  async function run(task: () => Promise<void>) {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setUploading(true); setError(""); onStateChange("pending");
    try { await task(); }
    catch (cause) { if (active.current) { setError(cause instanceof Error ? cause.message : "Import impossible."); onStateChange("failed"); } }
    finally { inFlight.current = false; if (active.current) setUploading(false); }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target, file = input.files?.[0]; if (!file) return;
    await run(async () => {
      authorization.current = null;
      const mime = dailyFormationSourceMime(file.name, file.type);
      if (!mime || file.size < 1 || file.size > DAILY_SOURCE_MAX_BYTES) throw new Error("Choisissez un fichier PDF, DOC ou DOCX de 10 Mo maximum.");
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const ticket = await request({ action: "prepare", kind, slot, name: file.name, mime_type: mime, size_bytes: file.size, sha256, formation_id: formationId || null, previous_document_url: value || null });
      if (!ticket.authorization || !ticket.path || !ticket.token) throw new Error("Import indisponible.");
      if (!active.current) return;
      authorization.current = ticket.authorization;
      const prepared = prepareDailyFormationSourceUpload(file, mime);
      const { error: uploadError } = await createSupabaseBrowserClient().storage.from("documents").uploadToSignedUrl(ticket.path, ticket.token, prepared.body, prepared.options);
      if (uploadError) throw new Error("Le transfert n’a pas pu être confirmé. Réessayez la vérification ou choisissez à nouveau le fichier.");
      if (active.current) await complete();
    });
    input.value = "";
  }

  return <div style={{ display: "grid", gap: 7 }}>
    <span style={{ fontSize: 13, fontWeight: 800 }}>{label}</span>
    {help ? <small style={{ color: "#806a58", lineHeight: 1.45 }}>{help}</small> : null}
    <label style={{ display: "inline-flex", width: "fit-content", alignItems: "center", gap: 8, border: "1px solid #8a4b24", borderRadius: 10, padding: "9px 12px", background: "#fffaf0", fontWeight: 700, cursor: uploading ? "wait" : "pointer" }}>
      <input type="file" accept={PROGRAMME_ACCEPT_ATTRIBUTE} disabled={uploading || disabled} onChange={upload} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }} />
      {uploading ? "Import en cours…" : value ? "Remplacer le fichier" : "Choisir un fichier"}
    </label>
    {value ? <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "#5d704c" }}>✓ {fileName || "Document original conservé"}</span>
      <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 800, color: "#8a4b24" }}>Ouvrir / télécharger l’original</a>
    </div> : null}
    {error ? <div style={{ display: "grid", gap: 7 }}><span role="alert" style={{ fontSize: 12, color: "#9b3d2d" }}>{error}</span>
      {authorization.current ? <button type="button" disabled={disabled || uploading} onClick={() => void run(complete)}>Réessayer la vérification</button> : null}
      <button type="button" disabled={disabled || uploading} onClick={() => { authorization.current = null; setError(""); onStateChange("idle"); }}>Abandonner cet import</button>
    </div> : null}
  </div>;
}
