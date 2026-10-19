/* t-site — 사이트 상세(v167) → 글로벌 현황 «사이트별» 보기로 합쳤다(v198). 픽스처는 t-hub 과 같다(같은 자료를 두 화면이 같은 숫자로 세는지 본다).
   (아래 머리 주석은 t-hub 의 것을 그대로 가져왔다)
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
/* v170 회귀 — 설비상태가 빈 사이트 파일(실측 F16N): FAB In 만 있고 Turn-on 이 빈 5대는 «반입»이지 «가동»이 아니다 */
for (let i = 1; i <= 5; i++) { no++; inst.push([no, 'GST TAIWAN SCRUBBER', 'MICRON', 'LOC', 'F16N', 'L1', 'B1', 'TWN' + i, 'TWN' + i + 'S', 'GST-1000',
  'BURN', 'SINGLE', 'ETCH', 'DRY', 'DRY', 'MTN' + i, 'TEL', 'TEL-A', '2024-05-01', '', '', '2030-01-01', 'IN', '']); }
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
await pg.emulateMedia({ reducedMotion:'reduce' });
/* v198 — 사이트 상세는 글로벌 현황의 «사이트별» 보기로 합쳤다. 옛 주소(/site/?op=)는 그 보기로 넘어간다 */
await pg.goto(BASE + '/site/?op=' + encodeURIComponent('GST TAIWAN SCRUBBER'), { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(4000);
const kp = () => pg.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('#kpis .hb-kpi')).map(b => [b.dataset.k, b.querySelector('.num').textContent.replace(/,/g,'').trim()])));
const runD = () => pg.evaluate(() => (document.querySelector('#kpis .hb-kpi[data-k="run"] .d')||{}).textContent||'');
console.log('[0] 옛 주소 → 글로벌 현황 · 사이트별');
is(/\/hub\//.test(pg.url()) && /view=field/.test(pg.url()), '/site/?op= 는 /hub/?view=field&op= 로 넘어간다 (' + pg.url().replace(BASE,'') + ')');
is(await pg.evaluate(() => S.view === 'field' && S.op === 'GST TAIWAN SCRUBBER' && document.querySelector('#segView [aria-pressed="true"]').dataset.v === 'field'), '보기 = 사이트별 · 운영단위 = 대만');
console.log('[1] 숫자 — 글로벌 현황과 같은 함수(GST.ops)');
let K = await kp();
is(K.run === '28' && /35/.test(await runD()), '대만 반입 35 / 가동 28 — 상태 빈칸 5대는 반입만(Turn-on 이 비면 가동이 아니다) · 가동 ' + K.run + ' · ' + await runD());
const tr = await pg.evaluate(() => Array.from(document.querySelectorAll('#sdTrend rect.b')).map(b => +b.querySelector('title').textContent.split('· ')[1]));
is(tr.length === 26 && tr[25] === 12 && tr.slice(14, 25).every(v => v === 1), '26주 추이 — 이번 주 12 · 그 앞 11주는 1 (히트맵과 같다)');
is(K.warr === '3', '유상 전환 90일 3대');
is(+K.risk > 0, '고장 위험 설비가 잡힌다 (' + K.risk + ')');
await pg.click('#sdTrend rect.b[data-w="25"]'); await pg.waitForTimeout(400);
is(await pg.evaluate(() => document.querySelectorAll('.gov-body tbody tr').length) === 12, '이번 주 막대를 누르면 그 12건');
await pg.evaluate(() => GST._ovClose && GST._ovClose());
const wh = await pg.evaluate(() => Array.from(document.querySelectorAll('#cWhere .sd-hb button')).map(b => [b.querySelector('span').textContent, +b.querySelector('b').textContent]));
is(wh.length >= 1 && wh[0][0] === 'F16' && wh[0][1] === 23, '고장이 몰리는 곳(90일 · FAB) — F16 23건 (12 + 앞 11주 중 90일 안 11)');
await pg.click('#sdBy button[data-b="model"]'); await pg.waitForTimeout(200);
is(await pg.evaluate(() => document.querySelector('#cWhere .sd-hb button span').textContent) === 'GST-1000', '축을 «모델»로 바꾸면 모델별');
const st = await pg.evaluate(() => document.querySelector('#cState').textContent);
is(/Operation\s*28/.test(st) && /Set-up\s*2/.test(st) && /빈 설비 5대/.test(st), '설비 상태 — Operation 28 · Set-up 2 · 빈 상태 5대를 숫자로 밝힌다');
const rk = await pg.evaluate(() => document.querySelectorAll('#cRiskT tbody tr.c').length);
is(rk > 0, '고장 위험 설비 표 (' + rk + '줄)');
await pg.click('#cRiskT tbody tr.c'); await pg.waitForTimeout(300);
is(await pg.evaluate(() => /작업 이력/.test((document.querySelector('.gov h3,.gov .gov-title,.gov')||{}).textContent||'')), '줄을 누르면 그 설비 작업 이력');
await pg.evaluate(() => GST._ovClose && GST._ovClose());
if (process.env.HUB_SHOT) await pg.screenshot({ path: process.env.HUB_SHOT + '/site-light.png', fullPage:true });
console.log('[1b] FAB 칩 — 사이트별 보기의 카드 전부가 그 FAB 만');
is(await pg.evaluate(() => document.querySelectorAll('#sdFabs .sd-fab').length) === 3, 'FAB 칩 — 전체 · F16 · F16N');
await pg.click('#sdFabs .sd-fab[data-f="F16N"]'); await pg.waitForTimeout(400);
K = await kp();
is(K.run === '0' && /5/.test(await runD()), 'F16N 만 보면 반입 5 / 가동 0 (사용자 보고 v170 — 예전에는 5 / 5)');
is(await pg.evaluate(() => /F16N/.test(document.getElementById('scopeX').textContent)), '범위 칩이 «대만 · F16N» 이라 적는다');
await pg.click('#sdFabs .sd-fab[data-f=""]'); await pg.waitForTimeout(300);
is((await kp()).run === '28', '«전체 FAB» 로 돌아온다');
console.log('[2] 운영단위 바꾸기');
await pg.evaluate(() => { S.fab='F16'; });
await pg.click('#cPick [data-op="SEC Scrubber"]'); await pg.waitForTimeout(500); K = await kp();
is(K.run === '10' && /10/.test(await runD()) && await pg.evaluate(() => S.fab === ''), '국내 — 반납 2대는 안 센다(반입 10 / 가동 10) · FAB 칩은 «전체»로 돌아간다');
is(await pg.evaluate(() => { const b = document.getElementById('krWarn'); return !!b && /원장이 비어/.test(b.title); }), '국내 원장이 비면 머리에 ⚠ 하나로 알린다(v172)');
await pg.click('#cPick [data-op="GST CHINA(WUHAN) SCRUBBER"]'); await pg.waitForTimeout(500);
const tr2 = await pg.evaluate(() => Array.from(document.querySelectorAll('#sdTrend rect.b')).map(b => +b.querySelector('title').textContent.split('· ')[1]));
is(tr2.slice(14).every(v => v === 1), '우한 — 매주 1');
await pg.evaluate(() => window.setLang('en')); await pg.waitForTimeout(300);
is(await pg.evaluate(() => /Weekly failures/.test(document.querySelector('#cTrend h2').textContent)), '영어로 바뀐다');
is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
await pg.close();

console.log('[3] 전사 요약에서 넘어오기 — 고른 운영단위 그대로 · 같은 화면 안에서');
const ps = await ctx.newPage(); const pse = []; ps.on('pageerror', e => pse.push(e.message));
await ps.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await ps.waitForTimeout(3500);
await ps.evaluate(() => { const o = document.getElementById('loginOverlay'); if (o) o.remove(); });
await ps.click('.tab[data-id="hub"]'); await ps.waitForTimeout(3000);
const hub = ps.frames().find(f => /\/hub\//.test(f.url()));
await hub.click('#sigs .hb-sig[data-op*="WUHAN"]'); await hub.waitForTimeout(900);
/* v185 — 운영단위를 누르면 (지구본이 그 자리로 돈 뒤) 그 나라 지도로 들어간다. 셸 안은 움직임이 켜져 있어 «날아가는» 길을 탄다 */
is(await hub.evaluate(() => S.cc === 'CN' && /WUHAN/.test(S.op || '')), '셸 안(움직임 켜짐) — 우한을 누르면 날아간 뒤 중국 지도로 들어간다');
await hub.click('#goSite'); await hub.waitForTimeout(600);
is(await hub.evaluate(() => S.view === 'field' && /WUHAN/.test(S.op || '') && !!document.getElementById('sdTrend')), '「사이트 상세 →」 → 같은 화면의 사이트별 보기(우한)');
/* 옛 id — 다른 화면의 GST.goTab('site') · #tab=site 는 글로벌 현황 사이트별로 */
await hub.evaluate(() => { S.view='exec'; render(); });
await ps.evaluate(() => { sessionStorage.setItem('gst_site_sel','SEC Scrubber'); switchTab('site'); }); await hub.waitForTimeout(500);
is(await hub.evaluate(() => S.view === 'field' && S.op === 'SEC Scrubber'), '옛 «site» 탭 id → 글로벌 현황이 사이트별(넘긴 운영단위)로 바뀐다');
const tabs = await ps.evaluate(() => ({ bar:Array.from(document.querySelectorAll('.tab')).map(t => t.dataset.id).join(','), site:!!document.querySelector('#moreMenu [data-go="site"]') }));
is(tabs.bar === 'hub,report,fault,pm,cip,scrubber,material,tco,hr' && !tabs.site, '셸 — 사이트 상세 탭·더보기 항목이 없다 (' + tabs.bar + ')');
is(pse.length === 0, 'JS 에러 0 (셸)' + (pse.length ? ' → ' + pse[0] : ''));
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-site: ${pass} 통과 · ${fail} 실패` : `\n✅ t-site: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
