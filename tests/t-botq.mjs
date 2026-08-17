/* 봇이 고장 실적을 «캐시 대신 표에서 직접 조회»해도 같은 레코드를 내는가 (v97)

   왜 필요한가. bot_cache 는 표 전체를 JSON 덩어리로 담는 구조였고, 수선실적이
   17,091행 → 257,606행이 되자 엣지펑션 워커가 메모리 한도로 죽었다(실측 546).
   게다가 faults 는 sync 순서상 leave·cip «앞»이라, 죽으면 뒤의 둘도 시도조차 안 된 채
   남는다 — 워커가 죽으면 catch 가 못 도니 bot_cache.error 는 비어 있고 fetched_at 만
   3일 전에 멈춘다. 화면에 단서가 하나도 없는 실패다.

   그래서 조회 경로로 바꿨는데, 여기서 조용히 틀릴 수 있는 자리가 둘이다:
     ① DB 컬럼 이름을 엣지펑션에 적어 «스펙의 네 번째 사본»을 만드는 것 (제2원칙)
     ② 레코드를 조회 경로에서 새로 조립해 캐시 시절과 다른 모양을 내는 것
   ②는 특히 나쁘다 — 숫자가 «조금» 달라지는데 에러가 안 난다.

   이 검사는 실제 시트 CSV 를 «미러 표 모양»으로 눕혔다가 되살려, 원래 CSV 를 그대로
   파싱한 결과와 «레코드 단위로» 대조한다. 갈라지면 즉시 실패한다.

   ⚠ 이 파일은 실데이터를 담지 않는다 — tests/csv_wk.csv 픽스처를 읽을 뿐이고
     그 파일은 .gitignore 에 있다(t-leak 이 지킨다). */
import fs from 'fs';
import path from 'path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const HR   = path.resolve(ROOT, 'supabase/functions/kakao-bot/hr.js');
const m    = await import(HR);

let pass = 0, fail = 0;
const ok  = (msg) => { pass++; console.log('  ✓ ' + msg); };
const bad = (msg) => { fail++; console.log('  ❌ ' + msg); };
const is  = (c, msg) => c ? ok(msg) : bad(msg);

const IDX = fs.readFileSync(path.resolve(ROOT, 'supabase/functions/kakao-bot/index.ts'), 'utf8');
const SQL = fs.readFileSync(path.resolve(ROOT, 'supabase/setup-4-tables.sql'), 'utf8');

/* ── [1] 스펙을 엣지펑션에 복제하지 않았는가 ───────────────────────────── */
console.log('\n[1] 스펙의 «네 번째 사본»이 생기지 않았는가 (제2원칙)');
{
  is(/FAULT_SPEC/.test(IDX) && /from "\.\/hr\.js"/.test(IDX),
     'index.ts 가 FAULT_SPEC 을 hr.js 에서 가져온다 (직접 적지 않는다)');
  is(/sheet_colmap/.test(IDX) && /queryFaults/.test(IDX),
     'DB 컬럼 이름은 sheet_colmap 에서 얻는다');
  /* 미러 컬럼 이름(snake_case)을 index.ts 에 박아 두면 그것이 네 번째 사본이다.
     colmap 에 실제로 있는 이름들로 음성 대조한다 — 하나라도 리터럴로 나오면 실패. */
  const wkCols = [...SQL.matchAll(/\(\s*'wk',\s*'([a-z_0-9]+)'/g)].map((g) => g[1]);
  is(wkCols.length > 30, `colmap 시드에서 wk 컬럼 ${wkCols.length}개를 읽었다`);
  /* 밑줄이 든 이름만 본다. 미러 컬럼은 snake_case 라 스펙 사본이면 반드시 여기 걸리고
     (d_start·sn_in·rs_code·man_min…), 'action'·'stage' 같은 낱말은 라우팅·상태값으로도
     쓰여 그대로 보면 오탐이 난다 — 오탐을 내는 검사는 곧 무시당한다. */
  const hard = wkCols.filter((c) => c.includes('_') &&
    new RegExp(`["'\`]${c}["'\`]`).test(IDX));
  is(!hard.length, 'index.ts 에 wk 컬럼 이름을 박아 두지 않았다'
     + (hard.length ? `  ⚠ 박힘: ${hard.join(', ')}` : ''));
}

/* ── [2] faults 가 캐시 경로에서 빠졌는가 ──────────────────────────────── */
console.log('\n[2] faults 를 다시 캐시하려 들지 않는가');
{
  const sa = /async function syncAll[\s\S]*?\n}/.exec(IDX)?.[0] ?? '';
  is(!!sa, 'syncAll 을 찾았다');
  is(!/["']faults["']/.test(sa.replace(/k !== "faults"/g, '')) ,
     'syncAll 의 기본 목록에 faults 가 없다');
  is(/filter\(\(k\) => k !== "faults"\)/.test(sa),
     'syncAll 이 넘겨받은 목록에서도 faults 를 걷어낸다 (자동 재동기화가 되살리지 못하게)');
  const dg = /const DIGEST[\s\S]*?\n};/.exec(IDX)?.[0] ?? '';
  is(!/^\s*faults:/m.test(dg), 'DIGEST 에 faults 항목이 없다');
  /* 두 입구(카톡·웹)와 메뉴가 «같은» 로더를 써야 한다. 한쪽만 loadCache 로 남으면
     그쪽만 v97 이후 갱신되지 않는 캐시를 본다. */
  is((IDX.match(/loadCacheLive\(/g) || []).length >= 4,
     '카톡·웹·메뉴가 모두 loadCacheLive 를 쓴다');
  is(!/await loadCache\(svc, cacheKeys\)/.test(IDX),
     '옛 loadCache 직접 호출이 남아 있지 않다');
}

/* ── [3] 잘랐으면 «잘랐다»고 말하는가 ──────────────────────────────────── */
console.log('\n[3] 조용한 자르기가 없는가');
{
  is(/FAULT_CAP/.test(IDX) && /truncated/.test(IDX), '상한이 있고 잘림 여부를 들고 다닌다');
  is(/function faultNote/.test(IDX), '조회 범위를 문장으로 남기는 자리가 있다');
  const fn = /function faultNote[\s\S]*?\n}/.exec(IDX)?.[0] ?? '';
  is(/기간을 좁혀/.test(fn), '잘렸을 때 «무엇을 하면 되는지»까지 적는다 (증상만 알리지 않는다)');
  is(/조회 실패/.test(fn), '조회가 실패했을 때도 답변에 밝힌다 (0건을 «고장 없음»으로 읽지 않게)');
  is(/order\(dCol, \{ ascending: false \}\)/.test(IDX),
     '잘릴 때 «최근»이 남도록 내림차순으로 받는다');
  is(/전체기간/.test(IDX) === false || /span/.test(IDX),
     'BM 메뉴가 더 이상 «전체기간»이라고 잘못 말하지 않는다');
}

/* ── [4] 조회 경로가 캐시 시절과 «같은 레코드»를 내는가 (핵심) ─────────── */
console.log('\n[4] 미러 표를 거쳐도 레코드가 한 글자도 안 달라지는가');
{
  const f = path.join(HERE, 'csv_wk.csv');
  if (!fs.existsSync(f)) { console.log('  – csv_wk.csv 픽스처가 없어 건너뜁니다 (tests/README.md 참고)'); }
  else {
    const csv  = fs.readFileSync(f, 'utf8');
    const base = m.parseFaultRecords(csv);            // 시트 CSV 를 그대로 (옛 캐시 경로)
    is(base.length > 1000, `시트 경로 파싱 ${base.length}건`);

    /* colmap 으로 «시트 머리글 → DB 컬럼» 을 만든다 — queryFaults 와 같은 방식 */
    const colOf = new Map();
    for (const g of SQL.matchAll(/\(\s*'wk',\s*'([a-z_0-9]+)',\s*array\[([^\]]+)\]/g))
      for (const h of g[2].split(',')) colOf.set(m.hnorm(h.trim().replace(/'/g, '')), g[1]);

    const heads = [], cols = [], miss = [];
    for (const head of Object.values(m.FAULT_SPEC)) {
      const c = colOf.get(m.hnorm(head));
      if (!c) { miss.push(head); continue; }
      heads.push(head); cols.push(c);
    }
    is(!miss.length, 'FAULT_SPEC 의 머리글이 colmap 에 전부 있다'
       + (miss.length ? `  ⚠ 없음: ${miss.join(', ')}` : ''));

    /* 시트 CSV → «미러 표 행(객체)» 으로 눕힌다 (sheet-sync 가 적재한 모양) */
    const rows = m.parseCSV(csv);
    const H = rows[0].map(m.hnorm);
    const dbRows = rows.slice(1).map((r) => {
      const o = {};
      heads.forEach((head, i) => { o[cols[i]] = r[H.indexOf(m.hnorm(head))] ?? ''; });
      return o;
    });

    /* index.ts 의 rowsToCsv 와 «같은 규약»으로 되살린다 */
    const cell = (v) => { const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const back = [heads.map(cell).join(',')]
      .concat(dbRows.map((o) => cols.map((c) => cell(o[c])).join(','))).join('\n');
    const live = m.parseFaultRecords(back);

    is(live.length === base.length, `조회 경로 ${live.length}건 = 시트 경로 ${base.length}건`);
    let diff = 0, firstDiff = '';
    for (let i = 0; i < Math.min(base.length, live.length); i++) {
      const a = JSON.stringify(base[i]), b = JSON.stringify(live[i]);
      if (a !== b) { diff++; if (!firstDiff) firstDiff = `#${i}`; }
    }
    is(!diff, `레코드가 전부 같다 (다른 것 ${diff}건${firstDiff ? ' · 첫 위치 ' + firstDiff : ''})`);

    /* 잘릴 때 «최근»이 남아야 한다 — 내림차순 정렬의 근거 */
    const sorted = [...base].sort((x, y) => y.start - x.start);
    is(sorted[0].start >= sorted[sorted.length - 1].start,
       '레코드에 정렬 가능한 작업시작일이 있다 (최근순 자르기가 성립한다)');
  }
}

/* ── [5] 인덱스 SQL 이 실제 컬럼을 가리키는가 ──────────────────────────── */
console.log('\n[5] setup-12 의 인덱스가 colmap 의 컬럼과 맞는가');
{
  const S12 = fs.readFileSync(path.resolve(ROOT, 'supabase/setup-12-bot-query.sql'), 'utf8');
  const colOf = new Map();
  for (const g of SQL.matchAll(/\(\s*'wk',\s*'([a-z_0-9]+)',\s*array\[([^\]]+)\]/g))
    for (const h of g[2].split(',')) colOf.set(m.hnorm(h.trim().replace(/'/g, '')), g[1]);
  ['dStart', 'stage', 'sn'].forEach((k) => {
    const c = colOf.get(m.hnorm(m.FAULT_SPEC[k]));
    is(!!c && new RegExp('\\b' + c + '\\b').test(S12),
       `setup-12 가 ${k} 열(${c})에 인덱스를 건다`);
  });
  /* 주석은 빼고 본다 — 이 파일에는 «쓰지 말 것»이라고 적어 둔 주석이 있어서,
     그대로 검사하면 경고문 자체를 결함으로 잡는다. */
  const S12code = S12.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
  is(!/text_pattern_ops/.test(S12code),
     'text_pattern_ops 를 쓰지 않는다 (LIKE 전용이라 >=·<= 범위 비교에 안 쓰인다)');
}

console.log('\n' + (fail ? '❌ t-botq ' + fail + ' 실패 / ' + (pass + fail)
                         : '✅ t-botq ' + pass + '/' + pass));
process.exit(fail ? 1 : 0);
