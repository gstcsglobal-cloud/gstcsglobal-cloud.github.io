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
  // v22(부장님 피드백 «화면 전환이 빠르다») — 삭제 후보 두 갈래를 «변형 모드»로 나란히 뽑는다.
  //   fullA = SF6 삭제(+2.4s 재분배) · fullB = 만담 삭제(+6.4s 재분배) ·
  //   fullC = 창업(퇴직금)·액침냉각 삭제(+8.5s) + 만담에 AI 음성(bgm.cjs 가 fullC 에서만 싣는다).
  //   재분배는 «초당 읽을 양이 많은 씬»부터: 성장곡선 > 지도 > 리빌 > 창업 > (B는 미래·클로즈·엔딩·훅까지).
  //   변형 키는 full 과 다른 값만 적는다 — 없으면 full 로 폴백. 0 은 «그 씬을 뺀다»(short 규약 그대로).
  //   ⚠ 스탬프 씬(실란·칠러·정지)은 안 늘린다 — 표시를 늘리면 클립이 슬로모가 되어 슬램이 물러진다.
  const SCENES = [
    { k: 'intro',   cue0: 66.0, base: 4.0, full: 4.3, short: 4.3 },   // 인트로 컷(CRT 페이크아웃) — 표시는 맨 앞 · ⚠ base 를 4.3 으로 늘리면 s6 의 큐(70.0)와 겹친다
    { k: 'hook',    cue0:  0.0, base: 4.0, full: 3.4, short: 2.5, fullA: 3.6, fullB: 3.8, fullC: 4.0 },
    { k: 's6',      cue0: 70.0, base: 6.4, full: 6.4, short: 5.0, fullB: 0,   fullC: 7.6 },   // 스크러버·칠러 만담(3D 캐릭터) · C: AI 음성이 자연 속도로 들어가는 예산(7.2→7.6 · end 가 0.4 내줬다)
    { k: 'silane',  cue0:  6.4, base: 3.4, full: 3.6, short: 3.2 },   // S1 컷 길이
    { k: 'sf6',     cue0:  9.8, base: 3.4, full: 2.4, short: 0,   fullA: 0 },   // S3 ctx 1.8 + 스탬프 홀드 0.6
    { k: 'chill',   cue0: 13.2, base: 3.4, full: 3.9, short: 3.4 },   // S2 컷 길이
    { k: 'stop',    cue0: 16.6, base: 3.4, full: 2.6, short: 2.6 },   // S4 컷 2.2(스탬프 착지 연장본) + 홀드 0.4
    { k: 'reveal',  cue0: 20.0, base: 4.8, full: 4.4, short: 3.4, fullA: 4.9, fullB: 5.4, fullC: 5.6 },
    { k: 'pivot',   cue0: 24.8, base: 2.0, full: 1.8, short: 1.2, fullC: 2.4 },
    { k: 'found',   cue0: 26.8, base: 4.0, full: 3.8, short: 2.0, fullA: 4.1, fullB: 4.6, fullC: 0 },
    { k: 'map',     cue0: 34.4, base: 5.2, full: 3.5, short: 2.6, fullA: 4.0, fullB: 4.4, fullC: 5.2 },   // 표시 순서를 kosdaq «앞»으로 (연대 일원화 · v19) · C: 킬포인트 문구를 위해 1:1
    { k: 'kosdaq',  cue0: 30.8, base: 3.6, full: 3.8, short: 3.0, fullA: 4.7, fullB: 5.0, fullC: 5.4 },   // 성장 3박: 상장 → 수출 1억불(2021) → 시총 1조(2026)
    { k: 'stairs',  cue0: 39.6, base: 4.2, full: 0,   short: 0   },   // v19: 별도 씬에서 빼고 성장 곡선의 이정표로 접었다
    { k: 'future',  cue0: 43.8, base: 3.9, full: 4.7, short: 3.2, fullB: 5.5, fullC: 0 },   // 3D 컷 3.9 + 홀드 — 성장 곡선이 2026에 닿은 뒤 받는 장면
    { k: 'close',   cue0: 52.2, base: 4.6, full: 4.6, short: 3.6, fullB: 5.3, fullC: 5.6 },
    { k: 'end',     cue0: 56.8, base: 6.3, full: 6.7, short: 5.9, fullB: 7.3, fullC: 7.3 },   // 로고 리빌: base 보다 길다(느려질 뿐 안 깨진다) · C: 0.4 를 s6 음성 예산으로 (7.7→7.3)
    // v20: base·표시 함께 +0.9 — 콘텐츠(마지막 큐 ~61.9)가 다 선 뒤 «홀드»가 생긴다.
    //      base 만 두고 표시만 늘리면 조립 자체가 느려진다 — 비율(≈1.06)을 지켜서 늘렸다.
  ];

  function build(mode) {
    const T0 = {}, T = {};
    let a = 0, dur0 = 0;
    for (const s of SCENES) {
      T0[s.k] = [s.cue0, +(s.cue0 + s.base).toFixed(3)]; dur0 = Math.max(dur0, s.cue0 + s.base);
      // 변형 키가 그 행에 적혀 있으면 그 값, 없으면 full 로 폴백(0 도 유효한 값이다 — truthy 검사 금지)
      const d = Object.prototype.hasOwnProperty.call(s, mode) ? s[mode] : s.full;
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
