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
    if (sourceModule === "word-search-studio") return "Word Search Studio";
    if (sourceModule === "direct-png") return "Import PNG";
    return sourceModule || "Inne / import";
  }

  function createEmptySummary() {
    return {
      available: true,
      total: 0,
      bySource: {},
      labels: {},
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
          summary.total += 1;
          summary.bySource[sourceModule] = (summary.bySource[sourceModule] || 0) + 1;
          summary.labels[sourceModule] = getSourceLabel(sourceModule);
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

    const status = document.createElement("span");

    if (!summary.available) {
      status.textContent = "Koszyk niedostępny";
    } else if (!summary.total) {
      status.textContent = "Koszyk jest pusty";
    } else {
      status.textContent = summary.total + (summary.total === 1 ? " strona w koszyku" : " stron w koszyku");
    }

    node.appendChild(status);
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
