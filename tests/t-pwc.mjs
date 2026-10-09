/* t-pwc — 관리자 비밀번호 변경 화면 (v150). 지어낸 값만 · 가짜 Supabase.
   ① 이메일 코드 → 코드 확인 → 아이디·새 비밀번호 순서로만 열린다 ② 서버(admin_set_pw)에 아이디·비밀번호만 보낸다
   ③ 서버의 거절 코드를 사람 말로 옮긴다 ④ 8자 미만·불일치는 서버까지 안 간다 ⑤ 함수가 없으면 «SQL 을 Run» 으로 말한다
   ⑥ 성공하면 대시보드로 들어간다. 서버 쪽 규칙(관리자·15분 OTP·아이디 계정만)은 운영 DB 에서 되돌려지는 블록으로 검증했다. */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

const browser = await chromium.launch(PW);
const pg = await browser.newPage(); const pe = []; pg.on('pageerror', e => pe.push(e.message));
await pg.setContent('<!doctype html><html><body><div id="loginOverlay"></div></body></html>');
await pg.addScriptTag({ content: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') });
await pg.evaluate(() => {
  window.__LOG = []; window.__RPC = { data: { ok: true, login: 'gstadmin@gstcs.view' }, error: null };
  GST.sendOtp = async e => { __LOG.push(['otp', e]); return null; };
  GST.verifyOtp = async (e, c) => { __LOG.push(['verify', e, c]); return c === '123456' ? null : '코드가 틀렸습니다'; };
  GST.sb = async () => ({ rpc: async (n, a) => { __LOG.push(['rpc', n, a]); return typeof __RPC === 'function' ? __RPC() : __RPC; } });
  GST._authOk = () => { window.__IN = 1; };
  window.__RES = null;
  GST._pwChange(document.getElementById('loginOverlay'), v => { window.__RES = v; });
});
const vis = id => pg.evaluate(i => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none'; }, id);
const msg = () => pg.evaluate(() => document.getElementById('pcErr').textContent);

console.log('[1] 이메일 코드부터');
is(await vis('pcS1') && !(await vis('pcS2')), '처음에는 이메일 칸만 — 비밀번호 칸은 안 보인다');
await pg.fill('#pcEmail', 'not-an-email'); await pg.click('#pcSend');
is(/형식/.test(await msg()) && !(await pg.evaluate(() => __LOG.length)), '이메일 형식이 틀리면 보내지 않는다');
await pg.fill('#pcEmail', 'Admin@Example.com'); await pg.click('#pcSend'); await pg.waitForTimeout(100);
is(await pg.evaluate(() => __LOG[0][0] === 'otp' && __LOG[0][1] === 'admin@example.com'), '소문자로 눕혀 코드를 보낸다');
await pg.fill('#pcCode', '000000'); await pg.click('#pcVerify'); await pg.waitForTimeout(100);
is(/확인 실패/.test(await msg()) && !(await vis('pcS2')), '틀린 코드면 다음 단계가 안 열린다');
await pg.fill('#pcCode', '123456'); await pg.click('#pcVerify'); await pg.waitForTimeout(100);
is(await vis('pcS2') && !(await vis('pcS1')), '맞는 코드면 아이디·비밀번호 단계로');
is(await pg.evaluate(() => document.getElementById('pcId').value === 'gstadmin'), '아이디 기본값 gstadmin');

console.log('[2] 서버에 가기 전 검사');
const nRpc = () => pg.evaluate(() => __LOG.filter(x => x[0] === 'rpc').length);
await pg.fill('#pcPw1', 'short'); await pg.fill('#pcPw2', 'short'); await pg.click('#pcGo');
is(/8자/.test(await msg()) && (await nRpc()) === 0, '8자 미만은 서버까지 안 간다');
await pg.fill('#pcPw1', 'abcdefgh1'); await pg.fill('#pcPw2', 'abcdefgh2'); await pg.click('#pcGo');
is(/다릅니다/.test(await msg()) && (await nRpc()) === 0, '두 칸이 다르면 서버까지 안 간다');

console.log('[3] 서버의 거절을 사람 말로');
await pg.fill('#pcPw2', 'abcdefgh1');
for (const [code, re] of [['need_otp', /15분/], ['forbidden', /관리자/], ['not_id_account', /아이디 계정만/], ['not_found', /등록된 아이디/]]) {
  await pg.evaluate(c => { __RPC = { data: { ok: false, err: c }, error: null }; }, code);
  await pg.click('#pcGo'); await pg.waitForTimeout(100);
  is(re.test(await msg()) && await vis('pcS2'), code + ' → ' + (await msg()).slice(0, 30));
}
await pg.evaluate(() => { __RPC = { data: null, error: { message: 'Could not find the function public.admin_set_pw' } }; });
await pg.click('#pcGo'); await pg.waitForTimeout(100);
is(/setup-19/.test(await msg()), '함수가 없으면 «SQL 을 Run» 으로 말한다');

console.log('[4] 성공');
await pg.evaluate(() => { __RPC = { data: { ok: true, login: 'gstadmin@gstcs.view' }, error: null }; });
await pg.click('#pcGo'); await pg.waitForTimeout(100);
const call = await pg.evaluate(() => __LOG.filter(x => x[0] === 'rpc').pop());
is(call[1] === 'admin_set_pw' && JSON.stringify(Object.keys(call[2]).sort()) === '["p_login","p_pw"]' && call[2].p_login === 'gstadmin' && call[2].p_pw === 'abcdefgh1', 'admin_set_pw 에 아이디·비밀번호만 보낸다');
is(/«gstadmin» 의 비밀번호를 바꿨습니다/.test(await msg()) && await vis('pcDone'), '바꿨다고 말하고 «들어가기» 를 연다 (도메인 꼬리는 떼고 적는다)');
await pg.click('#pcEnter');
is(await pg.evaluate(() => window.__IN === 1 && window.__RES === true), '대시보드로 들어간다');
is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
await browser.close();
console.log(fail ? `\n❌ t-pwc: ${pass} 통과 · ${fail} 실패` : `\n✅ t-pwc: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
