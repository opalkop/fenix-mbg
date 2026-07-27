(function () {
  "use strict";

  const EXPORT_WIDTH = 2550;
  const EXPORT_HEIGHT = 3300;
  const PREVIEW_WIDTH = 765;
  const PREVIEW_HEIGHT = 990;
  const FENIX_BOOK_BASKET_DB_NAME = "fenixBookBasketDb";
  const FENIX_BOOK_BASKET_STORE_NAME = "pages";
  const FENIX_BOOK_BASKET_DB_VERSION = 1;

  document.addEventListener("DOMContentLoaded", initMathStudio);

  function initMathStudio() {
    bindControls();
    applyDifficultyPreset("medium", false);
    renderPreview();
    setStatus("Gotowe do pracy.");
  }

  function bindControls() {
    bindButton("mathStudioRefreshPreview", renderPreview);
    bindButton("mathStudioRandomize", randomizeTasks);
    bindButton("mathStudioExportPng", exportActivePng);
    bindButton("mathStudioAddToBasket", addActivePageToBasket);
    bindButton("mathStudioAddVariantsToBasket", addVariantsToBasket);
    bindButton("mathStudioExportPack", exportFenixPack);

    [
      "mathStudioMinNumber", "mathStudioMaxNumber", "mathStudioTaskCount", "mathStudioColumns",
      "mathStudioTextSize", "mathStudioTaskSpacing", "mathStudioLineWidth",
      "mathStudioSeed", "mathStudioVariantCount"
    ].forEach(function (id) {
      bindRange(id, id === "mathStudioTextSize" || id === "mathStudioTaskSpacing" || id === "mathStudioLineWidth" ? " px" : "");
    });

    [
      "mathStudioShowTitle", "mathStudioTitle", "mathStudioInstruction", "mathStudioExerciseType",
      "mathStudioShowAnswers", "mathStudioTracingRange", "mathStudioTracingCustom",
      "mathStudioTracingStyle", "mathStudioShowFrames", "mathStudioShowAnswerSpaces",
      "mathStudioShowWritingLines"
    ].forEach(function (id) {
      const node = el(id);
      if (!node) return;
      node.addEventListener("input", renderPreview);
      node.addEventListener("change", renderPreview);
    });

    const difficulty = el("mathStudioDifficulty");
    if (difficulty) {
      difficulty.addEventListener("change", function () {
        applyDifficultyPreset(difficulty.value, true);
        renderPreview();
      });
    }

    const exercise = el("mathStudioExerciseType");
    if (exercise) {
      exercise.addEventListener("change", function () {
        updateDefaultTextForExercise(exercise.value);
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
    const countCircleMode = getValue("mathStudioExerciseType", "addition") === "count-circle";
    const presets = countCircleMode ? {
      easy: { min: 1, max: 10, tasks: 6, columns: 1, text: 78, spacing: 410 },
      medium: { min: 1, max: 20, tasks: 7, columns: 1, text: 68, spacing: 390 },
      hard: { min: 1, max: 20, tasks: 10, columns: 2, text: 58, spacing: 470 }
    } : {
      easy: { min: 1, max: 10, tasks: 10, columns: 1, text: 78, spacing: 175 },
      medium: { min: 1, max: 20, tasks: 16, columns: 2, text: 68, spacing: 145 },
      hard: { min: 1, max: 50, tasks: 24, columns: 3, text: 58, spacing: 118 }
    };
    const preset = presets[difficulty] || presets.medium;
    setRangeValue("mathStudioMinNumber", preset.min, "");
    setRangeValue("mathStudioMaxNumber", preset.max, "");
    setRangeValue("mathStudioTaskCount", preset.tasks, "");
    setRangeValue("mathStudioColumns", preset.columns, "");
    setRangeValue("mathStudioTextSize", preset.text, " px");
    setRangeValue("mathStudioTaskSpacing", preset.spacing, " px");
    if (shouldSetStatus) setStatus("Dopasowano ustawienia poziomu trudności. Możesz je dalej ręcznie zmienić.");
  }

  function updateDefaultTextForExercise(type) {
    const titles = {
      counting: ["Counting Practice", "Count the shapes and write the number."],
      addition: ["Addition Practice", "Solve the problems."],
      subtraction: ["Subtraction Practice", "Solve the problems."],
      "missing-numbers": ["Missing Numbers", "Fill in the missing numbers."],
      "number-tracing": ["Number Tracing", "Trace the numbers."],
      "count-circle": ["Count and Circle", "Count the shapes and circle the answer."]
    };
    const text = titles[type] || titles.addition;
    setValue("mathStudioTitle", text[0]);
    setValue("mathStudioInstruction", text[1]);
    if (type === "count-circle") {
      applyDifficultyPreset(getValue("mathStudioDifficulty", "medium"), false);
    }
    renderPreview();
  }

  function randomizeTasks() {
    const nextSeed = (getNumber("mathStudioSeed", 1) + 137) % 9999 || 1;
    setRangeValue("mathStudioSeed", nextSeed, "");
    setStatus("Wylosowano nowe zadania.");
    renderPreview();
  }

  function readSettings(overrides) {
    const min = getNumber("mathStudioMinNumber", 1);
    const max = Math.max(min, getNumber("mathStudioMaxNumber", 20));
    const settings = {
      showTitle: getChecked("mathStudioShowTitle", true),
      title: getValue("mathStudioTitle", "Math Practice").trim() || "Math Practice",
      instruction: getValue("mathStudioInstruction", "Solve the problems.").trim(),
      exerciseType: getValue("mathStudioExerciseType", "addition"),
      difficulty: getValue("mathStudioDifficulty", "medium"),
      minNumber: min,
      maxNumber: max,
      taskCount: getNumber("mathStudioTaskCount", 16),
      columns: getNumber("mathStudioColumns", 2),
      textSize: getNumber("mathStudioTextSize", 68),
      taskSpacing: getNumber("mathStudioTaskSpacing", 145),
      lineWidth: getNumber("mathStudioLineWidth", 5),
      showFrames: getChecked("mathStudioShowFrames", true),
      showAnswerSpaces: getChecked("mathStudioShowAnswerSpaces", true),
      showAnswers: getChecked("mathStudioShowAnswers", false),
      tracingRange: getValue("mathStudioTracingRange", "1-10"),
      tracingCustom: getValue("mathStudioTracingCustom", "1,2,3,4,5"),
      tracingStyle: getValue("mathStudioTracingStyle", "dotted"),
      showWritingLines: getChecked("mathStudioShowWritingLines", true),
      seed: getNumber("mathStudioSeed", 1),
      variantCount: getNumber("mathStudioVariantCount", 5)
    };
    return Object.assign(settings, overrides || {});
  }

  function renderPreview() {
    const canvas = el("mathStudioPreviewCanvas");
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
    if (settings.exerciseType === "number-tracing") drawNumberTracing(ctx, settings);
    else drawTaskGrid(ctx, settings, generateTasks(settings));
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

  function drawTaskGrid(ctx, settings, tasks) {
    if (settings.exerciseType === "count-circle") {
      drawCountCircleGrid(ctx, settings, tasks);
      return;
    }

    const margin = 260;
    const top = 430;
    const columns = clamp(settings.columns, 1, 3);
    const columnWidth = (EXPORT_WIDTH - margin * 2) / columns;
    tasks.forEach(function (task, index) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + col * columnWidth + 28;
      const y = top + row * settings.taskSpacing;
      if (y > EXPORT_HEIGHT - 230) return;
      if (settings.showFrames) drawTaskFrame(ctx, x - 24, y - 58, columnWidth - 56, settings.taskSpacing - 18, settings);
      if (settings.exerciseType === "counting") {
        drawCountingTask(ctx, task, x, y, columnWidth - 70, settings);
      } else if (settings.exerciseType === "missing-numbers") {
        drawMissingNumberTask(ctx, task, x, y, columnWidth - 70, settings);
      } else {
        drawArithmeticTask(ctx, task, x, y, columnWidth - 70, settings);
      }
    });
  }

  function drawCountCircleGrid(ctx, settings, tasks) {
    const margin = 270;
    const top = 445;
    const columns = settings.difficulty === "hard" ? 2 : 1;
    const maxTasks = settings.difficulty === "easy" ? 6 : settings.difficulty === "hard" ? 10 : 7;
    const visibleTasks = tasks.slice(0, Math.min(tasks.length, maxTasks));
    const columnWidth = (EXPORT_WIDTH - margin * 2) / columns;
    const rowHeight = settings.difficulty === "hard" ? 470 : settings.difficulty === "easy" ? 410 : 390;

    visibleTasks.forEach(function (task, index) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + col * columnWidth;
      const y = top + row * rowHeight;
      if (y > EXPORT_HEIGHT - 260) return;
      drawCountCircleTaskBlock(ctx, task, x, y, columnWidth - 44, rowHeight - 44, settings);
    });
  }

  function drawCountCircleTaskBlock(ctx, task, x, y, width, height, settings) {
    const padding = 34;
    const answerZoneWidth = Math.max(220, Math.min(330, width * 0.34));
    const shapesWidth = width - answerZoneWidth - padding * 2;
    const shapesX = x + padding;
    const shapesY = y + padding;
    const answersX = x + width - answerZoneWidth + 6;
    const answersY = y + padding;

    if (settings.showFrames) drawTaskFrame(ctx, x, y, width, height, settings);
    drawShapeGrid(ctx, shapesX, shapesY, shapesWidth, height - padding * 2, Math.min(task.answer, 20), settings);
    drawAnswerOptions(ctx, task, answersX, answersY, answerZoneWidth - padding, height - padding * 2, settings);
  }

  function drawTaskFrame(ctx, x, y, w, h, settings) {
    ctx.save();
    ctx.strokeStyle = "rgba(17, 24, 39, 0.26)";
    ctx.lineWidth = Math.max(3, settings.lineWidth);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawArithmeticTask(ctx, task, x, y, width, settings) {
    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.font = settings.textSize + "px Arial, Helvetica, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const answer = settings.showAnswers ? " " + task.answer : " ____";
    const blank = settings.showAnswerSpaces ? answer : "";
    ctx.fillText(task.a + " " + task.op + " " + task.b + " =" + blank, x, y, width);
    if (settings.showAnswers) drawAnswerHint(ctx, String(task.answer), x + width - 120, y, settings);
    ctx.restore();
  }

  function drawMissingNumberTask(ctx, task, x, y, width, settings) {
    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.font = settings.textSize + "px Arial, Helvetica, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const text = task.sequence.map(function (n, index) {
      return index === task.missingIndex ? (settings.showAnswers ? "(" + n + ")" : "__") : String(n);
    }).join(", ");
    ctx.fillText(text, x, y, width);
    ctx.restore();
  }

  function drawCountingTask(ctx, task, x, y, width, settings) {
    ctx.save();
    drawShapeGroup(ctx, x, y - 34, Math.min(task.answer, 20), settings);
    ctx.fillStyle = "#111827";
    ctx.font = Math.max(42, settings.textSize * 0.78) + "px Arial, Helvetica, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (settings.exerciseType === "count-circle") {
      const optionText = task.options.map(function (option) {
        return option === task.answer && settings.showAnswers ? "(" + option + ")" : String(option);
      }).join("   ");
      ctx.fillText(optionText, x, y + 34, width);
    } else {
      ctx.fillText("Number: " + (settings.showAnswers ? task.answer : "____"), x + 260, y + 28, width - 260);
    }
    ctx.restore();
  }

  function drawShapeGrid(ctx, x, y, width, height, count, settings) {
    ctx.save();
    ctx.fillStyle = "rgba(17, 24, 39, 0.82)";
    const columns = count <= 6 ? 3 : count <= 12 ? 4 : 5;
    const rows = Math.ceil(count / columns);
    const cellW = width / columns;
    const cellH = height / Math.max(rows, 1);
    const radius = clamp(Math.min(cellW, cellH) * 0.22, 9, 20);

    for (let i = 0; i < count; i += 1) {
      const px = x + cellW * (i % columns) + cellW / 2;
      const py = y + cellH * Math.floor(i / columns) + cellH / 2;
      drawStarOrDot(ctx, px, py, radius, (settings.seed + i) % 3);
    }
    ctx.restore();
  }

  function drawAnswerOptions(ctx, task, x, y, width, height, settings) {
    ctx.save();
    const optionSize = clamp(Math.min(width, height / 3) * 0.78, 66, 96);
    const gap = (height - optionSize * 3) / 2;
    ctx.font = "bold " + Math.max(42, optionSize * 0.48) + "px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    task.options.forEach(function (option, index) {
      const cx = x + width / 2;
      const cy = y + optionSize / 2 + index * (optionSize + gap);
      ctx.beginPath();
      ctx.strokeStyle = option === task.answer && settings.showAnswers ? "rgba(17, 24, 39, 0.62)" : "rgba(17, 24, 39, 0.5)";
      ctx.fillStyle = option === task.answer && settings.showAnswers ? "rgba(17, 24, 39, 0.08)" : "#ffffff";
      ctx.lineWidth = Math.max(4, settings.lineWidth);
      ctx.arc(cx, cy, optionSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = option === task.answer && settings.showAnswers ? "rgba(17, 24, 39, 0.55)" : "#111827";
      ctx.fillText(String(option), cx, cy);
    });
    ctx.restore();
  }

  function drawShapeGroup(ctx, x, y, count, settings) {
    ctx.save();
    ctx.fillStyle = "rgba(17, 24, 39, 0.82)";
    const perRow = 5;
    for (let i = 0; i < count; i += 1) {
      const px = x + (i % perRow) * 42;
      const py = y + Math.floor(i / perRow) * 38;
      drawStarOrDot(ctx, px, py, 13, (settings.seed + i) % 3);
    }
    ctx.restore();
  }

  function drawStarOrDot(ctx, x, y, r, mode) {
    ctx.beginPath();
    if (mode === 0) {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else if (mode === 1) {
      ctx.rect(x - r, y - r, r * 2, r * 2);
    } else {
      for (let i = 0; i < 10; i += 1) {
        const radius = i % 2 === 0 ? r : r * 0.45;
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.fill();
  }

  function drawAnswerHint(ctx, answer, x, y, settings) {
    ctx.save();
    ctx.fillStyle = "rgba(17, 24, 39, 0.36)";
    ctx.font = Math.max(38, settings.textSize * 0.72) + "px Arial, Helvetica, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("(" + answer + ")", x, y);
    ctx.restore();
  }

  function drawNumberTracing(ctx, settings) {
    const numbers = getTracingNumbers(settings);
    const top = 520;
    const left = 300;
    const rowGap = Math.max(190, settings.taskSpacing + 45);
    const maxRows = Math.min(settings.taskCount, numbers.length);
    for (let i = 0; i < maxRows; i += 1) {
      const y = top + i * rowGap;
      if (y > EXPORT_HEIGHT - 210) break;
      drawTracingNumber(ctx, String(numbers[i]), left, y, settings);
      if (settings.showWritingLines) drawPracticeLine(ctx, left + 320, y, settings);
    }
  }

  function drawTracingNumber(ctx, text, x, y, settings) {
    ctx.save();
    ctx.font = "bold " + Math.max(110, settings.textSize * 2.25) + "px Arial, Helvetica, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (settings.tracingStyle === "light-solid") {
      ctx.fillStyle = "rgba(17, 24, 39, 0.22)";
      ctx.fillText(text, x, y);
    } else {
      ctx.lineWidth = Math.max(5, settings.lineWidth * 1.3);
      ctx.strokeStyle = "rgba(17, 24, 39, 0.58)";
      ctx.setLineDash(settings.tracingStyle === "dashed" ? [42, 28] : [1, 28]);
      ctx.strokeText(text, x, y);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(17, 24, 39, 0.06)";
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  function drawPracticeLine(ctx, x, y, settings) {
    ctx.save();
    ctx.strokeStyle = "rgba(17, 24, 39, 0.34)";
    ctx.lineWidth = settings.lineWidth;
    ctx.beginPath();
    ctx.moveTo(x, y + 58);
    ctx.lineTo(EXPORT_WIDTH - 300, y + 58);
    ctx.stroke();
    ctx.restore();
  }

  function generateTasks(settings) {
    const rng = createRng(settings.seed);
    const tasks = [];
    for (let i = 0; i < settings.taskCount; i += 1) {
      if (settings.exerciseType === "addition") tasks.push(createAdditionTask(settings, rng));
      else if (settings.exerciseType === "subtraction") tasks.push(createSubtractionTask(settings, rng));
      else if (settings.exerciseType === "missing-numbers") tasks.push(createMissingNumberTask(settings, rng));
      else if (settings.exerciseType === "count-circle") tasks.push(createCountCircleTask(settings, rng));
      else tasks.push(createCountingTask(settings, rng));
    }
    return tasks;
  }

  function createAdditionTask(settings, rng) {
    const a = randomInt(rng, settings.minNumber, settings.maxNumber);
    const b = randomInt(rng, settings.minNumber, settings.maxNumber);
    return { a: a, b: b, op: "+", answer: a + b };
  }

  function createSubtractionTask(settings, rng) {
    const a = randomInt(rng, settings.minNumber, settings.maxNumber);
    const b = randomInt(rng, settings.minNumber, a);
    return { a: a, b: b, op: "-", answer: a - b };
  }

  function createMissingNumberTask(settings, rng) {
    const start = randomInt(rng, settings.minNumber, Math.max(settings.minNumber, settings.maxNumber - 5));
    const length = settings.difficulty === "easy" ? 5 : settings.difficulty === "hard" ? 7 : 6;
    const missingIndex = randomInt(rng, 1, length - 2);
    const sequence = [];
    for (let i = 0; i < length; i += 1) sequence.push(start + i);
    return { sequence: sequence, missingIndex: missingIndex, answer: sequence[missingIndex] };
  }

  function createCountingTask(settings, rng) {
    const answer = randomInt(rng, Math.max(1, settings.minNumber), Math.min(20, settings.maxNumber));
    return { answer: answer };
  }

  function createCountCircleTask(settings, rng) {
    const answer = randomInt(rng, Math.max(1, settings.minNumber), Math.min(20, settings.maxNumber));
    const options = [answer];
    while (options.length < 3) {
      const candidate = clamp(answer + randomInt(rng, -3, 3), 1, Math.max(3, settings.maxNumber));
      if (!options.includes(candidate)) options.push(candidate);
    }
    return { answer: answer, options: shuffle(options, rng) };
  }

  function getTracingNumbers(settings) {
    if (settings.tracingRange === "0-9") return range(0, 9);
    if (settings.tracingRange === "1-20") return range(1, 20);
    if (settings.tracingRange === "custom") {
      const nums = settings.tracingCustom.split(/[^0-9]+/).map(Number).filter(function (n) { return Number.isFinite(n); });
      return nums.length ? nums : range(1, 10);
    }
    return range(1, 10);
  }

  async function exportActivePng() {
    try {
      setBusy(true);
      const canvas = createExportCanvas(readSettings());
      downloadDataUrl(canvas.toDataURL("image/png"), createMathPngFileName());
      setStatus("Wyeksportowano aktywną stronę PNG.");
      setMessage("Wyeksportowano aktywną stronę PNG 2550×3300 px.");
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
      refreshGlobalFenixBasketStatus();
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
      refreshGlobalFenixBasketStatus();
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
        pages.push({
          id: createId("math-page"),
          sourceModule: "math-studio",
          pageType: "math_page",
          fileName: createMathPngFileName(i),
          title: settings.title,
          width: EXPORT_WIDTH,
          height: EXPORT_HEIGHT,
          mimeType: "image/png",
          createdAt: now,
          order: i + 1,
          dataUrl: canvas.toDataURL("image/png")
        });
      }
      const pack = {
        fenixPackVersion: 1,
        packType: "fenix_book_pages",
        sourceModule: "math-studio",
        createdAt: now,
        pageSize: { width: EXPORT_WIDTH, height: EXPORT_HEIGHT, dpi: 300, trim: "8.5x11" },
        pages: pages
      };
      downloadFenixPack(pack);
      setStatus("Wyeksportowano " + pages.length + " stron do paczki Feniksa.");
      setMessage("Wyeksportowano .fenixpack zgodny z MBG.");
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
    await addFenixBookBasketPage({
      id: createFenixBookBasketPageId(),
      sourceModule: "math-studio",
      pageType: "math_page",
      fileName: createMathPngFileName(index),
      title: settings.title,
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      mimeType: "image/png",
      createdAt: now,
      updatedAt: now,
      blob: blob,
      order: Date.now() + index,
      includeInBook: true
    });
  }

  function createExportCanvas(settings) {
    const canvas = document.createElement("canvas");
    renderPageToCanvas(canvas, EXPORT_WIDTH, EXPORT_HEIGHT, settings);
    return canvas;
  }

  function createVariantSettings(base, index) {
    return Object.assign({}, base, { seed: base.seed + index * 137 + 1 });
  }

  function updatePreviewSummary(settings) {
    const summary = el("mathStudioPreviewSummary");
    if (summary) summary.textContent = getExerciseLabel(settings.exerciseType) + " · " + getDifficultyLabel(settings.difficulty) + " · seed " + settings.seed;
  }

  function getExerciseLabel(type) {
    const labels = {
      counting: "Counting",
      addition: "Addition",
      subtraction: "Subtraction",
      "missing-numbers": "Missing Numbers",
      "number-tracing": "Number Tracing",
      "count-circle": "Count and Circle"
    };
    return labels[type] || "Math";
  }

  function getDifficultyLabel(value) {
    if (value === "easy") return "Easy";
    if (value === "hard") return "Hard";
    return "Medium";
  }

  function createRng(seed) {
    let value = Math.max(1, Math.floor(seed)) % 2147483647;
    return function () {
      value = value * 16807 % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function randomInt(rng, min, max) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(rng() * (hi - lo + 1)) + lo;
  }

  function shuffle(values, rng) {
    const copy = values.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = randomInt(rng, 0, i);
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function range(start, end) {
    const result = [];
    for (let n = start; n <= end; n += 1) result.push(n);
    return result;
  }

  function openFenixBookBasketDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB nie jest dostępny w tej przeglądarce."));
        return;
      }
      const request = indexedDB.open(FENIX_BOOK_BASKET_DB_NAME, FENIX_BOOK_BASKET_DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(FENIX_BOOK_BASKET_STORE_NAME)) db.createObjectStore(FENIX_BOOK_BASKET_STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Błąd otwarcia Koszyka Feniksa.")); };
    });
  }

  async function withFenixBookBasketStore(mode, callback) {
    const db = await openFenixBookBasketDb();
    return new Promise(function (resolve, reject) {
      const transaction = db.transaction(FENIX_BOOK_BASKET_STORE_NAME, mode);
      const store = transaction.objectStore(FENIX_BOOK_BASKET_STORE_NAME);
      let callbackResult;
      transaction.oncomplete = function () { db.close(); resolve(callbackResult); };
      transaction.onerror = function () { db.close(); reject(transaction.error || new Error("Błąd operacji Koszyka Feniksa.")); };
      try {
        callbackResult = callback(store);
      } catch (error) {
        db.close();
        reject(error);
      }
    });
  }

  function addFenixBookBasketPage(page) {
    return withFenixBookBasketStore("readwrite", function (store) { store.put(page); });
  }

  function refreshGlobalFenixBasketStatus() {
    if (window.FenixBasketStatus && typeof window.FenixBasketStatus.refresh === "function") window.FenixBasketStatus.refresh();
  }

  function downloadFenixPack(pack) {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = createFenixPackFileName();
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

  function createFenixBookBasketPageId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return createId("fenix-basket");
  }

  function createMathPngFileName(index) {
    const suffix = typeof index === "number" && index > 0 ? "-" + String(index + 1).padStart(2, "0") : "";
    return "fenix-math-page-" + createDateStamp() + suffix + ".png";
  }

  function createFenixPackFileName() {
    return "fenix-math-studio-pack-" + createDateStamp() + ".fenixpack";
  }

  function createDateStamp() {
    const now = new Date();
    const pad = function (value) { return String(value).padStart(2, "0"); };
    return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()), "-", pad(now.getHours()), pad(now.getMinutes())].join("");
  }

  function setBusy(isBusy) {
    ["mathStudioExportPng", "mathStudioAddToBasket", "mathStudioAddVariantsToBasket", "mathStudioExportPack"].forEach(function (id) {
      const button = el(id);
      if (button) button.disabled = isBusy;
    });
  }

  function setStatus(message) {
    const status = el("mathStudioStatusText");
    if (status) status.textContent = message;
  }

  function setMessage(message) {
    const node = el("mathStudioMessage");
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

  function setValue(id, value) {
    const node = el(id);
    if (node) node.value = String(value);
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
