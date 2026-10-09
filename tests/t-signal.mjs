/* t-signal — v148 «세는 화면 → 결정하는 화면» 계산 셋을 지킨다 (지어낸 자료만 · t-leak).
   ① deltaBadge: 직전값이 작으면 %가 아니라 건수 차이(1→9 가 «▲800%» 로 화면 최대 경보가 되던 자리)
   ② GST.qa: 입력률·미래 날짜·24h 초과·음수·빠진 달을 센다 · 점수 식이 설명대로 움직인다
   ③ GST.riskRank: 재고장·PM 지연·증가가 점수를 올린다 · 한 번 난 설비는 순위에 없다 · 미래 사건은 안 센다
     실행: node t-signal.mjs */
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass=0, fail=0; const is=(c,m)=>{ c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ❌ '+m)); };
const ctx={console, setTimeout, clearTimeout, URLSearchParams, Intl, Date, Math, JSON};
ctx.window=ctx; ctx.document={readyState:'complete',addEventListener(){},querySelectorAll:()=>[],getElementById:()=>null};
ctx.localStorage={getItem(){return null},setItem(){}}; ctx.sessionStorage=ctx.localStorage;
ctx.location={search:'',pathname:'/',hash:''}; ctx.navigator={}; ctx.addEventListener=()=>{};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(ROOT+'/assets/core.js','utf8'), ctx);
const G=ctx.GST;

console.log('[1] 증감 표기');
is(/▲ \+8/.test(G.deltaBadge(9,1,true)) && !/%/.test(G.deltaBadge(9,1,true)), '1→9 는 «▲ +8» (퍼센트 아님)');
is(/▲ 50%/.test(G.deltaBadge(30,20,true)), '20→30 은 그대로 «▲ 50%»');
is(/var\(--bad/.test(G.deltaBadge(9,1,true)) && /var\(--ok/.test(G.deltaBadge(1,9,true)), '색 규칙(고장은 늘면 나쁨) 유지');
is(G.deltaBadge(5,0,true)==='', '직전 0 이면 배지 없음(예전 그대로)');

console.log('[2] 자료 성적표');
const rows=[]; for(let m=1;m<=6;m++){ const n=m===4?3:20; for(let i=0;i<n;i++) rows.push({src_row:rows.length, op:i%2?'A':'B',
  d_start:'2026-0'+m+'-1'+(i%9), stage:'BM', alarm:i%10===0?'X':'', man_min:String(i===0&&m===2?2000:60), work_min:i===1&&m===3?'-5':'30'}); }
rows.push({src_row:999, op:'A', d_start:'2099-01-01', stage:'', alarm:'', man_min:'60', work_min:'30'});
const q=G.qa(rows,{key:['stage','alarm'], date:'d_start', num:['man_min','work_min'], cap:{man_min:1440}, by:'op'});
const I=k=>q.issues.find(i=>i.kind===k);
is(q.n===rows.length, '행 수');
is(q.fill.find(f=>f.col==='alarm').pct<15, '알람 입력률이 낮게 잡힌다');
is(I('date_future')&&I('date_future').n===1, '미래 날짜 1행');
is(I('over')&&I('over').col==='man_min'&&I('over').n===1, '작업공수 24h 초과 1행');
is(I('neg')&&I('neg').col==='work_min', '작업시간 음수');
is(I('month_low')&&I('month_low').ym==='2026-04', '4월 행이 적다(빠졌나?)');
is(q.by.length===2, '운영단위별 입력률');
const q2=G.qa(rows.slice(0,20).map(r=>Object.assign({},r,{alarm:'X'})),{key:['stage','alarm']});
is(q2.score>q.score && q2.grade==='A', '다 채운 파일은 점수가 높고 A');

console.log('[3] 고장 위험 순위');
const asOf=new Date(Date.UTC(2026,8,30)), D=n=>new Date(asOf.getTime()-n*86400000);
const bm=[ {key:'A',label:'A',d:D(5)},{key:'A',label:'A',d:D(10)},{key:'A',label:'A',d:D(60)},     // 재고장(5↔10) · 최근
           {key:'B',label:'B',d:D(40)},{key:'B',label:'B',d:D(80)},                                // 둘 · PM 최근
           {key:'C',label:'C',d:D(30)},                                                            // 한 번 → 제외
           {key:'D',label:'D',d:D(-3)},{key:'D',label:'D',d:D(100)} ];                            // 미래 사건은 안 센다
const pm=[{key:'B',d:D(20)}];
const R=G.riskRank({bm, pm, asOf, n:20});
is(R[0].key==='A', '재고장·최근·PM 없음 설비가 1순위');
is(R[0].why.includes('rep') && R[0].why.includes('pm') && R[0].why.includes('recent'), '이유가 붙는다');
is(!R.find(r=>r.key==='C'), '한 번 난 설비는 순위에 없다');
is(!R.find(r=>r.key==='D'), '미래 날짜 사건은 세지 않는다(남은 1건 → 제외)');
const b=R.find(r=>r.key==='B'); is(b && !b.why.includes('pm'), 'PM 이 최근이면 PM 지연 아님');
is(/14일 안 재고장 1회/.test(G.riskWhy(R[0])), '이유 문장');

console.log(fail?`\n❌ t-signal: ${pass} 통과 · ${fail} 실패`:`\n✅ t-signal: ${pass} 통과 · 0 실패`);
process.exit(fail?1:0);
