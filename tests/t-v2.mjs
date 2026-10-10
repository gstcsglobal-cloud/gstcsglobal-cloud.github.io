/* t-v2 — 2단계 «제품화» 밑바탕: 내 화면(/home/) · 운영 목표(/targets/) · assets/v2.js. 지어낸 자료만(t-leak).
   지키는 것:
   ① 숫자는 GST.ops 를 지난다 — 관제(/hub/)와 같은 창·같은 판정(PM 비율 = 관제의 PM 실시율 게이지 · 가동률 = 가동 게이지)
   ② 목표는 «가장 좁은 것»(운영단위 > 구분 > 전사)으로 판정하고, 카드의 네 줄(이름·값·목표·직전 대비)이 언제나 같은 자리에 선다
   ③ 카드가 센 배열이 그대로 팝업 목록이 된다(v133)
   ④ 역할(경영진·팀장·현장)·범위 전환 · 기본 화면 저장(서버 → 다시 열 때 복원)
   ⑤ 목표 표가 없을 때 «말하며» 선다(관리자에게만 원인) · 국내 원장이 비면 그 사실을 누구에게나
   ⑥ 목표 관리: 관리자는 저장(p_at 실어 보냄)·충돌을 말함 · 조회자는 읽기 전용
   ⑦ 언어 전환 · JS 에러 0 · 외부 요청 0
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-v2.mjs */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };
const q = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const csv = rows => rows.map(r => r.map(q).join(',')).join('\n') + '\n';
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const NOW = new Date();
const ASOF = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() - 1));
const dAgo = n => new Date(ASOF.getTime() - n * 86400000);

/* ---- 자료: t-hub 와 같은 모양 + 우한 WHC9 에 7일 간격 재고장 하나 ----
   반입 50(대만 30 · 우한 10 · 국내 10 — 반납 2 제외) · 가동 48 → 가동률 96.0
   최근 4주 고장: 대만 15(이번 주 12 + 1·2·3주 전) · 우한 6(주마다 1 × 4 + WHC9 둘) · 국내 2 = 23 → 100대당 46.00
   직전 4주 고장: 대만 4 · 우한 4 = 8 → 16.00 · 최근 4주 PM 5(대만 TBM) → PM 비율 5/28 = 17.9 → «18» */
const IH = ['NO','Country','Customer','Location','FAB','Line','Bay','Scrubber CODE','Scrubber S/N','Scrubber Model',
  'Burner Type','Scrubber type','Process','Detail Process(HQ)','Detail Process(Customer)','Main Tool ID','Main Tool Maker',
  'Main Tool Model','Receipt date','Setup date','Turn-on date','Warranty date','Warranty In/Out','설비상태'];
const inst = [IH]; let no = 0;
const unit = (op, cust, fab, code, state, wd, wio) => { no++; inst.push([no, op, cust, 'LOC', fab, 'L1', 'B1', code, code + 'S', 'GST-1000',
  'BURN', 'SINGLE', 'ETCH', 'DRY', 'DRY', 'MT' + no, 'TEL', 'TEL-A', '2023-03-01', '2023-03-10', '2023-03-20', wd || '2030-01-01', wio || 'IN', state]); };
for (let i = 1; i <= 30; i++) unit('GST TAIWAN SCRUBBER', 'Micron Memory Taiwan Co., Ltd.(F16)', 'F16', 'TWC' + i, i <= 28 ? 'Operation' : 'Set-up', i <= 3 ? ymd(dAgo(-30)) : '');
for (let i = 1; i <= 10; i++) unit('GST CHINA(WUHAN) SCRUBBER', 'YMTC', 'FAB1', 'WHC' + i, 'Operation');
for (let i = 1; i <= 12; i++) unit('SEC Scrubber', '삼성전자(주)', 'P1', 'KRC' + i, i <= 10 ? 'Operation' : '반납');
const WHF = ['제품군','운영단위','고객사','단지','라인','BAY','공정','세부공정','MODEL(자사)','실적코드','상태','의뢰유형','작업단계',
  '챔버','WRS NO','메인설비호기','제품코드','설비호기','채널위치','S/N(IN)','S/N(OUT)','유/무상','알람유형','현상','원인','조치',
  '세부조치내용','작업시작일','작업종료일','작업시작시간','작업종료시간','실적등록일','출하일자','총 이동시간(분)','작업시간(분)',
  '작업공수','작업자','작업자수'];
const wk = [WHF]; let n = 0;
const w = (op, campus, stage, days, code) => { n++; const d = ymd(dAgo(days));
  wk.push(['SCRUBBER', op, 'C', campus, campus, 'B1', 'ETCH', 'DRY', 'GST-1000', 'R' + n, '완료', '정기', stage, 'A', 'W' + n, 'MT', 'P',
    code, 'L', code + 'S', '', '무상', '', '', 'PUMP', '', '', d, d, '09:00', '10:00', d, '', '10', '60', '60', 'STAFF', '1']); };
for (let i = 0; i < 12; i++) w('GST TAIWAN SCRUBBER', 'F16', 'BM', 0, 'TWC' + (i % 4 + 1));
for (let k = 1; k <= 11; k++) w('GST TAIWAN SCRUBBER', 'F16', 'BM', 7 * k, 'TWC' + (10 + k));
for (let k = 0; k <= 11; k++) w('GST CHINA(WUHAN) SCRUBBER', 'FAB1', 'BM', 7 * k, 'WHC' + (k % 10 + 1));
w('GST CHINA(WUHAN) SCRUBBER', 'FAB1', 'BM', 2, 'WHC9'); w('GST CHINA(WUHAN) SCRUBBER', 'FAB1', 'BM', 9, 'WHC9');
for (let i = 0; i < 2; i++) w('SEC Scrubber', 'P1', 'BM', 0, 'KRC' + (i + 1));
for (let i = 0; i < 5; i++) w('GST TAIWAN SCRUBBER', 'F16', 'TBM', 0, 'TWC' + (20 + i));
const SHEETS = { '891608329': csv(inst), '646668307': csv(wk) };

/* ---- 가짜 Supabase — 「무엇을 보냈나」를 기록하고 RPC 는 setup-26 의 규칙을 흉내 낸다 ----
   (규칙 자체는 t-targets 가 진짜 Postgres 로 지킨다 — 여기서는 화면이 «무엇을 실어 보내나»만 본다) */
const T0 = '2026-10-01T00:00:00.000Z';
const DB0 = {
  ops_targets: [
    { id:1, metric:'bm_per100', scope_kind:'all', scope:'', target:30, warn:null, dir:'le', note:null, updated_at:T0, updated_by:'boss@t', removed_at:null },
    { id:2, metric:'run_rate', scope_kind:'all', scope:'', target:93, warn:null, dir:'ge', note:null, updated_at:T0, updated_by:'boss@t', removed_at:null },
    { id:3, metric:'bm_per100', scope_kind:'op', scope:'GST CHINA(WUHAN) SCRUBBER', target:60, warn:null, dir:'le', note:null, updated_at:T0, updated_by:'boss@t', removed_at:null }
  ],
  action_items: [
    { id:11, kind:'risk', ref:'risk:A', sev:'warn', status:'open', title:'옛 기한 일', op:'GST TAIWAN SCRUBBER', assignee:null, due:'2020-01-01', updated_at:T0 },
    { id:12, kind:'manual', ref:null, sev:'bad', status:'ack', title:'새 기한 일', op:'GST TAIWAN SCRUBBER', assignee:'kim', due:'2099-01-01', updated_at:T0 },
    { id:13, kind:'manual', ref:null, sev:'warn', status:'done', title:'닫힌 옛 일', op:'GST TAIWAN SCRUBBER', assignee:null, due:'2020-01-01', updated_at:T0 }
  ],
  allowed_users: [ { email:'boss@t', home_view:null, home_op:null, lang:null } ]
};
const FAKE = `
(function(){
  var K='__gstFakeDB';
  function db(){ try{ var s=localStorage.getItem(K); if(s) return JSON.parse(s); }catch(e){} return JSON.parse(${JSON.stringify(JSON.stringify(DB0))}); }
  function put(d){ try{ localStorage.setItem(K, JSON.stringify(d)); }catch(e){} }
  window.__RPC=[];
  function Q(table){ var F=[]; var api={
    select:function(){return api;}, order:function(){return api;}, limit:function(){return api;},
    is:function(c,v){ F.push(function(r){ return v===null?r[c]==null:r[c]===v; }); return api; },
    eq:function(c,v){ F.push(function(r){ return r[c]===v; }); return api; },
    not:function(c,op,v){ if(op==='in'){ var L=String(v).replace(/[()]/g,'').split(','); F.push(function(r){ return L.indexOf(r[c])<0; }); }
      else F.push(function(r){ return r[c]!=null; }); return api; },
    then:function(res,rej){ var E=(window.__DBERR||{})[table]; if(E) return Promise.resolve({data:null,error:E}).then(res,rej);
      var d=(db()[table]||[]).filter(function(r){ return F.every(function(f){ return f(r); }); });
      return Promise.resolve({data:JSON.parse(JSON.stringify(d)),error:null}).then(res,rej); } };
    return api; }
  var C={ from:Q, rpc:async function(fn,a){ window.__RPC.push({fn:fn,args:a}); var d=db(), now=new Date().toISOString();
    var E=(window.__RPCERR||{})[fn]; if(E) return {data:{error:E},error:null};
    if(fn==='target_save'){ var cur=d.ops_targets.find(function(t){ return t.metric===a.p_metric&&t.scope_kind===a.p_scope_kind&&t.scope===(a.p_scope_kind==='all'?'':a.p_scope)&&!t.removed_at; });
      if(cur){ if(a.p_at!==cur.updated_at) return {data:{error:'conflict'},error:null}; cur.target=a.p_target; cur.warn=a.p_warn; cur.dir=a.p_dir; cur.note=a.p_note; cur.updated_at=now; put(d); return {data:{ok:true,id:cur.id,updated_at:now},error:null}; }
      if(a.p_at) return {data:{error:'conflict'},error:null};
      var id=100+d.ops_targets.length; d.ops_targets.push({id:id,metric:a.p_metric,scope_kind:a.p_scope_kind,scope:a.p_scope_kind==='all'?'':a.p_scope,target:a.p_target,warn:a.p_warn,dir:a.p_dir,note:a.p_note,updated_at:now,updated_by:'boss@t',removed_at:null});
      put(d); return {data:{ok:true,id:id,updated_at:now},error:null}; }
    if(fn==='target_remove'){ var x=d.ops_targets.find(function(t){ return t.id===a.p_id&&!t.removed_at; }); if(!x) return {data:{error:'not_found'},error:null};
      if(x.updated_at!==a.p_at) return {data:{error:'conflict'},error:null}; x.removed_at=now; x.updated_at=now; put(d); return {data:{ok:true},error:null}; }
    if(fn==='pref_save'){ var u=d.allowed_users[0]; u.home_view=a.p_view; u.home_op=a.p_op; u.lang=a.p_lang; put(d); return {data:{ok:true},error:null}; }
    return {data:null,error:{message:'unknown rpc'}}; } };
  GST.db=async function(){ return C; };
  GST.loadMe=function(){ var r=window.__ROLE||{email:'boss@t',can_write:true,role:'admin'}; GST._meApply(r); GST._meP=Promise.resolve(r); return GST._meP; };
})();`;

const MIME = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html' };
const srv = http.createServer((rq, rs) => { let u = decodeURIComponent(rq.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.statusCode = 404; rs.end('nf'); return; }
  rs.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); rs.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(0, r));
const BASE = 'http://127.0.0.1:' + srv.address().port;
const NM = ROOT + '/tests/node_modules/';
const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
  + 'GST.getSession=async function(){return {user:{email:"boss@t"}};};GST.token=async function(){return "t";};'
  + 'GST.csvTableRows=async function(){return [];};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();if(GST._authOk)GST._authOk();return true;};';
const browser = await chromium.launch(PW);
const ctx = await browser.newContext({ viewport:{ width:1500, height:1100 }, locale:'ko-KR' });
await ctx.route('**gstcsglobal-cloud.github.io/**', r => { let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
  r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) }); });
await ctx.route('**/assets/core.js*', r => r.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB }));
/* v2.js 뒤에 가짜 DB 를 붙인다(core 뒤가 아니라 v2 뒤 — GST.db 를 core 가 정의한 뒤에 덮어야 한다) */
await ctx.route('**/assets/v2.js*', r => r.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync(ROOT + '/assets/v2.js', 'utf8') + FAKE }));
await ctx.route('**/cdn.jsdelivr.net/**', r => { const u = r.request().url();
  if (u.includes('papaparse')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM + 'papaparse/papaparse.min.js', 'utf8') });
  if (u.endsWith('.css')) return r.fulfill({ status:200, contentType:'text/css', body:'' });
  return r.fulfill({ status:200, contentType:'application/javascript', body:'' }); });
await ctx.route('**/spreadsheets/**', r => { const gid = (r.request().url().match(/gid=(\d+)/) || [])[1]; r.fulfill({ status:200, contentType:'text/csv', body: SHEETS[gid] || '' }); });
await ctx.route('**supabase**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));
const ext = []; ctx.on('request', rq => { const u = rq.url(); if (/^https?:/.test(u) && !/127\.0\.0\.1|gstcsglobal-cloud\.github\.io|cdn\.jsdelivr|supabase|spreadsheets/.test(u)) ext.push(u); });

const open = async (url, init) => { const p = await ctx.newPage(); p._pe = []; p.on('pageerror', e => p._pe.push(e.message));
  if (init) await p.addInitScript(init);
  await p.emulateMedia({ reducedMotion:'reduce' }); await p.goto(BASE + url, { waitUntil:'domcontentloaded' });
  await p.waitForFunction(() => /✅|❌/.test((document.getElementById('status') || {}).textContent || ''), null, { timeout:15000 }).catch(() => {});
  await p.waitForTimeout(300); return p; };
const kpis = p => p.evaluate(() => { const o = {}; document.querySelectorAll('#kpis .ds-kpi').forEach(b => { o[b.dataset.k] = { v:b.querySelector('.ds-kpi-v b').textContent,
  st:(b.className.match(/st-(\w+)/) || [])[1], t:b.querySelector('.ds-kpi-t').textContent, d:b.querySelector('.ds-kpi-d').textContent,
  rows:Array.from(b.children).map(c => c.className.split(' ')[0]) }; }); return o; });
const clearDB = 'try{localStorage.removeItem("__gstFakeDB");localStorage.removeItem("gst_home_pref");}catch(e){}';

console.log('[0] v2.js — 지표 목록과 네 언어');
const p0 = await open('/home/?view=exec', clearDB);
const cat = await p0.evaluate(() => { const miss = []; GST.METRIC_ORDER.forEach(k => ['ko','en','zh','ja'].forEach(l => { ['m_','d_'].forEach(pre => { if (!GST.V2_T[l][pre + k]) miss.push(l + ':' + pre + k); }); }));
  const keys = Object.keys(GST.V2_T.ko).sort().join(); const same = ['en','zh','ja'].every(l => Object.keys(GST.V2_T[l]).sort().join() === keys);
  return { miss, same, order:GST.METRIC_ORDER.every(k => GST.METRICS[k]) && Object.keys(GST.METRICS).length === GST.METRIC_ORDER.length }; });
is(!cat.miss.length && cat.same, 'GST.METRICS 의 지표마다 m_·d_ 가 네 언어에 있다 · V2_T 네 언어 키가 같다' + (cat.miss.length ? ' → ' + cat.miss.join(',') : ''));
is(cat.order, 'METRIC_ORDER 와 METRICS 가 같은 집합');
const jg = await p0.evaluate(() => { const J = (m, v, t) => GST.targets.judge(m, v, t);
  return [J('bm_per100', 3, {target:3, dir:'le'}), J('bm_per100', 3.4, {target:3, dir:'le'}), J('bm_per100', 3.5, {target:3, dir:'le'}),
    J('run_rate', 90, {target:93, dir:'ge'}), J('run_rate', 89.9, {target:93, dir:'ge'}), J('run_rate', 91, {target:93, warn:92, dir:'ge'}), J('pm_ratio', null, {target:50, dir:'ge'}), J('pm_ratio', 50, null)].join(); });
is(jg === 'ok,warn,bad,warn,bad,bad,,', '판정 — 목표 이하 정상 · 15% 띠 주의 · 그 너머 위험 · 퍼센트는 절대 띠(3p) · warn 이 있으면 그것 · 값·목표 없으면 판정 없음 (' + jg + ')');

console.log('[1] 경영진 — 숫자는 GST.ops, 목표는 가장 좁은 것');
let K = await kpis(p0);
is(K.run_rate && K.run_rate.v === '96.0' && K.run_rate.st === 'ok', '가동률 96.0% (48/50 · 반납 제외) · 전사 목표 93 이상 → 정상 (' + (K.run_rate || {}).v + ' ' + (K.run_rate || {}).st + ')');
is(K.bm_per100 && K.bm_per100.v === '46.00' && K.bm_per100.st === 'bad', '100대당 고장 46.00 (23 ÷ 50 × 100) · 목표 30 이하 → 위험 (' + (K.bm_per100 || {}).v + ' ' + (K.bm_per100 || {}).st + ')');
is(/▲ \+30\.00/.test(K.bm_per100.d), '직전 4주(16.00) 대비 ▲ +30.00 (' + K.bm_per100.d + ')');
is(K.pm_ratio && K.pm_ratio.v === '18' && K.pm_ratio.st === 'none' && /목표 미설정/.test(K.pm_ratio.t), 'PM 비율 18% (5 ÷ 28) · 목표 없으면 «목표 미설정» (' + (K.pm_ratio || {}).v + ')');
is(K.repeat14 && K.repeat14.v === '1', '14일 안 재고장 설비 1 (우한 WHC9 · 7일 간격)');
is(!K.act_overdue, '경영진 카드는 넷(처리함 기한은 팀장·현장)');
const rowsSame = Object.values(K).every(k => k.rows.join() === 'ds-kpi-l,ds-kpi-v,ds-kpi-bar,ds-kpi-t,ds-kpi-d');
is(rowsSame, '카드 네 줄(이름·값·막대·목표·직전 대비)이 모든 카드에서 같은 순서 · 같은 자리');
const ops = await p0.evaluate(() => Array.from(document.querySelectorAll('#cOps tbody tr')).map(tr => ({ op:tr.dataset.op, st:(tr.querySelector('.ds-pill').className.match(/\b(ok|warn|bad)\b/) || [])[1] || '',
  bm:tr.children[4].textContent.trim(), pm:tr.children[5].textContent.trim(), run:tr.children[3].textContent.trim() })));
is(ops.length === 3 && ops[0].op === 'GST TAIWAN SCRUBBER' && ops[0].st === 'bad' && ops[0].bm === '50.00', '운영단위 표 첫 줄 = 대만(50.00 · 전사 목표 30 → 위험)');
const wh = ops.find(o => /WUHAN/.test(o.op)), kr = ops.find(o => /SEC/.test(o.op));
is(wh && wh.bm === '60.00' && wh.st === 'ok', '우한은 «자기» 목표(60 이하)로 판정 — 같은 60.00 이 전사 목표로는 위험 (' + (wh || {}).bm + ' ' + (wh || {}).st + ')');
is(kr && kr.bm === '20.00' && kr.st === 'ok', '국내(SEC) 20.00 · 정상');
const dec = await p0.evaluate(() => Array.from(document.querySelectorAll('#cDec .ds-row b')).map(b => b.textContent));
is(dec.some(s => /TAIWAN.*100대당 고장 50\.00/.test(s)), '결정할 것 — 대만 고장률 초과가 선다');
is(dec.some(s => /WHC9.*재고장 1회/.test(s)), '결정할 것 — 재고장 설비(WHC9)가 선다');
is(dec.some(s => /기한 넘은 처리함 일 1건/.test(s)), '결정할 것 — 기한 넘은 처리함 일 1건(닫힌 일은 안 셈)');
await p0.click('#kpis .ds-kpi[data-k="bm_per100"]'); await p0.waitForTimeout(300);
const mr = await p0.evaluate(() => { const b = document.querySelector('.gov-body'); return b ? b.querySelectorAll('tbody tr').length : -1; });
is(mr === 23, '고장률 카드를 누르면 «그 23건»이 목록으로 (받은 ' + mr + ')');
await p0.evaluate(() => GST._ovClose && GST._ovClose());
const trend = await p0.evaluate(() => ({ bars:document.querySelectorAll('#cTrend rect').length, tl:!!document.querySelector('#cTrend line.tl'), hot:document.querySelectorAll('#cTrend rect.hot').length }));
is(trend.bars === 12 && trend.tl, '주별 고장 12주 막대 + 목표 점선(주 단위 환산)');
const ban = await p0.evaluate(() => document.getElementById('banners').textContent);
is(/원장이 비어/.test(ban), '국내 알람 원장이 비면 그 사실을 띠로 (숫자의 뜻이 바뀐다 · v92)');

console.log('[2] 범위 전환 — 운영단위 · 구분');
await p0.selectOption('#scope', 'o:GST CHINA(WUHAN) SCRUBBER'); await p0.waitForTimeout(300); K = await kpis(p0);
is(K.bm_per100.v === '60.00' && K.bm_per100.st === 'ok' && /목표 60\.00/.test(K.bm_per100.t), '우한 — 60.00 · 자기 목표 60 이하 «달성» (' + K.bm_per100.t + ')');
is(K.run_rate.v === '100.0', '우한 — 가동률 100.0');
await p0.selectOption('#scope', 'r:국내'); await p0.waitForTimeout(300); K = await kpis(p0);
is(K.run_rate.v === '100.0' && K.bm_per100.v === '20.00', '국내 — 가동 10/10 · 100대당 20.00 (반납 2대는 분모에 없다)');
const opsKr = await p0.evaluate(() => document.querySelectorAll('#cOps tbody tr').length);
is(opsKr === 1, '구분으로 좁히면 운영단위 표도 그 구분만');
await p0.close();

console.log('[3] 관제와 같은 숫자');
const ph = await open('/hub/', clearDB);
const hubG = await ph.evaluate(() => { const g = Array.from(document.querySelectorAll('#sel .hb-g')).map(e => e.querySelector('b').textContent); return { title:document.querySelector('#sel h3').textContent, g }; });
await ph.close();
const pl = await open('/home/?view=lead', clearDB);
const tw = await pl.evaluate(() => { const tr = document.querySelector('#cOps tr[data-op="GST TAIWAN SCRUBBER"]'); return tr ? { run:tr.children[3].textContent.trim(), pm:tr.children[5].textContent.trim() } : null; });
is(/TAIWAN/.test(hubG.title) && tw && hubG.g[2] === tw.pm.replace('%', '') + '%', 'PM 비율 = 관제의 «PM 실시율» 게이지 (관제 ' + hubG.g[2] + ' · 내 화면 ' + (tw || {}).pm + ')');
is(tw && hubG.g[0] === Math.round(parseFloat(tw.run)) + '%', '가동률 = 관제의 «가동률» 게이지 (관제 ' + hubG.g[0] + ' · 내 화면 ' + (tw || {}).run + ')');

console.log('[4] 팀장 — 처리함 · 위험 설비');
K = await kpis(pl);
is(!!K.act_overdue && K.act_overdue.v === '1', '팀장 카드에 «기한 넘은 처리함 일» 1 (닫힌 일 · 미래 기한은 안 셈)');
const acts = await pl.evaluate(() => Array.from(document.querySelectorAll('#cAct .ds-row b')).map(b => b.textContent));
is(acts.length === 2 && acts[0] === '옛 기한 일', '열린 일 둘 · 기한 넘은 일이 먼저 (' + acts.join(' / ') + ')');
const risk = await pl.evaluate(() => document.querySelectorAll('#cRisk .ds-row').length);
is(risk > 0, '고장 위험 설비 목록이 선다 (' + risk + ')');
await pl.click('#kpis .ds-kpi[data-k="act_overdue"]'); await pl.waitForTimeout(300);
const om = await pl.evaluate(() => { const b = document.querySelector('.gov-body'); return b ? Array.from(b.querySelectorAll('tbody tr')).map(r => r.children[0].textContent) : []; });
is(om.length === 1 && om[0] === '옛 기한 일', '기한 카드 → 그 1건');
await pl.evaluate(() => GST._ovClose && GST._ovClose());

console.log('[5] 현장 — 운영단위를 고르고 · 기본으로 저장 · 다시 열면 그 화면');
await pl.click('#segView button[data-v="field"]'); await pl.waitForTimeout(200);
const pick = await pl.evaluate(() => !!document.getElementById('cPick') && document.querySelectorAll('#cPick [data-op]').length);
is(pick === 3, '전사 범위에서 현장을 고르면 «운영단위를 고르세요» (3곳)');
await pl.click('#cPick [data-op="GST TAIWAN SCRUBBER"]'); await pl.waitForTimeout(300);
const fld = await pl.evaluate(() => ({ bm:document.querySelector('#cBm h2 .s').textContent, warr:document.querySelector('#cWarr h2 .s').textContent, scope:document.getElementById('scope').value }));
is(/· 12$/.test(fld.bm), '대만 — 이번 주 고장 12 (' + fld.bm + ')');
is(fld.warr === '3', '대만 — 워런티 90일 안 만료 3대');
await pl.click('#saveDef'); await pl.waitForTimeout(300);
const rpc = await pl.evaluate(() => window.__RPC.filter(r => r.fn === 'pref_save').pop());
is(rpc && rpc.args.p_view === 'field' && rpc.args.p_op === 'GST TAIWAN SCRUBBER', '「이 화면을 기본으로」 → pref_save(field · 대만)');
const toast = await pl.evaluate(() => (document.getElementById('capToast') || {}).textContent || '');
is(/기본 화면으로 저장/.test(toast), '서버에 저장됐다고 말한다');
is(pl._pe.length === 0, 'JS 에러 0' + (pl._pe.length ? ' → ' + pl._pe[0] : ''));
await pl.close();
const pr = await open('/home/');
const back = await pr.evaluate(() => ({ v:document.querySelector('#segView [aria-pressed="true"]').dataset.v, sc:document.getElementById('scope').value }));
is(back.v === 'field' && back.sc === 'o:GST TAIWAN SCRUBBER', '주소 없이 다시 열면 저장한 화면(현장 · 대만)이 뜬다 (' + back.v + ' · ' + back.sc + ')');
await pr.close();

console.log('[6] 목표 표가 없을 때 — 말하며 선다');
const pn = await open('/home/?view=exec', clearDB + 'window.__DBERR={ops_targets:{message:\'relation "public.ops_targets" does not exist\',code:"42P01"}};');
const nb = await pn.evaluate(() => ({ ban:document.getElementById('banners').textContent, t:Array.from(document.querySelectorAll('#kpis .ds-kpi-t')).map(e => e.textContent), why:GST.targets.why }));
is(nb.why === 'no_table' && /setup-26/.test(nb.ban), '관리자 — «서버에 목표 표가 없습니다 · setup-26 을 Run» (' + nb.why + ')');
is(nb.t.every(s => /목표 미설정/.test(s)), '카드는 «목표 미설정»으로 선다(빈 칸이 아니다)');
await pn.close();
const pv = await open('/home/?view=exec', clearDB + 'window.__ROLE={email:"view@t",can_write:false,role:"viewer"};window.__DBERR={ops_targets:{message:\'relation "public.ops_targets" does not exist\'}};');
const vb = await pv.evaluate(() => ({ ban:document.getElementById('banners').textContent, tg:document.getElementById('goTargets').hidden }));
is(!/setup-26/.test(vb.ban) && vb.tg, '조회자에게는 서버 사정(setup-26)을 안 보이고 «목표 관리» 단추도 없다 (A-4)');
await pv.close();

console.log('[7] 목표 관리 — 관리자');
const pt = await open('/targets/?op=GST CHINA(WUHAN) SCRUBBER', clearDB);
const tr = await pt.evaluate(() => Array.from(document.querySelectorAll('#cEdit tbody tr')).map(r => ({ m:r.dataset.m, now:r.children[1].textContent, use:r.children[2].textContent,
  tgt:r.querySelector('[data-f="target"]').value, ro:r.querySelector('[data-f="target"]').readOnly, save:!!r.querySelector('[data-act="save"]') })));
const twh = tr.find(r => r.m === 'bm_per100'), trun = tr.find(r => r.m === 'run_rate');
is(tr.length === 5 && twh && twh.now === '60.00' && twh.tgt === '60' && /이 범위의 목표/.test(twh.use), '우한 — 고장률 지금 60.00 · 자기 목표 60 (입력칸에 채워짐)');
is(trun && trun.tgt === '' && /전사 목표를 따름/.test(trun.use), '가동률 — 이 범위 목표 없음 · «전사 목표를 따름»');
is(tr.every(r => !r.ro && r.save), '관리자는 고칠 수 있다');
await pt.fill('#cEdit tr[data-m="bm_per100"] [data-f="target"]', '55'); await pt.click('#cEdit tr[data-m="bm_per100"] [data-act="save"]'); await pt.waitForTimeout(400);
const sv = await pt.evaluate(() => window.__RPC.filter(r => r.fn === 'target_save').pop());
is(sv && sv.args.p_target === 55 && sv.args.p_scope_kind === 'op' && sv.args.p_scope === 'GST CHINA(WUHAN) SCRUBBER' && sv.args.p_at === '2026-10-01T00:00:00.000Z',
  '저장 → target_save(55 · op · 우한 · 읽은 updated_at 을 p_at 으로)');
const after = await pt.evaluate(() => document.querySelector('#cEdit tr[data-m="bm_per100"] [data-f="target"]').value);
is(after === '55', '저장 뒤 다시 읽어 55');
await pt.fill('#cEdit tr[data-m="pm_ratio"] [data-f="target"]', '80'); await pt.fill('#cEdit tr[data-m="pm_ratio"] [data-f="warn"]', '90');
await pt.selectOption('#cEdit tr[data-m="pm_ratio"] [data-f="dir"]', 'ge');
const n0 = await pt.evaluate(() => window.__RPC.length);
await pt.click('#cEdit tr[data-m="pm_ratio"] [data-act="save"]'); await pt.waitForTimeout(200);
const wm = await pt.evaluate(() => ({ msg:document.getElementById('editMsg').textContent, n:window.__RPC.length }));
is(wm.n === n0 && /주의 경계/.test(wm.msg), '«이상이 정상»인데 주의 경계가 목표보다 높으면 서버에 보내기 전에 막고 말한다');
await pt.evaluate(() => { window.__RPCERR = { target_save:'conflict' }; });
await pt.fill('#cEdit tr[data-m="bm_per100"] [data-f="target"]', '40'); await pt.click('#cEdit tr[data-m="bm_per100"] [data-act="save"]'); await pt.waitForTimeout(400);
const cf = await pt.evaluate(() => document.getElementById('editMsg').textContent);
is(/다른 사람이 바꿨습니다/.test(cf), '충돌이면 덮지 않고 «다시 읽었다»고 말한다');
await pt.evaluate(() => { window.__RPCERR = null; });
const all = await pt.evaluate(() => document.querySelectorAll('#cAll tbody tr').length);
is(all === 3, '정해진 목표 전체 3개가 표로');
is(pt._pe.length === 0, 'JS 에러 0' + (pt._pe.length ? ' → ' + pt._pe[0] : ''));
await pt.close();

console.log('[8] 목표 관리 — 조회자는 읽기 전용');
const pq = await open('/targets/', clearDB + 'window.__ROLE={email:"view@t",can_write:false,role:"viewer"};');
const ro = await pq.evaluate(() => ({ ro:Array.from(document.querySelectorAll('#cEdit [data-f="target"]')).every(i => i.readOnly), btn:document.querySelectorAll('#cEdit [data-act]').length, ban:document.getElementById('banners').textContent }));
is(ro.ro && ro.btn === 0 && /관리자만/.test(ro.ban), '입력칸 잠김 · 저장 단추 없음 · «관리자만 바꿀 수 있습니다»');
await pq.close();

console.log('[9] 언어 · 외부 요청');
const pz = await open('/home/?view=exec', clearDB);
await pz.evaluate(() => window.setLang('en')); await pz.waitForTimeout(300);
const en = await pz.evaluate(() => ({ t:document.querySelector('[data-i="title"]').textContent, k:document.querySelector('#kpis .ds-kpi-l').textContent, sc:document.querySelector('#scope option').textContent }));
is(en.t === 'My view' && /Running rate/.test(en.k) && en.sc === 'Company', '영어로 — 제목 · 카드 이름 · 범위 목록');
await pz.evaluate(() => document.body.classList.add('theme-slate')); await pz.waitForTimeout(200);
if (process.env.V2_SHOT) { await pz.evaluate(() => window.setLang('ko')); await pz.waitForTimeout(200); await pz.screenshot({ path:process.env.V2_SHOT + '/home-dark.png', fullPage:true }); }
is(pz._pe.length === 0, 'JS 에러 0' + (pz._pe.length ? ' → ' + pz._pe[0] : ''));
await pz.close();
if (process.env.V2_SHOT) { for (const v of ['exec','lead']) { const s = await open('/home/?view=' + v, clearDB); await s.screenshot({ path:process.env.V2_SHOT + '/home-' + v + '.png', fullPage:true }); await s.close(); }
  const s = await open('/targets/', clearDB); await s.screenshot({ path:process.env.V2_SHOT + '/targets.png', fullPage:true }); await s.close();
  const m = await ctx.newPage(); await m.setViewportSize({ width:400, height:900 }); await m.goto(BASE + '/home/?view=exec', { waitUntil:'domcontentloaded' }); await m.waitForTimeout(2500); await m.screenshot({ path:process.env.V2_SHOT + '/home-phone.png', fullPage:true }); await m.close(); }
is(ext.length === 0, '외부 요청 0' + (ext.length ? ' → ' + ext[0] : ''));

console.log('[10] 새 화면 둘의 정적 규칙 — t-i18n · t-ver 와 같은 규칙(그 둘의 페이지 목록은 셸에 거는 날 넓힌다 · PLAN)');
const CORE = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
const VER = +(CORE.match(/GST\.VER\s*=\s*(\d+)/) || [])[1];
for (const pg of ['home', 'targets']) {
  const src = fs.readFileSync(ROOT + '/' + pg + '/index.html', 'utf8');
  const Tsrc = src.match(/const T=\{([\s\S]*?)\n\};/);
  const Tobj = Tsrc ? (new Function('return {' + Tsrc[1] + '\n};'))() : null;
  is(!!Tobj && ['ko','en','zh','ja'].every(l => Tobj[l]), pg + ' — T 에 네 언어');
  const ko = Object.keys(Tobj.ko).sort().join();
  const diff = ['en','zh','ja'].filter(l => Object.keys(Tobj[l]).sort().join() !== ko);
  is(!diff.length, pg + ' — 네 언어 키가 같다' + (diff.length ? ' → ' + diff.join(',') : ''));
  const KO_RE = /[가-힣]/, han = [];
  ['en','zh','ja'].forEach(l => Object.entries(Tobj[l]).forEach(([k, v]) => { if (KO_RE.test(String(v).replace(/「[^」]*」/g, ''))) han.push(l + ':' + k); }));
  is(!han.length, pg + ' — en/zh/ja 값에 한글이 남지 않았다' + (han.length ? ' → ' + han.slice(0, 4).join(',') : ''));
  const di = Array.from(src.matchAll(/data-i(?:-title|-ph|-th)?="([^"]+)"/g)).map(m => m[1]).filter(k => Tobj.ko[k] == null);
  is(!di.length, pg + ' — data-i 가 가리키는 키가 전부 있다' + (di.length ? ' → ' + di.join(',') : ''));
  const calls = Array.from(src.matchAll(/\bt\('([a-zA-Z0-9_]+)'\)/g)).map(m => m[1]).filter(k => Tobj.ko[k] == null);
  is(!calls.length, pg + ' — t(\'…\') 로 부르는 키가 전부 있다' + (calls.length ? ' → ' + [...new Set(calls)].join(',') : ''));
  const cv = (src.match(/assets\/core\.js\?v=(\d+)/) || [])[1], tv = (src.match(/assets\/theme\.css\?v=(\d+)/) || [])[1], nv = (src.match(/needVer\((\d+)\)/) || [])[1];
  is(+cv === VER && +tv === VER && +nv <= VER, pg + ' — core·theme ?v= = GST.VER(' + VER + ') · needVer ' + nv);
  is(/assets\/v2\.js\?v=\d+/.test(src) && /assets\/ds\.css\?v=\d+/.test(src), pg + ' — v2.js · ds.css 도 ?v= 로 부른다(캐시 무효화)');
  is(!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(src), pg + ' — 제어문자 없음');
}
const V2 = fs.readFileSync(ROOT + '/assets/v2.js', 'utf8');
is(!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(V2), 'v2.js — 제어문자 없음(t-ver [2] 규율)');
const v2v = (fs.readFileSync(ROOT + '/home/index.html', 'utf8').match(/assets\/v2\.js\?v=(\d+)/) || [])[1];
is(+v2v === +(V2.match(/GST\.V2_VER\s*=\s*(\d+)/) || [])[1], 'v2.js ?v= = GST.V2_VER — 하나만 올리면 옛 사본을 문다');
/* 판정 사본이 생기지 않았나 — v2.js 는 GST.EQ·GST.PM·riskRank 를 «부르기만» 한다 */
is(!/Operation|\bTBM\b|repDays|\.stage\b/.test(V2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''")), 'v2.js 에 설비상태·PM·BM 판정 낱말이 없다 — 전부 GST.ops 를 지난다');

await browser.close(); srv.close();
console.log((fail ? '❌' : '✅') + ` t-v2 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
