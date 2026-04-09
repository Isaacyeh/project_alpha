const express = require("express");
const http = require("http");
const WebSocket = require("ws");
 
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
 
const PORT = process.env.PORT || 3000;
 
app.use(express.static(__dirname));
 
// ── Shared constants (must be kept in sync with script_files/constant.js) ───
const HIT_DAMAGE = 0.1;
const PLAYER_RADIUS = 0.2;
const PROJECTILE_RADIUS = 0.05;
const PROJECTILE_HIT_RADIUS = PLAYER_RADIUS + PROJECTILE_RADIUS; // 0.25
const PROJECTILE_HIT_RADIUS_Z = PLAYER_RADIUS + PROJECTILE_RADIUS;
const MAX_HEALTH = 1;
const MAX_PROJECTILES_PER_PLAYER = 20; // cap to prevent server spam/lag
// ────────────────────────────────────────────────────────────────────────────
 
// Invincibility is tracked in real milliseconds, independent of how many
// clients are connected or how often messages arrive.
const SPAWN_INVINCIBILITY_MS = 3000; // 3 seconds
 
const SPAWN = { x: 3, y: 17, angle: 0 };
 
const players = {};
const processedHits = new Set();
 
// ── Helpers ──────────────────────────────────────────────────────────────────
 
function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}
 
// Returns v clamped to [min, max] if it is a finite number, otherwise fallback.
function safeNum(v, fallback, min = -Infinity, max = Infinity) {
  return isFiniteNum(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
 
function broadcastPlayers() {
  const cleanedPlayers = {};
  for (const id in players) {
    const p = players[id];
    cleanedPlayers[id] = {
      x:          p.x,
      y:          p.y,
      angle:      p.angle,
      z:          p.z,
      username:   p.username,
      projectiles: p.projectiles || [],
      health:     p.health,
      sprite:     p.sprite,
      sneaking:   p.sneaking,
    };
  }
  const data = JSON.stringify({ type: "players", players: cleanedPlayers });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}
 
function broadcastChat(name, message) {
  const data = JSON.stringify({ type: "chat", name, message });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}
 
/**
 * Returns the minimum distance between point P and line segment AB.
 * Swept collision — checks the full path the projectile traveled this
 * frame so fast projectiles cannot tunnel through targets.
 */
function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}
 
function checkProjectileHits() {
  const now = Date.now();
 
  for (const shooterId in players) {
    const shooter = players[shooterId];
    const projectiles = shooter.projectiles || [];
 
    for (const projectile of projectiles) {
      // Skip any projectile with non-finite coords (should be filtered on
      // arrival, but double-check here to protect pointToSegmentDist)
      if (
        !isFiniteNum(projectile.x)  ||
        !isFiniteNum(projectile.y)  ||
        !isFiniteNum(projectile.vx) ||
        !isFiniteNum(projectile.vy)
      ) continue;
 
      for (const victimId in players) {
        if (victimId === shooterId) continue;
        const victim = players[victimId];
        if (victim.health <= 0) continue;
 
        // Skip players who are in a menu or still invincible
        if (victim.inMenu) continue;
        if (now < (victim.invincibleUntil || 0)) continue;
 
        const hitKey = `${shooterId}:${projectile.id}:${victimId}`;
        if (processedHits.has(hitKey)) continue;
 
        // Swept XY check (previous position → current position)
        const prevX = projectile.x - projectile.vx;
        const prevY = projectile.y - projectile.vy;
        const xyDist = pointToSegmentDist(
          victim.x, victim.y,
          prevX, prevY,
          projectile.x, projectile.y
        );
 
        const zDistance = Math.abs((projectile.z || 0) - (victim.z || 0));
 
        if (xyDist <= PROJECTILE_HIT_RADIUS && zDistance <= PROJECTILE_HIT_RADIUS_Z) {
          victim.health = Math.max(0, Number((victim.health - HIT_DAMAGE).toFixed(3)));
          processedHits.add(hitKey);
        }
      }
    }
  }
 
  // Collect stale hit-keys, then delete — avoids mutating the Set while iterating it
  const activeKeys = new Set();
  for (const shooterId in players) {
    for (const p of players[shooterId].projectiles || []) {
      for (const victimId in players) {
        activeKeys.add(`${shooterId}:${p.id}:${victimId}`);
      }
    }
  }
  const staleKeys = [];
  for (const key of processedHits) {
    if (!activeKeys.has(key)) staleKeys.push(key);
  }
  for (const key of staleKeys) processedHits.delete(key);
}
 
// ── Connection handler ────────────────────────────────────────────────────────
 
wss.on("connection", (ws) => {
  const id = Math.random().toString(36).slice(2);
  ws.id = id;
  ws.username = "Anonymous";
 
  players[id] = {
    x:              SPAWN.x,
    y:              SPAWN.y,
    angle:          SPAWN.angle,
    z:              0,
    username:       ws.username,
    projectiles:    [],
    health:         MAX_HEALTH,
    sprite:         "/images/sprite1.png",
    invincibleUntil: 0,   // timestamp — replaces tick-counted invincibilityTimer
    inMenu:         true, // treat as in-menu until sprite select is confirmed
    sneaking:       false,
  };
 
  ws.send(JSON.stringify({ type: "init", id }));
 
  // Without this handler an unhandled 'error' event crashes the whole process
  ws.on("error", (err) => {
    console.error(`WebSocket error for player ${id}:`, err.message);
  });
 
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return; // ignore malformed JSON silently
    }
 
    // ── Named message types ─────────────────────────────────────────────────
 
    if (data.type === "chat") {
      const message = String(data.message || "").trim().slice(0, 300);
      if (message) broadcastChat(ws.username, message);
      return;
    }
 
    if (data.type === "setName") {
      ws.username = String(data.name || "Anonymous").trim().slice(0, 32) || "Anonymous";
      if (players[id]) players[id].username = ws.username;
      return;
    }
 
    if (data.type === "setSprite") {
      if (players[id]) players[id].sprite = String(data.sprite || "").slice(0, 2048);
      return;
    }
 
    if (data.type === "menuOpen") {
      if (players[id]) players[id].inMenu = true;
      return;
    }
 
    if (data.type === "menuClosed") {
      if (players[id]) {
        // Only restore health when the player was actually flagged as in-menu
        // (sprite select / customization overlay). This prevents a tab-switch
        // or any stray menuClosed message from resetting damage dealt to them.
        if (players[id].inMenu) {
          players[id].health = MAX_HEALTH;
          players[id].invincibleUntil = Date.now() + SPAWN_INVINCIBILITY_MS;
        }
        players[id].inMenu = false;
        broadcastPlayers();
      }
      return;
    }
 
    if (data.type === "respawn") {
      if (players[id]) {
        players[id].health         = MAX_HEALTH;
        players[id].invincibleUntil = Date.now() + SPAWN_INVINCIBILITY_MS;
        players[id].inMenu         = false;
        players[id].projectiles    = [];
        players[id].x              = SPAWN.x;
        players[id].y              = SPAWN.y;
        players[id].angle          = SPAWN.angle;
        players[id].z              = 0;
        broadcastPlayers();
      }
      return;
    }
 
    // ── Position / projectile update (the default, un-typed message) ────────
 
    if (!players[id]) return;
 
    const prev = players[id];
 
    // Sanitize every numeric field from the client. A single NaN or Infinity
    // in x/y would corrupt distance calculations for every other player.
    players[id] = {
      ...prev,
      x:       safeNum(data.x,     prev.x,     0, 200),
      y:       safeNum(data.y,     prev.y,     0, 200),
      angle:   safeNum(data.angle, prev.angle),
      z:       safeNum(data.z,     prev.z,     0,  10),
      sneaking: Boolean(data.sneaking),
 
      // Server-authoritative fields — the client never gets to overwrite these
      health:          prev.health,
      invincibleUntil: prev.invincibleUntil,
      inMenu:          prev.inMenu,
      username:        prev.username,
      sprite:          prev.sprite,
 
      // Accept the client's projectile list, but cap the count and reject any
      // entry with non-finite coordinates to protect the hit-detection math.
      projectiles: Array.isArray(data.projectiles)
        ? data.projectiles
            .slice(0, MAX_PROJECTILES_PER_PLAYER)
            .filter(
              (p) =>
                p !== null &&
                typeof p === "object" &&
                typeof p.id === "number" &&
                isFiniteNum(p.x)  &&
                isFiniteNum(p.y)  &&
                isFiniteNum(p.vx) &&
                isFiniteNum(p.vy)
            )
        : prev.projectiles,
    };
 
    checkProjectileHits();
    broadcastPlayers();
  });
 
  ws.on("close", () => {
    delete players[id];
    broadcastPlayers();
  });
});
 
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
