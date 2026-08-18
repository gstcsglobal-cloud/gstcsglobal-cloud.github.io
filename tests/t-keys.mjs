// 각 페이지가 쓰는 C.xxx / CI.xxx / CW.xxx / CM.xxx 키가 전부 매핑에 존재하는지 검사.
// 하나라도 빠지면 r[undefined] → 조용히 빈 값이 되므로 반드시 걸러야 한다.
import fs from 'fs';
import path from 'path';
const HERE = path.dirname(new URL(import.meta.url).pathname);

/* 픽스처가 없으면 «크래시»한다 — npm run all 이 1번에서 죽어 나머지 검사가 아예 안 돈다.
   그리고 크래시는 «검사가 안 됐다»는 사실을 남기지 않는다. 조용히 견디되 초록불은 안 준다.
   실제 CI 에서는 STRICT_FIXTURES=1 로 실패시킨다. */
{
  const _need = ["hdr.json"];
  const _miss = _need.filter((f) => !fs.existsSync(path.join(HERE, f)));
  if (_miss.length) {
    console.log('⚠️  픽스처가 없어 이 검사를 못 했다: ' + _miss.join(', ') + ' (tests/README.md 로 생성)');
    process.exit(process.env.STRICT_FIXTURES ? 2 : 0);
  }
}

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');

const el=()=>({style:{},appendChild(){},insertBefore(){},remove(){},setAttribute(){},
  addEventListener(){},classList:{add(){},remove(){},toggle(){}},querySelector:()=>null,
  querySelectorAll:()=>[],insertAdjacentHTML(){},insertAdjacentElement(){},
  parentNode:{insertBefore(){}},firstElementChild:null,textContent:'',innerHTML:''});
global.document={createElement:el,getElementById:()=>null,querySelector:()=>null,
  querySelectorAll:()=>[],body:el(),documentElement:el(),addEventListener(){},head:el(),readyState:'complete'};
global.window={addEventListener(){},location:{href:'',search:''},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},matchMedia:()=>({matches:false,addEventListener(){}})};
global.window.self=global.window.top=global.window;
global.localStorage=global.window.localStorage;
global.location=global.window.location;
try{ new Function(fs.readFileSync(ROOT+'/assets/core.js','utf8'))(); }catch(e){ console.log('core.js:',e.message); }
const GST=global.window.GST||global.GST;

const H=JSON.parse(fs.readFileSync(new URL('./hdr.json',import.meta.url),'utf8'));
const mapped={};
for(const k of ['wk','mat','inst']) mapped[k]=GST.SM.map(H[k],GST.SM.SPEC[k]).C;

// 페이지 → {변수명: [스펙키, 그 페이지에서 추가로 붙이는 별명들]}
const PAGES={
  'fault/index.html':    { C:['wk',[]],  CINST:['inst',[]] },
  'material/index.html': { C:['mat',['process']] },
  'pm/index.html':       { C:['wk',['site','group1','detail1','work','sn','maint','chamber']] },
  'scrubber/index.html': { CI:['inst',[]] },
  'tco/index.html':      { CI:['inst',[]], CW:['wk',['sn','work']], CM:['mat',[]] },
  'report/index.html':   { CW:['wk',['sn','work','chamber']], CI:['inst',[]] }
};

let bad=0, tot=0;
for(const [file,vars] of Object.entries(PAGES)){
  const src=fs.readFileSync(ROOT+'/'+file,'utf8');
  const problems=[];
  for(const [v,[specKey,extra]] of Object.entries(vars)){
    const allowed=new Set([...Object.keys(mapped[specKey]),...extra]);
    const used=new Set();
    // C.foo / CI.foo 형태 (뒤에 = 가 오는 대입은 별명 정의이므로 제외하지 않고 같이 본다)
    const re=new RegExp('\\b'+v+'\\.([A-Za-z_][A-Za-z0-9_]*)','g');
    let m; while((m=re.exec(src))) used.add(m[1]);
    for(const k of used){ tot++; if(!allowed.has(k)){ problems.push(`${v}.${k}`); bad++; } }
  }
  const mark = problems.length ? '❌' : '✓';
  console.log(`${mark} ${file}`+(problems.length?`  미정의 키: ${problems.join(', ')}`:''));
}

// 제거한 상수가 남아 있지 않은지
console.log('\n--- 잔재 검사 ---');
const STALE=[
  ['fault/index.html','INST_SN'],['fault/index.html','INST_TON'],
  ['tco/index.html','헤더 라벨이 비어 있어'],
];
for(const [f,pat] of STALE){
  const hit=fs.readFileSync(ROOT+'/'+f,'utf8').includes(pat);
  console.log(`${hit?'❌ 남아있음':'✓ 제거됨'}  ${f} : ${pat}`);
  if(hit) bad++;
}

console.log(`\n검사한 키 ${tot}개 · 문제 ${bad}건`);
process.exit(bad?1:0);
