(function (global) {
  "use strict";

  var namespace = global.FenixAPlus || {};
  var stateApi = namespace.ProjectState;
  var ASIN_PATTERN = /^[A-Z0-9]{10}$/;
  var HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
  var SUPPORTED_MODULES = {
    "standard-image-text-overlay": true,
    standard_image_text_overlay: true,
    standard_three_images_text: true,
    comparison_chart: true
  };
  var ROLE_LABELS = {
    cover: "Okładka",
    sample: "Przykładowe strony",
    promo: "Grafika promocyjna"
  };
  var INTENDED_USE_LABELS = {
    unspecified: "Nie określono",
    full_book_page: "Pełna strona książki",
    three_images_tile: "Kafelek modułu „Trzy obrazy i tekst”",
    banner_source: "Źródło do banera",
    comparison_cover: "Okładka do tabeli porównawczej"
  };

  function result(status, code, field, message) {
    return {
      status: status,
      code: code,
      field: field,
      group: groupForField(field, code),
      message: message
    };
  }

  function groupForField(field, code) {
    if (field.indexOf("modules.banner") === 0 || code.indexOf("BANNER") !== -1) {
      return "Baner A+";
    }
    if (field.indexOf("book.relatedAsins") === 0 || field === "book.asin" || code.indexOf("ASIN") !== -1) {
      return "ASIN-y";
    }
    if (field.indexOf("selectedModules") === 0) {
      return "Wybór modułów";
    }
    if (field.indexOf("importedImages") === 0) {
      return "Obrazy";
    }
    return "Dane projektu";
  }

  function hasText(value) {
    return String(value || "").trim().length > 0;
  }

  function selectedTypes(project) {
    return (project.selectedModules || []).map(function (item) {
      return item && item.type === "standard_image_text_overlay" ? "standard-image-text-overlay" : item && item.type;
    });
  }

  function bannerSelected(project) {
    return selectedTypes(project).indexOf("standard-image-text-overlay") !== -1;
  }

  function threeImagesSelected(project) {
    return selectedTypes(project).indexOf("standard_three_images_text") !== -1;
  }

  function textLength(value) {
    return String(value || "").trim().length;
  }

  function findBannerSource(project, banner) {
    var images = Array.isArray(project.importedImages) ? project.importedImages : [];
    var role = banner.sourceImageRole || "cover";
    if (role === "sample" && banner.sourceImageId) {
      return images.filter(function (item) {
        return item.role === "sample" && item.id === banner.sourceImageId;
      })[0] || null;
    }
    return images.filter(function (item) {
      return item.role === role;
    })[0] || null;
  }

  function hasForbiddenLanguage(value) {
    return /\b(best|#1|number one|guaranteed|free|buy now|limited time|lowest price|sale)\b/i.test(String(value || ""));
  }

  function textDensityLimit(layout) {
    if (layout === "full-overlay") {
      return 170;
    }
    if (layout === "panel-overlay") {
      return 190;
    }
    return 225;
  }

  function compactTextEstimate(banner) {
    var bulletCount = Array.isArray(banner.bullets) ? banner.bullets.filter(hasText).length : 0;
    return textLength(banner.headline) * 1.45
      + textLength(banner.supportingText)
      + textLength(banner.extraLine) * 0.9
      + (Array.isArray(banner.bullets) ? banner.bullets.reduce(function (sum, item) { return sum + textLength(item) * 0.75; }, 0) : 0)
      + bulletCount * 12;
  }

  function validateAsin(value, field, label) {
    if (!hasText(value)) {
      return null;
    }
    if (!ASIN_PATTERN.test(String(value))) {
      return result("ERROR", "INVALID_ASIN", field, label + " musi mieć dokładnie 10 znaków alfanumerycznych.");
    }
    return result("PASS", "VALID_ASIN", field, "Format " + label + " jest poprawny.");
  }

  function validateModules(project, results) {
    var selected = Array.isArray(project.selectedModules) ? project.selectedModules : [];
    var seen = {};

    if (selected.length === 0) {
      results.push(result("WARNING", "NO_SELECTED_MODULES", "selectedModules", "Nie wybrano żadnego modułu A+."));
      return;
    }
    if (selected.length > stateApi.constants.maxSelectedModules) {
      results.push(result("ERROR", "MODULE_LIMIT_EXCEEDED", "selectedModules", "Można wybrać maksymalnie 5 modułów."));
    }

    selected.forEach(function (item, index) {
      if (!item || !SUPPORTED_MODULES[item.type]) {
        results.push(result("ERROR", "UNSUPPORTED_MODULE_TYPE", "selectedModules[" + index + "]", "Wybrany moduł nie jest obsługiwany w bieżącej fazie."));
      } else if (seen[item.type]) {
        results.push(result("ERROR", "DUPLICATE_MODULE_TYPE", "selectedModules[" + index + "]", "Ten typ modułu jest już wybrany."));
      } else {
        seen[item.type] = true;
        results.push(result("PASS", "VALID_SELECTED_MODULE", "selectedModules[" + index + "]", "Moduł jest obsługiwany i zapisany w kolejności projektu."));
      }
    });
  }

  function validateImages(project, results) {
    var images = Array.isArray(project.importedImages) ? project.importedImages : [];
    var sampleCount = images.filter(function (item) { return item.role === "sample"; }).length;
    var duplicateKeys = {};
    var threeTileCount = 0;

    if (images.length === 0) {
      results.push(result("INFO", "NO_IMAGES_SELECTED", "importedImages", "Nie wybrano jeszcze lokalnych obrazów."));
      if (threeImagesSelected(project)) {
        results.push(result("WARNING", "THREE_IMAGES_TILES_MISSING", "selectedModules.standard_three_images_text", "Dodaj trzy obrazy przeznaczone do modułu „Trzy obrazy i tekst”."));
      }
      return;
    }
    if (sampleCount > stateApi.constants.maxSampleImages) {
      results.push(result("ERROR", "SAMPLE_IMAGE_LIMIT", "importedImages", "Limit przykładowych stron wynosi 6 obrazów."));
    }

    images.forEach(function (image, index) {
      var roleLabel = ROLE_LABELS[image.role] || "Obraz";
      var useLabel = INTENDED_USE_LABELS[image.intendedUse] || INTENDED_USE_LABELS.unspecified;
      var key = [image.role, image.filename, image.mimeType, image.sizeBytes].join("|");
      var primaryMessage = (image.validationMessages || []).filter(function (message) {
        return message.status === "ERROR" || message.status === "WARNING" || message.status === "PASS";
      })[0];

      if (duplicateKeys[key]) {
        results.push(result("ERROR", "DUPLICATE_IMAGE_IN_ROLE", "importedImages[" + index + "]", "Duplikat pliku w tej samej roli: " + image.filename + "."));
      }
      duplicateKeys[key] = true;

      if (image.intendedUse === "three_images_tile" && image.validationStatus === "pass" && image.width === 600 && image.height === 600) {
        threeTileCount += 1;
      }

      if (image.validationStatus === "error") {
        results.push(result("ERROR", "IMAGE_VALIDATION_ERROR", "importedImages[" + index + "]", roleLabel + " / " + useLabel + ": " + (primaryMessage ? primaryMessage.message : "obraz wymaga poprawy.")));
      } else if (image.validationStatus === "warning") {
        results.push(result("WARNING", "IMAGE_VALIDATION_WARNING", "importedImages[" + index + "]", roleLabel + " / " + useLabel + ": " + (primaryMessage ? primaryMessage.message : "obraz ma ostrzeżenia.")));
      } else if (image.validationStatus === "missing" || image.localFileAvailable !== true) {
        results.push(result("WARNING", "LOCAL_IMAGE_REQUIRED", "importedImages[" + index + "]", roleLabel + " / " + useLabel + ": wybierz plik lokalny ponownie."));
      } else {
        results.push(result("PASS", "IMAGE_VALIDATION_PASS", "importedImages[" + index + "]", roleLabel + " / " + useLabel + ": " + (primaryMessage ? primaryMessage.message : "obraz przeszedł walidację.")));
      }

      (image.validationMessages || []).forEach(function (message) {
        if (message.status === "ERROR" || message.status === "WARNING") {
          results.push(result(message.status, message.code, "importedImages[" + index + "]", roleLabel + ": " + message.message));
        }
      });
    });

    if (threeImagesSelected(project)) {
      if (threeTileCount >= 3) {
        results.push(result("PASS", "THREE_IMAGES_TILES_READY", "selectedModules.standard_three_images_text", "Dostępne są trzy poprawne obrazy 600 × 600 px dla modułu „Trzy obrazy i tekst”."));
      } else {
        results.push(result(threeTileCount > 0 ? "INFO" : "WARNING", "THREE_IMAGES_TILES_INCOMPLETE", "selectedModules.standard_three_images_text", "Dodaj trzy obrazy przeznaczone do modułu „Trzy obrazy i tekst”."));
      }
    }
  }

  function validateBanner(project, results) {
    var banner;
    var source;
    var textTotal;
    var density;
    var densityLimit;
    var populatedTextFields;

    if (!bannerSelected(project)) {
      results.push(result("INFO", "BANNER_NOT_SELECTED", "modules.banner", "ModuĹ‚ Baner z obrazem i tekstem nie jest wybrany."));
      return;
    }

    banner = project.modules && project.modules.banner ? project.modules.banner : {};
    source = findBannerSource(project, banner);
    textTotal = textLength(banner.headline) + textLength(banner.supportingText) + textLength(banner.extraLine)
      + (Array.isArray(banner.bullets) ? banner.bullets.reduce(function (sum, item) { return sum + textLength(item); }, 0) : 0);
    density = compactTextEstimate(banner);
    densityLimit = textDensityLimit(banner.layoutPreset);
    populatedTextFields = [
      banner.headline,
      banner.supportingText,
      banner.extraLine
    ].concat(Array.isArray(banner.bullets) ? banner.bullets : []).filter(hasText).length;

    if (!source) {
      results.push(result("ERROR", "BANNER_SOURCE_IMAGE_MISSING", "modules.banner.sourceImageId", "Brakuje obrazu ĹşrĂłdĹ‚owego dla banera."));
    } else if (source.localFileAvailable !== true || source.validationStatus === "missing") {
      results.push(result("ERROR", "BANNER_SOURCE_IMAGE_RESELECT_REQUIRED", "modules.banner.sourceImageId", "Wybierz plik lokalny ponownie przed podglÄ…dem produkcyjnym i eksportem banera."));
    } else if (source.validationStatus === "error") {
      results.push(result("ERROR", "BANNER_SOURCE_IMAGE_INVALID", "modules.banner.sourceImageId", "Wybrany obraz banera ma bĹ‚Ä™dy walidacji."));
    } else {
      results.push(result("PASS", "BANNER_SOURCE_IMAGE_READY", "modules.banner.sourceImageId", "Obraz ĹşrĂłdĹ‚owy banera jest dostÄ™pny lokalnie."));
      if ((banner.layoutPreset === "full-overlay" || banner.layoutPreset === "panel-overlay") && source.width && source.height && source.width < source.height) {
        results.push(result("WARNING", "BANNER_LAYOUT_PREFERS_LANDSCAPE", "modules.banner.layoutPreset", "Wybrany układ banera zwykle działa lepiej z obrazem poziomym. Obraz pionowy nadal może być użyty po ręcznej ocenie kadru."));
      } else if ((banner.layoutPreset === "image-left" || banner.layoutPreset === "image-right") && source.width && source.height && source.width < source.height) {
        results.push(result("PASS", "BANNER_PORTRAIT_ACCEPTED_FOR_SIDE_LAYOUT", "modules.banner.layoutPreset", "Obraz pionowy może być użyty w układzie banera z obrazem obok tekstu."));
      } else if (source.width && source.height && source.width >= source.height) {
        results.push(result("PASS", "BANNER_LANDSCAPE_SOURCE_READY", "modules.banner.layoutPreset", "Obraz poziomy pasuje do bezpośredniego użycia w banerze."));
      }
    }

    if (!hasText(banner.headline)) {
      results.push(result("ERROR", "BANNER_HEADLINE_REQUIRED", "modules.banner.headline", "NagĹ‚Ăłwek banera jest wymagany."));
    } else if (textLength(banner.headline) > (banner.layoutPreset === "panel-overlay" ? 58 : 70)) {
      results.push(result("WARNING", "BANNER_HEADLINE_TOO_LONG", "modules.banner.headline", "Za długi nagłówek dla wybranego układu."));
    } else {
      results.push(result("PASS", "BANNER_HEADLINE_PRESENT", "modules.banner.headline", "NagĹ‚Ăłwek banera jest wpisany."));
    }

    if (textLength(banner.supportingText) > 132) {
      results.push(result("WARNING", "BANNER_SUPPORTING_TEXT_TOO_LONG", "modules.banner.supportingText", "Tekst uzupełniający jest zbyt długi dla wybranego układu."));
    }

    if (!hasText(banner.altText)) {
      results.push(result("ERROR", "BANNER_ALT_TEXT_REQUIRED", "modules.banner.altText", "Alt text banera jest wymagany."));
    } else if (textLength(banner.altText) < 18) {
      results.push(result("WARNING", "BANNER_ALT_TEXT_TOO_SHORT", "modules.banner.altText", "Alt text wyglÄ…da na zbyt krĂłtki, aby opisaÄ‡ obraz."));
    } else {
      results.push(result("PASS", "BANNER_ALT_TEXT_PRESENT", "modules.banner.altText", "Alt text banera jest wpisany."));
    }

    if (hasText(banner.altText) && populatedTextFields === 0) {
      results.push(result("WARNING", "BANNER_TEXT_EMPTY_EXCEPT_ALT", "modules.banner", "WypeĹ‚niono tylko alt text. Baner potrzebuje widocznej treĹ›ci marketingowej."));
    }

    if (density > densityLimit || textTotal > (banner.layoutPreset === "full-overlay" ? 185 : 230)) {
      results.push(result("WARNING", "BANNER_TOO_MUCH_TEXT", "modules.banner", "Zbyt dużo tekstu dla wybranego układu banera. Zmniejsz ilość tekstu lub wybierz inny układ."));
    } else {
      results.push(result("PASS", "BANNER_TEXT_FITS", "modules.banner", "Tekst mieści się bezpiecznie w wybranym układzie."));
    }

    if (hasText(banner.extraLine) && density > densityLimit * 0.86) {
      results.push(result("WARNING", "BANNER_EXTRA_LINE_MAY_NOT_FIT", "modules.banner.extraLine", "Dodatkowa linia tekstu nie mieści się w banerze."));
    }

    if (hasForbiddenLanguage([banner.headline, banner.supportingText, banner.extraLine].join(" "))) {
      results.push(result("WARNING", "BANNER_PROMOTIONAL_LANGUAGE", "modules.banner", "Wykryto potencjalnie zbyt promocyjne sformuĹ‚owania. SprawdĹş zgodnoĹ›Ä‡ z zasadami Amazon."));
    }

    results.push(result("PASS", "BANNER_LAYOUT_READY", "modules.banner.layoutPreset", "Konfiguracja ukĹ‚adu banera jest gotowa do lokalnego renderowania."));
  }

  function validate(project) {
    var results = [];
    var related;
    var seen = {};
    var duplicateCount = 0;
    var primary;

    if (!project || typeof project !== "object" || Array.isArray(project)) {
      return [result("ERROR", "INVALID_PROJECT_STATE", "project", "Stan projektu musi być obiektem.")];
    }

    if (!project.book || typeof project.book !== "object" || Array.isArray(project.book)) {
      results.push(result("ERROR", "INVALID_PROJECT_STRUCTURE", "book", "Brakuje danych książki albo mają niepoprawną strukturę."));
    }

    if (!project.brandColors || typeof project.brandColors !== "object" || Array.isArray(project.brandColors)) {
      results.push(result("ERROR", "INVALID_PROJECT_STRUCTURE", "brandColors", "Brakuje danych kolorów marki albo mają niepoprawną strukturę."));
    }

    if (project.book && typeof project.book === "object") {
      related = Array.isArray(project.book.relatedAsins) ? project.book.relatedAsins : [];
      primary = String(project.book.asin || "");

      if (!hasText(project.projectName)) {
        results.push(result("WARNING", "MISSING_PROJECT_NAME", "projectName", "Brakuje nazwy projektu."));
      }
      if (!hasText(project.book.title)) {
        results.push(result("WARNING", "MISSING_BOOK_TITLE", "book.title", "Brakuje tytułu książki."));
      }
      if (!hasText(project.book.author)) {
        results.push(result("WARNING", "MISSING_AUTHOR", "book.author", "Brakuje autora."));
      }
      if (!hasText(project.book.ageGroup)) {
        results.push(result("WARNING", "MISSING_AGE_GROUP", "book.ageGroup", "Brakuje grupy wiekowej."));
      }
      if (!hasText(project.theme)) {
        results.push(result("WARNING", "MISSING_THEME", "theme", "Brakuje motywu."));
      }
      if (project.marketplace === "Inny" || project.marketplace === "Other") {
        results.push(result("WARNING", "UNSUPPORTED_MARKETPLACE", "marketplace", "Inny marketplace wymaga ręcznej weryfikacji wymagań Amazon."));
      }
      if (related.length > 5) {
        results.push(result("WARNING", "RELATED_ASIN_LIMIT", "book.relatedAsins", "Lista powiązanych ASIN-ów przekracza limit pięciu pozycji."));
      }
      if (!hasText(project.book.seriesName)) {
        results.push(result("INFO", "NO_SERIES_NAME", "book.seriesName", "Nie wpisano nazwy serii."));
      }
      if (!hasText(project.book.subtitle)) {
        results.push(result("INFO", "NO_SUBTITLE", "book.subtitle", "Nie wpisano podtytułu."));
      }
      if (!hasText(primary)) {
        results.push(result("INFO", "NO_PRIMARY_ASIN", "book.asin", "Nie wpisano głównego ASIN-u."));
      }
      if (related.length === 0) {
        results.push(result("INFO", "NO_RELATED_ASINS", "book.relatedAsins", "Nie wpisano powiązanych ASIN-ów."));
      }

      [validateAsin(primary, "book.asin", "głównego ASIN-u")].forEach(function (item) {
        if (item) {
          results.push(item);
        }
      });

      related.forEach(function (asin, index) {
        var validation = validateAsin(asin, "book.relatedAsins[" + index + "]", "powiązanego ASIN-u " + (index + 1));
        if (validation) {
          results.push(validation);
        }
        if (hasText(asin)) {
          if (seen[asin]) {
            duplicateCount += 1;
          }
          seen[asin] = true;
          if (primary && asin === primary) {
            results.push(result("ERROR", "PRIMARY_ASIN_DUPLICATED", "book.relatedAsins[" + index + "]", "Główny ASIN jest powtórzony na liście powiązanych ASIN-ów."));
          }
        }
      });

      if (duplicateCount > 0) {
        results.push(result("ERROR", "DUPLICATE_RELATED_ASIN", "book.relatedAsins", "Powiązane ASIN-y zawierają duplikaty."));
      }
    }

    if (project.brandColors && typeof project.brandColors === "object") {
      if (!HEX_PATTERN.test(String(project.brandColors.primary || ""))) {
        results.push(result("ERROR", "INVALID_HEX_COLOR", "brandColors.primary", "Główny kolor marki musi być poprawną wartością HEX #RRGGBB."));
      } else {
        results.push(result("PASS", "VALID_BRAND_COLOR", "brandColors.primary", "Główny kolor marki jest poprawny."));
      }

      if (!HEX_PATTERN.test(String(project.brandColors.secondary || ""))) {
        results.push(result("ERROR", "INVALID_HEX_COLOR", "brandColors.secondary", "Drugi kolor marki musi być poprawną wartością HEX #RRGGBB."));
      } else {
        results.push(result("PASS", "VALID_BRAND_COLOR", "brandColors.secondary", "Drugi kolor marki jest poprawny."));
      }
    }

    if (project.schemaVersion && project.createdAt && project.modifiedAt && project.book && project.brandColors) {
      results.push(result("PASS", "VALID_PROJECT_STRUCTURE", "project", "Struktura projektu jest poprawna dla fazy 4."));
    }

    validateModules(project, results);
    validateImages(project, results);
    validateBanner(project, results);

    return results;
  }

  namespace.ProjectValidator = {
    validate: validate,
    statuses: {
      error: "ERROR",
      warning: "WARNING",
      info: "INFO",
      pass: "PASS"
    }
  };

  global.FenixAPlus = namespace;
}(window));
