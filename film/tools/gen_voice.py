"""Generate dialogue clips (Malay) with espeak-ng + mbrola, process per character,
and export durations + 24fps mouth envelopes for lip sync."""
import subprocess, json, os, numpy as np, wave
from scipy.io import wavfile
from scipy.signal import resample_poly

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "voice")
os.makedirs(OUT, exist_ok=True)
SR = 48000

# id, speaker, text spoken, speed, pitch, pitch-shift factor
LINES = [
    ("hook",   "ghost", "Jangan... pandang... belakang.", 95, 20, 0.78),
    ("l1",     "amir",  "Dah pukul dua pagi... Kenapa jalan ni sunyi sangat?", 140, 28, 0.80),
    ("l2",     "amir",  "Eh... siapa tu? Tengah malam macam ni.", 135, 30, 0.80),
    ("l3",     "amir",  "Jangan tengok, Amir. Jangan tengok.", 130, 26, 0.80),
    ("radio1", "ghost", "Tumpang... saya...", 85, 18, 0.76),
    ("l4",     "amir",  "Bau apa ni... bunga melur?", 125, 32, 0.80),
    ("l5",     "ghost", "Hantar... saya... balik...", 85, 16, 0.74),
    ("l6",     "amir",  "Tak ada... tak ada apa-apa.", 125, 34, 0.80),
    ("news",   "radio", "Berita terkini. Seorang pemuda maut dalam kemalangan di Jalan Kampung Sungai Mati, jam dua pagi tadi.", 165, 48, 1.0),
    ("l8",     "amir",  "Tak... tak mungkin...", 110, 36, 0.80),
    ("l9",     "ghost", "Kita dah sampai... Amir.", 90, 14, 0.74),
    ("end",    "ghost", "Sekarang... dia di belakang kau.", 88, 14, 0.74),
]

def espeak(text, voice, speed, pitch, path):
    subprocess.run(["espeak-ng", "-v", voice, "-s", str(speed), "-p", str(pitch), "-w", path, text],
                   check=True, stderr=subprocess.DEVNULL)
    sr, x = wavfile.read(path)
    x = x.astype(np.float32) / 32768.0
    if x.ndim > 1: x = x.mean(1)
    return sr, x

def shift(sr, x, f):
    # pitch+formant shift: play slower/faster then time-stretch back with ffmpeg atempo
    tmp_in = "/tmp/_v_in.wav"; tmp_out = "/tmp/_v_out.wav"
    wavfile.write(tmp_in, sr, (x * 32767).astype(np.int16))
    flt = f"asetrate={int(sr*f)},aresample={SR},atempo={1/f:.4f}" if f != 1.0 else f"aresample={SR}"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp_in, "-af", flt, tmp_out], check=True)
    _, y = wavfile.read(tmp_out)
    return y.astype(np.float32) / 32768.0

def to48(sr, x):
    from math import gcd
    g = gcd(SR, sr)
    return resample_poly(x, SR // g, sr // g).astype(np.float32)

def trim(x, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0: return x
    return x[max(0, idx[0] - 480): idx[-1] + 2400]

meta = {}
for lid, spk, text, spd, pit, f in LINES:
    tmp = f"/tmp/_{lid}.wav"
    if spk == "amir":
        sr, x = espeak(text, "mb-ma1", spd, pit, tmp)
        y = shift(sr, x, f)
    elif spk == "radio":
        sr, x = espeak(text, "mb-ma1", spd, pit, tmp)
        y = to48(sr, x)
    else:  # ghost: low mbrola voice layered with a breathy whisper voice
        sr, x = espeak(text, "mb-ma1", spd, pit, tmp)
        a = shift(sr, x, f)
        sr2, w = espeak(text, "ms+whisper", int(spd * 1.0), 30, tmp)
        b = to48(sr2, w)
        n = max(len(a), len(b))
        a = np.pad(a, (0, n - len(a))); b = np.pad(b, (0, n - len(b)))
        y = 0.55 * a + 0.9 * b
    y = trim(y)
    y = y / (np.abs(y).max() + 1e-9) * 0.9
    wavfile.write(os.path.join(OUT, f"{lid}.wav"), SR, (y * 32767).astype(np.int16))
    # 24fps envelope for lip sync
    hop = SR // 24
    env = [float(np.sqrt(np.mean(y[i:i + hop] ** 2))) for i in range(0, len(y), hop)]
    m = max(env) or 1
    meta[lid] = {"speaker": spk, "text": text, "dur": len(y) / SR, "env": [round(e / m, 3) for e in env]}

json.dump(meta, open(os.path.join(OUT, "lines.json"), "w"))
for k, v in meta.items():
    print(f"{k:7s} {v['speaker']:6s} {v['dur']:.2f}s  {v['text']}")
