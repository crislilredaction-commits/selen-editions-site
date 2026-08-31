import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const safeProfileMigration = await readFile(
  new URL("../supabase/migrations/20260831223000_sync_daily_safe_profile_address.sql", import.meta.url),
  "utf8",
);
const onboardingSyncMigration = await readFile(
  new URL("../supabase/migrations/20260830022303_sync_daily_onboarding_to_organisations.sql", import.meta.url),
  "utf8",
);
const workspaceRoute = await readFile(
  new URL("../app/api/client/daily/workspace/route.ts", import.meta.url),
  "utf8",
);

test("l'onboarding conserve la même adresse canonique et administrative", () => {
  assert.match(onboardingSyncMigration, /address\s*=\s*nullif\(trim\(w\.address_city\),\s*''\)/);
  assert.match(onboardingSyncMigration, /administrative_address\s*=\s*nullif\(trim\(w\.address_city\),\s*''\)/);
});

test("une modification Daily du profil sûr maintient les deux adresses alignées", () => {
  assert.match(safeProfileMigration, /set\s+address\s*=\s*p_administrative_address,/);
  assert.match(safeProfileMigration, /administrative_address\s*=\s*p_administrative_address,/);
  assert.doesNotMatch(safeProfileMigration, /update\s+public\.organisations[\s\S]*?\bemail\s*=\s*p_administrative_email/);
  assert.doesNotMatch(safeProfileMigration, /update\s+public\.organisations[\s\S]*?\bphone\s*=\s*p_administrative_phone/);
});

test("l'API Daily passe toujours par le RPC sûr pour ces coordonnées", () => {
  assert.match(workspaceRoute, /daily_client_update_safe_organisation/);
  assert.match(workspaceRoute, /p_administrative_address:\s*address/);
  assert.match(workspaceRoute, /p_administrative_email:\s*email/);
  assert.match(workspaceRoute, /p_administrative_phone:\s*phone/);
});
