// 화면 편집(setup-32-screens.sql)을 «진짜 Postgres» 에서 돌려 본다 (v202)
//
// t-targets 와 같은 방식 — 임시 클러스터 + Supabase 를 흉내 낸 최소 스키마에 «저장소의 그 SQL 파일»을 두 번 먹인다.
//   지키는 것: 전체 기본 배치는 관리자+쓰기만 · 개인 배치는 허용 사용자 누구나 · 남의 개인 배치는 안 보인다 ·
//   p_at 이 다르면 덮지 않는다 · 원래대로 = 감춤(지우지 않는다) · 전체 기본만 이력 · 표 직접 쓰기 불가 ·
//   보드 게시는 관리자+쓰기만 · 게시하면 공유가 켜진다 · 이상한 값 거절 · 지우는 문장 없음
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SQL_FILE = path.join(ROOT, 'supabase/setup-32-screens.sql');

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
if (!BIN) { console.log('⚠️  부분 검사 — PostgreSQL(initdb)이 없어 setup-32 SQL 을 실제로 돌리지 못했다'); process.exit(process.env.STRICT_FIXTURES ? 2 : 0); }

const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-screen-'));
if (asRoot) spawnSync('chown', ['-R', 'postgres:postgres', DIR]);
const run = (bin, args) => spawnSync(asRoot ? 'runuser' : path.join(BIN, bin), asRoot ? ['-u', 'postgres', '--', path.join(BIN, bin), ...args] : args, { encoding: 'utf8' });
const PORT = String(43000 + (process.pid % 17000));
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
  ('view@test.local', false, 'viewer'), ('ro-admin@test.local', false, 'admin'), ('view2@test.local', false, 'viewer');
create table public.sheet_edits(id bigint generated always as identity primary key, gid text, row_key text, op text, before jsonb, after jsonb,
  edited_by text, edited_at timestamptz, tbl text);
alter table public.sheet_edits enable row level security;
create or replace function public._tgt_who() returns text language sql stable security definer set search_path = public as $$
  select a.email from public.allowed_users a where lower(a.email) = lower(coalesce(auth.jwt()->>'email','')) and a.can_write and a.role = 'admin' limit 1 $$;
revoke all on function public._tgt_who() from public, anon, authenticated;
`;


try {
  let r = run('initdb', ['-D', DATA, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
  if (r.status !== 0) throw new Error('initdb: ' + r.stderr);
  r = run('pg_ctl', ['-D', DATA, '-o', `-p ${PORT} -k ${DIR} -c listen_addresses=''`, '-w', 'start', '-l', path.join(DIR, 'log')]);
  if (r.status !== 0) throw new Error('pg_ctl: ' + r.stderr);
  const pre = q1(PRELUDE, 'prelude'); if (/ERROR/.test(pre.err)) throw new Error(pre.err);
  const L25 = q1(fs.readFileSync(path.join(ROOT, 'supabase/setup-25-layouts.sql'), 'utf8'), 'l25'); if (/ERROR/.test(L25.err)) throw new Error('setup-25: ' + L25.err);
  const SQL = fs.readFileSync(SQL_FILE, 'utf8');

  console.log('[1] 파일을 두 번 먹여도 된다 · 지우는 문장이 없다');
  const a1 = q1(SQL, 'sql1'), a2 = q1(SQL, 'sql2');
  ok(!/ERROR/.test(a1.err) && !/ERROR/.test(a2.err), '두 번 다 오류 없음' + (/ERROR/.test(a1.err + a2.err) ? ' → ' + (a1.err + a2.err).split('\n').find(l => /ERROR/.test(l)) : ''));
  ok(!/\b(delete\s+from|truncate|drop\s+(table|policy|function))\b/i.test(SQL.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')), '지우는 문장(delete·truncate·drop) 없음 — MCP 로 바로 들어간다');

  const CFG = `'{"v":1,"order":["cv:a","cv:b"],"hidden":["cv:c"]}'::jsonb`;
  console.log('[2] 전체 기본 배치 — 관리자 + 쓰기만');
  ok(as('view@test.local', `select public.screen_layout_save('fault','all',${CFG},null)->>'error';`).out === 'forbidden', '조회자는 전체 기본 배치를 못 바꾼다');
  ok(as('ed@test.local', `select public.screen_layout_save('fault','all',${CFG},null)->>'error';`).out === 'forbidden', '사이트 담당자도 못 바꾼다');
  ok(as('ro-admin@test.local', `select public.screen_layout_save('fault','all',${CFG},null)->>'error';`).out === 'forbidden', '쓰기 권한 없는 관리자도 못 바꾼다');
  ok(as('', `select public.screen_layout_save('fault','all',${CFG},null)->>'error';`).out === 'login', '로그인 없음은 login');
  const s1 = as('boss@test.local', `select public.screen_layout_save('fault','all',${CFG},null);`);
  const at1 = (JSON.parse(s1.out || '{}')).at;
  ok(/"ok": true/.test(s1.out) && !!at1, '관리자는 저장한다 · 저장 시각을 돌려준다');
  ok(as('view@test.local', `select count(*) from public.screen_layouts where page='fault' and owner='';`).out === '1', '조회자도 전체 기본 배치를 읽는다');
  ok(as('boss@test.local', `select public.screen_layout_save('fault','all',${CFG},null)->>'error';`).out === 'conflict', '이미 있는데 p_at 없이 저장하면 conflict');
  ok(as('boss@test.local', `select public.screen_layout_save('fault','all',${CFG},'2020-01-01')->>'error';`).out === 'conflict', 'p_at 이 다르면 conflict (남의 변경을 덮지 않는다)');
  const s2 = as('boss@test.local', `select public.screen_layout_save('fault','all','{"v":1,"order":["cv:b","cv:a"]}'::jsonb,'${at1}');`);
  const at2 = (JSON.parse(s2.out || '{}')).at;
  ok(/"ok": true/.test(s2.out), '읽은 시각으로는 고친다');
  ok(q1(`select count(*) from public.sheet_edits where gid='screen' and row_key='fault' and op='screen_save';`).out === '2', '전체 기본 저장은 이력이 남는다(두 줄)');

  console.log('[3] 개인 배치 — 누구나 · 자기 것만 보인다');
  ok(/"ok": true/.test(as('view@test.local', `select public.screen_layout_save('fault','me','{"v":1,"hidden":["cv:a"]}'::jsonb,null);`).out), '조회자도 자기 화면 배치는 저장한다');
  ok(as('view@test.local', `select count(*) from public.screen_layouts where page='fault';`).out === '2', '자기 것 + 전체 기본 = 2줄');
  ok(as('view2@test.local', `select count(*) from public.screen_layouts where page='fault';`).out === '1', '남의 개인 배치는 안 보인다');
  ok(q1(`select count(*) from public.sheet_edits where gid='screen' and row_key='fault' and op='screen_save';`).out === '2', '개인 배치는 이력에 안 남는다');
  ok(as('view@test.local', `select public.screen_layout_save('Fault!','me','{}'::jsonb,null)->>'error';`).out === 'bad_page', '이상한 화면 이름은 거절');
  ok(as('view@test.local', `select public.screen_layout_save('fault','x','{}'::jsonb,null)->>'error';`).out === 'bad_scope', '이상한 범위는 거절');
  ok(as('view@test.local', `select public.screen_layout_save('pm','me','[1,2]'::jsonb,null)->>'error';`).out === 'bad_config', '객체가 아닌 설정은 거절');

  console.log('[4] 원래대로 = 감춤 (지우지 않는다)');
  ok(as('boss@test.local', `select public.screen_layout_save('fault','all',null,'${at1}')->>'error';`).out === 'conflict', '옛 시각으로는 원래대로도 막힌다');
  ok(/"ok": true/.test(as('boss@test.local', `select public.screen_layout_save('fault','all',null,'${at2}');`).out), '읽은 시각으로 원래대로');
  ok(q1(`select removed from public.screen_layouts where page='fault' and owner='';`).out === 't', '행은 남고 removed=true');
  ok(as('view2@test.local', `select count(*) from public.screen_layouts where page='fault';`).out === '0', '감춘 배치는 안 보인다');
  ok(/"ok": true/.test(as('boss@test.local', `select public.screen_layout_save('fault','all',${CFG},null);`).out), '감춘 뒤에는 새로 저장할 수 있다(p_at 없이)');
  ok(q1(`select count(*) from public.sheet_edits where gid='screen' and op='screen_reset';`).out === '1', '원래대로도 이력이 남는다');

  console.log('[5] 표 직접 쓰기 불가');
  ok(/permission denied|row-level security/.test(as('boss@test.local', `insert into public.screen_layouts(page,owner,config) values ('pm','','{}');`).err), '관리자도 표에 직접 insert 못 한다');
  ok(/permission denied|row-level security/.test(as('boss@test.local', `update public.screen_layouts set removed=true;`).err + as('boss@test.local', `update public.screen_layouts set removed=true returning 1;`).err) || as('boss@test.local', `update public.screen_layouts set removed=true returning 1;`).out === '', '표에 직접 update 못 한다');

  console.log('[6] 보드 게시 — 관리자 + 쓰기만 · 공유가 켜진다');
  const bid = as('view@test.local', `select (public.layout_save(null,'설비 일일 현황','{"v":1,"widgets":[]}'::jsonb,false)->>'id');`).out;
  ok(/^\d+$/.test(bid), '보드를 하나 만든다(조회자 · 비공유)');
  const PUB = `'{"tab":"설비 일일 현황","vis":"all","place":"tab"}'::jsonb`;
  ok(as('view@test.local', `select public.board_publish(${bid},${PUB})->>'error';`).out === 'forbidden', '조회자는 게시 못 한다');
  ok(as('ed@test.local', `select public.board_publish(${bid},${PUB})->>'error';`).out === 'forbidden', '사이트 담당자도 게시 못 한다');
  ok(/"ok": true/.test(as('boss@test.local', `select public.board_publish(${bid},${PUB});`).out), '관리자는 게시한다');
  ok(q1(`select shared::text||'|'||(pub->>'tab')||'|'||(pub->>'vis')||'|'||(pub->>'place') from public.user_layouts where id=${bid};`).out === 'true|설비 일일 현황|all|tab', '게시하면 shared 가 켜지고 pub 가 남는다');
  ok(as('view2@test.local', `select count(*) from public.user_layouts where pub is not null;`).out === '1', '다른 사람도 게시된 보드를 읽는다(탭이 선다)');
  ok(as('boss@test.local', `select public.board_publish(${bid},'{"tab":"","vis":"all","place":"tab"}'::jsonb)->>'error';`).out === 'bad_tab', '빈 탭 이름은 거절');
  ok(as('boss@test.local', `select public.board_publish(${bid},'{"tab":"x","vis":"everyone","place":"tab"}'::jsonb)->>'error';`).out === 'bad_vis', '이상한 공개 범위는 거절');
  ok(as('boss@test.local', `select public.board_publish(${bid},'{"tab":"x","vis":"all","place":"side"}'::jsonb)->>'error';`).out === 'bad_place', '이상한 표시 위치는 거절');
  ok(as('boss@test.local', `select public.board_publish(999999,${PUB})->>'error';`).out === 'not_found', '없는 보드는 not_found');
  ok(/"ok": true/.test(as('boss@test.local', `select public.board_publish(${bid},null);`).out) && q1(`select pub is null from public.user_layouts where id=${bid};`).out === 't', '게시 취소 = pub 비움');
  ok(q1(`select count(*) from public.sheet_edits where gid='screen' and op in ('board_publish','board_unpublish');`).out === '2', '게시·게시 취소 이력');
  ok(/permission denied for function/.test(as('boss@test.local', `select public._tgt_who();`).err), '내부 판정 함수는 authenticated 가 못 부른다');
  ok(/permission denied for function/.test(q1(`set role anon; select public.screen_layout_save('fault','me','{}'::jsonb,null);`).err), 'anon 은 저장 함수를 못 부른다');
} catch (e) { fail++; console.log('  ❌ ' + (e && e.message || e)); }
finally { run('pg_ctl', ['-D', DATA, '-m', 'immediate', 'stop']); try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} }
console.log(`\n${fail ? '❌' : '✅'} t-screensql ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
