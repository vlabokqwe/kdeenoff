"""Key the 500 Casino game-night raccoon (green screen) with 4x supersampled level-set contour smoothing."""
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRAMES = os.path.join(os.path.dirname(__file__), "live-seq")
KEYED = os.path.join(os.path.dirname(__file__), "live-keyed")
OUT = os.path.join(ROOT, "frontend", "public", "img", "partners", "stake-raccoon.webm")
POSTER = os.path.join(ROOT, "frontend", "public", "img", "partners", "stake-raccoon.webp")


def prepare_1x(rgb):
    """Compute 1x despilled RGB and continuous foreground matte before 4x supersampled contour smoothing."""
    rgb = rgb.astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    g_excess = g - np.maximum(r, b)

    # 1. Identify exterior green background connected to the frame border
    raw_bg = (g_excess > 16.0).astype(np.uint8)
    _n, labels = cv2.connectedComponents(raw_bg, connectivity=4)
    edge_labels = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    bgm = np.isin(labels, edge_labels)
    bgm[labels == 0] = False

    # Keep only the main character foreground component
    fg_init = (~bgm).astype(np.uint8)
    num_fg, fg_labels, stats, _ = cv2.connectedComponentsWithStats(fg_init, connectivity=8)
    if num_fg > 1:
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        bgm = ~(fg_labels == largest)

    # 2. Continuous foreground matte along the outer boundary (no binary staircase quantization)
    ext_zone = cv2.dilate(bgm.astype(np.uint8), np.ones((7, 7), np.uint8), iterations=1).astype(bool)
    fg_cont = np.where(ext_zone, 1.0 - np.clip((g_excess - 8.0) / 55.0, 0.0, 1.0), 1.0).astype(np.float32)
    fg_cont[bgm & (g_excess > 63.0)] = 0.0

    # 3. Fill any enclosed interior green pocket (under the left white drawstring on the chest)
    #    with dark navy hoodie fabric (38, 35, 52)
    fg = rgb.copy()
    interior_green = (~bgm) & (g_excess > 8.0)
    outer_band = cv2.dilate(bgm.astype(np.uint8), np.ones((7, 7), np.uint8), iterations=1).astype(bool)
    chest_pocket = interior_green & (~outer_band)
    if chest_pocket.any():
        pocket_dilated = (
            cv2.dilate(chest_pocket.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=1).astype(bool)
            & (~outer_band)
        )
        blend = np.clip((g_excess - 4.0) / 28.0, 0.0, 1.0)[..., None]
        hoodie_dark = np.array([38.0, 35.0, 52.0], dtype=np.float32)
        fg = np.where(pocket_dilated[..., None], fg * (1.0 - blend) + hoodie_dark * blend, fg)

    # 4. Suppress green spill on the RGB channels
    spill = np.maximum(0.0, fg[..., 1] - np.maximum(fg[..., 0], fg[..., 2]))
    fg[..., 1] -= spill
    fg[..., 0] = np.clip(fg[..., 0] + spill * 0.12, 0.0, 255.0)
    fg[..., 2] = np.clip(fg[..., 2] + spill * 0.12, 0.0, 255.0)

    return fg, fg_cont


def smooth_crop_4x(fg_crop, fg_cont_crop, target_w, target_h):
    """4x bicubic supersampling + Gaussian level-set curvature smoother to remove pixel stair-stepping."""
    ch, cw = fg_cont_crop.shape
    up_w, up_h = cw * 4, ch * 4

    alpha_up = cv2.resize(fg_cont_crop, (up_w, up_h), interpolation=cv2.INTER_CUBIC)
    fg_up = cv2.resize(fg_crop, (up_w, up_h), interpolation=cv2.INTER_CUBIC)

    # Wide Gaussian blur acts as a subpixel curvature-flow spline smoother on the contour level set.
    # Remapping [0.70, 0.88] -> [0, 1] shifts the edge inward by ~1.7px along the smooth normal
    # so the cut lands cleanly inside the black cartoon ink outline without any pixel staircases.
    alpha_blur = cv2.GaussianBlur(alpha_up, (0, 0), 6.5)
    alpha_smooth = np.clip((alpha_blur - 0.70) / 0.18, 0.0, 1.0)
    alpha_smooth = alpha_smooth * alpha_smooth * (3.0 - 2.0 * alpha_smooth)

    # Lock the outer cartoon outline zone smoothly toward dark ink color (20, 16, 26)
    ink_color = np.array([20.0, 16.0, 26.0], dtype=np.float32)
    edge_weight = np.clip((0.96 - alpha_blur) / 0.25, 0.0, 1.0)[..., None]
    fg_up = fg_up * (1.0 - edge_weight) + np.minimum(fg_up, ink_color) * edge_weight
    fg_up = np.clip(fg_up, 0.0, 255.0)

    rgba_up = np.dstack([fg_up, alpha_smooth * 255.0]).astype(np.uint8)
    return Image.fromarray(rgba_up, "RGBA").resize((target_w, target_h), Image.LANCZOS)


def content_box(alphas, pad=12):
    stack = np.stack(alphas)
    solid = stack > 0.55
    rows = np.where(solid.sum(axis=(0, 2)) >= 4)[0]
    cols = np.where(solid.sum(axis=(0, 1)) >= 4)[0]
    h, w = alphas[0].shape
    return (
        max(int(cols.min()) - pad, 0),
        max(int(rows.min()) - pad, 0),
        min(int(cols.max()) + pad + 1, w),
        min(int(rows.max()) + pad + 1, h),
    )


def main():
    video_path = sys.argv[1]
    start_frame = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    end_frame = int(sys.argv[3]) if len(sys.argv) > 3 else 148

    os.makedirs(FRAMES, exist_ok=True)
    os.makedirs(KEYED, exist_ok=True)
    for name in os.listdir(FRAMES):
        os.remove(os.path.join(FRAMES, name))
    for name in os.listdir(KEYED):
        os.remove(os.path.join(KEYED, name))

    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-map", "0:v:0", os.path.join(FRAMES, "%04d.png")],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    all_names = sorted(f for f in os.listdir(FRAMES) if f.endswith(".png"))
    selected_names = all_names[start_frame:end_frame]

    prepared = []
    alphas_1x = []
    for name in selected_names:
        rgb = np.asarray(Image.open(os.path.join(FRAMES, name)).convert("RGB"))
        fg, fg_cont = prepare_1x(rgb)
        prepared.append((fg, fg_cont))
        alphas_1x.append(fg_cont)

    box = content_box(alphas_1x, pad=12)
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    target_h = 960
    target_w = round(bw * (target_h / bh))
    if target_w % 2 == 1:
        target_w += 1
    print(f"Selected {len(selected_names)} frames, crop={box} ({bw}x{bh}) -> {target_w}x{target_h}")

    for idx, (fg, fg_cont) in enumerate(prepared):
        fg_crop = fg[y0:y1, x0:x1]
        fg_cont_crop = fg_cont[y0:y1, x0:x1]
        out_img = smooth_crop_4x(fg_crop, fg_cont_crop, target_w, target_h)
        out_name = f"{idx + 1:04d}.png"
        out_img.save(os.path.join(KEYED, out_name))
        if idx == 0:
            out_img.save(POSTER, "WEBP", quality=94, method=6)
            print("Saved poster:", POSTER, out_img.size, os.path.getsize(POSTER))

    subprocess.run(
        [
            "ffmpeg", "-y", "-framerate", "24",
            "-i", os.path.join(KEYED, "%04d.png"),
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
            "-an", "-b:v", "0", "-crf", "26", "-row-mt", "1",
            "-deadline", "good", "-cpu-used", "2",
            "-metadata:s:v:0", "alpha_mode=1",
            OUT,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print("Saved WebM:", OUT, os.path.getsize(OUT))


if __name__ == "__main__":
    main()
