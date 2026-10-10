-- ============================================================================
-- setup-22 — Import 표에 «새 점검 항목» 열을 더한다 (v157 · 사용자 요청)
--
-- 사용자: CIP 자체관리 양식(Site Issue 워크북의 Detail 시트)을 올리고 싶다 — 「이것도 맵핑이 될 수 있을까」.
-- CIP 는 점검 항목이 «열로» 늘어나는 표다(CLAUDE.md 「CIP — 점검 항목이 열로 늘어난다」). 업로드 화면은 표에 자리가
-- 없는 파일 열을 «올리지 않고 밝힌다»(v150) — 그래서 새 항목은 지금까지 영영 못 들어갔다. 사람이 고른 항목만
-- 표에 열로 더하는 통로가 이 함수다.
--
-- ⚠ 지우는 문장이 없다(ADD COLUMN 만) — MCP 로 바로 들어간다. 열 «지우기»는 여기 없다(사람이 SQL Editor 에서).
-- ⚠ 허용 표는 CIP 둘뿐이다 — 실적·설치(미러)는 SPEC 승격 순서가 따로 있고(v89), 인원·교육·휴가는 열이 늘 표가 아니다.
-- ⚠ 이름은 화면이 «정규화 정확일치»로 못 찾은 것만 온다. 여기서도 같은 뜻의 열이 이미 있으면 거절한다 —
--   표의 옛 열에는 줄바꿈이 들어 있어 한 줄 이름으로 그냥 더하면 같은 뜻의 열이 둘 생긴다(CLAUDE.md 실사고).
--   비교 식은 GST.SM.norm 의 SQL 판(공백·마침표·괄호·슬래시·밑줄·하이픈을 지우고 소문자) — SPEC-SYNC: assets/core.js GST.SM.norm.
-- ⚠ 63바이트를 넘는 이름은 Postgres 가 «조용히» 자른다 — 화면이 미리 잘라 보내고(GST.cmap.colName), 여기서도 넘으면 거절한다.
-- ============================================================================

create or replace function public._import_norm(p text) returns text
language sql immutable as $$ select lower(regexp_replace(coalesce(p, ''), '[[:space:].·()\[\]{}/\\_-]', '', 'g')) $$;

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
  if p_tbl not in ('sheet_cip_f11', 'sheet_cip_f16') then raise exception 'bad_table: %', p_tbl; end if;
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

revoke all on function public._import_norm(text) from public, anon;
grant execute on function public._import_norm(text) to authenticated;
revoke all on function public.import_add_cols(text, text[]) from public, anon;
grant execute on function public.import_add_cols(text, text[]) to authenticated;
