/* 실적(수선·자재) ↔ 설치현황 S/N 조인이 «표기 차이» 때문에 몇 건이나 놓치고 있는지 센다.

   왜 이 검사가 필요한가. 현장 표기는 기본 꼴에서 두 방향으로 벗어난다(사용자 확인, 2026-08):
     ① 하이픈을 빼고 적는 사이트가 있다   SBW-0000 ↔ SBW0000
     ② 꼬리에 채널 문자가 붙는다           -S 싱글 · -L/-R 듀얼 좌/우
   그런데 이 저장소에는 S/N 을 맞추는 규칙이 **다섯 벌**로 흩어져 있고 서로 다르다:
     GST.ALARM.key + keyBase  (국내 알람)   영숫자만 + 꼬리 문자 제거   → ①② 둘 다 흡수
     GST.ORG.instIndex        (수선·자재)   공백만 제거                → 둘 다 못 봄
     fault 의 normSN          (설비 일대기) 공백만 제거                → 둘 다 못 봄
     tco · cip 의 key                        영숫자만                   → ①만 흡수
   즉 실적 화면은 같은 설비를 «못 찾음(미상)»으로 떨어뜨리고 있을 수 있다.
   CLAUDE.md 는 미매치의 대부분을 일본(F15)·싱가포르(F10) 설비가 설치현황에 아예 없어서라고
   설명하는데, **그 나머지는 설명돼 있지 않다.** 그 나머지가 표기 때문인지를 여기서 센다.

   ⚠ 이 검사는 «세기만» 한다. 규칙을 고치면 지금까지 미상이던 행이 단지·라인을 얻어
     화면 숫자가 움직인다 — 얼마나 움직이는지 먼저 알고 들어가야 한다(t-snap 대조 대상).

   ⚠ 실제 S/N 을 찍지 않는다. 저장소가 공개이고 이 출력을 그대로 붙여 넣는 일이 생긴다.
     예시는 숫자를 가려 «꼴»만 보여 준다(GBWS-####L). 꼴이 곧 이 검사가 말하려는 것이다.

   실행: node t-snjoin.mjs   (픽스처 csv_inst.csv · csv_wk.csv · csv_mat.csv 필요)
*/
import fs from 'fs';
import path from 'path';
import Papa from './node_modules/papaparse/papaparse.min.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);

/* 세 규칙. 이름을 앱과 똑같이 두어 «어느 규칙이 무엇을 흡수하는지»가 눈으로 보이게 한다. */
const cur  = s => String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase(); // instIndex 의 현재 규칙
const key  = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); // ① 흡수
const base = s => key(s).replace(/[A-Z]+$/, '');                                       // ①+② 흡수
// 숫자를 가린다 — 꼴만 남긴다. GBWS-3738L → GBWS-####L
const mask = s => String(s == null ? '' : s).replace(/\d/g, '#');

function sheet(file, hints){
  const p = path.join(HERE, file);
  if (!fs.existsSync(p)) return null;
  const rows = Papa.parse(fs.readFileSync(p, 'utf8')).data;
  const norm = s => String(s || '').replace(/[\s\n/]/g, '').toLowerCase();
  for (let h = 0; h < Math.min(8, rows.length); h++){
    const hdr = (rows[h] || []).map(norm);
    if (hints.every(n => hdr.indexOf(norm(n)) >= 0)) {
      const idx = {};
      hdr.forEach((v, i) => { if (!(v in idx)) idx[v] = i; });
      return { rows, hi: h, col: n => { const i = idx[norm(n)]; return i == null ? -1 : i; } };
    }
  }
  return null;
}

const inst = sheet('csv_inst.csv', ['Scrubber S/N']);
if (!inst) {
  console.log('❌ tests/csv_inst.csv 가 없다 — README 의 make-fixtures.py 로 픽스처를 먼저 만든다.');
  process.exit(2);
}

/* 설치현황 쪽 색인 세 벌. 같은 시트를 세 규칙으로 각각 담아 «규칙만 바꿨을 때» 무엇이
   더 붙는지 견준다. 시트를 바꾸는 게 아니라 규칙을 바꾸는 것이므로 이 대조가 곧 답이다. */
const IX = { cur:{code:new Set(), sn:new Set()},
             key:{code:new Set(), sn:new Set()},
             base:{code:new Set(), sn:new Set()} };
{
  const cSN = inst.col('Scrubber S/N'), cCD = inst.col('Scrubber CODE');
  for (let i = inst.hi + 1; i < inst.rows.length; i++){
    const r = inst.rows[i] || [];
    const sn = r[cSN], cd = cCD >= 0 ? r[cCD] : '';
    [['cur', cur], ['key', key], ['base', base]].forEach(([k, f]) => {
      if (sn && f(sn)) IX[k].sn.add(f(sn));
      if (cd && f(cd)) IX[k].code.add(f(cd));
    });
  }
  console.log(`설치현황 ${inst.rows.length - inst.hi - 1}행 · S/N ${IX.cur.sn.size}종 · CODE ${IX.cur.code.size}종`);
  /* 접미를 떼면 서로 다른 설비가 한 키로 접힐 수 있다. 접힌 수를 밝힌다 —
     조인율만 오르고 «남의 설비를 물었다»면 그건 개선이 아니라 사고다. */
  console.log(`  꼬리 문자를 뗐을 때 접히는 S/N: ${IX.key.sn.size - IX.base.sn.size}종`
            + ` (${IX.key.sn.size} → ${IX.base.sn.size})`);
}

function probe(label, file, hints, codeCol, snCol){
  const sh = sheet(file, hints);
  if (!sh) { console.log(`\n[${label}] 픽스처 없음 (${file}) — 건너뜀`); return; }
  const cC = sh.col(codeCol), cS = sh.col(snCol);
  const n = { total:0, hit:0, byKey:0, byBase:0, miss:0 };
  const ex = { byKey:new Map(), byBase:new Map(), miss:new Map() };
  const add = (m, v) => { const k = mask(v); m.set(k, (m.get(k) || 0) + 1); };

  for (let i = sh.hi + 1; i < sh.rows.length; i++){
    const r = sh.rows[i] || [];
    const cd = cC >= 0 ? r[cC] : '', sn = cS >= 0 ? r[cS] : '';
    if (!String(cd || '').trim() && !String(sn || '').trim()) continue;   // 둘 다 빈 행은 안 센다
    n.total++;
    // 현재 규칙 — instIndex.find 와 같은 순서(설비호기 먼저, 미스면 S/N)
    if (IX.cur.code.has(cur(cd)) || IX.cur.sn.has(cur(sn))) { n.hit++; continue; }
    if (IX.key.code.has(key(cd))  || IX.key.sn.has(key(sn)))  { n.byKey++;  add(ex.byKey,  sn || cd); continue; }
    if (IX.base.code.has(base(cd))|| IX.base.sn.has(base(sn))) { n.byBase++; add(ex.byBase, sn || cd); continue; }
    n.miss++; add(ex.miss, sn || cd);
  }

  const pct = v => n.total ? (v / n.total * 100).toFixed(1) + '%' : '—';
  console.log(`\n[${label}] ${n.total.toLocaleString()}행`);
  console.log(`  현재 규칙으로 붙음            ${n.hit.toLocaleString().padStart(7)}  ${pct(n.hit)}`);
  console.log(`  ① 하이픈만 무시하면 붙음      ${n.byKey.toLocaleString().padStart(7)}  ${pct(n.byKey)}`);
  console.log(`  ② 꼬리 L/R/S 까지 떼면 붙음   ${n.byBase.toLocaleString().padStart(7)}  ${pct(n.byBase)}`);
  console.log(`  그래도 못 붙음(설치현황에 없음) ${n.miss.toLocaleString().padStart(6)}  ${pct(n.miss)}`);
  const show = (t, m) => {
    if (!m.size) return;
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`    ${t} 꼴: ` + top.map(([k, v]) => `${k}×${v}`).join(' · '));
  };
  show('①', ex.byKey); show('②', ex.byBase); show('미매치', ex.miss);
  return n;
}

// 수선은 설비호기 → S/N(IN) 순으로 찾는다(fault 의 instFloor 호출부와 같다)
const wk  = probe('수선실적', 'csv_wk.csv',  ['실적코드', '작업단계'], '설비호기', 'S/N(IN)');
// 자재는 설비호기(없으면 메인설비호기) → S/N (material 의 호출부와 같다)
const mat = probe('자재실적', 'csv_mat.csv', ['수선실적번호'],          '설비호기', 'S/N');

const gain = (wk ? wk.byKey + wk.byBase : 0) + (mat ? mat.byKey + mat.byBase : 0);
console.log(`\n표기 규칙만 바꾸면 더 붙는 행: ${gain.toLocaleString()}건`);
console.log(gain
  ? '→ 규칙을 GST.ALARM.key/keyBase 한 벌로 모으면 이만큼이 「미상」에서 벗어난다.\n'
    + '  ⚠ 화면 숫자가 그만큼 움직인다 — 고치기 전에 `node t-snap.mjs --save` 로 기준을 뜰 것.'
  : '→ 표기 때문에 놓치는 행은 없다. 미매치는 설치현황에 그 설비가 없는 것이다.');
