/* 카드 내보내기 한 벌 (v135 · 3단계) — 실제 브라우저 · 픽스처 불필요 · 자료는 지어낸다.
   [1] 여덟 종류 카드(.card·.trend-card·.cross-card·.tablecard) 안의 캔버스 «전부»에 「내보내기 ▾」가 붙는가
   [2] 메뉴가 차트 종류를 따라가는가 — 막대는 PPT·엑셀·데이터, 산점도는 그림(PNG)만
   [3] 데이터 복사가 표(HTML+TSV)를 내는가
   [4] 엑셀 «차트 개체» — 부품 다섯이 다 있고, 시트 참조·캐시·막대 방향·스택·도넛이 화면 값과 같은가 ·
       openpyxl 이 차트를 읽는가 · LibreOffice 가 연다(«복구» 없이)
   [5] 도넛이 PPT 네이티브로 가고 가운데 TOTAL 이 화면 플러그인과 같은 수인가
   [6] 소스 — 「📋 그림」이 사라졌는가 · 여덟 페이지가 GST.capBtns 한 벌인가 · hover 없는 기기 규칙 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import JSZip from 'jszip';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const NM = path.join(ROOT, 'tests', 'node_modules') + '/';
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

const HTML = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/theme.css">
<style>.card,.trend-card,.cross-card,.tablecard{position:relative;width:420px;height:260px;margin:8px}</style>
<div class="card"><h3>막대+꺾은선</h3><div class="mini-per"><button>주</button><button>월</button></div><div class="cw"><canvas id="cBar"></canvas></div></div>
<div class="trend-card"><h3>가로 스택</h3><canvas id="cHor"></canvas></div>
<div class="cross-card"><h3>도넛</h3><canvas id="cDonut"></canvas></div>
<div class="tablecard"><h3>산점</h3><table><tr><td>x</td></tr></table><canvas id="cSc"></canvas></div>
<div class="card"><h3>없는 차트</h3><canvas id="cNone"></canvas></div>
<script src="/chart.js"></script><script src="/core.js"></script>`;

const browser = await chromium.launch(PW);
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.route('http://gst.test/**', r => {
  const u = r.request().url();
  if (u.endsWith('/core.js')) return r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') });
  if (u.endsWith('/chart.js')) return r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(NM + 'chart.js/dist/chart.umd.js', 'utf8') });
  if (u.endsWith('/theme.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(ROOT + '/assets/theme.css', 'utf8') });
  if (u.endsWith('/jszip.min.js')) return r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(NM + 'jszip/dist/jszip.min.js', 'utf8') });
  return r.fulfill({ status: 200, contentType: 'text/html', body: HTML });
});
await page.goto('http://gst.test/', { waitUntil: 'load' });
await page.evaluate(() => {
  GST.ZIP_VENDOR = '/jszip.min.js'; GST.ZIP_CDN = '/jszip.min.js';
  window.CH = {};
  CH.bar = new Chart(document.getElementById('cBar'), { type: 'bar',
    data: { labels: ['1월', '2월', '3월'], datasets: [
      { label: '알람', data: [3, 5, 2], backgroundColor: '#ff0000' },
      { label: '올바', data: [1, 0, 4], backgroundColor: '#00ff00' },
      { type: 'line', label: '합계', data: [4, 5, 6], borderColor: '#0000ff', yAxisID: 'y2' }] },
    options: { animation: false, scales: { y: {}, y2: { position: 'right' } }, plugins: { valLabel: { mode: 'top' } } } });
  CH.hor = new Chart(document.getElementById('cHor'), { type: 'bar',
    data: { labels: ['A', 'B'], datasets: [{ label: 'x', data: [10, 20], backgroundColor: '#111111' }, { label: 'y', data: [1, 2], backgroundColor: '#222222' }] },
    options: { animation: false, indexAxis: 'y', scales: { x: { stacked: true }, y: { stacked: true } } } });
  CH.donut = new Chart(document.getElementById('cDonut'), { type: 'doughnut',
    data: { labels: ['IN', 'OUT', 'NA'], datasets: [{ data: [30, 12, 8], backgroundColor: ['#10b981', '#f59e0b', '#64748b'] }] },
    options: { animation: false } });
  CH.sc = new Chart(document.getElementById('cSc'), { type: 'scatter',
    data: { datasets: [{ label: 's', data: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] }, options: { animation: false } });
  GST.capBtns();
});

console.log('[1] 카드 종류를 가리지 않고 캔버스마다 「내보내기 ▾」 한 벌');
const inj = await page.evaluate(() => {
  const out = {};
  ['cBar', 'cHor', 'cDonut', 'cSc', 'cNone'].forEach(id => { const cv = document.getElementById(id); const card = GST.cardOf(cv);
    const box = card && card.querySelector('.capbtns'); out[id] = { box: !!box, btn: !!(box && box.querySelector('[data-gexp="' + id + '"]')), right: box ? box.style.right : null, n: box ? box.querySelectorAll('.capbtn').length : 0 }; });
  return out;
});
['cBar', 'cHor', 'cDonut', 'cSc', 'cNone'].forEach(id => is(inj[id].box && inj[id].btn && inj[id].n === 1, id + ': 버튼 한 개 (' + JSON.stringify(inj[id]) + ')'));
is(/px$/.test(inj.cBar.right || '') && parseInt(inj.cBar.right) > 14, '주/월 토글이 있는 카드는 버튼이 그만큼 왼쪽으로 (' + inj.cBar.right + ')');
is(inj.cHor.right === '', '토글이 없는 카드는 기본 자리');

console.log('[2] 메뉴는 «그 차트»를 따라간다');
const menuOf = async (id) => page.evaluate((id) => {
  document.querySelectorAll('.gexp-menu').forEach(m => m.remove());
  const btn = document.querySelector('[data-gexp="' + id + '"]'); btn.click();
  const m = GST.cardOf(btn).querySelector('.gexp-menu'); if (!m) return null;
  return { acts: [...m.querySelectorAll('[data-act]')].map(b => b.dataset.act + (b.disabled ? '!' : '')), hint: m.querySelector('.gexp-hint').textContent };
}, id);
let m = await menuOf('cBar');
is(m && m.acts.join(',') === 'ppt,xlsx,data', '막대+꺾은선: PPT·엑셀·데이터 (PNG 없음) — ' + (m && m.acts));
is(m && /Ctrl\+C/.test(m.hint), '안내가 «파일을 열어 복사» 를 말한다');
m = await menuOf('cDonut');
is(m && m.acts.join(',') === 'ppt,xlsx,data', '도넛도 네이티브: PPT·엑셀·데이터 — ' + (m && m.acts));
m = await menuOf('cSc');
is(m && m.acts.join(',') === 'ppt!,xlsx!,data,png', '산점도: PPT·엑셀은 막히고 PNG 가 뜬다 — ' + (m && m.acts));
is(m && /그림/.test(m.hint), '왜 그림인지 적는다: ' + (m && m.hint));
m = await menuOf('cNone');
is(m && m.acts.join(',') === 'ppt!,xlsx!,data!', '차트가 없는 캔버스: 전부 막힌다 — ' + (m && m.acts));
const tog = await page.evaluate(() => { const btn = document.querySelector('[data-gexp="cBar"]'); document.querySelectorAll('.gexp-menu').forEach(x => x.remove());
  btn.click(); const a = !!document.querySelector('.gexp-menu'); btn.click(); const b = !!document.querySelector('.gexp-menu'); return [a, b]; });
is(tog[0] === true && tog[1] === false, '같은 버튼을 다시 누르면 닫힌다');
await page.evaluate(() => { document.querySelector('[data-gexp="cBar"]').click(); });
await page.keyboard.press('Escape');
is(await page.evaluate(() => !document.querySelector('.gexp-menu')), 'Esc 로 닫힌다');

console.log('[3] 데이터 복사 — 표(HTML) + 탭 구분 텍스트');
const clip = await page.evaluate(async () => {
  const got = {};
  /* http 오리진에는 navigator.clipboard 자체가 없다 — 실물처럼 write/writeText 를 흉내낸다 */
  const fake = { write: async (items) => { const it = items[0]; got.html = await it.getType('text/html').then(b => b.text()); got.tsv = await it.getType('text/plain').then(b => b.text()); },
                 writeText: async (t) => { got.tsv = t; } };
  Object.defineProperty(navigator, 'clipboard', { value: fake, configurable: true });
  if (!window.ClipboardItem) window.ClipboardItem = class { constructor(o){ this.o = o; } getType(t){ return Promise.resolve(this.o[t]); } };
  await GST.copyChartData('cBar'); return got;
});
is(clip.tsv === '\t1월\t2월\t3월\n알람\t3\t5\t2\n올바\t1\t0\t4\n합계\t4\t5\t6', 'TSV 가 라벨·계열·값 그대로다');
is(/막대\+꺾은선/.test(clip.html) && /<table/.test(clip.html), 'HTML 표에 카드 제목이 붙는다: ' + String(clip.html).slice(0, 140));

console.log('[4] 엑셀 «차트 개체» (.xlsx)');
const xl = await page.evaluate(async () => {
  const mk = async (id) => { const ch = GST.chartOf(id); const r = GST._chartLight(ch); let src; try { src = GST.pptSrc(ch); } finally { r(); }
    const bytes = await GST.xlsxChart(src, GST.cardTitle(id)); return Array.from(bytes); };
  return { bar: await mk('cBar'), hor: await mk('cHor'), donut: await mk('cDonut') };
});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-xlsx-'));
const parts = {};
for (const k of Object.keys(xl)) {
  const buf = Buffer.from(xl[k]); fs.writeFileSync(path.join(tmp, k + '.xlsx'), buf);
  const z = await JSZip.loadAsync(buf); parts[k] = {};
  for (const n of Object.keys(z.files)) if (!z.files[n].dir) parts[k][n] = await z.file(n).async('string');
}
const NEED = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml',
  'xl/worksheets/_rels/sheet1.xml.rels', 'xl/drawings/drawing1.xml', 'xl/drawings/_rels/drawing1.xml.rels', 'xl/charts/chart1.xml'];
is(NEED.every(n => parts.bar[n]), '부품 아홉이 다 있다(rels·drawing·chart·Override) — 하나라도 빠지면 엑셀이 «복구»를 띄우고 차트를 버린다');
is(/drawing1\.xml".*drawing\+xml/.test(parts.bar['[Content_Types].xml']) && /chart1\.xml".*chart\+xml/.test(parts.bar['[Content_Types].xml']), 'Content_Types 에 drawing·chart Override');
is(/<drawing r:id="rId1"\/>/.test(parts.bar['xl/worksheets/sheet1.xml']), 'sheet1 이 drawing 을 가리킨다');
const cb = parts.bar['xl/charts/chart1.xml'];
is(/<c:barChart>[\s\S]*<c:barDir val="col"\/>/.test(cb) && /<c:lineChart>/.test(cb), '막대+꺾은선 콤보');
is(/Sheet1!\$B\$1:\$D\$1/.test(cb) && /Sheet1!\$B\$2:\$D\$2/.test(cb) && /Sheet1!\$A\$2/.test(cb), '시트 참조가 라벨(B1:D1)·값(B2:D2)·이름(A2)을 가리킨다');
is(/<c:v>알람<\/c:v>/.test(cb) && /<c:v>3<\/c:v>/.test(cb) && /<c:v>5<\/c:v>/.test(cb), '캐시에 화면 값이 그대로');
is(/<c:valAx><c:axId val="40"\/>/.test(cb) && /<c:crosses val="max"\/>/.test(cb), '보조축(y2) 꺾은선은 오른쪽 축');
is(/<c:showVal val="1"\/>/.test(cb), '화면이 값을 찍으면 엑셀도 찍는다');
const sh = parts.bar['xl/worksheets/sheet1.xml'];
is(/<t xml:space="preserve">1월<\/t>/.test(sh) && /<c r="B2"><v>3<\/v><\/c>/.test(sh), '시트에도 라벨·값이 들어 있다(참조가 사는 곳)');
const chh = parts.hor['xl/charts/chart1.xml'];
is(/<c:barDir val="bar"\/>/.test(chh) && /<c:grouping val="stacked"\/>/.test(chh) && /<c:overlap val="100"\/>/.test(chh), '가로 스택: barDir=bar · stacked · overlap 100');
const cd = parts.donut['xl/charts/chart1.xml'];
is(/<c:doughnutChart>/.test(cd) && /<c:holeSize val="55"\/>/.test(cd) && (cd.match(/<c:dPt>/g) || []).length === 3, '도넛: doughnutChart · 조각 셋에 색');
is(/srgbClr val="10B981"/.test(cd) && /srgbClr val="F59E0B"/.test(cd), '조각 색이 화면 색이다');
/* openpyxl — «엑셀 차트로 읽히는가». 파일이 열리기만 하는 것과 차트가 살아 있는 것은 다르다. */
try {
  const py = `import openpyxl,sys\nfor k in ['bar','hor','donut']:\n  wb=openpyxl.load_workbook(sys.argv[1]+'/'+k+'.xlsx'); ws=wb.active\n  print(k, len(ws._charts), ws['B1'].value, ws['B2'].value)\n`;
  const out = execSync('python3 -c "' + py.replace(/"/g, '\\"') + '" ' + tmp, { encoding: 'utf8' });
  is(/bar 1 1월 3/.test(out) && /hor 1 A 10/.test(out) && /donut 1 IN 30/.test(out), 'openpyxl 이 세 파일에서 차트 1개씩과 셀 값을 읽는다: ' + out.trim().replace(/\n/g, ' | '));
} catch (e) { is(false, 'openpyxl 검증 실패: ' + (e.stderr || e.message).toString().slice(0, 200)); }
/* LibreOffice Calc — 실제로 «열리는가». 파일이 열리기만 하는 것과 차트가 살아 있는 것은 다르므로
   openpyxl(위)이 차트를 읽는지가 본 검사이고, 이것은 «복구 없이 열린다»의 추가 확인이다.
   ⚠ Calc 가 없는 환경(impress 만 깔린 상자·CI 러너)에서는 건너뛰되 «건너뛰었다»고 말한다 — 조용한 초록불은 안 된다. */
{
  let calc = false;
  try {
    execSync('python3 -c "import openpyxl;wb=openpyxl.Workbook();wb.active[\'A1\']=1;wb.save(\'' + tmp + '/plain.xlsx\')"', { stdio: 'pipe' });
    execSync('soffice --headless -env:UserInstallation=file:///tmp/gst-lo-profile --convert-to pdf --outdir ' + tmp + ' ' + tmp + '/plain.xlsx', { stdio: 'pipe', timeout: 120000 });
    calc = fs.existsSync(tmp + '/plain.pdf') && fs.statSync(tmp + '/plain.pdf').size > 0;
  } catch (e) { calc = false; }
  if (!calc) console.log('  ⚠️  LibreOffice Calc 가 없어 «실제로 열리는가» 확인을 건너뛰었다 (openpyxl 구조 검사만 했다)');
  else {
    for (const k of ['bar', 'hor', 'donut']) {
      try {
        execSync('soffice --headless -env:UserInstallation=file:///tmp/gst-lo-profile --convert-to pdf --outdir ' + tmp + ' ' + tmp + '/' + k + '.xlsx', { stdio: 'pipe', timeout: 120000 });
        const pdf = fs.existsSync(tmp + '/' + k + '.pdf') ? fs.statSync(tmp + '/' + k + '.pdf').size : 0;
        is(pdf > 1000, 'LibreOffice Calc 가 ' + k + '.xlsx 를 연다 (pdf ' + pdf + ' bytes)');
      } catch (e) { is(false, 'LibreOffice 변환 실패(' + k + '): ' + (e.message || '').slice(0, 200)); }
    }
  }
}

console.log('[5] 도넛 → PPT 네이티브 · 가운데 TOTAL 은 화면 플러그인과 같은 식');
const dn = await page.evaluate(() => {
  const ch = GST.chartOf('cDonut'); const why = GST.pptNativeOK(ch); const src = GST.pptSrc(ch);
  const calls = []; const slide = { addChart: (t, d, o) => calls.push({ t, d, o }), addText: (s, o) => calls.push({ text: String(s), o }) };
  GST.pptCombo({ ChartType: { doughnut: 'DOUGHNUT', pie: 'PIE', bar: 'BAR', line: 'LINE' } }, slide, src, 1, 1, 6, 4);
  const sc = GST.pptNativeOK(GST.chartOf('cSc'));
  return { why, src, calls, sc };
});
is(dn.why === '', '도넛은 «넘어간다» (pptNativeOK 빈 문자열)');
is(dn.src.pie && dn.src.hole && dn.src.total === 50, 'pptSrc 가 pie 소스를 낸다 · 합 50 = 화면 dCenter 와 같은 식(datasets[0] 합)');
is(dn.calls[0] && dn.calls[0].t === 'DOUGHNUT' && dn.calls[0].o.holeSize > 0 && dn.calls[0].d[0].values.join() === '30,12,8', 'addChart(doughnut) 에 화면 값 그대로');
is(dn.calls.some(c => c.text === '50') && dn.calls.some(c => c.text === 'TOTAL'), '가운데에 「50」과 「TOTAL」 글자를 얹는다');
is(dn.sc && /산점/.test(dn.sc), '산점도는 여전히 그림: ' + dn.sc);
is(errs.length === 0, 'JS 에러 0건' + (errs.length ? ' — ' + errs.join(' | ') : ''));
await browser.close();

console.log('[6] 소스 — 「📋 그림」이 사라졌고 버튼은 한 벌');
const PAGES = ['report', 'fault', 'material', 'pm', 'scrubber', 'tco', 'cip', 'hr'];
for (const p of PAGES) {
  const s = fs.readFileSync(ROOT + '/' + p + '/index.html', 'utf8');
  is(!/📋 그림/.test(s) && !/onclick="copyChart\(/.test(s), p + ': 「📋 그림」 버튼이 없다');
  is(/GST\.capBtns\(/.test(s), p + ': GST.capBtns 한 벌');
}
const core = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
const theme = fs.readFileSync(ROOT + '/assets/theme.css', 'utf8');
is(!/\.mcard/.test(core) && !/\.mcard/.test(theme), '죽은 .mcard 선택자가 core·theme 에 없다');
is(/@media \(hover:none\)\{\.capbtns\{opacity:\.55\}\}/.test(theme), '태블릿(hover 없음)에서도 버튼이 보인다');
is(/const cvs = GST\.chartCanvases\(\)/.test(core), '상단바 PPT 도 같은 선택자(CARD_SEL)를 본다 — 추이·크로스·표 카드 차트가 안 빠진다');
const rep = fs.readFileSync(ROOT + '/report/index.html', 'utf8');
is(/function chartToGrid\(id\)\{ return GST\.chartGrid\(/.test(rep) && !/function gridToRichHTML\(g,title\)\{/.test(rep), 'report 의 표 복사 기계는 core 위임만 남았다');
is(/GST\.EXP_T = \{[\s\S]*ja:\{btn:/.test(core), '메뉴 문구가 네 언어');
console.log((fail ? '❌' : '✅') + ' t-export: ' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
