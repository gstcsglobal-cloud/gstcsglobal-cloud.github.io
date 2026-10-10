/* t-design — 디자인 2.0 (v171). 지어낸 자료만(t-leak).
   지키는 것: ① 효과는 «보이는 방식»만 바꾼다 — 카드에 transform 이 남지 않고, 숫자 글자는 그대로다
   ② 움직임은 주간현황과 움직임 줄이기에 걸리지 않는다 ③ 부팅 화면은 «실제로 읽는 표»를 보이고, 표 이름·행 수는 관리자에게만(A-4)
   ④ 부팅 화면은 세션 첫 화면 한 번 · 누르거나 키를 치면 걷힌다 · 덮고 있어도 누르는 것을 막지 않는다
   ⑤ 명령 팔레트(Ctrl K) — 초성 찾기 · iframe 에서 눌러도 셸에 뜬다 · S/N 은 표의 S/N 메뉴와 같은 길 · 툴바에 없는 기능은 여기에도 없다
   ⑥ 글로벌 현황 상태 띠 — 신호등과 같은 판정(안정 · 관찰 중 · 점검 권장)
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-design.mjs */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const SHOT = process.env.DESIGN_SHOT || '';
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };
const q = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const csv = rows => rows.map(r => r.map(q).join(',')).join('\n') + '\n';
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const NOW = new Date();
const ASOF = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() - 1));
const dAgo = n => new Date(ASOF.getTime() - n * 86400000);

/* 자료 — t-hub 와 같은 모양(지어낸 값). 대만 30 · 우한 10 · 국내 12. 대만 이번 주 BM 이 튄다 */
const IH = ['NO','Country','Customer','Location','FAB','Line','Bay','Scrubber CODE','Scrubber S/N','Scrubber Model',
  'Burner Type','Scrubber type','Process','Detail Process(HQ)','Detail Process(Customer)','Main Tool ID','Main Tool Maker',
  'Main Tool Model','Receipt date','Setup date','Turn-on date','Warranty date','Warranty In/Out','설비상태'];
const inst = [IH]; let no = 0;
const unit = (op, cust, fab, code, state) => { no++; inst.push([no, op, cust, 'LOC', fab, 'L1', 'B1', code, code + 'S', 'GST-1000',
  'BURN', 'SINGLE', 'ETCH', 'DRY', 'DRY', 'MT' + no, 'TEL', 'TEL-A', '2023-03-01', '2023-03-10', '2023-03-20', '2030-01-01', 'IN', state]); };
for (let i = 1; i <= 30; i++) unit('GST TAIWAN SCRUBBER', 'Micron Memory Taiwan Co., Ltd.(F16)', 'F16', 'TWC' + i, i <= 28 ? 'Operation' : 'Set-up');
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
for (let i = 0; i < 2; i++) w('SEC Scrubber', 'P1', 'BM', 0, 'KRC' + (i + 1));
const SHEETS = { '891608329': csv(inst), '646668307': csv(wk) };

const MIME = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html' };
const srv = http.createServer((rq, rs) => { let u = decodeURIComponent(rq.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.statusCode = 404; rs.end('nf'); return; }
  rs.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); rs.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(0, r));
const BASE = 'http://127.0.0.1:' + srv.address().port;
const NM = ROOT + '/tests/node_modules/';
/* role — '' 이면 인증이 꺼진 legacy(관리자와 같다) · 'viewer' 면 조회자 */
const STUB = role => '\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
  + 'GST.getSession=async function(){return {user:{email:"t@t"}};};GST.token=async function(){return "t";};'
  + 'GST.csvTableRows=async function(){return [];};'
  + (role ? 'GST.isAdmin=function(){return false;};document.addEventListener("DOMContentLoaded",function(){document.body.dataset.role="' + role + '";});' : '')
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();if(GST._authOk)GST._authOk();return true;};';
const browser = await chromium.launch(PW);
async function ctxOf(opt) {
  opt = opt || {};
  const ctx = await browser.newContext({ viewport: opt.vp || { width:1440, height:900 }, locale:'ko-KR', reducedMotion: opt.reduce ? 'reduce' : 'no-preference' });
  const core = fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB(opt.role || '');
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => { let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
    r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) }); });
  await ctx.route('**/assets/core.js*', r => r.fulfill({ status:200, contentType:'application/javascript', body: core }));
  await ctx.route('**/cdn.jsdelivr.net/**', r => { const u = r.request().url();
    if (u.includes('papaparse')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM + 'papaparse/papaparse.min.js', 'utf8') });
    if (u.includes('chart.umd')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM + 'chart.js/dist/chart.umd.js', 'utf8') });
    return r.fulfill({ status:200, contentType: u.endsWith('.css') ? 'text/css' : 'application/javascript', body:'' }); });
  await ctx.route('**/spreadsheets/**', r => { const gid = (r.request().url().match(/gid=(\d+)/) || [])[1];
    r.fulfill({ status:200, contentType:'text/csv', body: SHEETS[gid] || '' }); });
  await ctx.route('**supabase**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));
  return ctx;
}
const pe = [];
const watch = pg => pg.on('pageerror', e => pe.push(e.message));

/* ───────────────────────── [1] 화면 안의 효과 ───────────────────────── */
console.log('[1] 스크롤 등장 · 조명 · 값 내려앉기 · 차트 등장 · 읽는 위치');
let ctx = await ctxOf({ vp:{ width:1440, height:620 } });
let pg = await ctx.newPage(); watch(pg);
await pg.goto(BASE + '/hub/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3800);
const rv = await pg.evaluate(() => {
  const all = [...document.querySelectorAll(GST.FX_SEL)];
  const first = all.find(el => el.getClientRects().length && el.getBoundingClientRect().top < innerHeight);
  const below = all.find(el => el.classList.contains('gst-rv') && !el.classList.contains('gst-in') && el.getClientRects().length);
  const cs = below && getComputedStyle(below);
  return { n: all.length, firstRv: first ? first.classList.contains('gst-rv') : null,
    below: !!below, op: cs && cs.opacity, tr: cs && cs.translate, tf: cs && cs.transform, id: below ? (below.className + '|' + (below.querySelector('h2') || {}).textContent) : '' };
});
is(rv.firstRv === false, '첫 화면에 보이는 카드에는 스크롤 등장을 걸지 않는다(지금의 떠오르기 그대로)');
is(rv.below && rv.op === '0' && /22px/.test(rv.tr || ''), '첫 화면 밖 카드는 감춰 두었다가 (opacity ' + rv.op + ' · translate ' + rv.tr + ')');
is(rv.tf === 'none', '감춰 둔 동안에도 transform 은 쓰지 않는다 — translate(독립 속성) 만 (' + rv.tf + ')');
const rv2 = await pg.evaluate(async () => {
  const el = [...document.querySelectorAll('.gst-rv')].find(x => !x.classList.contains('gst-in') && x.getClientRects().length);
  el.scrollIntoView({ block:'center' }); await new Promise(r => setTimeout(r, 900));
  const cs = getComputedStyle(el); return { in: el.classList.contains('gst-in'), op: cs.opacity, tr: cs.translate, tf: cs.transform };
});
is(rv2.in && rv2.op === '1' && rv2.tr === 'none' && rv2.tf === 'none', '스크롤해 들어오면 떠오르고, 끝나면 아무것도 남지 않는다 (' + JSON.stringify(rv2) + ')');
/* 읽는 위치 막대 — 스크롤 뒤 */
const sp = await pg.evaluate(async () => { scrollTo(0, 300); await new Promise(r => setTimeout(r, 120)); const b = document.querySelector('.gst-sprog'); return b ? { on: b.classList.contains('on'), tf: b.firstChild.style.transform } : null; });
is(sp && sp.on && /scaleX\(0\.\d+|scaleX\(1/.test(sp.tf), '긴 화면은 맨 위에 읽는 위치 막대 (' + JSON.stringify(sp) + ')');
/* 인쇄 — 감춘 카드가 전부 보인다 */
await pg.evaluate(() => scrollTo(0, 0));
await pg.emulateMedia({ media:'print' });
const pr = await pg.evaluate(() => [...document.querySelectorAll('.gst-rv')].filter(x => x.getClientRects().length).every(x => getComputedStyle(x).opacity === '1'));
await pg.emulateMedia({ media:'screen' });
is(pr, '인쇄할 때는 감춘 카드가 전부 보인다');
/* 조명 — 마우스 자리에 빛 */
const kb = await pg.evaluate(() => { const k = document.querySelector('#kpis .hb-kpi'); const r = k.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 20 }; });
await pg.mouse.move(kb.x, kb.y); await pg.mouse.move(kb.x + 8, kb.y + 4); await pg.waitForTimeout(450);
const sl = await pg.evaluate(() => { const k = document.querySelector('#kpis .hb-kpi'); const cs = getComputedStyle(k);
  return { sp: k.classList.contains('gst-sp'), on: k.classList.contains('gst-sp-on'), bi: cs.backgroundImage, mx: k.style.getPropertyValue('--mx') }; });
is(sl.sp && sl.on && /radial-gradient/.test(sl.bi) && /px$/.test(sl.mx), '카드 조명 — 마우스가 올라간 카드에 빛이 번진다 (--mx ' + sl.mx + ')');
await pg.mouse.move(2, 2); await pg.waitForTimeout(120);
is(await pg.evaluate(() => !document.querySelector('#kpis .hb-kpi').classList.contains('gst-sp-on')), '마우스가 나가면 빛이 꺼진다');
/* 스켈레톤 카드는 조명을 받지 않는다(자기 배경 그림이 있다) */
const sk = await pg.evaluate(() => { const d = document.createElement('div'); d.className = 'card skeleton'; d.style.cssText = 'position:fixed;left:10px;top:10px;width:200px;height:100px;z-index:99'; document.body.appendChild(d); const r = d.getBoundingClientRect(); return { x: r.left + 50, y: r.top + 50 }; });
await pg.mouse.move(sk.x, sk.y); await pg.mouse.move(sk.x + 5, sk.y + 5); await pg.waitForTimeout(100);
is(await pg.evaluate(() => !document.querySelector('.card.skeleton').classList.contains('gst-sp-on')), '스켈레톤(읽는 중) 카드에는 조명을 걸지 않는다');
/* 값 내려앉기 — 처음 자리를 잡을 때 한 번만, 글자는 그대로 */
const vi = await pg.evaluate(async () => {
  const k = document.createElement('div'); k.className = 'kpi'; k.innerHTML = '<span class="val">—</span>'; document.body.appendChild(k);
  const v = k.firstChild; await new Promise(r => setTimeout(r, 30));
  v.textContent = '1,234'; await new Promise(r => setTimeout(r, 40)); const a = v.classList.contains('gst-vin'), txt = v.textContent;
  await new Promise(r => setTimeout(r, 900)); const gone = !v.classList.contains('gst-vin');
  v.textContent = '1,240'; await new Promise(r => setTimeout(r, 40)); const b = v.classList.contains('gst-vin');
  return { a, txt, gone, b };
});
is(vi.a && vi.txt === '1,234' && vi.gone && !vi.b, '값 내려앉기 — 처음 숫자가 설 때 한 번 · 글자는 그대로 · 두 번째부터는 안 건다 (' + JSON.stringify(vi) + ')');
/* 차트 등장 — 처음 그릴 때만 차례 */
const ch = await pg.evaluate(async () => {
  if (typeof Chart === 'undefined') return null;
  GST.chartDefaults();
  const cv = document.createElement('canvas'); document.body.appendChild(cv);
  const c = new Chart(cv, { type:'bar', data:{ labels:['a','b','c'], datasets:[{ data:[1,2,3] }] } });
  const f = Chart.defaults.animation.delay;
  const d0 = typeof f === 'function' ? f({ type:'data', mode:'default', dataIndex:5, datasetIndex:1, chart:c }) : -1;
  const dh = typeof f === 'function' ? f({ type:'data', mode:'active', dataIndex:5, datasetIndex:1, chart:c }) : -1;
  await new Promise(r => setTimeout(r, 1300));
  const d1 = typeof f === 'function' ? f({ type:'data', mode:'default', dataIndex:5, datasetIndex:1, chart:c }) : -1;
  c.destroy(); return { d0, dh, d1, dur: Chart.defaults.animation.duration };
});
if (ch) is(ch.d0 === 125 && ch.dh === 0 && ch.d1 === 0, '차트 등장 — 처음 그릴 때만 막대가 차례로(5번째 125ms) · hover·다시 그리기는 차례 없음 (' + JSON.stringify(ch) + ')');
else is(true, '(이 화면은 Chart.js 를 싣지 않는다 — 차트 등장 검사는 [2] 에서)');
/* 혼자 열린 화면의 «받는 중» 막대 — 셸이 없으면 스스로 보인다 */
const lb = await pg.evaluate(async () => { const h = GST.boot.job('wk'); h.prog(10, 100); await new Promise(r => setTimeout(r, 30));
  const b = document.querySelector('.gst-lbar'); const on = b && b.classList.contains('on'); h.end(100); await new Promise(r => setTimeout(r, 400));
  return { on, off: b && !b.classList.contains('on') }; });
is(lb.on && lb.off, '셸 밖에서 혼자 열린 화면은 맨 위 가는 막대로 «받는 중»을 보인다 (' + JSON.stringify(lb) + ')');
/* 토스트 — 튕겨 오르는 표식 */
const to = await pg.evaluate(() => { GST.capToast('x'); const t = document.getElementById('capToast'); return t.classList.contains('on') && t.textContent === 'x'; });
is(to, '토스트 — on 표식으로 튕겨 오른다(글자는 그대로)');
await pg.close();

/* 차트 등장 — Chart.js 를 싣는 화면에서 */
pg = await ctx.newPage(); watch(pg);
await pg.goto(BASE + '/fault/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(1500);
const ch2 = await pg.evaluate(async () => {
  GST.chartDefaults();
  const cv = document.createElement('canvas'); document.body.appendChild(cv);
  const c = new Chart(cv, { type:'bar', data:{ labels:['a','b','c'], datasets:[{ data:[1,2,3] }] } });
  const f = Chart.defaults.animation.delay;
  const d0 = typeof f === 'function' ? f({ type:'data', mode:'default', dataIndex:5, datasetIndex:1, chart:c }) : -1;
  const dh = typeof f === 'function' ? f({ type:'data', mode:'active', dataIndex:5, datasetIndex:1, chart:c }) : -1;
  await new Promise(r => setTimeout(r, 1300));
  const d1 = typeof f === 'function' ? f({ type:'data', mode:'default', dataIndex:5, datasetIndex:1, chart:c }) : -1;
  c.destroy(); return { d0, dh, d1 };
});
is(ch2.d0 === 125 && ch2.dh === 0 && ch2.d1 === 0, '차트 등장 — 처음 그릴 때만 막대가 차례로(5번째 125ms) · hover·다시 그리기는 차례 없음 (' + JSON.stringify(ch2) + ')');
/* 이 화면의 카드 찾기(셸 밖) — Ctrl K → 카드 이름 → Enter → 그 카드가 빛난다 */
await pg.keyboard.press('Control+k'); await pg.waitForTimeout(250);
const pal0 = await pg.evaluate(() => !!document.querySelector('.gst-pal-ov .gst-pal-in'));
is(pal0, '셸 밖에서 혼자 열린 화면에서도 Ctrl K 가 연다(이 화면의 카드만)');
const cardT = await pg.evaluate(() => { const c = GST.palette.cards(); return c.length ? c[c.length - 1].t : ''; });
await pg.keyboard.type(cardT.slice(0, 6)); await pg.waitForTimeout(150);
const optN = await pg.evaluate(() => document.querySelectorAll('.gst-pal-o').length);
await pg.keyboard.press('Enter'); await pg.waitForTimeout(250);
const fl = await pg.evaluate(() => ({ open: !!document.querySelector('.gst-pal-ov:not(.out)'), flash: !!document.querySelector('.gst-flash') }));
is(cardT && optN > 0 && !fl.open && fl.flash, '카드 이름으로 찾아 Enter → 팔레트가 닫히고 그 카드로 가 잠깐 빛난다 («' + cardT.slice(0, 20) + '» · 항목 ' + optN + ')');
await pg.close();

/* 주간현황 · 움직임 줄이기 — 아무 효과도 안 건다 */
pg = await ctx.newPage(); watch(pg);
await pg.goto(BASE + '/report/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(2200);
const rp = await pg.evaluate(() => ({ rv: document.querySelectorAll('.gst-rv').length, sprog: !!document.querySelector('.gst-sprog'),
  delay: typeof Chart !== 'undefined' && typeof Chart.defaults.animation.delay === 'function' }));
is(rp.rv === 0 && !rp.sprog && !rp.delay, '주간현황에는 스크롤 등장·읽는 위치·차트 차례를 걸지 않는다 (' + JSON.stringify(rp) + ')');
await pg.close(); await ctx.close();
ctx = await ctxOf({ reduce:true, vp:{ width:1440, height:620 } }); pg = await ctx.newPage(); watch(pg);
await pg.goto(BASE + '/fault/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(1600);
const rd = await pg.evaluate(() => { GST.chartDefaults(); return { rv: document.querySelectorAll('.gst-rv').length, sprog: !!document.querySelector('.gst-sprog'), dur: Chart.defaults.animation.duration }; });
is(rd.rv === 0 && !rd.sprog && rd.dur === 0, '움직임 줄이기 — 스크롤 등장 없음 · 차트 애니메이션 0 (' + JSON.stringify(rd) + ')');
await pg.close(); await ctx.close();

/* ───────────────────────── [2] 다크 미드나이트 · 배경 ───────────────────────── */
console.log('[2] 다크 미드나이트 · 배경');
ctx = await ctxOf(); pg = await ctx.newPage(); watch(pg);
await pg.goto(BASE + '/fault/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(900);
const th = await pg.evaluate(() => {
  const L = { bi: getComputedStyle(document.body, '::before').backgroundImage, pos: getComputedStyle(document.body, '::before').position };
  document.body.classList.add('theme-slate');
  const cs = getComputedStyle(document.body), pb = getComputedStyle(document.body, '::before'), card = getComputedStyle(document.querySelector('.card'));
  return { L, bg: cs.getPropertyValue('--bg').trim(), acc: cs.getPropertyValue('--accent').trim(), dbi: pb.backgroundImage, cardBg: card.backgroundColor, ink: GST.chartTheme().ink };
});
is(/radial-gradient/.test(th.L.bi) && th.L.pos === 'fixed', '라이트 — 위쪽에 옅은 빛(고정 배경 층)');
is(th.bg.toUpperCase() === '#070B14' && th.acc.toUpperCase() === '#6C9BFF', '다크 — 미드나이트 토큰 (' + th.bg + ' · ' + th.acc + ')');
is((th.dbi.match(/radial-gradient/g) || []).length === 3, '다크 — 오로라 세 점');
is(/rgba?\(13, 19, 33(, 0\.86)?\)|color\(srgb/.test(th.cardBg) && /0\.86|color/.test(th.cardBg), '다크 카드 — 바탕 빛이 아주 조금 비친다(86%) (' + th.cardBg + ')');
is(th.ink.toUpperCase() === '#E8EEF7', '차트 잉크도 같은 값(Chart.js 는 CSS 변수를 못 읽는다)');
await pg.close(); await ctx.close();

/* ───────────────────────── [3] 셸 — 부팅 화면 ───────────────────────── */
console.log('[3] 셸 — 부팅 화면');
ctx = await ctxOf(); let ps = await ctx.newPage(); watch(ps);
await ps.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await ps.waitForTimeout(500);
const b0 = await ps.evaluate(() => { const b = document.getElementById('boot'); return b ? { pe: getComputedStyle(b).pointerEvents, z: getComputedStyle(b).zIndex } : null; });
is(!!b0 && b0.pe === 'none', '세션 첫 화면에 부팅 화면이 뜬다 · 누르는 것을 막지 않는다(pointer-events none)');
await ps.waitForTimeout(1300);
const lg = await ps.evaluate(() => [...document.querySelectorAll('#bootLog > div')].map(d => ({ cls: d.className, n: d.querySelector('.n').textContent, m: d.querySelector('.m').textContent, s: d.querySelector('.s').textContent })));
is(lg.length >= 2 && lg.some(x => x.n === '설치 현황') && lg.some(x => x.n === '수선 실적'), '로그는 실제로 읽는 표다 (' + lg.map(x => x.n).join(' · ') + ')');
is(lg.some(x => /sheet_inst/.test(x.m) && /52행/.test(x.m)), '관리자(legacy)에게는 표 이름·행 수가 보인다 (' + (lg.find(x => /inst/.test(x.m)) || {}).m + ')');
is(lg.filter(x => x.cls === 'ok').every(x => x.s === '✓'), '끝난 줄은 ✓');
if (SHOT) await ps.screenshot({ path: SHOT + '/boot.png' });
await ps.waitForFunction(() => !document.getElementById('boot'), null, { timeout:12000 }).catch(() => {});
is(await ps.evaluate(() => !document.getElementById('boot') && sessionStorage.getItem('gst_boot_seen') === '1'), '첫 화면이 다 그려지면 걷힌다');
await ps.reload({ waitUntil:'domcontentloaded' }); await ps.waitForTimeout(500);
is(await ps.evaluate(() => !document.getElementById('boot')), '같은 세션에서 다시 열면 부팅 화면은 다시 안 뜬다');
/* 읽는 중 막대 — 켜진 탭이 300ms 넘게 읽으면 */
const homeF = ps.frames().find(f => /\/home\//.test(f.url()));
await homeF.evaluate(() => window.parent.postMessage({ type:'gst-boot', ev:'begin', id:'zz1', key:'wk', kind:'fg' }, '*'));
await ps.waitForTimeout(150);
const fp0 = await ps.evaluate(() => document.getElementById('fprog').classList.contains('on'));
await ps.waitForTimeout(400);
await homeF.evaluate(() => window.parent.postMessage({ type:'gst-boot', ev:'prog', id:'zz1', n:400, total:1000 }, '*'));
await ps.waitForTimeout(200);
const fp1 = await ps.evaluate(() => ({ on: document.getElementById('fprog').classList.contains('on'), w: document.querySelector('#fprog i').style.width }));
await homeF.evaluate(() => window.parent.postMessage({ type:'gst-boot', ev:'end', id:'zz1', n:1000, ms:700 }, '*'));
await ps.waitForTimeout(600);
const fp2 = await ps.evaluate(() => document.getElementById('fprog').classList.contains('on'));
is(!fp0 && fp1.on && fp1.w === '40%' && !fp2, '읽는 중 막대 — 짧은 읽기는 조용히 · 300ms 넘으면 진행률(40%) · 끝나면 사라진다 (' + JSON.stringify([fp0, fp1, fp2]) + ')');
await ps.close(); await ctx.close();
/* 조회자 — 표 이름·행 수를 안 보인다 · 키 하나로 걷힌다 */
ctx = await ctxOf({ role:'viewer' }); ps = await ctx.newPage(); watch(ps);
await ps.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await ps.waitForTimeout(1500);
const lv = await ps.evaluate(() => [...document.querySelectorAll('#bootLog > div')].map(d => ({ n: d.querySelector('.n').textContent, m: d.querySelector('.m').textContent })));
is(lv.length >= 1 && lv.every(x => x.m === '') && lv.some(x => x.n === '수선 실적'), '조회자에게는 «무엇을» 받는지만 — 표 이름·행 수 없음(A-4)');
await ps.keyboard.press('Shift'); await ps.waitForTimeout(80);
is(await ps.evaluate(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('out'); }), '키 하나면 바로 걷힌다');
await ps.close(); await ctx.close();
/* 움직임 줄이기 — 고리가 돌지 않는다 */
ctx = await ctxOf({ reduce:true }); ps = await ctx.newPage(); watch(ps);
await ps.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await ps.waitForTimeout(300);
is(await ps.evaluate(() => { const i = document.querySelector('.boot-orb i'); return !i || getComputedStyle(i).animationName === 'none'; }), '움직임 줄이기 — 부팅 화면의 고리가 돌지 않는다');
await ps.close(); await ctx.close();

/* ───────────────────────── [4] 셸 — 명령 팔레트 · 탭 밑줄 ───────────────────────── */
console.log('[4] 셸 — 명령 팔레트(Ctrl K) · 탭 밑줄');
ctx = await ctxOf(); ps = await ctx.newPage(); watch(ps);
await ps.addInitScript(() => { try{ sessionStorage.setItem('gst_boot_seen', '1'); }catch(e){} });
await ps.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await ps.waitForTimeout(2600);
is(await ps.evaluate(() => { const b = document.getElementById('palBtn'); return !!b && /Ctrl K|⌘K/.test(b.textContent); }), '상단 바에 검색 단추(Ctrl K)');
const ink = async () => ps.evaluate(() => { const a = document.querySelector('.tab.active'), k = document.getElementById('tabInk'), bar = document.getElementById('tabbar');
  const ar = a.getBoundingClientRect(), kr = k.getBoundingClientRect(); return { id: a.dataset.id, d: Math.abs((ar.left + ar.width / 2) - (kr.left + kr.width / 2)), op: getComputedStyle(k).opacity, bd: getComputedStyle(a).borderBottomColor }; });
const i0 = await ink();
is(i0.d < 2 && i0.op === '1', '탭 밑줄이 켜진 탭 아래에 선다 (' + i0.id + ' · 어긋남 ' + i0.d.toFixed(1) + 'px)');
await ps.keyboard.press('Control+k'); await ps.waitForTimeout(250);
is(await ps.evaluate(() => !!document.querySelector('.gst-pal-ov') && document.activeElement && document.activeElement.classList.contains('gst-pal-in')), 'Ctrl K — 팔레트가 열리고 입력 칸에 초점');
await ps.keyboard.type('ㄱㅈ'); await ps.waitForTimeout(120);
const o1 = await ps.evaluate(() => (document.querySelector('.gst-pal-o.on b') || {}).textContent);
is(o1 === '고장 분석', '초성(ㄱㅈ)으로 찾는다 → 첫 항목 「' + o1 + '」');
await ps.keyboard.press('Enter'); await ps.waitForTimeout(700);
const i1 = await ink();
is(i1.id === 'fault' && !(await ps.evaluate(() => !!document.querySelector('.gst-pal-ov:not(.out)'))), 'Enter → 그 탭으로 · 팔레트 닫힘');
await ps.waitForTimeout(400);
const i2 = await ink();
is(i2.d < 2, '탭 밑줄이 따라 미끄러진다 (어긋남 ' + i2.d.toFixed(1) + 'px)');
/* 최근 */
await ps.keyboard.press('Control+k'); await ps.waitForTimeout(200);
const rec = await ps.evaluate(() => { const g = document.querySelector('.gst-pal-g'); const o = document.querySelector('.gst-pal-o b'); return [g && g.textContent, o && o.textContent]; });
is(rec[0] === '최근' && rec[1] === '고장 분석', '빈 칸으로 열면 «최근»이 먼저 (' + rec.join(' · ') + ')');
/* 기능 — legacy(관리자와 같다)에게는 데이터 관리가 있다 */
await ps.keyboard.type('데이터'); await ps.waitForTimeout(120);
is(await ps.evaluate(() => [...document.querySelectorAll('.gst-pal-o b')].some(b => b.textContent === '데이터 관리')), '관리자에게는 «데이터 관리»가 뜬다');
await ps.keyboard.press('Escape'); await ps.waitForTimeout(250);
is(await ps.evaluate(() => !document.querySelector('.gst-pal-ov:not(.out)')), 'Esc 로 닫힌다');
/* iframe 안에서 Ctrl K → 셸에 뜬다 */
const fF = ps.frames().find(f => /\/fault\//.test(f.url()));
await fF.evaluate(() => document.body.focus());
await ps.locator('iframe.active').click({ position:{ x:200, y:300 } }).catch(() => {});
await ps.keyboard.press('Control+k'); await ps.waitForTimeout(400);
const inF = await fF.evaluate(() => !!document.querySelector('.gst-pal-ov'));
const inS = await ps.evaluate(() => !!document.querySelector('.gst-pal-ov:not(.out)'));
is(inS && !inF, '화면(iframe) 안에서 눌러도 팔레트는 셸에 하나만 뜬다');
/* 지금 화면의 카드 */
await ps.waitForTimeout(200);
const cardT2 = await fF.evaluate(() => { const c = GST.palette.cards(); return c.length ? c[0].t : ''; });
await ps.keyboard.type(cardT2.slice(0, 5)); await ps.waitForTimeout(250);
const cg = await ps.evaluate(() => [...document.querySelectorAll('.gst-pal-g')].map(g => g.textContent));
is(cardT2 && cg.indexOf('이 화면의 카드') >= 0, '지금 화면의 카드도 찾는다 («' + cardT2.slice(0, 16) + '» · 묶음 ' + cg.join('/') + ')');
await ps.keyboard.press('Escape'); await ps.waitForTimeout(250);
/* S/N — 표의 S/N 메뉴와 같은 길(gst-goto 의 sn 상태) */
await ps.keyboard.press('Control+k'); await ps.waitForTimeout(200);
await ps.keyboard.type('TWC1S'); await ps.waitForTimeout(150);
const sn = await ps.evaluate(() => [...document.querySelectorAll('.gst-pal-o')].map(o => o.querySelector('b').textContent + '|' + ((o.querySelector('small') || {}).textContent || '')));
is(sn.some(x => x === 'TWC1S|설비 현황에서 보기') && sn.some(x => x === 'TWC1S|PM 점검에서 보기'), 'S/N 을 치면 «그 화면에서 보기» 항목 (' + sn.slice(0, 4).join(' · ') + ')');
await ps.evaluate(() => { const o = [...document.querySelectorAll('.gst-pal-o')].find(x => /설비 현황에서/.test(x.textContent)); o.click(); });
await ps.waitForTimeout(1800);
const sF = ps.frames().find(f => /\/scrubber\//.test(f.url()));
const snSt = sF ? await sF.evaluate(() => { const s = new URLSearchParams(location.search).get('f'); return s ? GST.decodeState(s) : null; }) : null;
is((await ink()).id === 'scrubber' && snSt && snSt.sn === 'TWC1S', 'S/N 항목 → 표의 S/N 메뉴와 같은 길로 그 탭이 그 설비로 열린다 (' + JSON.stringify(snSt) + ')');
if (SHOT) { await ps.keyboard.press('Control+k'); await ps.waitForTimeout(250); await ps.keyboard.type('ㅈ'); await ps.waitForTimeout(200); await ps.screenshot({ path: SHOT + '/palette.png' }); await ps.keyboard.press('Escape'); }
await ps.close(); await ctx.close();
/* 조회자 — 툴바에 없는 기능은 팔레트에도 없다 */
ctx = await ctxOf({ role:'viewer' }); ps = await ctx.newPage(); watch(ps);
await ps.addInitScript(() => { try{ sessionStorage.setItem('gst_boot_seen', '1'); }catch(e){} });
await ps.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await ps.waitForTimeout(1800);
await ps.keyboard.press('Control+k'); await ps.waitForTimeout(200);
const va = await ps.evaluate(() => [...document.querySelectorAll('.gst-pal-o b')].map(b => b.textContent));
is(va.indexOf('데이터 관리') < 0 && va.indexOf('오프라인') < 0 && va.indexOf('새로고침') >= 0, '조회자 — 데이터 관리·오프라인 없음 · 새로고침은 있음');
await ps.close(); await ctx.close();

/* ───────────────────────── [5] 글로벌 현황 — 상태 띠 ───────────────────────── */
console.log('[5] 글로벌 현황 — 상태 띠');
ctx = await ctxOf(); pg = await ctx.newPage(); watch(pg);
await pg.goto(BASE + '/hub/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3800);
const tk = await pg.evaluate(() => {
  const box = document.getElementById('tick'), items = [...document.querySelectorAll('#tickIn .hb-tk')];
  const sigs = [...document.querySelectorAll('#sigs .hb-sig')].map(s => s.dataset.op);
  const live = items.filter(b => b.getAttribute('aria-hidden') !== 'true');
  return { shown: box && !box.hidden, n: items.length, live: live.map(b => b.dataset.tk), sigs,
    em: [...new Set(items.map(b => b.querySelector('em').textContent))], anim: getComputedStyle(document.getElementById('tickIn')).animationName,
    leg: [...document.querySelectorAll('.hb-legend [data-i]')].map(x => x.textContent) };
});
is(tk.shown && tk.live.slice(0, tk.sigs.length).join() === tk.sigs.join(), '상태 띠 — 신호등과 같은 운영단위·같은 순서 (' + tk.sigs.length + '곳)');
is(tk.em.every(x => ['안정', '관찰 중', '점검 권장'].indexOf(x) >= 0) && tk.em.indexOf('점검 권장') >= 0, '상태 낱말 — 안정 · 관찰 중 · 점검 권장 («위험» 을 쓰지 않는다) (' + tk.em.join('/') + ')');
is(tk.leg.slice(0, 3).join('/') === '점검 권장/관찰 중/안정', '신호등 범례도 같은 낱말');
is(tk.anim === 'hbTick' && tk.n % 2 === 0 && tk.n >= 12 && tk.live.length === tk.sigs.length, '이어 흐르도록 같은 줄을 두 번 · 낭독·키보드에는 한 벌만 (' + tk.n + '칸 중 ' + tk.live.length + ')');
const pick = await pg.evaluate(() => { const b = [...document.querySelectorAll('#tickIn .hb-tk')].find(x => /WUHAN/.test(x.dataset.tk)); b.click();
  return (document.querySelector('#sigs .hb-sig.on') || {}).dataset; });
is(pick && /WUHAN/.test(pick.op), '띠의 운영단위를 누르면 그 운영단위를 고른다');
if (SHOT) await pg.screenshot({ path: SHOT + '/hub-ticker.png' });
await pg.evaluate(() => document.body.classList.add('theme-slate')); await pg.waitForTimeout(200);
if (SHOT) await pg.screenshot({ path: SHOT + '/hub-midnight.png' });
await pg.close(); await ctx.close();
ctx = await ctxOf({ reduce:true }); pg = await ctx.newPage(); watch(pg);
await pg.goto(BASE + '/hub/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3500);
is(await pg.evaluate(() => getComputedStyle(document.getElementById('tickIn')).animationName === 'none'), '움직임 줄이기 — 띠가 흐르지 않는다(가로 스크롤)');
await pg.close(); await ctx.close();

is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-design: ${pass} 통과 · ${fail} 실패` : `\n✅ t-design: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
