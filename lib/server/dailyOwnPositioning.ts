import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OWN_POSITIONING_MAX_BYTES, OWN_POSITIONING_MIME_TYPES, positioningSourceDocumentId, type PositioningSubject } from "@/lib/daily/ownPositioning";

type Json = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class OwnPositioningError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type OriginalPositioning = {
  id: string; organisation_id: string; formation_id: string; bucket: string;
  storage_path: string; sha256: string; mime_type: string; name: string;
};
export async function loadOriginalPositioning(admin: SupabaseClient, formation: Json, requireValidated = true): Promise<OriginalPositioning | null> {
  const reference = text(formation.positioning_questionnaire_document_url);
  if (formation.positioning_mode !== "off_platform" || !reference) return null;
  const id = positioningSourceDocumentId(reference);
  if (!id || !text(formation.organisation_id)) throw new OwnPositioningError("Le questionnaire de positionnement doit être importé dans Selen.", 409);
  if (requireValidated && formation.status !== "validated") throw new OwnPositioningError("La formation est en cours de validation. Le positionnement sera disponible après validation.", 409);
  const { data, error } = await admin.from("daily_documents")
    .select("id,organisation_id,formation_id,document_type,linked_object_type,linked_object_id,bucket,storage_path,sha256,mime_type,status,is_current,metadata")
    .eq("id", id).eq("organisation_id", formation.organisation_id).eq("document_type", "positioning_questionnaire_source")
    .eq("linked_object_type", "organisation").eq("linked_object_id", formation.organisation_id).maybeSingle();
  if (error) throw new OwnPositioningError("Lecture du questionnaire indisponible.", 500);
  if (!data || data.bucket !== "documents" || !data.is_current || data.status === "archived" ||
    (data.formation_id && data.formation_id !== formation.id) ||
    !String(data.storage_path ?? "").startsWith(`daily/${formation.organisation_id}/`) ||
    !/^[a-f0-9]{64}$/i.test(String(data.sha256 ?? "")) ||
    !(OWN_POSITIONING_MIME_TYPES as readonly string[]).includes(String(data.mime_type ?? ""))) {
    throw new OwnPositioningError("Le questionnaire demandé n’est plus disponible. Actualisez votre dossier.", 409);
  }
  return { id: data.id, organisation_id: data.organisation_id, formation_id: text(formation.id), bucket: "documents",
    storage_path: data.storage_path, sha256: data.sha256, mime_type: data.mime_type,
    name: text((data.metadata as Json | null)?.original_filename) || "Questionnaire de positionnement" };
}

export async function downloadPositioning(admin: SupabaseClient, document: { bucket: string; storage_path: string; mime_type?: string | null; name: string }) {
  if (document.bucket !== "documents") throw new OwnPositioningError("Document privé introuvable.", 404);
  const { data, error } = await admin.storage.from("documents").download(document.storage_path);
  if (error || !data) throw new OwnPositioningError("Téléchargement indisponible.", 500);
  return new Response(await data.arrayBuffer(), { headers: {
    "Content-Type": document.mime_type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="positionnement"; filename*=UTF-8''${encodeURIComponent(document.name)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  } });
}

export function positioningSubjects(body: Json): PositioningSubject[] {
  const participants = body.response_type === "company" ? body.participants : [{ first_name: body.respondent_first_name, last_name: body.respondent_last_name, email: body.respondent_email }];
  if (!Array.isArray(participants) || !participants.length) throw new OwnPositioningError("Renseignez les apprenants concernés par le positionnement.");
  const result = participants.map(value => {
    const row = value && typeof value === "object" ? value as Json : {};
    return { first_name: text(row.first_name ?? row.firstname ?? row.firstName), last_name: text(row.last_name ?? row.lastname ?? row.lastName), email: text(row.email ?? row.mail).toLowerCase() };
  });
  if (result.some(row => !row.first_name || !row.last_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))) throw new OwnPositioningError("Le prénom, le nom et l’email de chaque apprenant sont nécessaires pour rattacher son positionnement.");
  if (new Set(result.map(row => row.email)).size !== result.length) throw new OwnPositioningError("Chaque apprenant doit être indiqué une seule fois, avec son propre email.");
  return result;
}
type FilledFile = { bytes: Buffer; sha256: string; mime: string; name: string; subject: PositioningSubject; index: number };
export type OwnPositioningSubmission = { id: string; fingerprint: string; original: OriginalPositioning; files: FilledFile[] };
export function ownPositioningDocumentId(submission: OwnPositioningSubmission, index: number) {
  const hex = hash(`${submission.id}:${submission.fingerprint}:${index}`).slice(0, 32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;
}
export function positioningSubmissionAnswers(submission: OwnPositioningSubmission) {
  return { mode: "off_platform", source_document_id: submission.original.id, source_sha256: submission.original.sha256,
    submission_fingerprint: submission.fingerprint, external_documents: submission.files.map(file => ({ document_id: ownPositioningDocumentId(submission, file.index),
      participant_index: file.index, first_name: file.subject.first_name, last_name: file.subject.last_name, email: file.subject.email, original_filename: file.name, sha256: file.sha256 })) };
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Json).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

// The public payload supplies answers only. Question wording, types and choices
// come from the validated formation, so a browser cannot remove an obligation.
export function selenCandidatePositioningAnswers(body: Json, formation: Json): Json {
  if (formation.positioning_mode !== "selen" || body.response_type !== "beneficiary") return {};
  if (formation.status !== "validated" || !Array.isArray(formation.positioning_questions) || !formation.positioning_questions.length) {
    throw new OwnPositioningError("Le questionnaire est en cours de validation. Actualisez le dossier après validation de la formation.", 409);
  }
  const raw = body.positioning_answers && typeof body.positioning_answers === "object" ? body.positioning_answers as Json : {};
  const submitted = Array.isArray(raw.questions) ? raw.questions : [];
  const answers = new Map<string, unknown>();
  for (const item of submitted) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new OwnPositioningError("Réponses de positionnement invalides.");
    const row = item as Json, id = text(row.id);
    if (!id || answers.has(id)) throw new OwnPositioningError("Chaque question doit recevoir une seule réponse.");
    answers.set(id, row.answer);
  }
  const ids = new Set<string>();
  const questionnaire = formation.positioning_questions.map((item, index) => {
    const row = item && typeof item === "object" ? item as Json : {};
    const id = text(row.id), label = text(row.label), type = text(row.type);
    if (!id || ids.has(id) || !label || !["free_text", "single_choice", "multiple_choice", "scale_1_5"].includes(type)) throw new OwnPositioningError("Questionnaire indisponible. Contactez votre organisme de formation.", 409);
    ids.add(id);
    const options = Array.isArray(row.options) ? row.options.map(text).filter(Boolean) : [];
    if (["single_choice", "multiple_choice"].includes(type) && (!options.length || new Set(options).size !== options.length)) throw new OwnPositioningError("Questionnaire indisponible. Contactez votre organisme de formation.", 409);
    return { id, label, type, required: row.required !== false, options, order: index + 1, help_text: text(row.help_text) };
  });
  if ([...answers.keys()].some(id => !ids.has(id))) throw new OwnPositioningError("Le questionnaire a changé. Actualisez votre dossier.", 409);
  const questions = questionnaire.map(question => {
    const rawAnswer = answers.get(question.id);
    let answer: string | string[];
    if (question.type === "multiple_choice") {
      if (rawAnswer !== undefined && (!Array.isArray(rawAnswer) || rawAnswer.some(value => typeof value !== "string"))) throw new OwnPositioningError("Choisissez les réponses proposées pour le positionnement.");
      answer = Array.isArray(rawAnswer) ? rawAnswer.map(text) : [];
      if (new Set(answer).size !== answer.length || answer.some(value => !question.options.includes(value))) throw new OwnPositioningError("Choisissez les réponses proposées pour le positionnement.");
    } else {
      if (rawAnswer !== undefined && typeof rawAnswer !== "string") throw new OwnPositioningError("Réponse de positionnement invalide.");
      answer = text(rawAnswer);
      if (answer && question.type === "single_choice" && !question.options.includes(answer)) throw new OwnPositioningError("Choisissez une réponse proposée pour le positionnement.");
      if (answer && question.type === "scale_1_5" && !/^[1-5]$/.test(answer)) throw new OwnPositioningError("Le positionnement doit être évalué de 1 à 5.");
    }
    if (question.required && !answer.length) throw new OwnPositioningError("Répondez aux questions de positionnement obligatoires avant d’envoyer le dossier.");
    return { ...question, answer };
  });
  return { mode: "selen", questionnaire_sha256: hash(JSON.stringify(stable(questionnaire))), questions };
}

export function prepareJsonRegistrationSubmission(body: Json, positioningAnswers: Json, scope: string): Pick<OwnPositioningSubmission, "id" | "fingerprint"> {
  const id = text(body.submission_id).toLowerCase();
  if (!uuid.test(id)) throw new OwnPositioningError("Actualisez le dossier avant de transmettre votre candidature.");
  const fingerprint = hash(JSON.stringify(stable({ scope, body: { ...body, submission_id: id, positioning_answers: positioningAnswers } })));
  return { id, fingerprint };
}

export async function prepareOwnPositioning(body: Json, formData: FormData | null, original: OriginalPositioning, scope: string): Promise<OwnPositioningSubmission> {
  if (!formData) throw new OwnPositioningError("Réimportez le document de positionnement rempli avant d’envoyer votre candidature.");
  if (text(body.positioning_source_id).toLowerCase() !== original.id) throw new OwnPositioningError("Le questionnaire a changé. Actualisez le dossier, téléchargez sa version actuelle et réimportez le document rempli.", 409);
  const id = text(body.submission_id).toLowerCase();
  if (!uuid.test(id)) throw new OwnPositioningError("Actualisez le dossier avant de transmettre le positionnement.");
  const subjects = positioningSubjects(body);
  const files: FilledFile[] = [];
  let size = 0;
  for (let index = 0; index < subjects.length; index++) {
    const file = formData.get(`positioning_file_${index}`);
    if (!(file instanceof File) || file.size === 0) throw new OwnPositioningError("Réimportez le document rempli pour chaque apprenant avant d’envoyer la candidature.");
    size += file.size;
    if (size > OWN_POSITIONING_MAX_BYTES) throw new OwnPositioningError("Les documents remplis doivent peser au total moins de 3 Mo.", 413);
    if (!(OWN_POSITIONING_MIME_TYPES as readonly string[]).includes(file.type)) throw new OwnPositioningError("Le positionnement rempli doit être un PDF ou un document Word.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const valid = file.type === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : file.type === "application/msword" ? bytes.subarray(0, 8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])) : bytes.subarray(0, 4).equals(Buffer.from([0x50,0x4b,0x03,0x04]));
    if (!valid) throw new OwnPositioningError("Le contenu du fichier ne correspond pas à son format PDF ou Word.");
    const sha256 = hash(bytes);
    if (sha256 === original.sha256) throw new OwnPositioningError("Le fichier réimporté est identique au questionnaire vierge. Remplissez-le avant de l’envoyer.");
    files.push({ bytes, sha256, mime: file.type, name: file.name, subject: subjects[index], index });
  }
  const fingerprint = hash(JSON.stringify(stable({ scope, original_id: original.id, original_sha256: original.sha256, body, files: files.map(file => ({ subject: file.subject, sha256: file.sha256, mime: file.mime, name: file.name })) })));
  return { id, fingerprint, original, files };
}

export async function persistOwnPositioning(admin: SupabaseClient, submission: OwnPositioningSubmission, kind: "formation" | "session" | "learner", sessionId: string | null, enrolment?: { id: string; learner_id: string }) {
  if (kind === "learner" && (!sessionId || !enrolment)) throw new OwnPositioningError("Inscription active requise.", 403);
  for (const file of submission.files) {
    const id = ownPositioningDocumentId(submission, file.index);
    const extension = file.mime === "application/pdf" ? "pdf" : file.mime === "application/msword" ? "doc" : "docx";
    const path = `daily/${submission.original.organisation_id}/positioning-applications/${submission.original.formation_id}/${submission.id}/${id}.${extension}`;
    const metadata = { source: kind === "learner" ? "daily_learner_own_positioning" : "daily_own_positioning", source_document_id: submission.original.id, source_sha256: submission.original.sha256,
      submission_fingerprint: submission.fingerprint, participant_index: file.index, subject_first_name: file.subject.first_name,
      subject_last_name: file.subject.last_name, subject_email: file.subject.email, original_filename: file.name, registration_kind: kind };
    const findExisting = async () => {
      const { data, error } = await admin.from("daily_documents").select("id,bucket,storage_path,sha256,metadata,organisation_id,formation_id,session_id,learner_id,enrolment_id,document_type,linked_object_type,linked_object_id,is_current,status")
        .eq("id", id).eq("organisation_id", submission.original.organisation_id).eq("formation_id", submission.original.formation_id).maybeSingle();
      if (error) throw new OwnPositioningError("Vérification du dépôt indisponible.", 500);
      if (data) {
        const saved = data.metadata as Json;
        const scopeMatches = kind === "learner"
          ? data.document_type === "positioning_evidence" && data.linked_object_type === "enrolment" && data.linked_object_id === enrolment!.id && data.enrolment_id === enrolment!.id && data.learner_id === enrolment!.learner_id && data.session_id === sessionId
          : (data.document_type === "positioning_application_evidence" && data.linked_object_type === (kind === "formation" ? "registration_request" : "registration_response") && data.linked_object_id === submission.id && data.session_id === sessionId)
            || (data.document_type === "positioning_evidence" && saved?.source_request_id === submission.id && saved?.source_request_kind === kind);
        if (!scopeMatches || !data.is_current || data.status === "archived" || data.bucket !== "documents" || data.storage_path !== path || data.sha256 !== file.sha256 || saved?.submission_fingerprint !== submission.fingerprint || saved?.source_document_id !== submission.original.id || saved?.source_sha256 !== submission.original.sha256 || saved?.source !== metadata.source) throw new OwnPositioningError("Ce dépôt ne correspond pas à votre candidature.", 409);
      }
      return data;
    };
    if (!await findExisting()) {
      const { error: uploadError } = await admin.storage.from("documents").upload(path, file.bytes, { contentType: file.mime, upsert: false });
      if (uploadError) {
        // Recover only the exact private bytes from this same submission; never overwrite.
        const { data } = await admin.storage.from("documents").download(path);
        if (!data || hash(Buffer.from(await data.arrayBuffer())) !== file.sha256) throw new OwnPositioningError("Le document rempli n’a pas pu être déposé. Réessayez dans un instant.", 500);
      }
      const { error } = await admin.from("daily_documents").insert({ id, organisation_id: submission.original.organisation_id,
        formation_id: submission.original.formation_id, session_id: sessionId, document_type: kind === "learner" ? "positioning_evidence" : "positioning_application_evidence",
        linked_object_type: kind === "learner" ? "enrolment" : kind === "formation" ? "registration_request" : "registration_response", linked_object_id: kind === "learner" ? enrolment!.id : submission.id,
        ...(kind === "learner" ? { learner_id: enrolment!.learner_id, enrolment_id: enrolment!.id } : {}),
        version: 1, status: "to_check", logical_name: `Positionnement rempli — ${file.subject.first_name} ${file.subject.last_name}`,
        bucket: "documents", storage_path: path, sha256: file.sha256, mime_type: file.mime, size_bytes: file.bytes.length, metadata,
        is_current: true, created_by: null, updated_by: null });
      if (error && !await findExisting()) throw new OwnPositioningError("L’enregistrement du document rempli n’a pas abouti. La candidature n’a pas été envoyée.", 500);
    }
  }
  return positioningSubmissionAnswers(submission);
}
