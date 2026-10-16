import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const helper = loadTypeScript("lib/server/dailyPersonalAttendance.ts");
const assessment = loadTypeScript("lib/server/dailyPersonalAssessment.ts");
const documentHtml = loadTypeScript("lib/server/dailyPosttrainingDocumentHtml.ts");
const resourceVisibility = loadTypeScript("lib/server/dailyPortalResourceVisibility.ts");
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AR1 n’ouvre le relevé personnel qu’après la date de fin à Paris", () => {
  const now = new Date("2026-10-16T00:30:00.000Z");
  assert.equal(helper.isPostsessionDownloadAvailable("2026-10-15", now), true);
  assert.equal(helper.isPostsessionDownloadAvailable("2026-10-16", now), false);
  assert.equal(helper.isPostsessionDownloadAvailable("date-invalide", now), false);
});

test("AR1 encode et valide strictement l’inscription dans l’identifiant virtuel", () => {
  const enrolmentId = "11111111-2222-4333-8444-555555555555";
  const documentId = helper.personalAttendanceDocumentId(enrolmentId);
  assert.equal(documentId, `portal:personal-attendance:${enrolmentId}`);
  assert.equal(helper.personalAttendanceEnrolmentId(documentId), enrolmentId);
  assert.equal(helper.personalAttendanceEnrolmentId("portal:personal-attendance:../../autre"), null);
});

test("AR1 exige un statut final pour chaque créneau personnel", () => {
  const slots = ["slot-1", "slot-2"];
  assert.equal(helper.attendanceIsSettled([], []), false);
  assert.equal(helper.attendanceIsSettled(slots, [{ slot_id: "slot-1", status: "present" }]), false);
  assert.equal(helper.attendanceIsSettled(slots, [{ slot_id: "slot-1", status: "present" }, { slot_id: "slot-2", status: "pending" }]), false);
  assert.equal(helper.attendanceIsSettled(slots, [{ slot_id: "slot-1", status: "present" }, { slot_id: "slot-2", status: "excused" }]), true);
});

test("AR1 produit un nom de téléchargement borné et sans caractères de contrôle", () => {
  assert.equal(helper.safePersonalDownloadName("Relevé présence — Élise"), "Releve-presence-Elise.doc");
  assert.equal(helper.safePersonalDownloadName("certificat.pdf", ".pdf"), "certificat.pdf");
});

test("la route personnelle recroise jeton, session, inscription active et identité", async () => {
  const route = await read("app/api/daily-portal/[token]/personal-attendance/route.ts");
  assert.match(route, /access\.portal_type !== "learner"/);
  assert.match(route, /\(declined,cancelled,abandoned\)/);
  assert.match(route, /enrolment\.organisation_id !== session\.organisation_id/);
  assert.match(route, /email\(learner\.email\) !== email\(access\.entity_email\)/);
  assert.match(route, /isPostsessionDownloadAvailable\(session\.end_date\)/);
  assert.match(route, /attendanceIsSettled/);
  assert.match(route, /proofHash: null/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.upload\(/);
});

test("la liste du portail n’annonce le relevé qu’après session et traitement complet", async () => {
  const resources = await read("app/api/daily-portal/[token]/resources/route.ts");
  assert.match(resources, /isPostsessionDownloadAvailable\(session\.end_date\)/);
  assert.match(resources, /attendanceIsSettled\(slotIds, ownRecords\)/);
  assert.match(resources, /personalAttendanceDocumentId\(enrolmentId\)/);
  assert.match(resources, /personal_attendance_summary/);
});

test("le téléchargement central route le relevé personnel sans modifier les fichiers historiques", async () => {
  const route = await read("app/api/daily-portal/[token]/document/route.ts");
  assert.match(route, /personalAttendanceEnrolmentId/);
  assert.match(route, /route:"personal-attendance"/);
  assert.match(route, /query:"enrolment"/);
  assert.match(route, /createSignedUrl\(document\.storage_path,120\)/);
});

test("AR1 masque le certificat personnel avant la fin de session et le borne à l’inscription active", async () => {
  const visibility = await read("lib/server/dailyPortalResourceVisibility.ts");
  assert.match(visibility, /type === "completion_certificate" && !input\.postsessionAvailable/);
  assert.match(visibility, /role === "learner" && resource\.linked_object_type === "enrolment"/);
  assert.match(visibility, /enrolmentIds\.includes\(text\(resource\.linked_object_id\)\)/);

  const resources = await read("app/api/daily-portal/[token]/resources/route.ts");
  assert.match(resources, /const postsessionAvailable = isPostsessionDownloadAvailable\(session\.end_date\)/);
  assert.match(resources, /postsessionAvailable\}\)\)/);
  assert.match(resources, /\.not\("status", "in", "\(declined,cancelled,abandoned\)"\)/);
});

test("AR1 refuse aussi un identifiant de certificat deviné avant la fin de session", async () => {
  const route = await read("app/api/daily-portal/[token]/document/route.ts");
  assert.match(route, /select\("id,organisation_id,status,end_date"\)/);
  assert.match(route, /postsessionAvailable:isPostsessionDownloadAvailable\(session\.end_date\)/);
  assert.ok(route.indexOf("isDailyPortalResourceVisible") < route.indexOf("createSignedUrl"));
});

test("AR1 applique la même règle canonique aux métadonnées du portail racine", async () => {
  const route = await read("app/api/daily-portal/[token]/route.ts");
  assert.match(route, /isDailyPortalResourceVisible/);
  assert.match(route, /activeLearnerEnrolment as JsonRecord\|null/);
  assert.match(route, /postsessionAvailable:isPostsessionDownloadAvailable\(session\.end_date\)/);
  assert.ok(route.indexOf("if(access.portal_type===\"learner\"&&!activeLearnerEnrolment)") < route.indexOf("loadLearnerDocuments(supabase,session"));
  assert.doesNotMatch(route, /if\(scope===\"organisation\"\)return true/);
});

test("AR1 refuse le certificat avant session puis l’autorise pour la seule inscription active", () => {
  const resource = {document_type:"completion_certificate",linked_object_type:"enrolment",linked_object_id:"enrolment-1",status:"published"};
  const input = {resource,role:"learner",sessionId:"session-1",enrolmentIds:["enrolment-1"]};
  assert.equal(resourceVisibility.isDailyPortalResourceVisible(input), false);
  assert.equal(resourceVisibility.isDailyPortalResourceVisible({...input,postsessionAvailable:true}), true);
  assert.equal(resourceVisibility.isDailyPortalResourceVisible({...input,enrolmentIds:["enrolment-2"],postsessionAvailable:true}), false);
});

test("Après affiche une action dédiée au certificat finalisé ou son état d’attente", async () => {
  const navigation = await read("components/daily/LearnerPhaseNavigation.tsx");
  assert.match(navigation, /resources\.find\(\(doc\) => doc\.document_type === "completion_certificate"\)/);
  assert.match(navigation, /Téléchargez votre certificat personnel finalisé/);
  assert.match(navigation, /Il sera disponible ici après la session, une fois finalisé par votre organisme/);
  assert.match(navigation, /encodeURIComponent\(completionCertificate\.id\)/);
});

test("AR1 ne publie que les résultats canoniques finalisés et horodatés", () => {
  assert.equal(assessment.isFinalAssessmentResult("achieved", "2026-10-16T09:30:00Z"), true);
  assert.equal(assessment.isFinalAssessmentResult("partially_achieved", "2026-10-16T09:30:00Z"), true);
  assert.equal(assessment.isFinalAssessmentResult("not_achieved", "2026-10-16T09:30:00Z"), true);
  assert.equal(assessment.isFinalAssessmentResult("not_applicable", "2026-10-16T09:30:00Z"), true);
  assert.equal(assessment.isFinalAssessmentResult("pending", "2026-10-16T09:30:00Z"), false);
  assert.equal(assessment.isFinalAssessmentResult("achieved", null), false);
});

test("AR1 encode strictement l’inscription du résultat personnel", () => {
  const enrolmentId = "11111111-2222-4333-8444-555555555555";
  const documentId = assessment.personalAssessmentResultDocumentId(enrolmentId);
  assert.equal(documentId, `portal:personal-assessment-result:${enrolmentId}`);
  assert.equal(assessment.personalAssessmentResultEnrolmentId(documentId), enrolmentId);
  assert.equal(assessment.personalAssessmentResultEnrolmentId("portal:personal-assessment-result:../../autre"), null);
});

test("le document personnel échappe les données et n’expose aucun détail interne", () => {
  const html = documentHtml.buildPersonalAssessmentResultHtml({
    organisationName: "OF <test>", organisationSiret: "123", organisationNda: "456",
    formationTitle: "Formation", sessionReference: "S1", learnerName: "Ada <script>",
    startDate: "2026-10-01", endDate: "2026-10-02", outcomeLabel: "Acquis",
    score: 8, scoreMax: 10, method: "Quiz & pratique", assessedAt: "2026-10-03T10:00:00Z", generatedAt: new Date("2026-10-04T10:00:00Z"),
  });
  assert.match(html, /Ada &lt;script&gt;/);
  assert.match(html, /8 \/ 10/);
  assert.match(html, /Quiz &amp; pratique/);
  assert.doesNotMatch(html, /assessed_by|notes|proofHash/);
});

test("la liste expose le résultat personnel uniquement après session et finalisation", async () => {
  const resources = await read("app/api/daily-portal/[token]/resources/route.ts");
  assert.match(resources, /daily_learning_assessments/);
  assert.match(resources, /isFinalAssessmentResult\(assessment\.outcome, assessment\.assessed_at\)/);
  assert.match(resources, /personalAssessmentResultDocumentId\(enrolmentId\)/);
  assert.match(resources, /personal_assessment_result/);
  assert.match(resources, /entityKey === `learner:\$\{text\(row\.learner_id\)\}`/);
  assert.match(resources, /\.eq\("organisation_id", session\.organisation_id\)\.eq\("session_id", session\.id\)\.in\("enrolment_id", allowedEnrolmentIds\)/);
});

test("le téléchargement central route le résultat personnel ciblé", async () => {
  const route = await read("app/api/daily-portal/[token]/document/route.ts");
  assert.match(route, /personalAssessmentResultEnrolmentId/);
  assert.match(route, /route:"personal-assessment-result"/);
  assert.match(route, /query:"enrolment"/);
});

test("la route du résultat recroise jeton, inscription, identité stable et résultat final", async () => {
  const route = await read("app/api/daily-portal/[token]/personal-assessment-result/route.ts");
  assert.match(route, /access\.portal_type !== "learner"/);
  assert.match(route, /\(declined,cancelled,abandoned\)/);
  assert.match(route, /enrolment\.organisation_id !== session\.organisation_id/);
  assert.match(route, /entityKey === `learner:\$\{text\(enrolment\.learner_id\)\}`/);
  assert.match(route, /isPostsessionDownloadAvailable\(session\.end_date\)/);
  assert.match(route, /isFinalAssessmentResult\(assessment\.outcome, assessment\.assessed_at\)/);
  assert.match(route, /select\("outcome,score,score_max,method,assessed_at"\)/);
  assert.doesNotMatch(route, /notes|assessed_by/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.upload\(/);
});

test("Après affiche le résultat finalisé ou son état d’attente", async () => {
  const navigation = await read("components/daily/LearnerPhaseNavigation.tsx");
  assert.match(navigation, /resources\.find\(\(doc\) => doc\.document_type === "personal_assessment_result"\)/);
  assert.match(navigation, /Téléchargez votre résultat personnel finalisé/);
  assert.match(navigation, /Il sera disponible après la session, une fois finalisé par votre organisme/);
  assert.match(navigation, /encodeURIComponent\(personalAssessmentResult\.id\)/);
});
