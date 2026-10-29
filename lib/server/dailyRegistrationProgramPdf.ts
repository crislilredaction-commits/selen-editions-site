import { jsPDF } from "jspdf";

const clean = (value: unknown) => String(value ?? "").trim();

// Only the official programme fields below are rendered.
export function renderRegistrationProgramPdf(formation: Record<string, unknown>, organisation: Record<string, unknown> | null) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left=16, right=194, width=right-left; let y=18;
  const ensure=(n=16)=>{ if(y+n>278){ doc.addPage(); y=18; } };
  const p = (value: unknown, bold = false, size = 10) => {
    const text = clean(value);
    if (!text) return;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lineHeight = size * 0.42;
    const lines: string[] = doc.splitTextToSize(text, width);
    for (const line of lines) {
      ensure(lineHeight);
      doc.text(line, left, y);
      y += lineHeight;
    }
    y += 3;
  };
  const section = (label: string, value: unknown) => {
    if (!clean(value)) return;
    ensure(20);
    p(label, true, 11);
    p(value);
  };
  p(clean(organisation?.organisation_name)||"Organisme de formation",true,11);
  p("PROGRAMME DE FORMATION",true,18);
  p(formation.title,true,14);
  if(organisation?.address)p(organisation.address,false,9);
  if(organisation?.platform_contact_email)p(organisation.platform_contact_email,false,9);
  y+=3;
  section("Objectif général",formation.global_objective);
  section("Objectifs pédagogiques", Array.isArray(formation.learning_objectives) ? formation.learning_objectives.join("\n") : formation.learning_objectives);
  section("Public concerné",formation.target_audience);
  section("Prérequis",formation.prerequisites);
  section("Durée",[formation.duration_hours?`${formation.duration_hours} h`:"",formation.duration_days?`${formation.duration_days} jour(s)`:""].filter(Boolean).join(" · "));
  section("Modalité",formation.modality);
  section("Précisions sur la modalité",formation.modality_details);
  section("Délai d'accès",formation.access_delays);
  section("Modalités d'inscription",formation.registration_methods);
  section("Tarif",formation.price);
  section("Contenu détaillé de la formation",formation.detailed_program);
  section("Méthodes pédagogiques",formation.pedagogical_methods);
  section("Moyens pédagogiques et techniques",formation.pedagogical_resources);
  section("Modalités d'évaluation",formation.evaluation_methods);
  section("Accessibilité",formation.accessibility);
  section("Téléphone", formation.contact_phone);
  section("Email", formation.contact_email || organisation?.platform_contact_email);
  section("Site internet", formation.contact_website);
  ensure(18); y+=4; doc.setDrawColor(190); doc.line(left,y,right,y); y+=6;
  p("Programme validé par l'organisme de formation et généré depuis Selen Daily.",false,8);
  return doc.output("arraybuffer");
}
