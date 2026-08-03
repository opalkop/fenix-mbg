(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  if (params.get("fenixMode") !== "maze-studio") return;

  const ownScript = document.currentScript;
  const STORAGE_KEY = "fenix-maze-studio-active-panel";
  const PANEL_MAP = {
    setup: ".group-setup",
    maze: ".group-maze",
    assets: ".group-assets"
  };

  function ensureStylesheet() {
    if (document.querySelector('link[data-maze-studio-workspace-styles]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.mazeStudioWorkspaceStyles = "true";
    link.href = ownScript && ownScript.src
      ? new URL("../styles/maze-studio-workspace.css?v=20260730-1", ownScript.src).href
      : "styles/maze-studio-workspace.css?v=20260730-1";
    document.head.appendChild(link);
  }

  function loadNumberingFix() {
    if (document.getElementById("mazeStudioNumberingFixLoader")) return;
    const script = document.createElement("script");
    script.id = "mazeStudioNumberingFixLoader";
    script.src = ownScript && ownScript.src
      ? new URL("maze-studio-numbering-fix.js?v=20260803-1", ownScript.src).href
      : "shared/maze-studio-numbering-fix.js?v=20260803-1";
    script.defer = true;
    document.head.appendChild(script);
  }

  function loadPreviewLock() {
    if (document.getElementById("mazeStudioPreviewLockLoader")) return;
    const script = document.createElement("script");
    script.id = "mazeStudioPreviewLockLoader";
    script.src = ownScript && ownScript.src
      ? new URL("maze-studio-preview-lock.js?v=20260802-1", ownScript.src).href
      : "shared/maze-studio-preview-lock.js?v=20260802-1";
    script.defer = true;
    document.head.appendChild(script);
  }

  function readSavedPanel() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return PANEL_MAP[saved] ? saved : "maze";
    } catch (error) {
      return "maze";
    }
  }

  function savePanel(panel) {
    try {
      localStorage.setItem(STORAGE_KEY, panel);
    } catch (error) {
      console.warn("Maze Studio: nie udało się zapisać aktywnej zakładki.", error);
    }
  }

  function createTab(panel, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "maze-studio-local-tab";
    button.dataset.mazePanelTarget = panel;
    button.textContent = label;
    button.setAttribute("aria-pressed", "false");
    return button;
  }

  function setActivePanel(panel, options) {
    const next = PANEL_MAP[panel] ? panel : "maze";
    const editor = document.querySelector(".maze-studio-editor-column");
    if (!editor) return;

    Object.keys(PANEL_MAP).forEach(function (key) {
      const group = editor.querySelector(PANEL_MAP[key]);
      if (!group) return;
      const active = key === next;
      group.classList.toggle("maze-studio-panel-hidden", !active);
      if (active) group.open = true;
    });

    document.querySelectorAll("[data-maze-panel-target]").forEach(function (button) {
      const active = button.dataset.mazePanelTarget === next;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    document.querySelectorAll(".hero-badges a[data-maze-nav-panel]").forEach(function (link) {
      link.classList.toggle("is-active", link.dataset.mazeNavPanel === next);
    });

    if (!options || options.persist !== false) savePanel(next);
  }

  function connectHeaderNavigation() {
    const nav = document.querySelector(".hero-badges");
    if (!nav) return;

    const mapping = {
      "#workflow-book": "setup",
      "#workflow-maze": "maze",
      "#workflow-assets": "assets"
    };

    nav.querySelectorAll("a").forEach(function (link) {
      const panel = mapping[link.getAttribute("href")];
      if (panel) {
        link.dataset.mazeNavPanel = panel;
        link.addEventListener("click", function (event) {
          event.preventDefault();
          setActivePanel(panel);
          const editor = document.querySelector(".maze-studio-editor-column");
          if (editor) editor.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return;
      }

      if (link.getAttribute("href") === "#workflow-preview") {
        link.addEventListener("click", function (event) {
          event.preventDefault();
          const preview = document.querySelector(".maze-studio-preview-column");
          if (preview) preview.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    });
  }

  function buildWorkspace() {
    const grid = document.querySelector("main .grid");
    const setup = document.querySelector(".group-setup");
    const maze = document.querySelector(".group-maze");
    const assets = document.querySelector(".group-assets");
    const preview = document.querySelector(".group-preview");

    if (!grid || !setup || !maze || !assets || !preview) return false;
    if (grid.dataset.mazeWorkspaceReady === "true") return true;

    document.body.classList.add("fenix-maze-workspace-v2");
    grid.dataset.mazeWorkspaceReady = "true";

    const editor = document.createElement("section");
    editor.className = "maze-studio-editor-column";
    editor.setAttribute("aria-label", "Ustawienia Maze Studio");

    const tabs = document.createElement("nav");
    tabs.className = "maze-studio-local-tabs";
    tabs.setAttribute("aria-label", "Sekcje ustawień Maze Studio");
    tabs.append(
      createTab("setup", "1. Teksty i preset"),
      createTab("maze", "2. Labirynt"),
      createTab("assets", "3. Assety")
    );

    tabs.querySelectorAll("[data-maze-panel-target]").forEach(function (button) {
      button.addEventListener("click", function () {
        setActivePanel(button.dataset.mazePanelTarget);
      });
    });

    editor.append(tabs, setup, maze, assets);

    const previewColumn = document.createElement("section");
    previewColumn.className = "maze-studio-preview-column";
    previewColumn.setAttribute("aria-label", "Podgląd i zapis pary 1:1");
    previewColumn.appendChild(preview);

    grid.append(editor, previewColumn);
    connectHeaderNavigation();
    setActivePanel(readSavedPanel(), { persist: false });
    return true;
  }

  function initialize() {
    ensureStylesheet();
    loadNumberingFix();
    loadPreviewLock();
    let attempts = 0;
    const tryBuild = function () {
      attempts += 1;
      if (buildWorkspace()) return;
      if (attempts < 80) window.setTimeout(tryBuild, 50);
    };
    tryBuild();
  }

  ensureStylesheet();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
