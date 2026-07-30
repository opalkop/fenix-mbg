(function () {
  "use strict";

  if (window.FenixMbgMode === "maze-studio" || new URLSearchParams(location.search).get("fenixMode") === "maze-studio") return;
  let attempts = 0;

  function isBasketSolution(page) {
    return !!(page && page.type === "fenix_basket_page" && (page.bookSection === "solutions" || page.isSolution === true));
  }
  function isMazeStudioSolution(page) {
    return isBasketSolution(page) && page.sourceModule === "maze-studio";
  }
  function normalizePlan(plan) {
    const pages = Array.isArray(plan) ? plan : [];
    const mazeSolutions = [];
    const otherSolutions = [];
    const remaining = [];
    pages.forEach(function (page) {
      if (!page) return;
      if (page.type === "maze" || page.type === "solution") return;
      if (isMazeStudioSolution(page)) mazeSolutions.push(page);
      else if (isBasketSolution(page)) otherSolutions.push(page);
      else remaining.push(page);
    });
    let insertAt = remaining.findIndex(function (page) {
      return page && ["congrats", "qr", "certificate", "blank"].includes(page.type);
    });
    if (insertAt < 0) insertAt = remaining.length;
    remaining.splice.apply(remaining, [insertAt, 0].concat(mazeSolutions, otherSolutions));
    return remaining;
  }
  function mazePuzzleCount() {
    if (typeof window.getAvailableFenixPages !== "function") return 0;
    return (window.getAvailableFenixPages() || []).filter(function (page) {
      return page && page.includeInBook !== false && page.sourceModule === "maze-studio" && page.pageType !== "maze_solution" && page.isSolution !== true;
    }).length;
  }
  function patchPlanner(name) {
    const original = window[name];
    if (typeof original !== "function" || original.__fenixBasketOnlyPatched) return;
    const patched = function () { return normalizePlan(original.apply(this, arguments)); };
    patched.__fenixBasketOnlyPatched = true;
    patched.__fenixBasketOnlyOriginal = original;
    window[name] = patched;
  }
  function patchSettings() {
    const original = window.readSettings;
    if (typeof original !== "function" || original.__fenixBasketOnlyPatched) return;
    const patched = function () {
      const settings = original.apply(this, arguments);
      settings.mazeCount = mazePuzzleCount();
      settings.internalMazeGeneratorDisabled = true;
      return settings;
    };
    patched.__fenixBasketOnlyPatched = true;
    patched.__fenixBasketOnlyOriginal = original;
    window.readSettings = patched;
  }
  function install() {
    attempts += 1;
    if (typeof window.buildBookPagePlan !== "function" || typeof window.readSettings !== "function") {
      if (attempts < 160) setTimeout(install, 50);
      return;
    }
    patchSettings();
    patchPlanner("buildBookPagePlan");
    patchPlanner("buildPreviewPagePlan");
    patchPlanner("buildMixedPreviewPages");
    window.normalizeFenixBasketOnlyBookPlan = normalizePlan;
    if (window.FenixBookAudit && window.FenixBookAudit.refresh) window.FenixBookAudit.refresh();
    console.info("FENIX Book Builder: tryb składania wyłącznie z Koszyka aktywny.");
  }
  install();
})();