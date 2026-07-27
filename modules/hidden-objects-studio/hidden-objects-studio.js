(function () {
  "use strict";

  const EXPORT_WIDTH = 2550;
  const EXPORT_HEIGHT = 3300;
  const PREVIEW_WIDTH = 765;
  const PREVIEW_HEIGHT = 990;
  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;
  const BUILT_IN_DISTRACTORS = ["star", "heart", "circle", "triangle", "diamond", "leaf", "flower", "cloud", "spiral", "dot-cluster"];

  const state = {
    assets: [],
    imageCache: {},
    renderToken: 0,
    isBusy: false
  };

  document.addEventListener("DOMContentLoaded", initHiddenObjectsStudio);

  function initHiddenObjectsStudio() {
    bindControls();
    applyDifficultyPreset("medium", false);
    renderAssetList();
    renderPreview();
    setStatus("Dodaj assety SVG/PNG albo sprawdź układ na podglądzie.");
  }

  function bindControls() {
    const fileInput = el("hiddenStudioFileInput");
    if (fileInput) fileInput.addEventListener("change", handleFilesSelected);

    bindButton("hiddenStudioClearAssets", clearAssets);
    bindButton("hiddenStudioRefreshPreview", renderPreview);
    bindButton("hiddenStudioRandomize", randomizeLayout);
    bindButton("hiddenStudioExportPng", exportActivePng);
    bindButton("hiddenStudioAddToBasket", addActivePageToBasket);
    bindButton("hiddenStudioAddVariantsToBasket", addVariantsToBasket);
    bindButton("hiddenStudioExportPack", exportFenixPack);

    ["hiddenStudioObjectCount", "hiddenStudioDistractorCount", "hiddenStudioDensity", "hiddenStudioMinScale", "hiddenStudioMaxScale", "hiddenStudioMinSpacing", "hiddenStudioSeed", "hiddenStudioVariantCount"].forEach(function (id) {
      const suffix = id === "hiddenStudioObjectCount" || id === "hiddenStudioDistractorCount" || id === "hiddenStudioSeed" || id === "hiddenStudioVariantCount" ? "" : id === "hiddenStudioMinSpacing" ? " px" : "%";
      bindRange(id, suffix);
    });

    ["hiddenStudioShowTitle", "hiddenStudioTitle", "hiddenStudioInstruction", "hiddenStudioPageType", "hiddenStudioShowFindList", "hiddenStudioFindPosition", "hiddenStudioShowSolution", "hiddenStudioAutoFillScene", "hiddenStudioUseBuiltInDistractors", "hiddenStudioAllowFindAsDistractors", "hiddenStudioRandomRotation", "hiddenStudioRandomFlip"].forEach(function (id) {
      const node = el(id);
      if (!node) return;
      node.addEventListener("input", renderPreview);
      node.addEventListener("change", renderPreview);
    });

    const difficulty = el("hiddenStudioDifficulty");
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
      easy: { objects: 9, distractors: 14, density: 48, minScale: 24, maxScale: 42, spacing: 54, rotation: false, flip: false },
      medium: { objects: 14, distractors: 24, density: 62, minScale: 18, maxScale: 34, spacing: 36, rotation: true, flip: false },
      hard: { objects: 24, distractors: 42, density: 78, minScale: 12, maxScale: 28, spacing: 18, rotation: true, flip: true }
    };
    const preset = presets[difficulty] || presets.medium;
    setRangeValue("hiddenStudioObjectCount", preset.objects, "");
    setRangeValue("hiddenStudioDistractorCount", preset.distractors, "");
    setRangeValue("hiddenStudioDensity", preset.density, "%");
    setRangeValue("hiddenStudioMinScale", preset.minScale, "%");
    setRangeValue("hiddenStudioMaxScale", preset.maxScale, "%");
    setRangeValue("hiddenStudioMinSpacing", preset.spacing, " px");
    setChecked("hiddenStudioRandomRotation", preset.rotation);
    setChecked("hiddenStudioRandomFlip", preset.flip);
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
    if (!isSvg && !isPng) throw new Error("Obsługiwane są tylko SVG i PNG.");

    const name = cleanAssetName(file.name);
    if (isSvg) {
      const svgText = await readFileAsText(file);
      return { id: createId("hidden-svg"), fileName: file.name, name: name, type: "svg", findCopies: 3, fillerCopies: 4, includeInFind: true, useAsFiller: false, sourceDataUrl: svgTextToDataUrl(svgText), createdAt: new Date().toISOString() };
    }
    return { id: createId("hidden-png"), fileName: file.name, name: name, type: "png", findCopies: 3, fillerCopies: 4, includeInFind: true, useAsFiller: false, sourceDataUrl: await readFileAsDataUrl(file), createdAt: new Date().toISOString() };
  }

  function renderAssetList() {
    const list = el("hiddenStudioAssetList");
    if (!list) return;
    list.replaceChildren();

    if (!state.assets.length) {
      const empty = document.createElement("p");
      empty.className = "hidden-studio-asset-empty";
      empty.textContent = "Brak assetów. Dodaj SVG lub PNG.";
      list.appendChild(empty);
      return;
    }

    state.assets.forEach(function (asset, index) {
      const item = document.createElement("div");
      item.className = "hidden-studio-asset-item";

      const img = document.createElement("img");
      img.className = "hidden-studio-asset-thumb";
      img.src = asset.sourceDataUrl;
      img.alt = asset.fileName;

      const main = document.createElement("div");
      main.className = "hidden-studio-asset-main";

      const title = document.createElement("strong");
      title.className = "hidden-studio-asset-name";
      title.textContent = (index + 1) + ". " + asset.fileName + " · " + asset.type.toUpperCase();

      const controls = document.createElement("div");
      controls.className = "hidden-studio-asset-controls";

      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Nazwa na liście";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = asset.name;
      nameInput.maxLength = 40;
      nameInput.addEventListener("input", function () {
        asset.name = nameInput.value.trim() || cleanAssetName(asset.fileName);
        renderPreview();
      });
      nameLabel.appendChild(nameInput);

      normalizeAssetRoles(asset);

      const copiesLabel = document.createElement("label");
      copiesLabel.textContent = "Kopie Find";
      const copiesInput = document.createElement("input");
      copiesInput.type = "number";
      copiesInput.min = "0";
      copiesInput.max = "30";
      copiesInput.value = String(asset.findCopies);
      copiesInput.addEventListener("change", function () {
        asset.findCopies = clamp(Number(copiesInput.value) || 0, 0, 30);
        copiesInput.value = String(asset.findCopies);
        renderPreview();
      });
      copiesLabel.appendChild(copiesInput);

      const fillerLabel = document.createElement("label");
      fillerLabel.textContent = "Kopie dodatkowe";
      const fillerInput = document.createElement("input");
      fillerInput.type = "number";
      fillerInput.min = "0";
      fillerInput.max = "40";
      fillerInput.value = String(asset.fillerCopies);
      fillerInput.addEventListener("change", function () {
        asset.fillerCopies = clamp(Number(fillerInput.value) || 0, 0, 40);
        fillerInput.value = String(asset.fillerCopies);
        renderPreview();
      });
      fillerLabel.appendChild(fillerInput);

      controls.appendChild(nameLabel);
      controls.appendChild(copiesLabel);
      controls.appendChild(fillerLabel);

      const row = document.createElement("div");
      row.className = "hidden-studio-asset-row";
      const findLabel = document.createElement("label");
      const findInput = document.createElement("input");
      findInput.type = "checkbox";
      findInput.checked = asset.includeInFind;
      findInput.addEventListener("change", function () {
        asset.includeInFind = findInput.checked;
        renderPreview();
      });
      findLabel.appendChild(findInput);
      findLabel.appendChild(document.createTextNode("Na liście Find"));

      const fillerCheckLabel = document.createElement("label");
      const fillerCheck = document.createElement("input");
      fillerCheck.type = "checkbox";
      fillerCheck.checked = asset.useAsFiller;
      fillerCheck.addEventListener("change", function () {
        asset.useAsFiller = fillerCheck.checked;
        renderPreview();
      });
      fillerCheckLabel.appendChild(fillerCheck);
      fillerCheckLabel.appendChild(document.createTextNode("Użyj jako dystraktor/dekorację"));

      const roleNote = document.createElement("span");
      roleNote.className = "hidden-studio-asset-warning";
      roleNote.textContent = asset.includeInFind && asset.useAsFiller
        ? "Ten asset jest też obiektem szukanym. Dodatkowe kopie są blokowane, dopóki globalna zgoda jest OFF."
        : "";

      const remove = document.createElement("button");
      remove.className = "hidden-studio-button hidden-studio-button-secondary";
      remove.type = "button";
      remove.textContent = "Usuń";
      remove.addEventListener("click", function () {
        state.assets = state.assets.filter(function (item) { return item.id !== asset.id; });
        delete state.imageCache[asset.id];
        renderAssetList();
        renderPreview();
      });

      row.appendChild(findLabel);
      row.appendChild(fillerCheckLabel);
      row.appendChild(remove);
      main.appendChild(title);
      main.appendChild(controls);
      main.appendChild(row);
      if (roleNote.textContent) main.appendChild(roleNote);
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

  function randomizeLayout() {
    const nextSeed = (getNumber("hiddenStudioSeed", 1) + 149) % 9999 || 1;
    setRangeValue("hiddenStudioSeed", nextSeed, "");
    setStatus("Wylosowano nowy układ sceny.");
    renderPreview();
  }

  function readSettings(overrides) {
    const minScale = getNumber("hiddenStudioMinScale", 18);
    const maxScale = Math.max(minScale, getNumber("hiddenStudioMaxScale", 34));
    const settings = {
      showTitle: getChecked("hiddenStudioShowTitle", true),
      title: getValue("hiddenStudioTitle", "Hidden Objects").trim() || "Hidden Objects",
      instruction: getValue("hiddenStudioInstruction", "Find and circle the objects.").trim(),
      pageType: getValue("hiddenStudioPageType", "find-objects"),
      difficulty: getValue("hiddenStudioDifficulty", "medium"),
      objectCount: getNumber("hiddenStudioObjectCount", 20),
      distractorCount: getNumber("hiddenStudioDistractorCount", 22),
      density: getNumber("hiddenStudioDensity", 62) / 100,
      minScale: minScale / 100,
      maxScale: maxScale / 100,
      minSpacing: getNumber("hiddenStudioMinSpacing", 36),
      randomRotation: getChecked("hiddenStudioRandomRotation", true),
      randomFlip: getChecked("hiddenStudioRandomFlip", false),
      showFindList: getChecked("hiddenStudioShowFindList", true),
      findPosition: getValue("hiddenStudioFindPosition", "bottom"),
      showSolution: getChecked("hiddenStudioShowSolution", false),
      autoFillScene: getChecked("hiddenStudioAutoFillScene", true),
      useBuiltInDistractors: getChecked("hiddenStudioUseBuiltInDistractors", true),
      allowFindAsDistractors: getChecked("hiddenStudioAllowFindAsDistractors", false),
      seed: getNumber("hiddenStudioSeed", 1),
      variantCount: getNumber("hiddenStudioVariantCount", 5)
    };
    return Object.assign(settings, overrides || {});
  }

  async function renderPreview() {
    const canvas = el("hiddenStudioPreviewCanvas");
    if (!canvas) return;
    const token = state.renderToken + 1;
    state.renderToken = token;
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
    drawHeader(ctx, settings);
    await drawHiddenObjectsPage(ctx, settings);
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

  async function drawHiddenObjectsPage(ctx, settings) {
    const layout = computeLayout(settings);
    const rng = createRng(settings.seed);
    const instances = createObjectInstances(settings, rng);
    const placement = placeObjects(instances, layout.sceneRect, settings, rng);

    if (settings.showFindList && layout.findRect) drawFindList(ctx, layout.findRect, placement.items, settings);
    drawSceneBoundary(ctx, layout.sceneRect);
    if (!state.assets.length && !settings.useBuiltInDistractors) drawNoAssetHint(ctx, layout.sceneRect);
    await drawSceneObjects(ctx, placement.items, settings);

    const warning = placement.crowded ? "Układ może być zbyt gęsty. Zmniejsz liczbę obiektów, skalę albo gęstość sceny." : "Scena jest gotowa do eksportu.";
    setMessage(warning);
  }

  function computeLayout(settings) {
    const top = settings.showTitle || settings.instruction ? 410 : 270;
    const baseScene = { x: 250, y: top, w: 2050, h: 2580 };
    if (!settings.showFindList) return { sceneRect: baseScene, findRect: null };

    if (settings.findPosition === "top") {
      return {
        findRect: { x: 260, y: top, w: 2030, h: 310 },
        sceneRect: { x: 250, y: top + 380, w: 2050, h: 2190 }
      };
    }
    if (settings.findPosition === "side") {
      return {
        sceneRect: { x: 230, y: top, w: 1510, h: 2580 },
        findRect: { x: 1810, y: top, w: 500, h: 2580 }
      };
    }
    return {
      sceneRect: { x: 250, y: top, w: 2050, h: 2140 },
      findRect: { x: 260, y: top + 2230, w: 2030, h: 350 }
    };
  }

  function drawFindList(ctx, rect, items, settings) {
    const counts = getFindCounts(items);
    ctx.save();
    ctx.strokeStyle = "rgba(17, 24, 39, 0.22)";
    ctx.lineWidth = 4;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = "#111827";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "bold 44px Arial, Helvetica, sans-serif";
    ctx.fillText(getFindListTitle(settings.pageType), rect.x + 34, rect.y + 28, rect.w - 68);

    ctx.font = "36px Arial, Helvetica, sans-serif";
    const entries = counts.length ? counts : [{ name: "objects", count: 0 }];
    const columns = settings.findPosition === "side" ? 1 : Math.min(4, Math.max(1, Math.ceil(entries.length / 2)));
    const colW = (rect.w - 68) / columns;
    entries.forEach(function (entry, index) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = rect.x + 34 + col * colW;
      const y = rect.y + 100 + row * 54;
      const label = "• " + entry.count + " " + pluralize(entry.name, entry.count);
      ctx.fillText(label, x, y, colW - 18);
    });
    ctx.restore();
  }

  function drawSceneBoundary(ctx, rect) {
    ctx.save();
    ctx.strokeStyle = "rgba(17, 24, 39, 0.08)";
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 18]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawNoAssetHint(ctx, rect) {
    ctx.save();
    ctx.fillStyle = "rgba(17, 24, 39, 0.62)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "42px Arial, Helvetica, sans-serif";
    ctx.fillText("Dodaj SVG lub PNG, aby zbudować scenę.", rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w - 180);
    ctx.restore();
  }

  async function drawSceneObjects(ctx, items, settings) {
    for (let index = 0; index < items.length; index += 1) {
      await drawObject(ctx, items[index], settings);
    }
  }

  async function drawObject(ctx, item, settings) {
    if (item.asset.type === "built-in") {
      drawBuiltInDistractor(ctx, item);
      if (settings.showSolution && item.isFindTargetInstance) drawSolutionMark(ctx, item);
      return;
    }

    let image;
    try {
      image = await getAssetImage(item.asset);
    } catch (error) {
      console.error(error);
      drawFallbackObject(ctx, item);
      return;
    }
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation);
    ctx.scale(item.flip ? -1 : 1, 1);
    ctx.globalAlpha = 0.96;
    ctx.filter = "grayscale(1) contrast(1.08)";
    ctx.drawImage(image, -item.w / 2, -item.h / 2, item.w, item.h);
    ctx.restore();

    if (settings.showSolution && item.isFindTargetInstance) drawSolutionMark(ctx, item);
  }

  function drawSolutionMark(ctx, item) {
    ctx.save();
    ctx.strokeStyle = "rgba(17, 24, 39, 0.38)";
    ctx.lineWidth = 5;
    ctx.setLineDash([18, 16]);
    ctx.beginPath();
    ctx.ellipse(item.x, item.y, item.w * 0.58, item.h * 0.58, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawFallbackObject(ctx, item) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(item.w, item.h) * 0.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-item.w * 0.22, 0);
    ctx.lineTo(item.w * 0.22, 0);
    ctx.moveTo(0, -item.h * 0.22);
    ctx.lineTo(0, item.h * 0.22);
    ctx.stroke();
    ctx.restore();
  }

  function drawBuiltInDistractor(ctx, item) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation);
    ctx.scale(item.flip ? -1 : 1, 1);
    ctx.strokeStyle = "rgba(17, 24, 39, 0.66)";
    ctx.fillStyle = "rgba(17, 24, 39, 0.08)";
    ctx.lineWidth = Math.max(3, Math.min(item.w, item.h) * 0.055);
    const size = Math.min(item.w, item.h) * 0.46;

    if (item.asset.shape === "star") drawBuiltInStar(ctx, size);
    else if (item.asset.shape === "heart") drawBuiltInHeart(ctx, size);
    else if (item.asset.shape === "triangle") drawBuiltInPolygon(ctx, size, 3);
    else if (item.asset.shape === "diamond") drawBuiltInDiamond(ctx, size);
    else if (item.asset.shape === "leaf") drawBuiltInLeaf(ctx, size);
    else if (item.asset.shape === "flower") drawBuiltInFlower(ctx, size);
    else if (item.asset.shape === "cloud") drawBuiltInCloud(ctx, size);
    else if (item.asset.shape === "spiral") drawBuiltInSpiral(ctx, size);
    else if (item.asset.shape === "dot-cluster") drawBuiltInDotCluster(ctx, size);
    else drawBuiltInCircle(ctx, size);

    ctx.restore();
  }

  function drawBuiltInCircle(ctx, size) {
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawBuiltInPolygon(ctx, size, sides) {
    ctx.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / sides;
      const x = Math.cos(angle) * size;
      const y = Math.sin(angle) * size;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawBuiltInStar(ctx, size) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? size : size * 0.42;
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 10;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawBuiltInHeart(ctx, size) {
    ctx.beginPath();
    ctx.moveTo(0, size * 0.72);
    ctx.bezierCurveTo(-size * 1.18, -size * 0.08, -size * 0.75, -size * 0.95, 0, -size * 0.36);
    ctx.bezierCurveTo(size * 0.75, -size * 0.95, size * 1.18, -size * 0.08, 0, size * 0.72);
    ctx.fill();
    ctx.stroke();
  }

  function drawBuiltInDiamond(ctx, size) {
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.78, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.78, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawBuiltInLeaf(ctx, size) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.82, size * 0.18);
    ctx.bezierCurveTo(-size * 0.2, -size, size * 0.78, -size * 0.72, size * 0.84, size * 0.08);
    ctx.bezierCurveTo(size * 0.16, size * 0.8, -size * 0.5, size * 0.72, -size * 0.82, size * 0.18);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.64, size * 0.16);
    ctx.lineTo(size * 0.52, -size * 0.12);
    ctx.stroke();
  }

  function drawBuiltInFlower(ctx, size) {
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI * 2 * i) / 6;
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * size * 0.44, Math.sin(angle) * size * 0.44, size * 0.28, size * 0.44, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawBuiltInCloud(ctx, size) {
    ctx.beginPath();
    ctx.arc(-size * 0.45, size * 0.12, size * 0.36, Math.PI * 0.85, Math.PI * 1.85);
    ctx.arc(0, -size * 0.08, size * 0.46, Math.PI * 1.05, Math.PI * 1.95);
    ctx.arc(size * 0.44, size * 0.1, size * 0.34, Math.PI * 1.18, Math.PI * 0.15);
    ctx.lineTo(-size * 0.62, size * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawBuiltInSpiral(ctx, size) {
    ctx.beginPath();
    for (let i = 0; i < 50; i += 1) {
      const t = i / 49;
      const angle = t * Math.PI * 4.4;
      const radius = size * t;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawBuiltInDotCluster(ctx, size) {
    const dots = [[-0.42,-0.3],[0.06,-0.42],[0.46,-0.12],[-0.12,0.12],[-0.48,0.32],[0.34,0.42]];
    dots.forEach(function (dot) {
      ctx.beginPath();
      ctx.arc(dot[0] * size, dot[1] * size, size * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function createObjectInstances(settings, rng) {
    state.assets.forEach(normalizeAssetRoles);

    const findPool = [];
    const fillerPool = [];
    state.assets.forEach(function (asset) {
      if (asset.includeInFind) {
        for (let i = 0; i < asset.findCopies; i += 1) findPool.push(asset);
      }
      if (asset.useAsFiller && (settings.allowFindAsDistractors || !asset.includeInFind)) {
        for (let i = 0; i < asset.fillerCopies; i += 1) fillerPool.push(asset);
      }
    });

    const markedFindAssets = state.assets.filter(function (asset) { return asset.includeInFind; });
    const fallbackFindAssets = markedFindAssets.length ? [] : state.assets.length ? [] : createBuiltInAssets(3, true);
    while (findPool.length < settings.objectCount && fallbackFindAssets.length) {
      const asset = fallbackFindAssets[Math.floor(rng() * fallbackFindAssets.length)];
      findPool.push(asset);
    }

    if (settings.autoFillScene) {
      while (fillerPool.length < settings.distractorCount && state.assets.length) {
        const fillerSource = state.assets.filter(function (asset) {
          return asset.useAsFiller && (settings.allowFindAsDistractors || !asset.includeInFind);
        });
        if (!fillerSource.length) break;
        fillerPool.push(fillerSource[Math.floor(rng() * fillerSource.length)]);
      }
      if (settings.useBuiltInDistractors) {
        createBuiltInAssets(settings.distractorCount, false).forEach(function (asset) {
          fillerPool.push(asset);
        });
      }
    }

    const findItems = shuffle(findPool, rng).slice(0, settings.objectCount).map(function (asset, index) {
      return createSceneItem(asset, index, true, settings, rng);
    });

    const fillerTarget = settings.autoFillScene ? settings.distractorCount : 0;
    const fillerItems = shuffle(fillerPool, rng).slice(0, fillerTarget).map(function (asset, index) {
      return createSceneItem(asset, findItems.length + index, false, settings, rng);
    });

    return shuffle(findItems.concat(fillerItems), rng);
  }

  function createSceneItem(asset, index, isFindTarget, settings, rng) {
    const scaleBias = isFindTarget ? 1 : 0.72 + rng() * 0.24;
    const scale = (settings.minScale + rng() * (settings.maxScale - settings.minScale)) * scaleBias;
    const base = asset.type === "built-in" ? 320 * scale : 360 * scale;
    return {
      assetId: asset.id,
      asset: asset,
      index: index,
      role: isFindTarget ? "find" : asset.type === "built-in" ? "filler" : "decoy",
      isFindTargetInstance: isFindTarget,
      w: base,
      h: base,
      rotation: settings.randomRotation || asset.type === "built-in" ? (rng() - 0.5) * (settings.difficulty === "hard" ? 1.25 : 0.72) : 0,
      flip: settings.randomFlip ? rng() > 0.5 : false
    };
  }

  function createBuiltInAssets(count, asFindTargets) {
    const total = Math.max(count, 1);
    const result = [];
    for (let i = 0; i < total; i += 1) {
      const shape = BUILT_IN_DISTRACTORS[i % BUILT_IN_DISTRACTORS.length];
      result.push({ id: "built-in-" + shape + "-" + i, fileName: shape, name: shape.replace("-", " "), type: "built-in", shape: shape, includeInFind: asFindTargets, useAsFiller: true });
    }
    return result;
  }

  function normalizeAssetRoles(asset) {
    if (typeof asset.findCopies !== "number") asset.findCopies = typeof asset.copies === "number" ? asset.copies : 3;
    if (typeof asset.fillerCopies !== "number") asset.fillerCopies = asset.includeInFind ? Math.max(2, Math.ceil(asset.findCopies * 1.2)) : 4;
    if (typeof asset.useAsFiller !== "boolean") asset.useAsFiller = true;
    if (typeof asset.includeInFind !== "boolean") asset.includeInFind = true;
  }

  function placeObjects(instances, rect, settings, rng) {
    const items = [];
    const boxes = [];
    let crowded = false;
    const padding = settings.minSpacing + (1 - settings.density) * 72;

    instances.forEach(function (item) {
      const placed = Object.assign({}, item);
      const halfW = item.w / 2;
      const halfH = item.h / 2;
      let found = false;
      for (let attempt = 0; attempt < 90; attempt += 1) {
        placed.x = rect.x + halfW + rng() * Math.max(1, rect.w - item.w);
        placed.y = rect.y + halfH + rng() * Math.max(1, rect.h - item.h);
        const box = toBox(placed, padding);
        if (!boxes.some(function (existing) { return boxesOverlap(box, existing); })) {
          boxes.push(box);
          found = true;
          break;
        }
      }
      if (!found) {
        const smaller = Object.assign({}, placed, { w: placed.w * 0.82, h: placed.h * 0.82 });
        for (let attempt = 0; attempt < 50; attempt += 1) {
          smaller.x = rect.x + smaller.w / 2 + rng() * Math.max(1, rect.w - smaller.w);
          smaller.y = rect.y + smaller.h / 2 + rng() * Math.max(1, rect.h - smaller.h);
          const smallBox = toBox(smaller, Math.max(6, padding * 0.45));
          if (!boxes.some(function (existing) { return boxesOverlap(smallBox, existing); })) {
            Object.assign(placed, smaller);
            boxes.push(smallBox);
            found = true;
            break;
          }
        }
      }
      if (!found) {
        crowded = true;
        if (!placed.isFindTargetInstance) return;
        const fallback = gridPosition(items.length, instances.length, rect);
        placed.x = fallback.x;
        placed.y = fallback.y;
        boxes.push(toBox(placed, Math.max(8, padding * 0.25)));
      }
      items.push(placed);
    });

    return { items: items, crowded: crowded };
  }

  function gridPosition(index, total, rect) {
    const columns = Math.ceil(Math.sqrt(total * (rect.w / rect.h)));
    const rows = Math.ceil(total / columns);
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: rect.x + rect.w * ((col + 0.5) / columns),
      y: rect.y + rect.h * ((row + 0.5) / rows)
    };
  }

  function toBox(item, padding) {
    return { x1: item.x - item.w / 2 - padding, y1: item.y - item.h / 2 - padding, x2: item.x + item.w / 2 + padding, y2: item.y + item.h / 2 + padding };
  }

  function boxesOverlap(a, b) {
    return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  }

  function getFindCounts(items) {
    const map = {};
    items.forEach(function (item) {
      if (!item.isFindTargetInstance) return;
      const key = item.asset.id;
      if (!map[key]) map[key] = { name: item.asset.name || cleanAssetName(item.asset.fileName), count: 0 };
      map[key].count += 1;
    });
    return Object.keys(map).map(function (key) { return map[key]; });
  }

  function getFindListTitle(pageType) {
    if (pageType === "i-spy") return "I spy...";
    if (pageType === "search-circle") return "Search and circle:";
    if (pageType === "count-find") return "Count and find:";
    if (pageType === "themed-scene") return "Find:";
    return "Find and circle:";
  }

  async function getAssetImage(asset) {
    if (state.imageCache[asset.id]) return state.imageCache[asset.id];
    const image = await loadImage(asset.sourceDataUrl);
    state.imageCache[asset.id] = image;
    return image;
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("Nie udało się wczytać obrazu.")); };
      image.src = src;
    });
  }

  async function exportActivePng() {
    try {
      setBusy(true);
      const canvas = await createExportCanvas(readSettings());
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
        const canvas = await createExportCanvas(settings);
        pages.push({ id: createId("hidden-page"), sourceModule: "hidden-objects-studio", pageType: "hidden_objects_page", fileName: createPngFileName(i), title: settings.title, width: EXPORT_WIDTH, height: EXPORT_HEIGHT, mimeType: "image/png", createdAt: now, order: i + 1, dataUrl: canvas.toDataURL("image/png") });
      }
      downloadPack({ fenixPackVersion: 1, packType: "fenix_book_pages", sourceModule: "hidden-objects-studio", createdAt: now, pageSize: { width: EXPORT_WIDTH, height: EXPORT_HEIGHT, dpi: 300, trim: "8.5x11" }, pages: pages });
      setStatus("Wyeksportowano " + pages.length + " stron do paczki Feniksa.");
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
    await putBasketPage({ id: createBasketPageId(), sourceModule: "hidden-objects-studio", pageType: "hidden_objects_page", fileName: createPngFileName(index), title: settings.title, width: EXPORT_WIDTH, height: EXPORT_HEIGHT, mimeType: "image/png", createdAt: now, updatedAt: now, blob: blob, order: Date.now() + index, includeInBook: true });
  }

  function createVariantSettings(base, index) {
    return Object.assign({}, base, { seed: base.seed + index * 149 + 1, showSolution: base.showSolution });
  }

  async function createExportCanvas(settings) {
    const canvas = document.createElement("canvas");
    await renderPageToCanvas(canvas, EXPORT_WIDTH, EXPORT_HEIGHT, settings);
    return canvas;
  }

  function updatePreviewSummary(settings) {
    const summary = el("hiddenStudioPreviewSummary");
    if (summary) summary.textContent = getPageTypeLabel(settings.pageType) + " · " + getDifficultyLabel(settings.difficulty) + " · " + settings.objectCount + " obiektów";
  }

  function getPageTypeLabel(type) {
    const labels = { "find-objects": "Find Objects", "i-spy": "I Spy", "search-circle": "Search and Circle", "count-find": "Count and Find", "themed-scene": "Themed Scene" };
    return labels[type] || "Find Objects";
  }

  function getDifficultyLabel(value) {
    if (value === "easy") return "Easy";
    if (value === "hard") return "Hard";
    return "Medium";
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

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error("Błąd odczytu pliku.")); };
      reader.readAsText(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error("Błąd odczytu pliku.")); };
      reader.readAsDataURL(file);
    });
  }

  function svgTextToDataUrl(svgText) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
  }

  function createBasketPageId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return createId("fenix-basket");
  }

  function createPngFileName(index) {
    const suffix = typeof index === "number" && index > 0 ? "-" + String(index + 1).padStart(2, "0") : "";
    return "fenix-hidden-objects-page-" + createDateStamp() + suffix + ".png";
  }

  function createPackFileName() {
    return "fenix-hidden-objects-studio-pack-" + createDateStamp() + ".fenixpack";
  }

  function createDateStamp() {
    const now = new Date();
    const pad = function (value) { return String(value).padStart(2, "0"); };
    return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()), "-", pad(now.getHours()), pad(now.getMinutes())].join("");
  }

  function createRng(seed) {
    let value = Math.max(1, Math.floor(seed)) % 2147483647;
    return function () {
      value = value * 16807 % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function shuffle(items, rng) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  function pluralize(name, count) {
    return count === 1 ? name : name;
  }

  function cleanAssetName(fileName) {
    return String(fileName || "object").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "object";
  }

  function getFileExtension(fileName) {
    const parts = String(fileName || "").toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() : "";
  }

  function setBusy(isBusy) {
    state.isBusy = isBusy;
    ["hiddenStudioExportPng", "hiddenStudioAddToBasket", "hiddenStudioAddVariantsToBasket", "hiddenStudioExportPack"].forEach(function (id) {
      const button = el(id);
      if (button) button.disabled = isBusy;
    });
  }

  function setStatus(message) {
    const status = el("hiddenStudioStatusText");
    if (status) status.textContent = message;
  }

  function setMessage(message) {
    const node = el("hiddenStudioMessage");
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

  function setChecked(id, value) {
    const node = el(id);
    if (node) node.checked = Boolean(value);
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
