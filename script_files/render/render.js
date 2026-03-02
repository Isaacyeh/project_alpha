import { FOV, JUMP_SCALE, MAX_HEALTH } from "../constant.js";
import { castRay } from "./castRay.js";
import { drawMinimap } from "./minimap.js";
import { getState } from "../player.js";

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

export function render(canvas, ctx) {
  const { player, z, others, myId, projectiles, health } = getState();
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

    // Determine wall face color
    const faceColor = "#ffffff"; // main face color
    const edgeColor = "#000000"; // edge color

    // Draw main face
    ctx.fillStyle = faceColor;
    ctx.fillRect(i, horizon - height / 2, 1, height);

    // --- Edge detection: check if ray crossed tile boundary ---
    const hitX = player.x + Math.cos(rayAngle) * hit.dist;
    const hitY = player.y + Math.sin(rayAngle) * hit.dist;

    const tileX = Math.floor(hitX);
    const tileY = Math.floor(hitY);

    // If the ray is entering a new tile horizontally or vertically, draw edge
    if (tileX !== prevTileX || tileY !== prevTileY) {
      ctx.fillStyle = edgeColor;
      ctx.fillRect(i, horizon - height / 2, 1, height);
    }

    prevTileX = tileX;
    prevTileY = tileY;
  }

  // Draw projectiles (self + remote players)
  const allProjectiles = [...projectiles];
  for (const id in others) {
    if (id === myId) continue;
    const remoteProjectiles = others[id].projectiles || [];
    allProjectiles.push(...remoteProjectiles);
  }

  for (const projectile of allProjectiles) {
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
  }

  // Draw other players
  for (const id in others) {
    if (id === myId) continue;
    const p = others[id];

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

    //nametag
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

    // health bar at player feet with width matching sprite width
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

  drawMinimap(ctx);
  
  // local HUD health bar near bottom, away from chat panel on right
  const hudWidth = Math.min(420, canvas.width * 0.55);
  const hudHeight = 30;
  const hudX = 24;
  const hudY = canvas.height - hudHeight - 20;
  drawHealthBar(ctx, hudX, hudY, hudWidth, hudHeight, health / MAX_HEALTH);
}
