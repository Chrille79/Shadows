export interface Renderer {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  projectionBuffer: GPUBuffer;
  beginFrame(): GPURenderPassEncoder;
  endFrame(): void;
  updateProjection(width: number, height: number): void;
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
  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({ device, format, alphaMode: 'opaque' });

  // Orthographic projection uniform buffer (mat4x4f = 64 bytes)
  const projectionBuffer = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  let commandEncoder: GPUCommandEncoder;
  let passEncoder: GPURenderPassEncoder;

  function updateProjection(width: number, height: number) {
    // Orthographic projection: maps (0,0)-(width,height) to clip space
    // Y-down: top=0, bottom=height
    const proj = new Float32Array([
      2 / width, 0, 0, 0,
      0, -2 / height, 0, 0,
      0, 0, 1, 0,
      -1, 1, 0, 1,
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
  handleResize();

  function handleResize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 1920) | 0;
    const h = Math.max(rect.height, 1080) | 0;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      updateProjection(w, h);
    }
  }

  window.addEventListener('resize', handleResize);
  // Also observe layout changes
  const ro = new ResizeObserver(handleResize);
  ro.observe(canvas);

  return {
    device,
    context,
    format,
    canvas,
    projectionBuffer,
    beginFrame,
    endFrame,
    updateProjection,
  };
}
