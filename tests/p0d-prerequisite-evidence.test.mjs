import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260919175500_p0d_prerequisite_evidence.sql", "utf8");

test("P0-D separates prerequisite upload from human verification", () => {
  assert.match(migration, /'awaiting_upload'::text, 'submitted'::text, 'verified'::text, 'rejected'::text/);
  assert.match(migration, /status in \('submitted', 'verified', 'rejected'\) and document_id is not null and submitted_at is not null/);
  assert.match(migration, /status in \('verified', 'rejected'\) and reviewed_by is not null and reviewed_at is not null/);
  assert.match(migration, /Only verified satisfies a mandatory prerequisite/);
});

test("P0-D evidence is scoped to one candidature, participant and requirement", () => {
  assert.match(migration, /registration_request_id uuid not null references public\.daily_formation_registration_requests/);
  assert.match(migration, /participant_index integer not null default 0/);
  assert.match(migration, /unique \(registration_request_id, participant_index, requirement_id\)/);
});

test("P0-D evidence stays server-mediated", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.daily_prerequisite_evidence from anon, authenticated/);
  assert.match(migration, /grant all on table public\.daily_prerequisite_evidence to service_role/);
});
