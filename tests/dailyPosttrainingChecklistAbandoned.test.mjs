import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260914160000_exclude_abandoned_from_posttraining_checklist.sql",
  import.meta.url,
);

test("la checklist post-formation exclut les inscriptions abandonnées de tous ses calculs", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /daily_sync_session_posttraining_checklist/);
  const inactiveGuard = /status not in \('declined','cancelled','abandoned'\)/g;
  assert.equal(
    (sql.match(inactiveGuard) ?? []).length,
    4,
    "les quatre calculs d'inscription active doivent tous exclure abandoned",
  );
});
