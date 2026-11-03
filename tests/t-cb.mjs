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
  wk.push(['SCRUBBER', op, 'C', campus, campus, 'B1', 'ETCH', 'DRY', 'GST-1000', 'R' + n, '완료', '정기', stage, 'A', 'W' + n, 'MT', 'P',
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

is(errs.length === 0, 'JS 에러 0' + (errs.length ? ' → ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-cb: ${pass} 통과 · ${fail} 실패` : `\n✅ t-cb: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
