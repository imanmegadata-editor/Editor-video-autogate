"""Cuts the CCTV Selatan logo out of the wall mock-up photo into a transparent PNG.
usage: python3 make_logo.py <logo_photo.jpg> <out.png>"""
import sys, numpy as np
from PIL import Image, ImageFilter
im = Image.open(sys.argv[1]).convert("RGB")
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
cx, cy, R = 553, 402, 262                       # logo centre / radius in the photo
yy, xx = np.mgrid[0:H, 0:W]
d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
circle = np.clip((R - d) / 14, 0, 1)            # soft circular crop
lum = a.max(2)                                  # red + silver are bright, wall is dark grey
key = np.clip((lum - 52) / 40, 0, 1)
alpha = circle * key
alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)
rgba = np.dstack([a, alpha]).astype(np.uint8)
out = Image.fromarray(rgba, "RGBA").crop((cx - R - 30, cy - R, cx + R + 30, cy + R))
bb = out.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
out.crop(bb).save(sys.argv[2])
print(out.crop(bb).size)
