# Shadows — project guide

2D platformer. WebGPU client (`client/`) + ASP.NET server (`Shadows.Server/`).
Client uses Vite + TypeScript. All game work lives in `client/src/`.

## Entry points

- `client/index.html` → `src/main.ts` — the game
- `client/editor.html` → `src/editor.ts` — standalone level editor (same WebGPU pipeline as the game; no 2D canvas)

Both are declared as Vite inputs in `client/vite.config.ts`.

## Running

```
cd client
npm run dev     # vite on :5173
npm run build   # tsc + vite build → ../Shadows.Server/wwwroot
```

## Renderer / sprite batcher

`src/engine/renderer.ts` is the WebGPU device wrapper. `src/engine/spriteRenderer.ts` is
the instanced sprite batcher. It supports multiple `flushWithTexture` calls per
frame by tracking a running `bufferOffset` into the instance buffer — this is
load-bearing, do not reuse the same buffer offset across flushes in one frame
(writeBuffer is immediate but drawIndexed executes at submit time).

`src/engine/worldRenderer.ts` is the **single entrypoint for world-frame
drawing** shared by the game and the editor. `createWorldRenderer({ canvas,
viewportW, viewportH, fitWindow })` bundles the device, sprite batcher, sky
pass, hill pass, cloud pass and stage/decoration/character draws behind one
`renderFrame({ stage, player?, camX, camY, nowMs, overlays? })` call. Both
views consume it — game at fixed 1920×1080 viewport, editor at the full
world size — so any new bg feature lands once and shows up in both without
per-view follow-up work. The `overlays` callback is editor-only: it fires
after world passes but before the render pass ends, and we use it to paint
grid lines, the horizon-dashed line and the hover cursor via the same sprite
batcher (1×1 whiteTexture tinted per-sprite). No separate Canvas2D anywhere.

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

## Parallax sky / hills / clouds

Three layers between the sky clear and the world passes, all live-tunable:

1. **Sky gradient** — `skyRenderer.ts` fullscreen-triangle shader sampling
   world-y. `config.sky.{top,bottom}` are the zenith/horizon colors.
   Because it samples *world* y, a taller level automatically shows more
   zenith color up top without needing a taller texture.
2. **Hill ribbons** — `hillsRenderer.ts`. Two bands (`config.hills.far` and
   `config.hills.near`) drawn as procedural sine waves (`wave = 0.6·sin +
   0.4·sin` at two frequencies), filled in solid color. The fragment shader
   discards anything above `hillTop` (sky shows through) and anything at or
   below `groundY` (ground platforms take over). Parallax is done in-shader
   by sampling the wave at `x - camX * (1 - parallax)`. We tried SDXL-generated
   hill PNGs first and they never felt right; the procedural version matches
   the Mario-Odyssey reference scene we pulled inspiration from.
3. **Clouds** — `parallaxRenderer.ts` draws a handful of cloud sprites at
   `worldY = groundY + yOffsetFromGround` (negative = above horizon). They
   drift horizontally with `driftSpeed` world-px/s (negative = right→left)
   and move at `parallax` fraction of camera speed.

Per-layer on/off toggles live in `config.layers.{sky,hillsFar,hillsNear,clouds}`,
all live-mutable via `settings.layers.*` in the dev console. `stage.groundY`
is per-level (field `groundY` in the level JSON, default `worldHeight - 6 * TILE_SIZE`);
the editor has a File → Horizon (ground Y)… dialog plus a dashed line at
that y so designers can see exactly where hills will sit in-game.

## Config / live tunables

Gameplay constants (physics, camera, grass overlay sizes, world tint, sky
colors, hill-wave params, layer toggles) live in `src/settings.json`, loaded
through `src/config.ts` as a single mutable object. Modules read
`config.physics.gravity`, `config.camera.yLerpDown`, `config.grass.topRise`,
`config.worldTint.r`, `config.hills.far.amplitude`, etc. on **every** call —
never destructure into locals at import time, that captures the value and
breaks live editing.

The dev panel (backtick ` to toggle) exposes a prompt where you can read
and write any field: type `grass.topRise` to read, `grass.topRise = 8` to
write, `help` for commands, Tab to autocomplete. The same object is
exposed on `window.settings` for the browser devtools console.

## Stage / platforms

`src/game/stage.ts` — a `Stage` is a list of `Platform { x, y, width, height, type }`
plus `typeResources: Map<string, { bindGroup, srcW, srcH, solid }>` and a shared
`overlays: { cornerFiller, grassOverlay }` resource pair.

`renderStage` / `renderDecorations` also take a `ViewRect` (game passes its
camera viewport, editor passes the whole world) and cull platforms,
decorations, corner-fillers and grass cells to it — CPU work scales with
visible area, not world size. Platform-derived tables (corner-filler
positions, grass-occupancy grid, by-type grouping maps) are cached on the
first render into `stage.derived` and reused until the Stage object is
replaced; the editor naturally invalidates by rebuilding the Stage on each
grid mutation.

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

`src/editor.ts` paints a tile grid onto **the same WebGPU pipeline the game
uses**. The canvas is `worldW × worldH` internally and CSS-scaled by
`displayScale` (Ctrl+scroll to zoom). A continuous RAF loop calls
`bgWorld.renderFrame(...)` every frame so cloud drift stays animated and the
FPS counter (`#fps-info` in the toolbar) reads honestly.

- Grid uses `TILE_SIZE = 128` world px per cell. Default level is 60×30 cells.
- Stores type-index + 1 per cell; 0 = empty. Decoration layers use a half-tile
  sub-grid so decorations can stand at four anchor points per solid cell.
- **Grass is a separate per-cell flag** (`grassGrid`) that paints alongside the
  solid tile. Toolbar `Grass` button (or **G** key) toggles paint-with-grass.
  Flagged cells are rendered by the shared `renderStage` grass pass, so the
  preview is the literal in-game output. Run-merging on save groups adjacent
  cells by `(type, grass)` pairs, so same-type cells with mixed grass flags
  become separate platforms.
- Palette on left builds DOM thumbnails directly from each block's PNG. Those
  are independent of the WebGPU canvas and still use plain `<img>` elements.
- Per-frame `buildEditorStage()` serializes the authored grid into a real
  `Stage` and **caches it** — it's rebuilt only when `grid`/`grassGrid`/
  decoration grids actually mutate (via `invalidateEditorStage()`), otherwise
  the RAF loop reuses the cached Stage. Without the cache the editor was
  burning ~half its frame budget on serialize + parse every RAF tick.
- Tile/decoration textures are preloaded once at init via a synthetic
  all-types stage passed through `loadStageTextures`; `preloadedTypes` /
  `preloadedOverlays` are reused by every `buildEditorStage()` call. **Cache
  only populates once both are set** — a RAF tick that fires between
  `bgWorld` resolving and `loadStageTextures` finishing would otherwise
  permanently cache a Stage with an empty `typeResources` map, rendering
  every tile as the slate-purple missing-texture fallback from
  `stage.ts`'s `renderStage`.
- `draw()` is idempotent within a frame — it sets `drawnThisFrame=true` at
  top and returns early if already set; the RAF loop resets the flag. Event
  handlers can call `draw()` freely without double-rendering.
- View menu toggles (`#layer-sky / #layer-hills / #layer-clouds / #layer-grid`)
  temporarily override `config.layers` around the one `renderFrame` call
  then restore — editor-local preferences don't leak into the running game
  if both are open.
- `Save` writes to `localStorage['shadows:level']`.
- `Play ▶` auto-saves then navigates to `/index.html`.
- `Export/Import JSON` for sharing levels.
- File → Horizon (ground Y)… sets `groundY` for the level; a dashed orange
  line at that y is painted by the overlay callback so the horizon is
  visible while placing platforms.
- `prompt()` and `confirm()` are blocked by Chrome inside cross-origin
  iframes (the Claude preview runs the editor that way), so `btn-world-size`
  and `btn-clear` use in-page `<dialog>` elements via `askText` / `askConfirm`
  helpers instead of the native browser dialogs.

Level file format (`version: 3`):

```ts
{
  version: 3,
  tileSize: 128,
  worldWidth: 7680,
  worldHeight: 3840,
  groundY?: number,           // horizon line in world-y; hills anchor here
  platforms:      [{ x, y, width, height, type, grass? }],
  decorationsBack:  [{ x, y, type }],
  decorationsFront: [{ x, y, type }]
}
```

`stageFromFile` defaults missing `groundY` to `worldHeight - 6 * tileSize`.
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
- **SDXL-generated hill PNGs (Samaritan-3D-Cartoon)** — the checkpoint is
  so scene-trained it bakes a full composition (characters, trees, houses)
  into every "flat distant hills" prompt. Tried lots of prompt tuning,
  IPAdapter style-matching against `block_green.png`, higher CFG — never
  looked right next to the plastic-render blocks. Current hills are the
  procedural shader ribbons described in the **Parallax sky / hills / clouds**
  section; the workflow JSONs stay in `3d-assets/comfy/workflows/` if we
  want to revisit, but the live game does not use AI hills.
- **LayerDiffuse for transparent output** — the ComfyUI-layerdiffuse node
  fails on current ComfyUI core with `JoinImageWithAlpha has no attribute
  join_image_with_alpha`. We swapped the plastic workflows to `Image Rembg
  (Remove Background)` (rembg Python package; install with
  `C:/Comfy/.venv/Scripts/pip3.exe install rembg`).

## Conventions

- No `Co-Authored-By` lines in commit messages (user preference, also in global CLAUDE.md).
- Commit messages in English.
- Don't invoke `grep`/`cat`/`find` via Bash — use Grep/Read/Glob tools.
- WebGPU bugs: always check the sprite batcher's `bufferOffset` assumption before adding new flushes.

## WGSL / WebGPU gotchas (learned the hard way)

- **Uniform struct size must be a multiple of 16 bytes.** A `vec4<f32>`
  (16 bytes) + 13 `f32` (52 bytes) = 68 bytes → WGSL pads it to 80. If
  you allocate a 64-byte buffer for that struct, WebGPU silently corrupts
  the pipeline and nothing renders (no validation error either). Count
  fields carefully or pad with an explicit `_pad: f32` to land on a
  16-byte multiple. `hillsRenderer.ts` has a 1×vec4 + 11 meaningful + 1
  `_pad0` = 64-byte struct for reference.
- **Backticks inside WGSL comments break JS template literals.** `/* wgsl */`
  shader blocks are stored as JS template-literal strings; a stray
  `` `parallax` `` in a WGSL comment terminates the template literal and
  the whole module fails to parse with a cryptic "expected semicolon"
  error from Oxc. Just write `parallax` with no backticks, or use `/*…*/`
  block-comments inside the shader.
- **ComfyUI `KSampler` has a hidden widget.** The GUI frontend injects a
  `control_after_generate` dropdown right after the INT `seed` widget —
  it's not in `/object_info`'s input schema. Any converter that writes
  `widgets_values` from the schema alone shifts steps/cfg/sampler_name
  by one slot. See `3d-assets/comfy/scripts/api_to_gui.py`: after the
  widget for a `seed`/`noise_seed` INT, push a literal `"randomize"`
  before continuing.
- **ComfyUI workflow JSON has two formats.** The API format (flat
  `{nodeId: {class_type, inputs}}`) is what `/prompt` accepts; the GUI
  format is a proper graph with `nodes[]` and `links[]` and widget_values.
  Dragging JSON onto the ComfyUI canvas expects GUI format — API format
  just shows a blank canvas. `api_to_gui.py` converts between them.
