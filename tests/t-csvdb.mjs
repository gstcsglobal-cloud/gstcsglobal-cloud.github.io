/* CSV Import 표 어댑터 (v79) — 시트에서 «잃은 모양»을 되살리는지.
 *
 * Table Editor 로 올린 표는 머리글이 한 줄뿐이다. 그래서 두 가지가 사라진다:
 *   · CIP    — 0행의 «적용일자 띠». 열별 최초 완료일로 되살린다.
 *   · ABP    — Month/Week 크로스탭. 세로형으로 올렸다가 다시 편다.
 * 페이지·파서는 한 줄도 안 고쳤으므로, **되살린 모양이 시트와 같아야만** 화면이 같다.
 * 그걸 여기서 대조한다.
 *
 *   node t-csvdb.mjs
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
let bad = 0, n = 0;
const ok  = m => { n++; console.log('  ✅ ' + m); };
const err = m => { n++; bad++; console.log('  ❌ ' + m); };

/* core.js 를 브라우저 흉내로 띄운다 (gen-ddl·t-mirror 와 같은 방식) */
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
if (!G || !G._cipBand || !G._abpWide) { console.log('❌ core.js 에서 어댑터를 못 찾았다'); process.exit(1); }

/* ---------- 1. CIP — 적용일자 띠 복원 ----------
   픽스처(시트 모양: 0행 띠 · 1행 헤더)에서 띠를 «떼어내» Import 표를 흉내내고,
   어댑터가 되살린 띠를 원래 띠와 대조한다. */
console.log('\n[1] CIP — 적용일자 띠를 열별 최초 완료일로 되살리는지');
for (const [file, site, wantItems] of [['csv_cip11.csv', 'F11', 6], ['csv_cip16.csv', 'F16', 24]]) {
  const p = path.join(HERE, file);
  if (!fs.existsSync(p)) { globalThis.__skipped = (globalThis.__skipped||0)+1; console.log(`  … ${site} 픽스처 없음 — 건너뜀`); continue; }
  const sheet = Papa.parse(fs.readFileSync(p, 'utf8'), { skipEmptyLines: false }).data;
  const imported = sheet.slice(1);                        // Import 표 = 띠가 없는 상태
  const restored = [G._cipBand(imported)].concat(imported);

  const m = G.SM.map(restored, G.SM.SPEC.cip);
  if (!m.ok) { err(`${site}: 열 인식 실패 — ${m.miss.join(', ')}`); continue; }
  const rg = G.SM.cipRange(restored[m.hi]);
  const items = rg ? rg.c1 - rg.c0 + 1 : 0;
  items === wantItems ? ok(`${site}: 항목 ${items}종 (기대 ${wantItems}) · 헤더 ${m.hi}행`)
                      : err(`${site}: 항목 ${items}종 (기대 ${wantItems})`);

  const band = restored[m.hi - 1] || [];
  // 항목 구간의 적용일이 «전부» 채워져야 한다. 하나라도 비면 그 항목의 경과일이 미상이 된다.
  const blanks = rg ? band.slice(rg.c0, rg.c1 + 1).filter(d => !d).length : 0;
  blanks ? err(`${site}: 적용일이 빈 항목 ${blanks}개`) : ok(`${site}: 항목 ${items}개 모두 적용일이 잡힘`);

  /* 2010년 이전은 버린다 — 시트에 1901-02-19 오타가 있고, 그걸 최솟값으로 쓰면
     그 항목의 경과일이 4만 5천 일이 되어 「잔여 경과일 분포」가 통째로 망가진다. */
  const old = band.filter(d => d && d < '2010');
  old.length ? err(`${site}: 2010년 이전 날짜가 띠에 남았다 — ${old.slice(0,2)}`)
             : ok(`${site}: 1901 같은 오타가 띠에 안 들어감`);

  /* 원래 띠가 있던 항목은 되살린 값과 얼마나 맞는가. 완전 일치를 요구하지 않는다 —
     최초 완료일이 «적용일 이후»인 항목이 실제로 있다(아직 아무도 안 한 항목). 수치만 남긴다. */
  const orig = sheet[0] || [];
  let same = 0, diff = 0;
  if (rg) for (let c = rg.c0; c <= rg.c1; c++) {
    if (!orig[c]) continue;
    (String(orig[c]).slice(0, 10) === band[c]) ? same++ : diff++;
  }
  console.log(`     원래 띠가 있던 ${same + diff}항목 중 ${same}개 정확히 일치`);
}

/* ---------- 2. ABP — 세로형 → 크로스탭 ----------
   실데이터가 필요 없다. 합성 크로스탭을 만들어 세로형으로 눕혔다가 어댑터로 되펴고,
   **같은 parseABP 에 둘 다 먹여** 결과가 같은지 본다. 모양이 아니라 «파서가 읽은 값»을 본다. */
console.log('\n[2] ABP — 세로형으로 눕혔다 되편 것이 크로스탭과 같은 값을 내는지');
{
  const rp = fs.readFileSync(ROOT + '/report/index.html', 'utf8');
  const s = rp.indexOf('function parseABP(rows){');
  if (s < 0) { err('report 에서 parseABP 를 못 찾았다'); }
  else {
    const src = rp.slice(s, rp.indexOf('\n}', s) + 2);
    const custBase = x => String(x).replace(/\s+F1[0-9].*$/, '').trim();
    const fabOf = x => { const m = /F1[0-9][A-Z]?/.exec(String(x)); return m ? m[0] : ''; };
    const parseABP = new Function('custBase', 'fabOf', src + ';return parseABP;')(custBase, fabOf);

    // 합성 크로스탭 — 실데이터가 아니다(사이트 이름만 실제 표기를 따른다)
    const wide = [
      ['Month', '7', '8', '9', '1'],
      ['Site', '2025-07-31', '2025-08-31', '2025-09-30', '2026-01-31'],
      ['MICRON F11', '0', '2', '0', '1'],
      ['MICRON F16', '3', '0', '0', '0'],
      ['PSMC',       '0', '0', '5', '0'],
      [],
      ['Week', '18', '19'],
      ['Site', '2026-04-26', '2026-05-03'],
      ['MICRON F11', '1', '0'],
      ['MICRON F16', '0', '4'],
    ];
    // mkcsv.py 와 같은 규칙으로 눕힌다(월 키는 끝날짜에서 YYYY-MM)
    const long = [['period_type', 'period_key', 'period_end', 'site', 'bypass_count']];
    let mode = null, keys = null, ends = null;
    for (const r of wide) {
      const a = String(r[0] || '').toLowerCase();
      if (a === 'month' || a === 'week') { mode = a; keys = r.slice(1); ends = null; continue; }
      if (a === 'site') { ends = r.slice(1); continue; }
      if (!mode || !r.length) continue;
      r.slice(1).forEach((v, j) => {
        if (v === '') return;
        const end = ends[j] || '';
        const pk = mode === 'month' ? end.slice(0, 7) : 'W' + String(keys[j]).padStart(2, '0');
        long.push([mode, pk, end, r[0], v]);
      });
    }

    const A = parseABP(wide), B = parseABP(G._abpWide(long));
    const j = o => JSON.stringify(o, Object.keys(o).sort());
    for (const mode2 of ['m', 'w']) {
      const ka = Object.keys(A[mode2]).sort(), kb = Object.keys(B[mode2]).sort();
      if (ka.join() !== kb.join()) { err(`${mode2}: 키가 다름 — 원본 [${ka}] ≠ 복원 [${kb}]`); continue; }
      const d = ka.filter(k => j(A[mode2][k]) !== j(B[mode2][k]));
      d.length ? err(`${mode2}: ${d.length}키의 값이 다름 — ${d.slice(0, 3)}`)
               : ok(`${mode2}: ${ka.length}키 · ALL·고객사별·FAB별 전부 일치`);
    }
  }
}

/* ---------- 3. gid 지도가 서로 겹치지 않는지 ----------
   같은 gid 가 미러(SPEC)와 CSV 양쪽에 있으면 어느 쪽을 읽는지가 코드 순서에 달린다.
   그건 나중에 «왜 옛 값이 보이나»로 돌아온다. */
console.log('\n[3] gid 지도 — 미러와 CSV 표가 같은 gid 를 다투지 않는지');
{
  const a = Object.keys(G.TABLE_OF_GID || {}), b = Object.keys(G.CSV_TABLE_OF_GID || {});
  const dup = a.filter(g => b.includes(g));
  dup.length ? err(`gid ${dup.join(', ')} 가 양쪽에 있다`)
             : ok(`미러 ${a.length}개 · CSV ${b.length}개 · 겹침 없음`);
}

/* ---------- 4. 읽기 — 정렬 열을 «가정하지 않는지» ----------
   Table Editor 로 만든 표에 id 가 늘 있는 것이 아니다. 실제로 없었고,
   `.order('id')` 를 박아둔 탓에 `column sheet_roster.id does not exist` 로
   교육·인원·휴가 셋이 통째로 못 읽혔다(폴백이 시트로 돌려 화면은 살았지만
   그때부터는 DB 를 안 보고 있던 것이다). 그 상황을 그대로 재현한다. */
console.log('\n[4] 읽기 — 표에 id 가 없어도 읽는지');
{
  // Supabase 클라이언트를 흉내낸다. 요청한 정렬 열이 없으면 PostgREST 처럼 에러를 낸다.
  const mkClient = rowsByTable => ({
    from(t) {
      const rows = rowsByTable[t] || [];
      const st = { ord: null };
      const api = {
        select() { return api; },
        order(col) { st.ord = col; return api; },
        limit(k) { return Promise.resolve({ data: rows.slice(0, k), error: null }); },
        range(a, b) {
          // PostgREST 는 order= 에서 점(.)을 «컬럼.방향» 구분자로 파싱한다 —
          // 이름에 점이 든 열을 넘기면 실제로 이렇게 죽는다(인원현황 «No.» 실사고).
          if (st.ord && /[^A-Za-z0-9_가-힣]/.test(st.ord))
            return Promise.resolve({ data: null, error: { message: `"failed to parse order (${st.ord}.asc)" (line 1, column 4)` } });
          if (st.ord && !(rows[0] && st.ord in rows[0]))
            return Promise.resolve({ data: null, error: { message: `column ${t}.${st.ord} does not exist` } });
          const s = st.ord ? rows.slice().sort((x, y) => String(x[st.ord]).localeCompare(String(y[st.ord]))) : rows;
          return Promise.resolve({ data: s.slice(a, b + 1), error: null });
        },
      };
      return api;
    },
  });
  const cases = [
    ['id 있는 표',  [{ id: 2, 'No': '2', '인원': 'B' }, { id: 1, 'No': '1', '인원': 'A' }], 'id'],
    ['id 없는 표',  [{ 'No': '2', '인원': 'B' }, { 'No': '1', '인원': 'A' }], 'No'],
    ['이름뿐인 표', [{ '사원번호': '9', '이름': 'Z' }, { '사원번호': '8', '이름': 'Y' }], '사원번호'],
    // 인원현황 실사고 재현 — 첫 열이 «No.»(점 포함). 점·공백 든 이름은 후보에서 빠져야 한다.
    ['점 든 이름 표', [{ 'No.': '2', 'ID': 'E2', 'Name((영문)': 'B', 'Date of entry': '2024-01-01' },
                       { 'No.': '1', 'ID': 'E1', 'Name((영문)': 'A', 'Date of entry': '2023-01-01' }], 'ID'],
  ];
  const realDb = G.db;
  for (const [label, rows, wantOrd] of cases) {
    const got = G._csvOrderCol(Object.keys(rows[0]));
    got === wantOrd ? ok(`${label}: 정렬 열 '${got}' 선택`) : err(`${label}: 정렬 열 '${got}' (기대 '${wantOrd}')`);
    G.db = async () => mkClient({ t: rows });
    try {
      const out = await G.csvTableRows('t');
      const head = out[0];
      // 관리용 열(id)은 헤더로 나가면 안 된다 — 파서가 그걸 시트 열로 착각한다
      head.indexOf('id') < 0 ? ok(`${label}: 헤더 [${head.join(', ')}] · ${out.length - 1}행 (id 제외됨)`)
                             : err(`${label}: 헤더에 id 가 섞였다`);
    } catch (e) { err(`${label}: 읽기 실패 — ${e.message}`); }
  }
  /* 음성 대조 — 잡는지 확인 안 된 검사는 검사가 아니다. 예전처럼 «No.» 로 정렬을 걸면
     위 모의 클라이언트가 실제 PostgREST 와 같은 파싱 에러를 내는지 확인한다. */
  {
    const rows = [{ 'No.': '1', 'ID': 'E1' }];
    G.db = async () => mkClient({ t: rows });
    const realOrd = G._csvOrderCol;
    G._csvOrderCol = () => 'No.';
    try {
      await G.csvTableRows('t');
      err('음성 대조: «No.» 정렬이 에러를 내지 않았다 — 모의가 실사고를 재현하지 못한다');
    } catch (e) {
      /failed to parse order/.test(e.message)
        ? ok(`음성 대조: «No.» 정렬 → ${e.message.slice(0, 60)}…`)
        : err(`음성 대조: 예상과 다른 에러 — ${e.message}`);
    }
    G._csvOrderCol = realOrd;
  }
  G.db = realDb;
}

/* ---------- 5. dbRows — 표에 «아직 없는» 열을 SPEC 이 갖고 있어도 읽히는지 ----------
   ⚠ PostgREST 는 select 에 없는 열이 하나라도 있으면 그 열만 비우는 게 아니라 **전체를
     거부한다**(v92 에 국내 알람이 그렇게 통째로 실패했다). 그래서 예전에는 SPEC 에 새 열을
     더하는 순간, DB alter 를 아직 안 했으면 **그 시트가 여덟 페이지 전부에서 안 떴다.**
     「승격 순서 — DB 가 먼저다」라는 규약으로 막고 있었는데, 사람이 기억해야 하는 순서는
     언젠가 깨진다. 이제 표의 실제 컬럼을 물어 «교집합»만 고른다. */
console.log('\n[5] dbRows — 표에 없는 열이 SPEC 에 있어도 시트가 뜨는지');
{
  const SPEC = G.SM.SPEC.inst;
  const keys = Object.keys(SPEC.fields);
  const all  = keys.map(G._snake);
  const gi   = all.length - 1;                        // 표에 «아직 없는» 열 (맨 뒤 = 승격 직후 모양)
  const gone = all[gi];
  const have = all.filter((x, i) => i !== gi);

  let lastSel = '';
  const mk = (withRpc) => ({
    rpc(fn) {
      if (!withRpc) return Promise.resolve({ data: null, error: { message: `function public.${fn} does not exist` } });
      return Promise.resolve({ data: have.slice(), error: null });
    },
    from(t) {
      const api = {
        _sel: '',
        select(s) { api._sel = s; if (t !== 'sheet_sync_log') lastSel = s; return api; },
        eq() { return api; },
        maybeSingle() {
          return Promise.resolve({ data: { rows: 1, err: null, synced_at: '2026-08-18T00:00:00Z', ms: -1 }, error: null });
        },
        order() { return api; },
        range(a) {
          // PostgREST 그대로 — 없는 열이 하나라도 섞이면 «그 열만»이 아니라 전체를 거부한다
          const asked = api._sel.split(',').map(x => x.trim());
          const bad = asked.filter(x => x !== 'src_row' && have.indexOf(x) < 0);
          if (bad.length)
            return Promise.resolve({ data: null, error: { message: `column sheet_inst.${bad[0]} does not exist` } });
          if (a > 0) return Promise.resolve({ data: [], error: null });
          const row = { src_row: 0 };
          have.forEach((cname, i) => { row[cname] = 'v' + i; });
          return Promise.resolve({ data: [row], error: null });
        },
      };
      return api;
    },
  });

  const realDb = G.db, realIdb = G.idb;
  G.idb = { get: async () => null, set: async () => {} };   // 캐시가 결과를 가리지 않게

  // (a) RPC 가 있는 환경 — 없는 열을 빼고 읽는다
  G._dbCols = null;
  G.db = async () => mk(true);
  try {
    const out = await G.dbRows('inst');
    ok(`RPC 있음: 표에 없는 열(${gone}) 이 하나 있어도 ${out.length - 1}행을 읽었다`);
    lastSel.split(',').indexOf(gone) < 0 ? ok(`select 에서 ${gone} 가 빠졌다`)
                                         : err(`select 에 ${gone} 가 그대로 남았다 — PostgREST 가 전체를 거부한다`);
    // 헤더 자리는 유지돼야 한다 — 지우면 그 뒤 열이 통째로 밀려 제1원칙이 깨진다
    out[0].length === keys.length ? ok(`헤더 ${out[0].length}칸 — SPEC 과 같다 (자리를 안 지웠다)`)
                                  : err(`헤더 ${out[0].length}칸 (기대 ${keys.length}) — 열이 밀린다`);
    out[1][gi] === '' ? ok('없는 열의 값은 빈 칸')
                      : err(`없는 열에 값이 들어왔다: ${JSON.stringify(out[1][gi])}`);
    (G._dbCols || []).indexOf('inst.' + gone) >= 0
      ? ok('GST._dbCols 에 남겼다 — 「왜 그 축이 미적용인가」에 답할 수 있다')
      : err('GST._dbCols 에 안 남았다 — 조용히 넘어갔다');
    // ⚠ 경고 배열에 섞으면 배너가 «undefined — undefined» 를 찍는다 ({t,m} 객체를 담는 배열이다)
    (G._dbMiss || []).some(x => typeof x !== 'object')
      ? err('_dbMiss 에 문자열이 섞였다 — _dbBanner 가 undefined 를 찍는다')
      : ok('_dbMiss 는 안 건드린다 — 승격 대기는 경고가 아니다');
  } catch (e) { err(`RPC 있음: 읽기 실패 — ${e.message}`); }

  /* 음성 대조 — 교집합을 안 고르면 실제로 죽는지. 잡는지 확인 안 된 검사는 검사가 아니다.
     RPC 가 없는 환경은 옛 동작(전부 고르기) 그대로이므로 그것이 곧 음성 대조가 된다. */
  {
    G.db = async () => mk(false);
    G._dbCols = null;
    try {
      await G.dbRows('inst');
      err('음성 대조: 전부 골랐는데도 읽혔다 — 모의가 PostgREST 를 재현하지 못한다');
    } catch (e) {
      /does not exist/.test(e.message)
        ? ok(`음성 대조: 교집합을 안 고르면 → ${e.message.slice(0, 52)}…`)
        : err(`음성 대조: 예상과 다른 에러 — ${e.message}`);
    }
  }

  // (b) 캐시 열쇠에 «고른 컬럼 수»가 들어가는지 — 안 들어가면 alter 뒤에도 옛 캐시를 쓴다
  {
    const src = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
    const m = /const stamp = table\+'\|'\+lg\.data\.synced_at\+'\|'\+want([^;]*);/.exec(src);
    m && /use\.length/.test(m[1])
      ? ok('캐시 열쇠에 고른 컬럼 수가 들어간다 (alter 뒤 옛 캐시가 무효가 된다)')
      : err('캐시 열쇠에 컬럼 수가 없다 — DB 에 열을 더해도 옛 캐시가 계속 맞는 것으로 판정된다');
  }

  G.db = realDb; G.idb = realIdb; G._dbCols = null;
}

/* ---------- 6. csvTableRows — 일시적인 인증 실패는 «자료 없음»이 아니다 ----------
   실제로 겪었다. 국내 알람 원장이 «READ JWT issued at future» 로 실패해 화면이 조용히
   수선실적 BM 으로 폴백했고, 사용자는 「알람 건수를 또 바꿨냐」고 물었다(잠시 뒤 저절로
   돌아왔다). 브라우저 시계가 Supabase 보다 앞서면 토큰의 iat 가 «미래»로 보인다.
   «자료가 없다»와 «지금 못 읽었다»는 다른 사실이다 — 후자를 폴백으로 삼으면 화면이
   기준을 갈아타면서 그 사실을 숫자로는 말하지 않는다. */
console.log('\n[6] csvTableRows — 시계 어긋남(JWT)은 한 번 다시 해 보는지');
{
  for (const [label, msg, want] of [
    ['미래 iat',   'JWT issued at future',        true],
    ['만료',       'JWT expired',                 true],
    ['권한 없음',  '401 Unauthorized',            true],
    ['없는 열',    'column t.seq does not exist', false],   // 자료 문제 — 다시 해도 같다
    ['빈 표',      'relation "t" does not exist', false],
  ]) {
    G._authGlitch(msg) === want
      ? ok(`${label}: ${want ? '다시 해 본다' : '그대로 던진다'}`)
      : err(`${label}: 판정이 ${!want} 다 — «${msg}»`);
  }

  const realDb = G.db;
  let tries = 0, refreshed = 0;
  G.db = async () => ({
    auth: { refreshSession: async () => { refreshed++; } },
    from() {
      const api = {
        select() { return api; },
        order() { return api; },
        limit() {
          tries++;
          if (tries === 1) return Promise.resolve({ data: null, error: { message: 'JWT issued at future' } });
          return Promise.resolve({ data: [{ id: 1, '알람': 'x' }], error: null });
        },
        range(a) { return Promise.resolve({ data: a > 0 ? [] : [{ id: 1, '알람': 'x' }], error: null }); },
      };
      return api;
    },
  });
  try {
    const out = await G.csvTableRows('t');
    ok(`시계 어긋남 뒤 재시도로 ${out.length - 1}행을 읽었다 (시도 ${tries}회 · 세션 갱신 ${refreshed}회)`);
    tries === 2 ? ok('재시도는 «한 번»뿐이다 (무한 재시도는 화면을 멈춘다)')
                : err(`시도가 ${tries}회다 — 한 번만 다시 해야 한다`);
  } catch (e) { err(`재시도가 안 걸렸다 — ${e.message}`); }

  // 자료 문제는 재시도하지 않고 그대로 던진다 — 안 그러면 모든 실패가 1.2초씩 늦어진다
  let t2 = 0;
  G.db = async () => ({
    from() {
      const api = { select(){return api;}, order(){return api;},
        limit() { t2++; return Promise.resolve({ data: null, error: { message: 'column t.seq does not exist' } }); } };
      return api;
    },
  });
  try { await G.csvTableRows('t'); err('없는 열인데 에러를 안 던졌다'); }
  catch (e) {
    t2 === 1 ? ok('자료 문제는 재시도 없이 곧바로 던진다')
             : err(`자료 문제인데 ${t2}회 시도했다`);
  }
  G.db = realDb;
}

/* ⚠ 픽스처가 없으면 핵심 대조를 «건너뛰고도» ✅ 로 끝났다 — 초록불이 거짓말을 한다.
   실제로 그 초록불을 믿고 여러 번 작업했다. 건너뛴 것이 있으면 다른 말을 한다.
   종료코드는 0 으로 둔다(픽스처 없는 환경에서 npm run all 이 멈추면 나머지도 못 돈다).
   진짜 CI 에서는 STRICT_FIXTURES=1 로 실패시킬 수 있다. */
const _skip = globalThis.__skipped || 0;
if (bad) console.log(`\n❌ ${n - bad}/${n} 통과`);
else if (_skip) console.log(`\n⚠️  부분 검사 — 픽스처가 없어 ${_skip}개 항목을 건너뛰었다 (핵심 대조 미실행) · 통과 ${n}/${n}`);
else console.log(`\n✅ ${n}/${n} 통과`);
if (_skip && process.env.STRICT_FIXTURES) process.exit(2);
process.exit(bad ? 1 : 0);

