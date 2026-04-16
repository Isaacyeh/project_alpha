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
  SPAWN_INVINCIBILITY_DURATION,
} from "./constant.js";
import { isWall } from "./map.js";
import { debugLog } from "./debug.js";
import { keybinds, isPressed, initKeyMouseRef } from "./keybindControls.js";
 
const SPAWN = { x: 31, y: 7, angle: 0, sneaking: false };
// Stamina constants
const MAX_STAMINA = 1;
const STAMINA_DRAIN = 0.005;
const STAMINA_REGEN = 0.003;
const STAMINA_COOLDOWN_FRAMES = 180;
const SPRINT_SPEED_MULT = 1.6;

const state = {
  player: { ...SPAWN },
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

  sprite: "https://www.clker.com/cliparts/a/4/1/d/1301963432622081819stick_figure%20(1).png",
  username: "",
};

let keysRef = null;
let wsRef = null;
let mouseRef = null;
let nextProjectileId = 1;
let COOLDOWN = 10;

export function initPlayer(keys, ws, mouse) {
  keysRef = keys;
  wsRef = ws;
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
  state.inMenu = isOpen;

  if (isOpen) {
    if (wsRef && wsRef.readyState === WebSocket.OPEN) {
      wsRef.send(JSON.stringify({ type: "menuOpen" }));
    }
  } else {
    if (wsRef && wsRef.readyState === WebSocket.OPEN) {
      wsRef.send(JSON.stringify({ type: "menuClosed" }));
    }
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
        state.health = 0;
        state.isDead = true;
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
  // Immediately sync to server if connected
  if (wsRef && wsRef.readyState === WebSocket.OPEN) {
    wsRef.send(JSON.stringify({ type: "setSprite", sprite: url }));
  }
}

export function getState() {
  return state;
}

export function respawn() {
  if (!state.isDead || !state.canRespawn) return;

  state.isDead = false;
  state.canRespawn = false;
  state.deathTimer = 0;
  state.isRespawning = true;
  state.invincibilityTimer = SPAWN_INVINCIBILITY_DURATION;

  state.player.x = SPAWN.x;
  state.player.y = SPAWN.y;
  state.player.angle = SPAWN.angle;
  state.player.sneaking = SPAWN.sneaking;

  state.z = 0;
  state.zVel = 0;
  state.onGround = true;

  state.health = MAX_HEALTH;
  state.cooldown = 0;
  state.projectiles = [];

  state.stamina = MAX_STAMINA;
  state.staminaCooldown = 0;
  state.isSprinting = false;
  if (wsRef && wsRef.readyState === WebSocket.OPEN) {
    wsRef.send(JSON.stringify({ type: "respawn" }));
  }

  setTimeout(() => {
    state.isRespawning = false;
  }, 2000);
}
const WALL_MARGIN = 0.01;
/*
function canMove(x, y) {
  const r = PLAYER_RADIUS + WALL_MARGIN;
  return (
    !isWall(x + r, y + r) &&
    !isWall(x - r, y + r) &&
    !isWall(x + r, y - r) &&
    !isWall(x - r, y - r)
  );
}
*/
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

  const { player } = state;
  const blockControls = state.isChatting || state.isMenuOpen;

  // Turning
  if (!blockControls && isPressed(keybinds.turnLeft)) player.angle -= 0.04;
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
      state.isSprinting = false;
    }
  } else {
    state.isSprinting = false;

    if (state.staminaCooldown > 0) {
      state.staminaCooldown--;
    } else {
      state.stamina = Math.min(MAX_STAMINA, state.stamina + STAMINA_REGEN);
    }
  }

  const sneakSpeed = state.player.sneaking ? 0.4 : 1;
  const sprintSpeed = state.isSprinting ? SPRINT_SPEED_MULT : 1;
  const effectiveSpeed = sneakSpeed * sprintSpeed;

  // Movement
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
    state.zVel = JUMP_VELOCITY;
    state.onGround = false;
  }

  state.zVel -= GRAVITY;
  state.z += state.zVel;

  if (state.z <= 0) {
    state.z = 0;
    state.zVel = 0;
    state.onGround = true;
  }

  // Mouse look (unchanged)
  const mouseMoveX = mouseRef.dx || 0;
  if (!blockControls && mouseMoveX !== 0) {
    player.angle += mouseMoveX * 0.006;
  }
  mouseRef.dx = 0;
  mouseRef.dy = 0;

  // Shooting (HOLD + cooldown)
  const primaryHeld = !blockControls && isPressed(keybinds.shoot);
  const secondaryHeld = !blockControls && isPressed(keybinds.secondaryShoot);

  if (state.cooldown > 0) state.cooldown--;

  if ((primaryHeld || secondaryHeld) && state.cooldown === 0) {
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

    debugLog("projectileFire", `FIRED id=${pid}`);

    state.cooldown = COOLDOWN;
  }

  // Projectile update
  state.projectiles = state.projectiles.filter((p) => {
    const nx = p.x + p.vx;
    const ny = p.y + p.vy;

    if (isWall(nx, ny)) return false;

    p.x = nx;
    p.y = ny;
    p.ttl--;

    return p.ttl > 0;
  });

  // Network
  if (wsRef.readyState === WebSocket.OPEN) {
    wsRef.send(JSON.stringify({
      x: player.x,
      y: player.y,
      angle: player.angle,
      z: state.z,
      projectiles: state.projectiles,
      health: state.health,
      sneaking: state.player.sneaking,
    }));
  }
}
