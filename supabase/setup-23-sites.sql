-- ============================================================================
-- setup-23 — 사이트 등록부 · 사이트별 CIP 표를 «등록»으로 만든다 (v160 · 사용자 요청)
--
-- 사용자: 「신규 사이트(예: F18)가 생기면 설치현황에서 F18 은 고객사·라인·운영단위가 어디인지 초기에 정의하는 기능 ·
--   F18 에 CIP 도 설치현황에 그 사이트로 등록된 S/N 이 있으면 CIP 아이템도 추가로 정의 · 커스터마이징이 상당히 중요」.
--
-- 지금까지 CIP 는 F11·F16 두 사이트가 코드 열 군데 넘게 박혀 있었다(gid 맵 · CIP 화면 · 주간현황 · 업로드 · 데이터 관리 ·
-- 서버 허용목록 넷 · 챗봇). 새 사이트는 코드를 고치지 않으면 못 넣었다.
--
-- ⚠ CIP 를 «한 표»로 합치지 않는다 — 사이트마다 표 하나 그대로(sheet_cip_<fab>). 화면이 항목의 적용일자 띠를
--   «열마다 최초 완료일»로 되살리는데(GST._cipBand · CLAUDE.md «Import 하면 모양을 잃는다»), 한 표로 합치면 F11·F16 이
--   함께 가진 항목(예: CDA OFF Program)의 적용일이 두 사이트의 최솟값으로 바뀌어 지금 숫자가 «조용히» 움직인다.
--   합치는 것은 «등록·관리 체계»다 — 화면·업로드·데이터 관리·서버 허용목록이 전부 이 등록부에서 사이트를 읽는다.
--
-- 1절 등록부 표 · 2절 판정 함수(_cip_tbl) · 3절 CIP 표 만들기 · 4절 허용목록을 등록부로(_edit_key · import_add_cols · edit_note)
--   — 지우는 문장이 없다(MCP 로 들어간다).
-- ⚠ 5절(csv_upload_begin)은 본문에 truncate 가 있다 — MCP 가 확인 창 뒤로 보내면 사람이 SQL Editor 에서 Run 한다(v140 규약 ·
--   확인 창을 피하려고 SQL 을 고쳐 쓰지 않는다). 그 전에는 새 사이트 CIP 의 «통째 교체» 업로드만 bad_table 로 멈추고
--   (데이터 관리의 한 행·엑셀 일괄·설치현황에서 행 만들기는 된다) 업로드 화면이 그렇게 말한다.
-- ⚠ setup-17 은 «마지막에» Run 한다는 규약(v146)과 부딪힌다 — setup-17 을 다시 Run 하면 4·5절의 함수가 옛 판(F11·F16 고정)으로
--   되돌아간다. 그 뒤에 이 파일을 한 번 더 Run 한다(전부 create or replace · if not exists 라 재실행이 안전하다).
-- ============================================================================

/* ---------- 1. 등록부 ----------
 * fab        — 사이트 코드(설치현황 FAB · 실적 «라인» · 인원 «단지»가 쓰는 그 글자 · 대문자 영숫자·하이픈)
 * label      — 주간현황 CIP 축의 이름(옛 F11·F16 은 'MICRON F11' 그대로 — 바꾸면 그 축의 이름표가 움직인다)
 * op·customer·location·line·region — 그 사이트의 정의. 화면은 이 값을 «기준 정보» 규칙(value_map)으로도 남긴다(읽을 때 입힌다).
 *   여기 값만 고치고 규칙을 안 고치면 화면이 안 바뀐다 — 그래서 데이터 관리 「사이트」 탭이 두 곳을 «함께» 쓴다.
 * cip_table  — 그 사이트의 CIP 표(없으면 CIP 를 안 쓰는 사이트) */
create table if not exists public.site_registry(
  fab        text primary key check (fab ~ '^[A-Z0-9][A-Z0-9-]{0,15}$'),
  label      text,
  op         text, customer text, location text, line text,
  region     text not null default '' check (region in ('', '국내', '해외')),
  cip_table  text unique,
  note       text,
  created_by text, created_at timestamptz not null default now(),
  updated_by text, updated_at timestamptz not null default now()
);
alter table public.site_registry enable row level security;
drop policy if exists "allowed read" on public.site_registry;
create policy "allowed read" on public.site_registry for select to authenticated
  using (exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')));
drop policy if exists "allowed write" on public.site_registry;
create policy "allowed write" on public.site_registry for all to authenticated
  using (exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write))
  with check (exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write));
revoke all on public.site_registry from anon;
grant select, insert, update, delete on public.site_registry to authenticated;

-- 지금 있는 두 사이트 — 정의 칸은 비워 둔다(코드가 짐작하지 않는다 · v98). 이미 있으면 안 덮는다.
insert into public.site_registry(fab, label, cip_table, region, created_by, note) values
  ('F11', 'MICRON F11', 'sheet_cip_f11', '해외', 'setup-23', 'v160 이전부터 있던 CIP 사이트'),
  ('F16', 'MICRON F16', 'sheet_cip_f16', '해외', 'setup-23', 'v160 이전부터 있던 CIP 사이트')
on conflict (fab) do nothing;

/* ---------- 2. «등록된 CIP 표인가» — 허용목록 넷이 이 한 함수를 본다 ---------- */
create or replace function public._cip_tbl(p_tbl text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.site_registry s where s.cip_table = p_tbl)
$$;

/* ---------- 3. CIP 표 만들기 ----------
 * 기본 열(설비 칸)은 F16 표와 같은 이름 — 업로드·CIP 화면이 «이름»으로 찾는다(SPEC.cip). 점검 항목 열은 없다:
 * 항목은 사람이 정한다(데이터 관리 「사이트」 탭의 항목 더하기 · 업로드의 «새 항목»(v158) — 둘 다 import_add_cols).
 * 보안은 F11·F16 과 같다(RLS «allowed read»·«allowed write») — anon 에는 권한을 주지 않는다(옛 표보다 좁다). */
create or replace function public.cip_site_create(p_fab text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f text := upper(btrim(coalesce(p_fab, ''))); t text; cur text; r jsonb;
begin
  if coalesce(auth.jwt()->>'email', '') = '' then raise exception 'login'; end if;
  if not exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write and a.role = 'admin') then
    raise exception 'forbidden';
  end if;
  if f !~ '^[A-Z0-9][A-Z0-9-]{0,15}$' then raise exception 'bad_fab'; end if;
  select cip_table into cur from public.site_registry where fab = f;
  if cur is not null then return jsonb_build_object('table', cur, 'created', false); end if;
  t := 'sheet_cip_' || lower(replace(f, '-', '_'));
  if to_regclass('public.' || t) is not null then raise exception 'table_exists: %', t; end if;
  execute format('create table public.%I(id bigint generated always as identity primary key,
      "NO" text, "Country" text, "Customer" text, "FAB" text, "Floor" text, "area" text, "Type" text, "Model" text,
      "Model Type" text, "PJT." text, "Scrubber S/N" text, "Scrubber Code" text, "Group" text, "Detail" text,
      "FAB In" text, "Remark" text)', t);
  execute format('alter table public.%I enable row level security', t);
  execute format($p$create policy "allowed read" on public.%I for select to authenticated
      using (exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')))$p$, t);
  execute format($p$create policy "allowed write" on public.%I for all to authenticated
      using (exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write))
      with check (exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write))$p$, t);
  execute format('revoke all on public.%I from anon', t);
  execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  insert into public.site_registry(fab, label, cip_table, created_by, updated_by)
  values (f, f, t, auth.jwt()->>'email', auth.jwt()->>'email')
  on conflict (fab) do update set cip_table = excluded.cip_table, updated_by = excluded.updated_by, updated_at = now();
  insert into public.sheet_edits(gid, tbl, row_key, op, before, after, edited_by)
  values ('site', t, f, 'cip_create', null, jsonb_build_object('fab', f, 'table', t), auth.jwt()->>'email');
  notify pgrst, 'reload schema';
  return jsonb_build_object('table', t, 'created', true);
end $$;
revoke all on function public.cip_site_create(text) from public, anon;
grant execute on function public.cip_site_create(text) to authenticated;
revoke all on function public._cip_tbl(text) from public, anon, authenticated;

/* ---------- 4. 허용목록을 등록부로 ----------
 * 식은 setup-17(_edit_key · edit_note) · setup-22(import_add_cols) 그대로이고, CIP 표 판정만 _cip_tbl 로 바꿨다.
 * ⚠ setup-16·17 의 _edit_key 정의(v159 의 F11·F16 고정)보다 «나중에» Run 해야 이 판이 남는다. */
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
                         when 'kr_sheet_wk'        then 'src_row'
                         when 'kr_sheet_inst'      then 'src_row'
                         when 'kr_sheet_alarm'     then 'src_row'
                         when 'kr_sheet_allbypass' then 'src_row'
                         when 'kr_sheet_roster'    then 'id'
                         when 'kr_sheet_edu'       then 'id'
                         when 'kr_sheet_leave'     then 'id' end end
$$;
revoke execute on function public._edit_key(text) from anon, authenticated, public;

create or replace function public.import_add_cols(p_tbl text, p_cols text[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_added text[] := '{}'; v_skip jsonb := '[]'::jsonb; v_hit text;
begin
  if coalesce(auth.jwt()->>'email', '') = '' then raise exception 'login'; end if;
  if not exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write and a.role = 'admin') then
    raise exception 'forbidden';
  end if;
  if not (p_tbl in ('sheet_cip_f11', 'sheet_cip_f16') or public._cip_tbl(p_tbl)) then raise exception 'bad_table: %', p_tbl; end if;
  if coalesce(array_length(p_cols, 1), 0) = 0 or array_length(p_cols, 1) > 100 then raise exception 'bad_cols'; end if;
  foreach v_name in array p_cols loop
    v_name := btrim(regexp_replace(coalesce(v_name, ''), '\s+', ' ', 'g'));
    if v_name = '' or octet_length(v_name) > 63 or v_name ~ '[[:cntrl:]]' then
      v_skip := v_skip || jsonb_build_object('col', v_name, 'why', 'bad_name'); continue;
    end if;
    select column_name into v_hit from information_schema.columns
     where table_schema = 'public' and table_name = p_tbl and public._import_norm(column_name) = public._import_norm(v_name) limit 1;
    if v_hit is not null then
      v_skip := v_skip || jsonb_build_object('col', v_name, 'why', 'exists', 'as', v_hit); v_hit := null; continue;
    end if;
    execute format('alter table public.%I add column %I text', p_tbl, v_name);
    v_added := v_added || v_name;
  end loop;
  if array_length(v_added, 1) > 0 then
    insert into public.sheet_edits(gid, tbl, row_key, op, before, after, edited_by)
    values ('import', p_tbl, '-', 'add_cols', null, jsonb_build_object('cols', to_jsonb(v_added)), auth.jwt()->>'email');
    notify pgrst, 'reload schema';
  end if;
  return jsonb_build_object('added', to_jsonb(v_added), 'skipped', v_skip);
end $$;
revoke all on function public.import_add_cols(text, text[]) from public, anon;
grant execute on function public.import_add_cols(text, text[]) to authenticated;

create or replace function public.edit_note(p_tbl text, p_op text, p_key text, p_before jsonb, p_after jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not public._tbl_can_write(p_tbl) then raise exception 'read_only'; end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst','sheet_edu','sheet_roster','sheet_leave',
                   'sheet_cip_f11','sheet_cip_f16','sheet_abp','sheet_alarm','sheet_allbypass',
                   'kr_sheet_wk','kr_sheet_inst','kr_sheet_roster','kr_sheet_edu','kr_sheet_leave',
                   'kr_sheet_alarm','kr_sheet_allbypass') and not public._cip_tbl(p_tbl) then
    raise exception 'bad_table: %', p_tbl;
  end if;
  if p_op !~ '^(upload:(full|win|add)|dbw:(update|append|delete))$' then raise exception 'bad_op: %', p_op; end if;
  if coalesce(pg_column_size(p_before), 0) + coalesce(pg_column_size(p_after), 0) > 262144 then
    raise exception 'too_large';
  end if;
  return public._edit_log(p_tbl, coalesce(nullif(p_key, ''), '*'), p_op, p_before, p_after, null);
end $$;
revoke all on function public.edit_note(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.edit_note(text, text, text, jsonb, jsonb) to authenticated;

/* ---------- 4-b. 값 묶음(value_groups)이 인원현황도 센다 (v161) ----------
 * 「사이트」 탭이 새 사이트의 정의를 설치현황뿐 아니라 실적·인원에도 «함께» 건다 — 그 사이트로 몇 명이 잡혔는지·지금 어떤 운영단위로
 * 읽히는지를 보이려면 인원 표의 값 묶음이 필요하다. 식은 setup-20 그대로이고 허용 표에 인원 둘만 더했다(security invoker — RLS 그대로). */
create or replace function public.value_groups(p_tbl text, p_cols text[])
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare c text; sel text := ''; r jsonb;
begin
  if not (p_tbl = any (array['sheet_inst','sheet_wk','sheet_mat','kr_sheet_inst','kr_sheet_wk','sheet_roster','kr_sheet_roster'])) then raise exception 'bad_table'; end if;
  if p_cols is null or array_length(p_cols, 1) is null or array_length(p_cols, 1) > 8 then raise exception 'bad_columns'; end if;
  foreach c in array p_cols loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_tbl and column_name = c)
      then raise exception 'bad_column: %', c; end if;
    sel := sel || format('%I, ', c);
  end loop;
  execute format('select coalesce(jsonb_agg(x), ''[]''::jsonb) from (select %s count(*)::int as n from public.%I group by %s) x',
                 sel, p_tbl, left(sel, length(sel) - 2)) into r;
  return r;
end $$;
revoke all on function public.value_groups(text, text[]) from public, anon;
grant execute on function public.value_groups(text, text[]) to authenticated;

/* ---------- 5. 통째 교체가 등록된 CIP 표를 받는다 (⚠ 본문에 truncate — MCP 가 막으면 SQL Editor 에서 Run) ----------
 * setup-17 7절 그대로이고, 허용 표에 «등록된 CIP 표»만 더했다. */
create or replace function public.csv_upload_begin(p_tbl text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._tbl_can_write(p_tbl) then raise exception 'read_only'; end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst','sheet_edu','sheet_roster',
                   'sheet_leave','sheet_cip_f11','sheet_cip_f16','sheet_abp',
                   'sheet_alarm','sheet_allbypass',
                   'kr_sheet_wk','kr_sheet_inst','kr_sheet_roster','kr_sheet_edu','kr_sheet_leave',
                   'kr_sheet_alarm','kr_sheet_allbypass') and not public._cip_tbl(p_tbl) then
    raise exception 'bad_table: %', p_tbl;
  end if;
  execute format('truncate table public.%I', p_tbl);
end $$;
revoke execute on function public.csv_upload_begin(text) from public, anon;
grant  execute on function public.csv_upload_begin(text) to authenticated;
