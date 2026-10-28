import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { findUniqueDailyLearnerPortalEnrolment, matchesDailyLearnerPortalAccess } from "@/lib/server/dailyPortalLearnerIdentity";
import {
  attendanceIsSettled,
  isPostsessionDownloadAvailable,
  safePersonalDownloadName,
} from "@/lib/server/dailyPersonalAttendance";

type Params = { params: Promise<{ token: string }> };
type Json = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const one = (value: unknown): Json => Array.isArray(value) ? (value[0] as Json | undefined) ?? {} : value && typeof value === "object" ? value as Json : {};

function isExpired(value: unknown) {
  const expiresAt = text(value);
  return Boolean(expiresAt && Date.parse(expiresAt) < Date.now());
}

function storageObjectPath(path: string) {
  return path.startsWith("documents/") ? path.slice("documents/".length) : path;
}

function formatDate(value: unknown, withTime = false) {
  const raw = text(value);
  if (!raw) return "Non renseigné";
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("fr-FR", withTime
      ? { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }
      : { dateStyle: "medium", timeZone: "Europe/Paris" }).format(date)
    : raw;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const enrolmentId = new URL(request.url).searchParams.get("enrolment") ?? "";
  if (!text(token) || !enrolmentId) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: access, error: accessError } = await admin
    .from("daily_portal_access_tokens")
    .select("session_id,portal_type,entity_key,entity_name,entity_email,status,expires_at")
    .eq("token", text(token))
    .maybeSingle();
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });
  if (!access || access.portal_type !== "learner") return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (!["pending", "viewed"].includes(text(access.status))) return NextResponse.json({ error: "Cet accès n’est plus actif." }, { status: 403 });
  if (isExpired(access.expires_at)) return NextResponse.json({ error: "Ce lien de portail a expiré." }, { status: 410 });

  const [{ data: session, error: sessionError }, { data: enrolment, error: enrolmentError }] = await Promise.all([
    admin
      .from("daily_sessions")
      .select("id,organisation_id,internal_reference,start_date,end_date,status,daily_formations(title)")
      .eq("id", access.session_id)
      .neq("status", "archived")
      .maybeSingle(),
    admin
      .from("daily_session_enrolments")
      .select("id,learner_id,organisation_id,session_id,status,daily_learners(first_name,last_name,email)")
      .eq("id", enrolmentId)
      .eq("session_id", access.session_id)
      .not("status", "in", "(declined,cancelled,abandoned)")
      .maybeSingle(),
  ]);
  const readError = sessionError ?? enrolmentError;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!session || !enrolment || enrolment.organisation_id !== session.organisation_id) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  const learner = one(enrolment.daily_learners);
  if (!matchesDailyLearnerPortalAccess(access, enrolment)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  // Check every enrolment in this OF/session, including cancelled ones.
  // A legacy email-only link must never authorize a different learner's private evidence.
  const { data: sessionEnrolments, error: scopeError } = await admin
    .from("daily_session_enrolments")
    .select("id,learner_id,status,daily_learners(email)")
    .eq("organisation_id", session.organisation_id)
    .eq("session_id", session.id);
  if (scopeError) return NextResponse.json({ error: scopeError.message }, { status: 500 });
  if (findUniqueDailyLearnerPortalEnrolment(access, sessionEnrolments ?? [])?.id !== enrolment.id)
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  if (!isPostsessionDownloadAvailable(session.end_date)) return NextResponse.json({ error: "Le relevé personnel sera disponible après la fin de la session." }, { status: 409 });

  const [{ data: slots, error: slotsError }, { data: records, error: recordsError }, { data: organisation, error: organisationError }, { data: publishedAttendance, error: publicationError }, { data: trainerSignatures, error: trainerSignatureError }] = await Promise.all([
    admin
      .from("daily_attendance_slots")
      .select("id,slot_date,starts_at,ends_at")
      .eq("organisation_id", session.organisation_id)
      .eq("session_id", session.id)
      .neq("status", "cancelled")
      .order("slot_date")
      .order("starts_at"),
    admin
      .from("daily_attendance_records")
      .select("slot_id,status,signed_at,signature_storage_path")
      .eq("organisation_id", session.organisation_id)
      .eq("session_id", session.id)
      .eq("enrolment_id", enrolment.id),
    admin
      .from("organisations")
      .select("name,legal_name,siret,nda_number")
      .eq("id", session.organisation_id)
      .maybeSingle(),
    admin
      .from("daily_documents")
      .select("id")
      .eq("organisation_id", session.organisation_id)
      .eq("session_id", session.id)
      .eq("document_type", "attendance_summary")
      .in("status", ["published", "signed"])
      .eq("is_current", true)
      .is("archived_at", null)
      .maybeSingle(),
    admin
      .from("daily_documents")
      .select("id,signed_at,storage_path,mime_type,metadata")
      .eq("organisation_id", session.organisation_id)
      .eq("session_id", session.id)
      .eq("document_type", "trainer_signature_evidence")
      .eq("status", "signed")
      .eq("is_current", true),
  ]);
  const attendanceError = slotsError ?? recordsError ?? organisationError ?? publicationError ?? trainerSignatureError;
  if (attendanceError) return NextResponse.json({ error: attendanceError.message }, { status: 500 });
  if (!publishedAttendance) {
    return NextResponse.json({ error: "La feuille individuelle sera disponible après validation et publication du relevé d’émargement." }, { status: 409 });
  }
  if (!attendanceIsSettled((slots ?? []).map((slot: Json) => slot.id), records ?? [])) {
    return NextResponse.json({ error: "Le relevé personnel sera disponible lorsque toutes vos présences auront été traitées." }, { status: 409 });
  }

  const recordBySlot = new Map((records ?? []).map((record: Json) => [text(record.slot_id), record]));
  const learnerName = [text(learner.first_name), text(learner.last_name)].filter(Boolean).join(" ") || text(learner.email).toLowerCase() || "Apprenant";
  const formation = one(session.daily_formations);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 14, right = 196;
  let y = 16;
  const ensure = (height: number) => { if (y + height > 282) { doc.addPage(); y = 16; } };
  const line = (value: string, size = 9, bold = false) => {
    ensure(7);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const parts = doc.splitTextToSize(value, right - left) as string[];
    for (const part of parts) { ensure(5); doc.text(part, left, y); y += 5; }
  };
  const addSignature = async (label: string, path: unknown, signedAt: unknown) => {
    const storagePath = text(path);
    line(`${label}${signedAt ? ` · ${formatDate(signedAt, true)}` : ""}`, 8, true);
    if (!storagePath) { line("Signature non enregistrée.", 8); return; }
    const { data, error } = await admin.storage.from("documents").download(storageObjectPath(storagePath));
    if (error || !data) { line("Signature conservée, aperçu temporairement indisponible.", 8); return; }
    const bytes = Buffer.from(await data.arrayBuffer());
    ensure(24);
    doc.addImage(bytes.toString("base64"), "PNG", left, y, 48, 20, undefined, "FAST");
    y += 24;
  };

  line("Feuille d’émargement individuelle", 16, true);
  line(`Apprenant : ${learnerName}`, 11, true);
  line(`Organisme : ${text(organisation?.legal_name || organisation?.name) || "Organisme de formation"}`);
  line(`Formation : ${text(formation.title) || "Formation"}`);
  line(`Session : ${text(session.internal_reference) || "Sans référence"}`);
  line(`Période : ${formatDate(session.start_date)} au ${formatDate(session.end_date)}`);
  y += 3;

  for (const slot of slots ?? []) {
    const record = recordBySlot.get(text(slot.id));
    const status = text(record?.status);
    ensure(42);
    doc.setDrawColor(190);
    doc.line(left, y, right, y);
    y += 6;
    line(`${formatDate(slot.slot_date)} · ${text(slot.starts_at).slice(0, 5)}–${text(slot.ends_at).slice(0, 5)}`, 10, true);
    line(`Présence : ${status === "present" ? "Présent — signé" : status === "excused" ? "Absence justifiée" : status === "absent" ? "Absent" : "Non finalisée"}`, 8);
    if (status === "present") await addSignature("Signature de l’apprenant", record?.signature_storage_path, record?.signed_at);
    else line("Signature de l’apprenant : non requise pour ce statut.", 8);

    const slotTrainerSignatures = (trainerSignatures ?? []).filter((signature: Json) => text(one(signature.metadata).slot_id) === text(slot.id));
    if (!slotTrainerSignatures.length) line("Signature du formateur : non enregistrée.", 8, true);
    for (const signature of slotTrainerSignatures) {
      const metadata = one(signature.metadata);
      await addSignature(`Signature du formateur${text(metadata.trainer_name) ? ` — ${text(metadata.trainer_name)}` : ""}`, signature.storage_path, signature.signed_at);
    }
    y += 2;
  }

  ensure(16);
  doc.setDrawColor(190);
  doc.line(left, y, right, y);
  y += 6;
  line("Document personnel généré après la session à partir du relevé validé et publié. Il contient uniquement les créneaux et signatures de cet apprenant ainsi que les signatures des formateurs rattachées aux mêmes créneaux.", 7);
  line(`Généré le ${formatDate(new Date().toISOString(), true)}.`, 7);

  const filename = safePersonalDownloadName(`feuille-emargement-${learnerName}`, ".pdf");
  return new NextResponse(doc.output("arraybuffer"), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
