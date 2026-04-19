import type { Renderer } from './renderer';
import shaderSource from './shaders.wgsl?raw';

export interface SpriteInstance {
  x: number;
  y: number;
  width: number;
  height: number;
  uvX?: number;
  uvY?: number;
  uvW?: number;
  uvH?: number;
  r?: number;
  g?: number;
  b?: number;
  a?: number;
}

const MAX_SPRITES = 4096;
const INSTANCE_FLOATS = 12; // pos(2) + size(2) + uvOffset(2) + uvScale(2) + tint(4)
const INSTANCE_BYTE_SIZE = INSTANCE_FLOATS * 4;

export interface SpriteRenderer {
  beginFrame(): void;
  drawSprite(sprite: SpriteInstance): void;
  flush(pass: GPURenderPassEncoder): void;
  flushWithTexture(pass: GPURenderPassEncoder, bindGroup: GPUBindGroup): void;
  whiteTexture: GPUTexture;
  createTextureBindGroup(texture: GPUTexture): GPUBindGroup;
}

export function createSpriteRenderer(renderer: Renderer): SpriteRenderer {
  const { device, format, projectionBuffer } = renderer;

  // Unit quad vertices: position (2) + uv (2)
  const vertices = new Float32Array([
    // pos      uv
    0, 0,     0, 0,
    1, 0,     1, 0,
    1, 1,     1, 1,
    0, 1,     0, 1,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // Instance buffer
  const instanceData = new Float32Array(MAX_SPRITES * INSTANCE_FLOATS);
  const instanceBuffer = device.createBuffer({
    size: instanceData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  // Shader module
  const shaderModule = device.createShaderModule({ code: shaderSource });

  // Pipeline
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
      buffers: [
        // Vertex buffer
        {
          arrayStride: 16,
          stepMode: 'vertex',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },  // position
            { shaderLocation: 1, offset: 8, format: 'float32x2' },  // uv
          ],
        },
        // Instance buffer
        {
          arrayStride: INSTANCE_BYTE_SIZE,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 2, offset: 0, format: 'float32x2' },   // pos
            { shaderLocation: 3, offset: 8, format: 'float32x2' },   // size
            { shaderLocation: 4, offset: 16, format: 'float32x2' },  // uvOffset
            { shaderLocation: 5, offset: 24, format: 'float32x2' },  // uvScale
            { shaderLocation: 6, offset: 32, format: 'float32x4' },  // tint
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format,
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  // 1x1 white pixel texture (for solid-color sprites)
  const whiteTexture = device.createTexture({
    size: [1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: whiteTexture },
    new Uint8Array([255, 255, 255, 255]),
    { bytesPerRow: 4 },
    [1, 1],
  );

  // Sampler
  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  function createTextureBindGroup(texture: GPUTexture): GPUBindGroup {
    return device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: projectionBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.createView() },
      ],
    });
  }

  // Default bind group with white texture
  const defaultBindGroup = createTextureBindGroup(whiteTexture);

  let spriteCount = 0;
  let bufferOffset = 0; // running offset into instance buffer per frame
  let overflowWarnedThisFrame = false;
  let flushesThisFrame = 0;

  function drawSprite(sprite: SpriteInstance) {
    if (bufferOffset + spriteCount >= MAX_SPRITES) {
      if (!overflowWarnedThisFrame) {
        console.warn(
          `[spriteRenderer] MAX_SPRITES (${MAX_SPRITES}) exceeded this frame — dropping sprites. ` +
          `Raise MAX_SPRITES or split rendering.`,
        );
        overflowWarnedThisFrame = true;
      }
      return;
    }

    const i = (bufferOffset + spriteCount) * INSTANCE_FLOATS;
    instanceData[i + 0] = sprite.x;
    instanceData[i + 1] = sprite.y;
    instanceData[i + 2] = sprite.width;
    instanceData[i + 3] = sprite.height;
    instanceData[i + 4] = sprite.uvX ?? 0;
    instanceData[i + 5] = sprite.uvY ?? 0;
    instanceData[i + 6] = sprite.uvW ?? 1;
    instanceData[i + 7] = sprite.uvH ?? 1;
    instanceData[i + 8] = sprite.r ?? 1;
    instanceData[i + 9] = sprite.g ?? 1;
    instanceData[i + 10] = sprite.b ?? 1;
    instanceData[i + 11] = sprite.a ?? 1;
    spriteCount++;
  }

  function flushWithBindGroup(pass: GPURenderPassEncoder, bindGroup: GPUBindGroup) {
    if (spriteCount === 0) return;

    const byteOffset = bufferOffset * INSTANCE_BYTE_SIZE;
    const floatOffset = bufferOffset * INSTANCE_FLOATS;
    device.queue.writeBuffer(instanceBuffer, byteOffset, instanceData, floatOffset, spriteCount * INSTANCE_FLOATS);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setVertexBuffer(1, instanceBuffer, byteOffset);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(6, spriteCount);

    bufferOffset += spriteCount;
    spriteCount = 0;
    flushesThisFrame++;
  }

  function flush(pass: GPURenderPassEncoder) {
    flushWithBindGroup(pass, defaultBindGroup);
  }

  function flushWithTexture(pass: GPURenderPassEncoder, bindGroup: GPUBindGroup) {
    flushWithBindGroup(pass, bindGroup);
  }

  function beginFrame() {
    // Publish last frame's numbers before resetting — the dev panel reads these.
    if (import.meta.env.DEV) {
      const w = window as unknown as { __perf?: { instances: number; flushes: number } };
      (w.__perf ??= { instances: 0, flushes: 0 });
      w.__perf.instances = bufferOffset;
      w.__perf.flushes = flushesThisFrame;
    }
    bufferOffset = 0;
    spriteCount = 0;
    flushesThisFrame = 0;
    overflowWarnedThisFrame = false;
  }

  return { beginFrame, drawSprite, flush, flushWithTexture, whiteTexture, createTextureBindGroup };
}
