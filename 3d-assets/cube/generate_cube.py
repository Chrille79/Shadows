"""
Generate cube.gltf + cube.bin — chamfered cube (Mario-block style)
centered at origin, with beveled edges and corners.

Structure:
- 6 main face quads (slightly smaller, at +/-1 on their axis)
- 12 bevel edge quads (connecting adjacent main faces)
- 8 corner chamfer triangles

Main face UVs map to full [0,1]x[0,1] of texture.
Bevel and corner UVs sample the center of texture (solid color).
"""

import json
import struct
import math
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent

# Cube size +/-1, chamfer width
S = 1.0      # half-size of cube
C = 0.1      # chamfer inset (so main face extends from -(S-C) to +(S-C) on in-plane axes)
I = S - C    # inner extent of main face

# Accumulate vertex attributes
positions = []
normals = []
uvs = []
indices = []


def _cross(a, b):
    return (a[1]*b[2] - a[2]*b[1],
            a[2]*b[0] - a[0]*b[2],
            a[0]*b[1] - a[1]*b[0])


def _sub(a, b):
    return (a[0]-b[0], a[1]-b[1], a[2]-b[2])


def _dot(a, b):
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]


def _winding_is_ccw(v0, v1, v2, normal):
    """Returns True if triangle v0→v1→v2 is CCW as seen from the normal side."""
    cross = _cross(_sub(v1, v0), _sub(v2, v0))
    return _dot(cross, normal) > 0


def add_quad(verts, normal, uvs_per_vert):
    """verts = 4 positions, any winding. Auto-corrects to CCW from normal side.
       Triangulates first triangle (0,1,2) — if wrong, flips all to CW of input."""
    base = len(positions)
    v0, v1, v2, v3 = verts
    # Check first triangle winding and flip all indices if needed
    if _winding_is_ccw(v0, v1, v2, normal):
        tri_indices = [base + 0, base + 1, base + 2,
                       base + 0, base + 2, base + 3]
    else:
        tri_indices = [base + 0, base + 2, base + 1,
                       base + 0, base + 3, base + 2]
    for v, uv in zip(verts, uvs_per_vert):
        positions.append(v)
        normals.append(normal)
        uvs.append(uv)
    indices.extend(tri_indices)


def add_tri(verts, normal, uvs_per_vert):
    base = len(positions)
    v0, v1, v2 = verts
    if _winding_is_ccw(v0, v1, v2, normal):
        tri_indices = [base + 0, base + 1, base + 2]
    else:
        tri_indices = [base + 0, base + 2, base + 1]
    for v, uv in zip(verts, uvs_per_vert):
        positions.append(v)
        normals.append(normal)
        uvs.append(uv)
    indices.extend(tri_indices)


# ---------- 6 main faces ----------
# UVs on main faces span full [0,1] x [0,1]
MAIN_UV = [(0, 0), (1, 0), (1, 1), (0, 1)]  # TL, TR, BR, BL

# +X face (right), normal (1,0,0), at x=S, varies in y,z
add_quad(
    [(S, I, -I), (S, I, I), (S, -I, I), (S, -I, -I)],
    (1, 0, 0), MAIN_UV,
)
# -X face (left), normal (-1,0,0), at x=-S
add_quad(
    [(-S, I, I), (-S, I, -I), (-S, -I, -I), (-S, -I, I)],
    (-1, 0, 0), MAIN_UV,
)
# +Y face (top), normal (0,1,0), at y=S
add_quad(
    [(-I, S, -I), (I, S, -I), (I, S, I), (-I, S, I)],
    (0, 1, 0), MAIN_UV,
)
# -Y face (bottom), normal (0,-1,0), at y=-S
add_quad(
    [(-I, -S, I), (I, -S, I), (I, -S, -I), (-I, -S, -I)],
    (0, -1, 0), MAIN_UV,
)
# +Z face (front), normal (0,0,1), at z=S
add_quad(
    [(-I, I, S), (I, I, S), (I, -I, S), (-I, -I, S)],
    (0, 0, 1), MAIN_UV,
)
# -Z face (back), normal (0,0,-1), at z=-S
add_quad(
    [(I, I, -S), (-I, I, -S), (-I, -I, -S), (I, -I, -S)],
    (0, 0, -1), MAIN_UV,
)

# ---------- 12 bevel edge quads ----------
# Each edge connects two adjacent main faces. Normal = average of the two face normals (normalized).
SQ2 = 1.0 / math.sqrt(2)
BEVEL_UV = [(0.5, 0.5)] * 4  # all bevels use center of texture (solid color)

# Top edges (connecting +Y face to each side)
add_quad(  # +Y/+Z
    [(-I, S, I), (I, S, I), (I, I, S), (-I, I, S)],
    (0, SQ2, SQ2), BEVEL_UV,
)
add_quad(  # +Y/-Z
    [(I, S, -I), (-I, S, -I), (-I, I, -S), (I, I, -S)],
    (0, SQ2, -SQ2), BEVEL_UV,
)
add_quad(  # +Y/+X
    [(I, S, I), (I, S, -I), (S, I, -I), (S, I, I)],
    (SQ2, SQ2, 0), BEVEL_UV,
)
add_quad(  # +Y/-X
    [(-I, S, -I), (-I, S, I), (-S, I, I), (-S, I, -I)],
    (-SQ2, SQ2, 0), BEVEL_UV,
)

# Bottom edges
add_quad(  # -Y/-Z
    [(-I, -I, -S), (I, -I, -S), (I, -S, -I), (-I, -S, -I)],
    (0, -SQ2, -SQ2), BEVEL_UV,
)
add_quad(  # -Y/+Z
    [(I, -I, S), (-I, -I, S), (-I, -S, I), (I, -S, I)],
    (0, -SQ2, SQ2), BEVEL_UV,
)
add_quad(  # -Y/+X
    [(S, -I, I), (S, -I, -I), (I, -S, -I), (I, -S, I)],
    (SQ2, -SQ2, 0), BEVEL_UV,
)
add_quad(  # -Y/-X
    [(-S, -I, -I), (-S, -I, I), (-I, -S, I), (-I, -S, -I)],
    (-SQ2, -SQ2, 0), BEVEL_UV,
)

# Vertical edges (connecting side faces at front/back)
add_quad(  # +X/+Z
    [(S, I, I), (S, -I, I), (I, -I, S), (I, I, S)],
    (SQ2, 0, SQ2), BEVEL_UV,
)
add_quad(  # +X/-Z
    [(S, I, -I), (I, I, -S), (I, -I, -S), (S, -I, -I)],
    (SQ2, 0, -SQ2), BEVEL_UV,
)
add_quad(  # -X/+Z
    [(-I, I, S), (-I, -I, S), (-S, -I, I), (-S, I, I)],
    (-SQ2, 0, SQ2), BEVEL_UV,
)
add_quad(  # -X/-Z
    [(-I, I, -S), (-S, I, -I), (-S, -I, -I), (-I, -I, -S)],
    (-SQ2, 0, -SQ2), BEVEL_UV,
)

# ---------- 8 corner chamfer triangles ----------
SQ3 = 1.0 / math.sqrt(3)
CORNER_UV = [(0.5, 0.5)] * 3

# +X+Y+Z
add_tri(
    [(S, I, I), (I, I, S), (I, S, I)],
    (SQ3, SQ3, SQ3), CORNER_UV,
)
# +X+Y-Z
add_tri(
    [(I, S, -I), (I, I, -S), (S, I, -I)],
    (SQ3, SQ3, -SQ3), CORNER_UV,
)
# +X-Y+Z
add_tri(
    [(S, -I, I), (I, -I, S), (I, -S, I)],
    (SQ3, -SQ3, SQ3), CORNER_UV,
)
# +X-Y-Z
add_tri(
    [(I, -S, -I), (I, -I, -S), (S, -I, -I)],
    (SQ3, -SQ3, -SQ3), CORNER_UV,
)
# -X+Y+Z
add_tri(
    [(-I, I, S), (-S, I, I), (-I, S, I)],
    (-SQ3, SQ3, SQ3), CORNER_UV,
)
# -X+Y-Z
add_tri(
    [(-S, I, -I), (-I, I, -S), (-I, S, -I)],
    (-SQ3, SQ3, -SQ3), CORNER_UV,
)
# -X-Y+Z
add_tri(
    [(-I, -I, S), (-S, -I, I), (-I, -S, I)],
    (-SQ3, -SQ3, SQ3), CORNER_UV,
)
# -X-Y-Z
add_tri(
    [(-I, -I, -S), (-I, -S, -I), (-S, -I, -I)],
    (-SQ3, -SQ3, -SQ3), CORNER_UV,
)

# ---------- Pack binary buffer ----------
pos_bytes = b"".join(struct.pack("<fff", *p) for p in positions)
norm_bytes = b"".join(struct.pack("<fff", *n) for n in normals)
uv_bytes = b"".join(struct.pack("<ff", *uv) for uv in uvs)
idx_bytes = b"".join(struct.pack("<H", i) for i in indices)
# Pad indices to 4-byte boundary
if len(idx_bytes) % 4:
    idx_bytes += b"\x00" * (4 - len(idx_bytes) % 4)

buffer = pos_bytes + norm_bytes + uv_bytes + idx_bytes

pos_offset = 0
norm_offset = len(pos_bytes)
uv_offset = norm_offset + len(norm_bytes)
idx_offset = uv_offset + len(uv_bytes)

xs = [p[0] for p in positions]
ys = [p[1] for p in positions]
zs = [p[2] for p in positions]
pos_min = [min(xs), min(ys), min(zs)]
pos_max = [max(xs), max(ys), max(zs)]

vertex_count = len(positions)
index_count = len(indices)

# ---------- Write files ----------
(OUT_DIR / "cube.bin").write_bytes(buffer)

gltf = {
    "asset": {"version": "2.0", "generator": "shadows-chamfered-cube"},
    "scene": 0,
    "scenes": [{"nodes": [0]}],
    "nodes": [{"mesh": 0, "name": "ChamferedCube"}],
    "meshes": [{
        "name": "CubeMesh",
        "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
            "indices": 3,
            "material": 0,
        }],
    }],
    "materials": [{
        "name": "BlockMaterial",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0},
            "metallicFactor": 0.0,
            "roughnessFactor": 0.85,
        },
    }],
    "textures": [{"source": 0, "sampler": 0}],
    "images": [{"uri": "block_texture.png"}],
    "samplers": [{
        "magFilter": 9729, "minFilter": 9987,
        "wrapS": 10497, "wrapT": 10497,
    }],
    "accessors": [
        {
            "bufferView": 0, "byteOffset": 0,
            "componentType": 5126, "count": vertex_count, "type": "VEC3",
            "min": pos_min, "max": pos_max,
        },
        {
            "bufferView": 1, "byteOffset": 0,
            "componentType": 5126, "count": vertex_count, "type": "VEC3",
        },
        {
            "bufferView": 2, "byteOffset": 0,
            "componentType": 5126, "count": vertex_count, "type": "VEC2",
        },
        {
            "bufferView": 3, "byteOffset": 0,
            "componentType": 5123, "count": index_count, "type": "SCALAR",
        },
    ],
    "bufferViews": [
        {"buffer": 0, "byteOffset": pos_offset, "byteLength": len(pos_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": norm_offset, "byteLength": len(norm_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": uv_offset, "byteLength": len(uv_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": idx_offset, "byteLength": len(idx_bytes), "target": 34963},
    ],
    "buffers": [{"uri": "cube.bin", "byteLength": len(buffer)}],
}

(OUT_DIR / "cube.gltf").write_text(json.dumps(gltf, indent=2))

print(f"Wrote: {OUT_DIR / 'cube.gltf'}")
print(f"Wrote: {OUT_DIR / 'cube.bin'} ({len(buffer)} bytes)")
print(f"Vertices: {vertex_count}, Triangles: {index_count // 3}")
print(f"Bevel size: {C} (cube size: +/-{S})")
print(f"Texture reference: block_texture.png")
