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
 
// Only overlay menus (not the hamburger nav) pause the game
function isAnyMenuOpen() {
  return isCustomizationOpen() || isSettingsOpen();
}
 
function syncMenuControlState() {
  setMenuOpen(isAnyMenuOpen());
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
 
// Pointer lock
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
 
// Wire each checkbox to its debugToggles entry
document.querySelectorAll("[data-debug-key]").forEach((checkbox) => {
  const key = checkbox.dataset.debugKey;
  if (!debugToggles[key]) return;
  checkbox.checked = debugToggles[key].enabled;
  checkbox.addEventListener("change", () => {
    debugToggles[key].enabled = checkbox.checked;
  });
});
 
// ── WebSocket + game init ─────────────────────────────────────────────────────
const chat      = document.getElementById("chat");
const chatInput = document.getElementById("chatInput");
const sendBtn   = document.getElementById("sendBtn");
 
const wsProtocol = location.protocol === "https:" ? "wss://" : "ws://";
const ws = new WebSocket(wsProtocol + location.host);
 
const { username } = getState();
setupChat(ws, chatInput, chat, sendBtn, username);
initPlayer(keys, ws, mouse);
 
// ── WebSocket message handler (outside sprite menu callback) ──────────────────
ws.addEventListener("message", (e) => {
  const data = JSON.parse(e.data);
  if (data.type === "init")    setMyId(data.id);
  if (data.type === "players") setOthers(data.players);
});
 
// ── Game loop ─────────────────────────────────────────────────────────────────
function loop() {
  syncMenuControlState();
  update();
  render(canvas, ctx);
  requestAnimationFrame(loop);
}
 
loop();
 
// ── Sprite menu (shown on top, doesn't block the loop) ───────────────────────
showSpriteMenu(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "setSprite", sprite: getState().sprite }));
    ws.send(JSON.stringify({ type: "menuClosed" }));
  }
});
