(function () {
  "use strict";

  const VERSION = 3;
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
  function sleep(ms) { return new Promise(function (resolve) { window.setTimeout(resolve, ms); }); }

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

  async function getAllKeys() {
    const db = await openDb();
    try {
      return await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).getAllKeys();
        request.onsuccess = function () { resolve(request.result || []); };
        request.onerror = function () { reject(request.error || new Error("Nie udało się odczytać identyfikatorów Koszyka.")); };
      });
    } finally {
      db.close();
    }
  }

  async function getPage(id) {
    if (!id) return null;
    const db = await openDb();
    try {
      return await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error || new Error("Nie udało się odczytać strony z Koszyka.")); };
      });
    } finally {
      db.close();
    }
  }

  async function findPageByPairId(pairId, expectedType) {
    const keys = await getAllKeys();
    for (let index = 0; index < keys.length; index += 1) {
      const page = await getPage(keys[index]);
      if (page && page.wordSearchPairId === pairId && (!expectedType || page.pageType === expectedType)) return page;
      if (index % 5 === 4) await sleep(0);
    }
    return null;
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
        tx.onabort = function () { reject(tx.error || new Error("Przerwano zapis pary Word Search.")); };
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

  function installLightweightGetAllPatch() {
    const proto = window.IDBObjectStore && window.IDBObjectStore.prototype;
    if (!proto || typeof proto.getAll !== "function" || typeof proto.getAllKeys !== "function") {
      return function () {};
    }

    const descriptor = Object.getOwnPropertyDescriptor(proto, "getAll");
    const original = proto.getAll;
    let active = false;

    function lightweightGetAll(query, count) {
      return this.getAllKeys(query, count);
    }

    try {
      Object.defineProperty(proto, "getAll", {
        configurable: true,
        writable: true,
        value: lightweightGetAll
      });
      active = true;
    } catch (error) {
      try {
        proto.getAll = lightweightGetAll;
        active = proto.getAll === lightweightGetAll;
      } catch (ignored) {
        active = false;
      }
    }

    return function restore() {
      if (!active) return;
      try {
        if (descriptor) Object.defineProperty(proto, "getAll", descriptor);
        else proto.getAll = original;
      } catch (error) {
        try { proto.getAll = original; } catch (ignored) {}
      }
    };
  }

  async function runLegacyBasketWrite(action) {
    const restore = installLightweightGetAllPatch();
    try {
      return await action();
    } finally {
      restore();
    }
  }

  async function waitForNewPage(beforeIds, pageType, baselineStatus, timeout) {
    const started = Date.now();
    while (Date.now() - started < (timeout || 30000)) {
      const keys = await getAllKeys();
      const candidates = keys.filter(function (id) { return !beforeIds.has(id); });
      for (const id of candidates) {
        const page = await getPage(id);
        if (page && page.pageType === pageType) return page;
      }

      const currentStatus = statusText();
      if (currentStatus !== baselineStatus && /błąd|brak poprawnych|nie udało|niedostęp|przerwano/i.test(currentStatus)) {
        throw new Error(currentStatus);
      }
      await sleep(180);
    }
    throw new Error("Przekroczono czas zapisu strony Word Search: " + pageType + ".");
  }

  async function waitForPageUpdate(pageId, previousUpdatedAt, baselineStatus, timeout) {
    const started = Date.now();
    while (Date.now() - started < (timeout || 30000)) {
      const page = await getPage(pageId);
      if (page && page.updatedAt && page.updatedAt !== previousUpdatedAt) return page;
      const currentStatus = statusText();
      if (currentStatus !== baselineStatus && /błąd|brak poprawnych|nie udało|niedostęp|przerwano/i.test(currentStatus)) {
        throw new Error(currentStatus);
      }
      await sleep(180);
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
      note.textContent = "Tryb 1:1 zapisuje zadanie i rozwiązanie z identycznym seedem, bez wczytywania całego Koszyka do pamięci.";
      actions.parentElement.appendChild(note);
    }
  }

  async function refreshLightStatus() {
    try {
      const total = (await getAllKeys()).length;
      document.querySelectorAll("[data-fenix-basket-status]").forEach(function (node) {
        node.textContent = "";
        const status = document.createElement("span");
        status.textContent = total ? total + (total === 1 ? " strona w koszyku" : " stron w koszyku") : "Koszyk jest pusty";
        node.appendChild(status);
      });
    } catch (error) {
      console.warn("FENIX: nie udało się odświeżyć lekkiego licznika Koszyka.", error);
    }
  }

  async function addOnePage(mode, knownIds) {
    clickButton(mode === "solution" ? "wordSearchPreviewSolution" : "wordSearchPreviewPuzzle");
    await sleep(120);
    const baseline = statusText();
    const addButtonId = mode === "solution" ? "wordSearchAddSolutionToBasket" : "wordSearchAddPuzzleToBasket";
    const expectedType = mode === "solution" ? "word_search_solution" : "word_search";

    return runLegacyBasketWrite(async function () {
      clickButton(addButtonId);
      return waitForNewPage(knownIds, expectedType, baseline, 30000);
    });
  }

  async function addPair() {
    if (busy) return;
    setBusy(true);
    const createdIds = [];
    try {
      setStatus("Zapisywanie pary 1:1 w trybie oszczędzania pamięci...");
      const knownIds = new Set(await getAllKeys());

      const puzzle = await addOnePage("puzzle", knownIds);
      createdIds.push(puzzle.id);
      knownIds.add(puzzle.id);

      await sleep(120);
      const solution = await addOnePage("solution", knownIds);
      createdIds.push(solution.id);

      linkPair(puzzle, solution, createPairId());
      await writePages([puzzle, solution], []);
      clickButton("wordSearchPreviewPuzzle");
      await refreshLightStatus();
      setStatus("Dodano kompletną parę 1:1: zadanie i odpowiadające mu rozwiązanie.");
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

  async function updatePair() {
    if (busy) return;
    const editedId = new URLSearchParams(location.search).get("editBasketPage");
    if (!editedId) {
      setStatus("Najpierw otwórz zadanie Word Search z Koszyka przez „Edytuj parę w module”.");
      return;
    }

    setBusy(true);
    let originalPuzzle = null;
    let originalPartner = null;
    const temporaryIds = [];
    try {
      originalPuzzle = await getPage(editedId);
      if (!originalPuzzle || originalPuzzle.pageType !== "word_search") {
        throw new Error("Aktualizacja pary 1:1 jest dostępna po otwarciu zadania, nie strony rozwiązania.");
      }

      const pairId = originalPuzzle.wordSearchPairId ||
        (originalPuzzle.editSnapshot && originalPuzzle.editSnapshot.wordSearchPairId) ||
        createPairId();

      originalPartner = originalPuzzle.wordSearchPartnerId
        ? await getPage(originalPuzzle.wordSearchPartnerId)
        : await findPageByPairId(pairId, "word_search_solution");

      clickButton("wordSearchPreviewPuzzle");
      await sleep(120);
      let baseline = statusText();
      const updatedPuzzle = await runLegacyBasketWrite(async function () {
        clickButton("wordSearchUpdateBasketPage");
        return waitForPageUpdate(editedId, originalPuzzle.updatedAt, baseline, 30000);
      });

      const knownIds = new Set(await getAllKeys());
      clickButton("wordSearchPreviewSolution");
      await sleep(120);
      baseline = statusText();
      const temporarySolution = await runLegacyBasketWrite(async function () {
        clickButton("wordSearchAddSolutionToBasket");
        return waitForNewPage(knownIds, "word_search_solution", baseline, 30000);
      });
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
      await refreshLightStatus();
      setStatus(originalPartner
        ? "Zaktualizowano zadanie i jego rozwiązanie 1:1 bez duplikatu."
        : "Zaktualizowano zadanie i dodano brakujące rozwiązanie 1:1.");
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
    if (add && add.dataset.fenixPairingBound !== "true") {
      add.dataset.fenixPairingBound = "true";
      add.addEventListener("click", addPair);
    }
    const update = el("wordSearchUpdatePairInBasket");
    if (update && update.dataset.fenixPairingBound !== "true") {
      update.dataset.fenixPairingBound = "true";
      update.addEventListener("click", updatePair);
    }

    const editedId = new URLSearchParams(location.search).get("editBasketPage");
    if (editedId && update) {
      try {
        const page = await getPage(editedId);
        update.hidden = !(page && page.pageType === "word_search");
      } catch (error) {
        console.error(error);
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
