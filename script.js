import {
  initPlayer,
  update,
  getState,
  setMyId,
  setOthers,
  setMenuOpen,
  promptUsername,
} from "./script_files/player.js";
import { setupChat } from "./script_files/chat.js";
import { render } from "./script_files/render/render.js";
import { showSpriteMenu } from "./UI/spriteMenu.js";
import { setCrosshairOptions } from "./script_files/crosshair.js";
import { debugToggles } from "./script_files/debug.js";
 
const keys = {};
const mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
 
// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas                = document.getElementById("game");
const ctx                   = canvas.getContext("2d");
const menu                  = document.getElementById("menu");
const customizationMenuLink = document.getElementById("customizationMenuLink");
const customizationOverlay  = document.getElementById("customizationOverlay");
const closeCustomization    = document.getElementById("closeCustomization");
const crosshairImageInput   = document.getElementById("crosshairImageInput");
const crosshairOpacityInput = document.getElementById("crosshairOpacityInput");
const confirmCustomization  = document.getElementById("confirmCustomization");
const settingsMenuLink      = document.getElementById("settingsMenuLink");
const settingsOverlay       = document.getElementById("settingsOverlay");
const closeSettings         = document.getElementById("closeSettings");
 
// ── Crosshair state ───────────────────────────────────────────────────────────
let pendingCrosshairImage   = "";
let appliedCrosshairImage   = "";
let pendingCrosshairOpacity = Number(crosshairOpacityInput.value);
let appliedCrosshairOpacity = Number(crosshairOpacityInput.value);
let pendingCrosshairBlobUrl = null;
let appliedCrosshairBlobUrl = null;
 
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
 
function isCustomizationOpen() {
  return !customizationOverlay.classList.contains("hidden");
}
 
function isSettingsOpen() {
  return !settingsOverlay.classList.contains("hidden");
}
 
function isAnyMenuOpen() {
  return isCustomizationOpen() || isSettingsOpen();
}
 
// Track previous state so we only notify player.js on actual transitions.
// The old code called setMenuOpen() every single frame, which caused
// "menuClosed" to be sent to the server constantly — resetting health each time.
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
 
// ── Customization overlay ─────────────────────────────────────────────────────
function openCustomizationOverlay() {
  customizationOverlay.classList.remove("hidden");
  customizationOverlay.setAttribute("aria-hidden", "false");
  crosshairOpacityInput.value = String(appliedCrosshairOpacity);
  pendingCrosshairOpacity = appliedCrosshairOpacity;
  pendingCrosshairImage   = appliedCrosshairImage;
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
  e.preventDefault();
  e.stopPropagation();
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
  if (pendingCrosshairBlobUrl) {
    URL.revokeObjectURL(pendingCrosshairBlobUrl);
    pendingCrosshairBlobUrl = null;
  }
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
  closeCustomizationOverlay();
});
 
// ── Settings overlay (debug toggles) ─────────────────────────────────────────
function openSettingsOverlay() {
  settingsOverlay.classList.remove("hidden");
  settingsOverlay.setAttribute("aria-hidden", "false");
  syncMenuControlState();
  clearInputState();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
 
function closeSettingsOverlay() {
  settingsOverlay.classList.add("hidden");
  settingsOverlay.setAttribute("aria-hidden", "true");
  syncMenuControlState();
  clearInputState();
}
 
settingsMenuLink.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
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
  checkbox.addEventListener("change", () => {
    debugToggles[key].enabled = checkbox.checked;
  });
});
 
// ── Chat refs ─────────────────────────────────────────────────────────────────
const chat      = document.getElementById("chat");
const chatInput = document.getElementById("chatInput");
const sendBtn   = document.getElementById("sendBtn");
 
// ── WebSocket + game init (with retry) ───────────────────────────────────────
const loader = window.__loader || {
  setProgress: () => {},
  setRetryInfo: () => {},
  showError: (_m, retry) => setTimeout(retry, 3000),
  dismiss: (cb) => { if (typeof cb === "function") cb(); },
};
 
const WS_MAX_RETRIES   = 10;
const WS_RETRY_BASE_MS = 1500;
const WS_RETRY_MAX_MS  = 8000;
const WS_OPEN_TIMEOUT  = 8000;
 
let gameStarted = false;
let retryCount  = 0;
 
function connectWebSocket() {
  loader.setProgress(
    Math.min(20 + retryCount * 7, 75),
    retryCount === 0
      ? "Connecting to server..."
      : `Server not ready — attempt ${retryCount + 1} of ${WS_MAX_RETRIES}...`
  );
 
  const wsProtocol = location.protocol === "https:" ? "wss://" : "ws://";
  const ws = new WebSocket(wsProtocol + location.host);
 
  const openTimer = setTimeout(() => ws.close(), WS_OPEN_TIMEOUT);
 
  ws.addEventListener("open", () => {
    clearTimeout(openTimer);
    gameStarted = true;
    retryCount  = 0;
    loader.setProgress(100, "Ready!");
 
    initPlayer(keys, ws, mouse);
 
    ws.addEventListener("message", (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "init")    setMyId(data.id);
      if (data.type === "players") setOthers(data.players);
    });
 
    function loop() {
      syncMenuControlState();
      update();
      render(canvas, ctx);
      requestAnimationFrame(loop);
    }
    loop();
 
    loader.dismiss(() => {
      const username = promptUsername();
 
      setupChat(ws, chatInput, chat, sendBtn, username);
 
      const { sprite } = getState();
      ws.send(JSON.stringify({ type: "setName",   name: username }));
      ws.send(JSON.stringify({ type: "setSprite", sprite }));
 
      showSpriteMenu(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "setSprite", sprite: getState().sprite }));
          ws.send(JSON.stringify({ type: "menuClosed" }));
        }
      });
    });
  });
 
  ws.addEventListener("error", () => {
    clearTimeout(openTimer);
  });
 
  ws.addEventListener("close", () => {
    clearTimeout(openTimer);
    if (gameStarted) return;
 
    if (retryCount >= WS_MAX_RETRIES) {
      loader.showError(
        "Could not reach the game server.\n" +
        "The server may still be starting up — this can take up to 60 seconds.\n" +
        "Click Retry to try again.",
        () => { retryCount = 0; connectWebSocket(); }
      );
      return;
    }
 
    retryCount++;
    const delay = Math.min(WS_RETRY_BASE_MS * retryCount, WS_RETRY_MAX_MS);
    let secsLeft = Math.ceil(delay / 1000);
 
    loader.setProgress(
      Math.min(20 + retryCount * 7, 75),
      `Retrying in ${secsLeft}s...`
    );
 
    const tick = setInterval(() => {
      secsLeft--;
      if (secsLeft > 0) loader.setRetryInfo(`Retrying in ${secsLeft}s...`);
      else { clearInterval(tick); loader.setRetryInfo(""); }
    }, 1000);
 
    setTimeout(() => { clearInterval(tick); connectWebSocket(); }, delay);
  });
}
 
loader.setProgress(10, "Loading assets...");
connectWebSocket();