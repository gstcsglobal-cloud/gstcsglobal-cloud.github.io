/* CIP 항목 열 판정 (v130) — 실사고 재현 검사

   무슨 일이 있었나. CIP 시트에 항목 12개를 추가하고 표에 열을 만들어 올렸는데,
   화면의 «대상(분모)»이 늘기는커녕 4,700 → 4,456 으로 **줄었다.** 에러도 배너도 없었다.

   원인은 열 «순서»다. 화면은 구글시트가 아니라 Supabase Import 표를 읽는데,
   Postgres 는 열을 추가하면 **언제나 표의 맨 뒤**에 붙인다(열 순서를 못 바꾼다).
   그래서 시트에서는 Remark 앞에 얌전히 붙은 새 항목이, 표에서는 Remark «뒤»로 간다.
   항목 구간을 「FAB In 다음 ~ Remark 직전」으로 잡고 있었으니 통째로 빠졌다.

   이 검사가 지키는 것 하나: **항목은 «위치»가 아니라 «이름»으로 가린다.**
   구간 판정이 되살아나면 [2]가 붉게 뜬다. 자료는 지어낸 값이다 — 픽스처 불필요.

   ⚠ core.js 와 kakao-bot/hr.js 두 곳에 같은 판정이 있다(제2원칙). [4]가 둘을 대조한다. */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

/* core.js 를 브라우저 없이 올린다 — SM 만 쓰므로 DOM 은 최소 껍데기면 된다 */
const noop = () => {};
const el = () => ({ style:{}, classList:{ add:noop, remove:noop, toggle:noop, contains:()=>false },
  dataset:{}, children:[], appendChild:noop, addEventListener:noop, setAttribute:noop,
  getAttribute:()=>null, insertAdjacentHTML:noop, querySelector:()=>null, querySelectorAll:()=>[], remove:noop });
global.window = global;
global.addEventListener = noop; global.removeEventListener = noop; global.postMessage = noop;
global.document = { addEventListener:noop, removeEventListener:noop, readyState:'complete',
  querySelector:()=>null, querySelectorAll:()=>[], getElementById:()=>null,
  createElement:el, head:el(), body:el(), documentElement:el() };
global.localStorage = { getItem:()=>null, setItem:noop, removeItem:noop };
global.location = { href:'http://x/', search:'', hash:'', pathname:'/' };
try{ Object.defineProperty(global,'navigator',{value:{language:'ko',userAgent:'node'},configurable:true}); }catch(e){}
global.matchMedia = () => ({ matches:false, addEventListener:noop, addListener:noop });
global.fetch = () => Promise.reject(new Error('no'));
await import(ROOT + '/assets/core.js');
const GST = global.GST;

/* 메타데이터 + 항목 3개 + Remark — 시트가 주는 «올바른» 차례 */
const META = ['NO','Country','Customer','FAB','Floor','area','Type','Model','Model Type',
              'PJT.','Scrubber\nS/N','Scrubber\nCode','Group','Detail','FAB In'];
const OLD  = ['Hard interlock ', 'MFC Change\n(Final ver_G)\n(Left)', 'CDA OFF \nProgram\n(DG)'];
const NEW  = ['Tank Deep Pipe', 'Only Surge\nNot DIFF', 'SMPS'];

const sheetOrder = [...META, ...OLD, ...NEW, 'Remark'];
/* 표(DB)가 주는 차례 — 새 항목은 Remark «뒤»에 붙는다. 여기가 사고 지점이다.
   NO·Country·Customer·FAB 도 나중에 승격됐다면 같이 뒤로 간다(항목으로 오해하면 안 된다). */
const dbOrder = ['Floor','area','Type','Model','Model Type','PJT.','Scrubber\nS/N','Scrubber\nCode',
                 'Group','Detail','FAB In', ...OLD, 'Remark',
                 'NO','Country','Customer','FAB', ...NEW];

const names = (hdr, r) => r.cols.map(c => String(hdr[c]).replace(/\s+/g, ' ').trim());
const want  = [...OLD, ...NEW].map(x => x.replace(/\s+/g, ' ').trim());

console.log('[1] 시트 차례 — 항목만 잡힌다');
{
  const r = GST.SM.cipRange(sheetOrder);
  is(!!r, 'cipRange 가 null 이 아니다');
  is(r && r.cols.length === 6, `항목 6개 (실제 ${r ? r.cols.length : '-'})`);
  is(r && names(sheetOrder, r).join('|') === want.join('|'), '메타데이터·Remark 는 항목이 아니다');
}

console.log('\n[2] 표 차례 — 새 항목이 Remark 뒤에 있어도 잡힌다 (v130 사고 재현)');
{
  const r = GST.SM.cipRange(dbOrder);
  is(!!r, 'cipRange 가 null 이 아니다');
  is(r && r.cols.length === 6,
     `Remark 뒤로 밀린 신규 3개까지 전부 잡힌다 — 구간 판정이면 3개만 잡혀 실패한다 (실제 ${r ? r.cols.length : '-'})`);
  const got = r ? names(dbOrder, r) : [];
  is(got.slice().sort().join('|') === want.slice().sort().join('|'), '잡힌 항목이 시트 차례와 «같은 집합»이다');
  is(got.indexOf('NO') < 0 && got.indexOf('Country') < 0 && got.indexOf('FAB') < 0,
     '뒤로 밀린 메타데이터(NO·Country·Customer·FAB)는 항목으로 세지 않는다');
  is(got.indexOf('Remark') < 0, 'Remark 도 항목이 아니다');
}

console.log('\n[3] 못 찾을 때는 조용히 넘어가지 않는다');
{
  is(GST.SM.cipRange(['NO','Scrubber\nS/N','Remark']) === null,
     'FAB In 이 없으면 null (제1원칙 — 옛 번호로 폴백하지 않는다)');
  is(GST.SM.cipRange([...META, 'Remark']) === null, '항목이 하나도 없으면 null');
  /* FAB In «앞»에 있는 모르는 열은 항목이 아니다 — 새 메타데이터가 앞에 생겨도 안전하다 */
  const r = GST.SM.cipRange(['미지의 앞열', ...META, ...OLD, 'Remark']);
  is(r && r.cols.length === 3, 'FAB In 앞의 모르는 열은 항목으로 세지 않는다');
}

console.log('\n[4] 판정이 두 곳에 있다 — 이름 목록이 갈리지 않았는가 (제2원칙)');
{
  const hr = fs.readFileSync(ROOT + '/supabase/functions/kakao-bot/hr.js', 'utf8');
  const m = hr.match(/const KNOWN = \[([\s\S]*?)\]\s*\.map\(hnorm\)/);
  is(!!m, 'hr.js 에 KNOWN 목록이 있다');
  if (m) {
    const botNames = m[1].match(/'([^']*)'/g).map(x => GST.SM.norm(x.slice(1, -1))).sort();
    const F = GST.SM.SPEC.cip.fields;
    const coreNames = [].concat(...Object.keys(F).map(k => [].concat(F[k])))
                        .map(GST.SM.norm).sort();
    is(botNames.join('|') === coreNames.join('|'),
       'core.js SPEC.cip 와 hr.js KNOWN 이 같은 이름 집합이다'
       + (botNames.join('|') === coreNames.join('|') ? ''
          : `\n      core: ${coreNames.join(',')}\n      bot : ${botNames.join(',')}`));
  }
  is(!/for \(let c = c0; c <= c1; c\+\+\)/.test(hr),
     'hr.js 가 «구간»으로 돌지 않는다 (되살아나면 봇만 새 항목을 놓친다)');
}

console.log('\n[5] 화면 두 곳도 «목록»을 돈다');
for (const f of ['cip/index.html', 'report/index.html']) {
  const src = fs.readFileSync(ROOT + '/' + f, 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // 주석은 걷어내고 본다
  is(/for\s*\(\s*const c of rg\.cols\s*\)/.test(src), `${f} 가 rg.cols 를 돈다`);
  is(!/for\s*\(let c\s*=\s*(C\.c0|c0)\s*;\s*c\s*<=\s*(C\.c1|c1)\s*;/.test(src),
     `${f} 에 옛 구간 루프가 남아 있지 않다`);
}

console.log(fail ? `\n❌ t-cip ${pass}/${pass + fail}` : `\n✅ t-cip ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
