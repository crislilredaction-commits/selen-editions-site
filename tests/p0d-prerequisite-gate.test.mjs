import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260919200500_p0d_seed_and_gate_prerequisites.sql", import.meta.url);

async function migration() {
  return readFile(migrationUrl, "utf8");
}

test("P0-D propage les justificatifs obligatoires à chaque candidature", async () => {
  const sql = await migration();
  assert.match(sql, /create trigger daily_registration_seed_prerequisite_evidence/i);
  assert.match(sql, /after insert on public\.daily_formation_registration_requests/i);
  assert.match(sql, /insert into public\.daily_prerequisite_evidence/i);
  assert.match(sql, /jsonb_array_elements\(coalesce\(formation_row\.prerequisite_requirements/i);
  assert.match(sql, /on conflict \(registration_request_id, participant_index, requirement_id\) do nothing/i);
});

test("P0-D bloque l'acceptation tant que toutes les preuves ne sont pas vérifiées", async () => {
  const sql = await migration();
  assert.match(sql, /before update of decision_status/i);
  assert.match(sql, /new\.decision_status <> 'accepted'/i);
  assert.match(sql, /status = 'verified'/i);
  assert.match(sql, /verified_count < expected_count/i);
  assert.match(sql, /Impossible d’accepter la candidature/i);
});

test("les fonctions de garde ne sont pas exposées aux rôles navigateur", async () => {
  const sql = await migration();
  assert.match(sql, /revoke all on function public\.seed_daily_prerequisite_evidence\(\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.guard_daily_registration_prerequisite_acceptance\(\) from public, anon, authenticated/i);
});
