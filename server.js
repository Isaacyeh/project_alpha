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
 
// ── Constants — must match client constant.js ─────────────────────────────────
const HIT_DAMAGE            = 0.1;
const PLAYER_RADIUS         = 0.2;
const PROJECTILE_RADIUS     = 0.025;
const PROJECTILE_HIT_RADIUS = PLAYER_RADIUS + PROJECTILE_RADIUS; // 0.225
const PROJECTILE_HIT_RADIUS_Z = PLAYER_RADIUS + PROJECTILE_RADIUS;
const MAX_HEALTH            = 1;
const MAX_PROJECTILES_PER_PLAYER = 20;
const TRACER_MAX_RANGE      = 18;   // must match client
const RAY_STEP              = 0.05; // must be small enough to not skip players
const SPAWN_INVINCIBILITY_MS = 5_000;
 
const SPAWN = { x: 3, y: 17, angle: 0 };
 
// ── Map import (Node-compatible version of map.js) ────────────────────────────
// We duplicate only what the server needs: the map array and isWall logic.
// Keep this in sync with script_files/map.js.
const maps = [
  [
    "------------------------------####-----------------------------------",
    "---------------##############-#--#-----------------------------------",
    "---------------#------------###-##-----------------------------------",
    "---------------#-----------------#-----------------------------------",
    "---------------#-#----------###--#-----------------------------------",
    "---------------#-#----------#-#--#-----------------------------------",
    "--------########-#######----#-#--#-----------------------------------",
    "--------#--------#-----##-###-#--####################----------------",
    "--------#--#####-#-#####---#-##--#------------------#----------------",
    "--------#--#---#-###---#---#-#----------------------#----------------",
    "--------#--#---#-----------#-#####------------------#-#####----------",
    "--------#--#---###-----#---###---#############---######---#----------",
    "-------##--#######-#####---------#-----------#------------#----------",
    "-------#-----------#---#---###---#-----------#-----####---##---------",
    "#########--#########---#####-#--##-----------#-----#--#----#---------",
    "#------------####-####---#####--#------------#-----#--#----#---------",
    "#------------#--#-#--#---#------##############-----#--#----#---------",
    "#---------------###--#####-------------------------#--#----#---------",
    "#------------#---#---------------------------------#--#----#---------",
    "##########---#---------------------------##############----#---------",
    "#--------#---######----------------------#----------#-----##---------",
    "#--------#---#---###-######--------------#----------#-----#----------",
    "#--------#---#---#----##--#--------------#----------#-----#########--",
    "#--------#---#---#-----#--#############-##----------##------------##-",
    "#--------#--##---#-----#------------#----#-----------#-------------##",
    "#--------#--##--###-####------------#----#-----------#--------------#",
    "#--------#---#--#-----#########-----##--##-----------#-------###-####",
    "#--------#---####--------#----#------#-###############-------#------#",
    "#--------#--------------------#-----##-----------------------#------#",
    "#--------#---#-----------#----#-----#-----------##############------#",
    "#--------#####--#-----#--#---##-----#-----------#-------------------#",
    "#------------#--#-----#--#---#------#-----------#-------------------#",
    "#------------#--#######--#---########----------------#--#-----------#",
    "#------------#-----------#----------#---####----#----#--#-----------#",
    "#------------##----------#--------------####----#----#--#-----------#",
    "#------------#-----##----#####-##################----#--#-----------#",
    "#------------#----#------#--------#------#-----------#--#-----------#",
    "#------------#-----------#--------#------#----------##--##----------#",
    "#--#############-#####-###--------#------#---------#--##--#---------#",
    "#-------------#---------#-------------###----------#--##--#---------#",
    "#-------------#---------#---------------------------##--##----------#",
    "#######-------#####-#####-------------------------------------------#",
    "#------------------------------------------####--------##-----------#",
    "#---------------------------##--------------------------------------#",
    "#-------###---#####---------##----------------#---------------------#",
    "#----------###--------------------------------#------#####----------#",
    "#--------------------------#-------------------------#--------------#",
    "#--------------------------##------------##----------#--------------#",
    "#---------#-------------------------------#----------#--------------#",
    "#---------#-------------------------------#----------########-------#",
    "#---------#---------##################------------------------------#",
    "#------####---------#----------------#------------------------------#",
    "#-------------------#----------------#------------------------------#",
    "#-----###--------#---------------------#--------------#-------------#",
    "#-------------------#----------------#----------------#-------------#",
    "#-----####----------#----------------#----------------#----------#--#",
    "#--------#----------##################----------------#---------#---#",
    "#---------------------------------------------------------------#---#",
    "#---------------------------------------------------------------#---#",
    "#####################################################################"
  ],
  [
    "################################################",
    "#------######F#######--------------------------#",
    "#-----/-------------#--------------------------#",
    "#----#--####--------#--------------------------#",
    "#----#--#-##---####-###########----------------#",
    "#----#--#/-------|#-#---------#----------------#",
    "#----#--F-P----P--#-#-P-----P-#----------------#",
    "#----#--#---------#-#---------#----------------#",
    "#----#--#-----------F---------#----------------#",
    "#----#--#---------###---------#---------/|-----#",
    "#----#--#---------#-#---------#--------/--|----#",
    "#----#--#-P----P--#-#---------#-------/----|---#",
    "#----#--#|-------/--#---------#------#------#--#",
    "#----/--#-###-###---#---------######/--P--P--|-#",
    "#---/---#--/---|----#----------#---#----------|#",
    "#--/----#-/-----|---#-P-----P----#------------/#",
    "#-/--/#-|/--/#|--|###---------######|--P--P--/-#",
    "##--/-#|---/---|------------------#--F------#--#",
    "##--####--/-----|-----------------F---|----/---#",
    "##--------#------#######/-/####---######--/----#",
    "##-P----P-#----------#------#-------------#----#",
    "#F--------#----------#--------#-----------#----#",
    "##--------#----------###---#####--#########----#",
    "##-P----P-##############---#---#--#------------#",
    "##------------------------/#-/|#--#------------#",
    "###########---------------F#/-----#------------#",
    "#----------|--############F/-P--P-#------------#",
    "#-----------|---------------------#------------#",
    "#------------############|--------#------------#",
    "#-------------------------|-P--P-/-------------#",
    "#--------------------------|----/--------------#",
    "#---------------------------|--/---------------#",
    "#----------------------------|/----------------#",
    "################################################",
  ],
];
 
const mapIndex = 1;
const map = maps[mapIndex];
 
const GEOMETRY = {
  "#":  { type: "full",     solid: true  },
  "F":  { type: "full",     solid: false },
  "/":  { type: "diagonal", solid: true,  slope:  1 },
  "|":  { type: "diagonal", solid: true,  slope: -1 },
  "P":  { type: "pillar",   solid: true,  radius: 0.15 },
};
 
function getGeometry(char) {
  return GEOMETRY[char] ?? null;
}
 
// Server-side solid wall check (mirrors client isWall but simplified for rays)
function isSolidAt(x, y) {
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  const char  = map[tileY]?.[tileX];
  if (!char) return false;
  const geo = getGeometry(char);
  if (!geo || !geo.solid) return false;
 
  // For pillars, check circle
  if (geo.type === "pillar") {
    const lx = x - tileX - 0.5;
    const ly = y - tileY - 0.5;
    const r  = geo.radius ?? 0.15;
    return lx * lx + ly * ly < r * r;
  }
  // For diagonals, use same band test as client
  if (geo.type === "diagonal") {
    const lx = x - tileX;
    const ly = y - tileY;
    const MARGIN = 0.085;
    if (geo.slope === 1)  return Math.abs(lx + ly - 1) < MARGIN;
    else                  return Math.abs(lx - ly)      < MARGIN;
  }
  // Full wall
  return true;
}
 
// ── Authoritative ray-based hit detection ─────────────────────────────────────
// Steps along the ray, tests each player's cylinder at each step.
// Returns the ID of the first player hit, or null.
function rayCastHit(shooterId, originX, originY, originZ, angle) {
  const dx   = Math.cos(angle) * RAY_STEP;
  const dy   = Math.sin(angle) * RAY_STEP;
  const maxSteps = Math.ceil(TRACER_MAX_RANGE / RAY_STEP);
 
  let x = originX;
  let y = originY;
 
  for (let i = 0; i < maxSteps; i++) {
    x += dx;
    y += dy;
 
    // Stop at solid wall
    if (isSolidAt(x, y)) {
      debugLog_server(`Ray hit wall at (${x.toFixed(2)}, ${y.toFixed(2)}) after ${i} steps`);
      return null;
    }
 
    // Check each potential victim
    for (const victimId in players) {
      if (victimId === shooterId) continue;
      const victim = players[victimId];
      if (victim.health <= 0) continue;
      if (Date.now() < (victim.invincibleUntil || 0)) continue;
 
      const xyDist = Math.hypot(x - victim.x, y - victim.y);
      // Z check: ray travels flat (same z as origin); compare to victim z
      const zDist  = Math.abs(originZ - (victim.z || 0));
 
      if (xyDist <= PROJECTILE_HIT_RADIUS && zDist <= PROJECTILE_HIT_RADIUS_Z) {
        return victimId;
      }
    }
  }
 
  return null;
}
 
function debugLog_server(msg) {
  // Server-side console debug (off by default — uncomment if needed)
  // console.log("[server ray]", msg);
}
 
// ── State ─────────────────────────────────────────────────────────────────────
const players     = {};
const playerStats = {}; // id -> { kills, deaths }
 
let broadcastDirty = false;
 
// Broadcast loop — 20 Hz
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
 
function buildLeaderboard() {
  return Object.entries(playerStats)
    .filter(([id]) => players[id])
    .map(([id, stats]) => ({
      id,
      username: players[id]?.username || "Anonymous",
      kills:    stats.kills,
      deaths:   stats.deaths,
    }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
}
 
function _doBroadcastPlayers() {
  const cleanedPlayers = {};
  for (const id in players) {
    const p = players[id];
    cleanedPlayers[id] = {
      x:           p.x,
      y:           p.y,
      angle:       p.angle,
      z:           p.z,
      username:    p.username,
      projectiles: p.projectiles || [],
      health:      p.health,
      sprite:      p.sprite,
      sneaking:    p.sneaking,
      isDead:      p.health <= 0,
      isInvincible: Date.now() < (p.invincibleUntil || 0),
      kills:       playerStats[id]?.kills  || 0,
      deaths:      playerStats[id]?.deaths || 0,
    };
  }
 
  const leaderboard = buildLeaderboard();
  const msg = JSON.stringify({ type: "players", players: cleanedPlayers, leaderboard });
 
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(msg); } catch {}
    }
  });
}
 
function markDirty() { broadcastDirty = true; }
 
function broadcastPlayersNow() {
  broadcastDirty = false;
  _doBroadcastPlayers();
}
 
function broadcastAll(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(msg); } catch {}
    }
  });
}
 
function broadcastChat(name, message) { broadcastAll({ type: "chat", name, message }); }
function broadcastChatImage(name, imageData) { broadcastAll({ type: "chatImage", name, imageData }); }
 
// Keepalive
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
 
// ── Connection ────────────────────────────────────────────────────────────────
wss.on("connection", (ws) => {
  const id = Math.random().toString(36).slice(2);
  ws.id    = id;
  ws.isAlive = true;
 
  players[id] = {
    x:              SPAWN.x,
    y:              SPAWN.y,
    angle:          SPAWN.angle,
    z:              0,
    username:       "Anonymous",
    projectiles:    [],
    health:         MAX_HEALTH,
    sprite:         "/images/sprite1.png",
    invincibleUntil: Date.now() + SPAWN_INVINCIBILITY_MS,
    inMenu:         false,
    sneaking:       false,
  };
 
  if (!playerStats[id]) {
    playerStats[id] = { kills: 0, deaths: 0 };
  }
 
  ws.send(JSON.stringify({ type: "init", id }));
 
  ws.on("pong", () => { ws.isAlive = true; });
 
  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
 
    // ── Chat ────────────────────────────────────────────────────────────────
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
 
    // ── Meta ────────────────────────────────────────────────────────────────
    if (data.type === "setName") {
      players[id].username = String(data.name || "Anonymous").trim().slice(0, 32) || "Anonymous";
      return;
    }
 
    if (data.type === "setSprite") {
      players[id].sprite = String(data.sprite || "").slice(0, 2048);
      markDirty();
      return;
    }
 
    if (data.type === "menuOpen") {
      players[id].inMenu = true;
      players[id].menuOpenedAt = Date.now();
      return;
    }
 
    if (data.type === "menuClosed") {
      if (players[id].menuOpenedAt) {
        const elapsed = Date.now() - players[id].menuOpenedAt;
        if (players[id].invincibleUntil > 0) players[id].invincibleUntil += elapsed;
        players[id].menuOpenedAt = 0;
      }
      players[id].inMenu = false;
      broadcastPlayersNow();
      return;
    }
 
    if (data.type === "initialSpawn") {
      players[id].invincibleUntil = Date.now() + SPAWN_INVINCIBILITY_MS;
      broadcastPlayersNow();
      return;
    }
 
    if (data.type === "respawn") {
      players[id] = {
        ...players[id],
        health:          MAX_HEALTH,
        invincibleUntil: Date.now() + SPAWN_INVINCIBILITY_MS,
        inMenu:          false,
        projectiles:     [],
        x:               SPAWN.x,
        y:               SPAWN.y,
        angle:           SPAWN.angle,
        z:               0,
      };
      broadcastPlayersNow();
      return;
    }
 
    // ── Raycast shot (NEW) ──────────────────────────────────────────────────
    // Client sends this once per shot with the ray origin + angle.
    // Server checks the ray against all players and walls authoritatively.
    if (data.type === "shoot") {
      if (players[id].inMenu) return;
      if (players[id].health <= 0) return;
 
      const originX = safeNum(data.x,     players[id].x,   0, 200);
      const originY = safeNum(data.y,     players[id].y,   0, 200);
      const originZ = safeNum(data.z,     players[id].z,   0, 10);
      const angle   = safeNum(data.angle, players[id].angle);
 
      // Verify the origin is near the server's known position (anti-cheat)
      const posDrift = Math.hypot(originX - players[id].x, originY - players[id].y);
      if (posDrift > 2.0) {
        // Origin is too far from server-known position — reject
        return;
      }
 
      const victimId = rayCastHit(id, originX, originY, originZ, angle);
 
      if (victimId) {
        const victim    = players[victimId];
        const prevHealth = victim.health;
        victim.health   = Math.max(0, Number((victim.health - HIT_DAMAGE).toFixed(3)));
 
        if (prevHealth > 0 && victim.health <= 0) {
          if (!playerStats[id])       playerStats[id]       = { kills: 0, deaths: 0 };
          if (!playerStats[victimId]) playerStats[victimId] = { kills: 0, deaths: 0 };
          playerStats[id].kills++;
          playerStats[victimId].deaths++;
        }
 
        markDirty();
      }
      return;
    }
 
    // ── Default: movement update ────────────────────────────────────────────
    const prev = players[id];
 
    players[id] = {
      ...prev,
      x:       safeNum(data.x,     prev.x,     0, 200),
      y:       safeNum(data.y,     prev.y,     0, 200),
      angle:   safeNum(data.angle, prev.angle),
      z:       safeNum(data.z,     prev.z,     0, 10),
      sneaking: Boolean(data.sneaking),
      // Projectiles are visual-only now; server stores them just for relay
      projectiles: Array.isArray(data.projectiles)
        ? data.projectiles
            .slice(0, MAX_PROJECTILES_PER_PLAYER)
            .filter(
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