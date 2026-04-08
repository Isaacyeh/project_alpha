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
const PLAYER_RADIUS = 0.2; // physical half-width of a player
const PROJECTILE_RADIUS = 0.05; // visual radius of the ball
// A hit registers when the ball's edge touches the player's edge:
// total = PLAYER_RADIUS + PROJECTILE_RADIUS
const PROJECTILE_HIT_RADIUS = PLAYER_RADIUS + PROJECTILE_RADIUS; // 0.25
const PROJECTILE_HIT_RADIUS_Z = PLAYER_RADIUS + PROJECTILE_RADIUS; // same idea vertically
const MAX_HEALTH = 1;
// ────────────────────────────────────────────────────────────────────────────
const SPAWN_INVINCIBILITY_DURATION = 180; // 3 seconds at 60fps

const SPAWN = { x: 3, y: 17, angle: 0 };

const players = {};
const processedHits = new Set();

function broadcastPlayers() {
  // Clean player data before broadcasting to remove server-only fields
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
 * frame, not just its tip, so fast projectiles can't tunnel through targets.
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
  debugTick++;
  const shouldLogMiss = debugTick % DEBUG_INTERVAL === 0;

  let closestMiss = null;
  let closestMissDist = Infinity;

  // Decrement invincibility timers for all players
  for (const playerId in players) {
    if (players[playerId].invincibilityTimer > 0) {
      players[playerId].invincibilityTimer--;
    }
  }

  for (const shooterId in players) {
    const shooter = players[shooterId];
    const projectiles = shooter.projectiles || [];

    for (const projectile of projectiles) {
      for (const victimId in players) {
        if (victimId === shooterId) continue;
        const victim = players[victimId];
        if (victim.health <= 0) continue;

        // Don't damage invincible players
        if (victim.invincibilityTimer > 0 || victim.inMenu) {
          continue;
        }

        const hitKey = `${shooterId}:${projectile.id}:${victimId}`;
        if (processedHits.has(hitKey)) continue;

        // Swept XY check
        const prevX = projectile.x - (projectile.vx || 0);
        const prevY = projectile.y - (projectile.vy || 0);
        const xyDist = pointToSegmentDist(
          victim.x,
          victim.y,
          prevX,
          prevY,
          projectile.x,
          projectile.y
        );

        const zDistance = Math.abs((projectile.z || 0) - (victim.z || 0));

        if (
          xyDist <= PROJECTILE_HIT_RADIUS &&
          zDistance <= PROJECTILE_HIT_RADIUS_Z
        ) {
          victim.health = Math.max(
            0,
            Number((victim.health - HIT_DAMAGE).toFixed(3))
          );
          processedHits.add(hitKey);
        }
      }
    }
  }

  // Clean up hit keys for projectiles that no longer exist
  const activeKeys = new Set();
  for (const shooterId in players) {
    for (const p of players[shooterId].projectiles || []) {
      for (const victimId in players) {
        activeKeys.add(`${shooterId}:${p.id}:${victimId}`);
      }
    }
  }
  for (const key of processedHits) {
    if (!activeKeys.has(key)) processedHits.delete(key);
  }
}

wss.on("connection", (ws) => {
  const id = Math.random().toString(36).slice(2);
  ws.id = id;
  ws.username = "Anonymous";
  players[id] = {
    x: SPAWN.x,
    y: SPAWN.y,
    angle: SPAWN.angle,
    z: 0,
    username: ws.username,
    projectiles: [],
    health: MAX_HEALTH,
    sprite: "/images/sprite1.png", // Default sprite
    invincibilityTimer: 0,
    inMenu: false,
  };

  ws.send(JSON.stringify({ type: "init", id }));

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    if (data.type === "chat") {
      broadcastChat(ws.username, data.message);
      return;
    }

    if (data.type === "respawn") {
      if (players[id]) {
        players[id].health = MAX_HEALTH;
        players[id].invincibilityTimer = SPAWN_INVINCIBILITY_DURATION; // 3 seconds invincibility
        players[id].inMenu = false;
        players[id].projectiles = [];
        players[id].x = SPAWN.x;
        players[id].y = SPAWN.y;
        players[id].angle = SPAWN.angle;
        players[id].z = 0;
        broadcastPlayers();
      }
      return;
    }

    if (data.type === "menuOpen") {
      if (players[id]) {
        players[id].inMenu = true;
        broadcastDebug(`${ws.username} opened character select menu`);
      }
      return;
    }

    if (data.type === "menuClosed") {
      if (players[id]) {
        players[id].health = MAX_HEALTH;
        players[id].inMenu = false;
        broadcastDebug(`${ws.username} closed character select menu - health reset to ${MAX_HEALTH}`);
        broadcastPlayers();
      }
      return;
    }

    if (data.type === "setName") {
      ws.username = String(data.name || "Anonymous").trim() || "Anonymous";
      if (players[id]) players[id].username = ws.username;
      return;
    }

    if (data.type === "setSprite") {
      if (players[id]) players[id].sprite = data.sprite;
      broadcastDebug(`${ws.username} set sprite`);
      return;
    }

    if (players[id]) {
      const serverHealth = players[id].health;
      const invincibilityTimer = players[id].invincibilityTimer;
      const inMenu = players[id].inMenu;
      const projectiles = data.projectiles || players[id].projectiles || [];
      players[id] = { ...players[id], ...data, health: serverHealth, invincibilityTimer, inMenu, projectiles };
      checkProjectileHits();
      broadcastPlayers();
    }
  });

  ws.on("close", () => {
    delete players[id];
    broadcastPlayers();
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
