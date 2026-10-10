/* t-tblmap — 읽기 경로의 «표 지도»(GST.TBL_MAP · TBL_NS) · 셸에 데모 탭이 없다

   v146 의 주간현황(국내) 데모는 v176 에 접었다(사용자 확정 「국내 데모 페이지는 필요없다 · 전체 업로드 할 거라」) —
   /report-kr/ · 업로드·데이터 관리의 ?site=KR · 데모 표(kr_sheet_* · 사람이 supabase/teardown-kr-demo.sql 을 Run)를 걷어냈다.
   남긴 것은 core 의 표 지도 한 층이다. 지도가 비면 한 글자도 안 바뀌고(표 이름·적재 기록 열쇠·캐시 열쇠 그대로),
   읽기 경로 셋(dbRows · csvTableRows · fetchCSVCached)이 같은 지도를 보는 일반 장치라 지우면 오히려 그 셋을 건드린다.

   지키는 것:
     [1] core — 표 지도가 비면 운영 화면은 그대로 · 지도가 있으면 읽기 경로 셋이 전부 지도 쪽 표를 본다 ·
         두 갈래의 캐시(IndexedDB · localStorage)가 섞이지 않는다 · 지도 쪽 표를 못 읽으면 «시트로 폴백하지 않는다».
     [2] 셸 — 데모 탭이 어느 등급에게도 없다 · 순회 목록도 탭 줄과 같다.

   ⚠ 실데이터를 쓰지 않는다 — 전부 지어낸 값이다(t-leak). 표 이름 kr_sheet_* 는 «지도 쪽 표»를 지어낸 이름일 뿐이다.

     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-tblmap.mjs
*/
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };
const MIME = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.pptx':'application/octet-stream' };
const CORE = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
const browser = await chromium.launch(PW);

/* ══════════════════════════════════════════════════════════════════════════════
   [1] core — 표 지도 · 캐시 분리 · 폴백 금지
   ══════════════════════════════════════════════════════════════════════════════ */
console.log('[1] core — 표 지도(TBL_MAP)');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  /* file:// 은 오리진이 opaque 라 IndexedDB 가 막힌다 — http 오리진을 하나 만들어 준다(t-cache 와 같다) */
  await page.route('http://gst.test/**', r => r.request().url().endsWith('/core.js')
    ? r.fulfill({ status:200, contentType:'application/javascript', body:CORE })
    : r.fulfill({ status:200, contentType:'text/html', body:'<!doctype html><meta charset="utf-8"><script src="/core.js"></script>' }));
  await page.goto('http://gst.test/', { waitUntil:'load' });

  const R = await page.evaluate(async () => {
    const R = {};
    R.def = { map:JSON.stringify(GST.TBL_MAP), ns:GST.TBL_NS, p:GST.physTbl('sheet_wk'), lk:GST.logKey('sheet_wk'), lk2:GST.logKey('kr_sheet_wk'),
              lk3:GST.logKey('sheet_inst') };
    /* 가짜 PostgREST — 표마다 다른 값을 넣어 «어느 표를 읽었나»가 값으로도 보이게 */
    const keys = Object.keys(GST.SM.SPEC.wk.fields), cols = keys.map(GST._snake);
    const mk = (tag, n) => Array.from({ length:n }, (_, i) => { const o = { src_row:i }; cols.forEach(c => { o[c] = tag + i; }); return o; });
    const T = { sheet_wk:mk('P', 3), kr_sheet_wk:mk('K', 2),
                sheet_alarm:[{ src_row:0, sn:'P-A', imported_at:'2026-09-01' }], kr_sheet_alarm:[{ src_row:0, sn:'K-A', imported_at:'2026-09-02' }, { src_row:1, sn:'K-B', imported_at:'2026-09-02' }] };
    const SYNC = { wk:{ rows:3, err:null, synced_at:'2026-09-01T00:00:00Z', ms:-1 }, kr_wk:{ rows:2, err:null, synced_at:'2026-09-02T00:00:00Z', ms:-1 } };
    const LOG = [];
    const mkQ = (tbl) => { const st = { tbl, f:[], ord:null, asc:true, a:null, b:null, lim:null, cols:'*', cnt:false };
      const q = { select(c, o){ st.cols = c; if(o && o.count) st.cnt = true; return q; },
        eq(c, v){ st.f.push(o => String(o[c]) === String(v)); st.eq = [c, v]; return q; },
        gte(c, v){ st.f.push(o => o[c] >= v); return q; }, gt(c, v){ st.f.push(o => o[c] > v); return q; },
        lt(c, v){ st.f.push(o => o[c] < v); return q; },
        order(c, o){ st.ord = c; st.asc = !(o && o.ascending === false); return q; },
        range(a, b){ st.a = a; st.b = b; return q; }, limit(n){ st.lim = n; return q; },
        maybeSingle(){ LOG.push({ tbl, eq:st.eq }); const k = st.eq && st.eq[1]; return Promise.resolve(tbl === 'sheet_sync_log'
          ? { data:SYNC[k] || null, error:null } : { data:null, error:null }); },
        then(res, rej){ LOG.push({ tbl });
          if(!T[tbl]) return Promise.resolve({ data:null, error:{ message:'relation ' + tbl + ' does not exist' } }).then(res, rej);
          let d = T[tbl].filter(o => st.f.every(f => f(o)));
          if(st.ord) d = d.slice().sort((x, y) => (st.asc ? 1 : -1) * (x[st.ord] > y[st.ord] ? 1 : x[st.ord] < y[st.ord] ? -1 : 0));
          const total = d.length;
          if(st.a != null) d = d.slice(st.a, st.b + 1);
          if(st.lim != null) d = d.slice(0, st.lim);
          if(st.cols && st.cols !== '*'){ const cs = st.cols.split(','); d = d.map(o => Object.fromEntries(cs.map(c => [c, o[c] === undefined ? null : o[c]]))); }
          return Promise.resolve({ data:d, count:st.cnt ? total : null, error:null }).then(res, rej); } };
      return q; };
    const client = { from:(t) => mkQ(t), rpc:async (n, a) => { LOG.push({ rpc:n, p:a && a.p_tbl });
      if(n === 'csv_table_cols') return { data:T[a.p_tbl] ? Object.keys(T[a.p_tbl][0]) : null, error:null };
      return { data:null, error:{ message:'no rpc' } }; } };
    GST.db = async () => client;
    const tbls = () => Array.from(new Set(LOG.filter(x => x.tbl).map(x => x.tbl))).sort();

    /* ① 지도가 빈 운영 화면 — 표 이름·적재 기록 열쇠·캐시 열쇠가 예전과 «같다»(기존 사용자의 캐시가 안 깨진다) */
    await GST.idb.del('rows:wk'); await GST.idb.del('rows:kr_wk');
    LOG.length = 0;
    const p1 = await GST.dbRows('wk');
    R.prod = { tbls:tbls(), log:LOG.filter(x => x.tbl === 'sheet_sync_log').map(x => x.eq && x.eq[1]), cell:p1[1] && p1[1][1], n:p1.length - 1,
               ctc:LOG.filter(x => x.rpc === 'csv_table_cols').map(x => x.p) };
    R.prodIdb = !!(await GST.idb.get('rows:wk'));

    /* ② 지도를 건 데모 화면 — 실제 표 · 적재 기록 · 열 확인 · IndexedDB 열쇠가 전부 데모 쪽 */
    GST.TBL_MAP = { sheet_wk:'kr_sheet_wk', sheet_alarm:'kr_sheet_alarm' }; GST.TBL_NS = 'kr:';
    LOG.length = 0;
    const k1 = await GST.dbRows('wk');
    R.demo = { tbls:tbls(), log:LOG.filter(x => x.tbl === 'sheet_sync_log').map(x => x.eq && x.eq[1]), cell:k1[1] && k1[1][1], n:k1.length - 1,
               ctc:LOG.filter(x => x.rpc === 'csv_table_cols').map(x => x.p) };
    R.demoIdb = !!(await GST.idb.get('rows:kr_wk'));
    const pIdb = await GST.idb.get('rows:wk');
    R.prodIdbIntact = !!pIdb && pIdb.rows.length === 4 && pIdb.rows[1][1] === p1[1][1];
    /* ③ 같은 브라우저에서 운영 화면으로 돌아가면 — 운영 캐시가 그대로 맞고(표 요청 0) 데모 값이 안 섞인다 */
    GST.TBL_MAP = {}; GST.TBL_NS = '';
    LOG.length = 0;
    const p2 = await GST.dbRows('wk');
    R.back = { tbls:tbls().filter(t => t !== 'sheet_sync_log'), cell:p2[1] && p2[1][1], n:p2.length - 1 };

    /* ④ 원장(csvTableRows) — 데모 표 · IndexedDB 열쇠가 실제 표 이름 */
    GST.TBL_MAP = { sheet_wk:'kr_sheet_wk', sheet_alarm:'kr_sheet_alarm' }; GST.TBL_NS = 'kr:';
    await GST.idb.del('csv:kr_sheet_alarm');
    LOG.length = 0;
    const a1 = await GST.csvTableRows('sheet_alarm', ['src_row', 'sn', 'imported_at']);
    R.csv = { tbls:tbls(), n:a1.length - 1, sn:a1[1] && a1[1][a1[0].indexOf('sn')], idb:!!(await GST.idb.get('csv:kr_sheet_alarm')), idbProd:!!(await GST.idb.get('csv:sheet_alarm')) };

    /* ⑤ fetchCSVCached — 데모 표를 못 읽으면 «시트로 폴백하지 않는다» · 운영은 지금까지대로 시트로 폴백 */
    const sheet = []; GST.fetchCSV = async (u) => { sheet.push(String(u)); return [['h'], ['v']]; };
    GST.authOn = () => true; GST.USE_DB = true;
    const wkUrl = 'https://docs.example/x?gid=646668307', roUrl = 'https://docs.example/x?gid=1213453343';
    SYNC.kr_wk = null;                                       // 데모 수선실적의 적재 기록이 없다(= 못 읽는다)
    try { await GST.fetchCSVCached(wkUrl, 'sheet3'); R.mapWk = 'no throw'; } catch(e){ R.mapWk = e.message; }
    GST.TBL_MAP = { sheet_wk:'kr_sheet_wk', sheet_roster:'kr_sheet_roster' };
    try { await GST.fetchCSVCached(roUrl, 'roster'); R.mapRo = 'no throw'; } catch(e){ R.mapRo = e.message; }
    R.mapSheet = sheet.length;
    GST.TBL_MAP = {}; GST.TBL_NS = '';
    SYNC.wk = null;                                          // 운영도 적재 기록이 없을 때 — 옛 길(시트)로 간다
    try { const r = await GST.fetchCSVCached(wkUrl, 'sheet3'); R.prodWk = r && r.src; } catch(e){ R.prodWk = 'throw ' + e.message; }
    R.prodSheet = sheet.length;

    /* ⑥ localStorage 캐시 열쇠 — 앞머리로 가른다 */
    try { localStorage.clear(); } catch(e){}
    GST.TBL_NS = 'kr:'; GST.cacheSave('roster', [['h'], ['K']]);
    const kHit = GST.cacheLoad('roster');
    GST.TBL_NS = ''; const pMiss = GST.cacheLoad('roster'); GST.cacheSave('roster', [['h'], ['P']]);
    GST.TBL_NS = 'kr:'; const kAgain = GST.cacheLoad('roster');
    R.ls = { keys:Object.keys(localStorage).sort(), kHit:kHit && kHit.rows[1][0], pMiss:pMiss, kAgain:kAgain && kAgain.rows[1][0] };
    GST.TBL_NS = '';

    return R;
  });

  is(R.def.map === '{}' && R.def.ns === '' && R.def.p === 'sheet_wk', '기본 지도는 비어 있다 — 운영 화면은 한 글자도 안 바뀐다');
  is(R.def.lk === 'wk' && R.def.lk3 === 'inst' && R.def.lk2 === 'kr_wk', '적재 기록 열쇠 = csv_upload_finish 규칙(sheet_ 를 뗀다): wk · inst · kr_wk');
  is(JSON.stringify(R.prod.tbls) === '["sheet_sync_log","sheet_wk"]' && R.prod.log.join() === 'wk' && R.prod.ctc.join() === 'sheet_wk' && R.prod.cell === 'P0',
     '운영 — sheet_wk · 적재 기록 wk · 열 확인 sheet_wk (' + JSON.stringify(R.prod) + ')');
  is(R.prodIdb, '운영 — IndexedDB 열쇠 rows:wk (예전과 같아 기존 캐시가 안 깨진다)');
  is(JSON.stringify(R.demo.tbls) === '["kr_sheet_wk","sheet_sync_log"]' && R.demo.log.join() === 'kr_wk' && R.demo.ctc.join() === 'kr_sheet_wk' && R.demo.cell === 'K0' && R.demo.n === 2,
     '데모 — kr_sheet_wk · 적재 기록 kr_wk · 열 확인 kr_sheet_wk · 데모 값 (' + JSON.stringify(R.demo) + ')');
  is(R.demoIdb && R.prodIdbIntact, '데모 캐시는 rows:kr_wk 에 · 운영 캐시(rows:wk)는 그대로');
  is(R.back.tbls.length === 0 && R.back.cell === 'P0' && R.back.n === 3, '운영 화면으로 돌아오면 운영 캐시가 맞는다(표 요청 0) · 데모 값이 안 섞인다 (' + JSON.stringify(R.back) + ')');
  is(JSON.stringify(R.csv.tbls) === '["kr_sheet_alarm"]' && R.csv.n === 2 && R.csv.sn === 'K-A' && R.csv.idb && !R.csv.idbProd,
     '원장 — kr_sheet_alarm 만 · IndexedDB 열쇠 csv:kr_sheet_alarm (' + JSON.stringify(R.csv) + ')');
  is(/MIRROR_EMPTY/.test(R.mapWk) && /EMPTY|does not exist|READ/.test(R.mapRo) && R.mapSheet === 0,
     '데모 표를 못 읽으면 던진다 — 구글시트(운영 보관본)로 폴백하지 않는다 (' + R.mapWk + ' | ' + R.mapRo + ' · 시트 요청 ' + R.mapSheet + ')');
  is(R.prodWk === 'sheet' && R.prodSheet === 1, '운영은 지금까지대로 — 미러가 비면 시트로 폴백한다 (' + R.prodWk + ')');
  is(JSON.stringify(R.ls.keys) === '["gstc_kr:roster","gstc_roster"]' && R.ls.kHit === 'K' && R.ls.pMiss === null && R.ls.kAgain === 'K',
     'localStorage 캐시 — gstc_kr:… 와 gstc_… 로 갈린다 · 서로의 값을 안 꺼낸다 (' + JSON.stringify(R.ls) + ')');
  is(errs.length === 0, 'JS 에러 없음' + (errs.length ? ' → ' + errs[0] : ''));
  await ctx.close();
}

/* ══════════════════════════════════════════════════════════════════════════════
   [2] 셸 — 데모 탭은 없다 (순회 목록 · 탭 줄)
   ══════════════════════════════════════════════════════════════════════════════ */
console.log('[2] 셸 — 데모 탭은 없다 (v163 · v176 에 화면째 접었다)');
{
  const STUBPAGE = '<!doctype html><meta charset="utf-8"><body>stub</body>';
  const ctx = await browser.newContext();
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  /* 셸은 배포 도메인으로 띄운다(탭 iframe 과 같은 오리진) · 탭 페이지는 스텁 — 여기서 보려는 것은 «등급 → 탭» 하나다 */
  await pg.route('https://gstcsglobal-cloud.github.io/**', r => {
    const u = new URL(r.request().url()).pathname;
    if (u === '/' || u === '/index.html') return r.fulfill({ status:200, contentType:'text/html', body:fs.readFileSync(ROOT + '/index.html', 'utf8') });
    if (u === '/assets/core.js') return r.fulfill({ status:200, contentType:'text/javascript', body:CORE });
    if (/\/$|\/index\.html$/.test(u)) return r.fulfill({ status:200, contentType:'text/html', body:STUBPAGE });
    const f = path.join(ROOT, u);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) });
    return r.fulfill({ status:404, body:'nf' });
  });
  await pg.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
  await pg.route('**/*.supabase.co/**', r => r.abort());
  await pg.goto('https://gstcsglobal-cloud.github.io/index.html', { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(800);
  /* 로그인 오버레이가 가려도 셸 함수는 돈다 — 탭을 직접 만든다(start 는 로그인 뒤에 불린다) */
  await pg.evaluate(() => { buildTabs(); const o = document.getElementById('loginOverlay'); if (o) o.remove(); });
  /* v163 — 데모 탭은 셸에서 뺐다(사용자 확정). 어느 등급에게도 안 보이고 순회·단축키에도 안 든다. */
  const vis = role => pg.evaluate(r => {
    if (r == null) delete document.body.dataset.role; else document.body.dataset.role = r;
    return { has:!!TABS.find(t => t.id === 'report_kr'), btn:!!document.querySelector('.tab[data-id="report_kr"]'), n:TABS.filter(tabOn).length, all:TABS.length };
  }, role);
  for (const role of ['admin', 'kr', 'legacy', 'viewer', 'editor', null]) {
    const v = await vis(role);
    is(!v.has && !v.btn && v.n === v.all, (role || '등급 미상') + ' — 데모 탭 없음 · 모든 탭이 같은 목록 (' + JSON.stringify(v) + ')');
  }
  const kp = role => pg.evaluate(r => { document.body.dataset.role = r; kioskBuildPanel(); return Array.from(document.querySelectorAll('#kkPages input')).map(x => x.value); }, role);
  const pages = await kp('kr');
  /* v172 — 순회는 «탭 줄에 선 탭»(barTabs)만 돈다. 처리함·사이트 상세·작업대·운영 목표(bar:false)는 순회 화면이 아니다 */
  const bt = await pg.evaluate(() => ({ n:barTabs().length, ids:barTabs().map(t => t.id) }));
  is(pages.indexOf('report_kr') < 0 && pages.length === bt.n && pages.every(p => bt.ids.includes(p)), '국내 운영자의 순회 목록에도 데모 없음 · 탭 줄과 같은 목록 (' + pages.length + ')');
  is(errs.length === 0, 'JS 에러 없음' + (errs.length ? ' → ' + errs[0] : ''));
  await ctx.close();
}

await browser.close();
console.log(fail ? `\n❌ t-tblmap: ${pass} 통과 · ${fail} 실패` : `\n✅ t-tblmap: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
