type LearnerRelation = {
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
} | Array<{
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
}> | null | undefined;

type PortalAccessIdentity = {
  entity_key?: unknown;
  entity_email?: unknown;
  entity_name?: unknown;
};

type EnrolmentIdentity = {
  learner_id?: unknown;
  daily_learners?: LearnerRelation;
};

const text = (value: unknown) => String(value ?? "").trim();
const email = (value: unknown) => text(value).toLowerCase();

function relatedLearner(value: LearnerRelation) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function matchesDailyLearnerPortalAccess(
  access: PortalAccessIdentity,
  enrolment: EnrolmentIdentity,
) {
  const entityKey = text(access.entity_key);
  if (entityKey) return entityKey === `learner:${text(enrolment.learner_id)}`;

  const entityEmail = email(access.entity_email);
  const learner = relatedLearner(enrolment.daily_learners);
  // A display name cannot authorize private documents, even for legacy links.
  return Boolean(entityEmail && entityEmail === email(learner?.email));
}

/**
 * A learner portal token must resolve to exactly one active enrolment.
 * Canonical learner keys take precedence over legacy email-only links.
 * Shared emails and incomplete legacy identities fail closed.
 */
export function findUniqueDailyLearnerPortalEnrolment<T extends EnrolmentIdentity>(
  access: PortalAccessIdentity,
  enrolments: T[],
): T | null {
  const matches = enrolments.filter((enrolment) => matchesDailyLearnerPortalAccess(access, enrolment));
  return matches.length === 1 ? matches[0] : null;
}

// Legacy convention, convocation and registration-response rows identify recipients
// only by email. Even a canonical learner token cannot distinguish such rows when
// another enrolment in the same session (including a cancelled one) shares that email.
export function hasUniqueDailyLearnerRecipientEmail(
  access: PortalAccessIdentity,
  enrolments: EnrolmentIdentity[],
): boolean {
  const entityEmail = email(access.entity_email);
  if (!entityEmail) return false;
  const recipients = enrolments.filter((row) =>
    email(relatedLearner(row.daily_learners)?.email) === entityEmail,
  );
  return recipients.length === 1 && matchesDailyLearnerPortalAccess(access, recipients[0]);
}
