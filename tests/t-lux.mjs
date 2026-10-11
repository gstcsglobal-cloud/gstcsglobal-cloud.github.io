/* t-lux — 디자인 «한 벌»이 실제로 한 벌인가 (v178 «Executive» 계획 F 의 마지막 검사 · v181)

   무슨 일인가. v178 이 카드·KPI·제목·단추·글꼴을 theme.css 끝의 «Executive» 절 한 곳으로 모았다.
   그 전에는 카드 모서리가 12~22px · 카드 제목 13~15px · KPI 숫자 26/28/30 · 주 단추(.btn-grad)가 cip·material·tco 에서
   «투명»(--title-gradient:none) · Pretendard 는 CDN 을 뺀 뒤 사본이 없어 «선언만 되고 안 뜨는» 상태였다.
   지키는 것 다섯 — 여덟 화면에서 계산된 스타일로 본다(소스로는 «뒤에서 다른 규칙이 덮는» 경우를 원리적으로 못 본다):
     ① 보이는 카드(GST.CARD_SEL)의 모서리 = --r-xl 한 값
     ② 보이는 KPI 카드의 모서리 = --r-lg 한 값
     ③ 카드 제목의 글자 크기 = --fs-card 한 값
     ④ KPI 숫자 = --fs-kpi (GST.fitKpis 가 줄인 카드는 그 값 «이하»)
     ⑤ 보이는 주 단추(.btn-grad)에 바탕이 있다(투명 아님) · 글꼴 Pretendard 가 실제로 «받아져» 쓰인다
   ⚠ 값(16px·30px)을 검사에 박지 않는다 — 토큰을 읽어 대조한다. 토큰을 바꾸는 것은 디자인이고, 갈라지는 것이 결함이다.
   ⚠ 실데이터를 쓰지 않는다 — 행은 t-layout 과 같은 지어낸 값이다(t-leak).

     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-lux.mjs
*/
import fs from 'fs';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

/* ── 지어낸 자료 — t-layout 과 같은 생성기(카드가 차오를 만큼만 있으면 된다) ── */
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
  '.png':'image/png', '.svg':'image/svg+xml', '.pptx':'application/octet-stream', '.woff2':'font/woff2' };
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
    r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f),
      headers:{ 'access-control-allow-origin':'*' } });
  });
  /* 음성 대조용 — NOFONT=1 이면 자체 사본 글꼴 css 를 404 로(v178 이전 «선언만 되고 안 뜨는» 상태) */
  if (process.env.NOFONT) await ctx.route('**/vendor/pretendard/**', r => r.fulfill({ status:404, body:'nf' }));
  /* 음성 대조용 — THEME_PATCH 가 있으면 theme.css 끝에 그 규칙을 붙여 «뒤에서 덮는» 상황을 만든다 */
  if (process.env.THEME_PATCH) await ctx.route('**/assets/theme.css*', r => r.fulfill({ status:200, contentType:'text/css',
    headers:{ 'access-control-allow-origin':'*' }, body: fs.readFileSync(ROOT + '/assets/theme.css', 'utf8') + '\n' + process.env.THEME_PATCH }));
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


/* ── 한 화면에서 «한 벌»을 읽는다 ── */
async function measure(pg){
  return pg.evaluate(async () => {
    const tok = v => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;visibility:hidden;width:' + v;
      document.body.appendChild(d); const w = getComputedStyle(d).width; d.remove(); return parseFloat(w); };
    const T = { rxl: tok('var(--r-xl)'), rlg: tok('var(--r-lg)'), fcard: tok('var(--fs-card)'), fkpi: tok('var(--fs-kpi)') };
    const vis = el => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const px = v => parseFloat(v);
    const out = { T, cards:[], kpis:[], titles:[], vals:[], btns:[], font:{} };
    /* 모서리·제목은 «섹션 탭에 가려진» 카드까지 잰다 — display:none 이어도 계산된 값은 나온다. 한 벌은 보이든 안 보이든 한 벌이다 */
    document.querySelectorAll(GST.CARD_SEL).forEach(el => out.cards.push(px(getComputedStyle(el).borderTopLeftRadius)));
    document.querySelectorAll('.kpi').forEach(el => out.kpis.push(px(getComputedStyle(el).borderTopLeftRadius)));
    document.querySelectorAll('.card > h3,.tablecard > h3,.trend-header h3,.cross-header h3').forEach(el =>
      out.titles.push({ fs: px(getComputedStyle(el).fontSize), t: (el.textContent || '').trim().slice(0, 18) }));
    document.querySelectorAll('.kpi .val').forEach(el => { if (vis(el)) out.vals.push({ fs: px(getComputedStyle(el).fontSize),
      inl: !!el.style.fontSize }); });
    document.querySelectorAll('.btn-grad').forEach(el => { if (!vis(el)) return; const s = getComputedStyle(el);
      const bg = s.backgroundColor, a = /rgba\([^)]*,\s*0\)$/.test(bg) || bg === 'transparent';
      out.btns.push({ img: s.backgroundImage !== 'none', solid: !a, t: (el.textContent || '').trim().slice(0, 12) }); });
    const fam = getComputedStyle(document.body).fontFamily;
    let loaded = 0; try { loaded = (await document.fonts.load('600 16px "Pretendard Variable"', '가A1')).length; } catch (_) {}
    out.font = { first: fam.split(',')[0].replace(/["']/g, '').trim(), loaded,
      used: [...document.fonts].some(f => /Pretendard/i.test(f.family) && f.status === 'loaded') };
    out.dark = document.body.classList.contains('theme-slate');
    return out;
  });
}

const PAGES = ['fault', 'material', 'pm', 'scrubber', 'tco', 'cip', 'hr', 'report'];
const ctx = await makeCtx();
const pe = [];
let seenBtn = 0, seenVal = 0;
for (const p of PAGES) {
  console.log('\n[' + p + ']');
  const pg = await ctx.newPage(); pg.on('pageerror', e => pe.push(p + ': ' + e.message));
  await pg.goto(BASE + '/' + p + '/', { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(p === 'report' ? 7000 : 5500);
  const m = await measure(pg);
  const uniq = a => [...new Set(a)];
  const near = (a, b) => Math.abs(a - b) < 0.6;
  is(m.cards.length > 0 && m.cards.every(r => near(r, m.T.rxl)),
    `카드 ${m.cards.length}장의 모서리가 한 값 = --r-xl ${m.T.rxl}px` + (m.cards.every(r => near(r, m.T.rxl)) ? '' : ` (실제 ${uniq(m.cards).join('/')})`));
  is(!m.kpis.length || m.kpis.every(r => near(r, m.T.rlg)),
    `KPI ${m.kpis.length}장의 모서리 = --r-lg ${m.T.rlg}px` + (m.kpis.every(r => near(r, m.T.rlg)) ? '' : ` (실제 ${uniq(m.kpis).join('/')})`));
  const badT = m.titles.filter(t => !near(t.fs, m.T.fcard));
  is(m.titles.length > 0 && !badT.length, `카드 제목 ${m.titles.length}개의 글자 크기 = --fs-card ${m.T.fcard}px`
    + (badT.length ? ` (갈림 ${badT.slice(0, 3).map(t => t.t + ' ' + t.fs).join(' · ')})` : ''));
  const badV = m.vals.filter(v => v.inl ? v.fs > m.T.fkpi + 0.6 : !near(v.fs, m.T.fkpi));
  seenVal += m.vals.length;
  is(!badV.length, `KPI 숫자 ${m.vals.length}개 = --fs-kpi ${m.T.fkpi}px (자동 맞춤 ${m.vals.filter(v => v.inl).length}개는 그 이하)`
    + (badV.length ? ` (갈림 ${uniq(badV.map(v => v.fs)).join('/')})` : ''));
  const badB = m.btns.filter(b => !b.img && !b.solid);
  seenBtn += m.btns.length;
  is(!badB.length, `주 단추(.btn-grad) ${m.btns.length}개에 바탕이 있다` + (badB.length ? ` (투명 ${badB.map(b => b.t).join(', ')})` : ''));
  is(/Pretendard/i.test(m.font.first) && m.font.loaded > 0 && m.font.used,
    `글꼴 — 첫 글꼴 ${m.font.first} · 자체 사본을 실제로 받아 쓴다(${m.font.loaded}조각)`);
  is(m.dark, '다크가 기본이다 (theme-slate)');
  await pg.close();
}
console.log('\n[전체]');
is(seenBtn > 0, '여덟 화면 어딘가에 주 단추가 있어 ⑤가 «0 = 0» 으로 통과하지 않는다 (' + seenBtn + '개)');
is(seenVal > 0, 'KPI 숫자를 실제로 쟀다 (' + seenVal + '개)');
is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-lux: ${pass} 통과 · ${fail} 실패` : `\n✅ t-lux: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
