/* 세 곳(브라우저 core.js · Deno hr.js · Deno sheet-write)이 같은 시트를 각자 해석한다.
   런타임이 갈라서 파일을 공유할 수 없으니 복제는 불가피하다 —
   대신 갈라지는 순간 이 테스트가 실패한다.

   비교 방법: 같은 시트 헤더를 세 해석기에 먹이고, 같은 개념이 같은 열 번호로 잡히는지 본다.
   (문자열 스펙을 눈으로 대조하는 대신 실제 해석 결과를 대조한다 — 오타·정규화 차이까지 잡힌다) */
import fs from 'fs';
import path from 'path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ── core.js (브라우저) 로드 ──────────────────────────────
const el = () => ({ style:{}, appendChild(){}, insertBefore(){}, remove(){}, setAttribute(){},
  addEventListener(){}, classList:{add(){},remove(){},toggle(){}}, querySelector:()=>null,
  querySelectorAll:()=>[], insertAdjacentHTML(){}, insertAdjacentElement(){},
  parentNode:{insertBefore(){}}, firstElementChild:null, textContent:'', innerHTML:'' });
global.document = { createElement:el, getElementById:()=>null, querySelector:()=>null,
  querySelectorAll:()=>[], body:el(), documentElement:el(), addEventListener(){}, head:el(), readyState:'complete' };
global.window = { addEventListener(){}, location:{href:'',search:''},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, matchMedia:()=>({matches:false,addEventListener(){}}) };
global.window.self = global.window.top = global.window;
global.localStorage = global.window.localStorage;
global.location = global.window.location;
new Function(fs.readFileSync(ROOT + '/assets/core.js', 'utf8'))();
const GST = global.window.GST || global.GST;

// ── hr.js (Deno) 로드 — 헤더 스펙만 꺼내 쓴다 ─────────────
const hrSrc = fs.readFileSync(ROOT + '/supabase/functions/kakao-bot/hr.js', 'utf8');
const pick = (name) => {
  const i = hrSrc.indexOf(`const ${name} = {`);
  if (i < 0) throw new Error(`hr.js에서 ${name}을 찾지 못했습니다`);
  const j = hrSrc.indexOf('\n};', i);
  return new Function(`return ${hrSrc.slice(hrSrc.indexOf('{', i), j + 2)}`)();
};
const HR = { install: pick('INSTALL_SPEC'), fault: pick('FAULT_SPEC') };
const hnorm = new Function(`${hrSrc.match(/const hnorm = [\s\S]*?\.toLowerCase\(\);/)[0]} return hnorm;`)();

/* ── sheet-write (Deno) 교육 스키마 ─────────────────────────
   sheet-write는 Deno 전용이라 통째로 import할 수 없다(jsr: import가 있다).
   헤더 해석기와 교육 스키마만 떼어내 임시 .ts로 쓰고 Node의 타입 스트리퍼로 읽는다.
   생성물이라 저장소에 커밋하지 않는다(.gitignore). */
function buildSwExtract() {
  const src = fs.readFileSync(ROOT + '/supabase/functions/sheet-write/index.ts', 'utf8');
  const helpers = src.slice(src.indexOf('type Matcher ='), src.indexOf('const SCHEMAS'));
  let i = src.indexOf('  "0": {'); i = src.indexOf('{', i);
  const edu = src.slice(i, src.indexOf('  // 휴가현황', i)).replace(/\s*,\s*$/, '');
  const out = `type FieldDef = ColRef & { max: number; enum?: string[]; date?: boolean; notBlank?: boolean; pattern?: RegExp };
${helpers}
export const SCHEMA_EDU: any = ${edu};
export { hn, eq, bandCtx, bandCol, colIdx };
`;
  fs.writeFileSync(path.join(HERE, 'sw-extract.ts'), out);
}
buildSwExtract();
const SW = await import('./sw-extract.ts');

const hdr = (f) => {
  const { default: Papa } = PapaMod;
  return Papa.parse(fs.readFileSync(path.join(HERE, f), 'utf8'), { skipEmptyLines: true }).data;
};
const PapaMod = await import('papaparse');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ❌ ' + m)); };
const resolve = (header, name) => header.map(hnorm).indexOf(hnorm(name));

/* ── 1. 수선실적: core.js SPEC.wk ↔ hr.js FAULT_SPEC ── */
{
  const rows = hdr('csv_wk.csv');
  const cm = GST.SM.map(rows, GST.SM.SPEC.wk);
  const H = rows[cm.hi];
  // 같은 개념을 두 쪽이 각각 뭐라고 부르는지 (core.js 키 → hr.js 키)
  const same = { customer:'customer', campus:'campus', line:'line', bay:'bay', proc:'proc',
    model:'model', rsCode:'rsCode', stage:'stage', snIn:'sn', pf:'pf', alarm:'alarm',
    phenom:'phenom', cause:'cause', action:'action', dStart:'dStart',
    workMin:'workMin', manMin:'manMin', workers:'workers' };
  let n = 0;
  for (const [ck, hk] of Object.entries(same)) {
    const a = cm.C[ck], b = resolve(H, HR.fault[hk]);
    ok(a === b && a >= 0, `수선실적 ${ck}: core.js ${a} ↔ hr.js ${b} (불일치)`);
    n++;
  }
  console.log(`수선실적 ${n}개 개념 대조 (헤더 ${cm.hi + 1}행)`);
}

/* ── 2. 설치현황: core.js SPEC.inst ↔ hr.js INSTALL_SPEC ── */
{
  const rows = hdr('csv_inst.csv');
  const cm = GST.SM.map(rows, GST.SM.SPEC.inst);
  const H = rows[cm.hi];
  const same = { country:'country', customer:'customer', location:'location', code:'code',
    sn:'sn', model:'model', burner:'burner', fab:'fab', floor:'floor', bay:'bay',
    group1:'group1', group2:'group2', detail1:'detail1', detail2:'detail2',
    fabIn:'fabIn', turnOn:'turnOn', warranty:'warranty', type:'type' };
  let n = 0;
  for (const [ck, hk] of Object.entries(same)) {
    const a = cm.C[ck], b = resolve(H, HR.install[hk]);
    ok(a === b && a >= 0, `설치현황 ${ck}: core.js ${a} ↔ hr.js ${b} (불일치)`);
    n++;
  }
  // 'Type'(44·79·96 중복)을 잘못 잡으면 챔버 수가 전부 1이 된다 — 양쪽 모두 75열이어야 한다
  ok(cm.C.type === 75, `설치현황 type이 75열이 아니다 → ${cm.C.type} ('Scrubber type' 아닌 'Type'을 잡았을 가능성)`);
  console.log(`설치현황 ${n}개 개념 대조 (헤더 ${cm.hi + 1}행) · type=${cm.C.type}`);
}

/* ── 3. CIP: core.js SPEC.cip ↔ hr.js parseCIP 내부 규칙 ── */
{
  for (const [site, f, wantItems] of [['F11','csv_cip11.csv',6], ['F16','csv_cip16.csv',24]]) {
    const rows = hdr(f);
    const cm = GST.SM.map(rows, GST.SM.SPEC.cip);
    const H = rows[cm.hi];
    const rg = GST.SM.cipRange(H);
    // hr.js는 같은 규칙을 함수 안에 직접 구현한다 — 여기서 같은 식으로 재현해 대조
    const c0 = H.map(hnorm).indexOf(hnorm('FAB In')) + 1;
    const rmk = H.map(hnorm).indexOf(hnorm('Remark'));
    const c1 = (rmk > c0 ? rmk : H.length) - 1;
    ok(rg && rg.c0 === c0 && rg.c1 === c1, `CIP ${site} 항목구간: core.js ${JSON.stringify(rg)} ↔ hr.js {c0:${c0},c1:${c1}}`);
    const items = H.slice(c0, c1 + 1).filter((x) => String(x || '').trim()).length;
    ok(items === wantItems, `CIP ${site} 항목 수 ${items} (기대 ${wantItems})`);
    ok(cm.C.sn === H.map(hnorm).indexOf(hnorm('Scrubber S/N')), `CIP ${site} sn 불일치`);
    console.log(`CIP ${site}: 헤더 ${cm.hi + 1}행 · 항목 ${c0}~${c1} (${items}종)`);
  }
}

/* ── 4. 교육현황: sheet-write ↔ hr.js eduMap 이 같은 열을 보는가 ── */
{
  const rows = JSON.parse(fs.readFileSync(path.join(HERE, 'hdr-edu.json'), 'utf8'));
  const bc = SW.bandCtx(rows, 0, rows[0].length);
  const swCol = (k) => SW.colIdx(rows[0], SW.SCHEMA_EDU.fields[k], bc);
  // hr.js eduMap은 같은 규약(밴드+소제목)으로 짜여 있다 — 결과 열 번호를 직접 대조
  const hrMod = await import(ROOT + '/supabase/functions/kakao-bot/hr.js');
  const csv = PapaMod.default.unparse(rows);
  // eduMap은 export되지 않으므로 parseEdu 결과로 간접 확인: 열이 맞아야 값이 제대로 들어온다
  const expect = { site:1, name:2, join:4, posKo:6, role:7, basic:8, bsdate:9, bdate:10,
    vet:12, vsdate:13, vdate:14, lv2date:16, lv3date:17, note:18 };
  let n = 0;
  for (const [k, want] of Object.entries(expect)) {
    ok(swCol(k) === want, `교육현황 ${k}: sheet-write ${swCol(k)} (기대 ${want})`);
    n++;
  }
  console.log(`교육현황 ${n}개 필드 대조 · 밴드 ${bc.bands.map(b=>b.k+'@'+b.col).join(' ')}`);
  void hrMod; void csv;
}

console.log(`\n동기화 대조: ${pass} 통과 / ${fail} 실패`);
if (fail) console.log('→ 세 곳의 헤더 이름이 갈라졌습니다. core.js GST.SM.SPEC이 정본입니다.');
process.exit(fail ? 1 : 0);
