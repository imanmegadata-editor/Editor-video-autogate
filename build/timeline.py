"""Shared timeline for the AUTOGATE MODEL 880 review edit.

All "src" times are seconds in the original footage (NEW - REMOTE FUNCTION (CHINESE).mp4).
Output time = INTRO + src time for the main section.
Subtitle timings were taken from the speech phrases (digital-silence gaps) and the
on-screen text changes in the original footage, so they follow the spoken narration.
"""
FPS = 30
W, H = 1080, 1920
INTRO = 3.0          # cinematic title before the footage starts
SRC_DUR = 19.866     # length of the original clip
OUTRO = 3.6          # closing title
TOTAL = INTRO + SRC_DUR + OUTRO

# Speech / demo-sound regions in source time (used for music ducking)
VOICE = [(0.15, 1.8), (2.2, 3.3), (3.75, 4.85), (5.3, 6.65), (7.1, 7.7), (8.2, 9.85),
         (10.3, 11.4), (11.9, 13.75), (14.2, 15.25), (15.7, 17.15), (17.3, 19.3)]
ALARM = (15.7, 17.15)   # the real alarm sound in the demo

# Malay subtitles (src time). {..} = cyan keyword (controls), <..> = amber keyword (result)
SUBS = [
    (0.10, 2.05, "Tekan {dua butang bawah} serentak"),
    (2.15, 3.55, "Boleh <hidupkan> atau <matikan>"),
    (3.60, 5.15, "{bunyi bip} semasa pagar dibuka & ditutup"),
    (5.25, 6.85, "Apabila {sensor inframerah} terhalang,"),
    (6.90, 8.05, "pagar <tidak boleh ditutup>"),
    (8.15, 10.05, "Tekan {dua butang atas} serentak"),
    (10.10, 11.70, "untuk <paksa pagar ditutup>"),
    (11.80, 14.05, "Tekan {dua butang kanan} (atas & bawah) serentak"),
    (14.15, 15.50, "untuk <bunyikan penggera>"),
    (17.25, 19.60, "Tekan {butang merah} untuk <matikan penggera>"),
]

# Callout appearances (src time) - used for graphics and soft UI sound cues
CALLOUTS = [0.25, 2.2, 5.3, 8.2, 11.9, 15.7, 17.3]
