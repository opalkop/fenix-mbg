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

console.log("book-builder-solution-order: OK");
