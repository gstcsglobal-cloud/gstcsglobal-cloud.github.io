/* t-motion — 움직임·모달 기본색 (v169 · 「통합관리화면」 5단계).
   지키는 것: ① 주간현황(report · report-kr)에는 움직임 클래스가 안 붙는다(손대지 않는다) ② 나머지 화면에는 붙는다
   ③ 움직임 줄이기를 고르면 카드 애니메이션이 없다 ④ 팝업(.gov)의 기본색이 라이트다(테마 클래스가 아직 없어도) · 다크는 theme-slate 일 때만
   ⑤ KPI 값이 «바뀌면» 잠깐 표식이 붙고 «처음 그릴 때»는 안 붙는다 ⑥ 표식이 사라질 때 떠오르기 애니메이션이 다시 돌지 않는다.
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
for (const p of ['report', 'report-kr', 'fault', 'material', 'pm', 'scrubber', 'tco', 'cip', 'hr', 'hub', 'site']) {
  const pg = await ctx.newPage(); await pg.goto(BASE + '/' + p + '/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(400);
  on[p] = await pg.evaluate(() => document.body.classList.contains('gst-motion')); await pg.close();
}
is(!on.report && !on['report-kr'], '주간현황·주간현황(국내)에는 안 붙는다');
is(['fault','material','pm','scrubber','tco','cip','hr','hub','site'].every(p => on[p]), '나머지 화면에는 붙는다 (' + Object.keys(on).filter(k => on[k]).join(',') + ')');
console.log('[2] 카드 · KPI');
let pg = await ctx.newPage(); const pe = []; pg.on('pageerror', e => pe.push(e.message));
await pg.goto(BASE + '/fault/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(800);
const an = await pg.evaluate(() => getComputedStyle(document.querySelector('.card')).animationName);
is(an === 'gstRise', '카드가 떠오른다 (' + an + ')');
await pg.waitForTimeout(800);
const tf = await pg.evaluate(() => getComputedStyle(document.querySelector('.card')).transform);
if (process.env.DBG) console.log('    tf=', tf, await pg.evaluate(() => { const c=document.querySelector('.card'); return [c.className, getComputedStyle(c).animationName, getComputedStyle(c).animationPlayState, c.getAnimations().map(a=>a.animationName+':'+a.playState+':'+a.currentTime)]; }));
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
console.log('[4] 움직임 줄이기');
ctx = await ctxOf(true); pg = await ctx.newPage(); await pg.goto(BASE + '/fault/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(500);
is(await pg.evaluate(() => getComputedStyle(document.querySelector('.card')).animationName) === 'none', '카드 애니메이션 없음');
await ctx.close();
await browser.close(); srv.close();
console.log(fail ? `\n❌ t-motion: ${pass} 통과 · ${fail} 실패` : `\n✅ t-motion: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
