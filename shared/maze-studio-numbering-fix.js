(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  if (params.get("fenixMode") !== "maze-studio") return;

  const VERSION = "2026.08.01-1";
  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;
  const PAGE_W = 2550;
  const PAGE_H = 3300;
  let busy = false;
  let currentEditedPage = null;

  function el(id) { return document.getElementById(id); }

  function createId(prefix) {
    return prefix + "-" + (window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : Date.now() + "-" + Math.random().toString(16).slice(2));
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
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = function () { resolve(request.result || []); };
        request.onerror = function () { reject(request.error); };
      });
    } finally {
      db.close();
    }
  }

  async function writePages(pages) {
    const db = await openDb();
    try {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        (pages || []).forEach(function (page) { if (page) store.put(page); });
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error("Błąd zapisu pary labiryntu.")); };
      });
    } finally {
      db.close();
    }
  }

  function sortPages(pages) {
    return (pages || []).slice().sort(function (a, b) {
      const aOrder = Number.isFinite(Number(a && a.basketOrder))
        ? Number(a.basketOrder)
        : (Number.isFinite(Number(a && a.order)) ? Number(a.order) : 999999);
      const bOrder = Number.isFinite(Number(b && b.basketOrder))
        ? Number(b.basketOrder)
        : (Number.isFinite(Number(b && b.order)) ? Number(b.order) : 999999);
      return aOrder - bOrder;
    });
  }

  function maxOrder(pages) {
    return (pages || []).reduce(function (max, page) {
      const value = Number.isFinite(Number(page && page.basketOrder))
        ? Number(page.basketOrder)
        : (Number.isFinite(Number(page && page.order)) ? Number(page.order) : -1);
      return Math.max(max, value);
    }, -1);
  }

  function pairId(page) {
    return String(
      page && (
        page.mazePairId ||
        (page.editSnapshot && page.editSnapshot.mazePairId)
      ) || ""
    );
  }

  function pairRole(page) {
    const role = String(
      page && (
        page.mazePairRole ||
        (page.editSnapshot && page.editSnapshot.mazePairRole)
      ) || ""
    );
    if (role === "puzzle" || role === "solution") return role;
    return page && (page.isSolution === true || page.pageType === "maze_solution") ? "solution" : "puzzle";
  }

  function pageNumber(page) {
    const direct = Number(page && page.mazePageIndex);
    if (Number.isFinite(direct) && direct > 0) return Math.round(direct);

    const snapshot = page && page.editSnapshot || {};
    const snapshotNumber = Number(snapshot.pageIndex);
    if (Number.isFinite(snapshotNumber) && snapshotNumber > 0) return Math.round(snapshotNumber);

    const text = [page && page.title, page && page.fileName].map(function (value) {
      return String(value || "");
    }).join(" ");
    const match = text.match(/(?:maze)[\s_-]*(\d+)/i);
    return match ? Number(match[1]) : 0;
  }

  function usedNumbers(pages, excludedPairId) {
    const used = new Set();
    (pages || []).forEach(function (page) {
      if (!page || page.sourceModule !== "maze-studio" || pairRole(page) !== "puzzle") return;
      if (excludedPairId && pairId(page) === excludedPairId) return;
      const number = pageNumber(page);
      if (number > 0) used.add(number);
    });
    return used;
  }

  function nextNumber(pages) {
    let max = 0;
    usedNumbers(pages).forEach(function (number) { max = Math.max(max, number); });
    return max + 1;
  }

  function assertNumbersAvailable(pages, startNumber, count, excludedPairId) {
    const used = usedNumbers(pages, excludedPairId);
    const conflicts = [];
    for (let i = 0; i < count; i += 1) {
      const number = startNumber + i;
      if (used.has(number)) conflicts.push(number);
    }
    if (conflicts.length) {
      throw new Error(
        "Numer " + conflicts.join(", ") +
        (conflicts.length === 1 ? " jest już używany" : " są już używane") +
        " przez inną parę Maze Studio. Wybierz wolny numer."
      );
    }
  }

  function duplicateNumbers(pages) {
    const counts = new Map();
    (pages || []).forEach(function (page) {
      if (!page || page.sourceModule !== "maze-studio" || pairRole(page) !== "puzzle") return;
      const number = pageNumber(page);
      if (number > 0) counts.set(number, (counts.get(number) || 0) + 1);
    });
    return Array.from(counts.entries())
      .filter(function (entry) { return entry[1] > 1; })
      .map(function (entry) { return entry[0]; })
      .sort(function (a, b) { return a - b; });
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
      controls[node.id] = node.type === "checkbox"
        ? { type: "checkbox", checked: !!node.checked }
        : { type: node.type || node.tagName.toLowerCase(), value: node.value };
    });
    return controls;
  }

  async function imageToDataUrl(image) {
    if (!image) return "";
    const src = String(image.src || "");
    if (src.indexOf("data:image") === 0) return src;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width || 1;
      canvas.height = image.naturalHeight || image.height || 1;
      canvas.getContext("2d").drawImage(image, 0, 0);
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

  function makeSnapshot(settings, mazeData, assets, currentPairId, role, partnerId, number, createdAt) {
    return {
      snapshotVersion: 2,
      sourceModule: "maze-studio",
      renderMode: role,
      settings: settings,
      controls: captureControls(),
      assets: assets,
      mazeData: mazeData,
      mazePairId: currentPairId,
      mazePairRole: role,
      mazePartnerId: partnerId,
      pageIndex: number,
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

  async function buildPair(settings, mazeData, currentPairId, number, orderStart, existingPuzzle, existingSolution) {
    const results = await Promise.all([
      renderMazeBlob(settings, mazeData, false),
      renderMazeBlob(settings, mazeData, true),
      captureAssets()
    ]);
    const puzzleBlob = results[0];
    const solutionBlob = results[1];
    const assets = results[2];
    const now = new Date().toISOString();
    const puzzleId = existingPuzzle ? existingPuzzle.id : createId("maze");
    const solutionId = existingSolution ? existingSolution.id : createId("maze-solution");
    const puzzleCreated = existingPuzzle && existingPuzzle.createdAt ? existingPuzzle.createdAt : now;
    const solutionCreated = existingSolution && existingSolution.createdAt ? existingSolution.createdAt : now;
    const puzzleOrder = existingPuzzle && Number.isFinite(Number(existingPuzzle.basketOrder))
      ? Number(existingPuzzle.basketOrder)
      : orderStart;
    const solutionOrder = existingSolution && Number.isFinite(Number(existingSolution.basketOrder))
      ? Number(existingSolution.basketOrder)
      : orderStart + 1;
    const mazeLabel = (settings.mazePrefix || "Maze") + " " + number;

    const puzzle = Object.assign({}, existingPuzzle || {}, {
      id: puzzleId,
      sourceModule: "maze-studio",
      sourceKind: "local_basket",
      pageType: "maze",
      fileName: "maze-" + number + ".png",
      title: mazeLabel,
      mazePageIndex: number,
      width: PAGE_W,
      height: PAGE_H,
      mimeType: "image/png",
      createdAt: puzzleCreated,
      updatedAt: now,
      order: puzzleOrder,
      basketOrder: puzzleOrder,
      includeInBook: existingPuzzle ? existingPuzzle.includeInBook !== false : true,
      blob: puzzleBlob,
      mazePairId: currentPairId,
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
      fileName: "maze-" + number + "-solution.png",
      title: mazeLabel + " — Solution",
      mazePageIndex: number,
      width: PAGE_W,
      height: PAGE_H,
      mimeType: "image/png",
      createdAt: solutionCreated,
      updatedAt: now,
      order: solutionOrder,
      basketOrder: solutionOrder,
      includeInBook: existingSolution ? existingSolution.includeInBook !== false : true,
      blob: solutionBlob,
      mazePairId: currentPairId,
      mazePairRole: "solution",
      mazePartnerId: puzzleId,
      bookSection: "solutions",
      isSolution: true
    });

    puzzle.editSnapshot = makeSnapshot(settings, mazeData, assets, currentPairId, "puzzle", solutionId, number, puzzleCreated);
    solution.editSnapshot = makeSnapshot(settings, mazeData, assets, currentPairId, "solution", puzzleId, number, solutionCreated);
    return [puzzle, solution];
  }

  async function addPairs() {
    if (busy) return;
    setBusy(true);
    try {
      const pages = sortPages(await getAllPages());
      const count = Math.max(1, Math.min(50, Number(el("mazeStudioVariantCount").value) || 1));
      const startNumber = Math.max(1, Math.round(Number(el("mazeStudioStartNumber").value) || nextNumber(pages)));
      assertNumbersAvailable(pages, startNumber, count, "");

      let orderStart = maxOrder(pages) + 1;
      const created = [];
      for (let i = 0; i < count; i += 1) {
        const number = startNumber + i;
        setStatus("Tworzenie pary Maze " + number + " (" + (i + 1) + " z " + count + ")...");
        const settings = readSettings();
        const mazeData = createMazeData(settings, number);
        const pair = await buildPair(settings, mazeData, createId("maze-pair"), number, orderStart, null, null);
        created.push.apply(created, pair);
        orderStart += 2;
        await new Promise(function (resolve) { requestAnimationFrame(resolve); });
      }

      await writePages(created);
      const next = startNumber + count;
      if (el("mazeStudioStartNumber")) el("mazeStudioStartNumber").value = String(next);
      setStatus(
        "Dodano " + count + (count === 1 ? " parę" : " par") +
        " 1:1. Następny proponowany numer: " + next + "."
      );
      if (window.FenixBasketStatus && window.FenixBasketStatus.refresh) window.FenixBasketStatus.refresh();
    } catch (error) {
      console.error(error);
      setStatus(error && error.message ? error.message : "Błąd dodawania par Maze Studio.");
      if (typeof window.alert === "function") window.alert(error && error.message ? error.message : "Błąd dodawania par Maze Studio.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePair() {
    if (busy) return;
    setBusy(true);
    try {
      const editedId = params.get("editBasketPage");
      if (!editedId) throw new Error("Otwórz parę z Koszyka przez „Edytuj parę w module”.");

      const pages = sortPages(await getAllPages());
      let edited = pages.find(function (page) { return page && page.id === editedId; }) || currentEditedPage;
      if (!edited || edited.sourceModule !== "maze-studio") throw new Error("Nie znaleziono edytowanej pary Maze Studio.");

      const currentPairId = pairId(edited);
      if (!currentPairId) throw new Error("Ta strona nie ma identyfikatora pary Maze Studio 1:1.");

      const puzzle = pages.find(function (page) {
        return pairId(page) === currentPairId && pairRole(page) === "puzzle";
      });
      const solution = pages.find(function (page) {
        return pairId(page) === currentPairId && pairRole(page) === "solution";
      });
      if (!puzzle) throw new Error("Nie znaleziono strony zadania tej pary.");

      const number = Math.max(1, Math.round(Number(el("mazeStudioStartNumber").value) || pageNumber(puzzle) || 1));
      assertNumbersAvailable(pages, number, 1, currentPairId);

      const settings = readSettings();
      const mazeData = createMazeData(settings, number);
      const orderStart = Number.isFinite(Number(puzzle.basketOrder)) ? Number(puzzle.basketOrder) : maxOrder(pages) + 1;
      const pair = await buildPair(settings, mazeData, currentPairId, number, orderStart, puzzle, solution || null);
      await writePages(pair);
      currentEditedPage = pair[0];

      setStatus("Zaktualizowano parę jako Maze " + number + " + Solution " + number + " 1:1.");
      if (window.FenixBasketStatus && window.FenixBasketStatus.refresh) window.FenixBasketStatus.refresh();

      const canvas = el("previewCanvas");
      if (canvas) {
        canvas.width = PAGE_W;
        canvas.height = PAGE_H;
        drawMazePage(canvas.getContext("2d"), readSettings(), pair[0].editSnapshot.mazeData, false);
        if (typeof forceCanvasGrayscale === "function") forceCanvasGrayscale(canvas);
      }
    } catch (error) {
      console.error(error);
      setStatus(error && error.message ? error.message : "Błąd aktualizacji pary Maze Studio.");
      if (typeof window.alert === "function") window.alert(error && error.message ? error.message : "Błąd aktualizacji pary Maze Studio.");
    } finally {
      setBusy(false);
    }
  }

  function ensureNumberingNote() {
    const input = el("mazeStudioStartNumber");
    if (!input || el("mazeStudioNumberingNote")) return;
    const note = document.createElement("p");
    note.id = "mazeStudioNumberingNote";
    note.className = "note";
    note.textContent = "Numer jest zapisywany na obu stronach pary. Fenix blokuje numer używany już przez inny labirynt.";
    input.parentElement.appendChild(note);
  }

  async function configureNumberField() {
    const pages = await getAllPages();
    const input = el("mazeStudioStartNumber");
    if (!input) return;

    const editedId = params.get("editBasketPage");
    if (editedId) {
      currentEditedPage = pages.find(function (page) { return page && page.id === editedId; }) || null;
      if (currentEditedPage) input.value = String(pageNumber(currentEditedPage) || 1);
    } else {
      input.value = String(nextNumber(pages));
    }

    const duplicates = duplicateNumbers(pages);
    if (duplicates.length) {
      setStatus(
        "Uwaga: Koszyk zawiera powtórzone numery Maze: " + duplicates.join(", ") +
        ". Otwórz jedną z tych par do edycji i nadaj jej wolny numer."
      );
    }
  }

  function replaceActionButtons() {
    const oldAdd = el("mazeStudioAddPairs");
    const oldUpdate = el("mazeStudioUpdatePair");
    if (!oldAdd || !oldUpdate || oldAdd.dataset.numberingFix === VERSION) return false;

    const add = oldAdd.cloneNode(true);
    const update = oldUpdate.cloneNode(true);
    add.dataset.numberingFix = VERSION;
    update.dataset.numberingFix = VERSION;
    update.textContent = "Zaktualizuj tę parę 1:1 (także numer)";
    oldAdd.replaceWith(add);
    oldUpdate.replaceWith(update);
    add.addEventListener("click", addPairs);
    update.addEventListener("click", updatePair);
    return true;
  }

  function install() {
    let attempts = 0;
    const tryInstall = function () {
      attempts += 1;
      const ready =
        typeof window.readSettings === "function" &&
        typeof window.createMazeData === "function" &&
        typeof window.drawMazePage === "function" &&
        replaceActionButtons();

      if (!ready) {
        if (attempts < 200) window.setTimeout(tryInstall, 50);
        return;
      }

      ensureNumberingNote();
      window.setTimeout(function () {
        configureNumberField().catch(function (error) {
          console.error(error);
          setStatus(error.message || "Nie udało się ustawić numeracji Maze Studio.");
        });
      }, 180);

      window.FenixMazeNumberingFix = {
        version: VERSION,
        pageNumber: pageNumber,
        nextNumber: nextNumber,
        duplicateNumbers: duplicateNumbers
      };
      console.info("FENIX Maze Studio numbering fix active:", VERSION);
    };
    tryInstall();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();