/* t-sitetpl — 표준 템플릿 생성기 + 사이트 담당자 업로드 경로 (v138)

   지키는 것:
     ① **라운드트립** — 생성기가 내려준 템플릿에 행을 채워 «같은 업로드 파서»에 도로
        먹이면 전 열이 정본 필드로 매핑되고 extra 0 · 필수 누락 0 이다. 템플릿이 자기
        시스템에 먹힌다는 것을 기계가 보증한다.
     ② 템플릿 머리글 = SPEC 별칭 배열의 **첫 이름**(정본 규약 — dbRows·gen-ddl 과 같은 표기).
     ③ ?site= 경로 — 대상 제한 · 모드 «구간 교체» 고정 · 남의 사이트 시트는 «무시했다»고
        말함 · 남의 운영단위 행은 **진행 자체를 막음** · 짝 표 행수는 «그 사이트 분»만.
     ④ 파라미터 없는 관리자 화면은 지금까지와 동일(대상 전부 · 모드 셋 선택 가능).

   ⚠ 소스 검사로는 원리적으로 못 본다 — 「탬플릿이 올라가는가」는 생성→재섭취를 실제로
     돌려야 알고, 「짝 카운트가 스코프됐는가」는 가짜 DB 의 질의 로그를 봐야 안다.
   ⚠ 실데이터를 쓰지 않는다 — 행은 전부 여기서 지어낸다(t-leak).

     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-sitetpl.mjs
*/
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';
import * as XLSX from './node_modules/xlsx/xlsx.mjs';
XLSX.set_fs(fs);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-tpl-'));

/* ── 저장소 서빙 + 스텁 ─────────────────────────────────────────────────── */
const MIME = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html' };
const srv = http.createServer((rq, rs) => {
  let u = decodeURIComponent(rq.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.statusCode = 404; rs.end('nf'); return; }
  rs.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream');
  rs.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

/* 가짜 Supabase — 질의를 «기록»한다. 짝 카운트가 스코프됐는지는 소스가 아니라 이 로그가 안다.
   count 규칙: eq 가 걸린 질의는 17, 아니면 표별 기본값 — 둘이 다르니 어느 쪽을 탔는지 보인다. */
const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
  + 'GST.getSession=async function(){return {user:{email:"t@t"}}};GST.token=async function(){return "t";};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();'
  + 'if(GST._authOk)GST._authOk();return true;};'
  /* 등급 — 기본은 지금까지대로(editor 처럼 쓰기 권한). 페이지가 window.__ME_OBJ 를 주면 그 등급으로(진짜 perm 처럼 _meApply 까지) */
  + 'GST.sheetWrite=async function(){var m=window.__ME_OBJ;if(m){GST._meApply(m);return {ok:true,can_write:!!m.can_write,role:m.role,email:m.email};}return {ok:true,can_write:true,role:"editor"};};'
  + 'window.__QLOG=[];'
  + 'window.__FDB={from:function(tbl){var st={tbl:tbl,eq:[],neq:[],op:"select",ins:0};'
  +  'var q={select:function(){return q},eq:function(k,v){st.eq.push([k,v]);return q},'
  +  'neq:function(k,v){st.neq.push([k,v]);return q},order:function(){return q},limit:function(){return q},'
  +  'insert:function(rows){st.op="insert";st.ins=rows.length;return q},'
  +  'then:function(res,rej){window.__QLOG.push(JSON.parse(JSON.stringify(st)));'
  +   'window.__INS=window.__INS||{};'
  +   'if(st.op==="insert"){window.__INS[st.tbl]=(window.__INS[st.tbl]||0)+st.ins;return Promise.resolve({error:null}).then(res,rej);}'
  +   'var base={sheet_alarm:120,sheet_allbypass:80,sheet_wk:500,sheet_mat:300,sheet_inst:900}[st.tbl];'
  +   'var n=st.eq.length?17:((base==null?60:base)+(window.__INS[st.tbl]||0));'
  +   'return Promise.resolve({count:n,data:[],error:null}).then(res,rej);}};return q;},'
  +  'rpc:async function(name,args){window.__QLOG.push({rpc:name,args:args});'
  +   'if(name==="csv_table_cols"){var cols={sheet_edu:["No","Site","인원","사원번호","교육완료일","id","src_row","created_at","imported_at","extra"]}[args&&args.p_tbl];'
  +    'return {data:cols||null,error:null};}'
  +   'if(name==="csv_window"&&window.__WIN_ERR)return {data:null,error:{message:window.__WIN_ERR}};'
  +   'if(name==="csv_upload_begin"&&window.__BEGIN_ERR)return {data:null,error:{message:window.__BEGIN_ERR}};'
  +   'if(name==="csv_window")return {data:{hit:3,rows:50,next_src:1000,dry:!!(args&&args.p_dry)},error:null};'
  +   'return {data:{},error:null};}};'
  + 'GST.db=async function(){return window.__FDB;};';

async function makeCtx(browser) {
  const ctx = await browser.newContext({ viewport:{width:1500,height:1000}, locale:'ko-KR', acceptDownloads:true });
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => {
    let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
    r.fulfill({ status:200, contentType:MIME[path.extname(f)]||'application/octet-stream', body:fs.readFileSync(f) });
  });
  await ctx.route('**gstcsglobal-cloud.github.io/assets/core.js*', r => r.fulfill({ status:200,
    contentType:'application/javascript', body: fs.readFileSync(ROOT+'/assets/core.js','utf8') + STUB }));
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
  return ctx;
}

const browser = await chromium.launch(PW);
const ctx = await makeCtx(browser);

async function openUpload(q) {
  const pg = await ctx.newPage(); const pe = [];
  pg.on('pageerror', e => pe.push(e.message));
  await pg.goto(BASE + '/upload/' + (q||''), { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(900);
  return { pg, pe };
}
const idxOf = (pg, rid) => pg.evaluate(r => String(TABLES.findIndex(t => t.rid === r)), rid);
const canonOf = (pg, spec) => pg.evaluate(s => {
  const S = GST.SM.SPEC[s]; const o = {};
  Object.keys(S.fields).forEach(k => { o[k] = [].concat(S.fields[k])[0]; });
  return { map:o, opt:S.opt||[], keys:Object.keys(S.fields) };
}, spec);
async function dl(pg, action) {
  const [d] = await Promise.all([pg.waitForEvent('download'), action()]);
  const p = path.join(OUT, d.suggestedFilename());
  await d.saveAs(p); return p;
}
const chkText = pg => pg.evaluate(() => document.getElementById('chk').innerText || '');
const qlog = pg => pg.evaluate(() => window.__QLOG.splice(0));

/* ═══ [0] 관리자 화면(파라미터 없음)은 그대로다 ═══ */
console.log('[0] 관리자 화면 회귀');
{
  const { pg, pe } = await openUpload('');
  const n = await pg.evaluate(() => document.querySelectorAll('#tsel option').length);
  const nT = await pg.evaluate(() => TABLES.length);
  is(n === nT && nT === 12, '대상 목록 전부 보인다 (' + n + '/' + nT + ')');
  is(await pg.evaluate(() => !document.getElementById('modeSel').disabled), '넣는 방식 선택 가능');
  is(await pg.evaluate(() => [...document.querySelectorAll('#modeSel option')].every(o => o.style.display !== 'none')),
    '모드 세 가지가 다 보인다');
  is(pe.length === 0, 'JS 에러 없음' + (pe.length ? ' → ' + pe[0] : ''));

  /* ═══ [1] 템플릿 라운드트립 — 수선실적 ═══ */
  console.log('[1] 템플릿 라운드트립 (수선실적)');
  await pg.selectOption('#tsel', await idxOf(pg, 'wk'));
  const tplWk = await dl(pg, () => pg.click('#tplBtn'));
  const C = await canonOf(pg, 'wk');
  const wb = XLSX.read(fs.readFileSync(tplWk));
  is(wb.SheetNames.includes('수선실적') && wb.SheetNames.includes('기입 안내'),
    '시트 구성: ' + wb.SheetNames.join(', '));
  const head = XLSX.utils.sheet_to_json(wb.Sheets['수선실적'], { header:1 })[0] || [];
  const canonArr = C.keys.map(k => C.map[k]);
  is(JSON.stringify(head) === JSON.stringify(canonArr),
    '머리글 = SPEC 별칭 «첫 이름» ' + head.length + '열 (정본 규약)');
  const dataN = XLSX.utils.sheet_to_json(wb.Sheets['수선실적'], { header:1 }).length;
  is(dataN === 1, '예시 데이터 행이 없다 (머리글 1행뿐 — 잊힌 예시행은 가짜 데이터가 된다)');
  const guide = XLSX.utils.sheet_to_json(wb.Sheets['기입 안내'], { header:1 });
  const reqRows = guide.filter(r => r[1] === '필수' && r[0] !== '열 이름').map(r => r[0]);   // 안내표 머리글 행 제외
  const reqWant = C.keys.filter(k => C.opt.indexOf(k) < 0).map(k => C.map[k]);
  is(JSON.stringify(reqRows.sort()) === JSON.stringify(reqWant.slice().sort()),
    '안내의 「필수」 표시가 SPEC(opt 밖)과 일치 — ' + reqRows.length + '개');
  is(guide.some(r => String(r[3]||'').length > 0), '「지금 쓰는 다른 이름」 매핑표가 별칭에서 나온다');

  /* 채워서 도로 먹인다 — 같은 업로드 파서가 판정한다 */
  const dcol = head.indexOf(C.map.dStart), ocol = head.indexOf(C.map.op);
  is(dcol >= 0 && ocol >= 0, '날짜·운영단위 열이 머리글에 있다');
  const rows = [head];
  for (let i = 0; i < 2; i++) {
    const r = head.map(() => 'X'); r[dcol] = '2026-01-0' + (5+i); r[ocol] = 'GST TAIWAN SCRUBBER';
    rows.push(r);
  }
  const filled = path.join(OUT, 'wk-filled.xlsx');
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(rows), '수선실적');
  XLSX.writeFile(wb2, filled);
  await pg.setInputFiles('#fsel', filled);
  await pg.waitForTimeout(1200);
  const ck1 = await chkText(pg);
  is(/열 인식/.test(ck1) && /extra\) 0개|extra 0개|\(extra\) 0/.test(ck1.replace(/\s/g,' ')) || /추가로 담는 열\(extra\) 0개/.test(ck1),
    '라운드트립: 전 열 인식 · extra 0 → ' + (ck1.match(/✅[^\n]*/)||[''])[0]);
  const prep = await pg.evaluate(() => PREP && { n:PREP.rows.length, extra:PREP.rows.every(o=>o.extra===null),
    keys:Object.keys(PREP.rows[0]).length });
  is(prep && prep.n === 2 && prep.extra, '행 2개 전부 정본 필드로 — extra 없음 (필드 ' + (prep&&prep.keys) + '개)');
  is(!/표에 아직 없는 열|표에 없는 헤더|열을 못 찾았습니다/.test(ck1), '누락·미지의 열 경고 없음');

  /* ═══ [1b] 알람·올바 템플릿 — 한 워크북에 두 반쪽 ═══ */
  console.log('[1b] 알람·올바 템플릿 (관리자)');
  await pg.selectOption('#tsel', await idxOf(pg, 'alarm'));
  const tplAl = await dl(pg, () => pg.click('#tplBtn'));
  const wbA = XLSX.read(fs.readFileSync(tplAl));
  is(wbA.SheetNames.includes('P운영_ALARM') && wbA.SheetNames.includes('P운영_ALLBYPASS'),
    '두 반쪽 시트가 한 워크북에: ' + wbA.SheetNames.join(', '));
  const CA = await canonOf(pg, 'alarm');
  const headA = XLSX.utils.sheet_to_json(wbA.Sheets['P운영_ALARM'], { header:1 })[0] || [];
  is(JSON.stringify(headA) === JSON.stringify(CA.keys.map(k => CA.map[k])), '알람 머리글 = SPEC 정본');
  const gA = XLSX.utils.sheet_to_json(wbA.Sheets['기입 안내'], { header:1 }).map(r=>String(r[0]||'')).join('\n');
  is(/두 번/.test(gA) && /사이트 문자/.test(gA), '안내: 두 번 올리기 · 시트 이름 바꾸기 설명');
  await pg.close();
}

/* ═══ [2] ?site=P — 사이트 담당자 화면 ═══ */
console.log('[2] ?site=P');
{
  const { pg, pe } = await openUpload('?site=P');
  is((await pg.title()).includes('P운영'), '제목이 사이트를 말한다');
  const opts = await pg.evaluate(() => [...document.querySelectorAll('#tsel option')].map(o => o.textContent));
  is(opts.length === 2 && /알람/.test(opts[0]) && /올바이패스/.test(opts[1]),
    '대상이 둘뿐 (' + opts.length + ') — 알람·올바만');
  const md = await pg.evaluate(() => ({ v:document.getElementById('modeSel').value,
    dis:document.getElementById('modeSel').disabled,
    hidden:[...document.querySelectorAll('#modeSel option')].filter(o => o.style.display==='none').map(o=>o.value) }));
  is(md.v === 'win' && md.dis, '모드가 「겹치는 구간만 교체」로 잠김');
  is(md.hidden.sort().join(',') === 'add,full', '통째 교체·이어붙이기는 보이지도 않는다');

  /* P+K 두 시트 워크북 — K 는 «무시했다»고 말하고 P 만 올라간다 */
  const CA = await canonOf(pg, 'alarm');
  const headA = CA.keys.map(k => CA.map[k]);
  const mk = (tag) => { const r = headA.map(() => '');
    r[headA.indexOf(CA.map.sn)] = tag + 'BW0001'; r[headA.indexOf(CA.map.alarm)] = 'MSG ' + tag;
    r[headA.indexOf(CA.map.occur)] = '2026-02-10'; return [headA, r]; };
  const mixed = path.join(OUT, 'mixed.xlsx');
  { const w = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(mk('P')), 'P운영_ALARM');
    XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(mk('K')), 'K운영_ALARM');
    XLSX.writeFile(w, mixed); }
  await qlog(pg);
  await pg.selectOption('#tsel', await idxOf(pg, 'alarm'));
  await pg.setInputFiles('#fsel', mixed);
  await pg.waitForTimeout(1400);
  const ck = await chkText(pg);
  is(/무시|올리지 않았습니다/.test(ck) && ck.includes('K운영_ALARM'), 'K 시트는 «무시했다»고 적는다');
  const ops = await pg.evaluate(() => PREP && [...new Set(PREP.rows.map(o => o.op))]);
  is(ops && ops.length === 1 && ops[0] === 'P운영', '올라갈 행은 전부 P운영 (' + JSON.stringify(ops) + ')');
  const L = await qlog(pg);
  const win = L.find(x => x.rpc === 'csv_window');
  is(win && JSON.stringify(win.args.p_ops) === '["P운영"]', '구간 교체 삭제 조건의 op = [P운영] 뿐');
  const pairQ = L.find(x => x.tbl === 'sheet_allbypass' && x.eq && x.eq.length);
  is(pairQ && pairQ.eq.some(e => e[0] === 'op' && e[1] === 'P운영'), '짝 표 행수를 «P운영 분»으로 센다 (eq op)');
  is(/\(P운영 분\)/.test(ck), '짝 표 문구에도 (P운영 분) 이 적힌다');
  is(await pg.evaluate(() => !document.getElementById('goBtn').disabled), '업로드 버튼 열림');

  /* K 시트만 든 워크북 — 집을 시트가 없으니 막힌다 */
  const onlyK = path.join(OUT, 'onlyK.xlsx');
  { const w = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(mk('K')), 'K운영_ALARM');
    XLSX.writeFile(w, onlyK); }
  await pg.setInputFiles('#fsel', onlyK);
  await pg.waitForTimeout(1200);
  const ck2 = await chkText(pg);
  is(/시트가 없습니다/.test(ck2) && /K운영_ALARM/.test(ck2) && /올릴 수 없습니다/.test(ck2),
    'K 전용 워크북은 «이 화면에서 못 올린다»고 막는다');
  is(await pg.evaluate(() => document.getElementById('goBtn').disabled), '그때 업로드 버튼은 닫혀 있다');
  is(pe.length === 0, 'JS 에러 없음' + (pe.length ? ' → ' + pe[0] : ''));
  await pg.close();
}

/* ═══ [3] ?site=TW — 운영단위 검증이 행 단위로 막는다 ═══ */
console.log('[3] ?site=TW');
{
  const { pg, pe } = await openUpload('?site=TW');
  const opts = await pg.evaluate(() => [...document.querySelectorAll('#tsel option')].map(o => o.textContent));
  is(opts.length === 3 && /해외 올바이패스/.test(opts[0]) && /수선실적/.test(opts[1]) && /자재실적/.test(opts[2]),
    '대상: 해외올바·수선·자재 (' + opts.length + ')');
  const C = await canonOf(pg, 'wk');
  const head = C.keys.map(k => C.map[k]);
  const dcol = head.indexOf(C.map.dStart), ocol = head.indexOf(C.map.op);
  const row = (op) => { const r = head.map(() => 'X'); r[dcol] = '2026-03-01'; r[ocol] = op; return r; };
  const q = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
  const csv = rows => rows.map(r => r.map(x=>q(String(x))).join(',')).join('\n');

  await pg.selectOption('#tsel', await idxOf(pg, 'wk'));
  const okCsv = path.join(OUT, 'tw-ok.csv');
  fs.writeFileSync(okCsv, '﻿' + csv([head, row('GST TAIWAN SCRUBBER'), row('GST TAIWAN SCRUBBER')]));
  await qlog(pg);
  await pg.setInputFiles('#fsel', okCsv);
  await pg.waitForTimeout(1200);
  is(/열 인식/.test(await chkText(pg)), 'GST TAIWAN 행만 든 파일은 통과');
  const L = await qlog(pg);
  const win = L.find(x => x.rpc === 'csv_window');
  is(win && JSON.stringify(win.args.p_ops) === '["GST TAIWAN SCRUBBER"]', '삭제 조건 op = [GST TAIWAN SCRUBBER]');

  const badCsv = path.join(OUT, 'tw-bad.csv');
  fs.writeFileSync(badCsv, '﻿' + csv([head, row('GST TAIWAN SCRUBBER'), row('SEC Scrubber')]));
  await pg.setInputFiles('#fsel', badCsv);
  await pg.waitForTimeout(1200);
  const ck = await chkText(pg);
  is(/올릴 수 없는 운영단위/.test(ck) && ck.includes('SEC Scrubber') && /1행/.test(ck),
    'SEC 행이 섞이면 어느 값 몇 행인지 적고 막는다');
  is(await pg.evaluate(() => document.getElementById('goBtn').disabled), '막혔을 때 업로드 버튼 닫힘');
  is(pe.length === 0, 'JS 에러 없음' + (pe.length ? ' → ' + pe[0] : ''));
  await pg.close();
}

/* ═══ [4] ?site=KR 은 없다 (v176 · 국내 데모를 접었다 — 사용자 확정 「국내 데모 페이지는 필요없다 · 전체 업로드 할 거라」) ═══
   쿼리가 붙어도 사이트 경로가 아니다 — 관리자 전체 화면 그대로(운영 표 · 모드 자유)이고, 데모 표(kr_sheet_*)를 한 번도 부르지 않는다.
   쓰기 권한 판정은 can_write 하나다(옛 데모 경로의 «kr 이면 열림»이 되살아나면 붉다). */
console.log('[4] ?site=KR 은 없다 (v176)');
async function openAs(q, me) {
  const pg = await ctx.newPage(); const pe = [];
  pg.on('pageerror', e => pe.push(e.message));
  pg.on('dialog', d => d.accept());
  await pg.addInitScript(m => { window.__ME_OBJ = m; }, me);
  await pg.goto(BASE + '/upload/' + (q || ''), { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(900);
  return { pg, pe };
}
const logText = pg => pg.evaluate(() => document.getElementById('log').innerText || '');
{
  const { pg, pe } = await openAs('?site=KR', { email:'a@t', can_write:true, role:'admin' });
  const T = await pg.evaluate(() => [...document.querySelectorAll('#tsel option')].map(o => TABLES[+o.value]));
  is(!/국내 데모/.test(await pg.title() + await pg.$eval('h1', e => e.textContent)), '제목·머리에 «국내 데모»가 없다');
  is(T.length > 7 && T.every(t => !/^kr_/.test(t.table) && (!t.pair || !/^kr_/.test(t.pair)) && !/^\[데모\]/.test(t.label)),
    '관리자 전체 화면 그대로 — 표·짝 표가 전부 운영 표 (' + T.length + '개)');
  is(!(await pg.evaluate(() => document.getElementById('modeSel').disabled)), '모드를 잠그지 않는다(사이트 경로가 아니다)');
  is(pe.length === 0, 'JS 에러 없음' + (pe.length ? ' → ' + pe[0] : ''));
  await pg.close();
}
{
  /* kr 계정이 남아 있어도 — 쓰기 권한이 없으면 잠긴다 · 데모로 가는 안내도 없다 */
  for (const q of ['', '?site=KR']) {
    const { pg } = await openAs(q, { email:'kr@test.local', can_write:false, role:'kr' });
    const t = await chkText(pg);
    is(await pg.evaluate(() => document.getElementById('fsel').disabled) && /읽기 전용/.test(t) && !/주간 현황\(국내\)|국내 데모/.test(t), 'kr 계정 ' + (q || '(본 업로드)') + ' — 잠김 · 데모 안내 없음');
    await pg.close();
  }
}

await browser.close(); srv.close();
console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + '/' + (pass + fail) + ' 통과');
process.exit(fail ? 1 : 0);
