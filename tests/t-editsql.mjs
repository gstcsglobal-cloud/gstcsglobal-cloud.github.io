// 데이터 관리 쓰기 통로(setup-16-edit.sql)를 «진짜 Postgres» 에서 돌려 본다 (v140)
//
// 왜 브라우저 검사로는 부족한가 — /edit/ 화면 검사(t-edit)는 가짜 Supabase 로 «화면이 무엇을
// 부르는가»만 본다. 그 RPC 가 실제로 ① 쓰고 ② 이력을 남기고 ③ 캐시 도장을 찍는지, 해시 충돌·
// 되돌리기·연쇄 수정이 맞는지는 SQL 이 돌아야만 안다. 운영 DB 에서 시험하면 이력 표에 시험 흔적이
// 남는다 — 그래서 임시 클러스터를 띄우고, Supabase 와 같은 모양의 «복제 스키마»(열 이름은 실제 표와
// 같다 · 값은 전부 지어낸 것)에 «저장소의 그 SQL 파일»을 그대로 먹인다(검사가 검사 대상을 다시 쓰지 않는다).
//
// Postgres 가 없는 상자에서는 «⚠️ 부분 검사»로 건너뛴다(종료코드 0 · STRICT_FIXTURES=1 이면 2).
// GitHub Actions 의 ubuntu 이미지에는 PostgreSQL 이 깔려 있어(서비스만 꺼져 있다) CI 에서는 실제로 돈다.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SQL_FILE = path.join(ROOT, 'supabase/setup-16-edit.sql');

function findBin() {
  if (process.env.PG_BIN && fs.existsSync(path.join(process.env.PG_BIN, 'initdb'))) return process.env.PG_BIN;
  try {
    const r = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
    const d = (r.stdout || '').trim();
    if (d && fs.existsSync(path.join(d, 'initdb'))) return d;
  } catch (e) {}
  const base = '/usr/lib/postgresql';
  if (fs.existsSync(base)) {
    const vs = fs.readdirSync(base).filter(v => fs.existsSync(path.join(base, v, 'bin/initdb')))
      .sort((a, b) => +b - +a);
    if (vs.length) return path.join(base, vs[0], 'bin');
  }
  return null;
}

const BIN = findBin();
if (!BIN) {
  console.log('⚠️  부분 검사 — PostgreSQL(initdb)이 없어 setup-16 SQL 을 실제로 돌리지 못했다 (PG_BIN 으로 지정 가능)');
  process.exit(process.env.STRICT_FIXTURES ? 2 : 0);
}

/* initdb 는 root 로 못 돈다 — 컨테이너(root)에서는 postgres 사용자로, CI(runner)에서는 그대로 */
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-editsql-'));
if (asRoot) spawnSync('chown', ['-R', 'postgres:postgres', DIR]);
const run = (bin, args, opt = {}) => {
  const cmd = asRoot ? 'runuser' : path.join(BIN, bin);
  const a = asRoot ? ['-u', 'postgres', '--', path.join(BIN, bin), ...args] : args;
  return spawnSync(cmd, a, { encoding: 'utf8', ...opt });
};
const PORT = String(40000 + (process.pid % 20000));
const DATA = path.join(DIR, 'data');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ❌ ' + m); } };

function psql(sql, label) {
  const f = path.join(DIR, label + '.sql');
  fs.writeFileSync(f, sql);
  if (asRoot) spawnSync('chown', ['postgres:postgres', f]);
  const PSQL = fs.existsSync(path.join(BIN, 'psql')) ? path.join(BIN, 'psql') : 'psql';
  return spawnSync(PSQL, ['-h', DIR, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-X', '-q',
    '-v', 'ON_ERROR_STOP=0', '-f', f], { encoding: 'utf8', env: { ...process.env, PGOPTIONS: '--client-min-messages=notice' } });
}

/* ---------- Supabase 를 흉내 낸 복제 스키마 ----------
   열 이름은 실제 표(information_schema 실측)와 같다. 정책·권한도 운영과 같은 모양이다:
   읽기 = allowed_users 에 있으면 · 쓰기 = can_write · sheet_edits 는 읽기 정책만(insert 정책 없음). */
const PRELUDE = String.raw`
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;

create table public.allowed_users(email text primary key, can_write boolean not null default false,
  role text not null default 'viewer' check (role in ('viewer','editor','admin')));
create table public.sheet_edits(id bigserial primary key, gid text, row_key text, op text,
  before jsonb, after jsonb, edited_by text, edited_at timestamptz default now());
create table public.sheet_sync_log(tbl text primary key, gid text, rows int, sheet_rows int, ms int, err text, synced_at timestamptz);

create table public.sheet_wk(src_row integer primary key, pg text, op text, customer text, campus text, line text, bay text,
  proc text, subproc text, model text, rs_code text, status text, req_type text, stage text, chamber text, wrs text,
  main_eq text, prod_code text, eq_no text, chpos text, sn_in text, sn_out text, pf text, alarm text, phenom text,
  cause text, action text, action_detail text, d_start text, d_end text, t_start text, t_end text, reg_date text,
  ship_date text, move_min text, work_min text, man_min text, workers text, worker_cnt text,
  synced_at timestamptz default now(), extra jsonb);
create table public.sheet_mat(src_row integer primary key, op text, customer text, rs_code text, campus text, line text,
  bay text, proc text, detail text, main_eq text, eq text, chamber text, sn text, wo text, model text, mat_code text,
  cust_mat_code text, eq_pos text, unit text, assembly text, part text, mat_pos text, qty text, mat_name text, spec text,
  reason text, prev_paid_date text, prev_date text, work_date text, days_paid text, days_prev text, pf text,
  free_reason text, warranty_term text, price text, kit_sn text, sn_in text, sn_out text, stock_chk text, store text,
  synced_at timestamptz default now(), extra jsonb);
create table public.sheet_inst(src_row integer primary key, pjt text, country text, customer text, location text, code text,
  sn text, model text, burner text, fab text, floor text, bay text, group1 text, group2 text, detail1 text, detail2 text,
  tool_id text, tool_maker text, tool_model text, fab_in text, start text, turn_on text, warranty_date text,
  warranty text, pm_cycle text, type text, extra jsonb, div text, state text, line2 text);
create table public.sheet_roster("No." text, "ID" text, "Name((영문)" text, "Name(중문)" text, "Dept." text,
  "Position Level" text, "Work Place" text, "2025 Position Role" text, "Date of entry" text, "Resignation" text,
  "조직도 위치" text, "직급" text, "업무/직책" text, "현장 인원여부" text,
  id bigint generated always as identity primary key, "인사" text, "이름(영문)" text, "이름(중문)" text,
  "직급(한글)" text, "직급(영문)" text, "담당구분" text, "사업부" text, "고객사" text, "지역" text, "팀" text,
  "단지" text, "라인" text, "입사일" text, "퇴사일" text, "E-Mail" text, "운영단위" text, "구분" text, "사원번호" text);
create table public.sheet_edu("No" bigint, "Site" text, "인원" text, "사원번호" bigint, "Basic 교육완료일" text,
  "Veteran 교육완료일" text, "Scrubber Lv.2 교육완료일" text, "Scrubber Lv.3 교육완료일" text,
  id bigint generated always as identity primary key, "구분" text);
create table public.sheet_leave("사원번호" bigint, "이름" text, "소속" text, "항목" text, "발생일" text,
  "휴가시작일" text, "휴가시작시간" text, "휴가종료일" text, "휴가종료시간" text, "휴가신청시간" double precision,
  "비고" text, id bigint generated always as identity primary key);

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['sheet_edits','sheet_sync_log','sheet_wk','sheet_mat','sheet_inst','sheet_roster','sheet_edu','sheet_leave','allowed_users'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['sheet_edits','sheet_sync_log','sheet_wk','sheet_mat','sheet_inst','sheet_roster','sheet_edu','sheet_leave'] loop
    execute format($p$create policy "allowed read" on public.%I for select using (exists (select 1 from public.allowed_users a where lower(a.email)=lower(auth.jwt()->>'email')))$p$, t);
  end loop;
  foreach t in array array['sheet_wk','sheet_mat','sheet_inst','sheet_roster','sheet_edu','sheet_leave'] loop
    execute format($p$create policy "allowed write" on public.%I for all using (exists (select 1 from public.allowed_users a where lower(a.email)=lower(auth.jwt()->>'email') and a.can_write)) with check (exists (select 1 from public.allowed_users a where lower(a.email)=lower(auth.jwt()->>'email') and a.can_write))$p$, t);
  end loop;
end $$;
create policy "self read" on public.allowed_users for select using (lower(email)=lower(auth.jwt()->>'email'));

-- setup-8 의 csv_upload_finish 그대로(운영 정의를 옮겨 적었다 — 캐시 도장의 정본)
create or replace function public.csv_upload_finish(p_tbl text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text; n int;
begin
  if not exists (select 1 from public.allowed_users a
                 where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) then
    raise exception 'read_only';
  end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst') then
    return jsonb_build_object('rows', null, 'log', false);
  end if;
  k := replace(p_tbl, 'sheet_', '');
  execute format('select count(*) from public.%I', p_tbl) into n;
  insert into public.sheet_sync_log(tbl, gid, rows, sheet_rows, ms, err, synced_at)
  values (k, '', n, n, -1, null, now())
  on conflict (tbl) do update set rows = excluded.rows, sheet_rows = excluded.sheet_rows, ms = -1, err = null, synced_at = now();
  return jsonb_build_object('rows', n, 'log', true);
end $$;

-- 지어낸 자료 (실데이터 아님)
insert into public.allowed_users values ('boss@test.local', true, 'admin'), ('ed@test.local', true, 'editor'),
  ('vw@test.local', false, 'viewer'), ('ro-admin@test.local', false, 'admin');
insert into public.sheet_sync_log values ('wk','',3,3,-1,null,'2026-01-01'), ('inst','',2,2,-1,null,'2026-01-01');
insert into public.sheet_wk(src_row, op, rs_code, stage, action, d_start, eq_no, sn_in, extra) values
  (0, 'OPX Scrubber', 'RS-T-0001', 'BM', 'RESET', '2026-01-05', 'ZQ-001', 'ZZT-0001', '{"CTC항목":"A"}'),
  (1, 'OPX Scrubber', 'RS-T-0002', 'TBM', '설비 PM', '2026-01-06', 'ZQ-002', 'ZZT-0002', null),
  (5, 'OPY Scrubber', 'RS-T-0003', 'CM', null, '2026-01-07', 'ZQ-003', 'ZZT-0003', null);
insert into public.sheet_inst(src_row, country, customer, location, code, sn, model, fab, bay, state) values
  (0, 'OPX Scrubber', 'TESTCO', 'Q1', 'ZQ-001', 'ZZT-0001', 'MDL-1', 'Q1-A', 'B01', 'Operation'),
  (1, 'OPX Scrubber', 'TESTCO', 'Q2', 'ZQ-002', 'ZZT-0002', 'MDL-2', 'Q2-A', 'B02', 'Operation');
insert into public.sheet_roster("사원번호", "이름(영문)", "단지", "입사일") values ('9100001', 'Tester One', 'Q1', '2024-01-02'),
  ('9100002', 'Tester Two', 'Q2', '2024-02-03');
insert into public.sheet_edu("사원번호", "인원", "Site") values (9100001, 'Tester One', 'Q1'), (9100002, 'Tester Two', 'Q2');

-- 검사 도우미 (검사 전용 · 운영에는 없다)
create or replace function public.t_ok(c boolean, m text) returns void language plpgsql as $$
begin if c is true then raise notice 'T_OK %', m; else raise exception 'T_FAIL %', m; end if; end $$;
create or replace function public.t_as(email text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('email', email)::text, false) $$;
grant execute on function public.t_ok(boolean, text), public.t_as(text) to authenticated;
`;

/* ---------- 검사 ----------
   하나씩 DO 블록이라 하나가 틀려도 나머지는 돈다. 기대하는 실패는 블록 안에서 잡아 «무엇으로» 실패했는지 본다. */
const CHECKS = String.raw`
set role authenticated;

-- [1] 권한 — 관리자만 · 내부 함수는 아무도 직접 못 부른다
do $$ begin perform t_as('vw@test.local');
  begin perform edit_get('sheet_wk', 0); perform t_ok(false, '1-1 viewer 가 edit_get 을 불렀다');
  exception when others then perform t_ok(sqlerrm = 'forbidden', '1-1 viewer → forbidden (' || sqlerrm || ')'); end;
end $$;
do $$ begin perform t_as('ed@test.local');
  begin perform edit_update('sheet_wk', 0, 'x', '{"stage":"CM"}'); perform t_ok(false, '1-2 editor 가 edit_update 를 불렀다');
  exception when others then perform t_ok(sqlerrm = 'forbidden', '1-2 editor → forbidden'); end;
end $$;
do $$ begin perform t_as('ro-admin@test.local');
  begin perform edit_get('sheet_wk', 0); perform t_ok(false, '1-3 can_write 없는 admin 이 통과');
  exception when others then perform t_ok(sqlerrm = 'forbidden', '1-3 admin 이라도 can_write 가 없으면 forbidden'); end;
end $$;
do $$ begin perform t_as('boss@test.local');
  /* ⚠ «insufficient_privilege» 로만 보면 안 된다 — RLS 위반(sheet_edits 에 insert 정책 없음)도 같은 코드라
     권한을 열어 둔 채로도 통과한다(음성 대조로 실제로 겪었다). 메시지가 «함수» 권한 거부인지 본다. */
  begin perform _edit_apply('sheet_wk', 0, '{}'::jsonb, '{"stage":"X"}'::jsonb, 'update', null);
        perform t_ok(false, '1-4 authenticated 가 내부 함수 _edit_apply 를 직접 불렀다');
  exception when others then perform t_ok(sqlerrm like 'permission denied for function%', '1-4 내부 함수는 실행 권한이 없다 (' || sqlerrm || ')'); end;
  begin perform _edit_log('sheet_wk', '0', 'update', null, null, null);
        perform t_ok(false, '1-5 이력 위조 경로(_edit_log)가 열려 있다');
  exception when others then perform t_ok(sqlerrm like 'permission denied for function%', '1-5 _edit_log 도 직접 못 부른다 (' || sqlerrm || ')'); end;
  begin insert into sheet_edits(op) values ('fake'); perform t_ok(false, '1-6 sheet_edits 에 직접 insert 가 됐다');
  exception when others then perform t_ok(true, '1-6 sheet_edits 직접 insert 는 RLS 가 막는다'); end;
end $$;

reset role;
do $$ declare f text; bad text := ''; begin
  foreach f in array array['public._edit_allow(text)','public._edit_key(text)','public._edit_gid(text)','public._edit_hash(jsonb)',
    'public._edit_row(text,bigint,boolean)','public._edit_clean(text,jsonb)','public._edit_log(text,text,text,jsonb,jsonb,bigint)',
    'public._edit_cascade_edu(jsonb,jsonb,bigint)','public._edit_apply(text,bigint,jsonb,jsonb,text,bigint)',
    'public._edit_put(text,jsonb,bigint)'] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then bad := bad || f || ' '; end if;
  end loop;
  perform t_ok(bad = '', '1-7 내부 함수 열 개 전부 anon·authenticated 실행 불가 ' || bad);
  bad := '';
  foreach f in array array['public.edit_get(text,bigint)','public.edit_update(text,bigint,text,jsonb)','public.edit_insert(text,jsonb)',
    'public.edit_delete(text,bigint,text)','public.edit_restore(bigint)','public.edit_distinct(text,text,int)',
    'public.edit_cols(text)','public.edit_note(text,text,text,jsonb,jsonb)'] loop
    if not has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then bad := bad || f || ' '; end if;
  end loop;
  perform t_ok(bad = '', '1-8 화면용 함수 여덟 개는 authenticated 만 ' || bad);
end $$;
set role authenticated;

-- [2] 읽기 · 해시 충돌 · 수정 · 이력 · 캐시 도장
do $$ declare r jsonb; u jsonb; h text; n0 int; e record; s0 timestamptz; s1 timestamptz;
begin perform t_as('boss@test.local');
  r := edit_get('sheet_wk', 0);
  perform t_ok((r->>'ok')::boolean and r->'row'->>'rs_code' = 'RS-T-0001', '2-1 edit_get 이 행을 준다');
  h := r->>'hash';
  u := edit_update('sheet_wk', 0, 'not-the-hash', '{"stage":"CM"}');
  perform t_ok(u->>'error' = 'conflict' and u->'row'->>'stage' = 'BM', '2-2 해시가 다르면 conflict + 지금 행');
  select count(*) into n0 from sheet_edits;
  select synced_at into s0 from sheet_sync_log where tbl = 'wk';
  u := edit_update('sheet_wk', 0, h, '{"stage":"CM","action":"  ","rs_code":"RS-T-0001"}');
  perform t_ok((u->>'ok')::boolean, '2-3 맞는 해시면 저장된다 (' || u::text || ')');
  perform t_ok(u->'row'->>'stage' = 'CM' and (u->'row'->'action') = 'null'::jsonb, '2-4 바뀐 칸 반영 · 빈칸은 null');
  select * into e from sheet_edits order by id desc limit 1;
  perform t_ok(e.op = 'update' and e.tbl = 'sheet_wk' and e.row_key = '0' and e.gid = '646668307'
               and e.edited_by = 'boss@test.local', '2-5 이력: 표·키·gid·누가');
  perform t_ok(e.before->>'stage' = 'BM' and e.after->>'stage' = 'CM' and e.before->>'rs_code' = 'RS-T-0001',
               '2-6 이력은 행 «전체» before/after');
  perform t_ok((select count(*) from sheet_edits) = n0 + 1, '2-7 같은 값(rs_code)은 바꾼 칸으로 안 센다 — 이력 한 줄');
  select synced_at into s1 from sheet_sync_log where tbl = 'wk';
  perform t_ok(s1 > s0 and (select ms from sheet_sync_log where tbl='wk') = -1, '2-8 캐시 도장(synced_at)이 움직인다');
  perform t_ok(u->>'hash' = (edit_get('sheet_wk', 0))->>'hash', '2-9 돌려준 해시 = 지금 행의 해시');
  u := edit_update('sheet_wk', 0, u->>'hash', '{"stage":"CM"}');
  perform t_ok((u->>'same')::boolean and (select count(*) from sheet_edits) = n0 + 1, '2-10 바뀐 것이 없으면 이력도 없다');
  begin perform edit_update('sheet_wk', 0, u->>'hash', '{"src_row":9}'); perform t_ok(false, '2-11 키 열을 바꿨다');
  exception when others then perform t_ok(sqlerrm like 'locked_column%', '2-11 키 열은 못 바꾼다'); end;
  begin perform edit_update('sheet_wk', 0, u->>'hash', '{"no_such":"1"}'); perform t_ok(false, '2-12 없는 열');
  exception when others then perform t_ok(sqlerrm like 'bad_column%', '2-12 없는 열은 거절'); end;
  begin perform edit_update('sheet_alarm', 0, 'x', '{}'); perform t_ok(false, '2-13 사전에 없는 표');
  exception when others then perform t_ok(sqlerrm like 'bad_table%', '2-13 사전에 없는 표는 거절'); end;
  u := edit_update('sheet_wk', 0, (edit_get('sheet_wk',0))->>'hash', '{"extra":{"CTC항목":"B","새 열":"x"}}');
  perform t_ok(u->'row'->'extra'->>'CTC항목' = 'B' and u->'row'->'extra'->>'새 열' = 'x', '2-14 extra(jsonb)도 고친다');
  perform t_ok((edit_get('sheet_wk', 99))->>'error' = 'not_found', '2-15 없는 키는 not_found');
end $$;

-- [3] 입력 — src_row = max+1 · 행수 도장 · 이력
do $$ declare r jsonb; k bigint;
begin perform t_as('boss@test.local');
  r := edit_insert('sheet_wk', '{"rs_code":"RS-T-0009","d_start":"2026-02-01","stage":"BM","action":""}');
  k := (r->>'key')::bigint;
  perform t_ok(k = 6, '3-1 새 행 번호는 max+1 (비연속 0·1·5 → 6) · got ' || k);
  perform t_ok((r->'row'->'action') = 'null'::jsonb and r->'row'->>'synced_at' is not null, '3-2 빈칸 null · synced_at 기본값');
  perform t_ok((select rows from sheet_sync_log where tbl='wk') = 4, '3-3 행수 도장이 4 로');
  perform t_ok((select op from sheet_edits order by id desc limit 1) = 'insert'
               and (select after->>'rs_code' from sheet_edits order by id desc limit 1) = 'RS-T-0009', '3-4 입력 이력');
  begin perform edit_insert('sheet_wk', '{"rs_code":"  "}'); perform t_ok(false, '3-5 빈 행이 들어갔다');
  exception when others then perform t_ok(sqlerrm = 'no_values', '3-5 전부 빈 행은 거절'); end;
  r := edit_insert('sheet_inst', '{"sn":"ZZT-0099","customer":"TESTCO"}');
  perform t_ok((r->>'key')::int = 2 and (select rows from sheet_sync_log where tbl='inst') = 3, '3-6 설치현황(synced_at 없는 표)도 된다');
end $$;

-- [4] 삭제 → 이력에 행 전체 → 되돌리기(같은 번호) → 두 번은 안 된다
do $$ declare r jsonb; lid bigint; d jsonb;
begin perform t_as('boss@test.local');
  r := edit_get('sheet_wk', 5);
  d := edit_delete('sheet_wk', 5, 'bad');
  perform t_ok(d->>'error' = 'conflict', '4-1 삭제도 해시가 다르면 막힌다');
  d := edit_delete('sheet_wk', 5, r->>'hash');
  lid := (d->>'log')::bigint;
  perform t_ok((d->>'ok')::boolean and not exists(select 1 from sheet_wk where src_row = 5), '4-2 지웠다');
  perform t_ok((select before->>'rs_code' from sheet_edits where id = lid) = 'RS-T-0003'
               and (select after from sheet_edits where id = lid) is null, '4-3 지운 행 «전체»가 이력에');
  perform t_ok((select rows from sheet_sync_log where tbl='wk') = 3, '4-4 행수 도장이 줄었다');
  d := edit_restore(lid);
  perform t_ok((d->>'ok')::boolean and (d->>'key')::int = 5
               and (select rs_code from sheet_wk where src_row = 5) = 'RS-T-0003', '4-5 되살리면 원래 번호(5)로');
  perform t_ok((select ref from sheet_edits order by id desc limit 1) = lid
               and (select op from sheet_edits order by id desc limit 1) = 'restore', '4-6 되돌리기 이력이 원본을 가리킨다');
  begin perform edit_restore(lid); perform t_ok(false, '4-7 같은 이력을 두 번 되돌렸다');
  exception when others then perform t_ok(sqlerrm = 'already_restored', '4-7 한 이력은 한 번만'); end;
end $$;

-- [5] 수정 되돌리기 — 그 뒤 같은 칸이 또 바뀌었으면 멈춘다
do $$ declare h text; u jsonb; l1 bigint; l2 bigint; d jsonb;
begin perform t_as('boss@test.local');
  h := (edit_get('sheet_wk', 1))->>'hash';
  u := edit_update('sheet_wk', 1, h, '{"stage":"BM","workers":"W1"}'); l1 := (u->>'log')::bigint;
  u := edit_update('sheet_wk', 1, u->>'hash', '{"stage":"CM"}'); l2 := (u->>'log')::bigint;
  d := edit_restore(l1);
  perform t_ok(d->>'error' = 'conflict' and (select stage from sheet_wk where src_row = 1) = 'CM',
               '5-1 뒤에 같은 칸을 또 바꿨으면 되돌리기가 멈춘다(남의 수정을 덮지 않는다)');
  d := edit_restore(l2);
  perform t_ok((d->>'ok')::boolean and (select stage from sheet_wk where src_row = 1) = 'BM', '5-2 마지막 수정은 되돌린다');
  d := edit_restore(l1);
  perform t_ok((d->>'ok')::boolean and (select stage from sheet_wk where src_row = 1) = 'TBM'
               and (select workers from sheet_wk where src_row = 1) is null, '5-3 그다음 앞 수정도 차례로 되돌린다');
end $$;

-- [6] 입력 되돌리기 = 그 행을 지운다(그 뒤 안 바뀌었을 때만)
do $$ declare r jsonb; d jsonb; li bigint;
begin perform t_as('boss@test.local');
  r := edit_insert('sheet_wk', '{"rs_code":"RS-T-0010"}'); li := (r->>'log')::bigint;
  perform edit_update('sheet_wk', (r->>'key')::bigint, r->>'hash', '{"stage":"BM"}');
  d := edit_restore(li);
  perform t_ok(d->>'error' = 'conflict', '6-1 넣은 뒤 고쳤으면 입력 되돌리기가 멈춘다');
  r := edit_insert('sheet_wk', '{"rs_code":"RS-T-0011"}'); li := (r->>'log')::bigint;
  d := edit_restore(li);
  perform t_ok((d->>'ok')::boolean and not exists(select 1 from sheet_wk where rs_code = 'RS-T-0011'), '6-2 안 바뀌었으면 지운다');
end $$;

-- [7] 인원 → 교육 연쇄 · identity 번호 보존
do $$ declare r jsonb; u jsonb; d jsonb; rid bigint; eid bigint;
begin perform t_as('boss@test.local');
  select id into rid from sheet_roster where "사원번호" = '9100001';
  select id into eid from sheet_edu where "사원번호" = 9100001;
  r := edit_get('sheet_roster', rid);
  u := edit_update('sheet_roster', rid, r->>'hash', '{"사원번호":"9100011","이름(영문)":"Tester Uno"}');
  perform t_ok((u->'cascade'->>'done')::boolean, '7-1 사번·이름이 바뀌면 교육 짝 행도 (' || coalesce(u->>'cascade','null') || ')');
  perform t_ok((select "사원번호" from sheet_edu where id = eid) = 9100011
               and (select "인원" from sheet_edu where id = eid) = 'Tester Uno', '7-2 교육 표가 같은 글자로');
  perform t_ok((select op from sheet_edits where tbl = 'sheet_edu' order by id desc limit 1) = 'cascade'
               and (select ref from sheet_edits where tbl = 'sheet_edu' order by id desc limit 1) = (u->>'log')::bigint,
               '7-3 연쇄도 이력에 남고 원인 이력을 가리킨다');
  d := edit_restore((u->>'log')::bigint);
  perform t_ok((select "사원번호" from sheet_roster where id = rid) = '9100001'
               and (select "사원번호" from sheet_edu where id = eid) = 9100001, '7-4 되돌리면 교육 짝 행도 같이 돌아온다');
  r := edit_get('sheet_roster', rid);
  d := edit_delete('sheet_roster', rid, r->>'hash');
  d := edit_restore((d->>'log')::bigint);
  perform t_ok((d->>'key')::bigint = rid and (select "이름(영문)" from sheet_roster where id = rid) = 'Tester One',
               '7-5 identity 표도 원래 id 로 되살린다');
  r := edit_insert('sheet_roster', '{"이름(영문)":"Tester Three","사원번호":"9100003"}');
  perform t_ok((r->>'key')::bigint > rid, '7-6 identity 표 새 행은 다음 번호');
  begin perform edit_update('sheet_edu', eid, (edit_get('sheet_edu', eid))->>'hash', '{"사원번호":"abc"}');
        perform t_ok(false, '7-7 bigint 열에 글자가 들어갔다');
  exception when others then perform t_ok(sqlerrm like '%bigint%', '7-7 타입이 안 맞으면 표가 거절한다'); end;
end $$;

-- [8] 보조 함수 · 요약 기록(edit_note) · hr 편집 되돌리기
do $$ declare d jsonb; c jsonb; n bigint; lid bigint; rid bigint;
begin perform t_as('boss@test.local');
  d := edit_distinct('sheet_wk', 'op', 5);
  perform t_ok(d->0->>0 = 'OPX Scrubber', '8-1 edit_distinct 는 많은 순');
  c := edit_cols('sheet_leave');
  perform t_ok(c->0->>0 = '사원번호' and c->0->>1 = 'bigint' and jsonb_array_length(c) = 12, '8-2 edit_cols 는 실제 열·타입·순서');
  begin perform edit_distinct('sheet_wk', 'nope'); perform t_ok(false, '8-3 없는 열');
  exception when others then perform t_ok(sqlerrm like 'bad_column%', '8-3 edit_distinct 없는 열 거절'); end;

  perform t_as('ed@test.local');           -- 업로드·hr 편집은 can_write 면 된다(editor)
  n := edit_note('sheet_wk', 'upload:add', '*', '{"rows":3}', '{"rows":9,"file":"t.xlsx"}');
  perform t_ok((select edited_by from sheet_edits where id = n) = 'ed@test.local'
               and (select op from sheet_edits where id = n) = 'upload:add', '8-4 edit_note: 누가는 토큰에서');
  begin perform edit_note('sheet_wk', 'update', '0', null, null); perform t_ok(false, '8-5 편집 이력 위조');
  exception when others then perform t_ok(sqlerrm like 'bad_op%', '8-5 edit_note 로 update/delete 이력은 못 만든다'); end;
  perform t_as('vw@test.local');
  begin perform edit_note('sheet_wk', 'upload:add', '*', null, null); perform t_ok(false, '8-6 viewer 기록');
  exception when others then perform t_ok(sqlerrm = 'read_only', '8-6 viewer 는 기록도 못 남긴다'); end;

  -- hr 에서 지운 인원(dbw:delete)을 관리자가 되살린다
  perform t_as('ed@test.local');
  select id into rid from sheet_roster where "사원번호" = '9100002';
  lid := edit_note('sheet_roster', 'dbw:delete', rid::text,
                   (select to_jsonb(r) from sheet_roster r where id = rid), null);
  delete from sheet_roster where id = rid;
  perform t_as('boss@test.local');
  d := edit_restore(lid);
  perform t_ok((d->>'ok')::boolean and (select "이름(영문)" from sheet_roster where id = rid) = 'Tester Two',
               '8-7 hr 편집(dbw:delete)도 이력에서 되살린다');
  begin perform edit_restore(n); perform t_ok(false, '8-8 업로드 요약을 되돌렸다');
  exception when others then perform t_ok(sqlerrm = 'not_restorable', '8-8 업로드 요약은 되돌리기 대상이 아니다'); end;
end $$;

reset role;
`;

let skipped = 0;
try {
  const init = run('initdb', ['-D', DATA, '-A', 'trust', '-U', 'postgres', '--no-sync']);
  if (init.status !== 0) throw new Error('initdb 실패: ' + (init.stderr || init.stdout));
  const st = run('pg_ctl', ['-D', DATA, '-o', `-p ${PORT} -k ${DIR} -c listen_addresses=`, '-l', path.join(DIR, 'log'), '-w', 'start']);
  if (st.status !== 0) throw new Error('pg_ctl start 실패: ' + (st.stderr || st.stdout) + (fs.existsSync(path.join(DIR,'log')) ? fs.readFileSync(path.join(DIR, 'log'), 'utf8') : ''));

  console.log('[0] 복제 스키마 + 저장소의 setup-16-edit.sql 적용');
  const p0 = psql(PRELUDE, 'prelude');
  ok(!/ERROR/.test(p0.stderr), '복제 스키마 실패:\n' + p0.stderr);
  const sqlText = fs.readFileSync(SQL_FILE, 'utf8');
  const p1 = psql(sqlText, 'setup16');
  ok(!/ERROR/.test(p1.stderr), 'setup-16-edit.sql 적용 실패:\n' + p1.stderr);
  const p1b = psql(sqlText, 'setup16b');          // «여러 번 Run 해도 안전하다» 를 그대로 시험
  ok(!/ERROR/.test(p1b.stderr), 'setup-16-edit.sql 두 번째 적용 실패:\n' + p1b.stderr);

  console.log('[1~8] 권한 · 수정 · 입력 · 삭제 · 되돌리기 · 연쇄 · 보조 함수');
  const p2 = psql(CHECKS, 'checks');
  const out = (p2.stderr || '') + (p2.stdout || '');
  const oks = out.match(/T_OK [^\n]*/g) || [];
  const bads = out.match(/ERROR:[^\n]*/g) || [];
  oks.forEach(() => pass++);
  bads.forEach(b => { fail++; console.log('  ❌ ' + b.replace(/^ERROR:\s*/, '')); });
  /* 검사가 «조용히 덜 돈» 것을 잡는다 — 블록 하나가 통째로 안 돌면 T_OK 개수가 모자란다 */
  const EXPECT = 56;
  ok(oks.length === EXPECT, 'T_OK 가 ' + oks.length + '개 — 기대 ' + EXPECT + '개 (검사가 덜 돌았거나 늘었다)');
} catch (e) {
  fail++; console.log('  ❌ ' + (e && e.message || e));
} finally {
  try { run('pg_ctl', ['-D', DATA, '-m', 'immediate', 'stop']); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
}

if (fail) console.log(`\n❌ t-editsql: ${pass} 통과 · ${fail} 실패`);
else console.log(`\n✅ t-editsql: ${pass} 통과 (PostgreSQL ${path.basename(path.dirname(BIN))})`);
process.exit(fail ? 1 : 0);
