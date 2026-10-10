/* t-layout — 차트 배치 층(GST.chartLayout)이 «보이는 것만» 바꾸는가 (v174 · 2단계 2차 «차트 정리»)

   무슨 일인가. 사용자 위임 「지우면 안 되는 차트는 니가 판단해」. 같은 질문을 축만 바꿔 묻던 카드는
   한 자리에 모아 «기준» 단추로 하나만 보이고, 다른 카드·KPI 와 같은 그림인 카드는 숨긴다.
   차트 코드(숫자·세부내역·필터 토글·PPT)는 한 줄도 안 건드린다 — 그래서 이 검사가 지키는 것은 넷이다:
     ① 묶음마다 «정확히 하나»만 보인다 · 고른 기준은 다시 열어도 남는다
     ② 숨긴 카드는 화면에도, PPT 전체 내보내기에도 안 나간다(폭 0)
     ③ 보이게 된 차트는 제 크기로 다시 그려진다(숨어 있을 때 폭 0 으로 그려졌다 — Chart.js 의 ResizeObserver 가 하고,
        select() 의 resize() 는 보험이다. 그 호출을 빼도 이 검사는 초록이다 — 지키는 것은 «결과»다)
     ④ 언어를 바꾸면 단추 글자도 바뀌고, 어느 페이지에서도 JS 에러가 없다
   ⚠ 소스 검사로는 못 본다 — «보이나»는 계산된 스타일을 읽어야 안다.
   ⚠ 실데이터를 쓰지 않는다 — 행은 t-kpi 와 같은 지어낸 값이다(t-leak).

     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-layout.mjs
           SHOT=1 이면 페이지마다 스크린샷을 scratch 폴더(SHOT_DIR)에 남긴다.
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
/* ⚠ 픽스처 설계 — 없으면 «0 = 0» 으로 거짓 초록이 난다 (v135 · 6단계에 실제로 겪었다).
   ① 신뢰성(fault rk)·PM 스케줄(pm)의 열쇠는 설비호기가 아니라 **S/N(IN)** 이다.
      그 칸을 비우면 units 가 0 이 되어 rk1~rk5·ck1~ck4 가 전부 0 이 된다.
   ② BM 을 소수의 설비에 몰아 준다 — rankable(bm≥2)이 0 이 아니게.
   ③ 같은 설비에 PM 을 «두 번» 준다 — 간격이 있어야 주기가 유도된다.
      주기가 없으면 모든 스케줄이 'na' 라 지연·도래가 전부 0 이다.
   ④ 설비 번호를 «용도별로 갈라» 쓴다 — 겹치면 최근 PM 이 옛 PM 을 덮어 상태가 바뀐다.
   전부 30일 창 밖이거나 다른 설비라 report 의 숫자(BM_30·MAN30)는 한 자리도 안 움직인다. */
const EQ_BM = 5;                                  // BM·최근 PM 이 도는 설비 (1~5)
const PM_CYC = 80;                                // 유도될 주기
const U_OVER = [11, 12];                          // 마지막 PM 120일 전 · 주기 80 → 지연
const U_PLAN = [13, 14];                          // 다음 예정이 «이번 달» 에 오게
const U_DONE = 15;                                // 이번 달에 완료된 PM
const BM_PAID = 4;                                // 유상 BM — 분자가 0 이면 비율 대조가 무의미하다
const MAN_BM = 60, MAN_TBM = 120, MAN_INS = 90;
const wkCsv = () => {
  const rows = [WHF]; let n = 0;
  const one = (stage, days, man, cause, pf, u, wm) => { n++; const d = ymd(dAgo(days));
    const k = u == null ? (n % EQ_BM + 1) : u;
    rows.push(['SCRUBBER', 'GST TAIWAN SCRUBBER', 'Micron Memory Taiwan Co., Ltd.(F16)',
      'F16', 'F16', 'B1', 'ETCH', 'DRY', 'GST-1000', 'R' + n, '완료', '정기', stage, 'A',
      'W' + n, 'MT' + n, 'P1', 'TWC' + k, 'L', 'TWS' + k, '', pf || '무상',
      '', '', cause || '', '', '', d, d, '09:00', '10:00', d, '',
      '10', wm || '60', man, 'STAFF', '1']);
  };
  for (let i = 0; i < BM_30; i++)      one('BM',  2 + i, MAN_BM,  'PUMP', i < BM_PAID ? '유상' : '무상');
  /* 첫 TBM 은 작업시간만 1,600분(26.7h) — 공수 ⚠(v155)를 띄운다. 공수(MAN_TBM)는 그대로라 KPI 숫자는 안 움직인다 */
  for (let i = 0; i < TBM_30; i++)     one('TBM', 3 + i, MAN_TBM, '', '', null, i === 0 ? '1600' : '');
  for (let i = 0; i < INSTALL_30; i++) one('반입', 4 + i, MAN_INS, '');
  for (let i = 0; i < BM_OLD; i++)     one('BM',  60 + i, MAN_BM, 'PUMP');
  /* 재방문(FTFR) — 같은 설비에서 30일 안에 BM 이 다시 난다. 없으면 rk5 목록이 0줄이라
     「카드 = 목록」 대조가 또 0=0 이 된다. 관측창(30일) 확보를 위해 충분히 옛 날짜로. */
  one('BM', 90, MAN_BM, 'PUMP', '', 1); one('BM', 82, MAN_BM, 'PUMP', '', 1);
  /* 지연 — 마지막 PM 이 120일 전, 주기 80 → next 는 이미 지났다. */
  U_OVER.forEach(u => { one('TBM', 200, MAN_TBM, '', '', u); one('TBM', 200 - PM_CYC, MAN_TBM, '', '', u); });
  /* 이번 달 예정 — 마지막 PM 60일 전(기준일 8/31 기준) + 주기 80 → 다음 예정이 이번 달이다. */
  U_PLAN.forEach(u => { one('TBM', 140, MAN_TBM, '', '', u); one('TBM', 60, MAN_TBM, '', '', u); });
  /* 이번 달 «완료» — 기준일 이후 날짜라 dAgo 에 음수를 준다. */
  one('TBM', 150, MAN_TBM, '', '', U_DONE);
  one('TBM', -10, MAN_TBM, '', '', U_DONE);
  return csv(rows);
};
/* kp5 의 분자는 «30일 창 전 행»의 작업공수 합이다 — 설치 행도 든다. */
const MAN30 = BM_30 * MAN_BM + TBM_30 * MAN_TBM + INSTALL_30 * MAN_INS;

/* ── 자재실적 (v135 · 6단계 — material 의 KPI 카드를 대조하려고 더했다) ──
   유상 6 · 무상 4 · 유/무상 미기재 3 → 유상 비율의 분모는 «유상+무상» 10 이다.
   미기재를 분모에 넣던 옛 식이면 6/13 = 46% 가 되어 붉게 뜬다(음성 대조). */
const MHF = ['운영단위','고객사','수선실적번호','단지','라인','BAY','공정','세부공정',
  '메인설비호기','설비호기','챔버','S/N','W/O번호','모델명','자재코드','설비위치','자재위치',
  '사용수량','자재명','규격','교체사유','전유상교체일','전교체일','자재실적일자',
  '사용일(유상기준)','사용일(전교체일기준)','유/무상','무상사유','단가','재고체크여부','자재창고'];
const MAT_PAID = 6, MAT_FREE = 4, MAT_NA = 3;
const MAT_N = MAT_PAID + MAT_FREE + MAT_NA;
const MAT_PFP = Math.round(MAT_PAID / (MAT_PAID + MAT_FREE) * 100);
const matCsv = () => {
  const rows = [MHF]; let n = 0;
  const one = (pf, days, mat) => { n++; const d = ymd(dAgo(days));
    rows.push(['GST TAIWAN SCRUBBER', 'Micron Memory Taiwan Co., Ltd.(F16)', 'R' + n,
      'F16', 'F16', 'B1', 'ETCH', 'DRY', 'MT' + n, 'TWC' + ((n % N_INST) + 1), 'A',
      'TWS' + ((n % N_INST) + 1), 'W' + n, 'GST-1000', 'M' + (n % 3), 'POS', 'MP',
      '1', mat, 'SPEC', '마모', '', ymd(dAgo(days + 200)), d, '200', '200', pf, '', '0', 'Y', 'ST']);
  };
  for (let i = 0; i < MAT_PAID; i++) one('유상', 2 + i, 'O-RING');
  for (let i = 0; i < MAT_FREE; i++) one('무상', 3 + i, 'PUMP');
  for (let i = 0; i < MAT_NA;   i++) one('',    4 + i, 'FILTER');
  return csv(rows);
};

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
const SHEETS = { '891608329':instCsv(), '1213453343':rosterCsv(), '646668307':wkCsv(), '0':eduCsv(),
  '31302669':matCsv() };

async function makeCtx() {
  const ctx = await browser.newContext({ viewport:{ width:1800, height:1200 }, locale:'ko-KR' });
  /* ⚠ 포괄 규칙을 «먼저» 등록한다 — Playwright 는 나중에 등록한 것을 먼저 본다. */
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => {
    let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
    r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) });
  });
  await ctx.route('**/assets/core.js*', r => r.fulfill({ status:200, contentType:'application/javascript',
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

/* ── 한 페이지를 띄워 배치 상태를 읽는다 ─────────────────────────────── */
async function probe(pg){
  return pg.evaluate(() => {
    const st = (GST.chartLayout && GST.chartLayout.state) ? GST.chartLayout.state() : [];
    const shown = el => !!el && getComputedStyle(el).display !== 'none';
    const cardOf = id => { const el = /^[#.\[]/.test(id) ? document.querySelector(id) : document.getElementById(id); return el ? GST.cardOf(el) : null; };
    return st.map(r => ({
      retired: r.retired.map(id => ({ id, exists: !!cardOf(id), shown: shown(cardOf(id)) })),
      groups: r.groups.map(g => ({ key: g.key, sel: g.sel,
        items: g.ids.map(id => ({ id, shown: shown(cardOf(id)),
          bar: (cardOf(id) && cardOf(id).querySelector('.gst-axsel[data-ax="' + g.key + '"]')) ? 1 : 0 })) })),
      emptyGrids: [].filter.call(document.querySelectorAll('.gst-n0'), g => getComputedStyle(g).display !== 'none').length
    }));
  });
}
const SHOT = process.env.SHOT === '1', SHOT_DIR = process.env.SHOT_DIR || '/tmp';

console.log('\n[1] 고장 분석 — 묶음·은퇴·격자');
{
  const c = await makeCtx(); const pg = await c.newPage();
  const pe = []; pg.on('pageerror', e => pe.push(e.message));
  await pg.goto(BASE + '/fault/', { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(6500);
  const s = (await probe(pg))[0];
  is(!!s, '배치 기록이 있다 (GST.chartLayout 이 불렸다)');
  if (s) {
    const keys = s.groups.map(g => g.key).join(',');
    is(keys === 'where,why,model,tbm', '묶음 넷 — where·why·model·tbm (실제 ' + keys + ')');
    s.groups.forEach(g => {
      const on = g.items.filter(x => x.shown).map(x => x.id);
      is(on.length === 1 && on[0] === g.sel, `«${g.key}» 묶음은 정확히 하나만 보인다 — ${g.sel} (보이는 것 ${on.join(',') || '없음'})`);
      is(g.items.every(x => x.bar), `«${g.key}» 묶음의 카드마다 기준 단추줄이 있다`);
    });
    is(s.retired.length === 5 && s.retired.every(x => x.exists && !x.shown),
       '은퇴 다섯 장은 DOM 에 남고 화면에는 안 보인다 (' + s.retired.map(x => x.id + (x.shown ? '=보임' : '')).join(' ') + ')');
    is(s.emptyGrids === 0, '카드가 다 빠진 격자는 통째로 숨는다');
  }
  /* 격자 열 맞춤 — 원인·조치의 둘째 격자(의뢰유형·모델·공정)는 비고, 개요 격자는 한 칸 */
  const grid = await pg.evaluate(() => {
    const g = id => { const el = document.getElementById(id); const c = el && GST.cardOf(el); return c ? c.parentNode : null; };
    const cls = el => el ? [...el.classList].filter(k => /^gst-n/.test(k)).join(' ') : 'x';
    return { req: cls(g('cReqType')), sn: cls(g('cSn')), worker: cls(g('cWorker')), alarm: cls(g('cAlarmP')),
             sameGrid: g('cSn') === g('cModel') && g('cPhenom') === g('cAlarmP') };
  });
  is(grid.sameGrid, '묶음 카드는 한 격자로 모였다 (설비·모델 · 현상·알람)');
  is(grid.req === 'gst-n0', '빈 격자 → gst-n0 (실제 ' + grid.req + ')');
  is(grid.sn === 'gst-n1', '개요 격자(어디서 한 장) → gst-n1 (실제 ' + grid.sn + ')');
  is(grid.worker === 'gst-n2', '작업 부하 격자(작업자·LINE 평균) → gst-n2 (실제 ' + grid.worker + ')');
  is(grid.alarm === '', '원인·조치 묶음은 정합성 표 옆 두 칸 그대로 (실제 ' + (grid.alarm || '없음') + ')');

  /* 기준 바꾸기 → 그 카드만 보이고, 차트가 제 폭으로 다시 그려진다 */
  const sw = await pg.evaluate(async () => {
    const b = document.querySelector('.gst-axsel[data-ax="where"] button[data-k="cLine"]'); if (!b) return { ok:false };
    b.click(); await new Promise(r => setTimeout(r, 400));
    const cv = document.getElementById('cLine'); const ch = Chart.getChart(cv);
    return { ok:true, cw: cv.clientWidth, chw: ch ? ch.width : -1,
      snShown: getComputedStyle(GST.cardOf(document.getElementById('cSn'))).display !== 'none',
      pressed: [...document.querySelectorAll('.gst-axsel[data-ax="where"] button[aria-pressed="true"]')].map(x => x.dataset.k),
      saved: localStorage.getItem('gst_ax:fault:where') };
  });
  is(sw.ok && !sw.snShown && sw.cw > 100, 'LINE 을 고르면 LINE 카드만 보인다 (폭 ' + sw.cw + ')');
  is(sw.chw > 100 && Math.abs(sw.chw - sw.cw) < 4, '숨어 있던 차트가 보이는 폭으로 다시 그려졌다 (차트 ' + sw.chw + ' · 캔버스 ' + sw.cw + ')');
  is(sw.pressed && sw.pressed.every(k => k === 'cLine') && sw.pressed.length === 4,
     '네 카드의 단추줄 모두 LINE 이 눌림 (' + (sw.pressed || []).join(',') + ')');
  is(sw.saved === 'cLine', '고른 기준을 이 PC 에 기억한다');

  /* PPT 전체 내보내기가 보는 캔버스 = 보이는 것만 */
  const ppt = await pg.evaluate(() => {
    const vis = GST.chartCanvases().filter(c => c.id && c.clientWidth > 0).map(c => c.id);
    return { has: id => vis.indexOf(id) >= 0, list: vis, sn: vis.indexOf('cSn') >= 0, line: vis.indexOf('cLine') >= 0,
             dur: vis.indexOf('cDur') >= 0, rank: vis.indexOf('cRelRank') >= 0 };
  });
  is(ppt.line && !ppt.sn && !ppt.dur, 'PPT 가 담는 캔버스 — 고른 LINE 은 들고, 숨은 설비·은퇴 카드는 뺀다');

  /* 언어 — 단추 글자가 따라간다 */
  await pg.evaluate(() => window.setLang && window.setLang('en'));
  await pg.waitForTimeout(600);
  const en = await pg.evaluate(() => [...document.querySelectorAll('.gst-axsel[data-ax="where"]')][0].textContent);
  is(/Equipment/.test(en) && /Process/.test(en), '영어로 바꾸면 단추가 영어 (' + en + ')');
  if (SHOT) { await pg.evaluate(() => window.setLang && window.setLang('ko')); await pg.waitForTimeout(500);
    await pg.screenshot({ path: SHOT_DIR + '/lay-fault.png', fullPage: true }); }
  is(pe.length === 0, '고장 분석 JS 에러 없음' + (pe.length ? ' → ' + pe[0] : ''));
  await c.close();

  /* 다시 열면 고른 기준이 남는다 */
  const c2 = await makeCtx(); const p2 = await c2.newPage();
  await p2.goto(BASE + '/fault/', { waitUntil:'domcontentloaded' });
  await p2.evaluate(() => { try { localStorage.setItem('gst_ax:fault:where', 'cProc'); } catch (e) {} });
  await p2.reload({ waitUntil:'domcontentloaded' }); await p2.waitForTimeout(5000);
  const re = (await probe(p2))[0];
  const wg = re && re.groups.find(g => g.key === 'where');
  is(wg && wg.sel === 'cProc' && wg.items.find(x => x.id === 'cProc').shown, '다시 열어도 기억한 기준(공정)이 보인다');
  await c2.close();
}

console.log('\n[2] 여덟 페이지 — 묶음은 하나만 · 은퇴는 숨김 · JS 에러 없음');
for (const P of ['fault','material','pm','scrubber','tco','cip','hr']) {
  const c = await makeCtx(); const pg = await c.newPage();
  const pe = []; pg.on('pageerror', e => pe.push(e.message));
  await pg.goto(BASE + '/' + P + '/', { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(6500);
  const st = await probe(pg);
  if (!st.length) { is(false, P + ': 배치 기록이 없다 (chartLayout 미적용)'); await c.close(); continue; }
  const s = st[0];
  const EXP = { fault:[4,5], material:[2,1], pm:[2,1], scrubber:[0,5], tco:[1,0], cip:[2,0], hr:[2,0] }[P];
  /* 묶음은 카드를 둘 이상 찾았을 때만 선다 — id 가 틀리면 «조용히» 빠지므로 개수를 판정표와 대조한다 */
  is(s.groups.length === EXP[0] && s.retired.length === EXP[1],
     `${P}: 판정표대로 묶음 ${EXP[0]} · 은퇴 ${EXP[1]} (실제 ${s.groups.length} · ${s.retired.length})`);
  const bad = s.groups.filter(g => g.items.filter(x => x.shown).length !== 1).map(g => g.key);
  is(bad.length === 0, `${P}: 묶음 ${s.groups.length}개가 전부 하나만 보인다` + (bad.length ? ' → ' + bad.join(',') : ''));
  const rbad = s.retired.filter(x => !x.exists || x.shown).map(x => x.id);
  is(rbad.length === 0, `${P}: 은퇴 ${s.retired.length}장이 DOM 에 있고 숨어 있다` + (rbad.length ? ' → ' + rbad.join(',') : ''));
  is(s.emptyGrids === 0, `${P}: 빈 격자가 화면에 남지 않는다`);
  /* 자재 사용 — 렌더가 «제외 검색» 목록 다섯 개를 전부 열어 차트를 덮고 있었다(v174 에 화면으로 잡았다) */
  const openDD = await pg.evaluate(() => [...document.querySelectorAll('.excl-dd')].filter(e => getComputedStyle(e).display !== 'none').length);
  is(openDD === 0, `${P}: 아무도 안 누른 드롭다운이 열려 있지 않다 (${openDD})`);
  is(pe.length === 0, `${P}: JS 에러 없음` + (pe.length ? ' → ' + pe[0] : ''));
  if (SHOT) await pg.screenshot({ path: SHOT_DIR + '/lay-' + P + '.png', fullPage: true });
  await c.close();
}

await browser.close(); srv.close();
console.log('\n' + (fail ? '❌' : '✅') + ` t-layout: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
