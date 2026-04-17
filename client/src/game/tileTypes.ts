// Registry of tile and decoration types usable by the level editor and the
// game. Tiles are generated from atlases in src/assets/tiles/ by
// scripts/extract-tiles.mjs; decorations are hand-registered standalone PNGs
// from src/assets/sprites/.

export interface TileType {
  id: string;
  name: string;
  /** Image URL (either a standalone image or an atlas). */
  url: string;
  /** True if the tile is collidable; false = decoration (no collision). */
  solid: boolean;
  /** Optional atlas sub-rectangle in source pixels. When omitted, the whole image is used. */
  srcRect?: { x: number; y: number; w: number; h: number };
  /** Palette grouping key — atlas name for solid tiles, folder for decorations.
   *  Used by the editor to collapse related tiles under a `<details>` header. */
  group: string;
}

import { GENERATED_TILES } from './tileTypes.generated';

// Load every PNG under assets/sprites/ with Vite's glob import. Each entry's
// filename (without extension) becomes the type id & name.
const decorationModules = import.meta.glob('../assets/sprites/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function decorationsFromGlob(): TileType[] {
  const out: TileType[] = [];
  for (const [path, url] of Object.entries(decorationModules)) {
    // path looks like '../assets/sprites/trees/tree1.png'
    const base = path.split('/').pop()!.replace(/\.png$/i, '');
    const folder = path.split('/').slice(-2, -1)[0];
    out.push({
      id: `sprite_${folder}_${base}`,
      name: `${folder}/${base}`,
      url,
      solid: false,
      group: folder,
    });
  }
  // Stable order: folder then name.
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export const TILE_TYPES: TileType[] = [...GENERATED_TILES];
export const DECORATION_TYPES: TileType[] = decorationsFromGlob();
/** Combined list for id → type lookups. */
export const ALL_TYPES: TileType[] = [...TILE_TYPES, ...DECORATION_TYPES];

export const DEFAULT_TILE_ID = TILE_TYPES[0].id;

export function getTileType(id: string | undefined): TileType {
  if (!id) return TILE_TYPES[0];
  return ALL_TYPES.find((t) => t.id === id) ?? TILE_TYPES[0];
}
