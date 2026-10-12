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

console.log('[1b] 자료 결함은 글로벌 현황에 «안» 선다 — 데이터 관리로 (v182 · 사용자 확정 「임원이 보는 전체 서머리」)');
/* 다른 화면이 남긴 품질 스냅샷(gst_dq_*)이 있어도 KPI 카드 · 확인 사항 · 이번 주 브리핑 어디에도 안 뜬다.
   신호 자체는 데이터 관리 «데이터 품질» 탭과 각 화면의 품질 팝업에 그대로 있다(t-dq · t-edit [28]) */
const dqv = await pg.evaluate(() => {
  localStorage.setItem('gst_dq_fault', JSON.stringify({ at:Date.now(), filt:'', items:[{ key:'bm_unknown', sev:'bad', label:'BM 미기재 행 12건', n:12, act:'x' }] }));
  localStorage.setItem('gst_dq_report', JSON.stringify({ at:Date.now(), filt:'', items:[{ key:'div_join', sev:'warn', label:'사업부 조인 실패', n:3, act:'x' }] }));
  render();
  const kp = Array.from(document.querySelectorAll('#kpis .hb-kpi'));
  return { keys:kp.map(b => b.dataset.k), kpTxt:document.getElementById('kpis').innerText, q:document.getElementById('queue').innerText,
    qS:document.getElementById('qS').textContent, b:(document.getElementById('blines') || {}).innerText || '' }; });
is(dqv.keys.join() === 'run,bm,pm,risk,warr', 'KPI 카드 다섯 — 가동 · 고장 · PM · 고장 위험 · 유상 전환 («자료 확인할 것» 카드 없음 · ' + dqv.keys.join() + ')');
is(!/자료|BM 미기재|조인/.test(dqv.kpTxt + dqv.q + dqv.qS + dqv.b), '품질 스냅샷이 있어도 확인 사항·브리핑·카드 어디에도 «자료» 이야기가 없다');
await pg.evaluate(() => { localStorage.removeItem('gst_dq_fault'); localStorage.removeItem('gst_dq_report'); render(); });

console.log('[1c] 확인 사항 | 브리핑 + 히트맵 — 5:5 · 확인 사항은 오른쪽 열 높이에 맞춰 스크롤 (v183 · 사용자 요청)');
const lay = await pg.evaluate(() => { const g = document.querySelector('.hb-grid2'), q = g.querySelector('.hb-qcard'), col = g.querySelector('.hb-col');
  const qr = q.getBoundingClientRect(), cr = col.getBoundingClientRect(), qs = document.getElementById('queue');
  /* 확인 사항을 일부러 길게 — 행 높이가 늘지 않고 목록 안에서 스크롤하는지 */
  const keep = qs.innerHTML; qs.innerHTML = keep + Array.from({ length:30 }, (_, i) => '<div class="hb-qr"><button class="hb-q">x' + i + '</button></div>').join('');
  const q2 = q.getBoundingClientRect(), r = { qw:qr.width, cw:cr.width, qh:qr.height, ch:cr.height, heatIn:!!col.querySelector('#heat'), briefIn:!!col.querySelector('#briefCard'),
    long:{ qh:q2.height, ch:col.getBoundingClientRect().height, sh:qs.scrollHeight, cl:qs.clientHeight, ov:getComputedStyle(qs).overflowY } };
  qs.innerHTML = keep; return r; });
is(lay.heatIn && lay.briefIn, '히트맵이 브리핑 «아래» 오른쪽 열에 선다');
is(Math.abs(lay.qw - lay.cw) <= 2, '두 열이 5:5 (' + Math.round(lay.qw) + ' · ' + Math.round(lay.cw) + ')');
is(Math.abs(lay.qh - lay.ch) <= 2, '확인 사항 카드 높이 = 오른쪽 열 높이 (' + Math.round(lay.qh) + ' · ' + Math.round(lay.ch) + ')');
is(Math.abs(lay.long.qh - lay.long.ch) <= 2 && lay.long.sh > lay.long.cl && lay.long.ov === 'auto', '목록이 길어도 행이 안 늘고 목록 안에서 스크롤한다 (' + Math.round(lay.long.qh) + ' · 내용 ' + lay.long.sh + ' > 보이는 ' + lay.long.cl + ')');

console.log('[2] 신호등 — 평소보다 튄 곳이 «위험»으로 맨 위');
const sig = await pg.evaluate(() => Array.from(document.querySelectorAll('#sigs .hb-sig')).map(b => ({ op:b.dataset.op, st:(b.querySelector('.hb-dot').className.match(/\b(bad|warn|ok)\b/) || [])[1], bm:+b.querySelector('.bm').textContent })));
is(sig.length === 3 && sig[0].op === 'GST TAIWAN SCRUBBER' && sig[0].st === 'bad' && sig[0].bm === 12, '대만(이번 주 12 · 평소 1)이 위험으로 첫 줄');
is(sig.find(s => /WUHAN/.test(s.op)).st === 'ok', '우한(평소대로 1)은 정상');
const heat = await pg.evaluate(() => { const rl = Array.from(document.querySelectorAll('#heat .rl')); const i = rl.findIndex(e => /TAIWAN/.test(e.textContent));
  const cells = Array.from(document.querySelectorAll('#heat .hb-cell[data-r="' + i + '"]')); return cells.map(c => +(c.textContent || 0)); });
is(heat.length === 12 && heat[11] === 12 && heat.slice(0, 11).every(v => v === 1 || v === 0), '히트맵 대만 줄 — 마지막 칸 12 · 나머지는 평소(1)');

/* 이번 주 브리핑(v180) — 카드가 «이미 센» 숫자를 문장으로. 새로 세지 않는다 · 움직임 줄이기면 타자기 없이 전문이 처음부터 */
const br = await pg.evaluate(() => ({ L:[...document.querySelectorAll('#blines li')].map(l => l.textContent), tw:!!document.querySelector('#blines .tw') }));
is(br.L.length >= 5 && /이번 주 고장 15건/.test(br.L[0]) && /GST TAIWAN — 평소의 12배 · 점검 권장/.test(br.L[1]) && /Warranty Out 전환 3대 — 유상 설비 증가/.test(br.L.join('|')) && !br.tw,
  '이번 주 브리핑 — 고장 15 · 가장 튄 곳 대만(평소의 12배) · Warranty Out 전환 3대(사용자 문구 · v188) · 타자기 없음(움직임 줄이기) (' + br.L.slice(0, 2).join(' / ') + ')');

console.log('[3] 지도 — 지구본이 기본(v180) · 원을 누르면 그 나라 지도 · 평면(벡터 세계 지도)으로 바꿀 수 있다');
await pg.waitForTimeout(800);
const gl = await pg.evaluate(() => ({ globe:document.getElementById('map').classList.contains('globe'), cv:getComputedStyle(document.getElementById('globe')).display,
  w:document.getElementById('globe').width, marks:GL.marks.map(m => m.g.op).sort().join('|'), svg:getComputedStyle(document.getElementById('mapS')).display,
  stats:document.querySelectorAll('#stats .hb-stat').length, dist:[...document.querySelectorAll('#cdist h4')].map(h => h.textContent).join('|') }));
is(gl.globe && gl.cv === 'block' && gl.w > 300 && gl.marks.split('|').length === 3 && gl.svg === 'none', '기본은 지구본 — 운영단위 원 3 · 평면 벡터 지도는 숨김 (' + gl.marks + ')');
is(gl.stats === 4 && gl.dist === '국가 분포|고객사 분포', '지구본에서도 통계 넷 · 국가·고객사 분포(평면과 같은 함수)');
const tp = await pg.evaluate(() => { const m = GL.marks.find(x => /TAIWAN/.test(x.g.op)); glFly(m.lat, m.lon, 0); glDraw(performance.now()); const r = GL.cv.getBoundingClientRect(); return { x:r.left + m.X, y:r.top + m.Y }; });
await pg.mouse.click(tp.x, tp.y); await pg.waitForTimeout(1000);
is(await pg.evaluate(() => S.cc === 'TW' && !document.getElementById('map').classList.contains('globe') && document.querySelectorAll('#mapS path.rg').length === 21 && document.getElementById('segMap').hidden),
  '지구본에서 대만 원을 누르면 대만 지도(행정구역 21) — 나라 지도에서는 지구본|평면 단추가 숨는다');
await pg.click('#mapBack'); await pg.waitForTimeout(600);
is(await pg.evaluate(() => document.getElementById('map').classList.contains('globe') && !S.cc), '「← 전세계」 — 지구본으로 돌아온다');
await pg.click('#segMap button[data-m="flat"]'); await pg.waitForTimeout(900);
is(await pg.evaluate(() => localStorage.getItem('gst_hub_map') === 'flat' && document.querySelector('#segMap button[data-m="flat"]').getAttribute('aria-pressed') === 'true'), '평면을 고르면 이 PC 에 기억한다');
const map = await pg.evaluate(() => ({ paths:document.querySelectorAll('#mapS path.ct').length, has:[...document.querySelectorAll('#mapS path.has')].map(p => p.dataset.cc).sort().join(','),
  bub:document.querySelectorAll('#bubs .hb-bub').length, canvas:getComputedStyle(document.getElementById('mapC')).display }));
is(map.paths > 200 && map.canvas === 'none', '나라 경계를 벡터로 그린다(점지도 캔버스는 숨김 · ' + map.paths + '개 나라)');
is(map.has === 'CN,KR,TW' && map.bub === 3, '설비가 있는 나라(중국·한국·대만)가 칠해지고 운영단위 원 3개 (' + map.has + ')');
is(ext.length === 0, '외부 요청 0 — 지도 모양은 저장소 파일(assets/geo)' + (ext.length ? ' → ' + ext[0] : ''));
const dupNm = await pg.evaluate(async () => { const out = [];
  for (const cc of ['CN','KR','TW','US','JP','SG']) { const j = await (await fetch(GST.geo.BASE + cc + '.json')).json();
    for (const L of ['ko','en','zh','ja']) { const seen = {}; j.f.forEach(f => { const n = GST.geo.admName(f, L); if (seen[n]) out.push(cc + ' ' + L + ' ' + n); seen[n] = 1; }); } }
  return out; });
is(dupNm.length === 0, '나라·언어마다 행정구역 이름이 하나씩 — 같은 이름이면 지도가 두 곳을 한 덩어리로 칠한다 (陝西·山西 = 「산시성」)' + (dupNm.length ? ' → ' + dupNm.slice(0, 3).join(' · ') : ''));
/* v188 사용자 보고 「싱가폴꺼 Woodlands 라고 넣었는데 안나오네」 — 행정구역 이름이 아닌 도시는 지도 위치(geo_places)에 한 번 등록하면 놓이고,
   그 점이 든 구역의 이름이 «읽히는» 이름이어야 한다(공개 자료의 한국어가 «노스 웨스트 케이프»·«…지구 사회 발전 이사회»였다) */
const sg = await pg.evaluate(async () => { const adm = await (await fetch(GST.geo.BASE + 'SG.json')).json(); adm.cc = adm.cc || 'SG';
  const PL = { WOODLANDS:{ lat:1.436, lng:103.786, label:'Woodlands', cc:'SG' } };
  const pl = GST.geo.placeOf({ loc:'Woodlands', campus:'Woodlands', fab:'F10A', cc:'SG' }, PL, adm), rg = pl && GST.geo.regionOf(pl.lng, pl.lat, adm);
  const nm = GST.geo.placeOf({ loc:'북서부', cc:'SG' }, {}, adm), no = GST.geo.placeOf({ loc:'Woodlands', cc:'SG' }, {}, adm);
  return { key:pl && pl.key, reg:rg && GST.geo.admName(rg, 'ko'), regEn:rg && GST.geo.admName(rg, 'en'), nm:nm && nm.key, no,
    bad:adm.f.map(f => GST.geo.admName(f, 'ko')).filter(n => /케이프|이사회/.test(n)) }; });
is(sg.key === 'WOODLANDS' && sg.reg === '북서부' && sg.regEn === 'North West', '싱가포르 Woodlands — 등록한 자리에 놓이고 북서부 구역으로 센다 (' + sg.key + ' · ' + sg.reg + ')');
is(sg.no === null, '등록하지 않은 도시 이름은 «위치 미지정» — 짐작해 놓지 않는다');
is(sg.nm === 'ADM:SG-03', '화면에 뜬 구역 이름(「북서부」)을 지역 칸에 적어도 놓인다 (' + sg.nm + ')');
is(sg.bad.length === 0, '싱가포르 구역 이름표에 엉뚱한 번역이 없다' + (sg.bad.length ? ' → ' + sg.bad.join(' · ') : ''));
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

console.log('[3b] 운영단위를 누르면 그 나라 지도로 들어가고 KPI 카드·분포·팝업이 그 운영단위로 (v178 · v185 사용자 요청)');
const runOf = () => pg.evaluate(() => +document.querySelector('#kpis .hb-kpi[data-k="run"] .num').textContent.replace(/,/g,''));
await pg.click('#sigs .hb-sig[data-op*="WUHAN"]'); await pg.waitForTimeout(700);
const sc = await pg.evaluate(() => ({ chip:(document.getElementById('scopeX') || {}).textContent || '', cc:S.cc, title:document.getElementById('mapTitle').textContent,
  back:!document.getElementById('mapBack').hidden, sigs:[...document.querySelectorAll('#sigs .hb-sig')].map(b => b.dataset.op),
  dsum:[...document.querySelectorAll('#cdist > div:last-child button b')].reduce((a, b) => a + +b.textContent.replace(/,/g,''), 0),
  want:D.groups.find(g => /WUHAN/.test(g.op)) }));
const wRun = await runOf();
is(sc.cc === 'CN' && /중국/.test(sc.title) && sc.back, '신호등에서 우한을 누르면 중국 지도로 들어간다 — 지구본·점 지도처럼 «위치만 이동»하지 않는다 (' + sc.title + ')');
is(/WUHAN/.test(sc.chip) && sc.sigs.length === 1 && /WUHAN/.test(sc.sigs[0]), '날짜 옆에 «우한 ✕» 칩 · 신호등은 그 나라 것만 (' + sc.chip + ')');
is(wRun === sc.want.runN && wRun < 48 && sc.dsum === sc.want.inN, 'KPI 가동 = 우한 ' + sc.want.runN + ' · 고객사 분포 합 = 우한 반입 ' + sc.want.inN + ' (받은 ' + wRun + '·' + sc.dsum + ')');
await pg.click('#kpis .hb-kpi[data-k="bm"]'); await pg.waitForTimeout(300);
const scBm = await pg.evaluate(() => ({ ops:[...document.querySelectorAll('.gov-body tbody tr')].map(tr => tr.children[1].textContent), card:+document.querySelector('#kpis .hb-kpi[data-k="bm"] .num').textContent }));
await pg.evaluate(() => GST._ovClose && GST._ovClose());
is(scBm.ops.length === scBm.card && scBm.ops.every(o => /WUHAN/.test(o)), '고장 카드 팝업도 우한 행만 — 카드 숫자 = 목록 줄 수 (' + scBm.card + ')');
await pg.click('#scopeX'); await pg.waitForTimeout(600);
is(await runOf() === 48 && !(await pg.$('#scopeX')) && await pg.evaluate(() => !S.cc && document.getElementById('mapBack').hidden),
  '칩의 ✕ «전체 보기» — 누름을 통째로 되돌린다: 나라에서도 나와 전체(가동 48) · 칩이 사라진다');
/* 나라를 «직접» 들어간 뒤 그 안에서 고른 운영단위는 ✕ 해도 나라에 남는다 — 사람이 들어간 나라를 칩이 빼앗지 않는다 */
await pg.click('#bubs .hb-bub[aria-label^="GST TAIWAN"]'); await pg.waitForTimeout(800);
await pg.evaluate(() => { const b = document.querySelector('#bubs .hb-bub'); if (b) b.click(); }); await pg.waitForTimeout(400);   // 나라 지도의 원 = 그 운영단위 + 설비 목록
await pg.evaluate(() => GST._ovClose && GST._ovClose());
const inTw = await pg.evaluate(() => ({ cc:S.cc, op:S.op, chip:!!document.getElementById('scopeX') }));
await pg.click('#scopeX'); await pg.waitForTimeout(500);
const afTw = await pg.evaluate(() => ({ cc:S.cc, op:S.op }));
is(inTw.cc === 'TW' && /TAIWAN/.test(inTw.op || '') && inTw.chip && afTw.cc === 'TW' && !afTw.op, '나라 지도 안에서 고른 운영단위의 ✕ — 고르기만 풀고 나라 지도는 그대로 (' + JSON.stringify(afTw) + ')');
await pg.click('#mapBack'); await pg.waitForTimeout(600);
/* 지구본 — 원뿐 아니라 이름표(「GST TAIWAN 12」)를 눌러도 그 나라로 (사용자 「지구본에 있는 거 눌러도 · 사이트 이름 눌러도」) */
await pg.evaluate(() => mapMode('globe')); await pg.waitForTimeout(700);
const lbp = await pg.evaluate(() => { const m = GL.marks.find(x => /TAIWAN/.test(x.g.op)); glFly(m.lat, m.lon, 0); glDraw(performance.now());
  const r = GL.cv.getBoundingClientRect(); return m.lb ? { x:r.left + m.lb[0] + m.lb[2] - 6, y:r.top + m.lb[1] + m.lb[3] / 2, dx:Math.hypot(m.lb[0] + m.lb[2] - 6 - m.X, m.lb[1] + m.lb[3] / 2 - m.Y), r:m.r } : null; });
is(!!lbp && lbp.dx > lbp.r + 9, '지구본 이름표 자리를 안다(원 밖 — 원의 판정 반경 밖에서 누른다)');
if (lbp) { await pg.mouse.click(lbp.x, lbp.y); await pg.waitForTimeout(900); }
is(await pg.evaluate(() => S.cc === 'TW' && /TAIWAN/.test(S.op || '')), '지구본에서 이름표를 누르면 그 나라 지도(대만)로 · 그 운영단위가 골라진다');
await pg.click('#mapBack'); await pg.waitForTimeout(500);
/* 상태 띠도 같은 함수(goOp) — 누르는 곳마다 결과가 갈리지 않는다 */
const tk = await pg.$('.hb-tk[data-tk*="TAIWAN"]');
if (tk) { await pg.evaluate(() => { const b = document.querySelector('.hb-tk[data-tk*="TAIWAN"]'); b && b.click(); }); await pg.waitForTimeout(600); }
is(!!tk && await pg.evaluate(() => S.cc === 'TW'), '상태 띠의 운영단위를 눌러도 그 나라 지도로');
await pg.click('#mapBack'); await pg.waitForTimeout(500);
await pg.evaluate(() => mapMode('flat')); await pg.waitForTimeout(500);

console.log('[3c] 글로벌 투어 — 지구본 → 나라 → 사이트 → 다음 나라 (v185 · 사용자 「자동순회를 글로벌 현황으로 · 영상처럼」)');
await pg.evaluate(() => { S.view = 'lead'; S.region = 'kr'; render(); }); await pg.waitForTimeout(400);
await pg.evaluate(() => tourStart(4, false)); await pg.waitForTimeout(900);
const t0 = await pg.evaluate(() => ({ on:TOUR.on, cls:document.body.classList.contains('hb-tour'), k:TOUR.steps[TOUR.i].k, globe:document.getElementById('map').classList.contains('globe'),
  steps:TOUR.steps.map(x => x.k + (x.cty ? ':' + x.cty : '')).join(' '), cap:document.getElementById('trCap').innerText, chap:document.getElementById('trChap').innerText,
  view:S.view, region:S.region }));
is(t0.on && t0.cls && t0.k === 'intro' && t0.globe, '시작하면 투어 화면(지구본 · 평면을 골라 둔 PC 에서도) · 첫 장면은 전사');
is(t0.steps === 'intro fly:TAIWAN map:TAIWAN fly:KOREA map:KOREA fly:CHINA map:CHINA', '장면 순서 — 설비가 많은 나라부터 «날아가기 → 나라 지도» (' + t0.steps + ')');
is(/전 세계 설비 현황/.test(t0.cap) && /\b3\b[\s\S]*국가/.test(t0.cap) && /50[\s\S]*반입 설비/.test(t0.cap) && /48[\s\S]*가동/.test(t0.cap) && /15[\s\S]*이번 주 고장/.test(t0.cap),
  '전사 장면 — 국가 3 · 반입 50 · 가동 48 · 이번 주 고장 15 (카드와 같은 숫자)');
is(t0.view === 'exec' && t0.region === 'all', '투어 중에는 전사 요약 · 전체 범위로 본다 (사람이 고른 운영 관리·국내는 끝나면 돌려준다)');
const tKo = await pg.evaluate(() => ({ brand:document.querySelector('#tour .tr-brand b').textContent, eb:(document.querySelector('#trCap .tr-eb') || {}).textContent || '' }));
is(/[가-힣]/.test(tKo.brand) && !/[A-Za-z]/.test(tKo.brand) && /[가-힣]/.test(tKo.eb) && !/[A-Za-z]/.test(tKo.eb),
  '한국어 화면의 투어 머리·전사 장면 머리는 한글이다 (사용자 「한글로 말해라」 — ' + tKo.brand + ' · ' + tKo.eb + ')');
await pg.evaluate(() => tourGo(1)); await pg.waitForTimeout(700);
const t1 = await pg.evaluate(() => ({ k:TOUR.steps[TOUR.i].k, cty:TOUR.cty, cap:document.getElementById('trCap').innerText, chapOn:(document.querySelector('#trChap .on') || {}).textContent }));
is(t1.k === 'fly' && t1.cty === 'TAIWAN' && t1.chapOn === '대만' && /대만/.test(t1.cap) && /30[\s\S]*반입 설비/.test(t1.cap) && /28[\s\S]*가동/.test(t1.cap) && /12[\s\S]*이번 주 고장/.test(t1.cap),
  '나라 장면 — 대만 반입 30 · 가동 28 · 이번 주 고장 12 (나라 장면 숫자도 같은 판정)');
await pg.evaluate(() => tourGo(2)); await pg.waitForTimeout(800);
const t2 = await pg.evaluate(() => ({ cc:S.cc, cap:document.getElementById('trCap').innerText, top:[...document.querySelectorAll('#trSide .tr-hb > div')].map(d => d.innerText.replace(/\s+/g, ' ')) }));
is(t2.cc === 'TW' && /사이트 분포/.test(t2.cap) && /2[\s\S]*사이트/.test(t2.cap), '나라 지도 장면 — 대만 지도로 들어가 사이트 2곳 (' + t2.cap.replace(/\s+/g, ' ').slice(0, 60) + ')');
is(t2.top.length === 2 && /LOC 20/.test(t2.top[0]) && /TAINAN 10/.test(t2.top[1]), '사이트 목록 — 지도에 못 놓은 설비도 빠지지 않는다(LOC 20 · TAINAN 10)');
await pg.waitForTimeout(3300);
const t3 = await pg.evaluate(() => ({ cap:document.getElementById('trCap').innerText, on:document.querySelectorAll('#bubs .hb-bub.tr-on').length, dim:document.querySelectorAll('#bubs .hb-bub.tr-dim').length }));
is(/LOC/.test(t3.cap) && /위치 미지정/.test(t3.cap) && /20[\s\S]*반입 설비/.test(t3.cap) && /66\.7[\s\S]*나라 안 비중/.test(t3.cap) && t3.on === 0 && t3.dim === 0,
  '사이트 장면 — 가장 큰 사이트부터(LOC 20 · 66.7%) · 위치 미지정이면 그렇게 적고 원을 흐리지 않는다');
await pg.waitForTimeout(3300);
const t4 = await pg.evaluate(() => ({ cap:document.getElementById('trCap').innerText, on:[...document.querySelectorAll('#bubs .hb-bub.tr-on')].map(b => b.getAttribute('aria-label')) }));
is(/TAINAN/.test(t4.cap) && /10[\s\S]*반입 설비/.test(t4.cap) && t4.on.length === 1 && /TAINAN/.test(t4.on[0]), '다음 사이트 — TAINAN 10 · 지도의 그 원만 밝힌다');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
const tE = await pg.evaluate(() => ({ on:TOUR.on, cls:document.body.classList.contains('hb-tour'), view:S.view, region:S.region, cc:S.cc, cap:document.getElementById('trCap').innerHTML,
  globe:document.getElementById('map').classList.contains('globe') }));
is(!tE.on && !tE.cls && tE.cap === '' && tE.view === 'lead' && tE.region === 'kr' && tE.cc === '' && !tE.globe, 'Esc — 투어가 끝나고 사람이 보던 화면(운영 관리 · 국내 · 평면)으로 돌아온다');
await pg.evaluate(() => { S.view = 'exec'; S.region = 'all'; render(); }); await pg.waitForTimeout(500);
/* 자료를 읽기 전에 온 요청은 «기다렸다가» 시작한다(셸이 탭을 막 열자마자 보낸다) */
const pend = await pg.evaluate(() => { const keep = D; D = null; tourStart(5, true); const p = JSON.stringify(TOUR.pend); D = keep; tourStop(false); return { p, after:TOUR.pend }; });
is(pend.p === '{"sec":5,"fromShell":true}' && pend.after === null, '자료를 읽는 중에 온 시작 요청은 보류했다가 load 끝에 시작한다 · 멈추면 보류도 지운다');

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

console.log('[6] 셸 — 첫 탭은 글로벌 현황 (v178 · 홈을 합쳤다)');
const ps = await ctx.newPage(); const pse = []; ps.on('pageerror', e => pse.push(e.message));
await ps.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await ps.waitForTimeout(2500);
const sh = await ps.evaluate(() => ({ ids:Array.from(document.querySelectorAll('.tab')).map(b => b.dataset.id),
  src:(document.querySelector('iframe') || {}).src || '' }));
is(sh.ids[0] === 'hub' && sh.ids.indexOf('home') < 0 && /\/hub\//.test(sh.src), '셸을 열면 글로벌 현황이 먼저 · 홈 탭은 없다(합쳤다) (' + sh.ids.slice(0, 3).join(' · ') + ')');
/* 지도 — 다른 탭에 가 있는 동안(숨김) 다시 그려도, 돌아오면 지도가 제대로 선다 (v170 · 사용자 보고: 회색 상자만 남았다) */
await ps.evaluate(() => { const o = document.getElementById('loginOverlay'); if (o) o.remove(); });
await ps.click('.tab[data-id="hub"]'); await ps.waitForTimeout(2500);
const hubF = ps.frames().find(f => /\/hub\//.test(f.url()));
/* 셸 안의 탭은 출처가 달라(배포 주소) 위 [3]에서 고른 «평면»을 모른다 — 평면부터 보고, 아래에서 지구본도 본다 */
await hubF.evaluate(() => mapMode('flat')); await ps.waitForTimeout(600);
await ps.click('.tab[data-id="cip"]'); await ps.waitForTimeout(800);
await hubF.evaluate(() => { render(); });                 // 숨겨진 채로 다시 그린다(자동 새로고침·테마 전환과 같은 길)
await ps.click('.tab[data-id="hub"]'); await ps.waitForTimeout(900);
const mp = await hubF.evaluate(() => ({ p:document.querySelectorAll('#mapS path.ct').length, b:document.querySelectorAll('#bubs .hb-bub').length, w:document.getElementById('map').getBoundingClientRect().width }));
is(mp.p > 200 && mp.b === 3 && mp.w > 300, '숨김 중에 다시 그려도 돌아오면 지도가 선다 (나라 ' + mp.p + ' · 원 ' + mp.b + ')');
/* 지구본도 같다 — 숨김 중(폭 0)에 그리면 캔버스가 1px 로 굳는다(v170 의 자리). 돌아오면 제 크기로 다시 그린다 */
await hubF.evaluate(() => mapMode('globe')); await ps.waitForTimeout(400);
await ps.click('.tab[data-id="cip"]'); await ps.waitForTimeout(600);
await hubF.evaluate(() => { render(); });
await ps.click('.tab[data-id="hub"]'); await ps.waitForTimeout(900);
const gm = await hubF.evaluate(() => ({ w:document.getElementById('globe').width, h:document.getElementById('globe').height, m:GL.marks.filter(m => m.X != null).length, g:document.getElementById('map').classList.contains('globe') }));
is(gm.g && gm.w > 300 && gm.h > 150 && gm.m >= 1, '지구본 — 숨김 중에 다시 그려도 돌아오면 제 크기로 선다 (' + gm.w + '×' + gm.h + ' · 보이는 원 ' + gm.m + ')');
await hubF.evaluate(() => mapMode('flat'));
/* 라이트/다크 스위치 — v178 부터 다크가 기본(사용자 확정) · 고르면 다음에 열 때도 남고 페이지(iframe)까지 간다 */
const th = async () => { const o = await ps.evaluate(() => ({ dark:document.body.classList.contains('theme-slate'), aria:document.getElementById('themeSw').getAttribute('aria-checked') }));
  const f = ps.frames().find(x => /\/hub\//.test(x.url())); o.fr = f ? await f.evaluate(() => document.body.classList.contains('theme-slate')) : null; return o; };
let T0 = await th();
is(T0.dark && T0.aria === 'true' && T0.fr === true, '기본은 다크 — 셸과 페이지 둘 다 (v178)');
await ps.evaluate(() => { const o = document.getElementById('loginOverlay'); if (o) o.remove(); document.getElementById('themeSw').click(); }); await ps.waitForTimeout(600);
T0 = await th();
is(!T0.dark && T0.aria === 'false' && T0.fr === false, '스위치를 누르면 라이트 — 셸과 페이지 둘 다');
await ps.reload({ waitUntil:'domcontentloaded' }); await ps.waitForTimeout(3000);
T0 = await th();
is(!T0.dark && T0.aria === 'false', '다시 열어도 라이트가 남는다 — 직접 고른 값이 기본값을 이긴다');
is(pse.length === 0, 'JS 에러 0 (셸)' + (pse.length ? ' → ' + pse[0] : ''));
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-hub: ${pass} 통과 · ${fail} 실패` : `\n✅ t-hub: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
