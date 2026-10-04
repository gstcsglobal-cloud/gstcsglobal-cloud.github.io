/* t-offline — 오프라인 판: 내보내기 화면이 «실제로» 조립·다운로드하고, 받은 두 파일이
   file:// 에서 네트워크 0 으로 온라인과 같은 숫자를 내는가 (v137)

   경로 그 자체를 검사한다 — /offline/ 을 띄워 버튼을 눌러 offline.html·data.js 를
   다운로드로 받고, 그 파일을 file:// 로 연다. 조립 규칙을 여기서 재현해 «비슷한 것»을
   만들면 검사가 검사 대상을 기준으로 삼는 꼴이 된다(t-upload 이 겪은 그 자리).

   지키는 것:
     ① 조립 완전성 — 배포 주소·외부 로드가 결과물에 한 글자도 없다 + 실행 중 http(s) 요청 0
     ② 동일성 — 같은 픽스처를 문 온라인(스텁) 페이지와 KPI 값이 완전히 같다
     ③ 페이지 정체성 — srcdoc 에서도 챗봇 출처·자동순회 page 가 페이지별로 갈린다(GST.pagePath)
     ④ 등급 — 오프라인 판은 viewer 로 고정(업로드·오프라인 버튼 숨김) · /offline/ 는 관리자 전용
     ⑤ 조용한 결손 금지 — data.js 가 잘리면 SNAP_SHORT 로 «멈추고», 표가 빠지면 그 페이지가
        SNAP_MISSING 을 «말한다» (빈 화면·조용한 0 이 아니라)

   ⚠ 실데이터를 쓰지 않는다 — 행은 전부 여기서 지어낸다(t-leak).
   ⚠ PostgREST 프로토콜은 여기서 보지 않는다(t-window·t-csvdb 몫) — 내보내기 화면의 읽기
     함수는 스텁 시트 경로로 돌린다. 담는 값은 어차피 «그 함수의 반환값 그대로»다.

     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-offline.mjs
*/
import fs from 'fs';
import os from 'os';
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
const ASOF = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 0));
const dAgo = n => new Date(ASOF.getTime() - n * 86400000);
/* 두 실행의 «지금»을 같은 순간에 못 박는다(clock.setFixedTime — 타이머는 그대로 돈다).
   tco 가 경과시간 기반 누적비용을 Date.now 로 재므로, 몇 분 차이로 만원 반올림 경계를
   넘어 841만↔842만 이 갈렸다(실측). 제품 결함이 아니라 검사의 비결정성이라 여기서 고친다. */
const FIX = new Date(ASOF.getTime() + 12 * 3600000);

/* ── 픽스처 (전부 지어낸 값 · t-kpi 와 같은 꼴) ─────────────────────────── */
const IH = ['NO','Country','Customer','Location','FAB','Line','Bay','Scrubber CODE','Scrubber S/N',
  'Scrubber Model','Burner Type','Scrubber type','Process','Detail Process(HQ)','Detail Process(Customer)',
  'Main Tool ID','Main Tool Maker','Main Tool Model','Receipt date','Setup date','Turn-on date',
  'Warranty date','Warranty In/Out','설비상태'];
const instCsv = () => { const rows=[IH];
  for (let i=1;i<=30;i++) rows.push([i,'GST TAIWAN SCRUBBER','Micron Memory Taiwan Co., Ltd.(F16)','TAICHUNG',
    i<=20?'F16':'F11','A3 M2 4F','B'+(i%9+1),'TWC'+i,'TWS'+i,'GST-1000','BURN-WET','SINGLE','ETCH','DRY','DRY-A',
    'MT'+i,'TEL','TEL-A','2023-03-01','2023-03-10','2023-03-20','2027-01-01','IN','Operation']);
  return csv(rows); };

const RH = ['인사','담당구분','구분','운영단위','고객사','지역','팀','단지','라인',
  '이름(영문)','이름(중문)','입사일','퇴사일','업무/직책','현장 인원여부','사원번호'];
const rosterCsv = () => { const rows=[RH]; let e=0;
  const one=(join,quit,camp)=>{ e++; rows.push([quit?'퇴직':'재직','Scrubber','해외','GST TAIWAN SCRUBBER',
    'Micron','Taichung','TW운영팀',camp,camp,'TW STAFF '+e,'陳'+e,join,quit||'','엔지니어','O','11'+(1000+e)]); };
  for (let i=0;i<10;i++) one('2021-04-01','', i%2?'F16':'F11');
  for (let i=0;i<6;i++)  one(ymd(dAgo(40+i)),'','F16');
  for (let i=0;i<2;i++)  one(ymd(new Date(Date.UTC(ASOF.getUTCFullYear(),ASOF.getUTCMonth(),3+i))),'','F16');
  one('2022-01-01', ymd(new Date(Date.UTC(ASOF.getUTCFullYear(),ASOF.getUTCMonth(),5))),'F11');
  return csv(rows); };

const eduCsv = () => { const rows=[
  ['','','','','법인 교육과정','','본사 교육과정',''],
  ['','','','','Basic','Veteran','Scrubber Lv.2','Scrubber Lv.3'],
  ['No','Site','인원','사원번호','교육완료일','교육완료일','교육완료일','교육완료일']];
  for (let e=1;e<=19;e++){ const done=(e%2===0)?'2024-06-01':'';
    rows.push([e,'F16','TW STAFF '+e,'11'+(1000+e),done,done,'','']); }
  return csv(rows); };

const WHF = ['제품군','운영단위','고객사','단지','라인','BAY','공정','세부공정','MODEL(자사)',
  '실적코드','상태','의뢰유형','작업단계','챔버','WRS NO','메인설비호기','제품코드','설비호기',
  '채널위치','S/N(IN)','S/N(OUT)','유/무상','알람유형','현상','원인','조치','세부조치내용',
  '작업시작일','작업종료일','작업시작시간','작업종료시간','실적등록일','출하일자',
  '총 이동시간(분)','작업시간(분)','작업공수','작업자','작업자수'];
const wkCsv = () => { const rows=[WHF]; let n=0;
  const one=(stage,days,man,cause,pf,u)=>{ n++; const d=ymd(dAgo(days)); const k=u==null?(n%5+1):u;
    rows.push(['SCRUBBER','GST TAIWAN SCRUBBER','Micron Memory Taiwan Co., Ltd.(F16)','F16','F16','B1','ETCH','DRY',
      'GST-1000','R'+n,'완료','정기',stage,'A','W'+n,'MT'+n,'P1','TWC'+k,'L','TWS'+k,'',pf||'무상',
      '','',cause||'','','',d,d,'09:00','10:00',d,'','10','60',man,'STAFF','1']); };
  for (let i=0;i<7;i++) one('BM', 2+i, 60, 'PUMP', i<3?'유상':'무상');
  for (let i=0;i<4;i++) one('TBM',3+i, 120, '');
  for (let i=0;i<3;i++) one('반입',4+i, 90, '');
  for (let i=0;i<4;i++) one('BM', 60+i, 60, 'PUMP');
  one('BM',90,60,'PUMP','',1); one('BM',82,60,'PUMP','',1);          // 재방문
  [11,12].forEach(u=>{ one('TBM',200,120,'','',u); one('TBM',120,120,'','',u); });  // 주기 유도
  return csv(rows); };

const MHF = ['운영단위','고객사','수선실적번호','단지','라인','BAY','공정','세부공정',
  '메인설비호기','설비호기','챔버','S/N','W/O번호','모델명','자재코드','설비위치','자재위치',
  '사용수량','자재명','규격','교체사유','전유상교체일','전교체일','자재실적일자',
  '사용일(유상기준)','사용일(전교체일기준)','유/무상','무상사유','단가','재고체크여부','자재창고'];
const matCsv = () => { const rows=[MHF]; let n=0;
  const one=(pf,days,mat)=>{ n++; const d=ymd(dAgo(days));
    rows.push(['GST TAIWAN SCRUBBER','Micron Memory Taiwan Co., Ltd.(F16)','R'+n,'F16','F16','B1','ETCH','DRY',
      'MT'+n,'TWC'+((n%30)+1),'A','TWS'+((n%30)+1),'W'+n,'GST-1000','M'+(n%3),'POS','MP','1',mat,'SPEC','마모',
      '',ymd(dAgo(days+200)),d,'200','200',pf,'','0','Y','ST']); };
  for (let i=0;i<5;i++) one('유상',2+i,'O-RING');
  for (let i=0;i<3;i++) one('무상',3+i,'PUMP');
  for (let i=0;i<2;i++) one('',4+i,'FILTER');
  return csv(rows); };

const leaveCsv = () => { const rows=[['사원번호','이름','소속','항목','발생일','휴가시작일','휴가시작시간',
  '휴가종료일','휴가종료시간','휴가신청시간','비고']];
  for (let i=0;i<3;i++){ const d=ymd(new Date(Date.UTC(ASOF.getUTCFullYear(),ASOF.getUTCMonth(),10+i)));
    rows.push(['11'+(1001+i),'TW STAFF '+(1+i),'Micron','연차',d,d,'09:00',d,'18:00','8','']); }
  return csv(rows); };

/* CIP — 0행은 적용일자 띠, 헤더는 1행(SPEC.cip 규약). 항목은 FAB In 뒤의 «모르는 이름» 두 열. */
const cipCsv = () => csv([
  ['','','','','','','','','','','2025-01-01','2025-02-01',''],
  ['NO','Floor','Type','Model','PJT.','Scrubber S/N','Scrubber Code','Group','Detail','FAB In','CIP ITEM A','CIP ITEM B','Remark'],
  ['1','4F','GEN','GST-1000','PJ','TWS1','TWC1','G1','D1','2023-01-01','2025-01-10','Not yet',''],
  ['2','4F','GEN','GST-1000','PJ','TWS2','TWC2','G1','D1','2023-01-01','Not yet','Not yet',''],
  ['3','4F','GEN','GST-1000','PJ','TWS3','TWC3','G1','D1','2023-01-01','2025-01-12','N/A','']]);

/* ABP 크로스탭 — parseABP 가 읽는 모양: Month/Week 키 행 + 사이트 행 */
const abpCsv = () => csv([
  ['Month','1','2','3'],
  ['Micron(F16)','2','1','0'],
  ['Week','W01','W02',''],
  ['Micron(F16)','1','2','']]);

const SHEETS = { '891608329':instCsv(), '1213453343':rosterCsv(), '0':eduCsv(), '646668307':wkCsv(),
  '31302669':matCsv(), '262805841':leaveCsv(), '2123129719':cipCsv(), '1999732389':cipCsv(), '1263412805':abpCsv() };

/* ── 서버 + 스텁 ───────────────────────────────────────────────────────── */
const MIME = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.json':'application/json',
  '.png':'image/png', '.svg':'image/svg+xml', '.pptx':'application/octet-stream' };
const srv = http.createServer((rq, rs) => {
  let u = decodeURIComponent(rq.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.statusCode = 404; rs.end('nf'); return; }
  rs.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream');
  rs.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

/* t-kpi 의 STUB + 내보내기에 필요한 둘: loadMe(관리자) · 표 직접 읽기(원장·pm_adjust).
   csvTableRows 는 «요청한 열 머리글 한 줄»을 돌려준다 — 내보내기가 그걸 그대로 담고,
   오프라인 report 도 같은 것을 받으므로 두 실행이 구성상 같은 입력을 먹는다. */
const stub = role => '\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
  + 'GST.getSession=async function(){return {user:{email:"t@t"}};};GST.token=async function(){return "t";};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();'
  + 'if(GST._authOk)GST._authOk();return true;};'
  + 'GST.loadMe=async function(){GST._meApply({email:"t@t",can_write:' + (role==='admin') + ',role:"' + role + '"});return GST._me;};'
  /* cols 없이(=core 내부의 Import-gid 경로) 부르면 DB_OFF — 그래야 fetchCSVCached 가
     시트 픽스처로 떨어진다. report 의 원장 직접 호출(cols 있음)만 머리글 한 줄을 받는다. */
  + 'GST.csvTableRows=async function(t,cols){if(!cols)throw new Error("DB_OFF");return [String(cols).split(",")];};'
  + 'GST.db=async function(){return {from:function(tb){var q={};'
  + '["select","eq","order","limit","ilike","in"].forEach(function(m){q[m]=function(){return q;};});'
  + '["upsert","insert","update","delete"].forEach(function(m){q[m]=function(){return q;};});'
  + 'q.maybeSingle=q.single=function(){return q;};'
  + 'q.then=function(res,rej){return Promise.resolve({data:[],error:null}).then(res,rej);};return q;}};};';

const NM = ROOT + '/tests/node_modules/';
async function makeCtx(browser, role) {
  const ctx = await browser.newContext({ viewport:{width:1800,height:1100}, locale:'ko-KR', acceptDownloads:true });
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => {
    let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
    r.fulfill({ status:200, contentType:MIME[path.extname(f)]||'application/octet-stream', body:fs.readFileSync(f) });
  });
  // ⚠ 라우트에 호스트를 박는다 — t-kpi 처럼 host 없는 「assets/core.js」 패턴으로 두면
  //   내보내기 화면의 same-origin fetch('/assets/core.js')까지 잡아 «스텁이 든 core»가
  //   offline.html 에 담긴다. 조립물은 깨끗한 core + 저장소 shim 이어야 한다.
  await ctx.route('**gstcsglobal-cloud.github.io/assets/core.js*', r => r.fulfill({ status:200,
    contentType:'application/javascript', body: fs.readFileSync(ROOT+'/assets/core.js','utf8') + stub(role) }));
  await ctx.route('**/cdn.jsdelivr.net/**', r => {
    const u = r.request().url();
    if (u.includes('chart.umd')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM+'chart.js/dist/chart.umd.js','utf8') });
    if (u.includes('papaparse')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM+'papaparse/papaparse.min.js','utf8') });
    if (u.endsWith('.css')) return r.fulfill({ status:200, contentType:'text/css', body:'' });
    return r.fulfill({ status:200, contentType:'application/javascript', body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};' });
  });
  await ctx.route('**/spreadsheets/**', r => {
    const gid = (r.request().url().match(/gid=(\d+)/)||[])[1];
    r.fulfill({ status:200, contentType:'text/csv', body: SHEETS[gid] || '' });
  });
  await ctx.route('**supabase**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));
  return ctx;
}

const PAGES = ['/fault/','/material/','/pm/','/scrubber/','/tco/','/report/','/cip/','/hr/'];
const WAIT = p => p==='/report/' ? 9000 : 4500;
const kpiRead = fr => fr.evaluate(() => ({
  n: document.querySelectorAll('.kpi').length,
  v: [...document.querySelectorAll('.kpi .val')].map(e => e.textContent.replace(/\s+/g,' ').trim()) }));

const browser = await chromium.launch(PW);
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-off-'));

/* ═══ [1] 기준 실행 — 온라인(스텁) 페이지의 KPI 값 ═══ */
console.log('[1] 기준(온라인 스텁) KPI 수집');
const REF = {};
{
  const ctx = await makeCtx(browser, 'admin');
  for (const p of PAGES) {
    const pg = await ctx.newPage(); const pe = [];
    pg.on('pageerror', e => pe.push(e.message));
    await pg.clock.setFixedTime(FIX);
    await pg.goto(BASE + p, { waitUntil:'domcontentloaded' });
    await pg.waitForTimeout(WAIT(p));
    REF[p] = await kpiRead(pg);
    is(REF[p].n > 0, p + ' KPI 카드가 그려졌다 (' + REF[p].n + '장 · 값 ' + REF[p].v.length + '개)');
    is(pe.length === 0, p + ' JS 에러 없음' + (pe.length ? ' → ' + pe[0] : ''));
    await pg.close();
  }
  await ctx.close();
}

/* ═══ [2] 내보내기 — /offline/ 에서 실제 버튼으로 두 파일을 받는다 ═══ */
console.log('[2] /offline/ 내보내기');
{
  const ctx = await makeCtx(browser, 'admin');
  const pg = await ctx.newPage(); const pe = [];
  pg.on('pageerror', e => pe.push(e.message));
  await pg.goto(BASE + '/offline/', { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(1500);
  is(await pg.evaluate(() => document.getElementById('app').style.display !== 'none'), '관리자에게 화면이 열린다');

  const [d1] = await Promise.all([pg.waitForEvent('download'), pg.click('#btnHtml')]);
  await d1.saveAs(path.join(OUT, 'offline.html'));
  await pg.waitForTimeout(300);
  is((await pg.textContent('#progHtml')).includes('완료'), 'offline.html 조립 완료 메시지');

  const [d2] = await Promise.all([pg.waitForEvent('download'), pg.click('#btnData')]);
  await d2.saveAs(path.join(OUT, 'data.js'));
  await pg.waitForTimeout(300);
  is((await pg.textContent('#progData')).includes('완료'), 'data.js 내보내기 완료 메시지');
  const okRows = await pg.evaluate(() => [...document.querySelectorAll('#tbl tbody tr')].every(tr => tr.textContent.includes('✓')));
  is(okRows, '표 전부 ✓ (12개 — 9 gid + 원장 2 + pm_adjust)');
  is(pe.length === 0, '내보내기 JS 에러 없음' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();

  const html = fs.readFileSync(path.join(OUT, 'offline.html'), 'utf8');
  const data = fs.readFileSync(path.join(OUT, 'data.js'), 'utf8');
  is(!html.includes('gstcsglobal-cloud.github.io'), '조립물에 배포 주소가 0곳');
  is(!/<link[^>]+https:\/\//.test(html), '조립물에 외부 <link> 가 없다');
  is(html.includes('__OFFLINE_FILES'), '셸이 오프라인 모드 표식을 가진다');
  is(html.includes('GSTOFF.bootShell()'), '부트 호출이 담겼다');
  is(html.length > 3_000_000, '조립물 크기가 그럴듯하다 (' + (html.length/1048576).toFixed(1) + 'MB)');
  is(data.includes('__SNAP_META') && data.includes('__SNAP_PARTS'), 'data.js 형식');
  const counts = JSON.parse(data.match(/__SNAP_META=(\{.*?\});\n/)[1]).counts;
  is(Object.keys(counts).length === 12, '스냅샷 counts 12건 (실제 ' + Object.keys(counts).length + ')');
}

/* ═══ [3] file:// — 네트워크 0 · KPI 동일 · 챗봇/순회 정체성 ═══ */
console.log('[3] file:// 오프라인 실행');
{
  const ctx = await browser.newContext({ viewport:{width:1800,height:1100}, locale:'ko-KR' });
  const net = [];
  ctx.on('request', r => { if (/^https?:/.test(r.url())) net.push(r.url()); });
  const pg = await ctx.newPage(); const pe = [];
  pg.on('pageerror', e => pe.push(e.message));
  await pg.clock.setFixedTime(FIX);
  await pg.goto('file://' + path.join(OUT, 'offline.html'));
  await pg.waitForTimeout(5000);

  is(await pg.evaluate(() => !document.getElementById('loginOverlay')), '로그인 오버레이가 걷혔다');
  const chip = await pg.evaluate(() => (document.getElementById('gstSrcChip')||{}).textContent || '');
  is(chip.includes('오프라인 스냅샷') && chip.includes('기준'), '출처 배지가 스냅샷·기준 시각을 밝힌다 → ' + chip);
  is(await pg.evaluate(() => document.body.dataset.role) === 'viewer', '셸 등급이 viewer 로 고정');
  const hid = await pg.evaluate(() => ['uploadBtn','offlineBtn'].map(i => { const e=document.getElementById(i);
    return e ? getComputedStyle(e).display : 'none'; }));
  is(hid.every(d => d === 'none'), '업로드·오프라인 버튼이 숨었다 (' + hid.join(',') + ')');

  const TABS = await pg.evaluate(() => TABS.filter(tabOn).map(t => ({ id:t.id, path:t.path })));   // 조회자에게 보이는 탭(데모는 오프라인 판에 없다 · v146)
  const findFrame = async p => { for (const f of pg.frames()) { try {
    if (await f.evaluate(() => window.__PAGE_PATH).catch(()=>null) === p) return f; } catch(e){} } return null; };

  const OFF = {};
  for (const t of TABS) {
    await pg.evaluate(id => switchTab(id), t.id);
    await pg.waitForTimeout(WAIT(t.path));
    const fr = await findFrame(t.path);
    is(!!fr, t.path + ' srcdoc 프레임이 떴고 __PAGE_PATH 가 맞다');
    if (fr) OFF[t.path] = await kpiRead(fr);
  }
  for (const p of PAGES) {
    const a = JSON.stringify((REF[p]||{}).v), b = JSON.stringify((OFF[p]||{}).v);
    is(a === b, p + ' KPI 값이 온라인과 완전히 같다' + (a===b ? ' ('+(REF[p].v.length)+'개)' : '\n      온라인 ' + a + '\n      오프라인 ' + b));
  }

  /* 챗봇 — factPack 의 tab 이 페이지별로 갈리는가(= GST.pagePath 가 srcdoc 을 이겼는가) */
  const tabs = await pg.evaluate(async () => (await askFacts()).map(x => x.tab));
  is(new Set(tabs).size >= 4 && !tabs.includes('srcdoc'), '챗봇 출처 탭이 페이지별로 갈린다 → ' + [...new Set(tabs)].join(','));
  await pg.fill('#askInp', '재직');
  await pg.click('#askGo');
  await pg.waitForTimeout(1600);
  const mode = await pg.evaluate(() => (document.getElementById('askMode')||{}).textContent || '');
  is(mode.includes('기본 응답'), '챗봇이 로컬(기본 응답) 모드로 답한다 → ' + mode);
  const log = await pg.evaluate(() => (document.getElementById('askLog')||{}).textContent || '');
  is(log.trim().length > 10, '챗봇 답이 비어 있지 않다');

  /* 자동순회 문답 — gst-kiosk-q 에 frame 이 답하고 page 가 srcdoc 이 아니다 */
  const ka = await pg.evaluate(() => new Promise(res => {
    const h = e => { const d = e.data||{}; if (d.type === 'gst-kiosk-a') { window.removeEventListener('message', h); res(d); } };
    window.addEventListener('message', h);
    Object.values(frames).forEach(f => { try { f.contentWindow.postMessage({ type:'gst-kiosk-q', axis:'campus' }, '*'); } catch(e){} });
    setTimeout(() => res(null), 3000);
  }));
  is(ka && Array.isArray(ka.list), '자동순회 질의에 프레임이 답한다');
  is(ka && ka.page && ka.page !== 'srcdoc' && String(ka.page).includes('/'), '순회 답의 page 가 진짜 경로다 → ' + (ka && ka.page));

  /* 등급 전용 탭(주간현황(국내) 데모 · v146)은 오프라인 판에 없다 — 조회자 고정이라 탭이 안 보이고, 열려고 하면 «없다»고 말한다(던지지 않는다) */
  const demo = await pg.evaluate(() => { const t = TABS.find(x => x.roles); if (!t) return null;
    const b = document.querySelector('.tab[data-id="' + t.id + '"]'); let thrown = null;
    try { switchTab(t.id); } catch (e) { thrown = e.message; }
    const f = frames[t.id]; return { id:t.id, vis:b ? getComputedStyle(b).display !== 'none' : null, thrown, note:!!f && /오프라인 판에 없습니다/.test(f.srcdoc || '') }; });
  is(!!demo && demo.vis === false && !demo.thrown && demo.note, '데모 탭 — 오프라인 판에 없다: 탭이 안 보이고, 열어도 «없다»고 말한다 (' + JSON.stringify(demo) + ')');
  const rk = fs.readFileSync(path.join(OUT, 'offline.html'), 'utf8');
  is(!/주간 현황\(국내\) · CS Global Team/.test(rk), '조립물에 데모 화면(report-kr)이 들어가지 않았다');

  is(net.length === 0, 'http(s) 요청이 0건' + (net.length ? ' → ' + net.slice(0,3).join(' · ') : ''));
  const badErr = pe.filter(m => !/OFFLINE/.test(m));
  is(badErr.length === 0, 'JS 에러 없음' + (badErr.length ? ' → ' + badErr[0] : ''));
  await ctx.close();
}

/* ═══ [4] 음성 — 잘린 data.js 는 SNAP_SHORT 로 «멈춘다» ═══ */
console.log('[4] 잘린 data.js');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-off-cut-'));
  fs.copyFileSync(path.join(OUT, 'offline.html'), path.join(dir, 'offline.html'));
  const lines = fs.readFileSync(path.join(OUT, 'data.js'), 'utf8').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].startsWith('__SNAP_PARTS.push')) { lines.splice(i, 1); break; }
  fs.writeFileSync(path.join(dir, 'data.js'), lines.join('\n'));
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  await pg.goto('file://' + path.join(dir, 'offline.html'));
  await pg.waitForTimeout(4000);
  const body = await pg.evaluate(() => document.body.innerText || '');
  is(body.includes('SNAP_SHORT'), '잘린 데이터가 SNAP_SHORT 로 밝혀진다');
  is(body.includes('다시 내보내') || body.includes('열 수 없습니다'), '무엇을 하면 되는지 적는다');
  await ctx.close();
}

/* ═══ [5] 음성 — 표 하나가 빠지면 그 페이지가 SNAP_MISSING 을 «말한다» ═══ */
console.log('[5] 빠진 표');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-off-miss-'));
  fs.copyFileSync(path.join(OUT, 'offline.html'), path.join(dir, 'offline.html'));
  let txt = fs.readFileSync(path.join(OUT, 'data.js'), 'utf8');
  txt = txt.split('\n').filter(l => !(l.startsWith('__SNAP_PARTS.push') && l.includes('"31302669"'))).join('\n');
  txt = txt.replace(/"gid:31302669":\d+,?/, '');            // counts 에서도 지운다 — SNAP_SHORT 가 아니라 «그 표만 없음»
  fs.writeFileSync(path.join(dir, 'data.js'), txt);
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  await pg.goto('file://' + path.join(dir, 'offline.html'));
  await pg.waitForTimeout(4000);
  const TABS = await pg.evaluate(() => TABS.map(t => ({ id:t.id, path:t.path })));
  const mat = TABS.find(t => t.path === '/material/');
  await pg.evaluate(id => switchTab(id), mat.id);
  await pg.waitForTimeout(4000);
  let frTxt = '';
  for (const f of pg.frames()) { try {
    if (await f.evaluate(() => window.__PAGE_PATH).catch(()=>null) === '/material/')
      frTxt = await f.evaluate(() => document.body.innerText || ''); } catch(e){} }
  is(frTxt.includes('SNAP_MISSING') || frTxt.includes('스냅샷에 이 표가 없습니다'),
    '자재 페이지가 «조용한 0» 이 아니라 SNAP_MISSING 을 말한다');
  await ctx.close();
}

/* ═══ [6] /offline/ 은 관리자 전용 ═══ */
console.log('[6] 게이트');
{
  const ctx = await makeCtx(browser, 'viewer');
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/offline/', { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(1200);
  is(await pg.evaluate(() => document.getElementById('gate').style.display === 'block'), 'viewer 에게 잠긴다');
  is(await pg.evaluate(() => document.getElementById('app').style.display === 'none'), '본문이 안 열린다');
  await ctx.close();
}

await browser.close(); srv.close();
console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + '/' + (pass + fail) + ' 통과');
process.exit(fail ? 1 : 0);
