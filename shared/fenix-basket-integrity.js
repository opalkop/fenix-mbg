(function (root, factory) {
  "use strict";
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) {
    root.FenixBasketIntegrity = api;
    api.install();
  }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;
  const FORMAT = "fenix-basket";
  const FORMAT_VERSION = 1;

  function defaultCreateId(prefix) {
    return (prefix || "basket") + "-" + (root.crypto && root.crypto.randomUUID
      ? root.crypto.randomUUID()
      : Date.now() + "-" + Math.random().toString(16).slice(2));
  }

  function pairKind(page) {
    if (!page) return "";
    if (page.sourceModule === "maze-studio") return "maze";
    if (page.sourceModule === "word-search-studio") return "word-search";
    return "";
  }

  function getPairId(page) {
    const snapshot = page && page.editSnapshot || {};
    if (pairKind(page) === "maze") return String(page.mazePairId || snapshot.mazePairId || "");
    if (pairKind(page) === "word-search") return String(page.wordSearchPairId || snapshot.wordSearchPairId || "");
    return "";
  }

  function getPairRole(page) {
    const snapshot = page && page.editSnapshot || {};
    let role = "";
    if (pairKind(page) === "maze") role = page.mazePairRole || snapshot.mazePairRole || "";
    if (pairKind(page) === "word-search") role = page.wordSearchPairRole || snapshot.wordSearchPairRole || "";
    if (role === "puzzle" || role === "solution") return role;
    return page && (page.isSolution === true || page.bookSection === "solutions" || /solution/i.test(String(page.pageType || "")))
      ? "solution"
      : "puzzle";
  }

  function getPartnerId(page) {
    const snapshot = page && page.editSnapshot || {};
    if (pairKind(page) === "maze") return String(page.mazePartnerId || snapshot.mazePartnerId || "");
    if (pairKind(page) === "word-search") return String(page.wordSearchPartnerId || snapshot.wordSearchPartnerId || "");
    return "";
  }

  function setPairId(page, value) {
    if (!page) return;
    const snapshot = page.editSnapshot && typeof page.editSnapshot === "object" ? page.editSnapshot : null;
    if (pairKind(page) === "maze") {
      page.mazePairId = value;
      if (snapshot) snapshot.mazePairId = value;
    }
    if (pairKind(page) === "word-search") {
      page.wordSearchPairId = value;
      if (snapshot) snapshot.wordSearchPairId = value;
    }
  }

  function setPartnerId(page, value) {
    if (!page) return;
    const snapshot = page.editSnapshot && typeof page.editSnapshot === "object" ? page.editSnapshot : null;
    if (pairKind(page) === "maze") {
      page.mazePartnerId = value;
      if (snapshot) snapshot.mazePartnerId = value;
    }
    if (pairKind(page) === "word-search") {
      page.wordSearchPartnerId = value;
      if (snapshot) snapshot.wordSearchPartnerId = value;
    }
  }

  function setPairRole(page, role) {
    if (!page) return;
    const snapshot = page.editSnapshot && typeof page.editSnapshot === "object" ? page.editSnapshot : null;
    if (pairKind(page) === "maze") {
      page.mazePairRole = role;
      if (snapshot) snapshot.mazePairRole = role;
    }
    if (pairKind(page) === "word-search") {
      page.wordSearchPairRole = role;
      if (snapshot) snapshot.wordSearchPairRole = role;
    }
    page.isSolution = role === "solution";
    page.bookSection = role === "solution" ? "solutions" : "activities";
  }

  function maxOrder(pages) {
    let max = -1;
    (pages || []).forEach(function (page) {
      const basketOrder = Number(page && page.basketOrder);
      const order = Number(page && page.order);
      const value = Number.isFinite(basketOrder) ? basketOrder : (Number.isFinite(order) ? order : -1);
      if (value > max) max = value;
    });
    return max;
  }

  function cloneValue(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return value;
  }

  function prepareImportedPages(existingPages, importedPages, options) {
    const opts = options || {};
    const createId = typeof opts.createId === "function" ? opts.createId : defaultCreateId;
    const mode = opts.mode === "append" ? "append" : "replace";
    const existing = Array.isArray(existingPages) ? existingPages : [];
    const imported = (Array.isArray(importedPages) ? importedPages : []).map(cloneValue);
    const usedIds = new Set();
    const existingPairIds = new Set();
    const idMap = new Map();
    const pairIdMap = new Map();

    existing.forEach(function (page) {
      if (page && page.id) usedIds.add(String(page.id));
      const id = getPairId(page);
      if (id) existingPairIds.add(pairKind(page) + ":" + id);
    });

    imported.forEach(function (page) {
      const oldId = String(page && page.id || "");
      let nextId = oldId;
      if (!nextId || usedIds.has(nextId)) {
        do { nextId = createId("basket"); } while (usedIds.has(nextId));
      }
      if (oldId) idMap.set(oldId, nextId);
      page.id = nextId;
      usedIds.add(nextId);
    });

    const importedPairKeys = new Set();
    imported.forEach(function (page) {
      const kind = pairKind(page);
      const oldPairId = getPairId(page);
      if (!kind || !oldPairId) return;
      const oldKey = kind + ":" + oldPairId;
      if (pairIdMap.has(oldKey)) return;
      let nextPairId = oldPairId;
      const collision = mode === "append" && existingPairIds.has(oldKey);
      if (collision || importedPairKeys.has(kind + ":" + nextPairId)) {
        do { nextPairId = createId(kind + "-pair"); }
        while (existingPairIds.has(kind + ":" + nextPairId) || importedPairKeys.has(kind + ":" + nextPairId));
      }
      pairIdMap.set(oldKey, nextPairId);
      importedPairKeys.add(kind + ":" + nextPairId);
    });

    imported.forEach(function (page) {
      const kind = pairKind(page);
      if (!kind) return;
      const oldPairId = getPairId(page);
      const mappedPairId = pairIdMap.get(kind + ":" + oldPairId);
      if (mappedPairId) setPairId(page, mappedPairId);
      const oldPartnerId = getPartnerId(page);
      if (oldPartnerId && idMap.has(oldPartnerId)) setPartnerId(page, idMap.get(oldPartnerId));
      setPairRole(page, getPairRole(page));
    });

    const groups = new Map();
    imported.forEach(function (page) {
      const kind = pairKind(page);
      const id = getPairId(page);
      if (!kind || !id) return;
      const key = kind + ":" + id;
      if (!groups.has(key)) groups.set(key, { puzzles: [], solutions: [] });
      groups.get(key)[getPairRole(page) === "solution" ? "solutions" : "puzzles"].push(page);
    });

    let repairedPairs = 0;
    let brokenPairs = 0;
    groups.forEach(function (group) {
      if (group.puzzles.length === 1 && group.solutions.length === 1) {
        const puzzle = group.puzzles[0];
        const solution = group.solutions[0];
        setPartnerId(puzzle, solution.id);
        setPartnerId(solution, puzzle.id);
        setPairRole(puzzle, "puzzle");
        setPairRole(solution, "solution");
        repairedPairs += 1;
      } else {
        brokenPairs += 1;
      }
    });

    const startOrder = mode === "append" ? maxOrder(existing) + 1 : 0;
    imported.forEach(function (page, index) {
      page.order = startOrder + index;
      page.basketOrder = startOrder + index;
    });

    return {
      pages: imported,
      report: {
        mode: mode,
        remappedIds: Array.from(idMap.entries()).filter(function (entry) { return entry[0] !== entry[1]; }).length,
        remappedPairIds: Array.from(pairIdMap.entries()).filter(function (entry) { return entry[0].split(":").slice(1).join(":") !== entry[1]; }).length,
        repairedPairs: repairedPairs,
        brokenPairs: brokenPairs
      }
    };
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Nie udało się otworzyć Koszyka Feniksa.")); };
    });
  }

  async function readPages() {
    const db = await openDb();
    try {
      return await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = function () { resolve(request.result || []); };
        request.onerror = function () { reject(request.error); };
      });
    } finally { db.close(); }
  }

  async function writePages(pages, clearFirst) {
    const db = await openDb();
    try {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        if (clearFirst) store.clear();
        (pages || []).forEach(function (page) { store.put(page); });
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error("Błąd zapisu Koszyka Feniksa.")); };
      });
    } finally { db.close(); }
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || "").split(",");
    if (parts.length < 2) throw new Error("Uszkodzone dane obrazu w pliku projektu.");
    const mimeMatch = parts[0].match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    const binary = root.atob(parts.slice(1).join(","));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function fromPortable(value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value) result.push(await fromPortable(item));
      return result;
    }
    if (typeof value === "object" && (value.$fenixType === "Blob" || value.$fenixType === "File")) {
      const blob = dataUrlToBlob(value.dataUrl);
      if (value.$fenixType === "File" && typeof File !== "undefined") {
        return new File([blob], value.name || "asset", {
          type: value.mimeType || blob.type,
          lastModified: value.lastModified || Date.now()
        });
      }
      return blob;
    }
    if (typeof value === "object") {
      const result = {};
      for (const key of Object.keys(value)) result[key] = await fromPortable(value[key]);
      return result;
    }
    return value;
  }

  function setStatus(message, error, success) {
    const node = root.document.getElementById("basketTransferStatus");
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("is-error", !!error);
    node.classList.toggle("is-success", !!success);
  }

  function install() {
    if (!root.document || !root.indexedDB) return;
    const boot = function () {
      const input = root.document.getElementById("importBasketFile");
      const oldButton = root.document.getElementById("importBasket");
      const modeControl = root.document.getElementById("importBasketMode");
      if (!input || !oldButton || !modeControl || oldButton.dataset.fenixIntegrityImport === "true") return;

      const button = oldButton.cloneNode(true);
      button.dataset.fenixIntegrityImport = "true";
      oldButton.replaceWith(button);
      let selectedFile = input.files && input.files[0] ? input.files[0] : null;
      button.disabled = !selectedFile;

      input.addEventListener("change", function () {
        selectedFile = input.files && input.files[0] ? input.files[0] : null;
        button.disabled = !selectedFile;
        if (selectedFile) setStatus("Wybrano plik: " + selectedFile.name + ".", false, false);
      });

      button.addEventListener("click", async function () {
        if (!selectedFile) return;
        button.disabled = true;
        try {
          setStatus("Odczytywanie i sprawdzanie pliku .fenixbasket...", false, false);
          const pack = JSON.parse(await selectedFile.text());
          if (!pack || pack.format !== FORMAT || !Array.isArray(pack.pages)) throw new Error("To nie jest prawidłowy plik .fenixbasket.");
          if (Number(pack.version) > FORMAT_VERSION) throw new Error("Plik pochodzi z nowszej, nieobsługiwanej wersji Feniksa.");

          const restored = [];
          for (let i = 0; i < pack.pages.length; i += 1) {
            setStatus("Przywracanie strony " + (i + 1) + " z " + pack.pages.length + "...", false, false);
            restored.push(await fromPortable(pack.pages[i]));
          }

          const mode = modeControl.value === "append" ? "append" : "replace";
          const existing = mode === "append" ? await readPages() : [];
          if (mode === "replace" && !root.confirm("Zastąpić obecny Koszyk zawartością pliku?")) return;
          const prepared = prepareImportedPages(existing, restored, { mode: mode });
          await writePages(prepared.pages, mode === "replace");

          const report = prepared.report;
          setStatus(
            "Zaimportowano " + prepared.pages.length + " stron. Spójne pary 1:1: " + report.repairedPairs +
            (report.remappedIds ? " · zmienione ID stron: " + report.remappedIds : "") +
            (report.remappedPairIds ? " · zmienione ID par: " + report.remappedPairIds : "") +
            (report.brokenPairs ? " · pary wymagające sprawdzenia: " + report.brokenPairs : "") + ".",
            report.brokenPairs > 0,
            report.brokenPairs === 0
          );
          root.setTimeout(function () { root.location.reload(); }, 700);
        } catch (error) {
          setStatus(error && error.message ? error.message : "Nie udało się zaimportować projektu.", true, false);
        } finally {
          button.disabled = !selectedFile;
        }
      });
    };

    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }

  return {
    pairKind: pairKind,
    getPairId: getPairId,
    getPairRole: getPairRole,
    getPartnerId: getPartnerId,
    prepareImportedPages: prepareImportedPages,
    install: install
  };
});
