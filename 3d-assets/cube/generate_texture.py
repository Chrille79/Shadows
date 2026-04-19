"""
Generate tileable block textures — both solid-color and patterned variants.

Solid variants match the simple reference style (teal, brown, etc).
Patterned variants have brick patterns for more detail.

Center of texture (0.5, 0.5) is the "base color" so cube bevels sample a
neutral shade that blends with main faces.
"""

from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent

# ---------- SOLID variants (simple, reference style) ----------
SOLID_VARIANTS = {
    "solid_teal":   (100, 130, 140),
    "solid_brown":  (190, 100, 70),
    "solid_grey":   (150, 150, 160),
    "solid_sand":   (220, 190, 140),
    "solid_green":  (110, 160, 100),
    "solid_stone":  (160, 160, 170),
    "solid_wood":   (170, 120, 80),
}

# ---------- PATTERNED variants (brick pattern) ----------
PATTERNED_VARIANTS = {
    "brick": {
        "base": (196, 107, 62),
        "mortar": (92, 52, 30),
        "highlight": (224, 144, 96),
        "shadow": (148, 76, 42),
    },
    "stone": {
        "base": (156, 156, 170),
        "mortar": (70, 72, 82),
        "highlight": (198, 200, 214),
        "shadow": (110, 112, 126),
    },
    "sand": {
        "base": (222, 198, 140),
        "mortar": (150, 124, 80),
        "highlight": (244, 226, 182),
        "shadow": (184, 156, 108),
    },
    "dirt": {
        "base": (122, 88, 62),
        "mortar": (58, 40, 28),
        "highlight": (156, 118, 88),
        "shadow": (88, 62, 42),
    },
}

SIZE = 512
BRICKS_X = 2
BRICKS_Y = 4
MORTAR_PX = 10
ROUND_CORNERS = 6
EDGE_FALLOFF = 8


def render_solid(name, color):
    """Plain single-color texture."""
    img = Image.new("RGBA", (SIZE, SIZE), color + (255,))
    path = OUT_DIR / f"block_texture_{name}.png"
    img.save(path)
    print(f"  -> {path.name}")


def draw_brick(draw, x0, y0, x1, y1, variant):
    draw.rounded_rectangle([x0, y0, x1, y1], radius=ROUND_CORNERS, fill=variant["base"])
    draw.rounded_rectangle([x0, y0, x1, y0 + EDGE_FALLOFF], radius=ROUND_CORNERS, fill=variant["highlight"])
    draw.rounded_rectangle([x0, y1 - EDGE_FALLOFF, x1, y1], radius=ROUND_CORNERS, fill=variant["shadow"])


def render_patterned(name, variant):
    img = Image.new("RGBA", (SIZE, SIZE), variant["mortar"])
    draw = ImageDraw.Draw(img)
    brick_w = SIZE // BRICKS_X
    brick_h = SIZE // BRICKS_Y

    for row in range(BRICKS_Y):
        row_offset = (brick_w // 2) if (row % 2) else 0
        for col in range(-1, BRICKS_X + 1):
            bx = col * brick_w + row_offset + MORTAR_PX // 2
            by = row * brick_h + MORTAR_PX // 2
            bx2 = bx + brick_w - MORTAR_PX
            by2 = by + brick_h - MORTAR_PX
            draw_brick(draw, bx, by, bx2, by2, variant)

    img = img.filter(ImageFilter.GaussianBlur(radius=0.8))
    path = OUT_DIR / f"block_texture_{name}.png"
    img.save(path)
    print(f"  -> {path.name}")


print(f"Solid variants ({SIZE}x{SIZE}):")
for name, color in SOLID_VARIANTS.items():
    render_solid(name, color)

print(f"\nPatterned variants ({SIZE}x{SIZE}):")
for name, variant in PATTERNED_VARIANTS.items():
    render_patterned(name, variant)

# Default block_texture.png = solid_teal (matches the reference crop user showed)
import shutil
shutil.copyfile(OUT_DIR / "block_texture_solid_teal.png",
                OUT_DIR / "block_texture.png")
print("\nDefault block_texture.png = solid_teal (reference-style)")
