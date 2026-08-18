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
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, matchMedia:()=>({matches:false,addEventListener(){}}) };
global.window.self = global.window.top = global.window;
global.localStorage = global.window.localStorage;
global.location = global.window.location;
try { new Function(fs.readFileSync(ROOT+'/assets/core.js','utf8'))(); } catch(e){ console.log('core.js 로드 경고:', e.message); }
const GST = global.window.GST || global.GST;

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
fire({type:'gst-kiosk-set', campus:'F16'});
ok(GST.filters.chosen('campus').join()==='F16', '순회가 그 단지 하나만 걸어야 한다');
ok(GST.filters.F.campus instanceof Set, 'campus 가 Set 으로 남아야 한다(문자열이 되면 .has 가 TypeError)');
ok(GST.filters.hit('campus','F16')===true && GST.filters.hit('campus','H3')===false, '술어가 제대로 걸려야 한다');

// 여러 번 바뀌어도 «최초의 것»을 기억해야 한다
fire({type:'gst-kiosk-set', campus:'H1'});
fire({type:'gst-kiosk-set', campus:'H2'});
ok(GST.filters.chosen('campus').join()==='H2', '마지막 단지가 걸려 있어야 한다');

// 복원
fire({type:'gst-kiosk-restore'});
ok(GST.filters.chosen('campus').join()==='H3,P1',
   '끝나면 사람이 걸어 둔 두 단지가 그대로 돌아와야 한다 (실제 '+GST.filters.chosen('campus').join()+')');
ok(GST.filters.F.campus instanceof Set, '복원 뒤에도 Set 이어야 한다');

// 아무것도 안 걸어 뒀던 경우
GST.filters.set('campus', []);
fire({type:'gst-kiosk-set', campus:'H1'});
fire({type:'gst-kiosk-restore'});
ok(GST.filters.chosen('campus').length===0, '원래 비어 있었으면 비워서 돌려줘야 한다');

/* ══════════════════════════════════════════════════════════════
   [2] 셸 엔진 — 실제 브라우저로 돌린다
   순서·화면 표시·전송 값·정지까지 소스로는 못 본다.
   ══════════════════════════════════════════════════════════════ */
console.log('[2] 셸이 실제로 단지 × 페이지를 순서대로 도는지 (브라우저)');

const STUB = `<!doctype html><meta charset="utf-8"><body style="background:#111;color:#eee;font:14px sans-serif">
<div id="t"></div><script>
const GOT=[]; window.GOT=GOT;
addEventListener('message',e=>{ const d=e.data||{};
  if(d.type==='gst-kiosk-q'){ (e.source||parent).postMessage({type:'gst-kiosk-a',list:['H1','H2','F16']},'*'); }
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

ok(r2.campsShown.join()==='H1,H2,F16', '단지 목록을 페이지에서 받아 채워야 한다 (실제 '+r2.campsShown.join()+')');
/* 단지가 바깥, 페이지가 안 — 한 단지의 이야기를 끝까지 보여 준 뒤 다음 단지로 */
const seq = r2.steps.map(s=>s.camp+'/'+s.tab).join(' → ');
ok(r2.steps[0].camp==='H1' && r2.steps[1].camp==='H1' && r2.steps[2].camp==='H2',
   '단지가 바깥 루프여야 한다 (실제: '+seq+')');
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

const sent = Object.values(r2.got).flat().filter(x=>x.type==='gst-kiosk-set').map(x=>x.campus);
ok(sent.length>=4 && sent.includes('H1') && sent.includes('H2'), '각 단계마다 단지를 페이지로 보내야 한다 (보낸 값: '+sent.join(',')+')');
const restored = Object.values(r2.got).flat().filter(x=>x.type==='gst-kiosk-restore').length;
ok(restored>=2, '정지하면 열린 «모든» 탭에 복원을 보내야 한다 (실제 '+restored+'개 탭)');
ok(errs.length===0, 'JS 에러가 없어야 한다: '+errs.slice(0,2).join(' | '));

await br.close();

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
const CORE=fs.readFileSync(ROOT+'/assets/core.js','utf8');
ok(/GST\.filters\.set\('campus'/.test(CORE), 'campus 는 filters.set 을 지나야 한다(Set 안전)');
ok(!/F\.campus\s*=\s*[^=]/.test(CORE.split('const F = {')[1]||''), 'F.campus 에 직접 대입하면 안 된다');

console.log('\n'+(fail? '❌ 실패 '+fail+' / ':'✅ ')+'통과 '+pass+'/'+(pass+fail));
process.exit(fail?1:0);
