import type { SpriteRenderer } from '../engine/spriteRenderer';
import { loadTextureBitmap } from '../engine/textureLoader';
import { TILE_SIZE, WORLD_W, WORLD_H } from '../engine/renderer';
import { ALL_TYPES, getTileType, CORNER_FILLER_URL } from './tileTypes';
import { config } from '../config';
import { collectCornerFillers } from './cornerFillers';
import level001 from '../levels/level_001.json';
import grassOverlayUrl from '../assets/overlays/grass_overlay_mid.png?url';

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Tile type id from TILE_TYPES. Defaults to the first registered type. */
  type: string;
  /** When true, the grass overlay is drawn over this platform's exposed-top
   *  cells. Off by default so designers opt in per-platform in the editor. */
  grass?: boolean;
}

/**
 * A decoration sprite anchored in the world. `x, y` is the bottom-center of the
 * rendered sprite so decorations naturally "stand" on a surface. Sprites are
 * drawn at one tile height with aspect from the referenced type's srcRect.
 */
export interface Decoration {
  x: number;
  y: number;
  type: string;
}

interface TypeResources {
  bindGroup: GPUBindGroup;
  /** Source size (also the native texture size since tiles are whole PNGs). */
  srcW: number;
  srcH: number;
  /** Collidable tile (true) or standalone decoration sprite (false). */
  solid: boolean;
}

interface OverlayResources {
  cornerFiller?: { bindGroup: GPUBindGroup; w: number; h: number };
  grassOverlay?: { bindGroup: GPUBindGroup; w: number; h: number };
}

export interface Stage {
  /** World width in pixels. Per-level now; falls back to WORLD_W if missing. */
  worldWidth: number;
  /** World height in pixels. Per-level now; falls back to WORLD_H if missing. */
  worldHeight: number;
  platforms: Platform[];
  /** Drawn after solid tiles, before the player — player walks in front. */
  decorationsBack: Decoration[];
  /** Drawn after the player — player walks behind. */
  decorationsFront: Decoration[];
  typeResources: Map<string, TypeResources>;
  overlays: OverlayResources;
}

const LEVEL_STORAGE_KEY = 'shadows:level';

// Grass rendering sizes and the collision-rise for grass-flagged platforms
// all come from `config.grass` (see config.ts). Read on each call so dev
// console tweaks apply without a reload.

interface LevelFile {
  version: number;
  tileSize: number;
  worldWidth: number;
  worldHeight: number;
  platforms: Array<Partial<Platform> & { x: number; y: number; width: number; height: number }>;
  decorationsBack?: Array<{ x: number; y: number; type?: string }>;
  decorationsFront?: Array<{ x: number; y: number; type?: string }>;
}

export type { LevelFile };

function parseDecorations(items: LevelFile['decorationsBack']): Decoration[] {
  if (!Array.isArray(items)) return [];
  return items.map((d) => ({ x: d.x, y: d.y, type: getTileType(d.type).id }));
}

function stageFromFile(data: LevelFile): Stage {
  return {
    typeResources: new Map(),
    overlays: {},
    worldWidth: data.worldWidth ?? WORLD_W,
    worldHeight: data.worldHeight ?? WORLD_H,
    platforms: data.platforms.map((p) => ({
      x: p.x, y: p.y, width: p.width, height: p.height,
      type: getTileType(p.type).id,
      grass: p.grass === true,
    })),
    decorationsBack: parseDecorations(data.decorationsBack),
    decorationsFront: parseDecorations(data.decorationsFront),
  };
}

export function loadSavedStage(): Stage | null {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEVEL_STORAGE_KEY) : null;
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as LevelFile;
    if (!data || !Array.isArray(data.platforms) || data.platforms.length === 0) return null;
    return stageFromFile(data);
  } catch {
    return null;
  }
}

export function createStage(): Stage {
  return loadSavedStage() ?? createDefaultStage();
}

export function createDefaultStage(): Stage {
  return stageFromFile(level001 as LevelFile);
}

export async function loadStageTextures(stage: Stage, device: GPUDevice, sprites: SpriteRenderer) {
  // Cache one GPU texture per unique URL so multiple tile types share it.
  const texCache = new Map<string, { bindGroup: GPUBindGroup; w: number; h: number }>();

  async function loadOnce(url: string) {
    let entry = texCache.get(url);
    if (!entry) {
      const tex = await loadTextureBitmap(device, url);
      entry = {
        bindGroup: sprites.createTextureBindGroup(tex),
        w: tex.width,
        h: tex.height,
      };
      texCache.set(url, entry);
    }
    return entry;
  }

  // Only load textures actually referenced by this stage (platforms + decorations).
  const usedTypeIds = new Set<string>();
  for (const p of stage.platforms) usedTypeIds.add(p.type);
  for (const d of stage.decorationsBack) usedTypeIds.add(d.type);
  for (const d of stage.decorationsFront) usedTypeIds.add(d.type);

  await Promise.all(
    ALL_TYPES.filter((t) => usedTypeIds.has(t.id)).map(async (tt) => {
      const entry = await loadOnce(tt.url);
      stage.typeResources.set(tt.id, {
        bindGroup: entry.bindGroup,
        srcW: entry.w, srcH: entry.h,
        solid: tt.solid,
      });
    }),
  );

  // Overlay textures: corner filler and grass. Both are shared across all
  // block types and always loaded so the renderer can draw them regardless of
  // which blocks the stage uses.
  const [corner, grass] = await Promise.all([
    loadOnce(CORNER_FILLER_URL),
    loadOnce(grassOverlayUrl),
  ]);
  stage.overlays.cornerFiller = corner;
  stage.overlays.grassOverlay = grass;
}

export function renderStage(stage: Stage, sprites: SpriteRenderer, pass: GPURenderPassEncoder) {
  // Pass 1 — corner fillers drawn FIRST so the surrounding blocks occlude
  // everything except the transparent diamond gap at their shared corner.
  if (stage.overlays.cornerFiller) {
    const fillers = collectCornerFillers(stage);
    if (fillers.length > 0) {
      for (const f of fillers) {
        sprites.drawSprite({
          x: f.x - f.size / 2, y: f.y - f.size / 2,
          width: f.size, height: f.size,
          uvX: 0, uvY: 0, uvW: 1, uvH: 1,
          r: config.worldTint.r, g: config.worldTint.g, b: config.worldTint.b, a: 1,
        });
      }
      sprites.flushWithTexture(pass, stage.overlays.cornerFiller.bindGroup);
    }
  }

  // Pass 2 — each block type as a batch with its own texture.
  const byType = new Map<string, Platform[]>();
  for (const p of stage.platforms) {
    const list = byType.get(p.type);
    if (list) list.push(p);
    else byType.set(p.type, [p]);
  }

  for (const [typeId, platforms] of byType) {
    const res = stage.typeResources.get(typeId);
    if (!res) {
      for (const p of platforms) {
        sprites.drawSprite({
          x: p.x, y: p.y, width: p.width, height: p.height,
          r: 0.3, g: 0.25, b: 0.45, a: 1,
        });
      }
      sprites.flush(pass);
      continue;
    }

    // Blocks are square PNGs painted one per TILE_SIZE cell so the rounded
    // corners stay uniform even when platforms are wider than tall.
    for (const p of platforms) {
      let x = p.x;
      const end = p.x + p.width;
      while (x < end) {
        const w = Math.min(TILE_SIZE, end - x);
        const uvW = w / TILE_SIZE;
        sprites.drawSprite({
          x, y: p.y, width: w, height: p.height,
          uvX: 0, uvY: 0, uvW, uvH: 1,
          r: config.worldTint.r, g: config.worldTint.g, b: config.worldTint.b, a: 1,
        });
        x += TILE_SIZE;
      }
    }
    sprites.flushWithTexture(pass, res.bindGroup);
  }

  // Pass 3 — grass strip over every cell belonging to a platform with
  // `grass: true`. The flag is authoritative: if the designer marked a cell
  // grass it gets a grass surface even when another block is stacked right
  // above it, so a vertical stack of two grass-flagged blocks shows a grass
  // band between them as well as on the exposed top.
  if (stage.overlays.grassOverlay) {
    const hasGrass = stage.platforms.some((p) => p.grass);
    if (hasGrass) {
      const grass = stage.overlays.grassOverlay;
      const grassCopyW = config.grass.displayH * (grass.w / grass.h);
      const gw = Math.ceil(stage.worldWidth / TILE_SIZE);
      const gh = Math.ceil(stage.worldHeight / TILE_SIZE);

      // Mark which cells belong to a grass-flagged platform.
      const grassCells = new Uint8Array(gw * gh);
      for (const p of stage.platforms) {
        if (!p.grass) continue;
        const cx0 = Math.floor(p.x / TILE_SIZE);
        const cy0 = Math.floor(p.y / TILE_SIZE);
        const cx1 = Math.ceil((p.x + p.width) / TILE_SIZE);
        const cy1 = Math.ceil((p.y + p.height) / TILE_SIZE);
        for (let cy = cy0; cy < cy1; cy++) {
          if (cy < 0 || cy >= gh) continue;
          for (let cx = cx0; cx < cx1; cx++) {
            if (cx < 0 || cx >= gw) continue;
            grassCells[cy * gw + cx] = 1;
          }
        }
      }

      let drew = false;
      for (let cy = 0; cy < gh; cy++) {
        // Row-dependent phase shift so adjacent rows don't show the same
        // grass tufts stacked vertically. 317 is just a prime to spread the
        // phases evenly; any co-prime works.
        const rowPhase = ((cy * 317) % grassCopyW + grassCopyW) % grassCopyW;
        let cx = 0;
        while (cx < gw) {
          if (!grassCells[cy * gw + cx]) { cx++; continue; }
          let end = cx + 1;
          while (end < gw && grassCells[cy * gw + end]) end++;
          // Overhang the run on each end so grass hangs slightly past the
          // outer edge of the run, giving platforms an organic silhouette.
          const runX = cx * TILE_SIZE - config.grass.overhang;
          const runEnd = end * TILE_SIZE + config.grass.overhang;
          const topY = cy * TILE_SIZE - config.grass.topRise;
          // Each tiling copy spans [gx, gx + grassCopyW] in world space with
          // UV [0..1]. Clip to the run and recompute uv so the visible slice
          // starts at the correct point in the texture.
          let gx = runX - rowPhase;
          while (gx < runEnd) {
            const left = Math.max(gx, runX);
            const right = Math.min(gx + grassCopyW, runEnd);
            if (right > left) {
              const drawW = right - left;
              const uvX = (left - gx) / grassCopyW;
              const uvW = drawW / grassCopyW;
              sprites.drawSprite({
                x: left, y: topY, width: drawW, height: config.grass.displayH,
                uvX, uvY: 0, uvW, uvH: 1,
                r: config.worldTint.r, g: config.worldTint.g, b: config.worldTint.b, a: 1,
              });
            }
            gx += grassCopyW;
          }
          drew = true;
          cx = end;
        }
      }
      if (drew) sprites.flushWithTexture(pass, grass.bindGroup);
    }
  }
}

/**
 * Render a decoration layer. Each decoration is drawn at TILE_SIZE height with
 * natural aspect from its srcRect, anchored at bottom-center on `(d.x, d.y)`.
 */
export function renderDecorations(
  stage: Stage,
  decorations: Decoration[],
  sprites: SpriteRenderer,
  pass: GPURenderPassEncoder,
) {
  if (decorations.length === 0) return;

  const byType = new Map<string, Decoration[]>();
  for (const d of decorations) {
    const list = byType.get(d.type);
    if (list) list.push(d);
    else byType.set(d.type, [d]);
  }

  for (const [typeId, decos] of byType) {
    const res = stage.typeResources.get(typeId);
    if (!res) continue;

    // Decoration sprites (non-solid) render at their native source size in
    // world pixels — they aren't bound to the tile grid. Solid tile types used
    // as decorations still render at one tile height with natural aspect.
    const h = res.solid ? TILE_SIZE : res.srcH;
    const w = res.solid ? TILE_SIZE * (res.srcW / res.srcH) : res.srcW;

    for (const d of decos) {
      sprites.drawSprite({
        x: d.x - w / 2, y: d.y - h,
        width: w, height: h,
        uvX: 0, uvY: 0, uvW: 1, uvH: 1,
        r: config.worldTint.r, g: config.worldTint.g, b: config.worldTint.b, a: 1,
      });
    }
    sprites.flushWithTexture(pass, res.bindGroup);
  }
}
