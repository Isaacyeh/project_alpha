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
 
// ── In-game disconnect banner ─────────────────────────────────────────────────
// Shows a non-blocking top banner if the WS drops mid-game (not on first load —
// that's handled by loader.js).
let disconnectBanner = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 8;
 
function showDisconnectBanner(msg) {
  if (disconnectBanner) return;
  disconnectBanner = document.createElement("div");
  disconnectBanner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 9000;
    background: rgba(160,30,30,0.92); color: #fff;
    font-family: 'Courier New', monospace; font-size: 13px;
    letter-spacing: 0.12em; text-align: center;
    padding: 10px; text-transform: uppercase;
  `;
  disconnectBanner.textContent = msg;
  document.body.appendChild(disconnectBanner);
}
function updateDisconnectBanner(msg) {
  if (disconnectBanner) disconnectBanner.textContent = msg;
}
function hideDisconnectBanner() {
  if (disconnectBanner) { disconnectBanner.remove(); disconnectBanner = null; }
}
 
// ── WebSocket factory (used for both initial connect and mid-game reconnect) ──
const chat      = document.getElementById("chat");
const chatInput = document.getElementById("chatInput");
const sendBtn   = document.getElementById("sendBtn");
 
// loader.js already opened a WebSocket and stored the promise on window.
// We wait for it so we never open a duplicate connection.
let ws;
let chatSetup = false;
 
async function initGame(resolvedWs) {
  ws = resolvedWs;
  wireWsHandlers(ws);
 
  const { username } = getState();
  if (!chatSetup) {
    setupChat(ws, chatInput, chat, sendBtn, username);
    chatSetup = true;
  }
 
  initPlayer(keys, ws, mouse);
 
  // Game loop
  function loop() {
    syncMenuControlState();
    update();
    render(canvas, ctx);
    requestAnimationFrame(loop);
  }
  loop();
 
  // Sprite menu shown once
  showSpriteMenu(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "setSprite", sprite: getState().sprite }));
      ws.send(JSON.stringify({ type: "menuClosed" }));
    }
  });
}
 
function wireWsHandlers(socket) {
  socket.addEventListener("message", (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "init")    setMyId(data.id);
    if (data.type === "players") setOthers(data.players);
  });
 
  socket.addEventListener("close", (e) => {
    // Code 1000/1001 = deliberate close (page unload etc.) — don't reconnect
    if (e.code === 1000 || e.code === 1001) return;
    handleMidGameDisconnect();
  });
 
  socket.addEventListener("error", () => {
    // 'close' will fire after — handled there
  });
}
 
function handleMidGameDisconnect() {
  if (reconnectAttempts >= MAX_RECONNECT) {
    showDisconnectBanner("Connection lost — please refresh the page.");
    return;
  }
 
  reconnectAttempts++;
  const delay = Math.min(1500 * reconnectAttempts, 8000);
  showDisconnectBanner(`Connection lost — reconnecting (${reconnectAttempts}/${MAX_RECONNECT})...`);
 
  setTimeout(() => {
    const wsProtocol = location.protocol === "https:" ? "wss://" : "ws://";
    const newWs = new WebSocket(wsProtocol + location.host);
 
    newWs.addEventListener("open", () => {
      ws = newWs;
      // Re-send identity so the server knows who we are
      const { username, sprite } = getState();
      newWs.send(JSON.stringify({ type: "setName",   name: username }));
      newWs.send(JSON.stringify({ type: "setSprite", sprite }));
      // Re-wire player module and chat to new socket
      initPlayer(keys, newWs, mouse);
      wireWsHandlers(newWs);
      reconnectAttempts = 0;
      hideDisconnectBanner();
    });
 
    newWs.addEventListener("error", () => {});
    newWs.addEventListener("close", () => handleMidGameDisconnect());
  }, delay);
}
 
// ── Boot: wait for loader's WS promise ───────────────────────────────────────
// loader.js sets window.__gameWsPromise before this module runs.
// If for any reason it's missing (e.g. loader.js wasn't included), fall back
// to creating our own WebSocket so the game still works.
const wsPromise = window.__gameWsPromise || Promise.resolve((() => {
  const wsProtocol = location.protocol === "https:" ? "wss://" : "ws://";
  return new WebSocket(wsProtocol + location.host);
})());
 
wsPromise.then(initGame).catch((err) => {
  console.error("[script.js] Failed to get WebSocket from loader:", err);
});