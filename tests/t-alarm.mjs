/* 국내 알람·올바이패스 파서 (GST.SM.SPEC.alarm · abp2 · GST.ALARM)

   지키는 것: 한 워크북 안의 K·P·H 세 «다른 양식»이 같은 스키마로 눕는가,
   그리고 집계 대상 판정이 시트가 적어 둔 답과 같은가.

   ⚠ 픽스처는 전부 «만든 값»이다. 실제 워크북에는 작업자 실명·설비 S/N·고객사가 들어 있어
     공개 저장소에 둘 수 없다(t-leak 이 막는다). 머리글 «이름»만 실물과 같게 두면
     이 검사가 지키려는 것 — 별칭 흡수 — 은 그대로 지켜진다. */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  ✓ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };
const is  = (c, m) => c ? ok(m) : bad(m);
const eq  = (a, b, m) => is(a === b, m + '  (' + JSON.stringify(a) + (a === b ? '' : ' ≠ ' + JSON.stringify(b)) + ')');

/* ---- core.js 를 node 에서 띄운다 (브라우저 없이) ---- */
const el = () => ({style:{},appendChild(){},insertBefore(){},remove(){},removeAttribute(){},setAttribute(){},
  addEventListener(){},classList:{add(){},remove(){},toggle(){}},querySelector:()=>null,querySelectorAll:()=>[],
  insertAdjacentHTML(){},insertAdjacentElement(){},parentNode:{insertBefore(){}},firstElementChild:null,
  textContent:'',innerHTML:'',closest:()=>null});
global.document={createElement:el,getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],
  body:el(),documentElement:el(),addEventListener(){},head:el(),readyState:'complete'};
global.window={addEventListener(){},location:{href:'',search:''},self:{},top:{},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},matchMedia:()=>({matches:false,addEventListener(){}})};
global.window.self=global.window.top=global.window;
global.localStorage=global.window.localStorage; global.location=global.window.location;
new Function(fs.readFileSync(ROOT+'/assets/core.js','utf8'))();
const G = global.window.GST;

/* ---- 픽스처 — 세 사이트의 «실제 머리글 이름»에 지어낸 값 ---- */
// K 알람: 머리글이 0행. 유형 계열이 「알람 유형」·「유형1」, 내/외가 「외부 / 내부」.
//         옛 행은 월/주차가 숫자만 있고 연도가 따로 있다.
const K_ALARM = [
  ['Site','Line','Area','EQP ID','소공정','SEQP S/N','SEQP Model','Alarm Level','Alarm Comment',
   'Occur Time','Release Time','Holding Time','공정','세부공정','알람','알람 유형',
   '월별','주차','외부 / 내부','유형1','발생 모듈','발생 사유(서술형)','조치 내용','년도','담당자'],
  ['X1','L1','CVD','EQ001','P1','AAA0001','MODEL A','ALARM','TEST_PRESS_ALARM',
   '2020-12-21 00:15:54','2020-12-21 00:23:32','00:07:38','CVD','SUB1','TEST_PRESS_ALARM','PRESSURE',
   '12','52','내부','압력','포트','지어낸 사유','지어낸 조치','20년','홍길동'],
  ['X1','L1','DIFF','EQ002','P2','AAA-0002S','MODEL B','ALARM','TEST_FLAME_ALARM',
   '2021-01-05 05:53:39','','','DIFF','SUB2','TEST_FLAME_ALARM','FLAME',
   '21년 1월','21년4W','외부','PART','버너','지어낸 사유','지어낸 조치','21년','홍길동'],
  ['','','','','','','','','','','','','','','','','','','','','','','','',''],   // 빈 줄
];
// P 알람: 머리글이 1행(0행은 비어 있다). 「대분류」·「구분기준」·「내적 / 제외」. 정산월·주차 열이 없다.
const P_ALARM = [
  [],
  ['SITE','Line','Area','EQPID','SEQP Type','SEQP S/N','SEQPID2','Status','Maker','SEQP Model',
   'SEQP CH','Alarm Level','Alarm Comment','Occur Time','Release Time','Holding Time',
   '대분류','구분기준','내적 / 제외'],
  ['Y1','Y1-3','CVD','EQ101','ALARM','BBB-0101S','EQ101_SC01','ALARM','GST','MODEL C',
   '1','ALARM','TEST INLET PRESSURE','2025-01-01','2025-01-01','00:23:19','INLET P','내적','포함'],
  ['Y1','Y1-3','CVD','EQ101','ALARM','BBB-0101S','EQ101_SC01','ALARM','GST','MODEL C',
   '1','ALARM','TEST INLET PRESSURE','2025-01-02','2025-01-02','00:04:24','INLET P','중복','제외'],
];
// H 알람: 머리글이 0행. 「알람분류」·「내적/외적」·「현상」. 정산월·주차가 '26년 02월'·'26년 04주'.
const H_ALARM = [
  ['Site','Line','Area','EQP ID','세부공정','SEQP S/N','SEQP Model','Alarm Comment',
   'Occur Time','Release Time','Holding Time','날짜1','내적/외적','유형1','알람분류',
   '알람 실제원인','현상','조치내용','연도','정산월','주차','추적완료여부'],
  ['Z2','15','METAL','EQ201','SUB9','CCC0201','MODEL D','TEST PAB INLET PRES',
   '2025-12-16 03:03:25','2025-12-16 03:29:24','00:25:59','2025-12-16','내적','POWDER','PRESSURE',
   '지어낸 원인','누적','지어낸 조치','26년','26년 02월','26년 04주','완료'],
  ['Z2','15','DIFF','EQ202','SUB8','CCC0202','MODEL E','TEST MAIN FLAME OFF',
   '2025-12-17 04:22:33','','','2025-12-17','외적','PART','FLAME',
   '지어낸 원인','','지어낸 조치','26년','26년 02월','26년 04주',''],
];
// K 올바이패스: 머리글 1행 + 오른쪽에 피벗표가 붙어 있다(머리글 없는 열) + 날짜 칸에 메모가 섞인다.
const K_ABP = [
  [],
  ['','호기','S/N','발생날짜','발생월 삼성기준','주차','년도','라인','내/외','발생사유','확인자',
   '','','유형','21년  1월'],
  ['','EQ001','AAA-0001','2022-01-05','22년 1월','22년 1W','22년','L5','외부','지어낸 사유','확인자A',
   '','','내부','1'],
  ['','EQ003','AAA-0003','메모: 9월2일~5일','','','','L5','내부','지어낸 사유','확인자B'],
];
// P 올바이패스: 머리글 1행. Seq 는 전부 1. 「발생 구분2」가 포함/제외.
const P_ABP = [
  [],
  ['ALLBYPASS_LNG','Occur Date','정산월','월','주차','Holding Time','Site','Line','EQP ID',
   'Chamber ID','SEQP ID','Area','SEQP Model','Occur Time','Release Time','Alarm Comment',
   'All-ByPass Seq','All Bypass 발생 Alarm명','발생 구분','발생 구분2','All Bypass 발생사유'],
  ['ALLBYPASS_LNG','2025-01-01','25_01','25_01','25_01','00:03:16','Y1','Y1-3','EQ101',
   'A','BBB-0101L','CVD','MODEL C','2025-01-01','2025-01-01','ALLBYPASS_LNG',
   '1','[EMERGENCY] TEST LEAK','내적','포함','지어낸 사유'],
  ['ALLBYPASS_LNG','2025-01-02','25_01','25_01','25_02','00:27:00','Y2','Y2-F','EQ102',
   'A_B','BBB-0102S','CLEAN','MODEL C','2025-01-02','2025-01-02','ALLBYPASS_LNG',
   '1','메인 덕트 점검','가성','제외','지어낸 사유'],
];
// H 올바이패스: 머리글 0행. 한 사건이 Seq 1·2·3 세 줄 — 그냥 세면 3배가 된다.
const H_ABP = [
  ['Type','Occur Date','Holding Time','Division','Site','Line','EQP ID','Chamber ID','SEQP S/N',
   'SEQP ID','Area','Maker','SEQP Model','Occur Time','Release Time','ALARM COMMENT',
   'All-ByPass Seq','진성/가성','유지시간','내적/외적','유형','알람구분','실제원인','현상','연도'],
  ['ALLBYPASS_LNG','2025-12-16','','MEMORY','Z2','15','EQ201','','CCC0201','','METAL','GST','MODEL D',
   '2025-12-16 10:41:51','','ALL_BYPASS_LNG','1','가성','1774-01-11','외적','외적','','','','26년'],
  ['ALLBYPASS_LNG','2025-12-16','','MEMORY','Z2','15','EQ201','','CCC0201','','METAL','GST','MODEL D',
   '','','','2','가성','00:00:00','외적','RESET','','','','26년'],
  ['ALLBYPASS_LNG','2025-12-16','','MEMORY','Z2','15','EQ201','','CCC0201','','METAL','GST','MODEL D',
   '','','','3','가성','00:00:00','외적','RESET','','','','26년'],
];

console.log('\n[1] 세 사이트의 다른 양식이 «한 스키마»로 눕는가');
const B = {};
[['K',K_ALARM,'alarm'],['P',P_ALARM,'alarm'],['H',H_ALARM,'alarm'],
 ['K',K_ABP,'abp2'],['P',P_ABP,'abp2'],['H',H_ABP,'abp2']].forEach(([tag,rows,kind])=>{
  const b = G.ALARM.build(rows, kind, tag);
  B[kind+tag] = b;
  is(!b.err, tag+' '+kind+' — 해석 ' + (b.err ? '실패: '+b.err : '성공 (헤더 r'+b.hi+' · '+b.rows.length+'행)'));
});

console.log('\n[2] 머리글 이름이 달라도 같은 칸에 들어가는가 (별칭 흡수)');
eq(B.alarmK.rows[0].atype, 'PRESSURE', 'K 「알람 유형」 → atype');
eq(B.alarmP.rows[0].atype, 'INLET P',  'P 「대분류」   → atype');
eq(B.alarmH.rows[0].atype, 'PRESSURE', 'H 「알람분류」 → atype');
eq(B.alarmK.rows[0].inout, '내부', 'K 「외부 / 내부」 → inout');
eq(B.alarmP.rows[0].inout, '내적', 'P 「구분기준」   → inout');
eq(B.alarmH.rows[0].inout, '내적', 'H 「내적/외적」  → inout');
eq(B.alarmH.rows[0].ctype, 'POWDER', 'H 「유형1」 → ctype (원인 계열)');
eq(B.abp2K.rows[0].sn, 'AAA-0001',  'K 올바 「S/N」      → sn');
eq(B.abp2P.rows[0].sn, 'BBB-0101L', 'P 올바 「SEQP ID」  → sn');
eq(B.abp2H.rows[0].sn, 'CCC0201',   'H 올바 「SEQP S/N」 → sn');

console.log('\n[3] 헤더 행 위치 — 0행·1행이 섞여 있다');
eq(B.alarmK.hi, 0, 'K 알람  헤더 r0');
eq(B.alarmP.hi, 1, 'P 알람  헤더 r1 (0행이 비어 있다)');
eq(B.abp2K.hi,  1, 'K 올바  헤더 r1');
eq(B.abp2H.hi,  0, 'H 올바  헤더 r0');

console.log('\n[4] 발생일 — 날짜형·문자열·시각붙음이 섞여 온다');
eq(B.alarmK.rows[0].occur_date, '2020-12-21', 'K 문자열 「2020-12-21 00:15:54」');
eq(B.alarmP.rows[0].occur_date, '2025-01-01', 'P 「2025-01-01」');
eq(B.alarmH.rows[0].occur_date, '2025-12-16', 'H 「2025-12-16 03:03:25」');
eq(G.ALARM.day(46153), '2026-05-11', '엑셀 시리얼 46153');
eq(G.ALARM.day(new Date(Date.UTC(2026,7,14))), '2026-08-14', 'Date 객체');
eq(G.ALARM.day('메모: 9월2일~5일'), '', '날짜가 아닌 메모는 빈 값 (조용히 오늘로 찍지 않는다)');

console.log('\n[5] 정산월·주차 — 표기가 넷이고, 연도가 딴 칸에 있는 판도 있다');
eq(G.ALARM.ym('26년 7월'),  '2026-07', '「26년 7월」');
eq(G.ALARM.ym('26_08'),     '2026-08', '「26_08」');
eq(G.ALARM.ym('26년 02월'), '2026-02', '「26년 02월」');
eq(G.ALARM.ym('12','20년'), '2020-12', '「12」 + 년도 「20년」  ← 옛 K 행');
eq(G.ALARM.yw('26년 25W'),  '2026-W25', '「26년 25W」');
eq(G.ALARM.yw('21년4W'),    '2021-W04', '「21년4W」 (공백 없음)');
eq(G.ALARM.yw('26_32'),     '2026-W32', '「26_32」  ← P 는 W 표기가 없다');
eq(G.ALARM.yw('26년 04주'), '2026-W04', '「26년 04주」');
eq(G.ALARM.yw('26년 7월'),  '',         '월 표기를 주차로 읽지 않는다');
eq(B.alarmK.rows[0].fmonth, '2020-12',  'K 옛 행 fmonth (월별+년도 조합)');
eq(B.alarmK.rows[0].fweek,  '2020-W52', 'K 옛 행 fweek');
is(B.alarmP.rows[0].fmonth === '2025-01' && B.alarmP.rows[0].fweek === '2025-W01',
   'P 는 정산월·주차 열이 없어 발생일에서 채운다 (' + B.alarmP.rows[0].fweek + ')');

console.log('\n[6] 집계 대상 — 새로 발명하지 않고 시트가 적어 둔 답을 읽는다');
eq(B.alarmK.rows.filter(r=>r.cnt).length, 1, 'K 알람 — 「내부」만 (2행 중 1)');
eq(B.alarmP.rows.filter(r=>r.cnt).length, 1, 'P 알람 — 「포함」만 (2행 중 1 · 중복행 제외)');
eq(B.alarmH.rows.filter(r=>r.cnt).length, 1, 'H 알람 — 「내적」만 (2행 중 1)');
eq(B.abp2H.rows.length, 3,                    'H 올바 — 원본은 한 사건이 3줄');
eq(B.abp2H.rows.filter(r=>r.cnt).length, 0,   'H 올바 — Seq=1 이어도 외적이면 안 센다 (3줄 → 0건)');
eq(B.abp2P.rows.filter(r=>r.cnt).length, 1,   'P 올바 — 「포함」만');
eq(B.abp2K.rows.filter(r=>r.cnt).length, 1,   'K 올바 — 「내부」만 (2행 중 1 · 외부는 뺀다)');
// 알람과 올바이패스가 «같은» 규칙을 쓰는지 — 갈리면 설명 불가능한 표가 된다
is(B.abp2H.rows.filter(r=>r.cnt&&r.inout==='외적').length===0 &&
   B.alarmH.rows.filter(r=>r.cnt&&r.inout==='외적').length===0,
   '알람·올바 둘 다 외적을 안 센다 (규칙이 하나다)');
// 음성 대조 — Seq 규칙을 빼면 H 올바가 정확히 3배가 된다
{
  const naive = B.abp2H.rows.filter(r => !r.incl || r.incl === '포함').length;
  is(naive === 3 && B.abp2H.rows.filter(r=>r.cnt).length === 0,
     'Seq 규칙을 빼면 3건으로 부푼다 — 이 검사가 그걸 잡는다 (여기 픽스처는 전부 외적이라 0)');
}

console.log('\n[7] 설비 S/N 조인 키 — 표기가 사이트마다 다르다');
eq(G.ALARM.key('AAA0001'),   'AAA0001',  '「AAA0001」');
eq(G.ALARM.key('AAA-0001'),  'AAA0001',  '「AAA-0001」 → 하이픈 제거로 같아진다');
eq(G.ALARM.key('BBB-0101S'), 'BBB0101S', '「BBB-0101S」');
eq(G.ALARM.keyBase('BBB-0101S'), 'BBB0101', '채널 접미(S) 제거판 — 정확일치 실패 시의 2차');
eq(B.abp2K.rows[0].sn_key, 'AAA0001', 'K 올바 sn_key');

console.log('\n[8] 버리지 않는다 — SPEC 에 없는 열은 extra 로, 자료 아닌 줄만 건너뛴다');
is(B.alarmK.extra >= 1, 'K 알람 — SPEC 밖 열이 extra 로 (' + B.alarmK.extra + '개)');
is(B.alarmK.rows[0].extra && B.alarmK.rows[0].extra['담당자'] === undefined ||
   B.alarmK.rows[0].checker === '홍길동',
   'K 알람 — 담당자는 checker 로 잡힌다(화면엔 안 쓴다)');
eq(B.alarmK.rows.length, 2, 'K 알람 — 빈 줄은 행으로 세지 않는다');
eq(B.abp2K.rows.length, 2,  'K 올바 — 오른쪽 피벗표(머리글 없는 열)는 행을 늘리지 않는다');
is(B.abp2K.rows[1].occur_date === null,
   'K 올바 — 날짜 칸에 메모가 든 행은 날짜 없이 남는다 (버리지 않는다)');

console.log('\n[9] SPEC ↔ DDL — 만드는 컬럼이 표에 다 있는가');
{
  const sql = fs.readFileSync(ROOT+'/supabase/setup-10-alarm.sql','utf8');
  const cols = t => {
    const m = new RegExp('create table if not exists public\\.'+t+' \\(([\\s\\S]*?)\\n\\);').exec(sql);
    return new Set(m[1].replace(/--[^\n]*/g,'').split(/[,\n]/)
      .map(x=>x.trim().split(/\s+/)[0]).filter(Boolean));
  };
  [['sheet_alarm', B.alarmK],['sheet_allbypass', B.abp2H]].forEach(([tbl, b])=>{
    const have = cols(tbl);
    const need = Object.keys(b.rows[0]).filter(k => !have.has(k));
    is(!need.length, tbl + ' — 파서가 만드는 컬럼이 DDL 에 ' + (need.length ? '없음: '+need.join(', ') : '전부 있다'));
  });
  is(/'sheet_alarm','sheet_allbypass'/.test(sql), 'csv_upload_begin 허용목록에 두 표가 있다');
  is(/when 'sheet_alarm' then 'occur_date'/.test(sql), '_csv_datecol 에 sheet_alarm');
}

console.log('\n[10] 업로드 화면이 이 파서를 «그대로» 쓰는가 (흉내 내면 갈라진다)');
{
  const up = fs.readFileSync(ROOT+'/upload/index.html','utf8');
  is(/GST\.ALARM\.build\(/.test(up), 'upload 페이지가 GST.ALARM.build 를 호출한다');
  is(/kind:'xlsx'/.test(up) && /sheet_alarm/.test(up) && /sheet_allbypass/.test(up),
     'upload 페이지에 두 표가 등록돼 있다');
  /* 사이트별 «열 이름»을 문자열 리터럴로 들고 있으면 그것이 두 번째 사본이다.
     안내 문구에 개념을 적는 것은 괜찮다 — 코드가 이름으로 열을 찾는지를 본다. */
  const dupLit = ["'알람 유형'",'"알람 유형"',"'내적/외적'",'"내적/외적"',
                  "'All-ByPass Seq'",'"All-ByPass Seq"',"'대분류'","'구분기준'"]
                 .filter(x => up.indexOf(x) >= 0);
  is(!dupLit.length, 'upload 페이지에 사이트별 열 이름 리터럴이 없다 (정본은 core.js SPEC)'
     + (dupLit.length ? ' — ' + dupLit.join(' ') : ''));
}

console.log('\n[11] 「내/외」 필터 — 판정이 둘로 쪼개져 있고, Seq 중복 제거는 항상 걸리는가');
{
  /* dedup 과 inner 가 한 함수에 묶여 있으면 「전체」를 고른 순간 H 올바이패스가
     정확히 3배로 부푼다. 쪼개져 있는지, 그리고 화면이 dedup 을 «무조건» 거는지 본다. */
  is(typeof G.ALARM.dedup === 'function' && typeof G.ALARM.inner === 'function',
     'core — dedup(중복 줄) · inner(내부·내적) 가 따로 있다');
  const seq2 = {seq:'2', inout:'내적'};
  is(G.ALARM.dedup(seq2) === false && G.ALARM.inner(seq2) === true,
     'Seq=2 는 내적이어도 «같은 사건의 둘째 줄» 이라 dedup 이 막는다');
  eq(G.ALARM.counts({seq:'1', inout:'내적'}), true,  'Seq=1 + 내적 → 집계');
  eq(G.ALARM.counts({seq:'1', inout:'외적'}), false, 'Seq=1 + 외적 → 제외');
  eq(G.ALARM.counts({incl:'포함', inout:'외적'}), true,
     '시트가 「포함」이라 적었으면 그 답이 먼저다 (P 는 내적/제외 열이 정본)');

  const RP = fs.readFileSync(ROOT+'/report/index.html','utf8');
  { const kp = RP.indexOf('const krPick=x=>');
    const head = kp<0 ? '' : RP.slice(kp, kp+140).replace(/\s+/g,' ');
    is(head.replace(/ /g,'').indexOf('constkrPick=x=>{if(!GST.ALARM.dedup(x))returnfalse;')===0,
       'report — 어느 모드든 dedup 을 «먼저» 건다 (전체에서 3배 부풀기 차단)'); }
  is(/id="sl-inout"/.test(RP) && /외부·외적만/.test(RP) && /전체 \(내\+외\)/.test(RP),
     'report — 「내/외」 칸이 세 선택지로 있다');
  is(/F\.inout===''/.test(RP) || /return GST\.ALARM\.inner\(x\);/.test(RP),
     'report — 기본값은 내부·내적 (집계 대상)');
  /* 사용자 확정(v94): 표시는 분류(atype·ctype)가 아니라 시트 원문 열 —
     Alarm Message=«Alarm Comment» · 원인=«알람 실제원인» · 조치=«조치내용».
     분류로 갈음하는 코드가 되살아나면 TOP3 가 ROD·TEMP SENSOR 대신 PART·POWDER 를 보여준다. */
  is(/const krAsWk=x=>\(\{alarm:krMsg\(x\), phenom:x\.phenom, cause:x\.cause, action:x\.action,/.test(RP),
     'report — 원장 표시가 원문 열(Comment·실제원인·조치내용) 그대로다');
  /* Alarm Message 는 시트에 반드시 값이 있는 자리다(실측 P·H 공란 0 · K 는 249행이
     Comment 대신 「알람」 열에만 있다). 셋 다 비면 그건 시트가 아니라 적재 문제다. */
  is(/const krMsg=x=>\(x\.alarm\|\|''\)\.trim\(\)\|\|\(x\.alarmName\|\|''\)\.trim\(\)\|\|\(x\.atype\|\|''\)\.trim\(\)/.test(RP),
     'report — Comment → 알람 → 대분류 순으로 내려간다 (미기재가 나오면 적재 문제다)');
  is(/GST\._KR_COLS_A = GST\._KR_COLS_BASE\.concat\(\['alarm_name'\]\)/.test(fs.readFileSync(ROOT+'/assets/core.js','utf8')),
     'core — 알람 표만 alarm_name 을 받는다 (없으면 K 249행이 미기재로 보인다)');
  is(!/alarm:x\.atype/.test(RP) && !/cause:x\.cause\|\|x\.ctype/.test(RP),
     'report — 분류 열로 갈음하던 옛 매핑이 없다');
  is(/x\.stage==='BM'&&!\(D\.krOn&&x\.region==='국내'\)/.test(RP) && /D\.krBM\|\|\[\]/.test(RP),
     'report — 막대 클릭 리스트가 차트와 같은 모집단(국내=원장·수선실적 국내 BM 제외)');
  /* 「관리담당 기준」(v94) — 단지·라인을 설치현황/알람시트 어느 쪽으로 셀지 전환.
     접근자 두 개(krCampusOf·krLineOf) 말고 srcSite·campus 를 직접 고르는 코드가
     생기면 필터·분해·드릴이 서로 다른 단지를 보여준다. */
  /* 원장이 비면 옛 경로(수선실적 BM)로 돌아가는 것은 «의도»다 — 올리기 전에 0 이 되면 안 된다.
     문제는 그것이 조용했다는 것이다. 실측: sheet_alarm 0행인데 화면은 26건을 보여줬고,
     그 26건은 수선실적이라 알람유형 입력률 0.3% 탓에 「미기재」가 15건이었다.
     사용자는 원장을 보고 있다고 믿었고, 원인을 찾는 데 몇 시간이 들었다. */
  is(/window\._KRWHY\s*=\s*KRA\.length \? '' :/.test(RP),
     'report — 원장이 «왜» 비었는지(안 올림 / 못 읽음)를 구분해 남긴다');
  is(/if\(!KR_ON && window\._KRWHY\) _note = '⚠ 국내 알람 원장이 '/.test(RP),
     'report — 원장이 비면 「수선실적으로 세는 중」이라고 차트에 밝힌다');
  is(/\/upload\/ 에서 알람 시트를 올리면/.test(RP),
     'report — 무엇을 하면 되는지까지 적는다 (증상만 알리면 사용자가 코드를 의심한다)');
  /* ⚠⚠ 조회 열 목록 ↔ 실제 표 컬럼 대조. PostgREST 는 select 에 없는 열이 하나라도 있으면
     **전체를 거부한다** — 그 열만 비는 게 아니다. 실제 사고: 두 표가 조회 열을 한 벌로
     공유해 sheet_alarm 이 «column sheet_alarm.seq does not exist» 로 매번 통째로 실패했고,
     원장이 «비었다»고 판정돼 국내가 조용히 수선실적 BM 으로 계산됐다.
     여기서 DDL 을 직접 읽어 대조하므로, 열이 갈리면 즉시 실패한다. */
  { const SQL = fs.readFileSync(ROOT+'/supabase/setup-10-alarm.sql','utf8');
    const CORE2 = fs.readFileSync(ROOT+'/assets/core.js','utf8');
    const colsOf = (t) => {
      const m = new RegExp('create table if not exists public\\.'+t+'\\s*\\(([\\s\\S]*?)\\n\\);').exec(SQL);
      if(!m) return null;
      const out = new Set();
      m[1].split('\n').forEach(line => {
        line.replace(/--.*$/,'').split(',').forEach(part => {
          const nm = part.trim().split(/\s+/)[0];
          if(/^[a-z_][a-z0-9_]*$/.test(nm)) out.add(nm);
        });
      });
      return out;
    };
    const listOf = (name) => {
      const m = new RegExp('GST\\.'+name+'\\s*=\\s*GST\\._KR_COLS_BASE\\.concat\\(\\[([^\\]]*)\\]\\)').exec(CORE2);
      const base = /GST\._KR_COLS_BASE\s*=\s*\[([\s\S]*?)\];/.exec(CORE2);
      const parse = t => t.split(',').map(x=>x.trim().replace(/^'|'$/g,'')).filter(Boolean);
      return parse(base?base[1]:'').concat(m?parse(m[1]):[]);
    };
    const A = colsOf('sheet_alarm'), B = colsOf('sheet_allbypass');
    is(!!A && !!B, 'setup-10 에서 두 표의 컬럼 목록을 읽었다');
    [['_KR_COLS_A','sheet_alarm',A],['_KR_COLS_B','sheet_allbypass',B]].forEach(([n,t,set])=>{
      const want = listOf(n);
      const bad = want.filter(c => set && !set.has(c));
      is(want.length>10 && !bad.length,
         n+' 의 열이 전부 '+t+' 에 있다'+(bad.length?' — 없는 열: '+bad.join(', '):''));
    });
    /* «없는 열을 안 넣는다» 만으로는 부족하다 — seq 를 «빼기만» 하면 H 올바이패스가
       정확히 3배로 부푼다(한 사건이 Seq 1·2·3 세 줄이고 dedup 이 그 열을 본다).
       그래서 «올바 목록에 seq 가 있는지» 를 따로 단정한다. */
    is(listOf('_KR_COLS_B').indexOf('seq')>=0,
       '_KR_COLS_B 에 seq 가 있다 (없으면 H 올바이패스가 3배가 된다)');
    is(listOf('_KR_COLS_A').indexOf('alarm_name')>=0,
       '_KR_COLS_A 에 alarm_name 이 있다 (없으면 K 249행이 미기재)');
    // 음성 대조 — 옛 «한 벌 공유»가 되살아나면 이 둘 중 하나는 반드시 깨진다
    is(/GST\._KR_COLS_A\)/.test(fs.readFileSync(ROOT+'/report/index.html','utf8')) &&
       /GST\._KR_COLS_B\)/.test(fs.readFileSync(ROOT+'/report/index.html','utf8')),
       'report — 표마다 자기 열 목록으로 읽는다 (한 벌 공유가 아니다)');
    is(/seq\s+— 올바이패스에만/.test(CORE2) && /alarm_name\s+— 알람에만/.test(CORE2),
       'core — 왜 갈라야 하는지가 주석에 남아 있다'); }

  /* 업로드가 «두 반쪽»이라는 사실을 사용자가 알아서 기억하게 두지 않는다.
     실측 사고: 올바만 5,068행 올라가고 sheet_alarm 은 0행인 채로 지냈다. */
  { const UP = fs.readFileSync(ROOT+'/upload/index.html','utf8');
    is(/pair:'sheet_allbypass'/.test(UP) && /pair:'sheet_alarm'/.test(UP),
       'upload — 알람·올바가 서로를 짝으로 선언한다');
    is(/짝 표 「'\+t\.pairLabel\+'」 가 <b>0행<\/b>/.test(UP),
       'upload — 검사 화면이 짝 표가 비었음을 붉게 알린다');
    is(/⚠ 아직 반쪽입니다/.test(UP),
       'upload — 완료 뒤에도 남은 반쪽을 알린다 (끝난 줄 알고 돌아가지 않게)'); }
  is(/id="sl-krorg"/.test(RP), 'report — 「관리담당 기준」 칸이 있다');
  is(/krOrg:'inst'/.test(RP), 'report — 기본은 설치현황 기준 (정본)');
  is(/const krCampusOf=x=>F\.krOrg==='sheet'/.test(RP) && /const krLineOf\s*=x=>F\.krOrg==='sheet'/.test(RP),
     'report — 기준 전환이 접근자 두 개 한 곳에서만 갈린다');
  is(/campOk\(krCampusOf\(x\)\)&&lineOk\(krLineOf\(x\)\)/.test(RP),
     'report — 원장 필터가 접근자를 지난다');
  is(/const g=krCampusOf\(x\)\|\|'미상'/.test(RP),
     'report — 라인별 분해도 같은 접근자를 지난다 (직접 고르면 카드끼리 갈린다)');
  is(!/const g=x\.campus\|\|x\.srcSite\|\|'미상'/.test(RP),
     'report — 옛 직접 선택이 되살아나지 않았다');
  { const i=RP.indexOf('GST._KR_COLS');
    is(/'phenom'/.test(fs.readFileSync(ROOT+'/assets/core.js','utf8').match(/GST\._KR_COLS[\s\S]{0,300}?\];/)[0]),
       'core — 조회 열에 phenom(현상)이 있다 (빼면 드릴의 현상 칸만 조용히 빈다)'); }
}

console.log('\n' + (fail ? '❌ t-alarm ' + fail + ' 실패 / ' + (pass+fail) : '✅ t-alarm ' + pass + '/' + pass));
process.exit(fail ? 1 : 0);
