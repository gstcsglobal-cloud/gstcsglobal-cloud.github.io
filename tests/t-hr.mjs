// hr.js 파서를 실제 시트 CSV로 돌려, 열 번호 고정이던 시절과 같은 결과가 나오는지 본다.
// 이름 기반으로 바꾼 것이 '동작 변경 없음'이어야 통과다.
import fs from 'fs';
import path from 'path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const HR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../supabase/functions/kakao-bot/hr.js');
const m = await import(HR);

const read = (f) => fs.readFileSync(path.join(HERE, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; } else { fail++; console.log('  ❌ ' + msg); } };

/* ── 설치현황 ───────────────────────────────────────── */
const inst = m.parseInstall(read('csv_inst.csv'));
console.log(`설치현황: ${inst.length}대`);
const s0 = inst[0];
console.log('  첫 행:', JSON.stringify({sn:s0.sn, code:s0.code, fab:s0.fab, floor:s0.floor,
  bay:s0.bay, model:s0.model, group1:s0.group1, detail1:s0.detail1,
  turnOn: s0.turnOn && s0.turnOn.toISOString().slice(0,10), warranty:s0.warranty, chambers:s0.chambers}));
/* 이 1490은 «픽스처»의 대수지 시트의 대수가 아니다. 시트는 계속 는다 —
   2026-08-13 실측 1,515대. 픽스처를 새로 뜨면 여기가 먼저 실패하는데,
   그건 파서가 깨진 게 아니라 모집단이 바뀐 것이다. 새 숫자를 확인하고
   여기와 tests/README.md 기준값을 같이 올린다. */
ok(inst.length === 1490, `설치 대수 기대 1490(픽스처 기준) → ${inst.length}`);
ok(s0.sn === 'GBWS-6870', `첫 S/N 기대 GBWS-6870 → ${s0.sn}`);
ok(s0.code === 'TDALNBV100', `code 기대 TDALNBV100 → ${s0.code}`);
ok(s0.fab === 'F16N', `fab 기대 F16N → ${s0.fab}`);
ok(s0.model === 'GAIA-I-D', `model 기대 GAIA-I-D → ${s0.model}`);
ok(s0.group1 === 'TF', `group1 기대 TF → ${s0.group1}`);
// 챔버: Scrubber type(75열)이 DUAL인 설비가 실제로 존재해야 한다 (Type 44열을 잘못 잡으면 전부 1)
const dual = inst.filter((x) => x.chambers === 2).length;
console.log(`  DUAL 챔버: ${dual}대 / ${inst.length}`);
ok(dual > 100, `DUAL이 ${dual}대뿐 — 'Type'(44열)을 잘못 잡았을 가능성`);
// 보증 라벨도 값이 들어와야 한다
const wIn = inst.filter((x) => /IN/i.test(x.warranty)).length;
ok(wIn > 0, `Warranty In/Out이 비어 있다`);

/* ── 수선실적 ───────────────────────────────────────── */
const fa = m.parseFaultRecords(read('csv_wk.csv'));
console.log(`\n수선실적: ${fa.length}건`);
const f0 = fa[0];
console.log('  첫 행:', JSON.stringify({rs:f0.rs, stage:f0.stage, sn:f0.sn, site:f0.site,
  model:f0.model, paid:f0.paid, manhour:f0.manhour}));
ok(fa.length > 15000, `수선 행수가 너무 적다 (${fa.length})`);
ok(/^RS\d+/.test(f0.rs), `rs가 실적코드 형식이 아니다 → ${f0.rs}`);
ok(['BM','CBM','CM','CRM','TBM','기타','반입','SET-UP','TURN-ON','TURN-OFF'].includes(f0.stage),
   `stage 값이 이상하다 → ${f0.stage}`);
ok(/^GBWS-|^WS-|^DBW-/.test(f0.sn), `sn이 S/N 형식이 아니다 → ${f0.sn}`);
const stages = {}; fa.forEach((x) => stages[x.stage] = (stages[x.stage] || 0) + 1);
console.log('  단계 분포:', Object.entries(stages).sort((a,b)=>b[1]-a[1]).slice(0,5));
ok((stages.TBM || 0) > 9000, `TBM이 ${stages.TBM}건 — 열을 잘못 잡았을 가능성`);
ok(fa.filter((x) => x.manhour > 0).length > 10000, `manhour가 대부분 0 — 작업공수 열 오인식`);
ok(fa.filter((x) => /유상|무상/.test(x.paid)).length > 10000, `유/무상(paid) 값이 비어 있다`);

/* ── CIP ────────────────────────────────────────────── */
for (const [site, file, wantItems] of [['F11','csv_cip11.csv',6], ['F16','csv_cip16.csv',24]]) {
  const recs = m.parseCIP(read(file), site);
  const items = [...new Set(recs.map((r) => r.item))];
  console.log(`\nCIP ${site}: ${recs.length}건 · 항목 ${items.length}종`);
  console.log('  항목:', items.slice(0, 4));
  ok(recs.length > 0, `CIP ${site} 결과가 비었다`);
  // 항목 수는 'FAB In'~'Remark' 사이 열 개수(빈 머리글 제외)와 같아야 한다
  ok(items.length === wantItems, `CIP ${site} 항목 ${items.length}종 (기대 ${wantItems})`);
  ok(recs.every((r) => r.sn && /\w/.test(String(r.sn))), `CIP ${site} sn이 비었다`);
}

/* ── 밀림 추종: 앞쪽에 열 2개를 끼워 넣어도 같은 결과인가 ── */
const { default: Papa } = await import('papaparse');
function shift(csv, at) {
  const rows = Papa.parse(csv, { skipEmptyLines: true }).data;
  rows.forEach((r, i) => r.splice(at, 0, i === 0 ? '신규A' : '', i === 0 ? '신규B' : ''));
  return Papa.unparse(rows);
}
console.log('\n── 열 2개 삽입 후 재파싱 ──');
const inst2 = m.parseInstall(shift(read('csv_inst.csv'), 3));
ok(inst2.length === inst.length && inst2[0].sn === s0.sn && inst2[0].chambers === s0.chambers,
   `설치: 삽입 후 결과가 달라졌다 (${inst2.length} vs ${inst.length}, sn ${inst2[0]?.sn})`);
console.log(`  설치 ${inst2.length}대 · 첫 S/N ${inst2[0]?.sn} · DUAL ${inst2.filter(x=>x.chambers===2).length}대`);
const fa2 = m.parseFaultRecords(shift(read('csv_wk.csv'), 3));
ok(fa2.length === fa.length && fa2[0].rs === f0.rs && fa2[0].stage === f0.stage,
   `수선: 삽입 후 결과가 달라졌다 (${fa2.length} vs ${fa.length})`);
console.log(`  수선 ${fa2.length}건 · 첫 실적코드 ${fa2[0]?.rs}`);

/* ── 이름을 바꾸면 조용히 넘어가지 않는가 ── */
console.log('\n── 헤더 이름 변경 감지 ──');
const renamed = (() => {
  const rows = Papa.parse(read('csv_wk.csv'), { skipEmptyLines: true }).data;
  rows[0][13] = '작업단계구분';                 // 힌트 열 이름 변경
  return Papa.unparse(rows);
})();
let threw = false;
try { m.parseFaultRecords(renamed); } catch (e) { threw = /NO_HEADER/.test(e.message); }
ok(threw, '힌트 열 이름이 바뀌었는데 NO_HEADER를 던지지 않았다 (조용히 통과)');
console.log('  ✓ 힌트 열 이름 변경 시 NO_HEADER');

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
