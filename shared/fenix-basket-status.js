(function () {
  "use strict";

  const CURRENT_SCRIPT_URL = document.currentScript && document.currentScript.src ? document.currentScript.src : "";
  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;

  function loadSharedTheme() {
    if (document.getElementById("fenixSharedThemeLoader")) return;
    const script = document.createElement("script");
    script.id = "fenixSharedThemeLoader";
    script.src = CURRENT_SCRIPT_URL
      ? new URL("fenix-theme.js?v=20260730-2", CURRENT_SCRIPT_URL).href
      : "shared/fenix-theme.js?v=20260730-2";
    script.async = false;
    document.head.appendChild(script);
  }

  function loadMbgModeSplitSynchronously() {
    if (!document.getElementById("includeShapeTracerPages")) return;
    if (document.getElementById("mbgModeSplitLoader")) return;
    const src = CURRENT_SCRIPT_URL
      ? new URL("mbg-mode-split.js?v=20260730-1", CURRENT_SCRIPT_URL).href
      : "shared/mbg-mode-split.js?v=20260730-1";
    if (document.readyState === "loading") {
      document.write('<script id="mbgModeSplitLoader" src="' + src.replace(/"/g, "&quot;") + '"><\/script>');
      return;
    }
    const script = document.createElement("script");
    script.id = "mbgModeSplitLoader";
    script.src = src;
    script.async = false;
    document.head.appendChild(script);
  }

  function loadMazeStudioWorkspace() {
    if (!document.getElementById("includeShapeTracerPages")) return;
    if (new URLSearchParams(window.location.search).get("fenixMode") !== "maze-studio") return;
    if (document.getElementById("mazeStudioWorkspaceLoader")) return;
    const script = document.createElement("script");
    script.id = "mazeStudioWorkspaceLoader";
    script.src = CURRENT_SCRIPT_URL
      ? new URL("maze-studio-workspace.js?v=20260730-1", CURRENT_SCRIPT_URL).href
      : "shared/maze-studio-workspace.js?v=20260730-1";
    script.defer = true;
    document.head.appendChild(script);
  }

  loadSharedTheme();
  loadMbgModeSplitSynchronously();
  loadMazeStudioWorkspace();

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
    if (sourceModule === "maze-studio") return "Maze Studio";
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

  function appendScript(id, src, onload) {
    if (document.getElementById(id)) {
      if (onload) onload();
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.defer = true;
    if (onload) script.addEventListener("load", onload, { once: true });
    document.head.appendChild(script);
  }

  function loadBookBuilderFixes() {
    if (!document.getElementById("includeShapeTracerPages")) return;
    if (window.FenixMbgMode === "maze-studio") return;
    appendScript("mbgGlobalBridgeLoader", "shared/mbg-global-bridge.js?v=20260730-1", function () {
      appendScript("mbgBookBuilderFixLoader", "shared/mbg-book-builder-fixes.js?v=20260729-1", function () {
        appendScript("mbgBookBuilderQaFixLoader", "shared/mbg-book-builder-qa-fixes.js?v=20260730-2", function () {
          appendScript("mbgWordSearchOrderFixLoader", "shared/mbg-word-search-order-fix.js?v=20260730-4", function () {
            appendScript("mbgBuilderBasketOnlyLoader", "shared/mbg-builder-basket-only.js?v=20260730-1", function () {
              appendScript("mbgBookAuditLoader", "shared/mbg-book-audit.js?v=20260730-5", function () {
                appendScript("mbgMazeAuditLoader", "shared/mbg-maze-audit.js?v=20260730-1");
              });
            });
          });
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    window.setTimeout(loadBookBuilderFixes, 0);
  });
})();
