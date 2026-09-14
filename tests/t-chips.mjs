/* 공용 필터의 «상태 표시» — 칩·이름표·빈 표·실패 문구 (v135 · 5단계). 실제 브라우저.

   지키는 것:
     [1] 자기 칩 줄이 없는 페이지에 core 가 칩 줄을 끼워 넣고, 걸린 축을 칩으로 보여준다 — 어제 걸어 둔 조건이
         오늘 화면을 좁히는데 아무 표시가 없던 자리(pm·scrubber). ✕ 로 한 축만 풀리고 「전체 해제」로 다 풀린다.
     [2] 언어를 바꾸면 사이드바 이름표·「전체」·칩 줄이 그 언어로 바뀐다 — core.js 에 한국어로 박혀 있던 열여덟 칸.
     [3] 빈 표 문구는 «필터 때문»과 «표가 빔»을 가르고, 「자료 없음」이라고 적지 않는다.
     [4] 로드 실패 문구는 부류별 한 줄이고 원문은 관리자에게만 붙는다.
   ⚠ 소스로는 원리적으로 못 본다 — 칩 줄이 «실제로 끼워지는지»·이름표가 «실제로 바뀌는지»는 DOM 이 있어야 한다.

   node t-chips.mjs   (PW_CHROMIUM 필요) */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>chips</title>
<link rel="stylesheet" href="/assets/theme.css"></head><body>
<div class="slicers"></div>
<div class="kpis"><div class="kpi"><div class="val" id="kp1">0</div></div></div>
<div class="card"><h3>c</h3><div class="card-note"></div><canvas id="cX"></canvas></div>
<script src="/assets/core.js"></script>
<script>
  GST.authOn=function(){return false;};
  const ROWS=[{rg:'국내',op:'SEC Scrubber',ca:'H3',dt:'2026-08-01'},{rg:'국내',op:'SEC Scrubber',ca:'H2',dt:'2026-08-02'},
              {rg:'해외',op:'GST TAIWAN SCRUBBER',ca:'F16',dt:'2026-07-01'}];
  window.RENDERS=0;
  GST.filters.mount({page:'chips', rows:()=>ROWS, onChange:()=>{window.RENDERS++;},
    get:{region:x=>x.rg, op:x=>x.op, campus:x=>x.ca, date:x=>new Date(x.dt)}});
  GST.filters.clear();
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

console.log('[1] core 가 끼워 넣는 칩 줄 — 걸린 축이 보이고, ✕ 와 전체 해제가 실제로 푼다');
{
  const st0 = await pg.evaluate(() => { const b = document.getElementById('fchips'); return b ? { gst: !!b.dataset.gst, disp: b.style.display } : null; });
  is(!!st0 && st0.gst, '자기 칩 줄이 없는 페이지에 #fchips[data-gst] 가 생겼다');
  is(!!st0 && st0.disp === 'none', '아무것도 안 걸렸으면 칩 줄은 숨는다');
  await pg.evaluate(() => { GST.filters.set('campus', 'H3'); GST.filters.set('region', '국내'); });
  const st1 = await pg.evaluate(() => { const b = document.getElementById('fchips');
    return { disp: b.style.display, txt: b.textContent, n: b.querySelectorAll('.fchip').length }; });
  is(st1.disp === 'flex' && st1.n === 2, '두 축을 걸면 칩 두 개가 뜬다 (실제 ' + st1.n + ')');
  is(/단지: ?H3/.test(st1.txt) && /구분: ?국내/.test(st1.txt), '칩에 이름표와 값이 적힌다 — ' + JSON.stringify(st1.txt.trim()));
  const before = await pg.evaluate(() => window.RENDERS);
  await pg.evaluate(() => { Array.from(document.querySelectorAll('#fchips .fchip')).find(e => /단지/.test(e.textContent)).click(); });   // 단지 칩의 ✕ → 그 축만 (칩은 AXES 순서라 첫 칩은 구분이다)
  const st2 = await pg.evaluate(() => ({ n: document.querySelectorAll('#fchips .fchip').length,
    camp: GST.filters.chosen('campus').join(), rg: GST.filters.chosen('region').join(), r: window.RENDERS }));
  is(st2.n === 1 && st2.camp === '' && st2.rg === '국내', '칩 하나를 누르면 «그 축만» 풀린다 (남은 구분=' + st2.rg + ')');
  is(st2.r > before, '풀면 페이지가 다시 그려진다(onChange)');
  await pg.evaluate(() => { document.querySelector('#fchips .fchip-clear').click(); });
  const st3 = await pg.evaluate(() => ({ disp: document.getElementById('fchips').style.display, rg: GST.filters.chosen('region').join() }));
  is(st3.rg === '' && st3.disp === 'none', '「전체 해제」로 전부 풀리고 칩 줄이 숨는다');
  /* 기간도 한 축이다 — 두 날짜 칸이 한 칩 */
  await pg.evaluate(() => { GST.filters.F.dtFrom = '2026-08-01'; GST.filters.F.dtTo = '2026-08-31'; GST.filters.refresh(); });
  const st4 = await pg.evaluate(() => ({ n: document.querySelectorAll('#fchips .fchip').length, txt: document.getElementById('fchips').textContent }));
  is(st4.n === 1 && /2026-08-01 ~ 2026-08-31/.test(st4.txt), '기간은 한 칩으로 — ' + JSON.stringify(st4.txt.trim()));
  await pg.evaluate(() => { document.querySelector('#fchips .fchip').click(); });
  const st5 = await pg.evaluate(() => ({ f: GST.filters.F.dtFrom + '|' + GST.filters.F.dtTo, n: document.querySelectorAll('#fchips .fchip').length }));
  is(st5.f === '|' && st5.n === 0, '기간 칩의 ✕ 는 두 날짜를 함께 비운다');
}

console.log('\n[2] 언어를 바꾸면 사이드바 이름표·「전체」·칩 줄이 그 언어로');
{
  const ko = await pg.evaluate(() => ({
    lbl: Array.from(document.querySelectorAll('.gf-base [data-fk]')).map(e => e.textContent).slice(0, 3).join('|'),
    grp: document.querySelector('.gf-base .gf-grp[data-fg="eq"]').textContent,
    btn: document.getElementById('gf-campusBtn').textContent.trim(),
    chip: document.querySelector('#fchips .gst-fchips-c').textContent }));
  is(ko.lbl === '구분|팀|운영단위', '기본(ko) 이름표 — ' + ko.lbl);
  await pg.evaluate(() => { GST.applyI18n(k => k, 'en'); });
  const en = await pg.evaluate(() => ({
    lbl: Array.from(document.querySelectorAll('.gf-base [data-fk]')).map(e => e.textContent).slice(0, 3).join('|'),
    grp: document.querySelector('.gf-base .gf-grp[data-fg="eq"]').textContent,
    btn: document.getElementById('gf-campusBtn').textContent.trim(),
    chip: document.querySelector('#fchips .gst-fchips-c').textContent,
    lang: sessionStorage.getItem('gst_lang') }));
  is(en.lbl === 'Region|Team|Entity', 'en 으로 바꾸면 축 이름표가 바뀐다 — ' + en.lbl);
  is(/^Equipment/.test(en.grp), '블록 머리글도 바뀐다 — ' + en.grp);
  is(/^All/.test(en.btn), '다중선택 버튼의 「전체」도 바뀐다 — ' + en.btn);
  is(en.chip === 'Clear all', '칩 줄의 「전체 해제」도 바뀐다 — ' + en.chip);
  is(en.lang === 'en', 'applyI18n 이 언어를 sessionStorage 에 남긴다 (core 사전이 페이지 언어를 따라간다)');
  await pg.evaluate(() => { GST.filters.set('campus', 'H3'); });
  const chipEn = await pg.evaluate(() => document.querySelector('#fchips .fchip').textContent);
  is(/^Site: ?H3/.test(chipEn), '칩 이름표도 그 언어다 — ' + JSON.stringify(chipEn.trim()));
  await pg.evaluate(() => { GST.filters.clear(); GST.applyI18n(k => k, 'ko'); });
  const back = await pg.evaluate(() => Array.from(document.querySelectorAll('.gf-base [data-fk]')).map(e => e.textContent).slice(0, 3).join('|'));
  is(back === '구분|팀|운영단위', 'ko 로 되돌리면 되돌아온다 — ' + back);
  /* data-i-ph · data-i-title 도 한 벌에서 */
  await pg.evaluate(() => { const i = document.createElement('input'); i.id = 'phT'; i.setAttribute('data-i-ph', 'ph_key'); document.body.appendChild(i);
    const b = document.createElement('button'); b.id = 'tiT'; b.setAttribute('data-i-title', 'ti_key'); document.body.appendChild(b);
    GST.applyI18n(k => ({ ph_key: 'PH!', ti_key: 'TI!' })[k] || k, 'ko'); });
  const ph = await pg.evaluate(() => document.getElementById('phT').placeholder + '|' + document.getElementById('tiT').title);
  is(ph === 'PH!|TI!', 'data-i-ph · data-i-title 도 applyI18n 한 벌이 본다');
}

console.log('\n[3] 빈 표 문구 — «필터 때문»과 «표가 빔»을 가른다');
{
  const r = await pg.evaluate(() => ({ f: GST.emptyHTML(1234), e: GST.emptyHTML(0), rows: GST.emptyRowsText() }));
  is(/1,234/.test(r.f) && /gst-empty-clear/.test(r.f) && /GST\.clearFilters\(\)/.test(r.f), '필터 때문이면 «지우면 N건» + 해제 버튼 — ' + r.f.replace(/<[^>]+>/g, ''));
  is(!/자료 없음/.test(r.f) && !/자료 없음/.test(r.e), '어느 쪽도 「자료 없음」이라고 하지 않는다');
  is(/관리자/.test(r.e) && !/gst-empty-clear/.test(r.e), '표가 비었으면 관리자에게 — 해제 버튼은 없다');
  is(typeof r.rows === 'string' && r.rows.length > 0, '드릴 표의 «행 없음» 문구가 있다 — ' + r.rows);
  /* 해제 버튼은 페이지의 clearAllFilters 를 먼저 쓴다 */
  const via = await pg.evaluate(() => { let hit = 0; window.clearAllFilters = () => { hit++; }; GST.clearFilters(); delete window.clearAllFilters; return hit; });
  is(via === 1, 'GST.clearFilters 는 페이지의 clearAllFilters 를 먼저 부른다(페이지 전용 필터까지 지운다)');
}

console.log('\n[4] 로드 실패 문구 — 부류별 한 줄 · 원문은 관리자에게만');
{
  const r = await pg.evaluate(() => {
    GST._me = { role: 'viewer' };
    const v = [new Error('AUTH 401'), new Error('Failed to fetch'), new Error('MIRROR_EMPTY — 아직'), new Error('READ column x does not exist'), new Error('boom')].map(e => GST.failNote(e));
    GST._me = { role: 'admin' };
    const a = GST.failNote(new Error('Failed to fetch'));
    GST._me = null;
    return { v, a };
  });
  is(/로그인/.test(r.v[0]), '인증 → 다시 로그인 — ' + r.v[0]);
  is(/네트워크/.test(r.v[1]), '네트워크 → 확인·새로고침 — ' + r.v[1]);
  is(/관리자/.test(r.v[2]) && /비어|적재/.test(r.v[2]), '표 미적재 → 관리자 — ' + r.v[2]);
  is(/읽지 못/.test(r.v[3]), '읽기 실패 → 새로고침·관리자 — ' + r.v[3]);
  is(/불러오지 못/.test(r.v[4]), '그 밖 → 일반 문구 — ' + r.v[4]);
  is(r.v.every(x => !/Failed to fetch|AUTH 401|column x/.test(x)), '조회자에게는 원문이 안 붙는다');
  is(/\(Failed to fetch\)/.test(r.a), '관리자에게는 원문이 붙는다 — ' + r.a);
  const st = await pg.evaluate(() => [GST.staleText(12), GST.staleText()]);
  is(/12분 전/.test(st[0]) && /캐시/.test(st[1]) && !/undefined|NaN/.test(st[1]), '캐시 표시 문구 — ' + st.join(' / '));
}

console.log('\n[5] 카드 노트 — 줄바꿈·경고 등급');
{
  const r = await pg.evaluate(() => { GST.setNote('cX', '첫 줄\n둘째 줄', 'warn'); const n = document.querySelector('.card-note');
    const a = { txt: n.textContent, warn: n.classList.contains('warn'), ml: n.classList.contains('ml') };
    GST.setNote('cX', '한 줄', ''); a.warn2 = n.classList.contains('warn'); a.ml2 = n.classList.contains('ml'); return a; });
  is(r.warn && r.ml && /\n/.test(r.txt), 'warn + 줄바꿈이면 .warn .ml 이 붙는다');
  is(!r.warn2 && !r.ml2, '보통 문장이면 둘 다 떨어진다');
}

is(errs.length === 0, 'JS 에러가 없어야 한다' + (errs.length ? ' — ' + errs.join(' | ') : ''));
await br.close();
console.log((fail ? '❌' : '✅') + ' t-chips: ' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
