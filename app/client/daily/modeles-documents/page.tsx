"use client";

import { useEffect, useRef, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

type TemplateRow = { id: string; document_type: string; template_name: string; template_version: number; status: string };

const DEFAULT_TYPES = [
  ["convention", "Convention de formation"],
  ["convocation", "Convocation"],
  ["attestation_fin", "Attestation de fin de formation"],
  ["certificat_realisation", "Certificat de réalisation"],
  ["reglement_interieur", "Règlement intérieur"],
  ["livret_accueil", "Livret d'accueil"],
];

export default function DailyDocumentTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [documentType, setDocumentType] = useState("convention");
  const [templateName, setTemplateName] = useState("Convention de formation");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/client/daily/document-templates", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error ?? "Impossible de charger les modèles.");
    else setTemplates(body.templates ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choisissez un fichier modèle."); return; }
    setSaving(true); setError(""); setMessage("");
    const body = new FormData();
    body.set("file", file);
    body.set("document_type", documentType);
    body.set("template_name", templateName || documentType);
    const res = await fetch("/api/client/daily/document-templates", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "Enregistrement impossible.");
    else {
      setMessage("Modèle enregistré. La nouvelle version devient la version active.");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    }
    setSaving(false);
  }

  async function archive(id: string) {
    setError("");
    const res = await fetch(`/api/client/daily/document-templates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "Archivage impossible.");
    else await load();
  }

  if (loading) return <LoadingMascot message="Sélion ouvre vos modèles de documents…" />;

  return <main style={s.page}><div style={s.wrap}>
    <header style={s.hero}>
      <p style={s.kicker}>Selen Daily · Bibliothèque</p>
      <h1 style={s.h1}>Mes modèles de documents</h1>
      <p style={s.lead}>Remplacez ici les modèles utilisés par votre organisme. Chaque remplacement crée une nouvelle version et conserve l'ancienne dans l'historique.</p>
    </header>

    {error ? <p style={s.error}>{error}</p> : null}
    {message ? <p style={s.success}>{message}</p> : null}

    <section style={s.card}>
      <h2 style={s.h2}>Ajouter ou remplacer un modèle</h2>
      <div style={s.formGrid}>
        <label style={s.field}><span style={s.label}>Type de document</span><select value={documentType} onChange={(e) => { const value = e.target.value; setDocumentType(value); const found = DEFAULT_TYPES.find(([key]) => key === value); if (found) setTemplateName(found[1]); }} style={s.input}>{DEFAULT_TYPES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label style={s.field}><span style={s.label}>Nom du modèle</span><input value={templateName} onChange={(e) => setTemplateName(e.target.value)} style={s.input} /></label>
      </div>
      <div style={s.uploadRow}>
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" style={s.file} />
        <button type="button" onClick={upload} disabled={saving} style={s.primary}>{saving ? "Enregistrement…" : "Enregistrer ce modèle"}</button>
      </div>
      <p style={s.note}>Formats acceptés : PDF, DOC et DOCX, 10 Mo maximum.</p>
    </section>

    <section style={s.card}>
      <h2 style={s.h2}>Modèles actifs</h2>
      {templates.length === 0 ? <p style={s.empty}>Aucun modèle personnalisé pour le moment. Selen utilise ses modèles standards lorsque c'est prévu.</p> : <div style={s.list}>{templates.map((item) => <article key={item.id} style={s.row}>
        <div><strong>{item.template_name}</strong><p style={s.meta}>{item.document_type} · version {item.template_version}</p></div>
        <div style={s.actions}><a href={`/api/client/daily/document-templates?id=${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer" style={s.link}>Ouvrir</a><button type="button" onClick={() => void archive(item.id)} style={s.secondary}>Archiver</button></div>
      </article>)}</div>}
    </section>
  </div></main>;
}

const s: Record<string, React.CSSProperties> = {
  page:{minHeight:"100vh",background:"linear-gradient(180deg,#eadfbf,#e0cf9f)",padding:"2rem 1rem 5rem",color:"#392a19"},wrap:{maxWidth:1000,margin:"0 auto",display:"grid",gap:"1rem"},hero:{background:"#f8f0dc",border:"1px solid #d9c391",padding:"1.7rem 1.9rem"},kicker:{textTransform:"uppercase",letterSpacing:".14em",fontSize:11,fontWeight:800,color:"#9b682d"},h1:{fontFamily:"Georgia,serif",fontSize:"clamp(2rem,5vw,3rem)",margin:".35rem 0"},lead:{color:"#725e46",lineHeight:1.6,maxWidth:760},card:{background:"#f8f0dc",border:"1px solid #d9c391",padding:"1.4rem 1.5rem",boxShadow:"0 8px 20px rgba(57,42,25,.08)"},h2:{fontFamily:"Georgia,serif",marginTop:0},formGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:"1rem"},field:{display:"grid",gap:6},label:{fontSize:12,fontWeight:800,color:"#806c52"},input:{border:"1px solid #cdb785",background:"#fffaf0",padding:".75rem",color:"#392a19"},uploadRow:{display:"flex",flexWrap:"wrap",alignItems:"center",gap:".8rem",marginTop:"1rem"},file:{border:"1px solid #cdb785",background:"#fffaf0",padding:".65rem",flex:"1 1 280px"},primary:{border:"1px solid #7a2e22",background:"#7a2e22",color:"#f8f0dc",padding:".75rem 1rem",fontWeight:800,cursor:"pointer"},secondary:{border:"1px solid #b89b6c",background:"transparent",padding:".55rem .75rem",fontWeight:700,color:"#5c3a1e",cursor:"pointer"},note:{fontSize:13,color:"#7d6a51"},list:{display:"grid",gap:".65rem"},row:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"1rem",border:"1px solid rgba(160,106,44,.22)",padding:"1rem",background:"rgba(255,250,240,.55)"},meta:{margin:".25rem 0 0",color:"#826d51",fontSize:13},actions:{display:"flex",gap:".6rem",alignItems:"center"},link:{color:"#7a2e22",fontWeight:800,textDecoration:"none"},empty:{color:"#806c52"},error:{border:"1px solid #a64b3b",background:"#fff2ee",padding:".8rem",color:"#7d2e22"},success:{border:"1px solid #668153",background:"rgba(102,129,83,.1)",padding:".8rem",color:"#455a3b"}
};
