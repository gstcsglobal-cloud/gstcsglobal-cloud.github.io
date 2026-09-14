#!/usr/bin/env bash
# 한 구간만 뽑아 본다 — 장면 하나 고치고 59초를 통째로 다시 찍지 않기 위해서다.
#   ./clip.sh 53.2 59.0 end.mp4          제출본 축 기준 구간
#   MODE=short ./clip.sh 39.6 45.0 x.mp4
set -euo pipefail; cd "$(dirname "$0")"
export NODE_PATH=${NODE_PATH:-/opt/node22/lib/node_modules}
A=$1; B=$2; OUT=${3:-clip.mp4}; MODE=${MODE:-full}; FPS=30; SS=${SS:-3}
# 변형 모드(v22~)도 그대로 받는다 — render.sh 와 같은 표
case "$MODE" in
  short) BGM=bgm-short.wav;;
  fullA) BGM=bgm-fullA.wav;;
  fullB) BGM=bgm-fullB.wav;;
  fullC) BGM=bgm-fullC.wav;;
  *)     BGM=bgm.wav;;
esac
QUERY=$([ "$MODE" = full ] && echo "" || echo "?mode=$MODE")
N=$(python3 -c "print(round(($B-$A)*$FPS*$SS))")
FF=${FFMPEG:-$(command -v ffmpeg || python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")}
EXE=${CHROME:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}
echo "▶ clip ${A}~${B}초 · ${N}프레임 → $OUT"
[ -f "$BGM" ] || node bgm.cjs "$MODE"
HTML=scene.html QUERY="$QUERY" K=2 OUT=cframes FPS=$((FPS*SS)) FRAMES=$N START=$A EXE="$EXE" node par.cjs
VF="fps=$FPS"; [ "$SS" -gt 1 ] && VF="tmix=frames=$SS,fps=$FPS"
# 최종 그레이딩(render.sh 의 GRADEF 와 «같은 사슬»)을 기본 적용 — 미리보기가 최종 룩과 같아야
# 무드 판단이 맞는다. 끄기는 GRADE=0. ⚠ render.sh 쪽을 바꾸면 여기도 같이.
GRADEF="curves=master='0/0 0.22/0.202 0.78/0.79 1/1',colorbalance=rs=-0.02:bs=0.015:rm=-0.008:bm=0.006,vignette=a=PI/7,noise=alls=4:allf=t+u"
[ "${GRADE:-1}" = 1 ] && VF="$VF,$GRADEF"
"$FF" -y -loglevel error -framerate $((FPS*SS)) -i cframes/frame_%05d.png -vf "$VF" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart _cv.mp4
"$FF" -y -loglevel error -i _cv.mp4 -ss "$A" -i "$BGM" -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$OUT"
rm -rf cframes _cv.mp4
"$FF" -hide_banner -i "$OUT" 2>&1 | grep -E "Duration" || true
