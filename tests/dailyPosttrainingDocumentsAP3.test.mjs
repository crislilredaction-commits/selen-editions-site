import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const implementation=fs.readFileSync("lib/server/dailyPosttrainingDocuments.ts","utf8");
const migration=fs.readFileSync("supabase/migrations/20261008180438_daily_posttraining_documents_ap3.sql","utf8");

test("AP3 registers generated documents atomically with a stable source fingerprint",()=>{
  assert.match(implementation,/sourceFingerprint/);
  assert.match(implementation,/daily_register_posttraining_document/);
  assert.match(implementation,/if \(!registration\.created\).*remove/);
  assert.match(implementation,/if \(generated\.created\) created\.push/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/metadata->>'source_fingerprint' = v_fingerprint/);
  assert.match(migration,/daily_posttraining_document_current_scope_unique/);
});

test("AP3 rejects obsolete business parents at the canonical registration boundary",()=>{
  assert.match(implementation,/autoBlocked\("session_inactive"\)/);
  assert.match(migration,/status not in \('cancelled', 'archived'\)/);
  assert.match(migration,/status not in \('declined', 'cancelled', 'abandoned'\)/);
  assert.match(migration,/revoke all on function public\.daily_register_posttraining_document/);
  assert.match(migration,/grant execute on function public\.daily_register_posttraining_document[\s\S]*to service_role/);
});
