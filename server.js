const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

const HIT_DAMAGE = 0.1;
const PROJECTILE_HIT_RADIUS = 0.6;
const MAX_HEALTH = 1;

const players = {};
const processedHits = new Set();

// Throttle debug spam - only log closest miss every N ticks
let debugTick = 0;
const DEBUG_INTERVAL = 60; // every 60 updates, log closest miss

function broadcastPlayers() {
  const data = JSON.stringify({ type: "players", players });
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

function broadcastDebug(message) {
  const data = JSON.stringify({ type: "chat", name: "[DEBUG]", message });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}

function checkProjectileHits() {
  debugTick++;
  const shouldLogMiss = debugTick % DEBUG_INTERVAL === 0;

  let closestMiss = null;
  let closestMissDist = Infinity;

  for (const shooterId in players) {
    const shooter = players[shooterId];
    const projectiles = shooter.projectiles || [];

    // Debug: log how many projectiles this shooter has (throttled)
    if (shouldLogMiss && projectiles.length > 0) {
      broadcastDebug(
        `${shooter.username} has ${
          projectiles.length
        } projectile(s) in flight. IDs: ${projectiles
          .map((p) => p.id ?? "NO_ID")
          .join(", ")}`
      );
    }

    for (const projectile of projectiles) {
      // Critical check: does projectile have an id?
      if (projectile.id == null) {
        if (shouldLogMiss) {
          broadcastDebug(
            `WARNING: projectile from ${shooter.username} has no ID — hit detection skipped!`
          );
        }
        continue;
      }

      for (const victimId in players) {
        if (victimId === shooterId) continue;
        const victim = players[victimId];

        const hitKey = `${shooterId}:${projectile.id}:${victimId}`;
        if (processedHits.has(hitKey)) continue;

        const dx = projectile.x - victim.x;
        const dy = projectile.y - victim.y;
        const distance = Math.hypot(dx, dy);
        const zDistance = Math.abs((projectile.z || 0) - (victim.z || 0));

        // Track closest miss for debug
        if (distance < closestMissDist) {
          closestMissDist = distance;
          closestMiss = {
            shooter: shooter.username,
            victim: victim.username,
            distance: distance.toFixed(3),
            zDistance: zDistance.toFixed(3),
            px: projectile.x.toFixed(2),
            py: projectile.y.toFixed(2),
            vx: victim.x.toFixed(2),
            vy: victim.y.toFixed(2),
          };
        }

        if (distance <= PROJECTILE_HIT_RADIUS && zDistance <= 0.5) {
          victim.health = Math.max(
            0,
            Number((victim.health - HIT_DAMAGE).toFixed(3))
          );
          processedHits.add(hitKey);
          const msg = `HIT! ${shooter.username} → ${
            victim.username
          } | dist=${distance.toFixed(3)} | health now ${victim.health}`;
          console.log(msg);
          broadcastDebug(msg);
        }
      }
    }
  }

  // Log closest miss periodically so you can see if projectiles are even near the player
  if (shouldLogMiss && closestMiss) {
    broadcastDebug(
      `Closest miss: ${closestMiss.shooter}→${closestMiss.victim} dist=${closestMiss.distance} zdist=${closestMiss.zDistance} | proj=(${closestMiss.px},${closestMiss.py}) victim=(${closestMiss.vx},${closestMiss.vy})`
    );
  }

  // Clean up expired hit keys
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
    x: 3,
    y: 17,
    angle: 0,
    z: 0,
    username: ws.username,
    projectiles: [],
    health: MAX_HEALTH,
  };

  ws.send(JSON.stringify({ type: "init", id }));
  broadcastDebug(`${ws.username} connected (id=${id})`);

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
    if (data.type === "setName") {
      ws.username = String(data.name || "Anonymous").trim() || "Anonymous";
      if (players[id]) players[id].username = ws.username;
      broadcastDebug(`Player set name: ${ws.username}`);
      return;
    }
    if (players[id]) {
      const serverHealth = players[id].health;
      players[id] = { ...players[id], ...data, health: serverHealth };
      checkProjectileHits();
      broadcastPlayers();
    }
  });

  ws.on("close", () => {
    broadcastDebug(`${ws.username} disconnected`);
    delete players[id];
    broadcastPlayers();
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
