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
     ⑧ 설비 칸 채우기(v145) — 설치현황(채널 접미 L/R/S 를 떼고도) + 같은 S/N 의 직전 수선실적 · «빈 칸만» 기본 ·
        고치는 행 자신은 «직전 수선실적»으로 쓰지 않는다 · 여러 대가 맞으면 고르게 한다.
     ⑨ 변경 이력 — 표·종류 필터가 질의에 실린다 · 옛 형식·업로드 요약은 되돌리기 단추가 없다.
     ⑩ 작은 표(인원)는 키셋으로 통째로 받는다 — «0행일 때만 멈춘다».
     ⑪ (v145) 「+ 새 행」은 설비(자재는 그 수선실적)부터 고른다 — 고르면 설비 칸이 국내·해외 출처 규칙대로 «자동»으로 채워진다 ·
        「빈 양식」은 검색 칸의 「엑셀 올리기」 바로 왼쪽 · 빈 양식에는 설비 칸이 없다 · 엑셀 새 행은 올릴 때 같은 규칙으로 채운다.

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
  /* 서버는 하나다 — 데이터 관리 안에 뜬 업로드 화면(iframe · v151)도 «같은» 표를 본다(같은 출처라 부모의 것을 빌린다) */
  let par = null; try { if (window.parent !== window && window.parent.__DB) par = window.parent.__DB; } catch (e) {}
  const DB = par || JSON.parse(JSON.stringify(seed.tables));
  const LOG = window.__QLOG = [];
  const KEY = { sheet_wk:'src_row', sheet_mat:'src_row', sheet_inst:'src_row', sheet_alarm:'src_row', sheet_allbypass:'src_row',
               sheet_roster:'id', sheet_edu:'id', sheet_leave:'id', sheet_cip_f11:'id', sheet_cip_f16:'id', sheet_edits:'id' };
  Object.keys(KEY).forEach(k => { if (k !== 'sheet_edits') KEY['kr_' + k] = KEY[k]; });   // 국내 데모 표(v146) — 열쇠는 운영 표와 같다
  const hash = r => { const o = Object.assign({}, r); delete o.synced_at; return 'h:' + JSON.stringify(o); };
  const toRe = (p, ci) => new RegExp('^' + String(p).replace(/\\([%_\\])/g, '\u0001$1').replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/[*%]/g, '.*').replace(/_/g, '.').replace(/\u0001(.)/g, (m, c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) + '$', ci ? 'i' : '');
  const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a - b : String(a).localeCompare(String(b));
  const test = (row, col, op, v) => {
    const x = row[col];
    if (op === 'is') return v === null || v === 'null' ? x == null : x === v;
    if (x == null) return false;
    if (op === 'eq') return String(x) === String(v);
    if (op === 'neq') return String(x) !== String(v);
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
    let a = t.indexOf('.'), b = t.indexOf('.', a + 1), neg = false;
    if (t.slice(a + 1, b) === 'not') { neg = true; a = b; b = t.indexOf('.', a + 1); }   // c.not.is.null · c.not.like.v
    const op = t.slice(a + 1, b); let v = t.slice(b + 1);
    if (op !== 'in' && /^".*"$/.test(v)) v = v.slice(1, -1).replace(/\\(.)/g, '$1');      // 큰따옴표 값(PostgREST 와 같이 벗긴다)
    const r = test(row, t.slice(0, t.indexOf('.')), op, op === 'in' ? inList(v) : v);
    return neg ? !r : r;
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
      upsert(o) { st.ups = JSON.parse(JSON.stringify(o)); return q; },
      delete() { st.del = true; return q; },
      then(res, rej) {
        LOG.push(JSON.parse(JSON.stringify(st)));
        /* 열 맵핑(colmap_site · v151)·기준 정보(value_map · v152) 저장 — 표마다 PK 로 갈아끼운다 */
        if (st.ups) { const o = st.ups, T = (DB[tbl] = DB[tbl] || []);
          const PK = tbl === 'value_map' ? ['tbl','col','raw','when_col','when_val'] : tbl === 'site_registry' ? ['fab'] : ['site','tbl','field'];   // 표마다 실제 PK
          for (let i = T.length - 1; i >= 0; i--) if (PK.every(k => String(T[i][k] == null ? '' : T[i][k]) === String(o[k] == null ? '' : o[k]))) T.splice(i, 1);
          T.push(o); return Promise.resolve({ data:[o], error:null }).then(res, rej); }
        if (st.del) { const T = DB[tbl] || [], d = T.filter(r => st.f.every(([c, op, v]) => test(r, c, op, v)));
          DB[tbl] = T.filter(r => d.indexOf(r) < 0); return Promise.resolve({ data:d, error:null }).then(res, rej); }
        if (st.ins) { (DB[tbl] = DB[tbl] || []).push(...st.ins); return Promise.resolve({ data:null, error:null }).then(res, rej); }
        let rows = (DB[tbl] || []).filter(r => st.f.every(([c, op, v]) => test(r, c, op, v)) && st.or.every(e => splitTop(e).some(x => evalTerm(r, x))));
        if (st.order) rows = rows.slice().sort((a, b) => (st.asc ? 1 : -1) * cmp(a[st.order], b[st.order]));
        const total = rows.length;
        if (st.limit != null) rows = rows.slice(0, st.limit);
        if (window.__MAXROWS && !st.head && rows.length > window.__MAXROWS) rows = rows.slice(0, window.__MAXROWS);   // 서버 행수 상한(max-rows) — 요청보다 짧은 장이 온다
        if (st.head && window.__COUNT_ERR) return Promise.resolve({ data:null, count:null, error:{ message:'canceling statement due to statement timeout' } }).then(res, rej);
        if (st.head && window.__COUNT_AS != null) return Promise.resolve({ data:null, count:window.__COUNT_AS, error:null }).then(res, rej);
        if (st.cols && st.cols !== '*') { const cs = st.cols.split(',').map(c => c.replace(/^"|"$/g, '')); /* PostgREST 는 큰따옴표 열 이름을 벗겨 돌려준다 */ rows = rows.map(r => Object.fromEntries(cs.map(c => [c, r[c] === undefined ? null : r[c]]))); }
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
    /* 사이트 등록부 (setup-23 · v160) — 모양만 흉내(권한·이름 규칙은 t-editsql [15]) */
    cip_site_create: a => {
      const f = String(a.p_fab || '').trim().toUpperCase(); if (!/^[A-Z0-9][A-Z0-9-]{0,15}$/.test(f)) throw new Error('bad_fab');
      const R = (DB.site_registry = DB.site_registry || []), cur = R.find(x => x.fab === f);
      if (cur && cur.cip_table) return { table:cur.cip_table, created:false };
      const t = 'sheet_cip_' + f.toLowerCase().replace(/-/g, '_');
      DB[t] = []; KEY[t] = 'id';
      seed.cols[t] = ['id','NO','Country','Customer','FAB','Floor','area','Type','Model','Model Type','PJT.','Scrubber S/N','Scrubber Code','Group','Detail','FAB In','Remark'];
      seed.types[t] = { id:'bigint' };
      if (cur) cur.cip_table = t; else R.push({ fab:f, label:f, cip_table:t, region:'' });
      logEdit(t, f, 'cip_create', null, { fab:f, table:t });
      return { table:t, created:true };
    },
    import_add_cols: a => { const added = (a.p_cols || []).filter(c => (seed.cols[a.p_tbl] || []).indexOf(c) < 0);
      seed.cols[a.p_tbl] = (seed.cols[a.p_tbl] || []).concat(added); return { added, skipped:[] }; },
    /* edit_dq · edit_dq_rows (setup-21 · v155) — 판정은 SQL 소관(운영 실측으로 확인). 여기는 «화면이 받은 대로 보여 주고 그 행을 띄우는가»만 */
    edit_dq: a => { if (!window.__DQ) throw new Error('Could not find the function public.edit_dq'); window.__DQN = (window.__DQN || 0) + 1; return Object.assign({ from:'2025-09-01' }, window.__DQ); },
    edit_dq_rows: a => (window.__DQROWS || {})[a.p_check + (a.p_op ? '|' + a.p_op + '|' + a.p_wk : '')] || [],
    /* v156 — 운영단위 여럿·기간. mfill 은 표에서 «정말» 고른다(자동 채우기가 그 행을 고치는지 보려고). 나머지는 지어 둔 답. */
    edit_dq_rows2: a => {
      if (window.__DQ_OLD) throw new Error('Could not find the function public.edit_dq_rows2');
      if (a.p_check === 'mfill') return window.__DB.sheet_wk.filter(r => (r.man_min == null || r.man_min === '') && +r.work_min > 0 && +r.worker_cnt > 0
        && (!a.p_ops || a.p_ops.indexOf(r.op || '') >= 0)).map(r => r.src_row);
      return (window.__DQROWS || {})[a.p_check + (a.p_wk ? '|' + (a.p_ops || []).join(',') + '|' + a.p_wk : '')] || [];
    },
    edit_dq_join: a => { if (!window.__DQJ) throw new Error('Could not find the function public.edit_dq_join'); window.__DQJN = (window.__DQJN || 0) + 1; return Object.assign({ tbl:a.p_tbl }, window.__DQJ); },
    edit_dq_join_rows: a => (window.__DQJR || {})[a.p_kind + '|' + (a.p_ops || []).join(',') + (a.p_sn ? '|' + a.p_sn : '')] || [],
    /* edit_last_wk — 맞춘 S/N(영숫자·대문자)마다 최근 두 행(작업시작일 앞 19자 ↓ · 행번호 ↓) · extra·synced_at 뺀다 (setup-16 7절과 같은 모양) */
    edit_last_wk: a => {
      const N = v => String(v == null ? '' : v).replace(/[^0-9A-Za-z]/g, '').toUpperCase(), out = {};
      if ((a.p_sns || []).length > 2000) throw new Error('too_many: ' + a.p_sns.length);
      const T = a.p_tbl || 'sheet_wk';                                       // v146 — 어느 수선실적 표에서(국내 데모면 kr_sheet_wk)
      if (['sheet_wk', 'kr_sheet_wk'].indexOf(T) < 0) throw new Error('bad_table: ' + T);
      new Set((a.p_sns || []).map(N)).forEach(k => {
        if (!k) return;
        const rows = (DB[T] || []).filter(r => N(r.sn_in) === k)
          .sort((x, y) => String(y.d_start || '').slice(0, 19).localeCompare(String(x.d_start || '').slice(0, 19)) || y.src_row - x.src_row)
          .slice(0, 2).map(r => { const o = Object.assign({}, r); delete o.extra; delete o.synced_at; return o; });
        if (rows.length) out[k] = rows;
      });
      return out;
    },
    value_groups: a => { const m = new Map(); (DB[a.p_tbl] || []).forEach(r => { const k = JSON.stringify(a.p_cols.map(c => r[c] == null ? null : r[c]));
      m.set(k, (m.get(k) || 0) + 1); }); return Array.from(m).map(([k, n]) => { const v = JSON.parse(k), o = { n }; a.p_cols.forEach((c, i) => { o[c] = v[i]; }); return o; }); },
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
      /* 국내 운영자(kr)는 운영 표에 bad_table — setup-17 의 _edit_key 와 같다. 화면이 표 이름을 하나라도 운영 표로 적으면 여기서 막혀 붉게 뜬다 */
      if (seed.me.role === 'kr' && args && args.p_tbl && !/^kr_/.test(args.p_tbl)) return { data:null, error:{ message:'bad_table: ' + args.p_tbl } };
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
async function open(seed, at) {
  const ctx = await browser.newContext({ viewport:{ width:1500, height:1000 }, locale:'ko-KR' });
  await ctx.route('**gstcsglobal-cloud.github.io/assets/core.js*', r => r.fulfill({ status:200, contentType:'application/javascript',
    body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB }));
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
  await ctx.addInitScript(`window.__ME=${JSON.stringify(seed.me.email)};(${fake.toString()})(${JSON.stringify(seed)});`);
  const pg = await ctx.newPage(); const pe = [];
  pg.on('pageerror', e => pe.push(e.message));
  await pg.goto(BASE + (at || '/edit/'), { waitUntil:'domcontentloaded' });
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

/* 엑셀·대화상자 도우미 — [7]·[9] 의 설비 고르기 창과 [14~] 의 일괄 수정이 같이 쓴다 */
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
/* v151 — 이 화면에서 받은 양식(_meta)이 아니면 «열 맵핑 확인»이 먼저 뜬다. 넣는 방식을 고르고(기본 한 행씩) 확인 칸을 체크해 넘긴다. */
async function passMap(pg, method) {
  await pg.waitForFunction(() => !!document.querySelector('.mask .dlg-h'), null, { timeout:10000 }).catch(() => {});
  if (!await pg.evaluate(() => /열 맵핑 확인/.test((document.querySelector('.mask .dlg-h') || {}).textContent || ''))) return false;
  await pg.waitForFunction(() => !!document.querySelector('#cmSheet'), null, { timeout:10000 });
  const r = await pg.$('input[name=cmMethod][value="' + (method || 'rows') + '"]'); if (r) await r.check();
  if (await pg.$('#cmOk')) await pg.check('#cmOk');
  await pg.click('.mask .btn.pri');
  await pg.waitForFunction(() => !/열 맵핑 확인/.test((document.querySelector('.mask .dlg-h') || {}).textContent || ''), null, { timeout:10000 });
  return true;
}
const dlgBody = pg => pg.$eval('.mask .dlg-b', e => e.innerText);
const fakeHash = (pg, tbl, k) => pg.evaluate(([tbl, k]) => { const K = tbl === 'sheet_wk' ? 'src_row' : 'id';
  const o = Object.assign({}, window.__DB[tbl].find(x => x[K] === k)); delete o.synced_at; return 'h:' + JSON.stringify(o); }, [tbl, k]);

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
  is(L[L.length - 1].or.some(o => o === 'eq_no.is.null,eq_no.eq.""') && (await listKeys(pg)).join() === '6,2',
    '「그 밖의 열 · 비어 있음」 → null 과 빈 글자 둘 다 (' + (await listKeys(pg)) + ' · ' + JSON.stringify(L[L.length - 1].or) + ')');
  /* v156 — 조건을 더 건다(그리고). 두 조건은 and(…) 한 파라미터로 */
  await pg.click('#search [data-act=scadd]');
  await pg.selectOption('#search [data-sc]:nth-of-type(2) [name=ocol]', 'stage'); await pg.selectOption('#search [data-sc]:nth-of-type(2) [name=omode]', 'eq');
  await pg.fill('#search [data-sc]:nth-of-type(2) [name=oval]', 'BM');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  L = sel(await qlog(pg), 'sheet_wk');
  is(L[L.length - 1].or.length === 1 && L[L.length - 1].or[0] === 'and(or(eq_no.is.null,eq_no.eq.""),stage.eq."BM")' && (await listKeys(pg)).join() === '6',
    '그 밖의 열 조건 둘 → and(…) 한 파라미터 · 결과 6 (' + (await listKeys(pg)) + ' · ' + JSON.stringify(L[L.length - 1].or) + ')');
  is(await pg.$$eval('#search [data-sc]', e => e.length) === 2, '검색 뒤에도 조건 두 줄이 그대로 남는다');
  /* ✕ 로 하나 빼면 한 조건으로 돌아간다 */
  await pg.click('#search [data-sc]:nth-of-type(2) [data-act=scdel]');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(250);
  is((await listKeys(pg)).join() === '6,2', '조건을 빼면 다시 두 행');

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
  await pg.click('#search [data-act=new]'); await waitDlg(pg, /설비 고르기/);
  await pg.click('.mask .dlg-f .btn:has-text("설비 없이 빈 행")'); await pg.waitForTimeout(200);
  is(await pg.$eval('#editor .badge.newtag', e => !!e) && !(await pg.$('#editor .fld.auto')), '「설비 없이 빈 행」 — 지금까지의 빈 새 행 (자동 칸 없음)');
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

/* ═══ [9] 설비 칸 채우기 — 있는 행 (v145) ═══ */
console.log('[9] 설비 칸 채우기 — 설치현황 + 직전 수선실적 · 빈 칸만 · 그 행 자신은 직전 실적이 아니다');
{
  /* 행 #2(S/N ZZT-0001L · 2/7)보다 «앞선» 같은 설비 실적 하나 — 표기가 다른 S/N(소문자·하이픈)으로 */
  await pg.evaluate(() => { const W = window.__DB.sheet_wk;
    W.push(Object.assign({}, W[0], { src_row:9, rs_code:'RS-T-0009', d_start:'2026-01-20', sn_in:'zzt-0001l', op:'OPY Scrubber', model:'MDL-PREV', pg:'PG-PREV', eq_no:null, extra:null })); });
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  await pg.click('#list tr[data-key="2"]'); await pg.waitForTimeout(250);
  await setField(pg, 'model', 'KEEP-ME');
  await qlog(pg);
  await pg.click('#editor [data-act=fill]'); await waitDlg(pg, /설비 칸 채우기/);
  const L = await qlog(pg), iq = sel(L, 'sheet_inst'), lw = rpcs(L, 'edit_last_wk');
  is(iq.length === 2 && iq[0].f.some(f => f[0] === 'src_row' && f[1] === 'gt') && iq[0].order === 'src_row' && iq[0].limit === 1000 && !/\*/.test(iq[0].cols),
     '설치현황은 필요한 열만 키셋으로 한 번 받는다 — «0행일 때만» 멈춘다 (' + iq.length + '번)');
  is(lw.length === 1 && JSON.stringify(lw[0].args.p_sns) === '["ZZT0001L"]', '직전 수선실적 — 맞춘 S/N 으로 edit_last_wk (' + JSON.stringify(lw[0] && lw[0].args) + ')');
  const rows = await pg.$$eval('.mask table.dt tr', trs => trs.slice(1).map(t => [t.cells[1].textContent, !!t.querySelector('input:checked'), !!t.querySelector('input'), t.cells[3].textContent, t.cells[4].textContent]));
  const m = Object.fromEntries(rows.map(r => [r[0], r]));
  const LB = await pg.evaluate(() => Object.fromEntries(['eq_no','op','model','pg','customer'].map(c => [c, label(TAB_BY.wk, c).name])));
  is(m[LB.eq_no] && m[LB.eq_no][1] && m[LB.eq_no][3] === 'ZQ-001' && m[LB.eq_no][4] === '설치현황', '빈 칸(설비호기)만 기본 체크 — 접미 L 을 떼고 설치현황 ZZT-0001 을 찾았다');
  is(m[LB.op] && m[LB.op][2] && !m[LB.op][1], '값 있는 칸(운영단위)은 보여만 주고 체크 안 됨');
  is(m[LB.model] && !m[LB.model][1] && m[LB.model][3] === 'MDL-PREV' && m[LB.model][4] === '직전 수선실적', '내가 적은 모델은 기본으로 안 덮는다 · 모델은 직전 수선실적에서');
  is(m[LB.pg] && m[LB.pg][1] && m[LB.pg][3] === 'PG-PREV',
     '고치는 행(#2)이 그 S/N 의 가장 최근 실적이어도 «자기»가 아니라 그 앞 실적(#9)에서 찾는다 (' + JSON.stringify(m[LB.pg]) + ')');
  is(/직전 수선실적\(RS-T-0009 · 2026-01-20\)/.test(await dlgBody(pg)), '창 머리가 «어느 실적에서 몇 칸»을 적는다');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(150);
  is(await pg.$eval('#editor [data-col=eq_no]', e => e.value) === 'ZQ-001' && await pg.$eval('#editor [data-col=model]', e => e.value) === 'KEEP-ME'
     && await pg.$eval('#editor [data-col=pg]', e => e.value) === 'PG-PREV', '체크한 칸(빈 칸)만 채워졌다');
  is(await pg.$eval('#editor [data-col=eq_no]', e => e.closest('.fld').classList.contains('dirty')), '채운 칸은 «바뀐 칸»으로 보인다(저장은 사람이)');
  await pg.click('#editor [data-act=revert]');
  /* 두 대가 맞으면 고르게 한다 — 직전 실적이 있어도 묻는다(그것만으로 채우면 설치현황 칸이 조용히 빈다) ·
     설치현황은 이미 받아 두었다(다시 읽지 않는다) */
  await pg.evaluate(() => { const W = window.__DB.sheet_wk;
    W.push(Object.assign({}, W[0], { src_row:10, rs_code:'RS-T-0010', d_start:'2026-01-25', sn_in:'ZZT-0007', model:'MDL-7P', eq_no:null, extra:null })); });
  await setField(pg, 'sn_in', 'ZZT-0007');
  await qlog(pg);
  await pg.click('#editor [data-act=fill]'); await waitDlg(pg, /대입니다/);
  is(/2대/.test(await pg.$eval('.mask .dlg-h', e => e.textContent)) && !sel(await qlog(pg), 'sheet_inst').length, '설치현황에 맞는 설비가 둘이면 고르게 한다 · 설치현황은 다시 안 읽는다');
  await pg.click('.mask [data-ret="1"]'); await waitDlg(pg, /설비 칸 채우기/);
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
console.log('[14] 엑셀 일괄 — 체크 · 받기');
const B = await open(seedOf());
{
  const pg = B.pg;
  await pg.click('.tab[data-tab=roster]'); await pg.waitForTimeout(400);
  is(await pg.$eval('#selBar [data-act=xall]', b => b.textContent) === '검색 결과 3건 엑셀로 받기' && !(await pg.$('#selBar [data-act=xblank]')),
     '아무것도 안 고르면 «검색 결과 3건 엑셀로 받기» (v142) · 빈 양식은 목록 머리가 아니라 검색 칸에 (v145)');
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
  const A0 = aoaOf(readWb(await download(pg, '#search [data-act=xblank]')), '인원현황');
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
  await passMap(pg); await waitDlg(pg, /미리보기/);
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
  await passMap(pg); await waitDlg(pg, /미리보기/);
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
  await passMap(pg); await waitDlg(pg, /미리보기/);
  body = await dlgBody(pg);
  is(/받은 뒤에 이 행이 바뀌었습니다/.test(body) && /수정 0행/.test(body), '받은 뒤 바뀐 행은 건너뛴다(덮지 않는다)');
  await pg.click('.mask .btn:not(.pri)'); await pg.waitForTimeout(150);
  /* 같은 행을 두 줄이 겨눈다(행번호 2 · 사원번호 9100002) → 어느 쪽이 맞는지 모르니 둘 다 건너뛴다 */
  const n5 = H.map(() => ''); n5[H.indexOf('사원번호')] = '9100002'; n5[H.indexOf('팀')] = 'TZ';
  await pg.setInputFiles('#xfile', writeWb(wb, '인원현황', [H, A[2], n5], 'up2b.xlsx'));
  await passMap(pg); await waitDlg(pg, /미리보기/);
  body = await dlgBody(pg);
  is(/건너뜀 2/.test(body) && /다른 줄도 고칩니다/.test(body), '같은 행을 두 줄이 고치면 둘 다 건너뛴다');
  await pg.click('.mask .btn:not(.pri)'); await pg.waitForTimeout(150);
  /* 행번호만 남기고 다 비운 줄 — «지우려는» 손짓 → 그 행의 모든 칸을 지우지 않는다 */
  const wiped = A[2].map((v, i) => i ? '' : v);
  await pg.setInputFiles('#xfile', writeWb(wb, '인원현황', [H, wiped], 'up2c.xlsx'));
  await passMap(pg); await waitDlg(pg, /미리보기/);
  body = await dlgBody(pg);
  is(/행번호만 남고 나머지 칸이 전부 비었습니다/.test(body) && /수정 0행/.test(body), '행번호만 남은 줄은 건너뛴다(행 전체를 지우지 않는다)');
  await pg.click('.mask .btn:not(.pri)'); await pg.waitForTimeout(150);
  /* 다른 표의 파일 — 겹치는 이름(사원번호·No) 몇 개만 맞는다 → 크게 알린다 */
  const ew = XL.utils.book_new();
  await pg.setInputFiles('#xfile', writeWb(ew, '교육', [['No', 'Site', '인원', '사원번호', 'Basic 교육완료일', 'Veteran 교육완료일'], ['1', 'Q1', 'Tester One', '9100001', '2025-01-02', '']], 'edu-like.xlsx'));
  await passMap(pg); await waitDlg(pg, /미리보기/);
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
  await passMap(pg); await waitDlg(pg, /미리보기/);
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
  await passMap(pg); await waitDlg(pg, /미리보기/);
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
  is(await pg.$eval('#selBar [data-act=xall]', b => b.disabled) && await pg.$eval('#search [data-act=xblank]', b => b.disabled), '「검색 결과 받기」·「빈 양식」 잠김');
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
  await passMap(pg); await waitDlg(pg, /미리보기/);
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

console.log('[23] 새 행 — 설비부터 고른다 · 국내·해외 출처 규칙 · 빈 양식 · 엑셀 새 행 (v145)');
{
  /* 지어낸 설비 둘(국내 SEC · 해외 GST TAIWAN)과 그 설비의 지난 실적. 출처가 갈리는 칸마다 «다른 값»을 둬서
     어느 출처에서 왔는지가 값으로 드러나게 한다(설치현황 모델 INST-MDL ↔ 실적 모델 WK-MDL2 · 해외 BAY TB1 ↔ TB-WK …). */
  const s5 = seedOf(), I5 = s5.tables.sheet_inst, W5 = s5.tables.sheet_wk, SY = { synced_at:'2026-01-01T00:00:00Z' };
  I5.push(full(INST_COLS, { src_row:10, code:'ZK-101', sn:'ZZK-0101', country:'SEC Scrubber', customer:'KCO', location:'K9', fab:'K9-L1', bay:'KB1',
                            group1:'ETCH', detail1:'ETCH-A', pjt:'PJT-K', model:'INST-MDL', state:'Operation', div:'MEM' }),
          full(INST_COLS, { src_row:11, code:'ZT-201', sn:'ZZW-0201', country:'GST TAIWAN SCRUBBER', customer:'TCO', location:'TAICHUNG', fab:'F99', bay:'TB1',
                            group1:'G-INST', detail1:'D-INST', pjt:'PJT-T', model:'INST-MDL-T', state:'Operation' }));
  W5.push(full(WK_COLS, Object.assign({ src_row:30, rs_code:'RS-K-0001', d_start:'2026-03-01', sn_in:'ZZK0101', op:'SEC Scrubber', customer:'KCO', campus:'K8',
                                        model:'WK-MDL', pg:'PG-K', main_eq:'KMAIN-1' }, SY)),
          full(WK_COLS, Object.assign({ src_row:31, rs_code:'RS-K-0002', d_start:'2026-04-01 09:00:00', sn_in:'zzk-0101', op:'SEC Scrubber', customer:'KCO', campus:'K7',
                                        line:'K9-L1', bay:'KB1', proc:'ETCH', subproc:'ETCH-A', model:'WK-MDL2', pg:'PG-K2', main_eq:'KMAIN-2', eq_no:'ZK-101' }, SY)),
          full(WK_COLS, Object.assign({ src_row:40, rs_code:'RS-W-0001', d_start:'2026-05-01', sn_in:'ZZW-0201', op:'GST TAIWAN SCRUBBER', customer:'TCO', campus:'기타',
                                        line:'F99', bay:'TB-WK', proc:'PROC-WK', subproc:'SUB-WK', model:'MDL-WK', pg:'PG-T', main_eq:'TMAIN-WK', prod_code:'PJT-T', eq_no:'ZT-201' }, SY)),
          full(WK_COLS, Object.assign({ src_row:41, rs_code:'RS-DUP', d_start:'2026-05-02', sn_in:'ZZD-0001', op:'GST TAIWAN SCRUBBER' }, SY)),
          full(WK_COLS, Object.assign({ src_row:42, rs_code:'RS-DUP', d_start:'2026-05-03', sn_in:'ZZD-0001', op:'GST TAIWAN SCRUBBER' }, SY)),
          full(WK_COLS, Object.assign({ src_row:43, rs_code:'RS-T-0043', d_start:'2026-05-04', sn_in:'ZZT-0007', op:'OPX Scrubber', customer:'TESTCO', model:'MDL-7P', pg:'PG-7' }, SY)));
  const { ctx:c5, pg, pe:pe5 } = await open(s5);
  const LB = await pg.evaluate(() => ({ wk:LBL.wk, mat:LBL.mat }));
  const nm = (id, c) => (LB[id][c] && LB[id][c].name) || c;
  const autoVals = () => pg.$$eval('#editor .fld.auto [data-col]', xs => Object.fromEntries(xs.map(x => [x.dataset.col, x.value]).sort()));
  const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

  /* (a) 「빈 양식」 자리 — 검색 칸에서 「엑셀 올리기」 바로 왼쪽 · 목록 머리에는 없다 */
  const acts = await pg.$$eval('#search .sbar > *', xs => xs.map(x => x.dataset.act || ''));
  is(acts.indexOf('xblank') >= 0 && acts.indexOf('xblank') + 1 === acts.indexOf('xup'), '「빈 양식」은 검색 칸의 「엑셀 올리기」 바로 왼쪽 (' + acts.filter(Boolean).join(' · ') + ')');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  is(!(await pg.$('#selBar [data-act=xblank]')), '검색한 뒤에도 목록 머리에는 없다(한 자리)');

  /* (b) 수선실적 「+ 새 행」 → 설비 고르기 → 국내 설비 */
  await qlog(pg);
  await pg.click('#search [data-act=new]'); await waitDlg(pg, /설비 고르기/);
  const cnt = () => pg.$eval('.mask [data-pk=n]', e => e.textContent);
  await pg.waitForFunction(() => /대 ·|맞는 설비가 없습니다/.test((document.querySelector('.mask [data-pk=n]') || {}).textContent || ''));
  const iq = sel(await qlog(pg), 'sheet_inst');
  is(/^5대/.test(await cnt()) && iq.length === 2 && iq[1].f.some(f => f[0] === 'src_row' && f[1] === 'gt' && f[2] === 11), '설치현황 전 설비(5대)를 키셋으로 받아 화면에서 거른다 (' + await cnt() + ')');
  await pg.selectOption('.mask select[data-pf=country]', 'SEC Scrubber'); await pg.waitForTimeout(100);
  const custOpts = await pg.$$eval('.mask select[data-pf=customer] option', os => os.map(o => o.value).filter(Boolean));
  is(/^1대/.test(await cnt()) && custOpts.join() === 'KCO', '운영단위를 고르면 그 설비만 · 고객사 목록도 그 운영단위 것만 (' + custOpts + ')');
  await pg.selectOption('.mask select[data-pf=country]', ''); await pg.waitForTimeout(100);
  await pg.fill('.mask [data-pf=q]', '0101'); await pg.waitForTimeout(100);
  is(/^1대/.test(await cnt()), 'S/N 일부(0101)로 찾는다');
  await pg.press('.mask [data-pf=q]', 'Enter'); await pg.waitForTimeout(400);
  const KR = { op:'SEC Scrubber', customer:'KCO', line:'K9-L1', prod_code:'PJT-K', campus:'K9', bay:'KB1', proc:'ETCH', subproc:'ETCH-A',
               model:'WK-MDL2', pg:'PG-K2', main_eq:'KMAIN-2', eq_no:'ZK-101', sn_in:'ZZK-0101' };
  const kv = await autoVals();
  is(!!(await pg.$('#editor .badge.newtag')) && same(kv, KR),
     '한 대뿐이면 Enter 로 고른다 · 국내 — 단지·BAY·공정·세부공정은 설치현황, 모델·제품군·메인설비호기는 직전 수선실적 (' + JSON.stringify(kv) + ')');
  is(await pg.$eval('#editor [data-col=model]', e => e.closest('.fld').querySelector('.atag').title.startsWith('직전 수선실적'))
     && await pg.$eval('#editor [data-col=campus]', e => e.closest('.fld').querySelector('.atag').title.startsWith('설치현황')), '「자동」 표시가 출처를 말한다(설치현황 · 직전 수선실적)');
  const note = await pg.$eval('#editor .note.anote', e => e.textContent);
  is(/설치현황\(ZZK-0101 · ZK-101\)에서 10칸/.test(note) && /직전 수선실적\(RS-K-0002 · 2026-04-01\)에서 3칸/.test(note), '편집기 머리가 «무엇에서 몇 칸»을 적는다 (' + note + ')');
  is(await pg.evaluate(() => document.activeElement && document.activeElement.dataset.col) === 'rs_code', '첫 칸은 «사람이 적을» 실적코드');
  await setField(pg, 'model', 'MY-MDL');
  is(!(await pg.$('#editor .fld.auto [data-col=model]')) && !!(await pg.$('#editor .fld.auto [data-col=pg]')), '고친 칸은 「자동」 표시가 사라진다(나머지는 그대로)');
  await setField(pg, 'rs_code', 'RS-N-0001'); await setField(pg, 'd_start', '2026-07-01');
  await qlog(pg);
  await pg.click('#editor [data-act=insert]'); await pg.waitForTimeout(300);
  const ins = (rpcs(await qlog(pg), 'edit_insert')[0] || { args:{} }).args.p_row || {};
  is(ins.rs_code === 'RS-N-0001' && ins.op === 'SEC Scrubber' && ins.campus === 'K9' && ins.model === 'MY-MDL' && ins.main_eq === 'KMAIN-2' && ins.sn_in === 'ZZK-0101',
     '넣으면 채운 설비 칸이 그대로 저장된다 · 사람이 고친 모델은 사람 값 (' + JSON.stringify(ins) + ')');

  /* (c) 해외 설비 — 고르기 조건은 다음 번에도 남는다 · 단지·BAY·공정은 직전 실적 · 메인설비호기는 설치현황 CODE */
  await pg.click('#search [data-act=new]'); await waitDlg(pg, /설비 고르기/);
  await pg.waitForFunction(() => /대 ·|맞는 설비가 없습니다/.test((document.querySelector('.mask [data-pk=n]') || {}).textContent || ''));
  is(await pg.$eval('.mask [data-pf=q]', e => e.value) === '0101', '고르기 조건(S/N 0101)이 다음 번에도 남는다');
  await pg.fill('.mask [data-pf=q]', 'zzw'); await pg.waitForTimeout(100);
  await pg.click('.mask tr[data-ret="0"]'); await pg.waitForTimeout(400);
  const OS = { op:'GST TAIWAN SCRUBBER', customer:'TCO', line:'F99', prod_code:'PJT-T', campus:'기타', bay:'TB-WK', proc:'PROC-WK', subproc:'SUB-WK',
               model:'MDL-WK', pg:'PG-T', main_eq:'ZT-201', eq_no:'ZT-201', sn_in:'ZZW-0201' };
  const ov = await autoVals();
  is(same(ov, OS), '해외 — 단지·BAY·공정·세부공정은 직전 수선실적(설치현황과 표기가 다르다) · 메인설비호기는 설치현황 CODE (' + JSON.stringify(ov) + ')');
  /* 「설비 없이 빈 행」·「취소」 */
  await pg.click('#search [data-act=new]'); await waitDlg(pg, /설비 고르기/);
  await pg.click('.mask .dlg-f .btn:has-text("취소")'); await pg.waitForTimeout(150);
  is(same(await autoVals(), OS), '「취소」 — 하던 새 행은 그대로');

  /* (d) 자재실적 「+ 새 행」 → 그 수선실적부터 */
  await pg.click('.tab[data-tab=mat]'); await pg.waitForTimeout(400);
  await pg.click('#search [data-act=new]'); await waitDlg(pg, /수선실적 고르기/);
  await qlog(pg);
  await pg.fill('.mask [data-pf=q]', 'RS-K-0002'); await pg.press('.mask [data-pf=q]', 'Enter');
  await pg.waitForFunction(() => /건\(최근에|맞는 수선실적이 없습니다/.test((document.querySelector('.mask [data-pk=n]') || {}).textContent || ''));
  const pq = sel(await qlog(pg), 'sheet_wk').pop();
  is(!!pq && pq.or[0] === 'rs_code.ilike.*RS*K*0002*,sn_in.ilike.*RS*K*0002*,eq_no.ilike.*RS*K*0002*' && pq.order === 'src_row' && !pq.asc && pq.limit === 50,
     '실적코드·S/N·설비호기 중 하나로 · 최근에 올린 행부터 50건 (' + (pq && pq.or[0]) + ')');
  await pg.click('.mask tr[data-ret="0"]'); await pg.waitForTimeout(400);
  const MK = { op:'SEC Scrubber', customer:'KCO', campus:'K7', line:'K9-L1', bay:'KB1', proc:'ETCH', detail:'ETCH-A', main_eq:'KMAIN-2', eq:'ZK-101', sn:'zzk-0101', model:'WK-MDL2' };
  const mv = await autoVals();
  is(same(mv, MK) && await pg.$eval('#editor [data-col=rs_code]', e => e.value) === 'RS-K-0002',
     '자재 — 그 수선실적 값 그대로(세부공정 → 세부공정 · 설비호기 → 설비 · S/N(IN) → S/N) (' + JSON.stringify(mv) + ')');
  is(await pg.$eval('#editor [data-col=work_date]', e => e.value) === '' && await pg.$eval('#editor [data-col=pf]', e => e.value) === ''
     && await pg.evaluate(() => document.activeElement && document.activeElement.dataset.col) === 'work_date', '자재실적일자·유/무상은 옮기지 않는다 · 첫 칸은 빈 필수 칸(자재실적일자)');
  is(/수선실적 RS-K-0002에서 11칸/.test(await pg.$eval('#editor .note.anote', e => e.textContent)), '머리: «수선실적 RS-K-0002 에서 11칸»');

  /* (e) 빈 양식 — 설비 칸이 없다 · 찾는 열쇠(S/N · 자재는 수선실적번호)가 맨 앞 */
  await pg.click('.tab[data-tab=wk]'); await pg.waitForTimeout(400);
  const wbB = readWb(await download(pg, '#search [data-act=xblank]'));
  const HB = aoaOf(wbB, '수선실적')[0];
  const autoWk = ['op','customer','line','prod_code','campus','bay','proc','subproc','model','pg','main_eq','eq_no'];
  is(HB[0] === '행번호' && HB[1] === nm('wk', 'sn_in') && HB.indexOf(nm('wk', 'rs_code')) > 1, '빈 양식 — 행번호 · S/N(IN) 이 맨 앞 (' + HB.slice(0, 4).join(' | ') + ' …)');
  is(!autoWk.some(c => HB.indexOf(nm('wk', c)) >= 0), '빈 양식에는 설비 칸(운영단위·고객사·단지·라인·BAY·공정·세부공정·모델·제품군·메인설비호기·설비호기·제품코드)이 없다');
  const GB = aoaOf(wbB, '안내').map(r => r.join(' ')).join('\n');
  is(/설비 칸 — 새 행은 올릴 때 채웁니다/.test(GB) && /이 빈 양식에는 설비 칸이 없습니다/.test(GB), '안내 시트가 «설비 칸은 올릴 때 채운다»고 적는다');
  await pg.click('#search button[type=submit]'); await pg.waitForTimeout(300);
  const full0 = aoaOf(readWb(await download(pg, '#selBar [data-act=xall]')), '수선실적')[0];
  is(HB.slice(1).every(h => full0.indexOf(h) > 0), '빈 양식의 머리글은 검색 결과 양식과 «같은 글자»');

  /* (f) 엑셀 새 행 — 올릴 때 같은 규칙으로 «빈 칸만» 채운다 · 못 채운 줄은 이유와 함께 */
  const col = n => HB.indexOf(n), H6 = HB.concat([nm('wk', 'model')]);
  const nr = (sn, rs, d, mdl) => { const r = H6.map(() => ''); r[col(nm('wk', 'sn_in'))] = sn; r[col(nm('wk', 'rs_code'))] = rs; r[col(nm('wk', 'd_start'))] = d; if(mdl) r[H6.length - 1] = mdl; return r; };
  const fpB = writeWb(wbB, '수선실적', [H6, nr('ZZK0101', 'RS-B-0001', '2026-07-02'), nr('zzw 0201', 'RS-B-0002', '2026-07-03', 'MY-OS'),
    nr('ZZQ-9999', 'RS-B-0003', '2026-07-04'), nr('ZZT-0007', 'RS-B-0004', '2026-07-05'), nr('', 'RS-B-0005', '2026-07-06')], 'blank-wk.xlsx');
  await qlog(pg);
  await pg.setInputFiles('#xfile', fpB);
  await passMap(pg); await waitDlg(pg, /미리보기/);
  const body = await dlgBody(pg);
  is(/새 행 5/.test(body) && /설비 칸 자동 채움 — 새 행 3줄 · 27칸 · 못 채운 2줄/.test(body), '미리보기 — 자동 채움 3줄 · 27칸 · 못 채운 2줄 [' + (body.match(/설비 칸 자동 채움[^\n]*/) || [''])[0] + ']');
  is(/설치현황에도 수선실적에도 없는 S\/N 입니다\(ZZQ-9999\)/.test(body) && /S\/N 이 비어 있습니다/.test(body), '못 채운 줄마다 까닭 — 모르는 S/N · S/N 빈칸');
  is(/설치현황에 맞는 설비가 2대입니다\(ZZT-0007\) — 직전 수선실적 값만 채웠습니다/.test(body),
     '설비가 둘인데 직전 실적은 있으면 — 그 값만 채우고 «반쪽»이라고 적는다(조용히 반만 채우지 않는다)');
  const lw = rpcs(await qlog(pg), 'edit_last_wk');
  is(lw.length === 1 && lw[0].args.p_sns.slice().sort().join() === 'ZZK0101,ZZQ9999,ZZT0007,ZZW0201', '직전 수선실적은 한 번에 묻는다 (' + (lw[0] && lw[0].args.p_sns) + ')');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(600);
  const bk = (rpcs(await qlog(pg), 'edit_bulk')[0] || { args:{ p_items:[] } }).args.p_items.map(x => x.row);
  const b1 = bk.find(r => r.rs_code === 'RS-B-0001') || {}, b2 = bk.find(r => r.rs_code === 'RS-B-0002') || {}, b3 = bk.find(r => r.rs_code === 'RS-B-0003') || {};
  /* 모델은 «직전» 수선실적 — 이제는 (b)에서 방금 넣은 RS-N-0001(7/1 · 사람이 고친 MY-MDL)이 그 설비의 가장 최근 실적이다 */
  is(b1.op === 'SEC Scrubber' && b1.campus === 'K9' && b1.bay === 'KB1' && b1.model === 'MY-MDL' && b1.main_eq === 'KMAIN-2' && b1.sn_in === 'ZZK0101',
     '국내 줄 — 설비 칸이 채워졌고 적은 S/N 은 그대로 · 모델은 방금 넣은 실적(가장 최근)에서 (' + JSON.stringify(b1) + ')');
  is(b2.op === 'GST TAIWAN SCRUBBER' && b2.bay === 'TB-WK' && b2.main_eq === 'ZT-201' && b2.model === 'MY-OS' && b2.sn_in === 'zzw 0201',
     '해외 줄 — 해외 규칙 · 파일에 적은 모델(MY-OS)은 덮지 않는다 (' + JSON.stringify(b2) + ')');
  is(!('op' in b3) && b3.sn_in === 'ZZQ-9999', '못 찾은 줄은 설비 칸 없이 그대로 들어간다(미리보기가 알렸다)');

  /* (g) 자재 빈 양식 — 수선실적번호로 그 수선실적에서 · 없거나 둘이면 S/N 으로 */
  await pg.click('.tab[data-tab=mat]'); await pg.waitForTimeout(400);
  const wbM = readWb(await download(pg, '#search [data-act=xblank]'));
  const HM = aoaOf(wbM, '자재실적')[0];
  is(HM[1] === nm('mat', 'rs_code') && HM[2] === nm('mat', 'sn') && !['op','customer','campus','model','eq','detail'].some(c => HM.indexOf(nm('mat', c)) >= 0),
     '자재 빈 양식 — 수선실적번호 · S/N 이 맨 앞 · 설비 칸 없음 (' + HM.slice(0, 4).join(' | ') + ' …)');
  const cm = n => HM.indexOf(nm('mat', n));
  const mr = (rs, sn, d) => { const r = HM.map(() => ''); r[cm('rs_code')] = rs; r[cm('sn')] = sn; r[cm('work_date')] = d; r[cm('mat_code')] = 'MC-9'; r[cm('qty')] = '1'; return r; };
  await qlog(pg);
  await pg.setInputFiles('#xfile', writeWb(wbM, '자재실적', [HM, mr('RS-K-0002', '', '2026-07-05'), mr('RS-NOPE', 'ZZW-0201', '2026-07-06'), mr('RS-DUP', '', '2026-07-07')], 'blank-mat.xlsx'));
  await passMap(pg); await waitDlg(pg, /미리보기/);
  const mb = await dlgBody(pg);
  const wq = sel(await qlog(pg), 'sheet_wk').filter(x => x.f.some(f => f[0] === 'rs_code' && f[1] === 'in'));
  is(wq.length === 1 && wq[0].count === true && wq[0].f.find(f => f[1] === 'in')[2].slice().sort().join() === 'RS-DUP,RS-K-0002,RS-NOPE', '수선실적번호는 in(…) 한 번 · count 로 «다 왔나»를 본다');
  is(/새 행 2줄 · \d+칸 · 못 채운 1줄/.test(mb) && /표에 없는 수선실적번호입니다\(RS-NOPE\) — S\/N 으로 찾아 채웠습니다/.test(mb)
     && /「RS-DUP」 행이 2개라 어느 수선실적인지 모릅니다/.test(mb) && !/수선실적번호도 S\/N 도 비어/.test(mb),
     '자재 — 그 수선실적 · 없으면 S/N 으로(까닭을 적는다) · 번호가 둘이면 «모른다» [' + (mb.match(/설비 칸 자동 채움[^\n]*/) || [''])[0] + ']');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(600);
  const mk = (rpcs(await qlog(pg), 'edit_bulk')[0] || { args:{ p_items:[] } }).args.p_items.map(x => x.row);
  const m1 = mk.find(r => r.rs_code === 'RS-K-0002') || {}, m2 = mk.find(r => r.rs_code === 'RS-NOPE') || {};
  is(m1.op === 'SEC Scrubber' && m1.detail === 'ETCH-A' && m1.eq === 'ZK-101' && m1.sn === 'zzk-0101' && m1.campus === 'K7' && !('pf' in m1),
     '그 수선실적에서 — 세부공정·설비·S/N 까지 · 유/무상은 안 옮긴다 (' + JSON.stringify(m1) + ')');
  is(m2.op === 'GST TAIWAN SCRUBBER' && m2.detail === 'SUB-WK' && m2.eq === 'ZT-201' && m2.sn === 'ZZW-0201' && m2.campus === '기타' && m2.model === 'MY-OS',
     'S/N 길 — 수선실적 규칙을 자재 이름으로 옮긴다(세부공정 ← 세부공정 · 설비 ← 설비호기) (' + JSON.stringify(m2) + ')');
  is(pe5.length === 0, 'JS 에러 없음' + (pe5.length ? ' → ' + pe5.join(' | ') : ''));
  await c5.close();
}

/* ═══ [24] 국내 데모 모드 (?site=KR · v146) ═══
   주간현황(국내) 데모의 데이터 관리 — 국내 운영자(role kr · can_write 꺼짐)와 관리자가 «데모 표»(kr_sheet_*)만 고친다.
   ⚠ 가짜 서버는 kr 이 운영 표 이름으로 RPC 를 부르면 bad_table 로 막는다(setup-17 _edit_key 와 같다) — 화면이 표 이름을
     하나라도 운영 표로 적으면 그 자리가 붉게 뜬다. from() 은 RLS 상 읽기가 되므로(조회자와 같다) 질의 기록으로 따로 본다. */
console.log('[24] 국내 데모 모드 — 데모 표만 · 국내 운영자 게이트 (v146)');
{
  const KRME = { email:'kr@test.local', can_write:false, role:'kr' };
  const krSeed = over => {
    const s = seedOf(over);
    ['sheet_wk','sheet_inst','sheet_alarm','sheet_allbypass','sheet_roster','sheet_edu','sheet_leave'].forEach(t => {
      /* 데모 표 — 운영 표를 복제하되 실적코드를 바꿔 «어느 표를 읽었나»가 값으로도 보이게 */
      s.tables['kr_' + t] = JSON.parse(JSON.stringify(s.tables[t])).map(r => { if (r.rs_code) r.rs_code = r.rs_code.replace('RS-T', 'RS-KR'); return r; });
      s.cols['kr_' + t] = s.cols[t]; if (s.types[t]) s.types['kr_' + t] = s.types[t];
    });
    s.tables.allowed_users.push(KRME, { email:'view@test.local', can_write:false, role:'viewer' });
    return s;
  };
  const ALL = [];
  const { ctx:c24, pg:p24, pe:pe24 } = await open(krSeed({ me:KRME }), '/edit/?site=KR');
  const q24 = async () => { const l = await qlog(p24); ALL.push(...l); return l; };
  is(await p24.$eval('#app', e => !e.hidden) && await p24.$eval('#gate', e => e.hidden), '국내 운영자(kr · 쓰기 권한 꺼짐)는 데모 모드에서 열린다');
  is(/국내 운영자/.test(await p24.$eval('#me', e => e.textContent)), '머리 배지 — 국내 운영자');
  const tabs = await p24.$$eval('.tab[data-tab]', b => b.map(x => x.dataset.tab));
  is(tabs.indexOf('mat') < 0 && ['wk','alarm','abp','inst','roster','edu','leave'].every(t => tabs.indexOf(t) >= 0), '자재 탭은 없다(데모 표가 없다) · 나머지 일곱 (' + tabs + ')');
  is(/국내 데모/.test(await p24.$eval('h1', e => e.textContent)) && /국내 데모/.test(await p24.title()), '머리·제목이 «국내 데모»를 말한다');
  const tu = await p24.$eval('#toUpload', a => ({ href:a.getAttribute('href'), target:a.getAttribute('target') }));
  is(tu.href === '/upload/?site=KR' && tu.target === 'gstUploadKR', '원본 올리기도 데모 경로 · 데모 창으로 (' + JSON.stringify(tu) + ')');
  let L = await q24();
  is(rpcs(L, 'edit_cols').some(x => x.args.p_tbl === 'kr_sheet_inst') && rpcs(L, 'edit_delete').length > 0 && rpcs(L, 'edit_delete').every(x => x.args.p_tbl === 'kr_sheet_wk'),
     '시작 검사도 데모 표로 묻는다 — 운영 표로 물으면 kr 은 bad_table 이라 «함수가 없다»로 잘못 읽힌다');
  is(!/잠겨/.test(await p24.$eval('#banner', e => e.innerText)), '쓰기 기능 잠금 배너가 없다');

  /* 검색 → 열기 → 고치기 — 데모 표에만 쓴다 */
  await p24.click('#search button[type=submit]'); await p24.waitForTimeout(300);
  is((await listKeys(p24)).length === 5, '데모 수선실적 검색 — 5행');
  await p24.click('#list tr[data-key="0"]'); await p24.waitForTimeout(300);
  is(await p24.$eval('#editor [data-col=rs_code]', e => e.value) === 'RS-KR-0001', '열린 행은 데모 표의 것 (실적코드 RS-KR-0001)');
  await setField(p24, 'workers', 'KW1');
  await p24.click('#editor [data-act=save]'); await p24.waitForTimeout(350);
  const db = await p24.evaluate(() => ({ kr:window.__DB.kr_sheet_wk.find(r => r.src_row === 0).workers, prod:window.__DB.sheet_wk.find(r => r.src_row === 0).workers }));
  is(db.kr === 'KW1' && db.prod === 'W1', '저장은 데모 표에만 — 운영 표는 그대로 (' + JSON.stringify(db) + ')');
  is(/저장했습니다/.test(await snackText(p24)), '저장 알림');

  /* 직전 수선실적(설비 칸 채우기)도 데모 수선실적에서 */
  await q24();
  const lw = await p24.evaluate(async () => { try { const m = await lastWk(['ZZT-0001']); return Array.from(m.entries()).map(([k, v]) => [k, v.map(r => r.rs_code)]); }
    catch (e) { return 'throw ' + e.message; } });   // 운영 표로 물으면 가짜 서버가 bad_table 로 던진다 — 멈추지 말고 붉게
  const lwq = rpcs(await q24(), 'edit_last_wk');
  is(lwq.length === 1 && lwq[0].args.p_tbl === 'kr_sheet_wk' && JSON.stringify(lw) === '[["ZZT0001",["RS-KR-0001"]]]',
     '직전 수선실적 — edit_last_wk(p_tbl=kr_sheet_wk) · 데모 실적이 돌아온다 (' + JSON.stringify(lw) + ')');

  /* 원장·인원·교육(구분은 인원에서 빌린다)도 데모 표로 */
  await p24.click('.tab[data-tab=alarm]'); await p24.waitForTimeout(300);
  await p24.click('#search button[type=submit]'); await p24.waitForTimeout(300);
  is((await listKeys(p24)).length === 3, '데모 알람 — 3행');
  await p24.click('.tab[data-tab=roster]'); await p24.waitForTimeout(300);
  await p24.click('#search button[type=submit]'); await p24.waitForTimeout(300);
  is((await listKeys(p24)).length === 3, '데모 인원 — 3명');
  await p24.click('.tab[data-tab=edu]'); await p24.waitForTimeout(300);
  await p24.selectOption('#search [name=region]', 'kr').catch(() => {});
  await p24.click('#search button[type=submit]'); await p24.waitForTimeout(300);
  await q24();

  /* 이력 — 데모 표의 이력만(운영 표 이력은 보여도 되돌릴 수 없고 헷갈리기만 한다) */
  await p24.click('.tab[data-tab=hist]'); await p24.waitForTimeout(400);
  L = sel(await q24(), 'sheet_edits');
  const hq = L[L.length - 1], inF = hq && hq.f.find(f => f[0] === 'tbl' && f[1] === 'in');
  is(!!inF && inF[2].length === 7 && inF[2].every(t => /^kr_sheet_/.test(t)), '이력 질의 — 데모 표 일곱의 이력만 (' + (inF && inF[2]) + ')');
  const opts = await p24.$$eval('#hfilt [name=tbl] option', o => o.map(x => x.value));
  is(opts.filter(Boolean).length === 7 && opts.filter(Boolean).every(v => /^kr_sheet_/.test(v)), '표 고르기 — 데모 표뿐 (CIP·ABP·옛 시트 기록 없음)');
  const ent = await p24.$$eval('#hlist .he', es => es.map(e => ({ t:e.querySelector('.tl').textContent, r:!!e.querySelector('[data-hr]') })));
  is(ent.length === 1 && ent[0].r, '방금 고친 데모 행의 이력 한 줄 · 되돌릴 수 있다 (' + ent.length + '줄)');

  /* 지금까지의 모든 질의 — 데모 표 · 이력 · 자기 등급뿐 */
  const tbls = Array.from(new Set(ALL.filter(x => x.tbl).map(x => x.tbl))).sort();
  const ptbl = Array.from(new Set(ALL.filter(x => x.rpc && x.args && x.args.p_tbl).map(x => x.args.p_tbl))).sort();
  is(tbls.every(t => /^kr_sheet_/.test(t) || t === 'sheet_edits' || t === 'allowed_users'), '읽은 표 — 데모 표 · 이력 · 자기 등급뿐 (' + tbls.join(' ') + ')');
  is(ptbl.length > 0 && ptbl.every(t => /^kr_sheet_/.test(t)), 'RPC 의 표 — 전부 데모 표 (' + ptbl.join(' ') + ')');
  /* 가짜 서버의 kr 규칙이 살아 있다(검사의 이빨) — 운영 표로 부르면 bad_table */
  const fang = await p24.evaluate(async () => { const r = await window.__FDB.rpc('edit_get', { p_tbl:'sheet_wk', p_key:0 }); return r.error && r.error.message; });
  is(/bad_table/.test(fang || ''), '가짜 서버 — kr 이 운영 표를 부르면 bad_table (setup-17 과 같다)');
  is(pe24.length === 0, 'JS 에러 없음' + (pe24.length ? ' → ' + pe24.join(' | ') : ''));
  await c24.close();

  /* 국내 운영자가 «본» 데이터 관리를 열면 — 잠긴 문 · 갈 곳을 적는다 */
  const b24 = await open(krSeed({ me:KRME }));
  is(await b24.pg.$eval('#gate', e => !e.hidden) && await b24.pg.$eval('#app', e => e.hidden), '국내 운영자가 본 데이터 관리(/edit/)를 열면 잠긴 문 — 운영 표는 관리자만');
  is(/주간 현황\(국내\)/.test(await b24.pg.$eval('#gate', e => e.innerText)), '잠긴 문이 갈 곳(「주간 현황(국내)」)을 적는다');
  await b24.ctx.close();
  /* 조회자는 데모 모드도 잠긴다 · 관리자(쓰기)는 열린다 */
  const v24 = await open(krSeed({ me:{ email:'view@test.local', can_write:false, role:'viewer' } }), '/edit/?site=KR');
  is(await v24.pg.$eval('#gate', e => !e.hidden) && /국내 운영자 전용/.test(await v24.pg.$eval('#gate', e => e.innerText)), '조회자 — 데모 모드도 잠긴 문 (문구: 관리자·국내 운영자 전용)');
  await v24.ctx.close();
  const a24 = await open(krSeed(), '/edit/?site=KR');
  is(await a24.pg.$eval('#app', e => !e.hidden) && /관리자/.test(await a24.pg.$eval('#me', e => e.textContent)), '관리자(쓰기) — 데모 모드가 열린다');
  await a24.ctx.close();
}

console.log('[25] 남의 양식(중문 머리글·제목 줄) — 열 맵핑 확인 · 내장 사전 · 수동 지정 · 저장 위치 · 똑같은 행 · 원본 교체 (v151)');
{
  const s = seedOf({});
  s.tables.sheet_leave = [{ id:1, '사원번호':'9100001', '이름':'Tester One', '소속':'F99-Set up', '항목':'特休假', '발생일':null, '휴가시작일':'2026/01/02',
    '휴가시작시간':'09:00', '휴가종료일':'2026/01/02', '휴가종료시간':'18:00', '휴가신청시간':'8', '비고':'小時' }];
  s.tables.colmap_site = [];
  const { ctx, pg, pe } = await open(s);
  /* 업로드 화면(오버레이 안)이 부르는 저장소 파일들 — 실제 배포처럼 로컬 파일로 준다. core 는 이음새가 붙은 위 경로가 맡는다. */
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => { const u = new URL(r.request().url()).pathname;
    if (/\/assets\/core\.js/.test(u)) return r.fallback();
    const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status:404, body:'nf' });
    r.fulfill({ status:200, contentType:/\.js$/.test(f) ? 'application/javascript' : 'text/plain', body:fs.readFileSync(f) }); });
  await pg.click('.tab[data-tab=leave]'); await pg.waitForTimeout(400);
  const H = ['員工編號','姓名','部門','假勤項目','事件發生日','假勤開始日期','假勤開始時間','假勤結束日期','時數結束時間','請假時數','請假單位','',''];
  const L1 = ['9100001','Tester One','F99-Set up','特休假','','2026/01/02','09:00','2026/01/02','18:00','8','小時'];   // 표에 이미 똑같은 행
  const L2 = ['9100002','Tester Two','F99-Set up','事假','','2026/02/03','13:00','2026/02/03','17:00','4','小時'];
  const L3 = ['9100003','Tester Three','F99-Set up','特休假','','2026/03/04','09:00','2026/03/05','18:00','2','天'];
  const mk = (head, file) => { const wb = XL.utils.book_new();
    XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet([['No.','인사','이름(영문)'],['1','재직','Tester One']]), 'CS人員清單');   // 첫 시트는 남의 표
    XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet([['Update : 2026.10.3 (1/1-9/30)'], head, L1, L2, L3]), '근태请款');
    const fp = path.join(TMP, file); fs.writeFileSync(fp, XL.write(wb, { type:'buffer', bookType:'xlsx' })); return fp; };
  const head = () => pg.evaluate(() => (document.querySelector('.mask .dlg-h') || {}).textContent || '');
  const cmBody = () => pg.$eval('#cmBody', e => e.innerText);
  const fpA = mk(H, 'tw-leave.xlsx');
  await pg.setInputFiles('#xfile', fpA);
  await pg.waitForFunction(() => !!document.querySelector('#cmSheet'), null, { timeout:10000 });
  let b = await cmBody();
  is(/열 맵핑 확인/.test(await head()), '받은 양식이 아니면 «열 맵핑 확인»이 먼저 뜬다');
  is(await pg.$eval('#cmSheet', e => e.value) === '근태请款', '시트는 «이 표와 가장 많이 맞는» 근태请款 (첫 시트를 집지 않는다)');
  is(/머리글 2행/.test(b) && /표의 열 11\/11개를 찾았습니다/.test(b), '제목 줄(Update …)을 건너 2행이 머리글 · 11/11 열');
  is((b.match(/자동\(내장 사전\)/g) || []).length === 11, '중문 머리글을 내장 사전으로 전부 알아본다 — ' + (b.match(/자동\(내장 사전\)/g) || []).length);
  is(/小時/.test(await pg.$eval('#cmBody', e => [...e.querySelectorAll('tr')].find(r => /^비고/.test(r.innerText)).innerText)), '「請假單位」(小時·天)는 「비고」로 — 화면이 단위를 비고에서 읽는다');
  is(await pg.evaluate(() => !!document.getElementById('cmOk') && document.querySelector('.mask .btn.pri').disabled), '자동 인식이 «깨끗하지 않으면» 확인 칸을 체크하기 전에는 «다음»이 잠긴다');
  is(await pg.$eval('input[name=cmMethod][value=rows]', e => e.checked), '작은 파일은 «한 행씩»이 기본');
  await pg.check('#cmOk'); await pg.click('.mask .btn.pri');
  await waitDlg(pg, /미리보기/);
  b = await dlgBody(pg);
  is(/새 행 2/.test(b) && /똑같은 행이 있는 1줄은 넣지 않습니다/.test(b), '미리보기 — 새 행 2 · 표에 이미 있는 똑같은 줄 1은 넣지 않는다');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(800);
  const lv = await pg.evaluate(() => window.__DB.sheet_leave.map(r => r['이름'] + '|' + r['비고'] + '|' + r['휴가신청시간']));
  is(lv.length === 3 && lv.indexOf('Tester Three|天|2') >= 0, '반영 — 3행 · 天 단위가 비고에 들어간다 (' + lv.join(', ') + ')');
  await pg.setInputFiles('#xfile', fpA);
  await passMap(pg); await waitDlg(pg, /미리보기/);
  b = await dlgBody(pg);
  is(/새 행 0/.test(b) && /똑같은 행이 있는 3줄/.test(b), '같은 원본을 다시 올려도 두 번 들어가지 않는다');
  await pg.click('.mask .btn:not(.pri)'); await pg.waitForTimeout(150);

  /* 수동 지정 — 사전에 없는 머리글 · 저장 위치 둘 */
  const H2 = H.slice(); H2[1] = '員工名稱';
  await pg.setInputFiles('#xfile', mk(H2, 'tw-leave2.xlsx'));
  await pg.waitForFunction(() => !!document.querySelector('#cmSheet'), null, { timeout:10000 });
  b = await cmBody();
  is(/못 찾음/.test(await pg.$eval('#cmBody', e => [...e.querySelectorAll('tr')].find(r => /^이름/.test(r.innerText)).innerText)), '사전에 없는 머리글 — 「이름」 못 찾음(필수)');
  await pg.check('input[name=cmWhere][value=pc]');
  await pg.selectOption('select[data-cmap="이름"]', '員工名稱');
  await pg.waitForFunction(() => /지정 · 이 PC/.test(document.getElementById('cmBody').innerText), null, { timeout:5000 });
  is(await pg.evaluate(() => JSON.parse(localStorage.getItem('gst_cmap:ALL:leave') || '{}')['이름'] === '員工名稱' && !window.__DB.colmap_site.some(r => r.field === '이름')),
    '«이 PC 에만» — 이 브라우저(localStorage)에만 저장, 대시보드 표에는 안 쓴다');
  await pg.check('input[name=cmWhere][value=db]');
  await pg.selectOption('select[data-cmap="소속"]', '部門');
  await pg.waitForFunction(() => /지정 · 공유/.test(document.getElementById('cmBody').innerText), null, { timeout:5000 });
  is(await pg.evaluate(() => window.__DB.colmap_site.some(r => r.site === 'ALL' && r.tbl === 'leave' && r.field === '소속' && r.header === '部門')),
    '«대시보드에 저장» — 업로드와 같은 열쇠(ALL · leave · 표 열 이름)로 colmap_site 에');

  /* 원본으로 교체 — 업로드 화면을 이 안에 띄우고 같은 파일을 건넨다 */
  await pg.check('input[name=cmMethod][value=replace]');
  if (await pg.$('#cmOk')) await pg.check('#cmOk');
  await pg.click('.mask .btn.pri');
  await pg.waitForFunction(() => { const o = document.getElementById('upOv'); return o && !o.hidden; }, null, { timeout:5000 });
  is(/embed=1/.test(await pg.$eval('#upFrame', e => e.src)) && /rid=leave/.test(await pg.$eval('#upFrame', e => e.src)), '교체 — 업로드 화면이 데이터 관리 «안»에 뜬다(embed · 표 미리 고름)');
  let fr = null; for (let i = 0; i < 50 && !fr; i++) { fr = pg.frames().find(f => /\/upload\//.test(f.url())); if (!fr) await pg.waitForTimeout(100); }
  await fr.waitForFunction(() => /표의 열 11\/11개를 파일에서 찾았습니다/.test((document.getElementById('chk') || {}).innerText || ''), null, { timeout:15000 }).catch(() => {});
  const up = await fr.evaluate(() => ({ f:(document.getElementById('fsel').files[0] || {}).name, sh:document.getElementById('ssel').value, chk:document.getElementById('chk').innerText,
    embed:document.body.classList.contains('embed'), h1:getComputedStyle(document.querySelector('h1')).display }));
  is(up.f === 'tw-leave2.xlsx' && up.sh === '근태请款', '같은 파일·같은 시트를 넘겨받는다 (' + up.f + ' · ' + up.sh + ')');
  is(/표의 열 11\/11개를 파일에서 찾았습니다/.test(up.chk) && /지정 · 이 PC/.test(up.chk) && /지정 · 공유/.test(up.chk), '데이터 관리에서 고른 맵핑을 업로드도 그대로 쓴다(이 PC · 공유 둘 다)'); 
  is(up.embed && up.h1 === 'none', '안에서는 업로드 화면의 머리 설명을 숨긴다');
  await pg.click('#upClose');
  is(await pg.$eval('#upOv', e => e.hidden), '닫으면 오버레이가 사라진다');
  is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}

console.log('[26] 기준 정보 — 새 사이트가 «어디에 · 어떻게» 읽히는지 보고 규칙으로 정한다 (v152)');
{
  const s = seedOf({});
  const add = [
    { src_row:10, code:'ZT-1', sn:'ZZW-0001', country:'GST TAIWAN SCRUBBER', customer:'Testco Memory Taiwan Co., Ltd.(F16)', location:'TAICHUNG', fab:'F16', state:'Operation' },
    { src_row:11, code:'ZT-2', sn:'ZZW-0002', country:'GST TAIWAN SCRUBBER', customer:'Testco Memory Taiwan Co., Ltd.(F16)', location:'TAICHUNG', fab:'F16', state:'Operation' },
    { src_row:12, code:'ZT-3', sn:'ZZW-0003', country:'TAIWAN', customer:'TESTCO', location:'TAINAN', fab:'F16S', state:null },
    { src_row:13, code:'ZT-4', sn:'ZZW-0004', country:'TAIWAN', customer:'TESTCO', location:'TAINAN', fab:'F16S', state:null },
    { src_row:14, code:'ZT-5', sn:'ZZW-0005', country:'TAIWAN', customer:'TESTCO', location:'TAICHUNG', fab:'F11', state:'Operation' } ];
  s.tables.sheet_inst = s.tables.sheet_inst.concat(add.map(r => Object.assign(Object.fromEntries(INST_COLS.map(c => [c, null])), r)));
  s.tables.value_map = [];
  const { ctx, pg, pe } = await open(s);
  await pg.click('.tab[data-tab=vmap]');
  await pg.waitForFunction(() => /FAB/.test((document.getElementById('vmBox') || {}).innerText || '') && !/읽는 중/.test(document.getElementById('vmBox').innerText), null, { timeout:8000 });
  const rowTxt = f => pg.evaluate(f => { const tr = [...document.querySelectorAll('#vmBox table.vm-t tbody tr')].find(r => r.cells[0].innerText.trim().replace(/\s*규칙$/, '') === f); return tr ? tr.innerText : ''; }, f);
  let t = await rowTxt('F16S');
  is(/법인 칸에 국가 이름\(TAIWAN\)/.test(t) && /GST TAIWAN SCRUBBER/.test(t), '사이트별 보기 — F16S 의 법인이 «TAIWAN»(국가 이름)이라고 짚고 같은 국가의 법인 이름을 알려 준다');
  is(/설비상태 빈칸 2대/.test(t), '설비상태가 빈 대수를 적는다(대수에 안 셀 수 있다)');
  is(await pg.$eval('#vmOnly', e => e.checked) && (await rowTxt('F16')) === '', '기본은 «확인할 것이 있는 사이트만» — 멀쩡한 F16 은 접어 둔다');
  await pg.uncheck('#vmOnly'); await pg.waitForTimeout(200);
  const f16 = await rowTxt('F16');
  is(f16 !== '' && !/법인 칸에 국가 이름/.test(f16), '이미 법인 이름으로 적힌 F16 은 짚지 않는다');
  is(/가동현황 표/.test(await pg.$eval('#vmBox', e => e.innerText)), '«어디에 쓰이나»를 적는다');
  await pg.click('[data-vmsite="F16S"]');
  await waitDlg(pg, /이 사이트 정하기/);
  await pg.click('[data-vmfill="country"]');
  is(await pg.$eval('[data-vmf="country"]', e => e.value) === 'GST TAIWAN SCRUBBER', '「제안」 단추 — 같은 국가의 법인 이름(표에 이미 있는 값)을 한 번에 채운다');
  await pg.fill('[data-vmf="customer"]', 'Testco Memory Taiwan Co., Ltd.(F16S)');
  await pg.fill('[data-vmf="state"]', '반입완료');
  await pg.click('.mask .btn.pri');
  await pg.waitForFunction(() => window.__DB.value_map.length === 3, null, { timeout:5000 }).catch(() => {});
  const vm = await pg.evaluate(() => window.__DB.value_map.map(r => [r.col, r.raw, r.when_col, r.when_val, r.val].join('|')).sort());
  is(vm.join(' / ') === 'country|*|fab|F16S|GST TAIWAN SCRUBBER / customer|*|fab|F16S|Testco Memory Taiwan Co., Ltd.(F16S) / state||fab|F16S|반입완료',
    '저장 — «FAB=F16S 인 행»의 법인·고객사는 아무 값이든, 설비상태는 빈칸일 때만 (' + vm.join(' / ') + ')');
  await pg.waitForFunction(() => /규칙 3개/.test(document.getElementById('vmBox').innerText), null, { timeout:5000 });
  t = await rowTxt('F16S');
  is(!/법인 칸에 국가 이름/.test(t) && !/빈칸 2대/.test(t) && /반입 2/.test(t), '규칙을 입혀 다시 읽는다 — 경고가 사라지고 2대가 반입으로 (' + t.replace(/\s+/g, ' ').slice(0, 160) + ')');
  is(await pg.evaluate(() => window.__DB.sheet_inst.filter(r => r.fab === 'F16S').every(r => r.country === 'TAIWAN' && r.state == null)), '원본은 그대로다 — 규칙은 «읽을 때»만');
  /* 값별 보기 — 남은 «TAIWAN»(F11) 은 한 번에 «GST TAIWAN SCRUBBER» 로 */
  await pg.check('input[name=vmView][value=val]');
  await pg.waitForFunction(() => /원본 값/.test(document.getElementById('vmBox').innerText), null, { timeout:5000 });
  is(!!(await pg.$('[data-vmsug="TAIWAN"][data-to="GST TAIWAN SCRUBBER"]')), '값별 보기 — 법인 «TAIWAN» 에 «GST TAIWAN SCRUBBER 로 읽기» 단추');
  await pg.click('[data-vmsug="TAIWAN"]');
  await pg.waitForFunction(() => window.__DB.value_map.some(r => r.col === 'country' && r.raw === 'TAIWAN' && !r.when_col), null, { timeout:5000 });
  is(true, '한 번 누르면 «TAIWAN → GST TAIWAN SCRUBBER» 규칙(조건 없음)');
  /* core — 화면이 지나는 문(fetchCSVCached)과 같은 함수로 입혀 본다 */
  const ap = await pg.evaluate(() => {
    const S = GST.SM.SPEC.inst, H = Object.keys(S.fields).map(k => [].concat(S.fields[k])[0]);
    const row = o => H.map((h, i) => { const k = Object.keys(S.fields)[i]; return o[k] == null ? '' : o[k]; });
    const rows = [H, row({ sn:'A1', country:'TAIWAN', fab:'F16S', customer:'TESTCO' }), row({ sn:'A2', country:'GST TAIWAN SCRUBBER', fab:'F16', customer:'X', state:'Operation' }), row({ sn:'A3', country:'taiwan ', fab:'F11', customer:'TESTCO' })];
    const keep = JSON.stringify(rows);
    GST.vmap.rules = window.__DB.value_map.slice();   // 검사 이음새는 DB 경로를 끈다 — 화면이 저장한 규칙을 그대로 먹인다
    const a = GST.vmap.apply('inst', rows), m = GST.SM.map(a.rows, S), C = m.C;
    return { same: JSON.stringify(rows) === keep, n:a.n, cells:a.cells,
      r1:[a.rows[1][C.country], a.rows[1][C.customer], a.rows[1][C.state]], r2:a.rows[2] === rows[2], r3:a.rows[3][C.country] };
  });
  is(ap.same, 'core apply — 원본 배열을 고치지 않는다(캐시가 든 배열)');
  is(ap.r1.join('|') === 'GST TAIWAN SCRUBBER|Testco Memory Taiwan Co., Ltd.(F16S)|반입완료', '조건 규칙(FAB=F16S)이 먼저 — ' + ap.r1.join('|'));
  is(ap.r2, '규칙에 안 걸린 행은 같은 객체 그대로(복사 안 함)');
  is(ap.r3 === 'GST TAIWAN SCRUBBER', '대소문자·앞뒤 공백만 무시하고 맞춘다 — «taiwan » 도');
  /* 모든 화면이 지나는 문(fetchCSVCached) — 어느 길로 와도 규칙을 입힌다. 시트 경로를 흉내 낸다(검사 이음새는 DB 경로를 끈다). */
  const fc = await pg.evaluate(async () => {
    const S = GST.SM.SPEC.inst, ks = Object.keys(S.fields), H = ks.map(k => [].concat(S.fields[k])[0]);
    const row = o => ks.map(k => o[k] == null ? '' : o[k]);
    const raw = [H, row({ sn:'B1', country:'TAIWAN', fab:'F16S' }), row({ sn:'B2', country:'GST TAIWAN SCRUBBER', fab:'F16' })];
    const keep = GST.fetchCSV; GST.fetchCSV = async () => raw.map(r => r.slice());
    GST.vmap._p = Promise.resolve(GST.vmap.rules = window.__DB.value_map.slice());
    try {
      const r = await GST.fetchCSVCached(GST.sheetUrl ? GST.sheetUrl('891608329') : 'x?gid=891608329', 'vm_t');
      const C = GST.SM.map(r.rows, S).C;
      const w = await GST.fetchCSVCached('x?gid=646668307', 'vm_w');   // 다른 표(수선실적) — inst 규칙이 안 먹는다
      return { c1:r.rows[1][C.country], cu1:r.rows[1][C.customer], c2:r.rows[2][C.country], ap:JSON.stringify(GST.vmap.applied.inst), w:w.rows[1][C.country] };
    } finally { GST.fetchCSV = keep; }
  });
  is(fc.c1 === 'GST TAIWAN SCRUBBER' && /F16S/.test(fc.cu1) && fc.c2 === 'GST TAIWAN SCRUBBER', 'fetchCSVCached — 화면이 받는 행에 규칙이 입혀져 있다 (' + fc.c1 + ' · ' + fc.cu1 + ')');
  is(/"rows":1/.test(fc.ap), '몇 행·몇 칸을 바꿨는지 남긴다 (' + fc.ap + ')');
  is(fc.w === 'TAIWAN', '규칙은 그 표에만 — 수선실적으로 받은 같은 배열은 그대로');
  /* 지우기 */
  const nb = await pg.evaluate(() => window.__DB.value_map.length);
  await pg.click('[data-vmdel="0"]'); await waitDlg(pg, /규칙 지우기/); await pg.click('.mask .btn.dng');
  await pg.waitForFunction(n => window.__DB.value_map.length === n - 1, nb, { timeout:5000 }).catch(() => {});
  is(await pg.evaluate(n => window.__DB.value_map.length === n - 1, nb), '규칙 지우기 — 확인 뒤 지운다');
  is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}

console.log('[27] 조건으로 한 열 일괄 바꾸기 — FAB=F16N 이고 Turn-on 이 있는 행의 설비상태 (v154)');
{
  const s = seedOf({});
  const add = [
    { src_row:20, code:'ZN-1', sn:'ZZN-0001', country:'GST TAIWAN SCRUBBER', fab:'F16N', turn_on:'2026-03-02', state:null },
    { src_row:21, code:'ZN-2', sn:'ZZN-0002', country:'GST TAIWAN SCRUBBER', fab:'F16N', turn_on:'2026-04-10', state:'Set-up' },
    { src_row:22, code:'ZN-3', sn:'ZZN-0003', country:'GST TAIWAN SCRUBBER', fab:'F16N', turn_on:null, state:null },
    { src_row:23, code:'ZN-4', sn:'ZZN-0004', country:'GST TAIWAN SCRUBBER', fab:'F16N', turn_on:'', state:'Set-up' },
    { src_row:24, code:'ZN-5', sn:'ZZN-0005', country:'GST TAIWAN SCRUBBER', fab:'F16N', turn_on:'2026-05-01', state:'Operation' },
    { src_row:25, code:'ZN-6', sn:'ZZN-0006', country:'GST TAIWAN SCRUBBER', fab:'F16', turn_on:'2026-05-01', state:'Set-up' } ];
  s.tables.sheet_inst = s.tables.sheet_inst.concat(add.map(r => Object.assign(Object.fromEntries(INST_COLS.map(c => [c, null])), r)));
  const { ctx, pg, pe } = await open(s);
  await pg.click('.tab[data-tab=inst]'); await pg.waitForTimeout(400);
  const before = await pg.evaluate(() => JSON.stringify(window.__DB.sheet_inst));
  await pg.click('#search [data-act=cset]');
  await waitDlg(pg, /조건으로 일괄 바꾸기/);
  is(await pg.$eval('input[name=csScope][value=all]', e => e.checked) && await pg.$eval('input[name=csScope][value=sel]', e => e.disabled), '기본 범위는 표 전체 · 체크한 행이 없으면 그 칸은 잠긴다');
  /* 조건 없이 표 전체 — 막는다 */
  await pg.selectOption('#csCol', 'state'); await pg.fill('#csVal', 'Operation');
  await pg.click('.mask .btn.pri');
  await pg.waitForFunction(() => /조건을 하나 이상/.test(document.getElementById('snack').textContent), null, { timeout:5000 }).catch(() => {});
  is(/조건을 하나 이상/.test(await snackText(pg)), '조건 없이 표 전체를 한 값으로 덮는 것은 막는다');
  await waitDlg(pg, /조건으로 일괄 바꾸기 — 설치현황/);
  is(await pg.$eval('#csCol', e => e.value) === 'state' && await pg.$eval('#csVal', e => e.value) === 'Operation', '돌아와도 고른 값이 남아 있다');
  /* FAB = F16N · Turn-on 비어 있지 않음 */
  await pg.selectOption('[data-cs-c]', 'fab'); await pg.fill('[data-cs-v]', 'F16N');
  await pg.click('[data-cs-add]');
  const rows = await pg.$$('[data-cs]');
  await (await rows[1].$('[data-cs-c]')).selectOption('turn_on'); await (await rows[1].$('[data-cs-op]')).selectOption('set');
  is(await (await rows[1].$('[data-cs-v]')).evaluate(e => e.disabled), '「비어 있지 않음」은 값 칸을 잠근다');
  await qlog(pg);
  await pg.click('.mask .btn.pri');
  await waitDlg(pg, /미리 보기/);
  const L = await qlog(pg), q = sel(L, 'sheet_inst').find(x => x.or.length);
  is(q && q.or[0] === 'and(fab.eq."F16N",turn_on.neq."")', '서버 조건은 한 논리식 — FAB 같음 · Turn-on 빈칸 아님 (' + (q && q.or[0]) + ')');
  const pv = await pg.$eval('.mask .dlg-b', e => e.innerText);
  is(/바뀌는 행 2/.test(pv) && /이미 그 값 1/.test(pv), '미리 보기 — 바뀌는 2행 · 이미 Operation 인 1행 (' + pv.slice(0, 160).replace(/\n/g, ' ') + ')');
  is(/빈칸 1 · Set-up 1|Set-up 1 · 빈칸 1/.test(pv), '지금 값 분포를 적는다');
  is(rpcs(L, 'edit_bulk').length === 0 && await pg.evaluate(b => JSON.stringify(window.__DB.sheet_inst) === b, before), '미리 보기만으로는 쓰지 않는다');
  /* 조건 고치기로 돌아갔다 다시 */
  await pg.click('.mask .btn[data-i="0"]');
  await waitDlg(pg, /조건으로 일괄 바꾸기 — 설치현황/);
  is((await pg.$$('[data-cs]')).length === 2, '「조건 고치기」 — 두 조건이 그대로 남아 있다');
  await pg.click('.mask .btn.pri'); await waitDlg(pg, /미리 보기/);
  await pg.click('.mask .btn.dng');
  await pg.waitForFunction(() => /반영했습니다/.test(document.getElementById('snack').textContent), null, { timeout:8000 }).catch(() => {});
  const st = await pg.evaluate(() => Object.fromEntries(window.__DB.sheet_inst.filter(r => r.src_row >= 20).map(r => [r.src_row, r.state])));
  is(st[20] === 'Operation' && st[21] === 'Operation' && st[22] === null && st[23] === 'Set-up' && st[24] === 'Operation' && st[25] === 'Set-up',
    '조건에 맞는 행만 바뀐다 — Turn-on 빈칸(null·"")과 F16 은 그대로 (' + JSON.stringify(st) + ')');
  const bk = rpcs(await qlog(pg), 'edit_bulk');
  is(bk.length === 1 && bk[0].args.p_items.length === 2 && bk[0].args.p_items.every(x => x.op === 'update' && x.hash && Object.keys(x.changes).join() === 'state'),
    'edit_bulk 한 번 · 두 행 · 해시와 함께 · 그 열만');
  const head = await pg.evaluate(() => window.__DB.sheet_edits.filter(e => e.op === 'bulk').pop());
  is(head && /F16N.*Turn On.*비어 있지 않음.*설비상태 = Operation/.test(head.after.sheet || ''), '이력 머리에 «무엇을 했나»가 남는다 (' + (head && head.after.sheet) + ')');
  /* 체크한 행에서 — 비우기 */
  await pg.click('#search .btn.pri'); await pg.waitForTimeout(400);
  await pg.click('#list tr[data-key="20"] td.ck'); await pg.click('#list tr[data-key="21"] td.ck'); await pg.click('#list tr[data-key="25"] td.ck');
  await pg.click('#listH [data-act=cset]');
  await waitDlg(pg, /조건으로 일괄 바꾸기/);
  is(await pg.$eval('input[name=csScope][value=sel]', e => e.checked), '선택 막대에서 열면 범위가 «체크한 행»');
  await pg.selectOption('[data-cs-c]', 'fab'); await pg.fill('[data-cs-v]', 'F16N ');
  await pg.selectOption('#csCol', 'state'); await pg.check('#csClr');
  await pg.click('.mask .btn.pri'); await waitDlg(pg, /미리 보기/);
  is(/범위 3행 중 조건에 맞는 2행/.test(await pg.$eval('.mask .dlg-b', e => e.innerText)), '체크한 3행 안에서 조건(FAB=F16N)을 화면이 다시 건다 — 범위를 적는다');
  await pg.click('.mask .btn.dng');
  await pg.waitForFunction(() => window.__DB.sheet_inst.find(r => r.src_row === 20).state == null, null, { timeout:8000 }).catch(() => {});
  is(await pg.evaluate(() => { const g = k => window.__DB.sheet_inst.find(r => r.src_row === k).state; return g(20) == null && g(21) == null && g(24) === 'Operation' && g(25) === 'Set-up'; }),
    '「비우기」 — 체크했어도 조건에 안 맞는 F16 행은 그대로');
  is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}

console.log('[28] 데이터 품질 — 공수 허수를 찾아 «그 행»을 띄우고 고친다 · 탭 이름표 알림 (v155)');
{
  const s = seedOf({});
  const W = s.tables.sheet_wk, k1 = W[0].src_row, k2 = W[1].src_row;
  const { ctx, pg, pe } = await open(s);
  await ctx.addInitScript(([k1, k2]) => {
    window.__DQ = { rows:120, work24:2, endlt:0, future:0, manmis:1, mannull:7,
      spikes:[{ op:'GST TESTLAND SCRUBBER', wk:'2026-08-24', h:2989, base:955.1, n:277, nb:2 }] };
    window.__DQROWS = { work24:[k2, k1], 'spike|GST TESTLAND SCRUBBER|2026-08-24':[k1] };
    if (!sessionStorage.getItem('dqSeeded')) { sessionStorage.setItem('dqSeeded', '1');
      localStorage.setItem('gst_dq_fault', JSON.stringify({ at:Date.now() - 3 * 3600e3, filter:'단지 H1', items:[{ key:'a', sev:'warn', label:'미기재 3건', n:3, of:10, act:'행의 ✎로 채우세요' }] }));
      localStorage.removeItem('gst_dq_hr'); }
  }, [k1, k2]);
  /* 첫 화면(수선실적)에서 뒤에서 한 번 센다 → 탭 이름표 */
  await pg.goto(BASE + '/edit/', { waitUntil:'domcontentloaded' });
  await pg.waitForFunction(() => { const b = document.querySelector('.tab[data-tab=dq] .tbadge'); return b && !b.hidden; }, null, { timeout:8000 }).catch(() => {});
  is(await pg.evaluate(() => (document.querySelector('.tab[data-tab=dq] .tbadge') || {}).textContent) === '4', '탭 이름표에 «확인할 것» 수 — 24h 2 + 불일치 1 + 급증 1 (공수 빈칸은 안 센다)');
  await pg.click('.tab[data-tab=dq]');
  await pg.waitForFunction(() => /원장 점검/.test(document.getElementById('dqBox').innerText), null, { timeout:8000 });
  const box = await pg.$eval('#dqBox', e => e.innerText);
  is(/작업시간 24시간 초과\s+2/.test(box) && /작업종료일이 시작일보다 앞\s+0/.test(box), '점검별 건수를 적는다');
  is(/GST TESTLAND SCRUBBER/.test(box) && /W35/.test(box) && /3\.1배/.test(box), '주별 급증 — 운영단위·주(W35)·평소 대비 배수');
  is(/고장분석/.test(box) && /3시간 전/.test(box) && /단지 H1/.test(box) && /미기재 3건/.test(box), '화면 신호(옛 맨 아래 표)를 «언제·어떤 필터»와 함께 옮겨 왔다');
  is(/인원현황.*아직 한 번도 안 열었습니다/.test(box), '안 연 화면은 그렇게 적는다(0 으로 적으면 «문제 없음»으로 읽힌다)');
  is(await pg.evaluate(() => window.__DQN) === 1, '탭을 열어도 다시 세지 않는다(이미 센 것을 쓴다)');
  /* 행 보기 → 수선실적 탭 목록에 그 행이 공수 큰 순으로 · 첫 행이 열린다 */
  await qlog(pg);
  await pg.click('[data-dq=rows][data-k=work24]');
  await pg.waitForFunction(() => document.querySelectorAll('#list tbody tr').length === 2, null, { timeout:8000 }).catch(() => {});
  is(JSON.stringify(await listKeys(pg)) === JSON.stringify([String(k2), String(k1)]), '「행 보기」 — 수선실적 탭 목록에 그 행들이 서버가 준 순서 그대로 (' + (await listKeys(pg)) + ')');
  is(/데이터 품질 · 작업시간 24시간 초과 · 최근 400일 — 2행/.test(await pg.$eval('#listH', e => e.innerText)), '목록 머리에 무엇을 보고 있는지 적는다');
  await pg.waitForFunction(() => !!document.querySelector('#editor [data-col]'), null, { timeout:8000 }).catch(() => {});
  is(await pg.evaluate(k => !!document.querySelector('#list tr.on') && document.querySelector('#list tr.on').dataset.key === String(k), k2), '첫 행이 편집기에 열린다 — 바로 고친다');
  const L = await qlog(pg);
  is(rpcs(L, 'edit_dq_rows2').length === 1 && rpcs(L, 'edit_dq_rows2')[0].args.p_check === 'work24' && rpcs(L, 'edit_dq_rows2')[0].args.p_ops == null && /^\d{4}-\d\d-\d\d$/.test(rpcs(L, 'edit_dq_rows2')[0].args.p_from),
    'edit_dq_rows2(work24) 로 행 번호를 받는다 — 필터 없으면 운영단위 조건 없음 · 기간은 넘긴다');
  /* 고치기 — 그 탭의 편집 그대로(이력·되돌리기) */
  await setField(pg, 'd_end', '2026-08-28'); await pg.click('#editor [data-act=save]');
  await pg.waitForFunction(() => /저장했습니다/.test(document.getElementById('snack').textContent), null, { timeout:8000 }).catch(() => {});
  is(await pg.evaluate(k => window.__DB.sheet_wk.find(r => r.src_row === k).d_end === '2026-08-28', k2), '그 자리에서 고치면 표에 들어간다(edit_update · 이력)');
  /* 급증 → 그 운영단위·주의 행 */
  await pg.click('.tab[data-tab=dq]'); await pg.waitForFunction(() => /원장 점검/.test(document.getElementById('dqBox').innerText), null, { timeout:8000 });
  await pg.click('[data-dq=spike][data-i="0"]');
  await pg.waitForFunction(() => document.querySelectorAll('#list tbody tr').length === 1, null, { timeout:8000 }).catch(() => {});
  is(JSON.stringify(await listKeys(pg)) === JSON.stringify([String(k1)]) && /2026-08-24 주 공수 2,989h \(평소 955\.1h\)/.test(await pg.$eval('#listH', e => e.innerText)), '급증한 주 — 그 주의 행을 공수 큰 순으로');
  /* 다시 점검 */
  await pg.click('.tab[data-tab=dq]'); await pg.waitForFunction(() => /원장 점검/.test(document.getElementById('dqBox').innerText), null, { timeout:8000 });
  await pg.click('[data-dq=re]'); await pg.waitForFunction(() => window.__DQN === 2, null, { timeout:8000 }).catch(() => {});
  is(await pg.evaluate(() => window.__DQN) === 2, '「다시 점검」은 새로 센다');
  is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}
{
  const { ctx, pg, pe } = await open(seedOf({}), '/edit/?tab=dq');
  await pg.waitForFunction(() => /setup-21-dq\.sql/.test((document.getElementById('dqBox') || {}).innerText || ''), null, { timeout:8000 }).catch(() => {});
  is(await pg.evaluate(() => /setup-21-dq\.sql/.test(document.getElementById('dqBox').innerText) && !document.getElementById('pgDq').hidden),
    '?tab=dq 로 바로 열린다 · 서버에 점검 함수가 없으면 «무엇을 하면 되는지» 적는다');
  is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}

console.log('[29] 데이터 품질 — 구분·운영단위·기간 필터 · 작업공수 자동 채우기 · 설치현황 연결 길잡이 · 신호 → 고칠 자리 (v156)');
{
  const s = seedOf({});
  const W = s.tables.sheet_wk;
  /* 지어낸 값 — 국내(SEC)·해외(GST) 운영단위 하나씩. 공수 빈칸 셋 중 둘만 «시간 × 인원»으로 채울 수 있다 */
  Object.assign(W[0], { op:'SEC Scrubber', work_min:'30', worker_cnt:'2', man_min:null });
  Object.assign(W[1], { op:'GST TESTLAND SCRUBBER', work_min:'45', worker_cnt:'3', man_min:null });
  Object.assign(W[2], { op:'GST TESTLAND SCRUBBER', work_min:'50', worker_cnt:null, man_min:null });
  Object.assign(W[3], { op:'SEC Scrubber', work_min:'20', worker_cnt:'1', man_min:'20' });
  const { ctx, pg, pe } = await open(s);
  await ctx.addInitScript(() => {
    window.__DQ = { rows:120, work24:2, endlt:0, future:0, manmis:1, mannull:3, mfill:2,
      by_op:[{ op:'GST TESTLAND SCRUBBER', rows:100, work24:2, endlt:0, future:0, manmis:0, mannull:2, mfill:1 },
             { op:'SEC Scrubber', rows:20, work24:0, endlt:0, future:0, manmis:1, mannull:1, mfill:1 }],
      spikes:[{ op:'GST TESTLAND SCRUBBER', wk:'2026-08-24', h:2989, base:955.1, n:277, nb:2 }] };
    window.__DQROWS = { manmis:[3] };
    window.__DQJ = { rows:120,
      by_op:[{ op:'GST TESTLAND SCRUBBER', rows:100, nokey:0, miss:99, nodiv:1, nofloor:0 },
             { op:'SEC Scrubber', rows:20, nokey:1, miss:3, nodiv:2, nofloor:1 }],
      miss_top:[{ op:'GST TESTLAND SCRUBBER', eq:'ZQ-900', sn:'ZZT-0900', n:50 }, { op:'SEC Scrubber', eq:'ZQ-009', sn:'ZZT-0009', n:3 }],
      inst_refs:[{ ir:1, op:'SEC Scrubber', n:2, nd:2, nf:0 }, { ir:2, op:'SEC Scrubber', n:1, nd:0, nf:1 }] };
    window.__DQJR = { 'miss|SEC Scrubber|ZZT-0009':[5, 0], 'nokey|SEC Scrubber':[6] };
    if (!sessionStorage.getItem('dqSeeded2')) { sessionStorage.setItem('dqSeeded2', '1');
      localStorage.removeItem('gst_edit_dqf');
      localStorage.setItem('gst_dq_fault', JSON.stringify({ at:Date.now() - 600e3, filter:'', items:[
        { key:'wk_blank', sev:'warn', label:'BM 미기재 3/3', n:3, of:3, act:'채우세요' },
        { key:'floor_na', sev:'info', label:'Floor 미상', n:9, of:10, act:'설치현황 S/N' }] })); }
  });
  await pg.goto(BASE + '/edit/?tab=dq', { waitUntil:'domcontentloaded' });
  await pg.waitForFunction(() => /원장 점검/.test(document.getElementById('dqBox').innerText), null, { timeout:8000 });
  const tx = () => pg.$eval('#dqBox', e => e.innerText);
  /* 필터 — 구분 국내 */
  await pg.selectOption('[data-dqf=reg]', 'kr');
  await pg.waitForFunction(() => /\(국내 · 최근 400일\)/.test(document.getElementById('dqBox').innerText), null, { timeout:8000 }).catch(() => {});
  let b = await tx();
  is(/작업시간 24시간 초과\s+0/.test(b) && /작업공수 ≠ 작업시간 × 작업자수\s+1/.test(b) && /20행/.test(b), '구분 «국내» — 운영단위별 건수를 국내만 더한다 (24h 0 · 불일치 1 · 20행)');
  is(/필터로 1주 숨김/.test(b) && !/2,989/.test(b), '주별 급증도 거른다 — 해외 운영단위의 급증은 숨기고 그렇다고 적는다');
  is(await pg.$$eval('[data-dqf=op] option', o => o.map(x => x.value).join('|')) === '|SEC Scrubber', '운영단위 목록도 구분을 따라 좁혀진다');
  await qlog(pg);
  await pg.click('[data-dq=rows][data-k=manmis]');
  await pg.waitForFunction(() => document.querySelectorAll('#list tbody tr').length === 1, null, { timeout:8000 }).catch(() => {});
  let L = await qlog(pg);
  is(rpcs(L, 'edit_dq_rows2').length === 1 && JSON.stringify(rpcs(L, 'edit_dq_rows2')[0].args.p_ops) === '["SEC Scrubber"]', '「행 보기」가 필터의 운영단위를 서버에 넘긴다 (' + JSON.stringify(rpcs(L, 'edit_dq_rows2').map(x => x.args.p_ops)) + ')');
  /* 기간 — 서버가 다시 센다 */
  await pg.click('.tab[data-tab=dq]'); await pg.waitForFunction(() => /원장 점검/.test(document.getElementById('dqBox').innerText), null, { timeout:8000 });
  await qlog(pg);
  await pg.selectOption('[data-dqf=days]', '90');
  await pg.waitForFunction(() => /최근 90일/.test(document.getElementById('dqBox').innerText), null, { timeout:8000 }).catch(() => {});
  L = await qlog(pg);
  const ago = d => { const x = new Date(); x.setDate(x.getDate() - d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  is(rpcs(L, 'edit_dq').some(x => x.args.p_from === ago(90)), '기간 «최근 90일» → edit_dq(p_from = 오늘−90일) 로 다시 센다');
  is(await pg.evaluate(() => JSON.parse(localStorage.getItem('gst_edit_dqf')).days) === '90', '필터는 다음에 열어도 남는다');
  await pg.click('[data-dq=fclr]'); await pg.waitForTimeout(200);
  /* 작업공수 자동 채우기 */
  b = await tx();
  is(/자동 채우기 2행/.test(b), '공수 빈칸 줄에 «자동 채우기 2행» — 시간·인원이 다 있는 행만 센다');
  await pg.click('[data-dq=fill]');
  await pg.waitForFunction(() => /작업공수 자동 채우기 — 미리 보기/.test(document.body.innerText), null, { timeout:8000 }).catch(() => {});
  const pv = await pg.evaluate(() => document.querySelector('.dlg, dialog, .modal') ? (document.querySelector('.dlg, dialog, .modal')).innerText : document.body.innerText);
  is(/채우는 행 2/.test(pv) && /\b60\b/.test(pv) && /\b135\b/.test(pv), '미리 보기 — 30분×2=60 · 45분×3=135');
  await qlog(pg);
  await pg.click('button.dng:has-text("2행 채우기")');
  await pg.waitForFunction(() => /반영했습니다/.test(document.getElementById('snack').textContent), null, { timeout:8000 }).catch(() => {});
  const g = k => pg.evaluate(k => { const r = window.__DB.sheet_wk.find(x => x.src_row === k); return r.man_min; }, k);
  is(await g(W[0].src_row) === '60' && await g(W[1].src_row) === '135', '반영 — 빈 작업공수 = 작업시간 × 작업자수');
  is(await g(W[2].src_row) == null && await g(W[3].src_row) === '20', '작업자수가 빈 행은 짐작하지 않고, 이미 적힌 공수는 손대지 않는다');
  L = await qlog(pg);
  is(rpcs(L, 'edit_bulk').length === 1 && rpcs(L, 'edit_bulk')[0].args.p_note.file === '작업공수 자동 채우기', '쓰기는 edit_bulk 한 통로 — 이력 머리에 «작업공수 자동 채우기»');
  /* 설치현황 연결 길잡이 */
  await pg.waitForFunction(() => /설치현황 연결/.test(document.getElementById('dqBox').innerText) && /ZZT-0009/.test(document.getElementById('dqBox').innerText), null, { timeout:8000 }).catch(() => {});
  b = await tx();
  is(/설치현황에 거의 없습니다/.test(b) && /설치현황 원본 올리기/.test(b), '법인 통째로 안 이어지면 «행을 고칠 일이 아니라 원본을 올리라»고 적는다');
  is(/해외 설치현황 양식에는 사업부 열이 없습니다/.test(b), '해외의 사업부 빈칸은 «고칠 것 아님»으로 적는다');
  is(/ZZT-0009/.test(b) && !/ZZT-0900/.test(b), '안 이어진 설비 목록 — 통째로 빠진 법인의 설비는 접어 둔다');
  await qlog(pg);
  await pg.click('[data-dq=jmrow]');
  await pg.waitForFunction(() => document.querySelectorAll('#list tbody tr').length === 2, null, { timeout:8000 }).catch(() => {});
  L = await qlog(pg);
  const jr = rpcs(L, 'edit_dq_join_rows')[0];
  is(jr && jr.args.p_kind === 'miss' && jr.args.p_sn === 'ZZT-0009' && jr.args.p_eq === 'ZQ-009' && JSON.stringify(await listKeys(pg)) === '["5","0"]', '「실적 행 보기」— 그 S/N 의 안 이어진 실적 행 (' + (await listKeys(pg)) + ')');
  await pg.click('.tab[data-tab=dq]'); await pg.waitForFunction(() => /설치현황 행 열기/.test(document.getElementById('dqBox').innerText), null, { timeout:8000 });
  await pg.click('[data-dq=jidiv]');
  await pg.waitForFunction(() => /사업부 빈 설비/.test(document.getElementById('listH').innerText), null, { timeout:8000 }).catch(() => {});
  is(await pg.evaluate(() => document.querySelector('.tab.on').dataset.tab) === 'inst' && JSON.stringify(await listKeys(pg)) === '["1"]', '「설치현황 행 열기」— 사업부가 빈 설치현황 행을 설치현황 탭에 (' + (await listKeys(pg)) + ')');
  /* 화면 신호 → 고칠 자리 */
  await pg.click('.tab[data-tab=dq]'); await pg.waitForFunction(() => /알람유형 빈 BM 행 찾기/.test(document.getElementById('dqBox').innerText), null, { timeout:8000 });
  await qlog(pg);
  await pg.click('[data-dq=fix][data-fx="fault.wk_blank"]');
  await pg.waitForFunction(() => document.querySelector('.tab.on').dataset.tab === 'wk' && document.querySelectorAll('#list tbody tr').length > 0, null, { timeout:8000 }).catch(() => {});
  L = sel(await qlog(pg), 'sheet_wk');
  is(L.length && L[L.length - 1].or[0] === 'and(stage.eq."BM",or(alarm.is.null,alarm.eq.""))' && (await listKeys(pg)).join() === '6,5,0',
    '「알람유형 빈 BM 행 찾기」— 수선실적 탭에 조건을 채워 검색한다 (' + (await listKeys(pg)) + ')');
  is(await pg.$$eval('#search [data-sc]', e => e.length) === 2 && await pg.$eval('#search [data-sc] [name=ocol]', e => e.value) === 'stage', '검색 칸에 그 조건이 보인다 — 사람이 보고 고칠 수 있다');
  is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}
{ /* ?fix=… — 각 화면 품질 팝업의 「찾아서 고치기」가 연결 길잡이로 바로 */
  const { ctx, pg, pe } = await open(seedOf({}));
  await ctx.addInitScript(() => { window.__DQ = { rows:1, work24:0, endlt:0, future:0, manmis:0, mannull:0, spikes:[], by_op:[] };
    window.__DQJ = { rows:1, by_op:[{ op:'SEC Scrubber', rows:1, nokey:0, miss:0, nodiv:0, nofloor:1 }], miss_top:[], inst_refs:[] }; });
  await pg.goto(BASE + '/edit/?tab=dq&fix=material.floor_na', { waitUntil:'domcontentloaded' });
  await pg.waitForFunction(() => window.__DQJN >= 1 && /Floor 빈칸/.test(document.getElementById('dqBox').innerText), null, { timeout:8000 }).catch(() => {});
  const L = await qlog(pg);
  is(rpcs(L, 'edit_dq_join').some(x => x.args.p_tbl === 'sheet_mat') && await pg.$eval('[data-dqf=jt]', e => e.value) === 'mat', '?fix=material.floor_na → 자재실적의 설치현황 연결을 연다');
  is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}

console.log('[30] CIP F11 · F16 도 다른 표처럼 탭이다 — 찾기 · 한 행 고치기 · 점검 항목 열 · 엑셀 올리기는 CIP 업로드로 (v159)');
{
  const CC = ['NO','Country','Customer','FAB','Floor','Model','Scrubber S/N','Scrubber Code','FAB In','Valve Fix','Remark','id','New Item Alpha'];
  const cip = [{ id:1, NO:'1', Country:'TAIWAN', Customer:'TESTCO', FAB:'F16', Floor:'A1', Model:'M-1', 'Scrubber S/N':'ZZC-0001', 'Scrubber Code':'C-1', 'FAB In':'2020-01-02', 'Valve Fix':'Not yet', Remark:null, 'New Item Alpha':'N/A' },
               { id:2, NO:'2', Country:'TAIWAN', Customer:'TESTCO', FAB:'F16', Floor:'B2', Model:'M-2', 'Scrubber S/N':'ZZC-0002', 'Scrubber Code':'C-2', 'FAB In':'2020-01-03', 'Valve Fix':'2026-02-03', Remark:null, 'New Item Alpha':'Not yet' }];
  const sd = seedOf({}); sd.tables.sheet_cip_f16 = cip; sd.tables.sheet_cip_f11 = []; sd.cols.sheet_cip_f16 = CC; sd.cols.sheet_cip_f11 = CC.filter(c => c !== 'New Item Alpha');
  sd.types.sheet_cip_f16 = { id:'bigint' }; sd.types.sheet_cip_f11 = { id:'bigint' };
  const { ctx, pg, pe } = await open(sd);
  is(await pg.evaluate(() => !document.getElementById('toCip')), '머리의 따로 선 「CIP 현황 올리기」 단추는 없다 (입구는 탭 하나)');
  is(await pg.evaluate(() => ['cip11','cip16'].every(id => { const b = document.querySelector('.tab[data-tab=' + id + ']'); return b && b.getBoundingClientRect().width > 0; })), '탭 줄에 「CIP F11」·「CIP F16」');
  await pg.click('.tab[data-tab=cip16]'); await pg.waitForTimeout(400);
  is((await listKeys(pg)).sort().join() === '1,2', 'CIP F16 표를 통째로 받아 목록에 (2행)');
  await pg.fill('#search [name=sn]', 'zzc 0002'); await pg.click('#search button[type=submit]'); await pg.waitForTimeout(200);
  is((await listKeys(pg)).join() === '2', 'S/N 로 찾는다 (하이픈·대소문자 무시)');
  await pg.click('#list tr[data-key="2"]'); await pg.waitForTimeout(250);
  const gh = await pg.$$eval('#editor .grp-h', hs => hs.map(h => h.textContent));
  is(gh.some(t => /^설비/.test(t)) && gh.some(t => /점검 항목/.test(t)), '편집기 묶음 — 설비 · 점검 항목 (' + gh.join(' / ') + ')');
  is(await pg.$$eval('#editor [data-col]', es => es.map(e => e.dataset.col)).then(c => c.includes('New Item Alpha') && c.includes('Valve Fix')), '더한 항목 열(New Item Alpha)도 고칠 칸으로 선다');
  await setField(pg, 'New Item Alpha', '2026-05-06');
  await qlog(pg);
  await pg.click('#editor [data-act=save]'); await pg.waitForTimeout(300);
  const up = rpcs(await qlog(pg), 'edit_update')[0];
  is(up && up.args.p_tbl === 'sheet_cip_f16' && up.args.p_key === 2 && up.args.p_changes['New Item Alpha'] === '2026-05-06', '한 행 수정 → edit_update(sheet_cip_f16, id)');
  is(await pg.evaluate(() => /통째 교체/.test(document.getElementById('editor').innerText)), '«양식을 다시 올리면 덮인다»를 편집기에 적는다');
  is(await pg.evaluate(() => UP_RID.cip16 === 'cipf16' && UP_RID.cip11 === 'cipf11'), '「엑셀 올리기」의 원본 교체는 CIP 업로드(cipf11·cipf16)로 간다');
  is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
  const k = await open(Object.assign(seedOf({}), {}), '/edit/?site=KR');
  is(await k.pg.evaluate(() => !document.querySelector('.tab[data-tab=cip11]') && !document.querySelector('.tab[data-tab=cip16]')), '국내 데모 모드에는 CIP 탭이 없다 (데모 표가 없다)');
  await k.ctx.close();
}

console.log('[31] 사이트 등록부 — 새 사이트를 먼저 정의하고 · CIP 표를 만들고 · 설치현황 S/N 로 행을 만들고 · 점검 항목을 더한다 (v160)');
{
  const sd = seedOf({});
  sd.tables.site_registry = [{ fab:'F11', label:'MICRON F11', cip_table:'sheet_cip_f11', region:'해외' }, { fab:'F16', label:'MICRON F16', cip_table:'sheet_cip_f16', region:'해외' }];
  sd.tables.value_map = []; sd.tables.sheet_cip_f11 = []; sd.tables.sheet_cip_f16 = [];
  const CB = ['id','NO','Country','Customer','FAB','Floor','Model','Scrubber S/N','Scrubber Code','FAB In','Remark'];
  sd.cols.sheet_cip_f11 = CB; sd.cols.sheet_cip_f16 = CB; sd.types.sheet_cip_f11 = sd.types.sheet_cip_f16 = { id:'bigint' };
  const iN = sd.tables.sheet_inst.length;
  [{ code:'ZF-1', sn:'ZZF-0001', country:'TAIWAN', customer:'MICRON', fab:'F18', floor:'A1', model:'MF-1', state:'Operation', fab_in:'2026-09-01' },
   { code:'ZF-2', sn:'ZZF-0002', country:'TAIWAN', customer:'MICRON', fab:'F18', floor:'A2', model:'MF-1', state:'Set-up' },
   { code:'ZF-3', sn:'ZZF-0003', country:'TAIWAN', customer:'MICRON', fab:'F18', floor:'A2', model:'MF-1', state:'반납' },
   { code:'ZF-4', sn:null, country:'TAIWAN', customer:'MICRON', fab:'F18', floor:'A3', model:'MF-1', state:'Operation' }]
    .forEach((r, i) => sd.tables.sheet_inst.push(full(INST_COLS, Object.assign({ src_row:iN + i }, r))));
  /* v161 — 같은 사이트가 실적·인원에도 있다(표마다 «사이트 칸»이 다르다: 실적 «라인» · 인원 «단지») */
  const wN = sd.tables.sheet_wk.length;
  sd.tables.sheet_wk.push(full(WK_COLS, { src_row:100, rs_code:'RS-T-F18A', d_start:'2026-09-01', op:'TAIWAN', customer:'MICRON', line:'F18', stage:'BM', sn_in:'ZZF-0001' }),
                         full(WK_COLS, { src_row:101, rs_code:'RS-T-F18B', d_start:'2026-09-02', op:'TAIWAN', customer:'MICRON', line:'F18', stage:'TBM', sn_in:'ZZF-0002' }));
  sd.tables.sheet_roster.push(full(ROS_COLS, { id:9, '사원번호':'9100009', '이름(영문)':'Tester Nine', '단지':'F18', '운영단위':'TAIWAN', '고객사':'MICRON', '입사일':'2026-01-02' }));
  const { ctx, pg, pe } = await open(sd);
  await pg.click('.tab[data-tab=site]'); await pg.waitForFunction(() => /FAB/.test((document.getElementById('siteBox') || {}).innerText || ''), null, { timeout:8000 });
  const tx = () => pg.$eval('#siteBox', e => e.innerText);
  is(/F11/.test(await tx()) && /F16/.test(await tx()) && !/F18/.test(await tx()), '등록된 사이트만 먼저 (F11·F16) — 설치현황의 다른 FAB 은 접어 둔다');
  await pg.check('#stAll'); await pg.waitForTimeout(150);
  is(/F18/.test(await tx()), '「다른 FAB 도 보기」 → 설치현황의 F18 (4대) 이 «등록» 단추와 함께 선다');
  await pg.click('[data-st=new]'); await waitDlg(pg, /새 사이트 등록/);
  await pg.fill('#stFab', 'f18'); await pg.click('.mask .btn.pri');
  await waitDlg(pg, /F18/);
  is(/설치현황 4대 · 수선실적 2행 · 자재실적 0행 · 인원현황 1명/.test(await dlgBody(pg)), '정의 창이 표마다 그 사이트로 잡힌 행을 센다 (설치 FAB · 실적 라인 · 인원 단지)');
  await pg.fill('[data-sf=label]', 'MICRON F18'); await pg.fill('[data-sf=op]', 'GST TAIWAN SCRUBBER'); await pg.dispatchEvent('[data-sf=op]', 'input');
  await pg.uncheck('[data-stt=mat]');
  is(/해외/.test(await pg.$eval('#stMean', e => e.textContent)), '운영단위를 적으면 «대시보드가 읽는 구분»을 그 자리에서 보여 준다 (정본 판정)');
  await pg.fill('[data-sf=customer]', 'TESTCO F18'); await pg.click('.mask .btn.pri'); await pg.waitForTimeout(700);
  const reg = await pg.evaluate(() => (window.__DB.site_registry || []).find(x => x.fab === 'F18'));
  is(reg && reg.op === 'GST TAIWAN SCRUBBER' && reg.label === 'MICRON F18' && reg.region === '해외' && !reg.cip_table, '등록부에 한 줄 (코드는 대문자 · 구분은 정본 판정으로)');
  const vm = await pg.evaluate(() => window.__DB.value_map.filter(r => r.when_val === 'F18').map(r => r.tbl + '.' + r.when_col + ':' + r.col + '=' + r.val).sort().join('|'));
  is(vm === ['inst.fab:country=GST TAIWAN SCRUBBER', 'inst.fab:customer=TESTCO F18', 'roster.campus:customer=TESTCO F18', 'roster.campus:op=GST TAIWAN SCRUBBER',
             'wk.line:customer=TESTCO F18', 'wk.line:op=GST TAIWAN SCRUBBER'].join('|'),
     '정의가 표마다 «기준 정보» 규칙으로 저장된다 — 설치(FAB) · 수선(라인) · 인원(단지) · 끈 자재는 안 건다 (' + vm + ')');
  /* 규칙이 실제로 «먹는지» — core 가 인원현황에도 입힌다(fetchCSVCached 와 같은 함수) */
  const ap = await pg.evaluate(() => { GST.vmap.rules = window.__DB.value_map.slice();
    const R = [['사원번호','이름(영문)','단지','운영단위','고객사','입사일'], ['9100009','Tester Nine','F18','TAIWAN','MICRON','2026-01-02'], ['9100001','Tester One','Q1','OPX Scrubber','TESTCO','2024-01-02']];
    const a = GST.vmap.apply('roster', R); return { op:a.rows[1][3], cu:a.rows[1][4], other:a.rows[2][3], same:R[1][3] }; });
  is(ap.op === 'GST TAIWAN SCRUBBER' && ap.cu === 'TESTCO F18' && ap.other === 'OPX Scrubber' && ap.same === 'TAIWAN', '인원현황에도 규칙이 먹는다 — 그 사이트 사람만 · 원본 배열은 그대로');
  is(await pg.evaluate(() => GST.VMAP_GID['1213453343'] === 'roster' && !!GST.vmap.spec('roster') && !GST.SM.SPEC.roster), '인원 규칙은 fetchCSVCached 의 gid 지도로 걸린다 (인원 스펙은 SM.SPEC 밖 — 미러로 오인 안 됨)');
  await pg.click('[data-st=def][data-f=F18]'); await waitDlg(pg, /사이트 정의/);
  is(await pg.evaluate(() => document.querySelector('[data-stt=mat]').checked === false && document.querySelector('[data-stt=wk]').checked === true), '다시 열면 «어느 자료에 걸었나»를 기억한다 (자재는 꺼진 채)');
  await pg.click('.mask .btn'); await pg.waitForTimeout(150);
  await pg.click('[data-st=cip][data-f=F18]'); await waitDlg(pg, /CIP 표 만들기/); await pg.click('.mask .btn.pri'); await pg.waitForTimeout(500);
  is(await pg.evaluate(() => !!document.querySelector('.tab[data-tab=cip_f18]') && UP_RID.cip_f18 === 'cip_f18'), 'CIP 표를 만들면 탭 줄에 「CIP F18」 · 원본 교체는 업로드의 cip_f18 로');
  await qlog(pg);
  await pg.click('[data-st=seed][data-f=F18]'); await waitDlg(pg, /설치현황에서 CIP 행 만들기/);
  const body = await dlgBody(pg);
  is(/3대/.test(body) && /빈칸 1대/.test(body) && /나간 설비/.test(body), '미리 보기 — CIP 에 없는 S/N 3대 · S/N 빈칸 1대는 안 넣음 · 나간 설비는 고를 수 있다');
  await pg.click('.mask .btn.pri'); await pg.waitForTimeout(500);
  const bk = rpcs(await qlog(pg), 'edit_bulk')[0];
  const rows = bk ? bk.args.p_items.map(x => x.row) : [];
  is(bk && bk.args.p_tbl === 'sheet_cip_f18' && rows.length === 2 && rows.every(r => r.FAB === 'F18' && r['Scrubber S/N'] && r.Floor && r.Model === 'MF-1')
     && rows.map(r => r['Scrubber S/N']).join() === 'ZZF-0001,ZZF-0002', '설치현황 → edit_bulk 새 행 2개 (반납 1대는 기본으로 뺀다 · 같은 이름의 칸만 옮긴다)');
  is(rows[0] && rows[0]['FAB In'] === '2026-09-01' && rows[0].NO === '1', 'FAB In 과 순번(NO)도 옮긴다');
  await pg.click('[data-st=seed][data-f=F18]'); await waitDlg(pg, /설치현황에서 CIP 행 만들기/);
  is(/새로 넣을 설비가 없습니다|1대/.test(await dlgBody(pg)), '다시 누르면 이미 든 S/N 은 빼고 센다');
  await pg.click('.mask .btn'); await pg.waitForTimeout(150);
  await pg.click('[data-st=item][data-f=F18]'); await waitDlg(pg, /점검 항목 더하기/);
  await pg.fill('#stItems', 'Valve Kit Left\nValve Kit Right\n'); await pg.click('.mask .btn.pri'); await pg.waitForTimeout(400);
  const ia = rpcs(await qlog(pg), 'import_add_cols')[0];
  is(ia && ia.args.p_tbl === 'sheet_cip_f18' && ia.args.p_cols.join('|') === 'Valve Kit Left|Valve Kit Right', '점검 항목 더하기 → import_add_cols (한 줄에 하나 · 빈 줄 무시)');
  await pg.click('.mask .btn'); await pg.waitForTimeout(150);
  await pg.click('.tab[data-tab=cip_f18]'); await pg.waitForTimeout(500);
  is((await listKeys(pg)).length === 2, 'CIP F18 탭이 그 표를 보여 준다 (2행)');
  is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
  /* 등록부를 못 읽으면(정책 미적용 — 읽기가 0행) 말하며 잠근다. 옛 F11·F16 탭은 그대로 선다. */
  const sd2 = seedOf({}); sd2.tables.sheet_cip_f11 = []; sd2.tables.sheet_cip_f16 = []; sd2.cols.sheet_cip_f11 = sd2.cols.sheet_cip_f16 = CB;
  const b = await open(sd2);
  is(await b.pg.evaluate(() => !!document.querySelector('.tab[data-tab=cip11]') && !!document.querySelector('.tab[data-tab=cip16]')), '등록부가 비어도 옛 CIP F11·F16 탭은 그대로');
  await b.pg.click('.tab[data-tab=site]'); await b.pg.waitForTimeout(600);
  is(await b.pg.evaluate(() => /setup-23-sites\.sql/.test(document.getElementById('siteBox').innerText) && Array.from(document.querySelectorAll('#siteBox [data-st=def]')).every(x => x.disabled)),
     '등록부를 못 읽으면 «무엇을 하면 되는지»(setup-23 Run) 적고 정의 단추를 잠근다');
  await b.ctx.close();
}

console.log('[32] 화면 신호 — 국내 원장·뺀 인원도 «그 행»을 띄운다 · 데이터 품질 필터가 신호에도 걸린다 · S/N 메뉴가 끼어들지 않는다 (v162)');
{
  const sd = seedOf({});
  /* K운영 알람 한 줄(ZZA-0003)만 설치현황에 이어 둔다 — 나머지 국내 원장 행(알람 0·1 · 올바 0)이 «안 이어진» 행이다. 해외 올바(GST TAIWAN)는 국내 신호가 아니다. */
  sd.tables.sheet_inst.push(full(INST_COLS, { src_row:50, code:'ZQ-A3', sn:'ZZA0003', country:'SEC Scrubber', customer:'TESTCO', fab:'K1-A' }));
  sd.tables.sheet_roster.push(full(ROS_COLS, { id:20, '사원번호':'9100020', '이름(영문)':'Tester Head', '단지':'Q1', '업무/직책':'단지장', '현장 인원여부':'O', '입사일':'2020-01-01' }),
                              full(ROS_COLS, { id:21, '사원번호':'9100021', '이름(영문)':'Tester Gone', '단지':'Q1', '업무/직책':'팀장', '현장 인원여부':'O', '입사일':'2020-01-01', '퇴사일':'2025-01-01' }));
  const { ctx, pg, pe } = await open(sd);
  await ctx.addInitScript(() => {
    window.__DQ = { rows:0, work24:0, endlt:0, future:0, manmis:0, mannull:0, spikes:[] };
    if (!sessionStorage.getItem('dq32')) { sessionStorage.setItem('dq32', '1'); localStorage.removeItem('gst_edit_dqf');
      localStorage.setItem('gst_dq_report', JSON.stringify({ at:Date.now() - 600e3, filter:'전체', items:[
        { key:'div_join', sev:'info', label:'국내 실적 행에 사업부가 안 붙었습니다', n:5, of:9, act:'데이터 관리 › 데이터 품질 › 설치현황 연결에서 어느 운영단위·S/N 인지 보고 고치세요' },
        { key:'kr_join', sev:'info', label:'국내 원장 행이 설치현황과 안 이어졌습니다', n:3, of:6, act:'원장의 SEQP S/N 표기를 설치현황 S/N 과 맞추세요' },
        { key:'head_ex', sev:'info', label:'공수 분모에서 뺀 인원 — 단지장 1명', n:1, act:'인원현황의 직책·단지·라인 값을 확인하세요' } ] })); }
  });
  await pg.goto(BASE + '/edit/?tab=dq', { waitUntil:'domcontentloaded' });
  await pg.waitForFunction(() => /국내 원장 행이 설치현황과/.test((document.getElementById('dqBox') || {}).innerText || ''), null, { timeout:10000 });
  /* 머리 줄 없는 표의 첫 줄 «…S/N 인지…» 가 S/N 머리글로 읽혀 그 열 전체에 설비 메뉴가 붙던 자리 */
  const actTd = await pg.evaluateHandle(() => Array.from(document.querySelectorAll('#dqBox td')).find(td => /SEQP S\/N 표기/.test(td.textContent)));
  await actTd.asElement().click(); await pg.waitForTimeout(200);
  is(await pg.evaluate(() => !document.getElementById('gstSnMenu')), '신호의 «무엇을 하면 되나» 칸을 눌러도 설비(S/N) 메뉴가 뜨지 않는다');
  await pg.click('[data-fx="report.kr_join"]'); await pg.waitForTimeout(900);
  is(await pg.evaluate(() => S.tab) === 'alarm' && (await listKeys(pg)).sort().join() === '0,1', '「안 이어진 원장 행 보기」 → 알람 탭에 안 이어진 국내 행만 (이어진 K 행은 빠진다)');
  is(/올바이패스에도 1행/.test(await snackText(pg)), '올바이패스 쪽에도 있으면 알리고 단추로 연다');
  await pg.click('#snack button'); await pg.waitForTimeout(600);
  is(await pg.evaluate(() => S.tab) === 'abp' && (await listKeys(pg)).join() === '0', '올바이패스 탭 — 국내 행만 (해외 올바는 국내 신호에 안 든다)');
  await pg.click('.tab[data-tab=dq]'); await pg.waitForTimeout(500);
  await pg.click('[data-fx="report.head_ex"]'); await pg.waitForTimeout(700);
  is(await pg.evaluate(() => S.tab) === 'roster' && (await listKeys(pg)).join() === '20', '「뺀 인원 보기」 → 인원현황에 단지장(현장·재직)만 — 퇴사한 팀장은 빠진다 (GST.HEAD_EX 그대로)');
  await pg.click('.tab[data-tab=dq]'); await pg.waitForTimeout(500);
  await pg.selectOption('[data-dqf=reg]', 'os'); await pg.waitForTimeout(700);
  const box = await pg.$eval('#dqBox', e => e.innerText);
  is(!/국내 원장 행이 설치현황과/.test(box) && !/국내 실적 행에 사업부/.test(box) && /공수 분모에서 뺀 인원/.test(box) && /해당 없는 신호 2개는 숨겼습니다/.test(box),
     '구분 해외로 걸면 국내 신호(원장·국내 실적)는 숨기고 몇 개 숨겼는지 적는다');
  is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
  await ctx.close();
}

await browser.close();
srv.close();
console.log(fail ? `\n❌ t-edit: ${pass} 통과 · ${fail} 실패` : `\n✅ t-edit: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
