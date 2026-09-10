// 장면 순서와 길이 — 브라우저(scene.html)와 Node(bgm.cjs)가 «같은 표»를 본다.
// 두 벌로 복사하면 반드시 갈라진다: 그림은 새 시각, 소리는 옛 시각으로 돌아 입이 안 맞는다.
//
// cue0  = 그 장면의 큐가 «적혀 있는» 축의 시작점. scene.html·bgm.cjs 의 모든 시각이 이 축이다.
//         ⚠ 장면을 새로 끼워 넣을 때 기존 cue0 을 절대 건드리지 않는다 — 그러면 큐를 전부 다시 적어야 한다.
//            새 장면은 축의 «끝»에 자리를 잡는다(names 가 62.2 인 이유). 표시 순서는 이 배열 순서다.
// base  = 큐가 상정한 길이 · full = 제출본(59초) · short = 짧은 버전(45초, 0 이면 통째로 뺀다)
//         ⚠ base 보다 짧게 만들면 그 장면의 애니메이션이 그만큼 빨라진다.
//           글자가 많은 장면(reveal·names·close·lead)은 20% 넘게 줄이지 않는다. 지도·계단은 그림뿐이라 더 줄여도 된다.
(function () {
  const SCENES = [
    { k: 'hook',    cue0:  0.0, base: 4.0, full: 3.2, short: 2.8 },
    { k: 'nothing', cue0:  4.0, base: 2.4, full: 1.6, short: 0   },
    { k: 'silane',  cue0:  6.4, base: 3.4, full: 3.35, short: 3.2 },
    { k: 'sf6',     cue0:  9.8, base: 3.4, full: 3.35, short: 0   },
    { k: 'chill',   cue0: 13.2, base: 3.4, full: 3.35, short: 3.2 },
    { k: 'stop',    cue0: 16.6, base: 3.4, full: 3.35, short: 3.2 },
    { k: 'reveal',  cue0: 20.0, base: 4.8, full: 4.1, short: 3.8 },
    { k: 'names',   cue0: 62.2, base: 3.0, full: 3.0, short: 2.6 },   // ← 새 장면(큐는 축 끝에)
    { k: 'pivot',   cue0: 24.8, base: 2.0, full: 1.8, short: 1.4 },
    { k: 'found',   cue0: 26.8, base: 4.0, full: 3.5, short: 3.0 },
    { k: 'kosdaq',  cue0: 30.8, base: 3.6, full: 3.2, short: 0   },
    { k: 'map',     cue0: 34.4, base: 5.2, full: 4.2, short: 3.0 },
    { k: 'stairs',  cue0: 39.6, base: 4.2, full: 3.5, short: 2.7 },
    { k: 'future',  cue0: 43.8, base: 3.2, full: 3.2, short: 2.7 },
    { k: 'lead',    cue0: 47.0, base: 5.2, full: 5.0, short: 4.6 },
    { k: 'close',   cue0: 52.2, base: 4.6, full: 4.2, short: 3.8 },
    { k: 'end',     cue0: 56.8, base: 5.4, full: 5.1, short: 5.0 },
  ];

  function build(mode) {
    const T0 = {}, T = {};
    let a = 0, dur0 = 0;
    for (const s of SCENES) {
      T0[s.k] = [s.cue0, +(s.cue0 + s.base).toFixed(3)]; dur0 = Math.max(dur0, s.cue0 + s.base);
      const d = mode === 'short' ? s.short : s.full;
      if (d > 0) { T[s.k] = [+a.toFixed(3), +(a + d).toFixed(3)]; a += d; }
    }
    return { mode, T0, T, DUR0: +dur0.toFixed(3), DUR: +a.toFixed(3) };
  }

  // 출력 시각 → 그 장면의 «큐 축» 시각. 큐를 다시 적지 않아도 되게 하는 열쇠다.
  function toFull(tOut, k, P) {
    const [a0, b0] = P.T0[k], [a, b] = P.T[k];
    return a0 + (tOut - a) * ((b0 - a0) / (b - a));
  }
  // 큐 축 시각 → 출력 시각. 빠진 장면의 큐는 null 이라 소리도 함께 빠진다.
  function toOut(tCue, P) {
    for (const k in P.T0) {
      const [a0, b0] = P.T0[k];
      if (tCue >= a0 && tCue < b0) {
        if (!P.T[k]) return null;
        const [a, b] = P.T[k];
        return a + (tCue - a0) * ((b - a) / (b0 - a0));
      }
    }
    return null;
  }
  const API = { SCENES, build, toFull, toOut };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof globalThis !== 'undefined') globalThis.TL = API;
})();
