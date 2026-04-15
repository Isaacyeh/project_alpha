import { MINIMAP_SCALE, MINIMAP_PADDING } from "../constant.js";
import { map, getGeometry } from "../map.js";
import { getState } from "../player.js";

// Colors for each geometry type on the minimap
const MINIMAP_COLORS = {
  "#": "#888888", // full wall — grey
  "F": "#888888", // false wall — dark blue (passable but visible)
  "/": "#888888", // diagonal NW→SE — gold
  "|": "#888888", // diagonal NE→SW — gold
  "P": "#888888", // pillar — cyan
};

function getMinimapColor(char) {
  return MINIMAP_COLORS[char] ?? null;
}

export function drawMinimap(ctx) {
  const { player, others, myId } = getState();
  const VIEW_RADIUS = 12;
  const startX = MINIMAP_PADDING;
  const startY = MINIMAP_PADDING;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(
    startX - 4,
    startY - 4,
    VIEW_RADIUS * 2 * MINIMAP_SCALE + 8,
    VIEW_RADIUS * 2 * MINIMAP_SCALE + 8
  );

  const centerX = Math.floor(player.x);
  const centerY = Math.floor(player.y);
  const fracX = player.x - centerX;
  const fracY = player.y - centerY;

  for (let y = -VIEW_RADIUS; y < VIEW_RADIUS; y++) {
    for (let x = -VIEW_RADIUS; x < VIEW_RADIUS; x++) {
      const mapX = centerX + x;
      const mapY = centerY + y;
      const char = map[mapY]?.[mapX];
      if (!char) continue;

      const color = getMinimapColor(char);
      if (!color) continue;

      const geo = getGeometry(char);
      const px = startX + (x + VIEW_RADIUS - fracX) * MINIMAP_SCALE;
      const py = startY + (y + VIEW_RADIUS - fracY) * MINIMAP_SCALE;
      const sz = MINIMAP_SCALE;

      ctx.fillStyle = color;

      if (geo?.type === "diagonal") {
        // Draw a diagonal line across the cell
        ctx.save();
        ctx.beginPath();
        if (geo.slope === 1) {
          // slope 1: "/" shape — bottom-left to top-right
          ctx.moveTo(px, py + sz);
          ctx.lineTo(px + sz, py);
        } else {
          // slope -1: "|" shape — top-left to bottom-right
          ctx.moveTo(px, py);
          ctx.lineTo(px + sz, py + sz);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

      } else if (geo?.type === "pillar") {
        // Small filled circle
        const r = (sz / 2) * 0.7;
        ctx.beginPath();
        ctx.arc(px + sz / 2, py + sz / 2, r, 0, Math.PI * 2);
        ctx.fill();

      } else if (geo?.type === "full" && !geo.solid) {
        // False wall — semi-transparent block with an X to show it's passable
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillRect(px, py, sz, sz);
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = "#7070cc";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 1, py + 1);
        ctx.lineTo(px + sz - 1, py + sz - 1);
        ctx.moveTo(px + sz - 1, py + 1);
        ctx.lineTo(px + 1, py + sz - 1);
        ctx.stroke();
        ctx.restore();

      } else {
        // Default: solid filled square (regular full walls)
        ctx.fillRect(px, py, sz, sz);
      }
    }
  }

  for (const id in others) {
    if (id === myId) continue;
    const p = others[id];
    if (p.sneaking) continue;
    const dx = p.x - player.x;
    const dy = p.y - player.y;
    if (Math.abs(dx) > VIEW_RADIUS || Math.abs(dy) > VIEW_RADIUS) continue;
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(
      startX + (dx + VIEW_RADIUS) * MINIMAP_SCALE,
      startY + (dy + VIEW_RADIUS) * MINIMAP_SCALE,
      3,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Local player dot — half opaque when sneaking
  ctx.globalAlpha = player.sneaking ? 0.4 : 1.0;
  ctx.fillStyle = "lime";
  ctx.beginPath();
  ctx.arc(
    startX + VIEW_RADIUS * MINIMAP_SCALE,
    startY + VIEW_RADIUS * MINIMAP_SCALE,
    4,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Direction indicator
  ctx.strokeStyle = "lime";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(
    startX + VIEW_RADIUS * MINIMAP_SCALE,
    startY + VIEW_RADIUS * MINIMAP_SCALE
  );
  ctx.lineTo(
    startX + (VIEW_RADIUS + Math.cos(player.angle) * 0.8) * MINIMAP_SCALE,
    startY + (VIEW_RADIUS + Math.sin(player.angle) * 0.8) * MINIMAP_SCALE
  );
  ctx.stroke();
  ctx.globalAlpha = 1.0;
}