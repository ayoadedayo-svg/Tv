#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out/seg5
node tools/audio5.mjs
node tools/render.mjs --port 8831 --debug 9501 --page index5.html --from 0 --to 10 --out out/seg5/a.mp4 > out/seg5/a.log 2>&1 &
A=$!
node tools/render.mjs --port 8832 --debug 9502 --page index5.html --from 10 --to 20 --out out/seg5/b.mp4 > out/seg5/b.log 2>&1 &
B=$!
wait $A $B
printf "file 'a.mp4'\nfile 'b.mp4'\n" > out/seg5/list.txt
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i out/seg5/list.txt -c copy out/picture5.mp4
ffmpeg -hide_banner -nostats -i out/score5.wav -af "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json" -f null - 2> out/loudness5.json || true
read -r MI MT ML MTH MO < <(python3 - <<'PY'
import json, re
s = open('out/loudness5.json').read()
m = re.search(r'\{[^{}]*"input_i"[\s\S]*?\}', s)
d = json.loads(m.group(0))
print(d['input_i'], d['input_tp'], d['input_lra'], d['input_thresh'], d['target_offset'])
PY
)
ffmpeg -y -hide_banner -loglevel error -i out/picture5.mp4 -i out/score5.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=9:measured_I=$MI:measured_TP=$MT:measured_LRA=$ML:measured_thresh=$MTH:offset=$MO:linear=true" \
  -c:a aac -b:a 320k -ar 48000 -movflags +faststart -shortest out/dumbtv-24h-v5.mp4
ffmpeg -y -hide_banner -loglevel error -ss 9.5 -i out/dumbtv-24h-v5.mp4 -frames:v 1 out/poster-v5.png
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of default=nw=1 out/dumbtv-24h-v5.mp4
ffmpeg -hide_banner -nostats -i out/dumbtv-24h-v5.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -A2 -E "Integrated|True peak" | head -8
