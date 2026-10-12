/* t-fse — FSE 원장 «알람 분석» (v189 · 고장 분석 탭)

   무엇을 지키나
     [1] 원장 읽기 — 작업 행 아래 부품 행('-')을 같은 S/N·작업일의 작업에 잇는다 · 순서가 섞인 줄도 · 못 이으면 센다(버리지 않는다)
     [2] 알람 고르기 — 코드·분류·메시지(대소문자 흡수) · Alarm/Warning · 책임 · 챔버 · 설비 타입 — 특정 알람을 박지 않는다
     [3] MFC 버전 — S/N 날짜코드(MCA YYMMDD · MKP 6230+YY+월(1~9,A~C)+DD) · In/Out 뒤바뀜 · 교체일 추정(확인 필요) ·
         교체 이력 없음(DRAGON=MKP R0 · GLOBAL AIR=N/A · 반입일−리드타임) · 판정 기준을 바꾸면 결과가 따라간다(코드에 숫자를 박지 않았다)
     [4] 자재실적 S/N 보충 — ±3일 · 한 번만 · 원장 칸이 차 있으면 손대지 않는다
     [5] 집계 — 건수·설비·반복·교체 후 재발 · 달력으로 채운 월 축 · 업로드 날짜 다듬기(엑셀 시리얼)
     [6] 실제 브라우저 — 고장 분석의 «알람 분석» 탭: 열 때 읽기 · KPI = 팝업 목록 · 칩으로 좁히기 · 순위·타임라인·MFC 카드 ·
         엑셀 받기 · 부품 묶음(읽기 전용) · 언어 전환 · JS 에러 0
   ⚠ 실데이터를 쓰지 않는다 — S/N 은 «X» 가 든 지어낸 꼴(GBWS-X001 …), 부품 코드도 지어낸 것이다(t-leak).
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-fse.mjs */
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import http from 'http';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass=0, fail=0; const is=(c,m)=>{ c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ❌ '+m)); };

function core(){
  const ctx={console, setTimeout, clearTimeout, URLSearchParams, Intl, Date, Math, JSON, Map, Set};
  ctx.window=ctx; ctx.document={readyState:'complete',addEventListener(){},querySelectorAll:()=>[],getElementById:()=>null,querySelector:()=>null};
  ctx.localStorage={getItem(){return null},setItem(){}}; ctx.sessionStorage=ctx.localStorage;
  ctx.location={search:'',pathname:'/',hash:''}; ctx.navigator={}; ctx.addEventListener=()=>{};
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(ROOT+'/assets/core.js','utf8'), ctx); return ctx.GST;
}

/* ── 지어낸 원장 — 머리글은 실제 원장의 «이름»(줄바꿈 포함)만 따랐다 ── */
const H=['NO','SITE','LINE','Group_1','Group_2','Detail_1','Detail_2','Type','Turn-on\ndate','Warranty\ndate','Warranty\nIN/OUT','Model','Scrubber Code',
  'Year','Month','Work Date','S/N','Maintenance\nCode','Alarm/Warning','Responsible','Alarm/Warning Message','fail Code','New fail Code','fail Type',
  'Part Replace (Improvement)','Chamber','Symptom','Deep rooted cause','Corrective action item','Part Code\n(replaced parts)',"Part Q'ty\n(replaced parts)",
  'Part Name\n(replaced parts)','Part Specification\n(replaced parts)','Compensation','Remark','Shut down','Shut down\nStarted time','Shut down\nFinished time',
  'MTTR\n(Minute)','PM Worker 1','In Part SN\nMFC_上機','Out part SN\nMFC_下機','Motor scraper\n（ohm）'];
const SER=d=>{ const t=Date.parse(d+'T00:00:00Z'); return String(Math.round(t/86400000+25569)); };   // 엑셀 시리얼(General 서식으로 오는 꼴)
let NO=0;
const row=o=>{ NO++; const r=H.map(()=> '');
  const set=(h,v)=>{ const i=H.indexOf(h); if(i<0) throw new Error('no header '+h); r[i]=v==null?'':String(v); };
  set('NO',NO); set('SITE','CUST-A'); set('LINE',o.fab||'FX1'); set('Group_1','ETCH'); set('Detail_1',o.det||'DET-A'); set('Type','AB'); set('Model','MODEL-A');
  set('Work Date',SER(o.d)); set('S/N',o.sn); set('Maintenance\nCode',o.mc||'BM'); set('Chamber',o.ch||'Left');
  if(o.msg) set('Alarm/Warning Message',o.msg); if(o.code) set('fail Code',o.code); if(o.aw) set('Alarm/Warning',o.aw); if(o.resp) set('Responsible',o.resp);
  if(o.ncode) set('New fail Code',o.ncode);
  if(o.pc) set('Part Code\n(replaced parts)',o.pc); if(o.pn) set('Part Name\n(replaced parts)',o.pn); if(o.ps) set('Part Specification\n(replaced parts)',o.ps);
  if(o.in) set('In Part SN\nMFC_上機',o.in); if(o.out) set('Out part SN\nMFC_下機',o.out);
  if(o.turn) set('Turn-on\ndate',SER(o.turn));
  set('PM Worker 1','WORKER-Z'); set('Motor scraper\n（ohm）','1.3');
  return r; };
const A=(sn,d,ch,code,msg,x)=>row(Object.assign({sn,d,ch,code,msg,mc:'BM',aw:/^warn/i.test(msg)?'Warning':'Alarm',resp:'GST',ncode:code==='BFE'?"Flame Er'":code==='PI3'?"Inlet Pre'":''},x||{}));
const P=(sn,d,ch,pc,pn,x)=>row(Object.assign({sn,d,ch,mc:'-',pc,pn},x||{}));
const BODY=[
  /* U1 GBWS-X001 (OLD) — Left 4 · Right 2 · 경고 2 */
  A('GBWS-X001','2025-03-10','Left','BFE','Alarm-Main flame off'),
  A('GBWS-X001','2026-02-05','Left','BFE','Alarm-Main flame off'),
  A('GBWS-X001','2026-03-01','Left','BFE','Alarm-Main flame off'),
  P('GBWS-X001','2026-03-01','Left','P-NZ-1','BURNER NOZZLE'),
  P('GBWS-X001','2026-03-01','Left','P-MFC-LM','MFC',{in:'250610-11A701_F',out:'220101-01A701_F'}),
  A('GBWS-X001','2026-03-20','Left','BFE','Alarm-Main flame off'),          // 교체 19일 뒤 재발
  A('GBWS-X001','2026-04-02','Right','BFE','Alarm-Main flame off'),
  A('GBWS-X001','2026-06-10','Right','BFE','Alarm-Main flame off',{resp:'External'}),
  A('GBWS-X001','2026-05-05','Left','BFE','Warning-FS#2 not on'),
  A('GBWS-X001','2026-05-06','Right','BFE','Warning-FS#2 not on'),
  row({sn:'GBWS-X001',d:'2026-01-15',ch:'Left',mc:'TBM'}),
  /* U2 GBWS-X002 (OLD) — In/Out 이 뒤바뀐 MKP O2 */
  A('GBWS-X002','2026-01-10','Left','BFE','Alarm-Main flame off'),
  A('GBWS-X002','2026-02-10','Left','BFE','Alarm-Main flame off'),
  A('GBWS-X002','2026-07-10','Left','BFE','Alarm-Main flame off'),
  row({sn:'GBWS-X002',d:'2025-09-01',ch:'Left',mc:'CBM'}),
  P('GBWS-X002','2025-09-01','Left','P-MFC-OK','MFC',{in:'240618-48A701_F',out:'623025C15001'}),
  /* U3 GBWS-X5001 (GLOBAL) — PI3 메시지 대소문자 흔들림 */
  A('GBWS-X5001','2025-05-05','Left','BFE','Alarm-Main flame off'),
  A('GBWS-X5001','2025-06-01','Left','PI3','Alarm-Inlet#3 pressure High'),
  A('GBWS-X5001','2025-06-02','Left','PI3','Alarm-Inlet#3 pressure high'),
  /* U4 DBW-X001 (DRAGON) */
  A('DBW-X001','2026-08-01','Left','LWA','Alarm-Water Leakage(Tank)'),
  /* U5 GBWS-X003 (OLD) — S/N 없는 MCA LNG 교체 둘(자재실적이 하나를 채운다) */
  row({sn:'GBWS-X003',d:'2024-05-01',ch:'Right',mc:'CBM'}),
  P('GBWS-X003','2024-05-01','Right','P-MFC-LM','MFC'),
  row({sn:'GBWS-X003',d:'2025-06-01',ch:'Right',mc:'CBM'}),
  P('GBWS-X003','2025-06-01','Right','P-MFC-LM','MFC'),
  /* 순서가 섞인 부품 줄 — 작업 줄보다 «앞»에 적힌 노즐 커버 */
  P('GBWS-X003','2026-09-01','Right','P-CV-9','NOZZLE COVER'),
  A('GBWS-X003','2026-09-01','Right','BFE','Alarm-Main flame off'),
  /* 작업이 없는 부품 줄(못 잇는다 — 센다) */
  P('GBWS-X003','2026-09-15','Right','P-NZ-1','BURNER NOZZLE'),
  /* U6 SWS-X001 — MFC 판정 제외 */
  A('SWS-X001','2026-04-04','Single','LWA','Alarm-Water Leakage(Tank)'),
  /* S/N 없음 · 날짜 없음 */
  row({sn:'',d:'2026-04-04',code:'BFE',msg:'Alarm-Main flame off'}),
];
BODY[BODY.length-1][H.indexOf('Work Date')]='';    // (위 줄은 S/N 이 없고) 이 줄은 날짜도 없다
BODY.push((()=>{ const r=row({sn:'GBWS-X004',d:'2026-01-01',code:'BFE',msg:'Alarm-Main flame off'}); r[H.indexOf('Work Date')]='—'; return r; })());
const REG=[
  {id:1,grp:'MFC',code:'P-MFC-LM',fluid:'LNG',maker:'MCA',on_:true,ord:1},
  {id:2,grp:'MFC',code:'P-MFC-OK',fluid:'O2',maker:'MKP',on_:true,ord:2},
  {id:3,grp:'버너 노즐',code:'P-NZ-1',on_:true,ord:3},
  {id:4,grp:'노즐 커버',code:null,name_re:'nozzle\\s*cover',on_:true,ord:4},
  {id:5,grp:'꺼진 묶음',code:'P-OFF',on_:false,ord:5}];
const INST={ 'GBWSX001':{op:'OPU-A',region:'해외',customer:'CUST-A',campus:'FX1',fabIn:'2022-06-01'},
             'GBWSX002':{op:'OPU-A',region:'해외',customer:'CUST-A',campus:'FX1',fabIn:'2025-04-01'},
             'GBWSX5001':{op:'OPU-A',region:'해외',customer:'CUST-A',campus:'FX1',fabIn:'2025-04-11'},
             'DBWX001':{op:'OPU-A',region:'해외',customer:'CUST-A',campus:'FX1',fabIn:'2024-01-01'} };

/* 업로드 미러 경로와 같은 변환(SPEC 열 → snake 객체 → normRow) → dbRows 모양(머리글 = 별칭 첫 이름) */
function toDb(G, rows){
  const S=G.SM.SPEC.fse, m=G.SM.map(rows,S), keys=Object.keys(S.fields), C=m.C;
  const data=rows.slice(m.hi+1).filter(r=>r.some(c=>String(c==null?'':c).trim()!==''));
  const out=data.map((r,i)=>{ const o={src_row:i}; keys.forEach(k=>{ const v=String((C[k]>=0?r[C[k]]:'')??''); o[G._snake(k)]=v===''?null:v; }); G.SM.normRow(S,o); return o; });
  return {m, out, back:[keys.map(k=>[].concat(S.fields[k])[0])].concat(out.map(o=>keys.map(k=>o[G._snake(k)]==null?'':o[G._snake(k)])))};
}

const G=core();
const RAW=[H].concat(BODY);
const {m, out, back}=toDb(G, RAW);

console.log('[0] 업로드 변환 — 머리글(줄바꿈)·엑셀 시리얼·SPEC 밖 열');
is(m.ok && m.hi===0, 'SPEC.fse 가 줄바꿈 든 머리글을 이름으로 찾는다');
is(out[0].work_date==='2025-03-10', '작업일 엑셀 시리얼 → YYYY-MM-DD ('+out[0].work_date+')');
is(Object.keys(G.SM.SPEC.fse.fields).every(k=>m.C[k]>=0 || G.SM.SPEC.fse.opt.indexOf(k)>=0), '필수 셋 외에는 전부 opt(글로벌 표준 대비)');
{ const o={sd_start:'45672.86', mttr:'165.9999999963', work_date:'2026-01-01'}; G.SM.normRow(G.SM.SPEC.fse,o);
  is(o.sd_start==='2025-01-15 20:38' && o.mttr==='166', '시각 시리얼·MTTR 찌꺼기 다듬기 ('+o.sd_start+' · '+o.mttr+')'); }
{ const o={d_start:'45000'}; G.SM.normRow(G.SM.SPEC.wk,o); is(o.d_start==='45000', '수선실적은 dates 선언이 없어 한 글자도 안 바뀐다(t-upload 대조 그대로)'); }

console.log('[1] 작업·부품 잇기');
G.FSE.reg.rows=REG; G.FSE.reg._re=null;
const D=G.FSE.parse(back,{org:snk=>INST[snk]||null}); G.FSE.bind(D);
is(D.noSn===1 && D.noDate===1, 'S/N 없는 줄 1 · 날짜 못 읽은 줄 1 을 센다(버리지 않고 센다) ('+D.noSn+' · '+D.noDate+')');
const pX1=D.parts.filter(p=>p.sn==='GBWS-X001');
is(pX1.length===2 && pX1.every(p=>p.ev>=0 && D.ev[p.ev].date==='2026-03-01' && D.ev[p.ev].ch==='Left'), '부품 줄은 바로 앞 작업(같은 S/N·작업일)에 붙는다');
const cv=D.parts.find(p=>p.code==='P-CV-9');
is(cv && cv.ev>=0 && D.ev[cv.ev].code==='BFE', '작업 줄보다 앞에 적힌 부품 줄도 같은 S/N·작업일 작업을 찾아 붙는다');
is(D.orphan===1, '작업을 못 찾은 부품 줄은 버리지 않고 센다 ('+D.orphan+')');
is(D.asOf==='2026-09-15' && D.minDate==='2024-05-01', '원장 기간 = 부품 줄까지 ('+D.minDate+' ~ '+D.asOf+')');
is(D.joinSn===2, '설치현황에 안 붙은 S/N 을 센다 (X003·SWS) — '+D.joinSn);

console.log('[2] 알람 고르기');
const al=D.ev.filter(e=>e.alarm);
const fc=G.FSE.facet(al,'code'), fm=G.FSE.facet(al,'msg');
is(fc[0].k==='BFE' && fc[0].n===13, '코드 축 — BFE 13건 (경고 2 포함) ('+fc[0].n+')');
is(fm.some(x=>x.k==='alarm-inlet#3 pressure high' && x.n===2 && x.label==='Alarm-Inlet#3 pressure High'), '메시지 축 — 대소문자만 다른 두 표기를 한 줄로');
const cnt=sel=>al.filter(e=>G.FSE.match(e,sel,D)).length;
is(cnt({axis:'code',vals:['BFE'],aw:'Alarm'})===11, 'Alarm 만 — 경고 2건이 빠진다');
is(cnt({axis:'msg',vals:['alarm-main flame off']})===11, '메시지로 고르기 = 같은 11건');
is(cnt({axis:'code',vals:['BFE'],resp:'GST'})===12, '책임 GST — External 1건이 빠진다');
is(cnt({axis:'code',vals:['BFE'],ch:'Right'})===4, '챔버 Right (X001 둘 · 경고 하나 · X003 하나)');
is(cnt({axis:'code',vals:[],ut:'GLOBAL'})===3, '설비 타입 GLOBAL (X5001 의 세 건)');
is(cnt({axis:'code',vals:['LWA','PI3']})===4, '여러 값 고르기 = 합집합');
is(G.FSE.utype('GBWS-X1058')==='OLD' && G.FSE.utype('GBWS-X1059')==='GLOBAL' && G.FSE.utype('DBW-X9')==='DRAGON' && G.FSE.utype('GPWS-X1')==='EXCL', '설비 타입 판정(번호 기준은 판정 기준에서)');

console.log('[3] MFC 버전');
const Pm=G.FSE.P(), u=(sn,ch)=>G.snKey(sn)+'|'+ch, V=(sn,ch,f,d)=>G.FSE.ver(D,u(sn,ch),f,d,Pm);
is(V('GBWS-X001','Left','LNG').ver==='F1' && V('GBWS-X001','Left','LNG').how==='sn', 'MCA S/N 250610 → F1 (S/N 날짜코드)');
is(V('GBWS-X001','Left','LNG','2026-02-28').how==='fabin' && V('GBWS-X001','Left','LNG','2026-02-28').ver==='G', '교체 «전» 날짜의 버전 = 출하 원품(반입 2022-06-01 − 50일 → G)');
const o2=V('GBWS-X002','Left','O2');
is(o2.ver==='MKP R1' && o2.swap===true && D.swapped===1, 'In/Out 뒤바뀐 MKP 줄 — 제조사가 맞는 Out(623025C… = 25-12-15)을 읽어 R1');
is(V('GBWS-X002','Left','LNG').ver==='F' && V('GBWS-X002','Left','LNG').how==='fabin', '반입 2025-04-01 − 50일 = 250210 → F (F1 시작 250313 전)');
is(V('GBWS-X5001','Left','AIR').ver==='N/A' && V('GBWS-X5001','Left','O2').ver==='F', 'GLOBAL — AIR 없음 · 반입 2025-04-11 − 50일 → F');
is(V('DBW-X001','Left','LNG').ver==='MKP R0' && V('DBW-X001','Left','AIR').ver==='N/A', 'DRAGON 교체 이력 없음 = MKP R0 · AIR MFC 없음(N/A)');
is(V('SWS-X001','Single','LNG').how==='etc', 'SWS·GPWS 는 판정하지 않는다');
const x3=V('GBWS-X003','Right','LNG');
is(x3.ver==='F/F1' && x3.q && x3.how==='date', 'S/N 없는 교체(2025-06-01) → «F/F1» 확인 필요');
is(V('GBWS-X003','Right','LNG','2024-12-31').ver==='F' && !V('GBWS-X003','Right','LNG','2024-12-31').q, '기준일 전 교체(2024-05-01) → F 로 확정');
is(G.FSE.mfcSn('623026703001').ymd===260703 && G.FSE.mfcSn('623025901001').ymd===250901 && G.FSE.mfcSn('62302510A001')===null, 'MKP 날짜코드 — 월 1~9·A~C');
/* 판정 기준을 바꾸면 따라간다 — 숫자를 코드에 박지 않았다 */
G.params.rows={mfc_mca_f1:{value:250701}};
is(G.FSE.ver(D,u('GBWS-X001','Left'),'LNG',null,G.FSE.P()).ver==='F', 'F1 시작을 250701 로 바꾸면 250610 은 F');
G.params.rows={};

console.log('[4] 자재실적 S/N 보충');
G.FSE.enrich(D,[{snk:'GBWSX003',date:'2025-06-03',code:'P-MFC-LM',ch:'',snIn:'250520-77A701_F',snOut:''},
                {snk:'GBWSX003',date:'2025-06-20',code:'P-MFC-LM',ch:'',snIn:'250601-01A701_F',snOut:''},
                {snk:'GBWSX001',date:'2026-03-01',code:'P-MFC-LM',ch:'Left',snIn:'200101-00A701_F',snOut:''}]);
is(D.enriched===1 && V('GBWS-X003','Right','LNG').ver==='F1' && V('GBWS-X003','Right','LNG').src==='mat', '±3일 안의 자재 줄 하나로 채운다 → F1 (S/N)');
is(V('GBWS-X001','Left','LNG').ver==='F1', '원장 칸이 이미 차 있으면 자재 줄로 덮지 않는다');
G.FSE.bind(D); G.FSE.enrich(D,[]); is(D.enriched===1, '묶음을 다시 입혀도 채운 수를 잃지 않는다');

console.log('[5] 집계');
const evs=al.filter(e=>G.FSE.match(e,{axis:'code',vals:['BFE'],aw:'Alarm'},D));
const st=G.FSE.stats(D, evs, D.units, {asOf:D.asOf, recur:30, top:2});
is(st.n===11 && st.sns===4 && st.chambers===5, '건수 11 · S/N 4 · 챔버 5 ('+st.n+'·'+st.sns+'·'+st.chambers+')');
is(st.rep===3, '2회 이상 챔버 3 (X001 L·R · X002 L)');
is(st.rec.n===2 && st.rec.hit===1, '관심 부품을 바꾼 알람 작업 2회(X001 노즐·MFC · X003 커버) · 30일 안에 재발 1');
const S1=G.FSE.series(evs,'m','2025-01-01','2025-06-30');
is(S1.keys.length===6 && S1.keys[3]==='2025-04' && S1.ch[0].data[3]===0, '월 축은 달력으로 채운다(자료 없는 4월도 0 으로 선다)');
const R=G.FSE.rate(D, evs, D.units, 'd1', 1);
is(R.length===1 && R[0].a===5, '세부공정별 발생 설비 비율 — 분모는 관리 챔버');
const hi=G.FSE.history(D,u('GBWS-X001','Left'),{axis:'code',vals:['BFE'],aw:'Alarm'});
const h20=hi.find(x=>x.kind==='alarm'&&x.date==='2026-03-20');
is(h20 && h20.gap===19 && /LNG F1/.test(h20.ver||''), '이력 — 직전 교체 후 19일 · 당시 MFC LNG F1');
is(hi.some(x=>x.kind==='tbm') && hi.filter(x=>x.kind==='part').length===2, '이력에 TBM·관심 부품 교체가 든다(꺼진 묶음은 없다)');

/* ── [6] 실제 브라우저 ───────────────────────────────────────────────────── */
console.log('[6] 고장 분석 › 알람 분석 (실제 브라우저)');
const q=v=>{ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
const csv=rows=>rows.map(r=>r.map(q).join(',')).join('\n')+'\n';
const IH=['NO','Country','Customer','Location','FAB','Line','Bay','Scrubber CODE','Scrubber S/N','Scrubber Model','Burner Type','Scrubber type','Process',
  'Detail Process(HQ)','Detail Process(Customer)','Main Tool ID','Main Tool Maker','Main Tool Model','Receipt date','Setup date','Turn-on date','Warranty date','Warranty In/Out','설비상태'];
const instCsv=csv([IH].concat([['GBWS-X001','2022-06-01'],['GBWS-X002','2025-04-01'],['GBWS-X5001','2025-04-11'],['DBW-X001','2024-01-01']].map((x,i)=>[i+1,'OPU-A','CUST-A','CITY-A','FX1','A1 1F','B1','CD'+i,x[0],'MODEL-A','AB','DUAL','ETCH','DRY','DET-A','MT'+i,'TOOLM','TOOLA',x[1],x[1],x[1],'2030-01-01','IN','Operation'])));
const WHF=['제품군','운영단위','고객사','단지','라인','BAY','공정','세부공정','MODEL(자사)','실적코드','상태','의뢰유형','작업단계','챔버','WRS NO','메인설비호기','제품코드','설비호기',
  '채널위치','S/N(IN)','S/N(OUT)','유/무상','알람유형','현상','원인','조치','세부조치내용','작업시작일','작업종료일','작업시작시간','작업종료시간','실적등록일','출하일자',
  '총 이동시간(분)','작업시간(분)','작업공수','작업자','작업자수'];
const wkCsv=csv([WHF].concat([0,1,2].map(i=>['SCRUBBER','OPU-A','CUST-A','FX1','FX1','B1','ETCH','DRY','MODEL-A','R'+i,'완료','정기','BM','A','W'+i,'M'+i,'P1','CD'+i,'L','GBWS-X00'+(i+1),'','무상','','','','','','2026-08-0'+(i+1),'2026-08-0'+(i+1),'09:00','10:00','2026-08-0'+(i+1),'','10','60','60','STAFF','1'])));
const MHF=['운영단위','고객사','수선실적번호','단지','라인','BAY','공정','세부공정','메인설비호기','설비호기','챔버','S/N','W/O번호','모델명','자재코드','설비위치','자재위치',
  '사용수량','자재명','규격','교체사유','전유상교체일','전교체일','자재실적일자','사용일(유상기준)','사용일(전교체일기준)','유/무상','무상사유','단가','재고체크여부','자재창고','IN SN','OUT SN'];
const matCsv=csv([MHF,['OPU-A','CUST-A','R9','FX1','FX1','B1','ETCH','DRY','M9','CD9','','GBWS-X003','W9','MODEL-A','P-MFC-LM','POS','MP','1','MFC','SPEC','마모','','','2025-06-03','10','10','무상','','0','Y','ST','250520-77A701_F','']]);
const MIME={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'};
const srv=http.createServer((rq,rs)=>{ let u=decodeURIComponent(rq.url.split('?')[0]); if(u.endsWith('/')) u+='index.html'; const f=path.join(ROOT,u);
  if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){ rs.statusCode=404; rs.end('nf'); return; }
  rs.setHeader('content-type',MIME[path.extname(f)]||'application/octet-stream'); rs.end(fs.readFileSync(f)); });
await new Promise(r=>srv.listen(0,r)); const BASE='http://127.0.0.1:'+srv.address().port;
const PW=process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{};
const NM=ROOT+'/tests/node_modules/';
const STUB='\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
  +'GST.getSession=async function(){return {user:{email:"t@t"}};};GST.token=async function(){return "t";};'
  +'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();if(GST._authOk)GST._authOk();return true;};'
  +'GST.__FSE='+JSON.stringify(back)+';GST.__REG='+JSON.stringify(REG)+';window.__fseReads=0;'
  +'GST.dbRows=async function(t){ if(t==="fse"){ window.__fseReads++; return JSON.parse(JSON.stringify(GST.__FSE)); } throw new Error("DB_OFF"); };'
  +'GST.FSE.reg.load=async function(){ this.rows=JSON.parse(JSON.stringify(GST.__REG)); this._re=null; this.why=""; return this.rows; };';
const SHEETS={'891608329':instCsv,'646668307':wkCsv,'31302669':matCsv};
const browser=await chromium.launch(PW);
const bctx=await browser.newContext({viewport:{width:1700,height:1200}, locale:'ko-KR', acceptDownloads:true});
await bctx.route('**gstcsglobal-cloud.github.io/**', r=>{ let u=new URL(r.request().url()).pathname; if(u.endsWith('/')) u+='index.html'; const f=path.join(ROOT,u);
  if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){ r.fulfill({status:404,body:'nf'}); return; }
  r.fulfill({status:200, contentType:MIME[path.extname(f)]||'application/octet-stream', body:fs.readFileSync(f), headers:{'access-control-allow-origin':'*'}}); });
await bctx.route('**/assets/core.js*', r=>r.fulfill({status:200, contentType:'application/javascript', body:fs.readFileSync(ROOT+'/assets/core.js','utf8')+STUB}));
await bctx.route('**/cdn.jsdelivr.net/**', r=>{ const u=r.request().url();
  if(u.includes('chart.umd')) return r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(NM+'chart.js/dist/chart.umd.js','utf8')});
  if(u.includes('papaparse')) return r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(NM+'papaparse/papaparse.min.js','utf8')});
  if(u.endsWith('.css')) return r.fulfill({status:200,contentType:'text/css',body:''});
  return r.fulfill({status:200,contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};'}); });
await bctx.route('**/spreadsheets/**', r=>{ const gid=(r.request().url().match(/gid=(\d+)/)||[])[1]; r.fulfill({status:200,contentType:'text/csv',body:SHEETS[gid]||''}); });
await bctx.route('**supabase**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
const page=await bctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(BASE+'/fault/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.querySelector('#gstSecNav .gst-sec-tab[data-id="alarm"]'),null,{timeout:20000});
await page.waitForTimeout(2500);
is(await page.evaluate(()=>window.__fseReads)===0, '원장은 탭을 열기 전에는 읽지 않는다');
await page.click('#gstSecNav .gst-sec-tab[data-id="alarm"]');
await page.waitForFunction(()=>document.getElementById('fseBody')&&document.getElementById('fseBody').style.display!=='none',null,{timeout:20000});
await page.waitForTimeout(600);
is(await page.evaluate(()=>window.__fseReads)===1, '탭을 열면 한 번 읽는다');
is(await page.evaluate(()=>document.body.getAttribute('data-sec-on')==='alarm' && !document.body.matches('[data-sec]') && document.querySelector('[data-sec="alarm"]').id==='fseSec'),
  '탭 표식은 body[data-sec-on] — body 가 [data-sec] 로 잡히지 않는다(섹션 찾기가 body 를 집던 결함)');
is(await page.evaluate(()=>getComputedStyle(document.querySelector('.kpis:not(.fse-kpis)')).display==='none'), '알람 분석 탭에서는 수선실적 KPI 줄을 감춘다');
const k1=async()=>page.evaluate(()=>Number((document.getElementById('fk1')||{}).textContent.replace(/,/g,'')));
is(await k1()===17, '«모든 알람» — 발생 건수 17 (원장 알람 줄 전부 · S/N·날짜 없는 줄 제외) ('+await k1()+')');
const chips=await page.$$eval('#fseBar .fse-chip',b=>b.map(x=>x.textContent.trim()));
is(chips[0].startsWith('BFE') && /13$/.test(chips[0]), '첫 칩 = 가장 많은 코드 BFE 13');
await page.click('#fseBar .fse-chip[data-fv="BFE"]'); await page.waitForTimeout(400);
is(await k1()===13, 'BFE 칩 → 13');
await page.click('#fseBar [data-faw="Alarm"]'); await page.waitForTimeout(400);
is(await k1()===11, 'Alarm 만 → 11');
/* KPI 카드 = 팝업 목록 */
await page.click('#fk1'); await page.waitForTimeout(400);
const mrows=await page.$$eval('.gov .gpv-t tbody tr',r=>r.length);
is(mrows===11, 'KPI 카드를 누르면 그 11건이 목록으로 ('+mrows+')');
await page.evaluate(()=>GST._ovClose());
/* 순위 · 타임라인 · 이력 */
const top=await page.$$eval('#fseTopCard tbody tr',r=>r.map(x=>[...x.children].map(c=>c.textContent.trim())));
is(top.length===4 && top[0][1]==='GBWS-X001', '순위 첫 줄 = GBWS-X001 (S/N 단위 · 4대)');
is(/Left 4 · Right 2/.test(top[0][2]), '챔버별 건수를 한 줄에 (Left 4 · Right 2)');
is(top[0].some(c=>/F1/.test(c)), '순위표에 MFC 버전이 뜬다');
const circ=await page.$$eval('#fseTlCard svg circle',c=>c.length);
is(circ>=3, '타임라인에 달별 알람 원 ('+circ+')');
const hist=await page.$$eval('#fseHistCard tbody tr',r=>r.length);
is(hist>=7, '이력 표 — 알람·교체·TBM ('+hist+')');
await page.click('#fseTopCard tr[data-fsel="GBWSX002"]'); await page.waitForTimeout(400);
is(/GBWS-X002/.test(await page.textContent('#fseTlCard h3')), '순위표 줄을 누르면 그 설비의 타임라인');
/* MFC 카드 */
const mfc=await page.textContent('#fseMfc');
is(/S\/N 날짜코드/.test(mfc) && /MFC 조사 대상/.test(mfc), 'MFC 판정 근거 · 조사 대상 카드');
is(/뒤바뀐 줄 1건/.test(mfc) && /자재실적의 IN SN 으로 채웠습니다/.test(mfc), '뒤바뀜 보정·자재실적 보충을 숨기지 않고 적는다');
/* 엑셀 */
const [dl]=await Promise.all([page.waitForEvent('download',{timeout:20000}).catch(()=>null), page.click('#fseTopCard [data-fx="top"]')]);
is(dl && /^alarm_rank_2026-09-15\.xlsx$/.test(dl.suggestedFilename()), '순위표 엑셀 받기 ('+(dl&&dl.suggestedFilename())+')');
/* 부품 묶음 — 쓰기 권한이 없으면 읽기 전용이라고 말한다 */
await page.click('#fseBar [data-fparts]'); await page.waitForTimeout(300);
const pt=await page.textContent('.gov');
is(/읽기 전용/.test(pt) && !(await page.$('.gov [data-pa="save"]')), '부품 묶음 — 권한 없으면 읽기 전용 · 저장 단추 없음');
await page.evaluate(()=>GST._ovClose());
/* 언어 */
await page.evaluate(()=>window.setLang&&window.setLang('en')); await page.waitForTimeout(600);
/* 카드 내보내기 단추(core capBtns)는 이 탭의 문구가 아니다 — 빼고 본다 */
const sec=await page.evaluate(()=>{ const c=document.querySelector('[data-sec="alarm"]').cloneNode(true); c.querySelectorAll('.capbtns').forEach(x=>x.remove()); return c.textContent; });
const ko=(sec.replace(/버너 노즐|노즐 커버|꺼진 묶음/g,'').match(/[가-힣]/g)||[]).length; if(ko) console.log('     한글:', (sec.replace(/버너 노즐|노즐 커버|꺼진 묶음/g,'').match(/.{0,12}[가-힣]+.{0,12}/g)||[]).slice(0,6));
is(ko===0, '영어로 바꾸면 탭 안에 한글이 없다(부품 묶음 이름=자료 값 제외) — 남은 한글 '+ko+'자');
is(errs.length===0, 'JS 에러 0 '+(errs.length?errs.slice(0,3).join(' | '):''));
await browser.close(); srv.close();

console.log('\n'+(fail?'❌':'✅')+' t-fse '+pass+'/'+(pass+fail));
process.exit(fail?1:0);
