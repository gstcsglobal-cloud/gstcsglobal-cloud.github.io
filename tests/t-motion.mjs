/* t-motion — 움직임·모달 기본색 (v169 · 「통합관리화면」 5단계).
   지키는 것: ① v178 부터 주간현황(report)에도 움직임 클래스가 붙는다(사용자 지시 「이펙트는 주간현황까지 전 페이지」) ② 나머지 화면에도 붙는다
   ③ 움직임 줄이기를 고르면 카드 애니메이션이 없다 ④ 팝업(.gov)의 기본색이 라이트다(테마 클래스가 아직 없어도) · 다크는 theme-slate 일 때만
   ⑤ KPI 값이 «바뀌면» 잠깐 표식이 붙고 «처음 그릴 때»는 안 붙는다 ⑥ 표식이 사라질 때 떠오르기 애니메이션이 다시 돌지 않는다.
   ⑦ v193 — 고장 분석은 «언제나» 움직임이 없다(GST.FX_OFF · 사용자 「이 페이지만 기본값이 효과 아예 없게」). 그래서 대표 화면은 자재 사용이다.
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-motion.mjs */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };
const MIME = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html' };
const srv = http.createServer((rq, rs) => { let u = decodeURIComponent(rq.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.statusCode = 404; rs.end('nf'); return; }
  rs.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); rs.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(0, r));
const BASE = 'http://127.0.0.1:' + srv.address().port;
const NM = ROOT + '/tests/node_modules/';
const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return false;};GST.getSession=async function(){return {user:{email:"t@t"}};};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();if(GST._authOk)GST._authOk();return true;};';
const browser = await chromium.launch(PW);
async function ctxOf(reduce) {
  const ctx = await browser.newContext({ viewport:{ width:1400, height:900 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => { let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
    r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) }); });
  await ctx.route('**/assets/core.js*', r => r.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB }));
  await ctx.route('**/cdn.jsdelivr.net/**', r => { const u = r.request().url();
    if (u.includes('chart.umd')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM + 'chart.js/dist/chart.umd.js', 'utf8') });
    if (u.includes('papaparse')) return r.fulfill({ status:200, contentType:'application/javascript', body:fs.readFileSync(NM + 'papaparse/papaparse.min.js', 'utf8') });
    return r.fulfill({ status:200, contentType: u.endsWith('.css') ? 'text/css' : 'application/javascript', body:'' }); });
  await ctx.route('**/spreadsheets/**', r => r.fulfill({ status:200, contentType:'text/csv', body:'' }));
  await ctx.route('**supabase**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));
  return ctx;
}
console.log('[1] 어느 화면에 붙나');
let ctx = await ctxOf(false);
const on = {};
for (const p of ['report', 'fault', 'material', 'pm', 'scrubber', 'tco', 'cip', 'hr', 'hub']) {
  const pg = await ctx.newPage(); await pg.goto(BASE + '/' + p + '/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(400);
  on[p] = await pg.evaluate(() => document.body.classList.contains('gst-motion')); await pg.close();
}
is(on.report, '주간현황에도 붙는다 (v178)');
is(['material','pm','scrubber','tco','cip','hr','hub'].every(p => on[p]), '나머지 화면에는 붙는다 (' + Object.keys(on).filter(k => on[k]).join(',') + ')');
is(!on.fault, '고장 분석에는 안 붙는다 (v193 · 효과 없이 · t-fx [10] 과 같은 판정)');
console.log('[2] 카드 · KPI');
let pg = await ctx.newPage(); const pe = []; pg.on('pageerror', e => pe.push(e.message));
await pg.goto(BASE + '/material/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(800);
/* «첫 화면 안에서 보이는» 첫 카드를 고른다 — 첫 화면 밖 카드는 떠오르기 대신 스크롤 등장(v175)이라 animation 이 none 이 맞다.
   v179 에 범위 띠가 한 줄 들어오면서 고장분석의 DOM 첫 카드가 900px 아래로 밀려 그쪽이 됐다(제품은 맞고 검사의 가정이 틀렸다).
   떠오르는 것은 카드 다섯 종류(theme.css 의 gstRise 선택자와 같은 목록)이므로 그 안에서 고른다 */
await pg.evaluate(() => { const c = [...document.querySelectorAll('.card,.trend-card,.cross-card,.tablecard,.kpi')].find(c => { const r = c.getBoundingClientRect(); return r.height > 0 && r.top < innerHeight && getComputedStyle(c).display !== 'none'; }); if (c) c.setAttribute('data-tm', '1'); });
const an = await pg.evaluate(() => { const c = document.querySelector('[data-tm]'); return c ? getComputedStyle(c).animationName : 'no-card-in-view'; });
is(an === 'gstRise', '첫 화면의 카드가 떠오른다 (' + an + ')');
await pg.waitForTimeout(800);
const tf = await pg.evaluate(() => { const c = document.querySelector('[data-tm]'); return c ? getComputedStyle(c).transform : 'no-card'; });
if (process.env.DBG) console.log('    tf=', tf, await pg.evaluate(() => { const c=document.querySelector('[data-tm]'); return c ? [c.className, getComputedStyle(c).animationName, getComputedStyle(c).animationPlayState, c.getAnimations().map(a=>a.animationName+':'+a.playState+':'+a.currentTime)] : null; }));
is(tf === 'none', '떠오르기가 끝나면 transform 이 남지 않는다 (카드 안 fixed 팝업의 기준이 안 바뀐다)');
/* 처음 숫자 → 바뀐 숫자 */
await pg.waitForTimeout(2200);   // 로드 중 사람 손이 닿은 흔적이 없도록
const r1 = await pg.evaluate(async () => { const k = document.querySelector('.kpi'); const v = k.querySelector('[id]') || k; v.textContent = '12'; await new Promise(r => setTimeout(r, 60));
  const a = k.classList.contains('gst-upd'); document.body.dispatchEvent(new Event('change', { bubbles:true })); v.textContent = '15'; await new Promise(r => setTimeout(r, 60)); const b = k.classList.contains('gst-upd');
  const animDuring = getComputedStyle(k).animationName; await new Promise(r => setTimeout(r, 1000)); return { a, b, c: k.classList.contains('gst-upd'), animDuring, animAfter: getComputedStyle(k).animationName, op: getComputedStyle(k).opacity }; });
if (process.env.DBG) console.log('    r1=', JSON.stringify(r1), await pg.evaluate(() => document.querySelector('.kpi').outerHTML.slice(0,300)));
is(!r1.a && r1.b && !r1.c, 'KPI — 사람 손 없이 바뀌면(로드·자동 새로고침) 표식 없음 · 손이 닿은 직후 바뀌면 표식 · 0.9초 뒤 사라짐');
is(r1.animDuring === r1.animAfter && r1.op === '1', '표식이 붙고 떨어져도 떠오르기 애니메이션을 바꾸지 않는다(다시 깜빡이지 않는다)');
console.log('[3] 팝업 기본색');
const bg = async () => { await pg.evaluate(() => { GST._ovClose && GST._ovClose(); GST.rowsModal('t', ['a'], [['1']]); }); await pg.waitForTimeout(350);
  return pg.evaluate(() => getComputedStyle(document.querySelector('.gov-w')).backgroundColor); };
await pg.evaluate(() => { [...document.body.classList].filter(c => /^theme-/.test(c)).forEach(c => document.body.classList.remove(c)); });
const b0 = await bg();
is(b0 === 'rgb(255, 255, 255)', '테마 클래스가 없어도 팝업이 흰 바탕 (' + b0 + ')');
await pg.evaluate(() => document.body.classList.add('theme-slate')); const b1 = await bg();
is(b1 !== 'rgb(255, 255, 255)', '다크(theme-slate)에서는 어두운 바탕 (' + b1 + ')');
is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
await ctx.close();
console.log('[3b] 요약 띠가 흐른다 (v183 · 사용자 「다른 페이지도 요약이 움직이는 것으로」) — 글자는 원본 그대로 · 사본은 aria-hidden');
{
  const c3 = await ctxOf(false), p3 = await c3.newPage(); const e3 = []; p3.on('pageerror', e => e3.push(e.message));
  await p3.goto(BASE + '/material/', { waitUntil:'domcontentloaded' }); await p3.waitForTimeout(700);
  const insOf = () => p3.evaluate(() => { const b = document.getElementById('gstInsights'); if (!b) return null;
    const run = b.querySelector('.gst-ins-run');
    return { move: b.classList.contains('gst-ins-move'), wait: b.classList.contains('gst-ins-wait'),
      orig: [...b.querySelectorAll('.gst-ins')].map(x => x.textContent.replace(/\s+/g, ' ').trim()), ppt: document.querySelectorAll('#gstInsights .gst-ins').length,
      clones: b.querySelectorAll('.gst-ins-c').length, cloneHidden: [...b.querySelectorAll('.gst-ins-c')].every(c => !!c.closest('[aria-hidden="true"]')),
      anim: getComputedStyle(run).animationName, dur: run.style.getPropertyValue('--ins-d'), tf: getComputedStyle(run).transform }; });
  await p3.evaluate(() => GST.insights([{ sev:'bad', text:'고장 <b>12</b>건' }, { sev:'ok', text:'PM <b>5</b>건' }]));
  await p3.waitForTimeout(400);
  let I = await insOf();
  is(I && I.move && !I.wait && I.anim === 'gstInsRun' && /s$/.test(I.dur), '요약 띠가 흐른다 (애니메이션 ' + (I && I.anim) + ' · ' + (I && I.dur) + ')');
  is(I && I.orig.join('|') === '고장 12건|PM 5건' && I.ppt === 2, '원본 두 줄은 그대로 — PPT·검사가 읽는 «.gst-ins» 는 원본뿐 (' + (I && I.orig.join('|')) + ')');
  is(I && I.clones >= 2 && I.cloneHidden, '흐름용 사본은 화면 낭독에서 빠진다(aria-hidden) · ' + (I && I.clones) + '개');
  const t1 = I && I.tf; await p3.waitForTimeout(500); const t2 = (await insOf()).tf;
  is(t1 !== t2, '실제로 움직인다 (transform ' + t1 + ' → ' + t2 + ')');
  await p3.evaluate(() => GST.fx.set('ticker', false)); await p3.waitForTimeout(200);
  I = await insOf();
  is(I && !I.move && I.clones === 0 && I.orig.length === 2, '「효과」에서 상태 띠 흐름을 끄면 멈추고 예전 배치로 (사본 0)');
  await p3.evaluate(() => GST.fx.set('ticker', true)); await p3.waitForTimeout(200);
  is((await insOf()).move, '다시 켜면 다시 흐른다');
  is(e3.length === 0, 'JS 에러 0' + (e3.length ? ' → ' + e3[0] : ''));
  await c3.close();
  const c4 = await ctxOf(true), p4 = await c4.newPage();
  await p4.goto(BASE + '/material/', { waitUntil:'domcontentloaded' }); await p4.waitForTimeout(500);
  await p4.evaluate(() => GST.insights([{ sev:'bad', text:'고장 <b>12</b>건' }])); await p4.waitForTimeout(200);
  const R = await p4.evaluate(() => { const b = document.getElementById('gstInsights'); return { move: b.classList.contains('gst-ins-move'), clones: b.querySelectorAll('.gst-ins-c').length }; });
  is(!R.move && R.clones === 0, '움직임 줄이기 — 흐르지 않는다(사본도 없다)');
  await c4.close();
}
console.log('[4] 움직임 줄이기');
ctx = await ctxOf(true); pg = await ctx.newPage(); await pg.goto(BASE + '/material/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(500);
is(await pg.evaluate(() => getComputedStyle(document.querySelector('.card')).animationName) === 'none', '카드 애니메이션 없음');
await ctx.close();
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-motion: ${pass} 통과 · ${fail} 실패` : `\n✅ t-motion: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
