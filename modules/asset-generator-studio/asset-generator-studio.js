(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const TYPES = [
    ["animal", "Zwierzę"],
    ["dino", "Dinozaur"],
    ["vehicle", "Pojazd"],
    ["food", "Owoc / jedzenie"],
    ["object", "Przedmiot"],
    ["nature", "Natura / roślina"],
    ["shape", "Kształt / symbol"],
    ["decorative", "Dekoracja"],
    ["education", "Ikona edukacyjna"]
  ];
  const STYLES = [
    ["line-art-coloring", "Line-art coloring"],
    ["gameplay-icon", "Gameplay icon"],
    ["hidden-objects-filler", "Hidden Objects filler"],
    ["matching-icon", "Matching icon"],
    ["simple-silhouette", "Simple silhouette"],
    ["outline-sticker", "Outline sticker"],
    ["decorative-doodle", "Decorative doodle"]
  ];
  const RECOMMENDATION_IDS = [
    ["coloring", "Coloring Studio"],
    ["complete-picture", "Complete the Picture"],
    ["matching", "Matching Studio"],
    ["hidden-objects", "Hidden Objects Studio"],
    ["alphabet", "Alphabet Studio"],
    ["math", "Math Studio"],
    ["logic", "Logic Studio"],
    ["dot-to-dot", "Dot to Dot Studio"],
    ["cover-a-plus", "Cover / A+"],
    ["gameplay", "Gameplay / dekoracje"]
  ];
  const ONLINE_IMAGE_PROVIDERS = {
    pollinations: {
      id: "pollinations",
      label: "Pollinations.ai / test bez klucza",
      buildUrl(prompt, options) {
        const query = new URLSearchParams({
          width: String(options.width || 1024),
          height: String(options.height || 1024),
          seed: String(options.seed || 1),
          nologo: "true"
        });
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${query.toString()}`;
      }
    }
  };
  const RISKY_PROMPT_PHRASES = [
    "Disney",
    "Pixar",
    "Marvel",
    "Nintendo",
    "Pokemon",
    "Pokémon",
    "Star Wars",
    "Harry Potter",
    "LEGO",
    "Barbie",
    "Minecraft",
    "Bluey",
    "Peppa",
    "Paw Patrol",
    "Studio Ghibli",
    "in the style of",
    "famous character"
  ];

  const state = {
    mode: "local",
    activeId: null,
    assets: [],
    onlineResults: [],
    importedObjectUrl: null
  };

  const $ = (id) => document.getElementById(id);

  function init() {
    fillSelect($("agPromptType"), TYPES);
    fillSelect($("agCategory"), TYPES);
    fillSelect($("agPromptStyle"), STYLES);
    fillSelect($("agMetaStyle"), STYLES);
    $("agCategory").value = "dino";
    $("agMetaStyle").value = "gameplay-icon";

    document.querySelectorAll(".ag-mode-button").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    document.querySelectorAll(".ag-range-field input[type='range']").forEach((input) => {
      input.addEventListener("input", () => syncOutput(input));
      syncOutput(input);
    });

    $("agGenerateAsset").addEventListener("click", generateSingleAsset);
    $("agGenerateVariants").addEventListener("click", generateVariants);
    $("agRegeneratePrompt").addEventListener("click", updatePrompt);
    $("agCopyPrompt").addEventListener("click", copyPrompt);
    $("agClearPrompt").addEventListener("click", () => { $("agPromptOutput").value = ""; });
    $("agImportFile").addEventListener("change", importAsset);
    $("agOnlineRandomSeed").addEventListener("click", randomizeOnlineSeed);
    $("agGenerateOnline").addEventListener("click", () => generateOnlineImages(1));
    $("agGenerateOnlineVariants").addEventListener("click", () => generateOnlineImages(clamp(parseInt($("agOnlineVariantCount").value, 10) || 1, 1, 4)));
    $("agClearOnlineResults").addEventListener("click", clearOnlineResults);
    $("agExportSvg").addEventListener("click", exportSvg);
    $("agExportPngTransparent").addEventListener("click", () => exportPng(false));
    $("agExportPngWhite").addEventListener("click", () => exportPng(true));
    $("agExportPack").addEventListener("click", exportAssetPack);
    $("agAssetName").addEventListener("input", () => {
      $("agAssetSlug").value = slugify($("agAssetName").value);
      updateActiveMeta();
    });
    ["agAssetSlug", "agCategory", "agTags", "agMetaStyle", "agPurpose", "agManualStatus", "agNotes"].forEach((id) => {
      $(id).addEventListener("input", updateActiveMeta);
      $(id).addEventListener("change", updateActiveMeta);
    });
    document.querySelectorAll("input[name='agRating']").forEach((input) => {
      input.addEventListener("change", updateActiveMeta);
    });
    ["agPromptType", "agPromptTheme", "agPromptStyle", "agPromptPurpose", "agPromptBackground", "agPromptFormat", "agPromptBw", "agPromptColoring", "agPromptGameplay", "agPromptCover", "agPromptDetail", "agPromptVariants"].forEach((id) => {
      $(id).addEventListener("input", updatePrompt);
      $(id).addEventListener("change", updatePrompt);
    });
    ["agOnlinePrompt", "agOnlineStyle"].forEach((id) => {
      $(id).addEventListener("input", updateOnlinePromptWarning);
      $(id).addEventListener("change", updateOnlinePromptWarning);
    });
    ["agAssetType", "agAssetStyle", "agTheme"].forEach((id) => {
      $(id).addEventListener("change", seedMetaFromControls);
      $(id).addEventListener("input", seedMetaFromControls);
    });

    renderRecommendations();
    updatePrompt();
    updateOnlinePromptWarning();
    generateSingleAsset();
  }

  function fillSelect(select, rows) {
    select.innerHTML = rows.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  }

  function syncOutput(input) {
    const output = input.parentElement.querySelector("output");
    if (output) output.textContent = input.value;
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".ag-mode-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    });
    $("agLocalPanel").hidden = mode !== "local";
    $("agPromptPanel").hidden = mode !== "prompt";
    $("agImportPanel").hidden = mode !== "import";
    $("agOnlinePanel").hidden = mode !== "online";
    if (mode === "prompt") updatePrompt();
    if (mode === "online") syncOnlinePromptFromBuilder();
  }

  function seedMetaFromControls() {
    const style = $("agAssetStyle").value;
    const theme = $("agTheme").value.trim() || $("agAssetType").value;
    $("agAssetName").value = toTitleCase(`${theme} ${style.replace(/-/g, " ")}`);
    $("agAssetSlug").value = slugify($("agAssetName").value);
    $("agCategory").value = $("agAssetType").value;
    $("agMetaStyle").value = style;
    updateActiveMeta();
    renderRecommendations();
  }

  function generateSingleAsset() {
    seedMetaFromControls();
    const seed = clamp(parseInt($("agSeed").value, 10) || 1, 1, 999999);
    const asset = createGeneratedAsset(seed, 1);
    state.assets = [asset];
    setActive(asset.id);
  }

  function generateVariants() {
    seedMetaFromControls();
    const baseSeed = clamp(parseInt($("agSeed").value, 10) || 1, 1, 999999);
    const count = clamp(parseInt($("agVariantCount").value, 10) || 4, 1, 12);
    state.assets = Array.from({ length: count }, (_, index) => createGeneratedAsset(baseSeed + index * 97, index + 1));
    setActive(state.assets[0].id);
  }

  function createGeneratedAsset(seed, index) {
    const type = $("agAssetType").value;
    const style = $("agAssetStyle").value;
    const theme = $("agTheme").value.trim() || type;
    const settings = {
      seed,
      index,
      type,
      style,
      theme,
      detail: parseInt($("agDetail").value, 10),
      stroke: parseInt($("agStroke").value, 10),
      roundness: parseInt($("agRoundness").value, 10),
      simplicity: parseInt($("agSimplicity").value, 10),
      symmetry: parseInt($("agSymmetry").value, 10)
    };
    const svgText = buildSvg(settings);
    const validation = validateGeneratedSvg(svgText);
    return {
      id: `asset-${Date.now()}-${seed}-${index}`,
      source: "local-generator",
      name: $("agAssetName").value,
      slug: withIndex($("agAssetSlug").value, index),
      type,
      style,
      tags: $("agTags").value,
      purpose: $("agPurpose").value,
      rating: getRating(),
      status: validation,
      notes: $("agNotes").value,
      mimeType: "image/svg+xml",
      svgText,
      dataUrl: "",
      width: 1024,
      height: 1024,
      viewBox: "0 0 1024 1024",
      seed,
      createdAt: new Date().toISOString()
    };
  }

  function buildSvg(settings) {
    const rng = mulberry32(settings.seed);
    const stroke = Math.max(4, settings.stroke);
    const fill = settings.style === "simple-silhouette" ? "#111" : "none";
    const innerFill = settings.style === "simple-silhouette" ? "#111" : "#fff";
    const common = `stroke="#111" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" fill="${fill}"`;
    const thin = `stroke="#111" stroke-width="${Math.max(4, Math.round(stroke * 0.62))}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
    const solid = `stroke="#111" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" fill="${innerFill}"`;
    const type = chooseSubtype(settings.type, settings.theme, rng);
    let body = "";
    if (settings.type === "animal") body = animalSvg(type, common, thin, solid, rng);
    else if (settings.type === "dino") body = dinoSvg(common, thin, solid, rng);
    else if (settings.type === "vehicle") body = vehicleSvg(type, common, thin, solid, rng);
    else if (settings.type === "food") body = foodSvg(type, common, thin, solid, rng);
    else if (settings.type === "nature") body = natureSvg(type, common, thin, solid, rng);
    else if (settings.type === "shape") body = shapeSvg(type, common, thin, solid);
    else if (settings.type === "decorative") body = decorativeSvg(common, thin, solid, rng, settings.detail);
    else body = educationSvg(type, common, thin, solid);

    if (settings.style === "outline-sticker") {
      body = `<circle cx="512" cy="512" r="420" stroke="#111" stroke-width="${Math.max(8, stroke * 0.7)}" fill="none" opacity="0.2"/>${body}`;
    }
    return `<svg xmlns="${SVG_NS}" viewBox="0 0 1024 1024" role="img" aria-label="${escapeAttr(settings.theme)} asset">${body}</svg>`;
  }

  function chooseSubtype(type, theme, rng) {
    const lower = theme.toLowerCase();
    const pools = {
      animal: ["cat", "dog", "bunny", "fish", "bird"],
      vehicle: ["car", "truck", "rocket", "boat"],
      food: ["apple", "banana", "carrot", "ice cream"],
      nature: ["leaf", "flower", "tree", "cloud", "sun"],
      shape: ["star", "heart", "circle", "triangle", "diamond", "check", "cross"],
      education: ["book", "pencil", "number", "letter"]
    };
    const pool = pools[type] || ["asset"];
    return pool.find((item) => lower.includes(item) || lower.includes(item.replace(" ", "-"))) || pool[Math.floor(rng() * pool.length)];
  }

  function animalSvg(type, common, thin, solid, rng) {
    if (type === "fish") {
      return `<ellipse cx="474" cy="520" rx="260" ry="150" ${solid}/><polygon points="725,520 890,385 890,655" ${solid}/><circle cx="370" cy="480" r="18" fill="#111"/><path d="M250 522 Q340 610 470 600" ${thin}/><path d="M520 390 Q585 300 660 380" ${thin}/>`;
    }
    if (type === "bird") {
      return `<ellipse cx="510" cy="540" rx="210" ry="155" ${solid}/><circle cx="360" cy="390" r="110" ${solid}/><polygon points="255,390 145,340 145,440" ${solid}/><circle cx="330" cy="360" r="16" fill="#111"/><path d="M515 535 Q650 390 730 570 Q625 610 515 535" ${thin}/><path d="M455 700 L420 820 M560 700 L610 820" ${thin}/>`;
    }
    const ears = type === "bunny"
      ? `<ellipse cx="390" cy="230" rx="55" ry="150" ${solid}/><ellipse cx="555" cy="230" rx="55" ry="150" ${solid}/>`
      : `<polygon points="335,335 395,185 470,340" ${solid}/><polygon points="555,340 635,185 690,338" ${solid}/>`;
    const snout = type === "dog" ? `<ellipse cx="520" cy="545" rx="90" ry="58" ${thin}/>` : `<path d="M470 540 Q512 580 554 540" ${thin}/>`;
    const tail = type === "bunny" ? `<circle cx="730" cy="620" r="54" ${solid}/>` : `<path d="M730 610 Q870 530 780 430" ${thin}/>`;
    return `${ears}<ellipse cx="512" cy="585" rx="245" ry="205" ${solid}/><circle cx="512" cy="420" r="175" ${solid}/><circle cx="450" cy="390" r="18" fill="#111"/><circle cx="575" cy="390" r="18" fill="#111"/><path d="M512 430 L500 468 L530 468 Z" fill="#111"/>${snout}${tail}<path d="M390 755 L345 865 M610 755 L665 865" ${thin}/>${rng() > 0.5 ? `<path d="M330 520 Q230 520 185 455 M690 520 Q790 520 835 455" ${thin}/>` : ""}`;
  }

  function dinoSvg(common, thin, solid, rng) {
    const spikes = rng() > 0.35 ? `<polygon points="365,320 420,220 475,330 535,215 590,335 655,250 685,370" ${solid}/>` : "";
    return `${spikes}<path d="M210 650 Q235 420 445 385 Q675 345 770 510 Q830 615 750 710 Q655 815 430 780 Q330 765 250 725 Q190 700 210 650 Z" ${solid}/><path d="M720 520 Q835 455 900 360 Q880 525 770 600" ${thin}/><circle cx="390" cy="455" r="17" fill="#111"/><path d="M335 520 Q395 565 470 530" ${thin}/><path d="M430 775 L380 900 L500 900 M615 760 L680 900 L775 900" ${thin}/><path d="M250 625 Q125 600 95 480" ${thin}/><path d="M510 575 Q600 610 695 575" ${thin}/>`;
  }

  function vehicleSvg(type, common, thin, solid, rng) {
    if (type === "rocket") {
      return `<path d="M512 105 Q690 275 610 650 L512 780 L414 650 Q335 275 512 105 Z" ${solid}/><circle cx="512" cy="355" r="70" ${thin}/><path d="M414 650 L275 790 L405 775 M610 650 L750 790 L620 775" ${thin}/><path d="M462 790 Q512 930 562 790" ${thin}/>`;
    }
    if (type === "boat") {
      return `<path d="M175 585 L850 585 Q790 765 345 765 Q230 740 175 585 Z" ${solid}/><path d="M505 210 L505 585" ${thin}/><path d="M505 230 L300 545 L505 545 Z" ${solid}/><path d="M525 275 L760 545 L525 545 Z" ${solid}/>`;
    }
    const cargo = type === "truck" ? `<rect x="490" y="380" width="310" height="190" rx="24" ${solid}/>` : `<path d="M330 390 L610 390 Q700 405 745 520 L260 520 Q285 430 330 390 Z" ${solid}/>`;
    return `${cargo}<rect x="195" y="510" width="650" height="160" rx="36" ${solid}/><circle cx="340" cy="690" r="70" ${solid}/><circle cx="700" cy="690" r="70" ${solid}/><circle cx="340" cy="690" r="24" fill="#111"/><circle cx="700" cy="690" r="24" fill="#111"/>${rng() > 0.4 ? `<path d="M300 450 L390 450 M610 450 L700 450" ${thin}/>` : ""}`;
  }

  function foodSvg(type, common, thin, solid, rng) {
    if (type === "banana") return `<path d="M210 585 Q465 835 800 410 Q640 545 425 485 Q305 450 210 585 Z" ${solid}/><path d="M240 570 Q455 710 735 430" ${thin}/>`;
    if (type === "carrot") return `<path d="M455 330 Q660 420 535 865 Q300 585 455 330 Z" ${solid}/><path d="M455 330 Q390 210 300 175 M485 320 Q500 190 615 130 M515 335 Q620 245 735 250" ${thin}/><path d="M420 510 L545 545 M380 650 L505 685" ${thin}/>`;
    if (type === "ice cream") return `<path d="M355 455 Q350 280 512 275 Q675 280 668 455 Q700 470 700 535 Q700 625 512 625 Q325 625 325 535 Q325 470 355 455 Z" ${solid}/><path d="M350 625 L512 910 L675 625 Z" ${solid}/><path d="M430 705 L585 705 M465 780 L555 780" ${thin}/>`;
    return `<path d="M512 300 Q625 205 720 315 Q835 455 710 710 Q620 895 512 800 Q405 895 315 710 Q190 455 305 315 Q400 205 512 300 Z" ${solid}/><path d="M512 300 Q500 205 585 145" ${thin}/><path d="M585 145 Q680 135 720 205 Q635 225 585 145 Z" ${solid}/>${rng() > 0.55 ? `<path d="M410 585 Q505 655 620 585" ${thin}/>` : ""}`;
  }

  function natureSvg(type, common, thin, solid, rng) {
    if (type === "leaf") return `<path d="M175 770 Q405 145 850 230 Q750 735 175 770 Z" ${solid}/><path d="M205 745 Q475 510 820 250 M430 620 Q410 505 345 425 M570 500 Q610 390 710 335" ${thin}/>`;
    if (type === "flower") return `<circle cx="512" cy="405" r="72" ${solid}/><ellipse cx="512" cy="250" rx="70" ry="115" ${solid}/><ellipse cx="650" cy="355" rx="70" ry="115" transform="rotate(55 650 355)" ${solid}/><ellipse cx="600" cy="535" rx="70" ry="115" transform="rotate(135 600 535)" ${solid}/><ellipse cx="425" cy="535" rx="70" ry="115" transform="rotate(45 425 535)" ${solid}/><ellipse cx="375" cy="355" rx="70" ry="115" transform="rotate(125 375 355)" ${solid}/><path d="M512 475 L512 845 M512 700 Q385 610 300 705 M512 725 Q635 630 725 715" ${thin}/>`;
    if (type === "tree") return `<path d="M465 610 L420 875 L610 875 L560 610" ${solid}/><circle cx="380" cy="440" r="145" ${solid}/><circle cx="535" cy="330" r="165" ${solid}/><circle cx="665" cy="470" r="145" ${solid}/>`;
    if (type === "sun") return `<circle cx="512" cy="512" r="190" ${solid}/><path d="M512 140 L512 55 M512 969 L512 884 M140 512 L55 512 M969 512 L884 512 M250 250 L190 190 M834 834 L774 774 M774 250 L834 190 M190 834 L250 774" ${thin}/>${rng() > 0.45 ? `<path d="M420 520 Q512 595 604 520" ${thin}/>` : ""}`;
    return `<path d="M270 650 Q145 635 140 510 Q145 390 275 395 Q330 250 505 275 Q650 190 750 330 Q895 350 900 505 Q905 655 740 655 Z" ${solid}/>`;
  }

  function shapeSvg(type, common, thin, solid) {
    const map = {
      star: `<polygon points="512,145 600,390 860,398 655,555 730,815 512,665 294,815 369,555 164,398 424,390" ${solid}/>`,
      heart: `<path d="M512 820 C300 650 175 535 200 380 C220 255 370 210 512 345 C655 210 805 255 825 380 C850 535 725 650 512 820 Z" ${solid}/>`,
      circle: `<circle cx="512" cy="512" r="300" ${solid}/>`,
      triangle: `<polygon points="512,160 850,820 175,820" ${solid}/>`,
      diamond: `<polygon points="512,130 855,512 512,895 170,512" ${solid}/>`,
      check: `<path d="M190 540 L420 760 L835 275" ${thin}/>`,
      cross: `<path d="M260 260 L764 764 M764 260 L260 764" ${thin}/>`
    };
    return map[type] || map.star;
  }

  function decorativeSvg(common, thin, solid, rng, detail) {
    const items = [];
    const count = Math.max(5, detail + 4);
    for (let i = 0; i < count; i += 1) {
      const x = 150 + Math.round(rng() * 720);
      const y = 150 + Math.round(rng() * 720);
      const r = 25 + Math.round(rng() * 45);
      const kind = Math.floor(rng() * 4);
      if (kind === 0) items.push(`<circle cx="${x}" cy="${y}" r="${r}" ${solid}/>`);
      if (kind === 1) items.push(`<polygon points="${x},${y - r} ${x + r},${y + r} ${x - r},${y + r}" ${solid}/>`);
      if (kind === 2) items.push(`<path d="M${x - r} ${y} Q${x} ${y - r * 2} ${x + r} ${y} Q${x} ${y + r * 2} ${x - r} ${y} Z" ${solid}/>`);
      if (kind === 3) items.push(`<path d="M${x - r} ${y} Q${x} ${y - r} ${x + r} ${y} Q${x} ${y + r} ${x - r} ${y}" ${thin}/>`);
    }
    return items.join("");
  }

  function educationSvg(type, common, thin, solid) {
    if (type === "pencil") return `<path d="M235 760 L700 295 L815 410 L350 875 L210 900 Z" ${solid}/><path d="M700 295 L760 235 L875 350 L815 410 M350 875 L300 810" ${thin}/>`;
    if (type === "number") return `<path d="M380 320 Q510 180 650 300 Q750 405 610 550 L390 790 L720 790" ${thin}/>`;
    if (type === "letter") return `<path d="M260 805 L512 205 L765 805 M360 590 L665 590" ${thin}/>`;
    return `<path d="M240 245 Q390 195 512 270 Q635 195 785 245 L785 800 Q640 755 512 835 Q385 755 240 800 Z" ${solid}/><path d="M512 270 L512 835 M315 340 Q410 315 470 360 M555 360 Q625 315 710 340" ${thin}/>`;
  }

  function validateGeneratedSvg(svgText) {
    const text = String(svgText || "").replace(/\sxmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i, "").toLowerCase();
    const hasViewBox = /<svg[^>]*viewbox=["']0 0 1024 1024["']/i.test(svgText || "");
    const forbidden = text.includes("<image") || text.includes("http://") || text.includes("https://");
    const hasGraphic = /<(path|circle|rect|ellipse|line|polyline|polygon)\b/i.test(svgText || "");
    const hasPaint = /\b(stroke|fill)=["']/i.test(svgText || "");
    return hasViewBox && !forbidden && hasGraphic && hasPaint ? "FENIX_OK" : "NEEDS_REVIEW";
  }

  window.validateGeneratedSvg = validateGeneratedSvg;

  function setActive(id) {
    state.activeId = id;
    const asset = getActiveAsset();
    if (asset) {
      $("agAssetName").value = asset.name;
      $("agAssetSlug").value = asset.slug;
      $("agCategory").value = asset.type;
      $("agMetaStyle").value = asset.style;
      $("agTags").value = asset.tags || "";
      $("agPurpose").value = asset.purpose || "";
      $("agManualStatus").value = asset.status || "NEEDS_REVIEW";
      $("agNotes").value = asset.notes || "";
    }
    renderActive();
    renderGallery();
    renderRecommendations();
  }

  function getActiveAsset() {
    return state.assets.find((asset) => asset.id === state.activeId) || null;
  }

  function updateActiveMeta() {
    const asset = getActiveAsset();
    if (!asset) return;
    asset.name = $("agAssetName").value.trim() || "Fenix asset";
    asset.slug = slugify($("agAssetSlug").value || asset.name);
    $("agAssetSlug").value = asset.slug;
    asset.type = $("agCategory").value;
    asset.style = $("agMetaStyle").value;
    asset.tags = $("agTags").value;
    asset.purpose = $("agPurpose").value;
    asset.rating = getRating();
    asset.status = $("agManualStatus").value;
    asset.notes = $("agNotes").value;
    if (asset.rating === "reject") {
      asset.status = "REJECT_RISK";
      $("agManualStatus").value = "REJECT_RISK";
    }
    renderActive();
    renderGallery();
    renderRecommendations();
  }

  function renderActive() {
    const asset = getActiveAsset();
    const frame = $("agPreviewFrame");
    if (!asset) {
      frame.innerHTML = "<span>Wygeneruj lub zaimportuj asset.</span>";
      $("agActiveSummary").textContent = "Brak aktywnego assetu.";
      setStatus("NEEDS_REVIEW");
      return;
    }
    frame.innerHTML = "";
    if (asset.mimeType === "image/svg+xml") {
      frame.innerHTML = asset.svgText;
      $("agSvgExportHint").textContent = "Eksport SVG dostępny dla aktywnego SVG.";
      $("agExportSvg").disabled = false;
    } else {
      const img = document.createElement("img");
      img.src = asset.dataUrl;
      img.alt = asset.name;
      frame.appendChild(img);
      $("agSvgExportHint").textContent = "Ten asset jest PNG. Eksport SVG dostępny tylko dla assetów SVG.";
      $("agExportSvg").disabled = true;
    }
    $("agActiveSummary").textContent = `${asset.name} · ${asset.mimeType} · seed ${asset.seed || "import"}`;
    setStatus(asset.status || "NEEDS_REVIEW");
  }

  function setStatus(status) {
    const badge = $("agSvgStatus");
    badge.textContent = status;
    badge.classList.toggle("is-ok", status === "FENIX_OK");
    badge.classList.toggle("is-risk", status === "REJECT_RISK");
  }

  function renderGallery() {
    const gallery = $("agVariantGallery");
    gallery.innerHTML = "";
    state.assets.forEach((asset, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ag-variant${asset.id === state.activeId ? " is-active" : ""}`;
      button.innerHTML = `<div class="ag-variant-thumb">${asset.mimeType === "image/svg+xml" ? asset.svgText : `<img src="${asset.dataUrl}" alt="">`}</div><strong>Wariant ${index + 1}</strong><span>Seed: ${asset.seed || "import"}</span>`;
      button.addEventListener("click", () => setActive(asset.id));
      gallery.appendChild(button);
    });
  }

  function renderRecommendations() {
    const style = $("agMetaStyle").value || $("agAssetStyle").value;
    const type = $("agCategory").value || $("agAssetType").value;
    const activeAsset = getActiveAsset();
    const recommended = new Set();
    let warnings = [
      "Zbyt szczegółowy asset może być słabo czytelny w Hidden Objects.",
      "Asset z dużą ilością cieniowania może nie nadawać się do Coloring.",
      "Asset realistyczny może być dobry do Cover/A+, ale mniej dobry do prostych worksheetów.",
      "Do KDP B/W najlepiej sprawdzają się czytelne kontury i mocny kształt."
    ];
    if (activeAsset && activeAsset.source === "online-generator") {
      if (activeAsset.onlineStyle === "coloring-line-art") {
        ["coloring", "complete-picture", "alphabet"].forEach((id) => recommended.add(id));
        warnings = ["Sprawdź, czy linie są czyste i czy obraz nie zawiera szarych cieni.", "Wyniki online domyślnie wymagają ręcznej kontroli przed KDP."];
      } else if (activeAsset.onlineStyle === "gameplay-icon") {
        ["matching", "hidden-objects", "logic", "alphabet", "math"].forEach((id) => recommended.add(id));
        warnings = ["Sprawdź czytelność po zmniejszeniu.", "Usuń wynik, jeśli zawiera tekst, watermark albo nieczytelny detal."];
      } else if (activeAsset.onlineStyle === "cover-a-plus") {
        ["cover-a-plus", "gameplay"].forEach((id) => recommended.add(id));
        warnings = ["Nie używaj jako coloring bez konwersji do czystego line-art.", "Sprawdź bezpieczeństwo prawne i brak podobieństwa do znanych postaci."];
      } else if (activeAsset.onlineStyle === "semi-realistic") {
        ["cover-a-plus", "hidden-objects"].forEach((id) => recommended.add(id));
        warnings = ["Asset realistyczny może być za szczegółowy do worksheetów B/W.", "Do Hidden Objects używaj dopiero po sprawdzeniu czytelności i uproszczeniu."];
      } else {
        recommended.add("hidden-objects");
        warnings = ["Sprawdź, czy drobny asset jest czytelny na stronie search and find.", "Wyniki online domyślnie wymagają ręcznej kontroli przed KDP."];
      }
    } else {
      if (style === "line-art-coloring") ["coloring", "complete-picture"].forEach((id) => recommended.add(id));
      if (style === "gameplay-icon") ["matching", "hidden-objects", "logic", "alphabet", "gameplay"].forEach((id) => recommended.add(id));
      if (style === "hidden-objects-filler") recommended.add("hidden-objects");
      if (style === "matching-icon" || style === "simple-silhouette") recommended.add("matching");
      if (style === "decorative-doodle") ["hidden-objects", "cover-a-plus", "gameplay"].forEach((id) => recommended.add(id));
      if (type === "education") ["alphabet", "math", "logic"].forEach((id) => recommended.add(id));
      if (!recommended.size) ["matching", "hidden-objects"].forEach((id) => recommended.add(id));
    }

    $("agRecommendations").innerHTML = RECOMMENDATION_IDS.map(([id, label]) => `<label><input type="checkbox" value="${id}" ${recommended.has(id) ? "checked" : ""}> ${label}</label>`).join("");
    $("agWarnings").innerHTML = warnings.map((text) => `<p>${text}</p>`).join("");
  }

  function updatePrompt() {
    const theme = $("agPromptTheme").value.trim() || "cute dinosaur";
    const style = $("agPromptStyle").value;
    const purpose = $("agPromptPurpose").value;
    const background = $("agPromptBackground").value;
    const format = $("agPromptFormat").value;
    const detail = parseInt($("agPromptDetail").value, 10);
    const variants = parseInt($("agPromptVariants").value, 10) || 1;
    const detailText = detail <= 3 ? "very simple" : detail <= 7 ? "balanced simple" : "more detailed but still readable";
    let prompt;
    if (style === "line-art-coloring") {
      prompt = `Clean black and white coloring page asset of a ${theme}, simple bold outlines, isolated object, ${background}, no shading, no color, kid-friendly, printable, high readability, no text, no watermark.`;
    } else if (style === "gameplay-icon" || purpose === "gameplay") {
      prompt = `Simple black and white gameplay icon of a ${theme}, clean silhouette, strong outline, isolated object, ${background}, readable at small size, suitable for kids activity books, no text, no watermark.`;
    } else if (style === "hidden-objects-filler" || purpose === "hidden") {
      prompt = `Small black and white decorative filler asset of a ${theme}, simple outline, isolated object, printable, suitable for search and find activity pages, no text, no watermark.`;
    } else if (purpose === "cover" || $("agPromptCover").checked) {
      prompt = `Cute semi-realistic children's book style ${theme} object, isolated on white background, clean shape, high quality, suitable for KDP cover and A+ content, original generic character, no trademark, no text, no watermark.`;
    } else {
      prompt = `Clean printable black and white asset of a ${theme}, ${detailText} detail, ${format}, ${background}, strong readable shape, kid-friendly activity book style, no text, no watermark.`;
    }
    const constraints = [];
    if ($("agPromptBw").checked) constraints.push("black and white print safe");
    if ($("agPromptColoring").checked) constraints.push("coloring friendly");
    if ($("agPromptGameplay").checked) constraints.push("readable as a gameplay icon");
    if ($("agPromptCover").checked) constraints.push("suitable for cover or A+ decoration");
    $("agPromptOutput").value = `${prompt} Create ${variants} variant${variants === 1 ? "" : "s"}. Requirements: ${constraints.join(", ") || "generic original asset"}, original generic design, no brands, no known characters, no franchise references.`;
  }

  function copyPrompt() {
    const prompt = $("agPromptOutput").value;
    if (navigator.clipboard && prompt) {
      navigator.clipboard.writeText(prompt).catch(() => {});
    }
  }

  function syncOnlinePromptFromBuilder() {
    if ($("agOnlinePrompt").value.trim()) {
      updateOnlinePromptWarning();
      return;
    }
    $("agOnlinePrompt").value = $("agPromptOutput").value.trim() || "cute baby dinosaur, clean black and white line art, isolated object, white background, no text, no watermark";
    updateOnlinePromptWarning();
  }

  function sanitizePromptText(text) {
    let sanitized = String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 600);
    const detected = [];
    RISKY_PROMPT_PHRASES.forEach((phrase) => {
      const pattern = new RegExp(escapeRegExp(phrase), "ig");
      if (pattern.test(sanitized)) {
        detected.push(phrase);
        sanitized = sanitized.replace(pattern, "generic original");
      }
    });
    sanitized = sanitized.replace(/\s+/g, " ").trim();
    return {
      text: sanitized || "cute generic kids activity book asset",
      detected
    };
  }

  function buildOnlineImagePrompt(userPrompt, style) {
    const cleaned = sanitizePromptText(userPrompt);
    const stylePrompts = {
      "coloring-line-art": "clean black and white line art, bold simple outlines, no shading, no color, white background, coloring page asset",
      "gameplay-icon": "simple clean icon, strong silhouette, readable at small size, black and white, isolated object",
      "hidden-objects-filler": "small decorative filler object, simple outline, readable in search and find pages, black and white",
      "cover-a-plus": "cute children's book style, polished object, clean shape, isolated on white background, no text, no watermark",
      "semi-realistic": "semi-realistic but child-friendly, clean isolated object, high readability, not too detailed, white background"
    };
    const safety = "original generic design, no brands, no known characters, no franchise references, no text, no watermark, isolated object, suitable for kids activity books, KDP print safe";
    return {
      prompt: `${cleaned.text}, ${stylePrompts[style] || stylePrompts["coloring-line-art"]}, ${safety}`,
      detected: cleaned.detected
    };
  }

  window.buildOnlineImagePrompt = buildOnlineImagePrompt;
  window.sanitizePromptText = sanitizePromptText;

  function updateOnlinePromptWarning() {
    const safe = buildOnlineImagePrompt($("agOnlinePrompt").value, $("agOnlineStyle").value);
    $("agOnlinePromptWarning").hidden = safe.detected.length === 0;
  }

  function randomizeOnlineSeed() {
    $("agOnlineSeed").value = String(1 + Math.floor(Math.random() * 999999));
  }

  async function generateOnlineImages(count) {
    const provider = ONLINE_IMAGE_PROVIDERS[$("agOnlineProvider").value] || ONLINE_IMAGE_PROVIDERS.pollinations;
    const size = clamp(parseInt($("agOnlineSize").value, 10) || 1024, 512, 1024);
    const baseSeed = clamp(parseInt($("agOnlineSeed").value, 10) || 1, 1, 999999);
    const safe = buildOnlineImagePrompt($("agOnlinePrompt").value, $("agOnlineStyle").value);
    $("agOnlinePromptWarning").hidden = safe.detected.length === 0;
    setOnlineStatus("Generowanie...");
    setOnlineButtonsDisabled(true);

    try {
      for (let index = 0; index < count; index += 1) {
        const seed = baseSeed + index * 101;
        const result = await generateOnlineImageWithPollinations(safe.prompt, {
          provider,
          seed,
          width: size,
          height: size,
          userPrompt: $("agOnlinePrompt").value,
          style: $("agOnlineStyle").value
        });
        state.onlineResults.unshift(result);
        renderOnlineResults();
      }
      setOnlineStatus("Sukces");
    } catch (error) {
      const message = navigator.onLine === false ? "Brak internetu / provider niedostępny" : "Błąd generowania";
      setOnlineStatus(`${message}: ${error.message || "nieznany błąd"}`);
    } finally {
      setOnlineButtonsDisabled(false);
    }
  }

  async function generateOnlineImageWithPollinations(prompt, options) {
    const provider = options.provider || ONLINE_IMAGE_PROVIDERS.pollinations;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    const url = provider.buildUrl(prompt, options);
    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store"
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") throw new Error("timeout providera");
      throw new Error(navigator.onLine === false ? "brak internetu" : "provider niedostępny");
    }
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`provider zwrócił HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) throw new Error("provider nie zwrócił obrazu");
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    return {
      id: `online-${Date.now()}-${options.seed}`,
      provider: provider.id,
      providerLabel: provider.label,
      status: "Sukces",
      seed: options.seed,
      width: options.width,
      height: options.height,
      style: options.style,
      userPrompt: options.userPrompt,
      safePrompt: prompt,
      dataUrl,
      createdAt: new Date().toISOString()
    };
  }

  window.generateOnlineImageWithPollinations = generateOnlineImageWithPollinations;

  function renderOnlineResults() {
    const container = $("agOnlineResults");
    if (!state.onlineResults.length) {
      container.innerHTML = '<p class="ag-small">Brak wyników online.</p>';
      return;
    }
    container.innerHTML = "";
    state.onlineResults.forEach((result) => {
      const card = document.createElement("article");
      card.className = "ag-online-result";
      card.innerHTML = `
        <div class="ag-online-result-thumb"><img src="${result.dataUrl}" alt="Wynik online"></div>
        <strong>${escapeHtml(result.providerLabel)} · ${result.width}×${result.height}</strong>
        <span>Seed: ${result.seed} · Status: ${result.status}</span>
        <p>Sprawdź jakość przed użyciem w KDP.</p>
        <div class="ag-online-result-actions">
          <button class="ag-button ag-button-secondary" type="button" data-online-action="activate" data-online-id="${result.id}">Ustaw jako aktywny asset</button>
          <button class="ag-button ag-button-quiet" type="button" data-online-action="download" data-online-id="${result.id}">Pobierz PNG</button>
        </div>
      `;
      container.appendChild(card);
    });
    container.querySelectorAll("[data-online-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const result = state.onlineResults.find((item) => item.id === button.dataset.onlineId);
        if (!result) return;
        if (button.dataset.onlineAction === "activate") activateOnlineResult(result);
        if (button.dataset.onlineAction === "download") downloadBlob(dataUrlToBlob(result.dataUrl), `${onlineResultSlug(result)}.png`, "image/png");
      });
    });
  }

  function activateOnlineResult(result) {
    const slug = onlineResultSlug(result);
    const style = onlineStyleToAssetStyle(result.style);
    const asset = {
      id: `asset-${result.id}`,
      source: "online-generator",
      provider: result.provider,
      name: toTitleCase(slug.replace(/-/g, " ")),
      slug,
      type: "dino",
      style,
      tags: "online, generated, needs review",
      purpose: onlineStyleToPurpose(result.style),
      onlineStyle: result.style,
      rating: getRating(),
      status: "NEEDS_REVIEW",
      notes: "Wynik online: sprawdź jakość, czytelność, brak tekstu, brak watermarka i bezpieczeństwo prawne.",
      mimeType: "image/png",
      svgText: "",
      dataUrl: result.dataUrl,
      prompt: result.userPrompt,
      safePrompt: result.safePrompt,
      width: result.width,
      height: result.height,
      viewBox: "",
      seed: result.seed,
      createdAt: result.createdAt
    };
    state.assets.unshift(asset);
    $("agAssetName").value = asset.name;
    $("agAssetSlug").value = asset.slug;
    $("agCategory").value = asset.type;
    $("agMetaStyle").value = asset.style;
    $("agTags").value = asset.tags;
    $("agPurpose").value = asset.purpose;
    $("agManualStatus").value = "NEEDS_REVIEW";
    $("agNotes").value = asset.notes;
    setActive(asset.id);
    setOnlineStatus("Obraz załadowany jako aktywny asset");
  }

  function clearOnlineResults() {
    state.onlineResults = [];
    renderOnlineResults();
    setOnlineStatus("Gotowy");
  }

  function setOnlineStatus(message) {
    $("agOnlineStatus").textContent = message;
  }

  function setOnlineButtonsDisabled(disabled) {
    ["agGenerateOnline", "agGenerateOnlineVariants", "agOnlineRandomSeed", "agClearOnlineResults"].forEach((id) => {
      $(id).disabled = disabled;
    });
  }

  function importAsset(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (state.importedObjectUrl) URL.revokeObjectURL(state.importedObjectUrl);
    const reader = new FileReader();
    reader.onload = () => {
      const name = file.name.replace(/\.[^.]+$/, "");
      const slug = slugify(name);
      if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
        const svgText = String(reader.result || "");
        const validation = validateGeneratedSvg(svgText);
        const asset = makeImportedAsset(file, name, slug, "image/svg+xml", svgText, "", validation);
        state.assets.unshift(asset);
        $("agImportInfo").textContent = `${file.name} · SVG · status ${validation}`;
        setActive(asset.id);
      } else {
        const dataUrl = String(reader.result || "");
        inspectPng(dataUrl, file, (info) => {
          const status = info.tooSmall ? "NEEDS_REVIEW" : "FENIX_OK";
          const asset = makeImportedAsset(file, name, slug, "image/png", "", dataUrl, status);
          asset.width = info.width;
          asset.height = info.height;
          asset.hasTransparency = info.hasTransparency;
          state.assets.unshift(asset);
          $("agImportInfo").textContent = `${file.name} · PNG · ${info.width}×${info.height} · przezroczystość: ${info.hasTransparency ? "tak" : "nie"} · ${info.tooSmall ? "bardzo mały / do sprawdzenia" : "nadaje się jako asset"}`;
          setActive(asset.id);
        });
      }
    };
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) reader.readAsText(file);
    else reader.readAsDataURL(file);
  }

  function makeImportedAsset(file, name, slug, mimeType, svgText, dataUrl, status) {
    return {
      id: `import-${Date.now()}-${Math.round(Math.random() * 9999)}`,
      source: "ai-result-import",
      name,
      slug,
      type: $("agCategory").value,
      style: $("agMetaStyle").value,
      tags: $("agTags").value,
      purpose: $("agPurpose").value,
      rating: getRating(),
      status,
      notes: $("agNotes").value,
      mimeType,
      svgText,
      dataUrl,
      width: 1024,
      height: 1024,
      viewBox: mimeType === "image/svg+xml" ? extractViewBox(svgText) : "",
      fileName: file.name,
      createdAt: new Date().toISOString()
    };
  }

  function inspectPng(dataUrl, file, done) {
    const img = new Image();
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let hasTransparency = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) {
          hasTransparency = true;
          break;
        }
      }
      done({ width: img.naturalWidth, height: img.naturalHeight, hasTransparency, tooSmall: img.naturalWidth < 256 || img.naturalHeight < 256 });
    };
    img.onerror = () => done({ width: 0, height: 0, hasTransparency: false, tooSmall: true });
    img.src = dataUrl;
  }

  function exportSvg() {
    const asset = getActiveAsset();
    if (!asset || asset.mimeType !== "image/svg+xml") return;
    downloadBlob(asset.svgText, `${asset.slug || "fenix-asset"}.svg`, "image/svg+xml");
  }

  function exportPng(whiteBackground) {
    const asset = getActiveAsset();
    if (!asset) return;
    const size = parseInt($("agPngSize").value, 10) || 1024;
    renderAssetToCanvas(asset, size, whiteBackground, (canvas) => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const suffix = whiteBackground ? "white" : "transparent";
        downloadBlob(blob, `${asset.slug || "fenix-asset"}-${size}-${suffix}.png`, "image/png");
      }, "image/png");
    });
  }

  function renderAssetToCanvas(asset, size, whiteBackground, done) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (whiteBackground) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight) * 0.9;
      const width = img.naturalWidth * scale;
      const height = img.naturalHeight * scale;
      ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
      done(canvas);
      URL.revokeObjectURL(img.src);
    };
    if (asset.mimeType === "image/svg+xml") {
      const blob = new Blob([asset.svgText], { type: "image/svg+xml" });
      img.src = URL.createObjectURL(blob);
    } else {
      img.src = asset.dataUrl;
    }
  }

  function exportAssetPack() {
    const createdAt = new Date();
    const pack = {
      fenixAssetPackVersion: 1,
      packType: "fenix_assets",
      createdAt: createdAt.toISOString(),
      sourceModule: "asset-generator-studio",
      assets: state.assets.map((asset) => ({
        id: asset.id,
        source: asset.source || "",
        provider: asset.provider || "",
        name: asset.name,
        slug: asset.slug,
        type: asset.type,
        style: asset.style,
        onlineStyle: asset.onlineStyle || "",
        recommendedFor: getRecommendedFor(),
        status: asset.status,
        notes: asset.notes,
        mimeType: asset.mimeType,
        svgText: asset.mimeType === "image/svg+xml" ? asset.svgText : undefined,
        dataUrl: asset.mimeType === "image/png" ? asset.dataUrl : undefined,
        prompt: asset.prompt || "",
        safePrompt: asset.safePrompt || "",
        seed: asset.seed || "",
        width: asset.width || 1024,
        height: asset.height || 1024,
        viewBox: asset.viewBox || "",
        createdAt: asset.createdAt
      }))
    };
    const stamp = formatStamp(createdAt);
    downloadBlob(JSON.stringify(pack, null, 2), `fenix-asset-pack-${stamp}.fenixassetpack`, "application/json");
  }

  function getRecommendedFor() {
    return Array.from(document.querySelectorAll("#agRecommendations input:checked")).map((input) => input.value);
  }

  function onlineResultSlug(result) {
    return withIndex(slugify(`online ${result.style || "asset"} ${result.seed || "seed"}`), 1);
  }

  function onlineStyleToAssetStyle(style) {
    const map = {
      "coloring-line-art": "line-art-coloring",
      "gameplay-icon": "gameplay-icon",
      "hidden-objects-filler": "hidden-objects-filler",
      "cover-a-plus": "decorative-doodle",
      "semi-realistic": "outline-sticker"
    };
    return map[style] || "gameplay-icon";
  }

  function onlineStyleToPurpose(style) {
    const map = {
      "coloring-line-art": "coloring, complete picture",
      "gameplay-icon": "matching, hidden objects, logic",
      "hidden-objects-filler": "hidden objects",
      "cover-a-plus": "cover, A+, dekoracje",
      "semi-realistic": "cover, A+, hidden objects po sprawdzeniu"
    };
    return map[style] || "asset review";
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("nie udało się odczytać obrazu"));
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(",");
    const meta = parts[0] || "";
    const data = atob(parts[1] || "");
    const mimeMatch = meta.match(/data:([^;]+);base64/i);
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 1) {
      bytes[i] = data.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeMatch ? mimeMatch[1] : "image/png" });
  }

  function downloadBlob(content, filename, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.startsWith("fenix-") ? filename : `fenix-${filename}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function slugify(value) {
    return String(value || "fenix-asset")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ł/g, "l")
      .replace(/Ł/g, "l")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "fenix-asset";
  }

  function withIndex(slug, index) {
    const clean = slugify(slug);
    return `${clean}-${String(index).padStart(3, "0")}`;
  }

  function getRating() {
    const checked = document.querySelector("input[name='agRating']:checked");
    return checked ? checked.value : "like";
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toTitleCase(value) {
    return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }

  function escapeAttr(value) {
    return String(value).replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function extractViewBox(svgText) {
    const match = String(svgText || "").match(/viewBox=["']([^"']+)["']/i);
    return match ? match[1] : "";
  }

  function formatStamp(date) {
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
