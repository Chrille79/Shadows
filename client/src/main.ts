import { GAME_W, GAME_H, TILE_SIZE } from './engine/renderer';
import { createWorldRenderer } from './engine/worldRenderer';
import { startGameLoop } from './engine/gameLoop';
import { createStage } from './game/stage';
import { createCharacter, updateCharacter, PLAYER_SPRITES } from './game/character';
import { PLAYER_BINDINGS, clearFrameInput, installInput, disposeInput } from './game/input';
import { config } from './config';
import './dev/settings'; // Exposes `window.settings` in dev — no prod cost.
import './dev/panel';    // In-page dev panel (backtick to toggle) — dev only.

async function main() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const errorEl = document.getElementById('error')!;

  if (!navigator.gpu) {
    canvas.style.display = 'none';
    errorEl.style.display = 'flex';
    errorEl.textContent = 'WebGPU is not supported in your browser. Please use Chrome 113+ or Edge 113+.';
    return;
  }

  try {
    installInput();
    const world = await createWorldRenderer({ canvas });

    const stage = createStage();

    const spawnY = stage.platforms.length > 0 ? stage.platforms[0].y - 200 : 500;
    const player = createCharacter(
      100,
      spawnY,
      PLAYER_BINDINGS,
      PLAYER_SPRITES,
    );

    await world.loadAssets(stage, player);

    // Previous-tick player position for render interpolation — the fixed
    // timestep update() writes discrete positions, so at high fall velocity
    // the sprite would visibly step by 16+ px per render frame. `alpha`
    // from the game loop lets us interpolate between the last two ticks for
    // smooth sub-tick motion.
    let prevPlayerX = player.x;
    let prevPlayerY = player.y;

    // Camera state — persists across frames. X follows the player with a
    // one-third-screen lead. Y uses a 2-tile dead-zone around the normal
    // rest position: within that zone the camera holds still (so short hops
    // don't jostle the view), outside it the camera lerps smoothly back to
    // the player's new height. `camYFollowing` gives the lerp hysteresis —
    // once triggered we keep lerping until `camY` is back at the target,
    // even if the player re-enters the dead-zone mid-animation.
    let camX = 0;
    let camY = Math.max(0, player.y - GAME_H / 2 - 2 * TILE_SIZE);
    let camYFollowing = false;
    // All lerp/deadzone values come from `config.camera` — see config.ts so
    // they can be tweaked live in the dev console.

    const stopLoop = startGameLoop({
      update(dt) {
        prevPlayerX = player.x;
        prevPlayerY = player.y;
        updateCharacter(player, dt, stage.platforms, stage.worldHeight);
        clearFrameInput();
      },
      render(alpha) {
        // Interpolate between the last two physics ticks so fast falls look
        // smooth. Mutate the character position for the render pass and
        // restore after so downstream code still sees the authoritative
        // physics state on the next update().
        const savedX = player.x, savedY = player.y;
        player.x = prevPlayerX + (player.x - prevPlayerX) * alpha;
        player.y = prevPlayerY + (player.y - prevPlayerY) * alpha;
        const camXMax = Math.max(0, stage.worldWidth - GAME_W);
        const camYMax = Math.max(0, stage.worldHeight - GAME_H);
        camX = Math.min(camXMax, Math.max(0, player.x - GAME_W / 3));

        const targetCamY = player.y - GAME_H / 2 - 2 * TILE_SIZE;
        const delta = targetCamY - camY;
        const deadzone = (delta > 0
          ? config.camera.yDeadzoneDownTiles
          : config.camera.yDeadzoneUpTiles) * TILE_SIZE;
        if (Math.abs(delta) > deadzone) camYFollowing = true;
        if (camYFollowing) {
          if (Math.abs(delta) < 0.5) {
            camY = targetCamY;
            camYFollowing = false;
          } else {
            const lerp = delta > 0 ? config.camera.yLerpDown : config.camera.yLerpUp;
            camY += delta * lerp;
          }
        }
        camY = Math.min(camYMax, Math.max(0, camY));

        world.renderFrame({
          stage,
          player,
          camX,
          camY,
          nowMs: performance.now(),
        });

        player.x = savedX;
        player.y = savedY;
      },
    });

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        stopLoop();
        disposeInput();
        world.dispose();
      });
    }
  } catch (err) {
    canvas.style.display = 'none';
    errorEl.style.display = 'flex';
    const msg = err instanceof Error ? err.message : String(err);
    errorEl.textContent = `Failed to initialize: ${msg}`;
    console.error(err);
  }
}

main();
