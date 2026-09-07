import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await readFile(new URL("../app/api/client/daily/mission-orders/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/client/daily/formateurs/ordres-de-mission/page.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260907171818_daily_mission_orders.sql", import.meta.url), "utf8");

test("les ordres de mission reposent sur deux signatures uniques et deviennent immuables dès la première", () => {
  assert.match(migration, /create table if not exists public\.daily_mission_orders/);
  assert.match(migration, /create table if not exists public\.daily_mission_order_signatures/);
  assert.match(migration, /unique \(mission_order_id, signatory_type\)/);
  assert.match(migration, /daily_lock_mission_order_after_signature/);
  assert.match(migration, /mission order is locked after first signature/);
  assert.match(migration, /signatory_type in \('ordering_party','trainer'\)/);
});

test("les tables ne sont pas directement modifiables par les comptes authentifiés", () => {
  assert.match(migration, /revoke all on table public\.daily_mission_orders from anon, authenticated/);
  assert.match(migration, /revoke all on table public\.daily_mission_order_signatures from anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.daily_mission_orders to service_role/);
  assert.match(migration, /grant select, insert on table public\.daily_mission_order_signatures to service_role/);
  assert.doesNotMatch(migration, /grant .*daily_mission_orders to authenticated/);
});

test("la création est réservée aux responsables formateurs et borne le formateur à l’organisme courant", () => {
  assert.match(api, /capabilities\.trainers/);
  assert.match(api, /capabilities\.trainers_all/);
  assert.match(api, /\.eq\("id", trainerProfileId\)/);
  assert.match(api, /\.eq\("organisation_id", organisationId\)/);
  assert.match(api, /\.eq\("active", true\)/);
  assert.match(api, /trainer_user_id: trainer\.user_id/);
});

test("la signature serveur n’accepte que le donneur d’ordre ou le formateur rattaché", () => {
  assert.match(api, /order\.ordering_party_user_id === context\.user\.id/);
  assert.match(api, /trainer\?\.user_id === context\.user\.id/);
  assert.match(api, /Vous n’êtes pas signataire de cet ordre de mission/);
  assert.match(api, /createHash\("sha256"\)/);
  assert.match(api, /Cette partie a déjà signé l’ordre de mission/);
  assert.match(api, /fullySigned \? "signed" : "partially_signed"/);
});

test("l’interface annonce explicitement la double signature et ne propose pas de suppression", () => {
  assert.match(page, /double signature/i);
  assert.match(page, /figé dès la première signature/i);
  assert.match(page, /Signatures : \{orderSignatures\.length\}\/2/);
  assert.match(page, /Signer cet ordre de mission/);
  assert.doesNotMatch(page, />Supprimer</);
});
