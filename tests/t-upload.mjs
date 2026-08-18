/* CSV 업로드 화면 (v81) — 브라우저의 변환이 sheet-sync 와 «같은 행»을 만드는지.
 *
 * upload/index.html 은 실적 CSV 를 SPEC 으로 해석해 미러 표 형식(snake_case + src_row
 * + extra)으로 바꾼다. 그 규칙은 sheet-sync 의 toRows 와 같아야 한다 — 다르면
 * cron 시절 적재와 업로드 적재가 갈라져, 같은 데이터인데 화면 숫자가 달라진다.
 *
 * 그래서 실제 페이지를 Playwright 로 띄워 실제 CSV 픽스처를 «업로드»시키고,
 * 모의 Supabase 가 받은 insert 행들을 **배포 코드에서 떼어낸 toRows**(t-mirror 와
 * 같은 sync-extract 방식)의 출력과 행 단위로 대조한다. 사본 재구현이 아니라
 * 실제 페이지 코드와 실제 sync 코드의 대조다.
 *
 *   node --experimental-strip-types t-upload.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PW_OPTS = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
let bad = 0, n = 0;
const ok  = m => { n++; console.log('  ✅ ' + m); };
const err = m => { n++; bad++; console.log('  ❌ ' + m); };

/* ---------- 기준: sheet-sync 의 순수 변환부 (t-mirror 와 같은 추출 방식) ---------- */
const syncSrc = fs.readFileSync(ROOT + '/supabase/functions/sheet-sync/index.ts', 'utf8');
const parseCSVSrc = syncSrc.slice(syncSrc.indexOf('function parseCSV'), syncSrc.indexOf('/* 헤더 전용 정규화'));
const hnormSrc    = syncSrc.slice(syncSrc.indexOf('const hnorm ='), syncSrc.indexOf('type ColMap'));
const typeSrc     = syncSrc.slice(syncSrc.indexOf('type ColMap'), syncSrc.indexOf('/* ---------- 순수 변환부'));
const cutSrc      = syncSrc.slice(syncSrc.indexOf('/* ---------- 순수 변환부 ----------'),
                                  syncSrc.indexOf('/* ---------- 순수 변환부 끝 ---------- */'));
if (!cutSrc || cutSrc.length < 500) { console.log('❌ sheet-sync에서 순수 변환부를 못 찾았다'); process.exit(1); }
const tmp = HERE + '/sync-extract.ts';
fs.writeFileSync(tmp, [parseCSVSrc, hnormSrc, typeSrc, cutSrc,
  'export { parseCSV, hnorm, planSync, toRows };'].join('\n'));
const { parseCSV, planSync, toRows } = await import('file://' + tmp + '?v=' + Date.now());

/* colmap — gen-ddl 이 SPEC 에서 뽑는 것과 같은 형태를 core.js SPEC 에서 직접 만든다 */
global.window = {}; global.document = { createElement: () => ({ style: {} }), getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: {}, head: {}, readyState: 'complete' };
global.window.addEventListener = () => {}; global.window.location = { href: '', search: '' };
global.window.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window.matchMedia = () => ({ matches: false, addEventListener() {} });
global.window.self = global.window.top = global.window;
global.localStorage = global.window.localStorage; global.location = global.window.location;
try { new Function(fs.readFileSync(ROOT + '/assets/core.js', 'utf8'))(); } catch (e) {}
const G = global.window.GST || global.GST;
const cmapOf = key => Object.entries(G.SM.SPEC[key].fields)
  .map(([f, names]) => ({ col: G._snake(f), headers: [].concat(names), optional: false, idx: -1 }));

const FIX = { wk: 'csv_wk.csv', inst: 'csv_inst.csv' };   // mat 는 wk 와 같은 경로 — 시간 절약
const avail = Object.entries(FIX).filter(([, f]) => fs.existsSync(path.join(HERE, f)));
if (!avail.length) {
  /* «건너뜀» 을 ✅ 처럼 보이게 두면 안 된다 — 실제로 그 초록불을 믿고 작업했다. */
  console.log('⚠️  픽스처가 없어 업로드 대조를 하나도 못 했다 (tests/README.md 로 생성)');
  if (process.env.STRICT_FIXTURES) process.exit(2);
  process.exit(0);
}

/* ---------- 페이지를 띄우고 모의 Supabase 로 insert 를 가로챈다 ---------- */
const browser = await chromium.launch(PW_OPTS);
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('JS: ' + e.message));

await page.route('**/assets/core.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
  body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8')
    + '\n;GST.authGate=async function(){return true;};'
    + 'GST.getSession=async function(){return {user:{email:"t@x.com"}};};'
    + 'GST.sheetWrite=async function(){return {can_write:true};};'
    /* 모의 클라이언트 — insert 행을 window.__INS 에 쌓는다. RPC 는 기록만. */
    + 'window.__INS=[];window.__RPC=[];'
    + 'GST.db=async function(){return {'
    + '  from:function(t){return {'
    + '    select:function(cols,opt){'
    + '      if(opt&&opt.head)return Promise.resolve({count:(window.__INS.length||500),error:null});'
    + '      return {limit:function(){return Promise.resolve({data:[],error:null});}};},'
    + '    insert:function(rows){window.__INS.push.apply(window.__INS,rows);'
    + '      return Promise.resolve({data:null,error:null});}'
    + '  };},'
    + '  rpc:function(fn,args){window.__RPC.push([fn,args&&args.p_tbl]);return Promise.resolve({data:null,error:null});}'
    + '};};'
    /* 마지막 행수 대조는 모의 count(500)와 어긋나므로 개수 검증을 통과시킨다 */
    + 'window.__COUNT_OVERRIDE=true;' }));
await page.route('**/cdn.jsdelivr.net/**', r => {
  const u = r.request().url();
  if (u.includes('papaparse')) return r.fulfill({ status: 200, contentType: 'application/javascript',
    body: fs.readFileSync(HERE + '/node_modules/papaparse/papaparse.min.js', 'utf8') });
  if (u.endsWith('.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
  return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
await page.goto('file://' + ROOT + '/upload/index.html', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { window.confirm = () => true; });

for (const [key, file] of avail) {
  console.log(`\n[${key}] 페이지 변환 == sheet-sync toRows ?`);
  const csvText = fs.readFileSync(path.join(HERE, file), 'utf8');

  // ① 기준 — 배포 sync 코드의 결과
  const plan = planSync(G.SM.SPEC[key], cmapOf(key), csvText);
  /* ⚠ 배포 sheet-sync 가 «부르는 방식» 그대로 부른다 — 배치로 자르고 off 는 0 부터.
     예전에는 `toRows(plan.data, …, plan.hi + 1, …)` 로 «페이지가 쓰는 오프셋»을
     기준에 그대로 먹였다. 그러면 src_row 규칙 자체가 검사 대상에서 빠진다 —
     페이지가 오프셋을 바꿔도 기준이 따라 움직여 언제나 통과한다.
     실제로 그 사이에 둘이 갈라져 있었고(페이지 hi+1 ↔ 배포 0) 검사는 초록불이었다. */
  const BATCH = 2000;
  const want = [];
  for (let off = 0; off < plan.data.length; off += BATCH) {
    want.push(...toRows(plan.data.slice(off, off + BATCH), plan.cmap, off, plan.header));
  }

  // ② 실제 페이지 — 표 선택 + 파일 주입 + 업로드
  await page.evaluate(() => { window.__INS = []; window.__RPC = []; });
  const idx = await page.evaluate(k => {
    const o = [...document.getElementById('tsel').options].findIndex(x => x.text.startsWith({wk:'수선',mat:'자재',inst:'설치'}[k]));
    document.getElementById('tsel').value = String(o);
    document.getElementById('tsel').dispatchEvent(new Event('change'));
    return o;
  }, key);
  if (idx < 0) { err('표 선택 실패'); continue; }
  await page.setInputFiles('#fsel', { name: file, mimeType: 'text/csv', buffer: Buffer.from(csvText) });
  await page.waitForFunction(() => !document.getElementById('goBtn').disabled
    || /❌/.test(document.getElementById('chk').textContent), null, { timeout: 60000 });
  const chk = await page.evaluate(() => document.getElementById('chk').textContent);
  if (/❌/.test(chk)) { err('검사 실패: ' + chk.slice(0, 120)); continue; }
  ok('검사 통과: ' + chk.split('\n')[0].slice(0, 80));

  await page.evaluate(() => window.doUpload());
  await page.waitForFunction(() => /완료|❌/.test(document.getElementById('log').textContent), null, { timeout: 120000 });
  const got = await page.evaluate(() => window.__INS);
  const rpc = await page.evaluate(() => window.__RPC);

  // ③ 대조 — 행수·컬럼 집합·값 전체
  got.length === want.length ? ok(`행수 ${got.length} == 기준 ${want.length}`)
                             : err(`행수 ${got.length} != 기준 ${want.length}`);
  const cols = o => Object.keys(o).sort().join(',');
  cols(got[0] || {}) === cols(want[0] || {}) ? ok('컬럼 집합 일치')
    : err(`컬럼이 다르다\n    페이지: ${cols(got[0]||{})}\n    기준  : ${cols(want[0]||{})}`);
  let diff = 0;
  for (let i = 0; i < Math.min(got.length, want.length); i++) {
    const a = got[i], b = want[i];
    for (const k of Object.keys(b)) {
      const av = k === 'extra' ? JSON.stringify(a[k]) : a[k], bv = k === 'extra' ? JSON.stringify(b[k]) : b[k];
      if (String(av ?? '') !== String(bv ?? '')) { if (++diff <= 3) console.log(`    행${i} ${k}: 페이지 '${av}' != 기준 '${bv}'`); }
    }
  }
  diff === 0 ? ok('전 행 전 칸 일치 (src_row·extra 포함)') : err(`값 불일치 ${diff}칸`);
  rpc.some(r => r[0] === 'csv_upload_begin') && rpc.some(r => r[0] === 'csv_upload_finish')
    ? ok('begin → finish RPC 호출') : err('RPC 호출 누락: ' + JSON.stringify(rpc));
}

errs.length ? err('페이지 JS 에러: ' + errs.join(' // ')) : ok('페이지 JS 에러 0');
await browser.close();
console.log(`\n${bad ? '❌' : '✅'} ${n - bad}/${n} 통과`);
process.exit(bad ? 1 : 0);
