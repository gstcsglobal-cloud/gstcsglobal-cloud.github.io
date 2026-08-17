/* 진단 화면(diag/index.html)이 «손으로 센 답»과 같은 숫자를 내는지 실제 브라우저로 확인한다.

   왜 소스 검사로는 부족한가. 이 화면의 값어치는 «지금 화면들이 쓰는 조인과 같은 규칙으로
   세는가» 하나다. 접근자 하나(자재의 메인설비호기 폴백, 설비호기 우선 층 선택)만 어긋나도
   숫자는 그럴듯하게 나오면서 틀린다 — 틀린 진단은 없는 진단보다 나쁘다.

   픽스처는 전부 지어낸 값이다(공개 저장소 · t-leak). 머리글만 SPEC 에서 뽑아 실물과 맞춘다.
   실행: node t-snjoin-page.mjs   (PW_CHROMIUM 으로 크로미움 경로 지정 가능)
*/
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

let pass = 0, fail = 0;
const is = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); c ? pass++ : fail++; };
const eq = (a, b, m) => is(a === b, `${m}  (기대 ${b} · 실제 ${a})`);

const browser = await chromium.launch(PW);
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('JS: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

const CORE = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
const stub = '\n;GST.authOn=function(){return false;};GST.getSession=async function(){return {user:{email:"t@t"}};};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.style.display="none";return true;};'
  + 'GST.token=async function(){return "t";};';
await page.route('**/assets/core.js', r => r.fulfill({ status:200, contentType:'application/javascript', body: CORE + stub }));
await page.route('**/assets/*.css', r => {
  const n = r.request().url().split('/').pop().split('?')[0];
  try { r.fulfill({ status:200, contentType:'text/css', body: fs.readFileSync(ROOT + '/assets/' + n, 'utf8') }); }
  catch { r.fulfill({ status:200, contentType:'text/css', body:'' }); }
});
await page.route('**/cdn.jsdelivr.net/**', r => {
  const u = r.request().url();
  if (u.includes('papaparse')) return r.fulfill({ status:200, contentType:'application/javascript',
    body: fs.readFileSync(ROOT + '/tests/node_modules/papaparse/papaparse.min.js', 'utf8') });
  if (u.endsWith('.css')) return r.fulfill({ status:200, contentType:'text/css', body:'' });
  return r.fulfill({ status:200, contentType:'application/javascript', body:'' });
});

// ── 머리글은 SPEC 에서 뽑는다. 손으로 적으면 SPEC 이 바뀔 때 이 검사만 조용히 낡는다 ──
await page.goto('about:blank');
await page.addScriptTag({ content: CORE });
const HDR = await page.evaluate(() => {
  const first = v => Array.isArray(v) ? v[0] : v;
  const of = spec => Object.fromEntries(Object.entries(spec.fields).map(([k, v]) => [k, first(v)]));
  return { inst: of(GST.SM.SPEC.inst), wk: of(GST.SM.SPEC.wk), mat: of(GST.SM.SPEC.mat) };
});

const csv = rows => rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join('\n');
function sheet(hdrMap, recs) {
  const keys = Object.keys(hdrMap);
  const head = keys.map(k => hdrMap[k]);
  return csv([head, ...recs.map(o => keys.map(k => (o[k] == null ? '' : o[k])))]);
}

/* 설치현황 — 조인 상대편.
   GBWS-1003 과 GBWS-1003L 을 «둘 다» 둔다: 꼬리를 떼면 한 키로 접히는 경우를 만들어,
   화면이 그 접힘 수를 정직하게 밝히는지 본다(조인율만 오르고 남의 설비를 물면 사고다). */
const INST = sheet(HDR.inst, [
  { code:'SC1', sn:'GBWS-1000', floor:'A 2F', country:'GST TAIWAN SCRUBBER' },
  { code:'SC2', sn:'GBWS-1001', floor:'B 3F', country:'GST TAIWAN SCRUBBER' },
  { code:'SC3', sn:'SBW-1002',  floor:'',     country:'SEC Scrubber' },        // 층 칸이 빈 설비
  { code:'SC4', sn:'GBWS-1003', floor:'C 1F', country:'GST TAIWAN SCRUBBER' },
  { code:'SC5', sn:'GBWS-1003L',floor:'C 1F', country:'GST TAIWAN SCRUBBER' }  // 꼬리 L — 접힘 유발
]);
// 수선실적 — 설비호기(eqNo) → S/N(IN)(snIn) 순으로 붙는다 (fault 와 같다)
const WK = sheet(HDR.wk, [
  { rsCode:'R1', stage:'BM', eqNo:'SC1', snIn:'' },            // 현재 규칙 hit (설비호기) · 층 있음
  { rsCode:'R2', stage:'BM', eqNo:'',    snIn:'GBWS-1000' },   // 현재 규칙 hit (S/N)     · 층 있음
  { rsCode:'R3', stage:'BM', eqNo:'',    snIn:'SBW1002' },     // ① 하이픈만 다름
  { rsCode:'R4', stage:'BM', eqNo:'',    snIn:'GBWS-1001L' },  // ② 꼬리 L
  { rsCode:'R5', stage:'BM', eqNo:'',    snIn:'GBWS-9999' },   // 설치현황에 없음
  { rsCode:'R6', stage:'TBM',eqNo:'SC3', snIn:'' }             // hit 인데 층이 빈 설비
]);
// 자재실적 — 설비호기(eq)가 비면 메인설비호기(mainEq) 로 폴백한다 (material 과 같다)
const MAT = sheet(HDR.mat, [
  { rsCode:'R1', eq:'',   mainEq:'SC2', sn:'',            matName:'O-RING' },  // 폴백으로 hit
  { rsCode:'R2', eq:'',   mainEq:'',    sn:'GBWS-1001R',  matName:'O-RING' },  // ② 꼬리 R
  { rsCode:'R3', eq:'',   mainEq:'',    sn:'SBW1002',     matName:'GASKET' }   // ① 하이픈
]);

const BY_GID = { '891608329': INST, '646668307': WK, '31302669': MAT };
await page.route('**/spreadsheets/**', r => {
  const g = (r.request().url().match(/[?&]gid=(\d+)/) || [])[1];
  r.fulfill({ status:200, contentType:'text/csv', body: BY_GID[g] || '' });
});
await page.route('**/*.supabase.co/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));

console.log('[1] 진단 화면이 손계산과 같은 숫자를 내는가');
await page.goto('file://' + ROOT + '/diag/index.html');
await page.waitForSelector('#resCard', { state:'visible', timeout: 20000 });
await page.waitForTimeout(400);

const got = await page.evaluate(() => {
  const num = s => Number(String(s).replace(/[^0-9]/g, '')) || 0;
  const out = {};
  document.querySelectorAll('#res > div').forEach(blk => {
    const t = blk.querySelector('.big'); if (!t) return;
    const name = t.textContent.trim().split(' ')[0];
    const rows = [...blk.querySelectorAll('tbody tr')].map(tr => num(tr.children[1].textContent));
    if (rows.length === 4) out[name] = { hit:rows[0], byKey:rows[1], byBase:rows[2], miss:rows[3] };
  });
  /* ⚠ tr.textContent 로 읽지 말 것 — 셀 사이에 공백이 없어 «1» + «16.7%» 가 «116.7%» 로
     붙는다. 실제로 그 때문에 멀쩡한 화면을 실패로 읽었다. 셀 단위로 꺼낸다. */
  const flo = [...document.querySelectorAll('#floors tbody tr')]
    .map(tr => ({ label: tr.children[0].textContent.trim(), n: num(tr.children[1].textContent) }));
  return { out, log: document.getElementById('log').textContent, flo,
           gain: (document.querySelector('#res .big.warn, #res .big.ok') || {}).textContent || '' };
});

// 손으로 센 답 — 위 픽스처 주석과 한 줄씩 대응한다
eq(got.out['수선실적']?.hit,    3, '수선 · 현재 규칙으로 붙음');
eq(got.out['수선실적']?.byKey,  1, '수선 · 하이픈만 무시하면 붙음');
eq(got.out['수선실적']?.byBase, 1, '수선 · 꼬리까지 떼면 붙음');
eq(got.out['수선실적']?.miss,   1, '수선 · 그래도 못 붙음');
eq(got.out['자재실적']?.hit,    1, '자재 · 현재 규칙으로 붙음 (메인설비호기 폴백이 살아 있어야 1)');
eq(got.out['자재실적']?.byKey,  1, '자재 · 하이픈');
eq(got.out['자재실적']?.byBase, 1, '자재 · 꼬리');
eq(got.out['자재실적']?.miss,   0, '자재 · 못 붙음');
is(/더 붙는 행: 4건/.test(got.gain), '합계 4건을 «규칙만 바꾸면 더 붙는 행»으로 낸다');

console.log('\n[2] 꼬리를 뗐을 때 «한 키로 접히는» 설비 수를 밝히는가');
is(/접히는 S\/N: 1종/.test(got.log), '접힘 1종을 로그에 적는다 (조용히 넘어가면 남의 설비를 물어도 모른다)');

console.log('\n[3] 「붙었는데 층을 못 얻은」 경우를 따로 세는가');
{
  const w = got.flo.find(x => /수선실적/.test(x.label));
  eq(w && w.n, 1, '수선 1건을 층 미확보로 따로 센다');
  const tot = got.flo.find(x => /설치현황에서 층을 못 얻는/.test(x.label));
  eq(tot && tot.n, 1, '설치현황 쪽 층 미확보 설비 수도 함께 낸다');
}

console.log('\n[4] 실제 설비번호가 화면에 그대로 찍히지 않는가');
{
  const body = await page.evaluate(() => document.body.innerText);
  const raw = ['GBWS-1000', 'GBWS-1001', 'SBW-1002', 'GBWS-9999', 'SBW1002', 'GBWS-1001L'];
  const leaked = raw.filter(v => body.includes(v));
  is(!leaked.length, '숫자가 가려져 원문 S/N 이 안 보인다' + (leaked.length ? '  ⚠ 노출: ' + leaked.join(' · ') : ''));
  is(/#/.test(body), '가려진 꼴(#)이 실제로 표시된다');
}

console.log('\n[5] JS 에러 0');
is(!errs.length, 'JS 에러 없음' + (errs.length ? '\n    ' + errs.slice(0, 5).join('\n    ') : ''));

await browser.close();
console.log(`\n${fail ? '❌' : '✅'} t-snjoin-page ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
