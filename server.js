const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
 
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
 
server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});
 
const PORT = process.env.PORT || 3000;
 
// Static files
app.use(express.static(path.join(__dirname), { index: "index.html" }));
 
// Constants — must match client constant.js
const HIT_DAMAGE = 0.1;
const PLAYER_RADIUS = 0.2;
const PROJECTILE_RADIUS = 0.025;
const PROJECTILE_HIT_RADIUS   = PLAYER_RADIUS + PROJECTILE_RADIUS; // 0.225
const PROJECTILE_HIT_RADIUS_Z = PLAYER_RADIUS + PROJECTILE_RADIUS; // 0.225
const MAX_HEALTH = 1;
const MAX_PROJECTILES_PER_PLAYER = 20;
 
const SPAWN_INVINCIBILITY_MS = 3_000; // 3 s post-spawn/respawn window
 
const SPAWN = { x: 3, y: 17, angle: 0 };
 
const players = {};
const processedHits = new Set();
 
let broadcastDirty = false;
 
// Broadcast loop — 20 Hz
setInterval(() => {
  if (broadcastDirty) {
    broadcastDirty = false;
    _doBroadcastPlayers();
  }
}, 1000 / 20);
 
// Helpers
function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}
 
function safeNum(v, fallback, min = -Infinity, max = Infinity) {
  return isFiniteNum(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
 
function _doBroadcastPlayers() {
  const now = Date.now();
  const cleanedPlayers = {};
 
  for (const id in players) {
    const p = players[id];
    cleanedPlayers[id] = {
      x: p.x,
      y: p.y,
      angle: p.angle,
      z: p.z,
      username: p.username,
      projectiles: p.projectiles || [],
      health: p.health,
      sprite: p.sprite,
      sneaking: p.sneaking,
      isDead: p.health <= 0,
      isInvincible: p.inMenu || now < (p.invincibleUntil || 0),
    };
  }
 
  const msg = JSON.stringify({ type: "players", players: cleanedPlayers });
 
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(msg); } catch {}
    }
  });
}
 
function markDirty() {
  broadcastDirty = true;
}
 
function broadcastPlayersNow() {
  broadcastDirty = false;
  _doBroadcastPlayers();
}
 
function broadcastChat(name, message) {
  broadcastAll({ type: "chat", name, message });
}
 
function broadcastAll(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(msg); } catch {}
    }
  });
}
 
function broadcastChatImage(name, imageData) {
  broadcastAll({ type: "chatImage", name, imageData });
}
 
// Collision
function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}
 
function checkProjectileHits() {
  const now = Date.now();
 
  for (const shooterId in players) {
    const projectiles = players[shooterId].projectiles || [];
 
    for (const projectile of projectiles) {
      if (
        !isFiniteNum(projectile.x) ||
        !isFiniteNum(projectile.y) ||
        !isFiniteNum(projectile.vx) ||
        !isFiniteNum(projectile.vy)
      ) continue;
 
      for (const victimId in players) {
        if (victimId === shooterId) continue;
 
        const victim = players[victimId];
        if (victim.health <= 0) continue;
 
        // Protected while in menu (name/sprite selection) OR in timed post-spawn window
        if (victim.inMenu) continue;
        if (now < (victim.invincibleUntil || 0)) continue;
 
        const hitKey = `${shooterId}:${projectile.id}:${victimId}`;
        if (processedHits.has(hitKey)) continue;
 
        const xyDist = pointToSegmentDist(
          victim.x, victim.y,
          projectile.x - projectile.vx,
          projectile.y - projectile.vy,
          projectile.x,
          projectile.y
        );
 
        const zDistance = Math.abs((projectile.z || 0) - (victim.z || 0));
 
        if (xyDist <= PROJECTILE_HIT_RADIUS && zDistance <= PROJECTILE_HIT_RADIUS_Z) {
          victim.health = Math.max(0, Number((victim.health - HIT_DAMAGE).toFixed(3)));
          processedHits.add(hitKey);
        }
      }
    }
  }
}
 
// Keepalive
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
 
// Connection
wss.on("connection", (ws) => {
  const id = Math.random().toString(36).slice(2);
  ws.id = id;
  ws.isAlive = true;
 
  players[id] = {
    x: SPAWN.x,
    y: SPAWN.y,
    angle: SPAWN.angle,
    z: 0,
    username: "Anonymous",
    projectiles: [],
    health: MAX_HEALTH,
    sprite: "/images/sprite1.png",
    invincibleUntil: 0,
    // inMenu: true keeps the player fully protected until they confirm the
    // sprite menu — no arbitrary time limit needed.
    inMenu: true,
    sneaking: false,
  };
 
  ws.send(JSON.stringify({ type: "init", id }));
 
  ws.on("pong", () => {
    ws.isAlive = true;
  });
 
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }
 
    if (data.type === "chat") {
      const message = String(data.message || "").trim().slice(0, 300);
      if (message) broadcastChat(players[id].username, message);
      return;
    }
 
    if (data.type === "chatImage") {
      const imageData = String(data.imageData || "");
      if (imageData.startsWith("data:image/") && imageData.length < 2_000_000) {
        broadcastChatImage(players[id].username, imageData);
      }
      return;
    }
 
    if (data.type === "setName") {
      const name = String(data.name || "Anonymous").trim().slice(0, 32) || "Anonymous";
      players[id].username = name;
      return;
    }
 
    if (data.type === "setSprite") {
      players[id].sprite = String(data.sprite || "").slice(0, 2048);
      return;
    }
 
    if (data.type === "menuOpen") {
      players[id].inMenu = true;
      return;
    }
 
    if (data.type === "menuClosed") {
      // Only reset health and grant timed invincibility when leaving the
      // initial join menu. Subsequent overlay open/close (customization,
      // settings) must NOT reset health — those don't set inMenu=true anyway.
      if (players[id].inMenu) {
        players[id].health = MAX_HEALTH;
        players[id].invincibleUntil = Date.now() + SPAWN_INVINCIBILITY_MS;
        players[id].inMenu = false;
      }
      broadcastPlayersNow();
      return;
    }
 
    if (data.type === "respawn") {
      players[id] = {
        ...players[id],
        health: MAX_HEALTH,
        invincibleUntil: Date.now() + SPAWN_INVINCIBILITY_MS,
        inMenu: false,
        projectiles: [],
        x: SPAWN.x,
        y: SPAWN.y,
        angle: SPAWN.angle,
        z: 0,
      };
      broadcastPlayersNow();
      return;
    }
 
    // Default: movement update
    const prev = players[id];
 
    players[id] = {
      ...prev,
      x: safeNum(data.x, prev.x, 0, 200),
      y: safeNum(data.y, prev.y, 0, 200),
      angle: safeNum(data.angle, prev.angle),
      z: safeNum(data.z, prev.z, 0, 10),
      sneaking: Boolean(data.sneaking),
      projectiles: Array.isArray(data.projectiles)
        ? data.projectiles.slice(0, MAX_PROJECTILES_PER_PLAYER).filter(
            (p) =>
              p &&
              typeof p === "object" &&
              typeof p.id === "number" &&
              isFiniteNum(p.x) &&
              isFiniteNum(p.y) &&
              isFiniteNum(p.vx) &&
              isFiniteNum(p.vy)
          )
        : prev.projectiles,
    };
 
    checkProjectileHits();
    markDirty();
  });
 
  ws.on("close", () => {
    delete players[id];
    broadcastPlayersNow();
  });
});
 
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});