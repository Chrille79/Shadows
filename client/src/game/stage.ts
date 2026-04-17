import type { SpriteRenderer } from '../engine/spriteRenderer';
import { loadTextureBitmap } from '../engine/textureLoader';
import { TILE_SIZE, WORLD_W, WORLD_H } from '../engine/renderer';
import { ALL_TYPES, getTileType } from './tileTypes';
import level001 from '../levels/level_001.json';

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Tile type id from TILE_TYPES. Defaults to the first registered type. */
  type: string;
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
  /** Width of the source rect in source pixels (for aspect calc). */
  srcW: number;
  srcH: number;
  /** Full texture size (for UV normalization). */
  texW: number;
  texH: number;
  /** Source rect origin in pixels. */
  srcX: number;
  srcY: number;
  /** Collidable tile (true) or standalone decoration sprite (false). */
  solid: boolean;
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
}

const LEVEL_STORAGE_KEY = 'shadows:level';

interface LevelFile {
  version: number;
  tileSize: number;
  worldWidth: number;
  worldHeight: number;
  platforms: Array<Partial<Platform> & { x: number; y: number; width: number; height: number }>;
  decorationsBack?: Array<{ x: number; y: number; type?: string }>;
  decorationsFront?: Array<{ x: number; y: number; type?: string }>;
}

function parseDecorations(items: LevelFile['decorationsBack']): Decoration[] {
  if (!Array.isArray(items)) return [];
  return items.map((d) => ({ x: d.x, y: d.y, type: getTileType(d.type).id }));
}

function stageFromFile(data: LevelFile): Stage {
  return {
    typeResources: new Map(),
    worldWidth: data.worldWidth ?? WORLD_W,
    worldHeight: data.worldHeight ?? WORLD_H,
    platforms: data.platforms.map((p) => ({
      x: p.x, y: p.y, width: p.width, height: p.height,
      type: getTileType(p.type).id,
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
  // Cache one GPU texture per unique atlas URL so multiple tile types share it.
  const texCache = new Map<string, { bindGroup: GPUBindGroup; w: number; h: number }>();

  // Only load textures actually referenced by this stage (platforms + decorations).
  const usedTypeIds = new Set<string>();
  for (const p of stage.platforms) usedTypeIds.add(p.type);
  for (const d of stage.decorationsBack) usedTypeIds.add(d.type);
  for (const d of stage.decorationsFront) usedTypeIds.add(d.type);

  await Promise.all(
    ALL_TYPES.filter((t) => usedTypeIds.has(t.id)).map(async (tt) => {
      let entry = texCache.get(tt.url);
      if (!entry) {
        const tex = await loadTextureBitmap(device, tt.url);
        entry = {
          bindGroup: sprites.createTextureBindGroup(tex),
          w: tex.width,
          h: tex.height,
        };
        texCache.set(tt.url, entry);
      }
      const rect = tt.srcRect ?? { x: 0, y: 0, w: entry.w, h: entry.h };
      stage.typeResources.set(tt.id, {
        bindGroup: entry.bindGroup,
        srcW: rect.w, srcH: rect.h,
        texW: entry.w, texH: entry.h,
        srcX: rect.x, srcY: rect.y,
        solid: tt.solid,
      });
    }),
  );
}

export function renderStage(stage: Stage, sprites: SpriteRenderer, pass: GPURenderPassEncoder) {
  // Group platforms by type so each type gets one flush with its texture.
  const byType = new Map<string, Platform[]>();
  for (const p of stage.platforms) {
    const list = byType.get(p.type);
    if (list) list.push(p);
    else byType.set(p.type, [p]);
  }

  for (const [typeId, platforms] of byType) {
    const res = stage.typeResources.get(typeId);
    if (!res) {
      // Texture not loaded — draw solid color fallback for this group.
      for (const p of platforms) {
        sprites.drawSprite({
          x: p.x, y: p.y, width: p.width, height: p.height,
          r: 0.3, g: 0.25, b: 0.45, a: 1,
        });
      }
      sprites.flush(pass);
      continue;
    }

    // UV bounds of this tile's subrect inside the atlas.
    const uvX0 = res.srcX / res.texW;
    const uvY0 = res.srcY / res.texH;
    const uvFullW = res.srcW / res.texW;
    const uvFullH = res.srcH / res.texH;

    for (const p of platforms) {
      // Keep source aspect: display tile width derived from its height.
      const tileW = p.height * (res.srcW / res.srcH);
      let x = p.x;
      const end = p.x + p.width;
      while (x < end) {
        const remaining = end - x;
        const w = Math.min(tileW, remaining);
        const frac = w / tileW; // 0..1 of the source rect used this draw
        sprites.drawSprite({
          x, y: p.y, width: w, height: p.height,
          uvX: uvX0, uvY: uvY0,
          uvW: uvFullW * frac, uvH: uvFullH,
          r: 1, g: 1, b: 1, a: 1,
        });
        x += tileW;
      }
    }
    sprites.flushWithTexture(pass, res.bindGroup);
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

    const uvX0 = res.srcX / res.texW;
    const uvY0 = res.srcY / res.texH;
    const uvW = res.srcW / res.texW;
    const uvH = res.srcH / res.texH;
    // Decoration sprites (non-solid) render at their native source size in
    // world pixels — they aren't bound to the tile grid. Solid tile types used
    // as decorations still render at one tile height with natural aspect.
    const h = res.solid ? TILE_SIZE : res.srcH;
    const w = res.solid ? TILE_SIZE * (res.srcW / res.srcH) : res.srcW;

    for (const d of decos) {
      sprites.drawSprite({
        x: d.x - w / 2, y: d.y - h,
        width: w, height: h,
        uvX: uvX0, uvY: uvY0, uvW, uvH,
        r: 1, g: 1, b: 1, a: 1,
      });
    }
    sprites.flushWithTexture(pass, res.bindGroup);
  }
}
