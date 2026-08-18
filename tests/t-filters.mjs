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
/* 상세 명단·드릴 표가 clsB/clsV 를 직접 부르면 국내가 「비대상」으로만 가득 찬다
   (실측 399명 전원). 「그 사람의 1·2단계」를 묻는 접근자만 쓰고 머리글도 따라간다. */
is(/function eduCls1\(p\)\{ return hasCorp\(p\)\?clsB\(p\):clsL2\(p\); \}/.test(HR) &&
   /function eduCls2\(p\)\{ return hasCorp\(p\)\?clsV\(p\):clsL3\(p\); \}/.test(HR),
   'hr — 사람마다 적용되는 두 과정을 접근자 두 개가 정한다');
is(/function eduNames\(list\)/.test(HR) && /'Scrubber Lv\.2','Scrubber Lv\.3'/.test(HR),
   'hr — 표 머리글이 잡힌 인원을 따라간다');
is(/id="thEdu1"/.test(HR) && /id="thEdu2"/.test(HR),
   'hr — 상세 명단 머리글에 갈아끼울 자리가 있다');
is(!/const bTag=d\.edu\?'<span class="tag '\+tagB\(clsB\(d\)\)/.test(HR),
   'hr — 상세 명단이 clsB 를 직접 부르던 옛 코드가 없다');
is(/eduPlanH1/.test(SRC.report) && /Scrubber Lv\.2','Scrubber Lv\.3'/.test(SRC.report),
   'report — 교육 계획 머리글이 잡힌 인원을 따라간다');
/* KPI 카드도 같은 규칙을 지나야 한다. 'bdate'·'vdate' 를 박아 두었더니 국내만 걸면
   완료율이 늘 0% 였다 — 바로 아래 계획 표·cEdu 차트는 eduKey 를 지나고 있어서
   같은 화면의 카드끼리 다른 답을 냈다. */
is(/const d1=eLv1\.filter\(x=>_dOf\(x,eduKey\(x,1\)\)\)\.length,/.test(SRC.report) &&
   /d2=eLv2\.filter\(x=>_dOf\(x,eduKey\(x,2\)\)\)\.length;/.test(SRC.report),
   'report — 교육 완료율 KPI 도 eduKey 를 지난다');
is(!/_dOf\(x,'bdate'\)/.test(SRC.report) && !/_dOf\(x,'vdate'\)/.test(SRC.report),
   'report — 과정 이름을 박아 둔 옛 판정이 없다');
is(/_eCourse/.test(SRC.report) && /'Scrubber Lv\.3'/.test(SRC.report),
   'report — KPI 이름표도 잡힌 인원을 따라간다 (Lv.3 을 세면서 Veteran 이라 하지 않는다)');

const AXES7 = ['region','op','div','customer','campus','line','team'];
console.log('\n[7-5] 사업부 축 — 국내 설치현황에만 있는 열 (v96)');
{
  is(/div:new Set\(\)/.test(CORE) || /div:''/.test(CORE), 'core — F 에 div 축이 있다');
  /* 축 순서는 사용자가 확정한다(v111): 구분 → 팀 → 운영단위 → 고객사 → 사업부 → 단지 → 라인.
     여덟 페이지가 «한 줄로, 같은 순서»를 쓴다 — 페이지마다 칸의 생김새가 달라지는 것 자체가
     「필터가 페이지마다 다르다」로 읽힌다.
     ⚠ 이 배열은 순서에 의미가 «없는» 자리에서도 쓰인다(pass 의 AND 루프 · 종속 · AV 열
       인덱스). 그래서 순서를 바꿔도 숫자는 한 자리도 안 움직인다 — 화면 순서만 바뀐다. */
  /* 축 목록이 «한 곳»(AXES)에서 나와야 종속·사이드바·술어가 같은 순서를 본다.
     예전에는 세 곳에 손으로 적혀 있어, 하나만 고치면 조용히 갈라졌다. */
  is(/const AXES = \['region','team','op','customer','div','campus','line'\]/.test(CORE),
     'core — 축 순서가 AXES 한 곳에 있다 (구분→팀→운영단위→고객사→사업부→단지→라인)');
  is(/const chk = AXES;/.test(CORE), 'core — 종속(cascading)이 같은 목록을 쓴다');
  /* 사이드바 «목록»도 AXES 한 곳에서 나와야 한다. 따로 두면 축이 늘 때 한쪽만 고쳐져
     그 칸이 조용히 사라진다 — v107 의 GROUPS 가 그 위험을 안고 있었다. */
  is(/AXES\.map\(function\(k\)\{ return \(MULTI\[k\]\?msel:sel\)/.test(CORE),
     'core — 사이드바를 AXES 로 그린다 (목록이 두 벌이 아니다)');
  is(!/GROUPS/.test(CORE), 'core — 묶음 머리글(설비/인원 기준)은 없앴다 — 한 줄 한 순서');
  /* 축별 조건을 손으로 쓰면 하나만 빠뜨려도 그 축이 조용히 «전체»가 된다.
     그리고 다중선택에서는 `if(F.x)` 가 빈 Set 에도 참이라 반드시 hasK 를 지나야 한다. */
  is(/if\(hasK\(k\) && !axOk\(k, x\)\) return false;/.test(CORE),
     'core — 모든 축이 hasK+axOk 한 벌을 지난다 (loose 도 axOk 안에 있다)');
  is(!/if\(F\.(region|op|div|customer|line|team)\s+&&/.test(CORE),
     'core — 축을 문자열처럼 진위 검사하면 안 된다 (빈 Set 은 truthy 다)');
  /* ⚠ 해외 설치현황에는 사업부 열이 아예 없다. loose 가 없으면 사업부를 고르는 순간
     해외 설비가 통째로 사라진다 — 운영단위가 인원현황에서 겪은 것과 같은 자리다. */
  is(/loose:\{ div:1 \}/.test(SRC.scrubber), 'scrubber — 사업부를 loose 로 선언했다');
  is(/div:r=>String\(\(CI\.div>=0\?r\[CI\.div\]:''\)\|\|''\)\.trim\(\)/.test(SRC.scrubber),
     'scrubber — 사업부 접근자가 열이 없을 때도 안 죽는다');
  is(/div:x=>x\.div/.test(SRC.report), 'report — 사업부 접근자가 있다');
  /* ⚠ 문자열 통째로 견주지 않는다 — 주간현황은 loose 축이 다섯이다(v110: rows() 가
     실적·설치·인원 세 패밀리를 섞어 넘기므로 패밀리마다 없는 축이 여럿이다).
     통째 비교로 두면 축이 하나 늘 때마다 «고쳐야 통과하는» 검사가 된다. */
  is(/loose:\{[^}]*\bdiv:1\b/.test(SRC.report), 'report — 사업부를 loose 로 선언했다');
}

console.log('\n[7-6] rows() 가 실어 보낸 축을 get: 이 «꺼내 보는가» (v96)');
{
  /* 실제로 겪은 결함: report 의 rows() 는 사업부를 실어 보내는데 get: 에 div 가 없어
     목록이 언제나 비었다 — 화면에는 「전체 (자료 없음)」이라 적히고, 표에는 7,172행이
     들어 있었다(실측). 빈 칸은 «자료가 없다»로 읽히므로 사용자는 업로드를 의심한다.
     소스만 봐서 잡을 수 있는 결함인데, 여덟 페이지 중 scrubber 만 검사하고 있었다.

     판정: mount 블록 안에서 rows() 가 `<축>:` 을 담아 보내면 get: 에도 `<축>:` 이 있어야 한다.
     반대(get 에만 있고 rows 에 없는 것)는 정상이다 — 페이지가 직접 행을 넘기는 꼴이 있다. */
  const AX = ['region', 'op', 'customer', 'div', 'campus', 'line', 'team'];
  PAGES.forEach((p) => {
    const i = SRC[p].indexOf('GST.filters.mount(');
    if (i < 0) { is(false, `${p} — GST.filters.mount 를 찾지 못했다`); return; }
    // mount( … ) 한 덩어리를 괄호 균형으로 떼어 낸다
    let d = 0, end = i;
    for (let k = SRC[p].indexOf('(', i); k < SRC[p].length; k++) {
      if (SRC[p][k] === '(') d++;
      else if (SRC[p][k] === ')') { d--; if (!d) { end = k; break; } }
    }
    const blk = SRC[p].slice(i, end + 1);
    const gi = blk.indexOf('get:');
    if (gi < 0) { is(false, `${p} — mount 에 get: 이 없다`); return; }
    /* get:{…} «한 덩어리»만 떼어 낸다. 뒤에 오는 loose:{div:1}·drop:{…} 까지 포함하면
       접근자가 없어도 있는 것으로 세어 검사가 통과해 버린다(음성 대조로 실제로 겪었다). */
    let gd = 0, gEnd = gi;
    for (let k = blk.indexOf('{', gi); k < blk.length; k++) {
      if (blk[k] === '{') gd++;
      else if (blk[k] === '}') { gd--; if (!gd) { gEnd = k; break; } }
    }
    const rowsPart = blk.slice(0, gi), getPart = blk.slice(gi, gEnd + 1);
    const missed = AX.filter((a) => new RegExp('[{,]\\s*' + a + '\\s*:').test(rowsPart)
                                 && !new RegExp('[{,]\\s*' + a + '\\s*:').test(getPart));
    is(!missed.length, `${p} — rows() 가 보낸 축을 get: 이 전부 읽는다`
       + (missed.length ? `  ⚠ 빠짐: ${missed.join(', ')}` : ''));
  });
}

console.log('\n[7-7] 축을 목록에 «내주면» 거르기까지 해야 한다 (v108)');
{
  /* 실제로 겪은 결함(사용자 보고). 사업부를 사이드바에 내주고 목록도 제대로 떴는데,
     골라도 KPI·차트·표가 한 자리도 안 움직였다. 원인은 단순하다 — 주간현황만
     술어를 «손으로» 짜는데(pass() 를 안 쓴다) 어느 술어에도 div 가 없었다.
     칩에는 「사업부: MEMORY」가 뜨니 사용자는 걸린 줄 알고 숫자를 읽는다.
     이것은 CLAUDE.md 가 경고하는 그 자리다 — 「새 축을 추가하면 전부 손댄다.
     한 곳만 빠져도 화면의 카드들이 서로 다른 모집단을 보여준다.」

     판정 둘:
       ① pass() 를 안 쓰는 페이지는, get: 이 내준 축이 술어 쪽에 «호출»로 나와야 한다.
       ② 축 판정 헬퍼를 정의만 하고 안 부르면 ①을 통과해 버린다 → 호출 여부도 본다. */
  const AX = ['region', 'op', 'customer', 'div', 'campus', 'line', 'team'];
  /* ⚠ 주석을 먼저 걷어낸다. 처음 이 검사를 쓸 때 주간현황의 «GST.filters.pass() 한 줄로»
     라는 설명 주석이 그대로 걸려, 정작 pass() 를 안 쓰는 페이지가 「쓴다」로 통과했다 —
     검사가 초록불을 거짓말한 것이다. 판정은 «코드에 무엇이 있나»여야 한다. */
  const noCmt = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const CODE = {}; PAGES.forEach(p => { CODE[p] = noCmt(SRC[p]); });
  PAGES.forEach((p) => {
    if (/GST\.filters\.pass\(/.test(CODE[p])) {
      ok(p + ' — pass() 로 일곱 축을 한 루프로 거른다');
      return;
    }
    const i = CODE[p].indexOf('GST.filters.mount(');
    let d = 0, end = i;
    for (let k = CODE[p].indexOf('(', i); k < CODE[p].length; k++) {
      if (CODE[p][k] === '(') d++;
      else if (CODE[p][k] === ')') { d--; if (!d) { end = k; break; } }
    }
    const blk = CODE[p].slice(i, end + 1);
    const gi = blk.indexOf('get:');
    let gd = 0, gEnd = gi;
    for (let k = blk.indexOf('{', gi); k < blk.length; k++) {
      if (blk[k] === '{') gd++;
      else if (blk[k] === '}') { gd--; if (!gd) { gEnd = k; break; } }
    }
    const getPart = blk.slice(gi, gEnd + 1);
    const offered = AX.filter(a => new RegExp('[{,]\\s*' + a + '\\s*:').test(getPart));
    /* 축 이름이 «판정 호출»에 실려 있는가. axOkF·campOk·divOk 처럼 이름이 달라도
       결국 GST.filters.hit/hitL 에 축 이름을 넘기므로 거기서 잡힌다. */
    const miss = offered.filter(a =>
      !new RegExp("(GST\\.filters\\.hitL?|axOkF)\\(\\s*'" + a + "'").test(CODE[p]));
    is(!miss.length, p + ' — 내준 축을 술어가 전부 본다'
       + (miss.length ? '  ⚠ 안 거르는 축: ' + miss.join(', ') : ''));

    /* ② 정의만 하고 안 부르면 위 검사를 통과한다 — 실제 호출 수를 센다. */
    const helpers = [...CODE[p].matchAll(/const (\w+)\s*=\s*\(?[^=]*\)?\s*=>\s*(?:GST\.filters\.hitL?|axOkF)\(\s*'(\w+)'/g)];
    helpers.forEach(([, name, ax]) => {
      const calls = (CODE[p].match(new RegExp('\\b' + name + '\\(', 'g')) || []).length;
      is(calls >= 1, p + ' — ' + name + '() 를 정의만 하지 않고 실제로 부른다 ('
         + ax + ' · 호출 ' + calls + '곳)');
    });
  });

  /* 사업부의 세 자료 계통 — 실적(entOk) · 국내 원장(krOk) · 설치현황(fINST).
     하나만 빠져도 그 카드만 전사 숫자를 그린다. 어느 것이 빠졌는지 이름으로 말한다. */
  const R = CODE.report;
  const body = (name, re) => { const m = R.match(re); return m ? m[0] : ''; };
  is(/const entOk=[\s\S]{0,400}?divOk\(x\.div\)/.test(R),
     'report — 실적(entOk)이 사업부를 본다');
  is(/const krOk=[\s\S]{0,400}?divOk\(x\.div\)/.test(R),
     'report — 국내 알람·올바 원장(krOk)이 사업부를 본다');
  is(/const fINST=INST\.filter\([\s\S]{0,700}?divOk\(/.test(R),
     'report — 설치현황(fINST)이 사업부를 본다');
  /* 원장에는 사업부 열이 없다 — 설비 S/N 으로 설치현황에서 끌어온다(사용자 지적).
     조인이 없으면 krOk 가 늘 빈 값을 보고 loose 로 전부 통과한다. */
  is(/function krJoin\([\s\S]{0,900}?div:String\(\(CI\.div>=0/.test(R),
     'report — krJoin 이 설치현황에서 사업부를 조인해 온다 (원장에는 없는 열)');
  is(/x\.div=\(o&&o\.div\)\|\|''/.test(R),
     'report — 조인이 안 된 행은 빈 값 그대로 둔다 (버리면 건수가 반으로 준다)');
  is(/axHas\('div'\)/.test(R), 'report — 활성 필터 칩에도 사업부가 뜬다');
  /* 실적의 사업부는 S/N 조인으로 얻은 값이라, 못 붙은 행은 loose 로 통과한다.
     조인이 낮으면 「사업부를 바꿔도 실적이 별로 안 준다」가 되는데 그 이유가 화면에
     없으면 필터가 고장 난 것으로 읽힌다 — 주석은 「밝힌다」였는데 실제로는 기록만 했다. */
  is(/window\._DIVJOIN\.hit < window\._DIVJOIN\.n/.test(R),
     'report — 사업부 조인율을 화면에 적는다 (기록만 하고 안 보여주면 안 된다)');
  is(/사업부조인 '\+window\._DIVJOIN\.hit/.test(R),
     'report — 몇 행이 붙었는지 숫자로 적는다');
}

console.log('\n[7-4] 단지 축에 고객사 이름이 섞이지 않는지 (v96)');
{
  /* 인원 계열의 구분 축은 단지다. 단지·FAB 이 둘 다 비면 예전에는 고객사까지 내려가
     「SAMSUNG」 이 단지 막대로 섰다(실측 14명) — 한 축에 두 차원이 섞인 것이다.
     버리지도 않는다(합계에서 조용히 사라진다) → 「미배치」로 세운다. */
  is(/const _grpRaw=x=>x\.campus\|\|x\.fab\|\|'미배치';/.test(SRC.report),
     'report — 단지 축이 FAB 까지만 내려가고 그다음은 미배치다');
  is(!/_grpRaw=x=>x\.campus\|\|x\.fab\|\|x\.custB/.test(SRC.report),
     'report — 고객사까지 내려가던 옛 폴백이 없다');
}

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

console.log('\n[7-2] 국내 알람의 월·주차는 «발생일»이 기본이다');
{
  /* 시트의 정산월은 삼성 정산 기준이라 달력과 다르다(실측 H 알람 173행 · H3 8월만 봐도
     정산월 96 ↔ 발생일 31). 대만 막대는 발생일로 서 있으므로 원장만 정산월로 세면
     한 차트 안에서 두 축이 섞인다. 기본이 조용히 정산월로 되돌아가는 것을 막는다. */
  const R = SRC.report;
  is(/krBasis:'occur'/.test(R), 'report — F.krBasis 기본값이 occur');
  is(/id="sl-krbasis"/.test(R), 'report — 「월·주차 기준」 칸이 있다');
  {
    const i = R.indexOf('id="sl-krbasis"');
    const blk = i < 0 ? '' : R.slice(i, i + 400);
    is(blk.indexOf('value="occur"') >= 0 && blk.indexOf('value="occur"') < blk.indexOf('value="fiscal"'),
       'report — 첫 옵션(=기본 선택)이 발생일이다');
  }
  is(/const krKeyOf=\(x,u\)=>\{/.test(R) && /keyOfDate\(new Date\(x\.d\+'T00:00:00Z'\),u\)/.test(R),
     'report — 발생일 모드가 화면의 주차 규약(keyOfDate/isoW)을 쓴다');
  // 음성 대조 — 정산월을 직접 읽는 옛 구간 키가 남아 있으면 두 벌이 갈라진다
  is(!/\(\(u==='w'\)\?x\.fw:x\.fm\)===P\[i\]\.key/.test(R),
     'report — 라인별 분해도 krKeyOf 를 지난다 (fm·fw 직접 읽기 없음)');
  is(/if\(F\.krBasis==='fiscal'\) return \(u==='w'\)\?x\.fw:x\.fm;/.test(R),
     'report — 정산 대조용 시트 기준도 남아 있다');
}

console.log('\n[7-3] 단지는 여러 개를 동시에 고를 수 있다 (Set) — 직접 비교가 되살아나지 않았는지');
{
  /* 같은 설비의 단지가 자료마다 갈린다(알람 시트 H3 ↔ 설치현황 H4, 실측 39건). 그래서
     단지만 다중선택이다. 위험은 조용하다 — Set 을 `===` 로 비교하면 언제나 false 라
     «필터를 걸면 화면이 통째로 빈다». 페이지가 다시 그렇게 쓰는 것을 여기서 막는다. */
  /* v106 — 일곱 축이 전부 다중선택이다. 국내 설비는 «관리주체(사업부)»에 따라 소속 단지가
     갈려서, 하나씩만 고를 수 있으면 «그 사업부 설비가 실제로 어디 있나»를 볼 수가 없다. */
  is(/const MULTI = \{ region:1, op:1, div:1, customer:1, campus:1, line:1, team:1 \}/.test(CORE),
     'core — 일곱 축이 전부 다중선택이다');
  is(/const F = \{ region:new Set\(\), op:new Set\(\), div:new Set\(\), customer:new Set\(\),/.test(CORE),
     'core — F 의 축이 전부 Set 이다');
  is(/campus:new Set\(\)/.test(CORE), 'core — F.campus 가 Set 이다');
  is(/const hitK = \(k, v\) => MULTI\[k\]/.test(CORE),
     'core — 「걸리나」 판정이 hitK 한 곳만 지난다');
  is(/o\[k\]=MULTI\[k\]\?Array\.from\(F\[k\]\):F\[k\]/.test(CORE),
     'core — 저장은 배열로 눕힌다 (JSON.stringify(Set)==="{}")');
  /* 복원은 «비우고 다시 채운다». `F[k]=new Set(...)` 로 갈아끼우면 다중선택 박스의
     핸들러가 옛 Set 을 든 채로 남아 첫 항목만 체크되고 두 번째부터 안 먹는다 —
     에러 없이. 주간현황은 mount 를 5번 부르므로 반드시 그 상태가 된다. */
  is(/F\[k\]\.clear\(\); o\[k\]\.forEach\(function\(v\)\{ F\[k\]\.add\(v\); \}\)/.test(CORE),
     'core — 복원이 Set 을 갈아끼우지 않고 제자리에서 채운다');
  is(!/F\[k\]=new Set\(o\[k\]\)/.test(CORE),
     'core — 옛 복원(F[k]=new Set)이 되살아나지 않았다');
  is(/const st = \(GST\._msel && GST\._msel\[id\]\) \|\| \{ sel: sel, cb: onChange \}/.test(CORE),
     'core — 클릭 핸들러가 「지금의」 Set 을 GST._msel 에서 꺼낸다');
  /* 이름만 보고 «있다»고 하지 않는다 — set 은 본문이 setK 로 빠져도 되지만,
     그 본문이 MULTI 축을 Set 으로 다루는 것은 그대로여야 한다(문자열이 되면 .has 가 죽는다). */
  is(/(set: function\(k, v\)\{|set: setK,)/.test(CORE) && /toggle: function\(k, v\)\{/.test(CORE) && /hit: function\(k, v\)\{/.test(CORE),
     'core — 페이지가 쓸 안전한 API(set·toggle·hit)가 있다');
  is(/if\(MULTI\[k\]\)\{ F\[k\]\.clear\(\); \(Array\.isArray\(v\)\?v:\(v\?\[v\]:\[\]\)\)\.forEach/.test(CORE),
     'core — set 본문이 다중 축을 여전히 Set 으로 채운다');
  /* 같은 표 안에서 연속 공백이 흔들린다(실측 `GST CHINA(WUHAN)··SCRUBBER`). 안 눕히면
     한 법인이 목록에 두 줄로 떠서, 어느 쪽을 고르느냐에 따라 설비가 반씩 갈린다. */
  is(/String\(v\)\.replace\(\/\\s\+\/g,' '\)\.trim\(\)/.test(CORE),
     'core — 축 값의 연속 공백을 눕힌다 (v98 「남은 문제 ③」)');
  /* localStorage 한도는 5~10MB 인데 수선실적은 푼 JSON 이 374MB 다 — stringify 자체가
     헛돈이고 setItem 은 반드시 던진다. 큰 표는 시도조차 하지 않아야 한다. */
  is(/GST\.CACHE_MAX_ROWS/.test(CORE) && /rows\.length > GST\.CACHE_MAX_ROWS/.test(CORE),
     'core — 큰 표는 localStorage 캐시를 시도하지 않는다');
  /* 사이드바 버튼이 «자동 10분» 이라고 적혀 있는데 실제 주기는 30분이었다. */
  is(!/⟳ 자동 10분/.test(CORE) && /자동 '\+GST\.AR_MIN\+'분/.test(CORE),
     'core — 자동 새로고침 라벨이 실제 주기를 말한다');
  // 음성 대조 — 페이지가 campus 를 문자열처럼 다루면 조용히 전부 false 가 된다
  // 주석은 뺀다 — 「이렇게 쓰지 말 것」이라 적어 둔 설명이 검사에 걸리면 안 된다
  const nocom = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
  /* ⚠ v106 에서 «일곱 축 전부» 다중선택이 됐다. 예전에는 이 검사가 campus 만 봤고,
     그 사이 fault·material·cip 이 `GST.filters.F.line=(F.line===v)?'':v` 로 라인 드릴을
     짜 두었다 — 검사가 못 보는 축이라 통과했고, 다중이 되는 순간 Set 이 문자열로 바뀌어
     그다음 .has 가 TypeError 로 죽는다(화면이 통째로 빈다). 이제 전 축을 본다. */

  PAGES.forEach(p => {
    const src = nocom(SRC[p]);
    const hits = AXES7.filter(k =>
         new RegExp('[=!]==\\s*F\\.'+k+'\\b|F\\.'+k+'\\s*[=!]==').test(src)
      || new RegExp('GST\\.filters\\.F\\.'+k+'\\s*=[^=]').test(src));
    const bad = hits.length || /GST\.filters\.F\[(kk|k|K)\]\s*=[^=]/.test(src);
    is(!bad, p + ' — 축을 문자열로 직접 비교·대입하지 않는다' + (hits.length?(' ('+hits.join(',')+')'):''));
  });
  is(/const campOk=\(v\)=>GST\.filters\.hit\('campus',v\)/.test(SRC.report),
     'report — 단지 판정이 campOk 한 곳만 지난다');
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

/* ══════════════════════════════════════════════════════════════
   [9] 전 축 다중선택 — 소스가 아니라 «동작»으로 (v106)
   국내 설비는 관리주체(사업부)에 따라 소속 단지가 갈린다. 하나씩만 고를 수 있으면
   «그 사업부 설비가 실제로 어디 있나»를 볼 수가 없다 — 그래서 일곱 축 전부 다중이다.
   ⚠ 소스 검사로는 «정말로 두 개가 동시에 걸리는지»를 못 본다. 실제로 돌려 본다.
   ══════════════════════════════════════════════════════════════ */
console.log('\n[9] 여러 개를 동시에 골라도 둘 다 통과하는지 (실제 동작)');
{
  const el = () => ({ style:{}, appendChild(){}, insertBefore(){}, remove(){}, removeAttribute(){},
    setAttribute(){}, addEventListener(){}, classList:{add(){},remove(){},toggle(){}},
    querySelector:()=>null, querySelectorAll:()=>[], insertAdjacentHTML(){}, insertAdjacentElement(){},
    parentNode:{insertBefore(){}}, firstElementChild:null, textContent:'', innerHTML:'', closest:()=>null });
  global.document = { createElement:el, getElementById:()=>null, querySelector:()=>null,
    querySelectorAll:()=>[], body:el(), documentElement:el(), addEventListener(){},
    head:el(), readyState:'complete' };
  global.window = { addEventListener(){}, location:{href:'',search:''}, self:{}, top:{},
    localStorage:(function(){ const M=new Map(); return { getItem:k=>M.has(k)?M.get(k):null,
      setItem:(k,v)=>M.set(k,String(v)), removeItem:k=>M.delete(k) }; })(),
    matchMedia:()=>({matches:false,addEventListener(){}}) };
  global.window.self = global.window.top = global.window;
  global.localStorage = global.window.localStorage;
  try { new Function(CORE)(); } catch(e){ console.log('  core.js 로드 경고: '+e.message); }
  const G = global.window.GST;

  const ROWS = [
    {rg:'국내', op:'SEC Scrubber',  div:'메모리',    cu:'삼성전자', ca:'H3', li:'11', tm:'A'},
    {rg:'국내', op:'SEC Scrubber',  div:'파운드리',  cu:'삼성전자', ca:'H2', li:'11', tm:'B'},
    {rg:'국내', op:'SDC Scrubber',  div:'연구소',    cu:'삼성D',    ca:'K1', li:'11', tm:'A'},
    {rg:'해외', op:'GST TAIWAN SCRUBBER', div:'',   cu:'MICRON',   ca:'F16', li:'F16', tm:'C'},
  ];
  G.filters.mount({ page:'t9', rows:()=>ROWS, onChange:()=>{},
    get:{ region:x=>x.rg, op:x=>x.op, div:x=>x.div, customer:x=>x.cu,
          campus:x=>x.ca, line:x=>x.li, team:x=>x.tm },
    loose:{ div:1 } });
  const cnt = () => ROWS.filter(r => G.filters.pass(r)).length;
  const clr = () => G.filters.clear();

  clr(); is(cnt()===4, '아무것도 안 고르면 전체 (실제 '+cnt()+')');

  /* 핵심: 사업부 두 개를 동시에 — 이것이 사용자가 못 하던 일이다 */
  clr(); G.filters.toggle('div','메모리'); G.filters.toggle('div','파운드리');
  is(cnt()===3, '사업부 둘 + loose(빈 값) = 3행이어야 (실제 '+cnt()+')');
  is(G.filters.chosen('div').length===2, '사업부가 두 개 걸려 있어야 한다');

  /* loose 확인 — 해외 행은 사업부 값이 없어 통과한다(그 축이 아예 없는 자료를 안 버린다) */
  clr(); G.filters.toggle('div','메모리');
  is(cnt()===2, '사업부 하나 + 값 없는 해외 1행 = 2행 (실제 '+cnt()+')');

  /* hitL — 술어를 손으로 짜는 페이지(주간현황)가 pass() 와 «같은 답»을 내는지.
     ⚠ hit() 만으로는 안 된다. 고른 값이 있을 때 hit('div','') 는 false 라, 조인이 안 된
       행이 통째로 사라진다 — 「사업부를 고르면 실적이 반으로 준다」가 그것이다.
     행 단위로 pass() 와 hitL() 을 맞대어 «한 행도 안 갈리는지» 본다. */
  {
    const same = ROWS.every(r => G.filters.pass(r) === G.filters.hitL('div', r.div));
    is(same, 'hitL(div) 이 pass() 와 행 단위로 같은 답을 낸다 (사업부 1개 선택)');
    is(G.filters.hitL('div','') === true,  'loose 축의 빈 값은 통과 (조인 실패 행을 버리지 않는다)');
    is(G.filters.hitL('div','파운드리') === false, '고르지 않은 사업부는 탈락');
    /* loose 가 아닌 축의 빈 값은 «모르는 것»이 아니라 «아닌 것»이다 — 통과시키면 부푼다 */
    clr(); G.filters.toggle('campus','H3');
    is(G.filters.hitL('campus','') === false, 'loose 가 아닌 축의 빈 값은 탈락');
    is(G.filters.hitL('campus','H3') === true, '고른 단지는 통과');
    clr();
    is(G.filters.hitL('div','') === true && G.filters.hitL('campus','') === true,
       '아무것도 안 고르면 어느 축이든 전체 (pass() 의 hasK 와 같은 순서)');
  }

  /* 나머지 여섯 축도 «둘 고르면 둘 다» */
  const CASES = [
    ['region', ['국내','해외'], 4], ['op', ['SEC Scrubber','SDC Scrubber'], 3],
    ['customer', ['삼성전자','MICRON'], 3], ['campus', ['H3','K1'], 2],
    ['line', ['11','F16'], 4], ['team', ['A','C'], 3],
  ];
  CASES.forEach(([k, vals, want]) => {
    clr(); vals.forEach(v => G.filters.toggle(k, v));
    is(cnt()===want, k+' 두 개를 고르면 '+want+'행 (실제 '+cnt()+')');
    is(G.filters.F[k] instanceof Set, k+' 가 Set 으로 남아야 한다');
  });

  /* 축을 섞어 걸기 — 사용자의 실제 시나리오: 사업부로 좁힌 뒤 단지를 본다 */
  clr(); G.filters.toggle('div','메모리'); G.filters.toggle('div','연구소');
  const camps = G.filters.options('campus');
  is(camps.length===4, '사업부를 걸어도 단지 «목록»은 전체에서 만든다(되돌릴 수 있게)');
  G.filters.toggle('campus','H3'); G.filters.toggle('campus','K1');
  is(cnt()===2, '사업부 2 × 단지 2 교차 = 2행 (실제 '+cnt()+')');

  /* mount 를 여러 번 불러도 공통 블록은 «한 벌»이어야 한다.
     ⚠ v106 에서 구분이 다중선택이 되며 id 가 gf-region → gf-regionBtn 으로 바뀌었는데
       중복 방지 검사가 옛 id 를 보고 있어, 주간현황(mount 5회)에서 사이드바에
       「이 페이지 전용」 묶음이 다섯 벌 생겼다. 실제로 사용자가 그 화면을 봤다. */
  {
    let inserted = 0, kids = [];
    const slicers = { children: kids,
      insertAdjacentHTML(pos, html){ inserted++; kids.push({html:html}); },
      insertBefore(){}, querySelector(sel){ return inserted ? {} : null; },
      querySelectorAll:()=>[] };
    const prevQ = global.document.querySelector;
    global.document.querySelector = sel => sel === '.slicers' ? slicers : null;
    G.filters.mount({page:'dup', rows:()=>ROWS, onChange:()=>{}, get:{region:x=>x.rg}});
    G.filters.mount({page:'dup', rows:()=>ROWS, onChange:()=>{}, get:{region:x=>x.rg}});
    G.filters.mount({page:'dup', rows:()=>ROWS, onChange:()=>{}, get:{region:x=>x.rg}});
    global.document.querySelector = prevQ;
    is(inserted === 1, 'mount 를 세 번 불러도 공통 블록은 한 벌 (실제 '+inserted+'벌)');
    is(/gf-base/.test(CORE) && /box\.querySelector\('\.gf-base'\)/.test(CORE),
       'core — 중복 방지는 축 id 가 아니라 markup 의 껍데기(.gf-base)로 확인한다');
  }

  /* ══════════════════════════════════════════════════════════════
     [9-2] rows() 에 «패밀리»가 섞여 있을 때 (v110 · 사용자 보고)
     주간현황의 rows() 는 실적(WK)·설치(INST)·인원(ROSTER) 셋을 합쳐 넘긴다.
     패밀리마다 있는 축이 다르다 — 팀은 인원에만, 고객사·사업부·단지·라인은 설비에만.
     loose 로 선언하지 않으면 그 축을 고르는 순간 «그 축이 없는 패밀리»가 통째로 탈락해,
     **다른 축의 목록이 전부 비고 「자료 없음」이라고 적힌다.**
     실제로 팀 하나를 고르자 고객사·단지·라인·사업부가 전부 「자료 없음」이 됐고,
     사용자는 설치현황 엑셀을 열어 사업부 열이 있는 것을 확인하고 물어 왔다.
     ⚠ 소스로는 못 본다 — 목록을 실제로 만들어 봐야 안다.
     ══════════════════════════════════════════════════════════════ */
  console.log('\n[9-2] 자료가 섞여 있어도 다른 축 목록이 살아남는지 (v110)');
  {
    const EQ = (div, camp) => ({rg:'국내', op:'SEC Scrubber', cu:'삼성전자',
                                dv:div, ca:camp, li:'NRD', tm:undefined});
    const PERSON = tm => ({rg:'국내', op:'SEC Scrubber', cu:'', dv:'', ca:'', li:'', tm:tm});
    const MIX = [ EQ('MEMORY','P3'), EQ('FOUNDRY','P4'), EQ('반도체 연구소','P3'),
                  PERSON('K운영팀'), PERSON('P운영팀') ];

    const mountMix = (loose) => G.filters.mount({ page:'mix', rows:()=>MIX, onChange:()=>{},
      get:{ region:x=>x.rg, op:x=>x.op, customer:x=>x.cu, div:x=>x.dv,
            campus:x=>x.ca, line:x=>x.li, team:x=>x.tm },
      loose: loose });
    const L = k => G.filters.lists(k);

    // ① 주간현황이 실제로 선언한 그대로
    mountMix({ customer:1, div:1, campus:1, line:1, team:1 });
    clr(); G.filters.set('op','SEC Scrubber'); G.filters.set('team','K운영팀');
    is(L('div').list.length === 3,
       '팀을 골라도 사업부 목록이 살아 있다 (실제 ' + (L('div').list.join(' · ')||'빈칸') + ')');
    is(L('customer').list.length === 1 && L('campus').list.length === 2 && L('line').list.length === 1,
       '고객사·단지·라인도 같이 살아 있다');
    // ② 반대 방향 — 설비 전용 축을 고르면 팀이 사라지던 자리
    clr(); G.filters.set('op','SEC Scrubber'); G.filters.set('campus','P3');
    is(L('team').list.length === 2, '단지를 골라도 팀 목록이 살아 있다 (실제 '
       + (L('team').list.join(' · ')||'빈칸') + ')');
    // ③ 같은 패밀리 안의 좁힘은 그대로여야 한다 — loose 가 «전부 통과»가 되면 안 된다
    clr(); G.filters.set('op','SEC Scrubber'); G.filters.set('div','FOUNDRY');
    is(L('campus').list.join() === 'P4',
       '사업부를 고르면 단지는 그 사업부 것만 (실제 ' + L('campus').list.join(' · ') + ')');

    /* ④ 음성 대조 — loose 를 예전처럼 div 만 두면 그 자리가 되살아나는지.
       되살아나지 않으면 이 검사는 아무것도 지키지 않는 것이다. */
    mountMix({ div:1 });
    clr(); G.filters.set('op','SEC Scrubber'); G.filters.set('team','K운영팀');
    is(L('div').list.length === 0,
       '(음성 대조) loose 를 안 걸면 실제로 목록이 빈다 — 검사가 무의미하지 않다');
    /* ⑤ 그때조차 화면이 «자료 없음»이라고 거짓말하면 안 된다. 자료는 있고 필터가 지운 것이다 —
       사람이 할 일이 완전히 다르다(올릴 자료가 없다 vs 필터를 풀면 된다). */
    is(L('div').hasAny === true,
       '비어도 «값은 있다»를 구분해 남긴다 → 「현재 필터에 해당 없음」');

    // ⑥ 진짜로 그 축 자료가 없을 때만 「자료 없음」이다
    G.filters.mount({ page:'mix2', rows:()=>[{rg:'국내', op:'SEC Scrubber'}], onChange:()=>{},
      get:{ region:x=>x.rg, op:x=>x.op, div:x=>x.div } });
    clr();
    is(G.filters.lists('div').hasAny === false, '축 자료가 아예 없으면 hasAny=false → 「자료 없음」');

    /* ⚠ 「자료 없음」은 «자료를 안 올렸다»로 읽힌다(사용자 지적). 실제 뜻은 «이 화면이 보는
       자료에는 그 축이 없다»다 — 어느 쪽 문구도 «자료가 없다»고 말하면 안 된다. */
    is(/const EMPTY_NONE = '전체 \(이 화면 미적용\)', EMPTY_FILT = '전체 \(필터에 해당 없음\)'/.test(CORE),
       'core — 두 문구를 구분해 둔다');
    /* ⚠ 주석은 걷어내고 본다. 「예전에는 자료 없음이라고 적었다」는 이력 설명까지 걸리면
       고칠 수 없는 검사가 된다 — 판정 대상은 «화면에 나가는 문구»다. */
    is(!/자료 없음/.test(CORE.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/(^|[^:])\/\/[^\n]*/g,'$1')),
       'core — 화면 문구에 「자료 없음」을 쓰지 않는다 (안 올린 것처럼 읽힌다)');
    is(/hasAny \? EMPTY_FILT : EMPTY_NONE/.test(CORE), 'core — 단일 칸이 그 구분을 쓴다');
    is(/\(hasAny \? EMPTY_FILT : EMPTY_NONE\) \+ ' \\u25be'/.test(CORE), 'core — 다중선택 칸도 같이 쓴다');

    /* 주간현황이 «세 패밀리 전부»를 덮는 loose 를 선언했는지 — 하나만 빠져도 그 축에서 재발한다. */
    const lm = /loose:\{([^}]*)\}/.exec(SRC.report.replace(/\/\*[\s\S]*?\*\//g,' '));
    const declared = lm ? (lm[1].match(/(\w+)\s*:/g)||[]).map(x=>x.replace(/\s*:/,'')) : [];
    const need = ['customer','div','campus','line','team'];
    const miss = need.filter(k => declared.indexOf(k) < 0);
    is(!miss.length, 'report — 패밀리마다 없는 축을 전부 loose 로 선언했다'
       + (miss.length ? '  ⚠ 빠짐: ' + miss.join(', ') : ''));
    clr();
  }

  /* ══════════════════════════════════════════════════════════════
     [9-3] 사이드바가 «그 순서로, 한 줄로» 그려지는지 (v111 · 사용자 지시)
     구분 → 팀 → 운영단위 → 고객사 → 사업부 → 단지 → 라인.
     소스의 AXES 만 보면 «정말 그 순서로 그려지는지»는 못 본다 — 만들어진 마크업을 본다.
     ══════════════════════════════════════════════════════════════ */
  console.log('\n[9-3] 사이드바 순서와 «미적용» 문구 (v111)');
  {
    let html = '';
    const kids = [];
    const slicers = { children: kids,
      insertAdjacentHTML(pos, h){ html += h; kids.push({html:h}); },
      insertBefore(){}, querySelector(sel){ return html ? {} : null; }, querySelectorAll:()=>[] };
    const prevQ = global.document.querySelector;
    global.document.querySelector = sel => sel === '.slicers' ? slicers : null;
    G.filters.mount({ page:'ord', rows:()=>[{rg:'국내'}], onChange:()=>{}, get:{ region:x=>x.rg } });
    global.document.querySelector = prevQ;

    const L = ['구분','팀','운영단위','고객사','사업부','단지','라인'];
    const got = [...html.matchAll(/class="lbl">([^<]+)</g)].map(m => m[1].trim())
                  .filter(x => L.indexOf(x) >= 0);
    is(got.join(' > ') === L.join(' > '),
       '사이드바가 구분 > 팀 > 운영단위 > 고객사 > 사업부 > 단지 > 라인 순 (실제 ' + got.join(' > ') + ')');
    is(!/gf-grp/.test(html), '묶음 머리글이 없다 — 여덟 페이지가 같은 한 줄을 본다');
    is(/id="gf-from"/.test(html) && /id="gf-to"/.test(html), '기간 칸은 맨 뒤에 그대로 있다');
    /* 칸을 «숨기지» 않는다(v91 사용자 확정) — 나타났다 사라지면 그게 더 헷갈린다. */
    is(got.length === 7, '축이 하나도 빠지지 않는다 (안 걸리는 축도 칸은 남는다)');
  }

  /* 안 걸리는 축의 칸이 «무슨 말»을 하는지 — 사용자가 문제 삼은 그 문구다.
     「자료 없음」은 «자료를 안 올렸다»로 읽혀, 사용자가 설치현황 엑셀을 열어 보게 만들었다.
     ⚠ mount 는 .slicers 가 없으면 refresh() 전에 빠져나간다 — 칸을 그리게 하려면
       refresh 를 직접 불러야 한다(이걸 놓치면 검사가 «아무것도 안 보고» 통과한다). */
  {
    const btns = {};
    const stub = (id) => btns[id] || (btns[id] = { id, textContent:'', innerHTML:'', disabled:false,
      dataset:{}, style:{}, closest:()=>({style:{}}), querySelectorAll:()=>[], addEventListener(){},
      appendChild(){}, options:[] });
    const prevG = global.document.getElementById;
    global.document.getElementById = stub;

    // ① 사업부 자료가 아예 없는 화면 (pm 이 그렇다 — 설치현황을 안 읽는다)
    G.filters.mount({ page:'lbl', rows:()=>[{rg:'국내'}], onChange:()=>{},
      get:{ region:x=>x.rg, div:x=>x.dv } });
    G.filters.clear(); G.filters.refresh();
    const noneTxt = (btns['gf-divBtn']||{}).textContent || '';
    const noneDis = (btns['gf-divBtn']||{}).disabled;

    // ② 값은 있는데 다른 필터가 다 떨어뜨린 경우
    G.filters.mount({ page:'lbl2', rows:()=>[{rg:'국내'},{rg:'해외',dv:'FOUNDRY'}], onChange:()=>{},
      get:{ region:x=>x.rg, div:x=>x.dv } });
    G.filters.clear(); G.filters.set('region','국내');
    const filtTxt = (btns['gf-divBtn']||{}).textContent || '';
    global.document.getElementById = prevG;

    is(/이 화면 미적용/.test(noneTxt),
       '축 자료가 없으면 「이 화면 미적용」 (실제 ' + JSON.stringify(noneTxt) + ')');
    is(noneDis === true, '그 칸은 잠근다 — 눌러도 아무 일이 없는 칸을 열어 두지 않는다');
    is(/필터에 해당 없음/.test(filtTxt),
       '필터가 지운 것이면 「필터에 해당 없음」 (실제 ' + JSON.stringify(filtTxt) + ')');
    is(!/자료 없음/.test(noneTxt) && !/자료 없음/.test(filtTxt),
       '어느 쪽도 「자료 없음」이라고 하지 않는다 — 안 올린 것처럼 읽힌다');
    G.filters.clear();
  }

  /* ══════════════════════════════════════════════════════════════
     [9-4] 가동현황 표가 «단지까지» 내려가는지 (v111 · 사용자 지시)
     국내는 고객사가 「삼성전자(주)」 하나뿐이라, 법인을 고르면 고객사 한 줄짜리 표가 된다 —
     그 한 줄은 TOTAL 과 똑같아서 아무것도 안 알려 준다. 실제 소분류는 단지까지 있다.
     사이드바 필터의 종속과 같은 개념을 표에도 적용한다.
     ⚠ 판정을 소스에서 떼어 실제로 돌린다 — 정규식으로 «있나»만 보면 조건이 틀려도 통과한다.
     ══════════════════════════════════════════════════════════════ */
  console.log('\n[9-4] 가동현황 표의 단계 판정 (v111)');
  {
    const R = SRC.report;
    const i = R.indexOf('const _lvl=(function(){'), j = R.indexOf('})();', i) + 5;
    const body = i >= 0 ? R.slice(i, j) : '';
    is(!!body, 'report — 단계 판정(_lvl)이 한 곳에 있다');

    const CI = { customer:0, location:1, fab:2, country:3 };
    const run = (opPick, cuPick, rows) => {
      const fINST = rows.map(r => { const a=[]; a[0]=r[0]; a[1]=r[1]; a[2]=r[2]; a[3]=r[3]||'TAIWAN'; return a; });
      const _campOf = r => G.ORG.campus(r[CI.location], r[CI.fab], r[CI.country]);
      return new Function('GST','CI','fINST','_opPick','_cuPick','_campOf', body + '; return _lvl;')
               (G, CI, fINST, opPick, cuPick, _campOf);
    };
    /* ⚠ fINST 는 «사이드바 필터가 이미 걸린» 설비 목록이다. 고객사를 골랐으면 여기 오는
       행도 그 고객사 것뿐이다 — 검사도 그렇게 먹여야 «실제와 같은» 판정을 본다. */
    const KR = [['삼성전자(주)','P1','','KOREA'],['삼성전자(주)','P2','','KOREA'],
                ['삼성전자(주)','P3','','KOREA'],['삼성전자(주)','P4','','KOREA']];
    is(run('', '', KR) === 'corp',        '법인을 안 고르면 법인 단계 (실제 ' + run('','',KR) + ')');
    is(run('SEC Scrubber','', KR) === 'camp',
       '법인만 골라도 고객사가 하나뿐이면 단지까지 내려간다 (실제 ' + run('SEC Scrubber','',KR) + ')');
    is(run('SEC Scrubber','삼성전자(주)', KR) === 'camp', '고객사까지 고르면 당연히 단지');

    const OS = [['MICRON','TONGLUO','F16N'],['PSMC','','P1'],['WINBOND','','F10']];
    is(run('GST TAIWAN SCRUBBER','', OS) === 'cust',
       '고객사가 여럿이면 고객사 단계에서 멈춘다 (실제 ' + run('GST TAIWAN SCRUBBER','',OS) + ')');
    /* 내려가 봐야 한 줄인 경우는 내려가지 않는다 — 한 줄짜리 표를 또 만들지 않는다. */
    is(run('GST TAIWAN SCRUBBER','PSMC', [['PSMC','','P1'],['PSMC','','P1']]) === 'cust',
       '고른 고객사의 단지가 하나뿐이면 안 내려간다');
    is(run('GST TAIWAN SCRUBBER','MICRON', [['MICRON','TONGLUO','F16N'],['MICRON','','F16']]) === 'camp',
       '고른 고객사의 단지가 여럿이면 내려간다');
    is(run('SEC Scrubber','', [['삼성전자(주)','P3','','KOREA'],['삼성전자(주)','P3','','KOREA']]) === 'cust',
       '단지가 하나뿐이면 내려가 봐야 한 줄이라 안 내려간다');

    /* 같은 고객사인데 표기가 갈린 자료. 원문으로 세면 둘로 잡혀 «고객사가 여럿»이 되어
       안 내려간다 — 고객사 축은 정규화해 견주는 것이 v98 규약이다. */
    const DUP = [['Micron Memory Taiwan Co., Ltd.(F16)','','F16'],['MICRON','TONGLUO','F16N'],
                 ['micron','','F16S']];
    is(run('GST TAIWAN SCRUBBER','', DUP) === 'camp',
       '표기가 갈려도 정규화해 «하나»로 세고 내려간다 (실제 ' + run('GST TAIWAN SCRUBBER','',DUP) + ')');

    /* 머리글·행 키가 세 단계를 따라가는지 — 한 곳만 빠지면 「법인」 칸에 단지가 선다. */
    const RC = SRC.report.replace(/\/\*[\s\S]*?\*\//g,' ');
    is(/const K1=_lvl==='camp'\?'op_cust2':_lvl==='cust'\?'op_corp2':'op_div';/.test(RC),
       'report — 머리글 첫 칸이 «한 단계 위»를 따라간다');
    is(/const K2=_lvl==='camp'\?'op_camp2':_lvl==='cust'\?'op_cust2':'op_corp2';/.test(RC),
       'report — 머리글 둘째 칸이 «행 단계»를 따라간다');
    is(/op_camp2:'단지'/.test(SRC.report) && /op_camp2:'Campus'/.test(SRC.report)
       && /op_camp2:'园区'/.test(SRC.report) && /op_camp2:'キャンパス'/.test(SRC.report),
       'report — 새 머리글을 네 언어 다 채웠다');
    /* 단지 축은 정규화하지 않는다 — 설치·인원·실적이 이미 같은 낱말(P1·H2)을 쓴다.
       고객사처럼 접으면 서로 다른 원문 둘이 한 행이 되어 인원이 두 번 잡힌다(v98). */
    is(/:_campOf\(r\)\)\|\|''\)\.trim\(\)/.test(RC), 'report — 설비 행 키가 단지로 내려간다');
    is(/:\(p\.campus\|\|p\.fab\|\|'미배치'\)/.test(RC),
       'report — 인원 행 키도 단지 (둘 다 비면 «미배치» — 고객사로 안 내려간다)');
  }

  /* 저장·복원이 Set 을 지키는지 */
  G.filters.set('op', ['SEC Scrubber','SDC Scrubber']);
  is(G.filters.chosen('op').length===2 && G.filters.F.op instanceof Set,
     '배열로 넣어도 Set 으로 들어간다');
  is(G.filters.hit('op','SEC Scrubber') && !G.filters.hit('op','GST TAIWAN SCRUBBER'),
     'hit 이 두 값 모두를 안다');

  /* corpLabel — 여럿 고르면 이름을 지어내지 않는다 */
  clr(); G.filters.toggle('op','GST TAIWAN SCRUBBER');
  is(G.corpLabel()==='GST TAIWAN', '하나 고르면 그 법인 (실제 '+G.corpLabel()+')');
  G.filters.toggle('op','SEC Scrubber');
  is(G.corpLabel()==='GST TAIWAN · SEC', '둘이면 이어 붙인다 (실제 '+G.corpLabel()+')');
  G.filters.toggle('op','SDC Scrubber');
  is(G.corpLabel()==='3개 법인', '셋 이상이면 개수로 (실제 '+G.corpLabel()+')');
  is(!/object Set/.test(G.corpLabel()), 'Set 이 그대로 문자열이 되면 안 된다');
  clr();
}

console.log('\n' + (fail ? '❌ t-filters ' + fail + ' 실패 / ' + (pass + fail)
                         : '✅ t-filters ' + pass + '/' + pass));
process.exit(fail ? 1 : 0);
