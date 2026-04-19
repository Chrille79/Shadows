"""
Extract grass-only mesh from Kenney block-grass GLB files.

For each input GLB:
1. Import the model
2. Identify the "greenest" material (= grass)
3. Delete all faces using non-grass materials
4. Export remaining geometry as GLB

Run in Blender: Scripting tab → Open this file → Run Script.
Output: <KENNEY_FILE>_grass.glb in OUT_DIR.
"""

import bpy
from pathlib import Path

KENNEY_DIR = Path(r"C:\Users\Chris\Downloads\kenney_platformer-kit\Models\GLB format")
OUT_DIR = Path(r"C:\Repos\Shadows\3d-assets\kenney-grass-only")

# Files to process. Pick the ones with the most interesting grass shapes.
FILES = [
    "block-grass-overhang-low-long.glb",
    "block-grass-overhang.glb",
    "block-grass-overhang-corner.glb",
    "block-grass-overhang-edge.glb",
    "block-grass-low-long.glb",
    "block-grass-low.glb",
    "block-grass-edge.glb",
    "block-grass-corner.glb",
]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def material_greenness(mat):
    """Return how 'green' a material is. Higher = more green."""
    if not mat or not mat.use_nodes:
        return -999
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        return -999
    base = bsdf.inputs["Base Color"]
    # If a texture is connected, use the average of texture, else direct color
    if base.is_linked:
        # Heuristic: any texture-driven material likely isn't pure green
        # Try to detect if name suggests grass
        name_l = mat.name.lower()
        if "grass" in name_l or "leaf" in name_l or "green" in name_l:
            return 1.0
        return -1
    r, g, b, _ = base.default_value
    return g - max(r, b)


def find_grass_slot(obj):
    """Return index of the material slot that's most likely grass."""
    best_idx = None
    best_score = -999
    for i, slot in enumerate(obj.material_slots):
        score = material_greenness(slot.material)
        if score > best_score:
            best_score = score
            best_idx = i
    return best_idx, best_score


def process_file(filename):
    glb_path = KENNEY_DIR / filename
    if not glb_path.exists():
        print(f"  MISSING: {glb_path}")
        return

    clear_scene()

    bpy.ops.import_scene.gltf(filepath=str(glb_path))

    # Collect imported meshes
    meshes = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    if not meshes:
        print(f"  no meshes in {filename}")
        return

    # Join into single object for easier processing
    if len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for m in meshes:
            m.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()

    obj = bpy.context.active_object

    # Identify grass material
    grass_idx, score = find_grass_slot(obj)
    if grass_idx is None:
        print(f"  no grass material found in {filename}")
        return

    grass_name = obj.material_slots[grass_idx].material.name
    print(f"  grass material: '{grass_name}' (score {score:.2f}) at slot {grass_idx}")

    # Switch to edit mode, face select, delete non-grass faces
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.select_mode(type="FACE")

    for i in range(len(obj.material_slots)):
        if i == grass_idx:
            continue
        obj.active_material_index = i
        bpy.ops.object.material_slot_select()

    # Delete the selected (non-grass) faces
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Verify we have geometry left
    if len(obj.data.vertices) == 0:
        print(f"  no grass geometry remaining in {filename}")
        return

    # Export
    out_name = filename.replace(".glb", "_grass.glb")
    out_path = OUT_DIR / out_name
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=True,
    )
    print(f"  -> {out_path.name}")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Extracting grass from {len(FILES)} Kenney files...")
    print(f"Output: {OUT_DIR}\n")

    for f in FILES:
        print(f"{f}:")
        process_file(f)

    print("\nDone.")


if __name__ == "__main__":
    main()
