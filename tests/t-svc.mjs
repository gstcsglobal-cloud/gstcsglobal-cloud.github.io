import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

/* t-svc — 회사 시스템(SVC) 화면 → 대시보드 업로드 화면으로 파일 건네기 (v210). 지어낸 화면·지어낸 자료만.
   ① SVC 의 엑셀 단추가 만든 파일(blob)을 스크립트가 잡는다 ② «보내기» → 업로드 화면이 새 창으로 열리고 처음 보는 출처는 «허용»을 묻는다
   ③ 허용하면 그 파일이 업로드 칸에 들어가고 표가 고른 것(수선실적)으로 맞춰진다 · 자동으로 적재하지 않는다
   ④ 두 번째부터는 묻지 않는다 ⑤ opener 가 아닌 창·엑셀이 아닌 파일은 받지 않는다 ⑥ 스크립트를 켜지 않은 사이트에는 판이 안 뜬다 */
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };
const MIME = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html' };
const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return false;};'
  + 'GST.getSession=async function(){return {user:{email:"t@t"}}};GST.token=async function(){return "t";};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();if(GST._authOk)GST._authOk();return true;};'
  + 'GST.sheetWrite=async function(){return {ok:true,can_write:true,role:"editor"};};'
  + 'var __q={select:function(){return __q},eq:function(){return __q},neq:function(){return __q},order:function(){return __q},limit:function(){return __q},then:function(r){return Promise.resolve({data:[],count:0,error:null}).then(r);}};'
  + 'GST.db=async function(){return {from:function(){return __q;},rpc:async function(){return {data:null,error:null};}};};';
const US = fs.readFileSync(ROOT + '/tools/svc-send/gst-svc-send.user.js', 'utf8');
const SVC_PAGE = `<!doctype html><meta charset="utf-8"><title>SVC</title><body><h1>수선실적 조회</h1>
<button id="xl" onclick="var b=new Blob(['실적코드,작업단계\\nX1,BM\\n'],{type:'text/csv'});var a=document.createElement('a');a.href=window.URL.createObjectURL(b);a.download='수선실적.csv';a.click();">엑셀 다운로드</button></body>`;

const browser = await chromium.launch(PW);
async function ctxOf(enabled) {
  const ctx = await browser.newContext({ viewport:{width:1300,height:900}, locale:'ko-KR', acceptDownloads:true });
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => {
    let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
    let body = fs.readFileSync(f); if (u === '/assets/core.js') body = body.toString('utf8') + STUB;
    r.fulfill({ status:200, contentType:MIME[path.extname(f)]||'application/octet-stream', body });
  });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
  await ctx.route('http://svc.test/**', r => r.fulfill({ status:200, contentType:'text/html', body:SVC_PAGE }));
  /* Tampermonkey 흉내 — svc.test 에서만 스크립트를 돌린다(실제로는 확장이 한다) */
  await ctx.addInitScript(({ US, enabled }) => {
    if (location.host !== 'svc.test') return;
    const st = { sites: JSON.stringify(enabled ? ['svc.test'] : []) };
    window.GM_getValue = (k, d) => (k in st ? st[k] : d); window.GM_setValue = (k, v) => { st[k] = v; };
    window.GM_registerMenuCommand = (n) => { (window.__MENU = window.__MENU || []).push(n); };
    window.unsafeWindow = window;
    new Function(US)();
  }, { US, enabled });
  return ctx;
}

console.log('[1] 엑셀 단추가 만든 파일을 잡는다');
let ctx = await ctxOf(true);
const svc = await ctx.newPage(); const pe = []; svc.on('pageerror', e => pe.push(e.message));
await svc.goto('http://svc.test/repair', { waitUntil:'domcontentloaded' }); await svc.waitForTimeout(300);
is(await svc.evaluate(() => !!document.getElementById('gstSvcSend')), '켜 둔 사이트에 «대시보드로 보내기» 판이 뜬다');
is(await svc.evaluate(() => document.querySelector('#gstSvcSend [data-go]').disabled), '파일이 없으면 보내기 단추가 잠겨 있다');
const dl = svc.waitForEvent('download'); await svc.click('#xl'); await dl;
const t1 = await svc.evaluate(() => document.querySelector('#gstSvcSend [data-f]').innerText);
is(/수선실적\.csv/.test(t1), 'SVC 가 내려준 파일을 잡았다 — ' + t1.replace(/\n/g, ' '));
is(await svc.evaluate(() => !document.querySelector('#gstSvcSend [data-go]').disabled), '보내기 단추가 열린다');

console.log('[2] 보내기 → 업로드 창 · 처음 보는 출처는 묻는다');
const popP = ctx.waitForEvent('page'); await svc.click('#gstSvcSend [data-go]'); const up = await popP;
up.on('pageerror', e => pe.push('up: ' + e.message));
await up.waitForSelector('#extYes', { timeout:15000 });
is(/upload\/\?from=ext&rid=wk/.test(up.url()), '업로드 화면이 ?from=ext&rid=wk 로 열린다');
const ban = await up.evaluate(() => document.getElementById('extBan').innerText);
is(/http:\/\/svc\.test/.test(ban) && /허용/.test(ban), '보낸 곳을 밝히고 허용을 묻는다');
is(await up.evaluate(() => !document.getElementById('fsel').files.length), '허용 전에는 파일이 안 들어간다');

console.log('[3] 허용하면 파일이 들어가고 표가 맞춰진다 — 적재는 안 한다');
await up.click('#extYes'); await up.waitForTimeout(1500);
is(await up.evaluate(() => (document.getElementById('fsel').files[0]||{}).name === '수선실적.csv'), '업로드 칸에 그 파일이 들어갔다');
is(await up.evaluate(() => TABLES[+document.getElementById('tsel').value].rid === 'wk'), '대상 표가 수선실적으로 맞춰졌다');
is(await up.evaluate(() => /회사 시스템에서 받은 파일/.test(document.getElementById('extBan').innerText)), '받은 파일임을 머리에 적는다');
is(await up.evaluate(() => JSON.parse(localStorage.getItem('gst_up_ext_origins')||'[]').includes('http://svc.test')), '허용한 출처를 이 PC 에 기억한다');
is(await svc.evaluate(() => /보냈습니다/.test(document.querySelector('#gstSvcSend [data-m]').innerText)), 'SVC 쪽 판이 «보냈습니다»라고 말한다');
is(await up.evaluate(() => !window.__QLOG || !window.__QLOG.some(q => q.rpc === 'csv_upload_begin' || q.rpc === 'csv_window')), '사람이 누르기 전에는 아무것도 적재하지 않는다');

console.log('[4] 두 번째부터는 묻지 않는다');
const dl2 = svc.waitForEvent('download'); await svc.click('#xl'); await dl2;
await up.close();
const popP2 = ctx.waitForEvent('page'); await svc.click('#gstSvcSend [data-go]'); const up2 = await popP2; await up2.waitForURL(/upload/); await up2.waitForSelector('#fsel');
await up2.waitForFunction(() => (document.getElementById('fsel').files[0]||{}).name === '수선실적.csv', null, { timeout:15000 }).catch(() => {});
is(await up2.evaluate(() => (document.getElementById('fsel').files[0]||{}).name === '수선실적.csv' && !document.getElementById('extYes')), '허용한 출처는 묻지 않고 받는다');

console.log('[5] opener 가 아닌 창 · 엑셀이 아닌 파일은 받지 않는다');
/* svc 화면이 업로드 화면을 iframe 으로 품고 보낸다 — 출처는 남이고 opener 는 아니다 */
await svc.evaluate(() => new Promise(r => { const f = document.createElement('iframe'); f.id = 'fr'; f.src = 'https://gstcsglobal-cloud.github.io/upload/?from=ext'; f.onload = r; document.body.appendChild(f); }));
await svc.waitForTimeout(1200);
await svc.evaluate(() => document.getElementById('fr').contentWindow.postMessage({ type:'gst-upload-file', file:new File(['a'], 'x.csv') }, 'https://gstcsglobal-cloud.github.io'));
await svc.waitForTimeout(400);
const fr = svc.frames().find(f => /upload/.test(f.url()));
is(await fr.evaluate(() => !document.getElementById('fsel').files.length && !document.getElementById('extBan')), 'opener 가 아닌 창이 보낸 파일은 무시한다');
await up2.evaluate(() => extTake({ file:new File(['MZ'], 'run.exe') }, 'http://svc.test'));
is(await up2.evaluate(() => /엑셀·CSV 파일만/.test(document.getElementById('extBan').innerText)), '엑셀이 아닌 파일은 거절한다');

console.log('[6] 켜지 않은 사이트에는 판이 안 뜬다');
await ctx.close(); ctx = await ctxOf(false);
const s2 = await ctx.newPage(); await s2.goto('http://svc.test/repair', { waitUntil:'domcontentloaded' }); await s2.waitForTimeout(300);
is(await s2.evaluate(() => !document.getElementById('gstSvcSend') && (window.__MENU||[]).some(n => /켜기/.test(n))), '판은 없고 메뉴에 «켜기»만 있다');

is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' — ' + pe.join(' | ') : ''));
await browser.close();
console.log(`\n${fail ? '❌' : '✅'} t-svc ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
