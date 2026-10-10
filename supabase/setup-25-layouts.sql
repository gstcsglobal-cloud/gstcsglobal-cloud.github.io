-- ============================================================================
-- setup-25 — 분석 작업대: 내가 만든 차트 보드를 저장한다 (v168 · 사용자 요청 「통합관리화면」 4단계)
--
-- 분석 작업대(/studio/)는 사람이 표 · 축 · 값 · 거르기를 골라 차트를 만들고, 그 차트들을 «보드»로 묶어 저장한다.
-- 보드는 «설정»(어느 표의 어느 열을 어떻게 셌나)만 담는다 — 숫자는 담지 않는다. 그래서 열 때마다 지금 자료로 다시 그린다.
--
-- ⚠ 지우지 않는다 — 감춘다(removed). 그래서 이 파일에는 지우는 문장이 없다(MCP 로 들어간다 · 정책도 drop 없이 «없으면 만든다»).
-- ⚠ 쓰기는 함수만(layout_save · layout_remove) — 표에는 읽기 정책뿐이다. 남의 보드는 고칠 수 없다(owner 를 토큰에서 읽는다).
-- 조회자(viewer)도 «자기» 보드는 저장한다 — 화면을 바꾸는 일이 아니라 자기 작업대를 정리하는 일이다.
-- ============================================================================

create table if not exists public.user_layouts(
  id          bigint generated always as identity primary key,
  owner       text not null,
  name        text not null check (length(btrim(name)) between 1 and 80),
  config      jsonb not null default '{}'::jsonb,
  shared      boolean not null default false,
  removed     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists user_layouts_owner on public.user_layouts(lower(owner), updated_at desc);

/* 읽기 — 허용 사용자 중 «내 것» 또는 «공유한 것». 감춘 보드는 안 보인다. */
alter table public.user_layouts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_layouts' and policyname='own or shared read') then
    create policy "own or shared read" on public.user_layouts for select to authenticated
      using (not removed
             and exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email'))
             and (shared or lower(owner) = lower(auth.jwt()->>'email')));
  end if;
end $$;
revoke all on public.user_layouts from anon, authenticated;
grant select on public.user_layouts to authenticated;

/* 저장 — p_id 가 없으면 새 보드, 있으면 «내 것»만 고친다. 설정은 64KB 까지(차트 설정만 담는다 — 자료가 섞이면 이 한도에서 멈춘다). */
create or replace function public.layout_save(p_id bigint, p_name text, p_config jsonb, p_shared boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt()->>'email','')); nid bigint;
begin
  if me = '' then raise exception 'login'; end if;
  if not exists (select 1 from public.allowed_users a where lower(a.email) = me) then raise exception 'forbidden'; end if;
  if length(btrim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'bad_name'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'bad_config'; end if;
  if octet_length(p_config::text) > 65536 then raise exception 'too_big'; end if;
  if p_id is null then
    insert into public.user_layouts(owner, name, config, shared) values (me, btrim(p_name), p_config, coalesce(p_shared,false)) returning id into nid;
    return jsonb_build_object('id', nid, 'created', true);
  end if;
  update public.user_layouts set name = btrim(p_name), config = p_config, shared = coalesce(p_shared,false), updated_at = now()
   where id = p_id and lower(owner) = me and not removed;
  if not found then raise exception 'not_yours'; end if;
  return jsonb_build_object('id', p_id, 'created', false);
end $$;

/* 감추기 — 내 것만. 되살리기는 SQL Editor 에서 removed=false (화면에는 두지 않는다). */
create or replace function public.layout_remove(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if me = '' then raise exception 'login'; end if;
  update public.user_layouts set removed = true, updated_at = now() where id = p_id and lower(owner) = me and not removed;
  if not found then raise exception 'not_yours'; end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.layout_save(bigint,text,jsonb,boolean) from public, anon;
revoke all on function public.layout_remove(bigint) from public, anon;
grant execute on function public.layout_save(bigint,text,jsonb,boolean) to authenticated;
grant execute on function public.layout_remove(bigint) to authenticated;
notify pgrst, 'reload schema';
