import { debugToggles } from "./debug.js";

const bulletHoles = [];
const BULLET_HOLE_LIFETIME_MS = 3000;

export function addBulletHole(wx, wy, endZ, bulletOriginZ, hitType) {
  bulletHoles.push({ wx, wy, endZ, bulletOriginZ, hitType: hitType || "wall", born: Date.now() });
  if (bulletHoles.length > 300) bulletHoles.shift();
}

function drawBulletHoles(canvas, ctx, player, depth, horizon, fov) {
  if (!debugToggles.bulletHoles?.enabled) return;

  const now = Date.now();
  const canvasH = canvas.height;
  const canvasW = canvas.width;

  for (let i = bulletHoles.length - 1; i >= 0; i--) {
    const hole = bulletHoles[i];
    const age = now - hole.born;
    if (age >= BULLET_HOLE_LIFETIME_MS) { bulletHoles.splice(i, 1); continue; }
    const alpha = 1 - age / BULLET_HOLE_LIFETIME_MS;

    const dx = hole.wx - player.x;
    const dy = hole.wy - player.y;
    const rawDist = Math.hypot(dx, dy);
    if (rawDist < 0.05) continue;

    const angle = Math.atan2(dy, dx) - player.angle;
    const norm = Math.atan2(Math.sin(angle), Math.cos(angle));
    if (Math.abs(norm) > fov / 2 + 0.05) continue;

    const sx = (0.5 + norm / fov) * canvasW;
    const col = Math.round(sx);
    if (col < 0 || col >= canvasW) continue;

    const perpDist = rawDist * Math.cos(norm);
    if (perpDist < 0.05) continue;

    const depthAtCol = depth[Math.max(0, Math.min(depth.length - 1, col))];
    if (depthAtCol < perpDist - 0.05) continue;

    const wallH = canvasH / Math.max(perpDist, 0.0001);
    const sy = horizon + (hole.bulletOriginZ - hole.endZ) * wallH;
    const radius = Math.max(1.5, wallH * 0.035);

    ctx.save();
    ctx.globalAlpha = alpha * 0.88;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    ctx.strokeStyle = "rgba(50,30,10,0.45)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawBulletHolesIfEnabled(canvas, ctx, player, depth, horizon, fov) {
  drawBulletHoles(canvas, ctx, player, depth, horizon, fov);
}