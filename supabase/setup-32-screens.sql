-- ============================================================================
-- setup-32 — 화면 편집 (v202 · 사용자 요청 「다른 페이지들도 전부 커스터마이징」 · 「실제 대시보드에 구현」)
--
-- 두 가지를 담는다.
--   ① 기존 화면의 카드 배치 — screen_layouts. 「고장 분석」 같은 기존 화면에서 카드의 순서 · 숨김 · 전체 폭 · 표시 제목.
--      ⚠ 담는 것은 «배치»뿐이다. 카드의 계산 · 필터 · 세부내역 · 내보내기는 화면 코드가 그대로 한다(core GST.screen).
--      범위 둘 — owner '' = 전체 사용자 기본 배치(관리자 + 쓰기 권한) · owner = 이메일 = 그 사람 화면에만(로그인한 허용 사용자 누구나).
--      화면은 «내 배치 > 전체 기본 > 원래 배치» 순으로 고른다.
--   ② 새 화면(맞춤 분석 보드)의 게시 — user_layouts.pub. 게시한 보드는 셸의 탭 메뉴(또는 더보기)에 선다.
--      ⚠ 공개 범위(vis)는 «화면에 탭을 세울지»를 정하는 표시 규칙이다. 보드 내용(설정)은 공유한 보드라 RLS 상 허용 사용자가 읽을 수 있고,
--        보드가 그리는 숫자는 원래 표의 RLS 를 그대로 지난다 — 게시가 자료 권한을 넓히지 않는다.
--
-- ⚠ 지우는 문장이 없다 — «원래대로»는 removed=true 로 감춘다(MCP 로 들어간다 · v140 확인 창 규약).
-- ⚠ 쓰기는 함수만 — 표에는 읽기 정책뿐이다(직접 고치면 남의 배치를 덮어도 아무도 모른다).
-- ============================================================================

/* ---------- 1. 기존 화면 배치 ---------- */
create table if not exists public.screen_layouts(
  page        text not null check (page ~ '^[a-z][a-z0-9_-]{0,31}$'),
  owner       text not null default '',
  config      jsonb not null default '{}'::jsonb,
  removed     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default '',
  primary key (page, owner)
);

alter table public.screen_layouts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='screen_layouts' and policyname='screen read') then
    create policy "screen read" on public.screen_layouts for select to authenticated
      using (not removed
             and exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email'))
             and (owner = '' or lower(owner) = lower(auth.jwt()->>'email')));
  end if;
end $$;
revoke all on public.screen_layouts from anon, authenticated;
grant select on public.screen_layouts to authenticated;

/* 저장 · 원래대로 — p_scope 'all'(전체 사용자 기본 · 관리자) | 'me'(내 화면).
   p_config null = 원래대로(감춘다). p_at = 화면이 읽은 그 배치의 updated_at — 다르면 conflict(남의 변경을 덮지 않는다).
   새로 만들 때(읽은 배치 없음)는 null — 그새 누가 만들었으면 conflict. */
create or replace function public.screen_layout_save(p_page text, p_scope text, p_config jsonb, p_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt()->>'email','')); v_owner text; cur public.screen_layouts%rowtype; v_now timestamptz := now();
begin
  if me = '' then return jsonb_build_object('ok',false,'error','login'); end if;
  if not exists (select 1 from public.allowed_users a where lower(a.email) = me) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if p_page is null or p_page !~ '^[a-z][a-z0-9_-]{0,31}$' then return jsonb_build_object('ok',false,'error','bad_page'); end if;
  if p_scope = 'all' then
    if public._tgt_who() is null then return jsonb_build_object('ok',false,'error','forbidden'); end if;
    v_owner := '';
  elsif p_scope = 'me' then v_owner := me;
  else return jsonb_build_object('ok',false,'error','bad_scope'); end if;
  if p_config is not null and (jsonb_typeof(p_config) <> 'object' or octet_length(p_config::text) > 32768) then
    return jsonb_build_object('ok',false,'error','bad_config'); end if;

  select * into cur from public.screen_layouts where page = p_page and owner = v_owner for update;
  if found and not cur.removed then
    if p_at is null or cur.updated_at <> p_at then return jsonb_build_object('ok',false,'error','conflict','at',cur.updated_at); end if;
  elsif p_at is not null and found and cur.removed and cur.updated_at <> p_at then
    return jsonb_build_object('ok',false,'error','conflict','at',cur.updated_at);
  end if;

  if p_config is null then
    if not found or cur.removed then return jsonb_build_object('ok',true,'at',null); end if;
    update public.screen_layouts set removed = true, updated_at = v_now, updated_by = me where page = p_page and owner = v_owner;
  else
    insert into public.screen_layouts(page, owner, config, removed, updated_at, updated_by)
    values (p_page, v_owner, p_config, false, v_now, me)
    on conflict (page, owner) do update set config = excluded.config, removed = false, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  end if;

  /* 전체 기본 배치만 이력에 남긴다 — 모두의 화면이 바뀌는 일이라 «누가 언제» 가 필요하다. 개인 배치는 그 사람 화면의 일이다. */
  if v_owner = '' then
    insert into public.sheet_edits(gid,row_key,op,before,after,edited_by,edited_at,tbl)
    values ('screen', p_page, case when p_config is null then 'screen_reset' else 'screen_save' end,
            case when found and not cur.removed then jsonb_build_object('n', jsonb_array_length(coalesce(cur.config->'order','[]'::jsonb)), 'hidden', coalesce(cur.config->'hidden','[]'::jsonb)) end,
            case when p_config is null then null else jsonb_build_object('n', jsonb_array_length(coalesce(p_config->'order','[]'::jsonb)), 'hidden', coalesce(p_config->'hidden','[]'::jsonb)) end,
            me, v_now, 'screen_layouts');
  end if;
  return jsonb_build_object('ok',true,'at',case when p_config is null then null else v_now end);
end $$;

/* ---------- 2. 새 화면(맞춤 분석 보드)의 게시 ---------- */
alter table public.user_layouts add column if not exists pub jsonb;

/* 게시 · 게시 취소 — 관리자 + 쓰기 권한. p_pub = {tab:탭 이름, vis:'all'|'staff'|'admin', place:'tab'|'more'} · null = 게시 취소.
   게시하면 shared 를 켠다 — 다른 사람이 보드 설정을 읽을 수 있어야 탭이 선다(layout_save 가 shared 를 끄면 탭도 저절로 사라진다). */
create or replace function public.board_publish(p_id bigint, p_pub jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := public._tgt_who(); v_tab text;
begin
  if me is null then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if p_pub is not null then
    if jsonb_typeof(p_pub) <> 'object' then return jsonb_build_object('ok',false,'error','bad_pub'); end if;
    v_tab := btrim(coalesce(p_pub->>'tab',''));
    if length(v_tab) not between 1 and 40 then return jsonb_build_object('ok',false,'error','bad_tab'); end if;
    if coalesce(p_pub->>'vis','') not in ('all','staff','admin') then return jsonb_build_object('ok',false,'error','bad_vis'); end if;
    if coalesce(p_pub->>'place','') not in ('tab','more') then return jsonb_build_object('ok',false,'error','bad_place'); end if;
    update public.user_layouts
       set pub = jsonb_build_object('tab',v_tab,'vis',p_pub->>'vis','place',p_pub->>'place','at',now(),'by',lower(me)),
           shared = true, updated_at = now()
     where id = p_id and not removed;
  else
    update public.user_layouts set pub = null, updated_at = now() where id = p_id and not removed;
  end if;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  insert into public.sheet_edits(gid,row_key,op,before,after,edited_by,edited_at,tbl)
  values ('screen', 'board:'||p_id, case when p_pub is null then 'board_unpublish' else 'board_publish' end, null, p_pub, lower(me), now(), 'user_layouts');
  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.screen_layout_save(text,text,jsonb,timestamptz) from public, anon;
revoke all on function public.board_publish(bigint,jsonb) from public, anon;
grant execute on function public.screen_layout_save(text,text,jsonb,timestamptz) to authenticated;
grant execute on function public.board_publish(bigint,jsonb) to authenticated;
notify pgrst, 'reload schema';
