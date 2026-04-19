"""
Quick preview: composite grass-overlay strip on top of a row of block sprites.
Shows how the grass "hat" sits on tiles in-game.
"""

from PIL import Image
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent

BLOCK_PATH = OUT_DIR / "block_sprite_solid_brown.png"
OVERLAY_PATH = OUT_DIR / "grass_overlay_dark.png"

# Must match TOP_BAR_PX in generate_grass_overlay.py
TOP_BAR_PX = 26
# Number of blocks to tile in the preview
NUM_BLOCKS = 5
# Background color for the preview canvas (dark grey to see grass clearly)
BG_COLOR = (45, 45, 55, 255)


def main():
    block = Image.open(BLOCK_PATH).convert("RGBA")
    overlay = Image.open(OVERLAY_PATH).convert("RGBA")

    bw, bh = block.size
    ow, oh = overlay.size
    print(f"Block:  {bw}x{bh}")
    print(f"Overlay: {ow}x{oh}")

    # Top margin to fit grass body above block tops
    top_margin = TOP_BAR_PX + 8
    canvas_w = bw * NUM_BLOCKS
    canvas_h = bh + top_margin

    canvas = Image.new("RGBA", (canvas_w, canvas_h), BG_COLOR)

    # Place blocks side by side
    block_y = top_margin
    for i in range(NUM_BLOCKS):
        canvas.alpha_composite(block, (i * bw, block_y))

    # Tile grass overlay across the top
    # The overlay's solid green bar (top TOP_BAR_PX pixels) sits ABOVE the
    # block top edge; the drips hang down ONTO the block top.
    overlay_y = block_y - TOP_BAR_PX
    x = 0
    while x < canvas_w:
        canvas.alpha_composite(overlay, (x, overlay_y))
        x += ow

    out = OUT_DIR / "preview_grass_on_blocks.png"
    canvas.save(out)
    print(f"Saved: {out.name} ({canvas_w}x{canvas_h})")


if __name__ == "__main__":
    main()
