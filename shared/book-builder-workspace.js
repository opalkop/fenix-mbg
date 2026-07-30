(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  if (params.get("fenixMode") === "maze-studio" || window.FenixMbgMode === "maze-studio") return;

  const ownScript = document.currentScript;
  let overviewObserver = null;

  function ensureStylesheet() {
    if (document.querySelector('link[data-book-builder-workspace-styles]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.bookBuilderWorkspaceStyles = "true";
    link.href = ownScript && ownScript.src
      ? new URL("../styles/book-builder-workspace.css?v=20260730-1", ownScript.src).href
      : "styles/book-builder-workspace.css?v=20260730-1";
    document.head.appendChild(link);
  }

  function createLink(href, text, className) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = text;
    link.className = className || "";
    return link;
  }

  function simplifyGlobalBasket() {
    const panel = document.querySelector(".mbg-global-basket");
    if (!panel || panel.dataset.bookBuilderSimplified === "true") return;
    panel.dataset.bookBuilderSimplified = "true";

    const status = panel.querySelector("[data-fenix-basket-status]") || document.createElement("div");
    status.classList.add("fenix-basket-status-widget");
    status.dataset.fenixBasketStatus = "";

    const copy = document.createElement("div");
    copy.className = "book-builder-basket-copy";
    const label = document.createElement("span");
    label.className = "book-builder-overline";
    label.textContent = "KOSZYK FENIKSA";
    const description = document.createElement("p");
    description.textContent = "Book Builder automatycznie składa włączone strony zapisane w Koszyku Feniksa.";
    copy.append(label, status, description);

    const action = createLink("basket.html", "Otwórz Koszyk Feniksa", "book-builder-basket-link");
    panel.replaceChildren(copy, action);

    if (window.FenixBasketStatus && typeof window.FenixBasketStatus.refresh === "function") {
      window.FenixBasketStatus.refresh();
    }
  }

  function hideField(id) {
    const node = document.getElementById(id);
    if (!node) return;
    const field = node.closest("div") || node;
    field.hidden = true;
    field.classList.add("book-builder-internal-control");
  }

  function collapseEmptyRows(panel) {
    panel.querySelectorAll(".row,.row-3,.row-4").forEach(function (row) {
      const children = Array.from(row.children);
      if (children.length && children.every(function (child) { return child.hidden || child.classList.contains("book-builder-internal-control"); })) {
        row.hidden = true;
      }
    });
  }

  function simplifyFenixPagesGroup() {
    const group = document.getElementById("workflow-fenix-pages");
    if (!group || group.dataset.bookBuilderSimplified === "true") return;
    group.dataset.bookBuilderSimplified = "true";

    const title = group.querySelector(".workflow-title");
    const description = group.querySelector(".workflow-desc");
    if (title) title.textContent = "Strony z Koszyka Feniksa";
    if (description) description.textContent = "Gotowe strony z modułów, kolejność projektu oraz wybór stron do finalnego PDF.";

    const panel = group.querySelector(".fenix-basket-panel");
    if (!panel) return;
    panel.classList.add("book-builder-basket-panel");

    const heading = panel.querySelector("h2");
    if (heading) heading.textContent = "Zawartość Koszyka Feniksa";
    const notes = panel.querySelectorAll(":scope > .note");
    if (notes[0]) notes[0].textContent = "Book Builder pobiera gotowe strony z Koszyka. Edycję, usuwanie i zmianę kolejności wykonuj na ekranie Koszyka Feniksa.";
    if (notes[1]) notes[1].hidden = true;

    [
      "fenixBasketEnabled",
      "fenixBasketPlacement",
      "fenixPackInput",
      "fenixPngPagesInput"
    ].forEach(hideField);

    ["fenixBasketClear", "fenixPackImport", "fenixImportedClear"].forEach(function (id) {
      const button = document.getElementById(id);
      if (button) {
        button.hidden = true;
        button.classList.add("book-builder-internal-control");
      }
    });

    const refresh = document.getElementById("fenixBasketRefresh");
    const actions = document.createElement("div");
    actions.className = "book-builder-basket-actions";
    if (refresh) {
      refresh.textContent = "Odśwież dane Koszyka";
      actions.appendChild(refresh);
    }
    actions.appendChild(createLink("basket.html", "Otwórz i uporządkuj Koszyk", "book-builder-basket-link"));

    const status = document.getElementById("fenixBasketStatus");
    if (status) panel.insertBefore(actions, status);
    else panel.appendChild(actions);

    collapseEmptyRows(panel);
  }

  function rewriteNavigation() {
    const nav = document.querySelector(".hero-badges");
    if (!nav || nav.dataset.bookBuilderNavigation === "true") return;
    nav.dataset.bookBuilderNavigation = "true";
    nav.innerHTML = [
      '<a href="#workflow-book">A. Ustawienia książki</a>',
      '<a href="#workflow-fenix-pages">B. Koszyk i strony</a>',
      '<a href="#workflow-addons">C. Dodatki</a>',
      '<a href="#workflow-preview">D. Podgląd</a>',
      '<a href="#workflow-export">E. Audyt i PDF</a>'
    ].join("");
  }

  function createColumn(className, eyebrow, title, description) {
    const column = document.createElement("section");
    column.className = className;
    const heading = document.createElement("div");
    heading.className = "book-builder-column-heading";
    heading.innerHTML = '<span>' + eyebrow + '</span><h2>' + title + '</h2><p>' + description + '</p>';
    column.appendChild(heading);
    return column;
  }

  function collectOverviewNodes(overview, main, grid) {
    [
      main.querySelector(".book-builder-workflow"),
      main.querySelector(".mbg-global-basket"),
      main.querySelector("#mbgBasketOnlyBanner"),
      main.querySelector(".active-book-blocks")
    ].forEach(function (node) {
      if (node && node.parentElement !== overview) overview.appendChild(node);
    });
    if (overview.parentElement !== main) main.insertBefore(overview, grid);
  }

  function buildWorkspace() {
    const main = document.querySelector("main");
    const grid = main && main.querySelector(":scope > .grid");
    if (!main || !grid) return false;
    if (grid.dataset.bookBuilderWorkspaceReady === "true") return true;

    document.body.classList.add("fenix-book-builder-workspace-v2");
    grid.dataset.bookBuilderWorkspaceReady = "true";

    simplifyGlobalBasket();
    simplifyFenixPagesGroup();
    rewriteNavigation();

    const overview = document.createElement("section");
    overview.className = "book-builder-overview";
    overview.setAttribute("aria-label", "Podsumowanie projektu");
    collectOverviewNodes(overview, main, grid);

    const settingsColumn = createColumn(
      "book-builder-settings-column",
      "USTAWIENIA I ZAWARTOŚĆ",
      "Skład książki",
      "Teksty stron początkowych i końcowych oraz gotowe strony z Koszyka Feniksa."
    );
    const reviewColumn = createColumn(
      "book-builder-review-column",
      "KONTROLA I EKSPORT",
      "Podgląd finalnego PDF",
      "Podgląd strony, audyt liczby i kolejności stron oraz generowanie pliku KDP."
    );
    const internal = document.createElement("section");
    internal.className = "book-builder-hidden-internal";
    internal.hidden = true;

    const assignments = [
      ["workflow-book", settingsColumn],
      ["workflow-fenix-pages", settingsColumn],
      ["workflow-addons", settingsColumn],
      ["workflow-preview", reviewColumn],
      ["workflow-export", reviewColumn]
    ];

    assignments.forEach(function (entry) {
      const node = document.getElementById(entry[0]);
      if (node) entry[1].appendChild(node);
    });

    ["workflow-maze", "workflow-assets"].forEach(function (id) {
      const node = document.getElementById(id);
      if (node) internal.appendChild(node);
    });

    Array.from(grid.children).forEach(function (node) {
      if (!node.matches(".book-builder-settings-column,.book-builder-review-column,.book-builder-hidden-internal")) {
        settingsColumn.appendChild(node);
      }
    });

    grid.replaceChildren(settingsColumn, reviewColumn, internal);

    const setup = document.getElementById("workflow-book");
    const fenixPages = document.getElementById("workflow-fenix-pages");
    const legacy = document.getElementById("workflow-addons");
    const preview = document.getElementById("workflow-preview");
    const output = document.getElementById("workflow-export");
    if (setup) setup.open = true;
    if (fenixPages) fenixPages.open = true;
    if (legacy) legacy.open = false;
    if (preview) preview.open = true;
    if (output) output.open = true;

    if (overviewObserver) overviewObserver.disconnect();
    overviewObserver = new MutationObserver(function () {
      collectOverviewNodes(overview, main, grid);
      simplifyGlobalBasket();
    });
    overviewObserver.observe(main, { childList: true, subtree: false });

    return true;
  }

  function initialize() {
    ensureStylesheet();
    let attempts = 0;
    const tryBuild = function () {
      attempts += 1;
      if (buildWorkspace()) return;
      if (attempts < 120) window.setTimeout(tryBuild, 50);
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
