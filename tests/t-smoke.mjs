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
  /* 주간현황은 픽스처가 다 없어도(교육·인원·휴가·ABP·알람) 실적+설치만으로 뜬다.
     빠져 있던 동안 «단지 다중선택이 두 번째부터 안 먹는» 결함이 여기서만 났고
     아무 검사도 그걸 못 봤다 — 이 페이지는 mount 를 5번 부른다. */
  {f:'report/index.html',   name:'주간현황'},
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

  /* 단지 다중선택이 «실제로 열리는지». 소스만 봐서는 절대 못 잡는 실패가 있다 —
     .slicer 에 position 이 없으면 박스가 position:fixed 인 사이드바를 기준 삼아
     top:100% = 사이드바 바닥에 열려 화면 밖으로 나간다. JS 에러도, 콘솔 경고도
     없이 «눌러도 아무 일이 없는 필터»가 된다. 그래서 좌표로 확인한다. */
  let msel = null;
  if(await page.$('#gf-campusBtn')){
    const tg = await page.$('.gst-sb-toggle');
    if(tg && !(await page.evaluate(()=>document.body.classList.contains('gst-sb-open')))) await tg.click();
    await page.waitForTimeout(400);
    const dis = await page.$eval('#gf-campusBtn', b=>b.disabled);
    if(dis) msel = {skip:'목록 비어 잠김'};
    else {
      await page.click('#gf-campusBtn');
      await page.waitForTimeout(250);
      msel = await page.evaluate(()=>{
        const box=document.getElementById('gf-campusBox');
        const r=box.getBoundingClientRect();
        const cb=box.querySelector('input[data-v]');
        return { shown: getComputedStyle(box).display!=='none',
                 w:Math.round(r.width), h:Math.round(r.height),
                 inView: r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0,
                 n: box.querySelectorAll('input[data-v]').length,
                 // 체크박스가 폭을 다 먹으면 글자가 반대편 끝으로 밀린다(사이드바의 input{width:100%})
                 cbw: cb?Math.round(cb.getBoundingClientRect().width):0 };
      });
      /* ⚠ 「열리는지」만 보면 안 된다. 실제로 겪은 결함은 «첫 항목은 체크되는데 두 번째가
         안 먹는» 것이었다 — 박스를 만든 뒤 페이지가 mount 를 다시 부르면서 Set 이 새
         객체로 바뀌어, 클릭이 옛 Set 으로 들어가고 있었다. 에러는 하나도 안 났다.
         그래서 «두 개를 눌러 둘 다 남는지»까지 본다. */
      const vs = await page.$$eval('#gf-campusBox input[data-v]', a=>a.map(i=>i.dataset.v));
      if(vs.length>=2){
        for(const v of [vs[0], vs[1]]){
          await page.click(`#gf-campusBox input[data-v="${v}"]`).catch(()=>{});
          await page.waitForTimeout(350);
        }
        msel.picked = await page.evaluate(()=>[...GST.filters.F.campus]);
        msel.multi = msel.picked.length===2 && msel.picked.includes(vs[0]) && msel.picked.includes(vs[1]);
      } else msel.multi = null;     // 값이 하나뿐인 자료는 다중선택을 확인할 수 없다
      msel.ok = msel.shown && msel.w>0 && msel.h>0 && msel.inView && msel.n>0
                && msel.cbw>0 && msel.cbw<40 && msel.multi!==false;
    }
  }

  const mapOK = Array.isArray(sm) && sm.length>0 && sm.every(s=>!s.miss.length);
  const hasNum = kpi.some(v=>/[1-9]/.test(v));
  const ok = mapOK && !errs.length && hasNum && !(msel && msel.ok===false);
  if(!ok) fails++;

  console.log(`\n${ok?'✓':'❌'} ${P.name}  (${P.f})`);
  if(Array.isArray(sm)) sm.forEach(s=>{
    console.log(`    ${s.sheet}: 헤더 ${s.hi+1}행 · 인식 ${s.found}/${s.total}`
      + (s.miss.length?`  ⚠ 못찾음 ${s.miss.join(', ')}`:'')
      + (s.dup?`  (이름중복 ${s.dup})`:''));
  }); else console.log('   ', sm);
  console.log(`    KPI 표시값: ${kpi.join(' | ')||'(없음)'}`);
  if(msel) console.log('    단지 다중선택: ' + (msel.skip ? msel.skip
    : (msel.ok?'정상':'❌ 결함') + ` (박스 ${msel.w}×${msel.h}px · 화면안 ${msel.inView}`
      + ` · 체크박스 ${msel.cbw}px · 항목 ${msel.n}`
      + ` · 둘 고르기 ${msel.multi===null?'해당없음':(msel.multi?'됨 ['+msel.picked.join(',')+']':'❌ 안 됨 ['+(msel.picked||[]).join(',')+']')})`));
  if(errs.length) console.log('    에러:', errs.slice(0,4).join(' // '));
  await ctx.close();
}

await browser.close();
console.log(`\n${fails?'❌ '+fails+'개 페이지 실패':'✅ 전 페이지 통과'}`);
process.exit(fails?1:0);
