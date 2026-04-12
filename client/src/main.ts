import { initRenderer } from './engine/renderer';
import { createSpriteRenderer } from './engine/spriteRenderer';
import { startGameLoop } from './engine/gameLoop';
import { createDefaultStage, renderStage } from './game/stage';
import { createCharacter, updateCharacter, renderCharacter, loadCharacterTextures } from './game/character';
import { createParallaxBackground } from './game/parallax';

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
    const renderer = await initRenderer(canvas);
    const sprites = createSpriteRenderer(renderer);

    const stage = createDefaultStage(canvas.width, canvas.height);
    const parallax = createParallaxBackground();
    const player = createCharacter(
      canvas.width / 2 - 24,
      stage.platforms[0].y - 72,
    );

    // Load character textures (non-blocking, falls back to colored rect until loaded)
    loadCharacterTextures(player, renderer.device, sprites);

    startGameLoop({
      update(dt) {
        updateCharacter(player, dt, stage.platforms);
        parallax.update(dt, player.x);
      },
      render(_alpha) {
        renderer.updateProjection(canvas.width, canvas.height);

        const pass = renderer.beginFrame();

        // Background + stage (all solid-color, default white texture)
        parallax.render(sprites, canvas.width, canvas.height);
        renderStage(stage, sprites, canvas.width, canvas.height);
        sprites.flush(pass);

        // Character with its own spritesheet texture
        renderCharacter(player, sprites, pass);

        renderer.endFrame();
      },
    });
  } catch (err) {
    canvas.style.display = 'none';
    errorEl.style.display = 'flex';
    errorEl.textContent = `Failed to initialize: ${err}`;
  }
}

main();
