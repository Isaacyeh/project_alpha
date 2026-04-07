import { initPlayer, update, getState, setMyId, setOthers } from "./script_files/player.js";
import { setupChat } from "./script_files/chat.js";
import { render } from "./script_files/render/render.js";

const keys = {};

const mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: {}};

window.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === canvas) return; // locked, handled separately
  const newX = e.clientX;
  const newY = e.clientY;
  mouse.dx = newX - (mouse.x || newX);
  mouse.dy = newY - (mouse.y || newY);
  mouse.x = newX;
  mouse.y = newY;
});

window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});
window.addEventListener("mousedown", (e) => {
  mouse.buttons[e.button] = true;
});
window.addEventListener("mouseup", (e) => {
  mouse.buttons[e.button] = false;
});

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Pointer lock setup
canvas.addEventListener("click", () => {
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
