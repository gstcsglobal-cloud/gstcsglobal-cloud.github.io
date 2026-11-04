/* t-v207 — 근거 · 사건 주석 · 북마크 · 사용자 정의 지표 · 조회자 미리 보기 · 화면 버전 · 화면 만들기(템플릿·변수·교차 필터) · 알림 관리 화면.
   픽스처는 t-screen 과 같다(지어낸 자료만 · t-leak). 진짜 서버 규칙은 t-notifysql 이 진짜 Postgres 에서 본다 — 여기는 «화면이 무엇을 보내고 어떻게 그리나».
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-v207.mjs */
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

/* 가짜 Supabase — v207 RPC 를 «기록»하고 흉내낸다 */
const FAKE = String.raw`
(function(){ const me = (window.__ME && window.__ME.email) || 'boss@test.local';
  let L; try{ L = JSON.parse(localStorage.getItem('__V7') || 'null'); }catch(e){}
  L = L || { screens: [], rows: [], calls: [], seq: 0, hist: [], notes: [], metrics: [], bms: [], subs: [], log: [] };
  if (window.__SEED && !L.seeded){ L = Object.assign(L, window.__SEED); L.seeded = true; }
  window.__V7 = L; const keep = () => { try{ localStorage.setItem('__V7', JSON.stringify(L)); }catch(e){} };
  const TBL = { screen_layouts: () => L.screens.filter(r => !r.removed && (r.owner === '' || r.owner === me)),
    user_layouts: () => L.rows.filter(r => !r.removed && (r.shared || r.owner === me)), chart_notes: () => L.notes, custom_metrics: () => L.metrics,
    user_bookmarks: () => L.bms.filter(b => !b.removed), brief_snap: () => [{ scope:'all' }, { scope:'o:GST TAIWAN SCRUBBER' }] };
  window.__FDB = { from: function(tbl){ const F = []; const o = { select(){ return o; }, order(){ return o; }, limit(){ return o; },
      eq(c, v){ F.push(r => String(r[c]) === String(v)); return o; }, in(c, vs){ F.push(r => vs.indexOf(r[c]) >= 0); return o; }, not(c, op, v){ F.push(r => r[c] != null); return o; },
      then(res, rej){ let data = (TBL[tbl] ? TBL[tbl]() : []).filter(r => F.every(f => f(r))).map(r => JSON.parse(JSON.stringify(r)));
        return Promise.resolve({ data, error:null }).then(res, rej); } }; return o; },
    rpc: async function(n, a){ a = JSON.parse(JSON.stringify(a || {})); L.calls.push({ rpc:n, args: JSON.parse(JSON.stringify(a)) }); setTimeout(keep, 0);
      const now = new Date(Date.now() + L.calls.length).toISOString();
      if (n === 'screen_layout_save') { const ow = a.p_scope === 'all' ? '' : me; let r = L.screens.find(x => x.page === a.p_page && x.owner === ow);
        if (r && !r.removed && r.updated_at !== a.p_at) return { data:{ ok:false, error:'conflict' }, error:null };
        if (!r){ r = { page:a.p_page, owner:ow }; L.screens.push(r); } Object.assign(r, { config:a.p_config, removed:a.p_config == null, updated_at:now });
        L.hist.push({ id: L.hist.length + 1, kind:'screen', ref:a.p_page + '|' + ow, config:a.p_config, at:now, by:me }); return { data:{ ok:true, at:now }, error:null }; }
      if (n === 'layout_save') { let id = a.p_id; if (id == null) { id = ++L.seq; L.rows.push({ id, owner:me, name:a.p_name, config:a.p_config, shared:a.p_shared, removed:false, pub:null }); }
        else { const r = L.rows.find(x => x.id === id); Object.assign(r, { name:a.p_name, config:a.p_config, shared:a.p_shared }); }
        L.hist.push({ id: L.hist.length + 1, kind:'board', ref:String(id), config:a.p_config, at:now, by:me }); return { data:{ id, created:a.p_id == null }, error:null }; }
      if (n === 'layout_versions') { const list = L.hist.filter(h => h.kind === a.p_kind && h.ref === a.p_ref).map(h => ({ id:h.id, at:h.at, by:h.by, reset:h.config == null,
          n: h.config ? ((h.config.order || h.config.widgets || []).length) : 0 })).reverse(); return { data:{ list }, error:null }; }
      if (n === 'layout_version') { const h = L.hist.find(x => x.id === a.p_id); return { data: h ? { id:h.id, config:h.config } : { error:'forbidden' }, error:null }; }
      if (n === 'note_save') { const id = L.notes.length + 1; L.notes.push({ id, owner:me, page:a.p_page, d:a.p_d, d2:a.p_d2, text:a.p_text, tone:a.p_tone, shared:a.p_shared }); return { data:{ ok:true, id }, error:null }; }
      if (n === 'metric_save') { const id = L.metrics.length + 1; L.metrics.push({ id, owner:me, name:a.p_name, src:a.p_src, def:a.p_def, shared:a.p_shared }); return { data:{ ok:true, id }, error:null }; }
      if (n === 'bm_save') { const id = L.bms.length + 1; L.bms.push({ id, owner:me, name:a.p_name, tab:a.p_tab, sec:a.p_sec, state:a.p_state, shared:a.p_shared }); return { data:{ ok:true, id }, error:null }; }
      if (n === 'mine_remove') { const arr = a.p_kind === 'bookmark' ? L.bms : a.p_kind === 'note' ? L.notes : L.metrics; const x = arr.find(r => r.id === a.p_id); if (x) x.removed = true; return { data:{ ok:!!x }, error:null }; }
      if (n === 'value_groups') return { data: a.p_tbl === 'sheet_inst' ? [{ country:'SEC Scrubber', location:'P1', fab:'', n:5 }, { country:'SEC Scrubber', location:'P2', fab:'', n:3 },
          { country:'GST TAIWAN SCRUBBER', location:'', fab:'F16', n:4 }] : [{ op:'SEC Scrubber', campus:'P3', line:'', n:9 }, { op:'GST TAIWAN SCRUBBER', campus:'', line:'F16', n:2 }], error:null };
      if (n === 'notify_admin') return { data:{ subs:L.subs.filter(s => !s.removed), log:L.log, people:[{ email:'boss@test.local', role:'admin' }, { email:'view@test.local', role:'viewer' }],
          kakao:[{ email:'view@test.local', verified_at:now, n:1, allowed:true }, { email:'out@other.local', verified_at:now, n:1, allowed:false }] }, error:null };
      if (n === 'notify_save') { if (a.p_id == null) { if (L.subs.some(s => !s.removed && s.channel === a.p_set.channel && s.target === a.p_set.target && s.scope === (a.p_set.scope || 'all'))) return { data:{ ok:false, error:'duplicate' }, error:null };
          const id = L.subs.length + 1; L.subs.push(Object.assign({ id, enabled:true, freq:'weekly', hour:8, dow:1, dom:1, scope:'all', kinds:['brief','actions'], updated_at:now }, a.p_set)); return { data:{ ok:true, id, at:now }, error:null }; }
        const s = L.subs.find(x => x.id === a.p_id); if (s.updated_at !== a.p_at) return { data:{ ok:false, error:'conflict' }, error:null }; Object.assign(s, a.p_set, { updated_at:now }); return { data:{ ok:true, id:s.id, at:now }, error:null }; }
      if (n === 'notify_remove') { const s = L.subs.find(x => x.id === a.p_id); s.removed = true; return { data:{ ok:true }, error:null }; }
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
const calls = (pg, n) => pg.evaluate(n => ((window.__V7 || {}).calls || []).filter(c => !n || c.rpc === n), n);
const errs = [];
const page = async (ctx, url, tag) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(tag + ': ' + e.message)); p.on('dialog', d => d.accept(tag === 'shell' ? '우리 북마크' : undefined));
  await p.emulateMedia({ reducedMotion:'reduce' }); await p.goto(BASE + url, { waitUntil:'domcontentloaded' }); await p.waitForTimeout(3500); return p; };
const ADMIN = () => { window.__ME = { email:'boss@test.local', can_write:true, role:'admin' }; };

console.log('[1] 근거 — 자료 · 기준 시각 · 필터 · 계산');
let ctx = await mkCtx(ADMIN);
let pg = await page(ctx, '/fault/', 'fault');
const why = await pg.evaluate(() => { const id = 'cTrend'; GST.cardWhy(id); const ov = document.querySelector('.gov'); const t = ov ? ov.innerText : ''; GST._ovClose(); return t; });
is(/이 카드의 근거/.test(why) && /수선 ?실적/.test(why) && /계산/.test(why), '근거 창 — 자료 이름과 계산이 적힌다');
is(/수선실적 · 건수 · 가로축 dStart/.test(why), '레시피가 있는 카드는 그 계산을 글로 적는다(추정하지 않는다)');
const why2 = await pg.evaluate(() => { const R = GST.cb.recipes(), nid = R.find(id => (GST.cb.recipeOf(id) || {}).none), free = [...document.querySelectorAll('canvas[id]')].map(c => c.id).find(id => R.indexOf(id) < 0 && Chart.getChart(document.getElementById(id)));
  const read = id => { GST.cardWhy(id); const t = (document.querySelector('.gov') || {}).innerText || ''; GST._ovClose(); return t; }; return [nid, read(nid), free, free ? read(free) : '']; });
is(/같은 숫자를 못 냅니다/.test(why2[1]), '못 내는 레시피(' + why2[0] + ')는 그 까닭을 적는다');
is(!why2[2] || /이 화면 코드가 센 숫자/.test(why2[3]), '레시피가 없는 카드(' + why2[2] + ')는 «이 화면 코드가 센 숫자»라고 말한다');
const menu = await pg.evaluate(() => { const b = document.querySelector('.capbtns button'); if (!b) return ''; b.click(); const m = document.querySelector('.gexp-menu'); const t = m ? m.innerText : ''; document.querySelectorAll('.gexp-menu').forEach(x => x.remove()); return t; });
is(/근거/.test(menu) && /사건 주석/.test(menu), '카드의 「내보내기 ▾」 메뉴에 «근거» · «사건 주석»');

console.log('[2] 사건 주석 — 날짜 칸에 세로선 · 저장은 note_save');
const rg = await pg.evaluate(() => [GST.notes.labRange('2026-08'), GST.notes.labRange('26.08'), GST.notes.labRange('2026-Q3'), GST.notes.idxOf(['2026-07','2026-08','2026-09'], '2026-08-14'), GST.notes.idxOf(['W40','W41','W42'], '2026-10-06')]);
is(rg[0][0] === '2026-08-01' && rg[0][1] === '2026-08-31' && rg[1][0] === '2026-08-01' && rg[2][1] === '2026-09-30', '라벨 → 날짜 범위(월 · 26.08 · 분기)');
is(rg[3] === 1 && rg[4] >= 0, '주석 날짜 → 그 칸(월 · 주)');
const drew = await pg.evaluate(async () => { const seen = []; const of = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function(t){ seen.push(String(t)); return of.apply(this, arguments); };
  const ch = Chart.getChart(document.getElementById('cTrend')); const lab = ch.data.labels.map(String);
  const rg = GST.notes.idxOf(lab, '2000-01-01') < 0 ? null : 1; const nowM = new Date(); const d = nowM.getFullYear() + '-' + String(nowM.getMonth() + 1).padStart(2, '0') + '-02';
  GST.notes._set([{ id:1, d: d || '2000-01-01', text:'교체 캠페인', tone:'warn', page:'*' }]);
  await new Promise(r => setTimeout(r, 300)); CanvasRenderingContext2D.prototype.fillText = of; GST.notes._set([]);
  return { d, hit: seen.indexOf('교체 캠페인') >= 0, lab: lab.slice(-4) }; });
is(drew.hit, '날짜 축 차트에 주석 글이 그려진다 (' + drew.d + ' · ' + drew.lab.join(',') + ')');
await pg.evaluate(() => GST.notes.dialog()); await pg.waitForTimeout(400);
await pg.fill('#gnText', '설비 이설'); await pg.click('#gnAdd'); await pg.waitForTimeout(400);
const ns = await calls(pg, 'note_save');
is(ns.length === 1 && ns[0].args.p_text === '설비 이설' && ns[0].args.p_page === 'fault' && ns[0].args.p_shared === true, '주석 추가 — note_save(이 화면 · 모두에게) · ' + JSON.stringify(ns[0] && ns[0].args).slice(0, 120));
await pg.evaluate(() => GST._ovClose());

console.log('[3] 조회자로 미리 보기');
await pg.goto(BASE + '/scrubber/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3000);
await pg.evaluate(() => GST.previewViewer(true)); await pg.waitForTimeout(3500);
const pv = await pg.evaluate(() => ({ role: document.body.dataset.role, adm: GST.isAdmin(), band: !!document.getElementById('gstPvBand'), real: GST._pvReal && GST._pvReal.role }));
is(pv.role === 'viewer' && !pv.adm && pv.band && pv.real === 'admin', '관리자가 미리 보기를 켜면 다시 열려 조회자 등급으로 보인다 · 위에 «미리 보기 끝내기»');
await pg.click('#gstPvBand button'); await pg.waitForTimeout(3500);
is(await pg.evaluate(() => document.body.dataset.role === 'admin' && !document.getElementById('gstPvBand')), '끝내면 관리자 화면으로 돌아온다');

console.log('[4] 화면 편집 — 이전 버전');
await pg.evaluate(() => window.postMessage({ type:'gst-screen-edit' }, '*')); await pg.waitForTimeout(400);
const k0 = await pg.evaluate(() => GST.screen.cards().map(c => GST.screen.keyOf(c)));
await pg.evaluate(() => { document.querySelector('#gstSePanel [data-p="save"]').click(); }); await pg.waitForTimeout(150);
await pg.evaluate(() => { document.querySelector('#gstSePanel [data-s="me"]').click(); }); await pg.waitForTimeout(600);
const h1 = await pg.evaluate(() => (window.__V7.hist || []).length);
is(h1 === 1, '저장하면 버전이 하나 생긴다(서버는 트리거가 남긴다)');
await pg.evaluate(() => window.postMessage({ type:'gst-screen-edit' }, '*')); await pg.waitForTimeout(400);
await pg.evaluate(() => { const hid = GST.screen.cards().find(c => !c.classList.contains('kpi') && c.offsetWidth > 0); const b = hid.querySelector('.gse-hide'); if (b) b.click(); }); await pg.waitForTimeout(200);
await pg.evaluate(() => document.querySelector('#gstSePanel [data-p="ver"]').click()); await pg.waitForTimeout(500);
const vm = await pg.evaluate(() => { const m = document.querySelector('#gstSePanel .gse-menu'); return m ? m.innerText : ''; });
is(/내 배치/.test(vm) && /불러오기/.test(vm), '«이전 버전 ▾» — 저장한 버전 목록(내 배치 · 카드 수)');
await pg.evaluate(() => document.querySelector('#gstSePanel .gse-menu [data-v]').click()); await pg.waitForTimeout(500);
const vl = await pg.evaluate(() => ({ hid: document.querySelectorAll('[data-gst-hide]').length, st: (document.querySelector('#gstSePanel .gse-st') || {}).textContent }));
is(vl.hid === 0 && /저장하지 않은 변경/.test(vl.st || ''), '불러오면 그 버전 배치로 돌아가고 «저장하지 않은 변경»이 된다(바로 덮지 않는다)');
await pg.evaluate(() => document.querySelector('#gstSePanel [data-p="cancel"]').click());
await ctx.close();

console.log('[5] 화면 만들기 — 템플릿 · 보드 변수 · 교차 필터 · 저장한 지표 · 버전');
ctx = await mkCtx(ADMIN);
pg = await page(ctx, '/studio/', 'studio');
const tl = await pg.evaluate(() => [...document.querySelectorAll('[data-tpl]')].map(b => b.dataset.tpl));
is(tl.join() === 'daily,weekly,site,mat', '화면 목록에 템플릿 넷 (' + tl.join(',') + ')');
await pg.click('[data-tpl="weekly"]'); await pg.waitForTimeout(3500);
const tw = await pg.evaluate(() => ({ n: S.board.widgets.length, kinds: S.board.widgets.map(w => w.kind === 'std' ? w.std : (w.kind || 'chart')).join(','), name: document.getElementById('boardName').value, dirty: S.dirty }));
is(tw.n === 8 && /kpi,kpi,kpi,kpi,chart,chart,optable/.test(tw.kinds) && tw.name === '주간 보고' && tw.dirty, '«주간 보고» 템플릿 — 지표 넷 · 차트 둘 · 목표 대비 표 (' + tw.kinds + ')');
await pg.selectOption('#varOp', 'GST TAIWAN SCRUBBER'); await pg.waitForTimeout(3000);
const vv = await pg.evaluate(async () => { const w = S.board.widgets.findIndex(x => !x.kind); const c = await varCfg(S.board.widgets[w], w); return { f: c.filters, std: varStd(S.board.widgets[1]).scope }; });
is(vv.f.some(f => f.f === 'op' && f.v === 'GST TAIWAN SCRUBBER') && vv.std === 'o:GST TAIWAN SCRUBBER', '보드 변수 «운영단위» — 차트에는 거르기 조건 · 표준 지표에는 범위로');
await pg.click('#xfBtn'); await pg.waitForTimeout(3000);
const ci = await pg.evaluate(() => S.board.widgets.findIndex(x => !x.kind && x.x === 'i:model'));
const xs = await pg.evaluate(async ci => { const h = document.querySelector('[data-wh="' + ci + '"]'); const cv = h && h.querySelector('canvas'); const ch = cv && Chart.getChart(cv); if (!ch) return { err:'no chart' };
  const lab = ch.data.labels[0]; ch.options.onClick(null, [{ index:0 }]); await new Promise(r => setTimeout(r, 2500));
  const other = S.board.widgets.findIndex((x, i) => !x.kind && i !== ci); const c = await varCfg(S.board.widgets[other], other);
  return { lab, xf: S.xf, f: c.filters, chip: (document.querySelector('.sd-xchip') || {}).textContent || '' }; }, ci);
is(xs.xf && xs.xf.v === String(xs.lab) && xs.f.some(f => f.f === 'i:model' && f.v === String(xs.lab)) && /=/.test(xs.chip), '교차 필터 — 모델 막대를 누르면 다른 차트에 «모델 = ' + xs.lab + '» 가 걸리고 칩이 선다');
await pg.click('#xfClr'); await pg.waitForTimeout(500);
is(await pg.evaluate(() => S.xf === null), '칩의 ✕ 로 교차 필터를 푼다');
await pg.evaluate(() => { GST.cmetrics._set([{ id:9, name:'BM 건수', src:'wk', shared:true, def:{ measures:[{ agg:'count' }], filters:[{ f:'stage', op:'eq', v:'BM' }] } }]); drawForm(); }); await pg.waitForTimeout(300);
await pg.selectOption('#fCm', '0'); await pg.waitForTimeout(300);
is(await pg.evaluate(() => S.cfg.filters.some(f => f.f === 'stage' && f.v === 'BM') && S.cfg.title === 'BM 건수'), '«저장한 지표 불러오기» — 그 지표의 값·조건이 폼에 들어온다');
await pg.click('#cmSave'); await pg.waitForTimeout(200); await pg.fill('#gcmN', '내 지표'); await pg.click('#gcmGo'); await pg.waitForTimeout(400);
const ms = await calls(pg, 'metric_save');
is(ms.length === 1 && ms[0].args.p_src === 'wk' && ms[0].args.p_def.measures.length >= 1 && ms[0].args.p_name === '내 지표', '«이 값을 지표로 저장» — metric_save(자료 · 값 · 조건)');
await pg.click('#saveBtn'); await pg.waitForTimeout(800);
const sv = await calls(pg, 'layout_save');
is(sv.length === 1 && sv[0].args.p_config.vars.op === 'GST TAIWAN SCRUBBER' && !('xf' in sv[0].args.p_config), '보드 저장 — 변수는 같이 저장 · 교차 필터는 저장하지 않는다');
await pg.evaluate(() => { S.board.widgets.pop(); setDirty(true); }); await pg.click('#saveBtn'); await pg.waitForTimeout(800);
await pg.evaluate(() => document.getElementById('verBtn').click()); await pg.waitForTimeout(600);
const vb = await pg.evaluate(() => [...document.querySelectorAll('[data-ver]')].map(b => b.textContent));
is(vb.length === 2 && /위젯 8개/.test(vb[1]), '보드 «이전 버전» — 저장한 두 버전 (' + vb.join(' / ') + ')');
await pg.evaluate(() => [...document.querySelectorAll('[data-ver]')].pop().click()); await pg.waitForTimeout(800);
is(await pg.evaluate(() => S.board.widgets.length === 8 && S.dirty), '옛 버전을 불러오면 위젯이 돌아오고 «저장하지 않은 변경»');
await ctx.close();

console.log('[6] 알림 발송 관리 화면');
ctx = await mkCtx(ADMIN);
await ctx.route(/notify-send\?op=test/, r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, id:1 }) }));
pg = await page(ctx, '/notify/', 'notify');
const np = await pg.evaluate(() => ({ add: !!document.getElementById('addGo'), kk: document.querySelectorAll('#cKakao tbody tr').length, warn: (document.getElementById('cKakao').innerText.match(/아님/g) || []).length }));
is(np.add && np.kk === 2 && np.warn === 1, '관리자에게 등록 칸 · 카톡 인증 사용자 둘(대시보드 사용자 아님 1)');
await pg.fill('#addMail', 'boss@test.local'); await pg.selectOption('#addBox [data-f="freq"]', 'daily'); await pg.selectOption('#addBox [data-f="hour"]', '7');
await pg.click('#addGo'); await pg.waitForTimeout(800);
let sc = await calls(pg, 'notify_save');
is(sc.length === 1 && sc[0].args.p_set.channel === 'email' && sc[0].args.p_set.target === 'boss@test.local' && sc[0].args.p_set.freq === 'daily' && sc[0].args.p_set.hour === 7 && sc[0].args.p_set.kinds.join() === 'brief,actions', '메일 수신자 등록 — notify_save(채널 · 주소 · 매일 07시 · 브리핑+조치 사항)');
is(await pg.evaluate(() => document.querySelectorAll('#cSubs tbody tr[data-id]').length) === 1, '등록하면 수신자 표에 선다');
await pg.click('#addCh [data-ch="kakao"]'); await pg.check('#addKk input[value="view@test.local"]'); await pg.click('#addGo'); await pg.waitForTimeout(800);
sc = await calls(pg, 'notify_save');
is(sc.length === 2 && sc[1].args.p_set.channel === 'kakao' && sc[1].args.p_set.target === 'view@test.local', '카톡 — 인증된 사람을 골라 등록(식별자가 아니라 이메일로)');
const og = await pg.evaluate(() => { const sel = document.querySelector('#addBox [data-f="scope"]');
  return { grp: [...sel.querySelectorAll('optgroup')].map(g => g.label + ':' + [...g.querySelectorAll('option')].map(o => o.value).join('/')), allNote: /먼저 범위에서/.test(document.querySelector('#addBox [data-sites]').textContent) }; });
is(og.grp.join() === '국내 운영단위:o:SEC Scrubber,해외 운영단위:o:GST TAIWAN SCRUBBER' && og.allNote, '범위 — 설비·실적에 있는 운영단위 전부(구분별 묶음) · 전사에서는 사이트를 안 고른다 (' + og.grp.join(' | ') + ')');
await pg.selectOption('#addBox [data-f="scope"]', 'o:SEC Scrubber'); await pg.waitForTimeout(200);
const st = await pg.evaluate(() => [...document.querySelectorAll('#addBox [data-sites] input')].map(i => i.value).join());
is(st === 'P1,P2,P3', '운영단위를 고르면 그 운영단위의 사이트(단지)가 뜬다 — 설비 + 실적 (' + st + ')');
await pg.click('#addCh [data-ch="email"]'); await pg.fill('#addMail', 'site@test.local'); await pg.check('#addBox [data-sites] input[value="P3"]'); await pg.check('#addBox [data-sites] input[value="P1"]');
await pg.check('#addBox [data-p="report"]'); await pg.click('#addGo'); await pg.waitForTimeout(800);
sc = await calls(pg, 'notify_save');
is(sc.length === 3 && sc[2].args.p_set.scope === 'o:SEC Scrubber|s:P1|P3' && sc[2].args.p_set.pages.join() === 'report', '사이트를 골라 등록 — 범위 열쇠에 «|s:P1|P3»(봇·발송이 같은 꼴로 읽는다)');
const row3 = await pg.evaluate(() => [...document.querySelectorAll('#cSubs tbody tr[data-id]')].map(t => t.children[3].textContent).join(' / '));
is(/SEC Scrubber · P1, P3/.test(row3), '수신자 표에 «운영단위 · 사이트»로 (' + row3 + ')');
await pg.click('#cSubs tr[data-id="3"] [data-a="edit"]');
const ed3 = await pg.evaluate(() => [...document.querySelectorAll('tr[data-for="3"] [data-sites] input:checked')].map(i => i.value).join());
is(ed3 === 'P1,P3', '수정 칸을 열면 고른 사이트가 체크돼 있다');
await pg.click('#cSubs tr[data-id="1"] [data-a="test"]'); await pg.waitForTimeout(800);
is(await pg.evaluate(() => /보냈습니다/.test(document.getElementById('status').textContent)), '테스트 발송 — 엣지펑션(notify-send · op=test)을 부르고 결과를 말한다');
await ctx.close();
ctx = await mkCtx(() => { window.__ME = { email:'view@test.local', can_write:false, role:'viewer' }; });
pg = await page(ctx, '/notify/', 'notify-v');
is(await pg.evaluate(() => /관리자 전용/.test(document.getElementById('banners').innerText) && document.getElementById('cAdd').style.display === 'none'), '조회자에게는 «관리자 전용» — 등록 칸이 없다');
await ctx.close();

console.log('[7] 셸 — 북마크');
ctx = await mkCtx(ADMIN);
pg = await page(ctx, '/', 'shell');
await pg.evaluate(() => switchTab('scrubber')); await pg.waitForTimeout(4000);
const fr = () => pg.frames().find(f => /\/scrubber\//.test(f.url()));
await fr().evaluate(() => { GST.filters.set('op', 'GST TAIWAN SCRUBBER'); }); await pg.waitForTimeout(400);
await pg.evaluate(() => bmAdd()); await pg.waitForTimeout(1500);
const bs = await calls(pg, 'bm_save');
is(bs.length === 1 && bs[0].args.p_tab === 'scrubber' && bs[0].args.p_name === '우리 북마크' && JSON.stringify(bs[0].args.p_state || {}).indexOf('GST TAIWAN SCRUBBER') >= 0, '북마크 추가 — 지금 탭 · 상세 필터를 bm_save 로');
await fr().evaluate(() => { GST.filters.set('op', ''); }); await pg.waitForTimeout(300);
await pg.evaluate(() => switchTab('hub')); await pg.waitForTimeout(500);
await pg.click('#moreBtn'); await pg.waitForTimeout(800);
const bl = await pg.evaluate(() => [...document.querySelectorAll('#mBms [data-bm]')].map(b => b.textContent));
is(bl.length === 1 && /우리 북마크/.test(bl[0]), '더보기에 저장한 북마크가 선다');
await pg.click('#mBms [data-bm="0"]'); await pg.waitForTimeout(2500);
const back = await fr().evaluate(() => { const v = GST.filters.F.op; return v instanceof Set ? Array.from(v).join() : String(v || ''); });
is(await pg.evaluate(() => activeTab) === 'scrubber' && back === 'GST TAIWAN SCRUBBER', '북마크를 누르면 그 탭으로 가서 필터를 되돌려 건다 (' + back + ')');
await ctx.close();

is(errs.length === 0, 'JS 에러 0' + (errs.length ? ' → ' + errs.slice(0, 4).join(' | ') : ''));
await browser.close(); srv.close();
console.log(`\n${fail ? '❌' : '✅'} t-v207: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
