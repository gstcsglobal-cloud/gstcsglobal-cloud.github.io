/* t-screen — 화면 편집 (v202 · 사용자 요청 「다른 페이지들도 전부 커스터마이징」). 픽스처는 t-hub · t-studio 와 같다(지어낸 자료만 · t-leak).
   지키는 것:
   ① 기존 화면(설비 현황)의 카드 배치 — 편집기를 열면 카드마다 단추가 서고, 숨기기 · 끌어서 순서 · 전체 폭 · 제목이 «DOM» 에 걸린다.
      저장하면 screen_layout_save 에 «배치만»(order·hidden·wide·titles) 간다 · 다시 열면 그 배치로 선다 · 취소하면 시작할 때로 돌아간다.
      KPI 를 숨기면 칸 수(data-n)가 따라간다 · 조회자는 «전체 기본 배치» 저장이 잠긴다 · 편집 중에는 카드 클릭(세부내역)이 안 열린다.
   ② 새 화면(맞춤 분석 보드) — 표준 지표가 글로벌 현황과 같은 숫자를 낸다(가동률 96% · 금주 고장 15) · 격자에서 옮기고 크기를 바꾸면
      자리(lay)가 저장된다 · 게시는 board_publish 로 · 보기 모드(?view=)는 편집 단추 없이 그 보드만 보인다.
   ③ 셸 — 게시한 보드가 탭(또는 더보기)으로 서고, 공개 범위가 등급을 따른다 · 「화면 편집」이 지금 화면에 편집기를 연다.
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-screen.mjs */
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

/* ============ ① 기존 화면 — 설비 현황 ============ */
console.log('[1] 기존 화면 편집 — 설비 현황');
let ctx = await mkCtx(() => { window.__ME = { email:'boss@test.local', can_write:true, role:'admin' }; });
let pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('scrubber: ' + e.message));
await pg.emulateMedia({ reducedMotion:'reduce' });
await pg.goto(BASE + '/scrubber/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3500);
const st0 = await pg.evaluate(() => ({ en: GST.screen.enabled(), page: GST.screen.pageKey(), n: GST.screen.cards().length }));
is(st0.en && st0.page === 'scrubber' && st0.n >= 8, '설비 현황은 편집 대상 · 카드 ' + st0.n + '장에 열쇠가 붙는다');
/* 편집기를 연다 — 셸이 보내는 것과 같은 메시지 */
await pg.evaluate(() => window.postMessage({ type:'gst-screen-edit' }, '*')); await pg.waitForTimeout(400);
const ed = await pg.evaluate(() => ({ panel: !!document.getElementById('gstSePanel'), bars: document.querySelectorAll('.gst-se-bar').length, on: document.body.classList.contains('gst-se-on') }));
is(ed.panel && ed.on && ed.bars === st0.n, '편집기를 열면 위에 막대 · 카드마다 단추 (' + ed.bars + ')');
/* 같은 부모에 둘 이상 서 있는 차트 카드 둘 — 그 둘로 옮기기·숨기기를 본다 */
const pair = await pg.evaluate(() => { const L = GST.screen.cards().filter(c => !c.classList.contains('kpi') && c.offsetWidth > 0);
  for (const a of L){ const sib = L.filter(b => b !== a && b.parentNode === a.parentNode && b.offsetWidth > 0); if (sib.length) return [GST.screen.keyOf(a), GST.screen.keyOf(sib[0])]; } return null; });
is(!!pair, '같은 격자에 카드 둘 (' + (pair || []).join(' · ') + ')');
const order = () => pg.evaluate(() => GST.screen.cards().map(c => GST.screen.keyOf(c)));
const o0 = await order();
/* 끌어서 첫째를 둘째 뒤로 */
const box = async k => pg.evaluate(k => { const c = GST.screen.cards().find(x => GST.screen.keyOf(x) === k); const r = c.getBoundingClientRect(); const g = c.querySelector('.gse-grip').getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height, gx:g.x + g.width / 2, gy:g.y + g.height / 2 }; }, k);
const A = await box(pair[0]), B = await box(pair[1]);
await pg.mouse.move(A.gx, A.gy); await pg.mouse.down();
await pg.mouse.move(B.x + B.w * 0.8, B.y + B.h * 0.5, { steps:8 }); await pg.mouse.up(); await pg.waitForTimeout(300);
const o1 = await order();
is(o1.indexOf(pair[0]) > o1.indexOf(pair[1]) && o0.indexOf(pair[0]) < o0.indexOf(pair[1]), '끌어서 놓으면 DOM 순서가 바뀐다 (PPT·이미지 저장이 이 순서를 따른다)');
/* 숨기기 */
await pg.evaluate(k => { const c = GST.screen.cards().find(x => GST.screen.keyOf(x) === k); c.querySelector('.gst-se-bar [data-a="hide"]').click(); }, pair[1]);
await pg.waitForTimeout(200);
const hid = await pg.evaluate(k => { const c = GST.screen.cards().find(x => GST.screen.keyOf(x) === k); return { attr: c.hasAttribute('data-gst-hide'), disp: getComputedStyle(c).display }; }, pair[1]);
is(hid.attr && hid.disp === 'none', '숨기기 → 카드가 사라진다(지우지 않고 data-gst-hide)');
const hidBtn = await pg.evaluate(() => document.querySelector('#gstSePanel [data-p="hid"]').textContent);
is(/1/.test(hidBtn), '막대의 「숨긴 카드」가 1을 센다 (' + hidBtn.trim() + ')');
/* 전체 폭 · 제목 */
const hasWide = await pg.evaluate(k => { const c = GST.screen.cards().find(x => GST.screen.keyOf(x) === k); const b = c.querySelector('[data-a="wide"]'); if (b) b.click(); return !!b; }, pair[0]);
await pg.waitForTimeout(150);
if (hasWide) is(await pg.evaluate(k => GST.screen.cards().find(x => GST.screen.keyOf(x) === k).hasAttribute('data-gst-wide'), pair[0]), '전체 폭 → data-gst-wide');
await pg.evaluate(k => { const c = GST.screen.cards().find(x => GST.screen.keyOf(x) === k); c.querySelector('[data-a="rename"]').click(); }, pair[0]);
await pg.waitForTimeout(150);
await pg.fill('.gse-pop input', '라인별 유상 전환 현황'); await pg.click('.gse-pop [data-x="ok"]'); await pg.waitForTimeout(150);
const ttl = await pg.evaluate(k => { const c = GST.screen.cards().find(x => GST.screen.keyOf(x) === k); const h = c.querySelector('.trend-header h3, .cross-header h3, h3, h2'); return h ? h.textContent : ''; }, pair[0]);
is(/라인별 유상 전환 현황/.test(ttl), '제목 바꾸기 → 카드 제목에 걸린다 (' + ttl.trim().slice(0, 30) + ')');
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/edit-scrubber.png' });
/* 편집 중 카드 클릭은 막는다 — 세부내역 팝업이 안 열린다 */
const kd = await pg.evaluate(() => { const k = document.querySelector('.kpi[data-kdrill]'); if (!k) return false; (k.querySelector('.val') || k).click(); return true; });
await pg.waitForTimeout(300);
is(kd && await pg.evaluate(() => !document.querySelector('.gov')), '편집 중에는 KPI 카드를 눌러도 세부내역 팝업이 안 열린다');
/* 저장 — 전체 사용자 기본 배치 */
await pg.click('#gstSePanel [data-p="save"]'); await pg.waitForTimeout(150);
const allDis = await pg.evaluate(() => document.querySelector('#gstSePanel [data-s="all"]').disabled);
is(!allDis, '관리자에게는 「전체 사용자 기본 배치로 저장」이 열려 있다');
await pg.click('#gstSePanel [data-s="all"]'); await pg.waitForTimeout(500);
let C1 = (await calls(pg)).filter(c => c.rpc === 'screen_layout_save');
const sv = C1[C1.length - 1];
is(sv && sv.args.p_page === 'scrubber' && sv.args.p_scope === 'all' && sv.args.p_at === null, 'screen_layout_save(scrubber, all, p_at=null) — 처음 저장');
const cfg = sv && sv.args.p_config;
is(cfg && cfg.hidden.indexOf(pair[1]) >= 0 && cfg.order.indexOf(pair[0]) > cfg.order.indexOf(pair[1]) && cfg.titles[pair[0]] === '라인별 유상 전환 현황', '저장된 설정 = 배치뿐(순서 · 숨김 · 제목)');
is(cfg && !JSON.stringify(cfg).match(/\d{3,},\d{3,}/) && Object.keys(cfg).every(k => ['v','order','hidden','wide','show','titles','charts','adds'].indexOf(k) >= 0), '설정에 자료 값이 섞이지 않는다');
is(await pg.evaluate(() => !document.getElementById('gstSePanel') && !document.querySelector('.gst-se-bar') && !document.body.classList.contains('gst-se-on')), '저장하면 편집기가 닫힌다');
await pg.evaluate(() => { const k = document.querySelector('.kpi[data-kdrill]'); if (k) (k.querySelector('.val') || k).click(); }); await pg.waitForTimeout(300);
is(await pg.evaluate(() => !!document.querySelector('.gov')), '편집을 마치면 KPI 카드 팝업이 다시 열린다');
await pg.evaluate(() => GST._ovClose && GST._ovClose());
/* 다시 열면 그 배치로 */
await pg.reload({ waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3500);
const re = await pg.evaluate(p => { const f = k => GST.screen.cards().find(x => GST.screen.keyOf(x) === k);
  const a = f(p[0]), b = f(p[1]); const ks = GST.screen.cards().map(c => GST.screen.keyOf(c));
  const h = a.querySelector('.trend-header h3, .cross-header h3, h3, h2');
  return { hid: b.hasAttribute('data-gst-hide'), ord: ks.indexOf(p[0]) > ks.indexOf(p[1]), ttl: h ? h.textContent : '', src: GST.screen.state().src }; }, pair);
is(re.hid && re.ord && /라인별 유상 전환 현황/.test(re.ttl) && re.src === 'all', '다시 열면 전체 기본 배치로 선다 (숨김 · 순서 · 제목)');
/* 취소 — 시작할 때로 */
await pg.evaluate(() => window.postMessage({ type:'gst-screen-edit' }, '*')); await pg.waitForTimeout(300);
await pg.evaluate(k => { const c = GST.screen.cards().find(x => GST.screen.keyOf(x) === k); c.querySelector('[data-a="hide"]').click(); }, pair[0]);
await pg.waitForTimeout(150);
await pg.click('#gstSePanel [data-p="cancel"]'); await pg.waitForTimeout(300);
is(await pg.evaluate(k => !GST.screen.cards().find(x => GST.screen.keyOf(x) === k).hasAttribute('data-gst-hide'), pair[0]), '취소하면 편집 중에 숨긴 카드가 돌아온다');
/* 숨긴 카드 다시 표시 · KPI 칸 수 */
await pg.evaluate(() => window.postMessage({ type:'gst-screen-edit' }, '*')); await pg.waitForTimeout(300);
await pg.click('#gstSePanel [data-p="hid"]'); await pg.waitForTimeout(150);
await pg.click('#gstSePanel .gse-menu [data-show="0"]'); await pg.waitForTimeout(200);
is(await pg.evaluate(k => !GST.screen.cards().find(x => GST.screen.keyOf(x) === k).hasAttribute('data-gst-hide'), pair[1]), '「숨긴 카드 ▾ → 다시 표시」로 돌아온다');
const kp = await pg.evaluate(() => { const k = GST.screen.cards().find(c => c.classList.contains('kpi') && c.parentNode.classList.contains('kpis'));
  if (!k) return null; const p = k.parentNode, n0 = p.getAttribute('data-n'); k.querySelector('[data-a="hide"]').click();
  const all = [].filter.call(p.children, c => c.classList.contains('kpi')).length; return { n0, n1: p.getAttribute('data-n'), all }; });
is(kp && +kp.n1 === kp.all - 1, 'KPI 를 숨기면 칸 수가 보이는 장수를 따른다 (' + (kp && (kp.all + '장 → data-n ' + kp.n1)) + ')');
await pg.click('#gstSePanel [data-p="save"]'); await pg.waitForTimeout(150);
await pg.click('#gstSePanel [data-s="me"]'); await pg.waitForTimeout(400);
C1 = (await calls(pg)).filter(c => c.rpc === 'screen_layout_save');
is(C1[C1.length - 1].args.p_scope === 'me', '「내 화면에만 저장」 → scope me');
is(await pg.evaluate(() => GST.screen.state().src === 'me'), '내 배치가 전체 기본보다 앞선다');
await ctx.close();

/* 조회자 — 전체 기본 배치 저장은 잠긴다 */
ctx = await mkCtx(() => { window.__ME = { email:'view@test.local', can_write:false, role:'viewer' }; });
pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('scrubber-viewer: ' + e.message));
await pg.goto(BASE + '/scrubber/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3000);
await pg.evaluate(() => window.postMessage({ type:'gst-screen-edit' }, '*')); await pg.waitForTimeout(300);
await pg.click('#gstSePanel [data-p="save"]'); await pg.waitForTimeout(150);
const vd = await pg.evaluate(() => ({ all: document.querySelector('#gstSePanel [data-s="all"]').disabled, me: document.querySelector('#gstSePanel [data-s="me"]').disabled }));
is(vd.all && !vd.me, '조회자: 전체 기본 배치는 잠기고 «내 화면에만»은 열려 있다');
await ctx.close();

/* ============ ② 새 화면 — 맞춤 분석 보드 ============ */
console.log('[2] 새 화면 — 격자 · 표준 지표 · 게시');
ctx = await mkCtx(() => { window.__ME = { email:'boss@test.local', can_write:true, role:'admin' }; });
pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('studio: ' + e.message));
const msgs = []; await pg.exposeFunction('__msg', m => msgs.push(m));
await pg.addInitScript(() => { const pm = window.parent.postMessage.bind(window.parent); window.addEventListener('message', e => { try{ window.__msg(e.data); }catch(err){} }); });
await pg.emulateMedia({ reducedMotion:'reduce' });
await pg.goto(BASE + '/studio/?new=1', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3000);   /* v203 — /studio/ 는 목록이라 편집기는 ?new=1 */
await pg.click('#addStd'); await pg.waitForTimeout(150);
await pg.click('.sd-menu [data-add="kpi:run_rate"]'); await pg.waitForTimeout(1500);
const kv = await pg.evaluate(() => { const b = document.querySelector('#board .k-kpi .ds-kpi-v b'); return b ? b.textContent : ''; });
is(/^96(\.0)?$/.test(kv.trim()), '표준 지표 «가동률» = 글로벌 현황과 같은 식 (가동 48 / 반입 50 = 96%) → ' + kv);
await pg.click('#addStd'); await pg.waitForTimeout(150);
await pg.click('.sd-menu [data-add="trend"]'); await pg.waitForTimeout(1500);
const tr = await pg.evaluate(() => { const cv = document.querySelector('#board .k-trend canvas'); const c = cv && Chart.getChart(cv); return c ? c.data.datasets[0].data.slice(-1)[0] : null; });
is(tr === 15, '표준 지표 «고장·PM 추이» 금주 고장 = 15 (대만 12 + 우한 1 + 국내 2 · 수선실적 BM · PM 판정 뺌) → ' + tr);
await pg.click('#addStd'); await pg.waitForTimeout(150);
await pg.click('.sd-menu [data-add="risk"]'); await pg.waitForTimeout(1200);
is(await pg.evaluate(() => document.querySelectorAll('#board .k-risk tbody tr').length) > 0, '표준 지표 «고장 위험 설비 순위»가 GST.ops.risk 로 선다');
await pg.click('#addLay'); await pg.waitForTimeout(100); await pg.click('.sd-menu [data-add="title"]'); await pg.waitForTimeout(300);
/* 범위 설정 — 국내 */
await pg.evaluate(() => document.querySelector('#board .k-kpi [data-set]').click()); await pg.waitForTimeout(800);
await pg.selectOption('.sd-pop select[data-k="scope"]', 'r:KR'); await pg.waitForTimeout(1200);
const kv2 = await pg.evaluate(() => document.querySelector('#board .k-kpi .ds-kpi-v b').textContent);
is(/^100(\.0)?$/.test(kv2.trim()), '범위를 «국내»로 → 가동 10 / 반입 10(반납 제외) = 100% → ' + kv2);
/* 격자 — 끌어서 옮기고 크기 바꾸기 */
const lay0 = await pg.evaluate(() => { const g = document.querySelector('#board .k-trend'); return g.style.gridColumn + '|' + g.style.gridRow; });
const gr = await pg.evaluate(() => { const g = document.querySelector('#board .k-trend .sd-grip').getBoundingClientRect(); const B = document.getElementById('board').getBoundingClientRect(); return { x:g.x + g.width / 2, y:g.y + g.height / 2, cw:(B.width - 154) / 12 }; });
await pg.mouse.move(gr.x, gr.y); await pg.mouse.down(); await pg.mouse.move(gr.x + (gr.cw + 14) * 3, gr.y + 70 * 2, { steps:10 }); await pg.mouse.up(); await pg.waitForTimeout(300);
const lay1 = await pg.evaluate(() => { const g = document.querySelector('#board .k-trend'); return g.style.gridColumn + '|' + g.style.gridRow; });
is(lay1 !== lay0, '끌어 옮기면 격자 자리가 바뀐다 (' + lay0 + ' → ' + lay1 + ')');
const rs = await pg.evaluate(() => { const g = document.querySelector('#board .k-risk .sd-rs').getBoundingClientRect(); return { x:g.x + 6, y:g.y + 6 }; });
await pg.mouse.move(rs.x, rs.y); await pg.mouse.down(); await pg.mouse.move(rs.x + 200, rs.y + 140, { steps:8 }); await pg.mouse.up(); await pg.waitForTimeout(300);
const ov = await pg.evaluate(() => { const L = [...document.querySelectorAll('#board .sd-gw')].map(e => e.getBoundingClientRect());
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++){ const a = L[i], b = L[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) return true; } return false; });
is(!ov, '옮기고 키워도 부품끼리 겹치지 않는다(밀려 내려간다)');
is(await pg.evaluate(() => /저장하지 않은 변경/.test(document.getElementById('boardMeta').textContent)), '바꾸면 «저장하지 않은 변경»이라고 적는다');
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/studio-grid.png', fullPage:true });
/* 저장 */
await pg.fill('#boardName', '국내 일일 운영 현황'); await pg.click('#saveBtn'); await pg.waitForTimeout(800);
const ls = (await calls(pg)).filter(c => c.rpc === 'layout_save').pop();
const wg = ls && ls.args.p_config.widgets;
is(ls && ls.args.p_config.v === 2 && wg.length === 4 && wg.every(x => x.lay && x.lay.w > 0 && x.lay.h > 0), 'layout_save — v2 · 위젯 넷 · 저마다 자리(lay)');
is(wg && wg.some(x => x.kind === 'std' && x.std === 'kpi' && x.scope === 'r:KR' && x.metric === 'run_rate') && !JSON.stringify(wg).match(/"(96|100)"/), '표준 지표는 «설정»(지표·범위)만 담는다 — 값은 안 담는다');
/* 게시 */
is(await pg.evaluate(() => !document.getElementById('pubBtn').hidden), '관리자에게는 「탭으로 게시」');
await pg.click('#pubBtn'); await pg.waitForTimeout(200);
await pg.fill('#pubName', '국내 일일 현황'); await pg.check('input[name=pubVis][value="staff"]'); await pg.check('input[name=pubPlace][value="tab"]');
await pg.click('#pubOk'); await pg.waitForTimeout(800);
const bp = (await calls(pg)).filter(c => c.rpc === 'board_publish').pop();
is(bp && bp.args.p_pub && bp.args.p_pub.tab === '국내 일일 현황' && bp.args.p_pub.vis === 'staff' && bp.args.p_pub.place === 'tab', 'board_publish(탭 이름 · 공개 범위 · 표시 위치)');
is(msgs.some(m => m && m.type === 'gst-screens'), '게시하면 셸에 «탭 목록을 다시 읽으라»고 알린다');
is(await pg.evaluate(() => !document.getElementById('pubBadge').hidden && /국내 일일 현황/.test(document.getElementById('pubBadge').textContent)), '게시됨 표시');
const bid = await pg.evaluate(() => S.board.id);
/* 보기 모드 */
await pg.goto(BASE + '/studio/?view=' + bid, { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3000);
const vw = await pg.evaluate(() => ({ cls: document.body.classList.contains('sd-view'), form: getComputedStyle(document.getElementById('form')).display, grip: document.querySelectorAll('#board .sd-grip').length,
  ws: document.querySelectorAll('#board .sd-gw').length, h1: document.getElementById('vTitle').textContent, edit: !document.getElementById('vEdit').hidden }));
is(vw.cls && vw.form === 'none' && vw.grip === 0 && vw.ws === 4 && vw.h1 === '국내 일일 현황', '보기 모드 — 편집 칸 없이 그 보드만 · 제목은 탭 이름 (' + vw.h1 + ')');
is(vw.edit, '만든 사람·관리자에게는 「화면 편집」');
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/studio-view.png' });
await ctx.close();

/* ============ ③ 셸 — 게시한 화면이 탭으로 ============ */
console.log('[3] 셸 — 게시한 화면 탭 · 공개 범위 · 화면 편집');
const SEED = { rows: [
  { id:1, owner:'boss@test.local', name:'보드 A', config:{ v:2, widgets:[] }, shared:true, removed:false, pub:{ tab:'국내 일일 현황', vis:'all', place:'tab' } },
  { id:2, owner:'boss@test.local', name:'보드 B', config:{ v:2, widgets:[] }, shared:true, removed:false, pub:{ tab:'경영 검토', vis:'admin', place:'more' } },
  { id:3, owner:'boss@test.local', name:'보드 C', config:{ v:2, widgets:[] }, shared:true, removed:false, pub:null } ], seq:3 };
const shell = async me => { const c = await mkCtx(new Function('window.__ME=' + JSON.stringify(me) + ';window.__SEED=' + JSON.stringify(SEED) + ';'));
  const p = await c.newPage(); p.on('pageerror', e => errs.push('shell: ' + e.message)); await p.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await p.waitForTimeout(3000); return { c, p }; };
let S1 = await shell({ email:'boss@test.local', can_write:true, role:'admin' });
const sh = await S1.p.evaluate(() => ({ bar: [...document.querySelectorAll('#tabbar .tab')].map(b => b.dataset.id + ':' + b.textContent.trim()), more: [...document.querySelectorAll('#mScreens [data-go]')].map(b => b.textContent.trim()) }));
is(sh.bar.some(x => x === 'scr1:국내 일일 현황') && !sh.bar.some(x => /^scr3/.test(x)), '게시한 보드가 탭 메뉴에 선다 · 게시 안 한 보드는 안 선다 (' + sh.bar.filter(x => /^scr\d/.test(x)).join(', ') + ')');
is(sh.more.indexOf('경영 검토') >= 0, '«더보기 메뉴»로 게시한 화면은 더보기에 선다');
await S1.p.click('#tabbar .tab[data-id="scr1"]'); await S1.p.waitForTimeout(1500);
const fr = await S1.p.evaluate(() => { const f = document.querySelector('#frameWrap iframe[data-id="scr1"]'); return f ? f.src : ''; });
is(/\/studio\/\?view=1/.test(fr), '탭을 누르면 그 보드를 보기 모드로 연다 (' + fr.replace(/^https?:\/\/[^/]+/, '') + ')');
await S1.p.click('#moreBtn'); await S1.p.waitForTimeout(150);
is(await S1.p.evaluate(() => !document.getElementById('mScreenEdit').disabled), '게시한 화면에서도 「화면 편집」이 열려 있다');
await S1.p.keyboard.press('Escape');
await S1.p.click('#tabbar .tab[data-id="hub"]'); await S1.p.waitForTimeout(300);
await S1.p.click('#moreBtn'); await S1.p.waitForTimeout(150);
is(await S1.p.evaluate(() => !document.getElementById('mScreenEdit').disabled), '글로벌 현황에서도 「화면 편집」');
await S1.p.keyboard.press('Escape');
await S1.c.close();
S1 = await shell({ email:'view@test.local', can_write:false, role:'viewer' });
const sv2 = await S1.p.evaluate(() => ({ bar: [...document.querySelectorAll('#tabbar .tab')].map(b => b.dataset.id), more: [...document.querySelectorAll('#mScreens [data-go]')].map(b => b.textContent.trim()) }));
is(sv2.bar.indexOf('scr1') >= 0 && sv2.more.indexOf('경영 검토') < 0, '조회자: «전체 사용자» 화면은 보이고 «관리자» 화면은 안 선다');
await S1.p.evaluate(() => switchTab('studio')); await S1.p.waitForTimeout(300);
await S1.p.click('#moreBtn'); await S1.p.waitForTimeout(150);
is(await S1.p.evaluate(() => document.getElementById('mScreenEdit').disabled), '맞춤 분석 화면에서는 「화면 편집」이 잠긴다(그 화면은 스스로 편집기다)');
await S1.c.close();

is(errs.length === 0, 'JS 에러 0' + (errs.length ? ' → ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.close();
console.log(`\n${fail ? '❌' : '✅'} t-screen: ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
