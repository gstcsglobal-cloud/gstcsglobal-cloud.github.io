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
  /* 등급 — 기본은 지금까지대로(editor 처럼 쓰기 권한). 페이지가 window.__ME_OBJ 를 주면 그 등급으로(국내 데모 · v146 — 진짜 perm 처럼 _meApply 까지) */
  + 'GST.sheetWrite=async function(){var m=window.__ME_OBJ;if(m){GST._meApply(m);return {ok:true,can_write:!!m.can_write,role:m.role,email:m.email};}return {ok:true,can_write:true,role:"editor"};};'
  + 'window.__QLOG=[];'
  + 'window.__FDB={from:function(tbl){var st={tbl:tbl,eq:[],neq:[],op:"select",ins:0};'
  +  'var q={select:function(){return q},eq:function(k,v){st.eq.push([k,v]);return q},'
  +  'neq:function(k,v){st.neq.push([k,v]);return q},order:function(){return q},limit:function(){return q},'
  +  'insert:function(rows){st.op="insert";st.ins=rows.length;return q},'
  +  'upsert:function(o){st.op="upsert";st.row=o;return q},delete:function(){st.op="delete";return q},'
  +  'then:function(res,rej){window.__QLOG.push(JSON.parse(JSON.stringify(st)));'
  +   'window.__INS=window.__INS||{};'
  +   'if(st.tbl==="colmap_site"){window.__CM=window.__CM||[];var f=function(r){return st.eq.every(function(e){return r[e[0]]===e[1];});};'
  +   'if(window.__CM_DENY&&st.op!=="select")return Promise.resolve({data:[],error:null}).then(res,rej);'
  +   'if(st.op==="upsert"){window.__CM=window.__CM.filter(function(r){return !(r.site===st.row.site&&r.tbl===st.row.tbl&&r.field===st.row.field);});window.__CM.push(st.row);return Promise.resolve({data:[st.row],error:null}).then(res,rej);}'
  +   'if(st.op==="delete"){var d=window.__CM.filter(f);window.__CM=window.__CM.filter(function(r){return !f(r);});return Promise.resolve({data:d,error:null}).then(res,rej);}'
  +   'return Promise.resolve({data:window.__CM.filter(f),error:null}).then(res,rej);}'
  +   'if(st.op==="insert"){window.__INS[st.tbl]=(window.__INS[st.tbl]||0)+st.ins;return Promise.resolve({error:null}).then(res,rej);}'
  +   'var base={sheet_alarm:120,sheet_allbypass:80,sheet_wk:500,sheet_mat:300,sheet_inst:900}[st.tbl];'
  +   'var n=st.eq.length?17:((base==null?60:base)+(window.__INS[st.tbl]||0));'
  +   'return Promise.resolve({count:n,data:[],error:null}).then(res,rej);}};return q;},'
  +  'rpc:async function(name,args){window.__QLOG.push({rpc:name,args:args});'
  +   'if(name==="csv_table_cols"){var cols={sheet_edu:["No","Site","인원","사원번호","교육완료일","id","src_row","created_at","imported_at","extra"]}[args&&args.p_tbl];'
  +    'return {data:cols||null,error:null};}'
  +   'if(name==="value_groups")return {data:window.__VG||[],error:null};'
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


/* t-colmap — 사이트별 열 맵핑 (v149). 지어낸 자료만.
   ① 자동 인식이 못 찾은 필수 열은 «말하고» 패널을 연다 ② 머리글을 고르면 사이트 기본값으로 저장되고 다시 검사해 통과한다
   ③ 저장값은 «머리글 이름»이라 열 위치가 바뀌어도 맞는다 ④ 자동이 잘못 잡은 열을 지정으로 바꿀 수 있다
   ⑤ 사이트마다 따로 저장된다 ⑥ «자동 인식»으로 되돌리면 지정이 지워진다 ⑦ 권한이 없으면 저장이 «실패»로 말한다 */
const browser = await chromium.launch(PW);
const ctx = await makeCtx(browser);
const pg = await ctx.newPage(); const pe=[]; pg.on('pageerror', e => pe.push(e.message));
await pg.goto(BASE + '/upload/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(900);
const spec = await pg.evaluate(() => { const S=GST.SM.SPEC.inst; const o={}; Object.keys(S.fields).forEach(k=>o[k]=[].concat(S.fields[k])[0]); return o; });
const mk = (hdr, swap) => { let H=Object.keys(spec).map(k=>hdr[k]||spec[k]); if(swap) H=[H[H.length-1]].concat(H.slice(0,-1));
  const rows=[H]; for(let i=0;i<3;i++) rows.push(H.map((h,j)=>h==='시리얼'||h==='Scrubber S/N'?'ZZS'+i:'v'+j));
  return rows.map(r=>r.join(',')).join('\n')+'\n'; };
const put = async (csv, name) => { const p=path.join(OUT,name); fs.writeFileSync(p,'﻿'+csv); await pg.setInputFiles('#fsel', p); await pg.waitForTimeout(1200); };
const chk = () => pg.evaluate(() => document.getElementById('chk').innerText);
await pg.selectOption('#tsel', await pg.evaluate(() => String(TABLES.findIndex(t=>t.rid==='inst'))));

console.log('[1] 못 찾은 필수 열 — 말하고 패널을 연다');
await put(mk({sn:'시리얼'}), 'a.csv');
let t1 = await chk();
is(/필수 열을 못 찾았습니다/.test(t1), '못 찾았다고 말한다');
is(await pg.evaluate(() => !!document.querySelector('details.gcm[open] select[data-cmap="sn"]')), '열 맵핑 패널이 열려 있고 S/N 칸에 고르기가 있다');
is(await pg.evaluate(() => document.getElementById('goBtn').disabled), '올리기 단추는 잠겨 있다');

console.log('[2] 머리글을 고르면 저장하고 다시 검사한다');
await pg.selectOption('select[data-cmap="sn"]', '시리얼'); await pg.waitForTimeout(1500);
const cm = await pg.evaluate(() => window.__CM);
is(cm.length===1 && cm[0].site==='ALL' && cm[0].tbl==='inst' && cm[0].field==='sn' && cm[0].header==='시리얼', '사이트 기본값으로 저장 — '+JSON.stringify(cm));
t1 = await chk();
is(/열 인식/.test(t1) && !/못 찾았습니다/.test(t1), '다시 검사해 통과');
is(/지정 1개/.test(t1), '패널 머리에 «지정 1개»');
is(await pg.evaluate(() => document.getElementById('goBtn').disabled && !!document.getElementById('cmOk')), '지정이 있으면 «확인했습니다» 전까지 올리기 단추가 잠긴다');
await pg.check('#cmOk');
is(await pg.evaluate(() => !document.getElementById('goBtn').disabled), '확인하면 올리기 단추가 열린다');
is(await pg.evaluate(() => (PREP.rows[0]||{}).sn==='ZZS0'), '그 열의 값이 S/N 으로 들어간다');

console.log('[3] 열 위치가 바뀌어도 머리글로 맞는다');
await pg.evaluate(() => { GST.cmap._c={}; });
await put(mk({sn:'시리얼'}, true), 'b.csv');
is(await pg.evaluate(() => PREP && (PREP.rows[0]||{}).sn==='ZZS0'), '맨 앞으로 옮긴 열도 S/N 으로 잡힌다');

console.log('[4] 자동이 잡은 열을 지정으로 바꾼다');
const other = spec.model;
await pg.selectOption('select[data-cmap="customer"]', other); await pg.waitForTimeout(1500);
is(await pg.evaluate(o => { const r=PREP.rows[0]; return r && r.customer===r.model; }, other), '고객사가 지정한 머리글(모델 열)의 값으로 바뀐다');
await pg.selectOption('select[data-cmap="customer"]', ''); await pg.waitForTimeout(1500);
is(await pg.evaluate(() => !window.__CM.some(r=>r.field==='customer')), '«자동 인식»으로 되돌리면 지정이 지워진다');
is(await pg.evaluate(() => { const r=PREP.rows[0]; return r && r.customer!==r.model; }), '값도 자동 인식으로 돌아온다');

console.log('[5] 사이트마다 따로');
const pg2 = await ctx.newPage(); await pg2.goto(BASE + '/upload/?site=KR', { waitUntil:'domcontentloaded' }); await pg2.waitForTimeout(900);
await pg2.evaluate(cm => { window.__CM = cm; }, await pg.evaluate(() => window.__CM));
await pg2.selectOption('#tsel', await pg2.evaluate(() => String(TABLES.findIndex(t=>t.rid==='inst'))));
const p2=path.join(OUT,'c.csv'); fs.writeFileSync(p2,'﻿'+mk({sn:'시리얼'})); await pg2.setInputFiles('#fsel', p2); await pg2.waitForTimeout(1500);
is(/못 찾았습니다/.test(await pg2.evaluate(() => document.getElementById('chk').innerText)), 'KR 화면은 관리자(ALL) 지정을 안 쓴다');
const ql = await pg2.evaluate(() => window.__QLOG.filter(q=>q.tbl==='colmap_site'));
is(ql.some(q => q.eq.some(e=>e[0]==='site'&&e[1]==='KR')), '지정은 site=KR 로 묻는다');

console.log('[6] 권한이 없으면 «실패»로 말한다');
await pg.evaluate(() => { window.__CM_DENY=1; GST.cmap._c={}; });
let alerted=''; pg.on('dialog', d => { alerted=d.message(); d.dismiss(); });
await pg.selectOption('select[data-cmap="customer"]', other); await pg.waitForTimeout(1200);
is(/저장 실패/.test(alerted), '조용히 넘어가지 않는다 — '+alerted.slice(0,40));

console.log('[7] Import 표(교육) — 표의 열마다 머리글을 고른다 · 모르는 열은 막지 않고 밝힌다');
await pg.evaluate(() => { window.__CM_DENY=0; window.__CM=[]; GST.cmap._c={}; });
await pg.selectOption('#tsel', await pg.evaluate(() => String(TABLES.findIndex(t=>t.rid==='edu'))));
await put('번호,현장,이름,사번,교육완료일,비고\n1,X1,가나,A001,2026-01-02,메모\n2,X2,다라,A002,2026-02-03,\n', 'e.csv');
let t7 = await chk();
is(/열 맵핑/.test(t7) && /올리지 않는 열/.test(t7), '패널과 «올리지 않는 열» 목록이 뜬다 (예전처럼 통째로 막지 않는다)');
is(await pg.evaluate(() => !!document.getElementById('cmOk') && document.getElementById('goBtn').disabled), '맞는 열이 있으면 진행하되, 버리는 열이 있으니 확인을 받는다');
is(await pg.evaluate(() => (PREP.rows[0]||{})['교육완료일']==='2026-01-02' && (PREP.rows[0]||{})['인원']==null), '자동 인식은 이름이 같은 열만');
await pg.selectOption('select[data-cmap="인원"]', '이름'); await pg.waitForTimeout(1500);
is(await pg.evaluate(() => window.__CM.some(r=>r.tbl==='edu'&&r.field==='인원'&&r.header==='이름')), '표 열 이름으로 저장 (tbl=edu)');
is(await pg.evaluate(() => (PREP.rows[0]||{})['인원']==='가나'), '지정한 머리글의 값이 그 표 열로 들어간다');
await put('a,b,c\n1,2,3\n', 'e2.csv');
is(/하나도 없습니다/.test(await chk()) && await pg.evaluate(() => !!document.querySelector('details.gcm select[data-cmap]')), '하나도 안 맞으면 멈추되 고를 패널을 준다');

console.log('[8] 알람 워크북 — 시트 태그별로 기억한다');
await pg.evaluate(() => { window.__CM=[]; GST.cmap._c={}; });
await pg.selectOption('#tsel', await pg.evaluate(() => String(TABLES.findIndex(t=>t.rid==='alarm'))));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['장비번호','Alarm Comment','Occur Time','내적/외적'],
  ['ZZA-0001','PRESSURE HIGH','2026-08-03 10:00:00','내적'],['ZZA-0002','FLAME OFF','2026-08-04 11:00:00','외적']]), 'P운영_ALARM');
const xp = path.join(OUT,'al.xlsx'); XLSX.writeFile(wb, xp);
await pg.setInputFiles('#fsel', xp); await pg.waitForTimeout(2500);
let t8 = await chk();
is(/헤더 행을 찾지 못했습니다|열을 못 찾았습니다/.test(t8) && await pg.evaluate(() => !!document.querySelector('select[data-cmap="sn"][data-tbl="alarm:P"]')), 'S/N 머리글이 다르면 말하고 그 시트의 패널을 연다');
await pg.selectOption('select[data-cmap="sn"][data-tbl="alarm:P"]', '장비번호'); await pg.waitForTimeout(2500);
is(await pg.evaluate(() => window.__CM.some(r=>r.tbl==='alarm:P'&&r.field==='sn'&&r.header==='장비번호')), '시트 태그 열쇠(alarm:P)로 저장');
t8 = await chk();
is(/시트 1개/.test(t8) && await pg.evaluate(() => (PREP.rows[0]||{}).sn==='ZZA-0001'), '다시 검사해 그 열이 S/N 으로 들어간다');
console.log('[9] 새 값 점검 — 처음 보는 사이트 · 법인 칸의 국가 이름 · 빈 설비상태 (v152)');
await pg.evaluate(() => { window.__CM=[]; GST.cmap._c={}; window.__VG=[
  {country:'GST TAIWAN SCRUBBER',customer:'Testco Memory Taiwan Co., Ltd.(F16)',location:null,fab:'F16',state:'Operation',n:50},
  {country:'OPX Scrubber',customer:'TESTCO',location:'Q1',fab:'Q1-A',state:'Operation',n:20}]; });
await pg.selectOption('#tsel', await pg.evaluate(() => String(TABLES.findIndex(t=>t.rid==='inst'))));
{ const HH=Object.keys(spec).map(k=>spec[k]); const row=o=>Object.keys(spec).map(k=>o[k]==null?'':o[k]);
  const csv=[HH, row({sn:'ZZS-1',country:'TAIWAN',customer:'TESTCO',location:'TAINAN',fab:'F16S',fabIn:'2026-09-01'}), row({sn:'ZZS-2',country:'TAIWAN',customer:'TESTCO',location:'TAINAN',fab:'F16S'}),
    row({sn:'ZZS-3',country:'GST TAIWAN SCRUBBER',customer:'TESTCO',fab:'F16',state:'Operation'}), HH.map(()=>'')].map(r=>r.join(',')).join('\n')+'\n';
  await put(csv, 'v.csv'); }
const t9 = await chk();
is(/새 값 점검/.test(t9) && /FAB\(사이트\) «F16S» 2행 — 처음 보는 값/.test(t9), '처음 보는 FAB(F16S)를 행 수와 함께 짚는다');
is(/법인 «TAIWAN» 2행 — 법인 칸에 «국가 이름»/.test(t9) && /GST TAIWAN SCRUBBER/.test(t9), '법인 칸의 국가 이름 — 같은 국가의 법인 이름과 «행이 따로 선다»는 결과까지');
is(/설비상태 빈칸 2행 — 반입일\(FAB In\)이 있는 1행만/.test(t9), '빈 설비상태 — 몇 행이 대수에서 빠지는지');
is(!/«F16»/.test(t9) && !/OPX/.test(t9), '이미 있는 값은 짚지 않는다');
is(/기준 정보/.test(t9), '무엇을 하면 되는지(데이터 관리 → 기준 정보)를 적는다');
await pg.evaluate(() => { GST.vmap.rules=[{tbl:'inst',col:'country',raw:'TAIWAN',when_col:'',when_val:'',val:'GST TAIWAN SCRUBBER'}]; GST.vmap._p=Promise.resolve(GST.vmap.rules); GST.cmap._c={}; });
await pg.evaluate(() => window.checkFile()); await pg.waitForTimeout(1500);
is(!/국가 이름/.test(await chk()), '규칙(TAIWAN → GST TAIWAN SCRUBBER)이 있으면 그 경고는 사라진다 — 같은 판정 함수');
is(pe.length===0, 'JS 에러 0' + (pe.length?' → '+pe[0]:''));
await browser.close(); srv.close();
console.log(fail?`\n❌ t-colmap: ${pass} 통과 · ${fail} 실패`:`\n✅ t-colmap: ${pass}/${pass} 통과`);
process.exit(fail?1:0);
