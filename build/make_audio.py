"""Builds the final soundtrack: original voice + original synthesized music bed + soft SFX.

usage: python3 make_audio.py <source.mp4> <out.wav>
"""
import subprocess, sys, numpy as np
from timeline import *

SR = 48000
src, out = sys.argv[1], sys.argv[2]
N = int(TOTAL * SR) + SR // 10
t = np.arange(N) / SR
rng = np.random.default_rng(880)

def lp(x, fc):  # one-pole low-pass, run twice
    a = np.exp(-2 * np.pi * fc / SR)
    from scipy.signal import lfilter
    for _ in range(2):
        x = lfilter([1 - a], [1, -a], x)
    return x

def db(x): return 10 ** (x / 20)

# ---------------- voice (original audio, lightly cleaned) ----------------
v = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-af",
                    "highpass=f=85,lowpass=f=15000,acompressor=threshold=-22dB:ratio=2.5:attack=8:release=120:makeup=2,"
                    "equalizer=f=3200:t=q:w=1.2:g=2",
                    "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
v = np.frombuffer(v, np.float32).reshape(-1, 2)
voice = np.zeros((N, 2))
o = int(INTRO * SR)
voice[o:o + len(v)] = v[: N - o]

# ---------------- music bed (original, synthesized) ----------------
bpm = 96; beat = 60 / bpm; bar = 4 * beat
def midi(n): return 440 * 2 ** ((n - 69) / 12)
prog = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]  # Am F C G
roots = [45, 41, 48, 43]
pad = np.zeros(N); sub = np.zeros(N); arp = np.zeros(N)
nbars = int(TOTAL / bar) + 2
for b in range(nbars):
    ch = prog[b % 4]; s0 = b * bar
    i0 = int(s0 * SR); i1 = min(N, int((s0 + bar + 0.6) * SR))
    if i0 >= N: break
    tt = t[i0:i1] - s0
    env = np.minimum(1, tt / 0.8) * np.exp(-np.maximum(0, tt - bar) / 0.25)
    seg = np.zeros(i1 - i0)
    for n in ch:
        for det in (-0.08, 0.0, 0.07):
            f = midi(n + det)
            seg += 2 * ((tt * f + rng.random()) % 1) - 1  # saw
    pad[i0:i1] += seg * env / 12
    f = midi(roots[b % 4] - 12)
    sub[i0:i1] += np.sin(2 * np.pi * f * tt) * env * 0.5
    # soft plucked arpeggio, 8th notes
    for k in range(8):
        st = s0 + k * beat / 2
        j0 = int(st * SR); j1 = min(N, j0 + int(0.7 * SR))
        if j0 >= N: break
        ta = t[j0:j1] - st
        note = ch[[0, 2, 1, 3, 2, 1, 3, 2][k]] + 12
        arp[j0:j1] += np.sin(2 * np.pi * midi(note) * ta) * np.exp(-ta / 0.18) * (0.5 if k % 2 else 0.8)
pad = lp(pad, 1400)
# gentle ticking hat for movement
hat = np.zeros(N)
for k in range(int(TOTAL / (beat / 2)) + 1):
    j0 = int(k * beat / 2 * SR); j1 = min(N, j0 + int(0.04 * SR))
    if j0 >= N: break
    hat[j0:j1] += rng.standard_normal(j1 - j0) * np.exp(-np.arange(j1 - j0) / (0.008 * SR)) * (0.25 if k % 2 else 0.12)
hat = hat - lp(hat, 6000)
music_m = pad * 0.55 + sub * 0.35 + arp * 0.10 + hat * 0.12
# stereo widening with small delay
d = int(0.012 * SR)
music = np.stack([music_m, np.concatenate([np.zeros(d), music_m[:-d]])], 1)
# fade in/out
music *= np.clip(t / 1.2, 0, 1)[:, None] * np.clip((TOTAL - t) / 1.4, 0, 1)[:, None]

# ducking: music sits low under narration, dips further under the real alarm sound
duck = np.ones(N)
for a, b in VOICE:
    duck[int((INTRO + a - 0.15) * SR): int((INTRO + b + 0.25) * SR)] = db(-8)
duck[int((INTRO + ALARM[0] - 0.1) * SR): int((INTRO + ALARM[1] + 0.1) * SR)] = db(-20)
main_lo = db(-1.5)  # whole main section slightly lower than intro/outro
duck[int(INTRO * SR): int((INTRO + SRC_DUR) * SR)] *= main_lo
duck = lp(duck, 3.0)  # smooth gain changes
music *= duck[:, None]

# ---------------- SFX ----------------
sfx = np.zeros((N, 2))
def place(sig, at, gain_db, pan=0.0):
    i = int(at * SR); j = min(N, i + len(sig))
    if j <= i: return
    g = db(gain_db)
    sfx[i:j, 0] += sig[: j - i] * g * (1 - max(0, pan))
    sfx[i:j, 1] += sig[: j - i] * g * (1 + min(0, pan))

def whoosh(dur=0.9, up=True):
    n = int(dur * SR); x = rng.standard_normal(n); tt = np.arange(n) / n
    from scipy.signal import lfilter
    y = np.zeros(n); fcs = (300 + 5000 * tt ** 2) if up else (5000 - 4700 * tt ** 0.5)
    # time-varying band-pass via short blocks
    blk = 512
    for s in range(0, n, blk):
        fc = fcs[s]; a = np.exp(-2 * np.pi * fc / SR)
        seg = lfilter([1 - a], [1, -a], x[s:s + blk])
        y[s:s + blk] = x[s:s + blk] - seg * 0.6
    env = np.sin(np.pi * tt) ** 2
    return lp(y * env, 7000) * 0.5

def hit(dur=1.6, f0=55):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = f0 * (1 + 1.5 * np.exp(-tt / 0.05))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.45)
    noise = lp(rng.standard_normal(n), 2500) * np.exp(-tt / 0.08) * 0.4
    return body + noise

def blip(f=1760, dur=0.18):
    n = int(dur * SR); tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 1.5 * tt)) * np.exp(-tt / 0.04) * 0.5

def riser(dur=0.7):
    n = int(dur * SR); tt = np.arange(n) / n
    x = lp(rng.standard_normal(n), 3000) * tt ** 2
    return x * 0.5

place(riser(0.6), 0.0, -14)
place(hit(1.8, 50), 0.58, -9)          # title hit "MODEL 880"
place(blip(1320), 0.38, -24, -0.3)     # AUTOGATE text
place(blip(1760), 1.0, -26, 0.3)       # subtitle line in intro
place(whoosh(0.8), 2.45, -12)          # intro -> footage
for c in CALLOUTS:
    place(blip(1980, 0.14), INTRO + c, -30, 0.25)   # very soft UI tick for callouts
out_t = INTRO + SRC_DUR
place(whoosh(1.0, up=False), out_t - 0.25, -13)  # footage -> outro
for k, at in enumerate([0.3, 0.6, 0.9]):
    place(blip(1320 + 220 * k, 0.2), out_t + at, -24, (-0.3, 0, 0.3)[k])
place(hit(2.2, 45), out_t + 0.9, -11)  # final impact on RELIABLE.

mix = voice * 1.0 + music * db(-14) + sfx
mix = np.clip(mix, -1, 1)
mix.astype(np.float32).tofile(out + ".f32")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", out + ".f32",
                "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), out], check=True)
print("audio ok", out)
