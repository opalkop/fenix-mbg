(function () {
  "use strict";

  const VERSION = "2026.07.30-5";
  const SOURCE_LABELS = {
    "complete-picture": "Complete the Picture",
    "coloring-studio": "Coloring Studio",
    "tracing-studio": "Tracing Studio",
    "matching-studio": "Matching Studio",
    "alphabet-studio": "Alphabet Studio",
    "math-studio": "Math Studio",
    "dot-to-dot-studio": "Dot to Dot Studio",
    "hidden-objects-studio": "Hidden Objects Studio",
    "logic-studio": "Logic Studio",
    "word-search-studio": "Word Search Studio",
    "direct-png": "Import PNG"
  };

  let installed = false;
  let attempts = 0;
  let renderScheduled = false;

  function el(id) {
    return document.getElementById(id);
  }

  function sourceLabel(source) {
    return SOURCE_LABELS[source] || source || "Inne / import";
  }

  function getAllBasketPages() {
    if (typeof window.getAvailableFenixPages !== "function") return [];
    const pages = window.getAvailableFenixPages();
    return Array.isArray(pages) ? pages.filter(Boolean) : [];
  }

  function isSolutionPage(page) {
    if (typeof window.isFenixSolutionPage === "function") return window.isFenixSolutionPage(page);
    if (!page) return false;
    if (page.isSolution === true || page.bookSection === "solutions") return true;
    return /solution|answer|rozwiaz/i.test([
      page.pageType,
      page.title,
      page.fileName,
      page.editSnapshot && page.editSnapshot.renderMode
    ].join(" "));
  }

  function hasRenderableBasketImage(page) {
    return !!(page && (page.blob || page.dataUrl));
  }

  function runtimeMbg() {
    return window.MBG && typeof window.MBG === "object" ? window.MBG : null;
  }

  function coloringAssetCount(settings) {
    try {
      if (typeof window.getColoringSourceAssets === "function") {
        const assets = window.getColoringSourceAssets(settings);
        return Array.isArray(assets) ? assets.length : 0;
      }
    } catch (error) {
      console.warn("FENIX AUDIT: nie udało się policzyć assetów legacy coloring.", error);
    }
    return 0;
  }

  function qrAssetCount() {
    const mbg = runtimeMbg();
    return mbg && Array.isArray(mbg.qrAssets) ? mbg.qrAssets.length : 0;
  }

  function hasCreatorMark() {
    const mbg = runtimeMbg();
    return !!(mbg && mbg.assets && mbg.assets.creatorMark);
  }

  function pageCategory(page) {
    if (!page) return { key: "unknown", label: "Nieznany typ strony" };
    if (page.type === "fenix_basket_page") {
      const solution = page.bookSection === "solutions" || page.isSolution === true;
      const source = sourceLabel(page.sourceModule);
      return {
        key: "basket:" + (solution ? "solution:" : "activity:") + (page.sourceModule || "other"),
        label: source + (solution ? " — rozwiązania" : " — zadania")
      };
    }

    const fixed = {
      intro: "Wstęp",
      "how-to": "How to Play",
      "mission-tracker": "Tracker postępu",
      "shape-tracer": "Legacy MBG — rysowanie po śladzie",
      coloring: "Legacy MBG — kolorowanki",
      maze: "Labirynty",
      solution: "Rozwiązania labiryntów",
      congrats: "Congratulations / CTA",
      qr: "Strona QR",
      certificate: "Certyfikat",
      blank: page.role === "certificate-blank-back" ? "Pusta strona za certyfikatem" : "Pusta strona"
    };

    return {
      key: page.type || "unknown",
      label: fixed[page.type] || ("Inny typ: " + (page.type || "brak"))
    };
  }

  function createRenderContext(settings) {
    return {
      legacyColoringAssets: coloringAssetCount(settings),
      qrAssets: qrAssetCount()
    };
  }

  function skipReasonForPage(page, context) {
    if (page.type === "coloring" && context.legacyColoringAssets === 0) {
      return "Legacy coloring jest włączone, ale nie ma zgodnych assetów — eksport pominie cały ten blok.";
    }
    if (page.type === "qr" && context.qrAssets === 0) {
      return "Strona QR jest włączona, ale nie wczytano assetu QR — eksport ją pominie.";
    }
    if (page.type === "fenix_basket_page" && !hasRenderableBasketImage(page)) {
      return "Strona z Koszyka nie ma obrazu PNG/data URL i zostanie pominięta: " + (page.title || page.fileName || "bez nazwy") + ".";
    }
    return "";
  }

  function simulatePhysicalPdf(settings) {
    const rawPlan = typeof window.buildBookPagePlan === "function" ? (window.buildBookPagePlan(settings) || []) : [];
    const context = createRenderContext(settings);
    const effective = [];
    const skipped = [];
    let pdfPageCount = 0;

    rawPlan.forEach(function (page) {
      const skipReason = skipReasonForPage(page, context);
      if (skipReason) {
        skipped.push({ page: page, reason: skipReason });
        return;
      }

      if (page.ensureOddPage && (pdfPageCount + 1) % 2 === 0) {
        pdfPageCount += 1;
        effective.push({
          type: "blank",
          role: "auto-before-certificate",
          pageNumber: pdfPageCount,
          auditAutoInserted: true
        });
      }

      pdfPageCount += 1;
      effective.push(Object.assign({}, page, { pageNumber: pdfPageCount }));
    });

    return {
      rawPlan: rawPlan,
      effective: effective,
      skipped: skipped,
      total: pdfPageCount,
      context: context
    };
  }

  function formatRanges(numbers) {
    if (!numbers.length) return "—";
    const sorted = Array.from(new Set(numbers)).sort(function (a, b) { return a - b; });
    const ranges = [];
    let start = sorted[0];
    let previous = sorted[0];

    for (let i = 1; i <= sorted.length; i += 1) {
      const current = sorted[i];
      if (current === previous + 1) {
        previous = current;
        continue;
      }
      ranges.push(start === previous ? String(start) : start + "–" + previous);
      start = current;
      previous = current;
    }
    return ranges.join(", ");
  }

  function collectRows(effectivePlan) {
    const rows = new Map();
    effectivePlan.forEach(function (page) {
      const category = page.auditAutoInserted
        ? { key: "blank:auto-before-certificate", label: "Automatyczna pusta przed certyfikatem" }
        : pageCategory(page);
      if (!rows.has(category.key)) rows.set(category.key, { label: category.label, count: 0, pages: [] });
      const row = rows.get(category.key);
      row.count += 1;
      row.pages.push(page.pageNumber);
    });
    return Array.from(rows.values());
  }

  function pagePairId(page) {
    return page.wordSearchPairId || (page.editSnapshot && page.editSnapshot.wordSearchPairId) || "";
  }

  function pagePairSeed(page) {
    if (page.wordSearchPairSeed !== undefined) return page.wordSearchPairSeed;
    if (page.editSnapshot && page.editSnapshot.wordSearchPairSeed !== undefined) return page.editSnapshot.wordSearchPairSeed;
    return page.editSnapshot && page.editSnapshot.settings ? page.editSnapshot.settings.seed : undefined;
  }

  function pagePartnerId(page) {
    return page.wordSearchPartnerId || (page.editSnapshot && page.editSnapshot.wordSearchPartnerId) || "";
  }

  function auditWordSearchPages(pages) {
    const included = pages.filter(function (page) {
      return page.includeInBook !== false && page.sourceModule === "word-search-studio";
    });
    const pairs = new Map();
    let unpairedPuzzles = 0;
    let unpairedSolutions = 0;

    included.forEach(function (page) {
      const role = isSolutionPage(page) ? "solution" : "puzzle";
      const pairId = pagePairId(page);
      if (!pairId) {
        if (role === "solution") unpairedSolutions += 1;
        else unpairedPuzzles += 1;
        return;
      }
      if (!pairs.has(pairId)) pairs.set(pairId, { puzzles: [], solutions: [] });
      pairs.get(pairId)[role === "solution" ? "solutions" : "puzzles"].push(page);
    });

    let validPairs = 0;
    let orphanPairs = 0;
    let duplicatePairRoles = 0;
    let seedMismatches = 0;
    let brokenPartnerLinks = 0;

    pairs.forEach(function (pair) {
      if (pair.puzzles.length === 1 && pair.solutions.length === 1) {
        const puzzle = pair.puzzles[0];
        const solution = pair.solutions[0];
        const puzzleSeed = pagePairSeed(puzzle);
        const solutionSeed = pagePairSeed(solution);
        const seedsMatch = puzzleSeed === undefined || solutionSeed === undefined || String(puzzleSeed) === String(solutionSeed);
        const linksMatch = (!pagePartnerId(puzzle) || pagePartnerId(puzzle) === solution.id) &&
          (!pagePartnerId(solution) || pagePartnerId(solution) === puzzle.id);
        if (!seedsMatch) seedMismatches += 1;
        if (!linksMatch) brokenPartnerLinks += 1;
        if (seedsMatch && linksMatch) validPairs += 1;
      } else {
        orphanPairs += 1;
        if (pair.puzzles.length > 1 || pair.solutions.length > 1) duplicatePairRoles += 1;
      }
    });

    return {
      puzzles: included.filter(function (page) { return !isSolutionPage(page); }).length,
      solutions: included.filter(isSolutionPage).length,
      validPairs: validPairs,
      orphanPairs: orphanPairs,
      duplicatePairRoles: duplicatePairRoles,
      unpairedPuzzles: unpairedPuzzles,
      unpairedSolutions: unpairedSolutions,
      seedMismatches: seedMismatches,
      brokenPartnerLinks: brokenPartnerLinks
    };
  }

  function hasBasketSource(pages, sourceModule) {
    return pages.some(function (page) {
      return page.includeInBook !== false && page.sourceModule === sourceModule && !isSolutionPage(page);
    });
  }

  function buildWarnings(settings, simulation, basketPages, wordSearchAudit) {
    const warnings = new Set();
    const includedBasket = basketPages.filter(function (page) { return page.includeInBook !== false; });
    const includedSolutions = includedBasket.filter(isSolutionPage);
    const ids = new Set();
    const duplicateIds = new Set();

    basketPages.forEach(function (page) {
      if (!page.id) return;
      if (ids.has(page.id)) duplicateIds.add(page.id);
      ids.add(page.id);
    });

    simulation.skipped.forEach(function (item) { warnings.add(item.reason); });
    if (duplicateIds.size) warnings.add("Koszyk zawiera powtórzone identyfikatory stron: " + duplicateIds.size + ".");
    if (!settings.fenixBasketEnabled && includedBasket.length) warnings.add("Koszyk ma " + includedBasket.length + " włączonych stron, ale blok Koszyka w Book Builderze jest wyłączony.");
    if (!settings.includeSolutions && includedSolutions.length) warnings.add("Koszyk ma " + includedSolutions.length + " stron rozwiązań, ale globalny przełącznik rozwiązań jest wyłączony.");

    if (wordSearchAudit.unpairedPuzzles) warnings.add("Word Search: " + wordSearchAudit.unpairedPuzzles + " zadanie/zadania nie mają identyfikatora pary 1:1.");
    if (wordSearchAudit.unpairedSolutions) warnings.add("Word Search: " + wordSearchAudit.unpairedSolutions + " rozwiązanie/rozwiązania nie mają identyfikatora pary 1:1.");
    if (wordSearchAudit.orphanPairs) warnings.add("Word Search: " + wordSearchAudit.orphanPairs + " para/pary są niekompletne albo niejednoznaczne.");
    if (wordSearchAudit.duplicatePairRoles) warnings.add("Word Search: wykryto więcej niż jedno zadanie lub rozwiązanie z tym samym identyfikatorem pary.");
    if (wordSearchAudit.seedMismatches) warnings.add("Word Search: " + wordSearchAudit.seedMismatches + " para/pary mają różne seedy zadania i rozwiązania.");
    if (wordSearchAudit.brokenPartnerLinks) warnings.add("Word Search: " + wordSearchAudit.brokenPartnerLinks + " para/pary mają niespójne odnośniki między zadaniem a rozwiązaniem.");

    const mazeCount = Number(settings.mazeCount || 0);
    const trackerFooter = String(settings.missionTrackerFooter || "");
    const trackerNumber = trackerFooter.match(/\b(\d+)\b/);
    if (settings.includeMissionTracker && settings.missionTrackerUseAutoCount && trackerNumber && Number(trackerNumber[1]) !== mazeCount) {
      warnings.add("Tracker ma " + mazeCount + " gwiazdek, ale tekst stopki mówi o " + trackerNumber[1] + ".");
    }
    if (/\bcount\b/i.test(String(settings.howToLines || "")) && !hasBasketSource(basketPages, "math-studio")) {
      warnings.add("Instrukcja zawiera słowo „count”, ale w Koszyku nie ma zadań z Math Studio.");
    }
    if (settings.certificateUseCreatorMark && !hasCreatorMark()) {
      warnings.add("Znak autora jest włączony, ale nie wczytano grafiki podpisu / Creator Mark.");
    }

    return Array.from(warnings);
  }

  function ensurePanel() {
    let panel = el("mbgBookAuditPanel");
    if (panel) return panel;
    const generateBox = document.querySelector(".generate-box");
    if (!generateBox || !generateBox.parentElement) return null;
    panel = document.createElement("section");
    panel.id = "mbgBookAuditPanel";
    panel.className = "mbg-book-audit-panel";
    panel.setAttribute("aria-live", "polite");
    generateBox.parentElement.insertBefore(panel, generateBox);
    return panel;
  }

  function renderAudit() {
    renderScheduled = false;
    if (typeof window.readSettings !== "function" || typeof window.buildBookPagePlan !== "function") return;
    const panel = ensurePanel();
    if (!panel) return;

    const settings = window.readSettings();
    const basketPages = getAllBasketPages();
    const simulation = simulatePhysicalPdf(settings);
    const rows = collectRows(simulation.effective);
    const wordSearchAudit = auditWordSearchPages(basketPages);
    const warnings = buildWarnings(settings, simulation, basketPages, wordSearchAudit);
    const excludedBasket = basketPages.filter(function (page) { return page.includeInBook === false; }).length;
    const includedBasket = basketPages.length - excludedBasket;

    panel.classList.toggle("has-warning", warnings.length > 0);
    panel.replaceChildren();

    const head = document.createElement("div");
    head.className = "mbg-book-audit-head";
    const titleWrap = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.className = "mbg-book-audit-eyebrow";
    eyebrow.textContent = "AUDYT FINALNEGO PDF · " + VERSION;
    const title = document.createElement("strong");
    title.textContent = "Planowana książka: " + simulation.total + " stron";
    const subtitle = document.createElement("p");
    subtitle.textContent = "Bilans pokazuje faktyczną kolejność, numery stron, pomijane elementy oraz obie strony techniczne certyfikatu.";
    titleWrap.append(eyebrow, title, subtitle);
    const status = document.createElement("span");
    status.className = "mbg-book-audit-status";
    status.textContent = warnings.length ? warnings.length + " uwag" : "Plan spójny";
    head.append(titleWrap, status);
    panel.appendChild(head);

    const table = document.createElement("div");
    table.className = "mbg-book-audit-table";
    const tableHead = document.createElement("div");
    tableHead.className = "mbg-book-audit-row is-head";
    ["Rodzaj strony", "Liczba", "Numery stron"].forEach(function (text) {
      const cell = document.createElement("span");
      cell.textContent = text;
      tableHead.appendChild(cell);
    });
    table.appendChild(tableHead);

    rows.forEach(function (row) {
      const line = document.createElement("div");
      line.className = "mbg-book-audit-row";
      const label = document.createElement("span");
      label.textContent = row.label;
      const count = document.createElement("strong");
      count.textContent = String(row.count);
      const pages = document.createElement("span");
      pages.textContent = formatRanges(row.pages);
      line.append(label, count, pages);
      table.appendChild(line);
    });
    panel.appendChild(table);

    const meta = document.createElement("div");
    meta.className = "mbg-book-audit-meta";
    meta.innerHTML = "<strong>Koszyk zapisany:</strong> " + includedBasket + " włączonych · " + excludedBasket + " wyłączonych" +
      " <span>•</span> <strong>Word Search w Koszyku:</strong> " + wordSearchAudit.puzzles + " zadań · " + wordSearchAudit.solutions + " rozwiązań · " + wordSearchAudit.validPairs + " poprawnych par 1:1";
    panel.appendChild(meta);

    const total = document.createElement("div");
    total.className = "mbg-book-audit-total";
    total.innerHTML = "<span>RAZEM DO PDF</span><strong>" + simulation.total + " stron</strong>";
    panel.appendChild(total);

    if (warnings.length) {
      const warningBox = document.createElement("div");
      warningBox.className = "mbg-book-audit-warnings";
      const warningTitle = document.createElement("strong");
      warningTitle.textContent = "Do sprawdzenia przed eksportem";
      const list = document.createElement("ul");
      warnings.forEach(function (warning) {
        const item = document.createElement("li");
        item.textContent = warning;
        list.appendChild(item);
      });
      warningBox.append(warningTitle, list);
      panel.appendChild(warningBox);
    }
  }

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    window.setTimeout(renderAudit, 0);
  }

  function injectStyles() {
    if (el("mbgBookAuditStyles")) return;
    const style = document.createElement("style");
    style.id = "mbgBookAuditStyles";
    style.textContent = [
      "#mbgFinalPlanSummary,#mbgQaConsistencyPanel,#mbgFixVersionBadge,#mbgQaFixVersionBadge,#wordSearchOrderFixBadge{display:none!important}",
      ".mbg-book-audit-panel{margin:0 0 18px;padding:18px;border:1px solid rgba(70,220,160,.48);border-left:5px solid rgba(70,220,160,.92);border-radius:14px;background:linear-gradient(180deg,rgba(20,63,54,.70),rgba(11,25,31,.96));color:#effff8;box-shadow:0 16px 36px rgba(0,0,0,.24)}",
      ".mbg-book-audit-panel.has-warning{border-color:rgba(255,190,98,.60);border-left-color:#ffc46d;background:linear-gradient(180deg,rgba(78,52,24,.72),rgba(28,24,24,.97))}",
      ".mbg-book-audit-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:14px}",
      ".mbg-book-audit-head strong{display:block;font-size:21px;line-height:1.25}",
      ".mbg-book-audit-head p{margin:6px 0 0;color:#d7e8e4;line-height:1.45}",
      ".mbg-book-audit-eyebrow{display:block;margin-bottom:6px;color:#a5f3fc;font-size:11px;font-weight:950;letter-spacing:.11em}",
      ".mbg-book-audit-status{flex:0 0 auto;padding:7px 11px;border:1px solid rgba(70,220,160,.52);border-radius:999px;background:rgba(30,160,105,.20);color:#ceffea;font-size:12px;font-weight:950}",
      ".mbg-book-audit-panel.has-warning .mbg-book-audit-status{border-color:rgba(255,190,98,.58);background:rgba(170,99,28,.24);color:#fff1d3}",
      ".mbg-book-audit-table{overflow:hidden;border:1px solid rgba(157,185,202,.25);border-radius:10px;background:rgba(5,14,23,.26)}",
      ".mbg-book-audit-row{display:grid;grid-template-columns:minmax(210px,1fr) 90px minmax(130px,.55fr);gap:12px;align-items:center;padding:9px 12px;border-top:1px solid rgba(157,185,202,.16)}",
      ".mbg-book-audit-row:first-child{border-top:0}",
      ".mbg-book-audit-row.is-head{background:rgba(85,214,255,.09);color:#c8f5ff;font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}",
      ".mbg-book-audit-row>strong{color:#ffffff;font-size:16px}",
      ".mbg-book-audit-meta{margin-top:12px;padding:10px 12px;border-radius:9px;background:rgba(85,214,255,.07);border:1px solid rgba(85,214,255,.20);line-height:1.5}",
      ".mbg-book-audit-meta span{margin:0 5px;color:#8aa4b7}",
      ".mbg-book-audit-total{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-top:12px;padding:12px 14px;border-radius:10px;background:linear-gradient(90deg,rgba(255,196,109,.18),rgba(85,214,255,.12));border:1px solid rgba(255,196,109,.42)}",
      ".mbg-book-audit-total span{font-size:12px;font-weight:950;letter-spacing:.10em}",
      ".mbg-book-audit-total strong{font-size:22px;color:#fff4d9}",
      ".mbg-book-audit-warnings{margin-top:12px;padding:12px 14px;border-radius:10px;background:rgba(127,62,20,.22);border:1px solid rgba(255,190,98,.38)}",
      ".mbg-book-audit-warnings strong{display:block;margin-bottom:6px}",
      ".mbg-book-audit-warnings ul{margin:0;padding-left:21px;line-height:1.5}",
      "html[data-fenix-theme='light'] .mbg-book-audit-panel{background:#ffffff!important;color:#172033!important;border-color:#86bfae!important;box-shadow:0 12px 28px rgba(15,23,42,.10)!important}",
      "html[data-fenix-theme='light'] .mbg-book-audit-panel.has-warning{border-color:#e7b66b!important}",
      "html[data-fenix-theme='light'] .mbg-book-audit-head p{color:#64748b!important}",
      "html[data-fenix-theme='light'] .mbg-book-audit-table{background:#f8fafc!important;border-color:#cbd5e1!important}",
      "html[data-fenix-theme='light'] .mbg-book-audit-row{border-color:#e2e8f0!important}",
      "html[data-fenix-theme='light'] .mbg-book-audit-row.is-head{background:#e9f5f8!important;color:#155e75!important}",
      "html[data-fenix-theme='light'] .mbg-book-audit-row>strong{color:#172033!important}",
      "html[data-fenix-theme='light'] .mbg-book-audit-meta{background:#f0f9ff!important;border-color:#bae6fd!important}",
      "html[data-fenix-theme='light'] .mbg-book-audit-total{background:linear-gradient(90deg,#fff7ed,#ecfeff)!important;border-color:#fdba74!important}",
      "html[data-fenix-theme='light'] .mbg-book-audit-total strong{color:#9a3412!important}",
      "html[data-fenix-theme='light'] .mbg-book-audit-warnings{background:#fff7ed!important;border-color:#fdba74!important;color:#7c2d12!important}",
      "@media(max-width:760px){.mbg-book-audit-head{flex-direction:column}.mbg-book-audit-row{grid-template-columns:1fr 58px}.mbg-book-audit-row>*:last-child{grid-column:1/-1;color:inherit}.mbg-book-audit-status{align-self:flex-start}}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function wrapRefreshFunctions() {
    ["renderFenixBasketList", "updateFenixBasketStatus", "refreshFenixBasket"].forEach(function (name) {
      const original = window[name];
      if (typeof original !== "function" || original.__fenixAuditWrapped) return;
      const wrapped = function () {
        const result = original.apply(this, arguments);
        if (result && typeof result.then === "function") result.finally(scheduleRender);
        else scheduleRender();
        return result;
      };
      wrapped.__fenixAuditWrapped = true;
      window[name] = wrapped;
    });
  }

  function install() {
    if (installed) return;
    attempts += 1;
    if (typeof window.readSettings !== "function" || typeof window.buildBookPagePlan !== "function") {
      if (attempts < 120) window.setTimeout(install, 50);
      return;
    }

    installed = true;
    injectStyles();
    wrapRefreshFunctions();
    document.addEventListener("change", scheduleRender, true);
    document.addEventListener("input", scheduleRender, true);
    window.addEventListener("focus", scheduleRender);
    window.addEventListener("fenix-theme-change", scheduleRender);
    window.FenixBookAudit = { refresh: renderAudit, version: VERSION };
    renderAudit();
    console.info("FENIX Book Audit active:", VERSION);
  }

  install();
})();
