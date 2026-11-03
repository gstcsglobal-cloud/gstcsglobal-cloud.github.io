-- ============================================================================
-- setup-33 — 알림 발송 · 화면 버전 · 사용자 정의 지표 · 사건 주석 · 북마크 (v207 · 사용자 요청)
--
-- 사용자: 「관리 페이지에서 발송하고자 하는 이메일을 등록하고, 지정된 시각 또는 발송 빈도를 조정할 수 있다면 OK —
--          막 아무한테나 보내면 안 되니까」 · 「카톡도 등록 사용자 리스트를 웹 관리 화면에서 볼 수 있게 하고 보내는 사람들을 선택해서」.
--
-- 1. 알림 수신자(notify_subs) — 관리자(_tgt_who)가 «한 사람씩» 등록한다. 등록된 사람에게만 간다.
--    채널 둘: email(주소 그대로) · kakao(카톡 챗봇에서 이메일 인증을 마친 사람 — target 은 그 이메일, 보낼 때 bot_user_key 로 찾는다).
--    ⚠ bot_user_key 는 브라우저에 내보내지 않는다 — 화면은 «인증된 이메일»로 고르고, 키는 엣지펑션(서버 키)만 본다.
-- 2. 발송 이력(notify_log) · 카톡 대기함(kakao_outbox — 챗봇 이벤트 블록이 «내게 온 알림»을 꺼내 보인다).
-- 3. 화면 버전(layout_hist) — 화면 배치(screen_layouts)와 새 화면(user_layouts)이 바뀔 때마다 트리거가 그때 설정을 남긴다.
--    저장 함수(screen_layout_save · layout_save)는 한 글자도 안 고쳤다 — 트리거가 옆에서 남긴다.
-- 4. 사용자 정의 지표(custom_metrics) — 화면 만들기에서 «값·식»을 이름 붙여 저장하고 다른 차트·화면에서 다시 쓴다.
-- 5. 사건 주석(chart_notes) — 날짜가 있는 차트에 «무슨 일이 있었나»(교체 캠페인·설비 이설…)를 세로선으로.
-- 6. 북마크(user_bookmarks) — 탭 · 섹션 · 상세 필터를 이름 붙여 저장한다.
--
-- ⚠ 지우는 문장이 없다 — 전부 removed=true 로 감춘다(MCP 로 들어간다 · v140 확인 창 규약).
-- ⚠ 쓰기는 함수만 — 표에는 읽기 정책뿐이거나(4·5·6) 정책이 아예 없다(1·2 — 관리자 함수로만 읽는다).
-- 선행: setup-24(_act_who) · setup-25(user_layouts) · setup-27(_tgt_who) · setup-32(screen_layouts).
-- ============================================================================

/* ---------- 1. 알림 수신자 · 이력 · 카톡 대기함 ---------- */
create table if not exists public.notify_subs(
  id           bigint generated always as identity primary key,
  channel      text not null check (channel in ('email','kakao')),
  target       text not null check (target ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  label        text check (label is null or length(label) <= 60),
  enabled      boolean not null default true,
  freq         text not null default 'weekly' check (freq in ('daily','weekdays','weekly','monthly')),
  hour         int  not null default 8 check (hour between 0 and 23),         -- 한국 시각(KST)
  dow          int  not null default 1 check (dow between 0 and 6),            -- weekly: 0=일 … 6=토
  dom          int  not null default 1 check (dom between 1 and 28),           -- monthly
  scope        text not null default 'all' check (scope ~ '^(all|r:.+|o:.+)$'), -- brief_snap 범위 열쇠와 같다
  kinds        text[] not null default array['brief','actions']::text[],
  last_sent_at timestamptz,
  removed      boolean not null default false,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_by   text,
  updated_at   timestamptz not null default now()
);
create unique index if not exists notify_subs_one on public.notify_subs(channel, lower(target), scope) where not removed;

create table if not exists public.notify_log(
  id       bigint generated always as identity primary key,
  sub_id   bigint,
  channel  text not null,
  target   text not null,
  kind     text not null default 'sched' check (kind in ('sched','test','now')),
  ok       boolean not null,
  error    text,
  summary  text,
  who      text,
  at       timestamptz not null default now()
);
create index if not exists notify_log_at on public.notify_log(at desc);

/* 카톡 대기함 — 이벤트 API 는 «이 사람에게 이벤트 블록을 띄워라»만 보낸다. 그 블록의 스킬(notify-send ?op=event)이
   그 사람의 «아직 안 보인» 알림을 꺼내 보인다. 글을 이벤트 본문에만 싣지 않는 이유 — 블록 설정 문법에 기대지 않는다. */
create table if not exists public.kakao_outbox(
  id            bigint generated always as identity primary key,
  bot_user_key  text not null,
  sub_id        bigint,
  text          text not null check (length(text) between 1 and 1000),
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz
);
create index if not exists kakao_outbox_pending on public.kakao_outbox(bot_user_key, created_at) where delivered_at is null;

/* 정책 없음 = 서버 키만 읽는다. 화면은 notify_admin() 으로 읽는다(관리자만). */
alter table public.notify_subs  enable row level security;
alter table public.notify_log   enable row level security;
alter table public.kakao_outbox enable row level security;
revoke all on public.notify_subs, public.notify_log, public.kakao_outbox from anon, authenticated;

/* 관리 화면 한 번에 — 수신자 · 카톡 인증 사용자(이메일만 · 키는 안 내보낸다) · 허용 사용자 · 최근 이력 60줄 */
create or replace function public.notify_admin() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me text := public._tgt_who();
begin
  if me is null then return jsonb_build_object('error','forbidden'); end if;
  return jsonb_build_object(
    'subs', coalesce((select jsonb_agg(to_jsonb(s) order by s.channel, lower(s.target), s.id) from public.notify_subs s where not s.removed), '[]'::jsonb),
    'kakao', coalesce((select jsonb_agg(jsonb_build_object('email', lower(k.email), 'verified_at', max_v, 'n', n,
                         'allowed', exists(select 1 from public.allowed_users a where lower(a.email) = lower(k.email))) order by lower(k.email))
                       from (select lower(email) email, max(verified_at) max_v, count(*) n from public.kakao_users
                              where status = 'verified' and email is not null group by lower(email)) k), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('email', lower(a.email), 'role', a.role, 'note', a.note) order by lower(a.email)) from public.allowed_users a), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(to_jsonb(l) order by l.at desc) from (select * from public.notify_log order by at desc limit 60) l), '[]'::jsonb));
end $$;

/* 저장 — p_id null = 새 수신자. p_at = 화면이 읽은 updated_at(다르면 conflict). 이력은 sheet_edits(gid notify).
   ⚠ 카톡은 «챗봇에서 이메일 인증을 마친 사람»만 — 인증 안 된 이메일로는 보낼 방법도 없다. */
create or replace function public.notify_save(p_id bigint, p_set jsonb, p_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := public._tgt_who(); cur public.notify_subs; v_ch text; v_tg text; v_now timestamptz := now(); nid bigint; k text;
begin
  if me is null then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if p_set is null or jsonb_typeof(p_set) <> 'object' then return jsonb_build_object('ok',false,'error','bad_set'); end if;
  if p_id is not null then
    select * into cur from public.notify_subs where id = p_id and not removed for update;
    if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
    if p_at is null or cur.updated_at <> p_at then return jsonb_build_object('ok',false,'error','conflict','at',cur.updated_at); end if;
  end if;
  v_ch := coalesce(p_set->>'channel', cur.channel);
  v_tg := lower(btrim(coalesce(p_set->>'target', cur.target, '')));
  if v_ch is null or v_ch not in ('email','kakao') then return jsonb_build_object('ok',false,'error','bad_channel'); end if;
  if v_tg !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok',false,'error','bad_target'); end if;
  if v_ch = 'kakao' and not exists (select 1 from public.kakao_users u where lower(u.email) = v_tg and u.status = 'verified') then
    return jsonb_build_object('ok',false,'error','kakao_not_verified'); end if;
  if p_set ? 'freq' and coalesce(p_set->>'freq','') not in ('daily','weekdays','weekly','monthly') then return jsonb_build_object('ok',false,'error','bad_freq'); end if;
  if p_set ? 'hour' and ((p_set->>'hour') !~ '^\d{1,2}$' or (p_set->>'hour')::int > 23) then return jsonb_build_object('ok',false,'error','bad_hour'); end if;
  if p_set ? 'dow' and ((p_set->>'dow') !~ '^\d$' or (p_set->>'dow')::int > 6) then return jsonb_build_object('ok',false,'error','bad_dow'); end if;
  if p_set ? 'dom' and ((p_set->>'dom') !~ '^\d{1,2}$' or (p_set->>'dom')::int not between 1 and 28) then return jsonb_build_object('ok',false,'error','bad_dom'); end if;
  if p_set ? 'scope' and coalesce(p_set->>'scope','') !~ '^(all|r:.+|o:.+)$' then return jsonb_build_object('ok',false,'error','bad_scope'); end if;
  if p_set ? 'kinds' then
    if jsonb_typeof(p_set->'kinds') <> 'array' or jsonb_array_length(p_set->'kinds') = 0 then return jsonb_build_object('ok',false,'error','bad_kinds'); end if;
    for k in select jsonb_array_elements_text(p_set->'kinds') loop
      if k not in ('brief','actions','mine') then return jsonb_build_object('ok',false,'error','bad_kinds'); end if;
    end loop;
  end if;
  begin
    if p_id is null then
      insert into public.notify_subs(channel, target, label, enabled, freq, hour, dow, dom, scope, kinds, created_by, updated_by, updated_at)
      values (v_ch, v_tg, nullif(btrim(coalesce(p_set->>'label','')),''), coalesce((p_set->>'enabled')::boolean, true),
              coalesce(p_set->>'freq','weekly'), coalesce((p_set->>'hour')::int, 8), coalesce((p_set->>'dow')::int, 1), coalesce((p_set->>'dom')::int, 1),
              coalesce(p_set->>'scope','all'),
              coalesce((select array_agg(x) from jsonb_array_elements_text(p_set->'kinds') x), array['brief','actions']::text[]),
              lower(me), lower(me), v_now)
      returning id into nid;
    else
      update public.notify_subs set channel = v_ch, target = v_tg,
        label = case when p_set ? 'label' then nullif(btrim(coalesce(p_set->>'label','')),'') else label end,
        enabled = coalesce((p_set->>'enabled')::boolean, enabled),
        freq = coalesce(p_set->>'freq', freq), hour = coalesce((p_set->>'hour')::int, hour),
        dow = coalesce((p_set->>'dow')::int, dow), dom = coalesce((p_set->>'dom')::int, dom),
        scope = coalesce(p_set->>'scope', scope),
        kinds = coalesce((select array_agg(x) from jsonb_array_elements_text(p_set->'kinds') x), kinds),
        updated_by = lower(me), updated_at = v_now
       where id = p_id;
      nid := p_id;
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok',false,'error','duplicate');
  end;
  insert into public.sheet_edits(gid,row_key,op,before,after,edited_by,edited_at,tbl)
  values ('notify', nid::text, case when p_id is null then 'notify_add' else 'notify_set' end,
          case when p_id is null then null else to_jsonb(cur) end, p_set, lower(me), v_now, 'notify_subs');
  return jsonb_build_object('ok',true,'id',nid,'at',v_now);
end $$;

/* 빼기 — 감춘다. 같은 사람을 다시 등록할 수 있다(유일 색인이 «살아 있는 행»만 본다). */
create or replace function public.notify_remove(p_id bigint, p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := public._tgt_who(); cur public.notify_subs;
begin
  if me is null then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  select * into cur from public.notify_subs where id = p_id and not removed for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if p_at is null or cur.updated_at <> p_at then return jsonb_build_object('ok',false,'error','conflict','at',cur.updated_at); end if;
  update public.notify_subs set removed = true, updated_by = lower(me), updated_at = now() where id = p_id;
  insert into public.sheet_edits(gid,row_key,op,before,after,edited_by,edited_at,tbl)
  values ('notify', p_id::text, 'notify_remove', to_jsonb(cur), null, lower(me), now(), 'notify_subs');
  return jsonb_build_object('ok',true);
end $$;

/* ---------- 2. 화면 버전 — 트리거가 «바뀐 설정»을 남긴다 ---------- */
create table if not exists public.layout_hist(
  id      bigint generated always as identity primary key,
  kind    text not null check (kind in ('screen','board')),
  ref     text not null,              -- screen: page|owner('' = 전체 기본) · board: 보드 번호
  config  jsonb,                      -- null = 원래대로(감춤)
  who     text,
  at      timestamptz not null default now()
);
create index if not exists layout_hist_ref on public.layout_hist(kind, ref, at desc);
alter table public.layout_hist enable row level security;
revoke all on public.layout_hist from anon, authenticated;

create or replace function public._layout_hist_screen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.config is not distinct from old.config and new.removed = old.removed then return new; end if;
  insert into public.layout_hist(kind, ref, config, who, at)
  values ('screen', new.page||'|'||new.owner, case when new.removed then null else new.config end, new.updated_by, new.updated_at);
  return new;
end $$;
create or replace function public._layout_hist_board() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.config is not distinct from old.config and new.removed = old.removed then return new; end if;
  insert into public.layout_hist(kind, ref, config, who, at)
  values ('board', new.id::text, case when new.removed then null else new.config end, lower(new.owner), new.updated_at);
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'screen_layouts_hist') then
    create trigger screen_layouts_hist after insert or update on public.screen_layouts for each row execute function public._layout_hist_screen();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'user_layouts_hist') then
    create trigger user_layouts_hist after insert or update on public.user_layouts for each row execute function public._layout_hist_board();
  end if;
end $$;

/* 버전 목록 · 한 버전 — 읽을 수 있는 배치·보드만(전체 기본 = 허용 사용자 누구나 · 내 배치 = 나 · 보드 = 내 것 또는 공유). */
create or replace function public._layout_hist_ok(p_kind text, p_ref text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt()->>'email','')); v_owner text;
begin
  if me = '' or not exists (select 1 from public.allowed_users a where lower(a.email) = me) then return false; end if;
  if p_kind = 'screen' then
    v_owner := split_part(p_ref, '|', 2);
    return v_owner = '' or lower(v_owner) = me;
  elsif p_kind = 'board' and p_ref ~ '^\d+$' then
    return exists (select 1 from public.user_layouts u where u.id = p_ref::bigint and (u.shared or lower(u.owner) = me));
  end if;
  return false;
end $$;
create or replace function public.layout_versions(p_kind text, p_ref text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._layout_hist_ok(p_kind, p_ref) then return jsonb_build_object('error','forbidden'); end if;
  return jsonb_build_object('list', coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'at',h.at,'by',h.who,'reset',h.config is null,
            'n', case when h.config is null then 0 else coalesce(jsonb_array_length(coalesce(h.config->'order', h.config->'widgets')),0) end) order by h.at desc)
          from (select * from public.layout_hist where kind = p_kind and ref = p_ref order by at desc limit 40) h), '[]'::jsonb));
end $$;
create or replace function public.layout_version(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h public.layout_hist;
begin
  select * into h from public.layout_hist where id = p_id;
  if not found or not public._layout_hist_ok(h.kind, h.ref) then return jsonb_build_object('error','forbidden'); end if;
  return jsonb_build_object('id',h.id,'at',h.at,'by',h.who,'config',h.config);
end $$;

/* ---------- 3·4·5. 사용자 정의 지표 · 사건 주석 · 북마크 ---------- */
create table if not exists public.custom_metrics(
  id         bigint generated always as identity primary key,
  owner      text not null,
  name       text not null check (length(btrim(name)) between 1 and 60),
  src        text not null check (src ~ '^[a-z][a-z0-9_]{0,23}$'),
  def        jsonb not null check (jsonb_typeof(def) = 'object' and octet_length(def::text) <= 8192),
  shared     boolean not null default true,
  removed    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.chart_notes(
  id         bigint generated always as identity primary key,
  owner      text not null,
  page       text not null default '*' check (page = '*' or page ~ '^[a-z][a-z0-9_-]{0,31}$'),
  d          date not null,
  d2         date,
  text       text not null check (length(btrim(text)) between 1 and 80),
  tone       text not null default 'info' check (tone in ('info','ok','warn')),
  shared     boolean not null default true,
  removed    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (d2 is null or d2 >= d)
);
create table if not exists public.user_bookmarks(
  id         bigint generated always as identity primary key,
  owner      text not null,
  name       text not null check (length(btrim(name)) between 1 and 60),
  tab        text not null check (tab ~ '^[a-z][a-z0-9_-]{0,31}$'),
  sec        text check (sec is null or sec ~ '^[A-Za-z0-9_-]{1,40}$'),
  state      jsonb check (state is null or (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 8192)),
  shared     boolean not null default false,
  removed    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.custom_metrics enable row level security;
alter table public.chart_notes enable row level security;
alter table public.user_bookmarks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='custom_metrics' and policyname='own or shared read') then
    create policy "own or shared read" on public.custom_metrics for select to authenticated
      using (not removed and exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email'))
             and (shared or lower(owner) = lower(auth.jwt()->>'email')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chart_notes' and policyname='own or shared read') then
    create policy "own or shared read" on public.chart_notes for select to authenticated
      using (not removed and exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email'))
             and (shared or lower(owner) = lower(auth.jwt()->>'email')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_bookmarks' and policyname='own or shared read') then
    create policy "own or shared read" on public.user_bookmarks for select to authenticated
      using (not removed and exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email'))
             and (shared or lower(owner) = lower(auth.jwt()->>'email')));
  end if;
end $$;
revoke all on public.custom_metrics, public.chart_notes, public.user_bookmarks from anon, authenticated;
grant select on public.custom_metrics, public.chart_notes, public.user_bookmarks to authenticated;

/* 공용 저장 규칙 — 내 것만 고친다(관리자는 공유된 것도). 공유는: 지표 = 누구나 · 주석 = 조치 사항을 쓰는 사람(_act_who) · 북마크 = 관리자. */
create or replace function public.metric_save(p_id bigint, p_name text, p_src text, p_def jsonb, p_shared boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt()->>'email','')); nid bigint;
begin
  if me = '' or not exists (select 1 from public.allowed_users a where lower(a.email) = me) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if length(btrim(coalesce(p_name,''))) not between 1 and 60 then return jsonb_build_object('ok',false,'error','bad_name'); end if;
  if coalesce(p_src,'') !~ '^[a-z][a-z0-9_]{0,23}$' then return jsonb_build_object('ok',false,'error','bad_src'); end if;
  if p_def is null or jsonb_typeof(p_def) <> 'object' or octet_length(p_def::text) > 8192 then return jsonb_build_object('ok',false,'error','bad_def'); end if;
  if p_id is null then
    insert into public.custom_metrics(owner, name, src, def, shared) values (me, btrim(p_name), p_src, p_def, coalesce(p_shared,true)) returning id into nid;
  else
    update public.custom_metrics set name = btrim(p_name), src = p_src, def = p_def, shared = coalesce(p_shared,true), updated_at = now()
     where id = p_id and not removed and (lower(owner) = me or public._tgt_who() is not null);
    if not found then return jsonb_build_object('ok',false,'error','not_yours'); end if;
    nid := p_id;
  end if;
  return jsonb_build_object('ok',true,'id',nid);
end $$;
create or replace function public.note_save(p_id bigint, p_page text, p_d date, p_d2 date, p_text text, p_tone text default 'info', p_shared boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt()->>'email','')); nid bigint;
begin
  if me = '' or not exists (select 1 from public.allowed_users a where lower(a.email) = me) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if coalesce(p_shared,true) and public._act_who() is null then return jsonb_build_object('ok',false,'error','forbidden_shared'); end if;
  if coalesce(p_page,'*') <> '*' and p_page !~ '^[a-z][a-z0-9_-]{0,31}$' then return jsonb_build_object('ok',false,'error','bad_page'); end if;
  if p_d is null or (p_d2 is not null and p_d2 < p_d) then return jsonb_build_object('ok',false,'error','bad_date'); end if;
  if length(btrim(coalesce(p_text,''))) not between 1 and 80 then return jsonb_build_object('ok',false,'error','bad_text'); end if;
  if coalesce(p_tone,'info') not in ('info','ok','warn') then return jsonb_build_object('ok',false,'error','bad_tone'); end if;
  if p_id is null then
    insert into public.chart_notes(owner, page, d, d2, text, tone, shared) values (me, coalesce(p_page,'*'), p_d, p_d2, btrim(p_text), coalesce(p_tone,'info'), coalesce(p_shared,true)) returning id into nid;
  else
    update public.chart_notes set page = coalesce(p_page,'*'), d = p_d, d2 = p_d2, text = btrim(p_text), tone = coalesce(p_tone,'info'), shared = coalesce(p_shared,true), updated_at = now()
     where id = p_id and not removed and (lower(owner) = me or public._tgt_who() is not null);
    if not found then return jsonb_build_object('ok',false,'error','not_yours'); end if;
    nid := p_id;
  end if;
  return jsonb_build_object('ok',true,'id',nid);
end $$;
create or replace function public.bm_save(p_id bigint, p_name text, p_tab text, p_sec text, p_state jsonb, p_shared boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt()->>'email','')); nid bigint;
begin
  if me = '' or not exists (select 1 from public.allowed_users a where lower(a.email) = me) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if coalesce(p_shared,false) and public._tgt_who() is null then return jsonb_build_object('ok',false,'error','forbidden_shared'); end if;
  if length(btrim(coalesce(p_name,''))) not between 1 and 60 then return jsonb_build_object('ok',false,'error','bad_name'); end if;
  if coalesce(p_tab,'') !~ '^[a-z][a-z0-9_-]{0,31}$' then return jsonb_build_object('ok',false,'error','bad_tab'); end if;
  if p_sec is not null and p_sec !~ '^[A-Za-z0-9_-]{1,40}$' then return jsonb_build_object('ok',false,'error','bad_sec'); end if;
  if p_state is not null and (jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 8192) then return jsonb_build_object('ok',false,'error','bad_state'); end if;
  if p_id is null then
    insert into public.user_bookmarks(owner, name, tab, sec, state, shared) values (me, btrim(p_name), p_tab, p_sec, p_state, coalesce(p_shared,false)) returning id into nid;
  else
    update public.user_bookmarks set name = btrim(p_name), tab = p_tab, sec = p_sec, state = p_state, shared = coalesce(p_shared,false), updated_at = now()
     where id = p_id and not removed and (lower(owner) = me or public._tgt_who() is not null);
    if not found then return jsonb_build_object('ok',false,'error','not_yours'); end if;
    nid := p_id;
  end if;
  return jsonb_build_object('ok',true,'id',nid);
end $$;
/* 감추기 — 표 이름은 허용목록에서만 고른다(동적 SQL 이 아니다). */
create or replace function public.mine_remove(p_kind text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt()->>'email','')); adm boolean := public._tgt_who() is not null;
begin
  if me = '' then return jsonb_build_object('ok',false,'error','login'); end if;
  if p_kind = 'metric' then
    update public.custom_metrics set removed = true, updated_at = now() where id = p_id and not removed and (lower(owner) = me or adm);
  elsif p_kind = 'note' then
    update public.chart_notes set removed = true, updated_at = now() where id = p_id and not removed and (lower(owner) = me or adm);
  elsif p_kind = 'bookmark' then
    update public.user_bookmarks set removed = true, updated_at = now() where id = p_id and not removed and (lower(owner) = me or adm);
  else return jsonb_build_object('ok',false,'error','bad_kind'); end if;
  if not found then return jsonb_build_object('ok',false,'error','not_yours'); end if;
  return jsonb_build_object('ok',true);
end $$;

/* ---------- 6. 권한 ---------- */
revoke all on function public.notify_admin() from public, anon;
revoke all on function public.notify_save(bigint,jsonb,timestamptz) from public, anon;
revoke all on function public.notify_remove(bigint,timestamptz) from public, anon;
revoke all on function public._layout_hist_screen() from public, anon, authenticated;
revoke all on function public._layout_hist_board() from public, anon, authenticated;
revoke all on function public._layout_hist_ok(text,text) from public, anon, authenticated;
revoke all on function public.layout_versions(text,text) from public, anon;
revoke all on function public.layout_version(bigint) from public, anon;
revoke all on function public.metric_save(bigint,text,text,jsonb,boolean) from public, anon;
revoke all on function public.note_save(bigint,text,date,date,text,text,boolean) from public, anon;
revoke all on function public.bm_save(bigint,text,text,text,jsonb,boolean) from public, anon;
revoke all on function public.mine_remove(text,bigint) from public, anon;
grant execute on function public.notify_admin() to authenticated;
grant execute on function public.notify_save(bigint,jsonb,timestamptz) to authenticated;
grant execute on function public.notify_remove(bigint,timestamptz) to authenticated;
grant execute on function public.layout_versions(text,text) to authenticated;
grant execute on function public.layout_version(bigint) to authenticated;
grant execute on function public.metric_save(bigint,text,text,jsonb,boolean) to authenticated;
grant execute on function public.note_save(bigint,text,date,date,text,text,boolean) to authenticated;
grant execute on function public.bm_save(bigint,text,text,text,jsonb,boolean) to authenticated;
grant execute on function public.mine_remove(text,bigint) to authenticated;
notify pgrst, 'reload schema';

/* ---------- 7. 정해진 시각에 돌리기(사람이 한 번 · 또는 MCP) ----------
   notify-send 엣지펑션을 매시 7분에 부른다. 비밀(x-sync-secret)은 sync-kakao-bot cron 의 명령에서 그대로 옮겨 쓴다 —
   값을 이 파일·이력에 적지 않는다. 아래 블록은 그 명령의 «함수 이름·op» 만 바꿔 새 cron 을 만든다(이미 있으면 그대로 둔다).

   do $$ declare c text; begin
     if not exists (select 1 from cron.job where jobname = 'notify-send') then
       select replace(command, 'kakao-bot?op=sync', 'notify-send?op=cron') into c from cron.job where jobname = 'sync-kakao-bot';
       if c is null or c not like '%notify-send?op=cron%' then raise exception 'sync-kakao-bot 명령을 찾지 못했습니다'; end if;
       perform cron.schedule('notify-send', '7 * * * *', c);
     end if;
   end $$;
*/
