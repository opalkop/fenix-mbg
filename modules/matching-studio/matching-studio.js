(function () {
  "use strict";

  const EXPORT_WIDTH = 2550;
  const EXPORT_HEIGHT = 3300;
  const PREVIEW_WIDTH = 765;
  const PREVIEW_HEIGHT = 990;
  const FENIX_BOOK_BASKET_DB_NAME = "fenixBookBasketDb";
  const FENIX_BOOK_BASKET_STORE_NAME = "pages";
  const FENIX_BOOK_BASKET_DB_VERSION = 1;

  const state = {
    assets: [],
    imageCache: {},
    seed: 1,
    renderToken: 0,
    isBusy: false
  };

  document.addEventListener("DOMContentLoaded", initMatchingStudio);

  function initMatchingStudio() {
    bindControls();
    applyDifficultyPreset("medium", false);
    renderAssetList();
    renderPreview();
    setStatus("Dodaj assety SVG/PNG, aby rozpocząć.");
  }

  function bindControls() {
    const fileInput = el("matchingStudioFileInput");
    if (fileInput) fileInput.addEventListener("change", handleFilesSelected);

    bindButton("matchingStudioClearAssets", clearAssets);
    bindButton("matchingStudioRefreshPreview", function () {
      state.seed += 1;
      renderPreview();
      setMessage("Odświeżono podgląd.");
    });
    bindButton("matchingStudioExportPng", exportActivePng);
    bindButton("matchingStudioAddToBasket", addActivePageToBasket);
    bindButton("matchingStudioAddVariantsToBasket", addVariantsToBasket);
    bindButton("matchingStudioExportPack", exportFenixPack);

    bindRange("matchingStudioPairCount", "");
    bindRange("matchingStudioTopMargin", " px");
    bindRange("matchingStudioSideMargin", " px");
    bindRange("matchingStudioItemSpacing", " px");
    bindRange("matchingStudioItemSize", " px");
    bindRange("matchingStudioVariantCount", "");

    [
      "matchingStudioTitle",
      "matchingStudioShowTitle",
      "matchingStudioInstruction",
      "matchingStudioMatchType",
      "matchingStudioFrameStyle",
      "matchingStudioAnswerLineStyle",
      "matchingStudioShowAnswers"
    ].forEach(function (id) {
      const node = el(id);
      if (!node) return;
      node.addEventListener("input", renderPreview);
      node.addEventListener("change", renderPreview);
    });

    const difficulty = el("matchingStudioDifficulty");
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
      easy: { pairCount: 3, itemSize: 360, itemSpacing: 285, topMargin: 620 },
      medium: { pairCount: 4, itemSize: 300, itemSpacing: 220, topMargin: 560 },
      hard: { pairCount: 6, itemSize: 230, itemSpacing: 150, topMargin: 500 }
    };
    const preset = presets[difficulty] || presets.medium;
    setRangeValue("matchingStudioPairCount", preset.pairCount, "");
    setRangeValue("matchingStudioItemSize", preset.itemSize, " px");
    setRangeValue("matchingStudioItemSpacing", preset.itemSpacing, " px");
    setRangeValue("matchingStudioTopMargin", preset.topMargin, " px");
    if (shouldSetStatus) setStatus("Dopasowano ustawienia poziomu trudności. Możesz je dalej ręcznie zmienić.");
  }

  async function handleFilesSelected(event) {
    const files = Array.from((event.target && event.target.files) || []);
    if (!files.length) return;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const asset = await createAssetFromFile(file);
        state.assets.push(asset);
        setStatus("Dodano asset: " + file.name);
      } catch (error) {
        console.error(error);
        setError("Nie udało się wczytać pliku: " + file.name);
      }
    }

    if (event.target) event.target.value = "";
    renderAssetList();
    renderPreview();
  }

  async function createAssetFromFile(file) {
    const extension = getFileExtension(file.name);
    const mime = String(file.type || "").toLowerCase();
    const isSvg = extension === "svg" || mime === "image/svg+xml";
    const isPng = extension === "png" || mime === "image/png";

    if (!isSvg && !isPng) {
      throw new Error("Obsługiwane są tylko SVG i PNG.");
    }

    if (isSvg) {
      const svgText = await readFileAsText(file);
      return {
        id: createId("matching-svg"),
        fileName: file.name,
        type: "svg",
        role: "both",
        sourceDataUrl: svgTextToDataUrl(svgText),
        createdAt: new Date().toISOString()
      };
    }

    return {
      id: createId("matching-png"),
      fileName: file.name,
      type: "png",
      role: "both",
      sourceDataUrl: await readFileAsDataUrl(file),
      createdAt: new Date().toISOString()
    };
  }

  function renderAssetList() {
    const list = el("matchingStudioAssetList");
    if (!list) return;
    list.replaceChildren();

    if (!state.assets.length) {
      const empty = document.createElement("p");
      empty.className = "matching-studio-asset-empty";
      empty.textContent = "Brak assetów. Dodaj SVG lub PNG.";
      list.appendChild(empty);
      return;
    }

    state.assets.forEach(function (asset, index) {
      const item = document.createElement("div");
      item.className = "matching-studio-asset-item";

      const img = document.createElement("img");
      img.className = "matching-studio-asset-thumb";
      img.src = asset.sourceDataUrl;
      img.alt = asset.fileName;

      const main = document.createElement("div");
      main.className = "matching-studio-asset-main";

      const name = document.createElement("strong");
      name.className = "matching-studio-asset-name";
      name.textContent = (index + 1) + ". " + asset.fileName;

      const meta = document.createElement("span");
      meta.className = "matching-studio-asset-meta";
      meta.textContent = asset.type.toUpperCase();

      const role = document.createElement("select");
      role.className = "matching-studio-asset-role";
      role.setAttribute("aria-label", "Rola assetu");
      [
        ["both", "Lewa i prawa kolumna"],
        ["left", "Tylko lewa kolumna"],
        ["right", "Tylko prawa kolumna"]
      ].forEach(function (optionData) {
        const option = document.createElement("option");
        option.value = optionData[0];
        option.textContent = optionData[1];
        role.appendChild(option);
      });
      role.value = asset.role;
      role.addEventListener("change", function () {
        asset.role = role.value;
        renderPreview();
      });

      const actions = document.createElement("div");
      actions.className = "matching-studio-asset-actions";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "matching-studio-mini-button";
      remove.textContent = "Usuń";
      remove.addEventListener("click", function () {
        delete state.imageCache[asset.id];
        state.assets = state.assets.filter(function (item) {
          return item.id !== asset.id;
        });
        renderAssetList();
        renderPreview();
      });
      actions.appendChild(remove);

      main.appendChild(name);
      main.appendChild(meta);
      main.appendChild(role);
      main.appendChild(actions);
      item.appendChild(img);
      item.appendChild(main);
      list.appendChild(item);
    });
  }

  function clearAssets() {
    state.assets = [];
    state.imageCache = {};
    renderAssetList();
    renderPreview();
    setStatus("Wyczyszczono listę assetów.");
  }

  function readSettings(overrides) {
    const settings = {
      title: getValue("matchingStudioTitle", "Match the Pairs").trim() || "Match the Pairs",
      showTitle: getChecked("matchingStudioShowTitle", true),
      instruction: getValue("matchingStudioInstruction", "Draw a line to match each pair.").trim(),
      pairCount: getNumber("matchingStudioPairCount", 4),
      topMargin: getNumber("matchingStudioTopMargin", 560),
      sideMargin: getNumber("matchingStudioSideMargin", 300),
      itemSpacing: getNumber("matchingStudioItemSpacing", 220),
      itemSize: getNumber("matchingStudioItemSize", 300),
      matchType: getValue("matchingStudioMatchType", "same"),
      difficulty: getValue("matchingStudioDifficulty", "medium"),
      frameStyle: getValue("matchingStudioFrameStyle", "rounded"),
      answerLineStyle: getValue("matchingStudioAnswerLineStyle", "dotted"),
      showAnswers: getChecked("matchingStudioShowAnswers", false),
      variantCount: getNumber("matchingStudioVariantCount", 5),
      seed: state.seed
    };
    return Object.assign(settings, overrides || {});
  }

  async function renderPreview() {
    const canvas = el("matchingStudioPreviewCanvas");
    if (!canvas) return;
    const token = ++state.renderToken;
    const settings = readSettings();
    await renderPageToCanvas(canvas, PREVIEW_WIDTH, PREVIEW_HEIGHT, settings);
    if (token !== state.renderToken) return;
    updatePreviewSummary(settings);
  }

  async function renderPageToCanvas(canvas, width, height, settings) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const scale = width / EXPORT_WIDTH;

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.scale(scale, scale);
    drawPageText(ctx, settings);
    await drawMatchingContent(ctx, settings);
    ctx.restore();
  }

  function drawPageText(ctx, settings) {
    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (settings.showTitle) {
      ctx.font = "bold 92px Arial, Helvetica, sans-serif";
      ctx.fillText(settings.title, EXPORT_WIDTH / 2, 180, EXPORT_WIDTH - 560);
    }
    if (settings.instruction) {
      ctx.font = "44px Arial, Helvetica, sans-serif";
      const y = settings.showTitle ? 300 : 210;
      ctx.fillText(settings.instruction, EXPORT_WIDTH / 2, y, EXPORT_WIDTH - 520);
    }
    ctx.restore();
  }

  function getVisualPairs(settings) {
    const leftAssets = state.assets.filter(function (asset) {
      return asset.role !== "right";
    });
    const rightAssets = state.assets.filter(function (asset) {
      return asset.role !== "left";
    });
    const baseLeft = leftAssets.length ? leftAssets : state.assets;
    const baseRight = rightAssets.length ? rightAssets : baseLeft;
    const count = Math.min(settings.pairCount, baseLeft.length || 0);
    const rightOrder = createShuffledIndexes(count, settings.seed);
    const pairs = [];

    for (let index = 0; index < count; index += 1) {
      const leftAsset = baseLeft[index];
      const rightAsset = settings.matchType === "same" || settings.matchType === "shadow" || settings.matchType === "outline"
        ? leftAsset
        : baseRight[index % baseRight.length] || leftAsset;
      pairs.push({
        leftAsset: leftAsset,
        rightAsset: rightAsset,
        rightVariant: getRightVariant(settings.matchType),
        answerRightIndex: rightOrder.indexOf(index)
      });
    }

    const visualRight = rightOrder.map(function (sourceIndex) {
      return pairs[sourceIndex];
    });
    return pairs.map(function (pair, index) {
      return {
        leftAsset: pair.leftAsset,
        rightAsset: visualRight[index] ? visualRight[index].rightAsset : pair.rightAsset,
        rightVariant: visualRight[index] ? visualRight[index].rightVariant : pair.rightVariant,
        answerRightIndex: pair.answerRightIndex
      };
    });
  }

  async function drawMatchingContent(ctx, settings) {
    const pairs = getVisualPairs(settings);
    const leftX = settings.sideMargin + settings.itemSize / 2;
    const rightX = EXPORT_WIDTH - settings.sideMargin - settings.itemSize / 2;
    const top = settings.topMargin;
    const rowGap = settings.itemSize + settings.itemSpacing;
    const layout = pairs.map(function (pair, index) {
      return {
        pair: pair,
        leftX: leftX,
        rightX: rightX,
        leftY: top + index * rowGap,
        rightY: top + index * rowGap
      };
    });

    if (!pairs.length) {
      drawEmptyPlaceholder(ctx, settings);
      return;
    }

    for (let index = 0; index < layout.length; index += 1) {
      const item = layout[index];
      await drawAssetCard(ctx, item.pair.leftAsset, item.leftX, item.leftY, settings.itemSize, "normal", settings);
      await drawAssetCard(ctx, item.pair.rightAsset, item.rightX, item.rightY, settings.itemSize, item.pair.rightVariant, settings);
    }

    if (settings.showAnswers) drawAnswerLines(ctx, layout, settings);
  }

  async function drawAssetCard(ctx, asset, centerX, centerY, size, variant, settings) {
    const cardSize = size + 52;
    drawFrame(ctx, centerX, centerY, cardSize, settings.frameStyle);

    if (!asset) {
      drawAssetPlaceholder(ctx, centerX, centerY, size);
      return;
    }

    const image = await loadAssetImage(asset);
    ctx.save();
    ctx.beginPath();
    ctx.rect(centerX - size / 2, centerY - size / 2, size, size);
    ctx.clip();
    if (variant === "shadow") {
      drawSilhouette(ctx, image, centerX, centerY, size);
    } else if (variant === "outline") {
      ctx.globalAlpha = 0.72;
      drawImageContain(ctx, image, centerX - size / 2, centerY - size / 2, size, size);
      drawSimpleOutline(ctx, centerX, centerY, size);
    } else {
      drawImageContain(ctx, image, centerX - size / 2, centerY - size / 2, size, size);
    }
    ctx.restore();
  }

  function drawFrame(ctx, centerX, centerY, size, frameStyle) {
    if (frameStyle === "none") return;
    const x = centerX - size / 2;
    const y = centerY - size / 2;
    ctx.save();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 6;
    if (frameStyle === "rounded") {
      roundRect(ctx, x, y, size, size, 28);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, size, size);
    }
    ctx.restore();
  }

  function drawSilhouette(ctx, image, centerX, centerY, size) {
    const temp = document.createElement("canvas");
    temp.width = size;
    temp.height = size;
    const tempCtx = temp.getContext("2d");
    drawImageContain(tempCtx, image, 0, 0, size, size);
    tempCtx.globalCompositeOperation = "source-in";
    tempCtx.fillStyle = "rgba(17, 24, 39, 0.42)";
    tempCtx.fillRect(0, 0, size, size);
    ctx.drawImage(temp, centerX - size / 2, centerY - size / 2);
  }

  function drawSimpleOutline(ctx, centerX, centerY, size) {
    ctx.save();
    ctx.strokeStyle = "rgba(17, 24, 39, 0.34)";
    ctx.lineWidth = 8;
    ctx.setLineDash([28, 18]);
    ctx.strokeRect(centerX - size / 2 + 18, centerY - size / 2 + 18, size - 36, size - 36);
    ctx.restore();
  }

  function drawAnswerLines(ctx, layout, settings) {
    ctx.save();
    setupAnswerLineStyle(ctx, settings);
    layout.forEach(function (item, leftIndex) {
      const targetIndex = item.pair.answerRightIndex;
      const target = layout[targetIndex] || item;
      ctx.beginPath();
      ctx.moveTo(item.leftX + settings.itemSize / 2 + 45, item.leftY);
      ctx.lineTo(target.rightX - settings.itemSize / 2 - 45, target.rightY);
      ctx.stroke();
    });
    ctx.restore();
  }

  function setupAnswerLineStyle(ctx, settings) {
    ctx.strokeStyle = settings.answerLineStyle === "light-solid" ? "rgba(17, 24, 39, 0.35)" : "rgba(17, 24, 39, 0.78)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    if (settings.answerLineStyle === "dotted") {
      ctx.setLineDash([1, 34]);
    } else if (settings.answerLineStyle === "dashed") {
      ctx.setLineDash([52, 30]);
    } else {
      ctx.setLineDash([]);
    }
  }

  function drawEmptyPlaceholder(ctx, settings) {
    ctx.save();
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 6;
    ctx.setLineDash([22, 18]);
    ctx.strokeRect(settings.sideMargin, settings.topMargin, EXPORT_WIDTH - settings.sideMargin * 2, 1180);
    ctx.setLineDash([]);
    ctx.fillStyle = "#111827";
    ctx.font = "bold 58px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Dodaj SVG lub PNG, aby stworzyć stronę matching", EXPORT_WIDTH / 2, settings.topMargin + 590, EXPORT_WIDTH - settings.sideMargin * 2 - 120);
    ctx.restore();
  }

  function drawAssetPlaceholder(ctx, centerX, centerY, size) {
    ctx.save();
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 5;
    ctx.setLineDash([18, 16]);
    ctx.strokeRect(centerX - size / 2, centerY - size / 2, size, size);
    ctx.restore();
  }

  async function exportActivePng() {
    try {
      setBusy(true);
      const canvas = await createExportCanvas(readSettings());
      downloadDataUrl(canvas.toDataURL("image/png"), createMatchingPngFileName());
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
        const canvas = await createExportCanvas(settings);
        pages.push({
          id: createId("matching-page"),
          sourceModule: "matching-studio",
          pageType: "matching_page",
          fileName: createMatchingPngFileName(index),
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
        sourceModule: "matching-studio",
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
      setStatus("Wyeksportowano " + pages.length + " stron do paczki Feniksa.");
      setMessage("Wyeksportowano .fenixpack zgodny z MBG.");
    } catch (error) {
      console.error(error);
      setError("Błąd eksportu .fenixpack.");
    } finally {
      setBusy(false);
    }
  }

  async function addRenderedPageToBasket(settings, index) {
    const canvas = await createExportCanvas(settings);
    const blob = await canvasToPngBlob(canvas);
    const now = new Date().toISOString();
    await addFenixBookBasketPage({
      id: createFenixBookBasketPageId(),
      sourceModule: "matching-studio",
      pageType: "matching_page",
      fileName: createMatchingPngFileName(index),
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

  async function createExportCanvas(settings) {
    const canvas = document.createElement("canvas");
    await renderPageToCanvas(canvas, EXPORT_WIDTH, EXPORT_HEIGHT, settings);
    return canvas;
  }

  function createVariantSettings(base, index) {
    return Object.assign({}, base, {
      seed: base.seed + index + 1
    });
  }

  function createPageTitle(settings, index, count) {
    const suffix = count > 1 || index > 0 ? " " + (index + 1) : "";
    return (settings.title || "Matching Page") + suffix;
  }

  function getRightVariant(matchType) {
    if (matchType === "shadow") return "shadow";
    if (matchType === "outline") return "outline";
    return "normal";
  }

  function createShuffledIndexes(count, seed) {
    const indexes = [];
    for (let index = 0; index < count; index += 1) indexes.push(index);
    for (let index = indexes.length - 1; index > 0; index -= 1) {
      const target = seededNumber(seed + index) % (index + 1);
      const temp = indexes[index];
      indexes[index] = indexes[target];
      indexes[target] = temp;
    }
    if (count > 1 && indexes.every(function (value, index) { return value === index; })) {
      indexes.push(indexes.shift());
    }
    return indexes;
  }

  function seededNumber(seed) {
    let value = Math.floor(seed * 9301 + 49297) % 233280;
    value = (value * 9301 + 49297) % 233280;
    return value;
  }

  function updatePreviewSummary(settings) {
    const summary = el("matchingStudioPreviewSummary");
    if (!summary) return;
    summary.textContent = getDifficultyLabel(settings.difficulty) + " · " + getMatchTypeLabel(settings.matchType) + " · " + settings.pairCount + " par";
  }

  function getDifficultyLabel(value) {
    if (value === "easy") return "Easy";
    if (value === "hard") return "Hard";
    return "Medium";
  }

  function getMatchTypeLabel(value) {
    const labels = {
      same: "takie same obrazki",
      shadow: "obrazek z cieniem",
      outline: "obrazek z konturem",
      theme: "pary tematyczne",
      category: "kategorie"
    };
    return labels[value] || "matching";
  }

  function loadAssetImage(asset) {
    if (state.imageCache[asset.id]) return Promise.resolve(state.imageCache[asset.id]);
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () {
        state.imageCache[asset.id] = image;
        resolve(image);
      };
      image.onerror = function () {
        reject(new Error("Nie udało się wczytać assetu: " + asset.fileName));
      };
      image.src = asset.sourceDataUrl;
    });
  }

  function drawImageContain(ctx, image, x, y, width, height) {
    const imageWidth = image.naturalWidth || image.width || width;
    const imageHeight = image.naturalHeight || image.height || height;
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
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

  function createMatchingPngFileName(index) {
    const suffix = typeof index === "number" && index > 0 ? "-" + String(index + 1).padStart(2, "0") : "";
    return "fenix-matching-page-" + createDateStamp() + suffix + ".png";
  }

  function createFenixPackFileName() {
    return "fenix-matching-studio-pack-" + createDateStamp() + ".fenixpack";
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
    [
      "matchingStudioExportPng",
      "matchingStudioAddToBasket",
      "matchingStudioAddVariantsToBasket",
      "matchingStudioExportPack"
    ].forEach(function (id) {
      const button = el(id);
      if (button) button.disabled = isBusy;
    });
  }

  function setStatus(message) {
    const status = el("matchingStudioStatusText");
    if (status) status.textContent = message;
  }

  function setMessage(message) {
    const node = el("matchingStudioMessage");
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

  function getFileExtension(fileName) {
    const match = String(fileName || "").toLowerCase().match(/\.([^.]+)$/);
    return match ? match[1] : "";
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        reject(reader.error || new Error("Nie udało się odczytać pliku."));
      };
      reader.readAsText(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        reject(reader.error || new Error("Nie udało się odczytać pliku."));
      };
      reader.readAsDataURL(file);
    });
  }

  function svgTextToDataUrl(svgText) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
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
