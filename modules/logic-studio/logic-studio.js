(function () {
  "use strict";

  const EXPORT_WIDTH = 2550;
  const EXPORT_HEIGHT = 3300;
  const PREVIEW_WIDTH = 765;
  const PREVIEW_HEIGHT = 990;
  const DB_NAME = "fenixBookBasketDb";
  const STORE_NAME = "pages";
  const DB_VERSION = 1;
  const SHAPES = ["circle", "square", "triangle", "star", "heart", "diamond", "flower", "leaf", "moon", "cloud"];

  document.addEventListener("DOMContentLoaded", initLogicStudio);

  function initLogicStudio() {
    bindControls();
    applyDifficultyPreset("medium", false);
    renderPreview();
    setStatus("Gotowe do pracy.");
  }

  function bindControls() {
    bindButton("logicStudioRefreshPreview", renderPreview);
    bindButton("logicStudioRandomize", randomizeTasks);
    bindButton("logicStudioExportPng", exportActivePng);
    bindButton("logicStudioAddToBasket", addActivePageToBasket);
    bindButton("logicStudioAddVariantsToBasket", addVariantsToBasket);
    bindButton("logicStudioExportPack", exportFenixPack);

    ["logicStudioTaskCount", "logicStudioElementCount", "logicStudioColumnCount", "logicStudioSeed", "logicStudioElementSize", "logicStudioSpacing", "logicStudioVariantCount"].forEach(function (id) {
      const suffix = id === "logicStudioElementSize" || id === "logicStudioSpacing" ? " px" : "";
      bindRange(id, suffix);
    });

    ["logicStudioShowTitle", "logicStudioTitle", "logicStudioInstruction", "logicStudioExerciseType", "logicStudioShowFrames", "logicStudioShowAnswers"].forEach(function (id) {
      const node = el(id);
      if (!node) return;
      node.addEventListener("input", renderPreview);
      node.addEventListener("change", renderPreview);
    });

    const difficulty = el("logicStudioDifficulty");
    if (difficulty) {
      difficulty.addEventListener("change", function () {
        applyDifficultyPreset(difficulty.value, true);
        renderPreview();
      });
    }
  }

  function bindButton(id, handler) {
    const node = el(id);
    if (node) node.addEventListener("click", handler);
  }

  function bindRange(baseId, suffix) {
    const range = el(baseId);
    const number = el(baseId + "Number");
    const output = el(baseId + "Value");
    const update = function (rawValue) {
      const control = range || number;
      if (!control) return;
      const value = clamp(Number(rawValue), Number(control.min), Number(control.max));
      if (range) range.value = String(value);
      if (number) number.value = String(value);
      if (output) output.textContent = String(value) + suffix;
      renderPreview();
    };
    if (range) range.addEventListener("input", function () { update(range.value); });
    if (number) {
      const commit = function () {
        if (number.value === "") {
          if (range) number.value = range.value;
          return;
        }
        update(number.value);
      };
      number.addEventListener("change", commit);
      number.addEventListener("blur", commit);
      number.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          number.blur();
        }
      });
    }
  }

  function applyDifficultyPreset(difficulty, shouldSetStatus) {
    const presets = {
      easy: { tasks: 4, elements: 4, columns: 1, size: 170, spacing: 76 },
      medium: { tasks: 5, elements: 5, columns: 1, size: 150, spacing: 62 },
      hard: { tasks: 7, elements: 6, columns: 2, size: 120, spacing: 42 }
    };
    const preset = presets[difficulty] || presets.medium;
    setRangeValue("logicStudioTaskCount", preset.tasks, "");
    setRangeValue("logicStudioElementCount", preset.elements, "");
    setRangeValue("logicStudioColumnCount", preset.columns, "");
    setRangeValue("logicStudioElementSize", preset.size, " px");
    setRangeValue("logicStudioSpacing", preset.spacing, " px");
    if (shouldSetStatus) setStatus("Dopasowano ustawienia poziomu trudności. Możesz je dalej ręcznie zmienić.");
  }

  function randomizeTasks() {
    const nextSeed = (getNumber("logicStudioSeed", 1) + 173) % 9999 || 1;
    setRangeValue("logicStudioSeed", nextSeed, "");
    setStatus("Wylosowano nowe zadania.");
    renderPreview();
  }

  function readSettings(overrides) {
    const settings = {
      showTitle: getChecked("logicStudioShowTitle", true),
      title: getValue("logicStudioTitle", "Logic Puzzle").trim() || "Logic Puzzle",
      instruction: getValue("logicStudioInstruction", "Look carefully and solve each puzzle.").trim(),
      exerciseType: getValue("logicStudioExerciseType", "what-next"),
      difficulty: getValue("logicStudioDifficulty", "medium"),
      taskCount: getNumber("logicStudioTaskCount", 5),
      elementCount: getNumber("logicStudioElementCount", 5),
      columnCount: getNumber("logicStudioColumnCount", 1),
      seed: getNumber("logicStudioSeed", 1),
      elementSize: getNumber("logicStudioElementSize", 150),
      spacing: getNumber("logicStudioSpacing", 62),
      showFrames: getChecked("logicStudioShowFrames", true),
      showAnswers: getChecked("logicStudioShowAnswers", false),
      variantCount: getNumber("logicStudioVariantCount", 5)
    };
    return Object.assign(settings, overrides || {});
  }

  function renderPreview() {
    const canvas = el("logicStudioPreviewCanvas");
    if (!canvas) return;
    const settings = readSettings();
    renderPageToCanvas(canvas, PREVIEW_WIDTH, PREVIEW_HEIGHT, settings);
    updatePreviewSummary(settings);
  }

  function renderPageToCanvas(canvas, width, height, settings) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const scale = width / EXPORT_WIDTH;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.scale(scale, scale);
    drawHeader(ctx, settings);
    drawTasks(ctx, settings, generateTasks(settings));
    ctx.restore();
  }

  function drawHeader(ctx, settings) {
    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (settings.showTitle) {
      ctx.font = "bold 86px Arial, Helvetica, sans-serif";
      ctx.fillText(settings.title, EXPORT_WIDTH / 2, 165, EXPORT_WIDTH - 560);
    }
    if (settings.instruction) {
      ctx.font = "42px Arial, Helvetica, sans-serif";
      ctx.fillText(settings.instruction, EXPORT_WIDTH / 2, settings.showTitle ? 275 : 185, EXPORT_WIDTH - 560);
    }
    ctx.restore();
  }

  function generateTasks(settings) {
    const rng = createRng(settings.seed);
    const tasks = [];
    for (let i = 0; i < settings.taskCount; i += 1) {
      tasks.push(createTask(settings.exerciseType, settings, rng, i));
    }
    return tasks;
  }

  function createTask(type, settings, rng, index) {
    if (type === "odd-one-out") return createOddOneOutTask(settings, rng, index);
    if (type === "same-different") return createSameDifferentTask(settings, rng, index);
    if (type === "simple-sorting") return createSortingTask(settings, rng, index);
    if (type === "find-pair") return createFindPairTask(settings, rng, index);
    return createPatternTask(settings, rng, index, type);
  }

  function createPatternTask(settings, rng, index, type) {
    const a = pickShape(rng);
    let b = pickDifferentShape(rng, [a]);
    let c = pickDifferentShape(rng, [a, b]);
    const pattern = settings.difficulty === "hard" ? [a, b, c] : [a, b];
    const visibleCount = Math.max(3, settings.elementCount - 1);
    const sequence = [];
    for (let i = 0; i < visibleCount; i += 1) sequence.push(pattern[i % pattern.length]);
    const answer = pattern[visibleCount % pattern.length];
    if (type === "complete-pattern" && settings.difficulty !== "easy") b = pattern[1];
    return { type: type, prompt: type === "complete-pattern" ? "Complete the pattern." : "What comes next?", sequence: sequence, answer: answer, index: index };
  }

  function createOddOneOutTask(settings, rng, index) {
    const main = pickShape(rng);
    const odd = pickDifferentShape(rng, [main]);
    const count = Math.max(4, settings.elementCount);
    const oddIndex = Math.floor(rng() * count);
    const sequence = [];
    for (let i = 0; i < count; i += 1) sequence.push(i === oddIndex ? odd : main);
    return { type: "odd-one-out", prompt: "Circle the odd one out.", sequence: sequence, answerIndex: oddIndex, index: index };
  }

  function createSameDifferentTask(settings, rng, index) {
    const first = pickShape(rng);
    const isSame = rng() > 0.5;
    const second = isSame ? first : pickDifferentShape(rng, [first]);
    return { type: "same-different", prompt: "Same or different?", sequence: [first, second], answer: isSame ? "SAME" : "DIFFERENT", index: index };
  }

  function createSortingTask(settings, rng, index) {
    const round = ["circle", "flower", "moon", "cloud"];
    const notRound = ["square", "triangle", "star", "diamond", "leaf", "heart"];
    const chooseRound = rng() > 0.5;
    const answer = chooseRound ? "ROUND" : "NOT ROUND";
    const source = chooseRound ? round : notRound;
    const distractors = chooseRound ? notRound : round;
    const sequence = [source[Math.floor(rng() * source.length)], source[Math.floor(rng() * source.length)], distractors[Math.floor(rng() * distractors.length)]];
    return { type: "simple-sorting", prompt: "Sort: " + answer.toLowerCase().replace("not round", "not round"), sequence: shuffle(sequence, rng), answer: answer, index: index };
  }

  function createFindPairTask(settings, rng, index) {
    const pair = pickShape(rng);
    const count = Math.max(5, settings.elementCount);
    const sequence = [pair, pair];
    while (sequence.length < count) sequence.push(pickDifferentShape(rng, [pair].concat(sequence)));
    return { type: "find-pair", prompt: "Find the matching pair.", sequence: shuffle(sequence, rng), answerShape: pair, index: index };
  }

  function drawTasks(ctx, settings, tasks) {
    const top = settings.showTitle || settings.instruction ? 410 : 270;
    const marginX = 210;
    const bottom = 3160;
    const columns = clamp(settings.columnCount, 1, 2);
    const gap = 42;
    const blockW = (EXPORT_WIDTH - marginX * 2 - gap * (columns - 1)) / columns;
    const rows = Math.ceil(tasks.length / columns);
    const blockH = Math.min(460, (bottom - top - gap * (rows - 1)) / rows);
    if (blockH < 250) setMessage("Układ może być zbyt gęsty. Zmniejsz liczbę zadań albo wybierz niższy poziom.");
    else setMessage("Zadania są gotowe do eksportu.");

    tasks.forEach(function (task, index) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = marginX + col * (blockW + gap);
      const y = top + row * (blockH + gap);
      drawTaskBlock(ctx, settings, task, x, y, blockW, blockH);
    });
  }

  function drawTaskBlock(ctx, settings, task, x, y, w, h) {
    ctx.save();
    if (settings.showFrames) {
      ctx.strokeStyle = "rgba(17, 24, 39, 0.24)";
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);
    }
    ctx.fillStyle = "#111827";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "bold 34px Arial, Helvetica, sans-serif";
    ctx.fillText(task.prompt, x + 28, y + 22, w - 56);

    if (task.type === "same-different") drawSameDifferentTask(ctx, settings, task, x, y, w, h);
    else if (task.type === "simple-sorting") drawSortingTask(ctx, settings, task, x, y, w, h);
    else drawSequenceTask(ctx, settings, task, x, y, w, h);
    ctx.restore();
  }

  function drawSequenceTask(ctx, settings, task, x, y, w, h) {
    const size = Math.min(settings.elementSize, h * 0.28, w / 7);
    const count = task.sequence.length + (task.answer ? 1 : 0);
    const totalW = count * size + (count - 1) * settings.spacing;
    let startX = x + (w - totalW) / 2 + size / 2;
    const centerY = y + h * 0.55;
    task.sequence.forEach(function (shape, i) {
      drawShape(ctx, shape, startX + i * (size + settings.spacing), centerY, size);
    });

    const answerX = startX + task.sequence.length * (size + settings.spacing);
    if (task.answer) {
      drawAnswerSlot(ctx, answerX, centerY, size);
      if (settings.showAnswers) drawShape(ctx, task.answer, answerX, centerY, size * 0.82, true);
    }
    if (settings.showAnswers) drawSequenceAnswerMark(ctx, task, answerX, centerY, size);
  }

  function drawSameDifferentTask(ctx, settings, task, x, y, w, h) {
    const size = Math.min(settings.elementSize * 1.05, h * 0.32, w * 0.18);
    const yMid = y + h * 0.52;
    drawShape(ctx, task.sequence[0], x + w * 0.36, yMid, size);
    drawShape(ctx, task.sequence[1], x + w * 0.64, yMid, size);
    drawChoiceLabels(ctx, settings, task, x, y, w, h, ["SAME", "DIFFERENT"], task.answer);
  }

  function drawSortingTask(ctx, settings, task, x, y, w, h) {
    const size = Math.min(settings.elementSize, h * 0.25, w * 0.16);
    const startX = x + w * 0.28;
    const yMid = y + h * 0.46;
    task.sequence.forEach(function (shape, i) {
      drawShape(ctx, shape, startX + i * (size + settings.spacing), yMid, size);
    });
    drawChoiceLabels(ctx, settings, task, x, y, w, h, ["ROUND", "NOT ROUND"], task.answer);
  }

  function drawChoiceLabels(ctx, settings, task, x, y, w, h, labels, answer) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 34px Arial, Helvetica, sans-serif";
    labels.forEach(function (label, index) {
      const boxW = 250;
      const boxH = 72;
      const bx = x + w / 2 + (index - 0.5) * 300 - boxW / 2;
      const by = y + h - 108;
      ctx.strokeStyle = settings.showAnswers && label === answer ? "rgba(17, 24, 39, 0.72)" : "rgba(17, 24, 39, 0.32)";
      ctx.lineWidth = settings.showAnswers && label === answer ? 6 : 3;
      ctx.strokeRect(bx, by, boxW, boxH);
      ctx.fillStyle = "#111827";
      ctx.fillText(label, bx + boxW / 2, by + boxH / 2);
    });
    ctx.restore();
  }

  function drawSequenceAnswerMark(ctx, task, x, y, size) {
    if (task.type === "odd-one-out") {
      const step = size + readSettings().spacing;
      const startX = x - task.sequence.length * step;
      drawAnswerCircle(ctx, startX + task.answerIndex * step, y, size);
    } else if (task.type === "find-pair") {
      task.sequence.forEach(function (shape, i) {
        if (shape === task.answerShape) {
          const step = size + readSettings().spacing;
          const startX = x - task.sequence.length * step;
          drawAnswerCircle(ctx, startX + i * step, y, size);
        }
      });
    }
  }

  function drawAnswerSlot(ctx, x, y, size) {
    ctx.save();
    ctx.strokeStyle = "rgba(17, 24, 39, 0.34)";
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 14]);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    ctx.restore();
  }

  function drawAnswerCircle(ctx, x, y, size) {
    ctx.save();
    ctx.strokeStyle = "rgba(17, 24, 39, 0.46)";
    ctx.lineWidth = 6;
    ctx.setLineDash([18, 14]);
    ctx.beginPath();
    ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawShape(ctx, shape, x, y, size, isAnswer) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = isAnswer ? "rgba(17, 24, 39, 0.46)" : "#111827";
    ctx.fillStyle = isAnswer ? "rgba(17, 24, 39, 0.08)" : "rgba(17, 24, 39, 0.04)";
    ctx.lineWidth = Math.max(4, size * 0.06);
    if (shape === "circle") drawCircle(ctx, size);
    else if (shape === "square") drawSquare(ctx, size);
    else if (shape === "triangle") drawPolygon(ctx, size, 3);
    else if (shape === "star") drawStar(ctx, size);
    else if (shape === "heart") drawHeart(ctx, size);
    else if (shape === "diamond") drawDiamond(ctx, size);
    else if (shape === "flower") drawFlower(ctx, size);
    else if (shape === "leaf") drawLeaf(ctx, size);
    else if (shape === "moon") drawMoon(ctx, size);
    else drawCloud(ctx, size);
    ctx.restore();
  }

  function drawCircle(ctx, size) { ctx.beginPath(); ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  function drawSquare(ctx, size) { ctx.beginPath(); ctx.rect(-size * 0.42, -size * 0.42, size * 0.84, size * 0.84); ctx.fill(); ctx.stroke(); }
  function drawPolygon(ctx, size, sides) {
    ctx.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / sides;
      const px = Math.cos(angle) * size * 0.48;
      const py = Math.sin(angle) * size * 0.48;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  function drawStar(ctx, size) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? size * 0.5 : size * 0.22;
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 10;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  function drawHeart(ctx, size) {
    ctx.beginPath();
    ctx.moveTo(0, size * 0.36);
    ctx.bezierCurveTo(-size * 0.58, -size * 0.04, -size * 0.36, -size * 0.52, 0, -size * 0.22);
    ctx.bezierCurveTo(size * 0.36, -size * 0.52, size * 0.58, -size * 0.04, 0, size * 0.36);
    ctx.fill();
    ctx.stroke();
  }
  function drawDiamond(ctx, size) { ctx.beginPath(); ctx.moveTo(0, -size * 0.5); ctx.lineTo(size * 0.4, 0); ctx.lineTo(0, size * 0.5); ctx.lineTo(-size * 0.4, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  function drawFlower(ctx, size) {
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI * 2 * i) / 6;
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * size * 0.22, Math.sin(angle) * size * 0.22, size * 0.13, size * 0.23, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    drawCircle(ctx, size * 0.32);
  }
  function drawLeaf(ctx, size) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.42, size * 0.1);
    ctx.bezierCurveTo(-size * 0.1, -size * 0.52, size * 0.4, -size * 0.38, size * 0.44, size * 0.04);
    ctx.bezierCurveTo(size * 0.08, size * 0.42, -size * 0.28, size * 0.38, -size * 0.42, size * 0.1);
    ctx.fill();
    ctx.stroke();
  }
  function drawMoon(ctx, size) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.48, Math.PI * 0.65, Math.PI * 1.35);
    ctx.bezierCurveTo(size * 0.12, -size * 0.22, size * 0.12, size * 0.22, -size * 0.38, size * 0.38);
    ctx.fill();
    ctx.stroke();
  }
  function drawCloud(ctx, size) {
    ctx.beginPath();
    ctx.arc(-size * 0.22, size * 0.08, size * 0.18, Math.PI, Math.PI * 1.85);
    ctx.arc(0, -size * 0.04, size * 0.24, Math.PI * 1.05, Math.PI * 1.95);
    ctx.arc(size * 0.24, size * 0.06, size * 0.18, Math.PI * 1.2, 0);
    ctx.lineTo(-size * 0.34, size * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  async function exportActivePng() {
    try {
      setBusy(true);
      const canvas = createExportCanvas(readSettings());
      downloadDataUrl(canvas.toDataURL("image/png"), createPngFileName());
      setStatus("Wyeksportowano aktywną stronę PNG.");
    } catch (error) {
      console.error(error);
      setError("Błąd eksportu PNG.");
    } finally {
      setBusy(false);
    }
  }

  async function addActivePageToBasket() {
    try {
      setBusy(true);
      await addRenderedPageToBasket(readSettings(), 0);
      const message = "Dodano do wspólnego Koszyka Feniksa. Możesz wrócić do Fenixa albo przejść do MBG / Book Builder.";
      setStatus(message);
      setMessage(message);
      refreshGlobalBasketStatus();
    } catch (error) {
      console.error(error);
      setError("Błąd zapisu do Koszyka Feniksa.");
    } finally {
      setBusy(false);
    }
  }

  async function addVariantsToBasket() {
    try {
      setBusy(true);
      const base = readSettings();
      const count = clamp(base.variantCount, 1, 20);
      for (let i = 0; i < count; i += 1) await addRenderedPageToBasket(createVariantSettings(base, i), i);
      const message = "Dodano do wspólnego Koszyka Feniksa. Możesz wrócić do Fenixa albo przejść do MBG / Book Builder.";
      setStatus(message + " Dodano wariantów: " + count + ".");
      setMessage(message);
      refreshGlobalBasketStatus();
    } catch (error) {
      console.error(error);
      setError("Błąd zapisu wariantów do Koszyka Feniksa.");
    } finally {
      setBusy(false);
    }
  }

  async function exportFenixPack() {
    try {
      setBusy(true);
      const base = readSettings();
      const count = clamp(base.variantCount, 1, 20);
      const now = new Date().toISOString();
      const pages = [];
      for (let i = 0; i < count; i += 1) {
        const settings = createVariantSettings(base, i);
        const canvas = createExportCanvas(settings);
        pages.push({ id: createId("logic-page"), sourceModule: "logic-studio", pageType: "logic_page", fileName: createPngFileName(i), title: settings.title, width: EXPORT_WIDTH, height: EXPORT_HEIGHT, mimeType: "image/png", createdAt: now, order: i + 1, dataUrl: canvas.toDataURL("image/png") });
      }
      downloadPack({ fenixPackVersion: 1, packType: "fenix_book_pages", sourceModule: "logic-studio", createdAt: now, pageSize: { width: EXPORT_WIDTH, height: EXPORT_HEIGHT, dpi: 300, trim: "8.5x11" }, pages: pages });
      setStatus("Wyeksportowano " + pages.length + " stron do paczki Feniksa.");
    } catch (error) {
      console.error(error);
      setError("Błąd eksportu .fenixpack.");
    } finally {
      setBusy(false);
    }
  }

  async function addRenderedPageToBasket(settings, index) {
    const canvas = createExportCanvas(settings);
    const blob = await canvasToPngBlob(canvas);
    const now = new Date().toISOString();
    await putBasketPage({ id: createBasketPageId(), sourceModule: "logic-studio", pageType: "logic_page", fileName: createPngFileName(index), title: settings.title, width: EXPORT_WIDTH, height: EXPORT_HEIGHT, mimeType: "image/png", createdAt: now, updatedAt: now, blob: blob, order: Date.now() + index, includeInBook: true });
  }

  function createVariantSettings(base, index) {
    return Object.assign({}, base, { seed: base.seed + index * 173 + 1 });
  }

  function createExportCanvas(settings) {
    const canvas = document.createElement("canvas");
    renderPageToCanvas(canvas, EXPORT_WIDTH, EXPORT_HEIGHT, settings);
    return canvas;
  }

  function updatePreviewSummary(settings) {
    const summary = el("logicStudioPreviewSummary");
    if (summary) summary.textContent = getExerciseLabel(settings.exerciseType) + " · " + getDifficultyLabel(settings.difficulty) + " · " + settings.taskCount + " zadań";
  }

  function getExerciseLabel(value) {
    const labels = { "what-next": "What comes next?", "complete-pattern": "Complete the pattern", "odd-one-out": "Odd one out", "same-different": "Same or different", "simple-sorting": "Simple sorting", "find-pair": "Find the pair" };
    return labels[value] || "Logic";
  }

  function getDifficultyLabel(value) {
    if (value === "easy") return "Easy";
    if (value === "hard") return "Hard";
    return "Medium";
  }

  function pickShape(rng) {
    return SHAPES[Math.floor(rng() * SHAPES.length)];
  }

  function pickDifferentShape(rng, blocked) {
    let shape = pickShape(rng);
    let guard = 0;
    while (blocked.indexOf(shape) !== -1 && guard < 30) {
      shape = pickShape(rng);
      guard += 1;
    }
    return shape;
  }

  function createRng(seed) {
    let value = Math.max(1, Math.floor(seed)) % 2147483647;
    return function () {
      value = value * 16807 % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function shuffle(items, rng) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  function openBasketDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB nie jest dostępny w tej przeglądarce."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Błąd otwarcia Koszyka Feniksa.")); };
    });
  }

  async function withBasketStore(mode, callback) {
    const db = await openBasketDb();
    return new Promise(function (resolve, reject) {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      transaction.oncomplete = function () { db.close(); resolve(result); };
      transaction.onerror = function () { db.close(); reject(transaction.error || new Error("Błąd operacji Koszyka Feniksa.")); };
      try {
        result = callback(store);
      } catch (error) {
        db.close();
        reject(error);
      }
    });
  }

  function putBasketPage(page) {
    return withBasketStore("readwrite", function (store) { store.put(page); });
  }

  function refreshGlobalBasketStatus() {
    if (window.FenixBasketStatus && typeof window.FenixBasketStatus.refresh === "function") window.FenixBasketStatus.refresh();
  }

  function downloadPack(pack) {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = createPackFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadDataUrl(dataUrl, fileName) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function canvasToPngBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("Nie udało się przygotować PNG Blob."));
      }, "image/png");
    });
  }

  function createBasketPageId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return createId("fenix-basket");
  }

  function createPngFileName(index) {
    const suffix = typeof index === "number" && index > 0 ? "-" + String(index + 1).padStart(2, "0") : "";
    return "fenix-logic-page-" + createDateStamp() + suffix + ".png";
  }

  function createPackFileName() {
    return "fenix-logic-studio-pack-" + createDateStamp() + ".fenixpack";
  }

  function createDateStamp() {
    const now = new Date();
    const pad = function (value) { return String(value).padStart(2, "0"); };
    return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()), "-", pad(now.getHours()), pad(now.getMinutes())].join("");
  }

  function setBusy(isBusy) {
    ["logicStudioExportPng", "logicStudioAddToBasket", "logicStudioAddVariantsToBasket", "logicStudioExportPack"].forEach(function (id) {
      const button = el(id);
      if (button) button.disabled = isBusy;
    });
  }

  function setStatus(message) {
    const status = el("logicStudioStatusText");
    if (status) status.textContent = message;
  }

  function setMessage(message) {
    const node = el("logicStudioMessage");
    if (node) node.textContent = message;
  }

  function setError(message) {
    setStatus(message);
    setMessage(message);
  }

  function setRangeValue(baseId, value, suffix) {
    const range = el(baseId);
    const number = el(baseId + "Number");
    const output = el(baseId + "Value");
    if (range) range.value = String(value);
    if (number) number.value = String(value);
    if (output) output.textContent = String(value) + suffix;
  }

  function getValue(id, fallback) {
    const node = el(id);
    return node ? String(node.value || "") : fallback;
  }

  function getChecked(id, fallback) {
    const node = el(id);
    return node ? node.checked : fallback;
  }

  function getNumber(id, fallback) {
    const node = el(id);
    const value = node ? Number(node.value) : fallback;
    return Number.isFinite(value) ? value : fallback;
  }

  function createId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function el(id) {
    return document.getElementById(id);
  }
})();
