"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "mbg.js"), "utf8");
const testSource = source + `
  MBG.assetLibrary.assets = [
    { id: "heart", categoryId: "shapes", img: { id: "heart" } },
    { id: "cloud", categoryId: "shapes", img: { id: "cloud" } },
    { id: "trophy", categoryId: "symbols", img: { id: "trophy" } }
  ];

  const ids = values => values.map(value => value.id);
  const selected = { shapeTracerSelectedAssetIds: ["heart", "trophy"] };
  assert.deepEqual(ids(getAssetLibraryTraceAssets("svg-library", selected)), ["heart", "trophy"]);
  assert.deepEqual(ids(getAssetLibraryTraceAssets("svg-shapes", selected)), ["heart", "trophy"]);
  assert.deepEqual(ids(getAssetLibraryTraceAssets("svg-symbols", selected)), ["heart", "trophy"]);

  const empty = { shapeTracerSelectedAssetIds: [] };
  assert.deepEqual(ids(getAssetLibraryTraceAssets("svg-library", empty)), ["heart", "cloud", "trophy"]);
  assert.deepEqual(ids(getAssetLibraryTraceAssets("svg-shapes", empty)), ["heart", "cloud"]);
  assert.deepEqual(ids(getAssetLibraryTraceAssets("svg-symbols", empty)), ["trophy"]);

  [1, 2, 3, 4].forEach(count => {
    assert.equal(getShapeTracerItemsPerPage({ shapeTracerItemsPerPage: String(count) }), count);
    assert.equal(getShapeTracerLayoutCells({ x: 0, y: 0, w: 1000, h: 1000 }, count, "single").length, count);
  });
  assert.equal(getShapeTracerLayoutCells({ x: 0, y: 0, w: 1000, h: 1000 }, 4, "2-rows").length, 4);

  const sequential = {
    shapeTracerSelectedAssetIds: [],
    shapeTracerAssetSelectionMode: "sequential"
  };
  assert.deepEqual(ids(pickShapeTracerImages(sequential, 1, "svg-library", 2)), ["heart", "cloud"]);
  assert.deepEqual(ids(pickShapeTracerImages(sequential, 2, "svg-library", 2)), ["trophy", "heart"]);

  const noRepeat = {
    shapeTracerSelectedAssetIds: [],
    shapeTracerAssetSelectionMode: "random-no-repeat"
  };
  const firstCycle = pickShapeTracerImages(noRepeat, 1, "svg-library", 3);
  assert.equal(new Set(ids(firstCycle)).size, 3);
  const secondCycle = pickShapeTracerImages(noRepeat, 2, "svg-library", 3);
  assert.equal(new Set(ids(secondCycle)).size, 3);

  let contoursDrawn = 0;
  buildOriginalMaskContourSegments = () => ({ segments: [[{ x: 0, y: 0 }]], center: { x: 0, y: 0 } });
  drawSmoothMaskOutlinePath = () => { contoursDrawn++; };
  const ctx = { save() {}, restore() {}, setLineDash() {} };
  [1, 2, 4].forEach(count => {
    contoursDrawn = 0;
    drawAssetShapeTracer(ctx, {
      shapeTracerItemsPerPage: String(count),
      shapeTracerLayout: "single",
      shapeTracerSelectedAssetIds: [],
      shapeTracerAssetSelectionMode: "sequential",
      generatedTraceScale: 1,
      maskThreshold: 128,
      shapeTracerOpacity: 0.7,
      shapeTracerLineThickness: 8,
      shapeTracerLineStyle: "dashed"
    }, { x: 0, y: 0, w: 1000, h: 1000 }, 1, "svg-library");
    assert.equal(contoursDrawn, count);
  });
`;

const sandbox = {
  assert,
  console,
  document: {
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; }
  },
  window: {},
  Image: function Image() {}
};

vm.runInNewContext(testSource, sandbox, { filename: "mbg.js" });
console.log("shape-tracer-assets: OK");
