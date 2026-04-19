"""
Render detailed grass overlay sprites matching the plastic-toy Mario style.
Many small cone-blades with randomized position/angle + drape blades
cascading over the front edge of the block.

Same camera orientation and lighting as render_blocks.py so grass matches
the block rendering and can be overlaid directly.

Output aspect: 4:1 wide (1024x256), grass occupies full frame.
"""

import bpy
import random
from pathlib import Path
from math import radians

SCRIPT_DIR = Path(r"C:\Repos\Shadows\3d-assets\cube")

GRASS_VARIANTS = {
    # Boosted saturation + brightness to match plastic-toy reference
    "grass_bright":  (0.28, 0.88, 0.15),
    "grass_dark":    (0.16, 0.58, 0.14),
    "grass_autumn":  (0.75, 0.80, 0.15),
    "grass_dry":     (0.85, 0.72, 0.28),
    "moss":          (0.25, 0.62, 0.28),
}

RENDER_WIDTH = 1024
RENDER_HEIGHT = 256
CAMERA_DISTANCE = 4
ORTHO_SCALE = 2.0          # matches block render (X range -1..+1)

# Blade counts
NUM_TOP_BLADES = 120       # blades on the top of the base (more coverage)
NUM_DRAPE_BLADES = 40      # blades cascading down over the front edge

RANDOM_SEED = 42

# Base bar dimensions (in world units, after transform_apply)
BASE_HALF_WIDTH = 1.0       # extends -1 to +1 in X
BASE_DEPTH = 0.15           # Z half-size (front-back thickness)
BASE_HEIGHT = 0.06          # Y half-size (thin horizontal strip)
BASE_Y_CENTER = -0.18       # vertical center of base bar


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def create_base_bar():
    """Thin wide bar along the bottom of the frame."""
    bpy.ops.mesh.primitive_cube_add(size=2)
    base = bpy.context.active_object
    base.name = "GrassBase"
    base.scale = (BASE_HALF_WIDTH, BASE_HEIGHT, BASE_DEPTH)
    base.location = (0, BASE_Y_CENTER, 0)
    bpy.ops.object.transform_apply(scale=True, location=True)

    bevel = base.modifiers.new(name="Bevel", type="BEVEL")
    bevel.width = 0.03
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = radians(30)

    for poly in base.data.polygons:
        poly.use_smooth = True

    return base


def create_blade(location, rotation_euler_deg, radius, length, name):
    """Create one cone-shaped grass blade."""
    bpy.ops.mesh.primitive_cone_add(
        radius1=radius,
        radius2=0.0,
        depth=length,
        vertices=12,
        location=location,
        rotation=(
            radians(rotation_euler_deg[0]),
            radians(rotation_euler_deg[1]),
            radians(rotation_euler_deg[2]),
        ),
    )
    blade = bpy.context.active_object
    blade.name = name
    for poly in blade.data.polygons:
        poly.use_smooth = True
    return blade


def create_top_blades():
    """Many upright-ish blades across the top of the base bar."""
    rng = random.Random(RANDOM_SEED)
    base_top_y = BASE_Y_CENTER + BASE_HEIGHT  # top surface of base
    for i in range(NUM_TOP_BLADES):
        x = rng.uniform(-0.95, 0.95)
        z = rng.uniform(-BASE_DEPTH * 0.8, BASE_DEPTH * 0.8)
        length = rng.uniform(0.15, 0.28)
        radius = rng.uniform(0.014, 0.028)

        # Slight tilt from vertical (blade mostly points up = +Y in world)
        tilt_x = rng.uniform(-25, 25)       # tilts blade front/back
        tilt_z = rng.uniform(-25, 25)       # tilts blade left/right

        # Cone default points along +Z. Rotate +90° around X to point along +Y.
        rot = (-90 + tilt_x, 0, tilt_z)

        # Position: base of blade sits on base_top_y
        y = base_top_y + length / 2
        create_blade((x, y, z), rot, radius, length, f"TopBlade_{i}")


def create_drape_blades():
    """Blades draping DOWNWARD from the top-front edge of the base bar.
    They cascade vertically (tip pointing down), visible in side view."""
    from math import sin, cos
    rng = random.Random(RANDOM_SEED + 1)
    base_top_y = BASE_Y_CENTER + BASE_HEIGHT   # top surface Y
    front_z = BASE_DEPTH                        # front face Z
    for i in range(NUM_DRAPE_BLADES):
        x = rng.uniform(-0.95, 0.95)
        length = rng.uniform(0.15, 0.28)
        radius = rng.uniform(0.015, 0.028)

        # Rotation: mostly 90° around X (tip points down in -Y),
        # with slight variance so not perfectly vertical.
        drop_angle = rng.uniform(75, 110)           # degrees from +Z
        side_tilt = rng.uniform(-20, 20)            # left/right variance

        # Base of blade sits at (x, base_top_y - epsilon, front_z - epsilon)
        # so base is embedded slightly into the bar top-front corner.
        base_y = base_top_y - 0.01
        base_z = front_z - 0.015

        # Compute cone center from base + (length/2) * tip_direction.
        # After Rx(drop_angle°), tip direction = (0, -sin(drop), cos(drop)).
        dir_y = -sin(radians(drop_angle))
        dir_z = cos(radians(drop_angle))
        center_y = base_y + (length / 2) * dir_y
        center_z = base_z + (length / 2) * dir_z

        rot = (drop_angle, 0, side_tilt)
        create_blade((x, center_y, center_z), rot, radius, length,
                     f"DrapeBlade_{i}")


def create_grass_mesh():
    base = create_base_bar()
    create_top_blades()
    create_drape_blades()

    # Join all grass parts
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.name.startswith(("GrassBase", "TopBlade", "DrapeBlade")):
            obj.select_set(True)
    bpy.context.view_layer.objects.active = base
    bpy.ops.object.join()

    grass = bpy.context.active_object
    grass.name = "Grass"
    for poly in grass.data.polygons:
        poly.use_smooth = True
    return grass


def setup_material(obj, variant_name, color_rgb):
    mat = bpy.data.materials.new(name=f"GrassMat_{variant_name}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (400, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)
    r, g, b = color_rgb
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.50

    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    obj.data.materials.clear()
    obj.data.materials.append(mat)


def setup_camera():
    """Same camera orientation as render_blocks.py: at +Z, looking -Z."""
    cam_data = bpy.data.cameras.new("GrassCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ORTHO_SCALE
    cam = bpy.data.objects.new("GrassCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, 0, CAMERA_DISTANCE)
    cam.rotation_euler = (0, 0, 0)
    bpy.context.scene.camera = cam


def setup_lights():
    """Same lighting as render_blocks.py: key right-front-up, fill opposite."""
    key = bpy.data.lights.new(name="Key", type="SUN")
    key.energy = 3.5
    key.angle = radians(5)
    key_obj = bpy.data.objects.new("Key", key)
    key_obj.rotation_euler = (radians(-45), 0, radians(-25))
    bpy.context.scene.collection.objects.link(key_obj)

    fill = bpy.data.lights.new(name="Fill", type="SUN")
    fill.energy = 0.8
    fill.angle = radians(15)
    fill_obj = bpy.data.objects.new("Fill", fill)
    fill_obj.rotation_euler = (radians(-20), 0, radians(135))
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

    scene.render.resolution_x = RENDER_WIDTH
    scene.render.resolution_y = RENDER_HEIGHT
    scene.render.resolution_percentage = 100

    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.use_nodes = False


def render_variant(grass, variant_name, color_rgb):
    setup_material(grass, variant_name, color_rgb)
    out_path = SCRIPT_DIR / f"{variant_name}_sprite.png"
    bpy.context.scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    print(f"  rendered: {out_path.name}")


def main():
    print("Setting up grass scene...")
    clear_scene()
    grass = create_grass_mesh()
    setup_camera()
    setup_lights()
    setup_render()

    vert_count = len(grass.data.vertices)
    print(f"Grass mesh: {vert_count} vertices "
          f"({NUM_TOP_BLADES} top + {NUM_DRAPE_BLADES} drape blades)")

    print(f"Rendering {len(GRASS_VARIANTS)} variants at "
          f"{RENDER_WIDTH}x{RENDER_HEIGHT}...")
    for name, color in GRASS_VARIANTS.items():
        print(f"{name}:")
        render_variant(grass, name, color)

    print("\nDone.")


if __name__ == "__main__":
    main()
