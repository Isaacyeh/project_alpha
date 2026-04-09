const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
 
const app = express();
const server = http.createServer(app);
 
// ── WebSocket server ──────────────────────────────────────────────────────────
// Do NOT pass { server } to WebSocket.Server if you want to handle the upgrade
// manually — but here we DO pass it so ws handles upgrades automatically.
// The key is that we also handle the 'upgrade' event on the http server to
// ensure Render's proxy correctly forwards WebSocket upgrades.
const wss = new WebSocket.Server({ noServer: true });
 
// Manually handle the HTTP upgrade so it works behind Render's proxy.
// When { server } is passed directly some proxies interfere; noServer + manual
// upgrade handling is more reliable on platforms like Render and Railway.
server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});
 
const PORT = process.env.PORT || 3000;
 
// ── Static files ──────────────────────────────────────────────────────────────
// Serve from __dirname but with explicit index so Render's health check gets
// a fast response from GET /
app.use(express.static(path.join(__dirname), { index: "index.html" }));
 
// Explicit health check — Render probes this to decide if the service is up
app.get("/healthz", (_req, res) => res.sendStatus(200));
 
// ── Shared constants (keep in sync with script_files/constant.js) ─────────────
const HIT_DAMAGE               = 0.1;
const PLAYER_RADIUS            = 0.2;
const PROJECTILE_RADIUS        = 0.05;
const PROJECTILE_HIT_RADIUS    = PLAYER_RADIUS + PROJECTILE_RADIUS;   // 0.25
const PROJECTILE_HIT_RADIUS_Z  = PLAYER_RADIUS + PROJECTILE_RADIUS;
const MAX_HEALTH               = 1;
const MAX_PROJECTILES_PER_PLAYER = 20;
const SPAWN_INVINCIBILITY_MS   = 3000;
 
const SPAWN = { x: 3, y: 17, angle: 0 };
 
const players      = {};
const processedHits = new Set();
 
// ── Broadcast throttle (20 Hz) ────────────────────────────────────────────────
let broadcastDirty = false;
 
setInterval(() => {
  if (broadcastDirty) {
    broadcastDirty = false;
    _doBroadcastPlayers();
  }
}, 1000 / 20);
 
// ── Helpers ───────────────────────────────────────────────────────────────────
function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}
 
function safeNum(v, fallback, min = -Infinity, max = Infinity) {
  return isFiniteNum(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
 
function _doBroadcastPlayers() {
  if (wss.clients.size === 0) return;
  const now = Date.now();
  const out  = {};
  for (const id in players) {
    const p = players[id];
    out[id] = {
      x:            p.x,
      y:            p.y,
      angle:        p.angle,
      z:            p.z,
      username:     p.username,
      projectiles:  p.projectiles || [],
      health:       p.health,
      sprite:       p.sprite,
      sneaking:     p.sneaking,
      isDead:       p.health <= 0,
      isInvincible: now < (p.invincibleUntil || 0),
    };
  }
  const msg = JSON.stringify({ type: "players", players: out });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(msg); } catch (_) {}
    }
  });
}
 
function markDirty()         { broadcastDirty = true; }
function broadcastPlayersNow() { broadcastDirty = false; _doBroadcastPlayers(); }
 
function broadcastAll(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(msg); } catch (_) {}
    }
  });
}
 
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
    for (const proj of players[shooterId].projectiles || []) {
      if (!isFiniteNum(proj.x) || !isFiniteNum(proj.y) ||
          !isFiniteNum(proj.vx) || !isFiniteNum(proj.vy)) continue;
 
      for (const victimId in players) {
        if (victimId === shooterId) continue;
        const victim = players[victimId];
        if (victim.health <= 0 || victim.inMenu) continue;
        if (now < (victim.invincibleUntil || 0)) continue;
 
        const hitKey = `${shooterId}:${proj.id}:${victimId}`;
        if (processedHits.has(hitKey)) continue;
 
        const xyDist = pointToSegmentDist(
          victim.x, victim.y,
          proj.x - proj.vx, proj.y - proj.vy,
          proj.x, proj.y
        );
        const zDist = Math.abs((proj.z || 0) - (victim.z || 0));
 
        if (xyDist <= PROJECTILE_HIT_RADIUS && zDist <= PROJECTILE_HIT_RADIUS_Z) {
          victim.health = Math.max(0, Number((victim.health - HIT_DAMAGE).toFixed(3)));
          processedHits.add(hitKey);
        }
      }
    }
  }
 
  // Purge stale hit keys
  const active = new Set();
  for (const sid in players)
    for (const p of players[sid].projectiles || [])
      for (const vid in players)
        active.add(`${sid}:${p.id}:${vid}`);
 
  for (const key of [...processedHits])
    if (!active.has(key)) processedHits.delete(key);
}
 
// ── WebSocket keepalive (prevents Render proxy from dropping idle connections) ─
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);
 
// ── Connection handler ────────────────────────────────────────────────────────
wss.on("connection", (ws) => {
  const id = Math.random().toString(36).slice(2);
  ws.id      = id;
  ws.isAlive = true;
 
  players[id] = {
    x: SPAWN.x, y: SPAWN.y, angle: SPAWN.angle, z: 0,
    username:        "Anonymous",
    projectiles:     [],
    health:          MAX_HEALTH,
    sprite:          "/images/sprite1.png",
    invincibleUntil: 0,
    inMenu:          true,
    sneaking:        false,
  };
 
  ws.send(JSON.stringify({ type: "init", id }));
 
  ws.on("pong",  () => { ws.isAlive = true; });
  ws.on("error", (err) => console.error(`WS error [${id}]:`, err.message));
 
  ws.on("message", (raw) => {
    if (raw.length > 2_100_000) return; // block oversized payloads
 
    let data;
    try { data = JSON.parse(raw); } catch { return; }
 
    switch (data.type) {
 
      case "chat": {
        const msg = String(data.message || "").trim().slice(0, 300);
        if (msg) broadcastAll({ type: "chat", name: players[id]?.username ?? "Anonymous", message: msg });
        break;
      }
 
      case "chatImage": {
        const img = String(data.imageData || "");
        if (img.startsWith("data:image/") && img.length < 2_000_000)
          broadcastAll({ type: "chatImage", name: players[id]?.username ?? "Anonymous", imageData: img });
        break;
      }
 
      case "setName": {
        const name = String(data.name || "Anonymous").trim().slice(0, 32) || "Anonymous";
        if (players[id]) players[id].username = name;
        break;
      }
 
      case "setSprite": {
        if (players[id]) players[id].sprite = String(data.sprite || "").slice(0, 2048);
        break;
      }
 
      case "menuOpen": {
        if (players[id]) players[id].inMenu = true;
        break;
      }
 
      case "menuClosed": {
        if (players[id]) {
          if (players[id].inMenu) {
            players[id].health          = MAX_HEALTH;
            players[id].invincibleUntil = Date.now() + SPAWN_INVINCIBILITY_MS;
          }
          players[id].inMenu = false;
          broadcastPlayersNow();
        }
        break;
      }
 
      case "respawn": {
        if (players[id]) {
          Object.assign(players[id], {
            health: MAX_HEALTH, invincibleUntil: Date.now() + SPAWN_INVINCIBILITY_MS,
            inMenu: false, projectiles: [],
            x: SPAWN.x, y: SPAWN.y, angle: SPAWN.angle, z: 0,
          });
          broadcastPlayersNow();
        }
        break;
      }
 
      default: {
        // Position / projectile update
        if (!players[id]) break;
        const prev = players[id];
        players[id] = {
          ...prev,
          x:        safeNum(data.x,     prev.x,     0, 200),
          y:        safeNum(data.y,     prev.y,     0, 200),
          angle:    safeNum(data.angle, prev.angle),
          z:        safeNum(data.z,     prev.z,     0,  10),
          sneaking: Boolean(data.sneaking),
          // Server-authoritative fields never overwritten by client
          health:          prev.health,
          invincibleUntil: prev.invincibleUntil,
          inMenu:          prev.inMenu,
          username:        prev.username,
          sprite:          prev.sprite,
          projectiles: Array.isArray(data.projectiles)
            ? data.projectiles.slice(0, MAX_PROJECTILES_PER_PLAYER).filter(
                (p) => p && typeof p === "object" && typeof p.id === "number" &&
                       isFiniteNum(p.x) && isFiniteNum(p.y) &&
                       isFiniteNum(p.vx) && isFiniteNum(p.vy)
              )
            : prev.projectiles,
        };
        checkProjectileHits();
        markDirty();
        break;
      }
    }
  });
 
  ws.on("close", () => {
    delete players[id];
    broadcastPlayersNow();
  });
});
 
// ── Process-level safety net ──────────────────────────────────────────────────
process.on("uncaughtException",  (e) => console.error("Uncaught:", e));
process.on("unhandledRejection", (e) => console.error("Unhandled:", e));
 
// Bind explicitly to 0.0.0.0 — required on some cloud platforms
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
