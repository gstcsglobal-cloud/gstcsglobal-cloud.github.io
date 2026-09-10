#!/usr/bin/env bash
# 숏폼 렌더: scene.html(window.seek) → PNG 1,680장 → libx264 MP4 → BGM mux
# 사용: ./render.sh [out.mp4]   (필요: node + playwright + chromium, ffmpeg(libx264·aac), fonts/ = ./fetch-fonts.sh)
set -euo pipefail; cd "$(dirname "$0")"
OUT=${1:-GST_25th_nothing_happened.mp4}; FPS=30; DUR=59
SS=${SS:-3}                 # 시간 슈퍼샘플링 배수 = 모션블러. SS=1 이면 끈다(빠르지만 빠른 움직임이 끊겨 보인다)
N=$((FPS*DUR*SS))
FF=${FFMPEG:-$(command -v ffmpeg || python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")}
EXE=${CHROME:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}
[ -f fonts/NotoSansKR-900.ttf ] || ./fetch-fonts.sh
[ -f bgm.wav ] || node bgm.cjs                                   # BGM·효과음 합성(OfflineAudioContext)
HTML=scene.html K=2 OUT=frames FPS=$((FPS*SS)) FRAMES=$N EXE="$EXE" node par.cjs   # 프레임 캡처(페이지 2개 샤딩)
# SS 배로 찍은 프레임을 tmix 로 평균해 «셔터»를 만든다 — 굴러가는 풀·웨이퍼·색종이가 끊겨 보이지 않는다
VF="fps=$FPS"; [ "$SS" -gt 1 ] && VF="tmix=frames=$SS,fps=$FPS"
"$FF" -y -loglevel error -framerate $((FPS*SS)) -i frames/frame_%05d.png -vf "$VF" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart video_only.mp4
# 라우드니스 정규화(-16 LUFS) — 행사장 PA 에서 «소리가 작다» 소리를 안 듣기 위해서다
"$FF" -y -loglevel error -i video_only.mp4 -i bgm.wav -c:v copy -af "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=58.5:d=0.5" -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
rm -rf frames video_only.mp4; "$FF" -hide_banner -i "$OUT" 2>&1 | grep -E "Duration|Stream" || true
