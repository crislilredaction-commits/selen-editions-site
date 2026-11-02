import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { prepareDailyCompletionCertificateEmail, sendDailyCompletionCertificate } from "@/lib/server/dailyPosttrainingEmails";

const sendableStatuses = ["published", "signed"];

function privateJson(body: unknown, init: { status?: number } = {}) {
  return NextResponse.json(body, { ...init, headers: { "Cache-Control": "private, no-store" } });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 90) || "certificat-realisation";
}

export async function POST(request: Request) {
  const context = await getDailyOrganisationContext(request, "sessions");
  if (!context.ok) return privateJson({ error: context.error }, { status: context.status });
  if (context.assisted) return privateJson({ error: "L’assistance agent est en lecture seule." }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const documentId = text(body.document_id);
  if (!documentId) return privateJson({ error: "Document manquant." }, { status: 400 });

  const { data: document, error: documentError } = await context.admin
    .from("daily_documents")
    .select("id,document_type,linked_object_type,linked_object_id,session_id,enrolment_id,learner_id,version,status,logical_name,bucket,storage_path,sha256,is_current,metadata")
    .eq("id", documentId)
    .eq("organisation_id", context.organisationId)
    .eq("document_type", "completion_certificate")
    .eq("linked_object_type", "enrolment")
    .eq("is_current", true)
    .maybeSingle();

  if (documentError) return privateJson({ error: "Lecture du certificat temporairement indisponible." }, { status: 503 });
  if (!document) return privateJson({ error: "Certificat introuvable ou remplacé par une version plus récente." }, { status: 404 });
  if (!sendableStatuses.includes(document.status)) {
    return privateJson({ error: "Le certificat doit être publié par Selen avant son envoi." }, { status: 409 });
  }

  const { data: enrolment, error: enrolmentError } = await context.admin
    .from("daily_session_enrolments")
    .select("id,session_id,learner_id,status,daily_learners(first_name,last_name,email)")
    .eq("id", document.linked_object_id)
    .eq("organisation_id", context.organisationId)
    .maybeSingle();
  if (enrolmentError) return privateJson({ error: "Lecture de l’inscription temporairement indisponible." }, { status: 503 });
  if (!enrolment || ["declined", "cancelled", "abandoned"].includes(enrolment.status)) {
    return privateJson({ error: "L’inscription liée à ce certificat n’est plus active." }, { status: 409 });
  }

  // A published certificate must still belong to the same enrolment and session.
  const metadata = document.metadata && typeof document.metadata === "object" ? document.metadata : {};
  if ((document.session_id && document.session_id !== enrolment.session_id)
    || (document.enrolment_id && document.enrolment_id !== enrolment.id)
    || (document.learner_id && document.learner_id !== enrolment.learner_id)
    || (metadata.session_id && metadata.session_id !== enrolment.session_id)
    || (metadata.enrolment_id && metadata.enrolment_id !== enrolment.id)
    || (metadata.learner_id && metadata.learner_id !== enrolment.learner_id)) {
    return privateJson({ error: "Le certificat ne correspond plus à cette inscription. Régénérez-le et faites-le publier." }, { status: 409 });
  }

  const learner = one(enrolment.daily_learners as { first_name?: string | null; last_name?: string | null; email?: string | null } | { first_name?: string | null; last_name?: string | null; email?: string | null }[] | null);
  const email = text(learner?.email).toLowerCase();
  const learnerName = [learner?.first_name, learner?.last_name].map(text).filter(Boolean).join(" ");
  if (!email) return privateJson({ error: "Aucune adresse e-mail n’est enregistrée pour cet apprenant." }, { status: 400 });

  const { data: existingCommunication, error: existingCommunicationError } = await context.admin
    .from("daily_communications")
    .select("id,status,sent_at,recipient_email")
    .eq("organisation_id", context.organisationId)
    .eq("enrolment_id", enrolment.id)
    .eq("communication_type", "completion_certificate")
    .contains("metadata", { document_id: document.id, document_version: document.version })
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingCommunicationError) {
    return privateJson({ error: "Lecture de l’historique d’envoi temporairement indisponible." }, { status: 503 });
  }
  if (existingCommunication) {
    return privateJson({
      ok: true,
      alreadySent: true,
      sentTo: existingCommunication.recipient_email,
      sentAt: existingCommunication.sent_at,
      evidenceRecorded: true,
      communicationId: existingCommunication.id,
    });
  }

  const { data: session, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id,start_date,end_date,status,daily_formations(title)")
    .eq("id", enrolment.session_id)
    .eq("organisation_id", context.organisationId)
    .maybeSingle();
  if (sessionError) return privateJson({ error: "Lecture de la session temporairement indisponible." }, { status: 503 });
  if (!session) return privateJson({ error: "Session introuvable." }, { status: 404 });
  if (["cancelled", "archived"].includes(session.status)) {
    return privateJson({ error: "La session n’est plus active. Aucun nouveau document ne peut être envoyé." }, { status: 409 });
  }

  const formation = one(session.daily_formations as { title?: string | null } | { title?: string | null }[] | null);
  const formationTitle = text(formation?.title) || "Formation Selen Daily";

  if (!text(document.bucket) || !text(document.storage_path)) {
    return privateJson({ error: "Le certificat publié ne possède pas de fichier disponible." }, { status: 503 });
  }

  let attachmentBase64: string;
  try {
    const { data: file, error: downloadError } = await context.admin.storage.from(document.bucket).download(document.storage_path);
    if (downloadError || !file) throw new Error("storage_unavailable");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.length) throw new Error("empty_document");
    if (document.sha256 != null) {
      const expected = text(document.sha256).toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(expected)
        || createHash("sha256").update(bytes).digest("hex") !== expected) {
        return privateJson({ error: "Le certificat ne correspond plus à sa version publiée. Aucun envoi effectué." }, { status: 409 });
      }
    }
    attachmentBase64 = bytes.toString("base64");
  } catch {
    return privateJson({ error: "La version publiée du certificat est temporairement indisponible." }, { status: 503 });
  }
  const attachmentFilename = `${safeFilename(`certificat-realisation-${learnerName || "apprenant"}`)}-v${document.version}.doc`;
  const emailInput = {
    email,
    learnerName,
    formationTitle,
    startDate: text(session.start_date),
    endDate: text(session.end_date),
    attachmentFilename,
    attachmentBase64,
  };
  const prepared = prepareDailyCompletionCertificateEmail(emailInput);

  const { data: communication, error: evidenceError } = await context.admin
    .from("daily_communications")
    .insert({
      organisation_id: context.organisationId,
      session_id: session.id,
      enrolment_id: enrolment.id,
      communication_type: "completion_certificate",
      channel: "email",
      recipient_email: email,
      recipient_name: learnerName || null,
      subject: prepared.subject,
      text_body: prepared.text,
      html_body: prepared.html,
      provider: "resend",
      status: "queued",
      created_by: context.user.id,
      metadata: {
        document_id: document.id,
        document_type: document.document_type,
        document_version: document.version,
        attachment_filename: attachmentFilename,
      },
    })
    .select("id")
    .single();

  if (evidenceError || !communication) {
    return privateJson({ error: "La preuve d’envoi n’a pas pu être réservée. Le certificat n’a pas été envoyé." }, { status: 500 });
  }

  const { error: linkError } = await context.admin.from("daily_communication_documents").insert({
    communication_id: communication.id,
    document_id: document.id,
    document_type: document.document_type,
    logical_name: document.logical_name,
    document_version: document.version,
    sha256: document.sha256,
    storage_path: document.storage_path,
  });

  if (linkError) {
    const failedAt = new Date().toISOString();
    await context.admin.from("daily_communications").update({ status: "failed", failed_at: failedAt, failure_reason: "document_snapshot_failed" }).eq("id", communication.id);
    return privateJson({ error: "La version exacte du document n’a pas pu être figée. Le certificat n’a pas été envoyé." }, { status: 500 });
  }

  const sent = await sendDailyCompletionCertificate(emailInput);
  if (!sent.sent) {
    const failedAt = new Date().toISOString();
    await context.admin.from("daily_communications").update({ status: "failed", failed_at: failedAt, failure_reason: sent.reason }).eq("id", communication.id);
    return privateJson({ error: "Le certificat n’a pas pu être envoyé. La tentative est conservée dans l’historique." }, { status: 503 });
  }

  const sentAt = new Date().toISOString();
  const { error: finalizeError } = await context.admin
    .from("daily_communications")
    .update({
      provider_message_id: sent.message.providerMessageId,
      status: "sent",
      sent_at: sentAt,
      failed_at: null,
      failure_reason: null,
    })
    .eq("id", communication.id);

  if (finalizeError) {
    console.error("Daily : certificat envoyé mais finalisation de la preuve impossible", finalizeError);
  }

  return privateJson({
    ok: true,
    alreadySent: false,
    sentTo: email,
    sentAt,
    evidenceRecorded: !finalizeError,
    communicationId: communication.id,
  });
}
