import {
  initPlayer,
  update,
  getState,
  setMyId,
  setOthers,
  setMenuOpen,
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
const chat                  = document.getElementById("chat");
const chatInput             = document.getElementById("chatInput");
const sendBtn               = document.getElementById("sendBtn");
 
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
function syncMenuControlState() {
  setMenuOpen(isAnyMenuOpen());
}
 
// ── Mouse / keyboard ──────────────────────────────────────────────────────────
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
  closeCustomizationOverlay();
});
 
// ── Settings overlay ──────────────────────────────────────────────────────────
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
  checkbox.addEventListener("change", () => {
    debugToggles[key].enabled = checkbox.checked;
  });
});
 
// ── WebSocket with auto-reconnect ─────────────────────────────────────────────
// Render free tier cold-starts in 30-50 seconds. Without reconnect, the WS
// attempt fails immediately on first load and the game runs single-player
// silently. This loop retries with exponential backoff until it connects.
 
const wsProtocol = location.protocol === "https:" ? "wss://" : "ws://";
let ws = null;
let chatSetup = false;
let playerSetup = false;
let spriteMenuShown = false;
 
// Show a status message in the chat panel so the player knows what's happening
function showStatus(msg) {
  const div = document.createElement("div");
  div.style.color = "#aaa";
  div.style.fontStyle = "italic";
  div.textContent = msg;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}
 
function connectWebSocket(attempt = 1) {
  const MAX_DELAY_MS = 10_000;
  const delay = Math.min(1000 * Math.pow(1.5, attempt - 1), MAX_DELAY_MS);
 
  if (attempt > 1) {
    showStatus(`Connecting to server... (attempt ${attempt})`);
  }
 
  ws = new WebSocket(wsProtocol + location.host);
 
  ws.addEventListener("open", () => {
    showStatus("Connected!");
 
    // Only set up chat and player once — they hold a reference to ws
    // internally via closure so we pass the live ws object each time.
    if (!chatSetup) {
      const { username } = getState();
      setupChat(ws, chatInput, chat, sendBtn, username);
      chatSetup = true;
    }
 
    if (!playerSetup) {
      initPlayer(keys, ws, mouse);
      playerSetup = true;
    }
 
    // Show sprite menu only on first successful connection
    if (!spriteMenuShown) {
      spriteMenuShown = true;
      showSpriteMenu(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "setSprite", sprite: getState().sprite }));
          ws.send(JSON.stringify({ type: "menuClosed" }));
        }
      });
    } else {
      // Reconnecting after a drop — re-announce ourselves
      const state = getState();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "setName",   name:   state.username }));
        ws.send(JSON.stringify({ type: "setSprite", sprite: state.sprite }));
        ws.send(JSON.stringify({ type: "menuClosed" }));
      }
    }
  });
 
  ws.addEventListener("message", (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "init")    setMyId(data.id);
    if (data.type === "players") setOthers(data.players);
  });
 
  ws.addEventListener("close", () => {
    showStatus("Disconnected — retrying...");
    // Exponential backoff reconnect
    setTimeout(() => connectWebSocket(attempt + 1), delay);
  });
 
  ws.addEventListener("error", () => {
    // 'error' is always followed by 'close', so we just let the close handler retry.
    // Don't show an extra message here or the chat fills up with duplicate errors.
  });
}
 
connectWebSocket();
 
// ── Game loop ─────────────────────────────────────────────────────────────────
function loop() {
  syncMenuControlState();
  update();
  render(canvas, ctx);
  requestAnimationFrame(loop);
}
 
loop();
 
