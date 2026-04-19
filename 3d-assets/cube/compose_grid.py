"""
Compose already-rendered block sprites into a 9x3 grid to preview
how they'll look tiled together in the game.

Uses the block_sprite_*.png files produced by render_blocks.py.
Output: block_grid_preview.png
"""

from PIL import Image
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

# 4 color variants cycled across the grid
COLOR_VARIANTS = [
    "solid_brown",
    "solid_teal",
    "solid_grey",
    "solid_sand",
]

GRID_COLS = 9
GRID_ROWS = 3

# Deterministic mixing pattern — which color variant per (row, col)
COLOR_PATTERN = [
    [0, 1, 0, 2, 1, 3, 0, 2, 1],   # row 0 (top)
    [1, 2, 3, 0, 2, 1, 3, 0, 2],   # row 1 (middle)
    [2, 0, 1, 3, 0, 2, 1, 3, 0],   # row 2 (bottom)
]

TILE_SIZE = 512    # sprite PNGs are 512x512 by default


def load_sprite(variant):
    path = SCRIPT_DIR / f"block_sprite_{variant}.png"
    if not path.exists():
        raise FileNotFoundError(
            f"Missing: {path.name}. Run render_blocks.py in Blender first."
        )
    return Image.open(path).convert("RGBA")


def compose():
    # Pre-load all variant sprites once
    sprites = {v: load_sprite(v) for v in COLOR_VARIANTS}

    # Use the loaded sprite's actual size in case it's not 512
    w, h = sprites[COLOR_VARIANTS[0]].size

    # Canvas transparent RGBA
    canvas_w = w * GRID_COLS
    canvas_h = h * GRID_ROWS
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            variant_idx = COLOR_PATTERN[row][col]
            variant = COLOR_VARIANTS[variant_idx]
            sprite = sprites[variant]
            # Paste with alpha
            canvas.alpha_composite(sprite, (col * w, row * h))

    out_path = SCRIPT_DIR / "block_grid_preview.png"
    canvas.save(out_path)
    print(f"Composed {GRID_COLS}x{GRID_ROWS} = {GRID_COLS*GRID_ROWS} blocks")
    print(f"Canvas: {canvas_w}x{canvas_h}")
    print(f"Output: {out_path}")


if __name__ == "__main__":
    compose()
