(function () {
  "use strict";

  const VERSION = 2;
  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;
  const ACTION_IDS = [
    "wordSearchAddPairToBasket",
    "wordSearchUpdatePairInBasket",
    "wordSearchAddVariantsToBasket"
  ];
  let busy = false;

  function el(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function createPairId() {
    return "word-search-pair-" + (window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
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
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    } finally {
      db.close();
    }
  }

  async function writePages(pages, deleteIds) {
    const db = await openDb();
    try {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        (deleteIds || []).forEach(function (id) { if (id) store.delete(id); });
        (pages || []).forEach(function (page) { if (page) store.put(page); });
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error("Błąd zapisu pary Word Search.")); };
      });
    } finally {
      db.close();
    }
  }

  function setStatus(message) {
    const node = el("wordSearchStatusText");
    if (node) node.textContent = message;
  }

  function statusText() {
    const node = el("wordSearchStatusText");
    return node ? String(node.textContent || "") : "";
  }

  function setBusy(value) {
    busy = value;
    ACTION_IDS.forEach(function (id) {
      const node = el(id);
      if (node) node.disabled = value;
    });
  }

  async function waitForNewPage(beforeIds, pageType, baselineStatus, timeout) {
    const started = Date.now();
    while (Date.now() - started < (timeout || 20000)) {
      const pages = await getAllPages();
      const page = pages.find(function (item) {
        return item && !beforeIds.has(item.id) && item.pageType === pageType;
      });
      if (page) return page;
      const currentStatus = statusText();
      if (currentStatus !== baselineStatus && /błąd|brak poprawnych|nie udało|niedostęp/i.test(currentStatus)) {
        throw new Error(currentStatus);
      }
      await sleep(120);
    }
    throw new Error("Przekroczono czas zapisu strony Word Search: " + pageType + ".");
  }

  async function waitForPageUpdate(pageId, previousUpdatedAt, baselineStatus, timeout) {
    const started = Date.now();
    while (Date.now() - started < (timeout || 20000)) {
      const pages = await getAllPages();
      const page = pages.find(function (item) { return item && item.id === pageId; });
      if (page && page.updatedAt && page.updatedAt !== previousUpdatedAt) return page;
      const currentStatus = statusText();
      if (currentStatus !== baselineStatus && /błąd|brak poprawnych|nie udało|niedostęp/i.test(currentStatus)) {
        throw new Error(currentStatus);
      }
      await sleep(120);
    }
    throw new Error("Przekroczono czas aktualizacji zadania Word Search.");
  }

  function clickButton(id) {
    const button = el(id);
    if (!button) throw new Error("Brak przycisku: " + id);
    button.click();
  }

  function seedFor(page) {
    const snapshot = page && page.editSnapshot;
    return snapshot && snapshot.settings ? snapshot.settings.seed : undefined;
  }

  function linkPair(puzzle, solution, pairId) {
    const seed = seedFor(puzzle);
    puzzle.wordSearchPairId = pairId;
    puzzle.wordSearchPairRole = "puzzle";
    puzzle.wordSearchPartnerId = solution.id;
    puzzle.wordSearchPairSeed = seed;
    puzzle.wordSearchPairVersion = VERSION;
    puzzle.bookSection = "activities";
    puzzle.isSolution = false;

    solution.wordSearchPairId = pairId;
    solution.wordSearchPairRole = "solution";
    solution.wordSearchPartnerId = puzzle.id;
    solution.wordSearchPairSeed = seed;
    solution.wordSearchPairVersion = VERSION;
    solution.bookSection = "solutions";
    solution.isSolution = true;

    [puzzle, solution].forEach(function (page) {
      if (!page.editSnapshot || typeof page.editSnapshot !== "object") return;
      page.editSnapshot.wordSearchPairId = pairId;
      page.editSnapshot.wordSearchPairRole = page === puzzle ? "puzzle" : "solution";
      page.editSnapshot.wordSearchPartnerId = page === puzzle ? solution.id : puzzle.id;
      page.editSnapshot.wordSearchPairSeed = seed;
      page.editSnapshot.wordSearchPairVersion = VERSION;
    });
  }

  function createActionButton(id, text, className) {
    const node = document.createElement("button");
    node.id = id;
    node.type = "button";
    node.textContent = text;
    node.className = className;
    return node;
  }

  function ensureControls() {
    const actions = document.querySelector(".word-search-actions");
    if (!actions) return;
    if (!el("wordSearchAddPairToBasket")) {
      const add = createActionButton("wordSearchAddPairToBasket", "Dodaj zadanie + rozwiązanie 1:1", "word-search-button word-search-button-success");
      const variants = el("wordSearchAddVariantsToBasket");
      actions.insertBefore(add, variants || null);
    }
    if (!el("wordSearchUpdatePairInBasket")) {
      const update = createActionButton("wordSearchUpdatePairInBasket", "Zaktualizuj zadanie + rozwiązanie 1:1", "word-search-button word-search-button-success");
      update.hidden = true;
      actions.appendChild(update);
    }
    if (!el("wordSearchPairingNote")) {
      const note = document.createElement("p");
      note.id = "wordSearchPairingNote";
      note.className = "word-search-note";
      note.textContent = "Tryb 1:1 zapisuje zadanie i rozwiązanie z identycznym seedem. Book Builder umieszcza rozwiązanie po rozwiązaniach labiryntów.";
      actions.parentElement.appendChild(note);
    }
  }

  async function addPair() {
    if (busy) return;
    setBusy(true);
    const createdIds = [];
    try {
      const before = await getAllPages();
      const knownIds = new Set(before.map(function (page) { return page.id; }));

      clickButton("wordSearchPreviewPuzzle");
      await sleep(80);
      let baseline = statusText();
      clickButton("wordSearchAddPuzzleToBasket");
      const puzzle = await waitForNewPage(knownIds, "word_search", baseline);
      createdIds.push(puzzle.id);
      knownIds.add(puzzle.id);

      clickButton("wordSearchPreviewSolution");
      await sleep(80);
      baseline = statusText();
      clickButton("wordSearchAddSolutionToBasket");
      const solution = await waitForNewPage(knownIds, "word_search_solution", baseline);
      createdIds.push(solution.id);

      linkPair(puzzle, solution, createPairId());
      await writePages([puzzle, solution], []);
      clickButton("wordSearchPreviewPuzzle");
      setStatus("Dodano kompletną parę 1:1: zadanie i dokładnie odpowiadające mu rozwiązanie.");
      if (window.FenixBasketStatus && window.FenixBasketStatus.refresh) window.FenixBasketStatus.refresh();
    } catch (error) {
      if (createdIds.length) {
        try { await writePages([], createdIds); } catch (rollbackError) { console.error("FENIX: błąd wycofania niepełnej pary.", rollbackError); }
      }
      console.error(error);
      setStatus(error && error.message ? error.message : "Błąd dodawania pary 1:1.");
    } finally {
      setBusy(false);
    }
  }

  function findExistingPartner(pages, current, pairId) {
    if (current.wordSearchPartnerId) {
      const direct = pages.find(function (page) { return page && page.id === current.wordSearchPartnerId; });
      if (direct && direct.pageType === "word_search_solution") return direct;
    }
    return pages.find(function (page) {
      return page && page.wordSearchPairId === pairId && page.pageType === "word_search_solution";
    });
  }

  async function updatePair() {
    if (busy) return;
    const editedId = new URLSearchParams(location.search).get("editBasketPage");
    if (!editedId) {
      setStatus("Najpierw otwórz zadanie Word Search z Koszyka przez „Edytuj w module”.");
      return;
    }

    setBusy(true);
    let originalPuzzle = null;
    let originalPartner = null;
    const temporaryIds = [];
    try {
      const before = await getAllPages();
      const current = before.find(function (page) { return page && page.id === editedId; });
      if (!current || current.pageType !== "word_search") {
        throw new Error("Aktualizacja pary 1:1 jest dostępna po otwarciu zadania, nie strony rozwiązania.");
      }

      originalPuzzle = current;
      const pairId = current.wordSearchPairId || (current.editSnapshot && current.editSnapshot.wordSearchPairId) || createPairId();
      originalPartner = findExistingPartner(before, current, pairId) || null;

      clickButton("wordSearchPreviewPuzzle");
      await sleep(80);
      let baseline = statusText();
      clickButton("wordSearchUpdateBasketPage");
      const updatedPuzzle = await waitForPageUpdate(editedId, current.updatedAt, baseline);

      const idsBeforeSolution = new Set((await getAllPages()).map(function (page) { return page.id; }));
      clickButton("wordSearchPreviewSolution");
      await sleep(80);
      baseline = statusText();
      clickButton("wordSearchAddSolutionToBasket");
      const temporarySolution = await waitForNewPage(idsBeforeSolution, "word_search_solution", baseline);
      temporaryIds.push(temporarySolution.id);

      let finalSolution = temporarySolution;
      const deleteIds = [];
      if (originalPartner) {
        finalSolution = Object.assign({}, originalPartner, temporarySolution, {
          id: originalPartner.id,
          order: originalPartner.order,
          basketOrder: originalPartner.basketOrder,
          createdAt: originalPartner.createdAt || temporarySolution.createdAt
        });
        deleteIds.push(temporarySolution.id);
      }

      linkPair(updatedPuzzle, finalSolution, pairId);
      await writePages([updatedPuzzle, finalSolution], deleteIds);
      clickButton("wordSearchPreviewPuzzle");
      setStatus(originalPartner
        ? "Zaktualizowano zadanie i podmieniono jego rozwiązanie 1:1 bez duplikatu."
        : "Zaktualizowano zadanie i dodano brakujące rozwiązanie 1:1.");
      if (window.FenixBasketStatus && window.FenixBasketStatus.refresh) window.FenixBasketStatus.refresh();
    } catch (error) {
      try {
        await writePages([originalPuzzle, originalPartner].filter(Boolean), temporaryIds);
      } catch (rollbackError) {
        console.error("FENIX: błąd wycofania nieudanej aktualizacji pary.", rollbackError);
      }
      console.error(error);
      setStatus(error && error.message ? error.message : "Błąd aktualizacji pary 1:1.");
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    ensureControls();
    const add = el("wordSearchAddPairToBasket");
    if (add) add.addEventListener("click", addPair);
    const update = el("wordSearchUpdatePairInBasket");
    if (update) update.addEventListener("click", updatePair);

    const editedId = new URLSearchParams(location.search).get("editBasketPage");
    if (editedId && update) {
      try {
        const pages = await getAllPages();
        const page = pages.find(function (item) { return item && item.id === editedId; });
        update.hidden = !(page && page.pageType === "word_search");
      } catch (error) {
        console.error(error);
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
