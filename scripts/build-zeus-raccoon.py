"""
Build the living Le Zeus raccoon mascot for the /leaderboards/ 500 Casino partner card:
  1. Reads the 145-frame 24fps seamless character animation sequence (art-raw/zeus-live2/frames),
     pads the tight right edge with clean backdrop before 4x AI upscaling via Real-ESRGAN
     (realesrgan-x4plus-anime, cached in art-raw/zeus-live2/up_pad/).
  2. Performs 4K hot-pink chroma unmixing (both exterior backdrop and enclosed interior holes
     under the right arm and between the glove/bolt/tail), pink despill, and Gaussian level-set
     contour smoothing with crisp cartoon ink outline preservation.
  3. Crops all 145 frames to a single locked union bounding box (target height 960px, even width,
     strictly zeroed RGB in alpha=0 regions so YUV420 never bleeds chroma).
  4. Saves exact Frame-0 WebP poster (zeus-raccoon.webp) + VP9 alpha WebM (zeus-raccoon.webm).
"""
import glob
import os
import subprocess

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEQ_DIR = os.path.join(ROOT, "art-raw", "zeus-live2")
FRAMES_DIR = os.path.join(SEQ_DIR, "frames")
PAD_DIR = os.path.join(SEQ_DIR, "frames_pad")
UP_DIR = os.path.join(SEQ_DIR, "up_pad")

OUT_DIR = os.path.join(ROOT, "frontend", "public", "img", "partners")
OUT_WEBP = os.path.join(OUT_DIR, "zeus-raccoon.webp")
OUT_WEBM = os.path.join(OUT_DIR, "zeus-raccoon.webm")

_DEFAULT_ESRGAN = os.path.join(
    os.environ.get("LOCALAPPDATA", ""),
    "realesrgan",
    "bin",
    "realesrgan-ncnn-vulkan.exe",
)
ESRGAN = os.environ.get("ESRGAN") or (_DEFAULT_ESRGAN if os.path.exists(_DEFAULT_ESRGAN) else "")
PAD_RIGHT_1X = 16


def ensure_4k_frames(src_files):
    """Pad right border by PAD_RIGHT_1X px of exact frame backdrop and batch-upscale 4x via Real-ESRGAN."""
    os.makedirs(PAD_DIR, exist_ok=True)
    os.makedirs(UP_DIR, exist_ok=True)

    need_pad = False
    for src in src_files:
        bn = os.path.basename(src)
        dst_pad = os.path.join(PAD_DIR, bn)
        if not os.path.exists(dst_pad):
            need_pad = True
            rgb = np.asarray(Image.open(src).convert("RGB"))
            h, w, _ = rgb.shape
            bg = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0]]), axis=0).astype(np.uint8)
            canvas = np.empty((h, w + PAD_RIGHT_1X, 3), dtype=np.uint8)
            canvas[:, :w] = rgb
            canvas[:, w:] = bg[None, None, :]
            Image.fromarray(canvas, "RGB").save(dst_pad)

    missing_up = [
        os.path.basename(src)
        for src in src_files
        if not os.path.exists(os.path.join(UP_DIR, os.path.basename(src)))
    ]
    if missing_up:
        if ESRGAN and os.path.exists(ESRGAN):
            print(f"    Running Real-ESRGAN x4 batch on {len(src_files)} frames...")
            subprocess.run(
                [
                    ESRGAN,
                    "-i", PAD_DIR,
                    "-o", UP_DIR,
                    "-n", "realesrgan-x4plus-anime",
                    "-s", "4",
                    "-f", "png",
                ],
                check=True,
                cwd=os.path.dirname(ESRGAN),
            )
        else:
            print("    ESRGAN binary not found; falling back to 4x Lanczos...")
            for src in src_files:
                bn = os.path.basename(src)
                up_p = os.path.join(UP_DIR, bn)
                if not os.path.exists(up_p):
                    im = Image.open(os.path.join(PAD_DIR, bn)).convert("RGB")
                    im.resize((im.width * 4, im.height * 4), Image.LANCZOS).save(up_p)


def compute_union_box_1x(pad_files):
    """Compute fixed 1x union crop box across all frames so sandals stay locked and rising tail never clips."""
    xmin, ymin, xmax, ymax = 99999, 99999, 0, 0
    h1, w1 = 0, 0
    for f in pad_files:
        rgb = np.asarray(Image.open(f).convert("RGB"), dtype=np.float32)
        h1, w1, _ = rgb.shape
        bg = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), axis=0)
        scale_r = float(bg[2] / max(bg[0], 1.0))
        m_pink = np.minimum(rgb[..., 0] * scale_r, rgb[..., 2]) - rgb[..., 1]
        ys, xs = np.where(m_pink < 24.0)
        xmin = min(xmin, int(xs.min()))
        ymin = min(ymin, int(ys.min()))
        xmax = max(xmax, int(xs.max()))
        ymax = max(ymax, int(ys.max()))

    pad_l, pad_t, pad_r, pad_b = 10, 10, 10, 10
    return (
        max(0, xmin - pad_l),
        max(0, ymin - pad_t),
        min(w1, xmax + pad_r + 1),
        min(h1, ymax + pad_b + 1),
    )


def key_4k_frame(up_path, box_1x, target_w, target_h):
    rgb4 = np.asarray(Image.open(up_path).convert("RGB"), dtype=np.float32)
    border = np.concatenate([rgb4[0], rgb4[-1], rgb4[:, 0], rgb4[:, -1]])
    bg = np.median(border, axis=0)

    x0, y0, x1, y1 = [c * 4 for c in box_1x]
    rgb = rgb4[y0:y1, x0:x1]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    scale_r = float(bg[2] / max(bg[0], 1.0))
    m_pink = np.minimum(r * scale_r, b) - g
    m_bg = max(float(np.minimum(bg[0] * scale_r, bg[2]) - bg[1]), 80.0)

    # 1. Exterior hot-pink backdrop + genuine interior enclosed backdrop holes (armpit, bolt/tail gap)
    raw_bg = (m_pink > 24.0).astype(np.uint8)
    n_bg, bg_labels, bg_stats, _ = cv2.connectedComponentsWithStats(raw_bg, connectivity=4)
    edge_lbls = set(
        np.unique(np.concatenate([bg_labels[0], bg_labels[-1], bg_labels[:, 0], bg_labels[:, -1]]))
    ) - {0}
    valid_bg = set(edge_lbls)
    for i in range(1, n_bg):
        if i not in valid_bg and bg_stats[i, cv2.CC_STAT_AREA] >= 64:
            if float(m_pink[bg_labels == i].max()) > 55.0:
                valid_bg.add(i)
    bgm = np.isin(bg_labels, list(valid_bg))

    # Keep only the main character foreground component
    fg_init = (~bgm).astype(np.uint8)
    num_fg, fg_labels, fg_stats, _ = cv2.connectedComponentsWithStats(fg_init, connectivity=8)
    if num_fg > 1:
        largest = 1 + int(np.argmax(fg_stats[1:, cv2.CC_STAT_AREA]))
        bgm = bgm | (fg_labels != largest)

    # 2. Continuous foreground matte & color unmixing along the boundary
    ext_zone = cv2.dilate(bgm.astype(np.uint8), np.ones((21, 21), np.uint8), iterations=1).astype(bool)
    fg_cont = np.where(
        ext_zone,
        1.0 - np.clip((m_pink - 6.0) / (m_bg * 0.72), 0.0, 1.0),
        1.0,
    ).astype(np.float32)
    fg_cont[bgm & (m_pink > m_bg * 0.78)] = 0.0

    safe = np.maximum(fg_cont, 0.08)[..., None]
    fg = np.where(
        ext_zone[..., None] & (fg_cont[..., None] < 0.98),
        (rgb - (1.0 - safe) * bg) / safe,
        rgb,
    )
    fg = np.clip(fg, 0.0, 255.0)

    pink_excess = np.maximum(0.0, np.minimum(fg[..., 0] * scale_r, fg[..., 2]) - fg[..., 1])
    spill_mask = ext_zone.astype(np.float32)
    fg[..., 0] = np.clip(fg[..., 0] - (pink_excess / max(scale_r, 0.2)) * spill_mask, 0.0, 255.0)
    fg[..., 2] = np.clip(fg[..., 2] - pink_excess * spill_mask, 0.0, 255.0)

    # 3. Subpixel Gaussian level-set curvature smoothing + crisp dark cartoon ink outline lock
    alpha_blur = cv2.GaussianBlur(fg_cont, (0, 0), 4.8)
    alpha_smooth = np.clip((alpha_blur - 0.66) / 0.18, 0.0, 1.0)
    alpha_smooth = alpha_smooth * alpha_smooth * (3.0 - 2.0 * alpha_smooth)

    ink_color = np.array([20.0, 14.0, 12.0], dtype=np.float32)
    edge_weight = np.clip((0.95 - alpha_blur) / 0.25, 0.0, 1.0)[..., None]
    fg = np.clip(fg * (1.0 - edge_weight) + np.minimum(fg, ink_color) * edge_weight, 0.0, 255.0)

    # Premultiply before Lanczos downsampling to eliminate haloing, then unpremultiply cleanly
    fg_pm = fg * alpha_smooth[..., None]
    rgba_pm_4k = np.dstack([fg_pm, alpha_smooth * 255.0]).astype(np.uint8)
    im_pm_1x = Image.fromarray(rgba_pm_4k, "RGBA").resize((target_w, target_h), Image.LANCZOS)

    arr_1x = np.asarray(im_pm_1x, dtype=np.float32)
    a_01 = arr_1x[..., 3:4] / 255.0
    a_01 = np.where(a_01 < (3.0 / 255.0), 0.0, a_01)
    safe_1x = np.where(a_01 > 1e-3, a_01, 1.0)
    rgb_1x = np.where(a_01 > 1e-3, np.clip(arr_1x[..., :3] / safe_1x, 0.0, 255.0), 0.0)
    out_rgba = np.dstack([rgb_1x, a_01 * 255.0]).astype(np.uint8)
    return Image.fromarray(out_rgba, "RGBA")


def main():
    src_files = sorted(glob.glob(os.path.join(FRAMES_DIR, "*.png")))
    if not src_files:
        raise FileNotFoundError(f"No frames found in {FRAMES_DIR}")

    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"1/4 Preparing 4K Real-ESRGAN frames ({len(src_files)} frames)...")
    ensure_4k_frames(src_files)

    pad_files = [os.path.join(PAD_DIR, os.path.basename(f)) for f in src_files]
    box_1x = compute_union_box_1x(pad_files)
    bw, bh = box_1x[2] - box_1x[0], box_1x[3] - box_1x[1]
    target_h = 960
    target_w = round(bw * (target_h / bh))
    if target_w % 2 == 1:
        target_w += 1
    print(f"2/4 Union crop box={box_1x} ({bw}x{bh}) -> output {target_w}x{target_h}")

    keyed_dir = os.path.join(SEQ_DIR, "keyed_final")
    os.makedirs(keyed_dir, exist_ok=True)
    for old in glob.glob(os.path.join(keyed_dir, "*.png")):
        os.remove(old)

    print(f"3/4 Keying {len(src_files)} 4K frames with premultiplied Lanczos downsampling...")
    for idx, src in enumerate(src_files):
        bn = os.path.basename(src)
        up_path = os.path.join(UP_DIR, bn)
        out_img = key_4k_frame(up_path, box_1x, target_w, target_h)
        out_img.save(os.path.join(keyed_dir, f"{idx + 1:04d}.png"))
        if idx == 0:
            out_img.save(OUT_WEBP, "WEBP", quality=94, method=6)
            print(f"    Saved Frame-0 WebP poster: {OUT_WEBP} {out_img.size} ({os.path.getsize(OUT_WEBP) // 1024}KB)")
        if (idx + 1) % 30 == 0 or idx + 1 == len(src_files):
            print(f"    Keyed {idx + 1}/{len(src_files)} frames", flush=True)

    print("4/4 Encoding VP9 alpha WebM...")
    subprocess.run(
        [
            "ffmpeg", "-y", "-framerate", "24",
            "-i", os.path.join(keyed_dir, "%04d.png"),
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
            "-an", "-b:v", "0", "-crf", "23", "-row-mt", "1",
            "-deadline", "good", "-cpu-used", "2",
            "-metadata:s:v:0", "alpha_mode=1",
            OUT_WEBM,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"Saved WebM: {OUT_WEBM} ({os.path.getsize(OUT_WEBM) // 1024}KB)")


if __name__ == "__main__":
    main()

