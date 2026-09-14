/* 화면 등급(v135) — 메타정보(출처 배지 상세·미러 배너 원문·열 인식 패널)는 관리자만 보는가.
   소스로는 못 본다 — «배너에 표 이름이 찍히는가»는 실제로 그려 봐야 안다. 실제 브라우저·픽스처 불필요.
   ⚠ 등급은 «보안»이 아니라 화면 정리다(CLAUDE.md v135). 여기서 지키는 것은 넷:
   [1] 등급을 모르면(로그인 직후) 관리자가 아니다 — 가려진다
   [2] admin 은 전부 본다 · [3] editor/viewer 는 못 본다 · [4] legacy(role 열 없음)·인증 꺼짐은 전원 본다(옛 동작)
   [5] 배너는 «숨기지» 않는다 — 조회자도 «이상이 있다»는 사실은 본다(조용히 빈 숫자를 보지 않게)
   [6] 소스 — 셸 업로드 버튼 CSS · diag 게이트 · report 운영 지시 · SQL 기본값 */
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
await browser.close();

console.log('[5] 소스 — 가드가 «숨기기»가 아니라 «일반화»인지, 셸·diag·report·SQL');
const core = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
const shell = fs.readFileSync(ROOT + '/index.html', 'utf8');
const theme = fs.readFileSync(ROOT + '/assets/theme.css', 'utf8');
const diag = fs.readFileSync(ROOT + '/diag/index.html', 'utf8');
const report = fs.readFileSync(ROOT + '/report/index.html', 'utf8');
const sql = fs.readFileSync(ROOT + '/supabase/setup-15-roles.sql', 'utf8');
is(/select\('email,can_write,role'\)/.test(core) && /legacy = true/.test(core), 'perm 경로가 role 을 읽고 열이 없으면 legacy 로 물러선다 (두 번째 읽기 없음)');
is(!/GST\._dbBanner = function\(\)\{[\s\S]{0,400}if\(!GST\.isAdmin\(\)\)\s*return/.test(core), '미러 배너는 비관리자에게도 «뜬다» (return 으로 숨기지 않는다)');
is(/body:not\(\[data-role="admin"\]\):not\(\[data-role="legacy"\]\):not\(\[data-role="editor"\]\) #uploadBtn\{display:none\}/.test(shell), '셸 인라인 CSS 가 업로드 버튼을 등급으로 가린다 (셸은 theme.css 를 안 싣는다)');
is(/#gstSrcDetail\{display:none !important\}/.test(theme), 'theme.css 가 배지 상세를 CSS 로도 가린다(깜빡임 방지)');
is(/GST\.isAdmin && !GST\.isAdmin\(\)/.test(diag) && !/GST\.authGate\(\)\.then\(runDiag\)/.test(diag), '/diag/ 가 등급을 먼저 묻는다');
is((report.match(/GST\.isAdmin&&GST\.isAdmin\(\)\?'[^']*\/upload\//g) || []).length >= 3, 'report 의 /upload/ 운영 지시가 관리자에게만 (사실은 모두에게)');
is(/수선실적 BM 으로 세는 중입니다' \+ \(GST\.isAdmin/.test(report), '원장이 빈 «사실»은 등급과 무관하게 남는다');
is(/default 'viewer'/.test(sql) && /check \(role in \('viewer','editor','admin'\)\)/.test(sql), 'SQL 기본값은 viewer(fail-closed) · 값 제약');
is(!/\d/.test((core.match(/d\.textContent='⚠️ 화면 코드가 최신이 아닙니다[^']*'/) || [''])[0]), 'needVer 문구에 버전 숫자가 없다(숫자는 title 로)');

console.log((fail ? '❌' : '✅') + ' t-role: ' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
