"use strict";

const assert = require("node:assert/strict");
const flow = require("../shared/fenix-production-flow.js");

function imagePage(data) {
  return Object.assign({
    width: 2550,
    height: 3300,
    mimeType: "image/png",
    blob: { testBlob: true },
    includeInBook: true
  }, data);
}

const pages = [
  imagePage({ id: "maze-1", sourceModule: "maze-studio", pageType: "maze", title: "Maze 1", basketOrder: 0, mazePairId: "m1", mazePairRole: "puzzle", mazePartnerId: "maze-1-sol", editSnapshot: { mazeData: { seed: 11 } } }),
  imagePage({ id: "maze-1-sol", sourceModule: "maze-studio", pageType: "maze_solution", title: "Maze 1 — Solution", basketOrder: 1, mazePairId: "m1", mazePairRole: "solution", mazePartnerId: "maze-1", isSolution: true, bookSection: "solutions", editSnapshot: { mazeData: { seed: 11 } } }),
  imagePage({ id: "ws-1", sourceModule: "word-search-studio", pageType: "word_search", title: "Ocean Words", basketOrder: 2, wordSearchPairId: "w1", wordSearchPairRole: "puzzle", wordSearchPartnerId: "ws-1-sol", wordSearchPairSeed: 99 }),
  imagePage({ id: "ws-1-sol", sourceModule: "word-search-studio", pageType: "word_search_solution", title: "Ocean Words — Solution", basketOrder: 3, wordSearchPairId: "w1", wordSearchPairRole: "solution", wordSearchPartnerId: "ws-1", wordSearchPairSeed: 99, isSolution: true, bookSection: "solutions" }),
  imagePage({ id: "color-1", sourceModule: "coloring-studio", pageType: "coloring", title: "Dolphin", basketOrder: 4 })
];

const settings = {
  includeIntroPages: true,
  includeMissionTracker: true,
  includeSolutions: true,
  includeCongratsPage: true,
  includeQrPage: false,
  includeCertificatePage: true,
  certificateBlankBack: true,
  includeShapeTracerPages: true,
  includeColoringPages: true,
  mazeCount: 50
};

const plan = flow.buildPlan(settings, pages);
assert.deepEqual(
  plan.map((page) => page.type === "fenix_basket_page" ? `${page.sourceModule}:${page.bookSection}` : page.type),
  [
    "intro",
    "how-to",
    "mission-tracker",
    "maze-studio:activities",
    "word-search-studio:activities",
    "coloring-studio:activities",
    "maze-studio:solutions",
    "word-search-studio:solutions",
    "congrats",
    "certificate",
    "blank"
  ]
);
assert.equal(plan.some((page) => ["maze", "solution", "shape-tracer", "coloring"].includes(page.type)), false, "Book Builder nie może generować legacy stron aktywności");
assert.equal(flow.physicalPageCount(plan), 12, "Certyfikat ma rozpocząć się na nieparzystej stronie, więc może wymagać pustej strony technicznej");

const report = flow.auditProject(settings, pages, { qrCount: 0 });
assert.equal(report.ok, true);
assert.equal(report.counts.activities, 3);
assert.equal(report.counts.solutions, 2);
assert.equal(report.counts.validPairs, 2);
assert.equal(report.counts.physicalPages, 12);

const brokenPartner = pages.map((page) => Object.assign({}, page));
brokenPartner.find((page) => page.id === "ws-1-sol").wordSearchPartnerId = "wrong-id";
const brokenReport = flow.auditProject(settings, brokenPartner, { qrCount: 0 });
assert.equal(brokenReport.ok, false);
assert.ok(brokenReport.critical.some((message) => /nieprawidłowe połączenie/i.test(message)));

const differentSeed = pages.map((page) => Object.assign({}, page));
differentSeed.find((page) => page.id === "ws-1-sol").wordSearchPairSeed = 100;
const seedReport = flow.auditProject(settings, differentSeed, { qrCount: 0 });
assert.equal(seedReport.ok, false);
assert.ok(seedReport.critical.some((message) => /różne seedy/i.test(message)));

const missingImage = pages.map((page) => Object.assign({}, page));
delete missingImage[0].blob;
const imageReport = flow.auditProject(settings, missingImage, { qrCount: 0 });
assert.equal(imageReport.ok, false);
assert.ok(imageReport.critical.some((message) => /brak obrazu PNG/i.test(message)));

const qrReport = flow.auditProject(Object.assign({}, settings, { includeQrPage: true }), pages, { qrCount: 0 });
assert.equal(qrReport.ok, false);
assert.ok(qrReport.critical.some((message) => /assetu QR/i.test(message)));

console.log("fenix-production-flow: OK");
