(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  if (params.get("fenixMode") !== "maze-studio") return;

  const state = {
    mazeData: null,
    settings: null,
    index: 1,
    mode: "puzzle"
  };

  function el(id) {
    return document.getElementById(id);
  }

  function isMazePreviewType(value) {
    const normalized = String(value || "").toLowerCase();
    return normalized === "maze" || normalized === "maze-only";
  }

  function isSolutionPreviewType(value) {
    const normalized = String(value || "").toLowerCase();
    return normalized === "solution" || normalized === "solutions-only" || normalized === "maze-solution";
  }

  function isSinglePreview() {
    const mode = el("previewMode");
    return !mode || String(mode.value || "single").toLowerCase() !== "multi";
  }

  function rememberMaze(mazeData, settings, index) {
    if (!mazeData) return null;
    state.mazeData = mazeData;
    state.settings = settings || state.settings || null;
    state.index = Number(index) || state.index || 1;
    if (typeof MBG !== "undefined") MBG.lastPreviewMaze = mazeData;
    return mazeData;
  }

  function getStoredMaze() {
    if (state.mazeData) return state.mazeData;
    if (typeof MBG !== "undefined" && MBG.lastPreviewMaze) {
      state.mazeData = MBG.lastPreviewMaze;
      return state.mazeData;
    }
    return null;
  }

  function recreateCurrentMaze() {
    if (typeof readSettings !== "function" || typeof createMazeData !== "function") return null;
    const settings = readSettings();
    const mazeData = createMazeData(settings, state.index || 1);
    rememberMaze(mazeData, settings, state.index || 1);
    return mazeData;
  }

  function updateControls(isSolution) {
    state.mode = isSolution ? "solution" : "puzzle";

    const selector = el("previewPageType");
    if (selector) selector.value = isSolution ? "solutions-only" : "maze-only";

    document.querySelectorAll("[data-maze-preview-lock-mode]").forEach(function (button) {
      const active = button.dataset.mazePreviewLockMode === state.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function renderStoredMaze(isSolution) {
    if (typeof readSettings !== "function" || typeof drawMazePage !== "function") return false;

    const canvas = el("previewCanvas");
    if (!canvas) return false;

    const mazeData = getStoredMaze() || recreateCurrentMaze();
    if (!mazeData) {
      if (typeof setStatus === "function") {
        setStatus("Najpierw wygeneruj labirynt, a potem przełącz Zadanie / Rozwiązanie.");
      }
      return false;
    }

    const settings = state.settings || readSettings();
    canvas.width = (typeof MBG !== "undefined" && MBG.PAGE_W) || 2550;
    canvas.height = (typeof MBG !== "undefined" && MBG.PAGE_H) || 3300;

    drawMazePage(canvas.getContext("2d"), settings, mazeData, !!isSolution);
    if (typeof forceCanvasGrayscale === "function") forceCanvasGrayscale(canvas);

    rememberMaze(mazeData, settings, state.index || 1);
    updateControls(!!isSolution);

    if (typeof setStatus === "function") {
      setStatus(isSolution
        ? "Pokazano rozwiązanie tego samego labiryntu — układ nie został zmieniony."
        : "Pokazano zadanie tego samego labiryntu — układ nie został zmieniony.");
    }

    return true;
  }

  function patchDrawPreviewPlanPage() {
    const original = window.drawPreviewPlanPage;
    if (typeof original !== "function" || original.__fenixMazePreviewLockPatched) return false;

    const patched = function (ctx, settings, page) {
      const item = page || { type: "maze", index: 1 };
      const index = Number(item.index) || 1;

      if (item.type === "solution") {
        const mazeData = getStoredMaze() || (typeof createMazeData === "function" ? createMazeData(settings, index) : null);
        if (mazeData && typeof drawMazePage === "function") {
          rememberMaze(mazeData, settings, index);
          updateControls(true);
          return drawMazePage(ctx, settings, mazeData, true);
        }
      }

      if (item.type === "maze") {
        const mazeData = typeof createMazeData === "function" ? createMazeData(settings, index) : null;
        if (mazeData && typeof drawMazePage === "function") {
          rememberMaze(mazeData, settings, index);
          updateControls(false);
          return drawMazePage(ctx, settings, mazeData, false);
        }
      }

      return original.apply(this, arguments);
    };

    patched.__fenixMazePreviewLockPatched = true;
    patched.__fenixMazePreviewLockOriginal = original;
    window.drawPreviewPlanPage = patched;
    return true;
  }

  function patchDrawMazePage() {
    const original = window.drawMazePage;
    if (typeof original !== "function" || original.__fenixMazePreviewRememberPatched) return false;

    const patched = function (ctx, settings, mazeData, isSolution) {
      if (mazeData) rememberMaze(mazeData, settings, state.index || 1);
      return original.apply(this, arguments);
    };

    patched.__fenixMazePreviewRememberPatched = true;
    patched.__fenixMazePreviewRememberOriginal = original;
    window.drawMazePage = patched;
    return true;
  }

  function createButton(mode, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-btn maze-preview-lock-button";
    button.dataset.mazePreviewLockMode = mode;
    button.textContent = label;
    button.setAttribute("aria-pressed", mode === "puzzle" ? "true" : "false");
    button.addEventListener("click", function () {
      renderStoredMaze(mode === "solution");
    });
    return button;
  }

  function installButtons() {
    const canvas = el("previewCanvas");
    if (!canvas || el("mazePreviewLockControls")) return false;

    const controls = document.createElement("div");
    controls.id = "mazePreviewLockControls";
    controls.className = "maze-preview-lock-controls";
    controls.setAttribute("aria-label", "Podgląd zadania i rozwiązania tego samego labiryntu");

    const label = document.createElement("strong");
    label.textContent = "Podgląd:";

    const note = document.createElement("span");
    note.textContent = "Przełączanie nie generuje nowego układu.";

    controls.append(
      label,
      createButton("puzzle", "Zadanie"),
      createButton("solution", "Rozwiązanie"),
      note
    );

    const host = canvas.parentElement;
    host.insertBefore(controls, canvas);

    if (!el("mazePreviewLockStyles")) {
      const style = document.createElement("style");
      style.id = "mazePreviewLockStyles";
      style.textContent = [
        ".maze-preview-lock-controls{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:0 auto 12px;max-width:760px;padding:10px 12px;border:1px solid rgba(99,220,255,.34);border-radius:9px;background:rgba(8,16,28,.82)}",
        ".maze-preview-lock-controls strong{color:#f8fafc}",
        ".maze-preview-lock-controls span{color:#aeb7c7;font-size:12px}",
        ".maze-preview-lock-button{padding:8px 14px;font-size:12px;box-shadow:none}",
        ".maze-preview-lock-button.is-active{border-color:#f59e0b;background:#f59e0b;color:#111827}"
      ].join("");
      document.head.appendChild(style);
    }

    return true;
  }

  function protectExistingPreviewSelector() {
    const selector = el("previewPageType");
    if (!selector || selector.dataset.mazePreviewLockBound === "true") return;
    selector.dataset.mazePreviewLockBound = "true";

    selector.addEventListener("change", function (event) {
      if (!isSinglePreview()) return;
      const value = selector.value;
      if (!isMazePreviewType(value) && !isSolutionPreviewType(value)) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (isSolutionPreviewType(value)) {
        renderStoredMaze(true);
        return;
      }

      if (typeof generatePreview === "function") {
        state.mazeData = null;
        state.settings = null;
        generatePreview();
      }
    }, true);
  }

  function initialize() {
    let attempts = 0;
    const tryInstall = function () {
      attempts += 1;
      patchDrawMazePage();
      patchDrawPreviewPlanPage();
      const ready = installButtons();
      protectExistingPreviewSelector();
      if ((!ready || typeof window.drawPreviewPlanPage !== "function") && attempts < 120) {
        window.setTimeout(tryInstall, 50);
      }
    };
    tryInstall();
  }

  window.FenixMazePreviewLock = {
    showPuzzle: function () { return renderStoredMaze(false); },
    showSolution: function () { return renderStoredMaze(true); },
    getCurrentMaze: getStoredMaze
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
