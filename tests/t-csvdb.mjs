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
  if (!fs.existsSync(p)) { console.log(`  … ${site} 픽스처 없음 — 건너뜀`); continue; }
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

console.log(`\n${bad ? '❌' : '✅'} ${n - bad}/${n} 통과`);
process.exit(bad ? 1 : 0);
