(function () {
  "use strict";

  const QA_FIX_VERSION = "2026.07.30-2";
  let installed = false;
  let attempts = 0;

  function el(id) {
    return document.getElementById(id);
  }

  function readBool(id, fallback) {
    const node = el(id);
    if (!node) return !!fallback;
    if (node.type === "checkbox" || node.type === "radio") return !!node.checked;
    const value = String(node.value == null ? "" : node.value).trim().toLowerCase();
    if (["true", "tak", "yes", "1", "on", "enabled", "włączone"].includes(value)) return true;
    if (["false", "nie", "no", "0", "off", "disabled", "wyłączone", ""].includes(value)) return false;
    return !!fallback;
  }

  function getMazeCount() {
    const node = el("mazeCount");
    const value = Number(node && node.value);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
  }

  function replaceCountToken(text, count) {
    let value = String(text || "");
    value = value.replace(/\{\{?count\}?\}/gi, String(count));
    if (/\b\d+\b/.test(value) && /(maze|mazes|mission|missions|labirynt|labirynty)/i.test(value)) {
      value = value.replace(/\b\d+\b/, String(count));
    }
    return value;
  }

  function insertFieldAfter(reference, id, labelText, defaultValue, noteText) {
    if (!reference || el(id)) return el(id);
    const host = reference.parentElement;
    if (!host) return null;

    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = labelText;

    const input = document.createElement("input");
    input.id = id;
    input.type = "text";
    input.value = defaultValue || "";

    host.insertBefore(label, reference.nextSibling);
    host.insertBefore(input, label.nextSibling);

    if (noteText) {
      const note = document.createElement("p");
      note.className = "note";
      note.textContent = noteText;
      host.insertBefore(note, input.nextSibling);
    }
    return input;
  }

  function injectContentControls() {
    const certificateTitle = el("certificateTitle");
    insertFieldAfter(
      certificateTitle,
      "certificateSubtitle",
      "Podtytuł certyfikatu",
      "Activity Book Achievement",
      "Ten tekst trafia bezpośrednio pod tytuł certyfikatu. Nie jest już narzucony jako Maze Adventure Achievement."
    );

    const moreBooksText = el("moreBooksText");
    insertFieldAfter(
      moreBooksText,
      "congratsSeriesText",
      "Opcjonalna lista innych serii",
      "",
      "Pozostaw puste, aby nie drukować starej listy Space / Dino / Jungle / Farm / Puppy / Knight."
    );

    const footer = el("missionTrackerFooter");
    if (footer && !el("missionTrackerDynamicCountNote")) {
      const note = document.createElement("p");
      note.id = "missionTrackerDynamicCountNote";
      note.className = "note";
      note.textContent = "Przy automatycznej liczbie gwiazdek liczba w tym tekście jest synchronizowana z aktualną liczbą labiryntów. Możesz też użyć znacznika {count}.";
      footer.insertAdjacentElement("afterend", note);
    }
  }

  function syncTrackerFooter() {
    if (!readBool("missionTrackerUseAutoCount", true)) return;
    const footer = el("missionTrackerFooter");
    if (!footer) return;
    const updated = replaceCountToken(footer.value, getMazeCount());
    if (updated !== footer.value) footer.value = updated;
  }

  function drawCenteredText(ctx, text, y, font, color) {
    if (!text) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color || "#111827";
    ctx.font = font || "36px Arial";
    ctx.fillText(String(text), 1275, y, 1900);
    ctx.restore();
  }

  function installDrawingPatches() {
    if (typeof window.drawCongratsPage === "function" && !window.drawCongratsPage.__fenixQaPatched) {
      const original = window.drawCongratsPage;
      const patched = function (ctx, settings) {
        original(ctx, settings);
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(260, 2540, 2030, 190);
        if (settings.congratsSeriesText) {
          drawCenteredText(ctx, settings.congratsSeriesText, 2630, "34px Arial", "#6b7280");
        }
        ctx.restore();
      };
      patched.__fenixQaPatched = true;
      window.drawCongratsPage = patched;
    }

    if (typeof window.drawCertificatePage === "function" && !window.drawCertificatePage.__fenixQaPatched) {
      const original = window.drawCertificatePage;
      const patched = function (ctx, settings) {
        original(ctx, settings);
        if (!settings.certificateUseCreatorMark) {
          ctx.save();
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(560, 2660, 1430, 360);
          ctx.restore();
        }
      };
      patched.__fenixQaPatched = true;
      window.drawCertificatePage = patched;
    }

    if (typeof window.drawMazePage === "function" && !window.drawMazePage.__fenixQaPatched) {
      const original = window.drawMazePage;
      const patched = function (ctx, settings, mazeData, isSolution) {
        original(ctx, settings, mazeData, isSolution);

        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(300, 3040, 1950, 220);

        if (isSolution) {
          ctx.fillRect(260, 130, 2030, 330);
          const mazeLabel = String(settings.mazePrefix || "Maze") + " " + String(mazeData && mazeData.index || "");
          const solutionLabel = String(settings.solutionTitle || settings.solutionPrefix || "Solution");
          drawCenteredText(ctx, mazeLabel + " - " + solutionLabel, 260, "bold 62px Arial", "#111827");
          drawCenteredText(ctx, settings.solutionSubtitle || "Follow the dashed path to check your answer.", 355, "34px Arial", "#374151");
        }
        ctx.restore();
      };
      patched.__fenixQaPatched = true;
      window.drawMazePage = patched;
    }
  }

  function hasBasketSource(sourceModule) {
    if (typeof window.getAvailableFenixPages !== "function") return false;
    return window.getAvailableFenixPages().some(function (page) {
      return page && page.includeInBook !== false && page.sourceModule === sourceModule && !(window.isFenixSolutionPage && window.isFenixSolutionPage(page));
    });
  }

  function buildQaWarnings(settings) {
    const warnings = [];
    const mazeCount = Number(settings.mazeCount || getMazeCount());
    const footer = String(settings.missionTrackerFooter || "");
    const numberMatch = footer.match(/\b(\d+)\b/);

    if (settings.includeMissionTracker && settings.missionTrackerUseAutoCount && numberMatch && Number(numberMatch[1]) !== mazeCount) {
      warnings.push("Tracker ma " + mazeCount + " gwiazdek, ale tekst stopki mówi o " + numberMatch[1] + ".");
    }

    if (/\bcount\b/i.test(String(settings.howToLines || "")) && !hasBasketSource("math-studio")) {
      warnings.push("Instrukcja zawiera słowo 'count', ale w Koszyku nie wykryto stron z Math Studio.");
    }

    if (settings.certificateUseCreatorMark && !(window.MBG && window.MBG.assets && window.MBG.assets.creatorMark)) {
      warnings.push("Znak autora jest włączony, ale nie wczytano grafiki - certyfikat pokaże linię podpisu.");
    }

    if (!settings.includeSolutions && typeof window.getEnabledFenixBasketSolutionPlanPages === "function" && window.getEnabledFenixBasketSolutionPlanPages().length) {
      warnings.push("Koszyk zawiera rozwiązania, ale przełącznik rozwiązań jest wyłączony - nie trafią do PDF.");
    }

    return warnings;
  }

  function renderQaPanel() {
    if (typeof window.readSettings !== "function") return;
    let panel = el("mbgQaConsistencyPanel");
    const plan = el("mbgFinalPlanSummary");
    const generateBox = document.querySelector(".generate-box");
    const anchor = plan || generateBox;
    if (!anchor || !anchor.parentElement) return;

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "mbgQaConsistencyPanel";
      panel.className = "mbg-qa-consistency-panel";
      anchor.insertAdjacentElement("afterend", panel);
    }

    const settings = window.readSettings();
    const warnings = buildQaWarnings(settings);
    panel.classList.toggle("has-warning", warnings.length > 0);
    panel.replaceChildren();

    const title = document.createElement("strong");
    title.textContent = warnings.length ? "Kontrola spójności: " + warnings.length + " ostrzeżenie/ostrzeżenia" : "Kontrola spójności: bez wykrytych konfliktów";
    panel.appendChild(title);

    if (warnings.length) {
      const list = document.createElement("ul");
      warnings.forEach(function (warning) {
        const item = document.createElement("li");
        item.textContent = warning;
        list.appendChild(item);
      });
      panel.appendChild(list);
    } else {
      const note = document.createElement("p");
      note.textContent = "Liczba trackerów, sekcja rozwiązań i pola końcowe są zgodne z aktualnym planem eksportu.";
      panel.appendChild(note);
    }
  }


  function install() {
    if (installed) return;
    attempts += 1;
    if (typeof window.readSettings !== "function" || typeof window.drawCongratsPage !== "function" || typeof window.drawCertificatePage !== "function" || typeof window.drawMazePage !== "function") {
      if (attempts < 100) window.setTimeout(install, 50);
      return;
    }

    installed = true;
    injectContentControls();

    const previousReadSettings = window.readSettings;
    window.readSettings = function () {
      const settings = previousReadSettings();
      settings.missionTrackerFooter = replaceCountToken(settings.missionTrackerFooter, settings.mazeCount);
      settings.certificateSubtitle = String((el("certificateSubtitle") && el("certificateSubtitle").value) || settings.certificateSubtitle || "Activity Book Achievement").trim();
      settings.congratsSeriesText = String((el("congratsSeriesText") && el("congratsSeriesText").value) || "").trim();
      return settings;
    };

    installDrawingPatches();
    syncTrackerFooter();
    renderQaPanel();

    ["mazeCount", "missionTrackerUseAutoCount", "missionTrackerFooter"].forEach(function (id) {
      const node = el(id);
      if (!node) return;
      node.addEventListener("change", function () {
        syncTrackerFooter();
        renderQaPanel();
      });
      node.addEventListener("input", function () {
        syncTrackerFooter();
        renderQaPanel();
      });
    });

    document.addEventListener("change", function () {
      window.setTimeout(renderQaPanel, 0);
    }, true);

    document.addEventListener("input", function () {
      window.setTimeout(renderQaPanel, 0);
    }, true);

    const badgeHost = document.querySelector(".hero-badges") || document.querySelector("header");
    if (badgeHost && !el("mbgQaFixVersionBadge")) {
      const badge = document.createElement("span");
      badge.id = "mbgQaFixVersionBadge";
      badge.className = "mbg-fix-version-badge";
      badge.textContent = "QA FIX " + QA_FIX_VERSION;
      badgeHost.appendChild(badge);
    }

    console.info("FENIX Book Builder QA fixes active:", QA_FIX_VERSION);
  }

  install();
})();
