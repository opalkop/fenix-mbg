let ASSETS = {
  start: null,
  goal: null,
  checkpoint: null,
  enemy: null
};

function el(id) {
  return document.getElementById(id);
}

function setStatus(message) {
  const box = el("status");
  if (box) box.textContent = message;
}

function numberValue(id, fallback = 0) {
  const element = el(id);
  if (!element) return fallback;
  const value = parseFloat(String(element.value).replace(",", "."));
  return isNaN(value) ? fallback : value;
}

function intValue(id, fallback = 0) {
  const element = el(id);
  if (!element) return fallback;
  const value = parseInt(element.value, 10);
  return isNaN(value) ? fallback : value;
}

function textValue(id, fallback = "") {
  const element = el(id);
  return element ? element.value : fallback;
}

function selectValue(id, fallback = "") {
  const element = el(id);
  return element ? element.value : fallback;
}

function loadFile(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);

    const img = new Image();
    const reader = new FileReader();

    reader.onload = function (event) {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = event.target.result;
    };

    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function loadAssetsFromInputs() {
  const startInput = el("assetStart");
  const goalInput = el("assetGoal");
  const checkpointInput = el("assetCheckpoint");
  const enemyInput = el("assetEnemy");

  ASSETS.start = startInput && startInput.files[0] ? await loadFile(startInput.files[0]) : null;
  ASSETS.goal = goalInput && goalInput.files[0] ? await loadFile(goalInput.files[0]) : null;
  ASSETS.checkpoint = checkpointInput && checkpointInput.files[0] ? await loadFile(checkpointInput.files[0]) : null;
  ASSETS.enemy = enemyInput && enemyInput.files[0] ? await loadFile(enemyInput.files[0]) : null;
}

function getSettings() {
  return {
    pages: intValue("pages", 50),
    fileName: textValue("fileName", "MBG_book.pdf"),

    includeIntroPages: selectValue("includeIntroPages", "yes") === "yes",
    includeSolutions: selectValue("includeSolutions", "yes") === "yes",

    bookTitle: textValue("bookTitle", "FARM MAZES"),
    bookTitleLine2: textValue("bookTitleLine2", "FOR KIDS"),
    bookSubtitle: textValue("bookSubtitle", "Fun Puzzle Book for Ages 4–6"),
    bookInfo: textValue("bookInfo", "50 Easy Farm Maze Activities"),
    bookIntroText: textValue("bookIntroText", "Help the farm animals find their way home, collect items, and avoid obstacles."),

    howToTitle: textValue("howToTitle", "HOW TO PLAY"),
    howToLines: textValue("howToLines", "Start at the animal.\nFollow the maze path.\nCollect the item.\nAvoid the obstacle.\nReach the goal."),
    howToFooter: textValue("howToFooter", "Use a pencil and have fun!"),

    title: textValue("title", "Farm Maze"),
    subtitle: textValue("subtitle", "Help the farm animal reach the goal."),

    missionStartText: textValue("missionStartText", "START YOUR FARM MISSION"),
    screenFreeText: textValue("screenFreeText", "A screen-free activity book for young kids."),
    tipText: textValue("tipText", "Tip: If you take a wrong turn, go back and try another path."),

    mazeNumberPrefix: textValue("mazeNumberPrefix", "Maze"),
    solutionNumberPrefix: textValue("solutionNumberPrefix", "Solution"),
    solutionTitle: textValue("solutionTitle", "Solution"),
    solutionSubtitle: textValue("solutionSubtitle", "Follow the dashed path to check your answer."),

    startLabelText: textValue("startLabelText", "S"),
    goalLabelText: textValue("goalLabelText", "G"),
    checkpointLabelText: textValue("checkpointLabelText", "1"),
    enemyLabelText: textValue("enemyLabelText", "X"),

    mazeWidth: intValue("mazeWidth", 15),
    mazeHeight: intValue("mazeHeight", 15),

    safeMargin: intValue("safeMargin", 180),
    mazePadding: intValue("mazePadding", 80),

    useAssets: selectValue("useAssets", "yes") === "yes",
    assetScale: intValue("assetScale", 130) / 100,

    useCheckpoint: selectValue("useCheckpoint", "yes") === "yes",
    useEnemy: selectValue("useEnemy", "yes") === "yes",

    format: selectValue("format", "jpeg"),
    quality: numberValue("quality", 0.92),

    pageWidth: 2550,
    pageHeight: 3300,
    pdfWidth: 8.5,
    pdfHeight: 11,
    headerHeight: 450,
    footerHeight: 300
  };
}

function createGrid(width, height) {
  const grid = [];

  for (let y = 0; y < height; y++) {
    const row = [];

    for (let x = 0; x < width; x++) {
      row.push({
        x,
        y,
        visited: false,
        top: true,
        right: true,
        bottom: true,
        left: true
      });
    }

    grid.push(row);
  }

  return grid;
}

function getUnvisitedNeighbors(cell, grid, width, height) {
  const neighbors = [];
  const x = cell.x;
  const y = cell.y;

  if (y > 0 && !grid[y - 1][x].visited) neighbors.push(grid[y - 1][x]);
  if (x < width - 1 && !grid[y][x + 1].visited) neighbors.push(grid[y][x + 1]);
  if (y < height - 1 && !grid[y + 1][x].visited) neighbors.push(grid[y + 1][x]);
  if (x > 0 && !grid[y][x - 1].visited) neighbors.push(grid[y][x - 1]);

  return neighbors;
}

function removeWall(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 1) {
    a.right = false;
    b.left = false;
  } else if (dx === -1) {
    a.left = false;
    b.right = false;
  } else if (dy === 1) {
    a.bottom = false;
    b.top = false;
  } else if (dy === -1) {
    a.top = false;
    b.bottom = false;
  }
}

function generateMaze(width, height) {
  const grid = createGrid(width, height);
  const stack = [];

  let current = grid[0][0];
  current.visited = true;

  while (true) {
    const neighbors = getUnvisitedNeighbors(current, grid, width, height);

    if (neighbors.length > 0) {
      const next = neighbors[Math.floor(Math.random() * neighbors.length)];
      stack.push(current);
      removeWall(current, next);
      next.visited = true;
      current = next;
    } else if (stack.length > 0) {
      current = stack.pop();
    } else {
      break;
    }
  }

  return grid;
}

function randomInnerX(width) {
  return Math.floor(Math.random() * (width - 2)) + 1;
}

function randomInnerY(height) {
  return Math.floor(Math.random() * (height - 2)) + 1;
}

function addStartGoal(maze) {
  const width = maze[0].length;
  const height = maze.length;
  const side = Math.floor(Math.random() * 4);

  let start;
  let goal;

  if (side === 0) {
    start = { x: randomInnerX(width), y: 0 };
    goal = { x: randomInnerX(width), y: height - 1 };
    maze[start.y][start.x].top = false;
    maze[goal.y][goal.x].bottom = false;
  } else if (side === 1) {
    start = { x: randomInnerX(width), y: height - 1 };
    goal = { x: randomInnerX(width), y: 0 };
    maze[start.y][start.x].bottom = false;
    maze[goal.y][goal.x].top = false;
  } else if (side === 2) {
    start = { x: 0, y: randomInnerY(height) };
    goal = { x: width - 1, y: randomInnerY(height) };
    maze[start.y][start.x].left = false;
    maze[goal.y][goal.x].right = false;
  } else {
    start = { x: width - 1, y: randomInnerY(height) };
    goal = { x: 0, y: randomInnerY(height) };
    maze[start.y][start.x].right = false;
    maze[goal.y][goal.x].left = false;
  }

  return { start, goal };
}

function getOpenNeighbors(cell, maze) {
  const result = [];
  const x = cell.x;
  const y = cell.y;
  const width = maze[0].length;
  const height = maze.length;

  if (!maze[y][x].top && y > 0) result.push({ x, y: y - 1 });
  if (!maze[y][x].right && x < width - 1) result.push({ x: x + 1, y });
  if (!maze[y][x].bottom && y < height - 1) result.push({ x, y: y + 1 });
  if (!maze[y][x].left && x > 0) result.push({ x: x - 1, y });

  return result;
}

function findPath(maze, start, goal) {
  const queue = [start];
  const visited = new Set();
  const cameFrom = {};

  const startKey = start.x + "," + start.y;
  const goalKey = goal.x + "," + goal.y;

  visited.add(startKey);

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = current.x + "," + current.y;

    if (currentKey === goalKey) break;

    const neighbors = getOpenNeighbors(current, maze);

    for (const next of neighbors) {
      const nextKey = next.x + "," + next.y;

      if (!visited.has(nextKey)) {
        visited.add(nextKey);
        cameFrom[nextKey] = current;
        queue.push(next);
      }
    }
  }

  const path = [];
  let current = goal;
  let currentKey = goalKey;

  while (currentKey !== startKey) {
    path.push(current);

    const previous = cameFrom[currentKey];

    if (!previous) return [];

    current = previous;
    currentKey = current.x + "," + current.y;
  }

  path.push(start);
  path.reverse();

  return path;
}

function sameCell(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function pickCheckpoint(path) {
  if (!path || path.length < 6) return null;

  const min = Math.floor(path.length * 0.35);
  const max = Math.floor(path.length * 0.65);

  if (max <= min) return path[Math.floor(path.length / 2)];

  const index = Math.floor(Math.random() * (max - min + 1)) + min;
  return path[index];
}

function randomCell(width, height) {
  return {
    x: Math.floor(Math.random() * width),
    y: Math.floor(Math.random() * height)
  };
}

function pickEnemy(maze, path, start, goal, checkpoint) {
  const width = maze[0].length;
  const height = maze.length;
  const pathSet = new Set(path.map(p => p.x + "," + p.y));

  for (let i = 0; i < 500; i++) {
    const cell = randomCell(width, height);
    const key = cell.x + "," + cell.y;

    if (pathSet.has(key)) continue;
    if (sameCell(cell, start)) continue;
    if (sameCell(cell, goal)) continue;
    if (sameCell(cell, checkpoint)) continue;

    return cell;
  }

  return null;
}

function buildMazeData(settings) {
  const maze = generateMaze(settings.mazeWidth, settings.mazeHeight);
  const points = addStartGoal(maze);
  const path = findPath(maze, points.start, points.goal);

  const checkpoint = settings.useCheckpoint ? pickCheckpoint(path) : null;
  const enemy = settings.useEnemy ? pickEnemy(maze, path, points.start, points.goal, checkpoint) : null;

  return {
    maze,
    start: points.start,
    goal: points.goal,
    path,
    checkpoint,
    enemy
  };
}

function getMazeLayout(settings) {
  const safeX = settings.safeMargin + settings.mazePadding;
  const safeY = settings.headerHeight + settings.mazePadding;

  const safeWidth = settings.pageWidth - settings.safeMargin * 2 - settings.mazePadding * 2;
  const safeHeight = settings.pageHeight - settings.headerHeight - settings.footerHeight - settings.mazePadding * 2;

  const cellSize = Math.floor(Math.min(safeWidth / settings.mazeWidth, safeHeight / settings.mazeHeight));

  const mazePixelWidth = settings.mazeWidth * cellSize;
  const mazePixelHeight = settings.mazeHeight * cellSize;

  const offsetX = safeX + (safeWidth - mazePixelWidth) / 2;
  const offsetY = safeY + (safeHeight - mazePixelHeight) / 2;

  return { offsetX, offsetY, cellSize };
}

function drawMazeWalls(ctx, maze, offsetX, offsetY, cellSize) {
  ctx.strokeStyle = "black";
  ctx.lineWidth = Math.max(4, Math.floor(cellSize * 0.055));
  ctx.lineCap = "square";

  for (let y = 0; y < maze.length; y++) {
    for (let x = 0; x < maze[y].length; x++) {
      const cell = maze[y][x];
      const px = offsetX + x * cellSize;
      const py = offsetY + y * cellSize;

      if (cell.top) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + cellSize, py);
        ctx.stroke();
      }

      if (cell.right) {
        ctx.beginPath();
        ctx.moveTo(px + cellSize, py);
        ctx.lineTo(px + cellSize, py + cellSize);
        ctx.stroke();
      }

      if (cell.bottom) {
        ctx.beginPath();
        ctx.moveTo(px, py + cellSize);
        ctx.lineTo(px + cellSize, py + cellSize);
        ctx.stroke();
      }

      if (cell.left) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + cellSize);
        ctx.stroke();
      }
    }
  }
}

function cellCenter(cell, offsetX, offsetY, cellSize) {
  return {
    x: offsetX + cell.x * cellSize + cellSize / 2,
    y: offsetY + cell.y * cellSize + cellSize / 2
  };
}

function drawTextMarker(ctx, label, x, y, size) {
  ctx.save();

  ctx.fillStyle = "white";
  ctx.strokeStyle = "black";
  ctx.lineWidth = Math.max(3, Math.floor(size * 0.06));

  ctx.beginPath();
  ctx.arc(x, y, size * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "black";
  ctx.font = "bold " + Math.floor(size * 0.32) + "px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(label).slice(0, 3), x, y);

  ctx.restore();
}

function drawAssetMarker(ctx, img, fallbackLabel, x, y, cellSize, settings, type = "normal") {
  let scale = settings.assetScale;

  if (type === "start" || type === "goal") scale *= 1.25;
  if (type === "checkpoint") scale *= 1.0;
  if (type === "enemy") scale *= 0.95;

  const size = cellSize * scale;

  if (settings.useAssets && img) {
    ctx.drawImage(
      img,
      x - size / 2,
      y - size / 2,
      size,
      size
    );
  } else {
    drawTextMarker(ctx, fallbackLabel, x, y, size);
  }
}

function drawMarkers(ctx, mazeData, offsetX, offsetY, cellSize, settings) {
  const startPos = cellCenter(mazeData.start, offsetX, offsetY, cellSize);
  const goalPos = cellCenter(mazeData.goal, offsetX, offsetY, cellSize);

  drawAssetMarker(ctx, ASSETS.start, settings.startLabelText, startPos.x, startPos.y, cellSize, settings, "start");
  drawAssetMarker(ctx, ASSETS.goal, settings.goalLabelText, goalPos.x, goalPos.y, cellSize, settings, "goal");

  if (settings.useCheckpoint && mazeData.checkpoint) {
    const checkpointPos = cellCenter(mazeData.checkpoint, offsetX, offsetY, cellSize);
    drawAssetMarker(ctx, ASSETS.checkpoint, settings.checkpointLabelText, checkpointPos.x, checkpointPos.y, cellSize, settings, "checkpoint");
  }

  if (settings.useEnemy && mazeData.enemy) {
    const enemyPos = cellCenter(mazeData.enemy, offsetX, offsetY, cellSize);
    drawAssetMarker(ctx, ASSETS.enemy, settings.enemyLabelText, enemyPos.x, enemyPos.y, cellSize, settings, "enemy");
  }
}

function drawSolutionPath(ctx, path, offsetX, offsetY, cellSize) {
  if (!path || path.length === 0) return;

  ctx.save();
  ctx.strokeStyle = "#555";
  ctx.lineWidth = Math.max(8, Math.floor(cellSize * 0.11));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([28, 20]);

  ctx.beginPath();

  for (let i = 0; i < path.length; i++) {
    const point = cellCenter(path[i], offsetX, offsetY, cellSize);
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }

  ctx.stroke();
  ctx.restore();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/);
  let line = "";
  let currentY = y;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[i] + " ";
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line.trim()) ctx.fillText(line.trim(), x, currentY);
}

function drawDecorativeFrame(ctx, settings) {
  ctx.save();

  const margin = 240;

  ctx.strokeStyle = "black";
  ctx.lineWidth = 6;
  ctx.strokeRect(margin, margin, settings.pageWidth - margin * 2, settings.pageHeight - margin * 2);

  ctx.lineWidth = 2;
  ctx.strokeRect(margin + 35, margin + 35, settings.pageWidth - (margin + 35) * 2, settings.pageHeight - (margin + 35) * 2);

  ctx.restore();
}

function renderIntroPage1(settings) {
  const canvas = document.createElement("canvas");
  canvas.width = settings.pageWidth;
  canvas.height = settings.pageHeight;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawDecorativeFrame(ctx, settings);

  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.font = "bold 120px Arial";
  ctx.fillText(settings.bookTitle, canvas.width / 2, 850);

  ctx.font = "bold 82px Arial";
  ctx.fillText(settings.bookTitleLine2, canvas.width / 2, 980);

  ctx.font = "52px Arial";
  ctx.fillText(settings.bookSubtitle, canvas.width / 2, 1160);

  ctx.font = "bold 62px Arial";
  ctx.fillText(settings.bookInfo, canvas.width / 2, 1400);

  ctx.font = "48px Arial";
  drawWrappedText(ctx, settings.bookIntroText, canvas.width / 2, 1650, 1750, 68);

  ctx.font = "bold 50px Arial";
  ctx.fillText(settings.missionStartText, canvas.width / 2, 2350);

  ctx.font = "42px Arial";
  ctx.fillText(settings.screenFreeText, canvas.width / 2, 2500);

  return canvas;
}

function renderIntroPage2(settings) {
  const canvas = document.createElement("canvas");
  canvas.width = settings.pageWidth;
  canvas.height = settings.pageHeight;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawDecorativeFrame(ctx, settings);

  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.font = "bold 100px Arial";
  ctx.fillText(settings.howToTitle, canvas.width / 2, 620);

  ctx.font = "52px Arial";

  const lines = settings.howToLines
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  let y = 900;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText((i + 1) + ". " + lines[i], canvas.width / 2, y);
    y += 145;
  }

  ctx.font = "bold 60px Arial";
  ctx.fillText(settings.howToFooter, canvas.width / 2, 1950);

  ctx.font = "42px Arial";
  drawWrappedText(ctx, settings.tipText, canvas.width / 2, 2300, 1700, 60);

  return canvas;
}

function renderPage(pageNumber, settings, mazeData, isSolution = false) {
  const canvas = document.createElement("canvas");
  canvas.width = settings.pageWidth;
  canvas.height = settings.pageHeight;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.font = "bold 80px Arial";
  ctx.fillText(isSolution ? settings.solutionTitle : settings.title, canvas.width / 2, 210);

  ctx.font = "42px Arial";
  drawWrappedText(ctx, isSolution ? settings.solutionSubtitle : settings.subtitle, canvas.width / 2, 295, 1900, 54);

  const layout = getMazeLayout(settings);

  drawMazeWalls(ctx, mazeData.maze, layout.offsetX, layout.offsetY, layout.cellSize);

  if (isSolution) {
    drawSolutionPath(ctx, mazeData.path, layout.offsetX, layout.offsetY, layout.cellSize);
  }

  drawMarkers(ctx, mazeData, layout.offsetX, layout.offsetY, layout.cellSize, settings);

  ctx.fillStyle = "black";
  ctx.font = "45px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const prefix = isSolution ? settings.solutionNumberPrefix : settings.mazeNumberPrefix;

  ctx.fillText(prefix + " #" + String(pageNumber).padStart(3, "0"), canvas.width / 2, settings.pageHeight - settings.safeMargin);

  return canvas;
}

function addCanvasToPdf(pdf, canvas, settings) {
  let imgData;
  let imageFormat;

  if (settings.format === "jpeg") {
    imgData = canvas.toDataURL("image/jpeg", settings.quality);
    imageFormat = "JPEG";
  } else {
    imgData = canvas.toDataURL("image/png");
    imageFormat = "PNG";
  }

  pdf.addImage(imgData, imageFormat, 0, 0, settings.pdfWidth, settings.pdfHeight);
}

async function generateBook() {
  try {
    setStatus("Start generowania...");

    const settings = getSettings();

    if (!window.jspdf || !window.jspdf.jsPDF) {
      setStatus("BŁĄD: jsPDF nie jest załadowany.");
      alert("BŁĄD: jsPDF nie jest załadowany.");
      return;
    }

    if (settings.pages < 1) {
      setStatus("BŁĄD: ilość labiryntów musi być większa niż 0.");
      alert("BŁĄD: ilość labiryntów musi być większa niż 0.");
      return;
    }

    if (settings.mazeWidth < 5 || settings.mazeHeight < 5) {
      setStatus("BŁĄD: labirynt musi mieć minimum 5 x 5.");
      alert("BŁĄD: labirynt musi mieć minimum 5 x 5.");
      return;
    }

    setStatus("Ładowanie assetów...");
    if (settings.useAssets) {
      await loadAssetsFromInputs();
    }

    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "in",
      format: [settings.pdfWidth, settings.pdfHeight],
      compress: true
    });

    const mazeBook = [];

    setStatus("Generowanie labiryntów...");

    for (let i = 1; i <= settings.pages; i++) {
      mazeBook.push(buildMazeData(settings));
    }

    let isFirstPage = true;

    function addPageCanvas(canvas) {
      if (!isFirstPage) {
        pdf.addPage([settings.pdfWidth, settings.pdfHeight], "portrait");
      }

      addCanvasToPdf(pdf, canvas, settings);
      isFirstPage = false;
    }

    setStatus("Składanie PDF...");

    if (settings.includeIntroPages) {
      addPageCanvas(renderIntroPage1(settings));
      addPageCanvas(renderIntroPage2(settings));
    }

    for (let i = 0; i < mazeBook.length; i++) {
      addPageCanvas(renderPage(i + 1, settings, mazeBook[i], false));
    }

    if (settings.includeSolutions) {
      for (let i = 0; i < mazeBook.length; i++) {
        addPageCanvas(renderPage(i + 1, settings, mazeBook[i], true));
      }
    }

    setStatus("Zapisywanie PDF...");
    pdf.save(settings.fileName || "MBG_book.pdf");
    setStatus("Gotowe. PDF powinien się pobrać.");

  } catch (error) {
    console.error(error);
    setStatus("BŁĄD: " + error.message);
    alert("BŁĄD GENERATORA:\n\n" + error.message);
  }
}

window.generateBook = generateBook;

document.addEventListener("DOMContentLoaded", function () {
  const btn = el("generateBtn");

  if (btn) {
    btn.addEventListener("click", function () {
      generateBook();
    });
  }

  setStatus("Gotowy.");
});
