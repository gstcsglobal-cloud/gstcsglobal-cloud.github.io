// 실제 시트 데이터로 페이지를 띄워, 헤더 매핑 전환 후에도 숫자가 나오는지 확인한다.
// core.js는 배포본 URL을 부르므로 로컬 수정본으로 가로챈다.
import { chromium } from 'playwright';
// 브라우저 경로를 박아두지 않는다 — PW_CHROMIUM이 있으면 쓰고 없으면 Playwright 기본 해석에 맡긴다
const PW_OPTS = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
import fs from 'fs';
import path from 'path';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const HERE=path.dirname(new URL(import.meta.url).pathname);
const CSV={ '646668307':'csv_wk.csv', '31302669':'csv_mat.csv', '891608329':'csv_inst.csv',
  '2123129719':'csv_cip11.csv', '1999732389':'csv_cip16.csv' };

const PAGES=[
  {f:'fault/index.html',    name:'고장현황'},
  {f:'material/index.html', name:'자재현황'},
  {f:'pm/index.html',       name:'PM점검'},
  {f:'scrubber/index.html', name:'설치현황'},
  {f:'tco/index.html',      name:'TCO'},
  {f:'cip/index.html',      name:'CIP현황'}
];

const browser=await chromium.launch(PW_OPTS);
let fails=0;

for(const P of PAGES){
  const ctx=await browser.newContext();
  const errs=[], logs=[];
  const page=await ctx.newPage();
  page.on('pageerror', e=>errs.push('JS: '+e.message));
  page.on('console', m=>{ if(m.type()==='error') errs.push('console: '+m.text().slice(0,160)); else logs.push(m.text()); });

  // core.js → 로컬 수정본 (+ 테스트용 인증 통과 스텁. 실제 파일은 건드리지 않는다)
  await page.route('**/assets/core.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(ROOT+'/assets/core.js','utf8')
      // authGate는 통과시키되 authOn은 꺼서 fetchCSV가 프록시 대신 시트 URL을 직접 치게 한다
      +'\n;GST.authOn=function(){return false;};GST.getSession=async function(){return {user:{email:"smoke@test"}};};'
      +'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.style.display="none";'
      +'if(GST._authOk)GST._authOk();return true;};GST.token=async function(){return "smoke";};'}));
  await page.route('**/assets/*.css', r=>{
    const n=r.request().url().split('/').pop().split('?')[0];
    try{ r.fulfill({status:200,contentType:'text/css',body:fs.readFileSync(ROOT+'/assets/'+n,'utf8')}); }
    catch{ r.fulfill({status:200,contentType:'text/css',body:''}); }
  });
  // CDN 라이브러리 → 로컬 사본 (이 환경은 외부 CDN이 막혀 있다)
  await page.route('**/cdn.jsdelivr.net/**', r=>{
    const u=r.request().url();
    const send=(p,ct)=>r.fulfill({status:200,contentType:ct,body:fs.readFileSync(p,'utf8')});
    if(u.includes('chart.umd'))   return send(HERE+'/node_modules/chart.js/dist/chart.umd.js','application/javascript');
    if(u.includes('papaparse'))   return send(HERE+'/node_modules/papaparse/papaparse.min.js','application/javascript');
    if(u.endsWith('.css'))        return r.fulfill({status:200,contentType:'text/css',body:''});
    // zoom 플러그인·supabase·pptxgenjs는 이 테스트에 불필요 — 빈 스텁
    return r.fulfill({status:200,contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};'});
  });
  // 구글시트 → 실제 데이터 CSV
  await page.route('**/spreadsheets/**', r=>{
    const gid=(r.request().url().match(/gid=(\d+)/)||[])[1];
    const f=CSV[gid];
    if(f) r.fulfill({status:200,contentType:'text/csv',body:fs.readFileSync(path.join(HERE,f),'utf8')});
    else  r.fulfill({status:200,contentType:'text/csv',body:''});
  });
  // 인증/외부 호출은 통과시키되 실패해도 무방
  await page.route('**supabase**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));

  await page.goto('file://'+ROOT+'/'+P.f, {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(4500);

  // 열 매핑 결과 회수
  const sm=await page.evaluate(()=>{
    if(!window.GST||!GST.SM) return {err:'GST.SM 없음'};
    return GST.SM._reg.map(r=>({sheet:r.sheet,hi:r.hi,
      found:Object.values(r.C).filter(v=>v>=0).length,
      total:Object.keys(r.C).length, miss:r.miss, dup:r.dup.length}));
  });
  // 화면에 실제 숫자가 찍혔는지 (KPI 값 중 0이 아닌 게 있는지)
  const kpi=await page.evaluate(()=>{
    const out=[];
    document.querySelectorAll('.kpi .v,.kpi-v,.kv,.kpi b,.kpi .val').forEach(e=>{
      const t=(e.textContent||'').trim(); if(t) out.push(t);
    });
    return out.slice(0,8);
  });

  const mapOK = Array.isArray(sm) && sm.length>0 && sm.every(s=>!s.miss.length);
  const hasNum = kpi.some(v=>/[1-9]/.test(v));
  const ok = mapOK && !errs.length && hasNum;
  if(!ok) fails++;

  console.log(`\n${ok?'✓':'❌'} ${P.name}  (${P.f})`);
  if(Array.isArray(sm)) sm.forEach(s=>{
    console.log(`    ${s.sheet}: 헤더 ${s.hi+1}행 · 인식 ${s.found}/${s.total}`
      + (s.miss.length?`  ⚠ 못찾음 ${s.miss.join(', ')}`:'')
      + (s.dup?`  (이름중복 ${s.dup})`:''));
  }); else console.log('   ', sm);
  console.log(`    KPI 표시값: ${kpi.join(' | ')||'(없음)'}`);
  if(errs.length) console.log('    에러:', errs.slice(0,4).join(' // '));
  await ctx.close();
}

await browser.close();
console.log(`\n${fails?'❌ '+fails+'개 페이지 실패':'✅ 전 페이지 통과'}`);
process.exit(fails?1:0);
