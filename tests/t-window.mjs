/* 기간 기본창 (v127) — 콜드 로드에서 «최근 13개월 먼저, 나머지는 뒤에서» 가
   ① 첫 반환은 창 안의 행만 담는가          (창이 실제로 걸리는가)
   ② 백필이 끝나면 «전체본이 전체 경로와 완전히 같은가» (숫자가 갈리면 이 기능은 사고다)
   ③ 부분본이 캐시에 담기지 않는가          (담기면 다음 로드가 부분을 완성본으로 쓴다)
   ④ 백필이 실패하면 경고가 남고 캐시는 비어 있는가 (조용한 부분본이 최악이다)
   ⑤ 완료가 재렌더를 «한 번» 부르는가 · IDB 저장이 실패해도 재수확 루프에 안 빠지는가
   ⑥ 작은 표에는 창을 안 거는가 (두 번 나눠 받기 역행 방지)
   를 실제 브라우저에서 확인한다. 자료는 지어낸 값이다 — 픽스처 불필요.

   ⚠ 이 검사의 핵심은 ②다. 창+백필 경로와 전체 경로가 «다른 코드»를 지나므로,
     출력이 같다는 것은 가정이 아니라 대조해야 하는 사실이다(정렬 포함). */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

const browser = await chromium.launch(PW);
const page = await (await browser.newContext()).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

/* file:// 은 오리진이 opaque 라 IndexedDB 가 막힌다 — http 오리진을 하나 만든다. */
await page.route('http://gst.test/**', (r) => {
  const u = r.request().url();
  if (u.endsWith('/core.js'))
    return r.fulfill({ status: 200, contentType: 'application/javascript',
      body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') });
  return r.fulfill({ status: 200, contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><script src="/core.js"></script>' });
});
await page.goto('http://gst.test/', { waitUntil: 'load' });

const out = await page.evaluate(async () => {
  const R = {};
  const SPEC = GST.SM.SPEC.wk;
  const keys = Object.keys(SPEC.fields);
  const snake = keys.map(GST._snake);

  /* 지어낸 수선실적 — 절반은 최근(창 안), 나머지는 옛날·빈 값·이상 표기.
     이상한 표기는 «어느 반쪽이든 정확히 한 번» 실려야 한다(분할의 삼분법). */
  const WANT = 1200;                      // DB_WINDOW_MIN 보다 작으므로 상수를 낮춰 켠다
  GST.DB_WINDOW_MIN = 1000;
  const now = new Date();
  const mAbs = now.getFullYear() * 12 + now.getMonth();
  const ym = (off) => { const m = mAbs + off; return Math.floor(m / 12) + '-' + String(m % 12 + 1).padStart(2, '0'); };
  const DATA = [];
  for (let i = 0; i < WANT; i++) {
    const o = { src_row: i };
    keys.forEach(function (k, j) { o[snake[j]] = 'v' + i + '_' + j; });
    o.d_start = (i % 2 === 0) ? ym(-(i % 6)) + '-15'
              : (i % 3 === 0) ? ym(-40 - (i % 12)) + '-10'
              : (i % 5 === 0) ? '' : '20' + (20 + (i % 3)) + '. 1. ' + (1 + i % 9);
    DATA.push(o);
  }
  const CAP = 130;                        // 서버 상한 흉내 — 폭 탐침이 이 값을 배워야 한다
  const stampNow = '2026-08-20T09:00:00Z';

  /* PostgREST 빌더 흉내 — v128 부터 dbRows 는 OFFSET 대신 src_row «값 범위»(gte/lt)로
     자르고, 폭 탐침(range)·최대 번호(order desc + limit)도 쓴다. 빌더는 체이너블이면서
     스스로 await 가능해야 한다(실물과 같게 then 구현). 날짜 조건은 텍스트 비교다. */
  const mkClient = function (opt) {       // opt.failTail → 백필의 첫 구간 뒤부터 실패
    return {
      rpc: async () => ({ data: snake.concat(['src_row']), error: null }),
      from: function (tbl) {
        if (tbl === 'sheet_sync_log') return {
          select: () => ({ eq: () => ({ maybeSingle: async () =>
            ({ data: { rows: WANT, err: null, synced_at: opt.stamp, ms: -1 } }) }) })
        };
        const st = { flt: [], dir: 'asc', a: null, b: null, kind: 'full', lo: 0 };
        const q = {
          select: () => q,
          gte: (col, v) => {
            if (col === 'src_row') { st.lo = v; st.flt.push(o => o.src_row >= v); }
            else { st.kind = 'win'; st.flt.push(o => String(o[col] == null ? '' : o[col]) >= v); }
            return q; },
          lt: (col, v) => { st.flt.push(o => o.src_row < v); return q; },
          or: (expr) => { const m = expr.match(/^(\w+)\.lt\.([^,]+),\1\.is\.null$/);
            if (!m) throw new Error('or 형식이 다르다: ' + expr);
            st.kind = 'tail';
            st.flt.push(o => String(o[m[1]] == null ? '' : o[m[1]]) < m[2]);   // 빈 문자열은 lt 에 걸린다
            return q; },
          order: (col, o2) => { st.dir = (o2 && o2.ascending === false) ? 'desc' : 'asc'; return q; },
          range: (x, y) => { st.a = x; st.b = y; return q; },
          limit: (n) => { st.a = 0; st.b = n - 1; return q; },
          then: (res) => {
            if (opt.failTail && st.kind === 'tail' && st.lo > 0)
              return res({ error: { message: '주입한 실패' } });
            R.reqs.push(st.kind + ':' + st.lo);
            let d = DATA.filter(o => st.flt.every(f => f(o)));
            d = d.slice().sort((x, y) => st.dir === 'desc' ? y.src_row - x.src_row : x.src_row - y.src_row);
            if (st.a != null) d = d.slice(st.a, st.b + 1);
            res({ data: d.slice(0, CAP), error: null });   // 상한은 마지막에 — 실서버와 같다
          }
        };
        return q;
      }
    };
  };

  const wipe = async () => { await GST.idb.del('rows:wk'); delete (GST._bfFull || {}).wk; };
  const flat = (rows) => rows.map(r => r.join('')).join('\n');
  const waitBf = async () => { for (let i = 0; i < 100 && Object.keys(GST._bfOn).length; i++)
    await new Promise(r => setTimeout(r, 100)); };

  /* 대조 기준 — 창을 «끈» 전체 경로 */
  R.reqs = [];
  const winSave = GST.DB_WINDOW; GST.DB_WINDOW = {};
  GST.db = async () => mkClient({ stamp: stampNow });
  await wipe();
  const full = await GST.dbRows('wk');
  GST.DB_WINDOW = winSave;

  /* [1] 창 켜고 콜드 로드 */
  await wipe(); R.reqs = [];
  window.loadData = function () { R.reloads = (R.reloads || 0) + 1; };
  const first = await GST.dbRows('wk');
  R.firstLen = first.length - 1;
  R.fullLen = full.length - 1;
  R.badgeOn = !!document.getElementById('gstBackfill');
  const di = first[0].indexOf('작업시작일');
  const cut = (function () { const m = mAbs - 12; return Math.floor(m / 12) + '-' + String(m % 12 + 1).padStart(2, '0') + '-01'; })();
  R.allRecent = first.slice(1).every(r => String(r[di]) >= cut);
  const early = await GST.idb.get('rows:wk');            // 백필이 끝나기 «전»에 본다
  R.noPartialCache = !early || (early.rows && early.rows.length === WANT + 1);

  await waitBf();
  R.badgeOff = !document.getElementById('gstBackfill');
  const cached = await GST.idb.get('rows:wk');
  R.cachedFull = !!(cached && cached.rows.length === WANT + 1);
  await new Promise(r => setTimeout(r, 1200));           // _bfKick 디바운스(800ms)를 지나서
  R.reloadsOnce = R.reloads === 1;

  const after = await GST.dbRows('wk');
  R.afterLen = after.length - 1;
  R.equalFull = flat(after) === flat(full);

  /* [2] IDB 저장이 죽어도 재수확 루프에 안 빠진다 */
  await wipe(); R.reqs = []; R.reloads = 0;
  const setSave = GST.idb.set; GST.idb.set = async () => { GST._idbErr = '주입한 저장 실패'; return false; };
  await GST.dbRows('wk');                                // 창 → 백필 시작
  await waitBf(); await new Promise(r => setTimeout(r, 1200));
  const tailBefore = R.reqs.filter(s => /^(win|tail)/.test(s)).length;
  const p2 = await GST.dbRows('wk');                     // 재렌더의 로드 — 메모리 다리에서 와야 한다
  const tailAfter = R.reqs.filter(s => /^(win|tail)/.test(s)).length;
  GST.idb.set = setSave;
  R.bridgeNoRefetch = tailAfter === tailBefore;
  R.bridgeEqual = flat(p2) === flat(full);
  R.bridgeConsumed = !(GST._bfFull && GST._bfFull.wk);

  /* [3] 백필 실패 — 조용한 부분본이 되지 않는다 */
  await wipe(); R.reqs = [];
  GST._dbMiss = [];
  GST.db = async () => mkClient({ stamp: '2026-08-21T00:00:00Z', failTail: true });
  const pf = await GST.dbRows('wk');
  R.failFirstLen = pf.length - 1;
  await waitBf(); await new Promise(r => setTimeout(r, 300));
  R.failWarn = (GST._dbMiss || []).some(x => x.t === 'wk' && /뒷부분/.test(x.m));
  const cachedF = await GST.idb.get('rows:wk');
  R.failNoCache = !cachedF;
  R.failBadgeOff = !document.getElementById('gstBackfill');

  /* [4] 작은 표에는 창을 안 건다 */
  await wipe(); R.reqs = [];
  GST.DB_WINDOW_MIN = 5000;                              // WANT(1200) < MIN → 창 없음
  GST.db = async () => mkClient({ stamp: '2026-08-22T00:00:00Z' });
  await GST.dbRows('wk');
  R.smallNoWin = R.reqs.length > 0 && R.reqs.every(s => s.indexOf('full:') === 0);

  /* [5] src_row 가 «비연속»이어도 전량이 온다 — 구간 교체(v87)가 지운 자리는 비고
     새 행은 max+1 부터 붙으므로, 실서버의 정상 상태다. v128 이 OFFSET 을 값 범위로
     바꾸면서 «짧은 장 = 끝» 판정을 버린 이유가 이것이다 — 그 판정이 되살아나면
     빈 구간에서 멈춰 뒷행이 조용히 사라진다. 여기가 그 부활을 막는 자리다. */
  const hole = 900;                                      // 400~1299 를 지운 셈 — 한 구간이 통째로 빈다
  DATA.forEach((o, i) => { o.src_row = i < 400 ? i : i + hole; });
  await wipe();
  GST.DB_WINDOW_MIN = 1000;                              // 창 켠 채로 — 두 경로 다 본다
  GST.db = async () => mkClient({ stamp: '2026-08-23T00:00:00Z' });
  const g1 = await GST.dbRows('wk');                     // 창 → 백필
  await waitBf(); await new Promise(r => setTimeout(r, 1200));
  const g2 = await GST.dbRows('wk');
  const winSave2 = GST.DB_WINDOW; GST.DB_WINDOW = {};
  await wipe();
  GST.db = async () => mkClient({ stamp: '2026-08-24T00:00:00Z' });
  const g3 = await GST.dbRows('wk');                     // 전체 경로
  GST.DB_WINDOW = winSave2;
  R.gapWin = g1.length - 1; R.gapFull = g2.length - 1;
  R.gapPlain = g3.length - 1;
  R.gapEqual = flat(g2) === flat(g3);
  DATA.forEach((o, i) => { o.src_row = i; });            // 원상 복구
  return R;
});

console.log('[1] 창이 걸린 콜드 로드');
is(out.firstLen > 0 && out.firstLen < out.fullLen,
   `첫 반환은 부분이다 (${out.firstLen}/${out.fullLen}행)`);
is(out.allRecent, '첫 반환의 모든 행이 창(최근 13개월) 안이다');
is(out.badgeOn, '받는 동안 배지가 떠 있다 (조용히 부분을 그리지 않는다)');
is(out.noPartialCache, '부분본은 캐시에 담기지 않는다');
is(out.badgeOff, '백필이 끝나면 배지가 사라진다');
is(out.cachedFull, '캐시에는 «전체본»이 담긴다');
is(out.reloadsOnce, `재렌더는 정확히 한 번 불린다 (실제 ${out.reloadsOnce ? 1 : '≠1'})`);
is(out.afterLen === out.fullLen, `재렌더의 로드는 전체본이다 (${out.afterLen}행)`);
is(out.equalFull, '창+백필의 전체본이 전체 경로와 «완전히» 같다 (정렬 포함)');

console.log('\n[2] IDB 저장이 죽어도 재수확 루프에 안 빠진다');
is(out.bridgeNoRefetch, '재렌더의 로드가 네트워크를 다시 받지 않는다 (메모리 다리)');
is(out.bridgeEqual, '메모리 다리의 전체본도 전체 경로와 같다');
is(out.bridgeConsumed, '다리는 한 번 쓰면 지워진다 (탭에 수백 MB 가 눌러앉지 않게)');

console.log('\n[3] 백필 실패 — 조용한 부분본이 되지 않는다');
is(out.failFirstLen > 0, '창 분량은 그려진다 (화면이 통째로 죽지 않는다)');
is(out.failWarn, '경고가 남는다 («뒷부분을 못 받았습니다»)');
is(out.failNoCache, '실패한 로드는 캐시에 아무것도 안 담는다');
is(out.failBadgeOff, '배지는 내려간다 (영원한 «받는 중»으로 남지 않게)');

console.log('\n[4] 창을 안 거는 조건');
is(out.smallNoWin, 'DB_WINDOW_MIN 미만의 표는 한 번에 받는다 (창 요청이 없다)');

console.log('\n[5] src_row 비연속 (구간 교체 뒤의 정상 상태)');
is(out.gapPlain === out.fullLen, `전체 경로가 빈 구간을 건너 전량을 받는다 (${out.gapPlain}행)`);
is(out.gapFull === out.fullLen, `창+백필도 전량을 받는다 (${out.gapFull}행)`);
is(out.gapEqual, '두 경로의 출력이 같다 — «짧은 장 = 끝» 판정이 되살아나면 여기가 붉는다');

is(!errs.length, 'JS 에러 0건' + (errs.length ? ' — ' + errs[0] : ''));
await browser.close();
console.log(fail ? `\n❌ t-window ${pass}/${pass + fail}` : `\n✅ t-window ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
