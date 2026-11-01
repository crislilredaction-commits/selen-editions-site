/**
 * Directory-only fallback for pre-canonical learner links.
 * Never infer a person's portal from a shared email/name or another learner's canonical key.
 * Does not create or revoke tokens; the canonical provisioning service owns that lifecycle.
 */
type LearnerIdentity = { email?: string | null; first_name?: string | null; last_name?: string | null };
type Enrolment = { session_id: string; learner_id: string; daily_learners?: LearnerIdentity | null };
type PortalAccess = { session_id: string; entity_key?: string | null; entity_email?: string | null; entity_name?: string | null };

function email(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function name(value: LearnerIdentity | null | undefined) {
  return [value?.first_name, value?.last_name].map(part => String(part ?? "").trim()).filter(Boolean).join(" ").toLowerCase();
}

const CANONICAL_UUID_KEY = /^learner:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function findUniqueLegacyLearnerAccess<T extends PortalAccess>(
  current: Enrolment,
  enrolments: Enrolment[],
  accesses: T[],
): T | null {
  const currentEmail = email(current.daily_learners?.email);
  const currentName = name(current.daily_learners);
  if (!currentEmail && !currentName) return null;

  // An email is the preferred legacy identifier. A shared email must not
  // silently fall back to a name to pick one of the shared access links.
  const sameIdentity = (enrolment: Enrolment) =>
    enrolment.session_id === current.session_id &&
    (currentEmail ? email(enrolment.daily_learners?.email) === currentEmail : name(enrolment.daily_learners) === currentName);
  const owners = new Set(enrolments.filter(sameIdentity).map(enrolment => enrolment.learner_id));
  if (owners.size !== 1 || !owners.has(current.learner_id)) return null;

  const otherCanonicalKeys = new Set(enrolments
    .filter(enrolment => enrolment.session_id === current.session_id && enrolment.learner_id !== current.learner_id)
    .map(enrolment => `learner:${enrolment.learner_id}`));
  const matches = accesses.filter(access => {
    if (access.session_id !== current.session_id) return false;
    const key = String(access.entity_key ?? "");
    if (otherCanonicalKeys.has(key) || (CANONICAL_UUID_KEY.test(key) && key !== `learner:${current.learner_id}`)) return false;
    return currentEmail ? email(access.entity_email) === currentEmail : String(access.entity_name ?? "").trim().toLowerCase() === currentName;
  });
  return matches.length === 1 ? matches[0] : null;
}
