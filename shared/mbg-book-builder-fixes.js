(function () {
  "use strict";

  const FIX_VERSION = "2026.07.29-1";
  const TRUE_VALUES = new Set(["true", "tak", "yes", "1", "on", "enabled", "włączone"]);
  const FALSE_VALUES = new Set(["false", "nie", "no", "0", "off", "disabled", "wyłączone", ""]);
  const OPTION_IDS = [
    "autoDifficulty",
    "enableMaskOutline",
    "useMask",
    "showMaskGuide",
    "decoEnabled",
    "fenixBasketEnabled",
    "includeMissionTracker",
    "includeShapeTracerPages",
    "includeColoringPages",
    "includeCongratsPage",
    "includeQrPage",
    "includeCertificatePage",
    "includeIntroPages",
    "includeSolutions"
  ];

  let installed = false;
  let installAttempts = 0;
  let originalGeneratePreview = null;
  let originalRenderFenixBasketList = null;
  let originalUpdateFenixBasketStatus = null;
  let originalReadSettings = null;

  function readBooleanControl(id, fallback) {
    const control = document.getElementById(id);
    if (!control) return !!fallback;
    if (control.type === "checkbox" || control.type === "radio") return !!control.checked;

    const normalized = String(control.value == null ? "" : control.value).trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;

    console.warn("FENIX: nierozpoznana wartość przełącznika", id, control.value);
    return !!fallback;
  }

  function normalizeSolutionText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, function (letter) {
        return ({ "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o", "ś": "s", "ź": "z", "ż": "z" })[letter] || letter;
      });
  }

  function isFenixSolutionPage(page) {
    if (!page) return false;
    if (page.isSolution === true || page.bookSection === "solutions") return true;

    const snapshot = page.editSnapshot || {};
    const combined = normalizeSolutionText([
      page.pageType,
      page.title,
      page.fileName,
      page.sourceKind,
      snapshot.pageType,
      snapshot.renderMode,
      snapshot.title
    ].join(" "));

    if (page.sourceModule === "word-search-studio" && combined.indexOf("word_search_solution") !== -1) return true;
    return /(^|[\s_\-])(solution|solutions|answer|answers|rozwiazanie|rozwiazania)([\s_\-.]|$)/.test(combined);
  }

  function getIncludedFenixPages() {
    if (typeof window.getAvailableFenixPages !== "function") return [];
    return window.getAvailableFenixPages().filter(function (page) {
      return page && page.includeInBook !== false;
    });
  }

  function mapFenixPage(page, index, section) {
    return {
      type: "fenix_basket_page",
      index: index + 1,
      sourceModule: page.sourceModule,
      sourceKind: page.sourceKind || "local_basket",
      pageType: page.pageType,
      fileName: page.fileName,
      title: page.title,
      blob: page.blob,
      dataUrl: page.dataUrl,
      previewImage: page.previewImage,
      width: page.width || 2550,
      height: page.height || 3300,
      mimeType: page.mimeType || "image/png",
      bookSection: section,
      isSolution: section === "solutions"
    };
  }

  function getActivityPlanPages() {
    return getIncludedFenixPages()
      .filter(function (page) { return !isFenixSolutionPage(page); })
      .map(function (page, index) { return mapFenixPage(page, index, "activities"); });
  }

  function getSolutionPlanPages() {
    return getIncludedFenixPages()
      .filter(isFenixSolutionPage)
      .map(function (page, index) { return mapFenixPage(page, index, "solutions"); });
  }

  function patchedBuildBookPagePlan(settings) {
    const pages = [];
    const activityPages = settings.fenixBasketEnabled ? getActivityPlanPages() : [];
    const fenixSolutionPages = settings.fenixBasketEnabled && settings.includeSolutions ? getSolutionPlanPages() : [];
    let activitiesInserted = false;

    function insertActivitiesAt(placement) {
      if (activitiesInserted || !settings.fenixBasketEnabled) return;
      if (settings.fenixBasketPlacement !== placement) return;
      if (!activityPages.length) return;
      pages.push.apply(pages, activityPages);
      activitiesInserted = true;
    }

    if (settings.includeIntroPages) {
      pages.push({ type: "intro", index: 1 });
      pages.push({ type: "how-to", index: 1 });
    }

    insertActivitiesAt("after-intro");

    if (settings.includeMissionTracker) pages.push({ type: "mission-tracker", index: 1 });

    if (settings.includeShapeTracerPages) {
      for (let i = 1; i <= settings.shapeTracerPageCount; i += 1) pages.push({ type: "shape-tracer", index: i });
    }

    if (settings.includeColoringPages) {
      for (let i = 1; i <= settings.coloringPageCount; i += 1) pages.push({ type: "coloring", index: i });
    }

    insertActivitiesAt("before-mazes");

    for (let i = 1; i <= settings.mazeCount; i += 1) pages.push({ type: "maze", index: i });

    insertActivitiesAt("after-mazes");
    insertActivitiesAt("before-solutions");
    // "Przed certyfikatem" oznacza najpóźniejsze miejsce dla ZADAŃ.
    // Rozwiązania nadal muszą pozostać w jednej końcowej sekcji.
    insertActivitiesAt("before-certificate");

    if (!activitiesInserted && settings.fenixBasketEnabled && activityPages.length) {
      pages.push.apply(pages, activityPages);
      activitiesInserted = true;
    }

    if (settings.includeSolutions) {
      const fenixBeforeMazes = settings.fenixBasketPlacement === "after-intro" || settings.fenixBasketPlacement === "before-mazes";
      if (fenixBeforeMazes) pages.push.apply(pages, fenixSolutionPages);
      for (let i = 1; i <= settings.mazeCount; i += 1) pages.push({ type: "solution", index: i, bookSection: "solutions", isSolution: true });
      if (!fenixBeforeMazes) pages.push.apply(pages, fenixSolutionPages);
    }

    if (settings.includeCongratsPage) pages.push({ type: "congrats", index: 1 });
    if (settings.includeQrPage) pages.push({ type: "qr", index: 1 });

    if (settings.includeCertificatePage) {
      pages.push({ type: "certificate", index: 1, ensureOddPage: true });
      if (settings.certificateBlankBack) {
        pages.push({ type: "blank", index: 1, role: "certificate-blank-back" });
      }
    }

    return pages;
  }

  function patchedBuildMixedPreviewPages(settings, limit) {
    const plan = patchedBuildBookPagePlan(settings).filter(function (page) { return page.type !== "blank"; });
    const result = [];
    const used = new Set();

    function keyFor(page) {
      if (page.type === "fenix_basket_page") return page.bookSection + ":" + (page.sourceModule || "fenix");
      return page.type;
    }

    plan.forEach(function (page) {
      const key = keyFor(page);
      if (result.length >= limit || used.has(key)) return;
      used.add(key);
      result.push(page);
    });

    plan.forEach(function (page) {
      if (result.length >= limit || result.indexOf(page) !== -1) return;
      result.push(page);
    });

    return result.slice(0, limit);
  }

  function patchedBuildPreviewPagePlan(settings, pageType, requestedCount) {
    const limit = Math.max(1, Math.min(Number(requestedCount) || 6, 24));
    const plan = patchedBuildBookPagePlan(settings).filter(function (page) { return page.type !== "blank"; });

    if (pageType === "maze-only") return plan.filter(function (page) { return page.type === "maze"; }).slice(0, limit);
    if (pageType === "shape-tracer-only") {
      if (!settings.includeShapeTracerPages) return [];
      return plan.filter(function (page) { return page.type === "shape-tracer"; }).slice(0, limit);
    }
    if (pageType === "coloring-only") {
      if (!settings.includeColoringPages) return [];
      return plan.filter(function (page) { return page.type === "coloring"; }).slice(0, limit);
    }
    if (pageType === "fenix-basket-only") return plan.filter(function (page) { return page.type === "fenix_basket_page"; }).slice(0, limit);
    if (pageType === "solutions-only") return plan.filter(function (page) { return page.type === "solution" || page.bookSection === "solutions"; }).slice(0, limit);
    if (pageType === "mixed") return patchedBuildMixedPreviewPages(settings, limit);
    return plan.slice(0, limit);
  }

  function patchedGeneratePreview() {
    const canvas = document.getElementById("previewCanvas");
    if (!canvas || !originalGeneratePreview) return;

    const settings = window.readSettings();
    const pageTypeControl = document.getElementById("previewPageType");
    const previewModeControl = document.getElementById("previewMode");
    const pageType = pageTypeControl ? pageTypeControl.value : "auto";
    const previewMode = previewModeControl ? previewModeControl.value : "single";
    const previewPlan = patchedBuildPreviewPagePlan(settings, pageType, 1);

    if (!previewPlan.length) {
      canvas.width = 2550;
      canvas.height = 3300;
      if (typeof window.clearPage === "function") window.clearPage(canvas.getContext("2d"));
      if (typeof window.setStatus === "function") {
        window.setStatus("Brak stron do podglądu: wybrany typ jest wyłączony w ustawieniach książki.");
      }
      return;
    }

    if (previewMode === "single" && pageType === "auto") {
      const pageCountControl = document.getElementById("previewPageCount");
      const previousCount = pageCountControl ? pageCountControl.value : "6";
      previewModeControl.value = "multi";
      if (pageCountControl) pageCountControl.value = "1";
      originalGeneratePreview();
      previewModeControl.value = "single";
      if (pageCountControl) pageCountControl.value = previousCount;
      return;
    }

    originalGeneratePreview();
  }

  function ensureOptionStatus(control) {
    const host = control.closest(".mbg-option-card") || control.parentElement;
    if (!host) return null;
    host.classList.add("mbg-option-card");
    host.dataset.optionControlId = control.id;

    const statusId = control.id + "-export-status";
    let status = document.getElementById(statusId);
    if (!status) {
      status = host.querySelector(".mbg-option-status");
      if (!status) {
        status = document.createElement("span");
        status.className = "mbg-option-status";
        host.appendChild(status);
      }
      status.id = statusId;
      status.setAttribute("aria-live", "polite");
    }
    return { host: host, status: status };
  }

  function updateOptionUi() {
    OPTION_IDS.forEach(function (id) {
      const control = document.getElementById(id);
      if (!control) return;
      const parts = ensureOptionStatus(control);
      if (!parts) return;
      const enabled = readBooleanControl(id, false);
      parts.host.classList.toggle("is-enabled", enabled);
      parts.host.classList.toggle("is-disabled", !enabled);
      parts.host.dataset.exportEnabled = enabled ? "true" : "false";
      parts.status.dataset.state = enabled ? "enabled" : "disabled";
      parts.status.textContent = enabled ? "WŁĄCZONE — trafi do PDF" : "WYŁĄCZONE — 0 stron w PDF";
    });

    const tracing = document.getElementById("includeShapeTracerPages");
    const tracingSection = tracing && (tracing.closest(".legacy-subsection") || tracing.closest(".card"));
    if (tracingSection) tracingSection.classList.toggle("legacy-feature-disabled", !readBooleanControl("includeShapeTracerPages", false));

    const coloring = document.getElementById("includeColoringPages");
    const coloringSection = coloring && (coloring.closest(".legacy-subsection") || coloring.closest(".card"));
    if (coloringSection) coloringSection.classList.toggle("legacy-feature-disabled", !readBooleanControl("includeColoringPages", false));

    updateBookPlanSummary();
  }

  function countPlan(settings) {
    const plan = patchedBuildBookPagePlan(settings);
    return plan.reduce(function (counts, page) {
      if (page.type === "fenix_basket_page" && page.bookSection === "solutions") counts.fenixSolutions += 1;
      else if (page.type === "fenix_basket_page") counts.fenixActivities += 1;
      else if (page.type === "solution") counts.mazeSolutions += 1;
      else if (page.type === "maze") counts.mazes += 1;
      else if (page.type === "shape-tracer") counts.legacyTracing += 1;
      else if (page.type === "coloring") counts.legacyColoring += 1;
      else if (page.type === "certificate") counts.certificate += 1;
      else if (page.type === "blank") counts.blank += 1;
      else counts.other += 1;
      counts.total += 1;
      return counts;
    }, {
      total: 0,
      mazes: 0,
      fenixActivities: 0,
      mazeSolutions: 0,
      fenixSolutions: 0,
      legacyTracing: 0,
      legacyColoring: 0,
      certificate: 0,
      blank: 0,
      other: 0
    });
  }

  function ensurePlanSummaryNode() {
    let node = document.getElementById("mbgFinalPlanSummary");
    if (node) return node;
    const generateBox = document.querySelector(".generate-box");
    if (!generateBox || !generateBox.parentElement) return null;
    node = document.createElement("div");
    node.id = "mbgFinalPlanSummary";
    node.className = "mbg-final-plan-summary";
    generateBox.parentElement.insertBefore(node, generateBox);
    return node;
  }

  function updateBookPlanSummary() {
    if (typeof window.readSettings !== "function") return;
    const node = ensurePlanSummaryNode();
    if (!node) return;
    const settings = window.readSettings();
    const counts = countPlan(settings);
    const tracingOff = counts.legacyTracing === 0;
    const coloringOff = counts.legacyColoring === 0;

    node.classList.toggle("has-warning", !tracingOff || !coloringOff);
    node.innerHTML = "";

    const title = document.createElement("strong");
    title.textContent = "Faktyczny plan eksportu: " + counts.total + " stron";
    node.appendChild(title);

    const line = document.createElement("p");
    line.textContent = [
      "Labirynty: " + counts.mazes,
      "Strony z modułów: " + counts.fenixActivities,
      "Rozwiązania labiryntów: " + counts.mazeSolutions,
      "Rozwiązania z Koszyka: " + counts.fenixSolutions,
      "Legacy tracing: " + counts.legacyTracing,
      "Legacy coloring: " + counts.legacyColoring,
      "Certyfikat: " + counts.certificate,
      "Pusta strona: " + counts.blank
    ].join(" • ");
    node.appendChild(line);

    const note = document.createElement("p");
    note.className = "note";
    note.textContent = settings.includeSolutions
      ? "Rozwiązania labiryntów i strony oznaczone jako rozwiązania w Koszyku są automatycznie grupowane pod koniec książki, przed stronami końcowymi i certyfikatem."
      : "Wszystkie rozwiązania są wyłączone: ani rozwiązania labiryntów, ani rozwiązania z Koszyka nie trafią do PDF.";
    node.appendChild(note);
  }

  function patchedUpdateActiveBookBlocksSummary() {
    const summary = document.getElementById("activeBookBlocksSummary");
    if (!summary || typeof window.readSettings !== "function") return;
    const settings = window.readSettings();
    const counts = countPlan(settings);
    const items = [
      ["Labirynty", counts.mazes > 0, counts.mazes],
      ["Moduły Feniksa", counts.fenixActivities > 0, counts.fenixActivities],
      ["Rozwiązania", counts.mazeSolutions + counts.fenixSolutions > 0, counts.mazeSolutions + counts.fenixSolutions],
      ["Legacy tracing", counts.legacyTracing > 0, counts.legacyTracing],
      ["Legacy coloring", counts.legacyColoring > 0, counts.legacyColoring],
      ["Tracker", !!settings.includeMissionTracker, settings.includeMissionTracker ? 1 : 0],
      ["QR", !!settings.includeQrPage, settings.includeQrPage ? 1 : 0],
      ["Certyfikat", !!settings.includeCertificatePage, settings.includeCertificatePage ? 1 : 0]
    ];

    summary.replaceChildren();
    items.forEach(function (item) {
      const chip = document.createElement("span");
      chip.className = item[1] ? "active-book-chip is-enabled" : "active-book-chip";
      chip.textContent = item[0] + ": " + (item[1] ? "Włączone (" + item[2] + ")" : "Wyłączone (0)");
      summary.appendChild(chip);
    });
  }

  function decorateBasketList() {
    if (typeof window.getAvailableFenixPages !== "function") return;
    const pages = window.getAvailableFenixPages();
    const items = Array.from(document.querySelectorAll("#fenixBasketList .fenix-basket-item"));
    items.forEach(function (item, index) {
      const page = pages[index];
      if (!page) return;
      const solution = isFenixSolutionPage(page);
      item.classList.toggle("is-solution-page", solution);
      let badge = item.querySelector(".fenix-auto-section-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "fenix-auto-section-badge";
        const meta = item.querySelector(".fenix-basket-meta");
        if (meta) meta.appendChild(badge);
      }
      if (badge) {
        badge.textContent = solution
          ? "ROZWIĄZANIE — automatycznie w sekcji rozwiązań"
          : "AKTYWNOŚĆ — miejsce według ustawienia Koszyka";
      }
    });
  }

  function explainBasketPlacement() {
    const placement = document.getElementById("fenixBasketPlacement");
    if (!placement || !placement.parentElement) return;
    let note = document.getElementById("fenixBasketPlacementExplanation");
    if (!note) {
      note = document.createElement("p");
      note.id = "fenixBasketPlacementExplanation";
      note.className = "note fenix-placement-explanation";
      placement.parentElement.appendChild(note);
    }
    note.textContent = "To miejsce dotyczy wyłącznie stron z zadaniami. Strony rozwiązań z Word Search i innych modułów są wykrywane automatycznie i trafiają do wspólnej sekcji rozwiązań pod koniec książki.";

    const includeSolutions = document.getElementById("includeSolutions");
    const host = includeSolutions && includeSolutions.closest(".mbg-option-card");
    const description = host && host.querySelector(".mbg-option-description");
    if (description) {
      description.textContent = "Steruje wszystkimi rozwiązaniami: labiryntów oraz stronami rozwiązania wykrytymi w Koszyku Feniksa.";
    }
  }

  function installVersionBadge() {
    if (document.getElementById("mbgFixVersionBadge")) return;
    const host = document.querySelector(".hero-badges") || document.querySelector("header");
    if (!host) return;
    const badge = document.createElement("span");
    badge.id = "mbgFixVersionBadge";
    badge.className = "mbg-fix-version-badge";
    badge.textContent = "Book Builder FIX " + FIX_VERSION;
    host.appendChild(badge);
  }


  function install() {
    if (installed) return;
    installAttempts += 1;

    if (typeof window.readSettings !== "function" || typeof window.buildBookPagePlan !== "function" || typeof window.generatePreview !== "function") {
      if (installAttempts < 80) window.setTimeout(install, 50);
      return;
    }

    installed = true;
    originalReadSettings = window.readSettings;
    originalGeneratePreview = window.generatePreview;
    originalRenderFenixBasketList = window.renderFenixBasketList;
    originalUpdateFenixBasketStatus = window.updateFenixBasketStatus;

    window.getBool = readBooleanControl;
    window.isFenixSolutionPage = isFenixSolutionPage;
    window.getEnabledFenixBasketActivityPlanPages = getActivityPlanPages;
    window.getEnabledFenixBasketSolutionPlanPages = getSolutionPlanPages;
    window.getEnabledFenixBasketPlanPages = function () {
      return getActivityPlanPages().concat(getSolutionPlanPages());
    };

    window.readSettings = function () {
      const settings = originalReadSettings();
      OPTION_IDS.forEach(function (id) {
        if (Object.prototype.hasOwnProperty.call(settings, id)) settings[id] = readBooleanControl(id, settings[id]);
      });
      return settings;
    };

    window.buildBookPagePlan = patchedBuildBookPagePlan;
    window.buildMixedPreviewPages = patchedBuildMixedPreviewPages;
    window.buildPreviewPagePlan = patchedBuildPreviewPagePlan;
    window.generatePreview = patchedGeneratePreview;
    window.updateMbgOptionUi = function () {
      updateOptionUi();
      patchedUpdateActiveBookBlocksSummary();
    };
    window.updateActiveBookBlocksSummary = patchedUpdateActiveBookBlocksSummary;

    if (typeof originalRenderFenixBasketList === "function") {
      window.renderFenixBasketList = function () {
        const result = originalRenderFenixBasketList.apply(this, arguments);
        decorateBasketList();
        updateBookPlanSummary();
        return result;
      };
    }

    if (typeof originalUpdateFenixBasketStatus === "function") {
      window.updateFenixBasketStatus = function () {
        const result = originalUpdateFenixBasketStatus.apply(this, arguments);
        const status = document.getElementById("fenixBasketStatus");
        const solutions = getIncludedFenixPages().filter(isFenixSolutionPage).length;
        if (status && solutions) {
          status.textContent += " Wykryte rozwiązania: " + solutions + ". Zostaną przeniesione do końcowej sekcji rozwiązań.";
        }
        updateBookPlanSummary();
        return result;
      };
    }

    installVersionBadge();
    explainBasketPlacement();
    updateOptionUi();
    patchedUpdateActiveBookBlocksSummary();
    decorateBasketList();

    document.addEventListener("change", function () {
      window.setTimeout(function () {
        updateOptionUi();
        patchedUpdateActiveBookBlocksSummary();
        decorateBasketList();
      }, 0);
    }, true);

    document.addEventListener("input", function (event) {
      if (!event.target || !OPTION_IDS.includes(event.target.id)) return;
      window.setTimeout(updateOptionUi, 0);
    }, true);

    window.setTimeout(function () {
      updateOptionUi();
      patchedUpdateActiveBookBlocksSummary();
      decorateBasketList();
      if (typeof window.generatePreview === "function") window.generatePreview();
    }, 80);

    console.info("FENIX Book Builder fixes active:", FIX_VERSION);
  }

  install();
})();
