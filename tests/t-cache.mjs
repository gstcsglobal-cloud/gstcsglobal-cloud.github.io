/* 미러 행 캐시가 «두 번째 로드에서 한 행도 안 받는가» (v101)

   왜 필요한가. 예전에는 미러 경로가 캐시를 아예 안 봤다 — cacheLoad 는 «시트 경로가
   실패했을 때»만 불렸다. 그래서 새로고침할 때마다 수선 257,606행을 다시 받아 다시
   파싱했다. 전송은 gzip 으로 17MB 지만 푼 JSON 은 374MB 다 — 「느리다」의 실체가 이쪽이다.
   게다가 localStorage 캐시는 한도(5~10MB)를 넘어 setItem 이 늘 던졌고, catch 가 그걸
   삼켜서 «캐시가 없는 것과 같은데 아무 흔적이 없는» 상태였다.

   이 검사는 실제 브라우저에서 GST.dbRows 를 두 번 부르고, 두 번째에 표를 향한 요청이
   «한 번도» 나가지 않는지 센다. 소스만 봐서는 못 잡는다 — IndexedDB 는 진짜 브라우저가
   있어야 돌고, 구조화 복제가 배열을 그대로 돌려주는지도 실제로 확인해야 한다.

   ⚠ 실데이터를 쓰지 않는다. 행은 여기서 지어낸다. */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

const browser = await chromium.launch(PW);
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

/* file:// 은 오리진이 opaque 라 IndexedDB 가 막힌다 — http 오리진을 하나 만들어 준다. */
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
  const R = { calls: [] };
  const SPEC = GST.SM.SPEC.inst;
  const keys = Object.keys(SPEC.fields);
  const WANT = 500;                                   // 지어낸 행수

  /* PostgREST 클라이언트 흉내 — 표를 향한 호출을 전부 센다. */
  const rowsOnce = [];
  for (let i = 0; i < WANT; i++) {
    const o = { src_row: i };
    keys.forEach(function (k, j) { o[GST._snake(k)] = 'v' + i + '_' + j; });
    rowsOnce.push(o);
  }
  const stampNow = '2026-08-17T00:00:00Z';
  GST.db = async function () {
    return {
      from: function (tbl) {
        R.calls.push(tbl);
        if (tbl === 'sheet_sync_log') return {
          select: () => ({ eq: () => ({ maybeSingle: async () =>
            ({ data: { rows: WANT, err: null, synced_at: stampNow, ms: -1 } }) }) })
        };
        return { select: () => ({ order: () => ({ range: async (a, b) =>
          ({ data: rowsOnce.slice(a, b + 1) }) }) }) };
      }
    };
  };

  await GST.idb.del('rows:inst');                     // 깨끗한 상태에서 시작
  R.calls.length = 0;
  const first = await GST.dbRows('inst');
  R.firstCalls = R.calls.slice();

  R.calls.length = 0;
  const second = await GST.dbRows('inst');
  R.secondCalls = R.calls.slice();

  /* 적재가 바뀌면(= synced_at 이 달라지면) 캐시를 버려야 한다. */
  const bumped = '2026-08-18T00:00:00Z';
  const prev = GST.db;
  GST.db = async function () { const c = await prev(); const f = c.from;
    c.from = function (t) { const o = f(t);
      if (t === 'sheet_sync_log') return { select: () => ({ eq: () => ({ maybeSingle: async () =>
        ({ data: { rows: WANT, err: null, synced_at: bumped, ms: -1 } }) }) }) };
      return o; };
    return c; };
  R.calls.length = 0;
  const third = await GST.dbRows('inst');
  R.thirdCalls = R.calls.slice();

  R.same = JSON.stringify(first) === JSON.stringify(second);
  R.len = first.length;
  R.headOK = first[0].join('|') === second[0].join('|');
  R.cell = second[1] && second[1][0];
  R.hits = GST._idbHit || 0;
  R.idbErr = GST._idbErr || null;
  return R;
});

console.log('\n[1] 첫 로드는 표를 실제로 읽는다');
is(out.firstCalls.filter((t) => t === 'sheet_inst').length >= 1, '첫 로드에서 sheet_inst 를 읽었다');
is(out.len === 501, `머리글 포함 501행 (받은 ${out.len})`);

console.log('\n[2] 두 번째 로드는 «한 행도» 안 받는다');
is(out.secondCalls.filter((t) => t === 'sheet_inst').length === 0,
   `두 번째 로드에 sheet_inst 요청 0회 (실제 ${out.secondCalls.filter((t) => t === 'sheet_inst').length}회)`);
/* 적재 기록은 계속 봐야 한다 — 그걸 안 보면 «바뀐 데이터를 계속 쓰는» 캐시가 된다.
   한 행짜리 조회라 비용이 없고, 미러 나이 경고도 여기서 나온다. */
is(out.secondCalls.indexOf('sheet_sync_log') >= 0, '적재 기록(sheet_sync_log)은 매번 확인한다');
is(out.same, '두 번의 결과가 완전히 같다 (구조화 복제가 배열을 그대로 돌려준다)');
is(out.headOK, '머리글 행이 보존된다');
is(out.hits >= 1, `캐시 적중이 기록된다 (_idbHit=${out.hits})`);

console.log('\n[3] 적재가 바뀌면 캐시를 버린다');
is(out.thirdCalls.filter((t) => t === 'sheet_inst').length >= 1,
   'synced_at 이 바뀌면 다시 받는다 (나이가 아니라 적재 시각으로 무효화)');

console.log('\n[4] 실패해도 조용하지 않다');
{
  const SRC = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
  is(/GST\._idbErr/.test(SRC), 'IndexedDB 저장 실패를 기록한다');
  is(/캐시 저장 실패/.test(SRC), '그 사실이 출처 배지에 뜬다 (왜 느린지 물을 수 있게)');
  is(/GST\._cacheQuota/.test(SRC), 'localStorage 용량 초과도 세어 둔다 (예전엔 통째로 삼켰다)');
  is(/stamp = table\+'\|'\+lg\.data\.synced_at\+'\|'\+want/.test(SRC),
     '무효화 열쇠가 «적재 시각 + 행수» 다');
}
is(!errs.length, 'JS 에러 0건' + (errs.length ? ' → ' + errs[0] : ''));

await browser.close();
console.log('\n' + (fail ? '❌ t-cache ' + fail + ' 실패 / ' + (pass + fail)
                         : '✅ t-cache ' + pass + '/' + pass));
process.exit(fail ? 1 : 0);
