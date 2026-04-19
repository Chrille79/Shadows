import type { Renderer } from './renderer';
import { config } from '../config';

// Vertical sky gradient drawn as a fullscreen triangle.  The gradient is
// parameterized in *world* space — as the camera moves up/down through the
// world the visible slice shifts, so tall levels naturally show more zenith
// color at the top without needing a taller texture.

const WGSL = /* wgsl */`
struct Uniforms {
  topColor: vec4f,
  bottomColor: vec4f,
  camY: f32,
  worldH: f32,
  gameH: f32,
  _pad: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) screenY: f32,
}

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VSOut {
  // Fullscreen triangle: covers the viewport with 3 vertices, no buffer needed.
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  let p = positions[vid];
  var out: VSOut;
  out.pos = vec4f(p, 0.0, 1.0);
  // Map NDC y (1 at top, -1 at bottom) → screen-y 0..gameH (top-down).
  out.screenY = (1.0 - p.y) * 0.5 * u.gameH;
  return out;
}

@fragment
fn fs(input: VSOut) -> @location(0) vec4f {
  let worldY = input.screenY + u.camY;
  let t = clamp(worldY / u.worldH, 0.0, 1.0);
  return mix(u.topColor, u.bottomColor, t);
}
`;

export interface SkyRenderer {
  render(pass: GPURenderPassEncoder, camY: number, worldH: number): void;
}

export function createSkyRenderer(renderer: Renderer): SkyRenderer {
  const { device, format } = renderer;

  const uniformBuffer = device.createBuffer({
    size: 48, // 2 vec4 (32) + 4 f32 (16)
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    }],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const module = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const uniformData = new Float32Array(12);

  function render(pass: GPURenderPassEncoder, camY: number, worldH: number) {
    if (!config.layers.sky) return;
    const top = config.sky.top;
    const bot = config.sky.bottom;
    uniformData[0] = top.r;  uniformData[1] = top.g;  uniformData[2] = top.b;  uniformData[3] = 1;
    uniformData[4] = bot.r;  uniformData[5] = bot.g;  uniformData[6] = bot.b;  uniformData[7] = 1;
    uniformData[8] = camY;
    uniformData[9] = worldH;
    uniformData[10] = renderer.viewportH;
    uniformData[11] = 0;
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
  }

  return { render };
}
