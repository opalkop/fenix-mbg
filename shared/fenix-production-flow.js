(function (root, factory) {
  "use strict";
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) {
    root.FenixProductionFlow = api;
    api.install();
  }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const VERSION = "2026.07.31-1";
  let installed = false;
  let attempts = 0;
  let originalReadSettings = null;
  let originalGeneratePDF = null;
  let exportGuardRunning = false;

  function valueOrSnapshot(page, directKey, snapshotKey) {
    if (!page) return "";
    if (page[directKey] !== undefined && page[directKey] !== null && page[directKey] !== "") return page[directKey];
    const snapshot = page.editSnapshot || {};
    return snapshot[snapshotKey || directKey] !== undefined ? snapshot[snapshotKey || directKey] : "";
  }

  function orderValue(page, fallback) {
    const basketOrder = Number(page && page.basketOrder);
    if (Number.isFinite(basketOrder)) return basketOrder;
    const order = Number(page && page.order);
    if (Number.isFinite(order)) return order;
    return Number.isFinite(Number(fallback)) ? Number(fallback) : 999999;
  }

  function pairKind(page) {
    if (!page) return "";
    if (page.sourceModule === "maze-studio") return "maze";
    if (page.sourceModule === "word-search-studio") return "word-search";
    return "";
  }

  function pairId(page) {
    const kind = pairKind(page);
    if (kind === "maze") return String(valueOrSnapshot(page, "mazePairId") || "");
    if (kind === "word-search") return String(valueOrSnapshot(page, "wordSearchPairId") || "");
    return "";
  }

  function pairRole(page) {
    const kind = pairKind(page);
    let role = "";
    if (kind === "maze") role = String(valueOrSnapshot(page, "mazePairRole") || "");
    if (kind === "word-search") role = String(valueOrSnapshot(page, "wordSearchPairRole") || "");
    if (role === "puzzle" || role === "solution") return role;
    return isSolutionPage(page) ? "solution" : "puzzle";
  }

  function partnerId(page) {
    const kind = pairKind(page);
    if (kind === "maze") return String(valueOrSnapshot(page, "mazePartnerId") || "");
    if (kind === "word-search") return String(valueOrSnapshot(page, "wordSearchPartnerId") || "");
    return "";
  }

  function pairSeed(page) {
    if (!page) return "";
    const direct = page.wordSearchPairSeed !== undefined ? page.wordSearchPairSeed : page.mazePairSeed;
    if (direct !== undefined && direct !== null && direct !== "") return String(direct);
    const snapshot = page.editSnapshot || {};
    if (snapshot.wordSearchPairSeed !== undefined && snapshot.wordSearchPairSeed !== null) return String(snapshot.wordSearchPairSeed);
    if (snapshot.mazePairSeed !== undefined && snapshot.mazePairSeed !== null) return String(snapshot.mazePairSeed);
    if (snapshot.settings && snapshot.settings.seed !== undefined && snapshot.settings.seed !== null) return String(snapshot.settings.seed);
    if (snapshot.mazeData && snapshot.mazeData.seed !== undefined && snapshot.mazeData.seed !== null) return String(snapshot.mazeData.seed);
    return "";
  }

  function isSolutionPage(page) {
    if (!page) return false;
    if (page.isSolution === true || page.bookSection === "solutions") return true;
    const role = String(
      page.mazePairRole ||
      page.wordSearchPairRole ||
      (page.editSnapshot && (page.editSnapshot.mazePairRole || page.editSnapshot.wordSearchPairRole)) ||
      ""
    ).toLowerCase();
    if (role === "solution") return true;
    const text = [page.pageType, page.title, page.fileName, page.sourceKind]
      .map(function (value) { return String(value || "").toLowerCase(); })
      .join(" ");
    return /(^|[\s_\-])(solution|solutions|answer|answers|rozwiazanie|rozwiazania)([\s_\-.]|$)/.test(text);
  }

  function hasImagePayload(page) {
    if (!page) return false;
    if (page.dataUrl || page.previewImage || page.pngDataUrl || page.imageData) return true;
    if (page.blob || page.pngBlob || page.imageBlob || page.file) return true;
    return false;
  }

  function getIncludedPages(pages) {
    return (Array.isArray(pages) ? pages : [])
      .filter(function (page) { return page && page.includeInBook !== false; })
      .slice()
      .sort(function (a, b) {
        const diff = orderValue(a) - orderValue(b);
        if (diff) return diff;
        return String(a.createdAt || a.id || "").localeCompare(String(b.createdAt || b.id || ""));
      });
  }

  function mapBasketPage(page, index, section) {
    return {
      type: "fenix_basket_page",
      index: index + 1,
      basketId: page.id,
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
      isSolution: section === "solutions",
      mazePairId: page.mazePairId,
      mazePairRole: page.mazePairRole,
      mazePartnerId: page.mazePartnerId,
      wordSearchPairId: page.wordSearchPairId,
      wordSearchPairRole: page.wordSearchPairRole,
      wordSearchPartnerId: page.wordSearchPartnerId,
      originalBasketOrder: orderValue(page, index)
    };
  }

  function solutionSortKey(page, byId, fallback) {
    const partner = byId.get(partnerId(page));
    return partner ? orderValue(partner, fallback) : orderValue(page, fallback);
  }

  function buildPlan(settings, basketPages) {
    const currentSettings = settings || {};
    const included = getIncludedPages(basketPages);
    const byId = new Map();
    included.forEach(function (page) { if (page.id) byId.set(String(page.id), page); });

    const activities = included.filter(function (page) { return !isSolutionPage(page); });
    const solutions = included.filter(isSolutionPage);
    const mazeSolutions = solutions.filter(function (page) { return page.sourceModule === "maze-studio"; });
    const wordSolutions = solutions.filter(function (page) { return page.sourceModule === "word-search-studio"; });
    const otherSolutions = solutions.filter(function (page) {
      return page.sourceModule !== "maze-studio" && page.sourceModule !== "word-search-studio";
    });

    [mazeSolutions, wordSolutions, otherSolutions].forEach(function (group) {
      group.sort(function (a, b) {
        return solutionSortKey(a, byId, 999999) - solutionSortKey(b, byId, 999999);
      });
    });

    const plan = [];
    if (currentSettings.includeIntroPages !== false) {
      plan.push({ type: "intro", index: 1 });
      plan.push({ type: "how-to", index: 1 });
    }
    if (currentSettings.includeMissionTracker === true) plan.push({ type: "mission-tracker", index: 1 });

    activities.forEach(function (page, index) {
      plan.push(mapBasketPage(page, index, "activities"));
    });

    if (currentSettings.includeSolutions !== false) {
      mazeSolutions.concat(wordSolutions, otherSolutions).forEach(function (page, index) {
        plan.push(mapBasketPage(page, index, "solutions"));
      });
    }

    if (currentSettings.includeCongratsPage === true) plan.push({ type: "congrats", index: 1 });
    if (currentSettings.includeQrPage === true) plan.push({ type: "qr", index: 1 });
    if (currentSettings.includeCertificatePage === true) {
      plan.push({ type: "certificate", index: 1, ensureOddPage: true });
      if (currentSettings.certificateBlankBack !== false) {
        plan.push({ type: "blank", index: 1, role: "certificate-blank-back" });
      }
    }
    return plan;
  }

  function buildPreviewPlan(settings, pageType, requestedCount, basketPages) {
    const limit = Math.max(1, Math.min(Number(requestedCount) || 6, 24));
    const plan = buildPlan(settings, basketPages).filter(function (page) { return page.type !== "blank"; });
    if (pageType === "fenix-basket-only") return plan.filter(function (page) { return page.type === "fenix_basket_page"; }).slice(0, limit);
    if (pageType === "solutions-only") return plan.filter(function (page) { return page.bookSection === "solutions"; }).slice(0, limit);
    if (pageType === "mixed") {
      const result = [];
      const used = new Set();
      plan.forEach(function (page) {
        const key = page.type === "fenix_basket_page"
          ? page.bookSection + ":" + (page.sourceModule || "basket")
          : page.type;
        if (result.length < limit && !used.has(key)) {
          used.add(key);
          result.push(page);
        }
      });
      plan.forEach(function (page) {
        if (result.length < limit && result.indexOf(page) === -1) result.push(page);
      });
      return result.slice(0, limit);
    }
    return plan.slice(0, limit);
  }

  function auditPairs(pages, settings) {
    const allPages = Array.isArray(pages) ? pages.filter(Boolean) : [];
    const includedIds = new Set(getIncludedPages(allPages).map(function (page) { return String(page.id || ""); }));
    const groups = new Map();
    const critical = [];
    const warnings = [];

    allPages.forEach(function (page) {
      const kind = pairKind(page);
      if (!kind) return;
      const id = pairId(page);
      if (!id) {
        if (page.includeInBook !== false) warnings.push((page.title || page.id || "Strona") + ": brak identyfikatora pary 1:1.");
        return;
      }
      const key = kind + ":" + id;
      if (!groups.has(key)) groups.set(key, { kind: kind, pairId: id, puzzles: [], solutions: [] });
      groups.get(key)[pairRole(page) === "solution" ? "solutions" : "puzzles"].push(page);
    });

    let validPairs = 0;
    groups.forEach(function (group) {
      if (group.puzzles.length !== 1 || group.solutions.length !== 1) {
        const message = (group.kind === "maze" ? "Maze Studio" : "Word Search") +
          " — para " + group.pairId + ": oczekiwano 1 zadania i 1 rozwiązania, znaleziono " +
          group.puzzles.length + "/" + group.solutions.length + ".";
        if (settings && settings.includeSolutions === false) warnings.push(message);
        else critical.push(message);
        return;
      }
      const puzzle = group.puzzles[0];
      const solution = group.solutions[0];
      const linksOk = partnerId(puzzle) === String(solution.id || "") && partnerId(solution) === String(puzzle.id || "");
      if (!linksOk) {
        critical.push((group.kind === "maze" ? "Maze Studio" : "Word Search") + " — para " + group.pairId + ": nieprawidłowe połączenie zadanie–rozwiązanie.");
        return;
      }
      const seedA = pairSeed(puzzle);
      const seedB = pairSeed(solution);
      if (seedA && seedB && seedA !== seedB) {
        critical.push((group.kind === "maze" ? "Maze Studio" : "Word Search") + " — para " + group.pairId + ": zadanie i rozwiązanie mają różne seedy.");
        return;
      }
      const puzzleIncluded = includedIds.has(String(puzzle.id || ""));
      const solutionIncluded = includedIds.has(String(solution.id || ""));
      if (puzzleIncluded !== solutionIncluded && (!settings || settings.includeSolutions !== false)) {
        critical.push((group.kind === "maze" ? "Maze Studio" : "Word Search") + " — para " + group.pairId + ": tylko jedna strona pary jest włączona do książki.");
        return;
      }
      validPairs += 1;
    });

    return { validPairs: validPairs, groups: groups.size, critical: critical, warnings: warnings };
  }

  function auditProject(settings, basketPages, environment) {
    const currentSettings = settings || {};
    const included = getIncludedPages(basketPages);
    const critical = [];
    const warnings = [];
    const ids = new Set();
    let activities = 0;
    let solutions = 0;

    included.forEach(function (page) {
      const id = String(page.id || "");
      if (!id) critical.push((page.title || page.fileName || "Strona") + ": brak identyfikatora strony.");
      else if (ids.has(id)) critical.push("Powtórzony identyfikator strony: " + id + ".");
      else ids.add(id);
      if (!hasImagePayload(page)) critical.push((page.title || page.fileName || id || "Strona") + ": brak obrazu PNG do eksportu.");
      if (isSolutionPage(page)) solutions += 1;
      else activities += 1;
    });

    if (!activities) critical.push("Koszyk nie zawiera żadnej włączonej strony zadania.");

    const pairAudit = auditPairs(Array.isArray(basketPages) ? basketPages : [], currentSettings);
    critical.push.apply(critical, pairAudit.critical);
    warnings.push.apply(warnings, pairAudit.warnings);

    if (currentSettings.includeQrPage === true) {
      const qrCount = environment && Number.isFinite(Number(environment.qrCount)) ? Number(environment.qrCount) : 0;
      if (!qrCount) critical.push("Strona QR jest włączona, ale nie załadowano assetu QR.");
    }
    if (currentSettings.includeSolutions === false && solutions) {
      warnings.push("Rozwiązania są zapisane w Koszyku, ale globalna opcja rozwiązań jest wyłączona.");
    }

    const plan = buildPlan(currentSettings, basketPages);
    return {
      version: VERSION,
      ok: critical.length === 0,
      critical: Array.from(new Set(critical)),
      warnings: Array.from(new Set(warnings)),
      counts: {
        basketIncluded: included.length,
        activities: activities,
        solutions: solutions,
        validPairs: pairAudit.validPairs,
        logicalPages: plan.length,
        physicalPages: physicalPageCount(plan)
      },
      plan: plan
    };
  }

  function physicalPageCount(plan) {
    let count = 0;
    (Array.isArray(plan) ? plan : []).forEach(function (page) {
      if (page && page.ensureOddPage && (count + 1) % 2 === 0) count += 1;
      count += 1;
    });
    return count;
  }

  function browserPages() {
    return typeof root.getAvailableFenixPages === "function" ? (root.getAvailableFenixPages() || []) : [];
  }

  function browserEnvironment() {
    return { qrCount: root.MBG && Array.isArray(root.MBG.qrAssets) ? root.MBG.qrAssets.length : 0 };
  }

  function setStatus(message) {
    if (typeof root.setStatus === "function") root.setStatus(message);
    const node = root.document && root.document.getElementById("statusText");
    if (node) node.textContent = message;
  }

  function ensurePreflightPanel() {
    if (!root.document) return null;
    let node = root.document.getElementById("fenixProductionPreflight");
    if (node) return node;
    const generateBox = root.document.querySelector(".generate-box");
    if (!generateBox || !generateBox.parentElement) return null;
    node = root.document.createElement("section");
    node.id = "fenixProductionPreflight";
    node.className = "warning";
    node.setAttribute("aria-live", "polite");
    generateBox.parentElement.insertBefore(node, generateBox);
    return node;
  }

  function renderPreflight(report) {
    const node = ensurePreflightPanel();
    if (!node) return;
    node.classList.toggle("is-ready", report.ok);
    node.innerHTML = "";
    const title = root.document.createElement("strong");
    title.textContent = report.ok
      ? "Kontrola przed eksportem: GOTOWE"
      : "Kontrola przed eksportem: WYMAGA POPRAWY";
    node.appendChild(title);
    const summary = root.document.createElement("p");
    summary.textContent = "Zadania: " + report.counts.activities +
      " · rozwiązania: " + report.counts.solutions +
      " · poprawne pary 1:1: " + report.counts.validPairs +
      " · finalny PDF: " + report.counts.physicalPages + " stron";
    node.appendChild(summary);
    const messages = report.critical.concat(report.warnings);
    if (messages.length) {
      const list = root.document.createElement("ul");
      messages.forEach(function (message) {
        const item = root.document.createElement("li");
        item.textContent = message;
        list.appendChild(item);
      });
      node.appendChild(list);
    }
  }

  function runBrowserAudit() {
    if (typeof root.readSettings !== "function") return null;
    const report = auditProject(root.readSettings(), browserPages(), browserEnvironment());
    renderPreflight(report);
    return report;
  }

  function patchReadSettings() {
    if (typeof root.readSettings !== "function") return false;
    if (root.readSettings.__fenixProductionFlow) return true;
    originalReadSettings = root.readSettings;
    const patched = function () {
      const settings = originalReadSettings.apply(this, arguments) || {};
      const pages = getIncludedPages(browserPages());
      settings.fenixBasketEnabled = true;
      settings.internalMazeGeneratorDisabled = true;
      settings.mazeCount = pages.filter(function (page) {
        return page.sourceModule === "maze-studio" && !isSolutionPage(page);
      }).length;
      settings.includeShapeTracerPages = false;
      settings.shapeTracerPageCount = 0;
      settings.includeColoringPages = false;
      settings.coloringPageCount = 0;
      return settings;
    };
    patched.__fenixProductionFlow = true;
    patched.__fenixProductionOriginal = originalReadSettings;
    root.readSettings = patched;
    return true;
  }

  function patchPlanner() {
    root.buildBookPagePlan = function (settings) { return buildPlan(settings || root.readSettings(), browserPages()); };
    root.buildBookPagePlan.__fenixProductionFlow = true;
    root.buildPreviewPagePlan = function (settings, pageType, count) {
      return buildPreviewPlan(settings || root.readSettings(), pageType, count, browserPages());
    };
    root.buildPreviewPagePlan.__fenixProductionFlow = true;
    root.buildMixedPreviewPages = function (settings, limit) {
      return buildPreviewPlan(settings || root.readSettings(), "mixed", limit, browserPages());
    };
    root.buildAutoBookPreviewPages = function (settings, limit) {
      return buildPlan(settings || root.readSettings(), browserPages()).filter(function (page) { return page.type !== "blank"; }).slice(0, limit);
    };
  }

  function guardExport() {
    if (exportGuardRunning) return true;
    const report = runBrowserAudit();
    if (!report || report.ok) return true;
    const message = "Eksport zatrzymany. Popraw " + report.critical.length + " krytycznych problemów wskazanych w kontroli przed eksportem.";
    setStatus(message);
    if (typeof root.alert === "function") root.alert(message);
    return false;
  }

  function patchExport() {
    if (typeof root.generatePDF !== "function") return false;
    if (!root.generatePDF.__fenixProductionFlow) {
      originalGeneratePDF = root.generatePDF;
      const patched = async function () {
        if (!guardExport()) return;
        exportGuardRunning = true;
        try {
          return await originalGeneratePDF.apply(this, arguments);
        } finally {
          exportGuardRunning = false;
          root.setTimeout(runBrowserAudit, 0);
        }
      };
      patched.__fenixProductionFlow = true;
      patched.__fenixProductionOriginal = originalGeneratePDF;
      root.generatePDF = patched;
      root.generateFullPdf = patched;
    }

    const button = root.document && root.document.getElementById("generateBtn");
    if (button && !button.dataset.fenixProductionGuard) {
      button.dataset.fenixProductionGuard = "true";
      button.addEventListener("click", function (event) {
        if (!guardExport()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    }
    return true;
  }

  function bindRefresh() {
    if (!root.document || root.document.documentElement.dataset.fenixProductionRefreshBound) return;
    root.document.documentElement.dataset.fenixProductionRefreshBound = "true";
    root.document.addEventListener("change", function () { root.setTimeout(runBrowserAudit, 0); });
    root.addEventListener("focus", function () { root.setTimeout(runBrowserAudit, 0); });
    root.document.addEventListener("visibilitychange", function () {
      if (!root.document.hidden) root.setTimeout(runBrowserAudit, 0);
    });
  }

  function install() {
    if (installed || !root.document) return;
    attempts += 1;
    if (typeof root.readSettings !== "function" || typeof root.generatePDF !== "function" || typeof root.getAvailableFenixPages !== "function") {
      if (attempts < 200) root.setTimeout(install, 50);
      return;
    }
    patchReadSettings();
    patchPlanner();
    patchExport();
    bindRefresh();
    installed = true;
    root.document.documentElement.dataset.fenixProductionFlow = VERSION;
    root.setTimeout(runBrowserAudit, 0);
    if (root.FenixBookAudit && typeof root.FenixBookAudit.refresh === "function") root.FenixBookAudit.refresh();
    console.info("FENIX Production Flow " + VERSION + " aktywny.");
  }

  return {
    VERSION: VERSION,
    isSolutionPage: isSolutionPage,
    pairKind: pairKind,
    pairId: pairId,
    pairRole: pairRole,
    partnerId: partnerId,
    pairSeed: pairSeed,
    hasImagePayload: hasImagePayload,
    getIncludedPages: getIncludedPages,
    buildPlan: buildPlan,
    buildPreviewPlan: buildPreviewPlan,
    auditPairs: auditPairs,
    auditProject: auditProject,
    physicalPageCount: physicalPageCount,
    install: install
  };
});
