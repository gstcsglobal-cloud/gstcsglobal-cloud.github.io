/* t-kiosk — 자동순회(키오스크)가 «단지 × 페이지»를 제대로 돌고, 끝나면 사람이 걸어 둔
 * 필터를 돌려주는지.
 *
 * 왜 이 파일이 있나. 순회는 «남의 화면을 빌려 쓰는» 기능이라 조용히 틀릴 자리가 셋이다:
 *  ① 단지 목록을 셸에 박으면 국내가 들어왔을 때 통째로 빠진다(v89 그대로).
 *  ② 단지는 Set 축이다 — F.campus 에 직접 대입하면 그다음 .has 가 TypeError 로 죽는데
 *     에러가 화면에 안 뜬다. 반드시 GST.filters.set 을 지나야 한다.
 *  ③ 끝내고 필터를 안 돌려주면 «순회 한 번 켰더니 내 화면이 딴 단지» 가 된다.
 *
 * 실데이터를 쓰지 않는다 — 지어낸 행과 스텁 페이지다.
 *   실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-kiosk.mjs
 */
import fs from 'fs';
import path from 'path';
import {chromium} from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.log('  ❌ '+m);} };

/* ══════════════════════════════════════════════════════════════
   [1] 페이지 쪽(core.js) — 목록 제공 · Set 안전 · 저장/복원
   ══════════════════════════════════════════════════════════════ */
console.log('[1] core.js 가 단지 목록을 내주고, 필터를 안전하게 바꿨다 되돌리는지');
const MSG=[];
const el = () => ({ style:{}, appendChild(){}, insertBefore(){}, remove(){}, removeAttribute(){},
  setAttribute(){}, addEventListener(){}, classList:{add(){},remove(){},toggle(){}},
  querySelector:()=>null, querySelectorAll:()=>[], insertAdjacentHTML(){}, insertAdjacentElement(){},
  parentNode:{insertBefore(){}}, firstElementChild:null, textContent:'', innerHTML:'' });
global.document = { createElement:el, getElementById:()=>null, querySelector:()=>null,
  querySelectorAll:()=>[], body:el(), documentElement:el(), addEventListener(){},
  head:el(), readyState:'complete' };
const LISTEN=[];
global.window = { addEventListener:(t,fn)=>{ if(t==='message') LISTEN.push(fn); },
  location:{href:'',search:''}, self:{}, top:{}, parent:{postMessage:(m)=>MSG.push(m)},
  localStorage:(function(){ const M=new Map(); return {
    getItem:k=>M.has(k)?M.get(k):null, setItem:(k,v)=>M.set(k,String(v)), removeItem:k=>M.delete(k),
    _map:M }; })(), matchMedia:()=>({matches:false,addEventListener(){}}) };
global.window.self = global.window.top = global.window;
global.localStorage = global.window.localStorage;
global.location = global.window.location;
try { new Function(fs.readFileSync(ROOT+'/assets/core.js','utf8'))(); } catch(e){ console.log('core.js 로드 경고:', e.message); }
const GST = global.window.GST || global.GST;

/* ── [1-2] 자료 로딩 중인 탭에 값이 도착해도 «사람 필터»를 지우지 않는지 ──
   실제 결함이었다: mount 전에 값이 오면 ① 기준선이 «빈 값»으로 잡히고 ② 뒤늦은 load() 가
   순회 값을 덮고 ③ 순회를 끄면 사람 필터가 사라졌다. 벽 화면은 첫 바퀴 내내 라벨과 다른
   단지를 보여줬다. */
console.log('[1-2] 로딩 중인 탭에 값이 와도 사람 필터가 살아남는지');
{
  // 사람이 이 페이지에서 H3 를 골라 저장해 둔 상태
  global.localStorage.setItem('gst_bf_t3', JSON.stringify({campus:['H3']}));
  // 아직 mount 전 — 순회가 F16 을 보낸다
  const r = GST.filters.kioskSet('campus','F16');
  ok(r.applied===false && r.why==='loading', 'mount 전에는 «아직 못 걸었다»고 답해야 한다 (실제 '+JSON.stringify(r)+')');
  ok(global.localStorage.getItem('')===null, 'mount 전에는 «빈 이름» 키로 저장하면 안 된다');
  GST.filters.mount({page:'t3', rows:()=>[{c:'H3'},{c:'F16'},{c:'H1'}], onChange:()=>{}, get:{campus:x=>x.c}});
  ok(GST.filters.chosen('campus').join()==='F16', 'mount 되면 보류해 둔 값이 적용돼야 한다 (실제 '+GST.filters.chosen('campus').join()+')');
  GST.filters.kioskRestore();
  ok(GST.filters.chosen('campus').join()==='H3',
     '복원은 «사람이 걸어 둔 H3» 여야 한다 — 빈 값으로 돌리면 필터가 사라진다 (실제 '+GST.filters.chosen('campus').join()+')');
}


/* 지어낸 행 — 단지가 다섯. 국내(H·P)와 해외(F16)를 섞어 «목록을 박으면 걸리게» 한다. */
const ROWS=[{c:'H1'},{c:'H2'},{c:'H3'},{c:'P1'},{c:'F16'},{c:'H1'},{c:''}];
GST.filters.mount({page:'t', rows:()=>ROWS, onChange:()=>{}, get:{campus:x=>x.c}});

const list = GST.filters.options('campus');
ok(list.length===5, '단지 목록이 자료에서 5개 나와야 한다 (실제 '+list.length+': '+list.join(',')+')');
ok(list.indexOf('P1')>=0 && list.indexOf('F16')>=0, '국내·해외가 둘 다 목록에 있어야 한다(목록을 박으면 한쪽이 빠진다)');
ok(list.indexOf('')<0, '빈 값은 목록에 넣지 않는다');

const fire = d => LISTEN.forEach(fn=>fn({data:d, source:{postMessage:m=>MSG.push(m)}}));

// 목록 요청
MSG.length=0; fire({type:'gst-kiosk-q'});
const ans = MSG.find(m=>m.type==='gst-kiosk-a');
ok(!!ans && ans.list.length===5, '셸의 목록 요청에 단지 5개로 답해야 한다');

// 사람이 걸어 둔 필터
GST.filters.set('campus', ['H3','P1']);
ok(GST.filters.chosen('campus').join()==='H3,P1', '전제: 사람이 두 단지를 골라 뒀다');

// 순회가 단지를 바꾼다 — Set 이 살아 있어야 한다
fire({type:'gst-kiosk-set', axis:'campus', value:'F16'});
ok(GST.filters.chosen('campus').join()==='F16', '순회가 그 단지 하나만 걸어야 한다');
ok(GST.filters.F.campus instanceof Set, 'campus 가 Set 으로 남아야 한다(문자열이 되면 .has 가 TypeError)');
ok(GST.filters.hit('campus','F16')===true && GST.filters.hit('campus','H3')===false, '술어가 제대로 걸려야 한다');

// 여러 번 바뀌어도 «최초의 것»을 기억해야 한다
fire({type:'gst-kiosk-set', axis:'campus', value:'H1'});
fire({type:'gst-kiosk-set', axis:'campus', value:'H2'});
ok(GST.filters.chosen('campus').join()==='H2', '마지막 단지가 걸려 있어야 한다');

// 복원
fire({type:'gst-kiosk-restore'});
ok(GST.filters.chosen('campus').join()==='H3,P1',
   '끝나면 사람이 걸어 둔 두 단지가 그대로 돌아와야 한다 (실제 '+GST.filters.chosen('campus').join()+')');
ok(GST.filters.F.campus instanceof Set, '복원 뒤에도 Set 이어야 한다');

// 아무것도 안 걸어 뒀던 경우
GST.filters.set('campus', []);
fire({type:'gst-kiosk-set', axis:'campus', value:'H1'});
fire({type:'gst-kiosk-restore'});
ok(GST.filters.chosen('campus').length===0, '원래 비어 있었으면 비워서 돌려줘야 한다');

/* 문자열 축(운영단위)도 같은 통로로 — 그릇이 달라도(Set/문자열) 원래 모양으로 돌려줘야 한다 */
GST.filters.mount({page:'t2', rows:()=>[{c:'H1',o:'GST TAIWAN SCRUBBER'},{c:'P1',o:'SEC Scrubber'}],
  onChange:()=>{}, get:{campus:x=>x.c, op:x=>x.o}});
GST.filters.set('op','SEC Scrubber');   // 문자열 하나를 줘도 다중 축이면 Set 에 들어간다
MSG.length=0; fire({type:'gst-kiosk-q', axis:'op'});
const aop=MSG.find(m=>m.type==='gst-kiosk-a');
ok(aop && aop.axis==='op' && aop.list.length===2, '운영단위 목록도 자료에서 나와야 한다');
ok(aop && aop.ver>=102, '답에 core.js 버전을 실어야 한다 — 셸이 «옛 버전»을 짚어 줄 수 있게');
fire({type:'gst-kiosk-set', axis:'op', value:'GST TAIWAN SCRUBBER'});
ok(GST.filters.chosen('op').join()==='GST TAIWAN SCRUBBER',
   '순회가 건 운영단위 하나만 걸려야 한다 (실제 '+JSON.stringify(GST.filters.chosen('op'))+')');
/* ⚠ v106 에서 일곱 축이 전부 Set 이 됐다. 그릇이 바뀌어도 «순회가 하나만 걸고, 끝나면
   사람이 걸어 둔 것을 돌려준다»는 규율은 그대로여야 한다 — 그것을 여기서 못 박는다. */
ok(GST.filters.F.op instanceof Set, '운영단위도 Set 이어야 한다(v106 — 전 축 다중선택)');
fire({type:'gst-kiosk-restore'});
ok(GST.filters.chosen('op').join()==='SEC Scrubber',
   '끝나면 사람이 걸어 둔 값으로 돌아와야 한다 (실제 '+JSON.stringify(GST.filters.chosen('op'))+')');
ok(GST.filters.F.op instanceof Set, '복원 뒤에도 Set 이어야 한다');

/* 사람이 «여러 개» 걸어 둔 것도 그대로 돌려줘야 한다 — 다중선택이 된 뒤의 진짜 시험이다. */
GST.filters.set('op', ['SEC Scrubber','GST TAIWAN SCRUBBER']);
fire({type:'gst-kiosk-set', axis:'op', value:'SEC Scrubber'});
ok(GST.filters.chosen('op').length===1, '순회 중에는 하나만 걸린다');
fire({type:'gst-kiosk-restore'});
ok(GST.filters.chosen('op').sort().join()==='GST TAIWAN SCRUBBER,SEC Scrubber',
   '여러 개 걸어 둔 것도 «전부» 돌아와야 한다 (실제 '+JSON.stringify(GST.filters.chosen('op'))+')');

/* ── [1-3] 그 페이지 자료에 없는 값은 «걸린 척» 하지 않는지 ──
   목록에 없는 선택값은 fill/fillMulti 가 버리고, 빈 Set 은 pass() 에서 «전체»다.
   알려주지 않으면 벽 화면이 「H1」이라 적고 전사 합계를 보여준다. */
console.log('[1-3] 자료에 없는 값을 «걸렸다»고 하지 않는지');
{
  GST.filters.mount({page:'t4', rows:()=>[{c:'F11'},{c:'F16'}], onChange:()=>{}, get:{campus:x=>x.c}});
  GST.filters.set('campus', []);
  const r = GST.filters.kioskSet('campus','H1');    // 이 페이지에는 H1 자료가 없다
  ok(r.applied===false && r.why==='nodata',
     '자료에 없는 값은 applied=false 여야 한다 (실제 '+JSON.stringify(r)+')');
  const r2 = GST.filters.kioskSet('campus','F16');
  ok(r2.applied===true, '자료에 있는 값은 applied=true 여야 한다 (실제 '+JSON.stringify(r2)+')');
  fire({type:'gst-kiosk-restore'});
}

/* 메시지 경로로도 ack 가 나가는지 */
{
  GST.filters.mount({page:'t5', rows:()=>[{c:'F11'}], onChange:()=>{}, get:{campus:x=>x.c}});
  MSG.length=0; fire({type:'gst-kiosk-set', axis:'campus', value:'H9'});
  const ack=MSG.find(m=>m.type==='gst-kiosk-ack');
  ok(ack && ack.applied===false && ack.why==='nodata', '셸에 ack 를 돌려줘야 한다 (실제 '+JSON.stringify(ack)+')');
  MSG.length=0; fire({type:'gst-kiosk-set', axis:'campus', value:'F11'});
  const ack2=MSG.find(m=>m.type==='gst-kiosk-ack');
  ok(ack2 && ack2.applied===true, '걸렸으면 applied=true 로 답해야 한다');
  fire({type:'gst-kiosk-restore'});
}

/* ══════════════════════════════════════════════════════════════
   [2] 셸 엔진 — 실제 브라우저로 돌린다
   순서·화면 표시·전송 값·정지까지 소스로는 못 본다.
   ══════════════════════════════════════════════════════════════ */
console.log('[2] 셸이 실제로 단지 × 페이지를 순서대로 도는지 (브라우저)');

const STUB = `<!doctype html><meta charset="utf-8"><body style="background:#111;color:#eee;font:14px sans-serif">
<div id="t"></div><script>
const GOT=[]; window.GOT=GOT; let MUTE=false; window.mute=()=>{MUTE=true;};
addEventListener('message',e=>{ const d=e.data||{};
  if(d.type==='stub-mute'){ MUTE=true; return; }
  if(d.type==='gst-kiosk-q'){ if(MUTE) return; const L={campus:['H1','H2','F16'],op:['GST TAIWAN SCRUBBER','SEC Scrubber'],customer:[]};
    (e.source||parent).postMessage({type:'gst-kiosk-a',axis:d.axis,list:L[d.axis]||[],ver:102,page:location.pathname},'*'); }
  if(d.type==='gst-kiosk-set'||d.type==='gst-kiosk-restore'){ GOT.push(d); document.getElementById('t').textContent=JSON.stringify(GOT); }
});
</script></body>`;

/* iframe 은 BASE(배포 도메인)에서 뜬다 — 셸도 그 도메인으로 띄워야 같은 오리진이 되어
   탭 안을 들여다볼 수 있다. localhost 로 띄우면 탭이 교차 오리진이라 «보냈는지»를 못 본다. */
const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM});
const pg=await br.newPage(); const errs=[];
pg.on('pageerror',e=>errs.push(String(e)));
await pg.route('https://gstcsglobal-cloud.github.io/**', route=>{
  const u=new URL(route.request().url()).pathname;
  const body = u==='/assets/core.js' ? fs.readFileSync(ROOT+'/assets/core.js','utf8')
             : (u==='/'||u==='/index.html') ? fs.readFileSync(ROOT+'/index.html','utf8')
             : STUB;
  route.fulfill({status:200, contentType:u.endsWith('.js')?'text/javascript':'text/html', body});
});
await pg.route('**/*.supabase.co/**', r=>r.abort());
await pg.goto('https://gstcsglobal-cloud.github.io/index.html',{waitUntil:'domcontentloaded'});
await pg.waitForTimeout(1500);
// 로그인 오버레이가 가려도 엔진은 돈다 — 함수를 직접 부른다(버튼 존재는 따로 확인)
ok(await pg.evaluate(()=>!!document.getElementById('kioskBtn')), '툴바에 자동순회 버튼이 있어야 한다');
ok(await pg.evaluate(()=>typeof window.kioskStart==='function'), '순회 엔진이 실려 있어야 한다');

const r2 = await pg.evaluate(async ()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // 첫 탭을 띄우고 목록을 받는다
  switchTab('report'); await sleep(500);
  kioskBtn(); await sleep(600);
  const campsShown=[...document.querySelectorAll('#kkCamps input')].map(x=>x.value);
  const est=(document.getElementById('kkEst')||{}).textContent||'';
  kioskAll('kkCamps'); const allOff=document.querySelectorAll('#kkCamps input:checked').length;
  kioskAll('kkCamps');                                  // 다시 전체 켜고 진행
  // 페이지 둘만 남기고 시작
  document.querySelectorAll('#kkPages input').forEach(x=>{ x.checked=['report','scrubber'].includes(x.value); });
  KIOSK.sec=1;                    // 검사에서는 1초
  kioskStart(); await sleep(150);
  const steps=[];
  for(let i=0;i<6;i++){
    steps.push({camp:document.getElementById('kkCamp').textContent,
                page:document.getElementById('kkPage').textContent,
                pos: document.getElementById('kkPos').textContent,
                tab: activeTab});
    await sleep(1050);
  }
  const barVisible = getComputedStyle(document.getElementById('kioskBar')).display!=='none';
  const frameGap = parseFloat(getComputedStyle(document.getElementById('frameWrap')).marginBottom)||0;
  kioskStop(); await sleep(400);
  const got={}; Object.keys(frames).forEach(k=>{ try{ got[k]=frames[k].contentWindow.GOT||[]; }catch(e){ got[k]='x'; } });
  return {campsShown, est, allOff, frameGap, steps, barVisible, got, onAfter:KIOSK.on,
          barAfter:getComputedStyle(document.getElementById('kioskBar')).display};
});

ok(r2.campsShown.slice().sort().join()==='F16,H1,H2', '단지 목록을 페이지에서 받아 채워야 한다 (실제 '+r2.campsShown.join()+')');
/* 단지가 바깥, 페이지가 안 — 한 단지의 이야기를 끝까지 보여 준 뒤 다음 단지로 */
const seq = r2.steps.map(s=>s.camp+'/'+s.tab).join(' → ');
ok(r2.steps[0].camp===r2.steps[1].camp && r2.steps[2].camp!==r2.steps[1].camp,
   '기준값이 바깥 루프여야 한다 — 한 사이트를 끝까지 보여 준 뒤 넘어간다 (실제: '+seq+')');
ok(r2.steps[0].tab!==r2.steps[1].tab, '같은 단지 안에서 페이지가 바뀌어야 한다 (실제: '+seq+')');
ok(r2.steps[0].pos==='1 / 6', '진행 위치를 화면에 적어야 한다 (실제 '+r2.steps[0].pos+')');
ok(r2.steps.every(s=>s.camp && s.page), '어느 단지의 어느 화면인지 늘 적혀 있어야 한다');
ok(r2.barVisible, '순회 중에는 하단 표시줄이 보여야 한다');
ok(r2.onAfter===false && r2.barAfter==='none', '정지하면 표시줄이 사라져야 한다');
/* 하단바가 화면을 «덮으면» 표 마지막 줄·범례가 가려진다 — 자리를 차지해야 한다. */
ok(r2.frameGap>=40, '순회 중에는 화면이 하단바만큼 줄어야 한다 (실제 여백 '+r2.frameGap+'px)');
ok(r2.est && /단계/.test(r2.est) && /한 바퀴/.test(r2.est),
   '한 바퀴가 얼마나 걸리는지 적어야 한다 — 「15초」만 보면 아무도 모른다 (실제: '+r2.est+')');
ok(r2.allOff===0, '「전체 / 해제」로 한 번에 끌 수 있어야 한다 (실제 '+r2.allOff+'개 남음)');

const sets = Object.values(r2.got).flat().filter(x=>x.type==='gst-kiosk-set');
const sent = sets.map(x=>x.value);
ok(sent.length>=4 && sent.includes('H1') && sent.includes('H2'), '각 단계마다 기준값을 페이지로 보내야 한다 (보낸 값: '+sent.join(',')+')');
ok(sets.every(x=>x.axis==='campus'), '어느 축인지도 같이 보내야 한다 — 페이지가 무엇을 걸지 알아야 한다');
const restored = Object.values(r2.got).flat().filter(x=>x.type==='gst-kiosk-restore').length;
ok(restored>=2, '정지하면 열린 «모든» 탭에 복원을 보내야 한다 (실제 '+restored+'개 탭)');
ok(errs.length===0, 'JS 에러가 없어야 한다: '+errs.slice(0,2).join(' | '));

await br.close();

/* ── [2-2] 답이 없을 때 «가만히 있지» 않는지 · 축을 바꾸면 목록이 따라오는지 ──
   실제로 사용자가 「단지 목록을 읽는 중…」 화면을 하루 종일 봤다. 조용히 기다리는 것이
   가장 나쁜 실패다 — 두 실패는 할 일이 완전히 다르므로 다른 말을 해야 한다. */
console.log('[2-2] 목록을 못 받았을 때 무엇을 하면 되는지 적는지');
const br2=await chromium.launch({executablePath:process.env.PW_CHROMIUM});
const pg2=await br2.newPage(); const errs2=[];
pg2.on('pageerror',e=>errs2.push(String(e)));
await pg2.route('https://gstcsglobal-cloud.github.io/**', route=>{
  const u=new URL(route.request().url()).pathname;
  const body = u==='/assets/core.js' ? fs.readFileSync(ROOT+'/assets/core.js','utf8')
             : (u==='/'||u==='/index.html') ? fs.readFileSync(ROOT+'/index.html','utf8') : STUB;
  route.fulfill({status:200, contentType:u.endsWith('.js')?'text/javascript':'text/html', body});
});
await pg2.route('**/*.supabase.co/**', r=>r.abort());
await pg2.goto('https://gstcsglobal-cloud.github.io/index.html',{waitUntil:'domcontentloaded'});
await pg2.waitForTimeout(1200);

const r3 = await pg2.evaluate(async ()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  switchTab('report'); await sleep(400); kioskBtn(); await sleep(500);
  const W=()=>document.getElementById('kkWarn');
  // ① 아무 탭도 답을 안 한 경우 = 배포된 core.js 가 옛 버전
  KIOSK.replies=0; KIOSK.vals=[]; kioskFillCamps(true);
  const noReply={txt:W().textContent, shown:W().style.display, go:document.getElementById('kkGo').disabled};
  // ② 답은 왔는데 그 축에 값이 없는 경우 = 다른 축을 고르면 된다
  KIOSK.replies=2; KIOSK.vals=[]; kioskFillCamps(true);
  const empty={txt:W().textContent};
  // ③ 축을 바꾸면 목록이 그 축으로 바뀐다
  KIOSK.axis='op'; kioskAsk(); await sleep(700);
  const opList=[...document.querySelectorAll('#kkCamps input')].map(x=>x.value);
  const opLabel=(document.getElementById('kkAxName')||{}).textContent;
  // ④ 값이 없는 축(고객사) — 스텁이 빈 목록으로 답한다
  KIOSK.axis='customer'; kioskAsk(); await sleep(3000);
  const custWarn=W().textContent;
  // ⑤ 전체화면 — 셸 머리가 감춰지는지
  KIOSK.axis='op'; kioskAsk(); await sleep(700);
  document.getElementById('kkFull').checked=true;
  document.querySelectorAll('#kkPages input').forEach(x=>{ x.checked=x.value==='report'; });
  KIOSK.sec=30; kioskStart(); await sleep(300);
  const full={cls:document.body.classList.contains('kiosk-full'),
              top:getComputedStyle(document.querySelector('.topbar')).display,
              tab:getComputedStyle(document.querySelector('.tabbar')).display};
  kioskStop(); await sleep(300);
  const after={cls:document.body.classList.contains('kiosk-full'),
               top:getComputedStyle(document.querySelector('.topbar')).display};
  return {noReply, empty, opList, opLabel, custWarn, full, after};
});

ok(/Ctrl\+Shift\+R/.test(r3.noReply.txt) && /core\.js/.test(r3.noReply.txt),
   '답이 없으면 «강제 새로고침» 을 알려야 한다 — 증상만 알리면 사용자가 코드를 의심한다 (실제: '+r3.noReply.txt.slice(0,60)+'…)');
ok(r3.noReply.shown==='block' && r3.noReply.go===true, '못 읽었으면 시작 버튼이 잠겨 있어야 한다');
ok(/다른 기준/.test(r3.empty.txt) && !/Ctrl/.test(r3.empty.txt),
   '답은 왔는데 값이 없으면 «다른 축을 골라라» 여야 한다 — 새로고침은 소용없다 (실제: '+r3.empty.txt.slice(0,60)+'…)');
ok(r3.opList.length===2 && r3.opList.includes('SEC Scrubber'),
   '축을 운영단위로 바꾸면 목록도 운영단위여야 한다 (실제 '+r3.opList.join(',')+')');
ok(r3.opLabel==='운영단위', '상자 머리글도 축을 따라가야 한다 (실제 '+r3.opLabel+')');
ok(/고객사/.test(r3.custWarn), '값이 없는 축은 그 축 이름으로 말해야 한다 (실제: '+r3.custWarn.slice(0,50)+'…)');
ok(r3.full.cls && r3.full.top==='none' && r3.full.tab==='none',
   '전체화면이면 셸 머리(상단바·탭바)가 감춰져야 한다');
ok(!r3.after.cls && r3.after.top!=='none', '정지하면 머리가 돌아와야 한다 — 안 그러면 되돌릴 방법이 없어진다');
ok(errs2.length===0, '진단 경로에 JS 에러가 없어야 한다: '+errs2.slice(0,2).join(' | '));

/* 활성 탭이 «못 답해도» 다른 탭이 답하면 목록이 채워져야 한다.
   실제 사고가 이것이었다 — 활성 탭 하나에만 물어서, 그 탭이 조용하면 통째로 막혔다. */
const r4 = await pg2.evaluate(async ()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  kioskStop(); await sleep(200);
  switchTab('scrubber'); await sleep(500);          // 두 번째 탭을 띄워 두고
  switchTab('report');   await sleep(300);          // 활성은 report
  frames['report'].contentWindow.postMessage({type:'stub-mute'},'*'); await sleep(200);
  KIOSK.axis='campus'; kioskAsk(); await sleep(1200);
  return {active:activeTab, tabs:Object.keys(frames).length,
          list:[...document.querySelectorAll('#kkCamps input')].map(x=>x.value)};
});
ok(r4.tabs===2 && r4.active==='report', '전제: 탭 둘, 활성은 답을 못 하는 쪽');
ok(r4.list.length===3, '활성 탭이 못 답해도 다른 탭에서 목록을 받아야 한다 (실제 '+r4.list.length+'개)');

await br2.close();

/* ══════════════════════════════════════════════════════════════
   [3] 규율 — 목록을 셸에 박지 않았는지
   ══════════════════════════════════════════════════════════════ */
console.log('[3] 단지 목록이 셸에 박히지 않았는지');
const SHELL=fs.readFileSync(ROOT+'/index.html','utf8');
ok(/gst-kiosk-q/.test(SHELL), '셸이 페이지에 단지 목록을 물어야 한다');
ok(!/\[\s*'H1'\s*,\s*'H2'/.test(SHELL) && !/campus\s*[:=]\s*\['/.test(SHELL),
   '단지 목록을 셸에 박으면 안 된다 — 자료에서 받아야 한다(v89)');
ok(/mousemove/.test(SHELL)===false, '마우스 움직임으로 멈추면 TV 앞을 지나가기만 해도 꺼진다');
ok(/wakeLock/.test(SHELL), '순회 중에는 화면이 잠들지 않아야 한다');
/* 목록을 못 받았을 때 «가만히 있으면» 사용자는 하루 종일 기다린다 — 실제로 그랬다. */
ok(/kioskFillCamps\(true\)/.test(SHELL) && /setTimeout\(\(\)=>kioskFillCamps\(true\)/.test(SHELL),
   '목록 요청에 시간 제한이 있어야 한다 — 없으면 「읽는 중…」에서 영영 멈춘다');

ok(/fullscreenchange/.test(SHELL), 'F11 로 전체화면만 빠져나가도 머리가 돌아와야 한다');
const CORE=fs.readFileSync(ROOT+'/assets/core.js','utf8');
ok(/GST\.filters\.kioskSet\(/.test(CORE), '순회 값은 filters 의 전용 통로를 지나야 한다(보류·기준선·적용여부가 한 곳)');
ok(/if\(!KEY\) return;/.test(CORE), 'mount 전에는 저장하지 않아야 한다 — 빈 이름 키로 새면 저장본이 섞인다');
ok(/cur instanceof Set/.test(CORE), '축마다 그릇이 다르다 — Set/문자열을 «생긴 대로» 저장해야 복원된다');
ok(!/F\.campus\s*=\s*[^=]/.test(CORE.split('const F = {')[1]||''), 'F.campus 에 직접 대입하면 안 된다');

console.log('\n'+(fail? '❌ 실패 '+fail+' / ':'✅ ')+'통과 '+pass+'/'+(pass+fail));
process.exit(fail?1:0);
