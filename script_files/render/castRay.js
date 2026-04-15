import { getState } from "../player.js";
import { map, getGeometry } from "../map.js";

// castRay returns { dist, vertical, heightScale, yOffset, wallX }
// dist is RAW ray distance so render.js fish-eye fix works unchanged:
//   const dist = hit.dist * Math.cos(rayAngle - player.angle)

export function castRay(angle) {
  const { player } = getState();
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);

  // The tile the player is standing in — we always skip hits in this tile
  // so the ray never self-intersects with the player's own cell.
  const startTileX = Math.floor(player.x);
  const startTileY = Math.floor(player.y);

  let mapX = startTileX;
  let mapY = startTileY;

  const deltaDistX = Math.abs(dirX) < 1e-10 ? 1e30 : Math.abs(1 / dirX);
  const deltaDistY = Math.abs(dirY) < 1e-10 ? 1e30 : Math.abs(1 / dirY);

  let stepX, sideDistX;
  if (dirX < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaDistX; }
  else          { stepX =  1; sideDistX = (mapX + 1 - player.x) * deltaDistX; }

  let stepY, sideDistY;
  if (dirY < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaDistY; }
  else          { stepY =  1; sideDistY = (mapY + 1 - player.y) * deltaDistY; }

  const MAX_DIST = 20;

  // cosAngleDiff converts perpendicular dist → raw ray dist.
  const cosAngleDiff = Math.max(Math.abs(Math.cos(angle - player.angle)), 0.001);

  // If the player's start tile contains partial geometry (pillars, diagonals,
  // thin walls, doors, false walls, slabs), cast against that geometry first.
  const startChar = map[startTileY]?.[startTileX];
  const startGeo = startChar ? getGeometry(startChar) : null;
  if (startGeo && !(startGeo.type === "full" && startGeo.solid)) {
    const startHit = castStartTile(player, dirX, dirY, cosAngleDiff, startTileX, startTileY, startGeo);
    if (startHit) return startHit;
  }

  for (let guard = 0; guard < 300; guard++) {
    let side;
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }

    const perpDist = side === 0
      ? (mapX - player.x + (1 - stepX) / 2) / dirX
      : (mapY - player.y + (1 - stepY) / 2) / dirY;

    if (perpDist > MAX_DIST) break;
    if (perpDist <= 0) continue;

    const char = map[mapY]?.[mapX];
    if (!char || char === "-" || char === " ") continue;

    const geo = getGeometry(char);
    if (!geo) continue;

    const rawDist = perpDist / cosAngleDiff;

    // False walls: render like a normal full wall visually,
    // but collision (isWall) already returns false so the player walks through.
    if (geo.type === "full" && !geo.solid) {
      return {
        dist:        rawDist,
        vertical:    side === 0,
        heightScale: 1,
        yOffset:     0,
        wallX:       getWallX(player, dirX, dirY, mapX, mapY, side, perpDist),
        isFalseWall: true,
      };
    }

    if (geo.type === "full") {
      return {
        dist:        rawDist,
        vertical:    side === 0,
        heightScale: 1,
        yOffset:     0,
        wallX:       getWallX(player, dirX, dirY, mapX, mapY, side, perpDist),
      };
    }

    if (geo.type === "slab") {
      return {
        dist:        rawDist,
        vertical:    side === 0,
        heightScale: geo.heightScale,
        yOffset:     geo.yOffset,
        wallX:       getWallX(player, dirX, dirY, mapX, mapY, side, perpDist),
      };
    }

    if (geo.type === "door") {
      const hit = castDoor(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo);
      if (hit) return hit;
      continue;
    }

    if (geo.type === "diagonal") {
      const hit = castDiagonal(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo);
      if (hit) return hit;
      continue;
    }

    if (geo.type === "thin") {
      const hit = castThin(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo);
      if (hit) return hit;
      continue;
    }

    if (geo.type === "pillar") {
      const hit = castPillar(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo);
      if (hit) return hit;
      continue;
    }
  }

  return { dist: MAX_DIST, vertical: false, heightScale: 1, yOffset: 0, wallX: 0 };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWallX(player, dirX, dirY, mapX, mapY, side, perpDist) {
  if (side === 0) {
    const y = player.y + perpDist * dirY;
    return y - Math.floor(y);
  }
  const x = player.x + perpDist * dirX;
  return x - Math.floor(x);
}

function castDoor(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo) {
  let t, wallX;
  if (geo.axis === "x") {
    if (Math.abs(dirY) < 1e-10) return null;
    t = (mapY + 0.5 - player.y) / dirY;
    if (t <= 0) return null;
    wallX = player.x + t * dirX - mapX;
  } else {
    if (Math.abs(dirX) < 1e-10) return null;
    t = (mapX + 0.5 - player.x) / dirX;
    if (t <= 0) return null;
    wallX = player.y + t * dirY - mapY;
  }
  if (wallX < 0 || wallX > 1) return null;
  const open = geo.openAmount ?? 0;
  if (wallX < open) return null;
  return {
    dist:        t / cosAngleDiff,
    vertical:    geo.axis === "x",
    heightScale: 1,
    yOffset:     0,
    wallX:       wallX - open,
    isDoor:      true,
  };
}

function castDiagonal(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo) {
  let t;
  if (geo.slope === 1) {
    const denom = dirX + dirY;
    if (Math.abs(denom) < 1e-10) return null;
    t = (mapX + mapY + 1 - player.x - player.y) / denom;
  } else {
    const denom = dirX - dirY;
    if (Math.abs(denom) < 1e-10) return null;
    t = (mapX - mapY - player.x + player.y) / denom;
  }
  if (t <= 0) return null;
  const hitX = player.x + t * dirX;
  const hitY = player.y + t * dirY;
  if (hitX < mapX || hitX > mapX + 1 || hitY < mapY || hitY > mapY + 1) return null;
  return {
    dist:        t / cosAngleDiff,
    vertical:    false,
    heightScale: 1,
    yOffset:     0,
    wallX:       hitX - mapX,
    isDiagonal:  true,
  };
}

function castThin(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo) {
  const off   = geo.planeOffset ?? 0.45;
  const thick = geo.thickness   ?? 0.1;
  const candidates = [];

  for (const py of [mapY + off, mapY + off + thick]) {
    if (Math.abs(dirY) < 1e-10) continue;
    const t = (py - player.y) / dirY;
    if (t <= 0) continue;
    const hx = player.x + t * dirX;
    if (hx >= mapX && hx <= mapX + 1) candidates.push({ t, wallX: hx - mapX });
  }
  for (const px of [mapX + off, mapX + off + thick]) {
    if (Math.abs(dirX) < 1e-10) continue;
    const t = (px - player.x) / dirX;
    if (t <= 0) continue;
    const hy = player.y + t * dirY;
    if (hy >= mapY && hy <= mapY + 1) candidates.push({ t, wallX: hy - mapY });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.t - b.t);
  const { t, wallX } = candidates[0];
  return {
    dist:        t / cosAngleDiff,
    vertical:    false,
    heightScale: 1,
    yOffset:     0,
    wallX,
    isThin:      true,
  };
}

function castPillar(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo) {
  const cx = mapX + 0.5;
  const cy = mapY + 0.5;
  const r  = geo.radius ?? 0.2;
  const ox = player.x - cx;
  const oy = player.y - cy;
  const b    = 2 * (ox * dirX + oy * dirY);
  const c    = ox * ox + oy * oy - r * r;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / 2;
  const t2 = (-b + sq) / 2;
  const t  = t1 > 0 ? t1 : (t2 > 0 ? t2 : null);
  if (t === null) return null;
  const hitX  = player.x + t * dirX;
  const hitY  = player.y + t * dirY;
  const wallX = (Math.atan2(hitY - cy, hitX - cx) / (2 * Math.PI) + 1) % 1;
  return {
    dist:        t / cosAngleDiff,
    vertical:    false,
    heightScale: 1,
    yOffset:     0,
    wallX,
    isPillar:    true,
  };
}

function castTileBoundary(player, dirX, dirY, cosAngleDiff, mapX, mapY, heightScale, yOffset) {
  const tX = dirX > 0 ? (mapX + 1 - player.x) / dirX : dirX < 0 ? (mapX - player.x) / dirX : Infinity;
  const tY = dirY > 0 ? (mapY + 1 - player.y) / dirY : dirY < 0 ? (mapY - player.y) / dirY : Infinity;
  const candidates = [];
  if (tX > 0) candidates.push({ t: tX, vertical: true });
  if (tY > 0) candidates.push({ t: tY, vertical: false });
  if (!candidates.length) return null;

  candidates.sort((a, b) => a.t - b.t);
  const { t, vertical } = candidates[0];
  const hitX = player.x + t * dirX;
  const hitY = player.y + t * dirY;
  if (hitX < mapX || hitX > mapX + 1 || hitY < mapY || hitY > mapY + 1) return null;

  return {
    dist:        t / cosAngleDiff,
    vertical,
    heightScale,
    yOffset,
    wallX:       vertical ? hitY - mapY : hitX - mapX,
  };
}

function castStartTile(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo) {
  if (geo.type === "full") {
    return castTileBoundary(player, dirX, dirY, cosAngleDiff, mapX, mapY, 1, 0);
  }
  if (geo.type === "slab") {
    return castTileBoundary(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo.heightScale ?? 1, geo.yOffset ?? 0);
  }
  if (geo.type === "door") {
    return castDoor(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo);
  }
  if (geo.type === "diagonal") {
    return castDiagonal(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo);
  }
  if (geo.type === "thin") {
    return castThin(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo);
  }
  if (geo.type === "pillar") {
    return castPillar(player, dirX, dirY, cosAngleDiff, mapX, mapY, geo);
  }
  return null;
}