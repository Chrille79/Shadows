// Registry of tile and decoration types usable by the level editor and the
// game. Solid tiles come from `src/assets/blocks/*.png` (excluding the special
// `block_corner_filler.png`). Non-solid decorations come from
// `src/assets/sprites/**/*.png`, with the sub-folder name used as the palette
// group. Drop a PNG in the right folder and it shows up — no codegen.

export interface TileType {
  id: string;
  name: string;
  /** Image URL (standalone PNG — one file per tile). */
  url: string;
  /** True if the tile is collidable; false = decoration (no collision). */
  solid: boolean;
  /** Palette grouping key for the editor — folder name. */
  group: string;
}

const blockModules = import.meta.glob('../assets/blocks/*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

const decorationModules = import.meta.glob('../assets/sprites/**/*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

function titleCase(s: string) {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function blocksFromGlob(): TileType[] {
  const out: TileType[] = [];
  for (const [path, url] of Object.entries(blockModules)) {
    const base = path.split('/').pop()!.replace(/\.png$/i, '');
    if (base === 'block_corner_filler') continue; // Overlay, not a paintable tile.
    out.push({ id: base, name: titleCase(base), url, solid: true, group: 'blocks' });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function decorationsFromGlob(): TileType[] {
  const out: TileType[] = [];
  for (const [path, url] of Object.entries(decorationModules)) {
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
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export const TILE_TYPES: TileType[] = blocksFromGlob();
export const DECORATION_TYPES: TileType[] = decorationsFromGlob();
export const ALL_TYPES: TileType[] = [...TILE_TYPES, ...DECORATION_TYPES];

export const DEFAULT_TILE_ID = TILE_TYPES[0]?.id ?? '';

export function getTileType(id: string | undefined): TileType {
  if (!id) return TILE_TYPES[0];
  return ALL_TYPES.find((t) => t.id === id) ?? TILE_TYPES[0];
}

/**
 * URL for the corner-filler overlay drawn at 4-block intersections. Not in the
 * palette — retrieved directly at render time.
 */
export const CORNER_FILLER_URL: string =
  blockModules['../assets/blocks/block_corner_filler.png'];
