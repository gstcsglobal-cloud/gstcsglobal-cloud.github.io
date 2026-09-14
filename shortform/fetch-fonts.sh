#!/usr/bin/env bash
# 한글 폰트를 구글 폰트에서 받는다(저장소에는 안 둔다 — 20MB). scene.html 이 fonts/ 를 본다.
set -euo pipefail; cd "$(dirname "$0")"; mkdir -p fonts
get(){ local fam="$1" out="$2"; local u; u=$(curl -sS -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=$fam&display=swap" | grep -oE "https://fonts.gstatic.com/[^)]+" | head -1); curl -sS -o "fonts/$out" "$u"; echo "fonts/$out $(stat -c %s "fonts/$out") bytes"; }
for W in 400 700 900; do get "Noto+Sans+KR:wght@$W" "NotoSansKR-$W.ttf"; done
get "Black+Han+Sans" "BlackHanSans.ttf"
