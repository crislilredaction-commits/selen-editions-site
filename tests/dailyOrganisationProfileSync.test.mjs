import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const safeProfileMigration = await readFile(
  new URL("../supabase/migrations/20260831202752_sync_daily_safe_profile_address.sql", import.meta.url),
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
const clientWorkspace = await readFile(
  new URL("../lib/server/dailyClientWorkspace.ts", import.meta.url),
  "utf8",
);

const normalizedAddress = "nullif\\(btrim\\(coalesce\\(p_administrative_address,\\s*''\\)\\),\\s*''\\)";

test("l'onboarding conserve la même adresse canonique et administrative", () => {
  assert.match(onboardingSyncMigration, /address\s*=\s*coalesce\(nullif\(btrim\(new\.address\),\s*''\),\s*o\.address\)/);
  assert.match(onboardingSyncMigration, /administrative_address\s*=\s*coalesce\(nullif\(btrim\(new\.address\),\s*''\),\s*o\.administrative_address\)/);
});

test("une modification Daily du profil sûr maintient les deux adresses alignées sans changer le contrat du RPC", () => {
  assert.match(safeProfileMigration, /returns\s+void/i);
  assert.match(safeProfileMigration, /has_organisation_role\(p_organisation_id,\s*'manager'\)/);
  assert.match(safeProfileMigration, /has_organisation_permission_block\(p_organisation_id,\s*'legal_profile'\)/);
  assert.match(safeProfileMigration, new RegExp(`set\\s+address\\s*=\\s*${normalizedAddress},`));
  assert.match(safeProfileMigration, new RegExp(`administrative_address\\s*=\\s*${normalizedAddress}`));
  assert.doesNotMatch(safeProfileMigration, /\bemail\s*=\s*nullif\(btrim\(coalesce\(p_administrative_email/);
  assert.doesNotMatch(safeProfileMigration, /\bphone\s*=\s*nullif\(btrim\(coalesce\(p_administrative_phone/);
});

test("l'API Daily passe toujours par le RPC sûr pour ces coordonnées", () => {
  assert.match(workspaceRoute, /daily_client_update_safe_organisation/);
  assert.match(workspaceRoute, /p_administrative_address:\s*clean\(source\.administrative_address\)\s*\|\|\s*null/);
  assert.match(workspaceRoute, /p_administrative_email:\s*clean\(source\.administrative_email\)\s*\|\|\s*null/);
  assert.match(workspaceRoute, /p_administrative_phone:\s*clean\(source\.administrative_phone\)\s*\|\|\s*null/);
});

test("le premier onboarding rattache le client à l'organisme Daily déjà créé au paiement", () => {
  assert.match(clientWorkspace, /async function linkPurchasedDailyOrganisation/);
  assert.match(clientWorkspace, /\.ilike\("email", cleanEmail\)/);
  assert.match(clientWorkspace, /\.eq\("type", "daily"\)/);
  assert.match(clientWorkspace, /organisation_memberships/);
  assert.match(clientWorkspace, /primary_role: "manager"/);
  assert.match(clientWorkspace, /organisation_membership_roles/);
  assert.match(clientWorkspace, /role: "manager"/);
  assert.match(clientWorkspace, /if \(!linkedPurchasedOrganisation\) \{[\s\S]*daily_client_bootstrap_organisation/);
});

test("le rattachement réutilisé synchronise aussi les données légales saisies pendant l'onboarding", () => {
  assert.match(clientWorkspace, /legal_name: organisationName/);
  assert.match(clientWorkspace, /siret: siret \|\| null/);
  assert.match(clientWorkspace, /administrative_address: address \|\| null/);
  assert.match(clientWorkspace, /contact_name: managerName \|\| null/);
  assert.match(clientWorkspace, /Plusieurs organismes Daily correspondent à ce compte/);
  assert.match(clientWorkspace, /n'est pas actif\. Selen doit le vérifier/);
});
