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

/* ── [0] 표에 «아직 없는» SPEC 열이 있어도 올라가는지 (픽스처 불필요) ─────────────
   실제로 막혔다. Line 2 를 SPEC 에 넣고 DB alter 를 아직 안 한 상태에서
   **해외설치현황.xlsx(= Line 2 열이 아예 없는 파일)** 를 올리자
   「표 sheet_inst 에 없는 컬럼: line2」로 검사가 통째로 멎었다.

   두 경우를 갈라 봐야 한다 — 사람이 할 일이 서로 다르다:
     · 파일에도 없고 표에도 없다  → 이 파일과 무관하다. 아무 말 없이 그냥 올라가야 한다.
     · 파일에는 있는데 표에 없다  → 값을 잃으면 안 된다. extra 에 담고, 무엇을 하면
                                    되는지(승격 SQL)를 적는다.
   ⚠ 표에 열이 «있을» 때는 예전 그대로여야 한다 — 자기 열로 들어간다. */
{
  const SP = G.SM.SPEC.inst;
  const KEYS = Object.keys(SP.fields).map(G._snake);
  /* 머리글은 SPEC 이 «반드시» 있어야 하는 열을 다 담는다(opt 가 아닌 것). 하나라도 빠지면
     「열을 못 찾았습니다」로 먼저 막혀, 정작 보려던 것을 못 본다. */
  const HDR_OS = ['Country','Customer','Scrubber CODE','Scrubber S/N','Scrubber Model',
                  'FAB','Line','Bay','Group_1','Detail_1',
                  'Main Tool Maker','Main Tool Model','Scrubber type'];
  const ROW_OS = ['GST TAIWAN SCRUBBER','MICRON','C-2','SN-2','MODEL-B',
                  'F16','A3 M2 4F','B-1','ETCH','ETCH-2',
                  'MAKER-B','TOOL-B','DUAL'];
  const HDR_KR = ['운영단위','고객사','Scrubber CODE','Scrubber S/N','Scrubber Model',
                  '사업부','Site','Line 1','Line 2','Bay','Process','Detail Process(Customer)',
                  'Main Tool Maker','Main Tool Model','Type2'];
  const ROW_KR = ['SEC Scrubber','삼성전자','C-1','SN-1','MODEL-A',
                  '반도체 연구소','반도체 연구소','NRD-V','NRD-V2','J39','ETCH','ETCH-1',
                  'MAKER-A','TOOL-A','SINGLE'];
  const csv = (h, r) => h.join(',') + '\n' + r.join(',') + '\n';

  const b0 = await chromium.launch(PW_OPTS);
  const ctx0 = await b0.newContext();
  const pg = await ctx0.newPage();
  const e0 = []; pg.on('pageerror', e => e0.push('JS: ' + e.message));
  await pg.route('**/assets/core.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8')
      + '\n;GST.authGate=async function(){return true;};'
      + 'GST.getSession=async function(){return {user:{email:"t@x.com"}};};'
      + 'window.__INS=[];window.__COLS=[];'
      + 'GST.db=async function(){return {'
      + '  from:function(t){return {'
      + '    select:function(cols,opt){ if(opt&&opt.head)return Promise.resolve({count:0,error:null});'
      + '      return {limit:function(){return Promise.resolve({data:[],error:null});}};},'
      + '    insert:function(rows){window.__INS.push.apply(window.__INS,rows);'
      + '      return Promise.resolve({data:null,error:null});}};},'
      /* 여기가 이 검사의 핵심 — 표의 «실제» 컬럼을 돌려준다 */
      + '  rpc:function(fn,args){ if(fn==="csv_table_cols")return Promise.resolve({data:window.__COLS,error:null});'
      + '    return Promise.resolve({data:null,error:null});}};};'
      + 'window.__COUNT_OVERRIDE=true;' }));
  await pg.route('**/cdn.jsdelivr.net/**', r => {
    const u = r.request().url();
    if (u.includes('papaparse')) return r.fulfill({ status: 200, contentType: 'application/javascript',
      body: fs.readFileSync(HERE + '/node_modules/papaparse/papaparse.min.js', 'utf8') });
    if (u.endsWith('.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  await pg.goto('file://' + ROOT + '/upload/index.html', { waitUntil: 'domcontentloaded' });
  await pg.evaluate(() => { window.confirm = () => true; });

  /* 표 컬럼을 정하고 파일을 넣어 «검사»까지 돌린다. 반환은 검사 문구와 첫 행. */
  const run = async (tableCols, name, text) => {
    await pg.evaluate(cs => { window.__COLS = cs; window.__INS = []; }, tableCols);
    await pg.evaluate(() => {
      const s = document.getElementById('tsel');
      const i = [...s.options].findIndex(x => x.text.startsWith('설치'));
      s.value = String(i); s.dispatchEvent(new Event('change'));
    });
    await pg.setInputFiles('#fsel', { name, mimeType: 'text/csv', buffer: Buffer.from(text) });
    await pg.waitForFunction(() => !document.getElementById('goBtn').disabled
      || /❌/.test(document.getElementById('chk').textContent), null, { timeout: 30000 });
    const chk = await pg.evaluate(() => document.getElementById('chk').textContent);
    if (/❌/.test(chk)) return { chk, row: null };
    await pg.evaluate(() => window.doUpload());
    await pg.waitForFunction(() => /완료|❌/.test(document.getElementById('log').textContent),
      null, { timeout: 30000 });
    const ins = await pg.evaluate(() => window.__INS);
    return { chk, row: ins[0] || null };
  };

  console.log('\n[0] 표에 아직 없는 SPEC 열 (픽스처 불필요)');
  const WITHOUT = KEYS.filter(k => k !== 'line2').concat(['src_row', 'extra']);
  const WITH    = KEYS.concat(['src_row', 'extra']);

  /* ① 사용자가 실제로 겪은 그 상황 — 해외 파일 + line2 없는 표 */
  {
    const r = await run(WITHOUT, '1. 해외설치현황.csv', csv(HDR_OS, ROW_OS));
    (!/❌/.test(r.chk) && r.row)
      ? ok('해외 파일(Line 2 열 없음) + 표에 line2 없음 → 그냥 올라간다')
      : err('해외 파일이 막혔다 — ' + r.chk.replace(/\s+/g, ' ').slice(0, 110));
    if (r.row) {
      !('line2' in r.row) ? ok('행에 line2 키를 안 싣는다 (실으면 PostgREST 가 통째로 거부한다)')
                          : err('행에 line2 가 실렸다 — 그것이 막힘의 원인이다');
      /* 이 파일과 무관한 열로 겁주지 않는다 — 파일에 없는 값을 「담아 뒀다」고 하면 거짓말이다 */
      !/표에 아직 없는 열/.test(r.chk) ? ok('파일에도 없는 열은 안내하지 않는다')
                                       : err('파일에 없는 열을 「담아 뒀다」고 적었다');
    }
  }

  /* ② 파일에는 있는데 표에 없다 — 값을 잃지 않고 extra 로 돌린다 */
  {
    const r = await run(WITHOUT, '2. 국내설치현황.csv', csv(HDR_KR, ROW_KR));
    (!/❌/.test(r.chk) && r.row)
      ? ok('국내 파일(Line 2 있음) + 표에 line2 없음 → 막지 않는다')
      : err('국내 파일이 막혔다 — ' + r.chk.replace(/\s+/g, ' ').slice(0, 110));
    if (r.row) {
      (r.row.extra && r.row.extra['Line 2'] === 'NRD-V2')
        ? ok('값이 extra 에 보존된다 (버리면 올린 사람이 알 수 없는 손실이다)')
        : err('값이 사라졌다 — extra: ' + JSON.stringify(r.row.extra));
      !('line2' in r.row) ? ok('그때도 line2 키는 안 싣는다') : err('line2 키가 실렸다');
      /* 여기서는 «무엇을 하면 되는지»를 반드시 적어야 한다 — 막다른 길로 두지 않는다 */
      /표에 아직 없는 열[\s\S]*Line 2/.test(r.chk) && /setup-13/.test(r.chk)
        ? ok('무엇을 하면 되는지(승격 SQL)를 적는다')
        : err('안내가 없다 — 값이 extra 에 있다는 것을 아무도 모른다');
    }
  }

  /* ③ 승격 «후» — 표에 열이 생기면 자기 열로 들어간다 (옛 동작 그대로) */
  {
    const r = await run(WITH, '3. 국내설치현황.csv', csv(HDR_KR, ROW_KR));
    (r.row && r.row.line2 === 'NRD-V2')
      ? ok('표에 열이 생기면 자기 열로 들어간다 (line2=NRD-V2)')
      : err('승격 후에도 자기 열로 안 들어간다 — ' + JSON.stringify(r.row && r.row.line2));
    (r.row && (!r.row.extra || !('Line 2' in r.row.extra)))
      ? ok('그때는 extra 에 중복해 담지 않는다')
      : err('extra 에도 남았다 — 같은 값이 두 곳에 있다');
    /* 해외 파일은 그 열이 null 이어야 한다 — 짐작해 채우지 않는다 */
    const r2 = await run(WITH, '4. 해외설치현황.csv', csv(HDR_OS, ROW_OS));
    (r2.row && r2.row.line2 === null)
      ? ok('해외 행의 line2 는 null (짐작해 채우지 않는다)')
      : err('해외 행의 line2 가 null 이 아니다 — ' + JSON.stringify(r2.row && r2.row.line2));
  }

  /* ④ RPC 가 없는 환경(구 SQL)은 옛 동작 그대로 — 검사를 건너뛴다 */
  {
    const r = await run([], '5. 해외설치현황.csv', csv(HDR_OS, ROW_OS));
    (!/❌/.test(r.chk) && r.row)
      ? ok('csv_table_cols 가 없으면 옛 동작 그대로 (검사가 없다고 막지 않는다)')
      : err('RPC 없는 환경에서 막혔다 — ' + r.chk.replace(/\s+/g, ' ').slice(0, 110));
  }

  e0.length ? err('JS 에러 ' + e0.length + '건 — ' + e0[0]) : ok('JS 에러 0건');
  await b0.close();
}

const FIX = { wk: 'csv_wk.csv', inst: 'csv_inst.csv' };   // mat 는 wk 와 같은 경로 — 시간 절약
const avail = Object.entries(FIX).filter(([, f]) => fs.existsSync(path.join(HERE, f)));
if (!avail.length) {
  /* «건너뜀» 을 ✅ 처럼 보이게 두면 안 된다 — 실제로 그 초록불을 믿고 작업했다. */
  console.log('⚠️  픽스처가 없어 «변환 대조»를 못 했다 (tests/README.md 로 생성)');
  /* ⚠ 위 [0] 이 실패했으면 여기서 0 을 내면 안 된다 — 픽스처가 없다는 이유로 실제
     실패가 초록불로 덮인다. 그것이 이 파일이 경계하는 «거짓 초록불»이다. */
  if (bad) { console.log(`\n❌ ${n - bad}/${n} 통과`); process.exit(1); }
  console.log(`  (표 컬럼 검사 ${n}/${n} 은 돌았다)`);
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
