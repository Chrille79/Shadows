"""
Render a 9x3 grid of 27 blocks using 4 color variants, mixed per position.

Uses the same rounded-cube geometry and lighting setup as render_blocks.py.
Output: block_grid_preview.png

Run in Blender: File → Scripting → Open → this file → Run Script.
"""

import bpy
from pathlib import Path
from math import radians

SCRIPT_DIR = Path(r"C:\Repos\Shadows\3d-assets\cube")

# 4 color variants cycled across the grid
COLOR_VARIANTS = [
    "solid_brown",
    "solid_teal",
    "solid_grey",
    "solid_sand",
]

# Grid: 9 columns wide, 3 rows tall = 27 blocks
GRID_COLS = 9
GRID_ROWS = 3
BLOCK_SPACING = 2.0       # matches 2x2x2 cube size (no gap)

# Mixing pattern: use a deterministic but varied distribution across the grid
# Index into COLOR_VARIANTS for each (row, col) cell
COLOR_PATTERN = [
    # row 0 (top)
    [0, 1, 0, 2, 1, 3, 0, 2, 1],
    # row 1 (middle)
    [1, 2, 3, 0, 2, 1, 3, 0, 2],
    # row 2 (bottom)
    [2, 0, 1, 3, 0, 2, 1, 3, 0],
]

RENDER_WIDTH = 1536
RENDER_HEIGHT = 512
CAMERA_DISTANCE = 20
ORTHO_SCALE = 20          # covers 20 world units wide (9 blocks × 2 = 18, small margin)

BEVEL_WIDTH = 0.14
BEVEL_SEGMENTS = 6


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def make_material(variant):
    """Create a material for a given color variant (reused across blocks)."""
    mat_name = f"BlockMaterial_{variant}"
    existing = bpy.data.materials.get(mat_name)
    if existing:
        return existing

    tex_path = SCRIPT_DIR / f"block_texture_{variant}.png"
    if not tex_path.exists():
        raise FileNotFoundError(f"Missing: {tex_path}")

    mat = bpy.data.materials.new(name=mat_name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (400, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.55

    tex = nodes.new("ShaderNodeTexImage")
    tex.location = (-250, 0)
    tex.image = bpy.data.images.load(str(tex_path))
    tex.image.colorspace_settings.name = "sRGB"
    tex.interpolation = "Linear"

    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def create_block(location, variant):
    bpy.ops.mesh.primitive_cube_add(size=2, location=location)
    cube = bpy.context.active_object
    cube.name = f"Block_{variant}_{int(location[0])}_{int(location[1])}"

    bevel = cube.modifiers.new(name="Bevel", type="BEVEL")
    bevel.width = BEVEL_WIDTH
    bevel.segments = BEVEL_SEGMENTS
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = radians(30)
    bevel.profile = 0.5

    for poly in cube.data.polygons:
        poly.use_smooth = True

    try:
        cube.data.use_auto_smooth = True
        cube.data.auto_smooth_angle = radians(60)
    except AttributeError:
        pass

    mat = make_material(variant)
    cube.data.materials.clear()
    cube.data.materials.append(mat)


def create_grid():
    """Place blocks on the XZ plane (Y=0), centered around origin."""
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            # Center the grid
            x = (col - (GRID_COLS - 1) / 2) * BLOCK_SPACING
            y = 0
            # Top row at highest Z, moving down
            z = ((GRID_ROWS - 1) / 2 - row) * BLOCK_SPACING

            variant_idx = COLOR_PATTERN[row][col]
            variant = COLOR_VARIANTS[variant_idx]
            create_block((x, y, z), variant)


def setup_camera():
    cam_data = bpy.data.cameras.new("GridCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ORTHO_SCALE
    cam = bpy.data.objects.new("GridCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)

    # Camera in front of grid, looking at origin along -Y
    cam.location = (0, -CAMERA_DISTANCE, 0)
    cam.rotation_euler = (radians(90), 0, 0)
    bpy.context.scene.camera = cam


def setup_lights():
    # Key from above-front-right
    key = bpy.data.lights.new(name="Key", type="SUN")
    key.energy = 3.5
    key.angle = radians(5)
    key_obj = bpy.data.objects.new("Key", key)
    key_obj.rotation_euler = (radians(-45), 0, radians(-25))
    bpy.context.scene.collection.objects.link(key_obj)

    # Fill from opposite
    fill = bpy.data.lights.new(name="Fill", type="SUN")
    fill.energy = 0.8
    fill.angle = radians(15)
    fill_obj = bpy.data.objects.new("Fill", fill)
    fill_obj.rotation_euler = (radians(-20), 0, radians(135))
    bpy.context.scene.collection.objects.link(fill_obj)

    # Soft ambient
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs["Color"].default_value = (0.3, 0.3, 0.35, 1)
        bg.inputs["Strength"].default_value = 0.3


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True

    scene.render.resolution_x = RENDER_WIDTH
    scene.render.resolution_y = RENDER_HEIGHT
    scene.render.resolution_percentage = 100

    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.use_nodes = False


def main():
    print("Setting up grid scene...")
    clear_scene()
    create_grid()
    setup_camera()
    setup_lights()
    setup_render()

    out_path = SCRIPT_DIR / "block_grid_preview.png"
    bpy.context.scene.render.filepath = str(out_path)
    print(f"Rendering {GRID_COLS}x{GRID_ROWS} = {GRID_COLS*GRID_ROWS} blocks "
          f"at {RENDER_WIDTH}x{RENDER_HEIGHT}...")
    bpy.ops.render.render(write_still=True)
    print(f"\nDone. Output: {out_path}")


if __name__ == "__main__":
    main()
