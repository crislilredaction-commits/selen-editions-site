import { NextResponse } from "next/server";

import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dossierId = searchParams.get("dossierId");
    const documentId = searchParams.get("documentId");

    if (!dossierId || !documentId) {
      return NextResponse.json(
        { error: "dossierId et documentId sont obligatoires." },
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

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select(
        `
        id,
        name,
        dossier_id,
        storage_path,
        is_visible_to_client,
        document_role,
        review_status
      `,
      )
      .eq("id", documentId)
      .eq("dossier_id", dossierId)
      .maybeSingle();

    if (documentError) {
      return NextResponse.json(
        { error: documentError.message },
        { status: 500 },
      );
    }

    if (!document) {
      return NextResponse.json(
        { error: "Document introuvable." },
        { status: 404 },
      );
    }

    if (!document.is_visible_to_client) {
      return NextResponse.json(
        { error: "Ce document n’est pas disponible côté client." },
        { status: 403 },
      );
    }

    if (!document.storage_path) {
      return NextResponse.json(
        { error: "Le fichier associé à ce document est introuvable." },
        { status: 404 },
      );
    }

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("documents")
        .createSignedUrl(document.storage_path, 60 * 5, {
          download: document.name ?? true,
        });

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return NextResponse.json(
        {
          error:
            signedUrlError?.message ??
            "Impossible de générer le lien de téléchargement.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      url: signedUrlData.signedUrl,
      name: document.name,
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
