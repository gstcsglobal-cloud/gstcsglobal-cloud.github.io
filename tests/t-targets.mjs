// 운영 목표·사람별 설정(setup-27-targets.sql)을 «진짜 Postgres» 에서 돌려 본다 (2단계 밑바탕)
//
// t-editsql 과 같은 방식 — 임시 클러스터 + Supabase 를 흉내 낸 최소 스키마(allowed_users · auth.jwt)에
// «저장소의 그 SQL 파일»을 두 번 먹인다(재실행 안전). 운영 DB 에서 시험하면 이력 표에 흔적이 남는다.
// Postgres 가 없으면 «⚠️ 부분 검사»(종료코드 0 · STRICT_FIXTURES=1 이면 2).
//   지키는 것: 관리자+쓰기만 목표를 바꾼다 · 같은 범위의 살아 있는 목표는 하나 · p_at 이 다르면 덮지 않는다 ·
//   주의 경계가 «좋은 쪽»이면 거절 · 감추면 다시 만들 수 있다 · 이력이 남는다 · 표 직접 쓰기 불가 ·
//   내부 판정 함수는 authenticated 가 못 부른다 · pref_save 는 자기 행만 · 이상한 값 거절
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SQL_FILE = path.join(ROOT, 'supabase/setup-27-targets.sql');

function findBin() {
  if (process.env.PG_BIN && fs.existsSync(path.join(process.env.PG_BIN, 'initdb'))) return process.env.PG_BIN;
  try { const r = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' }); const d = (r.stdout || '').trim();
    if (d && fs.existsSync(path.join(d, 'initdb'))) return d; } catch (e) {}
  const base = '/usr/lib/postgresql';
  if (fs.existsSync(base)) { const vs = fs.readdirSync(base).filter(v => fs.existsSync(path.join(base, v, 'bin/initdb'))).sort((a, b) => +b - +a);
    if (vs.length) return path.join(base, vs[0], 'bin'); }
  return null;
}
const BIN = findBin();
if (!BIN) { console.log('⚠️  부분 검사 — PostgreSQL(initdb)이 없어 setup-27 SQL 을 실제로 돌리지 못했다'); process.exit(process.env.STRICT_FIXTURES ? 2 : 0); }

const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-targets-'));
if (asRoot) spawnSync('chown', ['-R', 'postgres:postgres', DIR]);
const run = (bin, args) => spawnSync(asRoot ? 'runuser' : path.join(BIN, bin), asRoot ? ['-u', 'postgres', '--', path.join(BIN, bin), ...args] : args, { encoding: 'utf8' });
const PORT = String(41000 + (process.pid % 19000));
const DATA = path.join(DIR, 'data');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
function psql(sql, label) {
  const f = path.join(DIR, label + '.sql'); fs.writeFileSync(f, sql); if (asRoot) spawnSync('chown', ['postgres:postgres', f]);
  const PSQL = fs.existsSync(path.join(BIN, 'psql')) ? path.join(BIN, 'psql') : 'psql';
  return spawnSync(PSQL, ['-h', DIR, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=0', '-f', f], { encoding: 'utf8' });
}
const q1 = (sql, label) => { const r = psql(sql, label || ('q' + Math.random().toString(36).slice(2, 8))); return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; };
/* 사람 하나로 부른다 — Supabase 의 authenticated 역할 + JWT email 을 흉내 낸다 */
const as = (email, sql) => { const r = q1(`begin; set local role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ email }).replace(/'/g, "''")}', true) is null;\n${sql}\ncommit;`);
  r.out = r.out.split('\n').pop(); return r; };   // 첫 줄은 set_config 의 결과 — 마지막 줄이 그 문장의 답이다

const PRELUDE = String.raw`
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
create table public.allowed_users(email text primary key, can_write boolean not null default false,
  role text not null default 'viewer', constraint allowed_users_role_chk check (role in ('viewer','editor','admin','kr')));
alter table public.allowed_users enable row level security;
create policy "self read" on public.allowed_users for select using (lower(email)=lower(auth.jwt()->>'email'));
grant select on public.allowed_users to authenticated;
insert into public.allowed_users values ('boss@test.local', true, 'admin'), ('ed@test.local', true, 'editor'),
  ('view@test.local', false, 'viewer'), ('ro-admin@test.local', false, 'admin');
`;

try {
  let r = run('initdb', ['-D', DATA, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
  if (r.status !== 0) throw new Error('initdb: ' + r.stderr);
  r = run('pg_ctl', ['-D', DATA, '-o', `-p ${PORT} -k ${DIR} -c listen_addresses=''`, '-w', 'start', '-l', path.join(DIR, 'log')]);
  if (r.status !== 0) throw new Error('pg_ctl: ' + r.stderr);
  const pre = q1(PRELUDE, 'prelude'); if (/ERROR/.test(pre.err)) throw new Error(pre.err);
  const SQL = fs.readFileSync(SQL_FILE, 'utf8');

  console.log('[1] 파일을 두 번 먹여도 된다(재실행 안전) · 지우는 문장이 없다');
  const a1 = q1(SQL, 'sql1'), a2 = q1(SQL, 'sql2');
  ok(!/ERROR/.test(a1.err) && !/ERROR/.test(a2.err), '두 번 다 오류 없음' + (/ERROR/.test(a1.err + a2.err) ? ' → ' + (a1.err + a2.err).split('\n').find(l => /ERROR/.test(l)) : ''));
  ok(!/\b(delete\s+from|truncate|drop\s+(table|policy|function))\b/i.test(SQL.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')), '지우는 문장(delete·truncate·drop) 없음 — MCP 로 바로 들어간다');

  console.log('[2] 권한');
  ok(as('view@test.local', `select public.target_save('bm_per100','all','',3,null,'le',null,null)->>'error';`).out === 'forbidden', '조회자는 forbidden');
  ok(as('ed@test.local', `select public.target_save('bm_per100','all','',3,null,'le',null,null)->>'error';`).out === 'forbidden', '사이트 담당자(editor)도 forbidden — 목표는 관리자 결정');
  ok(as('ro-admin@test.local', `select public.target_save('bm_per100','all','',3,null,'le',null,null)->>'error';`).out === 'forbidden', '쓰기 권한 없는 관리자도 forbidden');
  ok(as('', `select public.target_save('bm_per100','all','',3,null,'le',null,null)->>'error';`).out === 'login', '로그인 없음은 login');
  const direct = as('boss@test.local', `insert into public.ops_targets(metric,dir,target,created_by) values ('x1','le',1,'boss');`);
  ok(/permission denied|row-level security/.test(direct.err), '표에 직접 insert 는 관리자도 막힌다(이력 없이 쓰기 금지)');
  const inner = as('boss@test.local', `select public._tgt_who();`);
  ok(/permission denied for function/.test(inner.err), '내부 판정 함수 _tgt_who 는 authenticated 가 못 부른다');
  const anonX = q1(`select has_function_privilege('anon','public.target_save(text,text,text,numeric,numeric,text,text,timestamptz)','execute')::text, has_function_privilege('authenticated','public.target_save(text,text,text,numeric,numeric,text,text,timestamptz)','execute')::text;`);
  ok(anonX.out === 'false|true', 'target_save — anon 불가 · authenticated 가능 (' + anonX.out + ')');

  console.log('[3] 저장 · 고치기 · 충돌');
  const s1 = JSON.parse(as('boss@test.local', `select public.target_save('bm_per100','all','',3.0,3.5,'le','전사 기준',null);`).out.split('\n').pop());
  ok(s1.ok && s1.id && s1.updated_at, '전사 목표를 만든다');
  const dup = JSON.parse(as('boss@test.local', `select public.target_save('bm_per100','all','',2.5,null,'le',null,null);`).out.split('\n').pop());
  ok(dup.error === 'conflict', '같은 범위에 p_at 없이 또 만들면 conflict (덮지 않는다)');
  const upd = JSON.parse(as('boss@test.local', `select public.target_save('bm_per100','all','',2.8,null,'le','고침','${s1.updated_at}');`).out.split('\n').pop());
  ok(upd.ok && upd.id === s1.id && upd.updated_at !== s1.updated_at, '읽은 updated_at 을 실어 보내면 고친다(같은 id · 새 시각)');
  const stale = JSON.parse(as('boss@test.local', `select public.target_save('bm_per100','all','',9,null,'le',null,'${s1.updated_at}');`).out.split('\n').pop());
  ok(stale.error === 'conflict', '옛 updated_at 으로는 못 고친다(남의 변경을 덮지 않는다)');
  const cur = q1(`select target::text||'|'||coalesce(note,'') from public.ops_targets where id=${s1.id};`).out;
  ok(cur === '2.8|고침', '값은 두 번째 저장 그대로 (' + cur + ')');
  const live = q1(`select count(*) from public.ops_targets where metric='bm_per100' and scope_kind='all' and removed_at is null;`).out;
  ok(live === '1', '살아 있는 «지표 × 범위» 목표는 하나뿐');

  console.log('[4] 범위 · 값 검사');
  const op = JSON.parse(as('boss@test.local', `select public.target_save('bm_per100','op','  GST TAIWAN SCRUBBER ',2.0,null,'le',null,null);`).out.split('\n').pop());
  const opRow = q1(`select scope from public.ops_targets where id=${op.id || 0};`).out;
  ok(op.ok && opRow === 'GST TAIWAN SCRUBBER', '운영단위 범위 — 앞뒤 공백만 걷고 원문 그대로 (' + opRow + ')');
  const rg = JSON.parse(as('boss@test.local', `select public.target_save('run_rate','region','국내',93,90,'ge',null,null);`).out.split('\n').pop());
  ok(rg.ok, '구분 범위(국내) · 이상이 정상 · 주의 경계 90');
  const bad = k => JSON.parse(as('boss@test.local', `select public.target_save(${k});`).out.split('\n').pop()).error;
  ok(bad(`'run_rate','region','',93,null,'ge',null,null`) === 'bad_scope', '범위 이름이 빈 구분 범위는 bad_scope');
  ok(bad(`'Bad Metric!','all','',1,null,'le',null,null`) === 'bad_metric', '지표 열쇠 모양이 아니면 bad_metric');
  ok(bad(`'x2','all','',1,null,'eq',null,null`) === 'bad_dir', '방향은 le·ge 만');
  ok(bad(`'x3','all','',3,2,'le',null,null`) === 'bad_warn', '«이하가 정상»인데 주의 경계가 목표보다 낮으면 bad_warn');
  ok(bad(`'x4','all','',90,95,'ge',null,null`) === 'bad_warn', '«이상이 정상»인데 주의 경계가 목표보다 높으면 bad_warn');
  ok(bad(`'x5','all','',null,null,'le',null,null`) === 'bad_target', '목표가 비면 bad_target');
  const allScope = q1(`select count(*) from public.ops_targets where scope_kind='all' and scope<>'';`).out;
  ok(allScope === '0', '전사 범위는 scope 가 언제나 빈 문자열(제약)');

  console.log('[5] 감추기 · 다시 만들기 · 이력');
  const at = q1(`select updated_at from public.ops_targets where id=${s1.id};`).out;
  const rmStale = JSON.parse(as('boss@test.local', `select public.target_remove(${s1.id}, '${s1.updated_at}');`).out.split('\n').pop());
  ok(rmStale.error === 'conflict', '옛 시각으로는 못 감춘다');
  const rm = JSON.parse(as('boss@test.local', `select public.target_remove(${s1.id}, '${at}');`).out.split('\n').pop());
  ok(rm.ok, '지금 시각으로 감춘다');
  ok(q1(`select count(*) from public.ops_targets where id=${s1.id} and removed_at is not null;`).out === '1', '행은 남고 removed_at 이 찍힌다(지우지 않는다)');
  const again = JSON.parse(as('boss@test.local', `select public.target_save('bm_per100','all','',3.2,null,'le',null,null);`).out.split('\n').pop());
  ok(again.ok && again.id !== s1.id, '감춘 뒤 같은 범위에 새 목표를 만들 수 있다');
  const rm2 = JSON.parse(as('boss@test.local', `select public.target_remove(${s1.id}, '${at}');`).out.split('\n').pop());
  ok(rm2.error === 'not_found', '이미 감춘 목표는 not_found');
  const log = q1(`select string_agg(op, ',' order by id) from public.ops_target_log where target_id=${s1.id};`).out;
  ok(log === 'create,update,remove', '이력이 create → update → remove 로 남는다 (' + log + ')');
  const logBy = q1(`select count(*) from public.ops_target_log where by<>'boss@test.local';`).out;
  ok(logBy === '0', '이력의 «누가»는 토큰에서 읽는다(인자로 못 바꾼다)');

  console.log('[6] 읽기 정책');
  const vr = as('view@test.local', `select count(*) from public.ops_targets where removed_at is null;`).out.split('\n').pop();
  ok(+vr >= 3, '조회자도 목표를 읽는다(판정 색의 근거) — ' + vr + '행');
  const stranger = as('nobody@test.local', `select count(*) from public.ops_targets;`).out.split('\n').pop();
  ok(stranger === '0', '허용 목록에 없는 사람은 0행');

  console.log('[7] 사람별 첫 화면 설정(pref_save)');
  const p1 = JSON.parse(as('view@test.local', `select public.pref_save('field','GST TAIWAN SCRUBBER','zh');`).out.split('\n').pop());
  ok(p1.ok, '자기 설정을 저장한다');
  const me = as('view@test.local', `select home_view||'|'||home_op||'|'||lang from public.allowed_users where email='view@test.local';`).out.split('\n').pop();
  ok(me === 'field|GST TAIWAN SCRUBBER|zh', '자기 행에서 읽힌다 (' + me + ')');
  const other = q1(`select coalesce(home_view,'-') from public.allowed_users where email='boss@test.local';`).out;
  ok(other === '-', '남의 행은 그대로');
  ok(JSON.parse(as('view@test.local', `select public.pref_save('boss',null,null);`).out.split('\n').pop()).error === 'bad_view', '모르는 화면 이름은 bad_view');
  ok(JSON.parse(as('view@test.local', `select public.pref_save(null,null,'fr');`).out.split('\n').pop()).error === 'bad_lang', '모르는 언어는 bad_lang');
  ok(JSON.parse(as('nobody@test.local', `select public.pref_save('exec',null,null);`).out.split('\n').pop()).error === 'not_found', '허용 목록에 없는 사람은 not_found');
  const clr = JSON.parse(as('view@test.local', `select public.pref_save(null,'   ',null);`).out.split('\n').pop());
  const me2 = q1(`select coalesce(home_view,'-')||'|'||coalesce(home_op,'-') from public.allowed_users where email='view@test.local';`).out;
  ok(clr.ok && me2 === '-|-', '비우면 null 로 돌아간다(빈칸 운영단위도 null)');
  const upd2 = as('view@test.local', `update public.allowed_users set role='admin' where email='view@test.local';`);
  ok(/permission denied/.test(upd2.err), '자기 행이라도 표를 직접 고쳐 등급을 올릴 수는 없다');

  console.log('[8] 판정 기준(param_save) — 코드의 기준 숫자를 표로');
  const J = x => JSON.parse(x.out);
  ok(J(as('ed@test.local', `select public.param_save('sig_bad_x',1.8,null);`)).error === 'forbidden', '사이트 담당자는 판정 기준을 못 바꾼다');
  const ps1 = J(as('boss@test.local', `select public.param_save('sig_bad_x',1.8,null);`));
  ok(ps1.ok && ps1.updated_at, '관리자가 처음 바꾼다(행이 없으면 p_at = null)');
  ok(J(as('boss@test.local', `select public.param_save('sig_bad_x',2,null);`)).error === 'conflict', '이미 있는데 p_at 없이 또 바꾸면 conflict');
  const ps2 = J(as('boss@test.local', `select public.param_save('sig_bad_x',null,'${ps1.updated_at}');`));
  ok(ps2.ok && q1(`select coalesce(value::text,'null') from public.ops_params where key='sig_bad_x';`).out === 'null', 'null 로 저장 = «기본값으로» — 행은 남는다(지우지 않는다)');
  ok(J(as('boss@test.local', `select public.param_save('Bad Key',1,null);`)).error === 'bad_key', '열쇠 모양이 아니면 bad_key');
  ok(J(as('boss@test.local', `select public.param_save('risk_pm',-1,null);`)).error === 'bad_value', '음수는 bad_value');
  ok(q1(`select string_agg(coalesce(v_from::text,'∅')||'→'||coalesce(v_to::text,'∅'), ',' order by id) from public.ops_param_log where key='sig_bad_x';`).out === '∅→1.8,1.8→∅', '이력이 «전 → 후»로 남는다');
  ok(/permission denied/.test(as('boss@test.local', `update public.ops_params set value=9 where key='sig_bad_x';`).err), '표를 직접 고칠 수는 없다');
  ok(as('view@test.local', `select count(*) from public.ops_params;`).out === '1', '조회자도 판정 기준을 읽는다(색의 근거)');

  console.log('[9] 브리핑 스냅샷(brief_put) — 챗봇이 읽는다');
  const bp = (who, sc, d, pl) => J(as(who, `select public.brief_put('${sc}','${d}','${JSON.stringify(pl).replace(/'/g, "''")}'::jsonb,166);`));
  ok(bp('view@test.local', 'all', '2026-10-09', { k:1 }).error === 'forbidden', '조회자 브라우저는 남기지 않는다');
  ok(bp('ed@test.local', 'all', '2026-10-09', { k:1 }).ok, '사이트 담당자는 남긴다(처리함을 쓰는 사람과 같은 규칙)');
  ok(bp('boss@test.local', 'all', '2026-10-02', { k:0 }).error === 'older', '더 옛날 자료로 계산한 스냅샷은 새 것을 못 덮는다');
  ok(q1(`select payload->>'k' from public.brief_snap where scope='all';`).out === '1', '그래서 값은 새 것 그대로');
  ok(bp('boss@test.local', 'all', '2026-10-09', { k:2 }).ok && q1(`select payload->>'k'||'|'||made_by from public.brief_snap where scope='all';`).out === '2|boss@test.local', '같은 날 자료면 덮는다 · 누가 남겼는지는 토큰에서');
  ok(bp('boss@test.local', 'o:GST TAIWAN SCRUBBER', '2026-10-09', { k:3 }).ok, '운영단위 범위도 남긴다');
  ok(bp('boss@test.local', 'x:bad', '2026-10-09', { k:3 }).error === 'bad_scope', '범위 열쇠 모양(all · r: · o:)이 아니면 bad_scope');
  ok(J(as('boss@test.local', `select public.brief_put('all','2026-10-09','[1,2]'::jsonb,1);`)).error === 'bad_payload', '객체가 아닌 payload 는 bad_payload');
  const big = 'x'.repeat(40000);
  ok(bp('boss@test.local', 'all', '2026-10-10', { big }).error === 'too_big', '32KB 를 넘으면 too_big (챗봇 답은 1,000자다)');
  ok(as('view@test.local', `select count(*) from public.brief_snap;`).out === '2', '조회자도 읽는다');
  ok(/permission denied/.test(as('boss@test.local', `insert into public.brief_snap(scope,as_of,payload,made_by) values ('all','2030-01-01','{}','x') on conflict (scope) do update set as_of=excluded.as_of;`).err), '표를 직접 쓸 수는 없다(위조 방지)');
} catch (e) {
  fail++; console.log('  ❌ 검사가 중간에 멈췄다: ' + (e && e.message || e));
} finally {
  run('pg_ctl', ['-D', DATA, '-m', 'immediate', 'stop']);
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
}
console.log((fail ? '❌' : '✅') + ` t-targets ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
