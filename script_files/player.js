import { PLAYER_RADIUS, MOVE_SPEED, JUMP_VELOCITY, GRAVITY, MAX_JUMP, PROJECTILE_SPEED, PROJECTILE_LIFETIME, PROJECTILE_START_Z, MAX_HEALTH, HIT_DAMAGE, PROJECTILE_HIT_RADIUS } from "./constant.js";
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

//init
export function initPlayer(keys, ws) {
  keysRef = keys;
  wsRef = ws;
}

export function setIsChatting(value) {
  state.isChatting = value;
}

export function setMyId(id) {
  state.myId = id;
}

export function setOthers(nextOthers) {
  state.others = { ...nextOthers };
}

export function getState() {
  return state;
}

//collision helper
function canMove(x, y) {
  return (
    !isWall(x + PLAYER_RADIUS, y + PLAYER_RADIUS) &&
    !isWall(x - PLAYER_RADIUS, y + PLAYER_RADIUS) &&
    !isWall(x + PLAYER_RADIUS, y - PLAYER_RADIUS) &&
    !isWall(x - PLAYER_RADIUS, y - PLAYER_RADIUS)
  );
}

//health helper
function updateHealthFromHits() {
  const activeRemoteProjectileIds = new Set();
  for (const id in state.others) {
    if (id === state.myId) continue;
    const remoteProjectiles = state.others[id]?.projectiles || [];

    for (const projectile of remoteProjectiles) {
      const projectileKey = `${id}:${projectile.id}`;
      activeRemoteProjectileIds.add(projectileKey);
      if (processedHits.has(projectileKey)) continue;

      const dx = projectile.x - state.player.x;
      const dy = projectile.y - state.player.y;
      const distance = Math.hypot(dx, dy);
      const zDistance = Math.abs(
        (projectile.z || 0) - (state.z + PROJECTILE_START_Z)
      );

      if (
        distance <= PROJECTILE_HIT_RADIUS &&
        zDistance <= PROJECTILE_START_Z
      ) {
        state.health = Math.max(
          0,
          Number((state.health - HIT_DAMAGE).toFixed(3))
        );
        processedHits.add(projectileKey);
      }
    }
    for (const projectileKey of processedHits) {
      if (!activeRemoteProjectileIds.has(projectileKey)) {
        processedHits.delete(projectileKey);
      }
    }
  }
}

//update loop
export function update() {
  if (!keysRef || !wsRef) return;
  const { player } = state;

  //movement and controls
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

  //collision
  const nx = player.x + moveX;
  const ny = player.y + moveY;

  if (canMove(nx, ny)) {
    player.x = nx;
    player.y = ny;
  } else {
    if (canMove(nx, player.y)) {
      player.x = nx;
    }
    if (canMove(player.x, ny)) {
      player.y = ny;
    }
  }

  //jump
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
  
  // shoot with Q, once per key press
  const qPressed = !state.isChatting && Boolean(keysRef.q || keysRef.Q);
  if (qPressed && !wasQPressed) {
    state.projectiles.push({
      x: player.x,
      y: player.y,
      z: state.z + PROJECTILE_START_Z,
      vx: Math.cos(player.angle) * PROJECTILE_SPEED,
      vy: Math.sin(player.angle) * PROJECTILE_SPEED,
      ttl: PROJECTILE_LIFETIME,
    });
  }
  wasQPressed = qPressed;

  // update projectile movement
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
  
  //sync to server
  if (wsRef.readyState === WebSocket.OPEN) {
    wsRef.send(
      JSON.stringify({
        x: player.x,
        y: player.y,
        angle: player.angle,
        z: state.z,
        projectiles: state.projectiles,
        health: state.health,
      })
    );
  }
}
