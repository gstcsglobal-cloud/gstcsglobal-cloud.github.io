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
  // .sql도 본다 — setup-4-tables.sql은 생성물이라, 생성기가 잘못 잡으면
  // 시트 값이 그대로 시드에 박혀 커밋될 수 있다.
  .filter(f => /\.(html|js|ts|md|json|css|sql)$/.test(f));

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

/* 대조·판정에 쓰는 두 꼴 — 앱(GST.ALARM.key/keyBase)과 «같은 규칙»이어야 한다.
   여기만 다르게 정규화하면 명단에 있는 설비를 «없다»고 판정해 검사가 조용히 통과한다. */
const snKey  = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const snBase = v => snKey(v).replace(/[A-Z]+$/, '');
// 자리표시자 판정 — 숫자가 전부 0 이면 지어낸 값이다(GBWS-0000 · SBW0000 · DBW-0000S)
const isPlaceholder = v => /^0+$/.test(String(v).replace(/[^0-9]/g, ''));

/* 명단은 «두 꼴 다» 담는다. 시트가 GBWS-3738 로 적혀 있어도 소스에 GBWS-3738L 로
   새어 나갈 수 있고, 그 반대도 마찬가지다 — 한 꼴만 담으면 그 절반을 못 잡는다. */
const REAL_SN = new Set();
[...values('csv_inst.csv', ['Scrubber S/N']), ...values('csv_mat.csv', ['S/N'])]
  .forEach(v => { const k = snKey(v); if (k) { REAL_SN.add(k); REAL_SN.add(snBase(v)); } });
// 작업자 열은 "홍길동,LI.LO"처럼 여러 명이 묶여 있어 쪼개서 담는다
const REAL_NAME = new Set([...values('csv_wk.csv', ['작업자'], true)]
                    .filter(v => /^[가-힣]{2,4}$/.test(v)));

/* 현장 표기는 «기본 꼴»에서 두 방향으로 벗어난다 (사용자 확인, 2026-08):
     ① 하이픈을 빼고 적는 사이트가 있다      SBW0527
     ② 꼬리에 채널 문자가 붙는다              -S 싱글 · -L/-R 듀얼 좌/우
   예전 정규식은 `GBWS-\d{4}` 로 «숫자로 끝나는 것»만 봤다. 그래서 실제로 새어 나간
   주석 한 줄에서 `GBWS-7561` 하나만 잡히고 그 옆의 `SBW0527`·`DBW-1177S`·`GBWS-3738L`
   **셋은 그대로 통과했다.** 그물이 현장 표기를 모르면 검사는 통과 도장만 찍어 준다.

   ⚠ SBW 를 접두에 넣었다 — 사이트마다 쓰는 접두가 다르고, 목록에 없으면 그 사이트 값은
     통째로 안 보인다(허용목록의 전형적인 실패). 새 접두가 나오면 여기에 더한다. */
const PATTERNS = [{ re: /\b(?:GBWS|DBW|SBW)-?\d{4}[LRS]?\b/gi, what: '설비 S/N' }];

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
      /* 자리표시자는 명단 유무와 상관없이 통과시킨다 — 명단이 있을 때만 봐주면
         픽스처가 없는 환경(CI·새 클론)에서 멀쩡한 예시가 전부 실패로 뜬다. */
      const isReal = isPlaceholder(v) ? false
        : (REAL_SN.size ? (REAL_SN.has(snKey(v)) || REAL_SN.has(snBase(v))) : true);
      if (isReal) { bad++; console.log(`  ❌ ${f}: 실제 ${P.what} ${v}`); }
    }
  }
  /* ② 구글시트 «웹게시» 토큰 — 가장 큰 유출 통로였는데 검사 밖에 있었다.
     웹게시에는 인증이 없어, URL 만 알면 로그인 없이 전량(작업자 실명·고객사·설비 S/N)을
     받는다. 사용자가 2026-08 에 게시를 해제해 통로는 닫혔지만, 문자열을 남겨 두면
     새 파일이 그대로 복사해 간다 — 실제로 /diag/ 를 만들 때 그렇게 됐다.
     대조본이 필요 없는 «형태» 검사라 어느 환경에서도 돈다. */
  { const re=/\/d\/e\/2PACX-[A-Za-z0-9_-]{10,}/g; let m;
    while((m=re.exec(txt))) { bad++; console.log(`  ❌ ${f}: 구글시트 웹게시 토큰 (gid 만 두고 GST.sheetUrl 을 쓸 것)`); } }

  // ③ 작업자 실명 — 실제 명단에 있는 이름만 잡는다(UI 단어는 명단에 없다)
  if (REAL_NAME.size) {
    for (const n of REAL_NAME) {
      if (txt.includes(n)) { bad++; console.log(`  ❌ ${f}: 실제 작업자 실명 "${n}"`); }
    }
  }
}

console.log(`\n검사 ${checked}개 파일 · 대조본: 설비 S/N ${REAL_SN.size}건 · 작업자 ${REAL_NAME.size}명 · 웹게시 토큰 형태 검사 포함`);
console.log(bad ? `❌ 실데이터 ${bad}건이 커밋 대상에 들어 있다 — 가공값으로 바꿀 것`
                : '✅ 커밋 대상에 실데이터 없음');
process.exit(bad ? 1 : 0);
