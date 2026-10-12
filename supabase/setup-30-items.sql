-- setup-30-items.sql — 자재마스터(품목마스터현황) — 부품 코드 → 표준 품목명·규격·유형 (v190 · 사용자 요청)
-- 사용자: 「부품은 자재코드 및 파트 이름으로 볼 수 있게 해 놓는 거지? 자재마스터현황 파일 보내 줄게 —
--          이것도 대시보드에 업로드해서 맵핑 자료로 활용해야 할 것 같은데?」
--
-- 무엇
--   1. item_master       — 품목 한 줄 = 품목번호(자재코드) 하나. 열 정의의 정본은 assets/core.js GST.SM.SPEC.item 이다(제2원칙).
--                          ⚠ 열쇠는 «품목번호» 다 — FSE 원장 part_code · 자재실적 mat_code 와 «정확일치»로 잇는다(부분일치 금지 · 제1원칙).
--                          id 는 데이터 관리(edit_*)가 행을 찾는 번호일 뿐이다(그 함수들이 bigint 열쇠를 받는다).
--   2. item_master_put   — 업로드: «품목번호 기준 덮어쓰기». 같은 번호는 파일 값으로 바꾸고, 새 번호는 더하고, 파일에 없는 품목은 «지우지 않는다».
--                          ⚠ 마스터는 «지금 쓰는 품목» 명부다 — 옛 원장이 단종 품목 코드를 들고 있어도 이름을 잃지 않게 지우지 않는다.
--                            «이번 파일에 없던 품목»은 seen_at 으로 가린다(마지막으로 올린 파일에 있었던 시각).
--                          ⚠ 비우기·구간 교체가 없다 — 그래서 csv_upload_begin·통째 교체 승인(setup-28)과 무관하고, 이 파일에는 지우는 문장이 없다(MCP 로 Run 가능).
--   3. item_master_done  — 업로드 마무리: 전체 품목 수 · 이번 파일에 없던 품목 수 · 이력 한 줄(sheet_edits · op 'upload:merge').
--   4. _edit_key·_edit_hash — 데이터 관리 「자재마스터」 탭(id 로 찾는다 · 행 해시에서 seen_at 을 뺀다). ⚠ 같은 줄이 setup-16·23 의 _edit_key 에도 있다 —
--                          그 파일을 다시 Run 해도 이 탭이 빠지지 않게(«마지막에 Run 한 판이 남는다»는 사고를 막는다).
--
-- 권한: 읽기 = 허용 사용자 · 쓰기(올리기·고치기) = can_write. 쓰기는 함수만 지난다(표에 insert/update 권한을 주지 않는다 —
--       고치면 이력이 남아야 한다 · sheet_edits 와 같은 규율). 데이터 관리의 한 행 편집은 edit_* (security definer) 를 지난다.
-- 다시 Run 해도 안전하다(전부 if not exists · create or replace).

/* ---------- 1. 표 ---------- */
create table if not exists public.item_master (
  id         bigint generated always as identity primary key,
  code       text not null,          -- 품목번호 (= 자재코드 · 부품 코드)
  itype      text,                   -- 품목유형 (원자재 · 반제품 · 소모품 · 완제품 · 부자재 · 교역품 …)
  name       text,                   -- 품목명
  spec1      text,                   -- 규격1
  spec2      text,                   -- 규격2
  unit       text,                   -- 단위
  extra      jsonb,                  -- SPEC 밖 열 전부(머리글 이름 그대로) — ERP 양식에 열이 늘어도 값을 잃지 않는다
  seen_at    timestamptz,            -- 마지막으로 올린 마스터 파일에 이 품목이 있었던 시각(그 업로드의 시작 시각)
  synced_at  timestamptz not null default now()   -- 값이 마지막으로 바뀐 시각(같은 값으로 다시 올리면 안 바뀐다)
);
comment on table public.item_master is '자재마스터(품목마스터현황) — /upload/ 로 품목번호 기준 덮어쓰기. 지우지 않는다(seen_at 으로 이번 파일에 없던 품목을 가린다).';
create unique index if not exists item_master_code_uq on public.item_master (code);
create index if not exists item_master_itype_idx on public.item_master (itype);

alter table public.item_master enable row level security;
revoke all on public.item_master from anon;
revoke insert, update, delete on public.item_master from authenticated;
grant select on public.item_master to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='item_master' and policyname='allowed read') then
    create policy "allowed read" on public.item_master for select to authenticated
      using ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')) );
  end if;
end $$;

/* ---------- 2. 업로드 — 품목번호 기준 덮어쓰기 ----------
 * p_rows = [{code, itype, name, spec1, spec2, unit, extra}] (최대 5,000줄 · 화면이 2,000줄씩 보낸다)
 * p_run  = 이 업로드의 시작 시각 — 첫 묶음은 null 로 부르고, 돌려받은 run 을 다음 묶음에 넘긴다(브라우저 시계를 믿지 않는다).
 * 같은 묶음 안에 같은 번호가 둘이면 «뒤의 줄»이 이긴다(on conflict 는 한 문장에서 같은 행을 두 번 못 고친다).
 * 반환: {run, new, changed, same, skipped(번호 빈칸)} */
create or replace function public.item_master_put(p_rows jsonb, p_run timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_run timestamptz := coalesce(p_run, now()); n_new int; n_chg int; n_same int; n_skip int;
begin
  if coalesce(auth.jwt()->>'email','') = '' then raise exception 'login'; end if;
  if not public._tbl_can_write('item_master') then raise exception 'read_only'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'bad_rows'; end if;

  select count(*) into n_skip from jsonb_array_elements(p_rows) e where nullif(btrim(e->>'code'), '') is null;

  with src as (
    select distinct on (code) code, itype, name, spec1, spec2, unit, extra
      from (select nullif(btrim(e->>'code'),  '') as code,
                   nullif(btrim(e->>'itype'), '') as itype,
                   nullif(btrim(e->>'name'),  '') as name,
                   nullif(btrim(e->>'spec1'), '') as spec1,
                   nullif(btrim(e->>'spec2'), '') as spec2,
                   nullif(btrim(e->>'unit'),  '') as unit,
                   case when jsonb_typeof(e->'extra') = 'object' and e->'extra' <> '{}'::jsonb then e->'extra' end as extra,
                   o
              from jsonb_array_elements(p_rows) with ordinality as t(e, o)) s
     where code is not null
     order by code, o desc),
  cmp as (
    select s.*, (m.id is null) as is_new,
           (m.id is not null and (m.itype, m.name, m.spec1, m.spec2, m.unit, m.extra)
                                 is distinct from (s.itype, s.name, s.spec1, s.spec2, s.unit, s.extra)) as is_chg
      from src s left join public.item_master m on m.code = s.code),
  up as (
    insert into public.item_master as m (code, itype, name, spec1, spec2, unit, extra, seen_at, synced_at)
    select code, itype, name, spec1, spec2, unit, extra, v_run, now() from cmp
    on conflict (code) do update set
      itype = excluded.itype, name = excluded.name, spec1 = excluded.spec1, spec2 = excluded.spec2, unit = excluded.unit,
      extra = excluded.extra, seen_at = excluded.seen_at,
      synced_at = case when (m.itype, m.name, m.spec1, m.spec2, m.unit, m.extra)
                            is distinct from (excluded.itype, excluded.name, excluded.spec1, excluded.spec2, excluded.unit, excluded.extra)
                       then now() else m.synced_at end
    returning 1)
  select count(*) filter (where is_new), count(*) filter (where is_chg), count(*) filter (where not is_new and not is_chg)
    into n_new, n_chg, n_same from cmp;

  return jsonb_build_object('run', v_run, 'new', n_new, 'changed', n_chg, 'same', n_same, 'skipped', n_skip);
end $$;
revoke all on function public.item_master_put(jsonb, timestamptz) from public, anon;
grant execute on function public.item_master_put(jsonb, timestamptz) to authenticated;

/* ---------- 3. 마무리 — 수 세기 · 이력 한 줄 ---------- */
create or replace function public.item_master_done(p_run timestamptz, p_file text default null, p_counts jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; n_old int; lid bigint;
begin
  if coalesce(auth.jwt()->>'email','') = '' then raise exception 'login'; end if;
  if not public._tbl_can_write('item_master') then raise exception 'read_only'; end if;
  if p_run is null then raise exception 'bad_run'; end if;
  select count(*), count(*) filter (where seen_at is distinct from p_run) into n, n_old from public.item_master;
  insert into public.sheet_edits(gid, tbl, row_key, op, before, after, edited_by)
  values ('item', 'item_master', '*', 'upload:merge', null,
          jsonb_build_object('file', left(coalesce(p_file, ''), 200), 'run', p_run, 'rows', n, 'unseen', n_old)
            || coalesce(case when jsonb_typeof(p_counts) = 'object' then p_counts end, '{}'::jsonb),
          auth.jwt()->>'email')
  returning id into lid;
  return jsonb_build_object('rows', n, 'unseen', n_old, 'log', lid);
end $$;
revoke all on function public.item_master_done(timestamptz, text, jsonb) from public, anon;
grant execute on function public.item_master_done(timestamptz, text, jsonb) to authenticated;

/* ---------- 4. 데이터 관리 — 자재마스터 탭 ----------
 * 행 해시에서 seen_at 을 뺀다 — 같은 값으로 다시 올려도 그 칸은 올라간다(«이번 파일에 있었다»). 넣어 두면 받아 둔 엑셀·열린 편집기가
 * 내용은 그대로인데 «남이 고쳤다»(conflict)로 멈춘다. 그 칸을 가진 표는 이 표 하나라 다른 표의 해시는 한 글자도 안 바뀐다(setup-16 과 같은 식). */
create or replace function public._edit_hash(r jsonb) returns text
language sql immutable as $$ select md5((r - 'synced_at' - 'imported_at' - 'seen_at')::text) $$;
revoke execute on function public._edit_hash(jsonb) from anon, authenticated, public;

/* _edit_key — 식은 setup-23 그대로이고 item_master 한 줄만 더했다. ⚠ 같은 줄을 setup-16·23 에도 넣어 두었다(위 머리 주석). */
create or replace function public._edit_key(p_tbl text) returns text
language sql stable set search_path = public as $$
  select case when p_tbl not like 'kr\_%' and public._is_kr() then null
         when public._cip_tbl(p_tbl) then 'id'
         else case p_tbl when 'sheet_wk'           then 'src_row'
                         when 'sheet_mat'          then 'src_row'
                         when 'sheet_inst'         then 'src_row'
                         when 'sheet_alarm'        then 'src_row'
                         when 'sheet_allbypass'    then 'src_row'
                         when 'sheet_roster'       then 'id'
                         when 'sheet_edu'          then 'id'
                         when 'sheet_leave'        then 'id'
                         when 'sheet_cip_f11'      then 'id'
                         when 'sheet_cip_f16'      then 'id'
                         when 'item_master'        then 'id'
                         when 'kr_sheet_wk'        then 'src_row'
                         when 'kr_sheet_inst'      then 'src_row'
                         when 'kr_sheet_alarm'     then 'src_row'
                         when 'kr_sheet_allbypass' then 'src_row'
                         when 'kr_sheet_roster'    then 'id'
                         when 'kr_sheet_edu'       then 'id'
                         when 'kr_sheet_leave'     then 'id' end end
$$;
revoke execute on function public._edit_key(text) from anon, authenticated, public;

notify pgrst, 'reload schema';
