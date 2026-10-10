/* t-action — 처리함(/action/) · 통합 관제 「담기」 (v166). 지어낸 자료만(t-leak).
   지키는 것: ① 쓰기는 RPC 만(action_add · action_set) — 표를 직접 고치지 않는다 ② 들고 있던 시각(p_at)을 실어 보내
   남의 변경을 덮지 않는다(conflict 면 다시 읽고 알린다) ③ 조회자는 읽기만 — 단추가 없다 ④ 칩·필터·검색이 목록과 같은 모집단
   ⑤ 관제의 「담기」가 같은 신호를 두 번 안 담고, 담긴 신호는 상태를 보여 준다 ⑥ 서버 준비 전에는 «말하며» 멈춘다.
     실행: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node t-action.mjs */
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

/* 가짜 Supabase — setup-24 의 규칙을 «흉내»만 낸다(진짜 규칙은 t-editsql [16] 이 진짜 Postgres 에서 본다).
   여기서 보는 것은 «화면이 무엇을 보내는가»다 — 그래서 모든 호출을 기록한다. */
const FAKE = String.raw`
window.__ACT = window.__ACT || { items: [], log: [], seq: 0, lseq: 0, calls: [], noTable: false };
(function(){
  const A = window.__ACT, now = () => new Date(Date.now() + (A.seq + A.lseq) * 7).toISOString();
  const me = () => (window.__ME_OBJ || {}).email || '';
  const canW = () => { const m = window.__ME_OBJ || {}; return !!m.can_write || ['admin','editor','kr'].includes(m.role); };
  function q(tbl){ const st = { tbl, f: [], ord: null, lim: 0 };
    const o = { select(){ return o; }, order(k, op){ st.ord = [k, op && op.ascending]; return o; }, limit(n){ st.lim = n; return o; },
      eq(k, v){ st.f.push(x => x[k] === v); return o; },
      not(k, op, v){ if (op === 'in') { const a = v.replace(/[()]/g,'').split(','); st.f.push(x => !a.includes(x[k])); } else if (op === 'is') st.f.push(x => x[k] != null); return o; },
      insert(){ A.calls.push({ direct: tbl }); return Promise.resolve({ error: { message: 'permission denied' } }); },
      update(){ A.calls.push({ direct: tbl }); return Promise.resolve({ error: { message: 'permission denied' } }); },
      then(res, rej){ if (A.noTable) return Promise.resolve({ data: null, error: { message: 'relation "public.' + tbl + '" does not exist' } }).then(res, rej);
        let d = (tbl === 'action_items' ? A.items : A.log).filter(x => st.f.every(f => f(x))).map(x => Object.assign({}, x));
        if (st.ord) d.sort((a, b) => (String(a[st.ord[0]]) < String(b[st.ord[0]]) ? -1 : 1) * (st.ord[1] ? 1 : -1));
        return Promise.resolve({ data: d, error: null }).then(res, rej); } };
    return o; }
  window.__FDB = { from: q, rpc: async function(name, a){
    A.calls.push({ rpc: name, args: JSON.parse(JSON.stringify(a || {})) });
    if (name === 'action_people') return { data: canW() ? ['boss@test.local','ed@test.local','vw@test.local'] : [], error: null };
    if (!canW()) return { data: null, error: { message: 'forbidden' } };
    if (name === 'action_add') {
      const cur = a.p_ref && A.items.find(x => x.ref === a.p_ref && !['done','dismissed'].includes(x.status));
      if (cur) return { data: { id: cur.id, created: false }, error: null };
      const id = ++A.seq, t = now();
      A.items.push({ id, kind: a.p_kind, ref: a.p_ref, sev: a.p_sev, status: 'open', title: a.p_title, detail: a.p_detail, op: a.p_op, page: a.p_page,
        assignee: a.p_assignee, due: a.p_due, created_by: me(), created_at: t, updated_by: me(), updated_at: t, closed_at: null });
      A.log.push({ id: ++A.lseq, item_id: id, at: t, by: me(), op: 'create', v_to: a.p_title });
      return { data: { id, created: true }, error: null };
    }
    if (name === 'action_set') {
      const it = A.items.find(x => x.id === a.p_id); if (!it) return { data: null, error: { message: 'not_found' } };
      if (a.p_at && a.p_at !== it.updated_at) return { data: { ok: false, conflict: true }, error: null };
      let n = 0; const s = a.p_set || {};
      if ('status' in s && s.status !== it.status) { A.log.push({ id: ++A.lseq, item_id: it.id, at: now(), by: me(), op: 'status', v_from: it.status, v_to: s.status }); it.status = s.status; it.closed_at = ['done','dismissed'].includes(s.status) ? now() : null; n++; }
      if ('assignee' in s && (s.assignee || null) !== it.assignee) { A.log.push({ id: ++A.lseq, item_id: it.id, at: now(), by: me(), op: 'assign', v_from: it.assignee, v_to: s.assignee || null }); it.assignee = s.assignee || null; n++; }
      if ('due' in s && (s.due || null) !== it.due) { A.log.push({ id: ++A.lseq, item_id: it.id, at: now(), by: me(), op: 'due', v_from: it.due, v_to: s.due || null }); it.due = s.due || null; n++; }
      if (s.memo) { A.log.push({ id: ++A.lseq, item_id: it.id, at: now(), by: me(), op: 'memo', memo: s.memo }); n++; }
      if (n) { it.updated_at = now(); it.updated_by = me(); }
      return { data: { ok: true, changed: n, updated_at: it.updated_at }, error: null };
    }
    return { data: null, error: { message: 'unknown rpc' } };
  } };
})();`;
const STUB = '\n;GST.USE_DB=false;GST.authOn=function(){return !window.__NOAUTH;};'
  + 'GST.getSession=async function(){return {user:{email:(window.__ME_OBJ||{}).email||"t@t"}};};GST.token=async function(){return "t";};'
  + 'GST.authGate=async function(){var o=document.getElementById("loginOverlay");if(o)o.remove();if(GST._authOk)GST._authOk();return true;};'
  + 'GST.loadMe=async function(){ if(!GST._me) GST._meApply(window.__ME_OBJ||{email:"",can_write:false,role:"viewer"}); return GST._me; };'
  + 'GST.csvTableRows=async function(){return [];};'
  + FAKE + ';GST.db=async function(){return window.__FDB;};';

const browser = await chromium.launch(PW);
async function mkCtx(meObj, seed, noTable, noAuth) {
  const ctx = await browser.newContext({ viewport:{ width:1500, height:1000 }, locale:'ko-KR' });
  await ctx.addInitScript(([m, sd, nt, na]) => { window.__ME_OBJ = m; if (na) window.__NOAUTH = true; if (sd) window.__ACT = { items: sd.items, log: sd.log, seq: sd.items.length, lseq: sd.log.length, calls: [], noTable: nt }; else if (nt) window.__ACT = { items: [], log: [], seq: 0, lseq: 0, calls: [], noTable: true }; }, [meObj, seed, !!noTable, !!noAuth]);
  await ctx.route('**gstcsglobal-cloud.github.io/**', r => { let u = new URL(r.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.fulfill({ status:404, body:'nf' }); return; }
    r.fulfill({ status:200, contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) }); });
  await ctx.route('**/assets/core.js*', r => r.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync(ROOT + '/assets/core.js', 'utf8') + STUB }));
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType: r.request().url().endsWith('.css') ? 'text/css' : 'application/javascript', body:'' }));
  return ctx;
}
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const T0 = '2026-09-01T00:00:00.000Z';
const mk = (id, o) => Object.assign({ id, kind:'risk', ref:'risk:Z' + id, sev:'warn', status:'open', title:'설비 Z' + id, detail:'d', op:'OPX Scrubber', page:'fault',
  assignee:null, due:null, created_by:'boss@test.local', created_at:T0, updated_by:'boss@test.local', updated_at:T0, closed_at:null }, o);
const SEED = { items: [
  mk(1, { sev:'bad', assignee:'boss@test.local', due:day(-3) }),          // 내 담당 · 기한 지남
  mk(2, { status:'ack', assignee:'ed@test.local' }),
  mk(3, { status:'doing', kind:'dq', ref:'dq:fault.bm_unknown', title:'BM 미기재', op:null }),
  mk(4, { status:'done', closed_at:new Date(Date.now() - 2 * 864e5).toISOString() }),
  mk(5, { status:'dismissed', closed_at:T0 }),
], log: [{ id:1, item_id:1, at:T0, by:'boss@test.local', op:'create', v_to:'설비 Z1' }] };

console.log('[1] 목록 · 칩 — 관리자');
let ctx = await mkCtx({ email:'boss@test.local', can_write:true, role:'admin' }, SEED);
let pg = await ctx.newPage(); const pe = []; pg.on('pageerror', e => pe.push(e.message));
await pg.goto(BASE + '/action/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(1500);
const rows = () => pg.evaluate(() => Array.from(document.querySelectorAll('#rows tr.it')).map(r => +r.dataset.id));
const chips = () => pg.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('#chips .ac-chip')).map(b => [b.dataset.c, +b.querySelector('.v').textContent])));
let R = await rows(), K = await chips();
is(R.length === 3 && !R.includes(4) && !R.includes(5), '진행 중 = 열림·확인·진행 3건 (닫힌 2건은 빠진다)');
is(R[0] === 1, '기한 지난 위험 일이 맨 위');
is(K.open === 1 && K.mine === 1 && K.late === 1 && K.done7 === 1, '칩 — 새로 1 · 내 담당 1 · 기한 지남 1 · 최근 7일 완료 1 (' + JSON.stringify(K) + ')');
await pg.click('#chips .ac-chip[data-c="mine"]'); await pg.waitForTimeout(200);
is(JSON.stringify(await rows()) === '[1]', '칩을 누르면 그 모집단만 — 내 담당 = 1건');
await pg.click('#chips .ac-chip[data-c="mine"]'); await pg.click('#segSt button[data-s="closed"]'); await pg.waitForTimeout(200);
is(JSON.stringify((await rows()).sort()) === '[4,5]', '닫힘 = 완료·보류');
await pg.click('#segSt button[data-s="all"]'); await pg.fill('#q', '미기재'); await pg.waitForTimeout(200);
is(JSON.stringify(await rows()) === '[3]', '검색 — 제목으로 걸러진다');
await pg.fill('#q', ''); await pg.click('#segSt button[data-s="live"]'); await pg.waitForTimeout(200);

console.log('[2] 바꾸기 — RPC 만 · 들고 있던 시각을 싣는다');
await pg.click('#rows tr.it[data-id="2"]'); await pg.waitForTimeout(500);
await pg.click('#pSt button[data-s="doing"]'); await pg.waitForTimeout(600);
let A = await pg.evaluate(() => window.__ACT);
const c1 = A.calls.filter(c => c.rpc === 'action_set').pop();
is(c1 && c1.args.p_id === 2 && c1.args.p_set.status === 'doing' && c1.args.p_at === T0, 'action_set(id, {status}, p_at=그 일의 updated_at)');
is(A.items.find(x => x.id === 2).status === 'doing' && !A.calls.some(c => c.direct), '상태가 바뀌고 표를 직접 고치지 않는다');
await pg.selectOption('#pWho', 'vw@test.local'); await pg.waitForTimeout(600);
await pg.fill('#pDue', day(5)); await pg.dispatchEvent('#pDue', 'change'); await pg.waitForTimeout(600);
await pg.fill('#pMemo', '현장 확인 요청'); await pg.click('#pMemoBtn'); await pg.waitForTimeout(700);
A = await pg.evaluate(() => window.__ACT);
const it2 = A.items.find(x => x.id === 2);
is(it2.assignee === 'vw@test.local' && it2.due === day(5), '담당·기한이 바뀐다');
const logTxt = await pg.evaluate(() => document.getElementById('pLog').innerText);
is(/현장 확인 요청/.test(logTxt) && /담당/.test(logTxt) && /기한/.test(logTxt), '이력에 메모·담당·기한이 뜬다');
/* 남이 그새 바꿨다 — 화면이 들고 있는 시각이 옛 것 */
await pg.evaluate(() => { const x = window.__ACT.items.find(v => v.id === 1); x.updated_at = '2026-09-09T09:09:09.000Z'; x.title = '남이 고친 제목'; });
await pg.click('#rows tr.it[data-id="1"]'); await pg.waitForTimeout(400);
await pg.evaluate(() => { const x = window.__ACT.items.find(v => v.id === 1); x.updated_at = '2026-09-10T10:10:10.000Z'; });
await pg.click('#pSt button[data-s="done"]'); await pg.waitForTimeout(800);
A = await pg.evaluate(() => window.__ACT);
const toast = await pg.evaluate(() => document.getElementById('toast').textContent);
is(A.items.find(x => x.id === 1).status === 'open' && /다른 사람/.test(toast), 'conflict 면 안 바뀌고 «그새 다른 사람이 바꿨다»고 말한다');

console.log('[3] 직접 추가');
await pg.click('#addBtn'); await pg.fill('#fTitle', '펌프 예비품 확보'); await pg.selectOption('#fSev', 'bad'); await pg.selectOption('#fWho', 'ed@test.local');
await pg.click('#dlgOk'); await pg.waitForTimeout(800);
A = await pg.evaluate(() => window.__ACT);
const add = A.calls.filter(c => c.rpc === 'action_add').pop();
is(add && add.args.p_kind === 'manual' && add.args.p_ref === null && add.args.p_assignee === 'ed@test.local' && add.args.p_sev === 'bad', 'action_add(manual · ref 없음 · 담당 · 중요도)');
is((await rows()).includes(A.seq), '새 일이 목록에 선다');
is(pe.length === 0, 'JS 에러 0' + (pe.length ? ' → ' + pe[0] : ''));
await ctx.close();

console.log('[4] 조회자 — 읽기만');
ctx = await mkCtx({ email:'vw@test.local', can_write:false, role:'viewer' }, SEED);
pg = await ctx.newPage(); const pv = []; pg.on('pageerror', e => pv.push(e.message));
await pg.goto(BASE + '/action/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(1500);
await pg.click('#rows tr.it[data-id="1"]'); await pg.waitForTimeout(500);
const v = await pg.evaluate(() => ({ add:!document.getElementById('addBtn').hidden, st:!!document.getElementById('pSt'), warn:document.getElementById('warn').innerText, n:document.querySelectorAll('#rows tr.it').length }));
is(!v.add && !v.st && /읽기 전용/.test(v.warn) && v.n === 3, '추가·상태 단추가 없고 «읽기 전용»이라고 말한다 (목록은 본다)');
is(pv.length === 0, 'JS 에러 0 (조회자)');
await ctx.close();

console.log('[5] 서버 준비 전');
ctx = await mkCtx({ email:'boss@test.local', can_write:true, role:'admin' }, null, true);
pg = await ctx.newPage(); await pg.goto(BASE + '/action/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(1500);
is(/setup-24/.test(await pg.evaluate(() => document.getElementById('warn').innerText)), '표가 없으면 «setup-24 를 Run» 이라고 말한다');
await ctx.close();

console.log('[6] 통합 관제 「담기」');
const q = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const csv = rows => rows.map(r => r.map(q).join(',')).join('\n') + '\n';
const pad = n => String(n).padStart(2, '0'), ymd = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const NOW = new Date(), ASOF = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() - 1)), dAgo = n => new Date(ASOF.getTime() - n * 864e5);
const IH = ['NO','Country','Customer','Location','FAB','Line','Bay','Scrubber CODE','Scrubber S/N','Scrubber Model','Burner Type','Scrubber type','Process','Detail Process(HQ)','Detail Process(Customer)','Main Tool ID','Main Tool Maker','Main Tool Model','Receipt date','Setup date','Turn-on date','Warranty date','Warranty In/Out','설비상태'];
const inst = [IH]; for (let i = 1; i <= 6; i++) inst.push([i, 'GST TAIWAN SCRUBBER', 'MICRON', 'L', 'F16', 'L1', 'B1', 'TWC' + i, 'TWC' + i + 'S', 'M', 'B', 'SINGLE', 'E', 'D', 'D', 'MT', 'T', 'TA', '2023-03-01', '2023-03-10', '2023-03-20', '2030-01-01', 'IN', 'Operation']);
const WHF = ['제품군','운영단위','고객사','단지','라인','BAY','공정','세부공정','MODEL(자사)','실적코드','상태','의뢰유형','작업단계','챔버','WRS NO','메인설비호기','제품코드','설비호기','채널위치','S/N(IN)','S/N(OUT)','유/무상','알람유형','현상','원인','조치','세부조치내용','작업시작일','작업종료일','작업시작시간','작업종료시간','실적등록일','출하일자','총 이동시간(분)','작업시간(분)','작업공수','작업자','작업자수'];
const wk = [WHF]; let n = 0; for (const [days, code] of [[0,'TWC1'],[3,'TWC1'],[5,'TWC1'],[1,'TWC2'],[6,'TWC2']]) { n++; const d = ymd(dAgo(days));
  wk.push(['S', 'GST TAIWAN SCRUBBER', 'C', 'F16', 'F16', 'B1', 'E', 'D', 'M', 'R' + n, '완료', '정기', 'BM', 'A', 'W', 'MT', 'P', code, 'L', code + 'S', '', '무상', '', '', 'PUMP', '', '', d, d, '09:00', '10:00', d, '', '10', '60', '60', 'S', '1']); }
const SHEETS = { '891608329': csv(inst), '646668307': csv(wk) };
ctx = await mkCtx({ email:'boss@test.local', can_write:true, role:'admin' }, { items: [mk(9, { ref:'risk:TWC2S', status:'ack' })], log: [] }, false, true);
await ctx.route('**/spreadsheets/**', r => { const gid = (r.request().url().match(/gid=(\d+)/) || [])[1]; r.fulfill({ status:200, contentType:'text/csv', body: SHEETS[gid] || '' }); });
pg = await ctx.newPage(); const ph = []; pg.on('pageerror', e => ph.push(e.message));
await pg.goto(BASE + '/hub/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3500);
const qs = () => pg.evaluate(() => Array.from(document.querySelectorAll('#queue .hb-qr')).map(r => ({ t:r.querySelector('.hb-q b').textContent, take:!!r.querySelector('[data-take]'), has:(r.querySelector('[data-open]') || {}).textContent || '' })));
let Q = await qs(); if (process.env.DBG) console.log('    Q=', JSON.stringify(Q), await pg.evaluate(() => JSON.stringify({ act: GST.actCan(), me: GST._me, st: document.getElementById('status').textContent })));
const r1 = Q.find(x => /^TWC1/.test(x.t)), r2 = Q.find(x => /^TWC2/.test(x.t));
is(r1 && r1.take && r2 && !r2.take && /확인/.test(r2.has), '담긴 신호(TWC2)는 상태를 보이고, 안 담긴 신호(TWC1)는 「담기」');
await pg.click('#queue .hb-qr:has(.hb-q b:text-matches("^TWC1")) [data-take]'); await pg.waitForTimeout(700);
A = await pg.evaluate(() => window.__ACT);
const ad = A.calls.filter(c => c.rpc === 'action_add');
is(ad.length === 1 && ad[0].args.p_kind === 'risk' && /^risk:/.test(ad[0].args.p_ref) && ad[0].args.p_page === 'fault' && ad[0].args.p_op === 'GST TAIWAN SCRUBBER', 'action_add(risk · ref=risk:<설비 열쇠> · 운영단위 · fault)');
Q = await qs();
is(!Q.find(x => /^TWC1/.test(x.t)).take, '담은 뒤에는 「담기」가 상태로 바뀐다(두 번 안 담는다)');
is(ph.length === 0, 'JS 에러 0 (관제)' + (ph.length ? ' → ' + ph[0] : ''));
await ctx.close();
ctx = await mkCtx({ email:'vw@test.local', can_write:false, role:'viewer' }, { items: [], log: [] }, false, true);
await ctx.route('**/spreadsheets/**', r => { const gid = (r.request().url().match(/gid=(\d+)/) || [])[1]; r.fulfill({ status:200, contentType:'text/csv', body: SHEETS[gid] || '' }); });
pg = await ctx.newPage(); await pg.goto(BASE + '/hub/', { waitUntil:'domcontentloaded' }); await pg.waitForTimeout(3500);
is((await qs()).every(x => !x.take), '조회자에게는 「담기」가 없다');
await ctx.close();

await browser.close(); srv.close();
console.log(fail ? `\n❌ t-action: ${pass} 통과 · ${fail} 실패` : `\n✅ t-action: ${pass}/${pass} 통과`);
process.exit(fail ? 1 : 0);
