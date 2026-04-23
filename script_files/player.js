import {
  PLAYER_RADIUS,
  MOVE_SPEED,
  JUMP_VELOCITY,
  GRAVITY,
  MAX_JUMP,
  MAX_HEALTH,
  SPAWN_INVINCIBILITY_DURATION,
} from "./constant.js";
import {
  PROJECTILE_SPEED,
  PROJECTILE_LIFETIME,
  PROJECTILE_START_Z,
  PROJECTILE_HIT_RADIUS,
  TRACER_MAX_RANGE,
  selectedGun,
} from "./guns.js";
import { isWall, map, getGeometry } from "./map.js";
import { debugLog } from "./debug.js";
import { keybinds, isPressed, initKeyMouseRef } from "./keybindControls.js";

// Spawn locations
const SPAWNS = [
  { x: 14, y: 9,  angle: Math.PI / 2, sneaking: false },
  { x: 41, y: 15, angle: Math.PI,     sneaking: false },
  { x: 6,  y: 21, angle: Math.PI,     sneaking: false },
  { x: 30, y: 28, angle: Math.PI,     sneaking: false },
];

function getRandomSpawn() {
  return { ...SPAWNS[Math.floor(Math.random() * SPAWNS.length)] };
}

const defaultSkin = "https://www.clker.com/cliparts/a/4/1/d/1301963432622081819stick_figure%20(1).png";
const importedSprite = localStorage.getItem("skinURL");

// Stamina constants
const MAX_STAMINA           = 1;
const STAMINA_DRAIN         = 0.005;
const STAMINA_REGEN         = 0.003;
const STAMINA_COOLDOWN_FRAMES = 180;
const SPRINT_SPEED_MULT     = 1.6;

const state = {
  player: getRandomSpawn(),
  z: 0,
  zVel: 0,
  onGround: true,
  isChatting: false,
  isMenuOpen: false,
  inMenu: false,
  others: {},
  myId: null,
  projectiles: [],
  health: MAX_HEALTH,
  isDead: false,
  deathTimer: 0,
  hasShot: true,
  cooldown: 0,
  canRespawn: false,
  isRespawning: false,
  invincibilityTimer: 0,

  stamina: MAX_STAMINA,
  staminaCooldown: 0,
  isSprinting: false,
 
  sprite: (importedSprite) ? importedSprite : defaultSkin,
  username: "",
};

let keysRef = null;
let wsRef   = null;
let mouseRef = null;
let nextProjectileId = 1;

export function initPlayer(keys, ws, mouse) {
  keysRef  = keys;
  wsRef    = ws;
  mouseRef = mouse;
  initKeyMouseRef(keysRef, mouseRef);
}

export function promptUsername() {
  const name = (prompt("Enter your username:") || "Anonymous").trim() || "Anonymous";
  state.username = name;
  return name;
}

export function setIsChatting(value) {
  state.isChatting = value;
}

export function setMenuOpen(value) {
  const isOpen = Boolean(value);
  state.isMenuOpen = isOpen;
  state.inMenu     = isOpen;

  if (wsRef && wsRef.readyState === WebSocket.OPEN) {
    wsRef.send(JSON.stringify({ type: isOpen ? "menuOpen" : "menuClosed" }));
  }
}

export function setMyId(id) {
  state.myId = id;
  debugLog("networkSend", `My ID set: ${id}`);
}

export function setOthers(nextOthers) {
  const filtered = { ...nextOthers };
  if (state.myId && filtered[state.myId] !== undefined) {
    const serverHealth = filtered[state.myId].health;
    if (!state.inMenu) {
      if (!state.isDead && !state.isRespawning && serverHealth <= 0) {
        state.health     = 0;
        state.isDead     = true;
        state.deathTimer = 0;
        state.canRespawn = false;
        state.projectiles = [];
      }
      if (!state.isDead) {
        state.health = serverHealth;
      }
    }
    delete filtered[state.myId];
  }
  state.others = filtered;
}

export function setSprite(url) {
  state.sprite = url;
  if (wsRef && wsRef.readyState === WebSocket.OPEN) {
    wsRef.send(JSON.stringify({ type: "setSprite", sprite: url }));
  }
}

export function getState() {
  return state;
}

export function respawn() {
  if (!state.isDead || !state.canRespawn) return;

  state.isDead     = false;
  state.canRespawn = false;
  state.deathTimer = 0;
  state.isRespawning     = true;
  state.invincibilityTimer = SPAWN_INVINCIBILITY_DURATION;

  const spawn = getRandomSpawn();
  state.player.x       = spawn.x;
  state.player.y       = spawn.y;
  state.player.angle   = spawn.angle;
  state.player.sneaking = spawn.sneaking;

  state.z        = 0;
  state.zVel     = 0;
  state.onGround = true;

  state.health   = MAX_HEALTH;
  state.cooldown = 0;
  state.projectiles = [];

  state.stamina         = MAX_STAMINA;
  state.staminaCooldown = 0;
  state.isSprinting     = false;

  if (wsRef && wsRef.readyState === WebSocket.OPEN) {
    wsRef.send(JSON.stringify({ type: "respawn" }));
  }

  setTimeout(() => { state.isRespawning = false; }, 2000);
}

// ── Raycast shot ──────────────────────────────────────────────────────────────
function raycastShot(originX, originY, angle) {
  const gun      = selectedGun.current;
  const STEP     = 0.05;
  const MAX_STEPS = Math.ceil(TRACER_MAX_RANGE / STEP);
  const dx = Math.cos(angle) * STEP * gun.projectileSpeed;
  const dy = Math.sin(angle) * STEP * gun.projectileSpeed;

  let x = originX;
  let y = originY;

  for (let i = 0; i < MAX_STEPS; i++) {
    x += dx;
    y += dy;

    const tileX = Math.floor(x);
    const tileY = Math.floor(y);
    const char  = map[tileY]?.[tileX];
    if (char) {
      const geo = getGeometry(char);
      if (geo && geo.solid) {
        return { x: x - dx * 0.5, y: y - dy * 0.5, hitWall: true };
      }
    }
  }

  return { x, y, hitWall: false };
}

function canMove(x, y) {
  return (
    !isWall(x + PLAYER_RADIUS, y + PLAYER_RADIUS) &&
    !isWall(x - PLAYER_RADIUS, y + PLAYER_RADIUS) &&
    !isWall(x + PLAYER_RADIUS, y - PLAYER_RADIUS) &&
    !isWall(x - PLAYER_RADIUS, y - PLAYER_RADIUS)
  );
}

export function update() {
  if (!keysRef || !wsRef || !mouseRef) return;
  if (state.inMenu) return;

  if (state.invincibilityTimer > 0 && !state.isMenuOpen) {
    state.invincibilityTimer--;
    debugLog("spawnInvincible", `Invincibility frames left: ${state.invincibilityTimer}`);
  }

  if (state.isDead) {
    state.deathTimer++;
    if (state.deathTimer >= 300) state.canRespawn = true;
    return;
  }

  const { player }      = state;
  const blockControls   = state.isChatting || state.isMenuOpen;

  // Turning
  if (!blockControls && isPressed(keybinds.turnLeft))  player.angle -= 0.04;
  if (!blockControls && isPressed(keybinds.turnRight)) player.angle += 0.04;

  let moveX = 0;
  let moveY = 0;

  // Sneak + Sprint
  state.player.sneaking = !blockControls && isPressed(keybinds.sneak);

  const isTryingToSprint =
    !blockControls &&
    isPressed(keybinds.sprint) &&
    !state.player.sneaking;

  if (isTryingToSprint && state.staminaCooldown === 0 && state.stamina > 0) {
    state.isSprinting = true;
    state.stamina = Math.max(0, state.stamina - STAMINA_DRAIN);
    if (state.stamina === 0) {
      state.staminaCooldown = STAMINA_COOLDOWN_FRAMES;
      state.isSprinting     = false;
    }
  } else {
    state.isSprinting = false;
    if (state.staminaCooldown > 0) {
      state.staminaCooldown--;
    } else {
      state.stamina = Math.min(MAX_STAMINA, state.stamina + STAMINA_REGEN);
    }
  }

  const sneakSpeed     = state.player.sneaking ? 0.4 : 1;
  const sprintSpeed    = state.isSprinting ? SPRINT_SPEED_MULT : 1;
  const effectiveSpeed = sneakSpeed * sprintSpeed;

  if (!blockControls && isPressed(keybinds.moveForward)) {
    moveX += Math.cos(player.angle) * MOVE_SPEED * effectiveSpeed;
    moveY += Math.sin(player.angle) * MOVE_SPEED * effectiveSpeed;
  }
  if (!blockControls && isPressed(keybinds.moveBackward)) {
    moveX -= Math.cos(player.angle) * MOVE_SPEED * effectiveSpeed;
    moveY -= Math.sin(player.angle) * MOVE_SPEED * effectiveSpeed;
  }
  if (!blockControls && isPressed(keybinds.moveLeft)) {
    moveX += Math.cos(player.angle - Math.PI / 2) * MOVE_SPEED * effectiveSpeed;
    moveY += Math.sin(player.angle - Math.PI / 2) * MOVE_SPEED * effectiveSpeed;
  }
  if (!blockControls && isPressed(keybinds.moveRight)) {
    moveX += Math.cos(player.angle + Math.PI / 2) * MOVE_SPEED * effectiveSpeed;
    moveY += Math.sin(player.angle + Math.PI / 2) * MOVE_SPEED * effectiveSpeed;
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

  // Jump
  if (!blockControls && isPressed(keybinds.jump) && state.onGround) {
    state.zVel     = JUMP_VELOCITY;
    state.onGround = false;
  }

  state.zVel -= GRAVITY;
  state.z    += state.zVel;

  if (state.z <= 0) {
    state.z    = 0;
    state.zVel = 0;
    state.onGround = true;
  }

  // Mouse look
  const mouseMoveX = mouseRef.dx || 0;
  if (!blockControls && mouseMoveX !== 0) {
    player.angle += mouseMoveX * 0.006;
  }
  mouseRef.dx = 0;
  mouseRef.dy = 0;

  // ── Shooting ──────────────────────────────────────────────────────────────
  const primaryHeld   = !blockControls && isPressed(keybinds.shoot);
  const secondaryHeld = !blockControls && isPressed(keybinds.secondaryShoot);

  if (state.cooldown > 0) state.cooldown--;

  if ((primaryHeld || secondaryHeld) && state.cooldown === 0) {
    const gun      = selectedGun.current;
    const pid      = nextProjectileId++;
    const endpoint = raycastShot(player.x, player.y, player.angle);
    const totalDist = Math.hypot(endpoint.x - player.x, endpoint.y - player.y);
    const travelFrames = Math.max(1, Math.round(totalDist / PROJECTILE_SPEED));

    state.projectiles.push({
      id:          pid,
      x:           player.x,
      y:           player.y,
      z:           state.z + PROJECTILE_START_Z,
      originX:     player.x,
      originY:     player.y,
      originZ:     state.z + PROJECTILE_START_Z,
      angle:       player.angle,
      endX:        endpoint.x,
      endY:        endpoint.y,
      vx:          Math.cos(player.angle) * PROJECTILE_SPEED * gun.projectileSpeed,
      vy:          Math.sin(player.angle) * PROJECTILE_SPEED * gun.projectileSpeed,
      ttl:         travelFrames,
      totalFrames: travelFrames,
      hitWall:     endpoint.hitWall,
    });

    debugLog("projectileFire", `FIRED id=${pid} gun=${gun.name} range=${totalDist.toFixed(2)} frames=${travelFrames}`);

    state.cooldown = gun.cooldown;

    if (wsRef.readyState === WebSocket.OPEN) {
      wsRef.send(JSON.stringify({
        type:  "shoot",
        id:    pid,
        x:     player.x,
        y:     player.y,
        z:     state.z + PROJECTILE_START_Z,
        angle: player.angle,
        damage: gun.damage,
      }));
    }
  }

  // ── Advance visual tracers ────────────────────────────────────────────────
  state.projectiles = state.projectiles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.ttl--;

    const dFromOrigin = Math.hypot(p.x - p.originX, p.y - p.originY);
    const totalDist   = Math.hypot(p.endX - p.originX, p.endY - p.originY);
    if (dFromOrigin >= totalDist) return false;

    return p.ttl > 0;
  });

  // ── Network ───────────────────────────────────────────────────────────────
  if (wsRef.readyState === WebSocket.OPEN) {
    wsRef.send(JSON.stringify({
      x:           player.x,
      y:           player.y,
      angle:       player.angle,
      z:           state.z,
      projectiles: state.projectiles.map((p) => ({
        id:  p.id,
        x:   p.x,
        y:   p.y,
        z:   p.z,
        vx:  p.vx,
        vy:  p.vy,
        ttl: p.ttl,
      })),
      health:   state.health,
      sneaking: state.player.sneaking,
    }));
  }
}