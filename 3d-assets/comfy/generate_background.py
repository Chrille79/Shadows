"""
Generate Mario-Odyssey-style background layers via ComfyUI API.

Uses samaritan3dCartoon_v40SDXL.safetensors (3D-cartoon plastic-toy look).

Layers:
  sky         — opaque blue sky gradient (no clouds, no silhouettes)
  hills_far   — distant rolling hills, rendered on chroma-key bg, alpha-cut
  hills_near  — closer hills with trees/bushes, chroma-key + alpha-cut
  cloud       — isolated fluffy cartoon clouds, chroma-key + alpha-cut (batch)

All transparent layers are rendered on a flat chroma-key color, then PIL
strips the key to alpha.  This avoids baking bg color into anti-aliased
edges — we use a key that the cartoon palette does not contain.

Output goes to client/src/assets/backgrounds/.

Requires ComfyUI running on http://127.0.0.1:8000.

Usage:
    python generate_background.py --layer sky
    python generate_background.py --layer hills_far
    python generate_background.py --layer hills_near
    python generate_background.py --layer cloud --count 6
    python generate_background.py --layer cloud --seed 1234 --out cloud_custom.png
"""

import argparse
import io
import json
import random
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

COMFY_URL = "http://127.0.0.1:8000"
REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "client" / "src" / "assets" / "backgrounds"
WORKFLOW_DIR = Path(__file__).resolve().parent / "workflows"

# We tried chroma-key (magenta bg) but Samaritan-3D is too scene-trained —
# it colors the subject magenta instead of the background.  Fallback: generate
# natural scenes with real sky above hills, then sample sky color from the top
# row and alpha-key pixels that match it.

BASE_NEGATIVE = (
    "realistic, photograph, photo, dark, gritty, horror, dystopian, "
    "people, person, character, mario, luigi, princess, creature, animal, "
    "mushroom, power-up, star, coin, pipe, castle, house, building, structure, "
    "road, path, sign, fence, text, logo, watermark, signature, "
    "ui, hud, frame, border, jpeg artifacts, noise, blurry, "
    "low quality, worst quality, grain, cropped, cut off, clipped, "
    "out of frame, partial object, text label, "
    "complex scene, busy composition, crowded, many objects"
)

CONTAINMENT_HINT = (
    "complete composition, fully contained within frame, "
    "no clipped objects, no cut-off, soft margin of empty space around subject, "
    "objects centered and whole"
)

LAYER_PROMPTS: dict[str, dict] = {
    "hills_far": {
        "positive": (
            "3d render, cycles render, plastic toy silhouette, "
            "very distant rolling hills as a gentle low wavy ribbon, "
            "smooth rounded plastic-toy hill shapes, simple mono-color surface, "
            "soft desaturated pastel blue-green color, heavy atmospheric haze, "
            "under a clear empty uniform bright blue sky, "
            "hills occupy only bottom 20% of image, "
            "vast empty uniform blue sky fills the upper 80%, "
            "no surface texture, no leaves, no grass blades, just solid smooth shapes, "
            "no mountains, no peaks, no snow, no trees, no bushes, "
            "no buildings, no clouds, no birds, no characters, "
            f"{CONTAINMENT_HINT}"
        ),
        "out": "bg_hills_far.png",
        "width": 1024,
        "height": 1024,
        "transparent": True,
        "tileable_x": False,
    },
    "hills_near": {
        "positive": (
            "3d render, cycles render, plastic toy silhouette, "
            "mid-distance rolling green grass hills as a gentle wavy ribbon, "
            "smooth rounded plastic-toy hill shapes with a few small rounded bush blobs, "
            "simple mono-color green surface, mild atmospheric haze, "
            "under a clear empty uniform bright blue sky, "
            "hills occupy only bottom 30% of image, "
            "vast empty uniform blue sky fills the upper 70%, "
            "no surface texture, no leaves, no grass blades, just solid smooth shapes, "
            "no tall trees, no large trees, no dominant foliage, no mountains, "
            "no peaks, no snow, no buildings, no clouds, no birds, no characters, "
            f"{CONTAINMENT_HINT}"
        ),
        "out": "bg_hills_near.png",
        "width": 1024,
        "height": 1024,
        "transparent": True,
        "tileable_x": False,
    },
    "cloud": {
        "positive": (
            "3d render, plastic toy style, "
            "single isolated fluffy rounded cartoon cumulus cloud "
            "centered on a flat uniform bright blue sky, "
            "white cloud with soft blue-grey shadow underside, "
            "smooth plastic toy surface, vibrant, completely contained within frame, "
            "no other objects, no ground, no horizon, "
            f"{CONTAINMENT_HINT}"
        ),
        "out": "cloud_{i:02d}.png",
        "width": 768,
        "height": 512,
        "transparent": True,
        "tileable_x": False,
    },
}


def build_workflow(positive: str, negative: str, seed: int,
                   width: int, height: int, steps: int, cfg: float,
                   tileable_x: bool = False) -> dict:
    # When tileable_x is on, route MODEL through SeamlessTile and VAE through
    # MakeCircularVAE (both x_only).  We use Modify-in-place on both to avoid
    # a deepcopy of large GPU tensors (CircularVAEDecode's deepcopy OOMed).
    model_src = ["1", 0]
    vae_src = ["1", 2]

    nodes: dict = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "samaritan3dCartoon_v40SDXL.safetensors"},
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": positive, "clip": ["1", 1]},
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": ["1", 1]},
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": width, "height": height, "batch_size": 1},
        },
    }

    if tileable_x:
        # UNet-level tiling alone (no VAE mod) — MakeCircularVAE tended to
        # corrupt the VAE state with access violations on this model.
        nodes["8"] = {
            "class_type": "SeamlessTile",
            "inputs": {
                "model": ["1", 0],
                "tiling": "x_only",
                "copy_model": "Make a copy",
            },
        }
        model_src = ["8", 0]

    nodes["5"] = {
        "class_type": "KSampler",
        "inputs": {
            "seed": seed,
            "steps": steps,
            "cfg": cfg,
            "sampler_name": "dpmpp_2m",
            "scheduler": "karras",
            "denoise": 1.0,
            "model": model_src,
            "positive": ["2", 0],
            "negative": ["3", 0],
            "latent_image": ["4", 0],
        },
    }
    # Tiled decode avoids VRAM OOM / access-violations on SDXL VAE at larger
    # resolutions and also plays nicer with MakeCircularVAE's padding mods.
    nodes["6"] = {
        "class_type": "VAEDecodeTiled",
        "inputs": {
            "samples": ["5", 0],
            "vae": vae_src,
            "tile_size": 512,
            "overlap": 64,
            "temporal_size": 64,
            "temporal_overlap": 8,
        },
    }
    nodes["7"] = {
        "class_type": "SaveImage",
        "inputs": {"images": ["6", 0], "filename_prefix": "shadows_bg"},
    }
    return nodes


def post_prompt(workflow: dict) -> str:
    body = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFY_URL}/prompt",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["prompt_id"]


def wait_for_result(prompt_id: str, timeout: float = 300.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with urllib.request.urlopen(f"{COMFY_URL}/history/{prompt_id}", timeout=30) as r:
            data = json.loads(r.read())
        if prompt_id in data:
            return data[prompt_id]
        time.sleep(1.0)
    raise TimeoutError(f"ComfyUI did not finish within {timeout}s")


def fetch_image(filename: str, subfolder: str, img_type: str) -> bytes:
    qs = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": img_type})
    with urllib.request.urlopen(f"{COMFY_URL}/view?{qs}", timeout=60) as r:
        return r.read()


def sky_color_from_top(img: Image.Image, sample_rows: int = 8) -> tuple[int, int, int]:
    """Average RGB of the top `sample_rows` rows — assumed to be uniform sky."""
    w, h = img.size
    crop = img.crop((0, 0, w, min(sample_rows, h))).convert("RGB")
    data = list(crop.getdata())
    n = len(data)
    r = sum(p[0] for p in data) // n
    g = sum(p[1] for p in data) // n
    b = sum(p[2] for p in data) // n
    return (r, g, b)


def sky_to_alpha(png_bytes: bytes, tolerance: int = 55,
                 edge_feather: int = 3) -> bytes:
    """Alpha-key sky by sampling its color from the top row, then masking.

    Generate output has a relatively uniform sky at the top — we sample an
    average, then any pixel within `tolerance` RGB-distance becomes transparent,
    with a `edge_feather`-wide falloff to soften silhouette edges.  We also
    decontaminate edge pixels to prevent a blue halo around hills.
    """
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    key = sky_color_from_top(img)
    kr, kg, kb = key
    w, h = img.size
    px = img.load()

    tol_sq = tolerance * tolerance
    fade_end_sq = (tolerance + edge_feather * 16) ** 2

    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            dr, dg, db = r - kr, g - kg, b - kb
            dist_sq = dr * dr + dg * dg + db * db

            if dist_sq <= tol_sq:
                px[x, y] = (0, 0, 0, 0)
            elif dist_sq < fade_end_sq:
                t = (dist_sq - tol_sq) / (fade_end_sq - tol_sq)
                alpha = int(t * 255)
                inv = 1.0 - t
                nr = max(0, min(255, int(r - kr * inv * 0.4)))
                ng = max(0, min(255, int(g - kg * inv * 0.4)))
                nb = max(0, min(255, int(b - kb * inv * 0.4)))
                px[x, y] = (nr, ng, nb, alpha)

    # Trim to the non-transparent bounding box so image-top = silhouette-top.
    # Callers can then anchor the image by its top and know exactly where the
    # visible silhouette begins.
    bbox = img.getbbox()  # excludes fully-transparent pixels
    if bbox is not None:
        img = img.crop(bbox)
        print(f"[alpha] cropped to {img.size} (bbox {bbox})")

    print(f"[alpha] sky key RGB={key}")
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def generate_sky(out_path: Path, width: int, height: int) -> None:
    """Render a vertical sky gradient directly with PIL — no SDXL needed."""
    # Horizon (bottom) → zenith (top).  Colors picked to match the Mario
    # cartoon palette: light cyan near horizon, deeper cerulean at top.
    top = (92, 168, 235)
    bottom = (178, 223, 247)
    img = Image.new("RGB", (width, height))
    px = img.load()
    for y in range(height):
        t = y / (height - 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        for x in range(width):
            px[x, y] = (r, g, b)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="PNG", optimize=True)
    print(f"[pil] wrote sky gradient {out_path} ({out_path.stat().st_size / 1024:.0f} KB)")


def generate_one(layer: str, seed: int, out_path: Path,
                 steps: int, cfg: float, width: int, height: int,
                 force_no_tile: bool = False) -> None:
    preset = LAYER_PROMPTS[layer]
    positive = preset["positive"]
    transparent = preset["transparent"]
    tileable_x = preset.get("tileable_x", False) and not force_no_tile

    print(f"[comfy] layer={layer} seed={seed} size={width}x{height} "
          f"steps={steps} cfg={cfg} transparent={transparent} tileable_x={tileable_x}")

    wf = build_workflow(positive, BASE_NEGATIVE, seed, width, height, steps, cfg, tileable_x)

    # Dump the exact workflow we queued, so it can be opened in ComfyUI GUI
    # (Load → select .json) for manual tweaking.  One file per layer, overwritten.
    WORKFLOW_DIR.mkdir(parents=True, exist_ok=True)
    wf_path = WORKFLOW_DIR / f"{layer}.json"
    wf_path.write_text(json.dumps({"prompt": wf}, indent=2))
    print(f"[comfy] saved workflow -> {wf_path}")

    prompt_id = post_prompt(wf)
    print(f"[comfy] queued prompt_id={prompt_id}")

    result = wait_for_result(prompt_id)
    outputs = result.get("outputs", {}).get("7", {}).get("images", [])
    if not outputs:
        raise RuntimeError(f"no images returned from ComfyUI: {json.dumps(result)[:400]}")

    img = outputs[0]
    data = fetch_image(img["filename"], img.get("subfolder", ""), img.get("type", "output"))

    if transparent:
        data = sky_to_alpha(data)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(data)
    print(f"[comfy] wrote {out_path} ({len(data) / 1024:.0f} KB)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--layer", required=True, choices=list(LAYER_PROMPTS.keys()) + ["sky"])
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--count", type=int, default=1, help="Generate N variants (uses --seed as base).")
    ap.add_argument("--out", default=None, help="Override output filename.")
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--cfg", type=float, default=7.0)
    ap.add_argument("--width", type=int, default=None)
    ap.add_argument("--height", type=int, default=None)
    ap.add_argument("--no-tile", action="store_true", help="Disable horizontal tiling (natural composition)")
    args = ap.parse_args()

    if args.layer == "sky":
        width = args.width or 1920
        height = args.height or 1080
        out_name = args.out or "bg_sky.png"
        generate_sky(OUT_DIR / out_name, width, height)
        return 0

    preset = LAYER_PROMPTS[args.layer]
    width = args.width or preset["width"]
    height = args.height or preset["height"]

    base_seed = args.seed if args.seed is not None else random.randint(0, 2**31 - 1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.count == 1:
        out_name = args.out or preset["out"]
        # Template resolution for single pass
        if "{i" in out_name:
            out_name = out_name.format(i=1)
        generate_one(args.layer, base_seed, OUT_DIR / out_name,
                     args.steps, args.cfg, width, height, args.no_tile)
    else:
        template = args.out or preset["out"]
        if "{i" not in template:
            print("error: --out with --count must contain {i} placeholder, "
                  f"e.g. cloud_{{i:02d}}.png (got {template!r})", file=sys.stderr)
            return 2
        for i in range(1, args.count + 1):
            seed_i = base_seed + i - 1
            out_name = template.format(i=i)
            generate_one(args.layer, seed_i, OUT_DIR / out_name,
                         args.steps, args.cfg, width, height)

    return 0


if __name__ == "__main__":
    sys.exit(main())
