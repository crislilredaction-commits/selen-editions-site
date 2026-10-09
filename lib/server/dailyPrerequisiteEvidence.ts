import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PREREQUISITE_EVIDENCE_MAX_FILE_BYTES,
  PREREQUISITE_EVIDENCE_MIME_TYPES,
  type PrerequisiteRequirement,
  type PrerequisiteSubject,
} from "@/lib/daily/prerequisiteEvidence";
import { positioningSubjects } from "@/lib/server/dailyOwnPositioning";

type Json = Record<string, unknown>;
type PreparedFile = {
  bytes: Buffer;
  sha256: string;
  mime: string;
  name: string;
  subject: PrerequisiteSubject;
  participantIndex: number;
  requirement: PrerequisiteRequirement;
  requirementIndex: number;
};

const text = (value: unknown) => String(value ?? "").trim();
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PrerequisiteEvidenceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type PrerequisiteEvidenceSubmission = {
  id: string;
  fingerprint: string;
  organisationId: string;
  formationId: string;
  files: PreparedFile[];
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Json).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

export function prerequisiteRequirements(formation: Json): PrerequisiteRequirement[] {
  if (formation.prerequisite_mode !== "required") return [];
  if (!Array.isArray(formation.prerequisite_requirements)) throw new PrerequisiteEvidenceError("Les prérequis de cette formation sont indisponibles. Contactez l’organisme de formation.", 409);
  const rows = formation.prerequisite_requirements.map((value, index) => {
    const row = value && typeof value === "object" ? value as Json : {};
    const id = text(row.id);
    const label = text(row.label);
    if (!id || !label || id.length > 160 || label.length > 500) throw new PrerequisiteEvidenceError(`Le prérequis ${index + 1} est invalide. Contactez l’organisme de formation.`, 409);
    return { id, label, description: text(row.description), required: row.required !== false };
  });
  if (!rows.length || new Set(rows.map((row) => row.id)).size !== rows.length) throw new PrerequisiteEvidenceError("Les prérequis obligatoires de cette formation sont incohérents. Contactez l’organisme de formation.", 409);
  return rows;
}

function validBytes(bytes: Buffer, mime: string) {
  if (mime === "application/pdf") return bytes.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function preparePrerequisiteEvidence(
  body: Json,
  formData: FormData | null,
  formation: Json,
  scope: string,
  existingVerified = new Set<string>(),
): Promise<PrerequisiteEvidenceSubmission | null> {
  const requirements = prerequisiteRequirements(formation);
  if (!requirements.length) return null;
  if (!formData && requirements.some((requirement) => requirement.required !== false)) throw new PrerequisiteEvidenceError("Joignez les justificatifs obligatoires avant d’envoyer votre candidature.");
  const id = text(body.submission_id).toLowerCase();
  if (!uuid.test(id)) throw new PrerequisiteEvidenceError("Actualisez le dossier avant de transmettre vos justificatifs.");
  const subjects = positioningSubjects(body);
  const files: PreparedFile[] = [];
  for (let participantIndex = 0; participantIndex < subjects.length; participantIndex++) {
    for (let requirementIndex = 0; requirementIndex < requirements.length; requirementIndex++) {
      const requirement = requirements[requirementIndex];
      const file = formData?.get(`prerequisite_file_${participantIndex}_${requirementIndex}`);
      if (!(file instanceof File) || file.size === 0) {
        if (requirement.required === false || existingVerified.has(`${participantIndex}:${requirement.id}`)) continue;
        throw new PrerequisiteEvidenceError(`Joignez le justificatif obligatoire « ${requirement.label} » pour chaque apprenant.`);
      }
      if (file.size > PREREQUISITE_EVIDENCE_MAX_FILE_BYTES) throw new PrerequisiteEvidenceError("Chaque justificatif doit peser moins de 2 Mo.", 413);
      if (!(PREREQUISITE_EVIDENCE_MIME_TYPES as readonly string[]).includes(file.type)) throw new PrerequisiteEvidenceError("Les justificatifs doivent être au format PDF, JPG ou PNG.");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!validBytes(bytes, file.type)) throw new PrerequisiteEvidenceError("Le contenu d’un justificatif ne correspond pas à son format PDF, JPG ou PNG.");
      files.push({ bytes, sha256: hash(bytes), mime: file.type, name: file.name, subject: subjects[participantIndex], participantIndex, requirement, requirementIndex });
    }
  }
  const fingerprint = hash(JSON.stringify(stable({
    scope,
    formation_id: text(formation.id),
    subjects,
    requirements,
    files: files.map((file) => ({ participant_index: file.participantIndex, requirement_id: file.requirement.id, sha256: file.sha256, mime: file.mime, name: file.name })),
  })));
  return { id, fingerprint, organisationId: text(formation.organisation_id), formationId: text(formation.id), files };
}

export function prerequisiteEvidenceDocumentId(submission: PrerequisiteEvidenceSubmission, participantIndex: number, requirementId: string) {
  const value = hash(`${submission.id}:${submission.fingerprint}:${participantIndex}:${requirementId}`).slice(0, 32);
  return `${value.slice(0,8)}-${value.slice(8,12)}-4${value.slice(13,16)}-8${value.slice(17,20)}-${value.slice(20)}`;
}

export async function persistPrerequisiteEvidence(admin: SupabaseClient, submission: PrerequisiteEvidenceSubmission, kind: "formation" | "session", sessionId: string | null, options: { stagedReplacement?: boolean } = {}) {
  for (const file of submission.files) {
    const id = prerequisiteEvidenceDocumentId(submission, file.participantIndex, file.requirement.id);
    const extension = file.mime === "application/pdf" ? "pdf" : file.mime === "image/png" ? "png" : "jpg";
    const path = `daily/${submission.organisationId}/prerequisite-applications/${submission.formationId}/${submission.id}/${id}.${extension}`;
    const metadata = {
      source: "daily_prerequisite_evidence",
      submission_fingerprint: submission.fingerprint,
      participant_index: file.participantIndex,
      subject_first_name: file.subject.first_name,
      subject_last_name: file.subject.last_name,
      subject_email: file.subject.email,
      requirement_id: file.requirement.id,
      requirement_label: file.requirement.label,
      original_filename: file.name,
      registration_kind: kind,
      staged_replacement: options.stagedReplacement === true,
    };
    const findExisting = async () => {
      const { data, error } = await admin.from("daily_documents")
        .select("id,organisation_id,formation_id,session_id,document_type,linked_object_type,linked_object_id,bucket,storage_path,mime_type,sha256,is_current,status,metadata")
        .eq("id", id).eq("organisation_id", submission.organisationId).eq("formation_id", submission.formationId).maybeSingle();
      if (error) throw new PrerequisiteEvidenceError("Vérification du justificatif indisponible.", 500);
      if (data) {
        const saved = data.metadata as Json;
        if (data.document_type !== "prerequisite_application_evidence" || data.linked_object_type !== (kind === "formation" ? "registration_request" : "registration_response") ||
          data.linked_object_id !== submission.id || data.session_id !== sessionId || data.bucket !== "documents" || data.storage_path !== path ||
          data.sha256 !== file.sha256 || data.mime_type !== file.mime || data.is_current !== !options.stagedReplacement || data.status === "archived" ||
          saved?.source !== metadata.source || saved?.submission_fingerprint !== submission.fingerprint || saved?.participant_index !== file.participantIndex ||
          saved?.requirement_id !== file.requirement.id || saved?.staged_replacement !== (options.stagedReplacement === true) || String(saved?.subject_email ?? "").toLowerCase() !== file.subject.email) {
          throw new PrerequisiteEvidenceError("Ce justificatif ne correspond pas à votre candidature.", 409);
        }
      }
      return data;
    };
    if (!await findExisting()) {
      const { error: uploadError } = await admin.storage.from("documents").upload(path, file.bytes, { contentType: file.mime, upsert: false });
      if (uploadError) {
        const { data } = await admin.storage.from("documents").download(path);
        if (!data || hash(Buffer.from(await data.arrayBuffer())) !== file.sha256) throw new PrerequisiteEvidenceError("Le justificatif n’a pas pu être déposé. Réessayez dans un instant.", 500);
      }
      const { error } = await admin.from("daily_documents").insert({
        id,
        organisation_id: submission.organisationId,
        formation_id: submission.formationId,
        session_id: sessionId,
        document_type: "prerequisite_application_evidence",
        linked_object_type: kind === "formation" ? "registration_request" : "registration_response",
        linked_object_id: submission.id,
        version: 1,
        status: "to_check",
        logical_name: `Justificatif · ${file.requirement.label} · ${file.subject.first_name} ${file.subject.last_name}`,
        bucket: "documents",
        storage_path: path,
        sha256: file.sha256,
        mime_type: file.mime,
        size_bytes: file.bytes.length,
        metadata,
        is_current: options.stagedReplacement !== true,
        created_by: null,
        updated_by: null,
      });
      if (error && !await findExisting()) throw new PrerequisiteEvidenceError("L’enregistrement d’un justificatif n’a pas abouti. La candidature n’a pas été envoyée.", 500);
    }
  }
}

export async function replaceRejectedPrerequisiteEvidence(admin: SupabaseClient, submission: PrerequisiteEvidenceSubmission, kind: "formation" | "session", expectedFingerprint: string) {
  const { error } = await admin.rpc("replace_daily_prerequisite_evidence_submission", {
    p_owner_kind: kind === "formation" ? "registration_request" : "registration_response",
    p_owner_id: submission.id,
    p_expected_fingerprint: expectedFingerprint,
    p_new_fingerprint: submission.fingerprint,
  });
  if (error) throw new PrerequisiteEvidenceError(error.message || "Le remplacement des justificatifs n’a pas abouti.", ["22023", "23514", "40001", "PSE01"].includes(error.code ?? "") ? 409 : 500);
}
