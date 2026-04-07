import { MINIMAP_SCALE, MINIMAP_PADDING } from "../constant.js";
import { map, mapStr } from "../map.js";
import { getState } from "../player.js";

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
      if (map[mapY]?.[mapX] === mapStr) {
        ctx.fillStyle = "#888";
        ctx.fillRect(
          startX + (x + VIEW_RADIUS - fracX) * MINIMAP_SCALE,
          startY + (y + VIEW_RADIUS - fracY) * MINIMAP_SCALE,
          MINIMAP_SCALE,
          MINIMAP_SCALE
        );
      }
    }
  }

  for (const id in others) {
    if (id === myId) continue;
    const p = others[id];
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

  // Direction
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
}
