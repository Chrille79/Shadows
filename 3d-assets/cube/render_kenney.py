"""
Batch-render Kenney platformer-kit GLB blocks as 2D sprites.

Uses the same camera + lighting as render_blocks.py so the sprites match
the visual style of any existing rendered blocks.

Edit `KENNEY_FILES` to choose which models to render. By default it renders
a curated subset of the most useful grass blocks for a side-scrolling game.

Run in Blender: File → Scripting → Open → Run Script.
"""

import bpy
from pathlib import Path
from math import radians

KENNEY_DIR = Path(r"C:\Users\Chris\Downloads\kenney_platformer-kit\Models\GLB format")
OUT_DIR = Path(r"C:\Repos\Shadows\3d-assets\kenney-sprites")

# Curated subset of useful grass tiles. Add or remove freely.
KENNEY_FILES = [
    "block-grass-low-long.glb",
    "block-grass-overhang-low-long.glb",
    "block-grass-low.glb",
    "block-grass-overhang.glb",
    "block-grass-edge.glb",
    "block-grass-corner.glb",
    "block-grass-corner-overhang.glb",
    "block-grass-large-slope.glb",
    "block-grass-low-large.glb",
    "block-grass-large.glb",
]

RENDER_SIZE = 512
# Side view: camera looks at +Y (model has grass on +Z = top, "front" face is -Y)
CAMERA_DISTANCE = 6
ORTHO_SCALE = 2.4         # bit larger than 2.0 since Kenney blocks vary in size


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def import_glb(filepath):
    """Import a .glb and return the top-level mesh objects."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(filepath))
    new_objects = [o for o in bpy.data.objects if o not in before]
    return [o for o in new_objects if o.type == "MESH"]


def setup_camera():
    """Side view: camera at -Y, looking toward +Y (model's front face is -Y).
    Image-up = world +Z (model's top, where grass sits)."""
    cam_data = bpy.data.cameras.new("BlockCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ORTHO_SCALE
    cam = bpy.data.objects.new("BlockCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, -CAMERA_DISTANCE, 0)
    cam.rotation_euler = (radians(90), 0, 0)
    bpy.context.scene.camera = cam


def setup_lights():
    """Lights tuned for side-view camera (looking +Y).
    Image right = +X, image up = +Z. Key from upper-right area, fill opposite."""
    # Key: from upper-right-front (above, right, slightly toward camera)
    key = bpy.data.lights.new(name="Key", type="SUN")
    key.energy = 3.5
    key.angle = radians(5)
    key_obj = bpy.data.objects.new("Key", key)
    key_obj.rotation_euler = (radians(44), radians(45), 0)
    bpy.context.scene.collection.objects.link(key_obj)

    # Fill: from upper-left-front, weaker
    fill = bpy.data.lights.new(name="Fill", type="SUN")
    fill.energy = 0.8
    fill.angle = radians(15)
    fill_obj = bpy.data.objects.new("Fill", fill)
    fill_obj.rotation_euler = (radians(44), radians(-45), 0)
    bpy.context.scene.collection.objects.link(fill_obj)

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


def remove_imported_objects():
    """Clear any object whose name starts with characters from glTF imports."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            obj.select_set(True)
    bpy.ops.object.delete()
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def render_kenney_file(filename):
    glb_path = KENNEY_DIR / filename
    if not glb_path.exists():
        print(f"  MISSING: {glb_path}")
        return

    # Clean any leftover meshes from previous render
    remove_imported_objects()

    objs = import_glb(glb_path)
    if not objs:
        print(f"  NO MESH in {filename}")
        return

    # Output filename: kenney_<filename-without-extension>.png
    out_name = "kenney_" + filename.replace(".glb", ".png")
    out_path = OUT_DIR / out_name
    bpy.context.scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    print(f"  rendered: {out_name}")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("Setting up scene...")
    clear_scene()
    setup_camera()
    setup_lights()
    setup_render()

    print(f"Rendering {len(KENNEY_FILES)} Kenney blocks at "
          f"{RENDER_SIZE}x{RENDER_SIZE}...")
    for filename in KENNEY_FILES:
        print(f"{filename}:")
        render_kenney_file(filename)

    print(f"\nDone. Outputs in: {OUT_DIR}")


if __name__ == "__main__":
    main()
