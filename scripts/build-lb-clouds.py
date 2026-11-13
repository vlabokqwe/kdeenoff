"""
Build the Le Zeus / Mount Olympus slot cloud background for public leaderboard pages
(/leaderboards/ and /leaderboards/:slug/) with ZERO seam-carving and ZERO cut outlines:

  1. Upscales clean #00FF00-top 2D cel-shaded cloud bank renders 4x via Real-ESRGAN
     (realesrgan-x4plus-anime) and performs exact analytical chroma-key color unmixing
     along the outer terracotta-brown ink contour (preserving 100% crisp 1px outlines
     with zero green spill and zero halo).
  2. Builds TWO identically sized 2560 x TILE_H opaque RGB WebP layers rendered on the
     SAME CSS element (.board-section__bg) with identical `center top` positioning and
     identical `max(100%, 1120px) auto` sizing:
       - frontend/public/img/bg/leaderboard-clouds-crest.webp (2560 x TILE_H, no-repeat):
         Full Olympus scene (leaderboard-scene.webp) with Layer C's billowing cumulus
         cradle alpha-composited over the stone terrace edge, ending cleanly inside
         untouched solid clouds at Layer C[r_cut].
       - frontend/public/img/bg/leaderboard-clouds.webp (2560 x TILE_H, repeat-y):
         Starts on row 0 at Layer C[r_cut + 1] (the exact next pixel row of the same
         untouched cloud drawing!), stacks Layer D in front of Layer C along Layer D's
         natural rounded inked cumulus contour, and stacks Layer C in front of Layer D
         at the exact same y_c0 offset so row [TILE_H - 1] is again Layer C[r_cut].
"""
import glob
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "art-raw")
OUT_BG_DIR = os.path.join(ROOT, "frontend", "public", "img", "bg")
SCENE_WEBP = os.path.join(OUT_BG_DIR, "leaderboard-scene.webp")
OUT_SEA_WEBP = os.path.join(OUT_BG_DIR, "leaderboard-clouds.webp")
OUT_CREST_WEBP = os.path.join(OUT_BG_DIR, "leaderboard-clouds-crest.webp")
PREVIEW_JPG = os.path.join(RAW_DIR, "_preview_lb_clouds.jpg")

_DEFAULT_ESRGAN = os.path.join(
    os.environ.get("LOCALAPPDATA", ""),
    "realesrgan",
    "bin",
    "realesrgan-ncnn-vulkan.exe",
)

WORK_W = 2560
WORK_H = 1428  # Exact 5504:3072 aspect ratio at width 2560


def newest_raw(pattern: str) -> str:
    files = sorted(glob.glob(os.path.join(RAW_DIR, pattern)), key=os.path.getmtime)
    if not files:
        raise FileNotFoundError(f"No raw image matching art-raw/{pattern}")
    return files[-1]


def ensure_4k(raw_path: str) -> str:
    stem = os.path.splitext(os.path.basename(raw_path))[0]
    up_dir = os.path.join(RAW_DIR, "up")
    os.makedirs(up_dir, exist_ok=True)
    up_png = os.path.join(up_dir, f"{stem}_x4.png")
    if os.path.exists(up_png):
        return up_png
    if os.path.exists(_DEFAULT_ESRGAN):
        subprocess.run(
            [_DEFAULT_ESRGAN, "-i", raw_path, "-o", up_png, "-n", "realesrgan-x4plus-anime", "-s", "4"],
            check=True,
        )
        return up_png
    im = Image.open(raw_path).convert("RGB")
    im.resize((im.width * 4, im.height * 4), Image.LANCZOS).save(up_png)
    return up_png


def key_cloud_layer_4k_to_work(raw_path: str) -> tuple[np.ndarray, np.ndarray, int, int]:
    """
    Analytical #00FF00 chroma-key unmixing along the outer terracotta-brown ink outline,
    followed by premultiplied INTER_AREA downsampling from 5504x3072 -> 2560x1428.
    Returns (fg_rgb_float32, alpha_01_float32, top_cloud_y, solid_cloud_y).
    """
    up_path = ensure_4k(raw_path)
    rgb4 = np.asarray(Image.open(up_path).convert("RGB"), dtype=np.float32)

    # Measure exact pure green background from top strip
    bg_green = np.median(rgb4[:20, :, :], axis=(0, 1))
    r, g, b = rgb4[..., 0], rgb4[..., 1], rgb4[..., 2]
    g_excess = g - np.maximum(r, b)

    # All warm Olympus cloud & terracotta ink colors have R >= G (g_excess <= 0).
    sky_raw = (g_excess > 28.0).astype(np.uint8)
    num_s, s_labels, s_stats, _ = cv2.connectedComponentsWithStats(sky_raw, connectivity=8)
    sky_mask = np.zeros(sky_raw.shape, dtype=bool)
    for idx in range(1, num_s):
        if s_stats[idx, cv2.CC_STAT_AREA] >= 16:
            sky_mask |= s_labels == idx

    # Narrow 13x13 contour band around the green sky boundary (only ~3px at 2560w)
    contour_band = cv2.dilate(sky_mask.astype(np.uint8), np.ones((13, 13), np.uint8), iterations=1).astype(bool)

    # Along the outer terracotta-brown ink stroke (where F_G ~ 0.60 * F_R), solve linear mix C = a*F + (1-a)*B:
    denom = max(float(bg_green[1] - 0.60 * bg_green[0]), 1.0)
    green_frac = np.clip((g - 0.60 * r) / denom, 0.0, 1.0)
    raw_a = np.where(contour_band & (g_excess > 2.0), 1.0 - green_frac, 1.0).astype(np.float32)
    raw_a[sky_mask & (g_excess > 95.0)] = 0.0

    # Slight inward bias (0.18..0.92) + micro-AA (sigma=0.85 at 4K = 0.4px at 2560w) removes JPEG mosquito noise
    alpha4 = np.clip((raw_a - 0.18) / 0.74, 0.0, 1.0)
    alpha4 = cv2.GaussianBlur(alpha4, (0, 0), 0.85)
    alpha4 = np.clip((alpha4 - 0.08) / 0.88, 0.0, 1.0)

    # Exact foreground color unmixing where 0 < alpha < 1
    safe_a = np.maximum(raw_a, 0.10)[..., None]
    unmixed = np.clip((rgb4 - (1.0 - raw_a[..., None]) * bg_green[None, None, :]) / safe_a, 0.0, 255.0)
    fg4 = np.where((contour_band & (g_excess > 2.0))[..., None], unmixed, rgb4)

    # Guarantee zero green spill in the 3px ink edge: terracotta ink & warm clouds satisfy G <= max(0.88*R, B)
    max_edge_g = np.maximum(fg4[..., 0] * 0.88, fg4[..., 2] * 0.98)
    fg4[..., 1] = np.where(contour_band & (g_excess > 2.0), np.minimum(fg4[..., 1], max_edge_g), fg4[..., 1])

    # Premultiplied area downsample to 2560 x 1428 (prevents dark/bright fringes on semi-transparent edge pixels)
    premult4 = fg4 * alpha4[..., None]
    premult_w = cv2.resize(premult4, (WORK_W, WORK_H), interpolation=cv2.INTER_AREA)
    a_w = np.clip(cv2.resize(alpha4, (WORK_W, WORK_H), interpolation=cv2.INTER_AREA), 0.0, 1.0)
    fg_w = np.where(a_w[..., None] > 1e-4, np.clip(premult_w / np.maximum(a_w[..., None], 1e-4), 0.0, 255.0), 0.0)

    # Clean strictly-0 sky and strictly-1 interior
    a_w = np.where(a_w < 0.004, 0.0, np.where(a_w > 0.996, 1.0, a_w)).astype(np.float32)

    non_zero_rows = np.where(a_w.max(axis=1) > 0.0)[0]
    top_cloud_y = int(non_zero_rows.min())
    assert top_cloud_y >= 8, f"{os.path.basename(raw_path)} touches top border (top_cloud_y={top_cloud_y})"

    incomplete_rows = np.where(a_w.min(axis=1) < 1.0)[0]
    solid_cloud_y = int(incomplete_rows.max()) + 1
    # Ensure everything from solid_cloud_y to WORK_H is 100% opaque
    assert np.all(a_w[solid_cloud_y:] == 1.0), f"Hole inside lower cloud body of {raw_path}"

    print(
        f"Keyed {os.path.basename(raw_path)} -> {WORK_W}x{WORK_H}: "
        f"top_cloud_y={top_cloud_y}, solid_cloud_y={solid_cloud_y} "
        f"(solid body = {WORK_H - solid_cloud_y}px)"
    )
    return fg_w, a_w, top_cloud_y, solid_cloud_y


def alpha_paste_over(canvas: np.ndarray, fg: np.ndarray, a: np.ndarray, y_offset: int) -> None:
    """Alpha-composite (fg, a) onto RGB float32 canvas at vertical position y_offset."""
    ch = canvas.shape[0]
    fh = fg.shape[0]
    src_y0 = max(0, -y_offset)
    dst_y0 = max(0, y_offset)
    if src_y0 > 0:
        assert np.all(a[:src_y0] == 0.0), f"Clipped non-transparent top rows (0..{src_y0}) at y_offset={y_offset}"
    count = min(fh - src_y0, ch - dst_y0)
    if count <= 0:
        return
    sub_fg = fg[src_y0 : src_y0 + count]
    sub_a = a[src_y0 : src_y0 + count, :, None]
    dst = canvas[dst_y0 : dst_y0 + count]
    canvas[dst_y0 : dst_y0 + count] = dst * (1.0 - sub_a) + sub_fg * sub_a


def build_layers() -> tuple[np.ndarray, np.ndarray]:
    layer_c_raw = newest_raw("v2_lb_layer_c_1794506722*.jpg")
    layer_d_raw = newest_raw("v2_lb_layer_a_1794506582*.jpg")

    fg_c, a_c, c_top, c_solid = key_cloud_layer_4k_to_work(layer_c_raw)
    fg_d, a_d, d_top, d_solid = key_cloud_layer_4k_to_work(layer_d_raw)

    scene = np.asarray(Image.open(SCENE_WEBP).convert("RGB").resize((WORK_W, WORK_H), Image.LANCZOS), dtype=np.float32)

    # Place Layer C so its center valley sits at y ~ 1308 on the 2560x1428 Olympus scene
    # (leaving ~166px of golden stone terrace slabs visible in the center and both Ionic column shafts clear)
    target_valley_y = 1308
    y_c0 = target_valley_y - c_solid
    assert y_c0 + c_top >= 780, f"Flank puffs too high on pillars: {y_c0 + c_top}"
    assert y_c0 + c_solid <= WORK_H - 96, f"Insufficient overlap over scene bottom: {y_c0 + c_solid}"

    # Choose pad_top_d and shared TILE_H for BOTH crest and sea so:
    #   1. Layer D's bottom (pad_top_d - d_top + WORK_H) reaches strictly below Layer C's valley (y_c0 + c_solid + 20)
    #   2. Remaining solid rows of Layer C (WORK_H + y_c0 - TILE_H) comfortably back Layer D's crest
    d_crest_span = d_solid - d_top
    pad_top_d = max(24, (y_c0 + c_solid + 24) - WORK_H + d_top)
    needed_c_rem = pad_top_d + d_crest_span + 24
    tile_h = min(1720, (WORK_H + y_c0) - needed_c_rem)
    tile_h = (tile_h // 8) * 8  # Clean multiple of 8 for WebP macroblocks!
    assert tile_h >= WORK_H + 160, f"tile_h={tile_h} too short"

    r_cut = (tile_h - 1) - y_c0  # Row of Layer C at crest[-1] and sea_tile[-1]
    rem_c = WORK_H - (r_cut + 1)
    assert rem_c >= pad_top_d + d_crest_span + 16, f"rem_c={rem_c} too small for d_crest_span={d_crest_span}"

    # 1. Build Image 1: leaderboard-clouds-crest.webp (2560 x tile_h opaque RGB)
    crest_canvas = np.zeros((tile_h, WORK_W, 3), dtype=np.float32)
    crest_canvas[:WORK_H] = scene
    alpha_paste_over(crest_canvas, fg_c, a_c, y_c0)

    # Verify crest[-1] is 100% pure untouched Layer C[r_cut]
    assert np.allclose(crest_canvas[-1], fg_c[r_cut], atol=1e-3)

    # 2. Build Image 2: leaderboard-clouds.webp (2560 x tile_h opaque RGB, periodic repeat-y)
    sea_canvas = np.zeros((tile_h, WORK_W, 3), dtype=np.float32)
    # Base top strip: continuation of Layer C starting at r_cut + 1!
    sea_canvas[:rem_c] = fg_c[r_cut + 1 : WORK_H]

    # Stack Layer D in front of Layer C along Layer D's natural inked cumulus contour
    y_d = pad_top_d - d_top
    assert y_d + d_solid <= rem_c - 12, "Layer D valley exceeds Layer C backing"
    assert y_d + WORK_H >= y_c0 + c_solid + 20, f"Layer D bottom ({y_d + WORK_H}) doesn't reach Layer C valley ({y_c0 + c_solid})"
    alpha_paste_over(sea_canvas, fg_d, a_d, y_d)

    # Stack Layer C at exact same y_c0 so sea_canvas[-1] == Layer C[r_cut] (seamless wrap into sea_canvas[0] == Layer C[r_cut + 1]!)
    alpha_paste_over(sea_canvas, fg_c, a_c, y_c0)

    assert np.allclose(sea_canvas[0], fg_c[r_cut + 1], atol=1e-3)
    assert np.allclose(sea_canvas[-1], fg_c[r_cut], atol=1e-3)

    # Note: across rows [y_c0 + c_solid .. tile_h], crest_canvas and sea_canvas contain
    # the EXACT same untouched pixels fg_c[c_solid : r_cut + 1]!
    # Feather crest alpha to 0 across the bottom 80px inside this identical region so
    # Layer 1 has no hard rectangular edge at tile_h and zero WebP quantization step.
    shared_y0 = y_c0 + c_solid
    assert tile_h - shared_y0 >= 120
    assert np.allclose(crest_canvas[shared_y0:], sea_canvas[shared_y0:], atol=1e-3)

    crest_a = np.ones((tile_h, WORK_W), dtype=np.float32)
    fade_y0, fade_y1 = tile_h - 96, tile_h - 16
    crest_a[fade_y0:fade_y1] = np.linspace(1.0, 0.0, fade_y1 - fade_y0, dtype=np.float32)[:, None]
    crest_a[fade_y1:] = 0.0

    crest_rgba_u8 = np.dstack([
        np.clip(np.round(crest_canvas), 0, 255),
        np.round(crest_a * 255.0),
    ]).astype(np.uint8)
    sea_u8 = np.clip(np.round(sea_canvas), 0, 255).astype(np.uint8)

    Image.fromarray(crest_rgba_u8, "RGBA").save(OUT_CREST_WEBP, "WEBP", quality=94, alpha_quality=100, method=6)
    Image.fromarray(sea_u8, "RGB").save(OUT_SEA_WEBP, "WEBP", quality=94, method=6)

    print(
        f"Saved {OUT_CREST_WEBP}: {WORK_W}x{tile_h} RGBA ({os.path.getsize(OUT_CREST_WEBP)//1024}KB), "
        f"feathers cleanly inside identical Layer C rows [{fade_y0}..{fade_y1}]"
    )
    print(
        f"Saved {OUT_SEA_WEBP}: {WORK_W}x{tile_h} RGB ({os.path.getsize(OUT_SEA_WEBP)//1024}KB), "
        f"starts at Layer C[{r_cut + 1}], wraps at Layer C[{r_cut}]"
    )
    return crest_rgba_u8, sea_u8


def render_verification_preview(crest_rgba_u8: np.ndarray, sea_u8: np.ndarray) -> None:
    stacked = np.vstack([sea_u8, sea_u8, sea_u8[:900]]).astype(np.float32)
    th = crest_rgba_u8.shape[0]
    ca = crest_rgba_u8[..., 3:4].astype(np.float32) / 255.0
    stacked[:th] = stacked[:th] * (1.0 - ca) + crest_rgba_u8[..., :3].astype(np.float32) * ca
    pw = 1600
    ph = round(stacked.shape[0] * (pw / stacked.shape[1]))
    Image.fromarray(np.clip(stacked, 0, 255).astype(np.uint8), "RGB").resize((pw, ph), Image.LANCZOS).save(PREVIEW_JPG, "JPEG", quality=94)
    print(f"Saved preview: {PREVIEW_JPG} ({pw}x{ph})")


def main() -> None:
    os.makedirs(OUT_BG_DIR, exist_ok=True)
    crest_u8, sea_u8 = build_layers()
    if "--preview" in sys.argv:
        render_verification_preview(crest_u8, sea_u8)


if __name__ == "__main__":
    main()
