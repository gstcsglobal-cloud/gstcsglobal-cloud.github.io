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
  const KEY = { sheet_wk:'src_row', sheet_mat:'src_row', sheet_inst:'src_row', sheet_alarm:'src_row', sheet_allbypass:'src_row',
               sheet_roster:'id', sheet_edu:'id', sheet_leave:'id', sheet_edits:'id' };
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
  const splitTop = s => { const out = []; let d = 0, cur = '', q = false, esc = false;
    for (const ch of s) {
      if (esc) { cur += ch; esc = false; continue; }
      if (q && ch === '\\') { cur += ch; esc = true; continue; }
      if (ch === '"') q = !q;
      if (!q) { if (ch === '(') d++; if (ch === ')') d--; }
      if (ch === ',' && d === 0 && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    if (cur) out.push(cur); return out; };
  const inList = v => { const out = []; let cur = '', q = false, esc = false;
    for (const ch of v.slice(1, -1)) {
      if (esc) { cur += ch; esc = false; continue; }
      if (q && ch === '\\') { esc = true; continue; }
      if (ch === '"') { q = !q; continue; }
      if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur); return out; };
  const evalTerm = (row, t) => {
    if (/^and\(/.test(t)) return splitTop(t.slice(4, -1)).every(x => evalTerm(row, x));
    if (/^or\(/.test(t)) return splitTop(t.slice(3, -1)).some(x => evalTerm(row, x));
    const a = t.indexOf('.'), b = t.indexOf('.', a + 1);
    const op = t.slice(a + 1, b), v = t.slice(b + 1);
    return test(row, t.slice(0, a), op, op === 'in' ? inList(v) : v);
  };
  function from(tbl) {
    const st = { tbl, f:[], or:[], order:null, asc:true, limit:null, cols:null, single:false, head:false, ins:null };
    const q = {
      select(c, o) { st.cols = c; if (o && o.head) st.head = true; if (o && o.count) st.count = true; return q; },
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
        const total = rows.length;
        if (st.limit != null) rows = rows.slice(0, st.limit);
        if (window.__MAXROWS && !st.head && rows.length > window.__MAXROWS) rows = rows.slice(0, window.__MAXROWS);   // 서버 행수 상한(max-rows) — 요청보다 짧은 장이 온다
        if (st.head && window.__COUNT_ERR) return Promise.resolve({ data:null, count:null, error:{ message:'canceling statement due to statement timeout' } }).then(res, rej);
        if (st.head && window.__COUNT_AS != null) return Promise.resolve({ data:null, count:window.__COUNT_AS, error:null }).then(res, rej);
        if (st.cols && st.cols !== '*') { const cs = st.cols.split(','); rows = rows.map(r => Object.fromEntries(cs.map(c => [c, r[c] === undefined ? null : r[c]]))); }
        else rows = rows.map(r => Object.assign({}, r));
        const out = st.head ? { count: rows.length, data: null, error: null }
          : st.single ? { data: rows[0] || null, error: null } : { data: rows, count: st.count ? total : null, error: null };
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
    edit_get_many: a => (a.p_keys || []).map(k => DB[a.p_tbl].find(x => x[KEY[a.p_tbl]] === k)).filter(Boolean)
      .sort((x, y) => x[KEY[a.p_tbl]] - y[KEY[a.p_tbl]]).map(r => ({ key:r[KEY[a.p_tbl]], row:Object.assign({}, r), hash:hash(r) })),
    /* edit_bulk — 확인 먼저(하나라도 어긋나면 아무것도 안 쓴다) · 머리 이력(bulk) + 줄마다 이력(ref) · 모양만 흉내(의미는 t-editsql) */
    edit_bulk: a => {
      const items = a.p_items || [], K = KEY[a.p_tbl];
      if (!items.length) throw new Error('no_values');
      if (items.length > 500) throw new Error('too_many: ' + items.length);
      if (window.__BULK_BEFORE) { const f = window.__BULK_BEFORE; window.__BULK_BEFORE = null; f(DB); }     // 미리보기 뒤 «상대»가 먼저 바꿨다
      const conf = [], seen = new Set(), prep = []; let same = 0;
      for (const it of items) {
        if (it.op === 'update') {
          if (seen.has(it.key)) { conf.push({ key:it.key, error:'dup' }); continue; } seen.add(it.key);
          const r = DB[a.p_tbl].find(x => x[K] === it.key);
          if (!r) { conf.push({ key:it.key, error:'not_found' }); continue; }
          if (it.hash !== hash(r)) { conf.push({ key:it.key, error:'conflict' }); continue; }
          const ch = {}; Object.keys(it.changes || {}).forEach(c => { if (JSON.stringify(r[c] === undefined ? null : r[c]) !== JSON.stringify(it.changes[c])) ch[c] = it.changes[c]; });
          if (!Object.keys(ch).length) { same++; continue; }
          prep.push({ op:'update', r, ch });
        } else if (it.op === 'insert') {
          const v = {}; Object.keys(it.row || {}).forEach(c => { if (it.row[c] != null) v[c] = it.row[c]; });
          if (!Object.keys(v).length) throw new Error('no_values');
          if (K in v) throw new Error('locked_column: ' + K);
          prep.push({ op:'insert', v });
        } else throw new Error('bad_op: ' + it.op);
      }
      if (conf.length) return { ok:false, error:'conflict', rows:conf };
      const nu = prep.filter(x => x.op === 'update').length, ni = prep.length - nu;
      if (!prep.length) return { ok:true, log:null, updated:0, inserted:0, same };
      const bid = logEdit(a.p_tbl, '*', 'bulk', null, Object.assign({}, a.p_note || {}, { updated:nu, inserted:ni, same }));
      prep.forEach(x => {
        if (x.op === 'update') { const b = Object.assign({}, x.r); Object.assign(x.r, x.ch); logEdit(a.p_tbl, x.r[K], 'update', b, Object.assign({}, x.r), bid); }
        else { const k = nextId(a.p_tbl); const r = Object.assign(Object.fromEntries((seed.cols[a.p_tbl] || []).map(c => [c, null])), x.v, { [K]:k });
               DB[a.p_tbl].push(r); logEdit(a.p_tbl, k, 'insert', null, Object.assign({}, r), bid); }
      });
      return { ok:true, log:bid, updated:nu, inserted:ni, same };
    },
    edit_overwrites: a => window.__OVW || { n:0, last:null, keys:[], who:[] },
    edit_distinct: a => { const m = new Map(); (DB[a.p_tbl] || []).forEach(r => { const v = r[a.p_col]; if (v != null) m.set(String(v), (m.get(String(v)) || 0) + 1); });
      return Array.from(m.entries()).sort((x, y) => y[1] - x[1]).slice(0, a.p_limit || 60); }
  };
  window.__FDB = {
    from,
    rpc: async (name, args) => {
      LOG.push({ rpc:name, args:JSON.parse(JSON.stringify(args || {})) });
      if ((seed.noSetup && /^edit_/.test(name)) || (seed.missing || []).indexOf(name) >= 0)
        return { data:null, error:{ code:'PGRST202', message:'Could not find the function public.' + name + ' in the schema cache' } };
      if (args && (seed.badTbl || []).indexOf(args.p_tbl) >= 0) return { data:null, error:{ message:'bad_table: ' + args.p_tbl } };   // 옛 setup-16 — 표 사전에 원장이 없다
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
const ALARM_COLS = ['src_row','src_sheet','op','site','line','area','bay','eqp_id','proc','subproc','chamber','chpos','sn','sn_key','seqp_id',
  'status','maker','model','ch','alevel','alarm','alarm_name','occur','rel_time','hold','occur_date','atype','ctype','ctype2','inout','incl','cnt',
  'cause','phenom','action','module','src_month','src_week','src_year','fmonth','fweek','checker','extra','imported_at'];
const ABP_COLS = ['src_row','src_sheet','op','site','line','area','eqp_id','chamber','sn','sn_key','model','maker','occur','occur_t','rel_time','hold',
  'occur_date','alarm','seq','grp','real','inout','incl','cnt','atype','ctype','atype2','ctype2','proc','subproc','cause','action','phenom',
  'src_month','src_week','src_year','fmonth','fweek','checker','extra','imported_at'];
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
    { id:2, '사원번호':'9100002', '이름(영문)':'Tester Two', '단지':'Q2', '팀':'T2', '입사일':'2024-02-03', '퇴사일':'2025-05-01', '운영단위':'GST TAIWAN SCRUBBER' },
    { id:3, 'ID':'9100003', 'Name((영문)':'Tester Three', 'Work Place':'Q1', 'Date of entry':'2023-03-04' }
  ].map(r => full(ROS_COLS, r));
  const I0 = '2026-09-01T00:00:00+00:00';
  const alarm = [
    { src_row:0, src_sheet:'P', op:'P운영', site:'P1', line:'P1-A', sn:'ZZA-0001', sn_key:'ZZA0001', alarm:'PRESSURE HIGH', occur:'2026-03-02 10:00:00', occur_date:'2026-03-02',
      inout:'내적', cnt:true, src_month:'26년 3월', fmonth:'2026-03', fweek:'2026-W10', imported_at:I0 },
    { src_row:1, src_sheet:'P', op:'P운영', site:'P2', sn:'ZZA-0002', sn_key:'ZZA0002', alarm:'FLAME OFF', occur:'2026-03-05 11:00:00', occur_date:'2026-03-05',
      inout:'외적', cnt:false, src_month:'26년 3월', fmonth:'2026-03', fweek:'2026-W10', imported_at:I0 },
    { src_row:2, src_sheet:'K', op:'K운영', site:'K1', sn:'ZZA-0003', sn_key:'ZZA0003', alarm:'INLET P', occur:'2026-04-01 09:00:00', occur_date:'2026-04-01',
      inout:'내부', cnt:true, fmonth:'2026-04', fweek:'2026-W14', imported_at:I0 }
  ].map(r => full(ALARM_COLS, r));
  const abp = [
    { src_row:0, src_sheet:'H', op:'H운영', sn:'ZZB-0001', sn_key:'ZZB0001', occur:'2026-03-02', occur_date:'2026-03-02', inout:'내적', seq:'1', cnt:true,
      fmonth:'2026-03', fweek:'2026-W10', imported_at:I0 },
    { src_row:1, src_sheet:'OS', op:'GST TAIWAN SCRUBBER', sn:'ZZC-0001L', sn_key:'ZZC0001L', occur:'2026-03-03 08:00', occur_date:'2026-03-03', inout:'GST',
      seq:'1', grp:'7', cnt:true, fmonth:'2026-03', fweek:'2026-W10', imported_at:I0 },
    { src_row:2, src_sheet:'OS', op:'GST TAIWAN SCRUBBER', sn:'ZZC-0001R', sn_key:'ZZC0001R', occur:'2026-03-03 08:00', occur_date:'2026-03-03', inout:'External',
      seq:'2', grp:'7', cnt:false, fmonth:'2026-03', fweek:'2026-W10', imported_at:I0 }
  ].map(r => full(ABP_COLS, r));
  const edits = [
    { id:1, gid:'1213453343', tbl:null, row_key:'5', op:'update', before:['a','b'], after:['a','c'], edited_by:'old@test.local', edited_at:'2026-07-01T00:00:00Z', ref:null },
    { id:2, gid:'646668307', tbl:'sheet_wk', row_key:'*', op:'upload:add', before:{ rows:3 }, after:{ rows:9, file:'t.xlsx', n:6 }, edited_by:'boss@test.local', edited_at:'2026-07-02T00:00:00Z', ref:null },
    { id:3, gid:'646668307', tbl:'sheet_wk', row_key:'1', op:'update', before:Object.assign({}, wk[1], { stage:'BM' }), after:Object.assign({}, wk[1]), edited_by:'boss@test.local', edited_at:'2026-07-03T00:00:00Z', ref:null }
  ];
  return Object.assign({
    me:{ email:'boss@test.local', can_write:true, role:'admin' },
    tables:{ sheet_wk:wk, sheet_mat:mat, sheet_inst:inst, sheet_alarm:alarm, sheet_allbypass:abp, sheet_roster:roster, sheet_edu:[], sheet_leave:[], sheet_edits:edits,
             allowed_users:[{ email:'boss@test.local', can_write:true, role:'admin' }, { email:'ed@test.local', can_write:true, role:'editor' }] },
    cols:{ sheet_wk:WK_COLS, sheet_mat:MAT_COLS, sheet_inst:INST_COLS, sheet_alarm:ALARM_COLS, sheet_allbypass:ABP_COLS, sheet_roster:ROS_COLS,
           sheet_edu:['No','Site','인원','사원번호','Basic 교육완료일','Veteran 교육완료일','Scrubber Lv.2 교육완료일','Scrubber Lv.3 교육완료일','id','구분'],
           sheet_leave:['사원번호','이름','소속','항목','발생일','휴가시작일','휴가시작시간','휴가종료일','휴가종료시간','휴가신청시간','비고','id'] },
    types:{ sheet_wk:{ src_row:'integer' },
            sheet_alarm:{ src_row:'integer', occur_date:'date', cnt:'boolean', extra:'jsonb', imported_at:'timestamp with time zone' },
            sheet_allbypass:{ src_row:'integer', occur_date:'date', cnt:'boolean', extra:'jsonb', imported_at:'timestamp with time zone' },
            sheet_roster:{ id:'bigint' }, sheet_edu:{ '사원번호':'bigint', id:'bigint' }, sheet_leave:{ '사원번호':'bigint', '휴가신청시간':'double precision' } }
  }, over || {});
}

/* LANG 이 없는 상자(컨테이너)에서는 Chromium 이 한글 파일 이름을 «download» 로 바꿔 받는다 — 실제 PC 의 브라우저는 그렇지 않다.
   그 차이로 받은 파일끼리 덮어써 검사가 엉뚱한 파일을 읽은 적이 있다(v141) → 브라우저에만 UTF-8 로캘을 준다. */
const browser = await chromium.launch(Object.assign({ env:Object.assign({}, process.env, { LANG:'C.UTF-8', LC_ALL:'C.UTF-8' }) }, PW));
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
  /* v144 — 셸 상단의 「업로드」는 admin 에게서 빠졌다(「하나로 합치기」). 그 입구가 여기 머리에 있어야 한다 —
     없으면 관리자는 원본 파일(월 실적·원장 워크북·CIP)을 올릴 길을 잃는다. 창 이름은 셸 openUpload 와 같다. */
  const tu = await pg.$eval('#toUpload', a => ({ vis: a.offsetParent !== null, top: !!a.closest('header.top'),
    href: a.getAttribute('href'), target: a.getAttribute('target') }));
  is(tu.vis && tu.top && tu.href === '/upload/' && tu.target === 'gstUpload',
    '머리에 「원본 파일 올리기」 — /upload/ 를 셸과 같은 창(gstUpload)으로 (' + JSON.stringify(tu) + ')');
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
  is(await pg.$eval('#list tr[data-key="0"] td:nth-child(8)', e => e.textContent) === 'TBM', '목록 칸도 새 값으로 (맨 앞은 체크 칸 · 행번호)');
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
  is(head[2] === '사원번호', '목록 열은 «값이 찬» 사원번호 (빈 ID 를 집지 않는다 · 맨 앞은 체크 칸)');
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

/* ═══ [14~19] 엑셀 일괄 수정 (v141) ═══
   파일은 «실제 버튼»으로 받고, 그 파일을 고쳐 «실제 파일 칸»으로 올린다 — 검사가 양식 규칙을 다시 짜지 않는다(t-upload 의 교훈). */
const XL = await import('./node_modules/xlsx/xlsx.mjs');
const TMP = fs.mkdtempSync(path.join((await import('os')).tmpdir(), 'gst-bulk-'));
let dlN = 0, lastName = '';
async function download(pg, selector) {
  const [d] = await Promise.all([pg.waitForEvent('download', { timeout:10000 }), pg.click(selector)]);
  lastName = d.suggestedFilename();
  const fp = path.join(TMP, (++dlN) + '.xlsx'); await d.saveAs(fp); return fp;      // 이름이 겹쳐도 덮어쓰지 않게 차례 번호로
}
const readWb = fp => XL.read(fs.readFileSync(fp), { type:'buffer', cellDates:true, cellNF:true });
const aoaOf = (wb, name) => XL.utils.sheet_to_json(wb.Sheets[name], { header:1, raw:false, defval:'' });
function writeWb(wb, name, aoa, file) {
  wb.Sheets[name] = XL.utils.aoa_to_sheet(aoa);
  if (wb.SheetNames.indexOf(name) < 0) wb.SheetNames.push(name);
  const fp = path.join(TMP, file); fs.writeFileSync(fp, XL.write(wb, { type:'buffer', bookType:'xlsx' })); return fp;
}
async function waitDlg(pg, re) {
  await pg.waitForFunction(r => { const h = document.querySelector('.mask .dlg-h'); return !!h && new RegExp(r).test(h.textContent); }, re.source, { timeout:10000 });
}
const dlgBody = pg => pg.$eval('.mask .dlg-b', e => e.innerText);
const fakeHash = (pg, tbl, k) => pg.evaluate(([tbl, k]) => { const K = tbl === 'sheet_wk' ? 'src_row' : 'id';
  const o = Object.assign({}, window.__DB[tbl].find(x => x[K] === k)); delete o.synced_at; return 'h:' + JSON.stringify(o); }, [tbl, k]);

console.log('[14] 엑셀 일괄 — 체크 · 받기');
const B = await open(seedOf());
{
  const pg = B.pg;
  await pg.click('.tab[data-tab=roster]'); await pg.waitForTimeout(400);
  is(await pg.$eval('#selBar [data-act=xall]', b => b.textContent) === '검색 결과 3건 엑셀로 받기' && await pg.$eval('#selBar [data-act=xblank]', b => b.textContent) === '빈 양식',
     '아무것도 안 고르면 «검색 결과 3건 엑셀로 받기» · 빈 양식은 옆에 작게 (v142 사용자 지적)');
  is(!(await pg.$('#selBar [data-act=xdown]')), '고른 것이 없으면 «선택 받기» 단추는 없다');
  await pg.click('#ckAll'); await pg.waitForTimeout(100);
  is(/선택 3건 엑셀로 받기/.test(await pg.$eval('#selBar', e => e.textContent)), '머리 체크 → 보이는 행 전부(3건)');
  await pg.click('#list tr[data-key="1"] td.ck input'); await pg.waitForTimeout(100);
  is(/선택 2건/.test(await pg.$eval('#selBar', e => e.textContent)) && !(await pg.$eval('#ckAll', e => e.checked)), '한 줄을 풀면 2건 · 머리 체크도 풀린다');
  is(await pg.$eval('#editor', e => /목록에서 행을 고르면/.test(e.textContent)), '체크 칸을 눌러도 행이 열리지 않는다');
  await pg.click('#list tr[data-key="1"] td.ck'); await pg.waitForTimeout(100);       // 칸 여백을 눌러도 체크된다
  is(/선택 3건/.test(await pg.$eval('#selBar', e => e.textContent)) && await pg.$eval('#ckAll', e => e.checked), '칸 여백을 눌러도 체크 · 다 고르면 머리 체크도');
  B.h2 = await fakeHash(pg, 'sheet_roster', 2);
  await qlog(pg);
  const fp = await download(pg, '[data-act=xdown]');
  const gm = rpcs(await qlog(pg), 'edit_get_many')[0];
  is(gm && gm.args.p_tbl === 'sheet_roster' && gm.args.p_keys.slice().sort().join() === '1,2,3', '받기 → edit_get_many(체크한 키) — 목록 칸이 아니라 «지금 행 전체»를 다시 읽는다');
  is(/^일괄수정_인원현황_3건_\d{8}-\d{4}\.xlsx$/.test(lastName), '파일 이름: 일괄수정_표_건수_시각 (' + lastName + ')');
  const wb = readWb(fp);
  is(JSON.stringify(wb.SheetNames) === JSON.stringify(['인원현황','안내','_meta']), '시트: 데이터 · 안내 · _meta (' + wb.SheetNames + ')');
  is(!!(wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[2].Hidden), '_meta 는 숨김 시트');
  const A = aoaOf(wb, '인원현황');
  is(A[0][0] === '행번호' && A[0].indexOf('사원번호') > 0 && A[0].indexOf('팀') > 0, '머리글: 행번호 + 표의 열 이름');
  is(A[0].indexOf('ID') > A[0].indexOf('퇴사일'), '옛 양식 열(ID)은 뒤로');
  is(A.length === 4 && A.slice(1).map(r => r[0]).join() === '3,2,1', '체크한 행 — 목록 순서 그대로 (' + A.slice(1).map(r => r[0]) + ')');
  is(!A[0].some(h => /^(id|synced_at|imported_at|extra)$/.test(h)), '키·관리 열(id·synced_at·extra)은 데이터 칸에 없다');
  const c = wb.Sheets['인원현황'][XL.utils.encode_cell({ r:1, c:A[0].indexOf('사원번호') })];
  is(!!c && c.t === 's' && c.z === '@', '칸은 텍스트(@) — 엑셀이 사번 앞 0·날짜를 바꾸지 않게');
  const M = aoaOf(wb, '_meta');
  is(M[0][0] === 'gst-edit-bulk' && M.some(r => r[0] === '표' && r[1] === 'sheet_roster') && M.some(r => r[0] === '2' && r[1] === B.h2), '_meta: 표 이름 · 받은 시점의 해시');
  is(/안내/.test(wb.SheetNames.join()) && /행번호/.test(aoaOf(wb, '안내').map(r => r.join(' ')).join('\n')), '안내 시트가 «행번호는 고치지 말라»고 적는다');
  is(/목록에서 체크한 행/.test(aoaOf(wb, '안내').map(r => r.join(' ')).join('\n')), '안내 시트가 «무엇을 받았나»(체크한 행)를 적는다');
  await pg.click('[data-act=xclr]'); await pg.waitForTimeout(100);
  is(/검색 결과 3건 엑셀로 받기/.test(await pg.$eval('#selBar', e => e.textContent)), '선택을 풀면 다시 «검색 결과 3건»');
  const A0 = aoaOf(readWb(await download(pg, '#selBar [data-act=xblank]')), '인원현황');
  is(A0.length === 1 && A0[0][0] === '행번호' && /^일괄수정_인원현황_빈양식_/.test(lastName), '빈 양식 — 머리글만 (' + lastName + ')');
  /* 검색 결과 전부 — 작은 표는 걸러 둔 목록이 곧 전부다 */
  await pg.fill('#search [name=campus]', 'Q1'); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  is(/^2건 · 전체 3건 중/.test(await pg.$eval('#listH b', e => e.textContent)) && /검색 결과 2건 엑셀로 받기/.test(await pg.$eval('#selBar', e => e.textContent)),
     '단지 Q1 로 거르면 «검색 결과 2건» (목록 머리: 2건 · 전체 3건 중)');
  await qlog(pg);
  const wbA = readWb(await download(pg, '#selBar [data-act=xall]'));
  const AA = aoaOf(wbA, '인원현황'), gmA = rpcs(await qlog(pg), 'edit_get_many');
  is(AA.length === 3 && AA.slice(1).map(r => r[0]).join() === '3,1' && /^일괄수정_인원현황_2건_/.test(lastName), '검색 결과 2건이 목록 순서 그대로 (' + AA.slice(1).map(r => r[0]) + ')');
  is(gmA.length === 1 && gmA[0].args.p_keys.slice().sort().join() === '1,3', '그 2건을 edit_get_many 로 «지금 행 전체» 다시 읽는다');
  is(/검색 결과 전체 · 조건: 단지: Q1/.test(aoaOf(wbA, '안내').map(r => r.join(' ')).join('\n')), '안내 시트에 검색 조건을 적는다 (단지: Q1)');
  is(/2건을 받았습니다\(검색 결과 전체\)/.test(await snackText(pg)), '알림: 몇 건을 무엇으로 받았나');
  await pg.click('#search [data-act=reset]'); await pg.waitForTimeout(250);
  B.fp = fp;
}

console.log('[15] 엑셀 올리기 — 미리보기 · 반영');
{
  const pg = B.pg;
  const wb = readWb(B.fp), A = aoaOf(wb, '인원현황'), H = A[0], col = n => H.indexOf(n);
  const r1 = A[3], r2 = A[2];                                    // r3 줄은 지운다 — 줄을 지우면 «안 고친다»
  r2[col('팀')] = 'T7';
  const blank = () => H.map(() => '');
  const n1 = blank(); n1[col('사원번호')] = '9100009'; n1[col('이름(영문)')] = 'Tester Nine'; n1[col('입사일')] = '2025.4.1';
  const n2 = blank(); n2[col('사원번호')] = '9100003'; n2[col('팀')] = 'T3';        // 행번호 없이 — 옛 양식 행(ID 9100003) 하나와 맞는다
  const n3 = blank(); n3[0] = '999'; n3[col('팀')] = 'TX';
  const n4 = blank(); n4[col('사원번호')] = '9100010'; n4[col('이름(영문)')] = 'Bad Date'; n4[col('입사일')] = '2025-13-01';
  const H2 = H.concat(['ZZZ메모']);
  const fp = writeWb(wb, '인원현황', [H2, r2, r1, [], n1, n2, n3, n4].map(r => r.length ? r.concat(['']) : r), 'up1.xlsx');
  await qlog(pg);
  await pg.setInputFiles('#xfile', fp);
  await waitDlg(pg, /미리보기/);
  const body = await dlgBody(pg);
  is(/수정 2행 · 3칸/.test(body) && /새 행 1/.test(body) && /변경 없음 1/.test(body) && /건너뜀 2/.test(body),
     '미리보기 — 수정 2행·3칸 · 새 행 1 · 변경 없음 1 · 건너뜀 2  [' + body.split('\n').slice(1, 2).join(' ') + ']');
  is(/ZZZ메모/.test(body), '모르는 열은 «무시했다»고 적는다');
  is(/행번호 999 인 행이 표에 없습니다/.test(body) && /입사일: 날짜는 YYYY-MM-DD/.test(body), '건너뛰는 이유를 줄마다 적는다');
  is(/T2/.test(body) && /T7/.test(body), '바뀌는 칸: 옛값 → 새값');
  is(/채운 칸만/.test(body), '행번호 없이 찾은 줄은 «채운 칸만» 덮는다고 적는다');
  is(rpcs(await qlog(pg), 'edit_bulk').length === 0, '미리보기만으로는 서버에 쓰지 않는다');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(600);
  const L = await qlog(pg), bk = rpcs(L, 'edit_bulk');
  const items = bk[0] ? bk[0].args.p_items : [], ups = items.filter(x => x.op === 'update'), ins = items.filter(x => x.op === 'insert');
  is(bk.length === 1 && bk[0].args.p_tbl === 'sheet_roster' && ups.length === 2 && ins.length === 1, 'edit_bulk 한 번 — 수정 2 · 입력 1');
  const u2 = ups.find(x => x.key === 2), u3 = ups.find(x => x.key === 3);
  is(!!u2 && JSON.stringify(u2.changes) === '{"팀":"T7"}' && u2.hash === B.h2, '행번호 줄: 바뀐 칸만 · 받은 시점의 해시로');
  is(!!u3 && JSON.stringify(Object.keys(u3.changes).sort()) === JSON.stringify(['사원번호','팀']) && !('Name((영문)' in u3.changes),
     '행번호 없는 줄: 옛 양식 ID 와 맞는 «정확히 한 행»의 «채운 칸만» — 빈칸으로 남의 이름을 지우지 않는다 (' + JSON.stringify(u3 && u3.changes) + ')');
  const i1 = ins[0];
  is(!!i1 && i1.row['입사일'] === '2025-04-01' && i1.row['사원번호'] === '9100009' && !('id' in i1.row) && Object.values(i1.row).every(v => v !== null && v !== ''),
     '새 행: 날짜는 눕히고 · 빈칸·키는 안 보낸다');
  is(bk[0] && bk[0].args.p_note.file === 'up1.xlsx' && bk[0].args.p_note.parts === 1, '묶음 메모: 파일 이름 · 묶음 수');
  is(/반영했습니다 — 수정 2행 · 새 행 1/.test(await snackText(pg)), '반영 알림');
  const db = await pg.evaluate(() => window.__DB.sheet_roster.map(r => [r.id, r['팀'], r['사원번호'], r['Name((영문)']]));
  is(db.find(r => r[0] === 2)[1] === 'T7' && db.find(r => r[0] === 3)[1] === 'T3' && db.find(r => r[0] === 3)[3] === 'Tester Three' && db.some(r => r[2] === '9100009'),
     '표가 바뀌었다 · 옛 양식 이름은 그대로');
  is((await listKeys(pg)).length === 4, '목록을 다시 읽어 새 행이 보인다');
}

console.log('[15b] 같은 파일을 다시 · 받은 뒤 바뀐 줄');
{
  const pg = B.pg;
  await pg.setInputFiles('#xfile', path.join(TMP, 'up1.xlsx'));
  await waitDlg(pg, /미리보기/);
  let body = await dlgBody(pg);
  is(/수정 0행/.test(body) && /새 행 0/.test(body) && /변경 없음 4/.test(body) && !/받은 뒤에 이 행이 바뀌었습니다/.test(body),
     '다시 올리면 들어간 줄은 «변경 없음» — 해시가 바뀌었어도 «충돌»로 읽지 않는다');
  is(await pg.$eval('.mask .btn.pri', b => b.disabled && /반영할 것이 없습니다/.test(b.textContent)), '반영할 것이 없으면 단추가 잠긴다');
  await pg.click('.mask .btn:not(.pri)'); await pg.waitForTimeout(150);
  /* 받은 뒤 «상대»가 1번 행을 고쳤다 → 그 줄은 덮지 않는다 */
  await pg.evaluate(() => { window.__DB.sheet_roster.find(r => r.id === 1)['인사'] = '휴직'; });
  const wb = readWb(B.fp), A = aoaOf(wb, '인원현황'), H = A[0];
  A[3][H.indexOf('팀')] = 'T5';
  await pg.setInputFiles('#xfile', writeWb(wb, '인원현황', [H, A[3]], 'up2.xlsx'));
  await waitDlg(pg, /미리보기/);
  body = await dlgBody(pg);
  is(/받은 뒤에 이 행이 바뀌었습니다/.test(body) && /수정 0행/.test(body), '받은 뒤 바뀐 행은 건너뛴다(덮지 않는다)');
  await pg.click('.mask .btn:not(.pri)'); await pg.waitForTimeout(150);
  /* 같은 행을 두 줄이 겨눈다(행번호 2 · 사원번호 9100002) → 어느 쪽이 맞는지 모르니 둘 다 건너뛴다 */
  const n5 = H.map(() => ''); n5[H.indexOf('사원번호')] = '9100002'; n5[H.indexOf('팀')] = 'TZ';
  await pg.setInputFiles('#xfile', writeWb(wb, '인원현황', [H, A[2], n5], 'up2b.xlsx'));
  await waitDlg(pg, /미리보기/);
  body = await dlgBody(pg);
  is(/건너뜀 2/.test(body) && /다른 줄도 고칩니다/.test(body), '같은 행을 두 줄이 고치면 둘 다 건너뛴다');
  await pg.click('.mask .btn:not(.pri)'); await pg.waitForTimeout(150);
  /* 행번호만 남기고 다 비운 줄 — «지우려는» 손짓 → 그 행의 모든 칸을 지우지 않는다 */
  const wiped = A[2].map((v, i) => i ? '' : v);
  await pg.setInputFiles('#xfile', writeWb(wb, '인원현황', [H, wiped], 'up2c.xlsx'));
  await waitDlg(pg, /미리보기/);
  body = await dlgBody(pg);
  is(/행번호만 남고 나머지 칸이 전부 비었습니다/.test(body) && /수정 0행/.test(body), '행번호만 남은 줄은 건너뛴다(행 전체를 지우지 않는다)');
  await pg.click('.mask .btn:not(.pri)'); await pg.waitForTimeout(150);
  /* 다른 표의 파일 — 겹치는 이름(사원번호·No) 몇 개만 맞는다 → 크게 알린다 */
  const ew = XL.utils.book_new();
  await pg.setInputFiles('#xfile', writeWb(ew, '교육', [['No', 'Site', '인원', '사원번호', 'Basic 교육완료일', 'Veteran 교육완료일'], ['1', 'Q1', 'Tester One', '9100001', '2025-01-02', '']], 'edu-like.xlsx'));
  await waitDlg(pg, /미리보기/);
  body = await dlgBody(pg);
  is(/다른 표에서 받은 파일이 아닌지 확인하세요/.test(body), '열 대부분이 이 표에 없으면 «다른 표의 파일»인지 크게 묻는다');
  await pg.click('.mask .btn:not(.pri)'); await pg.waitForTimeout(150);
}

console.log('[16] 반영 순간의 충돌 — 묶음이 통째로 멈춘다');
{
  const pg = B.pg;
  const wb = XL.utils.book_new();
  const fp = writeWb(wb, '아무시트', [['사원번호', '팀'], ['9100001', 'T5']], 'up3.xlsx');      // 행번호·_meta 없는 남의 엑셀
  await pg.setInputFiles('#xfile', fp);
  await waitDlg(pg, /미리보기/);
  const body = await dlgBody(pg);
  is(/행번호」 열이 없어 «사원번호»로 행을 찾았습니다/.test(body) && /수정 1행/.test(body), '행번호 없는 엑셀도 받는다 — 사원번호로 «정확히 한 행»');
  await pg.evaluate(() => { window.__BULK_BEFORE = DB => { DB.sheet_roster.find(r => r.id === 1)['인사'] = '복직'; }; });
  await qlog(pg);
  await pg.click('.mask .btn.pri'); await waitDlg(pg, /멈췄습니다/);
  const b2 = await dlgBody(pg);
  is(/하나도 들어가지 않았습니다/.test(b2) && /다른 곳에서 바뀜/.test(b2), '멈춘 이유와 «하나도 안 들어갔다»를 적는다');
  is(await pg.evaluate(() => window.__DB.sheet_roster.find(r => r.id === 1)['팀']) === 'T1', '아무것도 쓰지 않았다');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(300);
}

console.log('[17] 큰 표 — 업무 키 in(…) · Shift 범위 · 500줄씩 나눠');
{
  const pg = B.pg;
  await pg.click('.tab[data-tab=wk]'); await pg.waitForTimeout(300);
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  await pg.click('#list tr[data-key="6"] td.ck input');
  await pg.click('#list tr[data-key="1"] td.ck input', { modifiers:['Shift'] }); await pg.waitForTimeout(100);
  is(/선택 4건/.test(await pg.$eval('#selBar', e => e.textContent)), 'Shift 로 범위 체크 (6→1 · 4건)');
  const [hRs, hDs] = await pg.evaluate(() => [[].concat(GST.SM.SPEC.wk.fields.rsCode)[0], [].concat(GST.SM.SPEC.wk.fields.dStart)[0]].map(x => String(x).replace(/\s*\n\s*/g, ' ')));
  const rows = [[hRs, hDs], ['RS-T-0002', '2026-06-02']];
  for (let i = 1; i <= 1001; i++) rows.push(['RS-N-' + String(i).padStart(4, '0'), '2026-06-01']);
  const fp = writeWb(XL.utils.book_new(), '수선실적', rows, 'big.xlsx');
  await qlog(pg);
  await pg.setInputFiles('#xfile', fp);
  await waitDlg(pg, /미리보기/);
  const body = await dlgBody(pg);
  is(/수정 1행/.test(body) && /새 행 1,001/.test(body), '실적코드가 «한 행»이면 그 행을 · 없으면 새 행 (수정 1 · 새 행 1,001)');
  is(/500줄씩 3번에 나눠/.test(body), '500줄 넘으면 나눠 넣는다고 적는다');
  const q = sel(await qlog(pg), 'sheet_wk').filter(x => x.f.some(f => f[0] === 'rs_code' && f[1] === 'in'));
  is(q.length === 11 && q.every(x => x.count === true && x.f.find(f => f[1] === 'in')[2].length <= 100), '업무 키는 in(…) 100개씩 · count 로 «다 왔나»를 본다 (' + q.length + '번)');
  await pg.click('.mask .btn.pri');
  await pg.waitForFunction(() => /반영했습니다/.test(document.getElementById('snack').textContent), null, { timeout:15000 });
  const bk = rpcs(await qlog(pg), 'edit_bulk');
  is(bk.length === 3 && bk.map(x => x.args.p_items.length).join() === '500,500,2' && bk.map(x => x.args.p_note.part + '/' + x.args.p_note.parts).join() === '1/3,2/3,3/3',
     '500줄씩 세 번 (' + bk.map(x => x.args.p_items.length).join() + ')');
  is(await pg.evaluate(() => window.__DB.sheet_wk.find(r => r.src_row === 1).d_start) === '2026-06-02', '실적코드로 찾은 행이 고쳐졌다');
}

console.log('[17b] 큰 표 — 검색 결과 «전부» 받기 · 건수 · 더 보기는 검색한 조건으로 · 상한');
{
  const pg = B.pg;
  const head = () => pg.$eval('#listH b', e => e.textContent);
  const bar = () => pg.$eval('#selBar', e => e.textContent);
  const hint = () => pg.$eval('#listH', e => e.textContent);
  await qlog(pg);
  await pg.click('#search [data-act=reset]'); await pg.waitForTimeout(100);
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  const total = await pg.evaluate(() => window.__DB.sheet_wk.length);
  is(await head() === total.toLocaleString() + '건 중 100건 표시' && /검색 결과 [\d,]+건 엑셀로 받기/.test(await bar()) && (await bar()).indexOf(total.toLocaleString()) >= 0,
     '첫 장이 100건을 넘으면 전체 건수를 따로 세어 적는다 — «' + await head() + '» · «' + await bar() + '»');
  const cq = sel(await qlog(pg), 'sheet_wk').filter(x => x.head);
  is(cq.length === 1 && cq[0].count === true && cq[0].limit == null && cq[0].cols === 'src_row', '건수는 따로 한 번(head · count) — 목록 질의에 붙이지 않는다');
  is(!/세는 중/.test(await hint()), '다 세면 «세는 중»이 사라진다');

  /* 기간으로 거른 뒤 칸을 고쳐 놓고 «검색을 안 누른 채» 더 보기·받기 → 둘 다 «검색한 조건»으로 */
  await pg.fill('#search [name=dt_from]', '2026-06-01'); await pg.fill('#search [name=dt_to]', '2026-06-01');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  is(await head() === '1,001건 중 100건 표시', '작업시작일 6/1 → 1,001건 중 100건 표시 (' + await head() + ')');
  await pg.fill('#search [name=stage]', 'BM');                                   // 검색은 안 누른다
  await qlog(pg);
  await pg.click('#moreBtn'); await pg.waitForTimeout(300);
  const mq = sel(await qlog(pg), 'sheet_wk').filter(x => !x.head).pop();
  is(!!mq && mq.f.some(f => f[0] === 'd_start' && f[1] === 'gte') && !mq.f.some(f => f[0] === 'stage') && (await listKeys(pg)).length === 200,
     '더 보기는 «검색한 조건»으로 — 칸만 고친 작업단계 BM 은 안 붙는다 (200줄)');
  await pg.evaluate(() => { window.__MAXROWS = 300; });                          // 서버가 장을 300행에서 자른다(max-rows)
  await qlog(pg);
  const wbK = readWb(await download(pg, '#selBar [data-act=xall]'));
  await pg.evaluate(() => { window.__MAXROWS = 0; });
  const L = await qlog(pg), kq = sel(L, 'sheet_wk').filter(x => x.cols === 'src_row' && !x.head), gm = rpcs(L, 'edit_get_many');
  const AK = aoaOf(wbK, '수선실적');
  const want = await pg.evaluate(() => window.__DB.sheet_wk.filter(r => String(r.d_start).slice(0, 10) === '2026-06-01').map(r => r.src_row).sort((a, b) => b - a).join());
  is(AK.length === 1002 && AK.slice(1).map(r => r[0]).join() === want, '검색 결과 1,001건 «전부» — 보이는 200줄이 아니라 · 목록과 같은 순서(최근 것부터)');
  is(kq.length === 5 && kq.every(x => x.f.some(f => f[0] === 'd_start' && f[1] === 'gte' && f[2] === '2026-06-01') && !x.f.some(f => f[0] === 'stage')),
     '키는 «검색한 조건»으로 · 서버가 300행에서 잘라도 «0행일 때만» 멈춘다 (' + kq.length + '번)');
  is(gm.length === 1 && gm[0].args.p_keys.length === 1001, '지금 값은 edit_get_many 2,000행씩 (1번)');
  is(/검색 결과 전체 · 조건: 작업시작일 2026-06-01 ~ 2026-06-01/.test(aoaOf(wbK, '안내').map(r => r.join(' ')).join('\n')), '안내 시트에 검색 조건(작업시작일)을 적는다');

  /* 상한 — 건수를 알면 받기 전에 말한다 */
  await pg.click('#search [data-act=reset]'); await pg.waitForTimeout(100);
  await pg.fill('#search [name=dt_from]', '2026-06-01'); await pg.fill('#search [name=dt_to]', '2026-06-01');
  await pg.evaluate(() => { window.__COUNT_AS = 25000; });
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  await pg.evaluate(() => { window.__COUNT_AS = null; });
  is(/검색 결과 25,000건 엑셀로 받기/.test(await bar()), '건수 25,000 → 단추에 그대로');
  await qlog(pg);
  await pg.click('#selBar [data-act=xall]'); await waitDlg(pg, /너무 많습니다/);
  is(/25,000건/.test(await dlgBody(pg)) && /20,000건/.test(await dlgBody(pg)) && /체크/.test(await dlgBody(pg)), '2만 건이 넘으면 받지 않고 «좁히라 · 체크해서 받으라»고 말한다');
  let L2 = await qlog(pg);
  is(!sel(L2, 'sheet_wk').length && !rpcs(L2, 'edit_get_many').length, '받기 전에 멈춘다 — 키도 행도 안 읽는다');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(100);

  /* 상한 — 건수를 못 셌으면 키를 모으다 넘는 순간 멈춘다 */
  await pg.evaluate(() => { window.__COUNT_ERR = true; const W = window.__DB.sheet_wk; let k = W.reduce((m, r) => Math.max(m, r.src_row), 0);
    for (let i = 0; i < 20001; i++) W.push({ src_row:++k, rs_code:'RS-C-' + i, d_start:'2027-01-01', op:'OPZ Scrubber' }); });
  await pg.fill('#search [name=dt_from]', '2027-01-01'); await pg.fill('#search [name=dt_to]', '2027-01-01');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(400);
  is(await head() === '100건 · 더 있음' && /검색 결과 전부 엑셀로 받기/.test(await bar()), '건수를 못 세면 «100건 · 더 있음» · «검색 결과 전부»');
  await qlog(pg);
  await pg.click('#selBar [data-act=xall]'); await waitDlg(pg, /너무 많습니다/);
  is(/20,000건 넘게/.test(await dlgBody(pg)), '키를 모으다 2만 건을 넘으면 «2만 건 넘게»라고 말하고 멈춘다');
  L2 = await qlog(pg);
  is(!rpcs(L2, 'edit_get_many').length && sel(L2, 'sheet_wk').filter(x => x.cols === 'src_row').length === 21, '행은 하나도 안 읽는다 · 키는 상한을 넘는 장에서 그만 (21번)');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(100);
  await pg.evaluate(() => { window.__COUNT_ERR = false; window.__DB.sheet_wk = window.__DB.sheet_wk.filter(r => r.d_start !== '2027-01-01'); });
  await pg.click('#search [data-act=reset]'); await pg.waitForTimeout(100);
}

console.log('[18] 변경 이력 — 일괄 머리 줄 · 일괄 되돌리기');
{
  const pg = B.pg;
  await pg.click('.tab[data-tab=hist]'); await pg.waitForTimeout(200);
  await pg.selectOption('#hfilt [name=tbl]', 'sheet_roster'); await pg.selectOption('#hfilt [name=kind]', 'blk');
  await qlog(pg);
  await pg.click('#hfilt button[type=submit]'); await pg.waitForTimeout(300);
  const q = sel(await qlog(pg), 'sheet_edits').pop();
  is(!!q && q.f.some(f => f[0] === 'op' && f[1] === 'in' && f[2].join() === 'bulk'), '종류=일괄 → op in (bulk)');
  const top = await pg.$eval('#hlist .he', e => e.innerText);
  is(/일괄 수정 \(엑셀\)/.test(top) && /up1\.xlsx/.test(top) && /수정 2행 · 새 행 1/.test(top), '머리 줄: 파일 · 수정·새 행 수');
  await pg.click('#hlist [data-hb]'); await waitDlg(pg, /되돌릴까요/);
  is(/3줄/.test(await dlgBody(pg)), '되돌릴 줄 수를 먼저 보여 준다(수정 2 · 새 행 1)');
  await qlog(pg);
  await pg.click('.mask .btn.pri');
  await pg.waitForFunction(() => /되돌렸습니다/.test(document.getElementById('snack').textContent), null, { timeout:10000 });
  const rs = rpcs(await qlog(pg), 'edit_restore').map(x => x.args.p_id);
  is(rs.length === 3 && rs.every((v, i) => !i || v < rs[i - 1]), '줄 이력을 나중 것부터 하나씩 edit_restore (' + rs + ')');
  const db = await pg.evaluate(() => window.__DB.sheet_roster.map(r => [r.id, r['팀'], r['사원번호']]));
  is(db.find(r => r[0] === 2)[1] === 'T2' && db.find(r => r[0] === 3)[1] == null && !db.some(r => r[2] === '9100009'), '되돌렸다 — 팀 T2 · 옛 행 그대로 · 새 행은 지움');
  await pg.click('#hfilt button[type=submit]'); await pg.waitForTimeout(300);
  await pg.click('#hlist [data-hb]'); await pg.waitForTimeout(400);
  is(/이미 다 되돌렸습니다/.test(await snackText(pg)), '한 번 되돌린 묶음은 «이미 다 되돌렸다»');
  is(B.pe.length === 0, '일괄 수정 전 과정 JS 에러 없음' + (B.pe.length ? ' → ' + B.pe.join(' | ') : ''));
}
await B.ctx.close();

console.log('[19] 일괄 함수만 서버에 없을 때 — 그 단추만 잠그고 말한다');
{
  const { ctx:c2, pg, pe:pe2 } = await open(seedOf({ missing:['edit_get_many','edit_bulk'] }));
  const ban = await pg.$eval('#banner', e => e.innerText);
  is(/엑셀 일괄 수정이 아직 잠겨/.test(ban) && /setup-16-edit\.sql/.test(ban), '배너가 «엑셀 일괄 수정»이 잠겼다고 · 무엇을 하면 되는지 적는다');
  is(await pg.$eval('#search [data-act=xup]', b => b.disabled), '「엑셀 올리기」 잠김');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  is(await pg.$eval('#selBar [data-act=xall]', b => b.disabled) && await pg.$eval('#selBar [data-act=xblank]', b => b.disabled), '「검색 결과 받기」·「빈 양식」 잠김');
  is(!(await pg.$eval('#search [data-act=new]', b => b.disabled)), '한 행 편집은 그대로 열려 있다');
  is(pe2.length === 0, 'JS 에러 없음' + (pe2.length ? ' → ' + pe2[0] : ''));
  await c2.close();
}
console.log('[20] 구분 — 국내·해외·미상 (대시보드 정본 판정 · v143)');
{
  const { ctx:c3, pg, pe:pe3 } = await open(seedOf());
  /* 큰 표 — 운영단위 «값»을 정본(GST.ORG.region)으로 갈라 in(…) 으로 건다. 괄호가 든 값도 그대로 맞물려야 한다. */
  await pg.evaluate(() => { const W = window.__DB.sheet_wk;
    W.push(Object.assign({}, W[0], { src_row:20, rs_code:'RS-R-KR', op:'SEC Scrubber' }),
           Object.assign({}, W[0], { src_row:21, rs_code:'RS-R-OS', op:'GST CHINA(WUHAN) SCRUBBER' }),
           Object.assign({}, W[0], { src_row:22, rs_code:'RS-R-NULL', op:null })); });
  is(await pg.$eval('#search .sf select[name=region]', e => !!e && e.closest('.sgrid').firstElementChild === e.closest('.sf')), '구분 칸이 검색 칸 맨 앞에 있다(대시보드 필터와 같은 순서)');
  await qlog(pg);
  await pg.selectOption('#search [name=region]', 'kr'); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  let L = await qlog(pg);
  is(!!rpcs(L, 'edit_distinct').find(x => x.args.p_tbl === 'sheet_wk' && x.args.p_col === 'op'), '구분 → 운영단위 «값 목록»을 받아 판정한다 (edit_distinct)');
  const kr = await listKeys(pg);
  let q = sel(L, 'sheet_wk').filter(x => !x.head).pop();
  is(kr.join() === '20' && q && q.or.some(o => /op\.in\.\("SEC Scrubber"\)/.test(o)), '국내 = SEC Scrubber 행만 · 조건은 or(op.in.("…")) (' + kr + ' · ' + (q && q.or) + ')');
  await pg.selectOption('#search [name=region]', 'os'); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  is((await listKeys(pg)).join() === '21', '해외 = 괄호가 든 운영단위도 맞물린다 (GST CHINA(WUHAN) SCRUBBER)');
  await pg.selectOption('#search [name=region]', 'unk'); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  const unk = await listKeys(pg), all = await pg.evaluate(() => window.__DB.sheet_wk.length);
  is(unk.indexOf('22') >= 0 && unk.length + 2 === all, '미상 = 판정 불가 값 + 빈 운영단위 — 국내+해외+미상 = 전체 (' + unk.length + '+2=' + all + ')');
  await pg.selectOption('#search [name=region]', 'os'); await pg.fill('#search [name=sn]', 'ZZT-0001');
  await qlog(pg); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  q = sel(await qlog(pg), 'sheet_wk').filter(x => !x.head).pop();
  is((await listKeys(pg)).join() === '21' && q && q.or.length === 1 && /^and\(or\(op\.in/.test(q.or[0]), '구분 + S/N(여러 열) → and(or(…),or(…)) 한 파라미터로 (' + (q && q.or[0]) + ')');
  is(/구분: 해외/.test(await pg.evaluate(() => condText(TAB(), S.qf.f))), '받은 양식의 조건 글에 «구분: 해외»');
  /* 작은 표 — 인원은 주간현황과 같은 순서(구분 → 운영단위 → … → 다수결) */
  await pg.click('.tab[data-tab=roster]'); await pg.waitForTimeout(400);
  const pick = async v => { await pg.selectOption('#search [name=region]', v); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250); return (await listKeys(pg)).join(); };
  is(await pick('os') === '2' && await pick('kr') === '3,1' && await pick('unk') === '', '인원 — 해외(운영단위 GST TAIWAN) 1 · 국내 2(다수결) · 미상 0');
  /* 교육·휴가 — «그 사람»의 구분(사번, 없으면 이름 → 인원현황) */
  await pg.evaluate(() => { window.__DB.sheet_edu.push(
    { id:1, '사원번호':9100002, '인원':'Tester Two', 'Site':'Q2' }, { id:2, '사원번호':9100001, '인원':'Tester One', 'Site':'Q1' },
    { id:3, '사원번호':null, '인원':'Tester Two', 'Site':'Q2' }, { id:4, '사원번호':9999999, '인원':'Nobody', 'Site':'Q9' }); });
  await pg.click('.tab[data-tab=edu]'); await pg.waitForTimeout(400);
  is(await pick('os') === '3,1' && await pick('unk') === '4' && await pick('kr') === '2', '교육 — 사번(없으면 이름)으로 인원현황의 구분을 빌린다 · 모르는 사람은 미상');
  is(pe3.length === 0, 'JS 에러 없음' + (pe3.length ? ' → ' + pe3[0] : ''));

  console.log('[21] 원장(알람·올바) — 계산 칸 잠금 · 저장 때 다시 계산 · 운영단위는 새 행에서만 · Group 줄 잠금');
  await pg.click('.tab[data-tab=alarm]'); await pg.waitForTimeout(400);
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  is((await listKeys(pg)).join() === '2,1,0' && /집계/.test(await pg.$eval('#list', e => e.innerText)) && /제외/.test(await pg.$eval('#list', e => e.innerText)),
     '알람 탭 — 원장 행 · 집계 대상은 «집계·제외»로');
  is(await pick('kr') === '2,1,0' && await pick('os') === '', '알람의 구분 — K·P·H운영은 국내 워크북(GST.ALARM.region)');
  await pg.selectOption('#search [name=region]', ''); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  /* S/N 칸을 «바로» 누른다 — core 의 설비 메뉴(S/N 머리글 칸을 캡처 단계에서 먹는다)가 행 열기를 가로채면 안 된다.
     v140~v142 의 수선·자재·설치 목록도 S/N 칸만 눌리지 않았다(가운데가 다른 칸이라 검사가 못 봤다). */
  const snIdx = await pg.$$eval('#list thead th', ths => ths.findIndex(th => /S\/N/.test(th.textContent)));
  await pg.click('#list tr[data-key="1"] td:nth-child(' + (snIdx + 1) + ')'); await pg.waitForTimeout(300);
  is(snIdx > 1 && !(await pg.$('#gstSnMenu')) && await pg.evaluate(() => S.cur && S.cur.key === 1), 'S/N 칸을 눌러도 그 행이 열린다 — 설비 메뉴가 가로채지 않는다');
  const ro = await pg.$$eval('#editor .fld.ro [data-col]', xs => xs.map(x => x.dataset.col).sort().join());
  is(ro === 'cnt,fmonth,fweek,occur_date,op,sn_key,src_sheet', '계산 칸 여섯 + 운영단위가 잠긴다 (' + ro + ')');
  is(await pg.$eval('#editor [data-col=sn_key]', e => e.readOnly), '잠긴 칸은 readonly — 사람이 못 고친다');
  await setField(pg, 'sn', 'ZZA-0099'); await setField(pg, 'occur', '2026-03-25 07:30'); await setField(pg, 'inout', '내적');
  await qlog(pg);
  await pg.click('#editor [data-act=save]'); await pg.waitForTimeout(300);
  const ch = (rpcs(await qlog(pg), 'edit_update').pop() || { args:{} }).args.p_changes || {};
  const wk13 = await pg.evaluate(() => GST.ALARM.isoWeek('2026-03-25'));
  is(ch.sn === 'ZZA-0099' && ch.sn_key === 'ZZA0099', 'S/N 을 고치면 조인 키도 같이 (ZZA0099)');
  is(ch.occur === '2026-03-25 07:30:00' && ch.occur_date === '2026-03-25' && ch.fweek === wk13, '발생시각 → 발생일 · 주차(시트 주차가 없으면 달력) (' + ch.fweek + ')');
  is(!('fmonth' in ch), '정산월은 시트 원문(26년 3월)이 우선 — 발생일이 바뀌어도 그대로');
  is(ch.inout === '내적' && ch.cnt === true, '내/외를 고치면 집계 대상도 (외적 → 내적 = 집계)');
  is(/\+ 계산 칸 4개/.test(await snackText(pg)), '알림이 «계산 칸도 다시 계산했다»고 말한다 (' + await snackText(pg) + ')');
  /* 새 행 — 운영단위는 표에 있는 값만 · 계산 칸과 시트 표지를 채운다 */
  await pg.click('#search [data-act=new]'); await pg.waitForTimeout(200);
  is(!(await pg.$eval('#editor [data-col=op]', e => e.readOnly)), '새 행에서는 운영단위를 고를 수 있다');
  await setField(pg, 'op', 'P 운영'); await setField(pg, 'sn', 'ZZA-0100'); await setField(pg, 'occur', '2026-05-04 10:00');
  await qlog(pg);
  await pg.click('#editor [data-act=insert]'); await pg.waitForTimeout(300);
  is(!rpcs(await qlog(pg), 'edit_insert').length && /표에 이미 있는 값/.test(await pg.$eval('#editor [data-col=op]', e => e.closest('.fld').querySelector('.err').textContent)),
     '표에 없는 운영단위(오타)는 막는다 — 다음 업로드의 구간 교체가 못 찾아 두 번 센다');
  await setField(pg, 'op', 'P운영');
  await pg.click('#editor [data-act=insert]'); await pg.waitForTimeout(300);
  const ins = (rpcs(await qlog(pg), 'edit_insert').pop() || { args:{} }).args.p_row || {};
  is(ins.op === 'P운영' && ins.src_sheet === 'P' && ins.sn_key === 'ZZA0100' && ins.occur_date === '2026-05-04' && ins.fmonth === '2026-05' && ins.cnt === true,
     '새 행 — 시트 표지(P) · 조인 키 · 발생일 · 정산월 · 집계 대상을 채운다 (' + JSON.stringify(ins) + ')');
  /* 올바 — 해외 Group 줄은 Seq·Group·담당을 잠근다 · 국내 H 의 Seq 는 시트 원문이라 고칠 수 있다 */
  await pg.click('.tab[data-tab=abp]'); await pg.waitForTimeout(400);
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  is(await pick('os') === '2,1' && await pick('kr') === '0', '올바의 구분 — 해외 리스트(GST TAIWAN) 2 · 국내(H운영) 1');
  await pg.selectOption('#search [name=region]', ''); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  await pg.click('#list tr[data-key="1"]'); await pg.waitForTimeout(300);
  const roG = await pg.$$eval('#editor .fld.ro [data-col]', xs => xs.map(x => x.dataset.col));
  is(['seq','grp','inout','incl'].every(c => roG.indexOf(c) >= 0) && roG.indexOf('cause') < 0, 'Group 줄 — Seq·Group·담당이 잠긴다 · 원인은 고칠 수 있다');
  await pg.click('#list tr[data-key="0"]'); await pg.waitForTimeout(300);
  const roH = await pg.$$eval('#editor .fld.ro [data-col]', xs => xs.map(x => x.dataset.col));
  is(roH.indexOf('seq') < 0 && roH.indexOf('inout') < 0, '국내 H 줄 — Seq·내/외는 시트 원문이라 열려 있다');
  await pg.click('#search [data-act=new]'); await pg.waitForTimeout(200);
  await setField(pg, 'op', 'GST TAIWAN SCRUBBER'); await setField(pg, 'sn', 'ZZC-0009L'); await setField(pg, 'occur', '2026-05-04'); await setField(pg, 'grp', '9');
  await qlog(pg);
  await pg.click('#editor [data-act=insert]'); await pg.waitForTimeout(300);
  is(!rpcs(await qlog(pg), 'edit_insert').length && /원본 리스트로/.test(await pg.$eval('#editor [data-col=grp]', e => e.closest('.fld').querySelector('.err').textContent)),
     '새 Group 줄은 막는다 — 한 줄만으로는 그 사건의 대표 줄을 못 정한다');
  await setField(pg, 'grp', '');
  await pg.click('#editor [data-act=insert]'); await pg.waitForTimeout(300);
  const ins2 = (rpcs(await qlog(pg), 'edit_insert').pop() || { args:{} }).args.p_row || {};
  is(ins2.src_sheet === 'OS' && ins2.op === 'GST TAIWAN SCRUBBER' && ins2.occur_date === '2026-05-04', '해외 새 행 — 시트 표지 OS (해외 리스트)');
  /* 엑셀 일괄 — 계산 칸은 양식에 없다 · 운영단위를 고친 줄은 건너뛴다 · 고친 줄·새 줄은 계산 칸을 함께 */
  await pg.click('.tab[data-tab=alarm]'); await pg.waitForTimeout(400);
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  const wbA = readWb(await download(pg, '#selBar [data-act=xall]'));
  const A = aoaOf(wbA, '알람'), H = A[0];
  is(H.indexOf('운영단위 (시트)') > 0 && H.indexOf('S/N 조인 키') < 0 && H.indexOf('발생일') < 0 && H.indexOf('집계 대상') < 0,
     '양식 — 계산 칸은 빠지고 운영단위는 있다 (' + H.slice(0, 6).join(' | ') + ' …)');
  is(/계산 칸/.test(aoaOf(wbA, '안내').map(r => r.join(' ')).join('\n')), '안내 시트가 «계산 칸은 다시 계산한다»고 적는다');
  const at = n => H.indexOf(n), keyRow = k => A.find(r => r[0] === String(k));
  const r0 = keyRow(0).slice(), r2 = keyRow(2).slice();
  r0[at('운영단위 (시트)')] = 'K운영';                       // 운영단위를 고친 줄 → 건너뛴다
  r2[at('SEQP S/N')] = 'ZZA-0333';                           // S/N 을 고친 줄 → 조인 키도
  const nw = H.map(() => ''); nw[at('운영단위 (시트)')] = 'K운영'; nw[at('SEQP S/N')] = 'ZZA-0444'; nw[at('Occur Time')] = '2026-06-01 06:00';
  await qlog(pg);
  await pg.setInputFiles('#xfile', writeWb(wbA, '알람', [H, r0, r2, nw], 'alarm-up.xlsx'));
  await waitDlg(pg, /미리보기/);
  const body = await dlgBody(pg);
  is(/수정 1행/.test(body) && /새 행 1/.test(body) && /건너뜀 1/.test(body) && /운영단위\(op\)는 새 행에서만/.test(body), '미리보기 — 수정 1 · 새 행 1 · 운영단위를 고친 줄은 건너뜀 (이유와 함께)');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(600);
  const bk = rpcs(await qlog(pg), 'edit_bulk').pop();
  const it = bk ? bk.args.p_items : [], u = it.find(x => x.op === 'update'), nn = it.find(x => x.op === 'insert');
  is(!!u && u.key === 2 && u.changes.sn === 'ZZA-0333' && u.changes.sn_key === 'ZZA0333' && Object.keys(u.changes).length === 2, '고친 줄 — S/N + 조인 키만 (' + JSON.stringify(u && u.changes) + ')');
  is(!!nn && nn.row.src_sheet === 'K' && nn.row.sn_key === 'ZZA0444' && nn.row.occur_date === '2026-06-01' && nn.row.cnt === true, '새 줄 — 시트 표지 K · 계산 칸을 채운다');
  is(pe3.length === 0, '원장 편집 전 과정 JS 에러 없음' + (pe3.length ? ' → ' + pe3.join(' | ') : ''));

  console.log('[22] 업로드 — 데이터 관리에서 고친 행이 덮이면 미리 말한다 (edit_overwrites)');
  const XLSX = await import('./node_modules/xlsx/xlsx.mjs');
  const up = await c3.newPage(); const upe = [];
  up.on('pageerror', e => upe.push(e.message)); up.on('dialog', d => d.accept());
  await up.goto(BASE + '/upload/', { waitUntil:'domcontentloaded' }); await up.waitForTimeout(500);
  const canon = await up.evaluate(() => { const S0 = GST.SM.SPEC.wk; return Object.keys(S0.fields).map(k => [k, [].concat(S0.fields[k])[0]]); });
  const urow = o => canon.map(([k]) => o[k] == null ? '' : o[k]);
  const mk = name => { const w = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([canon.map(x => x[1]),
      urow({ rsCode:'RS-T-0201', dStart:'2026-04-01', op:'OPX Scrubber', stage:'BM' }), urow({ rsCode:'RS-T-0202', dStart:'2026-04-03', op:'OPY Scrubber', stage:'BM' })]), '수선실적');
    const f = path.join(TMP, name); fs.writeFileSync(f, XLSX.write(w, { type:'buffer', bookType:'xlsx' })); return f; };
  const chkOf = async (mode, file, ovw) => {
    await up.evaluate(v => { window.__OVW = v; window.__QLOG.splice(0); }, ovw);
    await up.selectOption('#tsel', await up.evaluate(() => String(TABLES.findIndex(t => t.rid === 'wk'))));
    await up.selectOption('#modeSel', mode); await up.evaluate(() => window.onMode());
    await up.setInputFiles('#fsel', mk(file));
    await up.waitForFunction(() => /행 ↔ 표의 현재/.test(document.getElementById('chk').innerText), null, { timeout:15000 }).catch(() => {});
    return { txt: await up.$eval('#chk', e => e.innerText), L: await up.evaluate(() => window.__QLOG.splice(0)) };
  };
  const OV = { n:3, last:'2026-10-04T01:02:03Z', keys:[1, 2, 5], who:['boss@test.local'] };
  let R = await chkOf('win', 'ov-win.xlsx', OV);
  let ov = rpcs(R.L, 'edit_overwrites')[0];
  is(/데이터 관리」에서 고치거나 넣은 3행이 이 업로드로 덮입니다/.test(R.txt) && /행 번호 1, 2, 5/.test(R.txt) && /boss@test\.local/.test(R.txt),
     '구간 교체 — «고친 3행이 덮인다» · 누가 · 행 번호');
  is(!!ov && ov.args.p_tbl === 'sheet_wk' && ov.args.p_from === '2026-04-01' && ov.args.p_to === '2026-04-03' && ov.args.p_ops.slice().sort().join() === 'OPX Scrubber,OPY Scrubber',
     '구간은 파일의 날짜 범위 × 운영단위 — 구간 교체가 지울 바로 그 범위 (' + JSON.stringify(ov && ov.args) + ')');
  R = await chkOf('full', 'ov-full.xlsx', OV);
  ov = rpcs(R.L, 'edit_overwrites')[0];
  is(!!ov && ov.args.p_from === undefined && /3행이 이 업로드로 덮입니다/.test(R.txt), '통째 교체 — 표 전체에서 센다(구간 없이)');
  R = await chkOf('add', 'ov-add.xlsx', OV);
  is(!rpcs(R.L, 'edit_overwrites').length && !/덮입니다/.test(R.txt), '이어붙이기 — 아무것도 안 지우므로 묻지도 않는다');
  R = await chkOf('win', 'ov-zero.xlsx', { n:0, last:null, keys:[], who:[] });
  is(!/덮입니다/.test(R.txt), '고친 행이 없으면 아무 말도 안 한다');
  is(upe.length === 0, '업로드 화면 JS 에러 없음' + (upe.length ? ' → ' + upe[0] : ''));
  await up.close();
  await c3.close();
}
console.log('[21b] 서버의 표 사전에 원장이 없을 때(옛 setup-16) — 그 탭만 «무엇을 하면 되는지» 말한다');
{
  const { ctx:c4, pg, pe:pe4 } = await open(seedOf({ badTbl:['sheet_alarm','sheet_allbypass'] }));
  await pg.click('.tab[data-tab=alarm]'); await pg.waitForTimeout(400);
  const ban = await pg.$eval('#banner', e => e.innerText);
  is(/알람 탭/.test(ban) && /setup-16-edit\.sql/.test(ban) && !/bad_table/.test(ban), '배너가 그 탭과 «setup-16 을 Run» 을 적는다 — 원문(bad_table)이 아니라 (' + ban.replace(/\s+/g, ' ').slice(0, 90) + ')');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  await pg.click('#list tr[data-key="1"] td:nth-child(3)'); await pg.waitForTimeout(300);
  is(/setup-16-edit\.sql/.test(await pg.$eval('#editor', e => e.innerText)), '행을 열어도 같은 말 — 막다른 길이 아니다');
  await pg.click('.tab[data-tab=wk]'); await pg.waitForTimeout(300); await pg.click('.tab[data-tab=alarm]'); await pg.waitForTimeout(400);
  is((await pg.$$('#banner .banner')).length === 1, '같은 탭을 다시 열어도 배너는 한 번만');
  is(pe4.length === 0, 'JS 에러 없음' + (pe4.length ? ' → ' + pe4[0] : ''));
  await c4.close();
}

await browser.close();
srv.close();
console.log(fail ? `\n❌ t-edit: ${pass} 통과 · ${fail} 실패` : `\n✅ t-edit: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
