import { initPlayer, update, getState, setMyId, setOthers } from "./script_files/player.js";
import { setupChat } from "./script_files/chat.js";
import { render } from "./script_files/render/render.js";

const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
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
initPlayer(keys, ws);

// NETWORK EVENTS
ws.addEventListener("message", (e) => {
  const data = JSON.parse(e.data);
  if (data.type === "init") setMyId(data.id);
  if (data.type === "players") setOthers(data.players);
});

// ====================
// UPDATE LOOP
// ====================
function update() {
  // 🚫 Disable movement while chatting
  if (isChatting) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({ x: player.x, y: player.y, angle: player.angle, z })
      );
    }
    return;
  }

  if (keys["ArrowLeft"]) player.angle -= 0.04;
  if (keys["ArrowRight"]) player.angle += 0.04;

  let moveX = 0,
    moveY = 0;

  if (keys["w"]) {
    moveX += Math.cos(player.angle) * MOVE_SPEED;
    moveY += Math.sin(player.angle) * MOVE_SPEED;
  }
  if (keys["s"]) {
    moveX -= Math.cos(player.angle) * MOVE_SPEED;
    moveY -= Math.sin(player.angle) * MOVE_SPEED;
  }
  if (keys["a"]) {
    moveX += Math.cos(player.angle - Math.PI / 2) * MOVE_SPEED;
    moveY += Math.sin(player.angle - Math.PI / 2) * MOVE_SPEED;
  }
  if (keys["d"]) {
    moveX += Math.cos(player.angle + Math.PI / 2) * MOVE_SPEED;
    moveY += Math.sin(player.angle + Math.PI / 2) * MOVE_SPEED;
  }

  if (keys[" "] && onGround) {
    zVel = JUMP_VELOCITY;
    onGround = false;
  }

  const nx = player.x + moveX;
  if (
    !isWall(nx + PLAYER_RADIUS, player.y) &&
    !isWall(nx - PLAYER_RADIUS, player.y)
  )
    player.x = nx;

  const ny = player.y + moveY;
  if (
    !isWall(player.x, ny + PLAYER_RADIUS) &&
    !isWall(player.x, ny - PLAYER_RADIUS)
  )
    player.y = ny;

  zVel -= GRAVITY;
  z += zVel;
  z = Math.min(z, MAX_JUMP);

  if (z <= 0) {
    z = 0;
    zVel = 0;
    onGround = true;
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({ x: player.x, y: player.y, angle: player.angle, z })
    );
  }
}

// ====================
// RENDERING
// ====================
function castRay(angle) {
  const sin = Math.sin(angle),
    cos = Math.cos(angle);
  let d = 0,
    prevX = player.x,
    prevY = player.y;

  while (d < 20) {
    const x = player.x + cos * d;
    const y = player.y + sin * d;
    if (isWall(x, y))
      return { dist: d, vertical: Math.floor(x) !== Math.floor(prevX) };
    prevX = x;
    prevY = y;
    d += 0.02;
  }
  return { dist: 20, vertical: false };
}

function drawMinimap() {
  const VIEW_RADIUS = 12;
  const startX = MINIMAP_PADDING,
    startY = MINIMAP_PADDING;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(
    startX - 4,
    startY - 4,
    VIEW_RADIUS * 2 * MINIMAP_SCALE + 8,
    VIEW_RADIUS * 2 * MINIMAP_SCALE + 8
  );

  const centerX = Math.floor(player.x),
    centerY = Math.floor(player.y);

  for (let y = -VIEW_RADIUS; y < VIEW_RADIUS; y++) {
    for (let x = -VIEW_RADIUS; x < VIEW_RADIUS; x++) {
      const mapX = centerX + x,
        mapY = centerY + y;
      if (map[mapY]?.[mapX] === mapStr) {
        ctx.fillStyle = "#888";
        ctx.fillRect(
          startX + (x + VIEW_RADIUS) * MINIMAP_SCALE,
          startY + (y + VIEW_RADIUS) * MINIMAP_SCALE,
          MINIMAP_SCALE,
          MINIMAP_SCALE
        );
      }
    }
  }

  for (const id in others) {
    if (id === myId) continue;
    const p = others[id];
    const dx = p.x - player.x,
      dy = p.y - player.y;
    if (Math.abs(dx) > VIEW_RADIUS || Math.abs(dy) > VIEW_RADIUS) continue;
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(
      startX + (dx + VIEW_RADIUS) * MINIMAP_SCALE,
      startY + (dy + VIEW_RADIUS) * MINIMAP_SCALE,
      3,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  ctx.fillStyle = "lime";
  ctx.beginPath();
  ctx.arc(
    startX + VIEW_RADIUS * MINIMAP_SCALE + VIEW_RADIUS / 2,
    startY + VIEW_RADIUS * MINIMAP_SCALE + VIEW_RADIUS / 2,
    4,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Direction
  ctx.strokeStyle = "lime";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(
    startX + VIEW_RADIUS * MINIMAP_SCALE + (VIEW_RADIUS / 2),
    startY + VIEW_RADIUS * MINIMAP_SCALE + (VIEW_RADIUS / 2)
  );
  ctx.lineTo(
    startX + (VIEW_RADIUS + Math.cos(player.angle) * 0.8) * MINIMAP_SCALE + (VIEW_RADIUS / 2),
    startY + (VIEW_RADIUS + Math.sin(player.angle) * 0.8) * MINIMAP_SCALE + (VIEW_RADIUS / 2)
  );
  ctx.stroke();
}

function render() {
  const jumpOffset = z * JUMP_SCALE;
  const horizon = canvas.height / 2 + jumpOffset;

  // Sky
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, canvas.width, horizon);

  // Floor
  ctx.fillStyle = "#555";
  ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);

  const depth = [];

  let prevTileX = Math.floor(player.x);
  let prevTileY = Math.floor(player.y);

  for (let i = 0; i < RAYS; i++) {
    const rayAngle = player.angle - FOV / 2 + (i / RAYS) * FOV;
    const hit = castRay(rayAngle);
    const dist = hit.dist * Math.cos(rayAngle - player.angle);
    const height = canvas.height / dist;

    depth[i] = dist;

    // Determine wall face color
    const faceColor = "#ffffff";    // main face color
    const edgeColor = "#000000";    // edge color

    // Draw main face
    ctx.fillStyle = faceColor;
    ctx.fillRect(i, horizon - height / 2, 1, height);

    // --- Edge detection: check if ray crossed tile boundary ---
    const hitX = player.x + Math.cos(rayAngle) * hit.dist;
    const hitY = player.y + Math.sin(rayAngle) * hit.dist;

    const tileX = Math.floor(hitX);
    const tileY = Math.floor(hitY);

    // If the ray is entering a new tile horizontally or vertically, draw edge
    if (tileX !== prevTileX || tileY !== prevTileY) {
      ctx.fillStyle = edgeColor;
      ctx.fillRect(i, horizon - height / 2, 1, height);
    }

    prevTileX = tileX;
    prevTileY = tileY;
  }

  // Draw other players
  for (const id in others) {
    if (id === myId) continue;
    const p = others[id];

    const dx = p.x - player.x;
    const dy = p.y - player.y;
    const dist = Math.hypot(dx, dy);

    const angle = Math.atan2(dy, dx) - player.angle;
    const norm = Math.atan2(Math.sin(angle), Math.cos(angle));
    if (Math.abs(norm) > FOV / 2) continue;

    const sx = (0.5 + norm / FOV) * canvas.width;
    if (depth[Math.floor(sx)] < dist) continue;

    const size = canvas.height / dist;
    const sy = horizon - size / 2 - (p.z || 0) * JUMP_SCALE;

    ctx.fillStyle = "red";
    ctx.fillRect(sx - size / 4, sy, size / 2, size);
  }

  drawMinimap();
  requestAnimationFrame(loop);
}

function loop() {
  update();
  render(canvas, ctx);
  requestAnimationFrame(loop);
}

loop();
