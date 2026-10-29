import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bureau = readFileSync(new URL("../app/client/page.tsx", import.meta.url), "utf8");
const dailyOnboarding = readFileSync(
  new URL("../app/client/daily/onboarding/page.tsx", import.meta.url),
  "utf8",
);

test("le Bureau conserve le paramétrage Daily à côté de l'accès au service acheté", () => {
  const dailyGuard = bureau.indexOf("{hasDailyAccess ? (");
  const serviceAccess = bureau.indexOf('withAssistanceToken("/client/daily")', dailyGuard);
  const setupAccess = bureau.indexOf(
    'withAssistanceToken("/client/daily/onboarding")',
    dailyGuard,
  );
  const endOfDailyCard = bureau.indexOf(") : null}", setupAccess);

  assert.ok(dailyGuard >= 0, "la carte Daily doit rester conditionnée par hasDailyAccess");
  assert.ok(serviceAccess > dailyGuard, "l'accès principal Daily doit rester dans la carte achetée");
  assert.ok(setupAccess > serviceAccess, "le paramétrage doit être proposé à côté de l'accès Daily");
  assert.ok(setupAccess < endOfDailyCard, "le paramétrage ne doit pas sortir du garde d'achat Daily");
  assert.match(bureau.slice(serviceAccess, endOfDailyCard), /Paramétrage initial/);
});

test("le paramétrage Daily reste accessible après un onboarding terminé", () => {
  assert.match(
    dailyOnboarding,
    /status: form\.status === "completed" \? "completed" : "in_progress"/,
  );
  assert.match(dailyOnboarding, /if \(payload\?\.onboarding\)/);
  assert.doesNotMatch(
    dailyOnboarding,
    /if \([^\n]*status[^\n]*completed[^\n]*\)[\s\S]{0,120}router\.(?:push|replace)\("\/client\/daily"\)/,
  );
});

test("le Bureau ne fabrique pas de parcours de paramétrage parallèles pour les autres prestations", () => {
  assert.doesNotMatch(bureau, /\/client\/preaudit\/onboarding/);
  assert.doesNotMatch(bureau, /\/client\/audit-blanc\/onboarding/);
  assert.doesNotMatch(bureau, /\/client\/dossier\/onboarding/);
});
