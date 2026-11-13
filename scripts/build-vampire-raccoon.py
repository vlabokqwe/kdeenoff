"""
Build the living Le Vampire Count Smokey raccoon mascot for the /bonuses/ 500 Casino card:
  1. Uses the freshly generated #00FF00 chroma-key character (art-raw/v2_vamp_raccoon_*.jpg)
     upscaled 4x via Real-ESRGAN (art-raw/up/v2_vamp_raccoon_*_x4.png, 4096x4096).
  2. Performs 4K continuous green-screen unmixing, despill, and level-set contour smoothing
     into a 2x Retina supersampled working canvas (1896x1920 -> 948x960 output).
  3. Animates 120 frames (5.0s @ 24fps seamless loop) combining:
     - Live moving pie-cut cartoon pupils (side-glancing left toward the 500 Casino bonus offer,
       then snapping back to glare at the viewer)
     - Brow-angled cartoon blinks & menacing half-squint with crimson vampire eye glint
     - Grounded boots, 1930s rubber-hose bounce, evil vampire chuckle shake, mustache/snarl flex,
       ear flicks, bushy striped tail sway + tip whip, clenched fist pump, wrist-pivoted cane rock,
       and pulsing crimson ruby cane orb with specular glass sweep & rising crimson magic sparks.
  4. Encodes VP9 alpha WebM (vamp-raccoon.webm) + exact Frame-0 WebP poster (vamp-raccoon.webp).
"""
import glob
import math
import os
import subprocess
import tempfile

import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "art-raw")
OUT_DIR = os.path.join(ROOT, "frontend", "public", "img", "partners")
OUT_WEBP = os.path.join(OUT_DIR, "vamp-raccoon.webp")
OUT_WEBM = os.path.join(OUT_DIR, "vamp-raccoon.webm")

_DEFAULT_ESRGAN = os.path.join(
    os.environ.get("LOCALAPPDATA", ""),
    "realesrgan",
    "bin",
    "realesrgan-ncnn-vulkan.exe",
)


def newest_raw():
    files = sorted(glob.glob(os.path.join(RAW_DIR, "v2_vamp_raccoon_*.*")), key=os.path.getmtime)
    if not files:
        raise FileNotFoundError("No art-raw/v2_vamp_raccoon_* raw image found.")
    return files[-1]


def ensure_4k_master():
    raw_path = newest_raw()
    stem = os.path.splitext(os.path.basename(raw_path))[0]
    up_png = os.path.join(RAW_DIR, "up", f"{stem}_x4.png")
    if os.path.exists(up_png):
        return up_png
    os.makedirs(os.path.dirname(up_png), exist_ok=True)
    if os.path.exists(_DEFAULT_ESRGAN):
        subprocess.run(
            [_DEFAULT_ESRGAN, "-i", raw_path, "-o", up_png, "-n", "realesrgan-x4plus-anime", "-s", "4"],
            check=True,
        )
        return up_png
    im = Image.open(raw_path).convert("RGB")
    im.resize((im.width * 4, im.height * 4), Image.LANCZOS).save(up_png)
    return up_png


def key_4k_to_2x():
    master_path = ensure_4k_master()
    rgb = np.asarray(Image.open(master_path).convert("RGB"), dtype=np.float32)
    h4, w4, _ = rgb.shape
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    g_excess = g - np.maximum(r, b)

    bgm = g_excess > 45.0
    fg_bin = (~bgm).astype(np.uint8)
    num_fg, fg_labels, stats, _ = cv2.connectedComponentsWithStats(fg_bin, connectivity=8)
    if num_fg > 1:
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        bgm = fg_labels != largest

    ext_zone = cv2.dilate(bgm.astype(np.uint8), np.ones((21, 21), np.uint8), iterations=1).astype(bool)
    fg_cont = np.where(ext_zone, 1.0 - np.clip((g_excess - 8.0) / 58.0, 0.0, 1.0), 1.0).astype(np.float32)
    fg_cont[bgm & (g_excess > 66.0)] = 0.0

    fg = rgb.copy()
    spill = np.maximum(0.0, fg[..., 1] - np.maximum(fg[..., 0], fg[..., 2]))
    fg[..., 1] -= spill
    fg[..., 0] = np.clip(fg[..., 0] + spill * 0.12, 0.0, 255.0)
    fg[..., 2] = np.clip(fg[..., 2] + spill * 0.12, 0.0, 255.0)

    alpha_blur = cv2.GaussianBlur(fg_cont, (0, 0), 5.2)
    alpha_smooth = np.clip((alpha_blur - 0.68) / 0.18, 0.0, 1.0)
    alpha_smooth = alpha_smooth * alpha_smooth * (3.0 - 2.0 * alpha_smooth)

    ink_color = np.array([18.0, 14.0, 22.0], dtype=np.float32)
    edge_weight = np.clip((0.95 - alpha_blur) / 0.25, 0.0, 1.0)[..., None]
    fg = np.clip(fg * (1.0 - edge_weight) + np.minimum(fg, ink_color) * edge_weight, 0.0, 255.0)

    ys, xs = np.where(alpha_smooth > 0.5)
    pad_l, pad_r, pad_t, pad_b = 160, 180, 160, 68
    x0 = max(0, int(xs.min()) - pad_l)
    y0 = max(0, int(ys.min()) - pad_t)
    x1 = min(w4, int(xs.max()) + pad_r)
    y1 = min(h4, int(ys.max()) + pad_b)

    bw, bh = x1 - x0, y1 - y0
    target_h_1x = 960
    target_w_1x = round(bw * (target_h_1x / bh))
    if target_w_1x % 2 == 1:
        target_w_1x += 1

    w2, h2 = target_w_1x * 2, target_h_1x * 2
    rgba_4k = np.dstack([fg[y0:y1, x0:x1], alpha_smooth[y0:y1, x0:x1] * 255.0]).astype(np.uint8)
    rgba_2x = np.asarray(Image.fromarray(rgba_4k, "RGBA").resize((w2, h2), Image.LANCZOS))
    return rgba_2x, (target_w_1x, target_h_1x)


def build_face_and_ruby_rig(rgba_2x):
    """Extract eye sockets + movable pie-cut pupils + brow angles, and crimson ruby orb mask."""
    h2, w2, _ = rgba_2x.shape

    # 1. Eye sockets & pie-cut pupils
    yt, yb = int(0.18 * h2), int(0.32 * h2)
    xl, xr = int(0.21 * w2), int(0.50 * w2)
    roi_w = (
        (rgba_2x[yt:yb, xl:xr, 0] > 205)
        & (rgba_2x[yt:yb, xl:xr, 1] > 205)
        & (rgba_2x[yt:yb, xl:xr, 2] > 205)
        & (rgba_2x[yt:yb, xl:xr, 3] > 220)
    ).astype(np.uint8)
    nc, lbl, st, cen = cv2.connectedComponentsWithStats(roi_w, connectivity=8)
    areas = sorted([(st[i, cv2.CC_STAT_AREA], i) for i in range(1, nc) if st[i, cv2.CC_STAT_AREA] > 4500], reverse=True)[:2]
    areas.sort(key=lambda item: cen[item[1]][0])

    sub_rgb = rgba_2x[yt:yb, xl:xr, :3].astype(np.float32)
    lum = sub_rgb.mean(axis=-1)
    eyes = []

    for eye_idx, (_, idx) in enumerate(areas):
        comp = (lbl == idx).astype(np.uint8)
        comp_pad = cv2.dilate(comp, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)), iterations=1)
        pts = np.column_stack(np.where(comp_pad > 0))[:, ::-1]
        hull = cv2.convexHull(pts)
        socket = np.zeros_like(comp)
        cv2.fillConvexPoly(socket, hull, 1)
        socket_in = cv2.erode(socket, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)), iterations=1)

        pup_zone = cv2.erode(socket, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)), iterations=1)
        ys_c = np.where(socket_in > 0)[0]
        mid_y = int(np.percentile(ys_c, 55))
        pup_zone[:mid_y, :] = socket_in[:mid_y, :]

        pupil_raw = np.clip((150.0 - lum) / 100.0, 0.0, 1.0) * pup_zone.astype(np.float32)
        p_bin = (pupil_raw > 0.4).astype(np.uint8)
        np_c, plbl, pst, _ = cv2.connectedComponentsWithStats(p_bin, connectivity=8)
        if np_c > 1:
            best_p = 1 + int(np.argmax(pst[1:, cv2.CC_STAT_AREA]))
            pupil_raw *= cv2.dilate((plbl == best_p).astype(np.uint8), np.ones((5, 5), np.uint8), iterations=1)

        pupil_ext = pupil_raw.copy()
        py_rows = np.where(pupil_raw > 0.5)[0]
        if len(py_rows) > 0:
            py_mean = int(np.mean(py_rows))
            mask_top = np.zeros_like(pupil_raw)
            mask_top[:py_mean, :] = 1.0
            for dy in range(1, 20):
                shifted = np.zeros_like(pupil_raw)
                shifted[:-dy, :] = pupil_raw[dy:, :]
                pupil_ext = np.maximum(pupil_ext, shifted * mask_top)
        pupil_ext = cv2.GaussianBlur(pupil_ext, (0, 0), 1.0)

        sclera_col = np.median(sub_rgb[comp > 0], axis=0)
        socket_soft = cv2.GaussianBlur(socket_in.astype(np.float32), (0, 0), 1.2)
        brow_deg = 28.0 if eye_idx == 0 else -32.0
        gaze_scale = 0.45 if eye_idx == 0 else 1.0
        eyes.append((socket_soft, pupil_ext, sclera_col, brow_deg, gaze_scale))

    # 2. Ruby cane orb interior mask (around nx=0.493, ny=0.765)
    r = rgba_2x[..., 0].astype(np.int16)
    g = rgba_2x[..., 1].astype(np.int16)
    b = rgba_2x[..., 2].astype(np.int16)
    ry0, ry1 = int(0.67 * h2), int(0.86 * h2)
    rx0, rx1 = int(0.41 * w2), int(0.58 * w2)
    red_roi = ((r[ry0:ry1, rx0:rx1] - np.maximum(g[ry0:ry1, rx0:rx1], b[ry0:ry1, rx0:rx1])) > 85).astype(np.uint8)
    nr, lr, sr, _ = cv2.connectedComponentsWithStats(red_roi, connectivity=8)
    ruby_mask = np.zeros((h2, w2), dtype=np.float32)
    ruby_box = (0, 0, 1, 1)
    if nr > 1:
        best_r = 1 + int(np.argmax(sr[1:, cv2.CC_STAT_AREA]))
        comp_r = (lr == best_r).astype(np.uint8)
        pts = np.column_stack(np.where(comp_r > 0))[:, ::-1]
        hull = cv2.convexHull(pts)
        hull_img = np.zeros_like(comp_r)
        cv2.fillConvexPoly(hull_img, hull, 1)
        hull_eroded = cv2.erode(hull_img, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)), iterations=1)
        ruby_mask[ry0:ry1, rx0:rx1] = cv2.GaussianBlur(hull_eroded.astype(np.float32), (0, 0), 2.5)
        rys, rxs = np.where(ruby_mask > 0.3)
        ruby_box = (int(rxs.min()), int(rys.min()), int(rxs.max()), int(rys.max()))

    return (yt, yb, xl, xr, eyes), ruby_mask, ruby_box


def apply_face_and_ruby(
    rgba_2x,
    eye_rig,
    ruby_mask,
    ruby_box,
    gaze_x,
    gaze_y,
    lid_close,
    eye_glint,
    ruby_pulse,
    glint_t,
):
    out = rgba_2x.copy().astype(np.float32)
    yt, yb, xl, xr, eyes = eye_rig
    sub = out[yt:yb, xl:xr, :3]
    sh, sw, _ = sub.shape
    yy_s, xx_s = np.mgrid[0:sh, 0:sw].astype(np.float32)

    # 1. Moving pie-cut pupils, vampire crimson eye glint, and brow-angled eyelids
    for sock, pup, scol, brow_deg, gscale in eyes:
        gx, gy = gaze_x * gscale, gaze_y * gscale
        if abs(gx) > 0.08 or abs(gy) > 0.08 or eye_glint > 0.01:
            sp = cv2.remap(pup, xx_s - gx, yy_s - gy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            sp = np.clip(sp, 0.0, 1.0)
            eye_rgb = scol[None, None, :] * (1.0 - sp[..., None]) + np.array([15.0, 12.0, 19.0])[None, None, :] * sp[..., None]
            if eye_glint > 0.01:
                ys_p, xs_p = np.where(sp > 0.6)
                if len(ys_p) > 0:
                    cx_p, cy_p = float(np.mean(xs_p)) - 4.0, float(np.mean(ys_p)) + 2.0
                    d2 = ((xx_s - cx_p) / 9.0) ** 2 + ((yy_s - cy_p) / 9.0) ** 2
                    spark = np.exp(-d2) * (sp > 0.5).astype(np.float32) * eye_glint
                    core = np.exp(-d2 * 3.5) * (sp > 0.5).astype(np.float32) * eye_glint
                    eye_rgb = np.clip(
                        eye_rgb
                        + np.array([235.0, 22.0, 42.0]) * spark[..., None]
                        + np.array([255.0, 190.0, 195.0]) * (core[..., None] * 0.7),
                        0.0,
                        255.0,
                    )
            sub[:] = sub * (1.0 - sock[..., None]) + eye_rgb * sock[..., None]

        if lid_close > 0.02:
            ys_e, xs_e = np.where(sock > 0.5)
            cx_e, cy_e = float(np.mean(xs_e)), float(np.mean(ys_e))
            rad = math.radians(brow_deg)
            perp = (xx_s - cx_e) * (-math.sin(rad)) + (yy_s - cy_e) * math.cos(rad)
            p_min, p_max = float(perp[sock > 0.5].min()), float(perp[sock > 0.5].max())
            cut_p = p_min + lid_close * (p_max - p_min + 12.0)
            lid_cov = np.clip((cut_p - perp) / 2.2, 0.0, 1.0) * sock
            lash = np.clip(1.0 - np.abs(perp - (cut_p - 5.0)) / 5.2, 0.0, 1.0) * lid_cov
            top_t = np.clip((cut_p - perp) / max(1.0, (p_max - p_min) * 0.55), 0.0, 1.0)[..., None]
            fill_l = np.array([138.0, 125.0, 121.0]) * (1.0 - 0.35 * top_t) + np.array([108.0, 96.0, 93.0]) * (0.35 * top_t)
            lid_rgb = fill_l * (1.0 - lash[..., None]) + np.array([15.0, 11.0, 18.0]) * lash[..., None]
            sub[:] = sub * (1.0 - lid_cov[..., None]) + lid_rgb * lid_cov[..., None]

    # 2. Ruby cane orb pulse + curved glass glint sweep
    if ruby_pulse > 0.001 or glint_t > 0.001:
        rx0, ry0, rx1, ry1 = ruby_box
        sub_m = ruby_mask[ry0:ry1, rx0:rx1][..., None]
        if ruby_pulse > 0.001:
            glow = np.array([68.0, 12.0, 20.0], dtype=np.float32) * ruby_pulse
            out[ry0:ry1, rx0:rx1, :3] = np.clip(out[ry0:ry1, rx0:rx1, :3] + glow * sub_m, 0.0, 255.0)

        if 0.0 < glint_t < 1.0:
            bw, bh = rx1 - rx0, ry1 - ry0
            glint_layer = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
            gd = ImageDraw.Draw(glint_layer)
            env = math.sin(glint_t * math.pi)
            gx_r = int(bw * (0.24 + 0.50 * glint_t))
            gy_r = int(bh * (0.38 - 0.15 * math.sin(glint_t * math.pi)))
            gd.ellipse([(gx_r - 20, gy_r - 14), (gx_r + 20, gy_r + 14)], fill=(255, 195, 208, int(96 * env)))
            gd.ellipse([(gx_r - 10, gy_r - 7), (gx_r + 10, gy_r + 7)], fill=(255, 255, 255, int(185 * env)))
            gl_np = np.asarray(glint_layer, dtype=np.float32)
            ga = (gl_np[..., 3:4] / 255.0) * sub_m
            out[ry0:ry1, rx0:rx1, :3] = out[ry0:ry1, rx0:rx1, :3] * (1.0 - ga) + gl_np[..., :3] * ga

    return np.clip(out, 0.0, 255.0).astype(np.uint8)


def warp_puppet_frame(
    rgba_2x,
    xx,
    yy,
    bounce_y,
    squash_x,
    head_deg,
    brow_dy,
    snarl_flex,
    tail_deg,
    tail_whip,
    ear_l_t,
    ear_r_t,
    fist_dy,
    cane_deg,
    cape_phase,
):
    h2, w2 = xx.shape
    nx = xx / float(w2)
    ny = yy / float(h2)

    # 1. Grounded boots (strictly 0 for ny >= 0.90)
    leg_t = np.clip((0.90 - ny) / 0.22, 0.0, 1.0)
    ground_w = leg_t * leg_t * (3.0 - 2.0 * leg_t)

    dx = np.zeros_like(xx)
    dy = np.zeros_like(yy)

    # 2. Rubber-hose body bounce & subtle volume-preserving torso breath/squash
    dy += bounce_y * ground_w
    torso_cx = 0.45 * w2
    torso_w = np.exp(-((ny - 0.64) / 0.23) ** 2) * ground_w
    dx += (xx - torso_cx) * squash_x * torso_w

    # 3. Articulated head + popped Dracula collar tilt/nod/chuckle (above ny=0.49, excluding tail)
    neck_px, neck_py = 0.37 * w2, 0.45 * h2
    head_t = np.clip((0.50 - ny) / 0.15, 0.0, 1.0)
    not_tail = 1.0 - np.clip((nx - 0.59) / 0.14, 0.0, 1.0)
    head_w = (head_t * head_t * (3.0 - 2.0 * head_t)) * (0.28 + 0.72 * not_tail)
    rad_h = math.radians(head_deg)
    rx_h = xx - neck_px
    ry_h = yy - neck_py
    dx += (rx_h * (math.cos(rad_h) - 1.0) - ry_h * math.sin(rad_h)) * head_w
    dy += (rx_h * math.sin(rad_h) + ry_h * (math.cos(rad_h) - 1.0)) * head_w

    # 4. Expressive furrowed brow arch/scowl + fanged snarl & mustache flex
    if abs(brow_dy) > 0.05:
        brow_g = np.exp(-(((nx - 0.34) / 0.12) ** 2 + ((ny - 0.205) / 0.045) ** 2))
        dy += brow_dy * brow_g
    if abs(snarl_flex) > 0.01:
        snarl_g = np.exp(-(((nx - 0.46) / 0.075) ** 2 + ((ny - 0.365) / 0.05) ** 2))
        stache_l = np.exp(-(((nx - 0.24) / 0.06) ** 2 + ((ny - 0.385) / 0.04) ** 2))
        dx += 5.5 * snarl_flex * snarl_g - 4.0 * snarl_flex * stache_l
        dy += -6.5 * snarl_flex * snarl_g - 3.5 * snarl_flex * stache_l

    # 5. Bushy striped raccoon tail sway + secondary tip whip
    tail_piv_x, tail_piv_y = 0.61 * w2, 0.42 * h2
    tail_g = np.exp(-(((nx - 0.79) / 0.19) ** 2 + ((ny - 0.25) / 0.20) ** 2))
    rad_t = math.radians(tail_deg)
    rx_t = xx - tail_piv_x
    ry_t = yy - tail_piv_y
    dx += (rx_t * (math.cos(rad_t) - 1.0) - ry_t * math.sin(rad_t)) * tail_g
    dy += (rx_t * math.sin(rad_t) + ry_t * (math.cos(rad_t) - 1.0)) * tail_g

    tip_g = np.exp(-(((nx - 0.90) / 0.09) ** 2 + ((ny - 0.33) / 0.09) ** 2))
    dy += tail_whip * tip_g
    dx += (-0.35 * tail_whip) * tip_g

    # 6. Independent crisp pointed ear flicks
    if abs(ear_l_t) > 0.001:
        ear_l = np.exp(-(((nx - 0.205) / 0.055) ** 2 + ((ny - 0.075) / 0.055) ** 2))
        dx += -11.0 * ear_l * ear_l_t
        dy += -13.0 * ear_l * abs(ear_l_t)
    if abs(ear_r_t) > 0.001:
        ear_r = np.exp(-(((nx - 0.565) / 0.055) ** 2 + ((ny - 0.075) / 0.055) ** 2))
        dx += 12.0 * ear_r * ear_r_t
        dy += -13.0 * ear_r * abs(ear_r_t)

    # 7. Clenched right gloved fist rhythmic pump (viewer's left)
    fist_g = np.exp(-(((nx - 0.175) / 0.095) ** 2 + ((ny - 0.655) / 0.10) ** 2)) * ground_w
    dy += fist_dy * fist_g
    dx += (-0.25 * fist_dy) * fist_g

    # 8. Left gloved hand + diagonal black ruby cane menacing rock (pivoted at wrist)
    cane_piv_x, cane_piv_y = 0.68 * w2, 0.64 * h2
    cane_g = np.exp(-(((nx - 0.64) / 0.24) ** 2 + ((ny - 0.68) / 0.16) ** 2)) * ground_w
    rad_c = math.radians(cane_deg)
    rx_c = xx - cane_piv_x
    ry_c = yy - cane_piv_y
    dx += (rx_c * (math.cos(rad_c) - 1.0) - ry_c * math.sin(rad_c)) * cane_g
    dy += (rx_c * math.sin(rad_c) + ry_c * (math.cos(rad_c) - 1.0)) * cane_g

    # 9. Vampire cape lower hem flutter
    cape_l = np.exp(-(((nx - 0.21) / 0.07) ** 2 + ((ny - 0.75) / 0.08) ** 2)) * ground_w
    cape_r = np.exp(-(((nx - 0.72) / 0.075) ** 2 + ((ny - 0.77) / 0.085) ** 2)) * ground_w
    dx += 8.5 * math.sin(cape_phase) * cape_l + 9.5 * math.sin(cape_phase + 0.9) * cape_r

    map_x = xx - dx
    map_y = yy - dy

    src_f = rgba_2x.astype(np.float32)
    alpha_01 = src_f[..., 3:4] / 255.0
    premult = np.dstack([src_f[..., :3] * alpha_01, src_f[..., 3:4]])
    warped_pm = cv2.remap(
        premult,
        map_x,
        map_y,
        interpolation=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )
    wa = np.clip(warped_pm[..., 3:4], 0.0, 255.0)
    wa_01 = wa / 255.0
    safe_a = np.where(wa_01 > 1e-3, wa_01, 1.0)
    w_rgb = np.where(wa_01 > 1e-3, np.clip(warped_pm[..., :3] / safe_a, 0.0, 255.0), 0.0)
    return np.dstack([w_rgb, wa]).astype(np.uint8)


def draw_ruby_sparks_1x(img_1x, u):
    """Subtle cel-shaded crimson magic motes rising from the ruby cane orb (seamless loop)."""
    w1, h1 = img_1x.size
    overlay = Image.new("RGBA", (w1, h1), (0, 0, 0, 0))
    dr = ImageDraw.Draw(overlay)
    # 3 staggered seamless particle cycles rising above the ruby orb (~0.49*w1, 0.74*h1)
    seeds = [
        (0.00, 0.478, 0.735, -14.0, 46.0, 4.2),
        (0.34, 0.508, 0.725, 11.0, 52.0, 3.6),
        (0.67, 0.492, 0.742, -6.0, 40.0, 3.2),
    ]
    for phase0, sx, sy, sway_x, rise_y, r_max in seeds:
        p = (u + phase0) % 1.0
        env = math.sin(p * math.pi) ** 1.4
        if env < 0.04:
            continue
        px = sx * w1 + sway_x * math.sin(p * 2.0 * math.pi)
        py = sy * h1 - rise_y * p
        rad = max(1.2, r_max * env)
        a_glow = int(135 * env)
        a_core = int(220 * env)
        dr.ellipse([(px - rad * 1.9, py - rad * 1.9), (px + rad * 1.9, py + rad * 1.9)], fill=(235, 24, 52, a_glow // 2))
        dr.ellipse([(px - rad, py - rad), (px + rad, py + rad)], fill=(255, 68, 86, a_glow))
        dr.ellipse([(px - rad * 0.45, py - rad * 0.45), (px + rad * 0.45, py + rad * 0.45)], fill=(255, 230, 232, a_core))
    return Image.alpha_composite(img_1x, overlay)


def smooth_pulse(u, u0, u1, edge=0.06):
    """Smooth C1 plateau pulse in [u0, u1]."""
    if u <= u0 or u >= u1:
        return 0.0
    t_in = min(1.0, (u - u0) / edge)
    t_out = min(1.0, (u1 - u) / edge)
    s_in = t_in * t_in * (3.0 - 2.0 * t_in)
    s_out = t_out * t_out * (3.0 - 2.0 * t_out)
    return s_in * s_out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("1/4 Keying 4K Real-ESRGAN master to 2x SSAA canvas...")
    rgba_2x, (w1, h1) = key_4k_to_2x()
    w2, h2 = rgba_2x.shape[1], rgba_2x.shape[0]
    print(f"    2x canvas: {w2}x{h2} -> final output: {w1}x{h1}")

    eye_rig, ruby_mask, ruby_box = build_face_and_ruby_rig(rgba_2x)
    yy, xx = np.mgrid[0:h2, 0:w2].astype(np.float32)

    N_FRAMES = 120  # 5.0 seconds @ 24fps (4 groove beats, rich 3-act character loop)
    print(f"2/4 Rendering {N_FRAMES} frames @ 24fps with 2x Lanczos SSAA...")

    with tempfile.TemporaryDirectory(prefix="vamp_raccoon_") as frames_dir:
        for i in range(N_FRAMES):
            u = i / N_FRAMES
            phi1 = 2.0 * math.pi * u       # 1x 5.0s narrative cycle
            phi2 = 4.0 * math.pi * u       # 2x 2.5s phrase cycle
            phi4 = 8.0 * math.pi * u       # 4x 1.25s cartoon groove beat!

            # Act 2 (u=0.27..0.55): Side-glance left toward the 500 Casino bonus offer!
            glance_w = smooth_pulse(u, 0.27, 0.55, edge=0.055)
            # Act 3 (u=0.58..0.83): Sinister vampire chuckle + crimson eye glint!
            chuckle_w = smooth_pulse(u, 0.58, 0.83, edge=0.055)
            chuckle_osc = math.sin(24.0 * math.pi * u) * chuckle_w  # 12cycles/5s = crisp cartoon laugh shake

            # Gaze coordinates (at 2x scale; 0 at u=0 and u=1 for seamless loop)
            gaze_x = -16.0 * glance_w + 11.0 * chuckle_w
            gaze_y = 3.5 * glance_w - 2.0 * chuckle_w

            # Brows & fanged snarl
            brow_dy = -5.5 * glance_w + 6.5 * chuckle_w
            snarl_flex = 0.85 * chuckle_w + 0.25 * max(0.0, chuckle_osc)

            # Lively rubber-hose groove + evil chuckle bounce
            bounce_y = 19.0 * math.sin(phi4) + 4.5 * math.sin(2.0 * phi4 - 0.5) - 7.5 * abs(chuckle_osc)
            squash_x = 0.018 * math.sin(phi4) + 0.008 * chuckle_osc
            head_deg = (
                2.2 * math.sin(phi2 - 0.35)
                + 1.2 * math.sin(phi4 - 0.55)
                - 2.4 * glance_w
                + 1.6 * chuckle_osc
            )
            tail_deg = 5.6 * math.sin(phi4 - 0.85) + 2.2 * math.sin(phi2 + 0.3)
            tail_whip = 14.0 * math.sin(phi4 - 1.55)
            fist_dy = 14.0 * math.sin(phi4 - 0.45) - 8.0 * chuckle_osc
            cane_deg = 3.1 * math.sin(phi4 - 0.35) - 1.8 * glance_w + 1.4 * chuckle_w
            cape_phase = phi4 - 0.95

            # Asymmetric ear twitches
            ear_l_t, ear_r_t = 0.0, 0.0
            for tc, amp in ((0.15, 1.0), (0.19, 0.65), (0.86, 0.85)):
                dt = abs(u - tc)
                if dt < 0.020:
                    ear_l_t += amp * (math.cos((dt / 0.020) * (math.pi / 2.0)) ** 2)
            for tc, amp in ((0.17, 0.85), (0.57, 0.95), (0.88, 0.6)):
                dt = abs(u - tc)
                if dt < 0.020:
                    ear_r_t += amp * (math.cos((dt / 0.020) * (math.pi / 2.0)) ** 2)

            # Snappy cartoon blinks (u=0.21, u=0.56 transition, u=0.91) + menacing half-squint in Act 3
            lid_close = 0.27 * chuckle_w
            for bc in (0.21, 0.56, 0.91):
                db = abs(u - bc)
                if db < 0.024:
                    lid_close = max(lid_close, math.cos((db / 0.024) * (math.pi / 2.0)) ** 1.25)

            eye_glint = 0.88 * chuckle_w
            ruby_pulse = 0.45 + 0.45 * math.sin(phi4 - 0.2) + 0.35 * chuckle_w
            glint_t = (u - 0.58) / 0.22 if 0.58 <= u <= 0.80 else 0.0

            shaded_2x = apply_face_and_ruby(
                rgba_2x,
                eye_rig,
                ruby_mask,
                ruby_box,
                gaze_x=gaze_x,
                gaze_y=gaze_y,
                lid_close=lid_close,
                eye_glint=eye_glint,
                ruby_pulse=ruby_pulse,
                glint_t=glint_t,
            )

            warped_2x = warp_puppet_frame(
                shaded_2x,
                xx,
                yy,
                bounce_y=bounce_y,
                squash_x=squash_x,
                head_deg=head_deg,
                brow_dy=brow_dy,
                snarl_flex=snarl_flex,
                tail_deg=tail_deg,
                tail_whip=tail_whip,
                ear_l_t=ear_l_t,
                ear_r_t=ear_r_t,
                fist_dy=fist_dy,
                cane_deg=cane_deg,
                cape_phase=cape_phase,
            )

            frame_1x = Image.fromarray(warped_2x, "RGBA").resize((w1, h1), Image.LANCZOS)
            frame_1x = draw_ruby_sparks_1x(frame_1x, u)
            frame_1x.save(os.path.join(frames_dir, f"{i + 1:04d}.png"))

            if i == 0:
                frame_1x.save(OUT_WEBP, "WEBP", quality=94, method=6)
                print(f"3/4 Saved WebP poster: {OUT_WEBP} {frame_1x.size} ({os.path.getsize(OUT_WEBP)//1024}KB)")

        print("4/4 Encoding VP9 alpha WebM...")
        subprocess.run(
            [
                "ffmpeg", "-y", "-framerate", "24",
                "-i", os.path.join(frames_dir, "%04d.png"),
                "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
                "-an", "-b:v", "0", "-crf", "22", "-row-mt", "1",
                "-deadline", "good", "-cpu-used", "2",
                "-metadata:s:v:0", "alpha_mode=1",
                OUT_WEBM,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(f"Saved WebM: {OUT_WEBM} ({os.path.getsize(OUT_WEBM)//1024}KB)")


if __name__ == "__main__":
    main()
