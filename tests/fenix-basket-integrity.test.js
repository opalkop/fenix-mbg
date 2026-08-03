"use strict";

const assert = require("node:assert/strict");
const integrity = require("../shared/fenix-basket-integrity.js");

let counter = 0;
function nextId(prefix) {
  counter += 1;
  return `${prefix}-${counter}`;
}

const existing = [
  {
    id: "maze-a",
    sourceModule: "maze-studio",
    mazePairId: "pair-1",
    mazePairRole: "puzzle",
    mazePartnerId: "maze-a-solution",
    basketOrder: 10
  },
  {
    id: "maze-a-solution",
    sourceModule: "maze-studio",
    mazePairId: "pair-1",
    mazePairRole: "solution",
    mazePartnerId: "maze-a",
    isSolution: true,
    basketOrder: 11
  }
];

const imported = [
  {
    id: "maze-a",
    sourceModule: "maze-studio",
    mazePairId: "pair-1",
    mazePairRole: "puzzle",
    mazePartnerId: "maze-a-solution",
    editSnapshot: { mazePairId: "pair-1", mazePairRole: "puzzle", mazePartnerId: "maze-a-solution" }
  },
  {
    id: "maze-a-solution",
    sourceModule: "maze-studio",
    mazePairId: "pair-1",
    mazePairRole: "solution",
    mazePartnerId: "maze-a",
    isSolution: true,
    editSnapshot: { mazePairId: "pair-1", mazePairRole: "solution", mazePartnerId: "maze-a" }
  }
];

const appended = integrity.prepareImportedPages(existing, imported, { mode: "append", createId: nextId });
assert.equal(appended.pages.length, 2);
assert.notEqual(appended.pages[0].id, "maze-a");
assert.notEqual(appended.pages[1].id, "maze-a-solution");
assert.notEqual(integrity.getPairId(appended.pages[0]), "pair-1");
assert.equal(integrity.getPairId(appended.pages[0]), integrity.getPairId(appended.pages[1]));
assert.equal(integrity.getPartnerId(appended.pages[0]), appended.pages[1].id);
assert.equal(integrity.getPartnerId(appended.pages[1]), appended.pages[0].id);
assert.equal(appended.pages[0].editSnapshot.mazePartnerId, appended.pages[1].id);
assert.equal(appended.pages[1].editSnapshot.mazePartnerId, appended.pages[0].id);
assert.equal(appended.pages[0].basketOrder, 12);
assert.equal(appended.pages[1].basketOrder, 13);
assert.equal(appended.report.repairedPairs, 1);
assert.equal(appended.report.brokenPairs, 0);
assert.equal(appended.report.remappedIds, 2);
assert.equal(appended.report.remappedPairIds, 1);

const staleReplace = [
  {
    id: "ws-puzzle",
    sourceModule: "word-search-studio",
    wordSearchPairId: "word-pair",
    wordSearchPairRole: "puzzle",
    wordSearchPartnerId: "old-solution"
  },
  {
    id: "ws-solution",
    sourceModule: "word-search-studio",
    wordSearchPairId: "word-pair",
    wordSearchPairRole: "solution",
    wordSearchPartnerId: "old-puzzle",
    isSolution: true
  }
];
const replaced = integrity.prepareImportedPages([], staleReplace, { mode: "replace", createId: nextId });
assert.equal(integrity.getPartnerId(replaced.pages[0]), "ws-solution");
assert.equal(integrity.getPartnerId(replaced.pages[1]), "ws-puzzle");
assert.equal(replaced.pages[0].bookSection, "activities");
assert.equal(replaced.pages[1].bookSection, "solutions");
assert.equal(replaced.report.repairedPairs, 1);

const broken = integrity.prepareImportedPages([], [
  { id: "orphan", sourceModule: "maze-studio", mazePairId: "orphan-pair", mazePairRole: "puzzle" }
], { mode: "replace", createId: nextId });
assert.equal(broken.report.brokenPairs, 1);

console.log("fenix-basket-integrity: OK");
