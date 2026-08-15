import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { sendDailyCompletionCertificate } from "@/lib/server/dailyPosttrainingEmails";

const sendableStatuses = ["validated", "published", "active"];

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
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) return NextResponse.json({ error: "L’assistance agent est en lecture seule." }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const documentId = text(body.document_id);
  if (!documentId) return NextResponse.json({ error: "Document manquant." }, { status: 400 });

  const { data: document, error: documentError } = await context.admin
    .from("daily_documents")
    .select("id,document_type,linked_object_type,linked_object_id,version,status,logical_name,bucket,storage_path,sha256,is_current,metadata")
    .eq("id", documentId)
    .eq("organisation_id", context.organisationId)
    .eq("document_type", "completion_certificate")
    .eq("linked_object_type", "enrolment")
    .eq("is_current", true)
    .maybeSingle();

  if (documentError) return NextResponse.json({ error: documentError.message }, { status: 500 });
  if (!document) return NextResponse.json({ error: "Certificat introuvable ou remplacé par une version plus récente." }, { status: 404 });
  if (!sendableStatuses.includes(document.status)) {
    return NextResponse.json({ error: "Le certificat doit être validé par Selen avant son envoi." }, { status: 409 });
  }

  const { data: enrolment, error: enrolmentError } = await context.admin
    .from("daily_session_enrolments")
    .select("id,session_id,status,daily_learners(first_name,last_name,email)")
    .eq("id", document.linked_object_id)
    .eq("organisation_id", context.organisationId)
    .maybeSingle();
  if (enrolmentError) return NextResponse.json({ error: enrolmentError.message }, { status: 500 });
  if (!enrolment || ["declined", "cancelled"].includes(enrolment.status)) {
    return NextResponse.json({ error: "L’inscription liée à ce certificat n’est plus active." }, { status: 409 });
  }

  const learner = one(enrolment.daily_learners as { first_name?: string | null; last_name?: string | null; email?: string | null } | { first_name?: string | null; last_name?: string | null; email?: string | null }[] | null);
  const email = text(learner?.email).toLowerCase();
  const learnerName = [learner?.first_name, learner?.last_name].map(text).filter(Boolean).join(" ");
  if (!email) return NextResponse.json({ error: "Aucune adresse e-mail n’est enregistrée pour cet apprenant." }, { status: 400 });

  const { data: session, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id,start_date,end_date,status,daily_formations(title)")
    .eq("id", enrolment.session_id)
    .eq("organisation_id", context.organisationId)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  if (session.status === "archived") {
    return NextResponse.json({ error: "Le dossier est archivé. Réouvrez-le avant d’envoyer un nouveau document." }, { status: 409 });
  }

  const formation = one(session.daily_formations as { title?: string | null } | { title?: string | null }[] | null);
  const formationTitle = text(formation?.title) || "Formation Selen Daily";

  const { data: file, error: downloadError } = await context.admin.storage.from(document.bucket).download(document.storage_path);
  if (downloadError || !file) {
    return NextResponse.json({ error: "La version validée du certificat est introuvable dans le stockage." }, { status: 500 });
  }

  const attachmentBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const attachmentFilename = `${safeFilename(`certificat-realisation-${learnerName || "apprenant"}`)}-v${document.version}.doc`;
  const sent = await sendDailyCompletionCertificate({
    email,
    learnerName,
    formationTitle,
    startDate: text(session.start_date),
    endDate: text(session.end_date),
    attachmentFilename,
    attachmentBase64,
  });
  if (!sent.sent) {
    return NextResponse.json({ error: "Le certificat n’a pas pu être envoyé. Aucune preuve d’envoi n’a été créée." }, { status: 503 });
  }

  const sentAt = new Date().toISOString();
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
      subject: sent.message.subject,
      text_body: sent.message.text,
      html_body: sent.message.html,
      provider: "resend",
      provider_message_id: sent.message.providerMessageId,
      status: "sent",
      sent_at: sentAt,
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
    console.error("Daily : certificat envoyé mais preuve de communication non enregistrée", evidenceError);
    return NextResponse.json({ ok: true, sentTo: email, sentAt, evidenceRecorded: false });
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

  if (linkError) console.error("Daily : certificat envoyé mais snapshot documentaire incomplet", linkError);

  return NextResponse.json({
    ok: true,
    sentTo: email,
    sentAt,
    evidenceRecorded: !linkError,
    communicationId: communication.id,
  });
}
