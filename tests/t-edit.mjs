/* t-edit — 데이터 관리 화면(/edit/) (v140)

   지키는 것:
     ① 관리자 게이트 — admin+can_write 만 열린다. editor 는 잠긴 문을 본다.
     ② 서버 준비(setup-16) 전이면 «말하며» 쓰기 단추를 잠근다(검색·보기는 된다).
     ③ 검색이 PostgREST 에 «맞는 조건»을 보낸다 — S/N 은 여러 열 중 하나에 포함(표기 갈림 흡수),
        기간은 YYYY-MM-DD 문자열 비교(끝날은 다음 날 «미만»), 고르는 칸은 정확히, 여러 열 칸이 둘이면 and(or,or).
     ④ 저장은 «바뀐 칸만» · 연 시점의 해시와 함께 · 날짜는 눕히고 · 숫자는 쉼표를 떼고 · 수식은 막는다.
     ⑤ 충돌이면 지금 값으로 다시 열고 내 변경을 다시 얹는다(상대도 바꾼 칸은 노랗게).
     ⑥ 새 행 — 필수 검사 · 중복이면 묻는다 · 빈칸은 보내지 않는다.
     ⑦ 삭제 — 해시와 함께 · 「되살리기」가 edit_restore 를 부른다.
     ⑧ 설치현황에서 채우기 — 채널 접미(L/R/S)를 떼고도 찾는다 · «빈 칸만» 기본으로 채운다.
     ⑨ 변경 이력 — 표·종류 필터가 질의에 실린다 · 옛 형식·업로드 요약은 되돌리기 단추가 없다.
     ⑩ 작은 표(인원)는 키셋으로 통째로 받는다 — «0행일 때만 멈춘다».

   ⚠ 가짜 Supabase 는 «질의를 기록»한다 — 화면이 무엇을 보냈는지는 소스가 아니라 이 기록이 안다.
     RPC 의 실제 의미(이력·캐시 도장·해시)는 t-editsql 이 진짜 Postgres 로 지킨다. 여기서는 모양만 흉내 낸다.
   ⚠ 실데이터를 쓰지 않는다 — 전부 지어낸 값이다(t-leak).

     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-edit.mjs
*/
import fs from 'fs';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

const MIME = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html' };
const srv = http.createServer((rq, rs) => {
  let u = decodeURIComponent(rq.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.statusCode = 404; rs.end('nf'); return; }
  rs.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream');
  rs.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

/* ── 가짜 Supabase (브라우저 안에서 돈다) ─────────────────────────────────────
   표 필터(eq·ilike·gte·lt·gt·is·in·like·or(and(...)))를 실제로 평가해 «찾은 행»을 돌려준다.
   RPC 는 SQL 과 같은 «응답 모양»만 흉내 낸다(의미는 t-editsql 소관). */
function fake(seed) {
  const DB = JSON.parse(JSON.stringify(seed.tables));
  const LOG = window.__QLOG = [];
  const KEY = { sheet_wk:'src_row', sheet_mat:'src_row', sheet_inst:'src_row', sheet_roster:'id', sheet_edu:'id', sheet_leave:'id', sheet_edits:'id' };
  const hash = r => { const o = Object.assign({}, r); delete o.synced_at; return 'h:' + JSON.stringify(o); };
  const toRe = (p, ci) => new RegExp('^' + String(p).replace(/\\([%_\\])/g, '\u0001$1').replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/[*%]/g, '.*').replace(/_/g, '.').replace(/\u0001(.)/g, (m, c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) + '$', ci ? 'i' : '');
  const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a - b : String(a).localeCompare(String(b));
  const test = (row, col, op, v) => {
    const x = row[col];
    if (op === 'is') return v === null || v === 'null' ? x == null : x === v;
    if (x == null) return false;
    if (op === 'eq') return String(x) === String(v);
    if (op === 'ilike') return toRe(v, true).test(String(x));
    if (op === 'like') return toRe(v, false).test(String(x));
    if (op === 'gte') return cmp(x, v) >= 0;
    if (op === 'gt') return cmp(x, v) > 0;
    if (op === 'lt') return cmp(x, v) < 0;
    if (op === 'lte') return cmp(x, v) <= 0;
    if (op === 'in') return v.map(String).indexOf(String(x)) >= 0;
    throw new Error('fake: op ' + op);
  };
  const splitTop = s => { const out = []; let d = 0, cur = '';
    for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; }
    if (cur) out.push(cur); return out; };
  const evalTerm = (row, t) => {
    if (/^and\(/.test(t)) return splitTop(t.slice(4, -1)).every(x => evalTerm(row, x));
    if (/^or\(/.test(t)) return splitTop(t.slice(3, -1)).some(x => evalTerm(row, x));
    const a = t.indexOf('.'), b = t.indexOf('.', a + 1);
    return test(row, t.slice(0, a), t.slice(a + 1, b), t.slice(b + 1));
  };
  function from(tbl) {
    const st = { tbl, f:[], or:[], order:null, asc:true, limit:null, cols:null, single:false, head:false, ins:null };
    const q = {
      select(c, o) { st.cols = c; if (o && o.head) st.head = true; return q; },
      insert(rows) { st.ins = JSON.parse(JSON.stringify(rows)); return q; },
      order(c, o) { st.order = c; st.asc = !(o && o.ascending === false); return q; },
      limit(n) { st.limit = n; return q; },
      maybeSingle() { st.single = true; return q; },
      or(e) { st.or.push(e); return q; },
      in(c, v) { st.f.push([c, 'in', v]); return q; },
      then(res, rej) {
        LOG.push(JSON.parse(JSON.stringify(st)));
        if (st.ins) { (DB[tbl] = DB[tbl] || []).push(...st.ins); return Promise.resolve({ data:null, error:null }).then(res, rej); }
        let rows = (DB[tbl] || []).filter(r => st.f.every(([c, op, v]) => test(r, c, op, v)) && st.or.every(e => splitTop(e).some(x => evalTerm(r, x))));
        if (st.order) rows = rows.slice().sort((a, b) => (st.asc ? 1 : -1) * cmp(a[st.order], b[st.order]));
        if (st.limit != null) rows = rows.slice(0, st.limit);
        if (st.cols && st.cols !== '*') { const cs = st.cols.split(','); rows = rows.map(r => Object.fromEntries(cs.map(c => [c, r[c] === undefined ? null : r[c]]))); }
        else rows = rows.map(r => Object.assign({}, r));
        const out = st.head ? { count: rows.length, data: null, error: null }
          : st.single ? { data: rows[0] || null, error: null } : { data: rows, error: null };
        return Promise.resolve(out).then(res, rej);
      }
    };
    ['eq','ilike','like','gte','gt','lt','lte','is'].forEach(op => { q[op] = (c, v) => { st.f.push([c, op, v]); return q; }; });
    return q;
  }
  const nextId = tbl => (DB[tbl] || []).reduce((m, r) => Math.max(m, r[KEY[tbl]]), -1) + 1;
  const logEdit = (tbl, key, op, b, a, ref) => { const id = nextId('sheet_edits'); DB.sheet_edits.push({ id, gid:'', tbl, row_key:String(key), op, before:b, after:a,
    edited_by:seed.me.email, edited_at:new Date().toISOString(), ref:ref || null }); return id; };
  const RPC = {
    edit_cols: a => (seed.cols[a.p_tbl] || []).map(c => [c, (seed.types[a.p_tbl] || {})[c] || 'text']),
    edit_get: a => { const r = DB[a.p_tbl].find(x => x[KEY[a.p_tbl]] === a.p_key); return r ? { ok:true, row:r, hash:hash(r) } : { ok:false, error:'not_found' }; },
    edit_update: a => {
      const r = DB[a.p_tbl].find(x => x[KEY[a.p_tbl]] === a.p_key);
      if (!r) return { ok:false, error:'not_found' };
      if (window.__CONFLICT_NEXT) { window.__CONFLICT_NEXT = false; r.stage = 'CRM'; r.workers = 'OTHER'; }   // 상대가 먼저 바꿨다
      if (a.p_hash !== hash(r)) return { ok:false, error:'conflict', row:r, hash:hash(r) };
      const b = Object.assign({}, r); Object.assign(r, a.p_changes);
      const log = logEdit(a.p_tbl, a.p_key, 'update', b, Object.assign({}, r));
      return { ok:true, row:r, hash:hash(r), log, cascade:null };
    },
    edit_insert: a => { const k = nextId(a.p_tbl); const r = Object.assign({}, a.p_row, { [KEY[a.p_tbl]]:k }); DB[a.p_tbl].push(r);
      return { ok:true, key:k, row:r, hash:hash(r), log:logEdit(a.p_tbl, k, 'insert', null, r) }; },
    edit_delete: a => { const i = DB[a.p_tbl].findIndex(x => x[KEY[a.p_tbl]] === a.p_key); if (i < 0) return { ok:false, error:'not_found' };
      if (a.p_hash !== hash(DB[a.p_tbl][i])) return { ok:false, error:'conflict', row:DB[a.p_tbl][i], hash:hash(DB[a.p_tbl][i]) };
      const b = DB[a.p_tbl].splice(i, 1)[0]; return { ok:true, log:logEdit(a.p_tbl, a.p_key, 'delete', b, null) }; },
    edit_restore: a => { const e = DB.sheet_edits.find(x => x.id === a.p_id); if (!e) throw { message:'not_found' };
      if (/^upload:/.test(e.op) || !e.tbl) throw { message:'not_restorable' };
      if (/delete/.test(e.op)) { DB[e.tbl].push(Object.assign({}, e.before)); const k = e.before[KEY[e.tbl]];
        return { ok:true, key:k, row:e.before, log:logEdit(e.tbl, k, 'restore', null, e.before, e.id) }; }
      if (/insert|append/.test(e.op)) { const i = DB[e.tbl].findIndex(x => String(x[KEY[e.tbl]]) === e.row_key); if (i >= 0) DB[e.tbl].splice(i, 1);
        return { ok:true, log:logEdit(e.tbl, e.row_key, 'restore', e.after, null, e.id) }; }
      const r = DB[e.tbl].find(x => String(x[KEY[e.tbl]]) === e.row_key); Object.keys(e.after).forEach(k => { if (JSON.stringify(e.before[k]) !== JSON.stringify(e.after[k])) r[k] = e.before[k]; });
      return { ok:true, row:r, hash:hash(r), log:logEdit(e.tbl, e.row_key, 'restore', e.after, Object.assign({}, r), e.id) }; },
    csv_table_cols: a => seed.cols[a.p_tbl] || null,
    csv_upload_finish: a => ({ rows:(DB[a.p_tbl] || []).length, log:true }),
    csv_window: a => ({ hit:0, rows:(DB[a.p_tbl] || []).length, next_src:nextId(a.p_tbl), dry:!!a.p_dry }),
    edit_note: a => logEdit(a.p_tbl, a.p_key, a.p_op, a.p_before, a.p_after),
    edit_distinct: a => { const m = new Map(); (DB[a.p_tbl] || []).forEach(r => { const v = r[a.p_col]; if (v != null) m.set(String(v), (m.get(String(v)) || 0) + 1); });
      return Array.from(m.entries()).sort((x, y) => y[1] - x[1]).slice(0, a.p_limit || 60); }
  };
  window.__FDB = {
    from,
    rpc: async (name, args) => {
      LOG.push({ rpc:name, args:JSON.parse(JSON.stringify(args || {})) });
      if ((seed.noSetup && /^edit_/.test(name)) || (seed.missing || []).indexOf(name) >= 0)
        return { data:null, error:{ code:'PGRST202', message:'Could not find the function public.' + name + ' in the schema cache' } };
      if (!RPC[name]) return { data:null, error:{ message:'fake: no rpc ' + name } };
      try { return { data:RPC[name](args || {}), error:null }; } catch (e) { return { data:null, error:{ message:e.message } }; }
    }
  };
  window.__DB = DB;
}

/* core.js 뒤에 붙는 이음새 — 로그인·세션만 가짜로, 등급 판정(loadMe → dbWrite('perm'))은 진짜 길로 */
const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return true;};'
  + 'GST.getSession=async function(){return {user:{email:(window.__ME||"").toLowerCase()},access_token:"t"}};GST.token=async function(){return "t";};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();if(GST._authOk)GST._authOk();return true;};'
  + 'GST.db=async function(){return window.__FDB;};GST.sb=async function(){return window.__FDB;};';

const WK_COLS = ['src_row','pg','op','customer','campus','line','bay','proc','subproc','model','rs_code','status','req_type','stage','chamber','wrs',
  'main_eq','prod_code','eq_no','chpos','sn_in','sn_out','pf','alarm','phenom','cause','action','action_detail','d_start','d_end','t_start','t_end',
  'reg_date','ship_date','move_min','work_min','man_min','workers','worker_cnt','synced_at','extra'];
const MAT_COLS = ['src_row','op','customer','rs_code','campus','line','bay','proc','detail','main_eq','eq','chamber','sn','wo','model','mat_code',
  'cust_mat_code','eq_pos','unit','assembly','part','mat_pos','qty','mat_name','spec','reason','prev_paid_date','prev_date','work_date','days_paid',
  'days_prev','pf','free_reason','warranty_term','price','kit_sn','sn_in','sn_out','stock_chk','store','synced_at','extra'];
const INST_COLS = ['src_row','pjt','country','customer','location','code','sn','model','burner','fab','floor','bay','group1','group2','detail1','detail2',
  'tool_id','tool_maker','tool_model','fab_in','start','turn_on','warranty_date','warranty','pm_cycle','type','extra','div','state','line2'];
const ROS_COLS = ['No.','ID','Name((영문)','Name(중문)','Dept.','Position Level','Work Place','2025 Position Role','Date of entry','Resignation',
  '조직도 위치','직급','업무/직책','현장 인원여부','id','인사','이름(영문)','이름(중문)','직급(한글)','직급(영문)','담당구분','사업부','고객사','지역','팀',
  '단지','라인','입사일','퇴사일','E-Mail','운영단위','구분','사원번호'];
const full = (cols, o) => Object.fromEntries(cols.map(c => [c, o[c] === undefined ? null : o[c]]));
function seedOf(over) {
  const wk = [
    { src_row:0, rs_code:'RS-T-0001', d_start:'2026-01-05', op:'OPX Scrubber', campus:'Q1', line:'Q1-A', stage:'BM', eq_no:'ZQ-001', sn_in:'ZZT0001', action:'RESET', workers:'W1', work_min:'30', extra:{ 'CTC항목':'A' } },
    { src_row:1, rs_code:'RS-T-0002', d_start:'2026-01-06', op:'OPX Scrubber', campus:'Q1', line:'Q1-A', stage:'TBM', eq_no:'ZQ-002', sn_in:'ZZT-0002', action:'설비 PM' },
    { src_row:2, rs_code:'RS-T-0003', d_start:'2026-02-07', op:'OPY Scrubber', campus:'Q2', line:'Q2-B', stage:'CM', eq_no:null, sn_in:'ZZT-0001L', action:null },
    { src_row:5, rs_code:'RS-T-0004', d_start:'2026-02-28 13:00:00', op:'OPY Scrubber', campus:'Q2', line:'Q2-B', stage:'BM', eq_no:'ZQ-004', sn_out:'ZZT-0004' },
    { src_row:6, rs_code:'RS-T-0005', d_start:'2026-03-01', op:'OPY Scrubber', campus:'Q2', line:'Q2-B', stage:'BM', main_eq:'ZZT 0001 MAIN' }
  ].map(r => full(WK_COLS, Object.assign({ synced_at:'2026-01-01T00:00:00Z' }, r)));
  const mat = [
    { src_row:0, rs_code:'RS-T-0001', work_date:'2026-01-05', sn:'ZZT-0001', mat_code:'MC-01', mat_name:'O-RING TEST', qty:'2' },
    { src_row:1, rs_code:'RS-T-0002', work_date:'2026-01-06', sn:'ZZT-0002', mat_code:'MC-02', mat_name:'VALVE TEST', qty:'1' }
  ].map(r => full(MAT_COLS, r));
  const inst = [
    { src_row:0, code:'ZQ-001', sn:'ZZT-0001', country:'OPX Scrubber', customer:'TESTCO', location:'Q1', fab:'Q1-A', bay:'B01', model:'MDL-1', state:'Operation' },
    { src_row:1, code:'ZQ-007A', sn:'ZZT-0007', country:'OPX Scrubber', customer:'TESTCO', location:'Q3', fab:'Q3-A', bay:'B07', model:'MDL-7' },
    { src_row:2, code:'ZQ-007B', sn:'ZZT0007', country:'OPX Scrubber', customer:'TESTCO', location:'Q3', fab:'Q3-B', bay:'B08', model:'MDL-7' }
  ].map(r => full(INST_COLS, r));
  const roster = [
    { id:1, '사원번호':'9100001', '이름(영문)':'Tester One', '단지':'Q1', '팀':'T1', '입사일':'2024-01-02' },
    { id:2, '사원번호':'9100002', '이름(영문)':'Tester Two', '단지':'Q2', '팀':'T2', '입사일':'2024-02-03', '퇴사일':'2025-05-01' },
    { id:3, 'ID':'9100003', 'Name((영문)':'Tester Three', 'Work Place':'Q1', 'Date of entry':'2023-03-04' }
  ].map(r => full(ROS_COLS, r));
  const edits = [
    { id:1, gid:'1213453343', tbl:null, row_key:'5', op:'update', before:['a','b'], after:['a','c'], edited_by:'old@test.local', edited_at:'2026-07-01T00:00:00Z', ref:null },
    { id:2, gid:'646668307', tbl:'sheet_wk', row_key:'*', op:'upload:add', before:{ rows:3 }, after:{ rows:9, file:'t.xlsx', n:6 }, edited_by:'boss@test.local', edited_at:'2026-07-02T00:00:00Z', ref:null },
    { id:3, gid:'646668307', tbl:'sheet_wk', row_key:'1', op:'update', before:Object.assign({}, wk[1], { stage:'BM' }), after:Object.assign({}, wk[1]), edited_by:'boss@test.local', edited_at:'2026-07-03T00:00:00Z', ref:null }
  ];
  return Object.assign({
    me:{ email:'boss@test.local', can_write:true, role:'admin' },
    tables:{ sheet_wk:wk, sheet_mat:mat, sheet_inst:inst, sheet_roster:roster, sheet_edu:[], sheet_leave:[], sheet_edits:edits,
             allowed_users:[{ email:'boss@test.local', can_write:true, role:'admin' }, { email:'ed@test.local', can_write:true, role:'editor' }] },
    cols:{ sheet_wk:WK_COLS, sheet_mat:MAT_COLS, sheet_inst:INST_COLS, sheet_roster:ROS_COLS,
           sheet_edu:['No','Site','인원','사원번호','Basic 교육완료일','Veteran 교육완료일','Scrubber Lv.2 교육완료일','Scrubber Lv.3 교육완료일','id','구분'],
           sheet_leave:['사원번호','이름','소속','항목','발생일','휴가시작일','휴가시작시간','휴가종료일','휴가종료시간','휴가신청시간','비고','id'] },
    types:{ sheet_wk:{ src_row:'integer' }, sheet_roster:{ id:'bigint' }, sheet_edu:{ '사원번호':'bigint', id:'bigint' }, sheet_leave:{ '사원번호':'bigint', '휴가신청시간':'double precision' } }
  }, over || {});
}

const browser = await chromium.launch(PW);
async function open(seed) {
  const ctx = await browser.newContext({ viewport:{ width:1500, height:1000 }, locale:'ko-KR' });
  await ctx.route('**gstcsglobal-cloud.github.io/assets/core.js*', r => r.fulfill({ status:200, contentType:'application/javascript',
    body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB }));
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
  await ctx.addInitScript(`window.__ME=${JSON.stringify(seed.me.email)};(${fake.toString()})(${JSON.stringify(seed)});`);
  const pg = await ctx.newPage(); const pe = [];
  pg.on('pageerror', e => pe.push(e.message));
  await pg.goto(BASE + '/edit/', { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(500);
  return { ctx, pg, pe };
}
const qlog = pg => pg.evaluate(() => window.__QLOG.splice(0));
const rpcs = (log, name) => log.filter(x => x.rpc === name);
const sel = (log, tbl) => log.filter(x => x.tbl === tbl);
const listKeys = pg => pg.$$eval('#list tbody tr', trs => trs.map(t => t.dataset.key));
const snackText = pg => pg.$eval('#snack', e => e.textContent);
async function setField(pg, col, v) {
  const h = await pg.$('#editor [data-col="' + col + '"]');
  await h.fill(v); await h.dispatchEvent('input');
}

/* ═══ [1] 게이트 ═══ */
console.log('[1] 관리자 게이트');
{
  const s = seedOf({ me:{ email:'ed@test.local', can_write:true, role:'editor' } });
  const { ctx, pg, pe } = await open(s);
  is(await pg.$eval('#gate', e => !e.hidden) && await pg.$eval('#app', e => e.hidden), 'editor 는 잠긴 문 — 앱이 안 열린다');
  is(pe.length === 0, 'JS 에러 없음' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}

/* ═══ [2] 서버 준비 전 ═══ */
console.log('[2] setup-16 전 — 말하며 잠근다');
{
  const { ctx, pg, pe } = await open(seedOf({ noSetup:true }));
  const ban = await pg.$eval('#banner', e => e.innerText);
  is(/setup-16-edit\.sql/.test(ban) && /검색·보기는 됩니다/.test(ban), '배너가 무엇을 하면 되는지 적는다');
  is(await pg.$eval('[data-act=new]', b => b.disabled), '「+ 새 행」 잠김');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  is((await listKeys(pg)).length === 5, '검색·목록은 된다 (' + (await listKeys(pg)).length + '행)');
  is(pe.length === 0, 'JS 에러 없음' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}

/* ═══ [2b] 삭제·되돌리기 함수만 없을 때 ═══
   DELETE 가 든 SQL 은 도구로 못 올려 SQL Editor 에서 따로 Run 한다 — 그 사이에는 «부분 적용» 상태다. */
console.log('[2b] 삭제·되돌리기 함수만 없을 때 — 그 단추만 잠그고 말한다');
{
  const { ctx, pg, pe } = await open(seedOf({ missing:['edit_delete','edit_restore'] }));
  const ban = await pg.$eval('#banner', e => e.innerText);
  is(/삭제·되돌리기가 아직 잠겨/.test(ban) && /setup-16-edit\.sql/.test(ban), '부분 적용 — 배너가 무엇을 하면 되는지 적는다');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  await pg.click('#list tr[data-key="0"]'); await pg.waitForTimeout(250);
  is(await pg.$eval('#editor [data-act=del]', b => b.disabled), '삭제 단추만 잠김');
  is(!(await pg.$eval('#search [data-act=new]', b => b.disabled)), '새 행은 열려 있다');
  await setField(pg, 'workers', 'W2');
  await pg.click('#editor [data-act=save]'); await pg.waitForTimeout(300);
  const sn = await snackText(pg);
  is(/저장했습니다/.test(sn) && !/되돌리기/.test(sn), '수정은 되고, 되돌리기는 제안하지 않는다');
  await pg.click('.tab[data-tab=hist]'); await pg.waitForTimeout(400);
  is(await pg.$$eval('#hlist [data-hr]', x => x.length) === 0, '이력에 되돌리기 단추가 없다');
  is(pe.length === 0, 'JS 에러 없음' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}

/* ═══ [3] 검색 조건 ═══ */
console.log('[3] 검색이 보내는 조건');
const { ctx, pg, pe } = await open(seedOf());
{
  is(await pg.$eval('#app', e => !e.hidden), '관리자는 열린다');
  await qlog(pg);
  await pg.fill('#search [name=sn]', 'ZZT-0001'); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  let L = sel(await qlog(pg), 'sheet_wk');
  const q = L[L.length - 1];
  is(q && q.or.length === 1 && q.or[0] === 'sn_in.ilike.*ZZT*0001*,sn_out.ilike.*ZZT*0001*,eq_no.ilike.*ZZT*0001*,main_eq.ilike.*ZZT*0001*',
    'S/N 은 네 열 중 하나에 «포함» — 하이픈을 버리고 덩어리로 (' + (q && q.or[0]) + ')');
  is(q && q.order === 'src_row' && q.asc === false && q.limit === 101, '최근에 올린 행부터 · 100+1 건');
  const keys = await listKeys(pg);
  is(JSON.stringify(keys) === JSON.stringify(['6','2','0']), 'ZZT0001 · ZZT-0001L · «ZZT 0001 MAIN» 셋이 잡힌다 (' + keys + ')');

  await pg.fill('#search [name=sn]', '');
  await pg.fill('#search [name=dt_from]', '2026-02-01'); await pg.fill('#search [name=dt_to]', '2026-02-28');
  await pg.fill('#search [name=stage]', 'BM');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  L = sel(await qlog(pg), 'sheet_wk');
  const q2 = L[L.length - 1];
  const has = (c, op, v) => q2.f.some(f => f[0] === c && f[1] === op && f[2] === v);
  is(has('d_start', 'gte', '2026-02-01') && has('d_start', 'lt', '2026-03-01'), '기간 끝날은 «다음 날 미만» — 2/28 13:00 행이 빠지지 않는다');
  is(has('stage', 'eq', 'BM') && !q2.f.some(f => f[0] === 'stage' && f[1] === 'ilike'), '작업단계는 «정확히» (BM 이 TBM·CBM 을 잡지 않게)');
  is(JSON.stringify(await listKeys(pg)) === JSON.stringify(['5']), '결과: 2월 BM 한 건 (' + (await listKeys(pg)) + ')');

  /* 그 밖의 열 — 비어 있음 */
  await pg.click('#search [data-act=reset]'); await pg.waitForTimeout(100);
  await pg.selectOption('#search [name=ocol]', 'eq_no'); await pg.selectOption('#search [name=omode]', 'nul');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  L = sel(await qlog(pg), 'sheet_wk');
  is(L[L.length - 1].f.some(f => f[0] === 'eq_no' && f[1] === 'is' && f[2] === null) && (await listKeys(pg)).join() === '6,2',
    '「그 밖의 열 · 비어 있음」 → is null (' + (await listKeys(pg)) + ')');

  /* 자재 — 여러 열 칸 둘이면 and(or,or) */
  await pg.click('.tab[data-tab=mat]'); await pg.waitForTimeout(300);
  await qlog(pg);
  await pg.fill('#search [name=sn]', 'ZZT-0001'); await pg.fill('#search [name=mat]', 'o-ring');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  L = sel(await qlog(pg), 'sheet_mat');
  const q3 = L[L.length - 1];
  is(q3 && q3.or.length === 1 && /^and\(or\(sn\.ilike\.\*ZZT\*0001\*,.*\),or\(mat_code\.ilike\.\*o\*ring\*,mat_name\.ilike\.\*o\*ring\*,cust_mat_code\.ilike\.\*o\*ring\*\)\)$/.test(q3.or[0]),
    '여러 열 칸 둘 → or 파라미터 한 번에 and(or(…),or(…))');
  is((await listKeys(pg)).join() === '0', '자재 결과 한 건');
}

/* ═══ [4] 열기 · 저장 ═══ */
console.log('[4] 열기 · 바뀐 칸만 저장');
{
  await pg.click('.tab[data-tab=wk]'); await pg.waitForTimeout(300);
  is(await pg.$eval('#search [name=ocol]', e => e.value) === 'eq_no', '탭을 오가도 그 탭의 검색 조건은 남아 있다');
  await pg.click('#search [data-act=reset]'); await pg.waitForTimeout(100);
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  await qlog(pg);
  await pg.click('#list tr[data-key="0"]'); await pg.waitForTimeout(250);
  let L = await qlog(pg);
  is(rpcs(L, 'edit_get').length === 1 && rpcs(L, 'edit_get')[0].args.p_key === 0 && rpcs(L, 'edit_get')[0].args.p_tbl === 'sheet_wk', 'edit_get(sheet_wk, 0)');
  const lbl = await pg.$eval('#editor [data-col=rs_code]', e => e.closest('.fld').querySelector('.fl').textContent);
  is(/실적코드/.test(lbl), '이름표는 SPEC 별칭에서 (' + lbl + ')');
  is(await pg.$eval('#editor [data-act=save]', b => b.disabled), '바뀐 것이 없으면 저장 단추가 잠겨 있다');
  await setField(pg, 'stage', 'TBM'); await setField(pg, 'action', '');
  await setField(pg, 'd_start', '2026.1.5');
  await pg.$eval('#editor [data-col=d_start]', e => e.dispatchEvent(new FocusEvent('focusout', { bubbles:true })));
  is(await pg.$eval('#editor [data-col=d_start]', e => e.value) === '2026-01-05', '날짜 칸은 떠날 때 YYYY-MM-DD 로 눕힌다');
  await setField(pg, 'work_min', '1,234');
  await pg.$eval('#editor [data-x="CTC항목"]', e => { e.closest('details').open = true; });
  await pg.fill('#editor [data-x="CTC항목"]', 'B'); await pg.$eval('#editor [data-x="CTC항목"]', e => e.dispatchEvent(new Event('input', { bubbles:true })));
  const btn = await pg.$eval('#editor [data-act=save]', b => b.textContent);
  is(/4칸/.test(btn), '저장 단추가 바뀐 칸 수를 센다 (' + btn + ')');
  await qlog(pg);
  await pg.click('#editor [data-act=save]'); await pg.waitForTimeout(300);
  L = await qlog(pg);
  const up = rpcs(L, 'edit_update')[0];
  is(!!up && JSON.stringify(Object.keys(up.args.p_changes).sort()) === JSON.stringify(['action','extra','stage','work_min']),
    '바뀐 칸만 보낸다 — ' + (up && Object.keys(up.args.p_changes).join(',')));
  is(up && up.args.p_changes.action === null && up.args.p_changes.work_min === '1234', '빈칸은 null · 숫자는 쉼표를 뗀다');
  is(up && up.args.p_changes.extra && up.args.p_changes.extra['CTC항목'] === 'B', 'extra 는 합친 객체로');
  is(up && /^h:/.test(up.args.p_hash), '연 시점의 해시를 함께 보낸다');
  is(/저장했습니다/.test(await snackText(pg)) && /되돌리기/.test(await snackText(pg)), '저장 알림 + 되돌리기');
  is(await pg.$eval('#list tr[data-key="0"] td:nth-child(7)', e => e.textContent) === 'TBM', '목록 칸도 새 값으로');
}

/* ═══ [5] 입력값 검사 ═══ */
console.log('[5] 입력값 검사 — 막히면 서버에 안 간다');
{
  await qlog(pg);
  await setField(pg, 'd_end', '2026-13-01');
  await setField(pg, 'move_min', 'abc');
  await setField(pg, 'phenom', '=SUM(A1)');
  await pg.click('#editor [data-act=save]'); await pg.waitForTimeout(200);
  const L = await qlog(pg);
  is(rpcs(L, 'edit_update').length === 0, '검사에 걸리면 RPC 를 부르지 않는다');
  const errs = await pg.$$eval('#editor .fld.bad', fs => fs.map(f => f.querySelector('[data-col]').dataset.col).sort());
  is(JSON.stringify(errs) === JSON.stringify(['d_end','move_min','phenom']), '세 칸이 붉다 (' + errs + ')');
  await pg.click('#editor [data-act=revert]'); await pg.waitForTimeout(100);
  is(await pg.$$eval('#editor .fld.bad, #editor .fld.dirty', x => x.length) === 0, '「변경 취소」로 원래대로');
}

/* ═══ [6] 충돌 ═══ */
console.log('[6] 충돌 — 다시 열고 내 변경을 다시 얹는다');
{
  await pg.click('#list tr[data-key="1"]'); await pg.waitForTimeout(250);
  await pg.evaluate(() => { window.__CONFLICT_NEXT = true; });     // 다음 저장 직전에 «상대»가 같은 행을 바꾼다
  await setField(pg, 'stage', 'CM'); await setField(pg, 'cause', 'my cause');
  await pg.click('#editor [data-act=save]'); await pg.waitForTimeout(300);
  const dlg = await pg.$('.mask .dlg-h');
  is(!!dlg && /먼저 바뀌었습니다/.test(await dlg.textContent()), '충돌 대화상자');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(200);
  is(await pg.$eval('#editor [data-col=stage]', e => e.value) === 'CM' && await pg.$eval('#editor [data-col=cause]', e => e.value) === 'my cause', '내 변경을 다시 얹었다');
  is(await pg.$eval('#editor [data-col=stage]', e => e.closest('.fld').classList.contains('clash')), '상대도 바꾼 칸(작업단계)은 노랗게');
  is(!(await pg.$eval('#editor [data-col=cause]', e => e.closest('.fld').classList.contains('clash'))), '나만 바꾼 칸은 그냥 파랗게');
  is(await pg.$eval('#editor [data-col=workers]', e => e.value) === 'OTHER', '상대가 바꾼 다른 칸은 상대 값 그대로');
  await qlog(pg);
  await pg.click('#editor [data-act=save]'); await pg.waitForTimeout(300);
  const up = rpcs(await qlog(pg), 'edit_update')[0];
  is(up && up.args.p_changes.stage === 'CM' && !('workers' in up.args.p_changes), '다시 저장하면 새 해시로 · 상대 칸은 안 건드린다');
}

/* ═══ [7] 새 행 ═══ */
console.log('[7] 새 행 — 필수 · 중복이면 묻는다');
{
  await pg.click('#search [data-act=new]'); await pg.waitForTimeout(200);
  is(await pg.$eval('#editor .badge.newtag', e => !!e), '새 행 편집기');
  await qlog(pg);
  await pg.click('#editor [data-act=insert]'); await pg.waitForTimeout(150);
  const bad = await pg.$$eval('#editor .fld.bad', fs => fs.map(f => f.querySelector('[data-col]').dataset.col).sort());
  is(JSON.stringify(bad) === JSON.stringify(['d_start','rs_code']) && rpcs(await qlog(pg), 'edit_insert').length === 0, '필수 두 칸이 비면 막는다 (' + bad + ')');
  await setField(pg, 'rs_code', 'RS-T-0002'); await setField(pg, 'd_start', '20260310'); await setField(pg, 'stage', 'BM');
  await pg.click('#editor [data-act=insert]'); await pg.waitForTimeout(250);
  const d = await pg.$('.mask .dlg-h');
  is(!!d && /이미 있습니다/.test(await d.textContent()), '같은 실적코드가 있으면 묻는다');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(300);
  const ins = rpcs(await qlog(pg), 'edit_insert')[0];
  is(ins && ins.args.p_row.d_start === '2026-03-10' && ins.args.p_row.rs_code === 'RS-T-0002' && !('action' in ins.args.p_row) && !('src_row' in ins.args.p_row),
    '넣을 때 빈칸·키는 안 보내고 날짜는 눕힌다');
  is((await listKeys(pg))[0] === '7' && await pg.$eval('#editor .key', e => e.textContent) === '행 #7', '새 행(#7)이 목록 맨 위 · 편집기로 열린다');
}

/* ═══ [8] 삭제 · 되살리기 ═══ */
console.log('[8] 삭제 → 되살리기');
{
  await qlog(pg);
  await pg.click('#editor [data-act=del]'); await pg.waitForTimeout(150);
  is(/되살릴 수 있습니다/.test(await pg.$eval('.mask .dlg-b', e => e.textContent)), '확인 창이 «되살릴 수 있다»고 말한다');
  await pg.click('.mask .btn.dng'); await pg.waitForTimeout(300);
  let L = await qlog(pg);
  const del = rpcs(L, 'edit_delete')[0];
  is(del && del.args.p_key === 7 && /^h:/.test(del.args.p_hash), 'edit_delete(키 · 해시)');
  is(!(await listKeys(pg)).includes('7') && /되살리기/.test(await snackText(pg)), '목록에서 빠지고 «되살리기» 알림');
  await pg.click('#snack button'); await pg.waitForTimeout(400);
  L = await qlog(pg);
  is(rpcs(L, 'edit_restore').length === 1 && (await listKeys(pg)).includes('7'), '되살리기 → edit_restore · 목록에 다시');
}

/* ═══ [9] 설치현황에서 채우기 ═══ */
console.log('[9] 설치현황에서 채우기');
{
  await pg.click('#list tr[data-key="2"]'); await pg.waitForTimeout(250);
  await setField(pg, 'model', 'KEEP-ME');
  await qlog(pg);
  await pg.click('#editor [data-act=fill]'); await pg.waitForTimeout(300);
  const L = sel(await qlog(pg), 'sheet_inst');
  is(L.length === 1 && L[0].or[0].includes('sn.ilike.*ZZT*0001*') && L[0].or[0].includes('sn.ilike.*ZZT*0001L*'), '접미를 뗀 S/N 도 함께 찾는다');
  const rows = await pg.$$eval('.mask table.dt tr', trs => trs.slice(1).map(t => [t.cells[1].textContent, !!t.querySelector('input:checked'), !!t.querySelector('input')]));
  const m = Object.fromEntries(rows.map(r => [r[0], r]));
  is(m['설비호기'] && m['설비호기'][1] && m['운영단위'] && m['운영단위'][2] && !m['운영단위'][1], '빈 칸(설비호기)만 기본 체크 · 값 있는 칸(운영단위)은 체크 안 됨');
  is(m['MODEL(자사)'] && !m['MODEL(자사)'][1], '내가 적은 값(모델)은 기본으로 안 덮는다');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(150);
  is(await pg.$eval('#editor [data-col=eq_no]', e => e.value) === 'ZQ-001' && await pg.$eval('#editor [data-col=model]', e => e.value) === 'KEEP-ME', '설비호기만 채워졌다');
  is(await pg.$eval('#editor [data-col=eq_no]', e => e.closest('.fld').classList.contains('dirty')), '채운 칸은 «바뀐 칸»으로 보인다(저장은 사람이)');
  await pg.click('#editor [data-act=revert]');
  /* 두 대가 맞으면 고르게 한다 */
  await setField(pg, 'sn_in', 'ZZT-0007');
  await pg.click('#editor [data-act=fill]'); await pg.waitForTimeout(300);
  is(/2대/.test(await pg.$eval('.mask .dlg-h', e => e.textContent)), '설치현황에 맞는 설비가 둘이면 고르게 한다');
  await pg.click('.mask [data-ret="1"]'); await pg.waitForTimeout(200);
  is(/ZQ-007B/.test(await pg.$eval('.mask .dlg-b', e => e.textContent)), '고른 설비(ZQ-007B)로 채우기 표가 뜬다');
  await pg.click('.mask .btn:not(.pri)'); await pg.click('#editor [data-act=revert]');
}

/* ═══ [10] 바꾼 채로 떠나면 묻는다 ═══ */
console.log('[10] 저장 안 한 변경');
{
  await setField(pg, 'workers', 'W9');
  await pg.click('#list tr[data-key="0"]'); await pg.waitForTimeout(200);
  is(/저장하지 않은 변경/.test(await pg.$eval('.mask .dlg-h', e => e.textContent)), '다른 행을 누르면 먼저 묻는다');
  await pg.click('.mask .btn:not(.dng)'); await pg.waitForTimeout(100);
  is(await pg.$eval('#editor [data-col=workers]', e => e.value) === 'W9', '취소하면 그대로 남는다');
  await pg.click('#editor [data-act=revert]');
}

/* ═══ [11] 변경 이력 ═══ */
console.log('[11] 변경 이력');
{
  await pg.click('#editor [data-act=hist]'); await pg.waitForTimeout(400);
  let L = sel(await qlog(pg), 'sheet_edits');
  const q = L[L.length - 1];
  is(q && q.f.some(f => f[0] === 'tbl' && f[1] === 'eq' && f[2] === 'sheet_wk') && q.f.some(f => f[0] === 'row_key' && f[2] === '2'), '「이 행 이력」 → 표·행 번호로 거른다');
  await pg.selectOption('#hfilt [name=tbl]', ''); await pg.fill('#hfilt [name=key]', '');
  await pg.click('#hfilt button[type=submit]'); await pg.waitForTimeout(300);
  const ent = await pg.$$eval('#hlist .he', es => es.map(e => ({ t:e.querySelector('.tl').textContent, op:e.querySelector('.op').textContent, r:!!e.querySelector('[data-hr]') })));
  const old = ent.find(e => /옛 시트/.test(e.t)), upl = ent.find(e => /업로드/.test(e.op)), upd = ent.find(e => /#3/.test(e.t));
  is(old && !old.r, '옛 형식(시트 편집)은 되돌리기 단추가 없다');
  is(upl && !upl.r, '업로드 요약도 되돌리기 단추가 없다');
  is(upd && upd.r, '수정 이력은 되돌릴 수 있다');
  is(ent.some(e => /되돌리기/.test(e.op)), '앞에서 한 되살리기도 이력에 한 줄');
  await pg.selectOption('#hfilt [name=kind]', 'del'); await pg.click('#hfilt button[type=submit]'); await pg.waitForTimeout(300);
  L = sel(await qlog(pg), 'sheet_edits');
  is(L[L.length - 1].f.some(f => f[0] === 'op' && f[1] === 'in' && f[2].join() === 'delete,dbw:delete'), '종류=삭제 → op in (delete, dbw:delete)');
  await pg.selectOption('#hfilt [name=kind]', ''); await pg.click('#hfilt button[type=submit]'); await pg.waitForTimeout(300);
  await pg.click('#hlist [data-hr="3"]'); await pg.waitForTimeout(150);
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(400);
  is(rpcs(await qlog(pg), 'edit_restore').some(x => x.args.p_id === 3), '이력에서 되돌리기 → edit_restore(3)');
  await pg.click('#hlist [data-hv="2"]'); await pg.waitForTimeout(150);
  is(/t\.xlsx/.test(await pg.$eval('.mask .dlg-b', e => e.textContent)), '「보기」가 원문을 보여 준다');
  await pg.click('.mask .btn');
}

/* ═══ [12] 작은 표 — 인원 ═══ */
console.log('[12] 인원현황 — 통째로 받아 화면에서 거른다');
{
  await qlog(pg);
  await pg.click('.tab[data-tab=roster]'); await pg.waitForTimeout(400);
  const L = sel(await qlog(pg), 'sheet_roster');
  is(L.length >= 2 && L[L.length - 1].f.some(f => f[0] === 'id' && f[1] === 'gt'), '키셋(gt id)으로 받고 «0행»에서 멈춘다 (' + L.length + '번)');
  is((await listKeys(pg)).length === 3, '세 명 전부');
  const head = await pg.$$eval('#list thead th', ths => ths.map(t => t.textContent));
  is(head[1] === '사원번호', '목록 열은 «값이 찬» 사원번호 (빈 ID 를 집지 않는다)');
  await pg.fill('#search [name=q]', 'tester t'); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(200);
  is((await listKeys(pg)).sort().join() === '2,3', '이름 «포함»은 덩어리 순서대로 (Tester Two · Tester Three)');
  await pg.selectOption('#search [name=act]', 'y'); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(200);
  is((await listKeys(pg)).join() === '3', '재직만 — 퇴사일 있는 사람 제외');
  await pg.click('#list tr[data-key="3"]'); await pg.waitForTimeout(250);
  is(await pg.$eval('#editor details.grp', d => d.open), '옛 양식 열에 값이 있으면 그 묶음을 펼쳐 둔다');
  await setField(pg, '팀', 'T9');
  await qlog(pg);
  await pg.click('#editor [data-act=save]'); await pg.waitForTimeout(300);
  const up = rpcs(await qlog(pg), 'edit_update')[0];
  is(up && up.args.p_tbl === 'sheet_roster' && up.args.p_key === 3 && up.args.p_changes['팀'] === 'T9', '인원 수정 → edit_update(sheet_roster, id)');
}

/* ═══ [13] 업로드 — 이어붙이기 키 중복 미리보기 · 이력 한 줄 ═══ */
console.log('[13] 업로드 — 키 중복 미리보기 · 요약 이력');
{
  const XLSX = (await import('./node_modules/xlsx/xlsx.mjs'));
  const up = await ctx.newPage(); const upe = [];
  up.on('pageerror', e => upe.push(e.message));
  up.on('dialog', d => d.accept());
  await up.goto(BASE + '/upload/', { waitUntil:'domcontentloaded' }); await up.waitForTimeout(500);
  const canon = await up.evaluate(() => { const S = GST.SM.SPEC.wk; return Object.keys(S.fields).map(k => [k, [].concat(S.fields[k])[0]]); });
  const head = canon.map(x => x[1]);
  const row = o => canon.map(([k]) => o[k] == null ? '' : o[k]);
  const ws = XLSX.utils.aoa_to_sheet([head,
    row({ rsCode:'RS-T-0001', dStart:'2026-04-01', op:'OPX Scrubber', stage:'BM' }),
    row({ rsCode:'RS-T-0100', dStart:'2026-04-02', op:'OPX Scrubber', stage:'BM' }),
    row({ rsCode:'RS-T-0100', dStart:'2026-04-02', op:'OPX Scrubber', stage:'BM' })]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '수선실적');
  const fp = path.join(fs.mkdtempSync(path.join((await import('os')).tmpdir(), 'gst-edit-')), 'add.xlsx');
  fs.writeFileSync(fp, XLSX.write(wb, { type:'buffer', bookType:'xlsx' }));
  const wkIdx = await up.evaluate(() => String(TABLES.findIndex(t => t.rid === 'wk')));
  await up.selectOption('#tsel', wkIdx);
  await up.selectOption('#modeSel', 'add'); await up.evaluate(() => window.onMode());
  await up.evaluate(() => window.__QLOG.splice(0));
  await up.setInputFiles('#fsel', fp);
  await up.waitForFunction(() => /키 중복|중복을 확인하지/.test(document.getElementById('chk').innerText), null, { timeout:15000 }).catch(() => {});
  const chk = await up.$eval('#chk', e => e.innerText);
  is(/이 파일의 1행은 실적코드가 이미 표에 있습니다/.test(chk) && /RS-T-0001/.test(chk), '이어붙이기 전에 «이미 표에 있는 실적코드»를 센다');
  is(/파일 안에서도 같은 실적코드 행이 1개/.test(chk), '파일 안의 중복도 센다');
  const L = await up.evaluate(() => window.__QLOG.splice(0));
  const inq = L.find(x => x.tbl === 'sheet_wk' && x.f.some(f => f[0] === 'rs_code' && f[1] === 'in'));
  is(inq && inq.f.find(f => f[1] === 'in')[2].sort().join() === 'RS-T-0001,RS-T-0100', '키는 in(…) 한 번에 — 파일의 고유 키만');
  await up.click('#goBtn'); await up.waitForTimeout(800);
  const L2 = await up.evaluate(() => window.__QLOG.splice(0));
  const note = L2.find(x => x.rpc === 'edit_note');
  is(note && note.args.p_op === 'upload:add' && note.args.p_tbl === 'sheet_wk' && note.args.p_after.n === 3
     && note.args.p_after.file === 'add.xlsx' && note.args.p_after.dup === 1 && typeof note.args.p_before.rows === 'number',
     '업로드가 끝나면 요약 한 줄(edit_note upload:add · 파일 · 행수 · 중복)');
  is(/완료/.test(await up.$eval('#log', e => e.innerText)), '업로드 자체는 그대로 끝난다(미리보기는 막지 않는다)');
  is(upe.length === 0, '업로드 화면 JS 에러 없음' + (upe.length ? ' → ' + upe[0] : ''));
  /* 그 한 줄이 /edit/ 이력에 뜬다 — 가짜 DB 는 창마다 따로라, 업로드 창이 «실제로 남긴 그 줄»을 옮겨 놓고 본다 */
  const noteRow = await up.evaluate(() => window.__DB.sheet_edits[window.__DB.sheet_edits.length - 1]);
  await pg.evaluate(n => { n.id = 999; window.__DB.sheet_edits.push(n); }, noteRow);
  await pg.click('.tab[data-tab=hist]'); await pg.waitForTimeout(200);
  await pg.click('#hfilt button[type=submit]'); await pg.waitForTimeout(300);
  const top = await pg.$eval('#hlist .he', e => e.innerText);
  is(/업로드 이어붙이기/.test(top) && /add\.xlsx/.test(top) && /키 중복 의심 1행/.test(top), '데이터 관리 «변경 이력»에 업로드 요약이 뜬다');
  await up.close();
}

is(pe.length === 0, '전 과정 JS 에러 없음' + (pe.length ? ' → ' + pe.join(' | ') : ''));
await ctx.close();
await browser.close();
srv.close();
console.log(fail ? `\n❌ t-edit: ${pass} 통과 · ${fail} 실패` : `\n✅ t-edit: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
