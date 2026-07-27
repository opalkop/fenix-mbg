(function () {
  "use strict";

  const EXPORT_WIDTH = 2550;
  const EXPORT_HEIGHT = 3300;
  const PREVIEW_WIDTH = 765;
  const PREVIEW_HEIGHT = 990;
  const FENIX_BOOK_BASKET_DB_NAME = "fenixBookBasketDb";
  const FENIX_BOOK_BASKET_STORE_NAME = "pages";
  const FENIX_BOOK_BASKET_DB_VERSION = 1;
  const EXERCISE_TYPES = ["horizontal", "vertical", "waves", "zigzag", "mountains", "arches", "loops", "big-curves"];

  const state = {
    seed: 1,
    renderToken: 0,
    isBusy: false
  };

  document.addEventListener("DOMContentLoaded", initTracingStudio);

  function initTracingStudio() {
    bindControls();
    applyDifficultyPreset("medium", false);
    renderPreview();
    setStatus("Gotowe do pracy.");
  }

  function bindControls() {
    bindButton("tracingStudioRefreshPreview", function () {
      state.seed += 1;
      renderPreview();
      setMessage("Odświeżono podgląd.");
    });
    bindButton("tracingStudioExportPng", exportActivePng);
    bindButton("tracingStudioAddToBasket", addActivePageToBasket);
    bindButton("tracingStudioAddVariantsToBasket", addVariantsToBasket);
    bindButton("tracingStudioExportPack", exportFenixPack);

    bindRange("tracingStudioLineCount", "");
    bindRange("tracingStudioTopMargin", " px");
    bindRange("tracingStudioSideMargin", " px");
    bindRange("tracingStudioLineSpacing", " px");
    bindRange("tracingStudioLineWidth", " px");
    bindRange("tracingStudioDashGap", " px");
    bindRange("tracingStudioOpacity", "%");
    bindRange("tracingStudioVariantCount", "");

    ["tracingStudioTitle", "tracingStudioShowTitle", "tracingStudioExerciseType", "tracingStudioLineStyle", "tracingStudioStartDot", "tracingStudioShowGuides"].forEach(function (id) {
      const node = el(id);
      if (!node) return;
      node.addEventListener("input", renderPreview);
      node.addEventListener("change", renderPreview);
    });

    const difficulty = el("tracingStudioDifficulty");
    if (difficulty) {
      difficulty.addEventListener("change", function () {
        applyDifficultyPreset(difficulty.value, true);
        renderPreview();
      });
    }
  }

  function bindButton(id, handler) {
    const node = el(id);
    if (node) node.addEventListener("click", handler);
  }

  function bindRange(baseId, suffix) {
    const range = el(baseId);
    const number = el(baseId + "Number");
    const output = el(baseId + "Value");

    const update = function (rawValue) {
      const control = range || number;
      if (!control) return;
      const value = clamp(Number(rawValue), Number(control.min), Number(control.max));
      if (range) range.value = String(value);
      if (number) number.value = String(value);
      if (output) output.textContent = String(value) + suffix;
      renderPreview();
    };

    if (range) {
      range.addEventListener("input", function () {
        update(range.value);
      });
    }
    if (number) {
      const commit = function () {
        if (number.value === "") {
          if (range) number.value = range.value;
          return;
        }
        update(number.value);
      };
      number.addEventListener("change", commit);
      number.addEventListener("blur", commit);
      number.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          number.blur();
        }
      });
    }
  }

  function applyDifficultyPreset(difficulty, shouldSetStatus) {
    const presets = {
      easy: { lineCount: 6, lineSpacing: 310, lineWidth: 10, dashGap: 42, topMargin: 500 },
      medium: { lineCount: 9, lineSpacing: 245, lineWidth: 8, dashGap: 34, topMargin: 430 },
      hard: { lineCount: 13, lineSpacing: 175, lineWidth: 7, dashGap: 26, topMargin: 350 }
    };
    const preset = presets[difficulty] || presets.medium;
    setRangeValue("tracingStudioLineCount", preset.lineCount, "");
    setRangeValue("tracingStudioLineSpacing", preset.lineSpacing, " px");
    setRangeValue("tracingStudioLineWidth", preset.lineWidth, " px");
    setRangeValue("tracingStudioDashGap", preset.dashGap, " px");
    setRangeValue("tracingStudioTopMargin", preset.topMargin, " px");
    if (shouldSetStatus) setStatus("Dopasowano ustawienia poziomu trudności. Możesz je dalej ręcznie zmienić.");
  }

  function readSettings(overrides) {
    const settings = {
      title: getValue("tracingStudioTitle", "Trace the Lines").trim() || "Trace the Lines",
      showTitle: getChecked("tracingStudioShowTitle", true),
      lineCount: getNumber("tracingStudioLineCount", 9),
      topMargin: getNumber("tracingStudioTopMargin", 430),
      sideMargin: getNumber("tracingStudioSideMargin", 300),
      lineSpacing: getNumber("tracingStudioLineSpacing", 245),
      lineWidth: getNumber("tracingStudioLineWidth", 8),
      dashGap: getNumber("tracingStudioDashGap", 34),
      opacity: getNumber("tracingStudioOpacity", 72) / 100,
      lineStyle: getValue("tracingStudioLineStyle", "dotted"),
      exerciseType: getValue("tracingStudioExerciseType", "horizontal"),
      difficulty: getValue("tracingStudioDifficulty", "medium"),
      startDot: getChecked("tracingStudioStartDot", true),
      showGuides: getChecked("tracingStudioShowGuides", false),
      variantCount: getNumber("tracingStudioVariantCount", 5),
      seed: state.seed
    };
    return Object.assign(settings, overrides || {});
  }

  function renderPreview() {
    const canvas = el("tracingStudioPreviewCanvas");
    if (!canvas) return;
    const token = ++state.renderToken;
    const settings = readSettings();
    renderPageToCanvas(canvas, PREVIEW_WIDTH, PREVIEW_HEIGHT, settings);
    if (token !== state.renderToken) return;
    updatePreviewSummary(settings);
  }

  function renderPageToCanvas(canvas, width, height, settings) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const scale = width / EXPORT_WIDTH;

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.scale(scale, scale);
    drawTitle(ctx, settings);
    drawTracingLines(ctx, settings);
    ctx.restore();
  }

  function drawTitle(ctx, settings) {
    if (!settings.showTitle) return;
    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.font = "bold 92px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(settings.title, EXPORT_WIDTH / 2, 190, EXPORT_WIDTH - 560);
    ctx.restore();
  }

  function drawTracingLines(ctx, settings) {
    const left = settings.sideMargin;
    const right = EXPORT_WIDTH - settings.sideMargin;
    const usableWidth = right - left;
    const startY = settings.topMargin;
    const rowHeight = Math.max(90, settings.lineSpacing);
    const patternHeight = getPatternHeight(settings);
    const maxY = EXPORT_HEIGHT - 310;
    const lineCount = Math.min(settings.lineCount, Math.max(1, Math.floor((maxY - startY) / rowHeight) + 1));

    setupLineStyle(ctx, settings);
    for (let index = 0; index < lineCount; index += 1) {
      const y = startY + index * rowHeight;
      const variantOffset = getVariantOffset(settings.seed, index);
      const type = settings.exerciseType === "mixed"
        ? EXERCISE_TYPES[(index + settings.seed) % EXERCISE_TYPES.length]
        : settings.exerciseType;

      if (settings.showGuides) drawPracticeGuide(ctx, left, right, y, patternHeight);
      ctx.beginPath();
      drawExercisePath(ctx, type, left, y, usableWidth, patternHeight, variantOffset, settings);
      ctx.stroke();
      if (settings.startDot) drawStartDot(ctx, left, y, patternHeight, settings);
    }
  }

  function setupLineStyle(ctx, settings) {
    const alpha = clamp(settings.opacity, 0.25, 1);
    const gray = settings.lineStyle === "light-solid" ? 118 : 28;
    ctx.strokeStyle = "rgba(" + gray + ", " + gray + ", " + gray + ", " + alpha + ")";
    ctx.fillStyle = "rgba(17, 24, 39, 0.78)";
    ctx.lineWidth = settings.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (settings.lineStyle === "dotted") {
      ctx.setLineDash([1, Math.max(10, settings.dashGap)]);
    } else if (settings.lineStyle === "dashed") {
      ctx.setLineDash([Math.max(28, settings.dashGap * 1.6), Math.max(12, settings.dashGap)]);
    } else {
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(115, 115, 115, " + Math.min(alpha, 0.42) + ")";
    }
  }

  function drawPracticeGuide(ctx, left, right, centerY, height) {
    ctx.save();
    ctx.setLineDash([18, 24]);
    ctx.strokeStyle = "rgba(156, 163, 175, 0.14)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, centerY - height / 2);
    ctx.lineTo(right, centerY - height / 2);
    ctx.moveTo(left, centerY + height / 2);
    ctx.lineTo(right, centerY + height / 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawExercisePath(ctx, type, left, y, width, height, offset, settings) {
    if (type === "horizontal") return drawHorizontal(ctx, left, y, width);
    if (type === "vertical") return drawVerticalRepeats(ctx, left, y, width, height, settings);
    if (type === "waves") return drawWave(ctx, left, y, width, height, offset, settings);
    if (type === "zigzag") return drawZigzag(ctx, left, y, width, height, settings);
    if (type === "mountains") return drawMountains(ctx, left, y, width, height, settings);
    if (type === "arches") return drawArches(ctx, left, y, width, height, settings);
    if (type === "loops") return drawLoops(ctx, left, y, width, height, settings);
    if (type === "big-curves") return drawBigCurves(ctx, left, y, width, height, offset, settings);
    return drawHorizontal(ctx, left, y, width);
  }

  function drawHorizontal(ctx, left, y, width) {
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
  }

  function drawVerticalRepeats(ctx, left, y, width, height, settings) {
    const step = settings.difficulty === "hard" ? 110 : settings.difficulty === "easy" ? 190 : 145;
    for (let x = left; x <= left + width; x += step) {
      ctx.moveTo(x, y - height / 2);
      ctx.lineTo(x, y + height / 2);
    }
  }

  function drawWave(ctx, left, y, width, height, offset, settings) {
    const amplitude = height * 0.42;
    const cycles = settings.difficulty === "hard" ? 8 : settings.difficulty === "easy" ? 4 : 6;
    const steps = cycles * 28;
    ctx.moveTo(left, y + offset);
    for (let i = 1; i <= steps; i += 1) {
      const progress = i / steps;
      const x = left + width * progress;
      const nextY = y + Math.sin(progress * cycles * Math.PI * 2) * amplitude + offset;
      ctx.lineTo(x, nextY);
    }
  }

  function drawZigzag(ctx, left, y, width, height, settings) {
    const amplitude = height * 0.48;
    const segments = settings.difficulty === "hard" ? 18 : settings.difficulty === "easy" ? 10 : 14;
    ctx.moveTo(left, y + amplitude);
    for (let i = 1; i <= segments; i += 1) {
      const x = left + (width / segments) * i;
      const nextY = i % 2 === 0 ? y + amplitude : y - amplitude;
      ctx.lineTo(x, nextY);
    }
  }

  function drawMountains(ctx, left, y, width, height, settings) {
    const amplitude = height * 0.52;
    const peaks = settings.difficulty === "hard" ? 9 : settings.difficulty === "easy" ? 5 : 7;
    const step = width / peaks;
    ctx.moveTo(left, y + amplitude);
    for (let i = 0; i < peaks; i += 1) {
      ctx.lineTo(left + step * (i + 0.5), y - amplitude);
      ctx.lineTo(left + step * (i + 1), y + amplitude);
    }
  }

  function drawArches(ctx, left, y, width, height, settings) {
    const arches = settings.difficulty === "hard" ? 10 : settings.difficulty === "easy" ? 5 : 7;
    const step = width / arches;
    const baseY = y + height * 0.45;
    const topY = y - height * 0.48;
    ctx.moveTo(left, baseY);
    for (let i = 0; i < arches; i += 1) {
      const startX = left + step * i;
      const endX = left + step * (i + 1);
      ctx.moveTo(startX, baseY);
      ctx.quadraticCurveTo(startX + step / 2, topY, endX, baseY);
    }
  }

  function drawLoops(ctx, left, y, width, height, settings) {
    const loops = settings.difficulty === "hard" ? 11 : settings.difficulty === "easy" ? 6 : 8;
    const step = width / loops;
    const radiusY = height * 0.46;
    ctx.moveTo(left, y);
    for (let i = 0; i < loops; i += 1) {
      const x = left + step * i;
      ctx.bezierCurveTo(x + step * 0.2, y - radiusY, x + step * 0.8, y - radiusY, x + step, y);
      ctx.bezierCurveTo(x + step * 0.8, y + radiusY, x + step * 0.2, y + radiusY, x + step, y);
    }
  }

  function drawBigCurves(ctx, left, y, width, height, offset, settings) {
    const curves = settings.difficulty === "hard" ? 6 : settings.difficulty === "easy" ? 3 : 4;
    const step = width / curves;
    ctx.moveTo(left, y + offset);
    for (let i = 0; i < curves; i += 1) {
      const x = left + step * i;
      const direction = i % 2 === 0 ? -1 : 1;
      ctx.bezierCurveTo(x + step * 0.25, y + direction * height, x + step * 0.75, y + direction * height, x + step, y);
    }
  }

  function drawStartDot(ctx, left, y, height, settings) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(17, 24, 39, " + clamp(settings.opacity + 0.1, 0.4, 0.9) + ")";
    ctx.beginPath();
    ctx.arc(left - 42, y, Math.max(12, height * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  async function exportActivePng() {
    try {
      setBusy(true);
      const settings = readSettings();
      const canvas = createExportCanvas(settings);
      downloadDataUrl(canvas.toDataURL("image/png"), createTracingPngFileName());
      setStatus("Wyeksportowano aktywną stronę PNG.");
      setMessage("Wyeksportowano aktywną stronę PNG 2550×3300 px.");
    } catch (error) {
      console.error(error);
      setError("Błąd eksportu PNG.");
    } finally {
      setBusy(false);
    }
  }

  async function addActivePageToBasket() {
    try {
      setBusy(true);
      await addRenderedPageToBasket(readSettings(), 0);
      const message = "Dodano do wspólnego Koszyka Feniksa. Możesz wrócić do Fenixa albo przejść do MBG / Book Builder.";
      setStatus(message);
      setMessage(message);
      refreshGlobalFenixBasketStatus();
    } catch (error) {
      console.error(error);
      setError("Błąd zapisu do Koszyka Feniksa.");
    } finally {
      setBusy(false);
    }
  }

  async function addVariantsToBasket() {
    try {
      setBusy(true);
      const base = readSettings();
      const count = clamp(base.variantCount, 1, 20);
      for (let index = 0; index < count; index += 1) {
        await addRenderedPageToBasket(createVariantSettings(base, index), index);
      }
      const message = "Dodano do wspólnego Koszyka Feniksa. Możesz wrócić do Fenixa albo przejść do MBG / Book Builder.";
      setStatus(message + " Dodano wariantów: " + count + ".");
      setMessage(message);
      refreshGlobalFenixBasketStatus();
    } catch (error) {
      console.error(error);
      setError("Błąd zapisu wariantów do Koszyka Feniksa.");
    } finally {
      setBusy(false);
    }
  }

  async function exportFenixPack() {
    try {
      setBusy(true);
      const base = readSettings();
      const count = clamp(base.variantCount, 1, 20);
      const now = new Date().toISOString();
      const pages = [];

      for (let index = 0; index < count; index += 1) {
        const settings = createVariantSettings(base, index);
        const canvas = createExportCanvas(settings);
        pages.push({
          id: createId("tracing-page"),
          sourceModule: "tracing-studio",
          pageType: "tracing_page",
          fileName: createTracingPngFileName(index),
          title: createPageTitle(settings, index, count),
          width: EXPORT_WIDTH,
          height: EXPORT_HEIGHT,
          mimeType: "image/png",
          createdAt: now,
          order: index + 1,
          dataUrl: canvas.toDataURL("image/png")
        });
      }

      const pack = {
        fenixPackVersion: 1,
        packType: "fenix_book_pages",
        sourceModule: "tracing-studio",
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
      setStatus("Wyeksportowano " + pages.length + " stron do paczki Fenixa.");
      setMessage("Wyeksportowano .fenixpack zgodny z MBG.");
    } catch (error) {
      console.error(error);
      setError("Błąd eksportu .fenixpack.");
    } finally {
      setBusy(false);
    }
  }

  async function addRenderedPageToBasket(settings, index) {
    const canvas = createExportCanvas(settings);
    const blob = await canvasToPngBlob(canvas);
    const now = new Date().toISOString();
    await addFenixBookBasketPage({
      id: createFenixBookBasketPageId(),
      sourceModule: "tracing-studio",
      pageType: "tracing_page",
      fileName: createTracingPngFileName(index),
      title: createPageTitle(settings, index, 1),
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      mimeType: "image/png",
      createdAt: now,
      updatedAt: now,
      blob: blob,
      order: Date.now() + index,
      includeInBook: true
    });
  }

  function createExportCanvas(settings) {
    const canvas = document.createElement("canvas");
    renderPageToCanvas(canvas, EXPORT_WIDTH, EXPORT_HEIGHT, settings);
    return canvas;
  }

  function createVariantSettings(base, index) {
    const settings = Object.assign({}, base, {
      seed: base.seed + index + 1
    });
    if (base.exerciseType === "mixed") {
      settings.exerciseType = "mixed";
    } else if (index > 0 && index % 2 === 1) {
      const current = EXERCISE_TYPES.indexOf(base.exerciseType);
      settings.exerciseType = EXERCISE_TYPES[(Math.max(0, current) + index) % EXERCISE_TYPES.length];
    }
    return settings;
  }

  function createPageTitle(settings, index, count) {
    const suffix = count > 1 || index > 0 ? " " + (index + 1) : "";
    return (settings.title || "Tracing Page") + suffix;
  }

  function getPatternHeight(settings) {
    if (settings.difficulty === "easy") return 150;
    if (settings.difficulty === "hard") return 105;
    return 128;
  }

  function getVariantOffset(seed, index) {
    const value = ((seed * 37 + index * 19) % 29) - 14;
    return value;
  }

  function updatePreviewSummary(settings) {
    const summary = el("tracingStudioPreviewSummary");
    if (!summary) return;
    summary.textContent = getDifficultyLabel(settings.difficulty) + " · " + getExerciseLabel(settings.exerciseType) + " · " + settings.lineStyle;
  }

  function getDifficultyLabel(value) {
    if (value === "easy") return "Easy";
    if (value === "hard") return "Hard";
    return "Medium";
  }

  function getExerciseLabel(value) {
    const labels = {
      horizontal: "linie poziome",
      vertical: "linie pionowe",
      waves: "fale",
      zigzag: "zygzak",
      mountains: "góry i doliny",
      arches: "łuki",
      loops: "pętle",
      "big-curves": "duże krzywe",
      mixed: "mixed"
    };
    return labels[value] || "tracing";
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
        reject(request.error || new Error("Błąd otwarcia Koszyka Feniksa."));
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
        reject(transaction.error || new Error("Błąd operacji Koszyka Feniksa."));
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

  function refreshGlobalFenixBasketStatus() {
    if (window.FenixBasketStatus && typeof window.FenixBasketStatus.refresh === "function") {
      window.FenixBasketStatus.refresh();
    }
  }

  function downloadFenixPack(pack) {
    const blob = new Blob([JSON.stringify(pack, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = createFenixPackFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadDataUrl(dataUrl, fileName) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function canvasToPngBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Nie udało się przygotować PNG Blob."));
        }
      }, "image/png");
    });
  }

  function createFenixBookBasketPageId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return createId("fenix-basket");
  }

  function createTracingPngFileName(index) {
    const suffix = typeof index === "number" && index > 0 ? "-" + String(index + 1).padStart(2, "0") : "";
    return "fenix-tracing-page-" + createDateStamp() + suffix + ".png";
  }

  function createFenixPackFileName() {
    return "fenix-tracing-studio-pack-" + createDateStamp() + ".fenixpack";
  }

  function createDateStamp() {
    const now = new Date();
    const pad = function (value) {
      return String(value).padStart(2, "0");
    };
    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      "-",
      pad(now.getHours()),
      pad(now.getMinutes())
    ].join("");
  }

  function setBusy(isBusy) {
    state.isBusy = isBusy;
    ["tracingStudioExportPng", "tracingStudioAddToBasket", "tracingStudioAddVariantsToBasket", "tracingStudioExportPack"].forEach(function (id) {
      const button = el(id);
      if (button) button.disabled = isBusy;
    });
  }

  function setStatus(message) {
    const status = el("tracingStudioStatusText");
    if (status) status.textContent = message;
  }

  function setMessage(message) {
    const node = el("tracingStudioMessage");
    if (node) node.textContent = message;
  }

  function setError(message) {
    setStatus(message);
    setMessage(message);
  }

  function setRangeValue(baseId, value, suffix) {
    const range = el(baseId);
    const number = el(baseId + "Number");
    const output = el(baseId + "Value");
    if (range) range.value = String(value);
    if (number) number.value = String(value);
    if (output) output.textContent = String(value) + suffix;
  }

  function getValue(id, fallback) {
    const node = el(id);
    return node ? String(node.value || "") : fallback;
  }

  function getChecked(id, fallback) {
    const node = el(id);
    return node ? node.checked : fallback;
  }

  function getNumber(id, fallback) {
    const node = el(id);
    const value = node ? Number(node.value) : fallback;
    return Number.isFinite(value) ? value : fallback;
  }

  function createId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function el(id) {
    return document.getElementById(id);
  }
})();
