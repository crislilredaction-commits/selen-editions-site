type Section = { title: string; body: string };

function clean(value: unknown) { return String(value ?? "").trim(); }
function esc(value: unknown) {
  return clean(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function multiline(value: unknown, fallback = "Non renseigné") { return esc(clean(value) || fallback).replaceAll("\n", "<br />"); }
function list(items: unknown[]) {
  const values = items.map(clean).filter(Boolean);
  return values.length ? `<ul>${values.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "<p>Non renseigné</p>";
}

export type DailyPretrainingCommon = {
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
  schedule: string;
  modality: string;
  location: string;
  generatedAt: Date;
};

function wordHtml(title: string, common: DailyPretrainingCommon, sections: Section[], annexes: Section[] = []) {
  const generated = common.generatedAt.toLocaleDateString("fr-FR");
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>
  @page WordSection1{size:21cm 29.7cm;margin:1.8cm 1.8cm 2.2cm} body{font-family:Arial,Helvetica,sans-serif;color:#262522;font-size:10.5pt;line-height:1.45;margin:0} .WordSection1{page:WordSection1} h1{font-size:21pt;color:#744632;margin:0 0 8pt} h2{font-size:13pt;color:#744632;border-bottom:1pt solid #d9c7b8;padding-bottom:4pt;margin-top:18pt} h3{font-size:11pt;color:#4e4038} p{margin:5pt 0} .meta{background:#f7f2ec;border:1pt solid #dfd1c4;padding:12pt;margin:14pt 0}.annex{page-break-before:always}.footer{border-top:1pt solid #d9c7b8;margin-top:24pt;padding-top:8pt;font-size:8pt;color:#655d57} table{width:100%;border-collapse:collapse} td,th{border:1pt solid #ded7d0;padding:6pt;vertical-align:top} th{background:#f7f2ec;text-align:left}
  </style></head><body><div class="WordSection1"><h1>${esc(title)}</h1><div class="meta"><strong>${esc(common.formationTitle)}</strong><br/>Session ${esc(common.sessionReference || "sans référence")} · ${esc(common.startDate)} au ${esc(common.endDate)}<br/>${multiline(common.modality)} · ${multiline(common.location)}</div>${sections.map((section)=>`<h2>${esc(section.title)}</h2>${section.body}`).join("")}${annexes.map((section)=>`<div class="annex"><h1>${esc(section.title)}</h1>${section.body}</div>`).join("")}<div class="footer">${esc(common.organisationName)} · ${multiline(common.organisationAddress)} · SIRET ${esc(common.organisationSiret || "non renseigné")} · NDA ${esc(common.organisationNda || "non renseigné")} · ${esc(common.organisationEmail)} · ${esc(common.organisationPhone)} · Document actualisé le ${esc(generated)}</div></div></body></html>`;
}

export function buildTrainingProgramHtml(common: DailyPretrainingCommon, data: { globalObjective: string; learningObjectives: unknown[]; targetAudience: string; prerequisites: string; durationHours: string; durationDays: string; detailedProgram: string; pedagogicalMethods: string; pedagogicalResources: string; evaluationMethods: string; accessibility: string }) {
  return wordHtml("Programme de formation", common, [
    { title: "Objectif général", body: `<p>${multiline(data.globalObjective)}</p>` },
    { title: "Objectifs pédagogiques", body: list(data.learningObjectives) },
    { title: "Public et prérequis", body: `<p><strong>Public :</strong> ${multiline(data.targetAudience)}</p><p><strong>Prérequis :</strong> ${multiline(data.prerequisites)}</p>` },
    { title: "Durée et organisation", body: `<p>${esc(data.durationHours)} heure(s), soit ${esc(data.durationDays)} jour(s).</p><p>${multiline(common.schedule)}</p>` },
    { title: "Programme détaillé", body: `<p>${multiline(data.detailedProgram)}</p>` },
    { title: "Méthodes et moyens", body: `<p><strong>Méthodes :</strong> ${multiline(data.pedagogicalMethods)}</p><p><strong>Moyens :</strong> ${multiline(data.pedagogicalResources)}</p>` },
    { title: "Évaluation", body: `<p>${multiline(data.evaluationMethods)}</p>` },
    { title: "Accessibilité", body: `<p>${multiline(data.accessibility)}</p>` },
  ]);
}

const regulations = `<h2>Objet et champ d’application</h2><p>Le présent règlement s’applique à toute personne participant à une action de formation organisée par l’organisme. Chaque participant s’engage à respecter les règles de fonctionnement, de sécurité, de respect des personnes et des biens.</p><h2>Hygiène, sécurité et consignes</h2><p>Les participants respectent les consignes applicables au lieu de formation et signalent immédiatement toute situation susceptible de présenter un risque. L’introduction ou la consommation de substances illicites est interdite. Il est interdit de se présenter en état d’ébriété.</p><h2>Assiduité</h2><p>Les horaires communiqués doivent être respectés. Toute absence ou retard doit être signalé et justifié. La présence peut faire l’objet d’un émargement ou de tout autre dispositif de preuve adapté à la modalité de formation.</p><h2>Comportement</h2><p>Un comportement respectueux est attendu. Tout agissement discriminatoire, violent, harcelant ou portant atteinte à la dignité d’autrui est interdit.</p><h2>Matériel et confidentialité</h2><p>Le matériel et les ressources mis à disposition doivent être utilisés conformément à leur destination. Les informations confidentielles éventuellement portées à la connaissance des participants ne doivent pas être diffusées sans autorisation.</p><h2>Discipline</h2><p>Tout manquement peut donner lieu, selon sa gravité, à un rappel des règles, un avertissement ou une exclusion de la formation, dans le respect des dispositions applicables.</p>`;

export function buildTrainingAgreementHtml(common: DailyPretrainingCommon, data: { clientName: string; clientAddress: string; clientSiret: string; representative: string; learnerNames: string; price: string; objective: string; prerequisites: string; evaluation: string }) {
  return wordHtml("Convention de formation professionnelle", common, [
    { title: "Entre les parties", body: `<p><strong>Organisme de formation :</strong> ${esc(common.organisationName)}, ${multiline(common.organisationAddress)}, SIRET ${esc(common.organisationSiret)}, NDA ${esc(common.organisationNda || "en cours / non renseigné")}.</p><p><strong>Client / commanditaire :</strong> ${esc(data.clientName || "Bénéficiaire individuel")}, ${multiline(data.clientAddress)}, SIRET ${esc(data.clientSiret)}, représenté par ${esc(data.representative)}.</p>` },
    { title: "Objet", body: `<p>La présente convention a pour objet l’action de formation <strong>${esc(common.formationTitle)}</strong>.</p><p><strong>Bénéficiaire(s) :</strong> ${multiline(data.learnerNames)}</p>` },
    { title: "Objectifs et prérequis", body: `<p>${multiline(data.objective)}</p><p><strong>Prérequis :</strong> ${multiline(data.prerequisites)}</p>` },
    { title: "Organisation de la formation", body: `<p>${multiline(common.schedule)}</p><p>${multiline(common.modality)} · ${multiline(common.location)}</p>` },
    { title: "Suivi et évaluation", body: `<p>${multiline(data.evaluation)}</p>` },
    { title: "Dispositions financières", body: `<p>Prix de la formation : <strong>${esc(data.price || "Non renseigné")}</strong>.</p>` },
    { title: "Acceptation", body: `<p>La convention est établie en deux exemplaires ou validée par procédé électronique. Les parties reconnaissent avoir pris connaissance de ses dispositions et du règlement intérieur annexé.</p><table><tr><td><strong>Pour l’organisme de formation</strong><br/><br/><br/>Date et signature</td><td><strong>Pour le client</strong><br/><br/><br/>Date et signature</td></tr></table>` },
  ], [{ title: "Annexe · Règlement intérieur", body: regulations }]);
}

export function buildConvocationHtml(common: DailyPretrainingCommon, data: { learnerName: string; learnerEmail: string; trainerNames: string; usefulInfo: string }) {
  const welcome = `<h2>Votre accueil</h2><p>La formation est organisée selon les informations de la convocation. En cas de difficulté d’accès, de retard ou d’empêchement, contactez l’organisme de formation.</p><h2>Déroulement</h2><p>Les horaires, pauses et modalités pratiques sont précisés par le formateur. Les supports nécessaires seront remis ou rendus accessibles selon les modalités prévues.</p><h2>Accessibilité et besoins spécifiques</h2><p>Tout besoin d’adaptation peut être signalé à l’organisme de formation afin d’étudier les aménagements possibles dans le respect de la confidentialité.</p><h2>Évaluation et présence</h2><p>La participation, les évaluations prévues et les justificatifs de présence font partie du suivi de l’action de formation.</p>`;
  return wordHtml("Convocation à la formation", common, [
    { title: "Destinataire", body: `<p><strong>${esc(data.learnerName)}</strong><br/>${esc(data.learnerEmail)}</p>` },
    { title: "Votre session", body: `<p>Vous êtes convoqué(e) à la formation <strong>${esc(common.formationTitle)}</strong>.</p><p><strong>Dates et horaires :</strong><br/>${multiline(common.schedule)}</p><p><strong>Lieu / accès :</strong><br/>${multiline(common.location)}</p><p><strong>Formateur(s) :</strong> ${multiline(data.trainerNames)}</p>` },
    { title: "Informations utiles", body: `<p>${multiline(data.usefulInfo || "Merci de prévoir le matériel éventuellement indiqué par votre organisme de formation.")}</p>` },
  ], [{ title: "Annexe · Livret d’accueil", body: welcome }]);
}

export function buildRegistrationPositioningHtml(common: DailyPretrainingCommon, data: { learnerName: string; learnerEmail: string; companyName: string; funding: string; prerequisites: string; positioningStatus: string; prerequisiteStatus: string; supportNeeds: string }) {
  return wordHtml("Inscription et positionnement", common, [
    { title: "Apprenant", body: `<p><strong>${esc(data.learnerName)}</strong><br/>${esc(data.learnerEmail)}<br/>Entreprise : ${esc(data.companyName || "Non renseignée")}</p>` },
    { title: "Financement", body: `<p>${multiline(data.funding)}</p>` },
    { title: "Prérequis à vérifier", body: `<p>${multiline(data.prerequisites)}</p><p><strong>État :</strong> ${esc(data.prerequisiteStatus)}</p>` },
    { title: "Positionnement", body: `<p><strong>État :</strong> ${esc(data.positioningStatus)}</p><p>Le positionnement permet de préciser le niveau de départ, les attentes et les éventuels besoins d’adaptation avant l’entrée en formation.</p>` },
    { title: "Besoins particuliers / accessibilité", body: `<p>${multiline(data.supportNeeds || "Aucun besoin particulier signalé à ce stade.")}</p>` },
    { title: "Validation des informations", body: `<p>Les informations ci-dessus doivent être confirmées ou complétées avant le démarrage de la session.</p>` },
  ]);
}
