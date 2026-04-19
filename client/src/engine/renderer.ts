export const GAME_W = 1920;
export const GAME_H = 1080;
// World is a grid of 128×128 tiles (power of two — GPU-friendly for mipmaps
// and block-compressed textures). 60×30 = 7680×3840.
export const TILE_SIZE = 128;
export const WORLD_W = TILE_SIZE * 60; // 7680 — wide world, horizontal scrolling
export const WORLD_H = TILE_SIZE * 30; // 3840 — 30 tiles tall

export interface Renderer {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  projectionBuffer: GPUBuffer;
  /** Viewport dimensions in world-pixels — the visible rectangle this
   *  renderer's projection maps to clip space.  Game uses (GAME_W, GAME_H)
   *  with a moving camera; editor uses the full world size with camera
   *  fixed at origin. */
  viewportW: number;
  viewportH: number;
  beginFrame(): GPURenderPassEncoder;
  endFrame(): void;
  updateProjection(camX: number, camY: number): void;
  dispose(): void;
}

export interface InitRendererOptions {
  /** Render resolution — also sets canvas.width/height.  Defaults to
   *  GAME_W × GAME_H for the game viewport.  The editor passes the full
   *  world dimensions so the whole stage is visible at camX/camY = 0. */
  viewportW?: number;
  viewportH?: number;
  /** When true, scale canvas CSS to fit the window while keeping aspect
   *  (centered, letterboxed).  The game wants this; the editor manages
   *  its own layout and sets this to false. */
  fitWindow?: boolean;
}

export async function initRenderer(
  canvas: HTMLCanvasElement,
  opts: InitRendererOptions = {},
): Promise<Renderer> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser.');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('Failed to get GPU adapter.');
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('Failed to get WebGPU canvas context.');
  }
  const format = navigator.gpu.getPreferredCanvasFormat();

  const viewportW = opts.viewportW ?? GAME_W;
  const viewportH = opts.viewportH ?? GAME_H;
  canvas.width = viewportW;
  canvas.height = viewportH;

  context.configure({ device, format, alphaMode: 'opaque' });

  // Scale canvas display to fit window while maintaining aspect ratio.  Only
  // the game does this; the editor manages its own CSS sizing.
  const fitWindow = opts.fitWindow ?? true;
  function fitCanvas() {
    const scale = Math.min(window.innerWidth / viewportW, window.innerHeight / viewportH);
    canvas.style.width = `${viewportW * scale}px`;
    canvas.style.height = `${viewportH * scale}px`;
    canvas.style.margin = 'auto';
    canvas.style.position = 'absolute';
    canvas.style.top = '50%';
    canvas.style.left = '50%';
    canvas.style.transform = 'translate(-50%, -50%)';
  }
  if (fitWindow) {
    fitCanvas();
    window.addEventListener('resize', fitCanvas);
  }

  // Orthographic projection uniform buffer (mat4x4f = 64 bytes)
  const projectionBuffer = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  let commandEncoder: GPUCommandEncoder;
  let passEncoder: GPURenderPassEncoder;

  function updateProjection(camX: number, camY: number) {
    // Orthographic projection with camera offset.
    // Maps (camX, camY)-(camX+viewportW, camY+viewportH) to clip space, Y-down.
    const proj = new Float32Array([
      2 / viewportW, 0, 0, 0,
      0, -2 / viewportH, 0, 0,
      0, 0, 1, 0,
      -2 * camX / viewportW - 1, 2 * camY / viewportH + 1, 0, 1,
    ]);
    device.queue.writeBuffer(projectionBuffer, 0, proj);
  }

  function beginFrame(): GPURenderPassEncoder {
    commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.53, g: 0.80, b: 0.95, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    return passEncoder;
  }

  function endFrame() {
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  // Set initial projection
  updateProjection(0, 0);

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (fitWindow) window.removeEventListener('resize', fitCanvas);
    projectionBuffer.destroy();
    // Note: GPUDevice is not explicitly destroyed — handled by GC when nothing references it.
  }

  return {
    device,
    context,
    format,
    canvas,
    projectionBuffer,
    viewportW,
    viewportH,
    beginFrame,
    endFrame,
    updateProjection,
    dispose,
  };
}
