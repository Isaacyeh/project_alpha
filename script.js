import {
  initPlayer,
  update,
  getState,
  setMyId,
  setOthers,
  setMenuOpen,
  setSprite,
  promptUsername,
  setNetworkLag,
  updateRemoteMeta,
} from "./script_files/player.js";
import { SPAWN_INVINCIBILITY_DURATION, setFOV } from "./script_files/constant.js";
import { setupChat } from "./script_files/chat.js";
import { render, updateLeaderboard } from "./script_files/render/render.js";
import { addBulletHole } from "./script_files/bulletHole.js";
import { loadSprites } from "./UI/spriteMenu.js";
import { setCrosshairOptions } from "./script_files/crosshair.js";
import { debugToggles } from "./script_files/debug.js";
import { keybinds, initKeybindMenu } from "./script_files/keybindControls.js";

window.__bootstrapStarted = true;
 
const keys = {};
const mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
 
// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas                = document.getElementById("game");
const ctx                   = canvas.getContext("2d");
 
// ── Canvas scaling — fills the window below the header, keeping 8:5 ratio ────
// Logical resolution stays 800×500 so all game math is unchanged.
// We only set canvas.style.width/height (CSS pixels) to scale visually.
(function scaleCanvas() {
  const ASPECT = 800 / 500; // 8:5
  function resize() {
    // Measure the header bar (<span> containing menu-button + title)
    const header  = document.querySelector("body > span");
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const winW    = window.innerWidth;
    const winH    = window.innerHeight - headerH;
    let w = winW;
    let h = winW / ASPECT;
    if (h > winH) { h = winH; w = winH * ASPECT; }
    w = Math.floor(w); h = Math.floor(h);
    canvas.style.width    = w + "px";
    canvas.style.height   = h + "px";
    canvas.style.position = "fixed";
    canvas.style.left     = Math.floor((winW - w) / 2) + "px";
    canvas.style.top      = Math.floor(headerH + (winH - h) / 2) + "px";
    canvas.style.margin   = "0";
  }
  resize();
  window.addEventListener("resize", resize);
})();
const menu                  = document.getElementById("menu");
const customizationMenuLink = document.getElementById("customizationMenuLink");
const customizationOverlay  = document.getElementById("customizationOverlay");
const closeCustomization    = document.getElementById("closeCustomization");
const crosshairImageInput   = document.getElementById("crosshairImageInput");
const crosshairOpacityInput = document.getElementById("crosshairOpacityInput");
const confirmCustomization  = document.getElementById("confirmCustomization");
const keybindsOverlay       = document.getElementById("keybindsOverlay");
const keybindsMenuLink      = document.getElementById("keybindsMenuLink");
const settingsMenuLink      = document.getElementById("settingsMenuLink");
const settingsOverlay       = document.getElementById("settingsOverlay");
const closeSettings         = document.getElementById("closeSettings");

function requireEl(id, el) {
  if (!el) {
    throw new Error(`Missing required DOM element: #${id}. Check deployed index.html/version mismatch.`);
  }
  return el;
}

requireEl("game", canvas);
requireEl("menu", menu);
requireEl("customizationMenuLink", customizationMenuLink);
requireEl("customizationOverlay", customizationOverlay);
requireEl("closeCustomization", closeCustomization);
requireEl("crosshairImageInput", crosshairImageInput);
requireEl("crosshairOpacityInput", crosshairOpacityInput);
requireEl("confirmCustomization", confirmCustomization);
requireEl("keybindsOverlay", keybindsOverlay);
requireEl("keybindsMenuLink", keybindsMenuLink);
requireEl("settingsMenuLink", settingsMenuLink);
requireEl("settingsOverlay", settingsOverlay);
requireEl("closeSettings", closeSettings);
 
// ── Crosshair state ───────────────────────────────────────────────────────────
let pendingCrosshairImage   = "";
let appliedCrosshairImage   = "";
let pendingCrosshairOpacity = Number(crosshairOpacityInput.value);
let appliedCrosshairOpacity = Number(crosshairOpacityInput.value);
let pendingCrosshairBlobUrl = null;
let appliedCrosshairBlobUrl = null;
 
// ── Skin / sprite state ───────────────────────────────────────────────────────
let pendingSkinUrl  = "";
let pendingSkinBlob = null;
 
menu.classList.add("hidden");
customizationOverlay.classList.add("hidden");
settingsOverlay.classList.add("hidden");
setCrosshairOptions({ opacity: appliedCrosshairOpacity, imageSrc: "" });
 
// ── Input helpers ─────────────────────────────────────────────────────────────
function clearInputState() {
  Object.keys(keys).forEach((k) => { keys[k] = false; });
  mouse.dx = 0;
  mouse.dy = 0;
  mouse.buttons = {};
}
 
function isCustomizationOpen() { return !customizationOverlay.classList.contains("hidden"); }
function isKeybindsOpen()      { return !keybindsOverlay.classList.contains("hidden"); }
function isSettingsOpen()      { return !settingsOverlay.classList.contains("hidden"); }
function isAnyMenuOpen()       { return isCustomizationOpen() || isKeybindsOpen() || isSettingsOpen(); }
 
let _prevMenuOpen = false;
function syncMenuControlState() {
  const open = isAnyMenuOpen();
  if (open !== _prevMenuOpen) {
    _prevMenuOpen = open;
    setMenuOpen(open);
  }
}
 
// ── Mouse / keyboard guards ───────────────────────────────────────────────────
window.addEventListener("mousemove", (e) => {
  if (isAnyMenuOpen()) { mouse.dx = 0; mouse.dy = 0; return; }
  if (document.pointerLockElement === canvas) {
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  } else {
    mouse.dx = 0; mouse.dy = 0;
    mouse.x = e.clientX; mouse.y = e.clientY;
  }
});
 
window.addEventListener("keydown", (e) => {
  if (e.key === "Tab") return;
  if (isAnyMenuOpen()) return;
  keys[e.key] = true;
});
document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
  keys[e.key.toLowerCase()] = false;
  keys[e.key.toUpperCase()] = false;
});
window.addEventListener("mousedown", (e) => {
  if (isAnyMenuOpen()) return;
  mouse.buttons[e.button] = true;
});
window.addEventListener("mouseup", (e) => {
  mouse.buttons[e.button] = false;
});
 
canvas.addEventListener("click", () => {
  if (isAnyMenuOpen()) return;
  canvas.requestPointerLock();
});
 
// ── Skin preview helper ───────────────────────────────────────────────────────
function updateSkinPreview(url) {
  const preview = document.getElementById("skinPreviewImg");
  if (!preview) return;
  if (url) { preview.src = url; preview.style.display = "block"; }
  else      { preview.style.display = "none"; }
}

function normalizeScaleX(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return null;
  return width / height;
}

function formatScaleX(scaleX) {
  if (!Number.isFinite(scaleX) || scaleX <= 0) return "-";
  const fixed = scaleX >= 10 ? scaleX.toFixed(1) : scaleX.toFixed(2);
  return fixed.replace(/\.0+$|(?<=\.[0-9]*[1-9])0+$/, "");
}

function readImageDimensions(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
 
// ── FOV slider ────────────────────────────────────────────────────────────────
let fovSliderBuilt = false;
function buildFOVSlider() {
  if (fovSliderBuilt) return;
  fovSliderBuilt = true;
 
  const overlayWindow  = customizationOverlay.querySelector(".overlay-window");
  const firstFieldGroup = overlayWindow.querySelector(".field-group");
 
  const section = document.createElement("div");
  section.id = "fovSliderSection";
  section.innerHTML = `
    <div class="field-group" style="margin-bottom:14px;">
      <label for="fovSliderInput" style="display:flex;justify-content:space-between;">
        <span>Field of View</span>
        <span id="fovSliderValue" style="color:lightslategray;font-weight:bold;">60°</span>
      </label>
      <input id="fovSliderInput" type="range" min="40" max="120" step="1" value="60"
             style="width:100%;margin-top:6px;" />
    </div>
    <hr style="border-color:#444;margin:0 0 14px;">
  `;
 
  // Insert before the crosshair section
  overlayWindow.insertBefore(section, firstFieldGroup);
 
  const slider = document.getElementById("fovSliderInput");
  const label  = document.getElementById("fovSliderValue");
 
  slider.addEventListener("input", () => {
    const deg = Number(slider.value);
    label.textContent = `${deg}°`;
    setFOV(deg * (Math.PI / 180));
  });
}
 
// ── Build skin section ────────────────────────────────────────────────────────
async function buildSkinSection() {
  const container = document.getElementById("skinSection");
  if (!container) return;
 
  const spritesData = await loadSprites();
 
  container.innerHTML = `
    <hr style="border-color:#444; margin: 14px 0;">
    <h3 style="color: lightslategray; margin: 0 0 10px;">Character Skin</h3>
    <div class="field-group">
      <label for="skinPresetSelect">Preset skins</label>
      <select id="skinPresetSelect" style="
        background:#1e1e1e; color:#fff; border:1px solid #666;
        padding:6px 8px; border-radius:4px; font-size:14px; width:100%;
      ">
        <option value="">— Select a preset —</option>
        ${spritesData.map((s) => `<option value="${s.url}">${s.name}</option>`).join("")}
      </select>
    </div>
    <div class="field-group" style="margin-top:10px;">
      <label for="skinUploadInput">Or upload a custom image</label>
      <input id="skinUploadInput" type="file" accept="image/*" />
      <div id="skinScaleLabel" style="margin-top:6px; color:#aaa; font-size:12px;">Image scale: -</div>
    </div>
    <div style="margin-top:10px; display:flex; align-items:center; gap:12px;">
      <img id="skinPreviewImg" src="" alt="Skin preview" style="
        display:none; width:64px; height:64px; object-fit:contain;
        border:1px solid #666; border-radius:4px; background:#111;
      "/>
      <span id="skinPreviewLabel" style="color:#aaa; font-size:13px;">No skin selected</span>
    </div>
  `;
 
  const presetSelect = document.getElementById("skinPresetSelect");
  const skinUpload   = document.getElementById("skinUploadInput");
  const skinLabel    = document.getElementById("skinPreviewLabel");
  const skinScale    = document.getElementById("skinScaleLabel");

  let scaleRequestId = 0;
  async function updateSkinScale(url) {
    if (!skinScale) return;
    if (!url) {
      skinScale.textContent = "Image scale: -";
      return;
    }
    const requestId = ++scaleRequestId;
    const dims = await readImageDimensions(url);
    if (requestId !== scaleRequestId) return;
    if (!dims) {
      skinScale.textContent = "Image scale: -";
      return;
    }
    const scaleX = normalizeScaleX(dims.width, dims.height);
    if (scaleX === null) {
      skinScale.textContent = "Image scale: -";
      return;
    }
    skinScale.textContent = `Image scale: ${formatScaleX(scaleX)}:1 (${dims.width}x${dims.height})`;
  }
 
  const currentSprite = getState().sprite;
  const match = spritesData.find((s) => s.url === currentSprite);
  if (match) {
    presetSelect.value = match.url;
    pendingSkinUrl = match.url;
    updateSkinPreview(match.url);
    skinLabel.textContent = match.name;
    updateSkinScale(match.url);
  } else {
    updateSkinScale(currentSprite || "");
  }
 
  presetSelect.addEventListener("change", (e) => {
    const url = e.target.value;
    if (!url) return;
    if (pendingSkinBlob) { URL.revokeObjectURL(pendingSkinBlob); pendingSkinBlob = null; }
    skinUpload.value = "";
    pendingSkinUrl = url;
    updateSkinPreview(url);
    updateSkinScale(url);
    const selected = spritesData.find((s) => s.url === url);
    skinLabel.textContent = selected ? selected.name : "Preset skin";
  });
 
  skinUpload.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    // Use FileReader to get a base64 data URL instead of a blob URL.
    // Blob URLs only work in the tab that created them; if we sent a blob URL
    // to the server, other players' browsers couldn't load it (different origin).
    // Base64 data URLs work everywhere and can be broadcast over WebSocket.
    if (file.size > 2_000_000) {
      alert("Image too large — please upload something under 2 MB.");
      skinUpload.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (pendingSkinBlob) { URL.revokeObjectURL(pendingSkinBlob); pendingSkinBlob = null; }
      pendingSkinUrl = dataUrl;
      presetSelect.value = "";
      updateSkinPreview(dataUrl);
      updateSkinScale(dataUrl);
      skinLabel.textContent = file.name;
    };
    reader.readAsDataURL(file);
  });
}
 
// ── Customization overlay ─────────────────────────────────────────────────────
function openCustomizationOverlay() {
  buildFOVSlider(); // inject once, idempotent
  customizationOverlay.classList.remove("hidden");
  customizationOverlay.setAttribute("aria-hidden", "false");
  crosshairOpacityInput.value = String(appliedCrosshairOpacity);
  pendingCrosshairOpacity = appliedCrosshairOpacity;
  pendingCrosshairImage   = appliedCrosshairImage;
  pendingSkinUrl = getState().sprite;
  if (pendingSkinBlob) { URL.revokeObjectURL(pendingSkinBlob); pendingSkinBlob = null; }
  syncMenuControlState();
  clearInputState();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
 
function closeCustomizationOverlay() {
  customizationOverlay.classList.add("hidden");
  customizationOverlay.setAttribute("aria-hidden", "true");
  syncMenuControlState();
  clearInputState();
}
 
customizationMenuLink.addEventListener("click", (e) => {
  e.preventDefault(); e.stopPropagation();
  menu.classList.add("hidden");
  openCustomizationOverlay();
});
closeCustomization.addEventListener("click", closeCustomizationOverlay);
closeCustomization.addEventListener("pointerdown", (e) => e.preventDefault());
 
customizationOverlay.addEventListener("click", (e) => {
  if (e.target === customizationOverlay) closeCustomizationOverlay();
});
crosshairOpacityInput.addEventListener("input", (e) => {
  pendingCrosshairOpacity = Number(e.target.value);
});
crosshairImageInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (pendingCrosshairBlobUrl) { URL.revokeObjectURL(pendingCrosshairBlobUrl); pendingCrosshairBlobUrl = null; }
  pendingCrosshairBlobUrl = URL.createObjectURL(file);
  pendingCrosshairImage   = pendingCrosshairBlobUrl;
});
 
confirmCustomization.addEventListener("click", () => {
  if (appliedCrosshairBlobUrl && appliedCrosshairBlobUrl !== pendingCrosshairBlobUrl) {
    URL.revokeObjectURL(appliedCrosshairBlobUrl);
  }
  appliedCrosshairImage   = pendingCrosshairImage;
  appliedCrosshairOpacity = pendingCrosshairOpacity;
  appliedCrosshairBlobUrl = pendingCrosshairBlobUrl;
  setCrosshairOptions({ opacity: appliedCrosshairOpacity, imageSrc: appliedCrosshairImage });
  if (pendingSkinUrl) setSprite(pendingSkinUrl);
  closeCustomizationOverlay();
});
 
// ── Keybinds overlay ──────────────────────────────────────────────────────────
function openKeybindsOverlay() {
  keybindsOverlay.classList.remove("hidden");
  keybindsOverlay.setAttribute("aria-hidden", "false");
  syncMenuControlState(); clearInputState();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function closeKeybindsOverlay() {
  keybindsOverlay.classList.add("hidden");
  keybindsOverlay.setAttribute("aria-hidden", "true");
  syncMenuControlState(); clearInputState();
}
keybindsMenuLink.addEventListener("click", (e) => {
  e.preventDefault(); e.stopPropagation();
  menu.classList.add("hidden");
  openKeybindsOverlay();
});
keybindsOverlay.addEventListener("click", (e) => {
  if (e.target === keybindsOverlay) closeKeybindsOverlay();
});
initKeybindMenu(closeKeybindsOverlay);
 
// ── Settings overlay ──────────────────────────────────────────────────────────
function openSettingsOverlay() {
  settingsOverlay.classList.remove("hidden");
  settingsOverlay.setAttribute("aria-hidden", "false");
  syncMenuControlState(); clearInputState();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function closeSettingsOverlay() {
  settingsOverlay.classList.add("hidden");
  settingsOverlay.setAttribute("aria-hidden", "true");
  syncMenuControlState(); clearInputState();
}
settingsMenuLink.addEventListener("click", (e) => {
  e.preventDefault(); e.stopPropagation();
  menu.classList.add("hidden");
  openSettingsOverlay();
});
closeSettings.addEventListener("click", closeSettingsOverlay);
closeSettings.addEventListener("pointerdown", (e) => e.preventDefault());
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) closeSettingsOverlay();
});
 
document.querySelectorAll("[data-debug-key]").forEach((checkbox) => {
  const key = checkbox.dataset.debugKey;
  if (!debugToggles[key]) return;
  checkbox.checked = debugToggles[key].enabled;
  checkbox.addEventListener("change", () => { debugToggles[key].enabled = checkbox.checked; });
});
 
// ── Chat refs ─────────────────────────────────────────────────────────────────
const chat      = document.getElementById("chat");
const chatInput = document.getElementById("chatInput");
const sendBtn   = document.getElementById("sendBtn");
 
// ── WebSocket + game init ─────────────────────────────────────────────────────
const loader = window.__loader || {
  setProgress:  () => {},
  setRetryInfo: () => {},
  addStep:      () => {},
  updateStep:   () => {},
  showError:    (_m, retry) => setTimeout(retry, 3000),
  dismiss:      (cb) => { if (typeof cb === "function") cb(); },
};
 
const WS_MAX_RETRIES   = 10;
const WS_RETRY_BASE_MS = 1500;
const WS_RETRY_MAX_MS  = 8000;
const WS_OPEN_TIMEOUT  = 8000;
 
let gameStarted = false;
let retryCount  = 0;
let pingTimer = null;
let lastRttMs = null;
 
function connectWebSocket() {
  if (retryCount === 0) {
    loader.setProgress(20, "Connecting to server...");
    loader.addStep("ws", "Connecting to game server...", "wait");
  } else {
    loader.setProgress(Math.min(20 + retryCount * 7, 75), `Attempt ${retryCount + 1} of ${WS_MAX_RETRIES}...`);
    loader.updateStep("ws", "wait", `Retrying connection... (attempt ${retryCount + 1}/${WS_MAX_RETRIES})`);
  }
 
  const wsProtocol = location.protocol === "https:" ? "wss://" : "ws://";
  let ws;
  try {
    ws = new WebSocket(wsProtocol + location.host);
  } catch (err) {
    loader.updateStep("ws", "fail", `WebSocket creation failed: ${err.message}`);
    loader.showError(`Failed to create WebSocket connection.\n${err.message}`,
      () => { retryCount = 0; connectWebSocket(); });
    return;
  }
 
  const openTimer = setTimeout(() => {
    loader.updateStep("ws", "fail", "Connection timed out after 8 seconds");
    ws.close();
  }, WS_OPEN_TIMEOUT);
 
  ws.addEventListener("open", () => {
    clearTimeout(openTimer);
    gameStarted = true;
    retryCount  = 0;
 
    loader.updateStep("ws", "ok", "Connected to game server");
    loader.setProgress(55, "Initializing game...");
    loader.addStep("init", "Initializing player & game loop...", "wait");
 
    try {
      initPlayer(keys, ws, mouse);
    } catch (err) {
      loader.updateStep("init", "fail", `Player init failed: ${err.message}`);
      loader.showError(`Game initialization error:\n${err.message}\n\nTry refreshing the page.`,
        () => location.reload());
      return;
    }
 
    ws.addEventListener("message", (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      if (data.type === "init") {
        setMyId(data.id);
        loader.updateStep("init", "ok", "Player initialized — ID assigned");
        loader.setProgress(75, "Loading assets...");
        loader.addStep("assets", "Loading sprites & map data...", "wait");
      }
      if (data.type === "players") {
        setOthers(data.players);
        if (data.leaderboard) updateLeaderboard(data.leaderboard);
        if (!window.__assetsReady) {
          window.__assetsReady = true;
          loader.updateStep("assets", "ok", "Sprites & map data ready");
          loader.setProgress(90, "Starting render loop...");
          loader.addStep("render", "Starting render loop...", "wait");
        }
      }
      if (data.type === "playerMeta") {
        updateRemoteMeta(data.id, data.meta);
      }
      if (data.type === "playerMetaSnapshot" && data.players && typeof data.players === "object") {
        for (const id in data.players) {
          updateRemoteMeta(id, data.players[id]);
        }
      }
      if (data.type === "bulletHole") {
        addBulletHole(data.wx, data.wy, data.endZ, data.bulletOriginZ, data.hitType);
      }
      if (data.type === "pong") {
        const now = performance.now();
        const sentAt = Number(data.clientTs);
        if (Number.isFinite(sentAt)) {
          const rtt = Math.max(0, now - sentAt);
          const jitter = lastRttMs == null ? 0 : Math.abs(rtt - lastRttMs);
          lastRttMs = rtt;
          setNetworkLag(rtt, jitter);
        }
      }
    });

    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "ping", clientTs: performance.now() }));
    }, 2000);
 
    let loopStarted = false;
    function loop() {
      if (!loopStarted) {
        loopStarted = true;
        getState().invincibilityTimer = SPAWN_INVINCIBILITY_DURATION;
        loader.updateStep("render", "ok", "Render loop running");
        loader.setProgress(100, "Ready!");
      }
      syncMenuControlState();
      update();
      render(canvas, ctx);
      requestAnimationFrame(loop);
    }
    loop();
 
    loader.dismiss(() => {
      let username;
      try { username = promptUsername(); } catch { username = "Anonymous"; }
      try { setupChat(ws, chatInput, chat, sendBtn, username); } catch (err) { console.warn("Chat setup failed:", err); }
 
      const { sprite } = getState();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "setName",      name: username }));
        ws.send(JSON.stringify({ type: "setSprite",    sprite }));
        ws.send(JSON.stringify({ type: "initialSpawn" }));
      }
 
      buildSkinSection().catch((err) => console.warn("Skin section error:", err));
    });
  });
 
  ws.addEventListener("error", () => {
    clearTimeout(openTimer);
    loader.updateStep("ws", "fail",
      retryCount < WS_MAX_RETRIES ? "Connection error — will retry..." : "Connection error — max retries reached");
  });
 
  ws.addEventListener("close", (e) => {
    clearTimeout(openTimer);
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    lastRttMs = null;
    setNetworkLag(null, null);
    if (gameStarted) return;
    const reason = e.reason ? ` (${e.reason})` : (e.code ? ` [code ${e.code}]` : "");
    if (retryCount >= WS_MAX_RETRIES) {
      loader.updateStep("ws", "fail", `Could not connect after ${WS_MAX_RETRIES} attempts${reason}`);
      loader.showError(
        `Could not reach the game server after ${WS_MAX_RETRIES} attempts.\n` +
        `The server may still be starting — this can take up to 60 seconds.\n` +
        (reason ? `Last error: ${reason}\n` : "") +
        `Click Retry to try again.`,
        () => { retryCount = 0; window.__assetsReady = false; connectWebSocket(); }
      );
      return;
    }
 
    retryCount++;
    const delay = Math.min(WS_RETRY_BASE_MS * retryCount, WS_RETRY_MAX_MS);
    let secsLeft = Math.ceil(delay / 1000);
 
    loader.setProgress(Math.min(20 + retryCount * 7, 75), `Retrying in ${secsLeft}s...`);
    loader.updateStep("ws", "wait", `Retrying in ${secsLeft}s... (attempt ${retryCount + 1}/${WS_MAX_RETRIES})`);
 
    const tick = setInterval(() => {
      secsLeft--;
      if (secsLeft > 0) {
        loader.setRetryInfo(`Next attempt in ${secsLeft}s`);
        loader.updateStep("ws", "wait", `Retrying in ${secsLeft}s... (attempt ${retryCount + 1}/${WS_MAX_RETRIES})`);
      } else {
        clearInterval(tick);
        loader.setRetryInfo("");
      }
    }, 1000);
 
    setTimeout(() => { clearInterval(tick); connectWebSocket(); }, delay);
  });
}
 
loader.setProgress(10, "Loading assets...");
loader.addStep("dom",    "Page & scripts loaded",  "ok");
loader.addStep("canvas", "Canvas context ready",   "ok");
 
connectWebSocket();