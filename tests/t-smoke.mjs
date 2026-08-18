// 실제 시트 데이터로 페이지를 띄워, 헤더 매핑 전환 후에도 숫자가 나오는지 확인한다.
// core.js는 배포본 URL을 부르므로 로컬 수정본으로 가로챈다.
import { chromium } from 'playwright';
// 브라우저 경로를 박아두지 않는다 — PW_CHROMIUM이 있으면 쓰고 없으면 Playwright 기본 해석에 맡긴다
const PW_OPTS = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
import fs from 'fs';
import path from 'path';
import http from 'http';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const HERE=path.dirname(new URL(import.meta.url).pathname);

let fails=0;

/* ── [0] 사이드바 — 픽스처가 없어도 도는 검사 ─────────────────────────────
   ⚠ 이 파일은 픽스처가 없으면 «통째로» 건너뛴다. 그런데 사이드바가 실제로 그려지고
     박스가 열리는지는 **소스로는 원리적으로 못 본다** — .slicer 에 position 이 없으면
     박스가 사이드바 «바닥»에 열려 화면 밖으로 나가는데, JS 에러도 경고도 안 난다
     (「눌러도 아무 일이 없는 필터」). 그 검사가 픽스처 유무에 매여 있으면 안 된다.
   core.js 만으로 도는 최소 페이지를 띄워 먼저 본다. 자료는 지어낸 값이다. */
{
  const CORE = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
  const HTML = '<!doctype html><meta charset="utf-8"><body><aside></aside>'
             + '<div class="slicers"></div><script>' + CORE + '<\/script>';
  const srv = http.createServer((rq, rs) => { rs.setHeader('content-type', 'text/html'); rs.end(HTML); });
  await new Promise(r => srv.listen(0, r));
  const b0 = await chromium.launch(PW_OPTS);
  const pg = await b0.newPage();
  const errs0 = []; pg.on('pageerror', e => errs0.push(e.message));
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/');
  const out = await pg.evaluate(() => {
    const R = [
      { rg:'국내', op:'SEC', cu:'삼성', ca:'H1', li:'11', l2:'11-1', tm:'H운영팀' },
      { rg:'국내', op:'SEC', cu:'삼성', ca:'H1', li:'11', l2:'11-2', tm:'H운영팀' },
    ];
    /* 페이지가 «자기 자료가 있는 쪽»만 선언하는 실제 모양 그대로 — 설비는 일곱 축,
       인원은 구분·팀만. 그래서 인원 쪽 라인2 는 잠긴 칸이 되어야 한다. */
    GST.filters.mount({ page:'smoke0', rows:()=>R, onChange:()=>{},
      get:{ region:x=>x.rg, op:x=>x.op, customer:x=>x.cu, campus:x=>x.ca,
            line:x=>x.li, line2:x=>x.l2 },
      loose:{ line2:1 },
      rowsH:()=>R, getH:{ region:x=>x.rg, team:x=>x.tm } });
    const lbls = [...document.querySelectorAll('.gf-base .slicer .lbl')].map(e => e.textContent.trim());
    const eqBtn = document.getElementById('gf-line2Btn');
    const hrBtn = document.getElementById('gh-line2Btn');
    GST.mselToggle('gf-line2', { stopPropagation(){} });      // 실제로 눌러 본다
    const box = document.getElementById('gf-line2Box');
    const br = box.getBoundingClientRect(), sr = eqBtn.getBoundingClientRect();
    return { lbls, eqDis: eqBtn.disabled, eqTxt: eqBtn.textContent.trim(),
             hrDis: hrBtn.disabled, hrTxt: hrBtn.textContent.trim(),
             open: getComputedStyle(box).display !== 'none'
                   && br.top >= sr.top && Math.abs(br.top - sr.bottom) < 40,
             opts: [...box.querySelectorAll('label')].map(l => l.textContent.trim()) };
  });
  const s0 = (c, m) => { if (c) console.log('  ✓ ' + m); else { fails++; console.log('  ❌ ' + m); } };
  console.log('[0] 사이드바 (픽스처 불필요)');
  /* 두 블록이 «같은 폼»이다 — 축 하나가 한쪽에만 있으면 그것 자체가 「필터가 다르다」로 읽힌다 */
  const EIGHT = '구분>팀>운영단위>고객사>사업부>단지>라인>라인2';
  s0(out.lbls.slice(0, 8).join('>') === EIGHT, '설비 블록 순서 ' + EIGHT + ' (실제 ' + out.lbls.slice(0,8).join('>') + ')');
  s0(out.lbls.slice(8, 16).join('>') === EIGHT, '인원 블록도 «같은 폼·같은 순서»');
  s0(!out.eqDis, '설비 라인2 는 열린다 ("' + out.eqTxt + '")');
  /* 사용자 요청: 인원 필터에도 칸은 두되 «우선 미적용». 칸을 숨기지 않는다(v91). */
  s0(out.hrDis && /이 화면 미적용/.test(out.hrTxt), '인원 라인2 는 잠긴다 ("' + out.hrTxt + '")');
  s0(out.open, '눌렀을 때 박스가 버튼 «바로 아래»에 열린다 (사이드바 바닥이 아니라)');
  s0(out.opts.join(' · ') === '11-1 · 11-2', '목록에 라인2 값이 뜬다 (' + out.opts.join(' · ') + ')');
  s0(!errs0.length, 'JS 에러 0건' + (errs0.length ? ' — ' + errs0[0] : ''));
  await b0.close(); srv.close();
}

/* 픽스처가 없으면 라우트 핸들러 «안에서» 크래시한다 — 스택만 남고 «검사가 안 됐다»는
   사실은 안 남는다. 미리 끊고 그 사실을 적는다. */
{
  const _need = ["csv_wk.csv", "csv_inst.csv"];
  const _miss = _need.filter((f) => !fs.existsSync(path.join(HERE, f)));
  if (_miss.length) {
    console.log('⚠️  픽스처가 없어 «페이지 렌더» 검사를 못 했다: ' + _miss.join(', ') + ' (tests/README.md 로 생성)');
    /* ⚠ 위 [0] 이 실패했으면 여기서 0 을 내면 안 된다 — 픽스처가 없다는 이유로 실제
       실패가 초록불로 덮인다. 그것이 이 파일이 경계하는 «거짓 초록불»이다. */
    process.exit(fails ? 1 : (process.env.STRICT_FIXTURES ? 2 : 0));
  }
}

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
  {f:'cip/index.html',      name:'CIP현황'},
  /* ⚠ 인원현황이 빠져 있었다 — 손이 가장 많이 간 페이지(교육 축·피벗·편집·자체 PPT)가
     렌더·JS에러 검사를 아예 안 받고 있었다. 여덟 탭 중 유일하게 빠진 것이라
     «왜 여기만 빠졌지»의 답이 없다면 그것 자체가 위험 신호다. */
  {f:'hr/index.html',       name:'인원현황'}
];

const browser=await chromium.launch(PW_OPTS);

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
