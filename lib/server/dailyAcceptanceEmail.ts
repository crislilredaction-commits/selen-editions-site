// Pure rendering: no Auth, document publication or recipient lookup here.
type Row = Record<string, any>;
export const acceptanceFormationFields = "id,organisation_id,title,status,creation_mode,duration_hours,duration_days,contact_email,contact_phone,public_registration_enabled,public_registration_token";
export const acceptanceSessionFields = "id,user_id,organisation_id,formation_id,start_date,end_date,modality,distance_mode,schedule_blocks,location_address,remote_url,internal_reference";
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
export const escapeAcceptanceHtml = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
export function acceptanceRecipients(request: Row): { email: string; name: string }[] {
  const people = request.response_type === "beneficiary"
    ? [{ first_name: request.respondent_first_name, last_name: request.respondent_last_name, email: request.respondent_email }]
    : request.response_type === "company" && Array.isArray(request.participants) ? request.participants : [];
  const seen = new Set<string>();
  return people.flatMap((value: unknown) => {
    const p = value && typeof value === "object" ? value as Row : {};
    const email = (text(p.email) || text(p.mail)).toLowerCase();
    if (email && seen.has(email)) return [];
    if (email) seen.add(email);
    return [{ email, name: [text(p.first_name) || text(p.firstname) || text(p.firstName), text(p.last_name) || text(p.lastname) || text(p.lastName)].filter(Boolean).join(" ") }];
  });
}
export function acceptanceEmail(input: { name: string; formation: Row; organisation: Row; session?: Row | null; enrolment?: Row; origin: string; portalUrl?: string }) {
  const { formation: f, organisation: o, session: s, enrolment: e } = input;
  const confirm = (v: unknown) => text(v) || "à confirmer";
  const async = s?.modality === "distanciel" && s.distance_mode === "asynchrone";
  const blocks = Array.isArray(s?.schedule_blocks) ? s.schedule_blocks.filter((b: unknown) => b && typeof b === "object") as Row[] : [];
  const duration = [f.duration_hours ? `${f.duration_hours} heures` : "", f.duration_days ? `${f.duration_days} jour(s)` : ""].filter(Boolean).join(" · ") || "à confirmer";
  const paragraphs = [
    input.name ? `Bonjour ${input.name},` : "Bonjour,",
    `Votre candidature à la formation « ${confirm(f.title)} » a été acceptée par l’organisme de formation ${confirm(o.name)}.`,
    `Formation : ${confirm(f.title)}. Durée : ${duration}.`,
    `Organisme de formation : ${confirm(o.name)}. Contact : ${confirm(o.contact_name)}. Email : ${confirm(f.contact_email || o.email)}. Téléphone : ${confirm(f.contact_phone || o.phone)}. Adresse de l’organisme : ${confirm(o.address)}.`,
    `Session : ${confirm(s?.internal_reference)}. Début : ${confirm(s?.start_date)}. Fin : ${confirm(s?.end_date)}. Modalité : ${confirm(s?.modality)}${s?.modality === "distanciel" ? ` (${confirm(s.distance_mode)})` : ""}.`,
    async ? "Formation à distance asynchrone : vous avancerez à votre rythme dans la période prévue. Les modalités d’accès aux activités et d’accompagnement seront précisées par l’organisme ; aucun horaire de classe en direct n’est annoncé."
      : `Horaires : ${blocks.length ? blocks.map(b => `${confirm(b.date)} : ${confirm(b.start)} – ${confirm(b.end)}${text(b.note) ? ` (${text(b.note)})` : ""}`).join(" ; ") : "à confirmer par l’organisme"}.`,
    s?.modality === "distanciel" ? `Accès à distance : ${confirm(s.remote_url)}.` : `Lieu de formation : ${confirm(s?.location_address)}.`,
    input.portalUrl ? "Votre inscription est enregistrée. Votre espace personnel vous permettra de suivre les étapes de préformation : vérifier vos informations et compléter les éléments demandés par l’organisme avant le début de la formation."
      : "La session et votre inscription seront finalisées par l’organisme. Votre accès personnel vous sera envoyé après la création de votre inscription. Vous n’avez pas encore d’accès à activer depuis ce message.",
    "La préformation prépare votre entrée en formation : vérification de vos informations, du positionnement et des éventuels besoins d’adaptation, puis préparation des documents. L’organisme vous précisera les éléments restant à compléter.",
    e?.contracting_party_type === "individual" ? "Un contrat individuel de formation sera préparé pour votre inscription."
      : e?.contracting_party_type === "company" ? `Une convention de formation sera préparée avec votre entreprise commanditaire${text(e.company_name) ? `, ${text(e.company_name)}` : " (nom à confirmer)"}.`
      : "Les documents de contractualisation adaptés à votre inscription seront préparés.",
    "Les documents seront préparés, puis relus, modifiés si nécessaire et validés par un agent avant leur envoi pour signature. Après signature, la convocation, le livret d’accueil et le règlement intérieur seront mis à disposition. Ce message ne confirme pas que ces documents sont déjà validés, envoyés, signés ou disponibles.",
  ];
  if (input.portalUrl) paragraphs.push(`Accéder à mon espace apprenant : ${input.portalUrl}`, "À la première connexion, cliquez sur « Activer mon accès », puis choisissez votre mot de passe. Utilisez de préférence 12 caractères ou plus avec majuscule, minuscule, chiffre et symbole. Si le mot de passe est refusé, choisissez-en un autre sur la même page.", "Si vous avez reçu plusieurs messages, utilisez le dernier. Conservez ce lien personnel et ne le transmettez pas.");
  const program = f.status === "validated" && (f.creation_mode ?? "selen_form") === "selen_form" && f.public_registration_enabled === true && text(f.public_registration_token)
    ? `${input.origin}/api/daily-registration/${encodeURIComponent(f.public_registration_token)}/program-pdf` : null;
  paragraphs.push(program ? `Programme de formation (PDF) : ${program}` : "Le lien vers le programme PDF n’est pas disponible dans ce message. Vous pouvez le demander à l’organisme.", "Pour toute question sur les prochaines étapes, contactez votre organisme de formation.", "Selen Editions");
  return { subject: `Votre candidature acceptée · ${confirm(f.title)}`, text: paragraphs.join("\n\n"), html: `<div lang="fr" style="font-family:Arial,sans-serif;line-height:1.6;max-width:640px">${paragraphs.map(p => `<p>${escapeAcceptanceHtml(p)}</p>`).join("")}${input.portalUrl ? `<p><a href="${escapeAcceptanceHtml(input.portalUrl)}">Activer mon accès / accéder à mon espace</a></p>` : ""}${program ? `<p><a href="${escapeAcceptanceHtml(program)}">Consulter le programme PDF</a></p>` : ""}</div>` };
}
