/* t-cb — 차트 만들기 엔진(GST.cb · v203) · 기존 화면 «차트 설정» · «＋ 차트 추가». 픽스처는 t-screen 과 같다(지어낸 자료만 · t-leak).
   사용자: 「기존 페이지들 차트를 바꾸거나 이런 게 없네 · 차트를 만들 수 있는 게 어마어마한데 지금은 계열도 엄청 한정적」.
   지키는 것:
   ① 엔진 — 값 여러 개 · 계산(누적·전체 대비·구간 안 %) · 거르기(다음 중 하나·비어 있지 않음·>) · 모양 열다섯이 전부 에러 없이 선다 ·
      100% 쌓기는 한 칸 합이 100 · 숫자 카드는 직전 같은 기간과 견준다 · 막대를 누르면 «그 행들»($rows).
   ② 기존 화면 차트 설정 — 모양을 바꿔도 «자료»(data·라벨·$rows)는 그대로 · 가로 막대는 indexAxis y · 값 표시 · 저장 → 다시 열어도 같은 모양
      (차트가 새로 만들어질 때 거는 길) · 「원래대로」는 처음 모양으로.
   ③ 차트 추가 — 편집기에서 넣으면 카드가 서고 저장된다(adds) · 다시 열면 그 카드가 그 자리에 · 화면의 상세 필터를 따른다(gst:filters).
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-cb.mjs */
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
const ASOF = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() - 1));   // 자료의 마지막 날 = 어제
const dAgo = n => new Date(ASOF.getTime() - n * 86400000);

/* 설치현황 — 대만 30(가동 28 · Set-up 2) · 우한 10 · 국내 12(가동 10 · 반납 2) */
const IH = ['NO','Country','Customer','Location','FAB','Line','Bay','Scrubber CODE','Scrubber S/N','Scrubber Model',
  'Burner Type','Scrubber type','Process','Detail Process(HQ)','Detail Process(Customer)','Main Tool ID','Main Tool Maker',
  'Main Tool Model','Receipt date','Setup date','Turn-on date','Warranty date','Warranty In/Out','설비상태'];
const inst = [IH]; let no = 0;
const unit = (op, cust, fab, code, state, wd, wio) => { no++; inst.push([no, op, cust, 'LOC', fab, 'L1', 'B1', code, code + 'S', 'GST-1000',
  'BURN', 'SINGLE', 'ETCH', 'DRY', 'DRY', 'MT' + no, 'TEL', 'TEL-A', '2023-03-01', '2023-03-10', '2023-03-20', wd || '2030-01-01', wio || 'IN', state]); };
for (let i = 1; i <= 30; i++) unit('GST TAIWAN SCRUBBER', 'Micron Memory Taiwan Co., Ltd.(F16)', 'F16', 'TWC' + i, i <= 28 ? 'Operation' : 'Set-up', i <= 3 ? ymd(dAgo(-30)) : '');
for (let i = 1; i <= 10; i++) unit('GST CHINA(WUHAN) SCRUBBER', 'YMTC', 'FAB1', 'WHC' + i, 'Operation');
for (let i = 1; i <= 12; i++) unit('SEC Scrubber', '삼성전자(주)', 'P1', 'KRC' + i, i <= 10 ? 'Operation' : '반납');

/* 수선실적 — 대만 이번 주 BM 12(설비 1~4 에 몰림 · 평소 주 1) · 우한 매주 1 · 국내 이번 주 2 · 대만 이번 주 TBM 5 */
const WHF = ['제품군','운영단위','고객사','단지','라인','BAY','공정','세부공정','MODEL(자사)','실적코드','상태','의뢰유형','작업단계',
  '챔버','WRS NO','메인설비호기','제품코드','설비호기','채널위치','S/N(IN)','S/N(OUT)','유/무상','알람유형','현상','원인','조치',
  '세부조치내용','작업시작일','작업종료일','작업시작시간','작업종료시간','실적등록일','출하일자','총 이동시간(분)','작업시간(분)',
  '작업공수','작업자','작업자수'];
const wk = [WHF]; let n = 0;
const w = (op, campus, stage, days, code) => { n++; const d = ymd(dAgo(days));
  wk.push(['SCRUBBER', op, 'C', campus, campus, 'B1', 'ETCH', 'DRY', n % 3 ? 'GST-1000' : 'GST_1000' /* 모델 표기 흔들림 — 화면처럼 한 값으로 흡수해야 레시피가 맞는다(v206) */, 'R' + n, '완료', '정기', stage, 'A', 'W' + n, 'MT', 'P',
    code, 'L', code + 'S', '', '무상', '', '', 'PUMP', '', '', d, d, '09:00', '10:00', d, '', '10', '60', '60', 'STAFF', '1']); };
for (let i = 0; i < 12; i++) w('GST TAIWAN SCRUBBER', 'F16', 'BM', 0, 'TWC' + (i % 4 + 1));
for (let k = 1; k <= 11; k++) w('GST TAIWAN SCRUBBER', 'F16', 'BM', 7 * k, 'TWC' + (10 + k));
for (let k = 0; k <= 11; k++) w('GST CHINA(WUHAN) SCRUBBER', 'FAB1', 'BM', 7 * k, 'WHC' + (k % 10 + 1));
for (let i = 0; i < 2; i++) w('SEC Scrubber', 'P1', 'BM', 0, 'KRC' + (i + 1));
for (let i = 0; i < 5; i++) w('GST TAIWAN SCRUBBER', 'F16', 'TBM', 0, 'TWC' + (20 + i));
const SHEETS = { '891608329': csv(inst), '646668307': csv(wk) };
const MIME = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html' };
const srv = http.createServer((rq, rs) => { let u = decodeURIComponent(rq.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.statusCode = 404; rs.end('nf'); return; }
  rs.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); rs.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(0, r));
const BASE = 'http://127.0.0.1:' + srv.address().port;
const NM = ROOT + '/tests/node_modules/';

/* 가짜 Supabase — 화면 배치 · 보드 · 게시를 «기록»하고 흉내낸다(진짜 규칙은 t-screensql 이 진짜 Postgres 에서 본다) */
const FAKE = String.raw`
(function(){ const me = (window.__ME && window.__ME.email) || 'boss@test.local';
  let L; try{ L = JSON.parse(localStorage.getItem('__SC') || 'null'); }catch(e){}
  L = L || { screens: [], rows: [], calls: [], seq: 0 };
  if (window.__SEED && !L.seeded){ L = Object.assign(L, window.__SEED); L.seeded = true; }
  window.__SC = L; const keep = () => { try{ localStorage.setItem('__SC', JSON.stringify(L)); }catch(e){} };
  window.__FDB = { from: function(tbl){ const F = []; const o = { select(){ return o; }, order(){ return o; }, limit(){ return o; },
      eq(c, v){ F.push(r => String(r[c]) === String(v)); return o; }, not(c, op, v){ F.push(r => r[c] != null); return o; },
      then(res, rej){ let data;
        if (tbl === 'screen_layouts') data = L.screens.filter(r => !r.removed && (r.owner === '' || r.owner === me));
        else if (tbl === 'user_layouts') data = L.rows.filter(r => !r.removed && (r.shared || r.owner === me));
        else data = [];
        data = data.filter(r => F.every(f => f(r))).map(r => JSON.parse(JSON.stringify(r)));
        return Promise.resolve({ data, error:null }).then(res, rej); } }; return o; },
    rpc: async function(n, a){ L.calls.push({ rpc:n, args: JSON.parse(JSON.stringify(a)) }); setTimeout(keep, 0);
      if (n === 'screen_layout_save') { const ow = a.p_scope === 'all' ? '' : me;
        if (a.p_scope === 'all' && !(window.__ME && window.__ME.role === 'admin' && window.__ME.can_write)) return { data:{ ok:false, error:'forbidden' }, error:null };
        let r = L.screens.find(x => x.page === a.p_page && x.owner === ow);
        if (r && !r.removed && r.updated_at !== a.p_at) return { data:{ ok:false, error:'conflict' }, error:null };
        const at = new Date(Date.now() + L.calls.length).toISOString();
        if (a.p_config == null){ if (r) { r.removed = true; r.updated_at = at; } return { data:{ ok:true, at:null }, error:null }; }
        if (!r){ r = { page:a.p_page, owner:ow }; L.screens.push(r); }
        Object.assign(r, { config:a.p_config, removed:false, updated_at:at }); return { data:{ ok:true, at }, error:null }; }
      if (n === 'layout_save') { if (a.p_id == null) { const id = ++L.seq; L.rows.push({ id, owner:me, name:a.p_name, config:a.p_config, shared:a.p_shared, removed:false, pub:null, updated_at:new Date().toISOString() }); return { data:{ id, created:true }, error:null }; }
        const r = L.rows.find(x => x.id === a.p_id && x.owner === me); if (!r) return { data:null, error:{ message:'not_yours' } }; Object.assign(r, { name:a.p_name, config:a.p_config, shared:a.p_shared }); return { data:{ id:r.id, created:false }, error:null }; }
      if (n === 'board_publish') { const r = L.rows.find(x => x.id === a.p_id); if (!r) return { data:{ ok:false, error:'not_found' }, error:null };
        r.pub = a.p_pub; if (a.p_pub) r.shared = true; return { data:{ ok:true }, error:null }; }
      return { data:null, error:{ message:'?' } }; } };
})();`;
const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
  + 'GST.getSession=async function(){return {user:{email:(window.__ME||{}).email||"boss@test.local"}};};GST.token=async function(){return "t";};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();if(GST._authOk)GST._authOk();return true;};'
  + 'GST.loadMe=async function(){ if(!GST._me) GST._meApply(window.__ME||{email:"boss@test.local",can_write:true,role:"admin"}); return GST._me; };'
  + FAKE + ';GST.db=async function(){return window.__FDB;};GST._dbAuthed=GST.db;';
const browser = await chromium.launch(PW);
async function mkCtx(init) {
  const ctx = await browser.newContext({ viewport:{ width:1500, height:1100 }, locale:'ko-KR' });
  await ctx.addInitScript(init || (() => {}));
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => { let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
    if (/\/assets\/core\.js$/.test(u)) return r.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB });
    r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) }); });
  await ctx.route('**/assets/core.js*', r => r.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB }));
  await ctx.route('**/cdn.jsdelivr.net/**', r => { const u = r.request().url();
    if (u.includes('chart.umd')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM + 'chart.js/dist/chart.umd.js', 'utf8') });
    if (u.includes('papaparse')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM + 'papaparse/papaparse.min.js', 'utf8') });
    return r.fulfill({ status:200, contentType: u.endsWith('.css') ? 'text/css' : 'application/javascript', body:'' }); });
  await ctx.route('**/spreadsheets/**', r => { const gid = (r.request().url().match(/gid=(\d+)/) || [])[1]; r.fulfill({ status:200, contentType:'text/csv', body: SHEETS[gid] || '' }); });
  return ctx;
}
const calls = pg => pg.evaluate(() => (window.__SC || {}).calls || []);
const errs = [];

/* ============ ① 엔진 ============ */
console.log('[1] 엔진 — 값 여러 개 · 계산 · 거르기 · 모양');
let ctx = await mkCtx(() => { window.__ME = { email:'boss@test.local', can_write:true, role:'admin' }; });
let pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('studio: ' + e.message));
await pg.emulateMedia({ reducedMotion:'reduce' });
await pg.goto(BASE + '/studio/?new=1', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3500);
const E = await pg.evaluate(async () => {
  await GST.cb.load('wk');
  const R = c => GST.cb.run(Object.assign({src:'wk'}, c));
  const out = {};
  let r = R({x:'op', measures:[{agg:'count'}, {agg:'sum', f:'manMin'}, {agg:'count', calc:'share'}]});
  const ix = r.xs.indexOf('GST TAIWAN SCRUBBER');
  out.multi = [r.sets.length, r.sets[0].data[ix], r.sets[1].data[ix], Math.round(r.sets[2].data.reduce((a, b) => a + b, 0))];
  r = R({x:'dStart', bucket:'week', measures:[{agg:'count', calc:'cum'}]});
  const d = r.sets[0].data; out.cum = [d[d.length - 1], d.every((v, i) => !i || v >= d[i - 1])];
  r = R({x:'stage', series:'op', measures:[{agg:'count', calc:'pctx'}]});
  out.pctx = r.xs.map((_, xi) => Math.round(r.sets.reduce((a, s) => a + s.data[xi], 0)));
  r = R({x:'op', measures:[{agg:'count'}], filters:[{f:'op', op:'in', v:'SEC Scrubber, GST CHINA(WUHAN) SCRUBBER'}]}); out.in = r.n;
  r = R({x:'op', measures:[{agg:'count'}], filters:[{f:'stage', op:'ne', v:'BM'}]}); out.ne = r.n;
  r = R({x:'op', measures:[{agg:'count'}], filters:[{f:'manMin', op:'gt', v:'59'}]}); out.gt = r.n;
  r = R({x:'op', measures:[{agg:'count'}], filters:[{f:'alarm', op:'nempty'}]}); out.nempty = r.n;
  r = R({type:'kpi', dateF:'dStart', range:'d30', measures:[{agg:'count'}]}); out.kpi = [r.kpi, r.value, r.prev != null];
  r = R({x:'eqNo', top:3, other:true, measures:[{agg:'count'}]}); out.other = [r.xs.length, r.xs[2], r.sets[0].data[2], r.sets[0].data.reduce((a, b) => a + b, 0)];
  r = R({x:'eqNo', top:3, other:false, measures:[{agg:'count'}]}); out.noother = [r.xs.length, r.sets[0].data.reduce((a, b) => a + b, 0)];
  r = R({type:'scatter', x:'workMin', measures:[{agg:'sum', f:'manMin'}]}); out.scatter = !!r.scatter && r.sets[0].pts.length;
  return out;
});
is(E.multi[0] === 3 && E.multi[1] === 28 && E.multi[2] === 28 * 60 && E.multi[3] === 100, '값 셋 — 건수 28 · 공수 합 1,680 · 전체 대비 % 합 100 (' + E.multi + ')');
is(E.cum[0] === 42 && E.cum[1], '누적 — 마지막 칸 = 전체 42행 · 줄지 않는다 (' + E.cum + ')');
is(E.pctx.every(v => v === 100), '구간 안 % — 칸마다 합이 100 (' + E.pctx + ')');
is(E.in === 14 && E.ne === 5 && E.gt === 42 && E.nempty === 0, '거르기 — 다음 중 하나 14 · ≠BM 5 · 공수>59 42 · 알람유형 비어 있지 않음 0 (' + [E.in, E.ne, E.gt, E.nempty] + ')');
is(E.kpi[0] && E.kpi[1] > 0 && E.kpi[2], '숫자 카드 — 최근 30일 값 + 직전 같은 기간 (' + E.kpi + ')');
is(E.other[0] === 3 && E.other[1] === '그 밖' && E.other[3] === 42 && E.noother[0] === 3 && E.noother[1] < 42, '상위 3 — 나머지는 «그 밖» 한 칸으로 담아 합 42 (끄면 버린다 · ' + JSON.stringify([E.other, E.noother]) + ')');
is(E.scatter === 42, '산점도 — 숫자 × 숫자 점 42개');
const types = await pg.evaluate(async () => {
  const out = {};
  for (const ty of GST.cb.TYPES) {
    const h = document.createElement('div'); h.style.cssText = 'width:600px;height:320px;display:flex;flex-direction:column'; document.body.appendChild(h);
    const c = { src:'wk', type:ty, x: ty === 'scatter' ? 'workMin' : 'op', series: (ty === 'heat' || ty === 'stack' || ty === 'stack100') ? 'stage' : '', dateF:'dStart',
      measures: ty === 'combo' ? [{agg:'count'}, {agg:'sum', f:'manMin', axis:'y2'}] : ty === 'scatter' ? [{agg:'sum', f:'manMin'}] : [{agg:'count'}], disp:{labels:true, target:'10'} };
    try { await GST.cb.draw(h, c, {id:'t_' + ty}); const cv = h.querySelector('canvas'), ch = cv && Chart.getChart(cv);
      out[ty] = ch ? ch.config.type + (ch.options.indexAxis === 'y' ? ':y' : '') + (ty === 'stack100' ? ':' + Math.round(ch.data.datasets.reduce((a, d) => a + d.data[0], 0)) : '')
        : h.querySelector('.gcb-tbl tbody tr') ? 'table' : h.querySelector('.gcb-kpi .v') ? 'kpi' : 'EMPTY:' + h.textContent.slice(0, 40);
    } catch (e) { out[ty] = 'ERR ' + e.message; }
    h.remove();
  }
  return out;
});
const want = { bar:'bar', hbar:'bar:y', line:'line', area:'line', stack:'bar', stack100:'bar:100', combo:'bar', doughnut:'doughnut', pie:'pie', polar:'polarArea', radar:'radar', scatter:'scatter', heat:'table', table:'table', kpi:'kpi' };
is(Object.keys(want).every(k => types[k] === want[k]), '모양 열다섯이 전부 선다 — ' + JSON.stringify(types));
const drill = await pg.evaluate(async () => {
  const h = document.createElement('div'); h.style.cssText = 'width:600px;height:300px;display:flex'; document.body.appendChild(h);
  await GST.cb.draw(h, { src:'wk', type:'bar', x:'op', measures:[{agg:'count'}] }, {id:'t_dr'});
  const ch = Chart.getChart(h.querySelector('canvas')), i = ch.data.labels.indexOf('SEC Scrubber'), sp = ch.$rows(0, i);
  return [sp.rows.length, sp.cols.length > 3];
});
is(drill[0] === 2 && drill[1], '막대 → 그 행들($rows) — 국내 2행');
console.log('[1b] v204 — 설치현황 조인 · 식 · 전년 동기 · 조건부 색 · 추천');
const V = await pg.evaluate(async () => {
  const out = {}, R = c => GST.cb.run(Object.assign({src:'wk'}, c));
  const DS = GST.cb.data('wk'); out.join = DS.join && [DS.join.hit, DS.join.n]; out.hasJ = DS.fields.some(f => f.k === 'i:model') && DS.fields.some(f => f.k === 'i:state');
  let r = R({x:'i:state', measures:[{agg:'count'}]}); out.byState = Object.fromEntries(r.xs.map((x, i) => [x, r.sets[0].data[i]]));
  r = R({x:'op', measures:[{agg:'sum', f:'manMin'}, {agg:'count'}, {agg:'expr', expr:'{1}/{2}', name:'건당 공수'}]});
  out.expr = [r.sets.length, r.sets[2].data[0], r.sets[2].name];
  out.exprBad = !!GST.cb.exprFn('{1}+alert(1)') === false && !!GST.cb.exprFn('{1}/({2}+1)*100');
  r = R({x:'dStart', bucket:'month', measures:[{agg:'count'}, {agg:'count', calc:'yoy'}]});
  out.yoy = [r.sets.length, r.sets[1].data.every(v => v === null)];   // 픽스처는 올해뿐 — 전년 칸은 전부 null(0 이 아니라)
  const h = document.createElement('div'); h.style.cssText = 'width:600px;height:300px;display:flex'; document.body.appendChild(h);
  await GST.cb.draw(h, {src:'wk', type:'bar', x:'op', measures:[{agg:'count'}], disp:{cond:'gt', condV:'20', condC:'bad'}}, {id:'t_cond'});
  const ch = Chart.getChart(h.querySelector('canvas')), bg = ch.data.datasets[0].backgroundColor;
  out.cond = [Array.isArray(bg), bg[0] !== bg[1], ch.data.datasets[0].data[0] > 20];
  h.remove();
  const TL = GST.cb.templates('wk', DS); out.tpl = [TL.length, TL.some(t => t.k === 'model_bm'), TL.every(t => typeof t.name === 'string' && t.name.length > 2)];
  const TL2 = GST.cb.templates('mat', {fields:[{k:'op', kind:'text'}], rows:[]}); out.tplMiss = TL2.length;
  return out;
});
is(V.hasJ && V.join && V.join[0] === 42 && V.join[1] === 42, '설치현황 조인 — 수선실적 42행 전부 S/N 으로 붙고 i:모델·i:설비상태 열이 생긴다 (' + V.join + ')');
is(V.byState && V.byState.Operation === 40 && V.byState['Set-up'] === 0 || (V.byState && (V.byState.Operation || 0) + (V.byState['반납'] || 0) + (V.byState['Set-up'] || 0) === 42), '조인한 «설비상태»로 수선실적을 쪼갠다 (' + JSON.stringify(V.byState) + ')');
is(V.expr[0] === 3 && V.expr[1] === 60 && V.expr[2] === '건당 공수', '식 {1}/{2} — 공수 합 ÷ 건수 = 60 (' + V.expr + ')');
is(V.exprBad, '식은 {n}·숫자·사칙연산·괄호만 — eval 없음 (alert 거부)');
is(V.yoy[0] === 2 && V.yoy[1], '전년 같은 구간 — 작년 자료가 없으면 null(0 으로 그리지 않는다)');
is(V.cond[0] && V.cond[1] && V.cond[2], '조건부 색 — 20 넘는 막대만 다른 색(문자열 배열)');
is(V.tpl[0] >= 5 && V.tpl[1] && V.tpl[2], '추천 차트 — 수선실적 ' + V.tpl[0] + '개 · 조인 열 추천 포함 · 이름 있음');
is(V.tplMiss === 0, '그 자료에 없는 열을 쓰는 추천은 빠진다');
await pg.evaluate(() => { const b = document.querySelector('#cbForm'); return b; });
await pg.selectOption('#fTpl', '0'); await pg.waitForTimeout(600);
is(await pg.evaluate(() => S.cfg.type === 'stack' && S.cfg.series === 'stage' && !!Chart.getChart(document.querySelector('#pv canvas'))), '추천을 고르면 폼·미리 보기가 그 설정으로');
console.log('[1c] 되돌리기 — 화면 만들기');
await pg.click('#addW'); await pg.waitForTimeout(500); await pg.click('#addW'); await pg.waitForTimeout(500);
is(await pg.evaluate(() => S.board.widgets.length === 2 && !document.getElementById('undoBtn').disabled), '위젯 둘 — 되돌리기 단추가 산다');
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(500);
is(await pg.evaluate(() => S.board.widgets.length === 1), 'Ctrl+Z → 위젯 하나');
await pg.keyboard.press('Control+y'); await pg.waitForTimeout(500);
is(await pg.evaluate(() => S.board.widgets.length === 2), 'Ctrl+Y → 다시 둘');
if (process.env.SHOT) { await pg.evaluate(() => { const c = S.cfg; c.type = 'combo'; c.x = 'dStart'; c.bucket = 'week'; c.measures = [{agg:'count', f:'', calc:'none', as:'auto', axis:'y', name:''}, {agg:'sum', f:'manMin', calc:'cum', as:'line', axis:'y2', name:''}]; drawForm(); preview(); }); await pg.waitForTimeout(800); await pg.screenshot({ path: process.env.SHOT + '/cb-studio.png' }); }
await ctx.close();

/* ============ ② 기존 화면 차트 설정 — 설비 현황 ============ */
console.log('[2] 기존 화면 차트 설정 — 설비 현황');
ctx = await mkCtx(() => { window.__ME = { email:'boss@test.local', can_write:true, role:'admin' }; });
pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('scrubber: ' + e.message));
await pg.emulateMedia({ reducedMotion:'reduce' });
await pg.goto(BASE + '/scrubber/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3500);
await pg.evaluate(() => GST.screen.edit()); await pg.waitForTimeout(300);
const cand = await pg.evaluate(() => {
  for (const b of document.querySelectorAll('.gst-se-bar [data-a="chart"]')) { const card = b.closest('.gst-se-bar').parentNode;
    if (card.offsetParent === null) continue; const cv = card.querySelector('canvas[id]'), ch = Chart.getChart(cv);
    if (ch && ch.config.type === 'bar' && ch.config.options.indexAxis !== 'y' && (ch.data.labels || []).length >= 2) return cv.id; }
  return null; });
is(!!cand, '편집 중 차트 카드에 ⚙(차트 설정)이 선다 (' + cand + ')');
const before = await pg.evaluate(id => { const ch = Chart.getChart(document.getElementById(id)); return JSON.stringify({ l:ch.data.labels, d:ch.data.datasets.map(x => x.data) }); }, cand);
await pg.evaluate(id => document.getElementById(id).closest('.gst-se-card').querySelector('.gst-se-bar [data-a="chart"]').click(), cand); await pg.waitForTimeout(250);
is(await pg.evaluate(() => !!document.querySelector('.gse-cpop .gse-ct button[data-ct="line"]')), '차트 설정 창 — 모양 단추');
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/cb-pop.png' });
await pg.click('.gse-cpop [data-ct="line"]'); await pg.waitForTimeout(250);
let st = await pg.evaluate(id => { const ch = Chart.getChart(document.getElementById(id)); return { t:ch.config.type, j:JSON.stringify({ l:ch.data.labels, d:ch.data.datasets.map(x => x.data) }), rows:typeof ch.$rows }; }, cand);
is(st.t === 'line' && st.j === before, '선으로 — 모양만 바뀌고 자료(라벨·값)는 그대로');
await pg.click('.gse-cpop [data-ct="hbar"]'); await pg.waitForTimeout(250);
st = await pg.evaluate(id => { const ch = Chart.getChart(document.getElementById(id)); return { t:ch.config.type, ia:ch.config.options.indexAxis, j:JSON.stringify({ l:ch.data.labels, d:ch.data.datasets.map(x => x.data) }) }; }, cand);
is(st.t === 'bar' && st.ia === 'y' && st.j === before, '가로 막대 — indexAxis y · 자료 그대로');
await pg.click('.gse-cpop [data-c="labels"]'); await pg.waitForTimeout(200);
is(await pg.evaluate(id => Chart.getChart(document.getElementById(id)).$cbVals === true, cand), '값 표시');
await pg.click('.gse-cpop [data-c="close"]');
await pg.click('#gstSePanel [data-p="save"]'); await pg.waitForTimeout(150); await pg.click('#gstSePanel [data-s="me"]'); await pg.waitForTimeout(500);
let sv = (await calls(pg)).filter(c => c.rpc === 'screen_layout_save').pop();
is(sv && sv.args.p_config.charts && sv.args.p_config.charts[cand] && sv.args.p_config.charts[cand].type === 'hbar' && sv.args.p_config.charts[cand].labels === true, '저장 — 배치와 함께 charts[' + cand + '] = 가로 막대 · 값 표시');
await pg.reload({ waitUntil:'domcontentloaded' }); await pg.waitForTimeout(4000);
st = await pg.evaluate(id => { const ch = Chart.getChart(document.getElementById(id)); return ch && { t:ch.config.type, ia:ch.config.options.indexAxis, j:JSON.stringify({ l:ch.data.labels, d:ch.data.datasets.map(x => x.data) }), v:ch.$cbVals }; }, cand);
is(st && st.t === 'bar' && st.ia === 'y' && st.v === true && st.j === before, '다시 열어도 가로 막대 · 값 표시 · 자료 그대로');
await pg.evaluate(() => GST.screen.edit()); await pg.waitForTimeout(300);
await pg.evaluate(id => document.getElementById(id).closest('.gst-se-card').querySelector('.gst-se-bar [data-a="chart"]').click(), cand); await pg.waitForTimeout(250);
await pg.click('.gse-cpop [data-c="reset"]'); await pg.waitForTimeout(250);
st = await pg.evaluate(id => { const ch = Chart.getChart(document.getElementById(id)); return { t:ch.config.type, ia:ch.config.options.indexAxis, v:ch.$cbVals }; }, cand);
is(st.t === 'bar' && st.ia !== 'y' && !st.v, '「원래대로」 — 처음 모양');
await pg.click('.gse-cpop [data-ct="line"]'); await pg.waitForTimeout(250); await pg.click('.gse-cpop [data-c="close"]');
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
is(await pg.evaluate(id => Chart.getChart(document.getElementById(id)).config.type === 'bar', cand), '화면 편집 Ctrl+Z — 선으로 바꾼 것을 되돌린다');
await pg.keyboard.press('Control+y'); await pg.waitForTimeout(400);
is(await pg.evaluate(id => Chart.getChart(document.getElementById(id)).config.type === 'line', cand), 'Ctrl+Y — 다시 선');
await pg.click('#gstSePanel [data-p="undo"]'); await pg.waitForTimeout(400);
await pg.evaluate(id => document.getElementById(id).closest('.gst-se-card').querySelector('.gst-se-bar [data-a="chart"]').click(), cand); await pg.waitForTimeout(250);
is(await pg.evaluate(() => { const b = document.querySelector('.gse-cpop [data-ct="line"]'); return !!b && !b.disabled; }), '다시 열어 되돌린 뒤에도 모양 단추가 살아 있다(원래 모양을 사본으로 떠 둔다)');

/* ============ ③ 차트 추가 ============ */
console.log('[3] ＋ 차트 추가 — 설비 현황');
await pg.click('#gstSePanel [data-p="add"]'); await pg.waitForTimeout(1500);
is(await pg.evaluate(() => !!document.querySelector('#gstCbDlg #cbx-fSrc')), '차트 추가 창 — 맞춤 분석과 같은 폼(자료·모양·값…)');
await pg.selectOption('#gstCbDlg #cbx-fX', 'op'); await pg.waitForTimeout(400);
is(await pg.evaluate(() => { const ch = Chart.getChart(document.querySelector('#gstCbDlg .gcd-ph canvas')); return ch && ch.data.labels.length === 3; }), '미리 보기 — 운영단위 3칸');
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/cb-dlg.png' });
await pg.click('#gstCbDlg [data-d="ok"]'); await pg.waitForTimeout(800);
if (process.env.SHOT) { await pg.evaluate(() => document.querySelector('[data-gst-add]').scrollIntoView()); await pg.waitForTimeout(300); await pg.screenshot({ path: process.env.SHOT + '/cb-added.png' }); }
let add = await pg.evaluate(() => { const c = document.querySelector('[data-gst-add]'); const ch = c && Chart.getChart(c.querySelector('canvas')); return c && { key:GST.screen.keyOf(c), n:ch && ch.data.labels.length, t:c.querySelector('h3').textContent }; });
is(add && add.key.startsWith('x:') && add.n === 3, '카드가 선다 — 열쇠 x:… · 운영단위 3칸 (' + JSON.stringify(add) + ')');
await pg.click('#gstSePanel [data-p="save"]'); await pg.waitForTimeout(150); await pg.click('#gstSePanel [data-s="me"]'); await pg.waitForTimeout(500);
sv = (await calls(pg)).filter(c => c.rpc === 'screen_layout_save').pop();
is(sv && (sv.args.p_config.adds || []).length === 1 && sv.args.p_config.adds[0].cfg.x === 'op' && sv.args.p_config.order.indexOf(add.key) >= 0 && !JSON.stringify(sv.args.p_config).includes('TWC1'), '저장 — adds 하나(설정만) · 순서에 그 카드');
await pg.reload({ waitUntil:'domcontentloaded' }); await pg.waitForTimeout(4500);
add = await pg.evaluate(() => { const c = document.querySelector('[data-gst-add]'); const ch = c && Chart.getChart(c.querySelector('canvas')); return c && { n:ch && ch.data.labels.length }; });
is(add && add.n === 3, '다시 열면 추가한 카드가 다시 선다');
await pg.evaluate(() => GST.filters.toggle('op', 'GST TAIWAN SCRUBBER')); await pg.waitForTimeout(900);
add = await pg.evaluate(() => { const c = document.querySelector('[data-gst-add]'); const ch = c && Chart.getChart(c.querySelector('canvas')); return ch && ch.data.labels; });
is(add && add.length === 1 && add[0] === 'GST TAIWAN SCRUBBER', '화면의 상세 필터(운영단위 = 대만)를 따른다 (' + JSON.stringify(add) + ')');
await pg.evaluate(() => GST.filters.toggle('op', 'GST TAIWAN SCRUBBER')); await pg.waitForTimeout(300);
await ctx.close();

/* ============ ④ 크기 · 자유 배치 — 주간 현황 (v205 · 사용자 「새로 만들었는데 왜 크기 조정이랑 배치를 내 맘대로 할 수가 없지?」) ============ */
console.log('[4] 크기 · 자유 배치 — 주간 현황(카드가 격자 밖 body 에 붙는 화면)');
ctx = await mkCtx(() => { window.__ME = { email:'boss@test.local', can_write:true, role:'admin' }; });
pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('report: ' + e.message));
await pg.emulateMedia({ reducedMotion:'reduce' }); await pg.setViewportSize({ width:1500, height:3000 });   // 끌기 출발·도착이 한 화면에 들게(자동 굴림은 따로)
await pg.goto(BASE + '/report/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(4500);
await pg.evaluate(() => GST.screen.edit()); await pg.waitForTimeout(300);
const ancKey = await pg.evaluate(() => { const el = GST.screen.cards().find(x => x.parentNode === document.body && !x.classList.contains('kpi') && x.offsetParent !== null); return el ? GST.screen.keyOf(el) : null; });
is(!!ancKey, '격자 밖(body)에 붙은 카드가 있다 — 사용자 화면과 같은 자리 (' + ancKey + ')');
const addAt = async () => {
  await pg.evaluate(k => { const el = GST.screen.cards().find(x => GST.screen.keyOf(x) === k); el.scrollIntoView({block:'center'}); el.querySelector('.gst-se-bar [data-a="add"]').click(); }, ancKey);
  await pg.waitForTimeout(1500); await pg.selectOption('#gstCbDlg #cbx-fX', 'op'); await pg.waitForTimeout(300); await pg.click('#gstCbDlg [data-d="ok"]'); await pg.waitForTimeout(800); };
await addAt(); await addAt();
let L4 = await pg.evaluate(k => { const A = [...document.querySelectorAll('[data-gst-add]')], anc = GST.screen.cards().find(x => GST.screen.keyOf(x) === k);
  return { n:A.length, row:A.every(a => a.parentNode.classList.contains('gse-row')), same:A.length === 2 && A[0].parentNode === A[1].parentNode, adj:A.length && A[0].parentNode.previousElementSibling === anc,
    bodyFlex:getComputedStyle(document.body).display }; }, ancKey);
is(L4.n === 2 && L4.row && L4.same && L4.adj, '추가 카드 둘이 그 카드 바로 아래 «12칸 줄»에 담긴다 (' + JSON.stringify(L4) + ')');
is(L4.bodyFlex === 'block', 'body 자체는 그대로(block) — 머리·사이드바 배치를 안 건드린다');
const drag = async (from, to, steps) => { await pg.mouse.move(from[0], from[1]); await pg.mouse.down(); await pg.mouse.move(to[0], to[1], { steps: steps || 12 }); await pg.mouse.up(); await pg.waitForTimeout(400); };
const geo = () => pg.evaluate(() => { const A = [...document.querySelectorAll('[data-gst-add]')].map(a => { const r = a.getBoundingClientRect(), rs = a.querySelector('.gse-rs').getBoundingClientRect(), h = a.querySelector('.gcb-host').getBoundingClientRect();
  return { x:r.left, y:r.top, w:r.width, hx:rs.left + rs.width / 2, hy:rs.top + rs.height / 2, hh:h.height, gw:a.getAttribute('data-gst-w') }; });
  const row = document.querySelector('.gse-row').getBoundingClientRect(); return { A, rw:row.width }; });
await pg.evaluate(() => document.querySelector('[data-gst-add]').scrollIntoView({block:'center'})); await pg.waitForTimeout(200);
let G = await geo();
await drag([G.A[0].hx, G.A[0].hy], [G.A[0].x + G.rw * 0.5, G.A[0].hy + 120]);
G = await geo();
is(G.A[0].gw === '6' && Math.abs(G.A[0].w - (G.rw - 16) / 2) < 12, '모서리를 끌면 폭이 칸에 맞춰 바뀐다 — 1/2 (' + Math.round(G.A[0].w) + ' / ' + Math.round(G.rw) + ')');
is(G.A[0].hh > 380, '같은 손잡이로 높이도 — 차트 칸 300 → ' + Math.round(G.A[0].hh) + 'px');
await pg.evaluate(() => document.querySelectorAll('[data-gst-add]')[1].scrollIntoView({block:'center'})); await pg.waitForTimeout(200); G = await geo();
await drag([G.A[1].hx, G.A[1].hy], [G.A[1].x + G.rw * 0.5, G.A[1].hy]);
G = await geo();
is(G.A[1].gw === '6' && Math.abs(G.A[0].y - G.A[1].y) < 4, '둘 다 1/2 — 한 줄에 나란히 선다');
if (process.env.SHOT) { await pg.setViewportSize({ width:1500, height:1000 }); await pg.evaluate(() => document.querySelector('.gse-row').scrollIntoView({block:'center'})); await pg.waitForTimeout(400); await pg.screenshot({ path: process.env.SHOT + '/cb-size.png' }); await pg.setViewportSize({ width:1500, height:3000 }); }
/* 다른 격자로 — 두 번째 카드를 인원 격자(#hrGrid)의 카드 옆으로 */
const tgtKey = await pg.evaluate(() => { const c = [...document.querySelectorAll('#hrGrid > .gst-se-card')].find(x => x.offsetParent !== null); if (!c) return null; c.scrollIntoView({block:'center'}); return GST.screen.keyOf(c); });
await pg.waitForTimeout(200);
const gp = await pg.evaluate(k => { const a = document.querySelectorAll('[data-gst-add]')[1], g = a.querySelector('.gse-grip').getBoundingClientRect(), t = GST.screen.cards().find(x => GST.screen.keyOf(x) === k).getBoundingClientRect();
  return { g:[g.left + g.width / 2, g.top + g.height / 2], t:[t.left + t.width * 0.75, t.top + t.height / 2] }; }, tgtKey);
await drag(gp.g, gp.t, 25);
let mv = await pg.evaluate(k => { const a = document.querySelectorAll('[data-gst-add]'); const c = GST.screen.state().edit.cfg; const id = [...a].find(x => x.parentNode.id === 'hrGrid');
  return { inHr: !!id, at: c.adds.map(x => x.at + '/' + (x.pos || '')), k }; }, tgtKey);
is(mv.inHr && mv.at.some(x => x.indexOf(tgtKey) === 0), '끌어서 다른 격자로 — 그 카드 옆에 놓이고 자리(at·pos)가 기억된다 (' + JSON.stringify(mv) + ')');
/* 화면 카드도 다른 격자로 — .arow 카드를 인원 격자로, 취소하면 원래 자리 */
const ex = await pg.evaluate(() => { const c = [...document.querySelectorAll('.arow > .gst-se-card')].find(x => x.offsetParent !== null); if (!c) return null; c.scrollIntoView({block:'center'}); return GST.screen.keyOf(c); });
await pg.waitForTimeout(200);
const gp2 = await pg.evaluate(([k, t]) => { const el = GST.screen.cards().find(x => GST.screen.keyOf(x) === k), g = el.querySelector('.gse-grip').getBoundingClientRect(); return [g.left + g.width / 2, g.top + g.height / 2]; }, [ex, tgtKey]);
const tg2 = await pg.evaluate(k => { const t = GST.screen.cards().find(x => GST.screen.keyOf(x) === k); const r = t.getBoundingClientRect(); return [r.left + r.width * 0.75, r.top + r.height / 2]; }, tgtKey);
await drag(gp2, tg2, 30);
mv = await pg.evaluate(k => { const el = GST.screen.cards().find(x => GST.screen.keyOf(x) === k); return { p: el.parentNode.id, m: JSON.stringify(GST.screen.state().edit.cfg.move) }; }, ex);
is(mv.p === 'hrGrid' && mv.m.indexOf(ex) >= 0, '화면 카드도 다른 격자로 — cfg.move 에 남는다 (' + JSON.stringify(mv) + ')');
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
is(await pg.evaluate(k => GST.screen.cards().find(x => GST.screen.keyOf(x) === k).parentNode.classList.contains('arow'), ex), 'Ctrl+Z — 원래 격자로 돌아간다');
await pg.click('#gstSePanel [data-p="save"]'); await pg.waitForTimeout(150); await pg.click('#gstSePanel [data-s="me"]'); await pg.waitForTimeout(500);
sv = (await calls(pg)).filter(c => c.rpc === 'screen_layout_save').pop();
const sz = sv && sv.args.p_config.size || {};
is(Object.keys(sz).filter(k => k.startsWith('x:') && sz[k].w === 6).length === 2 && Object.values(sz).some(v => v.h > 380), '저장 — size 에 폭(6/12)·높이 (' + JSON.stringify(sz) + ')');
await pg.reload({ waitUntil:'domcontentloaded' }); await pg.waitForTimeout(5000);
L4 = await pg.evaluate(() => { const A = [...document.querySelectorAll('[data-gst-add]')]; return A.map(a => ({ p: a.parentNode.id || a.parentNode.className, w: a.getAttribute('data-gst-w'), h: Math.round(a.querySelector('.gcb-host').getBoundingClientRect().height) })); });
is(L4.length === 2 && L4.some(a => /gse-row/.test(a.p) && a.w === '6' && a.h > 380) && L4.some(a => a.p === 'hrGrid'), '다시 열어도 — 한 장은 줄에 1/2·높이 그대로, 한 장은 인원 격자 (' + JSON.stringify(L4) + ')');
await pg.evaluate(() => GST.screen.edit()); await pg.waitForTimeout(300);
const rs0 = await pg.evaluate(() => { const a = [...document.querySelectorAll('[data-gst-add]')].find(x => x.parentNode.classList.contains('gse-row')); a.scrollIntoView({block:'center'}); const r = a.querySelector('.gse-rs').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await pg.mouse.dblclick(rs0[0], rs0[1]); await pg.waitForTimeout(300);
is(await pg.evaluate(() => { const a = [...document.querySelectorAll('[data-gst-add]')].find(x => x.parentNode.classList.contains('gse-row')); return !a.hasAttribute('data-gst-w') && Math.round(a.querySelector('.gcb-host').getBoundingClientRect().height) === 300; }), '손잡이를 두 번 누르면 원래 크기');

/* ============ ⑤ 다른 화면으로 복사 ============ */
console.log('[5] 다른 화면으로 복사');
await pg.evaluate(() => { const a = document.querySelector('[data-gst-add]'); a.scrollIntoView({block:'center'}); a.querySelector('.gst-se-bar [data-a="copy"]').click(); }); await pg.waitForTimeout(250);
is(await pg.evaluate(() => document.querySelectorAll('.gse-cpop [data-c="pg"] option').length === 8 && !document.querySelector('.gse-cpop [data-c="pg"] option[value="report"]')), '복사 창 — 다른 화면 여덟 (지금 화면은 빠진다)');
await pg.selectOption('.gse-cpop [data-c="pg"]', 'fault'); await pg.click('.gse-cpop [data-c="go"]'); await pg.waitForTimeout(500);
sv = (await calls(pg)).filter(c => c.rpc === 'screen_layout_save' && c.args.p_page === 'fault').pop();
is(sv && sv.args.p_scope === 'me' && (sv.args.p_config.adds || []).length === 1 && sv.args.p_config.adds[0].cfg.x === 'op', '고장 분석 «내 화면»에 그 차트 설정이 붙는다 — 지금 화면 배치는 그대로');
await pg.evaluate(() => GST.screen.leave(false)); await pg.waitForTimeout(300);
await pg.goto(BASE + '/fault/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(5000);   // 같은 창(가짜 DB 를 이어받는다)
is(await pg.evaluate(() => { const c = document.querySelector('[data-gst-add]'); const ch = c && Chart.getChart(c.querySelector('canvas')); return !!ch && ch.data.labels.length >= 1; }), '고장 분석을 열면 복사한 차트가 선다');
await ctx.close();

/* ============ ⑥ 이 차트로 새로 만들기 — 설비 현황 ============ */
console.log('[6] 이 차트로 새로 만들기 (라벨로 자료·축 추정)');
ctx = await mkCtx(() => { window.__ME = { email:'boss@test.local', can_write:true, role:'admin' }; });
pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('scrubber2: ' + e.message));
await pg.emulateMedia({ reducedMotion:'reduce' });
await pg.goto(BASE + '/scrubber/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(4500);
const gs = await pg.evaluate(async () => { const out = [];
  for (const cv of document.querySelectorAll('canvas[id]')) { const ch = Chart.getChart(cv); if (!ch || cv.closest('[data-gst-add]') || !cv.closest('.gst-se-card,.card')) continue;
    const L = (ch.data.labels || []).map(String); if (!L.includes('GST TAIWAN SCRUBBER') && !L.includes('YMTC')) continue;
    const g = await GST.cb.guess(ch, 'scrubber', {page:true}); out.push({ id:cv.id, L, g:g.cfg && { src:g.cfg.src, x:g.cfg.x, score:g.score, err:Math.round(g.err * 100) } }); }
  return out; });
const okG = gs.find(x => x.g && x.g.src === 'inst' && x.g.score >= 0.99);
is(!!okG, '라벨(법인·고객사)을 설치현황의 열 값과 맞춰 자료·축을 찾는다 (' + JSON.stringify(gs.map(x => [x.id, x.g])) + ')');
const MO = [ymd(dAgo(40)).slice(0, 7), ymd(ASOF).slice(0, 7)];
const tm = await pg.evaluate(async MO => { const fake = { config:{type:'bar', options:{}}, data:{ labels:MO, datasets:[{data:[1,2]}] } };
  const g = await GST.cb.guess(fake, 'fault', {page:true}); const z = await GST.cb.guess({ config:{type:'bar', options:{}}, data:{ labels:['없는값1','없는값2'], datasets:[{data:[1,2]}] } }, 'fault', {page:true});
  return { d: g.cfg && [g.cfg.x, g.cfg.bucket], none: z.cfg === null }; }, MO);
is(tm.d && tm.d[0] === 'dStart' && tm.d[1] === 'month', '날짜 꼴 라벨(2026-01)은 날짜 열 + 월 묶기');
is(tm.none, '맞는 열이 없으면 «찾지 못했다»고 한다(짐작으로 고르지 않는다)');
await pg.evaluate(() => GST.screen.edit()); await pg.waitForTimeout(300);
await pg.evaluate(id => { const el = document.getElementById(id).closest('.gst-se-card'); el.scrollIntoView({block:'center'}); el.querySelector('.gst-se-bar [data-a="chart"]').click(); }, okG.id); await pg.waitForTimeout(250);
await pg.click('.gse-cpop [data-c="clone"]'); await pg.waitForTimeout(3500);
const gm = await pg.evaluate(() => ({ t: (document.querySelector('#gstCbDlg .gcd-gm') || {}).textContent || '', x: (document.querySelector('#gstCbDlg #cbx-fX') || {}).value, hide: (document.querySelector('#gstCbDlg [data-d="hide"]') || {}).checked }));
is(/100%/.test(gm.t) && gm.hide, '새로 만들기 창 — 일치율을 적고 «원래 차트 숨기기»가 켜져 있다 (' + gm.t.slice(0, 40) + ' · x=' + gm.x + ')');
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/cb-clone.png' });
await pg.click('#gstCbDlg [data-d="ok"]'); await pg.waitForTimeout(900);
const cl = await pg.evaluate(id => { const a = document.querySelector('[data-gst-add]'), ch = a && Chart.getChart(a.querySelector('canvas')), o = Chart.getChart(document.getElementById(id));
  return { hid: document.getElementById(id).closest('.gst-se-card').hasAttribute('data-gst-hide'), L: ch && ch.data.labels.slice().sort().join('|'), O: o.data.labels.map(String).filter(x => !/^(기타|그 밖)$/.test(x)).sort().join('|') }; }, okG.id);
is(cl.hid && cl.L === cl.O, '새 차트가 서고 원래 차트는 숨는다 — 같은 라벨 (' + cl.L + ')');
await pg.evaluate(() => GST.screen.leave(false)); await ctx.close();

/* ============ ⑦ 표준 지표를 아무 축으로 — 화면 만들기 ============ */
console.log('[7] 표준 지표를 아무 축으로 (GST.metrics.keyBy)');
ctx = await mkCtx(() => { window.__ME = { email:'boss@test.local', can_write:true, role:'admin' }; });
pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('studio2: ' + e.message));
await pg.goto(BASE + '/studio/?new=1', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3500);
const M7 = await pg.evaluate(async () => { const D = await stdData(), R = D.R, a = D.asOf, out = {};
  const sum = (by, f) => Object.values(by.G).reduce((s, g) => s + f(g), 0);
  const byOp = GST.metrics.by(R, a, GST.metrics.keyBy(R, 'op')), byCu = GST.metrics.by(R, a, GST.metrics.keyBy(R, 'cust')), byMo = GST.metrics.by(R, a, GST.metrics.keyBy(R, 'model'));
  out.inN = [sum(byOp, g => g.inN), sum(byCu, g => g.inN), sum(byMo, g => g.inN)];
  out.bm4 = [sum(byOp, g => g.bm4), sum(byCu, g => g.bm4), sum(byMo, g => g.bm4)];
  out.risk = [sum(byOp, g => g.risk.length), sum(byCu, g => g.risk.length)];
  out.cust = Object.keys(byCu.G).sort(); out.miss = (byCu.G['—'] || {}).bm4 || 0;
  out.tw = byCu.G['Micron Memory Taiwan Co., Ltd.(F16)'] && byCu.G['Micron Memory Taiwan Co., Ltd.(F16)'].m.run_rate.v;
  return out; });
is(M7.inN[0] === M7.inN[1] && M7.inN[1] === M7.inN[2] && M7.bm4[0] === M7.bm4[1] && M7.bm4[1] === M7.bm4[2] && M7.risk[0] === M7.risk[1], '축을 바꿔도 합은 같다 — 판정은 그대로, 묶는 열쇠만 바뀐다 (반입 ' + M7.inN + ' · 고장 ' + M7.bm4 + ' · 위험 ' + M7.risk + ')');
is(M7.cust.length === 3 && M7.miss === 0, '고객사 축 — 수선실적 행도 S/N 으로 설치현황의 고객사를 찾는다(미상 0) (' + M7.cust + ')');
is(Math.round(M7.tw) === Math.round(28 / 30 * 100), '고객사별 가동률 — 대만 28/30 (' + M7.tw + ')');
await pg.click('#addStd'); await pg.waitForTimeout(200); await pg.click('.sd-menu [data-add="mbar"]'); await pg.waitForTimeout(1500);
const mb = await pg.evaluate(() => { const w = S.board.widgets[S.board.widgets.length - 1], el = document.querySelector('#board [data-w="' + (S.board.widgets.length - 1) + '"]'), ch = el && Chart.getChart(el.querySelector('canvas'));
  return { std:w.std, ax:w.axis, n: el && el.querySelector('h3 .n').textContent, L: ch && ch.data.labels }; });
is(mb.std === 'mbar' && mb.ax === 'model' && mb.L && mb.L[0] === 'GST-1000' && /모델별/.test(mb.n), '«지표 축별 비교» 위젯 — 100대당 고장 × 모델 (' + JSON.stringify(mb) + ')');
await ctx.close();

/* ============ ⑧ 레시피 = 화면 숫자 — 고장 분석 (v206 · 사용자 「추정 말고 정확히」) ============ */
console.log('[8] 고장 분석 차트 레시피 — 화면 차트와 막대마다 같은가');
ctx = await mkCtx(() => { window.__ME = { email:'boss@test.local', can_write:true, role:'admin' }; });
pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('fault8: ' + e.message));
await pg.emulateMedia({ reducedMotion:'reduce' });
await pg.goto(BASE + '/fault/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(5000);
const cmpAll = () => pg.evaluate(async () => {
  await GST.cb.load('wk'); const out = {}, etc = /^(기타|그 밖|Other|其他|その他)$/;
  for (const id of GST.cb.recipes()) { const rc = GST.cb.recipeOf(id); if (!rc || !rc.cfg) continue;
    const ch = Chart.getChart(document.getElementById(id)); if (!ch) { out[id] = 'NOCHART'; continue; }
    const R = GST.cb.run(rc.cfg, { page:true }); if (!R || R.err) { out[id] = 'RUNERR ' + (R && R.err); continue; }
    const cv = R.sets[0] ? R.sets[0].data : [], pl = (ch.data.labels || []).map(String), pd = ch.data.datasets[0].data;
    const rnd = v => v == null ? 0 : Math.round(v);
    let bad = [];
    if (rc.cfg.range === 'nb') { const n = R.xs.length; if (pl.length < n || n < 2) bad.push('len ' + n + '/' + pl.length);   // 화면 추이는 뒤에 예측 3칸이 붙는다
      for (let i = 0; i < Math.min(n, pl.length); i++) if (rnd(cv[i]) !== rnd(pd[i])) bad.push(i + ':' + rnd(cv[i]) + '/' + rnd(pd[i])); }
    else { const M = {}; R.xs.forEach((x, i) => { M[String(x)] = cv[i]; });
      pl.forEach((l, i) => { if (etc.test(l)) return; if (rnd(M[l]) !== rnd(pd[i])) bad.push(l + ':' + rnd(M[l]) + '/' + rnd(pd[i])); });
      if (pl.filter(l => !etc.test(l)).length && !R.xs.length) bad.push('empty'); }
    out[id] = bad.length ? bad.slice(0, 4).join(' ') : 'OK(' + pl.length + ')'; }
  return out; });
let C8 = await cmpAll();
const okAll = o => Object.values(o).every(v => /^OK/.test(v));
is(Object.keys(C8).length >= 12 && okAll(C8), '레시피 12장 — 화면 차트와 막대마다 같은 숫자 (' + JSON.stringify(C8) + ')');
await pg.evaluate(() => { GST.filters.toggle('op', 'GST TAIWAN SCRUBBER'); F.stage = 'BM'; render(); }); await pg.waitForTimeout(1200);
C8 = await cmpAll();
is(okAll(C8), '운영단위 = 대만 · 작업단계 = BM 을 걸어도 같다 (' + JSON.stringify(C8) + ')');
const rc8 = await pg.evaluate(() => { const r = GST.cb.recipeOf('cLine'), n = GST.cb.recipeOf('cRelModel'), q = (F.q = 'pump', GST.cb.recipeOf('cLine')); F.q = '';
  return { st: r.cfg.filters.some(f => f.f === 'stage' && f.op === 'eq' && f.v === 'BM'), none: n && n.none, drop: q.drop }; });
is(rc8.st && rc8.none === 'derived' && rc8.drop.indexOf('q') >= 0, '레시피는 «부를 때의» 조건을 담는다(작업단계 BM) · 신뢰성 차트는 none · 검색어는 «옮기지 않음»으로 밝힌다');
await pg.evaluate(() => { GST.filters.toggle('op', 'GST TAIWAN SCRUBBER'); F.stage = ''; render(); }); await pg.waitForTimeout(800);
await pg.evaluate(() => GST.screen.edit()); await pg.waitForTimeout(300);
await pg.evaluate(() => { const el = document.getElementById('cTrend').closest('.gst-se-card'); el.scrollIntoView({block:'center'}); el.querySelector('.gst-se-bar [data-a="chart"]').click(); }); await pg.waitForTimeout(250);
await pg.click('.gse-cpop [data-c="clone"]'); await pg.waitForTimeout(2500);
const ex8 = await pg.evaluate(() => ({ t: (document.querySelector('#gstCbDlg .gcd-gm') || {}).textContent || '', r: (document.querySelector('#gstCbDlg #cbx-fRange') || {}).value }));
is(/같은 계산/.test(ex8.t) && /UPM/.test(ex8.t) && ex8.r === 'nb', '새로 만들기 — «이 화면과 같은 계산» · 옮기지 않은 것(UPM 율 선·예측)을 적는다 · 범위 = 최근 N 구간 (' + ex8.t.slice(0, 60) + ')');
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/cb-exact.png' });
await pg.click('#gstCbDlg [data-d="ok"]'); await pg.waitForTimeout(900);
const tr8 = await pg.evaluate(() => { const a = document.querySelector('[data-gst-add]'), ch = Chart.getChart(a.querySelector('canvas')), o = Chart.getChart(document.getElementById('cTrend'));
  return { n: ch.data.labels.length, d: ch.data.datasets[0].data.join(','), o: o.data.datasets[0].data.slice(0, 12).join(',') }; });
is(tr8.n === 12 && tr8.d === tr8.o, '새 차트 = 원래 추이 막대 12구간 그대로 (' + tr8.d + ')');
await pg.evaluate(() => GST.screen.leave(false));

/* ============ ⑨ 카드 그대로 가져오기 — 주간 현황 카드를 고장 분석에 ============ */
console.log('[9] 카드 그대로 가져오기 (주간 현황 → 고장 분석)');
await pg.goto(BASE + '/report/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(5000);
const src9 = await pg.evaluate(() => { const ch = Chart.getChart(document.getElementById('cFt')); return ch && JSON.stringify({ l: ch.data.labels, d: ch.data.datasets.map(x => x.data) }); });
await pg.evaluate(() => GST.screen.edit()); await pg.waitForTimeout(300);
await pg.evaluate(() => { const el = document.getElementById('cFt').closest('.gst-se-card'); el.scrollIntoView({block:'center'}); el.querySelector('.gst-se-bar [data-a="copy"]').click(); }); await pg.waitForTimeout(300);
const why9 = await pg.evaluate(() => ({ why: (document.querySelector('.gse-cpop .gse-why') || {}).textContent || '', how: document.querySelectorAll('.gse-cpop input[name="gsehow"]').length }));
is(/설정으로 옮길 수 없습니다/.test(why9.why) && why9.how === 0, '주간 현황 카드 — 왜 설정으로 못 옮기는지 적고 «카드 그대로»만 (' + why9.why.slice(0, 50) + ')');
await pg.selectOption('.gse-cpop [data-c="pg"]', 'fault'); await pg.click('.gse-cpop [data-c="go"]'); await pg.waitForTimeout(500);
sv = (await calls(pg)).filter(c => c.rpc === 'screen_layout_save' && c.args.p_page === 'fault').pop();
const emb = sv && (sv.args.p_config.adds || []).find(a => a.embed);
is(!!emb && emb.embed.page === 'report' && emb.embed.key === 'cv:cFt', '고장 분석 배치에 «카드 그대로»(page·key)가 붙는다 (' + JSON.stringify(emb && emb.embed) + ')');
await pg.evaluate(() => GST.screen.leave(false)); await pg.waitForTimeout(200);
await pg.goto(BASE + '/fault/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(4000);
await pg.evaluate(() => { const a = document.querySelector('.gst-emb-card'); if (a) a.scrollIntoView({block:'center'}); }); await pg.waitForTimeout(8000);
const fr9 = await pg.evaluate(() => { const fr = document.querySelector('.gst-emb-card iframe'); if (!fr) return null; const W = fr.contentWindow, D = fr.contentDocument;
  const ch = W.Chart && W.Chart.getChart(D.getElementById('cFt')); const vis = [...D.querySelectorAll('.card,.tablecard,.kpi')].filter(x => x.getBoundingClientRect().height > 0).length;
  return { ready: D.documentElement.classList.contains('gse-ready'), j: ch && JSON.stringify({ l: ch.data.labels, d: ch.data.datasets.map(x => x.data) }), vis, h: fr.parentNode.getBoundingClientRect().height }; });
is(fr9 && fr9.ready && fr9.j === src9, '고장 분석 안에서 주간 현황 «Alarm·고장» 카드가 같은 숫자로 선다');
is(fr9 && fr9.vis === 1 && fr9.h > 200, '그 카드 하나만 보인다 · 칸 높이를 카드에 맞춘다 (' + JSON.stringify(fr9 && { vis: fr9.vis, h: Math.round(fr9.h) }) + ')');
await pg.evaluate(() => GST.filters.toggle('op', 'GST TAIWAN SCRUBBER')); await pg.waitForTimeout(1500);
const f9 = await pg.evaluate(() => { const W = document.querySelector('.gst-emb-card iframe').contentWindow; return { op: [...W.GST.filters.F.op], saved: W.localStorage.getItem('gst_bf_report') }; });
is(f9.op.length === 1 && f9.op[0] === 'GST TAIWAN SCRUBBER' && !/TAIWAN/.test(f9.saved || ''), '이 화면의 상세 필터(대만)를 카드도 따른다 — 그 화면의 저장된 필터는 안 바꾼다 (' + JSON.stringify(f9) + ')');
await pg.evaluate(() => document.querySelector('.gst-emb-card iframe').contentWindow.GST.rowsModal('t', ['a'], [['1']])); await pg.waitForTimeout(200);
is(await pg.evaluate(() => !!document.querySelector('.gov')), '카드의 세부내역 창은 이 화면에서 열린다(카드 칸 안이 아니라)');
if (process.env.SHOT) { await pg.keyboard.press('Escape'); await pg.evaluate(() => document.querySelector('.gst-emb-card').scrollIntoView({block:'center'})); await pg.waitForTimeout(400); await pg.screenshot({ path: process.env.SHOT + '/cb-embed.png' }); }
await ctx.close();

is(errs.length === 0, 'JS 에러 0' + (errs.length ? ' → ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-cb: ${pass} 통과 · ${fail} 실패` : `\n✅ t-cb: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
