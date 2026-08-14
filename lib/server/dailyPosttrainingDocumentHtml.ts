type Section = { title: string; body: string };

function clean(value: unknown) { return String(value ?? "").trim(); }
function esc(value: unknown) {
  return clean(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function multiline(value: unknown, fallback = "Non renseigné") { return esc(clean(value) || fallback).replaceAll("\n", "<br />"); }
function frDate(value: string) {
  if (!value) return "Non renseignée";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR");
}

export type DailyPosttrainingCommon = {
  organisationName: string;
  organisationAddress: string;
  organisationSiret: string;
  organisationNda: string;
  organisationEmail: string;
  organisationPhone: string;
  formationTitle: string;
  sessionReference: string;
  startDate: string;
  endDate: string;
  modality: string;
  location: string;
  durationHours: string;
  generatedAt: Date;
};

function wordHtml(title: string, common: DailyPosttrainingCommon, sections: Section[]) {
  const generated = common.generatedAt.toLocaleDateString("fr-FR");
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>
  @page WordSection1{size:21cm 29.7cm;margin:1.8cm 1.8cm 2.2cm} body{font-family:Arial,Helvetica,sans-serif;color:#262522;font-size:10.5pt;line-height:1.45;margin:0}.WordSection1{page:WordSection1}h1{font-size:21pt;color:#744632;margin:0 0 8pt}h2{font-size:13pt;color:#744632;border-bottom:1pt solid #d9c7b8;padding-bottom:4pt;margin-top:18pt}p{margin:5pt 0}.meta{background:#f7f2ec;border:1pt solid #dfd1c4;padding:12pt;margin:14pt 0}.footer{border-top:1pt solid #d9c7b8;margin-top:24pt;padding-top:8pt;font-size:8pt;color:#655d57}table{width:100%;border-collapse:collapse;margin:8pt 0}td,th{border:1pt solid #ded7d0;padding:6pt;vertical-align:top}th{background:#f7f2ec;text-align:left}.good{color:#496532}.muted{color:#655d57;font-size:9pt}
  </style></head><body><div class="WordSection1"><h1>${esc(title)}</h1><div class="meta"><strong>${esc(common.formationTitle)}</strong><br/>Session ${esc(common.sessionReference || "sans référence")} · ${esc(frDate(common.startDate))} au ${esc(frDate(common.endDate))}<br/>${esc(common.modality || "Modalité non renseignée")} · ${multiline(common.location)}</div>${sections.map((section)=>`<h2>${esc(section.title)}</h2>${section.body}`).join("")}<div class="footer">${esc(common.organisationName)} · ${multiline(common.organisationAddress)} · SIRET ${esc(common.organisationSiret || "non renseigné")} · NDA ${esc(common.organisationNda || "non renseigné")} · ${esc(common.organisationEmail)} · ${esc(common.organisationPhone)} · Document généré le ${esc(generated)}</div></div></body></html>`;
}

export type AttendanceLine = {
  learnerName: string;
  slotLabel: string;
  status: string;
  signedAt?: string | null;
  validatedAt?: string | null;
};

const attendanceLabels: Record<string,string> = {
  present: "Présent",
  absent: "Absent",
  excused: "Absence justifiée",
  pending: "À confirmer",
};

export function buildAttendanceReportHtml(common: DailyPosttrainingCommon, lines: AttendanceLine[]) {
  const present = lines.filter((line)=>line.status === "present").length;
  const complete = lines.length;
  const rows = lines.length ? lines.map((line)=>`<tr><td>${esc(line.learnerName)}</td><td>${esc(line.slotLabel)}</td><td>${esc(attendanceLabels[line.status] ?? line.status)}</td><td>${esc(line.signedAt ? new Date(line.signedAt).toLocaleString("fr-FR") : line.validatedAt ? new Date(line.validatedAt).toLocaleString("fr-FR") : "—")}</td></tr>`).join("") : `<tr><td colspan="4">Aucune donnée de présence enregistrée.</td></tr>`;
  return wordHtml("Relevé de présence", common, [
    { title: "Synthèse", body: `<p><strong>${present}</strong> présence(s) confirmée(s) sur <strong>${complete}</strong> ligne(s) d’émargement attendue(s).</p><p class="muted">Ce relevé synthétise les preuves de présence enregistrées dans Selen Daily. Les preuves techniques horodatées restent conservées dans le dossier de session.</p>` },
    { title: "Détail des présences", body: `<table><thead><tr><th>Apprenant</th><th>Créneau</th><th>Statut</th><th>Horodatage de preuve</th></tr></thead><tbody>${rows}</tbody></table>` },
  ]);
}

const outcomeLabels: Record<string,string> = {
  achieved: "Acquis",
  partially_achieved: "Partiellement acquis",
  not_achieved: "Non acquis",
  not_applicable: "Non applicable",
  pending: "Non renseigné",
};

export function buildCompletionCertificateHtml(common: DailyPosttrainingCommon, data: {
  learnerName: string;
  assessmentOutcome?: string | null;
  score?: number | null;
  scoreMax?: number | null;
  attendancePresent: number;
  attendanceExpected: number;
}) {
  const attendance = data.attendanceExpected > 0 ? `${data.attendancePresent}/${data.attendanceExpected} créneau(x) de présence confirmé(s)` : "Présence non renseignée";
  const score = data.score !== null && data.score !== undefined && data.scoreMax !== null && data.scoreMax !== undefined ? `${data.score}/${data.scoreMax}` : "Non renseigné";
  return wordHtml("Certificat de réalisation", common, [
    { title: "Bénéficiaire", body: `<p>Le présent document atteste que <strong>${esc(data.learnerName)}</strong> a participé à l’action de formation <strong>${esc(common.formationTitle)}</strong>, organisée du ${esc(frDate(common.startDate))} au ${esc(frDate(common.endDate))}.</p>` },
    { title: "Caractéristiques de l’action", body: `<p><strong>Durée prévue :</strong> ${esc(common.durationHours || "Non renseignée")} heure(s)<br/><strong>Modalité :</strong> ${esc(common.modality || "Non renseignée")}<br/><strong>Lieu / accès :</strong> ${multiline(common.location)}</p>` },
    { title: "Suivi de réalisation", body: `<p><strong>Présence :</strong> ${esc(attendance)}</p><p><strong>Résultat de l’évaluation des acquis :</strong> ${esc(outcomeLabels[data.assessmentOutcome ?? "pending"] ?? data.assessmentOutcome ?? "Non renseigné")}<br/><strong>Score :</strong> ${esc(score)}</p>` },
    { title: "Établissement", body: `<p>Certificat établi par <strong>${esc(common.organisationName)}</strong> à partir des données de suivi conservées dans le dossier de formation.</p>` },
  ]);
}

function average(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!numbers.length) return null;
  return Math.round((numbers.reduce((sum,value)=>sum+value,0) / numbers.length) * 10) / 10;
}
function rating(value: number | null) { return value === null ? "Non renseigné" : `${value}/5`; }

export function buildSatisfactionSummaryHtml(common: DailyPosttrainingCommon, responses: Array<{
  overall_rating?: number | null;
  objectives_rating?: number | null;
  trainer_rating?: number | null;
  organisation_rating?: number | null;
  content_rating?: number | null;
  pace_rating?: number | null;
  would_recommend?: boolean | null;
  strengths?: string | null;
  improvements?: string | null;
  adaptation_feedback?: string | null;
  free_comment?: string | null;
}>, expectedResponses: number) {
  const recommendationAnswers = responses.filter((row)=>typeof row.would_recommend === "boolean");
  const recommend = recommendationAnswers.length ? Math.round(recommendationAnswers.filter((row)=>row.would_recommend).length / recommendationAnswers.length * 100) : null;
  const comments = responses.flatMap((row)=>[
    row.strengths ? `Point positif : ${clean(row.strengths)}` : "",
    row.improvements ? `Amélioration : ${clean(row.improvements)}` : "",
    row.adaptation_feedback ? `Adaptation : ${clean(row.adaptation_feedback)}` : "",
    row.free_comment ? `Commentaire : ${clean(row.free_comment)}` : "",
  ]).filter(Boolean);
  const commentRows = comments.length ? `<ul>${comments.map((item)=>`<li>${esc(item)}</li>`).join("")}</ul>` : "<p>Aucun commentaire libre transmis.</p>";
  return wordHtml("Synthèse de satisfaction", common, [
    { title: "Participation", body: `<p><strong>${responses.length}</strong> réponse(s) recueillie(s) sur <strong>${expectedResponses}</strong> apprenant(s) actif(s).</p>` },
    { title: "Résultats", body: `<table><tbody><tr><th>Satisfaction globale</th><td>${esc(rating(average(responses.map((r)=>r.overall_rating))))}</td></tr><tr><th>Atteinte des objectifs</th><td>${esc(rating(average(responses.map((r)=>r.objectives_rating))))}</td></tr><tr><th>Formateur</th><td>${esc(rating(average(responses.map((r)=>r.trainer_rating))))}</td></tr><tr><th>Organisation</th><td>${esc(rating(average(responses.map((r)=>r.organisation_rating))))}</td></tr><tr><th>Contenu</th><td>${esc(rating(average(responses.map((r)=>r.content_rating))))}</td></tr><tr><th>Rythme</th><td>${esc(rating(average(responses.map((r)=>r.pace_rating))))}</td></tr><tr><th>Recommandation</th><td>${esc(recommend === null ? "Non renseigné" : `${recommend}%`)}</td></tr></tbody></table>` },
    { title: "Retours qualitatifs", body: commentRows },
  ]);
}
