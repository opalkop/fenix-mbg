(function (global) {
  "use strict";

  var namespace = global.FenixAPlus || {};
  var MAX_SIZE_BYTES = 3 * 1024 * 1024;
  var CLOSE_TO_LIMIT_BYTES = Math.floor(MAX_SIZE_BYTES * 0.9);
  var MAX_SAMPLE_IMAGES = 6;
  var ACCEPTED_MIME = {
    "image/png": true,
    "image/jpeg": true
  };
  var ROLE_LABELS = {
    cover: "Okładka",
    sample: "Przykładowa strona",
    promo: "Grafika promocyjna"
  };
  var INTENDED_USE_LABELS = {
    unspecified: "Nie określono",
    full_book_page: "Pełna strona książki",
    three_images_tile: "Kafelek modułu „Trzy obrazy i tekst”",
    banner_source: "Źródło do banera",
    comparison_cover: "Okładka do tabeli porównawczej"
  };
  var VALID_INTENDED_USES = Object.keys(INTENDED_USE_LABELS);
  var ROLE_DEFAULT_INTENDED_USE = {
    cover: "comparison_cover",
    sample: "unspecified",
    promo: "banner_source"
  };
  var records = [];

  function nowIso() {
    return new Date().toISOString();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createId(role) {
    return role + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function extensionAllowed(fileName) {
    return /\.(png|jpe?g)$/i.test(String(fileName || ""));
  }

  function formatRatio(width, height) {
    if (!width || !height) {
      return 0;
    }
    return Number((width / height).toFixed(3));
  }

  function normalizeIntendedUse(value, role) {
    var raw = String(value || "");
    if (VALID_INTENDED_USES.indexOf(raw) !== -1) {
      return raw;
    }
    return ROLE_DEFAULT_INTENDED_USE[role] || "unspecified";
  }

  function effectiveIntendedUse(meta) {
    return meta.intendedUse === "unspecified" && meta.role === "sample" ? "full_book_page" : meta.intendedUse;
  }

  function dimensionsText(meta) {
    return meta.width + " × " + meta.height + " px";
  }

  function isNearSquare(meta) {
    var ratio = meta.width / meta.height;
    return ratio >= 0.9 && ratio <= 1.1;
  }

  function validateMetadata(meta) {
    var messages = [];
    var status = "pass";
    var intendedUse = normalizeIntendedUse(meta.intendedUse, meta.role);
    var context = effectiveIntendedUse(Object.assign({}, meta, { intendedUse: intendedUse }));

    function error(code, message) {
      status = "error";
      messages.push({ status: "ERROR", code: code, message: message });
    }

    function warning(code, message) {
      if (status !== "error") {
        status = "warning";
      }
      messages.push({ status: "WARNING", code: code, message: message });
    }

    function pass(code, message) {
      messages.push({ status: "PASS", code: code, message: message });
    }

    meta.intendedUse = intendedUse;

    if (!ACCEPTED_MIME[meta.mimeType] || !extensionAllowed(meta.filename)) {
      error("UNSUPPORTED_IMAGE_TYPE", "Nieobsługiwany format pliku. Dozwolone są tylko PNG, JPG i JPEG.");
    }
    if (!meta.width || !meta.height) {
      error("ZERO_IMAGE_DIMENSIONS", "Obraz ma zerową szerokość lub wysokość.");
    }
    if (meta.sizeBytes > MAX_SIZE_BYTES) {
      error("IMAGE_TOO_LARGE", "Plik przekracza limit 3 MB.");
    } else if (meta.sizeBytes >= CLOSE_TO_LIMIT_BYTES) {
      warning("IMAGE_CLOSE_TO_LIMIT", "Plik jest blisko limitu 3 MB.");
    }

    if (meta.width && meta.height) {
      if (context === "three_images_tile") {
        if (meta.width < 300 || meta.height < 300) {
          warning("THREE_TILE_TOO_SMALL", "Obraz jest mniejszy niż 300 × 300 px dla kafelka modułu „Trzy obrazy i tekst”.");
        }
        if (!isNearSquare(meta)) {
          warning("THREE_TILE_NOT_SQUARE", "Kafelek modułu „Trzy obrazy i tekst” powinien być kwadratowy lub prawie kwadratowy.");
        }
      } else if (context === "banner_source") {
        if (meta.width < 970 || meta.height < 300) {
          warning("BANNER_SOURCE_SMALL", "Obraz jest mniejszy niż zalecane 970 × 300 px dla źródła banera.");
        }
        if (meta.width / meta.height > 8 || meta.width / meta.height < 0.33) {
          warning("BANNER_SOURCE_UNUSUAL_RATIO", "Obraz ma nietypowe proporcje dla źródła banera.");
        }
      } else if (context === "comparison_cover") {
        if (meta.width < 900 || meta.height < 1200) {
          warning("COMPARISON_COVER_SMALL", "Okładka do tabeli porównawczej jest mniejsza niż zalecane minimum.");
        }
        if (meta.width >= meta.height) {
          warning("COMPARISON_COVER_NOT_PORTRAIT", "Okładka do tabeli porównawczej powinna mieć orientację pionową.");
        }
        if (meta.width / meta.height < 0.55 || meta.width / meta.height > 0.82) {
          warning("COMPARISON_COVER_RATIO", "Okładka do tabeli porównawczej powinna mieć proporcje zbliżone do okładki książki.");
        }
      } else {
        if (meta.width < 1200 || meta.height < 1600) {
          warning("FULL_PAGE_BELOW_RECOMMENDED_DIMENSIONS", "Pełna strona książki jest mniejsza niż zalecane około 1200 × 1600 px.");
        }
        if (meta.width >= meta.height) {
          warning("FULL_PAGE_NOT_PORTRAIT", "Pełna strona książki powinna mieć orientację pionową.");
        }
      }
    }
    if (messages.length === 0) {
      if (context === "three_images_tile") {
        pass("VALID_THREE_TILE", "Obraz " + dimensionsText(meta) + " jest odpowiedni jako kafelek modułu „Trzy obrazy i tekst”.");
      } else if (context === "banner_source") {
        pass("VALID_BANNER_SOURCE", "Obraz " + dimensionsText(meta) + " jest odpowiedni jako źródło do banera.");
      } else if (context === "comparison_cover") {
        pass("VALID_COMPARISON_COVER", "Obraz " + dimensionsText(meta) + " jest odpowiedni jako okładka do tabeli porównawczej.");
      } else {
        pass("VALID_FULL_PAGE", "Obraz " + dimensionsText(meta) + " jest odpowiedni jako pełna strona książki.");
      }
    }

    meta.validationStatus = status;
    meta.validationMessages = messages;
    return meta;
  }

  function duplicateInRole(file, role) {
    return records.some(function (record) {
      return record.role === role &&
        record.filename === file.name &&
        record.sizeBytes === file.size &&
        record.mimeType === file.type;
    });
  }

  function revokeRecord(record) {
    if (record && record.objectUrl) {
      URL.revokeObjectURL(record.objectUrl);
      record.objectUrl = "";
    }
  }

  function removeByRole(role) {
    records = records.filter(function (record) {
      if (record.role === role) {
        revokeRecord(record);
        return false;
      }
      return true;
    });
  }

  function removeById(id) {
    var removed = null;
    records = records.filter(function (record) {
      if (record.id === id) {
        removed = record;
        revokeRecord(record);
        return false;
      }
      return true;
    });
    return removed;
  }

  function readDimensions(objectUrl) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = function () {
        reject(new Error("Nie można odczytać obrazu."));
      };
      image.src = objectUrl;
    });
  }

  function validateFileBeforeRead(file, role) {
    if (!ACCEPTED_MIME[file.type] || !extensionAllowed(file.name)) {
      return { code: "UNSUPPORTED_IMAGE_TYPE", message: "Nieobsługiwany format pliku: " + file.name + "." };
    }
    if (duplicateInRole(file, role)) {
      return { code: "DUPLICATE_IMAGE", message: "Ten plik jest już wybrany w tej samej roli: " + file.name + "." };
    }
    if (role === "sample" && records.filter(function (record) { return record.role === "sample"; }).length >= MAX_SAMPLE_IMAGES) {
      return { code: "SAMPLE_LIMIT_REACHED", message: "Limit przykładowych stron wynosi 6 obrazów." };
    }
    return null;
  }

  function addFile(file, role) {
    var early = validateFileBeforeRead(file, role);
    var objectUrl;

    if (early) {
      return Promise.resolve({ added: false, error: early });
    }

    if (role === "cover" || role === "promo") {
      removeByRole(role);
    }

    objectUrl = URL.createObjectURL(file);
    return readDimensions(objectUrl).then(function (dimensions) {
      var record = validateMetadata({
        id: createId(role),
        role: role,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio: formatRatio(dimensions.width, dimensions.height),
        intendedUse: normalizeIntendedUse("", role),
        validationStatus: "pass",
        validationMessages: [],
        addedAt: nowIso(),
        localFileAvailable: true,
        objectUrl: objectUrl
      });

      records.push(record);
      return { added: true, record: record };
    }).catch(function () {
      URL.revokeObjectURL(objectUrl);
      return {
        added: false,
        error: { code: "UNREADABLE_IMAGE", message: "Nie można odczytać obrazu: " + file.name + "." }
      };
    });
  }

  function addFiles(fileList, role) {
    var files = Array.prototype.slice.call(fileList || []);
    var results = [];
    return files.reduce(function (promise, file) {
      return promise.then(function () {
        return addFile(file, role).then(function (result) {
          results.push(result);
        });
      });
    }, Promise.resolve()).then(function () {
      return results;
    });
  }

  function snapshot() {
    return records.map(function (record) {
      return {
        id: record.id,
        role: record.role,
        filename: record.filename,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        width: record.width,
        height: record.height,
        aspectRatio: record.aspectRatio,
        intendedUse: normalizeIntendedUse(record.intendedUse, record.role),
        validationStatus: record.validationStatus,
        validationMessages: clone(record.validationMessages || []),
        addedAt: record.addedAt,
        localFileAvailable: record.localFileAvailable === true
      };
    });
  }

  function restore(metadata) {
    revokeAll();
    records = Array.isArray(metadata) ? metadata.map(function (item) {
      var copy = clone(item);
      copy.localFileAvailable = false;
      copy.objectUrl = "";
      copy.intendedUse = normalizeIntendedUse(copy.intendedUse, copy.role);
      if (copy.validationStatus === "pass") {
        copy.validationStatus = "missing";
      }
      copy.validationMessages = [{
        status: "WARNING",
        code: "LOCAL_FILE_REQUIRED",
        message: "Wybierz plik lokalny ponownie."
      }];
      return copy;
    }) : [];
  }

  function updateIntendedUse(id, intendedUse) {
    var updated = null;
    records.forEach(function (record) {
      if (record.id === id) {
        record.intendedUse = normalizeIntendedUse(intendedUse, record.role);
        if (record.localFileAvailable === true) {
          updated = validateMetadata(record);
        } else {
          record.validationStatus = "missing";
          record.validationMessages = [{
            status: "WARNING",
            code: "LOCAL_FILE_REQUIRED",
            message: "Wybierz plik lokalny ponownie."
          }];
          updated = record;
        }
      }
    });
    return updated;
  }

  function revokeAll() {
    records.forEach(revokeRecord);
    records = [];
  }

  namespace.ImageManager = {
    addFiles: addFiles,
    getRecords: function () { return records.slice(); },
    intendedUseLabels: INTENDED_USE_LABELS,
    removeById: removeById,
    restore: restore,
    revokeAll: revokeAll,
    updateIntendedUse: updateIntendedUse,
    snapshot: snapshot,
    validateMetadata: validateMetadata,
    constants: {
      maxSampleImages: MAX_SAMPLE_IMAGES,
      maxSizeBytes: MAX_SIZE_BYTES
    }
  };

  global.FenixAPlus = namespace;
}(window));
