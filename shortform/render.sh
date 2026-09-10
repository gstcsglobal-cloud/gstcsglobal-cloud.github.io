#!/usr/bin/env bash
# 숏폼 렌더: scene.html(window.seek) → PNG → libx264 MP4 → BGM mux → poster.png
#   ./render.sh                 제출본 59초
#   MODE=short ./render.sh      짧은 버전 45초
#   SS=1 ./render.sh            모션블러 끄고 3배 빠르게(미리보기용)
# 필요: node + playwright + chromium, ffmpeg(libx264·aac), fonts/ (= ./fetch-fonts.sh)
set -euo pipefail; cd "$(dirname "$0")"
export NODE_PATH=${NODE_PATH:-/opt/node22/lib/node_modules}
MODE=${MODE:-full}; FPS=30; SS=${SS:-3}      # SS = 시간 슈퍼샘플링 배수(모션블러)
DUR=$(node -e "console.log(require('./timeline.js').build('$MODE').DUR)")   # 길이는 timeline.js 가 정본
OUT=${1:-GST_25th_nothing_happened$([ "$MODE" = short ] && echo _45s || echo "").mp4}
BGM=$([ "$MODE" = short ] && echo bgm-short.wav || echo bgm.wav)
QUERY=$([ "$MODE" = short ] && echo "?mode=short" || echo "")
N=$(python3 -c "print(round($DUR*$FPS*$SS))")
FF=${FFMPEG:-$(command -v ffmpeg || python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")}
EXE=${CHROME:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}
echo "▶ $MODE · ${DUR}초 · ${N}프레임(SS=$SS) → $OUT"
[ -f fonts/NotoSansKR-900.ttf ] || ./fetch-fonts.sh
[ -f "$BGM" ] || node bgm.cjs "$MODE"                                       # BGM·효과음 합성
HTML=scene.html QUERY="$QUERY" K=2 OUT=frames FPS=$((FPS*SS)) FRAMES=$N EXE="$EXE" node par.cjs
# SS 배로 찍은 프레임을 tmix 로 평균해 «셔터»를 만든다 — 굴러가는 풀·웨이퍼·색종이가 끊겨 보이지 않는다
VF="fps=$FPS"; [ "$SS" -gt 1 ] && VF="tmix=frames=$SS,fps=$FPS"
"$FF" -y -loglevel error -framerate $((FPS*SS)) -i frames/frame_%05d.png -vf "$VF" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart video_only.mp4
# 라우드니스 정규화(-16 LUFS) — 행사장 PA 에서 «소리가 작다» 소리를 안 듣기 위해서다
FADE=$(python3 -c "print(round($DUR-0.5,2))")
"$FF" -y -loglevel error -i video_only.mp4 -i "$BGM" -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=$FADE:d=0.5" -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$OUT"
# 제출·상영 목록용 대표 이미지(첫 프레임은 페이드인이라 검다)
"$FF" -y -loglevel error -ss $(python3 -c "print(round($DUR-2.2,2))") -i "$OUT" -frames:v 1 "${OUT%.mp4}_poster.png"
rm -rf frames video_only.mp4
"$FF" -hide_banner -i "$OUT" 2>&1 | grep -E "Duration|Stream" || true
