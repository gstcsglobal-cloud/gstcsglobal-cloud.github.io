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
const LEDGER_FILE = path.join(ROOT, 'supabase/setup-10-alarm.sql');   // 원장 표·csv_window — «저장소의 그 파일»을 그대로 먹인다(v143)
const KR_FILE = path.join(ROOT, 'supabase/setup-17-kr-demo.sql');
const DQ_FILE = path.join(ROOT, 'supabase/setup-21-dq.sql');
const COLS_FILE = path.join(ROOT, 'supabase/setup-22-import-cols.sql');
const SITES_FILE = path.join(ROOT, 'supabase/setup-23-sites.sql');
const ACT_FILE = path.join(ROOT, 'supabase/setup-24-actions.sql');   // 처리함(v166)   // 사이트 등록부 · 사이트별 CIP 표(v160)
    // CIP 새 점검 항목 열 더하기(v157)           // 데이터 품질 점검(v155·v156) — 읽기 전용 · 맨 끝에 먹인다      // 국내 데모 표·kr 등급(v146) — 1~11 이 끝난 뒤에 먹인다

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
  role text not null default 'viewer', constraint allowed_users_role_chk check (role in ('viewer','editor','admin')));
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

/* 원장 씨앗 — 지어낸 값(실데이터 아님). 운영과 같이 authenticated 에 표 권한(Supabase 는 기본으로 준다). */
const LEDGER_SEED = String.raw`
grant select, insert, update, delete on public.sheet_alarm, public.sheet_allbypass to anon, authenticated;
insert into public.sheet_alarm(src_row, src_sheet, op, site, sn, sn_key, occur, occur_date, inout, cnt, src_month, fmonth, fweek, imported_at) values
  (0, 'P', 'P운영', 'P1', 'ZZA-0001', 'ZZA0001', '2026-03-02 10:00:00', '2026-03-02', '내적', true,  '26년 3월', '2026-03', '2026-W10', '2026-09-01T00:00:00Z'),
  (1, 'P', 'P운영', 'P1', 'ZZA-0002', 'ZZA0002', '2026-03-05 11:00:00', '2026-03-05', '외적', false, '26년 3월', '2026-03', '2026-W10', '2026-09-01T00:00:00Z'),
  (2, 'K', 'K운영', 'K1', 'ZZA-0003', 'ZZA0003', '2026-04-01 09:00:00', '2026-04-01', '내부', true,  null,       '2026-04', '2026-W14', '2026-09-01T00:00:00Z');
insert into public.sheet_allbypass(src_row, src_sheet, op, sn, sn_key, occur, occur_date, inout, seq, grp, cnt, imported_at) values
  (0, 'H',  'H운영',               'ZZB-0001',  'ZZB0001',  '2026-03-02',       '2026-03-02', '내적',     '1', null, true,  '2026-09-01T00:00:00Z'),
  (1, 'OS', 'GST TAIWAN SCRUBBER', 'ZZC-0001L', 'ZZC0001L', '2026-03-03 08:00', '2026-03-03', 'GST',      '1', '7',  true,  '2026-09-01T00:00:00Z'),
  (2, 'OS', 'GST TAIWAN SCRUBBER', 'ZZC-0001R', 'ZZC0001R', '2026-03-03 08:00', '2026-03-03', 'External', '2', '7',  false, '2026-09-01T00:00:00Z'),
  (3, 'H',  null,                  'ZZB-0002',  'ZZB0002',  '2026-03-31',       '2026-03-31', '내적',     '1', null, true,  '2026-09-01T00:00:00Z'),
  (4, 'H',  'H운영',               'ZZB-0003',  'ZZB0003',  null,               null,         '내적',     '1', null, true,  '2026-09-01T00:00:00Z');
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
  begin perform edit_update('sheet_abp', 0, 'x', '{}'); perform t_ok(false, '2-13 사전에 없는 표');
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
  perform t_ok((r->>'key')::int = 2 and (select rows from sheet_sync_log where tbl='inst') = 3, '3-6 설치현황도 된다 (운영 DB 처럼 synced_at 이 빠진 채 만든 표 — setup-16 이 되살린다)');
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

-- [9] 엑셀 일괄 수정 (v141) — edit_get_many · edit_bulk
do $$ declare g jsonb; h0 text; h1 text; b jsonb; n0 int; s0 timestamptz; bid bigint; rid bigint; eid bigint; k bigint;
begin perform t_as('boss@test.local');
  g := edit_get_many('sheet_wk', array[0,1,999]::bigint[]);
  perform t_ok(jsonb_array_length(g) = 2 and (g->0->>'key')::int = 0 and (g->1->>'key')::int = 1, '9-1 edit_get_many 는 있는 행만 · 키 순서');
  perform t_ok(g->0->>'hash' = (edit_get('sheet_wk', 0))->>'hash' and g->0->'row'->>'rs_code' = 'RS-T-0001', '9-2 묶음으로 받은 해시 = 한 행으로 받은 해시');
  h0 := g->0->>'hash'; h1 := g->1->>'hash';
  select count(*) into n0 from sheet_edits;
  select synced_at into s0 from sheet_sync_log where tbl = 'wk';
  /* 하나라도 해시가 어긋나면 «아무것도» 안 쓴다 — 맞는 줄(0)도 · 새 행도 · 이력도 */
  b := edit_bulk('sheet_wk', jsonb_build_array(
         jsonb_build_object('op','update','key',0,'hash',h0,'changes',jsonb_build_object('workers','BULK-A')),
         jsonb_build_object('op','update','key',1,'hash','stale','changes',jsonb_build_object('workers','BULK-B')),
         jsonb_build_object('op','insert','row',jsonb_build_object('rs_code','RS-T-0200','d_start','2026-05-01'))), '{"file":"t.xlsx"}');
  perform t_ok(b->>'error' = 'conflict' and b->'rows'->0->>'key' = '1' and b->'rows'->0->>'error' = 'conflict'
               and jsonb_array_length(b->'rows') = 1, '9-3 해시가 어긋난 줄만 골라 알려 준다');
  perform t_ok((select workers from sheet_wk where src_row = 0) is distinct from 'BULK-A'
               and not exists(select 1 from sheet_wk where rs_code = 'RS-T-0200')
               and (select count(*) from sheet_edits) = n0, '9-4 전부 아니면 전무 — 맞는 줄도 안 썼고 이력도 없다');
  b := edit_bulk('sheet_wk', jsonb_build_array(
         jsonb_build_object('op','update','key',0,'hash',h0,'changes',jsonb_build_object('workers','BULK-A')),
         jsonb_build_object('op','update','key',1,'hash',h1,'changes',jsonb_build_object('workers',(select workers from sheet_wk where src_row = 1))),
         jsonb_build_object('op','insert','row',jsonb_build_object('rs_code','RS-T-0200','d_start','2026-05-01','action',''))), '{"file":"t.xlsx","part":1}');
  bid := (b->>'log')::bigint;
  perform t_ok((b->>'ok')::boolean and (b->>'updated')::int = 1 and (b->>'inserted')::int = 1 and (b->>'same')::int = 1,
               '9-5 수정 1 · 입력 1 · 변경 없음 1 (' || b::text || ')');
  perform t_ok((select op from sheet_edits where id = bid) = 'bulk' and (select after->>'file' from sheet_edits where id = bid) = 't.xlsx'
               and (select (after->>'updated')::int from sheet_edits where id = bid) = 1
               and (select edited_by from sheet_edits where id = bid) = 'boss@test.local', '9-6 묶음 머리 이력(bulk) — 파일·결과 수·누가');
  perform t_ok((select count(*) from sheet_edits where ref = bid) = 2
               and (select op from sheet_edits where ref = bid and row_key = '0') = 'update'
               and (select after->>'workers' from sheet_edits where ref = bid and row_key = '0') = 'BULK-A'
               and (select before->>'rs_code' from sheet_edits where ref = bid and row_key = '0') = 'RS-T-0001',
               '9-7 줄마다 이력 한 줄(행 전체) — ref 가 머리를 가리킨다 · 변경 없는 줄은 이력 없음');
  perform t_ok((select count(*) from sheet_edits) = n0 + 3, '9-8 이력은 머리 1 + 줄 2 = 3줄');
  perform t_ok((select synced_at from sheet_sync_log where tbl = 'wk') > s0, '9-9 캐시 도장이 움직인다(묶음 끝에 한 번)');
  k := (select row_key::bigint from sheet_edits where ref = bid and op = 'insert');
  perform t_ok((select action from sheet_wk where src_row = k) is null and (select rs_code from sheet_wk where src_row = k) = 'RS-T-0200',
               '9-10 새 줄은 max+1 번호 · 빈칸은 null');
  /* ⚠ 되돌리기와 «행 읽기»를 한 식에 넣지 말 것 — 서브쿼리가 함수 호출보다 먼저 평가돼(InitPlan) 되돌리기 «전» 값을 본다 */
  b := edit_restore((select id from sheet_edits where ref = bid and row_key = '0'));
  perform t_ok((b->>'ok')::boolean and (select workers from sheet_wk where src_row = 0) is null, '9-11 일괄 수정의 줄 이력도 하나씩 되돌린다');
  begin perform edit_restore(bid); perform t_ok(false, '9-12 머리 줄을 되돌렸다');
  exception when others then perform t_ok(sqlerrm = 'not_restorable', '9-12 묶음 머리 줄 자체는 되돌리기 대상이 아니다'); end;
  b := edit_bulk('sheet_wk', jsonb_build_array(
         jsonb_build_object('op','update','key',5,'hash',(edit_get('sheet_wk',5))->>'hash','changes','{"workers":"X"}'::jsonb),
         jsonb_build_object('op','update','key',5,'hash',(edit_get('sheet_wk',5))->>'hash','changes','{"workers":"Y"}'::jsonb)));
  perform t_ok(b->>'error' = 'conflict' and b->'rows'->0->>'error' = 'dup' and (select workers from sheet_wk where src_row = 5) is null,
               '9-13 같은 행을 한 묶음에서 두 번 고치려 하면 막는다');
  begin perform edit_bulk('sheet_wk', (select jsonb_agg(jsonb_build_object('op','insert','row',jsonb_build_object('rs_code','Z'||i))) from generate_series(1,501) i));
        perform t_ok(false, '9-14 501 줄이 들어갔다');
  exception when others then perform t_ok(sqlerrm like 'too_many%', '9-14 한 번에 500 줄까지 (묶음 = 전부 아니면 전무의 단위 · 운영 실측 500줄 5.4초)'); end;
  begin perform edit_bulk('sheet_wk', '[]'::jsonb); perform t_ok(false, '9-15 빈 묶음');
  exception when others then perform t_ok(sqlerrm = 'no_values', '9-15 빈 묶음은 거절'); end;
  perform t_as('ed@test.local');
  begin perform edit_bulk('sheet_wk', '[{"op":"insert","row":{"rs_code":"E"}}]'); perform t_ok(false, '9-16 editor 가 일괄 수정');
  exception when others then perform t_ok(sqlerrm = 'forbidden', '9-16 editor → forbidden'); end;
  begin perform edit_get_many('sheet_wk', array[0]::bigint[]); perform t_ok(false, '9-17 editor 가 묶음 읽기');
  exception when others then perform t_ok(sqlerrm = 'forbidden', '9-17 묶음 읽기도 관리자만'); end;
  perform t_as('boss@test.local');
  select id into rid from sheet_roster where "사원번호" = '9100001';
  select id into eid from sheet_edu where "사원번호" = 9100001;
  b := edit_bulk('sheet_roster', jsonb_build_array(jsonb_build_object('op','update','key',rid,'hash',(edit_get('sheet_roster',rid))->>'hash',
         'changes', jsonb_build_object('사원번호','9100021'))));
  perform t_ok((b->>'updated')::int = 1 and (select "사원번호" from sheet_edu where id = eid) = 9100021, '9-18 인원 일괄 수정도 교육 짝 행을 따라 고친다');
  perform t_ok((select ref from sheet_edits where tbl = 'sheet_edu' and op = 'cascade' order by id desc limit 1)
               = (select id from sheet_edits where ref = (b->>'log')::bigint), '9-19 연쇄 이력은 그 줄의 이력을 가리킨다');
end $$;

reset role;
do $$ declare f text; bad text := ''; begin
  foreach f in array array['public.edit_get_many(text,bigint[])','public.edit_bulk(text,jsonb,jsonb)'] loop
    if not has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then bad := bad || f || ' '; end if;
  end loop;
  perform t_ok(bad = '', '9-20 일괄 함수 둘은 authenticated 만 ' || bad);
end $$;
set role authenticated;

-- [10] 원장(알람·올바) — v143: 표 사전 · 고치면 imported_at 이 오른다(캐시 열쇠) · 이력에는 그 칸을 안 남긴다 · 되돌리기
do $$ declare r jsonb; u jsonb; h text; i0 timestamptz; e1 bigint; e2 bigint; d jsonb;
begin perform t_as('boss@test.local');
  r := edit_get('sheet_alarm', 1);
  perform t_ok((r->>'ok')::boolean and r->'row'->>'inout' = '외적', '10-1 원장도 표 사전에 있다 (edit_get)');
  i0 := (r->'row'->>'imported_at')::timestamptz;
  u := edit_update('sheet_alarm', 1, r->>'hash', '{"inout":"내적","cnt":true}');
  e1 := (u->>'log')::bigint;
  perform t_ok((u->>'ok')::boolean and (u->'row'->>'cnt')::boolean, '10-2 원장 행을 고친다 (계산 칸 cnt 는 화면이 보낸 값 그대로)');
  perform t_ok((u->'row'->>'imported_at')::timestamptz > i0, '10-3 고치면 imported_at 이 오른다 — 대시보드 캐시 열쇠(행수+마지막 적재 시각)가 바뀐다');
  perform t_ok(u->>'hash' = (edit_get('sheet_alarm', 1))->>'hash', '10-4 돌려준 해시 = 지금 행의 해시 (시각을 올린 «뒤»의 행)');
  perform t_ok(not ((select before from sheet_edits where id = e1) ? 'imported_at') and not ((select after from sheet_edits where id = e1) ? 'imported_at'),
               '10-5 이력의 before/after 에는 imported_at 이 없다');
  -- 다른 칸만 또 고친 뒤 첫 수정을 되돌린다 — 시각 칸 때문에 «충돌»로 멈추면 안 된다
  u := edit_update('sheet_alarm', 1, u->>'hash', '{"cause":"원인 메모"}'); e2 := (u->>'log')::bigint;
  d := edit_restore(e1);
  perform t_ok((d->>'ok')::boolean and (select inout from sheet_alarm where src_row = 1) = '외적'
               and (select cause from sheet_alarm where src_row = 1) = '원인 메모', '10-6 다른 칸만 바뀌었으면 되돌리기가 된다 (시각 칸은 비교하지 않는다) ' || coalesce(d::text,''));
  -- 같은 칸을 또 바꿨으면 여전히 멈춘다
  u := edit_update('sheet_alarm', 0, (edit_get('sheet_alarm',0))->>'hash', '{"inout":"외적"}'); e1 := (u->>'log')::bigint;
  u := edit_update('sheet_alarm', 0, u->>'hash', '{"inout":"제외"}');
  d := edit_restore(e1);
  perform t_ok(d->>'error' = 'conflict', '10-7 같은 칸이 또 바뀌었으면 되돌리기는 멈춘다');
  r := edit_insert('sheet_alarm', '{"op":"P운영","src_sheet":"P","sn":"ZZA-0009","sn_key":"ZZA0009","occur":"2026-03-20 08:00","occur_date":"2026-03-20","cnt":true}');
  perform t_ok((r->>'key')::int = 3 and (r->'row'->>'imported_at') is not null, '10-8 원장 입력 — src_row = max+1 · imported_at 기본값');
  u := edit_bulk('sheet_allbypass', jsonb_build_array(jsonb_build_object('op','update','key',0,'hash',(edit_get('sheet_allbypass',0))->>'hash',
         'changes', jsonb_build_object('sn','ZZB-0011','sn_key','ZZB0011'))));
  perform t_ok((u->>'updated')::int = 1 and (select (imported_at > '2026-09-01T00:00:00Z'::timestamptz) from sheet_allbypass where src_row = 0),
               '10-9 엑셀 일괄로 고쳐도 imported_at 이 오른다');
end $$;

-- [10b] edit_overwrites — 업로드가 «데이터 관리에서 고친 행»을 덮는가
do $$ declare o jsonb; w record; n_ov int; n_cw int; bad text := ''; k int;
begin perform t_as('boss@test.local');
  o := edit_overwrites('sheet_alarm', '2026-03-01', '2026-03-31', array['P운영']);
  perform t_ok((o->>'n')::int = 3 and o->'keys' = '[0,1,3]'::jsonb and o->'who' = '["boss@test.local"]'::jsonb,
               '10-10 구간(3월 × P운영) 안에서 고친·넣은 행 — 0·1·3 (4월 K운영 행은 밖) ' || o::text);
  perform t_ok((o->>'last') is not null, '10-11 마지막 수정 시각을 준다');
  perform t_ok((edit_overwrites('sheet_alarm', '2026-03-01', '2026-03-31', array['K운영'])->>'n')::int = 0, '10-12 다른 운영단위는 안 센다');
  -- csv_window 와 «같은 식»인가 — 모든 행을 한 번씩 고친 뒤(그러면 고친 행 = 구간 안 행), 여러 구간에서 두 함수의 수를 견준다
  for k in 0..4 loop perform edit_update('sheet_allbypass', k, (edit_get('sheet_allbypass', k))->>'hash', jsonb_build_object('real', 'T' || k)); end loop;
  for w in select * from (values ('2026-03-01','2026-03-31', array['H운영','GST TAIWAN SCRUBBER']),
                                 ('2026-03-03','2026-03-03', array['GST TAIWAN SCRUBBER']),
                                 ('2026-03-02','2026-03-31', array['', 'H운영']),
                                 ('2026-01-01','2026-12-31', array['']),
                                 ('2026-04-01','2026-04-30', array['H운영'])) v(f, t, ops) loop
    n_ov := (edit_overwrites('sheet_allbypass', w.f, w.t, w.ops)->>'n')::int;
    n_cw := (csv_window('sheet_allbypass', w.f, w.t, w.ops, true)->>'hit')::int;
    if n_ov is distinct from n_cw then bad := bad || w.f || '~' || w.t || ' ' || array_to_string(w.ops, '|') || ': ' || n_ov || '≠' || n_cw || '  '; end if;
  end loop;
  perform t_ok(bad = '', '10-13 구간 판정이 csv_window(dry) 와 같다 — 시각이 붙은 날짜 · 빈 op · 빈 날짜 포함 ' || bad);
  perform t_ok((edit_overwrites('sheet_allbypass')->>'n')::int = 5, '10-14 통째 교체(구간 없음)는 표 전체에서 센다');
  -- 업로드가 같은 번호를 «새로» 넣으면(적재 시각이 이력보다 늦다) 옛 이력은 그 행의 것이 아니다
  delete from sheet_allbypass where src_row = 4;
  insert into sheet_allbypass(src_row, src_sheet, op, sn, imported_at) values (4, 'H', 'H운영', 'ZZB-0003', now() + interval '1 minute');
  perform t_ok((edit_overwrites('sheet_allbypass')->>'n')::int = 4, '10-15 다시 올라온 행(같은 번호)은 옛 이력으로 세지 않는다');
  perform t_ok((edit_overwrites('sheet_roster')->>'n')::int >= 1, '10-16 Import 표(적재 시각 열 없음)도 센다 — id 는 다시 쓰이지 않는다');
  perform t_ok((edit_overwrites('sheet_wk', '2026-01-01', '2026-12-31', array['OPX Scrubber'])->>'n')::int >= 1, '10-17 미러(synced_at)도 센다');
  begin perform edit_overwrites('sheet_abp'); perform t_ok(false, '10-18 사전에 없는 표');
  exception when others then perform t_ok(sqlerrm like 'bad_table%', '10-18 사전에 없는 표는 거절'); end;
  begin perform edit_overwrites('sheet_alarm', '2026-04-01', '2026-03-01', array['P운영']); perform t_ok(false, '10-19 거꾸로 된 구간');
  exception when others then perform t_ok(sqlerrm = 'bad_range', '10-19 거꾸로 된 구간은 거절'); end;
  perform t_as('ed@test.local');
  perform t_ok((edit_overwrites('sheet_alarm')->>'n')::int >= 3, '10-20 업로드 권한(can_write)이면 편집자도 본다 — 업로드 화면이 부른다');
  perform t_as('vw@test.local');
  begin perform edit_overwrites('sheet_alarm'); perform t_ok(false, '10-21 조회자가 불렀다');
  exception when others then perform t_ok(sqlerrm = 'read_only', '10-21 쓰기 권한이 없으면 read_only'); end;
end $$;

reset role;
do $$ begin
  perform t_ok(has_function_privilege('authenticated', 'public.edit_overwrites(text,text,text,text[])', 'EXECUTE')
               and not has_function_privilege('anon', 'public.edit_overwrites(text,text,text,text[])', 'EXECUTE'), '10-22 edit_overwrites 는 authenticated 만');
  perform t_ok(exists (select 1 from information_schema.columns
                        where table_schema = 'public' and table_name = 'sheet_inst' and column_name = 'synced_at'),
               '10-23 setup-16 이 sheet_inst 의 synced_at 을 되살린다 (운영 DB 에 빠져 있던 칸 · setup-4 그대로)');
end $$;

-- [10c] 설치현황 — 통째 교체로 번호가 다시 매겨지면 옛 수정은 «덮인다»로 세지 않는다 (synced_at 이 있어야 가린다)
set role authenticated;
do $$ declare o jsonb;
begin perform t_as('boss@test.local');
  perform edit_update('sheet_inst', 0, (edit_get('sheet_inst', 0))->>'hash', '{"bay":"BAY-T9"}');
  o := edit_overwrites('sheet_inst');
  perform t_ok(o->'keys' @> '[0,2]'::jsonb, '10-24 설치현황 — 고친 행(0)·넣은 행(2)을 센다 ' || o::text);
end $$;
reset role;
truncate public.sheet_inst;                 -- 통째 교체 흉내: 비우고 «같은 번호»로 다시 넣는다(적재 시각 = 지금 · 이력보다 늦다)
insert into public.sheet_inst(src_row, sn, customer) select g, 'ZZT-01' || g, 'TESTCO' from generate_series(0, 3) g;
set role authenticated;
do $$ begin perform t_as('boss@test.local');
  perform t_ok((edit_overwrites('sheet_inst')->>'n')::int = 0, '10-25 다시 올라온 설치현황 — 옛 수정의 번호가 «다른 행»에 붙지 않는다');
end $$;

-- [10d] 원장에 넣고 → 고치고 → 그 수정을 되돌린 뒤 «넣은 것»도 되돌린다. 단계마다 트랜잭션을 나눈다 —
--       한 트랜잭션 안에서는 now() 가 같아 imported_at 이 안 갈려, 해시가 그 칸을 보더라도 검사가 못 잡는다.
do $$ declare r jsonb; u jsonb;
begin perform t_as('boss@test.local');
  r := edit_insert('sheet_alarm', '{"op":"P운영","src_sheet":"P","sn":"ZZA-0077","occur":"2026-03-21 09:00"}');
  u := edit_update('sheet_alarm', (r->>'key')::bigint, r->>'hash', '{"cause":"메모"}');
  perform set_config('t.k', r->>'key', false); perform set_config('t.li', r->>'log', false); perform set_config('t.lu', u->>'log', false);
end $$;
do $$ begin perform t_as('boss@test.local');
  perform t_ok((edit_restore(current_setting('t.lu')::bigint)->>'ok')::boolean, '10-26 원장 수정을 되돌린다 (imported_at 은 또 오른다)');
end $$;
do $$ declare d jsonb;
begin perform t_as('boss@test.local');
  d := edit_restore(current_setting('t.li')::bigint);
  perform t_ok((d->>'ok')::boolean and not exists (select 1 from sheet_alarm where src_row = current_setting('t.k')::int),
               '10-27 고쳤다 되돌린 원장 행도 «넣은 것»을 되돌릴 수 있다 — 해시가 적재 시각(imported_at)을 안 본다 ' || coalesce(d::text, ''));
end $$;
reset role;

-- [11] edit_last_wk (v145) — 같은 S/N 의 직전 수선실적. S/N 은 영숫자만 대문자로 맞춘다(화면 N() 과 같은 규칙) · 관리자만.
--      지어낸 S/N 다섯 줄 — 표기가 셋으로 갈린 한 설비(ZZL-0001·zzl0001·ZZL 0001)와 작업시작일이 같은 두 줄.
insert into public.sheet_wk(src_row, op, rs_code, stage, d_start, sn_in, model, pg, extra) values
  (9001, 'OPX Scrubber', 'RS-L-1', 'BM',  '2026-05-01 10:00:00', 'ZZL-0001', 'MDL-OLD',   '스크러버', '{"x":1}'),
  (9002, 'OPX Scrubber', 'RS-L-2', 'TBM', '2026-06-01 09:00:00', 'zzl0001',  'MDL-NEW',   '스크러버', null),
  (9003, 'OPX Scrubber', 'RS-L-3', 'CM',  '2026-04-01',          'ZZL 0001', 'MDL-OLDER', '스크러버', null),
  (9004, 'OPY Scrubber', 'RS-L-4', 'BM',  '2026-06-02 08:00:00', 'ZZL-0002', 'MDL-A',     '칠러',     null),
  (9005, 'OPY Scrubber', 'RS-L-5', 'BM',  '2026-06-02 08:00:00', 'ZZL-0002', 'MDL-B',     '칠러',     null);
set role authenticated;
do $$ declare r jsonb;
begin perform t_as('boss@test.local');
  r := edit_last_wk(array['zzl-0001', ' ZZL 0002 ', 'ZZL-9999', '', null]);
  perform t_ok(r ? 'ZZL0001' and r ? 'ZZL0002' and not (r ? 'ZZL9999') and not (r ? ''),
               '11-1 S/N 을 영숫자·대문자로 맞춰 찾는다 · 없는 S/N·빈칸은 키가 없다 ' || coalesce((select string_agg(k, ',') from jsonb_object_keys(r) k), ''));
  perform t_ok(r->'ZZL0001'->0->>'rs_code' = 'RS-L-2' and r->'ZZL0001'->1->>'rs_code' = 'RS-L-1' and jsonb_array_length(r->'ZZL0001') = 2,
               '11-2 표기가 갈려도 한 설비 — 작업시작일이 늦은 순으로 두 행까지(세 행 중) ' || coalesce((r->'ZZL0001')::text, ''));
  perform t_ok(r->'ZZL0002'->0->>'rs_code' = 'RS-L-5' and r->'ZZL0002'->1->>'rs_code' = 'RS-L-4',
               '11-3 작업시작일이 같으면 나중에 올린 행(src_row 큰 것)이 앞 ' || coalesce((r->'ZZL0002')::text, ''));
  perform t_ok(not (r->'ZZL0001'->0 ? 'extra') and not (r->'ZZL0001'->0 ? 'synced_at') and r->'ZZL0001'->0 ? 'model' and r->'ZZL0001'->0 ? 'src_row',
               '11-4 행 전체에서 extra·synced_at 만 뺀다');
  begin perform edit_last_wk(array_fill('x'::text, array[2001])); perform t_ok(false, '11-5 2,001 개가 통과했다');
  exception when others then perform t_ok(sqlerrm like 'too_many%', '11-5 한 번에 2,000 개까지 (' || sqlerrm || ')'); end;
end $$;
do $$ begin perform t_as('ed@test.local');
  begin perform edit_last_wk(array['ZZL-0001']); perform t_ok(false, '11-6 editor 가 edit_last_wk 를 불렀다');
  exception when others then perform t_ok(sqlerrm = 'forbidden', '11-6 editor → forbidden (' || sqlerrm || ')'); end;
end $$;
reset role;
do $$ begin
  perform t_ok(not has_function_privilege('anon', 'public.edit_last_wk(text[])', 'execute')
           and has_function_privilege('authenticated', 'public.edit_last_wk(text[])', 'execute'),
               '11-7 실행 권한 — anon 은 못 부르고 authenticated 만');
end $$;
`;

/* ---------- [12] 국내 데모(v146) — setup-17 을 먹이기 «전에» 운영 표에 국내 행을 지어 넣는다 ----------
   (1~11 의 번호 계산을 흔들지 않게 그 검사가 끝난 뒤에 넣는다 · 운영단위 이름은 CLAUDE.md 에 이미 있는 공개 표기 · 나머지는 지어낸 값) */
const KR_SEED = String.raw`
insert into public.sheet_wk(src_row, op, rs_code, stage, d_start, sn_in, model, extra) values
  (7001, 'SEC Scrubber',        'RS-K-1', 'BM',  '2026-05-01', 'ZZK-0001', 'MDL-K1', '{"x":1}'),
  (7002, 'SDC Scrubber',        'RS-K-2', 'TBM', '2026-05-02', 'ZZK-0002', 'MDL-K2', null),
  (7003, 'GST TAIWAN SCRUBBER', 'RS-W-1', 'BM',  '2026-05-03', 'ZZW-0001', 'MDL-W1', null),
  (7004, null,                  'RS-N-1', 'BM',  '2026-05-04', 'ZZN-0001', 'MDL-N1', null);
insert into public.sheet_inst(src_row, country, customer, location, code, sn, model, fab, state) values
  (7001, 'SEC Scrubber',        'KCO', 'K9', 'ZK-101', 'ZZK-0001', 'MDL-K1', 'K9-L1', 'Operation'),
  (7002, '국내 기타 CHILLER',    'KCO', 'K8', 'ZK-102', 'ZZK-0003', 'MDL-K3', 'K8-L1', 'Operation'),
  (7003, 'GST TAIWAN SCRUBBER', 'TCO', 'TX', 'ZT-201', 'ZZW-0001', 'MDL-W1', 'F99',   'Operation');
`;
const KR_CHECKS = String.raw`
reset role;
-- [12] 국내 데모 표 · kr 등급 (v146)
do $$ declare t text; bad text := ''; begin
  foreach t in array array['wk','inst','roster','edu','leave','alarm','allbypass'] loop
    if (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='sheet_'||t)
       is distinct from
       (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='kr_sheet_'||t)
    then bad := bad || t || ' '; end if;
  end loop;
  perform t_ok(bad = '', '12-1 데모 표 일곱 — 운영 표와 열·순서가 같다 ' || bad);
  perform t_ok(exists (select 1 from pg_indexes where tablename = 'kr_sheet_wk' and indexdef like '%regexp_replace%'),
               '12-2 데모 수선실적도 S/N 식 인덱스를 받았다(like … including all)');
  perform t_ok((select string_agg(op, ',' order by src_row) from kr_sheet_wk) = 'SEC Scrubber,SDC Scrubber',
               '12-3 데모 수선실적 = 국내 운영단위 행만 (해외·빈 운영단위는 안 온다) ' || coalesce((select string_agg(coalesce(op,'∅'), ',' order by src_row) from kr_sheet_wk), ''));
  perform t_ok((select string_agg(country, ',' order by src_row) from kr_sheet_inst) = 'SEC Scrubber,국내 기타 CHILLER',
               '12-4 데모 설치현황 = 국내 Country 행만');
  perform t_ok((select count(*) from kr_sheet_alarm) = (select count(*) from sheet_alarm where op in ('K운영','P운영','H운영'))
           and (select count(*) from kr_sheet_allbypass) = 2 and not exists (select 1 from kr_sheet_allbypass where op is distinct from 'H운영'),
               '12-5 원장 = K·P·H운영 행만 (해외 올바·운영단위 빈 행은 안 온다)');
  perform t_ok((select count(*) from kr_sheet_roster) = (select count(*) from sheet_roster)
           and (select count(*) from kr_sheet_edu) = (select count(*) from sheet_edu)
           and (select min(id) from kr_sheet_roster) = 1,
               '12-6 인원·교육 = 통째로 · id 는 데모 표의 새 번호(1 부터)');
  perform t_ok((select rows from sheet_sync_log where tbl = 'kr_wk') = 2 and (select rows from sheet_sync_log where tbl = 'kr_inst') = 2
           and (select ms from sheet_sync_log where tbl = 'kr_wk') = -1,
               '12-7 데모 미러의 적재 기록(kr_wk · kr_inst) — 행수와 같다');
end $$;
insert into public.allowed_users values ('kr@test.local', false, 'kr');
do $$ begin
  begin insert into public.allowed_users values ('kr2@test.local', true, 'kr'); perform t_ok(false, '12-8 can_write 를 켠 kr 이 들어갔다');
  exception when others then perform t_ok(sqlerrm like '%allowed_users_kr_ro_chk%', '12-8 kr 은 can_write 를 켤 수 없다 (' || sqlerrm || ')'); end;
end $$;
set role authenticated;
-- kr — 운영 표에는 아무것도 못 쓴다(서버에서)
do $$ declare r jsonb; begin perform t_as('kr@test.local');
  begin insert into sheet_wk(src_row, op) values (8001, 'SEC Scrubber'); perform t_ok(false, '12-9 kr 이 운영 수선실적에 insert');
  exception when others then perform t_ok(true, '12-9 운영 표 직접 쓰기 — RLS 가 막는다'); end;
  begin perform csv_upload_begin('sheet_inst'); perform t_ok(false, '12-10 kr 이 운영 설치현황을 비웠다');
  exception when others then perform t_ok(sqlerrm = 'read_only', '12-10 운영 표 비우기 → read_only (' || sqlerrm || ')'); end;
  begin perform csv_window('sheet_wk', '2026-01-01', '2026-12-31', array['SEC Scrubber'], false); perform t_ok(false, '12-11 kr 이 운영 수선실적 구간을 지웠다');
  exception when others then perform t_ok(sqlerrm = 'read_only', '12-11 운영 표 구간 교체 → read_only'); end;
  begin perform edit_update('sheet_wk', 0, 'x', '{"stage":"CM"}'); perform t_ok(false, '12-12 kr 이 운영 행을 고쳤다');
  exception when others then perform t_ok(sqlerrm like 'bad_table%', '12-12 데이터 관리로 운영 표 → bad_table (' || sqlerrm || ')'); end;
  begin perform edit_restore((select min(id) from sheet_edits where tbl = 'sheet_wk' and op = 'update')); perform t_ok(false, '12-13 kr 이 운영 이력을 되돌렸다');
  exception when others then perform t_ok(sqlerrm = 'not_restorable', '12-13 운영 이력 되돌리기 → not_restorable (' || sqlerrm || ')'); end;
  begin perform edit_note('sheet_wk', 'upload:full', '*', null, '{}'::jsonb); perform t_ok(false, '12-14 kr 이 운영 표 이름으로 이력을 남겼다');
  exception when others then perform t_ok(sqlerrm = 'read_only', '12-14 운영 표 업로드 요약 → read_only'); end;
  begin perform edit_last_wk(array['ZZK-0001'], 'sheet_wk'); perform t_ok(false, '12-15 kr 이 운영 수선실적으로 채우기를 했다');
  exception when others then perform t_ok(sqlerrm like 'bad_table%', '12-15 직전 실적(운영 표) → bad_table'); end;
  begin perform edit_overwrites('sheet_wk'); perform t_ok(false, '12-16 kr 이 운영 표 덮어쓰기 경고를 불렀다');
  exception when others then perform t_ok(sqlerrm = 'read_only', '12-16 운영 표 덮어쓰기 경고 → read_only'); end;
end $$;
-- kr — 데모 표에는 전부 된다
do $$ declare r jsonb; h text; k bigint; n int; begin perform t_as('kr@test.local');
  r := edit_get('kr_sheet_wk', 7001);
  perform t_ok((r->>'ok')::boolean, '12-17 데모 행 읽기 (edit_get)');
  r := edit_update('kr_sheet_wk', 7001, r->>'hash', '{"stage":"CM"}');
  perform t_ok((r->>'ok')::boolean and (select stage from kr_sheet_wk where src_row = 7001) = 'CM'
           and (select stage from sheet_wk where src_row = 7001) = 'BM', '12-18 데모 행 고치기 — 운영 행은 그대로');
  perform t_ok((select tbl from sheet_edits order by id desc limit 1) = 'kr_sheet_wk', '12-19 이력은 kr_sheet_wk 로 남는다');
  perform t_ok((select ms from sheet_sync_log where tbl = 'kr_wk') = -1, '12-20 캐시 도장은 kr_wk (운영 wk 가 아니다)');
  r := edit_last_wk(array['zzk-0001'], 'kr_sheet_wk');
  perform t_ok(r->'ZZK0001'->0->>'rs_code' = 'RS-K-1' and (r->'ZZK0001'->0->>'stage') = 'CM', '12-21 직전 실적 — 데모 수선실적에서 찾는다');
  insert into kr_sheet_wk(src_row, op, rs_code, d_start) values (8001, 'SEC Scrubber', 'RS-K-9', '2026-06-01');
  perform t_ok(exists (select 1 from kr_sheet_wk where src_row = 8001), '12-22 데모 표 직접 쓰기(업로드의 insert) — RLS 가 연다');
  r := csv_window('kr_sheet_wk', '2026-06-01', '2026-06-01', array['SEC Scrubber'], false);
  perform t_ok((r->>'hit')::int = 1 and not exists (select 1 from kr_sheet_wk where src_row = 8001), '12-23 데모 표 구간 교체 (csv_window)');
  r := csv_upload_finish('kr_sheet_inst');
  perform t_ok((r->>'log')::boolean and (select rows from sheet_sync_log where tbl = 'kr_inst') = 2, '12-24 데모 설치현황 적재 기록 (kr_inst)');
  perform t_ok(edit_note('kr_sheet_alarm', 'upload:win', '*', null, '{"n":1}'::jsonb) > 0, '12-25 데모 표 업로드 요약 (edit_note)');
  perform csv_upload_begin('kr_sheet_leave');
  perform t_ok(not exists (select 1 from kr_sheet_leave), '12-26 데모 표 비우기 (csv_upload_begin)');
  /* 인원 → 교육 연쇄는 «데모» 교육 표로 */
  -- 1~11 의 연쇄 검사가 운영 인원의 사번을 이미 바꿨을 수 있다 — «데모 교육 표와 사번이 이어진» 데모 인원 한 명을 고른다
  select r0.id, r0."사원번호" into k, h from kr_sheet_roster r0 join kr_sheet_edu e0 on e0."사원번호"::text = r0."사원번호" order by r0.id limit 1;
  r := edit_get('kr_sheet_roster', k);
  r := edit_update('kr_sheet_roster', k, r->>'hash', '{"사원번호":"9100091"}');
  perform t_ok(k is not null and r->'cascade'->>'done' = 'true' and exists (select 1 from kr_sheet_edu where "사원번호" = 9100091)
           and exists (select 1 from sheet_edu where "사원번호" = h::bigint) and not exists (select 1 from sheet_edu where "사원번호" = 9100091),
               '12-27 데모 인원 사번을 바꾸면 «데모» 교육 표가 따라간다 — 운영 교육 표는 그대로 ' || coalesce((r->'cascade')::text, ''));
end $$;
-- editor(can_write · admin 아님)는 데모 표에 못 쓴다 · admin 은 쓴다 · viewer 는 읽기만
do $$ begin perform t_as('ed@test.local');
  begin insert into kr_sheet_wk(src_row, op) values (8101, 'SEC Scrubber'); perform t_ok(false, '12-28 editor 가 데모 표에 썼다');
  exception when others then perform t_ok(true, '12-28 editor 는 데모 표에 못 쓴다(admin·kr 만)'); end;
  begin perform csv_upload_begin('kr_sheet_wk'); perform t_ok(false, '12-29 editor 가 데모 표를 비웠다');
  exception when others then perform t_ok(sqlerrm = 'read_only', '12-29 editor 의 데모 표 비우기 → read_only'); end;
end $$;
do $$ begin perform t_as('vw@test.local');
  perform t_ok((select count(*) from kr_sheet_wk) >= 1, '12-30 viewer 도 데모 표를 읽는다');
end $$;
do $$ declare r jsonb; begin perform t_as('boss@test.local');
  insert into kr_sheet_wk(src_row, op, rs_code) values (8201, 'SEC Scrubber', 'RS-K-A');
  perform t_ok(exists (select 1 from kr_sheet_wk where src_row = 8201), '12-31 관리자는 데모 표에 쓴다');
  r := edit_last_wk(array['ZZK-0001']);
  perform t_ok(r->'ZZK0001'->0->>'rs_code' = 'RS-K-1' and (r->'ZZK0001'->0->>'stage') = 'BM', '12-32 한 인자 판은 운영 수선실적 그대로(껍데기)');
  r := edit_get('sheet_wk', 0);
  perform t_ok((r->>'ok')::boolean, '12-33 관리자는 운영 표도 그대로');
end $$;
reset role;
do $$ declare f text; bad text := ''; begin
  foreach f in array array['public._kr_can()', 'public._tbl_can_write(text)', 'public._is_kr()', 'public._edit_cascade_edu_t(jsonb,jsonb,bigint,text)'] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then bad := bad || f || ' '; end if;
  end loop;
  perform t_ok(bad = '', '12-34 새 내부 함수 넷은 실행 권한이 없다 ' || bad);
  perform t_ok(has_function_privilege('authenticated', 'public.edit_last_wk(text[],text)', 'EXECUTE')
           and not has_function_privilege('anon', 'public.edit_last_wk(text[],text)', 'EXECUTE'), '12-35 두 인자 edit_last_wk — authenticated 만');
end $$;
`;

/* [13] 데이터 품질 점검(setup-21 · v156) — 운영단위별 건수 · 여럿 운영단위 행 번호 · 설치현황 연결(instIndex 와 같은 순서) */
const DQ_CHECKS = String.raw`
truncate public.sheet_wk, public.sheet_inst, public.sheet_mat;
insert into public.sheet_inst(src_row, code, sn, div, floor) values (0, 'ZQ-1', 'SN-1', 'MEM', '3F'), (1, 'ZQ-2', 'SN 2', null, null), (2, 'ZQ-1', 'SN-X', 'OTHER', '9F');
insert into public.sheet_wk(src_row, op, eq_no, sn_in, d_start, work_min, worker_cnt, man_min) values
  (0, 'SEC Scrubber', 'zq-1', null, to_char(current_date - 10, 'YYYY-MM-DD'), '30', '2', null),
  (1, 'SEC Scrubber', 'ZQ-9', 'SN2', to_char(current_date - 20, 'YYYY-MM-DD'), '10', '1', '10'),
  (2, 'GST X SCRUBBER', 'ZZ', 'ZZ', to_char(current_date - 30, 'YYYY-MM-DD'), '2000', '1', '1,000'),
  (3, null, null, '  ', to_char(current_date - 500, 'YYYY-MM-DD'), null, null, null),
  (4, 'GST X SCRUBBER', '', 'sn-1', to_char(current_date + 5, 'YYYY-MM-DD'), '50', null, null);
do $$ declare d jsonb; j jsonb; o jsonb; begin
  d := edit_dq('sheet_wk', null);
  perform t_ok((d->>'rows')::int = 4 and (d->>'work24')::int = 1 and (d->>'future')::int = 1 and (d->>'manmis')::int = 1
           and (d->>'mannull')::int = 2 and (d->>'mfill')::int = 1, '13-1 edit_dq — 400일 안 4행 · 24h 1 · 미래 1 · 불일치 1 · 공수 빈칸 2 · 채울 수 있는 1 ' || d::text);
  perform t_ok(jsonb_array_length(d->'by_op') = 2
           and (select sum((e->>'work24')::int) from jsonb_array_elements(d->'by_op') e) = (d->>'work24')::int
           and (select sum((e->>'rows')::int) from jsonb_array_elements(d->'by_op') e) = (d->>'rows')::int, '13-2 운영단위별 건수의 합 = 전체');
  perform t_ok((select array_agg(r) from edit_dq_rows2('sheet_wk', 'mfill', array['SEC Scrubber']) r) = array[0::bigint]
           and (select count(*) from edit_dq_rows2('sheet_wk', 'mfill', array['GST X SCRUBBER'])) = 0
           and (select array_agg(r) from edit_dq_rows2('sheet_wk', 'work24') r) = array[2::bigint], '13-3 edit_dq_rows2 — 운영단위 여럿으로 거른다 · mfill 은 인원이 있는 빈 공수만');
  perform t_ok((select count(*) from edit_dq_rows2('sheet_wk', 'mannull', null, null, (current_date - 5))) = 1, '13-4 기간(p_from) 을 따른다');
  j := edit_dq_join('sheet_wk', null);
  select e into o from jsonb_array_elements(j->'by_op') e where e->>'op' = 'SEC Scrubber';
  perform t_ok((j->>'rows')::int = 5 and (o->>'miss')::int = 0 and (o->>'nodiv')::int = 1 and (o->>'nofloor')::int = 1,
    '13-5 설비호기(대소문자·공백 무시) → S/N(공백 무시) 순으로 붙는다 · 이어진 행의 빈 사업부·Floor ' || coalesce(o::text, 'null'));
  perform t_ok((select (e->>'miss')::int from jsonb_array_elements(j->'by_op') e where e->>'op' = 'GST X SCRUBBER') = 1
           and (select (e->>'nokey')::int from jsonb_array_elements(j->'by_op') e where e->>'op' = '') = 1, '13-6 설치현황에 없음 1 · 설비호기·S/N 빈칸 1');
  perform t_ok(exists(select 1 from jsonb_array_elements(j->'miss_top') e where e->>'eq' = 'ZZ' and (e->>'n')::int = 1)
           and exists(select 1 from jsonb_array_elements(j->'inst_refs') e where (e->>'ir')::int = 1 and e->>'op' = 'SEC Scrubber' and (e->>'nd')::int = 1), '13-7 안 이어진 설비 목록 · 빈 칸이 있는 설치현황 행');
  perform t_ok((select array_agg(r) from edit_dq_join_rows('sheet_wk', 'nodiv') r) = array[1::bigint]
           and (select array_agg(r) from edit_dq_join_rows('sheet_wk', 'miss', array['GST X SCRUBBER'], 'ZZ', 'ZZ') r) = array[2::bigint]
           and (select array_agg(r) from edit_dq_join_rows('sheet_wk', 'nokey') r) = array[3::bigint], '13-8 edit_dq_join_rows — 판정 · 운영단위 · 그 S/N');
  perform t_ok((select count(*) from edit_dq_join_rows('sheet_wk', 'nodiv', array['GST X SCRUBBER'])) = 0, '13-9 운영단위로 거른다');
  perform t_ok(((edit_dq_join('sheet_wk', current_date - 100))->>'rows')::int = 4, '13-10 연결 점검도 기간을 따른다');
  perform t_ok(((edit_dq_join('sheet_mat', null))->>'rows')::int = 0, '13-11 자재실적도 돈다');
  /* 설치현황의 같은 CODE 가 둘이면 «첫 행» — instIndex 와 같다(ZQ-1 은 0번 행 · div MEM) */
  perform t_ok((select count(*) from edit_dq_join_rows('sheet_wk', 'nodiv', array['SEC Scrubber'])) = 1, '13-12 같은 열쇠가 여럿이면 첫 행(0번 · 사업부 MEM)');
  begin perform edit_dq_join('sheet_roster'); perform t_ok(false, '13-13 허용 밖 표'); exception when others then perform t_ok(sqlerrm like 'bad_table%', '13-13 허용 밖 표는 bad_table'); end;
  perform t_ok(not has_function_privilege('anon', 'public.edit_dq_join(text,date)', 'EXECUTE')
           and not has_function_privilege('anon', 'public.edit_dq_rows2(text,text,text[],date,date,int)', 'EXECUTE')
           and has_function_privilege('authenticated', 'public.edit_dq_join_rows(text,text,text[],text,text,date,int)', 'EXECUTE'), '13-14 anon 불가 · authenticated 가능');
end $$;
`;

/* [14] CIP 새 점검 항목 열 더하기(setup-22 · v157) — 관리자만 · CIP 두 표만 · 같은 뜻의 열은 안 더함 · 63바이트 · 이력 */
const COLS_CHECKS = String.raw`
create table public.sheet_cip_f16(id bigint generated always as identity primary key, "NO" text, "Scrubber
S/N" text, "CW Regulator Change
Corrosive, Leak (Left)" text);
grant select on public.sheet_cip_f16 to authenticated;
do $$ declare r jsonb; e0 int; begin
  select count(*) into e0 from sheet_edits;
  begin perform import_add_cols('sheet_cip_f16', array['x']); perform t_ok(false, '14-1 로그인 없이 됐다'); exception when others then perform t_ok(sqlerrm = 'login', '14-1 로그인 없으면 login'); end;
  perform t_as('ed@test.local');
  begin perform import_add_cols('sheet_cip_f16', array['x']); perform t_ok(false, '14-2 editor 가 열을 더했다'); exception when others then perform t_ok(sqlerrm = 'forbidden', '14-2 관리자가 아니면 forbidden'); end;
  perform t_as('boss@test.local');
  begin perform import_add_cols('sheet_wk', array['x']); perform t_ok(false, '14-3 실적 표에 더했다'); exception when others then perform t_ok(sqlerrm like 'bad_table%', '14-3 CIP 두 표만'); end;
  r := import_add_cols('sheet_cip_f16', array['New Item Alpha', 'CW Regulator Change Corrosive, Leak (Left)', repeat('가', 30), E'Gizmo  Kit
Left']);
  perform t_ok(r->'added' = '["New Item Alpha", "Gizmo Kit Left"]'::jsonb, '14-4 새 이름만 한 줄 이름으로 더한다 ' || (r->'added')::text);
  perform t_ok(exists(select 1 from jsonb_array_elements(r->'skipped') x where x->>'why' = 'exists' and x->>'as' like 'CW Regulator Change%'), '14-5 줄바꿈이 든 옛 열과 같은 뜻이면 더하지 않는다(같은 열이 둘 생기지 않게)');
  perform t_ok(exists(select 1 from jsonb_array_elements(r->'skipped') x where x->>'why' = 'bad_name'), '14-6 63바이트를 넘는 이름은 거절(Postgres 가 조용히 자르지 않게)');
  perform t_ok((select count(*) from information_schema.columns where table_name = 'sheet_cip_f16' and column_name in ('New Item Alpha', 'Gizmo Kit Left')) = 2, '14-7 표에 열이 생겼다');
  perform t_ok((select count(*) from sheet_edits) = e0 + 1 and exists(select 1 from sheet_edits where op = 'add_cols' and tbl = 'sheet_cip_f16' and edited_by = 'boss@test.local'), '14-8 이력 한 줄(누가 · 어느 표 · 무엇을)');
  perform t_ok(not has_function_privilege('anon', 'public.import_add_cols(text,text[])', 'EXECUTE') and has_function_privilege('authenticated', 'public.import_add_cols(text,text[])', 'EXECUTE'), '14-9 anon 불가 · authenticated 가능');
  /* v159 — CIP 도 데이터 관리에서 고친다(_edit_key 에 id) · 더한 열도 그대로 고칠 수 있다 */
  insert into sheet_cip_f16("NO", "New Item Alpha") values ('1', 'Not yet');
  declare k bigint := (select max(id) from sheet_cip_f16); u jsonb; begin
    u := edit_update('sheet_cip_f16', k, (edit_get('sheet_cip_f16', k))->>'hash', '{"New Item Alpha":"2026-05-06"}');
    perform t_ok((u->>'ok')::boolean and (select "New Item Alpha" from sheet_cip_f16 where id = k) = '2026-05-06', '14-10 CIP 행을 데이터 관리에서 고친다(더한 항목 열 포함)');
    perform t_ok(exists(select 1 from sheet_edits where tbl = 'sheet_cip_f16' and op = 'update' and row_key = k::text), '14-11 CIP 편집도 이력에 남는다');
  end;
end $$;
`;

/* [15] 사이트 등록부(setup-23 · v160) — 새 사이트 CIP 표를 «등록»으로 만들고, 허용목록 넷이 등록부를 본다 */
const SITES_CHECKS = String.raw`
do $$ declare r jsonb; k bigint; u jsonb; begin
  perform t_ok((select count(*) from site_registry where fab in ('F11','F16')) = 2, '15-1 옛 두 사이트가 씨앗으로 들어 있다');
  perform t_ok(public._edit_key('sheet_cip_f16') = 'id' and public._edit_key('sheet_cip_f18') is null, '15-2 등록 전 F18 표는 데이터 관리 밖');
  begin perform cip_site_create('F18'); perform t_ok(false, '15-3 로그인 없이 됐다'); exception when others then perform t_ok(sqlerrm = 'login', '15-3 로그인 없으면 login'); end;
  perform t_as('ed@test.local');
  begin perform cip_site_create('F18'); perform t_ok(false, '15-4 editor 가 만들었다'); exception when others then perform t_ok(sqlerrm = 'forbidden', '15-4 관리자가 아니면 forbidden'); end;
  perform t_as('boss@test.local');
  begin perform cip_site_create('f 18;drop'); perform t_ok(false, '15-5 이상한 코드'); exception when others then perform t_ok(sqlerrm = 'bad_fab', '15-5 사이트 코드는 영숫자·하이픈만'); end;
  r := cip_site_create(' f18 ');
  perform t_ok(r->>'table' = 'sheet_cip_f18' and (r->>'created')::boolean, '15-6 F18 표를 만든다(코드는 대문자로)');
  perform t_ok((select count(*) from information_schema.columns where table_name = 'sheet_cip_f18' and column_name in ('Scrubber S/N','FAB','FAB In','Remark')) = 4, '15-7 기본 설비 열');
  perform t_ok((select relrowsecurity from pg_class where relname = 'sheet_cip_f18') and not has_table_privilege('anon', 'public.sheet_cip_f18', 'SELECT'), '15-8 RLS 켜짐 · anon 못 읽음');
  perform t_ok((select cip_table from site_registry where fab = 'F18') = 'sheet_cip_f18' and exists(select 1 from sheet_edits where op = 'cip_create' and tbl = 'sheet_cip_f18'), '15-9 등록부 + 이력');
  perform t_ok(not (cip_site_create('F18')->>'created')::boolean, '15-10 두 번 만들면 있는 표를 돌려준다');
  perform t_ok(public._edit_key('sheet_cip_f18') = 'id', '15-11 등록되면 데이터 관리 허용');
  r := import_add_cols('sheet_cip_f18', array['New Item Beta']);
  perform t_ok(r->'added' = '["New Item Beta"]'::jsonb, '15-12 점검 항목을 더한다');
  insert into sheet_cip_f18("NO", "Scrubber S/N", "New Item Beta") values ('1', 'ZZZ0001', 'Not yet');
  k := (select max(id) from sheet_cip_f18);
  u := edit_update('sheet_cip_f18', k, (edit_get('sheet_cip_f18', k))->>'hash', '{"New Item Beta":"2026-05-06"}');
  perform t_ok((u->>'ok')::boolean and (select "New Item Beta" from sheet_cip_f18 where id = k) = '2026-05-06', '15-13 새 사이트 CIP 행을 고친다');
  perform edit_note('sheet_cip_f18', 'upload:full', '*', null, '{"n":1}');
  perform t_ok(exists(select 1 from sheet_edits where tbl = 'sheet_cip_f18' and op = 'upload:full'), '15-14 업로드 요약 이력도 받는다');
  perform csv_upload_begin('sheet_cip_f18');
  perform t_ok((select count(*) from sheet_cip_f18) = 0, '15-15 통째 교체(비우기)를 받는다');
  begin perform csv_upload_begin('sheet_cip_zz'); perform t_ok(false, '15-16 등록 안 된 표'); exception when others then perform t_ok(sqlerrm like 'bad_table%', '15-16 등록 안 된 표는 여전히 bad_table'); end;
  perform t_ok(not has_function_privilege('anon', 'public.cip_site_create(text)', 'EXECUTE') and has_function_privilege('authenticated', 'public.cip_site_create(text)', 'EXECUTE')
           and not has_function_privilege('authenticated', 'public._cip_tbl(text)', 'EXECUTE'), '15-17 anon 불가 · 내부 판정 함수는 회수');
end $$;
`;


/* [16] 처리함(setup-24 · v166) — 쓰기는 함수만 · 같은 신호는 한 번만 · 칸마다 이력 · 남의 변경을 덮지 않는다 */
const ACT_CHECKS = String.raw`
set role authenticated;
do $$ declare r jsonb; r2 jsonb; i bigint; at0 timestamptz; s jsonb; n int; begin
  perform t_as('');
  begin perform action_add('risk','risk:ZQ-001','bad','ZQ-001 위험'); perform t_ok(false, '16-1 로그인 없이 담았다'); exception when others then perform t_ok(sqlerrm = 'login', '16-1 로그인 없으면 login'); end;
  perform t_as('vw@test.local');
  begin perform action_add('risk','risk:ZQ-001','bad','ZQ-001 위험'); perform t_ok(false, '16-2 조회자가 담았다'); exception when others then perform t_ok(sqlerrm = 'forbidden', '16-2 조회자는 forbidden'); end;
  perform t_ok((select count(*) from action_items) = 0, '16-3 조회자도 읽기는 된다(0행)');
  begin insert into action_items(title, created_by) values ('x','vw@test.local'); perform t_ok(false, '16-4 표에 직접 넣었다'); exception when others then perform t_ok(sqlstate = '42501', '16-4 표에 직접 쓰기는 권한 없음'); end;
  perform t_as('ed@test.local');
  r := action_add('risk','risk:ZQ-001','bad','ZQ-001 위험','14일 안 재고장','OPX Scrubber','fault','boss@test.local', '2026-11-01');
  perform t_ok((r->>'created')::boolean, '16-5 editor 가 담는다');
  i := (r->>'id')::bigint;
  r2 := action_add('risk','risk:ZQ-001','bad','ZQ-001 다시');
  perform t_ok(not (r2->>'created')::boolean and (r2->>'id')::bigint = i, '16-6 같은 신호는 열려 있는 일을 돌려준다');
  perform t_ok((select count(*) from action_log where item_id = i) = 2, '16-7 이력 — 생성 + 담당');
  begin perform action_add('manual',null,'warn','x',null,null,null,'nobody@x.y'); perform t_ok(false, '16-8 모르는 담당자'); exception when others then perform t_ok(sqlerrm = 'bad_assignee', '16-8 허용 사용자가 아니면 담당자가 될 수 없다'); end;
  begin perform action_add('manual',null,'warn','   '); perform t_ok(false, '16-9 빈 제목'); exception when others then perform t_ok(sqlerrm = 'bad_title', '16-9 빈 제목 거절'); end;
  at0 := (select updated_at from action_items where id = i);
  s := action_set(i, '{"status":"ack","memo":"현장 확인 요청"}', at0);
  perform t_ok((s->>'ok')::boolean and (s->>'changed')::int = 2 and (select status from action_items where id = i) = 'ack', '16-10 상태 + 메모');
  s := action_set(i, '{"status":"doing"}', at0);
  perform t_ok(not (s->>'ok')::boolean and (s->>'conflict')::boolean, '16-11 들고 있던 시각이 옛 것이면 conflict (덮지 않는다)');
  perform t_ok((select status from action_items where id = i) = 'ack', '16-12 conflict 면 안 바뀐다');
  s := action_set(i, '{"status":"done","assignee":"","due":""}');
  perform t_ok((select status = 'done' and closed_at is not null and assignee is null and due is null from action_items where id = i), '16-13 완료 · 담당·기한 해제 · 닫힌 시각');
  r2 := action_add('risk','risk:ZQ-001','bad','ZQ-001 재발');
  perform t_ok((r2->>'created')::boolean and (r2->>'id')::bigint <> i, '16-14 닫힌 뒤 같은 신호는 새 일(재발은 새 사건)');
  begin perform action_set(i, '{"status":"open"}'); perform t_ok(false, '16-15a 둘이 열렸다'); exception when others then perform t_ok(sqlerrm = 'already_open', '16-15a 같은 신호의 새 일이 열려 있으면 옛 일을 다시 열지 않는다'); end;
  perform action_set((r2->>'id')::bigint, '{"status":"dismissed"}');
  s := action_set(i, '{"status":"open"}');
  perform t_ok(exists(select 1 from action_log where item_id = i and op = 'reopen'), '16-15 닫힌 일을 다시 열면 reopen 이력');
  begin perform action_set(i, '{"status":"weird"}'); perform t_ok(false, '16-16 이상한 상태'); exception when others then perform t_ok(sqlerrm = 'bad_status', '16-16 이상한 상태 거절'); end;
  s := action_set(i, '{"status":"open"}');
  perform t_ok((s->>'changed')::int = 0, '16-17 같은 값이면 이력을 안 남긴다');
  n := (select count(*) from action_log where item_id = i);
  perform t_ok(n = 8, '16-18 이력 줄 수 (생성·담당·상태·메모·상태·담당·기한·reopen = 8 · 받은 ' || n || ')');
  perform t_ok((select count(*) from action_people() p where p in ('boss@test.local','vw@test.local','ed@test.local')) = 3, '16-19 담당자 목록 = 허용 사용자 이메일');
  perform t_as('vw@test.local');
  perform t_ok((select count(*) from action_people()) = 0, '16-20 조회자에게는 담당자 목록을 안 준다');
  begin perform action_set(i, '{"status":"done"}'); perform t_ok(false, '16-21 조회자가 바꿨다'); exception when others then perform t_ok(sqlerrm = 'forbidden', '16-21 조회자는 못 바꾼다'); end;
  perform t_ok((select count(*) from action_items) = 2 and (select count(*) from action_log) > 0, '16-22 조회자도 일과 이력을 읽는다');
  perform t_ok(not has_function_privilege('anon','public.action_add(text,text,text,text,text,text,text,text,date)','EXECUTE')
           and not has_function_privilege('authenticated','public._act_who()','EXECUTE')
           and has_function_privilege('authenticated','public.action_set(bigint,jsonb,timestamptz)','EXECUTE'), '16-23 anon 불가 · 내부 판정 회수');
end $$;
`;

let skipped = 0;
try {
  const init = run('initdb', ['-D', DATA, '-A', 'trust', '-U', 'postgres', '--no-sync', '-E', 'UTF8', '--locale=C']);
  if (init.status !== 0) throw new Error('initdb 실패: ' + (init.stderr || init.stdout));
  const st = run('pg_ctl', ['-D', DATA, '-o', `-p ${PORT} -k ${DIR} -c listen_addresses=`, '-l', path.join(DIR, 'log'), '-w', 'start']);
  if (st.status !== 0) throw new Error('pg_ctl start 실패: ' + (st.stderr || st.stdout) + (fs.existsSync(path.join(DIR,'log')) ? fs.readFileSync(path.join(DIR, 'log'), 'utf8') : ''));

  console.log('[0] 복제 스키마 + 저장소의 setup-10-alarm.sql · setup-16-edit.sql 적용');
  const p0 = psql(PRELUDE, 'prelude');
  ok(!/ERROR/.test(p0.stderr), '복제 스키마 실패:\n' + p0.stderr);
  const pL = psql(fs.readFileSync(LEDGER_FILE, 'utf8'), 'setup10');
  ok(!/ERROR/.test(pL.stderr), 'setup-10-alarm.sql 적용 실패:\n' + pL.stderr);
  const pS = psql(LEDGER_SEED, 'ledger-seed');
  ok(!/ERROR/.test(pS.stderr), '원장 씨앗 실패:\n' + pS.stderr);
  const sqlText = fs.readFileSync(SQL_FILE, 'utf8');
  const p1 = psql(sqlText, 'setup16');
  ok(!/ERROR/.test(p1.stderr), 'setup-16-edit.sql 적용 실패:\n' + p1.stderr);
  const p1b = psql(sqlText, 'setup16b');          // «여러 번 Run 해도 안전하다» 를 그대로 시험
  ok(!/ERROR/.test(p1b.stderr), 'setup-16-edit.sql 두 번째 적용 실패:\n' + p1b.stderr);
  /* [11-0] edit_last_wk 의 식과 식 인덱스가 «글자까지» 같은가 — 갈리면 인덱스를 안 타고 부를 때마다 26만 행에
     정규식을 돌린다(운영 실측 설비 하나 0.7~1.2초). 결과는 같아서 동작 검사로는 원리적으로 못 잡는다. */
  const idxExpr = (sqlText.match(/create index if not exists sheet_wk_snkey_idx\s+on public\.sheet_wk \(\((.+?)\)\);/s) || [])[1];
  const fnBody = sqlText.slice(sqlText.indexOf('create or replace function public.edit_last_wk'));
  const fnExpr = (fnBody.match(/join public\.sheet_wk t on (upper\(regexp_replace\(coalesce\(t\.sn_in[^\n]*?\)\)) = ks\.k/) || [])[1];
  ok(!!idxExpr && !!fnExpr && idxExpr === fnExpr.replace(/\bt\./g, ''),
     '11-0 edit_last_wk 의 S/N 식과 sheet_wk_snkey_idx 의 식이 같다 (' + idxExpr + ' ↔ ' + fnExpr + ')');

  console.log('[1~11] 권한 · 수정 · 입력 · 삭제 · 되돌리기 · 연쇄 · 보조 함수 · 엑셀 일괄 · 원장 · 업로드 덮어쓰기 · 직전 실적 확인');
  const p2 = psql(CHECKS, 'checks');
  const out = (p2.stderr || '') + (p2.stdout || '');
  const oks = out.match(/T_OK [^\n]*/g) || [];
  const bads = out.match(/ERROR:[^\n]*/g) || [];
  oks.forEach(() => pass++);
  bads.forEach(b => { fail++; console.log('  ❌ ' + b.replace(/^ERROR:\s*/, '')); });
  /* 검사가 «조용히 덜 돈» 것을 잡는다 — 블록 하나가 통째로 안 돌면 T_OK 개수가 모자란다 */
  const EXPECT = 110;
  ok(oks.length === EXPECT, 'T_OK 가 ' + oks.length + '개 — 기대 ' + EXPECT + '개 (검사가 덜 돌았거나 늘었다)');

  console.log('[12] 국내 데모(v146) — 저장소의 setup-17-kr-demo.sql 을 두 번 먹이고 kr 등급의 범위를 본다');
  const pK0 = psql(KR_SEED, 'kr-seed');
  ok(!/ERROR/.test(pK0.stderr), '국내 씨앗 실패:\n' + pK0.stderr);
  const krText = fs.readFileSync(KR_FILE, 'utf8');
  const pK1 = psql(krText, 'setup17');
  ok(!/ERROR/.test(pK1.stderr), 'setup-17-kr-demo.sql 적용 실패:\n' + pK1.stderr);
  const pK2 = psql(krText, 'setup17b');          // 다시 Run — 데모 표가 비어 있지 않으면 복사를 건너뛴다(담당자가 올린 자료를 안 덮는다)
  ok(!/ERROR/.test(pK2.stderr), 'setup-17-kr-demo.sql 두 번째 적용 실패:\n' + pK2.stderr);
  ok(/이미 자료가 있어 건너뜀/.test(pK2.stderr), '12-0 두 번째 Run 은 복사를 건너뛴다 (NOTICE 없음)');
  /* 두 인자 edit_last_wk 의 식도 식 인덱스와 «글자까지» 같아야 한다 — 데모 표는 like … including all 로 같은 식 인덱스를 받는다 */
  const krFn = krText.slice(krText.indexOf('create or replace function public.edit_last_wk(p_sns text[], p_tbl text)'));
  const krExpr = (krFn.match(/join public\.%1\$I t on (upper\(regexp_replace\(coalesce\(t\.sn_in[^\n]*?\)\)) = ks\.k/) || [])[1];
  ok(!!idxExpr && !!krExpr && idxExpr === krExpr.replace(/\bt\./g, ''), '12-0b 두 인자 edit_last_wk 의 S/N 식 = 식 인덱스 (' + krExpr + ')');
  const pK3 = psql(KR_CHECKS, 'kr-checks');
  const outK = (pK3.stderr || '') + (pK3.stdout || '');
  const oksK = outK.match(/T_OK [^\n]*/g) || [];
  const badsK = outK.match(/ERROR:[^\n]*/g) || [];
  oksK.forEach(() => pass++);
  badsK.forEach(b => { fail++; console.log('  ❌ ' + b.replace(/^ERROR:\s*/, '')); });
  const EXPECT_K = 35;
  ok(oksK.length === EXPECT_K, '[12] T_OK 가 ' + oksK.length + '개 — 기대 ' + EXPECT_K + '개');

  console.log('[13] 데이터 품질 점검(v156) — 저장소의 setup-21-dq.sql 을 두 번 먹이고 운영단위별 건수 · 설치현황 연결을 본다');
  const dqText = fs.readFileSync(DQ_FILE, 'utf8');
  for (const tag of ['setup21', 'setup21b']) { const r = psql(dqText, tag); ok(!/ERROR/.test(r.stderr), 'setup-21-dq.sql 적용 실패(' + tag + '):\n' + r.stderr); }
  const pD = psql(DQ_CHECKS, 'dq-checks');
  const outD = (pD.stderr || '') + (pD.stdout || '');
  const oksD = outD.match(/T_OK [^\n]*/g) || [];
  const badsD = outD.match(/ERROR:[^\n]*/g) || [];
  oksD.forEach(() => pass++);
  badsD.forEach(b => { fail++; console.log('  ❌ ' + b.replace(/^ERROR:\s*/, '')); });
  ok(oksD.length === 14, '[13] T_OK 가 ' + oksD.length + '개 — 기대 14개');

  console.log('[14] CIP 새 점검 항목 열 더하기(v157) — 저장소의 setup-22-import-cols.sql 을 두 번 먹인다');
  const colsText = fs.readFileSync(COLS_FILE, 'utf8');
  for (const tag of ['setup22', 'setup22b']) { const r = psql(colsText, tag); ok(!/ERROR/.test(r.stderr), 'setup-22-import-cols.sql 적용 실패(' + tag + '):\n' + r.stderr); }
  const pC = psql(COLS_CHECKS, 'cols-checks');
  const outC = (pC.stderr || '') + (pC.stdout || '');
  const oksC = outC.match(/T_OK [^\n]*/g) || [];
  (outC.match(/ERROR:[^\n]*/g) || []).forEach(b => { fail++; console.log('  ❌ ' + b.replace(/^ERROR:\s*/, '')); });
  oksC.forEach(() => pass++);
  ok(oksC.length === 11, '[14] T_OK 가 ' + oksC.length + '개 — 기대 11개');
  console.log('[15] 사이트 등록부(v160) — 저장소의 setup-23-sites.sql 을 두 번 먹인다');
  const sitesText = fs.readFileSync(SITES_FILE, 'utf8');
  for (const tag of ['setup23', 'setup23b']) { const r = psql(sitesText, tag); ok(!/ERROR/.test(r.stderr), 'setup-23-sites.sql 적용 실패(' + tag + '):\n' + r.stderr); }
  const pR = psql(SITES_CHECKS, 'sites-checks');
  const outR = (pR.stderr || '') + (pR.stdout || '');
  const oksR = outR.match(/T_OK [^\n]*/g) || [];
  (outR.match(/ERROR:[^\n]*/g) || []).forEach(b => { fail++; console.log('  ❌ ' + b.replace(/^ERROR:\s*/, '')); });
  oksR.forEach(() => pass++);
  ok(oksR.length === 17, '[15] T_OK 가 ' + oksR.length + '개 — 기대 17개');
  console.log('[16] 처리함(v166) — 저장소의 setup-24-actions.sql 을 두 번 먹인다');
  const actText = fs.readFileSync(ACT_FILE, 'utf8');
  for (const tag of ['setup24', 'setup24b']) { const r = psql(actText, tag); ok(!/ERROR/.test(r.stderr), 'setup-24-actions.sql 적용 실패(' + tag + '):\n' + r.stderr); }
  const pA = psql(ACT_CHECKS, 'act-checks');
  const outA = (pA.stderr || '') + (pA.stdout || '');
  const oksA = outA.match(/T_OK [^\n]*/g) || [];
  (outA.match(/ERROR:[^\n]*/g) || []).forEach(b => { fail++; console.log('  ❌ ' + b.replace(/^ERROR:\s*/, '')); });
  oksA.forEach(() => pass++);
  ok(oksA.length === 24, '[16] T_OK 가 ' + oksA.length + '개 — 기대 24개');
} catch (e) {
  fail++; console.log('  ❌ ' + (e && e.message || e));
} finally {
  try { run('pg_ctl', ['-D', DATA, '-m', 'immediate', 'stop']); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
}

if (fail) console.log(`\n❌ t-editsql: ${pass} 통과 · ${fail} 실패`);
else console.log(`\n✅ t-editsql: ${pass} 통과 (PostgreSQL ${path.basename(path.dirname(BIN))})`);
process.exit(fail ? 1 : 0);
