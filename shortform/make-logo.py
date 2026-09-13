#!/usr/bin/env python3
"""회사 CI(흰 바탕 이미지)를 어두운 배경용 반전본으로 만든다.

  python3 make-logo.py <원본> [--name NAME] [--policy gst|keep|mono]
                              [--drop-last-band] [--out DIR]

  python3 make-logo.py gst.png                                  # GST (기본값 — 예전 동작 그대로)
  python3 make-logo.py est.jpg  --name est  --policy keep --drop-last-band
  python3 make-logo.py robo.jpg --name robocare --policy mono

흰 바탕에 찍힌 로고는 «관측 = 잉크×a + 흰색×(1−a)» 이므로 a = 1 − min(채널)/255 로 잉크 커버리지를
구하고 거기서 원색을 역산한다. 임계값으로 자르면 가장자리 안티에일리어싱이 계단이 되므로 쓰지 않는다.

반전본은 «로고를 다시 그리는 것»이 아니라 표준 knockout 이다 — 유채색 마크는 색을 남기고
무채색 잉크(검정·회색)만 흰색으로 바꿔 원본의 색 구분을 지킨다.
⚠ CI 가이드에 공식 반전 버전이 있으면 그것을 쓰는 편이 맞다.

⚠ **변환기는 여기 한 곳이다.** 계열사마다 스크립트를 복사하면 반드시 갈라진다(CLAUDE.md 제2원칙).
   새 로고는 «정책»을 고르는 것이지 코드를 새로 쓰는 것이 아니다.

⚠ **투명 PNG 가 아니어도 된다 — 흰 바탕 JPG 로 충분하다.** 이 스크립트의 전제가 «흰 바탕»이다.
   (GST 로고도 report/qbr-template.pptx 안의 흰 바탕 이미지에서 뽑았다.)
"""
import sys, os, argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser(add_help=True)
ap.add_argument('src', nargs='?', default='gst.png')
ap.add_argument('--name', default=None, help='출력 basename (기본: gst)')
ap.add_argument('--out', default='logos')
ap.add_argument('--policy', choices=['gst', 'keep', 'mono'], default='gst',
                help='gst=밝은 파랑 마크를 CI 파랑으로(예전 동작) · keep=유채색은 색 유지 · mono=전부 흰색')
ap.add_argument('--drop-last-band', action='store_true',
                help='맨 아래 «글자 띠»를 버린다(EST 의 Energy Solution Technology 처럼 '
                     '58px 슬롯에서 못 읽을 태그라인). 빈 줄로 갈린 마지막 덩어리를 뗀다')
ap.add_argument('--ink', type=float, default=0.06, help='여백 판정 잉크 커버리지')
a_ = ap.parse_args()
# 출력 이름은 «<name>.png = 화면이 쓰는 반전본 · <name>-original.png = 원색본» 이 규약이다.
# ⚠ GST 만 예외로 legacy 이름(gst-white.png)을 쓴다 — 배포된 scene.html 이 그 경로를 물고 있어
#   이름이 «계약»이다. 바꾸려면 scene.html·README 를 같이 고쳐야 하고, 얻는 것이 없다.
name = a_.name or 'gst'
rev_name = 'gst-white' if (a_.name is None and a_.policy == 'gst') else name
os.makedirs(a_.out, exist_ok=True)

rgb = np.asarray(Image.open(a_.src).convert('RGB')).astype(float)
a = np.clip(1.0 - rgb.min(axis=2) / 255.0, 0, 1)                 # 잉크 커버리지
safe = np.maximum(a, 1e-3)[..., None]
fg = np.clip((rgb - 255.0 * (1 - safe)) / safe, 0, 255)          # 흰 바탕을 걷어낸 원색

ys, xs = np.where(a > a_.ink)                                     # 여백 잘라내기
if len(ys) == 0:
    sys.exit(f'{a_.src}: 잉크가 없다 — 흰 바탕 이미지가 맞는지 확인할 것')
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
A, F = a[y0:y1, x0:x1], fg[y0:y1, x0:x1]

def row_bands(mask, gap):
    """잉크가 있는 행을 «빈 줄»로 갈라 띠 목록을 만든다. 빈 줄은 로고가 스스로 말해 주는 경계다."""
    row, bands, s = mask.any(axis=1), [], None
    for i, v in enumerate(row):
        if v and s is None: s = i
        if not v and s is not None and not row[i:i + gap].any():
            bands.append((s, i)); s = None
    if s is not None: bands.append((s, len(row)))
    return bands


# ── 태그라인 떼기.
# ⚠ 가로줄만으로는 못 가른다. EST 는 심볼이 왼쪽에서 «태그라인과 같은 행까지» 내려오므로
#    전 폭으로 행을 보면 띠가 하나로 붙어 버리고, 억지로 행을 자르면 심볼 아랫부분이 잘려 나간다.
#    → 심볼 오른쪽(글자 영역)에서만 띠를 찾고, 그 띠를 «그 영역에서만» 지운다. 심볼은 그대로 둔다.
if a_.drop_last_band:
    ink = A > a_.ink
    gap = max(2, int(ink.shape[0] * 0.03))
    col = ink.any(axis=0)
    # 심볼과 글자를 가르는 «세로 빈 칸» — 왼쪽 1/2 안에서 충분히 넓은 빈 칸을 찾는다
    split, run0 = 0, None
    for i in range(min(len(col), int(len(col) * 0.5))):
        if not col[i] and run0 is None: run0 = i
        if col[i] and run0 is not None:
            if i - run0 >= max(3, int(len(col) * 0.02)): split = i
            run0 = None
    region = ink[:, split:] if split else ink
    bands = row_bands(region, gap)
    if len(bands) >= 2:
        b0, b1 = bands[-1]
        A = A.copy()
        A[b0:b1, split:] = 0.0                                    # 글자 영역의 마지막 띠만 지운다
        ys2, xs2 = np.where(A > a_.ink)                           # 여백 다시 조이기
        A = A[ys2.min():ys2.max() + 1, xs2.min():xs2.max() + 1]
        F = F[ys2.min():ys2.max() + 1, xs2.min():xs2.max() + 1]
        print(f'  태그라인 제거: 글자 영역(x≥{split})의 띠 {len(bands)}개 중 마지막({b0}~{b1}행) 지움')
    else:
        print(f'  ⚠ 글자 영역(x≥{split})에서 띠가 {len(bands)}개뿐 — 태그라인을 못 찾았다. 원본 그대로 간다')

Image.fromarray(np.dstack([F, A * 255]).astype(np.uint8), 'RGBA').save(f'{a_.out}/{name}-original.png')

# ── 어두운 배경용 반전
if a_.policy == 'gst':
    # 예전 동작 그대로. GST CI 는 «밝은 파랑 마크 + 검정 글자»라 마크를 정해진 CI 파랑으로 바꾼다.
    # ⚠ 이 분기를 건드리면 이미 배포된 logos/gst-white.png 가 달라진다.
    mark = (F[..., 2] > 150) & (F[..., 2] - F[..., 0] > 60) & (A > 0.15)
    rev = np.full_like(F, 255.0)
    rev[mark] = np.array([120, 152, 255])
elif a_.policy == 'mono':
    # 흑백 단색 워드마크(ROBOCARE). 어두운 배경에서 옳은 반전은 «전부 흰색» 하나뿐이다.
    mark = np.zeros(A.shape, bool)
    rev = np.full_like(F, 255.0)
else:  # keep — 유채색은 색을 남기고 무채색 잉크만 흰색으로
    sat = F.max(axis=2) - F.min(axis=2)
    mark = (sat > 40) & (A > 0.15)
    rev = np.full_like(F, 255.0)
    # 어두운 바탕에서 보이도록 «가장 밝은 채널이 235 가 되게» 비례 확대한다 —
    # 색상(hue)과 채도비는 그대로다. 원색 그대로 두면 EST 의 파랑(#0072BC)이 남색 배경에 묻힌다.
    mx = np.maximum(F.max(axis=2), 1.0)[..., None]
    lift = np.clip(F * (235.0 / mx), 0, 255)
    rev[mark] = lift[mark]

Image.fromarray(np.dstack([rev, A * 255]).astype(np.uint8), 'RGBA').save(f'{a_.out}/{rev_name}.png')

print(f'{a_.src} {rgb.shape[1]}×{rgb.shape[0]} → {a_.out}/{name}-original.png · {a_.out}/{rev_name}.png '
      f'({F.shape[1]}×{F.shape[0]}, policy={a_.policy}, 색유지 {int(mark.sum())}px / 잉크 {int((A>0.15).sum())}px)')
