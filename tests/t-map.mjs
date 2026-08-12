// core.js의 GST.SM을 실제 시트 헤더로 검증한다.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// core.js는 브라우저 전제라 최소 스텁만 깔고 로드한다
const el = () => ({ style:{}, appendChild(){}, insertBefore(){}, remove(){}, removeAttribute(){},
  setAttribute(){}, addEventListener(){}, classList:{add(){},remove(){},toggle(){}},
  querySelector:()=>null, querySelectorAll:()=>[], insertAdjacentHTML(){}, insertAdjacentElement(){},
  parentNode:{insertBefore(){}}, firstElementChild:null, textContent:'', innerHTML:'' });
global.document = { createElement:el, getElementById:()=>null, querySelector:()=>null,
  querySelectorAll:()=>[], body:el(), documentElement:el(), addEventListener(){},
  head:el(), readyState:'complete' };
global.window = { addEventListener(){}, location:{href:'',search:''}, self:{}, top:{},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, matchMedia:()=>({matches:false,addEventListener(){}}) };
global.window.self = global.window.top = global.window;
global.localStorage = global.window.localStorage;
global.location = global.window.location;

const src = fs.readFileSync(ROOT+'/assets/core.js','utf8');
try { new Function(src)(); } catch(e){ console.log('core.js 로드 경고:', e.message); }
const GST = global.window.GST || global.GST;
if(!GST || !GST.SM){ console.log('❌ GST.SM 로드 실패'); process.exit(1); }

const H = JSON.parse(fs.readFileSync(new URL('./hdr.json', import.meta.url),'utf8'));

// 실제 시트에서 확인한 정답 (앞서 xlsx로 직접 읽은 열 번호)
const EXPECT = {
  wk:  { stage:13, eqNo:19, snIn:21, pf:24, alarm:25, phenom:26, cause:27, action:28,
         dStart:32, workMin:39, manMin:40, workers:41, line:5, proc:7, model:9, rsCode:10 },
  mat: { proc:7, eq:10, sn:12, model:14, matCode:15, part:20, qty:22, matName:23,
         reason:25, workDate:28, daysPaid:29, daysPrev:30, pf:31, freeReason:32, price:34 },
  inst:{ country:2, customer:3, code:5, sn:6, model:7, fab:9, floor:10, bay:11,
         group1:12, detail1:14, toolMaker:18, toolModel:19, fabIn:38, turnOn:40,
         warranty:43, type:75, pmCycle:73 }
};

let pass=0, fail=0;
for(const key of ['wk','mat','inst']){
  const spec = GST.SM.SPEC[key];
  const res  = GST.SM.map(H[key], spec);
  console.log('\n' + '='.repeat(64));
  console.log(`${spec.name}  헤더행=${res.hi}  인식 ${Object.values(res.C).filter(v=>v>=0).length}/${Object.keys(res.C).length}  ok=${res.ok}`);
  if(res.miss.length) console.log('  못 찾음:', res.miss.join(' · '));
  if(res.dup.length)  console.log('  중복   :', res.dup.join(' · '));

  for(const [k,want] of Object.entries(EXPECT[key])){
    const got = res.C[k];
    if(got === want){ pass++; }
    else { fail++; console.log(`  ❌ ${k}: 기대 ${want} → 실제 ${got}`); }
  }
}

// --- 회귀 시나리오: 열을 중간에 끼워 넣어도 따라가는가 ---
console.log('\n' + '='.repeat(64));
console.log('회귀 테스트 — 수선실적 5번 위치에 새 열 2개 삽입');
const shifted = H.wk.map(r => { const c=r.slice(); c.splice(5,0,'신규열A','신규열B'); return c; });
const r2 = GST.SM.map(shifted, GST.SM.SPEC.wk);
const shiftChecks = { stage:15, alarm:27, workers:43, dStart:34 };
for(const [k,want] of Object.entries(shiftChecks)){
  if(r2.C[k]===want){ pass++; console.log(`  ✓ ${k} → ${r2.C[k]}열 (2칸 밀림 추적)`); }
  else { fail++; console.log(`  ❌ ${k}: 기대 ${want} → 실제 ${r2.C[k]}`); }
}

// --- 회귀 시나리오: 이름이 바뀌면 조용히 넘어가지 않고 miss로 잡히는가 ---
console.log('\n회귀 테스트 — 자재실적 "교체사유"를 "교체이유"로 변경 (힌트 아닌 열)');
const renamed = H.mat.map(r=>r.slice());
renamed[0][25] = '교체이유';
const r3 = GST.SM.map(renamed, GST.SM.SPEC.mat);
if(r3.hi === 0 && r3.C.reason === -1 && r3.miss.some(m=>m.startsWith('reason'))){
  pass++; console.log('  ✓ reason을 -1로 두고 miss에 기록 (옛 열 번호로 몰래 폴백하지 않음)');
  if(r3.C.workDate === 28){ pass++; console.log('  ✓ 나머지 열은 정상 유지 — 한 열 이름이 바뀌어도 시트 전체가 죽지 않음'); }
  else { fail++; console.log('  ❌ 다른 열까지 깨짐:', r3.C.workDate); }
} else { fail++; console.log('  ❌ 이름 변경이 감지되지 않음:', r3.hi, r3.C.reason, r3.miss); }

console.log('\n회귀 테스트 — 힌트 열 "자재명" 변경 시에도 별칭(자재코드)으로 헤더 인식');
const hintRenamed = H.mat.map(r=>r.slice());
hintRenamed[0][23] = '부품명';
const r5 = GST.SM.map(hintRenamed, GST.SM.SPEC.mat);
if(r5.hi === 0 && r5.C.matCode === 15){
  pass++; console.log('  ✓ 헤더 행은 계속 인식, matName만 못 찾음으로 표시');
} else { fail++; console.log('  ❌ 헤더 인식 실패:', r5.hi, r5.miss); }

// --- 부분일치 사고 방지 확인 ---
console.log('\n회귀 테스트 — 부분일치 오작동 방지');
const trap = H.mat.map(r=>r.slice());
trap[0].splice(5,0,'재사용일');            // '사용일...'을 부분일치로 잡던 사고 재현
const r4 = GST.SM.map(trap, GST.SM.SPEC.mat);
if(r4.C.daysPaid === 30 && r4.C.workDate === 29){
  pass++; console.log('  ✓ "재사용일"에 걸리지 않고 정확일치 유지');
} else { fail++; console.log('  ❌ 오매칭:', {daysPaid:r4.C.daysPaid, workDate:r4.C.workDate}); }

console.log('\n' + '='.repeat(64));
console.log(`결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail?1:0);
