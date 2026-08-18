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
  is(/hitL: function\(k, v\)/.test(CORE), 'core — loose 판정이 GST.filters.hitL 한 곳이다');
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

console.log('\n' + (fail ? '❌ t-quiet ' + fail + ' 실패 / ' + (pass + fail)
                         : '✅ t-quiet ' + pass + '/' + pass));
process.exit(fail ? 1 : 0);
