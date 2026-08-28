import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const learnersPage = await readFile(new URL("../app/client/daily/apprenants/page.tsx", import.meta.url), "utf8");
const trainersPage = await readFile(new URL("../app/client/daily/formateurs/page.tsx", import.meta.url), "utf8");
const formationsManager = await readFile(new URL("../components/daily/DailyFormationsManager.tsx", import.meta.url), "utf8");
const sessionsManager = await readFile(new URL("../components/daily/DailySessionsManager.tsx", import.meta.url), "utf8");

test("le formulaire de création d'apprenant reste replié par défaut", () => {
  assert.match(learnersPage, /const\[showCreate,setShowCreate\]=useState\(false\)/);
  assert.match(learnersPage, /Créer un nouvel apprenant/);
  assert.match(learnersPage, /aria-expanded=\{showCreate\}/);
  assert.match(learnersPage, /Ajouter l’apprenant/);
  assert.match(learnersPage, /primaryButton/);
});

test("le formulaire d'ajout d'un formateur reste replié par défaut", () => {
  assert.match(trainersPage, /const \[showCreate, setShowCreate\] = useState\(false\)/);
  assert.match(trainersPage, /Ajouter un nouveau formateur/);
  assert.match(trainersPage, /aria-expanded=\{showCreate\}/);
  assert.match(trainersPage, /Ajouter le formateur/);
});

test("la création d'une formation reste repliée au-dessus du catalogue", () => {
  assert.match(formationsManager, /const \[formOpen, setFormOpen\] = useState\(false\)/);
  assert.match(formationsManager, /Créer une nouvelle formation/);
  assert.match(formationsManager, /aria-expanded=\{formOpen\}/);
  assert.match(formationsManager, /Formations déjà saisies/);
});

test("la création de session reste repliée et les sessions sont séparées par état de dossier", () => {
  assert.match(sessionsManager, /const \[formOpen, setFormOpen\] = useState\(false\)/);
  assert.match(sessionsManager, /Créer une nouvelle session/);
  assert.match(sessionsManager, /aria-expanded=\{formOpen\}/);
  assert.match(sessionsManager, /Sessions planifiées/);
  assert.match(sessionsManager, /Sessions clôturées/);
  assert.match(sessionsManager, /percentage/);
});
