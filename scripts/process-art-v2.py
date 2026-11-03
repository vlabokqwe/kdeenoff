"""
KDeenOff art pipeline (v2).

raw generated image (~1 MP)
  -> Real-ESRGAN x4 AI upscale (cached in <raw_dir>/up/)
  -> cutouts: magenta chroma key + edge un-mix + despill + crop
  -> resize to the target size (about 2x the largest display size, for Retina)
  -> WebP into public/img/

Usage:
  python scripts/process-art-v2.py <raw_dir> [asset names...]
Env:
  ESRGAN=<path to realesrgan-ncnn-vulkan.exe>   (falls back to Lanczos if missing)

Raw files are matched by "<name with - as _>_<timestamp>.(jpg|png)"; the newest wins.
"""
import glob
import os
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "img")
ESRGAN = os.environ.get("ESRGAN", "")

# name: (output path relative to public/img, mode, max side px, webp quality)
ASSETS = {
    # brand
    "v2-logo": ("brand/logo.webp", "cut", 1200, 90),
    "v2-mark": ("brand/mark.webp", "cut", 256, 90),
    # hero + decor
    "v2-hero-art": ("hero/treasure.webp", "cut", 1400, 88),
    "v2-hero-bg": ("bg/hero.webp", "bg", 2560, 78),
    "v2-pattern": ("bg/pattern.webp", "tile", 512, 80),
    "v2-coin": ("deco/coin.webp", "cut", 300, 88),
    "v2-coin-stack": ("deco/coin-stack.webp", "cut", 300, 88),
    "v2-gem": ("deco/gem.webp", "cut", 240, 88),
    "v2-chip": ("deco/chip.webp", "cut", 300, 88),
    "v2-dice": ("deco/dice.webp", "cut", 360, 88),
    "v2-card": ("deco/card.webp", "cut", 300, 88),
    "v2-sparkle": ("deco/sparkle.webp", "cut", 160, 88),
    # icons
    "v2-ic-home": ("icons/home.webp", "cut", 192, 88),
    "v2-ic-raffle": ("icons/raffle.webp", "cut", 192, 88),
    "v2-ic-trophy": ("icons/trophy.webp", "cut", 192, 88),
    "v2-ic-gift": ("icons/gift.webp", "cut", 192, 88),
    "v2-ic-chat": ("icons/chat.webp", "cut", 192, 88),
    "v2-ic-copy": ("icons/copy.webp", "cut", 128, 88),
    "v2-ic-timer": ("icons/timer.webp", "cut", 160, 88),
    "v2-ic-star": ("icons/star.webp", "cut", 128, 88),
    "v2-ic-crown": ("icons/crown.webp", "cut", 192, 88),
    "v2-ic-rakeback": ("icons/rakeback.webp", "cut", 192, 88),
    "v2-ic-deposit": ("icons/deposit.webp", "cut", 192, 88),
    "v2-ic-vip": ("icons/vip.webp", "cut", 192, 88),
    "v2-ic-spins": ("icons/spins.webp", "cut", 192, 88),
    "v2-ic-telegram": ("icons/telegram.webp", "cut", 256, 88),
    "v2-ic-kick": ("icons/kick.webp", "cut", 256, 88),
    "v2-ic-18": ("icons/18.webp", "cut", 128, 88),
    "v2-step-register": ("steps/register.webp", "cut", 480, 88),
    "v2-step-code": ("steps/code.webp", "cut", 480, 88),
    "v2-step-stream": ("steps/stream.webp", "cut", 480, 88),
    # bonus / raffle / contacts
    "v2-bonus-art": ("bonus/art.webp", "cut", 1200, 88),
    "v2-raffle-art": ("raffle/drum.webp", "cut", 1000, 88),
    "v2-contacts-art": ("contacts/phone.webp", "cut", 1000, 88),
    "v2-partner-stake": ("partners/stake-bg.webp", "bg", 1400, 80),
    "v2-partner-generic": ("partners/generic-bg.webp", "bg", 1400, 80),
    "v2-bonus-bg": ("bg/bonus.webp", "bg", 2560, 76),
    "v2-steps-bg": ("bg/steps.webp", "bg", 2560, 76),
    "v2-contacts-bg": ("bg/contacts.webp", "bg", 2560, 76),
    # leaderboard
    "v2-cup-1": ("lb/cup-1.webp", "cut", 640, 88),
    "v2-cup-2": ("lb/cup-2.webp", "cut", 640, 88),
    "v2-cup-3": ("lb/cup-3.webp", "cut", 640, 88),
    "v2-lb-stage": ("bg/stage.webp", "bg", 2560, 78),
    "v2-lb-bg": ("bg/leaderboard.webp", "bg", 2560, 76),
    "v2-crown": ("lb/crown.webp", "cut", 500, 88),
    "v2-prize-pile": ("lb/prize-pile.webp", "cut", 1600, 86),
    "v2-medal-1": ("lb/medal-1.webp", "cut", 240, 88),
    "v2-medal-2": ("lb/medal-2.webp", "cut", 240, 88),
    "v2-medal-3": ("lb/medal-3.webp", "cut", 240, 88),
}


def newest(raw_dir, name):
    stem = name.replace("-", "_")
    files = [
        f for f in glob.glob(os.path.join(raw_dir, f"{stem}_*"))
        if os.path.splitext(f)[1].lower() in (".jpg", ".jpeg", ".png", ".webp")
        and os.path.basename(f)[len(stem) + 1:].split(".")[0].isdigit()
    ]
    return max(files, key=os.path.getmtime) if files else None


def upscale(src, raw_dir):
    """Real-ESRGAN x4, cached. Returns a PIL image."""
    up_dir = os.path.join(raw_dir, "up")
    os.makedirs(up_dir, exist_ok=True)
    dst = os.path.join(up_dir, os.path.splitext(os.path.basename(src))[0] + "_x4.png")
    if not os.path.exists(dst) and ESRGAN and os.path.exists(ESRGAN):
        subprocess.run(
            [ESRGAN, "-i", src, "-o", dst, "-n", "realesrgan-x4plus"],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            cwd=os.path.dirname(ESRGAN),
        )
    if os.path.exists(dst):
        return Image.open(dst)
    img = Image.open(src)
    return img.resize((img.width * 4, img.height * 4), Image.LANCZOS)


def cutout(img):
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)

    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = np.minimum(r, b) - g  # "magenta-ness"
    # Measured backdrop strength (some renders come out as a muted magenta).
    m_bg = max(float(np.minimum(bg[0], bg[2]) - bg[1]), 60.0)
    a = 1.0 - np.clip(m / m_bg, 0.0, 1.0)
    a = np.clip((a - 0.12) / 0.76, 0.0, 1.0)

    safe = np.maximum(a, 0.05)[..., None]
    fg = (rgb - (1.0 - safe) * bg) / safe
    fg = np.where(a[..., None] > 0.98, rgb, fg)
    fg = np.clip(fg, 0, 255)

    excess = np.maximum(0.0, np.minimum(fg[..., 0], fg[..., 2]) - fg[..., 1])
    fg[..., 0] -= excess
    fg[..., 2] -= excess

    a = np.where(a < 0.16, 0.0, a)
    out = Image.fromarray(np.dstack([fg, a * 255.0]).astype(np.uint8), "RGBA")

    solid = a > 0.5
    rows = np.where(solid.sum(axis=1) >= 6)[0]
    cols = np.where(solid.sum(axis=0) >= 6)[0]
    if len(rows) == 0 or len(cols) == 0:
        return out
    pad = 16
    return out.crop((
        max(int(cols.min()) - pad, 0),
        max(int(rows.min()) - pad, 0),
        min(int(cols.max()) + pad + 1, w),
        min(int(rows.max()) + pad + 1, h),
    ))


def fit(img, max_side):
    w, h = img.size
    s = min(1.0, max_side / max(w, h))
    if s < 1.0:
        img = img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    return img


def main():
    raw_dir = sys.argv[1]
    only = set(sys.argv[2:])
    done, missing = [], []
    for name, (rel, mode, size, q) in ASSETS.items():
        if only and name not in only:
            continue
        src = newest(raw_dir, name)
        if not src:
            missing.append(name)
            continue
        img = upscale(src, raw_dir)
        if mode == "cut":
            img = cutout(img)
        else:
            img = img.convert("RGB")
        img = fit(img, size)
        dst = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        img.save(dst, "WEBP", quality=q, method=6)
        done.append(f"{name} -> {rel} {img.size} {os.path.getsize(dst)//1024}KB")
        print(done[-1], flush=True)
    if missing:
        print("MISSING:", ", ".join(missing))


if __name__ == "__main__":
    main()

