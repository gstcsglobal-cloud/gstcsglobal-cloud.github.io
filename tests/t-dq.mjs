/* t-dq — 데이터 품질 레지스트리 (v135 · 7단계)

   무엇을 지키나.
   [1] act 가 없는 신호는 «담지 않는다» — 이 레지스트리의 존재 이유가 「무엇을 하면 되나」다.
   [2] 사실은 모두에게, 조치는 관리자에게 (A-4). 조회자에게서 «사실»을 지우면 그 사람만
       경고 없이 빈 숫자를 본다 — core 의 「조용히 틀린 숫자를 보여주지 않는다」와 정면 충돌.
   [3] reset 은 «다시 센다»는 뜻이다 — 누적하면 필터를 두 번 바꿨을 때 같은 결함이 두 줄이 된다.
   [4] 카드가 기준 시각·필터를 적는다 — 안 적으면 필터를 걸어 둔 사람이 전사 수치로 읽는다.
   [5] /diag/ 가 읽을 스냅샷을 남긴다 (언제·어떤 필터로 잰 것인지 포함).
   [6] 네 언어 — 카드 틀의 글자가 언어를 따라간다.
   [7] GST.fillHint — 30% 미만에서만 뜨고, 넘으면 «스스로 사라진다».
   [8] 소스 — 여덟 페이지가 전부 reset/push/render 를 쓰는가 · fault 사본이 되살아나지 않았는가

   ⚠ 소스로는 [2]·[4]·[7] 을 원리적으로 못 본다 — «조회자 화면에 그 글자가 찍히는가»는
     실제로 그려 봐야 안다. 실데이터는 쓰지 않는다(t-leak).
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-dq.mjs                */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

const browser = await chromium.launch(PW);
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.route('http://gst.test/**', r => {
  const u = r.request().url();
  if (u.endsWith('/core.js'))
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') });
  if (u.endsWith('/theme.css'))
    return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(ROOT + '/assets/theme.css', 'utf8') });
  return r.fulfill({ status: 200, contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/theme.css">'
        + '<div class="kpis"></div><div class="card"><canvas id="cv"></canvas><div class="cw"></div></div>'
        + '<script src="/core.js"></script>' });
});
await page.goto('http://gst.test/', { waitUntil: 'load' });

const fill = () => page.evaluate(() => {
  GST.dq.reset('fault')
    .push({ key:'a', sev:'warn', label:'미기재 3건 / BM 10건', n:3, of:10, act:'행의 ✎로 채우세요' })
    .push({ key:'b', sev:'info', label:'층을 못 찾은 작업',   n:2, of:10, act:'설치현황의 Line 칸을 채우세요' })
    .push({ key:'c', sev:'bad',  label:'act 가 없는 신호',    n:9 });            // 담기지 않아야 한다
});
const card = () => page.evaluate(() => {
  const b = document.getElementById('gstDq');
  return b ? { txt: b.textContent, rows: b.querySelectorAll('tbody tr').length,
               sev: [...b.querySelectorAll('tbody tr')].map(r => r.className),
               head: (b.querySelector('h3')||{}).textContent || '',
               note: (b.querySelector('.card-note')||{}).textContent || '' } : null;
});

console.log('[1] act 가 없는 신호는 담지 않는다');
await page.evaluate(() => { GST.authOn = () => false; GST._me = null; });   // 인증 꺼짐 = legacy = 관리자
{
  await fill();
  const n = await page.evaluate(() => GST.dq.list().length);
  is(n === 2, `셋을 넣었지만 담긴 것은 둘 (실제 ${n}) — act 없는 신호는 «무엇을 하면 되나»를 못 말한다`);
  const keys = await page.evaluate(() => GST.dq.list().map(d => d.key).join(','));
  is(keys === 'a,b', `담긴 것은 a,b (실제 ${keys})`);
}

console.log('\n[2] 관리자: 조치가 그대로 보인다');
{
  await page.evaluate(() => GST.dq.render('단지 H1'));
  const c = await card();
  is(!!c, '카드가 그려진다');
  is(c.rows === 2, `줄 수 ${c.rows} = 담긴 신호 2`);
  is(/행의 ✎로 채우세요/.test(c.txt), '조치 문장이 그대로 보인다');
  is(/미기재 3건/.test(c.txt), '사실(문장)도 보인다');
  is(/3 \/ 10/.test(c.txt), `건수를 «n / of» 로 적는다 — 분모 없이는 크기를 모른다`);
  is(c.sev.join(',') === 'dq-warn,dq-info', `등급이 줄에 실린다 (실제 ${c.sev.join(',')})`);
}

console.log('\n[3] 조회자: 사실은 보이고 조치만 가려진다 (A-4)');
{
  await page.evaluate(() => { GST.authOn = () => true; GST._me = { email:'v@v', can_write:false, role:'viewer' }; });
  await fill(); await page.evaluate(() => GST.dq.render('단지 H1'));
  const c = await card();
  is(/미기재 3건/.test(c.txt), '사실은 그대로 보인다 — 지우면 그 사람만 경고 없이 빈 숫자를 본다');
  is(!/행의 ✎로 채우세요/.test(c.txt), '조치 문장은 안 보인다');
  is(/관리자에게 알려 주세요/.test(c.txt), '대신 «누구에게 말하면 되는지»를 적는다 — 막다른 길로 두지 않는다');
  await page.evaluate(() => { GST.authOn = () => false; GST._me = null; });
}

console.log('\n[4] 기준 시각·필터를 적는다 (필터를 걸어 둔 사람이 전사 수치로 읽지 않게)');
{
  await fill(); await page.evaluate(() => GST.dq.render('단지 H1 · 구분 국내'));
  const c = await card();
  is(/단지 H1 · 구분 국내/.test(c.note), `필터를 적는다 → ${c.note}`);
  is(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(c.note), `잰 시각을 적는다 → ${c.note}`);
  await page.evaluate(() => { GST.dq.reset('fault'); GST.dq.render(''); });
  const c2 = await card();
  is(/전체/.test(c2.note), '필터가 없으면 «전체» 라고 적는다');
  is(c2.rows === 0 && /문제가 없습니다/.test(c2.txt),
     '신호가 없으면 «문제 없음»을 «말한다» — 카드가 사라지면 잰 적이 없는 것과 구분이 안 된다');
}

console.log('\n[5] reset 은 다시 센다는 뜻이다 (누적 금지)');
{
  await fill(); await fill();
  const n = await page.evaluate(() => GST.dq.list().length);
  is(n === 2, `두 번 돌려도 2 (실제 ${n}) — 누적하면 필터를 바꿀 때마다 같은 결함이 늘어난다`);
}

console.log('\n[6] /diag/ 가 읽을 스냅샷 — 언제·어떤 필터로 잰 것인지까지');
{
  await fill(); await page.evaluate(() => GST.dq.render('구분 해외'));
  const snap = await page.evaluate(() => { try{ return JSON.parse(localStorage.getItem('gst_dq_fault')||'null'); }catch(e){ return null; } });
  is(!!snap, '스냅샷이 남는다');
  is(snap && snap.items && snap.items.length === 2, `담긴 신호 수가 같다 (실제 ${snap && snap.items && snap.items.length})`);
  is(snap && snap.filter === '구분 해외', `필터가 같이 담긴다 (실제 ${snap && snap.filter})`);
  is(snap && typeof snap.at === 'number' && Math.abs(Date.now() - snap.at) < 60000,
     '잰 시각이 담긴다 — 없으면 어제 수치를 지금 것으로 읽는다');
  const other = await page.evaluate(() => { GST.dq.reset('material').push({key:'z',label:'L',act:'A'}).render('');
    return !!localStorage.getItem('gst_dq_material') && !!localStorage.getItem('gst_dq_fault'); });
  is(other, '페이지마다 따로 남는다 — 한 화면이 다른 화면의 스냅샷을 덮지 않는다');
}

console.log('\n[7] 네 언어 — 카드 틀이 언어를 따라간다');
{
  for (const [lang, word] of [['en','Data quality'],['zh','数据质量'],['ja','データ品質'],['ko','데이터 품질']]) {
    await page.evaluate(l => { try{ sessionStorage.setItem('gst_lang', l); }catch(e){} }, lang);
    await fill(); await page.evaluate(() => GST.dq.render(''));
    const c = await card();
    is(c.head === word, `${lang}: 카드 제목 «${word}» (실제 ${c.head})`);
  }
}

console.log('\n[8] GST.fillHint — 30% 미만에서만 뜨고 넘으면 스스로 사라진다');
{
  const low = await page.evaluate(() => {
    const rows = []; for (let i = 0; i < 100; i++) rows.push({ a: i < 3 ? 'x' : '' });
    const r = GST.fillHint('cv', rows, 'a');
    return { r, txt: (document.querySelector('.fill-hint')||{}).textContent || '' };
  });
  is(low.r && low.r.pct === 3, `입력률 3% 를 잰다 (실제 ${low.r && low.r.pct})`);
  is(/3%/.test(low.txt) && /3\/100/.test(low.txt), `분자·분모를 적는다 → ${low.txt.slice(0, 60)}`);
  const hi = await page.evaluate(() => {
    const rows = []; for (let i = 0; i < 100; i++) rows.push({ a: i < 50 ? 'x' : '' });
    GST.fillHint('cv', rows, 'a');
    return !!document.querySelector('.fill-hint');
  });
  is(!hi, '50% 면 안내가 사라진다 — 현장이 채워 나가는 중이라 임계를 넘으면 방해다');
  const alt = await page.evaluate(() => {
    const rows = []; for (let i = 0; i < 100; i++) rows.push({ a: '', b: i < 60 ? 'y' : '' });
    GST.fillHint('cv', rows, 'a', 'b');
    return !!document.querySelector('.fill-hint');
  });
  is(!alt, '폴백 열(altKey)이 채워져 있으면 «채워진 것»으로 센다 — 화면이 그 값을 쓰기 때문이다');
}

is(errs.length === 0, 'JS 에러 없음' + (errs.length ? ' → ' + errs.slice(0, 2).join(' | ') : ''));
await browser.close();

console.log('\n[9] 소스 — 여덟 페이지가 같은 기계를 쓰는가');
{
  const PAGES = ['report','fault','material','pm','scrubber','tco','cip','hr'];
  for (const p of PAGES) {
    const src = fs.readFileSync(path.join(ROOT, p, 'index.html'), 'utf8');
    is(new RegExp("GST\\.dq&&GST\\.dq\\.reset\\('" + p + "'\\)").test(src), `${p}: render 첫머리에서 reset 한다`);
    is(/GST\.dq\.push\(/.test(src), `${p}: 자기 자료 문제를 «담는다»`);
    is(/GST\.dq\.render\(/.test(src), `${p}: 카드를 그린다`);
  }
  /* fillHint 는 core 가 정본이다 — 페이지가 자기 판을 되살리면 «입력률 임계가 두 벌»이 된다. */
  const fa = fs.readFileSync(path.join(ROOT, 'fault/index.html'), 'utf8');
  /* ⚠ 이름이 아니라 «무엇에서 나오나»를 본다(v122 규약). fault 는 위임 래퍼를 남겨 두었으므로
     function fillHint 라는 «생김새»는 정상이다 — 되살아나면 안 되는 것은 «자체 구현»이고,
     그 표식은 임계·문구를 자기가 들고 있다는 것이다(.fill-hint 를 직접 만들거나 30 을 박거나). */
  is(!/className='fill-hint'/.test(fa) && !/pct>=30/.test(fa),
     'fault: fillHint 자체 구현이 되살아나지 않았다 — 임계·문구가 두 벌이 되면 화면마다 다른 안내가 뜬다');
  is(/GST\.fillHint\(/.test(fa), 'fault: core 의 fillHint 를 부른다');
  const rp = fs.readFileSync(path.join(ROOT, 'report/index.html'), 'utf8');
  is(/GST\.FILL_T/.test(rp), 'report: TOP3 도 입력률을 적는다 (입력률 0.3% 인데 안내가 없던 자리)');
  /* «올린 뒤 무엇을 확인하라» — 업로드는 끝이 아니라 시작이다. */
  const up = fs.readFileSync(path.join(ROOT, 'upload/index.html'), 'utf8');
  const afters = (up.match(/\bafter:'/g) || []).length;
  is(afters >= 10, `upload: 표마다 «올린 뒤 확인» 한 줄 (실제 ${afters}개)`);
  is(/PREP\.t\.after/.test(up) && /t\.after/.test(up), 'upload: 검사 화면과 완료 화면 둘 다에서 그 줄을 적는다');
  const dg = fs.readFileSync(path.join(ROOT, 'diag/index.html'), 'utf8');
  is(/renderDqAll/.test(dg) && /gst_dq_/.test(dg), 'diag: 여덟 화면의 스냅샷을 한 표로 모은다');
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + 't-dq: ' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
