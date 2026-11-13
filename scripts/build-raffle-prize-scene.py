"""
Build the animated low-poly Raffle Prize Card scene:
  - Reads the 1920x1080 Real-ESRGAN upscaled keyframe (art-raw/raffle-prize/keyframe_16x9.png).
  - Fits the exact concentric spotlight background plate behind the 8 foreground low-poly props
    and unmixes crisp RGBA sprites (left & right arcade prize claws, left & right floating sky
    islands, 2 floating purple gems, and 2 floating gold coins).
  - Renders a mathematically seamless 6-second 30fps loop (180 frames, Frame 0 == exact poster)
    into frontend/public/img/deco/raffle-prize-scene.mp4 + matching raffle-prize-scene.webp.
"""
import math
import os
import subprocess

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYFRAME_PATH = os.path.join(ROOT, "art-raw", "raffle-prize", "keyframe_16x9.png")
OUT_WEBP = os.path.join(ROOT, "frontend", "public", "img", "deco", "raffle-prize-scene.webp")
OUT_MP4 = os.path.join(ROOT, "frontend", "public", "img", "deco", "raffle-prize-scene.mp4")

OUT_W, OUT_H = 1280, 720
FPS = 30
DURATION_S = 6
TOTAL_FRAMES = FPS * DURATION_S


def measure_shaft_slope(mask: np.ndarray, side: str) -> float:
    """Measure dx/dy of the crane shaft between y=4 and y=64 so sliding stays rail-locked."""
    xs0 = np.where(mask[4] > 0)[0]
    xs1 = np.where(mask[64] > 0)[0]
    if len(xs0) == 0 or len(xs1) == 0:
        return 0.62 if side == "left" else -0.62
    c0 = 0.5 * (xs0.min() + xs0.max())
    c1 = 0.5 * (xs1.min() + xs1.max())
    return float((c1 - c0) / 60.0)


def extract_scene_layers(im_bgr: np.ndarray):
    h, w, _ = im_bgr.shape
    im_f = im_bgr.astype(np.float32)

    # Exact concentric spotlight profile measured along unobstructed horizontal band y=532..546
    cx, cy = w / 2.0, h / 2.0
    strip_r = np.median(im_f[532:546, int(cx):, :], axis=0)  # (960, 3)
    strip_l = np.median(im_f[532:546, :int(cx), :][..., ::-1], axis=0)
    # Average symmetric horizontal profile for clean radial LUT
    lut = 0.5 * (strip_r + strip_l[::-1])  # Wait: strip_l reversed along x is [:, ::-1]
    strip_l_rad = np.median(im_f[532:546, int(cx) - 1::-1, :], axis=0)
    lut = 0.5 * (strip_r + strip_l_rad)

    yy, xx = np.mgrid[0:h, 0:w]
    rr = np.hypot(xx - cx, (yy - cy) * (1080.0 / 1072.0))
    r_idx = np.clip(np.round(rr).astype(np.int32), 0, lut.shape[0] - 1)
    bg_radial = lut[r_idx]

    diff = np.linalg.norm(im_f - bg_radial, axis=-1)
    # Foreground props live strictly in left flank (x < 600) and right flank (x > 1320)
    flank = (xx < 600) | (xx > 1320)
    raw_mask = ((diff > 16.0) & flank).astype(np.uint8)
    raw_mask = cv2.morphologyEx(raw_mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))

    n_lbl, lbls, stats, cents = cv2.connectedComponentsWithStats(raw_mask, connectivity=8)

    sprites = []
    union_hole = np.zeros((h, w), dtype=np.uint8)

    for i in range(1, n_lbl):
        x, y, bw, bh, area = stats[i]
        if area < 1500:
            continue
        comp_solid = (lbls == i).astype(np.uint8)
        # Fill any tiny internal holes inside a solid prop
        inv = 1 - comp_solid
        n_bg, bg_l, bg_s, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
        edge_ids = set(
            np.unique(np.concatenate([bg_l[0], bg_l[-1], bg_l[:, 0], bg_l[:, -1]]))
        ) - {0}
        for j in range(1, n_bg):
            if j not in edge_ids and bg_s[j, cv2.CC_STAT_AREA] < 4000:
                comp_solid[bg_l == j] = 1

        dil = cv2.dilate(comp_solid, np.ones((15, 15), np.uint8), iterations=1)
        union_hole = np.maximum(union_hole, dil)

        # Smooth subpixel alpha & color unmixing against bg_radial
        pad = 12
        x0, y0 = max(0, x - pad), max(0, y - pad)
        x1, y1 = min(w, x + bw + pad), min(h, y + bh + pad)

        sub_im = im_f[y0:y1, x0:x1]
        sub_bg = bg_radial[y0:y1, x0:x1]
        sub_diff = diff[y0:y1, x0:x1]
        sub_dil = dil[y0:y1, x0:x1].astype(bool)
        sub_core = cv2.erode(comp_solid[y0:y1, x0:x1], np.ones((3, 3), np.uint8), iterations=1).astype(bool)

        alpha = np.clip((sub_diff - 6.0) / 18.0, 0.0, 1.0).astype(np.float32)
        alpha = np.where(sub_core, 1.0, alpha)
        alpha = np.where(sub_dil, alpha, 0.0)
        alpha = cv2.GaussianBlur(alpha, (0, 0), 0.75)
        alpha = np.where(sub_core, np.maximum(alpha, 0.995), alpha)
        alpha = np.where(alpha < 0.02, 0.0, np.clip(alpha, 0.0, 1.0))

        safe_a = np.maximum(alpha[..., None], 0.08)
        fg_bgr = np.where(
            (alpha[..., None] < 0.98) & (alpha[..., None] > 0.0),
            np.clip((sub_im - (1.0 - safe_a) * sub_bg) / safe_a, 0.0, 255.0),
            sub_im,
        )

        cx_i, cy_i = float(cents[i][0]), float(cents[i][1])
        side = "left" if cx_i < w / 2 else "right"
        if y <= 2:
            kind = "claw"
            slope = measure_shaft_slope(comp_solid, side)
        elif y + bh >= h - 2:
            kind = "island"
            slope = 0.0
        elif bw > 93 or bh > 85:
            kind = "gem"
            slope = 0.0
        else:
            kind = "coin"
            slope = 0.0

        sprites.append({
            "kind": kind,
            "side": side,
            "x0": x0,
            "y0": y0,
            "bgr": fg_bgr,
            "alpha": alpha,
            "slope": slope,
        })

    # Clean background plate: keep exact untouched center & replace only union_hole with smooth radial bg
    hole_soft = cv2.GaussianBlur(union_hole.astype(np.float32), (0, 0), 5.0)[..., None]
    bg_plate = im_f * (1.0 - hole_soft) + bg_radial * hole_soft

    # Draworder: islands first, then claws, then mid-air coins & gems
    order = {"island": 0, "claw": 1, "coin": 2, "gem": 3}
    sprites.sort(key=lambda s: (order[s["kind"]], 0 if s["side"] == "left" else 1))
    return bg_plate, rr, sprites


def warp_and_composite(canvas: np.ndarray, sp: dict, dx: float, dy: float, angle_deg: float):
    fg = sp["bgr"]
    al = sp["alpha"]
    sh, sw = al.shape
    x0, y0 = sp["x0"], sp["y0"]

    if abs(dx) < 1e-4 and abs(dy) < 1e-4 and abs(angle_deg) < 1e-4:
        roi = canvas[y0:y0 + sh, x0:x0 + sw]
        a3 = al[..., None]
        canvas[y0:y0 + sh, x0:x0 + sw] = roi * (1.0 - a3) + fg * a3
        return

    pad = 36
    pw, ph = sw + 2 * pad, sh + 2 * pad
    fg_pm = np.zeros((ph, pw, 3), dtype=np.float32)
    al_pad = np.zeros((ph, pw), dtype=np.float32)
    fg_pm[pad:pad + sh, pad:pad + sw] = fg * al[..., None]
    al_pad[pad:pad + sh, pad:pad + sw] = al

    cx_p, cy_p = pw / 2.0, ph / 2.0
    mat = cv2.getRotationMatrix2D((cx_p, cy_p), angle_deg, 1.0)
    mat[0, 2] += dx
    mat[1, 2] += dy

    w_pm = cv2.warpAffine(fg_pm, mat, (pw, ph), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    w_al = cv2.warpAffine(al_pad, mat, (pw, ph), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    w_al = np.clip(w_al, 0.0, 1.0)

    gx0, gy0 = x0 - pad, y0 - pad
    gx1, gy1 = gx0 + pw, gy0 + ph

    H, W, _ = canvas.shape
    cx0, cy0 = max(0, gx0), max(0, gy0)
    cx1, cy1 = min(W, gx1), min(H, gy1)
    if cx1 <= cx0 or cy1 <= cy0:
        return

    sx0, sy0 = cx0 - gx0, cy0 - gy0
    sx1, sy1 = sx0 + (cx1 - cx0), sy0 + (cy1 - cy0)

    sub_pm = w_pm[sy0:sy1, sx0:sx1]
    sub_al = w_al[sy0:sy1, sx0:sx1][..., None]
    roi = canvas[cy0:cy1, cx0:cx1]
    canvas[cy0:cy1, cx0:cx1] = roi * (1.0 - sub_al) + sub_pm


def main():
    im_bgr = cv2.imread(KEYFRAME_PATH, cv2.IMREAD_COLOR)
    if im_bgr is None:
        raise FileNotFoundError(KEYFRAME_PATH)

    bg_plate, rr, sprites = extract_scene_layers(im_bgr)
    print(f"Extracted {len(sprites)} low-poly sprites:", [(s["kind"], s["side"]) for s in sprites], flush=True)

    # Spotlight breathing mask (peaks gently on mid concentric rings, zero at frame 0)
    ring_glow = np.exp(-((rr - 340.0) ** 2) / (2.0 * (190.0 ** 2))).astype(np.float32)[..., None]

    # Save exact 1920x1080 WebP poster from Frame 0 so poster -> video transition is 100% invisible
    Image.fromarray(cv2.cvtColor(im_bgr, cv2.COLOR_BGR2RGB)).save(OUT_WEBP, "WEBP", quality=89, method=6)
    print(f"Saved WebP poster: {OUT_WEBP} ({os.path.getsize(OUT_WEBP)//1024} KB)", flush=True)

    os.makedirs(os.path.dirname(OUT_MP4), exist_ok=True)
    proc = subprocess.Popen(
        [
            "ffmpeg", "-y",
            "-f", "rawvideo",
            "-pix_fmt", "bgr24",
            "-s", f"{OUT_W}x{OUT_H}",
            "-r", str(FPS),
            "-i", "-",
            "-an",
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            OUT_MP4,
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    two_pi = 2.0 * math.pi
    for f in range(TOTAL_FRAMES):
        if f == 0:
            frame_1080 = im_bgr
        else:
            theta = two_pi * (f / TOTAL_FRAMES)
            # 0 at f=0, smooth [0..1..0] envelope
            env1 = 0.5 * (1.0 - math.cos(theta))
            env2 = 0.5 * (1.0 - math.cos(2.0 * theta))
            s1 = math.sin(theta)
            s2 = math.sin(2.0 * theta)

            # Subtle concentric spotlight pulse
            canvas = np.clip(bg_plate + ring_glow * (11.0 * env1), 0.0, 255.0)

            for sp in sprites:
                kind = sp["kind"]
                side = sp["side"]
                sgn = -1.0 if side == "left" else 1.0

                if kind == "claw":
                    # Slide smoothly up & back along exact diagonal crane shaft (dy <= 0 => zero top gap)
                    lift = 18.0 * env1 if side == "left" else 16.0 * (0.65 * env1 + 0.35 * env2)
                    dy = -lift
                    dx = sp["slope"] * dy
                    ang = 0.0
                elif kind == "island":
                    # Hover gently downward & back (dy >= 0 => bottom stays >= 1080, zero bottom gap)
                    drop = 15.0 * env1 if side == "left" else 15.0 * (0.55 * env1 + 0.45 * env2)
                    dy = drop
                    dx = 0.0
                    ang = 0.0
                elif kind == "gem":
                    # Free-floating mid-air purple gems: bob + gentle tilt
                    dy = -14.0 * s1 if side == "left" else 14.0 * s1
                    dx = 3.5 * s2 * sgn
                    ang = 7.5 * s1 * sgn
                else:
                    # Free-floating mid-air gold coins: 2-cycle lively bob + spin tilt
                    dy = 12.0 * s1 + 4.0 * s2 if side == "left" else -12.0 * s1 + 4.0 * s2
                    dx = -3.0 * s1 * sgn
                    ang = -9.5 * s1 * sgn

                warp_and_composite(canvas, sp, dx, dy, ang)

            frame_1080 = np.clip(np.round(canvas), 0, 255).astype(np.uint8)

        frame_720 = cv2.resize(frame_1080, (OUT_W, OUT_H), interpolation=cv2.INTER_AREA)
        proc.stdin.write(frame_720.tobytes())

    proc.stdin.close()
    ret = proc.wait()
    if ret != 0:
        raise RuntimeError(f"ffmpeg exited with code {ret}")
    print(f"Saved seamless loop MP4: {OUT_MP4} ({os.path.getsize(OUT_MP4)//1024} KB)", flush=True)


if __name__ == "__main__":
    main()
