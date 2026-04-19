"""Convert ComfyUI API-format workflow JSON → GUI-format (loadable in the editor).

API format is a flat `{node_id: {class_type, inputs}}` dict — what the `/prompt`
endpoint takes.  GUI format has extra UI state (node positions, per-widget
values, link objects) so ComfyUI can render it on the canvas.

This converter reads `/object_info` to learn each node's input/output schema,
then builds a minimally-valid GUI JSON.  Nodes are laid out in a simple
left-to-right grid sorted by dependency depth.

Usage:
    python api_to_gui.py <api_workflow.json>  [<api_workflow.json> ...]

Writes a sibling file: foo.json → foo.json overwritten with GUI format.
"""

import json
import sys
import urllib.request
from pathlib import Path

COMFY = "http://127.0.0.1:8000"


def fetch_object_info() -> dict:
    with urllib.request.urlopen(f"{COMFY}/object_info", timeout=10) as r:
        return json.loads(r.read())


def dep_depth(api: dict, node_id: str, memo: dict[str, int]) -> int:
    if node_id in memo:
        return memo[node_id]
    deps = []
    for v in api[node_id].get("inputs", {}).values():
        if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and v[0] in api:
            deps.append(dep_depth(api, v[0], memo))
    memo[node_id] = (max(deps) + 1) if deps else 0
    return memo[node_id]


def convert(api: dict, object_info: dict) -> dict:
    # Strip internal keys (e.g. "_comment").
    api = {k: v for k, v in api.items() if not k.startswith("_")}

    depth_memo: dict[str, int] = {}
    for nid in api:
        dep_depth(api, nid, depth_memo)

    # Grid layout: x by depth, y stacking within same depth.
    col_counts: dict[int, int] = {}
    positions: dict[str, tuple[int, int]] = {}
    COL_W, ROW_H = 360, 220
    for nid in sorted(api.keys(), key=lambda k: (depth_memo[k], int(k))):
        d = depth_memo[nid]
        row = col_counts.get(d, 0)
        col_counts[d] = row + 1
        positions[nid] = (50 + d * COL_W, 50 + row * ROW_H)

    # Build links + nodes.
    nodes_out: list[dict] = []
    links_out: list[list] = []
    node_outputs: dict[str, list[dict]] = {}  # node_id → output-slots[]
    link_id_counter = 0

    # Pre-build output slot metadata per node.
    for nid, node in api.items():
        schema = object_info.get(node["class_type"], {})
        out_types = schema.get("output", [])
        out_names = schema.get("output_name", [])
        slots = []
        for i, t in enumerate(out_types):
            name = out_names[i] if i < len(out_names) else t
            slots.append({"name": name, "type": t, "links": [], "slot_index": i})
        node_outputs[nid] = slots

    # Build inputs + links by walking each node's wire-type inputs.
    for nid in sorted(api.keys(), key=lambda k: int(k)):
        node = api[nid]
        cls = node["class_type"]
        schema = object_info.get(cls, {})
        required = schema.get("input", {}).get("required", {})
        optional = schema.get("input", {}).get("optional", {}) or {}
        input_schema = {**required, **optional}

        inputs_gui: list[dict] = []
        widget_values: list = []

        for name, spec in input_schema.items():
            spec_type = spec[0] if isinstance(spec, list) else spec
            val = node.get("inputs", {}).get(name)

            # Connection? ([src_node_id, src_slot])
            if (
                isinstance(val, list)
                and len(val) == 2
                and isinstance(val[0], str)
                and val[0] in api
            ):
                src_nid, src_slot = val
                src_slot = int(src_slot)
                src_out = node_outputs[src_nid][src_slot]
                link_id_counter += 1
                lid = link_id_counter
                src_out["links"].append(lid)
                inputs_gui.append({
                    "name": name,
                    "type": src_out["type"],
                    "link": lid,
                })
                links_out.append([
                    lid, int(src_nid), src_slot, int(nid),
                    len(inputs_gui) - 1, src_out["type"],
                ])
                continue

            # Widget value (string / number / dropdown / bool / etc).
            if val is not None:
                widget_values.append(val)
            else:
                # Required input missing from API? Insert a blank/default.
                default = None
                if isinstance(spec, list) and len(spec) > 1 and isinstance(spec[1], dict):
                    default = spec[1].get("default")
                if isinstance(spec_type, list):  # enum dropdown
                    default = default or (spec_type[0] if spec_type else "")
                widget_values.append(default if default is not None else "")

            # ComfyUI frontend auto-injects a "control_after_generate" widget
            # right after any INT widget named `seed` (and `noise_seed`).  The
            # /object_info schema doesn't mention it, so we have to mirror it
            # here or every later widget value on the node shifts by one slot.
            if name in ("seed", "noise_seed") and spec_type == "INT":
                widget_values.append("randomize")

        nodes_out.append({
            "id": int(nid),
            "type": cls,
            "pos": list(positions[nid]),
            "size": [300, 200],
            "flags": {},
            "order": depth_memo[nid],
            "mode": 0,
            "inputs": inputs_gui,
            "outputs": node_outputs[nid],
            "properties": {"Node name for S&R": cls},
            "widgets_values": widget_values,
        })

    last_node_id = max(int(nid) for nid in api)
    return {
        "last_node_id": last_node_id,
        "last_link_id": link_id_counter,
        "nodes": nodes_out,
        "links": links_out,
        "groups": [],
        "config": {},
        "extra": {"ds": {"scale": 1.0, "offset": [0, 0]}},
        "version": 0.4,
    }


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    object_info = fetch_object_info()

    for path_str in sys.argv[1:]:
        p = Path(path_str)
        api = json.loads(p.read_text())
        gui = convert(api, object_info)
        # Preserve the _comment if it was there.
        if "_comment" in api:
            gui["extra"]["_comment"] = api["_comment"]
        p.write_text(json.dumps(gui, indent=2))
        print(f"converted {p} ({len(gui['nodes'])} nodes, {len(gui['links'])} links)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
