import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("les préférences de rappel Daily restent portées par l'organisme", async () => {
  const route = await read("app/api/client/daily/reminder-preferences/route.ts");
  assert.match(route, /from\("organisations"\)/);
  assert.match(route, /daily_task_reminder_mode,daily_task_digest_hour/);
  assert.match(route, /daily_task_reminder_mode:mode,daily_task_digest_hour:7/);
  assert.match(route, /body\.mode===\"immediate\"/);
  assert.match(route, /body\.mode===\"daily_digest\"/);
});

test("seul un profil habilité à gérer l'organisme peut modifier la préférence", async () => {
  const route = await read("app/api/client/daily/reminder-preferences/route.ts");
  assert.match(route, /capabilities\.legal_profile/);
  assert.match(route, /Accès au profil de l.organisme requis/);
  assert.match(route, /status:403/);
});

test("Mon compte expose les deux modes de rappel prévus par la recette", async () => {
  const account = await read("app/client/daily/mon-compte/page.tsx");
  const component = await read("components/daily/DailyReminderPreferences.tsx");
  assert.match(account, /DailyReminderPreferences/);
  assert.match(component, /Au fil de l'eau/);
  assert.match(component, /Une fois par jour à 7 h/);
  assert.match(component, /Aucun email si tout est à jour/);
  assert.match(component, /\/api\/client\/daily\/reminder-preferences/);
});

test("le schéma conserve un mode explicite et le digest à 7 h par défaut", async () => {
  const migration = await read("supabase/migrations/20260828020417_daily_quality_watch_and_reminder_preferences.sql");
  assert.match(migration, /daily_task_reminder_mode text not null default 'daily_digest'/);
  assert.match(migration, /check \(daily_task_reminder_mode in \('immediate', 'daily_digest'\)\)/);
  assert.match(migration, /daily_task_digest_hour smallint not null default 7/);
});
