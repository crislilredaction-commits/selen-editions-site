"use client";

import { ChangeEvent, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import { PROGRAMME_ACCEPT_ATTRIBUTE } from "@/lib/daily/formationGuidance";

type UploadKind = "training_program_source" | "positioning_questionnaire_source";
type Props = { kind: UploadKind; label: string; value?: string | null; onUploaded: (url: string) => void; help?: string };

export default function FormationSourceUpload({ kind, label, value, onUploaded, help }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [slot] = useState(() => crypto.randomUUID());

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return; setUploading(true); setError("");
    try {
      const body = new FormData(); body.append("file", file); body.append("kind", kind); body.append("slot", slot);
      const response = await assistanceFetch("/api/client/daily/uploads", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error ?? "Import impossible.");
      setFileName(data.name ?? file.name); onUploaded(String(data.url));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import impossible."); }
    finally { setUploading(false); event.target.value = ""; }
  }

  return <div style={{ display: "grid", gap: 7 }}><span style={{ fontSize: 13, fontWeight: 800 }}>{label}</span>{help ? <small style={{ color: "#806a58", lineHeight: 1.45 }}>{help}</small> : null}<label style={{ display: "inline-flex", width: "fit-content", alignItems: "center", gap: 8, border: "1px solid #8a4b24", borderRadius: 10, padding: "9px 12px", background: "#fffaf0", fontWeight: 700, cursor: uploading ? "wait" : "pointer" }}><input type="file" accept={PROGRAMME_ACCEPT_ATTRIBUTE} disabled={uploading} onChange={upload} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }} />{uploading ? "Import en cours…" : value ? "Remplacer le fichier" : "Choisir un fichier"}</label>{value ? <span style={{ fontSize: 12, color: "#5d704c" }}>✓ {fileName || "Document importé"}</span> : null}{error ? <span role="alert" style={{ fontSize: 12, color: "#9b3d2d" }}>{error}</span> : null}</div>;
}
