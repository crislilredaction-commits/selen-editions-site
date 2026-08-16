import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function safeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "attestation";
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
    .limit(2);
  if (byUserError) throw new Error(byUserError.message);
  if ((byUser ?? []).length === 1) return byUser![0].id as string;
  if ((byUser ?? []).length > 1) throw new Error("Plusieurs fiches formateur sont rattachées à ce compte.");

  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;
  const { data: byEmail, error: byEmailError } = await admin
    .from("daily_trainer_profiles")
    .select("id")
    .eq("organisation_id", organisationId)
    .ilike("professional_email", normalizedEmail)
    .limit(2);
  if (byEmailError) throw new Error(byEmailError.message);
  if ((byEmail ?? []).length === 1) return byEmail![0].id as string;
  if ((byEmail ?? []).length > 1) throw new Error("Plusieurs fiches formateur utilisent cette adresse email.");
  return null;
}

export async function POST(req: Request) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.workspace.membership.roles.includes("trainer")) {
    return NextResponse.json({ error: "Accès réservé aux formateurs." }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const trainingId = String(formData?.get("training_id") ?? "").trim();
  const file = formData?.get("file");
  if (!trainingId || !(file instanceof File)) {
    return NextResponse.json({ error: "Formation et attestation requises." }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Format accepté : PDF, JPG ou PNG." }, { status: 400 });
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

    const { data: training, error: trainingError } = await admin
      .from("daily_trainer_annual_review_trainings")
      .select("id,annual_review_id,training_kind,title,daily_trainer_annual_reviews!inner(id,trainer_profile_id,review_year,status)")
      .eq("id", trainingId)
      .single();
    if (trainingError || !training) return NextResponse.json({ error: "Formation annuelle introuvable." }, { status: 404 });

    const reviewRelation = Array.isArray(training.daily_trainer_annual_reviews)
      ? training.daily_trainer_annual_reviews[0]
      : training.daily_trainer_annual_reviews;
    if (!reviewRelation || reviewRelation.trainer_profile_id !== trainerProfileId) {
      return NextResponse.json({ error: "Cette formation ne vous appartient pas." }, { status: 403 });
    }
    if (reviewRelation.status === "submitted") {
      return NextResponse.json({ error: "Cette auto-évaluation a déjà été transmise." }, { status: 409 });
    }
    if (training.training_kind !== "completed") {
      return NextResponse.json({ error: "Une attestation n’est attendue que pour une formation suivie." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const hash = await sha256(buffer);
    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const storagePath = `daily/${organisationId}/trainer/${trainerProfileId}/annual-review/${reviewRelation.review_year}/${trainingId}/${stamp}-${safeName(file.name)}`;

    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: document, error: documentError } = await admin
      .from("daily_documents")
      .insert({
        organisation_id: organisationId,
        document_type: "trainer_training_attestation",
        linked_object_type: "trainer_annual_review_training",
        linked_object_id: trainingId,
        version: 1,
        status: "active",
        logical_name: `attestation-${safeName(training.title)}`,
        bucket: "documents",
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        sha256: hash,
        created_by: context.user.id,
        updated_by: context.user.id,
        is_current: true,
        metadata: {
          trainer_profile_id: trainerProfileId,
          annual_review_id: reviewRelation.id,
          review_year: reviewRelation.review_year,
          training_id: trainingId,
          original_filename: file.name,
          source: "daily_trainer_annual_review",
        },
      })
      .select("id")
      .single();

    if (documentError || !document?.id) {
      await admin.storage.from("documents").remove([storagePath]);
      throw new Error(documentError?.message ?? "Enregistrement de l’attestation impossible.");
    }

    const { error: linkError } = await admin
      .from("daily_trainer_annual_review_trainings")
      .update({ attestation_document_id: document.id, updated_at: new Date().toISOString() })
      .eq("id", trainingId);
    if (linkError) {
      await admin.from("daily_documents").update({ status: "archived", is_current: false, archived_at: new Date().toISOString() }).eq("id", document.id);
      throw new Error(linkError.message);
    }

    return NextResponse.json({ ok: true, document_id: document.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Téléversement de l’attestation impossible." },
      { status: 500 },
    );
  }
}
