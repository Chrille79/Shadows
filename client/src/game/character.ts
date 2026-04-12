import type { SpriteRenderer } from '../engine/spriteRenderer';
import type { Platform } from './stage';
import type { AnimationPlayer } from '../engine/animation';
import { createAnimation, createAnimationPlayer } from '../engine/animation';
import type { AtlasData } from '../engine/animation';
import { loadTexture } from '../engine/textureLoader';

import idleAtlas from '../assets/ninja-spritesheet/idle_right/atlas.json';
import runAtlas from '../assets/ninja-spritesheet/run_right/atlas.json';

export interface Character {
  x: number;
  y: number;
  velX: number;
  velY: number;
  width: number;
  height: number;
  grounded: boolean;
  facing: 1 | -1;
  animPlayer: AnimationPlayer;
  textureBindGroup: GPUBindGroup | null;
  spriteSize: number;
}

const GRAVITY = 1800;
const MOVE_SPEED = 400;
const JUMP_FORCE = -650;
const FRICTION = 0.85;

export function createCharacter(x: number, y: number): Character {
  const idleAnim = createAnimation('idle', idleAtlas as AtlasData, 12);
  const runAnim = createAnimation('run', runAtlas as AtlasData, 16);

  const animPlayer = createAnimationPlayer({
    idle: idleAnim,
    run: runAnim,
  });

  return {
    x, y,
    velX: 0, velY: 0,
    width: 48, height: 72,
    grounded: false,
    facing: 1,
    animPlayer,
    textureBindGroup: null,
    spriteSize: 128,
  };
}

export async function loadCharacterTextures(
  char: Character,
  device: GPUDevice,
  sprites: SpriteRenderer,
) {
  // Load idle spritesheet (used for both idle and as default)
  // We'll switch textures per animation later when needed
  const idleTexture = await loadTexture(
    device,
    new URL('../assets/ninja-spritesheet/idle_right/spritesheet.png', import.meta.url).href,
  );
  char.textureBindGroup = sprites.createTextureBindGroup(idleTexture);

  // Pre-load run texture too
  const runTexture = await loadTexture(
    device,
    new URL('../assets/ninja-spritesheet/run_right/spritesheet.png', import.meta.url).href,
  );

  // Store both bind groups for switching
  (char as CharacterInternal)._bindGroups = {
    idle: sprites.createTextureBindGroup(idleTexture),
    run: sprites.createTextureBindGroup(runTexture),
  };
}

interface CharacterInternal extends Character {
  _bindGroups?: Record<string, GPUBindGroup>;
}

// Input state
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

export function updateCharacter(char: Character, dt: number, platforms: Platform[]) {
  const moving = keys['ArrowLeft'] || keys['KeyA'] || keys['ArrowRight'] || keys['KeyD'];

  // Horizontal movement
  if (keys['ArrowLeft'] || keys['KeyA']) {
    char.velX = -MOVE_SPEED;
    char.facing = -1;
  } else if (keys['ArrowRight'] || keys['KeyD']) {
    char.velX = MOVE_SPEED;
    char.facing = 1;
  } else {
    char.velX *= FRICTION;
  }

  // Jump
  if ((keys['ArrowUp'] || keys['KeyW'] || keys['Space']) && char.grounded) {
    char.velY = JUMP_FORCE;
    char.grounded = false;
  }

  // Apply gravity
  char.velY += GRAVITY * dt;

  // Move
  char.x += char.velX * dt;
  char.y += char.velY * dt;

  // Platform collision
  char.grounded = false;
  for (const p of platforms) {
    if (
      char.velY >= 0 &&
      char.x + char.width > p.x &&
      char.x < p.x + p.width &&
      char.y + char.height >= p.y &&
      char.y + char.height <= p.y + p.height + 20
    ) {
      char.y = p.y - char.height;
      char.velY = 0;
      char.grounded = true;
    }
  }

  // Animation state
  if (char.grounded && moving) {
    char.animPlayer.play('run');
  } else {
    char.animPlayer.play('idle');
  }

  char.animPlayer.update(dt);

  // Update active bind group
  const ci = char as CharacterInternal;
  if (ci._bindGroups) {
    char.textureBindGroup = ci._bindGroups[char.animPlayer.currentAnim] ?? char.textureBindGroup;
  }

  // Fall off screen - respawn
  if (char.y > 2000) {
    char.x = 960;
    char.y = 100;
    char.velX = 0;
    char.velY = 0;
  }
}

export function renderCharacter(char: Character, sprites: SpriteRenderer, pass: GPURenderPassEncoder) {
  const uv = char.animPlayer.getUV();
  const s = char.spriteSize;

  // Center the sprite on the character's hitbox
  const drawX = char.x + char.width / 2 - s / 2;
  const drawY = char.y + char.height - s;

  // Flip UV horizontally when facing left
  const flipX = char.facing === -1;
  const uvX = flipX ? uv.uvX + uv.uvW : uv.uvX;
  const uvW = flipX ? -uv.uvW : uv.uvW;

  if (char.textureBindGroup) {
    // Flush any pending solid-color sprites first
    sprites.flush(pass);

    // Draw the character with its spritesheet texture
    sprites.drawSprite({
      x: drawX, y: drawY,
      width: s, height: s,
      uvX, uvY: uv.uvY,
      uvW, uvH: uv.uvH,
      r: 1, g: 1, b: 1, a: 1,
    });
    sprites.flushWithTexture(pass, char.textureBindGroup);
  } else {
    // Fallback: colored rectangle
    sprites.drawSprite({
      x: char.x, y: char.y,
      width: char.width, height: char.height,
      r: 0.2, g: 0.6, b: 1.0, a: 1,
    });
  }
}
