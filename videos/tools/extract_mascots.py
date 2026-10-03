"""Cut the 12 cloud mascots out of the sheet into transparent PNGs.

The sheet is blue clouds on white. Background = near-white pixels connected to the
image border (so the white eyes inside a cloud stay opaque). Edges are un-mixed
from white so they composite cleanly on any background.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

root = Path(__file__).resolve().parents[1]
sheet = np.asarray(Image.open(root / "assets/mascot/sheet.webp").convert("RGB")).astype(np.float32)
h, w, _ = sheet.shape

# Whiteness: how close a pixel is to pure white (cloud pixels have low red).
red = sheet[..., 0]
near_white = red > 200
labels, _ = ndimage.label(near_white)
border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
background = np.isin(labels, list(border))

# Soft alpha: inside the cloud = 1; in the background region, alpha from red channel (anti-aliased rim).
alpha = np.where(background, np.clip((255 - red) / (255 - 110), 0, 1), 1.0)
alpha = np.where(background & (red > 248), 0, alpha)

# Un-mix the white: C = a*F + (1-a)*255  ->  F = (C - (1-a)*255)/a
a3 = np.maximum(alpha[..., None], 1e-3)
fg = np.clip((sheet - (1 - a3) * 255) / a3, 0, 255)

# Find each cloud as a connected blob of the opaque mask.
blobs, count = ndimage.label(alpha > 0.5)
sizes = ndimage.sum(np.ones_like(alpha), blobs, range(1, count + 1))
keep = [i + 1 for i, s in enumerate(sizes) if s > 5000]
boxes = ndimage.find_objects(blobs)
items = []
for index in keep:
    sl = boxes[index - 1]
    cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
    items.append((int(cy // (h / 3)), cx, sl, index))
# Sort row by row, left to right.
items.sort(key=lambda item: (int(item[0]), item[1]))

names = [
    "wink", "cookie", "code", "dizzy_tilt",
    "dizzy", "sleepy", "alert", "happy",
    "mail", "calm", "look_right", "look_left",
]
out = root / "assets/mascot"
pad = 24
for name, (_, _, sl, index) in zip(names, items):
    y0, y1 = max(sl[0].start - pad, 0), min(sl[0].stop + pad, h)
    x0, x1 = max(sl[1].start - pad, 0), min(sl[1].stop + pad, w)
    # Keep only this blob (plus its anti-aliased rim) so neighbours never bleed in.
    own = ndimage.binary_dilation(blobs[y0:y1, x0:x1] == index, iterations=6)
    a = alpha[y0:y1, x0:x1] * own
    rgba = np.dstack([fg[y0:y1, x0:x1], a * 255]).astype(np.uint8)
    # Square canvas, cloud centred, so every pose shares one anchor.
    ch, cw = rgba.shape[:2]
    side = max(ch, cw)
    canvas = np.zeros((side, side, 4), np.uint8)
    oy, ox = (side - ch) // 2, (side - cw) // 2
    canvas[oy:oy + ch, ox:ox + cw] = rgba
    Image.fromarray(canvas).resize((400, 400), Image.LANCZOS).save(out / f"{name}.png")
    print(name, sl)
print(len(items), "mascots")
