import { jsPDF } from "jspdf";

type Program = Record<string, unknown>;
const text=(v:unknown)=>String(v??"").trim();

export function buildTrainingProgramPdf(formation:Program, organisation?:Record<string,unknown>|null){
  const pdf=new jsPDF({unit:"mm",format:"a4"});
  const margin=18, width=174; let y=20;
  const add=(label:string,value:unknown)=>{
    const valueText=text(value); if(!valueText)return;
    const lines=pdf.splitTextToSize(valueText,width);
    if(y+8+lines.length*5>280){pdf.addPage();y=20;}
    pdf.setFont("helvetica","bold");pdf.setFontSize(10);pdf.text(label,y?margin:margin,y);
    y+=6;pdf.setFont("helvetica","normal");pdf.setFontSize(10);pdf.text(lines,margin,y);y+=lines.length*5+5;
  };
  pdf.setFont("helvetica","bold");pdf.setFontSize(18);pdf.text("Programme de formation",margin,y);y+=10;
  pdf.setFontSize(14);pdf.text(pdf.splitTextToSize(text(formation.title)||"Formation",width),margin,y);y+=12;
  if(organisation?.name){pdf.setFont("helvetica","normal");pdf.setFontSize(10);pdf.text(text(organisation.name),margin,y);y+=8;}
  add("Objectif principal",formation.global_objective);
  const objectives=Array.isArray(formation.learning_objectives)?formation.learning_objectives.map(text).filter(Boolean).map((v,i)=>`${i+1}. ${v}`).join("\n"):"";
  add("Objectifs pédagogiques",objectives);
  add("Public visé",formation.target_audience);add("Prérequis",formation.prerequisites);
  const duration=[formation.duration_hours?`${text(formation.duration_hours)} h`:"",formation.duration_days?`${text(formation.duration_days)} jour(s)`:""].filter(Boolean).join(" · ");
  add("Durée",duration);add("Modalité",formation.modality_details||formation.modality);
  add("Délai d'accès",formation.access_delays);add("Modalités d'inscription",formation.registration_methods);add("Tarif",formation.price);
  add("Contenu détaillé de la formation",formation.detailed_program);
  add("Méthodes pédagogiques",formation.pedagogical_methods);add("Moyens pédagogiques et techniques",formation.pedagogical_resources);
  add("Modalités d'évaluation",formation.evaluation_methods);add("Accessibilité",formation.accessibility);
  add("Contact", [formation.contact_phone,formation.contact_email,formation.contact_website].map(text).filter(Boolean).join(" · "));
  return new Uint8Array(pdf.output("arraybuffer"));
}
