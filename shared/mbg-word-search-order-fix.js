(function () {
  "use strict";

  const VERSION = "2026.07.30-4";
  let attempts = 0;

  function normalizeSolutionOrder(plan) {
    const pages = Array.isArray(plan) ? plan : [];
    const mazeSolutions = [];
    const moduleSolutions = [];
    const remaining = [];

    pages.forEach(function (page) {
      if (page && page.type === "solution") mazeSolutions.push(page);
      else if (page && page.type === "fenix_basket_page" && (page.bookSection === "solutions" || page.isSolution === true)) moduleSolutions.push(page);
      else remaining.push(page);
    });

    if (!mazeSolutions.length && !moduleSolutions.length) return pages;

    let insertAt = remaining.findIndex(function (page) {
      return page && ["congrats", "qr", "certificate", "blank"].includes(page.type);
    });
    if (insertAt < 0) insertAt = remaining.length;
    remaining.splice.apply(remaining, [insertAt, 0].concat(mazeSolutions, moduleSolutions));
    return remaining;
  }

  function patchPlanner(name) {
    const original = window[name];
    if (typeof original !== "function" || original.__fenixWordSearchOrderPatched) return;
    const patched = function () {
      return normalizeSolutionOrder(original.apply(this, arguments));
    };
    patched.__fenixWordSearchOrderPatched = true;
    patched.__fenixWordSearchOrderOriginal = original;
    window[name] = patched;
  }

  function install() {
    attempts += 1;
    if (typeof window.buildBookPagePlan !== "function") {
      if (attempts < 100) window.setTimeout(install, 50);
      return;
    }

    patchPlanner("buildBookPagePlan");
    patchPlanner("buildPreviewPagePlan");
    patchPlanner("buildMixedPreviewPages");

    const oldBadge = document.getElementById("wordSearchOrderFixBadge");
    if (oldBadge) oldBadge.remove();

    window.normalizeFenixSolutionOrder = normalizeSolutionOrder;
    if (typeof window.updateMbgOptionUi === "function") window.updateMbgOptionUi();
    console.info("FENIX solution order active:", VERSION);
  }

  install();
})();
