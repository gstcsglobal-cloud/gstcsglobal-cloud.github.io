/* 엑셀(.xlsx) 업로드가 «CSV 로 올렸을 때와 같은 값»을 내는가 (v95).

   왜 필요한가. 사용자가 CSV 변환을 그만두고 xlsx 를 그대로 올리기로 했다. 그런데 엑셀은
   날짜·시각·숫자를 «셀 값»으로 들고 있어서, 문자열로 바꾸는 규칙이 CSV 관례와 조금만
   달라도 조용히 갈린다. 실제로 이 검사를 만들면서 셋을 잡았다:
     ① 시각만 있는 칸(15:00)을 엑셀은 1899-12-30 에 얹어 저장한다 → `1899-12-30 15:00:00`
     ② 날짜 칸이 `2026-08-14 00:00:00` 이 되어 CSV 의 `2026-08-14` 와 달라진다
     ③ 부동소수 찌꺼기 `0.30000000000000004`
   ①②는 «같은 날인데 다른 문자열» 을 만들어 구간 교체·중복 판정을 어긋나게 한다.

   실데이터는 쓰지 않는다 — 워크북을 여기서 지어내 만든다. */
import fs from 'fs';
import path from 'path';
import * as XLSX from './node_modules/xlsx/xlsx.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };
const is  = (c, m) => c ? ok(m) : bad(m);
const eq  = (a, b, m) => is(a === b, m + '  (' + JSON.stringify(a) + (a === b ? '' : ' ≠ ' + JSON.stringify(b)) + ')');

/* 업로드 페이지의 cellStr·sheetRows 를 «소스에서 그대로» 떼어 온다.
   복사해 두면 페이지를 고쳐도 검사는 옛 규칙을 지키게 된다 — 그러면 검사가 아니다. */
const SRC = fs.readFileSync(path.join(ROOT, 'upload/index.html'), 'utf8');
function grab(name){
  const i = SRC.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' 를 upload/index.html 에서 찾지 못했습니다');
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}
const { cellStr, sheetRows } =
  new Function('GST', grab('cellStr') + '\n' + grab('sheetRows') + '\nreturn {cellStr, sheetRows};')({ _esc: s => s });

console.log('\n[1] 셀 → 문자열 규칙');
eq(cellStr(new Date(2026, 7, 14)),               '2026-08-14',          '자정 정각은 날짜만 (CSV 와 같게)');
eq(cellStr(new Date(2026, 7, 14, 13, 28, 32)),   '2026-08-14 13:28:32', '시각이 있으면 날짜+시각');
// 엑셀은 «시각만» 있는 칸을 1899-12-30 에 얹어 저장한다
eq(cellStr(new Date(1899, 11, 30, 15, 0, 0)),    '15:00:00',            '시각만 있는 칸은 시각만');
// 밀리초는 초로 반올림 — 엑셀 시리얼을 풀면 .556 같은 찌꺼기가 붙는다
eq(cellStr(new Date(2026, 7, 14, 13, 28, 32, 556)), '2026-08-14 13:28:33', '밀리초는 초로 반올림');
eq(cellStr(1),        '1',    '정수는 1 (1.0 이 아니다)');
eq(cellStr(2093),     '2093', '천 단위 쉼표를 넣지 않는다');
eq(cellStr(0.1 + 0.2), '0.3', '부동소수 찌꺼기를 떨어낸다');
eq(cellStr(true),     'TRUE', '참/거짓은 시트 CSV 표기로');
eq(cellStr(null),     '',     'null 은 빈 문자열');
eq(cellStr(''),       '',     '빈 셀은 빈 문자열');

console.log('\n[2] 워크시트 → 2차원 배열 (CSV 경로와 같은 모양)');
{
  /* 값은 전부 지어낸 것이다 — 머리글만 실제 시트와 같은 이름을 쓴다(그래야 SPEC 이 붙는다). */
  const aoa = [
    ['No', '실적코드', '작업시작일', '작업시작시간', '실적등록일', '작업시간(분)', '비고'],
    [1, 'ZZZ-0001', new Date(2026, 7, 14), new Date(1899, 11, 30, 15, 0, 0),
        new Date(2026, 7, 16, 13, 28, 32), 30, ''],
    [2, 'ZZZ-0002', new Date(2026, 7, 15), new Date(1899, 11, 30, 9, 5, 0),
        new Date(2026, 7, 16, 9, 0, 0), 2093, '메모'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '실적현황');
  // 실제 업로드와 같은 경로: 바이너리로 굽고 다시 읽는다(cellDates 포함)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const rows = sheetRows(XLSX, XLSX.read(buf, { type: 'buffer', cellDates: true }).Sheets['실적현황']);

  eq(rows.length, 3, '행 수가 보존된다 (머리글 포함)');
  eq(rows[0].join('|'), 'No|실적코드|작업시작일|작업시작시간|실적등록일|작업시간(분)|비고', '머리글이 그대로');
  eq(rows[1][2], '2026-08-14', '날짜 칸 — 날짜만');
  eq(rows[1][3], '15:00:00',   '시각 칸 — 시각만 (1899-12-30 이 안 붙는다)');
  eq(rows[1][5], '30',         '숫자 칸');
  eq(rows[2][5], '2093',       '네 자리 숫자에 쉼표가 없다');
  is(rows.every(r => r.every(c => typeof c === 'string')), '모든 칸이 문자열이다 (CSV 파싱 결과와 같은 타입)');
}

console.log('\n[3] 날짜 칸이 대시보드가 파싱할 수 있는 꼴인가');
{
  /* `new Date('2026-08-14 00:00:00')` 은 브라우저마다 다르게 해석될 수 있다.
     날짜만 남기는 규칙 덕분에 ISO 로 떨어지는지 확인한다. */
  const v = cellStr(new Date(2026, 7, 14));
  is(/^\d{4}-\d{2}-\d{2}$/.test(v), '날짜는 YYYY-MM-DD');
  is(!isNaN(new Date(v + 'T00:00:00Z').getTime()), 'ISO 로 파싱된다');
  eq(v.slice(0, 10), '2026-08-14', 'left(...,10) 구간 교체가 그대로 통한다');
}

console.log('\n[4] 업로드 화면이 xlsx 를 «모든 표»에 대해 받는가');
{
  is(/accept="[^"]*\.xlsx/.test(SRC), '파일 칸이 .xlsx 를 받는다');
  is(!/은 CSV 를 받습니다/.test(SRC), '「CSV 만 받는다」며 거부하던 분기가 없다');
  is(/id="ssel"/.test(SRC) && /시트가 여럿/.test(SRC), '시트가 여럿이면 고를 수 있다');
  // 변환기는 한 벌이어야 한다 — 알람(다중 시트)도 같은 sheetRows 를 지난다
  is((SRC.match(/sheetRows\(XLSX/g) || []).length >= 2, '알람 경로도 같은 변환기를 쓴다 (두 벌이면 갈라진다)');
  is(!/sheet_to_json\(wb\.Sheets\[pair\[0\]\]/.test(SRC), '알람 경로에 옛 복제 변환이 남아 있지 않다');
}

console.log('\n[5] 천 단위 쉼표 — CSV 로 올린 옛 행도 숫자로 읽히는가');
{
  const CORE = fs.readFileSync(path.join(ROOT, 'assets/core.js'), 'utf8');
  is(/GST\.numv\s*=\s*function/.test(CORE), 'core 에 GST.numv 가 있다');
  const numv = new Function('return ' + /GST\.numv\s*=\s*(function[\s\S]*?\n\};)/.exec(CORE)[1].replace(/;$/, ''))();
  eq(numv('2,093'), 2093, "'2,093' 을 2093 으로 읽는다 (Number 는 NaN 이었다)");
  eq(numv('117'),   117,  '쉼표 없는 값도 그대로');
  eq(numv(30),      30,   '숫자는 그대로');
  is(Number.isNaN(numv('')),   '빈칸은 NaN — 0 이 아니다 (없음과 0 을 구별해야 한다)');
  is(Number.isNaN(numv(null)), 'null 도 NaN');
  ['material', 'fault', 'pm'].forEach(p => {
    const S = fs.readFileSync(path.join(ROOT, p, 'index.html'), 'utf8');
    is(!/Number\(r\[C\.(qty|daysPaid|daysPrev|workMin|manMin|workerCnt)\]\)/.test(S),
       p + ' — 숫자 칸을 Number() 로 직접 읽지 않는다');
  });
}

console.log('\n' + (fail ? '❌ t-xlsx ' + fail + ' 실패 / ' + (pass + fail)
                         : '✅ t-xlsx ' + pass + '/' + pass));
process.exit(fail ? 1 : 0);
