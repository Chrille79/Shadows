import { initRenderer } from './engine/renderer';
import { createSpriteRenderer } from './engine/spriteRenderer';
import { startGameLoop } from './engine/gameLoop';
import { createDefaultStage, renderStage } from './game/stage';
import { createCharacter, updateCharacter, renderCharacter, loadCharacterTextures } from './game/character';
import { loadTextureBitmap } from './engine/textureLoader';

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

    // Load background texture
    const bgUrl = new URL('./assets/backgrounds/bg.png', import.meta.url).href;
    const bgTexture = await loadTextureBitmap(renderer.device, bgUrl);
    const bgBindGroup = sprites.createTextureBindGroup(bgTexture);

    const stage = createDefaultStage(canvas.width, canvas.height);
    const player = createCharacter(
      canvas.width / 2 - 24,
      stage.platforms[0].y - 72,
    );

    loadCharacterTextures(player, renderer.device, sprites);

    startGameLoop({
      update(dt) {
        updateCharacter(player, dt, stage.platforms);
      },
      render(_alpha) {
        renderer.updateProjection(canvas.width, canvas.height);
        sprites.beginFrame();
        const pass = renderer.beginFrame();

        // 1. Background
        sprites.drawSprite({
          x: 0, y: 0,
          width: canvas.width, height: canvas.height,
          r: 1, g: 1, b: 1, a: 1,
        });
        sprites.flushWithTexture(pass, bgBindGroup);

        // 2. Stage
        renderStage(stage, sprites, canvas.width, canvas.height);
        sprites.flush(pass);

        // 3. Character
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
