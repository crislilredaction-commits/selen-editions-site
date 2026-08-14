import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import {
  DAILY_ATTENDANCE_CONSENT,
  buildAttendanceProofHash,
  createAttendanceVerificationCode,
  hashAttendanceEmail,
  hashAttendanceSignature,
  hashAttendanceToken,
  hashAttendanceVerificationCode,
  signatureBufferFromDataUrl,
} from "@/lib/server/dailyAttendance";
import { sendDailyAttendanceVerificationCode } from "@/lib/server/dailyAttendanceEmails";

type Params = { params: Promise<{ token: string }> };

function formationTitle(value: unknown) {
  if (Array.isArray(value)) return value[0]?.title ?? "Formation Selen Daily";
  if (value && typeof value === "object" && "title" in value) {
    return String((value as { title?: unknown }).title ?? "Formation Selen Daily");
  }
  return "Formation Selen Daily";
}

async function getAccess(rawToken: string) {
  const admin = getAdminSupabase();
  const { data: access, error } = await admin
    .from("daily_attendance_access_tokens")
    .select("id,organisation_id,session_id,slot_id,enrolment_id,access_type,channel,status,expires_at")
    .eq("token_hash", hashAttendanceToken(rawToken))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!access) return null;
  return { admin, access };
}

function accessUnavailable(access: { status: string; expires_at: string }) {
  return access.status !== "active" || new Date(access.expires_at).getTime() < Date.now();
}

async function getIdentity(
  admin: ReturnType<typeof getAdminSupabase>,
  access: { organisation_id: string; session_id: string; enrolment_id?: string | null; access_type: string },
  email?: string,
) {
  let enrolment = null;
  if (access.access_type === "individual" && access.enrolment_id) {
    const result = await admin
      .from("daily_session_enrolments")
      .select("id,learner_id,status")
      .eq("organisation_id", access.organisation_id)
      .eq("session_id", access.session_id)
      .eq("id", access.enrolment_id)
      .maybeSingle();
    enrolment = result.data;
  } else {
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!normalizedEmail) return null;
    const { data: learner } = await admin
      .from("daily_learners")
      .select("id,first_name,last_name,email")
      .eq("organisation_id", access.organisation_id)
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (!learner) return null;
    const { data } = await admin
      .from("daily_session_enrolments")
      .select("id,learner_id,status")
      .eq("organisation_id", access.organisation_id)
      .eq("session_id", access.session_id)
      .eq("learner_id", learner.id)
      .maybeSingle();
    enrolment = data;
  }
  if (!enrolment || ["declined", "cancelled"].includes(enrolment.status)) return null;
  const { data: learner } = await admin
    .from("daily_learners")
    .select("id,first_name,last_name,email")
    .eq("organisation_id", access.organisation_id)
    .eq("id", enrolment.learner_id)
    .maybeSingle();
  return learner ? { enrolment, learner } : null;
}

async function loadSlotAndSession(
  admin: ReturnType<typeof getAdminSupabase>,
  access: { slot_id: string; session_id: string; organisation_id: string },
) {
  const [{ data: slot }, { data: session }] = await Promise.all([
    admin.from("daily_attendance_slots").select("id,slot_date,starts_at,ends_at,mode,label,status").eq("id", access.slot_id).eq("organisation_id", access.organisation_id).maybeSingle(),
    admin.from("daily_sessions").select("id,internal_reference,modality,start_date,end_date,daily_formations(id,title)").eq("id", access.session_id).eq("organisation_id", access.organisation_id).maybeSingle(),
  ]);
  return { slot, session };
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const rawToken = String(token ?? "").trim();
  if (!rawToken) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  try {
    const loaded = await getAccess(rawToken);
    if (!loaded) return NextResponse.json({ error: "Lien d'émargement introuvable." }, { status: 404 });
    const { admin, access } = loaded;
    if (accessUnavailable(access)) return NextResponse.json({ error: "Ce lien d'émargement n'est plus actif." }, { status: 410 });
    const { slot, session } = await loadSlotAndSession(admin, access);
    if (!slot || !session || ["closed", "cancelled"].includes(slot.status)) {
      return NextResponse.json({ error: "Ce créneau d'émargement n'est plus disponible." }, { status: 410 });
    }
    const identity = access.access_type === "individual" ? await getIdentity(admin, access) : null;
    let record = null;
    if (identity) {
      const result = await admin.from("daily_attendance_records").select("status,signed_at").eq("slot_id", access.slot_id).eq("enrolment_id", identity.enrolment.id).maybeSingle();
      record = result.data;
    }
    await admin.from("daily_attendance_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", access.id);
    return NextResponse.json({
      accessType: access.access_type,
      channel: access.channel,
      session: { title: formationTitle(session.daily_formations), reference: session.internal_reference, modality: session.modality, startDate: session.start_date, endDate: session.end_date },
      slot,
      learner: identity?.learner ?? null,
      alreadySigned: record?.status === "present",
      signedAt: record?.signed_at ?? null,
      consentText: DAILY_ATTENDANCE_CONSENT,
      requiresEmailCode: access.access_type === "shared",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ouverture impossible." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const rawToken = String(token ?? "").trim();
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!rawToken) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  try {
    const loaded = await getAccess(rawToken);
    if (!loaded) return NextResponse.json({ error: "Lien d'émargement introuvable." }, { status: 404 });
    const { admin, access } = loaded;
    if (accessUnavailable(access)) return NextResponse.json({ error: "Ce lien d'émargement n'est plus actif." }, { status: 410 });
    const { slot, session } = await loadSlotAndSession(admin, access);
    if (!slot || !session || ["closed", "cancelled"].includes(slot.status)) {
      return NextResponse.json({ error: "Ce créneau est fermé." }, { status: 410 });
    }

    if (body.action === "request_code") {
      if (access.access_type !== "shared") return NextResponse.json({ error: "Ce lien ne nécessite pas de code." }, { status: 400 });
      const email = String(body.email ?? "").trim().toLowerCase();
      const identity = await getIdentity(admin, access, email);
      if (!identity?.learner.email) return NextResponse.json({ error: "Cette adresse ne correspond pas à une inscription active." }, { status: 404 });

      const { data: recent } = await admin
        .from("daily_attendance_verifications")
        .select("created_at")
        .eq("access_token_id", access.id)
        .eq("enrolment_id", identity.enrolment.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
        return NextResponse.json({ error: "Un code vient déjà d'être envoyé. Patientez une minute avant de recommencer." }, { status: 429 });
      }

      await admin
        .from("daily_attendance_verifications")
        .update({ status: "expired" })
        .eq("access_token_id", access.id)
        .eq("enrolment_id", identity.enrolment.id)
        .eq("status", "pending");

      const { code, codeHash } = createAttendanceVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const { data: verification, error: verificationError } = await admin
        .from("daily_attendance_verifications")
        .insert({
          organisation_id: access.organisation_id,
          session_id: access.session_id,
          slot_id: access.slot_id,
          access_token_id: access.id,
          enrolment_id: identity.enrolment.id,
          email_hash: hashAttendanceEmail(email),
          code_hash: codeHash,
          status: "pending",
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      if (verificationError || !verification) return NextResponse.json({ error: "Le code n'a pas pu être préparé." }, { status: 500 });

      const learnerName = `${identity.learner.first_name ?? ""} ${identity.learner.last_name ?? ""}`.trim();
      const sent = await sendDailyAttendanceVerificationCode({
        email: identity.learner.email,
        learnerName,
        formationTitle: formationTitle(session.daily_formations),
        code,
      });
      if (!sent.sent) {
        await admin.from("daily_attendance_verifications").update({ status: "expired" }).eq("id", verification.id);
        return NextResponse.json({ error: "Le code n'a pas pu être envoyé. Réessayez dans quelques instants." }, { status: 503 });
      }
      return NextResponse.json({ ok: true, verificationId: verification.id, expiresAt });
    }

    if (body.consent !== true) return NextResponse.json({ error: "Le consentement est obligatoire." }, { status: 400 });
    const signature = signatureBufferFromDataUrl(String(body.signature_data ?? ""));
    if (!signature) return NextResponse.json({ error: "La signature dessinée est obligatoire." }, { status: 400 });

    const identity = await getIdentity(admin, access, String(body.email ?? ""));
    if (!identity) return NextResponse.json({ error: "Votre inscription n'a pas été retrouvée." }, { status: 404 });

    if (access.access_type === "shared") {
      const verificationId = String(body.verification_id ?? "").trim();
      const code = String(body.code ?? "").trim();
      if (!verificationId || !/^\d{6}$/.test(code)) return NextResponse.json({ error: "Saisissez le code à 6 chiffres reçu par e-mail." }, { status: 400 });
      const { data: verification } = await admin
        .from("daily_attendance_verifications")
        .select("id,status,attempts,expires_at,code_hash,email_hash")
        .eq("id", verificationId)
        .eq("access_token_id", access.id)
        .eq("enrolment_id", identity.enrolment.id)
        .maybeSingle();
      if (!verification || verification.status !== "pending" || new Date(verification.expires_at).getTime() < Date.now()) {
        if (verification?.id && verification.status === "pending") await admin.from("daily_attendance_verifications").update({ status: "expired" }).eq("id", verification.id);
        return NextResponse.json({ error: "Ce code a expiré. Demandez-en un nouveau." }, { status: 410 });
      }
      if (verification.email_hash !== hashAttendanceEmail(String(body.email ?? "")) || verification.code_hash !== hashAttendanceVerificationCode(code)) {
        const attempts = Number(verification.attempts ?? 0) + 1;
        await admin.from("daily_attendance_verifications").update({ attempts, status: attempts >= 5 ? "locked" : "pending" }).eq("id", verification.id);
        return NextResponse.json({ error: attempts >= 5 ? "Trop de tentatives. Demandez un nouveau code." : "Code incorrect." }, { status: attempts >= 5 ? 429 : 400 });
      }
      await admin.from("daily_attendance_verifications").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", verification.id);
    }

    const { data: current } = await admin.from("daily_attendance_records").select("status,signed_at").eq("slot_id", access.slot_id).eq("enrolment_id", identity.enrolment.id).maybeSingle();
    if (current?.status === "present") return NextResponse.json({ ok: true, alreadySigned: true, signedAt: current.signed_at });

    const signedAt = new Date().toISOString();
    const signatureSha256 = hashAttendanceSignature(signature);
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
    const userAgent = request.headers.get("user-agent");
    const proofSha256 = buildAttendanceProofHash({
      organisationId: access.organisation_id,
      sessionId: access.session_id,
      slotId: access.slot_id,
      enrolmentId: identity.enrolment.id,
      signedAt,
      consentText: DAILY_ATTENDANCE_CONSENT,
      signatureSha256,
      ipAddress,
      userAgent,
    });
    const storagePath = `daily-attendance/${access.organisation_id}/${access.session_id}/${access.slot_id}/${identity.enrolment.id}/${Date.now()}-${randomUUID()}.png`;
    const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, signature, { contentType: "image/png", upsert: false });
    if (uploadError) return NextResponse.json({ error: "La preuve de signature n'a pas pu être conservée." }, { status: 500 });

    const { error: recordError } = await admin.from("daily_attendance_records").upsert({
      organisation_id: access.organisation_id,
      session_id: access.session_id,
      slot_id: access.slot_id,
      enrolment_id: identity.enrolment.id,
      status: "present",
      consent_text: DAILY_ATTENDANCE_CONSENT,
      signature_storage_path: storagePath,
      signature_sha256: signatureSha256,
      proof_sha256: proofSha256,
      signed_at: signedAt,
      ip_address: ipAddress,
      user_agent: userAgent,
      evidence_metadata: { channel: access.channel, access_type: access.access_type, email_code_verified: access.access_type === "shared" },
      updated_at: signedAt,
    }, { onConflict: "slot_id,enrolment_id" });
    if (recordError) return NextResponse.json({ error: recordError.message }, { status: 500 });

    await admin.from("daily_attendance_access_tokens").update({ last_used_at: signedAt }).eq("id", access.id);
    await admin.from("daily_session_checklist_items").update({ status: "in_progress" }).eq("organisation_id", access.organisation_id).eq("session_id", access.session_id).eq("item_key", "attendance_followup").eq("status", "todo");
    return NextResponse.json({ ok: true, signedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Émargement impossible." }, { status: 500 });
  }
}
