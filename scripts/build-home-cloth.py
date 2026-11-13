"""Tile the homepage cloth from the cut-out slot icons.

Horizontal strips sit flush, one on the next, in the sand tones already
on the page. The same icons sit inside the strips. The tile repeats
without a seam.

The sand comes from the homepage objects: the Stake floor and column
gold, the cream toga, and the coins on the bonus and leaderboard tiles.
Navy, red, and sky stay on those tiles, so the page does not match them.
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(ROOT, "frontend", "public", "img", "bg")
OUT = os.path.join(ICON_DIR, "home-cloth.webp")

# Output width matches the desktop background-size so one tile is one repeat.
SCALE = 2
BANDS = 12
BAND_H = 72 * SCALE
W = 920 * SCALE
H = BANDS * BAND_H

ICONS = ["cloth-bolt", "cloth-coin", "cloth-gem", "cloth-star", "cloth-die", "cloth-laurel"]
ICONS_PER_BAND = 3


# Light and deep steps of the same sand, alternating so each strip reads.
# Neighbors stay apart, and the last step stays apart from the first.
# Three sand steps — ivory, deep gold, honey — each with a few shifts,
# ordered so every neighbor is a different step. The last honey stays
# apart from the first ivory when the tile repeats.
TONES = (
    (248, 242, 226),
    (180, 136, 62),
    (200, 188, 132),
    (246, 228, 184),
    (184, 142, 70),
    (220, 190, 124),
    (238, 230, 210),
    (182, 140, 66),
    (214, 186, 128),
    (250, 236, 206),
    (188, 148, 76),
    (216, 196, 148),
)


def load_icons():
    icons = []
    for name in ICONS:
        icons.append(Image.open(os.path.join(ICON_DIR, f"{name}.webp")).convert("RGBA"))
    return icons


def fit_icon(icon, box, scale, opacity):
    w, h = icon.size
    s = (box * scale) / max(w, h)
    fitted = icon.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    if opacity < 0.999:
        alpha = fitted.getchannel("A").point(lambda p: int(p * opacity))
        fitted.putalpha(alpha)
    return fitted


def stamp_wrapped(base, stamp, cx, cy):
    bw, bh = base.size
    sw, sh = stamp.size
    x0 = int(round(cx - sw / 2))
    y0 = int(round(cy - sh / 2))
    for dx in (0, -bw, bw):
        px = x0 + dx
        left = max(px, 0)
        top = max(y0, 0)
        right = min(px + sw, bw)
        bottom = min(y0 + sh, bh)
        if left >= right or top >= bottom:
            continue
        crop = stamp.crop((left - px, top - y0, right - px, bottom - y0))
        base.alpha_composite(crop, (left, top))


def draw_tile(icons):
    rgb = np.zeros((H, W, 3), np.uint8)
    for band, color in enumerate(TONES):
        y0 = band * BAND_H
        rgb[y0:y0 + BAND_H, :, :] = color
    tile = Image.fromarray(rgb, "RGB").convert("RGBA")

    box = BAND_H * 0.62
    slot = W / ICONS_PER_BAND
    for band in range(BANDS):
        cy = band * BAND_H + BAND_H / 2
        # Odd rows sit in the gaps of the row above, and each row drifts
        # so the stack does not repeat halfway down the tile.
        phase = (0.5 if band % 2 else 0.0) + (band / BANDS) * 0.42
        for n in range(ICONS_PER_BAND):
            icon = icons[(band * 5 + n * 2) % len(icons)]
            scale = 0.94 + ((band + n) % 3) * 0.04
            stamp = fit_icon(icon, box, scale, 0.62)
            cx = ((n + 0.5 + phase) * slot) % W
            stamp_wrapped(tile, stamp, cx, cy)
    return tile


def main():
    if len(TONES) != BANDS:
        raise SystemExit(f"expected {BANDS} tones, got {len(TONES)}")
    icons = load_icons()
    tile = draw_tile(icons)

    big = Image.new("RGBA", (W * 3, H * 3))
    for ty in range(3):
        for tx in range(3):
            big.paste(tile, (tx * W, ty * H))

    pad = 16
    cloth = big.crop((W - pad, H - pad, W * 2 + pad, H * 2 + pad))
    out_w = (W + pad * 2) // SCALE
    out_h = (H + pad * 2) // SCALE
    cloth = cloth.resize((out_w, out_h), Image.LANCZOS)
    op = pad // SCALE
    cloth = cloth.crop((op, op, op + W // SCALE, op + H // SCALE)).convert("RGB")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    cloth.save(OUT, "WEBP", quality=90, method=6)
    print(f"home-cloth {cloth.size} {os.path.getsize(OUT) // 1024}KB")

    tiled = Image.new("RGB", (cloth.width * 2, cloth.height * 2))
    for ty in range(2):
        for tx in range(2):
            tiled.paste(cloth, (tx * cloth.width, ty * cloth.height))
    arr = np.asarray(tiled)
    mx, my = cloth.width, cloth.height
    vert = np.abs(arr[:, mx].astype(int) - arr[:, mx - 1].astype(int)).mean()
    horiz = np.abs(arr[my].astype(int) - arr[my - 1].astype(int)).mean()
    print(f"seam vert {vert:.2f} horiz {horiz:.2f}")


if __name__ == "__main__":
    main()
