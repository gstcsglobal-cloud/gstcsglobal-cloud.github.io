/* DB 쓰기 어댑터 (v80) — hr 의 편집·추가·삭제가 Import 표에 옳게 쓰는지.
 *
 * GST.dbWrite 는 sheet-write 의 op 규약(perm·row·update·append·delete)을 흉내낸다.
 * 여기서 지키는 것:
 *   · 논리 필드(posKo 등)가 표의 실제 열 이름(직급 등)으로 번역되는지
 *   · 행 지정이 «정확히 한 행»일 때만 쓰는지 (0행 not_found · 2행 dup_key)
 *   · 낙관적 잠금 — 지문이 다르면 409 conflict 로 페이지의 충돌 UI 가 뜨는지
 *   · 사번/이름 변경이 교육 표로 캐스케이드되는지 (조인 보존)
 *   · 없어진 열(join·role 등)을 append 가 표에 밀어넣지 않는지
 *     — 모의 클라이언트가 PostgREST 처럼 미지의 컬럼을 거부하므로, 새면 여기서 터진다
 *   · RLS 거부(0행 반환)를 '저장됨'으로 오인하지 않는지
 *
 *   node t-dbw.mjs
 */
import fs from 'fs';
import path from 'path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
let bad = 0, n = 0;
const ok  = m => { n++; console.log('  ✅ ' + m); };
const err = m => { n++; bad++; console.log('  ❌ ' + m); };

/* core.js 를 브라우저 흉내로 띄운다 (t-csvdb 와 같은 방식) */
global.window = {};
global.document = { createElement: () => ({ style: {} }), getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  body: {}, documentElement: {}, head: {}, readyState: 'complete' };
global.window.addEventListener = () => {};
global.window.location = { href: '', search: '' };
global.window.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window.matchMedia = () => ({ matches: false, addEventListener() {} });
global.window.self = global.window.top = global.window;
global.localStorage = global.window.localStorage;
global.location = global.window.location;
try { new Function(fs.readFileSync(ROOT + '/assets/core.js', 'utf8'))(); } catch (e) {}
const G = global.window.GST || global.GST;
if (!G || !G.dbWrite || !G.DBW) { console.log('❌ core.js 에서 GST.dbWrite 를 못 찾았다'); process.exit(1); }

/* ---------- 모의 Supabase — PostgREST 의 성질을 흉내낸다 ----------
 *  · 미지의 컬럼에 쓰면 에러 (PGRST204 흉내) — 잔재 필드가 새어들면 여기서 잡힌다
 *  · RLS 거부는 에러가 아니라 «0행 반환»
 *  · 표는 {cols:[...], rows:[{...}]} — 컬럼 집합이 고정이다                       */
function mkDb(tables, opt) {
  opt = opt || {};
  const client = {
    from(t) {
      const T = tables[t];
      const st = { op: 'select', eq: null, ilike: null, upd: null, ins: null, lim: null, single: false };
      const fail = msg => ({ data: null, error: { message: msg } });
      const run = () => {
        if (!T) return fail(`relation "public.${t}" does not exist`);
        let rows = T.rows;
        if (st.eq) rows = rows.filter(r => String(r[st.eq[0]] ?? '') === String(st.eq[1]));
        if (st.ilike) rows = rows.filter(r => String(r[st.ilike[0]] ?? '').toLowerCase() ===
          String(st.ilike[1]).replace(/\\([%_\\])/g, '$1').toLowerCase());
        if (st.op === 'select') {
          if (st.eq && !(T.cols.includes(st.eq[0]))) return fail(`column ${t}.${st.eq[0]} does not exist`);
          let out = rows.slice(0, st.lim ?? rows.length);
          if (st.single) return { data: out[0] ?? null, error: out.length > 1 ? { message: 'multiple rows' } : null };
          return { data: out, error: null };
        }
        if (opt.rlsDeny) return { data: [], error: null };           // RLS 거부 = 조용한 0행
        if (st.op === 'update') {
          for (const k of Object.keys(st.upd))
            if (!T.cols.includes(k)) return fail(`Could not find the '${k}' column of '${t}' in the schema cache`);
          rows.forEach(r => Object.assign(r, st.upd));
          return { data: rows, error: null };
        }
        if (st.op === 'insert') {
          for (const k of Object.keys(st.ins))
            if (!T.cols.includes(k)) return fail(`Could not find the '${k}' column of '${t}' in the schema cache`);
          const row = {}; T.cols.forEach(c => row[c] = st.ins[c] ?? null);
          T.rows.push(row);
          return { data: [row], error: null };
        }
        if (st.op === 'delete') {
          T.rows = T.rows.filter(r => !rows.includes(r));
          return { data: rows, error: null };
        }
        return fail('bad op');
      };
      const api = {
        select() { if (st.op === 'select') st.op = 'select'; return api; },
        eq(c, v) { st.eq = [c, v]; return api; },
        ilike(c, v) { st.ilike = [c, v]; return api; },
        limit(k) { st.lim = k; return Promise.resolve(run()); },
        maybeSingle() { st.single = true; return Promise.resolve(run()); },
        update(o) { st.op = 'update'; st.upd = o; return api; },
        insert(o) { st.op = 'insert'; st.ins = o; return api; },
        delete() { st.op = 'delete'; return api; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return api;
    },
  };
  return client;
}

/* 표 스키마 — 사용자의 실제 Import 표와 같은 열 이름 (setup-6 · mkcsv 산출물) */
const ROSTER_COLS = ['No.','ID','Name((영문)','Name(중문)','Dept.','Position Level','Work Place',
  '2025 Position Role','Date of entry','Resignation','조직도 위치','직급','업무/직책','현장 인원여부'];
const EDU_COLS = ['No','Site','인원','사원번호','Basic 교육완료일','Veteran 교육완료일',
  'Scrubber Lv.2 교육완료일','Scrubber Lv.3 교육완료일'];
const LEAVE_COLS = ['사원번호','이름','소속','항목','발생일','휴가시작일','휴가시작시간',
  '휴가종료일','휴가종료시간','휴가신청시간','비고'];
const AU_COLS = ['email','can_write'];

function freshTables(canWrite) {
  const mk = (cols, arr) => ({ cols, rows: arr.map(o => { const r = {}; cols.forEach(c => r[c] = o[c] ?? null); return r; }) });
  return {
    allowed_users: mk(AU_COLS, [{ email: 'tester@x.com', can_write: canWrite !== false }]),
    sheet_roster: mk(ROSTER_COLS, [
      { 'No.': '1', 'ID': 'E1', 'Name((영문)': 'KIM T', '직급': 'Junior', 'Work Place': 'F16', 'Date of entry': '2024-01-01' },
      { 'No.': '2', 'ID': 'E2', 'Name((영문)': 'LEE S', '직급': 'Senior', 'Work Place': 'F11', 'Date of entry': '2023-05-01' },
    ]),
    sheet_edu: mk(EDU_COLS, [
      { 'No': '1', 'Site': 'F16', '인원': 'KIM T', '사원번호': 'E1', 'Basic 교육완료일': '2024-03-01' },
    ]),
    sheet_leave: mk(LEAVE_COLS, []),
  };
}
function useDb(tables, opt) {
  G.db = async () => mkDb(tables, opt);
  G.getSession = async () => ({ user: { email: 'tester@x.com' }, access_token: 'x' });
  G.authDenied = () => {};
}
const codeOf = e => (e && e.data && e.data.error) || (e && e.message) || String(e);

const GID_R = '1213453343', GID_E = '0', GID_L = '262805841';

console.log('[1] perm — can_write 가 그대로 전달되는지');
{
  let t = freshTables(true); useDb(t);
  const p = await G.dbWrite('perm', GID_R, null, {});
  p.can_write === true ? ok('can_write=true') : err('can_write 가 true 여야 한다');
  t = freshTables(false); useDb(t);
  const p2 = await G.dbWrite('perm', GID_R, null, {});
  p2.can_write === false ? ok('can_write=false') : err('can_write 가 false 여야 한다');
  try { await G.dbWrite('update', GID_R, { key: 'E1', changes: { posKo: 'X' } }, {});
        err('읽기전용인데 update 가 통과했다'); }
  catch (e) { codeOf(e) === 'read_only' ? ok('읽기전용 → read_only') : err('read_only 대신 ' + codeOf(e)); }
}

console.log('\n[2] row — 논리 필드 번역 + 교육 짝 행');
{
  const t = freshTables(true); useDb(t);
  const r = await G.dbWrite('row', GID_R, null, { key: 'E1', with: 'edu' });
  r.fields.posKo === 'Junior' && r.fields.name === 'KIM T'
    ? ok('roster 필드: posKo=직급, name=Name((영문)') : err('필드 번역이 틀렸다: ' + JSON.stringify(r.fields));
  r.edu && r.edu.fields.bdate === '2024-03-01'
    ? ok('edu 짝 행: bdate=Basic 교육완료일') : err('edu 짝 행이 틀렸다');
  const r2 = await G.dbWrite('row', GID_R, null, { key: 'E2', with: 'edu' });
  r2.edu === null ? ok('교육 미등록 → edu:null (append 유도)') : err('E2 는 edu 가 null 이어야 한다');
}

console.log('\n[3] update — 열 번역·정확히 한 행·낙관적 잠금');
{
  const t = freshTables(true); useDb(t);
  const r0 = await G.dbWrite('row', GID_R, null, { key: 'E1' });
  const r = await G.dbWrite('update', GID_R, { key: 'E1', baseHash: r0.hash, changes: { posKo: 'Mid' } }, {});
  t.sheet_roster.rows[0]['직급'] === 'Mid' ? ok('직급 열에 저장됨') : err('직급 열이 안 바뀌었다');
  r.fields.posKo === 'Mid' ? ok('응답 fields 갱신') : err('응답 fields 가 옛값');
  r.hash !== r0.hash ? ok('지문 갱신') : err('지문이 그대로다');

  try { await G.dbWrite('update', GID_R, { key: 'E9', changes: { posKo: 'X' } }, {}); err('없는 키가 통과'); }
  catch (e) { codeOf(e) === 'not_found' ? ok('0행 → not_found') : err('not_found 대신 ' + codeOf(e)); }

  t.sheet_roster.rows.push(Object.assign({}, t.sheet_roster.rows[0]));    // ID 중복
  try { await G.dbWrite('update', GID_R, { key: 'E1', changes: { posKo: 'X' } }, {}); err('중복 키가 통과'); }
  catch (e) { codeOf(e) === 'dup_key' ? ok('2행 → dup_key') : err('dup_key 대신 ' + codeOf(e)); }
  t.sheet_roster.rows.pop();

  try { await G.dbWrite('update', GID_R, { key: 'E1', baseHash: '깨진지문', changes: { posKo: 'X' } }, {}); err('낡은 지문이 통과'); }
  catch (e) {
    e.status === 409 && e.data.fields && e.data.hash
      ? ok('낡은 지문 → 409 + 현재 fields/hash (충돌 UI 재료)') : err('409 규약이 깨졌다: ' + codeOf(e));
  }

  try { await G.dbWrite('update', GID_R, { key: 'E1', changes: { posKo: '=SUM(A1)' } }, {}); err('수식 주입이 통과'); }
  catch (e) { codeOf(e) === 'bad_value' ? ok('수식 주입 → bad_value') : err('bad_value 대신 ' + codeOf(e)); }
}

console.log('\n[4] 캐스케이드 — 사번/이름 변경이 교육 표를 따라가는지');
{
  const t = freshTables(true); useDb(t);
  const r0 = await G.dbWrite('row', GID_R, null, { key: 'E1' });
  const r = await G.dbWrite('update', GID_R, { key: 'E1', baseHash: r0.hash, changes: { id: 'E1N', name: 'KIM NEW' } }, {});
  r.cascade && r.cascade.done ? ok('cascade.done') : err('cascade 가 안 됐다');
  t.sheet_edu.rows[0]['사원번호'] === 'E1N' && t.sheet_edu.rows[0]['인원'] === 'KIM NEW'
    ? ok('교육 표의 사번·인원이 새 문자열로') : err('교육 표가 옛 문자열 그대로 — 조인이 깨진다');
}

console.log('\n[5] append — 잔재 필드 차단 + 짝 행 생성 + 필수값');
{
  const t = freshTables(true); useDb(t);
  /* hr saveEdit 는 교육 append 에 join·role·posKo 를 아직 실어 보낸다(시트 시절 잔재).
     교육 표에 그 열이 없으므로, 어댑터가 걸러내지 못하면 모의 클라이언트가
     PostgREST 처럼 «Could not find column» 으로 터진다. */
  const r = await G.dbWrite('append', GID_E, { fields: {
    id: 'E2', name: 'LEE S', site: 'F11', join: '2023-05-01', role: 'CS', posKo: 'Senior',
    vdate: '2026-01-01' } }, {});
  r.fields.vdate === '2026-01-01' ? ok('교육 append: 잔재 필드 걸러내고 저장') : err('append 실패');
  t.sheet_edu.rows.length === 2 ? ok('교육 표 2행') : err('행수가 틀리다');

  const r2 = await G.dbWrite('append', GID_R, { fields: {
    id: 'E3', name: 'PARK J', wp: 'F16', join: '2026-08-01' }, edu: { bdate: '2026-08-10' } }, {});
  r2.edu && r2.edu.ok ? ok('인원 신규 → 교육 짝 행 생성') : err('짝 행 생성 실패: ' + JSON.stringify(r2.edu));
  const e3 = t.sheet_edu.rows.find(x => x['사원번호'] === 'E3');
  e3 && e3['인원'] === 'PARK J' && e3['Site'] === 'F16' && e3['Basic 교육완료일'] === '2026-08-10'
    ? ok('짝 행에 사번·인원·Site·완료일') : err('짝 행 내용이 틀리다');

  try { await G.dbWrite('append', GID_R, { fields: { id: 'E4', name: 'NO JOIN' } }, {}); err('필수값 없이 통과'); }
  catch (e) { codeOf(e) === 'missing_field' ? ok('join 없음 → missing_field') : err('missing_field 대신 ' + codeOf(e)); }

  try { await G.dbWrite('append', GID_R, { fields: { id: 'E1', name: 'DUP', join: '2026-01-01' } }, {}); err('중복 사번 통과'); }
  catch (e) { codeOf(e) === 'dup_key' ? ok('중복 사번 → dup_key') : err('dup_key 대신 ' + codeOf(e)); }
}

console.log('\n[6] 휴가 — 한국어 열 번역 + append 전용');
{
  const t = freshTables(true); useDb(t);
  await G.dbWrite('append', GID_L, { fields: {
    empId: 'E1', name: '金 KIM T', site: 'F16', type: '연차',
    start: '2026-08-14', stime: '09:00:00', end: '2026-08-14', etime: '18:00:00', amt: '8' } }, {});
  const lv = t.sheet_leave.rows[0];
  lv && lv['사원번호'] === 'E1' && lv['항목'] === '연차' && lv['휴가시작일'] === '2026-08-14'
    ? ok('휴가 append: 사원번호·항목·휴가시작일') : err('휴가 열 번역이 틀리다');
  try { await G.dbWrite('update', GID_L, { key: 'E1', changes: { note: 'x' } }, {}); err('휴가 update 가 통과'); }
  catch (e) { codeOf(e) === 'op_disabled' ? ok('휴가 update → op_disabled') : err('op_disabled 대신 ' + codeOf(e)); }
}

console.log('\n[7] delete — 지문 확인 + 교육 캐스케이드');
{
  const t = freshTables(true); useDb(t);
  const r0 = await G.dbWrite('row', GID_R, null, { key: 'E1' });
  const r = await G.dbWrite('delete', GID_R, { key: 'E1', baseHash: r0.hash, cascade: true }, {});
  r.deleted.edu === true ? ok('교육 짝 행도 삭제') : err('교육 캐스케이드 실패');
  t.sheet_roster.rows.length === 1 && t.sheet_edu.rows.length === 0
    ? ok('명단 1행 · 교육 0행') : err('행수가 틀리다');
}

console.log('\n[8] 수선실적 dq (v82) — rs_code 로 정확히 한 행 · update 만 허용');
{
  const t = freshTables(true);
  t.sheet_wk = { cols: ['src_row','rs_code','alarm','phenom','cause','action','synced_at'],
    rows: [ { src_row: 1, rs_code: 'RS001', alarm: null, phenom: null, cause: null, action: null },
            { src_row: 2, rs_code: 'RS002', alarm: '기존', phenom: null, cause: null, action: null } ] };
  useDb(t);
  const GID_W = '646668307';
  const r0 = await G.dbWrite('row', GID_W, null, { key: 'RS001' });
  r0.fields.rs === 'RS001' ? ok('row: rs 필드 번역') : err('row 필드가 틀리다');
  const r = await G.dbWrite('update', GID_W, { key: 'RS001', baseHash: r0.hash,
    changes: { alarm: 'GAS LOW', cause: 'O-RING 마모' } }, {});
  t.sheet_wk.rows[0].alarm === 'GAS LOW' && t.sheet_wk.rows[0].cause === 'O-RING 마모'
    ? ok('alarm·cause 열에 저장됨') : err('열 번역이 틀리다');
  r.fields.alarm === 'GAS LOW' ? ok('응답 fields 갱신') : err('응답이 옛값');
  for (const [op, body] of [['append', { fields: { rs: 'RSX', alarm: 'x' } }],
                            ['delete', { key: 'RS001' }]]) {
    try { await G.dbWrite(op, GID_W, body, {}); err(`실적 ${op} 가 통과 — CSV 업로드가 원장인데 행을 만들/지울 수 있다`); }
    catch (e) { codeOf(e) === 'op_disabled' ? ok(`실적 ${op} → op_disabled`) : err(`op_disabled 대신 ` + codeOf(e)); }
  }
}

console.log('\n[9] RLS 거부 — 0행 반환을 «저장됨»으로 오인하지 않는지');
{
  const t = freshTables(true); useDb(t, { rlsDeny: true });
  const before = t.sheet_roster.rows[0]['직급'];
  try { await G.dbWrite('update', GID_R, { key: 'E1', changes: { posKo: 'HACK' } }, {}); err('RLS 거부가 성공으로 보였다'); }
  catch (e) { codeOf(e) === 'read_only' ? ok('0행 반환 → read_only 로 표면화') : err('read_only 대신 ' + codeOf(e)); }
}

console.log('\n[10] 인원명단 새 양식(v96) — 빈 ID 옆에 채워진 사원번호가 있을 때');
{
  /* 실측 상태: ALTER 로 새 한글 열이 «맨 뒤»에 붙어, 옛 ID·Date of entry 는 빈 채 남아 있다.
     이름 순서로 고르면 빈 열을 집어 편집이 아무에게도 안 열렸고(0행 → not_found),
     신규 등록은 옛 열에 값을 넣어 «저장됨»이라 하고 어느 화면에도 안 보였다. */
  const t = {
    allowed_users: { cols: AU_COLS, rows: [{ email:'tester@x.com', can_write:true }] },
    sheet_roster: {
      cols: ['ID','Name((영문)','Date of entry','Resignation','조직도 위치','직급',
             '사원번호','이름(영문)','입사일','퇴사일','담당구분','직급(한글)'],
      rows: [{ 'ID':'', 'Name((영문)':'', 'Date of entry':'', 'Resignation':'', '조직도 위치':'', '직급':'',
               '사원번호':'E9', '이름(영문)':'HONG', '입사일':'2024-03-02', '퇴사일':'',
               '담당구분':'Scrubber', '직급(한글)':'사원' }]
    },
    sheet_edu: { cols:['사원번호','Site','인원','Basic 교육완료일','Veteran 교육완료일',
                       'Scrubber Lv.2 교육완료일','Scrubber Lv.3 교육완료일'], rows: [] }
  };
  useDb(t);
  // ① 편집이 열린다 — 채워진 «사원번호» 로 찾아야 한다
  try {
    const r = await G.dbWrite('row', GID_R, null, { key:'E9' });
    (r && r.fields && r.fields.id === 'E9' && r.fields.name === 'HONG')
      ? ok('새 양식에서 편집이 열린다 (사번·이름을 채워진 열에서 읽는다)')
      : err('행은 찾았는데 필드가 비었다: ' + JSON.stringify(r && r.fields));
  } catch (e) { err('새 양식에서 편집이 안 열린다 → ' + codeOf(e)); }

  // ② 저장이 «채워진» 열에 들어간다 — 옛 열에 쓰면 어느 화면에도 안 보인다
  try {
    await G.dbWrite('update', GID_R, { key:'E9', changes:{ posKo:'대리', quit:'2026-08-01' } }, {});
    const row = t.sheet_roster.rows[0];
    (row['직급(한글)'] === '대리' && row['퇴사일'] === '2026-08-01' && row['직급'] === '' && row['Resignation'] === '')
      ? ok('저장이 새 한글 열에 들어간다 (옛 영문 열은 그대로 빈 채)')
      : err('옛 열에 썼다: 직급=' + row['직급'] + ' / Resignation=' + row['Resignation']);
  } catch (e) { err('저장 실패 → ' + codeOf(e)); }

  // ③ 신규 등록도 새 열로
  try {
    await G.dbWrite('append', GID_R, { fields:{ id:'E10', name:'KIM', join:'2026-08-18', org:'Scrubber' } }, {});
    const row = t.sheet_roster.rows.find(r => r['사원번호'] === 'E10');
    (row && row['입사일'] === '2026-08-18' && row['담당구분'] === 'Scrubber' && !row['ID'] && !row['Date of entry'])
      ? ok('신규 등록이 새 한글 열에 들어간다')
      : err('신규 등록이 옛 열로 갔다: ' + JSON.stringify(row));
  } catch (e) { err('신규 등록 실패 → ' + codeOf(e)); }

  // ④ 옛 영문 양식만 있는 표도 그대로 동작해야 한다(회귀)
  const t2 = {
    allowed_users: { cols: AU_COLS, rows: [{ email:'tester@x.com', can_write:true }] },
    sheet_roster: { cols:['ID','Name((영문)','Date of entry','Resignation','조직도 위치','직급'],
      rows:[{ 'ID':'E1','Name((영문)':'LEE','Date of entry':'2020-01-01','Resignation':'','조직도 위치':'Scrubber','직급':'사원' }] },
    sheet_edu: { cols:['사원번호','Site','인원'], rows: [] }
  };
  useDb(t2);
  try {
    const r = await G.dbWrite('row', GID_R, null, { key:'E1' });
    (r && r.fields && r.fields.name === 'LEE') ? ok('옛 영문 양식도 그대로 열린다(회귀 없음)')
      : err('옛 양식이 깨졌다: ' + JSON.stringify(r && r.fields));
  } catch (e) { err('옛 양식이 깨졌다 → ' + codeOf(e)); }
}

console.log(`\n${bad ? '❌' : '✅'} ${n - bad}/${n} 통과`);
process.exit(bad ? 1 : 0);
