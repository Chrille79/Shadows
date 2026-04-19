"""
Blender script to render block variants as 2D sprites with rounded edges.

Run in Blender: File → Scripting → Open → this file → Run Script.
Or headless:
    blender --background --python render_blocks.py

Creates a cube primitive in Blender with a Bevel modifier for smooth
rounded edges, applies each texture variant, and renders to PNG.
"""

import bpy
from pathlib import Path
from math import radians

# __file__ is unreliable in Blender's text editor; hardcode.
SCRIPT_DIR = Path(r"C:\Repos\Shadows\3d-assets\cube")

VARIANTS = [
    "solid_teal", "solid_brown", "solid_grey",
    "solid_sand", "solid_green", "solid_stone", "solid_wood",
]

RENDER_SIZE = 512
CAMERA_ANGLE_X = 0        # 0 = pure front view
CAMERA_ANGLE_Y = 0
CAMERA_ANGLE_Z = 0
CAMERA_DISTANCE = 4
ORTHO_SCALE = 2.0   # tight fit — cube fills canvas edge-to-edge for tiling

BEVEL_WIDTH = 0.1875      # size of rounded edge (0-1 scale on 2x2x2 cube)
                          # 0.1875 ≈ 48 px radius in a 512-native render,
                          # ≈ 12 px on-screen at TILE_SIZE = 128 — bumpier
                          # "plastic-toy" silhouette than tighter bevels.
BEVEL_SEGMENTS = 6        # smoothness of rounding (higher = smoother curve)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def create_rounded_cube():
    """Default 2x2x2 cube with Bevel modifier for rounded edges."""
    bpy.ops.mesh.primitive_cube_add(size=2)
    cube = bpy.context.active_object
    cube.name = "RoundedCube"

    # Bevel modifier rounds all edges
    bevel = cube.modifiers.new(name="Bevel", type="BEVEL")
    bevel.width = BEVEL_WIDTH
    bevel.segments = BEVEL_SEGMENTS
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = radians(30)
    bevel.profile = 0.5       # circular profile

    # Smooth shading so bevel curves look smooth
    for poly in cube.data.polygons:
        poly.use_smooth = True

    # Auto-smooth for sharp/smooth hybrid (optional, older Blender versions)
    try:
        cube.data.use_auto_smooth = True
        cube.data.auto_smooth_angle = radians(60)
    except AttributeError:
        pass  # Blender 4.1+ handles this differently, bevel already gives smooth

    return cube


def setup_material(obj, variant):
    tex_path = SCRIPT_DIR / f"block_texture_{variant}.png"
    if not tex_path.exists():
        raise FileNotFoundError(f"Missing: {tex_path}")

    mat = bpy.data.materials.new(name=f"BlockMaterial_{variant}")
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

    obj.data.materials.clear()
    obj.data.materials.append(mat)


def setup_camera():
    cam_data = bpy.data.cameras.new("BlockCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ORTHO_SCALE
    cam = bpy.data.objects.new("BlockCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)

    cam.location = (0, 0, CAMERA_DISTANCE)
    cam.rotation_euler = (
        radians(CAMERA_ANGLE_X),
        radians(CAMERA_ANGLE_Y),
        radians(CAMERA_ANGLE_Z),
    )
    bpy.context.scene.camera = cam
    return cam


def setup_lights():
    """Directional sun + weaker fill from opposite side. Lifts shadows
    without losing the 3D directional feel."""
    # Key: strong sun from above-front-right (illuminates RIGHT side + TOP)
    key = bpy.data.lights.new(name="Key", type="SUN")
    key.energy = 3.5
    key.angle = radians(5)
    key_obj = bpy.data.objects.new("Key", key)
    key_obj.location = (0, 0, 0)
    key_obj.rotation_euler = (radians(-45), 0, radians(-25))
    bpy.context.scene.collection.objects.link(key_obj)

    # Fill: weak sun from opposite side (softens LEFT side shadow, doesn't compete)
    fill = bpy.data.lights.new(name="Fill", type="SUN")
    fill.energy = 0.8
    fill.angle = radians(15)
    fill_obj = bpy.data.objects.new("Fill", fill)
    fill_obj.location = (0, 0, 0)
    fill_obj.rotation_euler = (radians(-20), 0, radians(135))
    bpy.context.scene.collection.objects.link(fill_obj)

    # World: very low ambient so transitions are smooth
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

    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100

    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.use_nodes = False


def render_variant(obj, variant):
    setup_material(obj, variant)
    out_path = SCRIPT_DIR / f"block_sprite_{variant}.png"
    bpy.context.scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    print(f"  rendered: {out_path.name}")


def main():
    print("Setting up scene...")
    clear_scene()
    cube = create_rounded_cube()
    setup_camera()
    setup_lights()
    setup_render()

    print(f"Rendering {len(VARIANTS)} variants at {RENDER_SIZE}x{RENDER_SIZE}...")
    for variant in VARIANTS:
        print(f"{variant}:")
        render_variant(cube, variant)

    print("\nDone.")


if __name__ == "__main__":
    main()
