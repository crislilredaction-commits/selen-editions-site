import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routePath = "app/api/daily-portal/[token]/personal-attendance/route.ts";
const source = await readFile(new URL("../" + routePath, import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function makeRoute(failingRead) {
  const reads = [];
  const admin = {
    from(table) {
      let selection = "";
      const filters = {};
      const query = {
        select(value) { selection = value; return query; },
        eq(field, value) { filters[field] = value; return query; },
        neq() { return query; },
        not() { return query; },
        in() { return query; },
        is() { return query; },
        order() { return query; },
      };
      const result = () => {
        const key = table === "daily_session_enrolments"
          ? (selection === "id,learner_id,status,daily_learners(email)" ? "scope" : "enrolment")
          : table === "daily_documents"
            ? (filters.document_type === "attendance_summary" ? "publication" : "trainerSignatures")
            : ({
                daily_portal_access_tokens: "access",
                daily_sessions: "session",
                daily_attendance_slots: "slots",
                daily_attendance_records: "records",
                organisations: "organisation",
              })[table];
        reads.push(key);
        if (key === failingRead) {
          return { data: null, error: { message: "SQL secret: relation private_table does not exist", code: "42P01" } };
        }
        const data = ({
          access: { session_id: "session-1", portal_type: "learner", entity_key: "learner:learner-1", status: "pending", expires_at: "2030-01-01T00:00:00Z" },
          session: { id: "session-1", organisation_id: "of-1", end_date: "2026-10-01", daily_formations: { title: "Formation" } },
          enrolment: { id: "enrolment-1", learner_id: "learner-1", organisation_id: "of-1", session_id: "session-1", daily_learners: { email: "learner@example.test" } },
          scope: [{ id: "enrolment-1", learner_id: "learner-1" }],
          slots: [{ id: "slot-1", slot_date: "2026-10-01", starts_at: "09:00", ends_at: "12:00" }],
          records: [{ slot_id: "slot-1", status: "absent" }],
          organisation: { name: "OF de test" },
          publication: { id: "published-1" },
          trainerSignatures: [],
        })[key];
        if (data === undefined) throw Error("Unexpected table: " + table);
        return { data, error: null };
      };
      query.maybeSingle = async () => result();
      query.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
      return query;
    },
  };
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    URL, Date, Intl, Buffer, Promise, Map,
    require(name) {
      if (name === "next/server") return {
        NextResponse: { json: (payload, options) => ({
          status: options.status,
          headers: options.headers ?? {},
          json: async () => payload,
        }) },
      };
      if (name === "jspdf") return { jsPDF: class {} };
      if (name === "@/lib/server/clientNdaAccess") return { getAdminSupabase: () => admin };
      if (name === "@/lib/daily/portalAttendanceAccess.mjs") return { isActivePortalAttendanceToken: () => true };
      if (name === "@/lib/server/dailyPortalLearnerIdentity") return {
        matchesDailyLearnerPortalAccess: () => true,
        findUniqueDailyLearnerPortalEnrolment: () => ({ id: "enrolment-1" }),
      };
      if (name === "@/lib/server/dailyPersonalAttendance") return {
        attendanceIsSettled: () => true,
        isPostsessionDownloadAvailable: () => true,
        safePersonalDownloadName: () => "test.pdf",
        personalSignatureStorageObjectPath: () => null,
      };
      throw Error("Unexpected import: " + name);
    },
  }, { filename: routePath });
  return { GET: mod.exports.GET, reads };
}

for (const failingRead of [
  "access", "session", "enrolment", "scope", "slots",
  "records", "organisation", "publication", "trainerSignatures",
]) {
  test("le PDF personnel masque les détails SQL si la lecture " + failingRead + " échoue", async () => {
    const { GET, reads } = makeRoute(failingRead);
    const response = await GET(
      { url: "https://selen.example/api/daily-portal/token/personal-attendance?enrolment=enrolment-1" },
      { params: Promise.resolve({ token: "test-token" }) },
    );
    assert.equal(response.status, 500);
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.deepEqual(JSON.parse(JSON.stringify(await response.json())), {
      error: "Impossible de préparer la feuille individuelle pour le moment. Réessayez plus tard.",
    });
    assert.ok(reads.includes(failingRead), "la lecture défaillante a été simulée");
  });
}

test("la route PDF n'expose plus les messages de la base et reste en lecture seule", () => {
  assert.doesNotMatch(source, /error:\\s*(?:accessError|readError|scopeError|attendanceError)\\.message/);
  assert.doesNotMatch(source, /\\.(?:insert|update|upsert|delete|upload)\\(/);
  assert.match(source, /enrolment\\.organisation_id !== session\\.organisation_id/);
  assert.match(source, /findUniqueDailyLearnerPortalEnrolment/);
});
