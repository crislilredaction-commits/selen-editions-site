import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

const VALIDITY_MODES = new Set(["lifetime", "limited", "unknown"]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function getTrainerContext() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return context;
  if (!context.workspace.membership.roles.includes("trainer")) {
    return { ok: false as const, status: 403, error: "Accès réservé aux formateurs." };
  }

  const admin = getAdminSupabase();
  const organisationId = context.workspace.membership.organisation_id;
  const { data: byUser, error: byUserError } = await admin
    .from("daily_trainer_profiles")
    .select("id,organisation_id,user_id,professional_email,display_name")
    .eq("organisation_id", organisationId)
    .eq("user_id", context.user.id)
    .eq("active", true)
    .limit(2);
  if (byUserError) return { ok: false as const, status: 500, error: byUserError.message };
  if ((byUser ?? []).length === 1) return { ...context, organisationId, trainer: byUser![0] };
  if ((byUser ?? []).length > 1) {
    return { ok: false as const, status: 409, error: "Plusieurs fiches formateur sont rattachées à votre compte." };
  }

  const email = context.user.email?.trim().toLowerCase();
  if (!email) return { ok: false as const, status: 409, error: "Votre compte n’est pas rattaché à une fiche formateur." };
  const { data: byEmail, error: byEmailError } = await admin
    .from("daily_trainer_profiles")
    .select("id,organisation_id,user_id,professional_email,display_name")
    .eq("organisation_id", organisationId)
    .ilike("professional_email", email)
    .eq("active", true)
    .limit(2);
  if (byEmailError) return { ok: false as const, status: 500, error: byEmailError.message };
  if ((byEmail ?? []).length === 1) return { ...context, organisationId, trainer: byEmail![0] };
  if ((byEmail ?? []).length > 1) {
    return { ok: false as const, status: 409, error: "Plusieurs fiches formateur utilisent votre adresse email." };
  }
  return { ok: false as const, status: 409, error: "Votre compte n’est pas rattaché à une fiche formateur." };
}

export async function GET() {
  const context = await getTrainerContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const admin = getAdminSupabase();

  const { data: certifications, error } = await admin
    .from("daily_trainer_certifications")
    .select("id,title,issuer,reference,obtained_on,valid_until,validity_mode,note,created_at,updated_at")
    .eq("trainer_profile_id", context.trainer.id)
    .order("obtained_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (certifications ?? []).map((item) => item.id);
  const proofByCertification: Record<string, { id: string; name: string; mime_type: string | null; url: string | null }> = {};
  if (ids.length > 0) {
    const { data: documents, error: documentError } = await admin
      .from("daily_documents")
      .select("id,linked_object_id,logical_name,bucket,storage_path,mime_type")
      .eq("organisation_id", context.organisationId)
      .eq("linked_object_type", "trainer_certification")
      .eq("document_type", "trainer_qualification_proof")
      .eq("is_current", true)
      .in("linked_object_id", ids);
    if (documentError) return NextResponse.json({ error: documentError.message }, { status: 500 });

    for (const document of documents ?? []) {
      if (!document.linked_object_id) continue;
      const { data: signed } = await admin.storage.from(document.bucket).createSignedUrl(document.storage_path, 15 * 60);
      proofByCertification[String(document.linked_object_id)] = {
        id: document.id,
        name: document.logical_name,
        mime_type: document.mime_type,
        url: signed?.signedUrl ?? null,
      };
    }
  }

  return NextResponse.json({ trainer: context.trainer, certifications: certifications ?? [], proofByCertification });
}

export async function PATCH(req: Request) {
  const context = await getTrainerContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = clean(body.id);
  const title = clean(body.title);
  const validityMode = clean(body.validity_mode) || "unknown";
  const obtainedOn = clean(body.obtained_on);
  const validUntil = clean(body.valid_until);

  if (!title) return NextResponse.json({ error: "L’intitulé de la certification est requis." }, { status: 400 });
  if (!VALIDITY_MODES.has(validityMode)) return NextResponse.json({ error: "Durée de validité invalide." }, { status: 400 });
  if (validityMode === "limited" && !validUntil) {
    return NextResponse.json({ error: "La date de fin de validité est requise pour une certification à durée limitée." }, { status: 400 });
  }
  if (obtainedOn && validUntil && validUntil < obtainedOn) {
    return NextResponse.json({ error: "La fin de validité ne peut pas précéder la date d’obtention." }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const now = new Date().toISOString();
  const payload = {
    trainer_profile_id: context.trainer.id,
    title,
    issuer: clean(body.issuer) || null,
    reference: clean(body.reference) || null,
    obtained_on: obtainedOn || null,
    validity_mode: validityMode,
    valid_until: validityMode === "limited" ? validUntil : null,
    note: clean(body.note) || null,
    updated_by: context.user.id,
    updated_at: now,
  };

  if (id) {
    const { data, error } = await admin
      .from("daily_trainer_certifications")
      .update(payload)
      .eq("id", id)
      .eq("trainer_profile_id", context.trainer.id)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.id) return NextResponse.json({ error: "Certification introuvable dans votre dossier." }, { status: 404 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  const { data, error } = await admin
    .from("daily_trainer_certifications")
    .insert({ ...payload, created_by: context.user.id })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
