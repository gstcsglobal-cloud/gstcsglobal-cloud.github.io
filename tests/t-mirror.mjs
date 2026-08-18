/* 미러 이관 검증 — Supabase로 옮긴 뒤에도 화면이 **같은 값**을 보는지.
 *
 * 대조하는 것은 두 경로다:
 *   ① 지금 경로  시트 CSV → GST.SM.map (대시보드가 쓰는 파서)
 *   ② 새 경로    시트 CSV → sheet-sync의 planSync → 미러 표 → 화면
 * 열마다 체크섬을 떠서 둘이 한 글자도 다르지 않은지 본다.
 * 행수만 맞춰서는 아무것도 증명되지 않는다 — 열이 한 칸 밀려도 행수는 그대로다.
 *
 * 검증 대상 코드를 **복사하지 않는다.** sheet-sync/index.ts에서 순수 변환부를 실행 시
 * 떼어내 쓴다(t-sync가 sheet-write에 쓰는 방식과 같다). 사본을 검증하면 사본만 맞는다.
 *
 *   node t-mirror.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Papa from 'papaparse';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const SYNC = ROOT + '/supabase/functions/sheet-sync/index.ts';
const DDL  = ROOT + '/supabase/setup-4-tables.sql';

const FIX = { wk: 'csv_wk.csv', mat: 'csv_mat.csv', inst: 'csv_inst.csv' };
let bad = 0, n = 0;
const ok  = m => { n++; console.log('  ✅ ' + m); };
const err = m => { n++; bad++; console.log('  ❌ ' + m); };

/* ---------- 1. sheet-sync의 순수 변환부를 떼어낸다 ---------- */
const src = fs.readFileSync(SYNC, 'utf8');
const cut = src.slice(
  src.indexOf('/* ---------- 순수 변환부 ----------'),
  src.indexOf('/* ---------- 순수 변환부 끝 ---------- */'));
if (!cut || cut.length < 500) { console.log('❌ sheet-sync에서 순수 변환부를 못 찾았다 — 표식 주석이 지워졌나'); process.exit(1); }

const parseCSVSrc = src.slice(src.indexOf('function parseCSV'), src.indexOf('/* 헤더 전용 정규화'));
const hnormSrc    = src.slice(src.indexOf('const hnorm ='), src.indexOf('type ColMap'));
const typeSrc     = src.slice(src.indexOf('type ColMap'), src.indexOf('/* ---------- 순수 변환부'));
/* TS를 그대로 .ts로 떨궈 노드의 타입 스트리핑에 맡긴다. 정규식으로 타입을 걷어내면
   `([] as string[]).concat` 같은 표기에서 반드시 깨진다 — 실제로 깨졌다.
   sw-extract.ts와 같은 중간 산물이고 커밋하지 않는다. */
const tmp = HERE + '/sync-extract.ts';
fs.writeFileSync(tmp, [parseCSVSrc, hnormSrc, typeSrc, cut,
  'export { parseCSV, hnorm, planSync, toRows };'].join('\n'));
const { parseCSV, hnorm, planSync, toRows } = await import('file://' + tmp + '?v=' + Date.now());

/* ---------- 2. 대시보드 파서(GST.SM)를 띄운다 ---------- */
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

/* ---------- 3. DDL 시드에서 스펙을 읽는다 (엣지펑션이 DB에서 읽는 그 값) ---------- */
const ddl = fs.readFileSync(DDL, 'utf8');
const SPEC = {}, CMAP = {};
for (const m of ddl.matchAll(/insert into public\.sheet_spec\(tbl, gid, hints, scan\) values\s*\n\s*\('([^']+)', '([^']+)', '(.+?)'::jsonb, (\d+)\);/g))
  SPEC[m[1]] = { gid: m[2], hints: JSON.parse(m[3].replace(/''/g, "'")), scan: +m[4] };
for (const m of ddl.matchAll(/insert into public\.sheet_colmap\(tbl, col, headers, optional, ord\) values\n([\s\S]*?);\n/g)) {
  for (const r of m[1].matchAll(/\('([^']+)', '([^']+)', array\[(.*?)\], (true|false), (\d+)\)/g)) {
    (CMAP[r[1]] ??= []).push({
      col: r[2],
      headers: [...r[3].matchAll(/'((?:[^']|'')*)'/g)].map(x => x[1].replace(/''/g, "'")),
      optional: r[4] === 'true', idx: -1,
    });
  }
}

/* ---------- 4. 시드가 core.js SPEC과 어긋나지 않았는지 ----------
   setup-4-tables.sql은 생성물이다. SPEC을 고치고 생성기를 안 돌리면 여기서 갈라진다.
   갈라진 채로 배포하면 새 열이 미러에만 없어 화면에서 조용히 빈다. */
console.log('\n[1] DDL 시드 ↔ core.js SPEC');
const snake = s => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
for (const k of Object.keys(FIX)) {
  const S = G.SM.SPEC[k];
  const want = Object.keys(S.fields).map(snake);
  const got = (CMAP[k] || []).map(c => c.col);
  if (JSON.stringify(want) !== JSON.stringify(got))
    err(`${k}: 컬럼 목록 불일치 — \`node supabase/gen-ddl.mjs\`를 다시 돌려라\n       빠짐: ${want.filter(x => !got.includes(x))} / 남음: ${got.filter(x => !want.includes(x))}`);
  else if (SPEC[k].gid !== S.gid) err(`${k}: gid ${SPEC[k].gid} ≠ SPEC ${S.gid}`);
  else ok(`${k}: ${want.length}열 · gid ${S.gid} 일치`);
}

/* ---------- 5. hnorm이 GST.SM.norm과 문자 단위로 같은지 ----------
   여기가 갈라지면 헤더를 못 찾거나, 더 나쁘게는 **다른 열**을 찾는다. */
console.log('\n[2] hnorm ↔ GST.SM.norm');
const PROBE = ['Scrubber\nS/N', 'Main Tool\nMaker', '총 이동시간(분)', '유/무상', 'MODEL(자사)',
  'ＦＡＢ', 'Scrubber Lv.2', '  실적코드  ', '세부공정', 'N2 Purge (slm)', 'S/N(IN)'];
const diff = PROBE.filter(p => hnorm(p) !== G.SM.norm(p));
diff.length ? err('정규화가 갈라짐: ' + diff.map(d => JSON.stringify(d)).join(', '))
            : ok(`${PROBE.length}종 표본 전부 동일`);

/* ---------- 6. 두 경로가 같은 값을 내는지 (본 검사) ---------- */
console.log('\n[3] 시트 경로 ↔ 미러 경로 (열별 체크섬)');
const md5 = a => crypto.createHash('md5').update(a.join('\n')).digest('hex');
for (const [k, file] of Object.entries(FIX)) {
  const p = path.join(HERE, file);
  if (!fs.existsSync(p)) { globalThis.__skipped = (globalThis.__skipped||0)+1; console.log(`  … ${k}: 픽스처 없음 — tests/README.md 참조`); continue; }
  const text = fs.readFileSync(p, 'utf8');

  // ① 대시보드 경로
  const rows = Papa.parse(text, { skipEmptyLines: false }).data;
  const m = G.SM.map(rows, G.SM.SPEC[k]);
  if (!m.ok) { err(`${k}: GST.SM이 열을 못 찾음 — ${m.miss.join(', ')}`); continue; }
  const sheetData = rows.slice(m.hi + 1).filter(r => r.some(c => String(c ?? '').trim() !== ''));

  // ② 미러 경로 — sheet-sync가 실제로 쓰는 코드
  let plan;
  try { plan = planSync(SPEC[k], CMAP[k].map(c => ({ ...c })), text); }
  catch (e) { err(`${k}: planSync 실패 — ${e.message}`); continue; }

  if (plan.hi !== m.hi) { err(`${k}: 헤더 행이 다름 — 시트경로 ${m.hi} ≠ 미러경로 ${plan.hi}`); continue; }
  if (plan.data.length !== sheetData.length) {
    err(`${k}: 행수 ${sheetData.length} ≠ ${plan.data.length}`); continue;
  }

  let mism = 0;
  for (const c of plan.cmap) {
    const key = Object.keys(G.SM.SPEC[k].fields).find(f => snake(f) === c.col);
    const si = m.C[key];
    const a = sheetData.map(r => String((si >= 0 ? r[si] : '') ?? ''));
    const b = plan.data.map(r => String((c.idx >= 0 ? r[c.idx] : '') ?? ''));
    if (md5(a) !== md5(b)) { mism++; console.log(`       차이: ${k}.${c.col} (시트 열 ${si} ≠ 미러 열 ${c.idx})`); }
  }
  mism ? err(`${k}: ${mism}열이 다름`)
       : ok(`${k}: ${sheetData.length}행 × ${plan.cmap.length}열 전부 일치`);
}

/* ---------- 7. 열이 밀려도 따라가는지 ---------- */
/* 미러가 열 번호를 굳혀버리면 이관의 의미가 없다. t-shift와 같은 방식으로 확인한다. */
console.log('\n[4] 시트에 열을 끼워 넣어도 같은 값을 잡는지');
{
  const text = fs.existsSync(path.join(HERE, FIX.inst)) ? fs.readFileSync(path.join(HERE, FIX.inst), 'utf8') : '';
  if (!text) { globalThis.__skipped = (globalThis.__skipped||0)+1; console.log('  … 픽스처 없음 — 건너뜀'); }
  else {
    const rows = Papa.parse(text, { skipEmptyLines: false }).data;
    const base = planSync(SPEC.inst, CMAP.inst.map(c => ({ ...c })), text);
    /* 3열째에 새 열 두 개를 끼운다.
       비어 있던 행(구글시트의 빈 격자)에는 값을 넣지 않는다 — 넣으면 그 행들이
       '데이터 행'으로 되살아나 1,490행이 2,221행이 되고, 비교가 엉뚱한 곳에서 어긋난다. */
    const shifted = rows.map((r, i) => {
      const c = r.slice();
      const blank = i > 0 && !r.some(v => String(v ?? '').trim() !== '');
      c.splice(3, 0, i === 0 ? '신규열A' : (blank ? '' : 'x'),
                     i === 0 ? '신규열B' : (blank ? '' : 'y'));
      return c;
    });
    const sText = Papa.unparse(shifted);
    const after = planSync(SPEC.inst, CMAP.inst.map(c => ({ ...c })), sText);
    const pick = (p, d, col) => {
      const c = p.cmap.find(x => x.col === col);
      return d.slice(0, 200).map(r => String(r[c.idx] ?? ''));
    };
    const same = ['sn', 'code', 'fab', 'model'].every(c => md5(pick(base, base.data, c)) === md5(pick(after, after.data, c)));
    same ? ok('열 2개 삽입 후에도 sn·code·fab·model이 같은 값') : err('열 삽입 후 값이 달라졌다 — 열 번호가 굳었다');
  }
}

/* ---------- 8. 이름이 바뀌면 조용히 넘어가지 않는지 ---------- */
console.log('\n[5] 필수 열 이름이 바뀌면 멈추는지');
{
  const text = fs.existsSync(path.join(HERE, FIX.inst)) ? fs.readFileSync(path.join(HERE, FIX.inst), 'utf8') : '';
  if (!text) { globalThis.__skipped = (globalThis.__skipped||0)+1; console.log('  … 픽스처 없음 — 건너뜀'); }
  else {
    const rows = Papa.parse(text, { skipEmptyLines: false }).data;
    const req = CMAP.inst.find(c => !c.optional && c.col === 'sn');
    const hi = 0;
    const broken = rows.map(r => r.slice());
    const at = broken[hi].findIndex(h => req.headers.some(n => hnorm(n) === hnorm(h)));
    if (at < 0) { console.log('  … sn 헤더를 못 찾아 건너뜀'); }
    else {
      broken[hi][at] = '엉뚱한이름';
      try {
        planSync(SPEC.inst, CMAP.inst.map(c => ({ ...c })), Papa.unparse(broken));
        err('이름이 바뀌었는데 통과했다 — 조용한 폴백이 생겼다');
      } catch (e) {
        /^NO_COL|^NO_HEADER/.test(e.message) ? ok('멈춘다: ' + e.message.slice(0, 60))
                                             : err('다른 이유로 죽었다: ' + e.message);
      }
    }
  }
}

/* ---------- 9. sheet-proxy 허용목록이 «읽는 쪽 전부»를 덮는지 ----------
   v78에서 sheet-proxy가 gid 허용목록을 갖게 됐다. 목록에서 빠진 gid는 400으로 거절되는데,
   페이지 입장에서는 그 시트만 조용히 비는 것으로 보인다 — 에러 배너도 안 뜬다.
   그래서 사람 눈으로 지키지 않고 여기서 대조한다. */
console.log('\n[6] sheet-proxy 허용목록이 모든 소비자를 덮는지');
{
  const PROXY = ROOT + '/supabase/functions/sheet-proxy/index.ts';
  const psrc = fs.readFileSync(PROXY, 'utf8');
  const block = psrc.slice(psrc.indexOf('const ALLOW_GID'), psrc.indexOf('/* ====='));
  const allow = new Set([...block.matchAll(/"(\d+)"\s*:/g)].map(m => m[1]));
  if (!allow.size) err('sheet-proxy에서 ALLOW_GID를 못 읽었다 — 블록 표식이 바뀌었나');
  else {
    // 소비자 ①: 대시보드 페이지들이 URL에 박아 쓰는 gid
    const want = new Map();               // gid → 어디서 쓰나
    for (const p of ['fault','material','pm','scrubber','tco','report','cip','hr']) {
      const f = ROOT + '/' + p + '/index.html';
      if (!fs.existsSync(f)) continue;
      const h = fs.readFileSync(f, 'utf8');
      for (const m of h.matchAll(/gid=(\d+)|GID_[A-Z0-9]+\s*=\s*'(\d+)'/g))
        (want.get(m[1] ?? m[2]) ?? want.set(m[1] ?? m[2], []).get(m[1] ?? m[2])).push(p);
    }
    // 소비자 ②: kakao-bot의 GID 표
    const ksrc = fs.readFileSync(ROOT + '/supabase/functions/kakao-bot/index.ts', 'utf8');
    const kblk = ksrc.slice(ksrc.indexOf('const GID'), ksrc.indexOf('const GID') + 400);
    for (const m of kblk.matchAll(/:\s*"(\d+)"/g))
      (want.get(m[1]) ?? want.set(m[1], []).get(m[1])).push('kakao-bot');
    // 소비자 ③: core.js SPEC (미러 경로도 결국 sheet-proxy를 통해 채워진다)
    for (const k of Object.keys(SPEC))
      (want.get(SPEC[k].gid) ?? want.set(SPEC[k].gid, []).get(SPEC[k].gid)).push('SPEC.' + k);

    const missing = [...want.keys()].filter(g => !allow.has(g));
    missing.length
      ? err(`허용목록에 없는 gid ${missing.length}개: ` +
            missing.map(g => `${g}(${[...new Set(want.get(g))].join(',')})`).join(' · '))
      : ok(`소비자 ${want.size}개 gid 전부 허용됨`);

    const unused = [...allow].filter(g => !want.has(g));
    if (unused.length) console.log(`     · 참고: 아무도 안 쓰는 허용 gid ${unused.length}개 — ${unused.join(', ')}`);
  }
}

/* ---------- 10. 시트를 지워도 되는가 — «한 열도 안 잃는지» ----------
   미러는 원래 대시보드가 쓰는 열만 복사했다(설치현황 111열 중 25열). 시트를 원장에서
   내리려면 그것만으로는 손실이다. `extra`(SPEC 밖 열 전부)가 나머지를 실제로 담는지 본다.
   담기지 않은 열이 하나라도 있으면 **시트를 지우면 안 된다.** */
console.log('\n[7] 시트의 모든 열이 미러에 담기는지 (extra 포함)');
for (const k of ['wk', 'mat', 'inst']) {
  const f = path.join(HERE, FIX[k]);
  if (!fs.existsSync(f)) { globalThis.__skipped = (globalThis.__skipped||0)+1; console.log(`  … ${k} 픽스처 없음 — 건너뜀`); continue; }
  const plan = planSync(SPEC[k], CMAP[k].map(c => ({ ...c })), fs.readFileSync(f, 'utf8'));
  // 전 행을 돌린다. 일부만 떼어 담아놓고 «전체»에서 값을 찾으면, 뒤쪽에만 값이 있는 열이
  // 유실로 오진된다(실제로 wk 의 '스크러버 설비구분'이 그렇게 잡혔다). 양쪽 범위를 맞춘다.
  const rows = toRows(plan.data, plan.cmap, 0, plan.header);
  const mapped = new Set(plan.cmap.filter(c => c.idx >= 0).map(c => c.idx));
  const hasVal = i => plan.data.some(r => String(r[i] ?? '').trim() !== '');
  // 값이 하나라도 있는 «이름 있는» 열은 전부 담겨야 한다
  const named = plan.header.map((h, i) => ({ i, h: String(h ?? '').trim() })).filter(x => x.h);
  const lost = named.filter(x => !mapped.has(x.i)).filter(x =>
    hasVal(x.i) && !rows.some(o => o.extra && x.h in o.extra));
  // 이름 없는 열에 값이 들어 있으면 담을 키가 없다 — 이건 시트를 고쳐야 한다
  const unnamed = plan.header.map((h, i) => ({ i, h: String(h ?? '').trim() }))
    .filter(x => !x.h && hasVal(x.i));
  const extraN = new Set(); rows.forEach(o => o.extra && Object.keys(o.extra).forEach(x => extraN.add(x)));
  lost.length
    ? err(`${k}: 미러에 안 담기는 열 ${lost.length}개 — ${lost.slice(0,5).map(x=>x.h).join(', ')}`)
    : ok(`${k}: 시트 ${named.length}열 = 매핑 ${mapped.size} + extra ${extraN.size} · 유실 0`);
  if (unnamed.length)
    console.log(`     ⚠ 머리글이 빈 열에 값이 있다 (${unnamed.map(x=>'col'+x.i).join(', ')}) — 담을 키가 없으니 시트에 이름을 붙여야 한다`);
}

fs.unlinkSync(tmp);
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

