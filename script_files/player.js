import {
  PLAYER_RADIUS,
  MOVE_SPEED,
  JUMP_VELOCITY,
  GRAVITY,
  MAX_JUMP,
  PROJECTILE_SPEED,
  PROJECTILE_LIFETIME,
  PROJECTILE_START_Z,
  MAX_HEALTH,
  HIT_DAMAGE,
  PROJECTILE_HIT_RADIUS,
} from "./constant.js";
import { isWall } from "./map.js";

const state = {
  player: { x: 3, y: 17, angle: 0 },
  z: 0,
  zVel: 0,
  onGround: true,
  isChatting: false,
  others: {},
  myId: null,
  projectiles: [],
  health: MAX_HEALTH,
  username:
    (prompt("Enter your username:") || "Anonymous").trim() || "Anonymous",
};

let keysRef = null;
let wsRef = null;
let wasQPressed = false;
let nextProjectileId = 1;
const processedHits = new Set();

function debugLog(msg) {
  const chat = document.getElementById("chat");
  if (!chat) return;
  const div = document.createElement("div");
  div.style.color = "#ff0";
  div.textContent = `[CLIENT] ${msg}`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

let debugTick = 0;
let closestEver = Infinity;
// Track whether we already logged a send with projectiles this session
let hasEverSentProjectile = false;

export function initPlayer(keys, ws) {
  keysRef = keys;
  wsRef = ws;
}

export function setIsChatting(value) {
  state.isChatting = value;
}

export function setMyId(id) {
  state.myId = id;
  debugLog(`My ID set: ${id}`);
}

export function setOthers(nextOthers) {
  state.others = { ...nextOthers };
}

export function getState() {
  return state;
}

function canMove(x, y) {
  return (
    !isWall(x + PLAYER_RADIUS, y + PLAYER_RADIUS) &&
    !isWall(x - PLAYER_RADIUS, y + PLAYER_RADIUS) &&
    !isWall(x + PLAYER_RADIUS, y - PLAYER_RADIUS) &&
    !isWall(x - PLAYER_RADIUS, y - PLAYER_RADIUS)
  );
}

function updateHealthFromHits() {
  debugTick++;
  const shouldLog = debugTick % 60 === 0;

  const activeRemoteProjectileIds = new Set();
  const allOtherIds = Object.keys(state.others);
  const otherIds = allOtherIds.filter((id) => id !== state.myId);

  if (shouldLog) {
    debugLog(
      `--- TICK ${debugTick} | myId=${state.myId} | health=${state.health} ---`
    );
    debugLog(
      `others object has ${allOtherIds.length} keys total, ${otherIds.length} after filtering self`
    );
    for (const id of allOtherIds) {
      const p = state.others[id];
      const projs = p?.projectiles || [];
      debugLog(
        `  other[${id}] pos=(${p?.x?.toFixed(2)},${p?.y?.toFixed(
          2
        )}) projectiles=${projs.length}${
          id === state.myId ? " <-- THIS IS ME" : ""
        }`
      );
    }
  }

  for (const id of otherIds) {
    const remoteProjectiles = state.others[id]?.projectiles || [];

    for (const projectile of remoteProjectiles) {
      const pid = projectile.id ?? null;
      const projectileKey = pid !== null ? `${id}:${pid}` : null;

      if (projectileKey) activeRemoteProjectileIds.add(projectileKey);
      if (projectileKey && processedHits.has(projectileKey)) continue;

      const dx = projectile.x - state.player.x;
      const dy = projectile.y - state.player.y;
      const distance = Math.hypot(dx, dy);
      const zDistance = Math.abs((projectile.z || 0) - state.z);

      if (distance < 5) {
        debugLog(
          `CLOSE: proj id=${pid} dist=${distance.toFixed(
            3
          )} zdist=${zDistance.toFixed(3)} proj=(${projectile.x.toFixed(
            2
          )},${projectile.y.toFixed(2)}) me=(${state.player.x.toFixed(
            2
          )},${state.player.y.toFixed(2)}) hitR=${PROJECTILE_HIT_RADIUS}`
        );
      }

      if (distance < closestEver) {
        closestEver = distance;
        debugLog(`NEW CLOSEST: ${distance.toFixed(4)} from proj id=${pid}`);
      }

      if (distance <= PROJECTILE_HIT_RADIUS && zDistance <= 0.5) {
        state.health = Math.max(
          0,
          Number((state.health - HIT_DAMAGE).toFixed(3))
        );
        if (projectileKey) processedHits.add(projectileKey);
        debugLog(
          `*** HIT! from ${id} proj=${pid} dist=${distance.toFixed(3)} health=${
            state.health
          } ***`
        );
      }
    }
  }

  for (const key of processedHits) {
    if (!activeRemoteProjectileIds.has(key)) {
      processedHits.delete(key);
    }
  }
}

export function update() {
  if (!keysRef || !wsRef) return;
  const { player } = state;

  if (!state.isChatting && keysRef.ArrowLeft) player.angle -= 0.04;
  if (!state.isChatting && keysRef.ArrowRight) player.angle += 0.04;

  let moveX = 0;
  let moveY = 0;

  if (!state.isChatting && keysRef.w) {
    moveX += Math.cos(player.angle) * MOVE_SPEED;
    moveY += Math.sin(player.angle) * MOVE_SPEED;
  }
  if (!state.isChatting && keysRef.s) {
    moveX -= Math.cos(player.angle) * MOVE_SPEED;
    moveY -= Math.sin(player.angle) * MOVE_SPEED;
  }
  if (!state.isChatting && keysRef.a) {
    moveX += Math.cos(player.angle - Math.PI / 2) * MOVE_SPEED;
    moveY += Math.sin(player.angle - Math.PI / 2) * MOVE_SPEED;
  }
  if (!state.isChatting && keysRef.d) {
    moveX += Math.cos(player.angle + Math.PI / 2) * MOVE_SPEED;
    moveY += Math.sin(player.angle + Math.PI / 2) * MOVE_SPEED;
  }

  const nx = player.x + moveX;
  const ny = player.y + moveY;

  if (canMove(nx, ny)) {
    player.x = nx;
    player.y = ny;
  } else {
    if (canMove(nx, player.y)) player.x = nx;
    if (canMove(player.x, ny)) player.y = ny;
  }

  if (!state.isChatting && keysRef[" "] && state.onGround) {
    state.zVel = JUMP_VELOCITY;
    state.onGround = false;
  }

  state.zVel -= GRAVITY;
  state.z += state.zVel;
  state.z = Math.min(state.z, MAX_JUMP);

  if (state.z <= 0) {
    state.z = 0;
    state.zVel = 0;
    state.onGround = true;
  }

  const qPressed = !state.isChatting && Boolean(keysRef.q || keysRef.Q);
  if (qPressed && !wasQPressed) {
    const pid = nextProjectileId++;
    state.projectiles.push({
      id: pid,
      x: player.x,
      y: player.y,
      z: state.z + PROJECTILE_START_Z,
      vx: Math.cos(player.angle) * PROJECTILE_SPEED,
      vy: Math.sin(player.angle) * PROJECTILE_SPEED,
      ttl: PROJECTILE_LIFETIME,
    });
    debugLog(
      `FIRED id=${pid} from (${player.x.toFixed(2)},${player.y.toFixed(
        2
      )}) vx=${Math.cos(player.angle).toFixed(2)} vy=${Math.sin(
        player.angle
      ).toFixed(2)}`
    );
  }
  wasQPressed = qPressed;

  state.projectiles = state.projectiles.filter((projectile) => {
    const nextX = projectile.x + projectile.vx;
    const nextY = projectile.y + projectile.vy;
    if (isWall(nextX, nextY)) return false;
    projectile.x = nextX;
    projectile.y = nextY;
    projectile.ttl -= 1;
    return projectile.ttl > 0;
  });

  updateHealthFromHits();

  // KEY DEBUG: log what we actually transmit whenever projectiles are in flight
  if (wsRef.readyState === WebSocket.OPEN) {
    const payload = {
      x: player.x,
      y: player.y,
      angle: player.angle,
      z: state.z,
      projectiles: state.projectiles,
      health: state.health,
    };

    // Log the first time we send projectiles, and every time count changes
    if (state.projectiles.length > 0 && !hasEverSentProjectile) {
      hasEverSentProjectile = true;
      debugLog(
        `FIRST SEND WITH PROJECTILES: count=${
          state.projectiles.length
        } ids=${state.projectiles.map((p) => p.id).join(",")}`
      );
    }

    wsRef.send(JSON.stringify(payload));
  }
}
