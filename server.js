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

// ── Gun definitions ───────────────────────────────────────────────────────────
const GUNS = {
  rifle:      { damage: 10, cooldown: 10, cooldownMs: 167, projectileSpeed: 2,  range: 18, projectileRadius: 0.0125, color: "#4db8ff" },
  shotgun:    { damage: 20, cooldown: 25, cooldownMs: 333, projectileSpeed: 3,  range: 12, projectileRadius: 0.1,   color: "#7f4dff" },
  sniper:     { damage: 35, cooldown: 30, cooldownMs: 500, projectileSpeed: 4,  range: 25, projectileRadius: 0.005,  color: "#4dff62" },
  machinegun: { damage: 5,  cooldown: 4,  cooldownMs: 67,  projectileSpeed: 3,  range: 15, projectileRadius: 0.01,   color: "#ff504d" },
};

// ── Constants ─────────────────────────────────────────────────────────────────
const PLAYER_RADIUS             = 0.2;
const PROJECTILE_RADIUS         = 0.025;
const PROJECTILE_HIT_RADIUS     = PLAYER_RADIUS + PROJECTILE_RADIUS; // 0.225
const PROJECTILE_HIT_RADIUS_Z   = PLAYER_RADIUS + PROJECTILE_RADIUS;
const MAX_HEALTH                = 100;
const MAX_PROJECTILES_PER_PLAYER = 20;
const TRACER_MAX_RANGE          = 18;
const RAY_STEP                  = 0.05;
const SPAWN_INVINCIBILITY_MS    = 5_000;

const SPAWN = { x: 3, y: 17, angle: 0 };

// ── Map ───────────────────────────────────────────────────────────────────────
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
    "#####################################################################",
  ],
  [
    "################################################",
    "#------##############--------------------------#",
    "#-----/-------------F--------------------------#",
    "#----#--####--------#--------------------------#",
    "#----#--####---####-###########----------------#",
    "#----#--#/-------|#-F---------F----------------#",
    "#----#--#-P----P--#-#-P-----P-#----------------#",
    "#----#--#---------#-#---------#----------------#",
    "#----#--#-----------#---------#----------------#",
    "#----#--#---------###---------#---------/|-----#",
    "#----#--#---------#-#---------#--------/--|----#",
    "#----#--F-P----P--#-#---------#-------/----|---#",
    "#----#--#|-------/--#---------#------#------F--#",
    "#----/--#-###-###---#---------######/--P--P--|-#",
    "#---/---#--/---|----#----------#---#----------|#",
    "#--/----#-/-----|---#-P-----P----#------------/#",
    "#-/--/#-|/--/#|--|###---------######|--P--P--/-#",
    "##--/##|---/###|------------------#--F------#--#",
    "##--#F##--/#####|-----------------#---|----/---#",
    "##--------##############/-/####|-/#F####--/----#",
    "##-P----P-FFFFFFFFFFFF------#-------------#----#",
    "##--------############------#-------------#----#",
    "##--------##############---####|--/########----#",
    "##-P----P-##############---#####--#------------#",
    "##------------------------/##/|#--#------------#",
    "###########---------------##/-----#------------#",
    "#----------|--###########F#/-P--P-#------------#",
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
  "#": { type: "full",     solid: true  },
  "F": { type: "full",     solid: false },
  "/": { type: "diagonal", solid: true,  slope:  1 },
  "|": { type: "diagonal", solid: true,  slope: -1 },
  "P": { type: "pillar",   solid: true,  radius: 0.15 },
};

function getGeometry(char) {
  return GEOMETRY[char] ?? null;
}

function isSolidAt(x, y) {
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  const char  = map[tileY]?.[tileX];
  if (!char) return false;
  const geo = getGeometry(char);
  if (!geo || !geo.solid) return false;

  if (geo.type === "pillar") {
    const lx = x - tileX - 0.5;
    const ly = y - tileY - 0.5;
    const r  = geo.radius ?? 0.15;
    return lx * lx + ly * ly < r * r;
  }
  if (geo.type === "diagonal") {
    const lx = x - tileX;
    const ly = y - tileY;
    const MARGIN = 0.085;
    if (geo.slope === 1) return Math.abs(lx + ly - 1) < MARGIN;
    else                 return Math.abs(lx - ly)      < MARGIN;
  }
  return true;
}

// ── Ray-based hit detection ───────────────────────────────────────────────────
function rayCastHit(shooterId, originX, originY, originZ, angle) {
  const dx = Math.cos(angle) * RAY_STEP;
  const dy = Math.sin(angle) * RAY_STEP;
  const maxSteps = Math.ceil(TRACER_MAX_RANGE / RAY_STEP);

  let x = originX;
  let y = originY;

  for (let i = 0; i < maxSteps; i++) {
    x += dx;
    y += dy;

    if (isSolidAt(x, y)) return null;

    for (const victimId in players) {
      if (victimId === shooterId) continue;
      const victim = players[victimId];
      if (victim.health <= 0) continue;
      if (Date.now() < (victim.invincibleUntil || 0)) continue;

      const xyDist = Math.hypot(x - victim.x, y - victim.y);
      const zDist  = Math.abs(originZ - (victim.z || 0));

      if (xyDist <= PROJECTILE_HIT_RADIUS && zDist <= PROJECTILE_HIT_RADIUS_Z) {
        return victimId;
      }
    }
  }

  return null;
}

// ── State ─────────────────────────────────────────────────────────────────────
const players     = {};
const playerStats = {};

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
      isInvincible: Date.now() < (p.invincibleUntil || 0),
      kills:        playerStats[id]?.kills  || 0,
      deaths:       playerStats[id]?.deaths || 0,
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

function broadcastChat(name, message)       { broadcastAll({ type: "chat",      name, message }); }
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
  const id   = Math.random().toString(36).slice(2);
  ws.id      = id;
  ws.isAlive = true;

  players[id] = {
    x:               SPAWN.x,
    y:               SPAWN.y,
    angle:           SPAWN.angle,
    z:               0,
    username:        "Anonymous",
    projectiles:     [],
    health:          MAX_HEALTH,
    sprite:          "/images/sprite1.png",
    invincibleUntil: Date.now() + SPAWN_INVINCIBILITY_MS,
    inMenu:          false,
    sneaking:        false,
    gun:             "rifle",
    lastShotAt:      0,
  };

  if (!playerStats[id]) {
    playerStats[id] = { kills: 0, deaths: 0 };
  }

  ws.send(JSON.stringify({ type: "init", id }));

  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    // Guard: player must exist for all message types
    if (!players[id]) return;

    // ── Chat ──────────────────────────────────────────────────────────────
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

    // ── Meta ──────────────────────────────────────────────────────────────
    if (data.type === "setName") {
      players[id].username = String(data.name || "Anonymous").trim().slice(0, 32) || "Anonymous";
      return;
    }

    if (data.type === "setSprite") {
      players[id].sprite = String(data.sprite || "").slice(0, 2048);
      markDirty();
      return;
    }

    if (data.type === "setGun") {
      const gunId = String(data.gun || "rifle");
      if (GUNS[gunId]) {
        players[id].gun = gunId;
        console.log(`[setGun] player=${id} gun=${gunId}`);
      }
      return;
    }

    if (data.type === "menuOpen") {
      players[id].inMenu      = true;
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
        ...players[id],          // preserves gun, username, sprite
        health:          MAX_HEALTH,
        invincibleUntil: Date.now() + SPAWN_INVINCIBILITY_MS,
        inMenu:          false,
        projectiles:     [],
        x:               SPAWN.x,
        y:               SPAWN.y,
        angle:           SPAWN.angle,
        z:               0,
        lastShotAt:      0,
      };
      broadcastPlayersNow();
      return;
    }

    // ── Shoot ─────────────────────────────────────────────────────────────
    if (data.type === "shoot") {
      if (players[id].inMenu)    return;
      if (players[id].health <= 0) return;

      const originX = safeNum(data.x,     players[id].x,     0, 200);
      const originY = safeNum(data.y,     players[id].y,     0, 200);
      const originZ = safeNum(data.z,     players[id].z,     0, 10);
      const angle   = safeNum(data.angle, players[id].angle);

      // Anti-cheat: reject shots from too far from server-known position
      const posDrift = Math.hypot(originX - players[id].x, originY - players[id].y);
      if (posDrift > 2.0) return;

      // Anti-cheat: server-side cooldown
      const gun = GUNS[players[id].gun] || GUNS.rifle;
      const now = Date.now();
      if (now - (players[id].lastShotAt || 0) < gun.cooldownMs) return;
      players[id].lastShotAt = now;

      console.log(`[shoot] player=${id} gun=${players[id].gun} damage=${gun.damage}`);

      const victimId = rayCastHit(id, originX, originY, originZ, angle);

      if (victimId) {
        const victim     = players[victimId];
        const prevHealth = victim.health;
        victim.health    = Math.max(0, Math.round(victim.health - gun.damage));

        console.log(`[hit] victim=${victimId} ${prevHealth} -> ${victim.health}`);

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

    // ── Movement update (default) ─────────────────────────────────────────
    const prev = players[id];

    players[id] = {
      ...prev,
      x:        safeNum(data.x,     prev.x,     0, 200),
      y:        safeNum(data.y,     prev.y,     0, 200),
      angle:    safeNum(data.angle, prev.angle),
      z:        safeNum(data.z,     prev.z,     0, 10),
      sneaking: Boolean(data.sneaking),
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

