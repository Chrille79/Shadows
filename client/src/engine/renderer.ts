export const GAME_W = 1920;
export const GAME_H = 1080;
// World is a grid of 132×132 tiles. 58×44 = 7656×5808, rounded to even tile counts.
export const TILE_SIZE = 132;
export const WORLD_W = TILE_SIZE * 58; // 7656 — wide world, horizontal scrolling
export const WORLD_H = TILE_SIZE * 44; // 5808 — 44 tiles tall

export interface Renderer {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  projectionBuffer: GPUBuffer;
  beginFrame(): GPURenderPassEncoder;
  endFrame(): void;
  updateProjection(camX: number, camY: number): void;
  dispose(): void;
}

export async function initRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
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

  // Fixed game resolution
  canvas.width = GAME_W;
  canvas.height = GAME_H;

  context.configure({ device, format, alphaMode: 'opaque' });

  // Scale canvas display to fit window while maintaining aspect ratio
  function fitCanvas() {
    const scale = Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H);
    canvas.style.width = `${GAME_W * scale}px`;
    canvas.style.height = `${GAME_H * scale}px`;
    canvas.style.margin = 'auto';
    canvas.style.position = 'absolute';
    canvas.style.top = '50%';
    canvas.style.left = '50%';
    canvas.style.transform = 'translate(-50%, -50%)';
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  // Orthographic projection uniform buffer (mat4x4f = 64 bytes)
  const projectionBuffer = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  let commandEncoder: GPUCommandEncoder;
  let passEncoder: GPURenderPassEncoder;

  function updateProjection(camX: number, camY: number) {
    // Orthographic projection with camera offset
    // Maps (camX, camY)-(camX+GAME_W, camY+GAME_H) to clip space, Y-down
    const proj = new Float32Array([
      2 / GAME_W, 0, 0, 0,
      0, -2 / GAME_H, 0, 0,
      0, 0, 1, 0,
      -2 * camX / GAME_W - 1, 2 * camY / GAME_H + 1, 0, 1,
    ]);
    device.queue.writeBuffer(projectionBuffer, 0, proj);
  }

  function beginFrame(): GPURenderPassEncoder {
    commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.05, g: 0.05, b: 0.12, a: 1.0 },
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
    window.removeEventListener('resize', fitCanvas);
    projectionBuffer.destroy();
    // Note: GPUDevice is not explicitly destroyed — handled by GC when nothing references it.
  }

  return {
    device,
    context,
    format,
    canvas,
    projectionBuffer,
    beginFrame,
    endFrame,
    updateProjection,
    dispose,
  };
}
