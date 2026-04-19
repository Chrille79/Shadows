# Shadows — project guide

2D platformer. WebGPU client (`client/`) + ASP.NET server (`Shadows.Server/`).
Client uses Vite + TypeScript. All game work lives in `client/src/`.

## Entry points

- `client/index.html` → `src/main.ts` — the game
- `client/editor.html` → `src/editor.ts` — standalone level editor (2D canvas, not WebGPU)

Both are declared as Vite inputs in `client/vite.config.ts`.

## Running

```
cd client
npm run dev     # vite on :5173
npm run build   # tsc + vite build → ../Shadows.Server/wwwroot
```

## Renderer / sprite batcher

`src/engine/renderer.ts` is the WebGPU renderer. `src/engine/spriteRenderer.ts` is
the instanced sprite batcher. It supports multiple `flushWithTexture` calls per
frame by tracking a running `bufferOffset` into the instance buffer — this is
load-bearing, do not reuse the same buffer offset across flushes in one frame
(writeBuffer is immediate but drawIndexed executes at submit time).

World defaults: `WORLD_W = 7680`, `WORLD_H = 3840`, `TILE_SIZE = 128`
(power of two — GPU-friendly), `GAME_W = 1920`, `GAME_H = 1080`. Per-level
levels can override world size. Camera follows the player with
`camX = clamp(player.x - GAME_W/3, 0, WorldW - GAME_W)` and a similar
vertical clamp.

## Art direction

Mario Odyssey / Animal Crossing 3D plastic-toy style. Block sprites and
grass overlays are pre-rendered in Blender under `3d-assets/cube/` and copied
into the client on each art iteration. `WORLD_TINT = { r:1, g:1, b:1 }`
(full brightness — no mood-dim pass).

## Stage / platforms

`src/game/stage.ts` — a `Stage` is a list of `Platform { x, y, width, height, type }`
plus `typeResources: Map<string, { bindGroup, srcW, srcH, solid }>` and a shared
`overlays: { cornerFiller, grassOverlay }` resource pair.

- `createStage()` loads a saved level from `localStorage['shadows:level']` via
  `loadSavedStage()`, falling back to `createDefaultStage()` (= `level_001.json`).
- `loadStageTextures()` loads only block textures referenced by the current stage,
  plus the two always-needed overlays (corner filler + grass). One GPU texture
  per unique URL.
- `renderStage()` has three passes:
  1. Block body — each block type flushed once, one source image tiled across
     `p.width` at `TILE_SIZE`-cell steps so rounded corners stay uniform.
  2. Corner fillers — small opaque quads drawn at every inner 4-cell intersection
     (from `collectCornerFillers`) to plug the transparent diamond gap between
     four rounded block corners.
  3. Grass overlay — a ribbon drawn over any cell whose top edge is exposed
     (no solid cell above). Tiled horizontally in source aspect across each
     contiguous exposed run. Currently uses `grass_overlay_bright.png` for all
     blocks; per-block overlays can be added later by keying on `Platform.type`.

## Tile system

`src/game/tileTypes.ts` builds the `TileType` registry from two Vite globs at
load time — no code generation, no atlas extractor.

1. **Solid blocks** — every PNG under `src/assets/blocks/*.png` (except
   `block_corner_filler.png`, which is the overlay). Filename (without `.png`)
   becomes the tile id (e.g. `block_green`). One block image ≡ one tile type.
2. **Decorations** — non-solid standalone PNGs under `src/assets/sprites/**/*.png`.
   Folder name becomes the palette group; filename becomes id/name. Drop a PNG
   in a subfolder — no regen needed.

`CORNER_FILLER_URL` is exported separately so `stage.ts` can load the overlay
without it appearing in the editor palette.

Each block PNG is assumed whole-image (no atlas sub-rect). `TileType` has no
`srcRect` field; renderers treat the whole texture as the source.

## Level editor

`src/editor.ts` paints a tile grid onto a 2D canvas.

- Grid uses `TILE_SIZE = 128` world px per cell. Default level is 60×30 cells.
- Stores type-index + 1 per cell; 0 = empty. Decoration layers use a half-tile
  sub-grid so decorations can stand at four anchor points per solid cell.
- Palette on left builds canvas thumbnails directly from each block's PNG.
- `Save` writes to `localStorage['shadows:level']`.
- `Play ▶` auto-saves then navigates to `/index.html`.
- `Export/Import JSON` for sharing levels.
- Canvas background is a flat sky color matching the game's clear color.

Level file format (`version: 2`):

```ts
{
  version: 2,
  tileSize: 128,
  worldWidth: 7680,
  worldHeight: 3840,
  platforms:      [{ x, y, width, height, type, grass? }],
  decorationsBack:  [{ x, y, type }],
  decorationsFront: [{ x, y, type }]
}
```

Adjacent cells in the same row of the **same type** are merged into one
platform on save, reducing the runtime platform count.

## Design intent

Short-session 2D platformer — think Celeste-screen scope, not metroidvania.
Each room is 30-90 seconds of play, dying fades-to-black and restarts the
room from start (no mid-room checkpoints). Core loop: navigate → collect
pickups → reach exit door → next room. No combat in the loop; enemies exist
to be avoided, not fought.

MVP target: **one biome, 1-2 rooms, 1 enemy, a handful of collectibles, one
exit door.** UI is intentionally absent (no HUD, menu or title screen) —
the wow factor is the visual signature + responsive feel, not content volume.

## Art direction history

The art stack has pivoted once. Current direction (2026-04-19):
**Mario Odyssey / Animal Crossing 3D plastic-toy style.** Blocks and grass
overlays are pre-rendered in Blender (Cycles, ortho camera, sun key+fill
light; see `3d-assets/cube/`). All 3D assets share the same camera + lighting
pipeline so they read as one visual family. `WORLD_TINT = { r:1, g:1, b:1 }`
— full brightness, no mood-dim pass.

Old direction: painted silhouettes à la Hollow Knight / Ori, produced with
SDXL + a custom-trained `shadowsgame` LoRA. The LoRA produced consistent
scene-level backgrounds but was **too painterly/subtle at 132×132 tile
scale**. The LoRA weights are kept in `C:\Comfy\models\loras\` for future
background generation — the spelet itself no longer uses them.

Paths that were tried and failed (don't repeat without a new reason):

- img2img-restyle of existing tile atlases — destroys tileability.
- Per-tile upscale 132 → 1024 → 132 restyle — too destructive, loses detail.
- Procedural cone-grass in Blender (`render_grass.py`) — doesn't capture
  the organic Mario look; PIL-generated strip overlays do.
- Parallax backgrounds (sky + clouds + trees) — replaced with a flat sky
  clear color for the new style. The old layering code is gone from
  `main.ts` and `editor.ts`.

## Conventions

- No `Co-Authored-By` lines in commit messages (user preference, also in global CLAUDE.md).
- Commit messages in English.
- Don't invoke `grep`/`cat`/`find` via Bash — use Grep/Read/Glob tools.
- WebGPU bugs: always check the sprite batcher's `bufferOffset` assumption before adding new flushes.
