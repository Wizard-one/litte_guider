const DIRECTIONS = {
  N: { x: 0, y: -1, label: "北" },
  E: { x: 1, y: 0, label: "东" },
  S: { x: 0, y: 1, label: "南" },
  W: { x: -1, y: 0, label: "西" }
};

const GRID = { cols: 6, rows: 4, cell: 100, offsetX: 50, offsetY: 60 };

const spots = [
  { id: "gate", name: "校门", x: 0, y: 3, desc: "校园入口与集合点。", theme: ["#2563eb", "#93c5fd"] },
  { id: "library", name: "图书馆", x: 2, y: 2, desc: "安静学习区，馆藏丰富。", theme: ["#0ea5e9", "#99f6e4"] },
  { id: "lab", name: "实验楼", x: 4, y: 2, desc: "理工课程实验与创新实践中心。", theme: ["#4f46e5", "#c4b5fd"] },
  { id: "canteen", name: "食堂", x: 3, y: 3, desc: "就餐中心，补充体力。", theme: ["#f97316", "#fdba74"] },
  { id: "stadium", name: "操场", x: 1, y: 1, desc: "运动锻炼与大型活动场地。", theme: ["#16a34a", "#86efac"] },
  { id: "lake", name: "知行湖", x: 5, y: 1, desc: "校园景观区，适合休憩。", theme: ["#0284c7", "#7dd3fc"] }
];

const spotById = Object.fromEntries(spots.map((spot) => [spot.id, spot]));

const spotPool = document.getElementById("spotPool");
const directionPool = document.getElementById("directionPool");
const routeDropZone = document.getElementById("routeDropZone");
const routeTimeline = document.getElementById("routeTimeline");
const routePlaceholder = document.getElementById("routePlaceholder");
const startBtn = document.getElementById("startBtn");
const clearRouteBtn = document.getElementById("clearRouteBtn");
const resetBtn = document.getElementById("resetBtn");
const message = document.getElementById("message");
const timeline = document.getElementById("timeline");
const fpStatus = document.getElementById("fpStatus");
const stepInfo = document.getElementById("stepInfo");
const spotImage = document.getElementById("spotImage");
const spotTitle = document.getElementById("spotTitle");
const spotDesc = document.getElementById("spotDesc");
const campusMap = document.getElementById("campusMap");
const spotLayer = document.getElementById("spotLayer");
const userPath = document.getElementById("userPath");
const playerDot = document.getElementById("playerDot");
const roads = document.getElementById("roads");
const grid = document.getElementById("grid");

const scoreDirection = document.getElementById("scoreDirection");
const scoreRoute = document.getElementById("scoreRoute");
const scoreExplain = document.getElementById("scoreExplain");
const scoreRequirement = document.getElementById("scoreRequirement");
const scoreSummary = document.getElementById("scoreSummary");

let animationTimer = null;
let routeTokens = [];

function cellToPoint(x, y) {
  return {
    px: GRID.offsetX + x * GRID.cell,
    py: GRID.offsetY + y * GRID.cell
  };
}

function generateSpotImage(spot) {
  const svg = `
  <svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'>
    <defs>
      <linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'>
        <stop offset='0%' stop-color='${spot.theme[0]}' />
        <stop offset='100%' stop-color='${spot.theme[1]}' />
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' fill='url(#g)' />
    <circle cx='680' cy='80' r='46' fill='rgba(255,255,255,0.28)' />
    <rect x='40' y='300' width='720' height='110' rx='22' fill='rgba(15,23,42,0.45)' />
    <text x='70' y='365' font-size='56' fill='white' font-family='Segoe UI, Microsoft YaHei'>${spot.name}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderSpotPool() {
  const html = spots
    .filter((spot) => spot.id !== "gate")
    .map(
      (spot) => `
      <button class="drag-item spot-item" draggable="true" data-type="spot" data-value="${spot.id}">
        ${spot.name}
      </button>
    `
    )
    .join("");
  spotPool.innerHTML = html;
}

function renderMapBase() {
  const gridLines = [];
  for (let i = 0; i <= GRID.cols; i += 1) {
    const x = GRID.offsetX + i * GRID.cell;
    gridLines.push(`<line x1='${x}' y1='${GRID.offsetY}' x2='${x}' y2='${GRID.offsetY + GRID.rows * GRID.cell}' stroke='#dbeafe'/>`);
  }
  for (let i = 0; i <= GRID.rows; i += 1) {
    const y = GRID.offsetY + i * GRID.cell;
    gridLines.push(`<line x1='${GRID.offsetX}' y1='${y}' x2='${GRID.offsetX + GRID.cols * GRID.cell}' y2='${y}' stroke='#dbeafe'/>`);
  }
  grid.innerHTML = gridLines.join("");

  const roadsMarkup = [];
  for (let y = 0; y <= GRID.rows; y += 1) {
    const yPx = GRID.offsetY + y * GRID.cell;
    roadsMarkup.push(`<line x1='${GRID.offsetX}' y1='${yPx}' x2='${GRID.offsetX + GRID.cols * GRID.cell}' y2='${yPx}' stroke='#cbd5e1' stroke-width='2'/>`);
  }
  for (let x = 0; x <= GRID.cols; x += 1) {
    const xPx = GRID.offsetX + x * GRID.cell;
    roadsMarkup.push(`<line x1='${xPx}' y1='${GRID.offsetY}' x2='${xPx}' y2='${GRID.offsetY + GRID.rows * GRID.cell}' stroke='#cbd5e1' stroke-width='2'/>`);
  }
  roads.innerHTML = roadsMarkup.join("");

  const spotsMarkup = spots
    .map((spot) => {
      const { px, py } = cellToPoint(spot.x, spot.y);
      return `
      <g>
        <circle cx='${px}' cy='${py}' r='16' fill='white' stroke='#2563eb' stroke-width='3'></circle>
        <text x='${px}' y='${py + 35}' text-anchor='middle' font-size='14' fill='#1e293b'>${spot.name}</text>
      </g>
      `;
    })
    .join("");

  spotLayer.innerHTML = spotsMarkup;
}

function expectedNextType() {
  return routeTokens.length % 2 === 0 ? "spot" : "direction";
}

function getUsedSpotIds() {
  return new Set(routeTokens.filter((item) => item.type === "spot").map((item) => item.value));
}

function updateSpotPoolState() {
  const usedSpotIds = getUsedSpotIds();
  spotPool.querySelectorAll(".spot-item").forEach((el) => {
    const isUsed = usedSpotIds.has(el.dataset.value);
    el.classList.toggle("is-used", isUsed);
    el.draggable = !isUsed;
    el.disabled = isUsed;
  });
}

function routeTokenLabel(token) {
  if (token.type === "spot") {
    return spotById[token.value].name;
  }
  return `向${DIRECTIONS[token.value].label}`;
}

function renderRouteTokens() {
  routeTimeline.innerHTML = "";
  routePlaceholder.style.display = routeTokens.length ? "none" : "block";
  routeTokens.forEach((token, index) => {
    const item = document.createElement("span");
    item.className = `route-token ${token.type === "spot" ? "spot-token" : "dir-token"}`;
    item.textContent = routeTokenLabel(token);
    routeTimeline.appendChild(item);

    if (index !== routeTokens.length - 1) {
      const arrow = document.createElement("span");
      arrow.className = "route-arrow";
      arrow.textContent = "→";
      routeTimeline.appendChild(arrow);
    }
  });
  updateSpotPoolState();
}

function validateDropToken(token) {
  const nextType = expectedNextType();
  if (token.type !== nextType) {
    const tip = nextType === "spot" ? "当前需要拖入地点。" : "当前需要拖入方向。";
    return { ok: false, reason: `顺序错误：${tip}` };
  }
  if (token.type === "spot") {
    const usedSpotIds = getUsedSpotIds();
    if (usedSpotIds.has(token.value)) {
      return { ok: false, reason: "同一地点不能重复加入路线。" };
    }
  }
  return { ok: true };
}

function addRouteToken(token) {
  const validation = validateDropToken(token);
  if (!validation.ok) {
    setMessage(validation.reason, "warn");
    return;
  }
  routeTokens.push(token);
  renderRouteTokens();
  setMessage("路线已更新。", "ok");
}

function clearRouteOnly() {
  routeTokens = [];
  renderRouteTokens();
  timeline.innerHTML = "";
  userPath.setAttribute("points", "");
  setMessage("已清空路线，请重新拖拽。");
}

function stepPosition(current, command) {
  const vec = DIRECTIONS[command];
  if (!vec) {
    return null;
  }
  const next = { x: current.x + vec.x, y: current.y + vec.y };
  const inRange = next.x >= 0 && next.x <= GRID.cols && next.y >= 0 && next.y <= GRID.rows;
  if (!inRange) {
    return null;
  }
  return next;
}

function buildPath(commands) {
  const start = { x: spotById.gate.x, y: spotById.gate.y, heading: "N" };
  const states = [start];
  const errors = [];
  let current = { ...start };

  commands.forEach((command, index) => {
    const nextPos = stepPosition(current, command);
    if (!DIRECTIONS[command]) {
      errors.push(`第${index + 1}步“${command}”不是有效方向，请使用 N/E/S/W。`);
      return;
    }
    if (!nextPos) {
      errors.push(`第${index + 1}步“${command}”会走出校园网格边界。`);
      return;
    }
    current = { ...nextPos, heading: command };
    states.push(current);
  });

  return { states, errors };
}

function pointEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

function findVisitedSpots(states) {
  const visited = [];
  spots.forEach((spot) => {
    if (states.some((state) => pointEqual(state, spot)) && spot.id !== "gate") {
      visited.push(spot.id);
    }
  });
  return visited;
}

function shortestRoute(from, to) {
  const route = [];
  let current = { ...from };
  while (current.x !== to.x) {
    if (current.x < to.x) {
      route.push("E");
      current.x += 1;
    } else {
      route.push("W");
      current.x -= 1;
    }
  }
  while (current.y !== to.y) {
    if (current.y < to.y) {
      route.push("S");
      current.y += 1;
    } else {
      route.push("N");
      current.y -= 1;
    }
  }
  return route;
}

function updateSpotCard(state) {
  const exact = spots.find((spot) => spot.x === state.x && spot.y === state.y) || spotById.gate;
  spotImage.src = generateSpotImage(exact);
  spotTitle.textContent = exact.name;
  spotDesc.textContent = exact.desc;
}

function headingLabel(heading) {
  const dir = DIRECTIONS[heading] || DIRECTIONS.N;
  return dir.label;
}

function setMessage(text, type = "info") {
  message.textContent = text;
  message.className = "message";
  if (type === "ok") {
    message.classList.add("ok");
  }
  if (type === "warn") {
    message.classList.add("warn");
  }
  if (type === "bad") {
    message.classList.add("bad");
  }
}

function scoreToLevel(score) {
  if (score >= 85) {
    return `优秀（${score}）`;
  }
  if (score >= 70) {
    return `良好（${score}）`;
  }
  if (score >= 60) {
    return `合格（${score}）`;
  }
  return `待改进（${score}）`;
}

function evaluateResult(selectedIds, commands, states, errors) {
  const visited = findVisitedSpots(states);
  const uniqueVisited = new Set(visited);
  const directionTotal = selectedIds.length > 1 ? selectedIds.length - 1 : 0;
  const directionHit = Number(scoreDirection.dataset.hit || 0);
  const directionScore = directionTotal ? Math.round((directionHit / directionTotal) * 100) : 100;

  let routeScore = 100;
  const missingCount = selectedIds.filter((id) => !uniqueVisited.has(id)).length;
  routeScore -= missingCount * 25;
  if (commands.length < selectedIds.length * 2) {
    routeScore -= 15;
  }
  routeScore = Math.max(routeScore, 20);

  let explainScore = 40 + uniqueVisited.size * 20;
  explainScore = Math.min(explainScore, 100);

  let reqScore = 100;
  if (selectedIds.length < 2) {
    reqScore -= 40;
  }
  if (!commands.length) {
    reqScore -= 30;
  }
  if (errors.length > 0) {
    reqScore -= 20;
  }
  if (missingCount > 0) {
    reqScore -= 20;
  }
  reqScore = Math.max(reqScore, 10);

  scoreDirection.textContent = scoreToLevel(directionScore);
  scoreRoute.textContent = scoreToLevel(routeScore);
  scoreExplain.textContent = scoreToLevel(explainScore);
  scoreRequirement.textContent = scoreToLevel(reqScore);

  const avg = Math.round((directionScore + routeScore + explainScore + reqScore) / 4);
  scoreSummary.textContent = `综合评分：${avg} 分。到达景点 ${uniqueVisited.size}/${selectedIds.length}，方向匹配 ${directionHit}/${directionTotal}。`;
}

function updatePathPolyline(states) {
  const points = states
    .map((state) => {
      const { px, py } = cellToPoint(state.x, state.y);
      return `${px},${py}`;
    })
    .join(" ");
  userPath.setAttribute("points", points);
}

function renderTimeline(commands) {
  if (!commands.length) {
    timeline.innerHTML = "<span>暂无路线步骤</span>";
    return;
  }
  timeline.innerHTML = commands
    .map((cmd, i) => `<span>第${i + 1}步：${cmd}</span>`)
    .join("");
}

function clearAnimation() {
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
}

function animate(states, commands, done) {
  clearAnimation();
  let index = 0;
  updatePathPolyline(states);
  const first = states[0];
  const firstPoint = cellToPoint(first.x, first.y);
  playerDot.setAttribute("cx", firstPoint.px);
  playerDot.setAttribute("cy", firstPoint.py);
  fpStatus.textContent = `我在：校门（朝向北）`;
  stepInfo.textContent = "开始出发...";
  updateSpotCard(first);

  animationTimer = setInterval(() => {
    if (index >= commands.length) {
      clearAnimation();
      stepInfo.textContent = "演示结束。";
      if (done) {
        done();
      }
      return;
    }
    index += 1;
    const state = states[index];
    const point = cellToPoint(state.x, state.y);
    playerDot.setAttribute("cx", point.px);
    playerDot.setAttribute("cy", point.py);

    const nowSpot = spots.find((spot) => spot.x === state.x && spot.y === state.y);
    const placeName = nowSpot ? nowSpot.name : `道路节点(${state.x},${state.y})`;
    fpStatus.textContent = `我在：${placeName}（朝向${headingLabel(state.heading)}）`;
    stepInfo.textContent = `第 ${index} 步：向${headingLabel(state.heading)}移动，当前位置 ${placeName}`;
    updateSpotCard(state);
  }, 900);
}

function resetAll() {
  clearAnimation();
  routeTokens = [];
  renderRouteTokens();
  setMessage("已重置，请重新拖拽路线。");
  timeline.innerHTML = "";
  userPath.setAttribute("points", "");
  const gatePoint = cellToPoint(spotById.gate.x, spotById.gate.y);
  playerDot.setAttribute("cx", gatePoint.px);
  playerDot.setAttribute("cy", gatePoint.py);
  fpStatus.textContent = "我在：校门（朝向北）";
  stepInfo.textContent = "等待开始演示...";
  updateSpotCard(spotById.gate);

  [scoreDirection, scoreRoute, scoreExplain, scoreRequirement].forEach((el) => {
    el.textContent = "-";
  });
  scoreDirection.dataset.hit = "0";
  scoreSummary.textContent = "完成演示后自动评分。";
}

function compileRouteFromTokens() {
  if (routeTokens.length < 3) {
    return { error: "请至少拖入 2 个地点与 1 个方向。" };
  }
  if (routeTokens.length % 2 === 0) {
    return { error: "路线必须以地点结束，保持地点与方向交替。" };
  }

  const spotIds = routeTokens.filter((item) => item.type === "spot").map((item) => item.value);
  const routeDirections = routeTokens.filter((item) => item.type === "direction").map((item) => item.value);
  if (spotIds.length < 2) {
    return { error: "请至少拖入 2 个地点。" };
  }

  let cursor = { x: spotById.gate.x, y: spotById.gate.y };
  const commands = [];
  let directionMatch = 0;

  spotIds.forEach((spotId, idx) => {
    const target = spotById[spotId];
    const segment = shortestRoute(cursor, target);
    commands.push(...segment);

    if (idx > 0) {
      const expected = segment[0] || null;
      const provided = routeDirections[idx - 1];
      if (expected && provided === expected) {
        directionMatch += 1;
      }
    }
    cursor = { x: target.x, y: target.y };
  });

  return { commands, spotIds, directionMatch, directionTotal: routeDirections.length };
}

function handleStart() {
  const compiled = compileRouteFromTokens();
  if (compiled.error) {
    setMessage(compiled.error, "warn");
    return;
  }

  const { commands, spotIds, directionMatch, directionTotal } = compiled;
  scoreDirection.dataset.hit = String(directionMatch);

  const { states, errors } = buildPath(commands);
  renderTimeline(commands);
  animate(states, commands, () => {
    evaluateResult(spotIds, commands, states, errors);
    if (errors.length > 0) {
      setMessage(`演示完成，但有 ${errors.length} 处路径问题。`, "warn");
    } else {
      if (directionTotal > 0 && directionMatch < directionTotal) {
        setMessage(`演示完成。方向匹配 ${directionMatch}/${directionTotal}，评分已更新。`, "warn");
      } else {
        setMessage("演示完成，评分已生成。", "ok");
      }
    }
  });
}

function handleDragStart(event) {
  const target = event.target.closest(".drag-item");
  if (!target || target.disabled) {
    return;
  }

  const payload = {
    type: target.dataset.type,
    value: target.dataset.value
  };
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", JSON.stringify(payload));
}

function handleDrop(event) {
  event.preventDefault();
  routeDropZone.classList.remove("drag-over");
  const raw = event.dataTransfer.getData("text/plain");
  if (!raw) {
    return;
  }
  try {
    const token = JSON.parse(raw);
    addRouteToken(token);
  } catch (err) {
    setMessage("拖拽数据无效，请重试。", "bad");
  }
}

function init() {
  renderSpotPool();
  renderMapBase();
  directionPool.addEventListener("dragstart", handleDragStart);
  spotPool.addEventListener("dragstart", handleDragStart);

  routeDropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    routeDropZone.classList.add("drag-over");
  });
  routeDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    routeDropZone.classList.add("drag-over");
  });
  routeDropZone.addEventListener("dragleave", (event) => {
    if (!routeDropZone.contains(event.relatedTarget)) {
      routeDropZone.classList.remove("drag-over");
    }
  });
  routeDropZone.addEventListener("drop", handleDrop);

  updateSpotCard(spotById.gate);
  resetAll();
}

startBtn.addEventListener("click", handleStart);
clearRouteBtn.addEventListener("click", clearRouteOnly);
resetBtn.addEventListener("click", resetAll);

init();
