#!/usr/bin/env bash
# 한 구간만 뽑아 본다 — 장면 하나 고치고 59초를 통째로 다시 찍지 않기 위해서다.
#   ./clip.sh 53.2 59.0 end.mp4          제출본 축 기준 구간
#   MODE=short ./clip.sh 39.6 45.0 x.mp4
set -euo pipefail; cd "$(dirname "$0")"
export NODE_PATH=${NODE_PATH:-/opt/node22/lib/node_modules}
A=$1; B=$2; OUT=${3:-clip.mp4}; MODE=${MODE:-full}; FPS=30; SS=${SS:-3}
BGM=$([ "$MODE" = short ] && echo bgm-short.wav || echo bgm.wav)
QUERY=$([ "$MODE" = short ] && echo "?mode=short" || echo "")
N=$(python3 -c "print(round(($B-$A)*$FPS*$SS))")
FF=${FFMPEG:-$(command -v ffmpeg || python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")}
EXE=${CHROME:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}
echo "▶ clip ${A}~${B}초 · ${N}프레임 → $OUT"
[ -f "$BGM" ] || node bgm.cjs "$MODE"
HTML=scene.html QUERY="$QUERY" K=2 OUT=cframes FPS=$((FPS*SS)) FRAMES=$N START=$A EXE="$EXE" node par.cjs
VF="fps=$FPS"; [ "$SS" -gt 1 ] && VF="tmix=frames=$SS,fps=$FPS"
"$FF" -y -loglevel error -framerate $((FPS*SS)) -i cframes/frame_%05d.png -vf "$VF" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart _cv.mp4
"$FF" -y -loglevel error -i _cv.mp4 -ss "$A" -i "$BGM" -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$OUT"
rm -rf cframes _cv.mp4
"$FF" -hide_banner -i "$OUT" 2>&1 | grep -E "Duration" || true
