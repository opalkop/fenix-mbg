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
  function cleanupUi() {
    const activeBlocks = document.querySelector(".active-book-blocks");
    if (activeBlocks) activeBlocks.hidden = true;
    const basketControl = document.getElementById("fenixBasketEnabled");
    if (basketControl) {
      basketControl.value = "true";
      basketControl.disabled = true;
      basketControl.dispatchEvent(new Event("change", { bubbles: true }));
      const host = basketControl.closest(".mbg-option-card") || basketControl.parentElement;
      if (host) {
        const status = host.querySelector(".mbg-option-description");
        if (status) status.textContent = "Book Builder zawsze składa gotowe strony z Koszyka Feniksa.";
      }
    }
    const previewType = document.getElementById("previewPageType");
    if (previewType) {
      const mazeOnly = previewType.querySelector('option[value="maze-only"]');
      if (mazeOnly) mazeOnly.remove();
      if (previewType.value === "maze-only") previewType.value = "mixed";
    }
    if (!document.getElementById("mbgBasketOnlyBanner")) {
      const workflow = document.querySelector(".book-builder-workflow");
      if (workflow && workflow.parentElement) {
        const banner = document.createElement("section");
        banner.id = "mbgBasketOnlyBanner";
        banner.className = "warning";
        banner.innerHTML = '<strong>Book Builder = skład książki.</strong> Labirynty i rozwiązania 1:1 twórz w <a href="modules/maze-studio/maze-studio.html">Maze Studio</a>. Tutaj trafiają wyłącznie gotowe strony z Koszyka Feniksa.';
        workflow.insertAdjacentElement("afterend", banner);
      }
    }
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
    cleanupUi();
    window.normalizeFenixBasketOnlyBookPlan = normalizePlan;
    if (window.FenixBookAudit && window.FenixBookAudit.refresh) window.FenixBookAudit.refresh();
    console.info("FENIX Book Builder: tryb składania wyłącznie z Koszyka aktywny.");
  }
  install();
})();