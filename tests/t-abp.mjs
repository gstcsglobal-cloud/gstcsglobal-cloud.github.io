/* t-abp — 해외(대만) All By-Pass 를 «행 단위 원장»으로 받는다 (v133 · 사용자 제공 양식)
 *
 * 무엇이 달라졌나. 지금까지 해외 올바이패스는 ABP 크로스탭 시트로만 셌다. 크로스탭은
 * «건수»만 있고 «행»이 없어서 막대를 눌러도 세부내역이 안 나온다 — CLAUDE.md v125 가
 * 「없는 것을 알람 행으로 채우면 그게 거짓말이다」라고 적어 둔 그 자리다.
 * 사용자가 행 단위 리스트를 만들어 주면서 그 통로가 열렸다.
 *
 * 이 검사가 지키는 것 넷:
 *   ① 한 사건이 두 줄이다 (두 챔버) — Group 번호로 묶어 «한 건»으로 센다
 *   ② 「담당 = GST」만 센다 (사용자 확정) · External 은 안 센다
 *   ③ 원장과 크로스탭을 «동시에» 세지 않는다 — 하나가 켜지면 다른 하나는 꺼진다
 *   ④ 해외 원장이 들어와도 국내 숫자는 한 자리도 안 움직인다 (제3원칙)
 *
 * ⚠ 실데이터를 쓰지 않는다. 값은 전부 여기서 지어낸다 — 실물과 같은 것은 «머리글 이름»뿐이다
 *   (그 워크북에는 설비 S/N 과 담당자 실명이 들어 있다 · t-leak).
 *
 *   실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-abp.mjs
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

/* ── core.js 를 브라우저 없이 올린다 (SPEC · ALARM 만 쓴다) ───────────────── */
const noop = () => {};
const el = () => ({ style:{}, classList:{ add:noop, remove:noop, toggle:noop, contains:()=>false },
  dataset:{}, children:[], appendChild:noop, addEventListener:noop, setAttribute:noop,
  getAttribute:()=>null, insertAdjacentHTML:noop, querySelector:()=>null, querySelectorAll:()=>[], remove:noop });
global.window = global;
global.addEventListener = noop; global.removeEventListener = noop; global.postMessage = noop;
global.document = { addEventListener:noop, removeEventListener:noop, readyState:'complete',
  querySelector:()=>null, querySelectorAll:()=>[], getElementById:()=>null,
  createElement:el, head:el(), body:el(), documentElement:el() };
global.localStorage = { getItem:()=>null, setItem:noop, removeItem:noop };
global.location = { href:'http://x/', search:'', hash:'', pathname:'/' };
try{ Object.defineProperty(global,'navigator',{value:{language:'ko',userAgent:'node'},configurable:true}); }catch(e){}
global.matchMedia = () => ({ matches:false, addEventListener:noop, addListener:noop });
global.fetch = () => Promise.reject(new Error('no'));
await import(ROOT + '/assets/core.js');
const GST = global.GST;

/* ── 지어낸 해외 리스트 — 머리글만 실물과 같다 ─────────────────────────── */
const H = ['Group','운영단위','고객사','단지','라인','Work Date','정지 시작(AV)','정지 종료(AW)',
  '유지시간(분, MTTR)','S/N','Process','Detail',"Scr' Code",'Chamber','담당(Responsible)',
  'Alarm/Warning Msg','New Fail Code','원인 유형(코드)','조치 유형(코드)','고장 유형(한글 분류)',
  'Symptom','원인 (Deep rooted cause)','조치 (Corrective action)','Shut down','FSE Sheet Row'];
/* 엑셀은 이 칸들을 «서식 없는 숫자»(시리얼)로 준다 — 사용자 파일 실측 z:"General". */
const ser = (ymd, hh, mm) => {
  const d = Date.UTC(+ymd.slice(0,4), +ymd.slice(5,7)-1, +ymd.slice(8,10), hh||0, mm||0);
  return String((d - Date.UTC(1899,11,30)) / 86400000);
};
/* [그룹, 날짜, Right담당, Left담당] */
/* 8월에 «같은 알람 · 다른 원인 코드» 두 사건을 둔다 — 그래야 [10]이 «두 코드가 한 줄로
   접히지 않는가»를 실제로 볼 수 있다(i 가 3 차이면 알람이 같고 홀짝이 다르면 코드가 다르다). */
const SETS = [
  [1, '2026-06-03', 'GST',      'GST'],       // i=0  보통 — 한 건
  [2, '2026-06-11', 'External', 'External'],  // i=1  둘 다 외부 → 안 센다
  [3, '2026-06-24', 'External', 'GST'],       // i=2  혼재 — 외부가 «먼저» 적혀 있다
  [4, '2026-07-08', 'GST',      'External'],  // i=3  혼재 — GST 가 먼저
  [5, '2026-08-05', 'GST',      'GST'],       // i=4  알람1 · 원인 C6
  [6, '2026-08-06', 'GST',      'GST'],       // i=5  알람2 · 원인 C8
  [7, '2026-08-07', 'GST',      'GST'],       // i=6  알람0 · 원인 C6
  [8, '2026-08-08', 'GST',      'GST'],       // i=7  알람1 · 원인 C8  ← i=4 와 같은 알람
];
const rows = [H];
SETS.forEach(([g, d, rR, rL], i) => {
  [['Right', rR], ['Left', rL]].forEach(([ch, who]) => {
    rows.push([String(g), 'GST TAIWAN SCRUBBER', 'Customer A(F16)', 'F16', 'F16',
      ser(d), ser(d, 20, 44), ser(d, 23, 30), '166.0000000001',
      'AAA' + String(100 + i), 'ETCH', 'METAL', 'CODE' + i, ch, who,
      /* ⚠ 이 두 코드는 GST.causeMap 이 «고객사 관련» 한 덩어리로 접는다(실측 확인).
         서로 다른 원인이 한 줄이 되는 것은 순위표에서 가장 나쁜 실패라, 그것이
         일어나지 않는지를 [10]이 본다. */
      'Alarm-Sample ' + (i % 3), 'Fail' + (i % 3),
      (i % 2 ? '고객 요청(비고장성 교체) (C8)' : '고객(호스트) 설비 조작 영향 (C6)'),
      (i % 2 ? '파우더 청소(Clean Powder) (A2)' : '부품 교체 (A1)'),
      '고장분류 ' + (i % 3), 'Symptom ' + i, '깊은원인 ' + i, '조치 ' + i, 'By Pass', String(1000 + i)]);
  });
});

console.log('[1] 헤더를 이름으로 잡는다 — 해외 양식이 SPEC 에 걸리는가');
{
  const m = GST.SM.map(rows, GST.SM.SPEC.abp2);
  is(m.hi === 0, `헤더 행을 찾는다 (실제 ${m.hi}) — 'Work Date' 힌트가 빠지면 -1 이 된다`);
  is(!m.miss.length, '필수 열을 다 찾는다' + (m.miss.length ? ' → ' + m.miss.join(',') : ''));
  const want = { grp:'Group', sn:'S/N', occur:'Work Date', chamber:'Chamber',
                 inout:'담당(Responsible)', alarm:'Alarm/Warning Msg', atype:'New Fail Code',
                 ctype:'원인 유형(코드)', ctype2:'조치 유형(코드)', atype2:'고장 유형(한글 분류)',
                 phenom:'Symptom', cause:'원인 (Deep rooted cause)', action:'조치 (Corrective action)',
                 proc:'Process', subproc:'Detail', hold:'유지시간(분, MTTR)' };
  Object.keys(want).forEach(k => is(m.C[k] === H.indexOf(want[k]),
    `${k} → 「${want[k]}」 ${H.indexOf(want[k])}열 (실제 ${m.C[k]})`));
}

console.log('\n[2] 「우리 책임인가」 — 국내·해외 낱말을 한 함수가 흡수한다 (제2원칙)');
{
  is(GST.ALARM.inner({inout:'GST'}) === true,  'GST = 우리 책임');
  is(GST.ALARM.inner({inout:'External'}) === false, 'External = 아니다 (사용자 확정: 안 센다)');
  is(GST.ALARM.inner({inout:'내부'}) === true && GST.ALARM.inner({inout:'내적'}) === true, '국내 내부·내적 그대로');
  is(GST.ALARM.inner({inout:'외적'}) === false, '국내 외적 그대로');
  is(GST.ALARM.inner({incl:'포함', inout:'External'}) === true, 'P 의 「포함/제외」가 먼저다 (옛 규약 그대로)');
  is(GST.ALARM.inner({}) === true, '그 열이 아예 없는 시트는 전부가 그 시트의 답이다');
}

console.log('\n[3] 한 사건이 두 줄이다 — Group 으로 묶어 한 건으로 센다');
const B = GST.ALARM.build(rows, 'abp2', 'OS');
{
  is(!B.err, 'build 가 성공한다' + (B.err ? ' → ' + B.err : ''));
  is(B.rows.length === 16, `행 16 (실제 ${B.rows.length})`);
  const seq1 = B.rows.filter(o => o.seq === '1').length;
  is(seq1 === 8, `대표 줄(seq=1)이 사건 수와 같다 — 8 (실제 ${seq1})`);
  const cnt = B.rows.filter(o => o.cnt).length;
  is(cnt === 7, `집계 대상 7건 — 둘 다 External 인 한 세트만 빠진다 (실제 ${cnt})`);
  /* ⚠ 파일 순서가 자료가 되면 안 된다. 혼재 세트에서 외부가 먼저 적혔든 GST 가 먼저
     적혔든 «그 사건은 GST 책임이 있다» — 대표 줄이 GST 여야 한다. */
  const mixed = B.rows.filter(o => (o.grp === '3' || o.grp === '4') && o.seq === '1');
  is(mixed.length === 2 && mixed.every(o => o.inout === 'GST'),
     '혼재 세트의 대표 줄은 «파일 첫 줄»이 아니라 «GST 줄»이다 (순서를 뒤집어도 같은 답)');
  is(B.rows.filter(o => o.grp === '2' && o.cnt).length === 0, '둘 다 External 인 세트는 한 건도 안 센다');
  const byM = {}; B.rows.filter(o => o.cnt).forEach(o => byM[o.fmonth] = (byM[o.fmonth] || 0) + 1);
  /* 6월 2건 — 세트1(둘 다 GST)과 세트3(혼재·GST 대표). 세트2 는 둘 다 External 이라 0. */
  is(JSON.stringify(byM) === JSON.stringify({'2026-06':2,'2026-07':1,'2026-08':4}),
     `월별 2·1·4 (실제 ${JSON.stringify(byM)})`);
}

console.log('\n[4] 국내 H 의 Seq 는 손대지 않는다 (제3원칙 — 국내 숫자가 움직이면 사고다)');
{
  const KH = [['SEQP S/N','Occur Date','All-ByPass Seq','내/외','ALARM COMMENT'],
              ['BBB-1', '2026-08-01', '1', '내부', 'a'],
              ['BBB-1', '2026-08-01', '2', '외적', 'a'],   // 2·3 차 줄 — 대표가 아니다
              ['BBB-1', '2026-08-01', '3', '내부', 'a']];
  const b = GST.ALARM.build(KH, 'abp2', 'H');
  is(!b.err, '국내 양식이 그대로 읽힌다' + (b.err ? ' → ' + b.err : ''));
  is(b.rows.map(o => o.seq).join(',') === '1,2,3', `시트가 적은 Seq 그대로 (실제 ${b.rows.map(o=>o.seq).join(',')})`);
  is(b.rows.filter(o => o.cnt).length === 1, '한 사건 = 한 건');
  is(b.rows[0].op === 'H운영',
     `국내 op 는 지금까지대로 'H운영' (실제 '${b.rows[0].op}') — 바뀌면 구간 교체가 옛 행을 못 지운다`);
  /* ⚠ 국내 시트에 「운영단위」 열이 «있어도» op 는 안 바뀌어야 한다. 구간 교체(csv_window)가
     날짜 × op 로 지우므로, 이미 표에 든 행과 규칙이 갈리면 옛 행이 안 지워지고 새 행이
     얹혀 표가 조용히 두 배가 된다(v109 가 src_row 에서 겪은 그 자리).
     이 한 줄이 없으면 「해외를 받으려고 별칭을 늘렸더니 국내가 두 배가 됐다」가 된다. */
  const KH2 = [['SEQP S/N','Occur Date','All-ByPass Seq','내/외','ALARM COMMENT','운영단위'],
               ['BBB-2', '2026-08-01', '1', '내부', 'a', 'SEC Scrubber']];
  const b2 = GST.ALARM.build(KH2, 'abp2', 'H');
  is(!b2.err && b2.rows[0].op === 'H운영',
     `시트에 「운영단위」 열이 있어도 국내 op 는 'H운영' (실제 '${b2.rows[0] ? b2.rows[0].op : b2.err}')`);
}

console.log('\n[5] 해외 파일의 op 는 국내와 겹치지 않는다 (한 표를 함께 써도 안전한 이유)');
{
  is(B.rows[0].op === 'GST TAIWAN SCRUBBER',
     `해외 op = 시트의 운영단위 (실제 '${B.rows[0].op}')`);
  is(B.rows[0].src_sheet === 'OS', '해외 행은 src_sheet=OS 로 갈린다');
  /* csv_window 는 「날짜 범위 × op 집합」으로 지운다. 두 계통의 op 가 다르면
     해외 파일을 구간 교체로 올려도 국내 행은 한 줄도 안 지워진다. */
  is(!/^[KPH]운영$/.test(B.rows[0].op), '해외 op 가 국내 op 꼴(K·P·H운영)과 겹치지 않는다');
}

console.log('\n[6] 엑셀이 서식 없이 준 시각·시간을 사람이 읽는 꼴로 눕힌다');
{
  const r = B.rows[0];
  is(r.occur_date === '2026-06-03', `발생일 (실제 ${r.occur_date})`);
  is(r.occur === '2026-06-03', `Work Date 는 자정이라 날짜만 (실제 ${r.occur})`);
  is(r.occur_t === '2026-06-03 20:44', `정지 시작 (실제 ${r.occur_t})`);
  is(r.rel_time === '2026-06-03 23:30', `정지 종료 (실제 ${r.rel_time})`);
  is(r.hold === '166', `MTTR 의 부동소수 찌꺼기를 떨어낸다 (실제 ${r.hold})`);
  is(GST.ALARM.stamp('2020-12-21 00:15:54') === '2020-12-21 00:15:54',
     '숫자가 아니면 손대지 않는다 (국내 문자열 원문 보존)');
}

console.log('\n[7] SPEC 에 없는 열은 버리지 않고 extra 로 담는다');
{
  const ex = B.rows[0].extra || {};
  is(ex['Shut down'] === 'By Pass' && ex["Scr' Code"] === 'CODE0' && ex['고객사'] === 'Customer A(F16)',
     `Shut down · Scr' Code · 고객사 가 extra 에 남는다 (실제 ${Object.keys(ex).join(', ')})`);
}

/* ══════════════════════════════════════════════════════════════
   [8] 화면 — 원장과 크로스탭을 «동시에» 세지 않는가 (실제 브라우저)
   ⚠ 소스로는 원리적으로 못 본다. 「막대가 몇인가」는 그려 봐야 안다.
   ══════════════════════════════════════════════════════════════ */
console.log('\n[8] 주간현황 — 원장이 켜지면 크로스탭은 꺼진다 (둘을 더하면 이중 계산)');
{
  const MIME = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html',
    '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.pptx':'application/octet-stream' };
  const srv = http.createServer((rq, rs) => {
    let u = decodeURIComponent(rq.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.statusCode = 404; rs.end('nf'); return; }
    rs.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream');
    rs.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(0, r));
  const BASE = 'http://127.0.0.1:' + srv.address().port;

  /* 설치현황 — 해외 한 법인. 원장의 S/N 이 여기로 조인돼 «구분=해외»가 된다. */
  const IH = ['NO','Country','Customer','FAB','Scrubber CODE','Scrubber S/N','Scrubber Model',
              'Scrubber type','Process','Detail Process(Customer)','Main Tool Maker','Main Tool Model','설비상태'];
  const inst = [IH];
  for (let i = 0; i < 60; i++) inst.push([i+1, 'GST TAIWAN SCRUBBER', 'Customer A(F16)', 'F16',
    'C'+i, 'AAA'+(100+i), 'M1', 'SINGLE', 'ETCH', 'DRY', 'TEL', 'T1', 'Operation']);
  /* ABP 크로스탭 — 옛 경로. 6·7·8월에 각각 9·9·9 건. */
  const abpX = [['Month','6','7','8'], ['Site','','',''], ['Customer A(F16)','9','9','9']];
  const q = v => { v = String(v==null?'':v); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  const csv = a => a.map(r => r.map(q).join(',')).join('\n') + '\n';

  /* 원장 표 모양 — csvTableRows 의 계약(머리글 첫 행인 2차원 배열) */
  const LED_H = ['src_row','sn_key','sn','occur_date','fmonth','fweek','cnt','site','line',
                 'atype','ctype','ctype2','alarm','cause','action','phenom','op','inout','incl','seq','grp'];
  const ledger = (which) => {
    const out = [LED_H]; let sr = 0;
    if (which !== 'kr') B.rows.forEach(o => out.push([sr++, o.sn_key, o.sn, o.occur_date, o.fmonth,
      o.fweek, String(o.cnt), o.site||'', o.line||'', o.atype||'', o.ctype||'', o.ctype2||'', o.alarm||'',
      o.cause||'', o.action||'', o.phenom||'', o.op, o.inout||'', '', o.seq||'', o.grp||'']));
    if (which !== 'os') ['2026-06-05','2026-07-06','2026-08-07'].forEach((d,i) => out.push([sr++,
      'ZZZ'+i, 'ZZZ-'+i, d, d.slice(0,7), '', 'true', 'H1', '11', 'P', 'C', '', '국내알람'+i,
      '국내원인'+i, '국내조치'+i, '국내현상'+i, 'H운영', '내부', '', '', '']));
    return out;
  };

  const run = async (which) => {
    const browser = await chromium.launch(PW);
    const ctx = await browser.newContext({ viewport:{width:1700,height:1000}, locale:'ko-KR' });
    await ctx.route('**gstcsglobal-cloud.github.io/**', r => {
      let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({status:404, body:'nf'}); return; }
      r.fulfill({ status:200, contentType:MIME[path.extname(f)]||'application/octet-stream', body:fs.readFileSync(f) });
    });
    const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
      + 'GST.getSession=async function(){return {user:{email:"t@t"}};};GST.token=async function(){return "t";};'
      + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();'
      + 'if(GST._authOk)GST._authOk();return true;};'
      + 'GST._LED=' + JSON.stringify(which === 'none' ? [] : ledger(which)) + ';'
      + 'GST.csvTableRows=async function(t){ if(t==="sheet_allbypass"&&GST._LED.length)return GST._LED;'
      + '  throw new Error("EMPTY — "+t); };';
    await ctx.route('**/assets/core.js', r => r.fulfill({ status:200, contentType:'application/javascript',
      body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB }));
    const NM = ROOT + '/tests/node_modules/';
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
      const body = gid === '891608329' ? csv(inst) : gid === '1263412805' ? csv(abpX) : '';
      r.fulfill({ status:200, contentType:'text/csv', body });
    });
    await ctx.route('**supabase**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(12000);
    const fr = page.frames().find(f => /\/report\//.test(f.url()));
    await fr.evaluate(() => { setChartPer('cFt','m'); setChartPer('top3','m'); });
    await page.waitForTimeout(2600);
    const get = () => fr.evaluate(() => {
      const ch = Chart.getChart(document.getElementById('cFt'));
      const ds = {}; (ch ? ch.data.datasets : []).forEach(d => ds[d.label] = d.data.slice(-3));
      return { labels: ch ? ch.data.labels.slice(-3) : [], ds,
        etc: (document.getElementById('top3Etc')||{}).textContent || '' };
    });
    const base = await get();
    const grid = await fr.evaluate(() => { const g = chartToGrid('cFt');
      return { tsv: gridToTSV(g), html: gridToRichHTML(g, '제목') }; });
    const tops = {};
    for (const tv of ['all','alarm','abp']) {
      await fr.evaluate(v => setTopView(v), tv);
      await page.waitForTimeout(1500);
      tops[tv] = await fr.evaluate(() => ({
        rows: [...document.querySelectorAll('#top3Body tr')].map(tr =>
          [...tr.children].map(td => (td.textContent||'').replace(/\s+/g,' ').trim())),
        etc: (document.getElementById('top3Etc')||{}).textContent || '' }));
    }
    await browser.close();
    return { base, tops, grid, errs };
  };

  const OS  = await run('os');     // 해외만 올라간 상태
  const NONE= await run('none');   // 아직 아무것도 안 올린 상태 (옛 경로)
  const KR  = await run('kr');     // 국내만 올라간 상태

  const abpOf = r => (r.base.ds['All By-Pass'] || []).map(Number);
  is(JSON.stringify(abpOf(NONE)) === JSON.stringify([9,9,9]),
     `원장이 없으면 크로스탭 그대로 9·9·9 (실제 ${JSON.stringify(abpOf(NONE))})`);
  is(JSON.stringify(abpOf(OS)) === JSON.stringify([2,1,4]),
     `해외 원장이 켜지면 원장 기준 2·1·4 — 크로스탭 9 를 «더하지» 않는다 (실제 ${JSON.stringify(abpOf(OS))})`);
  is(JSON.stringify(abpOf(KR)) === JSON.stringify([10,10,10]),
     `국내만 올라가면 해외는 크로스탭(9) 그대로 + 국내 원장(1) = 10 (실제 ${JSON.stringify(abpOf(KR))})`);
  const alOf = r => (r.base.ds['Alarm(BM)'] || []).map(Number);
  is(JSON.stringify(alOf(OS)) === JSON.stringify(alOf(NONE)),
     `해외 올바 원장이 들어와도 Alarm 은 한 자리도 안 움직인다 (${JSON.stringify(alOf(NONE))} → ${JSON.stringify(alOf(OS))})`);

  console.log('\n[9] 고장 원인 TOP3 — 세 계통을 고를 수 있다 (사용자 요청)');
  const rowsOf = o => o.rows.filter(r => r.length > 2);
  const nOf = o => rowsOf(o).reduce((a,r) => a + (+r[2] || 0), 0);
  is(rowsOf(OS.tops.abp).every(r => /Alarm-Sample/.test(r[1])),
     `「올바만」은 올바 원장 행만 낸다 (실제 ${rowsOf(OS.tops.abp).map(r=>r[1]).join(' · ')||'없음'})`);
  is(nOf(OS.tops.abp) === 4, `8월 올바 4건 (실제 ${nOf(OS.tops.abp)})`);
  is(/All By-Pass 만 기준/.test(OS.tops.abp.etc), '어느 계통을 보고 있는지 노트가 적는다');
  is(!rowsOf(OS.tops.alarm).some(r => /Alarm-Sample/.test(r[1])),
     '「Alarm만」에는 올바 행이 안 섞인다');
  is(nOf(OS.tops.all) >= nOf(OS.tops.alarm) && nOf(OS.tops.all) >= nOf(OS.tops.abp),
     '「전체」는 두 계통을 합친 것이다');
  /* 대만 ABP 가 크로스탭인 동안에는 그 건수가 이 표에 «없다». 조용히 두면 사람은
     「목록이 잘렸나」로 읽는다 — 무엇이 빠졌고 무엇을 하면 되는지 적는다(v125 규약). */
  is(/집계표\(크로스탭\)/.test(NONE.tops.abp.etc) && /upload/.test(NONE.tops.abp.etc),
     '원장 전에는 «왜 해외가 안 잡히는지»와 «무엇을 하면 되는지»를 적는다');
  is(!/집계표\(크로스탭\)/.test(OS.tops.abp.etc), '원장이 올라오면 그 안내는 사라진다');
  is(!/집계표\(크로스탭\)/.test(NONE.tops.alarm.etc),
     '「Alarm만」에는 그 안내를 적지 않는다 — 그 화면은 올바를 안 센다');

  /* ══════════════════════════════════════════════════════════════
     [10] 원인·조치는 «코드 열»을 쓴다 (사용자 지시) — 그리고 다시 분류하지 않는다
     해외 시트는 원인·조치를 이미 코드로 분류해 뒀다(원인 유형(코드)·조치 유형(코드)).
     ⚠ 그 값을 GST.causeMap 에 다시 태우면 «이미 된 분류»를 또 분류한다. 실측으로
       확인했다 — 아홉 코드 중 여덟이 이름을 잃고, 「고객 조작(C6)」과 「고객 요청(C8)」이
       한 덩어리(§customer)로 접힌다. 서로 다른 원인이 한 줄이 되는 것은 순위표에서
       가장 나쁜 실패다.
     ══════════════════════════════════════════════════════════════ */
  console.log('\n[10] TOP3 의 원인·조치가 «코드 열» 그대로인가 (사용자 지시)');
  {
    const R = rowsOf(OS.tops.abp);
    const causes = R.map(r => r[3]), acts = R.map(r => r[4]);
    is(causes.some(v => /\(C6\)/.test(v)) || causes.some(v => /\(C8\)/.test(v)),
       `원인 칸에 코드가 그대로 뜬다 (실제 ${causes.join(' / ') || '없음'})`);
    is(acts.some(v => /\(A1\)|\(A2\)/.test(v)),
       `조치 칸도 코드 열이다 (실제 ${acts.join(' / ') || '없음'})`);
    /* 두 코드가 «한 줄»로 접히지 않았는가 — causeMap 을 태우면 둘 다 「고객사 관련」이 된다. */
    is(!causes.some(v => /고객사 관련/.test(v)),
       'C6·C8 이 causeMap 으로 한 덩어리(「고객사 관련」)가 되지 않는다');
    const flat = causes.join(' ');
    is(/\(C6\)/.test(flat) && /\(C8\)/.test(flat),
       `서로 다른 두 코드가 «따로» 남는다 (실제 ${flat})`);
    /* 국내는 지금까지대로 «자유 서술»이다(v94 사용자 확정: 분류 열로 갈음하지 않는다).
       ⚠ 「코드 꼴이 아니다」만 보면 부족하다 — 국내에도 분류 열(유형)이 있어서, 그것으로
         갈음해 버려도 코드 «꼴»은 아니기 때문에 통과해 버린다. 실제로 그렇게 한 번
         빠져나갔다. 그래서 «서술 원문이 그대로 있는가»를 본다. */
    const krCause = rowsOf(KR.tops.abp).map(r => r[3]).join(' ');
    is(/국내원인/.test(krCause),
       `국내 원장은 지금까지대로 서술 원문 그대로다 (실제 ${krCause || '없음'})`);
    is(!/\([A-Z]\d\)/.test(krCause), '국내 원인 칸에 코드가 끼어들지 않는다');
  }

  /* ══════════════════════════════════════════════════════════════
     [11] 차트 «데이터» 복사 — 그림이 아니라 표 (사용자 요청)
     ⚠ 웹 페이지는 클립보드에 파워포인트 «차트 개체»를 올릴 수 없다(브라우저가 내주는
       형식이 text/plain·text/html·image/png 뿐이다). 그래서 할 수 있는 것을 한다 —
       PPT 에 붙이면 편집 가능한 표, 엑셀에 붙이면 표(→ 삽입·차트)가 되는 값을 낸다.
     ══════════════════════════════════════════════════════════════ */
  console.log('\n[11] 차트 데이터가 «표»로 복사되는가 (그림이 아니라)');
  {
    const g = OS.grid || {};
    const lines = String(g.tsv || '').split('\n');
    is(lines.length >= 2, `머리글 + 시리즈 행이 있다 (실제 ${lines.length}줄)`);
    is(lines[0].startsWith('\t'), '첫 칸은 비우고 그 뒤가 구간 라벨이다 (엑셀이 그대로 표로 받는다)');
    is(/Alarm\(BM\)/.test(g.tsv || ''), '시리즈 이름이 행 머리로 들어간다');
    is(/All By-Pass/.test(g.tsv || ''), '올바이패스 계열도 실린다');
    const cols = lines[0].split('\t').length;
    is(lines.slice(1).every(l => l.split('\t').length === cols),
       `모든 행의 칸 수가 같다 — 어긋나면 엑셀에서 열이 밀린다 (머리 ${cols}칸)`);
    is(/<table/.test(g.html || '') && /border-collapse/.test(g.html || ''),
       'text/html 도 같이 낸다 (PPT 는 이걸 «편집 가능한 표»로 받는다)');
    is(!/<script|javascript:/i.test(g.html || ''), '복사되는 HTML 에 스크립트가 섞이지 않는다');
  }

  const allErrs = [].concat(OS.errs, NONE.errs, KR.errs);
  is(!allErrs.length, 'JS 에러 0건' + (allErrs.length ? ' → ' + allErrs[0] : ''));
  srv.close();
}

console.log('\n[12] 자유 서술을 «버리지» 않는다 — 코드는 어디에 몰리나, 서술은 무슨 일이 있었나');
{
  const R = fs.readFileSync(ROOT + '/report/index.html', 'utf8');
  is(/causeRaw:coded\?x\.cause:''/.test(R) && /actionRaw:coded\?x\.action:''/.test(R),
     '코드로 바꾼 자리의 원문을 causeRaw·actionRaw 로 남긴다');
  is(/two\(x\.cause,x\.causeRaw\)/.test(R) && /two\(x\.action,x\.actionRaw\)/.test(R),
     '드릴 상세가 «코드 + 서술»을 같이 보여준다 (코드만 남기면 정비 기록이 사라진다)');
  /* 코드를 다시 분류하지 않는 규율이 두 자리에 다 있어야 한다 — TOP3 와 드릴 요약. */
  is(/pairs\.filter\(p=>!p\.c\)\.map\(p=>p\.v\)/.test(R),
     'TOP3 는 코드가 아닌 값만 causeMap 에 태운다');
  is(/rows\.filter\(x=>!x\.coded\)\.map\(_dk\)/.test(R),
     '드릴 요약도 같은 규율이다 (한쪽만 고치면 같은 화면의 두 표가 갈린다)');
}

console.log(fail ? `\n❌ t-abp ${pass}/${pass + fail}` : `\n✅ t-abp ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
