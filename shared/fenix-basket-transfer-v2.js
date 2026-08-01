(function () {
  "use strict";

  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;
  const FORMAT = "fenix-basket";
  const FORMAT_VERSION = 2;
  const MAGIC = "FENIXBASKET2";
  const state = { importFile: null, busy: false };

  function el(id) { return document.getElementById(id); }

  function setTransferStatus(message, isError, isSuccess) {
    const node = el("basketTransferStatus");
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("is-error", !!isError);
    node.classList.toggle("is-success", !!isSuccess);
  }

  function safeName(value) {
    return String(value || "fenix-project")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9ąćęłńóśźż_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "fenix-project";
  }

  function createId() {
    return window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : "basket-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () {
        reject(request.error || new Error("Nie udało się otworzyć Koszyka Feniksa."));
      };
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
    } finally {
      db.close();
    }
  }

  async function writePages(pages, clearFirst) {
    const db = await openDb();
    try {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        if (clearFirst) store.clear();
        pages.forEach(function (page) { store.put(page); });
        tx.oncomplete = resolve;
        tx.onerror = function () {
          reject(tx.error || new Error("Błąd zapisu Koszyka Feniksa."));
        };
      });
    } finally {
      db.close();
    }
  }

  function sortPages(pages) {
    return pages.sort(function (a, b) {
      const ao = Number.isFinite(Number(a.basketOrder))
        ? Number(a.basketOrder)
        : (Number.isFinite(Number(a.order)) ? Number(a.order) : 999999);
      const bo = Number.isFinite(Number(b.basketOrder))
        ? Number(b.basketOrder)
        : (Number.isFinite(Number(b.order)) ? Number(b.order) : 999999);
      if (ao !== bo) return ao - bo;
      return String(a.createdAt || a.id || "").localeCompare(String(b.createdAt || b.id || ""));
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () {
        reject(reader.error || new Error("Błąd odczytu pliku podczas eksportu."));
      };
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || "").split(",");
    if (parts.length < 2) throw new Error("Uszkodzone dane obrazu w pliku projektu.");
    const mimeMatch = parts[0].match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    const binary = atob(parts.slice(1).join(","));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function createStringTable() {
    const values = [];
    const indexes = new Map();
    return {
      values: values,
      intern: function (value) {
        const text = String(value || "");
        if (indexes.has(text)) return indexes.get(text);
        const index = values.length;
        values.push(text);
        indexes.set(text, index);
        return index;
      }
    };
  }

  async function toPortable(value, table) {
    if (value === null || value === undefined) return value;

    if (typeof Blob !== "undefined" && value instanceof Blob) {
      const dataUrl = await blobToDataUrl(value);
      return {
        $fenixType: value instanceof File ? "File" : "Blob",
        name: value.name || "",
        lastModified: value.lastModified || 0,
        mimeType: value.type || "application/octet-stream",
        dataUrlRef: table.intern(dataUrl)
      };
    }

    if (typeof value === "string" && value.indexOf("data:") === 0) {
      return { $fenixType: "DataUrlRef", index: table.intern(value) };
    }

    if (Array.isArray(value)) {
      const out = [];
      for (const item of value) out.push(await toPortable(item, table));
      return out;
    }

    if (typeof value === "object") {
      const out = {};
      for (const key of Object.keys(value)) out[key] = await toPortable(value[key], table);
      return out;
    }

    return value;
  }

  async function fromPortable(value, stringTable) {
    if (value === null || value === undefined) return value;

    if (Array.isArray(value)) {
      const out = [];
      for (const item of value) out.push(await fromPortable(item, stringTable));
      return out;
    }

    if (typeof value === "object" && value.$fenixType === "DataUrlRef") {
      const index = Number(value.index);
      if (!Number.isInteger(index) || index < 0 || index >= stringTable.length) {
        throw new Error("Uszkodzone odwołanie do obrazu w pliku projektu.");
      }
      return stringTable[index];
    }

    if (typeof value === "object" && (value.$fenixType === "Blob" || value.$fenixType === "File")) {
      let dataUrl = value.dataUrl;
      if (value.dataUrlRef !== undefined) {
        const index = Number(value.dataUrlRef);
        if (!Number.isInteger(index) || index < 0 || index >= stringTable.length) {
          throw new Error("Uszkodzone odwołanie do pliku PNG w projekcie.");
        }
        dataUrl = stringTable[index];
      }
      const blob = dataUrlToBlob(dataUrl);
      if (value.$fenixType === "File" && typeof File !== "undefined") {
        return new File([blob], value.name || "asset", {
          type: value.mimeType || blob.type,
          lastModified: value.lastModified || Date.now()
        });
      }
      return blob;
    }

    if (typeof value === "object") {
      const out = {};
      for (const key of Object.keys(value)) out[key] = await fromPortable(value[key], stringTable);
      return out;
    }

    return value;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  function createV2File(header, pages, strings) {
    const parts = [
      MAGIC + "\n",
      JSON.stringify(header) + "\n",
      JSON.stringify(pages) + "\n"
    ];
    strings.forEach(function (value) {
      parts.push(value, "\n");
    });
    return new Blob(parts, { type: "application/octet-stream" });
  }

  async function exportBasketV2() {
    if (state.busy) return;
    state.busy = true;
    const button = el("exportBasket");
    if (button) button.disabled = true;

    try {
      const pages = sortPages(await readPages());
      if (!pages.length) throw new Error("Koszyk jest pusty.");

      const table = createStringTable();
      const portablePages = [];
      for (let i = 0; i < pages.length; i += 1) {
        setTransferStatus("Pakowanie strony " + (i + 1) + " z " + pages.length + "...", false, false);
        portablePages.push(await toPortable(pages[i], table));
        await new Promise(function (resolve) { window.setTimeout(resolve, 0); });
      }

      const projectName = safeName(el("basketProjectName") && el("basketProjectName").value);
      const header = {
        format: FORMAT,
        version: FORMAT_VERSION,
        encoding: "fenix-lines-v2",
        projectName: projectName,
        exportedAt: new Date().toISOString(),
        pageCount: portablePages.length,
        stringCount: table.values.length
      };
      const fileBlob = createV2File(header, portablePages, table.values);
      downloadBlob(fileBlob, projectName + ".fenixbasket");
      setTransferStatus(
        "Wyeksportowano " + pages.length + " stron. Nowy format usuwa powtórzone dane obrazów i obsługuje duże projekty.",
        false,
        true
      );
    } catch (error) {
      console.error(error);
      setTransferStatus(error && error.message ? error.message : "Nie udało się wyeksportować koszyka.", true, false);
    } finally {
      if (button) button.disabled = false;
      state.busy = false;
    }
  }

  async function readLines(file, onLine) {
    if (file.stream && typeof TextDecoderStream !== "undefined") {
      const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        buffer += result.value;
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline).replace(/\r$/, "");
          buffer = buffer.slice(newline + 1);
          await onLine(line);
          newline = buffer.indexOf("\n");
        }
      }
      if (buffer.length) await onLine(buffer.replace(/\r$/, ""));
      return;
    }

    const lines = (await file.text()).split(/\r?\n/);
    for (const line of lines) await onLine(line);
  }

  async function parseV2(file) {
    let lineNumber = 0;
    let header = null;
    let pages = null;
    const strings = [];

    await readLines(file, async function (line) {
      if (lineNumber === 0) {
        if (line !== MAGIC) throw new Error("To nie jest prawidłowy plik .fenixbasket w formacie v2.");
      } else if (lineNumber === 1) {
        header = JSON.parse(line);
      } else if (lineNumber === 2) {
        pages = JSON.parse(line);
      } else if (!header || strings.length < Number(header.stringCount || 0)) {
        strings.push(line);
      }
      lineNumber += 1;
    });

    if (!header || header.format !== FORMAT || Number(header.version) !== FORMAT_VERSION) {
      throw new Error("Nieprawidłowy nagłówek pliku .fenixbasket.");
    }
    if (!Array.isArray(pages)) throw new Error("Plik projektu nie zawiera listy stron.");
    if (strings.length !== Number(header.stringCount || 0)) {
      throw new Error("Plik projektu jest niekompletny — brakuje danych obrazów.");
    }

    return { header: header, pages: pages, strings: strings };
  }

  async function isV2File(file) {
    return (await file.slice(0, MAGIC.length + 1).text()).indexOf(MAGIC) === 0;
  }

  function remapAppendedPages(restored, existing) {
    const usedIds = new Set(existing.map(function (page) { return page.id; }));
    const idMap = new Map();

    restored.forEach(function (page) {
      const oldId = page.id;
      const newId = !oldId || usedIds.has(oldId) ? createId() : oldId;
      if (oldId) idMap.set(oldId, newId);
      page.id = newId;
      usedIds.add(newId);
    });

    restored.forEach(function (page) {
      ["mazePartnerId", "wordSearchPartnerId"].forEach(function (key) {
        if (page[key] && idMap.has(page[key])) page[key] = idMap.get(page[key]);
      });
      if (page.editSnapshot && typeof page.editSnapshot === "object") {
        ["mazePartnerId", "wordSearchPartnerId"].forEach(function (key) {
          if (page.editSnapshot[key] && idMap.has(page.editSnapshot[key])) {
            page.editSnapshot[key] = idMap.get(page.editSnapshot[key]);
          }
        });
      }
    });
  }

  async function restoreProject(pack, portablePages, strings) {
    const restored = [];
    for (let i = 0; i < portablePages.length; i += 1) {
      setTransferStatus("Przywracanie strony " + (i + 1) + " z " + portablePages.length + "...", false, false);
      restored.push(await fromPortable(portablePages[i], strings));
      await new Promise(function (resolve) { window.setTimeout(resolve, 0); });
    }

    const mode = el("importBasketMode") ? el("importBasketMode").value : "replace";
    if (mode === "replace") {
      if (!window.confirm("Zastąpić obecny Koszyk zawartością pliku?")) return false;
      restored.forEach(function (page, index) {
        page.order = index;
        page.basketOrder = index;
      });
      await writePages(restored, true);
    } else {
      const existing = sortPages(await readPages());
      remapAppendedPages(restored, existing);
      restored.forEach(function (page, index) {
        page.order = existing.length + index;
        page.basketOrder = existing.length + index;
      });
      await writePages(restored, false);
    }

    if (pack.projectName && el("basketProjectName")) el("basketProjectName").value = pack.projectName;
    const refresh = el("refreshBasket");
    if (refresh) refresh.click();
    setTransferStatus("Zaimportowano " + restored.length + " stron. Projekt jest gotowy do dalszej pracy.", false, true);
    return true;
  }

  async function importBasketAny() {
    if (state.busy || !state.importFile) return;
    state.busy = true;
    const button = el("importBasket");
    if (button) button.disabled = true;

    try {
      setTransferStatus("Odczytywanie pliku projektu...", false, false);
      if (await isV2File(state.importFile)) {
        const parsed = await parseV2(state.importFile);
        await restoreProject(parsed.header, parsed.pages, parsed.strings);
      } else {
        const pack = JSON.parse(await state.importFile.text());
        if (!pack || pack.format !== FORMAT || !Array.isArray(pack.pages)) {
          throw new Error("To nie jest prawidłowy plik .fenixbasket.");
        }
        if (Number(pack.version) > 1) {
          throw new Error("Plik pochodzi z nowszej, nieobsługiwanej wersji Feniksa.");
        }
        await restoreProject(pack, pack.pages, []);
      }
    } catch (error) {
      console.error(error);
      setTransferStatus(error && error.message ? error.message : "Nie udało się zaimportować projektu.", true, false);
    } finally {
      if (button) button.disabled = !state.importFile;
      state.busy = false;
    }
  }

  document.addEventListener("change", function (event) {
    const input = event.target && event.target.closest ? event.target.closest("#importBasketFile") : null;
    if (!input) return;
    state.importFile = input.files && input.files[0] ? input.files[0] : null;
  }, true);

  document.addEventListener("click", function (event) {
    const target = event.target && event.target.closest ? event.target.closest("#exportBasket, #importBasket") : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (target.id === "exportBasket") exportBasketV2();
    else importBasketAny();
  }, true);
})();
