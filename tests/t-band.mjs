/* 범위 띠 (v179 · 사용자 요청 「다른 페이지 필터도 글로벌 현황처럼 심플하면서 완벽하게」). 실제 브라우저.

   지키는 것:
     [1] 공통 필터를 단 페이지 맨 위에 띠가 선다 — 구분 · 운영단위 · 단지 · 기간 · 상세 필터.
     [2] 띠는 «두 벌 모두»에 건다 — 설비(pass)와 인원(passH)이 같은 범위를 본다(인당 지표 10.8h 사고 · v112).
     [3] 목록은 두 벌의 «실제로 있는 값»을 합친 것이고 다른 축으로 좁혀진다(사이드바와 같은 목록).
     [4] 인원에 그 축 값이 빈 사람은 빠진다 — 몇 명인지 띠에 적는다(조용히 빼지 않는다).
     [5] 사이드바에서 여럿·한쪽만 고르면 띠는 «N개 선택»을 보이고 그 값을 덮지 않는다 · 상세 필터 수를 센다.
     [6] 빠른 기간은 «로컬» 날짜로 찍는다(v109 · 두 시계를 섞지 않는다) · 해제가 다 푼다.
     [7] 언어를 바꾸면 띠 글자도 바뀐다.
   node t-band.mjs   (PW_CHROMIUM 필요) */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

/* 지어낸 자료 — 설비 셋(국내 둘 · 해외 하나) · 인원 넷(그중 하나는 운영단위 공란) */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>band</title>
<link rel="stylesheet" href="/assets/theme.css"></head><body>
<div class="slicers"></div>
<div class="kpis"><div class="kpi"><div class="val" id="kp1">0</div></div></div>
<div class="card"><h3>c</h3><canvas id="cX"></canvas></div>
<script src="/assets/core.js"></script>
<script>
  GST.authOn=function(){return false;};
  const ROWS=[{rg:'국내',op:'SEC Scrubber',ca:'H3',dt:'2026-08-01'},{rg:'국내',op:'SEC Scrubber',ca:'H2',dt:'2026-08-02'},
              {rg:'해외',op:'GST TAIWAN SCRUBBER',ca:'F16',dt:'2026-07-01'}];
  const PEOPLE=[{rg:'국내',op:'SEC Scrubber',ca:'H3',tm:'A팀'},{rg:'국내',op:'SEC Scrubber',ca:'H2',tm:'B팀'},
                {rg:'국내',op:'',ca:'H3',tm:'A팀'},{rg:'해외',op:'GST TAIWAN SCRUBBER',ca:'F16',tm:'C팀'}];
  window.RENDERS=0;
  GST.filters.mount({page:'band', rows:()=>ROWS, rowsH:()=>PEOPLE, onChange:()=>{window.RENDERS++;},
    get:{region:x=>x.rg, op:x=>x.op, campus:x=>x.ca, date:x=>new Date(x.dt)},
    getH:{region:x=>x.rg, op:x=>x.op, campus:x=>x.ca, team:x=>x.tm}});
  GST.filters.clear();
  window.cnt=()=>({eq:ROWS.filter(x=>GST.filters.pass(x)).length, hr:PEOPLE.filter(x=>GST.filters.passH(x)).length});
</script></body></html>`;

const br = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const pg = await br.newPage(); const errs = [];
pg.on('pageerror', e => errs.push(String(e)));
await pg.route('https://gst.test/**', route => {
  const u = new URL(route.request().url()).pathname;
  const fp = ROOT + u;
  if (u === '/' || u === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
  if (fs.existsSync(fp) && fs.statSync(fp).isFile())
    return route.fulfill({ status: 200, contentType: u.endsWith('.js') ? 'text/javascript' : u.endsWith('.css') ? 'text/css' : 'text/html', body: fs.readFileSync(fp) });
  route.fulfill({ status: 404, contentType: 'text/plain', body: 'nf' });
});
await pg.goto('https://gst.test/index.html', { waitUntil: 'load' });
await pg.waitForTimeout(400);
const st = () => pg.evaluate(() => {
  const b = document.getElementById('gstBand'); if (!b) return null;
  const opt = id => Array.from(document.getElementById(id).options).map(o => o.textContent);
  return { seg: Array.from(b.querySelectorAll('[data-gbr]')).map(x => x.textContent + (x.getAttribute('aria-pressed') === 'true' ? '*' : '')),
    op: opt('gb-op'), opv: document.getElementById('gb-op').value, ca: opt('gb-campus'), cav: document.getElementById('gb-campus').value,
    x: document.getElementById('gb-x').hidden ? '' : document.getElementById('gb-x').textContent,
    more: document.getElementById('gb-more').textContent, clr: !document.getElementById('gb-clr').hidden,
    dt: !document.getElementById('gb-dt').hidden, from: GST.filters.F.dtFrom, to: GST.filters.F.dtTo,
    eqOp: GST.filters.chosen('op').join(), hrOp: GST.filters.chosenH('op').join(),
    eqRg: GST.filters.chosen('region').join(), hrRg: GST.filters.chosenH('region').join(), c: window.cnt(),
    before: (b.nextElementSibling || {}).className || '' };
});

console.log('[1] 띠가 선다 — 구분 · 운영단위 · 단지 · 기간 · 상세 필터');
let s = await st();
is(!!s, '공통 필터를 단 페이지에 #gstBand 가 생긴다');
is(s && s.seg.join('|') === '전체*|국내|해외', '구분 — 전체·국내·해외(자료에 있는 값) · 처음엔 «전체» (' + (s && s.seg.join('|')) + ')');
is(s && /fchips|kpis/.test(s.before), '칩 줄·KPI 바로 위에 선다 (' + (s && s.before) + ')');
is(s && s.dt, '날짜 축이 있는 화면에는 기간 칸이 있다');
is(s && !s.clr, '아무것도 안 걸렸으면 «해제» 단추가 없다');

console.log('\n[2] 띠는 두 벌 모두에 건다 — 설비와 인원이 같은 범위');
await pg.click('#gstBand [data-gbr="국내"]');
s = await st();
is(s.eqRg === '국내' && s.hrRg === '국내', '구분 «국내» → 설비·인원 두 벌이 같이 국내 (' + s.eqRg + ' / ' + s.hrRg + ')');
is(s.c.eq === 2 && s.c.hr === 3, '거른 결과 — 설비 2 · 인원 3 (' + JSON.stringify(s.c) + ')');
is(s.seg.join('|') === '전체|국내*|해외', '고른 단추가 눌린 모양');

console.log('\n[3] 목록 — 두 벌의 «있는 값» · 다른 축으로 좁혀진다');
is(s.op.join('|') === '전체|SEC Scrubber', '국내를 고르면 운영단위 목록에 국내 값만 (' + s.op.join('|') + ')');
await pg.selectOption('#gb-op', 'SEC Scrubber');
s = await st();
is(s.eqOp === 'SEC Scrubber' && s.hrOp === 'SEC Scrubber', '운영단위 → 두 벌에 같이 걸린다');

console.log('\n[4] 그 축이 빈 인원은 빠진다 — 몇 명인지 적는다');
is(s.c.hr === 2, '운영단위가 빈 1명은 인원 범위에서 빠진다 (인원 ' + s.c.hr + ')');
is(/1명/.test(s.x) && /운영단위/.test(s.x), '띠가 «운영단위 미기재 인원 1명»을 적는다 (' + s.x + ')');

console.log('\n[5] 사이드바에서 여럿·한쪽만 → «N개 선택» · 상세 필터 수');
await pg.evaluate(() => GST.filters.set('campus', ['H3', 'H2']));
s = await st();
is(/2개 선택/.test(s.ca.join('|')) && s.cav === '\x02', '단지를 사이드바에서 둘 고르면 띠는 «2개 선택»을 보이고 덮지 않는다 (' + s.ca.join('|') + ')');
is(/상세 필터\s*1/.test(s.more), '한쪽(설비)만 건 띠 축은 «상세 필터 1»로 센다 (' + s.more + ')');
await pg.evaluate(() => GST.filters.setH('team', 'A팀'));
s = await st();
is(/상세 필터\s*2/.test(s.more), '띠 밖 축(인원 팀)도 센다 (' + s.more + ')');

console.log('\n[6] 빠른 기간은 로컬 날짜 · 해제가 다 푼다');
await pg.click('#gstBand [data-gbp="30"]');
s = await st();
const exp = await pg.evaluate(() => { const n = new Date(), a = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 29);
  const f = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return f(a) + '|' + f(n); });
is(s.from + '|' + s.to === exp, '「30일」 → 오늘 포함 30일 (로컬 · ' + s.from + ' ~ ' + s.to + ')');
const r0 = await pg.evaluate(() => window.RENDERS);
await pg.click('#gb-clr');
s = await st();
is(!s.eqRg && !s.hrRg && !s.eqOp && !s.hrOp && !s.from && !s.to && s.c.eq === 3 && s.c.hr === 4, '「해제」 → 두 벌·기간이 전부 풀린다');
is(await pg.evaluate(() => window.RENDERS) > r0, '풀면 페이지가 다시 그려진다(onChange)');

console.log('\n[7] 언어를 바꾸면 띠 글자도');
await pg.evaluate(() => { sessionStorage.setItem('gst_lang', 'en'); GST.filters.relabel(); });
s = await st();
is(s.seg[0].replace('*', '') === 'All' && /Korea/.test(s.seg.join()) && /More filters/.test(s.more), '영어 — All · Korea · More filters (' + s.seg.join('|') + ' · ' + s.more + ')');
await pg.evaluate(() => { sessionStorage.setItem('gst_lang', 'ko'); GST.filters.relabel(); });

is(errs.length === 0, 'JS 에러 없음' + (errs.length ? ' → ' + errs.slice(0, 2).join(' | ') : ''));
await br.close();
console.log(fail ? `\n❌ t-band: ${pass} 통과 · ${fail} 실패` : `\n✅ t-band: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
