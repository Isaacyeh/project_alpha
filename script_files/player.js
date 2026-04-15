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
 
const SPAWN = { x: 31, y: 7, angle: 0, sneaking: false };
 
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
  sprite: "https://www.clker.com/cliparts/a/4/1/d/1301963432622081819stick_figure%20(1).png",
  // Username intentionally blank — set via promptUsername() after loading screen clears.
  // Do NOT call prompt() here; it would fire before the loading overlay appears.
  username: "",
};
 
let keysRef = null;
let wsRef = null;
let mouseRef = null;
let wasQPressed = false;
let wasMousePressed = false;
let nextProjectileId = 1;
let COOLDOWN = 10;
 
export function initPlayer(keys, ws, mouse) {
  keysRef = keys;
  wsRef = ws;
  mouseRef = mouse;
}
 
/**
 * Show the username prompt and store the result in state.
 * Must only be called after the loading screen has fully dismissed so the
 * prompt appears on top of the game, not on top of (or before) the loader.
 * Returns the chosen name so the caller can forward it to the server.
 */
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
    state.health = MAX_HEALTH;
    state.invincibilityTimer = 0;
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
  state.hasShot = false;
  state.cooldown = 0;
  state.projectiles = [];
  debugLog("spawnInvincible", `Respawned — invincibility for ${SPAWN_INVINCIBILITY_DURATION} frames`);
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
 
  if (state.invincibilityTimer > 0) {
    state.invincibilityTimer--;
    debugLog("spawnInvincible", `Invincibility frames left: ${state.invincibilityTimer}`);
  }
 
  if (state.isDead) {
    state.deathTimer++;
    if (state.deathTimer >= 300 && !state.canRespawn) {
      state.canRespawn = true;
    }
    if (wsRef.readyState === WebSocket.OPEN) {
      wsRef.send(
        JSON.stringify({
          x: state.player.x,
          y: state.player.y,
          angle: state.player.angle,
          z: state.z,
          projectiles: [],
          health: state.health,
          sneaking: state.player.sneaking,
        })
      );
    }
    return;
  }
 
  const { player } = state;
  const blockControls = state.isChatting || state.isMenuOpen;
 
  if (!blockControls && keysRef.ArrowLeft) player.angle -= 0.04;
  if (!blockControls && keysRef.ArrowRight) player.angle += 0.04;
 
  let moveX = 0;
  let moveY = 0;
 
  state.player.sneaking = !blockControls && keysRef.Shift;
  const sneakSpeed = state.player.sneaking ? 0.4 : 1;
 
  if (!blockControls && (keysRef.w || keysRef.W)) {
    moveX += Math.cos(player.angle) * MOVE_SPEED * sneakSpeed;
    moveY += Math.sin(player.angle) * MOVE_SPEED * sneakSpeed;
  }
  if (!blockControls && (keysRef.s || keysRef.S)) {
    moveX -= Math.cos(player.angle) * MOVE_SPEED * sneakSpeed;
    moveY -= Math.sin(player.angle) * MOVE_SPEED * sneakSpeed;
  }
  if (!blockControls && (keysRef.a || keysRef.A)) {
    moveX += Math.cos(player.angle - Math.PI / 2) * MOVE_SPEED * sneakSpeed;
    moveY += Math.sin(player.angle - Math.PI / 2) * MOVE_SPEED * sneakSpeed;
  }
  if (!blockControls && (keysRef.d || keysRef.D)) {
    moveX += Math.cos(player.angle + Math.PI / 2) * MOVE_SPEED * sneakSpeed;
    moveY += Math.sin(player.angle + Math.PI / 2) * MOVE_SPEED * sneakSpeed;
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
 
  debugLog("playerMovement", `pos=(${player.x.toFixed(2)}, ${player.y.toFixed(2)}) angle=${player.angle.toFixed(2)}`);
 
  if (!blockControls && keysRef[" "] && state.onGround) {
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
 
  const canShoot = !blockControls && !state.player.sneaking;
  const qPressed = canShoot && Boolean(keysRef.q);
  const mousePressed = canShoot && Boolean(mouseRef.buttons[0]);
  const shouldShoot = (qPressed && !wasQPressed) || (mousePressed && !wasMousePressed);
 
  const mouseMoveX = mouseRef.dx || 0;
  const MOUSE_SENSITIVITY = 0.006;
 
  if (!blockControls && mouseMoveX !== 0) {
    player.angle += mouseMoveX * MOUSE_SENSITIVITY;
  }
 
  mouseRef.dx = 0;
  mouseRef.dy = 0;
 
  if (shouldShoot) {
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
    debugLog("projectileFire", `FIRED id=${pid} from (${player.x.toFixed(2)},${player.y.toFixed(2)}) vx=${Math.cos(player.angle).toFixed(2)} vy=${Math.sin(player.angle).toFixed(2)}`);
  }
 
  wasQPressed = qPressed;
  wasMousePressed = mousePressed;
 
  if (wasQPressed || wasMousePressed) {
    state.cooldown++;
    if (state.cooldown >= COOLDOWN) {
      state.cooldown = 0;
      wasQPressed = false;
      wasMousePressed = false;
    }
  }
 
  state.projectiles = state.projectiles.filter((projectile) => {
    const nextX = projectile.x + projectile.vx;
    const nextY = projectile.y + projectile.vy;
    if (isWall(nextX, nextY)) return false;
    projectile.x = nextX;
    projectile.y = nextY;
    projectile.ttl -= 1;
    return projectile.ttl > 0;
  });
 
  if (wsRef.readyState === WebSocket.OPEN) {
    const payload = {
      x: player.x,
      y: player.y,
      angle: player.angle,
      z: state.z,
      projectiles: state.projectiles,
      health: state.health,
      sneaking: state.player.sneaking,
    };
    debugLog("networkSend", `send pos=(${player.x.toFixed(2)},${player.y.toFixed(2)}) proj=${state.projectiles.length}`);
    wsRef.send(JSON.stringify(payload));
  }
}