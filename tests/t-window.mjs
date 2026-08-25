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
  const CAP = 130;                        // 서버 상한 흉내 — «첫 장이 짧을 때»의 모호성 판정도 지나게 한다
  const stampNow = '2026-08-20T09:00:00Z';

  const mkClient = function (opt) {       // opt.failTail → 백필 두 번째 장부터 실패
    return {
      rpc: async () => ({ data: snake.concat(['src_row']), error: null }),
      from: function (tbl) {
        if (tbl === 'sheet_sync_log') return {
          select: () => ({ eq: () => ({ maybeSingle: async () =>
            ({ data: { rows: WANT, err: null, synced_at: opt.stamp, ms: -1 } }) }) })
        };
        /* PostgREST 필터 흉내 — gte 는 텍스트 비교, or 는 lt+is.null 형태만 받는다 */
        let flt = null, isBackfill = false;
        const b = {
          select: () => b,
          gte: (col, v) => { flt = (x) => x >= v; return b; },
          or: (expr) => { const m = expr.match(/^(\w+)\.lt\.([^,]+),\1\.is\.null$/);
            if (!m) throw new Error('or 형식이 다르다: ' + expr);
            isBackfill = true; flt = (x) => x < m[2]; return b; },   // 빈 문자열은 lt 에 걸린다
          order: () => b,
          range: async (a, z) => {
            const src = flt ? DATA.filter(o => flt(String(o.d_start == null ? '' : o.d_start))) : DATA;
            if (opt.failTail && isBackfill && a > 0) return { error: { message: '주입한 실패' } };
            R.reqs.push((flt ? (isBackfill ? 'tail' : 'win') : 'full') + ':' + a);
            return { data: src.slice(a, a + Math.min(z - a + 1, CAP)) };
          }
        };
        return b;
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

is(!errs.length, 'JS 에러 0건' + (errs.length ? ' — ' + errs[0] : ''));
await browser.close();
console.log(fail ? `\n❌ t-window ${pass}/${pass + fail}` : `\n✅ t-window ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
