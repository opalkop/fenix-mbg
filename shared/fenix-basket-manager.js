(function () {
  "use strict";

  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;
  const EDIT_MODULES = {
    "maze-studio": "modules/maze-studio/maze-studio.html",
    "complete-picture": "modules/complete-picture/complete-picture.html",
    "coloring-studio": "modules/coloring-studio/coloring-studio.html",
    "word-search-studio": "modules/word-search-studio/word-search-studio.html"
  };
  const state = {
    pages: [],
    previewUrl: "",
    renderToken: 0
  };

  function el(id) { return document.getElementById(id); }

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

  function pairValue(page, directKey, snapshotKey) {
    if (page && page[directKey] !== undefined && page[directKey] !== null && page[directKey] !== "") return page[directKey];
    const snapshot = page && page.editSnapshot;
    return snapshot && snapshot[snapshotKey || directKey] !== undefined ? snapshot[snapshotKey || directKey] : "";
  }

  function metadataFromPage(page) {
    return {
      id: page.id,
      sourceModule: page.sourceModule || "other",
      pageType: page.pageType || "",
      fileName: page.fileName || "",
      title: page.title || page.name || "",
      width: page.width || 0,
      height: page.height || 0,
      mimeType: page.mimeType || "",
      createdAt: page.createdAt || "",
      updatedAt: page.updatedAt || "",
      order: page.order,
      basketOrder: page.basketOrder,
      includeInBook: page.includeInBook !== false,
      bookSection: page.bookSection || "",
      isSolution: page.isSolution === true,
      mazePairId: pairValue(page, "mazePairId"),
      mazePairRole: pairValue(page, "mazePairRole"),
      mazePartnerId: pairValue(page, "mazePartnerId"),
      wordSearchPairId: pairValue(page, "wordSearchPairId"),
      wordSearchPairRole: pairValue(page, "wordSearchPairRole"),
      wordSearchPartnerId: pairValue(page, "wordSearchPartnerId"),
      hasEditSnapshot: !!(page.editSnapshot && typeof page.editSnapshot === "object")
    };
  }

  async function readPageMetadata() {
    const db = await openDb();
    try {
      return await new Promise(function (resolve, reject) {
        const result = [];
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).openCursor();
        request.onsuccess = function () {
          const cursor = request.result;
          if (!cursor) return;
          result.push(metadataFromPage(cursor.value || {}));
          cursor.continue();
        };
        request.onerror = function () { reject(request.error || new Error("Nie udało się odczytać Koszyka Feniksa.")); };
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error || new Error("Błąd transakcji Koszyka Feniksa.")); };
      });
    } finally {
      db.close();
    }
  }

  async function getPage(id) {
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

  async function putPages(pages) {
    const db = await openDb();
    try {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        (pages || []).forEach(function (page) { if (page) store.put(page); });
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error("Błąd zapisu Koszyka Feniksa.")); };
      });
    } finally {
      db.close();
    }
  }

  async function deletePages(ids) {
    const unique = Array.from(new Set((ids || []).filter(Boolean)));
    const db = await openDb();
    try {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        unique.forEach(function (id) { store.delete(id); });
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error("Nie udało się usunąć strony z Koszyka.")); };
      });
    } finally {
      db.close();
    }
  }

  async function clearPages() {
    const db = await openDb();
    try {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error("Nie udało się wyczyścić Koszyka.")); };
      });
    } finally {
      db.close();
    }
  }

  function sourceLabel(page) {
    const source = page.sourceModule || "other";
    return window.FenixBasketStatus ? window.FenixBasketStatus.getSourceLabel(source) : source;
  }

  function pageTitle(page, index) {
    return page.title || page.fileName || (sourceLabel(page) + " — strona " + (index + 1));
  }

  function orderValue(page, fallback) {
    const basketOrder = Number(page && page.basketOrder);
    if (Number.isFinite(basketOrder)) return basketOrder;
    const order = Number(page && page.order);
    if (Number.isFinite(order)) return order;
    return Number(fallback) || 999999;
  }

  function sortPages(pages) {
    return pages.sort(function (a, b) {
      const diff = orderValue(a) - orderValue(b);
      if (diff) return diff;
      return String(a.createdAt || a.id || "").localeCompare(String(b.createdAt || b.id || ""));
    });
  }

  function pairId(page) { return page.mazePairId || page.wordSearchPairId || ""; }
  function pairRole(page) { return page.mazePairRole || page.wordSearchPairRole || (page.isSolution ? "solution" : "puzzle"); }
  function pairPartnerId(page) { return page.mazePartnerId || page.wordSearchPartnerId || ""; }
  function isPaired(page) { return !!pairId(page); }

  function setTransferStatus(message, isError, isSuccess) {
    const node = el("basketTransferStatus");
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("is-error", !!isError);
    node.classList.toggle("is-success", !!isSuccess);
  }

  function renderSourceSummary(pages) {
    const root = el("basketSources");
    if (!root) return;
    root.textContent = "";
    const counts = {};
    pages.forEach(function (page) {
      const label = sourceLabel(page);
      counts[label] = (counts[label] || 0) + 1;
    });
    Object.keys(counts).sort().forEach(function (label) {
      const item = document.createElement("span");
      item.textContent = label + ": " + counts[label];
      root.appendChild(item);
    });
  }

  function button(text, className, handler) {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = text;
    if (className) node.className = className;
    node.addEventListener("click", handler);
    return node;
  }

  function createId() {
    return window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : "basket-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function revokePreviewUrl() {
    if (!state.previewUrl) return;
    try { URL.revokeObjectURL(state.previewUrl); } catch (error) {}
    state.previewUrl = "";
  }

  function previewSource(page) {
    const strings = [page.thumbnail, page.preview, page.previewUrl, page.dataUrl, page.pngDataUrl, page.imageData, page.image];
    const dataUrl = strings.find(function (value) { return typeof value === "string" && value.indexOf("data:image") === 0; });
    if (dataUrl) return dataUrl;
    const blobs = [page.blob, page.pngBlob, page.imageBlob, page.file];
    const blob = blobs.find(function (value) { return typeof Blob !== "undefined" && value instanceof Blob; });
    if (!blob) return "";
    state.previewUrl = URL.createObjectURL(blob);
    return state.previewUrl;
  }

  function closePreview() {
    const image = el("basketPreviewImage");
    if (image) image.removeAttribute("src");
    const modal = el("basketPreviewModal");
    if (modal) modal.hidden = true;
    document.body.style.overflow = "";
    revokePreviewUrl();
  }

  async function openPreview(page, index) {
    const modal = el("basketPreviewModal");
    const image = el("basketPreviewImage");
    if (!modal || !image) return;

    closePreview();
    el("basketPreviewTitle").textContent = pageTitle(page, index);
    el("basketPreviewMeta").textContent = "Pozycja " + (index + 1) + " · wczytywanie jednej strony…";
    image.alt = "Wczytywanie podglądu strony";
    modal.hidden = false;
    document.body.style.overflow = "hidden";

    try {
      const fullPage = await getPage(page.id);
      const src = fullPage ? previewSource(fullPage) : "";
      if (!src) throw new Error("Ta pozycja nie zawiera obrazu możliwego do wyświetlenia.");
      image.alt = "Pełny podgląd strony z Koszyka Feniksa";
      image.src = src;
      el("basketPreviewMeta").textContent = "Pozycja " + (index + 1) + " · " + sourceLabel(page) + " · " + (page.width || "?") + "×" + (page.height || "?");
    } catch (error) {
      closePreview();
      setTransferStatus(error && error.message ? error.message : "Nie udało się wczytać podglądu.", true, false);
    }
  }

  async function removePageOrPair(page) {
    const partnerId = pairPartnerId(page);
    const paired = isPaired(page) && partnerId;
    const message = paired ? "Usunąć całą parę 1:1: zadanie i rozwiązanie?" : "Usunąć tę stronę z Koszyka Feniksa?";
    if (!window.confirm(message)) return;
    await deletePages(paired ? [page.id, partnerId] : [page.id]);
    await render();
  }

  async function movePage(id, delta) {
    const pages = state.pages.slice();
    const index = pages.findIndex(function (page) { return page.id === id; });
    const target = index + delta;
    if (index < 0 || target < 0 || target >= pages.length) return;

    const first = await getPage(pages[index].id);
    const second = await getPage(pages[target].id);
    if (!first || !second) return;

    const firstOrder = orderValue(first, index);
    const secondOrder = orderValue(second, target);
    first.order = secondOrder;
    first.basketOrder = secondOrder;
    second.order = firstOrder;
    second.basketOrder = firstOrder;
    await putPages([first, second]);
    await render();
  }

  async function duplicatePage(page) {
    const original = await getPage(page.id);
    if (!original) return;
    const copy = typeof structuredClone === "function" ? structuredClone(original) : Object.assign({}, original);
    const now = new Date().toISOString();
    copy.id = createId();
    copy.createdAt = now;
    copy.updatedAt = now;
    copy.title = (original.title || original.fileName || "Strona") + " — kopia";
    copy.order = state.pages.length;
    copy.basketOrder = state.pages.length;
    delete copy.mazePairId;
    delete copy.mazePairRole;
    delete copy.mazePartnerId;
    delete copy.wordSearchPairId;
    delete copy.wordSearchPairRole;
    delete copy.wordSearchPartnerId;
    await putPages([copy]);
    await render();
  }

  function renderCard(page, index) {
    const card = document.createElement("article");
    card.className = "basket-card basket-card-light";

    const preview = document.createElement("div");
    preview.className = "basket-card-preview basket-card-preview-light";
    preview.tabIndex = 0;
    preview.setAttribute("role", "button");
    preview.setAttribute("aria-label", "Wczytaj podgląd strony " + (index + 1));
    const label = document.createElement("span");
    label.textContent = "PODGLĄD NA ŻĄDANIE";
    const number = document.createElement("strong");
    number.textContent = index + 1;
    const hint = document.createElement("small");
    hint.textContent = "Kliknij, aby wczytać jedną stronę";
    preview.append(label, number, hint);
    preview.addEventListener("click", function () { openPreview(page, index); });
    preview.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPreview(page, index);
      }
    });

    const body = document.createElement("div");
    body.className = "basket-card-body";
    const position = document.createElement("span");
    position.className = "basket-card-number";
    position.textContent = "Pozycja " + (index + 1);
    const title = document.createElement("h3");
    title.textContent = pageTitle(page, index);
    const source = document.createElement("p");
    source.textContent = sourceLabel(page) + (isPaired(page) ? " · PARA 1:1 · " + (pairRole(page) === "solution" ? "ROZWIĄZANIE" : "ZADANIE") : "");

    const actions = document.createElement("div");
    actions.className = "basket-card-actions";
    actions.appendChild(button("Podgląd", "is-primary", function () { openPreview(page, index); }));

    const editUrl = EDIT_MODULES[page.sourceModule];
    if (editUrl && page.hasEditSnapshot) {
      const edit = document.createElement("a");
      const targetId = pairRole(page) === "solution" && pairPartnerId(page) ? pairPartnerId(page) : page.id;
      edit.href = editUrl + "?editBasketPage=" + encodeURIComponent(targetId);
      edit.textContent = isPaired(page) ? "Edytuj parę w module" : "Edytuj w module";
      edit.className = "is-primary";
      actions.appendChild(edit);
    }

    actions.appendChild(button("↑ Wyżej", "", function () { movePage(page.id, -1); }));
    actions.appendChild(button("↓ Niżej", "", function () { movePage(page.id, 1); }));
    if (!isPaired(page)) actions.appendChild(button("Duplikuj", "", function () { duplicatePage(page); }));
    actions.appendChild(button(isPaired(page) ? "Usuń parę" : "Usuń", "is-danger", function () { removePageOrPair(page); }));

    body.append(position, title, source, actions);
    card.append(preview, body);
    return card;
  }

  async function render() {
    const token = ++state.renderToken;
    closePreview();
    const grid = el("basketGrid");
    const empty = el("basketEmpty");
    const total = el("basketTotal");
    if (!grid || !empty || !total) return;

    grid.textContent = "";
    total.textContent = "…";
    try {
      const pages = sortPages(await readPageMetadata());
      if (token !== state.renderToken) return;
      state.pages = pages;
      total.textContent = pages.length;
      renderSourceSummary(pages);
      empty.hidden = pages.length > 0;
      grid.hidden = pages.length === 0;

      const fragment = document.createDocumentFragment();
      pages.forEach(function (page, index) { fragment.appendChild(renderCard(page, index)); });
      grid.appendChild(fragment);
      setTransferStatus("Tryb lekki: lista nie wczytuje wszystkich PNG. Podgląd otwiera tylko jedną wybraną stronę.", false, true);
      if (window.FenixBasketStatus && window.FenixBasketStatus.refresh) window.FenixBasketStatus.refresh();
    } catch (error) {
      total.textContent = "—";
      empty.hidden = false;
      empty.querySelector("h2").textContent = "Nie udało się odczytać koszyka";
      empty.querySelector("p").textContent = error && error.message ? error.message : "Nieznany błąd.";
      setTransferStatus(error && error.message ? error.message : "Nie udało się wyrenderować Koszyka.", true, false);
    }
  }

  function install() {
    const refresh = el("refreshBasket");
    if (refresh) refresh.addEventListener("click", render);
    const clear = el("clearBasket");
    if (clear) clear.addEventListener("click", async function () {
      if (!window.confirm("Usunąć wszystkie strony z Koszyka Feniksa? Tej operacji nie można cofnąć.")) return;
      await clearPages();
      await render();
    });
    const close = el("basketPreviewClose");
    if (close) close.addEventListener("click", closePreview);
    document.querySelectorAll("[data-preview-close]").forEach(function (node) { node.addEventListener("click", closePreview); });
    document.addEventListener("keydown", function (event) {
      const modal = el("basketPreviewModal");
      if (event.key === "Escape" && modal && !modal.hidden) closePreview();
    });
    window.addEventListener("beforeunload", revokePreviewUrl);
    render();
  }

  window.FenixBasketManager = { render: render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
