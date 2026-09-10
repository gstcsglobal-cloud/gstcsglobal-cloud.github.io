#!/usr/bin/env python3
"""회사 CI(흰 바탕 PNG)를 어두운 배경용 반전본으로 만든다.

  python3 make-logo.py <원본.png> [출력디렉터리=logos]

흰 바탕에 찍힌 로고는 «관측 = 잉크×a + 흰색×(1−a)» 이므로 a = 1 − min(채널)/255 로 잉크 커버리지를
구하고 거기서 원색을 역산한다. 임계값으로 자르면 가장자리 안티에일리어싱이 계단이 되므로 쓰지 않는다.

반전본은 «로고를 다시 그리는 것»이 아니라 표준 knockout 이다 — 밝은 파랑 마크는 파랑으로 남기고
나머지 잉크만 흰색으로 바꿔 원본의 2단 색 구분을 지킨다.
⚠ CI 가이드에 공식 반전 버전이 있으면 그것을 쓰는 편이 맞다.
"""
import sys, os
import numpy as np
from PIL import Image

src_path = sys.argv[1] if len(sys.argv) > 1 else 'gst.png'
out_dir = sys.argv[2] if len(sys.argv) > 2 else 'logos'
os.makedirs(out_dir, exist_ok=True)

rgb = np.asarray(Image.open(src_path).convert('RGB')).astype(float)
a = np.clip(1.0 - rgb.min(axis=2) / 255.0, 0, 1)                 # 잉크 커버리지
safe = np.maximum(a, 1e-3)[..., None]
fg = np.clip((rgb - 255.0 * (1 - safe)) / safe, 0, 255)          # 흰 바탕을 걷어낸 원색

ys, xs = np.where(a > 0.06)                                       # 여백 잘라내기
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
A, F = a[y0:y1, x0:x1], fg[y0:y1, x0:x1]

Image.fromarray(np.dstack([F, A * 255]).astype(np.uint8), 'RGBA').save(f'{out_dir}/gst-original.png')

mark = (F[..., 2] > 150) & (F[..., 2] - F[..., 0] > 60) & (A > 0.15)   # 밝은 파랑 = 마크
rev = np.full_like(F, 255.0)
rev[mark] = np.array([120, 152, 255])
Image.fromarray(np.dstack([rev, A * 255]).astype(np.uint8), 'RGBA').save(f'{out_dir}/gst-white.png')

print(f'{src_path} {rgb.shape[1]}×{rgb.shape[0]} → {out_dir}/gst-original.png · {out_dir}/gst-white.png '
      f'({x1-x0}×{y1-y0}, 마크 {int(mark.sum())}px / 잉크 {int((A>0.15).sum())}px)')
