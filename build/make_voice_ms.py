"""Malay voice-over (espeak-ng + MBROLA ma1 Malay voice), timed to the footage.

usage: python3 make_voice_ms.py <out_voice.wav> <out_subs.json>

Each visual section of the footage (which buttons the original arrows point to) gets the
matching Malay line(s). Clips are placed inside that section's window and gently sped up
only if needed, and the exact clip times become the subtitle times, so subtitles follow the voice.
The voice has no "o" phoneme, so a few words are given as phonemes ([[...]]) or reworded.
"""
import subprocess, sys, json, os, tempfile
import numpy as np

OUT, SUBS_OUT = sys.argv[1], sys.argv[2]
SR = 48000
U = "[[unt'u?]]"
# (window start, window end, [(display text with {cyan}/<amber> markup, spoken text), ...])  - source time
SECTIONS = [
    (0.15, 5.15, [("Tekan {dua butang bawah} serentak", "Tekan dua butang bawah serentak,"),
                  ("untuk <hidupkan> atau <matikan>", f"{U} hidupkan atau matikan"),
                  ("{bunyi bip} buka & tutup pagar", "bunyi bip, buka dan [[t'utup]] pagar.")]),
    (5.38, 8.10, [("Jika {pengesan inframerah} terhalang,", "Jika pengesan inframerah terhalang,"),
                  ("pagar <tidak akan tertutup>", "pagar tidak akan [[t@rt'utup]].")]),
    (8.45, 11.75, [("Tekan serentak {dua butang atas}", "Tekan serentak dua butang atas,"),
                   ("untuk <paksa pagar ditutup>", f"{U} paksa pagar [[dit'utup]].")]),
    (11.90, 15.55, [("Tekan {dua butang kanan} serentak", "Tekan dua butang kanan serentak,"),
                    ("untuk <bunyikan penggera>", f"{U} bunyikan penggera.")]),
    (17.30, 19.75, [("Tekan {butang merah} untuk <matikan penggera>", f"Tekan butang merah, {U} matikan penggera.")]),
]
GAP = 0.10
FX = ("highpass=f=90,lowpass=f=7600,equalizer=f=220:t=q:w=1:g=2.5,equalizer=f=3000:t=q:w=1.2:g=2,"
      "acompressor=threshold=-20dB:ratio=3:attack=5:release=100:makeup=3,aecho=0.8:0.6:28|47:0.10|0.06")

def synth(text, tempo):
    with tempfile.TemporaryDirectory() as d:
        raw = os.path.join(d, "a.wav")
        r = subprocess.run(["espeak-ng", "-v", "mb-ma1", "-s", "172", "-p", "48", "-w", raw, text], capture_output=True, text=True)
        assert "Warning" not in r.stderr, (text, r.stderr)
        af = f"aresample={SR},atempo={tempo:.4f}," + FX + ",silenceremove=start_periods=1:start_threshold=-50dB:stop_periods=1:stop_threshold=-50dB:stop_duration=0.2:detection=peak"
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", raw, "-af", af, "-ac", "1", "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(pcm, np.float32)

total = 19.866 + 0.5
voice = np.zeros(int(total * SR), np.float32)
subs = []
for a, b, lines in SECTIONS:
    clips = [synth(sp, 1.0) for _, sp in lines]
    dur = sum(len(c) for c in clips) / SR + GAP * (len(clips) - 1)
    tempo = min(1.25, max(1.0, dur / (b - a)))
    if tempo > 1.0:
        clips = [synth(sp, tempo) for _, sp in lines]
        dur = sum(len(c) for c in clips) / SR + GAP * (len(clips) - 1)
    t = a
    for (disp, _), c in zip(lines, clips):
        i = int(t * SR); voice[i:i + len(c)] += c[: len(voice) - i]
        subs.append((round(t - 0.05, 3), round(t + len(c) / SR + 0.05, 3), disp))
        t += len(c) / SR + GAP
    print(f"section {a:5.2f}-{b:5.2f}: speech {dur:4.2f}s tempo {tempo:.2f}")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", OUT], input=voice.tobytes(), check=True)
for k in range(len(subs) - 1):  # never overlap the next line
    subs[k] = (subs[k][0], min(subs[k][1], subs[k + 1][0] - 0.02), subs[k][2])
json.dump(subs, open(SUBS_OUT, "w"), ensure_ascii=False, indent=1)
for s in subs: print(s)
