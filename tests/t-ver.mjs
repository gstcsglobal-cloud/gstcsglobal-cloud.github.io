// 정적 자산의 캐시 무효화 — core.js 의 GST.VER 와 열 HTML 의 ?v= 가 같은 숫자인지 (v135)
// GitHub Pages 는 캐시 헤더를 못 정하므로 URL 이 유일한 무효화 수단이다. 숫자가 어긋나면
// «?v= 만 올리고 코드는 안 올린» 반대 사고가 나므로 사람이 기억하지 않게 여기서 센다.
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ❌ ' + m); } };

const core = fs.readFileSync(ROOT + '/assets/core.js', 'utf8');
const VER = +(core.match(/^GST\.VER\s*=\s*(\d+)\s*;/m) || [])[1];
ok(Number.isInteger(VER) && VER > 0, 'core.js 에서 GST.VER 를 못 읽었다');

const PAGES = ['index.html', 'report/index.html', 'fault/index.html', 'material/index.html', 'pm/index.html',
  'scrubber/index.html', 'tco/index.html', 'cip/index.html', 'hr/index.html', 'upload/index.html', 'diag/index.html'];
console.log('[1] ?v= 가 GST.VER(' + VER + ') 와 같은가');
for (const f of PAGES) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const asset of ['core.js', 'theme.css']) {
    const re = new RegExp('gstcsglobal-cloud\\.github\\.io/assets/' + asset.replace('.', '\\.') + '(\\?v=(\\d+))?"', 'g');
    let m, n = 0;
    while ((m = re.exec(s))) {
      n++;
      ok(!!m[1], f + ': assets/' + asset + ' 에 ?v= 가 없다 — 옛 코드가 탭을 닫기 전까지 산다');
      if (m[1]) ok(+m[2] === VER, f + ': assets/' + asset + '?v=' + m[2] + ' ≠ GST.VER ' + VER);
    }
    if (asset === 'core.js') ok(n >= 1, f + ': core.js 태그를 못 찾았다');
  }
  // 페이지가 요구하는 버전이 배포본보다 높으면 배너가 «항상» 뜬다
  const nv = s.match(/GST\.needVer\((\d+)\)/);
  if (nv) ok(+nv[1] <= VER, f + ': needVer(' + nv[1] + ') 가 GST.VER ' + VER + ' 보다 높다');
}
console.log('[2] core.js 는 텍스트 파일이어야 한다 (NUL 이 있으면 grep·git 이 binary 로 본다 — 감사를 세 번 속였다)');
ok(!/\x00/.test(core), 'core.js 에 NUL 바이트가 있다');

console.log((fail ? '❌' : '✅') + ' t-ver: ' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
