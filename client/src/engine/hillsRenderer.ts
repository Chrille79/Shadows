import type { Renderer } from './renderer';
import { GAME_W, GAME_H } from './renderer';
import type { HillWaveConfig } from '../config';

// Procedural sine-wave hill band drawn as a fullscreen triangle.  The shader
// evaluates two summed sines per pixel, masks out any fragment above the
// resulting curve, and fills the rest with a flat color.  Parallax is done
// entirely in the shader by sampling the wave at a camera-shifted x.
//
// Two instances are used per frame (far + near) with different colors, freqs
// and parallax factors — cheaper than image layers and fully live-tunable.

const WGSL = /* wgsl */`
struct Uniforms {
  color: vec4f,
  camX: f32,
  camY: f32,
  gameW: f32,
  gameH: f32,
  groundY: f32,
  amplitude: f32,
  baseOffset: f32,
  freq1: f32,
  freq2: f32,
  phase: f32,
  parallax: f32,
  _pad0: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) worldXY: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VSOut {
  var p = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  let ndc = p[vid];
  var out: VSOut;
  out.pos = vec4f(ndc, 0.0, 1.0);
  // NDC → screen-xy (top-down, 0..gameW / 0..gameH) → world-xy.
  let screenX = (ndc.x * 0.5 + 0.5) * u.gameW;
  let screenY = (1.0 - ndc.y) * 0.5 * u.gameH;
  out.worldXY = vec2f(screenX + u.camX, screenY + u.camY);
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let x = in.worldXY.x;
  let y = in.worldXY.y;
  // Parallax sample-x: layer appears to move at u.parallax fraction of world.
  // parallax=1 tracks world 1:1; parallax=0 pinned to screen.
  let sx = x - u.camX * (1.0 - u.parallax);
  let wave =
    sin(sx * u.freq1 + u.phase) * 0.6 +
    sin(sx * u.freq2 + u.phase * 1.7) * 0.4;
  let hillTop = u.groundY - u.baseOffset - wave * u.amplitude;
  if (y < hillTop) { discard; }
  return u.color;
}
`;

export interface HillsRenderer {
  render(
    pass: GPURenderPassEncoder,
    layer: HillWaveConfig,
    camX: number,
    camY: number,
    groundY: number,
  ): void;
}

export function createHillsRenderer(renderer: Renderer): HillsRenderer {
  const { device, format } = renderer;

  const uniformBuffer = device.createBuffer({
    size: 64, // vec4 color (16) + 12 f32 (48) = 64 bytes
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

  const buf = new Float32Array(16);

  function render(
    pass: GPURenderPassEncoder,
    layer: HillWaveConfig,
    camX: number,
    camY: number,
    groundY: number,
  ) {
    buf[0] = layer.color.r; buf[1] = layer.color.g;
    buf[2] = layer.color.b; buf[3] = layer.color.a;
    buf[4] = camX;
    buf[5] = camY;
    buf[6] = GAME_W;
    buf[7] = GAME_H;
    buf[8] = groundY;
    buf[9] = layer.amplitude;
    buf[10] = layer.baseOffset;
    buf[11] = layer.freq1;
    buf[12] = layer.freq2;
    buf[13] = layer.phase;
    buf[14] = layer.parallax;
    buf[15] = 0;
    device.queue.writeBuffer(uniformBuffer, 0, buf);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
  }

  return { render };
}
