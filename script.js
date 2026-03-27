const DIRECTIONS = {
  N: { label: "北" },
  E: { label: "东" },
  S: { label: "南" },
  W: { label: "西" }
};

const BASE_MAP_COORDS = {
  ArtSpace: { px: 607, py: 108 },
  YoungSwallowsSoar: { px: 284, py: 278 },
  DinosaurCorner: { px: 608, py: 278 },
  FootballPark: { px: 608, py: 468 },
  DonutGarden: { px: 607, py: 654 },
  FriendshipPavilion: { px: 438, py: 707 }
};

const CALIBRATION_STORAGE_KEY = "littleGuider.mapCalibration.v1";

const spotPool = document.getElementById("spotPool");
const directionPool = document.getElementById("directionPool");
const routeDropZone = document.getElementById("routeDropZone");
const routeTimeline = document.getElementById("routeTimeline");
const routePlaceholder = document.getElementById("routePlaceholder");
const trashDropZone = document.getElementById("trashDropZone");
const startBtn = document.getElementById("startBtn");
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
const campusMap = document.getElementById("campusMap");
const calibrateToggleBtn = document.getElementById("calibrateToggleBtn");
const resetCalibrateBtn = document.getElementById("resetCalibrateBtn");
const calibrateStatus = document.getElementById("calibrateStatus");

let routeTokens = [];
let spots = [];
let spotById = {};
let animationFrameId = null;
let isPlaying = false;
let isCalibrationMode = false;
let draggingSpotId = null;
let calibrationOffsets = {};
let loadedLocations = {};

function getEmbeddedLocConfig() {
  if (typeof window === "undefined") {
    return null;
  }
  const embedded = window.__LOC_DATA__;
  return embedded && typeof embedded === "object" ? embedded : null;
}

async function loadLocConfig() {
  try {
    const response = await fetch("loc.json");
    if (!response.ok) {
      throw new Error("loc.json 读取失败");
    }
    return await response.json();
  } catch (_error) {
    const embedded = getEmbeddedLocConfig();
    if (embedded) {
      return embedded;
    }
    throw new Error("loc.json 读取失败，且未找到内置数据");
  }
}

function getSpotIdsFromTokens() {
  return routeTokens.filter((item) => item.type === "spot").map((item) => item.value);
}

function toDirectionArrow(dirCode) {
  if (dirCode === "N") return "↑";
  if (dirCode === "E") return "→";
  if (dirCode === "S") return "↓";
  if (dirCode === "W") return "←";
  return "";
}

function loadCalibrationOffsets() {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (!raw) {
      calibrationOffsets = {};
      return;
    }
    const parsed = JSON.parse(raw);
    calibrationOffsets = parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    calibrationOffsets = {};
  }
}

function mergeCalibrationOffsets(fromJson, fromStorage) {
  const merged = { ...(fromStorage || {}) };
  if (!fromJson || typeof fromJson !== "object") {
    return merged;
  }
  Object.entries(fromJson).forEach(([spotId, offset]) => {
    if (!offset || typeof offset !== "object") {
      return;
    }
    merged[spotId] = {
      dx: Number(offset.dx || 0),
      dy: Number(offset.dy || 0)
    };
  });
  return merged;
}

function splitLocConfig(raw) {
  const hasLocations = raw && typeof raw === "object" && raw.locations && typeof raw.locations === "object";
  if (hasLocations) {
    return {
      locations: raw.locations,
      calibrationOffsets: raw.calibrationOffsets || {}
    };
  }

  const extractedOffsets = {};
  if (raw && typeof raw === "object") {
    Object.entries(raw).forEach(([spotId, cfg]) => {
      if (!cfg || typeof cfg !== "object") {
        return;
      }
      const mergedOffset = cfg.offset || cfg.calibrationOffset;
      if (mergedOffset && typeof mergedOffset === "object") {
        extractedOffsets[spotId] = {
          dx: Number(mergedOffset.dx || 0),
          dy: Number(mergedOffset.dy || 0)
        };
        return;
      }
      if ("dx" in cfg || "dy" in cfg) {
        extractedOffsets[spotId] = {
          dx: Number(cfg.dx || 0),
          dy: Number(cfg.dy || 0)
        };
      }
    });
  }

  return {
    locations: raw || {},
    calibrationOffsets: extractedOffsets
  };
}

function saveCalibrationOffsets() {
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibrationOffsets));
}

function captureCalibrationOffsets() {
  const next = {};
  spots.forEach((spot) => {
    const base = BASE_MAP_COORDS[spot.id];
    if (!base) {
      return;
    }
    const dx = Math.round(spot.px - base.px);
    const dy = Math.round(spot.py - base.py);
    if (dx !== 0 || dy !== 0) {
      next[spot.id] = { dx, dy };
    }
  });
  calibrationOffsets = next;
  saveCalibrationOffsets();
}

function updateCalibrationStatus(text) {
  calibrateStatus.textContent = text;
}

function updateCalibrationUI() {
  calibrateToggleBtn.textContent = isCalibrationMode ? "关闭点位微调" : "开启点位微调";
  campusMap.classList.toggle("is-calibrating", isCalibrationMode);
  if (isCalibrationMode) {
    updateCalibrationStatus("微调进行中：可拖动地图上的地点图标进行对齐。拖完会自动保存。\n");
  } else {
    updateCalibrationStatus("微调已关闭。开启后可拖动地图上的地点图标对齐参考图。");
  }
}

function buildLocJsonWithOffsets() {
  const next = {};
  spots.forEach((spot) => {
    const base = loadedLocations[spot.id] || {};
    const offset = calibrationOffsets[spot.id] || { dx: 0, dy: 0 };
    next[spot.id] = {
      ...base,
      displayName: spot.displayName,
      image: spot.image,
      connectedTo: Array.isArray(spot.connectedTo) ? [...spot.connectedTo] : [],
      directionTo: spot.directionTo || {},
      offset: {
        dx: Number(offset.dx || 0),
        dy: Number(offset.dy || 0)
      }
    };
  });
  return next;
}

function downloadUpdatedLocJson() {
  const merged = buildLocJsonWithOffsets();
  const text = `${JSON.stringify(merged, null, 2)}\n`;
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "loc.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getSvgPointerPoint(event) {
  const pt = campusMap.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const transformed = pt.matrixTransform(campusMap.getScreenCTM().inverse());
  return { px: transformed.x, py: transformed.y };
}

function getPointBySpotId(spotId) {
  const spot = spotById[spotId];
  return { px: spot.px, py: spot.py };
}

function setAvatarPosition(point) {
  playerAvatar.setAttribute("x", String(point.px - 22));
  playerAvatar.setAttribute("y", String(point.py - 22));
}

function validateSegment(fromId, providedDir, toId) {
  const from = spotById[fromId];
  const to = spotById[toId];
  if (!from || !to) {
    return {
      ok: false,
      errorText: `x 无法通行: 从${from?.displayName || "未知地点"} 向 ${DIRECTIONS[providedDir]?.label || providedDir} 没有路哦`
    };
  }

  const expectedDir = from.directionTo?.[to.id];
  const isConnected = from.connectedTo.includes(to.id);
  const isDirectionRight = expectedDir && providedDir === expectedDir;

  if (!isConnected || !isDirectionRight) {
    return {
      ok: false,
      errorText: `x 无法通行: 从${from.displayName} 向 ${DIRECTIONS[providedDir]?.label || providedDir} 没有路哦`
    };
  }

  return { ok: true };
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
    item.draggable = true;
    item.dataset.routeIndex = String(index);
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

function normalizeRouteTokens() {
  const normalized = [];
  const usedSpotIds = new Set();

  for (let i = 0; i < routeTokens.length; i += 1) {
    const token = routeTokens[i];
    const expected = normalized.length % 2 === 0 ? "spot" : "direction";
    if (token.type !== expected) {
      break;
    }
    if (token.type === "spot") {
      if (usedSpotIds.has(token.value)) {
        break;
      }
      usedSpotIds.add(token.value);
    }
    normalized.push(token);
  }

  routeTokens = normalized;
}

function removeRouteTokenByIndex(index) {
  if (isPlaying || index < 0 || index >= routeTokens.length) {
    return;
  }

  // Delete the dropped token and all subsequent tokens to keep the sequence valid.
  routeTokens = routeTokens.slice(0, index);
  normalizeRouteTokens();
  renderRouteTokens();

  const spotIds = getSpotIdsFromTokens();
  updatePathPolyline(spotIds);
  if (!spotIds.length) {
    resetAvatar();
    resetSpotCard();
    stepInfo.textContent = "等待开始演示...";
  } else {
    const lastSpotId = spotIds[spotIds.length - 1];
    updateSpotCard(lastSpotId);
    playerAvatar.setAttribute("visibility", "visible");
    setAvatarPosition(getPointBySpotId(lastSpotId));
    stepInfo.textContent = `当前停留：${spotById[lastSpotId].displayName}`;
  }

  setMessage("已删除路线项。", "ok");
}

function renderSpotPool() {
  spotPool.innerHTML = spots
    .map(
      (spot) => `
      <button class="drag-item spot-item" draggable="true" data-type="spot" data-value="${spot.id}">
        <img class="spot-thumb" src="img/${encodeURIComponent(spot.image)}" alt="${spot.displayName}" draggable="false" />
        <span class="spot-name">${spot.displayName}</span>
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

function buildEdgeMarkup(fromId, toId) {
  const from = getPointBySpotId(fromId);
  const to = getPointBySpotId(toId);

  const dx = Math.abs(to.px - from.px);
  const dy = Math.abs(to.py - from.py);

  // Long edges are drawn as arcs so direct links are visually independent from short segments.
  const isLongEdge = dx + dy >= 420;
  if (!isLongEdge) {
    return `<line x1='${from.px}' y1='${from.py}' x2='${to.px}' y2='${to.py}' stroke='#ef4444' stroke-width='10' stroke-linecap='round' opacity='0.9'/>`;
  }

  const midX = (from.px + to.px) / 2;
  const midY = (from.py + to.py) / 2;
  const offsetX = from.py === to.py ? 0 : 22;
  const offsetY = from.py === to.py ? -82 : -30;
  const ctrlX = midX + offsetX;
  const ctrlY = midY + offsetY;
  return `<path d='M ${from.px} ${from.py} Q ${ctrlX} ${ctrlY} ${to.px} ${to.py}' stroke='#ef4444' stroke-width='9' fill='none' stroke-linecap='round' opacity='0.9'/>`;
}

function renderMap() {
  // Keep the roads layer empty so no lines are shown between spots.
  roads.innerHTML = "";

  const spotMarkup = spots
    .map((spot) => {
      const p = getPointBySpotId(spot.id);
      const dirTips = Object.entries(spot.directionTo || {})
        .map(([toId, dir]) => `${toDirectionArrow(dir)} ${spotById[toId]?.displayName || toId}`)
        .join(" | ");
      return `
      <g class='map-spot' data-spot-id='${spot.id}'>
        <image href='img/loc_icon.webp' x='${p.px - 27}' y='${p.py - 48}' width='54' height='54'></image>
        <text x='${p.px}' y='${p.py + 28}' text-anchor='middle' font-size='20' fill='#111827' stroke='white' stroke-width='6' paint-order='stroke'>${spot.displayName}</text>
        <text x='${p.px}' y='${p.py + 28}' text-anchor='middle' font-size='20' fill='#111827'>${spot.displayName}</text>
        <title>${spot.displayName}${dirTips ? `\n可达：${dirTips}` : ""}</title>
      </g>
      `;
    })
    .join("");

  spotLayer.innerHTML = spotMarkup;
}

function syncTransientVisuals() {
  const ids = getSpotIdsFromTokens();
  if (ids.length > 0) {
    updatePathPolyline(ids);
  }
  if (playerAvatar.getAttribute("visibility") === "visible" && ids.length > 0) {
    const last = ids[ids.length - 1];
    setAvatarPosition(getPointBySpotId(last));
  }
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

  if (token.type === "spot") {
    updateSpotCard(token.value);
    const spotIds = getSpotIdsFromTokens();
    if (spotIds.length === 1) {
      const firstPoint = getPointBySpotId(spotIds[0]);
      playerAvatar.setAttribute("visibility", "visible");
      setAvatarPosition(firstPoint);
      updatePathPolyline(spotIds);
      stepInfo.textContent = `已选择起点：${spotById[spotIds[0]].displayName}`;
      setMessage("已选择起点，请继续拖拽方向与下一地点。", "ok");
      return;
    }
  }

  if (token.type === "spot" && routeTokens.length >= 3) {
    const fromToken = routeTokens[routeTokens.length - 3];
    const directionToken = routeTokens[routeTokens.length - 2];
    const toToken = routeTokens[routeTokens.length - 1];

    const segmentResult = validateSegment(fromToken.value, directionToken.value, toToken.value);
    if (!segmentResult.ok) {
      routeTokens.splice(routeTokens.length - 2, 2);
      renderRouteTokens();
      updateSpotCard(fromToken.value);
      updatePathPolyline(getSpotIdsFromTokens());
      setMessage(segmentResult.errorText, "bad");
      alert(segmentResult.errorText);
      return;
    }

    const fromPoint = getPointBySpotId(fromToken.value);
    const toPoint = getPointBySpotId(toToken.value);
    isPlaying = true;
    stepInfo.textContent = `从 ${spotById[fromToken.value].displayName} 前往 ${spotById[toToken.value].displayName}...`;
    animateBetween(fromPoint, toPoint, 800, () => {
      isPlaying = false;
      updateSpotCard(toToken.value);
      updatePathPolyline(getSpotIdsFromTokens());
      stepInfo.textContent = `已到达：${spotById[toToken.value].displayName}`;
      const spotCount = getSpotIdsFromTokens().length;
      if (spotCount >= 3) {
        setMessage("当前路径合法，可点击“开始演示”重播完整路线。", "ok");
      } else {
        setMessage("该段路径合法，请继续拖拽下一段。", "ok");
      }
    });
    return;
  }

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

  const spotIds = getSpotIdsFromTokens();
  const directions = routeTokens.filter((item) => item.type === "direction").map((item) => item.value);

  if (spotIds.length < 3) {
    return { error: "路径需要经过3个地点才合法。" };
  }

  for (let i = 0; i < spotIds.length - 1; i += 1) {
    const fromId = spotIds[i];
    const toId = spotIds[i + 1];
    const provided = directions[i];
    const segmentResult = validateSegment(fromId, provided, toId);
    if (!segmentResult.ok) {
      return { error: segmentResult.errorText };
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
    setMessage(compiled.error, "bad");
    alert(compiled.error);
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
  if (isPlaying) {
    return;
  }

  const routeToken = event.target.closest(".route-token");
  if (routeToken && routeToken.dataset.routeIndex) {
    const payload = {
      type: "route-token",
      value: Number(routeToken.dataset.routeIndex)
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    return;
  }

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

function handleSpotPreviewClick(event) {
  const target = event.target.closest(".spot-item");
  if (!target) {
    return;
  }
  const spotId = target.dataset.value;
  if (!spotById[spotId]) {
    return;
  }
  updateSpotCard(spotId);
  setMessage(`已选中预览：${spotById[spotId].displayName}`, "ok");
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

function handleTrashDrop(event) {
  event.preventDefault();
  trashDropZone.classList.remove("drag-over");

  const raw = event.dataTransfer.getData("text/plain");
  if (!raw) {
    return;
  }

  try {
    const payload = JSON.parse(raw);
    if (payload.type === "route-token") {
      removeRouteTokenByIndex(Number(payload.value));
    }
  } catch (_error) {
    setMessage("删除失败：无效拖拽数据。", "warn");
  }
}

function handleMapPointerDown(event) {
  if (!isCalibrationMode || isPlaying) {
    return;
  }
  const marker = event.target.closest(".map-spot");
  if (!marker) {
    return;
  }
  draggingSpotId = marker.dataset.spotId;
  campusMap.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handleMapPointerMove(event) {
  if (!isCalibrationMode || !draggingSpotId) {
    return;
  }
  const spot = spotById[draggingSpotId];
  if (!spot) {
    return;
  }
  const p = getSvgPointerPoint(event);
  spot.px = Math.round(p.px);
  spot.py = Math.round(p.py);
  renderMap();
  syncTransientVisuals();
}

function handleMapPointerUp(event) {
  if (!draggingSpotId) {
    return;
  }
  campusMap.releasePointerCapture(event.pointerId);
  draggingSpotId = null;
  captureCalibrationOffsets();
  updateCalibrationStatus("点位已保存到本地。关闭微调时会自动导出更新后的 loc.json。\n");
}

function toggleCalibrationMode() {
  const wasCalibrationMode = isCalibrationMode;
  isCalibrationMode = !isCalibrationMode;
  if (wasCalibrationMode && !isCalibrationMode) {
    captureCalibrationOffsets();
    downloadUpdatedLocJson();
    setMessage("已关闭微调，并自动下载更新后的 loc.json。", "ok");
  }
  updateCalibrationUI();
}

function resetCalibration() {
  if (isPlaying) {
    setMessage("演示进行中，暂时不能重置点位。", "warn");
    return;
  }
  calibrationOffsets = {};
  saveCalibrationOffsets();
  spots.forEach((spot) => {
    const base = BASE_MAP_COORDS[spot.id];
    if (base) {
      spot.px = base.px;
      spot.py = base.py;
    }
  });
  renderMap();
  syncTransientVisuals();
  setMessage("点位微调已重置。", "ok");
  updateCalibrationStatus("点位已恢复为默认坐标。若需要可重新开启微调。");
}

function normalizeSpots(locData) {
  const ids = Object.keys(locData);
  return ids.map((id, index) => {
    const info = locData[id] || {};
    const fallback = { px: 120 + (index % 3) * 260, py: 120 + Math.floor(index / 3) * 300 };
    const basePoint = BASE_MAP_COORDS[id] || fallback;
    const offset = calibrationOffsets[id] || { dx: 0, dy: 0 };
    const point = {
      px: basePoint.px + Number(offset.dx || 0),
      py: basePoint.py + Number(offset.dy || 0)
    };

    return {
      id,
      displayName: info.displayName || id,
      image: info.image || "",
      connectedTo: Array.isArray(info.connectedTo) ? info.connectedTo : [],
      directionTo: info.directionTo || {},
      px: point.px,
      py: point.py
    };
  });
}

async function init() {
  loadCalibrationOffsets();
  const rawConfig = await loadLocConfig();
  const { locations, calibrationOffsets: jsonOffsets } = splitLocConfig(rawConfig);
  loadedLocations = locations || {};
  calibrationOffsets = mergeCalibrationOffsets(jsonOffsets, calibrationOffsets);
  saveCalibrationOffsets();

  spots = normalizeSpots(locations);
  spotById = Object.fromEntries(spots.map((spot) => [spot.id, spot]));

  renderSpotPool();
  renderMap();
  renderRouteTokens();
  resetAvatar();
  resetSpotCard();

  directionPool.addEventListener("dragstart", handleDragStart);
  spotPool.addEventListener("dragstart", handleDragStart);
  spotPool.addEventListener("click", handleSpotPreviewClick);
  campusMap.addEventListener("pointerdown", handleMapPointerDown);
  campusMap.addEventListener("pointermove", handleMapPointerMove);
  campusMap.addEventListener("pointerup", handleMapPointerUp);
  campusMap.addEventListener("pointercancel", handleMapPointerUp);

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

  routeTimeline.addEventListener("dragstart", handleDragStart);

  trashDropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    trashDropZone.classList.add("drag-over");
  });
  trashDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    trashDropZone.classList.add("drag-over");
  });
  trashDropZone.addEventListener("dragleave", (event) => {
    if (!trashDropZone.contains(event.relatedTarget)) {
      trashDropZone.classList.remove("drag-over");
    }
  });
  trashDropZone.addEventListener("drop", handleTrashDrop);

  startBtn.addEventListener("click", handleStart);
  resetBtn.addEventListener("click", resetAll);
  calibrateToggleBtn.addEventListener("click", toggleCalibrationMode);
  resetCalibrateBtn.addEventListener("click", resetCalibration);

  updateCalibrationUI();

  setMessage("请先拖拽至少3个地点与方向，再开始演示。", "info");
}

init().catch((error) => {
  setMessage(`初始化失败：${error.message}`, "bad");
});
