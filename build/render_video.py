"""Renders the AUTOGATE MODEL 880 vertical review (1080x1920, 30 fps).

usage: python3 render_video.py <source.mp4> <audio.wav> <out.mp4> [preview_times...]

The original footage is never altered beyond framing (crop/zoom) and a light colour grade.
The framing keeps the burned-in Chinese subtitles of the source outside the frame so the
Malay subtitles can take their place.
"""
import subprocess, sys, math, functools
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from timeline import *

SRC, AUDIO, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
PREVIEW = [float(x) for x in sys.argv[4:]]
SW, SH = 1080, 1918
FONTS = "/usr/share/fonts/opentype/inter/"
MONO = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Medium.ttf"
CYAN = (53, 214, 255)
AMBER = (255, 196, 64)
WHITE = (255, 255, 255)
NAVY = (6, 12, 24)

@functools.lru_cache(None)
def font(name, size):
    return ImageFont.truetype(MONO if name == "mono" else FONTS + name, size)

def ease(x):  # smoothstep
    x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)

def ease_out(x):
    x = min(1.0, max(0.0, x)); return 1 - (1 - x) ** 3

def ramp(t, a, b):
    return min(1.0, max(0.0, (t - a) / (b - a))) if b > a else float(t >= a)

# ------------------------------------------------------------------ camera
# (src time, scale, cx, cy) in source pixel coordinates
KEYS = [(0.0, 1.25, 540, 940), (2.0, 1.55, 534, 905), (5.0, 1.62, 534, 895),
        (5.7, 1.45, 534, 840), (7.9, 1.50, 534, 830), (8.5, 1.74, 534, 790),
        (11.5, 1.86, 534, 782), (12.2, 1.58, 600, 860), (15.4, 1.68, 600, 860),
        (16.0, 1.30, 540, 900), (17.1, 1.33, 540, 900), (17.7, 1.82, 612, 900),
        (SRC_DUR, 1.96, 612, 905)]

def camera(ts):
    ts = min(max(ts, 0), SRC_DUR)
    for (t0, *a), (t1, *b) in zip(KEYS, KEYS[1:]):
        if ts <= t1:
            k = ease((ts - t0) / (t1 - t0))
            s, cx, cy = [p + (q - p) * k for p, q in zip(a, b)]
            break
    hw, hh = 540 / s, 960 / s
    cx = min(max(cx, hw), SW - hw)
    cy = min(max(cy, hh), 1712 - hh)   # keep burned-in source subtitles out of frame
    return s, cx, cy

def to_screen(cam, x, y):
    s, cx, cy = cam
    return (x - (cx - 540 / s)) * s, (y - (cy - 960 / s)) * s

def frame_view(img, cam):
    s, cx, cy = cam
    box = (cx - 540 / s, cy - 960 / s, cx + 540 / s, cy + 960 / s)
    return img.resize((W, H), Image.LANCZOS, box=box)

# ------------------------------------------------------------------ grade
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
r2 = ((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * 0.47) / (H * 0.62)) ** 2
VIGNETTE = (1 - 0.30 * np.clip(r2, 0, 1.6) ** 1.6)[..., None]
x = np.arange(256) / 255.0
curve = np.clip(0.5 + (x - 0.5) * 1.08 - 0.015, 0, 1)
LUT_R = np.clip(curve * 255 + 0, 0, 255)
LUT_G = np.clip(curve * 255 + 1, 0, 255)
LUT_B = np.clip(curve * 255 + 4 * (1 - x), 0, 255)  # slightly cool shadows

def grade(img):
    a = np.asarray(img).astype(np.float32)
    a[..., 0] = LUT_R[a[..., 0].astype(np.uint8)]
    a[..., 1] = LUT_G[a[..., 1].astype(np.uint8)]
    a[..., 2] = LUT_B[a[..., 2].astype(np.uint8)]
    g = a.mean(2, keepdims=True)
    a = g + (a - g) * 1.06
    a *= VIGNETTE
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def darken(img, k, blur=0):
    if blur > 0.5:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(img).astype(np.float32)
    a = a * k + np.array(NAVY, np.float32) * (1 - k)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

# ------------------------------------------------------------------ sprites
@functools.lru_cache(None)
def text_sprite(text, fname, size, color=WHITE, spacing=0, glow=0, shadow=True, gradient=None):
    f = font(fname, size)
    widths = [f.getlength(c) for c in text]
    tw = int(sum(widths) + spacing * max(0, len(text) - 1)) + 2
    asc, desc = f.getmetrics()
    th = asc + desc
    pad = 40
    mask = Image.new("L", (tw + 2 * pad, th + 2 * pad), 0)
    d = ImageDraw.Draw(mask)
    if spacing:
        x = pad
        for c, w in zip(text, widths):
            d.text((x, pad), c, font=f, fill=255); x += w + spacing
    else:
        d.text((pad, pad), text, font=f, fill=255)
    if gradient:
        g = np.linspace(0, 1, mask.size[1])[:, None, None]
        c0, c1 = np.array(gradient[0]), np.array(gradient[1])
        fill = (c0 * (1 - g) + c1 * g) * np.ones((1, mask.size[0], 1))
        layer = Image.fromarray(np.dstack([fill, np.zeros(mask.size[::-1])]).astype(np.uint8), "RGBA")
    else:
        layer = Image.new("RGBA", mask.size, color + (0,))
    layer.putalpha(mask)
    out = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    if shadow:
        sh = Image.new("RGBA", mask.size, (0, 0, 0, 0)); sh.putalpha(mask.point(lambda v: v * 0.55))
        out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6)), (0, 3))
    if glow:
        gc = gradient[1] if gradient else color
        gl = Image.new("RGBA", mask.size, gc + (0,)); gl.putalpha(mask.point(lambda v: v * glow))
        out.alpha_composite(gl.filter(ImageFilter.GaussianBlur(14)))
    out.alpha_composite(layer)
    return out, pad, tw, th

def paste(canvas, spr, x, y, alpha=1.0, anchor="lt", scale=1.0):
    """Paste a text sprite; (x, y) refers to the text box, anchor l/c/r + t/m."""
    img, pad, tw, th = spr
    if alpha <= 0.003: return
    if scale != 1.0:
        img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.BICUBIC)
        pad, tw, th = pad * scale, tw * scale, th * scale
    if alpha < 1:
        img = img.copy(); a = img.getchannel("A").point(lambda v: v * alpha); img.putalpha(a)
    ox = {"l": 0, "c": tw / 2, "r": tw}[anchor[0]]
    oy = {"t": 0, "m": th / 2}[anchor[1]]
    canvas.alpha_composite(img, (int(round(x - ox - pad)), int(round(y - oy - pad))))

def glow_layer(draw_fn, blur=9, strength=1.0):
    """Draw shapes once, return the sharp layer composited over a blurred glow copy."""
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(lay))
    out = lay.filter(ImageFilter.GaussianBlur(blur))
    if strength != 1.0:
        out.putalpha(out.getchannel("A").point(lambda v: min(255, v * strength)))
    out.alpha_composite(lay)
    return out

def glass(canvas, box, radius, alpha, tint=(8, 12, 22), dark=0.72):
    """Frosted-glass panel: blur + darken what is underneath, inside a rounded box."""
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(W, x1), min(H, y1)
    if x1 - x0 < 4 or y1 - y0 < 4 or alpha <= 0: return
    reg = canvas.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(22))
    a = np.asarray(reg).astype(np.float32)
    a[..., :3] = a[..., :3] * (1 - dark) + np.array(tint, np.float32) * dark
    a[..., 3] = 255
    reg = Image.fromarray(a.astype(np.uint8), "RGBA")
    m = Image.new("L", reg.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, reg.size[0] - 1, reg.size[1] - 1), radius, fill=int(255 * alpha))
    reg.putalpha(m)
    canvas.alpha_composite(reg, (x0, y0))

def rgba(c, a): return c + (int(255 * max(0, min(1, a))),)

# ------------------------------------------------------------------ subtitles
def parse(text):
    words, mode, cur = [], None, ""
    for tok in text.replace("{", " { ").replace("}", " } ").replace("<", " < ").replace(">", " > ").split():
        if tok in "{<": mode = "c" if tok == "{" else "a"
        elif tok in "}>": mode = None
        else: words.append((tok, mode))
    return words

SUB_FONT, SUB_SIZE, SUB_MAXW, SUB_Y = "InterDisplay-ExtraBold.otf", 62, 900, 1500

@functools.lru_cache(None)
def sub_layout(text):
    words = parse(text)
    f = font(SUB_FONT, SUB_SIZE); space = f.getlength(" ")
    lines, cur, cw = [], [], 0
    for w, m in words:
        ww = f.getlength(w)
        if cur and cw + space + ww > SUB_MAXW:
            lines.append((cur, cw)); cur, cw = [], 0
        cw = cw + (space if cur else 0) + ww; cur.append((w, m, ww))
    lines.append((cur, cw))
    return lines, space

def draw_subs(canvas, ts):
    for a, b, text in SUBS:
        if not (a - 0.01 <= ts <= b + 0.15): continue
        lines, space = sub_layout(text)
        lh = 80
        total_h = lh * len(lines)
        maxw = max(w for _, w in lines)
        pin = ease_out(ramp(ts, a, a + 0.16)); pout = 1 - ramp(ts, b, b + 0.14)
        alpha = pin * pout
        # glass panel
        pw, ph = maxw + 70, total_h + 40
        top = SUB_Y - ph / 2 + (1 - pin) * 18
        x0 = (W - pw) / 2
        glass(canvas, (x0, top, x0 + pw, top + ph), 26, alpha, dark=0.74)
        panel = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(panel)
        d.rounded_rectangle((x0, top, x0 + pw, top + ph), 26, outline=rgba(CYAN, 0.22 * alpha), width=2)
        lw = (pw - 52) * ease_out(ramp(ts, a + 0.05, a + 0.45))
        d.line((W / 2 - lw / 2, top + ph - 1, W / 2 + lw / 2, top + ph - 1), fill=rgba(CYAN, 0.9 * alpha), width=3)
        canvas.alpha_composite(panel)
        # words, staggered rise-in
        k = 0
        for li, (ws, lwid) in enumerate(lines):
            x = (W - lwid) / 2
            y = top + 20 + li * lh + 4
            for w, m, ww in ws:
                p = ease_out(ramp(ts, a + 0.035 * k, a + 0.035 * k + 0.2))
                col = CYAN if m == "c" else AMBER if m == "a" else WHITE
                spr = text_sprite(w, SUB_FONT, SUB_SIZE, col, glow=0.55 if m else 0)
                paste(canvas, spr, x, y + (1 - p) * 16, alpha=p * pout)
                x += ww + space; k += 1

# ------------------------------------------------------------------ HUD + callouts
BTN = {"TL": (398, 692, 508, 828), "TR": (562, 692, 672, 828),
       "BL": (398, 866, 508, 1002), "BR": (562, 866, 672, 1002)}
def union(*ks, pad=16):
    r = [BTN[k] for k in ks]
    return (min(q[0] for q in r) - pad, min(q[1] for q in r) - pad, max(q[2] for q in r) + pad, max(q[3] for q in r) + pad)

CALL = [  # (start, end, source rect, label, label start, accent)
    (0.25, 4.95, union("BL", "BR"), "BUNYI BIP  ·  ON / OFF", 2.2, CYAN),
    (8.20, 11.62, union("TL", "TR"), "PAKSA TUTUP PAGAR", 8.25, CYAN),
    (11.90, 15.45, union("TR", "BR"), "AKTIFKAN PENGGERA", 14.15, AMBER),
    (17.30, 19.80, union("BR", pad=14), "MATIKAN PENGGERA", 17.35, AMBER),
]

def draw_focus(canvas, ts, cam):
    for a, b, rect, label, la, acc in CALL:
        if not (a <= ts <= b + 0.25): continue
        pin = ease_out(ramp(ts, a, a + 0.35)); pout = 1 - ramp(ts, b, b + 0.25); al = pin * pout
        x0, y0 = to_screen(cam, rect[0], rect[1]); x1, y1 = to_screen(cam, rect[2], rect[3])
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        sc = 1.18 - 0.18 * pin
        x0, x1 = cx + (x0 - cx) * sc, cx + (x1 - cx) * sc
        y0, y1 = cy + (y0 - cy) * sc, cy + (y1 - cy) * sc
        L = min(46, (x1 - x0) / 4)
        pulse = 0.75 + 0.25 * math.sin((ts - a) * 5)
        def shapes(d):
            c = rgba(acc, al * pulse)
            for (px, py, dx, dy) in [(x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)]:
                d.line((px, py, px + dx * L, py), fill=c, width=5)
                d.line((px, py, px, py + dy * L), fill=c, width=5)
            # scan line sweeping through the focus area
            sp = ((ts - a) / 1.6) % 1
            sy = y0 + (y1 - y0) * sp
            d.line((x0 + 8, sy, x1 - 8, sy), fill=rgba(acc, 0.35 * al * math.sin(math.pi * sp)), width=2)
            # animated arrow + label anchor
            if label and ts >= la:
                pa = ease_out(ramp(ts, la, la + 0.35)) * pout
                ly = y1 + 120
                tip = y1 + 12
                start = ly - 34
                cur = start - (start - tip) * pa
                d.line((cx, start, cx, cur), fill=rgba(acc, pa), width=4)
                if pa > 0.2:
                    d.polygon([(cx, cur - 4), (cx - 15, cur + 20), (cx + 15, cur + 20)], fill=rgba(acc, pa))
        canvas.alpha_composite(glow_layer(shapes, blur=8, strength=1.6))
        if label and ts >= la:
            pa = ease_out(ramp(ts, la + 0.1, la + 0.45)) * pout
            spr = text_sprite(label, "InterDisplay-Bold.otf", 40, WHITE, spacing=3)
            _, pad, tw, th = spr
            ly = y1 + 120
            chip = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(chip)
            cw = (tw + 60) * (0.6 + 0.4 * pa)
            d.rounded_rectangle((cx - cw / 2, ly - 32, cx + cw / 2, ly + th + 2), 14,
                                fill=(8, 12, 22, int(200 * pa)), outline=rgba(acc, pa), width=2)
            canvas.alpha_composite(chip)
            paste(canvas, spr, cx, ly - 32 + (th + 34) / 2, alpha=pa, anchor="cm")

def ir_icon(d, x, y, al):
    d.rounded_rectangle((x, y - 30, x + 12, y + 30), 4, fill=rgba(WHITE, al))
    d.rounded_rectangle((x + 108, y - 30, x + 120, y + 30), 4, fill=rgba(WHITE, al))
    for k in range(6):
        if k in (2, 3): continue
        d.line((x + 18 + k * 15, y, x + 26 + k * 15, y), fill=rgba(AMBER, al), width=4)
    d.line((x + 48, y - 16, x + 72, y + 16), fill=rgba(AMBER, al), width=5)
    d.line((x + 48, y + 16, x + 72, y - 16), fill=rgba(AMBER, al), width=5)

def draw_info_chip(canvas, ts, a, b, title, tag, icon=None, bars=None, y=1225):
    if not (a <= ts <= b + 0.25): return
    pin = ease_out(ramp(ts, a, a + 0.35)); pout = 1 - ramp(ts, b, b + 0.25); al = pin * pout
    spr = text_sprite(title, "InterDisplay-Bold.otf", 44, WHITE, spacing=3)
    tg = text_sprite(tag, "mono", 24, AMBER, spacing=4, shadow=False)
    _, _, tw, th = spr
    iw = 150 if (icon or bars is not None) else 0
    cw = tw + iw + 80; ch = 128
    x0 = W / 2 - cw / 2 + (1 - pin) * -40
    glass(canvas, (x0, y - ch / 2, x0 + cw, y + ch / 2), 20, al, dark=0.8)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.rounded_rectangle((x0, y - ch / 2, x0 + cw, y + ch / 2), 20, fill=(8, 12, 22, int(60 * al)),
                        outline=rgba(AMBER, 0.9 * al), width=2)
    d.rectangle((x0 + 18, y - ch / 2 + 18, x0 + 24, y + ch / 2 - 18), fill=rgba(AMBER, al))
    if icon: icon(d, x0 + 44, y, al)
    if bars is not None:
        n = len(bars)
        for i, v in enumerate(bars):
            h = 8 + 70 * v
            bx = x0 + 44 + i * (118 / n)
            d.rounded_rectangle((bx, y - h / 2, bx + 118 / n - 3, y + h / 2), 2, fill=rgba(AMBER, al))
    canvas.alpha_composite(lay)
    paste(canvas, tg, x0 + 44 + iw, y - 44, alpha=al)
    paste(canvas, spr, x0 + 44 + iw, y + 14, alpha=al, anchor="lm")

def draw_hud(canvas, t, ts, alpha):
    if alpha <= 0: return
    def shapes(d):
        c = rgba(CYAN, 0.55 * alpha); m, L = 46, 64
        for (px, py, dx, dy) in [(m, m + 110, 1, 1), (W - m, m + 110, -1, 1), (m, H - m - 230, 1, -1), (W - m, H - m - 230, -1, -1)]:
            d.line((px, py, px + dx * L, py), fill=c, width=3)
            d.line((px, py, px, py + dy * L), fill=c, width=3)
        # thin glowing edge line that slowly travels down the left side
        p = (t / 6.0) % 1
        yy0 = 300 + p * 1100
        d.line((m, yy0, m, yy0 + 140), fill=rgba(CYAN, 0.6 * alpha), width=2)
    canvas.alpha_composite(glow_layer(shapes, blur=6, strength=1.4))
    glass(canvas, (56, 92, 66 + 352, 138), 10, alpha, dark=0.8)
    glass(canvas, (W - 66 - 214, 92, W - 56, 138), 10, alpha, dark=0.8)
    paste(canvas, text_sprite("AUTOGATE // MODEL 880", "mono", 24, CYAN, spacing=2), 74, 102, alpha=0.9 * alpha)
    blink = 1 if int(t * 2) % 2 == 0 else 0.35
    paste(canvas, text_sprite("●", "mono", 22, (255, 70, 70)), W - 66 - 196, 102, alpha=alpha * blink)
    paste(canvas, text_sprite(f"DEMO {ts:05.1f}s", "mono", 24, WHITE, spacing=2), W - 66, 102, alpha=0.85 * alpha, anchor="rt")

def draw_lower_third(canvas, ts):
    a, b = 0.15, 2.1
    if not (a <= ts <= b + 0.3): return
    pin = ease_out(ramp(ts, a, a + 0.5)); pout = 1 - ramp(ts, b, b + 0.3); al = pin * pout
    x, y = 70, 1185
    t1 = text_sprite("AUTOGATE MODEL 880", "InterDisplay-Black.otf", 52, WHITE, spacing=1)
    t2 = text_sprite("Alat kawalan jauh  ·  DNOR Turbo 880", "Inter-Medium.otf", 32, (205, 215, 230))
    w = max(t1[2], t2[2]) + 70
    glass(canvas, (x, y, x + w * pin, y + 130), 14, al, dark=0.78)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.rectangle((x, y, x + 7, y + 130 * pin), fill=rgba(CYAN, al))
    canvas.alpha_composite(lay)
    o = (1 - pin) * -30
    paste(canvas, t1, x + 32 + o, y + 14, alpha=ease_out(ramp(ts, a + 0.15, a + 0.55)) * pout)
    paste(canvas, t2, x + 32 + o, y + 80, alpha=ease_out(ramp(ts, a + 0.3, a + 0.7)) * pout)

# ------------------------------------------------------------------ alarm meter from the real audio
_aud = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", SRC, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                                    capture_output=True).stdout, np.float32)
def bars_at(ts, n=10):
    i = int(ts * 16000); x = _aud[max(0, i - 800): i + 800]
    if len(x) < 1600: return [0] * n
    sp = np.abs(np.fft.rfft(x * np.hanning(len(x))))[20:500]
    b = np.array([c.mean() for c in np.array_split(sp, n)])
    b = np.clip(np.log10(b + 1e-6) + 1.2, 0, 2.2) / 2.2
    wob = 0.15 * np.sin(ts * 23 + np.arange(n))
    return list(np.clip(b + wob, 0, 1))

# ------------------------------------------------------------------ intro / outro
def light_sweep(canvas, p, alpha=0.5):
    if p <= 0 or p >= 1: return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    x = -600 + p * (W + 1200)
    d.polygon([(x, 0), (x + 220, 0), (x - 380, H), (x - 600, H)], fill=(190, 235, 255, int(255 * alpha * math.sin(math.pi * p))))
    canvas.alpha_composite(lay.filter(ImageFilter.GaussianBlur(60)))

def glow_line(canvas, y, width, al, acc=CYAN, dot=None):
    def shapes(d):
        d.line((W / 2 - width / 2, y, W / 2 + width / 2, y), fill=rgba(acc, al), width=3)
        if dot is not None:
            dx = W / 2 - width / 2 + width * dot
            d.ellipse((dx - 6, y - 6, dx + 6, y + 6), fill=rgba(WHITE, al))
    canvas.alpha_composite(glow_layer(shapes, blur=10, strength=2.2))

def render_intro(t, first):
    s = 1.38 - 0.13 * ease(t / INTRO)
    cam = (s, 540, min(940, 1712 - 960 / s))
    reveal = ease(ramp(t, 2.35, 3.0))
    bg = grade(frame_view(first, cam))
    bg = darken(bg, 0.30 + 0.70 * reveal, blur=26 * (1 - reveal))
    c = bg.convert("RGBA")
    out = 1 - ease(ramp(t, 2.2, 2.6))
    lift = -24 * ease(ramp(t, 2.2, 2.6))
    p1 = ease_out(ramp(t, 0.3, 0.8))
    paste(c, text_sprite("AUTOGATE", "InterDisplay-Bold.otf", 78, WHITE, spacing=26),
          W / 2, 820 + (1 - p1) * 30 + lift, alpha=p1 * out, anchor="cm")
    p2 = ease_out(ramp(t, 0.55, 1.0))
    paste(c, text_sprite("MODEL 880", "InterDisplay-Black.otf", 172, gradient=(WHITE, CYAN), glow=0.8),
          W / 2, 965 + lift, alpha=p2 * out, anchor="cm", scale=1.12 - 0.12 * p2)
    pl = ease_out(ramp(t, 0.45, 1.2))
    if pl > 0: glow_line(c, 1088 + lift, 720 * pl, 0.95 * out, dot=pl)
    p3 = ease_out(ramp(t, 1.0, 1.4))
    paste(c, text_sprite("DNOR TURBO 880  ·  ULASAN PRODUK", "mono", 28, (200, 225, 240), spacing=4),
          W / 2, 1140 + (1 - p3) * 14 + lift, alpha=p3 * out, anchor="cm")
    light_sweep(c, ramp(t, 2.35, 3.05), 0.35)
    return c

def render_outro(t, last):
    cam = camera(SRC_DUR)
    p = ease(ramp(t, 0.0, 0.5))
    s, cx, cy = cam
    bg = grade(frame_view(last, (s * (1 + 0.04 * t / OUTRO), cx, min(cy, 1712 - 960 / (s * 1.04)))))
    bg = darken(bg, 1 - 0.72 * p, blur=26 * p)
    c = bg.convert("RGBA")
    for k, (word, y) in enumerate([("SMART", 790), ("SECURE", 945), ("RELIABLE", 1100)]):
        a = 0.3 + 0.3 * k
        q = ease_out(ramp(t, a, a + 0.4))
        if q <= 0: continue
        spr = text_sprite(word, "InterDisplay-Black.otf", 132, WHITE, spacing=4)
        dot = text_sprite(".", "InterDisplay-Black.otf", 132, CYAN, glow=0.9)
        wtot = spr[2] + dot[2]
        x0 = W / 2 - wtot / 2
        paste(c, spr, x0, y + (1 - q) * 40, alpha=q, anchor="lm")
        paste(c, dot, x0 + spr[2] + 4, y + (1 - q) * 40, alpha=q, anchor="lm")
    pl = ease_out(ramp(t, 1.05, 1.7))
    if pl > 0: glow_line(c, 1205, 640 * pl, 0.95, dot=pl)
    q = ease_out(ramp(t, 1.35, 1.8))
    paste(c, text_sprite("AUTOGATE MODEL 880", "mono", 36, (210, 232, 245), spacing=10),
          W / 2, 1275 + (1 - q) * 12, alpha=q, anchor="cm")
    fb = ramp(t, OUTRO - 0.5, OUTRO)
    if fb > 0:
        a = np.asarray(c).astype(np.float32); a[..., :3] *= (1 - fb); c = Image.fromarray(a.astype(np.uint8), "RGBA")
    return c

# ------------------------------------------------------------------ main loop
def render_main(ts, src_img, t):
    cam = camera(ts)
    c = grade(frame_view(src_img, cam)).convert("RGBA")
    c = c.filter(ImageFilter.UnsharpMask(radius=1.4, percent=45, threshold=2)) if cam[0] > 1.5 else c
    hud_a = ease(ramp(ts, 0.0, 0.6)) * (1 - ease(ramp(ts, SRC_DUR - 0.4, SRC_DUR)))
    draw_hud(c, t, ts, hud_a)
    draw_focus(c, ts, cam)
    draw_info_chip(c, ts, 5.3, 7.95, "SENSOR INFRAMERAH", "INFO", icon=ir_icon, y=1300)
    if ALARM[0] - 0.05 <= ts <= ALARM[1] + 0.3:
        draw_info_chip(c, ts, ALARM[0], ALARM[1], "BUNYI PENGGERA", "DEMO  ·  AUDIO ASAL", bars=bars_at(ts), y=1300)
    draw_lower_third(c, ts)
    draw_subs(c, ts)
    return c

def src_frames():
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", SRC, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    n = SW * SH * 3
    while True:
        b = p.stdout.read(n)
        if len(b) < n: break
        yield Image.frombytes("RGB", (SW, SH), b)

def grab(ts):
    b = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{ts:.3f}", "-i", SRC, "-frames:v", "1", "-f", "rawvideo",
                        "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return Image.frombytes("RGB", (SW, SH), b[: SW * SH * 3])

def frame_at(t, first, last, src_img=None):
    if t < INTRO: return render_intro(t, first)
    if t >= INTRO + SRC_DUR: return render_outro(t - INTRO - SRC_DUR, last)
    ts = t - INTRO
    return render_main(ts, src_img if src_img is not None else grab(ts), t)

first = grab(0.0); last = grab(SRC_DUR - 0.08)

if PREVIEW:
    for t in PREVIEW:
        frame_at(t, first, last).convert("RGB").save(f"{OUT}_{t:05.2f}.jpg", quality=90)
    sys.exit()

nframes = int(round(TOTAL * FPS))
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                        "-i", "-", "-i", AUDIO, "-map", "0:v", "-map", "1:a",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p",
                        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                        "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest", "-movflags", "+faststart", OUT],
                       stdin=subprocess.PIPE)
frames = src_frames(); cur = None
for i in range(nframes):
    t = i / FPS
    ts = t - INTRO
    if 0 <= ts < SRC_DUR:
        nxt = next(frames, None)
        if nxt is not None: cur = nxt
    img = frame_at(t, first, last, cur)
    enc.stdin.write(img.convert("RGB").tobytes())
    if i % 60 == 0: print(f"frame {i}/{nframes}", flush=True)
enc.stdin.close(); enc.wait()
print("video ok", OUT)
