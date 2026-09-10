// 장면 순서와 길이 — 브라우저(scene.html)와 Node(bgm.cjs)가 «같은 표»를 본다.
// 두 벌로 복사하면 반드시 갈라진다: 그림은 새 시각, 소리는 옛 시각으로 돌아 입이 안 맞는다.
//
// base  = «큐 기준» 타임베이스. scene.html·bgm.cjs 의 모든 시각이 이 축에 적혀 있다.
//         길이를 바꿔도 이 축은 그대로 두므로 큐를 다시 적을 필요가 없다.
// full  = 제출본(59초)  ·  short = 짧은 버전(45초, 0 이면 그 장면을 통째로 뺀다)
//         ⚠ base 보다 짧게 만들면 그 장면의 «애니메이션이 그만큼 빨라진다».
//           글자가 많은 장면(reveal·close·lead)은 15% 넘게 줄이지 않는다. 지도·계단은 그림뿐이라 더 줄여도 된다.
(function () {
  const SCENES = [
    { k: 'hook',    base: 4.0, full: 3.5, short: 3.0 },  // 「지난 25년, 아무 일도 안 일어났습니다」
    { k: 'nothing', base: 2.4, full: 2.0, short: 0   },  // 굴러가는 풀 — 짧은 버전에서 뺀다
    { k: 'silane',  base: 3.4, full: 3.4, short: 3.3 },  // 불, 안 붙었습니다
    { k: 'sf6',     base: 3.4, full: 3.4, short: 0   },  // 안 남았습니다 — 네 박자 중 하나를 뺀다
    { k: 'chill',   base: 3.4, full: 3.4, short: 3.3 },  // 안 흔들렸습니다(칠러)
    { k: 'stop',    base: 3.4, full: 3.4, short: 3.3 },  // 안 멈췄습니다
    { k: 'reveal',  base: 4.8, full: 4.4, short: 4.2 },  // 스크러버와 칠러가 있었습니다
    { k: 'pivot',   base: 2.0, full: 1.8, short: 1.4 },
    { k: 'found',   base: 4.0, full: 3.7, short: 3.2 },  // 2001.10.01 창업
    { k: 'kosdaq',  base: 3.6, full: 3.4, short: 0   },  // 코스닥 상장 — 짧은 버전에서 뺀다
    { k: 'map',     base: 5.2, full: 4.6, short: 3.4 },  // 여섯 나라(그림뿐이라 더 줄여도 읽힌다)
    { k: 'stairs',  base: 4.2, full: 3.8, short: 3.0 },  // 수출의 탑
    { k: 'future',  base: 3.2, full: 3.2, short: 2.8 },  // 다음 25년 — 액침냉각
    { k: 'lead',    base: 5.2, full: 5.2, short: 4.8 },  // 공로 — 가장 많이 지킨다
    { k: 'close',   base: 4.6, full: 4.4, short: 4.0 },
    { k: 'end',     base: 5.4, full: 5.4, short: 5.3 },
  ];

  // mode('full'|'short') → 큐 기준 T0 · 출력 T · 각 길이
  function build(mode) {
    const T0 = {}, T = {};
    let a0 = 0, a = 0;
    for (const s of SCENES) {
      T0[s.k] = [+a0.toFixed(3), +(a0 + s.base).toFixed(3)]; a0 += s.base;
      const d = mode === 'short' ? s.short : s.full;
      if (d > 0) { T[s.k] = [+a.toFixed(3), +(a + d).toFixed(3)]; a += d; }
    }
    return { mode, T0, T, DUR0: +a0.toFixed(3), DUR: +a.toFixed(3) };
  }

  // 출력 시각 → 그 장면의 «큐 기준» 시각. 큐를 다시 적지 않아도 되게 하는 열쇠다.
  function toFull(tOut, k, P) {
    const [a0, b0] = P.T0[k], [a, b] = P.T[k];
    return a0 + (tOut - a) * ((b0 - a0) / (b - a));
  }

  // 큐 기준 시각 → 출력 시각. 빠진 장면의 큐는 null 을 돌려 «소리도 함께» 빠지게 한다.
  function toOut(tFull, P) {
    for (const k in P.T0) {
      const [a0, b0] = P.T0[k];
      if (tFull >= a0 && tFull < b0) {
        if (!P.T[k]) return null;
        const [a, b] = P.T[k];
        return a + (tFull - a0) * ((b - a) / (b0 - a0));
      }
    }
    return tFull >= P.DUR0 ? P.DUR : null;
  }

  const API = { SCENES, build, toFull, toOut };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof globalThis !== 'undefined') globalThis.TL = API;
})();
