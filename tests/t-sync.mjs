/* 세 곳(브라우저 core.js · Deno hr.js · Deno sheet-write)이 같은 시트를 각자 해석한다.
   런타임이 갈라서 파일을 공유할 수 없으니 복제는 불가피하다 —
   대신 갈라지는 순간 이 테스트가 실패한다.

   비교 방법: 같은 시트 헤더를 세 해석기에 먹이고, 같은 개념이 같은 열 번호로 잡히는지 본다.
   (문자열 스펙을 눈으로 대조하는 대신 실제 해석 결과를 대조한다 — 오타·정규화 차이까지 잡힌다) */
import fs from 'fs';
import path from 'path';
const HERE = path.dirname(new URL(import.meta.url).pathname);

/* 픽스처가 없으면 «크래시»한다 — npm run all 이 여기서 죽어 나머지가 안 돈다.
   조용히 견디되 초록불은 안 준다. 실제 CI 는 STRICT_FIXTURES=1 로 실패시킨다. */
{
  const _need = ["csv_wk.csv", "csv_inst.csv"];
  const _miss = _need.filter((f) => !fs.existsSync(path.join(HERE, f)));
  if (_miss.length) {
    console.log('⚠️  픽스처가 없어 이 검사를 못 했다: ' + _miss.join(', ') + ' (tests/README.md 로 생성)');
    process.exit(process.env.STRICT_FIXTURES ? 2 : 0);
  }
}

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
/* 별칭 배열도 받는다 — core.js SPEC 과 같은 규약(앞에서부터 찾아 첫 적중).
   hr.js 쪽도 국내·해외 두 양식을 흡수하느라 배열을 쓰게 됐다(v96). 문자열만 받던
   시절의 이 함수는 배열을 통째로 이름 하나로 보고 -1 을 내, 「갈라졌다」는 거짓
   경보를 냈다 — 거짓 경보를 내는 검사는 곧 무시당한다. */
const resolve = (header, name) => {
  const H = header.map(hnorm);
  for (const n of [].concat(name)) { const i = H.indexOf(hnorm(n)); if (i >= 0) return i; }
  return -1;
};

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

  /* 별칭 «순서»까지 같아야 한다 (v96). 열 번호만 대조하면 이 픽스처(해외 양식)에서는
     둘 다 같은 열을 내므로 통과해 버리는데, 국내 양식과 DB 복원본에서는 갈린다 —
     `fab:['FAB','Line 1']` 로 뒤집으면 국내 라인 축이 통째로 FSF/R/P 가 되고,
     봇이 읽는 미러 표에는 'FAB' 이라는 머리글 자체가 없어 열을 못 찾는다. */
  /* 설비상태(state)는 옛 추출본에 없는 열이라 same 맵에 넣으면 «둘 다 -1» 로 실패한다.
     그래도 두 곳이 «같은 이름»을 보는지는 지켜야 한다 — 한쪽만 별칭을 늘리면 봇과 화면이
     다른 열을 세게 되고, 설비 대수가 갈린다(v99). 별칭 목록만 대조한다. */
  {
    const a = [].concat(GST.SM.SPEC.inst.fields.state).map(hnorm).join('|');
    const b = [].concat(HR.install.state).map(hnorm).join('|');
    ok(a === b && !!a, `설치현황 state 별칭: core.js [${a}] ↔ hr.js [${b}]`);
    ok((GST.SM.SPEC.inst.opt || []).indexOf('state') >= 0,
       '설치현황 state 가 opt 에 있다 (그 열이 없는 옛 추출본이 거부되지 않게)');
    ok(cm.C.state === resolve(H, GST.SM.SPEC.inst.fields.state),
       `설치현황 state 열 번호가 같다 (${cm.C.state})`);
  }
  let ord = 0;
  for (const [ck, hk] of Object.entries(same)) {
    const a = [].concat(GST.SM.SPEC.inst.fields[ck]).map(hnorm).join('|');
    const b = [].concat(HR.install[hk]).map(hnorm).join('|');
    ok(a === b, `설치현황 ${ck} 별칭 순서: core.js [${a}] ↔ hr.js [${b}]`);
    ord++;
  }
  console.log(`설치현황 별칭 순서 ${ord}개 대조`);
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

/* ── 4. 교육현황: sheet-write ↔ hr.js eduMap 이 «같은 열»을 보는가 ──
   열 번호를 박아두지 않는다 — 2026-08 개편으로 레이아웃이 통째로 바뀌었고, 박아둔 숫자는
   그때 전부 거짓이 됐다. 절대값은 t-edu.mjs 가 두 레이아웃으로 지키고, 여기서는
   «세 해석기가 서로 어긋나지 않는가»만 본다. 그게 SPEC-SYNC 가 지키려는 성질이다. */
{
  const hrMod = await import(ROOT + '/supabase/functions/kakao-bot/hr.js');
  // 병합셀은 CSV에서 첫 칸에만 값이 남는다 — 실제 시트가 그렇게 보인다
  const LAYOUTS = {
    '개편후(밴드가 헤더 위)': [
      ['','','','','법인 교육과정','','본사 교육과정',''],
      ['','','','','Basic','Veteran','Scrubber Lv.2','Scrubber Lv.3'],
      ['No','Site','인원','사원번호','교육완료일','교육완료일','교육완료일','교육완료일'],
    ],
    '개편전(밴드가 헤더 아래)': [
      ['No','Site','인원','사원번호','입사일','경력','직급','직무','법인 교육과정','','','','','','','','본사 교육과정','','비고'],
      ['','','','','','','','','Basic (Level 1)','','','','Veteran (Level 2)','','','','Scrubber Lv.2','Scrubber Lv.3',''],
      ['','','','','','','','','이수여부','시작일','완료일','시간','이수여부','시작일','완료일','시간','완료일','완료일',''],
    ],
  };
  // sheet-write 필드명 → hr.js eduMap 키
  const PAIR = [['site','site'],['name','name'],['bdate','bdate'],['vdate','vdate'],
                ['lv2date','lv2'],['lv3date','lv3']];
  for (const [lname, rows] of Object.entries(LAYOUTS)) {
    const hi = rows.findIndex(r => r.some(x => String(x).includes('인원')));
    const bc = SW.bandCtx(rows, hi, rows[hi].length);
    const m = hrMod.eduMap(rows);
    if (!m) { ok(false, `교육현황 ${lname}: hr.js eduMap 이 헤더를 못 찾았다`); continue; }
    ok(m.hi === hi, `교육현황 ${lname}: 헤더행 sheet-write ${hi} · hr.js ${m.hi}`);
    for (const [swk, hrk] of PAIR) {
      const a = SW.colIdx(rows[hi], SW.SCHEMA_EDU.fields[swk], bc), b = m.c[hrk];
      ok(a === b && a >= 0, `교육현황 ${lname} ${swk}: sheet-write ${a} · hr.js ${b}`);
    }
    console.log(`교육현황 ${lname}: 헤더 ${hi}행 · 밴드 ${bc.bands.map(b=>b.k+'@'+b.col).join(' ')} · ${PAIR.length}필드 일치`);
  }
}

console.log(`\n동기화 대조: ${pass} 통과 / ${fail} 실패`);
if (fail) console.log('→ 세 곳의 헤더 이름이 갈라졌습니다. core.js GST.SM.SPEC이 정본입니다.');
process.exit(fail ? 1 : 0);
