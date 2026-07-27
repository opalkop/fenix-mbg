(function () {
  "use strict";

  const EXPORT_WIDTH = 2550;
  const EXPORT_HEIGHT = 3300;
  const PREVIEW_WIDTH = 765;
  const PREVIEW_HEIGHT = 990;
  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;
  const SHAPE_SEQUENCE = ["star", "heart", "house", "fish", "rocket", "car", "flower", "butterfly", "dinosaur"];

  const SHAPES = {
    star: [[0.5,0.06],[0.6,0.36],[0.92,0.36],[0.66,0.55],[0.76,0.88],[0.5,0.68],[0.24,0.88],[0.34,0.55],[0.08,0.36],[0.4,0.36],[0.5,0.06]],
    heart: [[0.5,0.88],[0.16,0.52],[0.09,0.28],[0.24,0.1],[0.42,0.16],[0.5,0.31],[0.58,0.16],[0.76,0.1],[0.91,0.28],[0.84,0.52],[0.5,0.88]],
    house: [[0.18,0.88],[0.18,0.44],[0.5,0.14],[0.82,0.44],[0.82,0.88],[0.62,0.88],[0.62,0.62],[0.46,0.62],[0.46,0.88],[0.18,0.88]],
    fish: [[0.14,0.5],[0.32,0.25],[0.62,0.18],[0.86,0.5],[0.62,0.82],[0.32,0.75],[0.14,0.5],[0.05,0.28],[0.05,0.72],[0.14,0.5]],
    rocket: [[0.5,0.06],[0.68,0.24],[0.7,0.62],[0.88,0.82],[0.65,0.76],[0.5,0.94],[0.35,0.76],[0.12,0.82],[0.3,0.62],[0.32,0.24],[0.5,0.06]],
    car: [[0.12,0.66],[0.22,0.45],[0.38,0.35],[0.64,0.35],[0.8,0.48],[0.9,0.66],[0.82,0.78],[0.69,0.78],[0.65,0.88],[0.54,0.88],[0.5,0.78],[0.32,0.78],[0.28,0.88],[0.17,0.88],[0.13,0.78],[0.12,0.66]],
    flower: [[0.5,0.5],[0.5,0.18],[0.62,0.34],[0.82,0.26],[0.72,0.46],[0.9,0.58],[0.68,0.62],[0.7,0.86],[0.52,0.7],[0.34,0.86],[0.36,0.62],[0.14,0.58],[0.32,0.46],[0.22,0.26],[0.42,0.34],[0.5,0.18]],
    butterfly: [[0.5,0.18],[0.43,0.43],[0.18,0.16],[0.08,0.42],[0.34,0.58],[0.12,0.78],[0.36,0.9],[0.5,0.62],[0.64,0.9],[0.88,0.78],[0.66,0.58],[0.92,0.42],[0.82,0.16],[0.57,0.43],[0.5,0.18]],
    dinosaur: [[0.15,0.74],[0.22,0.52],[0.36,0.4],[0.48,0.38],[0.58,0.22],[0.78,0.18],[0.88,0.3],[0.76,0.38],[0.63,0.38],[0.7,0.56],[0.62,0.76],[0.47,0.78],[0.43,0.92],[0.34,0.92],[0.32,0.78],[0.24,0.78],[0.2,0.92],[0.11,0.92],[0.15,0.74]]
  };

  document.addEventListener("DOMContentLoaded", initDotStudio);

  function initDotStudio() {
    bindControls();
    applyDifficultyPreset("medium", false);
    renderPreview();
    setStatus("Gotowe do pracy.");
  }

  function bindControls() {
    bindButton("dotStudioRefreshPreview", renderPreview);
    bindButton("dotStudioRandomize", randomizeLayout);
    bindButton("dotStudioExportPng", exportActivePng);
    bindButton("dotStudioAddToBasket", addActivePageToBasket);
    bindButton("dotStudioAddVariantsToBasket", addVariantsToBasket);
    bindButton("dotStudioExportPack", exportFenixPack);

    ["dotStudioPointCount", "dotStudioSeed", "dotStudioAreaScale", "dotStudioDotSize", "dotStudioNumberSize", "dotStudioLineWidth", "dotStudioVariantCount"].forEach(function (id) {
      const suffix = id === "dotStudioAreaScale" ? "%" : id === "dotStudioPointCount" || id === "dotStudioSeed" || id === "dotStudioVariantCount" ? "" : " px";
      bindRange(id, suffix);
    });

    ["dotStudioShowTitle", "dotStudioTitle", "dotStudioInstruction", "dotStudioShapeType", "dotStudioShowOutline", "dotStudioShowAnswerLines"].forEach(function (id) {
      const node = el(id);
      if (!node) return;
      node.addEventListener("input", renderPreview);
      node.addEventListener("change", renderPreview);
    });

    const difficulty = el("dotStudioDifficulty");
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
    if (range) range.addEventListener("input", function () { update(range.value); });
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
      easy: { points: 14, dot: 20, number: 50, area: 84, line: 5 },
      medium: { points: 22, dot: 16, number: 42, area: 82, line: 4 },
      hard: { points: 34, dot: 12, number: 34, area: 88, line: 3 }
    };
    const preset = presets[difficulty] || presets.medium;
    setRangeValue("dotStudioPointCount", preset.points, "");
    setRangeValue("dotStudioDotSize", preset.dot, " px");
    setRangeValue("dotStudioNumberSize", preset.number, " px");
    setRangeValue("dotStudioAreaScale", preset.area, "%");
    setRangeValue("dotStudioLineWidth", preset.line, " px");
    if (shouldSetStatus) setStatus("Dopasowano ustawienia poziomu trudności. Możesz je dalej ręcznie zmienić.");
  }

  function randomizeLayout() {
    const nextSeed = (getNumber("dotStudioSeed", 1) + 137) % 9999 || 1;
    setRangeValue("dotStudioSeed", nextSeed, "");
    setStatus("Wylosowano nowy układ.");
    renderPreview();
  }

  function readSettings(overrides) {
    const settings = {
      showTitle: getChecked("dotStudioShowTitle", true),
      title: getValue("dotStudioTitle", "Connect the Dots").trim() || "Connect the Dots",
      instruction: getValue("dotStudioInstruction", "Connect the dots in order.").trim(),
      shapeType: getValue("dotStudioShapeType", "star"),
      difficulty: getValue("dotStudioDifficulty", "medium"),
      pointCount: getNumber("dotStudioPointCount", 22),
      seed: getNumber("dotStudioSeed", 1),
      areaScale: getNumber("dotStudioAreaScale", 82) / 100,
      dotSize: getNumber("dotStudioDotSize", 16),
      numberSize: getNumber("dotStudioNumberSize", 42),
      lineWidth: getNumber("dotStudioLineWidth", 4),
      showOutline: getChecked("dotStudioShowOutline", false),
      showAnswerLines: getChecked("dotStudioShowAnswerLines", false),
      variantCount: getNumber("dotStudioVariantCount", 5)
    };
    return Object.assign(settings, overrides || {});
  }

  function renderPreview() {
    const canvas = el("dotStudioPreviewCanvas");
    if (!canvas) return;
    const settings = readSettings();
    renderPageToCanvas(canvas, PREVIEW_WIDTH, PREVIEW_HEIGHT, settings);
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
    drawHeader(ctx, settings);
    drawDotToDot(ctx, settings);
    ctx.restore();
  }

  function drawHeader(ctx, settings) {
    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (settings.showTitle) {
      ctx.font = "bold 86px Arial, Helvetica, sans-serif";
      ctx.fillText(settings.title, EXPORT_WIDTH / 2, 165, EXPORT_WIDTH - 560);
    }
    if (settings.instruction) {
      ctx.font = "42px Arial, Helvetica, sans-serif";
      ctx.fillText(settings.instruction, EXPORT_WIDTH / 2, settings.showTitle ? 275 : 185, EXPORT_WIDTH - 560);
    }
    ctx.restore();
  }

  function drawDotToDot(ctx, settings) {
    const shapeType = resolveShapeType(settings);
    const points = createPagePoints(settings, shapeType);
    const dense = hasDensePoints(points, settings);
    const message = dense ? "Układ może być zbyt gęsty. Zmniejsz liczbę punktów albo wybierz niższy poziom." : "Punkty są gotowe do eksportu.";
    setMessage(message);

    if (settings.showOutline) drawOutline(ctx, points, settings);
    if (settings.showAnswerLines) drawAnswerLines(ctx, points, settings);
    drawDotsAndNumbers(ctx, points, settings);
  }

  function resolveShapeType(settings) {
    if (settings.shapeType !== "random") return settings.shapeType;
    return SHAPE_SEQUENCE[settings.seed % SHAPE_SEQUENCE.length];
  }

  function createPagePoints(settings, shapeType) {
    const normalized = resamplePolyline(SHAPES[shapeType] || SHAPES.star, settings.pointCount);
    const areaW = 1700 * settings.areaScale;
    const areaH = 2100 * settings.areaScale;
    const left = (EXPORT_WIDTH - areaW) / 2;
    const top = 530 + (2100 - areaH) / 2;
    const rng = createRng(settings.seed);
    const jitter = settings.difficulty === "hard" ? 10 : settings.difficulty === "medium" ? 7 : 4;
    return normalized.map(function (point) {
      return {
        x: left + point[0] * areaW + (rng() - 0.5) * jitter,
        y: top + point[1] * areaH + (rng() - 0.5) * jitter
      };
    });
  }

  function resamplePolyline(points, count) {
    const distances = [0];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += distance(points[i - 1], points[i]);
      distances.push(total);
    }
    const result = [];
    for (let i = 0; i < count; i += 1) {
      const target = count === 1 ? 0 : (total * i) / (count - 1);
      let segment = 1;
      while (segment < distances.length - 1 && distances[segment] < target) segment += 1;
      const prevDistance = distances[segment - 1];
      const nextDistance = distances[segment];
      const t = nextDistance === prevDistance ? 0 : (target - prevDistance) / (nextDistance - prevDistance);
      const a = points[segment - 1];
      const b = points[segment];
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return result;
  }

  function drawOutline(ctx, points, settings) {
    ctx.save();
    ctx.strokeStyle = "rgba(17, 24, 39, 0.12)";
    ctx.lineWidth = Math.max(2, settings.lineWidth);
    ctx.setLineDash([22, 24]);
    drawPointPath(ctx, points);
    ctx.stroke();
    ctx.restore();
  }

  function drawAnswerLines(ctx, points, settings) {
    ctx.save();
    ctx.strokeStyle = "rgba(17, 24, 39, 0.36)";
    ctx.lineWidth = Math.max(3, settings.lineWidth);
    ctx.setLineDash([]);
    drawPointPath(ctx, points);
    ctx.stroke();
    ctx.restore();
  }

  function drawPointPath(ctx, points) {
    ctx.beginPath();
    points.forEach(function (point, index) {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
  }

  function drawDotsAndNumbers(ctx, points, settings) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold " + settings.numberSize + "px Arial, Helvetica, sans-serif";
    points.forEach(function (point, index) {
      drawDot(ctx, point, settings);
      drawNumber(ctx, point, index + 1, settings);
    });
    ctx.restore();
  }

  function drawDot(ctx, point, settings) {
    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(point.x, point.y, settings.dotSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawNumber(ctx, point, number, settings) {
    const offset = settings.numberSize * 0.82 + settings.dotSize;
    let x = point.x + offset;
    let y = point.y - offset * 0.4;
    const margin = 140;
    x = clamp(x, margin, EXPORT_WIDTH - margin);
    y = clamp(y, 390, EXPORT_HEIGHT - margin);
    const text = String(number);
    const width = Math.max(settings.numberSize * 1.05, text.length * settings.numberSize * 0.62);
    const height = settings.numberSize * 1.05;
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
    ctx.fillRect(x - width / 2 - 6, y - height / 2 - 4, width + 12, height + 8);
    ctx.fillStyle = "#111827";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function hasDensePoints(points, settings) {
    const threshold = settings.numberSize * 1.35 + settings.dotSize;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < threshold) return true;
      }
    }
    return false;
  }

  async function exportActivePng() {
    try {
      setBusy(true);
      const canvas = createExportCanvas(readSettings());
      downloadDataUrl(canvas.toDataURL("image/png"), createPngFileName());
      setStatus("Wyeksportowano aktywną stronę PNG.");
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
      refreshGlobalBasketStatus();
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
      for (let i = 0; i < count; i += 1) await addRenderedPageToBasket(createVariantSettings(base, i), i);
      const message = "Dodano do wspólnego Koszyka Feniksa. Możesz wrócić do Fenixa albo przejść do MBG / Book Builder.";
      setStatus(message + " Dodano wariantów: " + count + ".");
      setMessage(message);
      refreshGlobalBasketStatus();
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
      for (let i = 0; i < count; i += 1) {
        const settings = createVariantSettings(base, i);
        const canvas = createExportCanvas(settings);
        pages.push({
          id: createId("dot-page"),
          sourceModule: "dot-to-dot-studio",
          pageType: "dot_to_dot_page",
          fileName: createPngFileName(i),
          title: settings.title,
          width: EXPORT_WIDTH,
          height: EXPORT_HEIGHT,
          mimeType: "image/png",
          createdAt: now,
          order: i + 1,
          dataUrl: canvas.toDataURL("image/png")
        });
      }
      downloadPack({ fenixPackVersion: 1, packType: "fenix_book_pages", sourceModule: "dot-to-dot-studio", createdAt: now, pageSize: { width: EXPORT_WIDTH, height: EXPORT_HEIGHT, dpi: 300, trim: "8.5x11" }, pages: pages });
      setStatus("Wyeksportowano " + pages.length + " stron do paczki Feniksa.");
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
    await putBasketPage({ id: createBasketPageId(), sourceModule: "dot-to-dot-studio", pageType: "dot_to_dot_page", fileName: createPngFileName(index), title: settings.title, width: EXPORT_WIDTH, height: EXPORT_HEIGHT, mimeType: "image/png", createdAt: now, updatedAt: now, blob: blob, order: Date.now() + index, includeInBook: true });
  }

  function createVariantSettings(base, index) {
    const shapeIndex = SHAPE_SEQUENCE.indexOf(resolveShapeType(base));
    const nextShape = base.shapeType === "random" || index % 2 === 1 ? SHAPE_SEQUENCE[(Math.max(0, shapeIndex) + index) % SHAPE_SEQUENCE.length] : base.shapeType;
    return Object.assign({}, base, { seed: base.seed + index * 137 + 1, shapeType: nextShape });
  }

  function createExportCanvas(settings) {
    const canvas = document.createElement("canvas");
    renderPageToCanvas(canvas, EXPORT_WIDTH, EXPORT_HEIGHT, settings);
    return canvas;
  }

  function updatePreviewSummary(settings) {
    const summary = el("dotStudioPreviewSummary");
    if (summary) summary.textContent = getShapeLabel(resolveShapeType(settings)) + " · " + getDifficultyLabel(settings.difficulty) + " · " + settings.pointCount + " punktów";
  }

  function getShapeLabel(shape) {
    const labels = { star: "Star", heart: "Heart", house: "House", fish: "Fish", rocket: "Rocket", car: "Car", flower: "Flower", butterfly: "Butterfly", dinosaur: "Dinosaur" };
    return labels[shape] || "Shape";
  }

  function getDifficultyLabel(value) {
    if (value === "easy") return "Easy";
    if (value === "hard") return "Hard";
    return "Medium";
  }

  function createRng(seed) {
    let value = Math.max(1, Math.floor(seed)) % 2147483647;
    return function () {
      value = value * 16807 % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function openBasketDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB nie jest dostępny w tej przeglądarce."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Błąd otwarcia Koszyka Feniksa.")); };
    });
  }

  async function withBasketStore(mode, callback) {
    const db = await openBasketDb();
    return new Promise(function (resolve, reject) {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      transaction.oncomplete = function () { db.close(); resolve(result); };
      transaction.onerror = function () { db.close(); reject(transaction.error || new Error("Błąd operacji Koszyka Feniksa.")); };
      try {
        result = callback(store);
      } catch (error) {
        db.close();
        reject(error);
      }
    });
  }

  function putBasketPage(page) {
    return withBasketStore("readwrite", function (store) { store.put(page); });
  }

  function refreshGlobalBasketStatus() {
    if (window.FenixBasketStatus && typeof window.FenixBasketStatus.refresh === "function") window.FenixBasketStatus.refresh();
  }

  function downloadPack(pack) {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = createPackFileName();
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
        if (blob) resolve(blob);
        else reject(new Error("Nie udało się przygotować PNG Blob."));
      }, "image/png");
    });
  }

  function createBasketPageId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return createId("fenix-basket");
  }

  function createPngFileName(index) {
    const suffix = typeof index === "number" && index > 0 ? "-" + String(index + 1).padStart(2, "0") : "";
    return "fenix-dot-to-dot-page-" + createDateStamp() + suffix + ".png";
  }

  function createPackFileName() {
    return "fenix-dot-to-dot-studio-pack-" + createDateStamp() + ".fenixpack";
  }

  function createDateStamp() {
    const now = new Date();
    const pad = function (value) { return String(value).padStart(2, "0"); };
    return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()), "-", pad(now.getHours()), pad(now.getMinutes())].join("");
  }

  function setBusy(isBusy) {
    ["dotStudioExportPng", "dotStudioAddToBasket", "dotStudioAddVariantsToBasket", "dotStudioExportPack"].forEach(function (id) {
      const button = el(id);
      if (button) button.disabled = isBusy;
    });
  }

  function setStatus(message) {
    const status = el("dotStudioStatusText");
    if (status) status.textContent = message;
  }

  function setMessage(message) {
    const node = el("dotStudioMessage");
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

  function distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function el(id) {
    return document.getElementById(id);
  }
})();
