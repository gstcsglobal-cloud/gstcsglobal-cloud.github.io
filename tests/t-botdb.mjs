/* 챗봇 DB 이관 (v82) — kakao-bot 이 Supabase 표에서 되살린 CSV 가
 * 시트 CSV 와 «같은 파싱 결과»를 내는지.
 *
 * kakao-bot 의 fetchCsv 는 이제 시트가 아니라 표를 읽어 시트 모양 CSV 로 되살린다.
 * 파서(hr.js)는 무수정이므로, **복원된 CSV 가 원본과 같은 답을 내는 것**이 이관의
 * 전부다. 여기서 지키는 것:
 *
 *   · mirror(sheet_wk·sheet_inst) — 원본 CSV → (sync toRows 로 표를 시뮬레이트) →
 *     kakao-bot 복원부(rowsToCsv + sheet_colmap 머리글) → 파서.
 *     원본 CSV → 파서와 **레코드 단위로 대조**한다. 파서가 SPEC 에 없는 열을
 *     읽고 있으면 여기서 값 불일치로 터진다 — 봇 답이 조용히 비는 것을 막는 마지막 선.
 *   · import(CIP) — 표 객체 → 복원 CSV → 파서가 원본(밴드 포함 시트 CSV)과 같은
 *     레코드를 내는지. 항목 수(F11 6종 · F16 24종)까지.
 *
 * 세 코드 전부 **배포본에서 떼어 온다**(사본을 검증하면 사본만 맞는다):
 *   sheet-sync 순수 변환부 · kakao-bot 순수 복원부 · hr.js 파서.
 *
 *   node --experimental-strip-types t-botdb.mjs
 */
import fs from 'fs';
import path from 'path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
let bad = 0, n = 0;
const ok  = m => { n++; console.log('  ✅ ' + m); };
const err = m => { n++; bad++; console.log('  ❌ ' + m); };

/* ---------- ① sheet-sync 순수 변환부 (표 시뮬레이트용) ---------- */
const syncSrc = fs.readFileSync(ROOT + '/supabase/functions/sheet-sync/index.ts', 'utf8');
const seg = (a, b) => syncSrc.slice(syncSrc.indexOf(a), syncSrc.indexOf(b));
fs.writeFileSync(HERE + '/sync-extract.ts', [
  seg('function parseCSV', '/* 헤더 전용 정규화'),
  seg('const hnorm =', 'type ColMap'),
  seg('type ColMap', '/* ---------- 순수 변환부'),
  seg('/* ---------- 순수 변환부 ----------', '/* ---------- 순수 변환부 끝 ---------- */'),
  'export { parseCSV, hnorm, planSync, toRows };'].join('\n'));
const { planSync, toRows } = await import('file://' + HERE + '/sync-extract.ts?v=' + Date.now());

/* ---------- ② kakao-bot 순수 복원부 ---------- */
const botSrc = fs.readFileSync(ROOT + '/supabase/functions/kakao-bot/index.ts', 'utf8');
const botCut = botSrc.slice(botSrc.indexOf('/* ---------- 순수 복원부 ----------'),
                            botSrc.indexOf('/* ---------- 순수 복원부 끝 ---------- */'));
if (!botCut || botCut.length < 300) { console.log('❌ kakao-bot 에서 순수 복원부를 못 찾았다 — 표식 주석이 지워졌나'); process.exit(1); }
fs.writeFileSync(HERE + '/bot-extract.ts', botCut + '\nexport { CSV_SKIP, DB_OF_GID, csvCell, rowsToCsv, importOrderCol };');
const BOT = await import('file://' + HERE + '/bot-extract.ts?v=' + Date.now());

/* ---------- ③ hr.js 파서 (배포본 그대로 import) ---------- */
const HR = await import('file://' + ROOT + '/supabase/functions/kakao-bot/hr.js');

/* ---------- ④ colmap — setup-4 DDL 시드에서 (t-mirror 와 같은 출처) ---------- */
const ddl = fs.readFileSync(ROOT + '/supabase/setup-4-tables.sql', 'utf8');
const SPEC = {}, CMAP = {};
for (const m of ddl.matchAll(/insert into public\.sheet_spec\(tbl, gid, hints, scan\) values\s*\n\s*\('([^']+)', '([^']+)', '(.+?)'::jsonb, (\d+)\);/g))
  SPEC[m[1]] = { gid: m[2], hints: JSON.parse(m[3].replace(/''/g, "'")), scan: +m[4] };
for (const m of ddl.matchAll(/insert into public\.sheet_colmap\(tbl, col, headers, optional, ord\) values\n([\s\S]*?);\n/g)) {
  for (const r of m[1].matchAll(/\('([^']+)', '([^']+)', array\[(.*?)\], (true|false), (\d+)\)/g)) {
    (CMAP[r[1]] ??= []).push({
      col: r[2],
      headers: [...r[3].matchAll(/'((?:[^']|'')*)'/g)].map(x => x[1].replace(/''/g, "'")),
      optional: r[4] === 'true', ord: +r[5], idx: -1,
    });
  }
}

const rec2s = (r, fields) => fields.map(f => {
  const v = r[f];
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '');
}).join('|');

/* ---------- [1] mirror — 원본 파싱 == 표 경유 복원 파싱 ---------- */
const MIRROR = [
  /* fields = 파서가 내놓는 «전부» (awk 로 실측 추출). 하나라도 빠뜨리면
     그 필드가 SPEC 밖 열을 읽어도 여기서 안 걸린다. */
  { key: 'wk',   file: 'csv_wk.csv',   parse: t => HR.parseFaultRecords(t),
    fields: ['rs','sn','site','fab','custB','model','bay','stage','proc','detail','start','end',
             'manhour','paid','alarm','phenom','cause','action'] },
  { key: 'inst', file: 'csv_inst.csv', parse: t => HR.parseInstall(t),
    fields: ['sn','code','fab','floor','model','type','customer','country','location','bay',
             'chambers','burner','turnOn','warranty'] },
];
for (const M of MIRROR) {
  console.log(`\n[${M.key}] mirror — 원본 CSV 파싱 == 표 복원 CSV 파싱`);
  const p = path.join(HERE, M.file);
  if (!fs.existsSync(p)) { globalThis.__skipped = (globalThis.__skipped||0)+1; console.log('  … 픽스처 없음 — 건너뜀'); continue; }
  const text = fs.readFileSync(p, 'utf8');

  const orig = M.parse(text);

  // 표 시뮬레이트: sync 와 같은 변환으로 행 객체를 만들고, 복원부로 CSV 를 되살린다
  const cmap = CMAP[M.key].map(c => ({ ...c }));
  const plan = planSync(SPEC[M.key], cmap, text);
  const tableRows = toRows(plan.data, plan.cmap, plan.hi + 1, plan.header);
  const sorted = CMAP[M.key].slice().sort((a, b) => a.ord - b.ord);
  const head = sorted.map(c => c.headers[0]);
  const cols = sorted.map(c => c.col);
  const restoredCsv = BOT.rowsToCsv(head, cols, tableRows);
  const rest = M.parse(restoredCsv);

  orig.length === rest.length ? ok(`레코드 수 ${orig.length} == ${rest.length}`)
                              : err(`레코드 수 ${orig.length} != ${rest.length}`);
  let diff = 0;
  for (let i = 0; i < Math.min(orig.length, rest.length); i++) {
    const a = rec2s(orig[i], M.fields), b = rec2s(rest[i], M.fields);
    if (a !== b && ++diff <= 3) console.log(`    행${i}:\n      원본 ${a}\n      복원 ${b}`);
  }
  diff === 0 ? ok(`전 레코드 ${M.fields.length}필드 일치 — 파서가 읽는 열이 전부 SPEC 안에 있다`)
             : err(`값 불일치 ${diff}건 — 파서가 읽는 열이 SPEC(미러)에 없을 가능성`);
}

/* ---------- [2] import — CIP 표 객체 → 복원 CSV → 원본과 같은 레코드 ---------- */
for (const [file, site, wantItems] of [['csv_cip11.csv', 'F11', 6], ['csv_cip16.csv', 'F16', 24]]) {
  console.log(`\n[cip ${site}] import — 표 복원 CSV 가 원본과 같은 레코드를 내는지`);
  const p = path.join(HERE, file);
  if (!fs.existsSync(p)) { globalThis.__skipped = (globalThis.__skipped||0)+1; console.log('  … 픽스처 없음 — 건너뜀'); continue; }
  const text = fs.readFileSync(p, 'utf8');
  const Papa = (await import('papaparse')).default;
  const rows = Papa.parse(text, { skipEmptyLines: false }).data;

  // Import 표 시뮬레이트: 시트 1행이 헤더(0행은 적용일자 띠 — mkcsv 가 뺐다).
  // 중복 이름은 mkcsv 처럼 _n 접미로 유일하게 만든다(표 컬럼은 중복될 수 없다).
  const hdr = rows[1].map(h => String(h ?? '').trim());
  const seen = {}, names = hdr.map((h, i) => {
    let nm = h || ('col' + (i + 1));
    while (seen[nm]) { seen[nm] += 1; nm = nm + '_' + seen[nm]; }
    seen[nm] = 1; return nm;
  });
  const objs = rows.slice(2)
    .filter(r => r.some(c => String(c ?? '').trim() !== ''))
    .map(r => Object.fromEntries(names.map((nm, i) => [nm, String(r[i] ?? '')])));

  const restoredCsv = BOT.rowsToCsv(names, names, objs);
  const orig = HR.parseCIP(text, site);
  const rest = HR.parseCIP(restoredCsv, site);

  const items = new Set(rest.map(r => r.item)).size;
  items === wantItems ? ok(`항목 ${items}종 (기대 ${wantItems})`) : err(`항목 ${items}종 (기대 ${wantItems})`);
  orig.length === rest.length ? ok(`레코드 수 ${orig.length} == ${rest.length}`)
                              : err(`레코드 수 ${orig.length} != ${rest.length}`);
  const key = r => [r.site, r.item, r.sn, r.done instanceof Date ? r.done.toISOString().slice(0, 10) : r.done].join('|');
  const A = orig.map(key).sort().join('\n'), B = rest.map(key).sort().join('\n');
  A === B ? ok('레코드 내용 일치 (site·item·sn·done)') : err('레코드 내용이 다르다');
}

/* ---------- [3] 정렬 열 선택 — core.js 와 같은 규칙인지 (점 든 이름 배제) ---------- */
console.log('\n[3] importOrderCol — core.js _csvOrderCol 과 같은 답인지');
{
  const G = await (async () => {
    global.window = {}; global.document = { createElement: () => ({ style: {} }), getElementById: () => null,
      querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: {}, head: {}, readyState: 'complete' };
    global.window.addEventListener = () => {}; global.window.location = { href: '', search: '' };
    global.window.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    global.window.matchMedia = () => ({ matches: false, addEventListener() {} });
    global.window.self = global.window.top = global.window;
    global.localStorage = global.window.localStorage; global.location = global.window.location;
    try { new Function(fs.readFileSync(ROOT + '/assets/core.js', 'utf8'))(); } catch (e) {}
    return global.window.GST || global.GST;
  })();
  const cases = [
    ['id', 'No.', 'ID'], ['No', '인원'], ['No.', 'ID', 'Date of entry'], ['항목', '휴가시작일'],
  ];
  for (const keys of cases) {
    const a = BOT.importOrderCol(keys), b = G._csvOrderCol(keys);
    a === b ? ok(`[${keys.join(', ')}] → '${a}' (둘 다)`) : err(`[${keys.join(', ')}] bot '${a}' != core '${b}'`);
  }
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

