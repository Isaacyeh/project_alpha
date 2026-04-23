import { FOV, JUMP_SCALE, MAX_HEALTH } from "../constant.js";
import { castRay } from "./castRay.js";
import { drawMinimap } from "./minimap.js";
import { getState, respawn } from "../player.js";
import { getCrosshairOptions } from "../crosshair.js";
import { selectedGun } from "../guns.js";

// Cache for player sprite images
const playerImages = new Map(); // id -> { img, url }

// Set of sprite URLs that should be compressed to 0.5 aspect ratio
const compressedSprites = new Set();

// Load preset sprites from sprites.json and add default
fetch("/sprites.json")
  .then((response) => response.json())
  .then((data) => {
    // Add default sprite
    compressedSprites.add(
      "https://www.clker.com/cliparts/a/4/1/d/1301963432622081819stick_figure%20(1).png"
    );
    // Add all preset sprites
    data.forEach((sprite) => compressedSprites.add(sprite.url));
  })
  .catch((error) => {
    console.warn("Failed to load sprites.json for compression list:", error);
    // Fallback: just default
    compressedSprites.add(
      "https://www.clker.com/cliparts/a/4/1/d/1301963432622081819stick_figure%20(1).png"
    );
  });

// Default sprite dimensions (the stick figure URL used as baseline)
// We treat a 1:2 aspect ratio (width:height) as the "default" hitbox reference.
// bodyWidth = size / 2  (from original code), so default hitbox width = size/2,
// default hitbox height = size.
const DEFAULT_ASPECT = 0.5; // width / height for default sprite

function getPlayerImage(id, spriteUrl) {
  if (!spriteUrl) return null;
  const existing = playerImages.get(id);
  if (existing && existing.url === spriteUrl) return existing.img;

  const img = new Image();
  img.__loaded = false;
  img.__error = false;
  img.onload = () => {
    img.__loaded = true;
  };
  img.onerror = () => {
    img.__loaded = true;
    img.__error = true;
    console.warn(`Sprite failed to load for player ${id}:`, spriteUrl);
  };
  img.src = spriteUrl;
  playerImages.set(id, { img, url: spriteUrl });
  return img;
}

function hitboxColor(p) {
  if (p.isDead || p.health <= 0) return "#888888";
  if (p.isInvincible) return "#ffdd00";
  if (p.sneaking) return "#00cc44";
  return "#cc0000";
}

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
  const pad = 2;
  const iw = Math.max(0, width - pad * 2);
  const ih = Math.max(0, height - pad * 2);
  ctx.fillStyle = "#111";
  ctx.fillRect(x + pad, y + pad, iw, ih);
  ctx.fillStyle = "#d00";
  ctx.fillRect(x + pad, y + pad, iw * ratio, ih);
}

/**
 * Draw the stamina bar above the health bar.
 * Flashes red during exhaustion cooldown.
 */
function drawStaminaBar(ctx, x, y, width, height, stamina, staminaCooldown) {
  const ratio = Math.max(0, Math.min(1, stamina));
  const pad = 2;

  ctx.fillStyle = "#555";
  ctx.fillRect(x, y, width, height);

  const iw = Math.max(0, width - pad * 2);
  const ih = Math.max(0, height - pad * 2);

  ctx.fillStyle = "#111";
  ctx.fillRect(x + pad, y + pad, iw, ih);

  if (staminaCooldown > 0) {
    const flash = Math.sin(Date.now() / 120) > 0;
    ctx.fillStyle = flash ? "#cc0000" : "#550000";
    ctx.fillRect(x + pad, y + pad, iw, ih);
  } else {
    ctx.fillStyle = "#e8e8a0";
    ctx.fillRect(x + pad, y + pad, iw * ratio, ih);
  }
}

function drawCrosshair(canvas, ctx) {
  const { opacity, image } = getCrosshairOptions();
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 + canvas.height * 0.04;

  ctx.save();
  ctx.globalAlpha = opacity;

  if (image && image.complete && !image.__error) {
    const size = 34;
    ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
  } else {
    ctx.fillStyle = "#000000";
    ctx.font = "bold 34px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+", cx, cy);
  }

  ctx.restore();
}

// ── Leaderboard (Tab-held) ────────────────────────────────────────────────────
let leaderboardData = [];

export function updateLeaderboard(data) {
  if (Array.isArray(data)) leaderboardData = data;
}

function drawLeaderboard(canvas, ctx) {
  const rows = leaderboardData;
  if (!rows || rows.length === 0) return;

  const padX = 28;
  const padY = 20;
  const rowH = 36;
  const headerH = 52;
  const colW = [220, 90, 90]; // name, kills, deaths
  const totalW = colW.reduce((a, b) => a + b, 0) + padX * 2;
  const totalH = headerH + rows.length * rowH + padY * 2;

  const startX = Math.floor((canvas.width - totalW) / 2);
  const startY = Math.floor((canvas.height - totalH) / 2);

  // Backdrop
  ctx.save();
  ctx.fillStyle = "rgba(8, 8, 12, 0.88)";
  roundRect(ctx, startX, startY, totalW, totalH, 10);
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(180, 180, 210, 0.35)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, startX, startY, totalW, totalH, 10);
  ctx.stroke();

  // Title
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 22px 'Courier New', monospace";
  ctx.fillStyle = "#c8c8d8";
  ctx.fillText("LEADERBOARD", startX + totalW / 2, startY + padY + 12);

  // Divider
  ctx.strokeStyle = "rgba(180,180,210,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX + padX, startY + headerH);
  ctx.lineTo(startX + totalW - padX, startY + headerH);
  ctx.stroke();

  // Column headers
  ctx.font = "bold 12px 'Courier New', monospace";
  ctx.fillStyle = "#778899";
  ctx.textAlign = "left";
  ctx.fillText("PLAYER", startX + padX, startY + headerH + 10);
  ctx.textAlign = "center";
  ctx.fillText(
    "KILLS",
    startX + padX + colW[0] + colW[1] / 2,
    startY + headerH + 10
  );
  ctx.fillText(
    "DEATHS",
    startX + padX + colW[0] + colW[1] + colW[2] / 2,
    startY + headerH + 10
  );

  // Rows
  rows.forEach((entry, i) => {
    const ry = startY + headerH + 26 + i * rowH;

    // Zebra stripe
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(startX + 4, ry - rowH * 0.4, totalW - 8, rowH * 0.88);
    }

    // Rank badge
    const rankColors = ["#ffd700", "#c0c0c0", "#cd7f32"];
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = rankColors[i] || "#556677";
    ctx.fillText(`#${i + 1}`, startX + padX + 14, ry);

    // Name
    ctx.textAlign = "left";
    ctx.fillStyle = "#dde0e8";
    ctx.font = "14px 'Courier New', monospace";
    const displayName = (entry.username || "Anonymous").slice(0, 20);
    ctx.fillText(displayName, startX + padX + 36, ry);

    // Kills (green)
    ctx.textAlign = "center";
    ctx.fillStyle = "#44cc88";
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.fillText(
      String(entry.kills || 0),
      startX + padX + colW[0] + colW[1] / 2,
      ry
    );

    // Deaths (red-ish)
    ctx.fillStyle = "#cc5555";
    ctx.fillText(
      String(entry.deaths || 0),
      startX + padX + colW[0] + colW[1] + colW[2] / 2,
      ry
    );
  });

  // Footer hint
  ctx.font = "11px 'Courier New', monospace";
  ctx.fillStyle = "rgba(150,150,170,0.5)";
  ctx.textAlign = "center";
  ctx.fillText(
    "Release TAB to close",
    startX + totalW / 2,
    startY + totalH - 10
  );

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Tab key tracking ──────────────────────────────────────────────────────────
let tabHeld = false;
window.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    tabHeld = true;
  }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    tabHeld = false;
  }
});

// ── Respawn: button click + any key ──────────────────────────────────────────
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
    const bx = canvas.width / 2 - 100;
    const by = canvas.height / 2 + 85;
    if (mx >= bx && mx <= bx + 200 && my >= by && my <= by + 50) {
      respawn();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Tab") return; // don't respawn on Tab
    const state = getState();
    if (state.isDead && state.canRespawn) {
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
    stamina,
    staminaCooldown,
  } = getState();

  const rays = canvas.width;
  const jumpOffset = z * JUMP_SCALE;
  const horizon = canvas.height / 2 + jumpOffset;

  // Sky / floor
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, canvas.width, horizon);
  ctx.fillStyle = "#555";
  ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);

  // Walls
  const depth = [];
  let prevTileX = Math.floor(player.x);
  let prevTileY = Math.floor(player.y);

  for (let i = 0; i < rays; i++) {
    const rayAngle = player.angle - FOV / 2 + (i / rays) * FOV;
    const hit = castRay(rayAngle);
    const dist = hit.dist * Math.cos(rayAngle - player.angle);
    const height = canvas.height / Math.max(dist, 0.0001);
    const drawH = height * (hit.heightScale ?? 1); // CHANGED
    const yShift = height * (hit.yOffset ?? 0); // CHANGED
    depth[i] = dist;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(i, horizon - drawH / 2 + yShift, 1, drawH); // CHANGED
    const hitX = player.x + Math.cos(rayAngle) * hit.dist;
    const hitY = player.y + Math.sin(rayAngle) * hit.dist;
    const tileX = Math.floor(hitX);
    const tileY = Math.floor(hitY);
    if (tileX !== prevTileX || tileY !== prevTileY) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(i, horizon - drawH / 2 + yShift, 1, drawH); // CHANGED
    }
    prevTileX = tileX;
    prevTileY = tileY;
  }
  // Collect all sprites (projectiles + remote players)
  const allProjectiles = [...projectiles];
  for (const id in others) {
    if (id === myId) continue;
    allProjectiles.push(...(others[id].projectiles || []));
  }

  const sprites = [];
  for (const projectile of allProjectiles) {
    sprites.push({ type: "projectile", data: projectile });
  }
  for (const id in others) {
    if (id === myId) continue;
    sprites.push({ type: "player", id, data: others[id] });
  }

  // Farthest first
  sprites.sort((a, b) => {
    const dA = Math.hypot(a.data.x - player.x, a.data.y - player.y);
    const dB = Math.hypot(b.data.x - player.x, b.data.y - player.y);
    return dB - dA;
  });

  for (const sprite of sprites) {
    if (sprite.type === "projectile") {
      const proj = sprite.data;
      const dx = proj.x - player.x;
      const dy = proj.y - player.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) - player.angle;
      const norm = Math.atan2(Math.sin(angle), Math.cos(angle));
      if (Math.abs(norm) > FOV / 2) continue;
      const sx = (0.5 + norm / FOV) * canvas.width;
      const di = Math.floor(sx);
      if (di < 0 || di >= depth.length || depth[di] < dist) continue;
      const radius = Math.max(1, canvas.height / Math.max(dist * 20, 0.0001)) * (selectedGun.current.projectileRadius / 0.0125);
      const crosshairY = horizon + canvas.height * 0.04;
      const sy = crosshairY - ((proj.z || 0) - z) * JUMP_SCALE;
      drawSphere(ctx, sx, sy, radius, selectedGun.current.color);
    } else {
      const p = sprite.data;
      const dx = p.x - player.x;
      const dy = p.y - player.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) - player.angle;
      const norm = Math.atan2(Math.sin(angle), Math.cos(angle));
      if (Math.abs(norm) > FOV / 2) continue;
      const sx = (0.5 + norm / FOV) * canvas.width;
      const si = Math.floor(sx);
      if (si < 0 || si >= depth.length || depth[si] < dist) continue;

      const size = canvas.height / Math.max(dist, 0.0001);
      const sy = horizon - size / 2 - (p.z || 0) * JUMP_SCALE;

      // ── Hitbox: minimum = default size, expand for wider/taller images ──
      // Default hitbox dimensions
      const defaultHitboxW = size * DEFAULT_ASPECT; // size/2
      const defaultHitboxH = size;

      // Determine actual rendered image dimensions
      const playerImg = getPlayerImage(sprite.id, p.sprite);
      const imgReady =
        playerImg &&
        playerImg.complete &&
        !playerImg.__error &&
        playerImg.naturalWidth > 0;

      let imgAspect = DEFAULT_ASPECT;
      if (imgReady) {
        if (compressedSprites.has(p.sprite)) {
          imgAspect = 0.5;
        } else {
          imgAspect = playerImg.naturalWidth / playerImg.naturalHeight;
        }
      }

      // Rendered image size (based on height = size, width = size * aspect)
      const renderedImgW = size * imgAspect;
      const renderedImgH = size;

      // Hitbox is the MAXIMUM of default and rendered image dimensions
      const hitboxW = Math.max(defaultHitboxW, renderedImgW);
      const hitboxH = Math.max(defaultHitboxH, renderedImgH);

      const hitboxX = sx - hitboxW / 2;
      const hitboxY = sy + (size - hitboxH) / 2; // center vertically around sprite

      // Draw image centered on sprite center
      const imgX = sx - renderedImgW / 2;
      const imgY = sy;

      if (imgReady) {
        ctx.drawImage(playerImg, imgX, imgY, renderedImgW, renderedImgH);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(hitboxX, hitboxY, hitboxW, hitboxH);
      }

      // Border always matches hitbox (not image)
      const borderColor = hitboxColor(p);
      const borderW = Math.max(2, size * 0.025);
      ctx.save();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderW;
      if (p.isInvincible) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 120);
      }
      ctx.strokeRect(hitboxX, hitboxY, hitboxW, hitboxH);
      ctx.restore();

      // Name label above hitbox
      const name = p.username || "Anonymous";
      const fontSize = Math.max(10, Math.min(18, size / 6));
      ctx.font = `${fontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const labelY = hitboxY - 6;
      const textWidth = ctx.measureText(name).width;
      const bgW = textWidth + 8;
      const bgH = fontSize + 4;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(sx - bgW / 2, labelY - bgH, bgW, bgH);
      ctx.fillStyle = "#fff";
      ctx.fillText(name, sx, labelY - 2);

      // Health bar below hitbox
      const remoteHealth = Number.isFinite(p.health) ? p.health : MAX_HEALTH;
      const barW = hitboxW;
      const barH = Math.max(6, size * 0.07);
      drawHealthBar(
        ctx,
        hitboxX,
        hitboxY + hitboxH + 6,
        barW,
        barH,
        remoteHealth / MAX_HEALTH
      );
    }
  }

  // ── HUD ──────────────────────────────────────────────────────────────────
  drawMinimap(ctx);

  const hudX = 24;
  const hudW = Math.min(420, canvas.width * 0.55);
  const hpH = 30;
  const stH = 10;
  const gap = 6;
  const hpY = canvas.height - 50;
  const stY = hpY - stH - gap;

  drawHealthBar(ctx, hudX, hpY, hudW, hpH, health / MAX_HEALTH);
  drawStaminaBar(ctx, hudX, stY, hudW, stH, stamina, staminaCooldown);
  drawCrosshair(canvas, ctx);

  // ── Leaderboard overlay (Tab held) ───────────────────────────────────────
  if (tabHeld) {
    drawLeaderboard(canvas, ctx);
  }

  // ── Death screen ─────────────────────────────────────────────────────────
  if (isDead) {
    ctx.fillStyle = "rgba(180,0,0,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 96px Arial";
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillText("YOU DIED", canvas.width / 2 + 4, canvas.height / 2 - 36);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("YOU DIED", canvas.width / 2, canvas.height / 2 - 40);

    if (!canRespawn) {
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
      const bx = canvas.width / 2 - 100;
      const by = canvas.height / 2 + 85;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx + 3, by + 3, 200, 50);
      ctx.fillStyle = "#cc0000";
      ctx.fillRect(bx, by, 200, 50);
      ctx.strokeStyle = "#ff6666";
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, 200, 50);
      ctx.font = "bold 22px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("RESPAWN", canvas.width / 2, by + 25);

      ctx.font = "14px Arial";
      ctx.fillStyle = "#ffcccc";
      ctx.fillText("or press any key", canvas.width / 2, by + 65);
    }
  }
}
