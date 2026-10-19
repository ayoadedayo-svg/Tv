#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p out/seg3
rm -f out/seg3/*.mp4 out/seg3/list.txt

echo "== score"
node tools/audio3.mjs

echo "== picture"
node tools/render.mjs --port 8821 --debug 9491 --page index3.html --from 0 --to 9.3 --out out/seg3/a.mp4 > out/seg3/a.log 2>&1 &
A=$!
node tools/render.mjs --port 8822 --debug 9492 --page index3.html --from 9.3 --to 18.6 --out out/seg3/b.mp4 > out/seg3/b.log 2>&1 &
B=$!
wait $A $B

printf "file 'a.mp4'\nfile 'b.mp4'\n" > out/seg3/list.txt
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i out/seg3/list.txt -c copy out/picture3.mp4

echo "== loudness"
ffmpeg -hide_banner -nostats -i out/score3.wav \
  -af "loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json" -f null - 2> out/loudness3.json || true
read -r MI MT ML MTH MO < <(python3 - <<'PY'
import json, re
s = open('out/loudness3.json').read()
m = re.search(r'\{[^{}]*"input_i"[\s\S]*?\}', s)
d = json.loads(m.group(0))
print(d['input_i'], d['input_tp'], d['input_lra'], d['input_thresh'], d['target_offset'])
PY
)
echo "  measured I=$MI TP=$MT LRA=$ML"

ffmpeg -y -hide_banner -loglevel error \
  -i out/picture3.mp4 -i out/score3.wav \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy \
  -af "loudnorm=I=-14:TP=-1.5:LRA=9:measured_I=$MI:measured_TP=$MT:measured_LRA=$ML:measured_thresh=$MTH:offset=$MO:linear=true" \
  -c:a aac -b:a 320k -ar 48000 \
  -movflags +faststart -shortest \
  out/dumbtv-24h-fast.mp4

echo "== poster"
ffmpeg -y -hide_banner -loglevel error -ss 11.6 -i out/dumbtv-24h-fast.mp4 -frames:v 1 out/poster-24h.png

echo "== result"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate,channels -of default=nw=1 out/dumbtv-24h-fast.mp4
ffmpeg -hide_banner -nostats -i out/dumbtv-24h-fast.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -A2 -E "Integrated|True peak" | head -8
