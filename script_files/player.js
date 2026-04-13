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
 
const SPAWN = { x: 3, y: 17, angle: 0, sneaking: false };
 
// Stamina constants
const MAX_STAMINA = 1;
const STAMINA_DRAIN = 0.005;      // per frame while sprinting
const STAMINA_REGEN = 0.003;      // per frame while not sprinting
const STAMINA_COOLDOWN_FRAMES = 180; // 3 seconds at 60fps
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
  // Stamina state
  stamina: MAX_STAMINA,
  staminaCooldown: 0,       // frames remaining in exhaustion cooldown
  isSprinting: false,
  sprite: "https://www.clker.com/cliparts/a/4/1/d/1301963432622081819stick_figure%20(1).png",
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
 * Must only be called after the loading screen has fully dismissed.
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
    // Do NOT reset health here — let the server be authoritative
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
      // Always sync health from server when alive
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
  state.stamina = MAX_STAMINA;
  state.staminaCooldown = 0;
  state.isSprinting = false;
  debugLog("spawnInvincible", `Respawned — invincibility for ${SPAWN_INVINCIBILITY_DURATION} frames`);
  if (wsRef && wsRef.readyState === WebSocket.OPEN) {
    wsRef.send(JSON.stringify({ type: "respawn" }));
  }
  setTimeout(() => {
    state.isRespawning = false;
  }, 2000);
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
 
  // Sneak = Control, Sprint = Shift
  state.player.sneaking = !blockControls && (keysRef.Control || keysRef.ControlLeft || keysRef.ControlRight);
  const isTryingToSprint = !blockControls && (keysRef.Shift || keysRef.ShiftLeft || keysRef.ShiftRight) && !state.player.sneaking;
 
  // Stamina logic
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
 
  if (!blockControls && (keysRef.w || keysRef.W)) {
    moveX += Math.cos(player.angle) * MOVE_SPEED * effectiveSpeed;
    moveY += Math.sin(player.angle) * MOVE_SPEED * effectiveSpeed;
  }
  if (!blockControls && (keysRef.s || keysRef.S)) {
    moveX -= Math.cos(player.angle) * MOVE_SPEED * effectiveSpeed;
    moveY -= Math.sin(player.angle) * MOVE_SPEED * effectiveSpeed;
  }
  if (!blockControls && (keysRef.a || keysRef.A)) {
    moveX += Math.cos(player.angle - Math.PI / 2) * MOVE_SPEED * effectiveSpeed;
    moveY += Math.sin(player.angle - Math.PI / 2) * MOVE_SPEED * effectiveSpeed;
  }
  if (!blockControls && (keysRef.d || keysRef.D)) {
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