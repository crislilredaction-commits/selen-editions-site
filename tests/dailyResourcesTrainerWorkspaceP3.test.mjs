import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("P3 centralizes portal visibility, includes trainer resources and enforces availability server-side",async()=>{
  const[helper,list,download]=await Promise.all([read("lib/server/dailyPortalResourceVisibility.ts"),read("app/api/daily-portal/[token]/resources/route.ts"),read("app/api/daily-portal/[token]/document/route.ts")]);
  assert.match(helper,/trainer_resource/);assert.match(helper,/available_from/);assert.match(helper,/role === "enterprise"/);assert.match(helper,/text\(resource\.session_id\) !== sessionId/);assert.match(list,/isDailyPortalResourceVisible/);assert.match(download,/isDailyPortalResourceVisible/);assert.match(download,/createSignedUrl\(document\.storage_path,120\)/);
});

test("P3 trainer imports are traceable, scheduled, consultable and restricted to assigned sessions",async()=>{
  const[route,context,download,page]=await Promise.all([read("app/api/client/daily/trainer-session-workspace/route.ts"),read("lib/server/dailyTrainerWorkspaceContext.ts"),read("app/api/client/daily/trainer-session-workspace/document/route.ts"),read("app/client/daily/formateur/suivi-sessions/page.tsx")]);
  assert.match(context,/trainer_ids/);assert.match(download,/getAssignedDailyTrainerSession/);assert.match(download,/\.eq\("organisation_id",context\.orgId\)/);assert.match(route,/available_from/);assert.match(route,/trainer_profile_id/);assert.match(route,/status:kind==="resource"\?"published":"active"/);assert.match(page,/Disponible à partir de/);assert.match(page,/trainer-session-workspace\/document/);assert.match(page,/status==="present"/);assert.match(page,/trainer_name/);
});

test("P3 delegated consultation remains read-only, scoped and logged",async()=>{
  const[page,download]=await Promise.all([read("app/daily/assistance/portail/[accessId]/page.tsx"),read("app/daily/assistance/portail/[accessId]/document/route.ts")]);
  assert.match(page,/isDailyPortalResourceVisible/);assert.match(page,/Ressources disponibles/);assert.match(download,/portal_access_id/);assert.match(download,/\.eq\("organisation_id",assistance\.organisation_id\)/);assert.match(download,/delegated_portal_document_viewed/);
});
