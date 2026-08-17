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

/* ── 봇이 실제로 보는 머리글로 설치현황을 읽는가 (v96) ──────────────────────
   봇은 이제 시트가 아니라 미러 표를 읽고, 머리글을 sheet_colmap 의 «첫 별칭»으로
   되살린다(v82 `fetchCsv`). 그래서 봇이 보는 이름은 시트 머리글이 아니라 **colmap
   첫 별칭**이다 — 이 둘이 갈리면 파서가 죽는데 화면에는 아무 흔적이 없다.
   실측: 2026-08-17 bot_cache 의 equipment 가 `NO_HEADER` 였다. 원인은 colmap 의
   inst.fab 이 v96 에서 `Line 1` 로 바뀌었는데 hr.js 는 여전히 'FAB' 을 헤더 힌트로
   쓰고 있던 것. 그래서 여기서는 «시트 CSV» 가 아니라 **colmap 시드에서 머리글을
   재구성해** 먹인다 — 그래야 다음에 별칭 순서를 바꿔도 여기서 먼저 걸린다. */
{
  const SQL = fs.readFileSync(path.join(HERE, '../supabase/setup-4-tables.sql'), 'utf8');
  const head = [];
  for (const g of SQL.matchAll(/\(\s*'inst',\s*'[a-z_0-9]+',\s*array\[([^\]]+)\]/g))
    head.push(g[1].split(',')[0].trim().replace(/'/g, ''));
  ok(head.length > 20, `colmap 시드에서 inst 머리글을 뽑았다 → ${head.length}열`);
  ok(head.includes('Line 1'), `colmap 의 fab 첫 별칭이 'Line 1' 이다 (국내 라인 축의 규약)`);

  const cell = (h) => h === 'Scrubber S/N' ? 'ZZZ-0001' : h === 'Scrubber CODE' ? 'ZCODE1'
    : h === 'Scrubber type' ? 'DUAL' : h === 'Line 1' ? 'H1' : h === 'Floor' ? '1F' : 'x';
  const dbCsv = head.join(',') + '\n' + head.map(cell).join(',') + '\n';
  let rec = null, err = '';
  try { rec = m.parseInstall(dbCsv)[0]; } catch (e) { err = e.message; }
  ok(rec, `DB 복원 머리글로 parseInstall 이 돈다 ${err ? '→ ' + err : ''}`);
  ok(rec && rec.fab === 'H1', `그 경로에서 fab 을 'Line 1' 열에서 읽는다 → ${rec && rec.fab}`);
  ok(rec && rec.chambers === 2, `챔버 판정이 산다 (Scrubber type=DUAL) → ${rec && rec.chambers}`);
  ok(rec && rec.floor === '1F', `floor 도 잡힌다 → ${rec && rec.floor}`);
}

/* ── 인원명단 양식 세 벌을 다 읽는가 (v96) ─────────────────────────────────
   봇의 parseRoster 가 «영문 양식 전용»이라 한글 양식을 통째로 못 읽고 있었다.
   'date of entry' 를 못 찾으면 join 이 undefined 라 전 행이 continue 되어 0명이 되고,
   봇은 「인원 데이터가 없습니다」라고 답한다 — 에러는 하나도 안 난다.
   대시보드(report·hr)는 진작 두 양식을 받는데 이 사본만 안 따라왔다(제2원칙).
   값은 전부 지어낸 것이다. */
{
  const q = (v) => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  const csv = (rows) => rows.map(r => r.map(q).join(',')).join('\n');

  // ① 옛 영문 양식
  const EN = csv([
    ['No.','ID','Name(영문)','Work Place','Date of entry','Resignation','직급','조직도','현장 인원여부'],
    ['1','90000001','AA','F16','2024-01-02','','과장','Scrubber','O'],
    ['2','90000002','BB','F11','2023-05-01','','대리','Chiller','O'],
  ]);
  // ② 한글 양식 (ID 가 사번을 담던 판)
  const KO1 = csv([
    ['No.','인사','ID','이름(영문)','직급(한글)','담당구분','단지','라인','입사일','퇴사일','현장 인원여부'],
    ['1','재직','90000003','CC','과장','Scrubber','F16','','2024-01-02','','O'],
    ['2','재직','90000004','DD','대리','Chiller','F11','','2023-05-01','','O'],
  ]);
  // ③ 새 양식 — 사번 열이 «맨 뒤»이고 옛 ID 열은 빈 채로 남아 있다(ALTER 로 열을 뒤에 붙였다)
  const KO2 = csv([
    ['No.','인사','ID','이름(영문)','직급(한글)','담당구분','단지','라인','입사일','퇴사일','현장 인원여부','구분','운영단위','사원번호'],
    ['1','재직','','EE','과장','Scrubber','F16','','2024-01-02','','O','해외','GST TAIWAN SCRUBBER','90000005'],
    ['2','재직','','FF','대리','Chiller','F11','','2023-05-01','','O','해외','GST TAIWAN CHILLER','90000006'],
  ]);
  [['옛 영문', EN, '90000001'], ['한글(ID)', KO1, '90000003'], ['새 양식(사원번호)', KO2, '90000005']]
    .forEach(([nm, text, wantId]) => {
      const r = m.parseRoster(text);
      // 칠러 1명은 규약대로 빠지므로 언제나 1명이어야 한다
      ok(r.length === 1, `parseRoster ${nm} — 1명 (칠러 제외)`);
      ok(r[0] && r[0].id === wantId, `parseRoster ${nm} — 사번을 «채워진» 열에서 집는다`);
      ok(r[0] && r[0].fab === 'F16', `parseRoster ${nm} — 근무지(단지/라인/Work Place)를 읽는다`);
      ok(r[0] && r[0].onsite === true, `parseRoster ${nm} — 현장 여부`);
    });

  /* ④ 실제 Import 표의 모양 — 옛 영문 열이 «빈 채로 앞»에 있고 채워진 한글 열이 «뒤»에 있다.
     ALTER 로 열을 맨 뒤에 붙였지 옛 열을 지우지 않아서 생긴 모양이다. 위 ①~③ 은 한 양식씩만
     담고 있어 이 배치를 못 만든다 — 그래서 세 벌을 다 통과하면서도 실제 표에서는 0명이었다.
     실측(584행): ID·Date of entry·Resignation·조직도·직급·Name(영문) 전부 0행. */
  const MIX = csv([
    ['No.','ID','Name(영문)','Dept.','Work Place','Date of entry','Resignation','조직도','직급',
     '현장 인원여부','인사','이름(영문)','직급(한글)','담당구분','단지','라인','입사일','퇴사일','사원번호'],
    ['1','','','','','','','','', 'O','재직','GG','과장','Scrubber','F16','','2024-01-02','','90000007'],
    ['2','','','','','','','','', 'O','퇴직','HH','대리','Scrubber','F11','','2023-05-01','2026-03-31','90000008'],
    ['3','','','','','','','','', 'O','재직','II','사원','Chiller','F16','','2022-07-01','','90000009'],
  ]);
  {
    const r = m.parseRoster(MIX);
    ok(r.length === 2, `혼재 양식 — 2명 (칠러 제외) → ${r.length}명`);
    const a = r[0] || {}, b = r[1] || {};
    ok(a.id === '90000007', `혼재 — 사번을 «채워진» 사원번호 열에서 (빈 ID 가 앞에 있어도) → ${a.id}`);
    // 입사일을 빈 'Date of entry' 로 잡으면 전 행이 탈락해 0명이 된다 — 그것이 실제 결함이었다
    ok(a.join instanceof Date, `혼재 — 입사일을 «입사일» 열에서 (빈 Date of entry 가 앞에 있어도)`);
    /* 퇴사일을 빈 'Resignation' 으로 잡으면 **퇴사자가 재직자로 되살아난다**.
       고쳐도 이걸 안 보면 「인원은 나오는데 숫자가 이상한」 상태로 넘어간다. */
    ok(b.quit instanceof Date, `혼재 — 퇴사일을 «퇴사일» 열에서 (빈 Resignation 이 앞에 있어도)`);
    ok(!a.quit, `혼재 — 재직자의 퇴사일은 비어 있다`);
    ok(a.posKo === '과장', `혼재 — 직급을 «직급(한글)» 에서 (빈 «직급» 이 앞에 있어도) → ${a.posKo}`);
    ok(a.name === 'GG', `혼재 — 이름을 «이름(영문)» 에서 (빈 Name(영문) 이 앞에 있어도) → ${a.name}`);
    // 담당구분을 빈 '조직도' 로 잡으면 칠러가 안 걸러진다 (위 length===2 가 그것도 같이 지킨다)
    ok(r.every(p => p.id && p.join), `혼재 — 모든 행이 사번·입사일을 갖는다`);
  }
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
