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
    activeAssetId: null,
    renderToken: 0,
    editBasketPageId: null,
    editBasketPage: null
  };

  document.addEventListener("DOMContentLoaded", initColoringStudio);

  function initColoringStudio() {
    bindControls();
    syncControlsWithAsset(null);
    renderAssetList();
    renderPreview();
    setStatus("Brak aktywnego assetu.");
    loadEditableBasketPageFromUrl();
  }

  function bindControls() {
    const fileInput = el("coloringStudioFileInput");
    if (fileInput) {
      fileInput.addEventListener("change", handleFilesSelected);
    }

    bindButton("coloringStudioClearAssets", clearAssets);
    bindButton("coloringStudioExportPng", exportActivePng);
    bindButton("coloringStudioAddActiveToBasket", addActivePageToBasket);
    bindButton("coloringStudioAddSelectedToBasket", addSelectedPagesToBasket);
    bindButton("coloringStudioUpdateBasketPage", updateEditedBasketPage);
    bindButton("coloringStudioExportActivePack", exportActivePack);
    bindButton("coloringStudioExportSelectedPack", exportSelectedPack);
    bindButton("coloringStudioResetScale", resetActiveScale);
    bindButton("coloringStudioCenterArt", centerActiveArt);

    bindRange("coloringStudioScale", "scale", "%");
    bindRange("coloringStudioOffsetX", "offsetX", " px");
    bindRange("coloringStudioOffsetY", "offsetY", " px");
    bindRange("coloringStudioRotation", "rotation", "°");
    bindRange("coloringStudioBorderThickness", "borderThickness", " px");
    bindRange("coloringStudioPngThreshold", "pngThreshold", "");

    bindSettingCheckbox("coloringStudioShowTitle", "showTitle");
    bindSettingCheckbox("coloringStudioShowBorder", "showBorder");
    bindSettingCheckbox("coloringStudioPngMode", "pngMode");

    const title = el("coloringStudioTitleText");
    if (title) {
      title.addEventListener("input", function () {
        const asset = getActiveAsset();
        if (!asset) return;
        asset.settings.titleText = title.value;
        renderPreview();
      });
    }
  }

  function bindButton(id, handler) {
    const node = el(id);
    if (node) node.addEventListener("click", handler);
  }

  function bindRange(baseId, key, suffix) {
    const range = el(baseId);
    const number = el(baseId + "Number");
    const output = el(baseId + "Value");

    const update = function (rawValue, updateNumber) {
      const asset = getActiveAsset();
      if (!asset) return;
      const min = Number((range || number).min);
      const max = Number((range || number).max);
      const value = clamp(Number(rawValue), min, max);
      asset.settings[key] = value;
      if (range) range.value = String(value);
      if (number && updateNumber) number.value = String(value);
      if (output) output.textContent = String(value) + suffix;
      renderPreview();
    };

    if (range) {
      range.addEventListener("input", function () {
        update(range.value, true);
      });
    }
    if (number) {
      const commitNumberValue = function () {
        if (number.value === "") {
          syncControlsWithAsset(getActiveAsset());
          return;
        }
        update(number.value, true);
      };

      number.addEventListener("change", commitNumberValue);
      number.addEventListener("blur", commitNumberValue);
      number.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          commitNumberValue();
          number.blur();
        }
      });
    }
  }

  function bindSettingCheckbox(id, key) {
    const node = el(id);
    if (!node) return;
    node.addEventListener("change", function () {
      const asset = getActiveAsset();
      if (!asset) return;
      asset.settings[key] = node.checked;
      renderPreview();
    });
  }

  async function handleFilesSelected(event) {
    const files = Array.from((event.target && event.target.files) || []);
    if (!files.length) return;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const asset = await createAssetFromFile(file);
        state.assets.push(asset);
        state.activeAssetId = asset.id;
        setStatus(asset.type === "svg" ? "Załadowano plik SVG." : "Załadowano plik PNG.");
      } catch (error) {
        console.error(error);
        setError("Nie udało się wczytać pliku: " + file.name);
      }
    }

    if (event.target) event.target.value = "";
    syncControlsWithAsset(getActiveAsset());
    renderAssetList();
    renderPreview();
  }

  function createAssetFromFile(file) {
    const extension = getFileExtension(file.name);
    const mime = String(file.type || "").toLowerCase();
    const isSvg = extension === "svg" || mime === "image/svg+xml";
    const isPng = extension === "png" || mime === "image/png";

    if (!isSvg && !isPng) {
      return Promise.reject(new Error("Obsługiwane są tylko SVG i PNG."));
    }

    if (isSvg) {
      return readFileAsText(file).then(function (svgText) {
        const diagnostics = inspectSvg(svgText);
        return {
          id: createId("coloring-svg"),
          fileName: file.name,
          type: "svg",
          svgText: svgText,
          sourceDataUrl: "",
          settings: createDefaultSettings(file.name),
          selectedForPack: true,
          diagnostics: diagnostics,
          svgInfo: getSvgInfo(svgText)
        };
      });
    }

    return readFileAsDataUrl(file).then(function (dataUrl) {
      return {
        id: createId("coloring-png"),
        fileName: file.name,
        type: "png",
        svgText: "",
        sourceDataUrl: dataUrl,
        settings: createDefaultSettings(file.name),
        selectedForPack: true,
        diagnostics: [],
        svgInfo: null
      };
    });
  }

  function createDefaultSettings(fileName) {
    return {
      scale: 100,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      showTitle: false,
      titleText: stripExtension(fileName || "") || "Kolorowanka",
      showBorder: false,
      borderThickness: 4,
      pngThreshold: 180,
      pngMode: true
    };
  }

  function syncControlsWithAsset(asset) {
    const settings = asset ? asset.settings : createDefaultSettings("");
    setRangeControl("coloringStudioScale", settings.scale, "%");
    setRangeControl("coloringStudioOffsetX", settings.offsetX, " px");
    setRangeControl("coloringStudioOffsetY", settings.offsetY, " px");
    setRangeControl("coloringStudioRotation", settings.rotation, "°");
    setRangeControl("coloringStudioBorderThickness", settings.borderThickness, " px");
    setRangeControl("coloringStudioPngThreshold", settings.pngThreshold, "");
    setChecked("coloringStudioShowTitle", settings.showTitle);
    setChecked("coloringStudioShowBorder", settings.showBorder);
    setChecked("coloringStudioPngMode", settings.pngMode);
    setValue("coloringStudioTitleText", settings.titleText);
    updateActiveSummary();
    updateSourceStatus();
    updateButtons();
  }

  function setRangeControl(baseId, value, suffix) {
    setValue(baseId, value);
    setValue(baseId + "Number", value);
    const output = el(baseId + "Value");
    if (output) output.textContent = String(value) + suffix;
  }

  function setValue(id, value) {
    const node = el(id);
    if (node) node.value = value == null ? "" : String(value);
  }

  function setChecked(id, value) {
    const node = el(id);
    if (node) node.checked = !!value;
  }

  function updateButtons() {
    const hasActive = !!getActiveAsset();
    ["coloringStudioExportPng", "coloringStudioExportActivePack", "coloringStudioAddActiveToBasket", "coloringStudioResetScale", "coloringStudioCenterArt"].forEach(function (id) {
      const node = el(id);
      if (node) node.disabled = !hasActive;
    });
    const selected = state.assets.some(function (asset) {
      return asset.selectedForPack;
    });
    const selectedButton = el("coloringStudioExportSelectedPack");
    if (selectedButton) selectedButton.disabled = !selected;
    const selectedBasketButton = el("coloringStudioAddSelectedToBasket");
    if (selectedBasketButton) selectedBasketButton.disabled = !selected;
    const updateButton = el("coloringStudioUpdateBasketPage");
    if (updateButton) {
      updateButton.hidden = !state.editBasketPageId;
      updateButton.disabled = !hasActive || !state.editBasketPageId;
    }
  }

  function updateActiveSummary() {
    const asset = getActiveAsset();
    setText("coloringStudioActiveFileName", asset ? asset.fileName : "Brak aktywnego pliku");
    setText("coloringStudioActiveFileType", asset ? "Typ: " + asset.type.toUpperCase() : "Typ: brak");
    setText("coloringStudioActiveBadge", asset ? "Aktywny: " + asset.type.toUpperCase() : "Aktywny: brak");
  }

  function updateSourceStatus() {
    const asset = getActiveAsset();
    if (!asset) {
      setText("coloringStudioSourceStatus", "Brak aktywnego assetu.");
      return;
    }
    if (asset.type === "svg") {
      const warning = asset.diagnostics.length ? " NEEDS_REVIEW: " + asset.diagnostics.join(" ") : "";
      setText("coloringStudioSourceStatus", "SVG — tryb wektorowy." + warning);
      return;
    }
    setText("coloringStudioSourceStatus", "PNG — tryb bitmapowy. Threshold B/W jest dostępny dla aktywnego pliku.");
  }

  function renderAssetList() {
    const list = el("coloringStudioAssetList");
    if (!list) return;
    list.textContent = "";

    if (!state.assets.length) {
      const empty = document.createElement("p");
      empty.className = "coloring-studio-asset-empty";
      empty.textContent = "Brak załadowanych assetów.";
      list.appendChild(empty);
      updateButtons();
      return;
    }

    state.assets.forEach(function (asset) {
      const item = document.createElement("div");
      item.className = asset.id === state.activeAssetId
        ? "coloring-studio-asset-item is-active"
        : "coloring-studio-asset-item";

      const checkbox = document.createElement("input");
      checkbox.className = "coloring-studio-pack-check";
      checkbox.type = "checkbox";
      checkbox.checked = !!asset.selectedForPack;
      checkbox.title = "Dodaj do paczki";
      checkbox.setAttribute("aria-label", "Dodaj do paczki: " + asset.fileName);
      checkbox.addEventListener("change", function () {
        asset.selectedForPack = checkbox.checked;
        updateButtons();
      });
      item.appendChild(checkbox);

      const main = document.createElement("div");
      main.className = "coloring-studio-asset-main";

      const name = document.createElement("p");
      name.className = "coloring-studio-asset-name";
      name.textContent = asset.fileName;
      main.appendChild(name);

      const meta = document.createElement("div");
      meta.className = "coloring-studio-asset-meta";
      meta.appendChild(createChip(asset.type.toUpperCase()));
      meta.appendChild(createChip(asset.id === state.activeAssetId ? "AKTYWNY" : "GOTOWY", asset.id === state.activeAssetId));
      if (asset.diagnostics && asset.diagnostics.length) {
        meta.appendChild(createChip("NEEDS_REVIEW"));
      }
      main.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "coloring-studio-asset-actions";
      actions.appendChild(createAssetButton("Edytuj", function () {
        setActiveAsset(asset.id);
      }));
      actions.appendChild(createAssetButton("Usuń", function () {
        removeAsset(asset.id);
      }, true));
      main.appendChild(actions);

      item.appendChild(main);
      list.appendChild(item);
    });

    updateButtons();
  }

  function createChip(text, active) {
    const chip = document.createElement("span");
    chip.className = active ? "coloring-studio-chip is-active" : "coloring-studio-chip";
    chip.textContent = text;
    return chip;
  }

  function createAssetButton(text, handler, danger) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = danger ? "coloring-studio-asset-action is-danger" : "coloring-studio-asset-action";
    button.textContent = text;
    button.addEventListener("click", handler);
    return button;
  }

  function setActiveAsset(assetId) {
    state.activeAssetId = assetId;
    syncControlsWithAsset(getActiveAsset());
    renderAssetList();
    renderPreview();
  }

  function removeAsset(assetId) {
    const index = state.assets.findIndex(function (asset) {
      return asset.id === assetId;
    });
    if (index === -1) return;
    state.assets.splice(index, 1);
    if (state.activeAssetId === assetId) {
      const next = state.assets[index] || state.assets[index - 1] || null;
      state.activeAssetId = next ? next.id : null;
    }
    syncControlsWithAsset(getActiveAsset());
    renderAssetList();
    renderPreview();
  }

  function clearAssets() {
    state.assets = [];
    state.activeAssetId = null;
    syncControlsWithAsset(null);
    renderAssetList();
    renderPreview();
    setStatus("Brak aktywnego assetu.");
  }

  function resetActiveScale() {
    const asset = getActiveAsset();
    if (!asset) {
      setError("Brak aktywnego assetu.");
      return;
    }
    asset.settings.scale = 100;
    setRangeControl("coloringStudioScale", 100, "%");
    renderPreview();
  }

  function centerActiveArt() {
    const asset = getActiveAsset();
    if (!asset) {
      setError("Brak aktywnego assetu.");
      return;
    }
    asset.settings.offsetX = 0;
    asset.settings.offsetY = 0;
    setRangeControl("coloringStudioOffsetX", 0, " px");
    setRangeControl("coloringStudioOffsetY", 0, " px");
    renderPreview();
  }

  async function renderPreview() {
    const canvas = el("coloringStudioPreviewCanvas");
    if (!canvas) return;
    const token = ++state.renderToken;
    try {
      await renderPageToCanvas(getActiveAsset(), canvas, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      if (token !== state.renderToken) return;
      setMessage(getActiveAsset() ? "Zaktualizowano podgląd." : "Wczytaj SVG lub PNG, aby rozpocząć.");
      updateActiveSummary();
      updateSourceStatus();
    } catch (error) {
      console.error(error);
      setError(error && error.message === "SVG_RENDER_ERROR" ? "Błąd renderowania SVG." : "Błąd renderowania podglądu.");
    }
  }

  async function renderPageToCanvas(asset, canvas, width, height) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const ratio = width / EXPORT_WIDTH;

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    if (!asset) {
      drawEmptyState(ctx, width, height);
      return canvas;
    }

    const settings = asset.settings;
    if (settings.showTitle && settings.titleText) {
      drawTitle(ctx, settings.titleText, width, ratio);
    }

    if (settings.showBorder) {
      drawBorder(ctx, settings.borderThickness * ratio, width, height);
    }

    const image = await getRenderableImage(asset);
    const sourceSize = getSourceSize(asset, image);
    const maxW = width * 0.78;
    const maxH = height * (settings.showTitle ? 0.66 : 0.74);
    const baseScale = Math.min(maxW / sourceSize.width, maxH / sourceSize.height);
    const finalScale = baseScale * (settings.scale / 100);
    const drawW = sourceSize.width * finalScale;
    const drawH = sourceSize.height * finalScale;
    const centerX = width / 2 + settings.offsetX * ratio;
    const centerY = height / 2 + (settings.showTitle ? height * 0.055 : 0) + settings.offsetY * ratio;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(settings.rotation * Math.PI / 180);
    if (asset.type === "png" && settings.pngMode) {
      drawThresholdPng(ctx, image, -drawW / 2, -drawH / 2, drawW, drawH, settings.pngThreshold);
    } else if (asset.type === "png") {
      drawGrayscalePng(ctx, image, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
      ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
    }
    ctx.restore();

    return canvas;
  }

  function drawEmptyState(ctx, width, height) {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#d7dce4";
    ctx.lineWidth = 2;
    ctx.strokeRect(width * 0.08, height * 0.08, width * 0.84, height * 0.84);
    ctx.fillStyle = "#9aa8b8";
    ctx.font = "700 22px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Brak aktywnego assetu.", width / 2, height / 2);
    ctx.restore();
  }

  function drawTitle(ctx, title, width, ratio) {
    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "700 " + Math.max(22, Math.round(96 * ratio)) + "px Arial, Helvetica, sans-serif";
    ctx.fillText(title, width / 2, 190 * ratio, width * 0.82);
    ctx.restore();
  }

  function drawBorder(ctx, thickness, width, height) {
    const margin = Math.max(18, Math.round(width * 0.045));
    ctx.save();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(1, thickness);
    ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);
    ctx.restore();
  }

  function getRenderableImage(asset) {
    if (asset.type === "svg") {
      return loadImageFromDataUrl(createSvgDataUrl(asset.svgText));
    }
    return loadImageFromDataUrl(asset.sourceDataUrl);
  }

  function createSvgDataUrl(svgText) {
    const safeText = createRenderableSvgText(svgText);
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(safeText);
  }

  function createRenderableSvgText(svgText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError || !doc.documentElement || doc.documentElement.nodeName.toLowerCase() !== "svg") {
      throw new Error("SVG_RENDER_ERROR");
    }

    doc.querySelectorAll("script, foreignObject, style").forEach(function (node) {
      node.remove();
    });

    doc.querySelectorAll("image").forEach(function (node) {
      node.remove();
    });

    doc.querySelectorAll("*").forEach(function (node) {
      Array.from(node.attributes || []).forEach(function (attribute) {
        const name = attribute.name.toLowerCase();
        const value = String(attribute.value || "");
        if ((name === "href" || name === "xlink:href") && /^https?:\/\//i.test(value)) {
          node.removeAttribute(attribute.name);
        }
        if (name === "style" && /url\(\s*['"]?https?:\/\//i.test(value)) {
          node.removeAttribute(attribute.name);
        }
      });
    });

    const svg = doc.documentElement;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const style = doc.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = [
      "*{fill:none!important;stroke:#000!important;color:#000!important;paint-order:stroke!important;}",
      "svg{background:transparent!important;}",
      "text,tspan{fill:#000!important;stroke:none!important;}"
    ].join("");
    svg.insertBefore(style, svg.firstChild);

    return new XMLSerializer().serializeToString(svg);
  }

  function inspectSvg(svgText) {
    const diagnostics = [];
    if (/<image[\s>]/i.test(svgText)) {
      diagnostics.push("SVG zawiera <image>.");
    }
    if (/(href|xlink:href)\s*=\s*["']https?:\/\//i.test(svgText) || /url\(\s*['"]?https?:\/\//i.test(svgText)) {
      diagnostics.push("SVG zawiera zewnętrzne href/http.");
    }
    return diagnostics;
  }

  function getSvgInfo(svgText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") {
      return { width: 1000, height: 1000 };
    }

    const viewBox = (svg.getAttribute("viewBox") || "").trim().split(/\s+|,/).map(Number);
    if (viewBox.length === 4 && viewBox.every(isFiniteNumber) && viewBox[2] > 0 && viewBox[3] > 0) {
      return { width: viewBox[2], height: viewBox[3] };
    }

    const width = parseSvgLength(svg.getAttribute("width"));
    const height = parseSvgLength(svg.getAttribute("height"));
    if (width > 0 && height > 0) {
      return { width: width, height: height };
    }

    return { width: 1000, height: 1000 };
  }

  function parseSvgLength(value) {
    const match = String(value || "").match(/^[\d.]+/);
    return match ? Number(match[0]) : 0;
  }

  function getSourceSize(asset, image) {
    if (asset.type === "svg" && asset.svgInfo) {
      return {
        width: asset.svgInfo.width || 1000,
        height: asset.svgInfo.height || 1000
      };
    }
    return {
      width: image.naturalWidth || image.width || 1000,
      height: image.naturalHeight || image.height || 1000
    };
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () {
        resolve(image);
      };
      image.onerror = function () {
        reject(new Error("SVG_RENDER_ERROR"));
      };
      image.src = dataUrl;
    });
  }

  function drawThresholdPng(ctx, image, x, y, width, height, threshold) {
    const temp = document.createElement("canvas");
    temp.width = Math.max(1, Math.round(width));
    temp.height = Math.max(1, Math.round(height));
    const tempCtx = temp.getContext("2d", { willReadFrequently: true });
    tempCtx.fillStyle = "#ffffff";
    tempCtx.fillRect(0, 0, temp.width, temp.height);
    tempCtx.drawImage(image, 0, 0, temp.width, temp.height);
    const imageData = tempCtx.getImageData(0, 0, temp.width, temp.height);
    const data = imageData.data;

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255;
      const luminance = (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114) * alpha + 255 * (1 - alpha);
      const black = luminance < threshold;
      data[index] = black ? 0 : 255;
      data[index + 1] = black ? 0 : 255;
      data[index + 2] = black ? 0 : 255;
      data[index + 3] = 255;
    }

    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(temp, x, y, width, height);
  }

  function drawGrayscalePng(ctx, image, x, y, width, height) {
    const temp = document.createElement("canvas");
    temp.width = Math.max(1, Math.round(width));
    temp.height = Math.max(1, Math.round(height));
    const tempCtx = temp.getContext("2d", { willReadFrequently: true });
    tempCtx.fillStyle = "#ffffff";
    tempCtx.fillRect(0, 0, temp.width, temp.height);
    tempCtx.drawImage(image, 0, 0, temp.width, temp.height);
    const imageData = tempCtx.getImageData(0, 0, temp.width, temp.height);
    const data = imageData.data;

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255;
      const luminance = (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114) * alpha + 255 * (1 - alpha);
      data[index] = luminance;
      data[index + 1] = luminance;
      data[index + 2] = luminance;
      data[index + 3] = 255;
    }

    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(temp, x, y, width, height);
  }

  async function exportActivePng() {
    const asset = getActiveAsset();
    if (!asset) {
      setError("Brak aktywnego assetu.");
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      await renderPageToCanvas(asset, canvas, EXPORT_WIDTH, EXPORT_HEIGHT);
      downloadDataUrl(canvas.toDataURL("image/png"), "fenix-coloring-page-" + sanitizeFileName(stripExtension(asset.fileName)) + ".png");
      setStatus("Wyeksportowano aktywną stronę PNG.");
      setMessage("Wyeksportowano aktywną stronę PNG.");
    } catch (error) {
      console.error(error);
      setError("Błąd eksportu PNG.");
    }
  }

  async function addActivePageToBasket() {
    const asset = getActiveAsset();
    if (!asset) {
      setError("Brak aktywnego assetu.");
      return;
    }

    try {
      await addAssetsToBasket([asset]);
      const message = "Dodano do wspólnego Koszyka Feniksa. Możesz wrócić do Fenixa albo przejść do MBG / Book Builder.";
      setStatus(message);
      setMessage(message);
      refreshGlobalFenixBasketStatus();
    } catch (error) {
      console.error(error);
      setError("Błąd zapisu do koszyka MBG.");
    }
  }

  async function addSelectedPagesToBasket() {
    const selected = state.assets.filter(function (asset) {
      return asset.selectedForPack;
    });
    if (!selected.length) {
      setError("Nie zaznaczono żadnych stron.");
      return;
    }

    try {
      const added = await addAssetsToBasket(selected);
      const message = "Dodano do wspólnego Koszyka Feniksa. Możesz wrócić do Fenixa albo przejść do MBG / Book Builder.";
      setStatus(message + " Dodano stron: " + added + ".");
      setMessage(message);
      refreshGlobalFenixBasketStatus();
    } catch (error) {
      console.error(error);
      setError("Błąd zapisu do koszyka MBG.");
    }
  }

  async function addAssetsToBasket(assets) {
    let added = 0;
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      const canvas = document.createElement("canvas");
      await renderPageToCanvas(asset, canvas, EXPORT_WIDTH, EXPORT_HEIGHT);
      const blob = await canvasToPngBlob(canvas);
      const now = new Date().toISOString();
      await addFenixBookBasketPage({
        id: createFenixBookBasketPageId(),
        sourceModule: "coloring-studio",
        pageType: "coloring_page",
        fileName: "fenix-coloring-page-" + sanitizeFileName(stripExtension(asset.fileName)) + ".png",
        title: asset.settings.titleText || stripExtension(asset.fileName) || "Coloring Page",
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
        mimeType: "image/png",
        createdAt: now,
        blob: blob,
        order: Date.now() + index,
        editSnapshot: createColoringEditSnapshot(asset, now)
      });
      added += 1;
    }
    return added;
  }

  function createColoringEditSnapshot(asset, now) {
    return {
      snapshotVersion: 1,
      sourceModule: "coloring-studio",
      pageType: "coloring_page",
      fileName: asset.fileName,
      originalFileName: asset.fileName,
      assetType: asset.type,
      svgText: asset.type === "svg" ? asset.svgText : "",
      sourceDataUrl: asset.type === "png" ? asset.sourceDataUrl : "",
      settings: clonePlainObject(asset.settings),
      createdAt: now,
      updatedAt: now
    };
  }

  async function loadEditableBasketPageFromUrl() {
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
      if (snapshot.sourceModule !== "coloring-studio") {
        setError("Ta pozycja koszyka pochodzi z innego modułu.");
        return;
      }

      const asset = createAssetFromSnapshot(snapshot);
      state.assets.push(asset);
      state.activeAssetId = asset.id;
      state.editBasketPageId = pageId;
      state.editBasketPage = page;
      syncControlsWithAsset(asset);
      renderAssetList();
      renderPreview();
      setStatus("Edytujesz stronę z Koszyka Feniksa.");
      setMessage("Edytujesz stronę z Koszyka Feniksa.");
    } catch (error) {
      console.error(error);
      setError("Błąd odczytu strony z Koszyka Feniksa.");
    }
  }

  function createAssetFromSnapshot(snapshot) {
    const type = snapshot.assetType === "svg" ? "svg" : "png";
    const svgText = type === "svg" ? String(snapshot.svgText || "") : "";
    const sourceDataUrl = type === "png" ? String(snapshot.sourceDataUrl || "") : "";
    return {
      id: createId("coloring-edit"),
      fileName: snapshot.originalFileName || snapshot.fileName || "coloring-page.png",
      type: type,
      svgText: svgText,
      sourceDataUrl: sourceDataUrl,
      settings: Object.assign(createDefaultSettings(snapshot.originalFileName || snapshot.fileName || ""), clonePlainObject(snapshot.settings || {})),
      selectedForPack: true,
      diagnostics: type === "svg" ? inspectSvg(svgText) : [],
      svgInfo: type === "svg" ? getSvgInfo(svgText) : null
    };
  }

  async function updateEditedBasketPage() {
    const asset = getActiveAsset();
    if (!asset || !state.editBasketPageId || !state.editBasketPage) {
      setError("Brak edytowanej pozycji koszyka.");
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      await renderPageToCanvas(asset, canvas, EXPORT_WIDTH, EXPORT_HEIGHT);
      const blob = await canvasToPngBlob(canvas);
      const now = new Date().toISOString();
      const updatedPage = Object.assign({}, state.editBasketPage, {
        sourceModule: "coloring-studio",
        pageType: "coloring_page",
        fileName: "fenix-coloring-page-" + sanitizeFileName(stripExtension(asset.fileName)) + ".png",
        title: asset.settings.titleText || stripExtension(asset.fileName) || "Coloring Page",
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
        mimeType: "image/png",
        blob: blob,
        updatedAt: now,
        editSnapshot: Object.assign(createColoringEditSnapshot(asset, now), {
          createdAt: state.editBasketPage.editSnapshot && state.editBasketPage.editSnapshot.createdAt
            ? state.editBasketPage.editSnapshot.createdAt
            : now,
          updatedAt: now
        })
      });
      await addFenixBookBasketPage(updatedPage);
      state.editBasketPage = updatedPage;
      setStatus("Zaktualizowano stronę w Koszyku Feniksa.");
      setMessage("Zaktualizowano stronę w Koszyku Feniksa.");
      refreshGlobalFenixBasketStatus();
    } catch (error) {
      console.error(error);
      setError("Błąd aktualizacji strony w Koszyku Feniksa.");
    }
  }

  async function exportActivePack() {
    const asset = getActiveAsset();
    if (!asset) {
      setError("Brak aktywnego assetu.");
      return;
    }
    await exportPack([asset]);
  }

  async function exportSelectedPack() {
    const selected = state.assets.filter(function (asset) {
      return asset.selectedForPack;
    });
    if (!selected.length) {
      setError("Nie zaznaczono żadnych stron.");
      return;
    }
    await exportPack(selected);
  }

  async function exportPack(assets) {
    try {
      const now = new Date().toISOString();
      const pages = [];

      for (let index = 0; index < assets.length; index += 1) {
        const asset = assets[index];
        const canvas = document.createElement("canvas");
        await renderPageToCanvas(asset, canvas, EXPORT_WIDTH, EXPORT_HEIGHT);
        pages.push({
          id: createId("coloring-page"),
          sourceModule: "coloring-studio",
          pageType: "coloring_page",
          fileName: "fenix-coloring-page-" + sanitizeFileName(stripExtension(asset.fileName)) + ".png",
          title: asset.settings.titleText || stripExtension(asset.fileName) || "Coloring Page",
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
        sourceModule: "coloring-studio",
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
      setMessage("Wyeksportowano " + pages.length + " stron do paczki Fenixa.");
    } catch (error) {
      console.error(error);
      setError("Błąd eksportu paczki.");
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

  function refreshGlobalFenixBasketStatus() {
    if (window.FenixBasketStatus && typeof window.FenixBasketStatus.refresh === "function") {
      window.FenixBasketStatus.refresh();
    }
  }

  function createFenixBookBasketPageId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return createId("fenix-basket");
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
    return "fenix-coloring-studio-pack-" + stamp + ".fenixpack";
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

  function getActiveAsset() {
    return state.assets.find(function (asset) {
      return asset.id === state.activeAssetId;
    }) || null;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    const node = el(id);
    if (node) node.textContent = text;
  }

  function setStatus(text) {
    const status = el("coloringStudioStatusText");
    const statusBox = status ? status.closest(".coloring-studio-status") : null;
    if (status) status.textContent = text;
    if (statusBox) statusBox.classList.remove("is-error");
  }

  function setMessage(text) {
    const node = el("coloringStudioMessage");
    if (!node) return;
    node.textContent = text;
    node.classList.remove("is-error");
  }

  function setError(text) {
    const status = el("coloringStudioStatusText");
    const statusBox = status ? status.closest(".coloring-studio-status") : null;
    if (status) status.textContent = text;
    if (statusBox) statusBox.classList.add("is-error");
    const message = el("coloringStudioMessage");
    if (message) {
      message.textContent = text;
      message.classList.add("is-error");
    }
  }

  function getFileExtension(fileName) {
    const match = String(fileName || "").toLowerCase().match(/\.([^.]+)$/);
    return match ? match[1] : "";
  }

  function stripExtension(fileName) {
    return String(fileName || "").replace(/\.[^.]+$/, "");
  }

  function sanitizeFileName(value) {
    return String(value || "strona")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "strona";
  }

  function createId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function clamp(value, min, max) {
    if (!isFiniteNumber(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function clonePlainObject(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }
})();
