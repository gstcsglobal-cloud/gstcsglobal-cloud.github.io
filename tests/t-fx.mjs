/* t-fx — 효과 층 «디자인 X» (v180 · GST.fx). 지어낸 자료만(t-leak).
   지키는 것: ① 효과는 숫자·글자를 바꾸지 않는다 — 오도미터·제목 디코드는 겹친 그림(aria-hidden · shadow)이고 원래 글자는 처음부터 최종값
   ② 카드에 transform 을 남기지 않는다 — 기울기는 마우스가 위에 있을 때만(v169) · 자석 단추는 translate
   ③ 움직임 줄이기면 움직이는 효과의 기본값이 꺼짐 ④ 셸 「효과」 패널 — 켜고 끄면 이 PC 에 남고 열린 탭(iframe)까지 간다
   ⑤ 별빛은 페이지에만 · 그레인은 맨 위 문서 하나에만 ⑥ 폭죽은 없다(사용자 확정)
   ⑦ 효과 없는 화면(고장 분석 · v193) — 설정과 무관하게 처음부터 효과·움직임 층을 안 건다 · 셸도 그 탭에서는 그레인을 거둔다.
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-fx.mjs */
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
const unit = (op, cust, fab, code, state, wd, wio, loc) => { no++; inst.push([no, op, cust, loc || 'LOC', fab, 'L1', 'B1', code, code + 'S', 'GST-1000',
  'BURN', 'SINGLE', 'ETCH', 'DRY', 'DRY', 'MT' + no, 'TEL', 'TEL-A', '2023-03-01', '2023-03-10', '2023-03-20', wd || '2030-01-01', wio || 'IN', state]); };
for (let i = 1; i <= 30; i++) unit('GST TAIWAN SCRUBBER', 'Micron Memory Taiwan Co., Ltd.(F16)', 'F16', 'TWC' + i, i <= 28 ? 'Operation' : 'Set-up', i <= 3 ? ymd(dAgo(-30)) : '', '', i <= 10 ? 'TAINAN' : '');
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
const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
  + 'GST.getSession=async function(){return {user:{email:"t@t"}};};GST.token=async function(){return "t";};'
  + 'GST.csvTableRows=async function(){return [];};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();if(GST._authOk)GST._authOk();return true;};';
const browser = await chromium.launch(PW);
const ctx = await browser.newContext({ viewport:{ width:1600, height:1100 }, locale:'ko-KR' });
await ctx.route('**gstcsglobal-cloud.github.io/**', r => { let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
  r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) }); });
await ctx.route('**/assets/core.js*', r => r.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB }));
await ctx.route('**/cdn.jsdelivr.net/**', r => { const u = r.request().url();
  if (u.includes('papaparse')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM + 'papaparse/papaparse.min.js', 'utf8') });
  if (u.includes('chart.umd')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM + 'chart.js/dist/chart.umd.js', 'utf8') });
  if (u.endsWith('.css')) return r.fulfill({ status:200, contentType:'text/css', body:'' });
  return r.fulfill({ status:200, contentType:'application/javascript', body:'' }); });
await ctx.route('**/spreadsheets/**', r => { const gid = (r.request().url().match(/gid=(\d+)/) || [])[1];
  r.fulfill({ status:200, contentType:'text/csv', body: SHEETS[gid] || '' }); });
await ctx.route('**supabase**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));

console.log('[0] 사전 · 폭죽 없음');
{ const core = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
  const keys = (core.match(/GST\.FX_KEYS = \[([\s\S]*?)\];/) || [])[1] || '';
  is(keys && !/confetti|폭죽|boom/i.test(keys), '효과 목록에 폭죽(confetti)이 없다 — 사용자 확정');
  is(!/confetti|폭죽|function boom/i.test(core.slice(core.indexOf('GST.FX_KEYS'), core.indexOf('GST.fx.init();'))), '효과 층 코드에 폭죽 구현이 없다');
  /* v201 — 마우스 커서 효과는 없앴다(사용자 확정 「그냥 기본 마우스 포인터가 낫다」). 커서를 감추는 규칙(cursor:none)이 되살아나면 포인터가 사라진다 */
  const fxz = core.slice(core.indexOf('GST.FX_KEYS'), core.indexOf('GST.fx.init();'));
  is(!/\['cursor'/.test(keys) && !/cursor\s*:\s*none/.test(fxz) && !/gst-fx-c(dot|ring)|gst-cur-in/.test(core), '커서 효과가 없다 — 효과 목록 · cursor:none · 점·고리 층 · 표식 모두'); }

const pg = await ctx.newPage(); const pe = []; pg.on('pageerror', e => pe.push(e.message));
await pg.goto(BASE + '/hub/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3200);

console.log('[1] 기본값 — 움직임 줄이기가 아니면 전부 켜짐');
const d0 = await pg.evaluate(() => ({ n:GST.FX_KEYS.length, on:GST.FX_KEYS.filter(k => document.body.classList.contains('fx-' + k[0])).length,
  stars:!!document.querySelector('.gst-fx-stars'), grain:!!document.querySelector('.gst-fx-grain'), css:!!document.getElementById('gstFxCss') }));
is(d0.n >= 25 && d0.on === d0.n && d0.css, '효과 ' + d0.n + '개가 전부 켜짐(body.fx-…) · 효과 CSS 는 core 가 한 벌 넣는다');
is(d0.stars && d0.grain, '혼자 열린 페이지 — 별빛 캔버스 · 그레인(맨 위 문서)이 선다');

console.log('[2] 오도미터 — 글자는 처음부터 최종값 · 겹친 그림만 구른다');
const od = await pg.evaluate(async () => {
  const b = document.querySelector('#kpis .hb-kpi[data-k="bm"]'), n = b.querySelector('.num'), v = b.querySelector('.v');
  const before = n.textContent, vt = v.textContent;
  const ok = GST.fx.odo(n, '3'); await new Promise(r => setTimeout(r, 120));
  const h = b.querySelector('.gst-odo'), cs = h ? getComputedStyle(h) : null;
  const mid = { txt:n.textContent, vt:v.textContent, src:n.classList.contains('gst-odo-src'), op:getComputedStyle(n).opacity, aria:h && h.getAttribute('aria-hidden'),
    shadow:!!(h && h.shadowRoot), light:h ? h.textContent : null, pos:cs && cs.position, w:[n.getBoundingClientRect().width, h && h.getBoundingClientRect().width] };
  await new Promise(r => setTimeout(r, 1700));
  return { ok, before, vt, mid, after:{ host:!!b.querySelector('.gst-odo'), src:n.classList.contains('gst-odo-src'), txt:n.textContent } };
});
is(od.ok && od.mid.txt === od.before && od.mid.vt === od.vt, '구르는 동안에도 원래 글자는 최종값 그대로 — 카드 글자(' + od.vt + ')에 0~9 기둥이 섞이지 않는다');
is(od.mid.aria === 'true' && od.mid.shadow && od.mid.light === '' && od.mid.pos === 'absolute' && od.mid.op === '0', '겹친 그림 — aria-hidden · shadow DOM(글자가 DOM 에 없다) · 원래 값은 opacity 0(지우지 않는다)');
is(Math.abs(od.mid.w[0] - od.mid.w[1]) < 1.5, '겹친 그림의 폭 = 원래 값의 폭(글자마다 잰다) — 단위(건)를 덮지 않는다 (' + od.mid.w.map(x => x && x.toFixed(1)).join(' · ') + ')');
is(!od.after.host && !od.after.src && od.after.txt === od.before, '다 구르면 그림을 걷고 원래 값을 다시 보인다');
const od2 = await pg.evaluate(() => { const n = document.querySelector('#kpis .hb-kpi[data-k="bm"] .num'); return GST.fx.odo(n, n.textContent); });
is(od2 === false, '같은 값이면 굴리지 않는다(자동 새로고침이 출렁이지 않게)');

console.log('[3] 제목 디코드 — 겹친 그림만 뒤섞인다');
const sc = await pg.evaluate(async () => { const t = document.querySelector('[data-i="title"]'), before = t.textContent; const ok = GST.fx.scramble(t);
  await new Promise(r => setTimeout(r, 150)); const mid = t.textContent, h = t.parentNode.querySelector('.gst-odo');
  await new Promise(r => setTimeout(r, 1300)); return { ok, before, mid, host:!!h, aria:h && h.getAttribute('aria-hidden'), after:t.textContent, gone:!t.parentNode.querySelector('.gst-odo') }; });
is(sc.ok && sc.mid === sc.before && sc.after === sc.before && sc.host && sc.aria === 'true' && sc.gone, '제목 글자는 그대로(' + sc.before + ') — 뒤섞이는 것은 겹친 그림 · 끝나면 걷는다');

console.log('[4] 기울기 · 회전 테두리 — 마우스가 위에 있을 때만');
const kr = await pg.evaluate(() => { const r = document.querySelector('#kpis .hb-kpi[data-k="pm"]').getBoundingClientRect(); return { x:r.left + r.width * .8, y:r.top + r.height * .25 }; });
await pg.mouse.move(kr.x, kr.y); await pg.mouse.move(kr.x + 3, kr.y + 2); await pg.waitForTimeout(250);
const t1 = await pg.evaluate(() => { const k = document.querySelector('#kpis .hb-kpi[data-k="pm"]'); return { tilt:k.classList.contains('gst-tilt'), hov:k.classList.contains('gst-hov'), tf:getComputedStyle(k).transform, ring:getComputedStyle(k, '::before').content }; });
is(t1.tilt && t1.hov && t1.tf !== 'none' && t1.ring !== 'none', '마우스가 올라간 KPI 카드 — 기울고(transform) 테두리에 빛이 돈다(::before)');
await pg.mouse.move(5, 5); await pg.waitForTimeout(500);
const t2 = await pg.evaluate(() => { const k = document.querySelector('#kpis .hb-kpi[data-k="pm"]'); return { tilt:k.classList.contains('gst-tilt'), hov:k.classList.contains('gst-hov'), tf:getComputedStyle(k).transform, rx:k.style.getPropertyValue('--gst-rx') }; });
is(!t2.tilt && !t2.hov && t2.tf === 'none' && !t2.rx, '마우스가 나가면 transform 이 none — 카드에 아무것도 남지 않는다(v169)');

console.log('[4b] 스크롤·마우스가 «문서 전체»를 다시 계산하지 않는다 (v192 · 사용자 「스크롤할 때 뚝뚝 끊긴다」)');
/* body·html 의 사용자 정의 속성은 모든 요소가 물려받는다 — 스크롤·마우스마다 거기에 쓰면 프레임마다 문서 전체의 스타일을 다시 센다
   (실측 고장 분석 › 알람 분석: 스크롤 487→100ms · 마우스 3,348→94ms). 패럴랙스는 CSS 스크롤 타임라인 · 격자 좌표는 격자 층 자신 · 조명 좌표는 비상속 등록. */
await pg.evaluate(() => { document.body.style.minHeight = '3200px'; });
for (let i = 0; i < 6; i++) { await pg.mouse.wheel(0, 300); await pg.waitForTimeout(60); }
for (let i = 0; i < 12; i++) { await pg.mouse.move(300 + i * 40, 400 + (i % 3) * 30); await pg.waitForTimeout(20); }
await pg.waitForTimeout(200);
const sv = await pg.evaluate(() => { const b = document.body, h = document.documentElement, g = document.querySelector('.gst-fx-grid'), bf = getComputedStyle(b, '::before');
  const card = document.querySelector('.hb-card,.card,.hb-kpi'), kid = card && card.querySelector('*');
  if (card) card.style.setProperty('--mx', '123px');
  const out = { sy:window.scrollY, par:b.style.getPropertyValue('--gst-par'), hgx:h.style.getPropertyValue('--gst-gx'), ggx:g ? g.style.getPropertyValue('--gst-gx') : 'no-grid',
    tl:bf.animationTimeline, an:bf.animationName, kidMx:kid ? getComputedStyle(kid).getPropertyValue('--mx').trim() : 'no-kid', cardMx:card ? getComputedStyle(card).getPropertyValue('--mx').trim() : '' };
  if (card) card.style.removeProperty('--mx'); b.style.minHeight = ''; window.scrollTo(0, 0); return out; });
is(sv.sy > 0 && !sv.par, '스크롤해도 body 에 --gst-par 를 쓰지 않는다 (scrollY ' + sv.sy + ')');
is(/scroll\(/.test(sv.tl) && /gstPar/.test(sv.an), '패럴랙스 = CSS 스크롤 타임라인(합성에서 돈다) — ' + sv.an + ' · ' + sv.tl);
is(!sv.hgx && /px$/.test(sv.ggx), '격자 빛 좌표는 html 이 아니라 격자 층 자신에 (' + sv.ggx + ')');
is(sv.cardMx === '123px' && sv.kidMx === '50%', '조명 좌표(--mx)는 상속하지 않는다 — 카드 안의 요소는 다시 계산되지 않는다 (카드 ' + sv.cardMx + ' · 안 ' + sv.kidMx + ')');

console.log('[5] 자석 단추 · 누름 물결');
const bb = await pg.evaluate(() => { const b = document.getElementById('saveDef'); const r = b.getBoundingClientRect(); return { x:r.left + r.width / 2, y:r.top + r.height / 2, w:r.width }; });
await pg.mouse.move(bb.x + bb.w * .55, bb.y); await pg.mouse.move(bb.x + bb.w * .6, bb.y + 4); await pg.waitForTimeout(250);
const mg = await pg.evaluate(() => { const b = document.getElementById('saveDef'); return { tr:b.style.translate, tf:b.style.transform, cls:b.classList.contains('gst-mag') }; });
is(mg.cls && /px/.test(mg.tr) && !mg.tf, '자석 — 단추 가까이 오면 translate 로 끌려온다(transform 은 건드리지 않는다 · ' + mg.tr + ')');
await pg.mouse.move(5, 600); await pg.waitForTimeout(250);
is(await pg.evaluate(() => !document.getElementById('saveDef').style.translate), '멀어지면 제자리');
const rp = await pg.evaluate(async () => { const b = document.querySelector('#segRegion button[data-r="all"]'), txt = b.textContent; const r = b.getBoundingClientRect();
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, clientX:r.left + 5, clientY:r.top + 5, button:0 }));
  const w = b.querySelector('.gst-rip-w'), has = !!w, aria = w && w.getAttribute('aria-hidden'), t2 = b.textContent;
  await new Promise(r => setTimeout(r, 800)); return { has, aria, txt, t2, gone:!b.querySelector('.gst-rip-w') }; });
is(rp.has && rp.aria === 'true' && rp.t2 === rp.txt && rp.gone, '누름 물결 — 단추 안에 감싼 층으로 번지고(글자 그대로) 0.7초 뒤 걷힌다');

console.log('[6] 브리핑 타자기 — 글자는 처음부터 전문 · clip-path 로 가렸다 드러낸다');
const tw = await pg.evaluate(() => { const s = [...document.querySelectorAll('#blines li > span')]; return { n:s.length, tw:s.filter(x => x.classList.contains('tw')).length,
  full:/이번 주 고장 15건/.test(s[0] && s[0].textContent), anim:s[0] && getComputedStyle(s[0]).animationName, caret:!!document.querySelector('#blines .hb-caret') }; });
is(tw.n >= 5 && tw.tw === tw.n && tw.full && tw.anim === 'gstType' && tw.caret, '타자기 — 줄마다 gstType(clip-path) · 글자는 처음부터 전문 · 끝에 커서');

console.log('[7] 끄기 — 전부 끄면 body 에 fx- 가 하나도 없고, 감춰 둔 카드도 바로 보인다');
await pg.evaluate(() => { GST.fx.setAll(false); });
const off = await pg.evaluate(() => ({ cls:[...document.body.classList].filter(c => /^fx-/.test(c)), ls:JSON.parse(localStorage.getItem('gst_fx') || '{}'),
  hidden:[...document.querySelectorAll('.gst-rv')].filter(e => !e.classList.contains('gst-in')).length, odo:GST.fx.odo(document.querySelector('#kpis .hb-kpi[data-k="run"] .num'), '1') }));
is(!off.cls.length && Object.keys(off.ls).length >= 25 && !off.hidden && off.odo === false, '전부 끔 — 클래스 0 · 이 PC 에 저장 · 숨긴 카드 0 · 오도미터도 안 돈다');
await pg.evaluate(() => GST.fx.reset());
is(await pg.evaluate(() => localStorage.getItem('gst_fx') === '{}' && document.body.classList.contains('fx-stars')), '기본값 — 저장을 비우고 다시 전부 켜짐');
is(pe.length === 0, 'JS 에러 0 (글로벌 현황)' + (pe.length ? ' → ' + pe[0] : ''));
await pg.close();

console.log('[8] 움직임 줄이기 — 움직이는 효과는 기본으로 꺼짐(직접 켜면 켠다)');
const pr = await ctx.newPage(); await pr.emulateMedia({ reducedMotion:'reduce' });
await pr.goto(BASE + '/hub/', { waitUntil:'domcontentloaded' }); await pr.waitForTimeout(2600);
const rd = await pr.evaluate(() => ({ stars:document.body.classList.contains('fx-stars'), tilt:document.body.classList.contains('fx-tilt'), odo:document.body.classList.contains('fx-odometer'),
  sheen:document.body.classList.contains('fx-sheen'), grat:document.body.classList.contains('fx-graticule'), hostN:document.querySelectorAll('.gst-odo').length }));
is(!rd.stars && !rd.tilt && !rd.odo && rd.sheen && rd.grat && !rd.hostN, '움직임 줄이기 — 별빛·기울기·오도미터 꺼짐 · 조명·경위선(움직이지 않는 효과)은 켜짐');
await pr.evaluate(() => GST.fx.set('odometer', true));
is(await pr.evaluate(() => document.body.classList.contains('fx-odometer') && JSON.parse(localStorage.getItem('gst_fx')).odometer === true), '직접 켜면 켠다(이 PC 에 남는다)');
await pr.evaluate(() => GST.fx.reset()); await pr.close();

console.log('[9] 셸 — 「효과」 패널 · 열린 탭까지 · 별빛은 셸에 없다');
const ps = await ctx.newPage(); const pse = []; ps.on('pageerror', e => pse.push(e.message));
await ps.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await ps.waitForTimeout(3500);
await ps.evaluate(() => { const o = document.getElementById('loginOverlay'); if (o) o.remove(); });
const sh0 = await ps.evaluate(() => ({ stars:!!document.querySelector('.gst-fx-stars'), grain:!!document.querySelector('.gst-fx-grain'), btn:!!document.getElementById('fxBtn'), badge:document.getElementById('fxN').hidden }));
is(!sh0.stars && sh0.grain && sh0.btn && sh0.badge, '셸 — 별빛 캔버스 없음(iframe 이 덮는다) · 그레인은 셸 한 벌 · 「효과」 단추 · 전부 켜짐이면 숫자 없음');
await ps.click('#fxBtn'); await ps.waitForTimeout(700);
const pn = await ps.evaluate(() => { const p = document.getElementById('gstFxPanel'); return { on:p && p.classList.contains('on'), sw:p ? p.querySelectorAll('input[data-k]').length : 0, ck:p ? p.querySelectorAll('input[data-k]:checked').length : 0, n:GST.FX_KEYS.length, title:p && p.querySelector('.fh b').textContent }; });
is(pn.on && pn.sw === pn.n && pn.ck === pn.n && pn.title === '효과', '「효과」 패널 — 스위치 ' + pn.sw + '개 · 전부 켜짐');
await ps.click('#gstFxPanel input[data-k="stars"]', { force:true }); await ps.waitForTimeout(500);
const hubF = ps.frames().find(f => /\/hub\//.test(f.url()));
const sy = await ps.evaluate(() => ({ ls:JSON.parse(localStorage.getItem('gst_fx') || '{}'), badge:document.getElementById('fxN').textContent }));
const fr = hubF ? await hubF.evaluate(() => ({ s:document.body.classList.contains('fx-stars'), t:document.body.classList.contains('fx-tilt'), grain:!!document.querySelector('.gst-fx-grain') })) : null;
if (process.env.DBG) console.log(JSON.stringify({sy, fr}));
is(sy.ls.stars === false && /^\d+\/\d+$/.test(sy.badge) && fr && !fr.s && fr.t, '별빛을 끄면 — 이 PC 에 남고 · 단추에 «켜진 수/전체» · 열린 탭(iframe)도 바로 꺼진다');
is(fr && !fr.grain, '탭 안(iframe)에는 그레인이 없다 — 셸의 한 벌이 덮는다(두 겹이면 화면이 탁해진다)');
await ps.keyboard.press('Escape'); await ps.waitForTimeout(400);
is(await ps.evaluate(() => !document.getElementById('gstFxPanel').classList.contains('on')), 'Esc 로 닫힌다');
await ps.evaluate(() => window.setLang && window.setLang('en')); await ps.waitForTimeout(300);
await ps.evaluate(() => { try{ sessionStorage.setItem('gst_lang','en'); }catch(e){} GST.fx.panel(true); }); await ps.waitForTimeout(400);
is(await ps.evaluate(() => document.querySelector('#gstFxPanel .fh b').textContent === 'Effects'), '언어 — 패널도 그 언어로(GST.FX_T)');
await ps.evaluate(() => GST.fx.reset());
is(pse.length === 0, 'JS 에러 0 (셸)' + (pse.length ? ' → ' + pse[0] : ''));
console.log('[10] 효과 없는 화면 — 고장 분석은 처음부터 효과·움직임을 걸지 않는다 (v193 · 사용자 「이 페이지만 기본값이 효과 아예 없게」)');
{ const pf = await ctx.newPage(); const pfe = []; pf.on('pageerror', e => pfe.push(e.message));
  /* 이 PC 에 «전부 켬»을 저장해 둔 사람 — 그래도 꺼져야 한다(설정과 무관) */
  await pf.addInitScript(() => { try{ const S = {}; ['stars','tilt','odometer','grain','sheen','reveal','draw'].forEach(k => S[k] = true); localStorage.setItem('gst_fx', JSON.stringify(S)); }catch(e){} });
  await pf.goto(BASE + '/fault/', { waitUntil:'domcontentloaded' }); await pf.waitForTimeout(2600);
  const fo = await pf.evaluate(() => ({ fx:[...document.body.classList].filter(c => /^fx-/.test(c)), motion:document.body.classList.contains('gst-motion'),
    layers:document.querySelectorAll('.gst-fx-stars,.gst-fx-grid,.gst-fx-grain,.gst-sprog').length, css:!!document.getElementById('gstFxCss'),
    on:GST.FX_KEYS.filter(k => GST.fx.on(k[0])).length, pageOff:GST.fx.pageOff(), anim:Chart.defaults.animation.duration,
    odo:GST.fx.odo(document.querySelector('.kpi .val') || document.body, '1'), rv:document.querySelectorAll('.gst-rv').length }));
  is(fo.pageOff && !fo.fx.length && fo.on === 0, '고장 분석 — 이 PC 에 켜 둔 효과가 있어도 전부 꺼짐(body.fx-… 0 · GST.fx.on 0)');
  is(!fo.motion && !fo.layers && !fo.css && !fo.rv, '움직임 층(gst-motion)·효과 층(별빛·격자·읽는 위치)·효과 CSS·스크롤 등장 — 하나도 안 만든다 (층 ' + fo.layers + ')');
  is(fo.anim === 0 && fo.odo === false, '차트는 바로 선다(애니메이션 0) · 오도미터도 안 돈다');
  await pf.mouse.move(400, 400); await pf.mouse.move(420, 410); await pf.waitForTimeout(200);
  is(await pf.evaluate(() => !document.querySelector('.gst-hov,.gst-tilt,.gst-sp-on') && !document.documentElement.classList.contains('gst-cur-in')), '마우스를 움직여도 카드에 표식이 안 붙는다(마우스 감시가 없다)');
  is(pfe.length === 0, 'JS 에러 0 (고장 분석)' + (pfe.length ? ' → ' + pfe[0] : ''));
  await pf.close();
  /* 다른 화면은 그대로 — 같은 저장값으로 자재 사용을 열면 효과가 선다 */
  const pm = await ctx.newPage(); await pm.goto(BASE + '/material/', { waitUntil:'domcontentloaded' }); await pm.waitForTimeout(1800);
  const mo = await pm.evaluate(() => ({ off:GST.fx.pageOff(), motion:document.body.classList.contains('gst-motion'), stars:document.body.classList.contains('fx-stars'), cv:!!document.querySelector('.gst-fx-stars') }));
  is(!mo.off && mo.motion && mo.stars && mo.cv, '다른 화면(자재 사용)은 지금 그대로 — 움직임·효과가 선다');
  await pm.evaluate(() => { try{ localStorage.removeItem('gst_fx'); }catch(e){} }); await pm.close();
  /* 셸 — 고장 분석 탭이 보이는 동안 셸의 그레인이 그 화면을 덮지 않는다 · 다른 탭으로 가면 돌아온다 · 패널이 그 사실을 적는다 */
  const sq = await ctx.newPage(); const sqe = []; sq.on('pageerror', e => sqe.push(e.message));
  await sq.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await sq.waitForTimeout(2500);
  await sq.evaluate(() => { const o = document.getElementById('loginOverlay'); if (o) o.remove(); });
  const g = () => sq.evaluate(() => { const gr = document.querySelector('.gst-fx-grain'); return { q:document.documentElement.classList.contains('gst-fx-quiet'), gd:gr ? getComputedStyle(gr).display : 'none-el' }; });
  const g0 = await g();
  await sq.evaluate(() => switchTab('fault')); await sq.waitForTimeout(400); const g1 = await g();
  await sq.evaluate(() => switchTab('material')); await sq.waitForTimeout(300); const g2 = await g();
  is(!g0.q && g0.gd !== 'none' && g1.q && g1.gd === 'none' && !g2.q && g2.gd !== 'none', '셸 — 고장 분석 탭에서만 그레인을 거둔다(' + [g0.gd, g1.gd, g2.gd].join(' → ') + ')');
  await sq.evaluate(() => GST.fx.panel(true)); await sq.waitForTimeout(300);
  is(await sq.evaluate(() => /고장 분석/.test((document.querySelector('#gstFxPanel .fs.fo') || {}).textContent || '')), '「효과」 패널 — «고장 분석은 언제나 효과 없이» 를 적는다(스위치와 무관)');
  is(sqe.length === 0, 'JS 에러 0 (셸 · 탭 전환)' + (sqe.length ? ' → ' + sqe[0] : ''));
  await sq.close(); }
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-fx: ${pass} 통과 · ${fail} 실패` : `\n✅ t-fx: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
