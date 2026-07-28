(function () {
  "use strict";

  function getSourceLabel(sourceModule) {
    if (sourceModule === "complete-picture") return "Complete the Picture";
    if (sourceModule === "coloring-studio") return "Coloring Studio";
    if (sourceModule === "tracing-studio") return "Tracing Studio";
    if (sourceModule === "matching-studio") return "Matching Studio";
    if (sourceModule === "alphabet-studio") return "Alphabet Studio";
    if (sourceModule === "math-studio") return "Math Studio";
    if (sourceModule === "dot-to-dot-studio") return "Dot to Dot Studio";
    if (sourceModule === "hidden-objects-studio") return "Hidden Objects Studio";
    if (sourceModule === "logic-studio") return "Logic Studio";
    if (sourceModule === "direct-png") return "Import PNG";
    return sourceModule || "Inne / import";
  }

  function createEmptySummary() {
    return {
      available: true,
      total: 0,
      bySource: {},
      labels: {
        "complete-picture": "Complete the Picture",
        "coloring-studio": "Coloring Studio",
        "tracing-studio": "Tracing Studio",
        "matching-studio": "Matching Studio",
        "alphabet-studio": "Alphabet Studio",
        "math-studio": "Math Studio",
        "dot-to-dot-studio": "Dot to Dot Studio",
        "hidden-objects-studio": "Hidden Objects Studio",
        "logic-studio": "Logic Studio",
        other: "Inne / import"
      },
      error: ""
    };
  }

  function loadBasketApi() {
    if (window.FenixBasket) return Promise.resolve(window.FenixBasket);

    return new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[data-fenix-basket-core]');
      if (existing) {
        existing.addEventListener("load", function () {
          if (window.FenixBasket) resolve(window.FenixBasket);
          else reject(new Error("Nie udało się uruchomić współdzielonego API Koszyka Feniksa."));
        }, { once: true });
        existing.addEventListener("error", function () {
          reject(new Error("Nie udało się wczytać shared/fenix-basket.js."));
        }, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "shared/fenix-basket.js";
      script.async = false;
      script.dataset.fenixBasketCore = "true";
      script.onload = function () {
        if (window.FenixBasket) resolve(window.FenixBasket);
        else reject(new Error("Nie udało się uruchomić współdzielonego API Koszyka Feniksa."));
      };
      script.onerror = function () {
        reject(new Error("Nie udało się wczytać shared/fenix-basket.js."));
      };
      document.head.appendChild(script);
    });
  }

  function loadMbgWorkspaceShell() {
    const path = String(window.location.pathname || "").toLowerCase();
    if (!path.endsWith("/mbg.html") && !path.endsWith("mbg.html")) return;
    if (document.querySelector('script[data-mbg-unified-shell]')) return;

    const script = document.createElement("script");
    script.src = "shared/mbg-unified-shell.js";
    script.async = false;
    script.dataset.mbgUnifiedShell = "true";
    document.head.appendChild(script);
  }

  async function getFenixBasketSummary() {
    const summary = createEmptySummary();

    try {
      const basket = await loadBasketApi();
      const pages = await basket.getAllPages();

      pages.forEach(function (page) {
        const sourceModule = page.sourceModule || "other";
        const known = summary.labels[sourceModule] ? sourceModule : "other";
        summary.total += 1;
        summary.bySource[known] = (summary.bySource[known] || 0) + 1;
        if (!summary.labels[known]) summary.labels[known] = getSourceLabel(sourceModule);
      });
    } catch (error) {
      summary.available = false;
      summary.error = error && error.message ? error.message : "Koszyk Feniksa jest niedostępny.";
    }

    return summary;
  }

  function renderFenixBasketStatus(node, summary) {
    if (!node) return;
    node.textContent = "";
    node.classList.toggle("is-empty", !summary.total);
    node.classList.toggle("is-error", !summary.available);

    const title = document.createElement("strong");
    title.textContent = "Koszyk Feniksa";
    node.appendChild(title);

    if (!summary.available) {
      const error = document.createElement("span");
      error.textContent = summary.error || "Koszyk Feniksa jest niedostępny.";
      node.appendChild(error);
      return;
    }

    if (!summary.total) {
      const empty = document.createElement("span");
      empty.textContent = "Koszyk Feniksa jest pusty.";
      node.appendChild(empty);
      return;
    }

    const total = document.createElement("span");
    total.textContent = "Razem: " + summary.total + " stron";
    node.appendChild(total);

    ["complete-picture", "coloring-studio", "tracing-studio", "matching-studio", "alphabet-studio", "math-studio", "dot-to-dot-studio", "hidden-objects-studio", "logic-studio", "other"].forEach(function (source) {
      const count = summary.bySource[source] || 0;
      if (!count && source === "other") return;
      const item = document.createElement("span");
      item.textContent = summary.labels[source] + ": " + count;
      node.appendChild(item);
    });
  }

  async function refreshFenixBasketStatusWidgets() {
    const nodes = Array.from(document.querySelectorAll("[data-fenix-basket-status]"));
    if (!nodes.length) return createEmptySummary();
    const summary = await getFenixBasketSummary();
    nodes.forEach(function (node) {
      renderFenixBasketStatus(node, summary);
    });
    return summary;
  }

  window.FenixBasketStatus = {
    getFenixBasketSummary: getFenixBasketSummary,
    refresh: refreshFenixBasketStatusWidgets,
    getSourceLabel: getSourceLabel,
    loadBasketApi: loadBasketApi
  };
  window.getFenixBasketSummary = getFenixBasketSummary;
  window.refreshFenixBasketStatusWidgets = refreshFenixBasketStatusWidgets;

  loadMbgWorkspaceShell();
  document.addEventListener("DOMContentLoaded", refreshFenixBasketStatusWidgets);
  window.addEventListener("focus", refreshFenixBasketStatusWidgets);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refreshFenixBasketStatusWidgets();
  });
})();