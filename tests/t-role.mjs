/* 화면 등급(v135) — 메타정보(출처 배지 상세·미러 배너 원문·열 인식 패널)는 관리자만 보는가.
   소스로는 못 본다 — «배너에 표 이름이 찍히는가»는 실제로 그려 봐야 안다. 실제 브라우저·픽스처 불필요.
   ⚠ 등급은 «보안»이 아니라 화면 정리다(CLAUDE.md v135). 여기서 지키는 것:
   [1] 등급을 모르면(로그인 직후) 관리자가 아니다 — 가려진다
   [2] admin 은 전부 본다 · [3] editor/viewer 는 못 본다 · [4] legacy(role 열 없음)·인증 꺼짐은 전원 본다(옛 동작)
   · 배너는 «숨기지» 않는다 — 조회자도 «이상이 있다»는 사실은 본다(조용히 빈 숫자를 보지 않게 · [1]·[3] 에서 본다)
   [5] 셸 상단 — 등급마다 데이터 입구(v144 · 실제 CSS) · [6] /upload/ 의 「데이터 관리」 링크(진짜 perm 경로)
   [7] 소스 — 셸 업로드 버튼 CSS · 두 입구의 창 이름 · diag 게이트 · report 운영 지시 · SQL 기본값 */
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
  if (r.request().url().endsWith('/core.js'))
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') });
  return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div class="status">s</div><script src="/core.js"></script>' });
});
await page.goto('http://gst.test/', { waitUntil: 'load' });

const snap = () => page.evaluate(() => {
  const t = id => { const e = document.getElementById(id); return e ? e.textContent : null; };
  return { role: document.body.dataset.role || '', admin: GST.isAdmin(), chip: t('gstSrcChip'), detail: t('gstSrcDetail'),
           mirror: t('gstMirrorWarn'), col: t('gstColWarn'), panel: !!document.getElementById('gstColPanel') };
});
const fire = () => page.evaluate(() => {
  GST._srcNote('wk', 'db', 5); GST._srcNote('inst', 'sheet', 7);
  GST._dbWarn('sheet_wk', new Error('READ boom'));
  GST.SM.banner([{ sheet: '수선실적', miss: ['작업단계'], C: {}, dup: [], hi: 0 }]);
  GST.SM._reg = [{ sheet: '수선실적', miss: ['작업단계'], C: {}, dup: [], hi: 0 }];
  document.getElementById('gstSrcChip').click(); GST.SM.panel();
});

console.log('[1] 등급을 모르면 관리자가 아니다 (인증이 켜진 환경 · 로그인 직후)');
await page.evaluate(() => { GST.authOn = function(){ return true; }; GST._me = null; });
await fire(); let s = await snap();
is(s.admin === false, '_me 가 없으면 isAdmin=false (fail-closed)');
is(/^core \d+/.test(s.chip || '') && !/행|출처 DB/.test(s.chip || ''), '출처 배지는 «core N» 만: ' + s.chip);
is(s.detail === null, '배지를 눌러도 상세(표 이름·행수)가 안 열린다');
is(s.mirror && !/sheet_wk|boom/.test(s.mirror), '미러 배너는 보이되 표 이름·에러 원문이 없다: ' + s.mirror);
is(s.col && !/작업단계|수선실적/.test(s.col), '열 인식 배너는 보이되 시트·열 이름이 없다: ' + s.col);
is(s.panel === false, '열 인식 패널이 안 열린다');

console.log('[2] admin 은 전부 본다');
await page.evaluate(() => { document.getElementById('gstMirrorWarn')?.remove(); GST._meApply({ email: 'a@b', can_write: true, role: 'admin' }); });
await fire(); s = await snap();
is(s.role === 'admin' && s.admin === true, 'body[data-role=admin] · isAdmin=true');
is(/출처 DB 1 · 시트 1 · core \d+/.test(s.chip || ''), '배지에 출처 요약이 찍힌다: ' + s.chip);
is(/wk .*5행/.test(s.detail || ''), '상세에 표 이름·행수가 있다');
is(/sheet_wk — READ boom/.test(s.mirror || ''), '미러 배너에 표 이름·원문이 있다');
is(/수선실적: 작업단계/.test(s.col || ''), '열 인식 배너에 시트·열 이름이 있다');
is(s.panel === true, '열 인식 패널이 열린다');

console.log('[3] editor·viewer 는 메타를 못 본다 (등급이 «나중에» 바뀌어도 이미 그려진 것이 따라간다)');
await page.evaluate(() => { document.getElementById('gstColPanel')?.remove(); GST._meApply({ email: 'e@b', can_write: true, role: 'editor' }); });
s = await snap();
is(s.role === 'editor' && s.admin === false, 'editor 는 관리자가 아니다');
is(/^core \d+/.test(s.chip || '') && !/출처 DB/.test(s.chip || ''), '배지가 «core N» 으로 되돌아간다: ' + s.chip);
is(s.detail === null, '열려 있던 상세가 닫힌다');
is(s.mirror && !/sheet_wk/.test(s.mirror), '미러 배너가 일반 문구로 다시 그려진다');
is(s.col && !/작업단계/.test(s.col), '열 인식 배너가 일반 문구로 다시 그려진다');
await page.evaluate(() => GST._meApply({ email: 'v@b', can_write: false, role: 'viewer' }));
s = await snap(); is(s.admin === false && s.role === 'viewer', 'viewer 도 같다');
await page.evaluate(() => GST._meApply({ email: 'x@b', can_write: false, role: 'superuser' }));
s = await snap(); is(s.admin === false, '모르는 등급은 관리자가 아니다 (음성 대조)');

console.log('[4] legacy(role 열 없음) · 인증 꺼짐 = 옛 동작(전원 본다)');
await page.evaluate(() => GST._meApply({ email: 'l@b', can_write: true, role: 'legacy' }));
s = await snap(); is(s.admin === true && /출처 DB/.test(s.chip || ''), 'legacy 는 관리자처럼 본다');
const lm = await page.evaluate(async () => { GST._me = null; GST._meP = null; GST.authOn = function(){ return false; }; const me = await GST.loadMe(); return { role: me && me.role, admin: GST.isAdmin() }; });
is(lm.role === 'legacy' && lm.admin === true, '인증이 꺼진 환경(검증 스크립트)은 legacy');
is(await page.evaluate(() => { GST._me = null; return GST.isAdmin(); }) === true, '인증 꺼짐 + 등급 미상 → 관리자(로컬·검사 환경)');
is(errs.length === 0, 'JS 에러 0건' + (errs.length ? ' — ' + errs.join(' | ') : ''));

console.log('[5] 셸 상단 — 등급마다 «데이터 입구»가 맞게 보이는가 (v144 · 실제 셸 CSS)');
/* 사용자 확정 「하나로 합치기」 — admin 은 「데이터 관리」 하나로 들어가 그 머리의 「원본 파일 올리기」로 간다.
   소스의 CSS 문자열만 보면 «뒤에서 다른 규칙이 덮는» 경우를 못 본다 → 실제 셸을 열어 계산된 display 로 본다.
   JS 를 끄는 이유: 셸 스크립트는 로그인·core 를 부르고, 여기서 보려는 것은 «등급 → 버튼» CSS 하나뿐이다. */
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const sp = await ctx.newPage();
  await sp.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  await sp.goto('file://' + ROOT + '/index.html');
  const vis = r => sp.evaluate(role => {
    if (role) document.body.dataset.role = role; else delete document.body.dataset.role;
    return ['uploadBtn', 'editBtn', 'offlineBtn'].filter(i => getComputedStyle(document.getElementById(i)).display !== 'none').join(' ');
  }, r);
  let v;
  v = await vis('admin');  is(v === 'editBtn offlineBtn', 'admin — 「데이터 관리」(+오프라인)뿐 · 업로드는 그 안에서: ' + v);
  v = await vis('editor'); is(v === 'uploadBtn', 'editor — 「업로드」뿐 (데이터 관리는 admin 전용이라 이것이 유일한 입구): ' + v);
  v = await vis('viewer'); is(v === '', 'viewer — 데이터 입구 없음: ' + v);
  v = await vis('');       is(v === '', '등급 미상(로그인 직후) — 없음 (fail-closed): ' + v);
  v = await vis('superuser'); is(v === '', '모르는 등급 — 없음 (음성 대조): ' + v);
  v = await vis('legacy'); is(v === 'uploadBtn editBtn offlineBtn', 'legacy(role 열 없음) — 옛 동작 그대로 셋 다: ' + v);
  await ctx.close();
}

console.log('[6] /upload/ 의 「데이터 관리」 링크 — admin + can_write 에게만 (진짜 perm 경로)');
/* /edit/ 의 게이트가 isAdmin()+canWrite() 다 — 그 둘을 못 넘는 사람에게 링크가 보이면 눌러도 잠긴 문이다.
   등급은 «진짜» dbWrite('perm') 가 가짜 allowed_users 행을 읽어 _meApply 로 채운다 — 판정을 흉내 내지 않는다. */
{
  const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
  const upCase = async (row, legacy) => {
    const ctx = await browser.newContext();
    const stub = '\n;GST.authOn=function(){return true;};GST.getSession=async function(){return {user:{email:"t@t"}}};'
      + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();return true;};'
      + 'window.__ROW=' + JSON.stringify(row) + ';window.__LEG=' + !!legacy + ';'
      + 'GST.db=async function(){var q={select:function(c){q._c=c;return q},ilike:function(){return q},eq:function(){return q},'
      +   'order:function(){return q},limit:function(){return q},'
      +   'maybeSingle:function(){ if(window.__LEG && /role/.test(q._c||"")) return Promise.resolve({data:null,error:{message:"column allowed_users.role does not exist"}});'
      +     'return Promise.resolve({data:window.__ROW,error:null}); },'
      +   'then:function(res,rej){return Promise.resolve({data:[],count:0,error:null}).then(res,rej)}};'
      +   'return {from:function(){return q},rpc:async function(){return {data:null,error:null}}};};';
    await ctx.route('**gstcsglobal-cloud.github.io/**', r => {
      let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: 'nf' });
      const body = u === '/assets/core.js' ? fs.readFileSync(f, 'utf8') + stub : fs.readFileSync(f);
      return r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body });
    });
    await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const pg = await ctx.newPage(); const pe = []; pg.on('pageerror', e => pe.push(e.message));
    await pg.goto('https://gstcsglobal-cloud.github.io/upload/', { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => window.GST && GST._me, null, { timeout: 5000 });
    await pg.waitForTimeout(150);
    const o = await pg.evaluate(() => { const s = document.getElementById('toEdit'), a = s && s.querySelector('a');
      return { shown: !!s && !s.hidden && s.offsetParent !== null, href: a && a.getAttribute('href'), target: a && a.getAttribute('target'),
               ro: /읽기 전용/.test(document.getElementById('chk') ? document.getElementById('chk').innerText : ''), role: GST._me && GST._me.role }; });
    await ctx.close();
    return { ...o, pe };
  };
  let o = await upCase({ email: 't@t', can_write: true, role: 'admin' });
  is(o.shown && o.href === '/edit/' && o.target === 'gstEdit', 'admin+쓰기 — 링크가 보인다 (/edit/ 를 셸과 같은 창 gstEdit 으로): ' + JSON.stringify(o));
  is(o.pe.length === 0, 'JS 에러 없음' + (o.pe.length ? ' → ' + o.pe[0] : ''));
  o = await upCase({ email: 't@t', can_write: true, role: 'editor' });
  is(!o.shown && o.role === 'editor', 'editor(사이트 담당자) — 링크가 없다 (/edit/ 는 admin 전용)');
  o = await upCase({ email: 't@t', can_write: false, role: 'admin' });
  is(!o.shown && o.ro, 'admin 이지만 쓰기 없음 — 링크 없이 «읽기 전용»만 (/edit/ 게이트도 can_write 를 본다)');
  o = await upCase({ email: 't@t', can_write: false, role: 'viewer' });
  is(!o.shown, 'viewer — 링크 없음');
  o = await upCase({ email: 't@t', can_write: true }, true);
  is(o.shown && o.role === 'legacy', 'legacy(role 열 없음) + 쓰기 — 옛 동작대로 보인다');
}
await browser.close();

console.log('[7] 소스 — 가드가 «숨기기»가 아니라 «일반화»인지, 셸·diag·report·SQL');
const core = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
const shell = fs.readFileSync(ROOT + '/index.html', 'utf8');
const theme = fs.readFileSync(ROOT + '/assets/theme.css', 'utf8');
const diag = fs.readFileSync(ROOT + '/diag/index.html', 'utf8');
const report = fs.readFileSync(ROOT + '/report/index.html', 'utf8');
const sql = fs.readFileSync(ROOT + '/supabase/setup-15-roles.sql', 'utf8');
is(/select\('email,can_write,role'\)/.test(core) && /legacy = true/.test(core), 'perm 경로가 role 을 읽고 열이 없으면 legacy 로 물러선다 (두 번째 읽기 없음)');
is(!/GST\._dbBanner = function\(\)\{[\s\S]{0,400}if\(!GST\.isAdmin\(\)\)\s*return/.test(core), '미러 배너는 비관리자에게도 «뜬다» (return 으로 숨기지 않는다)');
is(/body:not\(\[data-role="editor"\]\):not\(\[data-role="legacy"\]\) #uploadBtn\{display:none\}/.test(shell), '셸 인라인 CSS 가 업로드 버튼을 등급으로 가린다 — editor·legacy 만 (v144 · 셸은 theme.css 를 안 싣는다)');
{ /* v144 — 두 입구(셸 버튼 · 데이터 관리 머리)가 «같은 창»을 다시 쓴다. 이름이 갈리면 누를 때마다 창이 하나씩 는다 */
  const edit = fs.readFileSync(ROOT + '/edit/index.html', 'utf8'), up = fs.readFileSync(ROOT + '/upload/index.html', 'utf8');
  const wUp = (shell.match(/function openUpload\(\)\{ window\.open\('\/upload\/','(\w+)'\)/) || [])[1];
  const wEd = (shell.match(/function openEdit\(\)\{ window\.open\('\/edit\/','(\w+)'\)/) || [])[1];
  is(!!wUp && new RegExp('id="toUpload" href="/upload/" target="' + wUp + '"').test(edit), '데이터 관리 머리의 「원본 파일 올리기」가 셸 업로드와 같은 창(' + wUp + ')');
  is(!!wEd && new RegExp('<span id="toEdit" hidden>[\\s\\S]{0,80}href="/edit/" target="' + wEd + '"').test(up), '업로드 화면의 「데이터 관리」가 셸과 같은 창(' + wEd + ') · 기본은 숨김(fail-closed)');
}
is(/#gstSrcDetail\{display:none !important\}/.test(theme), 'theme.css 가 배지 상세를 CSS 로도 가린다(깜빡임 방지)');
is(/GST\.isAdmin && !GST\.isAdmin\(\)/.test(diag) && !/GST\.authGate\(\)\.then\(runDiag\)/.test(diag), '/diag/ 가 등급을 먼저 묻는다');
is((report.match(/GST\.isAdmin&&GST\.isAdmin\(\)\?'[^']*\/upload\//g) || []).length >= 3, 'report 의 /upload/ 운영 지시가 관리자에게만 (사실은 모두에게)');
is(/수선실적 BM 으로 세는 중입니다' \+ \(GST\.isAdmin/.test(report), '원장이 빈 «사실»은 등급과 무관하게 남는다');
is(/default 'viewer'/.test(sql) && /check \(role in \('viewer','editor','admin'\)\)/.test(sql), 'SQL 기본값은 viewer(fail-closed) · 값 제약');
is(!/\d/.test((core.match(/d\.textContent='⚠️ 화면 코드가 최신이 아닙니다[^']*'/) || [''])[0]), 'needVer 문구에 버전 숫자가 없다(숫자는 title 로)');

console.log((fail ? '❌' : '✅') + ' t-role: ' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
