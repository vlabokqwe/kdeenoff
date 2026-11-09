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
    "v2-logo-cards": ("brand/mark-cards.webp", "cut", 512, 90),
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
    "v2-mode-bonus": ("deco/mode-bonus.webp", "cut", 840, 88),
    "v2-mode-bonus-bg": ("deco/mode-bonus-ry.webp", "bg", 840, 88),
    "v2-sparkle": ("deco/sparkle.webp", "cut", 160, 88),
    "v2-side-board": ("deco/side-board.webp", "cut", 480, 88),
    "v2-side-cloth": ("deco/side-cloth.webp", "cut", 1600, 86),
    "v2-side-flow-streak": ("deco/side-flow-streak.webp", "cut", 360, 90),
    "v2-side-flow-spark": ("deco/side-flow-spark.webp", "cut", 200, 90),
    "v2-side-flow-star": ("deco/side-flow-star.webp", "cut", 220, 90),
    "v2-side-flow-glint": ("deco/side-flow-glint.webp", "cut", 180, 90),
    "v2-side-flow-coin": ("deco/side-flow-coin.webp", "cut", 200, 90),
    "v2-side-flow-shell": ("deco/side-flow-shell.webp", "cut", 200, 90),
    "v2-flow-star": ("deco/flow-star.webp", "cut", 220, 90),
    "v2-flow-spark": ("deco/flow-spark.webp", "cut", 200, 90),
    "v2-flow-streak": ("deco/flow-streak.webp", "cut", 360, 90),
    "v2-flow-mote": ("deco/flow-mote.webp", "cut", 120, 90),
    "v2-flow-diamond": ("deco/flow-diamond.webp", "cut", 180, 90),
    "v2-flow-twinkle": ("deco/flow-twinkle.webp", "cut", 160, 90),
    "v2-flow-glint": ("deco/flow-glint.webp", "cut", 128, 90),
    "v2-flow-mist": ("deco/flow-mist.webp", "cut", 520, 88),
    "v2-flow-nebula": ("deco/flow-nebula.webp", "cut", 420, 88),
    "v2-flow-veil": ("deco/flow-veil.webp", "cut", 640, 88),
    "v2-flow-wisp": ("deco/flow-wisp.webp", "cut", 640, 88),
    # icons
    "v2-ic-home": ("icons/home.webp", "cut", 192, 88),
    "v2-ic-menu": ("icons/nav-menu.webp", "cut", 192, 88),
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
    "v2-step-join": ("steps/join.webp", "bg", 1280, 86),
    "v2-step-key": ("steps/key.webp", "bg", 1280, 86),
    "v2-step-watch": ("steps/watch.webp", "bg", 1280, 86),
    "v2-footer-mark": ("footer/mark.webp", "cut", 720, 90),
    # bonus / raffle / contacts
    "v2-bonus-art": ("bonus/art.webp", "cut", 1200, 88),
    "v2-raffle-art": ("raffle/drum.webp", "cut", 1000, 88),
    "v2-contacts-art": ("contacts/phone.webp", "cut", 1000, 88),
    "v2-contact-telegram": ("contacts/telegram.webp", "cut", 800, 88),
    "v2-contact-kick": ("contacts/kick.webp", "cut", 800, 88),
    "v2-partner-stake": ("partners/stake-bg.webp", "bg", 1400, 80),
    "v2-partner-generic": ("partners/generic-bg.webp", "bg", 1400, 80),
    "v2-partner-stake-art": ("partners/stake-art.webp", "cut", 640, 88),
    "v2-partner-shuffle-art": ("partners/shuffle-art.webp", "cut", 640, 88),
    "v2-partner-rainbet-art": ("partners/rainbet-art.webp", "cut", 640, 88),
    "v2-partner-stake-card": ("partners/stake-card.webp", "bg", 1400, 82),
    "v2-partner-shuffle-card": ("partners/shuffle-card.webp", "bg", 1400, 82),
    "v2-partner-rainbet-card": ("partners/rainbet-card.webp", "bg", 1400, 82),
    "v2-partner-stake-mark": ("partners/stake-mark.webp", "cut", 1000, 90),
    "v2-partner-shuffle-mark": ("partners/shuffle-mark.webp", "cut", 1000, 90),
    "v2-partner-rainbet-mark": ("partners/rainbet-mark.webp", "cut", 1000, 90),
    "v2-partner-stake-field": ("partners/stake-field.webp", "bg", 1800, 84),
    "v2-stake-slot-bg": ("partners/stake-slot-bg.webp", "bg", 1800, 84),
    "v2-stake-wordmark": ("partners/stake-wordmark.webp", "cut", 1400, 92),
    "v2-500-wordmark": ("partners/500-wordmark.webp", "cut", 1400, 92),
    "v2-stake-btn-bg": ("partners/stake-btn-bg.webp", "bg", 1600, 86),
    "v2-stake-raccoon": ("partners/stake-raccoon.webp", "cut", 1200, 90),
    "v2-partner-pillar": ("partners/pillar.webp", "cut", 1100, 88),
    "v2-partner-shuffle-field": ("partners/shuffle-field.webp", "bg", 1800, 84),
    "v2-partner-rainbet-field": ("partners/rainbet-field.webp", "bg", 1800, 84),
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
    "v2-lb-place-1": ("lb/place-1.webp", "cut", 640, 88),
    "v2-lb-place-2": ("lb/place-2.webp", "cut", 640, 88),
    "v2-lb-place-3": ("lb/place-3.webp", "cut", 640, 88),
    # mode-card studies (full-bleed, keep the field)
    "v2-card-raffle-a": ("deco/cards/raffle-a.webp", "bg", 840, 88),
    "v2-card-raffle-b": ("deco/cards/raffle-b.webp", "bg", 840, 88),
    "v2-card-raffle-c": ("deco/cards/raffle-c.webp", "bg", 840, 88),
    "v2-card-raffle-d": ("deco/cards/raffle-d.webp", "bg", 840, 88),
    "v2-card-boards-a": ("deco/cards/boards-a.webp", "bg", 840, 88),
    "v2-card-boards-b": ("deco/cards/boards-b.webp", "bg", 840, 88),
    "v2-card-boards-c": ("deco/cards/boards-c.webp", "bg", 840, 88),
    "v2-card-boards-d": ("deco/cards/boards-d.webp", "bg", 840, 88),
    "v2-card-bonus-a": ("deco/cards/bonus-a.webp", "bg", 840, 88),
    "v2-card-bonus-b": ("deco/cards/bonus-b.webp", "bg", 840, 88),
    "v2-card-bonus-c": ("deco/cards/bonus-c.webp", "bg", 840, 88),
    "v2-card-bonus-d": ("deco/cards/bonus-d.webp", "bg", 840, 88),
    "v2-card-bonus-e": ("deco/cards/bonus-e.webp", "bg", 840, 88),
    "v2-card-bonus-f": ("deco/cards/bonus-f.webp", "bg", 840, 88),
    "v2-card-bonus-g": ("deco/cards/bonus-g.webp", "bg", 840, 88),
    "v2-card-bonus-h": ("deco/cards/bonus-h.webp", "bg", 840, 88),
    "v2-card-bonus-i": ("deco/cards/bonus-i.webp", "bg", 840, 88),
    "v2-card-bonus-j": ("deco/cards/bonus-j.webp", "bg", 840, 88),
    "v2-card-bonus-k": ("deco/cards/bonus-k.webp", "bg", 840, 88),
    "v2-card-bonus-l": ("deco/cards/bonus-l.webp", "bg", 840, 88),
    "v2-card-bonus-m": ("deco/cards/bonus-m.webp", "bg", 840, 88),
    "v2-card-bonus-n": ("deco/cards/bonus-n.webp", "bg", 840, 88),
    "v2-card-bonus-o": ("deco/cards/bonus-o.webp", "bg", 840, 88),
    "v2-card-bonus-p": ("deco/cards/bonus-p.webp", "bg", 840, 88),
    "v2-card-bonus-q": ("deco/cards/bonus-q.webp", "bg", 840, 88),
    "v2-card-bonus-r": ("deco/cards/bonus-r.webp", "bg", 840, 88),
    "v2-card-bonus-s": ("deco/cards/bonus-s.webp", "bg", 840, 88),
    "v2-card-bonus-t": ("deco/cards/bonus-t.webp", "bg", 840, 88),
    "v2-card-heat-a": ("deco/cards/heat-a.webp", "bg", 840, 88),
    "v2-card-heat-b": ("deco/cards/heat-b.webp", "bg", 840, 88),
    "v2-card-heat-c": ("deco/cards/heat-c.webp", "bg", 840, 88),
    "v2-card-heat-d": ("deco/cards/heat-d.webp", "bg", 840, 88),
    "v2-card-heat-e": ("deco/cards/heat-e.webp", "bg", 840, 88),
    "v2-card-heat-f": ("deco/cards/heat-f.webp", "bg", 840, 88),
    "v2-card-heat-g": ("deco/cards/heat-g.webp", "bg", 840, 88),
    "v2-card-heat-h": ("deco/cards/heat-h.webp", "bg", 840, 88),
    "v2-card-heat-i": ("deco/cards/heat-i.webp", "bg", 840, 88),
    "v2-card-heat-j": ("deco/cards/heat-j.webp", "bg", 840, 88),
    # home cloth icons вЂ” cutouts, then tiled by scripts/build-home-cloth.py
    "v2-cloth-bolt": ("bg/cloth-bolt.webp", "cut", 320, 90),
    "v2-cloth-coin": ("bg/cloth-coin.webp", "cut", 320, 90),
    "v2-cloth-gem": ("bg/cloth-gem.webp", "cut", 320, 90),
    "v2-cloth-star": ("bg/cloth-star.webp", "cut", 320, 90),
    "v2-cloth-die": ("bg/cloth-die.webp", "cut", 320, 90),
    "v2-cloth-laurel": ("bg/cloth-laurel.webp", "cut", 320, 90),
    "v2-block-flamingo": ("bg/block-flamingo.webp", "cut", 320, 90),
    "v2-block-coin": ("bg/block-coin.webp", "cut", 320, 90),
    "v2-block-rainbow": ("bg/block-rainbow.webp", "cut", 320, 90),
    "v2-block-chip": ("bg/block-chip.webp", "cut", 320, 90),
    "v2-block-pot": ("bg/block-pot.webp", "cut", 320, 90),
    "v2-block-star": ("bg/block-star.webp", "cut", 320, 90),
    # home banner ground (v3): stamped slot emblems, cloth tile, wear masks
    "v3-emblem-crown": ("bg/emblem-crown.webp", "cut", 256, 90),
    "v3-emblem-bell": ("bg/emblem-bell.webp", "cut", 256, 90),
    "v3-emblem-cherry": ("bg/emblem-cherry.webp", "cut", 256, 90),
    "v3-emblem-seven": ("bg/emblem-seven.webp", "cut", 256, 90),
    "v3-emblem-horseshoe": ("bg/emblem-horseshoe.webp", "cut", 256, 90),
    "v3-emblem-gem": ("bg/emblem-gem.webp", "cut", 256, 90),
    "v3-emblem-helmet": ("bg/emblem-helmet.webp", "cut", 256, 90),
    "v3-emblem-grapes": ("bg/emblem-grapes.webp", "cut", 256, 90),
    "v3-emblem-lantern": ("bg/emblem-lantern.webp", "cut", 256, 90),
    "v3-emblem-skull": ("bg/emblem-skull.webp", "cut", 256, 90),
    "v3-emblem-devil": ("bg/emblem-devil.webp", "cut", 256, 90),
    "v3-emblem-clover": ("bg/emblem-clover.webp", "cut", 256, 90),
    "v3-cloth-a": ("bg/banner-cloth.webp", "tile", 512, 82),
    "v3-wear-a": ("bg/wear-a.webp", "alpha", 256, 85),
    "v3-wear-b": ("bg/wear-b.webp", "alpha", 256, 85),
    # home honeycomb ground (v4): faceted site glyphs, used as CSS masks
    "v4-glyph-gift": ("bg/glyph-gift.webp", "cut", 256, 90),
    "v4-glyph-trophy": ("bg/glyph-trophy.webp", "cut", 256, 90),
    "v4-glyph-ticket": ("bg/glyph-ticket.webp", "cut", 256, 90),
    "v4-glyph-coin": ("bg/glyph-coin.webp", "cut", 256, 90),
    "v4-glyph-dice": ("bg/glyph-dice.webp", "cut", 256, 90),
    "v4-glyph-diamond": ("bg/glyph-diamond.webp", "cut", 256, 90),
    "v4-glyph-medal": ("bg/glyph-medal.webp", "cut", 256, 90),
    "v4-glyph-star": ("bg/glyph-star.webp", "cut", 256, 90),
    # home slot cabinet
    "v2-slot-mascot": ("cabinet/mascot.webp", "cut", 1200, 90),
    "v2-slot-crown": ("cabinet/crown.webp", "cut", 480, 90),
    "v2-slot-coins": ("cabinet/coins.webp", "cut", 480, 90),
    "v2-slot-gem": ("cabinet/gem.webp", "cut", 480, 90),
    "v2-slot-star": ("cabinet/star.webp", "cut", 480, 90),
    "v2-slot-bell": ("cabinet/bell.webp", "cut", 480, 90),
    "v2-slot-lever": ("cabinet/lever.webp", "cut", 900, 90),
    "v2-slot-crest": ("cabinet/crest.webp", "cut", 1600, 90),
    "v2-slot-hall": ("cabinet/hall.webp", "bg", 2560, 78),
    "v2-slot-lamp": ("lb/slot-lamp.webp", "cut", 1600, 90),
    "v2-slot-jewel": ("lb/slot-gem.webp", "cut", 1400, 90),
    "v2-slot-host": ("lb/slot-host.webp", "cut", 900, 90),
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
        # Masks are already 1024px; upscaling them only softens the edges.
        img = Image.open(src) if mode == "alpha" else upscale(src, raw_dir)
        if mode == "cut":
            img = cutout(img)
        elif mode == "alpha":
            # black-and-white mask -> white RGBA, alpha = hard-thresholded luminance
            lum = img.convert("L").resize((size, size), Image.LANCZOS)
            img = Image.new("RGBA", lum.size, (255, 255, 255, 0))
            img.putalpha(lum.point(lambda v: 255 if v > 140 else 0))
        else:
            img = img.convert("RGB")
        img = fit(img, size)
        dst = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if mode == "alpha":
            img.save(dst, "WEBP", lossless=True, method=6)
        else:
            img.save(dst, "WEBP", quality=q, method=6)
        done.append(f"{name} -> {rel} {img.size} {os.path.getsize(dst)//1024}KB")
        print(done[-1], flush=True)
    if missing:
        print("MISSING:", ", ".join(missing))


if __name__ == "__main__":
    main()

