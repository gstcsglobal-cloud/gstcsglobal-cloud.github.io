// 핵심 회귀 검증: 시트 중간에 열을 끼워 넣어도 화면 숫자가 그대로인가?
// 원본 CSV로 한 번, 열을 삽입한 CSV로 한 번 띄워 KPI를 비교한다.
// 예전 하드코딩 방식이었다면 두 번째에서 전부 틀어졌어야 한다.
import { chromium } from 'playwright';
// 브라우저 경로를 박아두지 않는다 — PW_CHROMIUM이 있으면 쓰고 없으면 Playwright 기본 해석에 맡긴다
const PW_OPTS = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
import fs from 'fs'; import path from 'path';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const HERE=path.dirname(new URL(import.meta.url).pathname);
const CSVF={'646668307':'csv_wk.csv','31302669':'csv_mat.csv','891608329':'csv_inst.csv'};
const RAW={}; for(const [g,f] of Object.entries(CSVF)) RAW[g]=fs.readFileSync(HERE+'/'+f,'utf8');

// 설치현황 헤더는 셀 안에 줄바꿈이 들어 있다('Scrubber⏎CODE').
// 줄 단위로 쪼개면 CSV가 깨지므로 반드시 제대로 된 파서를 쓴다.
const { default: Papa } = await import('papaparse');
function insertCols(csv, at, names){
  const rows=Papa.parse(csv,{skipEmptyLines:true}).data;
  rows.forEach((cells,i)=>cells.splice(at,0,...(i===0?names:names.map(()=>''))));
  return Papa.unparse(rows);
}

async function run(shift){
  const browser=await chromium.launch(PW_OPTS);
  const out={};
  for(const P of ['fault','material','pm','scrubber','tco']){
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    await page.route('**/assets/core.js',r=>r.fulfill({status:200,contentType:'application/javascript',
      body:fs.readFileSync(ROOT+'/assets/core.js','utf8')
        +'\n;GST.authOn=function(){return false;};GST.getSession=async function(){return {user:{email:"s@t"}};};'
        +'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.style.display="none";'
        +'if(GST._authOk)GST._authOk();return true;};GST.token=async function(){return "s";};'}));
    await page.route('**/assets/*.css',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    await page.route('**/cdn.jsdelivr.net/**',r=>{const u=r.request().url();
      if(u.includes('chart.umd'))return r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(HERE+'/node_modules/chart.js/dist/chart.umd.js','utf8')});
      if(u.includes('papaparse'))return r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(HERE+'/node_modules/papaparse/papaparse.min.js','utf8')});
      return r.fulfill({status:200,contentType:'application/javascript',body:''});});
    await page.route('**/spreadsheets/**',r=>{
      const gid=(r.request().url().match(/gid=(\d+)/)||[])[1];
      let body=RAW[gid]||'';
      if(body&&shift){
        // 시트마다 앞쪽에 새 열 2개를 끼워 넣는다 — 실제로 자주 벌어지는 변경
        body=insertCols(body, 5, ['신규열_A','신규열_B']);
      }
      r.fulfill({status:200,contentType:'text/csv',body});});
    await page.goto('file://'+ROOT+'/'+P+'/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(4500);
    out[P]=await page.evaluate(()=>{
      const k=[]; document.querySelectorAll('.kpi .v,.kpi-v,.kv,.kpi b,.kpi .val').forEach(e=>{
        const t=(e.textContent||'').trim(); if(t)k.push(t);});
      const miss=(window.GST&&GST.SM)?GST.SM._reg.flatMap(r=>r.miss):['SM없음'];
      return {kpi:k.slice(0,10), miss};
    });
    await ctx.close();
  }
  await browser.close();
  return out;
}

console.log('① 원본 시트로 측정...');
const base=await run(false);
console.log('② 5번 위치에 새 열 2개를 끼워 넣고 재측정...\n');
const shifted=await run(true);

let fail=0;
for(const p of Object.keys(base)){
  const a=base[p].kpi.join(' | '), b=shifted[p].kpi.join(' | ');
  const same=a===b, noMiss=!shifted[p].miss.length;
  if(!same||!noMiss) fail++;
  console.log(`${same&&noMiss?'✓':'❌'} ${p}`);
  console.log(`    원본 : ${a}`);
  console.log(`    삽입후: ${b}`);
  if(shifted[p].miss.length) console.log(`    ⚠ 못 찾은 열: ${shifted[p].miss.join(', ')}`);
}
console.log(`\n${fail?'❌ '+fail+'개 페이지가 열 삽입에 영향받음':'✅ 열을 끼워 넣어도 모든 페이지 숫자 동일 — 코드 수정 불필요'}`);
process.exit(fail?1:0);
