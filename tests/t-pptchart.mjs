/* t-pptchart — PPT 가 «그림»이 아니라 편집 가능한 «차트»로 나가는가 (v134)
 *
 * 사용자 보고: 「차트에서 바로 PPT 로 따는 건 안 되나? 예전에 해줬던 것 같은데」.
 * 이력을 복원해 보니 정말 있었다 — 2026-08-04 에 양식 수술 방식이 들어오면서
 * 네이티브 차트 내보내기가 `_downloadPPT_legacy` 로 개명돼 «아무도 안 부르는» 코드가 됐고,
 * 그 뒤로 일곱 페이지의 PPT 는 전부 그림이었다.
 *
 * 이 검사가 지키는 것 넷:
 *   ① 브라우저는 클립보드에 «차트 개체»를 못 올린다 → 그래서 파일로 준다 (구조로 확인)
 *   ② 만들어진 pptx 에 «진짜 차트 XML + 임베드 워크북»이 들어 있다
 *   ③ 워크북의 숫자가 «화면이 그린 값»과 같다 — 「데이터 편집」이 다른 말을 하면 안 된다
 *   ④ 못 옮기는 차트(도넛·산점도·수치축)는 그림으로 남기되 «어느 카드인지 밝힌다»
 *
 * ⚠ 실데이터를 쓰지 않는다. 값은 여기서 지어낸다.
 *   실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-pptchart.mjs
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import XLSX from 'xlsx';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

console.log('[1] 자체 호스팅 — 사내망이 CDN 을 막아도 도는 길이 있는가');
{
  const C = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
  is(fs.existsSync(ROOT + '/assets/vendor/pptxgen.bundle.js'), 'assets/vendor/pptxgen.bundle.js 가 저장소에 있다');
  is(fs.existsSync(ROOT + '/assets/vendor/jszip.min.js'), 'assets/vendor/jszip.min.js 가 저장소에 있다');
  /* ⚠ 버전이 CDN 폴백과 어긋나면 «어떤 사람은 되고 어떤 사람은 안 되는» 상태가 된다. */
  const ver = (fs.readFileSync(ROOT + '/assets/vendor/pptxgen.bundle.js', 'utf8').match(/PptxGenJS ([\d.]+)/) || [])[1];
  const cdn = (C.match(/pptxgenjs@([\d.]+)/) || [])[1];
  is(ver && ver === cdn, `자체 사본(${ver}) 과 CDN 폴백(${cdn}) 버전이 같다`);
  is(/GST\._loadScript\(\[GST\.PPT_VENDOR, GST\.PPT_CDN\]/.test(C), '자체 사본을 «먼저» 본다 (CDN 은 폴백)');
  /* v135 — /upload/ 의 xlsx 리더도 같은 규율. 버전이 폴백과 어긋나면 «어떤 사람은 되고 어떤 사람은 안 되는» 상태 */
  is(fs.existsSync(ROOT + '/assets/vendor/xlsx.full.min.js'), 'assets/vendor/xlsx.full.min.js 가 저장소에 있다');
  const xv = (fs.readFileSync(ROOT + '/assets/vendor/xlsx.full.min.js', 'utf8').match(/\.version="([\d.]+)"/) || [])[1];
  const xc = (C.match(/npm\/xlsx@([\d.]+)/) || [])[1];
  is(xv && xv === xc, `xlsx 자체 사본(${xv}) 과 CDN 폴백(${xc}) 버전이 같다`);
  is(/GST\._loadScript\(\[GST\.XLSX_VENDOR, GST\.XLSX_CDN\]/.test(fs.readFileSync(ROOT + '/upload/index.html', 'utf8')), '/upload/ 가 공용 로더로 xlsx 를 받는다 (자체 사본 먼저)');
  /* v105 규율 — CDN 이 «거부»가 아니라 «묵살»하면 onerror 가 안 온다. 시간 제한이 그 답이다. */
  is(/setTimeout\(function\(\)\{ fin\(false, new Error\('TIMEOUT'\)\); \}, ms\|\|GST\.PPT_CDN_MS\)/.test(C),
     '모든 후보에 시간 제한이 걸린다 (묵살하는 프록시에서 영영 멈추지 않는다)');
  const R = fs.readFileSync(ROOT + '/report/index.html', 'utf8');
  is(!/jszip@3\.10\.1\/dist\/jszip\.min\.js';s\.onload=res/.test(R),
     'report 의 «시간 제한 없던» JSZip 로더가 사라졌다');
  is(/GST\.zipLoad\(\)/.test(R), 'report 가 공용 GST.zipLoad 를 쓴다 (로더가 한 벌이다)');
  /* v135 — supabase-js 도 같은 규율. 인증과 모든 읽기의 «현관문»인데 CDN `@2` 로 열려 있어 버전이
     어느 날 바뀌는 유일한 의존성이었고, 로더에 시간 제한이 없어 사내망이 묵살하면 검은 화면이 영영 남았다. */
  is(fs.existsSync(ROOT + '/assets/vendor/supabase.min.js'), 'assets/vendor/supabase.min.js 가 저장소에 있다');
  const sv = (fs.readFileSync(ROOT + '/assets/vendor/supabase.min.js', 'utf8').match(/supabase-js\/([\d.]+)/) || [])[1];
  const sc = (C.match(/@supabase\/supabase-js@([\d.]+)\//) || [])[1];
  const sk = (C.match(/GST\.SB_VER\s*=\s*'([\d.]+)'/) || [])[1];
  is(sv && sv === sc && sv === sk, `supabase-js 자체 사본(${sv}) · CDN 폴백(${sc}) · GST.SB_VER(${sk}) 이 같다`);
  is(/GST\._loadScript\(\[GST\.SB_VENDOR, GST\.SB_CDN\], function\(\)\{ return !!global\.supabase; \}, 15000\)/.test(C),
     'GST.sb 가 공용 로더(자체 사본 먼저 · 15초)로 supabase-js 를 받는다');
  is(!/supabase-js@2\/dist/.test(C), "core 에 열린 버전(@2)의 CDN 주소가 없다");
  is(/catch\(e\)\{ return GST\._sbFail; \}/.test(C) && (C.match(/return GST\._sbFail;/g)||[]).length >= 3,
     '로그인 세 함수가 로더 실패를 받아 문구로 돌려준다 (버튼이 「전송 중…」에 굳지 않는다)');
}

console.log('\n[2] 죽어 있던 네이티브 차트 코드가 살아났는가');
{
  const C = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
  const R = fs.readFileSync(ROOT + '/report/index.html', 'utf8');
  ['pptHex', 'pptSrc', 'pptCombo', 'pptNativeOK', 'pptLabels', 'pptCard', 'pptCardBtn'].forEach(n =>
    is(new RegExp('GST\\.' + n + '\\s*=').test(C), `core.js 에 GST.${n}`));
  is(!/_downloadPPT_legacy/.test(R), 'report 의 «아무도 안 부르던» _downloadPPT_legacy 가 사라졌다');
  is(!/^function pptSrc\(/m.test(R) && !/^function pptCombo\(/m.test(R),
     '같은 함수가 report 에 남아 있지 않다 (두 벌이면 갈라진다 — 제2원칙)');
  is(/addChart\(types,o\)/.test(C), 'pptCombo 가 addChart(네이티브)를 부른다 — addImage 가 아니다');
  /* pptAuto 가 실제로 네이티브를 «먼저» 보는가. 그림은 폴백이어야 한다. */
  is(/if\(it\.src\)\{[\s\S]{0,200}GST\.pptCombo\(p, s, it\.src/.test(C),
     'pptAuto 가 네이티브를 먼저 넣는다 (그림은 폴백)');
  /* 여덟 페이지가 «같은» 버튼을 쓴다 — 한 곳이 빠지면 그 화면만 버튼이 없다. */
  ['report','fault','material','pm','scrubber','tco','cip','hr'].forEach(f =>
    is(/GST\.capBtns\(/.test(fs.readFileSync(ROOT + '/' + f + '/index.html', 'utf8')),
       `${f} — 카드 버튼이 공용 한 벌(GST.capBtns)이다`));
}

console.log('\n[3] Chart.js 옵션 프록시에 «읽은 것을 도로 써 넣지» 않는가 (실사고)');
{
  /* ⚠ 주석을 «걷어낸 뒤» 본다. 이 규칙을 설명하는 주석 자체가 그 꼴을 담고 있어서,
     그냥 grep 하면 고쳐 놓고도 붉게 뜬다(t-filters 가 겪은 거짓 판정과 같은 자리). */
  const C = fs.readFileSync(ROOT + '/assets/core.js', 'utf8')
              .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  is(!/ax\.ticks\s*=\s*ax\.ticks\s*\|\|/.test(C) && !/ax\.grid\s*=\s*ax\.grid\s*\|\|/.test(C),
     '축 옵션을 자기 자신에게 대입하지 않는다 (무한 재귀 → PPT 전체 실패)');
  is(!/labels\s*=\s*pl\.legend\.labels\s*\|\|/.test(C), '범례 옵션도 마찬가지다');
  is(/const ensure = function\(o,k\)\{ if\(o && !o\[k\]\) o\[k\] = \{\}; return o \? o\[k\] : null; \}/.test(C),
     '«없을 때만 만든다» — 읽은 값을 되쓰지 않는다');
  /* 한 차트의 실패가 전 장표를 죽이지 않는가 */
  is(/try\{ oc = GST\.chartHiResLight\(cv\.id\); \}catch\(e\)\{ oc = null; \}/.test(C),
     '그림 캡처가 실패해도 내보내기가 통째로 죽지 않는다');
}

console.log('\n[3-2] 가로 막대(indexAxis:y)를 «수치축»으로 잘못 떨어뜨리지 않는가');
{
  const C = fs.readFileSync(ROOT + '/assets/core.js', 'utf8')
              .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  /* 가로 막대는 «범주축이 y» 다. x 만 보면 설치현황·인원 화면의 막대 상당수가 통째로
     그림으로 떨어진다(실측 「법인별 설치」·「Customer」·「교육 단계 퍼널」). */
  is(/GST\.pptCatAxis\s*=/.test(C), 'core — 범주축 판정이 한 곳에 있다 (GST.pptCatAxis)');
  is(/const cax=GST\.pptCatAxis\(ch\);[\s\S]{0,200}ch\.scales\[cax\]/.test(C),
     'pptNativeOK 가 «범주축»을 보고 판정한다 (x 로 못 박지 않는다)');
  is(/ch\.scales\[GST\.pptCatAxis\(ch\)\]/.test(C), 'pptLabels 도 범주축에서 눈금을 읽는다');
  /* 값축을 잘못 읽으면 범주 개수(0~N)가 값 범위로 들어가 막대가 찌그러진다. */
  is(/\[\[horiz\?'x':'y','y'\],\['y2','y2'\]\]/.test(C), '가로 막대의 «값축»에서 경계를 읽는다');
  is(/barDir:src\.horiz\?'bar':'col'/.test(C), 'pptCombo 가 가로/세로를 실제로 반영한다');
  /* 이름 없는 계열에 pptxgenjs 가 «Series1» 을 적는다 — 화면에 없는 글자다. */
  is(/showLegend:src\.bars\.concat\(src\.lines\)\.some/.test(C),
     '이름 있는 계열이 있을 때만 범례를 켠다 (Series1 이 찍히지 않게)');
}

console.log('\n[4] 슬라이드 크기 — 배치가 장표 밖으로 나가지 않는가 (실사고)');
{
  const C = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
  /* 배치는 X=0.76 · W=11.83 · ROWY[1]=4.06 으로 13.33 × 7.5 in 을 전제한다.
     LAYOUT_16x9 는 10 × 5.625 in 이라 오른쪽 칸과 아랫줄이 통째로 «밖»에 그려졌다. */
  is(!/layout='LAYOUT_16x9'/.test(C), 'LAYOUT_16x9(10in) 를 쓰지 않는다');
  is((C.match(/layout='LAYOUT_WIDE'/g) || []).length >= 2, 'pptAuto·pptCard 둘 다 LAYOUT_WIDE(13.33in)');
  const W = +(C.match(/const X=([\d.]+), W=([\d.]+)/) || [])[2];
  const X = +(C.match(/const X=([\d.]+), W=([\d.]+)/) || [])[1];
  is(X + W <= 13.34, `가로 배치가 장표 안에 든다 (X ${X} + W ${W} = ${(X+W).toFixed(2)} ≤ 13.33)`);
}

console.log('\n[5] 양식 PPT — 사내 경로가 저장소에서 사라졌는가');
{
  const buf = fs.readFileSync(ROOT + '/report/qbr-template.pptx');
  const z = await JSZip.loadAsync(buf);
  const hits = [];
  for (const n of Object.keys(z.files)) {
    if (!/\.(xml|rels)$/.test(n)) continue;
    const t = await z.file(n).async('string');
    (t.match(/[A-Za-z]:\\[^"<>\s]{4,80}|file:\/\/\/[^"<>\s]{4,90}/g) || []).forEach(m => hits.push(n + ' → ' + m.slice(0, 50)));
  }
  is(!hits.length, '양식 안에 사내 파일 경로가 없다' + (hits.length ? ' → ' + hits[0] : ''));
  let ext = 0;
  for (const n of Object.keys(z.files)) {
    if (!/ppt\/charts\/_rels\/chart\d+\.xml\.rels$/.test(n)) continue;
    if (/relationships\/oleObject/.test(await z.file(n).async('string'))) ext++;
  }
  is(ext === 0, `차트가 «외부» 워크북을 가리키지 않는다 (남은 것 ${ext}개)`);
}

console.log('\n[6] 양식 내보내기 — 임베드 워크북이 «화면이 그린 값»과 같은가');
{
  const API = (await import(ROOT + '/assets/qbr-ppt.js')).default
           || (await import('module')).createRequire(import.meta.url)(ROOT + '/assets/qbr-ppt.js');
  const tpl = fs.readFileSync(ROOT + '/report/qbr-template.pptx');
  /* chart7 의 카테고리는 «엑셀 날짜 시리얼»이다(report 의 catsM = exSer(월말)). 실물대로 준다. */
  const CATS = [...Array(12)].map((_, i) => API.excelSerial(new Date(Date.UTC(2025, 9 + i, 0))));
  const AL = [291, 287, 274, 296, 322, 193, 240, 269, 248, 266, 247, 286];
  const AB = [2, 1, 4, 0, 3, 5, 1, 2, 0, 4, 1, 3];
  const TOT = AL.map((v, i) => v + AB[i]);
  const out = await API.build(JSZip, tpl, {
    week: 'W35', corp: 'GST GLOBAL', notes: [],
    charts: { chart7: { cats: CATS, series: { 'Micron F11': AL, 'Micron F16': AB, 'Micron_Total': TOT },
                        rename: { 'Micron F11': 'Alarm(BM)', 'Micron F16': 'All By-Pass', 'Micron_Total': 'Total' } } } });
  const z = await JSZip.loadAsync(out);
  const emb = Object.keys(z.files).filter(n => /^ppt\/embeddings\/.+\.xlsx$/.test(n));
  is(emb.length === 1, `임베드 워크북이 생긴다 (실제 ${emb.length}개)`);
  const cx = await z.file('ppt/charts/chart7.xml').async('string');
  is(/<c:externalData r:id="rIdEmb"/.test(cx), '차트가 그 워크북을 가리킨다');
  /* ⚠ 치환 문자열의 `$1` 이 캡처로 읽혀 카테고리 참조가 깨진 적이 있다(실측 $B$2:$M$2). */
  is(/<c:f>Sheet1!\$B\$1:\$M\$1<\/c:f>/.test(cx), '카테고리 참조가 1행을 가리킨다 (치환의 $1 이 캡처로 새지 않았다)');
  /* 이 양식의 <c:tx> 는 «리터럴 이름»이라(참조가 아니라) 돌릴 것이 없다 —
     참조로 된 양식이 오면 A열을 가리켜야 한다. 둘 다 옳으므로 조건부로 본다. */
  { const ser1 = /<c:ser>[\s\S]*?<\/c:ser>/.exec(cx)[0];
    const tx = (/<c:tx>[\s\S]*?<\/c:tx>/.exec(ser1) || [''])[0];
    is(/<c:f>/.test(tx) ? /<c:f>Sheet1!\$A\$2<\/c:f>/.test(tx) : /<c:v>Alarm\(BM\)<\/c:v>/.test(tx),
       '계열 이름 — 참조면 A열을 가리키고, 리터럴이면 화면 이름 그대로다'); }
  const rels = await z.file('ppt/charts/_rels/chart7.xml.rels').async('string');
  is(/rIdEmb/.test(rels) && !/TargetMode="External"/.test(rels), '관계가 «내부» 워크북이다');
  is(/Extension="xlsx"/.test(await z.file('[Content_Types].xml').async('string')), 'Content_Types 에 xlsx 가 등록된다');
  /* ⚠ 여기가 핵심이다. 양식의 «옛 숫자»로 워크북을 만들면 「데이터 편집」을 누르는 순간
     차트가 그 값으로 되돌아간다 — 고치려다 더 나쁘게 만드는 자리다. 캐시가 정본이다. */
  const wb = XLSX.read(await z.file(emb[0]).async('nodebuffer'), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const row = n => (rows.slice(1).find(r => String(r[0]) === n) || []).slice(1);
  is(JSON.stringify(rows[0].slice(1)) === JSON.stringify(CATS.map(String)),
     '워크북 1행이 «내보낸 카테고리»와 같다');
  is(JSON.stringify(row('Alarm(BM)')) === JSON.stringify(AL), '워크북의 Alarm 행이 «내보낸 값»과 같다');
  is(JSON.stringify(row('All By-Pass')) === JSON.stringify(AB), '올바 행도 같다');
  is(JSON.stringify(row('Total')) === JSON.stringify(TOT), '합계 행도 같다');
  /* 이름표는 «화면이 쓰는 그 글자»여야 한다 — 양식 원문(Micron F11)이 남으면 거짓말이다. */
  is(!rows.some(r => /Micron F11|Micron F16/.test(String(r[0]||''))), '워크북 계열명이 양식 원문이 아니라 화면 이름이다');
}

console.log(fail ? `\n❌ t-pptchart ${pass}/${pass + fail}` : `\n✅ t-pptchart ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
