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

console.log('\n[7-5] 사업부 축 — 국내 설치현황에만 있는 열 (v96)');
{
  is(/div:new Set\(\)/.test(CORE) || /div:''/.test(CORE), 'core — F 에 div 축이 있다');
  /* 계층은 사용자가 확정했다(v98): 구분 → 운영단위 → 사업부 → 고객사 → 단지 → 라인.
     칸이 놓인 순서가 곧 사람이 읽는 계층이라, 종속만 맞고 순서가 틀리면 화면이 거짓말을 한다. */
  is(/div:'사업부', customer:'고객사'/.test(CORE), 'core — 축 순서가 계층과 같다 (사업부 다음 고객사)');
  /* 축 목록이 «한 곳»(AXES)에서 나와야 종속·사이드바·술어가 같은 순서를 본다.
     예전에는 세 곳에 손으로 적혀 있어, 하나만 고치면 조용히 갈라졌다. */
  is(/const AXES = \['region','op','div','customer','campus','line','team'\]/.test(CORE),
     'core — 축 순서가 AXES 한 곳에 있다 (계층: 구분→운영단위→사업부→고객사→단지→라인→팀)');
  is(/const chk = AXES;/.test(CORE), 'core — 종속(cascading)이 같은 목록을 쓴다');
  is(/AXES\.map\(function\(k\)\{ return \(MULTI\[k\]\?msel:sel\)/.test(CORE),
     'core — 사이드바 칸도 같은 목록·같은 순서로 그린다');
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
  is(/loose:\{ div:1 \}/.test(SRC.report), 'report — 사업부를 loose 로 선언했다');
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
  const AXES7 = ['region','op','div','customer','campus','line','team'];
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
