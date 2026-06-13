import { NextResponse } from "next/server";
import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dossierId = searchParams.get("dossierId");

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const supabase = getAdminSupabase();
    const access = await verifyClientNdaDossierAccess(supabase, dossierId);

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const dossier = access.dossier;

    const { data: ndaVariables, error: ndaVariablesError } = await supabase
      .from("nda_variables")
      .select(
        `
      stagiaire_prenom,
      stagiaire_nom,
      stagiaire_adresse,
      stagiaire_email,
      stagiaire_telephone,
      client_siret,
      date_formation_prevue,
      lieu_formation
    `,
      )
      .eq("dossier_id", dossierId)
      .maybeSingle();

    if (ndaVariablesError) {
      return NextResponse.json(
        { error: ndaVariablesError.message },
        { status: 500 },
      );
    }

    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select(
        `
        id,
        name,
        document_type,
        document_role,
        review_status,
        requires_client_action,
        is_visible_to_client,
        source,
        status,
        created_at
      `,
      )
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false });

    if (docsError) {
      return NextResponse.json({ error: docsError.message }, { status: 500 });
    }

    const { data: latestProgramVersion, error: latestProgramVersionError } =
      await supabase
        .from("dossier_program_versions")
        .select("client_decision")
        .eq("dossier_id", dossierId)
        .eq("version_type", "client_sent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (latestProgramVersionError) {
      return NextResponse.json(
        { error: latestProgramVersionError.message },
        { status: 500 },
      );
    }

    const programDecision = latestProgramVersion?.client_decision ?? null;

    const receivedTypes = (documents ?? []).map((doc) => doc.document_type);

    const hasCv = receivedTypes.includes("cv_formateur");
    const hasProgramme = receivedTypes.includes("programme_formation");
    const hasEntrepriseDoc =
      receivedTypes.includes("avis_insee") || receivedTypes.includes("kbis");

    const step1Submitted = hasCv && hasProgramme && hasEntrepriseDoc;
    const safeDocuments = (documents ?? []).map((document) => ({
      id: document.id,
      name: document.name,
      document_type: document.document_type,
      document_role: document.document_role,
      review_status: document.review_status,
      requires_client_action: document.requires_client_action,
      status: document.status,
      created_at: document.created_at,
    }));

    const clientUploadedDocuments = safeDocuments.filter(
      (document) =>
        documents?.some(
          (sourceDocument) =>
            sourceDocument.id === document.id &&
            (sourceDocument.source === "client_upload" ||
              sourceDocument.document_role === "initial_client_document" ||
              sourceDocument.document_role === "client_returned_document"),
        ) ?? false,
    );

    const publishedDocuments = safeDocuments.filter(
      (document) =>
        documents?.some(
          (sourceDocument) =>
            sourceDocument.id === document.id &&
            sourceDocument.is_visible_to_client === true &&
            sourceDocument.source !== "client_upload" &&
            sourceDocument.document_role !== "initial_client_document" &&
            sourceDocument.document_role !== "client_returned_document",
        ) ?? false,
    );

    return NextResponse.json({
      dossier: {
        id: dossier.id,
        status: dossier.status,
        title: dossier.title,
      },
      step1Submitted,
      programDecision,
      clientUploadedDocuments,
      publishedDocuments,
      step2: {
        stagiaire_prenom: ndaVariables?.stagiaire_prenom ?? "",
        stagiaire_nom: ndaVariables?.stagiaire_nom ?? "",
        stagiaire_adresse: ndaVariables?.stagiaire_adresse ?? "",
        stagiaire_email: ndaVariables?.stagiaire_email ?? "",
        stagiaire_telephone: ndaVariables?.stagiaire_telephone ?? "",
        client_siret: ndaVariables?.client_siret ?? "",
        date_formation_prevue: ndaVariables?.date_formation_prevue ?? "",
        lieu_formation: ndaVariables?.lieu_formation ?? "",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
