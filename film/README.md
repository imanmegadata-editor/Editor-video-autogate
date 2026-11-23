# JANGAN PANDANG BELAKANG — 3D horror short (9:16, 1080×1920, 24 fps, ~70 s)

Fully procedural: every shot is rendered from a real-time Three.js scene in headless Chromium,
the dialogue is Malay TTS (espeak-ng + mbrola `ma1`) processed per character, and the whole
sound design (drones, insects, wind, engine, radio, heartbeat, bone cracks, stingers,
footsteps, panning whispers) is synthesized in `tools/audio.py`.

## Story / shot list
| Time | Shot | Beat |
|---|---|---|
| 0–4.4 | Rear-view mirror, flicker | Hook: a face in the mirror whispers *"Jangan pandang belakang"* → lightning flash |
| 4.4–6.2 | Banyan tree in fog | Title |
| 6.2–10 | Aerial, kampung road | *Kampung Sungai Mati • 02:00 pagi* |
| 10–19.6 | Amir driving / POV | "Dah pukul dua pagi…" — woman in white under the old tree |
| 19.6–24 | Roadside | Car passes; her neck turns 250° to stare at the camera |
| 24–35 | Radio static, mirror empty, jasmine smell | "Tumpang… saya…" |
| 35–46 | Mirror reveal, she leans to his ear, lights flicker, she's gone | "Hantar saya balik…" |
| 46–53.6 | Car stops: his own wrecked car against the tree; radio news of his death | Twist |
| 53.6–59.45 | He looks back — empty. Looks forward — she is in his face | "Kita dah sampai… Amir." Jump scare |
| 59.45–70 | Silence, footsteps behind *you*, eyes in the dark | "Sekarang… dia di belakang KAU." |

## Build
```
npm install                       # three, @fontsource/anton, @fontsource/creepster
apt-get install espeak-ng mbrola mbrola-ma1 ; pip install numpy scipy
python3 tools/gen_voice.py        # dialogue clips + lip-sync envelopes -> assets/voice
cp assets/voice/lines.json src/
python3 tools/audio.py            # assets/soundtrack.wav
node tools/render.js video out.mp4 0 70          # frames -> H.264
node tools/render.js stills dir 12 37 57.5       # preview stills
ffmpeg -i out.mp4 -i assets/soundtrack.wav -c:v copy -c:a aac -b:a 256k -shortest final.mp4
```
Timing lives in `src/timeline.json` (voice starts + subtitle styling, red words flagged with `1`).
