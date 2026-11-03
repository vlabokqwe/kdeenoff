"""Contact sheet of processed assets on a checker + colour backdrop, for visual QA."""
import os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "public", "img")
out = sys.argv[1]
subs = sys.argv[2:] or ["brand", "hero", "deco", "icons", "steps", "bonus", "lb", "contacts"]

files = []
for s in subs:
    d = os.path.join(IMG, s)
    if os.path.isdir(d):
        files += [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith(".webp")]

cell = 220
cols = 6
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + 18)), "white")
draw = ImageDraw.Draw(sheet)
backs = [(18, 94, 44), (255, 199, 44), (26, 18, 5), (224, 38, 43)]
for i, f in enumerate(files):
    x, y = (i % cols) * cell, (i // cols) * (cell + 18)
    bg = Image.new("RGB", (cell, cell), backs[i % len(backs)])
    im = Image.open(f).convert("RGBA")
    im.thumbnail((cell - 16, cell - 16))
    bg.paste(im, ((cell - im.width) // 2, (cell - im.height) // 2), im)
    sheet.paste(bg, (x, y))
    draw.text((x + 4, y + cell + 2), os.path.relpath(f, IMG), fill="black")
sheet.save(out, quality=85)
print(out, len(files))

