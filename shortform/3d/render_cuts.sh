#!/bin/bash
# 새 컷을 한 벌로 뽑는다. 프레임은 중간 산출물(.gitignore)이고 webm 만 남는다.
# ⚠ 코어가 4개라 3개까지만 동시에 돈다 — 더 띄우면 프레임당 시간이 그만큼 늘어 이득이 없다.
set -u
cd "$(dirname "$0")"
run(){  # run <키> <쿼리>
  local k=$1 q=$2
  PAGE="s7.html?$q&hq=1" FPS=30 OUT="f3d_$k" node shoot.cjs > "log_$k.txt" 2>&1
  local n=$(ls "f3d_$k" 2>/dev/null | wc -l)
  if [ "$n" -lt 10 ]; then echo "FAIL $k (frames=$n)"; return 1; fi
  ffmpeg -y -loglevel error -framerate 30 -i "f3d_$k/f_%04d.png" \
    -c:v libvpx-vp9 -crf 26 -b:v 0 -row-mt 1 -pix_fmt yuv420p "../footage/$k.webm"
  echo "OK $k ($n 프레임)"
}
export -f run
for job in "s7_alarm shot=alarm" "s7_stop shot=stop" "s7_wafer shot=wafer" \
           "s7_rowhq bb=0" "s7_pipe shot=pipe" "s7_burner shot=burner" \
           "s7_chiller shot=chiller" "s7_stack shot=stack" "s7_dark shot=dark"; do
  echo "$job"
done | xargs -P 3 -L 1 bash -c 'run $0 $1'
