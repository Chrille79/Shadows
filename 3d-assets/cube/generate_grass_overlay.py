"""
Generate flat grass-overlay sprites with faked 3D lighting:
- Vertical gradient (light top → dark bottom) simulates sun from above
- Top highlight strip (sun specular)
- Per-drip shading: bumps stay lit, valleys get a soft shadow
- Dark accent line on the deepest drip tips
- Cast shadow band below the drips (semi-transparent, falls onto block)

Output is seamlessly tileable horizontally.
"""

import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = Path(__file__).resolve().parent

# Variants: (name, light_color, mid_color, dark_color, drip_density, max_drop)
# Three-tone palette per variant: top-highlight, body-mid, deep-shadow.
VARIANTS = [
    ("bright", (170, 230, 90),  (130, 200, 60), (60, 130, 30),  0.040, 38),
    ("dark",   (90, 170, 60),   (55, 130, 40),  (25, 70, 20),   0.035, 36),
    ("autumn", (220, 230, 90),  (180, 200, 60), (110, 130, 30), 0.040, 38),
    ("forest", (70, 150, 70),   (40, 110, 50),  (15, 55, 25),   0.030, 32),
    ("dry",    (210, 210, 90),  (170, 170, 60), (100, 100, 30), 0.035, 30),
]

WIDTH = 1024
HEIGHT = 96               # taller now to fit cast shadow below drips
TOP_BAR_PX = 26
TOP_HIGHLIGHT_PX = 5
BOTTOM_DARK_PX = 2
CAST_SHADOW_PX = 14       # semi-transparent shadow band below drips
RANDOM_SEED = 12


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def generate(name, light, mid, dark, drip_density, max_drop):
    rng = random.Random(RANDOM_SEED)

    # Compute bottom edge per column
    bottom = [TOP_BAR_PX] * WIDTH
    drip_count = max(2, int(WIDTH * drip_density))
    for _ in range(drip_count):
        cx = rng.randint(0, WIDTH - 1)
        radius = rng.randint(14, 50)
        drop = rng.randint(10, max_drop)
        for x in range(cx - radius, cx + radius + 1):
            xx = x % WIDTH
            d = abs(x - cx)
            t = max(0.0, 1.0 - (d / radius) ** 2)
            ydown = TOP_BAR_PX + drop * t
            if bottom[xx] < ydown:
                bottom[xx] = int(ydown)

    # Smooth bottom contour (5px box blur)
    smoothed = [0] * WIDTH
    for x in range(WIDTH):
        s = sum(bottom[(x + dx) % WIDTH] for dx in range(-2, 3))
        smoothed[x] = s // 5
    bottom = smoothed

    # Compute "depth" per column (drop below bar) for per-column shading
    drops = [bottom[x] - TOP_BAR_PX for x in range(WIDTH)]
    max_actual_drop = max(drops) or 1

    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    px = img.load()

    for x in range(WIDTH):
        b = bottom[x]
        depth = drops[x]
        # Drips that hang far down get slightly darker overall (in shadow)
        col_shade = depth / max_actual_drop  # 0..1, deeper = more shadow
        for y in range(0, b + 1):
            if y < TOP_HIGHLIGHT_PX:
                # Top highlight band — almost pure light
                base = light
            else:
                # Vertical gradient: light at top, mid in middle, dark near bottom
                t = (y - TOP_HIGHLIGHT_PX) / max(1, b - TOP_HIGHLIGHT_PX)
                if t < 0.5:
                    base = lerp(light, mid, t * 2)
                else:
                    base = lerp(mid, dark, (t - 0.5) * 2)
                # Add per-column shadow modifier (deeper drips = darker)
                base = lerp(base, dark, col_shade * 0.35)
            px[x, y] = (base[0], base[1], base[2], 255)

        # Dark line on the very bottom of drips (1-2 px)
        for dy in range(BOTTOM_DARK_PX):
            yy = b - dy
            if 0 <= yy <= b and yy > TOP_HIGHLIGHT_PX:
                px[x, yy] = (dark[0], dark[1], dark[2], 255)

    # Cast shadow: semi-transparent dark band below the drip bottom,
    # falls onto the block underneath. Fades out vertically.
    for x in range(WIDTH):
        b = bottom[x]
        for dy in range(1, CAST_SHADOW_PX + 1):
            yy = b + dy
            if yy >= HEIGHT:
                break
            # Soft falloff
            t = 1.0 - (dy / CAST_SHADOW_PX) ** 1.4
            alpha = int(t * 110)        # max ~110/255 alpha
            if alpha <= 0:
                continue
            # Dark color, semi-transparent
            px[x, yy] = (0, 30, 10, alpha)

    # Soft alpha-edge anti-alias only on the silhouette (top bar + drips),
    # not the cast shadow (we already use partial alpha there).
    # We'll do a small overall alpha blur — cast shadow alpha will only
    # smooth slightly, which is fine.
    r, g, b_chan, a = img.split()
    a_blurred = a.filter(ImageFilter.GaussianBlur(radius=0.6))
    img = Image.merge("RGBA", (r, g, b_chan, a_blurred))

    out = OUT_DIR / f"grass_overlay_{name}.png"
    img.save(out)
    print(f"  -> {out.name}  ({WIDTH}x{HEIGHT})")


def main():
    print(f"Generating {len(VARIANTS)} grass overlays with 3D shading...")
    for v in VARIANTS:
        generate(*v)
    print("\nDone.")


if __name__ == "__main__":
    main()
