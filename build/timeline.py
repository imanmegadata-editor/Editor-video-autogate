"""Shared timeline for the AUTOGATE MODEL 880 review edit.

All "src" times are seconds in the original footage (NEW - REMOTE FUNCTION (CHINESE).mp4).
Narration is a Malay voice-over (make_voice_ms.py); the original audio is kept only for the alarm demo.
Output time = INTRO + src time for the main section.
"""
FPS = 30
W, H = 1080, 1920
INTRO = 3.0          # cinematic title before the footage starts
SRC_DUR = 19.866     # length of the original clip
OUTRO = 3.6          # closing title
TOTAL = INTRO + SRC_DUR + OUTRO

import json, os
ALARM = (15.7, 17.15)   # the real alarm sound in the demo (original audio kept here)

# Malay subtitles = exact timings of the Malay voice-over lines (written by make_voice_ms.py).
# {..} = cyan keyword (controls), <..> = amber keyword (result)
SUBS = [tuple(x) for x in json.load(open(os.path.join(os.path.dirname(__file__), "subs_ms.json")))]

# Regions with narration or demo sound (used for music ducking)
VOICE = [(a + 0.05, b - 0.05) for a, b, _ in SUBS] + [ALARM]

# Callout appearances (src time) - used for graphics and soft UI sound cues
CALLOUTS = [0.25, SUBS[1][0], SUBS[3][0], SUBS[5][0], SUBS[7][0], ALARM[0], SUBS[9][0]]
