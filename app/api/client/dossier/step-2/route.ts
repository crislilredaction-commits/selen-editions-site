import { NextResponse } from "next/server";
import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";

export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const body = await req.json();

    const {
      dossierId,
      stagiaire_prenom,
      stagiaire_nom,
      stagiaire_adresse,
      stagiaire_email,
      stagiaire_telephone,
      client_siret,
      date_formation_prevue,
      lieu_formation,
    } = body ?? {};

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const access = await verifyClientNdaDossierAccess(supabase, dossierId);

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const { error } = await supabase.from("nda_variables").upsert(
      {
        dossier_id: dossierId,
        organisation_id: access.dossier.organisation_id,
        stagiaire_prenom: stagiaire_prenom ?? null,
        stagiaire_nom: stagiaire_nom ?? null,
        stagiaire_adresse: stagiaire_adresse ?? null,
        stagiaire_email: stagiaire_email ?? null,
        stagiaire_telephone: stagiaire_telephone ?? null,
        client_siret: client_siret ?? null,
        date_formation_prevue: date_formation_prevue || null,
        lieu_formation: lieu_formation ?? null,
      },
      { onConflict: "dossier_id" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
