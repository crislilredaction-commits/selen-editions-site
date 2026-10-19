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
const name = (value: unknown) => text(value).toLowerCase().replace(/\s+/g, " ");

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
  const entityName = name(access.entity_name);
  const learnerName = name([learner?.first_name, learner?.last_name].map(text).filter(Boolean).join(" "));
  return Boolean(
    (entityEmail && entityEmail === email(learner?.email))
    || (entityName && entityName === learnerName),
  );
}
