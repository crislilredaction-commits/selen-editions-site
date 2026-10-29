import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const MODELS: Record<string, { label: string; body: string }> = {
  training_agreement: { label: "Convention de formation", body: "<h1>CONVENTION DE FORMATION PROFESSIONNELLE</h1><p>Entre <b>{{ORGANISME}}</b>, SIRET {{SIRET}}, situé {{ADRESSE_ORGANISME}}, et {{CLIENT_OU_BENEFICIAIRE}}.</p><h2>Formation</h2><p>Intitulé : {{FORMATION}}</p><p>Bénéficiaire : {{BENEFICIAIRE}}</p><p>Dates : {{DATES}} · Durée : {{DUREE}} · Lieu/modalité : {{MODALITE}}</p><p>Tarif : {{TARIF}}</p><h2>Signatures</h2><p>Pour l'organisme : ____________________</p><p>Pour le client / bénéficiaire : ____________________</p>" },
  convocation: { label: "Convocation", body: "<h1>CONVOCATION À UNE FORMATION</h1><p>{{ORGANISME}} · SIRET {{SIRET}} · {{ADRESSE_ORGANISME}}</p><p>À l'attention de {{BENEFICIAIRE}}</p><p>Vous êtes convoqué(e) à la formation <b>{{FORMATION}}</b>.</p><p>Dates : {{DATES}}</p><p>Horaires : {{HORAIRES}}</p><p>Lieu / accès : {{MODALITE}}</p><p>Formateur : {{FORMATEUR}}</p>" },
  attendance_sheet: { label: "Feuille d'émargement", body: "<h1>FEUILLE D'ÉMARGEMENT</h1><p>{{ORGANISME}} · SIRET {{SIRET}} · {{ADRESSE_ORGANISME}}</p><p>Formation : {{FORMATION}} · Date : {{DATE}}</p><table><tr><th>Bénéficiaire</th><th>Matin</th><th>Après-midi</th></tr><tr><td>{{BENEFICIAIRE}}</td><td></td><td></td></tr></table><p>Signature du formateur : ____________________</p>" },
  completion_certificate: { label: "Attestation de fin de formation", body: "<h1>ATTESTATION DE FIN DE FORMATION</h1><p>Je soussigné(e), représentant {{ORGANISME}}, SIRET {{SIRET}}, atteste que {{BENEFICIAIRE}} a suivi la formation <b>{{FORMATION}}</b> du {{DATES}} pour une durée de {{DUREE}}.</p><p>Fait le {{DATE_DOCUMENT}}</p><p>Signature : ____________________</p>" },
  achievement_certificate: { label: "Certificat de réalisation", body: "<h1>CERTIFICAT DE RÉALISATION</h1><p>{{ORGANISME}} · SIRET {{SIRET}} · {{ADRESSE_ORGANISME}}</p><p>Je certifie que {{BENEFICIAIRE}} a réalisé l'action de formation <b>{{FORMATION}}</b>, prévue du {{DATES}}, pour une durée de {{DUREE}}.</p><p>Fait le {{DATE_DOCUMENT}}</p><p>Signature de l'organisme : ____________________</p>" },
  internal_rules: { label: "Règlement intérieur", body: "<h1>RÈGLEMENT INTÉRIEUR</h1><p>Organisme : {{ORGANISME}} · SIRET {{SIRET}} · {{ADRESSE_ORGANISME}}</p><p>Ce modèle constitue la trame Selen à compléter ou adapter avant utilisation hors ligne. Les règles applicables à la santé, la sécurité, la discipline, l'assiduité, le respect des personnes, les sanctions et la procédure disciplinaire doivent être conservées.</p>" },
  welcome_booklet: { label: "Livret d'accueil", body: "<h1>LIVRET D'ACCUEIL</h1><p>{{ORGANISME}} · SIRET {{SIRET}} · {{ADRESSE_ORGANISME}}</p><h2>Bienvenue</h2><p>Formation : {{FORMATION}}</p><p>Contact : {{CONTACT}}</p><p>Modalités pratiques : {{MODALITES_PRATIQUES}}</p><p>Accessibilité et besoins spécifiques : {{ACCESSIBILITE}}</p>" },
};

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["trainings", "sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const type = new URL(req.url).searchParams.get("type") ?? "";
  const model = MODELS[type];
  if (!model) return NextResponse.json({ error: "Modèle inconnu." }, { status: 404 });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;margin:2cm;color:#222}h1{font-size:18pt;text-align:center}h2{font-size:13pt;margin-top:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #777;padding:8px}</style></head><body>${model.body}<hr><p style="font-size:9pt;color:#666">Modèle Selen Daily. Les champs entre doubles accolades sont à compléter lors d'une utilisation manuelle hors ligne.</p></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "application/msword; charset=utf-8", "Content-Disposition": `attachment; filename="Modele_Selen_${type}.doc"`, "Cache-Control": "private, no-store" } });
}
