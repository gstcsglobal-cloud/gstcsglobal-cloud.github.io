/* t-hub — 통합 관제(/hub/) 첫 화면 (v165). 지어낸 자료만(t-leak).
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
const ext = []; ctx.on('request', rq => { const u = rq.url(); if (/^https?:/.test(u) && !/127\.0\.0\.1|gstcsglobal-cloud\.github\.io|cdn\.jsdelivr|supabase|spreadsheets/.test(u)) ext.push(u); });

const pg = await ctx.newPage(); const pe = []; pg.on('pageerror', e => pe.push(e.message));
await pg.emulateMedia({ reducedMotion:'reduce' });   // 숫자가 올라가는 연출 없이 최종값을 바로 읽는다
await pg.goto(BASE + '/hub/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3500);
const kpi = () => pg.evaluate(() => { const o = {}; document.querySelectorAll('#kpis .hb-kpi').forEach(b => { o[b.dataset.k] = +(b.querySelector('.num').textContent.replace(/,/g, '')); }); return o; });

console.log('[1] 숫자 — core 정본으로 센다');
let K = await kpi();
is(K.run === 48, '가동 = 설비상태 Operation 만 (대만 28 + 우한 10 + 국내 10 = 48 · 받은 ' + K.run + ')');
is(K.bm === 15, '이번 주 고장 = 수선실적 BM (대만 12 + 우한 1 + 국내 2 = 15 · 받은 ' + K.bm + ')');
is(K.pm === 5, '이번 주 PM = GST.PM 판정 (TBM 5 · 받은 ' + K.pm + ')');
is(K.warr === 3, '90일 안에 워런티가 끝나는 설비 3 (받은 ' + K.warr + ')');
is(K.risk > 0, '고장 위험 설비가 잡힌다 (설비 1~4 에 14일 안 재고장 · ' + K.risk + ')');
await pg.click('#kpis .hb-kpi[data-k="bm"]'); await pg.waitForTimeout(400);
const mrows = await pg.evaluate(() => { const b = document.querySelector('.gov-body'); return b ? b.querySelectorAll('tbody tr').length : -1; });
is(mrows === 15, '고장 카드를 누르면 «그 15건»이 목록으로 (받은 ' + mrows + ')');
await pg.evaluate(() => GST._ovClose && GST._ovClose());

console.log('[2] 신호등 — 평소보다 튄 곳이 «위험»으로 맨 위');
const sig = await pg.evaluate(() => Array.from(document.querySelectorAll('#sigs .hb-sig')).map(b => ({ op:b.dataset.op, st:(b.querySelector('.hb-dot').className.match(/\b(bad|warn|ok)\b/) || [])[1], bm:+b.querySelector('.bm').textContent })));
is(sig.length === 3 && sig[0].op === 'GST TAIWAN SCRUBBER' && sig[0].st === 'bad' && sig[0].bm === 12, '대만(이번 주 12 · 평소 1)이 위험으로 첫 줄');
is(sig.find(s => /WUHAN/.test(s.op)).st === 'ok', '우한(평소대로 1)은 정상');
const heat = await pg.evaluate(() => { const rl = Array.from(document.querySelectorAll('#heat .rl')); const i = rl.findIndex(e => /TAIWAN/.test(e.textContent));
  const cells = Array.from(document.querySelectorAll('#heat .hb-cell[data-r="' + i + '"]')); return cells.map(c => +(c.textContent || 0)); });
is(heat.length === 12 && heat[11] === 12 && heat.slice(0, 11).every(v => v === 1 || v === 0), '히트맵 대만 줄 — 마지막 칸 12 · 나머지는 평소(1)');

console.log('[3] 지도 — 벡터 세계 지도 · 나라를 누르면 그 나라 지도 (v171)');
await pg.waitForTimeout(800);
const map = await pg.evaluate(() => ({ paths:document.querySelectorAll('#mapS path.ct').length, has:[...document.querySelectorAll('#mapS path.has')].map(p => p.dataset.cc).sort().join(','),
  bub:document.querySelectorAll('#bubs .hb-bub').length, canvas:getComputedStyle(document.getElementById('mapC')).display }));
is(map.paths > 200 && map.canvas === 'none', '나라 경계를 벡터로 그린다(점지도 캔버스는 숨김 · ' + map.paths + '개 나라)');
is(map.has === 'CN,KR,TW' && map.bub === 3, '설비가 있는 나라(중국·한국·대만)가 칠해지고 운영단위 원 3개 (' + map.has + ')');
is(ext.length === 0, '외부 요청 0 — 지도 모양은 저장소 파일(assets/geo)' + (ext.length ? ' → ' + ext[0] : ''));
/* v178 사용자 보고 「전체로 잡았는데 안 나온다」 — 전세계 화면에도 분포(국가 · 고객사)가 서야 한다 */
const wd = await pg.evaluate(() => { const cd = document.getElementById('cdist');
  return { vis:getComputedStyle(cd).display !== 'none', h:[...cd.querySelectorAll('h4')].map(h => h.textContent),
    sum:[...cd.querySelectorAll('div:first-child button b')].reduce((a, b) => a + +b.textContent.replace(/,/g,''), 0),
    run:+document.querySelector('#kpis .hb-kpi[data-k="run"] .num').textContent.replace(/,/g,'') }; });
is(wd.vis && wd.h[0] === '국가 분포' && wd.h[1] === '고객사 분포' && wd.sum >= wd.run, '전세계 화면 — 국가 분포 · 고객사 분포가 선다(합 ' + wd.sum + ' ≥ 가동 ' + wd.run + ')');
await pg.click('#bubs .hb-bub[aria-label^="GST TAIWAN"]'); await pg.waitForTimeout(1200);   // 대만은 원이 나라를 덮는다 — 사람처럼 원을 누른다
const tw = await pg.evaluate(() => ({ title:document.getElementById('mapTitle').textContent, back:!document.getElementById('mapBack').hidden,
  rg:document.querySelectorAll('#mapS path.rg').length, rgHas:[...document.querySelectorAll('#mapS path.rg.has')].length,
  bubs:[...document.querySelectorAll('#bubs .hb-bub')].map(b => b.getAttribute('aria-label')),
  reg:[...document.querySelectorAll('#cdist > div:first-child button')].map(b => [b.querySelector('span').textContent, +b.querySelector('b').textContent.replace(/,/g,'')]),
  cus:[...document.querySelectorAll('#cdist > div:last-child button')].map(b => +b.querySelector('b').textContent.replace(/,/g,'')),
  note:document.getElementById('mapNote').textContent,
  run:+document.querySelector('#kpis .hb-kpi[data-k="run"] .num').textContent.replace(/,/g,''), sig:document.querySelectorAll('#sigs .hb-sig').length }));
is(/대만/.test(tw.title) && tw.back && tw.rg === 21, '대만을 누르면 대만 지도(행정구역 21) · 「← 전세계」 (' + tw.title + ')');
is(tw.rgHas === 1 && tw.bubs.length === 1 && /TAINAN/.test(tw.bubs[0]), 'TAINAN 은 행정구역 이름으로 저절로 놓인다(원 하나 · 그 구역만 칠해진다)');
const regSum = tw.reg.reduce((a, r) => a + r[1], 0), cusSum = tw.cus.reduce((a, v) => a + v, 0);
is(tw.reg.some(r => /Tainan|타이난|台南|臺南/.test(r[0]) && r[1] === 10) && tw.reg.some(r => /미지정/.test(r[0]) && r[1] === 20) && regSum === 30 && cusSum === 30,
   '지역 분포 = 타이난 10 + 위치 미지정 20 · 고객사 분포 합 30 — 못 놓은 설비도 버리지 않는다');
is(/지도에 못 놓은 곳/.test(tw.note) && /LOC 20/.test(tw.note), '못 놓은 값과 대수를 밝힌다 (' + tw.note.slice(0, 40) + ')');
is(tw.run === 28 && tw.sig === 1, '모든 칸이 그 나라만 — 가동 28 · 신호등 1곳');
await pg.click('#cdist > div:first-child button'); await pg.waitForTimeout(400);
is(await pg.evaluate(() => document.querySelectorAll('.gov-body tbody tr').length) >= 10, '분포 막대를 누르면 그 설비 목록');
await pg.evaluate(() => GST._ovClose && GST._ovClose());
if (process.env.HUB_SHOT) await pg.screenshot({ path: process.env.HUB_SHOT + '/hub-tw.png', fullPage:true });
await pg.click('#mapBack'); await pg.waitForTimeout(800);
is(await pg.evaluate(() => [...document.querySelectorAll('#cdist h4')].map(h => h.textContent).join('|') === '국가 분포|고객사 분포'),
   '「← 전세계」 — 분포가 나라 것(지역)으로 남지 않고 국가 · 고객사로 돌아온다');
/* 설비 0대인 나라에 들어가면 빈 머리글만 남던 자리 — «자료 없음»을 적는다. ⚠ CSS(display:grid)가 hidden 을 이기지 않는지도 본다 */
const zero = await pg.evaluate(() => { const keep = D.inst; D.inst = []; S.cc = 'TW'; drawCountry(document.getElementById('mapS'));
  const cd = document.getElementById('cdist'), t = cd.textContent; D.inst = keep; S.cc = '';
  cd.hidden = true; const hid = getComputedStyle(cd).display === 'none'; cd.hidden = false; return { t, hid }; });
is(/자료 없음/.test(zero.t) && zero.hid, '설비 0대 — 분포 칸이 «자료 없음» · hidden 이면 정말 숨는다 (' + zero.t.slice(0, 30) + ')');
await pg.evaluate(() => render()); await pg.waitForTimeout(600);
is(await pg.evaluate(() => document.querySelectorAll('#mapS path.ct').length > 200 && +document.querySelector('#kpis .hb-kpi[data-k="run"] .num').textContent === 48), '「← 전세계」 — 세계 지도와 전체 숫자(가동 48)로 돌아온다');

console.log('[4] 구분 전환이 모든 칸에 걸린다');
await pg.click('#segRegion button[data-r="os"]'); await pg.waitForTimeout(500); K = await kpi();
const sigOs = await pg.evaluate(() => document.querySelectorAll('#sigs .hb-sig').length);
is(K.run === 38 && K.bm === 13 && sigOs === 2, '해외 — 가동 38 · 고장 13 · 신호등 2곳 (받은 ' + K.run + '·' + K.bm + '·' + sigOs + ')');
await pg.click('#segRegion button[data-r="kr"]'); await pg.waitForTimeout(500); K = await kpi();
is(K.run === 10 && K.bm === 2, '국내 — 가동 10(반납은 안 셈) · 고장 2 (받은 ' + K.run + '·' + K.bm + ')');
const fall = await pg.evaluate(() => { const b = document.getElementById('krWarn'); return { head:document.getElementById('asof').textContent, title:b ? b.title : '' }; });
await pg.click('#krWarn'); await pg.waitForTimeout(250);
const fallM = await pg.evaluate(() => (document.querySelector('.gov-body') || {}).textContent || '');
await pg.evaluate(() => GST._ovClose && GST._ovClose());
is(/원장이 비어/.test(fall.title) && /원장이 비어/.test(fallM) && !/원장이 비어/.test(fall.head.replace('⚠', '')),
  '국내 알람 원장이 비면 머리에 ⚠ 하나 — 누르면 «수선실적으로 집계 중» (글로 늘어놓지 않는다 · v172)');
is(/^\d{4}-\d\d-\d\d 기준/.test(fall.head) && !/마지막 날|W\d\d/.test(fall.head), '머리는 «날짜 기준»만 — 「(자료의 마지막 날) · W41」 같은 설명이 없다 (' + fall.head + ')');
/* 설치현황이 없는 법인(수선실적만 있는 곳 — 운영 실측 2026-10: 우한·허페이·시안·미국·일본·싱가포르)은
   «가동률 0%»가 아니라 «자료 없음»이다. 0% 로 적으면 경영진이 «그 법인 설비가 전부 섰다»로 읽는다. */
const noInst = await pg.evaluate(() => { const keep = { inN:D.inN, runN:D.runN }; D.inN = 0; D.runN = 0; drawKpis();
  const d = document.querySelector('#kpis .hb-kpi[data-k="run"] .d').textContent; Object.assign(D, keep); drawKpis(); return d; });
is(/설치현황 자료 없음/.test(noInst) && !/0%/.test(noInst), '반입이 0 이면 «가동률 0%»가 아니라 «설치현황 자료 없음» (' + noInst + ')');
await pg.click('#segRegion button[data-r="all"]'); await pg.waitForTimeout(400);

console.log('[5] 테마·언어 전환');
const SHOT = process.env.HUB_SHOT;   // 눈으로 볼 때만 — 캡처 경로(폴더)
if (SHOT) await pg.screenshot({ path: SHOT + '/hub-light.png', fullPage:true });
await pg.evaluate(() => document.body.classList.add('theme-slate')); await pg.waitForTimeout(300);
if (SHOT) await pg.screenshot({ path: SHOT + '/hub-dark.png', fullPage:true });
await pg.evaluate(() => window.setLang('en')); await pg.waitForTimeout(400);
is(await pg.evaluate(() => /Global overview/.test(document.querySelector('[data-i="title"]').textContent)), '영어로 바뀐다');
is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
await pg.close();

console.log('[6] 셸 — 첫 탭은 «내 화면», 관제는 두 번째 (v172)');
const ps = await ctx.newPage(); const pse = []; ps.on('pageerror', e => pse.push(e.message));
await ps.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await ps.waitForTimeout(2500);
const sh = await ps.evaluate(() => ({ ids:Array.from(document.querySelectorAll('.tab')).map(b => b.dataset.id),
  src:(document.querySelector('iframe') || {}).src || '' }));
is(sh.ids[0] === 'home' && sh.ids[1] === 'hub' && /\/home\//.test(sh.src), '셸을 열면 «내 화면»이 먼저 · 관제는 그다음 탭 (' + sh.ids.slice(0, 3).join(' · ') + ')');
/* 지도 — 다른 탭에 가 있는 동안(숨김) 다시 그려도, 돌아오면 지도가 제대로 선다 (v170 · 사용자 보고: 회색 상자만 남았다) */
await ps.evaluate(() => { const o = document.getElementById('loginOverlay'); if (o) o.remove(); });
await ps.click('.tab[data-id="hub"]'); await ps.waitForTimeout(2500);
const hubF = ps.frames().find(f => /\/hub\//.test(f.url()));
await ps.click('.tab[data-id="cip"]'); await ps.waitForTimeout(800);
await hubF.evaluate(() => { render(); });                 // 숨겨진 채로 다시 그린다(자동 새로고침·테마 전환과 같은 길)
await ps.click('.tab[data-id="hub"]'); await ps.waitForTimeout(900);
const mp = await hubF.evaluate(() => ({ p:document.querySelectorAll('#mapS path.ct').length, b:document.querySelectorAll('#bubs .hb-bub').length, w:document.getElementById('map').getBoundingClientRect().width }));
is(mp.p > 200 && mp.b === 3 && mp.w > 300, '숨김 중에 다시 그려도 돌아오면 지도가 선다 (나라 ' + mp.p + ' · 원 ' + mp.b + ')');
/* 라이트/다크 스위치 — 라이트가 기본 · 고르면 다음에 열 때도 남고 페이지(iframe)까지 간다 */
const th = async () => { const o = await ps.evaluate(() => ({ dark:document.body.classList.contains('theme-slate'), aria:document.getElementById('themeSw').getAttribute('aria-checked') }));
  const f = ps.frames().find(x => /\/hub\//.test(x.url())); o.fr = f ? await f.evaluate(() => document.body.classList.contains('theme-slate')) : null; return o; };
let T0 = await th();
is(!T0.dark && T0.aria === 'false', '기본은 라이트');
await ps.evaluate(() => { const o = document.getElementById('loginOverlay'); if (o) o.remove(); document.getElementById('themeSw').click(); }); await ps.waitForTimeout(600);
T0 = await th();
is(T0.dark && T0.aria === 'true' && T0.fr === true, '스위치를 누르면 다크 — 셸과 페이지 둘 다');
await ps.reload({ waitUntil:'domcontentloaded' }); await ps.waitForTimeout(3000);
T0 = await th();
is(T0.dark && T0.aria === 'true', '다시 열어도 다크가 남는다');
is(pse.length === 0, 'JS 에러 0 (셸)' + (pse.length ? ' → ' + pse[0] : ''));
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-hub: ${pass} 통과 · ${fail} 실패` : `\n✅ t-hub: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
