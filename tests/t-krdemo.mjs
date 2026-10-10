/* t-krdemo — 주간현황(국내) 데모 (v146)

   사용자: 「국내사이트는 DB 업로드를 국내 담당자에게 맡긴다 · 주간현황(국내)를 데모로 만들어 담당자가 운영해 보고
   피드백을 주게 · 해외는 지금 문제없다」. 데모 화면은 운영 표가 아니라 «데모 표»(kr_sheet_*)를 읽고,
   국내 운영자(role kr · can_write 꺼짐)가 그 표만 올리고 고친다.

   지키는 것:
     [1] core — 표 지도(TBL_MAP)가 비면 운영 화면은 한 글자도 안 바뀐다(표 이름·적재 기록 열쇠·캐시 열쇠 그대로) ·
         지도가 있으면 읽기 경로 셋(dbRows · csvTableRows · fetchCSVCached)이 전부 데모 표를 본다 ·
         데모와 운영의 캐시(IndexedDB · localStorage)가 섞이지 않는다 · 데모 표를 못 읽으면 «시트로 폴백하지 않는다» ·
         isKrOp 판정표.
     [2] 셸 — 데모 탭은 admin·kr·legacy 에게만 보이고(계산된 display) · 자동순회 목록·전 탭 불러오기·숫자 단축키도 같은 규칙.
     [3] 주간현황(국내) 화면 — 가짜 Supabase 로 실제로 띄워, 읽은 표가 «데모 표뿐»인지 · 국내만 남기고 몇 행을 뺐는지
         띠에 적는지 · 원장 기준으로 세는지 · 버튼이 등급을 따라가는지 · 데모 표가 없을 때 운영 자료로 폴백하지 않는지.

   데이터 관리(?site=KR)는 t-edit [24], 업로드(?site=KR)는 t-sitetpl [4], 서버 규칙(SQL)은 t-editsql [12] 이 지킨다.

   ⚠ 소스 검사로는 원리적으로 못 본다 — «어느 표를 읽었나»는 가짜 서버의 질의 기록이 안다.
   ⚠ 실데이터를 쓰지 않는다 — 전부 지어낸 값이다(t-leak).

     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-krdemo.mjs
*/
import fs from 'fs';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };
const MIME = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.pptx':'application/octet-stream' };
const CORE = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
const browser = await chromium.launch(PW);

/* ══════════════════════════════════════════════════════════════════════════════
   [1] core — 표 지도 · 캐시 분리 · 폴백 금지 · isKrOp
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

    /* ⑦ isKrOp — 서버 _kr_can 과 같은 규칙(관리자+쓰기 또는 kr) · 모르면 아니다 */
    const op = me => { GST._me = me; return GST.isKrOp(); };
    R.op = { kr:op({ role:'kr', can_write:false }), adminW:op({ role:'admin', can_write:true }), admin:op({ role:'admin', can_write:false }),
             legacyW:op({ role:'legacy', can_write:true }), editorW:op({ role:'editor', can_write:true }), viewer:op({ role:'viewer', can_write:false }),
             none:op(null), weird:op({ role:'superuser', can_write:true }) };
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
  is(JSON.stringify(R.op) === JSON.stringify({ kr:true, adminW:true, admin:false, legacyW:true, editorW:false, viewer:false, none:false, weird:false }),
     'isKrOp — kr · 관리자(쓰기) · legacy(쓰기)만 · editor·조회자·모르는 등급·미상은 아니다 (' + JSON.stringify(R.op) + ')');
  is(errs.length === 0, 'JS 에러 없음' + (errs.length ? ' → ' + errs[0] : ''));
  await ctx.close();
}

/* ══════════════════════════════════════════════════════════════════════════════
   [2] 셸 — 데모 탭은 admin·kr·legacy 에게만 (계산된 display · 순회 목록 · 전 탭 불러오기 · 숫자 단축키)
   ══════════════════════════════════════════════════════════════════════════════ */
console.log('[2] 셸 — 데모 탭은 없다 (v163)');
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

/* ══════════════════════════════════════════════════════════════════════════════
   [3] 주간현황(국내) — 가짜 Supabase 로 실제로 띄운다
   ══════════════════════════════════════════════════════════════════════════════ */
console.log('[3] 주간현황(국내) — 데모 표만 읽는다 · 국내만 · 뺀 행을 밝힌다');
const srv = http.createServer((rq, rs) => {
  let u = decodeURIComponent(rq.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.statusCode = 404; rs.end('nf'); return; }
  rs.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream');
  rs.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

const pad = n => String(n).padStart(2, '0');
const NOW = new Date();
const dAgo = n => { const d = new Date(NOW.getTime() - n * 86400000); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const WK_COLS = ['src_row','pg','op','customer','campus','line','bay','proc','subproc','model','rs_code','status','req_type','stage','chamber','wrs',
  'main_eq','prod_code','eq_no','chpos','sn_in','sn_out','pf','alarm','phenom','cause','action','action_detail','d_start','d_end','t_start','t_end',
  'reg_date','ship_date','move_min','work_min','man_min','workers','worker_cnt','synced_at','extra'];
const INST_COLS = ['src_row','pjt','country','customer','location','code','sn','model','burner','fab','floor','bay','group1','group2','detail1','detail2',
  'tool_id','tool_maker','tool_model','fab_in','start','turn_on','warranty_date','warranty','pm_cycle','type','extra','div','state','line2','synced_at'];
const full = (cols, o) => Object.fromEntries(cols.map(c => [c, o[c] === undefined ? null : o[c]]));
const SYNC_AT = new Date(NOW.getTime() - 3600000).toISOString();
function seedOf(over) {
  const dw = (i, d, stage, campus, act) => ({ src_row:i, op:'SEC Scrubber', customer:'삼성전자(주)', campus, line:campus + '-A', stage, d_start:dAgo(d),
    rs_code:'RS-D-' + pad(i), eq_no:'ZK-0' + pad(i), sn_in:'ZKD-00' + pad(i), work_min:'60', man_min:'120', workers:'W1,W2', action:act, model:'MDL-K' });
  const kwk = [dw(0, 5, 'BM', 'P1', 'RESET'), dw(1, 12, 'TBM', 'P1', '설비 PM'), dw(2, 20, 'CM', 'P2', 'CLEAN'), dw(3, 35, 'BM', 'P2', 'RESET'),
    dw(4, 50, 'TBM', 'P1', 'SWAP'), dw(5, 70, 'BM', 'P2', 'RESET'),
    /* v147 공수 보정 — 작업공수 빈칸(작업시간 60 × 작업자 2 = 120 으로 메움) · 한 건 25h(1,500분 — 공수에서 빼고 건수엔 남김) */
    Object.assign(dw(7, 9, 'CM', 'P1', 'CLEAN'), { man_min:null, work_min:'60', worker_cnt:'2' }),
    Object.assign(dw(8, 10, 'BM', 'P2', 'RESET'), { man_min:'1500', work_min:'1500', worker_cnt:'1' }),
    { src_row:6, op:'GST TAIWAN SCRUBBER', customer:'TESTCO (F16)', line:'F16', stage:'BM', d_start:dAgo(8), rs_code:'RS-O-01', sn_in:'ZTW-0001', work_min:'30' }
  ].map(r => full(WK_COLS, Object.assign({ synced_at:SYNC_AT }, r)));
  const di = (i, campus) => ({ src_row:i, country:'SEC Scrubber', customer:'삼성전자(주)', location:campus, code:'ZK-0' + pad(i), sn:'ZKD-00' + pad(i),
    model:'MDL-K', fab:campus + '-A', type:'DUAL', state:'Operation', fab_in:'2024-01-10', turn_on:'2024-02-01', warranty:'유상', div:'메모리' });
  const kinst = [di(0, 'P1'), di(1, 'P1'), di(2, 'P2'), di(3, 'P2'),
    { src_row:4, country:'GST TAIWAN SCRUBBER', customer:'TESTCO (F16)', location:'TAICHUNG', code:'ZT-001', sn:'ZTW-0001', fab:'F16', type:'SINGLE', state:'Operation', fab_in:'2023-03-01', turn_on:'2023-03-20' }
  ].map(r => full(INST_COLS, Object.assign({ synced_at:SYNC_AT }, r)));
  /* 운영 표 — 값이 달라 «운영 표를 읽었는지»가 숫자로도 보인다(읽으면 안 된다) */
  const pwk = kwk.map(r => Object.assign({}, r, { rs_code:'RS-PROD-' + r.src_row }));
  const pinst = kinst.map(r => Object.assign({}, r, { code:'PROD-' + r.src_row }));
  const RO = ['id','사원번호','이름(영문)','구분','운영단위','고객사','지역','팀','단지','라인','입사일','퇴사일','담당구분','현장 인원여부','업무/직책'];
  const pr = (id, no, nm, reg, op, camp) => Object.fromEntries(RO.map(c => [c, ({ id, '사원번호':no, '이름(영문)':nm, '구분':reg, '운영단위':op, '고객사':reg === '국내' ? '삼성전자' : 'TESTCO',
    '단지':camp, '라인':camp + '-A', '입사일':'2024-03-01', '담당구분':'Scrubber', '현장 인원여부':'O', '팀':'T1' })[c] ?? null]));
  const kro = [pr(1, '9200001', 'Kr One', '국내', 'SEC Scrubber', 'P1'), pr(2, '9200002', 'Kr Two', '국내', 'SEC Scrubber', 'P2'),
               pr(3, '9200003', 'Kr Three', '국내', 'SEC Scrubber', 'P1'), pr(4, '9200004', 'Os One', '해외', 'GST TAIWAN SCRUBBER', 'F16')];
  const kedu = [{ id:1, 'No':'1', 'Site':'P1', '인원':'Kr One', '사원번호':'9200001', 'Scrubber Lv.2':dAgo(100), 'Scrubber Lv.3':null }];
  const klv = [{ id:1, '사원번호':'9200001', '이름':'Kr One', '소속':'P1', '항목':'연차', '발생일':dAgo(3), '휴가시작일':dAgo(3), '휴가종료일':dAgo(3), '휴가신청시간':'8' }];
  const IMP = new Date(NOW.getTime() - 7200000).toISOString();
  const AC = ['src_row','sn_key','sn','occur_date','fmonth','fweek','cnt','site','line','atype','ctype','alarm','cause','action','phenom','op','inout','incl','alarm_name','imported_at'];
  const al = (i, d, sn) => Object.fromEntries(AC.map(c => [c, ({ src_row:i, sn_key:sn.replace(/[^0-9A-Z]/gi, ''), sn, occur_date:dAgo(d), cnt:true, site:'P1', line:'P1-A',
    alarm:'PRESSURE HIGH', op:'P운영', inout:'내적', imported_at:IMP, fmonth:dAgo(d).slice(0, 7) })[c] ?? null]));
  const kal = [al(0, 6, 'ZKD-0000'), al(1, 15, 'ZKD-0001'), al(2, 40, 'ZKD-0002')];
  const kab = [Object.assign({}, al(0, 9, 'ZKD-0003'), { seq:'1', alarm:'ALL BYPASS' })];
  delete kab[0].alarm_name;
  return Object.assign({
    me:{ email:'kr@test.local', can_write:false, role:'kr' },
    tables:{
      kr_sheet_wk:kwk, kr_sheet_inst:kinst, kr_sheet_roster:kro, kr_sheet_edu:kedu, kr_sheet_leave:klv, kr_sheet_alarm:kal, kr_sheet_allbypass:kab,
      sheet_wk:pwk, sheet_inst:pinst, sheet_roster:kro, sheet_edu:kedu, sheet_leave:klv, sheet_alarm:kal, sheet_allbypass:kab,
      sheet_sync_log:[{ tbl:'kr_wk', rows:kwk.length, err:null, synced_at:SYNC_AT, ms:-1 }, { tbl:'kr_inst', rows:kinst.length, err:null, synced_at:SYNC_AT, ms:-1 },
                      { tbl:'wk', rows:pwk.length, err:null, synced_at:SYNC_AT, ms:-1 }, { tbl:'inst', rows:pinst.length, err:null, synced_at:SYNC_AT, ms:-1 }],
      allowed_users:[{ email:'kr@test.local', can_write:false, role:'kr' }, { email:'view@test.local', can_write:false, role:'viewer' },
                     { email:'boss@test.local', can_write:true, role:'admin' }]
    }
  }, over || {});
}
/* 가짜 Supabase (브라우저 안에서 돈다) — 질의를 기록한다. 화면이 «어느 표를» 읽었는지는 이 기록이 안다. */
function fake(seed) {
  const DB = JSON.parse(JSON.stringify(seed.tables));
  const LOG = window.__QLOG = [];
  const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a - b : String(a).localeCompare(String(b));
  const test = (row, col, op, v) => {
    const x = row[col];
    if (op === 'is') return v === null || v === 'null' ? x == null : x === v;
    if (x == null) return false;
    if (op === 'eq') return String(x) === String(v);
    if (op === 'ilike') return String(x).toLowerCase() === String(v).replace(/\\([%_\\])/g, '$1').toLowerCase();
    if (op === 'gte') return cmp(x, v) >= 0;
    if (op === 'gt') return cmp(x, v) > 0;
    if (op === 'lt') return cmp(x, v) < 0;
    if (op === 'lte') return cmp(x, v) <= 0;
    if (op === 'in') return v.map(String).indexOf(String(x)) >= 0;
    throw new Error('fake op ' + op);
  };
  function from(tbl) {
    const st = { tbl, f:[], order:null, asc:true, limit:null, a:null, b:null, cols:null, single:false, count:false };
    const q = {
      select(c, o) { st.cols = c; if (o && o.count) st.count = true; return q; },
      order(c, o) { st.order = c; st.asc = !(o && o.ascending === false); return q; },
      limit(n) { st.limit = n; return q; },
      range(a, b) { st.a = a; st.b = b; return q; },
      maybeSingle() { st.single = true; return q; },
      or(e) { st.or = e; return q; },
      in(c, v) { st.f.push([c, 'in', v]); return q; },
      then(res, rej) {
        LOG.push(JSON.parse(JSON.stringify(st)));
        if (!(tbl in DB)) return Promise.resolve({ data:null, error:{ message:'relation "public.' + tbl + '" does not exist' } }).then(res, rej);
        let rows = DB[tbl].filter(r => st.f.every(([c, op, v]) => test(r, c, op, v)));
        if (st.order) rows = rows.slice().sort((a, b) => (st.asc ? 1 : -1) * cmp(a[st.order], b[st.order]));
        const total = rows.length;
        if (st.a != null) rows = rows.slice(st.a, st.b + 1);
        if (st.limit != null) rows = rows.slice(0, st.limit);
        if (st.cols && st.cols !== '*') { const cs = st.cols.split(','); rows = rows.map(r => Object.fromEntries(cs.map(c => [c, r[c] === undefined ? null : r[c]]))); }
        else rows = rows.map(r => Object.assign({}, r));
        const out = st.single ? { data:rows[0] || null, error:null } : { data:rows, count:st.count ? total : null, error:null };
        return Promise.resolve(out).then(res, rej);
      }
    };
    ['eq','ilike','gte','gt','lt','lte','is'].forEach(op => { q[op] = (c, v) => { st.f.push([c, op, v]); return q; }; });
    return q;
  }
  window.__FDB = {
    from,
    rpc: async (name, args) => {
      LOG.push({ rpc:name, args:JSON.parse(JSON.stringify(args || {})) });
      if (name === 'csv_table_cols') { const t = DB[args.p_tbl]; return { data:t && t.length ? Object.keys(t[0]) : null, error:null }; }
      return { data:null, error:{ message:'fake: no rpc ' + name } };
    },
    auth:{ refreshSession:async () => ({}) }
  };
  window.__ME = seed.me;
}
/* core.js 뒤에 붙는 이음새 — 로그인·세션만 가짜로, 등급 판정(loadMe → dbWrite('perm'))은 진짜 길로.
   시트 읽기(fetchCSV)는 기록만 하고 막는다 — 데모 화면이 시트로 폴백하면 여기 남는다. */
const STUB = '\n;GST.authOn=function(){return true;};'
  + 'GST.getSession=async function(){return {user:{email:((window.__ME||{}).email||"").toLowerCase()},access_token:"t"}};GST.token=async function(){return "t";};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();if(GST._authOk)GST._authOk();return true;};'
  + 'GST.db=async function(){return window.__FDB;};GST.sb=async function(){return window.__FDB;};'
  + 'GST.fetchCSV=async function(u){(window.__SHEET=window.__SHEET||[]).push(String(u));throw new Error("SHEET_BLOCKED");};';
async function openKr(seed) {
  const ctx = await browser.newContext({ viewport:{ width:1500, height:1000 }, locale:'ko-KR' });
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => {
    const u = new URL(r.request().url()).pathname;
    if (u === '/assets/core.js') return r.fulfill({ status:200, contentType:'application/javascript', body:CORE + STUB });
    const f = path.join(ROOT, u);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) });
    return r.fulfill({ status:404, body:'nf' });
  });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
  const sheetHits = [];
  await ctx.route('**/docs.google.com/**', r => { sheetHits.push(r.request().url()); r.abort(); });
  await ctx.route('**/*.supabase.co/**', r => { sheetHits.push(r.request().url()); r.abort(); });
  await ctx.addInitScript(`(${fake.toString()})(${JSON.stringify(seed)});`);
  const pg = await ctx.newPage(); const pe = [];
  pg.on('pageerror', e => pe.push(e.message));
  await pg.goto(BASE + '/report-kr/', { waitUntil:'domcontentloaded' });
  await pg.waitForFunction(() => { const s = document.getElementById('status'); return s && !/불러오는|loading/i.test(s.textContent || ''); }, null, { timeout:20000 }).catch(() => {});
  await pg.waitForTimeout(800);
  return { ctx, pg, pe, sheetHits };
}
const KR_TBLS = ['kr_sheet_wk','kr_sheet_inst','kr_sheet_roster','kr_sheet_edu','kr_sheet_leave','kr_sheet_alarm','kr_sheet_allbypass'];
{
  const { ctx, pg, pe, sheetHits } = await openKr(seedOf());
  const L = await pg.evaluate(() => window.__QLOG.slice());
  const tbls = Array.from(new Set(L.filter(x => x.tbl).map(x => x.tbl))).sort();
  const okT = t => /^kr_sheet_/.test(t) || t === 'sheet_sync_log' || t === 'allowed_users' || t === 'value_map';   // value_map = 기준 정보 규칙(v152 · 읽기만 · 원본 표가 아니다)
  is(tbls.every(okT), '읽은 표 — 데모 표 · 적재 기록 · 자기 등급뿐 (' + tbls.join(' ') + ')');
  is(KR_TBLS.every(t => tbls.indexOf(t) >= 0), '데모 표 일곱을 다 읽었다');
  const syncKeys = Array.from(new Set(L.filter(x => x.tbl === 'sheet_sync_log').map(x => (x.f.find(f => f[0] === 'tbl') || [])[2]))).sort();
  is(syncKeys.join() === 'kr_inst,kr_wk', '적재 기록은 kr_wk · kr_inst 로 묻는다 (' + syncKeys + ')');
  const ctc = Array.from(new Set(L.filter(x => x.rpc === 'csv_table_cols').map(x => x.args.p_tbl))).sort();
  is(ctc.length > 0 && ctc.every(t => /^kr_sheet_/.test(t)), '열 확인도 데모 표로 (' + ctc + ')');
  const sheet = await pg.evaluate(() => (window.__SHEET || []).length);
  is(sheet === 0 && sheetHits.length === 0, '구글시트·운영 보관본으로 가지 않는다 (시트 ' + sheet + ' · 외부 ' + sheetHits.length + ')');

  const S = await pg.evaluate(() => ({ wk:WK.length, wkKr:WK.every(x => x.region === GST.ORG.REGION_KR), rs:WK.map(x => x.eqNo).sort().join(),
    inst:INST.length, ro:ROSTER.length, roKr:ROSTER.every(p => p.region === GST.ORG.REGION_KR), kra:KRA.length, krb:KRB.length, why:window._KRWHY, whyb:window._KRWHYB,
    drop:window._KRDEMO_DROP, dropTxt:(document.getElementById('krDrop') || {}).textContent, dropVis:!(document.getElementById('krDrop') || {}).hidden,
    reg:GST.filters.options('region'), st:(document.getElementById('status') || {}).textContent || '', h1:document.querySelector('h1').textContent,
    bar:(document.getElementById('krDemo') || {}).innerText || '' }));
  is(S.wk === 8 && S.wkKr && !/ZT/.test(S.rs), '수선실적 — 국내 8행만 (해외 1행은 뺐다) (' + S.wk + ')');
  /* v147 공수 보정 — 빈 작업공수 = 작업시간×작업자수 · 24h 초과는 공수 0(건수엔 남음) · ⚠ 심벌은 제목·KPI 옆 · 누르면 팝업 · 품질 카드 */
  const MH = await pg.evaluate(() => { const a = WK.find(x => x.eqNo === 'ZK-007'), b = WK.find(x => x.eqNo === 'ZK-008');
    const card = document.getElementById('cMan').closest('.card');
    return { a:a && [a.manMin, a.mhFilled, a.mhBig], b:b && [b.manMin, b.mhRaw, b.mhBig], s:window._KRMH && { f:window._KRMH.filled, n:window._KRMH.big.length },
      badge:[!!card.querySelector('h3 .mhw'), !!document.getElementById('kp5').closest('.krow').querySelector('.mhw')],
      noteTxt:card.querySelector('.card-note').textContent,
      dq:(() => { try { return (JSON.parse(localStorage.getItem('gst_dq_report_kr') || '{}').items || []).map(x => x.key); } catch (e) { return ['ERR']; } })() }; });
  is(MH.a && MH.a[0] === 120 && MH.a[1] === true && MH.a[2] === false, '빈 작업공수 → 작업시간×작업자수 (60×2=120) ' + JSON.stringify(MH.a));
  is(MH.b && MH.b[0] === 0 && MH.b[1] === 1500 && MH.b[2] === true, '25h 행 → 공수 0 · 원값 1,500분 보존 ' + JSON.stringify(MH.b));
  is(MH.s && MH.s.f === 1 && MH.s.n === 1, '_KRMH — 메운 1 · 뺀 1 ' + JSON.stringify(MH.s));
  is(MH.badge[0] && MH.badge[1], '⚠ 심벌 — 작업 공수 제목 · 인당 공수 KPI 옆 ' + JSON.stringify(MH.badge));
  is(!/24h|제외 1|메움/.test(MH.noteTxt), '카드 주석에는 문장을 더 쓰지 않는다 (' + MH.noteTxt + ')');
  is(MH.dq.indexOf('kr_mh') >= 0, '데이터 품질 카드에 kr_mh 신호 (' + MH.dq.join(',') + ')');
  const MD = await pg.evaluate(() => { document.getElementById('cMan').closest('.card').querySelector('h3 .mhw').click();
    const ov = document.querySelector('.gpv-t'); const rows = ov ? Array.from(ov.querySelectorAll('tbody tr')).map(r => Array.from(r.children).map(c => c.textContent).join('|')) : null;
    const sub = (document.querySelector('.gov-sub') || {}).textContent || ''; GST._ovClose && GST._ovClose(); return { rows, sub }; });
  is(MD.rows && MD.rows.length === 1 && /\|ZK-008\|25\|1,500\|/.test(MD.rows[0]), '심벌 클릭 → 뺀 행 1건(ZK-008 · 25h · 1,500분) ' + JSON.stringify(MD.rows));
  is(/24h/.test(MD.sub) && /빈 1건/.test(MD.sub), '팝업 설명에 기준(24h)·메운 건수 (' + MD.sub.slice(0, 80) + ')');
  is(S.inst === 4, '설치현황 — 국내 4대만 (' + S.inst + ')');
  is(S.ro === 3 && S.roKr, '인원 — 국내 3명만 (' + S.ro + ')');
  is(JSON.stringify(S.drop) === '{"w":1,"i":1,"r":1}' && S.dropVis && /수선실적 1/.test(S.dropTxt) && /설치현황 1/.test(S.dropTxt) && /인원 1/.test(S.dropTxt),
     '뺀 행을 띠에 적는다 — 조용히 빼지 않는다 (' + S.dropTxt + ')');
  is(S.kra === 3 && S.krb === 1 && S.why === '' && S.whyb === '', '국내 알람·올바는 데모 원장으로 센다 (알람 ' + S.kra + ' · 올바 ' + S.krb + ')');
  is(JSON.stringify(S.reg) === JSON.stringify(['국내']), '사이드바 「구분」 — 국내 하나 (' + JSON.stringify(S.reg) + ')');
  is(S.h1 === '주간 현황(국내)' && /국내 데모/.test(S.bar), '머리 — 「주간 현황(국내)」 · 데모 띠');
  is(!/❌/.test(S.st), '상태줄 — 실패가 아니다 (' + S.st.slice(0, 60) + ')');

  const btn = await pg.evaluate(() => ['krUp', 'krEd'].map(id => !document.getElementById(id).hidden));
  is(btn.join() === 'true,true', '국내 운영자 — 「자료 올리기」·「데이터 관리」가 보인다');
  const oc = await pg.evaluate(() => ['krUp', 'krEd'].map(id => document.getElementById(id).getAttribute('onclick')));
  is(/\/upload\/\?site=KR/.test(oc[0]) && /gstUploadKR/.test(oc[0]) && /\/edit\/\?site=KR/.test(oc[1]) && /gstEditKR/.test(oc[1]), '두 버튼은 데모 경로를 «데모 창»으로 연다');

  const ls = await pg.evaluate(() => Object.keys(localStorage).filter(k => /^gstc_/.test(k)).sort());
  is(ls.length > 0 && ls.every(k => /^gstc_kr:/.test(k)), 'localStorage 캐시 — 전부 gstc_kr: 앞머리 (' + ls.join(' ') + ')');
  const idb = await pg.evaluate(async () => ({ k:!!(await GST.idb.get('rows:kr_wk')), p:!!(await GST.idb.get('rows:wk')), a:!!(await GST.idb.get('csv:kr_sheet_alarm')) }));
  /* 원장은 고른 열(_KR_COLS_A)로 읽어 imported_at 이 없으니 캐시하지 않는다 — 본 주간현황과 같다(열쇠를 못 만들면 담지 않는다) */
  is(idb.k && !idb.p && !idb.a, 'IndexedDB — 데모 수선실적은 rows:kr_wk 에만 (운영 열쇠 rows:wk 는 안 건드린다) ' + JSON.stringify(idb));
  /* 본 주간현황과 브라우저 저장소를 나눠 쓰지 않는다 — 필터 · 화면 설정(gst_rpt_*) · 품질 스냅샷(gst_dq_*).
     같은 출처라 한 벌을 쓰면 데모에서 바꾼 마감월·주/월·교육 계획이 본 화면에 번진다(그 반대도) */
  const st = await pg.evaluate(() => { GST.filters.set('campus', 'P1'); setGrp('site'); GST.filters.set('campus', []);
    const k = Object.keys(localStorage);
    return { bfKr:k.indexOf('gst_bf_report_kr') >= 0, bf:k.indexOf('gst_bf_report') >= 0, rptKr:k.some(x => /^gst_rptkr_/.test(x)),
             rpt:k.some(x => /^gst_rpt_/.test(x)), dqKr:k.indexOf('gst_dq_report_kr') >= 0, dq:k.indexOf('gst_dq_report') >= 0 }; });
  is(st.bfKr && !st.bf && st.rptKr && !st.rpt && st.dqKr && !st.dq,
     '브라우저 저장소 — 필터·화면 설정·품질 스냅샷이 본 주간현황 열쇠와 갈린다 (' + JSON.stringify(st) + ')');

  /* 언어를 바꾸면 뺀 행 문구도 따라간다 */
  await pg.evaluate(() => setLang('en'));
  const en = await pg.$eval('#krDrop', e => e.textContent);
  is(/work 1/.test(en) && /staff 1/.test(en) && !/[가-힣]/.test(en), '영어 — 뺀 행 문구도 바뀐다 (' + en + ')');
  is(pe.length === 0, 'JS 에러 없음' + (pe.length ? ' → ' + pe.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
{
  /* 조회자 — 데모 화면을 «볼» 수는 있어도(딥링크) 올리기·고치기 버튼은 없다 */
  const { ctx, pg, pe } = await openKr(seedOf({ me:{ email:'view@test.local', can_write:false, role:'viewer' } }));
  const btn = await pg.evaluate(() => ['krUp', 'krEd'].map(id => !document.getElementById(id).hidden));
  is(btn.join() === 'false,false', '조회자 — 버튼 없음');
  is(pe.length === 0, 'JS 에러 없음' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}
{
  /* 관리자(쓰기) — 데모도 운영한다 */
  const { ctx, pg } = await openKr(seedOf({ me:{ email:'boss@test.local', can_write:true, role:'admin' } }));
  const btn = await pg.evaluate(() => ['krUp', 'krEd'].map(id => !document.getElementById(id).hidden));
  is(btn.join() === 'true,true', '관리자(쓰기) — 버튼 있음');
  await ctx.close();
}
{
  /* 데모 수선실적의 적재 기록이 없을 때 — 운영 표·시트로 폴백하지 않고 «말하며» 비운다 */
  const s = seedOf(); s.tables.sheet_sync_log = s.tables.sheet_sync_log.filter(r => r.tbl !== 'kr_wk');
  const { ctx, pg, sheetHits } = await openKr(s);
  const L = await pg.evaluate(() => window.__QLOG.slice());
  const tbls = Array.from(new Set(L.filter(x => x.tbl).map(x => x.tbl)));
  const R = await pg.evaluate(() => ({ wk:WK.length, sheet:(window.__SHEET || []).length, warn:!!document.getElementById('gstMirrorWarn') }));
  is(R.wk === 0 && R.sheet === 0 && sheetHits.length === 0 && tbls.indexOf('sheet_wk') < 0,
     '데모 수선실적을 못 읽으면 0 — 운영 표(sheet_wk)·시트로 가지 않는다 (' + JSON.stringify(R) + ')');
  is(R.warn, '그 사실을 배너로 밝힌다(조용한 0 이 아니다)');
  await ctx.close();
}

await browser.close();
srv.close();
console.log(fail ? `\n❌ t-krdemo: ${pass} 통과 · ${fail} 실패` : `\n✅ t-krdemo: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
