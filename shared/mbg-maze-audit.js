(function () {
  "use strict";

  if (new URLSearchParams(location.search).get("fenixMode") === "maze-studio") return;
  let scheduled = false;

  function getPages() {
    if (typeof window.getAvailableFenixPages !== "function") return [];
    return (window.getAvailableFenixPages() || []).filter(function (page) { return page && page.includeInBook !== false && page.sourceModule === "maze-studio"; });
  }
  function audit() {
    scheduled = false;
    const panel = document.getElementById("mbgBookAuditPanel");
    if (!panel) return;
    const old = document.getElementById("mbgMazePairAudit");
    if (old) old.remove();
    const pages = getPages();
    const pairs = new Map();
    let unpaired = 0;
    pages.forEach(function (page) {
      const pairId = page.mazePairId || (page.editSnapshot && page.editSnapshot.mazePairId) || "";
      if (!pairId) { unpaired += 1; return; }
      if (!pairs.has(pairId)) pairs.set(pairId, { puzzles: [], solutions: [] });
      const role = page.mazePairRole || (page.isSolution ? "solution" : "puzzle");
      pairs.get(pairId)[role === "solution" ? "solutions" : "puzzles"].push(page);
    });
    let valid = 0;
    let broken = 0;
    pairs.forEach(function (pair) {
      if (pair.puzzles.length !== 1 || pair.solutions.length !== 1) { broken += 1; return; }
      const puzzle = pair.puzzles[0];
      const solution = pair.solutions[0];
      const linksOk = (!puzzle.mazePartnerId || puzzle.mazePartnerId === solution.id) && (!solution.mazePartnerId || solution.mazePartnerId === puzzle.id);
      if (linksOk) valid += 1;
      else broken += 1;
    });
    const puzzles = pages.filter(function (page) { return page.mazePairRole !== "solution" && page.isSolution !== true; }).length;
    const solutions = pages.length - puzzles;
    const node = document.createElement("div");
    node.id = "mbgMazePairAudit";
    node.className = "mbg-book-audit-meta";
    node.innerHTML = "<strong>Maze Studio w Koszyku:</strong> " + puzzles + " zadań · " + solutions + " rozwiązań · " + valid + " poprawnych par 1:1" + (broken || unpaired ? " · <strong>do sprawdzenia:</strong> " + (broken + unpaired) : "");
    const total = panel.querySelector(".mbg-book-audit-total");
    panel.insertBefore(node, total || null);
    if (broken || unpaired) panel.classList.add("has-warning");
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(audit, 0);
  }
  const observer = new MutationObserver(schedule);
  document.addEventListener("DOMContentLoaded", function () {
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
  });
  window.addEventListener("focus", schedule);
})();