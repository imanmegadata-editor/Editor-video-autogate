# AUTOGATE MODEL 880 — Vertical review edit (9:16)

Final video: `output/AUTOGATE_MODEL_880_Review_9x16.mp4` (1080×1920, 30 fps, H.264 + AAC, ~26.5 s)
Malay voice-over + Malay subtitles (also burned in): `output/AUTOGATE_MODEL_880_subtitles_ms.srt`

## Source footage
`NEW - REMOTE FUNCTION (CHINESE).mp4` from the Drive folder *MODEL DNOR TURBO 880*
(the 1080×1918 version of the remote-function demo with Mandarin narration).
The footage is only reframed (crop / slow push-ins) and lightly colour graded; the hardware is not altered.
The framing keeps the original burned-in Chinese subtitles out of frame so the Malay subtitles replace them.
The Mandarin narration is replaced by a Malay voice-over (espeak-ng + MBROLA `ma1` Malay voice); the original audio is kept only for the real alarm-sound demo.

## Structure
| Time | Section |
|---|---|
| 0:00–0:03 | Opening title: AUTOGATE · MODEL 880 |
| 0:03–0:05 | Lower third + bottom two buttons (beep on/off) |
| 0:08–0:11 | Infrared sensor (pengesan inframerah) note |
| 0:11–0:14.6 | Top two buttons — force close |
| 0:14.8–0:18.5 | Right two buttons — trigger alarm |
| 0:18.7–0:20.2 | Real alarm sound demo (audio-reactive meter) |
| 0:20.3–0:22.9 | Red button — stop alarm |
| 0:22.9–0:26.5 | Closing: PINTAR. SELAMAT. TERJAMIN. |

All feature callouts come only from what the original narration/on-screen text states.

## Rebuild
```
pip install numpy pillow scipy        # ffmpeg required
apt-get install espeak-ng mbrola mbrola-ma1
cd build
python3 make_voice_ms.py voice_ms.wav subs_ms.json
python3 make_audio.py   <source.mp4> voice_ms.wav audio.wav
python3 render_video.py <source.mp4> audio.wav ../output/AUTOGATE_MODEL_880_Review_9x16.mp4
```
Music and sound effects are synthesized in `make_audio.py` (no third-party audio).
