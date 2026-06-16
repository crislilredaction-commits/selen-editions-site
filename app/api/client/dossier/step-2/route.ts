import { NextResponse } from "next/server";
import { createAgentNotification } from "@/lib/server/notifications";
import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";

const STEP_2_COMPLETED_MESSAGE =
  "Le client a complété les informations nécessaires à la convention de formation. Vous pouvez vérifier les coordonnées et préparer la génération des documents à signer.";

function isFilled(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCompletedStep2(values: Record<string, unknown> | null | undefined) {
  if (!values) return false;

  return [
    values.client_nom,
    values.client_adresse,
    values.client_representant_prenom,
    values.client_representant_nom,
    values.client_siret,
    values.stagiaire_prenom,
    values.stagiaire_nom,
    values.stagiaire_fonction,
    values.stagiaire_adresse,
    values.stagiaire_email,
    values.stagiaire_telephone,
    values.date_formation_prevue,
    values.lieu_formation,
    values.lieu_signature_convention,
    values.date_signature_convention,
  ].every(isFilled);
}

export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const body = await req.json();

    const {
      dossierId,
      client_nom,
      client_adresse,
      client_representant_prenom,
      client_representant_nom,
      stagiaire_prenom,
      stagiaire_nom,
      stagiaire_fonction,
      stagiaire_adresse,
      stagiaire_email,
      stagiaire_telephone,
      client_siret,
      date_formation_prevue,
      lieu_formation,
      lieu_signature_convention,
      date_signature_convention,
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

    const { data: previousStep2, error: previousStep2Error } = await supabase
      .from("nda_variables")
      .select(
        `
        client_nom,
        client_adresse,
        client_representant_prenom,
        client_representant_nom,
        client_siret,
        stagiaire_prenom,
        stagiaire_nom,
        stagiaire_fonction,
        stagiaire_adresse,
        stagiaire_email,
        stagiaire_telephone,
        date_formation_prevue,
        lieu_formation,
        lieu_signature_convention,
        date_signature_convention
      `,
      )
      .eq("dossier_id", dossierId)
      .maybeSingle();

    if (previousStep2Error) {
      return NextResponse.json(
        { error: previousStep2Error.message },
        { status: 500 },
      );
    }

    const wasStep2Completed = hasCompletedStep2(previousStep2);
    const nextStep2Values = {
      client_nom,
      client_adresse,
      client_representant_prenom,
      client_representant_nom,
      client_siret,
      stagiaire_prenom,
      stagiaire_nom,
      stagiaire_fonction,
      stagiaire_adresse,
      stagiaire_email,
      stagiaire_telephone,
      date_formation_prevue,
      lieu_formation,
      lieu_signature_convention,
      date_signature_convention,
    };
    const isStep2Completed = hasCompletedStep2(nextStep2Values);

    const { error } = await supabase.from("nda_variables").upsert(
      {
        dossier_id: dossierId,
        organisation_id: access.dossier.organisation_id,
        client_nom: client_nom ?? null,
        client_adresse: client_adresse ?? null,
        client_representant_prenom: client_representant_prenom ?? null,
        client_representant_nom: client_representant_nom ?? null,
        stagiaire_prenom: stagiaire_prenom ?? null,
        stagiaire_nom: stagiaire_nom ?? null,
        stagiaire_fonction: stagiaire_fonction ?? null,
        stagiaire_adresse: stagiaire_adresse ?? null,
        stagiaire_email: stagiaire_email ?? null,
        stagiaire_telephone: stagiaire_telephone ?? null,
        client_siret: client_siret ?? null,
        date_formation_prevue: date_formation_prevue || null,
        lieu_formation: lieu_formation ?? null,
        lieu_signature_convention: lieu_signature_convention ?? null,
        date_signature_convention: date_signature_convention || null,
      },
      { onConflict: "dossier_id" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!wasStep2Completed && isStep2Completed) {
      const { data: existingMessage, error: existingMessageError } =
        await supabase
          .from("messages")
          .select("id")
          .eq("dossier_id", dossierId)
          .eq("sender_type", "client")
          .eq("content", STEP_2_COMPLETED_MESSAGE)
          .maybeSingle();

      if (existingMessageError) {
        return NextResponse.json(
          { error: existingMessageError.message },
          { status: 500 },
        );
      }

      if (!existingMessage) {
        const { data: createdMessage, error: messageError } = await supabase
          .from("messages")
          .insert({
            dossier_id: dossierId,
            sender_type: "client",
            content: STEP_2_COMPLETED_MESSAGE,
            read_by_agent_at: null,
          })
          .select("id")
          .single();

        if (messageError) {
          return NextResponse.json(
            { error: messageError.message },
            { status: 500 },
          );
        }

        await createAgentNotification({
          supabase,
          dossierId,
          type: "client_step_completed",
          title: "Informations convention transmises",
          content: STEP_2_COMPLETED_MESSAGE,
          sourceMessageId: createdMessage.id,
        });
      }
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
