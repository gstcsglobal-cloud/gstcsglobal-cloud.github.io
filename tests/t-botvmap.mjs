/* t-botvmap — 기준 정보 규칙이 «화면»과 «챗봇»에서 같은 답을 내는가 (v153 · SPEC-SYNC).
   대시보드 assets/core.js GST.vmap(브라우저) 과 kakao-bot/index.ts 의 vmApplyRows(Deno) 는 런타임이 달라 파일을 못 나눈다.
   두 벌이면 언젠가 갈라진다 — 같은 규칙·같은 행을 두 구현에 먹여 «칸 하나하나»를 대조한다(지어낸 값 · 무작위 + 경계 사례).
   ① 대조 ② 원본 불변(복사) ③ 우선순위 ④ 조건은 원본 값 ⑤ 봇이 조회 열을 넓히는 vmCols ⑥ 봇 소스가 실제로 부른다(배선) */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';
const HERE = path.dirname(new URL(import.meta.url).pathname), ROOT = path.resolve(HERE, '..');
const PW = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let pass = 0, fail = 0;
const is = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

/* 봇의 순수 복원부를 떼어 온다(t-botdb 와 같은 표식) */
const src = fs.readFileSync(ROOT + '/supabase/functions/kakao-bot/index.ts', 'utf8');
const a = src.indexOf('/* ---------- 순수 복원부 ----------'), b = src.indexOf('/* ---------- 순수 복원부 끝 ---------- */');
if (a < 0 || b < 0) { console.log('❌ kakao-bot 에서 순수 복원부를 못 찾았다'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-botvm-'));
fs.writeFileSync(tmp + '/x.ts', src.slice(a, b) + '\nexport { vmApplyRows, vmCols, vmSnake };');
const BOT = await import('file://' + tmp + '/x.ts');

const browser = await chromium.launch(PW);
const pg = await browser.newPage(); const pe = []; pg.on('pageerror', e => pe.push(e.message));
await pg.setContent('<!doctype html><html><body></body></html>');
await pg.addScriptTag({ content: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') });

/* 지어낸 값 — 대소문자·앞뒤 공백·빈칸이 섞이게 */
const V = { country:['TAIWAN','taiwan ','GST TAIWAN SCRUBBER','OPX Scrubber','',null], customer:['TESTCO','Testco (F16)','',null],
  fab:['F16','F16S',' f16s','F11','',null], state:['Operation','',null,'반입완료'], location:['TAINAN','Q1',''],
  op:['OPX','TAIWAN','',null], campus:['Q1','Q2',''], line:['L1','L2',null], stage:['BM','TBM'] };
let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const pickV = k => V[k][rnd(V[k].length)];
function rules(tbl, fields) {
  const R = [];
  for (let i = 0; i < 9; i++) {
    const col = fields[rnd(fields.length)], cond = rnd(2) ? fields[rnd(fields.length)] : '';
    const raw = ['*', '', String(pickV(col) ?? '').trim() || 'X'][rnd(3)];
    R.push({ tbl, col, raw, when_col: cond, when_val: cond ? String(pickV(cond) ?? '') : '', val: 'R' + i });
  }
  /* 우선순위가 갈리는 짝을 꼭 넣는다 — 같은 칸·같은 원본 값에 «조건 있음/없음» 두 규칙. 무작위로만 두면 그런 짝이 거의 안 나와
     우선순위를 뒤집어도 초록불이었다(음성 대조로 겪었다). */
  const f0 = fields[rnd(fields.length)], c0 = fields[rnd(fields.length)], v0 = String(pickV(f0) ?? '').trim() || 'X';
  R.push({ tbl, col:f0, raw:v0, when_col:'', when_val:'', val:'P0' }, { tbl, col:f0, raw:v0, when_col:c0, when_val:String(pickV(c0) ?? ''), val:'P1' },
         { tbl, col:f0, raw:'*', when_col:'', when_val:'', val:'P2' }, { tbl, col:f0, raw:'*', when_col:c0, when_val:String(pickV(c0) ?? ''), val:'P3' });
  /* PK 가 같은 규칙은 하나뿐이다(뒤의 것이 이긴다 — DB 와 같게) */
  const m = new Map(); R.forEach(r => m.set([r.col, r.raw, r.when_col, r.when_val].join('|'), r)); return [...m.values()];
}
console.log('[1] 화면(core) ↔ 챗봇(kakao-bot) — 같은 규칙·같은 행 → 같은 값');
for (const [tbl, fields] of [['inst', ['country','customer','fab','state','location']], ['wk', ['op','customer','campus','line','stage']]]) {
  let bad = 0, cells = 0, tries = 0;
  for (let round = 0; round < 40; round++) {
    const R = rules(tbl, fields);
    const objs = Array.from({ length: 25 }, () => Object.fromEntries(fields.map(f => [f, pickV(f)])));
    const bot = BOT.vmApplyRows(tbl, objs, R);
    const ui = await pg.evaluate(([tbl, objs, R, fields]) => {
      const S = GST.SM.SPEC[tbl], ks = Object.keys(S.fields), H = ks.map(k => [].concat(S.fields[k])[0]);
      const rows = [H].concat(objs.map(o => ks.map(k => o[GST._snake(k)] == null ? '' : o[GST._snake(k)])));
      GST.vmap.rules = R;
      const a = GST.vmap.apply(tbl, rows), C = GST.SM.map(a.rows, S).C;
      return { out:a.rows.slice(1).map(r => Object.fromEntries(fields.map(f => [f, r[C[f]]]))), n:a.n };
    }, [tbl, objs, R, fields]);
    tries++;
    bot.rows.forEach((o, i) => fields.forEach(f => { cells++;
      const x = String(o[f] ?? ''), y = String(ui.out[i][f] ?? ''); if (x !== y) { if (bad < 3) console.log('     갈림', tbl, f, JSON.stringify(objs[i]), '봇=' + x, '화면=' + y); bad++; } }));
    if (bot.n !== ui.n) { if (bad < 3) console.log('     바뀐 행 수 갈림', bot.n, ui.n); bad++; }
  }
  is(bad === 0, tbl + ' — ' + tries + '판 · ' + cells.toLocaleString() + '칸 전부 같다' + (bad ? ' (' + bad + '곳 갈림)' : ''));
}

console.log('[2] 경계 사례');
const R0 = [
  { tbl:'inst', col:'country', raw:'TAIWAN', when_col:'', when_val:'', val:'GST TAIWAN SCRUBBER' },
  { tbl:'inst', col:'country', raw:'*', when_col:'fab', when_val:'F16S', val:'FAB-RULE' },
  { tbl:'inst', col:'customer', raw:'*', when_col:'fab', when_val:'F16S', val:'Testco (F16S)' },
  { tbl:'inst', col:'state', raw:'', when_col:'fab', when_val:'F16S', val:'반입완료' },
  { tbl:'inst', col:'fab', raw:'F16S', when_col:'', when_val:'', val:'F16-SOUTH' } ];
const o1 = { country:'TAIWAN', customer:'TESTCO', fab:'F16S', state:null }, keep = JSON.stringify(o1);
const r1 = BOT.vmApplyRows('inst', [o1, { country:'X', fab:'F11', state:'Operation' }], R0);
is(JSON.stringify(o1) === keep, '원본 행을 고치지 않는다(바뀐 행만 복사)');
is(r1.rows[1] !== undefined && r1.rows[1].country === 'X' && r1.n === 1, '안 걸린 행은 그대로 · 바뀐 행 수 1');
is(r1.rows[0].country === 'GST TAIWAN SCRUBBER', '우선순위 — «값» 규칙이 «아무 값 + 조건» 규칙보다 먼저');
{ const R2 = [{ tbl:'inst', col:'country', raw:'TAIWAN', when_col:'', when_val:'', val:'A' }, { tbl:'inst', col:'country', raw:'TAIWAN', when_col:'fab', when_val:'F16S', val:'B' },
    { tbl:'inst', col:'country', raw:'*', when_col:'', when_val:'', val:'C' }, { tbl:'inst', col:'country', raw:'*', when_col:'fab', when_val:'F11', val:'D' }];
  const q = BOT.vmApplyRows('inst', [{ country:'TAIWAN', fab:'F16S' }, { country:'TAIWAN', fab:'F11' }, { country:'OTHER', fab:'F11' }, { country:'OTHER', fab:'F16' }], R2).rows.map(o => o.country).join(',');
  is(q === 'B,A,D,C', '우선순위 네 단계 — 값+조건 > 값 > *+조건 > * (' + q + ')'); }
is(r1.rows[0].customer === 'Testco (F16S)' && r1.rows[0].state === '반입완료', '조건(FAB=F16S) — 고객사 · 빈 설비상태');
is(r1.rows[0].fab === 'F16-SOUTH' && r1.rows[0].customer === 'Testco (F16S)', '조건은 «원본» 값으로 본다 — FAB 을 바꿔 읽어도 다른 규칙의 조건은 원본 F16S');
is(BOT.vmApplyRows('wk', [o1], R0).n === 0, '다른 표(wk)의 행에는 inst 규칙이 안 먹는다');
is(BOT.vmCols('inst', [{ tbl:'inst', col:'eqNo', raw:'*', when_col:'snIn', when_val:'A', val:'B' }]).join(',') === 'eq_no,sn_in', 'vmCols — 규칙이 보는 열을 표 열 이름(snake)으로');
is(BOT.vmSnake('fabIn') === 'fab_in' && BOT.vmSnake('line2') === 'line2', 'SPEC 필드 → 표 열 이름이 core 의 GST._snake 와 같다');

console.log('[3] 배선 — 봇이 두 길(동기화 · 고장 조회) 모두에서 규칙을 입힌다');
const body = src.slice(b);
const fc = body.slice(body.indexOf('async function fetchCsv'), body.indexOf('const DIGEST'));
const qf = body.slice(body.indexOf('async function queryFaults'), body.indexOf('function faultNote'));
is(/loadVmap\(svc,/.test(fc) && /vmApplyRows\(/.test(fc) && /rowsToCsv\(head, cols, rows\)/.test(fc), 'fetchCsv(설치·수선 동기화) — 규칙을 입힌 행으로 CSV 를 만든다');
is(/loadVmap\(svc, "wk"\)/.test(qf) && /vmCols\("wk"/.test(qf) && /rowsToCsv\(heads, cols, vm\.rows\)/.test(qf), 'queryFaults(고장 조회) — 규칙 열도 받아 입힌 행으로 답한다');
is(/기준 정보 규칙으로/.test(body), '바꿔 읽은 건수를 답변 근거(조회 범위 노트)에 밝힌다');
is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
await browser.close();
fs.rmSync(tmp, { recursive:true, force:true });
console.log(fail ? `\n❌ t-botvmap: ${pass} 통과 · ${fail} 실패` : `\n✅ t-botvmap: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
