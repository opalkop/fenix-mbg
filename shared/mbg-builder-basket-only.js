(function () {
  "use strict";

  if (window.FenixMbgMode === "maze-studio" || new URLSearchParams(location.search).get("fenixMode") === "maze-studio") return;
  const ownScript = document.currentScript;
  let attempts = 0;

  function loadBookBuilderWorkspace() {
    if (document.getElementById("bookBuilderWorkspaceLoader")) return;
    const script = document.createElement("script");
    script.id = "bookBuilderWorkspaceLoader";
    script.src = ownScript && ownScript.src
      ? new URL("book-builder-workspace.js?v=20260730-2", ownScript.src).href
      : "shared/book-builder-workspace.js?v=20260730-2";
    script.defer = true;
    document.head.appendChild(script);
  }

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
    document.title = "Book Builder — Fenix";
    const heading = document.querySelector("header h1");
    if (heading) heading.textContent = "Book Builder";
    const assetGroup = document.querySelector(".group-assets");
    if (assetGroup) assetGroup.hidden = true;
    const activeBlocks = document.querySelector(".active-book-blocks");
    if (activeBlocks) activeBlocks.hidden = false;
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
    const generateBox = document.querySelector(".generate-box");
    if (generateBox) {
      const firstParagraph = generateBox.querySelector("p:not(#statusText)");
      if (firstParagraph) firstParagraph.textContent = "Sprawdź bilans stron w audycie, a następnie wygeneruj finalny PDF.";
    }
    const exportDescription = document.querySelector(".group-output .card .note");
    if (exportDescription) exportDescription.textContent = "Eksport PDF składa strony początkowe, gotowe strony z Koszyka oraz wybrane strony końcowe.";
    if (!document.getElementById("mbgBasketOnlyBanner")) {
      const workflow = document.querySelector(".book-builder-workflow");
      if (workflow && workflow.parentElement) {
        const banner = document.createElement("section");
        banner.id = "mbgBasketOnlyBanner";
        banner.className = "warning";
        banner.innerHTML = "<strong>Book Builder = skład książki.</strong> Labirynty i rozwiązania 1:1 przygotuj wcześniej w Maze Studio. Tutaj trafiają wyłącznie gotowe strony z Koszyka Feniksa.";
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
  loadBookBuilderWorkspace();
  install();
})();
