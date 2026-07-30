const assert = require("node:assert/strict");

function isBasketSolution(page) {
  return !!(page && page.type === "fenix_basket_page" && (page.bookSection === "solutions" || page.isSolution === true));
}

function normalizeBasketOnlyPlan(plan) {
  const mazeSolutions = [];
  const otherSolutions = [];
  const remaining = [];

  (plan || []).forEach((page) => {
    if (!page) return;
    if (page.type === "maze" || page.type === "solution") return;
    if (isBasketSolution(page) && page.sourceModule === "maze-studio") mazeSolutions.push(page);
    else if (isBasketSolution(page)) otherSolutions.push(page);
    else remaining.push(page);
  });

  let insertAt = remaining.findIndex((page) => ["congrats", "qr", "certificate", "blank"].includes(page.type));
  if (insertAt < 0) insertAt = remaining.length;
  remaining.splice(insertAt, 0, ...mazeSolutions, ...otherSolutions);
  return remaining;
}

function auditMazePairs(pages) {
  const pairs = new Map();
  let unpaired = 0;

  pages.filter((page) => page.sourceModule === "maze-studio" && page.includeInBook !== false).forEach((page) => {
    if (!page.mazePairId) {
      unpaired += 1;
      return;
    }
    if (!pairs.has(page.mazePairId)) pairs.set(page.mazePairId, { puzzles: [], solutions: [] });
    const role = page.mazePairRole === "solution" || page.isSolution ? "solutions" : "puzzles";
    pairs.get(page.mazePairId)[role].push(page);
  });

  let valid = 0;
  let broken = 0;
  pairs.forEach((pair) => {
    if (pair.puzzles.length !== 1 || pair.solutions.length !== 1) {
      broken += 1;
      return;
    }
    const puzzle = pair.puzzles[0];
    const solution = pair.solutions[0];
    const linksOk = puzzle.mazePartnerId === solution.id && solution.mazePartnerId === puzzle.id;
    if (linksOk) valid += 1;
    else broken += 1;
  });

  return { valid, broken, unpaired };
}

const plan = [
  { type: "intro" },
  { type: "maze", index: 1 },
  { type: "fenix_basket_page", sourceModule: "maze-studio", pageType: "maze", bookSection: "activities" },
  { type: "fenix_basket_page", sourceModule: "word-search-studio", pageType: "word_search", bookSection: "activities" },
  { type: "solution", index: 1 },
  { type: "fenix_basket_page", sourceModule: "word-search-studio", pageType: "word_search_solution", bookSection: "solutions", isSolution: true },
  { type: "fenix_basket_page", sourceModule: "maze-studio", pageType: "maze_solution", bookSection: "solutions", isSolution: true },
  { type: "congrats" },
  { type: "certificate" }
];

const normalized = normalizeBasketOnlyPlan(plan);
assert.equal(normalized.some((page) => page.type === "maze" || page.type === "solution"), false, "Book Builder must not generate legacy maze pages");
assert.deepEqual(
  normalized.map((page) => page.sourceModule || page.type),
  ["intro", "maze-studio", "word-search-studio", "maze-studio", "word-search-studio", "congrats", "certificate"],
  "Maze Studio solutions must come before Word Search solutions and final pages"
);

const validPairPages = [
  { id: "maze-a", sourceModule: "maze-studio", mazePairId: "pair-1", mazePairRole: "puzzle", mazePartnerId: "maze-a-solution" },
  { id: "maze-a-solution", sourceModule: "maze-studio", mazePairId: "pair-1", mazePairRole: "solution", mazePartnerId: "maze-a", isSolution: true }
];
assert.deepEqual(auditMazePairs(validPairPages), { valid: 1, broken: 0, unpaired: 0 });

const brokenPairPages = validPairPages.concat([
  { id: "orphan", sourceModule: "maze-studio", mazePairRole: "puzzle" },
  { id: "duplicate", sourceModule: "maze-studio", mazePairId: "pair-1", mazePairRole: "solution", mazePartnerId: "maze-a" }
]);
assert.deepEqual(auditMazePairs(brokenPairPages), { valid: 0, broken: 1, unpaired: 1 });

console.log("Maze Studio basket-only plan and 1:1 pair tests passed.");
