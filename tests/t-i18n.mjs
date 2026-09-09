// i18n 사각지대 — T 객체를 «안 지나는» 곳과 T 객체 «안»의 결함을 소스로 센다 (v135)
//  [1] ko 기준 키 누락·잉여 (en/zh/ja)      [2] 한 언어 블록 안 중복 키(뒤의 값이 이겨 앞을 고쳐도 화면이 안 바뀐다)
//  [3] data-i / data-i-th / data-i-ph 가 ko 에 있는 키인가 (없으면 화면에 키 이름이 그대로 뜬다 — sl_more 사고)
//  [4] en/zh/ja 값에 한글이 남았는가 (시트 값 인용 「…」 과 허용 어휘는 제외)
//  [5] t('…')/tr('…') 리터럴 호출이 ko 에 있는 키인가
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ❌ ' + m); } };
const PAGES = { report: 'T', fault: 'T', material: 'T', pm: 'T', scrubber: 'T', tco: 'T', cip: 'T', hr: 'TR' };
const LANGS = ['ko', 'en', 'zh', 'ja'];
// 시트 «값»을 그대로 적은 것은 번역 대상이 아니다 — 설비상태·워런티 표기·조치 어휘
const ALLOW = ['반납', '무상', '유상', '설비 PM', 'SWAP', '반입완료', '반출대기', '반출완료', '출하대기'];

function stripStrings(s) { return s.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, m => m[0] + ' '.repeat(Math.max(0, m.length - 2)) + m[0]); }
function block(src, start) {           // start = index of '{' ; returns [inner, endIndex]
  let d = 0, i = start, inStr = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (!d) return [src.slice(start + 1, i), i]; }
  }
  return null;
}
function langBlocks(src, name) {
  const m = src.match(new RegExp('\\bconst ' + name + '\\s*=\\s*\\{'));
  if (!m) return null;
  const [inner] = block(src, m.index + m[0].length - 1);
  const out = {};
  for (const l of LANGS) {
    const mm = inner.match(new RegExp('(?:^|[,\\s])' + l + '\\s*:\\s*\\{'));
    if (!mm) continue;
    const b = block(inner, mm.index + mm[0].length - 1);
    if (b) out[l] = b[0];
  }
  return out;
}
function keysOf(blk) {
  const bare = stripStrings(blk);
  const ks = []; const re = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:/g; let m;
  while ((m = re.exec(bare))) ks.push(m[1]);
  return ks;
}
function valuesOf(blk) {               // key → 값 (문자열 리터럴 값만)
  const o = {}; const re = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:\s*'((?:[^'\\\n]|\\.)*)'/g; let m;
  while ((m = re.exec(blk))) o[m[1]] = m[2];
  return o;
}
for (const [pg, name] of Object.entries(PAGES)) {
  const src = fs.readFileSync(path.join(ROOT, pg, 'index.html'), 'utf8');
  const B = langBlocks(src, name);
  ok(B && LANGS.every(l => l in B), pg + ': ' + name + ' 의 ko/en/zh/ja 블록을 못 찾았다');
  if (!B) continue;
  const K = {}; for (const l of LANGS) K[l] = keysOf(B[l] || '');
  const ko = new Set(K.ko);
  console.log('[' + pg + '] ko ' + ko.size + '키');
  for (const l of ['en', 'zh', 'ja']) {
    const s = new Set(K[l]);
    const miss = [...ko].filter(k => !s.has(k)), extra = [...s].filter(k => !ko.has(k));
    ok(!miss.length, pg + ' ' + l + ': ko 에 있는데 없는 키 ' + miss.slice(0, 8).join(','));
    ok(!extra.length, pg + ' ' + l + ': ko 에 없는 키 ' + extra.slice(0, 8).join(','));
  }
  for (const l of LANGS) {
    const seen = new Set(), dup = new Set();
    for (const k of K[l]) { if (seen.has(k)) dup.add(k); seen.add(k); }
    ok(!dup.size, pg + ' ' + l + ': 중복 키 ' + [...dup].join(','));
  }
  const attrs = new Set(); const re = /data-i(?:-th|-ph|-title)?="([^"]+)"/g; let m;
  while ((m = re.exec(src))) attrs.add(m[1]);
  const noKey = [...attrs].filter(k => !ko.has(k));
  ok(!noKey.length, pg + ': data-i 가 가리키는데 ko 에 없는 키 ' + noKey.join(','));
  for (const l of ['en', 'zh', 'ja']) {
    const V = valuesOf(B[l] || '');
    const bad = Object.entries(V).filter(([k, v]) => {
      let t = v.replace(/「[^」]*」/g, '');
      for (const a of ALLOW) t = t.split(a).join('');
      return /[가-힣]/.test(t);
    }).map(([k]) => k);
    ok(!bad.length, pg + ' ' + l + ': 값에 한글 잔류 ' + bad.slice(0, 10).join(','));
  }
  const fn = name === 'TR' ? 'tr' : 't';
  const calls = new Set(); const re2 = new RegExp("(?<![\\w.$])" + fn + "\\('([A-Za-z_][\\w]*)'\\)", 'g');
  while ((m = re2.exec(src))) calls.add(m[1]);
  const noCall = [...calls].filter(k => !ko.has(k));
  ok(!noCall.length, pg + ': ' + fn + "('…') 가 부르는데 ko 에 없는 키 " + noCall.slice(0, 12).join(','));
}
/* core.js 의 공용 사전(GST.XXX_T) — 네 언어의 키가 같고 en/zh/ja 값에 한글이 남지 않았는지 (v135 · 5단계).
   사이드바·칩·출처 배지·상태줄 문구가 core 로 올라오면서 «페이지 T 와 같은 규율»이 필요해졌다. */
{
  const core = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
  const names = [...core.matchAll(/^GST\.(_?[A-Za-z]+_T|XMUL)\s*=\s*\{/gm)].map(m => m[1]);
  console.log('[core] 사전 ' + names.length + '개: ' + names.join(','));
  ['FLT_T', 'SRC_T', 'STA_T', 'EXP_T', 'INS_T'].forEach(n => ok(names.includes(n), 'core 에 GST.' + n + ' 가 있다'));
  const flat = (o, p = '') => (o && typeof o === 'object') ? Object.assign({}, ...Object.entries(o).map(([k, v]) => flat(v, p ? p + '.' + k : k))) : { [p]: String(o) };
  for (const n of names) {
    const at = core.search(new RegExp('^GST\\.' + n + '\\s*=\\s*\\{', 'm'));
    const st = core.indexOf('{', at);
    const [inner] = block(core, st);
    let obj = null;
    try { obj = new Function('return ({' + inner + '})')(); } catch (e) { ok(false, 'core.' + n + ' 을 평가하지 못했다: ' + e.message); continue; }
    const missing = LANGS.filter(l => !(l in obj));
    ok(!missing.length, 'core.' + n + ': 언어 블록 누락 ' + missing.join(','));
    if (missing.length) continue;
    const K = {}; for (const l of LANGS) K[l] = flat(obj[l]);
    const koK = Object.keys(K.ko);
    for (const l of ['en', 'zh', 'ja']) {
      const miss = koK.filter(k => !(k in K[l])), extra = Object.keys(K[l]).filter(k => !(k in K.ko));
      ok(!miss.length && !extra.length, 'core.' + n + ' ' + l + ': 키가 ko 와 다르다 ' + miss.concat(extra).slice(0, 6).join(','));
      const bad = Object.entries(K[l]).filter(([k, v]) => { let t = v.replace(/「[^」]*」/g, ''); for (const a of ALLOW) t = t.split(a).join(''); return /[가-힣]/.test(t); }).map(([k]) => k);
      ok(!bad.length, 'core.' + n + ' ' + l + ': 값에 한글 잔류 ' + bad.slice(0, 6).join(','));
    }
  }
}
console.log((fail ? '❌' : '✅') + ' t-i18n: ' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
