(function () {
  "use strict";

  const originalFillText = CanvasRenderingContext2D.prototype.fillText;
  if (!originalFillText.__fenixWordSearchQaPatched) {
    const patchedFillText = function (text) {
      if (String(text) === "Solution page") return;
      return originalFillText.apply(this, arguments);
    };
    patchedFillText.__fenixWordSearchQaPatched = true;
    CanvasRenderingContext2D.prototype.fillText = patchedFillText;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function setRange(baseId, value) {
    const range = el(baseId);
    if (!range) return;
    range.value = String(value);
    range.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setMinimum(baseId, value) {
    const range = el(baseId);
    const number = el(baseId + "Number");
    if (range) range.min = String(value);
    if (number) number.min = String(value);
  }

  function applyImprovedDifficultyPreset() {
    const difficulty = el("wordSearchDifficulty");
    if (!difficulty) return;
    const presets = {
      easy: { grid: 7, words: 4 },
      medium: { grid: 14, words: 8 },
      hard: { grid: 16, words: 12 }
    };
    const preset = presets[difficulty.value] || presets.medium;
    window.setTimeout(function () {
      setRange("wordSearchGridSize", preset.grid);
      setRange("wordSearchMaxWords", preset.words);
    }, 0);
  }

  function install() {
    const difficulty = el("wordSearchDifficulty");
    if (!difficulty) return;

    setMinimum("wordSearchGridSize", 6);
    setMinimum("wordSearchMaxWords", 3);

    const easy = difficulty.querySelector('option[value="easy"]');
    const medium = difficulty.querySelector('option[value="medium"]');
    const hard = difficulty.querySelector('option[value="hard"]');
    if (easy) easy.textContent = "Łatwy — 7×7, maks. 4 słowa, poziomo/pionowo";
    if (medium) medium.textContent = "Średni — 14×14, maks. 8 słów, także po skosie";
    if (hard) hard.textContent = "Trudny — 16×16, maks. 12 słów, także wspak";

    difficulty.addEventListener("change", applyImprovedDifficultyPreset);

    if (!el("wordSearchQaPresetNote")) {
      const note = document.createElement("p");
      note.id = "wordSearchQaPresetNote";
      note.className = "word-search-note";
      note.textContent = "Dla dzieci 4–6 lat preset Łatwy ustawia siatkę 7×7 i maksymalnie 4 słowa. Rozmiar można ręcznie zmniejszyć do 6×6, a liczbę słów do 3.";
      difficulty.closest("label").insertAdjacentElement("afterend", note);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
