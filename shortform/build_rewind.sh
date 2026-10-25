#!/bin/bash
# CUT05 «역재생» — 1막(CUT01~04)을 거꾸로 감는다. 새 렌더가 없는 유일한 컷이다.
#   ⚠ 소재를 새로 만들지 않는 것이 이 컷의 내용이다 — «같은 사건이 되감긴다»가 읽히려면
#     관객이 방금 본 그 화면이어야 한다. 비슷한 다른 그림을 쓰면 그냥 다른 컷이 된다.
#   재난은 01→04 순서로 벌어졌으므로 되감기는 04→01 이고, 각 클립도 내부가 뒤집힌다.
#   2.2초에 8초를 담으므로 약 3.7배속이다 — setpts 로 한 번에 줄인다.
set -eu
cd "$(dirname "$0")"
for f in s7_dark s7_wafer s7_stop s7_alarm; do
  [ -f "footage/$f.webm" ] || { echo "없음: footage/$f.webm — 먼저 3d/render_cuts.sh"; exit 1; }
done
ffmpeg -y -loglevel error \
  -i footage/s7_dark.webm -i footage/s7_wafer.webm -i footage/s7_stop.webm -i footage/s7_alarm.webm \
  -filter_complex "[0:v]reverse[a];[1:v]reverse[b];[2:v]reverse[c];[3:v]reverse[d];\
[a][b][c][d]concat=n=4:v=1:a=0[cat];\
[cat]setpts=(2.2/8.0)*PTS,fps=30,\
curves=master='0/0 0.22/0.202 0.78/0.79 1/1',colorbalance=rs=-0.02:bs=0.015:rm=-0.008:bm=0.006,vignette=a=PI/7[v]" \
  -map "[v]" -t 2.2 -c:v libvpx-vp9 -crf 26 -b:v 0 -row-mt 1 -pix_fmt yuv420p footage/c05_rewind.webm
echo "OK c05_rewind ($(ffprobe -v error -show_entries format=duration -of default=nw=1 footage/c05_rewind.webm))"
