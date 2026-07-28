(function () {
  "use strict";

  function getSourceLabel(sourceModule) {
    if (sourceModule === "maze-studio") return "Labirynty MBG";
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
        "maze-studio": "Labirynty MBG",
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

  function canvasToPngBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("Nie udało się utworzyć PNG strony labiryntu."));
      }, "image/png");
    });
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "fenix-maze-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function setMazeBasketButtonState(button, running) {
    button.disabled = running;
    button.classList.toggle("is-running", running);
    button.textContent = running
      ? "Dodaję strony do koszyka..."
      : "Dodaj labirynty + rozwiązania do Koszyka Feniksa";
  }

  async function addMazesToFenixBasket(button) {
    if (button.disabled) return;

    const required = ["readSettings", "createMazeData", "createCanvas", "drawMazePage", "forceCanvasGrayscale"];
    const missing = required.filter(function (name) {
      return typeof window[name] !== "function";
    });
    if (missing.length) {
      window.alert("Nie można uruchomić eksportu do koszyka. Brakuje funkcji MBG: " + missing.join(", "));
      return;
    }

    const settings = window.readSettings();
    const includeSolutions = !!settings.includeSolutions;
    const totalPages = settings.mazeCount * (includeSolutions ? 2 : 1);
    const message = "Dodać do Koszyka Feniksa " + settings.mazeCount + " labiryntów" +
      (includeSolutions ? " oraz " + settings.mazeCount + " rozwiązań" : "") +
      "? Łącznie: " + totalPages + " stron.";

    if (!window.confirm(message)) return;

    setMazeBasketButtonState(button, true);
    if (typeof window.setStatus === "function") {
      window.setStatus("Przygotowuję labirynty do Koszyka Feniksa...");
    }

    try {
      const basket = await loadBasketApi();
      const existingPages = await basket.getAllPages();
      let nextOrder = existingPages.reduce(function (max, page) {
        const order = Number(page && page.order);
        return Number.isFinite(order) ? Math.max(max, order) : max;
      }, 0) + 1;

      const rawSlug = (typeof window.getValue === "function")
        ? window.getValue("projectBookSlug", settings.exportFileName || "maze-book")
        : (settings.exportFileName || "maze-book");
      const projectSlug = (typeof window.safeFileName === "function")
        ? window.safeFileName(rawSlug)
        : String(rawSlug || "maze-book").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
      const batchId = createId();
      const mazeDataByIndex = {};

      for (let index = 1; index <= settings.mazeCount; index += 1) {
        const mazeData = window.createMazeData(settings, index);
        mazeDataByIndex[index] = mazeData;
        const canvas = window.createCanvas();
        window.drawMazePage(canvas.getContext("2d"), settings, mazeData, false);
        window.forceCanvasGrayscale(canvas);
        const blob = await canvasToPngBlob(canvas);

        await basket.putPage({
          id: createId(),
          sourceModule: "maze-studio",
          sourceKind: "generated_maze",
          sourceLabel: "MBG / Labirynty",
          pageType: "maze",
          fileName: projectSlug + "-maze-" + String(index).padStart(3, "0") + ".png",
          title: (settings.mazePrefix || "Maze") + " " + index,
          width: 2550,
          height: 3300,
          mimeType: "image/png",
          createdAt: new Date().toISOString(),
          order: nextOrder++,
          includeInBook: true,
          batchId: batchId,
          blob: blob
        });

        if (typeof window.setStatus === "function") {
          window.setStatus("Dodaję labirynty do koszyka: " + index + " / " + settings.mazeCount);
        }
        await new Promise(function (resolve) { requestAnimationFrame(resolve); });
      }

      if (includeSolutions) {
        for (let index = 1; index <= settings.mazeCount; index += 1) {
          const canvas = window.createCanvas();
          window.drawMazePage(canvas.getContext("2d"), settings, mazeDataByIndex[index], true);
          window.forceCanvasGrayscale(canvas);
          const blob = await canvasToPngBlob(canvas);

          await basket.putPage({
            id: createId(),
            sourceModule: "maze-studio",
            sourceKind: "generated_maze_solution",
            sourceLabel: "MBG / Rozwiązania labiryntów",
            pageType: "maze_solution",
            fileName: projectSlug + "-solution-" + String(index).padStart(3, "0") + ".png",
            title: (settings.solutionPrefix || "Solution") + " " + index,
            width: 2550,
            height: 3300,
            mimeType: "image/png",
            createdAt: new Date().toISOString(),
            order: nextOrder++,
            includeInBook: true,
            batchId: batchId,
            blob: blob
          });

          if (typeof window.setStatus === "function") {
            window.setStatus("Dodaję rozwiązania do koszyka: " + index + " / " + settings.mazeCount);
          }
          await new Promise(function (resolve) { requestAnimationFrame(resolve); });
        }
      }

      const enabled = document.getElementById("fenixBasketEnabled");
      if (enabled && enabled.type === "checkbox") enabled.checked = true;
      if (typeof window.refreshFenixBasket === "function") await window.refreshFenixBasket();
      if (typeof window.updateFenixBasketStatus === "function") window.updateFenixBasketStatus();
      if (typeof window.updateMbgOptionUi === "function") window.updateMbgOptionUi();
      await refreshFenixBasketStatusWidgets();

      if (typeof window.setStatus === "function") {
        window.setStatus("Dodano do Koszyka Feniksa: " + totalPages + " stron.");
      }
      window.alert("Gotowe. Dodano do Koszyka Feniksa " + totalPages + " stron. Są już dostępne w Book Builderze.");
    } catch (error) {
      console.error("Błąd dodawania labiryntów do Koszyka Feniksa:", error);
      if (typeof window.setStatus === "function") {
        window.setStatus("Błąd dodawania labiryntów do koszyka.");
      }
      window.alert("Nie udało się dodać labiryntów do Koszyka Feniksa: " + (error && error.message ? error.message : error));
    } finally {
      setMazeBasketButtonState(button, false);
    }
  }

  function installMbgMazeBasketButton() {
    const path = String(window.location.pathname || "").toLowerCase();
    if (!path.endsWith("/mbg.html") && !path.endsWith("mbg.html")) return;
    if (document.getElementById("addMazesToBasketBtn")) return;

    const generateBtn = document.getElementById("generateBtn");
    if (!generateBtn) return;

    const style = document.createElement("style");
    style.textContent = "#addMazesToBasketBtn{min-width:300px;background:linear-gradient(180deg,rgba(53,73,101,.99),rgba(20,34,55,.99));color:#eefaff;border-color:rgba(107,229,255,.72);box-shadow:0 4px 0 #0b1220,0 16px 30px rgba(0,0,0,.28),0 0 28px rgba(107,229,255,.12)}#addMazesToBasketBtn:hover{border-color:#8feeff;box-shadow:0 5px 0 #0b1220,0 20px 36px rgba(0,0,0,.34),0 0 38px rgba(107,229,255,.20)}#addMazesToBasketBtn.is-running{opacity:.72;cursor:wait}.mbg-basket-action-note{margin-top:10px;color:var(--muted);font-size:13px}@media(max-width:850px){#addMazesToBasketBtn{width:100%;min-width:0}}";
    document.head.appendChild(style);

    const button = document.createElement("button");
    button.id = "addMazesToBasketBtn";
    button.type = "button";
    button.className = "secondary-btn btn-secondary";
    button.textContent = "Dodaj labirynty + rozwiązania do Koszyka Feniksa";
    button.addEventListener("click", function () {
      addMazesToFenixBasket(button);
    });

    const parent = generateBtn.parentElement;
    if (parent) {
      parent.insertBefore(button, generateBtn);
      const note = document.createElement("p");
      note.className = "mbg-basket-action-note";
      note.textContent = "Dodaje całą paczkę labiryntów do Book Buildera. Rozwiązania zostaną dołączone, gdy opcja „Dodać strony rozwiązań?” jest ustawiona na „Tak”.";
      const generateBox = generateBtn.closest(".generate-box");
      if (generateBox) generateBox.insertAdjacentElement("afterend", note);
    }
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

    ["maze-studio", "complete-picture", "coloring-studio", "tracing-studio", "matching-studio", "alphabet-studio", "math-studio", "dot-to-dot-studio", "hidden-objects-studio", "logic-studio", "other"].forEach(function (source) {
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
    loadBasketApi: loadBasketApi,
    installMbgMazeBasketButton: installMbgMazeBasketButton
  };
  window.getFenixBasketSummary = getFenixBasketSummary;
  window.refreshFenixBasketStatusWidgets = refreshFenixBasketStatusWidgets;

  loadMbgWorkspaceShell();
  document.addEventListener("DOMContentLoaded", function () {
    installMbgMazeBasketButton();
    refreshFenixBasketStatusWidgets();
  });
  window.addEventListener("focus", refreshFenixBasketStatusWidgets);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refreshFenixBasketStatusWidgets();
  });
})();