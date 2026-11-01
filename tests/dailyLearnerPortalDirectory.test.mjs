import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../lib/dailyLearnerPortalDirectory.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports });
const { findUniqueLegacyLearnerAccess: find } = exports;

const a = { session_id: "session-1", learner_id: "a", daily_learners: { email: "shared@example.test", first_name: "Alice", last_name: "A" } };
const b = { session_id: "session-1", learner_id: "b", daily_learners: { email: "shared@example.test", first_name: "Bob", last_name: "B" } };
const legacy = { session_id: "session-1", entity_key: "learner:shared@example.test", entity_email: "shared@example.test", token: "legacy-token" };

test("shared email cannot assign the same legacy link to two learners", () => {
  assert.equal(find(a, [a, b], [legacy]), null);
  assert.equal(find(b, [a, b], [legacy]), null);
});

test("foreign canonical link is never selected by email fallback", () => {
  const foreign = { ...legacy, entity_key: "learner:b", token: "foreign" };
  assert.equal(find(a, [a, b], [foreign]), null);
});

test("one unambiguous historical link remains visible", () => {
  assert.equal(find(a, [a], [legacy])?.token, "legacy-token");
});

test("duplicate legacy links and cross-session links are not guessed", () => {
  assert.equal(find(a, [a], [legacy, { ...legacy, token: "other" }]), null);
  assert.equal(find(a, [a], [{ ...legacy, session_id: "session-2" }]), null);
});

test("foreign UUID canonical token is not reused even without a matching enrolment", () => {
  const foreign = { ...legacy, entity_key: "learner:123e4567-e89b-42d3-a456-426614174000" };
  assert.equal(find(a, [a], [foreign]), null);
});
