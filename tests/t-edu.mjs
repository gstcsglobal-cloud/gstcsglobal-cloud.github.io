/* 교육현황 컬럼 해석 회귀 — 2026-08 시트 개편(밴드가 헤더 «위»로, 이수여부·비고 삭제) 후에도
   옛 레이아웃과 새 레이아웃 «양쪽»에서 같은 열을 잡는지. eduMap 은 hr·report·kakao-bot 세 곳에
   복제돼 있고, 헤더 탐지가 어긋나면 null 을 반환해 교육 지표가 통째로 빈칸이 된다(실제로 그랬다).
     node t-edu.mjs
*/
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
import fs from 'fs';
// 사본 둘을 «각각» 떼어 같은 시험을 먹인다. 하나만 고치고 다른 하나를 잊는 것이 이 저장소의 단골 사고다.
const COPIES = [
  ['hr',        '/hr/index.html',                        'function eduMap(rows){',        'function parseEdu(rows){'],
  ['report',    '/report/index.html',                    'function eduMap(rows){',        'function parseHR(rows){'],
  ['kakao-bot', '/supabase/functions/kakao-bot/hr.js',   'export function eduMap(rows) {', 'export function parseEdu(csvText) {'],
];
function loadEduMap(file, startMark, endMark){
  const src = fs.readFileSync(ROOT + file, 'utf8');
  const a = src.indexOf(startMark), b = src.indexOf(endMark);
  if (a < 0 || b < 0) throw new Error(`${file}: eduMap 블록을 못 찾았다`);
  // Deno 쪽은 export 가 붙어 있어 new Function 에 그대로 못 넣는다
  return new Function(src.slice(a, b).replace(/^export\s+/gm, '') + '; return eduMap;')();
}

// 새 레이아웃 — 사용자가 보여준 화면 그대로 (병합셀은 CSV에서 첫 칸에만 값이 남는다)
const NEW = [
  ['','','','','법인 교육과정','','본사 교육과정',''],
  ['','','','','Basic','Veteran','Scrubber Lv.2','Scrubber Lv.3'],
  ['No','Site','인원','사원번호','교육완료일','교육완료일','교육완료일','교육완료일'],
  ['1','F16','Devin','11108093','2025-02-07','2025-08-15','',''],
];
// 옛 레이아웃 — CLAUDE.md 에 기록된 3단 머리글
const OLD = [
  ['No','Site','인원','사원번호','입사일','경력','직급','직무','법인 교육과정','','','','','','','','본사 교육과정','','비고'],
  ['','','','','','','','','Basic (Level 1)','','','','Veteran (Level 2)','','','','Scrubber Lv.2','Scrubber Lv.3',''],
  ['','','','','','','','','이수여부','시작일','완료일','시간','이수여부','시작일','완료일','시간','완료일','완료일',''],
  ['1','F16','Devin','11108093','2024-01-02','','','','이수완료','','2025-02-07','','이수완료','','2025-08-15','','',''],
];
let bad=0;
const chk=(nm,got,want)=>{ const ok=JSON.stringify(got)===JSON.stringify(want);
  console.log(`  ${ok?'✅':'❌'} ${nm}: ${JSON.stringify(got)}${ok?'':' ← 기대 '+JSON.stringify(want)}`); if(!ok)bad++; };

for (const [nm, file, startMark, endMark] of COPIES) {
console.log(`\n===== ${nm} 의 eduMap =====`);
const eduMap = loadEduMap(file, startMark, endMark);
console.log('[새 레이아웃]');
const a = eduMap(NEW);
if(!a){ console.log('  ❌ null 반환 — 헤더행을 못 찾았다'); bad++; }
else { chk('헤더행 hi', a.hi, 2);
  chk('열 매핑', [a.c.site,a.c.name,a.c.id,a.c.bdate,a.c.vdate,a.c.lv2,a.c.lv3], [1,2,3,4,5,6,7]); }

console.log('[옛 레이아웃 — 회귀]');
const b = eduMap(OLD);
if(!b){ console.log('  ❌ null 반환'); bad++; }
else { chk('헤더행 hi', b.hi, 0);
  chk('열 매핑', [b.c.site,b.c.name,b.c.id,b.c.bdate,b.c.vdate,b.c.lv2,b.c.lv3], [1,2,3,10,14,16,17]); }

console.log('[폴백이 없어졌는지 — 없는 열은 -1]');
chk('입사일/직무/비고 키가 아예 없다', [a&&('join' in a.c), a&&('role' in a.c), a&&('note' in a.c)], [false,false,false]);
}

console.log(bad?`\n❌ ${bad}건 실패`:'\n✅ 두 레이아웃 모두 올바른 열을 잡는다');
process.exit(bad?1:0);
