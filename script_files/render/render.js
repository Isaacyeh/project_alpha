import { FOV, JUMP_SCALE, MAX_HEALTH} from "../constant.js";
import { castRay } from "./castRay.js";
import { drawMinimap } from "./minimap.js";
import { getState, respawn } from "../player.js";
import { getCrosshairOptions } from "../crosshair.js";

function drawSphere(ctx, x, y, radius, color = "#4db8ff") {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawHealthBar(ctx, x, y, width, height, healthRatio) {
  const ratio = Math.max(0, Math.min(1, healthRatio));
  ctx.fillStyle = "#666";
  ctx.fillRect(x, y, width, height);

  const innerPadding = 2;
  const innerWidth = Math.max(0, width - innerPadding * 2);
  const innerHeight = Math.max(0, height - innerPadding * 2);

  ctx.fillStyle = "#111";
  ctx.fillRect(x + innerPadding, y + innerPadding, innerWidth, innerHeight);

  ctx.fillStyle = "#d00";
  ctx.fillRect(
    x + innerPadding,
    y + innerPadding,
    innerWidth * ratio,
    innerHeight
  );
}

function drawCrosshair(canvas, ctx) {
  const { opacity, image } = getCrosshairOptions();
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 + canvas.height * 0.04;

  ctx.save();
  ctx.globalAlpha = opacity;

  if (image && image.complete) {
    const size = 34;
    ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+", cx, cy);
  }

  ctx.restore();
}

// Set up respawn button click once
let respawnListenerAdded = false;
function setupRespawnButton(canvas) {
  if (respawnListenerAdded) return;
  respawnListenerAdded = true;
  canvas.addEventListener("click", (e) => {
    const state = getState();
    if (!state.isDead || !state.canRespawn) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Button is centered, 200x50, at vertical center + 110
    const bx = canvas.width / 2 - 100;
    const by = canvas.height / 2 + 85;
    if (mx >= bx && mx <= bx + 200 && my >= by && my <= by + 50) {
      respawn();
    }
  });
}

export function render(canvas, ctx) {
  setupRespawnButton(canvas);

  const {
    player,
    z,
    others,
    myId,
    projectiles,
    health,
    isDead,
    deathTimer,
    canRespawn,
  } = getState();
  const rays = canvas.width;
  const jumpOffset = z * JUMP_SCALE;
  const horizon = canvas.height / 2 + jumpOffset;

  // Sky
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, canvas.width, horizon);

  // Floor
  ctx.fillStyle = "#555";
  ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);

  const depth = [];

  let prevTileX = Math.floor(player.x);
  let prevTileY = Math.floor(player.y);

  for (let i = 0; i < rays; i++) {
    const rayAngle = player.angle - FOV / 2 + (i / rays) * FOV;
    const hit = castRay(rayAngle);
    const dist = hit.dist * Math.cos(rayAngle - player.angle);
    const height = canvas.height / Math.max(dist, 0.0001);

    depth[i] = dist;

    const faceColor = "#ffffff";
    const edgeColor = "#000000";

    ctx.fillStyle = faceColor;
    ctx.fillRect(i, horizon - height / 2, 1, height);

    const hitX = player.x + Math.cos(rayAngle) * hit.dist;
    const hitY = player.y + Math.sin(rayAngle) * hit.dist;

    const tileX = Math.floor(hitX);
    const tileY = Math.floor(hitY);

    if (tileX !== prevTileX || tileY !== prevTileY) {
      ctx.fillStyle = edgeColor;
      ctx.fillRect(i, horizon - height / 2, 1, height);
    }

    prevTileX = tileX;
    prevTileY = tileY;
  }

  // Collect all projectiles (self + remote)
  const allProjectiles = [...projectiles];
  for (const id in others) {
    if (id === myId) continue;
    const remoteProjectiles = others[id].projectiles || [];
    allProjectiles.push(...remoteProjectiles);
  }

  // Collect all sprites and depth-sort back-to-front
  const sprites = [];
  for (const projectile of allProjectiles) {
    sprites.push({ type: "projectile", data: projectile });
  }
  for (const id in others) {
    if (id === myId) continue;
    sprites.push({ type: "player", id, data: others[id] });
  }

  sprites.sort((a, b) => {
    const distA = Math.hypot(a.data.x - player.x, a.data.y - player.y);
    const distB = Math.hypot(b.data.x - player.x, b.data.y - player.y);
    return distB - distA;
  });

  for (const sprite of sprites) {
    if (sprite.type === "projectile") {
      const projectile = sprite.data;
      const dx = projectile.x - player.x;
      const dy = projectile.y - player.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) - player.angle;
      const norm = Math.atan2(Math.sin(angle), Math.cos(angle));
      if (Math.abs(norm) > FOV / 2) continue;
      const sx = (0.5 + norm / FOV) * canvas.width;
      const depthIndex = Math.floor(sx);
      if (depthIndex < 0 || depthIndex >= depth.length) continue;
      if (depth[depthIndex] < dist) continue;
      const radius = Math.max(2, canvas.height / Math.max(dist * 10, 0.0001));
      const sy = horizon - radius - (projectile.z || 0) * JUMP_SCALE;
      drawSphere(ctx, sx, sy, radius);
    } else {
      const p = sprite.data;
      const dx = p.x - player.x;
      const dy = p.y - player.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) - player.angle;
      const norm = Math.atan2(Math.sin(angle), Math.cos(angle));
      if (Math.abs(norm) > FOV / 2) continue;
      const sx = (0.5 + norm / FOV) * canvas.width;
      const sxIndex = Math.floor(sx);
      if (sxIndex < 0 || sxIndex >= depth.length) continue;
      if (depth[sxIndex] < dist) continue;
      const size = canvas.height / Math.max(dist, 0.0001);
      const sy = horizon - size / 2 - (p.z || 0) * JUMP_SCALE;
      const bodyWidth = size / 2;
      const bodyX = sx - bodyWidth / 2;

      ctx.fillStyle = "red";
      ctx.fillRect(bodyX, sy, bodyWidth, size);

      const name = p.username || "Anonymous";
      const fontSize = Math.max(10, Math.min(18, size / 6));
      ctx.font = `${fontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const labelY = sy - 6;
      const textWidth = ctx.measureText(name).width;
      const bgWidth = textWidth + 8;
      const bgHeight = fontSize + 4;
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(sx - bgWidth / 2, labelY - bgHeight, bgWidth, bgHeight);
      ctx.fillStyle = "#fff";
      ctx.fillText(name, sx, labelY - 2);

      const remoteHealth = Number.isFinite(p.health) ? p.health : MAX_HEALTH;
      const barWidth = bodyWidth;
      const barHeight = Math.max(6, size * 0.07);
      const barX = sx - barWidth / 2;
      const barY = sy + size + 6;
      drawHealthBar(
        ctx,
        barX,
        barY,
        barWidth,
        barHeight,
        remoteHealth / MAX_HEALTH
      );
    }
  }

  drawMinimap(ctx);

  // Local HUD health bar
  const hudWidth = Math.min(420, canvas.width * 0.55);
  const hudHeight = 30;
  const hudX = 24;
  const hudY = canvas.height - hudHeight - 20;
  drawHealthBar(ctx, hudX, hudY, hudWidth, hudHeight, health / MAX_HEALTH);
  drawCrosshair(canvas, ctx);

  // Death screen overlay
  if (isDead) {
    ctx.fillStyle = "rgba(180, 0, 0, 0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // YOU DIED
    ctx.font = "bold 96px Arial";
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillText("YOU DIED", canvas.width / 2 + 4, canvas.height / 2 - 36);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("YOU DIED", canvas.width / 2, canvas.height / 2 - 40);

    if (!canRespawn) {
      // Countdown until button appears
      const secondsLeft = Math.ceil((300 - deathTimer) / 60);
      ctx.font = "bold 28px Arial";
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillText(
        `Respawn available in ${secondsLeft}...`,
        canvas.width / 2 + 2,
        canvas.height / 2 + 42
      );
      ctx.fillStyle = "#ffcccc";
      ctx.fillText(
        `Respawn available in ${secondsLeft}...`,
        canvas.width / 2,
        canvas.height / 2 + 40
      );
    } else {
      // Respawn button
      const bx = canvas.width / 2 - 100;
      const by = canvas.height / 2 + 85;
      const bw = 200;
      const bh = 50;

      // Button shadow
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx + 3, by + 3, bw, bh);
      // Button background
      ctx.fillStyle = "#cc0000";
      ctx.fillRect(bx, by, bw, bh);
      // Button border
      ctx.strokeStyle = "#ff6666";
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
      // Button text
      ctx.font = "bold 22px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("RESPAWN", canvas.width / 2, by + bh / 2);
    }
  }
}
