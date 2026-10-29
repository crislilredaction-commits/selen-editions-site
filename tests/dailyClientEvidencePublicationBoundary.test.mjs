import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [visibility, communications, proof, dossiers, evidence] = await Promise.all([
  readFile(new URL("../lib/daily/clientEvidenceVisibility.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/client/daily/communications/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/client/daily/communications/proof/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/client/daily/session-dossiers/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/client/daily/sessions/[id]/evidence-context/route.ts", import.meta.url), "utf8"),
]);

test("le journal client ne relit que des communications réellement transmises", () => {
  assert.match(visibility, /CLIENT_VISIBLE_COMMUNICATION_STATUSES = \[/);
  for (const status of ["sent", "delivered", "opened", "clicked", "bounced", "complained"]) {
    assert.match(visibility, new RegExp(`"${status}"`));
  }
  assert.doesNotMatch(visibility, /"queued"|"failed"/);
  for (const route of [communications, proof, dossiers, evidence]) {
    assert.match(route, /\.in\("status", \[\.\.\.CLIENT_VISIBLE_COMMUNICATION_STATUSES\]\)/);
  }
});

test("les dossiers client masquent seulement les documents Après non publiés", () => {
  assert.match(visibility, /POSTTRAINING_DOCUMENT_TYPES = new Set\(\["attendance_summary", "completion_certificate"\]\)/);
  assert.match(visibility, /PUBLISHED_DOCUMENT_STATUSES = new Set\(\["published", "signed"\]\)/);
  assert.match(visibility, /if \(!POSTTRAINING_DOCUMENT_TYPES\.has\(documentType\)\) return true/);
  assert.match(dossiers, /documents: \(documents \?\? \[\]\)\.filter\(isClientVisibleSessionDocument\)/);
  assert.match(evidence, /currentDocuments[\s\S]*\.filter\(isClientVisibleSessionDocument\)[\s\S]*\.map/);
});

test("la barrière reste une projection en lecture sans mutation ni suppression", () => {
  for (const source of [visibility, communications, proof, dossiers, evidence]) {
    assert.doesNotMatch(source, /\.delete\(/);
  }
  assert.doesNotMatch(visibility, /\.insert\(|\.update\(|\.upsert\(/);
});
