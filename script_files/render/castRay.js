import { getState } from "../player.js";
import { isWall } from "../map.js";

//rendering (walls)
export function castRay(angle) {
  const { player } = getState();
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);

  let d = 0;
  let prevX = player.x;
  let prevY = player.y;
  while (d < 20) {
    const x = player.x + cos * d;
    const y = player.y + sin * d;
    if (isWall(x, y)) {
      return { dist: d, vertical: Math.floor(x) !== Math.floor(prevX) };
    }
    prevX = x;
    prevY = y;
    d += 0.02;
  }
  return { dist: 20, vertical: false };
}
