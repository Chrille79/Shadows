import { initRenderer, GAME_W, GAME_H, type Renderer } from './renderer';
import { createSpriteRenderer, type SpriteRenderer } from './spriteRenderer';
import { createSkyRenderer, type SkyRenderer } from './skyRenderer';
import { createHillsRenderer, type HillsRenderer } from './hillsRenderer';
import { createParallaxRenderer, type ParallaxRenderer } from './parallaxRenderer';
import {
  type Stage,
  loadStageTextures,
  renderStage,
  renderDecorations,
} from '../game/stage';
import type { Character } from '../game/character';
import { renderCharacter, loadCharacterTextures } from '../game/character';
import { config } from '../config';

// Single entry point for drawing a game-world frame — bundles the renderer,
// sprite batcher, sky/hills/parallax passes and stage/character draws.  Both
// the game and the editor call into this so they render the exact same way.

export interface WorldRendererOptions {
  canvas: HTMLCanvasElement;
  /** Viewport resolution in world-pixels.  Game uses GAME_W × GAME_H with a
   *  moving camera; the editor passes the full world size and keeps camX=0. */
  viewportW?: number;
  viewportH?: number;
  /** When false, skip the window-fit CSS the game expects.  Editor handles
   *  its own layout. */
  fitWindow?: boolean;
}

export interface WorldFrame {
  stage: Stage;
  /** Optional player — omit in the editor. */
  player?: Character;
  camX: number;
  camY: number;
  /** `performance.now()` — used for cloud drift, future animations. */
  nowMs: number;
  /** Optional overlay pass — called after all world draws but before the
   *  render pass ends.  The editor uses it to paint grid, horizon line and
   *  hover chrome on top without needing a second canvas. */
  overlays?: (pass: GPURenderPassEncoder, sprites: SpriteRenderer) => void;
}

export interface WorldRenderer {
  renderer: Renderer;
  sprites: SpriteRenderer;
  sky: SkyRenderer;
  hills: HillsRenderer;
  parallax: ParallaxRenderer;
  /** Load the stage's tile textures (and optionally a character) so renderFrame
   *  has bind groups ready.  Must be awaited before the first renderFrame. */
  loadAssets(stage: Stage, player?: Character): Promise<void>;
  /** Issue all GPU commands for one frame.  Caller handles the game loop. */
  renderFrame(f: WorldFrame): void;
  dispose(): void;
}

export async function createWorldRenderer(
  opts: WorldRendererOptions,
): Promise<WorldRenderer> {
  const renderer = await initRenderer(opts.canvas, {
    viewportW: opts.viewportW ?? GAME_W,
    viewportH: opts.viewportH ?? GAME_H,
    fitWindow: opts.fitWindow,
  });
  const sprites = createSpriteRenderer(renderer);
  const sky = createSkyRenderer(renderer);
  const hills = createHillsRenderer(renderer);
  const parallax = await createParallaxRenderer(renderer, sprites);

  async function loadAssets(stage: Stage, player?: Character) {
    const jobs: Promise<unknown>[] = [
      loadStageTextures(stage, renderer.device, sprites),
    ];
    if (player) {
      jobs.push(loadCharacterTextures(player, renderer.device, sprites));
    }
    await Promise.all(jobs);
  }

  function renderFrame(f: WorldFrame) {
    renderer.updateProjection(f.camX, f.camY);
    sprites.beginFrame();
    const pass = renderer.beginFrame();

    sky.render(pass, f.camY, f.stage.groundY);
    if (config.layers.hillsFar) {
      hills.render(pass, config.hills.far, f.camX, f.camY, f.stage.groundY);
    }
    if (config.layers.hillsNear) {
      hills.render(pass, config.hills.near, f.camX, f.camY, f.stage.groundY);
    }
    parallax.render(pass, sprites, f.camX, f.camY, f.stage.groundY, f.nowMs);

    const view = {
      minX: f.camX,
      minY: f.camY,
      maxX: f.camX + renderer.viewportW,
      maxY: f.camY + renderer.viewportH,
    };
    renderDecorations(f.stage, 'back', sprites, pass, view);
    renderStage(f.stage, sprites, pass, view);
    if (f.player) renderCharacter(f.player, sprites, pass);
    renderDecorations(f.stage, 'front', sprites, pass, view);

    f.overlays?.(pass, sprites);

    renderer.endFrame();
  }

  return {
    renderer,
    sprites,
    sky,
    hills,
    parallax,
    loadAssets,
    renderFrame,
    dispose: renderer.dispose,
  };
}
