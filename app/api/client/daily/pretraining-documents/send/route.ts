import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { sendDailyConvocation } from "@/lib/server/dailyPretrainingEmails";

import { deliverConvocationWithProof } from "@/lib/server/dailyConvocationEmailProof";

const sendableStatuses = ["validated", "published", "active"];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function attachmentExtension(mimeType: unknown): "doc" | "docx" | "pdf" {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  // The built-in HTML Word template and older documents use the .doc format.
  return "doc";
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 90) || "convocation";
}

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) {
    return NextResponse.json({ error: "L’assistance agent est en lecture seule." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const documentId = text(body.document_id);
  if (!documentId) return NextResponse.json({ error: "Document manquant." }, { status: 400 });

  const { data: document, error: documentError } = await context.admin
    .from("daily_documents")
    .select("id,organisation_id,document_type,linked_object_type,linked_object_id,session_id,enrolment_id,learner_id,version,status,logical_name,bucket,storage_path,mime_type,sha256,is_current,metadata")
    .eq("id", documentId)
    .eq("organisation_id", context.organisationId)
    .eq("document_type", "convocation")
    .eq("linked_object_type", "enrolment")
    .eq("is_current", true)
    .maybeSingle();

  if (documentError) return NextResponse.json({ error: "Lecture des convocations temporairement indisponible." }, { status: 503 });
  if (!document) return NextResponse.json({ error: "Convocation introuvable ou remplacée par une version plus récente." }, { status: 404 });
  if (!sendableStatuses.includes(document.status)) {
    return NextResponse.json({ error: "La convocation doit être validée par Selen avant son envoi." }, { status: 409 });
  }

  const { data: enrolment, error: enrolmentError } = await context.admin
    .from("daily_session_enrolments")
    .select("id,session_id,learner_id,status,daily_learners(first_name,last_name,email)")
    .eq("id", document.linked_object_id)
    .eq("organisation_id", context.organisationId)
    .maybeSingle();

  if (enrolmentError) return NextResponse.json({ error: "Lecture des inscriptions temporairement indisponible." }, { status: 503 });
  if (!enrolment || ["declined", "cancelled", "abandoned"].includes(enrolment.status)) {
    return NextResponse.json({ error: "L’inscription liée à cette convocation n’est plus active." }, { status: 409 });
  }

  // A validated version must remain bound to the same session, enrolment and
  // learner even if an enrolment is subsequently reassigned.
  if ((document.session_id && document.session_id !== enrolment.session_id)
    || (document.enrolment_id && document.enrolment_id !== enrolment.id)
    || (document.learner_id && document.learner_id !== enrolment.learner_id)) {
    return NextResponse.json({ error: "La convocation ne correspond plus à cette inscription. Régénérez-la et faites-la valider." }, { status: 409 });
  }

  const learner = one(enrolment.daily_learners as { first_name?: string | null; last_name?: string | null; email?: string | null } | { first_name?: string | null; last_name?: string | null; email?: string | null }[] | null);
  const email = text(learner?.email).toLowerCase();
  const learnerName = [learner?.first_name, learner?.last_name].map(text).filter(Boolean).join(" ");
  if (!email) return NextResponse.json({ error: "Aucune adresse e-mail n’est enregistrée pour cet apprenant." }, { status: 400 });

  const { data: session, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id,internal_reference,start_date,end_date,status,daily_formations(title)")
    .eq("id", enrolment.session_id)
    .eq("organisation_id", context.organisationId)
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: "Lecture de la session temporairement indisponible." }, { status: 503 });
  if (!session || ["archived", "cancelled"].includes(session.status)) {
    return NextResponse.json({ error: "La session liée à cette convocation n’est plus disponible." }, { status: 409 });
  }

  const formation = one(session.daily_formations as { title?: string | null } | { title?: string | null }[] | null);
  const formationTitle = text(formation?.title) || "Formation Selen Daily";

  const result = await deliverConvocationWithProof(context.admin, {
    organisationId: context.organisationId, sessionId: session.id, enrolmentId: enrolment.id,
    createdBy: context.user.id, source: "daily_documents", documentId: document.id,
    version: document.version, email, storagePath: document.storage_path, bucket: document.bucket,
    snapshot: { document_id: document.id, document_type: document.document_type,
      logical_name: document.logical_name, document_version: document.version,
      sha256: document.sha256, storage_path: document.storage_path },
    send: sendDailyConvocation,
    load: async () => {
      const { data: file, error } = await context.admin.storage.from(document.bucket).download(document.storage_path);
      if (error || !file) throw new Error("Document introuvable");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!bytes.length) throw new Error("Document vide");
      if (document.sha256 != null) {
        const expected = text(document.sha256).toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(expected)
          || createHash("sha256").update(bytes).digest("hex") !== expected) {
          throw new Error("Le document ne correspond plus à la version validée");
        }
      }
      return {
        email, learnerName, formationTitle, sessionReference: text(session.internal_reference),
        startDate: text(session.start_date), endDate: text(session.end_date), documentVersion: document.version,
        attachmentFilename: `${safeFilename(`convocation-${learnerName || "apprenant"}`)}-v${document.version}.${attachmentExtension(document.mime_type)}`,
        attachmentBase64: bytes.toString("base64"),
      };
    },
  });
  const confirmed = result.status === "sent" || result.status === "already_sent";
  return NextResponse.json({
    ok: confirmed, status: result.status, evidenceRecorded: confirmed,
    communicationId: result.communicationId,
    ...(confirmed ? { sentAt: result.sentAt, sentTo: result.sentTo } : {
      reason: result.reason,
      error: result.status === "pending" ? "En attente de confirmation. Aucun nouvel envoi automatique." : "Envoi rejeté avant acceptation confirmée.",
    }),
  }, { status: confirmed ? 200 : result.status === "pending" ? 202 : 503, headers: { "Cache-Control": "private, no-store" } });
}
