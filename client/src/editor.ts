// Standalone 2D canvas level editor for Shadows.
// Paints a tile grid; saves/loads level data compatible with game/stage.ts.

import { WORLD_W, WORLD_H, TILE_SIZE } from './engine/renderer';
import { TILE_TYPES, DECORATION_TYPES, ALL_TYPES, DEFAULT_TILE_ID, getTileType } from './game/tileTypes';
import { config } from './config';
import grassOverlayUrl from './assets/overlays/grass_overlay_mid.png?url';
import level001 from './levels/level_001.json';
import './dev/settings'; // window.settings helpers — dev only.
import './dev/panel';    // In-page dev panel (backtick to toggle) — dev only.

const TILE = TILE_SIZE;
const HALF = TILE / 2;
// World dimensions are per-level now — constants are only the default. They
// and the derived grid sizes mutate via resizeWorld().
let worldW = WORLD_W;
let worldH = WORLD_H;
// Horizon line — where parallax bg images anchor their top in the running game.
// Defaults to 6 tiles above the bottom of the world.  Stored in the level file
// so designers can tune per level.
let groundY = worldH - 6 * TILE;
let COLS = Math.ceil(worldW / TILE);
let ROWS = Math.ceil(worldH / TILE);
// Decorations use a half-tile grid: four anchor points per solid tile. Each
// anchor point is the center-bottom of its half-cell, so a decoration painted
// in a half-cell stands on that cell's bottom edge.
let DECO_COLS = COLS * 2;
let DECO_ROWS = ROWS * 2;

export const LEVEL_STORAGE_KEY = 'shadows:level';
export const LEVEL_VERSION = 3;

// Per-frame sprite ceiling in the renderer (MAX_SPRITES in spriteRenderer.ts),
// reserving a small overhead for the player and any future HUD sprites.
const SPRITE_OVERHEAD_FIXED = 8;
function spriteBudget(): number {
  return 4096 - SPRITE_OVERHEAD_FIXED;
}

interface LevelPlatform {
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  grass?: boolean;
}

interface LevelDecoration {
  x: number;
  y: number;
  type: string;
}

interface LevelFile {
  version: number;
  tileSize: number;
  worldWidth: number;
  worldHeight: number;
  /** Horizon y in world px — parallax bg images anchor their top here. */
  groundY?: number;
  platforms: LevelPlatform[];
  decorationsBack?: LevelDecoration[];
  decorationsFront?: LevelDecoration[];
}

// Solid grid cells store the TILE_TYPES index + 1 (0 = empty).
let grid: Uint8Array = new Uint8Array(COLS * ROWS);
// Per-solid-cell grass flag. 1 = grass on this cell, 0 = off. Parallel to `grid`.
let grassGrid: Uint8Array = new Uint8Array(COLS * ROWS);
// Decoration grids — same encoding as `grid` but at half-tile resolution.
let gridBack: Uint8Array = new Uint8Array(DECO_COLS * DECO_ROWS);
let gridFront: Uint8Array = new Uint8Array(DECO_COLS * DECO_ROWS);

// When true, painting solid tiles also sets the grass flag on those cells.
// Toggle with the toolbar button or the G key.
let grassPaint = false;

type ActiveLayer = 'solid' | 'back' | 'front';
let activeLayer: ActiveLayer = 'solid';

const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Failed to get 2d canvas context for editor.');
}
canvas.width = worldW;
canvas.height = worldH;

// Display scale is adjustable with Ctrl+Scroll.
const MIN_SCALE = 0.1;
const MAX_SCALE = 3.0;
let displayScale = 0.5;
function applyDisplayScale() {
  canvas.style.width = `${worldW * displayScale}px`;
  canvas.style.height = `${worldH * displayScale}px`;
}
applyDisplayScale();

const statusEl = document.getElementById('status')!;
const hoverInfoEl = document.getElementById('hover-info')!;
const paintBtn = document.getElementById('tool-paint')!;
const eraseBtn = document.getElementById('tool-erase')!;
const panBtn = document.getElementById('tool-pan')!;
const paletteEl = document.getElementById('palette')!;
const wrap = document.getElementById('canvas-wrap') as HTMLDivElement;

type Tool = 'paint' | 'erase' | 'pan';
let tool: Tool = 'paint';
function updateCanvasCursor() {
  canvas.style.cursor = tool === 'pan'
    ? (panning ? 'grabbing' : 'grab')
    : 'crosshair';
}
// Index into ALL_TYPES (= [...TILE_TYPES, ...DECORATION_TYPES]). The palette
// only exposes the subset appropriate for the active layer, so this stays in
// the correct range for whatever paint mode the user is in.
let selectedTypeIndex = 0;

// Pre-load images for every registered type. Multiple types can share the
// same atlas URL — cache them.
const imageByUrl = new Map<string, HTMLImageElement>();
const tileImages: HTMLImageElement[] = ALL_TYPES.map((t) => {
  let img = imageByUrl.get(t.url);
  if (!img) {
    img = new Image();
    img.src = t.url;
    img.onload = () => draw();
    imageByUrl.set(t.url, img);
  }
  return img;
});

// Grass overlay texture — matches the in-game grass render so the editor
// preview looks the same as what the player sees.
const grassOverlayImg = new Image();
grassOverlayImg.src = grassOverlayUrl;
grassOverlayImg.onload = () => draw();

// Cloud sprites — drawn as <img> in the editor 2D canvas to mirror the
// in-game sprite pass.  Hill layers are fully procedural (sine waves in the
// game's WGSL shader) so they don't need any image loading here — we just
// re-derive the same math with Canvas2D fillPath below.
const cloud01Img = new Image();
cloud01Img.src = new URL('./assets/backgrounds/cloud_01.png', import.meta.url).href;
cloud01Img.onload = () => draw();
const cloud02Img = new Image();
cloud02Img.src = new URL('./assets/backgrounds/cloud_02.png', import.meta.url).href;
cloud02Img.onload = () => draw();

// View toggles — user can hide any preview layer to focus on tile editing.
let showSky = true;
let showHills = true;
let showClouds = true;
let showGrid = true;
// Grass rendering values come from the shared `config.grass` — same as the
// in-game grass pass in stage.ts — so the editor preview stays in sync when
// designers tweak via the dev console.

// Return source rect for a tile type (defaults to entire image once loaded).
function srcRectFor(typeIdx: number) {
  const img = tileImages[typeIdx];
  const w = img?.naturalWidth || 1, h = img?.naturalHeight || 1;
  return { x: 0, y: 0, w, h };
}

/** Return the palette set for the currently active layer. Each entry is a
 * pair `[typeIdx, TileType]` where `typeIdx` indexes into ALL_TYPES. */
function palettePool(): Array<[number, typeof ALL_TYPES[number]]> {
  if (activeLayer === 'solid') {
    return TILE_TYPES.map((t, i) => [i, t] as [number, typeof t]);
  }
  // Decorations: offset indices by TILE_TYPES.length so they address ALL_TYPES.
  return DECORATION_TYPES.map((t, i) => [TILE_TYPES.length + i, t] as [number, typeof t]);
}

// --- Palette UI ---
const PALETTE_ICON = 48;
const PALETTE_GROUP_KEY = 'shadows:editor:paletteGroups';
// Persist per-group open/closed state across layer switches and reloads so a
// user's collapsed groups stay collapsed.
const paletteGroupOpen: Record<string, boolean> = (() => {
  try {
    const raw = localStorage.getItem(PALETTE_GROUP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
})();
function savePaletteGroupState() {
  try { localStorage.setItem(PALETTE_GROUP_KEY, JSON.stringify(paletteGroupOpen)); }
  catch { /* ignore quota errors */ }
}

function buildPalette() {
  paletteEl.innerHTML = '';
  // Keep the heading from editor.html — re-create a lightweight one.
  const heading = document.createElement('h3');
  heading.textContent = activeLayer === 'solid' ? 'Tiles' : 'Decorations';
  paletteEl.appendChild(heading);

  const pool = palettePool();
  // If no entries exist for this layer (e.g. no decoration PNGs yet), show a
  // placeholder so the user understands why the palette is empty.
  if (pool.length === 0) {
    const msg = document.createElement('div');
    msg.style.cssText = 'color:#888;font-size:11px;padding:6px;';
    msg.textContent = 'No sprites registered. Drop PNGs into src/assets/sprites/<folder>/ and reload.';
    paletteEl.appendChild(msg);
    return;
  }

  // Group by TileType.group, preserving the pool's original order for both
  // the groups themselves and the entries inside each group.
  const groups = new Map<string, Array<[number, typeof ALL_TYPES[number]]>>();
  for (const entry of pool) {
    const key = entry[1].group;
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  for (const [groupName, entries] of groups) {
    const details = document.createElement('details');
    details.className = 'palette-group';
    // Default open; respect persisted state if any.
    const persisted = paletteGroupOpen[groupName];
    details.open = persisted === undefined ? true : persisted;
    details.addEventListener('toggle', () => {
      paletteGroupOpen[groupName] = details.open;
      savePaletteGroupState();
    });

    const summary = document.createElement('summary');
    summary.textContent = `${groupName} (${entries.length})`;
    details.appendChild(summary);

    const items = document.createElement('div');
    items.className = 'palette-group-items';
    details.appendChild(items);

    for (const [typeIdx, t] of entries) {
      const el = document.createElement('div');
      el.className = 'tile-entry' + (typeIdx === selectedTypeIndex ? ' active' : '');
      el.dataset.index = String(typeIdx);

      // Use a canvas so we can crop to the tile's srcRect.
      const ic = document.createElement('canvas');
      ic.width = PALETTE_ICON; ic.height = PALETTE_ICON;
      ic.style.width = `${PALETTE_ICON}px`; ic.style.height = `${PALETTE_ICON}px`;
      ic.style.imageRendering = 'pixelated';
      ic.style.background = '#111';
      const ictx = ic.getContext('2d')!;
      const drawIcon = () => {
        const img = tileImages[typeIdx];
        if (!img.complete || img.naturalWidth === 0) return;
        const r = srcRectFor(typeIdx);
        ictx.clearRect(0, 0, PALETTE_ICON, PALETTE_ICON);
        ictx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, PALETTE_ICON, PALETTE_ICON);
      };
      if (tileImages[typeIdx].complete) drawIcon();
      else tileImages[typeIdx].addEventListener('load', drawIcon);

      const label = document.createElement('div');
      label.className = 'name';
      label.textContent = t.name;

      el.appendChild(ic);
      el.appendChild(label);
      el.addEventListener('click', () => {
        selectedTypeIndex = typeIdx;
        document.querySelectorAll('.tile-entry').forEach((e) => e.classList.remove('active'));
        el.classList.add('active');
        tool = 'paint';
        paintBtn.classList.add('active');
        eraseBtn.classList.remove('active');
        draw();
      });
      items.appendChild(el);
    }
    paletteEl.appendChild(details);
  }
}
buildPalette();

// --- Grid ---
function cellIndex(cx: number, cy: number) {
  return cy * COLS + cx;
}
function setTile(cx: number, cy: number, typeIdx: number) {
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
  const i = cellIndex(cx, cy);
  // 0 = empty; otherwise store (typeIdx + 1)
  if (typeIdx < 0) {
    grid[i] = 0;
    grassGrid[i] = 0;
  } else {
    grid[i] = typeIdx + 1;
    grassGrid[i] = grassPaint ? 1 : 0;
  }
}
function getTile(cx: number, cy: number): number {
  return grid[cellIndex(cx, cy)]; // 0 = empty, else index+1
}
function countTiles(): number {
  let n = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) n++;
  return n;
}

// --- Decoration grid ---
function decoIndex(gx: number, gy: number) {
  return gy * DECO_COLS + gx;
}
function setDeco(layer: Uint8Array, gx: number, gy: number, typeIdx: number) {
  if (gx < 0 || gy < 0 || gx >= DECO_COLS || gy >= DECO_ROWS) return;
  layer[decoIndex(gx, gy)] = typeIdx < 0 ? 0 : typeIdx + 1;
}
function getDeco(layer: Uint8Array, gx: number, gy: number): number {
  return layer[decoIndex(gx, gy)];
}
function activeDecoGrid(): Uint8Array | null {
  if (activeLayer === 'back') return gridBack;
  if (activeLayer === 'front') return gridFront;
  return null;
}
// Anchor = bottom-center of the half-cell. A decoration painted in half-cell
// (gx, gy) has its sprite bottom at y = (gy+1)*HALF and is horizontally
// centered on (gx+0.5)*HALF.
function anchorXFor(gx: number) { return (gx + 0.5) * HALF; }
function anchorYFor(gy: number) { return (gy + 1) * HALF; }

function draw() {
  // Sky background — either a gradient matching the in-game sky pass, or
  // a flat fallback color when the sky view toggle is off (still readable
  // against grid lines).
  if (showSky) {
    // Preview the in-game vertical gradient (same colors as config.sky).
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, `rgb(${Math.round(config.sky.top.r * 255)},`
      + `${Math.round(config.sky.top.g * 255)},${Math.round(config.sky.top.b * 255)})`);
    grad.addColorStop(1, `rgb(${Math.round(config.sky.bottom.r * 255)},`
      + `${Math.round(config.sky.bottom.g * 255)},${Math.round(config.sky.bottom.b * 255)})`);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = '#1d1d28';
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Hills — procedural sine-wave ribbons (same math as hillsRenderer.ts's
  // WGSL shader).  No parallax in the editor; we sample the wave at raw
  // world-x so the preview matches how the game looks at camX = 0.
  if (showHills) {
    const drawWave = (layer: typeof config.hills.far) => {
      const { r, g, b, a } = layer.color;
      ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
      ctx.beginPath();
      const step = 8; // world-px between sample points — smooth enough at canvas scale
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x <= canvas.width; x += step) {
        const wave =
          Math.sin(x * layer.freq1 + layer.phase) * 0.6 +
          Math.sin(x * layer.freq2 + layer.phase * 1.7) * 0.4;
        const y = groundY - layer.baseOffset - wave * layer.amplitude;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();
    };
    drawWave(config.hills.far);
    drawWave(config.hills.near);
  }

  // Clouds live in the sky above groundY in world space — same anchors as
  // parallaxRenderer.ts clouds[] array.  Editor shows them at their drift=0
  // rest position; the game animates them.
  if (showClouds) {
    const GAME_W_PX = 1920;
    const cloudAnchors = [
      { img: cloud01Img, baseX: 400,  yOff: -900,  scale: 0.6 },
      { img: cloud02Img, baseX: 1300, yOff: -700,  scale: 0.5 },
      { img: cloud01Img, baseX: 2400, yOff: -1000, scale: 0.45 },
    ];
    for (const c of cloudAnchors) {
      if (!(c.img.complete && c.img.naturalWidth > 0)) continue;
      const w = c.img.naturalWidth * c.scale;
      const h = c.img.naturalHeight * c.scale;
      const y = groundY + c.yOff;
      // Repeat anchors across world width so the preview shows clouds along
      // the whole map, not just within the first GAME_W-band.
      for (let x0 = 0; x0 < canvas.width; x0 += GAME_W_PX) {
        ctx.drawImage(c.img, x0 + c.baseX, y, w, h);
      }
    }
  }

  // Grid lines
  if (showGrid) {
    ctx.strokeStyle = '#24243055';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= COLS; c++) {
      const x = c * TILE + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, ROWS * TILE);
    }
    for (let r = 0; r <= ROWS; r++) {
      const y = r * TILE + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(COLS * TILE, y);
    }
    ctx.stroke();
  }

  // Horizon line — where parallax bg images anchor in the running game.
  // Above this y the game shows pure sky gradient; below, hills/bg layers.
  ctx.strokeStyle = '#e8a533';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(0, groundY + 0.5); ctx.lineTo(canvas.width, groundY + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#e8a533';
  ctx.font = 'bold 18px ui-monospace, Consolas, monospace';
  ctx.fillText('horizon (ground Y)', 12, groundY - 8);

  // Decorations back — drawn before solid so tiles can occlude deco that
  // extends into the ground row (matches game render order).
  drawDecoLayer(gridBack);

  // Tiles
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const v = grid[cellIndex(cx, cy)];
      if (!v) continue;
      const idx = v - 1;
      const img = tileImages[idx];
      const px = cx * TILE, py = cy * TILE;
      if (img && img.complete && img.naturalWidth > 0) {
        const r = srcRectFor(idx);
        ctx.drawImage(img, r.x, r.y, r.w, r.h, px, py, TILE, TILE);
      } else {
        ctx.fillStyle = '#6a5a8a';
        ctx.fillRect(px, py, TILE, TILE);
      }
      ctx.strokeStyle = '#00000033';
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    }
  }

  // Grass overlays — rendered with the real grass PNG so the editor preview
  // matches the in-game render. Contiguous grass-flagged cells on the same
  // row are tiled under a single run for a seamless strip (same as the
  // runtime grass pass in stage.ts).
  if (grassOverlayImg.complete && grassOverlayImg.naturalWidth > 0) {
    const gImg = grassOverlayImg;
    const copyW = config.grass.displayH * (gImg.naturalWidth / gImg.naturalHeight);
    for (let cy = 0; cy < ROWS; cy++) {
      const rowPhase = ((cy * 317) % copyW + copyW) % copyW;
      let cx = 0;
      while (cx < COLS) {
        if (!grassGrid[cellIndex(cx, cy)]) { cx++; continue; }
        let end = cx + 1;
        while (end < COLS && grassGrid[cellIndex(end, cy)]) end++;
        const runX = cx * TILE - config.grass.overhang;
        const runEnd = end * TILE + config.grass.overhang;
        const topY = cy * TILE - config.grass.topRise;
        let gx = runX - rowPhase;
        while (gx < runEnd) {
          const left = Math.max(gx, runX);
          const right = Math.min(gx + copyW, runEnd);
          if (right > left) {
            const drawW = right - left;
            const srcX = ((left - gx) / copyW) * gImg.naturalWidth;
            const srcW = (drawW / copyW) * gImg.naturalWidth;
            ctx.drawImage(gImg,
              srcX, 0, srcW, gImg.naturalHeight,
              left, topY, drawW, config.grass.displayH);
          }
          gx += copyW;
        }
        cx = end;
      }
    }
  }

  // Decorations front (drawn after solid; player renders behind in-game).
  drawDecoLayer(gridFront);

  // Hover preview
  if (activeLayer === 'solid') {
    if (hoverCx >= 0 && hoverCy >= 0 && hoverCx < COLS && hoverCy < ROWS) {
      const px = hoverCx * TILE, py = hoverCy * TILE;
      if (tool === 'paint') {
        const img = tileImages[selectedTypeIndex];
        ctx.globalAlpha = 0.45;
        if (img && img.complete && img.naturalWidth > 0) {
          const r = srcRectFor(selectedTypeIndex);
          ctx.drawImage(img, r.x, r.y, r.w, r.h, px, py, TILE, TILE);
        } else {
          ctx.fillStyle = '#8ac';
          ctx.fillRect(px, py, TILE, TILE);
        }
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = tool === 'erase' ? '#ff6464' : '#ffdc64';
      ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
    }
  } else {
    if (hoverGx >= 0 && hoverGy >= 0 && hoverGx < DECO_COLS && hoverGy < DECO_ROWS) {
      const ax = anchorXFor(hoverGx);
      const ay = anchorYFor(hoverGy);
      if (tool === 'paint') {
        const img = tileImages[selectedTypeIndex];
        if (img && img.complete && img.naturalWidth > 0) {
          const r = srcRectFor(selectedTypeIndex);
          const selType = ALL_TYPES[selectedTypeIndex];
          const h = selType?.solid ? TILE : r.h;
          const w = selType?.solid ? TILE * (r.w / r.h) : r.w;
          ctx.globalAlpha = 0.45;
          ctx.drawImage(img, r.x, r.y, r.w, r.h, ax - w / 2, ay - h, w, h);
          ctx.globalAlpha = 1;
        }
      }
      // Half-cell rectangle highlight.
      ctx.lineWidth = 2;
      ctx.strokeStyle = tool === 'erase' ? '#ff6464' : '#ffdc64';
      ctx.strokeRect(hoverGx * HALF + 1, hoverGy * HALF + 1, HALF - 2, HALF - 2);
      // Anchor point dot.
      ctx.fillStyle = tool === 'erase' ? '#ff6464' : '#ffdc64';
      ctx.beginPath();
      ctx.arc(ax, ay, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const curType = ALL_TYPES[selectedTypeIndex]?.name ?? '—';
  const layerLabel = activeLayer === 'solid' ? 'Solid'
                    : activeLayer === 'back' ? 'Deco Back'
                    : 'Deco Front';
  const tileN = countTiles();
  const decoN = countDeco(gridBack) + countDeco(gridFront);
  const spriteN = tileN + decoN;
  const budget = spriteBudget();
  statusEl.textContent =
    `Sprites: ${spriteN} / ${budget} · Tiles: ${tileN} · Deco: ${decoN} · ${layerLabel} · Selected: ${curType}`;
  statusEl.style.color =
    spriteN >= budget ? '#ff6464' :
    spriteN >= 0.8 * budget ? '#ffdc64' : '';
}

function drawDecoLayer(layer: Uint8Array) {
  for (let gy = 0; gy < DECO_ROWS; gy++) {
    for (let gx = 0; gx < DECO_COLS; gx++) {
      const v = layer[decoIndex(gx, gy)];
      if (!v) continue;
      const idx = v - 1;
      const t = ALL_TYPES[idx];
      const img = tileImages[idx];
      const ax = anchorXFor(gx);
      const ay = anchorYFor(gy);
      if (img && img.complete && img.naturalWidth > 0) {
        const r = srcRectFor(idx);
        // Mirror the game: solid tile types placed as deco render at one tile
        // high with source aspect; true sprites render at their native size.
        const h = t?.solid ? TILE : r.h;
        const w = t?.solid ? TILE * (r.w / r.h) : r.w;
        ctx.drawImage(img, r.x, r.y, r.w, r.h, ax - w / 2, ay - h, w, h);
      } else {
        ctx.fillStyle = '#8a6a5a';
        ctx.fillRect(ax - HALF / 2, ay - HALF, HALF, HALF);
      }
    }
  }
}

function countDeco(layer: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < layer.length; i++) if (layer[i]) n++;
  return n;
}

// Count painted cells that would fall outside a proposed shrink target, so the
// user can be warned before losing content. `nc`/`nr` are in tile columns/rows.
function countOutside(nc: number, nr: number): number {
  let n = 0;
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      if ((cx >= nc || cy >= nr) && grid[cy * COLS + cx]) n++;
    }
  }
  const dnc = nc * 2, dnr = nr * 2;
  for (let gy = 0; gy < DECO_ROWS; gy++) {
    for (let gx = 0; gx < DECO_COLS; gx++) {
      if (gx >= dnc || gy >= dnr) {
        if (gridBack[gy * DECO_COLS + gx]) n++;
        if (gridFront[gy * DECO_COLS + gx]) n++;
      }
    }
  }
  return n;
}

// Reallocate all grids to a new world size, preserving as much content as
// fits. Cells outside the new bounds are dropped. All mutations in one place
// so callers only need to call this once.
function resizeWorld(newCols: number, newRows: number) {
  const oldGrid = grid, oldGrass = grassGrid, oldBack = gridBack, oldFront = gridFront;
  const oldCols = COLS, oldRows = ROWS;
  const oldDCols = DECO_COLS;

  worldW = newCols * TILE;
  worldH = newRows * TILE;
  COLS = newCols;
  ROWS = newRows;
  DECO_COLS = newCols * 2;
  DECO_ROWS = newRows * 2;

  grid = new Uint8Array(COLS * ROWS);
  grassGrid = new Uint8Array(COLS * ROWS);
  gridBack = new Uint8Array(DECO_COLS * DECO_ROWS);
  gridFront = new Uint8Array(DECO_COLS * DECO_ROWS);

  const copyCols = Math.min(oldCols, COLS);
  const copyRows = Math.min(oldRows, ROWS);
  for (let cy = 0; cy < copyRows; cy++) {
    for (let cx = 0; cx < copyCols; cx++) {
      grid[cy * COLS + cx] = oldGrid[cy * oldCols + cx];
      grassGrid[cy * COLS + cx] = oldGrass[cy * oldCols + cx];
    }
  }
  const copyDCols = copyCols * 2, copyDRows = copyRows * 2;
  for (let gy = 0; gy < copyDRows; gy++) {
    for (let gx = 0; gx < copyDCols; gx++) {
      gridBack[gy * DECO_COLS + gx] = oldBack[gy * oldDCols + gx];
      gridFront[gy * DECO_COLS + gx] = oldFront[gy * oldDCols + gx];
    }
  }

  canvas.width = worldW;
  canvas.height = worldH;

  fitZoomToWrap();
  draw();
}

// --- Mouse ---
let painting = false;
let paintMode: 'paint' | 'erase' = 'paint';
const paintedThisStroke = new Set<number>();
let hoverCx = -1, hoverCy = -1;  // tile-cell hover (solid layer)
let hoverGx = -1, hoverGy = -1;  // half-cell hover (deco layers)

// Pan state
let panning = false;
let panStartClientX = 0, panStartClientY = 0;
let panStartScrollLeft = 0, panStartScrollTop = 0;

function canvasPixelFromEvent(e: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) / rect.width * canvas.width;
  const sy = (e.clientY - rect.top) / rect.height * canvas.height;
  return { sx, sy };
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (tool === 'pan') {
    panning = true;
    panStartClientX = e.clientX;
    panStartClientY = e.clientY;
    panStartScrollLeft = wrap.scrollLeft;
    panStartScrollTop = wrap.scrollTop;
    updateCanvasCursor();
    e.preventDefault();
    return;
  }
  painting = true;
  paintMode = e.button === 2 ? 'erase' : tool;
  paintedThisStroke.clear();
  applyAt(e);
});
window.addEventListener('mouseup', () => {
  painting = false;
  paintedThisStroke.clear();
  if (panning) {
    panning = false;
    updateCanvasCursor();
  }
});
canvas.addEventListener('mousemove', (e) => {
  if (panning) {
    wrap.scrollLeft = panStartScrollLeft - (e.clientX - panStartClientX);
    wrap.scrollTop  = panStartScrollTop  - (e.clientY - panStartClientY);
    return;
  }
  const { sx, sy } = canvasPixelFromEvent(e);
  if (activeLayer === 'solid') {
    const cx = Math.floor(sx / TILE), cy = Math.floor(sy / TILE);
    if (cx !== hoverCx || cy !== hoverCy) {
      hoverCx = cx; hoverCy = cy;
      hoverGx = -1; hoverGy = -1;
      updateHoverInfo();
      draw();
    }
  } else {
    const gx = Math.floor(sx / HALF), gy = Math.floor(sy / HALF);
    if (gx !== hoverGx || gy !== hoverGy) {
      hoverGx = gx; hoverGy = gy;
      hoverCx = -1; hoverCy = -1;
      updateHoverInfo();
      draw();
    }
  }
  if (painting) applyAt(e);
});
canvas.addEventListener('mouseleave', () => {
  hoverCx = -1; hoverCy = -1;
  hoverGx = -1; hoverGy = -1;
  updateHoverInfo();
  draw();
});

function updateHoverInfo() {
  if (activeLayer === 'solid') {
    if (hoverCx < 0 || hoverCy < 0 || hoverCx >= COLS || hoverCy >= ROWS) {
      hoverInfoEl.textContent = '—';
      return;
    }
    const v = getTile(hoverCx, hoverCy);
    const tileName = v ? (ALL_TYPES[v - 1]?.name ?? '?') : 'empty';
    hoverInfoEl.textContent = `(${hoverCx}, ${hoverCy}) · ${tileName}`;
  } else {
    if (hoverGx < 0 || hoverGy < 0 || hoverGx >= DECO_COLS || hoverGy >= DECO_ROWS) {
      hoverInfoEl.textContent = '—';
      return;
    }
    const layer = activeDecoGrid()!;
    const v = getDeco(layer, hoverGx, hoverGy);
    const name = v ? (ALL_TYPES[v - 1]?.name ?? '?') : 'empty';
    hoverInfoEl.textContent = `½(${hoverGx}, ${hoverGy}) · ${name}`;
  }
}

function applyAt(e: MouseEvent) {
  const { sx, sy } = canvasPixelFromEvent(e);
  if (activeLayer === 'solid') {
    const cx = Math.floor(sx / TILE), cy = Math.floor(sy / TILE);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
    const key = cellIndex(cx, cy);
    if (paintedThisStroke.has(key)) return;
    paintedThisStroke.add(key);
    setTile(cx, cy, paintMode === 'paint' ? selectedTypeIndex : -1);
    draw();
  } else {
    const gx = Math.floor(sx / HALF), gy = Math.floor(sy / HALF);
    if (gx < 0 || gy < 0 || gx >= DECO_COLS || gy >= DECO_ROWS) return;
    // Offset key space per layer so strokes can't bleed across layers.
    const baseKey = decoIndex(gx, gy);
    const key = (activeLayer === 'back' ? 0x40000000 : 0x60000000) | baseKey;
    if (paintedThisStroke.has(key)) return;
    paintedThisStroke.add(key);
    const layer = activeDecoGrid()!;
    setDeco(layer, gx, gy, paintMode === 'paint' ? selectedTypeIndex : -1);
    draw();
  }
}

// --- Toolbar ---
function setTool(next: Tool) {
  tool = next;
  paintBtn.classList.toggle('active', next === 'paint');
  eraseBtn.classList.toggle('active', next === 'erase');
  panBtn.classList.toggle('active', next === 'pan');
  updateCanvasCursor();
  // Leaving pan mode while dragging is edge-case; release any hover preview.
  if (next === 'pan') {
    hoverCx = -1; hoverCy = -1;
    hoverGx = -1; hoverGy = -1;
    draw();
  }
}
paintBtn.addEventListener('click', () => setTool('paint'));
eraseBtn.addEventListener('click', () => setTool('erase'));
panBtn.addEventListener('click', () => setTool('pan'));

// --- Layer switcher ---
const layerBtns: Record<ActiveLayer, HTMLElement> = {
  solid: document.getElementById('layer-solid')!,
  back:  document.getElementById('layer-deco-back')!,
  front: document.getElementById('layer-deco-front')!,
};
function setActiveLayer(next: ActiveLayer) {
  activeLayer = next;
  for (const key of ['solid', 'back', 'front'] as const) {
    layerBtns[key].classList.toggle('active', key === next);
  }
  // Pick a selected type valid for the new palette set.
  const pool = palettePool();
  if (pool.length > 0) {
    // Keep the current selection if it's still in the pool; otherwise reset.
    if (!pool.some(([idx]) => idx === selectedTypeIndex)) {
      selectedTypeIndex = pool[0][0];
    }
  }
  buildPalette();
  // Clear stale hover — switching layer changes hover resolution.
  hoverCx = -1; hoverCy = -1;
  hoverGx = -1; hoverGy = -1;
  updateHoverInfo();
  draw();
}
layerBtns.solid.addEventListener('click', () => setActiveLayer('solid'));
layerBtns.back.addEventListener('click',  () => setActiveLayer('back'));
layerBtns.front.addEventListener('click', () => setActiveLayer('front'));

// --- Grass toggle ---
const grassBtn = document.getElementById('tool-grass')!;
function updateGrassBtn() {
  grassBtn.classList.toggle('active', grassPaint);
}
function setGrassPaint(next: boolean) {
  grassPaint = next;
  updateGrassBtn();
}
grassBtn.addEventListener('click', () => setGrassPaint(!grassPaint));
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'G') {
    // Ignore when the focus is a text input so the letter still types.
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    setGrassPaint(!grassPaint);
  }
});

// --- Dialog helpers ---
// `prompt()` and `confirm()` are blocked by Chrome inside cross-origin iframes
// (the Claude preview runs the editor that way), so we ship in-page dialogs
// that work everywhere.
const promptDialog = document.getElementById('prompt-dialog') as HTMLDialogElement;
const promptTitle = document.getElementById('prompt-title')!;
const promptMessage = document.getElementById('prompt-message')!;
const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
const promptCancel = document.getElementById('prompt-cancel')!;

function askText(message: string, initial: string, title = 'Input'): Promise<string | null> {
  return new Promise((resolve) => {
    promptTitle.textContent = title;
    promptMessage.textContent = message;
    promptInput.value = initial;
    let resolved = false;
    const finish = (value: string | null) => {
      if (resolved) return;
      resolved = true;
      promptDialog.close();
      cleanup();
      resolve(value);
    };
    const onCancel = () => finish(null);
    const onSubmit = (e: Event) => { e.preventDefault(); finish(promptInput.value); };
    const onEsc = () => finish(null);
    function cleanup() {
      promptCancel.removeEventListener('click', onCancel);
      promptDialog.removeEventListener('cancel', onEsc);
      promptDialog.querySelector('form')!.removeEventListener('submit', onSubmit);
    }
    promptCancel.addEventListener('click', onCancel);
    promptDialog.addEventListener('cancel', onEsc);
    promptDialog.querySelector('form')!.addEventListener('submit', onSubmit);
    promptDialog.showModal();
    promptInput.select();
  });
}

const confirmDialog = document.getElementById('confirm-dialog') as HTMLDialogElement;
const confirmTitle = document.getElementById('confirm-title')!;
const confirmMessage = document.getElementById('confirm-message')!;
const confirmCancel = document.getElementById('confirm-cancel')!;

function askConfirm(message: string, title = 'Confirm'): Promise<boolean> {
  return new Promise((resolve) => {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    let resolved = false;
    const finish = (value: boolean) => {
      if (resolved) return;
      resolved = true;
      confirmDialog.close();
      cleanup();
      resolve(value);
    };
    const onCancel = () => finish(false);
    const onSubmit = (e: Event) => { e.preventDefault(); finish(true); };
    const onEsc = () => finish(false);
    function cleanup() {
      confirmCancel.removeEventListener('click', onCancel);
      confirmDialog.removeEventListener('cancel', onEsc);
      confirmDialog.querySelector('form')!.removeEventListener('submit', onSubmit);
    }
    confirmCancel.addEventListener('click', onCancel);
    confirmDialog.addEventListener('cancel', onEsc);
    confirmDialog.querySelector('form')!.addEventListener('submit', onSubmit);
    confirmDialog.showModal();
  });
}

// Minimum world size. Below these the camera math breaks:
// - 15 cols × 132 = 1980 ≥ GAME_W (1920), so camera clamp stays non-negative.
// -  9 rows ×  132 = 1188 ≥ GAME_H (1080), same logic vertically.
const MIN_COLS = 15;
const MIN_ROWS = 9;
const MAX_DIM = 500;

document.getElementById('btn-world-size')!.addEventListener('click', async () => {
  const input = await askText(
    `World size in tiles (cols x rows). Min ${MIN_COLS} x ${MIN_ROWS}, max ${MAX_DIM} x ${MAX_DIM}.`,
    `${COLS} x ${ROWS}`,
    'World size',
  );
  if (!input) return;
  const m = input.match(/(\d+)\s*[x×,]\s*(\d+)/i);
  if (!m) { alert('Format: cols x rows, e.g. "80 x 44"'); return; }
  const nc = Math.max(MIN_COLS, Math.min(MAX_DIM, +m[1]));
  const nr = Math.max(MIN_ROWS, Math.min(MAX_DIM, +m[2]));
  if (nc < COLS || nr < ROWS) {
    const lost = countOutside(nc, nr);
    if (lost > 0 && !(await askConfirm(
      `Shrinking drops ${lost} sprite(s) outside new bounds. Continue?`,
      'Shrink world',
    ))) return;
  }
  resizeWorld(nc, nr);
  flashStatus(`World resized to ${nc} x ${nr} tiles (${worldW} x ${worldH} px)`);
});

// View menu — toggle preview layers.  Checkboxes close the menu on change
// via the existing menu-open handler, so we just flip the flag and redraw.
const viewLayerConfig: Array<[string, (v: boolean) => void, () => boolean]> = [
  ['layer-sky',    (v) => { showSky    = v; }, () => showSky],
  ['layer-hills',  (v) => { showHills  = v; }, () => showHills],
  ['layer-clouds', (v) => { showClouds = v; }, () => showClouds],
  ['layer-grid',   (v) => { showGrid   = v; }, () => showGrid],
];
for (const [id, set, get] of viewLayerConfig) {
  const cb = document.getElementById(id) as HTMLInputElement | null;
  if (!cb) continue;
  cb.checked = get();
  cb.addEventListener('change', () => { set(cb.checked); draw(); });
}

document.getElementById('btn-horizon')!.addEventListener('click', async () => {
  const rowsInput = await askText(
    `Horizon (ground-Y) in tile rows from top. Parallax bg images sit from here ` +
    `downward; above is pure sky gradient.`,
    `${Math.round(groundY / TILE)}`,
    'Horizon row',
  );
  if (!rowsInput) return;
  const rows = +rowsInput;
  if (!Number.isFinite(rows) || rows < 0 || rows > ROWS) {
    alert(`Row must be between 0 and ${ROWS}`);
    return;
  }
  groundY = Math.round(rows) * TILE;
  draw();
  flashStatus(`Horizon set to row ${Math.round(rows)} (y=${groundY}px)`);
});

document.getElementById('btn-clear')!.addEventListener('click', async () => {
  const label = activeLayer === 'solid' ? 'all tiles'
              : activeLayer === 'back'  ? 'decorations (back)'
              : 'decorations (front)';
  if (!(await askConfirm(`Clear ${label} on this layer?`, 'Clear layer'))) return;
  if (activeLayer === 'solid') { grid.fill(0); grassGrid.fill(0); }
  else activeDecoGrid()!.fill(0);
  draw();
});

document.getElementById('btn-save')!.addEventListener('click', () => {
  localStorage.setItem(LEVEL_STORAGE_KEY, JSON.stringify(serializeLevel()));
  flashStatus('Saved to localStorage');
});

document.getElementById('btn-export')!.addEventListener('click', () => {
  const json = JSON.stringify(serializeLevel(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'level.json'; a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-file')!.addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    loadLevel(JSON.parse(await file.text()));
    flashStatus(`Imported ${file.name}`);
  } catch (err) { alert(`Failed to import: ${err}`); }
  input.value = '';
});

document.getElementById('btn-play')!.addEventListener('click', () => {
  localStorage.setItem(LEVEL_STORAGE_KEY, JSON.stringify(serializeLevel()));
  window.location.href = './index.html';
});

function flashStatus(msg: string) {
  const orig = statusEl.textContent;
  statusEl.textContent = msg;
  statusEl.style.color = '';
  setTimeout(() => { statusEl.textContent = orig; draw(); }, 1200);
}

// --- Serialization ---
// Merge adjacent cells of the *same (type, grass)* pair in the same row into
// strips. Grass cells break the merge so a level with mixed grass/no-grass on
// the same tile type still serializes into separate platforms.
function serializeLevel(): LevelFile {
  const platforms: LevelPlatform[] = [];
  for (let cy = 0; cy < ROWS; cy++) {
    let runStart = -1;
    let runType = 0;
    let runGrass = 0;
    for (let cx = 0; cx <= COLS; cx++) {
      const v = cx < COLS ? getTile(cx, cy) : 0;
      const g = cx < COLS ? grassGrid[cellIndex(cx, cy)] : 0;
      const breakRun = runStart >= 0 && (v !== runType || g !== runGrass);
      if (breakRun) {
        const typeId = ALL_TYPES[runType - 1]?.id ?? DEFAULT_TILE_ID;
        const plat: LevelPlatform = {
          x: runStart * TILE, y: cy * TILE,
          width: (cx - runStart) * TILE, height: TILE,
          type: typeId,
        };
        if (runGrass) plat.grass = true;
        platforms.push(plat);
        runStart = -1;
      }
      if (runStart < 0 && v !== 0) {
        runStart = cx; runType = v; runGrass = g;
      }
    }
  }
  return {
    version: LEVEL_VERSION, tileSize: TILE,
    worldWidth: worldW, worldHeight: worldH,
    groundY,
    platforms,
    decorationsBack: serializeDeco(gridBack),
    decorationsFront: serializeDeco(gridFront),
  };
}

function serializeDeco(layer: Uint8Array): LevelDecoration[] {
  const out: LevelDecoration[] = [];
  for (let gy = 0; gy < DECO_ROWS; gy++) {
    for (let gx = 0; gx < DECO_COLS; gx++) {
      const v = layer[decoIndex(gx, gy)];
      if (!v) continue;
      const typeId = ALL_TYPES[v - 1]?.id ?? DEFAULT_TILE_ID;
      out.push({ x: anchorXFor(gx), y: anchorYFor(gy), type: typeId });
    }
  }
  return out;
}

function loadLevel(data: LevelFile) {
  if (!data) {
    grid.fill(0);
    grassGrid.fill(0);
    gridBack.fill(0);
    gridFront.fill(0);
    return;
  }
  // If the file carries explicit world dims and they differ from the current
  // editor state, reallocate the grids first so the imported content lands in
  // a correctly-sized world. Missing dims = keep current size (old levels).
  if (data.worldWidth && data.worldHeight) {
    const nc = Math.max(1, Math.round(data.worldWidth / TILE));
    const nr = Math.max(1, Math.round(data.worldHeight / TILE));
    if (nc !== COLS || nr !== ROWS) resizeWorld(nc, nr);
  }
  if (typeof data.groundY === 'number') {
    groundY = data.groundY;
  } else {
    groundY = worldH - 6 * TILE;
  }
  grid.fill(0);
  grassGrid.fill(0);
  gridBack.fill(0);
  gridFront.fill(0);
  if (Array.isArray(data.platforms)) {
    // setTile reads the current `grassPaint` toggle, so temporarily force it
    // to match whatever the incoming platform carries rather than the UI state.
    const prevGrass = grassPaint;
    for (const p of data.platforms) {
      const type = getTileType(p.type);
      const typeIdx = ALL_TYPES.indexOf(type);
      const cx0 = Math.round(p.x / TILE);
      const cy0 = Math.round(p.y / TILE);
      const cw = Math.round(p.width / TILE);
      const ch = Math.max(1, Math.round(p.height / TILE));
      grassPaint = p.grass === true;
      for (let cy = cy0; cy < cy0 + ch; cy++) {
        for (let cx = cx0; cx < cx0 + cw; cx++) setTile(cx, cy, typeIdx);
      }
    }
    grassPaint = prevGrass;
  }
  loadDecoLayer(data.decorationsBack, gridBack);
  loadDecoLayer(data.decorationsFront, gridFront);
  draw();
}

function loadDecoLayer(items: LevelDecoration[] | undefined, layer: Uint8Array) {
  if (!Array.isArray(items)) return;
  for (const d of items) {
    const type = getTileType(d.type);
    const typeIdx = ALL_TYPES.indexOf(type);
    // Invert anchorXFor/anchorYFor to recover half-cell coords.
    const gx = Math.round(d.x / HALF - 0.5);
    const gy = Math.round(d.y / HALF - 1);
    setDeco(layer, gx, gy, typeIdx);
  }
}

// --- Menu bar: click to open, click again / outside / item to close ---
for (const menu of document.querySelectorAll<HTMLElement>('#menubar .menu')) {
  const label = menu.querySelector<HTMLButtonElement>('.menu-label')!;
  label.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = menu.classList.contains('open');
    // Close any other open menus
    document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open'));
    if (!wasOpen) menu.classList.add('open');
  });
  // Close after activating any item — except items marked sticky (e.g.
  // toggleable layer visibility), which should leave the menu open.
  menu.querySelectorAll<HTMLElement>('.menu-items li').forEach((li) => {
    if (li.hasAttribute('data-sticky')) return;
    li.querySelectorAll<HTMLElement>('button, label').forEach((el) => {
      el.addEventListener('click', () => menu.classList.remove('open'));
    });
  });
}
document.addEventListener('click', (e) => {
  const t = e.target as Node;
  document.querySelectorAll('#menubar .menu.open').forEach((m) => {
    if (!m.contains(t)) m.classList.remove('open');
  });
});

// Restore last session, or fall back to the bundled default level.
const saved = localStorage.getItem(LEVEL_STORAGE_KEY);
if (saved) {
  try { loadLevel(JSON.parse(saved)); } catch { loadLevel(level001 as LevelFile); }
} else {
  loadLevel(level001 as LevelFile);
}

draw();

// Ctrl+Scroll zoom, anchored at the mouse position so the point under the
// cursor stays put across scale changes.
wrap.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const worldX = (e.clientX - rect.left) / displayScale;
  const worldY = (e.clientY - rect.top) / displayScale;
  // deltaY > 0 → scroll down → zoom out.
  const factor = Math.exp(-e.deltaY * 0.0015);
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, displayScale * factor));
  if (newScale === displayScale) return;
  displayScale = newScale;
  applyDisplayScale();
  // After resize, adjust scroll so the same world point sits under the cursor.
  const nr = canvas.getBoundingClientRect();
  wrap.scrollLeft += (nr.left + worldX * displayScale) - e.clientX;
  wrap.scrollTop  += (nr.top  + worldY * displayScale) - e.clientY;
}, { passive: false });

// Fit the whole world height into the scroll wrap so no vertical scrollbar is
// needed. Called on startup and after every world resize.
function fitZoomToWrap() {
  const availH = wrap.clientHeight - 8;
  const fitScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, availH / worldH));
  displayScale = fitScale;
  applyDisplayScale();
  wrap.scrollLeft = 0;
  wrap.scrollTop = 0;
}
fitZoomToWrap();
