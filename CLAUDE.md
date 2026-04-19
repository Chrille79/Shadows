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
levels can override world size.

Camera X follows the player with `camX = clamp(player.x - GAME_W/3, ...)`.
Camera Y uses an **asymmetric deadzone + lerp** sitting around the player's
rest position — small hops stay within the deadzone (camera holds still),
but going past `config.camera.yDeadzoneDownTiles` downward (fall) or
`yDeadzoneUpTiles` upward (new platform) flips `camYFollowing = true` and
the camera lerps to the new target. Downward lerp is snappy
(`yLerpDown = 0.16`) so fast falls can't out-run the view; upward is slow
(`yLerpUp = 0.02`) for a cinematic pan. Character terminal velocity
(`config.physics.terminalVelocity`) caps fall speed so even that snappy
lerp keeps up.

The main loop also interpolates the player position between the last two
physics ticks in `render(alpha)` — the fixed-timestep physics writes
discrete positions, so without interpolation fast falls would visibly
step between renders. `main.ts` mutates `player.x/y` to the interpolated
value for the duration of the render pass and restores them after.

## Config / live tunables

Gameplay constants (physics, camera, grass overlay sizes, world tint) live
in `src/settings.json`, loaded through `src/config.ts` as a single mutable
object. Modules read `config.physics.gravity`, `config.camera.yLerpDown`,
`config.grass.topRise`, `config.worldTint.r` etc. on **every** call — never
destructure into locals at import time, that captures the value and breaks
live editing.

The dev panel (backtick ` to toggle) exposes a prompt where you can read
and write any field: type `grass.topRise` to read, `grass.topRise = 8` to
write, `help` for commands, Tab to autocomplete. The same object is
exposed on `window.settings` for the browser devtools console.

## Stage / platforms

`src/game/stage.ts` — a `Stage` is a list of `Platform { x, y, width, height, type }`
plus `typeResources: Map<string, { bindGroup, srcW, srcH, solid }>` and a shared
`overlays: { cornerFiller, grassOverlay }` resource pair.

- `createStage()` loads a saved level from `localStorage['shadows:level']` via
  `loadSavedStage()`, falling back to `createDefaultStage()` (= `level_001.json`).
- `loadStageTextures()` loads only block textures referenced by the current stage,
  plus the two always-needed overlays (corner filler + grass). One GPU texture
  per unique URL.
- `renderStage()` has three passes, in this order:
  1. Corner fillers — drawn **first**, behind the blocks, so only the
     transparent diamond gap between four rounded corners shows any filler.
     Positions come from `collectCornerFillers` (every inner 4-cell
     intersection where all four cells are solid).
  2. Block body — each block type flushed once, one source image tiled
     across `p.width` at `TILE_SIZE`-cell steps so rounded corners stay
     uniform even for wide runs.
  3. Grass overlay — a ribbon drawn over every cell belonging to a platform
     with `grass: true`. Each row gets a per-row phase shift so tufts don't
     stack vertically on thick ground runs; each run also hangs over each
     end by `config.grass.overhang` world-px for a softer silhouette.
     Collision top for grass platforms is raised by `config.grass.topRise`
     in `character.ts` so the player stands on the grass surface, not
     inside it.

**Collision rule:** only platforms with `grass: true` are standable. Blocks
without grass are pure decoration — the player passes right through. This
is intentional (grass flag is the "walkable surface" marker); if you want
a non-grass block to have collision, either flag it grass or add a new
collision flag.

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
- **Grass is a separate per-cell flag** (`grassGrid`) that paints alongside the
  solid tile. Toolbar `Grass` button (or **G** key) toggles paint-with-grass.
  Flagged cells render the real grass overlay PNG on top in the editor so the
  preview matches the game. Run-merging on save groups adjacent cells by
  `(type, grass)` pairs, so same-type cells with mixed grass flags become
  separate platforms.
- Palette on left builds canvas thumbnails directly from each block's PNG.
- `Save` writes to `localStorage['shadows:level']`.
- `Play ▶` auto-saves then navigates to `/index.html`.
- `Export/Import JSON` for sharing levels.
- Canvas background is a flat sky color matching the game's clear color.
- `prompt()` and `confirm()` are blocked by Chrome inside cross-origin
  iframes (the Claude preview runs the editor that way), so `btn-world-size`
  and `btn-clear` use in-page `<dialog>` elements via `askText` / `askConfirm`
  helpers instead of the native browser dialogs.

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

## Art direction

Current direction (pivoted 2026-04-19): **Mario Odyssey / Animal Crossing
3D plastic-toy style.** Blocks and grass overlays are pre-rendered in
Blender (Cycles, ortho camera, sun key+fill light; see `3d-assets/cube/`)
and PIL-generated seamless strips. All 3D assets share the same camera +
lighting pipeline so they read as one visual family. `WORLD_TINT` is
white (full brightness, no mood-dim pass).

Paths that were tried and failed (don't repeat without a new reason):

- **SDXL + `shadowsgame` LoRA for tiles.** The LoRA produced consistent
  painted-silhouette backgrounds (Hollow Knight / Ori vibe) but was too
  painterly/subtle at tile scale. Weights kept in
  `C:\Comfy\models\loras\` for possible future background stills — the
  game itself no longer uses them.
- img2img-restyle of existing tile atlases — destroys tileability.
- Per-tile upscale → restyle → downscale — too destructive, loses detail.
- Procedural cone-grass in Blender (`render_grass.py`) — doesn't capture
  the organic Mario look; PIL-generated strip overlays do.
- Parallax backgrounds (sky + clouds + trees) — replaced with a flat sky
  clear color; old layering code is gone from `main.ts` and `editor.ts`.

## Conventions

- No `Co-Authored-By` lines in commit messages (user preference, also in global CLAUDE.md).
- Commit messages in English.
- Don't invoke `grep`/`cat`/`find` via Bash — use Grep/Read/Glob tools.
- WebGPU bugs: always check the sprite batcher's `bufferOffset` assumption before adding new flushes.
