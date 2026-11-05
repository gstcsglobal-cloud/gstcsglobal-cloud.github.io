// 화면 PPT 정기 발송 — 보고서 봇 (v209 · .github/workflows/report.yml 이 매시 부른다)
// ---------------------------------------------------------------------------------------------
// 사용자: 「이메일이랑 카톡으로 PPT 보내기 기능도 정기적으로 — 어떤 페이지를 어떤 일정에 보내는 기능」.
// PPT 는 «브라우저 안에서만» 만들어진다(차트를 그린 뒤 GST.pptAuto · 주간 현황은 양식 PPT). 서버(엣지펑션)는 화면을 못 그린다 —
// 그래서 GitHub Actions 의 머리 없는 크롬이 사람처럼 화면을 열고 「PPT」를 눌러 받은 파일을 저장소(reports)에 올린다.
//
//   1) GitHub 가 서명한 OIDC 토큰 → notify-send ?op=bot → 보고서 봇 세션(비밀번호·비밀 없음)
//   2) report_subs() → 이번 차례인 (화면 · 범위) 목록 — 판정은 notify.js 의 reportJobs 한 벌(엣지펑션과 같은 함수)
//   3) 화면마다: 열기 → 다 그릴 때까지 기다리기 → 범위 걸기 → GST._barDo('ppt') → 받은 파일 → storage reports/ → report_file_add
//   4) notify-send ?op=report → 그 차례의 수신자에게 메일(첨부) · 카톡(받는 링크)
//
// ⚠ Actions 기록은 «공개»다(공개 저장소) — 이메일·운영단위 이름·숫자를 찍지 않는다. 화면 이름과 개수만 찍는다.
// ⚠ 숫자를 새로 세지 않는다 — 화면이 그린 그대로가 PPT 다(사람이 「PPT」를 누른 것과 같은 파일).
//
// 쓰는 법: node tools/report-run.mjs            (정기 — 이번 차례만)
//          node tools/report-run.mjs --check    (이번 차례가 있나만 — GITHUB_OUTPUT 에 run=true/false)
//          FORCE_PAGE=fault FORCE_SCOPE=all DRY=1 node tools/report-run.mjs   (수동 — 만들어 올리기만 · 보내지 않음)
import fs from 'fs';
import path from 'path';
import { reportJobs, reportPath, PPT_PAGES, splitScope } from '../supabase/functions/notify-send/notify.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CORE = fs.readFileSync(path.join(ROOT, 'assets/core.js'), 'utf8');
/* 주소·공개 키는 core.js 한 곳이 정본이다 — 여기에 다시 적지 않는다 */
const SB = (CORE.match(/GST\.SB_URL\s*=.*?\|\|\s*'([^']+)'/) || [])[1];
const ANON = (CORE.match(/GST\.SB_ANON\s*=.*?\|\|\s*'([^']+)'/) || [])[1];
const DASH = process.env.GST_DASH || 'https://gstcsglobal-cloud.github.io/';
const CHECK = process.argv.includes('--check');
const DRY = /^(1|true|yes)$/i.test(process.env.DRY || '');
const FORCE = String(process.env.FORCE_PAGE || '').trim();
const FORCE_SCOPE = String(process.env.FORCE_SCOPE || 'all').trim() || 'all';
const T_READY = 240e3, T_PPT = 300e3;

const log = (...a) => console.log('[report]', ...a);
const out = (k, v) => { try { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, k + '=' + v + '\n'); } catch (e) {} };
if (!SB || !ANON) { log('core.js 에서 주소를 못 읽었습니다'); process.exit(1); }

async function ghToken() {
  const u = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, t = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!u || !t) throw new Error('OIDC 토큰을 받을 수 없습니다 — 워크플로에 permissions: id-token: write 가 필요합니다');
  const r = await fetch(u + '&audience=gst-report', { headers: { Authorization: 'Bearer ' + t } });
  if (!r.ok) throw new Error('OIDC ' + r.status);
  return (await r.json()).value;
}
async function botSession() {
  const r = await fetch(SB + '/functions/v1/notify-send?op=bot', { method: 'POST', headers: { Authorization: 'Bearer ' + (await ghToken()), apikey: ANON } });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.session) throw new Error('봇 세션 실패 — ' + r.status + ' ' + (b.error || ''));
  return b.session;
}
const H = s => ({ Authorization: 'Bearer ' + s.access_token, apikey: ANON, 'Content-Type': 'application/json' });
async function rpc(s, fn, args) {
  const r = await fetch(SB + '/rest/v1/rpc/' + fn, { method: 'POST', headers: H(s), body: JSON.stringify(args || {}) });
  const b = await r.json().catch(() => null);
  if (!r.ok) throw new Error(fn + ' ' + r.status);
  return b;
}

const ses = await botSession();
const now = new Date();
let jobs;
if (FORCE) {
  if (!PPT_PAGES[FORCE]) { log('모르는 화면:', FORCE); process.exit(1); }
  jobs = [{ page: FORCE, scope: FORCE_SCOPE, slot: 'manual', subs: [] }];
} else {
  const subs = await rpc(ses, 'report_subs');
  if (!Array.isArray(subs)) throw new Error('report_subs — ' + ((subs && subs.error) || '응답 꼴이 다릅니다'));
  jobs = reportJobs(subs, now);
}
log('이번 차례 ' + jobs.length + '개 (화면: ' + (jobs.map(j => j.page).join(', ') || '없음') + ')' + (DRY ? ' · 보내지 않음' : ''));
out('run', jobs.length ? 'true' : 'false');
if (CHECK || !jobs.length) process.exit(0);

const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1000 }, locale: 'ko-KR',
  timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
/* 세션은 core 가 sessionStorage 에 두는 꼴 그대로 넣는다(GST._storage) — 로그인 화면을 거치지 않는다 */
const origin = new URL(DASH).origin, key = 'sb-' + new URL(SB).hostname.split('.')[0] + '-auth-token';
await ctx.addInitScript(a => { try { if (location.origin === a.o) { sessionStorage.setItem(a.k, a.v); sessionStorage.setItem('gst_lang', 'ko'); } } catch (e) {} },
  { o: origin, k: key, v: JSON.stringify(ses) });

/* 다 그렸나 — 읽는 중인 표가 없고 · 뒤에서 마저 받는 표도 없고 · 스켈레톤이 걷히고 · 로그인 화면이 없다. 3초 동안 그대로면 끝 */
async function settled(page) {
  const t0 = Date.now(); let calm = 0;
  while (Date.now() - t0 < T_READY) {
    const st = await page.evaluate(() => {
      const G = window.GST; if (!G || !G.boot || !G._bar) return 'boot';
      const ov = document.getElementById('loginOverlay');
      if (ov && ov.style.display !== 'none' && !ov.classList.contains('hidden') && ov.querySelector('#sbEmail')) return 'login';
      if (G.boot.inflight() > 0) return 'read';
      if (G._bfOn && Object.keys(G._bfOn).length) return 'bf';
      if (document.querySelector('.skeleton')) return 'skel';
      return 'ok';
    }).catch(() => 'nav');
    if (st === 'login') throw new Error('로그인 화면 — 봇 세션이 안 먹었습니다');
    calm = st === 'ok' ? calm + 1 : 0;
    if (calm >= 6) return;
    await page.waitForTimeout(500);
  }
  throw new Error('화면이 ' + Math.round(T_READY / 1000) + '초 안에 다 그려지지 않았습니다');
}
/* 범위 — brief_snap 과 같은 열쇠(all · r:국내/해외 · o:운영단위) + 사이트(|s:단지|단지 · v210). 상세 필터 두 벌에 같이 건다
   (인당 지표의 분자·분모 — 범위 띠와 같은 규칙). 사이트 값은 화면의 「단지」 축 값 그대로다(GST.ORG.campus). */
async function applyScope(page, scope) {
  const { base, sites } = splitScope(scope);
  if (base === 'all' && !sites.length) return true;
  const k = base.startsWith('r:') ? 'region' : base.startsWith('o:') ? 'op' : base === 'all' ? '' : null;
  if (k === null) return false;
  const ok = await page.evaluate(a => {
    const G = window.GST; if (!G || !G.filters || !G.filters.restore) return false;
    const o = {}; if (a.k) o[a.k] = [a.v]; if (a.s.length) o.campus = a.s;
    G.filters.restore({ eq: o, hr: o }); return true;
  }, { k, v: base.slice(2), s: sites });
  if (!ok) return false;
  await page.waitForTimeout(1500); await settled(page);
  /* ⚠ 걸렸는지 «다시 읽어» 본다(v210) — 상세 필터는 그 화면 목록에 없는 값을 조용히 버린다(GST.filters fill · v103 의 키오스크 자리).
     안 보면 «사이트 P1» 이라고 적힌 PPT 가 실제로는 범위 전체를 담는다. 두 벌(설비·인원) 중 하나에라도 남아 있으면 걸린 것이다
     (인원 화면은 설비 블록이 잠기고, 다른 화면은 인원 블록이 잠긴다). 없으면 만들지 않고 실패로 남긴다(조용히 넘기지 않는다).
     ⚠ 기록이 공개라 실패 문구에 운영단위·사이트 이름을 넣지 않는다. */
  const miss = await page.evaluate(a => {
    const sn = window.GST && GST.filters && GST.filters.snapshot && GST.filters.snapshot(); if (!sn) return 'no_snapshot';
    const has = (k, v) => ['eq', 'hr'].some(g => { const x = sn[g] && sn[g][k]; return Array.isArray(x) ? x.indexOf(v) >= 0 : x === v; });
    if (a.k && !has(a.k, a.v)) return a.k;
    return a.s.some(v => !has('campus', v)) ? 'campus' : '';
  }, { k, v: base.slice(2), s: sites });
  if (miss) throw new Error('범위 필터가 이 화면 자료에 없어 걸리지 않았습니다(' + miss + ') — PPT 를 만들지 않았습니다');
  return true;
}
async function upload(p, buf) {
  const r = await fetch(SB + '/storage/v1/object/reports/' + p.split('/').map(encodeURIComponent).join('/'), {
    method: 'POST', body: buf,
    headers: { Authorization: 'Bearer ' + ses.access_token, apikey: ANON,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' } });
  if (!r.ok) throw new Error('저장소 ' + r.status);
}

const files = [], subs = new Set();
for (const [i, j] of jobs.entries()) {
  const t0 = Date.now(); let rec = { page: j.page, scope: j.scope, ok: false, error: '', path: null };
  const page = await ctx.newPage(); let errs = 0;
  page.on('pageerror', () => { errs++; });
  try {
    await page.goto(DASH + j.page + '/', { waitUntil: 'domcontentloaded', timeout: 60e3 });
    await settled(page);
    if (!(await applyScope(page, j.scope))) throw new Error('범위를 걸 수 없는 화면입니다');
    const dl = page.waitForEvent('download', { timeout: T_PPT });
    await page.evaluate(() => window.GST._barDo('ppt'));
    const d = await dl;
    const buf = fs.readFileSync(await d.path());
    if (buf.length < 2000 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('PPT 파일이 아닙니다');
    const p = reportPath(j.page, j.scope, j.slot, Date.now());
    await upload(p, buf);
    rec = { page: j.page, scope: j.scope, ok: true, error: '', path: p, bytes: buf.length };
    log('#' + (i + 1) + ' ' + j.page + ' — ' + Math.round(buf.length / 1024) + 'KB · ' + Math.round((Date.now() - t0) / 1000) + '초' + (errs ? ' · 화면 오류 ' + errs : ''));
  } catch (e) {
    rec.error = String((e && e.message) || e).slice(0, 120);
    log('#' + (i + 1) + ' ' + j.page + ' — 실패: ' + rec.error);
  } finally { await page.close().catch(() => {}); }
  try { await rpc(ses, 'report_file_add', { p_page: rec.page, p_scope: rec.scope, p_slot: j.slot, p_path: rec.path,
    p_bytes: rec.bytes || null, p_ok: rec.ok, p_error: rec.error || null }); } catch (e) { log('기록 실패 — ' + e.message); }
  files.push(rec); j.subs.forEach(id => subs.add(id));
}
await browser.close();

if (!DRY && subs.size) {
  const r = await fetch(SB + '/functions/v1/notify-send?op=report', { method: 'POST', headers: H(ses),
    body: JSON.stringify({ files, subs: Array.from(subs) }) });
  const b = await r.json().catch(() => ({}));
  const sent = Array.isArray(b.sent) ? b.sent : [];
  log('발송 ' + sent.filter(x => x.ok).length + '/' + sent.length + (r.ok ? '' : ' · 응답 ' + r.status));
}
const bad = files.filter(f => !f.ok).length;
log('끝 — PPT ' + (files.length - bad) + '/' + files.length);
process.exit(bad && bad === files.length ? 1 : 0);
