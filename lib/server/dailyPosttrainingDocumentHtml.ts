function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function page(title: string, organisationName: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#2f241c;line-height:1.45;margin:36px}h1{color:#7f4828;font-size:24px}h2{font-size:17px;margin-top:24px}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #c9b49d;padding:7px;text-align:left;font-size:12px}th{background:#f4eadc}.muted{color:#6f6258;font-size:11px}.box{border:1px solid #c9b49d;padding:12px;margin:12px 0}</style></head><body><div class="muted">${esc(organisationName)} · Selen Daily</div><h1>${esc(title)}</h1>${body}</body></html>`;
}

export type AttendanceLine = { learnerName: string; date: string; start: string; end: string; status: string; proofHash?: string | null };
export type CompletionLearningOutcome = "achieved" | "partially_achieved" | "not_achieved" | "pending" | "not_applicable" | null | undefined;

export function completionCertificateLearningResult(outcome: CompletionLearningOutcome) {
  if (outcome === "achieved") return "Acquis";
  if (outcome === "partially_achieved" || outcome === "not_achieved") return "Non acquis";
  return null;
}

export function buildAttendanceSummaryHtml(args: { organisationName:string; formationTitle:string; sessionReference:string; startDate:string; endDate:string; lines:AttendanceLine[]; generatedAt:Date }) {
  const labels:Record<string,string>={present:"Présent",absent:"Absent",excused:"Absence justifiée",pending:"À confirmer"};
  const rows=args.lines.map((line)=>`<tr><td>${esc(line.learnerName)}</td><td>${esc(line.date)}</td><td>${esc(line.start)}–${esc(line.end)}</td><td>${esc(labels[line.status]??line.status)}</td><td>${line.proofHash?esc(line.proofHash):"—"}</td></tr>`).join("");
  return page("Relevé des présences",args.organisationName,`<div class="box"><strong>Formation :</strong> ${esc(args.formationTitle)}<br><strong>Session :</strong> ${esc(args.sessionReference||"Sans référence")}<br><strong>Période :</strong> ${esc(args.startDate)} au ${esc(args.endDate)}</div><table><thead><tr><th>Apprenant</th><th>Date</th><th>Horaire</th><th>Statut</th><th>Empreinte de preuve</th></tr></thead><tbody>${rows}</tbody></table><p class="muted">Document généré le ${esc(args.generatedAt.toLocaleString("fr-FR"))}. Les empreintes SHA-256 permettent de rapprocher ce relevé des preuves d’émargement conservées dans Selen Daily.</p>`);
}

export function buildCompletionCertificateHtml(args:{ organisationName:string; organisationSiret:string; organisationNda:string; formationTitle:string; learnerName:string; startDate:string; endDate:string; plannedHours:number; attendedHours:number; learningOutcome?:CompletionLearningOutcome; generatedAt:Date }) {
  const participation = args.plannedHours > 0 ? Math.min(100, Math.round((args.attendedHours / args.plannedHours) * 100)) : null;
  const learningResult = completionCertificateLearningResult(args.learningOutcome);
  const learningResultHtml = learningResult ? `<p><strong>Résultat de l’évaluation des acquis :</strong> ${esc(learningResult)}</p>` : "";
  return page("Certificat de réalisation",args.organisationName,`<p>Je soussigné(e), représentant l’organisme de formation <strong>${esc(args.organisationName)}</strong>, certifie que :</p><div class="box"><strong>${esc(args.learnerName)}</strong><br>a participé à la formation <strong>${esc(args.formationTitle)}</strong><br>du ${esc(args.startDate)} au ${esc(args.endDate)}.</div><p><strong>Durée programmée :</strong> ${esc(args.plannedHours.toFixed(2))} h<br><strong>Présence constatée :</strong> ${esc(args.attendedHours.toFixed(2))} h${participation===null?"":` (${participation} %)`}</p>${learningResultHtml}<p>Le présent certificat atteste de la réalisation constatée à partir des émargements et preuves de présence enregistrés dans le dossier de session. Le résultat pédagogique, lorsqu’il est indiqué, reprend l’évaluation finale enregistrée dans Selen Daily ; le certificat ne constitue pas à lui seul une certification ou un diplôme.</p><p class="muted">SIRET : ${esc(args.organisationSiret||"Non renseigné")} · NDA : ${esc(args.organisationNda||"Non renseigné")}<br>Établi le ${esc(args.generatedAt.toLocaleDateString("fr-FR"))}.</p>`);
}
