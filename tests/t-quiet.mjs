/* 「조용히 틀리는 자리」를 지킨다.

   이 저장소에서 가장 나쁜 실패는 에러가 아니라 «에러 없이 틀린 숫자»다. 지금까지 겪은
   것이 전부 그 꼴이었다 — 열이 밀려도 퇴사자가 되살아나기만 했고, 대만 전용 목록이
   국내를 통째로 0 으로 만들었고, 사업부 필터가 칩만 뜨고 아무 일도 안 했다.
   여기 모은 넷도 같은 부류라, 한 곳에서 함께 지킨다:

     [1] 두 시계 섞기      — 로컬로 파싱하고 UTC 로 찍으면 KST 에서 하루가 밀린다
     [2] 판정의 두 번째 사본 — 같은 물음에 두 함수가 답하면 언젠가 갈라진다
     [3] 삼켜진 에러        — 무엇이 실패했는지 화면에도 콘솔에도 안 남는다
     [4] 조용한 모집단 제외  — 분모에서 빠진 것을 «좋아졌다»로 읽게 된다

   브라우저는 안 띄운다. [1]만 core.js 를 실제로 실행하고 나머지는 소스를 본다. */
/* ⚠ 이 검사는 «한국 시계»에서 돌아야 뜻이 있다. UTC 인 CI 상자에서는 하루 밀림이
   원리적으로 재현되지 않아, 옛 코드로 되돌려도 초록불이 뜬다 — 거짓 통과다.
   사용자는 KST 에 있으므로 여기서 TZ 를 못 박는다(Date 를 처음 쓰기 전에 해야 먹힌다). */
process.env.TZ = 'Asia/Seoul';

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };
const is  = (c, m) => c ? ok(m) : bad(m);
const rd  = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* 주석에 든 예시 코드가 검사에 걸려 «있다»로 통과한 적이 있다(t-filters [7-7]).
   판정은 언제나 «코드에 무엇이 있나»여야 한다. */
const noCmt = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CORE = rd('assets/core.js');
/* [14] 는 판정을 «돌려» 봐야 한다 — 소스만 보면 낱말이 맞는지 알 수 없다.
   브라우저 없이 core.js 를 통째로 실행하려면 DOM 흉내가 필요하다(t-region 과 같은 방식). */
function loadCore(){
  if(loadCore._g) return loadCore._g;
  const el = () => ({ style:{}, appendChild(){}, insertBefore(){}, remove(){}, removeAttribute(){},
    setAttribute(){}, addEventListener(){}, classList:{add(){},remove(){},toggle(){}},
    querySelector:()=>null, querySelectorAll:()=>[], insertAdjacentHTML(){}, insertAdjacentElement(){},
    parentNode:{insertBefore(){}}, firstElementChild:null, textContent:'', innerHTML:'' });
  global.document = { createElement:el, getElementById:()=>null, querySelector:()=>null,
    querySelectorAll:()=>[], body:el(), documentElement:el(), addEventListener(){},
    head:el(), readyState:'complete' };
  global.window = { addEventListener(){}, location:{href:'',search:''}, self:{}, top:{},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    matchMedia:()=>({matches:false,addEventListener(){}}) };
  global.window.self = global.window.top = global.window;
  global.localStorage = global.window.localStorage; global.location = global.window.location;
  try{ new Function(CORE)(); }catch(e){ console.log('  core.js 로드 경고: '+e.message); }
  return (loadCore._g = global.window.GST || global.GST);
}
const SRC  = {}; ['report','fault','material','scrubber','hr']
  .forEach(p => { SRC[p] = noCmt(rd(p + '/index.html')); });

/* ══════════════════════════════════════════════════════════════
   [1] 「사람이 보는 날짜」는 사람의 시계로 찍는다
   ══════════════════════════════════════════════════════════════ */
console.log('\n[1] 로컬 날짜 표기 — KST 에서 하루가 밀리지 않는지');
{
  /* GST.ymdL 만 떼어 실행한다. core.js 전체를 돌리면 DOM 이 필요해 이 검사가
     환경에 끌려간다 — 지킬 것은 «날짜 문자열»이지 core 의 부팅이 아니다. */
  const m = CORE.match(/GST\.ymdL = function[\s\S]*?\n\};/);
  is(!!m, 'core — GST.ymdL 이 있다');
  if (m) {
    const G = {};
    new Function('GST', m[0])(G);

    /* 사용자가 겪은 그 자리: 로컬 자정으로 만든 Date.
       KST(+9)면 toISOString() 은 «전날» 15:00Z 를 찍는다. */
    const d = new Date('2026-08-01T00:00:00');   // 타임존 없음 = 로컬
    is(G.ymdL(d) === '2026-08-01',
       '로컬 자정 → 그 날짜 그대로 (실제 ' + G.ymdL(d) + ')');

    /* 오전 9시 이전의 «오늘». 예전에는 빠른 프리셋의 to 가 어제로 잡혀
       오늘 자료가 통째로 잘려 나갔다. */
    const morn = new Date('2026-08-18T07:30:00');
    is(G.ymdL(morn) === '2026-08-18',
       '오전 7시 30분도 오늘 (실제 ' + G.ymdL(morn) + ')');

    /* 하루의 끝. 반대쪽(UTC-x)에서 다음 날로 넘어가지 않아야 한다. */
    const eve = new Date('2026-08-18T23:59:00');
    is(G.ymdL(eve) === '2026-08-18', '밤 11시 59분도 같은 날 (실제 ' + G.ymdL(eve) + ')');

    is(G.ymdL(new Date('2026-01-05T00:00:00')) === '2026-01-05', '월·일에 0 을 채운다');
    is(/^\d{4}-\d{2}-\d{2}$/.test(G.ymdL()), '인자 없이 부르면 오늘 (형식 YYYY-MM-DD)');
    is(/^\d{4}-\d{2}-\d{2}$/.test(G.ymdL(new Date('nope'))), '못 읽는 Date 는 오늘로 (NaN 을 안 찍는다)');

    /* ⚠ 음성 대조 — toISOString 이었다면 KST 에서 실제로 밀리는가.
       테스트 프로세스의 TZ 가 UTC 면 안 밀리므로, 밀리는 환경에서만 판정한다.
       그래야 「UTC 에서 돌려 초록불」이라는 거짓 통과가 안 생긴다. */
    const off = -new Date('2026-08-01T00:00:00').getTimezoneOffset();   // 분, 동쪽이 +
    if (off > 0) {
      is(d.toISOString().slice(0,10) !== G.ymdL(d),
         'TZ=' + off/60 + 'h — 옛 방식(toISOString)은 실제로 밀린다 (' 
         + d.toISOString().slice(0,10) + ' ≠ ' + G.ymdL(d) + ')');
    } else {
      bad('TZ 가 Asia/Seoul 로 안 잡혔다 — 이 환경에서는 하루 밀림이 재현되지 않아'
          + ' 검사가 뜻을 잃는다 (offset ' + off + '분)');
    }
  }

  /* 위 함수가 있어도 부르는 쪽이 옛 방식이면 소용이 없다.
     기간 표시·프리셋은 사람이 넣은 «문자열»이 정본이므로 Date 왕복을 하지 않는다. */
  is(!/DATE_FROM\.toISOString\(\)/.test(SRC.scrubber),
     'scrubber — 기간 표시가 DATE_FROM 을 UTC 로 찍지 않는다');
  is(/el\.textContent=`\$\{G\.dtFrom\|\|'\.\.\.'\} ~ \$\{G\.dtTo\|\|'\.\.\.'\}`/.test(SRC.scrubber),
     'scrubber — 사람이 넣은 문자열을 그대로 되비춘다 (Date 왕복 없음)');
  is(/ymd=GST\.ymdL/.test(SRC.scrubber), 'scrubber — 빠른 프리셋이 로컬 날짜로 찍는다');
  is(!/new Date\(\)\.toISOString\(\)\.slice\(0,10\)/.test(SRC.hr),
     'hr — 「오늘」을 UTC 로 찍지 않는다 (오전 9시 전에 어제가 된다)');
}

/* ══════════════════════════════════════════════════════════════
   [2] 판정의 두 번째 사본
   ══════════════════════════════════════════════════════════════ */
console.log('\n[2] 같은 물음에 두 함수가 답하지 않는지');
{
  /* v75 에 막대와 표가 각자 급증을 판정해, 같은 문구를 달고 서로 반대 결론을 낸
     조합이 110건 나왔다. 그 뒤로 GST.monthSurges 하나로 모았는데 자재 페이지에
     사본이 그대로 남아 있었다 — 지금은 글자까지 같아 답이 안 갈렸지만
     그것은 우연이지 규율이 아니다. */
  ['material','fault'].forEach(p => {
    is(!/function monthSurges\(/.test(SRC[p]), p + ' — monthSurges 사본이 없다');
    is(!/function monthSeq\(/.test(SRC[p]),    p + ' — monthSeq 사본이 없다');
    is(!/const SURGE_(MIN_N|X)\s*=/.test(SRC[p]), p + ' — 급증 문턱값 사본이 없다');
  });
  is(/GST\.monthSurges\(/.test(SRC.material) && /GST\.monthSurges\(/.test(SRC.fault),
     '두 페이지가 core 의 GST.monthSurges 를 부른다');
  is(/GST\.SURGE = \{ minN: 5, x: 2 \}/.test(CORE), 'core — 문턱값이 한 곳에 있다');

  /* loose 축 판정도 마찬가지다 — 주간현황이 자기 식으로 다시 적으면 pass() 와 갈린다. */
  /* v114 — 필터가 두 벌이라 hitL 도 두 벌이지만, 규칙 본문은 hitLG 한 곳뿐이다.
     둘이 각자 규칙을 적으면 설비와 인원이 «다른 답»을 내는 loose 축이 생긴다. */
  is(/function hitLG\(G, k, v\)\{/.test(CORE) && /hitL:  function\(k, v\)\{ return hitLG\(EQ, k, v\); \}/.test(CORE)
     && /hitLH: function\(k, v\)\{ return hitLG\(HR, k, v\); \}/.test(CORE),
     'core — loose 판정 본문이 hitLG 한 곳이고 두 벌이 그것만 부른다');
  is(/const divOk=\(v\)=>GST\.filters\.hitL\('div', v\);/.test(SRC.report),
     'report — 사업부 판정을 다시 적지 않고 core 를 부른다');
}

/* ══════════════════════════════════════════════════════════════
   [3] 삼켜진 에러
   ══════════════════════════════════════════════════════════════ */
console.log('\n[3] 실패했을 때 «무엇이» 실패했는지 남기는지');
{
  /* 예전 주간현황은 catch 에서 「❌ 불러오는 중…」 한 줄만 찍고 e 를 버렸다.
     표가 없어서인지·권한인지·열 인식 실패인지가 전부 같은 글자로 보인다 —
     사용자가 물어도 되짚을 근거가 어디에도 없다. */
  const cat = SRC.report.match(/\}catch\(e\)\{[\s\S]{0,400}?\n  \}/);
  const body = cat ? cat[0] : '';
  is(/console\.error\(/.test(body), 'report — loadData 실패를 콘솔에 스택째 남긴다');
  is(/\(e&&e\.message\)\|\|e/.test(body), 'report — 화면에도 실패 이유를 한 줄 적는다');
  is(!/textContent='❌ '\+t\('loading'\);/.test(SRC.report),
     'report — 「불러오는 중」만 찍고 끝내지 않는다');
}

/* ══════════════════════════════════════════════════════════════
   [4] 조용한 모집단 제외
   ══════════════════════════════════════════════════════════════ */
console.log('\n[4] 분모에서 뺀 설비를 화면이 밝히는지 (v99)');
{
  /* 고장분석은 수선실적에 있는 S/N 을 그대로 «설비»로 셌다. 그래서 이미 나간 설비가
     분모에 남아 떠난 뒤로도 가동일수가 매일 쌓였다 — MTBF 는 길어지고 연간 고장률은
     낮아진다. 조용히 좋아 보이는 것이 이 결함의 성질이다.
     ⚠ 빼는 것만으로는 부족하다. 뺀 뒤에 지표가 나빠지면 사용자는 이유를 알아야 한다. */
  is(/GST\.EQ\.cls\(INSTSTATE\[k\]\|\|''\)/.test(SRC.fault),
     'fault — 설비상태 판정이 GST.EQ 한 곳을 지난다');
  is(/if\(_c==='out'\)\{ _outN\+\+; return; \}/.test(SRC.fault),
     'fault — 나간 설비(반출·반납)를 신뢰성 모집단에서 뺀다');
  is(/if\(_c==='\?'\)\s*\{ _unkN\+\+; return; \}/.test(SRC.fault),
     'fault — 처음 보는 상태도 빼되 따로 센다 (허용목록 규약)');
  is(/반출·반납 '\+outN/.test(SRC.fault) && /처음 보는 설비상태 '\+unkN/.test(SRC.fault),
     'fault — 몇 대를 뺐는지 KPI 노트에 적는다 (조용히 빼지 않는다)');
  is(/설비상태 열 없음 — 옛 날짜 기준/.test(SRC.fault),
     'fault — 상태 열이 없는 옛 추출본이면 그 사실을 밝힌다 (v99 규약)');
  /* 상태를 «모르는» 것과 «나간» 것을 한 덩어리로 세면 새 상태값이 생겨도 아무도 모른다. */
  is(/outN:_outN,unkN:_unkN/.test(SRC.fault), 'fault — 제외 사유를 둘로 나눠 돌려준다');
}

/* ══════════════════════════════════════════════════════════════
   [5] 검사가 «자기가 검사할 것»을 기준으로 삼지 않는지
   ══════════════════════════════════════════════════════════════ */
console.log('\n[5] src_row 규칙이 세 곳에서 같은지 (픽스처 없이)');
{
  /* src_row 는 미러 표의 PK 다. 배포된 sheet-sync 는 `for(off=0; …) toRows(slice,cmap,off)`
     라 «빈 행을 걸러낸 뒤의 0부터의 순번»인데, 업로드 화면의 미러 경로만 hi+1 을 더하고
     있었다(주석에는 「sheet-sync 와 동일」이라 적혀 있었다).
     같은 표에 두 경로가 닿으면 PK 가 어긋나 upsert 가 매칭에 실패한다 — 옛 행이 안 지워지고
     새 행이 얹혀 표가 조용히 두 배가 된다. 실적 3종 cron 은 멈춰 있을 뿐 코드는 남아 있다.
     ⚠ 그런데 t-upload 는 이것을 못 잡았다. 기준을 만들 때 «페이지가 쓰는 오프셋»을
       그대로 먹이고 있어서, 페이지가 무엇을 쓰든 기준이 따라 움직였다.
       검사가 검사 대상을 기준으로 삼으면 언제나 초록불이다. */
  const SYNC = noCmt(rd('supabase/functions/sheet-sync/index.ts'));
  const UP   = noCmt(rd('upload/index.html'));
  const TU   = noCmt(rd('tests/t-upload.mjs'));

  is(/for \(let off = 0; off < data\.length; off \+= BATCH\)[\s\S]{0,200}?toRows\(data\.slice\(off, off \+ BATCH\), cmap, off, header\)/.test(SYNC),
     'sheet-sync — src_row 는 0 부터의 순번이다 (배포 코드가 정본)');
  is(/const o=\{src_row:i\};/.test(UP),  '업로드 화면(미러 경로) — 같은 규칙(0 부터)');
  is(/o\.src_row=i;/.test(UP),           '업로드 화면(알람·올바 경로) — 같은 규칙(0 부터)');
  is(!/src_row:m\.hi\+1\+i/.test(UP),   '업로드 화면이 hi+1 을 더하지 않는다');
  is(!/toRows\(plan\.data, plan\.cmap, plan\.hi \+ 1, plan\.header\)/.test(TU),
     't-upload — 기준에 «페이지의 오프셋»을 먹이지 않는다');
  is(/for \(let off = 0; off < plan\.data\.length; off \+= BATCH\)/.test(TU),
     't-upload — 배포 sheet-sync 가 부르는 방식 그대로(배치 · off 0 부터) 기준을 만든다');
}

/* ══════════════════════════════════════════════════════════════
   [6] 챗봇이 대시보드와 «다른 기준»으로 답하면서 말은 안 하는지
   ══════════════════════════════════════════════════════════════ */
console.log('\n[6] 챗봇 BM 이 자기 기준을 밝히는지 (v92)');
{
  /* 사용자 결정(v92): 국내는 수선실적 BM 정합성이 안 맞아 「CS 알람관리」 원장으로 센다.
     대만은 지금까지대로 수선실적 BM 이다 — 두 계통이 공존한다.
     챗봇은 그 개편을 못 따라가 수선실적 stage 로만 센다. 그래서 «같은 질문에 대시보드와
     다른 숫자»를 답하는데, 어느 쪽도 자기 기준을 말하지 않아 받아 본 사람은 둘 중 하나가
     고장 난 줄로 읽는다.
     ⚠ 원장을 챗봇에서 «파싱»하게 만들면 안 된다 — GST.ALARM(세 사이트 양식을 한 스키마로
       눕히는 별칭 배열)을 Deno 로 옮기는 것이고, 그게 스펙의 네 번째 사본이다(제2원칙).
       대시보드가 판정에 쓰는 조건(원장에 행이 있나)만 묻는다. 자료 질문이라 사본이 안 생긴다. */
  const BOT = noCmt(rd('supabase/functions/kakao-bot/index.ts'));
  is(/async function krLedgerNote\(/.test(BOT), 'kakao-bot — 원장이 실려 있는지 확인하는 자리가 있다');
  is(/from\("sheet_alarm"\)\.select\("src_row", \{ count: "exact", head: true \}\)/.test(BOT),
     'kakao-bot — 행수만 센다 (원장을 파싱하지 않는다 — 네 번째 사본을 안 만든다)');
  is(/if \(!n\) return "";/.test(BOT),
     'kakao-bot — 원장이 비었으면 아무 말도 안 한다 (그때는 대시보드도 수선실적 BM 이라 숫자가 같다)');
  is(/대시보드 주간현황을 보세요/.test(BOT),
     'kakao-bot — 증상만 알리지 않고 «무엇을 보면 되는지»까지 적는다');
  is(/const krNote = await krLedgerNote\(svc\);/.test(BOT), 'kakao-bot — BM 사이트별 답변이 실제로 그것을 붙인다');
  /* 메뉴 경로만 고치면 자유 질문(Claude 경로)이 여전히 조용히 다른 숫자를 답한다.
     세 프롬프트 블록에 같은 말이 들어가야 한다 — 한 곳만 빠지면 그 경로로 물은 사람만 모른다. */
  const n = (BOT.match(/국내 BM 은 대시보드가 수선실적이 아니라/g)||[]).length;
  is(n === 3, '카톡·대시보드 챗봇 프롬프트 세 곳에 모두 적혀 있다 (실제 ' + n + '곳)');
}

/* ══════════════════════════════════════════════════════════════
   [7] 눌린 «조각»을 버리고 다른 질문에 답하지 않는지
   ══════════════════════════════════════════════════════════════ */
console.log('\n[7] 스택 막대의 세부내역이 «누른 그 칸»을 보는지 (v111)');
{
  /* 사용자 보고 — 인원 차트 막대를 눌러도 명단이 안 나오고 인원수 요약만 떴다.
     원인 둘: ① onDrill 이 datasetIndex 를 버려서 「1년 미만 5명」 조각을 눌러도
     구간 전체(43명) 요약이 떴다 ② drillHead 가 애초에 명단을 안 냈다.
     같은 화면의 입·퇴사 드릴은 진작 이름을 내고 있었다 — 카드끼리 답이 달랐다.
     ⚠ 소스만 봐서는 «정말 좁혀지는지»를 못 본다. 함수를 떼어 실제로 돌린다.
       이름은 전부 지어낸 값이다(공개 저장소 — 실데이터 금지). */
  const R = rd('report/index.html'), RC = noCmt(R);
  is(/const p=P\[i\], di=els\[0\]\.datasetIndex;/.test(RC),
     'report — onDrill 이 눌린 조각 번호를 버리지 않는다');
  is(/drillHead\(p,id,di,seg\)/.test(RC), 'report — 그 번호를 세부내역에 넘긴다');
  /* 경계를 드릴이 자기 숫자로 다시 적으면 막대는 5명인데 명단은 6명이 되는 날이 온다. */
  is(/hcBand:HC_BANDS/.test(RC) && /HC_BANDS=\[\{lo:0,hi:1\}/.test(RC),
     'report — 경력구간 경계가 차트와 세부내역 «한 곳»에서 나온다');

  const cut = (name) => {
    const i = R.indexOf('function ' + name + '(');
    let d = 0, on = false;
    for (let k = i; k < R.length; k++) {
      if (R[k] === '{') { d++; on = true; }
      else if (R[k] === '}') { d--; if (on && !d) return R.slice(i, k + 1); }
    }
    return '';
  };
  const MS = 86400000;
  let shown = null;
  const ctx = { MS, esc: v => String(v == null ? '' : v),
    _md: d => d ? d.toISOString().slice(0, 10) : '—',
    activeAt: (x, e) => !x.quit || x.quit > e,
    showDrill: (t, h) => { shown = { t, h }; }, window: {} };
  let drillHead = null;
  try { drillHead = new Function(...Object.keys(ctx), cut('drillHead') + '; return drillHead;')
                      (...Object.values(ctx)); } catch (e) { /* 아래에서 잡는다 */ }
  is(!!drillHead, 'report — drillHead 를 떼어 돌릴 수 있다');

  if (drillHead) {
    const P = (n, camp, team, yrs) => ({ name: n, campus: camp, team,
      join: new Date(Date.UTC(2026, 7, 1) - yrs * 365.25 * MS), quit: null, onsite: true });
    ctx.window._DRILL = {
      fHR: [P('가나다', 'H1', 'K운영팀', 0.5), P('라마바', 'H1', 'K운영팀', 0.2),
            P('사아자', 'H2', 'P운영팀', 1.4), P('차카타', 'H2', 'P운영팀', 3.0),
            P('파하가', 'H3', 'K운영팀', 5.0)],
      grpKey: x => x.campus, SITES: ['H1', 'H2', 'H3'],
      hcBand: [{ lo: 0, hi: 1 }, { lo: 1, hi: 2 }, { lo: 2, hi: null }] };
    const per = { label: 'W33', end: new Date(Date.UTC(2026, 7, 15)) };
    const names = h => [...h.matchAll(/<td>([가-힣]{3})<\/td>/g)].map(m => m[1]);
    const run = (id, di, seg) => { drillHead(per, id, di, seg); return { n: names(shown.h), t: shown.t, h: shown.h }; };

    let r = run('cHc', 0, '1년 미만');
    is(r.n.join() === '라마바,가나다', '1년 미만 조각 → 그 2명만 (실제 ' + (r.n.join(' · ') || '없음') + ')');
    is(/1년 미만/.test(r.t), '제목에 누른 조각 이름을 적는다 (실제 ' + r.t + ')');
    is(/<th>이름<\/th>/.test(r.h), '명단 표를 낸다 — 인원수 요약만 내지 않는다');
    const nums = [...r.h.matchAll(/class="n">(\d+)</g)].map(m => +m[1]);
    is(nums[0] === 2 && nums[1] === 5,
       '조각 인원과 «구간 전체»를 같이 적는다 (실제 ' + nums.join(' / ') + ')');

    r = run('cHc', 2, '2년 이상');
    is(r.n.join() === '차카타,파하가', '2년 이상 조각 → 그 2명만 (실제 ' + (r.n.join(' · ') || '없음') + ')');
    r = run('cCareer', 0, 'H2');
    is(r.n.join() === '사아자,차카타', '단지 조각 → 그 단지 사람만 (실제 ' + (r.n.join(' · ') || '없음') + ')');
    /* 옛 배포본처럼 경계를 못 받으면 «좁히지 않고 전체»를 낸다 — 틀린 명단을 내느니 낫다. */
    const keep = ctx.window._DRILL.hcBand; ctx.window._DRILL.hcBand = null;
    r = run('cHc', 0, '1년 미만');
    is(r.n.length === 5, '경계를 못 받으면 좁히지 않고 전체를 낸다 (실제 ' + r.n.length + '명)');
    ctx.window._DRILL.hcBand = keep;
  }
}

/* ══════════════════════════════════════════════════════════════
   [8] 인당 지표 — 분자와 분모가 «다른 축»으로 좁혀지는 자리
   ══════════════════════════════════════════════════════════════ */
console.log('\n[8] 인당 왜곡 안내는 없앴다 — 두 벌 필터가 그 문제를 풀었다 (v118)');
{
  /* v112 에 「사업부는 분자만 좁아진다 / 팀은 분모만 좁아진다」를 카드에 적었다.
     그때는 필터가 한 벌이라 분모를 좁힐 방법이 아예 없어서 맞는 경고였다.
     v114 에 필터가 두 벌이 된 뒤로는 «사실이 아니다» — 사업부(설비)를 걸면서 인원 기준
     필터로 그 사업부 담당 인원을 같이 좁히면 분모도 함께 좁혀진다(사용자 지적).
     ⚠ 문제를 해결한 뒤에도 경고를 남겨 두면 화면이 거짓말을 한다. 경고를 지우는 것도
       고치는 일의 일부다 — 남은 경고는 다음 사람에게 «아직 문제가 있다»고 말한다. */
  const R = noCmt(rd('report/index.html'));
  is(!/perWarn/.test(R), 'report — 인당 왜곡 안내(perWarn)가 남아 있지 않다');
  is(!/사업부는 설비에만 걸/.test(R), 'report — 「사업부는 분자만 좁아진다」 문구가 없다');
  is(!/팀은 인원에만 걸/.test(R), 'report — 「팀은 분모만 좁아진다」 문구가 없다');
  /* 대신 두 벌 필터가 실제로 있는지는 t-filters [9-5] 가 «동작»으로 본다 —
     경고를 지우는 근거가 그 검사다. 여기서는 그 검사가 살아 있는지만 확인한다. */
  const TF = rd('tests/t-filters.mjs');
  is(/\[9-5\] 설비 기준 \/ 인원 기준이 서로 독립인지/.test(TF),
     '두 벌이 독립임을 «동작»으로 지키는 검사가 살아 있다 (경고를 지운 근거)');
}

console.log('\n[9] PM 판정 — TBM 은 어느 구분이든 · 조치는 국내만 (v118)');
{
  /* 사용자 확정 셋을 거쳐 여기 왔다:
       v113 국내는 「조치」에 «설비 PM»·«SWAP» 이 PM 이다 (TBM 으로만 세면 국내가 통째로 빠진다)
       v116 「TBM 도 PM 으로 잡아줘 — 조치열에 빠져 있어도 단계가 일단 TBM 이니까」
       v118 「해외는 기존 로직 그대로. 국내는 별도니까」 → 조치 경로는 국내 전용
     결론: 작업단계 TBM 이면 PM(어느 구분이든) · 국내는 «거기에 더해» 조치 경로.
     ⚠ 그러면 PM 과 非PM 이 겹칠 수 있다 — BM 행의 조치가 「SWAP PM」인 경우가 실제로 있다.
       겹친 채로 두면 공수가 두 번 세어져 총합이 부푼다. */
  const m = CORE.match(/GST\.PM = \{[\s\S]*?\n\};/);
  is(!!m, 'core — PM 판정이 GST.PM 한 곳에 있다');
  if (m) {
    const G = { upk: v => String(v == null ? '' : v).toUpperCase(), ORG: { REGION_KR: '국내' } };
    new Function('GST', m[0])(G);
    const PM = G.PM;
    const R = (region, stage, action) => ({ region, stage, action });

    is(PM.is(R('해외','TBM','')) === true,  '작업단계 TBM 이면 PM (해외)');
    is(PM.is(R('국내','TBM','')) === true,  '작업단계 TBM 이면 PM (국내) — 조치가 비어도');
    is(PM.is(R('국내','TBM','파츠교체')) === true, 'TBM 이면 조치가 달라도 PM');
    is(PM.is(R('해외','tbm','')) === true, '대소문자·공백이 흔들려도 잡는다');

    /* 조치 경로 — 구분을 안 가린다(v117). 해외에만 다른 규칙을 두면 같은 물음에
       구분마다 다른 답을 내는 셈이고, 해외 시트가 같은 낱말을 쓰면 그 공수가 조용히 빠진다. */
    is(PM.is(R('국내','BM','SWAP PM')) === true, '조치에 SWAP 이면 작업단계와 무관하게 PM (국내)');
    is(PM.is(R('해외','BM','SWAP PM')) === false,
       '해외는 조치를 안 본다 — 예전 로직 그대로 (사용자 확정 v118)');
    is(PM.is(R('국내','','설비 PM')) === true,   '국내: 조치에 «설비 PM» 이면 PM');
    is(PM.is(R('국내','BM','설비PM 실시')) === true, '공백이 없어도 잡는다');
    is(PM.is(R('국내','BM','파츠교체 후 가동')) === false, '그 밖의 조치는 PM 이 아니다');
    is(/x\.region !== GST\.ORG\.REGION_KR/.test(m[0]),
       'core — 조치 경로가 국내 전용임이 판정 안에 있다');

    /* ⚠ 겹침 — 같은 행이 PM 과 非PM 에 «둘 다» 들어가면 공수가 두 번 세어진다. */
    const dual = R('국내','BM','SWAP PM');
    is(PM.is(dual) && !PM.svc(dual), '겹치는 행은 PM 쪽에만 들어간다 (공수 이중 계산 차단)');
    is(PM.maint(dual) === true, '그래도 «정비성 작업» 총합에는 들어간다');
    const tb = R('국내','TBM','');
    is(PM.maint(tb) === true && PM.svc(tb) === false, 'TBM 은 PM 쪽에만 (非PM 에 겹치지 않는다)');
    is(PM.svc(R('해외','BM','')) === true && PM.is(R('해외','BM','')) === false, '그냥 BM 은 非PM');

    /* ── 非PM 의 «범위»가 국내·해외로 갈린다 (v119 · 사용자 확정) ──
       해외 — 서비스 4단계(BM·CBM·CM·CRM)만 非PM. 설치는 뺀다. 별도 지시 전까지 유지.
       국내 — PM 을 뺀 «작업건 전부»가 非PM. 단계 목록으로 거르지 않는다.
       ⚠ 국내에 단계 허용목록을 쓰면 목록에 없는 단계의 공수가 «조용히» 사라진다 —
         국내 작업단계 어휘가 해외와 같다는 근거가 없다. */
    is(PM.maint(R('해외','반입','')) === false, '해외: 설치(반입)는 정비성 작업이 아니다');
    is(PM.maint(R('해외','SET-UP','')) === false, '해외: SET-UP 도 아니다');
    is(PM.maint(R('해외','처음보는단계','')) === false,
       '해외: 목록에 없는 단계는 안 센다 (4단계 허용목록 유지)');
    is(PM.maint(R('국내','반입','')) === true && PM.svc(R('국내','반입','')) === true,
       '국내: PM 이 아닌 작업건은 단계가 무엇이든 非PM 이다');
    is(PM.maint(R('국내','처음보는단계','')) === true,
       '국내: 처음 보는 단계도 非PM 으로 센다 (조용히 사라지지 않게)');
    is(PM.svc(R('국내','TBM','')) === false && PM.svc(R('국내','BM','SWAP PM')) === false,
       '국내: PM 으로 잡힌 행은 非PM 에 겹치지 않는다');
    /* 총합은 언제나 PM + 非PM 이다 — 어느 구분이든 한 행이 정확히 한 쪽에만 들어간다. */
    [['국내','반입',''],['국내','TBM',''],['국내','BM','SWAP PM'],['국내','BM',''],
     ['해외','TBM',''],['해외','BM',''],['해외','반입','']].forEach(function(c){
      const x = R(c[0],c[1],c[2]);
      const both = (PM.is(x)?1:0) + (PM.svc(x)?1:0);
      is(both === (PM.maint(x)?1:0),
         c[0]+' '+(c[1]||'(공란)')+(c[2]?' + '+c[2]:'')+' — PM·非PM 중 정확히 한 쪽 (겹침도 누락도 없음)');
    });

    /* 어휘가 운영단위마다 다르다 — 무엇이 잡혔는지 셀 수 있어야 사람이 알려 줄 수 있다.
       화면에는 안 적는다(사용자 요청) — 물으면 이 목록으로 답한다. */
    const got = PM.matched([R('국내','BM','SWAP PM'), R('국내','BM','SWAP PM'),
                            R('국내','','설비 PM'), R('국내','BM','파츠교체'),
                            R('해외','TBM',''), R('국내','TBM','')]);
    is(got.length === 2 && got[0][0] === 'SWAP PM' && got[0][1] === 2,
       'matched() 가 «조치로 잡힌 값»만 건수 순으로 준다 (실제 ' + JSON.stringify(got) + ')');
    /* ⚠ TBM 으로 잡힌 행을 같이 세면 «(공란) N건»이 목록을 덮는다 — 이 목록의 쓸모는
       «어떤 낱말이 잡히나»이므로 조치 경로만 센다. */
    is(!got.some(a => a[0] === '(공란)'), 'TBM 으로 잡힌 행은 조치 목록에 안 섞인다');
    is(PM.byAction(R('국내','TBM','SWAP PM')) === false, 'byAction — TBM 은 조치 경로가 아니다');
    is(PM.byAction(R('해외','BM','SWAP PM')) === false, 'byAction — 해외는 조치 경로가 아니다');
  }

  /* 부르는 쪽 — 인자가 «작업단계»가 아니라 «행»이어야 한다.
     옛 호출부(isPM(x.stage))가 하나라도 남으면 국내가 조용히 전부 false 가 된다. */
  const RS = noCmt(rd('report/index.html'));
  is(/const isPM=x=>GST\.PM\.is\(x\);/.test(RS), 'report — isPM 이 행을 받는다');
  is(/const isSvc=x=>GST\.PM\.svc\(x\);/.test(RS), 'report — 非PM 도 GST.PM 을 지난다');
  is(!/isPM\(x\.stage\)|isSvc\(x\.stage\)|isMaint\(x\.stage\)/.test(RS),
     'report — 작업단계만 넘기는 옛 호출부가 남아 있지 않다 (남으면 국내가 조용히 0 이 된다)');
  is(!/const isSvcS=/.test(RS), 'report — 안 쓰는 판정 헬퍼를 남겨 두지 않는다');
  /* 근거를 구분별로 적는다 — 규칙이 국내·해외가 다르므로 한 줄로 뭉치면 어느 규칙으로
     잡힌 숫자인지 알 수 없고, 그게 곧 「PM 공수 어떻게 뽑았냐」로 돌아온다. */
  is(/matched: function\(rows\)\{/.test(CORE),
     'core — 잡힌 조치를 셀 수 있는 자리는 남겨 둔다 (화면엔 안 적어도 물으면 답한다)');
}

/* ══════════════════════════════════════════════════════════════
   [10] PM 점검 탭도 같은 판정을 쓰는지 (v115 · 사용자 지시)
   ══════════════════════════════════════════════════════════════ */
console.log('\n[10] PM 점검 탭이 국내 PM 을 잡는지 (v115)');
{
  /* 이 페이지는 `작업단계 !== 'TBM'` 한 줄로 걸렀다. 국내는 TBM 표기가 드물어 PM 점검이
     통째로 안 잡혔고, 화면은 「국내는 PM 을 안 한다」처럼 보였다 — 스케줄·준수율·공수가
     전부 0 인데 에러는 하나도 안 난다.
     ⚠ 판정을 여기 다시 적으면 주간현황과 «같은 물음에 다른 답»을 낸다(제2원칙). */
  const PMS = noCmt(rd('pm/index.html'));
  is(/const isPMr = r => GST\.PM\.is\(pmRow\(r\)\);/.test(PMS),
     'pm — PM 판정이 GST.PM 한 곳을 지난다');
  is(/region:GST\.ORG\.region\(r\[C\.op\]\|\|''\), stage:r\[C\.maint\], action:r\[C\.action\]/.test(PMS),
     'pm — 판정에 필요한 셋(구분·작업단계·조치)을 넘긴다');
  is(!/!=='TBM'/.test(PMS), 'pm — 「작업단계 TBM」 한 줄로 거르던 자리가 남아 있지 않다');
  /* 사용자 확정 — 조치가 최상위 로직이라 BM 이어도 PM 이면 PM 이고, 그때 非PM(BM)에서는 뺀다.
     안 빼면 같은 행이 양쪽에 잡혀 «대당 BM» 이 부푼다. */
  is(/const isBMr = r => GST\.PM\.stg\(r\[C\.maint\]\)==='BM' && !isPMr\(r\);/.test(PMS),
     'pm — 고장(BM) 집계에서 PM 으로 잡힌 행을 뺀다 (한 행이 두 번 세어지지 않게)');
  is(/if\(!isBMr\(r\)\)return;/.test(PMS), 'pm — 그 판정을 실제로 부른다');
  /* 네 자리가 다 옮겨졌는지 — 하나라도 남으면 그 카드만 국내를 못 본다. */
  const n = (PMS.match(/isPMr\(r\)/g)||[]).length;
  is(n >= 4, 'pm — TBM 을 보던 자리 넷이 다 옮겨졌다 (실제 ' + n + '곳)');
  /* 근거를 화면이 말한다 — 어휘가 운영단위마다 달라 «덜 잡힌» 것을 숫자로만 알 수 없다. */
  is(!/PM 근거 = /.test(PMS), 'pm — PM 근거를 상태줄에 적지 않는다 (요청)');
  /* 화면 문구가 「TBM 기준」이라고 못 박고 있으면 국내에서 거짓말이 된다. */
  is(!/TBM 기준/.test(PMS) && !/TBM based/.test(PMS),
     'pm — 「TBM 기준」이라고 적지 않는다 (국내는 조치 컬럼이다)');
}

/* ══════════════════════════════════════════════════════════════
   [11] 시트와 맞대어 볼 수 있는 자리가 있는지 (v119)
   ══════════════════════════════════════════════════════════════ */
console.log('\n[11] 공수 세부내역이 시트와 견줄 수 있는 꼴인지 (v119)');
{
  /* 사용자가 시트에서 손으로 확인한다: 「메모리만 잡으면 H3·H4 만 남고, 2026-07 PM 총공수가
     41,650분 = 694.16h」. 그런데 화면 막대는 «인당 일평균(h)» 이라 그 값과 직접 못 견준다.
     세부내역이 유일한 대조 창구인데 셋이 막고 있었다:
       ① 행 키가 «대만이면 FAB, 아니면 고객사» — 국내는 고객사가 하나뿐이라 H3·H4 가 한 줄로 뭉쳤다
       ② 시간만 있고 «분»이 없어 41,650 과 맞댈 수 없다
       ③ 라벨이 「PM(TBM)」 — 국내는 조치 기준도 PM 이라 그 말이 거짓이다 */
  const R = noCmt(rd('report/index.html'));
  is(/const k=x\.campus\|\|x\.fab\|\|x\.custB\|\|t\('op_na'\);/.test(R),
     'report — 공수 세부내역이 «단지»로 쪼갠다 (국내 H3·H4 가 한 줄로 뭉치지 않게)');
  is(/<th>단지<\/th>/.test(R), 'report — 머리글도 단지로 (한 축에 두 낱말이 섞이지 않게)');
  is(/PM '\+M\(tp\)\+'분/.test(R), 'report — 총 «분»을 같이 적는다 (시트 합계와 그대로 견주게)');
  is(/Math\.round\(m\/60\*100\)\/100/.test(R),
     'report — 시간은 소수 2자리 (694.16h 를 그대로 견줄 수 있게)');
  is(!/PM\(TBM\)/.test(R), 'report — 「PM(TBM)」이라고 적지 않는다 (국내는 조치 기준도 PM)');
  is(/PM '\+cp\+'건 · 비PM '\+cn\+'건/.test(R),
     'report — 건수도 적는다 (합계가 다르면 «몇 건이 다른가»가 첫 단서다)');
}

/* ══════════════════════════════════════════════════════════════
   [12] 제3원칙 — 국내 전용 분기가 «사라지지» 않았는지 (v119)
   ══════════════════════════════════════════════════════════════ */
console.log('\n[12] 국내 전용 규칙이 해외와 합쳐지지 않았는지 (제3원칙)');
{
  /* 사용자 확정 — 「국내는 지금부터 내가 말하는 게 다 해외와 별도의 기준이라고 생각하면 된다.」
     ⚠ «통일»이 개선처럼 보일 때가 위험하다. 실제로 한 번 합쳤다가 되돌렸다(v117→v118) —
       조치 경로를 해외까지 넓혔는데 사용자 뜻은 정반대였다.
     판정 «함수»를 하나로 모으는 것(제2원칙)과 규칙을 한 벌로 «만드는» 것은 다른 일이다.
     함수는 하나여야 하지만, 그 안의 구분 분기는 남아 있어야 한다. */
  const KRB = [
    [CORE, /if\(x\.region !== GST\.ORG\.REGION_KR\) return false;/,
     'PM 판정 — 조치 경로는 국내 전용 (해외는 작업단계만)'],
    [CORE, /if\(x\.region === GST\.ORG\.REGION_KR\) return true;/,
     '非PM 범위 — 국내는 PM 을 뺀 작업건 전부 (해외는 4단계만)'],
    [CORE, /SVC: \['BM', 'CBM', 'CM', 'CRM'\]/,
     '해외 4단계 목록이 그대로 남아 있다 (별도 지시 전까지 유지)'],
    [CORE, /byAction: function\(x\)\{\s*return !!x && x\.region === GST\.ORG\.REGION_KR/,
     '조치 어휘 집계도 국내만 센다'],
    [noCmt(rd('report/index.html')), /const KR_ON\s*=|KR_ON/,
     '국내 알람 원장 분기(KR_ON)가 살아 있다 (v92)'],
  ];
  KRB.forEach(function(t){ is(t[1].test(t[0]), '남아 있다 — ' + t[2]); });

  /* 해외 기준이 «움직이지 않았는지» — 국내를 고치다 해외가 따라 움직이면 그것이 사고다. */
  const m = CORE.match(/GST\.PM = \{[\s\S]*?\n\};/);
  if (m) {
    const G = { upk: v => String(v == null ? '' : v).toUpperCase(), ORG: { REGION_KR: '국내' } };
    new Function('GST', m[0])(G);
    const PM = G.PM, R = (rg, st, ac) => ({ region: rg, stage: st, action: ac });
    /* 해외의 답은 v112 이전과 «한 자리도» 달라지면 안 된다. 그때 기준을 그대로 적어 둔다:
       PM = TBM · 非PM = BM·CBM·CM·CRM · 그 밖은 아무것도 아니다. */
    const OLD = [
      ['TBM', true, false], ['BM', false, true], ['CBM', false, true],
      ['CM', false, true], ['CRM', false, true],
      ['반입', false, false], ['SET-UP', false, false], ['TURN-ON', false, false],
      ['처음보는단계', false, false], ['', false, false],
    ];
    let same = true, bad = '';
    OLD.forEach(function(c){
      const x = R('해외', c[0], 'SWAP PM');   // 조치를 채워 둬도 해외는 안 봐야 한다
      if(PM.is(x) !== c[1] || PM.svc(x) !== c[2]){ same = false; bad += ' ' + (c[0]||'(공란)'); }
    });
    is(same, '해외 판정이 옛 기준과 한 자리도 다르지 않다' + (same ? '' : ' ⚠ 어긋난 단계:' + bad));
  }
}

/* ══════════════════════════════════════════════════════════════
   [13] 가동현황 표의 TOTAL 이 원본 대수와 맞는지 (v122 · 사용자 보고)

   사용자가 엑셀에서 SEC Scrubber 의 「설비상태 = Operation」을 세니 4,112 대인데
   화면 TOTAL 은 4,108 이었다. 조용히 두 군데서 빠지고 있었다:
     ① 단지(Site) 칸이 빈 설비 — 행 키가 '' 라 어느 통에도 안 담겼다(실측 반입 202대 ·
        그중 가동 3대). 같은 표의 «인원» 축(rkP)은 진작 「미배치」로 담고 있었는데
        «설비» 축만 버리고 있었다 — 한 표의 두 축이 다른 규율을 쓴 것이다.
     ② 상위 12행 밖 — 전사 기준으로 5개 단지 196대가 통째로 빠졌다(v89 가 SITES
        고정키에서 겪은 그 자리. 답도 그때와 같다 — 「기타」로 반드시 담는다).
   남은 차이 1대는 마감일(주차) 때문이고 그건 의도된 것이다.
   ══════════════════════════════════════════════════════════════ */
console.log('\n[13] 가동현황 표 — 행에 못 담은 설비를 버리지 않는지 (v122)');
{
  const R = SRC.report;
  is(/const keyI=r=>\{ const k=rkI\(r\); if\(!k\)return _NA; return _TOP\.has\(k\)\?k:_ETC; \}/.test(R),
     'report — 행 키가 없으면 «미배치», 상위 12 밖은 «기타» (어느 쪽도 버리지 않는다)');
  /* 예전 코드가 되살아나는 것을 막는다 — `if(!k)return;` 한 줄이 곧 조용한 손실이었다. */
  is(!/fINST\.forEach\(r=>\{ if\(!_isIn\(r\)\)return;\s*const k=rkI\(r\); if\(!k\)return;/.test(R),
     'report — 키 없는 설비를 통에서 빼는 옛 줄이 없다');
  is(/_ordAll\.slice\(0,12\)[\s\S]{0,220}_cut\.length\?\[\{k:_ETC[\s\S]{0,160}\?\[\{k:_NA/.test(R),
     'report — 「기타」·「미배치」 행을 실제로 세운다');
  /* 미배치가 상위 12 자리를 다투면 진짜 단지(K1 31대)가 «기타»로 접힌다 —
     조용히 사라지는 것은 고쳤는데 읽기가 나빠지는 셈이다. 순위에서 빼 둔다. */
  is(/const _ordAll=\(function\(\)\{[\s\S]{0,240}const k=rkI\(r\); if\(k\)w\[k\]=/.test(R),
     'report — 순위(상위 12)는 «진짜 단지»끼리만 다툰다 (미배치는 순위 밖)');
  /* 인원·실적도 같은 통을 봐야 한다. 설비만 «기타»로 담고 인원은 버리면
     같은 행의 두 칸이 다른 모집단을 본다. */
  is(/return \(_cut\.length && _ALLK\.has\(k\)\) \? _ETC : ''/.test(R),
     'report — 인원·실적도 상위 12 밖이면 같은 «기타» 행에 담긴다');
  /* ⚠ 그렇다고 «설비 축에 아예 없는 값»을 기타로 몰면 안 된다 — 국내는 설비가
     '삼성전자' · 인원이 'P1' 이라 어휘가 안 붙을 수 있고, 그때 빈 칸이 곧
     «자료가 없다»는 사실이다(v98 · 억지로 잇지 않는다). */
  is(/_ALLK\.has\(k\)/.test(R),
     'report — 설비 축에 아예 없는 값은 기타로 몰지 않는다 (v98 · 억지로 잇지 않는다)');
  /* ── 「비어 있는 사람은 미배치」 (v124 · 사용자 확정) ──────────────────────
     단지가 안 적힌 인원도 버리지 않는다. 그런데 미배치 «행»이 설비 기준으로만 서고
     있어서, 설비 미배치가 0 인 필터에서는 그 사람들이 어느 행에도 안 담겼다. */
  is(/const _naP=fHR\.filter\(p=>activeAt\(p,_oe\)&&rkP\(p\)===_NA\)\.length/.test(R),
     'report — 인원 쪽 미배치도 센다');
  is(/\.concat\(\(_naN\|\|_naP\)\?\[\{k:_NA/.test(R),
     'report — 미배치 행은 «설비 또는 인원» 어느 쪽에든 있으면 선다');
  /* ⚠ 같은 개념을 두 벌로 적으면 언젠가 갈라진다. 실제로 갈라져 있었다 — 차트는
     '미배치' 리터럴, 표는 t('op_na'). 한국어에서는 우연히 같지만 en/zh/ja 에서는 서로
     다른 낱말이 되어, 표의 bucket() 이 그 사람들을 어느 행에도 못 담는다. */
  is(!/\|\|'미배치'/.test(R), 'report — «미배치» 리터럴을 다시 적지 않는다 (en/zh/ja 에서 갈린다)');
  is(/const _NA_L=t\('op_na'\), _ETC_L=t\('op_etc'\)/.test(R), 'report — 이름표가 한 곳에서 나온다');
  is(/const _grpRaw=x=>x\.campus\|\|x\.fab\|\|_NA_L/.test(R), 'report — 차트도 그 이름표를 쓴다');
  is(/const _NA=_NA_L, _ETC=_ETC_L/.test(R), 'report — 표도 «같은» 이름표를 쓴다');
  /* 드릴은 render 밖이라 _NA_L 을 못 본다 — 그럴 때도 리터럴이 아니라 t() 를 쓴다. */
  /* 정의(op_na:'미배치')는 있어야 한다 — 막아야 할 것은 «폴백으로 다시 적는 것»이다. */
  is(!/\|\|\s*'미배치'/.test(R), 'report — 드릴에도 «미배치» 리터럴 폴백이 없다');
  /* 행 이름만 서면 사람이 「왜 이런 게 있지」로 읽는다. 무엇인지 한 줄로 밝힌다. */
  is(/op_na_t/.test(R) && /op_etc_t/.test(R),
     'report — 두 행이 무엇인지 노트에 적는다');
  /* 문구는 네 언어를 다 채운다(코드 관례) */
  ['op_na','op_na_t','op_etc','op_etc_t'].forEach(k => {
    const n = (rd('report/index.html').match(new RegExp('\\b' + k + ':', 'g')) || []).length;
    is(n === 4, `report — ${k} 가 네 언어에 다 있다 (실제 ${n})`);
  });
}

/* ══════════════════════════════════════════════════════════════
   [14] 가동·미가동·워런티가 사용자 정의대로인지 (v123 · 사용자 확정)

     가동 장비 대수 = 설비상태 Operation «만»
     미가동         = 「반납」과 Operation 을 뺀 «나머지 상태 전부»
     Warranty In/Out = 무상 → IN · 유상 → OUT

   세 가지가 다 «조용히» 틀리고 있었다:
     · 미가동 = 반입(4종) − 가동 이라, 반출대기·반출완료·출하대기가 어느 쪽에도 안 잡혀
       사라졌다(실측 SEC 561대).
     · 워런티 판정이 두 곳에 복제돼 있었고 설치현황만 v102 에 한글 표기를 받았다.
       주간현황은 영문만 봐서 국내 자료에서 **W/I 열이 전부 «-»** 로 떴다(사용자 보고).
   ══════════════════════════════════════════════════════════════ */
console.log('\n[14] 가동·미가동·워런티 (v123)');
{
  /* ── 판정을 실제로 돌린다 — 소스만 보면 «낱말이 맞나»를 못 본다 ── */
  const G = loadCore();
  const S = (v) => [G.EQ.isRun(v, null, null), G.EQ.isIdle(v, null, null)];
  const T = [
    ['Operation', true,  false, '가동 — 이것만 가동이다'],
    ['Set-up',    false, true,  ''],
    ['Turn-off',  false, true,  ''],
    ['반입완료',   false, true,  ''],
    /* 예전에는 이 셋이 어느 쪽에도 안 들어갔다 — 미가동을 «반입 − 가동»으로 구했기 때문 */
    ['반출대기',   false, true,  '예전에는 통째로 빠졌다'],
    ['반출완료',   false, true,  '예전에는 통째로 빠졌다'],
    ['출하대기',   false, true,  '예전에는 통째로 빠졌다'],
    ['반납',      false, false, '나간 설비 — 어느 쪽에도 안 든다(유일한 제외)'],
    /* 「반납도 Operation 도 아닌 것」이 규칙이므로 모르는 상태도 미가동이다.
       조용히 사라지지 않는 것이 이 규칙의 이점이다(그래도 건수는 따로 밝힌다). */
    ['이설대기',   false, true,  '모르는 상태도 규칙대로 미가동'],
  ];
  T.forEach(([v, wr, wi, why]) => {
    const [r, i] = S(v);
    is(r === wr && i === wi, `EQ ${JSON.stringify(v)} → 가동 ${r} · 미가동 ${i}${why ? '  (' + why + ')' : ''}`);
  });
  /* 마감일은 그대로 지킨다 — 아직 안 온 설비를 과거 마감 화면이 세면 안 된다.
     실측: Receipt date 2026-08-21 인 6대가 8/19 마감에서 빠진다. */
  const D = (s) => new Date(s + 'T00:00:00Z');
  is(!G.EQ.isIdle('반입완료', D('2026-08-21'), D('2026-08-19')),
     '미가동도 마감일을 지킨다 (아직 안 온 설비를 과거 마감이 세면 안 된다)');
  is(G.EQ.isIdle('반입완료', D('2026-08-01'), D('2026-08-19')), '마감 안쪽이면 센다');
  is(G.EQ.isIdle('출하대기', null, D('2026-08-19')), '날짜가 없으면 상태만 믿는다 (v99 규약 그대로)');
  /* 반입 4종(IN)은 손대지 않았다 — 설치현황·고장분석·TCO 의 «설비 대수» 정본이라,
     이 표를 고치려다 네 화면의 대수가 한꺼번에 움직이면 안 된다. */
  is(G.EQ.IN.join('|') === '반입완료|Set-up|Turn-off|Operation',
     'EQ.IN(반입 4종)은 그대로다 — 다른 세 화면의 설비 대수가 움직이지 않는다');

  /* ── 워런티 ── */
  [['무상','IN'],['유상','OUT'],['IN','IN'],['OUT','OUT'],
   ['Warranty In','IN'],['Warranty Out','OUT'],['','' ],['  ','']].forEach(([v,want]) => {
    is(G.WARR(v) === want, `WARR(${JSON.stringify(v)}) = ${JSON.stringify(G.WARR(v))} (기대 ${JSON.stringify(want)})`);
  });
  /* 뜻이 뒤집혀 보이는 자리 — 실측으로 확인했다(무상 행의 Warranty date 가 미래다).
     여기를 뒤집으면 W/I 와 W/O 가 통째로 바뀌는데 에러는 하나도 안 난다. */
  is(G.WARR('무상') === 'IN' && G.WARR('유상') === 'OUT',
     '무상 = 보증 안(IN) · 유상 = 보증 끝(OUT) — 뒤집으면 두 칸이 통째로 바뀐다');

  /* ── 판정이 다시 복제되지 않았는지 (제2원칙) ── */
  const R = SRC.report, SC = SRC.scrubber;
  is(/const isWI=r=>GST\.WARR\(/.test(R), 'report — 워런티 판정이 GST.WARR 한 곳을 지난다');
  is(/const wLbl=r=>GST\.WARR\(/.test(SC), 'scrubber — 같은 곳을 지난다 (두 화면이 같은 답을 낸다)');
  ['report','scrubber'].forEach(p => is(!/includes\('유상'\)/.test(SRC[p]),
    `${p} — 워런티 낱말을 페이지가 다시 적지 않는다`));
  /* 미가동을 «빼기»로 구하면 그 술어에 안 든 상태가 조용히 사라진다 — 옛 줄을 막는다 */
  is(!/const iu=ins\.length-ru/.test(R),
     'report — 미가동을 «반입 − 가동»으로 구하지 않는다 (그러면 세 상태가 사라진다)');
  is(/const idle=ins\.filter\(_isIdle\)/.test(R), 'report — 미가동을 자기 술어로 센다');
  /* W/O 는 TOTAL − W/I 라 워런티 미기재가 유상 쪽에 섞인다 — 몇 대인지 밝힌다 */
  is(/op_wna/.test(R), 'report — 워런티 미기재 대수를 노트에 밝힌다');
  ['op_wna'].forEach(k => {
    const n = (rd('report/index.html').match(new RegExp('\\b' + k + ':', 'g')) || []).length;
    is(n === 4, `report — ${k} 가 네 언어에 다 있다 (실제 ${n})`);
  });
}

/* ══════════════════════════════════════════════════════════════
   [15] 고장 차트의 세부내역도 «누른 그 칸»을 본다 (v125 · 사용자 보고)

   Alarm·고장 차트는 스택 두 단(Alarm(BM) · All By-Pass)에 합계 선이 얹혀 있다.
   그런데 어느 칸을 눌러도 Alarm(BM) 세부내역만 떴다 — All By-Pass 막대를 누른 사람은
   「왜 그거에 대한 것만 안 나오고 전체가 다 나오냐」고 읽는다.
   v111 에 인원 스택에서 겪은 것과 «같은 자리»다(onDrill 이 datasetIndex 를 버렸다).
   ══════════════════════════════════════════════════════════════ */
console.log('\n[15] 고장 차트 세부내역이 누른 데이터셋을 따르는지 (v125)');
{
  const R = SRC.report;
  is(/if\(id==='cFt'\)return drillFault\(p,seg\);/.test(R),
     'report — onDrill 이 «누른 칸»을 drillFault 로 넘긴다');
  is(/function drillFault\(p,seg\)/.test(R), 'report — drillFault 가 그것을 받는다');
  /* ⚠ 인덱스가 아니라 «이름»으로 갈라야 한다 — All By-Pass 데이터셋은 값이 있을 때만
     생기므로(hasABP) 인덱스가 상황에 따라 달라진다. */
  is(/seg===L\.abp \? 'abp' : seg===L\.tot \? 'tot' : 'alarm'/.test(R),
     'report — 데이터셋 «이름»으로 가른다 (인덱스는 ABP 유무에 따라 달라진다)');
  is(/lbl:\{alarm:t\('ft_alarm'\),abp:t\('ft_abp'\),tot:t\('ft_tot'\)\}/.test(R),
     'report — 이름표는 차트가 실제로 그린 그 글자를 넘긴다 (여기서 다시 만들지 않는다)');
  /* 올바이패스 자료를 안 실으면 보여줄 것이 없어 알람으로 되돌아간다 */
  is(/krABP:KRBf\.map\(krAsWk\)/.test(R), 'report — 국내 올바이패스 행을 드릴에 싣는다');
  is(/abpTW:_abpTW/.test(R), 'report — 해외 올바이패스 건수도 싣는다');
  /* ⚠ 대만 ABP 는 크로스탭이라 «행이 없다». 건수만 맞고 목록이 비면 «잘렸나»로 읽힌다 —
     없는 것을 알람 행으로 채우면 그게 거짓말이므로, 왜 없는지를 적는다. */
  is(/크로스탭\)라 행 목록이 없습니다/.test(R),
     'report — 해외 올바는 행이 없다는 사실을 적는다 (없는 것을 채우지 않는다)');
  /* 제목·요약 라벨도 따라가야 한다 — 「고장 상세」라고 적으면 그 창이 거짓말을 한다 */
  is(/showDrill\(\(pick==='abp'\?L\.abp:pick==='tot'\?L\.tot:'고장'\)\+' 상세 · '/.test(R),
     'report — 창 제목이 누른 칸을 따라간다');
  is(/const sumL=pick==='abp'\?L\.abp:pick==='tot'\?L\.tot:'BM 고장 건수'/.test(R),
     'report — 요약 숫자의 이름표도 따라간다');
  /* 옛 줄이 되살아나는 것을 막는다 — 그 한 줄이 곧 이 결함이었다 */
  is(!/if\(id==='cFt'\)return drillFault\(p\);/.test(R),
     'report — seg 를 버리는 옛 줄이 없다');
}

console.log('\n' + (fail ? '❌ t-quiet ' + fail + ' 실패 / ' + (pass + fail)
                         : '✅ t-quiet ' + pass + '/' + pass));
process.exit(fail ? 1 : 0);
