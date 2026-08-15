/* 전 페이지가 «같은 기본 필터 한 벌»을 쓰는지 소스 단위로 지킨다.

   왜 필요한가. 여덟 페이지가 사이드바를 각자 손으로 짜던 시절, 같은 대시보드인데
   페이지를 옮길 때마다 필터 항목·이름·동작이 달랐다(주간=구분/국가/고객사 ·
   고장=고객사/FAB/Line · 인원=칩 · 설치=Country/Customer). 국내 자료가 들어오자
   갈 곳 없는 값들이 고객사 목록으로 흘러들었고, 어느 페이지에서 무엇을 걸었는지
   알 수 없게 됐다. 한 곳(GST.filters)으로 모았으니 «다시 갈라지는 것»을 여기서 막는다.

   이 검사는 브라우저를 띄우지 않는다 — 소스에 무엇이 적혀 있는지만 본다.
   실제로 그리는지는 t-smoke 가 본다. 둘은 다른 것을 지킨다. */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };
const is  = (c, m) => c ? ok(m) : bad(m);

const PAGES = ['report', 'hr', 'fault', 'material', 'pm', 'scrubber', 'cip', 'tco'];
const SRC = {};
PAGES.forEach(p => { SRC[p] = fs.readFileSync(path.join(ROOT, p, 'index.html'), 'utf8'); });
const CORE = fs.readFileSync(path.join(ROOT, 'assets/core.js'), 'utf8');

console.log('\n[1] 여덟 페이지가 모두 GST.filters 를 마운트하는지');
PAGES.forEach(p => is(/GST\.filters\.mount\(/.test(SRC[p]), p + ' — GST.filters.mount'));

console.log('\n[2] 마운트마다 조직 축 접근자가 붙어 있는지 (없으면 그 칸이 「자료 없음」으로 굳는다)');
PAGES.forEach(p => {
  const m = SRC[p].match(/GST\.filters\.mount\(\{[\s\S]{0,900}?\}\s*\)\s*;/);
  const blk = m ? m[0] : '';
  const need = ['region:', 'op:', 'customer:', 'campus:', 'line:'];
  const miss = need.filter(k => blk.indexOf(k) < 0);
  is(!miss.length, p + ' — 축 ' + (miss.length ? '없음: ' + miss.join(' ') : '전부 선언'));
});

console.log('\n[3] 페이지가 기본 필터를 자기 술어로 다시 걸지 않는지 (걸면 두 벌이 갈라진다)');
/* report 만 예외다 — 술어 네 벌(entOk·fINST·okCF·okP)과 QBR 표·PPT 수집기가 전부 페이지의 F 를
   보고 있어, 원본은 GST.filters 로 옮기되 읽는 쪽은 그대로 두고 syncCommon 이 값을 복사한다.
   pass 를 쓰든 syncCommon 을 쓰든 «정본이 GST.filters 하나» 라는 점은 같다. */
PAGES.forEach(p => is(/GST\.filters\.pass\(/.test(SRC[p]) ||
  (p === 'report' && /function syncCommon\(\)\{ const G=GST\.filters\.F;/.test(SRC[p])),
  p + ' — 기본 필터의 정본이 GST.filters 다'));

console.log('\n[4] 페이지 고유 사이드바에 조직 필터가 되살아나지 않았는지');
// 삭제한 것들: 사이트/Country/Customer/FAB/라인 셀렉터. id 로 남아 있으면 두 벌이 된다.
const GONE = {
  report:   ['sl-customer', 'sl-region'],
  hr:       ['sl-site', 'sl-org'],
  scrubber: ['sl-country', 'sl-customer'],
  cip:      ['sl-site'],
  tco:      ['sl-cust', 'sl-line'],
  pm:       ['fSite', 'fLine'],
  fault:    ['sl-customer', 'fabBox'],
  material: ['sl-customer']
};
Object.entries(GONE).forEach(([p, ids]) => {
  const live = ids.filter(id => SRC[p].indexOf('"' + id + '"') >= 0 || SRC[p].indexOf("'" + id + "'") >= 0);
  is(!live.length, p + ' — 되살아난 조직 필터 ' + (live.length ? live.join(' · ') : '없음'));
});

console.log('\n[5] core.js — 「날짜 축이 없는 페이지는 기간 칸을 잠근다」');
is(/const hasD\s*=\s*!!\(CFG\.get\|\|\{\}\)\.date/.test(CORE), 'refresh 가 date 접근자 유무를 본다');
is(/if\(\(F\.dtFrom \|\| F\.dtTo\) && g\.date/.test(CORE), 'pass 가 접근자 없으면 기간 조건을 건너뛴다');
// pass(x,{noDate:1}) — 기간만 빼고 축은 그대로. 설치현황의 «미가동 목록»이 이걸 쓴다.
is(/!\(opt && opt\.noDate\)/.test(CORE), 'pass 가 기간만 건너뛰는 opt.noDate 를 받는다');
// 음성 대조 — 접근자가 없는데 기간 조건을 걸면 화면이 통째로 빈다(예전 동작)
{
  const oldStyle = /if\(F\.dtFrom \|\| F\.dtTo\)\{\s*\n\s*const d = dstr\(g\.date \? g\.date\(x\) : ''\);/.test(CORE);
  is(!oldStyle, '옛 동작(접근자 없이도 기간을 거는 코드)이 남아 있지 않다');
}

console.log('\n[6] 목록에서 거르는 값 — 「고객사가 아닌 것」·「그 축의 값이 아닌 것」');
is(/GST\.FILT_DROP_CUST\s*=/.test(CORE), 'core 에 FILT_DROP_CUST 가 있다');
is(/GST\.FILT_DROP_ORG\s*=/.test(CORE), 'core 에 FILT_DROP_ORG 가 있다');
{
  const cust = /GST\.FILT_DROP_CUST\s*=\s*\/\^\(([^)]*)\)/.exec(CORE);
  const body = cust ? cust[1] : '';
  ['본사', '칠러', 'CHILLER'].forEach(v =>
    is(body.split('|').indexOf(v) >= 0, 'FILT_DROP_CUST 에 ' + v));
}
PAGES.filter(p => p !== 'fault' && p !== 'material').forEach(p =>
  is(/drop:\{[^}]*customer:\s*GST\.FILT_DROP_CUST/.test(SRC[p]) || !/GST\.filters\.mount/.test(SRC[p]),
     p + ' — 고객사 목록에 drop 을 걸었다'));

console.log('\n[7] 국내에는 Basic·Veteran 과정이 없다 — 미이수가 아니라 비대상');
const HR = SRC.hr;
is(/function hasCorp\(p\)\s*\{\s*return p\.region!=='국내';/.test(HR),
   'hr — 적용 여부 판정(hasCorp)이 한 곳에 있다');
is(/function clsB\(p\)\{ return hasCorp\(p\)\?/.test(HR) && /:'비대상'/.test(HR),
   'hr — clsB 가 국내를 「비대상」으로 낸다');
is(/function clsV\(p\)\{ return hasCorp\(p\)\?/.test(HR),
   'hr — clsV 도 같은 규칙');
is(/const corpPop=f\.filter\(p=>p\.onsite&&p\.join&&hasCorp\(p\)\)/.test(HR),
   'hr — 법인 KPI 모집단에서 국내를 뺀다');
is(/const corpE=epop\.filter\(hasCorp\)/.test(HR) && /if\(corpE\.length\)\{/.test(HR),
   'hr — 대상이 없으면 Basic·Veteran 막대를 아예 그리지 않는다');
is(/const c=d\.cols\[course\]/.test(HR),
   'hr — 드릴다운이 열 번호가 아니라 그 열 목록을 따라간다');
is(/tg:\(p,E\)=>hasCorp\(p\)&&!sixAt\(p,E\)/.test(HR),
   'hr — 이수 추이의 법인 대상에도 같은 규칙');
is(/eduPlanH1/.test(SRC.report) && /Scrubber Lv\.2','Scrubber Lv\.3'/.test(SRC.report),
   'report — 교육 계획 머리글이 잡힌 인원을 따라간다');

console.log('\n[7-1] 설치현황 — 「집계 기준」(챔버/대수)이 한 곳(chW)만 지나는지');
{
  /* KPI·막대·표·교차분석이 전부 chW 를 지나야 «KPI 는 챔버인데 막대는 대수» 가 안 된다.
     그리고 단위 글자가 기준을 따라가야 «1,490 ch» 같은 거짓말이 안 나온다. */
  const SC = SRC.scrubber;
  is(/let BASIS='ch'/.test(SC), 'scrubber — 집계 기준 상태(BASIS)가 있다');
  is(/const chW=r=>BASIS==='unit'\?1:/.test(SC),
     'scrubber — 기준이 chW 한 곳에서만 갈린다 (두 벌이면 카드끼리 합이 안 맞는다)');
  {
    // applyLang 안에서 data-i 재적용 «뒤에» applyBasisUnit 이 불려야 한다
    const li = SC.indexOf('function applyLang()');
    const blk = li<0 ? '' : SC.slice(li, li+700);
    const di = blk.indexOf("querySelectorAll('[data-i]')");
    const bu = blk.indexOf('applyBasisUnit()');
    is(/function applyBasisUnit\(\)/.test(SC) && di>=0 && bu>di,
       'scrubber — 언어 전환 뒤에도 단위 글자를 다시 씌운다 (data-i 가 되돌려 놓는다)');
  }
  is(/id="sl-basis"/.test(SC), 'scrubber — 「집계 기준」 칸이 있다');
}

console.log('\n[8] 비율 지표의 «분모» 배열에도 조직 축이 실려 있는지');
/* 고장분석의 ALLW_ROWS 는 설비 BM율·좌우 편중의 분모다. 여기에 구분·운영단위·단지가
   안 실려 있으면 구분을 고르는 순간 분모가 0이 되어 표가 조용히 빈다(실제로 그랬다). */
{
  const m = /ALLW_ROWS=fetched\.rows[\s\S]{0,1600}?\}\)\)\.filter/.exec(SRC.fault);
  const blk = m ? m[0] : '';
  ['region:', 'op:', 'campus:', 'customerN:'].forEach(k =>
    is(blk.indexOf(k) >= 0, 'fault ALLW_ROWS 에 ' + k.replace(':', '')));
}
{
  // PM 은 SCHED·DONE_HIST·원본행 셋이 같은 이름을 달아야 한다
  is(/function rowOrg\(r\)/.test(SRC.pm), 'pm — rowOrg 한 곳에서 조직 축을 만든다');
  is((SRC.pm.match(/rowOrg\(/g) || []).length >= 4, 'pm — 세 배열 모두 rowOrg 를 쓴다');
}
{
  // CIP 는 조직 축이 시트에 없어 설치현황을 조인해 얻는다
  is(/function buildInstIndex\(rows\)/.test(SRC.cip), 'cip — 설치현황 색인을 만든다');
  is(/x\.campus\s*=\s*\(o&&o\.campus\)\|\|x\.site/.test(SRC.cip),
     'cip — 조인 실패 행을 버리지 않고 자기 사이트로 폴백한다');
}

console.log('\n' + (fail ? '❌ t-filters ' + fail + ' 실패 / ' + (pass + fail)
                         : '✅ t-filters ' + pass + '/' + pass));
process.exit(fail ? 1 : 0);
