(function () {
  "use strict";

  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;

  function openBasketDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB nie jest dostępny w tej przeglądarce."));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("Błąd otwarcia Koszyka Feniksa."));
      };
    });
  }

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

  async function getFenixBasketSummary() {
    const summary = createEmptySummary();
    let db;

    try {
      db = await openBasketDb();
      await new Promise(function (resolve, reject) {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();

        request.onsuccess = function () {
          const cursor = request.result;
          if (!cursor) return;

          const page = cursor.value || {};
          const sourceModule = page.sourceModule || "other";
          const key = sourceModule === "complete-picture" || sourceModule === "coloring-studio" || sourceModule === "tracing-studio" || sourceModule === "matching-studio" || sourceModule === "alphabet-studio" || sourceModule === "math-studio" || sourceModule === "dot-to-dot-studio" || sourceModule === "hidden-objects-studio" || sourceModule === "logic-studio"
            ? sourceModule
            : "other";
          summary.total += 1;
          summary.bySource[key] = (summary.bySource[key] || 0) + 1;
          if (!summary.labels[key]) summary.labels[key] = getSourceLabel(sourceModule);
          cursor.continue();
        };

        request.onerror = function () {
          reject(request.error || new Error("Błąd odczytu Koszyka Feniksa."));
        };
        transaction.oncomplete = resolve;
        transaction.onerror = function () {
          reject(transaction.error || new Error("Błąd transakcji Koszyka Feniksa."));
        };
      });
    } catch (error) {
      summary.available = false;
      summary.error = error && error.message ? error.message : "Koszyk Feniksa jest niedostępny.";
    } finally {
      if (db) db.close();
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
    getSourceLabel: getSourceLabel
  };
  window.getFenixBasketSummary = getFenixBasketSummary;
  window.refreshFenixBasketStatusWidgets = refreshFenixBasketStatusWidgets;

  document.addEventListener("DOMContentLoaded", refreshFenixBasketStatusWidgets);
  window.addEventListener("focus", refreshFenixBasketStatusWidgets);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refreshFenixBasketStatusWidgets();
  });
})();
