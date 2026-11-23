"""Full sound design + dialogue mix for JANGAN PANDANG BELAKANG (48 kHz stereo)."""
import json, os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(os.path.join(ROOT, "src", "timeline.json")))
SR = 48000
DUR = TL["duration"] + 0.6
N = int(DUR * SR)
rng = np.random.default_rng(7)
mix = np.zeros((N, 2), np.float32)
tt = np.arange(N) / SR


def S(t):
    return int(t * SR)


def bp(x, lo, hi, order=4):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lp(x, f, order=4):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f, order=4):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def env(points):
    """piecewise-linear envelope over the whole timeline from [(t, gain), ...]"""
    ts, gs = zip(*points)
    return np.interp(tt, ts, gs).astype(np.float32)


def reverb(x, secs=2.5, wet=0.4, damp=3000, pre=0.02):
    n = int(secs * SR)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir = lp(ir, damp, 2)
    ir = np.concatenate([np.zeros(int(pre * SR)), ir])
    ir /= np.sqrt(np.sum(ir ** 2))
    y = fftconvolve(x, ir)[: len(x) + n]
    out = np.zeros(len(y)); out[: len(x)] += x * (1 - wet)
    return out + y * wet


def put(sig, t, gain=1.0, pan=0.0):
    """add mono (or stereo) signal at time t; pan -1..1"""
    i = S(t)
    if i >= N:
        return
    if sig.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l, sig * r], 1)
    n = min(len(sig), N - i)
    if i < 0:
        sig = sig[-i:]; n = min(len(sig), N); i = 0
    mix[i:i + n] += (sig[:n] * gain).astype(np.float32)


def put_bed(sig, gain_env, pan=0.0):
    put(sig * gain_env, 0, 1.0, pan)


def load(name):
    sr, x = wavfile.read(os.path.join(ROOT, "assets", "voice", f"{name}.wav"))
    return x.astype(np.float32) / 32768.0


def noise(n):
    return rng.standard_normal(n).astype(np.float32)


# ------------------------------------------------------------------ shot zones
EXTERIOR = [(4.4, 10.0), (19.6, 24.0), (46.0, 48.6)]
ext = np.zeros(N, np.float32)
for a, b in EXTERIOR:
    ext[S(a):S(b)] = 1
ext = lp(ext, 6, 1).astype(np.float32)   # smooth transitions
inside = 1 - ext

# ------------------------------------------------------------------ ambience
# wind
w = lp(noise(N), 500)
w *= (0.6 + 0.4 * np.sin(tt * 0.31) * np.sin(tt * 0.13 + 1))
w2 = bp(noise(N), 900, 2400) * (0.5 + 0.5 * np.sin(tt * 0.5 + 2)) ** 3 * 0.25   # whistling gusts
amb_gain = env([(0, 0.0), (0.8, 0.25), (4.3, 0.25), (4.4, 1.0), (59.45, 1.0), (59.46, 0.0), (63.2, 0.0), (64, 0.2), (70.5, 0.2)])
wind = (w + w2) * amb_gain * (0.25 + 0.75 * ext) * 0.5
put(np.stack([wind, np.roll(wind, 900)], 1), 0)

# insects: several crickets + a gecko-ish chirp + frogs
ins = np.zeros(N, np.float32)
for k in range(9):
    f = 3900 + rng.random() * 1800
    rate = 9 + rng.random() * 9
    gate = (np.sin(2 * np.pi * rate * tt + rng.random() * 6) > 0.55).astype(np.float32)
    burst = (np.sin(2 * np.pi * (0.25 + rng.random() * 0.4) * tt + rng.random() * 6) > -0.1).astype(np.float32)
    ins += np.sin(2 * np.pi * f * tt) * gate * burst * (0.3 + rng.random() * 0.7)
ins = lp(ins, 9000, 2)
frog = np.zeros(N, np.float32)
for t0 in np.arange(0.3, DUR, 0.85):
    if rng.random() < 0.6:
        n = S(0.16)
        e = np.sin(np.linspace(0, np.pi, n)) ** 2
        f = 280 + rng.random() * 120
        sgl = np.sign(np.sin(2 * np.pi * f * np.arange(n) / SR)) * e * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 30 * np.arange(n) / SR)))
        frog[S(t0):S(t0) + n] += lp(sgl, 1200)[: len(frog[S(t0):S(t0) + n])]
insect_gain = amb_gain * (0.05 + 0.95 * ext)
# insects go silent when she appears in the car (nature stops)
insect_gain *= env([(0, 1), (34.8, 1), (35.0, 0.0), (45.8, 0.0), (46.5, 1.0), (55.8, 1.0), (56.0, 0.0), (70.5, 0)])
iL = ins * insect_gain * 0.05; iR = np.roll(ins, 2400) * insect_gain * 0.05
put(np.stack([iL + frog * insect_gain * 0.03, iR + np.roll(frog, 5000) * insect_gain * 0.03], 1), 0)

# ------------------------------------------------------------------ car
speed = np.clip(env([(0, 0), (4.4, 0), (4.5, 1), (43.6, 1), (46.6, 0), (70.5, 0)]), 0, 1)
ph = np.cumsum(2 * np.pi * (28 + 6 * speed) / SR)
eng = (np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.3 * np.sin(3 * ph + 1)) * 0.6
eng += lp(noise(N), 180) * 1.2
road = lp(noise(N), 700) * 0.6
car_gain = speed * env([(0, 1), (59.45, 1), (59.46, 0), (70.5, 0)])
car = (lp(eng, 260) * 0.22 + road * 0.12) * car_gain * (0.55 + 0.45 * inside)
# idle after stopping
idle = (np.sin(2 * np.pi * 24 * tt) + 0.4 * np.sin(2 * np.pi * 48 * tt)) * 0.05 * env([(0, 0), (46.4, 0), (46.8, 1), (56.0, 1), (56.2, 0.4), (59.45, 0.4), (59.46, 0), (70.5, 0)])
put(np.stack([car + idle, car + idle], 1), 0)

# car passing the ghost: doppler whoosh
n = S(1.6)
x = noise(n)
sweep = np.concatenate([bp(x[: n // 2], 300, 2500), bp(x[n // 2:], 120, 900)])
e = np.exp(-((np.linspace(-1, 1, n)) ** 2) * 6)
whoosh = sweep * e * 0.6
pan = np.linspace(-0.9, 0.9, n)
put(np.stack([whoosh * np.cos((pan + 1) * np.pi / 4), whoosh * np.sin((pan + 1) * np.pi / 4)], 1), 21.1, 1.0)

# brake + gravel
n = S(0.9)
sq = np.sin(2 * np.pi * np.cumsum(np.linspace(2100, 1700, n)) / SR) * np.sin(np.linspace(0, np.pi, n)) ** 2 * 0.05
put(sq + bp(noise(n), 300, 3000) * np.linspace(0.12, 0, n), 45.7)

# ------------------------------------------------------------------ music
def piano(f, dur=4.0, vel=1.0):
    n = S(dur); t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f * h * t) * np.exp(-t * (1.2 + h * 0.9)) for h, a in [(1, 1), (2, 0.45), (3, 0.2), (4.02, 0.1), (5.1, 0.04)])
    s *= np.minimum(1, t * 200)
    return s * vel


A2, B2, C3, E2, F2, Bb2, D3, Eb3 = 110, 123.47, 130.81, 82.41, 87.31, 116.54, 146.83, 155.56
music = np.zeros(N + S(6), np.float32)
for t0, f, v in [(6.3, A2, 1), (7.8, C3, 0.8), (9.3, B2, 0.8), (10.9, E2, 1), (12.6, A2, 0.7), (14.2, F2, 0.9),
                 (46.8, A2, 1), (47.5, Bb2, 0.8), (49.6, E2, 1), (50.4, F2, 0.9), (52.2, A2, 0.8), (52.9, Eb3, 0.6),
                 (64.0, A2, 0.7), (65.6, Bb2, 0.6), (67.4, E2, 1.0)]:
    p = piano(f, 5, v)
    music[S(t0):S(t0) + len(p)] += p
music = reverb(music, 3.5, 0.55, 2500)[:N]
put(np.stack([music, np.roll(music, 600)], 1), 0, 0.16)

# drone bed
dr = (np.sin(2 * np.pi * 36.7 * tt) + 0.8 * np.sin(2 * np.pi * 55 * tt) + 0.6 * np.sin(2 * np.pi * 58.27 * tt)
      + 0.3 * np.sin(2 * np.pi * 110 * tt * (1 + 0.002 * np.sin(tt * 0.7))))
dr += lp(noise(N), 90) * 2
dr_gain = env([(0, 0.0), (0.5, 0.5), (3.5, 0.8), (4.4, 1.0), (6.2, 0.4), (14.5, 0.4), (19.6, 0.9), (24, 0.5),
               (30, 0.7), (35, 1.0), (42, 1.0), (46, 0.7), (53.6, 1.0), (56.0, 0.5), (58.0, 0.0), (58.9, 0.0), (59.0, 1.0), (59.45, 0.0),
               (60.2, 0.0), (61, 0.6), (67, 1.0), (69.8, 0.8), (70.5, 0)])
put(np.stack([dr, np.roll(dr, 1200)], 1) * dr_gain[:, None], 0, 0.11)

# string tension (cluster with vibrato) 15 -> 19.6 and 38 -> 42
def strings(dur, fs, rise=True):
    n = S(dur); t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * f * t + 3 * np.sin(2 * np.pi * (5 + i * 0.3) * t) / (5 + i)) for i, f in enumerate(fs))
    s = lp(s * (1 + 0.3 * np.sign(np.sin(2 * np.pi * fs[0] * 2 * t))), 3000)
    e = (t / dur) ** 2 if rise else np.ones(n)
    return s * e
put(strings(4.6, [440, 466.2, 493.9, 523.3, 880 * 1.06]), 15.0, 0.035)
put(strings(3.8, [329.6, 349.2, 370, 392]), 38.2, 0.03)
put(strings(2.6, [622, 659, 698, 740, 1244]), 53.6, 0.03)

# heartbeat
def beat():
    n = S(0.35); t = np.arange(n) / SR
    th = lambda d: np.sin(2 * np.pi * 52 * (t - d)) * np.exp(-np.maximum(0, t - d) * 22) * (t >= d)
    return th(0) + 0.7 * th(0.16)
hb = beat()
for a, b, bpm, g in [(0.4, 4.3, 62, 0.5), (30.2, 35.0, 88, 0.5), (36.0, 42.0, 120, 0.7), (50.6, 53.6, 100, 0.5), (53.6, 58.0, 138, 0.75), (60.4, 63.0, 54, 0.45)]:
    t0 = a
    while t0 < b:
        put(hb, t0, g * 0.6)
        t0 += 60 / bpm

# ------------------------------------------------------------------ hits / stingers
def sting(dur=2.5, big=1.0, hi=True):
    n = S(dur); t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * np.cumsum(np.linspace(70, 28, n)) / SR) * np.exp(-t * 1.6)
    burst = hp(noise(n), 200) * np.exp(-t * 9)
    s = sub * 1.3 + burst * 0.5
    if hi:
        sc = sum(np.sign(np.sin(2 * np.pi * np.cumsum(np.linspace(f, f * 0.82, n)) / SR)) for f in [1180, 1253, 1327, 1880, 2010])
        s += lp(sc, 6000) * np.exp(-t * 1.8) * 0.12
    return reverb(s * big, 2.2, 0.35, 5000)
put(sting(2.0, 0.8), 3.58)
put(sting(3.0, 1.0, False), 4.4)
put(sting(3.0, 0.9), 35.02)
put(sting(4.0, 1.5), 58.98)
put(sting(3.5, 1.0, False), 67.4)

# reverse whoosh into title and into the jump
def riser(dur):
    n = S(dur); t = np.arange(n) / SR
    return bp(noise(n), 400, 5000) * (t / dur) ** 3
put(riser(0.6), 3.0, 0.3); put(riser(0.5), 3.9, 0.35); put(riser(0.4), 58.58, 0.25)

# bone cracks while her neck turns
for i, t0 in enumerate([22.42, 22.6, 22.83, 23.05, 23.3]):
    n = S(0.07)
    c = hp(noise(n), 1500) * np.exp(-np.arange(n) / SR * 90) + np.sin(2 * np.pi * 160 * np.arange(n) / SR) * np.exp(-np.arange(n) / SR * 60) * 0.6
    put(reverb(c, 0.6, 0.2), t0, 0.5, -0.3)

# radio: click + static + electrical buzz
def click():
    n = S(0.03); return hp(noise(n), 800) * np.exp(-np.arange(n) / SR * 200)
put(click(), 26.88, 0.6); put(click(), 46.9, 0.4)
n = S(3.0)
stat = bp(noise(n), 1200, 7000) * (0.5 + 0.5 * (rng.random(n) > 0.997) * 4)
stat *= np.minimum(1, np.arange(n) / SR * 20) * np.minimum(1, (n - np.arange(n)) / SR * 4)
put(stat, 26.9, 0.08)
n = S(5.8)
put(bp(noise(n), 1500, 6000) * 0.5, 46.95, 0.03)

def buzz(dur, pattern_rate=40):
    n = S(dur); t = np.arange(n) / SR
    b = np.sign(np.sin(2 * np.pi * 100 * t)) * 0.4 + np.sin(2 * np.pi * 200 * t) * 0.3
    gate = (np.sin(2 * np.pi * pattern_rate * t * (1 + 0.5 * np.sin(t * 13))) > 0).astype(np.float32)
    return lp(b * gate, 2500)
put(buzz(2.2, 13), 27.0, 0.03); put(buzz(0.7, 25), 42.5, 0.06); put(buzz(3.0, 9), 0.9, 0.02)

# footsteps behind you (finale) + close breath
def step():
    n = S(0.5); t = np.arange(n) / SR
    thud = lp(noise(n), 300) * np.exp(-t * 30) * 2 + np.sin(2 * np.pi * 70 * t) * np.exp(-t * 25)
    creak = np.sin(2 * np.pi * np.cumsum(np.linspace(380, 300, n)) / SR) * np.exp(-((t - 0.12) * 18) ** 2) * 0.25
    return reverb(thud + creak, 1.8, 0.45, 1800)
for i, t0 in enumerate([60.5, 61.35, 62.15]):
    put(step(), t0, 0.25 + i * 0.12, 0.25 - i * 0.12)
n = S(1.4); t = np.arange(n) / SR
breath = bp(noise(n), 300, 2600) * np.sin(np.pi * t / 1.4) ** 2 * np.exp(-t * 0.6)
put(breath, 66.1, 0.25, 0.85)
put(breath[::-1].copy() * 0.6, 68.6, 0.25, -0.85)

# ------------------------------------------------------------------ dialogue
def place_voice(vid, kind):
    x = load(vid); t0 = TL["voices"][vid]
    if kind == "amir":
        y = reverb(lp(x, 7000), 0.35, 0.12, 4000, 0.005)
        put(y, t0, 0.62, 0.05)
    elif kind == "radio":
        y = bp(x, 350, 3200, 3); y = np.tanh(y * 3) / 3
        y = y + bp(noise(len(y)), 1500, 6000) * 0.02
        put(y, t0, 0.95, 0.0)
    elif kind == "radioghost":
        y = bp(x, 400, 3000, 3); y = np.tanh(y * 4) / 3
        y = reverb(y, 2.5, 0.4, 3000)
        put(y, t0, 0.9, 0.0)
    else:  # ghost: reverse-reverb swell + wet tail + Haas width + slow pan
        wet = reverb(x, 3.2, 0.5, 3500)
        pre = reverb(x[::-1].copy(), 1.6, 1.0, 3000)[::-1]
        pre = pre[-S(1.4):] if len(pre) > S(1.4) else pre
        put(pre * 0.35, t0 - len(pre) / SR + 0.02 + len(x) / SR * 0, 0.0)  # placeholder (overwritten below)
        swell = reverb(x[::-1].copy(), 2.0, 1.0, 3000)[::-1]
        lead = len(swell) - len(x)
        put(swell * 0.3, t0 - lead / SR, 1.0, -0.2)
        st = np.stack([wet, np.concatenate([np.zeros(S(0.018)), wet])[: len(wet)]], 1)
        put(st, t0, 0.85)


for vid, kind in [("hook", "ghost"), ("l1", "amir"), ("l2", "amir"), ("l3", "amir"), ("radio1", "radioghost"), ("l4", "amir"),
                  ("l5", "ghost"), ("l6", "amir"), ("news", "radio"), ("l8", "amir"), ("l9", "ghost")]:
    place_voice(vid, kind)

# finale whisper circles the listener: pan sweeps left -> right -> left
x = load("end"); t0 = TL["voices"]["end"]
wet = reverb(x, 3.5, 0.45, 3000)
p = np.sin(np.linspace(-1.3, 1.6, len(wet)))
put(np.stack([wet * np.cos((p + 1) * np.pi / 4), wet * np.sin((p + 1) * np.pi / 4)], 1), t0, 1.0)
# last faint whisper of the title in the left ear
h = reverb(load("hook"), 3.0, 0.6, 2500)
put(h, 69.2, 0.22, -0.9)

# ------------------------------------------------------------------ master
# hard silence after the jump scare
mute = env([(0, 1), (59.44, 1), (59.47, 0.0), (60.15, 0.0), (60.4, 1), (70.5, 1)])
mix *= mute[:, None]
mix = hp(mix.T, 25, 2).T
peak = np.abs(mix).max()
mix = np.tanh(mix / peak * 1.25) / np.tanh(1.25) * 0.93
fade = np.ones(N); fade[-S(0.5):] = np.linspace(1, 0, S(0.5))
mix *= fade[:, None]
wavfile.write(os.path.join(ROOT, "assets", "soundtrack.wav"), SR, (mix * 32767).astype(np.int16))
print("wrote soundtrack", mix.shape, "peak", np.abs(mix).max())
