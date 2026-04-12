// Shadows - 2D Sprite Renderer Shaders

struct VertexInput {
    @location(0) position: vec2f,
    @location(1) uv: vec2f,
};

struct InstanceInput {
    @location(2) pos: vec2f,
    @location(3) size: vec2f,
    @location(4) uvOffset: vec2f,
    @location(5) uvScale: vec2f,
    @location(6) tint: vec4f,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
    @location(1) tint: vec4f,
};

@group(0) @binding(0) var<uniform> projection: mat4x4f;

@vertex
fn vs_main(vert: VertexInput, inst: InstanceInput) -> VertexOutput {
    var out: VertexOutput;

    let worldPos = vert.position * inst.size + inst.pos;
    out.position = projection * vec4f(worldPos, 0.0, 1.0);
    out.uv = vert.uv * inst.uvScale + inst.uvOffset;
    out.tint = inst.tint;

    return out;
}

@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let texColor = textureSample(tex, texSampler, in.uv);
    let color = texColor * in.tint;

    if (color.a < 0.01) {
        discard;
    }

    return color;
}
