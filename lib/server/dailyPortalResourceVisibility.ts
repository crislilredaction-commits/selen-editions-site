export type DailyPortalResource = {
  document_type?: unknown;
  linked_object_type?: unknown;
  linked_object_id?: unknown;
  session_id?: unknown;
  enrolment_id?: unknown;
  learner_id?: unknown;
  metadata?: unknown;
  status?: unknown;
};

type PortalRole = "learner" | "trainer" | "enterprise";
const text = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const DAILY_PORTAL_RESOURCE_STATUSES = ["validated", "published", "signed", "active"];
export const DAILY_PORTAL_RESOURCE_TYPES = ["training_program", "training_contract", "training_agreement", "welcome_booklet", "internal_regulations", "convocation", "registration_positioning", "completion_certificate", "organisation_shared", "trainer_resource"];

export function isDailyResourceAvailable(resource: DailyPortalResource, now = new Date()) {
  const availableFrom = text(object(resource.metadata).available_from);
  if (!availableFrom) return true;
  const timestamp = Date.parse(availableFrom);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

export function isDailyPortalResourceVisible(input: {
  resource: DailyPortalResource;
  role: PortalRole;
  sessionId: string;
  enrolmentIds?: string[];
  learnerIds?: string[];
  now?: Date;
  companyName?: string;
  postsessionAvailable?: boolean;
}) {
  const {resource, role, sessionId, enrolmentIds = [], learnerIds = [], now = new Date()} = input;
  if (!isDailyResourceAvailable(resource, now)) return false;
  const type = text(resource.document_type);
  if(["training_program","training_contract","training_agreement","welcome_booklet","internal_regulations","convocation","registration_positioning"].includes(type) && !["published","signed"].includes(text(resource.status)))return false;
  if(type==="training_contract")return role==="learner" && resource.linked_object_type==="enrolment" && enrolmentIds.includes(text(resource.linked_object_id));
  if(type==="training_agreement")return role==="enterprise" && resource.linked_object_type==="session" && text(resource.linked_object_id)===sessionId && Boolean(input.companyName?.trim()) && text(object(resource.metadata).company_name).toLowerCase()===input.companyName!.trim().toLowerCase();
  if(["welcome_booklet","internal_regulations"].includes(type))return resource.linked_object_type==="session" && text(resource.linked_object_id)===sessionId;
  if (type === "training_program") return resource.linked_object_type === "session" && text(resource.linked_object_id) === sessionId;
  if (type === "completion_certificate" && !input.postsessionAvailable) return false;
  if (["convocation", "registration_positioning", "completion_certificate"].includes(type)) {
    return role === "learner" && resource.linked_object_type === "enrolment" && enrolmentIds.includes(text(resource.linked_object_id));
  }
  if (type === "trainer_resource") {
    if (role === "enterprise" || text(resource.session_id) !== sessionId) return false;
    if (role === "trainer") return true;
    const enrolmentId = text(resource.enrolment_id);
    const learnerId = text(resource.learner_id);
    return (!enrolmentId && !learnerId) || enrolmentIds.includes(enrolmentId) || learnerIds.includes(learnerId);
  }
  if (type !== "organisation_shared") return false;
  const metadata = object(resource.metadata);
  const scope = text(metadata.distribution_scope);
  if (scope === "organisation") return role === "learner" || role === "trainer";
  if (scope === "session") return text(metadata.session_id) === sessionId;
  return scope === "learners" && role === "learner" && text(metadata.session_id) === sessionId && Array.isArray(metadata.learner_ids) && metadata.learner_ids.map(String).some((id) => learnerIds.includes(id));
}
