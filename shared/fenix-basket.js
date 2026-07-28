(function () {
  "use strict";

  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB nie jest dostępny w tej przeglądarce."));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("Błąd otwarcia Koszyka Feniksa."));
      };
    });
  }

  async function withStore(mode, callback) {
    const db = await openDb();
    return new Promise(function (resolve, reject) {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let callbackResult;

      transaction.oncomplete = function () {
        db.close();
        resolve(callbackResult);
      };
      transaction.onerror = function () {
        db.close();
        reject(transaction.error || new Error("Błąd operacji Koszyka Feniksa."));
      };
      transaction.onabort = function () {
        db.close();
        reject(transaction.error || new Error("Operacja Koszyka Feniksa została przerwana."));
      };

      try {
        callbackResult = callback(store, transaction);
      } catch (error) {
        try {
          transaction.abort();
        } catch (_) {
          db.close();
        }
        reject(error);
      }
    });
  }

  function sortPages(pages) {
    return (pages || []).slice().sort(function (a, b) {
      const orderA = Number.isFinite(Number(a && a.order)) ? Number(a.order) : Number.POSITIVE_INFINITY;
      const orderB = Number.isFinite(Number(b && b.order)) ? Number(b.order) : Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;

      const dateA = Date.parse((a && a.createdAt) || "") || 0;
      const dateB = Date.parse((b && b.createdAt) || "") || 0;
      if (dateA !== dateB) return dateA - dateB;

      return String((a && (a.title || a.fileName || a.id)) || "")
        .localeCompare(String((b && (b.title || b.fileName || b.id)) || ""));
    });
  }

  function toStorablePage(page) {
    const copy = Object.assign({}, page);
    delete copy.previewImage;
    delete copy.previewUrl;
    delete copy.dataUrl;
    return copy;
  }

  function getAllPages() {
    return new Promise(function (resolve, reject) {
      openDb().then(function (db) {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).getAll();

        request.onsuccess = function () {
          db.close();
          resolve(sortPages(request.result || []));
        };
        request.onerror = function () {
          db.close();
          reject(request.error || new Error("Błąd odczytu Koszyka Feniksa."));
        };
      }).catch(reject);
    });
  }

  function getPage(id) {
    return new Promise(function (resolve, reject) {
      openDb().then(function (db) {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(id);

        request.onsuccess = function () {
          db.close();
          resolve(request.result || null);
        };
        request.onerror = function () {
          db.close();
          reject(request.error || new Error("Błąd odczytu strony z Koszyka Feniksa."));
        };
      }).catch(reject);
    });
  }

  function putPage(page) {
    if (!page || !page.id) {
      return Promise.reject(new Error("Strona Koszyka Feniksa musi mieć identyfikator id."));
    }
    return withStore("readwrite", function (store) {
      store.put(toStorablePage(page));
    });
  }

  function deletePage(id) {
    return withStore("readwrite", function (store) {
      store.delete(id);
    });
  }

  function clearPages() {
    return withStore("readwrite", function (store) {
      store.clear();
    });
  }

  function countPages() {
    return new Promise(function (resolve, reject) {
      openDb().then(function (db) {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).count();

        request.onsuccess = function () {
          db.close();
          resolve(request.result || 0);
        };
        request.onerror = function () {
          db.close();
          reject(request.error || new Error("Błąd zliczania stron Koszyka Feniksa."));
        };
      }).catch(reject);
    });
  }

  window.FenixBasket = Object.freeze({
    DB_NAME: DB_NAME,
    STORE_NAME: STORE_NAME,
    DB_VERSION: DB_VERSION,
    openDb: openDb,
    withStore: withStore,
    getAllPages: getAllPages,
    getPage: getPage,
    putPage: putPage,
    deletePage: deletePage,
    clearPages: clearPages,
    countPages: countPages,
    sortPages: sortPages,
    toStorablePage: toStorablePage
  });
})();
