import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const identity = loadTypeScript("lib/server/dailyPortalLearnerIdentity.ts");
const routes = [
  "app/api/daily-portal/[token]/assessment/route.ts",
  "app/api/daily-portal/[token]/learner-satisfaction/route.ts",
];
const active = (id = "a", organisation_id = "org") => ({
  id: `enrol-${id}`, learner_id: `learner-${id}`, organisation_id, session_id: "session",
  status: "active", daily_learners: { id: `learner-${id}`, email: "shared@example.test" },
});
const cancelled = { ...active("b"), status: "cancelled" };

function setup(path, { entityKey = null, status = "pending", enrolments = [active(), cancelled] } = {}) {
  const db = {
    daily_portal_access_tokens: [{
      id: "access", token: "secret", portal_type: "learner", status,
      session_id: "session", entity_key: entityKey, entity_email: "shared@example.test",
      expires_at: null,
    }],
    daily_sessions: [{
      id: "session", organisation_id: "org", formation_id: "formation",
      start_date: "2026-10-01", end_date: "2026-10-20", status: "ready",
      daily_formations: {
        id: "formation", title: "Formation test", learning_assessment_mode: "selen_quiz",
        learning_assessment_instructions: "Répondez", learning_assessment_questions: [{
          id: "q1", label: "Question", type: "single_choice", options: ["Oui"],
          correct_answers: ["Oui"], points: 1, required: true, order: 1,
        }],
      },
    }],
    daily_session_enrolments: enrolments,
    daily_learning_assessment_responses: [],
    daily_learner_feedback_responses: [],
    daily_attendance_slots: [],
  };
  const reads = [];
  const admin = {
    from(table) {
      reads.push(table);
      const filters = [];
      let single = false;
      let limit = Infinity;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        neq(key, value) { filters.push(row => row[key] !== value); return query; },
        order() { return query; },
        limit(value) { limit = value; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const rows = (db[table] ?? []).filter(row => filters.every(check => check(row))).slice(0, limit);
            return { data: single ? rows[0] ?? null : rows, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const dependencies = {
    "next/server": { NextResponse: Response },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/server/dailyPortalLearnerIdentity": identity,
    "@/lib/daily/endOfTraining": {
      getLearnerSatisfactionAvailability: () => ({ available: true, reason: "assessment_submitted" }),
    },
    "@/lib/server/dailyLearnerSatisfactionLifecycle": {
      finalizeDailyLearnerSatisfaction: async () => {},
    },
  };
  const { GET, POST } = loadTypeScript(path, dependencies, { Response });
  const params = { params: Promise.resolve({ token: "secret" }) };
  return {
    reads,
    get: () => GET(new Request("https://selen.example.test/api/daily-portal/secret"), params),
    post: () => POST(new Request("https://selen.example.test/api/daily-portal/secret", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }), params),
  };
}

for (const path of routes) {
  test(`${path}: a legacy shared email stays ambiguous even after one enrolment is cancelled`, async () => {
    const h = setup(path);
    assert.equal((await h.get()).status, 409);
    assert.equal((await h.post()).status, 409);
    assert.ok(h.reads.includes("daily_session_enrolments"));
    assert.ok(!h.reads.includes("daily_learning_assessment_responses"));
    assert.ok(!h.reads.includes("daily_learner_feedback_responses"));
  });

  test(`${path}: a canonical learner link works despite another cancelled learner sharing email`, async () => {
    const h = setup(path, { entityKey: "learner:learner-a" });
    assert.equal((await h.get()).status, 200);
    assert.ok(h.reads.includes("daily_learning_assessment_responses"));
  });

  test(`${path}: a cancelled canonical enrolment cannot read or submit a questionnaire`, async () => {
    const h = setup(path, { entityKey: "learner:learner-b" });
    assert.equal((await h.get()).status, 403);
    assert.equal((await h.post()).status, 403);
    assert.ok(!h.reads.includes("daily_learning_assessment_responses"));
  });

  test(`${path}: unknown portal status is denied before private reads`, async () => {
    const h = setup(path, { status: "unknown" });
    assert.equal((await h.get()).status, 403);
    assert.deepEqual(h.reads, ["daily_portal_access_tokens"]);
  });

  test(`${path}: unique legacy identity remains available within the correct organisation`, async () => {
    const h = setup(path, { enrolments: [active(), active("outside", "other-org")] });
    assert.equal((await h.get()).status, 200);
  });
}
