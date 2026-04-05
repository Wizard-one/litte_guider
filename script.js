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

// const CALIBRATION_STORAGE_KEY = "littleGuider.mapCalibration.v1";

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
const spotOverlay = document.querySelector(".spot-overlay");
const appRoot = document.querySelector(".app");
const welcomeScreen = document.getElementById("welcomeScreen");
const appScreen = document.getElementById("appScreen");
const backToWelcomeBtn = document.getElementById("backToWelcomeBtn");
const entryCards = document.querySelectorAll(".entry-card");
const appModeTitle = document.getElementById("appModeTitle");
const appModeSubtitle = document.getElementById("appModeSubtitle");
const evaluationModal = document.getElementById("evaluationModal");
const evaluationGrid = document.getElementById("evaluationGrid");
const evaluationHint = document.getElementById("evaluationHint");
const evaluationCloseBtn = document.getElementById("evaluationCloseBtn");
const evaluationTitle = document.getElementById("evaluationTitle");

const MODE_CONFIG = {
  art: {
    title: "🎨 帮助美术老师规划写生路线",
    subtitle: "【我在艺趣空间看展。欣赏完同学们的作品后一路向南走，最后向西到达友谊之亭。】"
  },
  sport: {
    title: "⚽ 帮助体育老师规划运动路线",
    subtitle: "【我在校训石拍完照，想去参观足球乐园和恐龙角，最后回到雏燕奋飞】"
  },
  custom: {
    title: "🗺️ 自主设计校园游览路线",
    subtitle: "请按“地点 → 方向 → 地点”拖拽路线，系统会按地图道路播放你的移动路线哦。"
  }
};

let routeTokens = [];
let spots = [];
let spotById = {};
let animationFrameId = null;
let isPlaying = false;
let isCalibrationMode = false;
let draggingSpotId = null;
let calibrationOffsets = {};
let loadedLocations = {};
let touchDragState = null;
let currentMode = "custom";
let evaluationAnimationTimerIds = [];

const ARRIVAL_DWELL_MS = 700;
const TOUCH_DRAG_THRESHOLD = 8;
const MESSAGE_AVATAR_SRC = "img/avatar.png";
const EVALUATION_TITLE_DEFAULT = "路线评价";
const EVALUATION_TITLE_ERROR = "路线提示";
const STAR_SOUND_SRCS = [
  "audio/star1.wav",
  "audio/star2.wav",
  "audio/star3.wav",
  "audio/star4.wav"
];
const COMPLETE_SOUND_SRC = "audio/complete.wav";
const ERROR_SOUND_SRC = "audio/error.mp3";

const starSounds = STAR_SOUND_SRCS.map((src) => {
  const audio = new Audio(src);
  audio.preload = "auto";
  return audio;
});
const completeSound = new Audio(COMPLETE_SOUND_SRC);
completeSound.preload = "auto";
const errorSound = new Audio(ERROR_SOUND_SRC);
errorSound.preload = "auto";

function playSound(audio) {
  if (!audio) {
    return;
  }
  try {
    audio.pause();
    audio.currentTime = 0;
    const promise = audio.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch(() => {});
    }
  } catch (_error) {
    // Ignore playback failures caused by browser autoplay policies.
  }
}

function playSoundAndWait(audio, onDone, fallbackMs = 360) {
  if (!audio) {
    onDone();
    return;
  }

  let finished = false;
  let fallbackTimerId = null;

  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    if (fallbackTimerId) {
      clearTimeout(fallbackTimerId);
    }
    audio.removeEventListener("ended", finish);
    onDone();
  };

  audio.addEventListener("ended", finish);
  playSound(audio);

  const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
    ? Math.round(audio.duration * 1000) + 120
    : fallbackMs;
  fallbackTimerId = setTimeout(finish, durationMs);
  evaluationAnimationTimerIds.push(fallbackTimerId);
}

function scheduleEvaluationStep(nextStep, delayMs = 280) {
  const timerId = setTimeout(nextStep, delayMs);
  evaluationAnimationTimerIds.push(timerId);
}

function stopSound(audio) {
  if (!audio) {
    return;
  }
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch (_error) {
    // Ignore stop failures.
  }
}

function stopEvaluationSounds() {
  [...starSounds, completeSound, errorSound].forEach(stopSound);
}

function shouldUseFixedScaleLayout() {
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const largeScreen = Math.max(window.innerWidth, window.innerHeight) >= 900;
  return isCoarsePointer && largeScreen;
}

function applyFixedScaleLayout() {
  const activeScreen = document.querySelector(".scale-target.is-active");
  if (!activeScreen) {
    return;
  }

  const useFixedScale = shouldUseFixedScaleLayout();
  document.body.classList.toggle("fixed-scale-layout", useFixedScale);

  document.querySelectorAll(".scale-target").forEach((screen) => {
    screen.style.left = "";
    screen.style.top = "";
    screen.style.transform = "";
  });

  if (!useFixedScale) {
    return;
  }

  activeScreen.style.transform = "scale(1)";

  const baseWidth = activeScreen.offsetWidth;
  const baseHeight = activeScreen.offsetHeight;
  if (!baseWidth || !baseHeight) {
    return;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scale = Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight, 1);

  const left = Math.max(0, (viewportWidth - baseWidth * scale) / 2);
  const top = Math.max(0, (viewportHeight - baseHeight * scale) / 2);

  activeScreen.style.left = `${left}px`;
  activeScreen.style.top = `${top}px`;
  activeScreen.style.transform = `scale(${scale})`;
}

function setActiveScreen(target) {
  if (!welcomeScreen || !appScreen) {
    return;
  }

  const showWelcome = target === "welcome";
  welcomeScreen.classList.toggle("is-active", showWelcome);
  appScreen.classList.toggle("is-active", !showWelcome);
  welcomeScreen.setAttribute("aria-hidden", showWelcome ? "false" : "true");
  appScreen.setAttribute("aria-hidden", showWelcome ? "true" : "false");
  if (showWelcome) {
    setSpotOverlayVisible(false);
  }
  applyFixedScaleLayout();
}

function setCurrentMode(mode) {
  currentMode = MODE_CONFIG[mode] ? mode : "custom";
  const cfg = MODE_CONFIG[currentMode];
  if (appModeTitle) {
    appModeTitle.textContent = cfg.title;
  }
  if (appModeSubtitle) {
    appModeSubtitle.textContent = cfg.subtitle;
  }
}

function setSpotOverlayVisible(visible) {
  if (!spotOverlay) {
    return;
  }
  spotOverlay.classList.toggle("is-visible", visible);
}

function findSpotIdByDisplayName(displayName) {
  const match = spots.find((spot) => spot.displayName === displayName);
  return match ? match.id : null;
}

function evaluateDemandMatch(spotIds) {
  const artSpaceId = findSpotIdByDisplayName("艺趣空间") || "ArtSpace";
  const footballParkId = findSpotIdByDisplayName("足球乐园") || "FootballPark";
  const mottoStoneId = findSpotIdByDisplayName("校训石");

  if (currentMode === "art") {
    const ok = spotIds.includes(artSpaceId);
    return {
      ok,
      demandText: "必须经过艺趣空间",
      detail: ok ? "已经过艺趣空间。" : "未经过艺趣空间。"
    };
  }

  if (currentMode === "sport") {
    if (!mottoStoneId) {
      return {
        ok: false,
        demandText: "必须从校训石出发且经过足球乐园",
        detail: "当前数据未找到“校训石”点位，请先在地点数据中配置。"
      };
    }

    const startsFromMottoStone = spotIds[0] === mottoStoneId;
    const passesFootballPark = spotIds.includes(footballParkId);
    const ok = startsFromMottoStone && passesFootballPark;
    return {
      ok,
      demandText: "必须从校训石出发且经过足球乐园",
      detail: ok
        ? "已从校训石出发，且经过足球乐园。"
        : `当前结果：${startsFromMottoStone ? "已从校训石出发" : "未从校训石出发"}，${passesFootballPark ? "已经过足球乐园" : "未经过足球乐园"}。`
    };
  }

  return {
    ok: true,
    demandText: "自主设计路线无强制点位要求",
    detail: "已按自主设计模式完成路线。"
  };
}

function clearEvaluationAnimationTimers() {
  evaluationAnimationTimerIds.forEach((timerId) => clearTimeout(timerId));
  evaluationAnimationTimerIds = [];
  stopEvaluationSounds();
}

function resetEvaluationItems() {
  if (!evaluationGrid) {
    return;
  }
  evaluationGrid.querySelectorAll(".evaluation-item").forEach((item) => {
    item.classList.remove("is-lit", "is-off");
  });
}

function openEvaluationModal(spotIds) {
  if (!evaluationModal || !evaluationGrid || !evaluationHint) {
    return;
  }

  clearEvaluationAnimationTimers();
  resetEvaluationItems();
  evaluationHint.textContent = "";
  evaluationModal.classList.remove("is-error");
  evaluationModal.classList.add("is-open");
  evaluationModal.setAttribute("aria-hidden", "false");
  if (evaluationTitle) {
    evaluationTitle.textContent = EVALUATION_TITLE_DEFAULT;
  }

  const demand = evaluateDemandMatch(spotIds);
  const sequence = [
    { key: "direction", shouldLight: true },
    { key: "spot", shouldLight: true },
    { key: "route", shouldLight: true },
    { key: "demand", shouldLight: demand.ok }
  ];

  const showHint = () => {
    evaluationHint.textContent = demand.ok
      ? `恭喜你成为了四星讲解员。${demand.detail}`
      : `再看看老师的需求哦？${demand.detail}`;
  };

  const runStep = (index) => {
    if (index >= sequence.length) {
      playSoundAndWait(completeSound, showHint, 420);
      return;
    }

    const entry = sequence[index];
    const item = evaluationGrid.querySelector(`[data-criteria='${entry.key}']`);
    if (!item) {
      scheduleEvaluationStep(() => runStep(index + 1));
      return;
    }

    if (!entry.shouldLight) {
      item.classList.add("is-off");
      scheduleEvaluationStep(() => runStep(index + 1));
      return;
    }

    item.classList.add("is-lit");
    playSoundAndWait(starSounds[index], () => runStep(index + 1));
  };

  scheduleEvaluationStep(() => runStep(0), 160);
}

function openEvaluationErrorModal(errorText) {
  if (!evaluationModal || !evaluationHint) {
    return;
  }

  clearEvaluationAnimationTimers();
  resetEvaluationItems();
  evaluationModal.classList.add("is-open", "is-error");
  evaluationModal.setAttribute("aria-hidden", "false");
  if (evaluationTitle) {
    evaluationTitle.textContent = EVALUATION_TITLE_ERROR;
  }
  evaluationHint.innerHTML = "";

  const row = document.createElement("span");
  row.className = "evaluation-hint-row";

  const icon = document.createElement("img");
  icon.className = "evaluation-hint-avatar";
  icon.src = MESSAGE_AVATAR_SRC;
  icon.alt = "提示";

  const textNode = document.createElement("span");
  textNode.className = "evaluation-hint-text";
  textNode.textContent = errorText;

  row.appendChild(icon);
  row.appendChild(textNode);
  evaluationHint.appendChild(row);
  playSound(errorSound);
}

function closeEvaluationModal() {
  if (!evaluationModal || !evaluationHint) {
    return;
  }
  clearEvaluationAnimationTimers();
  evaluationModal.classList.remove("is-open", "is-error");
  evaluationModal.setAttribute("aria-hidden", "true");
  if (evaluationTitle) {
    evaluationTitle.textContent = EVALUATION_TITLE_DEFAULT;
  }
  evaluationHint.textContent = "";
}

function handleEntryCardClick(event) {
  const card = event.currentTarget;
  const mode = card.dataset.entryMode;
  setCurrentMode(mode);
  if (mode === "art") {
    setMessage("已选择：美术老师路线模式。", "ok");
  } else if (mode === "sport") {
    setMessage("已选择：体育老师路线模式。", "ok");
  } else {
    setMessage("已选择：自主设计模式。", "ok");
  }
  setSpotOverlayVisible(false);
  setActiveScreen("app");
}

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

function normalizeDirectionCodes(dirValue) {
  if (Array.isArray(dirValue)) {
    return dirValue.filter((code) => Boolean(DIRECTIONS[code]));
  }
  if (typeof dirValue === "string") {
    const parts = dirValue.includes("+") ? dirValue.split("+") : [dirValue];
    return parts.map((part) => part.trim()).filter((code) => Boolean(DIRECTIONS[code]));
  }
  return [];
}

function formatDirectionTips(dirValue) {
  const codes = normalizeDirectionCodes(dirValue);
  if (!codes.length) {
    return "";
  }
  return codes.map((code) => toDirectionArrow(code)).join("+");
}

function loadCalibrationOffsets() {
  // Release mode: point calibration persistence is disabled.
  calibrationOffsets = {};
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
  // Release mode: disable writing runtime calibration to localStorage.
}

function captureCalibrationOffsets() {
  // Release mode: interactive point calibration is disabled.
}

function updateCalibrationStatus(text) {
  // Release mode: calibration status UI is disabled.
  void text;
}

function updateCalibrationUI() {
  // Release mode: calibration toggle UI is disabled.
}

function buildLocJsonWithOffsets() {
  // Release mode: disable runtime loc.json export generated by calibration.
  return {};
}

function downloadUpdatedLocJson() {
  // Release mode: disable runtime loc.json download generated by calibration.
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

function formatDirectionLabels(dirValue) {
  const codes = normalizeDirectionCodes(dirValue);
  return codes.map((code) => DIRECTIONS[code]?.label || code).join("+");
}

function isSameDirectionSet(expected, provided) {
  if (expected.length !== provided.length) {
    return false;
  }
  const expectedSet = new Set(expected);
  const providedSet = new Set(provided);
  if (expectedSet.size !== providedSet.size) {
    return false;
  }
  return [...expectedSet].every((code) => providedSet.has(code));
}

function validateSegment(fromId, providedDir, toId) {
  const from = spotById[fromId];
  const to = spotById[toId];
  const providedDirs = normalizeDirectionCodes(providedDir);
  if (!from || !to) {
    const providedLabel = formatDirectionLabels(providedDirs) || "未知方向";
    return {
      ok: false,
      errorText: `雏燕讲解员请注意：\n 这条路行不通，再找找正确的路吧！`
    };
  }

  const expectedDir = from.directionTo?.[to.id];
  const allowedDirs = normalizeDirectionCodes(expectedDir);
  const isConnected = from.connectedTo.includes(to.id);
  const isDirectionRight = isSameDirectionSet(allowedDirs, providedDirs);

  if (!isConnected || !isDirectionRight) {
    const requiredLabel = formatDirectionLabels(allowedDirs) || "未知方向";
    const providedLabel = formatDirectionLabels(providedDirs) || "未知方向";
    return {
      ok: false,
      errorText: `雏燕讲解员请注意：\n这条路行不通，再找找正确的路吧！`
    };
  }

  return { ok: true };
}

function getUsedSpotIds() {
  return new Set(routeTokens.filter((item) => item.type === "spot").map((item) => item.value));
}

function setMessage(text, type = "info") {
  message.innerHTML = "";

  const row = document.createElement("span");
  row.className = "message-row";

  if (type === "bad") {
    const icon = document.createElement("img");
    icon.className = "message-avatar";
    icon.src = MESSAGE_AVATAR_SRC;
    icon.alt = "提示";
    row.appendChild(icon);
  }

  const textNode = document.createElement("span");
  textNode.textContent = text;
  row.appendChild(textNode);
  message.appendChild(row);

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
    if (token.type === "spot") {
      if (normalized.length > 0 && normalized[normalized.length - 1].type !== "direction") {
        break;
      }
      if (usedSpotIds.has(token.value)) {
        break;
      }
      usedSpotIds.add(token.value);
      normalized.push(token);
      continue;
    }

    if (token.type !== "direction") {
      break;
    }
    if (!normalized.length) {
      break;
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
    stepInfo.textContent = "等待提交路线...";
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
        .map(([toId, dir]) => `${formatDirectionTips(dir)} ${spotById[toId]?.displayName || toId}`)
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

  if (token.type === "spot") {
    if (routeTokens.length > 0 && routeTokens[routeTokens.length - 1].type !== "direction") {
      return { ok: false, reason: "顺序错误：地点前至少需要一个方向。" };
    }
    const usedSpotIds = getUsedSpotIds();
    if (usedSpotIds.has(token.value)) {
      return { ok: false, reason: "同一地点不能重复加入路线。" };
    }
    return { ok: true };
  }

  if (token.type === "direction") {
    if (!routeTokens.length) {
      return { ok: false, reason: "顺序错误：请先拖入起点地点。" };
    }
    return { ok: true };
  }

  return { ok: false, reason: "拖拽类型无效。" };
}

function getLatestSegmentFromTokens() {
  if (routeTokens.length < 3) {
    return null;
  }
  const toIndex = routeTokens.length - 1;
  const toToken = routeTokens[toIndex];
  if (toToken.type !== "spot") {
    return null;
  }

  let fromIndex = toIndex - 1;
  while (fromIndex >= 0 && routeTokens[fromIndex].type !== "spot") {
    fromIndex -= 1;
  }
  if (fromIndex < 0) {
    return null;
  }

  const directionValues = routeTokens
    .slice(fromIndex + 1, toIndex)
    .filter((token) => token.type === "direction")
    .map((token) => token.value);

  if (!directionValues.length) {
    return null;
  }

  return {
    fromToken: routeTokens[fromIndex],
    toToken,
    directionValues,
    fromIndex
  };
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
    const latestSegment = getLatestSegmentFromTokens();
    if (!latestSegment) {
      setMessage("路径结构异常，请重试。", "bad");
      return;
    }

    const { fromToken, toToken, directionValues, fromIndex } = latestSegment;
    const segmentResult = validateSegment(fromToken.value, directionValues, toToken.value);
    if (!segmentResult.ok) {
      routeTokens = routeTokens.slice(0, fromIndex + 1);
      renderRouteTokens();
      updateSpotCard(fromToken.value);
      updatePathPolyline(getSpotIdsFromTokens());
      openEvaluationErrorModal(segmentResult.errorText);
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
      setArrivedStepInfo(toToken.value);
      const spotCount = getSpotIdsFromTokens().length;
      if (spotCount >= 3) {
        setMessage("可点击“提交路线”重播完整路线。", "ok");
      } else {
        setMessage("请继续拖拽下一段。", "ok");
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
  if (spotTitle) {
    spotTitle.textContent = "未开始";
  }
  if (spotDesc) {
    spotDesc.textContent = "拖拽并播放路线后，会展示当前到达的景点。";
  }
  if (spotImage) {
    spotImage.removeAttribute("src");
  }
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
  setSpotOverlayVisible(false);
  stepInfo.textContent = "等待提交路线...";
  setMessage("已清空路线，请重新拖拽。", "info");
}

function resetAll() {
  clearAnimation();
  routeTokens = [];
  renderRouteTokens();
  resetAvatar();
  resetSpotCard();
  setSpotOverlayVisible(false);
  closeEvaluationModal();
  stepInfo.textContent = "等待提交路线...";
  setMessage("已重置全部内容。", "info");
  setActiveScreen("welcome");
}

function updateSpotCard(spotId) {
  const spot = spotById[spotId];
  if (!spot) {
    return;
  }
  const nextNames = spot.connectedTo.map((id) => spotById[id]?.displayName).filter(Boolean);
  if (spotTitle) {
    spotTitle.textContent = spot.displayName;
  }
  if (spotDesc) {
    spotDesc.textContent = nextNames.length ? `可前往：${nextNames.join("、")}` : "当前地点没有可通行节点。";
  }
  if (spotImage) {
    spotImage.src = `img/${encodeURIComponent(spot.image)}`;
  }
}

function getReachableText(spotId) {
  const spot = spotById[spotId];
  if (!spot) {
    return "可前往：无";
  }
  const nextNames = spot.connectedTo.map((id) => spotById[id]?.displayName).filter(Boolean);
  return nextNames.length ? `可前往：${nextNames.join("、")}` : "可前往：无";
}

function setArrivedStepInfo(spotId) {
  const spot = spotById[spotId];
  if (!spot) {
    return;
  }
  stepInfo.textContent = `已到达：${spot.displayName}\n${getReachableText(spotId)}`;
}

function buildPathFromTokens() {
  if (routeTokens.length < 5) {
    return { error: "请至少拖入3个地点和2个方向。" };
  }
  if (routeTokens[0]?.type !== "spot") {
    return { error: "路线必须以地点开始。" };
  }
  if (routeTokens[routeTokens.length - 1]?.type !== "spot") {
    return { error: "路线必须以地点结束。" };
  }

  const spotIds = [routeTokens[0].value];
  let cursor = 1;

  while (cursor < routeTokens.length) {
    const fromId = spotIds[spotIds.length - 1];
    const segmentDirections = [];

    while (cursor < routeTokens.length && routeTokens[cursor].type === "direction") {
      segmentDirections.push(routeTokens[cursor].value);
      cursor += 1;
    }

    if (!segmentDirections.length) {
      return { error: "每两个地点之间至少需要一个方向。" };
    }

    const nextSpot = routeTokens[cursor];
    if (!nextSpot || nextSpot.type !== "spot") {
      return { error: "路线必须以地点结束，且地点之间需先输入方向。" };
    }

    const segmentResult = validateSegment(fromId, segmentDirections, nextSpot.value);
    if (!segmentResult.ok) {
      return { error: segmentResult.errorText };
    }

    spotIds.push(nextSpot.value);
    cursor += 1;
  }

  if (spotIds.length < 3) {
    return { error: "路径需要经过3个地点才合法。" };
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
      setArrivedStepInfo(toId);
      // Pause briefly at each arrived spot so the card matches the current map point.
      setTimeout(playNextSegment, ARRIVAL_DWELL_MS);
    });
  }

  // Keep a short dwell on the start spot before moving to the next segment.
  setTimeout(playNextSegment, ARRIVAL_DWELL_MS);
}

function handleStart() {
  if (isPlaying) {
    setMessage("演示进行中，请稍候。", "warn");
    return;
  }

  const compiled = buildPathFromTokens();
  if (compiled.error) {
    if (compiled.error.includes("这条路行不通")) {
      openEvaluationErrorModal(compiled.error);
    } else {
      setMessage(compiled.error, "bad");
    }
    return;
  }

  const { spotIds } = compiled;
  setSpotOverlayVisible(true);
  updatePathPolyline(spotIds);

  animatePath(spotIds, () => {
    setMessage("路线播放完成，请查看星级评价。", "ok");
    openEvaluationModal(spotIds);
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

function readDragPayloadFromElement(target) {
  const routeToken = target.closest(".route-token");
  if (routeToken && routeToken.dataset.routeIndex) {
    return {
      payload: {
        type: "route-token",
        value: Number(routeToken.dataset.routeIndex)
      },
      sourceElement: routeToken
    };
  }

  const dragItem = target.closest(".drag-item");
  if (dragItem && !dragItem.disabled) {
    return {
      payload: {
        type: dragItem.dataset.type,
        value: dragItem.dataset.value
      },
      sourceElement: dragItem
    };
  }

  return null;
}

function clearTouchDropVisuals() {
  routeDropZone.classList.remove("drag-over");
  trashDropZone.classList.remove("drag-over");
}

function detectTouchDropTarget(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  if (!target) {
    return null;
  }
  if (target.closest("#trashDropZone")) {
    return "trash";
  }
  if (target.closest("#routeDropZone")) {
    return "route";
  }
  return null;
}

function beginTouchDrag(clientX, clientY) {
  if (!touchDragState || touchDragState.isDragging) {
    return;
  }

  const ghost = touchDragState.sourceElement.cloneNode(true);
  ghost.classList.add("touch-drag-ghost");
  ghost.style.position = "fixed";
  ghost.style.left = `${clientX}px`;
  ghost.style.top = `${clientY}px`;
  ghost.style.transform = "translate(-50%, -50%)";
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "9999";
  document.body.appendChild(ghost);

  touchDragState.isDragging = true;
  touchDragState.ghost = ghost;
}

function moveTouchDrag(clientX, clientY) {
  if (!touchDragState?.isDragging) {
    return;
  }

  touchDragState.ghost.style.left = `${clientX}px`;
  touchDragState.ghost.style.top = `${clientY}px`;

  const dropTarget = detectTouchDropTarget(clientX, clientY);
  clearTouchDropVisuals();
  if (dropTarget === "route") {
    routeDropZone.classList.add("drag-over");
  } else if (dropTarget === "trash") {
    trashDropZone.classList.add("drag-over");
  }
}

function endTouchDrag(clientX, clientY) {
  if (!touchDragState) {
    return;
  }

  const { isDragging, payload, ghost } = touchDragState;
  if (ghost) {
    ghost.remove();
  }

  clearTouchDropVisuals();

  if (isDragging) {
    const dropTarget = detectTouchDropTarget(clientX, clientY);
    if (dropTarget === "route" && payload.type !== "route-token") {
      addRouteToken(payload);
    } else if (dropTarget === "trash" && payload.type === "route-token") {
      removeRouteTokenByIndex(Number(payload.value));
    }
  }

  touchDragState = null;
}

function cancelTouchDrag() {
  if (!touchDragState) {
    return;
  }
  if (touchDragState.ghost) {
    touchDragState.ghost.remove();
  }
  clearTouchDropVisuals();
  touchDragState = null;
}

function handleTouchDragPointerDown(event) {
  if (event.pointerType !== "touch" || isPlaying) {
    return;
  }

  const parsed = readDragPayloadFromElement(event.target);
  if (!parsed) {
    return;
  }

  touchDragState = {
    pointerId: event.pointerId,
    payload: parsed.payload,
    sourceElement: parsed.sourceElement,
    startX: event.clientX,
    startY: event.clientY,
    isDragging: false,
    ghost: null
  };
}

function handleTouchDragPointerMove(event) {
  if (!touchDragState || event.pointerId !== touchDragState.pointerId) {
    return;
  }

  const dx = event.clientX - touchDragState.startX;
  const dy = event.clientY - touchDragState.startY;
  const moved = Math.hypot(dx, dy);

  if (!touchDragState.isDragging && moved >= TOUCH_DRAG_THRESHOLD) {
    beginTouchDrag(event.clientX, event.clientY);
  }

  if (touchDragState.isDragging) {
    event.preventDefault();
    moveTouchDrag(event.clientX, event.clientY);
  }
}

function handleTouchDragPointerUp(event) {
  if (!touchDragState || event.pointerId !== touchDragState.pointerId) {
    return;
  }
  endTouchDrag(event.clientX, event.clientY);
}

function handleTouchDragPointerCancel(event) {
  if (!touchDragState || event.pointerId !== touchDragState.pointerId) {
    return;
  }
  cancelTouchDrag();
}

function setupMobileDoubleTapGuard() {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) {
    return;
  }

  let lastTouchEndAt = 0;
  document.addEventListener(
    "touchend",
    (event) => {
      if (event.changedTouches && event.changedTouches.length > 1) {
        return;
      }
      const now = Date.now();
      if (now - lastTouchEndAt <= 320) {
        event.preventDefault();
      }
      lastTouchEndAt = now;
    },
    { passive: false }
  );
}

function setupMobilePinchZoomGuard() {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) {
    return;
  }

  const preventMultiTouchZoom = (event) => {
    if (event.touches && event.touches.length > 1) {
      event.preventDefault();
    }
    if (typeof event.scale === "number" && event.scale !== 1) {
      event.preventDefault();
    }
  };

  document.addEventListener("touchstart", preventMultiTouchZoom, { passive: false });
  document.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });

  // iOS Safari pinch gesture events.
  document.addEventListener("gesturestart", (event) => event.preventDefault());
  document.addEventListener("gesturechange", (event) => event.preventDefault());
  document.addEventListener("gestureend", (event) => event.preventDefault());
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
  // Release mode: disable dragging spots for calibration.
  void event;
}

function handleMapPointerMove(event) {
  // Release mode: disable dragging spots for calibration.
  void event;
}

function handleMapPointerUp(event) {
  // Release mode: disable dragging spots for calibration.
  void event;
}

function toggleCalibrationMode() {
  // Release mode: calibration mode toggle is disabled.
}

function resetCalibration() {
  // Release mode: reset calibration action is disabled.
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
  // Release mode: ignore local runtime calibration, use data-file offsets only.
  const rawConfig = await loadLocConfig();
  const { locations, calibrationOffsets: jsonOffsets } = splitLocConfig(rawConfig);
  loadedLocations = locations || {};
  calibrationOffsets = mergeCalibrationOffsets(jsonOffsets, {});

  spots = normalizeSpots(locations);
  spotById = Object.fromEntries(spots.map((spot) => [spot.id, spot]));

  renderSpotPool();
  renderMap();
  renderRouteTokens();
  resetAvatar();
  resetSpotCard();
  setSpotOverlayVisible(false);

  directionPool.addEventListener("dragstart", handleDragStart);
  spotPool.addEventListener("dragstart", handleDragStart);
  spotPool.addEventListener("click", handleSpotPreviewClick);
  // campusMap calibration pointer events are disabled in release mode.

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

  spotPool.addEventListener("pointerdown", handleTouchDragPointerDown);
  directionPool.addEventListener("pointerdown", handleTouchDragPointerDown);
  routeTimeline.addEventListener("pointerdown", handleTouchDragPointerDown);
  document.addEventListener("pointermove", handleTouchDragPointerMove, { passive: false });
  document.addEventListener("pointerup", handleTouchDragPointerUp);
  document.addEventListener("pointercancel", handleTouchDragPointerCancel);
  setupMobileDoubleTapGuard();
  setupMobilePinchZoomGuard();

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
  // Calibration action buttons are disabled in release mode.
  if (backToWelcomeBtn) {
    backToWelcomeBtn.addEventListener("click", () => setActiveScreen("welcome"));
  }
  if (evaluationCloseBtn) {
    evaluationCloseBtn.addEventListener("click", closeEvaluationModal);
  }
  if (evaluationModal) {
    evaluationModal.addEventListener("click", (event) => {
      if (event.target === evaluationModal) {
        closeEvaluationModal();
      }
    });
  }
  entryCards.forEach((card) => {
    card.addEventListener("click", handleEntryCardClick);
  });

  window.addEventListener("resize", applyFixedScaleLayout);
  window.addEventListener("orientationchange", applyFixedScaleLayout);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", applyFixedScaleLayout);
  }

  setCurrentMode("custom");
  setActiveScreen("welcome");

  setMessage("请先拖拽至少3个地点与方向，再提交路线。", "info");
}

init().catch((error) => {
  setMessage(`初始化失败：${error.message}`, "bad");
});
