import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function safeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "justificatif";
}

async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolveTrainerProfile(organisationId: string, userId: string, email?: string | null) {
  const admin = getAdminSupabase();
  const { data: byUser, error: byUserError } = await admin
    .from("daily_trainer_profiles")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .eq("active", true)
    .limit(2);
  if (byUserError) throw new Error(byUserError.message);
  if ((byUser ?? []).length === 1) return byUser![0].id as string;
  if ((byUser ?? []).length > 1) throw new Error("Plusieurs fiches formateur sont rattachées à votre compte.");

  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;
  const { data: byEmail, error: byEmailError } = await admin
    .from("daily_trainer_profiles")
    .select("id")
    .eq("organisation_id", organisationId)
    .ilike("professional_email", normalizedEmail)
    .eq("active", true)
    .limit(2);
  if (byEmailError) throw new Error(byEmailError.message);
  if ((byEmail ?? []).length === 1) return byEmail![0].id as string;
  if ((byEmail ?? []).length > 1) throw new Error("Plusieurs fiches formateur utilisent votre adresse email.");
  return null;
}

export async function POST(req: Request) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.workspace.membership.roles.includes("trainer")) {
    return NextResponse.json({ error: "Accès réservé aux formateurs." }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const certificationId = String(formData?.get("certification_id") ?? "").trim();
  if (!certificationId) return NextResponse.json({ error: "Certification requise." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Justificatif requis." }, { status: 400 });
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Format accepté : PDF, JPG, PNG ou WEBP." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Le fichier doit faire moins de 10 Mo." }, { status: 400 });
  }

  const organisationId = context.workspace.membership.organisation_id;
  const admin = getAdminSupabase();
  try {
    const trainerProfileId = await resolveTrainerProfile(organisationId, context.user.id, context.user.email);
    if (!trainerProfileId) {
      return NextResponse.json({ error: "Votre compte n’est pas rattaché à une fiche formateur." }, { status: 409 });
    }

    const { data: certification, error: certificationError } = await admin
      .from("daily_trainer_certifications")
      .select("id,title")
      .eq("id", certificationId)
      .eq("trainer_profile_id", trainerProfileId)
      .maybeSingle();
    if (certificationError) throw new Error(certificationError.message);
    if (!certification?.id) return NextResponse.json({ error: "Certification introuvable dans votre dossier." }, { status: 404 });

    const { data: previousRows, error: previousError } = await admin
      .from("daily_documents")
      .select("id,version,is_current")
      .eq("organisation_id", organisationId)
      .eq("document_type", "trainer_qualification_proof")
      .eq("linked_object_type", "trainer_certification")
      .eq("linked_object_id", certificationId)
      .order("version", { ascending: false })
      .limit(1);
    if (previousError) throw new Error(previousError.message);
    const previous = previousRows?.[0] ?? null;
    const version = Number(previous?.version ?? 0) + 1;

    const buffer = await file.arrayBuffer();
    const hash = await sha256(buffer);
    const now = new Date();
    const stamp = now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const storagePath = `daily/${organisationId}/trainer/${trainerProfileId}/certifications/${certificationId}/${stamp}-${safeName(file.name)}`;
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: document, error: documentError } = await admin
      .from("daily_documents")
      .insert({
        organisation_id: organisationId,
        document_type: "trainer_qualification_proof",
        linked_object_type: "trainer_certification",
        linked_object_id: certificationId,
        version,
        status: "active",
        logical_name: file.name || certification.title,
        bucket: "documents",
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        sha256: hash,
        created_by: context.user.id,
        updated_by: context.user.id,
        is_current: true,
        previous_document_id: previous?.id ?? null,
        metadata: {
          trainer_profile_id: trainerProfileId,
          certification_id: certificationId,
          original_filename: file.name,
          source: "daily_trainer_certification_proof",
        },
      })
      .select("id")
      .single();
    if (documentError || !document?.id) {
      await admin.storage.from("documents").remove([storagePath]);
      throw new Error(documentError?.message ?? "Enregistrement du justificatif impossible.");
    }

    const { error: linkError } = await admin.from("daily_trainer_profile_documents").insert({
      trainer_profile_id: trainerProfileId,
      daily_document_id: document.id,
      document_purpose: "qualification",
    });
    if (linkError) {
      await admin.from("daily_documents").update({ status: "archived", is_current: false, archived_at: now.toISOString() }).eq("id", document.id);
      await admin.storage.from("documents").remove([storagePath]);
      throw new Error(linkError.message);
    }

    if (previous?.id && previous.is_current) {
      const { error: previousUpdateError } = await admin
        .from("daily_documents")
        .update({ is_current: false, updated_by: context.user.id })
        .eq("id", previous.id);
      if (previousUpdateError) throw new Error(previousUpdateError.message);
    }

    return NextResponse.json({ ok: true, document_id: document.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ajout du justificatif impossible." },
      { status: 500 },
    );
  }
}
