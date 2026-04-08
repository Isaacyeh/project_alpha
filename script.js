import { initPlayer, update, getState, setMyId, setOthers } from "./script_files/player.js";
import { setupChat } from "./script_files/chat.js";
import { render } from "./script_files/render/render.js";
import { showSpriteMenu } from "./script_files/UI/spriteMenu.js";

const keys = {};

const mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: {}};

window.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

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
document.addEventListener("keyup", (e) => {
  keys[e.key] = false;


  keys[e.key.toLowerCase()] = false;
  keys[e.key.toUpperCase()] = false;
});
window.addEventListener("mousedown", (e) => {
  mouse.buttons[e.button] = true;
});
window.addEventListener("mouseup", (e) => {
  mouse.buttons[e.button] = false;
});

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

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
  update();
  render(canvas, ctx);
  requestAnimationFrame(loop);
}

loop();
