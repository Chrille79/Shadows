import type { SpriteRenderer } from '../engine/spriteRenderer';
import type { Platform } from './stage';
import type { AnimationPlayer } from '../engine/animation';
import { createAnimation, createAnimationPlayer } from '../engine/animation';
import type { AtlasData } from '../engine/animation';
import { loadTexture } from '../engine/textureLoader';
import type { InputBindings } from './input';
import { isHeld, wasPressed } from './input';

// Player atlases
import idleAtlas from '../assets/ninja-spritesheet/idle_right/atlas.json';
import runAtlas from '../assets/ninja-spritesheet/run_right/atlas.json';
import jumpAtlas from '../assets/ninja-spritesheet/jump_right/atlas.json';

export interface SpriteSet {
  atlases: Record<string, AtlasData>;
  urls: Record<string, string>;
}

export const PLAYER_SPRITES: SpriteSet = {
  atlases: {
    idle: idleAtlas as AtlasData,
    run: runAtlas as AtlasData,
    jump: jumpAtlas as AtlasData,
  },
  urls: {
    idle: new URL('../assets/ninja-spritesheet/idle_right/spritesheet.png', import.meta.url).href,
    run: new URL('../assets/ninja-spritesheet/run_right/spritesheet.png', import.meta.url).href,
    jump: new URL('../assets/ninja-spritesheet/jump_right/spritesheet.png', import.meta.url).href,
  },
};

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
  bindings: InputBindings;
  spriteSet: SpriteSet;
}

const GRAVITY = 1800;
const MOVE_SPEED = 400;
// Peak jump height = v² / (2g). Targeting 1.5 tiles (198 px) clears one tile
// comfortably: sqrt(2 * 1800 * 198) ≈ 844 → round up for a little margin.
const JUMP_FORCE = -845;
const FRICTION = 0.85;

export function createCharacter(x: number, y: number, bindings: InputBindings, spriteSet: SpriteSet): Character {
  const animPlayer = createAnimationPlayer({
    idle: createAnimation('idle', spriteSet.atlases.idle, 12),
    run: createAnimation('run', spriteSet.atlases.run, 16),
    jump: createAnimation('jump', spriteSet.atlases.jump, 18),
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
    bindings,
    spriteSet,
  };
}

export async function loadCharacterTextures(
  char: Character,
  device: GPUDevice,
  sprites: SpriteRenderer,
) {
  const uniqueUrls = [...new Set(Object.values(char.spriteSet.urls))];
  const textures = await Promise.all(uniqueUrls.map((url) => loadTexture(device, url)));
  const urlToTex = new Map(uniqueUrls.map((url, i) => [url, textures[i]]));

  const bindGroups: Record<string, GPUBindGroup> = {};
  for (const [anim, url] of Object.entries(char.spriteSet.urls)) {
    bindGroups[anim] = sprites.createTextureBindGroup(urlToTex.get(url)!);
  }

  for (const anim of ['idle', 'run', 'jump']) {
    if (!bindGroups[anim]) {
      bindGroups[anim] = bindGroups.idle;
    }
  }

  char.textureBindGroup = bindGroups.idle;
  (char as CharacterInternal)._bindGroups = bindGroups;
}

interface CharacterInternal extends Character {
  _bindGroups?: Record<string, GPUBindGroup>;
}

export function updateCharacter(char: Character, dt: number, platforms: Platform[]) {
  const b = char.bindings;

  // Movement
  const moving = isHeld(b, 'left') || isHeld(b, 'right');

  if (isHeld(b, 'left')) {
    char.velX = -MOVE_SPEED;
    char.facing = -1;
  } else if (isHeld(b, 'right')) {
    char.velX = MOVE_SPEED;
    char.facing = 1;
  } else {
    char.velX *= FRICTION;
  }

  // Jump
  if (wasPressed(b, 'jump') && char.grounded) {
    char.velY = JUMP_FORCE;
    char.grounded = false;
  }

  // Apply gravity
  char.velY += GRAVITY * dt;

  // Move
  char.x += char.velX * dt;
  char.y += char.velY * dt;

  // Platform collision — only land from above
  const prevBottom = char.y + char.height - char.velY * dt;
  char.grounded = false;
  for (const p of platforms) {
    const charBottom = char.y + char.height;
    const wasAbove = prevBottom <= p.y + 4;
    if (
      char.velY >= 0 &&
      wasAbove &&
      char.x + char.width > p.x &&
      char.x < p.x + p.width &&
      charBottom >= p.y &&
      charBottom <= p.y + p.height + char.velY * dt + 4
    ) {
      char.y = p.y - char.height;
      char.velY = 0;
      char.grounded = true;
    }
  }

  // Animation state (priority: jump > run > idle)
  if (!char.grounded) {
    char.animPlayer.play('jump');
  } else if (moving) {
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
  if (char.y > 3000) {
    char.x = 200;
    char.y = 100;
    char.velX = 0;
    char.velY = 0;
  }
}

export function renderCharacter(char: Character, sprites: SpriteRenderer, pass: GPURenderPassEncoder) {
  const uv = char.animPlayer.getUV();
  const s = char.spriteSize;

  const drawX = char.x + char.width / 2 - s / 2;
  const footOffset = 12;
  const drawY = char.y + char.height - s + footOffset;

  const flipX = char.facing === -1;
  const uvX = flipX ? uv.uvX + uv.uvW : uv.uvX;
  const uvW = flipX ? -uv.uvW : uv.uvW;

  // Flush any pending sprites from previous layers before switching texture.
  sprites.flush(pass);

  if (char.textureBindGroup) {
    sprites.drawSprite({
      x: drawX, y: drawY,
      width: s, height: s,
      uvX, uvY: uv.uvY,
      uvW, uvH: uv.uvH,
      r: 1, g: 1, b: 1, a: 1,
    });
    sprites.flushWithTexture(pass, char.textureBindGroup);
  } else {
    // Fallback placeholder: flat-color rect using the default (white) bind group.
    sprites.drawSprite({
      x: char.x, y: char.y,
      width: char.width, height: char.height,
      r: 0.2, g: 0.6, b: 1.0, a: 1,
    });
    sprites.flush(pass);
  }
}
