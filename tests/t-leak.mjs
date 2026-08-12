/* 공개 저장소에 실데이터가 새어 나갔는지 검사한다.
   이 저장소는 GitHub Pages라 공개다. 작업자 실명·설비 S/N·고객사가 커밋되면
   되돌려도 git 이력에 남는다 — 그래서 들어가기 전에 막는다.

   .gitignore는 픽스처 '파일'을 막아줄 뿐, 소스 주석에 예시로 적어 넣는 것은 못 막는다.
   실제로 그렇게 새어 나간 적이 있다: 설명 주석의 "GBWS-2557처럼 멀쩡한 S/N",
   작업자 열 설명의 "김대기,LI.LO". 둘 다 화면에 안 나오지만 저장소에는 남는다. */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HERE = path.dirname(new URL(import.meta.url).pathname);

// 커밋 대상 파일만 본다(픽스처는 .gitignore가 이미 막았다)
const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter(f => !f.startsWith('tests/'))
  .filter(f => /\.(html|js|ts|md|json|css)$/.test(f));

// 실데이터 원본과 대조한다. 패턴만으로는 '전체'·'고객사' 같은 UI 단어까지 인명으로 잡혀
// 경고가 홍수를 이루고, 홍수가 나면 아무도 안 본다. 명단에 있는 것만 잡는다.
import Papa from './node_modules/papaparse/papaparse.min.js';

function col(file, names){
  const p = path.join(HERE, file);
  if (!fs.existsSync(p)) return null;
  const rows = Papa.parse(fs.readFileSync(p, 'utf8')).data;
  const norm = s => String(s||'').replace(/[\s\n/]/g, '').toLowerCase();
  // 헤더 행을 찾는다 — 시트에 따라 0행이 아닐 수 있다
  for (let h = 0; h < Math.min(6, rows.length); h++){
    const hdr = (rows[h]||[]).map(norm);
    const idx = names.map(n => hdr.indexOf(norm(n))).filter(i => i >= 0);
    if (idx.length) return { rows, hi: h, idx };
  }
  return null;
}
function values(file, names, split){
  const c = col(file, names); const out = new Set();
  if (!c) return out;
  for (let i = c.hi + 1; i < c.rows.length; i++){
    c.idx.forEach(j => {
      const raw = String((c.rows[i]||[])[j] || '').trim();
      if (!raw) return;
      (split ? raw.split(/[,/·]/) : [raw]).forEach(v => {
        v = v.trim().toUpperCase();
        if (v.length > 1) out.add(v);
      });
    });
  }
  return out;
}

const REAL_SN   = new Set([...values('csv_inst.csv', ['Scrubber S/N']),
                           ...values('csv_mat.csv',  ['S/N'])]);
// 작업자 열은 "홍길동,LI.LO"처럼 여러 명이 묶여 있어 쪼개서 담는다
const REAL_NAME = new Set([...values('csv_wk.csv', ['작업자'], true)]
                    .filter(v => /^[가-힣]{2,4}$/.test(v)));

const PATTERNS = [{ re: /\b(?:GBWS|DBW)-\d{4}\b/g, what: '설비 S/N' }];

let bad = 0, checked = 0;
for (const f of files) {
  const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
  checked++;
  // ① 설비 S/N — 실제 설비 명단에 있으면 실데이터다
  for (const P of PATTERNS) {
    P.re.lastIndex = 0;
    let m;
    while ((m = P.re.exec(txt))) {
      const v = m[0].toUpperCase();
      const isReal = REAL_SN.size ? REAL_SN.has(v) : !/-0+$/.test(v);
      if (isReal) { bad++; console.log(`  ❌ ${f}: 실제 ${P.what} ${v}`); }
    }
  }
  // ② 작업자 실명 — 실제 명단에 있는 이름만 잡는다(UI 단어는 명단에 없다)
  if (REAL_NAME.size) {
    for (const n of REAL_NAME) {
      if (txt.includes(n)) { bad++; console.log(`  ❌ ${f}: 실제 작업자 실명 "${n}"`); }
    }
  }
}

console.log(`\n검사 ${checked}개 파일 · 대조본: 설비 S/N ${REAL_SN.size}건 · 작업자 ${REAL_NAME.size}명`);
console.log(bad ? `❌ 실데이터 ${bad}건이 커밋 대상에 들어 있다 — 가공값으로 바꿀 것`
                : '✅ 커밋 대상에 실데이터 없음');
process.exit(bad ? 1 : 0);
