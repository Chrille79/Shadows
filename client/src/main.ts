import { initRenderer, GAME_W, GAME_H, TILE_SIZE } from './engine/renderer';
import { createSpriteRenderer } from './engine/spriteRenderer';
import { startGameLoop } from './engine/gameLoop';
import { createStage, loadStageTextures, renderStage, renderDecorations } from './game/stage';
import { createCharacter, updateCharacter, renderCharacter, loadCharacterTextures, PLAYER_SPRITES } from './game/character';
import { loadTextureBitmap } from './engine/textureLoader';
import { PLAYER_BINDINGS, clearFrameInput, installInput, disposeInput } from './game/input';
import { BIG_CLOUDS, SMALL_CLOUDS, generateCloudInstances, type CloudInstance } from './game/clouds';

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
    const renderer = await initRenderer(canvas);
    const sprites = createSpriteRenderer(renderer);

    // Load the level first — cloud scatter density depends on the stage's
    // world width so the sky stays evenly populated regardless of level size.
    const stage = createStage();

    // Parallax layers (back → front). speed: 0 = stuck to camera (static on
    // screen), 1 = stuck to world (no parallax). `tile` repeats horizontally.
    interface ParallaxLayer {
      url: string;
      speed: number;
      displayHeight?: number;   // pixels; defaults to GAME_H
      alignBottom?: boolean;    // anchor to bottom of screen
      y?: number;               // explicit top-Y (ignored if alignBottom)
      tile?: boolean;           // repeat horizontally across the view
      stretchToGameW?: boolean; // one sprite stretched to GAME_W (used for sky)
      worldAnchored?: boolean;  // draw at a fixed world-Y with GAME_W horizontal span
                                // (used for sky so it cuts off at a specific tile row)
      worldBottomY?: number;    // bottom edge of sprite sits at this world-Y
                                // (combines with `tile` for horizontally-parallaxed
                                // layers anchored to a world horizon line)
      scatter?: CloudInstance[]; // fixed scattered positions (used for clouds);
                                 // each instance drawn with parallax offset
                                 // `camX * (1 - speed)` — overrides tile/stretch
    }
    // Sky ends and tree bottoms sit on row 22 (the horizon).
    const HORIZON_Y = 22 * TILE_SIZE;
    const parallaxLayers: ParallaxLayer[] = [
      { url: new URL('./assets/backgrounds/sky.png', import.meta.url).href,
        speed: 0, worldAnchored: true, y: 0, displayHeight: HORIZON_Y },
      { url: new URL('./assets/backgrounds/cloude_big.png', import.meta.url).href,
        speed: 0.08, displayHeight: 260, scatter: generateCloudInstances(BIG_CLOUDS, stage.worldWidth) },
      { url: new URL('./assets/backgrounds/cloude_small.png', import.meta.url).href,
        speed: 0.18, displayHeight: 180, scatter: generateCloudInstances(SMALL_CLOUDS, stage.worldWidth) },
      { url: new URL('./assets/backgrounds/back_trees1.png', import.meta.url).href,
        speed: 0.35, displayHeight: GAME_H, worldBottomY: HORIZON_Y, tile: true },
      { url: new URL('./assets/backgrounds/back_trees2.png', import.meta.url).href,
        speed: 0.55, displayHeight: GAME_H, worldBottomY: HORIZON_Y, tile: true },
    ];
    const parallaxTextures = await Promise.all(
      parallaxLayers.map((l) => loadTextureBitmap(renderer.device, l.url)),
    );
    const parallaxBindGroups = parallaxTextures.map((tex) =>
      sprites.createTextureBindGroup(tex),
    );

    // Spawn above the first platform (or fall back to a sensible Y if empty).
    const spawnY = stage.platforms.length > 0 ? stage.platforms[0].y - 72 : 500;
    const player = createCharacter(
      100,
      spawnY,
      PLAYER_BINDINGS,
      PLAYER_SPRITES,
    );

    await Promise.all([
      loadStageTextures(stage, renderer.device, sprites),
      loadCharacterTextures(player, renderer.device, sprites),
    ]);

    const stopLoop = startGameLoop({
      update(dt) {
        updateCharacter(player, dt, stage.platforms);
        clearFrameInput();
      },
      render(_alpha) {
        // Camera follows player in both axes, clamped to world bounds.
        // Viewport sits 2 tiles higher than a centered follow, so the player
        // renders 2 tiles below vertical center (more headroom above).
        // Defensive clamp: when world is smaller than viewport the max is 0.
        const camXMax = Math.max(0, stage.worldWidth - GAME_W);
        const camYMax = Math.max(0, stage.worldHeight - GAME_H);
        const camX = Math.min(camXMax, Math.max(0, player.x - GAME_W / 3));
        const camY = Math.min(camYMax, Math.max(0, player.y - GAME_H / 2 - 2 * TILE_SIZE));

        renderer.updateProjection(camX, camY);
        sprites.beginFrame();
        const pass = renderer.beginFrame();

        // 1. Parallax background — back to front.
        // Layers are screen-anchored: each sprite's world position is
        // (camX + screenX, camY + screenY), so they always fill the viewport
        // regardless of where the camera is in the (tall) world.
        for (let i = 0; i < parallaxLayers.length; i++) {
          const layer = parallaxLayers[i];
          const tex = parallaxTextures[i];
          const dispH = layer.displayHeight ?? GAME_H;
          const dispW = layer.stretchToGameW
            ? GAME_W
            : tex.width * (dispH / tex.height);
          const screenY = layer.alignBottom ? GAME_H - dispH : (layer.y ?? 0);

          if (layer.worldAnchored) {
            // Fixed world-Y, viewport-wide horizontally. sky.png is 1px wide so
            // stretching to GAME_W across the visible camera window is free.
            sprites.drawSprite({
              x: camX, y: layer.y ?? 0,
              width: GAME_W, height: dispH,
              uvX: 0, uvY: 0, uvW: 1, uvH: 1,
              r: 1, g: 1, b: 1, a: 1,
            });
          } else if (layer.scatter) {
            // Scattered sprites (clouds): each has a fixed base world position,
            // with parallax giving them a small drift relative to the camera.
            // World-x = base.x + camX * (1 - speed):
            //   speed 0 → cloud sticks to screen, speed 1 → sticks to world.
            const dx = camX * (1 - layer.speed);
            for (const inst of layer.scatter) {
              sprites.drawSprite({
                x: inst.x + dx, y: inst.y,
                width: dispW, height: dispH,
                uvX: 0, uvY: 0, uvW: 1, uvH: 1,
                r: 1, g: 1, b: 1, a: 1,
              });
            }
          } else if (layer.stretchToGameW) {
            sprites.drawSprite({
              x: camX, y: camY + screenY,
              width: GAME_W, height: dispH,
              uvX: 0, uvY: 0, uvW: 1, uvH: 1,
              r: 1, g: 1, b: 1, a: 1,
            });
          } else if (layer.tile) {
            // Horizontal parallax: offset the tile row by -(camX * speed),
            // wrapped into [-dispW, 0) so the first copy starts at or just
            // before the left screen edge.
            // Vertical anchor: if `worldBottomY` is set, the bottom edge sits at
            // that fixed world row (e.g. trees on the horizon); otherwise the
            // layer stays screen-anchored via `screenY`.
            const scroll = camX * layer.speed;
            const firstX = -(((scroll % dispW) + dispW) % dispW);
            const yWorld = layer.worldBottomY !== undefined
              ? layer.worldBottomY - dispH
              : camY + screenY;
            for (let sx = firstX; sx < GAME_W; sx += dispW) {
              sprites.drawSprite({
                x: camX + sx, y: yWorld,
                width: dispW, height: dispH,
                uvX: 0, uvY: 0, uvW: 1, uvH: 1,
                r: 1, g: 1, b: 1, a: 1,
              });
            }
          } else {
            sprites.drawSprite({
              x: camX - camX * layer.speed, y: camY + screenY,
              width: dispW, height: dispH,
              uvX: 0, uvY: 0, uvW: 1, uvH: 1,
              r: 1, g: 1, b: 1, a: 1,
            });
          }
          sprites.flushWithTexture(pass, parallaxBindGroups[i]);
        }

        // 2. Back decorations — drawn behind solid tiles so a solid tile will
        // hide a deco sprite that sticks down into the ground row.
        renderDecorations(stage, stage.decorationsBack, sprites, pass);

        // 3. Stage (solid platforms)
        renderStage(stage, sprites, pass);

        // 4. Player
        renderCharacter(player, sprites, pass);

        // 5. Decorations in front of the player (player walks behind).
        renderDecorations(stage, stage.decorationsFront, sprites, pass);

        renderer.endFrame();
      },
    });

    // HMR cleanup — avoid duplicate listeners and leaked GPU resources on reload.
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        stopLoop();
        disposeInput();
        renderer.dispose();
        for (const tex of parallaxTextures) tex.destroy();
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
