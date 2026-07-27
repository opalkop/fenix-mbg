(function (global, document) {
  "use strict";

  var namespace = global.FenixAPlus || {};
  var stateApi = namespace.ProjectState;
  var imageManager = namespace.ImageManager;
  var bannerRenderer = namespace.BannerRenderer;
  var validator = namespace.ProjectValidator;
  var messageTimer = null;
  var renderSequence = 0;
  var elements = {};
  var BANNER_TYPE = "standard-image-text-overlay";
  var MODULE_TYPES = [
    { type: BANNER_TYPE, label: "Baner z obrazem i tekstem", amazonName: "Standard Image & Text Overlay" },
    { type: "standard_three_images_text", label: "Trzy obrazy i tekst", amazonName: "Standard Three Images and Text" },
    { type: "comparison_chart", label: "Tabela porównawcza", amazonName: "Comparison Chart" }
  ];
  var MODULE_LABELS = MODULE_TYPES.reduce(function (labels, item) {
    labels[item.type] = item.label;
    return labels;
  }, {});
  MODULE_LABELS.standard_image_text_overlay = MODULE_LABELS[BANNER_TYPE];
  var ROLE_LABELS = {
    cover: "Okładka",
    sample: "Przykładowe strony",
    promo: "Dodatkowa grafika promocyjna"
  };
  var INTENDED_USE_ORDER = [
    "full_book_page",
    "three_images_tile",
    "banner_source",
    "comparison_cover",
    "unspecified"
  ];

  function byId(id) {
    return document.getElementById(id);
  }

  function query(selector) {
    return document.querySelector(selector);
  }

  function queryAll(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function setText(node, value) {
    if (node) {
      node.textContent = value;
    }
  }

  function showMessage(message, type, persist) {
    if (!elements.message) {
      return;
    }

    global.clearTimeout(messageTimer);
    elements.message.textContent = message;
    elements.message.dataset.type = type || "info";
    elements.message.hidden = false;

    if (!persist) {
      messageTimer = global.setTimeout(function () {
        elements.message.textContent = "";
        elements.message.hidden = true;
      }, type === "error" ? 7000 : 4400);
    }
  }

  function normalizeHexInput(value) {
    var raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    if (raw.charAt(0) !== "#") {
      raw = "#" + raw;
    }
    return raw.toLowerCase();
  }

  function fieldValue(id) {
    return byId(id).value.trim();
  }

  function bannerSelected(project) {
    return selectedModuleTypes(project).indexOf(BANNER_TYPE) !== -1;
  }

  function currentBanner(project) {
    return project.modules && project.modules.banner ? project.modules.banner : stateApi.createDefaultBannerModule();
  }

  function bannerFromForm(project) {
    var banner = currentBanner(project);
    var sourceRole = byId("aplus-banner-source-role") ? byId("aplus-banner-source-role").value : banner.sourceImageRole;
    var roleRecord = imageManager.getRecords().filter(function (record) {
      return record.role === sourceRole;
    })[0];

    if (!byId("aplus-banner-source-role")) {
      return banner;
    }

    return {
      type: BANNER_TYPE,
      sourceImageRole: sourceRole,
      sourceImageId: sourceRole === "sample" ? byId("aplus-banner-source-image").value : roleRecord && roleRecord.id || "",
      layoutPreset: byId("aplus-banner-layout").value,
      canvasSize: byId("aplus-banner-size").value,
      backgroundPreset: byId("aplus-banner-background").value,
      imageFit: byId("aplus-banner-image-fit").value,
      textAlign: byId("aplus-banner-text-align").value,
      bannerStyle: byId("aplus-banner-style").value,
      exportFormatDefault: byId("aplus-banner-export-format").value,
      headline: fieldValue("aplus-banner-headline"),
      supportingText: fieldValue("aplus-banner-supporting-text"),
      bullets: [0, 1, 2].map(function (index) {
        var input = query("[data-banner-bullet='" + index + "']");
        return input ? input.value.trim() : "";
      }),
      extraLine: fieldValue("aplus-banner-extra-line"),
      altText: fieldValue("aplus-banner-alt-text")
    };
  }

  function buildProjectFromForm() {
    var current = stateApi.getSnapshot();
    current.projectName = fieldValue("aplus-project-name");
    current.marketplace = byId("aplus-marketplace").value;
    current.language = byId("aplus-language").value;
    current.theme = fieldValue("aplus-theme");
    current.brandColors.primary = normalizeHexInput(fieldValue("aplus-primary-color-hex"));
    current.brandColors.secondary = normalizeHexInput(fieldValue("aplus-secondary-color-hex"));
    current.book.title = fieldValue("aplus-book-title");
    current.book.subtitle = fieldValue("aplus-subtitle");
    current.book.author = fieldValue("aplus-author");
    current.book.ageGroup = fieldValue("aplus-age-group");
    current.book.seriesName = fieldValue("aplus-series-name");
    current.book.asin = stateApi.normalizeAsin(fieldValue("aplus-primary-asin"));
    current.book.relatedAsins = getRelatedAsinsFromRows();
    current.importedImages = imageManager.snapshot();
    current.modules.banner = bannerFromForm(current);
    return current;
  }

  function syncStateFromForm() {
    stateApi.setProjectState(buildProjectFromForm());
    renderAll();
  }

  function syncAsinInput(input) {
    input.value = stateApi.normalizeAsin(input.value);
  }

  function syncColorPair(colorInput, hexInput, changedInput) {
    var nextValue = changedInput === colorInput ? colorInput.value : normalizeHexInput(hexInput.value);
    hexInput.value = nextValue;

    if (/^#[0-9a-fA-F]{6}$/.test(nextValue)) {
      colorInput.value = nextValue;
    }
  }

  function renderSampleImageOptions(project) {
    var select = byId("aplus-banner-source-image");
    var banner = currentBanner(project);
    var samples = (project.importedImages || []).filter(function (item) {
      return item.role === "sample";
    });

    if (!select) {
      return;
    }

    select.textContent = "";
    if (!samples.length) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Brak przykładowych stron";
      select.appendChild(empty);
      return;
    }

    samples.forEach(function (sample, index) {
      var option = document.createElement("option");
      option.value = sample.id;
      option.textContent = (index + 1) + ". " + (sample.filename || "Przykładowa strona");
      select.appendChild(option);
    });

    if (samples.some(function (sample) { return sample.id === banner.sourceImageId; })) {
      select.value = banner.sourceImageId;
    } else {
      select.value = samples[0].id;
    }
  }

  function setBannerControlValues(project) {
    var banner = currentBanner(project);
    if (!byId("aplus-banner-source-role")) {
      return;
    }
    byId("aplus-banner-source-role").value = banner.sourceImageRole || "cover";
    renderSampleImageOptions(project);
    byId("aplus-banner-layout").value = banner.layoutPreset || "image-left";
    byId("aplus-banner-size").value = banner.canvasSize || "hi-res-1940x600";
    byId("aplus-banner-background").value = banner.backgroundPreset || "primary";
    byId("aplus-banner-image-fit").value = banner.imageFit || "cover";
    byId("aplus-banner-text-align").value = banner.textAlign || "left";
    byId("aplus-banner-style").value = banner.bannerStyle || "clean";
    byId("aplus-banner-export-format").value = banner.exportFormatDefault || "png";
    byId("aplus-banner-headline").value = banner.headline || "";
    byId("aplus-banner-supporting-text").value = banner.supportingText || "";
    [0, 1, 2].forEach(function (index) {
      var input = query("[data-banner-bullet='" + index + "']");
      if (input) {
        input.value = banner.bullets && banner.bullets[index] || "";
      }
    });
    byId("aplus-banner-extra-line").value = banner.extraLine || "";
    byId("aplus-banner-alt-text").value = banner.altText || "";
  }

  function setControlValues(project) {
    byId("aplus-project-name").value = project.projectName || "";
    byId("aplus-marketplace").value = project.marketplace || "Amazon.com";
    byId("aplus-language").value = project.language || "Angielski";
    byId("aplus-theme").value = project.theme || "";
    byId("aplus-primary-color").value = /^#[0-9a-fA-F]{6}$/.test(project.brandColors.primary) ? project.brandColors.primary : stateApi.constants.defaultPrimaryColor;
    byId("aplus-primary-color-hex").value = project.brandColors.primary || stateApi.constants.defaultPrimaryColor;
    byId("aplus-secondary-color").value = /^#[0-9a-fA-F]{6}$/.test(project.brandColors.secondary) ? project.brandColors.secondary : stateApi.constants.defaultSecondaryColor;
    byId("aplus-secondary-color-hex").value = project.brandColors.secondary || stateApi.constants.defaultSecondaryColor;
    byId("aplus-book-title").value = project.book.title || "";
    byId("aplus-subtitle").value = project.book.subtitle || "";
    byId("aplus-author").value = project.book.author || "";
    byId("aplus-age-group").value = project.book.ageGroup || "";
    byId("aplus-series-name").value = project.book.seriesName || "";
    byId("aplus-primary-asin").value = project.book.asin || "";
    renderRelatedAsins(project.book.relatedAsins || []);
    setBannerControlValues(project);
    imageManager.restore(project.importedImages || []);
  }

  function getRelatedAsinsFromRows() {
    return queryAll("[data-related-asin-input]")
      .map(function (input) {
        return stateApi.normalizeAsin(input.value);
      })
      .filter(function (value) {
        return value.length > 0;
      })
      .slice(0, stateApi.constants.maxRelatedAsins);
  }

  function createRelatedRow(value, index) {
    var row = document.createElement("div");
    var label = document.createElement("label");
    var labelText = document.createElement("span");
    var input = document.createElement("input");
    var remove = document.createElement("button");
    var feedback = document.createElement("span");

    row.className = "aplus-related-row";
    label.className = "aplus-related-field";
    labelText.textContent = "Powiązany ASIN " + (index + 1);
    input.type = "text";
    input.maxLength = 10;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = value || "";
    input.dataset.relatedAsinInput = "true";
    feedback.className = "aplus-related-feedback";
    feedback.dataset.relatedAsinFeedback = "true";
    remove.className = "aplus-button aplus-button-small";
    remove.type = "button";
    remove.dataset.action = "remove-asin";
    remove.textContent = "Usuń";

    label.appendChild(labelText);
    label.appendChild(input);
    row.appendChild(label);
    row.appendChild(feedback);
    row.appendChild(remove);
    return row;
  }

  function renderRelatedAsins(values) {
    var rows = values.length ? values : [""];

    elements.relatedAsins.textContent = "";
    rows.slice(0, stateApi.constants.maxRelatedAsins).forEach(function (value, index) {
      elements.relatedAsins.appendChild(createRelatedRow(value, index));
    });
  }

  function addAsinRow() {
    var currentRows = queryAll("[data-related-asin-input]");
    if (currentRows.length >= stateApi.constants.maxRelatedAsins) {
      showMessage("Osiągnięto limit powiązanych ASIN-ów. Projekt może mieć maksymalnie pięć pozycji.", "warning", false);
      renderAll();
      return;
    }

    elements.relatedAsins.appendChild(createRelatedRow("", currentRows.length));
    syncStateFromForm();
  }

  function removeAsinRow(button) {
    var row = button.closest(".aplus-related-row");
    var values;
    if (row) {
      row.remove();
      if (queryAll("[data-related-asin-input]").length === 0) {
        elements.relatedAsins.appendChild(createRelatedRow("", 0));
      }
      values = getRelatedAsinsFromRows();
      renderRelatedAsins(values);
      syncStateFromForm();
    }
  }

  function imageSummary(project, role) {
    var matches = (project.importedImages || []).filter(function (item) {
      return item.role === role;
    });
    if (role === "sample") {
      return String(matches.length);
    }
    if (!matches.length) {
      return "Brak";
    }
    return matches[0].validationStatus === "missing" ? "Wymaga ponownego wyboru pliku" : matches[0].validationStatus.toUpperCase();
  }

  function renderSummary(project) {
    var relatedCount = (project.book.relatedAsins || []).length;
    setText(query("[data-summary='projectName']"), project.projectName || "-");
    setText(query("[data-summary='bookTitle']"), project.book.title || "-");
    setText(query("[data-summary='marketplace']"), project.marketplace || "-");
    setText(query("[data-summary='language']"), project.language || "-");
    setText(query("[data-summary='theme']"), project.theme || "-");
    setText(query("[data-summary='relatedAsins']"), String(relatedCount));
    setText(query("[data-summary='modifiedAt']"), project.modifiedAt ? new Date(project.modifiedAt).toLocaleString("pl-PL") : "-");
    setText(query("[data-summary='selectedModules']"), String((project.selectedModules || []).length));
    setText(query("[data-summary='coverImage']"), imageSummary(project, "cover"));
    setText(query("[data-summary='samplePages']"), imageSummary(project, "sample"));
    setText(query("[data-summary='promoImage']"), imageSummary(project, "promo"));
  }

  function selectedModuleTypes(project) {
    return (project.selectedModules || []).map(function (item) {
      return item.type === "standard_image_text_overlay" ? BANNER_TYPE : item.type;
    });
  }

  function moduleByType(type) {
    return MODULE_TYPES.filter(function (item) {
      return item.type === type;
    })[0];
  }

  function addModule(type) {
    var project = stateApi.getSnapshot();
    var selected = project.selectedModules || [];
    if (selected.some(function (item) { return item.type === type; })) {
      showMessage("Ten moduł jest już wybrany.", "warning", false);
      return;
    }
    if (selected.length >= stateApi.constants.maxSelectedModules) {
      showMessage("Można wybrać maksymalnie 5 modułów.", "warning", false);
      return;
    }
    selected.push({
      id: "module-" + type,
      type: type,
      status: "planned",
      addedAt: new Date().toISOString()
    });
    stateApi.setSelectedModules(selected);
    showMessage("Dodano moduł: " + MODULE_LABELS[type] + ".", "success", false);
    renderAll();
  }

  function removeModule(index) {
    var project = stateApi.getSnapshot();
    var selected = project.selectedModules || [];
    if (index < 0 || index >= selected.length) {
      renderAll();
      return;
    }
    var removed = selected.splice(index, 1)[0];
    stateApi.setSelectedModules(selected);
    showMessage("Usunięto moduł: " + (removed ? MODULE_LABELS[removed.type] : "") + ".", "success", false);
    renderAll();
  }

  function moveModule(index, direction) {
    var project = stateApi.getSnapshot();
    var selected = project.selectedModules || [];
    var target = index + direction;
    var item;

    if (target < 0 || target >= selected.length) {
      return;
    }
    item = selected.splice(index, 1)[0];
    selected.splice(target, 0, item);
    stateApi.setSelectedModules(selected);
    showMessage("Zmieniono kolejność modułów.", "success", false);
    renderAll();
  }

  function renderModulePicker(project) {
    var selectedTypes = selectedModuleTypes(project);
    elements.modulePicker.textContent = "";
    MODULE_TYPES.forEach(function (module) {
      var label = document.createElement("label");
      var input = document.createElement("input");
      var title = document.createElement("span");
      var helper = document.createElement("small");
      var selected = selectedTypes.indexOf(module.type) !== -1;

      label.className = "aplus-module-card";
      label.dataset.selected = selected ? "true" : "false";
      input.type = "checkbox";
      input.checked = selected;
      input.dataset.moduleType = module.type;
      title.textContent = module.label;
      helper.textContent = module.amazonName;
      label.appendChild(input);
      label.appendChild(title);
      label.appendChild(helper);
      elements.modulePicker.appendChild(label);
    });
  }

  function renderSelectedModules(project) {
    var selected = project.selectedModules || [];
    elements.moduleCount.textContent = "Wybrane moduły: " + selected.length + " / " + stateApi.constants.maxSelectedModules;
    elements.selectedModules.textContent = "";

    if (!selected.length) {
      var empty = document.createElement("li");
      empty.className = "aplus-empty-row";
      empty.textContent = "Nie wybrano modułów.";
      elements.selectedModules.appendChild(empty);
      return;
    }

    selected.forEach(function (item, index) {
      var row = document.createElement("li");
      var name = document.createElement("span");
      var controls = document.createElement("div");
      var up = document.createElement("button");
      var down = document.createElement("button");
      var remove = document.createElement("button");

      row.className = "aplus-selected-row";
      name.textContent = MODULE_LABELS[item.type] || item.type;
      controls.className = "aplus-order-controls";
      up.className = "aplus-button aplus-button-small";
      down.className = "aplus-button aplus-button-small";
      remove.className = "aplus-button aplus-button-small";
      up.type = "button";
      down.type = "button";
      remove.type = "button";
      up.dataset.action = "module-up";
      down.dataset.action = "module-down";
      remove.dataset.action = "remove-module";
      up.dataset.index = String(index);
      down.dataset.index = String(index);
      remove.dataset.index = String(index);
      up.disabled = index === 0;
      down.disabled = index === selected.length - 1;
      up.textContent = "W górę";
      down.textContent = "W dół";
      remove.textContent = "Usuń";
      controls.appendChild(up);
      controls.appendChild(down);
      controls.appendChild(remove);
      row.appendChild(name);
      row.appendChild(controls);
      elements.selectedModules.appendChild(row);
    });
  }

  function findBannerSourceRecord(project) {
    var banner = currentBanner(project);
    var records = imageManager.getRecords();
    if (banner.sourceImageRole === "sample") {
      return records.filter(function (record) {
        return record.role === "sample" && record.id === banner.sourceImageId;
      })[0] || records.filter(function (record) {
        return record.role === "sample";
      })[0] || null;
    }
    return records.filter(function (record) {
      return record.role === banner.sourceImageRole;
    })[0] || null;
  }

  function bannerBlockingErrors(results) {
    return results.filter(function (item) {
      return item.group === "Baner A+" && item.status === "ERROR";
    });
  }

  function updateBannerPanels(project) {
    var selected = bannerSelected(project);
    var banner = currentBanner(project);
    var sampleField = query("[data-banner-sample-field]");

    elements.bannerConfig.hidden = !selected;
    elements.bannerTextPanel.hidden = !selected;
    elements.bannerTextPlaceholder.hidden = selected;
    elements.bannerExportPanel.hidden = !selected;
    elements.bannerExportPlaceholder.hidden = selected;

    if (!selected) {
      bannerRenderer.renderPlaceholder(elements.bannerPreview, "Wybierz moduł Baner z obrazem i tekstem");
      setText(elements.bannerPreviewStatus, "Moduł banera nie jest wybrany.");
      return;
    }

    setBannerControlValues(project);
    if (sampleField) {
      sampleField.hidden = banner.sourceImageRole !== "sample";
    }
  }

  function renderBannerPreview(project, results) {
    var selected = bannerSelected(project);
    var sourceRecord;
    var errors;
    var sequence;

    if (!selected) {
      return;
    }

    sourceRecord = findBannerSourceRecord(project);
    errors = bannerBlockingErrors(results);
    sequence = renderSequence + 1;
    renderSequence = sequence;

    if (!sourceRecord || !sourceRecord.objectUrl) {
      bannerRenderer.renderPlaceholder(elements.bannerPreview, "Wybierz plik lokalny ponownie");
      setText(elements.bannerPreviewStatus, "Brakuje lokalnego obrazu banera.");
      setText(elements.bannerSourceFeedback, "Wybierz plik lokalny ponownie.");
      return;
    }

    setText(elements.bannerSourceFeedback, "Obraz banera jest dostępny lokalnie.");
    bannerRenderer.render(elements.bannerPreview, project, sourceRecord).then(function (renderResult) {
      if (sequence !== renderSequence) {
        return;
      }
      if (renderResult && renderResult.textFit && currentBanner(project).extraLine && renderResult.textFit.extraRendered === false) {
        setText(elements.bannerPreviewStatus, "Podgląd zaktualizowany. Dodatkowa linia tekstu nie mieści się w wybranym układzie.");
      } else {
        setText(elements.bannerPreviewStatus, errors.length ? "Podgląd lokalny gotowy, ale eksport wymaga uzupełnienia danych." : "Podgląd banera zaktualizowany.");
      }
    });
  }

  function groupValidationByArea(results) {
    var order = ["Dane projektu", "ASIN-y", "Wybór modułów", "Obrazy", "Baner A+"];
    return order.map(function (name) {
      return {
        name: name,
        items: results.filter(function (item) {
          return item.group === name;
        })
      };
    }).filter(function (group) {
      return group.items.length > 0;
    });
  }

  function renderValidation(results) {
    var panel = elements.validationPanel;
    panel.textContent = "";

    groupValidationByArea(results).forEach(function (group) {
      var section = document.createElement("section");
      var heading = document.createElement("h3");
      var list = document.createElement("ul");

      section.className = "aplus-validation-group";
      heading.textContent = group.name;
      list.className = "aplus-validation-list";

      group.items.forEach(function (item) {
        var li = document.createElement("li");
        var status = document.createElement("span");
        var field = document.createElement("span");
        var message = document.createElement("span");

        li.dataset.status = item.status.toLowerCase();
        status.className = "aplus-validation-code";
        field.className = "aplus-validation-field";
        message.className = "aplus-validation-message";
        status.textContent = item.status;
        field.textContent = item.field;
        message.textContent = item.message;
        li.appendChild(status);
        li.appendChild(field);
        li.appendChild(message);
        list.appendChild(li);
      });

      section.appendChild(heading);
      section.appendChild(list);
      panel.appendChild(section);
    });
  }

  function renderAsinFeedback(results) {
    var primaryFeedback = query("[data-feedback='primaryAsin']");
    var primaryErrors = results.filter(function (item) {
      return item.field === "book.asin" && item.status === "ERROR";
    });
    var primaryPass = results.filter(function (item) {
      return item.field === "book.asin" && item.status === "PASS";
    });

    if (primaryErrors.length) {
      primaryFeedback.textContent = primaryErrors[0].message;
      primaryFeedback.dataset.status = "error";
    } else if (primaryPass.length) {
      primaryFeedback.textContent = primaryPass[0].message;
      primaryFeedback.dataset.status = "pass";
    } else {
      primaryFeedback.textContent = "Nie wpisano ASIN-u.";
      primaryFeedback.dataset.status = "info";
    }

    queryAll("[data-related-asin-input]").forEach(function (input, index) {
      var feedback = input.closest(".aplus-related-row").querySelector("[data-related-asin-feedback]");
      var field = "book.relatedAsins[" + index + "]";
      var errors = results.filter(function (item) {
        return item.field === field && item.status === "ERROR";
      });
      var passes = results.filter(function (item) {
        return item.field === field && item.status === "PASS";
      });

      if (!input.value) {
        feedback.textContent = "Opcjonalny.";
        feedback.dataset.status = "info";
      } else if (errors.length) {
        feedback.textContent = errors[0].message;
        feedback.dataset.status = "error";
      } else if (passes.length) {
        feedback.textContent = "Format poprawny.";
        feedback.dataset.status = "pass";
      }
    });
  }

  function formatBytes(bytes) {
    if (!bytes) {
      return "0 KB";
    }
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    }
    return Math.ceil(bytes / 1024) + " KB";
  }

  function statusLabel(record) {
    if (record.validationStatus === "missing") {
      return "Wybierz plik lokalny ponownie";
    }
    if (record.validationStatus === "error") {
      return "ERROR";
    }
    if (record.validationStatus === "warning") {
      return "WARNING";
    }
    return "PASS";
  }

  function intendedUseLabel(value) {
    var labels = imageManager.intendedUseLabels || {};
    return labels[value] || labels.unspecified || "Nie określono";
  }

  function validationReason(record) {
    var messages = record.validationMessages || [];
    var preferred = messages.filter(function (message) {
      return message.status === "ERROR" || message.status === "WARNING" || message.status === "PASS";
    })[0];
    if (record.validationStatus === "missing" || record.localFileAvailable !== true) {
      return "Wybierz plik lokalny ponownie.";
    }
    return preferred ? preferred.message : "Brak szczegółowego komunikatu walidacji.";
  }

  function metadataRow(label, value) {
    var row = document.createElement("div");
    var term = document.createElement("dt");
    var desc = document.createElement("dd");
    term.textContent = label;
    desc.textContent = value;
    row.appendChild(term);
    row.appendChild(desc);
    return row;
  }

  function createIntendedUseField(record) {
    var label = document.createElement("label");
    var text = document.createElement("span");
    var select = document.createElement("select");
    var labels = imageManager.intendedUseLabels || {};

    label.className = "aplus-image-use-field";
    text.textContent = "Przeznaczenie obrazu";
    select.dataset.imageUseSelect = record.id;
    INTENDED_USE_ORDER.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = labels[value] || value;
      select.appendChild(option);
    });
    select.value = record.intendedUse || "unspecified";
    label.appendChild(text);
    label.appendChild(select);
    return label;
  }

  function renderImagePreviews() {
    var records = imageManager.getRecords();
    elements.imagePreviews.textContent = "";

    if (!records.length) {
      var empty = document.createElement("p");
      empty.className = "aplus-placeholder";
      empty.textContent = "Nie zaimportowano jeszcze obrazów.";
      elements.imagePreviews.appendChild(empty);
      return;
    }

    records.forEach(function (record) {
      var card = document.createElement("article");
      var thumb = document.createElement("div");
      var meta = document.createElement("dl");
      var useField = document.createElement("div");
      var status = document.createElement("span");
      var reason = document.createElement("p");
      var remove = document.createElement("button");

      card.className = "aplus-image-card";
      thumb.className = "aplus-image-thumb";
      if (record.objectUrl) {
        var image = document.createElement("img");
        image.src = record.objectUrl;
        image.alt = "";
        thumb.appendChild(image);
      } else {
        thumb.textContent = "Wybierz plik lokalny ponownie";
      }
      meta.className = "aplus-image-meta";
      meta.appendChild(metadataRow("Rola", ROLE_LABELS[record.role] || record.role));
      meta.appendChild(metadataRow("Przeznaczenie", intendedUseLabel(record.intendedUse || "unspecified")));
      meta.appendChild(metadataRow("Wymiary", record.width && record.height ? record.width + " × " + record.height + " px" : "-"));
      meta.appendChild(metadataRow("Proporcje", record.aspectRatio ? String(record.aspectRatio) : "-"));
      meta.appendChild(metadataRow("Rozmiar pliku", formatBytes(record.sizeBytes)));
      meta.appendChild(metadataRow("Nazwa pliku", record.filename || "-"));
      useField.className = "aplus-image-use";
      useField.appendChild(createIntendedUseField(record));
      status.className = "aplus-validation-badge";
      status.dataset.status = record.validationStatus || "missing";
      status.textContent = "Status: " + statusLabel(record);
      reason.className = "aplus-image-reason";
      reason.textContent = validationReason(record);
      remove.className = "aplus-button aplus-button-small";
      remove.type = "button";
      remove.dataset.action = "remove-image";
      remove.dataset.imageId = record.id;
      remove.textContent = "Usuń";
      card.appendChild(thumb);
      card.appendChild(meta);
      card.appendChild(useField);
      card.appendChild(status);
      card.appendChild(reason);
      card.appendChild(remove);
      elements.imagePreviews.appendChild(card);
    });
  }

  function syncImageStateAndRender() {
    stateApi.setImportedImages(imageManager.snapshot());
    renderAll();
  }

  function handleImageInput(input) {
    var role = input.dataset.imageInput;
    imageManager.addFiles(input.files, role).then(function (results) {
      var added = results.filter(function (item) { return item.added; }).length;
      var firstError = results.filter(function (item) { return !item.added; })[0];
      var firstValidationIssue = results.filter(function (item) {
        return item.added && item.record && item.record.validationStatus !== "pass";
      })[0];

      input.value = "";
      syncImageStateAndRender();
      if (firstError) {
        showMessage(firstError.error.message, firstError.error.code === "UNSUPPORTED_IMAGE_TYPE" || firstError.error.code === "SAMPLE_LIMIT_REACHED" ? "warning" : "error", false);
      } else if (firstValidationIssue) {
        showMessage(firstValidationIssue.record.validationMessages[0].message, firstValidationIssue.record.validationStatus === "error" ? "error" : "warning", false);
      } else if (added > 0) {
        showMessage("Dodano obraz: " + ROLE_LABELS[role] + ".", "success", false);
      }
    });
  }

  function renderAll() {
    var project = stateApi.getSnapshot();
    var results = validator.validate(project);
    stateApi.setValidationResults(results);
    project = stateApi.getSnapshot();
    renderSummary(project);
    renderModulePicker(project);
    renderSelectedModules(project);
    renderImagePreviews();
    updateBannerPanels(project);
    renderBannerPreview(project, results);
    renderValidation(results);
    renderAsinFeedback(results);
  }

  function resetToProject(project) {
    setControlValues(project);
    renderAll();
  }

  function jsonSafeProject(project) {
    var copy = JSON.parse(JSON.stringify(project));
    copy.importedImages = imageManager.snapshot();
    return copy;
  }

  function saveProject() {
    var project = jsonSafeProject(stateApi.getSnapshot());
    var results = validator.validate(project);
    var critical = results.some(function (item) {
      return item.status === "ERROR" && (
        item.code === "INVALID_PROJECT_STATE" ||
        item.code === "INVALID_PROJECT_STRUCTURE"
      );
    });
    var blob;
    var url;
    var anchor;
    var slug;

    stateApi.setValidationResults(results);
    if (critical) {
      renderAll();
      showMessage("Nie można zapisać JSON, ponieważ wewnętrzny stan projektu jest niepoprawny.", "error", true);
      return;
    }

    slug = stateApi.slugify(project.projectName || project.book.title);
    project.exportSettings.projectSlug = slug;

    try {
      blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json;charset=utf-8" });
      url = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = slug + "-a-plus-project.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showMessage("Zapisano projekt JSON. Uwaga: lokalne obrazy trzeba wybrać ponownie po wczytaniu JSON.", "success", false);
    } catch (error) {
      showMessage("Nie można zapisać projektu JSON: " + error.message, "error", true);
    }
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function bannerProjectSlug(project) {
    return stateApi.slugify(project.projectName || project.book.title || "fenix-a-plus-banner");
  }

  function exportBlockers(project) {
    return validator.validate(project).filter(function (item) {
      return item.group === "Baner A+" && item.status === "ERROR";
    });
  }

  function exportBannerGraphic(format) {
    var project;
    var sourceRecord;
    var blockers;
    var canvas;
    var mime;
    var filename;

    syncStateFromForm();
    project = stateApi.getSnapshot();
    blockers = exportBlockers(project);
    sourceRecord = findBannerSourceRecord(project);

    if (!bannerSelected(project)) {
      showMessage("Eksport jest dostępny po wybraniu modułu Baner z obrazem i tekstem.", "warning", false);
      return;
    }
    if (blockers.length || !sourceRecord || !sourceRecord.objectUrl) {
      renderAll();
      showMessage("Eksport zablokowany: uzupełnij obraz, nagłówek i alt text banera.", "error", true);
      return;
    }

    canvas = document.createElement("canvas");
    mime = format === "jpg" ? "image/jpeg" : "image/png";
    filename = bannerProjectSlug(project) + "-banner-main." + (format === "jpg" ? "jpg" : "png");

    bannerRenderer.render(canvas, project, sourceRecord).then(function () {
      canvas.toBlob(function (blob) {
        if (!blob) {
          showMessage("Nie udało się przygotować pliku eksportu.", "error", true);
          return;
        }
        downloadBlob(blob, filename);
        showMessage("Eksport banera zakończony: " + filename + ".", "success", false);
      }, mime, format === "jpg" ? 0.92 : undefined);
    });
  }

  function exportBannerText() {
    var project;
    var banner;
    var payload;
    var lines;
    var filename;

    syncStateFromForm();
    project = stateApi.getSnapshot();
    if (!bannerSelected(project)) {
      showMessage("Najpierw wybierz moduł Baner z obrazem i tekstem.", "warning", false);
      return;
    }

    banner = currentBanner(project);
    payload = {
      moduleType: BANNER_TYPE,
      headline: banner.headline,
      supportingText: banner.supportingText,
      bullets: banner.bullets.filter(function (item) { return String(item || "").trim(); }),
      extraLine: banner.extraLine,
      altText: banner.altText,
      selectedLayout: banner.layoutPreset,
      selectedSourceImageRole: banner.sourceImageRole,
      selectedSourceImageId: banner.sourceImageId,
      selectedExportSize: banner.canvasSize,
      exportTimestamp: new Date().toISOString()
    };
    lines = [
      "FENIX A+ - teksty modułu banera",
      "moduleType: " + payload.moduleType,
      "headline: " + payload.headline,
      "supportingText: " + payload.supportingText,
      "bullets: " + payload.bullets.join(" | "),
      "extraLine: " + payload.extraLine,
      "altText: " + payload.altText,
      "selectedLayout: " + payload.selectedLayout,
      "selectedSourceImageRole: " + payload.selectedSourceImageRole,
      "selectedSourceImageId: " + payload.selectedSourceImageId,
      "selectedExportSize: " + payload.selectedExportSize,
      "exportTimestamp: " + payload.exportTimestamp
    ];
    filename = bannerProjectSlug(project) + "-banner-text.txt";
    downloadBlob(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }), filename);
    showMessage("Wyeksportowano teksty modułu: " + filename + ".", "success", false);
  }

  function loadProjectFile(file) {
    var reader;

    if (!file) {
      return;
    }

    reader = new FileReader();
    reader.onload = function () {
      var parsed;
      var normalized;

      try {
        parsed = JSON.parse(String(reader.result || ""));
        normalized = stateApi.normalizeProject(parsed);
        stateApi.setProjectState(normalized);
        resetToProject(stateApi.getSnapshot());
        showMessage("Projekt wczytany. Wybierz plik lokalny ponownie dla zapisanych obrazów.", "success", false);
      } catch (error) {
        showMessage("Niepoprawny plik JSON projektu. Obecny projekt nie został zastąpiony.", "error", true);
      } finally {
        byId("aplus-project-file").value = "";
      }
    };
    reader.onerror = function () {
      showMessage("Nie można odczytać wybranego pliku projektu.", "error", true);
      byId("aplus-project-file").value = "";
    };
    reader.readAsText(file, "UTF-8");
  }

  function newProject() {
    if (stateApi.hasUserData() && !global.confirm("Utworzyć nowy projekt i odrzucić bieżące dane formularza?")) {
      return;
    }
    imageManager.revokeAll();
    stateApi.reset();
    resetToProject(stateApi.getSnapshot());
    showMessage("Utworzono nowy projekt.", "success", false);
  }

  function resetProject() {
    if (stateApi.hasUserData() && !global.confirm("Zresetować formularz do wartości domyślnych?")) {
      return;
    }
    imageManager.revokeAll();
    stateApi.reset();
    resetToProject(stateApi.getSnapshot());
    showMessage("Reset zakończony.", "success", false);
  }

  function bindEvents() {
    function handleControlChange(event) {
      var control = event.target;
      if (!control.matches("[data-form] input, [data-form] select, [data-form] textarea, [data-related-asin-input], [data-banner-field], [data-banner-bullet]")) {
        return;
      }

      if (control.id === "aplus-primary-asin" || control.dataset.relatedAsinInput) {
        syncAsinInput(control);
      }

      if (control.id === "aplus-primary-color" || control.id === "aplus-primary-color-hex") {
        syncColorPair(byId("aplus-primary-color"), byId("aplus-primary-color-hex"), control);
      }

      if (control.id === "aplus-secondary-color" || control.id === "aplus-secondary-color-hex") {
        syncColorPair(byId("aplus-secondary-color"), byId("aplus-secondary-color-hex"), control);
      }

      syncStateFromForm();
      if (control.matches("[data-banner-field], [data-banner-bullet]")) {
        showMessage("Konfiguracja banera zaktualizowana.", "info", false);
      }
    }

    document.addEventListener("input", handleControlChange);
    document.addEventListener("change", function (event) {
      var index;
      if (event.target.matches("[data-image-input]")) {
        handleImageInput(event.target);
        return;
      }
      if (event.target.matches("[data-image-use-select]")) {
        imageManager.updateIntendedUse(event.target.dataset.imageUseSelect, event.target.value);
        syncImageStateAndRender();
        showMessage("Zmieniono przeznaczenie obrazu.", "success", false);
        return;
      }
      if (event.target.matches("[data-module-type]")) {
        if (event.target.checked) {
          addModule(event.target.dataset.moduleType);
        } else {
          index = selectedModuleTypes(stateApi.getSnapshot()).indexOf(event.target.dataset.moduleType);
          if (index >= 0) {
            removeModule(index);
          } else {
            renderAll();
          }
        }
        return;
      }
      handleControlChange(event);
    });

    document.addEventListener("click", function (event) {
      var actionButton = event.target.closest("[data-action]");
      var index;
      var removed;
      if (!actionButton) {
        return;
      }

      if (actionButton.dataset.action === "new-project") {
        newProject();
      } else if (actionButton.dataset.action === "save-project") {
        syncStateFromForm();
        saveProject();
      } else if (actionButton.dataset.action === "load-project") {
        byId("aplus-project-file").click();
      } else if (actionButton.dataset.action === "reset-project") {
        resetProject();
      } else if (actionButton.dataset.action === "add-asin") {
        addAsinRow();
      } else if (actionButton.dataset.action === "remove-asin") {
        removeAsinRow(actionButton);
      } else if (actionButton.dataset.action === "module-up") {
        index = Number(actionButton.dataset.index);
        moveModule(index, -1);
      } else if (actionButton.dataset.action === "module-down") {
        index = Number(actionButton.dataset.index);
        moveModule(index, 1);
      } else if (actionButton.dataset.action === "remove-module") {
        index = Number(actionButton.dataset.index);
        removeModule(index);
      } else if (actionButton.dataset.action === "remove-image") {
        removed = imageManager.removeById(actionButton.dataset.imageId);
        syncImageStateAndRender();
        showMessage("Usunięto obraz" + (removed ? ": " + removed.filename : "") + ".", "success", false);
      } else if (actionButton.dataset.action === "export-banner-png") {
        exportBannerGraphic("png");
      } else if (actionButton.dataset.action === "export-banner-jpg") {
        exportBannerGraphic("jpg");
      } else if (actionButton.dataset.action === "export-banner-text") {
        exportBannerText();
      }
    });

    byId("aplus-project-file").addEventListener("change", function (event) {
      loadProjectFile(event.target.files[0]);
    });

    global.addEventListener("beforeunload", function () {
      imageManager.revokeAll();
    });
  }

  function cacheElements() {
    elements.message = query("[data-message]");
    elements.relatedAsins = query("[data-related-asins]");
    elements.validationPanel = query("[data-validation-panel]");
    elements.modulePicker = query("[data-module-picker]");
    elements.selectedModules = query("[data-selected-modules]");
    elements.moduleCount = query("[data-module-count]");
    elements.imagePreviews = query("[data-image-previews]");
    elements.bannerConfig = query("[data-banner-config]");
    elements.bannerTextPanel = query("[data-banner-text-panel]");
    elements.bannerTextPlaceholder = query("[data-banner-text-placeholder]");
    elements.bannerExportPanel = query("[data-banner-export-panel]");
    elements.bannerExportPlaceholder = query("[data-banner-export-placeholder]");
    elements.bannerPreview = byId("aplus-banner-preview");
    elements.bannerPreviewStatus = query("[data-banner-preview-status]");
    elements.bannerSourceFeedback = query("[data-banner-source-feedback]");
  }

  function init() {
    if (!stateApi || !validator || !imageManager || !bannerRenderer) {
      throw new Error("Moduły rdzenia Fenix A+ nie zostały wczytane.");
    }

    cacheElements();
    resetToProject(stateApi.getSnapshot());
    bindEvents();
    showMessage("Przestrzeń robocza Fenix A+ jest gotowa.", "info", false);
  }

  document.addEventListener("DOMContentLoaded", init);

  namespace.App = {
    init: init
  };
  global.FenixAPlus = namespace;
}(window, document));
