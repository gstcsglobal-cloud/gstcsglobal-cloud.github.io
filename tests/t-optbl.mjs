/* t-optbl — 「Scrubber 가동 현황」 표가 «같은 행의 두 칸이 같은 모집단을 보는가» (v132)

   무슨 일이 있었나. 사용자가 물었다 — 「F16N 으로 인원이 있는데 체크가 안되는거 같네?」
   설치현황의 법인 이름은 셋인데(…(F16)·…(F11)·…(F16N)) 정규화하면 전부 MICRON 이다.
   인원·실적을 «어느 행에 담을지» 정하는 표가 정규화 이름 하나에 «첫 행»만 매어 두어,
   세 법인의 인원과 실적이 통째로 가장 큰 행으로 몰리고 나머지 두 행은 「자료없음」이 됐다.
   에러도 배너도 없었다 — 설비 칸에는 숫자가 서 있으니 «인원 자료가 아직 안 왔구나»로 읽힌다.

   그리고 사용자 지시 하나 — PSMC 와 TASC 는 한 팀이 담당하므로 한 행으로 센다.
   인원현황에도 TASC 담당이 PSMC 로 적혀 있어, 갈라 두면 TASC 행은 영영 「자료없음」이다.

   이 검사가 지키는 것 셋:
     ① 한 고객사가 여러 법인으로 갈려 있어도 각 행이 «자기 인원·자기 실적»을 받는다
     ② 합계는 그대로다 — 누구도 두 번 세지 않고, 누구도 사라지지 않는다
     ③ 합치기는 «둘 다 있을 때»만 건다 — 한쪽만 남는 필터에서 없는 것을 있다고 하지 않는다

   ⚠ 소스 검사로는 원리적으로 못 본다. 「F16N 행에 사람이 담겼는가」는 실제로 그려 봐야
     알 수 있다 — 예전 코드도 문법은 멀쩡했고 숫자만 틀렸다.
   ⚠ 실데이터를 쓰지 않는다. 행은 여기서 지어낸다(법인 이름의 «모양»만 실물을 흉내낸다).

     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-optbl.mjs
*/
import fs from 'fs';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

/* ── 지어낸 자료 ───────────────────────────────────────────────────────────
   설치현황은 해외 118열 양식의 «이름»만 쓴다(SPEC.inst 의 영문 별칭).
   한 고객사(MICRON)가 세 법인으로 갈리고, PSMC·TASC 가 따로 선다.          */
const q = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const csv = rows => rows.map(r => r.map(q).join(',')).join('\n') + '\n';

const IH = ['NO','Country','Customer','Location','FAB','Line','Bay','Scrubber CODE','Scrubber S/N',
  'Scrubber Model','Burner Type','Scrubber type','Process','Detail Process(HQ)','Detail Process(Customer)',
  'Main Tool ID','Main Tool Maker','Main Tool Model','Receipt date','Setup date','Turn-on date',
  'Warranty date','Warranty In/Out','설비상태'];
/* 대수는 «상위 12행 안»에 들도록 넉넉히 다르게 둔다 — 순위가 흔들리면 검사가 흔들린다. */
const CORP = [
  { cu:'Micron Memory Taiwan Co., Ltd.(F16)',  fab:'F16',    n:120 },
  { cu:'Powerchip Technology Corporation',      fab:'P3',     n:60  },
  { cu:'Micron Technology Taiwan, Inc.(F11)',   fab:'F11',    n:50  },
  { cu:'Winbond Electronics Corporation',       fab:'F10W',   n:30  },
  { cu:'Micron Memory Taiwan Co., Ltd.(F16N)',  fab:'F16N',   n:24  },
  { cu:'Taiwan-Asia Semiconductor Corporati',   fab:'FAB-4B', n:12  },
];
const instCsv = (corps) => {
  const rows = [IH]; let no = 0;
  corps.forEach((c, ci) => { for (let i = 0; i < c.n; i++) { no++;
    rows.push([no, 'GST TAIWAN SCRUBBER', c.cu, 'TAICHUNG', c.fab, 'A3 M2 4F', 'B' + (i % 9 + 1),
      'TWC' + no, 'TWS' + no, 'GST-' + (1000 + ci), 'BURN-WET', 'SINGLE',
      'ETCH', 'DRY', 'DRY-A', 'MT' + no, 'TEL', 'TEL-A',
      '2023-03-01', '2023-03-10', '2023-03-20', '2027-01-01', 'IN', 'Operation']); } });
  return csv(rows);
};

const RH = ['인사','담당구분','구분','운영단위','고객사','지역','팀','단지','라인',
  '이름(영문)','이름(중문)','입사일','퇴사일','업무/직책','현장 인원여부','사원번호'];
/* 단지 칸이 사용자 화면의 N열 그대로다 — F16·F16N·F11 이 «따로» 적혀 있다.
   TASC 담당은 고객사가 PSMC 로 적혀 있다(실물 그대로 — 그래서 합쳐야 한다). */
const PPL = [
  { camp:'F16',  cust:'Micron',  n:26 },
  { camp:'F16N', cust:'Micron',  n:9  },
  { camp:'F11',  cust:'Micron',  n:12 },
  { camp:'PSMC', cust:'PSMC',    n:14 },
  { camp:'TASC', cust:'PSMC',    n:4  },
  { camp:'F10W', cust:'Winbond', n:7  },
];
const ROSTER_N = PPL.reduce((a, g) => a + g.n, 0);
const rosterCsv = (groups) => {
  const rows = [RH]; let e = 0;
  groups.forEach(g => { for (let i = 0; i < g.n; i++) { e++;
    rows.push(['재직','Scrubber','해외','GST TAIWAN SCRUBBER', g.cust, 'Taichung', 'TW운영팀',
      g.camp, g.camp, 'TW STAFF ' + e, '陳' + e, '2022-05-01', '', '엔지니어', 'O', '11' + (1000 + e)]); } });
  return csv(rows);
};

/* ── 배포된 셸 + report 페이지를 그대로 띄운다 ─────────────────────────── */
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
const ctx = await browser.newContext({ viewport:{ width:1800, height:1100 }, locale:'ko-KR' });
/* ⚠ 포괄 규칙을 «먼저» 등록한다 — Playwright 는 나중에 등록한 것을 먼저 본다. */
await ctx.route('**gstcsglobal-cloud.github.io/**', r => {
  let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
  r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) });
});
const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
  + 'GST.getSession=async function(){return {user:{email:"t@t"}};};GST.token=async function(){return "t";};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();'
  + 'if(GST._authOk)GST._authOk();return true;};';
await ctx.route('**/assets/core.js*', r => r.fulfill({ status:200, contentType:'application/javascript',
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
let INST = instCsv(CORP), ROSTER = rosterCsv(PPL);
await ctx.route('**/spreadsheets/**', r => {
  const gid = (r.request().url().match(/gid=(\d+)/) || [])[1];
  const body = gid === '891608329' ? INST : gid === '1213453343' ? ROSTER : '';
  r.fulfill({ status:200, contentType:'text/csv', body });
});
await ctx.route('**supabase**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));

const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(12000);
const fr = page.frames().find(f => /\/report\//.test(f.url()));
if (!fr) { console.log('❌ report 프레임을 못 찾았다'); process.exit(1); }

/* 고객사 축까지 한 칸 내려간다 — 법인(운영단위)을 하나 고르면 행이 고객사가 된다. */
const table = async () => {
  await page.waitForTimeout(2400);
  return fr.evaluate(() => {
    const T = document.querySelector('.op-tbl');
    const cell = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
    const rows = [...T.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(cell));
    const nx = document.getElementById('opNoteX');
    /* 첫 행에는 rowspan 으로 «한 단계 위» 칸이 붙는다 — 라벨 위치가 한 칸 밀린다. */
    const norm = rows.map((r, i) => (i === 0 && r.length > rows[1].length) ? r.slice(1) : r);
    const H = { lbl:0, unit:1, expat:9, local:10, pm:16 };
    return { rows:norm.map(r => ({ lbl:r[H.lbl],
        unit:+String(r[H.unit]).replace(/[^\d]/g, '') || 0,
        expat:r[H.expat], local:r[H.local] })),
      note: nx ? nx.textContent : '' };
  });
};
const numOf = v => /^[\d,]+$/.test(String(v)) ? +String(v).replace(/,/g, '') : null;
await fr.evaluate(() => GST.filters.set('op', 'GST TAIWAN SCRUBBER'));
let T = await table();
const body = T.rows.filter(r => r.lbl !== 'TOTAL');
const tot = T.rows.filter(r => r.lbl === 'TOTAL')[0];
const find = s => body.filter(r => r.lbl.indexOf(s) >= 0)[0];

console.log('[1] 한 고객사가 여러 법인으로 갈려도 «각 행이 자기 인원»을 받는다');
{
  const want = { '(F16N)':9, '(F11)':12, '(F16)':26 };
  Object.keys(want).forEach(k => {
    const r = find(k);
    const n = r ? (numOf(r.expat) || 0) + (numOf(r.local) || 0) : -1;
    is(!!r && n === want[k],
       `${k} 행의 담당 인원 ${want[k]}명 (실제 ${r ? (r.expat + '+' + r.local) : '행 없음'})`);
  });
  is(!body.some(r => r.expat === '자료없음'),
     '「자료없음」 행이 없다 — 값은 다 있는데 못 받아 가던 자리다'
     + (body.filter(r => r.expat === '자료없음').map(r => r.lbl).join(' · ') || ''));
}

console.log('\n[2] 합계는 그대로다 — 두 번 세지도, 사라지지도 않는다');
{
  const sum = body.reduce((a, r) => a + (numOf(r.expat) || 0) + (numOf(r.local) || 0), 0);
  is(sum === ROSTER_N, `행 합계 = 명부 전원 ${ROSTER_N}명 (실제 ${sum})`);
  const tn = (numOf(tot.expat) || 0) + (numOf(tot.local) || 0);
  is(tn === ROSTER_N, `TOTAL = ${ROSTER_N}명 (실제 ${tn})`);
  const units = body.reduce((a, r) => a + r.unit, 0);
  is(units === CORP.reduce((a, c) => a + c.n, 0), `설비 대수 합 ${CORP.reduce((a,c)=>a+c.n,0)} (실제 ${units})`);
}

console.log('\n[3] PSMC · TASC 는 한 행이다 (사용자 지시)');
{
  const m = find('PSMC & TASC');
  is(!!m, '「PSMC & TASC」 행이 있다');
  is(!!m && m.unit === 72, `그 행의 설비가 PSMC 60 + TASC 12 = 72 (실제 ${m ? m.unit : '-'})`);
  const n = m ? (numOf(m.expat) || 0) + (numOf(m.local) || 0) : -1;
  is(n === 18, `그 행의 인원이 PSMC 14 + TASC 4 = 18 (실제 ${n})`);
  is(!body.some(r => /Powerchip|Taiwan-Asia/.test(r.lbl)), '갈라진 옛 두 행은 남지 않는다');
  is(/PSMC & TASC/.test(T.note), '왜 합쳤는지 노트에 적는다 (안 적으면 다음 사람이 되돌린다)');
}

/* 자료를 갈아끼우고 다시 그린다 — 시나리오마다 페이지를 새로 띄운다. */
const reload = async () => {
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(12000);
  const f = page.frames().find(x => /\/report\//.test(x.url()));
  await f.evaluate(() => GST.filters.set('op', 'GST TAIWAN SCRUBBER'));
  await page.waitForTimeout(2400);
  return f.evaluate(() => {
    const T = document.querySelector('.op-tbl');
    const cell = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
    const rows = [...T.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(cell));
    const norm = rows.map((r, i) => (i === 0 && r.length > rows[1].length) ? r.slice(1) : r);
    return norm.map(r => ({ lbl:r[0], unit:+String(r[1]).replace(/[^\d]/g, '') || 0,
                            expat:r[9], local:r[10] }));
  });
};

console.log('\n[4] 합치기는 «둘 다 있을 때»만 — 한쪽만 남으면 원문 이름 그대로');
{
  INST = instCsv(CORP.filter(c => !/Taiwan-Asia/.test(c.cu)));   // TASC 설비를 뺀다
  const R = (await reload()).map(r => r.lbl);
  is(R.indexOf('Powerchip Technology Corporation') >= 0,
     'TASC 설비가 없으면 「Powerchip Technology Corporation」 원문 그대로 선다 (실제 ' + R.join(' · ') + ')');
  is(R.indexOf('PSMC & TASC') < 0, '없는 것을 있다고 적지 않는다');
}

/* ══════════════════════════════════════════════════════════════
   [5] 상위 12 밖(«기타») · 설비에 아예 없는 값 — v122 · v98 규약
   설비는 «기타»로 담기는데 인원만 빠지면 같은 행의 두 칸이 다른 모집단을 본다.
   그렇다고 «설비 축에 없는 값»까지 기타로 몰면 안 된다 — 국내는 설비가 '삼성전자' ·
   인원이 'P1' 이라 어휘가 안 붙을 수 있고, 그때 빈 칸이 곧 «자료가 없다»는 사실이다.
   ⚠ 이 둘은 소스로는 «규칙이 있는지»만 보인다. 숫자가 맞는지는 그려 봐야 안다.
   ══════════════════════════════════════════════════════════════ */
console.log('\n[5] 상위 12 밖은 «기타»로 담고, 설비에 없는 값은 몰지 않는다');
{
  const WIDE = [];
  for (let i = 0; i < 14; i++)                       // 14개 고객사 → 둘이 상위 12 밖
    WIDE.push({ cu:'Customer ' + String.fromCharCode(65 + i) + ' Corporation',
                fab:'X' + i, n:200 - i * 5 });
  INST = instCsv(WIDE);
  ROSTER = rosterCsv([
    { camp:'X0',  cust:'Customer A Corporation', n:11 },   // 상위 12 안
    { camp:'X12', cust:'Customer M Corporation', n:5 },    // 13번째 → 기타
    { camp:'X13', cust:'Customer N Corporation', n:3 },    // 14번째 → 기타
    { camp:'F16', cust:'TSMC',                   n:7 },    // 설비가 아예 없다 → 담지 않는다
  ]);
  const R = await reload();
  const num = v => /^[\d,]+$/.test(String(v)) ? +String(v).replace(/,/g, '') : 0;
  const hc = r => num(r.expat) + num(r.local);
  const etc = R.filter(r => r.lbl === '기타')[0];
  const tot = R.filter(r => r.lbl === 'TOTAL')[0];
  is(!!etc, '상위 12 밖이 있으면 「기타」 행이 선다');
  is(!!etc && etc.unit === 275, `「기타」 설비 = 13·14번째 140+135 = 275 (실제 ${etc ? etc.unit : '-'})`);
  is(!!etc && hc(etc) === 8, `「기타」 인원 = 5+3 = 8명 (실제 ${etc ? hc(etc) : '-'})`);
  is(!!tot && hc(tot) === 19,
     `TOTAL = 11+5+3 = 19명 — 설비에 없는 TSMC 7명은 «기타»로 몰지 않는다 (실제 ${tot ? hc(tot) : '-'})`);
}

is(!errs.length, 'JS 에러 0건' + (errs.length ? ' → ' + errs[0] : ''));
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-optbl ${pass}/${pass + fail}` : `\n✅ t-optbl ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
