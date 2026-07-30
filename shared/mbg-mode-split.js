(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const mode = params.get("fenixMode") === "maze-studio" ? "maze-studio" : "book-builder";
  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;
  const PAGE_W = 2550;
  const PAGE_H = 3300;
  let busy = false;
  let editedPage = null;

  window.FenixMbgMode = mode;
  document.documentElement.dataset.fenixMbgMode = mode;

  function el(id) { return document.getElementById(id); }
  function createId(prefix) {
    return prefix + "-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
  }
  function openDb() {
    return new Promise(function (resolve, reject) {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Nie udało się otworzyć Koszyka Feniksa.")); };
    });
  }
  async function getAllPages() {
    const db = await openDb();
    try {
      return await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    } finally { db.close(); }
  }
  async function writePages(pages, deleteIds) {
    const db = await openDb();
    try {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        (deleteIds || []).forEach(function (id) { if (id) store.delete(id); });
        (pages || []).forEach(function (page) { store.put(page); });
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error("Błąd zapisu pary labiryntu.")); };
      });
    } finally { db.close(); }
  }
  function sortPages(pages) {
    return pages.slice().sort(function (a, b) {
      const ao = Number.isFinite(Number(a.basketOrder)) ? Number(a.basketOrder) : (Number.isFinite(Number(a.order)) ? Number(a.order) : 999999);
      const bo = Number.isFinite(Number(b.basketOrder)) ? Number(b.basketOrder) : (Number.isFinite(Number(b.order)) ? Number(b.order) : 999999);
      return ao - bo;
    });
  }
  function setStatus(message) {
    const node = el("statusText");
    if (node) node.textContent = message;
  }
  function setBusy(value) {
    busy = value;
    ["mazeStudioAddPairs", "mazeStudioUpdatePair"].forEach(function (id) {
      const button = el(id);
      if (button) button.disabled = value;
    });
  }
  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("Nie udało się utworzyć PNG."));
      }, "image/png");
    });
  }
  function createCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    return canvas;
  }
  function captureControls() {
    const controls = {};
    document.querySelectorAll("input[id],select[id],textarea[id]").forEach(function (node) {
      if (!node.id || node.type === "file" || node.id.indexOf("mazeStudio") === 0) return;
      controls[node.id] = node.type === "checkbox" ? { type: "checkbox", checked: !!node.checked } : { type: node.type || node.tagName.toLowerCase(), value: node.value };
    });
    return controls;
  }
  function applyControls(controls) {
    Object.keys(controls || {}).forEach(function (id) {
      const node = el(id);
      if (!node) return;
      const data = controls[id] || {};
      if (node.type === "checkbox") node.checked = !!data.checked;
      else if (data.value !== undefined) node.value = data.value;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  async function imageToDataUrl(img) {
    if (!img) return "";
    const src = String(img.src || "");
    if (src.indexOf("data:image") === 0) return src;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width || 1;
      canvas.height = img.naturalHeight || img.height || 1;
      canvas.getContext("2d").drawImage(img, 0, 0);
      return canvas.toDataURL("image/png");
    } catch (error) {
      console.warn("Maze Studio: nie udało się zapisać assetu do snapshotu.", error);
      return "";
    }
  }
  async function captureAssets() {
    const result = { main: {}, masks: [], deco: [] };
    if (typeof MBG === "undefined") return result;
    for (const key of ["start", "goal", "checkpoint", "enemy", "mask"]) {
      result.main[key] = await imageToDataUrl(MBG.assets && MBG.assets[key]);
    }
    for (const item of (MBG.maskAssets || [])) {
      const dataUrl = await imageToDataUrl(item && item.img);
      if (dataUrl) result.masks.push({ name: item.name || "mask", dataUrl: dataUrl });
    }
    for (const item of (MBG.decoAssets || [])) {
      const dataUrl = await imageToDataUrl(item && item.img);
      if (dataUrl) result.deco.push({ name: item.name || "deco", dataUrl: dataUrl });
    }
    return result;
  }
  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
  async function restoreAssets(snapshot) {
    if (typeof MBG === "undefined" || !snapshot) return;
    const main = snapshot.main || {};
    for (const key of ["start", "goal", "checkpoint", "enemy", "mask"]) {
      MBG.assets[key] = main[key] ? await loadImage(main[key]) : null;
    }
    MBG.maskAssets = [];
    for (const item of (snapshot.masks || [])) MBG.maskAssets.push({ name: item.name, img: await loadImage(item.dataUrl) });
    MBG.decoAssets = [];
    for (const item of (snapshot.deco || [])) MBG.decoAssets.push({ name: item.name, img: await loadImage(item.dataUrl) });
    if (typeof updateAssetCounters === "function") updateAssetCounters();
    if (typeof updateMaskCounter === "function") updateMaskCounter();
    if (typeof updateDecoCounter === "function") updateDecoCounter();
  }
  function makeSnapshot(settings, mazeData, assets, pairId, pairRole, partnerId, pageIndex, createdAt) {
    return {
      snapshotVersion: 1,
      sourceModule: "maze-studio",
      renderMode: pairRole,
      settings: settings,
      controls: captureControls(),
      assets: assets,
      mazeData: mazeData,
      mazePairId: pairId,
      mazePairRole: pairRole,
      mazePartnerId: partnerId,
      pageIndex: pageIndex,
      createdAt: createdAt,
      updatedAt: new Date().toISOString()
    };
  }
  function renderMazeBlob(settings, mazeData, isSolution) {
    const canvas = createCanvas();
    drawMazePage(canvas.getContext("2d"), settings, mazeData, isSolution);
    if (typeof forceCanvasGrayscale === "function") forceCanvasGrayscale(canvas);
    return canvasToBlob(canvas);
  }
  async function buildPair(settings, mazeData, pairId, pageIndex, orderStart, existingPuzzle, existingSolution) {
    const [puzzleBlob, solutionBlob, assets] = await Promise.all([
      renderMazeBlob(settings, mazeData, false),
      renderMazeBlob(settings, mazeData, true),
      captureAssets()
    ]);
    const now = new Date().toISOString();
    const puzzleId = existingPuzzle ? existingPuzzle.id : createId("maze");
    const solutionId = existingSolution ? existingSolution.id : createId("maze-solution");
    const puzzleCreated = existingPuzzle && existingPuzzle.createdAt ? existingPuzzle.createdAt : now;
    const solutionCreated = existingSolution && existingSolution.createdAt ? existingSolution.createdAt : now;
    const puzzleOrder = existingPuzzle && Number.isFinite(Number(existingPuzzle.basketOrder)) ? Number(existingPuzzle.basketOrder) : orderStart;
    const solutionOrder = existingSolution && Number.isFinite(Number(existingSolution.basketOrder)) ? Number(existingSolution.basketOrder) : orderStart + 1;
    const mazeLabel = (settings.mazePrefix || "Maze") + " " + pageIndex;
    const puzzle = Object.assign({}, existingPuzzle || {}, {
      id: puzzleId,
      sourceModule: "maze-studio",
      sourceKind: "local_basket",
      pageType: "maze",
      fileName: "maze-" + pageIndex + ".png",
      title: mazeLabel,
      width: PAGE_W,
      height: PAGE_H,
      mimeType: "image/png",
      createdAt: puzzleCreated,
      updatedAt: now,
      order: puzzleOrder,
      basketOrder: puzzleOrder,
      includeInBook: existingPuzzle ? existingPuzzle.includeInBook !== false : true,
      blob: puzzleBlob,
      mazePairId: pairId,
      mazePairRole: "puzzle",
      mazePartnerId: solutionId,
      bookSection: "activities",
      isSolution: false
    });
    const solution = Object.assign({}, existingSolution || {}, {
      id: solutionId,
      sourceModule: "maze-studio",
      sourceKind: "local_basket",
      pageType: "maze_solution",
      fileName: "maze-" + pageIndex + "-solution.png",
      title: mazeLabel + " — Solution",
      width: PAGE_W,
      height: PAGE_H,
      mimeType: "image/png",
      createdAt: solutionCreated,
      updatedAt: now,
      order: solutionOrder,
      basketOrder: solutionOrder,
      includeInBook: existingSolution ? existingSolution.includeInBook !== false : true,
      blob: solutionBlob,
      mazePairId: pairId,
      mazePairRole: "solution",
      mazePartnerId: puzzleId,
      bookSection: "solutions",
      isSolution: true
    });
    puzzle.editSnapshot = makeSnapshot(settings, mazeData, assets, pairId, "puzzle", solutionId, pageIndex, puzzleCreated);
    solution.editSnapshot = makeSnapshot(settings, mazeData, assets, pairId, "solution", puzzleId, pageIndex, solutionCreated);
    return [puzzle, solution];
  }
  async function addPairs() {
    if (busy) return;
    setBusy(true);
    try {
      const count = Math.max(1, Math.min(50, Number(el("mazeStudioVariantCount").value) || 1));
      const startNumber = Math.max(1, Number(el("mazeStudioStartNumber").value) || 1);
      const pages = sortPages(await getAllPages());
      let orderStart = pages.length;
      const created = [];
      for (let i = 0; i < count; i += 1) {
        setStatus("Tworzenie pary labiryntu " + (i + 1) + " z " + count + "...");
        const settings = readSettings();
        const pageIndex = startNumber + i;
        const mazeData = createMazeData(settings, pageIndex);
        const pair = await buildPair(settings, mazeData, createId("maze-pair"), pageIndex, orderStart, null, null);
        created.push.apply(created, pair);
        orderStart += 2;
        await new Promise(function (resolve) { requestAnimationFrame(resolve); });
      }
      await writePages(created, []);
      setStatus("Dodano " + count + (count === 1 ? " parę" : " par") + " labirynt + rozwiązanie 1:1 do Koszyka Feniksa.");
      if (window.FenixBasketStatus && window.FenixBasketStatus.refresh) window.FenixBasketStatus.refresh();
    } catch (error) {
      console.error(error);
      setStatus(error && error.message ? error.message : "Błąd dodawania par labiryntów.");
    } finally { setBusy(false); }
  }
  async function updatePair() {
    if (busy || !editedPage) return;
    setBusy(true);
    try {
      const pages = sortPages(await getAllPages());
      const pairId = editedPage.mazePairId || (editedPage.editSnapshot && editedPage.editSnapshot.mazePairId);
      if (!pairId) throw new Error("Ta starsza strona nie ma identyfikatora pary Maze Studio 1:1.");
      const puzzle = pages.find(function (page) { return page.mazePairId === pairId && page.mazePairRole === "puzzle"; });
      const solution = pages.find(function (page) { return page.mazePairId === pairId && page.mazePairRole === "solution"; });
      const pageIndex = Number((editedPage.editSnapshot && editedPage.editSnapshot.pageIndex) || 1);
      const settings = readSettings();
      const mazeData = createMazeData(settings, pageIndex);
      const orderStart = puzzle ? Number(puzzle.basketOrder) : pages.length;
      const pair = await buildPair(settings, mazeData, pairId, pageIndex, orderStart, puzzle || editedPage, solution || null);
      await writePages(pair, []);
      editedPage = pair[0];
      setStatus("Zaktualizowano labirynt i dokładnie odpowiadające mu rozwiązanie 1:1.");
      if (window.FenixBasketStatus && window.FenixBasketStatus.refresh) window.FenixBasketStatus.refresh();
      renderSavedMazePreview(pair[0].editSnapshot);
    } catch (error) {
      console.error(error);
      setStatus(error && error.message ? error.message : "Błąd aktualizacji pary labiryntu.");
    } finally { setBusy(false); }
  }
  function renderSavedMazePreview(snapshot) {
    if (!snapshot || !snapshot.mazeData) {
      if (typeof generatePreview === "function") generatePreview();
      return;
    }
    const canvas = el("previewCanvas");
    if (!canvas) return;
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    drawMazePage(canvas.getContext("2d"), readSettings(), snapshot.mazeData, false);
    if (typeof forceCanvasGrayscale === "function") forceCanvasGrayscale(canvas);
  }
  function hideCardByText(root, expressions) {
    if (!root) return;
    Array.from(root.querySelectorAll(".card")).forEach(function (card) {
      const text = String(card.textContent || "").toLowerCase();
      if (expressions.some(function (expression) { return text.indexOf(expression) !== -1; })) card.hidden = true;
    });
  }
  function configureMazeStudioUi() {
    document.title = "Maze Studio — Fenix";
    document.body.classList.add("fenix-maze-studio-mode");
    const title = document.querySelector("header h1");
    const subtitle = document.querySelector("header .hero-copy p:not(.hero-kicker)");
    if (title) title.textContent = "Maze Studio";
    if (subtitle) subtitle.textContent = "Generator labiryntów i dokładnie odpowiadających im rozwiązań 1:1.";
    const back = document.querySelector(".hero-back-link");
    if (back) { back.href = "index.html"; back.textContent = "← Powrót do Fenixa"; }

    const workflow = document.querySelector(".book-builder-workflow");
    const globalBasket = document.querySelector(".mbg-global-basket");
    const blocks = document.querySelector(".active-book-blocks");
    if (workflow) workflow.hidden = true;
    if (globalBasket) globalBasket.hidden = true;
    if (blocks) blocks.hidden = true;
    const pagesGroup = document.querySelector(".group-pages");
    const outputGroup = document.querySelector(".group-output");
    if (pagesGroup) pagesGroup.hidden = true;
    if (outputGroup) outputGroup.hidden = true;

    const setup = document.querySelector(".group-setup");
    if (setup) {
      Array.from(setup.querySelectorAll(".card")).forEach(function (card) {
        const text = String(card.textContent || "").toLowerCase();
        card.hidden = !(text.indexOf("strony labiryntów i rozwiązań") !== -1 || text.indexOf("zapis / wczytanie") !== -1 || text.indexOf("zestaw ustawień") !== -1);
      });
      const summaryTitle = setup.querySelector(".workflow-title");
      const summaryDesc = setup.querySelector(".workflow-desc");
      if (summaryTitle) summaryTitle.textContent = "Teksty i preset labiryntu";
      if (summaryDesc) summaryDesc.textContent = "Tytuły stron, numeracja oraz zapis ustawień Maze Studio.";
    }

    const nav = document.querySelector(".hero-badges");
    if (nav) {
      nav.innerHTML = '<a href="#workflow-book">A. Teksty</a><a href="#workflow-maze">B. Labirynt</a><a href="#workflow-assets">C. Assety</a><a href="#workflow-preview">D. Podgląd</a><a href="basket.html">Koszyk</a>';
    }
    const mazeGroup = document.querySelector(".group-maze");
    const assetsGroup = document.querySelector(".group-assets");
    const previewGroup = document.querySelector(".group-preview");
    if (mazeGroup) mazeGroup.open = true;
    if (assetsGroup) assetsGroup.open = false;
    if (previewGroup) previewGroup.open = true;

    const pageType = el("previewPageType");
    if (pageType) pageType.value = "maze-only";
    const previewMode = el("previewMode");
    if (previewMode) previewMode.value = "single";

    const host = previewGroup && (previewGroup.querySelector(".group-body") || previewGroup);
    if (host && !el("mazeStudioPairActions")) {
      const card = document.createElement("section");
      card.id = "mazeStudioPairActions";
      card.className = "card maze-studio-pair-card";
      card.innerHTML = '<h2>Dodaj do Koszyka jako parę 1:1</h2><p class="note">Każdy labirynt i jego rozwiązanie powstają z jednego, wspólnego układu. Book Builder umieści rozwiązania Maze Studio przed rozwiązaniami Word Search.</p><div class="row"><div><label for="mazeStudioStartNumber">Numer pierwszego labiryntu</label><input id="mazeStudioStartNumber" type="number" min="1" max="999" value="1"></div><div><label for="mazeStudioVariantCount">Liczba par do utworzenia</label><input id="mazeStudioVariantCount" type="number" min="1" max="50" value="1"></div></div><div class="maze-studio-actions"><button id="mazeStudioAddPairs" type="button">Dodaj pary 1:1 do Koszyka</button><button id="mazeStudioUpdatePair" type="button" class="secondary-btn" hidden>Zaktualizuj tę parę 1:1</button><a class="maze-studio-basket-link" href="basket.html">Otwórz Koszyk Feniksa</a></div>';
      host.appendChild(card);
      el("mazeStudioAddPairs").addEventListener("click", addPairs);
      el("mazeStudioUpdatePair").addEventListener("click", updatePair);
    }

    const style = document.createElement("style");
    style.id = "mazeStudioModeStyles";
    style.textContent = '.fenix-maze-studio-mode .grid{max-width:1420px;margin:0 auto}.maze-studio-pair-card{border-left-color:rgba(85,240,214,.9)!important}.maze-studio-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}.maze-studio-basket-link{display:inline-flex;align-items:center;min-height:42px;padding:9px 13px;border:1px solid rgba(99,220,255,.45);border-radius:9px;color:inherit;text-decoration:none;font-weight:850}.maze-studio-basket-link:hover{border-color:rgba(99,220,255,.9)}';
    document.head.appendChild(style);
  }
  async function loadEditedPage() {
    const id = params.get("editBasketPage");
    if (!id) return;
    const pages = await getAllPages();
    editedPage = pages.find(function (page) { return page.id === id; }) || null;
    if (!editedPage || editedPage.sourceModule !== "maze-studio" || !editedPage.editSnapshot) {
      setStatus("Nie da się odtworzyć tej pozycji w Maze Studio.");
      return;
    }
    applyControls(editedPage.editSnapshot.controls || {});
    await restoreAssets(editedPage.editSnapshot.assets || {});
    const update = el("mazeStudioUpdatePair");
    const add = el("mazeStudioAddPairs");
    if (update) update.hidden = false;
    if (add) add.hidden = true;
    const start = el("mazeStudioStartNumber");
    const count = el("mazeStudioVariantCount");
    if (start) start.value = String(editedPage.editSnapshot.pageIndex || 1);
    if (count) count.value = "1";
    renderSavedMazePreview(editedPage.editSnapshot);
    setStatus("Edytujesz parę Maze Studio 1:1 z Koszyka Feniksa.");
  }
  function configureBuilderUi() {
    document.body.classList.add("fenix-book-builder-only-mode");
    const subtitle = document.querySelector("header .hero-copy p:not(.hero-kicker)");
    if (subtitle) subtitle.textContent = "Końcowy skład książki z gotowych stron zapisanych w Koszyku Feniksa.";
    const mazeGroup = document.querySelector(".group-maze");
    if (mazeGroup) mazeGroup.hidden = true;
    const setup = document.querySelector(".group-setup");
    hideCardByText(setup, ["strony labiryntów i rozwiązań"]);
    const links = document.querySelector(".mbg-module-links");
    if (links && !links.querySelector('[href*="maze-studio"]')) {
      const link = document.createElement("a");
      link.href = "modules/maze-studio/maze-studio.html";
      link.textContent = "Otwórz Maze Studio";
      links.prepend(link);
    }
    const workflow = document.querySelector(".book-builder-workflow");
    if (workflow) workflow.innerHTML = '<strong>Workflow:</strong><span>1. Utwórz zadania i rozwiązania w modułach.</span><span>2. Sprawdź strony w Koszyku Feniksa.</span><span>3. Ustaw strony początkowe i końcowe.</span><span>4. Sprawdź audyt finalnego PDF.</span><span>5. Wygeneruj PDF KDP.</span>';
    const nav = document.querySelector(".hero-badges");
    if (nav) {
      Array.from(nav.querySelectorAll('a[href="#workflow-maze"]')).forEach(function (node) { node.remove(); });
      Array.from(nav.querySelectorAll("a")).forEach(function (node, index) {
        const label = String.fromCharCode(65 + index) + ". ";
        node.textContent = label + node.textContent.replace(/^[A-Z]\.?\s*/, "");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (mode === "maze-studio") {
      configureMazeStudioUi();
      window.setTimeout(function () { loadEditedPage().catch(function (error) { console.error(error); setStatus(error.message || "Błąd edycji Maze Studio."); }); }, 100);
    } else {
      configureBuilderUi();
    }
  });
})();