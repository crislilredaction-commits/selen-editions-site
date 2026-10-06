import { ensureAndSendLearnerPortalAccess, type LearnerPortalAccessResult } from "@/lib/server/dailyLearnerPortalAccess";
import type { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type AdminSupabase = ReturnType<typeof getAdminSupabase>;
type Json = Record<string, unknown>;

const inactiveStatuses = new Set(["declined", "cancelled", "abandoned"]);
const text = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => text(value).toLowerCase();
const one = (value: unknown): Json | null => Array.isArray(value)
  ? value[0] && typeof value[0] === "object" ? value[0] as Json : null
  : value && typeof value === "object" ? value as Json : null;

export function enrolmentMatchesSignedConvention(enrolment: Json, convention: Json) {
  if (inactiveStatuses.has(text(enrolment.status))) return false;
  const learner = one(enrolment.daily_learners);
  if (text(convention.recipient_type) === "beneficiary") {
    if (text(enrolment.id) === text(convention.recipient_key)) return true;
    const learnerEmail = normalized(learner?.email);
    const learnerName = [text(learner?.first_name), text(learner?.last_name)].filter(Boolean).join(" ").toLowerCase();
    return Boolean(
      (learnerEmail && learnerEmail === normalized(convention.recipient_email))
      || (learnerName && learnerName === normalized(convention.recipient_name)),
    );
  }
  if (text(convention.recipient_type) === "company") {
    if (text(enrolment.contracting_party_type) !== "company") return false;
    const companyName = normalized(enrolment.company_name);
    const companyEmail = normalized(enrolment.company_contact_email);
    const expectedName = normalized(convention.company_name);
    const expectedEmail = normalized(convention.recipient_email);
    if (!expectedName && !expectedEmail) return false;
    if (expectedName && (!companyName || companyName !== expectedName)) return false;
    if (expectedEmail && (!companyEmail || companyEmail !== expectedEmail)) return false;
    return true;
  }
  return false;
}

export async function sendPostSignatureLearnerAccess(
  admin: AdminSupabase,
  input: { conventionId: string; origin: string; createdBy?: string | null },
): Promise<LearnerPortalAccessResult[]> {
  const { data: signatures, error: signatureError } = await admin
    .from("daily_convention_signatures")
    .select("id,status")
    .eq("convention_id", input.conventionId);
  if (signatureError) throw new Error(signatureError.message);
  if (!signatures?.length || signatures.some((row: Json) => row.status !== "signed")) return [];

  const { data: convention, error: conventionError } = await admin
    .from("daily_conventions")
    .select("id,session_id,recipient_type,recipient_key,recipient_name,recipient_email,company_name,daily_sessions(id,organisation_id,status)")
    .eq("id", input.conventionId)
    .maybeSingle();
  if (conventionError) throw new Error(conventionError.message);
  if (!convention) return [];
  const session = one(convention.daily_sessions);
  const organisationId = text(session?.organisation_id);
  if (!session || !organisationId || text(session.status) === "archived") return [];

  const { data: enrolments, error: enrolmentError } = await admin
    .from("daily_session_enrolments")
    .select("id,organisation_id,session_id,learner_id,status,contracting_party_type,company_name,company_contact_email,daily_learners(id,organisation_id,first_name,last_name,email)")
    .eq("session_id", text(convention.session_id))
    .eq("organisation_id", organisationId);
  if (enrolmentError) throw new Error(enrolmentError.message);

  const relevant = (enrolments ?? []).filter((row: Json) => enrolmentMatchesSignedConvention(row, convention));
  const results: LearnerPortalAccessResult[] = [];
  for (const enrolment of relevant) {
    try {
      results.push(await ensureAndSendLearnerPortalAccess(admin, {
        enrolmentId: text(enrolment.id), organisationId, origin: input.origin,
        createdBy: input.createdBy ?? null, source: "post_signature",
      }));
    } catch {
      results.push({ enrolmentId: text(enrolment.id), status: "send_failed" });
    }
  }
  return results;
}
