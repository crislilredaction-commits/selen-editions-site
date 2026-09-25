"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import FormationSourceUpload from "@/components/daily/FormationSourceUpload";

type CreationMode = "program_import" | "selen_form";
type PrerequisiteMode = "none" | "required";
type Requirement = { id: string; label: string; description: string; required: true };
const input: CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #d8d8de", borderRadius: 10, font: "inherit" };
const card: CSSProperties = { border: "1px solid #e4e4e8", borderRadius: 14, padding: 18, background: "#fff" };
type FormationCreateResponse = { error?: string; formation?: { id?: string } };

export default function DailyNewFormationPage() {
  const router = useRouter();
  const [mode, setMode] = useState<CreationMode>("program_import");
  const [prerequisiteMode, setPrerequisiteMode] = useState<PrerequisiteMode>("none");
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [programUrl, setProgramUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const fd = new FormData(event.currentTarget); const text = (name: string) => String(fd.get(name) ?? "").trim();
    const prerequisiteRequirements = prerequisiteMode === "required" ? requirements.filter((item) => item.label.trim()).map((item) => ({ ...item, label: item.label.trim(), description: item.description.trim() })) : [];
    try {
      if (mode === "program_import" && !programUrl) throw new Error("Importez le programme original avant d’enregistrer la formation.");
      if (prerequisiteMode === "required" && prerequisiteRequirements.length === 0) throw new Error("Ajoutez au moins un justificatif attendu pour les prérequis obligatoires.");
      const response = await assistanceFetch("/api/client/daily/formations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        creation_mode: mode, prerequisite_mode: prerequisiteMode, prerequisite_requirements: prerequisiteRequirements,
        detailed_program: mode === "selen_form" ? text("detailed_program") : "",
        detailed_program_document_url: mode === "program_import" ? programUrl : null,
        title: text("title"), global_objective: text("global_objective"), learning_objectives: text("learning_objectives") ? [text("learning_objectives")] : [],
        target_audience: text("target_audience"), prerequisites: prerequisiteMode === "none" ? "Aucun prérequis" : text("prerequisites"),
        duration_hours: text("duration_hours"), duration_days: text("duration_days"), modality: text("modality"), access_delays: text("access_delays"), price: text("price"),
        pedagogical_resources: text("pedagogical_resources"), evaluation_methods: text("evaluation_methods"), contact_phone: text("contact_phone"), contact_email: text("contact_email"),
        positioning_mode: "off_platform", results_pending: true, status: "draft",
      }) });
      const data = await response.json().catch(() => ({})) as FormationCreateResponse; if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      const id = data.formation?.id; if (!id) throw new Error("Formation enregistrée sans identifiant retourné.");
      router.push(`/client/daily/sessions/new?formation=${encodeURIComponent(id)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible."); } finally { setSaving(false); }
  }

  return <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 18px 64px" }}>
    <button type="button" onClick={() => router.push("/client/daily/formations")} style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0 }}>← Formations</button>
    <h1>Créer une formation</h1><p style={{ color: "#666" }}>Importez votre programme existant ou construisez-le dans Selen. Le fichier original reste conservé comme référence.</p>
    {error ? <div role="alert" style={{ ...card, borderColor: "#b42318", marginBottom: 18 }}>{error}</div> : null}
    <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
      <section style={card}><h2 style={{ marginTop: 0 }}>1. Programme</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        <label style={card}><input type="radio" checked={mode === "program_import"} onChange={() => setMode("program_import")} /> <b>Importer mon programme PDF/Word</b><p style={{ color: "#666" }}>Pas de ressaisie des champs descriptifs déjà portés par le document : Selen conserve le programme original et renseigne les champs nécessaires.</p></label>
        <label style={card}><input type="radio" checked={mode === "selen_form"} onChange={() => setMode("selen_form")} /> <b>Créer le programme dans Selen</b><p style={{ color: "#666" }}>Renseignez les données structurées utilisées par Selen.</p></label>
      </div>{mode === "program_import" ? <div style={{ marginTop: 16 }}><FormationSourceUpload kind="training_program_source" label="Programme original PDF ou Word *" value={programUrl} onUploaded={setProgramUrl} help="L’original est conservé et rattaché à cette formation." /></div> : null}</section>

      <section style={card}><h2 style={{ marginTop: 0 }}>2. Informations</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
        <label>Intitulé *<input name="title" required style={input} /></label><label>Durée en heures *<input name="duration_hours" type="number" min="0.5" step="0.5" required style={input} /></label><label>Durée en jours *<input name="duration_days" type="number" min="0.5" step="0.5" required style={input} /></label>
        <label>Modalité *<select name="modality" required style={input}><option value="presentiel">Présentiel</option><option value="distanciel">Distanciel</option><option value="mixte">Mixte</option></select></label><label>Téléphone organisme *<input name="contact_phone" required style={input} /></label><label>Email organisme *<input name="contact_email" type="email" required style={input} /></label>
      </div>{mode === "selen_form" ? <div style={{ display: "grid", gap: 12, marginTop: 16 }}><label>Objectif principal *<textarea name="global_objective" required style={input} /></label><label>Objectif pédagogique *<input name="learning_objectives" required style={input} /></label><label>Public visé *<textarea name="target_audience" required style={input} /></label><label>Contenu détaillé de la formation *<textarea name="detailed_program" required rows={10} style={input} /></label><label>Délais d’accès *<input name="access_delays" required style={input} /></label><label>Tarif *<input name="price" type="number" min="0" step="0.01" required style={input} /></label><label>Moyens pédagogiques et techniques *<textarea name="pedagogical_resources" required style={input} /></label><label>Modalités d’évaluation *<textarea name="evaluation_methods" required style={input} /></label></div> : null}</section>

      <section style={card}><h2 style={{ marginTop: 0 }}>3. Prérequis</h2><p>Choisissez obligatoirement une situation.</p><label style={{ marginRight: 22 }}><input type="radio" checked={prerequisiteMode === "none"} onChange={() => { setPrerequisiteMode("none"); setRequirements([]); }} /> Aucun prérequis</label><label><input type="radio" checked={prerequisiteMode === "required"} onChange={() => setPrerequisiteMode("required")} /> Prérequis obligatoires</label>
        {prerequisiteMode === "required" ? <div style={{ display: "grid", gap: 12, marginTop: 16 }}><label>Prérequis à satisfaire *<textarea name="prerequisites" required style={input} /></label><div><b>Justificatifs attendus *</b><p style={{ color: "#666" }}>Ils seront demandés dans la candidature. Déposer un fichier ne vaut jamais validation.</p></div>{requirements.map((requirement, index) => <div key={requirement.id} style={{ ...card, display: "grid", gap: 8 }}><label>Justificatif {index + 1}<input value={requirement.label} onChange={(e) => setRequirements((current) => current.map((item) => item.id === requirement.id ? { ...item, label: e.target.value } : item))} required style={input} /></label><label>Précision<textarea value={requirement.description} onChange={(e) => setRequirements((current) => current.map((item) => item.id === requirement.id ? { ...item, description: e.target.value } : item))} style={input} /></label><button type="button" onClick={() => setRequirements((current) => current.filter((item) => item.id !== requirement.id))}>Retirer</button></div>)}<button type="button" onClick={() => setRequirements((current) => [...current, { id: crypto.randomUUID(), label: "", description: "", required: true }])}>+ Ajouter un justificatif</button></div> : null}
      </section>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}><button type="button" onClick={() => router.push("/client/daily/formations")}>Annuler</button><button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Créer la formation"}</button></div>
    </form>
  </main>;
}
