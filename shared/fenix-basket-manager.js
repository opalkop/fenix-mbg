(function () {
  "use strict";

  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;

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
      request.onerror = function () { reject(request.error || new Error("Nie udało się otworzyć Koszyka Feniksa.")); };
    });
  }

  async function readPages() {
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

  async function deletePage(id) {
    const db = await openDb();
    try {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error); };
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
        tx.onerror = function () { reject(tx.error); };
      });
    } finally {
      db.close();
    }
  }

  function sourceLabel(page) {
    const source = page.sourceModule || "other";
    return window.FenixBasketStatus ? window.FenixBasketStatus.getSourceLabel(source) : source;
  }

  function previewSource(page) {
    const candidates = [page.thumbnail, page.preview, page.previewUrl, page.dataUrl, page.pngDataUrl, page.imageData, page.image];
    return candidates.find(function (value) { return typeof value === "string" && value.indexOf("data:image") === 0; }) || "";
  }

  function pageTitle(page, index) {
    return page.title || page.name || page.fileName || (sourceLabel(page) + " — strona " + (index + 1));
  }

  function renderSourceSummary(pages) {
    const root = document.getElementById("basketSources");
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

  function renderCard(page, index) {
    const card = document.createElement("article");
    card.className = "basket-card";

    const preview = document.createElement("div");
    preview.className = "basket-card-preview";
    const src = previewSource(page);
    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "Podgląd strony " + (index + 1);
      preview.appendChild(img);
    } else {
      preview.innerHTML = "<span>STRONA</span><strong>" + (index + 1) + "</strong>";
    }

    const body = document.createElement("div");
    body.className = "basket-card-body";
    const number = document.createElement("span");
    number.className = "basket-card-number";
    number.textContent = "Pozycja " + (index + 1);
    const title = document.createElement("h3");
    title.textContent = pageTitle(page, index);
    const source = document.createElement("p");
    source.textContent = sourceLabel(page);

    const actions = document.createElement("div");
    actions.className = "basket-card-actions";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Usuń z koszyka";
    remove.addEventListener("click", async function () {
      if (!window.confirm("Usunąć tę stronę z Koszyka Feniksa?")) return;
      await deletePage(page.id);
      await render();
    });
    actions.appendChild(remove);

    body.append(number, title, source, actions);
    card.append(preview, body);
    return card;
  }

  async function render() {
    const grid = document.getElementById("basketGrid");
    const empty = document.getElementById("basketEmpty");
    const total = document.getElementById("basketTotal");
    grid.textContent = "";

    try {
      const pages = await readPages();
      pages.sort(function (a, b) {
        const ao = Number.isFinite(a.basketOrder) ? a.basketOrder : 999999;
        const bo = Number.isFinite(b.basketOrder) ? b.basketOrder : 999999;
        if (ao !== bo) return ao - bo;
        return String(a.createdAt || a.id || "").localeCompare(String(b.createdAt || b.id || ""));
      });
      total.textContent = pages.length;
      renderSourceSummary(pages);
      empty.hidden = pages.length > 0;
      grid.hidden = pages.length === 0;
      pages.forEach(function (page, index) { grid.appendChild(renderCard(page, index)); });
    } catch (error) {
      total.textContent = "—";
      empty.hidden = false;
      empty.querySelector("h2").textContent = "Nie udało się odczytać koszyka";
      empty.querySelector("p").textContent = error && error.message ? error.message : "Nieznany błąd.";
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("refreshBasket").addEventListener("click", render);
    document.getElementById("clearBasket").addEventListener("click", async function () {
      if (!window.confirm("Usunąć wszystkie strony z Koszyka Feniksa? Tej operacji nie można cofnąć.")) return;
      await clearPages();
      await render();
    });
    render();
  });
})();