-- setup-20-value-map.sql — «기준 정보»(값 사전) (v152 · 사용자 요청)
-- 왜: 사이트마다 같은 뜻을 다르게 적는다 — F16 원본은 법인 «GST TAIWAN SCRUBBER»·고객사 «Micron Memory Taiwan Co., Ltd.(F16)»,
--     F11·F16N·F16S 사이트 파일은 «TAIWAN»·«MICRON». 그대로 두면 대시보드가 다른 법인·다른 고객사로 갈라 세고(가동현황 표에 행이 따로 선다),
--     새 사이트(F16S)가 들어올 때마다 코드를 고쳐야 했다. 사용자: 「계속 이럴 때마다 유지보수 개념으로 코딩을 변경할 수는 없는 노릇」.
-- 무엇: «이 표의 이 칸에 이 값이 오면 → 이렇게 읽는다»(조건: 다른 칸 = 값 일 때만) 규칙. 원본 자료는 그대로 두고 «읽을 때» 바꾼다
--       (assets/core.js GST.vmap · 모든 화면이 지나는 fetchCSVCached 한 곳). 그래서 다시 올려도 규칙은 그대로 먹는다.
-- ⚠ tbl·col 은 «논리 표·SPEC 필드»다(inst·country) — 데모 표(kr_sheet_inst)에도 같은 규칙이 먹는다.
-- ⚠ raw '*' = 아무 값(빈칸 포함) — 조건과 함께 쓴다(예: FAB=F16S 인 행의 고객사). raw '' = 빈칸만.
-- 지우는 문장이 없다 — MCP 로 적용 가능. 다시 Run 해도 안전하다.
create table if not exists public.value_map (
  tbl        text not null,              -- 논리 표: inst · wk · mat
  col        text not null,              -- SPEC 필드: country · customer · location · fab · state …
  raw        text not null,              -- 원본 값(대소문자·앞뒤 공백 무시) · '*' 아무 값 · '' 빈칸
  when_col   text not null default '',   -- 조건 칸(SPEC 필드) — '' 면 조건 없음
  when_val   text not null default '',   -- 조건 값
  val        text not null,              -- 이렇게 읽는다
  note       text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (tbl, col, raw, when_col, when_val)
);
alter table public.value_map enable row level security;
grant select, insert, update, delete on public.value_map to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='value_map' and policyname='vmap read') then
    create policy "vmap read" on public.value_map for select to authenticated
      using ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')) );
  end if;
  -- 쓰기: 쓰기 권한자만 — 규칙은 «본 대시보드 전체»의 숫자를 바꾼다(국내 데모 운영자 kr 은 못 쓴다).
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='value_map' and policyname='vmap write') then
    create policy "vmap write" on public.value_map for all to authenticated
      using ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) )
      with check ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) );
  end if;
end $$;

-- 값 묶음 세기 — «기준 정보» 화면·업로드 점검이 «지금 표에 어떤 값이 몇 행 있나»를 본다. 읽기 전용 · RLS 그대로(security invoker).
-- 표·열은 허용 목록·실제 열 대조 뒤에만 쓴다(%I) — 아무 이름이나 SQL 에 들어가지 않는다.
create or replace function public.value_groups(p_tbl text, p_cols text[])
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare c text; sel text := ''; r jsonb;
begin
  if not (p_tbl = any (array['sheet_inst','sheet_wk','sheet_mat','kr_sheet_inst','kr_sheet_wk'])) then raise exception 'bad_table'; end if;
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
