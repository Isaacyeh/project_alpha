
import { FOV, JUMP_SCALE, MAX_HEALTH, PITCH_SCREEN_Y_SCALE, PROJECTILE_START_Z } from "../constant.js";
import { castRay } from "./castRay.js";
import { drawMinimap } from "./minimap.js";
import { getState, respawn } from "../player.js";
import { getCrosshairOptions } from "../crosshair.js";
import { drawBulletHolesIfEnabled } from "../bulletHole.js";
import { debugToggles } from "../debug.js";
 
// ── FPS Counter ───────────────────────────────────────────────────────────────
// Maintains rolling average of last 60 frame times for accurate FPS calculation
let lastFrameTime = performance.now();
const frameTimeSamples = [];
const maxSamples = 60;
let currentFPS = 0;
let currentFrameTimeMs = 0;
let debugThrottleEnabled = false;

function updateFPS() {
  const now = performance.now();
  const deltaTime = now - lastFrameTime;
  lastFrameTime = now;
  
  // Add frame time to rolling array
  frameTimeSamples.push(deltaTime);
  if (frameTimeSamples.length > maxSamples) {
    frameTimeSamples.shift();
  }
  
  // Calculate average FPS and frame time from rolling window
  const avgFrameTime = frameTimeSamples.reduce((a, b) => a + b, 0) / frameTimeSamples.length;
  currentFPS = Math.round(1000 / avgFrameTime);
  currentFrameTimeMs = avgFrameTime.toFixed(1);
}

// Debug throttle: artificially delay frame to test FPS counter
function applyDebugThrottle() {
  // Only throttle if FPS label toggle is enabled
  if (!debugThrottleEnabled || !debugToggles.fpsLabel.enabled) return;
  const targetFrameTime = 50; // 50ms = 20 FPS
  const start = performance.now();
  while (performance.now() - start < targetFrameTime) {
    // Busy-wait to consume CPU time
  }
}

// Toggle debug throttle with 'T' key (only when FPS label is enabled)
window.addEventListener("keydown", (e) => {
  if (e.key === "t" || e.key === "T") {
    if (!debugToggles.fpsLabel.enabled) {
      console.log("FPS counter must be enabled to use CPU throttle");
      return;
    }
    debugThrottleEnabled = !debugThrottleEnabled;
    console.log(`Debug throttle ${debugThrottleEnabled ? "ENABLED (20 FPS)" : "DISABLED"}`);
  }
});

// ── Sprite image cache ────────────────────────────────────────────────────────
const playerImages = new Map(); // id -> { img, url }
 
// Set of sprite URLs that should be compressed to 0.5 aspect ratio
const compressedSprites = new Set();
 
fetch("/sprites.json")
  .then((r) => r.json())
  .then((data) => {
    compressedSprites.add("https://www.clker.com/cliparts/a/4/1/d/1301963432622081819stick_figure%20(1).png");
    data.forEach((s) => compressedSprites.add(s.url));
  })
  .catch(() => {
    compressedSprites.add("https://www.clker.com/cliparts/a/4/1/d/1301963432622081819stick_figure%20(1).png");
  });
 
const DEFAULT_ASPECT = 0.5;
 
// ── Helpers ───────────────────────────────────────────────────────────────────
function getPlayerImage(id, spriteUrl) {
  if (!spriteUrl) return null;
  const existing = playerImages.get(id);
  if (existing && existing.url === spriteUrl) return existing.img;
  const img = new Image();
  img.__loaded = false; img.__error = false;
  img.onload  = () => { img.__loaded = true; };
  img.onerror = () => { img.__loaded = true; img.__error = true;
    console.warn(`Sprite failed to load for player ${id}:`, spriteUrl); };
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
  const pad = 2;
  ctx.fillStyle = "#666"; ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#111"; ctx.fillRect(x+pad, y+pad, width-pad*2, height-pad*2);
  ctx.fillStyle = "#d00"; ctx.fillRect(x+pad, y+pad, (width-pad*2)*ratio, height-pad*2);
}
 
function drawStaminaBar(ctx, x, y, width, height, stamina, staminaCooldown) {
  const ratio = Math.max(0, Math.min(1, stamina));
  const pad = 2;
  ctx.fillStyle = "#555"; ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#111"; ctx.fillRect(x+pad, y+pad, width-pad*2, height-pad*2);
  if (staminaCooldown > 0) {
    ctx.fillStyle = Math.sin(Date.now()/120) > 0 ? "#cc0000" : "#550000";
    ctx.fillRect(x+pad, y+pad, width-pad*2, height-pad*2);
  } else {
    ctx.fillStyle = "#e8e8a0";
    ctx.fillRect(x+pad, y+pad, (width-pad*2)*ratio, height-pad*2);
  }
}
 
function drawCrosshair(canvas, ctx) {
  const { opacity, image } = getCrosshairOptions();
  const cx = canvas.width / 2;
  const cy = canvas.height / 2; // always true screen centre, never pitched
  ctx.save();
  ctx.globalAlpha = opacity;
  if (image && image.complete && !image.__error) {
    const size = 34;
    ctx.drawImage(image, cx-size/2, cy-size/2, size, size);
  } else {
    ctx.fillStyle = "#000000";
    ctx.font = "bold 34px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
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
  if (!rows || !rows.length) return;
  const padX=28, padY=20, rowH=36, headerH=52;
  const colW=[220,90,90];
  const totalW = colW.reduce((a,b)=>a+b,0)+padX*2;
  const totalH = headerH+rows.length*rowH+padY*2;
  const startX = Math.floor((canvas.width-totalW)/2);
  const startY = Math.floor((canvas.height-totalH)/2);
  ctx.save();
  ctx.fillStyle="rgba(8,8,12,0.88)"; roundRect(ctx,startX,startY,totalW,totalH,10); ctx.fill();
  ctx.strokeStyle="rgba(180,180,210,0.35)"; ctx.lineWidth=1.5;
  roundRect(ctx,startX,startY,totalW,totalH,10); ctx.stroke();
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.font="bold 22px 'Courier New',monospace"; ctx.fillStyle="#c8c8d8";
  ctx.fillText("LEADERBOARD", startX+totalW/2, startY+padY+12);
  ctx.strokeStyle="rgba(180,180,210,0.2)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(startX+padX,startY+headerH); ctx.lineTo(startX+totalW-padX,startY+headerH); ctx.stroke();
  ctx.font="bold 12px 'Courier New',monospace"; ctx.fillStyle="#778899";
  ctx.textAlign="left"; ctx.fillText("PLAYER",startX+padX,startY+headerH+10);
  ctx.textAlign="center";
  ctx.fillText("KILLS",  startX+padX+colW[0]+colW[1]/2,           startY+headerH+10);
  ctx.fillText("DEATHS", startX+padX+colW[0]+colW[1]+colW[2]/2,   startY+headerH+10);
  rows.forEach((entry,i) => {
    const ry = startY+headerH+26+i*rowH;
    if(i%2===0){ctx.fillStyle="rgba(255,255,255,0.03)"; ctx.fillRect(startX+4,ry-rowH*0.4,totalW-8,rowH*0.88);}
    const rankColors=["#ffd700","#c0c0c0","#cd7f32"];
    ctx.font="bold 13px 'Courier New',monospace"; ctx.textAlign="center";
    ctx.fillStyle=rankColors[i]||"#556677"; ctx.fillText(`#${i+1}`,startX+padX+14,ry);
    ctx.textAlign="left"; ctx.fillStyle="#dde0e8"; ctx.font="14px 'Courier New',monospace";
    ctx.fillText((entry.username||"Anonymous").slice(0,20),startX+padX+36,ry);
    ctx.textAlign="center";
    ctx.fillStyle="#44cc88"; ctx.font="bold 14px 'Courier New',monospace";
    ctx.fillText(String(entry.kills||0),  startX+padX+colW[0]+colW[1]/2, ry);
    ctx.fillStyle="#cc5555";
    ctx.fillText(String(entry.deaths||0), startX+padX+colW[0]+colW[1]+colW[2]/2, ry);
  });
  ctx.font="11px 'Courier New',monospace"; ctx.fillStyle="rgba(150,150,170,0.5)"; ctx.textAlign="center";
  ctx.fillText("Release TAB to close", startX+totalW/2, startY+totalH-10);
  ctx.restore();
}
 
function roundRect(ctx,x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}
 
// ── Tab / respawn ─────────────────────────────────────────────────────────────
let tabHeld = false;
window.addEventListener("keydown", (e) => { if(e.key==="Tab"){e.preventDefault(); tabHeld=true;} });
window.addEventListener("keyup",   (e) => { if(e.key==="Tab"){e.preventDefault(); tabHeld=false;} });
 
let respawnListenerAdded = false;
function setupRespawnButton(canvas) {
  if (respawnListenerAdded) return;
  respawnListenerAdded = true;
  canvas.addEventListener("click", (e) => {
    const state = getState();
    if (!state.isDead || !state.canRespawn) return;
    const rect = canvas.getBoundingClientRect();
    // Scale CSS pixel coords to logical canvas coords (800×500)
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;
    const bx = canvas.width/2-100, by = canvas.height/2+85;
    if (mx>=bx && mx<=bx+200 && my>=by && my<=by+50) respawn();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key==="Tab") return;
    const state = getState();
    if (state.isDead && state.canRespawn) respawn();
  });
}
 
// ── Main render ───────────────────────────────────────────────────────────────
export function render(canvas, ctx) {
  applyDebugThrottle();
  setupRespawnButton(canvas);
  const {
    player, z, pitch, others, myId, projectiles,
    health, isDead, deathTimer, canRespawn, stamina, staminaCooldown,
    networkRttMs, networkJitterMs, lastPongAt,
  } = getState();
 
  const rays       = canvas.width;
  const currentFOV = FOV; // live binding updated by FOV slider
  const jumpOffset = z * JUMP_SCALE;
 
  // Fixed horizon — pitch does NOT shift this.
  const horizon     = canvas.height / 2 + jumpOffset;
  // Pitch translate: positive pitch (look down) shifts scene up on screen.
  const pitchPixels = pitch * canvas.height * PITCH_SCREEN_Y_SCALE;
  const extraPad    = Math.abs(pitchPixels) + 4;
 
  // Crosshair in scene coords (inside the translate):
  //   screen Y = canvas.height/2  ->  scene Y = canvas.height/2 + pitchPixels
  const crosshairSceneY = canvas.height / 2 + pitchPixels;
 
  // ── Begin pitched scene ───────────────────────────────────────────────────
  ctx.save();
  ctx.translate(0, -pitchPixels);
 
  // Sky
  ctx.fillStyle = "#333";
  ctx.fillRect(0, -extraPad, canvas.width, horizon + extraPad);
 
  // ── Walls + per-column floor fill ─────────────────────────────────────────
  const depth = new Array(rays);
  let prevTileX = Math.floor(player.x);
  let prevTileY = Math.floor(player.y);
 
  for (let i = 0; i < rays; i++) {
    const rayAngle = player.angle - currentFOV/2 + (i/rays)*currentFOV;
    const hit      = castRay(rayAngle);
    const dist     = hit.dist * Math.cos(rayAngle - player.angle);
    const wallH    = canvas.height / Math.max(dist, 0.0001);
    const drawH    = wallH * (hit.heightScale ?? 1);
    const yShift   = wallH * (hit.yOffset ?? 0);
    depth[i] = dist;
 
    const wallTop    = horizon - drawH/2 + yShift;
    const wallBottom = horizon + drawH/2 + yShift;
 
    // Per-column floor fill: starts exactly at wall bottom → no gap → no curve
    const floorH = canvas.height + extraPad - wallBottom;
    if (floorH > 0) { ctx.fillStyle="#555"; ctx.fillRect(i, wallBottom, 1, floorH); }
 
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(i, wallTop, 1, drawH);
 
    const hitX  = player.x + Math.cos(rayAngle)*hit.dist;
    const hitY  = player.y + Math.sin(rayAngle)*hit.dist;
    const tileX = Math.floor(hitX), tileY = Math.floor(hitY);
    if (tileX!==prevTileX || tileY!==prevTileY) {
      ctx.fillStyle="#000000"; ctx.fillRect(i, wallTop, 1, drawH);
    }
    prevTileX=tileX; prevTileY=tileY;
  }
 
  // ── Bullet holes ──────────────────────────────────────────────────────────
  drawBulletHolesIfEnabled(canvas, ctx, player, depth, horizon, currentFOV);
 
  // ── Sprites (projectiles + remote players) ────────────────────────────────
  // Collect ALL projectiles: local player's + every other player's.
  // Other players' bullets arrive via the network in others[id].projectiles.
  // We now render them for ALL players so you can see incoming fire.
  const allProjectiles = [...projectiles];
  for (const id in others) {
    if (id === myId) continue;
    allProjectiles.push(...(others[id].projectiles || []));
  }
 
  const sprites = [];
  for (const proj of allProjectiles) sprites.push({ type:"projectile", data:proj });
  for (const id  in others) {
    if (id === myId) continue;
    sprites.push({ type:"player", id, data:others[id] });
  }
 
  sprites.sort((a,b) => {
    const dA = Math.hypot(a.data.x-player.x, a.data.y-player.y);
    const dB = Math.hypot(b.data.x-player.x, b.data.y-player.y);
    return dB-dA;
  });
 
  for (const sprite of sprites) {
    if (sprite.type === "projectile") {
      const proj = sprite.data;
      const dx = proj.x-player.x, dy = proj.y-player.y;
      const rawDist = Math.hypot(dx, dy);
 
      const isLocal = projectiles.some(p => p.id === proj.id);
 
      const angle = Math.atan2(dy,dx) - player.angle;
      const norm  = Math.atan2(Math.sin(angle), Math.cos(angle));
      if (Math.abs(norm) > currentFOV/2) continue;
 
      const sx       = (0.5 + norm/currentFOV)*canvas.width;
      const di       = Math.floor(sx);
      const perpDist = rawDist * Math.cos(norm);
      if (di < 0 || di >= depth.length) continue;
      if (!isLocal && depth[di] < perpDist) continue;
 
      const radiusDist = Math.max(perpDist, 0.55);
      const radius = Math.min(8, Math.max(1, canvas.height / Math.max(radiusDist * 20, 0.0001)));
 
      let bulletSy;
      if (isLocal) {
        // Local bullet: always at crosshair scene Y (pitch-locked, no Z drift)
        bulletSy = crosshairSceneY;
      } else {
        // Other player's bullet: use world z for vertical position so it
        // appears to travel from where they fired it.
        const wallH = canvas.height / Math.max(perpDist, 0.0001);
        const eyeZ  = 0.5;
        const dz    = eyeZ - (proj.z || 0);
        bulletSy = horizon + dz * wallH;
      }
 
      drawSphere(ctx, sx, bulletSy, radius);
 
    } else {
      // Remote player sprite
      const p = sprite.data;
      const dx=p.x-player.x, dy=p.y-player.y;
      const rawDist = Math.hypot(dx,dy);
      const angle = Math.atan2(dy,dx)-player.angle;
      const norm  = Math.atan2(Math.sin(angle),Math.cos(angle));
 
      const sx       = (0.5+norm/currentFOV)*canvas.width;
      const perpDist = rawDist*Math.cos(norm);
 
      const playerImg = getPlayerImage(sprite.id, p.sprite);
      const imgReady  = playerImg&&playerImg.complete&&!playerImg.__error&&playerImg.naturalWidth>0;
      const imgAspect = imgReady
        ? (compressedSprites.has(p.sprite) ? 0.5 : playerImg.naturalWidth/playerImg.naturalHeight)
        : DEFAULT_ASPECT;
 
      const viewDist  = Math.max(rawDist,0.0001);
      const size      = canvas.height/viewDist;
      const wallH     = canvas.height/viewDist;
      const eyeZ      = 0.5, spriteZ = (p.z||0)+0.5;
      const sy        = horizon + (eyeZ-spriteZ)*wallH - size/2;
      const renderedW = size*imgAspect, renderedH = size;
      const hitboxW   = Math.max(size*DEFAULT_ASPECT, renderedW);
      const hitboxH   = Math.max(size, renderedH);
      const hitboxX   = sx-hitboxW/2;
      const hitboxY   = sy+(size-hitboxH)/2;

      const imageX    = sx-renderedW/2;
      const leftEdge  = imageX;
      const rightEdge = imageX + renderedW;
      if (rightEdge < 0 || leftEdge > canvas.width) continue;

      const visibleLeft  = Math.max(0, Math.floor(leftEdge));
      const visibleRight = Math.min(canvas.width - 1, Math.ceil(rightEdge - 1));
      const sampleX      = Math.min(visibleRight, Math.max(visibleLeft, Math.floor(sx)));
      const si           = Math.max(0, Math.min(depth.length - 1, sampleX));
      if (depth[si] < perpDist) continue;
 
      if (imgReady) {
        ctx.drawImage(playerImg, sx-renderedW/2, sy, renderedW, renderedH);
      } else {
        ctx.fillStyle="rgba(255,255,255,0.15)";
        ctx.fillRect(hitboxX,hitboxY,hitboxW,hitboxH);
      }
 
      ctx.save();
      ctx.strokeStyle=hitboxColor(p);
      ctx.lineWidth=Math.max(2,size*0.025);
      if(p.isInvincible) ctx.globalAlpha=0.5+0.5*Math.sin(Date.now()/120);
      ctx.strokeRect(hitboxX,hitboxY,hitboxW,hitboxH);
      ctx.restore();
 
      // Name label
      const name=p.username||"Anonymous";
      const fontSize=Math.max(10,Math.min(18,size/6));
      ctx.font=`${fontSize}px Arial`; ctx.textAlign="center"; ctx.textBaseline="bottom";
      const labelY=hitboxY-6, tw=ctx.measureText(name).width;
      ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.fillRect(sx-tw/2-4,labelY-fontSize-4,tw+8,fontSize+4);
      ctx.fillStyle="#fff"; ctx.fillText(name,sx,labelY-2);
 
      // Health bar
      const remoteHealth=Number.isFinite(p.health)?p.health:MAX_HEALTH;
      drawHealthBar(ctx,hitboxX,hitboxY+hitboxH+6,hitboxW,Math.max(6,size*0.07),remoteHealth/MAX_HEALTH);
    }
  }
 
  // ── End pitched scene ─────────────────────────────────────────────────────
  ctx.restore();
 
  // ── HUD (screen space — never pitched) ───────────────────────────────────
  drawMinimap(ctx);
  const hudX=24, hudW=Math.min(420,canvas.width*0.55);
  const hpH=30, stH=10, gap=6, hpY=canvas.height-50;
  drawHealthBar(ctx,hudX,hpY,hudW,hpH,health/MAX_HEALTH);
  drawStaminaBar(ctx,hudX,hpY-stH-gap,hudW,stH,stamina,staminaCooldown);
  drawCrosshair(canvas,ctx);
 
  // ── Update and draw pitch + FPS display ──────────────────────────────────────
  updateFPS();
  
  let yOffset = 10;
  
  // Show FPS label only when toggle is enabled (FIRST)
  if (debugToggles.fpsLabel.enabled) {
    ctx.save(); ctx.font="12px monospace"; ctx.fillStyle="rgba(200,200,200,0.6)";
    ctx.textAlign="right"; ctx.textBaseline="top";
    ctx.fillText(`${currentFPS} FPS (${currentFrameTimeMs}ms)`,canvas.width-10,yOffset);
    ctx.restore();
    yOffset += 14;
  }
  
  // Show throttle indicator if debug throttle is active (SECOND - only when FPS label enabled)
  if (debugThrottleEnabled && debugToggles.fpsLabel.enabled) {
    ctx.save(); ctx.font="bold 12px monospace"; ctx.fillStyle="#ff6666";
    ctx.textAlign="right"; ctx.textBaseline="top";
    ctx.fillText("[DEBUG THROTTLE ON - Press T to disable]",canvas.width-10,yOffset);
    ctx.restore();
    yOffset += 14;
  }
  
  // Show pitch label only when toggle is enabled (THIRD)
  const pitchShowing = debugToggles.pitchLabel.enabled && Math.abs(pitch)>0.04;
  if (pitchShowing) {
    const deg=Math.round(pitch*(180/Math.PI));
    ctx.save(); ctx.font="12px monospace"; ctx.fillStyle="rgba(200,200,200,0.6)";
    ctx.textAlign="right"; ctx.textBaseline="top";
    ctx.fillText(`${deg>0?"↓":"↑"}${Math.abs(deg)}°`,canvas.width-10,yOffset);
    ctx.restore();
    yOffset += 14;
  }

  if (debugToggles.networkLagLabel.enabled) {
    let label = "NET --";
    let color = "rgba(200,200,200,0.6)";
    const stale = !lastPongAt || (Date.now() - lastPongAt) > 5000;
    if (stale) {
      label = "NET timeout";
      color = "#ff6666";
    } else if (Number.isFinite(networkRttMs)) {
      const rtt = Math.round(networkRttMs);
      const jitter = Number.isFinite(networkJitterMs) ? Math.round(networkJitterMs) : 0;
      label = `NET ${rtt}ms (j${jitter})`;
      if (rtt <= 60) color = "#7bd88f";
      else if (rtt <= 120) color = "#f3d47a";
      else color = "#ff6666";
    }
    ctx.save(); ctx.font="12px monospace"; ctx.fillStyle=color;
    ctx.textAlign="right"; ctx.textBaseline="top";
    ctx.fillText(label,canvas.width-10,yOffset);
    ctx.restore();
  }
  
 
  if (tabHeld) drawLeaderboard(canvas,ctx);
 
  // ── Death screen ──────────────────────────────────────────────────────────
  if (isDead) {
    ctx.fillStyle="rgba(180,0,0,0.55)"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.font="bold 96px Arial";
    ctx.fillStyle="rgba(0,0,0,0.4)"; ctx.fillText("YOU DIED",canvas.width/2+4,canvas.height/2-36);
    ctx.fillStyle="#ffffff";         ctx.fillText("YOU DIED",canvas.width/2,  canvas.height/2-40);
    if (!canRespawn) {
      const s=Math.ceil((300-deathTimer)/60);
      ctx.font="bold 28px Arial";
      ctx.fillStyle="rgba(0,0,0,0.4)"; ctx.fillText(`Respawn available in ${s}...`,canvas.width/2+2,canvas.height/2+42);
      ctx.fillStyle="#ffcccc";         ctx.fillText(`Respawn available in ${s}...`,canvas.width/2,  canvas.height/2+40);
    } else {
      const bx=canvas.width/2-100, by=canvas.height/2+85;
      ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(bx+3,by+3,200,50);
      ctx.fillStyle="#cc0000";          ctx.fillRect(bx,by,200,50);
      ctx.strokeStyle="#ff6666"; ctx.lineWidth=2; ctx.strokeRect(bx,by,200,50);
      ctx.font="bold 22px Arial"; ctx.fillStyle="#ffffff"; ctx.fillText("RESPAWN",canvas.width/2,by+25);
      ctx.font="14px Arial"; ctx.fillStyle="#ffcccc"; ctx.fillText("or press any key",canvas.width/2,by+65);
    }
  }
}