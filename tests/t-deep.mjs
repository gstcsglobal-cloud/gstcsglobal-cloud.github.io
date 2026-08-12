// 심층 분석(v75) 검증 — 화면에 실제로 찍힌 표를 읽어 사전 실측값과 대조한다.
// 코드를 읽어서 "맞을 것이다"가 아니라, 브라우저가 그린 숫자를 가져와 비교한다.
import { chromium } from 'playwright';
const PW_OPTS = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
import fs from 'fs';
import path from 'path';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const HERE=path.dirname(new URL(import.meta.url).pathname);
const CSV={ '646668307':'csv_wk.csv', '31302669':'csv_mat.csv', '891608329':'csv_inst.csv',
  '2123129719':'csv_cip11.csv', '1999732389':'csv_cip16.csv' };

async function newPage(browser){
  const ctx=await browser.newContext();
  const errs=[];
  const page=await ctx.newPage();
  page.on('pageerror', e=>errs.push('JS: '+e.message));
  page.on('console', m=>{ if(m.type()==='error') errs.push('console: '+m.text().slice(0,200)); });
  await page.route('**/assets/core.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(ROOT+'/assets/core.js','utf8')
      +'\n;GST.authOn=function(){return false;};GST.getSession=async function(){return {user:{email:"t@test"}};};'
      +'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.style.display="none";'
      +'if(GST._authOk)GST._authOk();return true;};GST.token=async function(){return "t";};'}));
  await page.route('**/assets/*.css', r=>{
    const n=r.request().url().split('/').pop().split('?')[0];
    try{ r.fulfill({status:200,contentType:'text/css',body:fs.readFileSync(ROOT+'/assets/'+n,'utf8')}); }
    catch{ r.fulfill({status:200,contentType:'text/css',body:''}); }
  });
  await page.route('**/cdn.jsdelivr.net/**', r=>{
    const u=r.request().url();
    const send=(p,ct)=>r.fulfill({status:200,contentType:ct,body:fs.readFileSync(p,'utf8')});
    if(u.includes('chart.umd')) return send(HERE+'/node_modules/chart.js/dist/chart.umd.js','application/javascript');
    if(u.includes('papaparse')) return send(HERE+'/node_modules/papaparse/papaparse.min.js','application/javascript');
    if(u.endsWith('.css'))      return r.fulfill({status:200,contentType:'text/css',body:''});
    return r.fulfill({status:200,contentType:'application/javascript',
      body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};'});
  });
  await page.route('**/spreadsheets/**', r=>{
    const gid=(r.request().url().match(/gid=(\d+)/)||[])[1];
    const f=CSV[gid];
    if(f) r.fulfill({status:200,contentType:'text/csv',body:fs.readFileSync(path.join(HERE,f),'utf8')});
    else  r.fulfill({status:200,contentType:'text/csv',body:''});
  });
  await page.route('**supabase**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  return {ctx,page,errs};
}

// 표 하나를 2차원 배열로 회수
const grab = (page,id) => page.evaluate(sel=>{
  const tb=document.getElementById(sel); if(!tb) return null;
  return Array.from(tb.querySelectorAll('tr')).map(tr=>
    Array.from(tr.querySelectorAll('td')).map(td=>(td.textContent||'').trim()));
}, id);

let pass=0, fail=0;
const ok  =(m)=>{pass++; console.log('  ✓ '+m);};
const bad =(m)=>{fail++; console.log('  ❌ '+m);};
const near=(a,b,tol)=>a!=null&&b!=null&&Math.abs(a-b)<=tol;
const numOf=s=>{const m=String(s).replace(/,/g,'').match(/-?[\d.]+/); return m?+m[0]:null;};

const browser=await chromium.launch(PW_OPTS);

/* ══════════════ 자재현황 ══════════════ */
{
  console.log('\n'+'='.repeat(66)+'\n자재현황 — 심층 분석');
  const {ctx,page,errs}=await newPage(browser);
  await page.goto('file://'+ROOT+'/material/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(7000);

  if(errs.length) bad('JS 에러: '+errs.slice(0,3).join(' // ')); else ok('JS 에러 0');

  const n=await page.evaluate(()=>window.DATA?DATA.length:(typeof DATA!=='undefined'?DATA.length:-1)).catch(()=>-1);
  console.log('  · 로드 행수:', n);

  // ── 집중지수: 기준 축 = 세부공정 ──
  await page.selectOption('#dpAxis','detail').catch(()=>{});
  await page.selectOption('#dpMin','10').catch(()=>{});
  await page.waitForTimeout(1200);
  const lift=await grab(page,'dpLiftBody');
  if(!lift||!lift.length||lift[0].length<7){ bad('집중지수 표가 비었다'); }
  else{
    console.log('  · 집중지수 TOP5:');
    lift.slice(0,5).forEach(r=>console.log('      '+r.slice(0,5).join('  |  ')));
    const find=(a,m)=>lift.find(r=>r[0]===a&&r[1]===m);
    // 사전 실측: STR×DRAIN PIPE-E 35건 27.8% 229배
    const str=find('STR','DRAIN PIPE-E');
    if(str && near(numOf(str[4]),229,25)) ok(`STR × DRAIN PIPE-E = ${str[4]} (실측 229배)`);
    else bad(`STR × DRAIN PIPE-E: ${str?str[4]:'없음'} (기대 ≈229배)`);
    // HARPXT×VCR GASKET 66건 59.5% 42.9배
    const hx=find('HARPXT','VCR GASKET');
    if(hx && near(numOf(hx[3]),59.5,3)) ok(`HARPXT × VCR GASKET 축내비중 ${hx[3]} (실측 59.5%)`);
    else bad(`HARPXT × VCR GASKET: ${hx?hx[3]:'없음'} (기대 ≈59.5%)`);
    // 정렬이 집중지수 내림차순인지
    const xs=lift.map(r=>numOf(r[4])).filter(v=>v!=null);
    if(xs.every((v,i)=>i===0||xs[i-1]>=v-1e-9)) ok('집중지수 내림차순 정렬');
    else bad('정렬이 집중지수 순이 아니다');
    // 최소 건수 필터가 실제로 먹는지
    const under=lift.filter(r=>numOf(r[2])<10);
    if(!under.length) ok('최소 건수 10 미만 행 없음 (표본 3건짜리가 1등이 되지 않는다)');
    else bad(under.length+'건이 최소 건수 미만인데 표에 남아 있다');
    // O-RING이 상위를 점령하지 않는지 — 이 화면을 만든 이유 자체
    const orings=lift.slice(0,15).filter(r=>/O-?RING/i.test(r[1])).length;
    if(orings<=3) ok(`상위15 중 O-RING ${orings}건 — 건수 순위표의 O-RING 도배를 벗어났다`);
    else bad(`상위15 중 O-RING이 ${orings}건 — 집중지수가 제 역할을 못 한다`);
  }

  // ── 재교체 주기 ──
  const gap=await grab(page,'dpGapBody');
  if(!gap||!gap.length||gap[0].length<8){ bad('재교체 주기 표가 비었다'); }
  else{
    const row=n2=>gap.find(r=>r[0]===n2);
    const or=row('O-RING'), cl=row('CLAMP');
    console.log('  · O-RING:', or?or.join(' | '):'없음');
    console.log('  · CLAMP :', cl?cl.join(' | '):'없음');
    if(or && numOf(or[4])>=30) ok(`O-RING 중앙값 ${or[4]}일 — 같은 날 묶음이 동작한다(안 묶으면 1일대로 내려앉는다)`);
    else bad(`O-RING 중앙값 ${or?or[4]:'없음'} — 같은 날 중복이 안 묶인 것으로 보인다`);
    const meds=gap.map(r=>numOf(r[4])).filter(v=>v!=null);
    if(meds.every(v=>v>0)) ok('간격 0일 행 없음');
    else bad('간격 0일 행이 있다 — 같은 날 묶음 누락');
    if(meds.every((v,i)=>i===0||meds[i-1]<=v+1e-9)) ok('중앙값 오름차순 정렬 (자주 가는 것부터)');
    else bad('중앙값 정렬이 어긋났다');
  }

  // ── 급증 구간 ──
  const spike=await grab(page,'dpSpikeBody');
  if(!spike||!spike.length){ bad('급증 구간 표가 비었다'); }
  else{
    console.log('  · 급증 TOP3:');
    spike.slice(0,3).forEach(r=>console.log('      '+r.slice(0,5).join('  |  ')));
    // 사전 실측: O-RING 26-04에 2,118건 (직전 평균의 3.5배)
    const or=spike.find(r=>/O-?RING/i.test(r[0]));
    if(or && numOf(or[2])>=1500) ok(`O-RING 급증 ${or[1]} ${or[2]}건 (${or[4]}) — 실측 26-04 2,118건`);
    else bad('O-RING 급증 구간이 잡히지 않았다: '+(or?or.join(' | '):'없음'));
    if(spike.every(r=>numOf(r[4])>=2)) ok('모든 급증 행이 기준(2배) 이상');
    else bad('2배 미만인데 급증으로 잡힌 행이 있다');
  }

  // ── Best / Worst ──
  const best=await grab(page,'dpBestBody'), worst=await grab(page,'dpWorstBody');
  if(worst&&worst.length){
    console.log('  · Worst TOP3:'); worst.slice(0,3).forEach(r=>console.log('      '+r.join('  |  ')));
    const ws=worst.map(r=>numOf(r[1]));
    if(ws.every((v,i)=>i===0||ws[i-1]>=v)) ok('Worst 내림차순');
    else bad('Worst 정렬 오류');
  } else bad('Worst 표가 비었다');
  if(best&&best.length){
    const bs=best.map(r=>numOf(r[1]));
    if(bs.every(v=>v>=3)) ok('Best는 최소 표본 3건 이상만 (이력 없는 설비가 1등이 되지 않는다)');
    else bad('Best에 표본 3건 미만이 섞였다');
    if(worst&&worst.length&&numOf(best[0][1])<numOf(worst[0][1])) ok('Best 최솟값 < Worst 최댓값');
    else bad('Best/Worst가 뒤집혔다');
  } else bad('Best 표가 비었다');

  // ── 드릴: 줄을 누르면 화면 전체가 좁혀지는가 ──
  if(lift&&lift.length){
    const before=await page.evaluate(()=>LAST_F.length);
    await page.evaluate(()=>{ const tr=document.querySelector('#dpLiftBody tr.dp-row'); if(tr)tr.click(); });
    await page.waitForTimeout(1200);
    const after=await page.evaluate(()=>({n:LAST_F.length,f:JSON.parse(JSON.stringify(F))}));
    if(after.n>0 && after.n<before) ok(`드릴 동작: ${before.toLocaleString()} → ${after.n.toLocaleString()}건 (${after.f.detail||''}/${after.f.mat||''})`);
    else bad(`드릴 후 행수 ${after.n} (이전 ${before}) — 좁혀지지 않았다`);
    // 좁힌 뒤에도 다른 카드가 같은 문맥을 따르는지 (상세표 행수가 LAST_F를 넘지 않아야 한다)
    const det=await page.evaluate(()=>document.querySelectorAll('#tbody tr').length);
    if(det<=Math.min(after.n,500)) ok('상세 표도 같은 문맥을 따른다 ('+det+'행)');
    else bad('상세 표가 문맥을 따르지 않는다: '+det+'행');
  }
  await ctx.close();
}

/* ══════════════ 고장현황 ══════════════ */
{
  console.log('\n'+'='.repeat(66)+'\n고장현황 — 심층 분석');
  const {ctx,page,errs}=await newPage(browser);
  await page.goto('file://'+ROOT+'/fault/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(8000);
  if(errs.length) bad('JS 에러: '+errs.slice(0,3).join(' // ')); else ok('JS 에러 0');

  // 축은 세트 2개에 나뉘어 있다(원본 1행=1작업 / 작업자로 펼친 1행=1사람) — 둘을 합쳐서 본다
  const dims=await page.evaluate(()=>{
    if(!window.GST||!GST._pivot) return null;
    const out=[];
    GST._pivot.sets.forEach(s=>s.dims.forEach(d=>{ if(out.indexOf(d.t)<0) out.push(d.t); }));
    return out;
  });
  if(dims){
    console.log('  · 피벗 축:', dims.join(' · '));
    ['세부공정','BAY','채널위치','작업자'].forEach(k=>{
      if(dims.some(d=>d.indexOf(k)>=0)) ok('피벗 축에 '+k+' 있음');
      else bad('피벗 축에 '+k+' 없음');
    });
  } else bad('피벗 스펙이 등록되지 않았다');

  const rowKeys=await page.evaluate(()=>ROWS.length?Object.keys(ROWS[0]):[]);
  ['subproc','bay','chpos'].forEach(k=>{
    if(rowKeys.indexOf(k)>=0) ok('ROWS에 '+k+' 있음');
    else bad('ROWS에 '+k+' 없음');
  });

  // 세부공정 BM율 — 실측 ALDNIT 33.5% (전체 6.5%의 5.2배)
  const sub=await grab(page,'subBody');
  if(sub&&sub.length){
    console.log('  · 세부공정 BM율 TOP3:'); sub.slice(0,3).forEach(r=>console.log('      '+r.join('  |  ')));
    const al=sub.find(r=>r[0]==='ALDNIT');
    if(al&&near(numOf(al[3]),33.5,4)) ok(`ALDNIT BM율 ${al[3]} · 전체대비 ${al[4]} (실측 33.5% / 5.2배)`);
    else bad(`ALDNIT BM율: ${al?al[3]:'표에 없음'} (기대 ≈33.5%)`);
  } else bad('세부공정 BM율 표가 비었다');

  // Worst 설비 — 실측 KOXDLP1800 BM율 47.1%
  const worst=await grab(page,'bwWorst');
  if(worst&&worst.length){
    console.log('  · Worst 설비 TOP3:'); worst.slice(0,3).forEach(r=>console.log('      '+r.join('  |  ')));
    const k=worst.find(r=>r[0]==='KOXDLP1800');
    if(k&&near(numOf(k[4]),47.1,5)) ok(`KOXDLP1800 BM율 ${k[4]} · 전체대비 ${k[5]} (실측 47.1%)`);
    else bad(`KOXDLP1800: ${k?k[4]:'표에 없음'} (기대 ≈47.1%)`);
  } else bad('Worst 설비 표가 비었다');

  const best=await grab(page,'bwBest');
  if(best&&best.length){
    console.log('  · Best 설비 TOP3:'); best.slice(0,3).forEach(r=>console.log('      '+r.join('  |  ')));
    if(best.some(r=>r[0]==='L2DOLM1300')) ok('Best에 L2DOLM1300 (실측 53작업 0고장)');
    else bad('Best에 L2DOLM1300이 없다');
  } else bad('Best 설비 표가 비었다');

  // 좌우 편중 — 실측 KOXDL50600 LEFT 27 : RIGHT 2
  const lr=await grab(page,'chBody');
  if(lr&&lr.length){
    console.log('  · 좌우 편중 TOP3:'); lr.slice(0,3).forEach(r=>console.log('      '+r.join('  |  ')));
    const k=lr.find(r=>r[0]==='KOXDL50600');
    if(k) ok(`KOXDL50600 좌우 편중 잡힘: ${k.slice(1).join(' / ')}`);
    else bad('KOXDL50600 좌우 편중이 잡히지 않았다');
  } else bad('좌우 편중 표가 비었다');
  await ctx.close();
}

await browser.close();
console.log('\n'+'='.repeat(66));
console.log(`결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail?1:0);
