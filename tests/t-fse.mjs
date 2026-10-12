/* t-fse — FSE 원장 «알람 분석» (v189 · 고장 분석 탭)

   무엇을 지키나
     [1] 원장 읽기 — 작업 행 아래 부품 행('-')을 같은 S/N·작업일의 작업에 잇는다 · 순서가 섞인 줄도 · 못 이으면 센다(버리지 않는다)
     [2] 알람 고르기 — 코드·분류·메시지(대소문자 흡수) · Alarm/Warning · 책임 · 챔버 · 설비 타입 — 특정 알람을 박지 않는다
     [3] MFC 버전 — S/N 날짜코드(MRC YYMMDD · MKP 6230+YY+월(1~9,A~C)+DD) · In/Out 뒤바뀜 · 교체일 추정(확인 필요) ·
         교체 이력 없음(DRAGON=MKP R0 · GLOBAL AIR=N/A · 반입일−리드타임) · 판정 기준을 바꾸면 결과가 따라간다(코드에 숫자를 박지 않았다)
     [4] 자재실적 S/N 보충 — ±3일 · 한 번만 · 원장 칸이 차 있으면 손대지 않는다
     [5] 집계 — 건수·설비·반복·교체 후 재발 · 달력으로 채운 월 축 · 업로드 날짜 다듬기(엑셀 시리얼)
     [6] 실제 브라우저 — 고장 분석의 «알람 분석» 탭: 열 때 읽기 · KPI = 팝업 목록 · 칩으로 좁히기 · 순위·타임라인·MFC 카드 ·
         엑셀 받기 · 부품 묶음(읽기 전용) · 언어 전환 · JS 에러 0
     [8] 백데이터 엑셀(v192 · 본사 요청 1-5) — 알람 발생 설비의 교체 줄 그대로 · 뺄 자재 고르기 · 설치현황 S/N 맵핑 · 설비 일대기 탭 삭제 · S/N 메뉴
     [6b] MFC 버전 띠(v193) — 알람 «당시» 버전은 그날 아침(같은 날 교체는 뒤) · 구간은 ver() 그대로 · 챔버마다 유체 띠 · 교체선 · 전후 요약
     [7] 보는 부품(v191) — MFC 판정은 이름에 «MFC» 낱말(LNG MFC …) · 함께 교체한 부품 = 평소 대비 배수(O-RING 은 1배 근처라 안 뽑힌다) ·
         자동 추천 · 교체 후 재발·이력이 보는 부품을 따른다 · 설비 속성을 설비마다 한 줄로 받아도(fse_units) 결과가 같다 ·
         dbRows 가 이 탭이 쓰는 열만 고른다 · 화면: 알람마다 따로 기억 · MFC 카드는 보는 부품에 MFC 가 있을 때만 · 저장 피드백 ·
         묶음 이름을 바꾸면 기억해 둔 보는 부품도 따라간다 · 좌우 스크롤 없음(1280·1700)
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
  /* U5 GBWS-X003 (OLD) — S/N 없는 MRC LNG 교체 둘(자재실적이 하나를 채운다) */
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
  {id:1,grp:'MFC',code:'P-MFC-LM',fluid:'LNG',maker:'mca',on_:true,ord:1},   // 옛 표기(소문자까지) — MRC 로 읽어야 한다(v193)
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
is(V('GBWS-X001','Left','LNG').ver==='MRC F1' && V('GBWS-X001','Left','LNG').how==='sn' && V('GBWS-X001','Left','LNG').maker==='MRC', 'MRC S/N 250610 → MRC F1 (S/N 날짜코드 · 제조사 MRC)');
is(G.FSE.maker('MCA')==='MRC' && G.FSE.maker(' mca ')==='MRC' && G.FSE.maker('MKP')==='MKP' && G.FSE.maker('horiba')==='HORIBA' && G.FSE.maker(null)==='', '제조사 이름 — 옛 «MCA» 는 MRC 로 읽는다 (MKP · MRC · HORIBA)');
is(D.parts.filter(p=>p.code==='P-MFC-LM').every(p=>p.maker==='MRC'), '부품 묶음의 옛 표기 «mca» → 교체 줄 제조사 MRC');
is(V('GBWS-X001','Left','LNG','2026-02-28').how==='fabin' && V('GBWS-X001','Left','LNG','2026-02-28').ver==='MRC G', '교체 «전» 날짜의 버전 = 출하 원품(반입 2022-06-01 − 50일 → MRC G)');
const o2=V('GBWS-X002','Left','O2');
is(o2.ver==='MKP R1' && o2.swap===true && D.swapped===1, 'In/Out 뒤바뀐 MKP 줄 — 제조사가 맞는 Out(623025C… = 25-12-15)을 읽어 R1');
is(V('GBWS-X002','Left','LNG').ver==='MRC F' && V('GBWS-X002','Left','LNG').how==='fabin', '반입 2025-04-01 − 50일 = 250210 → MRC F (F1 시작 250313 전)');
is(V('GBWS-X5001','Left','AIR').ver==='N/A' && V('GBWS-X5001','Left','O2').ver==='MRC F', 'GLOBAL — AIR 없음 · 반입 2025-04-11 − 50일 → MRC F');
is(V('DBW-X001','Left','LNG').ver==='MKP R0' && V('DBW-X001','Left','AIR').ver==='N/A', 'DRAGON 교체 이력 없음 = MKP R0 · AIR MFC 없음(N/A)');
is(V('SWS-X001','Single','LNG').how==='etc', 'SWS·GPWS 는 판정하지 않는다');
const x3=V('GBWS-X003','Right','LNG');
/* v193 — «확인 필요»는 없다(사용자: 버전표가 전부 추정해 뒀다). 새 버전(F1 250313) 뒤 S/N 없는 교체는 (교체일 − 교체 리드타임 90일)의 버전 */
is(x3.ver==='MRC F' && !x3.q && x3.how==='datel' && x3.maker==='MRC' && x3.lead===90, 'S/N 없는 교체(2025-06-01) − 90일 = 2025-03-03 → «MRC F» 추정 (확인 필요 아님 · '+x3.ver+'/'+x3.how+')');
G.params.rows={mfc_lead_rep:{value:30}};
{ const x30=G.FSE.ver(D,u('GBWS-X003','Right'),'LNG',null,G.FSE.P());
  is(x30.ver==='MRC F1' && x30.how==='datel' && x30.lead===30, '교체 리드타임을 30일로 바꾸면 2025-05-02 → MRC F1 (판정 기준을 따라간다)'); }
G.params.rows={};
{ const P0=G.FSE.P(), J=p=>G.FSE.judge(Object.assign({mfcIn:'',mfcOut:'',src:''},p),P0);
  is(J({maker:'MKP',date:'2026-09-01'}).ver==='MKP R1' && J({maker:'MKP',date:'2026-09-01'}).how==='datel' && J({maker:'MKP',date:'2026-12-01'}).ver==='MKP R2',
     'MKP — R2(260703) 뒤 S/N 없는 교체도 −90일로 추정 (09-01 → R1 · 12-01 → R2)');
  is(J({maker:'MRC',date:'2025-03-01'}).ver==='MRC F' && J({maker:'MRC',date:'2025-03-01'}).how==='date', '새 버전 «전» 교체는 지금처럼 확정 (2025-03-01 → MRC F)');
  is(J({maker:'HORIBA',date:'2026-05-26'}).ver==='HORIBA' && !J({maker:'HORIBA',date:'2026-05-26'}).q, '버전 규칙 없는 제조사(HORIBA)는 제조사 이름이 버전 — 확인 필요 아님');
  is(J({maker:'',date:'2026-05-26'}).how==='mk' && J({maker:'',date:'2026-05-26'}).q, '제조사를 모르면 그때만 판정 불가(how mk)'); }
is(V('GBWS-X003','Right','LNG','2024-12-31').ver==='MRC F' && !V('GBWS-X003','Right','LNG','2024-12-31').q, '기준일 전 교체(2024-05-01) → MRC F 로 확정');
is(G.FSE.mfcSn('623026703001').ymd===260703 && G.FSE.mfcSn('623025901001').ymd===250901 && G.FSE.mfcSn('62302510A001')===null, 'MKP 날짜코드 — 월 1~9·A~C');
/* 판정 기준을 바꾸면 따라간다 — 숫자를 코드에 박지 않았다 */
G.params.rows={mfc_mca_f1:{value:250701}};
is(G.FSE.ver(D,u('GBWS-X001','Left'),'LNG',null,G.FSE.P()).ver==='MRC F', 'F1 시작을 250701 로 바꾸면 250610 은 MRC F');
G.params.rows={};

console.log('[4] 자재실적 S/N 보충');
G.FSE.enrich(D,[{snk:'GBWSX003',date:'2025-06-03',code:'P-MFC-LM',ch:'',snIn:'250520-77A701_F',snOut:''},
                {snk:'GBWSX003',date:'2025-06-20',code:'P-MFC-LM',ch:'',snIn:'250601-01A701_F',snOut:''},
                {snk:'GBWSX001',date:'2026-03-01',code:'P-MFC-LM',ch:'Left',snIn:'200101-00A701_F',snOut:''}]);
is(D.enriched===1 && V('GBWS-X003','Right','LNG').ver==='MRC F1' && V('GBWS-X003','Right','LNG').src==='mat', '±3일 안의 자재 줄 하나로 채운다 → F1 (S/N)');
is(V('GBWS-X001','Left','LNG').ver==='MRC F1', '원장 칸이 이미 차 있으면 자재 줄로 덮지 않는다');
G.FSE.bind(D); G.FSE.enrich(D,[]); is(D.enriched===1, '묶음을 다시 입혀도 채운 수를 잃지 않는다');
/* 자재실적이 뒤에서 마저 오면 처음부터 다시 채운다(v193 · 첫 그림은 최근 12개월) — 앞서 채운 칸을 걷고 다시 · 같은 자재 줄을 두 번 쓰지 않는다 */
G.FSE.reenrich(D,[]);
is(D.enriched===0 && V('GBWS-X003','Right','LNG').how==='datel' && V('GBWS-X001','Left','LNG').ver==='MRC F1', 'reenrich — 자재 줄이 없으면 채운 칸을 걷는다(원장 칸은 그대로)');
G.FSE.reenrich(D,[{snk:'GBWSX003',date:'2025-06-03',code:'P-MFC-LM',ch:'',snIn:'250520-77A701_F',snOut:'190101-01A701_S'}]);
is(D.enriched===1 && V('GBWS-X003','Right','LNG').ver==='MRC F1' && V('GBWS-X003','Right','LNG').src==='mat', 'reenrich — 더 온 자재 줄로 다시 채운다');
G.FSE.reenrich(D,[{snk:'GBWSX003',date:'2025-06-03',code:'P-MFC-LM',ch:'',snIn:'250520-77A701_F',snOut:'190101-01A701_S'}]);
is(D.enriched===1 && D.parts.filter(p=>p.src==='mat').length===1, 'reenrich 를 두 번 불러도 같은 결과 (한 자재 줄은 한 교체에만)');

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
is(h20 && h20.gap===19 && /LNG MRC F1/.test(h20.ver||''), '이력 — 직전 교체 후 19일 · 당시 MFC LNG MRC F1');
is(hi.some(x=>x.kind==='tbm') && hi.filter(x=>x.kind==='part').length===2, '이력에 TBM·관심 부품 교체가 든다(꺼진 묶음은 없다)');
/* 알람 «당시» 버전 = 그날 아침 (v193) — 그 알람 작업이 MFC 를 바꿨으면(같은 작업일) 알람은 «옛» 버전에서 난 것이다 */
const uX1=u('GBWS-X001','Left');
is(G.FSE.ver(D,uX1,'LNG','2026-03-01',Pm).ver==='MRC F1' && G.FSE.verAt(D,uX1,'LNG','2026-03-01',Pm).ver==='MRC G' && G.FSE.verAt(D,uX1,'LNG','2026-03-20',Pm).ver==='MRC F1',
  '당시 버전 — MFC 를 바꾸게 만든 03-01 알람은 G(바꾸기 전) · 19일 뒤 03-20 알람은 F1');
const h01=hi.find(x=>x.kind==='alarm'&&x.date==='2026-03-01');
is(h01 && /LNG MRC G/.test(h01.ver||'') && !/LNG MRC F1/.test(h01.ver||''), '이력 «당시 MFC» 도 같은 판정 — 03-01 알람은 LNG MRC G ('+(h01&&h01.ver)+')');
const sgX1=G.FSE.verSegs(D,uX1,'LNG',Pm);
is(sgX1.length===2 && sgX1[0].from==='' && sgX1[0].to==='2026-03-01' && sgX1[0].v.ver==='MRC G' && sgX1[0].v.how==='fabin'
   && sgX1[1].from==='2026-03-01' && sgX1[1].to==='' && sgX1[1].v.ver==='MRC F1' && sgX1[1].v.how==='sn',
  '버전 구간 — 출하 원품 G(반입일 환산) → 03-01 부터 F1(S/N) · 구간의 버전은 ver() 그대로');
is(G.FSE.verSegs(D,u('GBWS-X002','Left'),'LNG',Pm).length===1 && G.FSE.verSegs(D,u('GBWS-X5001','Left'),'AIR',Pm)[0].v.ver==='N/A', '교체가 없으면 구간 하나(출하 원품) · GLOBAL AIR 는 N/A');

/* ── [5b] 자재마스터(v190) — 지어낸 품목번호(P-…)뿐 · 실제 품목 코드는 저장소에 두지 않는다 ── */
console.log('[5b] 자재마스터 — 필요한 번호만 묻기 · 표준 품목명 · 원장 글자가 먼저');
const MASTER=[{code:'P-NZ-1',itype:'소모품',name:'BURNER NOZZLE ASSY',spec1:'SUS',spec2:null,unit:'EA'},
  {code:'P-CV-7',itype:'소모품',name:'NOZZLE COVER SUS',spec1:'D50',spec2:null,unit:'EA'},
  {code:'P-MFC-LM',itype:'원자재',name:'MFC',spec1:'CH4 100SLM',spec2:null,unit:'EA'}];
const fakeDb=(tbl,opt)=>{ opt=opt||{}; const calls=[];
  const C={ calls, from(t){ const q={t, f:null, head:false, cnt:false,
      select(c,o){ if(o&&o.count) q.cnt=true; if(o&&o.head) q.head=true; return q; },
      in(col,arr){ q.f=arr.slice(); return q; }, or(){ return q; }, order(){ return q; }, limit(){ return q; },
      then(res,rej){ calls.push({t:q.t, n:q.f?q.f.length:null, head:q.head});
        if(opt.err) return Promise.resolve({data:null, error:{message:opt.err}}).then(res,rej);
        if(q.head) return Promise.resolve({data:null, error:null, count:tbl.length}).then(res,rej);
        const d=q.f?tbl.filter(x=>q.f.indexOf(x.code)>=0):tbl.slice(0,50);
        return Promise.resolve({data:JSON.parse(JSON.stringify(d)), error:null}).then(res,rej); } }; return q; } };
  return C; };
const I=G.items;
is(I.key('12345.0')==='12345' && I.key(' P-1 ')==='P-1' && I.key('p-1')==='p-1', '열쇠 — 앞뒤 공백·엑셀 «.0» 만 걷는다(대소문자는 그대로 · 정확일치)');
{ const sa=I.sane([{code:'A'},{code:'B'},{code:''},{code:'C'}]), sb=I.sane(Array.from({length:40},(_,i)=>({code:'X'+(i%5)})));
  is(!sa.bad && sa.n===3 && sa.blank===1 && sb.bad && sb.dup===35, '«실적 파일이 아닌가» — 같은 번호가 여러 줄이면 마스터가 아니다(빈 번호는 따로 센다)'); }
I.clear(); { const C=fakeDb(MASTER);
  await I.get(['P-NZ-1','P-NZ-1','P-ZZ-9'], C);
  is(C.calls.length===1 && C.calls[0].n===2, '필요한 번호만 묻는다 — 겹친 번호는 한 번 ('+JSON.stringify(C.calls)+')');
  await I.get(['P-NZ-1','P-ZZ-9'], C);
  is(C.calls.length===1, '한 번 물은 번호는 다시 묻지 않는다 — 없던 번호도 기억한다');
  I.clear(); const many=Array.from({length:450},(_,i)=>'P-Q-'+i); await I.get(many, C);
  is(C.calls.length===4 && C.calls.slice(1).map(c=>c.n).join(',')==='200,200,50', '450개는 200개씩 세 번 ('+C.calls.slice(1).map(c=>c.n).join(',')+')'); }
/* 원장에 «PART A» 처럼 이름이 빗나가게 적힌 줄 — 마스터 품목명으로 묶음이 잡힌다. 원장 이름으로 잡히던 줄은 그대로다. */
NO=0;
const RAW2=[H, A('GBWS-X001','2026-05-01','Left','BFE','Alarm-Main flame off'), P('GBWS-X001','2026-05-01','Left','P-CV-7','PART A'),
  P('GBWS-X001','2026-05-01','Left','P-NZ-1','BURNER NOZZLE'), P('GBWS-X001','2026-05-01','Left','P-UNK-3','SOMETHING'),
  P('GBWS-X001','2026-05-01','Left','P-MFC-LM','MFC')];
const mk=()=>{ const d=G.FSE.parse(toDb(G,RAW2).back,{org:snk=>INST[snk]||null}); return d; };
{ const D0=mk(); G.FSE.bind(D0);
  is(!D0.parts.find(p=>p.code==='P-CV-7').grp, '마스터 없이는 «PART A» 줄이 묶음에 안 잡힌다(대조)');
  I.clear(); const D2=mk(), C=fakeDb(MASTER); await G.FSE.items(D2, C); G.FSE.bind(D2);
  const pcv=D2.parts.find(p=>p.code==='P-CV-7'), pnz=D2.parts.find(p=>p.code==='P-NZ-1'), pun=D2.parts.find(p=>p.code==='P-UNK-3');
  is(pcv.grp==='노즐 커버', '마스터 품목명 «NOZZLE COVER SUS» 로 이름 규칙이 잡힌다 → 노즐 커버');
  is(pnz.grp==='버너 노즐' && G.FSE.pname(pnz)==='BURNER NOZZLE ASSY', '코드로 잡힌 줄은 그대로 · 이름은 표준 품목명으로 보인다');
  is(G.FSE.pname(pun)==='SOMETHING' && !pun.std, '마스터에 없는 번호는 원장 이름 그대로');
  is(D2.itemCodes===4 && D2.itemHit===3 && D2.itemMiss===1 && D2.itemMissRows===1 && !D2.itemEmpty, '마스터에 없는 번호를 센다 (4개 중 1 · 1줄)');
  is(G.FSE.fluidOf({grp:'MFC'}, {name:'MFC', spec:'', std:{spec1:'CH4 100SLM'}})==='LNG' && G.FSE.fluidOf({grp:'MFC'}, {name:'MFC', spec:'O2', std:{spec1:'CH4'}})==='O2',
    '유체 — 원장 글자에 없을 때만 마스터 규격으로(원장이 먼저)');
  I.clear(); const D3=mk(); await G.FSE.items(D3, fakeDb([])); is(D3.itemEmpty && D3.itemMiss===0, '마스터가 비었으면 «없는 번호»로 세지 않는다(아직 안 올렸다)');
  I.clear(); const D4=mk(); await G.FSE.items(D4, fakeDb(MASTER,{err:'relation "public.item_master" does not exist'}));
  is(D4.itemWhy==='no_table' && D4.itemMiss===0 && G.FSE.pname(D4.parts[0])!=='', '표가 없으면(setup-30 전) 말없이 원장 이름 그대로 — 없는 번호로 세지 않는다'); }
I.clear();

/* ── [7] 보는 부품 · 함께 교체한 부품 · 설비 속성 따로 받기 (v191) ── */
console.log('[7] 보는 부품 — MFC 이름 · 배수 · 자동 추천 · 재발·이력 · 설비 속성 · 받는 열');
is(G.FSE.isMfcGrp('MFC') && G.FSE.isMfcGrp('LNG MFC') && G.FSE.isMfcGrp('O2 MFC') && G.FSE.isMfcGrp('mfc(CDA)') && !G.FSE.isMfcGrp('MFCX') && !G.FSE.isMfcGrp('버너 노즐'),
  'MFC 판정 묶음 = 이름에 «MFC» 낱말(LNG MFC · O2 MFC …) — 예전에는 정확히 «MFC» 만이라 유체별로 나누면 꺼졌다');
{ const REG2=[{id:1,grp:'LNG MFC',code:'P-MFC-LM',fluid:'LNG',maker:'MRC',on_:true,ord:1},{id:2,grp:'O2 MFC',code:'P-MFC-OK',fluid:'O2',maker:'MKP',on_:true,ord:2},
    {id:3,grp:'버너 노즐',code:'P-NZ-1',on_:true,ord:3}];
  G.FSE.reg.rows=REG2; G.FSE.reg._re=null;
  const D2=G.FSE.parse(back,{org:snk=>INST[snk]||null}); G.FSE.bind(D2);
  const v2=G.FSE.ver(D2,u('GBWS-X001','Left'),'LNG',null,G.FSE.P());
  is(D2.hasMfc && v2.ver==='MRC F1' && v2.how==='sn' && D2.swapped===1, '«LNG MFC»·«O2 MFC» 로 나눠도 버전 판정이 그대로 (F1 · 뒤바뀜 보정 1)');
  G.FSE.reg.rows=REG; G.FSE.reg._re=null; }
/* 함께 교체한 부품 — 지어낸 작은 원장: 작업 60건은 늘 O-RING 을 간다(평소) · 알람 10건 중 8건이 MFC · 6건이 O-RING */
NO=0;
const RAW3=[H];
for(let i=0;i<60;i++){ const d='2026-0'+(1+i%8)+'-'+String(1+i%27).padStart(2,'0'); RAW3.push(row({sn:'GBWS-X0'+(10+i%5),d,ch:'Left',mc:'CBM'})); RAW3.push(P('GBWS-X0'+(10+i%5),d,'Left',i%2?'P-OR-1':'P-OR-2','O-RING')); }
for(let i=0;i<10;i++){ const d='2026-09-'+String(1+i).padStart(2,'0'), sn='GBWS-X02'+(i%3);
  RAW3.push(A(sn,d,'Right','BFE','Alarm-Main flame off'));
  if(i<8) RAW3.push(P(sn,d,'Right','P-MFC-LM','MFC'));
  if(i<6) RAW3.push(P(sn,d,'Right','P-OR-1','O-RING')); }
RAW3.push(A('GBWS-X020','2026-09-20','Right','BFE','Alarm-Main flame off'));     // MFC 교체(9/1) 19일 뒤 재발
{ const D3=G.FSE.parse(toDb(G,RAW3).back,{org:()=>null});
  D3.parts.forEach(p=>{ if(/^P-OR/.test(p.code)) p.std={name:'O-RING'}; });     // 코드가 달라도 표준 품목명이 같으면 한 덩어리
  G.FSE.bind(D3);
  is(D3.parts.filter(p=>/^P-OR/.test(p.code)).every(p=>p.ik==='n:o-ring') && D3.parts.find(p=>p.code==='P-MFC-LM').ik==='g:MFC',
    '보는 부품 열쇠 — 묶음은 g:묶음 · 묶음 밖은 표준 품목명(n:) — 코드 두 가지 O-RING 이 한 덩어리');
  const ev3=D3.ev.filter(e=>e.alarm && G.FSE.match(e,{axis:'code',vals:['BFE']},D3)), base3=D3.ev.filter(e=>e.mc);
  const A3=G.FSE.affect(D3, ev3, base3), mfc=A3.list.find(x=>x.k==='g:MFC'), orr=A3.list.find(x=>x.k==='n:o-ring');
  is(A3.nA===11 && A3.nB===71 && mfc.a===8 && Math.abs(mfc.share-8/11)<1e-9 && Math.abs(mfc.base-8/71)<1e-9 && Math.abs(mfc.x-71/11)<1e-9,
    '배수 = (알람 작업 중 교체 비율) ÷ (모든 작업 중 교체 비율) — MFC 8/11 ÷ 8/71 = '+(mfc&&mfc.x.toFixed(2)));
  is(A3.list[0].k==='g:MFC' && orr && orr.x<1, '순서는 «평소보다 몇 번 더» — 건수로는 O-RING 도 많지만 배수가 1 아래라 뒤로 ('+(orr&&orr.x.toFixed(2))+'배)');
  const ap=G.FSE.autoPick(A3, G.FSE.P());
  is(ap.length===1 && ap[0]==='g:MFC', '자동 추천 = 두드러지고 잦은 부품만 — MFC (O-RING 은 어디서나 가는 부품이라 빠진다)');
  G.params.rows={fse_auto_x:{value:20}}; is(G.FSE.autoPick(A3, G.FSE.P()).length===0, '자동 추천 기준(배수)은 판정 기준에서 — 20배로 올리면 아무것도 안 뽑힌다(지어내지 않는다)'); G.params.rows={};
  const stM=G.FSE.stats(D3, ev3, D3.units, {asOf:D3.asOf, recur:30, top:5, items:['g:MFC']});
  const stO=G.FSE.stats(D3, ev3, D3.units, {asOf:D3.asOf, recur:30, top:5, items:['n:o-ring']});
  const st0=G.FSE.stats(D3, ev3, D3.units, {asOf:D3.asOf, recur:30, top:5, items:[]});
  is(stM.rec.n===8 && stO.rec.n===6 && st0.rec.n===0, '교체 후 재발은 «보는 부품»을 바꾼 작업만 센다 (MFC 8 · O-RING 6 · 없음 0)');
  const hM=G.FSE.history(D3, G.snKey('GBWS-X020')+'|Right', {axis:'code',vals:['BFE']}, ['g:MFC']);
  const hO=G.FSE.history(D3, G.snKey('GBWS-X020')+'|Right', {axis:'code',vals:['BFE']}, ['n:o-ring']);
  is(hM.filter(x=>x.kind==='part').every(x=>x.p.grp==='MFC') && hM.some(x=>x.kind==='alarm'&&x.ver) && hO.filter(x=>x.kind==='alarm').every(x=>!x.ver),
    '이력 — 보는 부품만 · 당시 MFC 버전은 보는 부품에 MFC 가 있을 때만');
  const g20=hM.find(x=>x.kind==='alarm'&&x.date==='2026-09-20');
  is(g20 && g20.gap===13, '이력 «직전 교체 후» 도 보는 부품 기준 (MFC 9/7 → 9/20 = 13일)'); }
/* 설비 속성을 설비마다 한 줄로(fse_units) 받아도 같은 결과 — 행에서 그 열을 빼고 단위 지도에서 입힌다 */
{ const UNITC=G.FSE.UNIT, keys=Object.keys(G.SM.SPEC.fse.fields);
  const keep=keys.filter(k=>G.FSE.READ.indexOf(k)>=0).map(k=>[].concat(G.SM.SPEC.fse.fields[k])[0]);
  const hdr=back[0], idx=hdr.map((h,i)=>keep.indexOf(h)>=0?i:-1).filter(i=>i>=0);
  const slim=back.map(r=>idx.map(i=>r[i]));
  /* fse_units 가 돌려주는 꼴([sn, chamber, last_row, site, fab, grp1, det1, btype, model, code, turn_on]) → GST.FSE.units 와 같은 합치기 */
  const um={}; const col=k=>hdr.indexOf([].concat(G.SM.SPEC.fse.fields[k])[0]);
  back.slice(1).forEach((r,ri)=>{ const sn=r[col('sn')]; if(!G.snKey(sn)) return; const k=G.snKey(sn)+'|'+G.FSE.CH(r[col('chamber')]); const o=um[k]||(um[k]={});
    [['site','site'],['fab','fab'],['g1','grp1'],['d1','det1'],['btype','btype'],['model','model'],['code','code'],['turnOn','turnOn']].forEach(a=>{ const v=r[col(a[1])]; if(v!=null&&String(v).trim()!=='') o[a[0]]=String(v).trim(); }); });
  const Da=G.FSE.parse(back,{org:snk=>INST[snk]||null}), Db=G.FSE.parse(slim,{org:snk=>INST[snk]||null, units:um});
  const pick=U=>[U.fab,U.d1,U.g1,U.btype,U.model,U.turnOn,U.utype,U.fabIn].join('|');
  is(slim[0].length===G.FSE.READ.length && UNITC.every(k=>slim[0].indexOf([].concat(G.SM.SPEC.fse.fields[k])[0])<0), '행에서 설비 속성 열을 뺀 꼴 ('+slim[0].length+'열)');
  is(Object.keys(Da.units).length===Object.keys(Db.units).length && Object.keys(Da.units).every(u=>pick(Da.units[u])===pick(Db.units[u])) && Da.ev.length===Db.ev.length && Da.parts.length===Db.parts.length,
    '설비 속성을 설비마다 한 줄로 받아도 설비·알람·부품이 한 자리도 안 바뀐다'); }
/* dbRows — opt.fields 면 그 열만 고른다(나머지 표는 지금처럼 전부) */
{ const sel=[]; const N=3;
  const mk=()=>({ rpc: async()=>({data:Object.keys(G.SM.SPEC.fse.fields).map(G._snake).concat(['src_row','extra']), error:null}),
    from(t){ if(t==='sheet_sync_log') return { select:()=>({ eq:()=>({ maybeSingle: async()=>({data:{rows:N, err:null, synced_at:'2026-10-01T00:00:00Z', ms:-1}}) }) }) };
      const st={s:'', a:null, b:null, lo:-1, hi:1e9, desc:false};
      const q={ select:(x)=>{ st.s=x; sel.push(x); return q; }, gte:(c,v)=>{ st.lo=v; return q; }, lt:(c,v)=>{ st.hi=v; return q; },
        order:(c,o)=>{ st.desc=!!(o&&o.ascending===false); return q; }, range:(a,b)=>{ st.a=a; st.b=b; return q; }, limit:(n)=>{ st.a=0; st.b=n-1; return q; },
        then:(res)=>{ let d=[0,1,2].filter(i=>i>=st.lo&&i<st.hi).map(i=>{ const o={src_row:i}; st.s.split(',').forEach(c=>{ if(c!=='src_row') o[c]='v'+i; }); return o; });
          if(st.desc) d.reverse(); if(st.a!=null) d=d.slice(st.a, st.b+1); res({data:d, error:null}); } }; return q; } });
  const db0=G.db; G.db=async()=>mk();
  let r1=null, err=''; try{ r1=await G.dbRows('fse',{fields:G.FSE.READ}); }catch(e){ err=String(e&&e.message||e); }
  const full=sel.filter(x=>x!=='src_row').pop()||'';
  is(r1 && r1.length===N+1 && /work_date/.test(full) && /part_code/.test(full) && !/remark|row_no|sd_start|extra|grp1|det1/.test(full),
    'dbRows(fse, fields) — 이 탭이 쓰는 열만 고른다 (설비 속성·안 쓰는 열·extra 없음) '+err);
  G.db=db0; }

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
  +'GST.FSE.reg.load=async function(){ this.rows=JSON.parse(JSON.stringify(GST.__REG)); this._re=null; this.why=""; return this.rows; };'
  +'GST.items._db=async function(){ return null; };GST.items._m={"P-NZ-1":{code:"P-NZ-1",itype:"소모품",name:"BURNER NOZZLE ASSY",spec1:"SUS"}};';
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
/* 보는 부품 — 이 원장은 작아(알람 작업에서 교체 3건) 자동 추천이 비어 있다 → 「함께 교체한 부품」에서 고른다 */
const aff=await page.$$eval('#fseAffCard tbody tr',r=>r.map(x=>x.children[0].textContent.trim()));
is(aff.length===3 && aff.some(t=>/MFC/.test(t)) && aff.some(t=>/버너 노즐/.test(t)) && aff.some(t=>/노즐 커버/.test(t)), '함께 교체한 부품 — 이 알람 작업에서 바꾼 묶음 셋 ('+aff.join(' / ')+')');
is(/두드러진 것이 없습니다/.test(await page.textContent('#fseBar .fse-vrow')) && /자동 추천/.test(await page.textContent('#fseBar .fse-vrow')), '자동 추천이 비면 그렇게 말한다(지어내지 않는다)');
is(/보는 부품에 MFC 묶음이 없어/.test(await page.textContent('#fseMfc')), 'MFC 카드는 보는 부품에 MFC 가 있을 때만 — 지금은 숨기고 그렇게 말한다');
await page.click('#fseAffCard [data-fat="g:MFC"]'); await page.waitForTimeout(400);
await page.click('#fseAffCard [data-fat="g:버너 노즐"]'); await page.waitForTimeout(400);
const vchips=await page.$$eval('#fseBar .fse-vc',c=>c.map(x=>x.textContent.replace('✕','').trim()));
is(vchips.join('|')==='MFC|버너 노즐' && /직접 고름/.test(await page.textContent('#fseBar .fse-vrow')), '«보기»를 누르면 보는 부품에 들어간다 → 직접 고름 ('+vchips.join('|')+')');
const thead=await page.$$eval('#fseTopCard thead th',t=>t.map(x=>x.textContent.trim()));
is(thead.includes('MFC') && thead.includes('MFC 교체 후') && thead.includes('버너 노즐 교체 후') && !thead.some(h=>/노즐 커버/.test(h)), '순위표 열이 보는 부품을 따른다 ('+thead.slice(7).join(' · ')+')');
/* 순위 · 타임라인 · 이력 */
const top=await page.$$eval('#fseTopCard tbody tr',r=>r.map(x=>[...x.children].map(c=>c.textContent.trim())));
is(top.length===4 && top[0][1]==='GBWS-X001', '순위 첫 줄 = GBWS-X001 (S/N 단위 · 4대)');
is(/Left 4 · Right 2/.test(top[0][2]), '챔버별 건수를 한 줄에 (Left 4 · Right 2)');
is(top[0].some(c=>/F1/.test(c)), '순위표에 MFC 버전이 뜬다');
const circ=await page.$$eval('#fseTlCard svg circle',c=>c.length);
is(circ>=3, '타임라인에 달별 알람 원 ('+circ+')');
const hist=await page.$$eval('#fseHistCard tbody tr',r=>r.length);
is(hist>=7, '이력 표 — 알람·교체·TBM ('+hist+')');
is(/BURNER NOZZLE ASSY \(P-NZ-1\)/.test(await page.textContent('#fseHistCard')), '이력의 부품 이름은 자재마스터 표준 품목명 (코드 함께)');
/* MFC 버전 띠 (v193 · 시안 A) — 보는 부품에 MFC 가 있으면 챔버마다 유체별 띠 · 교체선 · 전후 요약 · 말풍선에 «당시» 버전 */
const vb=await page.evaluate(()=>{ const c=document.getElementById('fseTlCard');
  const segs=[...c.querySelectorAll('.fse-vseg')].map(g=>({f:g.dataset.f, v:g.dataset.v, t:(g.querySelector('title')||{}).textContent||'', fill:g.querySelector('rect').getAttribute('fill')}));
  const sum=[...c.querySelectorAll('.fse-vsum')].map(g=>[...g.querySelectorAll('text')].map(t=>t.textContent).join(' '));   /* 보이는 글자(한 줄에 안 들어가면 비교가 다음 줄) */
  const tips=[...c.querySelectorAll('svg g > title')].map(t=>t.textContent).filter(t=>/^2026-03 · /.test(t));
  return { segs, sum, tips, chg:c.querySelectorAll('.fse-vchg line').length, leg:c.querySelector('.fse-leg').textContent, ch:[...c.querySelectorAll('.fse-tlch')].map(x=>x.textContent) }; });
const lngL=vb.segs.filter(x=>x.f==='LNG');
is(vb.ch.join('|')==='Left|Right' && lngL.length>=3 && lngL[0].v==='MRC G' && lngL[1].v==='MRC F1', 'MFC 버전 띠 — 챔버(Left·Right)마다 LNG 띠 · Left 는 MRC G → MRC F1 ('+lngL.map(x=>x.v).join(' → ')+')');
is(/^url\(#fseVh/.test(lngL[0].fill) && !/^url/.test(lngL[1].fill) && /출하 원품 · 반입일 추정/.test(lngL[0].t) && /교체 · S\/N 250610/.test(lngL[1].t), '추정 구간(반입일 환산)은 빗금 · S/N 확정 구간은 칠한 띠 · 띠 말풍선에 근거와 S/N');
is(vb.chg>=1, 'MFC 교체선 — 교체일 위치에 알람 줄부터 띠까지 ('+vb.chg+')');
is(vb.sum.some(t=>/LNG MFC MRC G → MRC F1 · 26-03-01/.test(t) && /알람 MRC G 구간 3건 · .*→ MRC F1 구간 1건/.test(t)), '전후 요약 — «LNG MFC MRC G → MRC F1 · 날짜» · 바꾸기 전 3건(25-03-10 · 26-02-05 · 그날 03-01) → 뒤 1건(03-20) ('+vb.sum[0]+')');
is(vb.tips.some(t=>/2026-03-01 Alarm-Main flame off — 당시 LNG MFC MRC G/.test(t)) && vb.tips.some(t=>/2026-03-20 Alarm-Main flame off — 당시 LNG MFC MRC F1/.test(t) && /LNG 교체 후 19일/.test(t)),
  '알람 원 말풍선 — 03-01 은 «당시 LNG MFC MRC G»(그날 바꾸기 전) · 03-20 은 «MRC F1 · 교체 후 19일»');
is(/MRC G/.test(vb.leg) && /MRC F1/.test(vb.leg) && !/MCA/.test(vb.leg) && /MFC 교체/.test(vb.leg) && /추정/.test(vb.leg) && !/▲ MFC/.test(vb.leg), '범례 — 버전 색·추정·교체선 (띠로 그린 MFC 는 기호 대신 띠)');
await page.click('#fseTopCard tr[data-fsel="GBWSX002"]'); await page.waitForTimeout(400);
is(/GBWS-X002/.test(await page.textContent('#fseTlCard h3')), '순위표 줄을 누르면 그 설비의 타임라인');
/* MFC 카드 */
const mfc=await page.textContent('#fseMfc');
is(/S\/N 날짜코드/.test(mfc) && /MFC 조사 대상/.test(mfc), 'MFC 판정 근거 · 조사 대상 카드');
is(/뒤바뀐 줄 1건/.test(mfc) && /자재실적의 IN SN 으로 채웠습니다/.test(mfc), '뒤바뀜 보정·자재실적 보충을 숨기지 않고 적는다');
/* 알람마다 따로 기억 — 다른 알람으로 가면 그 알람의 보는 부품(자동), 돌아오면 고른 것이 그대로 */
await page.click('#fseBar .fse-chip[data-fv="BFE"]'); await page.waitForTimeout(300);
await page.click('#fseBar .fse-chip[data-fv="LWA"]'); await page.waitForTimeout(400);
is(await page.$$eval('#fseBar .fse-vc',c=>c.length)===0 && /자동 추천/.test(await page.textContent('#fseBar .fse-vrow')), '다른 알람(LWA)은 따로 — 자동 추천(빈칸)');
is(await page.$$eval('#fseTlCard .fse-vseg, #fseTlCard .fse-vsum',c=>c.length)===0, '보는 부품에 MFC 가 없으면 띠도 없다 — 타임라인은 지금까지 그대로');
await page.click('#fseBar .fse-chip[data-fv="LWA"]'); await page.waitForTimeout(300);
await page.click('#fseBar .fse-chip[data-fv="BFE"]'); await page.waitForTimeout(400);
is((await page.$$eval('#fseBar .fse-vc',c=>c.map(x=>x.textContent.replace('✕','').trim()))).join('|')==='MFC|버너 노즐', 'BFE 로 돌아오면 골라 둔 보는 부품이 그대로');
is(await page.evaluate(()=>{ const o=JSON.parse(localStorage.getItem('gst_fse_sel')||'{}'); return o.pv && Array.isArray(o.pv['code:BFE']) && o.pv['code:BFE'].join('|')==='g:MFC|g:버너 노즐'; }), '이 PC 에 «알람 고르기 → 보는 부품»으로 남는다');
/* 좌우 스크롤 없음 — 페이지·표·타임라인이 화면 폭 안에 */
const ovf=async()=>page.evaluate(()=>{ const de=document.scrollingElement||document.documentElement, out=[];
  if(de.scrollWidth>de.clientWidth+1) out.push('page '+de.scrollWidth+'>'+de.clientWidth);
  document.querySelectorAll('#fseSec table').forEach(t=>{ const w=t.parentElement; if(t.offsetParent && t.scrollWidth>w.clientWidth+1) out.push((w.closest('[id]')||{}).id+' '+t.scrollWidth+'>'+w.clientWidth); });
  document.querySelectorAll('#fseSec svg').forEach(s=>{ const c=s.closest('.card'); if(c && s.getBoundingClientRect().width>c.clientWidth+1) out.push('svg '+Math.round(s.getBoundingClientRect().width)+'>'+c.clientWidth); });
  return out; });
await page.evaluate(()=>{ const FS=fseFS(); FS.tl='all'; fseRender(); }); await page.waitForTimeout(300);
const o1700=await ovf();
await page.setViewportSize({width:1280,height:1000}); await page.waitForTimeout(500); await page.evaluate(()=>fseRender()); await page.waitForTimeout(300);
const o1280=await ovf();
is(!o1700.length && !o1280.length, '좌우 스크롤 없음 — 1700·1280 폭에서 페이지·표·타임라인이 넘치지 않는다 '+JSON.stringify(o1700.concat(o1280)));
await page.setViewportSize({width:1700,height:1200}); await page.waitForTimeout(300);
/* 엑셀 */
const [dl]=await Promise.all([page.waitForEvent('download',{timeout:20000}).catch(()=>null), page.click('#fseTopCard [data-fx="top"]')]);
is(dl && /^alarm_rank_2026-09-15\.xlsx$/.test(dl.suggestedFilename()), '순위표 엑셀 받기 ('+(dl&&dl.suggestedFilename())+')');
/* 백데이터 엑셀(v192 · 본사 요청 1-5) — 알람 발생 설비의 교체 줄 그대로 · 뺄 자재 고르기 · 설치현황(S/N)에서 설비 제원 */
await page.click('#fseTopCard [data-fx="raw"]'); await page.waitForTimeout(300);
const ritems=await page.$$eval('.gov #fseRl .fse-ri',r=>r.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
is(ritems.length===3 && /MFC/.test(ritems[0]) && /4$/.test(ritems[0]), '자재 목록 = 알람 발생 설비에서 실제로 교체된 것 (MFC 4 · 버너 노즐 2 · 노즐 커버 1) '+JSON.stringify(ritems));
is(/3종 · 교체 7줄/.test(await page.textContent('.gov #fseRc')), '기본은 전부 체크 — 3종 · 7줄');
await page.click('.gov #fseRl input[data-rk="g:버너 노즐"]'); await page.waitForTimeout(200);
is(/2종 · 교체 5줄/.test(await page.textContent('.gov #fseRc')) && /5줄 내려받기/.test(await page.textContent('.gov [data-ra="go"]')), '체크를 풀면 그 자재가 빠진다 — 2종 · 5줄');
const [dl2]=await Promise.all([page.waitForEvent('download',{timeout:20000}).catch(()=>null), page.click('.gov [data-ra="go"]')]);
is(dl2 && /^alarm_parts_BFE_2026-09-15\.xlsx$/.test(dl2.suggestedFilename()), '백데이터 엑셀 받기 ('+(dl2&&dl2.suggestedFilename())+')');
if(dl2){ const XL=await import('./node_modules/xlsx/xlsx.mjs'); const fp=await dl2.path(); const wb=XL.read(fs.readFileSync(fp));
  const h=XL.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''}), H0=h[0], col=n=>H0.indexOf(n);
  is(wb.SheetNames.join('|')==='교체 이력|설비 요약' && h.length===6, '시트 둘 · 교체 이력 5줄 (머리글 + 5) — '+wb.SheetNames.join('|')+' '+h.length);
  is(['설비 코드','공정','세부공정','모델','자재코드','표준 품목명','수량','작업일자','유/무상','MFC In S/N','설치현황 연결'].every(n=>col(n)>=0), '중요 맵핑 열이 다 있다 (설비 코드·공정·세부공정·모델·자재코드·품목명·수량·작업일자 …)');
  const r1=h.find(r=>r[col('S/N')]==='GBWS-X001' && r[col('자재코드')]==='P-MFC-LM');
  is(r1 && r1[col('설비 코드')]==='CD0' && r1[col('공정')]==='ETCH' && r1[col('세부공정')]==='DET-A' && r1[col('모델')]==='MODEL-A' && r1[col('챔버 타입')]==='DUAL' && r1[col('설치현황 연결')]==='O',
    'S/N 으로 설치현황 제원을 끌어온다 (설비 코드 CD0 · 공정 ETCH · 세부공정 · 모델 · 챔버 타입)');
  is(r1 && r1[col('작업일자')]==='2026-03-01' && r1[col('작업 구분')]==='BM' && r1[col('그 작업의 알람')]==='Alarm-Main flame off' && r1[col('수량')]===1 && r1[col('다음 알람')]==='2026-03-20' && r1[col('다음 알람까지(일)')]===19 && r1[col('MFC In S/N')]==='250610-11A701_F',
    '교체 줄 그대로 — 작업일·작업 구분·그 작업의 알람·수량·MFC In S/N·다음 알람까지 19일');
  is(!h.some(r=>r[col('자재 묶음')]==='버너 노즐'), '뺀 자재(버너 노즐)는 없다');
  const x3=h.find(r=>r[col('S/N')]==='GBWS-X003');
  is(x3 && x3[col('설치현황 연결')]==='X', '설치현황에 없는 설비는 «설치현황 연결 X» 로 밝힌다(원장 값으로 채움)');
  const sm=XL.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]],{header:1,defval:''});
  is(sm.length===6 && sm[0].indexOf('MFC 교체')>=0, '설비 요약 — 알람 발생 챔버 5줄 · 자재별 교체 횟수 열'); }
await page.evaluate(()=>GST._ovClose());
/* 설비 일대기 탭은 걷어냈다(v192 · 사용자 확정) — S/N 메뉴는 «알람 분석에서 이 설비 보기» */
is(!(await page.$('#gstSecNav .gst-sec-tab[data-id="life"]')) && !(await page.$('[data-sec="life"]')), '설비 일대기 탭이 없다');
is(await page.evaluate(()=>GST.snMenuExtra&&GST.snMenuExtra.length===1&&GST.snMenuExtra[0].label()==='알람 분석에서 이 설비 보기'), 'S/N 메뉴 = «알람 분석에서 이 설비 보기»');
await page.evaluate(()=>fseOpenSn('SWS-X001')); await page.waitForTimeout(500);
is(/SWS-X001/.test(await page.textContent('#fseTlCard h3')), '순위표 밖 설비(고른 알람 없음)도 타임라인으로 연다');
await page.evaluate(()=>fseOpenSn('NOPE-0000')); await page.waitForTimeout(400);
is(/FSE 원장에 없는 설비/.test(await page.evaluate(()=>(document.getElementById('capToast')||{}).textContent||'')), '원장에 없는 S/N 은 그렇게 말한다');
await page.evaluate(()=>{ fseFS().sel=''; fseRender(); });
/* 부품 묶음 — 쓰기 권한이 없으면 읽기 전용이라고 말한다 */
await page.click('#fseBar [data-fparts]'); await page.waitForTimeout(300);
const pt=await page.textContent('.gov');
is(/읽기 전용/.test(pt) && !(await page.$('.gov [data-pa="save"]')), '부품 묶음 — 권한 없으면 읽기 전용 · 저장 단추 없음');
await page.waitForTimeout(300);
const pmCells=await page.$$eval('.gov #fsePt tbody tr',r=>r.map(x=>[x.querySelector('[data-pf="code"]').value, x.querySelector('.fse-pm').textContent.trim()]));
is(pmCells.some(c=>c[0]==='P-NZ-1' && c[1]==='BURNER NOZZLE ASSY · SUS'), '코드 줄 옆에 «마스터 품목명» (품목명 · 규격1)');
is(pmCells.filter(c=>c[0]==='P-MFC-LM').every(c=>c[1]===''), '마스터를 못 읽었으면 «마스터에 없음»이라 하지 않고 비워 둔다');
await page.fill('.gov #fsePq','NOZ'); await page.click('.gov [data-pa="find"]'); await page.waitForTimeout(300);
is(/자재마스터를 읽지 못했습니다/.test(await page.textContent('#fsePres')) && !(await page.$('.gov [data-pa="put"]')), '찾기 — 못 읽으면 그렇게 말한다 · 읽기 전용이면 «묶음에 넣기» 없음');
await page.evaluate(()=>GST._ovClose());
/* 쓰기 권한 — 찾아서 «묶음에 넣기»(저장은 사람이 «저장»을 눌러야 한다 · 여기서는 줄만 생긴다) */
await page.evaluate(()=>{ GST.canWrite=()=>true;
  GST.items.search=async()=>({why:'', rows:[{code:'P-CV-7',itype:'소모품',name:'NOZZLE COVER SUS',spec1:'D50'},{code:'P-NZ-1',itype:'소모품',name:'BURNER NOZZLE ASSY',spec1:'SUS'}]}); });
await page.click('#fseBar [data-fparts]'); await page.waitForTimeout(300);
await page.fill('.gov #fsePq','NOZ'); await page.press('.gov #fsePq','Enter'); await page.waitForTimeout(300);
const rr=await page.$$eval('#fsePrt tbody tr',r=>r.map(x=>[x.children[0].textContent, x.children[4].textContent, x.lastElementChild.textContent]));
is(rr.length===2 && rr[1][0]==='P-NZ-1' && rr[1][1]==='2' && /이미 있음/.test(rr[1][2]) && /묶음에 넣기/.test(rr[0][2]),
  '찾은 품목 — 원장 교체 수(P-NZ-1 = X001 한 번 + 작업 없는 줄 한 번) · 이미 묶음에 있는 번호는 «이미 있음» ('+JSON.stringify(rr)+')');
const nBefore=await page.$$eval('.gov #fsePt tbody tr',r=>r.length);
await page.click('.gov [data-pa="put"][data-code="P-CV-7"]'); await page.waitForTimeout(200);
is(/넣을 묶음 이름을 먼저/.test(await page.textContent('#fsePtMsg')) && await page.$$eval('.gov #fsePt tbody tr',r=>r.length)===nBefore, '묶음 이름이 없으면 넣지 않고 그렇게 말한다');
await page.fill('.gov #fsePg','노즐 커버'); await page.click('.gov [data-pa="put"][data-code="P-CV-7"]'); await page.waitForTimeout(300);
const last=await page.$eval('.gov #fsePt tbody tr:last-child',tr=>({g:tr.querySelector('[data-pf="grp"]').value, c:tr.querySelector('[data-pf="code"]').value, l:tr.querySelector('[data-pf="label"]').value, d:tr.dataset.dirty, pid:tr.dataset.pid}));
is(last.g==='노즐 커버' && last.c==='P-CV-7' && last.l==='NOZZLE COVER SUS' && last.d==='1' && last.pid==='', '«묶음에 넣기» → 새 줄(묶음 · 코드 · 표시 이름 = 품목명) · 저장 전 표시');
is(!(await page.$('.gov [data-pa="put"][data-code="P-CV-7"]')), '넣은 품목은 «이미 있음»으로 바뀐다(두 번 못 넣는다)');
/* 저장 — 머리에 결과를 적고 화면을 다시 그린다 · 묶음 이름을 나누면(MFC → LNG MFC · O2 MFC) 기억해 둔 보는 부품도 따라간다 */
await page.evaluate(()=>{ window.__upd=[]; GST._dbAuthed=async()=>({ from(t){ const q={ _o:null, _id:null,
    update(o){ q._o=o; return q; }, insert(o){ q._o=o; q._id=99; return q; }, eq(c,v){ q._id=v; return q; },
    select(){ window.__upd.push({id:q._id, grp:q._o.grp}); const r=GST.__REG.find(x=>x.id===q._id); if(r) Object.assign(r,q._o); else GST.__REG.push(Object.assign({id:q._id},q._o));
      return Promise.resolve({data:[{id:q._id}], error:null}); } }; return q; } }); });
const setG=async(code,g)=>page.evaluate(([c,g])=>{ const tr=[...document.querySelectorAll('.gov #fsePt tbody tr')].find(t=>t.querySelector('[data-pf="code"]').value===c);
  const i=tr.querySelector('[data-pf="grp"]'); i.value=g; i.dispatchEvent(new Event('input',{bubbles:true})); },[code,g]);
await setG('P-MFC-LM','LNG MFC'); await setG('P-MFC-OK','O2 MFC');
await page.click('.gov [data-pa="save"]'); await page.waitForTimeout(800);
const stt=await page.textContent('.gov #fsePtSt');
is(/3줄 저장했습니다/.test(stt), '저장 결과를 머리(저장 단추 옆)에 적는다 — «'+stt.trim()+'» (넣은 노즐 커버 줄 + 이름 바꾼 두 줄)');
is(await page.evaluate(()=>window.__upd.length)===3, '바뀐 줄만 보낸다 (3줄)');
await page.evaluate(()=>GST._ovClose()); await page.waitForTimeout(300);
const vc2=await page.$$eval('#fseBar .fse-vc',c=>c.map(x=>x.textContent.replace('✕','').trim()));
is(vc2.join('|')==='LNG MFC|O2 MFC|버너 노즐', '묶음을 나눴더니 보는 부품의 «MFC» 가 «LNG MFC · O2 MFC» 로 ('+vc2.join('|')+')');
is((await page.$$eval('#fseTopCard tbody tr',r=>r[0]?[...r[0].children].map(c=>c.textContent).join(' '):'')).match(/F1/) && /S\/N 날짜코드/.test(await page.textContent('#fseMfc')),
  '«LNG MFC» 로 나눠도 순위표·MFC 카드의 버전 판정이 그대로 선다');
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
