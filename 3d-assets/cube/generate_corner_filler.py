"""
Generate block_corner_filler.png — small dark sprite to plug the
transparent diamond gaps where 4 rounded-corner blocks meet in a tilemap.

Design:
- 64x64 PNG (game places it at ~20-24 px centered on grid corner)
- Dark center (matches bevel-shadow tone)
- Soft radial alpha falloff so edges blend into surrounding bevel shadows
"""

from PIL import Image
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent
SIZE = 64

# Color tuned to match bevel shadow in the rendered sprites
CENTER_RGB = (38, 38, 44)          # deep neutral dark
EDGE_FADE_EXP = 2.0                # higher = sharper edge (more concentrated center)


def generate():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()
    cx = cy = SIZE / 2 - 0.5
    max_r = SIZE / 2

    for y in range(SIZE):
        for x in range(SIZE):
            dx = x - cx
            dy = y - cy
            r = (dx * dx + dy * dy) ** 0.5
            if r >= max_r:
                alpha = 0
            else:
                t = r / max_r                          # 0 = center, 1 = edge
                alpha = int((1 - t ** EDGE_FADE_EXP) * 255)
                alpha = max(0, min(255, alpha))
            px[x, y] = (CENTER_RGB[0], CENTER_RGB[1], CENTER_RGB[2], alpha)

    path = OUT_DIR / "block_corner_filler.png"
    img.save(path)
    print(f"Wrote: {path}")


if __name__ == "__main__":
    generate()
