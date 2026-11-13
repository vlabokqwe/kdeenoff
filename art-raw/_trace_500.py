"""Trace the 500 Casino wordmark into a clean SVG. One-off; not part of the site."""
import math
from pathlib import Path

import cv2
import numpy as np

SRC = Path("frontend/public/img/partners/500-wordmark.webp")
OUT = Path("frontend/public/img/partners/500-wordmark.svg")
PREVIEW = Path("art-raw/_500_svg_preview.png")

im = cv2.imread(str(SRC), cv2.IMREAD_UNCHANGED)
b, g, r, a = cv2.split(im)
ink = ((a > 80) & (r > 150) & (g > 150) & (b > 150)).astype(np.float32)
blur = cv2.GaussianBlur(ink, (3, 3), 0)
mask = (blur > 0.5).astype(np.uint8) * 255
nlab, labels, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
keep = np.zeros_like(mask)
for i in range(1, nlab):
    if stats[i, cv2.CC_STAT_AREA] > 400:
        keep[labels == i] = 255
mask = keep

ys, xs = np.where(mask > 0)
x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
# 1px pad so strokes are not clipped
pad = 1
ox, oy = x0 - pad, y0 - pad
vw, vh = (x1 - x0 + 1) + pad * 2, (y1 - y0 + 1) + pad * 2

cnts, hier = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)
H = hier[0]


def rdp(points: np.ndarray, epsilon: float) -> np.ndarray:
    n = len(points)
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        start, end = points[i], points[j]
        length = float(np.linalg.norm(end - start))
        if length < 1e-9:
            dists = np.linalg.norm(points[i + 1 : j] - start, axis=1)
        else:
            cross = np.abs(
                (points[i + 1 : j, 0] - start[0]) * (end[1] - start[1])
                - (points[i + 1 : j, 1] - start[1]) * (end[0] - start[0])
            )
            dists = cross / length
        if len(dists) == 0:
            continue
        k = int(np.argmax(dists))
        if dists[k] > epsilon:
            idx = i + 1 + k
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return points[keep]


def fmt(p: np.ndarray) -> str:
    return f"{p[0] - ox:.1f} {p[1] - oy:.1f}"


def ring_path(contour: np.ndarray, eps: float, corner_turn: float) -> tuple[str, np.ndarray]:
    pts = contour.reshape(-1, 2).astype(np.float64)
    closed = np.vstack([pts, pts[0]])
    simple = rdp(closed, eps)
    ring = simple[:-1] if np.allclose(simple[0], simple[-1]) else simple
    n = len(ring)
    corners = []
    for i in range(n):
        p0, p1, p2 = ring[(i - 1) % n], ring[i], ring[(i + 1) % n]
        v1, v2 = p0 - p1, p2 - p1
        n1, n2 = float(np.linalg.norm(v1)), float(np.linalg.norm(v2))
        if n1 < 1e-6 or n2 < 1e-6:
            corners.append(True)
            continue
        c = float(np.clip(np.dot(v1, v2) / (n1 * n2), -1, 1))
        interior = math.degrees(math.acos(c))
        corners.append((180 - interior) >= corner_turn)
    start = next((i for i, c in enumerate(corners) if c), 0)
    parts = ["M " + fmt(ring[start])]
    i = start
    for _ in range(n):
        j = (i + 1) % n
        if corners[i] and corners[j]:
            parts.append("L " + fmt(ring[j]))
        else:
            p0 = ring[i] if corners[i] else ring[(i - 1) % n]
            p1 = ring[i]
            p2 = ring[j]
            p3 = ring[j] if corners[j] else ring[(j + 1) % n]
            cp1 = p1 + (p2 - p0) / 6.0
            cp2 = p2 - (p3 - p1) / 6.0
            parts.append(f"C {fmt(cp1)} {fmt(cp2)} {fmt(p2)}")
        i = j
    parts.append("Z")
    return " ".join(parts), ring


def sample_cubic(p0, p1, p2, p3, steps=8):
    ts = np.linspace(0, 1, steps, endpoint=False)[:, None]
    return (
        (1 - ts) ** 3 * p0
        + 3 * (1 - ts) ** 2 * ts * p1
        + 3 * (1 - ts) * ts**2 * p2
        + ts**3 * p3
    )


def parse_path(d: str) -> np.ndarray:
    tokens = d.replace("M", " M ").replace("L", " L ").replace("C", " C ").replace("Z", " Z ").split()
    pts = []
    i = 0
    cx = cy = 0.0
    while i < len(tokens):
        cmd = tokens[i]
        i += 1
        if cmd == "M" or cmd == "L":
            cx, cy = float(tokens[i]), float(tokens[i + 1])
            i += 2
            pts.append([cx + ox, cy + oy])
        elif cmd == "C":
            c1 = np.array([float(tokens[i]) + ox, float(tokens[i + 1]) + oy])
            c2 = np.array([float(tokens[i + 2]) + ox, float(tokens[i + 3]) + oy])
            end = np.array([float(tokens[i + 4]) + ox, float(tokens[i + 5]) + oy])
            i += 6
            curve = sample_cubic(np.array([cx, cy]), c1, c2, end, 10)
            pts.extend(curve.tolist())
            cx, cy = float(end[0]), float(end[1])
            pts.append([cx, cy])
        elif cmd == "Z":
            break
    return np.array(pts, np.float32)


# Build compound paths: each outer plus its holes.
pieces = []
drawn = np.zeros_like(mask)
for i, c in enumerate(cnts):
    if int(H[i][3]) != -1:
        continue
    if cv2.contourArea(c) < 400:
        continue
    d, _ = ring_path(c, eps=1.8, corner_turn=48)
    holes = []
    child = int(H[i][2])
    while child != -1:
        hd, _ = ring_path(cnts[child], eps=1.4, corner_turn=42)
        holes.append(hd)
        cv2.fillPoly(drawn, [parse_path(hd).astype(np.int32)], 0)
        child = int(H[child][0])
    poly = parse_path(d).astype(np.int32)
    cv2.fillPoly(drawn, [poly], 255)
    for hd in holes:
        cv2.fillPoly(drawn, [parse_path(hd).astype(np.int32)], 0)
    pieces.append(d + "".join(holes))

# The loop above fills holes twice in a confusing way. Rebuild the preview cleanly.
drawn[:] = 0
clean_paths = []
for i, c in enumerate(cnts):
    if int(H[i][3]) != -1 or cv2.contourArea(c) < 400:
        continue
    d, _ = ring_path(c, eps=1.8, corner_turn=48)
    hole_ds = []
    child = int(H[i][2])
    while child != -1:
        hd, _ = ring_path(cnts[child], eps=1.4, corner_turn=42)
        hole_ds.append(hd)
        child = int(H[child][0])
    cv2.fillPoly(drawn, [parse_path(d).astype(np.int32)], 255)
    for hd in hole_ds:
        cv2.fillPoly(drawn, [parse_path(hd).astype(np.int32)], 0)
    clean_paths.append(d + "".join(hole_ds))

diff = cv2.absdiff(mask, drawn)
err = int((diff > 0).sum())
ink_px = int((mask > 0).sum())
print(f"error px {err} of {ink_px} ({100*err/max(ink_px,1):.2f}% of ink)")

# side by side preview, dark ground
h, w = mask.shape
canvas = np.zeros((h, w * 2 + 20, 3), np.uint8)
canvas[:] = (20, 16, 28)
canvas[:, :w][mask > 0] = (255, 255, 255)
canvas[:, w + 20 :][drawn > 0] = (255, 255, 255)
# red where they disagree, on the right half
right = canvas[:, w + 20 :]
right[diff > 0] = (40, 40, 220)
cv2.imwrite(str(PREVIEW), canvas)

body = " ".join(clean_paths)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" fill="none">
  <path fill="#fff" fill-rule="evenodd" d="{body}"/>
</svg>
'''
OUT.write_text(svg, encoding="utf-8")
print(f"wrote {OUT} bytes {OUT.stat().st_size} viewBox 0 0 {vw} {vh} paths {len(clean_paths)}")
