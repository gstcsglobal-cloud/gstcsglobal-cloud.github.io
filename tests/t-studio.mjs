/* t-studio — 분석 작업대(/studio/) (v168). 픽스처는 t-hub 과 같다. (아래는 t-hub 머리 주석)
   t-hub — 통합 관제(/hub/) 첫 화면 (v165). 지어낸 자료만(t-leak).
   지키는 것: ① 숫자는 core 정본(GST.EQ · 수선실적 BM · GST.PM)으로 센다 — 카드·신호등·히트맵·팝업이 같은 모집단
   ② 평소보다 튄 운영단위가 «위험»으로 맨 위에 선다 ③ 구분(국내/해외) 전환이 모든 칸에 걸린다
   ④ 지도가 외부 자료 없이 그려진다 ⑤ 셸의 첫 탭이다 ⑥ 테마 전환·언어 전환에서 죽지 않는다.
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-hub.mjs */
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
/* 가짜 user_layouts — layout_save / layout_remove 를 «기록»하고 흉내낸다(진짜 규칙은 운영 DB 에서 되돌려지는 블록으로 봤다) */
const FAKE = String.raw`
window.__LY = window.__LY || (function(){ try{ return JSON.parse(localStorage.getItem('__LY')||'null'); }catch(e){ return null; } })() || { rows: [], calls: [], noTable: false, seq: 0 };
(function(){ const L = window.__LY, me = 'boss@test.local';
  window.__FDB = { from: function(tbl){ const o = { select(){ return o; }, order(){ return o; }, limit(){ return o; },
      then(res, rej){ if (L.noTable) return Promise.resolve({ data:null, error:{ message:'relation "public.user_layouts" does not exist' } }).then(res, rej);
        return Promise.resolve({ data: L.rows.filter(r => !r.removed && (r.shared || r.owner === me)).map(r => Object.assign({}, r)), error:null }).then(res, rej); } }; return o; },
    rpc: async function(n, a){ L.calls.push({ rpc:n, args: JSON.parse(JSON.stringify(a)) }); setTimeout(() => { try{ localStorage.setItem('__LY', JSON.stringify(L)); }catch(e){} }, 0);
      if (n === 'layout_save') { if (a.p_id == null) { const id = ++L.seq; L.rows.push({ id, owner:me, name:a.p_name, config:a.p_config, shared:a.p_shared, removed:false, updated_at:new Date().toISOString() }); return { data:{ id, created:true }, error:null }; }
        const r = L.rows.find(x => x.id === a.p_id && x.owner === me); if (!r) return { data:null, error:{ message:'not_yours' } }; Object.assign(r, { name:a.p_name, config:a.p_config, shared:a.p_shared }); return { data:{ id:r.id, created:false }, error:null }; }
      if (n === 'layout_remove') { const r = L.rows.find(x => x.id === a.p_id && x.owner === me); if (!r) return { data:null, error:{ message:'not_yours' } }; r.removed = true; return { data:{ ok:true }, error:null }; }
      return { data:null, error:{ message:'?' } }; } };
})();`;
const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
  + 'GST.getSession=async function(){return {user:{email:"boss@test.local"}};};GST.token=async function(){return "t";};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();if(GST._authOk)GST._authOk();return true;};'
  + 'GST.loadMe=async function(){ if(!GST._me) GST._meApply({email:"boss@test.local",can_write:true,role:"admin"}); return GST._me; };'
  + FAKE + ';GST.db=async function(){return window.__FDB;};';
const browser = await chromium.launch(PW);
async function mkCtx(noTable) {
  const ctx = await browser.newContext({ viewport:{ width:1500, height:1100 }, locale:'ko-KR' });
  if (noTable) await ctx.addInitScript(() => { window.__LY = { rows: [], calls: [], noTable: true, seq: 0 }; });
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => { let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
    r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) }); });
  await ctx.route('**/assets/core.js*', r => r.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB }));
  await ctx.route('**/cdn.jsdelivr.net/**', r => { const u = r.request().url();
    if (u.includes('chart.umd')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM + 'chart.js/dist/chart.umd.js', 'utf8') });
    if (u.includes('papaparse')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM + 'papaparse/papaparse.min.js', 'utf8') });
    return r.fulfill({ status:200, contentType: u.endsWith('.css') ? 'text/css' : 'application/javascript', body:'' }); });
  await ctx.route('**/spreadsheets/**', r => { const gid = (r.request().url().match(/gid=(\d+)/) || [])[1]; r.fulfill({ status:200, contentType:'text/csv', body: SHEETS[gid] || '' }); });
  return ctx;
}
const ctx = await mkCtx(false);
const pg = await ctx.newPage(); const pe = []; pg.on('pageerror', e => pe.push(e.message));
await pg.emulateMedia({ reducedMotion:'reduce' });
await pg.goto(BASE + '/studio/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3000);
const chart = () => pg.evaluate(() => { const c = Chart.getChart(document.querySelector('#pv canvas')); return c ? { labels:c.data.labels, ds:c.data.datasets.map(d => ({ l:d.label, d:d.data })) } : null; });
const set = async (id, v) => { await pg.selectOption('#' + id, v); await pg.waitForTimeout(250); };

console.log('[1] 건수 — 운영단위별');
await set('fX', 'op'); let C = await chart();
const by = C && Object.fromEntries(C.labels.map((l, i) => [l, C.ds[0].d[i]]));
is(by && by['GST TAIWAN SCRUBBER'] === 28 && by['GST CHINA(WUHAN) SCRUBBER'] === 12 && by['SEC Scrubber'] === 2, '대만 28(BM 23 + TBM 5) · 우한 12 · 국내 2 — 판정 없이 «행 수» (' + JSON.stringify(by) + ')');
console.log('[2] 계열 · 거르기');
await set('fSeries', 'stage'); C = await chart();
is(C.ds.length === 2 && C.ds.some(d => d.l === 'BM') && C.ds.some(d => d.l === 'TBM'), '작업단계로 계열을 나눈다 (BM · TBM)');
await set('fSeries', ''); await set('fX', 'stage');
await pg.click('#addF'); await pg.waitForTimeout(150);
await pg.selectOption('[data-ff="0"]', 'op'); await pg.waitForTimeout(150);
await pg.fill('[data-fv="0"]', 'GST TAIWAN SCRUBBER'); await pg.waitForTimeout(400); C = await chart();
const st = Object.fromEntries(C.labels.map((l, i) => [l, C.ds[0].d[i]]));
is(st.BM === 23 && st.TBM === 5 && Object.keys(st).length === 2, '운영단위 = 대만 → BM 23 · TBM 5');
const meta = await pg.evaluate(() => document.getElementById('pvMeta').textContent);
is(/42행 중 28행/.test(meta), '«전체 N행 중 M행»을 적는다 (' + meta + ')');
console.log('[3] 막대를 누르면 그 행들');
const box = await pg.evaluate(() => { const c = Chart.getChart(document.querySelector('#pv canvas')); const i = c.data.labels.indexOf('BM'); const el = c.getDatasetMeta(0).data[i]; const r = c.canvas.getBoundingClientRect(); return { x: r.left + el.x, y: r.top + (el.y + el.base) / 2 }; });
await pg.mouse.click(box.x, box.y); await pg.waitForTimeout(400);
is(await pg.evaluate(() => document.querySelectorAll('.gov-body tbody tr').length) === 23, 'BM 막대 → 23행');
await pg.evaluate(() => GST._ovClose && GST._ovClose());
console.log('[4] 날짜 묶기 · 합계 · 표');
await pg.click('[data-fx="0"]'); await set('fX', 'dStart'); await set('fBucket', 'week'); C = await chart();
is(C.labels.length >= 12 && C.labels.every((l, i) => !i || C.labels[i - 1] < l), '작업시작일을 주로 묶으면 시간순');
await set('fX', 'op'); await set('fAgg', 'sum'); await set('fVal', 'manMin'); C = await chart();
const sm = Object.fromEntries(C.labels.map((l, i) => [l, C.ds[0].d[i]]));
is(sm['GST TAIWAN SCRUBBER'] === 28 * 60, '작업공수 합계 = 28행 × 60 (' + sm['GST TAIWAN SCRUBBER'] + ')');
await pg.click('#fType button[data-t="table"]'); await pg.waitForTimeout(300);
is(await pg.evaluate(() => document.querySelectorAll('#pv .sd-tbl tbody tr').length) === 3, '표 모양 — 운영단위 3줄');
if (process.env.HUB_SHOT) await pg.screenshot({ path: process.env.HUB_SHOT + '/studio.png', fullPage:true });
console.log('[5] 보드 — 담고 · 저장하고 · 다시 열기');
await pg.click('#fType button[data-t="bar"]'); await set('fAgg', 'count'); await pg.click('#addW'); await pg.waitForTimeout(300);
await set('fX', 'stage'); await pg.click('#fType button[data-t="doughnut"]'); await pg.click('#addW'); await pg.waitForTimeout(500);
is(await pg.evaluate(() => document.querySelectorAll('#board .sd-w canvas').length) === 2, '보드에 차트 둘');
await pg.fill('#boardName', '주간 점검 보드'); await pg.click('#saveBtn'); await pg.waitForTimeout(600);
let L = await pg.evaluate(() => window.__LY);
const sv = L.calls.find(c => c.rpc === 'layout_save');
is(sv && sv.args.p_id === null && sv.args.p_name === '주간 점검 보드' && sv.args.p_config.widgets.length === 2 && !JSON.stringify(sv.args.p_config).includes('TWC1'), 'layout_save — 설정만 담는다(자료 값이 안 섞인다)');
await pg.reload({ waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3500);
const opts = await pg.evaluate(() => Array.from(document.querySelectorAll('#boardSel option')).map(o => o.textContent));
is(opts.some(o => /주간 점검 보드/.test(o)), '다시 열면 저장한 보드가 목록에 있다');
const bid = await pg.evaluate(() => Array.from(document.querySelectorAll('#boardSel option')).find(o => /주간 점검/.test(o.textContent)).value);
await pg.selectOption('#boardSel', bid); await pg.waitForTimeout(1500);
if (process.env.HUB_SHOT) await pg.screenshot({ path: process.env.HUB_SHOT + '/studio-board.png', fullPage:true });
is(await pg.evaluate(() => document.querySelectorAll('#board .sd-w canvas').length) === 2, '보드를 고르면 차트 둘이 지금 자료로 다시 선다');
await pg.click('#rmBtn'); await pg.waitForTimeout(600);
L = await pg.evaluate(() => window.__LY);
is(L.calls.some(c => c.rpc === 'layout_remove') && L.rows[0].removed, '「보드 감추기」 → layout_remove (지우지 않고 감춘다)');
await pg.evaluate(() => window.setLang('en')); await pg.waitForTimeout(400);
is(await pg.evaluate(() => /Custom analysis/.test(document.querySelector('[data-i="title"]').textContent)), '영어로 바뀐다');
is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
await ctx.close();
console.log('[6] 서버 준비 전 — 이 PC 에만 저장하고 그렇다고 말한다');
const c2 = await mkCtx(true); const p2 = await c2.newPage(); await p2.goto(BASE + '/studio/', { waitUntil:'domcontentloaded' }); await p2.waitForTimeout(3000);
await p2.selectOption('#fX', 'op'); await p2.click('#addW'); await p2.fill('#boardName', 'PC 보드'); await p2.click('#saveBtn'); await p2.waitForTimeout(500);
const loc = await p2.evaluate(() => ({ w: document.getElementById('warn').innerText, ls: localStorage.getItem('gst_studio_boards') || '' }));
is(/setup-25/.test(loc.w) && /PC 보드/.test(loc.ls), '표가 없으면 «setup-25 를 Run» 이라고 말하고 localStorage 에 담는다');
await c2.close();
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-studio: ${pass} 통과 · ${fail} 실패` : `\n✅ t-studio: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
