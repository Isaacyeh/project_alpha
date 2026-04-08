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

const SPAWN = { x: 3, y: 17, angle: 0, sneaking: false };

const state = {
  player: { ...SPAWN },
  z: 0,
  zVel: 0,
  onGround: true,
  isChatting: false,
  isMenuOpen: false,
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
  invincibilityTimer: 0, // Track frames of invincibility
  inMenu: false,
  sprite: "https://www.clker.com/cliparts/a/4/1/d/1301963432622081819stick_figure%20(1).png", // Default sprite
  username:
    (prompt("Enter your username:") || "Anonymous").trim() || "Anonymous",
};

let keysRef = null;
let wsRef = null;
let mouseRef = null;
let wasQPressed = false;
let wasMousePressed = false;
let nextProjectileId = 1;
let COOLDOWN = 10; // frames between shots
const processedHits = new Set();

function debugLog(msg) {
  /*
  const chat = document.getElementById("chat");
  if (!chat) return;
  const div = document.createElement("div");
  div.style.color = "#ff0";
  div.textContent = `[CLIENT] ${msg}`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  */
}

let debugTick = 0;
let closestEver = Infinity;
let hasEverSentProjectile = false;

export function initPlayer(keys, ws, mouse) {
  keysRef = keys;
  wsRef = ws;
  mouseRef = mouse;
}

export function setIsChatting(value) {
  state.isChatting = value;
}

export function setMenuOpen(value) {
  state.isMenuOpen = value;
}

export function setMyId(id) {
  state.myId = id;
  debugLog(`My ID set: ${id}`);
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

export function setMenuOpen(value) {
  state.inMenu = Boolean(value);
  if (value) {
    // When menu opens, notify server and grant invincibility
    if (wsRef && wsRef.readyState === WebSocket.OPEN) {
      wsRef.send(JSON.stringify({ type: "menuOpen" }));
    }
  } else {
    // When menu closes, reset to full health and notify server
    state.health = MAX_HEALTH;
    state.invincibilityTimer = 0;
    if (wsRef && wsRef.readyState === WebSocket.OPEN) {
      wsRef.send(JSON.stringify({ type: "menuClosed" }));
    }
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
  state.isRespawning = true; // ADD: block setOthers from re-killing us
  state.invincibilityTimer = SPAWN_INVINCIBILITY_DURATION; // 3 seconds of invincibility
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
  if (wsRef && wsRef.readyState === WebSocket.OPEN) {
    wsRef.send(JSON.stringify({ type: "respawn" }));
  }
  // Clear the guard after 120 frames (2 seconds) — enough time for
  // the stale health=0 broadcasts to flush through
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

  if (state.inMenu) {
    // Block all input while menu is open
    return;
  }

  // Decrement invincibility timer when not in menu
  if (state.invincibilityTimer > 0) {
    state.invincibilityTimer--;
  }

  if (state.isDead) {
    state.deathTimer++;
    // Unlock respawn button after 5 seconds (300 frames)
    if (state.deathTimer >= 300 && !state.canRespawn) {
      state.canRespawn = true;
    }
    // Still broadcast position so others see us (frozen at death spot)
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

  // Update sneaking state
  state.player.sneaking = !blockControls && keysRef.Shift;
  let sneakSpeed = state.player.sneaking ? 0.4 : 1;

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
  const MOUSE_SENSITIVITY = 0.006; // tune

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
    debugLog(
      `FIRED id=${pid} from (${player.x.toFixed(2)},${player.y.toFixed(
        2
      )}) vx=${Math.cos(player.angle).toFixed(2)} vy=${Math.sin(
        player.angle
      ).toFixed(2)}`
    );
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
