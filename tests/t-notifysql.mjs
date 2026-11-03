// 알림·화면 버전·지표·주석·북마크(setup-33-notify.sql)를 «진짜 Postgres» 에서 돌려 본다 (v207)
//
// t-screensql 과 같은 방식 — 임시 클러스터 + Supabase 를 흉내 낸 최소 스키마에 «저장소의 그 SQL 파일»을 두 번 먹인다.
//   지키는 것: 수신자 등록·수정·빼기는 관리자+쓰기만 · 카톡은 챗봇 인증을 마친 이메일만 · 같은 사람·채널·범위 중복 거절 · p_at 충돌 ·
//   관리 화면 읽기에 카톡 식별자(bot_user_key)가 안 나온다 · 표 직접 읽기·쓰기 불가 · 화면 배치·보드가 바뀔 때마다 버전이 남는다 ·
//   버전 읽기는 «그 배치를 읽을 수 있는 사람»만 · 지표·주석·북마크의 공유 규칙 · 감추기는 내 것(또는 관리자)만 · 지우는 문장 없음
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SQL_FILE = path.join(ROOT, 'supabase/setup-33-notify.sql');

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
if (!BIN) { console.log('⚠️  부분 검사 — PostgreSQL(initdb)이 없어 setup-33 SQL 을 실제로 돌리지 못했다'); process.exit(process.env.STRICT_FIXTURES ? 2 : 0); }

const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-notify-'));
if (asRoot) spawnSync('chown', ['-R', 'postgres:postgres', DIR]);
const run = (bin, args) => spawnSync(asRoot ? 'runuser' : path.join(BIN, bin), asRoot ? ['-u', 'postgres', '--', path.join(BIN, bin), ...args] : args, { encoding: 'utf8' });
const PORT = String(26000 + (process.pid % 16000));
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
create table public.allowed_users(email text primary key, note text, can_write boolean not null default false,
  role text not null default 'viewer', constraint allowed_users_role_chk check (role in ('viewer','editor','admin','kr')));
alter table public.allowed_users enable row level security;
create policy "self read" on public.allowed_users for select using (lower(email)=lower(auth.jwt()->>'email'));
grant select on public.allowed_users to authenticated;
insert into public.allowed_users(email,can_write,role) values ('boss@test.local', true, 'admin'), ('ed@test.local', true, 'editor'),
  ('view@test.local', false, 'viewer'), ('ro-admin@test.local', false, 'admin'), ('view2@test.local', false, 'viewer');
create table public.sheet_edits(id bigint generated always as identity primary key, gid text, row_key text, op text, before jsonb, after jsonb,
  edited_by text, edited_at timestamptz, tbl text);
alter table public.sheet_edits enable row level security;
create or replace function public._tgt_who() returns text language sql stable security definer set search_path = public as $$
  select a.email from public.allowed_users a where lower(a.email) = lower(coalesce(auth.jwt()->>'email','')) and a.can_write and a.role = 'admin' limit 1 $$;
revoke all on function public._tgt_who() from public, anon, authenticated;
create or replace function public._act_who() returns text language sql stable security definer set search_path = public as $$
  select a.email from public.allowed_users a where lower(a.email) = lower(coalesce(auth.jwt()->>'email','')) and (a.can_write or a.role in ('admin','editor','kr')) limit 1 $$;
revoke all on function public._act_who() from public, anon, authenticated;
create table public.kakao_users(bot_user_key text primary key, email text, status text, verified_at timestamptz);
alter table public.kakao_users enable row level security;
insert into public.kakao_users values ('BK-1','view@test.local','verified', now()), ('BK-2','view@test.local','verified', now()), ('BK-3','out@other.local','verified', now()), ('BK-4','ed@test.local','awaiting_otp', null);
`;



try {
  let r = run('initdb', ['-D', DATA, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
  if (r.status !== 0) throw new Error('initdb: ' + r.stderr);
  r = run('pg_ctl', ['-D', DATA, '-o', `-p ${PORT} -k ${DIR} -c listen_addresses=''`, '-w', 'start', '-l', path.join(DIR, 'log')]);
  if (r.status !== 0) throw new Error('pg_ctl: ' + r.stderr);
  const pre = q1(PRELUDE, 'prelude'); if (/ERROR/.test(pre.err)) throw new Error(pre.err);
  for (const f of ['setup-25-layouts.sql', 'setup-32-screens.sql']) { const x = q1(fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8'), f.slice(0, 8)); if (/ERROR/.test(x.err)) throw new Error(f + ': ' + x.err); }
  const SQL = fs.readFileSync(SQL_FILE, 'utf8');

  console.log('[1] 파일을 두 번 먹여도 된다 · 지우는 문장이 없다');
  const a1 = q1(SQL, 'sql1'), a2 = q1(SQL, 'sql2');
  ok(!/ERROR/.test(a1.err) && !/ERROR/.test(a2.err), '두 번 다 오류 없음' + (/ERROR/.test(a1.err + a2.err) ? ' → ' + (a1.err + a2.err).split('\n').find(l => /ERROR/.test(l)) : ''));
  ok(!/\b(delete\s+from|truncate|drop\s+(table|policy|function|trigger))\b/i.test(SQL.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')), '지우는 문장(delete·truncate·drop) 없음 — MCP 로 바로 들어간다');

  console.log('[2] 수신자 — 관리자 + 쓰기만');
  const SET = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
  ok(as('view@test.local', `select public.notify_save(null, ${SET({ channel:'email', target:'x@test.local' })}, null)->>'error';`).out === 'forbidden', '조회자는 수신자를 등록 못 한다');
  ok(as('ro-admin@test.local', `select public.notify_save(null, ${SET({ channel:'email', target:'x@test.local' })}, null)->>'error';`).out === 'forbidden', '쓰기 권한 없는 관리자도 못 한다');
  ok(as('view@test.local', `select public.notify_admin()->>'error';`).out === 'forbidden', '조회자는 관리 화면 자료를 못 읽는다');
  const s1 = as('boss@test.local', `select public.notify_save(null, ${SET({ channel:'email', target:'X@Test.local', label:'법인장', freq:'weekly', hour:8, dow:1, scope:'all', kinds:['brief','actions'] })}, null);`);
  const d1 = JSON.parse(s1.out || '{}');
  ok(d1.ok && /^\d+$/.test(String(d1.id)), '관리자는 메일 수신자를 등록한다');
  ok(q1(`select target from public.notify_subs where id=${d1.id};`).out === 'x@test.local', '주소는 소문자로 남는다');
  ok(as('boss@test.local', `select public.notify_save(null, ${SET({ channel:'email', target:'x@test.local' })}, null)->>'error';`).out === 'duplicate', '같은 채널·받는 사람·범위는 중복 거절');
  ok(/"ok": true/.test(as('boss@test.local', `select public.notify_save(null, ${SET({ channel:'email', target:'x@test.local', scope:'o:GST TAIWAN SCRUBBER' })}, null);`).out), '범위가 다르면 따로 등록된다');
  ok(as('boss@test.local', `select public.notify_save(null, ${SET({ channel:'email', target:'not-an-email' })}, null)->>'error';`).out === 'bad_target', '주소 꼴이 아니면 거절');
  ok(as('boss@test.local', `select public.notify_save(null, ${SET({ channel:'email', target:'y@test.local', hour:25 })}, null)->>'error';`).out === 'bad_hour', '시각 0~23 밖은 거절');
  ok(as('boss@test.local', `select public.notify_save(null, ${SET({ channel:'email', target:'y@test.local', dom:31 })}, null)->>'error';`).out === 'bad_dom', '날짜 29~31 은 거절(그날이 없는 달)');
  ok(as('boss@test.local', `select public.notify_save(null, ${SET({ channel:'email', target:'y@test.local', kinds:['spam'] })}, null)->>'error';`).out === 'bad_kinds', '모르는 내용 종류는 거절');
  ok(as('boss@test.local', `select public.notify_save(null, ${SET({ channel:'sms', target:'y@test.local' })}, null)->>'error';`).out === 'bad_channel', '모르는 채널은 거절');

  console.log('[3] 카톡 — 챗봇 인증을 마친 이메일만 · 식별자는 화면에 안 나온다');
  ok(as('boss@test.local', `select public.notify_save(null, ${SET({ channel:'kakao', target:'ed@test.local' })}, null)->>'error';`).out === 'kakao_not_verified', '인증을 안 마친 사람은 카톡으로 고를 수 없다');
  ok(/"ok": true/.test(as('boss@test.local', `select public.notify_save(null, ${SET({ channel:'kakao', target:'view@test.local', freq:'daily', hour:9 })}, null);`).out), '인증된 사람은 카톡 수신자로 등록된다');
  const adm = as('boss@test.local', `select public.notify_admin()::text;`).out;
  ok(!/BK-\d/.test(adm), '관리 화면 자료에 bot_user_key 가 없다');
  const K = JSON.parse(adm || '{}');
  ok((K.kakao || []).length === 2 && (K.kakao || []).find(x => x.email === 'view@test.local').n === 2, '카톡 인증 사용자는 이메일별로 묶는다(한 사람이 두 기기여도 한 줄)');
  ok((K.kakao || []).find(x => x.email === 'out@other.local').allowed === false, '대시보드 사용자가 아닌 인증자는 «아님»으로 표시');
  ok((K.subs || []).length === 3 && Array.isArray(K.people) && Array.isArray(K.log), '수신자 · 허용 사용자 · 이력이 한 번에 온다');

  console.log('[4] 수정 · 빼기 — p_at · 이력');
  const at1 = q1(`select updated_at from public.notify_subs where id=${d1.id};`).out;
  ok(as('boss@test.local', `select public.notify_save(${d1.id}, ${SET({ hour:10 })}, '2020-01-01')->>'error';`).out === 'conflict', 'p_at 이 다르면 conflict(남의 변경을 덮지 않는다)');
  ok(/"ok": true/.test(as('boss@test.local', `select public.notify_save(${d1.id}, ${SET({ hour:10, enabled:false })}, '${at1}');`).out), '읽은 시각으로는 고친다');
  ok(q1(`select hour||'|'||enabled||'|'||coalesce(label,'') from public.notify_subs where id=${d1.id};`).out === '10|false|법인장', '준 칸만 바뀐다(이름표는 그대로)');
  const at2 = q1(`select updated_at from public.notify_subs where id=${d1.id};`).out;
  ok(/"ok": true/.test(as('boss@test.local', `select public.notify_remove(${d1.id}, '${at2}');`).out) && q1(`select removed from public.notify_subs where id=${d1.id};`).out === 't', '빼기 = 감춤(행은 남는다)');
  ok(/"ok": true/.test(as('boss@test.local', `select public.notify_save(null, ${SET({ channel:'email', target:'x@test.local' })}, null);`).out), '뺀 사람은 다시 등록할 수 있다');
  ok(q1(`select count(*) from public.sheet_edits where gid='notify';`).out === '6', '등록·수정·빼기는 변경 이력에 남는다(6줄)');

  console.log('[5] 표 직접 읽기·쓰기 불가');
  ok(/permission denied/.test(as('boss@test.local', `select count(*) from public.notify_subs;`).err), '관리자도 수신자 표를 직접 못 읽는다(함수로만)');
  ok(/permission denied/.test(as('boss@test.local', `insert into public.notify_subs(channel,target,created_by) values ('email','z@test.local','x');`).err), '표에 직접 insert 못 한다');
  ok(/permission denied/.test(as('boss@test.local', `select count(*) from public.kakao_outbox;`).err), '카톡 대기함은 서버 키만');
  ok(/permission denied for function/.test(q1(`set role anon; select public.notify_admin();`).err), 'anon 은 관리 함수를 못 부른다');

  console.log('[6] 화면 버전 — 트리거가 남긴다 · 읽을 수 있는 사람만');
  const C1 = `'{"v":1,"order":["a","b"]}'::jsonb`, C2 = `'{"v":1,"order":["b","a","c"]}'::jsonb`;
  const sa = JSON.parse(as('boss@test.local', `select public.screen_layout_save('fault','all',${C1},null);`).out || '{}');
  as('boss@test.local', `select public.screen_layout_save('fault','all',${C2},'${sa.at}');`);
  as('view@test.local', `select public.screen_layout_save('fault','me',${C1},null);`);
  const V = JSON.parse(as('view2@test.local', `select public.layout_versions('screen','fault|')::text;`).out || '{}');
  ok((V.list || []).length === 2 && V.list[0].n === 3 && V.list[1].n === 2, '전체 기본 배치 버전 둘 — 최근 것이 먼저 · 카드 수');
  const vid = V.list && V.list[1] && V.list[1].id;
  ok(JSON.parse(as('view2@test.local', `select public.layout_version(${vid})::text;`).out || '{}').config.order.join() === 'a,b', '버전 하나를 그대로 읽는다(옛 순서)');
  ok(as('view2@test.local', `select public.layout_versions('screen','fault|view@test.local')->>'error';`).out === 'forbidden', '남의 개인 배치 버전은 못 본다');
  ok(JSON.parse(as('view@test.local', `select public.layout_versions('screen','fault|view@test.local')::text;`).out || '{}').list.length === 1, '내 개인 배치 버전은 본다');
  const pid = q1(`select id from public.layout_hist where ref='fault|view@test.local' limit 1;`).out;
  ok(as('view2@test.local', `select public.layout_version(${pid})->>'error';`).out === 'forbidden', '남의 버전 번호를 알아도 못 읽는다');
  as('boss@test.local', `select public.screen_layout_save('fault','all',null,(select updated_at from public.screen_layouts where page='fault' and owner=''));`);
  ok(JSON.parse(as('view2@test.local', `select public.layout_versions('screen','fault|')::text;`).out || '{}').list[0].reset === true, '원래대로도 버전에 «되돌림»으로 남는다');
  const bid = as('view@test.local', `select (public.layout_save(null,'보드','{"v":2,"widgets":[{"kind":"title"}]}'::jsonb,false)->>'id');`).out;
  as('view@test.local', `select public.layout_save(${bid},'보드','{"v":2,"widgets":[{"kind":"title"},{"kind":"text"}]}'::jsonb,false);`);
  as('view@test.local', `select public.layout_save(${bid},'보드 이름만','{"v":2,"widgets":[{"kind":"title"},{"kind":"text"}]}'::jsonb,false);`);
  ok(JSON.parse(as('view@test.local', `select public.layout_versions('board','${bid}')::text;`).out || '{}').list.length === 2, '보드 버전 — 설정이 바뀔 때만 남는다(이름만 바꾼 저장은 안 남는다)');
  ok(as('view2@test.local', `select public.layout_versions('board','${bid}')->>'error';`).out === 'forbidden', '공유 안 한 남의 보드 버전은 못 본다');
  ok(/permission denied/.test(as('boss@test.local', `select count(*) from public.layout_hist;`).err), '버전 표는 함수로만 읽는다');

  console.log('[7] 지표 · 주석 · 북마크');
  const DEF = `'{"measures":[{"agg":"count"}],"filters":[{"f":"stage","op":"eq","v":"BM"}]}'::jsonb`;
  const mid = JSON.parse(as('view@test.local', `select public.metric_save(null,'BM 건수','wk',${DEF},true)::text;`).out || '{}').id;
  ok(!!mid, '조회자도 지표를 저장한다(공유)');
  ok(as('view2@test.local', `select count(*) from public.custom_metrics;`).out === '1', '공유한 지표는 다른 사람도 읽는다');
  ok(as('view2@test.local', `select public.metric_save(${mid},'남의 것','wk',${DEF},true)->>'error';`).out === 'not_yours', '남의 지표는 못 고친다');
  ok(as('view@test.local', `select public.metric_save(null,'x','WK!',${DEF},true)->>'error';`).out === 'bad_src', '이상한 자료 이름은 거절');
  ok(as('view@test.local', `select public.note_save(null,'fault','2026-10-01',null,'교체 캠페인','info',true)->>'error';`).out === 'forbidden_shared', '조치 사항을 못 쓰는 사람은 «모두에게» 주석을 못 단다');
  ok(/"ok": true/.test(as('view@test.local', `select public.note_save(null,'fault','2026-10-01',null,'내 메모','info',false);`).out), '나만 보이는 주석은 단다');
  ok(/"ok": true/.test(as('ed@test.local', `select public.note_save(null,'*','2026-10-05','2026-10-09','설비 이설','warn',true);`).out), '사이트 담당자는 모두에게 보이는 주석을 단다');
  ok(as('view2@test.local', `select count(*) from public.chart_notes;`).out === '1', '남의 «나만» 주석은 안 보이고 공유 주석만 보인다');
  ok(as('ed@test.local', `select public.note_save(null,'fault','2026-10-09','2026-10-01','x','info',true)->>'error';`).out === 'bad_date', '끝 날짜가 앞이면 거절');
  ok(as('view@test.local', `select public.bm_save(null,'우리 단지','fault','alarm','{"eq":{"op":["X"]}}'::jsonb,true)->>'error';`).out === 'forbidden_shared', '공유 북마크는 관리자만');
  const bm = JSON.parse(as('view@test.local', `select public.bm_save(null,'우리 단지','fault','alarm','{"eq":{"op":["X"]}}'::jsonb,false)::text;`).out || '{}').id;
  ok(!!bm && as('view2@test.local', `select count(*) from public.user_bookmarks;`).out === '0', '개인 북마크는 나만 본다');
  ok(as('view@test.local', `select public.bm_save(null,'x','Fault Tab',null,null,false)->>'error';`).out === 'bad_tab', '이상한 탭 이름은 거절');
  ok(as('view2@test.local', `select public.mine_remove('bookmark',${bm})->>'error';`).out === 'not_yours', '남의 북마크는 못 감춘다');
  ok(/"ok": true/.test(as('view@test.local', `select public.mine_remove('bookmark',${bm});`).out) && q1(`select removed from public.user_bookmarks where id=${bm};`).out === 't', '내 북마크는 감춘다(행은 남는다)');
  ok(/"ok": true/.test(as('boss@test.local', `select public.mine_remove('metric',${mid});`).out), '관리자는 남의 공유 지표도 감출 수 있다');
  ok(as('view@test.local', `select public.mine_remove('table',1)->>'error';`).out === 'bad_kind', '모르는 종류는 거절(표 이름을 받지 않는다)');
  ok(/permission denied/.test(as('boss@test.local', `insert into public.chart_notes(owner,d,text) values ('x','2026-01-01','y');`).err), '주석 표에 직접 insert 못 한다');
} catch (e) { fail++; console.log('  ❌ ' + (e && e.message || e)); }
finally { run('pg_ctl', ['-D', DATA, '-m', 'immediate', 'stop']); try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} }
console.log(`\n${fail ? '❌' : '✅'} t-notifysql ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
