import type { SpriteRenderer } from '../engine/spriteRenderer';

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Stage {
  platforms: Platform[];
  background: { r: number; g: number; b: number };
}

export function createDefaultStage(screenW: number, screenH: number): Stage {
  const cx = screenW / 2;
  const groundY = screenH * 0.72;

  return {
    background: { r: 0.05, g: 0.05, b: 0.12 },
    platforms: [
      // Main ground platform
      { x: cx - 400, y: groundY, width: 800, height: 44 },
      // Left floating platform
      { x: cx - 520, y: groundY - 160, width: 200, height: 20 },
      // Right floating platform
      { x: cx + 320, y: groundY - 160, width: 200, height: 20 },
      // Top center platform
      { x: cx - 120, y: groundY - 300, width: 240, height: 20 },
    ],
  };
}

export function renderStage(stage: Stage, sprites: SpriteRenderer, _screenW: number, _screenH: number) {
  // Platforms
  for (const p of stage.platforms) {
    // Platform shadow
    sprites.drawSprite({
      x: p.x + 4, y: p.y + 4,
      width: p.width, height: p.height,
      r: 0, g: 0, b: 0, a: 0.3,
    });

    // Platform body
    sprites.drawSprite({
      x: p.x, y: p.y,
      width: p.width, height: p.height,
      r: 0.3, g: 0.25, b: 0.45, a: 1,
    });

    // Platform top highlight
    sprites.drawSprite({
      x: p.x, y: p.y,
      width: p.width, height: 3,
      r: 0.6, g: 0.5, b: 0.9, a: 1,
    });

    // Platform edge glow left
    sprites.drawSprite({
      x: p.x, y: p.y,
      width: 3, height: p.height,
      r: 0.5, g: 0.4, b: 0.8, a: 0.5,
    });
  }
}
