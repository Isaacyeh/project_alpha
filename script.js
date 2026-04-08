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
import { showSpriteMenu } from "./script_files/UI/spriteMenu.js";
import { setCrosshairOptions } from "./script_files/crosshair.js";

const keys = {};

const mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: {}};

window.addEventListener("mousemove", (e) => {
  if (isAnyMenuOpen()) {
    mouse.dx = 0;
    mouse.dy = 0;
    return;
  }
  if (document.pointerLockElement === canvas) {
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
    return;
  } else {
    mouse.dx = 0;
    mouse.dy = 0;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    return;
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

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const customizationMenuLink = document.getElementById("customizationMenuLink");
const customizationOverlay = document.getElementById("customizationOverlay");
const closeCustomization = document.getElementById("closeCustomization");
const crosshairImageInput = document.getElementById("crosshairImageInput");
const crosshairOpacityInput = document.getElementById("crosshairOpacityInput");
const confirmCustomization = document.getElementById("confirmCustomization");
const menu = document.getElementById("menu");
let pendingCrosshairImage = "";
let appliedCrosshairImage = "";
let pendingCrosshairOpacity = Number(crosshairOpacityInput.value);
let appliedCrosshairOpacity = Number(crosshairOpacityInput.value);
let pendingCrosshairBlobUrl = null;
let appliedCrosshairBlobUrl = null;
menu.classList.add("hidden");
customizationOverlay.classList.add("hidden");
setCrosshairOptions({ opacity: appliedCrosshairOpacity, imageSrc: "" });

function clearInputState() {
  Object.keys(keys).forEach((key) => {
    keys[key] = false;
  });
  mouse.dx = 0;
  mouse.dy = 0;
  mouse.buttons = {};
}

function isCustomizationOpen() {
  return !customizationOverlay.classList.contains("hidden");
}

function isAnyMenuOpen() {
  return !menu.classList.contains("hidden") || isCustomizationOpen();
}

function syncMenuControlState() {
  setMenuOpen(isAnyMenuOpen());
}

function openCustomizationOverlay() {
  if (menu.classList.contains("hidden")) return;
  customizationOverlay.classList.remove("hidden");
  customizationOverlay.setAttribute("aria-hidden", "false");
  crosshairOpacityInput.value = String(appliedCrosshairOpacity);
  pendingCrosshairOpacity = appliedCrosshairOpacity;
  pendingCrosshairImage = appliedCrosshairImage;
  syncMenuControlState();
  clearInputState();
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
}

function closeCustomizationOverlay() {
  customizationOverlay.classList.add("hidden");
  customizationOverlay.setAttribute("aria-hidden", "true");
  syncMenuControlState();
  clearInputState();
}

// Pointer lock setup
canvas.addEventListener("click", () => {
  if (isCustomizationOpen()) return;
  canvas.requestPointerLock();
});

customizationMenuLink.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openCustomizationOverlay();
  menu.classList.add("hidden");
  syncMenuControlState();
});

closeCustomization.addEventListener("click", closeCustomizationOverlay);
closeCustomization.addEventListener("pointerdown", (e) => {
  e.preventDefault();
});

customizationOverlay.addEventListener("click", (e) => {
  if (e.target === customizationOverlay) {
    closeCustomizationOverlay();
  }
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
  pendingCrosshairImage = pendingCrosshairBlobUrl;
});

confirmCustomization.addEventListener("click", () => {
  if (appliedCrosshairBlobUrl && appliedCrosshairBlobUrl !== pendingCrosshairBlobUrl) {
    URL.revokeObjectURL(appliedCrosshairBlobUrl);
  }

  appliedCrosshairImage = pendingCrosshairImage;
  appliedCrosshairOpacity = pendingCrosshairOpacity;
  appliedCrosshairBlobUrl = pendingCrosshairBlobUrl;
  setCrosshairOptions({
    opacity: appliedCrosshairOpacity,
    imageSrc: appliedCrosshairImage,
  });

  closeCustomizationOverlay();
});

// chat elements
const chat = document.getElementById("chat");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

// WebSocket
const wsProtocol = location.protocol === "https:" ? "wss://" : "ws://";
const ws = new WebSocket(wsProtocol + location.host);

const { username } = getState();
setupChat(ws, chatInput, chat, sendBtn, username);
initPlayer(keys, ws, mouse);
showSpriteMenu(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "setSprite", sprite: getState().sprite }));
    ws.send(JSON.stringify({ type: "menuClosed" }));
  }
});

// NETWORK EVENTS
ws.addEventListener("message", (e) => {
  const data = JSON.parse(e.data);
  if (data.type === "init") setMyId(data.id);
  if (data.type === "players") setOthers(data.players);
});

function loop() {
  syncMenuControlState();
  update();
  render(canvas, ctx);
  requestAnimationFrame(loop);
}

loop();
