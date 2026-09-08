import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/qualiopiNovember2026.ts", import.meta.url), "utf8");

function indicatorBlock(number, nextNumber) {
  const end = nextNumber ? `number: ${nextNumber}` : `] as const;`;
  const pattern = new RegExp(`number: ${number},([\\s\\S]*?)${end.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`);
  const match = source.match(pattern);
  assert.ok(match, `bloc indicateur ${number} introuvable`);
  return match[1];
}

test("la bascule réglementaire est fixée au 1er novembre 2026 et sourcée sur Légifrance", () => {
  assert.match(source, /QUALIOPI_NOVEMBER_2026_EFFECTIVE_ON = "2026-11-01"/);
  assert.match(source, /Décret n° 2026-728 du 1er août 2026/);
  assert.match(source, /legifrance\.gouv\.fr\/eli\/decret\/2026\/8\/1\/2026-728\/jo\/texte/);
});

test("les indicateurs 12, 19, 27 et 32 restent transversaux aux quatre catégories d'actions", () => {
  for (const [number, next] of [[12, 19], [19, 27], [27, 32], [32, 33]]) {
    const block = indicatorBlock(number, next);
    assert.match(block, /appliesTo: ALL_ACTIVITIES/);
  }
});

test("l'indicateur 33 est borné à l'apprentissage et ne devient pas une obligation générale Daily", () => {
  const block = indicatorBlock(33, null);
  assert.match(block, /appliesTo: \["apprenticeship"\]/);
  assert.doesNotMatch(block, /appliesTo: ALL_ACTIVITIES/);
  assert.match(block, /distincte de la satisfaction générale/);
  assert.match(block, /partage des résultats avec les équipes pédagogiques/);
  assert.match(block, /mesure périodique de son efficacité/);
});

test("les ajouts matériels du décret sont conservés dans la source canonique", () => {
  assert.match(indicatorBlock(12, 19), /violences sexistes et sexuelles/);
  assert.match(indicatorBlock(19, 27), /effectivité du suivi/);
  assert.match(indicatorBlock(19, 27), /seuil fixé par arrêté/);
  assert.match(indicatorBlock(27, 32), /traçabilité dans les contrats/);
  assert.match(indicatorBlock(32, 33), /analyse des risques/);
});
