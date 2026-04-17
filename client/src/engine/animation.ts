export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasData {
  frames: Record<string, AtlasFrame>;
  meta: {
    size: { w: number; h: number };
    frame_size: { w: number; h: number };
  };
}

export interface Animation {
  name: string;
  frames: AtlasFrame[];
  atlasWidth: number;
  atlasHeight: number;
  frameCount: number;
  fps: number;
  loop: boolean;
}

export interface AnimationPlayer {
  currentAnim: string;
  frameIndex: number;
  timer: number;
  finished: boolean;
  play(name: string): void;
  update(dt: number): void;
  getUV(): { uvX: number; uvY: number; uvW: number; uvH: number };
}

export function createAnimation(name: string, atlas: AtlasData, fps: number = 12, loop: boolean = true): Animation {
  const frameKeys = Object.keys(atlas.frames).sort((a, b) => parseInt(a) - parseInt(b));
  const frames = frameKeys.map((k) => atlas.frames[k]);

  return {
    name,
    frames,
    atlasWidth: atlas.meta.size.w,
    atlasHeight: atlas.meta.size.h,
    frameCount: frames.length,
    fps,
    loop,
  };
}

export function createAnimationPlayer(animations: Record<string, Animation>): AnimationPlayer {
  const firstKey = Object.keys(animations)[0];

  const player: AnimationPlayer = {
    currentAnim: firstKey,
    frameIndex: 0,
    timer: 0,
    finished: false,

    play(name: string) {
      if (player.currentAnim === name) return;
      player.currentAnim = name;
      player.frameIndex = 0;
      player.timer = 0;
      player.finished = false;
    },

    update(dt: number) {
      const anim = animations[player.currentAnim];
      if (!anim || player.finished) return;

      player.timer += dt;
      const frameDuration = 1 / anim.fps;

      while (player.timer >= frameDuration) {
        player.timer -= frameDuration;
        if (anim.loop) {
          player.frameIndex = (player.frameIndex + 1) % anim.frameCount;
        } else {
          player.frameIndex++;
          if (player.frameIndex >= anim.frameCount) {
            player.frameIndex = anim.frameCount - 1;
            player.finished = true;
            break;
          }
        }
      }
    },

    getUV() {
      const anim = animations[player.currentAnim];
      if (!anim) return { uvX: 0, uvY: 0, uvW: 1, uvH: 1 };

      const frame = anim.frames[player.frameIndex];
      return {
        uvX: frame.x / anim.atlasWidth,
        uvY: frame.y / anim.atlasHeight,
        uvW: frame.w / anim.atlasWidth,
        uvH: frame.h / anim.atlasHeight,
      };
    },
  };

  return player;
}
