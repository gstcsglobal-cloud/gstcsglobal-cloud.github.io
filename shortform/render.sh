#!/usr/bin/env bash
# 숏폼 렌더: scene.html(window.seek) → PNG 1,680장 → libx264 MP4 → BGM mux
# 사용: ./render.sh [out.mp4]   (필요: node + playwright + chromium, ffmpeg(libx264·aac), fonts/ = ./fetch-fonts.sh)
set -euo pipefail; cd "$(dirname "$0")"
OUT=${1:-GST_25th_nothing_happened.mp4}; FPS=30; DUR=56; N=$((FPS*DUR))
FF=${FFMPEG:-$(command -v ffmpeg || python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")}
EXE=${CHROME:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}
[ -f fonts/NotoSansKR-900.ttf ] || ./fetch-fonts.sh
[ -f bgm.wav ] || node bgm.cjs                                   # BGM·효과음 합성(OfflineAudioContext)
HTML=scene.html K=2 OUT=frames FPS=$FPS FRAMES=$N EXE="$EXE" node par.cjs   # 프레임 캡처(페이지 2개 샤딩)
"$FF" -y -loglevel error -framerate $FPS -i frames/frame_%04d.png -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart video_only.mp4
"$FF" -y -loglevel error -i video_only.mp4 -i bgm.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
rm -rf frames video_only.mp4; "$FF" -hide_banner -i "$OUT" 2>&1 | grep -E "Duration|Stream" || true
