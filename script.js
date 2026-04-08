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

const keys = {};

const mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: {}};

window.addEventListener("mousemove", (e) => {
  if (!customizationOverlay.classList.contains("hidden")) {
    mouse.dx = 0;
    mouse.dy = 0;
    return;
  }
  if (document.pointerLockElement === canvas) return; // locked, handled separately
  const newX = e.clientX;
  const newY = e.clientY;
  mouse.dx = newX - (mouse.x || newX);
  mouse.dy = newY - (mouse.y || newY);
  mouse.x = newX;
  mouse.y = newY;
});

window.addEventListener("keydown", (e) => {
  if (!customizationOverlay.classList.contains("hidden")) return;
  keys[e.key] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});
window.addEventListener("mousedown", (e) => {
  if (!customizationOverlay.classList.contains("hidden")) return;
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
const crosshair = document.getElementById("crosshair");
const crosshairImageInput = document.getElementById("crosshairImageInput");
const crosshairOpacityInput = document.getElementById("crosshairOpacityInput");
const confirmCustomization = document.getElementById("confirmCustomization");
const menu = document.getElementById("menu");
let pendingCrosshairImage = "";
let appliedCrosshairImage = "";
let pendingCrosshairOpacity = Number(crosshairOpacityInput.value);
let appliedCrosshairOpacity = Number(crosshairOpacityInput.value);

function clearInputState() {
  Object.keys(keys).forEach((key) => {
    keys[key] = false;
  });
  mouse.dx = 0;
  mouse.dy = 0;
  mouse.buttons = {};
}

function openCustomizationOverlay() {
  customizationOverlay.classList.remove("hidden");
  customizationOverlay.setAttribute("aria-hidden", "false");
  crosshairOpacityInput.value = String(appliedCrosshairOpacity);
  pendingCrosshairOpacity = appliedCrosshairOpacity;
  pendingCrosshairImage = appliedCrosshairImage;
  setMenuOpen(true);
  clearInputState();
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
}

function closeCustomizationOverlay() {
  customizationOverlay.classList.add("hidden");
  customizationOverlay.setAttribute("aria-hidden", "true");
  setMenuOpen(false);
  clearInputState();
}

// Pointer lock setup
canvas.addEventListener("click", () => {
  if (!customizationOverlay.classList.contains("hidden")) return;
  canvas.requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvas) {
    window.addEventListener("mousemove", onLockedMouseMove);
  } else {
    window.removeEventListener("mousemove", onLockedMouseMove);
  }
});

function onLockedMouseMove(e) {
  mouse.dx = e.movementX;
  mouse.dy = e.movementY;
}

customizationMenuLink.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openCustomizationOverlay();
  menu.classList.add("hidden");
});

closeCustomization.addEventListener("click", () => {
  closeCustomizationOverlay();
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
  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    pendingCrosshairImage = String(loadEvent.target.result || "");
  };
  reader.readAsDataURL(file);
});

confirmCustomization.addEventListener("click", () => {
  appliedCrosshairImage = pendingCrosshairImage;
  appliedCrosshairOpacity = pendingCrosshairOpacity;
  crosshair.style.opacity = String(appliedCrosshairOpacity);

  if (appliedCrosshairImage) {
    crosshair.style.backgroundImage = `url("${appliedCrosshairImage}")`;
    crosshair.textContent = "";
  } else {
    crosshair.style.backgroundImage = "none";
    crosshair.textContent = "+";
  }

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

// NETWORK EVENTS
ws.addEventListener("message", (e) => {
  const data = JSON.parse(e.data);
  if (data.type === "init") setMyId(data.id);
  if (data.type === "players") setOthers(data.players);
});

function loop() {
  update();
  render(canvas, ctx);
  requestAnimationFrame(loop);
}

loop();
