"use strict";

/*
  MBG — Maze Book Generator
  Version: Difficulty Engine + Mask + Deco + B&W Safe
  Page size: 8.5 x 11 in at 300 DPI = 2550 x 3300 px
*/

const MBG = {
  PAGE_W: 2550,
  PAGE_H: 3300,
  assets: {
    start: null,
    goal: null,
    checkpoint: null,
    enemy: null,
    mask: null,
    creatorMark: null
  },
  maskAssets: [],
  decoAssets: [],
  qrAssets: [],
  assetLibrary: {
    manifest: null,
    assets: [],
    selectedIds: new Set(),
    selectionSeed: Math.floor(Math.random() * 2147483646) + 1,
    loaded: false,
    error: null
  },
  lastPreviewMaze: null,
  previewPageOffset: 0,
  fenixBasket: {
    pages: [],
    importedPages: [],
    objectUrls: [],
    loaded: false,
    error: null
  }
};

let isPdfExportRunning = false;

const FENIX_BOOK_BASKET_DB_NAME = "fenixBookBasketDb";
const FENIX_BOOK_BASKET_STORE_NAME = "pages";
const FENIX_BOOK_BASKET_DB_VERSION = 1;

document.addEventListener("DOMContentLoaded", function () {
  bindMainAssetInputs();
  bindMaskInput();
  bindDecoInput();
  bindQrInput();
  bindMaskOutlineControls();
  bindShapeTracerControls();
  bindAssetLibraryControls();
  bindColoringPageControls();
  bindFenixBasketControls();
  bindFenixBasketAutoRefresh();
  bindMbgOptionUi();
  loadAssetLibrary();
  refreshFenixBasket();
  updateMbgOptionUi();

  const previewCanvas = document.getElementById("previewCanvas");
  if (previewCanvas) {
    previewCanvas.width = MBG.PAGE_W;
    previewCanvas.height = MBG.PAGE_H;
    generatePreview();
  }
});

/* ============================================================
   BASIC HELPERS
============================================================ */

function el(id) {
  return document.getElementById(id);
}

function getValue(id, fallback = "") {
  const node = el(id);
  if (!node) return fallback;
  return node.value !== undefined ? node.value : fallback;
}

function isBadPrintableValue(value) {
  const normalized = String(value || "").trim().toLowerCase();

  // Values like these come from select options, checkboxes or unfinished placeholder fields.
  // They must never be printed on KDP pages or certificates.
  return (
    !normalized ||
    normalized === "true" ||
    normalized === "false" ||
    normalized === "tak" ||
    normalized === "nie" ||
    normalized === "yes" ||
    normalized === "no" ||
    normalized === "custom" ||
    normalized === "default" ||
    normalized === "undefined" ||
    normalized === "null"
  );
}

function getTextValueOnly(id, fallback = "") {
  const node = el(id);
  if (!node) return fallback;

  // Prevent checkbox/radio values such as "true" from being printed on pages.
  if (node.type === "checkbox" || node.type === "radio") return fallback;

  const value = node.value !== undefined ? String(node.value).trim() : "";
  if (isBadPrintableValue(value)) return fallback;

  return value;
}

function readPrintableControlValue(node, fallback = "") {
  if (!node) return fallback;
  const type = String(node.type || "").toLowerCase();
  if (type === "checkbox" || type === "radio" || type === "file" || type === "button" || type === "submit") return fallback;
  const value = node.value !== undefined ? String(node.value).trim() : "";
  if (isBadPrintableValue(value)) return fallback;
  return value;
}

function getFirstTextValueOnly(ids, fallback = "") {
  for (const id of ids || []) {
    const value = getTextValueOnly(id, "");
    if (value) return value;
  }
  return fallback;
}

function findControlNearElement(node) {
  if (!node) return null;
  const validSelector = "input:not([type='checkbox']):not([type='radio']):not([type='file']), textarea, select";
  if (node.matches && node.matches(validSelector)) return node;
  const direct = node.querySelector ? node.querySelector(validSelector) : null;
  if (direct) return direct;
  let parent = node.parentElement;
  for (let depth = 0; parent && depth < 4; depth++) {
    const inParent = parent.querySelector(validSelector);
    if (inParent) return inParent;
    let sibling = parent.nextElementSibling;
    for (let i = 0; sibling && i < 4; i++) {
      const inSibling = sibling.querySelector ? sibling.querySelector(validSelector) : null;
      if (inSibling) return inSibling;
      if (sibling.matches && sibling.matches(validSelector)) return sibling;
      sibling = sibling.nextElementSibling;
    }
    parent = parent.parentElement;
  }
  return null;
}

function getTextValueByLabels(labelPhrases, fallback = "") {
  const phrases = (labelPhrases || []).map(x => String(x || "").toLowerCase().trim()).filter(Boolean);
  if (!phrases.length) return fallback;
  const labelNodes = Array.from(document.querySelectorAll("label"));
  for (const label of labelNodes) {
    const text = String(label.textContent || "").toLowerCase().trim();
    if (!phrases.some(p => text.includes(p))) continue;
    const forId = label.getAttribute("for");
    if (forId) {
      const value = readPrintableControlValue(el(forId), "");
      if (value) return value;
    }
    const value = readPrintableControlValue(findControlNearElement(label), "");
    if (value) return value;
  }
  const textNodes = Array.from(document.querySelectorAll("div, p, span, strong, h1, h2, h3, h4"));
  for (const node of textNodes) {
    const text = String(node.textContent || "").toLowerCase().trim();
    if (!phrases.some(p => text.includes(p))) continue;
    const value = readPrintableControlValue(findControlNearElement(node), "");
    if (value) return value;
  }
  return fallback;
}

function getTextSetting(candidateIds, labelPhrases, fallback = "") {
  const fromId = getFirstTextValueOnly(candidateIds, "");
  if (fromId) return fromId;
  const fromLabel = getTextValueByLabels(labelPhrases, "");
  if (fromLabel) return fromLabel;
  return fallback;
}

function parseFlexibleNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;

  const normalized = String(value)
    .trim()
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getNumber(id, fallback = 0) {
  const node = el(id);
  if (!node) return fallback;
  return parseFlexibleNumber(node.value, fallback);
}

function getBool(id, fallback = false) {
  const node = el(id);
  if (!node) return fallback;

  if (node.type === "checkbox") return !!node.checked;

  const value = String(node.value).toLowerCase().trim();
  return value === "true" || value === "tak" || value === "yes" || value === "1";
}

const MBG_OPTION_UI = [
  {
    id: "autoDifficulty",
    description: "Automatycznie dopasowuje siatkę i parametry do wybranego poziomu trudności."
  },
  {
    id: "enableMaskOutline",
    description: "Pokazuje pomocniczą siatkę lub kontur labiryntu. Przydatne do testów, zwykle wyłączone w finalnej książce."
  },
  {
    id: "useMask",
    description: "Ogranicza labirynt do kształtu maski, jeśli wczytano asset maski."
  },
  {
    id: "showMaskGuide",
    description: "Pokazuje pomocniczy podgląd maski podczas kontroli układu."
  },
  {
    id: "decoEnabled",
    description: "Dodaje dekoracje do wybranych typów stron."
  },
  {
    id: "fenixBasketEnabled",
    description: "Wstawia gotowe strony z modułów Fenixa, np. Complete the Picture lub Coloring Studio."
  },
  {
    id: "includeMissionTracker",
    description: "Dodaje stronę trackera postępu przed labiryntami."
  },
  {
    id: "includeShapeTracerPages",
    description: "Historyczne rysowanie po śladzie w MBG; zwykle zastępowane osobnym modułem."
  },
  {
    id: "includeColoringPages",
    description: "Historyczne kolorowanki MBG z assetów labiryntu; nowe strony lepiej tworzyć w Coloring Studio."
  },
  {
    id: "includeCongratsPage",
    description: "Dodaje stronę gratulacyjną po aktywnościach."
  },
  {
    id: "includeQrPage",
    description: "Dodaje stronę z kodami QR, jeśli skonfigurowano assety QR."
  },
  {
    id: "includeCertificatePage",
    description: "Dodaje końcowy certyfikat do wycięcia lub wypełnienia."
  },
  {
    id: "includeIntroPages",
    description: "Dodaje strony wstępne i How to Play na początku książki."
  },
  {
    id: "includeSolutions",
    description: "Dodaje strony rozwiązań na końcu książki."
  }
];

function bindMbgOptionUi() {
  MBG_OPTION_UI.forEach(function (option) {
    const control = el(option.id);
    if (!control) return;

    const host = control.closest("div") || control.parentElement;
    if (!host) return;
    host.classList.add("mbg-option-card");
    host.dataset.optionControlId = option.id;

    if (!host.querySelector(".mbg-option-status")) {
      const status = document.createElement("span");
      status.className = "mbg-option-status";
      status.setAttribute("aria-hidden", "true");
      host.appendChild(status);
    }

    if (option.description && !host.querySelector(".mbg-option-description")) {
      const description = document.createElement("p");
      description.className = "note mbg-option-description";
      description.textContent = option.description;
      host.appendChild(description);
    }

    control.addEventListener("change", updateMbgOptionUi);
    control.addEventListener("input", updateMbgOptionUi);
  });

  const formControls = document.querySelectorAll("input, select, textarea");
  formControls.forEach(function (control) {
    control.addEventListener("change", updateActiveBookBlocksSummary);
  });
}

function updateMbgOptionUi() {
  MBG_OPTION_UI.forEach(function (option) {
    const control = el(option.id);
    if (!control) return;
    const host = control.closest(".mbg-option-card");
    const status = host ? host.querySelector(".mbg-option-status") : null;
    const enabled = getBool(option.id, false);

    if (host) {
      host.classList.toggle("is-enabled", enabled);
      host.classList.toggle("is-disabled", !enabled);
    }
    if (status) {
      status.textContent = enabled ? "Włączone" : "Wyłączone";
    }
  });

  updateActiveBookBlocksSummary();
}

function updateActiveBookBlocksSummary() {
  const summary = el("activeBookBlocksSummary");
  if (!summary) return;

  const availableFenixPages = getAvailableFenixPages();
  const items = [
    ["Labirynty", getNumber("mazeCount", 0) > 0],
    ["Strony z modułów Fenixa", getBool("fenixBasketEnabled", false) && availableFenixPages.length > 0],
    ["Solutions", getBool("includeSolutions", false)],
    ["Tracker", getBool("includeMissionTracker", false)],
    ["QR", getBool("includeQrPage", false)],
    ["Certificate", getBool("includeCertificatePage", false)],
    ["Congratulations", getBool("includeCongratsPage", false)]
  ];

  summary.replaceChildren();
  items.forEach(function (item) {
    const chip = document.createElement("span");
    chip.className = item[1] ? "active-book-chip is-enabled" : "active-book-chip";
    chip.textContent = item[0] + ": " + (item[1] ? "Włączone" : "Wyłączone");
    summary.appendChild(chip);
  });
}

function bindMaskOutlineControls() {
  bindSyncedNumberPair("maskOutlineThickness", "maskOutlineThicknessValue", 1, 1, 20);
  bindSyncedNumberPair("maskOutlineOffset", "maskOutlineOffsetValue", 1, 0, 40);
  bindSyncedNumberPair("maskOutlineGap", "maskOutlineGapValue", 2, 0, 40);
  bindSyncedNumberPair("maskOutlineOpacity", "maskOutlineOpacityValue", 45, 10, 100);
}

function syncMaskOutlineControls() {
  syncNumberPairValue("maskOutlineThickness", "maskOutlineThicknessValue", 1, 1, 20);
  syncNumberPairValue("maskOutlineOffset", "maskOutlineOffsetValue", 1, 0, 40);
  syncNumberPairValue("maskOutlineGap", "maskOutlineGapValue", 2, 0, 40);
  syncNumberPairValue("maskOutlineOpacity", "maskOutlineOpacityValue", 45, 10, 100);
}

function bindShapeTracerControls() {
  bindSyncedNumberPair("shapeTracerLineThickness", "shapeTracerLineThicknessValue", 8, 2, 24);
  bindSyncedNumberPair("shapeTracerOpacity", "shapeTracerOpacityValue", 70, 10, 100);
  bindSyncedNumberPair("generatedTraceComplexity", "generatedTraceComplexityValue", 6, 1, 20);
  bindSyncedNumberPair("generatedTraceScale", "generatedTraceScaleValue", 92, 50, 120);
}

function syncShapeTracerControls() {
  syncNumberPairValue("shapeTracerLineThickness", "shapeTracerLineThicknessValue", 8, 2, 24);
  syncNumberPairValue("shapeTracerOpacity", "shapeTracerOpacityValue", 70, 10, 100);
  syncNumberPairValue("generatedTraceComplexity", "generatedTraceComplexityValue", 6, 1, 20);
  syncNumberPairValue("generatedTraceScale", "generatedTraceScaleValue", 92, 50, 120);
}

function bindAssetLibraryControls() {
  const filter = el("assetLibraryFilter");
  if (filter) {
    filter.addEventListener("change", function () {
      renderAssetLibraryBrowser();
    });
  }

  const selectAll = el("assetLibrarySelectAll");
  if (selectAll) {
    selectAll.addEventListener("click", function () {
      const ids = getFilteredAssetLibraryItems().map(item => item.id);
      setAssetLibrarySelection(ids, true);
    });
  }

  const selectShapes = el("assetLibrarySelectShapes");
  if (selectShapes) {
    selectShapes.addEventListener("click", function () {
      setAssetLibrarySelection(getAssetLibraryItemsByCategory("shapes").map(item => item.id), true);
    });
  }

  const selectSymbols = el("assetLibrarySelectSymbols");
  if (selectSymbols) {
    selectSymbols.addEventListener("click", function () {
      setAssetLibrarySelection(getAssetLibraryItemsByCategory("symbols").map(item => item.id), true);
    });
  }

  const selectLines = el("assetLibrarySelectLines");
  if (selectLines) {
    selectLines.addEventListener("click", function () {
      setAssetLibrarySelection(getAssetLibraryItemsByCategory("lines").map(item => item.id), true);
    });
  }

  const clearSelection = el("assetLibraryClearSelection");
  if (clearSelection) {
    clearSelection.addEventListener("click", function () {
      setAssetLibrarySelection([], true);
    });
  }

  const grid = el("assetLibraryGrid");
  if (grid) {
    grid.addEventListener("change", function (event) {
      const checkbox = event.target && event.target.closest
        ? event.target.closest(".asset-library-checkbox")
        : null;
      if (!checkbox) return;

      if (checkbox.checked) MBG.assetLibrary.selectedIds.add(checkbox.value);
      else MBG.assetLibrary.selectedIds.delete(checkbox.value);

      renewAssetLibrarySelectionSeed();
      syncAssetLibrarySelectionToField();
      renderAssetLibraryBrowser();
      generatePreview();
    });
  }
}

function bindColoringPageControls() {
  bindSyncedNumberPair("coloringAssetScale", "coloringAssetScaleValue", 92, 40, 140);
}

function syncColoringPageControls() {
  syncNumberPairValue("coloringAssetScale", "coloringAssetScaleValue", 92, 40, 140);
}

function bindSyncedNumberPair(sliderId, numberId, fallback, min, max) {
  const slider = el(sliderId);
  const number = el(numberId);
  if (!slider || !number) return;

  syncNumberPairValue(sliderId, numberId, fallback, min, max);

  if (slider.dataset.mbgOutlineSyncBound === "true") return;
  slider.dataset.mbgOutlineSyncBound = "true";
  number.dataset.mbgOutlineSyncBound = "true";

  slider.addEventListener("input", function () {
    syncNumberPairValue(sliderId, numberId, fallback, min, max, sliderId);
  });

  number.addEventListener("input", function () {
    syncNumberPairValue(sliderId, numberId, fallback, min, max, numberId);
  });

  number.addEventListener("change", function () {
    syncNumberPairValue(sliderId, numberId, fallback, min, max, numberId);
  });
}

function syncNumberPairValue(sliderId, numberId, fallback, min, max, sourceId) {
  const slider = el(sliderId);
  const number = el(numberId);
  if (!slider || !number) return;

  const source = sourceId === numberId ? number : slider;
  const value = clamp(parseFlexibleNumber(source.value, fallback), min, max);
  slider.value = value;
  number.value = value;
}

function setControlValue(id, value) {
  const node = el(id);
  if (!node) return;

  if (node.type === "checkbox") {
    node.checked = !!value;
  } else {
    node.value = value;
  }
}

function applySubtleKdpOutlinePreset() {
  setControlValue("enableMaskOutline", true);
  setControlValue("maskOutlineStyle", "solid");
  setControlValue("maskOutlineSource", "original-mask");
  setControlValue("maskOutlineRenderMode", "smooth");
  setControlValue("maskOutlinePlacement", "outside");
  setControlValue("maskOutlineThickness", 1);
  setControlValue("maskOutlineThicknessValue", 1);
  setControlValue("maskOutlineOffset", 1);
  setControlValue("maskOutlineOffsetValue", 1);
  setControlValue("maskOutlineGap", 2);
  setControlValue("maskOutlineGapValue", 2);
  setControlValue("maskOutlineOpacity", 45);
  setControlValue("maskOutlineOpacityValue", 45);
  syncMaskOutlineControls();
  updateMbgOptionUi();

  if (typeof generatePreview === "function") {
    generatePreview();
  }
}

function setStatus(message) {
  const status = el("statusText");
  if (status) status.textContent = message;
}

function setPdfExportButtonRunning(isRunning) {
  const button = el("generateBtn");
  if (!button) return;
  button.disabled = isRunning;
  button.textContent = isRunning ? "Generuję PDF..." : "Generuj PDF";
}

function openFenixBookBasketDb() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB nie jest dostępny w tej przeglądarce."));
      return;
    }

    const request = indexedDB.open(FENIX_BOOK_BASKET_DB_NAME, FENIX_BOOK_BASKET_DB_VERSION);
    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains(FENIX_BOOK_BASKET_STORE_NAME)) {
        db.createObjectStore(FENIX_BOOK_BASKET_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error || new Error("Błąd otwarcia koszyka Fenixa."));
    };
  });
}

async function withFenixBookBasketStore(mode, callback) {
  const db = await openFenixBookBasketDb();
  return new Promise(function (resolve, reject) {
    const transaction = db.transaction(FENIX_BOOK_BASKET_STORE_NAME, mode);
    const store = transaction.objectStore(FENIX_BOOK_BASKET_STORE_NAME);
    let callbackResult;

    transaction.oncomplete = function () {
      db.close();
      resolve(callbackResult);
    };
    transaction.onerror = function () {
      db.close();
      reject(transaction.error || new Error("Błąd operacji koszyka Fenixa."));
    };

    try {
      callbackResult = callback(store);
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

function getFenixBookBasketPages() {
  return new Promise(function (resolve, reject) {
    openFenixBookBasketDb().then(function (db) {
      const transaction = db.transaction(FENIX_BOOK_BASKET_STORE_NAME, "readonly");
      const request = transaction.objectStore(FENIX_BOOK_BASKET_STORE_NAME).getAll();
      request.onsuccess = function () {
        db.close();
        resolve(sortFenixBasketPages(request.result || []));
      };
      request.onerror = function () {
        db.close();
        reject(request.error || new Error("Błąd odczytu koszyka Fenixa."));
      };
    }).catch(reject);
  });
}

function deleteFenixBookBasketPage(id) {
  return withFenixBookBasketStore("readwrite", function (store) {
    store.delete(id);
  });
}

function putFenixBookBasketPage(page) {
  return withFenixBookBasketStore("readwrite", function (store) {
    store.put(createStorableFenixBasketPage(page));
  });
}

function createStorableFenixBasketPage(page) {
  const copy = Object.assign({}, page);
  delete copy.previewImage;
  delete copy.previewUrl;
  delete copy.dataUrl;
  return copy;
}

function clearFenixBookBasketPages() {
  return withFenixBookBasketStore("readwrite", function (store) {
    store.clear();
  });
}

function bindFenixBasketControls() {
  const enabled = el("fenixBasketEnabled");
  const placement = el("fenixBasketPlacement");
  const refresh = el("fenixBasketRefresh");
  const clear = el("fenixBasketClear");
  const importPack = el("fenixPackImport");
  const packInput = el("fenixPackInput");
  const pngInput = el("fenixPngPagesInput");
  const clearImported = el("fenixImportedClear");
  const previewClose = el("fenixBasketPreviewClose");

  if (enabled) {
    enabled.addEventListener("change", function () {
      updateFenixBasketStatus();
      generatePreview();
    });
  }
  if (placement) {
    placement.addEventListener("change", function () {
      updateFenixBasketStatus();
      generatePreview();
    });
  }
  if (refresh) refresh.addEventListener("click", refreshFenixBasket);
  if (importPack) importPack.addEventListener("click", importSelectedFenixPack);
  if (packInput) {
    packInput.addEventListener("change", function () {
      if (packInput.files && packInput.files.length) importSelectedFenixPack();
    });
  }
  if (pngInput) pngInput.addEventListener("change", importFenixPngPages);
  if (clearImported) {
    clearImported.addEventListener("click", async function () {
      MBG.fenixBasket.importedPages = [];
      revokeFenixBasketObjectUrls();
      await preloadFenixBasketPreviewImages();
      renderFenixBasketList();
      updateFenixBasketStatus();
      generatePreview();
      setStatus("Wyczyszczono zaimportowane paczki/PNG Fenixa.");
    });
  }
  if (clear) {
    clear.addEventListener("click", async function () {
      const confirmed = window.confirm("Czy na pewno wyczyścić cały Koszyk Feniksa? Te strony trzeba będzie dodać ponownie.");
      if (!confirmed) return;
      try {
        await clearFenixBookBasketPages();
        await refreshFenixBasket();
        setStatus("Koszyk Fenixa wyczyszczony.");
      } catch (error) {
        console.error(error);
        setStatus("Błąd czyszczenia koszyka Fenixa.");
      }
    });
  }
  if (previewClose) {
    previewClose.addEventListener("click", function () {
      closeFenixBasketPreview();
    });
  }
}

function bindFenixBasketAutoRefresh() {
  let lastRefreshAt = 0;
  const refreshIfStale = function () {
    const now = Date.now();
    if (now - lastRefreshAt < 1000) return;
    lastRefreshAt = now;
    refreshFenixBasket();
    if (window.FenixBasketStatus && typeof window.FenixBasketStatus.refresh === "function") {
      window.FenixBasketStatus.refresh();
    }
  };

  window.addEventListener("focus", refreshIfStale);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refreshIfStale();
  });
}

function getAvailableFenixPages() {
  return sortFenixBasketPages((MBG.fenixBasket.pages || []).concat(MBG.fenixBasket.importedPages || []));
}

async function importSelectedFenixPack() {
  const input = el("fenixPackInput");
  if (!input || !input.files || !input.files[0]) {
    setFenixBasketStatus("Wybierz plik .fenixpack do importu.");
    return;
  }

  try {
    const file = input.files[0];
    const text = await readFileAsText(file);
    const pack = JSON.parse(text);
    const pages = parseFenixPackPages(pack, file.name);
    MBG.fenixBasket.importedPages = MBG.fenixBasket.importedPages.concat(pages);
    revokeFenixBasketObjectUrls();
    await preloadFenixBasketPreviewImages();
    renderFenixBasketList();
    updateFenixBasketStatus();
    generatePreview();
    setStatus("Zaimportowano paczkę Fenixa: " + pages.length + " stron.");
  } catch (error) {
    console.error(error);
    setFenixBasketStatus("Błąd importu paczki Fenixa.");
    setStatus("Błąd importu paczki Fenixa.");
  }
}

function parseFenixPackPages(pack, packFileName) {
  if (!pack || pack.fenixPackVersion !== 1 || pack.packType !== "fenix_book_pages" || !Array.isArray(pack.pages)) {
    throw new Error("Nieprawidłowy format paczki Fenixa.");
  }

  return pack.pages.map(function (page, index) {
    if (!page || page.mimeType !== "image/png" || !page.dataUrl || !String(page.dataUrl).startsWith("data:image/png")) {
      throw new Error("Paczka zawiera nieprawidłową stronę PNG.");
    }
    return {
      id: page.id || createRuntimeFenixPageId(),
      sourceModule: page.sourceModule || pack.sourceModule || "complete-picture",
      sourceKind: "fenix_pack",
      sourceLabel: "Paczka Fenixa",
      pageType: page.pageType || "complete_picture",
      fileName: page.fileName || packFileName || "fenix-pack-page.png",
      title: page.title || page.fileName || "Strona z paczki Fenixa",
      width: page.width || 2550,
      height: page.height || 3300,
      mimeType: "image/png",
      createdAt: page.createdAt || pack.createdAt || new Date().toISOString(),
      order: page.order || index + 1,
      includeInBook: page.includeInBook !== false,
      dataUrl: page.dataUrl
    };
  });
}

async function importFenixPngPages(event) {
  const files = Array.from((event.target && event.target.files) || []);
  if (!files.length) return;

  try {
    const imported = [];
    for (let index = 0; index < files.length; index += 1) {
      imported.push(await createImportedFenixPngPage(files[index], index));
    }
    MBG.fenixBasket.importedPages = MBG.fenixBasket.importedPages.concat(imported);
    revokeFenixBasketObjectUrls();
    await preloadFenixBasketPreviewImages();
    renderFenixBasketList();
    updateFenixBasketStatus();
    generatePreview();

    const warnings = imported.filter(function (page) {
      return page.sizeWarning;
    }).length;
    setStatus("Zaimportowano PNG: " + imported.length + " stron." + (warnings ? " Ostrzeżenia rozmiaru: " + warnings + "." : ""));
  } catch (error) {
    console.error(error);
    setFenixBasketStatus("Błąd importu PNG.");
    setStatus("Błąd importu PNG.");
  } finally {
    if (event.target) event.target.value = "";
  }
}

async function createImportedFenixPngPage(file, index) {
  const imageInfo = await loadPngFileInfo(file);
  const dataUrl = await blobToDataUrl(file.type === "image/png" ? file : new Blob([file], { type: "image/png" }));
  if (!String(dataUrl).startsWith("data:image/png")) throw new Error("Importowany plik nie został odczytany jako PNG dataUrl.");
  const sizeWarning = imageInfo.width !== MBG.PAGE_W || imageInfo.height !== MBG.PAGE_H;
  return {
    id: createRuntimeFenixPageId(),
    sourceModule: "direct-png",
    sourceKind: "direct_png",
    sourceLabel: "Import PNG",
    pageType: "ready_png_page",
    fileName: file.name,
    title: file.name.replace(/\.[^.]+$/, "") || "Gotowa strona PNG",
    width: imageInfo.width,
    height: imageInfo.height,
    mimeType: "image/png",
    createdAt: new Date().toISOString(),
    order: Date.now() + index,
    includeInBook: true,
    dataUrl: dataUrl,
    sizeWarning: sizeWarning
  };
}

function loadPngFileInfo(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      URL.revokeObjectURL(url);
      resolve({ width: width, height: height });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("Nie udało się odczytać PNG."));
    };
    img.src = url;
  });
}

function readFileAsText(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      resolve(String(reader.result || ""));
    };
    reader.onerror = function () {
      reject(reader.error || new Error("Błąd odczytu pliku."));
    };
    reader.readAsText(file);
  });
}

function createRuntimeFenixPageId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return "fenix-runtime-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function sortFenixBasketPages(pages) {
  return (pages || []).slice().sort(function (a, b) {
    const orderA = Number.isFinite(Number(a && a.order)) ? Number(a.order) : Number.POSITIVE_INFINITY;
    const orderB = Number.isFinite(Number(b && b.order)) ? Number(b.order) : Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;
    const dateA = Date.parse((a && a.createdAt) || "") || 0;
    const dateB = Date.parse((b && b.createdAt) || "") || 0;
    if (dateA !== dateB) return dateA - dateB;
    return String((a && (a.title || a.fileName || a.id)) || "").localeCompare(String((b && (b.title || b.fileName || b.id)) || ""));
  });
}

async function refreshFenixBasket() {
  try {
    revokeFenixBasketObjectUrls();
    MBG.fenixBasket.pages = await getFenixBookBasketPages();
    await preloadFenixBasketPreviewImages();
    MBG.fenixBasket.loaded = true;
    MBG.fenixBasket.error = null;
    renderFenixBasketList();
    updateFenixBasketStatus();
    refreshGlobalFenixBasketStatus();
    setStatus(MBG.fenixBasket.pages.length ? "Koszyk Feniksa wczytany." : "Koszyk Feniksa jest pusty.");
  } catch (error) {
    console.error(error);
    MBG.fenixBasket.pages = [];
    MBG.fenixBasket.loaded = false;
    MBG.fenixBasket.error = error;
    renderFenixBasketList();
    setFenixBasketStatus("Błąd odczytu koszyka Fenixa.");
    setStatus("Błąd odczytu koszyka.");
    refreshGlobalFenixBasketStatus();
  }
}

function refreshGlobalFenixBasketStatus() {
  if (window.FenixBasketStatus && typeof window.FenixBasketStatus.refresh === "function") {
    window.FenixBasketStatus.refresh();
  }
}

function revokeFenixBasketObjectUrls() {
  (MBG.fenixBasket.objectUrls || []).forEach(function (url) {
    URL.revokeObjectURL(url);
  });
  MBG.fenixBasket.objectUrls = [];
  getAvailableFenixPages().forEach(function (page) {
    if (page && page.previewUrl && page.previewUrl !== page.dataUrl) page.previewUrl = "";
    if (page && !page.dataUrl) page.previewImage = null;
  });
}

function createFenixBasketObjectUrl(blob) {
  const url = URL.createObjectURL(blob);
  MBG.fenixBasket.objectUrls.push(url);
  return url;
}

function preloadFenixBasketPreviewImages() {
  return Promise.all(getAvailableFenixPages().map(function (page) {
    if (page.dataUrl) {
      return new Promise(function (resolve) {
        const img = new Image();
        img.onload = function () {
          page.previewImage = img;
          page.previewUrl = page.dataUrl;
          resolve();
        };
        img.onerror = function () {
          resolve();
        };
        img.src = page.dataUrl;
      });
    }
    if (!page.blob) return Promise.resolve();
    return blobToDataUrl(page.blob.type === "image/png" ? page.blob : new Blob([page.blob], { type: "image/png" })).then(function (dataUrl) {
      page.dataUrl = dataUrl;
      return new Promise(function (resolve) {
        const img = new Image();
        img.onload = function () {
          page.previewImage = img;
          page.previewUrl = dataUrl;
          resolve();
        };
        img.onerror = function () {
          resolve();
        };
        img.src = dataUrl;
      });
    }).catch(function (error) {
      console.error("Nie udało się przygotować dataUrl strony Fenixa:", {
        sourceKind: page.sourceKind,
        sourceModule: page.sourceModule,
        fileName: page.fileName,
        error: error
      });
    });
  }));
}

function renderFenixBasketList() {
  const list = el("fenixBasketList");
  const count = el("fenixBasketCount");
  const availablePages = getAvailableFenixPages();
  const includedCount = availablePages.filter(function (page) {
    return page.includeInBook !== false;
  }).length;
  if (count) count.textContent = "Koszyk Fenixa: " + availablePages.length + " stron, w książce: " + includedCount + ".";
  renderFenixBasketSourceSummary(availablePages);
  updateActiveBookBlocksSummary();
  if (!list) return;

  list.replaceChildren();
  if (!availablePages.length) {
    const empty = document.createElement("p");
    empty.className = "fenix-basket-empty";
    empty.textContent = "Koszyk Feniksa jest pusty.";
    list.appendChild(empty);
    return;
  }

  availablePages.forEach(function (page, index) {
    const item = document.createElement("div");
    item.className = page.includeInBook === false ? "fenix-basket-item is-skipped" : "fenix-basket-item";

    const img = document.createElement("img");
    img.className = "fenix-basket-thumb";
    img.src = page.previewUrl || page.dataUrl || (page.blob ? createFenixBasketObjectUrl(page.blob) : "");
    img.alt = page.title || page.fileName || "Strona z koszyka Fenixa";
    img.title = "Pokaż większy podgląd";
    img.addEventListener("click", function () {
      showFenixBasketPreview(page);
    });

    const meta = document.createElement("div");
    meta.className = "fenix-basket-meta";

    const order = document.createElement("strong");
    order.textContent = "#" + (index + 1) + " " + (page.title || page.fileName || "Strona Feniksa");

    const titleRow = document.createElement("div");
    titleRow.className = "fenix-basket-title-row";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = page.title || page.fileName || "";
    titleInput.setAttribute("aria-label", "Nazwa pozycji koszyka");
    const saveTitle = document.createElement("button");
    saveTitle.type = "button";
    saveTitle.className = "secondary-btn btn-secondary";
    saveTitle.textContent = "Zapisz nazwę";
    saveTitle.addEventListener("click", function () {
      renameFenixBasketPage(page, titleInput.value);
    });
    titleInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") renameFenixBasketPage(page, titleInput.value);
    });
    titleRow.appendChild(titleInput);
    titleRow.appendChild(saveTitle);

    const source = document.createElement("span");
    source.textContent = "Źródło: " + getFenixBasketSourceLabel(page.sourceModule) + " | Typ: " + (page.pageType || "brak") + " | " + (page.width || MBG.PAGE_W) + "×" + (page.height || MBG.PAGE_H) + " PNG";

    const created = document.createElement("span");
    created.textContent = "Dodano: " + formatFenixBasketDate(page.createdAt);

    const sourceBadge = document.createElement("span");
    sourceBadge.className = "fenix-basket-source";
    sourceBadge.textContent = getFenixBasketBadgeLabel(page);

    const includeLabel = document.createElement("label");
    includeLabel.className = "fenix-basket-include";
    const include = document.createElement("input");
    include.type = "checkbox";
    include.checked = page.includeInBook !== false;
    include.addEventListener("change", function () {
      setFenixBasketPageIncluded(page, include.checked);
    });
    const includeText = document.createElement("span");
    includeText.textContent = "Uwzględnij w książce";
    includeLabel.appendChild(include);
    includeLabel.appendChild(includeText);

    const includeStatus = document.createElement("span");
    includeStatus.className = page.includeInBook === false ? "fenix-basket-include-status is-skipped" : "fenix-basket-include-status";
    includeStatus.textContent = page.includeInBook === false ? "Pominięta" : "Włączona do książki";

    const editStatus = document.createElement("span");
    const editable = isEditableFenixBasketPage(page);
    editStatus.className = editable ? "fenix-basket-edit-status is-editable" : "fenix-basket-edit-status";
    editStatus.textContent = editable ? "Edytowalna" : "Tylko gotowy PNG";
    meta.appendChild(order);
    meta.appendChild(titleRow);
    meta.appendChild(source);
    meta.appendChild(created);
    meta.appendChild(sourceBadge);
    meta.appendChild(includeLabel);
    meta.appendChild(includeStatus);
    meta.appendChild(editStatus);
    if (page.sizeWarning) {
      const warning = document.createElement("span");
      warning.className = "fenix-basket-warning";
      warning.textContent = "Zalecany rozmiar 2550×3300 px dla 8.5×11 / 300 DPI.";
      meta.appendChild(warning);
    }
    if (!editable) {
      const locked = document.createElement("span");
      locked.className = "fenix-basket-locked-note";
      locked.textContent = "Ta pozycja jest starsza albo została zaimportowana jako gotowy PNG. Można ją usunąć i dodać ponownie, ale nie da się jej odtworzyć do edycji.";
      meta.appendChild(locked);
    }

    const actions = document.createElement("div");
    actions.className = "fenix-basket-actions";

    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "secondary-btn btn-secondary";
    preview.textContent = "Podgląd";
    preview.addEventListener("click", function () {
      showFenixBasketPreview(page);
    });
    actions.appendChild(preview);

    const moveUp = document.createElement("button");
    moveUp.type = "button";
    moveUp.className = "secondary-btn btn-secondary fenix-basket-order-btn";
    moveUp.textContent = "↑";
    moveUp.title = "Przesuń wyżej";
    moveUp.disabled = index === 0;
    moveUp.addEventListener("click", function () {
      moveFenixBasketPage(page.id, -1);
    });
    actions.appendChild(moveUp);

    const moveDown = document.createElement("button");
    moveDown.type = "button";
    moveDown.className = "secondary-btn btn-secondary fenix-basket-order-btn";
    moveDown.textContent = "↓";
    moveDown.title = "Przesuń niżej";
    moveDown.disabled = index === availablePages.length - 1;
    moveDown.addEventListener("click", function () {
      moveFenixBasketPage(page.id, 1);
    });
    actions.appendChild(moveDown);

    if (editable) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary-btn btn-secondary";
      edit.textContent = "Edytuj w module";
      edit.addEventListener("click", function () {
        openFenixBasketPageInSourceModule(page);
      });
      actions.appendChild(edit);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-btn btn-danger";
    remove.textContent = "Usuń z koszyka";
    remove.addEventListener("click", async function () {
      const confirmed = window.confirm("Usunąć tę pozycję z Koszyka Feniksa?");
      if (!confirmed) return;
      try {
        if (page.sourceKind === "fenix_pack" || page.sourceKind === "direct_png") {
          MBG.fenixBasket.importedPages = MBG.fenixBasket.importedPages.filter(function (item) {
            return item.id !== page.id;
          });
          renderFenixBasketList();
          updateFenixBasketStatus();
          refreshGlobalFenixBasketStatus();
        } else {
          await deleteFenixBookBasketPage(page.id);
          await refreshFenixBasket();
        }
        setStatus("Usunięto pozycję z koszyka.");
      } catch (error) {
        console.error(error);
        setStatus("Błąd zapisu koszyka.");
      }
    });
    actions.appendChild(remove);

    item.appendChild(img);
    item.appendChild(meta);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

function formatFenixBasketDate(value) {
  if (!value) return "brak daty";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function findFenixBasketPageById(pageId) {
  return getAvailableFenixPages().find(function (page) {
    return page.id === pageId;
  }) || null;
}

function replaceRuntimeImportedFenixPage(updatedPage) {
  MBG.fenixBasket.importedPages = (MBG.fenixBasket.importedPages || []).map(function (page) {
    return page.id === updatedPage.id ? updatedPage : page;
  });
}

async function updateFenixBasketPageMetadata(page, updates) {
  const updatedPage = Object.assign({}, page, updates, {
    updatedAt: new Date().toISOString()
  });

  if (page.sourceKind === "fenix_pack" || page.sourceKind === "direct_png") {
    replaceRuntimeImportedFenixPage(updatedPage);
    renderFenixBasketList();
    updateFenixBasketStatus();
    generatePreview();
    return updatedPage;
  }

  await putFenixBookBasketPage(updatedPage);
  await refreshFenixBasket();
  generatePreview();
  return updatedPage;
}

async function renameFenixBasketPage(page, rawTitle) {
  const title = String(rawTitle || "").trim() || page.fileName || "Strona Feniksa";
  try {
    await updateFenixBasketPageMetadata(page, { title: title });
    setStatus("Zmieniono nazwę pozycji.");
  } catch (error) {
    console.error(error);
    setStatus("Błąd zapisu koszyka.");
  }
}

async function setFenixBasketPageIncluded(page, includeInBook) {
  try {
    await updateFenixBasketPageMetadata(page, { includeInBook: includeInBook !== false });
    setStatus(includeInBook ? "Strona zostanie uwzględniona w książce." : "Strona zostanie pominięta w książce.");
  } catch (error) {
    console.error(error);
    setStatus("Błąd zapisu koszyka.");
  }
}

async function moveFenixBasketPage(pageId, direction) {
  const pages = getAvailableFenixPages();
  const index = pages.findIndex(function (page) {
    return page.id === pageId;
  });
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= pages.length) return;

  const moved = pages.slice();
  const current = moved[index];
  moved[index] = moved[targetIndex];
  moved[targetIndex] = current;

  try {
    for (let i = 0; i < moved.length; i += 1) {
      const page = moved[i];
      const updatedPage = Object.assign({}, page, {
        order: i + 1,
        updatedAt: new Date().toISOString()
      });
      if (page.sourceKind === "fenix_pack" || page.sourceKind === "direct_png") {
        replaceRuntimeImportedFenixPage(updatedPage);
      } else {
        await putFenixBookBasketPage(updatedPage);
      }
    }
    await refreshFenixBasket();
    renderFenixBasketList();
    updateFenixBasketStatus();
    generatePreview();
    setStatus("Zmieniono kolejność stron.");
  } catch (error) {
    console.error(error);
    setStatus("Błąd zapisu koszyka.");
  }
}

function showFenixBasketPreview(page) {
  const panel = el("fenixBasketPreview");
  const image = el("fenixBasketPreviewImage");
  const title = el("fenixBasketPreviewTitle");
  if (!panel || !image) return;
  image.src = page.previewUrl || page.dataUrl || (page.blob ? createFenixBasketObjectUrl(page.blob) : "");
  image.alt = page.title || page.fileName || "Podgląd strony z Koszyka Feniksa";
  if (title) title.textContent = page.title || page.fileName || "Podgląd strony";
  panel.hidden = false;
}

function closeFenixBasketPreview() {
  const panel = el("fenixBasketPreview");
  const image = el("fenixBasketPreviewImage");
  if (image) image.removeAttribute("src");
  if (panel) panel.hidden = true;
}

function isEditableFenixBasketPage(page) {
  if (!page || !page.editSnapshot) return false;
  const sourceModule = page.editSnapshot.sourceModule || page.sourceModule;
  return sourceModule === "coloring-studio" || sourceModule === "complete-picture";
}

function openFenixBasketPageInSourceModule(page) {
  const sourceModule = (page.editSnapshot && page.editSnapshot.sourceModule) || page.sourceModule;
  if (sourceModule === "coloring-studio") {
    window.location.href = "modules/coloring-studio/coloring-studio.html?editBasketPage=" + encodeURIComponent(page.id);
    return;
  }
  if (sourceModule === "complete-picture") {
    window.location.href = "modules/complete-picture/complete-picture.html?editBasketPage=" + encodeURIComponent(page.id);
  }
}

function renderFenixBasketSourceSummary(pages) {
  const summary = el("fenixBasketSourceSummary");
  if (!summary) return;

  if (!pages.length) {
    summary.textContent = "Źródła: brak stron.";
    return;
  }

  const counts = {
    complete: 0,
    coloring: 0,
    tracing: 0,
    matching: 0,
    alphabet: 0,
    math: 0,
    dotToDot: 0,
    hiddenObjects: 0,
    logic: 0,
    other: 0
  };

  pages.forEach(function (page) {
    if (page.sourceModule === "complete-picture") {
      counts.complete += 1;
    } else if (page.sourceModule === "coloring-studio") {
      counts.coloring += 1;
    } else if (page.sourceModule === "tracing-studio") {
      counts.tracing += 1;
    } else if (page.sourceModule === "matching-studio") {
      counts.matching += 1;
    } else if (page.sourceModule === "alphabet-studio") {
      counts.alphabet += 1;
    } else if (page.sourceModule === "math-studio") {
      counts.math += 1;
    } else if (page.sourceModule === "dot-to-dot-studio") {
      counts.dotToDot += 1;
    } else if (page.sourceModule === "hidden-objects-studio") {
      counts.hiddenObjects += 1;
    } else if (page.sourceModule === "logic-studio") {
      counts.logic += 1;
    } else {
      counts.other += 1;
    }
  });

  summary.textContent = "Źródła: Complete the Picture: " + counts.complete +
    " | Coloring Studio: " + counts.coloring +
    " | Tracing Studio: " + counts.tracing +
    " | Matching Studio: " + counts.matching +
    " | Alphabet Studio: " + counts.alphabet +
    " | Math Studio: " + counts.math +
    " | Dot to Dot Studio: " + counts.dotToDot +
    " | Hidden Objects Studio: " + counts.hiddenObjects +
    " | Logic Studio: " + counts.logic +
    " | Inne / import: " + counts.other + ".";
}

function getFenixBasketBadgeLabel(page) {
  if (page && page.sourceKind === "fenix_pack") return "Paczka Fenixa";
  if (page && page.sourceKind === "direct_png") return "Import PNG";
  return getFenixBasketSourceLabel(page && page.sourceModule);
}

function getFenixBasketSourceLabel(sourceModule) {
  if (sourceModule === "complete-picture") return "Complete the Picture";
  if (sourceModule === "coloring-studio") return "Coloring Studio";
  if (sourceModule === "tracing-studio") return "Tracing Studio";
  if (sourceModule === "matching-studio") return "Matching Studio";
  if (sourceModule === "alphabet-studio") return "Alphabet Studio";
  if (sourceModule === "math-studio") return "Math Studio";
  if (sourceModule === "dot-to-dot-studio") return "Dot to Dot Studio";
  if (sourceModule === "hidden-objects-studio") return "Hidden Objects Studio";
  if (sourceModule === "logic-studio") return "Logic Studio";
  if (sourceModule === "direct-png") return "Gotowy PNG";
  return sourceModule || "FENIX";
}

function getFenixBasketSourceKindLabel(sourceKind) {
  if (sourceKind === "fenix_pack") return "Paczka Fenixa";
  if (sourceKind === "direct_png") return "Import PNG";
  return "Koszyk lokalny";
}

function updateFenixBasketStatus() {
  const enabled = getBool("fenixBasketEnabled", false);
  const count = getAvailableFenixPages().length;
  const includedCount = getAvailableFenixPages().filter(function (page) {
    return page.includeInBook !== false;
  }).length;
  if (!count) {
    setFenixBasketStatus("Brak stron w koszyku.");
    return;
  }
  if (!enabled) {
    setFenixBasketStatus("Strony z koszyka są wyłączone. Koszyk Fenixa: " + count + " stron, w książce po włączeniu: " + includedCount + ".");
    return;
  }
  setFenixBasketStatus("Strony z koszyka zostaną dodane do PDF. Koszyk Fenixa: " + count + " stron, uwzględnione: " + includedCount + ".");
}

function setFenixBasketStatus(message) {
  const status = el("fenixBasketStatus");
  if (status) status.textContent = message;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomItem(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(arr) {
  const copy = arr.slice();

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }

  return copy;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function waitFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

function safeFileName(name) {
  return String(name || "maze-book")
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "maze-book";
}

/* ============================================================
   SETTINGS
============================================================ */

function getDifficultyPreset(level) {
  const easyGrid = clamp(getNumber("easyGridSize", 15), 5, 80);
  const mediumGrid = clamp(getNumber("mediumGridSize", 18), 5, 80);
  const hardGrid = clamp(getNumber("hardGridSize", 20), 5, 80);
  const expertGrid = clamp(getNumber("expertGridSize", 25), 5, 80);

  const presets = {
    easy: {
      grid: easyGrid,
      checkpoints: 0,
      enemies: 0,
      extraOpeningsPercent: 35,
      goalDistanceMinPercent: 35,
      goalDistanceMaxPercent: 60,
      wallThicknessPercent: 105
    },
    medium: {
      grid: mediumGrid,
      checkpoints: 1,
      enemies: 0,
      extraOpeningsPercent: 22,
      goalDistanceMinPercent: 55,
      goalDistanceMaxPercent: 75,
      wallThicknessPercent: 115
    },
    hard: {
      grid: hardGrid,
      checkpoints: 2,
      enemies: 1,
      extraOpeningsPercent: 9,
      goalDistanceMinPercent: 70,
      goalDistanceMaxPercent: 90,
      wallThicknessPercent: 125
    },
    expert: {
      grid: expertGrid,
      checkpoints: 3,
      enemies: 2,
      extraOpeningsPercent: 3,
      goalDistanceMinPercent: 80,
      goalDistanceMaxPercent: 100,
      wallThicknessPercent: 135
    }
  };

  return presets[level] || presets.easy;
}

function readSettings() {
  const difficultyLevel = getValue("difficultyLevel", "easy");
  const autoDifficulty = getBool("autoDifficulty", true);
  const difficultyPreset = getDifficultyPreset(difficultyLevel);

  let mazeWidth = clamp(getNumber("mazeWidth", 15), 3, 80);
  let mazeHeight = clamp(getNumber("mazeHeight", 15), 3, 80);
  let checkpointCount = clamp(getNumber("checkpointCount", 0), 0, 12);
  let enemyCount = clamp(getNumber("enemyCount", 0), 0, 12);
  const manualCheckpointCount = checkpointCount;
  const manualEnemyCount = enemyCount;
  let extraOpeningsPercent = clamp(getNumber("extraOpeningsPercent", 35), 0, 80);
  let goalDistanceMinPercent = clamp(getNumber("goalDistanceMinPercent", 35), 0, 100);
  let goalDistanceMaxPercent = clamp(getNumber("goalDistanceMaxPercent", 60), 0, 100);
  let wallThicknessPercent = clamp(getNumber("wallThicknessPercent", 105), 30, 300);

  if (autoDifficulty) {
    mazeWidth = difficultyPreset.grid;
    mazeHeight = difficultyPreset.grid;
    // Auto Difficulty sets the baseline for the selected age level,
    // but it no longer removes a manually requested checkpoint/enemy.
    // This keeps Easy 4-6 usable for Adventure books when checkpointCount = 1.
    checkpointCount = Math.max(difficultyPreset.checkpoints, manualCheckpointCount);
    enemyCount = Math.max(difficultyPreset.enemies, manualEnemyCount);
    extraOpeningsPercent = difficultyPreset.extraOpeningsPercent;
    goalDistanceMinPercent = difficultyPreset.goalDistanceMinPercent;
    goalDistanceMaxPercent = difficultyPreset.goalDistanceMaxPercent;
    wallThicknessPercent = difficultyPreset.wallThicknessPercent;
  }

  if (goalDistanceMaxPercent < goalDistanceMinPercent) {
    const temp = goalDistanceMinPercent;
    goalDistanceMinPercent = goalDistanceMaxPercent;
    goalDistanceMaxPercent = temp;
  }

  const legacyUseEnemy = getBool("useEnemy", false);
  if (!autoDifficulty && legacyUseEnemy && enemyCount < 1) enemyCount = 1;

  const settings = {
    difficultyLevel,
    autoDifficulty,

    bookTitle: getValue("bookTitle", "MAZE BOOK"),
    bookTitleLine2: getValue("bookTitleLine2", "FOR KIDS"),
    bookSubtitle: getValue("bookSubtitle", "Fun Maze Activity Book"),
    bookInfo: getValue("bookInfo", "50 Fun Mazes"),
    missionStartText: getValue("missionStartText", "START YOUR ADVENTURE"),
    screenFreeText: getValue("screenFreeText", "A fun screen-free activity book for kids."),
    bookIntroText: getValue("bookIntroText", ""),

    howToTitle: getValue("howToTitle", "HOW TO PLAY"),
    howToFooter: getValue("howToFooter", "Use a pencil and have fun!"),
    howToLines: getValue("howToLines", ""),
    tipText: getValue("tipText", "Tip: Use a pencil so you can try again!"),

    mazePageTitle: getValue("mazePageTitle", "Maze"),
    mazePageSubtitle: getValue("mazePageSubtitle", "Find your way to the finish!"),
    mazePrefix: getValue("mazePrefix", "Maze"),
    solutionPrefix: getValue("solutionPrefix", "Solution"),
    solutionTitle: getValue("solutionTitle", "Solution"),
    solutionSubtitle: getValue("solutionSubtitle", "Follow the dashed path to check your answer."),

    mazeWidth,
    mazeHeight,
    mazeCount: clamp(getNumber("mazeCount", 50), 1, 150),
    safeMargin: clamp(getNumber("safeMargin", 220), 80, 600),
    mazePadding: clamp(getNumber("mazePadding", 100), 30, 500),
    wallThicknessPercent,
    checkpointCount,
    enemyCount,
    extraOpeningsPercent,
    goalDistanceMinPercent,
    goalDistanceMaxPercent,

    useAssets: getBool("useAssets", true),
    startScale: clamp(getNumber("startScale", 145), 10, 300) / 100,
    goalScale: clamp(getNumber("goalScale", 145), 10, 300) / 100,
    checkpointScale: clamp(getNumber("checkpointScale", 90), 10, 300) / 100,
    enemyScale: clamp(getNumber("enemyScale", 85), 10, 300) / 100,
    globalAssetScale: clamp(getNumber("globalAssetScale", 100), 10, 300) / 100,

    useIntroAssets: getBool("useIntroAssets", true),
    introAssetScale: clamp(getNumber("introAssetScale", 100), 10, 300) / 100,
    useInstructionIcons: getBool("useInstructionIcons", true),
    instructionIconScale: clamp(getNumber("instructionIconScale", 85), 10, 300) / 100,

    startLabel: getValue("startLabel", "START"),
    goalLabel: getValue("goalLabel", "FINISH"),
    checkpointLabel: getValue("checkpointLabel", "CHECK"),
    enemyLabel: getValue("enemyLabel", "AVOID"),

    useMask: getBool("useMask", false),
    maskFitMode: getValue("maskFitMode", "contain"),
    maskMode: getValue("maskMode", "single"),
    maskPaddingPercent: clamp(getNumber("maskPaddingPercent", 6), 0, 30),
    maskThreshold: clamp(getNumber("maskThreshold", 128), 0, 255),
    maskPolarity: getValue("maskPolarity", "auto"),
    maskInvert: getBool("maskInvert", false),
    showMaskGuide: getBool("showMaskGuide", false),
    maskGuideThickness: clamp(getNumber("maskGuideThickness", 6), 1, 40),
    enableMaskOutline: getBool("enableMaskOutline", false),
    maskOutlineStyle: getValue("maskOutlineStyle", "solid"),
    maskOutlineSource: getValue("maskOutlineSource", "maze-grid"),
    maskOutlineRenderMode: getValue("maskOutlineRenderMode", "smooth"),
    maskOutlinePlacement: getValue("maskOutlinePlacement", "outside"),
    maskOutlineThickness: clamp(getNumber("maskOutlineThickness", 1), 1, 20),
    maskOutlineOffset: clamp(getNumber("maskOutlineOffset", 1), 0, 40),
    maskOutlineGap: clamp(getNumber("maskOutlineGap", 2), 0, 40),
    maskOutlineOpacity: clamp(getNumber("maskOutlineOpacity", 45), 10, 100) / 100,

    decoEnabled: getBool("decoEnabled", false),
    decoOnIntro: getBool("decoOnIntro", true),
    decoOnMaze: getBool("decoOnMaze", true),
    decoOnSolution: getBool("decoOnSolution", false),
    decoOnCongrats: getBool("decoOnCongrats", true),
    decoPlacement: getValue("decoPlacement", "mixed"),
    decoDensity: clamp(getNumber("decoDensity", 4), 1, 20),
    decoOpacity: clamp(getNumber("decoOpacity", 0.35), 0.02, 1),
    decoScaleMin: clamp(getNumber("decoScaleMin", 0.18), 0.03, 3),
    decoScaleMax: clamp(getNumber("decoScaleMax", 0.35), 0.03, 3),
    decoRandomRotation: getBool("decoRandomRotation", true),
    decoAvoidMazeArea: getBool("decoAvoidMazeArea", true),

    includeMissionTracker: getBool("includeMissionTracker", false),
    missionTrackerTitle: getValue("missionTrackerTitle", "DINO MISSION TRACKER"),
    missionTrackerInstruction: getValue("missionTrackerInstruction", "Color one star after each completed maze!"),
    missionTrackerUseAutoCount: getBool("missionTrackerUseAutoCount", true),
    missionTrackerCount: clamp(getNumber("missionTrackerCount", 50), 1, 200),
    missionTrackerShowNumbers: getBool("missionTrackerShowNumbers", true),
    missionTrackerColumns: clamp(getNumber("missionTrackerColumns", 10), 2, 15),
    missionTrackerFooter: getValue("missionTrackerFooter", "Complete all dino missions and earn your certificate!"),

    includeShapeTracerPages: getBool("includeShapeTracerPages", false),
    shapeTracerPageCount: clamp(getNumber("shapeTracerPageCount", 6), 1, 100),
    shapeTracerSource: getValue("shapeTracerSource", "generated"),
    shapeTracerItemsPerPage: getValue("shapeTracerItemsPerPage", "1"),
    shapeTracerLayout: getValue("shapeTracerLayout", "single"),
    shapeTracerMixTypesPerPage: getBool("shapeTracerMixTypesPerPage", false),
    shapeTracerProgressionMode: getValue("shapeTracerProgressionMode", "same"),
    shapeTracerLineStyle: getValue("shapeTracerLineStyle", "dashed"),
    shapeTracerLineThickness: clamp(getNumber("shapeTracerLineThickness", 8), 2, 24),
    shapeTracerOpacity: clamp(getNumber("shapeTracerOpacity", 70), 10, 100) / 100,
    generatedTraceType: getValue("generatedTraceType", "mixed"),
    generatedTraceDifficulty: getValue("generatedTraceDifficulty", "easy"),
    generatedTraceComplexity: clamp(getNumber("generatedTraceComplexity", 6), 1, 20),
    generatedTraceScale: clamp(getNumber("generatedTraceScale", 92), 50, 120) / 100,
    shapeTracerUseGameplayIcons: getBool("shapeTracerUseGameplayIcons", true),
    generatedTraceRandomize: getBool("generatedTraceRandomize", true),
    generatedTraceAvoidRepeat: getBool("generatedTraceAvoidRepeat", true),
    shapeTracerAssetSelectionMode: getValue("shapeTracerAssetSelectionMode", "sequential"),
    shapeTracerAssetLibraryFilter: getValue("assetLibraryFilter", "all"),
    shapeTracerSelectedAssetIds: getAssetLibrarySelectedIdsFromField(),

    includeColoringPages: getBool("includeColoringPages", false),
    coloringPageCount: clamp(getNumber("coloringPageCount", 6), 1, 100),
    coloringAssetSource: getValue("coloringAssetSource", "all"),
    coloringAssetsPerPage: getValue("coloringAssetsPerPage", "1"),
    coloringAssetScale: clamp(getNumber("coloringAssetScale", 92), 40, 140) / 100,
    coloringPageLayout: getValue("coloringPageLayout", "centered"),
    coloringPageTitle: getValue("coloringPageTitle", "COLOR THE PICTURE!"),

    fenixBasketEnabled: getBool("fenixBasketEnabled", false),
    fenixBasketPlacement: getValue("fenixBasketPlacement", "after-mazes"),

    includeCertificatePage: getBool("includeCertificatePage", false),
    certificateTitle: getTextSetting(["certificateTitle"], ["tytuł certyfikatu"], "DINO MAZE EXPLORER CERTIFICATE"),
    certificateSubtitle: getTextSetting(["certificateSubtitle"], ["podtytuł certyfikatu"], "Maze Adventure Achievement"),
    certificateAwardedToLabel: getTextSetting(["certificateAwardedToLabel", "certificateAwardedToText", "certificateBeforeNameText", "certificateBeforeName", "certificateIntroText"], ["tekst przed linią imienia", "this certificate is proudly awarded"], "This certificate is proudly awarded to:"),
    // This must stay blank for print/KDP certificates.
    // The checkbox "add child name line" may have value="true" in HTML, so do not use getValue() here.
    certificateChildName: getTextValueOnly("certificateChildNameText", ""),
    certificateNameLabel: getTextSetting(["certificateNameLabel", "certificateChildNameLabel"], ["podpis pod linią imienia"], "Name"),
    certificateText: getTextSetting(["certificateText", "certificateAfterNameText", "certificateTextAfterName", "certificateAfterLineText", "certificateCompletionText", "certificateAfterName", "certificateBodyText"], ["tekst po linii imienia", "for completing all"], "for completing all the dino mazes in this book!"),
    certificateDateLabel: getTextSetting(["certificateDateLabel"], ["etykieta daty"], "Date"),
    certificateParentSignatureLabel: getTextSetting(["certificateParentSignatureLabel", "certificateGuardianSignatureLabel", "parentSignatureLabel"], ["tekst podpisu rodzica", "parent / guardian signature", "podpis rodzica"], "Parent / Guardian Signature"),
    certificateCreatorSignatureLabel: getTextSetting(["certificateCreatorSignatureLabel", "certificateCreatorMarkLabel", "certificateCreatorMarkCaption", "creatorMarkCaption", "creatorMarkLabel", "creatorMarkDescription", "certificateCreatorMarkDescription"], ["opis pod creator mark", "creator mark caption", "description under creator mark"], "Creator Mark"),
    certificateUseCreatorMark: getBool("certificateUseCreatorMark", getBool("useCreatorMark", true)),
    certificateCreatorMarkScale: clamp(getNumber("certificateCreatorMarkScale", getNumber("creatorMarkScale", 100)), 20, 250) / 100,
    certificateFooterText: getTextSetting(["certificateFooterText"], ["tekst końcowy certyfikatu"], "Great job, Dino Explorer!"),
    certificateBlankBack: getBool("certificateBlankBack", getBool("includeBlankPageAfterCertificate", true)),

    includeQrPage: getBool("includeQrPage", false),
    qrPageTitle: getValue("qrPageTitle", "MORE MAZE ADVENTURES"),
    qrPageIntroText: getValue("qrPageIntroText", "Scan the QR codes below to discover more maze books and series."),
    qrScale: clamp(getNumber("qrScale", 100), 40, 180) / 100,
    qrLabel1: getValue("qrLabel1", "All Maze Books by Piotr Opałko"),
    qrLabel2: getValue("qrLabel2", "More Books in This Series"),
    qrLabel3: getValue("qrLabel3", "More Maze Adventures"),
    qrLabel4: getValue("qrLabel4", "More Fun Activity Books"),
    qrFooterText: getValue("qrFooterText", "Thank you for solving and exploring with us!"),

    includeCongratsPage: getBool("includeCongratsPage", true),
    congratsTitle: getValue("congratsTitle", "CONGRATULATIONS!"),
    congratsText: getValue("congratsText", ""),
    moreBooksText: getValue("moreBooksText", "Look for more maze adventures by Piotr Opałko."),

    exportFileName: getValue("exportFileName", "maze-book"),
    exportImageFormat: getValue("exportImageFormat", "JPEG"),
    jpegQuality: clamp(getNumber("jpegQuality", 0.92), 0.1, 1),
    includeIntroPages: getBool("includeIntroPages", true),
    includeSolutions: getBool("includeSolutions", true)
  };

  if (settings.decoScaleMax < settings.decoScaleMin) {
    const temp = settings.decoScaleMin;
    settings.decoScaleMin = settings.decoScaleMax;
    settings.decoScaleMax = temp;
  }

  return settings;
}

/* ============================================================
   ASSET LOADING
============================================================ */

function bindMainAssetInputs() {
  bindImageInput("startAsset", img => MBG.assets.start = img, "START");
  bindImageInput("goalAsset", img => MBG.assets.goal = img, "CEL / FINISH");
  bindImageInput("checkpointAsset", img => MBG.assets.checkpoint = img, "CHECKPOINT");
  bindImageInput("enemyAsset", img => MBG.assets.enemy = img, "ZAGROŻENIE");
  bindImageInput("creatorMarkAsset", img => MBG.assets.creatorMark = img, "PODPIS / CREATOR MARK");
}

function bindMaskInput() {
  const input = el("maskAsset");
  if (!input) return;

  input.addEventListener("change", async function () {
    const files = Array.from(input.files || []);
    MBG.maskAssets = [];

    for (const file of files) {
      try {
        const img = await fileToImage(file);
        MBG.maskAssets.push({ name: file.name, img });
      } catch (err) {
        console.error("Nie udało się wczytać maski:", file.name, err);
      }
    }

    MBG.assets.mask = MBG.maskAssets.length ? MBG.maskAssets[0].img : null;
    updateMaskCounter();

    if (MBG.maskAssets.length > 1) {
      setStatus("Załadowano maski: " + MBG.maskAssets.length);
    } else if (MBG.maskAssets.length === 1) {
      setStatus("Maska została załadowana.");
    } else {
      setStatus("Nie załadowano masek.");
    }

    generatePreview();
  });
}

function updateMaskCounter() {
  const counter = el("maskAssetCount");
  if (counter) {
    counter.textContent = "Załadowane maski: " + MBG.maskAssets.length;
  }
}

function clearMaskAssets() {
  MBG.maskAssets = [];
  MBG.assets.mask = null;
  const input = el("maskAsset");
  if (input) input.value = "";
  updateMaskCounter();
  generatePreview();
}

function bindDecoInput() {
  const input = el("decoAssetsInput");
  if (!input) return;

  input.addEventListener("change", async function () {
    const files = Array.from(input.files || []);
    MBG.decoAssets = [];

    for (const file of files) {
      try {
        const img = await fileToImage(file);
        MBG.decoAssets.push({ name: file.name, img });
      } catch (err) {
        console.error("Nie udało się wczytać DECO:", file.name, err);
      }
    }

    updateDecoCounter();
    setStatus("Załadowano assety DECO: " + MBG.decoAssets.length);
    generatePreview();
  });
}


function bindQrInput() {
  const input = el("qrAssetsInput");
  if (!input) return;

  input.addEventListener("change", async function () {
    const files = Array.from(input.files || []);
    MBG.qrAssets = [];

    for (const file of files) {
      try {
        const img = await fileToImage(file);
        MBG.qrAssets.push({ name: file.name, img });
      } catch (err) {
        console.error("Nie udało się wczytać QR:", file.name, err);
      }
    }

    updateQrCounter();
    setStatus("Załadowano assety QR: " + MBG.qrAssets.length);
    generatePreview();
  });
}

function updateQrCounter() {
  const counter = el("qrAssetCount");
  if (counter) {
    counter.textContent = "Załadowane QR: " + MBG.qrAssets.length;
  }
}

function clearQrAssets() {
  MBG.qrAssets = [];
  updateQrCounter();
  generatePreview();
}

function bindImageInput(inputId, callback, label) {
  const input = el(inputId);
  if (!input) return;

  input.addEventListener("change", async function () {
    const file = input.files && input.files[0];
    if (!file) return;

    try {
      const img = await fileToImage(file);
      callback(img);
      setStatus("Załadowano asset: " + label);
      generatePreview();
    } catch (err) {
      console.error(err);
      setStatus("Błąd ładowania assetu: " + label);
    }
  });
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadAssetLibrary() {
  const status = el("assetLibraryStatus");
  if (status) status.textContent = "Ładowanie biblioteki SVG...";

  try {
    const response = await fetch("assets/library.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status);

    const manifest = await response.json();
    const items = normalizeAssetLibraryManifest(manifest);
    const loadedItems = await Promise.all(items.map(loadAssetLibraryItem));

    MBG.assetLibrary.manifest = manifest;
    MBG.assetLibrary.assets = loadedItems;
    MBG.assetLibrary.loaded = true;
    MBG.assetLibrary.error = null;

    syncAssetLibrarySelectionFromField();
    renderAssetLibraryBrowser();
    updateAssetLibraryCounter();
    if (status) {
      status.textContent = "Biblioteka SVG wczytana z assets/library.json.";
    }
    setStatus("Załadowano bibliotekę SVG: " + loadedItems.filter(item => item.img).length);
    generatePreview();
  } catch (err) {
    console.error("Nie udało się wczytać biblioteki SVG:", err);
    await loadFallbackAssetLibrary(err);
  }
}

async function loadFallbackAssetLibrary(originalError) {
  const status = el("assetLibraryStatus");
  const fallbackManifest = createFallbackAssetLibraryManifest();

  try {
    const items = normalizeAssetLibraryManifest(fallbackManifest);
    const loadedItems = await Promise.all(items.map(loadAssetLibraryItem));

    MBG.assetLibrary.manifest = fallbackManifest;
    MBG.assetLibrary.assets = loadedItems;
    MBG.assetLibrary.loaded = true;
    MBG.assetLibrary.error = null;

    syncAssetLibrarySelectionFromField();
    renderAssetLibraryBrowser();
    updateAssetLibraryCounter();
    if (status) {
      status.textContent = "Biblioteka SVG działa w trybie fallback, bo assets/library.json nie został pobrany.";
    }
    setStatus("Załadowano fallback biblioteki SVG: " + loadedItems.filter(item => item.img).length);
    generatePreview();
  } catch (fallbackError) {
    console.error("Nie udało się wczytać fallbacku biblioteki SVG:", fallbackError);
    MBG.assetLibrary.loaded = false;
    MBG.assetLibrary.error = fallbackError || originalError;
    if (status) {
      status.textContent = "Nie udało się wczytać biblioteki SVG ani fallbacku.";
    }
    updateAssetLibraryCounter();
  }
}

function createFallbackAssetLibraryManifest() {
  return {
    version: 1,
    fallback: true,
    libraries: [
      {
        id: "basic",
        label: "Basic",
        categories: [
          {
            id: "shapes",
            label: "Kształty",
            basePath: "assets/basic/shapes/",
            items: [
              { id: "basic-shape-circle", label: "Circle", file: "001_circle.svg" },
              { id: "basic-shape-square", label: "Square", file: "002_square.svg" },
              { id: "basic-shape-rectangle", label: "Rectangle", file: "003_rectangle.svg" },
              { id: "basic-shape-triangle", label: "Triangle", file: "004_triangle.svg" },
              { id: "basic-shape-star", label: "Star", file: "005_star.svg" },
              { id: "basic-shape-heart", label: "Heart", file: "006_heart.svg" },
              { id: "basic-shape-cloud", label: "Cloud", file: "007_cloud.svg" },
              { id: "basic-shape-moon", label: "Moon", file: "008_moon.svg" },
              { id: "basic-shape-sun", label: "Sun", file: "009_sun.svg" },
              { id: "basic-shape-drop", label: "Drop", file: "010_drop.svg" },
              { id: "basic-shape-diamond", label: "Diamond", file: "011_diamond.svg" },
              { id: "basic-shape-hexagon", label: "Hexagon", file: "012_hexagon.svg" },
              { id: "basic-shape-pentagon", label: "Pentagon", file: "013_pentagon.svg" },
              { id: "basic-shape-oval", label: "Oval", file: "014_oval.svg" },
              { id: "basic-shape-cross", label: "Cross", file: "015_cross.svg" },
              { id: "basic-shape-arrow", label: "Arrow", file: "016_arrow.svg" },
              { id: "basic-shape-flower", label: "Flower", file: "017_flower.svg" },
              { id: "basic-shape-leaf", label: "Leaf", file: "018_leaf.svg" },
              { id: "basic-shape-tree", label: "Tree", file: "019_tree.svg" },
              { id: "basic-shape-house", label: "House", file: "020_house.svg" }
            ]
          },
          {
            id: "symbols",
            label: "Symbole",
            basePath: "assets/basic/symbols/",
            items: [
              { id: "basic-symbol-check", label: "Check", file: "001_check.svg" },
              { id: "basic-symbol-x-mark", label: "X Mark", file: "002_x_mark.svg" },
              { id: "basic-symbol-plus", label: "Plus", file: "003_plus.svg" },
              { id: "basic-symbol-minus", label: "Minus", file: "004_minus.svg" },
              { id: "basic-symbol-question-mark", label: "Question Mark", file: "005_question_mark.svg" },
              { id: "basic-symbol-exclamation-mark", label: "Exclamation Mark", file: "006_exclamation_mark.svg" },
              { id: "basic-symbol-smile", label: "Smile", file: "007_smile.svg" },
              { id: "basic-symbol-star-badge", label: "Star Badge", file: "008_star_badge.svg" },
              { id: "basic-symbol-flag", label: "Flag", file: "009_flag.svg" },
              { id: "basic-symbol-crown", label: "Crown", file: "010_crown.svg" },
              { id: "basic-symbol-trophy", label: "Trophy", file: "011_trophy.svg" },
              { id: "basic-symbol-medal", label: "Medal", file: "012_medal.svg" },
              { id: "basic-symbol-lightning", label: "Lightning", file: "013_lightning.svg" },
              { id: "basic-symbol-music-note", label: "Music Note", file: "014_music_note.svg" },
              { id: "basic-symbol-clock", label: "Clock", file: "015_clock.svg" },
              { id: "basic-symbol-book", label: "Book", file: "016_book.svg" },
              { id: "basic-symbol-pencil", label: "Pencil", file: "017_pencil.svg" },
              { id: "basic-symbol-magnifier", label: "Magnifier", file: "018_magnifier.svg" },
              { id: "basic-symbol-key", label: "Key", file: "019_key.svg" },
              { id: "basic-symbol-lock", label: "Lock", file: "020_lock.svg" }
            ]
          },
          {
            id: "lines",
            label: "Lines / Pre-writing",
            basePath: "assets/basic/lines/",
            items: [
              { id: "basic-line-short-horizontal", label: "Short Horizontal", file: "001_short_horizontal.svg" },
              { id: "basic-line-short-vertical", label: "Short Vertical", file: "002_short_vertical.svg" },
              { id: "basic-line-long-horizontal", label: "Long Horizontal", file: "003_long_horizontal.svg" },
              { id: "basic-line-long-vertical", label: "Long Vertical", file: "004_long_vertical.svg" },
              { id: "basic-line-small-diagonal-up", label: "Small Diagonal Up", file: "005_small_diagonal_up.svg" },
              { id: "basic-line-small-diagonal-down", label: "Small Diagonal Down", file: "006_small_diagonal_down.svg" },
              { id: "basic-line-large-diagonal-up", label: "Large Diagonal Up", file: "007_large_diagonal_up.svg" },
              { id: "basic-line-large-diagonal-down", label: "Large Diagonal Down", file: "008_large_diagonal_down.svg" },
              { id: "basic-line-small-curve-left", label: "Small Curve Left", file: "009_small_curve_left.svg" },
              { id: "basic-line-small-curve-right", label: "Small Curve Right", file: "010_small_curve_right.svg" },
              { id: "basic-line-large-curve-left", label: "Large Curve Left", file: "011_large_curve_left.svg" },
              { id: "basic-line-large-curve-right", label: "Large Curve Right", file: "012_large_curve_right.svg" },
              { id: "basic-line-wave", label: "Wave", file: "013_wave.svg" },
              { id: "basic-line-zigzag", label: "Zigzag", file: "014_zigzag.svg" },
              { id: "basic-line-mountain", label: "Mountain", file: "015_mountain.svg" },
              { id: "basic-line-valley", label: "Valley", file: "016_valley.svg" },
              { id: "basic-line-loop", label: "Loop", file: "017_loop.svg" },
              { id: "basic-line-spiral", label: "Spiral", file: "018_spiral.svg" },
              { id: "basic-line-infinity", label: "Infinity", file: "019_infinity.svg" },
              { id: "basic-line-mixed-pattern", label: "Mixed Pattern", file: "020_mixed_pattern.svg" }
            ]
          }
        ]
      }
    ]
  };
}

function normalizeAssetLibraryManifest(manifest) {
  const result = [];
  const libraries = Array.isArray(manifest && manifest.libraries) ? manifest.libraries : [];

  libraries.forEach(library => {
    const libraryId = String(library.id || "library").trim() || "library";
    const libraryLabel = String(library.label || libraryId).trim() || libraryId;
    const libraryBasePath = library.basePath || "";
    const categories = Array.isArray(library.categories) ? library.categories : [];

    categories.forEach(category => {
      const categoryId = String(category.id || "assets").trim() || "assets";
      const categoryLabel = String(category.label || categoryId).trim() || categoryId;
      const basePath = category.basePath || libraryBasePath;
      const items = Array.isArray(category.items) ? category.items : [];

      items.forEach((item, index) => {
        const file = item.file || item.path || "";
        if (!file) return;

        const path = item.path || (basePath + file);
        const id = String(item.id || [libraryId, categoryId, index + 1].join("-")).trim();
        if (!id) return;

        result.push({
          id,
          label: String(item.label || file.replace(/^\d+_/, "").replace(/\.svg$/i, "").replace(/_/g, " ")).trim(),
          file,
          path,
          libraryId,
          libraryLabel,
          categoryId,
          categoryLabel,
          img: null
        });
      });
    });
  });

  return result;
}

function loadAssetLibraryItem(item) {
  return imageFromSrc(item.path)
    .then(img => Object.assign({}, item, { img }))
    .catch(err => {
      console.error("Nie udało się wczytać assetu SVG:", item.path, err);
      return Object.assign({}, item, { img: null, error: err });
    });
}

function imageFromSrc(src) {
  return fetch(src)
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.blob();
    })
    .then(blobToDataUrl)
    .catch(function (error) {
      console.warn("Nie udało się przekonwertować assetu do dataUrl, używam src:", src, error);
      return src;
    })
    .then(function (safeSrc) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        if (!String(safeSrc).startsWith("data:")) img.crossOrigin = "anonymous";
        img.onload = function () {
          resolve(img);
        };
        img.onerror = reject;
        img.src = safeSrc;
      });
  });
}

function getAssetLibrarySelectedIdsFromField() {
  const value = getValue("shapeTracerSelectedAssetIds", "");
  return String(value || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);
}

function syncAssetLibrarySelectionFromField() {
  MBG.assetLibrary.selectedIds = new Set(getAssetLibrarySelectedIdsFromField());
}

function syncAssetLibrarySelectionToField() {
  const field = el("shapeTracerSelectedAssetIds");
  if (field) {
    field.value = Array.from(MBG.assetLibrary.selectedIds).sort().join(",");
  }
  updateAssetLibraryCounter();
}

function setAssetLibrarySelection(ids, shouldRefresh) {
  MBG.assetLibrary.selectedIds = new Set((ids || []).filter(Boolean));
  renewAssetLibrarySelectionSeed();
  syncAssetLibrarySelectionToField();
  renderAssetLibraryBrowser();
  if (shouldRefresh) generatePreview();
}

function renewAssetLibrarySelectionSeed() {
  MBG.assetLibrary.selectionSeed = Math.floor(Math.random() * 2147483646) + 1;
}

function getAssetLibraryItems() {
  return (MBG.assetLibrary.assets || []).filter(item => item && item.img);
}

function getAssetLibraryItemsByCategory(categoryId) {
  const normalized = String(categoryId || "").toLowerCase();
  return getAssetLibraryItems().filter(item => String(item.categoryId || "").toLowerCase() === normalized);
}

function getFilteredAssetLibraryItems() {
  const filter = String(getValue("assetLibraryFilter", "all") || "all").toLowerCase();
  if (filter === "shapes") return getAssetLibraryItemsByCategory("shapes");
  if (filter === "symbols") return getAssetLibraryItemsByCategory("symbols");
  if (filter === "lines") return getAssetLibraryItemsByCategory("lines");
  if (filter === "selected") {
    return getAssetLibraryItems().filter(item => MBG.assetLibrary.selectedIds.has(item.id));
  }
  return getAssetLibraryItems();
}

function updateAssetLibraryCounter() {
  const counter = el("assetLibraryCount");
  if (!counter) return;

  const loaded = getAssetLibraryItems().length;
  const selected = Array.from(MBG.assetLibrary.selectedIds)
    .filter(id => getAssetLibraryItems().some(item => item.id === id))
    .length;

  counter.textContent = "Biblioteka SVG: " + loaded + " | Wybrane: " + selected;
}

function renderAssetLibraryBrowser() {
  const grid = el("assetLibraryGrid");
  if (!grid) return;

  syncAssetLibrarySelectionFromField();
  grid.innerHTML = "";

  if (MBG.assetLibrary.error) {
    grid.innerHTML = "<p class=\"note\">Biblioteka SVG nie jest dostępna.</p>";
    updateAssetLibraryCounter();
    return;
  }

  const items = getFilteredAssetLibraryItems();
  if (!items.length) {
    grid.innerHTML = "<p class=\"note\">Brak assetów SVG dla wybranego filtra.</p>";
    updateAssetLibraryCounter();
    return;
  }

  items.forEach(item => {
    const label = document.createElement("label");
    label.className = "asset-library-card";
    if (MBG.assetLibrary.selectedIds.has(item.id)) label.className += " is-selected";

    const checkbox = document.createElement("input");
    checkbox.className = "asset-library-checkbox";
    checkbox.type = "checkbox";
    checkbox.value = item.id;
    checkbox.checked = MBG.assetLibrary.selectedIds.has(item.id);

    const img = document.createElement("img");
    img.src = item.path;
    img.alt = item.label;
    img.loading = "lazy";

    const title = document.createElement("span");
    title.className = "asset-library-title";
    title.textContent = item.label;

    const category = document.createElement("span");
    category.className = "asset-library-category";
    category.textContent = item.categoryLabel;

    label.appendChild(checkbox);
    label.appendChild(img);
    label.appendChild(title);
    label.appendChild(category);
    grid.appendChild(label);
  });

  updateAssetLibraryCounter();
}

function updateDecoCounter() {
  const counter = el("decoAssetCount");
  if (counter) {
    counter.textContent = "Załadowane assety DECO: " + MBG.decoAssets.length;
  }
}

function clearDecoAssets() {
  MBG.decoAssets = [];
  updateDecoCounter();
  generatePreview();
}

/* ============================================================
   PREVIEW
============================================================ */

function generatePreview() {
  const canvas = el("previewCanvas");
  if (!canvas) return;

  const settings = readSettings();
  const previewMode = getValue("previewMode", "single");

  if (previewMode === "multi") {
    generateMultiPagePreview(canvas, settings);
    return;
  }

  canvas.width = MBG.PAGE_W;
  canvas.height = MBG.PAGE_H;

  const ctx = canvas.getContext("2d");
  const pageType = getValue("previewPageType", "auto");

  if (pageType && pageType !== "auto") {
    const previewPages = buildPreviewPagePlan(settings, pageType, 1);
    drawPreviewPlanPage(ctx, settings, previewPages[0] || { type: "maze", index: 1 });
    forceCanvasGrayscale(canvas);
    setStatus("Podgląd odświeżony.");
    return;
  }

  const mazeData = createMazeData(settings, 1);
  MBG.lastPreviewMaze = mazeData;

  drawMazePage(ctx, settings, mazeData, false);
  forceCanvasGrayscale(canvas);

  setStatus("Podgląd odświeżony.");
}

function drawPreview() {
  generatePreview();
}

function generateMultiPagePreview(canvas, settings) {
  const pageCount = clamp(getNumber("previewPageCount", 6), 1, 12);
  const pageType = getValue("previewPageType", "auto");
  const offset = MBG.previewPageOffset || 0;
  const previewPages = buildPreviewPagePlan(settings, pageType, pageCount + offset);
  const visiblePages = previewPages.slice(offset, offset + pageCount);

  if (!visiblePages.length) {
    canvas.width = MBG.PAGE_W;
    canvas.height = MBG.PAGE_H;
    clearPage(canvas.getContext("2d"));
    setStatus("Brak stron do podglądu dla wybranego typu.");
    return;
  }

  const gap = 80;
  canvas.width = MBG.PAGE_W;
  canvas.height = visiblePages.length * MBG.PAGE_H + (visiblePages.length - 1) * gap;

  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  visiblePages.forEach((page, index) => {
    const pageCanvas = createCanvas();
    drawPreviewPlanPage(pageCanvas.getContext("2d"), settings, page);
    forceCanvasGrayscale(pageCanvas);
    ctx.drawImage(pageCanvas, 0, index * (MBG.PAGE_H + gap));
  });

  setStatus("Podgląd wielu stron odświeżony: " + visiblePages.length + " stron.");
}

function buildPreviewPagePlan(settings, pageType, requestedCount) {
  const limit = clamp(requestedCount || 6, 1, 24);
  if (pageType === "maze-only") return buildRepeatedPreviewPages("maze", limit);
  if (pageType === "shape-tracer-only") return buildRepeatedPreviewPages("shape-tracer", limit);
  if (pageType === "coloring-only") return buildRepeatedPreviewPages("coloring", limit);
  if (pageType === "fenix-basket-only") return getEnabledFenixBasketPlanPages().slice(0, limit);
  if (pageType === "solutions-only") return buildRepeatedPreviewPages("solution", limit);
  if (pageType === "mixed") return buildMixedPreviewPages(settings, limit);
  return buildAutoBookPreviewPages(settings, limit);
}

function buildBookPagePlan(settings) {
  const pages = [];
  let fenixBasketInserted = false;

  function insertFenixBasketAt(placement) {
    if (fenixBasketInserted) return;
    if (!settings.fenixBasketEnabled) return;
    if (settings.fenixBasketPlacement !== placement) return;
    const basketPages = getEnabledFenixBasketPlanPages();
    if (!basketPages.length) return;
    pages.push(...basketPages);
    fenixBasketInserted = true;
  }

  if (settings.includeIntroPages) {
    pages.push({ type: "intro", index: 1 });
    pages.push({ type: "how-to", index: 1 });
  }

  insertFenixBasketAt("after-intro");

  if (settings.includeMissionTracker) {
    pages.push({ type: "mission-tracker", index: 1 });
  }

  if (settings.includeShapeTracerPages) {
    for (let i = 1; i <= settings.shapeTracerPageCount; i++) {
      pages.push({ type: "shape-tracer", index: i });
    }
  }

  if (settings.includeColoringPages) {
    for (let i = 1; i <= settings.coloringPageCount; i++) {
      pages.push({ type: "coloring", index: i });
    }
  }

  insertFenixBasketAt("before-mazes");

  for (let i = 1; i <= settings.mazeCount; i++) {
    pages.push({ type: "maze", index: i });
  }

  insertFenixBasketAt("after-mazes");
  insertFenixBasketAt("before-solutions");

  if (settings.includeSolutions) {
    for (let i = 1; i <= settings.mazeCount; i++) {
      pages.push({ type: "solution", index: i });
    }
  }

  if (settings.includeCongratsPage) {
    pages.push({ type: "congrats", index: 1 });
  }

  if (settings.includeQrPage) {
    pages.push({ type: "qr", index: 1 });
  }

  insertFenixBasketAt("before-certificate");

  if (settings.includeCertificatePage) {
    pages.push({
      type: "certificate",
      index: 1,
      ensureOddPage: true
    });

    if (settings.certificateBlankBack) {
      pages.push({
        type: "blank",
        index: 1,
        role: "certificate-blank-back"
      });
    }
  }

  if (!fenixBasketInserted && settings.fenixBasketEnabled) {
    pages.push(...getEnabledFenixBasketPlanPages());
  }

  return pages;
}

function getEnabledFenixBasketPlanPages() {
  return getAvailableFenixPages().filter(function (page) {
    return page.includeInBook !== false;
  }).map(function (page, index) {
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
      width: page.width || MBG.PAGE_W,
      height: page.height || MBG.PAGE_H,
      mimeType: page.mimeType || "image/png"
    };
  });
}

function buildRepeatedPreviewPages(type, limit) {
  const pages = [];
  for (let i = 1; i <= limit; i++) pages.push({ type, index: i });
  return pages;
}

function buildMixedPreviewPages(settings, limit) {
  const pages = [];
  const sequence = [];
  if (settings.includeColoringPages) sequence.push("coloring");
  if (settings.fenixBasketEnabled && getAvailableFenixPages().length) sequence.push("fenix_basket_page");
  sequence.push("intro", "how-to", "mission-tracker", "shape-tracer", "maze", "solution", "congrats", "qr", "certificate");
  for (let i = 0; pages.length < limit; i++) {
    pages.push({ type: sequence[i % sequence.length], index: Math.floor(i / sequence.length) + 1 });
  }
  return pages;
}

function buildAutoBookPreviewPages(settings, limit) {
  return buildBookPagePlan(settings)
    .filter(page => page.type !== "blank")
    .slice(0, limit);
}

function drawPreviewPlanPage(ctx, settings, page) {
  if (page.type === "intro") return drawIntroPage(ctx, settings);
  if (page.type === "how-to") return drawHowToPage(ctx, settings);
  if (page.type === "mission-tracker") return drawMissionTrackerPage(ctx, settings);
  if (page.type === "shape-tracer") return drawShapeTracerPage(ctx, settings, page.index);
  if (page.type === "coloring") return renderColoringPage(ctx, settings, page.index);
  if (page.type === "fenix_basket_page") return drawFenixBasketPreviewPage(ctx, page);
  if (page.type === "solution") return drawMazePage(ctx, settings, createMazeData(settings, page.index), true);
  if (page.type === "congrats") return drawCongratsPage(ctx, settings);
  if (page.type === "qr") return drawQrPage(ctx, settings);
  if (page.type === "certificate") return drawCertificatePage(ctx, settings);
  return drawMazePage(ctx, settings, createMazeData(settings, page.index), false);
}

function drawFenixBasketPreviewPage(ctx, page) {
  clearPage(ctx);
  if (!page || (!page.blob && !page.dataUrl && !page.previewImage)) {
    drawFenixBasketPlaceholder(ctx, "Brak strony z koszyka Fenixa");
    return;
  }

  if (page.previewImage) {
    clearPage(ctx);
    drawImageContain(ctx, page.previewImage, 0, 0, MBG.PAGE_W, MBG.PAGE_H);
    return;
  }

  drawFenixBasketPlaceholder(ctx, page.title || page.fileName || "Strona z koszyka Fenixa");
  const url = page.dataUrl || URL.createObjectURL(page.blob);
  const img = new Image();
  img.onload = function () {
    clearPage(ctx);
    drawImageContain(ctx, img, 0, 0, MBG.PAGE_W, MBG.PAGE_H);
    if (url !== page.dataUrl) URL.revokeObjectURL(url);
  };
  img.onerror = function () {
    if (url !== page.dataUrl) URL.revokeObjectURL(url);
    drawFenixBasketPlaceholder(ctx, "Nie udało się wczytać miniatury koszyka");
  };
  img.src = url;
}

function drawFenixBasketPlaceholder(ctx, title) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, MBG.PAGE_W, MBG.PAGE_H);
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 8;
  ctx.strokeRect(80, 80, MBG.PAGE_W - 160, MBG.PAGE_H - 160);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 72px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  wrapText(ctx, title || "Koszyk stron Fenixa", MBG.PAGE_W / 2, MBG.PAGE_H / 2, 1800, 72, "center");
  ctx.restore();
}

function previewPreviousPage() {
  MBG.previewPageOffset = Math.max(0, (MBG.previewPageOffset || 0) - 1);
  generatePreview();
}

function previewNextPage() {
  MBG.previewPageOffset = Math.min(12, (MBG.previewPageOffset || 0) + 1);
  generatePreview();
}

function drawPreviewMaze() {
  generatePreview();
}

/* ============================================================
   PDF EXPORT
============================================================ */

async function generatePDF() {
  if (isPdfExportRunning) {
    setStatus("Eksport PDF już trwa. Proszę czekać.");
    return;
  }

  isPdfExportRunning = true;
  setPdfExportButtonRunning(true);
  setStatus("Przygotowuję PDF...");

  let currentPdfPage = null;

  try {
    const settings = readSettings();

    if (!window.jspdf || !window.jspdf.jsPDF) {
      setStatus("Błąd eksportu PDF: nie załadowano jsPDF.");
      alert("Nie załadowano jsPDF. Sprawdź połączenie z internetem albo CDN w pliku HTML.");
      return;
    }

    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "in",
      format: [8.5, 11],
      compress: true
    });

    let pdfPageCount = 0;

    function addCanvas(canvas) {
      forceCanvasGrayscale(canvas);

      const format = settings.exportImageFormat === "PNG" ? "PNG" : "JPEG";
      const data = format === "PNG"
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", settings.jpegQuality);

      if (pdfPageCount > 0) {
        pdf.addPage([8.5, 11], "portrait");
      }

      pdf.addImage(data, format, 0, 0, 8.5, 11);
      pdfPageCount++;
    }

    async function addFenixBasketPdfPage(page) {
      const data = page.dataUrl || (page.blob ? await blobToDataUrl(page.blob) : "");
      if (!data) return;
      if (pdfPageCount > 0) {
        pdf.addPage([8.5, 11], "portrait");
      }
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, 8.5, 11, "F");
      pdf.addImage(data, "PNG", 0, 0, 8.5, 11);
      pdfPageCount++;
    }

    function addCleanBlankPage() {
      const blankCanvas = createCanvas();
      clearPage(blankCanvas.getContext("2d"));
      addCanvas(blankCanvas);
    }

    function ensureNextPdfPageIsOdd() {
      const nextPageNumber = pdfPageCount + 1;
      if (nextPageNumber % 2 === 0) {
        addCleanBlankPage();
      }
    }

    setStatus("Buduję plan stron...");
    await waitFrame();
    updateFenixBasketStatus();

    const pagePlan = buildBookPagePlan(settings);
    const mazesByIndex = {};
    const coloringAssets = settings.includeColoringPages ? getColoringSourceAssets(settings) : [];
    const qrAssets = MBG.qrAssets || [];
    let coloringMissingReported = false;
    let qrMissingReported = false;
    let renderedPlanPages = 0;

    setStatus("Generuję PDF — proszę czekać...");
    await waitFrame();

    for (const page of pagePlan) {
      currentPdfPage = page;
      renderedPlanPages++;
      setStatus("Renderuję stronę " + renderedPlanPages + " z " + pagePlan.length + "...");
      await waitFrame();

      if (page.type === "blank") {
        addCleanBlankPage();
        continue;
      }

      if (page.type === "fenix_basket_page") {
        await addFenixBasketPdfPage(page);
        continue;
      }

      if (page.ensureOddPage) {
        /*
          CERTIFICATE CUT-OUT SAFETY:
          A cut-out certificate should start on an odd page/right-hand page.
          If the next PDF page would be even, MBG automatically inserts
          one clean blank separator page before the certificate.
          A blank page after the certificate is still controlled by
          settings.certificateBlankBack and should normally stay enabled.
        */
        ensureNextPdfPageIsOdd();
      }

      if (page.type === "coloring" && !coloringAssets.length) {
        if (!coloringMissingReported) {
          setStatus("PominiÄ™to kolorowanki: " + getColoringMissingAssetMessage(settings));
          coloringMissingReported = true;
        }
        continue;
      }

      if (page.type === "qr" && !qrAssets.length) {
        if (!qrMissingReported) {
          const message = "Pominieto strone QR: brak zaladowanego assetu QR.";
          console.warn(message);
          setStatus(message);
          qrMissingReported = true;
        }
        continue;
      }

      const canvas = createCanvas();
      const ctx = canvas.getContext("2d");

      if (page.type === "intro") {
        drawIntroPage(ctx, settings);
      } else if (page.type === "how-to") {
        drawHowToPage(ctx, settings);
      } else if (page.type === "mission-tracker") {
        drawMissionTrackerPage(ctx, settings);
      } else if (page.type === "shape-tracer") {
        drawShapeTracerPage(ctx, settings, page.index);
      } else if (page.type === "coloring") {
        renderColoringPage(ctx, settings, page.index);
      } else if (page.type === "maze") {
        const mazeData = createMazeData(settings, page.index);
        mazesByIndex[page.index] = mazeData;
        drawMazePage(ctx, settings, mazeData, false);
      } else if (page.type === "solution") {
        const mazeData = mazesByIndex[page.index] || createMazeData(settings, page.index);
        mazesByIndex[page.index] = mazeData;
        drawMazePage(ctx, settings, mazeData, true);
      } else if (page.type === "congrats") {
        drawCongratsPage(ctx, settings);
      } else if (page.type === "qr") {
        drawQrPage(ctx, settings);
      } else if (page.type === "certificate") {
        drawCertificatePage(ctx, settings);
      } else {
        continue;
      }

      addCanvas(canvas);

      if (page.type === "shape-tracer" && page.index % 10 === 0) {
        setStatus("Wygenerowano strony rysowania po Ĺ›ladzie: " + page.index + " / " + settings.shapeTracerPageCount);
        await waitFrame();
      }

      if (page.type === "coloring" && page.index % 10 === 0) {
        setStatus("Wygenerowano kolorowanki: " + page.index + " / " + settings.coloringPageCount);
        await waitFrame();
      }

      if (page.type === "maze" && page.index % 5 === 0) {
        setStatus("Wygenerowano labirynty: " + page.index + " / " + settings.mazeCount);
        await waitFrame();
      }

      if (page.type === "solution" && page.index % 5 === 0) {
        setStatus("Wygenerowano rozwiÄ…zania: " + page.index + " / " + settings.mazeCount);
        await waitFrame();
      }
    }

    const plannedFileName = safeFileName(settings.exportFileName) + ".pdf";
    setStatus("Zapisuję PDF...");
    pdf.save(plannedFileName);

    setStatus("PDF wygenerowany. Liczba stron: " + pdfPageCount);
  } catch (error) {
    const errorMessage = error && error.message ? error.message : String(error);
    const isTaintedCanvasError = /taint|cross-origin|getImageData|SecurityError/i.test(errorMessage);
    console.error("Błąd eksportu PDF:", {
      error: error,
      page: currentPdfPage ? {
        type: currentPdfPage.type,
        index: currentPdfPage.index,
        sourceKind: currentPdfPage.sourceKind,
        sourceModule: currentPdfPage.sourceModule,
        fileName: currentPdfPage.fileName,
        hasDataUrl: !!currentPdfPage.dataUrl,
        dataUrlPrefix: currentPdfPage.dataUrl ? String(currentPdfPage.dataUrl).slice(0, 22) : "",
        hasBlob: !!currentPdfPage.blob,
        hasPreviewImage: !!currentPdfPage.previewImage
      } : null
    });
    setStatus(isTaintedCanvasError
      ? "Błąd eksportu PDF: jeden z obrazów nie może zostać odczytany przez canvas. Spróbuj użyć PNG/dataUrl albo paczki .fenixpack."
      : "Błąd eksportu PDF: " + errorMessage);
  } finally {
    isPdfExportRunning = false;
    setPdfExportButtonRunning(false);
  }
}

function blobToDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result);
    };
    reader.onerror = function () {
      reject(reader.error || new Error("Błąd odczytu PNG z koszyka Fenixa."));
    };
    reader.readAsDataURL(blob);
  });
}

async function generateFullPdf() {
  await generatePDF();
}

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = MBG.PAGE_W;
  canvas.height = MBG.PAGE_H;
  return canvas;
}

/* ============================================================
   B&W / GRAYSCALE SAFE
============================================================ */

function forceCanvasGrayscale(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(
      data[i] * 0.299 +
      data[i + 1] * 0.587 +
      data[i + 2] * 0.114
    );

    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  ctx.putImageData(imageData, 0, 0);
}

/* ============================================================
   PAGE LAYOUT
============================================================ */

function clearPage(ctx) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, MBG.PAGE_W, MBG.PAGE_H);
  ctx.restore();
}

function getMazeLayout(settings) {
  const safe = settings.safeMargin;
  const headerHeight = 360;
  const footerHeight = 220;

  const availableW = MBG.PAGE_W - safe * 2;
  const availableH = MBG.PAGE_H - safe * 2 - headerHeight - footerHeight - settings.mazePadding;

  const cellW = availableW / settings.mazeWidth;
  const cellH = availableH / settings.mazeHeight;
  const cell = Math.min(cellW, cellH);

  const boxW = cell * settings.mazeWidth;
  const boxH = cell * settings.mazeHeight;

  const mazeBox = {
    x: (MBG.PAGE_W - boxW) / 2,
    y: safe + headerHeight + Math.floor(settings.mazePadding * 0.15),
    w: boxW,
    h: boxH
  };

  return {
    safe,
    headerBox: {
      x: safe,
      y: safe,
      w: MBG.PAGE_W - safe * 2,
      h: headerHeight
    },
    mazeBox,
    footerBox: {
      x: safe,
      y: mazeBox.y + mazeBox.h + 60,
      w: MBG.PAGE_W - safe * 2,
      h: footerHeight
    }
  };
}

/* ============================================================
   INTRO / HOW TO / CONGRATS
============================================================ */

function drawIntroPage(ctx, settings) {
  clearPage(ctx);

  drawDecoLayer(ctx, settings, "intro", {
    mazeBox: null,
    headerBox: { x: 180, y: 180, w: MBG.PAGE_W - 360, h: 650 },
    footerBox: { x: 180, y: 2600, w: MBG.PAGE_W - 360, h: 420 }
  });

  ctx.save();
  ctx.textAlign = "center";

  ctx.fillStyle = "#111827";
  fitText(ctx, settings.bookTitle, MBG.PAGE_W / 2, 660, 128, 2000, "Arial", "bold");

  if (settings.bookTitleLine2) {
    fitText(ctx, settings.bookTitleLine2, MBG.PAGE_W / 2, 820, 82, 1900, "Arial", "bold");
  }

  ctx.fillStyle = "#111827";
  ctx.font = "bold 54px Arial";
  wrapText(ctx, settings.bookSubtitle, MBG.PAGE_W / 2, 990, 1800, 68, "center");

  ctx.fillStyle = "#111827";
  ctx.font = "bold 48px Arial";
  wrapText(ctx, settings.bookInfo, MBG.PAGE_W / 2, 1190, 1800, 62, "center");

  ctx.fillStyle = "#111827";
  ctx.font = "bold 48px Arial";
  wrapText(ctx, settings.missionStartText, MBG.PAGE_W / 2, 1480, 1800, 62, "center");

  ctx.fillStyle = "#374151";
  ctx.font = "38px Arial";
  wrapText(ctx, settings.screenFreeText, MBG.PAGE_W / 2, 1660, 1750, 54, "center");

  ctx.fillStyle = "#111827";
  ctx.font = "40px Arial";
  wrapText(ctx, settings.bookIntroText, MBG.PAGE_W / 2, 1930, 1750, 58, "center");

  if (settings.useIntroAssets) {
    drawIntroAssets(ctx, settings);
  }

  ctx.restore();
}

function drawIntroAssets(ctx, settings) {
  const scale = settings.introAssetScale;
  const size = 260 * scale;

  drawImageIfExists(ctx, MBG.assets.start, 440, 2520, size);
  drawImageIfExists(ctx, MBG.assets.goal, MBG.PAGE_W - 440, 2520, size);
  drawImageIfExists(ctx, MBG.assets.checkpoint, 440, 2860, size * 0.8);
  drawImageIfExists(ctx, MBG.assets.enemy, MBG.PAGE_W - 440, 2860, size * 0.8);
}

function drawHowToPage(ctx, settings) {
  clearPage(ctx);

  drawDecoLayer(ctx, settings, "intro", {
    mazeBox: null,
    headerBox: { x: 180, y: 180, w: MBG.PAGE_W - 360, h: 500 },
    footerBox: { x: 180, y: 2700, w: MBG.PAGE_W - 360, h: 380 }
  });

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "#111827";
  fitText(ctx, settings.howToTitle, MBG.PAGE_W / 2, 420, 110, 1900, "Arial", "bold");

  let lines = settings.howToLines
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  const hasCheckpoint =
    settings.checkpointCount > 0 &&
    settings.useAssets &&
    MBG.assets.checkpoint;

  const hasEnemy =
    settings.enemyCount > 0 &&
    settings.useAssets &&
    MBG.assets.enemy;

  const checkpointLabel = String(settings.checkpointLabel || "CHECKPOINT").trim() || "CHECKPOINT";
  const enemyLabel = String(settings.enemyLabel || "OBSTACLE").trim() || "OBSTACLE";

  const hasCheckpointText = lines.some(line => {
    const t = line.toLowerCase();
    return t.includes("checkpoint") || t.includes("egg") || t.includes("check point");
  });

  const hasEnemyText = lines.some(line => {
    const t = line.toLowerCase();
    return (
      t.includes("avoid") ||
      t.includes("obstacle") ||
      t.includes("hazard") ||
      t.includes("enemy") ||
      t.includes("mud") ||
      t.includes("puddle") ||
      t.includes("t-rex") ||
      t.includes("trex") ||
      t.includes("danger")
    );
  });

  if (hasCheckpoint && !hasCheckpointText) {
    const checkpointLine = "Visit the " + checkpointLabel + " checkpoint.";
    const insertIndex = lines.length > 0 ? 1 : 0;
    lines = [
      ...lines.slice(0, insertIndex),
      checkpointLine,
      ...lines.slice(insertIndex)
    ];
  }

  if (hasEnemy && !hasEnemyText) {
    const hazardLine = "Avoid the " + enemyLabel + ".";
    const checkpointIndex = lines.findIndex(line => {
      const t = String(line || "").toLowerCase();
      return t.includes("checkpoint") || t.includes("egg") || t.includes("check point");
    });
    const startIndex = lines.findIndex(line => String(line || "").toLowerCase().includes("start"));
    const insertIndex = checkpointIndex >= 0 ? checkpointIndex + 1 : (startIndex >= 0 ? startIndex + 1 : 0);
    lines = [
      ...lines.slice(0, insertIndex),
      hazardLine,
      ...lines.slice(insertIndex)
    ];
  }

  const boxX = 350;
  const boxW = MBG.PAGE_W - 700;
  const rowH = lines.length >= 6 ? 165 : 185;
  const rowGap = lines.length >= 6 ? 50 : 50;
  let y = 730;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = "#f9fafb";
    roundRect(ctx, boxX, y, boxW, rowH, 28, true, false);

    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 4;
    roundRect(ctx, boxX, y, boxW, rowH, 28, false, true);

    ctx.fillStyle = "#111827";
    ctx.textAlign = "left";
    ctx.font = "bold 52px Arial";
    ctx.fillText(String(i + 1) + ".", boxX + 55, y + rowH * 0.62);

    ctx.font = "42px Arial";
    wrapText(ctx, lines[i], boxX + 145, y + rowH * 0.40, boxW - 250, 54, "left");

    if (settings.useInstructionIcons) {
      const iconSize = 110 * settings.instructionIconScale;
      const iconX = boxX + boxW - 95;
      const iconY = y + rowH / 2;
      const icon = getHowToIconForLine(lines[i], settings);

      if (icon) drawImageIfExists(ctx, icon, iconX, iconY, iconSize);
    }

    y += rowH + rowGap;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#111827";
  ctx.font = "bold 42px Arial";
  wrapText(ctx, settings.tipText, MBG.PAGE_W / 2, 2530, 1800, 58, "center");

  ctx.fillStyle = "#374151";
  ctx.font = "38px Arial";
  wrapText(ctx, settings.howToFooter, MBG.PAGE_W / 2, 2840, 1800, 54, "center");

  ctx.restore();
}

function getHowToIconForLine(line, settings) {
  const text = String(line || "").toLowerCase();

  if (text.includes("start")) {
    return MBG.assets.start;
  }

  if (
    settings.checkpointCount > 0 &&
    (text.includes("checkpoint") || text.includes("egg") || text.includes("check point"))
  ) {
    return MBG.assets.checkpoint;
  }

  if (
    settings.enemyCount > 0 &&
    (
      text.includes("avoid") ||
      text.includes("obstacle") ||
      text.includes("hazard") ||
      text.includes("enemy") ||
      text.includes("mud") ||
      text.includes("puddle") ||
      text.includes("t-rex") ||
      text.includes("trex") ||
      text.includes("danger")
    )
  ) {
    return MBG.assets.enemy;
  }

  if (text.includes("finish") || text.includes("goal") || text.includes("cave")) {
    return MBG.assets.goal;
  }

  return null;
}


function drawMissionTrackerPage(ctx, settings) {
  /*
    SALES UPGRADE 2026-05:
    Mission Tracker is intentionally clean and functional.
    No DECO layer, no QR code, no heavy artwork.
    It is placed after HOW TO PLAY and before the maze pages.
  */
  clearPage(ctx);

  const totalStars = settings.missionTrackerUseAutoCount
    ? settings.mazeCount
    : settings.missionTrackerCount;

  const count = clamp(totalStars, 1, 200);
  const columns = Math.min(clamp(settings.missionTrackerColumns, 2, 15), count);
  const rows = Math.ceil(count / columns);

  ctx.save();
  ctx.textAlign = "center";

  ctx.fillStyle = "#111827";
  fitText(ctx, settings.missionTrackerTitle, MBG.PAGE_W / 2, 430, 96, 1900, "Arial", "bold");

  ctx.fillStyle = "#374151";
  ctx.font = "42px Arial";
  wrapText(ctx, settings.missionTrackerInstruction, MBG.PAGE_W / 2, 560, 1800, 56, "center");

  const gridSafe = 300;
  const gridW = MBG.PAGE_W - gridSafe * 2;
  const gridY = 800;
  const gridH = 1660;

  const gapX = clamp(gridW * 0.016, 28, 42);
  const gapY = clamp(gridH * 0.024, 34, 46);
  const rawCellW = (gridW - gapX * (columns - 1)) / columns;
  const rawCellH = (gridH - gapY * Math.max(0, rows - 1)) / rows;
  const cellW = Math.min(rawCellW, count <= 4 ? 260 : 190);
  const cellH = Math.min(rawCellH, count <= 4 ? 230 : 150);
  const totalGridH = rows * cellH + Math.max(0, rows - 1) * gapY;
  const startY = gridY + Math.max(0, (gridH - totalGridH) / 2);
  const starSize = Math.min(cellW, cellH) * 0.38;

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 3;

  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const rowStart = row * columns;
    const rowCount = Math.min(columns, count - rowStart);
    const rowW = rowCount * cellW + Math.max(0, rowCount - 1) * gapX;
    const rowX = (MBG.PAGE_W - rowW) / 2;

    const x = rowX + col * (cellW + gapX);
    const y = startY + row * (cellH + gapY);
    const cx = x + cellW / 2;
    const cy = y + cellH / 2;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, cellW, cellH, 18, true, true);

    drawStarOutline(ctx, cx, cy - (settings.missionTrackerShowNumbers ? 8 : 0), starSize, 5);

    if (settings.missionTrackerShowNumbers) {
      ctx.fillStyle = "#374151";
      ctx.font = "bold 24px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), cx, y + cellH - 26);
    }
  }

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.fillStyle = "#111827";
  ctx.font = "bold 42px Arial";
  wrapText(ctx, settings.missionTrackerFooter, MBG.PAGE_W / 2, 2740, 1800, 58, "center");

  ctx.fillStyle = "#6b7280";
  ctx.font = "30px Arial";
  ctx.fillText("Mission Tracker", MBG.PAGE_W / 2, MBG.PAGE_H - 180);

  ctx.restore();
}

function drawShapeTracerPage(ctx, settings, pageIndex) {
  clearPage(ctx);

  const safe = settings.safeMargin;
  const box = {
    x: safe + 110,
    y: safe + 430,
    w: MBG.PAGE_W - (safe + 110) * 2,
    h: MBG.PAGE_H - safe * 2 - 720
  };
  const source = resolveShapeTracerSource(settings);

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "#111827";
  ctx.font = "bold 76px Arial";
  ctx.fillText("Shape Tracer", MBG.PAGE_W / 2, safe + 145);
  ctx.fillStyle = "#4b5563";
  ctx.font = "38px Arial";
  ctx.fillText("Trace from start to finish.", MBG.PAGE_W / 2, safe + 220);

  if (source === "generated") {
    drawGeneratedShapeTracer(ctx, settings, box, pageIndex);
  } else {
    drawAssetShapeTracer(ctx, settings, box, pageIndex, source);
  }

  ctx.restore();
}

function renderColoringPage(ctx, settings, pageIndex) {
  clearPage(ctx);

  const assets = getColoringSourceAssets(settings);
  if (!assets.length) {
    drawMissingColoringAssetsPage(ctx, settings);
    return;
  }

  const count = getColoringAssetsPerPage(settings, pageIndex, assets.length);
  const selected = [];
  for (let i = 0; i < count; i++) {
    selected.push(assets[(pageIndex - 1 + i) % assets.length]);
  }

  const safe = settings.safeMargin;
  const box = {
    x: safe + 130,
    y: safe + 430,
    w: MBG.PAGE_W - (safe + 130) * 2,
    h: MBG.PAGE_H - safe * 2 - 720
  };
  const layout = resolveColoringLayout(settings, count, pageIndex);
  const cells = getColoringLayoutCells(box, count, layout);

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "#111827";
  fitText(ctx, settings.coloringPageTitle || "COLOR THE PICTURE!", MBG.PAGE_W / 2, safe + 150, 78, 1800, "Arial", "bold");

  selected.forEach((item, index) => {
    drawColoringAssetInCell(ctx, item.img, cells[index], settings.coloringAssetScale);
  });

  ctx.restore();
}

function getColoringSourceAssets(settings) {
  const source = String(settings.coloringAssetSource || "all").toLowerCase();
  const gameplay = [
    { type: "start", img: MBG.assets.start },
    { type: "goal", img: MBG.assets.goal },
    { type: "checkpoint", img: MBG.assets.checkpoint },
    { type: "enemy", img: MBG.assets.enemy }
  ].filter(item => item.img);
  const deco = (MBG.decoAssets || [])
    .filter(item => item && item.img)
    .map((item, index) => ({ type: "deco", img: item.img, name: item.name || ("DECO " + (index + 1)) }));

  if (source === "all" || source === "gameplay") return gameplay;
  if (source === "deco" || source === "deco-assets") return deco;
  if (source === "gameplay-deco" || source === "all-available") return gameplay.concat(deco);
  return gameplay.filter(item => item.type === source);
}

function getColoringAssetsPerPage(settings, pageIndex, availableCount) {
  const requested = String(settings.coloringAssetsPerPage || "1").toLowerCase();
  if (requested === "2") return Math.min(2, availableCount);
  if (requested === "auto") {
    return Math.min(availableCount, pageIndex % 2 === 0 ? 2 : 1);
  }
  return 1;
}

function resolveColoringLayout(settings, count, pageIndex) {
  const requested = String(settings.coloringPageLayout || "centered").toLowerCase();
  if (count <= 1) return "centered";
  if (requested === "random") {
    return pageIndex % 2 === 0 ? "left-right" : "top-bottom";
  }
  if (requested === "centered") return "top-bottom";
  return requested;
}

function getColoringLayoutCells(box, count, layout) {
  if (count <= 1) return [box];

  const gap = 110;
  if (layout === "left-right") {
    const cellW = (box.w - gap) / 2;
    return [
      { x: box.x, y: box.y, w: cellW, h: box.h },
      { x: box.x + cellW + gap, y: box.y, w: cellW, h: box.h }
    ];
  }

  const cellH = (box.h - gap) / 2;
  return [
    { x: box.x, y: box.y, w: box.w, h: cellH },
    { x: box.x, y: box.y + cellH + gap, w: box.w, h: cellH }
  ];
}

function drawColoringAssetInCell(ctx, img, cell, scale) {
  const sourceW = img.naturalWidth || img.width || 1;
  const sourceH = img.naturalHeight || img.height || 1;
  const fit = Math.min(cell.w / sourceW, cell.h / sourceH) * clamp(scale || 1, 0.4, 1.4);
  const w = sourceW * fit;
  const h = sourceH * fit;
  const x = cell.x + (cell.w - w) / 2;
  const y = cell.y + (cell.h - h) / 2;

  ctx.save();
  ctx.filter = "grayscale(1) contrast(3.2) brightness(0.92)";
  ctx.globalAlpha = 1;
  ctx.drawImage(img, x, y, w, h);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.34;
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "#111827";
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(6, Math.min(w, h) * 0.022);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawImageContain(ctx, img, x, y, w, h) {
  const sourceW = img.naturalWidth || img.width || 1;
  const sourceH = img.naturalHeight || img.height || 1;
  const fit = Math.min(w / sourceW, h / sourceH);
  const drawW = sourceW * fit;
  const drawH = sourceH * fit;
  ctx.drawImage(img, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

function drawMissingColoringAssetsPage(ctx, settings) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "#111827";
  ctx.font = "bold 64px Arial";
  ctx.fillText(settings.coloringPageTitle || "COLOR THE PICTURE!", MBG.PAGE_W / 2, 620);
  ctx.fillStyle = "#6b7280";
  ctx.font = "38px Arial";
  wrapText(ctx, getColoringMissingAssetMessage(settings), MBG.PAGE_W / 2, 820, 1500, 54, "center");
  ctx.restore();
}

function getColoringMissingAssetMessage(settings) {
  const source = String(settings.coloringAssetSource || "all").toLowerCase();
  if (source === "deco" || source === "deco-assets") {
    return "Brak załadowanych assetów DECO dla wybranego źródła kolorowanek.";
  }
  if (source === "gameplay-deco" || source === "all-available") {
    return "Brak załadowanych assetów gry lub DECO dla wybranego źródła kolorowanek.";
  }
  return "Brak załadowanych assetów gry dla wybranego źródła kolorowanek.";
}

function resolveShapeTracerSource(settings) {
  const source = String(settings.shapeTracerSource || "generated").toLowerCase();
  if (source !== "mixed") return source;

  const candidates = ["generated"];
  if (MBG.maskAssets && MBG.maskAssets.length) candidates.push("masks");
  if (getGameplayTraceAssets().length) candidates.push("gameplay-assets");
  if (MBG.decoAssets && MBG.decoAssets.length) candidates.push("deco-assets");
  if (getAssetLibraryTraceAssets("svg-library", settings).length) candidates.push("svg-library");
  return randomItem(candidates) || "generated";
}

function drawGeneratedShapeTracer(ctx, settings, box, pageIndex) {
  const count = getShapeTracerItemsPerPage(settings);
  const cells = getShapeTracerLayoutCells(box, count, settings.shapeTracerLayout);
  const types = getGeneratedTraceTypesForPage(settings, pageIndex, cells.length);

  cells.forEach((cell, index) => {
    const complexity = getShapeTracerCellComplexity(settings, pageIndex, cell, index);
    const seed = settings.generatedTraceRandomize ? pageIndex * 97 + index + 1 : index + 1;
    const rand = seededRandom(seed + 811);
    const scaleJitter = settings.generatedTraceRandomize ? 0.86 + rand() * 0.18 : 1;
    const fittedPoints = fitTracePointsToBox(
      generateTracePoints(types[index], settings.generatedTraceDifficulty, complexity, seed),
      cell,
      settings.generatedTraceScale * scaleJitter
    );
    const points = settings.generatedTraceRandomize
      ? varyFittedTracePoints(fittedPoints, cell, seed)
      : fittedPoints;

    drawTracePath(ctx, settings, points, false);
    drawTraceEndpoints(ctx, settings, points, getShapeTracerEndpointSize(cell));
  });
}

function getShapeTracerItemsPerPage(settings) {
  const requested = String(settings.shapeTracerItemsPerPage || "1").toLowerCase();
  if (requested !== "auto") {
    return clamp(parseInt(requested, 10) || 1, 1, 6);
  }

  const difficulty = String(settings.generatedTraceDifficulty || "easy").toLowerCase();
  if (difficulty === "hard") return Math.random() < 0.65 ? 1 : 2;
  if (difficulty === "medium") return 2;
  return Math.random() < 0.45 ? 1 : 2;
}

function getShapeTracerLayoutCells(box, count, layout) {
  const cellCount = clamp(count || 1, 1, 6);
  const mode = resolveShapeTracerLayoutMode(cellCount, layout);
  const gap = 86;
  let cols = 1;
  let rows = 1;

  if (mode === "2-rows") {
    cols = 1;
    rows = 2;
  } else if (mode === "2x2") {
    cols = 2;
    rows = 2;
  } else if (mode === "3x2") {
    cols = 3;
    rows = 2;
  }

  const cellW = (box.w - gap * (cols - 1)) / cols;
  const cellH = (box.h - gap * (rows - 1)) / rows;
  const cells = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (cells.length >= cellCount) break;
      cells.push({
        x: box.x + col * (cellW + gap),
        y: box.y + row * (cellH + gap),
        w: cellW,
        h: cellH,
        row,
        col
      });
    }
  }

  return cells;
}

function resolveShapeTracerLayoutMode(count, layout) {
  const requested = String(layout || "single").toLowerCase();

  if (count <= 1) return "single";
  if (requested === "2-rows" && count <= 2) return requested;
  if (requested === "2x2" && count <= 4) return requested;
  if (requested === "3x2" && count <= 6) return requested;
  if (count <= 2) return "2-rows";
  if (count <= 4) return "2x2";
  return "3x2";
}

function getGeneratedTraceTypesForPage(settings, pageIndex, count) {
  const allTypes = getGeneratedTraceTypeLibrary();
  const requested = String(settings.generatedTraceType || "mixed").toLowerCase();
  const shouldMix = settings.shapeTracerMixTypesPerPage || requested === "mixed" || requested === "random";
  const types = [];
  const previousPageType = settings.generatedTraceAvoidRepeat
    ? getPrimaryGeneratedTraceTypeForPage(settings, pageIndex - 1)
    : null;

  for (let i = 0; i < count; i++) {
    if (!shouldMix && allTypes.includes(requested)) {
      types.push(requested);
      continue;
    }

    if (settings.generatedTraceRandomize || settings.shapeTracerMixTypesPerPage) {
      const available = allTypes.filter(type => !types.includes(type) && !(i === 0 && type === previousPageType));
      types.push(randomItem(available.length ? available : allTypes));
    } else {
      let type = allTypes[(pageIndex + i - 1) % allTypes.length];
      if (i === 0 && type === previousPageType) {
        type = allTypes[(pageIndex + i) % allTypes.length];
      }
      types.push(type);
    }
  }

  return types;
}

function getGeneratedTraceTypeLibrary() {
  return [
    "straight-line",
    "wave",
    "arc-rainbow",
    "double-wave",
    "small-waves",
    "big-waves",
    "zigzag",
    "stairs",
    "hills",
    "spiral",
    "loop",
    "loops",
    "double-loop",
    "figure-eight",
    "s-curve",
    "u-shape",
    "circle-path",
    "oval-path",
    "heart-like",
    "cloud-like",
    "serpentine",
    "random-squiggle",
    "random-soft-squiggle",
    "random-angular-path",
    "random-wavy-path",
    "random-wobbly-path",
    "random-mountain-path",
    "random-soft-zigzag-path",
    "random-loop-path",
    "random-big-curve-path",
    "random-mixed-long-path",
    "random-short-simple-path",
    "maze-like"
  ];
}

function getPrimaryGeneratedTraceTypeForPage(settings, pageIndex) {
  if (pageIndex < 1) return null;

  const types = getGeneratedTraceTypesForPage(
    Object.assign({}, settings, { generatedTraceAvoidRepeat: false }),
    pageIndex,
    1
  );

  return types[0] || null;
}

function getShapeTracerCellComplexity(settings, pageIndex, cell, index) {
  let complexity = settings.generatedTraceComplexity;

  if (String(settings.shapeTracerProgressionMode || "same").toLowerCase() === "increasing") {
    complexity += Math.floor((Math.max(1, pageIndex) - 1) / 2);
    complexity += (cell.row || 0) + Math.floor(index / 2);
  }

  return clamp(complexity, 1, 20);
}

function getShapeTracerEndpointSize(cell) {
  return clamp(Math.min(cell.w, cell.h) * 0.13, 54, 120);
}

function drawAssetShapeTracer(ctx, settings, box, pageIndex, source) {
  const count = getShapeTracerItemsPerPage(settings);
  const cells = getShapeTracerLayoutCells(box, count, settings.shapeTracerLayout);
  const images = pickShapeTracerImages(settings, pageIndex, source, cells.length);
  if (!images.length) {
    drawGeneratedShapeTracer(ctx, settings, box, pageIndex);
    return;
  }

  let renderedCount = 0;
  images.forEach((img, index) => {
    const traceBox = scaleBoxFromCenter(cells[index], settings.generatedTraceScale);
    const contour = buildOriginalMaskContourSegments(img, { mazeBox: traceBox }, {
      threshold: settings.maskThreshold,
      paddingPercent: 0,
      polarity: "visible",
      invert: false,
      fitMode: "contain",
      offset: 0
    });

    if (!contour || !contour.segments.length) return;

    ctx.save();
    ctx.globalAlpha = clamp(settings.shapeTracerOpacity || 0.7, 0.1, 1);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = settings.shapeTracerLineThickness;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    applyShapeTracerDash(ctx, settings);
    drawSmoothMaskOutlinePath(ctx, contour.segments, 42, contour.center, 0);
    ctx.restore();
    renderedCount++;
  });

  if (!renderedCount) drawGeneratedShapeTracer(ctx, settings, box, pageIndex);
}

function pickShapeTracerImage(settings, pageIndex, source) {
  return pickShapeTracerImages(settings, pageIndex, source, 1)[0] || null;
}

function pickShapeTracerImages(settings, pageIndex, source, count) {
  const assets = getShapeTracerAssetPool(source, settings);
  if (!assets.length) return [];

  const itemCount = clamp(parseInt(count, 10) || 1, 1, 6);
  const pageOffset = (Math.max(1, pageIndex) - 1) * itemCount;
  const isSvgSource = isAssetLibraryShapeTracerSource(source);
  const mode = isSvgSource
    ? String(settings.shapeTracerAssetSelectionMode || "sequential").toLowerCase()
    : "sequential";
  const selected = [];

  for (let i = 0; i < itemCount; i++) {
    if (source === "masks") {
      // Preserve the existing single/random/ordered mask behavior.
      selected.push(pickMaskAsset(settings, pageOffset + i + 1));
    } else if (mode === "random") {
      selected.push(randomItem(assets));
    } else if (mode === "random-no-repeat" || mode === "random-without-repetition") {
      selected.push(pickShuffledCycleItem(assets, pageOffset + i));
    } else {
      selected.push(assets[(pageOffset + i) % assets.length]);
    }
  }

  return selected.filter(Boolean);
}

function getShapeTracerAssetPool(source, settings) {
  if (source === "masks") {
    return MBG.maskAssets && MBG.maskAssets.length
      ? MBG.maskAssets.map(asset => asset.img).filter(Boolean)
      : (MBG.assets.mask ? [MBG.assets.mask] : []);
  }

  if (isAssetLibraryShapeTracerSource(source)) {
    return getAssetLibraryTraceAssets(source, settings);
  }

  return source === "deco-assets"
    ? (MBG.decoAssets || []).map(asset => asset.img).filter(Boolean)
    : getGameplayTraceAssets();
}

function pickShuffledCycleItem(assets, globalIndex) {
  if (!assets.length) return null;
  const normalizedIndex = Math.max(0, globalIndex || 0);
  const cycle = Math.floor(normalizedIndex / assets.length);
  const indexInCycle = normalizedIndex % assets.length;
  const sessionSeed = MBG.assetLibrary.selectionSeed || 104729;
  const shuffled = shuffleArrayWithRandom(
    assets,
    seededRandom(sessionSeed + cycle * 8191 + assets.length * 131)
  );
  return shuffled[indexInCycle];
}

function shuffleArrayWithRandom(items, rand) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

function getGameplayTraceAssets() {
  return [
    MBG.assets.start,
    MBG.assets.goal,
    MBG.assets.checkpoint,
    MBG.assets.enemy
  ].filter(Boolean);
}

function isAssetLibraryShapeTracerSource(source) {
  return [
    "svg-library",
    "svg-shapes",
    "svg-symbols",
    "svg-selected"
  ].includes(String(source || "").toLowerCase());
}

function getAssetLibraryTraceAssets(source, settings) {
  const normalized = String(source || "").toLowerCase();
  const selected = new Set(
    settings && Array.isArray(settings.shapeTracerSelectedAssetIds)
      ? settings.shapeTracerSelectedAssetIds
      : getAssetLibrarySelectedIdsFromField()
  );
  const selectedItems = getAssetLibraryItems().filter(item => selected.has(item.id));

  // A non-empty browser selection always defines the active SVG pool.
  // Source-specific pools are fallbacks used only when nothing is selected.
  if (selectedItems.length) {
    return selectedItems.map(item => item.img).filter(Boolean);
  }

  if (normalized === "svg-shapes") {
    return getAssetLibraryItemsByCategory("shapes").map(item => item.img).filter(Boolean);
  }

  if (normalized === "svg-symbols") {
    return getAssetLibraryItemsByCategory("symbols").map(item => item.img).filter(Boolean);
  }

  // svg-selected remains a compatibility alias; without a selection its
  // safest fallback is the complete library, matching svg-library.
  return getAssetLibraryItems().map(item => item.img).filter(Boolean);
}

function getGeneratedTraceType(settings, pageIndex) {
  const requested = String(settings.generatedTraceType || "mixed").toLowerCase();
  const types = getGeneratedTraceTypeLibrary();

  if (requested === "mixed" || requested === "random") {
    if (settings.generatedTraceRandomize) return randomItem(types);
    return types[(Math.max(1, pageIndex) - 1) % types.length];
  }

  return types.includes(requested) ? requested : "wave";
}

function generateTracePoints(type, difficulty, complexity, seed) {
  const hardFactor = difficulty === "hard" ? 1.45 : difficulty === "medium" ? 1.18 : 0.9;
  const turns = Math.max(1, Math.round(complexity * hardFactor));

  if (type === "straight-line") return [{ x: -1, y: 0 }, { x: 1, y: 0 }];
  if (type === "wave") return makeWaveTrace(turns);
  if (type === "arc-rainbow") return makeArcRainbowTrace(turns);
  if (type === "double-wave") return makeDoubleWaveTrace(turns);
  if (type === "small-waves") return makeSmallWavesTrace(turns);
  if (type === "big-waves") return makeBigWavesTrace(turns);
  if (type === "zigzag") return makeZigzagTrace(turns);
  if (type === "stairs") return makeStairsTrace(turns);
  if (type === "hills") return makeHillsTrace(turns);
  if (type === "spiral") return makeSpiralTrace(turns);
  if (type === "loop") return makeLoopTrace(turns);
  if (type === "loops") return makeLoopsTrace(turns);
  if (type === "double-loop") return makeDoubleLoopTrace(turns);
  if (type === "figure-eight") return makeFigureEightTrace(turns);
  if (type === "s-curve") return makeSCurveTrace(turns);
  if (type === "u-shape") return makeUShapeTrace(turns);
  if (type === "circle-path") return makeCirclePathTrace(turns);
  if (type === "oval-path") return makeOvalPathTrace(turns);
  if (type === "heart-like") return makeHeartLikeTrace(turns);
  if (type === "cloud-like") return makeCloudLikeTrace(turns);
  if (type === "serpentine") return makeSerpentineTrace(turns);
  if (type === "random-squiggle") return makeRandomSquiggleTrace(turns, seed);
  if (type === "random-soft-squiggle") return makeRandomSoftSquiggleTrace(turns, seed);
  if (type === "random-angular-path") return makeRandomAngularTrace(turns, seed);
  if (type === "random-wavy-path") return makeRandomWavyTrace(turns, seed);
  if (type === "random-wobbly-path") return makeRandomWobblyTrace(turns, seed);
  if (type === "random-mountain-path") return makeRandomMountainTrace(turns, seed);
  if (type === "random-soft-zigzag-path") return makeRandomSoftZigzagTrace(turns, seed);
  if (type === "random-loop-path") return makeRandomLoopLikeTrace(turns, seed);
  if (type === "random-big-curve-path") return makeRandomBigCurveTrace(turns, seed);
  if (type === "random-mixed-long-path") return makeRandomMixedLongTrace(turns, seed);
  if (type === "random-short-simple-path") return makeRandomShortSimpleTrace(turns, seed);
  if (type === "maze-like") return makeMazeLikeTrace(turns);
  return makeWaveTrace(turns);
}

function makeWaveTrace(turns) {
  const points = [];
  const count = Math.max(40, turns * 18);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push({ x: -1 + t * 2, y: Math.sin(t * Math.PI * Math.max(1, turns)) * 0.45 });
  }
  return points;
}

function makeArcRainbowTrace(turns) {
  const points = [];
  const count = Math.max(36, turns * 10);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const angle = Math.PI * (1 - t);
    points.push({
      x: Math.cos(angle) * 0.95,
      y: -Math.sin(angle) * 0.74 + 0.42
    });
  }
  return points;
}

function makeDoubleWaveTrace(turns) {
  const points = [];
  const count = Math.max(70, turns * 20);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push({
      x: -1 + t * 2,
      y: Math.sin(t * Math.PI * Math.max(2, turns)) * 0.34 +
        Math.sin(t * Math.PI * Math.max(4, turns * 2)) * 0.15
    });
  }
  return points;
}

function makeSmallWavesTrace(turns) {
  const points = [];
  const count = Math.max(80, turns * 22);
  const waves = Math.max(5, turns + 3);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push({ x: -1 + t * 2, y: Math.sin(t * Math.PI * waves) * 0.24 });
  }
  return points;
}

function makeBigWavesTrace(turns) {
  const points = [];
  const count = Math.max(50, turns * 16);
  const waves = Math.max(2, Math.round(turns / 2));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push({ x: -1 + t * 2, y: Math.sin(t * Math.PI * waves) * 0.68 });
  }
  return points;
}

function makeZigzagTrace(turns) {
  const points = [];
  const count = Math.max(3, turns + 2);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push({ x: -1 + t * 2, y: i % 2 === 0 ? -0.55 : 0.55 });
  }
  return points;
}

function makeStairsTrace(turns) {
  const points = [];
  const steps = Math.max(3, Math.min(12, turns + 2));
  let x = -0.92;
  let y = 0.78;
  points.push({ x, y });

  for (let i = 0; i < steps; i++) {
    x = -0.92 + ((i + 1) / steps) * 1.84;
    points.push({ x, y });
    y = 0.78 - ((i + 1) / steps) * 1.56;
    points.push({ x, y });
  }

  return points;
}

function makeHillsTrace(turns) {
  const points = [];
  const hills = Math.max(2, Math.min(8, Math.round(turns / 2) + 1));
  const count = hills * 24;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push({
      x: -1 + t * 2,
      y: -Math.abs(Math.sin(t * Math.PI * hills)) * 0.62 + 0.42
    });
  }
  return points;
}

function makeSpiralTrace(turns) {
  const points = [];
  const count = Math.max(90, turns * 28);
  const rotations = Math.max(1.2, turns * 0.35);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const angle = t * Math.PI * 2 * rotations;
    const r = 0.12 + t * 0.82;
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return points;
}

function makeLoopTrace(turns) {
  const points = [];
  const count = Math.max(90, turns * 24);
  const loops = Math.max(1, Math.round(turns / 4));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const angle = t * Math.PI * 2 * loops;
    points.push({ x: -0.9 + t * 1.8, y: Math.sin(angle) * 0.48 });
  }
  return points;
}

function makeLoopsTrace(turns) {
  const points = [];
  const loops = Math.max(2, Math.min(6, Math.round(turns / 3) + 1));
  const count = loops * 54;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const angle = t * Math.PI * 2 * loops;
    points.push({
      x: -0.9 + t * 1.8,
      y: Math.sin(angle) * 0.42
    });
  }
  return points;
}

function makeDoubleLoopTrace(turns) {
  const points = [];
  const count = Math.max(120, turns * 26);
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * Math.PI * 4;
    points.push({
      x: Math.sin(t) * 0.78,
      y: Math.sin(t * 2) * 0.36
    });
  }
  return points;
}

function makeFigureEightTrace(turns) {
  const points = [];
  const count = Math.max(120, turns * 24);
  const cycles = Math.max(1, Math.round(turns / 5));
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * Math.PI * 2 * cycles;
    points.push({ x: Math.sin(t) * 0.82, y: Math.sin(t * 2) * 0.48 });
  }
  return points;
}

function makeSCurveTrace(turns) {
  const points = [];
  const count = Math.max(80, turns * 18);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push({
      x: Math.sin((t - 0.5) * Math.PI) * 0.76,
      y: -0.9 + t * 1.8
    });
  }
  return points;
}

function makeUShapeTrace(turns) {
  const points = [];
  const count = Math.max(70, turns * 14);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const angle = Math.PI * (1 + t);
    points.push({
      x: Math.cos(angle) * 0.82,
      y: Math.sin(angle) * 0.78 - 0.05
    });
  }
  return points;
}

function makeCirclePathTrace(turns) {
  const points = [];
  const count = Math.max(100, turns * 18);
  for (let i = 0; i <= count; i++) {
    const angle = (i / count) * Math.PI * 2;
    points.push({ x: Math.cos(angle) * 0.78, y: Math.sin(angle) * 0.78 });
  }
  return points;
}

function makeOvalPathTrace(turns) {
  const points = [];
  const count = Math.max(100, turns * 18);
  for (let i = 0; i <= count; i++) {
    const angle = (i / count) * Math.PI * 2;
    points.push({ x: Math.cos(angle) * 0.96, y: Math.sin(angle) * 0.58 });
  }
  return points;
}

function makeHeartLikeTrace(turns) {
  const points = [];
  const count = Math.max(120, turns * 24);
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    points.push({ x: x / 18, y: y / 18 });
  }
  return points;
}

function makeCloudLikeTrace(turns) {
  const points = [];
  const lobes = Math.max(5, Math.min(10, turns + 3));
  const count = Math.max(120, lobes * 24);
  for (let i = 0; i <= count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const r = 0.72 + Math.sin(angle * lobes) * 0.12 + Math.sin(angle * 3) * 0.06;
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.72 });
  }
  return points;
}

function makeSerpentineTrace(turns) {
  const points = [];
  const lanes = Math.max(3, Math.min(10, Math.round(turns / 2) + 2));
  for (let row = 0; row < lanes; row++) {
    const y = -0.85 + (row / (lanes - 1)) * 1.7;
    const from = row % 2 === 0 ? -0.9 : 0.9;
    const to = -from;
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      points.push({ x: from + (to - from) * t, y });
    }
  }
  return points;
}

function makeRandomSquiggleTrace(turns, seed) {
  const points = [];
  const rand = seededRandom(seed || 1);
  const count = Math.max(24, turns * 8);
  let y = 0;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    y = clamp(y + (rand() - 0.5) * 0.28, -0.75, 0.75);
    points.push({ x: -1 + t * 2, y });
  }
  return smoothTracePoints(points, 2);
}

function makeRandomSoftSquiggleTrace(turns, seed) {
  const points = [];
  const rand = seededRandom((seed || 1) + 73);
  const count = Math.max(36, turns * 10);
  let y = 0;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    y = clamp(y + (rand() - 0.5) * 0.18, -0.62, 0.62);
    points.push({ x: -1 + t * 2, y });
  }
  return smoothTracePoints(points, 3);
}

function makeRandomAngularTrace(turns, seed) {
  const points = [];
  const rand = seededRandom((seed || 1) + 149);
  const count = Math.max(5, Math.min(18, turns + 4));
  let y = 0;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    y = clamp(y + (rand() - 0.5) * 0.75, -0.82, 0.82);
    points.push({ x: -0.96 + t * 1.92, y });
  }
  return points;
}

function makeRandomWavyTrace(turns, seed) {
  const points = [];
  const rand = seededRandom((seed || 1) + 211);
  const waves = Math.max(2, Math.min(7, Math.round(turns * (0.38 + rand() * 0.28))));
  const amplitude = 0.28 + rand() * 0.34;
  const phase = rand() * Math.PI * 2;
  const count = Math.max(56, waves * 22);

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const soft = Math.sin(t * Math.PI);
    points.push({
      x: -0.96 + t * 1.92,
      y: Math.sin(t * Math.PI * waves + phase) * amplitude * soft
    });
  }

  return smoothTracePoints(points, 1);
}

function makeRandomWobblyTrace(turns, seed) {
  const points = [];
  const rand = seededRandom((seed || 1) + 263);
  const count = Math.max(38, Math.min(92, turns * 9));
  const amplitude = 0.28 + rand() * 0.26;
  let y = (rand() - 0.5) * 0.35;

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const drift = Math.sin(t * Math.PI * (1.4 + rand() * 1.2)) * amplitude * 0.38;
    y = clamp(y + (rand() - 0.5) * 0.16, -0.62, 0.62);
    points.push({
      x: -0.96 + t * 1.92,
      y: clamp(y + drift, -0.78, 0.78)
    });
  }

  return smoothTracePoints(points, 3);
}

function makeRandomMountainTrace(turns, seed) {
  const points = [];
  const rand = seededRandom((seed || 1) + 307);
  const peaks = Math.max(2, Math.min(7, Math.round(turns / 2) + (rand() < 0.5 ? 1 : 0)));
  const count = peaks * 24;
  const amplitude = 0.34 + rand() * 0.28;
  const base = 0.28 + rand() * 0.18;

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const mountain = -Math.abs(Math.sin(t * Math.PI * peaks)) * amplitude + base;
    const softWave = Math.sin(t * Math.PI * (peaks + 1)) * 0.06;
    points.push({
      x: -0.96 + t * 1.92,
      y: clamp(mountain + softWave, -0.78, 0.78)
    });
  }

  return smoothTracePoints(points, 1);
}

function makeRandomSoftZigzagTrace(turns, seed) {
  const points = [];
  const rand = seededRandom((seed || 1) + 349);
  const zigs = Math.max(3, Math.min(10, Math.round(turns * 0.65) + 2));
  const amplitude = 0.32 + rand() * 0.24;

  for (let i = 0; i <= zigs; i++) {
    const t = i / zigs;
    const direction = i % 2 === 0 ? -1 : 1;
    points.push({
      x: -0.94 + t * 1.88,
      y: direction * amplitude + (rand() - 0.5) * 0.12
    });
  }

  return smoothTracePoints(points, 4);
}

function makeRandomLoopLikeTrace(turns, seed) {
  const points = [];
  const rand = seededRandom((seed || 1) + 401);
  const loops = Math.max(1, Math.min(4, Math.round(turns / 4) + (rand() < 0.55 ? 1 : 0)));
  const count = loops * 70;
  const loopHeight = 0.24 + rand() * 0.24;
  const waveHeight = 0.18 + rand() * 0.18;

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const angle = t * Math.PI * 2 * loops;
    points.push({
      x: -0.9 + t * 1.8,
      y: Math.sin(angle) * loopHeight + Math.sin(angle * 0.5) * waveHeight
    });
  }

  return points;
}

function makeRandomBigCurveTrace(turns, seed) {
  const points = [];
  const rand = seededRandom((seed || 1) + 443);
  const count = Math.max(44, turns * 10);
  const direction = rand() < 0.5 ? -1 : 1;
  const bow = 0.46 + rand() * 0.28;
  const wave = 0.08 + rand() * 0.1;

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const curve = Math.sin(t * Math.PI) * bow * direction;
    points.push({
      x: -0.96 + t * 1.92,
      y: curve + Math.sin(t * Math.PI * 3) * wave
    });
  }

  return smoothTracePoints(points, 2);
}

function makeRandomMixedLongTrace(turns, seed) {
  const baseSeed = seed || 1;
  const rand = seededRandom(baseSeed + 487);
  const style = Math.floor(rand() * 5);
  const boostedTurns = Math.max(turns + 2, Math.round(turns * (1.15 + rand() * 0.35)));

  if (style === 0) return makeRandomWavyTrace(boostedTurns, baseSeed + 11);
  if (style === 1) return makeRandomWobblyTrace(boostedTurns, baseSeed + 17);
  if (style === 2) return makeRandomMountainTrace(boostedTurns, baseSeed + 23);
  if (style === 3) return makeRandomLoopLikeTrace(boostedTurns, baseSeed + 29);
  return makeRandomBigCurveTrace(boostedTurns, baseSeed + 31);
}

function makeRandomShortSimpleTrace(turns, seed) {
  const baseSeed = seed || 1;
  const rand = seededRandom(baseSeed + 523);
  const style = Math.floor(rand() * 4);
  const simpleTurns = Math.max(2, Math.min(5, Math.round(turns * 0.45) + 1));

  if (style === 0) return makeRandomBigCurveTrace(simpleTurns, baseSeed + 3);
  if (style === 1) return makeRandomSoftZigzagTrace(simpleTurns, baseSeed + 5);
  if (style === 2) return makeRandomWavyTrace(simpleTurns, baseSeed + 7);
  return makeArcRainbowTrace(simpleTurns);
}

function makeMazeLikeTrace(turns) {
  const points = [];
  const rows = Math.max(3, Math.min(8, Math.round(turns / 3) + 3));
  let y = -0.75;
  points.push({ x: -0.9, y });
  for (let row = 0; row < rows; row++) {
    const x = row % 2 === 0 ? 0.9 : -0.9;
    points.push({ x, y });
    if (row < rows - 1) {
      y = -0.75 + ((row + 1) / (rows - 1)) * 1.5;
      points.push({ x, y });
    }
  }
  return points;
}

function varyFittedTracePoints(points, cell, seed) {
  const rand = seededRandom((seed || 1) + 601);
  let varied = points.slice();

  if (rand() < 0.5) {
    const bounds = getPointBounds(varied);
    const cx = (bounds.minX + bounds.maxX) / 2;
    varied = varied.map(point => ({ x: cx - (point.x - cx), y: point.y })).reverse();
  }

  const bounds = getPointBounds(varied);
  const spareY = Math.max(0, Math.min(bounds.minY - cell.y, cell.y + cell.h - bounds.maxY));
  const spareX = Math.max(0, Math.min(bounds.minX - cell.x, cell.x + cell.w - bounds.maxX));
  const offsetY = (rand() - 0.5) * spareY * 0.9;
  const offsetX = (rand() - 0.5) * spareX * 0.35;

  return varied.map(point => ({
    x: point.x + offsetX,
    y: point.y + offsetY
  }));
}

function fitTracePointsToBox(points, box, scale) {
  const scaledBox = scaleBoxFromCenter(box, scale);
  const bounds = getPointBounds(points);
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const height = Math.max(0.001, bounds.maxY - bounds.minY);
  const fit = Math.min(scaledBox.w / width, scaledBox.h / height);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const targetCx = scaledBox.x + scaledBox.w / 2;
  const targetCy = scaledBox.y + scaledBox.h / 2;
  return points.map(point => ({ x: targetCx + (point.x - cx) * fit, y: targetCy + (point.y - cy) * fit }));
}

function scaleBoxFromCenter(box, scale) {
  const s = clamp(scale || 1, 0.1, 1.4);
  const w = box.w * s;
  const h = box.h * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function getPointBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function drawTracePath(ctx, settings, points, closePath) {
  if (!points || points.length < 2) return;

  ctx.save();
  ctx.globalAlpha = clamp(settings.shapeTracerOpacity || 0.7, 0.1, 1);
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = settings.shapeTracerLineThickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  applyShapeTracerDash(ctx, settings);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (closePath) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function applyShapeTracerDash(ctx, settings) {
  const style = String(settings.shapeTracerLineStyle || "dashed").toLowerCase();
  if (style === "solid") {
    ctx.setLineDash([]);
    return;
  }
  if (style === "dotted") {
    const dot = Math.max(2, ctx.lineWidth * 0.65);
    ctx.setLineDash([dot, dot * 2.4]);
    return;
  }
  const dash = Math.max(18, ctx.lineWidth * 3.5);
  ctx.setLineDash([dash, dash * 0.72]);
}

function drawTraceEndpoints(ctx, settings, points, size) {
  if (!points || points.length < 2) return;
  const start = points[0];
  const goal = points[points.length - 1];
  const endpointSize = size || 120;

  if (settings.shapeTracerUseGameplayIcons && MBG.assets.start) {
    drawImageCentered(ctx, MBG.assets.start, start.x, start.y, endpointSize);
  } else {
    drawTraceEndpointCircle(ctx, start.x, start.y, "START", endpointSize);
  }

  if (settings.shapeTracerUseGameplayIcons && MBG.assets.goal) {
    drawImageCentered(ctx, MBG.assets.goal, goal.x, goal.y, endpointSize);
  } else {
    drawTraceEndpointCircle(ctx, goal.x, goal.y, "GOAL", endpointSize);
  }
}

function drawTraceEndpointCircle(ctx, x, y, label, size) {
  const radius = clamp((size || 120) * 0.36, 24, 44);

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = Math.max(3, radius * 0.11);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#111827";
  ctx.textAlign = "center";
  ctx.font = "bold " + Math.max(12, Math.round(radius * 0.43)) + "px Arial";
  ctx.fillText(label, x, y + radius * 0.16);
  ctx.restore();
}

function smoothTracePoints(points, iterations) {
  let current = points;
  for (let i = 0; i < iterations; i++) {
    const next = [current[0]];
    for (let j = 0; j < current.length - 1; j++) {
      const a = current[j];
      const b = current[j + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

function seededRandom(seed) {
  let value = Math.max(1, Math.floor(seed * 9973)) % 2147483647;
  return function () {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function drawStarOutline(ctx, cx, cy, outerRadius, points) {
  const spikes = points || 5;
  const innerRadius = outerRadius * 0.46;
  let rotation = -Math.PI / 2;
  const step = Math.PI / spikes;

  ctx.save();
  ctx.beginPath();

  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + Math.cos(rotation) * radius;
    const y = cy + Math.sin(rotation) * radius;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    rotation += step;
  }

  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = Math.max(5, outerRadius * 0.075);
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCongratsPage(ctx, settings) {
  clearPage(ctx);

  drawDecoLayer(ctx, settings, "congrats", {
    mazeBox: null,
    headerBox: { x: 180, y: 180, w: MBG.PAGE_W - 360, h: 600 },
    footerBox: { x: 180, y: 2650, w: MBG.PAGE_W - 360, h: 420 }
  });

  ctx.save();
  ctx.textAlign = "center";

  ctx.fillStyle = "#111827";
  fitText(ctx, settings.congratsTitle, MBG.PAGE_W / 2, 620, 118, 1900, "Arial", "bold");

  ctx.fillStyle = "#374151";
  ctx.font = "46px Arial";
  wrapText(ctx, settings.congratsText, MBG.PAGE_W / 2, 980, 1800, 66, "center");

  ctx.fillStyle = "#111827";
  ctx.font = "bold 42px Arial";
  wrapText(ctx, settings.moreBooksText, MBG.PAGE_W / 2, 2450, 1800, 58, "center");

  ctx.fillStyle = "#6b7280";
  ctx.font = "36px Arial";
  ctx.fillText("Space • Dino • Jungle • Farm • Puppy • Knight", MBG.PAGE_W / 2, 2620);

  ctx.restore();
}



function drawQrPage(ctx, settings) {
  /*
    SALES UPGRADE 2026-05:
    QR / More Books page.
    This page is intentionally clean and does not use the DECO layer.
    It is placed before Certificate Page so the certificate can stay as the final cut-out gift page.
  */
  clearPage(ctx);

  ctx.save();
  ctx.textAlign = "center";

  const safe = 220;
  const pageCenter = MBG.PAGE_W / 2;

  ctx.fillStyle = "#111827";
  fitText(ctx, settings.qrPageTitle, pageCenter, 430, 92, 1900, "Arial", "bold");

  ctx.fillStyle = "#374151";
  ctx.font = "40px Arial";
  wrapText(ctx, settings.qrPageIntroText, pageCenter, 560, 1780, 56, "center");

  const qrItems = (MBG.qrAssets || []).slice(0, 4);

  if (!qrItems.length) {
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 6;
    roundRect(ctx, 660, 1180, 1230, 520, 34, false, true);

    ctx.fillStyle = "#111827";
    ctx.font = "bold 48px Arial";
    ctx.fillText("QR ASSET MISSING", pageCenter, 1390);

    ctx.fillStyle = "#374151";
    ctx.font = "34px Arial";
    wrapText(ctx, "Load a QR PNG asset in the QR Page section before exporting the final book.", pageCenter, 1490, 1050, 48, "center");

    ctx.restore();
    return;
  }

  const labels = [
    settings.qrLabel1,
    settings.qrLabel2,
    settings.qrLabel3,
    settings.qrLabel4
  ];

  const count = qrItems.length;
  let boxes = [];

  if (count === 1) {
    boxes = [
      { x: 0, y: 980, w: MBG.PAGE_W, qr: 660 * settings.qrScale }
    ];
  } else if (count === 2) {
    boxes = [
      { x: 0, y: 870, w: MBG.PAGE_W, qr: 470 * settings.qrScale },
      { x: 0, y: 1710, w: MBG.PAGE_W, qr: 470 * settings.qrScale }
    ];
  } else if (count === 3) {
    boxes = [
      { x: 0, y: 790, w: MBG.PAGE_W, qr: 385 * settings.qrScale },
      { x: 0, y: 1450, w: MBG.PAGE_W, qr: 385 * settings.qrScale },
      { x: 0, y: 2110, w: MBG.PAGE_W, qr: 385 * settings.qrScale }
    ];
  } else {
    boxes = [
      { x: safe, y: 920, w: (MBG.PAGE_W - safe * 2) / 2, qr: 360 * settings.qrScale },
      { x: MBG.PAGE_W / 2, y: 920, w: (MBG.PAGE_W - safe * 2) / 2, qr: 360 * settings.qrScale },
      { x: safe, y: 1840, w: (MBG.PAGE_W - safe * 2) / 2, qr: 360 * settings.qrScale },
      { x: MBG.PAGE_W / 2, y: 1840, w: (MBG.PAGE_W - safe * 2) / 2, qr: 360 * settings.qrScale }
    ];
  }

  for (let i = 0; i < qrItems.length; i++) {
    const item = qrItems[i];
    const box = boxes[i];
    if (!item || !item.img || !box) continue;

    const centerX = box.x + box.w / 2;
    const qrSize = clamp(box.qr, 260, 720);
    const qrY = box.y;

    // Quiet white card around QR for scan safety.
    const cardPad = Math.max(45, qrSize * 0.12);
    const cardW = qrSize + cardPad * 2;
    const cardH = qrSize + cardPad * 2 + 120;
    const cardX = centerX - cardW / 2;
    const cardY = qrY - cardPad;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 4;
    roundRect(ctx, cardX, cardY, cardW, cardH, 28, true, true);

    drawImageCentered(ctx, item.img, centerX, qrY + qrSize / 2, qrSize);

    ctx.fillStyle = "#111827";
    ctx.font = count === 4 ? "bold 30px Arial" : "bold 36px Arial";
    wrapText(ctx, labels[i] || "Scan for more books", centerX, qrY + qrSize + 88, cardW - 80, count === 4 ? 38 : 44, "center");
  }

  ctx.fillStyle = "#374151";
  ctx.font = "34px Arial";
  wrapText(ctx, settings.qrFooterText, pageCenter, 2990, 1780, 48, "center");

  ctx.restore();
}

function drawCertificatePage(ctx, settings) {
  /*
    SALES UPGRADE 2026-05:
    Certificate page is intentionally placed at the end of the book.
    No DECO layer, no maze logic impact.
    Optional blank page after certificate protects the cut-out/gift use case.
  */
  clearPage(ctx);

  ctx.save();

  const margin = 210;
  const innerX = margin;
  const innerY = margin;
  const innerW = MBG.PAGE_W - margin * 2;
  const innerH = MBG.PAGE_H - margin * 2;

  // Outer elegant frame
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 10;
  roundRect(ctx, innerX, innerY, innerW, innerH, 34, false, true);

  ctx.strokeStyle = "#6b7280";
  ctx.lineWidth = 3;
  roundRect(ctx, innerX + 34, innerY + 34, innerW - 68, innerH - 68, 24, false, true);

  // Corner accents
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 6;
  const c = 140;
  drawCertificateCorner(ctx, innerX + 72, innerY + 72, c, "tl");
  drawCertificateCorner(ctx, innerX + innerW - 72, innerY + 72, c, "tr");
  drawCertificateCorner(ctx, innerX + 72, innerY + innerH - 72, c, "bl");
  drawCertificateCorner(ctx, innerX + innerW - 72, innerY + innerH - 72, c, "br");

  ctx.textAlign = "center";
  ctx.fillStyle = "#111827";

  fitText(ctx, settings.certificateTitle, MBG.PAGE_W / 2, 600, 104, 1850, "Arial", "bold");

  ctx.font = "42px Arial";
  ctx.fillStyle = "#374151";
  wrapText(ctx, settings.certificateSubtitle, MBG.PAGE_W / 2, 720, 1750, 56, "center");

  // Small achievement badge
  ctx.beginPath();
  ctx.arc(MBG.PAGE_W / 2, 920, 82, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.fillStyle = "#111827";
  ctx.font = "bold 70px Arial";
  ctx.fillText("★", MBG.PAGE_W / 2, 945);

  ctx.fillStyle = "#374151";
  ctx.font = "38px Arial";
  wrapText(ctx, settings.certificateAwardedToLabel, MBG.PAGE_W / 2, 1130, 1750, 54, "center");

  // Child name line
  const nameY = 1360;
  const lineW = 1450;
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo((MBG.PAGE_W - lineW) / 2, nameY);
  ctx.lineTo((MBG.PAGE_W + lineW) / 2, nameY);
  ctx.stroke();

  if (settings.certificateChildName) {
    ctx.fillStyle = "#111827";
    ctx.font = "bold 58px Arial";
    wrapText(ctx, settings.certificateChildName, MBG.PAGE_W / 2, nameY - 38, lineW - 80, 64, "center");
  }

  // Label under the blank child-name line. Do not auto-fill the child name in printable books.
  ctx.fillStyle = "#6b7280";
  ctx.font = "30px Arial";
  ctx.fillText(settings.certificateNameLabel || "Name", MBG.PAGE_W / 2, nameY + 55);

  ctx.fillStyle = "#374151";
  ctx.font = "40px Arial";
  wrapText(ctx, settings.certificateText, MBG.PAGE_W / 2, 1540, 1700, 60, "center");

  // Signature area
  const sigY = 2520;
  const sigLineW = 610;
  const leftX = 700;
  const rightX = MBG.PAGE_W - 700;

  // Date line
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(leftX - sigLineW / 2, sigY);
  ctx.lineTo(leftX + sigLineW / 2, sigY);
  ctx.stroke();

  ctx.fillStyle = "#374151";
  ctx.font = "30px Arial";
  ctx.fillText(settings.certificateDateLabel, leftX, sigY + 52);

  // Parent / teacher signature line
  ctx.beginPath();
  ctx.moveTo(rightX - sigLineW / 2, sigY);
  ctx.lineTo(rightX + sigLineW / 2, sigY);
  ctx.stroke();

  ctx.fillStyle = "#374151";
  ctx.font = "30px Arial";
  ctx.fillText(settings.certificateParentSignatureLabel, rightX, sigY + 52);

  // Creator mark
  const creatorY = 2790;
  if (settings.certificateUseCreatorMark && MBG.assets.creatorMark) {
    const markSize = 300 * settings.certificateCreatorMarkScale;
    drawImageCentered(ctx, MBG.assets.creatorMark, MBG.PAGE_W / 2, creatorY - 40, markSize);
  } else {
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(MBG.PAGE_W / 2 - 290, creatorY - 40);
    ctx.lineTo(MBG.PAGE_W / 2 + 290, creatorY - 40);
    ctx.stroke();
  }

  ctx.fillStyle = "#374151";
  ctx.font = "30px Arial";
  ctx.fillText(settings.certificateCreatorSignatureLabel, MBG.PAGE_W / 2, creatorY + 145);

  if (settings.certificateFooterText) {
    // Keep the final encouragement safely inside the certificate frame.
    // Earlier it was too close to the bottom border and could touch the frame.
    ctx.fillStyle = "#111827";
    ctx.font = "bold 34px Arial";
    wrapText(ctx, settings.certificateFooterText, MBG.PAGE_W / 2, 2240, 1500, 44, "center");
  }

  ctx.restore();
}

function drawCertificateCorner(ctx, x, y, size, corner) {
  ctx.beginPath();

  if (corner === "tl") {
    ctx.moveTo(x, y + size);
    ctx.lineTo(x, y);
    ctx.lineTo(x + size, y);
  } else if (corner === "tr") {
    ctx.moveTo(x - size, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + size);
  } else if (corner === "bl") {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y);
    ctx.lineTo(x + size, y);
  } else if (corner === "br") {
    ctx.moveTo(x - size, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y - size);
  }

  ctx.stroke();
}


/* ============================================================
   MAZE DATA
============================================================ */

function createMazeData(settings, index) {
  const maskGrid = createMaskGrid(settings, index);
  const activeGrid = normalizeActiveGrid(maskGrid, settings.mazeWidth, settings.mazeHeight);

  const cells = createCells(settings.mazeWidth, settings.mazeHeight, activeGrid);
  const activeCells = getActiveCells(cells);

  if (activeCells.length < 2) {
    return createFallbackRectMaze(settings, index);
  }

  const start = findStartCell(activeCells);
  const goal = findGoalCell(activeCells, start, settings);

  generateMazeOnActiveCells(cells, start);

  openExtraWalls(cells, settings.extraOpeningsPercent);

  const solutionPath = solveMaze(cells, start, goal);

  const checkpoints = pickCheckpoints(solutionPath, settings.checkpointCount);
  const enemies = pickEnemies(cells, solutionPath, start, goal, checkpoints, settings.enemyCount);

  return {
    index,
    width: settings.mazeWidth,
    height: settings.mazeHeight,
    cells,
    activeGrid,
    start,
    goal,
    checkpoints,
    enemies,
    enemy: enemies[0] || null,
    solutionPath
  };
}

function createFallbackRectMaze(settings, index) {
  const activeGrid = createFullActiveGrid(settings.mazeWidth, settings.mazeHeight);
  const cells = createCells(settings.mazeWidth, settings.mazeHeight, activeGrid);

  const activeCells = getActiveCells(cells);
  const start = findStartCell(activeCells);
  const goal = findGoalCell(activeCells, start, settings);

  generateMazeOnActiveCells(cells, start);

  openExtraWalls(cells, settings.extraOpeningsPercent);

  const solutionPath = solveMaze(cells, start, goal);
  const checkpoints = pickCheckpoints(solutionPath, settings.checkpointCount);
  const enemies = pickEnemies(cells, solutionPath, start, goal, checkpoints, settings.enemyCount);

  return {
    index,
    width: settings.mazeWidth,
    height: settings.mazeHeight,
    cells,
    activeGrid,
    start,
    goal,
    checkpoints,
    enemies,
    enemy: enemies[0] || null,
    solutionPath
  };
}

function createCells(width, height, activeGrid) {
  const cells = [];

  for (let y = 0; y < height; y++) {
    const row = [];

    for (let x = 0; x < width; x++) {
      row.push({
        x,
        y,
        active: !!activeGrid[y][x],
        visited: false,
        walls: {
          top: true,
          right: true,
          bottom: true,
          left: true
        }
      });
    }

    cells.push(row);
  }

  return cells;
}

function getActiveCells(cells) {
  const list = [];

  for (const row of cells) {
    for (const cell of row) {
      if (cell.active) list.push(cell);
    }
  }

  return list;
}

function generateMazeOnActiveCells(cells, start) {
  for (const row of cells) {
    for (const cell of row) {
      cell.visited = false;
      cell.walls.top = true;
      cell.walls.right = true;
      cell.walls.bottom = true;
      cell.walls.left = true;
    }
  }

  const stack = [];
  let current = start;
  current.visited = true;

  while (true) {
    const neighbors = getUnvisitedActiveNeighbors(cells, current);

    if (neighbors.length > 0) {
      const next = randomItem(neighbors);
      removeWallBetween(current, next);
      stack.push(current);
      current = next;
      current.visited = true;
    } else if (stack.length > 0) {
      current = stack.pop();
    } else {
      break;
    }
  }
}

function getUnvisitedActiveNeighbors(cells, cell) {
  const result = [];
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }
  ];

  for (const d of dirs) {
    const nx = cell.x + d.dx;
    const ny = cell.y + d.dy;

    if (cells[ny] && cells[ny][nx]) {
      const n = cells[ny][nx];
      if (n.active && !n.visited) result.push(n);
    }
  }

  return result;
}

function removeWallBetween(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 1) {
    a.walls.right = false;
    b.walls.left = false;
  } else if (dx === -1) {
    a.walls.left = false;
    b.walls.right = false;
  } else if (dy === 1) {
    a.walls.bottom = false;
    b.walls.top = false;
  } else if (dy === -1) {
    a.walls.top = false;
    b.walls.bottom = false;
  }
}

function openExtraWalls(cells, percent) {
  const p = clamp(percent, 0, 80) / 100;
  if (p <= 0) return;

  const candidates = [];

  for (let y = 0; y < cells.length; y++) {
    for (let x = 0; x < cells[y].length; x++) {
      const cell = cells[y][x];
      if (!cell.active) continue;

      const right = cells[y][x + 1];
      if (right && right.active && cell.walls.right && right.walls.left) {
        candidates.push({ a: cell, b: right });
      }

      const bottom = cells[y + 1] && cells[y + 1][x];
      if (bottom && bottom.active && cell.walls.bottom && bottom.walls.top) {
        candidates.push({ a: cell, b: bottom });
      }
    }
  }

  const shuffled = shuffleArray(candidates);
  const count = Math.floor(shuffled.length * p);

  for (let i = 0; i < count; i++) {
    removeWallBetween(shuffled[i].a, shuffled[i].b);
  }
}

function solveMaze(cells, start, goal) {
  const queue = [start];
  const visited = new Set([cellKey(start)]);
  const parent = new Map();

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.x === goal.x && current.y === goal.y) break;

    const neighbors = getOpenNeighbors(cells, current);

    for (const n of neighbors) {
      const k = cellKey(n);
      if (!visited.has(k)) {
        visited.add(k);
        parent.set(k, current);
        queue.push(n);
      }
    }
  }

  const path = [];
  let cur = goal;

  while (cur) {
    path.push(cur);

    if (cur.x === start.x && cur.y === start.y) break;

    cur = parent.get(cellKey(cur));
    if (!cur) break;
  }

  return path.reverse();
}

function getOpenNeighbors(cells, cell) {
  const result = [];
  const x = cell.x;
  const y = cell.y;

  if (!cell.walls.top && cells[y - 1] && cells[y - 1][x]) result.push(cells[y - 1][x]);
  if (!cell.walls.right && cells[y] && cells[y][x + 1]) result.push(cells[y][x + 1]);
  if (!cell.walls.bottom && cells[y + 1] && cells[y + 1][x]) result.push(cells[y + 1][x]);
  if (!cell.walls.left && cells[y] && cells[y][x - 1]) result.push(cells[y][x - 1]);

  return result.filter(c => c && c.active);
}

function cellKey(cell) {
  return cell.x + "," + cell.y;
}

/* ============================================================
   RANDOM START / GOAL PLACEMENT WITH DIFFICULTY
============================================================ */

function findStartCell(activeCells) {
  if (!activeCells || activeCells.length === 0) return null;
  if (activeCells.length === 1) return activeCells[0];

  const bounds = getActiveCellBounds(activeCells);
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;

  const edgeLimit = Math.max(1, Math.floor(Math.min(width, height) * 0.18));

  let candidates = activeCells.filter(cell => {
    const edgeDistance = Math.min(
      cell.x - bounds.minX,
      bounds.maxX - cell.x,
      cell.y - bounds.minY,
      bounds.maxY - cell.y
    );

    return edgeDistance <= edgeLimit;
  });

  if (!candidates.length) {
    candidates = activeCells;
  }

  return randomItem(candidates);
}

function findGoalCell(activeCells, start, settings) {
  if (!activeCells || activeCells.length === 0) return null;
  if (activeCells.length === 1) return activeCells[0];

  const bounds = getActiveCellBounds(activeCells);
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;

  const edgeLimit = Math.max(1, Math.floor(Math.min(width, height) * 0.18));

  let edgeCandidates = activeCells.filter(cell => {
    if (cell.x === start.x && cell.y === start.y) return false;

    const edgeDistance = Math.min(
      cell.x - bounds.minX,
      bounds.maxX - cell.x,
      cell.y - bounds.minY,
      bounds.maxY - cell.y
    );

    return edgeDistance <= edgeLimit;
  });

  if (!edgeCandidates.length) {
    edgeCandidates = activeCells.filter(cell => !(cell.x === start.x && cell.y === start.y));
  }

  let maxDistance = 0;

  for (const cell of edgeCandidates) {
    const distance = Math.abs(cell.x - start.x) + Math.abs(cell.y - start.y);
    if (distance > maxDistance) maxDistance = distance;
  }

  const minRatio = clamp(settings.goalDistanceMinPercent / 100, 0, 1);
  const maxRatio = clamp(settings.goalDistanceMaxPercent / 100, 0, 1);

  let distanceCandidates = edgeCandidates.filter(cell => {
    const distance = Math.abs(cell.x - start.x) + Math.abs(cell.y - start.y);
    return distance >= maxDistance * minRatio && distance <= maxDistance * maxRatio;
  });

  if (!distanceCandidates.length) {
    distanceCandidates = edgeCandidates.filter(cell => {
      const distance = Math.abs(cell.x - start.x) + Math.abs(cell.y - start.y);
      return distance >= maxDistance * minRatio;
    });
  }

  if (!distanceCandidates.length) {
    distanceCandidates = edgeCandidates;
  }

  return randomItem(distanceCandidates);
}

function getActiveCellBounds(activeCells) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const cell of activeCells) {
    if (cell.x < minX) minX = cell.x;
    if (cell.y < minY) minY = cell.y;
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y > maxY) maxY = cell.y;
  }

  return { minX, minY, maxX, maxY };
}

function pickCheckpoints(path, count) {
  const checkpoints = [];
  if (!path || path.length < 5 || count <= 0) return checkpoints;

  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const idx = clamp(Math.floor(path.length * t), 1, path.length - 2);
    checkpoints.push(path[idx]);
  }

  return checkpoints;
}

function pickEnemies(cells, path, start, goal, checkpoints, count) {
  const enemies = [];
  const enemyCount = clamp(count, 0, 12);
  if (enemyCount <= 0) return enemies;

  const blocked = new Set();

  for (const p of path || []) blocked.add(cellKey(p));
  blocked.add(cellKey(start));
  blocked.add(cellKey(goal));

  for (const c of checkpoints || []) {
    blocked.add(cellKey(c));
  }

  const candidates = [];

  for (const row of cells) {
    for (const cell of row) {
      if (cell.active && !blocked.has(cellKey(cell))) {
        candidates.push(cell);
      }
    }
  }

  const shuffled = shuffleArray(candidates);

  for (const c of shuffled) {
    if (enemies.length >= enemyCount) break;

    const tooClose = enemies.some(e => {
      return Math.abs(e.x - c.x) + Math.abs(e.y - c.y) < 3;
    });

    if (!tooClose) {
      enemies.push(c);
    }
  }

  return enemies;
}

/* ============================================================
   MASK
   New rule:
   - PNG masks may stay 2000 x 2000 px.
   - MBG detects the real active shape, crops it logically,
     centers it, scales it to the grid, and samples cells.
   - Supports one mask, random masks, and ordered masks.
   - Compatibility:
     maskAsset input can be single or multiple.
     If HTML has no maskMode / maskPaddingPercent / maskPolarity fields,
     safe defaults are used.
============================================================ */

function pickMaskAsset(settings, index) {
  const masks = MBG.maskAssets && MBG.maskAssets.length
    ? MBG.maskAssets
    : (MBG.assets.mask ? [{ name: "mask", img: MBG.assets.mask }] : []);

  if (!masks.length) return null;

  const mode = String(settings.maskMode || "single").toLowerCase();

  if (mode === "random" || mode === "losowo") {
    return randomItem(masks).img;
  }

  if (mode === "ordered" || mode === "sequence" || mode === "po-kolei") {
    const i = Math.max(0, (index || 1) - 1) % masks.length;
    return masks[i].img;
  }

  return masks[0].img;
}

function createMaskGrid(settings, index) {
  const width = settings.mazeWidth;
  const height = settings.mazeHeight;

  if (!settings.useMask) {
    return createFullActiveGrid(width, height);
  }

  const maskImg = pickMaskAsset(settings, index);

  if (!maskImg) {
    return createFullActiveGrid(width, height);
  }

  const options = {
    threshold: settings.maskThreshold,
    paddingPercent: settings.maskPaddingPercent,
    polarity: settings.maskPolarity,
    invert: settings.maskInvert,
    fitMode: settings.maskFitMode
  };

  let grid = buildAutoFitMaskGrid(maskImg, width, height, options);

  grid = normalizeActiveGrid(grid, width, height);

  const activeCount = countActiveCells(grid, width, height);
  const activeRatio = activeCount / Math.max(1, width * height);

  if (activeCount < 4 || activeRatio < 0.08) {
    console.warn("Maska dała zbyt mało aktywnych pól. Użyto zwykłego prostokąta.");
    setStatus("Maska dała zbyt mało aktywnych pól — użyto zwykłego prostokąta.");
    return createFullActiveGrid(width, height);
  }

  return grid;
}

function createFullActiveGrid(width, height) {
  const grid = [];

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) row.push(true);
    grid.push(row);
  }

  return grid;
}

function buildAutoFitMaskGrid(img, cols, rows, options = {}) {
  const threshold = clamp(Number(options.threshold ?? 128), 0, 255);
  const paddingPercent = clamp(Number(options.paddingPercent ?? 6), 0, 30);
  const padding = paddingPercent / 100;
  const fitMode = String(options.fitMode || "contain").toLowerCase();

  const srcCanvas = document.createElement("canvas");
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });

  srcCanvas.width = img.naturalWidth || img.width;
  srcCanvas.height = img.naturalHeight || img.height;

  srcCtx.clearRect(0, 0, srcCanvas.width, srcCanvas.height);
  srcCtx.drawImage(img, 0, 0, srcCanvas.width, srcCanvas.height);

  const srcImage = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const srcData = srcImage.data;

  const polarity = resolveMaskPolarity(srcData, threshold, options);

  const bounds = findMaskActiveBoundsFromData(
    srcData,
    srcCanvas.width,
    srcCanvas.height,
    threshold,
    polarity
  );

  if (!bounds) {
    console.warn("Nie wykryto aktywnego obszaru maski.");
    return createFullActiveGrid(cols, rows);
  }

  const workSize = 2000;
  const workCanvas = document.createElement("canvas");
  const workCtx = workCanvas.getContext("2d", { willReadFrequently: true });

  workCanvas.width = workSize;
  workCanvas.height = workSize;

  workCtx.fillStyle = polarity === "dark" ? "#ffffff" : "#000000";
  workCtx.fillRect(0, 0, workSize, workSize);

  let targetW = workSize * (1 - padding * 2);
  let targetH = workSize * (1 - padding * 2);

  targetW = Math.max(10, targetW);
  targetH = Math.max(10, targetH);

  const sourceRatio = bounds.w / bounds.h;
  const targetRatio = targetW / targetH;

  let drawW;
  let drawH;

  if (fitMode === "stretch") {
    drawW = targetW;
    drawH = targetH;
  } else if (fitMode === "cover") {
    if (sourceRatio > targetRatio) {
      drawH = targetH;
      drawW = targetH * sourceRatio;
    } else {
      drawW = targetW;
      drawH = targetW / sourceRatio;
    }
  } else {
    if (sourceRatio > targetRatio) {
      drawW = targetW;
      drawH = targetW / sourceRatio;
    } else {
      drawH = targetH;
      drawW = targetH * sourceRatio;
    }
  }

  const dx = (workSize - drawW) / 2;
  const dy = (workSize - drawH) / 2;

  workCtx.imageSmoothingEnabled = true;
  workCtx.imageSmoothingQuality = "high";

  workCtx.drawImage(
    srcCanvas,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
    dx,
    dy,
    drawW,
    drawH
  );

  const workData = workCtx.getImageData(0, 0, workSize, workSize).data;

  const grid = [];
  let activeCount = 0;

  for (let y = 0; y < rows; y++) {
    const row = [];

    for (let x = 0; x < cols; x++) {
      const active = sampleMaskCell(
        workData,
        workSize,
        cols,
        rows,
        x,
        y,
        threshold,
        polarity
      );

      row.push(active);
      if (active) activeCount++;
    }

    grid.push(row);
  }

  const minUseful = Math.max(4, Math.floor(cols * rows * 0.08));

  if (activeCount < minUseful) {
    console.warn("Po próbkowaniu maska ma za mało pól aktywnych.");
    return createFullActiveGrid(cols, rows);
  }

  if (cols <= 24 || rows <= 24) {
    return dilateGrid(grid, cols, rows, 1);
  }

  return grid;
}

function resolveMaskPolarity(data, threshold, options = {}) {
  const explicit = String(options.polarity || "").toLowerCase();

  if (explicit === "white" || explicit === "bright" || explicit === "jasne") return "bright";
  if (explicit === "black" || explicit === "dark" || explicit === "ciemne") return "dark";
  if (explicit === "visible" || explicit === "alpha") return "visible";

  // Backward compatibility with old checkbox:
  // old maskInvert=true meant bright/white pixels are active.
  if (options.invert === true) return "bright";

  let brightCount = 0;
  let darkCount = 0;
  let visibleCount = 0;

  const step = 4 * 16;

  for (let i = 0; i < data.length; i += step) {
    const a = data[i + 3];
    if (a <= 10) continue;

    visibleCount++;

    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness >= threshold) brightCount++;
    else darkCount++;
  }

  if (visibleCount === 0) return "bright";

  // Common mask for MBG: white shape on black background.
  // The active shape is usually the minority color, not the background.
  if (brightCount <= darkCount) return "bright";
  return "dark";
}

function isMaskPixelActive(r, g, b, a, threshold, polarity) {
  if (a <= 10) return false;

  if (polarity === "visible") {
    return true;
  }

  const brightness = (r + g + b) / 3;

  if (polarity === "dark") {
    return brightness < threshold;
  }

  return brightness >= threshold;
}

function findMaskActiveBoundsFromData(data, width, height, threshold, polarity) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      const active = isMaskPixelActive(
        data[idx],
        data[idx + 1],
        data[idx + 2],
        data[idx + 3],
        threshold,
        polarity
      );

      if (active) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const pad = Math.round(Math.min(width, height) * 0.015);

  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1
  };
}

function sampleMaskCell(data, workSize, cols, rows, gx, gy, threshold, polarity) {
  const cellX0 = (gx / cols) * workSize;
  const cellY0 = (gy / rows) * workSize;
  const cellW = workSize / cols;
  const cellH = workSize / rows;

  const samplePoints = [
    [0.5, 0.5],
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
    [0.5, 0.2],
    [0.8, 0.5],
    [0.5, 0.8],
    [0.2, 0.5]
  ];

  let hits = 0;

  for (const [sx, sy] of samplePoints) {
    const px = clamp(Math.floor(cellX0 + cellW * sx), 0, workSize - 1);
    const py = clamp(Math.floor(cellY0 + cellH * sy), 0, workSize - 1);
    const idx = (py * workSize + px) * 4;

    if (isMaskPixelActive(
      data[idx],
      data[idx + 1],
      data[idx + 2],
      data[idx + 3],
      threshold,
      polarity
    )) {
      hits++;
    }
  }

  return hits >= 3;
}

function dilateGrid(grid, width, height, iterations) {
  let current = grid;

  for (let i = 0; i < iterations; i++) {
    const next = [];

    for (let y = 0; y < height; y++) {
      const row = [];

      for (let x = 0; x < width; x++) {
        if (current[y][x]) {
          row.push(true);
          continue;
        }

        let hasActiveNeighbor = false;

        const neighbors = [
          { x: x, y: y - 1 },
          { x: x + 1, y: y },
          { x: x, y: y + 1 },
          { x: x - 1, y: y }
        ];

        for (const n of neighbors) {
          if (
            n.x >= 0 &&
            n.y >= 0 &&
            n.x < width &&
            n.y < height &&
            current[n.y][n.x]
          ) {
            hasActiveNeighbor = true;
            break;
          }
        }

        row.push(hasActiveNeighbor);
      }

      next.push(row);
    }

    current = next;
  }

  return current;
}

function countActiveCells(grid, width, height) {
  let count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x]) count++;
    }
  }

  return count;
}

function normalizeActiveGrid(grid, width, height) {
  const largest = findLargestComponent(grid, width, height);

  if (largest.size < 2) return grid;

  const normalized = [];

  for (let y = 0; y < height; y++) {
    const row = [];

    for (let x = 0; x < width; x++) {
      row.push(largest.keys.has(x + "," + y));
    }

    normalized.push(row);
  }

  return normalized;
}

function findLargestComponent(grid, width, height) {
  const seen = new Set();
  let bestKeys = new Set();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = x + "," + y;

      if (!grid[y][x] || seen.has(k)) continue;

      const component = new Set();
      const queue = [{ x, y }];
      seen.add(k);

      while (queue.length) {
        const p = queue.shift();
        component.add(p.x + "," + p.y);

        const dirs = [
          { x: p.x, y: p.y - 1 },
          { x: p.x + 1, y: p.y },
          { x: p.x, y: p.y + 1 },
          { x: p.x - 1, y: p.y }
        ];

        for (const n of dirs) {
          const nk = n.x + "," + n.y;

          if (
            n.x >= 0 &&
            n.y >= 0 &&
            n.x < width &&
            n.y < height &&
            grid[n.y][n.x] &&
            !seen.has(nk)
          ) {
            seen.add(nk);
            queue.push(n);
          }
        }
      }

      if (component.size > bestKeys.size) {
        bestKeys = component;
      }
    }
  }

  return {
    keys: bestKeys,
    size: bestKeys.size
  };
}

/* ============================================================
   MAZE DRAWING
============================================================ */

function drawMazePage(ctx, settings, mazeData, isSolution) {
  clearPage(ctx);

  const layout = getMazeLayout(settings);

  drawDecoLayer(ctx, settings, isSolution ? "solution" : "maze", layout);

  drawMazeHeader(ctx, settings, mazeData, isSolution);

  if (settings.enableMaskOutline && settings.useMask) {
    drawMaskOutline(ctx, settings, mazeData, layout);
  }

  const maskClipApplied = applyMazeMaskClip(ctx, settings, mazeData, layout);

  drawMazeGrid(ctx, settings, mazeData, layout);

  if (settings.showMaskGuide && settings.useMask) {
    drawMaskGuide(ctx, settings, mazeData, layout);
  }

  if (isSolution) {
    drawSolutionPath(ctx, settings, mazeData, layout);
  }

  drawMazeAssets(ctx, settings, mazeData, layout);

  if (maskClipApplied) {
    ctx.restore();
  }

  drawMazeFooter(ctx, settings, mazeData, isSolution);
}

function applyMazeMaskClip(ctx, settings, mazeData, layout) {
  if (!settings.useMask) return false;

  const originalMaskClip = getOriginalMaskOutline(settings, mazeData, layout, 0);
  const segments = originalMaskClip && originalMaskClip.segments.length
    ? originalMaskClip.segments
    : getMaskContourSegments(mazeData, layout, 0);
  if (!segments.length) return false;

  const paths = traceMaskContourPaths(segments);
  if (!paths.length) return false;

  const cellSize = Math.min(
    layout.mazeBox.w / mazeData.width,
    layout.mazeBox.h / mazeData.height
  );
  const radius = Math.max(2, Math.min(cellSize * 0.22, 18));

  ctx.save();
  ctx.beginPath();

  for (const path of paths) {
    drawRoundedContourPath(ctx, path, radius);
  }

  ctx.clip();
  return true;
}

function drawMazeHeader(ctx, settings, mazeData, isSolution) {
  ctx.save();
  ctx.textAlign = "center";

  ctx.fillStyle = "#111827";
  ctx.font = "bold 62px Arial";

  const prefix = isSolution ? settings.solutionPrefix : settings.mazePrefix;
  const title = isSolution ? settings.solutionTitle : settings.mazePageTitle;
  const subtitle = isSolution ? settings.solutionSubtitle : settings.mazePageSubtitle;

  ctx.fillText(prefix + " " + mazeData.index, MBG.PAGE_W / 2, settings.safeMargin + 70);

  ctx.font = "bold 48px Arial";
  ctx.fillText(title, MBG.PAGE_W / 2, settings.safeMargin + 145);

  ctx.fillStyle = "#4b5563";
  ctx.font = "34px Arial";
  wrapText(ctx, subtitle, MBG.PAGE_W / 2, settings.safeMargin + 205, 1700, 46, "center");

  ctx.restore();
}

function drawMazeFooter(ctx, settings, mazeData, isSolution) {
  ctx.save();
  ctx.fillStyle = "#6b7280";
  ctx.textAlign = "center";
  ctx.font = "30px Arial";

  const prefix = isSolution ? settings.solutionPrefix : settings.mazePrefix;
  ctx.fillText(prefix + " " + mazeData.index, MBG.PAGE_W / 2, MBG.PAGE_H - settings.safeMargin + 70);

  ctx.restore();
}

function drawMazeGrid(ctx, settings, mazeData, layout) {
  const box = layout.mazeBox;
  const cellW = box.w / mazeData.width;
  const cellH = box.h / mazeData.height;
  const lineW = Math.max(3, Math.min(cellW, cellH) * 0.045 * (settings.wallThicknessPercent / 100));

  ctx.save();
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = lineW;
  ctx.lineCap = "round";

  for (let y = 0; y < mazeData.height; y++) {
    for (let x = 0; x < mazeData.width; x++) {
      const cell = mazeData.cells[y][x];
      if (!cell.active) continue;

      const px = box.x + x * cellW;
      const py = box.y + y * cellH;

      ctx.beginPath();

      if (cell.walls.top || !isActiveCell(mazeData, x, y - 1)) {
        ctx.moveTo(px, py);
        ctx.lineTo(px + cellW, py);
      }

      if (cell.walls.right || !isActiveCell(mazeData, x + 1, y)) {
        ctx.moveTo(px + cellW, py);
        ctx.lineTo(px + cellW, py + cellH);
      }

      if (cell.walls.bottom || !isActiveCell(mazeData, x, y + 1)) {
        ctx.moveTo(px + cellW, py + cellH);
        ctx.lineTo(px, py + cellH);
      }

      if (cell.walls.left || !isActiveCell(mazeData, x - 1, y)) {
        ctx.moveTo(px, py + cellH);
        ctx.lineTo(px, py);
      }

      ctx.stroke();
    }
  }

  ctx.restore();
}

function isActiveCell(mazeData, x, y) {
  return !!(
    mazeData.cells[y] &&
    mazeData.cells[y][x] &&
    mazeData.cells[y][x].active
  );
}

function drawMaskGuide(ctx, settings, mazeData, layout) {
  const box = layout.mazeBox;
  const cellW = box.w / mazeData.width;
  const cellH = box.h / mazeData.height;

  ctx.save();
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = settings.maskGuideThickness;
  ctx.setLineDash([18, 16]);

  for (let y = 0; y < mazeData.height; y++) {
    for (let x = 0; x < mazeData.width; x++) {
      if (!mazeData.activeGrid[y][x]) continue;

      const px = box.x + x * cellW;
      const py = box.y + y * cellH;

      ctx.strokeRect(px, py, cellW, cellH);
    }
  }

  ctx.setLineDash([]);
  ctx.restore();
}

function drawMaskOutline(ctx, settings, mazeData, layout) {
  ctx.setLineDash([]);

  const outlineDistance = getMaskOutlineDistance(settings);
  const renderMode = String(settings.maskOutlineRenderMode || "smooth").toLowerCase();
  const outlineSource = String(settings.maskOutlineSource || "maze-grid").toLowerCase();
  const originalMaskOutline = outlineSource === "original-mask"
    ? getOriginalMaskOutline(settings, mazeData, layout, renderMode === "smooth" ? 0 : outlineDistance)
    : null;
  const segments = originalMaskOutline
    ? originalMaskOutline.segments
    : getMaskContourSegments(mazeData, layout, renderMode === "smooth" ? 0 : outlineDistance);
  if (!segments.length) {
    ctx.setLineDash([]);
    return;
  }

  const cellSize = Math.min(
    layout.mazeBox.w / mazeData.width,
    layout.mazeBox.h / mazeData.height
  );

  ctx.save();
  try {
    ctx.strokeStyle = "#111827";
    ctx.globalAlpha = clamp(settings.maskOutlineOpacity || 0.45, 0.1, 1);
    ctx.lineWidth = Math.min(settings.maskOutlineThickness, cellSize * 0.9);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    applyMaskOutlineDash(ctx, settings);

    if (renderMode === "smooth") {
      drawSmoothMaskOutlinePath(
        ctx,
        segments,
        cellSize,
        originalMaskOutline ? originalMaskOutline.center : getActiveMaskCenter(mazeData, layout),
        outlineDistance
      );
    } else {
      drawGridMaskOutlinePath(ctx, segments);
    }
  } finally {
    ctx.restore();
  }

  ctx.setLineDash([]);
}

function getMaskOutlineDistance(settings) {
  const placement = String(settings.maskOutlinePlacement || "outside").toLowerCase();
  const distance = Math.max(0, settings.maskOutlineOffset + settings.maskOutlineGap);

  if (placement === "center") return 0;
  if (placement === "inside") return -distance;
  return distance;
}

function getOriginalMaskOutline(settings, mazeData, layout, offset) {
  const maskImg = pickMaskAsset(settings, mazeData.index || 1);
  if (!maskImg) return null;

  const contour = buildOriginalMaskContourSegments(maskImg, layout, {
    threshold: settings.maskThreshold,
    paddingPercent: settings.maskPaddingPercent,
    polarity: settings.maskPolarity,
    invert: settings.maskInvert,
    fitMode: settings.maskFitMode,
    offset
  });

  return contour && contour.segments.length ? contour : null;
}

function buildOriginalMaskContourSegments(img, layout, options = {}) {
  const threshold = clamp(Number(options.threshold ?? 128), 0, 255);
  const paddingPercent = clamp(Number(options.paddingPercent ?? 6), 0, 30);
  const padding = paddingPercent / 100;
  const fitMode = String(options.fitMode || "contain").toLowerCase();
  const offset = Number(options.offset || 0);
  const box = layout.mazeBox;
  const sampleW = 480;
  const sampleH = sampleW;

  const srcCanvas = document.createElement("canvas");
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
  srcCanvas.width = img.naturalWidth || img.width;
  srcCanvas.height = img.naturalHeight || img.height;
  srcCtx.clearRect(0, 0, srcCanvas.width, srcCanvas.height);
  srcCtx.drawImage(img, 0, 0, srcCanvas.width, srcCanvas.height);

  const srcImage = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const srcData = srcImage.data;
  const polarity = resolveMaskPolarity(srcData, threshold, options);
  const bounds = findMaskActiveBoundsFromData(srcData, srcCanvas.width, srcCanvas.height, threshold, polarity);

  if (!bounds) return null;

  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  maskCanvas.width = sampleW;
  maskCanvas.height = sampleH;

  if (polarity === "visible") {
    maskCtx.clearRect(0, 0, sampleW, sampleH);
  } else {
    maskCtx.fillStyle = polarity === "dark" ? "#ffffff" : "#000000";
    maskCtx.fillRect(0, 0, sampleW, sampleH);
  }

  const targetW = Math.max(10, sampleW * (1 - padding * 2));
  const targetH = Math.max(10, sampleH * (1 - padding * 2));
  const sourceRatio = bounds.w / bounds.h;
  const targetRatio = targetW / targetH;
  let drawW;
  let drawH;

  if (fitMode === "stretch") {
    drawW = targetW;
    drawH = targetH;
  } else if (fitMode === "cover") {
    if (sourceRatio > targetRatio) {
      drawH = targetH;
      drawW = targetH * sourceRatio;
    } else {
      drawW = targetW;
      drawH = targetW / sourceRatio;
    }
  } else {
    if (sourceRatio > targetRatio) {
      drawW = targetW;
      drawH = targetW / sourceRatio;
    } else {
      drawH = targetH;
      drawW = targetH * sourceRatio;
    }
  }

  const dx = (sampleW - drawW) / 2;
  const dy = (sampleH - drawH) / 2;

  maskCtx.imageSmoothingEnabled = true;
  maskCtx.imageSmoothingQuality = "high";
  maskCtx.drawImage(srcCanvas, bounds.x, bounds.y, bounds.w, bounds.h, dx, dy, drawW, drawH);

  const data = maskCtx.getImageData(0, 0, sampleW, sampleH).data;
  const active = [];
  let totalX = 0;
  let totalY = 0;
  let count = 0;

  for (let y = 0; y < sampleH; y++) {
    const row = [];

    for (let x = 0; x < sampleW; x++) {
      const idx = (y * sampleW + x) * 4;
      const isActive = isMaskPixelActive(data[idx], data[idx + 1], data[idx + 2], data[idx + 3], threshold, polarity);
      row.push(isActive);

      if (isActive) {
        totalX += x + 0.5;
        totalY += y + 0.5;
        count++;
      }
    }

    active.push(row);
  }

  if (!count) return null;

  const scaleX = box.w / sampleW;
  const scaleY = box.h / sampleH;
  const center = {
    x: box.x + (totalX / count) * scaleX,
    y: box.y + (totalY / count) * scaleY
  };
  const toPagePoint = (x, y) => expandPointFromCenter({
    x: box.x + x * scaleX,
    y: box.y + y * scaleY
  }, center, offset);
  const segments = [];

  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      if (!active[y][x]) continue;

      if (!isActiveMaskRasterPixel(active, x, y - 1)) {
        pushRasterSegment(segments, toPagePoint(x, y), toPagePoint(x + 1, y));
      }

      if (!isActiveMaskRasterPixel(active, x + 1, y)) {
        pushRasterSegment(segments, toPagePoint(x + 1, y), toPagePoint(x + 1, y + 1));
      }

      if (!isActiveMaskRasterPixel(active, x, y + 1)) {
        pushRasterSegment(segments, toPagePoint(x + 1, y + 1), toPagePoint(x, y + 1));
      }

      if (!isActiveMaskRasterPixel(active, x - 1, y)) {
        pushRasterSegment(segments, toPagePoint(x, y + 1), toPagePoint(x, y));
      }
    }
  }

  return { segments, center };
}

function isActiveMaskRasterPixel(active, x, y) {
  return !!(active[y] && active[y][x]);
}

function pushRasterSegment(segments, start, end) {
  segments.push({
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y
  });
}

function expandPointFromCenter(point, center, amount) {
  if (!amount) return point;

  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (d <= 0) return point;

  return {
    x: point.x + (dx / d) * amount,
    y: point.y + (dy / d) * amount
  };
}

function applyMaskOutlineDash(ctx, settings) {
  const style = String(settings.maskOutlineStyle || "solid").toLowerCase();

  if (style === "dashed") {
    const dash = Math.max(18, ctx.lineWidth * 3);
    ctx.setLineDash([dash, dash * 0.72]);
    return;
  }

  if (style === "dotted") {
    const dot = Math.max(2, ctx.lineWidth);
    ctx.setLineDash([dot, dot * 2.2]);
    return;
  }

  ctx.setLineDash([]);
}

function drawGridMaskOutlinePath(ctx, segments) {
  ctx.beginPath();

  for (const segment of segments) {
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(segment.x2, segment.y2);
  }

  ctx.stroke();
}

function drawSmoothMaskOutlinePath(ctx, segments, cellSize, center, outlineDistance) {
  const paths = traceMaskContourPaths(segments);
  if (!paths.length) {
    drawGridMaskOutlinePath(ctx, segments);
    return;
  }

  const radius = Math.max(2, Math.min(cellSize * 0.28, ctx.lineWidth * 5));
  const expandedPaths = paths.map(path => expandContourPath(path, center, outlineDistance));

  ctx.beginPath();

  for (const path of expandedPaths) {
    drawRoundedContourPath(ctx, path, radius);
  }

  ctx.stroke();
}

function getActiveMaskCenter(mazeData, layout) {
  const box = layout.mazeBox;
  const cellW = box.w / mazeData.width;
  const cellH = box.h / mazeData.height;
  let totalX = 0;
  let totalY = 0;
  let count = 0;

  for (let y = 0; y < mazeData.height; y++) {
    for (let x = 0; x < mazeData.width; x++) {
      if (!isActiveMaskCell(mazeData, x, y)) continue;
      totalX += box.x + x * cellW + cellW / 2;
      totalY += box.y + y * cellH + cellH / 2;
      count++;
    }
  }

  if (!count) {
    return {
      x: box.x + box.w / 2,
      y: box.y + box.h / 2
    };
  }

  return {
    x: totalX / count,
    y: totalY / count
  };
}

function expandContourPath(path, center, amount) {
  if (!amount) return path;

  return path.map(point => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (d <= 0) return { x: point.x, y: point.y };

    return {
      x: point.x + (dx / d) * amount,
      y: point.y + (dy / d) * amount
    };
  });
}

function traceMaskContourPaths(segments) {
  const starts = new Map();

  segments.forEach((segment, index) => {
    const key = pointKey(segment.x1, segment.y1);
    if (!starts.has(key)) starts.set(key, []);
    starts.get(key).push(index);
  });

  const used = new Set();
  const paths = [];

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;

    const first = segments[i];
    const startKey = pointKey(first.x1, first.y1);
    let currentKey = startKey;
    const points = [{ x: first.x1, y: first.y1 }];

    while (true) {
      const nextIndex = (starts.get(currentKey) || []).find(index => !used.has(index));
      if (nextIndex === undefined) break;

      const segment = segments[nextIndex];
      used.add(nextIndex);
      points.push({ x: segment.x2, y: segment.y2 });
      currentKey = pointKey(segment.x2, segment.y2);

      if (currentKey === startKey) break;
    }

    if (points.length > 1) paths.push(points);
  }

  return paths;
}

function drawRoundedContourPath(ctx, path, radius) {
  const closed = path.length > 2 && pointKey(path[0].x, path[0].y) === pointKey(path[path.length - 1].x, path[path.length - 1].y);
  const points = closed ? path.slice(0, -1) : path;

  if (!closed || points.length < 3) {
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    return;
  }

  const firstOut = pointToward(points[0], points[1], radius);
  ctx.moveTo(firstOut.x, firstOut.y);

  for (let i = 1; i <= points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i % points.length];
    const next = points[(i + 1) % points.length];
    const r = Math.min(radius, distance(curr, prev) / 2, distance(curr, next) / 2);
    const inPoint = pointToward(curr, prev, r);
    const outPoint = pointToward(curr, next, r);

    ctx.lineTo(inPoint.x, inPoint.y);
    ctx.quadraticCurveTo(curr.x, curr.y, outPoint.x, outPoint.y);
  }

  ctx.closePath();
}

function pointToward(from, to, amount) {
  const d = distance(from, to);
  if (d <= 0) return { x: from.x, y: from.y };

  const t = Math.min(1, amount / d);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t
  };
}

function distance(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointKey(x, y) {
  return Math.round(x * 1000) / 1000 + "," + Math.round(y * 1000) / 1000;
}

function getMaskContourSegments(mazeData, layout, offset) {
  const box = layout.mazeBox;
  const cellW = box.w / mazeData.width;
  const cellH = box.h / mazeData.height;
  const maxInset = Math.min(cellW, cellH) * 0.45;
  const outward = Math.max(0, offset);
  const inward = Math.min(Math.max(0, -offset), maxInset);
  const segments = [];

  for (let y = 0; y < mazeData.height; y++) {
    for (let x = 0; x < mazeData.width; x++) {
      if (!isActiveMaskCell(mazeData, x, y)) continue;

      const px = box.x + x * cellW;
      const py = box.y + y * cellH;
      const hStart = px - outward + inward;
      const hEnd = px + cellW + outward - inward;
      const vStart = py - outward + inward;
      const vEnd = py + cellH + outward - inward;

      if (!isActiveMaskCell(mazeData, x, y - 1)) {
        segments.push({ x1: hStart, y1: py - offset, x2: hEnd, y2: py - offset });
      }

      if (!isActiveMaskCell(mazeData, x + 1, y)) {
        segments.push({ x1: px + cellW + offset, y1: vStart, x2: px + cellW + offset, y2: vEnd });
      }

      if (!isActiveMaskCell(mazeData, x, y + 1)) {
        segments.push({ x1: hEnd, y1: py + cellH + offset, x2: hStart, y2: py + cellH + offset });
      }

      if (!isActiveMaskCell(mazeData, x - 1, y)) {
        segments.push({ x1: px - offset, y1: vEnd, x2: px - offset, y2: vStart });
      }
    }
  }

  return segments;
}

function isActiveMaskCell(mazeData, x, y) {
  return !!(
    mazeData.activeGrid &&
    mazeData.activeGrid[y] &&
    mazeData.activeGrid[y][x]
  );
}

function drawSolutionPath(ctx, settings, mazeData, layout) {
  const path = mazeData.solutionPath;
  if (!path || path.length < 2) return;

  const box = layout.mazeBox;
  const cellW = box.w / mazeData.width;
  const cellH = box.h / mazeData.height;
  const cell = Math.min(cellW, cellH);

  ctx.save();
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = Math.max(7, cell * 0.09);
  ctx.setLineDash([30, 22]);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();

  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const cx = box.x + p.x * cellW + cellW / 2;
    const cy = box.y + p.y * cellH + cellH / 2;

    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  }

  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawMazeAssets(ctx, settings, mazeData, layout) {
  const box = layout.mazeBox;
  const cellW = box.w / mazeData.width;
  const cellH = box.h / mazeData.height;
  const cell = Math.min(cellW, cellH);

  drawCellAsset(ctx, settings, mazeData.start, MBG.assets.start, settings.startLabel, settings.startScale, box, cellW, cellH, cell);
  drawCellAsset(ctx, settings, mazeData.goal, MBG.assets.goal, settings.goalLabel, settings.goalScale, box, cellW, cellH, cell);

  for (const cp of mazeData.checkpoints || []) {
    drawCellAsset(ctx, settings, cp, MBG.assets.checkpoint, settings.checkpointLabel || "CHECK", settings.checkpointScale, box, cellW, cellH, cell);
  }

  for (const enemy of mazeData.enemies || []) {
    drawCellAsset(ctx, settings, enemy, MBG.assets.enemy, settings.enemyLabel || "AVOID", settings.enemyScale, box, cellW, cellH, cell);
  }
}

function drawCellAsset(ctx, settings, cellPos, img, label, scale, box, cellW, cellH, baseCell) {
  if (!cellPos) return;

  const cx = box.x + cellPos.x * cellW + cellW / 2;
  const cy = box.y + cellPos.y * cellH + cellH / 2;
  const size = baseCell * scale * settings.globalAssetScale;

  ctx.save();

  if (settings.useAssets && img) {
    drawImageCentered(ctx, img, cx, cy, size);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    roundRect(ctx, cx - cellW * 0.38, cy - cellH * 0.23, cellW * 0.76, cellH * 0.46, 14, true, true);

    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold " + Math.max(15, baseCell * 0.13) + "px Arial";
    ctx.fillText(label, cx, cy);
  }

  ctx.restore();
}

/* ============================================================
   DECO LAYER - NO OVERLAP VERSION
============================================================ */

function drawDecoLayer(ctx, settings, pageType, layout) {
  if (!settings.decoEnabled) return;
  if (!MBG.decoAssets.length) return;

  const allowed =
    (pageType === "intro" && settings.decoOnIntro) ||
    (pageType === "maze" && settings.decoOnMaze) ||
    (pageType === "solution" && settings.decoOnSolution) ||
    (pageType === "congrats" && settings.decoOnCongrats);

  if (!allowed) return;

  const zones = getDecoZones(settings, pageType, layout);
  if (!zones.length) return;

  let count = settings.decoDensity;

  if (pageType === "solution") {
    count = Math.max(1, Math.floor(count * 0.45));
  }

  if (settings.decoPlacement === "background") {
    count = Math.max(1, Math.floor(count * 0.75));
  }

  const placedDecos = [];
  const maxAttemptsPerDeco = 40;

  ctx.save();
  ctx.globalAlpha = settings.decoOpacity;

  for (let i = 0; i < count; i++) {
    let placed = false;

    for (let attempt = 0; attempt < maxAttemptsPerDeco; attempt++) {
      const asset = randomItem(MBG.decoAssets);
      const zone = randomItem(zones);

      if (!asset || !asset.img || !zone) continue;

      const decoData = prepareSingleDeco(asset.img, zone, settings);
      if (!decoData) continue;

      const paddedRect = expandRect(decoData.rect, 35);

      const overlapsExisting = placedDecos.some(existing =>
        rectsOverlap(paddedRect, existing)
      );

      const overlapsMaze =
        settings.decoAvoidMazeArea &&
        layout &&
        layout.mazeBox &&
        rectsOverlap(paddedRect, expandRect(layout.mazeBox, 80));

      if (overlapsExisting || overlapsMaze) {
        continue;
      }

      drawPreparedDeco(ctx, asset.img, decoData);
      placedDecos.push(paddedRect);
      placed = true;
      break;
    }

    if (!placed) {
      console.warn("DECO pominięte - brak miejsca bez nakładania.");
    }
  }

  ctx.restore();
}

function prepareSingleDeco(img, zone, settings) {
  const cx = randomRange(zone.x + zone.w * 0.18, zone.x + zone.w * 0.82);
  const cy = randomRange(zone.y + zone.h * 0.18, zone.y + zone.h * 0.82);

  const base = Math.min(zone.w, zone.h);
  const scale = randomRange(settings.decoScaleMin, settings.decoScaleMax);

  let w = base * scale;
  let h = base * scale;

  const ratio = img.width / img.height;

  if (ratio > 1) {
    h = w / ratio;
  } else {
    w = h * ratio;
  }

  const rotation = settings.decoRandomRotation
    ? randomRange(-24, 24) * Math.PI / 180
    : 0;

  const safety = 1.25;
  const rectW = w * safety;
  const rectH = h * safety;

  return {
    cx,
    cy,
    w,
    h,
    rotation,
    rect: {
      x: cx - rectW / 2,
      y: cy - rectH / 2,
      w: rectW,
      h: rectH
    }
  };
}

function drawPreparedDeco(ctx, img, decoData) {
  ctx.save();
  ctx.translate(decoData.cx, decoData.cy);
  ctx.rotate(decoData.rotation);
  ctx.drawImage(
    img,
    -decoData.w / 2,
    -decoData.h / 2,
    decoData.w,
    decoData.h
  );
  ctx.restore();
}

function getDecoZones(settings, pageType, layout) {
  const margin = 95;
  const corner = 450;

  const corners = [
    { x: margin, y: margin, w: corner, h: corner },
    { x: MBG.PAGE_W - margin - corner, y: margin, w: corner, h: corner },
    { x: margin, y: MBG.PAGE_H - margin - corner, w: corner, h: corner },
    { x: MBG.PAGE_W - margin - corner, y: MBG.PAGE_H - margin - corner, w: corner, h: corner }
  ];

  const headerFooter = [
    { x: 520, y: 105, w: 1510, h: 260 },
    { x: 410, y: 2860, w: 1730, h: 300 },
    { x: 120, y: 520, w: 330, h: 330 },
    { x: MBG.PAGE_W - 450, y: 520, w: 330, h: 330 }
  ];

  const background = [
    { x: 240, y: 720, w: 430, h: 430 },
    { x: 1850, y: 720, w: 430, h: 430 },
    { x: 260, y: 2200, w: 430, h: 430 },
    { x: 1840, y: 2200, w: 430, h: 430 },
    { x: 980, y: 1400, w: 570, h: 570 }
  ];

  let zones = [];

  if (settings.decoPlacement === "corners") {
    zones = corners;
  } else if (settings.decoPlacement === "headerFooter") {
    zones = headerFooter;
  } else if (settings.decoPlacement === "background") {
    zones = background;
  } else {
    zones = [...corners, ...headerFooter, ...background];
  }

  if (settings.decoAvoidMazeArea && layout && layout.mazeBox) {
    zones = zones.filter(z => !rectsOverlap(z, expandRect(layout.mazeBox, 60)));
  }

  return zones;
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
}

function expandRect(r, pad) {
  return {
    x: r.x - pad,
    y: r.y - pad,
    w: r.w + pad * 2,
    h: r.h + pad * 2
  };
}

/* ============================================================
   DRAWING HELPERS
============================================================ */

function drawImageIfExists(ctx, img, x, y, size) {
  if (!img) return;
  drawImageCentered(ctx, img, x, y, size);
}

function drawImageCentered(ctx, img, x, y, size) {
  const ratio = img.width / img.height;
  let w = size;
  let h = size;

  if (ratio > 1) h = w / ratio;
  else w = h * ratio;

  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
}

function fitText(ctx, text, x, y, maxSize, maxWidth, fontFamily = "Arial", weight = "bold") {
  let size = maxSize;

  while (size > 18) {
    ctx.font = weight + " " + size + "px " + fontFamily;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }

  ctx.fillText(text, x, y);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, align = "left") {
  const paragraphs = String(text || "").split("\n");
  let currentY = y;

  ctx.textAlign = align;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);

    if (!words.length) {
      currentY += lineHeight;
      continue;
    }

    let line = "";

    for (const word of words) {
      const testLine = line ? line + " " + word : word;
      const width = ctx.measureText(testLine).width;

      if (width > maxWidth && line) {
        ctx.fillText(line, x, currentY);
        line = word;
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }

    if (line) {
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
    }

    currentY += lineHeight * 0.25;
  }

  return currentY;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  const radius = Math.min(r, w / 2, h / 2);

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

/* ============================================================
   PRESET SAVE / LOAD
============================================================ */

function savePreset() {
  const fields = document.querySelectorAll("input, textarea, select");
  const data = {
    _mbgPresetMeta: {
      format: "MBG ustawienia projektu",
      version: 1,
      encoding: "UTF-8",
      displayLabels: {
        exportFileName: "Nazwa pliku PDF",
        presetFileName: "Nazwa pliku JSON z ustawieniami",
        projectBookSlug: "Slug projektu/książki"
      }
    }
  };

  fields.forEach(field => {
    if (!field.id) return;
    if (field.type === "file") return;
    if (field.type === "checkbox") data[field.id] = field.checked;
    else data[field.id] = field.value;
  });

  const fileName = safeFileName(getValue("presetFileName", "ustawienia-mbg")) + ".json";
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();

  URL.revokeObjectURL(a.href);
  setStatus("Ustawienia zapisane: " + fileName);
}

function loadPreset() {
  const input = el("presetFileInput");

  if (!input || !input.files || !input.files[0]) {
    alert("Najpierw wybierz plik JSON w polu: Plik ustawień JSON.");
    return;
  }

  const file = input.files[0];
  const reader = new FileReader();

  reader.onload = function () {
    try {
      const data = JSON.parse(reader.result);

      Object.keys(data).forEach(id => {
        const field = el(id);
        if (!field) return;

        if (field.type === "checkbox") field.checked = !!data[id];
        else field.value = data[id];
      });

      syncMaskOutlineControls();
      syncShapeTracerControls();
      syncColoringPageControls();
      syncAssetLibrarySelectionFromField();
      renewAssetLibrarySelectionSeed();
      renderAssetLibraryBrowser();
      refreshFenixBasket();
      updateMbgOptionUi();
      setStatus("Wczytano ustawienia: " + file.name + ". Zaimportowane paczki/PNG trzeba wybrać ponownie, jeśli nie są w koszyku lokalnym.");
      generatePreview();
    } catch (err) {
      console.error(err);
      alert("Nie udało się wczytać pliku ustawień JSON.");
    }
  };

  reader.readAsText(file);
}
