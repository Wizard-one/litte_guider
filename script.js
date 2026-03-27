const DIRECTIONS = {
  N: { label: "北" },
  E: { label: "东" },
  S: { label: "南" },
  W: { label: "西" }
};

const MAP_COORDS = {
  DinosaurCorner: { x: 1, y: 1 },
  ArtSpace: { x: 3, y: 1 },
  YoungSwallowsSoar: { x: 5, y: 1 },
  FootballPark: { x: 1, y: 3 },
  DonutGarden: { x: 3, y: 3 },
  FriendshipPavilion: { x: 5, y: 3 }
};

const MAP_LAYOUT = {
  offsetX: 70,
  offsetY: 70,
  stepX: 95,
  stepY: 80
};

const spotPool = document.getElementById("spotPool");
const directionPool = document.getElementById("directionPool");
const routeDropZone = document.getElementById("routeDropZone");
const routeTimeline = document.getElementById("routeTimeline");
const routePlaceholder = document.getElementById("routePlaceholder");
const startBtn = document.getElementById("startBtn");
const clearRouteBtn = document.getElementById("clearRouteBtn");
const resetBtn = document.getElementById("resetBtn");
const message = document.getElementById("message");
const stepInfo = document.getElementById("stepInfo");
const spotImage = document.getElementById("spotImage");
const spotTitle = document.getElementById("spotTitle");
const spotDesc = document.getElementById("spotDesc");
const roads = document.getElementById("roads");
const spotLayer = document.getElementById("spotLayer");
const userPath = document.getElementById("userPath");
const playerAvatar = document.getElementById("playerAvatar");

let routeTokens = [];
let spots = [];
let spotById = {};
let animationFrameId = null;
let isPlaying = false;

function getPointBySpotId(spotId) {
  const spot = spotById[spotId];
  return {
    px: MAP_LAYOUT.offsetX + spot.x * MAP_LAYOUT.stepX,
    py: MAP_LAYOUT.offsetY + spot.y * MAP_LAYOUT.stepY
  };
}

function setAvatarPosition(point) {
  playerAvatar.setAttribute("x", String(point.px - 17));
  playerAvatar.setAttribute("y", String(point.py - 17));
}

function directionBetween(from, to) {
  if (from.x === to.x) {
    return from.y > to.y ? "N" : "S";
  }
  if (from.y === to.y) {
    return from.x > to.x ? "W" : "E";
  }
  return null;
}

function getUsedSpotIds() {
  return new Set(routeTokens.filter((item) => item.type === "spot").map((item) => item.value));
}

function expectedNextType() {
  return routeTokens.length % 2 === 0 ? "spot" : "direction";
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

function routeTokenLabel(token) {
  if (token.type === "spot") {
    return spotById[token.value].displayName;
  }
  return `向${DIRECTIONS[token.value].label}`;
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

function renderSpotPool() {
  spotPool.innerHTML = spots
    .map(
      (spot) => `
      <button class="drag-item spot-item" draggable="true" data-type="spot" data-value="${spot.id}">
        ${spot.displayName}
      </button>
    `
    )
    .join("");
}

function getUniqueEdges() {
  const edgeSet = new Set();
  const edges = [];
  spots.forEach((spot) => {
    spot.connectedTo.forEach((nextId) => {
      const pair = [spot.id, nextId].sort().join("|");
      if (!edgeSet.has(pair) && spotById[nextId]) {
        edgeSet.add(pair);
        edges.push([spot.id, nextId]);
      }
    });
  });
  return edges;
}

function renderMap() {
  const roadMarkup = getUniqueEdges()
    .map(([fromId, toId]) => {
      const from = getPointBySpotId(fromId);
      const to = getPointBySpotId(toId);
      return `<line x1='${from.px}' y1='${from.py}' x2='${to.px}' y2='${to.py}' stroke='#94a3b8' stroke-width='6' stroke-linecap='round'/>`;
    })
    .join("");

  roads.innerHTML = roadMarkup;

  const spotMarkup = spots
    .map((spot) => {
      const p = getPointBySpotId(spot.id);
      return `
      <g>
        <circle cx='${p.px}' cy='${p.py}' r='16' fill='white' stroke='#2563eb' stroke-width='3'></circle>
        <text x='${p.px}' y='${p.py + 36}' text-anchor='middle' font-size='14' fill='#1e293b'>${spot.displayName}</text>
      </g>
      `;
    })
    .join("");

  spotLayer.innerHTML = spotMarkup;
}

function validateDropToken(token) {
  if (isPlaying) {
    return { ok: false, reason: "演示进行中，暂时不能修改路线。" };
  }

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

function clearAnimation() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  isPlaying = false;
}

function resetAvatar() {
  playerAvatar.setAttribute("visibility", "hidden");
  userPath.setAttribute("points", "");
}

function resetSpotCard() {
  spotTitle.textContent = "未开始";
  spotDesc.textContent = "拖拽并播放路线后，会展示当前到达的景点。";
  spotImage.removeAttribute("src");
}

function clearRouteOnly() {
  if (isPlaying) {
    setMessage("演示进行中，暂时不能清空。", "warn");
    return;
  }
  routeTokens = [];
  renderRouteTokens();
  resetAvatar();
  resetSpotCard();
  stepInfo.textContent = "等待开始演示...";
  setMessage("已清空路线，请重新拖拽。", "info");
}

function resetAll() {
  clearAnimation();
  routeTokens = [];
  renderRouteTokens();
  resetAvatar();
  resetSpotCard();
  stepInfo.textContent = "等待开始演示...";
  setMessage("已重置全部内容。", "info");
}

function updateSpotCard(spotId) {
  const spot = spotById[spotId];
  if (!spot) {
    return;
  }
  const nextNames = spot.connectedTo.map((id) => spotById[id]?.displayName).filter(Boolean);
  spotTitle.textContent = spot.displayName;
  spotDesc.textContent = nextNames.length ? `可前往：${nextNames.join("、")}` : "当前地点没有可通行节点。";
  spotImage.src = `img/${encodeURIComponent(spot.image)}`;
}

function buildPathFromTokens() {
  if (routeTokens.length < 5) {
    return { error: "请至少拖入3个地点和2个方向。" };
  }
  if (routeTokens.length % 2 === 0) {
    return { error: "路线必须以地点结束，保持地点与方向交替。" };
  }

  const spotIds = routeTokens.filter((item) => item.type === "spot").map((item) => item.value);
  const directions = routeTokens.filter((item) => item.type === "direction").map((item) => item.value);

  if (spotIds.length < 3) {
    return { error: "路径需要经过3个地点才合法。" };
  }

  for (let i = 0; i < spotIds.length - 1; i += 1) {
    const from = spotById[spotIds[i]];
    const to = spotById[spotIds[i + 1]];
    const provided = directions[i];
    const expected = directionBetween(from, to);

    const connected = from.connectedTo.includes(to.id);
    const directionCorrect = expected && provided === expected;

    if (!connected || !directionCorrect) {
      return {
        error: {
          fromName: from.displayName,
          directionLabel: DIRECTIONS[provided]?.label || provided
        }
      };
    }
  }

  return { spotIds };
}

function updatePathPolyline(spotIds) {
  const points = spotIds
    .map((spotId) => {
      const p = getPointBySpotId(spotId);
      return `${p.px},${p.py}`;
    })
    .join(" ");
  userPath.setAttribute("points", points);
}

function animateBetween(fromPoint, toPoint, duration, onDone) {
  const start = performance.now();

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const x = fromPoint.px + (toPoint.px - fromPoint.px) * progress;
    const y = fromPoint.py + (toPoint.py - fromPoint.py) * progress;
    setAvatarPosition({ px: x, py: y });

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(frame);
      return;
    }

    onDone();
  }

  animationFrameId = requestAnimationFrame(frame);
}

function animatePath(spotIds, done) {
  if (!spotIds.length) {
    done();
    return;
  }

  isPlaying = true;
  playerAvatar.setAttribute("visibility", "visible");

  let index = 0;
  const firstPoint = getPointBySpotId(spotIds[0]);
  setAvatarPosition(firstPoint);
  updateSpotCard(spotIds[0]);
  stepInfo.textContent = `起点：${spotById[spotIds[0]].displayName}`;

  function playNextSegment() {
    if (index >= spotIds.length - 1) {
      isPlaying = false;
      done();
      return;
    }

    const fromId = spotIds[index];
    const toId = spotIds[index + 1];
    const fromPoint = getPointBySpotId(fromId);
    const toPoint = getPointBySpotId(toId);

    stepInfo.textContent = `从 ${spotById[fromId].displayName} 前往 ${spotById[toId].displayName}...`;

    animateBetween(fromPoint, toPoint, 800, () => {
      index += 1;
      updateSpotCard(toId);
      stepInfo.textContent = `已到达：${spotById[toId].displayName}`;
      playNextSegment();
    });
  }

  playNextSegment();
}

function handleStart() {
  if (isPlaying) {
    setMessage("演示进行中，请稍候。", "warn");
    return;
  }

  const compiled = buildPathFromTokens();
  if (compiled.error) {
    if (typeof compiled.error === "string") {
      setMessage(compiled.error, "warn");
      return;
    }

    const errorText = `x 无法通行: 从${compiled.error.fromName} 向 ${compiled.error.directionLabel} 没有路哦`;
    setMessage(errorText, "bad");
    alert(errorText);
    return;
  }

  const { spotIds } = compiled;
  updatePathPolyline(spotIds);

  animatePath(spotIds, () => {
    const startName = spotById[spotIds[0]].displayName;
    const endName = spotById[spotIds[spotIds.length - 1]].displayName;
    const okText = `棒棒哒, 你成功从 ${startName} 走到 ${endName} 啦`;
    setMessage(okText, "ok");
    alert(okText);
  });
}

function handleDragStart(event) {
  const target = event.target.closest(".drag-item");
  if (!target || target.disabled || isPlaying) {
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
  } catch (_err) {
    setMessage("拖拽数据无效，请重试。", "bad");
  }
}

function normalizeSpots(locData) {
  const ids = Object.keys(locData);
  return ids.map((id, index) => {
    const info = locData[id] || {};
    const fallback = { x: index % 3, y: Math.floor(index / 3) };
    const point = MAP_COORDS[id] || fallback;

    return {
      id,
      displayName: info.displayName || id,
      image: info.image || "",
      connectedTo: Array.isArray(info.connectedTo) ? info.connectedTo : [],
      x: point.x,
      y: point.y
    };
  });
}

async function init() {
  const response = await fetch("loc.json");
  if (!response.ok) {
    throw new Error("loc.json 读取失败");
  }

  const locData = await response.json();
  spots = normalizeSpots(locData);
  spotById = Object.fromEntries(spots.map((spot) => [spot.id, spot]));

  renderSpotPool();
  renderMap();
  renderRouteTokens();
  resetAvatar();
  resetSpotCard();

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

  startBtn.addEventListener("click", handleStart);
  clearRouteBtn.addEventListener("click", clearRouteOnly);
  resetBtn.addEventListener("click", resetAll);

  setMessage("请先拖拽至少3个地点与方向，再开始演示。", "info");
}

init().catch((error) => {
  setMessage(`初始化失败：${error.message}`, "bad");
});
