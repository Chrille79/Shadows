import type { Renderer } from './renderer';
import type { SpriteRenderer } from './spriteRenderer';
import { loadTextureBitmap } from './textureLoader';
import { config } from '../config';

import cloud01Url from '../assets/backgrounds/cloud_01.png?url';
import cloud02Url from '../assets/backgrounds/cloud_02.png?url';

// Cloud sprites drift through the sky above groundY.  Each cloud lives in
// world space at a fixed y-offset from the horizon and a time-varying x;
// a small parallax factor makes them feel distant without needing a second
// texture.  Hill bands are drawn by the separate procedural hillsRenderer.

export interface Cloud {
  bindGroup: GPUBindGroup;
  srcW: number;
  srcH: number;
  /** Base world-x at time 0.  The cloud drifts horizontally from here. */
  baseX: number;
  /** World-y offset relative to groundY (negative = higher in sky). */
  yOffsetFromGround: number;
  /** Scale factor applied to srcW/srcH. */
  scale: number;
  /** Horizontal drift speed in world-px per second. */
  driftSpeed: number;
  /** Parallax factor (camera-driven x shift), smaller = feels further. */
  parallax: number;
}

export interface ParallaxRenderer {
  clouds: Cloud[];
  render(
    pass: GPURenderPassEncoder,
    sprites: SpriteRenderer,
    camX: number,
    camY: number,
    groundY: number,
    nowMs: number,
  ): void;
}

export async function createParallaxRenderer(
  renderer: Renderer,
  sprites: SpriteRenderer,
): Promise<ParallaxRenderer> {
  const { device } = renderer;

  async function loadLayer(url: string) {
    const tex = await loadTextureBitmap(device, url);
    return {
      bindGroup: sprites.createTextureBindGroup(tex),
      srcW: tex.width,
      srcH: tex.height,
    };
  }

  const [cloud1Tex, cloud2Tex] = await Promise.all([
    loadLayer(cloud01Url),
    loadLayer(cloud02Url),
  ]);

  const clouds: Cloud[] = [
    {
      bindGroup: cloud1Tex.bindGroup,
      srcW: cloud1Tex.srcW,
      srcH: cloud1Tex.srcH,
      baseX: 400,
      yOffsetFromGround: -900,
      scale: 0.6,
      driftSpeed: -8,
      parallax: 0.3,
    },
    {
      bindGroup: cloud2Tex.bindGroup,
      srcW: cloud2Tex.srcW,
      srcH: cloud2Tex.srcH,
      baseX: 1300,
      yOffsetFromGround: -700,
      scale: 0.5,
      driftSpeed: -12,
      parallax: 0.3,
    },
    {
      bindGroup: cloud1Tex.bindGroup,
      srcW: cloud1Tex.srcW,
      srcH: cloud1Tex.srcH,
      baseX: 2400,
      yOffsetFromGround: -1000,
      scale: 0.45,
      driftSpeed: -6,
      parallax: 0.3,
    },
  ];

  function render(
    pass: GPURenderPassEncoder,
    sprites: SpriteRenderer,
    camX: number,
    camY: number,
    groundY: number,
    nowMs: number,
  ) {
    void camY;
    if (!config.layers.clouds) return;
    const t = nowMs / 1000;
    for (const c of clouds) {
      const cloudW = c.srcW * c.scale;
      const cloudH = c.srcH * c.scale;
      const period = renderer.viewportW + cloudW;
      let screenX = c.baseX + c.driftSpeed * t - camX * c.parallax;
      screenX = ((screenX % period) + period) % period - cloudW;
      const worldX = camX + screenX;
      const worldY = groundY + c.yOffsetFromGround;
      sprites.drawSprite({
        x: worldX,
        y: worldY,
        width: cloudW,
        height: cloudH,
      });
      sprites.flushWithTexture(pass, c.bindGroup);
    }
  }

  return { clouds, render };
}
