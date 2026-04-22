import {
  PLAYER_RADIUS,
  MOVE_SPEED,
  JUMP_VELOCITY,
  GRAVITY,
  MAX_JUMP,
  PROJECTILE_SPEED,
  PROJECTILE_LIFETIME,
  PROJECTILE_START_Z,
  PROJECTILE_RADIUS,
  TRACER_MAX_RANGE,
  MAX_HEALTH,
  HIT_DAMAGE,
  SPAWN_INVINCIBILITY_DURATION,
  PITCH_MAX,
  PITCH_SPEED,
  PITCH_MOUSE_SENS,
  PITCH_SCREEN_Y_SCALE,
  FIRE_RATE_FRAMES,
} from "./constant.js";
import { isWall, map, getGeometry } from "./map.js";
import { debugLog } from "./debug.js";
import { keybinds, isPressed, initKeyMouseRef } from "./keybindControls.js";
 
const SPAWN = { x: 17, y: 7, angle: 0, sneaking: false };
 
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
  projectiles: [],   // visual tracers only
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
 
  pitch: 0,   // vertical camera angle (radians, + = look down, - = look up)
 
  sprite: "https://www.clker.com/cliparts/a/4/1/d/1301963432622081819stick_figure%20(1).png",
  username: "",
};
 
let keysRef = null;
let wsRef = null;
let mouseRef = null;
let nextProjectileId = 1;
 
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
  state.pitch = 0;
 
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
 
// ── Raycast shot ──────────────────────────────────────────────────────────────
// Returns xy endpoint, world-z at impact, and surface type hit.
function raycastShot(originX, originY, originZ, angle, pitch) {
  const STEP = 0.05;
  const MAX_STEPS = Math.ceil(TRACER_MAX_RANGE / STEP);
  const cosPitch = Math.cos(pitch);
  const dx = Math.cos(angle) * STEP * cosPitch;
  const dy = Math.sin(angle) * STEP * cosPitch;
  const dz = -pitch * PITCH_SCREEN_Y_SCALE * STEP * cosPitch;
 
  let x = originX, y = originY, z = originZ;
 
  for (let i = 0; i < MAX_STEPS; i++) {
    x += dx; y += dy; z += dz;
 
    if (z <= 0) return { x: x-dx*0.5, y: y-dy*0.5, z: 0,        hitWall: true, hitType: "floor"   };
    if (z >= 1) return { x: x-dx*0.5, y: y-dy*0.5, z: 1,        hitWall: true, hitType: "ceiling" };
 
    const char = map[Math.floor(y)]?.[Math.floor(x)];
    if (char) {
      const geo = getGeometry(char);
      if (geo && geo.solid) {
        return { x: x-dx*0.5, y: y-dy*0.5, z: z-dz*0.5, hitWall: true, hitType: "wall" };
      }
    }
  }
  return { x, y, z, hitWall: false, hitType: "none" };
}
 
function getCrosshairGamePosition() {
  const canvas = document.getElementById("game");
  if (!canvas) return null;
  return {
    x: canvas.width / 2,
    y: canvas.height / 2,
  };
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
 
  const { player } = state;
  const blockControls = state.isChatting || state.isMenuOpen;
 
  // Turning
  if (!blockControls && isPressed(keybinds.turnLeft))  player.angle -= 0.04;
  if (!blockControls && isPressed(keybinds.turnRight)) player.angle += 0.04;
 
  // Vertical look (pitch) — arrow up / down
  if (!blockControls && isPressed("ArrowUp")) {
    state.pitch = Math.max(-PITCH_MAX, state.pitch - PITCH_SPEED);
  }
  if (!blockControls && isPressed("ArrowDown")) {
    state.pitch = Math.min(PITCH_MAX, state.pitch + PITCH_SPEED);
  }
 
  let moveX = 0, moveY = 0;
 
  // Sneak + Sprint
  state.player.sneaking = !blockControls && isPressed(keybinds.sneak);
 
  const isTryingToSprint =
    !blockControls && isPressed(keybinds.sprint) && !state.player.sneaking;
 
  if (isTryingToSprint && state.staminaCooldown === 0 && state.stamina > 0) {
    state.isSprinting = true;
    state.stamina = Math.max(0, state.stamina - STAMINA_DRAIN);
    if (state.stamina === 0) {
      state.staminaCooldown = STAMINA_COOLDOWN_FRAMES;
      state.isSprinting = false;
    }
  } else {
    state.isSprinting = false;
    if (state.staminaCooldown > 0) state.staminaCooldown--;
    else state.stamina = Math.min(MAX_STAMINA, state.stamina + STAMINA_REGEN);
  }
 
  const sneakSpeed    = state.player.sneaking ? 0.4 : 1;
  const sprintSpeed   = state.isSprinting ? SPRINT_SPEED_MULT : 1;
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
 
  const nx = player.x + moveX, ny = player.y + moveY;
  if (canMove(nx, ny))            { player.x = nx; player.y = ny; }
  else if (canMove(nx, player.y))   player.x = nx;
  else if (canMove(player.x, ny))   player.y = ny;
 
  // Jump
  if (!blockControls && isPressed(keybinds.jump) && state.onGround) {
    state.zVel = JUMP_VELOCITY;
    state.onGround = false;
  }
  state.zVel -= GRAVITY;
  state.z    += state.zVel;
  if (state.z <= 0) { state.z = 0; state.zVel = 0; state.onGround = true; }
 
  // Mouse look
  if (!blockControls) {
    if (mouseRef.dx) player.angle += mouseRef.dx * 0.006;
    if (mouseRef.dy) {
      state.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX,
        state.pitch + mouseRef.dy * PITCH_MOUSE_SENS));
    }
  }
  mouseRef.dx = 0;
  mouseRef.dy = 0;
 
  // ── Shooting ──────────────────────────────────────────────────────────────
  const primaryHeld   = !blockControls && isPressed(keybinds.shoot);
  const secondaryHeld = !blockControls && isPressed(keybinds.secondaryShoot);
 
  if (state.cooldown > 0) state.cooldown--;
 
  if ((primaryHeld || secondaryHeld) && state.cooldown === 0) {
    const pid = nextProjectileId++;
 
    // Visual bullet origin: eye/torso height
    const bulletOriginZ = state.z + PROJECTILE_START_Z;
    const cosPitch = Math.cos(state.pitch);
    const startOffset = 0.2;
    const startX = player.x + Math.cos(player.angle) * startOffset * cosPitch;
    const startY = player.y + Math.sin(player.angle) * startOffset * cosPitch;
 
    const endpoint = raycastShot(
      player.x, player.y, bulletOriginZ,
      player.angle, state.pitch
    );
 
    const totalDist    = Math.hypot(endpoint.x - startX, endpoint.y - startY);
    const travelFrames = Math.max(1, Math.round(totalDist / PROJECTILE_SPEED));
    const pitchSlope   = state.pitch * PITCH_SCREEN_Y_SCALE;
 
    state.projectiles.push({
      id:          pid,
      x:           startX,
      y:           startY,
      z:           bulletOriginZ,
      originX:     startX,
      originY:     startY,
      originZ:     bulletOriginZ,
      angle:       player.angle,
      pitch:       state.pitch,
      endX:        endpoint.x,
      endY:        endpoint.y,
      endZ:        endpoint.z,
      vx:          Math.cos(player.angle) * PROJECTILE_SPEED * cosPitch,
      vy:          Math.sin(player.angle) * PROJECTILE_SPEED * cosPitch,
      vz:          -pitchSlope * PROJECTILE_SPEED * cosPitch,
      ttl:         travelFrames,
      totalFrames: travelFrames,
      spawnFramesLeft: 1,
      hitWall:     endpoint.hitWall,
      hitType:     endpoint.hitType,
    });
 
    debugLog("projectileFire",
      `FIRED id=${pid} range=${totalDist.toFixed(2)} frames=${travelFrames} ` +
      `pitch=${state.pitch.toFixed(3)} type=${endpoint.hitType}`);

    const crosshair = getCrosshairGamePosition();
    const crosshairText = crosshair
      ? `crosshairGamePx=(${crosshair.x.toFixed(1)},${crosshair.y.toFixed(1)})`
      : "crosshair=unavailable";
    debugLog("shotPlacement",
      `SHOT id=${pid} ${crosshairText} surface=${endpoint.hitType}`);
 
    // FIRE_RATE_FRAMES from constant.js controls shots-per-second
    state.cooldown = FIRE_RATE_FRAMES;
 
    // Send floor-relative z to server so the Z hit check passes.
    // The server's rayCastHit now tracks z along the ray using pitch,
    // so it won't falsely hit players that are above/below the aim line.
    if (wsRef.readyState === WebSocket.OPEN) {
      wsRef.send(JSON.stringify({
        type:    "shoot",
        id:      pid,
        x:       player.x,
        y:       player.y,
        z:       state.z,       // floor-relative, NOT +PROJECTILE_START_Z
        shotOriginZ: bulletOriginZ,
        angle:   player.angle,
        pitch:   state.pitch,
      }));
    }
  }
 
  // ── Advance visual tracers ────────────────────────────────────────────────
  state.projectiles = state.projectiles.filter((p) => {
    if (p.spawnFramesLeft > 0) {
      p.spawnFramesLeft--;
    } else {
      p.x += p.vx; p.y += p.vy; p.z += p.vz;
    }
    p.ttl--;
    const dFromOrigin = Math.hypot(p.x - p.originX, p.y - p.originY);
    const totalDist   = Math.hypot(p.endX - p.originX, p.endY - p.originY);
    if (dFromOrigin >= totalDist) return false;
    return p.ttl > 0;
  });
 
  // ── Network: send position + visual tracers ───────────────────────────────
  if (wsRef.readyState === WebSocket.OPEN) {
    wsRef.send(JSON.stringify({
      x:           player.x,
      y:           player.y,
      angle:       player.angle,
      z:           state.z,
      pitch:       state.pitch,
      projectiles: state.projectiles.map((p) => ({
        id:  p.id,
        x:   p.x,
        y:   p.y,
        z:   p.z,
        vx:  p.vx,
        vy:  p.vy,
        vz:  p.vz,
        ttl: p.ttl,
      })),
      health:    state.health,
      sneaking:  state.player.sneaking,
    }));
  }
}