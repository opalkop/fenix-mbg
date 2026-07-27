(function () {
  "use strict";

  const EXPORT_WIDTH = 2550;
  const EXPORT_HEIGHT = 3300;
  const PREVIEW_WIDTH = 765;
  const PREVIEW_HEIGHT = 990;
  const FENIX_BOOK_BASKET_DB_NAME = "fenixBookBasketDb";
  const FENIX_BOOK_BASKET_STORE_NAME = "pages";
  const FENIX_BOOK_BASKET_DB_VERSION = 1;
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const WORDS = {
    A: "Apple", B: "Ball", C: "Cat", D: "Dog", E: "Elephant", F: "Fish", G: "Giraffe",
    H: "House", I: "Ice Cream", J: "Jellyfish", K: "Kite", L: "Lion", M: "Monkey",
    N: "Nest", O: "Owl", P: "Penguin", Q: "Queen", R: "Rabbit", S: "Sun",
    T: "Turtle", U: "Umbrella", V: "Violin", W: "Whale", X: "Xylophone",
    Y: "Yo-yo", Z: "Zebra"
  };

  const state = {
    asset: null,
    assetImage: null,
    renderToken: 0,
    isBusy: false
  };

  document.addEventListener("DOMContentLoaded", initAlphabetStudio);

  function initAlphabetStudio() {
    populateLetterSelect();
    bindControls();
    syncWordForLetter("A", true);
    applyDifficultyPreset("medium", false);
    renderAssetPreview();
    renderPreview();
    setStatus("Gotowe do pracy.");
  }

  function populateLetterSelect() {
    const select = el("alphabetStudioLetter");
    if (!select) return;
    LETTERS.forEach(function (letter) {
      const option = document.createElement("option");
      option.value = letter;
      option.textContent = letter;
      select.appendChild(option);
    });
    select.value = "A";
  }

  function bindControls() {
    bindButton("alphabetStudioRefreshPreview", renderPreview);
    bindButton("alphabetStudioExportPng", exportActivePng);
    bindButton("alphabetStudioAddToBasket", addActivePageToBasket);
    bindButton("alphabetStudioAddRangeToBasket", addRangeToBasket);
    bindButton("alphabetStudioExportPack", function () { exportFenixPack([readSettings()]); });
    bindButton("alphabetStudioExportRangePack", exportRangePack);
    bindButton("alphabetStudioRemoveAsset", removeAsset);

    const assetInput = el("alphabetStudioAssetInput");
    if (assetInput) assetInput.addEventListener("change", handleAssetSelected);

    bindRange("alphabetStudioSideMargin", " px");
    bindRange("alphabetStudioLetterSize", " px");
    bindRange("alphabetStudioPracticeRows", "");
    bindRange("alphabetStudioRowSpacing", " px");
    bindRange("alphabetStudioLineWidth", " px");
    bindRange("alphabetStudioLineOpacity", "%");
    bindRange("alphabetStudioAssetSize", " px");

    [
      "alphabetStudioWord",
      "alphabetStudioPageType",
      "alphabetStudioShowTitle",
      "alphabetStudioTitle",
      "alphabetStudioInstruction",
      "alphabetStudioShowUppercase",
      "alphabetStudioShowLowercase",
      "alphabetStudioShowWordText",
      "alphabetStudioShowTracing",
      "alphabetStudioShowWriting",
      "alphabetStudioTracingStyle",
      "alphabetStudioShowAsset",
      "alphabetStudioAssetPosition",
      "alphabetStudioRangeMode",
      "alphabetStudioCustomRange"
    ].forEach(function (id) {
      const node = el(id);
      if (!node) return;
      node.addEventListener("input", renderPreview);
      node.addEventListener("change", renderPreview);
    });

    const letter = el("alphabetStudioLetter");
    if (letter) {
      letter.addEventListener("change", function () {
        syncWordForLetter(letter.value, true);
        renderPreview();
      });
    }

    const difficulty = el("alphabetStudioDifficulty");
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

  function syncWordForLetter(letter, updateTitle) {
    const word = WORDS[letter] || "";
    setValue("alphabetStudioWord", word);
    if (updateTitle) {
      setValue("alphabetStudioTitle", "Letter " + letter);
      setValue("alphabetStudioInstruction", "Trace the letter.");
    }
  }

  function applyDifficultyPreset(difficulty, shouldSetStatus) {
    const presets = {
      easy: { letterSize: 460, practiceRows: 3, rowSpacing: 220, lineWidth: 6 },
      medium: { letterSize: 390, practiceRows: 4, rowSpacing: 180, lineWidth: 5 },
      hard: { letterSize: 300, practiceRows: 6, rowSpacing: 145, lineWidth: 4 }
    };
    const preset = presets[difficulty] || presets.medium;
    setRangeValue("alphabetStudioLetterSize", preset.letterSize, " px");
    setRangeValue("alphabetStudioPracticeRows", preset.practiceRows, "");
    setRangeValue("alphabetStudioRowSpacing", preset.rowSpacing, " px");
    setRangeValue("alphabetStudioLineWidth", preset.lineWidth, " px");
    if (shouldSetStatus) setStatus("Dopasowano ustawienia poziomu trudności. Możesz je dalej ręcznie zmienić.");
  }

  async function handleAssetSelected(event) {
    const file = event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    try {
      const asset = await createAssetFromFile(file);
      state.asset = asset;
      state.assetImage = null;
      await loadAssetImage();
      renderAssetPreview();
      renderPreview();
      setStatus("Dodano ilustrację: " + file.name);
    } catch (error) {
      console.error(error);
      setError("Nie udało się wczytać ilustracji.");
    } finally {
      if (event.target) event.target.value = "";
    }
  }

  async function createAssetFromFile(file) {
    const extension = getFileExtension(file.name);
    const mime = String(file.type || "").toLowerCase();
    const isSvg = extension === "svg" || mime === "image/svg+xml";
    const isPng = extension === "png" || mime === "image/png";
    if (!isSvg && !isPng) throw new Error("Obsługiwane są tylko SVG i PNG.");
    return {
      id: createId("alphabet-asset"),
      fileName: file.name,
      type: isSvg ? "svg" : "png",
      sourceDataUrl: isSvg ? svgTextToDataUrl(await readFileAsText(file)) : await readFileAsDataUrl(file)
    };
  }

  function removeAsset() {
    state.asset = null;
    state.assetImage = null;
    renderAssetPreview();
    renderPreview();
    setStatus("Usunięto ilustrację.");
  }

  function renderAssetPreview() {
    const preview = el("alphabetStudioAssetPreview");
    if (!preview) return;
    preview.replaceChildren();
    if (!state.asset) {
      const empty = document.createElement("span");
      empty.textContent = "Brak ilustracji";
      preview.appendChild(empty);
      return;
    }
    const image = document.createElement("img");
    image.src = state.asset.sourceDataUrl;
    image.alt = state.asset.fileName;
    preview.appendChild(image);
  }

  function readSettings(overrides) {
    const letter = getValue("alphabetStudioLetter", "A").toUpperCase();
    const word = getValue("alphabetStudioWord", WORDS[letter] || "").trim() || WORDS[letter] || "";
    const settings = {
      letter: letter,
      lowerLetter: letter.toLowerCase(),
      word: word,
      pageType: getValue("alphabetStudioPageType", "letter-tracing"),
      difficulty: getValue("alphabetStudioDifficulty", "medium"),
      showTitle: getChecked("alphabetStudioShowTitle", true),
      title: getValue("alphabetStudioTitle", "Letter " + letter).trim() || "Letter " + letter,
      instruction: getValue("alphabetStudioInstruction", "Trace the letter.").trim(),
      showUppercase: getChecked("alphabetStudioShowUppercase", true),
      showLowercase: getChecked("alphabetStudioShowLowercase", true),
      showWordText: getChecked("alphabetStudioShowWordText", true),
      showTracing: getChecked("alphabetStudioShowTracing", true),
      showWriting: getChecked("alphabetStudioShowWriting", true),
      tracingStyle: getValue("alphabetStudioTracingStyle", "dotted"),
      sideMargin: getNumber("alphabetStudioSideMargin", 280),
      letterSize: getNumber("alphabetStudioLetterSize", 390),
      practiceRows: getNumber("alphabetStudioPracticeRows", 4),
      rowSpacing: getNumber("alphabetStudioRowSpacing", 180),
      lineWidth: getNumber("alphabetStudioLineWidth", 5),
      lineOpacity: getNumber("alphabetStudioLineOpacity", 42) / 100,
      showAsset: getChecked("alphabetStudioShowAsset", true),
      assetSize: getNumber("alphabetStudioAssetSize", 430),
      assetPosition: getValue("alphabetStudioAssetPosition", "right")
    };
    return Object.assign(settings, overrides || {});
  }

  async function renderPreview() {
    const canvas = el("alphabetStudioPreviewCanvas");
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
    drawHeader(ctx, settings);
    await drawAlphabetPage(ctx, settings);
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

  async function drawAlphabetPage(ctx, settings) {
    const type = settings.pageType;
    if (type === "letter-word") {
      await drawLetterWordPage(ctx, settings);
      return;
    }
    if (type === "letter-practice") {
      drawLetterPracticePage(ctx, settings);
      return;
    }
    if (type === "abc-worksheet") {
      await drawWorksheetPage(ctx, settings);
      return;
    }
    await drawLetterTracingPage(ctx, settings);
  }

  async function drawLetterTracingPage(ctx, settings) {
    drawBigLetters(ctx, settings, 500);
    if (settings.showWordText) drawWordText(ctx, settings, 1040);
    if (settings.showAsset) await drawIllustration(ctx, settings, 1680);
    if (settings.showWriting) drawWritingPractice(ctx, settings, 2050);
  }

  function drawLetterPracticePage(ctx, settings) {
    drawBigLetters(ctx, settings, 470);
    if (settings.showWordText) drawWordText(ctx, settings, 940);
    if (settings.showWriting) drawWritingPractice(ctx, settings, 1200);
  }

  async function drawLetterWordPage(ctx, settings) {
    drawBigLetters(ctx, settings, 520);
    drawWordText(ctx, settings, 1050);
    if (settings.showAsset) await drawIllustration(ctx, settings, 1530);
    if (settings.showWriting) drawWritingPractice(ctx, settings, 2260);
  }

  async function drawWorksheetPage(ctx, settings) {
    drawBigLetters(ctx, settings, 460);
    if (settings.showTracing) drawTraceSamples(ctx, settings, 970);
    if (settings.showWordText) drawWordText(ctx, settings, 1260);
    if (settings.showAsset) await drawIllustration(ctx, settings, 1640);
    if (settings.showWriting) drawWritingPractice(ctx, settings, 2180);
  }

  function drawBigLetters(ctx, settings, y) {
    const letters = [];
    if (settings.showUppercase) letters.push(settings.letter);
    if (settings.showLowercase) letters.push(settings.lowerLetter);
    if (!letters.length) return;
    const totalWidth = letters.length === 1 ? 0 : settings.letterSize * 0.95;
    const startX = EXPORT_WIDTH / 2 - totalWidth / 2;
    letters.forEach(function (letter, index) {
      drawTracingLetter(ctx, letter, startX + index * settings.letterSize * 0.95, y, settings.letterSize, settings);
    });
  }

  function drawTracingLetter(ctx, letter, x, y, size, settings) {
    ctx.save();
    ctx.font = "bold " + size + "px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (settings.tracingStyle === "light-solid") {
      ctx.fillStyle = "rgba(17, 24, 39, 0.22)";
      ctx.fillText(letter, x, y);
    } else {
      ctx.lineWidth = Math.max(5, size * 0.035);
      ctx.strokeStyle = "rgba(17, 24, 39, 0.58)";
      ctx.setLineDash(settings.tracingStyle === "dashed" ? [42, 28] : [1, 28]);
      ctx.strokeText(letter, x, y);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(17, 24, 39, 0.08)";
      ctx.fillText(letter, x, y);
    }
    ctx.restore();
  }

  function drawTraceSamples(ctx, settings, y) {
    ctx.save();
    ctx.font = "bold 150px Arial, Helvetica, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const text = (settings.letter + " " + settings.lowerLetter + "   ").repeat(6);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(17, 24, 39, 0.42)";
    ctx.setLineDash(settings.tracingStyle === "dashed" ? [32, 22] : settings.tracingStyle === "dotted" ? [1, 24] : []);
    if (settings.tracingStyle === "light-solid") {
      ctx.fillStyle = "rgba(17, 24, 39, 0.2)";
      ctx.fillText(text, settings.sideMargin, y, EXPORT_WIDTH - settings.sideMargin * 2);
    } else {
      ctx.strokeText(text, settings.sideMargin, y, EXPORT_WIDTH - settings.sideMargin * 2);
    }
    ctx.restore();
  }

  function drawWordText(ctx, settings, y) {
    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.font = "bold 74px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(settings.letter + " is for " + settings.word + ".", EXPORT_WIDTH / 2, y, EXPORT_WIDTH - settings.sideMargin * 2);
    ctx.restore();
  }

  async function drawIllustration(ctx, settings, y) {
    if (!state.asset || settings.assetPosition === "none") return;
    const image = await loadAssetImage();
    if (!image) return;
    const size = settings.assetSize;
    let x = EXPORT_WIDTH / 2 - size / 2;
    let drawY = y - size / 2;
    if (settings.assetPosition === "right") {
      x = EXPORT_WIDTH - settings.sideMargin - size;
      drawY = 520;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(17, 24, 39, 0.45)";
    ctx.lineWidth = 5;
    ctx.strokeRect(x - 24, drawY - 24, size + 48, size + 48);
    drawImageContain(ctx, image, x, drawY, size, size);
    ctx.restore();
  }

  function drawWritingPractice(ctx, settings, startY) {
    ctx.save();
    const left = settings.sideMargin;
    const right = EXPORT_WIDTH - settings.sideMargin;
    ctx.strokeStyle = "rgba(17, 24, 39, " + clamp(settings.lineOpacity, 0.2, 1) + ")";
    ctx.lineWidth = settings.lineWidth;
    ctx.font = "bold 92px Arial, Helvetica, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(17, 24, 39, 0.32)";
    for (let row = 0; row < settings.practiceRows; row += 1) {
      const y = startY + row * settings.rowSpacing;
      if (y > EXPORT_HEIGHT - 190) break;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(left, y - 72);
      ctx.lineTo(right, y - 72);
      ctx.stroke();
      if (row < 2) {
        drawTracingLetter(ctx, settings.letter + settings.lowerLetter, left + 105, y - 44, 96, settings);
      }
    }
    ctx.restore();
  }

  async function exportActivePng() {
    try {
      setBusy(true);
      const canvas = await createExportCanvas(readSettings());
      downloadDataUrl(canvas.toDataURL("image/png"), createAlphabetPngFileName(readSettings().letter));
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

  async function addRangeToBasket() {
    try {
      setBusy(true);
      const letters = getSelectedRangeLetters();
      if (!letters.length) {
        setError("Wybierz co najmniej jedną literę zakresu.");
        return;
      }
      for (let index = 0; index < letters.length; index += 1) {
        await addRenderedPageToBasket(createSettingsForLetter(letters[index]), index);
      }
      const message = "Dodano do wspólnego Koszyka Feniksa. Możesz wrócić do Fenixa albo przejść do MBG / Book Builder.";
      setStatus(message + " Dodano liter: " + letters.length + ".");
      setMessage(message);
      refreshGlobalFenixBasketStatus();
    } catch (error) {
      console.error(error);
      setError("Błąd zapisu zakresu do Koszyka Feniksa.");
    } finally {
      setBusy(false);
    }
  }

  async function exportRangePack() {
    const letters = getSelectedRangeLetters();
    if (!letters.length) {
      setError("Wybierz co najmniej jedną literę zakresu.");
      return;
    }
    const settings = letters.map(createSettingsForLetter);
    await exportFenixPack(settings);
  }

  async function exportFenixPack(settingsList) {
    try {
      setBusy(true);
      const now = new Date().toISOString();
      const pages = [];
      for (let index = 0; index < settingsList.length; index += 1) {
        const settings = settingsList[index];
        const canvas = await createExportCanvas(settings);
        pages.push({
          id: createId("alphabet-page"),
          sourceModule: "alphabet-studio",
          pageType: "alphabet_page",
          fileName: createAlphabetPngFileName(settings.letter, index),
          title: createPageTitle(settings),
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
        sourceModule: "alphabet-studio",
        createdAt: now,
        pageSize: { width: EXPORT_WIDTH, height: EXPORT_HEIGHT, dpi: 300, trim: "8.5x11" },
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
      sourceModule: "alphabet-studio",
      pageType: "alphabet_page",
      fileName: createAlphabetPngFileName(settings.letter, index),
      title: createPageTitle(settings),
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

  function createSettingsForLetter(letter) {
    return readSettings({
      letter: letter,
      lowerLetter: letter.toLowerCase(),
      word: WORDS[letter] || "",
      title: "Letter " + letter
    });
  }

  function getSelectedRangeLetters() {
    const mode = getValue("alphabetStudioRangeMode", "custom");
    if (mode === "az") return LETTERS.slice();
    if (mode === "am") return LETTERS.slice(0, 13);
    if (mode === "nz") return LETTERS.slice(13);
    const raw = getValue("alphabetStudioCustomRange", "A,B,C");
    const rangeMatch = raw.toUpperCase().match(/\b([A-Z])\s*-\s*([A-Z])\b/);
    if (rangeMatch && WORDS[rangeMatch[1]] && WORDS[rangeMatch[2]]) {
      const start = LETTERS.indexOf(rangeMatch[1]);
      const end = LETTERS.indexOf(rangeMatch[2]);
      return LETTERS.slice(Math.min(start, end), Math.max(start, end) + 1);
    }
    const seen = {};
    return raw.toUpperCase().split(/[^A-Z]+/).filter(function (letter) {
      if (!letter || letter.length !== 1 || !WORDS[letter] || seen[letter]) return false;
      seen[letter] = true;
      return true;
    });
  }

  function createPageTitle(settings) {
    return "Letter " + settings.letter + " - " + settings.word;
  }

  function updatePreviewSummary(settings) {
    const summary = el("alphabetStudioPreviewSummary");
    if (summary) summary.textContent = settings.letter + " · " + settings.word + " · " + getPageTypeLabel(settings.pageType);
  }

  function getPageTypeLabel(value) {
    if (value === "letter-practice") return "Letter Practice";
    if (value === "letter-word") return "Letter + Word";
    if (value === "abc-worksheet") return "Simple ABC Worksheet";
    return "Letter Tracing";
  }

  function loadAssetImage() {
    if (!state.asset) return Promise.resolve(null);
    if (state.assetImage) return Promise.resolve(state.assetImage);
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () {
        state.assetImage = image;
        resolve(image);
      };
      image.onerror = function () {
        reject(new Error("Nie udało się wczytać ilustracji."));
      };
      image.src = state.asset.sourceDataUrl;
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
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Błąd otwarcia Koszyka Feniksa.")); };
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
    return withFenixBookBasketStore("readwrite", function (store) { store.put(page); });
  }

  function refreshGlobalFenixBasketStatus() {
    if (window.FenixBasketStatus && typeof window.FenixBasketStatus.refresh === "function") {
      window.FenixBasketStatus.refresh();
    }
  }

  function downloadFenixPack(pack) {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json;charset=utf-8" });
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
        if (blob) resolve(blob);
        else reject(new Error("Nie udało się przygotować PNG Blob."));
      }, "image/png");
    });
  }

  function createFenixBookBasketPageId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return createId("fenix-basket");
  }

  function createAlphabetPngFileName(letter, index) {
    const suffix = typeof index === "number" && index > 0 ? "-" + String(index + 1).padStart(2, "0") : "";
    return "fenix-alphabet-" + letter + "-page-" + createDateStamp() + suffix + ".png";
  }

  function createFenixPackFileName() {
    return "fenix-alphabet-studio-pack-" + createDateStamp() + ".fenixpack";
  }

  function createDateStamp() {
    const now = new Date();
    const pad = function (value) { return String(value).padStart(2, "0"); };
    return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()), "-", pad(now.getHours()), pad(now.getMinutes())].join("");
  }

  function setBusy(isBusy) {
    state.isBusy = isBusy;
    [
      "alphabetStudioExportPng",
      "alphabetStudioAddToBasket",
      "alphabetStudioAddRangeToBasket",
      "alphabetStudioExportPack",
      "alphabetStudioExportRangePack"
    ].forEach(function (id) {
      const button = el(id);
      if (button) button.disabled = isBusy;
    });
  }

  function setStatus(message) {
    const status = el("alphabetStudioStatusText");
    if (status) status.textContent = message;
  }

  function setMessage(message) {
    const node = el("alphabetStudioMessage");
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

  function setValue(id, value) {
    const node = el(id);
    if (node) node.value = String(value);
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
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error("Nie udało się odczytać pliku.")); };
      reader.readAsText(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error("Nie udało się odczytać pliku.")); };
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
