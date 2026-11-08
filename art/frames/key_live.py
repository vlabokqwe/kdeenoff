"""Key the new raccoon clip to a transparent VP9 WebM. One crop for every frame."""
import os
import subprocess

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = r"C:\Users\Forti\.cursor\projects\e-work-html-leaderbord-kdeenoff\assets\stake-raccoon.mp4"
FRAMES = os.path.join(os.path.dirname(__file__), "live-seq")
KEYED = os.path.join(os.path.dirname(__file__), "live-keyed")
OUT = os.path.join(ROOT, "public", "img", "partners", "stake-raccoon.webm")


def key_rgb(rgb, bg):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = np.minimum(r, b) - g
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
    return fg, a


def main():
    os.makedirs(FRAMES, exist_ok=True)
    os.makedirs(KEYED, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", SRC, "-map", "0:v:0", os.path.join(FRAMES, "%04d.png")],
        check=True,
    )
    names = sorted(f for f in os.listdir(FRAMES) if f.endswith(".png"))
    first = np.asarray(Image.open(os.path.join(FRAMES, names[0])).convert("RGB")).astype(np.float32)
    border = np.concatenate([first[0], first[-1], first[:, 0], first[:, -1]])
    bg = np.median(border, axis=0)
    print("bg", bg, "frames", len(names))

    alphas = []
    fgs = []
    for name in names:
        rgb = np.asarray(Image.open(os.path.join(FRAMES, name)).convert("RGB")).astype(np.float32)
        fg, a = key_rgb(rgb, bg)
        fgs.append(fg)
        alphas.append(a)

    stack = np.stack(alphas)
    solid = stack > 0.5
    rows = np.where(solid.sum(axis=(0, 2)) >= 6)[0]
    cols = np.where(solid.sum(axis=(0, 1)) >= 6)[0]
    h, w = alphas[0].shape
    pad = 12
    box = (
        max(int(cols.min()) - pad, 0),
        max(int(rows.min()) - pad, 0),
        min(int(cols.max()) + pad + 1, w),
        min(int(rows.max()) + pad + 1, h),
    )
    print("crop", box)

    for name, fg, a in zip(names, fgs, alphas):
        out = Image.fromarray(np.dstack([fg, a * 255.0]).astype(np.uint8), "RGBA")
        out = out.crop(box)
        out.save(os.path.join(KEYED, name))

    subprocess.run(
        [
            "ffmpeg", "-y", "-framerate", "24",
            "-i", os.path.join(KEYED, "%04d.png"),
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
            "-an", "-b:v", "0", "-crf", "30", "-row-mt", "1",
            "-deadline", "good", "-cpu-used", "2",
            "-metadata:s:v:0", "alpha_mode=1",
            OUT,
        ],
        check=True,
    )
    print("wrote", OUT, os.path.getsize(OUT))


if __name__ == "__main__":
    main()
