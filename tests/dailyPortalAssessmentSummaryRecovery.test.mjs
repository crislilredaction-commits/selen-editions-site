import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";
import { isActivePortalAttendanceToken } from "../lib/daily/portalAttendanceAccess.mjs";

function setup({ failSummaryWrite = false, existingResponse = false, summary = null } = {}) {
  const saved = existingResponse ? {
    id: "response", auto_score: 1, score_max: 1, requires_manual_review: false,
    submitted_at: "2026-10-29T10:00:00.000Z",
  } : null;
  const rows = {
    daily_portal_access_tokens: [{ token: "secret", portal_type: "learner", status: "pending", expires_at: null, session_id: "session", entity_email: "learner@example.test" }],
    daily_sessions: [{ id: "session", organisation_id: "org", formation_id: "formation", status: "completed", end_date: "2020-01-01",
      daily_formations: { title: "Formation", learning_assessment_mode: "selen_quiz", learning_assessment_questions: [
        { id: "q1", label: "Question", type: "single_choice", options: ["A", "B"], correct_answers: ["A"], points: 1, required: true },
      ] } }],
    daily_session_enrolments: [{ id: "enrolment", learner_id: "learner", organisation_id: "org", session_id: "session", status: "active", daily_learners: { email: "learner@example.test" } }],
    daily_learning_assessment_responses: saved ? [saved] : [],
    daily_learning_assessments: summary ? [{ id: "summary", ...summary }] : [],
  };
  let summaryFailures = failSummaryWrite ? 1 : 0;
  let responseInserts = 0;
  let summaryWrites = 0;
  const admin = {
    from(table) {
      let operation = "read";
      let payload = null;
      const filters = [];
      const q = {
        select() { return q; },
        eq(key, value) { filters.push((row) => row[key] === value); return q; },
        neq(key, value) { filters.push((row) => row[key] !== value); return q; },
        insert(data) { operation = "insert"; payload = data; return q; },
        update(data) { operation = "update"; payload = data; return q; },
        maybeSingle() { return execute(true); },
        single() { return execute(true); },
        then(resolve, reject) { return execute(false).then(resolve, reject); },
      };
      async function execute(single) {
        const matches = (rows[table] ?? []).filter((row) => filters.every((predicate) => predicate(row)));
        if (operation === "read") return { data: single ? matches[0] ?? null : matches, error: null };
        if (table === "daily_learning_assessments" && summaryFailures > 0) {
          summaryFailures--;
          return { data: null, error: { code: "MOCK_ERROR", message: "Temporary database failure" } };
        }
        if (operation === "insert") {
          if (table === "daily_learning_assessment_responses") {
            responseInserts++;
            const row = { id: "response", submitted_at: "2026-10-29T10:00:00.000Z", ...payload };
            rows[table].push(row);
            return { data: single ? row : null, error: null };
          }
          if (table === "daily_learning_assessments") {
            summaryWrites++;
            rows[table].push({ id: "summary", ...payload });
          }
        }
        if (operation === "update") {
          summaryWrites++;
          for (const row of matches) Object.assign(row, payload);
        }
        return { data: null, error: null };
      }
      return q;
    },
  };
  const { GET, POST } = loadTypeScript("app/api/daily-portal/[token]/assessment/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/daily/portalAttendanceAccess.mjs": { isActivePortalAttendanceToken },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/server/dailyPortalLearnerIdentity": { findUniqueDailyLearnerPortalEnrolment: (_access, list) => list[0] ?? null },
  }, { Response, Request, Date, Intl, Set });
  const params = { params: Promise.resolve({ token: "secret" }) };
  return {
    get: () => GET(new Request("https://selen.example.test/assessment"), params),
    post: () => POST(new Request("https://selen.example.test/assessment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: { q1: "A" } }),
    }), params),
    rows,
    counts: () => ({ responseInserts, summaryWrites }),
  };
}

test("nominal quiz submission persists both the response and its trainer summary", async () => {
  const h = setup();
  const response = await h.post();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).summaryPending, false);
  assert.equal(h.counts().responseInserts, 1);
  assert.equal(h.rows.daily_learning_assessments[0].score, 1);
  assert.equal(h.rows.daily_learning_assessments[0].outcome, "pending");
});

test("a failed trainer summary never claims full success and never loses the learner response", async () => {
  const h = setup({ failSummaryWrite: true });
  const response = await h.post();
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.submitted, true);
  assert.equal(body.summaryPending, true);
  assert.match(body.warning, /conservées/);
  assert.equal(h.rows.daily_learning_assessment_responses.length, 1);
  const status = await h.get();
  assert.equal((await status.json()).assessment.summaryPending, true);
});

test("retry repairs the missing trainer summary without duplicating the learner response", async () => {
  const h = setup({ failSummaryWrite: true });
  await h.post();
  const retry = await h.post();
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).summaryPending, false);
  assert.equal(h.counts().responseInserts, 1);
  assert.equal(h.rows.daily_learning_assessments.length, 1);
  assert.equal((await (await h.get()).json()).assessment.summaryPending, false);
});

test("a previously finalized trainer result cannot be overwritten by a repeated learner POST", async () => {
  const h = setup({ existingResponse: true, summary: {
    organisation_id: "org", session_id: "session", enrolment_id: "enrolment",
    outcome: "validated", method: "Formateur", score: 9, score_max: 10,
  } });
  const response = await h.post();
  assert.equal(response.status, 200);
  assert.equal(h.counts().summaryWrites, 0);
  assert.equal(h.rows.daily_learning_assessments[0].score, 9);
});

test("the learner UI distinguishes a saved submission from a synchronized trainer result", async () => {
  const page = await readFile(new URL("../app/daily/portail/[role]/[token]/evaluation/page.tsx", import.meta.url), "utf8");
  assert.match(page, /summaryPending/);
  assert.match(page, /Réessayer la synchronisation/);
  assert.match(page, /suivi formateur doit encore être synchronisé/);
});
