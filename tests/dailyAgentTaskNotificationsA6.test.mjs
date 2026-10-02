import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/cron/daily-agent-task-notifications/route.ts", import.meta.url), "utf8");
const sender = await readFile(new URL("../lib/server/dailyAgentTaskEmails.ts", import.meta.url), "utf8");
const vercel = await readFile(new URL("../vercel.json", import.meta.url), "utf8");

test("A6 route les tâches vers l'agent affecté sinon les admins", () => {
  assert.match(route, /target_agent_profile_id/);
  assert.match(route, /agent_profiles/);
  assert.match(route, /selen_admin_users/);
  assert.match(route, /assigned_agent_else_admins/);
});

test("A6 couvre les tâches organisme et session sans migration de sécurité", () => {
  assert.match(route, /daily_checklist/);
  assert.match(route, /daily_session_checklist/);
  assert.match(route, /daily_sync_session_checklist_notification/);
});

test("A6 déduplique les emails par notification", () => {
  assert.match(route, /\.is\("email_sent_at", null\)/);
  assert.match(route, /email_sent_at: new Date\(\)\.toISOString\(\)/);
  assert.match(sender, /string \| string\[\]/);
});

test("A6 est exécuté périodiquement", () => {
  assert.match(vercel, /daily-agent-task-notifications/);
  assert.match(vercel, /\*\/10 \* \* \* \*/);
});
