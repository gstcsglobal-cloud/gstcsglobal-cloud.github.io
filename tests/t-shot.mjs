/* t-shot — 「이미지 저장」(v185 · GST.pageShot). 지어낸 자료만(t-leak · t-hub 과 같은 픽스처).
   사용자: 「전체화면 이미지 저장버튼 만들어줘 — 이렇게 나오는 거 말고」(브라우저 전체 캡처 = 떠 있는 배지가 지도를 덮고 ·
   흐르는 띠가 잘리고 · KPI 한 장이 혼자 떨어지고 · 흐릿했다).
   지키는 것: ① 화면 «전체»(스크롤 아래까지)가 고배율로 나온다 ② 떠 있는 것(position:fixed)·단추 줄은 빠지고 본문은 그대로
   ③ 글꼴은 쓰인 조각만 넣는다 ④ 찍은 뒤 화면이 원래대로(차트 배율·클래스) ⑤ 멈추지 않는다(시간 제한 · 도구 못 받음)
   ⑥ 셸 «더보기»·팔레트·공통바에서도 된다 ⑦ KPI 다섯 장은 한 줄.
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-shot.mjs */
import fs from 'fs';
import path from 'path';
import os from 'os';
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
/* LANG 이 없는 상자에서는 Chromium 이 한글 파일 이름을 «download» 로 바꿔 받는다(t-edit 과 같은 처방 — 실제 PC 는 그렇지 않다) */
const browser = await chromium.launch(Object.assign({ env:Object.assign({}, process.env, { LANG:'C.UTF-8', LC_ALL:'C.UTF-8' }) }, PW));
const ctx = await browser.newContext({ viewport:{ width:1600, height:1100 }, locale:'ko-KR' });
/* 글꼴 CSS·조각은 배포 주소(github.io)로 실린다 — Pages 처럼 CORS 를 열어 둔다(다른 출처 시트는 GST._shotFontCSS 가 글자로 다시 읽는다) */
const MIME2 = Object.assign({ '.woff2':'font/woff2' }, MIME);
await ctx.route('**gstcsglobal-cloud.github.io/**', r => { let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
  r.fulfill({ status:200, contentType:MIME2[path.extname(f)] || 'application/octet-stream', headers:{ 'access-control-allow-origin':'*' }, body:fs.readFileSync(f) }); });
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

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-shot-'));
const pngSize = b => ({ w:b.readUInt32BE(16), h:b.readUInt32BE(20) });
/* 그림의 한 점 색 — 브라우저가 PNG 를 다시 읽어 잰다(노드에 PNG 해석기를 들이지 않는다) */
const pix = (page, pts) => page.evaluate(async P => { const b = GST._shotLast && GST._shotLast.blob; if(!b) return null;
  const bm = await createImageBitmap(b); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
  const g = c.getContext('2d'); g.drawImage(bm, 0, 0);
  return P.map(p => Array.from(g.getImageData(Math.round(p[0]), Math.round(p[1]), 1, 1).data)); }, pts);
const mag = c => c && c[0] > 220 && c[1] < 60 && c[2] > 220;   // 자홍(#FF00FF) — 화면 어디에도 안 쓰는 색

const pg = await ctx.newPage(); const pe = []; pg.on('pageerror', e => pe.push(e.message));
await pg.goto(BASE + '/hub/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(4200);

console.log('[1] KPI 다섯 장은 한 줄 — 혼자 떨어지는 장이 없다');
{
  const tops = await pg.evaluate(() => [...document.querySelectorAll('#kpis .hb-kpi')].map(b => b.offsetTop));
  is(tops.length === 5 && new Set(tops).size === 1, '넓은 화면(1600)에서 다섯 장이 한 줄 (' + tops.join(',') + ')');
  await pg.setViewportSize({ width:1100, height:1100 }); await pg.waitForTimeout(300);
  const t2 = await pg.evaluate(() => [...document.querySelectorAll('#kpis .hb-kpi')].map(b => b.offsetTop));
  is(new Set(t2).size === 2 && t2.filter(t => t === t2[0]).length === 3, '좁은 화면(1100)은 3 + 2 (' + t2.join(',') + ')');
  await pg.setViewportSize({ width:1600, height:1100 }); await pg.waitForTimeout(400);
}

console.log('[2] 글로벌 현황 «이미지 저장» — 화면 전체 · 고배율 · 떠 있는 것은 빠진다');
{
  /* 글로벌 현황에는 Chart.js 차트가 없다(지도·스파크는 SVG·캔버스 직접) — 차트 배율 되돌리기를 보려고 한 장 끼워 넣는다 */
  await pg.addScriptTag({ url:'/assets/vendor/chart.umd.min.js' });
  await pg.evaluate(() => { const cv = document.createElement('canvas'); cv.id = 'tChart'; const box = document.createElement('div'); box.style.cssText = 'height:160px';
    box.appendChild(cv); document.querySelector('.hb-card').appendChild(box);
    new Chart(cv, { type:'bar', data:{ labels:['a','b','c'], datasets:[{ data:[3,5,2] }] }, options:{ animation:false, responsive:true, maintainAspectRatio:false } }); });
  /* 떠 있는 자홍 상자(출처 배지·챗봇 자리) 하나와, 본문 카드 안의 자홍 점 하나 — 앞은 빠지고 뒤는 남아야 한다 */
  const geo = await pg.evaluate(() => {
    const f = document.createElement('div'); f.id = 'tFixed'; f.style.cssText = 'position:fixed;right:24px;bottom:24px;width:90px;height:90px;background:#FF00FF;z-index:99';
    document.body.appendChild(f);
    const card = document.querySelector('.hb-card'); const d = document.createElement('div'); d.id = 'tIn';
    d.style.cssText = 'width:30px;height:30px;background:#FF00FF;flex:none'; card.appendChild(d);
    const r = d.getBoundingClientRect();
    const sm = document.querySelector('#kpis .hb-kpi .v small').getBoundingClientRect();
    return { sm:[sm.left + scrollX, sm.top + scrollY, sm.width, sm.height], W:document.documentElement.clientWidth, H:Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), vh:innerHeight,
             inX:r.left + 15 + scrollX, inY:r.top + 15 + scrollY, fx:innerWidth - 24 - 45, fy:innerHeight - 24 - 45,
             dpr0:Object.values(Chart.instances).map(c => c.options.devicePixelRatio) };
  });
  is(geo.H > geo.vh + 200, '검사 화면이 한 화면보다 길다 (' + geo.H + ' > ' + geo.vh + ') — «아래까지»를 볼 수 있다');
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout:60000 }), pg.click('#shotBtn')]);
  const fp = path.join(process.env.SHOT_OUT || OUT, 'shot-hub.png'); await dl.saveAs(fp);
  const buf = fs.readFileSync(fp), sz = pngSize(buf), R = await pg.evaluate(() => { const r = GST._shotLast || {}; return { w:r.w, h:r.h, n:r.fontN, of:r.fontOf, miss:r.fontMiss, name:r.name }; });
  is(buf.slice(1, 4).toString() === 'PNG', 'PNG 파일로 받아진다 (' + Math.round(buf.length / 1024) + 'KB)');
  is(/^글로벌 현황_\d{4}-\d{2}-\d{2}_\d{4}\.png$/.test(dl.suggestedFilename()), '파일 이름 = 화면 이름_날짜_시각 (' + dl.suggestedFilename() + ')');
  is(sz.w === R.w && sz.w >= geo.W * 2 - 2, '가로는 화면 폭의 2배 (' + sz.w + ' ≥ ' + geo.W * 2 + ')');
  is(sz.h >= geo.H * 2 - 4, '세로는 «스크롤 아래까지» 화면 전체 (' + sz.h + ' ≥ ' + geo.H * 2 + ')');
  is(R.n > 0 && R.miss === 0 && R.n < R.of, '글꼴은 쓰인 조각만 넣는다 (' + R.n + '/' + R.of + ' · 실패 ' + R.miss + ')');
  const P = await pix(pg, [[geo.inX * 2, geo.inY * 2], [geo.fx * 2, geo.fy * 2], [40, 40]]);
  is(mag(P[0]), '본문(카드 안)은 그림에 그대로 남는다');
  /* 첫 KPI 의 단위 글자(「대」) 자리 — 화면과 같은 자리에 글자가 있어야 한다(줄이 넘어가면 그 자리는 빈 카드 바탕이다) */
  const ink = await pg.evaluate(async R => { const b = GST._shotLast.blob, bm = await createImageBitmap(b);
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0);
    const d = g.getImageData(Math.round(R[0] * 2), Math.round(R[1] * 2), Math.max(1, Math.round(R[2] * 2)), Math.max(1, Math.round(R[3] * 2))).data;
    let lo = 999, n = 0; const L = []; for(let i = 0; i < d.length; i += 4){ const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; L.push(l); if(l < lo) lo = l; }
    L.forEach(l => { if(l > lo + 60) n++; }); return { n, of:L.length }; }, geo.sm);
  is(ink.n >= 8, 'KPI 단위(「대」)가 화면과 같은 자리에 찍힌다 — 다음 줄로 떨어지지 않았다 (글자 점 ' + ink.n + '/' + ink.of + ')');
  is(!mag(P[1]), '떠 있는 것(position:fixed — 출처 배지·챗봇 자리)은 그림에서 빠진다');
  const bgc = await pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
  is(P[2] && P[2][3] === 255, '바탕이 비어 있지 않다 (투명 PNG 가 아니다 · ' + bgc + ')');
  const after = await pg.evaluate(() => ({ cls:document.body.classList.contains('gst-shot'), busy:!!GST._shotBusy,
    dpr:Object.values(Chart.instances).map(c => c.options.devicePixelRatio) }));
  is(!after.cls && !after.busy, '찍은 뒤 화면이 원래대로 (gst-shot 없음 · 잠금 풀림)');
  is(JSON.stringify(after.dpr) === JSON.stringify(geo.dpr0), '차트 배율도 원래대로 (' + after.dpr.length + '개)');
  is(after.dpr.length === 1, '끼워 넣은 차트가 찍혔다 (차트 한 장)');
  await pg.evaluate(() => { document.getElementById('tFixed').remove(); document.getElementById('tIn').remove(); const c = Chart.getChart('tChart'); if(c) c.destroy(); document.getElementById('tChart').parentNode.remove(); });
}

console.log('[2b] 화면에서 한 줄인 글은 그림에서도 한 줄 — 단위(대·건)가 다음 줄로 떨어지지 않게');
{
  const m = await pg.evaluate(() => {
    const box = document.createElement('div'); box.id = 'tMulti'; box.style.cssText = 'width:120px;font-size:13px';
    box.textContent = '여러 줄로 감기는 긴 설명 문장입니다 여러 줄로 감기는 긴 설명 문장입니다'; document.querySelector('.hb-card').appendChild(box);
    const L = GST._shotLines(document.body);
    const o = { v:[...document.querySelectorAll('#kpis .hb-kpi .v')].map(e => e.hasAttribute('data-gst-1l')),
      sm:[...document.querySelectorAll('#kpis .hb-kpi .v small')].every(e => e.hasAttribute('data-gst-1l')),
      multi:box.hasAttribute('data-gst-1l'), n:L.length, ws:getComputedStyle(document.querySelector('#kpis .hb-kpi .v')).whiteSpace };
    L.forEach(e => e.removeAttribute('data-gst-1l')); box.remove(); o.left = document.querySelectorAll('[data-gst-1l]').length; return o; });
  is(m.v.length === 5 && m.v.every(Boolean) && m.sm, 'KPI 숫자 칸(숫자 + 단위)은 «한 줄»로 표시된다 (' + m.n + '칸)');
  is(!m.multi, '여러 줄로 감긴 글은 표시하지 않는다 (한 줄로 누르면 넘친다)');
  is(m.ws === 'normal' && m.left === 0, '화면에는 줄바꿈 규칙을 걸지 않는다 — 표식만 붙였다 뗀다 (열 폭이 흔들리지 않게)');
  const z = await pg.evaluate(() => {
    const n = document.createElement('div'); n.style.cssText = 'font-size:0;line-height:0'; n.textContent = '숨긴 긴 설명 문장'; document.querySelector('.hb-card').appendChild(n);
    const L = GST._shotLines(document.body); const o = { fs0:n.hasAttribute('data-gst-fs0'), css:GST._SHOT_NOWRAP };
    L.forEach(e => { e.removeAttribute('data-gst-1l'); e.removeAttribute('data-gst-fs0'); }); n.remove();
    const P = GST._shotProps(); o.props = ['font-feature-settings', 'counter-reset', 'counter-increment'].every(k => P.indexOf(k) >= 0); return o; });
  is(z.fs0 && /\[data-gst-fs0\]\{font-size:0 !important\}/.test(z.css), '글자 크기 0 으로 숨긴 글은 그림에서도 0 — 숨긴 경고문이 되살아나 옆 카드로 넘치지 않게');
  is(z.props, '옮길 속성에 브라우저 목록이 빠뜨린 font-feature-settings · counter-* 를 더한다 (비례 숫자 · 섹션 번호)');
}

console.log('[3] 찍는 동안의 모습 — 흐르는 띠는 한 벌만 펼치고, 단추 줄·안 보인 카드·굴러가는 숫자는 정리');
{
  const s = await pg.evaluate(() => {
    const st = document.createElement('style'); st.textContent = GST._SHOT_CSS; document.head.appendChild(st);
    const rv = document.createElement('div'); rv.className = 'gst-rv'; rv.textContent = 'x'; document.querySelector('.hb-wrap').appendChild(rv);
    document.body.classList.add('gst-shot');
    const tin = document.getElementById('tickIn'), cs = tin && getComputedStyle(tin);
    const vis = tin ? [...tin.querySelectorAll('.hb-tk')].filter(b => getComputedStyle(b).display !== 'none') : [];
    const ops = new Set(vis.map(b => b.dataset.tk));
    const o = { anim:cs && cs.animationName, wrap:cs && cs.flexWrap, vis:vis.length, uniq:ops.size, rvOp:getComputedStyle(rv).opacity,
      noshot:[...document.querySelectorAll('#saveDef,#shotBtn')].every(b => b.classList.contains('gst-noshot')) };
    document.body.classList.remove('gst-shot'); rv.remove(); st.remove(); return o;
  });
  is(s.anim === 'none' && s.wrap === 'wrap', '상태 띠는 멈추고 줄바꿈으로 펼친다 (잘린 띠가 남지 않게)');
  is(s.vis > 0 && s.vis === s.uniq, '상태 띠의 되풀이 사본은 빠지고 운영단위마다 한 번씩 (' + s.vis + ')');
  is(s.rvOp === '1', '아직 안 보인 카드(스크롤 등장)는 보인다');
  is(s.noshot, '「기본 화면으로 설정」·「이미지 저장」 단추는 그림에 안 들어간다 (gst-noshot)');
}

console.log('[4] 멈추지 않는다 — 시간 제한 · 도구를 못 받음');
{
  const r = await pg.evaluate(async () => {
    const real = window.htmlToImage.toBlob; window.htmlToImage.toBlob = () => new Promise(() => {});
    const t0 = Date.now(); const out = await GST.pageShot({ ms:600, download:false });
    window.htmlToImage.toBlob = real;
    return { out, ms:Date.now() - t0, busy:!!GST._shotBusy, cls:document.body.classList.contains('gst-shot'), toast:(document.getElementById('capToast') || {}).textContent || '' };
  });
  is(r.out === null && r.ms < 8000, '라이브러리가 멈춰도 시간 제한에서 끝난다 (' + r.ms + 'ms)');
  is(!r.busy && !r.cls, '끝나면 잠금·클래스를 푼다 (다음에 다시 누를 수 있다)');
  is(/오래 걸려/.test(r.toast), '무엇이 일어났는지 말한다 — «너무 오래 걸려 멈췄습니다»');
  const p2 = await ctx.newPage(); const e2 = [];  p2.on('pageerror', e => e2.push(e.message));
  await p2.route('**/html-to-image.js', r => r.fulfill({ status:404, body:'nf' }));
  await p2.goto(BASE + '/hub/', { waitUntil:'domcontentloaded' }); await p2.waitForTimeout(2500);
  const r2 = await p2.evaluate(async () => { const out = await GST.pageShot({ download:false }); return { out, toast:(document.getElementById('capToast') || {}).textContent || '', busy:!!GST._shotBusy }; });
  is(r2.out === null && /불러오지 못했습니다/.test(r2.toast) && !r2.busy, '도구를 못 받으면 그렇다고 말하고 끝난다 (자체 사본 → CDN 둘 다 실패)');
  await p2.close();
}

console.log('[5] 셸 — «더보기 › 이 화면 이미지로 저장» · 팔레트 · 공통바');
{
  const sp = await ctx.newPage(); const se = []; sp.on('pageerror', e => se.push(e.message));
  await sp.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await sp.waitForTimeout(5200);
  const lbl = await sp.evaluate(() => (document.getElementById('mShot') || {}).textContent || '');
  is(/이미지로 저장/.test(lbl), '더보기에 «이 화면 이미지로 저장»이 있다');
  await sp.click('#moreBtn'); await sp.waitForTimeout(150);
  const [d2] = await Promise.all([sp.waitForEvent('download', { timeout:60000 }), sp.click('#mShot')]);
  is(/^글로벌 현황_.*\.png$/.test(d2.suggestedFilename()), '지금 보이는 탭(글로벌 현황)이 찍힌다 (' + d2.suggestedFilename() + ')');
  const pal = await sp.evaluate(() => palItems('').some(a => a.id === 'act:shot'));
  is(pal, '검색(Ctrl K) 팔레트에서도 찾는다');
  const bar = await sp.evaluate(() => GST.barHTML({ caps:{ ppt:true }, state:{} }, 'en', 'act'));
  is(/data-gb="shot"[^>]*>Image</.test(bar), '공통바(PPT 옆)에 «이미지» — 언어를 따라간다');
  is(se.length === 0, 'JS 에러 0 (셸)' + (se.length ? ' → ' + se[0] : ''));
  await sp.close();
}
is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
is(ext.length === 0, '외부 요청 0 (도구·글꼴 모두 자체 사본)' + (ext.length ? ' → ' + ext[0] : ''));
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-shot: ${pass} 통과 · ${fail} 실패` : `\n✅ t-shot: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
