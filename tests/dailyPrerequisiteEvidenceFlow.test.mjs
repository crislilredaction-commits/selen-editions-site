import assert from "node:assert/strict";
import test from "node:test";
import { harness, ids, uuid } from "./helpers/dailyOwnPositioningHarness.mjs";

const requirement = (id, label) => ({ id, label, description: `${label} lisible`, required: true });
const pdf = (label, bytes = 0) => new File([Buffer.concat([Buffer.from(`%PDF-1.7\n${label}`), Buffer.alloc(bytes, 97)])], `${label}.pdf`, { type: "application/pdf" });
function required(h, requirements = [requirement("diploma", "Diplôme")]) {
  Object.assign(h.formation, { prerequisite_mode: "required", prerequisite_requirements: requirements });
  return h;
}
function form(h, extra = {}, positioning = [pdf("positionnement")], evidence = [[0, 0, pdf("diplome")]]) {
  const value = h.multipart(extra, positioning);
  for (const [participantIndex, requirementIndex, file] of evidence) value.set(`prerequisite_file_${participantIndex}_${requirementIndex}`, file);
  return value;
}

test("preuve obligatoire privée : soumission exacte et retry sans document ni email en double", async () => {
  const h = required(harness());
  const first = await h.post(form(h));
  assert.equal(first.status, 200, await first.text());
  const request = h.db.daily_formation_registration_requests[0];
  assert.match(request.prerequisite_submission_fingerprint, /^[a-f0-9]{64}$/);
  const evidence = h.db.daily_documents.filter((row) => row.document_type === "prerequisite_application_evidence");
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].linked_object_type, "registration_request");
  assert.equal(evidence[0].linked_object_id, ids.submission);
  assert.equal(evidence[0].organisation_id, ids.org);
  assert.equal(evidence[0].formation_id, ids.formation);
  assert.match(evidence[0].storage_path, new RegExp(`^daily/${ids.org}/prerequisite-applications/${ids.formation}/${ids.submission}/`));
  assert.equal(h.sends.length, 1);
  const documentCount = h.db.daily_documents.length;
  const replay = await h.post(form(h));
  assert.equal(replay.status, 200); assert.equal((await replay.json()).alreadySubmitted, true);
  assert.equal(h.db.daily_documents.length, documentCount); assert.equal(h.sends.length, 1);
});

test("preuve refusée : remplacement versionné dans le même dossier, nouvelle revue et aucun nouvel email", async () => {
  const h = required(harness());
  assert.equal((await h.post(form(h))).status, 200);
  const request = structuredClone(h.db.daily_formation_registration_requests[0]);
  const firstDocument = h.db.daily_documents.find((row) => row.document_type === "prerequisite_application_evidence");
  h.db.daily_prerequisite_evidence.push({
    id: uuid(70), registration_request_id: ids.submission, registration_response_id: null,
    participant_index: 0, requirement_id: "diploma", requirement_label: "Diplôme",
    document_id: firstDocument.id, status: "rejected", submitted_at: "2026-10-05T17:00:00Z",
    reviewed_by: uuid(71), reviewed_at: "2026-10-05T17:30:00Z", review_comment: "Pièce illisible", updated_at: "2026-10-05T17:30:00Z",
  });
  const replacement = await h.post(form(h, {signature_data:"data:image/png;base64,bm91dmVsbGUgc2lnbmF0dXJl"}, [pdf("positionnement")], [[0, 0, pdf("diplome-corrige")]]));
  assert.equal(replacement.status, 200, await replacement.clone().text());
  const payload = await replacement.json();
  assert.equal(payload.evidenceReplaced, true); assert.equal(payload.alreadySubmitted, true);
  assert.equal(h.db.daily_formation_registration_requests.length, 1); assert.equal(h.sends.length, 1);
  for(const key of ['signature_data','signature_proof_hash','signature_signed_at','need_answers','positioning_answers'])assert.deepEqual(h.db.daily_formation_registration_requests[0][key],request[key],`original ${key} must remain immutable`);
  const documents = h.db.daily_documents.filter((row) => row.document_type === "prerequisite_application_evidence");
  assert.equal(documents.length, 2);
  const current = documents.find((row) => row.is_current);
  assert.equal(firstDocument.is_current, false); assert.equal(current.previous_document_id, firstDocument.id); assert.equal(current.version, 2);
  assert.equal(current.metadata.staged_replacement, true);
  const evidence = h.db.daily_prerequisite_evidence[0];
  assert.equal(evidence.document_id, current.id); assert.equal(evidence.status, "submitted"); assert.equal(evidence.reviewed_by, null); assert.equal(evidence.review_comment, null);
  const count = h.db.daily_documents.length;
  const retry = await h.post(form(h, {signature_data:"data:image/png;base64,bm91dmVsbGUgc2lnbmF0dXJl"}, [pdf("positionnement")], [[0, 0, pdf("diplome-corrige")]]));
  assert.equal(retry.status, 200); assert.equal((await retry.json()).alreadySubmitted, true);
  assert.equal(h.db.daily_documents.length, count); assert.equal(h.sends.length, 1);
});

test("une correction remplace seulement la pièce refusée et conserve la pièce déjà validée", async () => {
  const h = required(harness(), [requirement("diploma", "Diplôme"), requirement("experience", "Expérience")]);
  assert.equal((await h.post(form(h, {}, [pdf("positionnement")], [[0, 0, pdf("diplome")], [0, 1, pdf("experience")]]))).status, 200);
  const [diploma, experience] = h.db.daily_documents.filter((row) => row.document_type === "prerequisite_application_evidence");
  h.db.daily_prerequisite_evidence.push(
    { id: uuid(70), registration_request_id: ids.submission, registration_response_id: null, participant_index: 0, requirement_id: "diploma", requirement_label: "Diplôme", document_id: diploma.id, status: "verified", submitted_at: "2026-10-05T17:00:00Z", reviewed_by: uuid(71), reviewed_at: "2026-10-05T17:30:00Z", review_comment: "Conforme", updated_at: "2026-10-05T17:30:00Z" },
    { id: uuid(72), registration_request_id: ids.submission, registration_response_id: null, participant_index: 0, requirement_id: "experience", requirement_label: "Expérience", document_id: experience.id, status: "rejected", submitted_at: "2026-10-05T17:00:00Z", reviewed_by: uuid(71), reviewed_at: "2026-10-05T17:30:00Z", review_comment: "Illisible", updated_at: "2026-10-05T17:30:00Z" },
  );
  const response = await h.post(form(h, { signature_data: "data:image/png;base64,bm91dmVsbGU=" }, [pdf("positionnement")], [[0, 1, pdf("experience-corrigee")]]));
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(diploma.is_current, true);
  assert.equal(h.db.daily_prerequisite_evidence[0].document_id, diploma.id);
  assert.equal(h.db.daily_prerequisite_evidence[0].status, "verified");
  assert.equal(experience.is_current, false);
  assert.equal(h.db.daily_prerequisite_evidence[1].status, "submitted");
});

test("une pièce facultative absente n’empêche ni la préparation ni l’envoi", async () => {
  const h = required(harness(), [requirement("diploma", "Diplôme"), { ...requirement("experience", "Expérience"), required: false }]);
  const response = await h.post(form(h, {}, [pdf("positionnement")], [[0, 0, pdf("diplome")]]));
  assert.equal(response.status, 200, await response.clone().text());
  const documents = h.db.daily_documents.filter((row) => row.document_type === "prerequisite_application_evidence");
  assert.deepEqual(documents.map((row) => row.metadata.requirement_id), ["diploma"]);
});

for(const [name,extra,positioning] of [
  ['identité',{respondent_first_name:'Autre'},[pdf('positionnement')]],
  ['besoin',{need_answers:{expectations:'Autre besoin'}},[pdf('positionnement')]],
  ['positionnement',{},[pdf('autre-positionnement')]],
  ['session',{selected_session_id:uuid(99)},[pdf('positionnement')]],
])test(`remplacement refusé si le dossier signé change : ${name}`,async()=>{
  const h=required(harness());assert.equal((await h.post(form(h))).status,200);
  const firstDocument=h.db.daily_documents.find(row=>row.document_type==='prerequisite_application_evidence');
  h.db.daily_prerequisite_evidence.push({id:uuid(70),registration_request_id:ids.submission,document_id:firstDocument.id,participant_index:0,requirement_id:'diploma',status:'rejected'});
  const before=h.db.daily_documents.length;
  const response=await h.post(form(h,{signature_data:'data:image/png;base64,bm91dmVsbGU=',...extra},positioning,[[0,0,pdf('diplome-corrige')]]));
  assert.equal(response.status,409);assert.equal(h.db.daily_documents.length,before);assert.equal(h.db.daily_formation_registration_requests.length,1);assert.equal(h.sends.length,1);assert.equal(firstDocument.is_current,true);
});

test("un prérequis requis sans chaque fichier bloque toute mutation et tout email", async () => {
  const h = required(harness());
  const response = await h.post(h.multipart());
  assert.equal(response.status, 400); assert.match((await response.json()).error, /justificatif/i);
  assert.equal(h.writes.length, 0); assert.equal(h.sends.length, 0); assert.equal(h.uploads.length, 0);
});

test("entreprise : chaque exigence est liée séparément à chaque apprenant", async () => {
  const h = required(harness(), [requirement("diploma", "Diplôme"), requirement("experience", "Expérience")]);
  const participants = [
    { first_name: "Alice", last_name: "Martin", email: "alice@example.test" },
    { first_name: "Bob", last_name: "Durand", email: "bob@example.test" },
  ];
  const response = await h.post(form(h, { response_type: "company", company_name: "Entreprise", participants }, [pdf("positionnement-a"), pdf("positionnement-b")], [
    [0, 0, pdf("alice-diplome")], [0, 1, pdf("alice-experience")], [1, 0, pdf("bob-diplome")], [1, 1, pdf("bob-experience")],
  ]));
  assert.equal(response.status, 200, await response.text());
  const documents = h.db.daily_documents.filter((row) => row.document_type === "prerequisite_application_evidence");
  assert.equal(documents.length, 4);
  assert.deepEqual(new Set(documents.map((row) => `${row.metadata.participant_index}:${row.metadata.requirement_id}`)), new Set(["0:diploma", "0:experience", "1:diploma", "1:experience"]));
});

test("le lien historique de session rattache les preuves à daily_registration_responses", async () => {
  const h = required(harness({ legacy: true }));
  const response = await h.post(form(h));
  assert.equal(response.status, 200, await response.text());
  assert.equal(h.db.daily_registration_responses.length, 1);
  const document = h.db.daily_documents.find((row) => row.document_type === "prerequisite_application_evidence");
  assert.equal(document.linked_object_type, "registration_response");
  assert.equal(document.linked_object_id, ids.submission);
  assert.equal(document.session_id, ids.session);
  assert.match(h.db.daily_registration_responses[0].prerequisite_submission_fingerprint, /^[a-f0-9]{64}$/);
});

test("même nonce avec une preuve différente est refusé avant un second dépôt", async () => {
  const h = required(harness());
  assert.equal((await h.post(form(h))).status, 200);
  const before = h.db.daily_documents.length;
  const changed = await h.post(form(h, {}, [pdf("positionnement")], [[0, 0, pdf("autre-diplome")]]));
  assert.equal(changed.status, 409); assert.match((await changed.json()).error, /autres justificatifs/i);
  assert.equal(h.db.daily_documents.length, before); assert.equal(h.sends.length, 1);
});

for (const [name, file, status] of [
  ["type interdit", new File(["texte"], "preuve.txt", { type: "text/plain" }), 400],
  ["faux PDF", new File(["pas un pdf"], "preuve.pdf", { type: "application/pdf" }), 400],
  ["fichier trop lourd", pdf("trop-lourd", 2 * 1024 * 1024), 413],
]) test(`${name} : rejet avant stockage`, async () => {
  const h = required(harness());
  const response = await h.post(form(h, {}, [pdf("positionnement")], [[0, 0, file]]));
  assert.equal(response.status, status); assert.equal(h.writes.length, 0); assert.equal(h.uploads.length, 0); assert.equal(h.sends.length, 0);
});

test("la limite totale des documents privés est vérifiée avant stockage", async () => {
  const h = required(harness());
  const response = await h.post(form(h, { submission_id: uuid(44) }, [pdf("positionnement-volumineux", 5 * 1024 / 2 * 1024)], [[0, 0, pdf("preuve-volumineuse", 1600 * 1024)]]));
  assert.equal(response.status, 413); assert.match((await response.json()).error, /ensemble des documents privés/i);
  assert.equal(h.writes.length, 0); assert.equal(h.uploads.length, 0); assert.equal(h.sends.length, 0);
});
