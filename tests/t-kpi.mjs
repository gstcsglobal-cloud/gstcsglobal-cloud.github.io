/* t-kpi — KPI 카드를 누르면 «그 숫자를 만든 행들»이 나오는가 (v133)

   무슨 일이 있었나. 사용자가 물었다 — 「KPI 카드 누르면 팝업으로 뭐 보이는기능은 지웠어?」
   지운 게 아니라 **한 번도 없었다**(전 이력 217개 커밋에서 0건). 그런데 theme.css 가 모든
   .kpi 에 cursor:pointer 를 걸어 두어, 실측 56장 중 48장이 «손가락 커서가 뜨고 눌리는
   느낌까지 나는데 아무 일도 안 하는» 카드였다 — 화면이 없는 기능을 있다고 말한 것이다.

   이 검사가 지키는 것 셋:
     ① 카드 숫자와 팝업 목록이 «같은 모집단»이다 — 두 식을 따로 두면 반드시 갈라진다
     ② 필터를 걸어도 둘이 함께 움직인다 (한쪽에만 걸리는 것이 이 저장소의 전형적 결함)
     ③ 손가락 커서가 뜨는 카드는 «실제로 무언가 한다» — 커서가 거짓말하지 않는다

   ⚠ 소스 검사로는 원리적으로 못 본다. 「카드가 43인데 명단이 41명」은 문법이 멀쩡하고
     숫자만 틀린다. 그리고 「CSS 셀렉터와 JS 핸들러가 같은 카드 집합인가」는 계산된
     스타일을 실제로 읽어야 안다.
   ⚠ 실데이터를 쓰지 않는다 — 행은 전부 여기서 지어낸다(t-leak).

     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-kpi.mjs
*/
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

/* 기준일을 «지난달 말일»로 못 박는다. 페이지의 마감 기능(setEnd('m','YYYY-MM'))을 그대로
   쓴다 — 그러면 asOf = 그 달의 말일이 되고, 오늘이 며칠이든 흔들리지 않는다.
   ⚠ 그냥 두면 asOf 는 «오늘»이다 — ENDM 은 사람이 고르는 값이라 기본이 빈 값이고,
     _endMDate()·_endWDate() 가 둘 다 null 이면 asOf=today 로 떨어진다.
   ⚠ 미래 날짜를 쓰면 안 된다 — asOf 가 오늘로 깎이면서(if(asOf>today)asOf=today) 픽스처가
     통째로 창 밖으로 나가 카드가 전부 0 이 된다. 실제로 그렇게 짰다가 kp4·kp5 가 0 이었다.
   ⚠ 마감 «입력»으로는 못 건다 — report 의 공통 필터 블록에는 #gf-to 가 뜨지 않고,
     load() 가 «입력이 없으면 F.dtTo=''» 로 지우므로 set('dtTo') 도 남지 않는다. */
const NOW   = new Date();
const ASOF  = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 0));   // 지난달 말일
const ENDM  = ASOF.getUTCFullYear() + '-' + pad(ASOF.getUTCMonth() + 1);
const dAgo = n => new Date(ASOF.getTime() - n * 86400000);

/* ── 설치현황 (해외 118열 양식의 «이름»만) ─────────────────────────────── */
const IH = ['NO','Country','Customer','Location','FAB','Line','Bay','Scrubber CODE','Scrubber S/N',
  'Scrubber Model','Burner Type','Scrubber type','Process','Detail Process(HQ)','Detail Process(Customer)',
  'Main Tool ID','Main Tool Maker','Main Tool Model','Receipt date','Setup date','Turn-on date',
  'Warranty date','Warranty In/Out','설비상태'];
const N_INST = 40;
const instCsv = () => {
  const rows = [IH];
  for (let i = 1; i <= N_INST; i++) rows.push([i, 'GST TAIWAN SCRUBBER',
    'Micron Memory Taiwan Co., Ltd.(F16)', 'TAICHUNG', i <= 24 ? 'F16' : 'F11', 'A3 M2 4F',
    'B' + (i % 9 + 1), 'TWC' + i, 'TWS' + i, 'GST-1000', 'BURN-WET', 'SINGLE',
    'ETCH', 'DRY', 'DRY-A', 'MT' + i, 'TEL', 'TEL-A',
    '2023-03-01', '2023-03-10', '2023-03-20', '2027-01-01', 'IN', 'Operation']);
  return csv(rows);
};

/* ── 인원현황 ─────────────────────────────────────────────────────────────
   재직 20명 · 이번 달 입사 3 · 이번 달 퇴사 2. 절반은 6개월 미만(LV1 대상).   */
const RH = ['인사','담당구분','구분','운영단위','고객사','지역','팀','단지','라인',
  '이름(영문)','이름(중문)','입사일','퇴사일','업무/직책','현장 인원여부','사원번호'];
const JOIN_M = 3, QUIT_M = 2, N_BASE = 20;
const rosterCsv = () => {
  const rows = [RH]; let e = 0;
  const one = (join, quit, camp) => { e++;
    rows.push([quit ? '퇴직' : '재직', 'Scrubber', '해외', 'GST TAIWAN SCRUBBER',
      'Micron', 'Taichung', 'TW운영팀', camp, camp,
      'TW STAFF ' + e, '陳' + e, join, quit || '', '엔지니어', 'O', '11' + (1000 + e)]); };
  // 오래된 재직자 (2년+) — LV2 대상
  for (let i = 0; i < 12; i++) one('2021-04-01', '', i % 2 ? 'F16' : 'F11');
  // 최근 입사 (6개월 미만) — LV1 대상
  for (let i = 0; i < N_BASE - 12; i++) one(ymd(dAgo(40 + i)), '', 'F16');
  // 이번 달 입사 (재직에도 든다 — 그래서 N_BASE 와 별개로 센다)
  for (let i = 0; i < JOIN_M; i++) one(ymd(new Date(Date.UTC(ASOF.getUTCFullYear(), ASOF.getUTCMonth(), 3 + i))), '', 'F16');
  // 이번 달 퇴사 (기준일 전에 나갔으므로 재직에는 안 든다)
  for (let i = 0; i < QUIT_M; i++) one('2022-01-01',
    ymd(new Date(Date.UTC(ASOF.getUTCFullYear(), ASOF.getUTCMonth(), 5 + i))), 'F11');
  return csv(rows);
};
const ACT_N = N_BASE + JOIN_M;   // 기준일 재직 = 오래된 12 + 최근 8 + 이번 달 입사 3

/* ── 교육현황 (3단 머리글 · 헤더가 r2) ────────────────────────────────── */
const eduCsv = () => {
  const rows = [
    ['', '', '', '', '법인 교육과정', '', '본사 교육과정', ''],
    ['', '', '', '', 'Basic', 'Veteran', 'Scrubber Lv.2', 'Scrubber Lv.3'],
    ['No', 'Site', '인원', '사원번호', '교육완료일', '교육완료일', '교육완료일', '교육완료일']];
  for (let e = 1; e <= N_BASE + JOIN_M + QUIT_M; e++) {
    // 짝수 번호만 이수 — 완료율이 100%도 0%도 아니게 (양쪽 끝은 버그를 가린다)
    const done = (e % 2 === 0) ? '2024-06-01' : '';
    rows.push([e, 'F16', 'TW STAFF ' + e, '11' + (1000 + e), done, done, '', '']);
  }
  return csv(rows);
};

/* ── 수선실적 ─────────────────────────────────────────────────────────────
   최근 30일 안 BM 9건 · TBM(PM) 4건 · 설치 3건(공수는 있으나 정비성 아님) ·
   30일 «밖» BM 5건(창 밖은 안 세어야 한다).                                 */
const WHF = ['제품군','운영단위','고객사','단지','라인','BAY','공정','세부공정','MODEL(자사)',
  '실적코드','상태','의뢰유형','작업단계','챔버','WRS NO','메인설비호기','제품코드','설비호기',
  '채널위치','S/N(IN)','S/N(OUT)','유/무상','알람유형','현상','원인','조치','세부조치내용',
  '작업시작일','작업종료일','작업시작시간','작업종료시간','실적등록일','출하일자',
  '총 이동시간(분)','작업시간(분)','작업공수','작업자','작업자수'];
const BM_30 = 9, TBM_30 = 4, INSTALL_30 = 3, BM_OLD = 5;
const MAN_BM = 60, MAN_TBM = 120, MAN_INS = 90;
const wkCsv = () => {
  const rows = [WHF]; let n = 0;
  const one = (stage, days, man, cause) => { n++; const d = ymd(dAgo(days));
    rows.push(['SCRUBBER', 'GST TAIWAN SCRUBBER', 'Micron Memory Taiwan Co., Ltd.(F16)',
      'F16', 'F16', 'B1', 'ETCH', 'DRY', 'GST-1000', 'R' + n, '완료', '정기', stage, 'A',
      'W' + n, 'MT' + n, 'P1', 'TWS' + ((n % N_INST) + 1), 'L', '', '', '무상',
      '', '', cause || '', '', '', d, d, '09:00', '10:00', d, '',
      '10', '60', man, 'STAFF', '1']);
  };
  for (let i = 0; i < BM_30; i++)      one('BM',  2 + i, MAN_BM,  'PUMP');
  for (let i = 0; i < TBM_30; i++)     one('TBM', 3 + i, MAN_TBM, '');
  for (let i = 0; i < INSTALL_30; i++) one('반입', 4 + i, MAN_INS, '');
  for (let i = 0; i < BM_OLD; i++)     one('BM',  60 + i, MAN_BM, 'PUMP');
  return csv(rows);
};
/* kp5 의 분자는 «30일 창 전 행»의 작업공수 합이다 — 설치 행도 든다. */
const MAN30 = BM_30 * MAN_BM + TBM_30 * MAN_TBM + INSTALL_30 * MAN_INS;

/* ── 셸 + 페이지를 그대로 띄운다 ──────────────────────────────────────── */
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

const browser = await chromium.launch(PW);
const NM = ROOT + '/tests/node_modules/';
const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
  + 'GST.getSession=async function(){return {user:{email:"t@t"}};};GST.token=async function(){return "t";};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();'
  + 'if(GST._authOk)GST._authOk();return true;};';
const SHEETS = { '891608329':instCsv(), '1213453343':rosterCsv(), '646668307':wkCsv(), '0':eduCsv() };

async function makeCtx() {
  const ctx = await browser.newContext({ viewport:{ width:1800, height:1200 }, locale:'ko-KR' });
  /* ⚠ 포괄 규칙을 «먼저» 등록한다 — Playwright 는 나중에 등록한 것을 먼저 본다. */
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => {
    let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
    r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) });
  });
  await ctx.route('**/assets/core.js', r => r.fulfill({ status:200, contentType:'application/javascript',
    body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB }));
  await ctx.route('**/cdn.jsdelivr.net/**', r => {
    const u = r.request().url();
    const send = (p, ct) => r.fulfill({ status:200, contentType:ct, body:fs.readFileSync(p, 'utf8') });
    if (u.includes('chart.umd')) return send(NM + 'chart.js/dist/chart.umd.js', 'application/javascript');
    if (u.includes('papaparse')) return send(NM + 'papaparse/papaparse.min.js', 'application/javascript');
    if (u.endsWith('.css')) return r.fulfill({ status:200, contentType:'text/css', body:'' });
    return r.fulfill({ status:200, contentType:'application/javascript',
      body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),'
         + 'onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};' });
  });
  await ctx.route('**/spreadsheets/**', r => {
    const gid = (r.request().url().match(/gid=(\d+)/) || [])[1];
    r.fulfill({ status:200, contentType:'text/csv', body: SHEETS[gid] || '' });
  });
  await ctx.route('**supabase**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));
  return ctx;
}

const ctx = await makeCtx();
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/report/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(9000);
/* 마감을 지난달로 못 박는다 — 페이지 자신의 기능이라 화면과 같은 길이다.
   여기가 어긋나면 아래 숫자들이 전부 «헛돈» 것이라, 원인을 못 짚고 헤매게 된다. */
await page.evaluate(m => window.setEnd && window.setEnd('m', m), ENDM);
await page.waitForTimeout(2800);

/* ── 도구: 카드를 누르고 «팝업이 말하는 수»를 읽는다 ────────────────── */
const cardText = id => page.evaluate(i => (document.getElementById(i) || {}).textContent || '', id);
const shut = () => page.evaluate(() => { try{ closeDrill(); }catch(e){}
  try{ GST._ovClose && GST._ovClose(); }catch(e){} });
const clickKpi = async id => {
  await shut();
  await page.evaluate(i => { const e = document.getElementById(i);
    (e.closest('.kpi') || e.parentElement).click(); }, id);
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const dm = document.getElementById('drillModal');
    if (dm && dm.style.display === 'flex') return { kind:'drill',
      title:(document.getElementById('drillTitle') || {}).textContent || '',
      sums:[...dm.querySelectorAll('.dsum .b')].map(b => ({
        n:(b.querySelector('.n') || {}).textContent || '', l:(b.querySelector('.l') || {}).textContent || '' })),
      rows:dm.querySelectorAll('#drillBody table tbody tr').length,
      body:(document.getElementById('drillBody') || {}).textContent || '' };
    const ov = document.querySelector('.gov');
    if (ov) return { kind:'rows', title:(ov.querySelector('.gov-h h4') || {}).textContent || '',
      sub:(ov.querySelector('.gov-sub') || {}).textContent || '',
      rows:ov.querySelectorAll('.gov-body tbody tr').length,
      last:[...(ov.querySelectorAll('.gov-body tbody tr') || [])].slice(-1)
             .map(tr => [...tr.children].map(td => td.textContent))[0] || [] };
    return { kind:'none' };
  });
};
const num = s => { const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };

console.log('[0] 렌더 · JS 에러 0');
is(errs.length === 0, 'JS 에러 없음' + (errs.length ? ' → ' + errs.slice(0, 3).join(' | ') : ''));
is(num(await cardText('kp1')) > 0, '카드에 실제 숫자가 찍혔다 (픽스처가 먹혔다)');

console.log('\n[1] 카드 숫자 = 팝업이 세는 수 (같은 모집단)');
{
  const c1 = num(await cardText('kp1')), m1 = await clickKpi('kp1');
  is(m1.kind === 'drill', 'kp1 을 누르면 팝업이 열린다 (실제 kind=' + m1.kind + ')');
  is(m1.title.indexOf(ymd(ASOF)) >= 0,
     `기준일이 픽스처의 전제(${ymd(ASOF)})와 같다 — 팝업 제목: ${m1.title}`);
  is(m1.sums.length && num(m1.sums[0].n) === c1,
     `kp1 재직 인원: 카드 ${c1} = 팝업 ${m1.sums.length ? m1.sums[0].n : '-'}`);
  is(c1 === ACT_N, `그 수가 픽스처의 재직 ${ACT_N}명과 같다 (실제 ${c1})`);
  is(m1.rows === c1, `명단 행수도 ${c1}줄 — 요약만 내고 명단이 없으면 «누구인지»를 못 본다 (실제 ${m1.rows})`);

  const t2 = await cardText('kp2'), m2 = await clickKpi('kp2');
  const j = num(t2.split('/')[0]), qq = num(t2.split('/')[1]);
  /* 팝업의 퇴사 부호는 U+2212(−) 라 ASCII 부호로 읽히지 않는다 — 크기로 견준다. */
  is(m2.kind === 'drill' && Math.abs(num(m2.sums[0].n)) === Math.abs(j)
     && Math.abs(num(m2.sums[1].n)) === Math.abs(qq),
     `kp2 입·퇴사: 카드 ${t2.trim()} = 팝업 ${m2.sums[0] && m2.sums[0].n}/${m2.sums[1] && m2.sums[1].n}`);
  is(Math.abs(j) === JOIN_M && Math.abs(qq) === QUIT_M,
     `픽스처의 이번 달 입사 ${JOIN_M} · 퇴사 ${QUIT_M} 과 같다 (실제 ${t2.trim()})`);
  is(/현장\(O\)/.test(m2.body),
     '카드(전원)와 차트(현장 O)의 모집단 차이를 팝업이 적는다 — 조용히 두면 「+3 인데 명단은 2명」이 된다');

  const c3 = await cardText('kp3'), m3 = await clickKpi('kp3');
  is(m3.kind === 'rows', 'kp3 은 표 하나짜리 목록으로 연다 (실제 ' + m3.kind + ')');
  const mm = m3.sub.match(/(\d+)\s*\/\s*대상\s*(\d+)/);
  is(!!mm, 'kp3 팝업이 «이수 a / 대상 b» 를 적는다 (실제 ' + m3.sub + ')');
  if (mm) is(Math.round(+mm[1] / +mm[2] * 100) + '%' === c3.trim(),
     `kp3 완료율: 카드 ${c3.trim()} = 이수 ${mm[1]} ÷ 대상 ${mm[2]}`);
  if (mm) is(m3.rows === +mm[2], `목록 행수 = 대상 ${mm[2]}명 (실제 ${m3.rows}) — 분자·분모가 한 배열에서 나온다`);

  const c4 = num(await cardText('kp4')), m4 = await clickKpi('kp4');
  is(m4.kind === 'drill' && num(m4.sums[0].n) === c4,
     `kp4 BM 30일: 카드 ${c4} = 팝업 ${m4.sums.length ? m4.sums[0].n : '-'}`);
  is(c4 === BM_30, `그 수가 픽스처의 30일 내 BM ${BM_30}건과 같다 — 창 밖 ${BM_OLD}건은 안 센다 (실제 ${c4})`);

  const c5 = num(await cardText('kp5')), m5 = await clickKpi('kp5');
  const per = m5.sums.filter(b => /인당/.test(b.l))[0];
  is(m5.kind === 'drill' && !!per, 'kp5 팝업이 «인당 일평균» 칸을 낸다 — 비율 카드는 분모가 없으면 못 맞춘다');
  if (per) is(Math.abs(num(per.n) - c5) < 0.15, `kp5 인당 공수: 카드 ${c5} ≈ 팝업 ${per.n}`);
  const tot = m5.sums.filter(b => /총 공수/.test(b.l))[0];
  is(!!tot && Math.abs(num(tot.n) - MAN30 / 60) < 0.05,
     `총 공수 ${(MAN30/60).toFixed(2)}h — 설치 행까지 «그 외» 칸으로 담아 카드 분자와 합이 같다 (실제 ${tot && tot.n})`);
  is(/그 외/.test(m5.body), '정비성이 아닌 행을 «그 외(설치 등)» 로 밝힌다 — 조용히 빼면 합이 안 맞는다');

  const c6 = await cardText('kp6'), m6 = await clickKpi('kp6');
  const MON = ASOF.getUTCMonth() + 1;   // 올해 지난 달수 — 12 고정이 아니다 (기준일의 달까지)
  is(m6.kind === 'rows' && m6.rows === MON, `kp6 은 올해 ${MON}개월 표로 연다 (실제 ${m6.rows}행)`);
  /* 계획이 0 인 해에는 표의 진행율 칸이 '—' 다(그 달에 계획이 없다는 뜻). 카드는 0% 다.
     그래서 «표의 칸»이 아니라 «카드가 나온 그 두 수»(노트의 계획·완료)로 견준다. */
  const g6 = m6.sub.match(/계획\s*([\d,]+)\s*·\s*완료\s*([\d,]+)/);
  is(!!g6, 'kp6 팝업이 «계획 a · 완료 b» 를 적는다 (실제 ' + m6.sub + ')');
  if (g6) { const pc = +g6[1].replace(/,/g, ''), dc = +g6[2].replace(/,/g, '');
    is((pc ? Math.round(dc / pc * 100) : 0) + '%' === c6.trim(),
       `kp6 진행율: 카드 ${c6.trim()} = 완료 ${dc} ÷ 계획 ${pc}`);
    if (pc) is(m6.last && m6.last[3] === c6.trim(),
       `표 마지막 행(누적)도 카드와 같다 (실제 ${m6.last && m6.last[3]})`);
    else is(true, '올해 PM 계획이 0 이라 표의 진행율 칸은 «—» 다 — 카드 0% 와 같은 사실을 말한다'); }
}

console.log('\n[2] 필터를 걸어도 카드와 목록이 «함께» 움직인다');
{
  await shut();
  /* ⚠ «줄었나»를 상수와 견주면 안 된다 — 걸기 전에도 그 상수보다 작으면 거짓으로 통과한다.
     실제로 그렇게 짰다가 필터가 한 자리도 안 움직인 것을 못 봤다. 걸기 «전»을 잰다. */
  const before = num(await cardText('kp1'));
  /* ⚠ setH 다 — kp1 의 모집단(okP)은 «인원 기준» 축을 본다(v114). 설비 쪽 set() 을
     쓰면 한 자리도 안 움직이는데, 그것을 «필터가 없다»로 읽으면 안 된다. */
  await page.evaluate(() => GST.filters.setH('campus', 'F11'));
  await page.waitForTimeout(2500);
  const c1 = num(await cardText('kp1')), m1 = await clickKpi('kp1');
  is(c1 < before, `단지 F11 을 걸면 재직이 줄어든다 ${before} → ${c1} (안 줄면 필터가 안 걸린 것이다)`);
  is(num(m1.sums[0].n) === c1 && m1.rows === c1, `그 상태에서도 카드 ${c1} = 팝업 ${m1.sums[0].n} = 명단 ${m1.rows}줄`);
  const c4 = num(await cardText('kp4')), m4 = await clickKpi('kp4');
  is(num(m4.sums[0].n) === c4, `kp4 도 함께 움직인다 — 카드 ${c4} = 팝업 ${m4.sums[0].n}`);
  await shut();
  await page.evaluate(() => GST.filters.setH('campus', ''));
  await page.waitForTimeout(2000);
}

console.log('\n[3] 커서가 거짓말하지 않는다 — 규칙 자체');
{
  const probe = await page.evaluate(() => {
    const mk = a => { const d = document.createElement('div'); d.className = 'kpi';
      if (a) d.setAttribute(a, 'x'); document.body.appendChild(d);
      const c = getComputedStyle(d).cursor; d.remove(); return c; };
    return { bare:mk(''), kd:mk('data-kdrill'), st:mk('data-stage'), ds:mk('data-s') };
  });
  is(probe.kd === 'pointer', 'data-kdrill 카드는 손가락 커서 (실제 ' + probe.kd + ')');
  is(probe.st === 'pointer', 'data-stage 카드(fault 단계 필터)도 (실제 ' + probe.st + ')');
  is(probe.ds === 'pointer', 'data-s 카드(pm 상태 필터)도 (실제 ' + probe.ds + ')');
  is(probe.bare !== 'pointer',
     '표식 없는 .kpi 는 손가락 커서가 «아니다» — 이것이 사용자가 물은 자리다 (실제 ' + probe.bare + ')');
}

console.log('\n[4] 여덟 페이지: 손가락 커서가 뜨는 카드는 «실제로 무언가 한다»');
const PAGES = ['report','fault','material','pm','scrubber','tco','cip','hr'];
for (const P of PAGES) {
  const c2 = await makeCtx(); const pg = await c2.newPage();
  const pe = []; pg.on('pageerror', e => pe.push(e.message));
  await pg.goto(BASE + '/' + P + '/', { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(6000);
  const r = await pg.evaluate(() => {
    const out = { n:0, ptr:[], mark:[] };
    document.querySelectorAll('.kpi').forEach((el, i) => {
      out.n++;
      const id = (el.querySelector('.val') || {}).id || ('#' + i);
      if (getComputedStyle(el).cursor === 'pointer') out.ptr.push(id);
      if (el.hasAttribute('data-kdrill') || el.hasAttribute('data-stage') || el.hasAttribute('data-s')) out.mark.push(id);
    });
    return out;
  });
  const extra = r.ptr.filter(x => r.mark.indexOf(x) < 0);
  is(extra.length === 0,
     `${P}: KPI ${r.n}장 중 커서가 뜨는 ${r.ptr.length}장이 전부 «동작이 붙은» 카드다`
     + (extra.length ? ' → 아무 일도 안 하는데 커서만 뜨는 카드: ' + extra.join(', ') : ''));
  is(pe.length === 0, `${P}: JS 에러 없음` + (pe.length ? ' → ' + pe[0] : ''));
  await c2.close();
}

console.log('\n[5] pm 상태 필터 — data-s 없는 카드는 «선택»이 되지 않는다 (음성 대조)');
{
  const c2 = await makeCtx(); const pg = await c2.newPage();
  await pg.goto(BASE + '/pm/', { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(6000);
  /* ⚠ fStat.value 로는 못 본다 — <select> 에 없는 값을 넣으면 조용히 '' 가 되어,
     고친 코드와 안 고친 코드가 «같은 값»을 낸다. 실제로 그렇게 짰다가 음성 대조가
     초록불을 냈다. 눈에 보이는 증상은 «상태 카드가 아닌 카드에 선택 테두리가 옮겨
     가고, 상태 줄에는 아무것도 선택돼 있지 않은» 상태다 — 그것을 본다. */
  const r = await pg.evaluate(() => {
    const out = { n:0, stole:[], sel0:0 };
    out.sel0 = document.querySelectorAll('.kpi[data-s]').length;
    document.querySelectorAll('.kpi').forEach(el => {
      if (el.hasAttribute('data-s')) return;            // 상태 카드는 눌려도 된다
      out.n++;
      el.click();
      if (el.classList.contains('sel'))                 // 선택 테두리를 빼앗았다
        out.stole.push((el.querySelector('.val') || {}).id || '?');
      if (!document.querySelector('.kpi[data-s].sel'))  // 상태 줄이 통째로 비었다
        out.stole.push('상태줄비었음:' + ((el.querySelector('.val') || {}).id || '?'));
    });
    return out;
  });
  is(r.sel0 > 0, `pm 에 data-s 상태 카드가 ${r.sel0}장 있다`);
  is(r.stole.length === 0,
     `data-s 없는 카드 ${r.n}장을 눌러도 상태 선택이 흔들리지 않는다`
     + (r.stole.length ? ' → ' + r.stole.join(', ') : '')
     + " — 셀렉터를 '.kpi' 로 되돌리면 붉게 떠야 한다");
  await c2.close();
}

await browser.close(); srv.close();
console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + '/' + (pass + fail) + ' 통과');
process.exit(fail ? 1 : 0);
