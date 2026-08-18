/* KPI 스냅샷 — 큰 이행 전에 떠 두고, 이행 후 대조한다.
   v76에서 F.line(문자열)이 F.fab(Set) + F.floor(문자열)로 갈라진다. 이 키는 여섯 페이지가
   쓰고 드릴·피벗·칩·저장상태에 퍼져 있어서, 한 곳만 놓치면 카드끼리 모집단이 갈리는데
   **에러가 나지 않는다.** 그래서 숫자를 먼저 박제해 둔다.

     node t-snap.mjs --save    → tests/.snap.json 에 기록 (커밋하지 않는다)
     node t-snap.mjs           → 기록과 대조. 한 자리라도 다르면 실패
*/
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PW_OPTS = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HERE = path.dirname(new URL(import.meta.url).pathname);

/* 픽스처가 없으면 «크래시»한다 — npm run all 이 여기서 죽어 나머지가 안 돈다.
   조용히 견디되 초록불은 안 준다. 실제 CI 는 STRICT_FIXTURES=1 로 실패시킨다. */
{
  const _need = ["csv_wk.csv", "csv_inst.csv"];
  const _miss = _need.filter((f) => !fs.existsSync(path.join(HERE, f)));
  if (_miss.length) {
    console.log('⚠️  픽스처가 없어 이 검사를 못 했다: ' + _miss.join(', ') + ' (tests/README.md 로 생성)');
    process.exit(process.env.STRICT_FIXTURES ? 2 : 0);
  }
}

const SNAP = path.join(HERE, '.snap.json');
const SAVE = process.argv.includes('--save');

const CSV = { '646668307':'csv_wk.csv', '31302669':'csv_mat.csv', '891608329':'csv_inst.csv',
  '2123129719':'csv_cip11.csv', '1999732389':'csv_cip16.csv' };

const PAGES = ['fault','material','pm','scrubber','tco','cip','report','hr'];

/* 시계를 고정한다. tco가 유틸리티 비용을 **벽시계 경과시간에 적분**하기 때문에
   (tco/index.html의 `const NOW=Date.now()`) 코드를 한 줄도 안 고치고 하루 뒤 다시 재면
   값이 계속 흐른다. 예전에는 0.5% 허용오차로 덮었는데, 그러면 그만큼의 진짜 회귀를
   못 잡고 시간이 더 지나면 결국 거짓 실패가 난다(실제로 났다).
   고정하면 대조가 정확해진다. 기간 필터도 이 시각을 기준으로 일관되게 돈다. */
const FROZEN = Date.UTC(2026, 7, 13, 3, 0, 0);   // 2026-08-13 12:00 KST
const FREEZE = `(() => {
  const R = Date, T = ${FROZEN};
  function D(...a){ return a.length ? new R(...a) : new R(T); }
  D.prototype = R.prototype;
  D.now = () => T; D.parse = R.parse; D.UTC = R.UTC;
  Object.setPrototypeOf(D, R);
  globalThis.Date = D;
  globalThis.performance && (globalThis.performance.now = () => 0);
})();`;

async function shot(browser, page_){
  const ctx = await browser.newContext();
  const errs = [];
  const page = await ctx.newPage();
  await page.addInitScript(FREEZE);
  page.on('pageerror', e => errs.push('JS: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('con: ' + m.text().slice(0,140)); });

  await page.route('**/assets/core.js', r => r.fulfill({ status:200, contentType:'application/javascript',
    body: fs.readFileSync(ROOT + '/assets/core.js','utf8')
      + '\n;GST.authOn=function(){return false;};GST.getSession=async function(){return {user:{email:"t@t"}};};'
      + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.style.display="none";'
      + 'if(GST._authOk)GST._authOk();return true;};GST.token=async function(){return "t";};' }));
  await page.route('**/assets/*.css', r => {
    const n = r.request().url().split('/').pop().split('?')[0];
    try { r.fulfill({ status:200, contentType:'text/css', body: fs.readFileSync(ROOT+'/assets/'+n,'utf8') }); }
    catch { r.fulfill({ status:200, contentType:'text/css', body:'' }); }
  });
  await page.route('**/cdn.jsdelivr.net/**', r => {
    const u = r.request().url();
    const send = (p,c) => r.fulfill({ status:200, contentType:c, body: fs.readFileSync(p,'utf8') });
    if (u.includes('chart.umd')) return send(HERE+'/node_modules/chart.js/dist/chart.umd.js','application/javascript');
    if (u.includes('papaparse')) return send(HERE+'/node_modules/papaparse/papaparse.min.js','application/javascript');
    if (u.endsWith('.css'))      return r.fulfill({ status:200, contentType:'text/css', body:'' });
    return r.fulfill({ status:200, contentType:'application/javascript',
      body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};' });
  });
  await page.route('**/spreadsheets/**', r => {
    const g = (r.request().url().match(/gid=(\d+)/)||[])[1];
    r.fulfill({ status:200, contentType:'text/csv',
      body: CSV[g] ? fs.readFileSync(path.join(HERE, CSV[g]),'utf8') : '' });
  });
  await page.route('**supabase**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));

  await page.goto('file://' + ROOT + '/' + page_ + '/index.html', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(7000);

  // KPI 값 + 모든 차트의 데이터 합 + 표 행수 — 화면이 실제로 그린 숫자만 본다
  const out = await page.evaluate(() => {
    const kpi = [];
    document.querySelectorAll('.kpi .val,.kpi .v,.kpi-v,.kv,.kpi b,.kd,.kf').forEach(e => {
      const t = (e.textContent||'').trim(); if (t) kpi.push(t);
    });
    const charts = {};
    try {
      // 페이지들은 인라인 스크립트라 `const CHARTS={}`가 window에 붙지 않는다.
      // 전역 스코프에서는 이름으로 닿으므로 typeof로 확인해 집는다.
      // eslint-disable-next-line no-undef
      const store = (typeof CHARTS !== 'undefined' && CHARTS) ? CHARTS : (window.CHARTS || {});
      Object.keys(store).sort().forEach(k => {
        const c = store[k]; if (!c || !c.data) return;
        let sum = 0, n = 0;
        (c.data.datasets||[]).forEach(d => (d.data||[]).forEach(v => {
          const x = (v && typeof v === 'object') ? (v.y ?? v.x) : v;
          if (typeof x === 'number' && isFinite(x)) { sum += x; n++; }
        }));
        charts[k] = { n, sum: Math.round(sum*100)/100, labels:(c.data.labels||[]).length };
      });
    } catch(e){}
    const tables = {};
    document.querySelectorAll('tbody[id]').forEach(tb => {
      tables[tb.id] = tb.querySelectorAll('tr').length;
    });
    return { kpi, charts, tables };
  });
  await ctx.close();
  return { ...out, errs };
}

const browser = await chromium.launch(PW_OPTS);
const now = {};
for (const p of PAGES) {
  process.stdout.write(`  ${p} … `);
  try { now[p] = await shot(browser, p); console.log(`KPI ${now[p].kpi.length} · 차트 ${Object.keys(now[p].charts).length} · 표 ${Object.keys(now[p].tables).length}${now[p].errs.length?' ⚠ 에러'+now[p].errs.length:''}`); }
  catch(e){ now[p] = { err: e.message }; console.log('실패: ' + e.message); }
}
await browser.close();

if (SAVE) {
  fs.writeFileSync(SNAP, JSON.stringify(now, null, 1));
  console.log('\n📌 스냅샷 저장: tests/.snap.json — 이행 후 `node t-snap.mjs`로 대조하라');
  process.exit(0);
}

if (!fs.existsSync(SNAP)) {
  console.log('\n스냅샷이 없다. 먼저 `node t-snap.mjs --save`로 기준을 떠라.');
  process.exit(1);
}
const base = JSON.parse(fs.readFileSync(SNAP,'utf8'));
let diff = 0;
for (const p of PAGES) {
  const a = base[p], b = now[p];
  if (!a || !b) continue;
  const say = m => { diff++; console.log(`  ❌ ${p}: ${m}`); };
  if (JSON.stringify(a.kpi) !== JSON.stringify(b.kpi)) {
    say('KPI 변경');
    a.kpi.forEach((v,i) => { if (v !== b.kpi[i]) console.log(`       [${i}] ${v} → ${b.kpi[i]}`); });
    if (b.kpi.length !== a.kpi.length) console.log(`       개수 ${a.kpi.length} → ${b.kpi.length}`);
  }
  /* 시계를 고정했으므로(위 FREEZE) 차트 합은 **정확히** 같아야 한다.
     부동소수점 누적 오차만 열어 둔다. 허용오차를 넓게 두면 그만큼의 회귀를 못 잡는다. */
  const TOL = 1e-9;
  Object.keys(a.charts).forEach(k => {
    const x = a.charts[k], y = b.charts[k];
    if (!y) return say(`차트 ${k} 사라짐`);
    if (x.n !== y.n) return say(`차트 ${k} 데이터 점수 ${x.n} → ${y.n}`);
    const d = Math.abs(y.sum - x.sum), rel = x.sum ? d / Math.abs(x.sum) : (d ? 1 : 0);
    if (rel > TOL) say(`차트 ${k} 합 ${x.sum} → ${y.sum} (${(rel*100).toFixed(2)}%)`);
  });
  Object.keys(a.tables).forEach(k => {
    if (b.tables[k] === undefined) return say(`표 ${k} 사라짐`);
    if (a.tables[k] !== b.tables[k]) say(`표 ${k} 행수 ${a.tables[k]} → ${b.tables[k]}`);
  });
  if (b.errs && b.errs.length) say('JS 에러: ' + b.errs.slice(0,2).join(' // '));
}
console.log(diff ? `\n❌ ${diff}건 달라졌다 — 의도한 변경인지 하나씩 확인하라`
                 : '\n✅ 모든 페이지 KPI·차트·표가 이행 전과 동일');
process.exit(diff ? 1 : 0);
