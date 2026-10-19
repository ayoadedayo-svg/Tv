# 24 hours — the second film

20.2 s, 1920×1080, 60 fps, 100 BPM. Rendered from code with
[cinetic](https://github.com/Leonxlnx/cinetic) (Remotion 4 driving headless
Chromium) and scored with cinetic's mixer over an
[earshot](https://github.com/Leonxlnx/earshot) sound kit. There is no editor
project, no stock footage and no downloaded music: the picture is React, the
sound is designed in code.

Output: `../out/dumbtv-24h.mp4` (and `dumbtv-24h-poster.png`), both git-ignored.

## What it says

One object, a television, for the whole film: it draws itself, it is full of
somebody else's tiles, the tiles leave, and it ends as the rule under the
wordmark.

| bar | time | picture | copy |
|---|---|---|---|
| 1 | 0.0 | the screen draws, tiles arrive | 24 hours. |
| 2 | 2.4 | tiles leave, left to right | six strangers. |
| 3 | 4.8 | tiles almost gone | six fixes. |
| 4 | 7.2 | the screen is empty and pulses | 309 stars. |
| 5 | 9.6 | empty screen | no ads. |
| 6 | 12.0 | empty screen | no shorts. |
| 7 | 14.4 | the screen floods cobalt — it is yours | your tv. |
| 8 | 16.8 | the object becomes the rule | dumbtv |
| 9 | 19.2 | hold | github.com/humblemuzzu/dumbtv |

## Rebuild

```sh
npm install
npm run check                 # tsc + lint-film + grid-check: must pass
npx remotion still Film out/stills/f.png --frame=900

npm run cues                  # out/cues.json from src/sync.ts

# sound: needs earshot for the kit (pure DSP, no models)
pip install numpy scipy soundfile soxr pyloudnorm
PYTHONPATH=/path/to/earshot EARSHOT_PYTHON=$(which python) npm run kit
PATH=$(dirname $(which python)):$PATH npm run audio

PATH=$(dirname $(which python)):$PATH bash scripts/render.sh Film out/film.mp4 \
  --audio public/audio/soundtrack.wav
```

`render.sh` ends on two gates and fails if either does: `probe.py` (size, fps,
yuv420p, BT.709, AAC 48 kHz) and `check-sync.py` (audio lag ≤ 48 samples, true
peak ≤ −1 dBTP).

## What was measured, not guessed

- **Audio** −18.0 LUFS integrated (cinetic's default for an effects-only film),
  true peak −2.3 dBTP, LRA 7.1 LU. Channels within 0.5 dB of each other — the
  mono-left bug in the first film is gone.
- **Loudest moment** is the screen emptying at 10.3 s (50 % of the film), not the
  logo: the ending subtracts.
- **Timing** every cut on the 100 BPM grid (36 f per beat, 144 f per bar); the
  grid-check passes with 0 errors and text on screen 64 % of the runtime.
- **The first cut had a bug worth naming**: "24 hours." and "six strangers."
  were on screen together for 18 frames, because each fragment's exit began 6 f
  before the next entered, while the exit itself takes 30 f. Fixed by ending each
  fragment 30 f before the next.

## Credits

Picture and sound engine: [cinetic](https://github.com/Leonxlnx/cinetic) (MIT).
Sound kit: [earshot](https://github.com/Leonxlnx/earshot).
Typeface: Geist, vendored via `@fontsource-variable/geist`.
