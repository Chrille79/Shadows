// Corner filler overlay — plugs the transparent diamond gaps that appear
// where 4 rounded-corner block sprites meet in a tilemap.
//
// Call `collectCornerFillers(stage)` to get a list of filler positions,
// then render them as instances on a dedicated "filler" tile type after
// the main tile pass.

import { TILE_SIZE } from "../engine/renderer";
import type { Platform, Stage } from "./stage";

export interface FillerQuad {
  /** Center-X of the filler in world pixels. */
  x: number;
  /** Center-Y of the filler in world pixels. */
  y: number;
  /** Width in world pixels. Height equal. */
  size: number;
}

/** Size of the filler quad in world pixels. Scaled with tile size so the
 *  quad roughly matches the diamond gap between four rounded corners. */
const FILLER_SIZE = Math.round(TILE_SIZE * 0.22);

/**
 * Build a dense boolean occupancy grid from the stage's platforms.
 * occupancy[gy][gx] = true if the grid cell (gx, gy) is covered by any
 * solid platform.
 */
function buildOccupancy(platforms: Platform[], gw: number, gh: number): Uint8Array {
  const grid = new Uint8Array(gw * gh);
  for (const p of platforms) {
    const cx0 = Math.floor(p.x / TILE_SIZE);
    const cy0 = Math.floor(p.y / TILE_SIZE);
    const cx1 = Math.ceil((p.x + p.width) / TILE_SIZE);
    const cy1 = Math.ceil((p.y + p.height) / TILE_SIZE);
    for (let cy = cy0; cy < cy1; cy++) {
      if (cy < 0 || cy >= gh) continue;
      for (let cx = cx0; cx < cx1; cx++) {
        if (cx < 0 || cx >= gw) continue;
        grid[cy * gw + cx] = 1;
      }
    }
  }
  return grid;
}

/**
 * Scan inner grid corners; return a filler for every intersection where
 * all 4 surrounding cells are solid.
 *
 * Note: "solid" here is any non-empty platform, regardless of type. If you
 * want per-biome fillers, group platforms by atlas first and call this per
 * group.
 */
export function collectCornerFillers(stage: Stage): FillerQuad[] {
  const gw = Math.ceil(stage.worldWidth / TILE_SIZE);
  const gh = Math.ceil(stage.worldHeight / TILE_SIZE);
  const occ = buildOccupancy(stage.platforms, gw, gh);

  const out: FillerQuad[] = [];
  for (let gy = 1; gy < gh; gy++) {
    for (let gx = 1; gx < gw; gx++) {
      const tl = occ[(gy - 1) * gw + (gx - 1)];
      const tr = occ[(gy - 1) * gw + gx];
      const bl = occ[gy * gw + (gx - 1)];
      const br = occ[gy * gw + gx];
      if (tl && tr && bl && br) {
        out.push({
          x: gx * TILE_SIZE,
          y: gy * TILE_SIZE,
          size: FILLER_SIZE,
        });
      }
    }
  }
  return out;
}
