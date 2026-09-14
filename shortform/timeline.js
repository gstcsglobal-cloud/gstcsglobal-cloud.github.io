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
  // v25 「없었던 하루」 — 14컷 45.5초. 옛 v1(16장면)에서 «순서와 길이»만 갈아끼웠다.
  //   ⚠ 기존 장면의 cue0 은 한 자리도 안 건드렸다. 건드리면 scene.html·bgm.cjs 에 적힌
  //     큐 시각을 전부 다시 써야 한다 — 새 컷은 축의 «끝»(78 이후)에 자리를 잡는다.
  //   ⚠ 표시 순서는 이 배열 순서다(큐 축 순서와 달라도 된다). 그래서 여기서 순서만 바꿔도
  //     영상의 컷 순서가 바뀐다.
  //   full: 0 은 «그 장면을 뺀다». v1 의 intro·hook·만담·창업·액침냉각 등이 여기서 빠진다.
  const SCENES = [
    // ── 1막 재난 (0:00–0:08.2) — 자막도 로고도 없다. 경보음이 8초를 묶는다.
    { k: 'c01',    cue0: 78.0, base: 2.4, full: 2.4, short: 2.4 },   // 열 전체 적색 경보 (3d/s7 ?emg=1)
    { k: 'c02',    cue0: 81.0, base: 2.0, full: 2.0, short: 2.0 },   // 위층 클린룸 공정 정지
    { k: 'c03',    cue0: 84.0, base: 2.0, full: 2.0, short: 2.0 },   // 온도가 풀린다 → 웨이퍼 폐기
    { k: 'c04',    cue0: 87.0, base: 1.8, full: 1.6, short: 1.6 },   // 팹 소등 + 완전 무음 0.4
    // ── 2막 반전 (0:08.2–0:14)
    { k: 'c05',    cue0: 90.0, base: 2.2, full: 2.2, short: 2.2 },   // 역재생(편집만)
    { k: 'c06',    cue0: 93.0, base: 3.8, full: 3.8, short: 3.8 },   // 같은 열, 백색 + 「경보 다음이 없었다」
    // ── 3막 이유 (0:14–0:30) — 네 컷 모두 기존 렌더 재활용
    { k: 'silane', cue0:  6.4, base: 3.4, full: 4.0, short: 4.0 },   // CUT07 스크러버 1,200°C
    { k: 'chill',  cue0: 13.2, base: 3.4, full: 4.0, short: 4.0 },   // CUT08 칠러 ±0.1°C
    { k: 'sf6',    cue0:  9.8, base: 3.4, full: 4.0, short: 4.0 },   // CUT09 SF6 배출량 0
    { k: 'reveal', cue0: 20.0, base: 4.8, full: 4.0, short: 4.0 },   // CUT10 219,000시간
    // ── 4막 사람 (0:30–0:38) — 퇴직금 컷을 뺐으므로 성장 3박이 그 자리를 받는다
    { k: 'map',    cue0: 34.4, base: 5.2, full: 4.0, short: 4.0 },   // CUT11 화성 → 여섯 나라
    { k: 'kosdaq', cue0: 30.8, base: 3.6, full: 4.0, short: 4.0 },   // CUT12 상장·수출 1억불·시총 1조
    // ── 5막 다음 (0:38–0:45.5)
    { k: 'c13',    cue0: 97.0, base: 3.7, full: 3.7, short: 3.7 },   // 같은 이음부, 조용히
    // ⚠ end 는 base 6.3 인데 full 3.8 이라 40% 빨라진다(로고 조립이 서두른다).
    //    컷시트가 준 예산이 3.8 이라 일단 그대로 두되, 러프컷에서 «급한지»를 보고 조정한다.
    //    규약상 글자 많은 장면은 20% 넘게 줄이지 않는다 — 여기는 알고 어긴 것이다.
    { k: 'end',    cue0: 56.8, base: 6.3, full: 3.8, short: 3.8 },   // CUT14 로고

    // ── 뺀 장면들(full: 0). 자산과 코드는 그대로 두어 언제든 되살릴 수 있게 한다.
    //    만담(s6)은 사내 피드백으로 버렸고, 창업(found)·액침냉각(future)은 사용자 지시로 뺐다.
    { k: 'intro',  cue0: 66.0, base: 4.0, full: 0, short: 0 },
    { k: 'hook',   cue0:  0.0, base: 4.0, full: 0, short: 0 },
    { k: 's6',     cue0: 70.0, base: 6.4, full: 0, short: 0 },
    { k: 'stop',   cue0: 16.6, base: 3.4, full: 0, short: 0 },
    { k: 'pivot',  cue0: 24.8, base: 2.0, full: 0, short: 0 },
    { k: 'found',  cue0: 26.8, base: 4.0, full: 0, short: 0 },
    { k: 'stairs', cue0: 39.6, base: 4.2, full: 0, short: 0 },
    { k: 'future', cue0: 43.8, base: 3.9, full: 0, short: 0 },
    { k: 'close',  cue0: 52.2, base: 4.6, full: 0, short: 0 },
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
