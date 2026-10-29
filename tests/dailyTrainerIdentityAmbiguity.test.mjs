import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const makeWorkspace = (trainers, roles = ["trainer"], user = { id: "account-a", email: "shared@example.test" }) => ({
  ok: true,
  user,
  workspace: {
    trainers,
    membership: { organisation_id: "of-a", roles },
  },
});

async function resolve(trainers, roles, user) {
  const workspace = makeWorkspace(trainers, roles, user);
  const module = loadTypeScript("lib/server/dailyTrainerWorkspaceContext.ts", {
    "@/lib/server/dailyClientWorkspace": { getDailyClientWorkspace: async () => workspace },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => ({}) },
  });
  return module.getDailyTrainerWorkspaceContext();
}

test("trainer identity: canonical account binding takes priority over shared email", async () => {
  const result = await resolve([
    { id: "linked", user_id: "account-a", professional_email: "shared@example.test", active: true },
    { id: "legacy", user_id: null, professional_email: "shared@example.test", active: true },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.trainerId, "linked");
  assert.equal(result.orgId, "of-a");
});

test("trainer identity: ambiguous unlinked email is rejected rather than selecting first", async () => {
  const result = await resolve([
    { id: "first", user_id: null, professional_email: "shared@example.test", active: true },
    { id: "second", user_id: null, professional_email: "SHARED@example.test", active: true },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

test("trainer identity: duplicate canonical account bindings are rejected", async () => {
  const result = await resolve([
    { id: "one", user_id: "account-a", active: true },
    { id: "two", user_id: "account-a", active: true },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

test("trainer identity: email alone never adopts another account's profile", async () => {
  const result = await resolve([{ id: "other", user_id: "account-b", professional_email: "shared@example.test", active: true }]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("trainer identity: inactive and archived profiles are never selected", async () => {
  const result = await resolve([
    { id: "inactive", user_id: "account-a", active: false },
    { id: "archived", user_id: "account-a", active: true, status: "archived" },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("trainer identity: unique unlinked email remains usable for legacy invitation", async () => {
  const result = await resolve([{ id: "legacy", user_id: null, professional_email: "SHARED@example.test", active: true }]);
  assert.equal(result.ok, true);
  assert.equal(result.trainerId, "legacy");
});

test("trainer identity: manager can use only a unique eligible owner profile", async () => {
  const valid = await resolve([{ id: "owner", engagement_type: "owner", active: true, user_id: null }], ["manager"]);
  assert.equal(valid.ok, true);
  assert.equal(valid.trainerId, "owner");
  const foreign = await resolve([{ id: "owner", engagement_type: "owner", active: true, user_id: "account-b" }], ["manager"]);
  assert.equal(foreign.ok, false);
  assert.equal(foreign.status, 403);
  const ambiguous = await resolve([
    { id: "owner-1", engagement_type: "owner", active: true },
    { id: "owner-2", engagement_type: "owner", active: true },
  ], ["manager"]);
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.status, 403);
});
