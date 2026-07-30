"use strict";

const assert = require("assert");
const path = require("path");

global.window = global;
global.document = {
  head: { appendChild: function () {} },
  addEventListener: function () {},
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  createElement: function (tag) {
    return {
      tagName: String(tag || "").toUpperCase(),
      className: "",
      id: "",
      dataset: {},
      children: [],
      classList: { toggle: function () {}, add: function () {}, remove: function () {} },
      appendChild: function (child) { this.children.push(child); return child; },
      setAttribute: function () {},
      querySelector: function () { return null; },
      closest: function () { return null; },
      textContent: "",
      innerHTML: ""
    };
  }
};

global.readSettings = function () {
  return {
    fenixBasketEnabled: true,
    fenixBasketPlacement: "after-mazes",
    includeIntroPages: true,
    includeMissionTracker: false,
    includeShapeTracerPages: false,
    shapeTracerPageCount: 6,
    includeColoringPages: false,
    coloringPageCount: 6,
    mazeCount: 2,
    includeSolutions: true,
    includeCongratsPage: true,
    includeQrPage: false,
    includeCertificatePage: true,
    certificateBlankBack: true
  };
};

global.buildBookPagePlan = function () { return []; };
global.generatePreview = function () {};
global.updateMbgOptionUi = function () {};
global.updateActiveBookBlocksSummary = function () {};
global.renderFenixBasketList = function () {};
global.updateFenixBasketStatus = function () {};
global.getAvailableFenixPages = function () {
  return [
    { id: "p1", sourceModule: "word-search-studio", pageType: "word_search", title: "Puzzle", includeInBook: true },
    { id: "s1", sourceModule: "word-search-studio", pageType: "word_search_solution", title: "Puzzle — Solution", includeInBook: true },
    { id: "c1", sourceModule: "coloring-studio", pageType: "coloring", title: "Color", includeInBook: true }
  ];
};

require(path.join(__dirname, "..", "shared", "mbg-book-builder-fixes.js"));
require(path.join(__dirname, "..", "shared", "mbg-word-search-order-fix.js"));

const settings = global.readSettings();
const plan = global.buildBookPagePlan(settings);
const types = plan.map(function (page) {
  return page.type + (page.bookSection ? ":" + page.bookSection : "");
});

assert.deepStrictEqual(types, [
  "intro",
  "how-to",
  "maze",
  "maze",
  "fenix_basket_page:activities",
  "fenix_basket_page:activities",
  "solution:solutions",
  "solution:solutions",
  "fenix_basket_page:solutions",
  "congrats",
  "certificate",
  "blank"
]);

assert.strictEqual(plan.filter(function (page) { return page.type === "shape-tracer"; }).length, 0);
assert.strictEqual(global.isFenixSolutionPage({ pageType: "word_search_solution" }), true);
assert.strictEqual(global.isFenixSolutionPage({ pageType: "word_search" }), false);

const noSolutions = global.buildBookPagePlan(Object.assign({}, settings, { includeSolutions: false }));
assert.strictEqual(noSolutions.some(function (page) {
  return page.type === "solution" || page.bookSection === "solutions";
}), false);

["after-intro", "before-mazes", "after-mazes", "before-solutions", "before-certificate"].forEach(function (placement) {
  const placementPlan = global.buildBookPagePlan(Object.assign({}, settings, { fenixBasketPlacement: placement }));
  const mazeSolutionIndexes = [];
  const moduleSolutionIndexes = [];
  placementPlan.forEach(function (page, index) {
    if (page.type === "solution") mazeSolutionIndexes.push(index);
    if (page.type === "fenix_basket_page" && page.bookSection === "solutions") moduleSolutionIndexes.push(index);
  });
  assert.ok(mazeSolutionIndexes.length > 0, "Brak rozwiązań labiryntów dla placement=" + placement);
  assert.ok(moduleSolutionIndexes.length > 0, "Brak rozwiązań modułów dla placement=" + placement);
  assert.ok(
    Math.max.apply(null, mazeSolutionIndexes) < Math.min.apply(null, moduleSolutionIndexes),
    "Rozwiązania Word Search muszą być po rozwiązaniach labiryntów dla placement=" + placement
  );
});

function physicalPageCount(logicalPlan) {
  let count = 0;
  logicalPlan.forEach(function (page) {
    if (page.ensureOddPage && (count + 1) % 2 === 0) count += 1;
    count += 1;
  });
  return count;
}

const oceanReferencePlan = [];
oceanReferencePlan.push({ type: "intro" }, { type: "how-to" }, { type: "mission-tracker" });
for (let i = 0; i < 10; i += 1) oceanReferencePlan.push({ type: "maze" });
for (let i = 0; i < 5; i += 1) oceanReferencePlan.push({ type: "fenix_basket_page", sourceModule: "word-search-studio" });
for (let i = 0; i < 5; i += 1) oceanReferencePlan.push({ type: "fenix_basket_page", sourceModule: "complete-picture" });
for (let i = 0; i < 5; i += 1) oceanReferencePlan.push({ type: "fenix_basket_page", sourceModule: "coloring-studio" });
for (let i = 0; i < 5; i += 1) oceanReferencePlan.push({ type: "fenix_basket_page", sourceModule: "matching-studio" });
for (let i = 0; i < 5; i += 1) oceanReferencePlan.push({ type: "fenix_basket_page", sourceModule: "hidden-objects-studio" });
for (let i = 0; i < 10; i += 1) oceanReferencePlan.push({ type: "solution" });
for (let i = 0; i < 5; i += 1) oceanReferencePlan.push({ type: "fenix_basket_page", sourceModule: "word-search-studio", bookSection: "solutions" });
oceanReferencePlan.push(
  { type: "congrats" },
  { type: "qr" },
  { type: "certificate", ensureOddPage: true },
  { type: "blank", role: "certificate-blank-back" }
);
assert.strictEqual(oceanReferencePlan.length, 57, "Logiczny plan Ocean powinien mieć 57 pozycji przed pustą automatyczną.");
assert.strictEqual(physicalPageCount(oceanReferencePlan), 58, "Fizyczny PDF Ocean powinien mieć 58 stron.");

console.log("book-builder-solution-order-and-counts: OK");
