"use strict";

const EXPORT_WIDTH = 2550;
const EXPORT_HEIGHT = 3300;
const FENIX_BOOK_BASKET_DB_NAME = "fenixBookBasketDb";
const FENIX_BOOK_BASKET_STORE_NAME = "pages";
const FENIX_BOOK_BASKET_DB_VERSION = 1;
const SVG_STROKE_NORMALIZATION_BASE = 1024;
const SVG_SPLIT_OPTIONS = [
  ["left-dotted-right-normal", "Lewa kropkowana / prawa normalna"],
  ["left-normal-right-dotted", "Lewa normalna / prawa kropkowana"],
  ["top-dotted-bottom-normal", "Góra kropkowana / dół normalna"],
  ["top-normal-bottom-dotted", "Góra normalna / dół kropkowana"],
  ["normal", "Normal"]
];
const PNG_SPLIT_OPTIONS = [
  ["left-normal-right-ghost", "Lewa normalna / prawa ghost"],
  ["left-ghost-right-normal", "Lewa ghost / prawa normalna"],
  ["top-normal-bottom-ghost", "Góra normalna / dół ghost"],
  ["top-ghost-bottom-normal", "Góra ghost / dół normalna"],
  ["left-normal-right-dotted", "Lewa normalna / prawa dotted-like"],
  ["left-dotted-right-normal", "Lewa dotted-like / prawa normalna"]
];

const completePictureState = {
  assets: [],
  activeAssetId: null,
  nextAssetId: 1,
  renderUrls: [],
  selectedBasketAssetIds: new Set(),
  error: "",
  editBasketPageId: null,
  editBasketPage: null
};

document.addEventListener("DOMContentLoaded", function () {
  bindCompletePictureControls();
  applySettingsToControls(createDefaultCompletePictureSettings());
  updateCompletePictureControlValues();
  renderAssetList();
  updateCompletePictureUiState();
  renderCompletePicture();
  loadEditableCompletePictureBasketPageFromUrl();
});

function bindCompletePictureControls() {
  const fileInput = document.getElementById("completePictureFile");
  if (fileInput) fileInput.addEventListener("change", handleFileChange);

  bindRangeNumberPairs();

  const sourceMode = document.getElementById("completePictureSourceMode");
  if (sourceMode) sourceMode.addEventListener("change", function () {
    updateSourceModeControls();
    updateCompletePictureUiState();
  });

  getSettingControls().forEach(function (control) {
    control.addEventListener("input", handleSettingsChange);
    control.addEventListener("change", handleSettingsChange);
  });

  bindButton("completePictureRender", renderCompletePicture);
  bindButton("completePictureReset", resetCompletePictureSettings);
  bindButton("completePictureClear", clearCompletePicture);
  bindButton("completePictureClearAssets", clearCompletePicture);
  bindButton("completePictureExport", exportCompletePicturePng);
  bindButton("completePictureAddActiveToBasket", addActiveCompletePicturePageToBasket);
  bindButton("completePictureAddSelectedToBasket", addSelectedCompletePicturePagesToBasket);
  bindButton("completePictureUpdateBasketPage", updateEditedCompletePictureBasketPage);
  bindButton("completePictureExportActivePack", exportActiveCompletePicturePack);
  bindButton("completePictureExportSelectedPack", exportSelectedCompletePicturePack);
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

function addFenixBookBasketPage(page) {
  return withFenixBookBasketStore("readwrite", function (store) {
    store.put(page);
  });
}

function getFenixBookBasketPages() {
  return new Promise(function (resolve, reject) {
    openFenixBookBasketDb().then(function (db) {
      const transaction = db.transaction(FENIX_BOOK_BASKET_STORE_NAME, "readonly");
      const request = transaction.objectStore(FENIX_BOOK_BASKET_STORE_NAME).getAll();
      request.onsuccess = function () {
        db.close();
        resolve((request.result || []).sort(function (a, b) {
          return (a.order || 0) - (b.order || 0);
        }));
      };
      request.onerror = function () {
        db.close();
        reject(request.error || new Error("Błąd odczytu koszyka Fenixa."));
      };
    }).catch(reject);
  });
}

function getFenixBookBasketPage(id) {
  return new Promise(function (resolve, reject) {
    openFenixBookBasketDb().then(function (db) {
      const transaction = db.transaction(FENIX_BOOK_BASKET_STORE_NAME, "readonly");
      const request = transaction.objectStore(FENIX_BOOK_BASKET_STORE_NAME).get(id);
      request.onsuccess = function () {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = function () {
        db.close();
        reject(request.error || new Error("Błąd odczytu strony koszyka."));
      };
    }).catch(reject);
  });
}

function deleteFenixBookBasketPage(id) {
  return withFenixBookBasketStore("readwrite", function (store) {
    store.delete(id);
  });
}

function clearFenixBookBasketPages() {
  return withFenixBookBasketStore("readwrite", function (store) {
    store.clear();
  });
}

function bindButton(id, handler) {
  const button = document.getElementById(id);
  if (button) button.addEventListener("click", handler);
}

function getSettingControls() {
  return [
    "completePictureSplitMode",
    "completePictureRemoveOuterFrame",
    "completePictureGuideVisible",
    "completePictureGuideStyle",
    "completePictureThumbVisible",
    "completePictureThumbAutoFit",
    "completePictureThumbAnchor",
    "completePictureThumbFrame"
  ].map(function (id) {
    return document.getElementById(id);
  }).filter(Boolean);
}

function bindRangeNumberPairs() {
  [
    ["completePictureScale", "completePictureScaleNumber"],
    ["completePictureOffsetX", "completePictureOffsetXNumber"],
    ["completePictureOffsetY", "completePictureOffsetYNumber"],
    ["completePictureNormalStrokeWidth", "completePictureNormalStrokeWidthNumber"],
    ["completePictureDottedStrokeWidth", "completePictureDottedStrokeWidthNumber"],
    ["completePictureDashLength", "completePictureDashLengthNumber"],
    ["completePictureDashGap", "completePictureDashGapNumber"],
    ["completePicturePngThreshold", "completePicturePngThresholdNumber"],
    ["completePicturePngGhostOpacity", "completePicturePngGhostOpacityNumber"],
    ["completePicturePngPatternSize", "completePicturePngPatternSizeNumber"],
    ["completePicturePngPatternGap", "completePicturePngPatternGapNumber"],
    ["completePictureGuideWidth", "completePictureGuideWidthNumber"],
    ["completePictureGuideDash", "completePictureGuideDashNumber"],
    ["completePictureGuideGap", "completePictureGuideGapNumber"],
    ["completePictureGuideOpacity", "completePictureGuideOpacityNumber"],
    ["completePictureGuideOffset", "completePictureGuideOffsetNumber"],
    ["completePictureThumbScale", "completePictureThumbScaleNumber"],
    ["completePictureThumbOffsetX", "completePictureThumbOffsetXNumber"],
    ["completePictureThumbOffsetY", "completePictureThumbOffsetYNumber"]
  ].forEach(function (pair) {
    bindRangeNumberPair(pair[0], pair[1]);
  });
}

function bindRangeNumberPair(rangeId, numberId) {
  const range = document.getElementById(rangeId);
  const number = document.getElementById(numberId);
  if (!range || !number) return;

  number.min = range.min;
  number.max = range.max;
  number.step = range.step || "1";
  number.value = range.value;

  range.addEventListener("input", function () {
    number.value = range.value;
    handleSettingsChange();
  });
  range.addEventListener("change", function () {
    number.value = range.value;
    handleSettingsChange();
  });
  number.addEventListener("input", function () {
    syncNumberToRangeWhileTyping(number, range);
  });
  number.addEventListener("change", function () {
    commitNumberToRange(number, range);
  });
  number.addEventListener("blur", function () {
    commitNumberToRange(number, range);
  });
  number.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitNumberToRange(number, range);
      number.blur();
    }
  });
}

function syncNumberToRangeWhileTyping(number, range) {
  const min = Number(range.min);
  const max = Number(range.max);
  const raw = Number(number.value);
  if (number.value === "" || !Number.isFinite(raw)) return;
  if (raw < min || raw > max) return;
  range.value = raw;
  handleSettingsChange();
}

function commitNumberToRange(number, range) {
  const min = Number(range.min);
  const max = Number(range.max);
  const fallback = Number(range.value);
  const raw = Number(number.value);
  const value = Number.isFinite(raw) ? clampValue(raw, min, max) : fallback;
  range.value = value;
  number.value = value;
  handleSettingsChange();
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function handleSettingsChange() {
  saveActiveSettingsFromControls();
  updateCompletePictureControlValues();
  renderCompletePicture();
}

function handleFileChange(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    setError("Nie wybrano pliku.");
    renderCompletePicture();
    return;
  }

  loadSourceFiles(files).catch(function (error) {
    console.error(error);
    setError("Problem z odczytem jednego z plików.");
    renderCompletePicture();
  });
}

async function loadSourceFiles(files) {
  const supportedFiles = files.filter(isSupportedFile);
  const skipped = files.length - supportedFiles.length;
  const loadedAssets = [];

  for (const file of supportedFiles) {
    loadedAssets.push(await createCompletePictureAsset(file));
  }

  completePictureState.assets = completePictureState.assets.concat(loadedAssets);
  if (loadedAssets.length) setActiveAsset(loadedAssets[0].id);
  completePictureState.error = skipped ? "Pominięto " + skipped + " plik(ów) bez obsługi. Wczytaj SVG lub PNG." : "";

  const fileInput = document.getElementById("completePictureFile");
  if (fileInput) fileInput.value = "";
  updateFileName();
  renderAssetList();
  renderCompletePicture();
}

async function createCompletePictureAsset(file) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const isSvg = isSvgFile(file);
    const svgText = isSvg ? await file.text() : "";
    return {
      id: completePictureState.nextAssetId++,
      fileName: file.name,
      type: isSvg ? "SVG asset" : "Black & White PNG",
      file: file,
      objectUrl: sourceUrl,
      image: image,
      isSvg: isSvg,
      svgText: svgText,
      viewBoxInfo: isSvg ? getSvgViewBoxInfo(svgText) : null,
      settings: createDefaultCompletePictureSettings()
    };
  } catch (error) {
    URL.revokeObjectURL(sourceUrl);
    throw error;
  }
}

function isSupportedFile(file) {
  const name = file.name.toLowerCase();
  return isSvgFile(file) || file.type === "image/png" || name.endsWith(".png");
}

function isSvgFile(file) {
  return file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
}

function loadImage(url) {
  return new Promise(function (resolve, reject) {
    const image = new Image();
    image.onload = function () { resolve(image); };
    image.onerror = reject;
    image.src = url;
  });
}

function fileToDataUrl(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      resolve(String(reader.result || ""));
    };
    reader.onerror = function () {
      reject(reader.error || new Error("Nie udało się odczytać źródła PNG."));
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || "").split(",");
  if (parts.length < 2) return new Blob([], { type: "image/png" });
  const match = parts[0].match(/data:([^;]+);base64/i);
  const mimeType = match ? match[1] : "image/png";
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function createDefaultCompletePictureSettings() {
  return {
    splitMode: "left-dotted-right-normal",
    scale: 200,
    offsetX: 0,
    offsetY: 0,
    normalStrokeWidth: 8,
    dottedStrokeWidth: 6,
    dashLength: 2,
    dashGap: 14,
    removeOuterFrame: true,
    pngSettings: {
      threshold: 120,
      ghostOpacity: 20,
      patternSize: 6,
      patternGap: 10
    },
    guideLine: {
      visible: true,
      width: 3,
      style: "solid",
      dash: 10,
      gap: 10,
      opacity: 100,
      offset: 0
    },
    thumbnailSettings: {
      visible: true,
      autoFit: true,
      scale: 100,
      offsetX: 0,
      offsetY: 0,
      anchor: "top-center",
      frame: true
    },
    exportSettings: {
      fileName: "complete-the-picture-page.png",
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT
    }
  };
}

function ensureSettingsShape(settings) {
  const defaults = createDefaultCompletePictureSettings();
  if (!settings.pngSettings) settings.pngSettings = Object.assign({}, defaults.pngSettings);
  if (!settings.guideLine) settings.guideLine = Object.assign({}, defaults.guideLine);
  if (!settings.thumbnailSettings) settings.thumbnailSettings = Object.assign({}, defaults.thumbnailSettings);
  if (!settings.exportSettings) settings.exportSettings = Object.assign({}, defaults.exportSettings);
  return settings;
}

function getSettings() {
  const activeAsset = getActiveAsset();
  return activeAsset ? ensureSettingsShape(activeAsset.settings) : readSettingsFromControls();
}

function readSettingsFromControls() {
  return {
    splitMode: getValue("completePictureSplitMode", "left-dotted-right-normal"),
    scale: getNumber("completePictureScale", 200),
    offsetX: getNumber("completePictureOffsetX", 0),
    offsetY: getNumber("completePictureOffsetY", 0),
    normalStrokeWidth: getNumber("completePictureNormalStrokeWidth", 8),
    dottedStrokeWidth: getNumber("completePictureDottedStrokeWidth", 6),
    dashLength: getNumber("completePictureDashLength", 2),
    dashGap: getNumber("completePictureDashGap", 14),
    removeOuterFrame: getChecked("completePictureRemoveOuterFrame", true),
    pngSettings: getPngSettings(),
    guideLine: getGuideLineSettings(),
    thumbnailSettings: getThumbnailSettings()
  };
}

function saveActiveSettingsFromControls() {
  const activeAsset = getActiveAsset();
  if (!activeAsset) return;
  activeAsset.settings = Object.assign({}, readSettingsFromControls(), {
    exportSettings: activeAsset.settings.exportSettings || createDefaultCompletePictureSettings().exportSettings
  });
}

function updateSourceModeControls(preferredSplitMode) {
  const activeAsset = getActiveAsset();
  const sourceMode = document.getElementById("completePictureSourceMode");
  const pngSettings = document.getElementById("completePicturePngSettings");
  const svgSettings = document.getElementById("completePictureSvgSettings");
  const splitLabel = document.getElementById("completePictureSplitModeLabel");
  const fileInput = document.getElementById("completePictureFile");
  const isPng = activeAsset ? !activeAsset.isSvg : sourceMode && sourceMode.value === "png";
  const uploadModeIsPng = sourceMode && sourceMode.value === "png";

  if (pngSettings) pngSettings.hidden = !isPng;
  if (svgSettings) svgSettings.hidden = isPng;
  if (splitLabel) splitLabel.textContent = isPng ? "Podział PNG" : "Podział SVG";
  if (fileInput) fileInput.accept = uploadModeIsPng ? "image/png,.png" : "image/svg+xml,image/png,.svg,.png";
  updateSourceModeHelp(uploadModeIsPng);
  updateSplitModeOptions(isPng, preferredSplitMode);
}

function updateSourceModeHelp(isPngUploadMode) {
  const node = document.getElementById("completePictureSourceHelp");
  if (!node) return;
  node.textContent = isPngUploadMode
    ? "Black & White PNG: najlepiej używać czarno-białego PNG z wyraźnym kontrastem."
    : "SVG asset: najlepszy do pełnej kontroli linii, kropek i usuwania ramki.";
}

function updateSplitModeOptions(isPng, preferredSplitMode) {
  const select = document.getElementById("completePictureSplitMode");
  if (!select) return;

  const currentValue = preferredSplitMode || select.value;
  const options = isPng ? PNG_SPLIT_OPTIONS : SVG_SPLIT_OPTIONS;
  const hasCurrentValue = options.some(function (option) {
    return option[0] === currentValue;
  });

  select.replaceChildren();
  options.forEach(function (option) {
    const item = document.createElement("option");
    item.value = option[0];
    item.textContent = option[1];
    select.appendChild(item);
  });
  select.value = hasCurrentValue ? currentValue : options[0][0];
}

function getActiveAsset() {
  return completePictureState.assets.find(function (asset) {
    return asset.id === completePictureState.activeAssetId;
  }) || null;
}

function getGuideLineSettings() {
  return {
    visible: getChecked("completePictureGuideVisible", true),
    width: getNumber("completePictureGuideWidth", 3),
    style: getValue("completePictureGuideStyle", "solid"),
    dash: getNumber("completePictureGuideDash", 10),
    gap: getNumber("completePictureGuideGap", 10),
    opacity: getNumber("completePictureGuideOpacity", 100),
    offset: getNumber("completePictureGuideOffset", 0)
  };
}

function getPngSettings() {
  return {
    threshold: getNumber("completePicturePngThreshold", 120),
    ghostOpacity: getNumber("completePicturePngGhostOpacity", 20),
    patternSize: getNumber("completePicturePngPatternSize", 6),
    patternGap: getNumber("completePicturePngPatternGap", 10)
  };
}

function getThumbnailSettings() {
  return {
    visible: getChecked("completePictureThumbVisible", true),
    autoFit: getChecked("completePictureThumbAutoFit", true),
    scale: getNumber("completePictureThumbScale", 100),
    offsetX: getNumber("completePictureThumbOffsetX", 0),
    offsetY: getNumber("completePictureThumbOffsetY", 0),
    anchor: getValue("completePictureThumbAnchor", "top-center"),
    frame: getChecked("completePictureThumbFrame", true)
  };
}

function getValue(id, fallback) {
  const field = document.getElementById(id);
  return field ? field.value : fallback;
}

function getNumber(id, fallback) {
  const field = document.getElementById(id);
  const value = field ? Number(field.value) : fallback;
  if (!field || !Number.isFinite(value)) return fallback;
  const min = field.min === "" ? -Infinity : Number(field.min);
  const max = field.max === "" ? Infinity : Number(field.max);
  return clampValue(value, min, max);
}

function getChecked(id, fallback) {
  const field = document.getElementById(id);
  return field ? field.checked : fallback;
}

function applySettingsToControls(settings) {
  ensureSettingsShape(settings);
  updateSourceModeControls(settings.splitMode);
  setValue("completePictureSplitMode", settings.splitMode);
  setValue("completePictureScale", settings.scale);
  setValue("completePictureOffsetX", settings.offsetX);
  setValue("completePictureOffsetY", settings.offsetY);
  setValue("completePictureNormalStrokeWidth", settings.normalStrokeWidth);
  setValue("completePictureDottedStrokeWidth", settings.dottedStrokeWidth);
  setValue("completePictureDashLength", settings.dashLength);
  setValue("completePictureDashGap", settings.dashGap);
  setChecked("completePictureRemoveOuterFrame", settings.removeOuterFrame);
  setValue("completePicturePngThreshold", settings.pngSettings.threshold);
  setValue("completePicturePngGhostOpacity", settings.pngSettings.ghostOpacity);
  setValue("completePicturePngPatternSize", settings.pngSettings.patternSize);
  setValue("completePicturePngPatternGap", settings.pngSettings.patternGap);
  setChecked("completePictureGuideVisible", settings.guideLine.visible);
  setValue("completePictureGuideWidth", settings.guideLine.width);
  setValue("completePictureGuideStyle", settings.guideLine.style);
  setValue("completePictureGuideDash", settings.guideLine.dash);
  setValue("completePictureGuideGap", settings.guideLine.gap);
  setValue("completePictureGuideOpacity", settings.guideLine.opacity);
  setValue("completePictureGuideOffset", settings.guideLine.offset);
  setChecked("completePictureThumbVisible", settings.thumbnailSettings.visible);
  setChecked("completePictureThumbAutoFit", settings.thumbnailSettings.autoFit);
  setValue("completePictureThumbScale", settings.thumbnailSettings.scale);
  setValue("completePictureThumbOffsetX", settings.thumbnailSettings.offsetX);
  setValue("completePictureThumbOffsetY", settings.thumbnailSettings.offsetY);
  setValue("completePictureThumbAnchor", settings.thumbnailSettings.anchor);
  setChecked("completePictureThumbFrame", settings.thumbnailSettings.frame);
  updateCompletePictureControlValues();
}

function updateCompletePictureControlValues() {
  setOutput("completePictureScaleValue", getNumber("completePictureScale", 200) + "%");
  setOutput("completePictureOffsetXValue", getNumber("completePictureOffsetX", 0) + " px");
  setOutput("completePictureOffsetYValue", getNumber("completePictureOffsetY", 0) + " px");
  setOutput("completePictureNormalStrokeWidthValue", getNumber("completePictureNormalStrokeWidth", 8) + " px");
  setOutput("completePictureDottedStrokeWidthValue", getNumber("completePictureDottedStrokeWidth", 6) + " px");
  setOutput("completePictureDashLengthValue", getNumber("completePictureDashLength", 2));
  setOutput("completePictureDashGapValue", getNumber("completePictureDashGap", 14));
  setOutput("completePicturePngThresholdValue", getNumber("completePicturePngThreshold", 120));
  setOutput("completePicturePngGhostOpacityValue", getNumber("completePicturePngGhostOpacity", 20) + "%");
  setOutput("completePicturePngPatternSizeValue", getNumber("completePicturePngPatternSize", 6) + " px");
  setOutput("completePicturePngPatternGapValue", getNumber("completePicturePngPatternGap", 10) + " px");
  setOutput("completePictureGuideWidthValue", getNumber("completePictureGuideWidth", 3) + " px");
  setOutput("completePictureGuideDashValue", getNumber("completePictureGuideDash", 10) + " px");
  setOutput("completePictureGuideGapValue", getNumber("completePictureGuideGap", 10) + " px");
  setOutput("completePictureGuideOpacityValue", getNumber("completePictureGuideOpacity", 100) + "%");
  setOutput("completePictureGuideOffsetValue", getNumber("completePictureGuideOffset", 0) + " px");
  setOutput("completePictureThumbScaleValue", getNumber("completePictureThumbScale", 100) + "%");
  setOutput("completePictureThumbOffsetXValue", getNumber("completePictureThumbOffsetX", 0) + " px");
  setOutput("completePictureThumbOffsetYValue", getNumber("completePictureThumbOffsetY", 0) + " px");
  syncAllNumberInputs();
}

function syncAllNumberInputs() {
  [
    ["completePictureScale", "completePictureScaleNumber"],
    ["completePictureOffsetX", "completePictureOffsetXNumber"],
    ["completePictureOffsetY", "completePictureOffsetYNumber"],
    ["completePictureNormalStrokeWidth", "completePictureNormalStrokeWidthNumber"],
    ["completePictureDottedStrokeWidth", "completePictureDottedStrokeWidthNumber"],
    ["completePictureDashLength", "completePictureDashLengthNumber"],
    ["completePictureDashGap", "completePictureDashGapNumber"],
    ["completePicturePngThreshold", "completePicturePngThresholdNumber"],
    ["completePicturePngGhostOpacity", "completePicturePngGhostOpacityNumber"],
    ["completePicturePngPatternSize", "completePicturePngPatternSizeNumber"],
    ["completePicturePngPatternGap", "completePicturePngPatternGapNumber"],
    ["completePictureGuideWidth", "completePictureGuideWidthNumber"],
    ["completePictureGuideDash", "completePictureGuideDashNumber"],
    ["completePictureGuideGap", "completePictureGuideGapNumber"],
    ["completePictureGuideOpacity", "completePictureGuideOpacityNumber"],
    ["completePictureGuideOffset", "completePictureGuideOffsetNumber"],
    ["completePictureThumbScale", "completePictureThumbScaleNumber"],
    ["completePictureThumbOffsetX", "completePictureThumbOffsetXNumber"],
    ["completePictureThumbOffsetY", "completePictureThumbOffsetYNumber"]
  ].forEach(function (pair) {
    const range = document.getElementById(pair[0]);
    const number = document.getElementById(pair[1]);
    if (range && number && document.activeElement !== number) number.value = range.value;
  });
}

function setOutput(id, value) {
  const output = document.getElementById(id);
  if (output) output.textContent = value;
}

function renderCompletePicture() {
  const preview = document.getElementById("completePicturePreview");
  if (!preview) return;
  const activeAsset = getActiveAsset();

  revokeRenderUrls();
  preview.replaceChildren();
  updateCompletePictureUiState();

  const artboard = document.createElement("div");
  artboard.className = "complete-picture-artboard";

  if (!activeAsset) {
    artboard.classList.add("is-empty");
    artboard.appendChild(createPlaceholder());
    preview.appendChild(artboard);
    updateMessage();
    return;
  }

  const settings = getSettings();
  artboard.appendChild(createInstruction());
  const thumbnail = createThumbnail(activeAsset, settings.thumbnailSettings);
  if (thumbnail) artboard.appendChild(thumbnail);
  artboard.appendChild(createDrawingArea(activeAsset, settings));
  preview.appendChild(artboard);
  updateMessage();
}

function createInstruction() {
  const instruction = document.createElement("p");
  instruction.className = "complete-picture-page-instruction";
  instruction.textContent = "Complete the missing half of the picture.";
  return instruction;
}

function createThumbnail(asset, thumbnailSettings) {
  if (!thumbnailSettings.visible) return null;

  const thumbnail = document.createElement("div");
  thumbnail.className = "complete-picture-thumbnail";
  const layout = getPreviewThumbnailLayout(thumbnailSettings);
  if (!thumbnailSettings.frame) thumbnail.classList.add("is-frameless");
  thumbnail.style.left = layout.x;
  thumbnail.style.top = layout.y;
  thumbnail.style.width = layout.width;
  thumbnail.style.height = layout.height;
  thumbnail.style.transform = layout.transform;

  const image = document.createElement("img");
  image.className = "complete-picture-thumbnail-image";
  image.src = asset.objectUrl;
  image.alt = "Miniatura pełnego obrazka";
  image.style.setProperty("--thumb-scale", getEffectiveThumbnailScale(thumbnailSettings));
  thumbnail.appendChild(image);
  return thumbnail;
}

function getPreviewThumbnailLayout(thumbnailSettings) {
  let x = "50%";
  let transformX = "-50%";

  if (thumbnailSettings.anchor === "top-left") {
    x = "7%";
    transformX = "0";
  }
  if (thumbnailSettings.anchor === "top-right") {
    x = "93%";
    transformX = "-100%";
  }

  return {
    x: x,
    y: "16%",
    width: "34%",
    height: "10.5%",
    transform: "translate(" + transformX + ", 0) translate(" + thumbnailSettings.offsetX + "px, " + thumbnailSettings.offsetY + "px)"
  };
}

function getEffectiveThumbnailScale(thumbnailSettings) {
  return thumbnailSettings.autoFit ? thumbnailSettings.scale / 100 : thumbnailSettings.scale / 100;
}

function createDrawingArea(asset, settings) {
  const area = document.createElement("div");
  area.className = "complete-picture-drawing-area";
  area.style.setProperty("--image-scale", settings.scale / 100);
  area.style.setProperty("--image-offset-x", settings.offsetX + "px");
  area.style.setProperty("--image-offset-y", settings.offsetY + "px");
  area.style.setProperty("--divider-width", "2px");

  const image = document.createElement("img");
  image.className = "complete-picture-artwork";
  image.src = getLayeredRenderUrl(asset, settings);
  image.alt = asset.fileName || "Wczytany obrazek";
  area.appendChild(image);

  const guideLine = createGuideLineOverlay(settings);
  if (guideLine) area.appendChild(guideLine);
  return area;
}

function createGuideLineOverlay(settings) {
  const guide = settings.guideLine;
  if (!guide.visible) return null;

  const split = getSplitConfig(settings.splitMode);
  const overlay = document.createElement("div");
  const lineHost = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  const isHorizontal = split.axis === "horizontal";

  overlay.className = "complete-picture-guide-overlay";
  overlay.setAttribute("aria-hidden", "true");

  lineHost.className = isHorizontal ? "complete-picture-guide-line is-horizontal" : "complete-picture-guide-line";
  lineHost.style.opacity = String(guide.opacity / 100);

  svg.setAttribute("focusable", "false");
  line.setAttribute("vector-effect", "non-scaling-stroke");
  line.setAttribute("stroke", "#111827");
  line.setAttribute("stroke-width", String(guide.width));
  line.setAttribute("stroke-linecap", guide.style === "dashed" ? "butt" : "round");

  if (isHorizontal) {
    lineHost.style.height = guide.width + "px";
    lineHost.style.top = "clamp(0px, calc(50% + " + guide.offset + "px), 100%)";
    line.setAttribute("x1", "0%");
    line.setAttribute("x2", "100%");
    line.setAttribute("y1", "50%");
    line.setAttribute("y2", "50%");
  } else {
    lineHost.style.width = guide.width + "px";
    lineHost.style.left = "clamp(0px, calc(50% + " + guide.offset + "px), 100%)";
    line.setAttribute("x1", "50%");
    line.setAttribute("x2", "50%");
    line.setAttribute("y1", "0%");
    line.setAttribute("y2", "100%");
  }

  if (guide.style !== "solid") {
    line.setAttribute("stroke-dasharray", guide.dash + " " + guide.gap);
  }

  svg.appendChild(line);
  lineHost.appendChild(svg);
  overlay.appendChild(lineHost);
  return overlay;
}

function getLayeredRenderUrl(asset, settings) {
  if (!asset.isSvg) {
    return createBlackWhitePngRenderUrl(asset, settings);
  }

  const svg = createLayeredSvgText(asset, settings);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  completePictureState.renderUrls.push(url);
  return url;
}

function createBlackWhitePngRenderUrl(asset, settings) {
  const canvas = renderBlackWhitePngCanvas(asset.image, settings);
  const url = canvas.toDataURL("image/png");
  return url;
}

function renderBlackWhitePngCanvas(image, settings) {
  const canvas = document.createElement("canvas");
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  canvas.width = width;
  canvas.height = height;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(image, 0, 0, width, height);

  const outputCtx = canvas.getContext("2d");
  const imageData = sourceCtx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const split = getSplitConfig(settings.splitMode);
  const png = settings.pngSettings || createDefaultCompletePictureSettings().pngSettings;
  const threshold = png.threshold;
  const ghostAlpha = clampValue(png.ghostOpacity, 5, 60) / 100;
  const ghostValue = Math.round(255 * (1 - ghostAlpha));

  outputCtx.fillStyle = "#ffffff";
  outputCtx.fillRect(0, 0, width, height);

  const output = outputCtx.createImageData(width, height);
  const outputData = output.data;
  for (let index = 0; index < outputData.length; index += 4) {
    outputData[index] = 255;
    outputData[index + 1] = 255;
    outputData[index + 2] = 255;
    outputData[index + 3] = 255;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] / 255;
      if (alpha <= 0) continue;

      const luminance = (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114) * alpha + 255 * (1 - alpha);
      if (luminance >= threshold) continue;

      const zone = getRasterZoneStyle(x, y, width, height, split);
      if (zone === "none") continue;
      if (zone === "dotted" && !isPngDottedPixel(x, y, png.patternSize, png.patternGap)) continue;

      if (zone === "ghost") {
        outputData[index] = ghostValue;
        outputData[index + 1] = ghostValue;
        outputData[index + 2] = ghostValue;
      } else {
        outputData[index] = 17;
        outputData[index + 1] = 24;
        outputData[index + 2] = 39;
      }
    }
  }

  outputCtx.putImageData(output, 0, 0);
  return canvas;
}

function getRasterZoneStyle(x, y, width, height, split) {
  if (split.normalSide === "all") return "normal";
  const side = getRasterPointSide(x, y, width, height, split.axis);
  if (side === split.normalSide) return "normal";
  if (side === split.dottedSide) return "dotted";
  if (side === split.ghostSide) return "ghost";
  return "none";
}

function getRasterPointSide(x, y, width, height, axis) {
  if (axis === "horizontal") return y < height / 2 ? "top" : "bottom";
  return x < width / 2 ? "left" : "right";
}

function isPngDottedPixel(x, y, size, gap) {
  const dotSize = Math.max(1, Math.round(size));
  const spacing = dotSize + Math.max(1, Math.round(gap));
  const localX = x % spacing;
  const localY = y % spacing;
  const radius = dotSize / 2;
  const center = radius;
  const dx = localX - center;
  const dy = localY - center;
  return localX <= dotSize && localY <= dotSize && dx * dx + dy * dy <= radius * radius;
}

function createLayeredSvgText(asset, settings) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(asset.svgText, "image/svg+xml");
  const sourceSvg = doc.documentElement;
  if (sourceSvg.nodeName.toLowerCase() !== "svg" || sourceSvg.querySelector("parsererror")) {
    throw new Error("Nieprawidłowy plik SVG.");
  }

  const geometry = getSvgGeometry(sourceSvg);
  if (settings.removeOuterFrame) {
    removeOuterSvgFrameRects(sourceSvg, geometry);
  }
  const normalizedStroke = getNormalizedSvgStrokeSettings(settings, geometry);
  const split = getSplitConfig(settings.splitMode);
  const normalRect = getRectForSide(split.normalSide, geometry);
  const dottedRect = getRectForSide(split.dottedSide, geometry);
  const content = Array.from(sourceSvg.childNodes).map(function (node) {
    return new XMLSerializer().serializeToString(node);
  }).join("");

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + geometry.width + '" height="' + geometry.height + '" viewBox="' + geometry.viewBox + '">',
    "<defs>",
    createClipPathMarkup("normalClip", normalRect),
    createClipPathMarkup("dottedClip", dottedRect),
    "<style>",
    ".normal-layer * { fill: none !important; stroke: #111827 !important; stroke-width: " + normalizedStroke.normalStrokeWidth + " !important; stroke-dasharray: none !important; stroke-linecap: round !important; stroke-linejoin: round !important; }",
    ".dotted-layer * { fill: none !important; stroke: #6b7280 !important; stroke-width: " + normalizedStroke.dottedStrokeWidth + " !important; stroke-dasharray: " + normalizedStroke.dashLength + " " + normalizedStroke.dashGap + " !important; stroke-linecap: round !important; stroke-linejoin: round !important; }",
    "</style>",
    "</defs>",
    '<g class="dotted-layer" clip-path="url(#dottedClip)">',
    content,
    "</g>",
    '<g class="normal-layer" clip-path="url(#normalClip)">',
    content,
    "</g>",
    "</svg>"
  ].join("");
}

function removeOuterSvgFrameRects(sourceSvg, geometry) {
  Array.from(sourceSvg.querySelectorAll("rect")).forEach(function (rect) {
    if (isSvgUtilityElement(rect)) return;
    if (!isOuterSvgFrameRect(rect, geometry)) return;
    rect.remove();
  });
}

function isSvgUtilityElement(node) {
  return Boolean(node.closest("defs, clipPath, mask, pattern, symbol"));
}

function isOuterSvgFrameRect(rect, geometry) {
  const x = getSvgNumericAttribute(rect, "x", geometry.minX);
  const y = getSvgNumericAttribute(rect, "y", geometry.minY);
  const width = getSvgNumericAttribute(rect, "width", NaN);
  const height = getSvgNumericAttribute(rect, "height", NaN);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;

  const toleranceX = geometry.width * 0.035;
  const toleranceY = geometry.height * 0.035;
  const coversWidth = Math.abs(x - geometry.minX) <= toleranceX && Math.abs(width - geometry.width) <= toleranceX;
  const coversHeight = Math.abs(y - geometry.minY) <= toleranceY && Math.abs(height - geometry.height) <= toleranceY;
  if (!coversWidth || !coversHeight) return false;

  const fill = getSvgPaintValue(rect, "fill");
  const stroke = getSvgPaintValue(rect, "stroke");
  const hasTransparentFill = fill === "" || fill === "none" || fill === "transparent" || fill === "rgba(0,0,0,0)";
  const hasVisibleStroke = stroke !== "" && stroke !== "none" && stroke !== "transparent";
  return hasTransparentFill && hasVisibleStroke;
}

function getSvgNumericAttribute(node, name, fallback) {
  const value = parseFloat(node.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
}

function getSvgPaintValue(node, property) {
  const attribute = node.getAttribute(property);
  if (attribute) return attribute.trim().toLowerCase().replace(/\s+/g, "");

  const style = node.getAttribute("style") || "";
  const match = style.match(new RegExp(property + "\\s*:\\s*([^;]+)", "i"));
  return match ? match[1].trim().toLowerCase().replace(/\s+/g, "") : "";
}

function getSvgViewBoxInfo(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const sourceSvg = doc.documentElement;
  if (!sourceSvg || sourceSvg.nodeName.toLowerCase() !== "svg" || sourceSvg.querySelector("parsererror")) {
    return null;
  }

  const geometry = getSvgGeometry(sourceSvg);
  const maxDimension = Math.max(geometry.width, geometry.height);
  return {
    minX: geometry.minX,
    minY: geometry.minY,
    width: geometry.width,
    height: geometry.height,
    maxDimension: maxDimension,
    viewBox: geometry.viewBox,
    isSmallIconViewBox: maxDimension <= 100
  };
}

function getSvgGeometry(sourceSvg) {
  const viewBox = sourceSvg.getAttribute("viewBox");
  if (viewBox) {
    const values = viewBox.trim().split(/[\s,]+/).map(Number);
    if (values.length === 4 && values.every(Number.isFinite)) {
      return {
        minX: values[0],
        minY: values[1],
        width: values[2],
        height: values[3],
        viewBox: values.map(formatSvgNumber).join(" ")
      };
    }
  }
  const width = parseFloat(sourceSvg.getAttribute("width")) || 1024;
  const height = parseFloat(sourceSvg.getAttribute("height")) || 1024;
  return { minX: 0, minY: 0, width: width, height: height, viewBox: "0 0 " + width + " " + height };
}

function getNormalizedSvgStrokeSettings(settings, geometry) {
  const scale = getSvgViewBoxScale(geometry);
  return {
    normalStrokeWidth: formatSvgNumber(settings.normalStrokeWidth * scale),
    dottedStrokeWidth: formatSvgNumber(settings.dottedStrokeWidth * scale),
    dashLength: formatSvgNumber(settings.dashLength * scale),
    dashGap: formatSvgNumber(settings.dashGap * scale)
  };
}

function getSvgViewBoxScale(geometry) {
  const maxDimension = Math.max(geometry.width, geometry.height);
  return Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension / SVG_STROKE_NORMALIZATION_BASE : 1;
}

function formatSvgNumber(value) {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 10000) / 10000);
}

function getSplitConfig(mode) {
  if (mode === "normal") return { axis: "vertical", normalSide: "all", dottedSide: "none", ghostSide: "none" };
  if (mode === "left-normal-right-dotted") return { axis: "vertical", normalSide: "left", dottedSide: "right", ghostSide: "none" };
  if (mode === "top-dotted-bottom-normal") return { axis: "horizontal", normalSide: "bottom", dottedSide: "top", ghostSide: "none" };
  if (mode === "top-normal-bottom-dotted") return { axis: "horizontal", normalSide: "top", dottedSide: "bottom", ghostSide: "none" };
  if (mode === "left-normal-right-ghost") return { axis: "vertical", normalSide: "left", dottedSide: "none", ghostSide: "right" };
  if (mode === "left-ghost-right-normal") return { axis: "vertical", normalSide: "right", dottedSide: "none", ghostSide: "left" };
  if (mode === "top-normal-bottom-ghost") return { axis: "horizontal", normalSide: "top", dottedSide: "none", ghostSide: "bottom" };
  if (mode === "top-ghost-bottom-normal") return { axis: "horizontal", normalSide: "bottom", dottedSide: "none", ghostSide: "top" };
  return { axis: "vertical", normalSide: "right", dottedSide: "left", ghostSide: "none" };
}

function getRectForSide(side, geometry) {
  const halfWidth = geometry.width / 2;
  const halfHeight = geometry.height / 2;
  if (side === "all") return { x: geometry.minX, y: geometry.minY, width: geometry.width, height: geometry.height };
  if (side === "none") return { x: geometry.minX, y: geometry.minY, width: 0, height: 0 };
  if (side === "left") return { x: geometry.minX, y: geometry.minY, width: halfWidth, height: geometry.height };
  if (side === "right") return { x: geometry.minX + halfWidth, y: geometry.minY, width: halfWidth, height: geometry.height };
  if (side === "top") return { x: geometry.minX, y: geometry.minY, width: geometry.width, height: halfHeight };
  return { x: geometry.minX, y: geometry.minY + halfHeight, width: geometry.width, height: halfHeight };
}

function createClipPathMarkup(id, rect) {
  return '<clipPath id="' + id + '" clipPathUnits="userSpaceOnUse"><rect x="' + rect.x + '" y="' + rect.y + '" width="' + rect.width + '" height="' + rect.height + '"/></clipPath>';
}

function createPlaceholder() {
  const placeholder = document.createElement("div");
  placeholder.className = "complete-picture-upload-placeholder";
  placeholder.innerHTML = "<strong>Podgląd strony 8.5 x 11</strong><span>Wczytaj SVG lub czarno-biały PNG, aby rozpocząć.</span>";
  return placeholder;
}

async function renderExportCanvas(assetOverride) {
  const activeAsset = assetOverride || getActiveAsset();
  if (!activeAsset) throw new Error("Brak aktywnego pliku do eksportu.");

  const settings = assetOverride ? ensureSettingsShape(activeAsset.settings) : getSettings();
  const canvas = document.createElement("canvas");
  canvas.width = settings.exportSettings && settings.exportSettings.width ? settings.exportSettings.width : EXPORT_WIDTH;
  canvas.height = settings.exportSettings && settings.exportSettings.height ? settings.exportSettings.height : EXPORT_HEIGHT;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawInstruction(ctx);

  const thumbnail = await loadImage(activeAsset.objectUrl);
  const layered = await loadImage(getLayeredRenderUrl(activeAsset, settings));
  drawExportThumbnail(ctx, thumbnail, settings.thumbnailSettings);

  const area = { x: 300, y: 850, width: 1950, height: 2100 };
  drawContained(ctx, layered, area.x, area.y, area.width, area.height, settings.scale / 100, settings.offsetX * 3, settings.offsetY * 3);
  drawExportGuideLine(ctx, area, settings);

  return canvas;
}

function canvasToPngBlob(canvas) {
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(blob);
      else reject(new Error("Problem z utworzeniem PNG."));
    }, "image/png");
  });
}

function canvasToPngDataUrl(canvas) {
  return canvas.toDataURL("image/png");
}

function drawExportThumbnail(ctx, image, thumbnailSettings) {
  if (!thumbnailSettings.visible) return;

  const rect = getExportThumbnailRect(thumbnailSettings);
  if (thumbnailSettings.frame) {
    drawBox(ctx, rect.x, rect.y, rect.width, rect.height);
  }
  drawContained(ctx, image, rect.x, rect.y, rect.width, rect.height, getEffectiveThumbnailScale(thumbnailSettings), 0, 0);
}

function getExportThumbnailRect(thumbnailSettings) {
  const width = 660;
  const height = 360;
  const marginX = 300;
  const baseY = 350;
  let x = 945;

  if (thumbnailSettings.anchor === "top-left") x = marginX;
  if (thumbnailSettings.anchor === "top-right") x = EXPORT_WIDTH - marginX - width;

  return {
    x: x + thumbnailSettings.offsetX * 3,
    y: baseY + thumbnailSettings.offsetY * 3,
    width: width,
    height: height
  };
}

function drawInstruction(ctx) {
  ctx.fillStyle = "#111827";
  ctx.font = "700 72px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Complete the missing half of the picture.", EXPORT_WIDTH / 2, 230);
}

function drawBox(ctx, x, y, width, height) {
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, width, height);
}

function drawContained(ctx, image, x, y, width, height, scale, offsetX, offsetY) {
  const fit = Math.min(width / image.naturalWidth, height / image.naturalHeight) * 0.82 * scale;
  const drawWidth = image.naturalWidth * fit;
  const drawHeight = image.naturalHeight * fit;
  ctx.drawImage(image, x + width / 2 - drawWidth / 2 + offsetX, y + height / 2 - drawHeight / 2 + offsetY, drawWidth, drawHeight);
}

function drawExportGuideLine(ctx, area, settings) {
  const guide = settings.guideLine;
  if (!guide.visible) return;

  const split = getSplitConfig(settings.splitMode);
  const scaledOffset = guide.offset * 3;
  const dash = guide.dash * 3;
  const gap = guide.gap * 3;

  ctx.save();
  ctx.strokeStyle = "#111827";
  ctx.globalAlpha = guide.opacity / 100;
  ctx.lineWidth = guide.width * 3;
  ctx.lineCap = guide.style === "dashed" ? "butt" : "round";
  ctx.setLineDash(guide.style === "solid" ? [] : [dash, gap]);
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.width, area.height);
  ctx.clip();
  ctx.beginPath();
  if (split.axis === "horizontal") {
    const y = clampValue(area.y + area.height / 2 + scaledOffset, area.y, area.y + area.height);
    ctx.moveTo(area.x, y);
    ctx.lineTo(area.x + area.width, y);
  } else {
    const x = clampValue(area.x + area.width / 2 + scaledOffset, area.x, area.x + area.width);
    ctx.moveTo(x, area.y);
    ctx.lineTo(x, area.y + area.height);
  }
  ctx.stroke();
  ctx.restore();
}

async function exportCompletePicturePng() {
  try {
    const canvas = await renderExportCanvas();
    canvas.toBlob(function (blob) {
      if (!blob) {
        setError("Problem z eksportem PNG.");
        updateMessage();
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const activeAsset = getActiveAsset();
      link.download = getExportFileName(activeAsset);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Wyeksportowano PNG 300 DPI: 2550 x 3300 px.");
    }, "image/png");
  } catch (error) {
    console.error(error);
    setError(error.message || "Problem z eksportem PNG.");
    updateMessage();
  }
}

function getExportFileName(asset) {
  if (!asset) return "complete-the-picture-page.png";
  const baseName = asset.fileName.replace(/\.[^.]+$/, "").trim() || "complete-the-picture-page";
  return baseName + "-active-300dpi.png";
}

function resetCompletePictureSettings() {
  const activeAsset = getActiveAsset();
  const settings = createDefaultCompletePictureSettings();
  if (activeAsset) activeAsset.settings = settings;
  applySettingsToControls(settings);
  completePictureState.error = "";
  renderCompletePicture();
}

function setValue(id, value) {
  const field = document.getElementById(id);
  if (field) field.value = value;
}

function setChecked(id, checked) {
  const field = document.getElementById(id);
  if (field) field.checked = checked;
}

function setActiveAsset(assetId) {
  const asset = completePictureState.assets.find(function (item) {
    return item.id === assetId;
  });
  if (!asset) return;

  saveActiveSettingsFromControls();
  completePictureState.activeAssetId = asset.id;
  completePictureState.error = "";
  applySettingsToControls(asset.settings);
  updateFileName();
  renderAssetList();
  setMessage("Aktywny plik zmieniony: " + asset.fileName + ".");
  renderCompletePicture();
}

function removeCompletePictureAsset(assetId) {
  const index = completePictureState.assets.findIndex(function (asset) {
    return asset.id === assetId;
  });
  if (index === -1) return;

  const removed = completePictureState.assets[index];
  URL.revokeObjectURL(removed.objectUrl);
  completePictureState.assets.splice(index, 1);
  completePictureState.selectedBasketAssetIds.delete(assetId);

  if (completePictureState.activeAssetId === assetId) {
    const nextAsset = completePictureState.assets[index] || completePictureState.assets[index - 1] || null;
    completePictureState.activeAssetId = nextAsset ? nextAsset.id : null;
    applySettingsToControls(nextAsset ? nextAsset.settings : createDefaultCompletePictureSettings());
  }

  completePictureState.error = "";
  updateFileName();
  renderAssetList();
  setMessage(completePictureState.assets.length ? "Plik usunięty. Lista została zaktualizowana." : "Plik usunięty. Brak aktywnego pliku.");
  renderCompletePicture();
}

function renderAssetList() {
  const list = document.getElementById("completePictureAssetList");
  if (!list) return;

  list.replaceChildren();
  if (!completePictureState.assets.length) {
    const empty = document.createElement("p");
    empty.className = "complete-picture-asset-empty";
    empty.textContent = "Brak załadowanych plików. Wybierz jeden lub wiele SVG albo PNG z komputera.";
    list.appendChild(empty);
    return;
  }

  completePictureState.assets.forEach(function (asset, index) {
    list.appendChild(createAssetListItem(asset, index));
  });
}

function createAssetListItem(asset, index) {
  const item = document.createElement("div");
  item.className = "complete-picture-asset-item";
  if (asset.id === completePictureState.activeAssetId) item.classList.add("is-active");

  const number = document.createElement("span");
  number.className = "complete-picture-asset-number";
  number.textContent = String(index + 1);

  const selectLabel = document.createElement("label");
  selectLabel.className = "complete-picture-asset-select";
  selectLabel.title = "Zaznacz do dodania do koszyka MBG";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = completePictureState.selectedBasketAssetIds.has(asset.id);
  checkbox.setAttribute("aria-label", "Zaznacz " + asset.fileName + " do koszyka MBG");
  checkbox.addEventListener("change", function () {
    if (checkbox.checked) completePictureState.selectedBasketAssetIds.add(asset.id);
    else completePictureState.selectedBasketAssetIds.delete(asset.id);
  });
  selectLabel.appendChild(checkbox);

  const main = document.createElement("div");
  main.className = "complete-picture-asset-main";

  const name = document.createElement("button");
  name.className = "complete-picture-asset-name";
  name.type = "button";
  name.textContent = asset.fileName;
  name.addEventListener("click", function () {
    setActiveAsset(asset.id);
  });

  const meta = document.createElement("span");
  meta.className = "complete-picture-asset-meta";
  const typeBadge = document.createElement("span");
  typeBadge.className = "complete-picture-asset-type";
  typeBadge.textContent = asset.isSvg ? "SVG" : "PNG";
  const stateBadge = document.createElement("span");
  stateBadge.className = asset.id === completePictureState.activeAssetId ? "complete-picture-asset-state is-active" : "complete-picture-asset-state";
  stateBadge.textContent = asset.id === completePictureState.activeAssetId ? "Aktywny" : "Nieaktywny";
  meta.appendChild(typeBadge);
  meta.appendChild(stateBadge);

  const actions = document.createElement("div");
  actions.className = "complete-picture-asset-actions";

  const edit = document.createElement("button");
  edit.className = "complete-picture-asset-action is-edit";
  edit.type = "button";
  edit.textContent = "Edytuj";
  edit.addEventListener("click", function () {
    setActiveAsset(asset.id);
  });

  const remove = document.createElement("button");
  remove.className = "complete-picture-asset-action";
  remove.type = "button";
  remove.textContent = "Usuń";
  remove.addEventListener("click", function () {
    removeCompletePictureAsset(asset.id);
  });

  main.appendChild(name);
  main.appendChild(meta);
  actions.appendChild(edit);
  actions.appendChild(remove);
  item.appendChild(number);
  item.appendChild(selectLabel);
  item.appendChild(main);
  item.appendChild(actions);
  return item;
}

function clearCompletePicture() {
  completePictureState.assets.forEach(function (asset) {
    URL.revokeObjectURL(asset.objectUrl);
  });
  completePictureState.assets = [];
  completePictureState.activeAssetId = null;
  completePictureState.selectedBasketAssetIds.clear();
  completePictureState.error = "";
  const fileInput = document.getElementById("completePictureFile");
  if (fileInput) fileInput.value = "";
  revokeRenderUrls();
  applySettingsToControls(createDefaultCompletePictureSettings());
  updateFileName();
  renderAssetList();
  setMessage("Lista plików wyczyszczona. Brak aktywnego pliku.");
  renderCompletePicture();
}

async function addActiveCompletePicturePageToBasket() {
  const activeAsset = getActiveAsset();
  if (!activeAsset) {
    setBasketStatus("Brak aktywnego pliku.");
    setMessage("Brak aktywnego pliku.");
    return;
  }
  await addCompletePictureAssetsToBasket([activeAsset]);
}

async function addSelectedCompletePicturePagesToBasket() {
  const selectedAssets = completePictureState.assets.filter(function (asset) {
    return completePictureState.selectedBasketAssetIds.has(asset.id);
  });

  if (!selectedAssets.length) {
    setBasketStatus("Nie zaznaczono żadnych stron.");
    setMessage("Nie zaznaczono żadnych stron.");
    return;
  }

  await addCompletePictureAssetsToBasket(selectedAssets);
}

async function addCompletePictureAssetsToBasket(assets) {
  let added = 0;
  try {
    setBasketStatus("Dodawanie stron do koszyka MBG...");
    for (const asset of assets) {
      const canvas = await renderExportCanvas(asset);
      const blob = await canvasToPngBlob(canvas);
      const now = new Date().toISOString();
      const editSnapshot = await createCompletePictureEditSnapshot(asset, now);
      await addFenixBookBasketPage({
        id: createFenixBookBasketPageId(),
        sourceModule: "complete-picture",
        pageType: "complete_picture",
        fileName: asset.fileName,
        title: asset.fileName.replace(/\.[^.]+$/, "") || "Complete the Picture",
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
        mimeType: "image/png",
        createdAt: now,
        blob: blob,
        order: Date.now() + added,
        editSnapshot: editSnapshot
      });
      added += 1;
    }
    const pages = await getFenixBookBasketPages();
    const message = "Dodano do wspólnego Koszyka Feniksa. Możesz wrócić do Fenixa albo przejść do MBG / Book Builder.";
    setBasketStatus(message + " Razem w koszyku: " + pages.length + ".");
    setMessage(message);
    refreshGlobalFenixBasketStatus();
  } catch (error) {
    console.error(error);
    setBasketStatus("Błąd zapisu do koszyka.");
    setError("Błąd zapisu do koszyka.");
    updateMessage();
  }
}

function refreshGlobalFenixBasketStatus() {
  if (window.FenixBasketStatus && typeof window.FenixBasketStatus.refresh === "function") {
    window.FenixBasketStatus.refresh();
  }
}

async function createCompletePictureEditSnapshot(asset, now) {
  const isSvg = !!asset.isSvg;
  return {
    snapshotVersion: 1,
    sourceModule: "complete-picture",
    pageType: "complete_picture",
    fileName: asset.fileName,
    originalFileName: asset.fileName,
    assetType: isSvg ? "svg" : "png",
    svgText: isSvg ? asset.svgText : "",
    sourceDataUrl: isSvg ? "" : await fileToDataUrl(asset.file),
    settings: clonePlainObject(ensureSettingsShape(asset.settings)),
    createdAt: now,
    updatedAt: now
  };
}

async function loadEditableCompletePictureBasketPageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const pageId = params.get("editBasketPage");
  if (!pageId) return;

  try {
    const page = await getFenixBookBasketPage(pageId);
    if (!page || !page.editSnapshot) {
      setError("Nie da się odtworzyć tej pozycji koszyka do edycji.");
      return;
    }
    const snapshot = page.editSnapshot;
    if (snapshot.sourceModule !== "complete-picture") {
      setError("Ta pozycja koszyka pochodzi z innego modułu.");
      return;
    }

    const asset = await createCompletePictureAssetFromSnapshot(snapshot);
    completePictureState.assets.push(asset);
    completePictureState.activeAssetId = asset.id;
    completePictureState.selectedBasketAssetIds.add(asset.id);
    completePictureState.editBasketPageId = pageId;
    completePictureState.editBasketPage = page;
    applySettingsToControls(asset.settings);
    updateCompletePictureControlValues();
    updateFileName();
    renderAssetList();
    renderCompletePicture();
    setMessage("Edytujesz stronę z Koszyka Feniksa.");
    setBasketStatus("Edytujesz stronę z Koszyka Feniksa.");
  } catch (error) {
    console.error(error);
    setError("Błąd odczytu strony z Koszyka Feniksa.");
  }
}

async function createCompletePictureAssetFromSnapshot(snapshot) {
  const isSvg = snapshot.assetType === "svg";
  const fileName = snapshot.originalFileName || snapshot.fileName || "complete-picture-page.png";
  const source = isSvg
    ? new Blob([snapshot.svgText || ""], { type: "image/svg+xml" })
    : dataUrlToBlob(snapshot.sourceDataUrl || "");
  const objectUrl = URL.createObjectURL(source);
  const image = await loadImage(objectUrl);
  const settings = ensureSettingsShape(Object.assign(createDefaultCompletePictureSettings(), clonePlainObject(snapshot.settings || {})));

  return {
    id: completePictureState.nextAssetId++,
    fileName: fileName,
    type: isSvg ? "SVG asset" : "Black & White PNG",
    file: source,
    objectUrl: objectUrl,
    image: image,
    isSvg: isSvg,
    svgText: isSvg ? String(snapshot.svgText || "") : "",
    viewBoxInfo: isSvg ? getSvgViewBoxInfo(String(snapshot.svgText || "")) : null,
    settings: settings
  };
}

async function updateEditedCompletePictureBasketPage() {
  const asset = getActiveAsset();
  if (!asset || !completePictureState.editBasketPageId || !completePictureState.editBasketPage) {
    setError("Brak edytowanej pozycji koszyka.");
    return;
  }

  try {
    saveActiveSettingsFromControls();
    const canvas = await renderExportCanvas(asset);
    const blob = await canvasToPngBlob(canvas);
    const now = new Date().toISOString();
    const editSnapshot = await createCompletePictureEditSnapshot(asset, now);
    const previousSnapshot = completePictureState.editBasketPage.editSnapshot || {};
    editSnapshot.createdAt = previousSnapshot.createdAt || editSnapshot.createdAt;
    editSnapshot.updatedAt = now;

    const updatedPage = Object.assign({}, completePictureState.editBasketPage, {
      sourceModule: "complete-picture",
      pageType: "complete_picture",
      fileName: asset.fileName,
      title: asset.fileName.replace(/\.[^.]+$/, "") || "Complete the Picture",
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      mimeType: "image/png",
      blob: blob,
      updatedAt: now,
      editSnapshot: editSnapshot
    });
    await addFenixBookBasketPage(updatedPage);
    completePictureState.editBasketPage = updatedPage;
    setBasketStatus("Zaktualizowano stronę w Koszyku Feniksa.");
    setMessage("Zaktualizowano stronę w Koszyku Feniksa.");
    refreshGlobalFenixBasketStatus();
  } catch (error) {
    console.error(error);
    setError("Błąd aktualizacji strony w Koszyku Feniksa.");
  }
}

function createFenixBookBasketPageId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "fenix-basket-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function setBasketStatus(message) {
  const node = document.getElementById("completePictureBasketStatus");
  if (node) node.textContent = message;
}

async function exportActiveCompletePicturePack() {
  const activeAsset = getActiveAsset();
  if (!activeAsset) {
    setBasketStatus("Brak aktywnego pliku.");
    setMessage("Brak aktywnego pliku.");
    return;
  }
  await exportCompletePicturePack([activeAsset]);
}

async function exportSelectedCompletePicturePack() {
  const selectedAssets = completePictureState.assets.filter(function (asset) {
    return completePictureState.selectedBasketAssetIds.has(asset.id);
  });

  if (!selectedAssets.length) {
    setBasketStatus("Nie zaznaczono żadnych stron.");
    setMessage("Nie zaznaczono żadnych stron.");
    return;
  }

  await exportCompletePicturePack(selectedAssets);
}

async function exportCompletePicturePack(assets) {
  try {
    setBasketStatus("Przygotowywanie paczki Fenixa...");
    const now = new Date().toISOString();
    const pages = [];

    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      const canvas = await renderExportCanvas(asset);
      pages.push({
        id: createFenixBookBasketPageId(),
        sourceModule: "complete-picture",
        pageType: "complete_picture",
        fileName: asset.fileName,
        title: asset.fileName.replace(/\.[^.]+$/, "") || "Complete the Picture",
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
        mimeType: "image/png",
        createdAt: now,
        order: index + 1,
        dataUrl: canvasToPngDataUrl(canvas)
      });
    }

    const pack = {
      fenixPackVersion: 1,
      packType: "fenix_book_pages",
      sourceModule: "complete-picture",
      createdAt: now,
      pageSize: {
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
        dpi: 300,
        trim: "8.5x11"
      },
      pages: pages
    };

    downloadFenixPack(pack);
    setBasketStatus("Paczka Fenixa została przygotowana. Wyeksportowano " + pages.length + " stron do paczki.");
    setMessage("Wyeksportowano " + pages.length + " stron do paczki.");
  } catch (error) {
    console.error(error);
    setBasketStatus("Błąd eksportu paczki.");
    setError("Błąd eksportu paczki.");
    updateMessage();
  }
}

function downloadFenixPack(pack) {
  const blob = new Blob([JSON.stringify(pack, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = createFenixPackFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function createFenixPackFileName() {
  const now = new Date();
  const pad = function (value) {
    return String(value).padStart(2, "0");
  };
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes())
  ].join("");
  return "fenix-complete-picture-pack-" + stamp + ".fenixpack";
}

function revokeRenderUrls() {
  completePictureState.renderUrls.forEach(function (url) {
    URL.revokeObjectURL(url);
  });
  completePictureState.renderUrls = [];
}

function updateFileName() {
  const node = document.getElementById("completePictureFileName");
  const activeAsset = getActiveAsset();
  if (node) {
    node.textContent = activeAsset
      ? "Aktywny plik: " + activeAsset.fileName + " (" + activeAsset.type + ")"
      : "Nie wczytano pliku.";
  }
  updateSvgDiagnostics(activeAsset);
  updateCompletePictureUiState();
}

function updateSvgDiagnostics(activeAsset) {
  const node = document.getElementById("completePictureSvgDiagnostics");
  if (!node) return;

  if (!activeAsset) {
    node.textContent = "viewBox: brak aktywnego SVG";
    return;
  }
  if (!activeAsset.isSvg) {
    node.textContent = "Tryb: Black & White PNG | viewBox i normalizacja SVG nie dotyczą";
    return;
  }
  if (!activeAsset.viewBoxInfo) {
    node.textContent = "viewBox: nie odczytano | Tryb: SVG bez diagnostyki viewBox";
    return;
  }

  const info = activeAsset.viewBoxInfo;
  const mode = info.isSmallIconViewBox ? "small icon SVG - stroke normalized" : "standard SVG - stroke normalized";
  const scale = formatSvgNumber(info.maxDimension / SVG_STROKE_NORMALIZATION_BASE);
  node.textContent = "viewBox: " + info.viewBox + " | Tryb: " + mode + " | skala: " + scale;
}

function updateCompletePictureUiState() {
  const activeAsset = getActiveAsset();
  const activeName = document.getElementById("completePictureActiveFileName");
  const activeType = document.getElementById("completePictureActiveFileType");
  const activeMode = document.getElementById("completePictureActiveModeBadge");
  const settingsMode = document.getElementById("completePictureSettingsModeBadge");
  const sourceMode = document.getElementById("completePictureSourceMode");
  const updateBasketButton = document.getElementById("completePictureUpdateBasketPage");
  const uploadModeIsPng = sourceMode && sourceMode.value === "png";

  if (activeName) activeName.textContent = activeAsset ? activeAsset.fileName : "Brak aktywnego pliku";
  if (activeType) activeType.textContent = activeAsset ? "Typ: " + (activeAsset.isSvg ? "SVG" : "PNG") : "Typ: brak";

  const modeText = activeAsset
    ? "Tryb aktywny: " + (activeAsset.isSvg ? "SVG" : "Black & White PNG")
    : "Tryb aktywny: brak";
  if (activeMode) activeMode.textContent = modeText;
  if (settingsMode) settingsMode.textContent = modeText;
  if (updateBasketButton) {
    updateBasketButton.hidden = !completePictureState.editBasketPageId;
    updateBasketButton.disabled = !activeAsset || !completePictureState.editBasketPageId;
  }

  updateSourceModeHelp(uploadModeIsPng);
}

function setError(message) {
  completePictureState.error = message;
}

function updateMessage() {
  const activeAsset = getActiveAsset();
  if (completePictureState.error) {
    setMessage(completePictureState.error);
    return;
  }
  if (!activeAsset) {
    setMessage("Wczytaj SVG lub PNG, aby rozpocząć.");
    return;
  }
  if (activeAsset.isSvg && activeAsset.viewBoxInfo && activeAsset.viewBoxInfo.isSmallIconViewBox) {
    setMessage("Ostrzeżenie: mały viewBox SVG. Grubości linii są normalizowane dla czytelnego podglądu.");
    return;
  }
  setMessage(activeAsset.isSvg ? "Plik załadowany. Podgląd aktywnego SVG odświeżony warstwowo." : "Plik załadowany. PNG Mode działa najlepiej z czarno-białą grafiką wejściową.");
}

function setMessage(message) {
  const node = document.getElementById("completePictureMessage");
  if (node) node.textContent = message;
  const status = document.getElementById("completePictureStatusText");
  if (status) status.textContent = message;
}
