(function () {
  "use strict";

  const STORAGE_KEY = "fenix-ui-theme";
  const WINDOW_NAME_TOKEN = /\|\|FENIX_THEME=(light|dark|system)\|\|/;
  const VALID_MODES = new Set(["light", "dark", "system"]);
  const systemTheme = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const ownScript = document.currentScript || Array.from(document.scripts).find(function (script) {
    return /\/shared\/fenix-theme\.js(?:\?|$)/.test(script.src || "");
  });

  function readWindowMode() {
    try {
      const match = String(window.name || "").match(WINDOW_NAME_TOKEN);
      return match && VALID_MODES.has(match[1]) ? match[1] : "";
    } catch (error) {
      return "";
    }
  }

  function writeWindowMode(mode) {
    try {
      const current = String(window.name || "").replace(WINDOW_NAME_TOKEN, "");
      window.name = current + "||FENIX_THEME=" + mode + "||";
    } catch (error) {
      console.warn("FENIX: nie udało się zapisać motywu w bieżącej karcie.", error);
    }
  }

  function safeReadMode() {
    const tabMode = readWindowMode();
    if (tabMode) return tabMode;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || "light";
      return VALID_MODES.has(saved) ? saved : "light";
    } catch (error) {
      return "light";
    }
  }

  function safeWriteMode(mode) {
    writeWindowMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      console.warn("FENIX: nie udało się zapisać motywu lokalnie.", error);
    }
  }

  function resolveTheme(mode) {
    if (mode === "system") return systemTheme && systemTheme.matches ? "dark" : "light";
    return mode;
  }

  function stylesheetUrl(relativePath, fallbackPath) {
    return ownScript && ownScript.src
      ? new URL(relativePath, ownScript.src).href
      : fallbackPath;
  }

  function ensureStylesheet(attributeName, relativePath, fallbackPath) {
    if (document.querySelector("link[" + attributeName + "]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.setAttribute(attributeName, "true");
    link.href = stylesheetUrl(relativePath, fallbackPath);
    document.head.appendChild(link);
  }

  function ensureThemeStylesheets() {
    ensureStylesheet(
      "data-fenix-theme-styles",
      "../styles/fenix-theme.css?v=20260730-3",
      "styles/fenix-theme.css?v=20260730-3"
    );
    ensureStylesheet(
      "data-fenix-bp-ui-styles",
      "../styles/fenix-bp-ui.css?v=20260730-1",
      "styles/fenix-bp-ui.css?v=20260730-1"
    );
    ensureStylesheet(
      "data-fenix-contrast-styles",
      "../styles/fenix-contrast-fixes.css?v=20260730-1",
      "styles/fenix-contrast-fixes.css?v=20260730-1"
    );
  }

  function updateControls(mode) {
    document.querySelectorAll("[data-fenix-theme-select]").forEach(function (select) {
      if (select.value !== mode) select.value = mode;
    });
    document.querySelectorAll("[data-fenix-theme-current]").forEach(function (node) {
      const resolved = resolveTheme(mode);
      node.textContent = mode === "system"
        ? "Systemowy · " + (resolved === "dark" ? "ciemny" : "jasny")
        : (mode === "dark" ? "Ciemny" : "Jasny");
    });
  }

  function applyTheme(mode, options) {
    const nextMode = VALID_MODES.has(mode) ? mode : "light";
    const resolved = resolveTheme(nextMode);
    const opts = options || {};

    document.documentElement.dataset.fenixThemeMode = nextMode;
    document.documentElement.dataset.fenixTheme = resolved;
    document.documentElement.style.colorScheme = resolved;

    if (opts.persist !== false) safeWriteMode(nextMode);
    else writeWindowMode(nextMode);
    updateControls(nextMode);

    window.dispatchEvent(new CustomEvent("fenix-theme-change", {
      detail: { mode: nextMode, theme: resolved }
    }));
  }

  function findThemeHost() {
    const selectors = [
      ".fenix-launcher-brand",
      ".word-search-header-actions",
      "[class$='-studio-header-actions']",
      "[class$='-header-actions']",
      ".ag-nav",
      ".hero-identity",
      ".hero-badges",
      ".fenix-launcher-header",
      "body > header",
      "header"
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }
    return null;
  }

  function createThemeControl() {
    if (document.querySelector("[data-fenix-theme-control]")) return;

    const control = document.createElement("div");
    control.className = "fenix-theme-control";
    control.dataset.fenixThemeControl = "true";
    control.innerHTML = [
      '<label class="fenix-theme-label" for="fenixThemeSelect">Wygląd</label>',
      '<select id="fenixThemeSelect" data-fenix-theme-select aria-label="Motyw interfejsu Feniksa">',
      '<option value="light">Jasny</option>',
      '<option value="dark">Ciemny</option>',
      '<option value="system">Systemowy</option>',
      "</select>",
      '<span class="fenix-theme-current" data-fenix-theme-current aria-live="polite"></span>'
    ].join("");

    const host = findThemeHost();
    if (host) {
      host.classList.add("fenix-theme-host");
      host.appendChild(control);
    } else {
      control.classList.add("fenix-theme-control--floating");
      document.body.prepend(control);
    }

    const select = control.querySelector("[data-fenix-theme-select]");
    select.addEventListener("change", function () {
      applyTheme(select.value, { persist: true });
    });
    updateControls(safeReadMode());
  }

  function initialize() {
    ensureThemeStylesheets();
    applyTheme(safeReadMode(), { persist: false });
    createThemeControl();
  }

  ensureThemeStylesheets();
  applyTheme(safeReadMode(), { persist: false });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

  if (systemTheme) {
    const onSystemThemeChange = function () {
      if (safeReadMode() === "system") applyTheme("system", { persist: false });
    };
    if (typeof systemTheme.addEventListener === "function") systemTheme.addEventListener("change", onSystemThemeChange);
    else if (typeof systemTheme.addListener === "function") systemTheme.addListener(onSystemThemeChange);
  }

  window.addEventListener("storage", function (event) {
    if (event.key === STORAGE_KEY && VALID_MODES.has(event.newValue)) {
      applyTheme(event.newValue, { persist: false });
    }
  });

  window.FenixTheme = {
    getMode: safeReadMode,
    getResolvedTheme: function () { return resolveTheme(safeReadMode()); },
    setMode: function (mode) { applyTheme(mode, { persist: true }); },
    refreshControl: createThemeControl
  };
})();
