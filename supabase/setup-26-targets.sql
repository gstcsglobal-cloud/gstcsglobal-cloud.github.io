-- ============================================================================
-- setup-26 — 운영 목표(SLA) 표 · 사람별 첫 화면 설정 (2단계 «제품화» 밑바탕)
--
-- 왜 — 지금 대시보드의 차트 99개 중 «기준선»이 있는 것이 0개다. 많다/적다는 보이는데 «정상인가»를
--   판단할 근거가 화면에 없어서, 결국 보는 사람 머릿속 기준으로 읽는다. 목표 표가 생기면
--   ① 카드가 «목표 대비»로 말하고 ② 어느 차트를 남길지가 정해진다(목표와 견줄 수 있는 것만).
--
-- ⚠ 지표의 «뜻»(무엇을 어떻게 세나)은 여기 두지 않는다 — assets/v2.js 의 GST.METRICS 한 곳이다.
--   이 표는 «지표 열쇠 → 목표값»만 든다. 지표 목록을 check 제약으로 박으면 JS 와 두 벌이 되어 갈라진다(제2원칙).
-- ⚠ 지우지 않는다 — 감춘다(removed_at). 이력(ops_target_log)은 언제나 남는다. 이 파일에는 지우는 문장이 없다
--   (MCP 로 바로 들어간다 · 정책도 drop 없이 «없으면 만든다»).
-- ⚠ 목표를 바꾸면 모든 화면의 «판정 색»이 바뀐다 — 쓰기는 관리자(+쓰기 권한)만. 기준 정보(value_map · v152)와 같은 무게다.
--
-- 1절 목표 표 · 2절 판정 함수 · 3절 RPC(저장·감추기) · 4절 사람별 첫 화면 설정 · 5절 권한
-- 선행: setup-15(allowed_users.role)
-- ============================================================================

/* ---------- 1. 목표 표 ----------
 * metric     — GST.METRICS 의 열쇠(run_rate · bm_per100 · pm_ratio · repeat14 · act_overdue …)
 * scope_kind — all(전사) · region(국내/해외 — GST.ORG.region 정본 문자열) · op(운영단위 원문)
 * scope      — all 이면 '' · region 이면 '국내'/'해외' · op 이면 설치현황·실적의 운영단위 원문 그대로
 *              (짓지 않는다 — v98. 화면이 «가장 좁은 목표»를 고른다: op > region > all)
 * target     — 목표값. dir='le' 이면 이하가 정상(고장률), 'ge' 이면 이상이 정상(가동률)
 * warn       — 주의 경계(선택). 없으면 화면이 목표의 10% 띠를 주의로 본다 — 그 규칙도 GST.targets.judge 한 곳이다. */
create table if not exists public.ops_targets(
  id          bigint generated always as identity primary key,
  metric      text not null check (metric ~ '^[a-z0-9_]{2,32}$'),
  scope_kind  text not null default 'all' check (scope_kind in ('all','region','op')),
  scope       text not null default '',
  target      numeric not null,
  warn        numeric,
  dir         text not null check (dir in ('le','ge')),
  note        text check (note is null or length(note) <= 300),
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_by  text,
  updated_at  timestamptz not null default now(),
  removed_at  timestamptz,
  constraint ops_targets_scope_chk check ((scope_kind = 'all') = (scope = '')),
  constraint ops_targets_warn_chk check (warn is null or (dir = 'le' and warn >= target) or (dir = 'ge' and warn <= target))
);
/* 살아 있는 목표는 «지표 × 범위» 하나뿐 — 둘이면 화면이 어느 쪽으로 판정할지 모른다 */
create unique index if not exists ops_targets_live on public.ops_targets(metric, scope_kind, scope) where removed_at is null;

create table if not exists public.ops_target_log(
  id         bigint generated always as identity primary key,
  target_id  bigint not null references public.ops_targets(id),
  at         timestamptz not null default now(),
  by         text not null,
  op         text not null check (op in ('create','update','remove')),
  v_from     jsonb,
  v_to       jsonb
);
create index if not exists ops_target_log_t on public.ops_target_log(target_id, at);

/* 읽기 — 허용 사용자 누구나(조회자도 «목표가 얼마인가»는 본다 · 판정 색의 근거). 쓰기 정책은 «없다» — 3절 함수만 쓴다. */
alter table public.ops_targets    enable row level security;
alter table public.ops_target_log enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ops_targets' and policyname='allowed read') then
    create policy "allowed read" on public.ops_targets for select to authenticated
      using (exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ops_target_log' and policyname='allowed read') then
    create policy "allowed read" on public.ops_target_log for select to authenticated
      using (exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')));
  end if;
end $$;
revoke all on public.ops_targets, public.ops_target_log from anon, authenticated;
grant select on public.ops_targets, public.ops_target_log to authenticated;

/* ---------- 2. 판정 — «목표를 바꿀 수 있는 사람» ----------
 * 관리자 + 쓰기 권한. 화면의 GST.targets.can() 이 같은 규칙을 본다(화면은 길 안내 · 막는 것은 서버). */
create or replace function public._tgt_who() returns text
language sql stable security definer set search_path = public as $$
  select a.email from public.allowed_users a
   where lower(a.email) = lower(coalesce(auth.jwt()->>'email',''))
     and a.can_write and a.role = 'admin'
   limit 1
$$;

/* ---------- 3. RPC ----------
 * target_save — 같은 «지표 × 범위»의 살아 있는 목표가 있으면 고치고, 없으면 만든다.
 *   p_at: 화면이 읽은 그 목표의 updated_at. 다르면 conflict(남의 변경을 덮지 않는다 · 처리함 v166 과 같은 규율).
 *         새로 만들 때는 null — 그새 누가 만들었으면 conflict.
 * target_remove — 감춘다(removed_at). 같은 범위에 새 목표를 다시 만들 수 있다. */
create or replace function public.target_save(p_metric text, p_scope_kind text, p_scope text, p_target numeric,
  p_warn numeric, p_dir text, p_note text, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare who text := public._tgt_who(); cur public.ops_targets; nid bigint; nat timestamptz;
        sc text := case when p_scope_kind = 'all' then '' else btrim(coalesce(p_scope,'')) end;
begin
  if coalesce(auth.jwt()->>'email','') = '' then return jsonb_build_object('error','login'); end if;
  if who is null then return jsonb_build_object('error','forbidden'); end if;
  if p_metric is null or p_metric !~ '^[a-z0-9_]{2,32}$' then return jsonb_build_object('error','bad_metric'); end if;
  if p_scope_kind not in ('all','region','op') or (p_scope_kind <> 'all' and sc = '') then return jsonb_build_object('error','bad_scope'); end if;
  if p_dir not in ('le','ge') then return jsonb_build_object('error','bad_dir'); end if;
  if p_target is null then return jsonb_build_object('error','bad_target'); end if;
  if p_warn is not null and ((p_dir = 'le' and p_warn < p_target) or (p_dir = 'ge' and p_warn > p_target)) then
    return jsonb_build_object('error','bad_warn'); end if;
  select * into cur from public.ops_targets
   where metric = p_metric and scope_kind = p_scope_kind and scope = sc and removed_at is null for update;
  if found then
    if p_at is distinct from cur.updated_at then return jsonb_build_object('error','conflict','id',cur.id,'updated_at',cur.updated_at); end if;
    update public.ops_targets set target = p_target, warn = p_warn, dir = p_dir, note = nullif(btrim(coalesce(p_note,'')),''),
           updated_by = who, updated_at = clock_timestamp()
     where id = cur.id returning updated_at into nat;
    insert into public.ops_target_log(target_id, by, op, v_from, v_to) values (cur.id, who, 'update',
      jsonb_build_object('target',cur.target,'warn',cur.warn,'dir',cur.dir,'note',cur.note),
      jsonb_build_object('target',p_target,'warn',p_warn,'dir',p_dir,'note',nullif(btrim(coalesce(p_note,'')),'')));
    return jsonb_build_object('ok',true,'id',cur.id,'updated_at',nat);
  end if;
  if p_at is not null then return jsonb_build_object('error','conflict'); end if;   -- 읽은 목표가 그새 감춰졌다
  insert into public.ops_targets(metric, scope_kind, scope, target, warn, dir, note, created_by, updated_by)
    values (p_metric, p_scope_kind, sc, p_target, p_warn, p_dir, nullif(btrim(coalesce(p_note,'')),''), who, who)
    returning id, updated_at into nid, nat;
  insert into public.ops_target_log(target_id, by, op, v_to) values (nid, who, 'create',
    jsonb_build_object('metric',p_metric,'scope_kind',p_scope_kind,'scope',sc,'target',p_target,'warn',p_warn,'dir',p_dir));
  return jsonb_build_object('ok',true,'id',nid,'updated_at',nat);
exception when unique_violation then
  return jsonb_build_object('error','conflict');                                  -- 같은 순간 둘이 만들었다
end $$;

create or replace function public.target_remove(p_id bigint, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare who text := public._tgt_who(); cur public.ops_targets;
begin
  if coalesce(auth.jwt()->>'email','') = '' then return jsonb_build_object('error','login'); end if;
  if who is null then return jsonb_build_object('error','forbidden'); end if;
  select * into cur from public.ops_targets where id = p_id and removed_at is null for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if p_at is distinct from cur.updated_at then return jsonb_build_object('error','conflict','updated_at',cur.updated_at); end if;
  update public.ops_targets set removed_at = clock_timestamp(), updated_by = who, updated_at = clock_timestamp() where id = p_id;
  insert into public.ops_target_log(target_id, by, op, v_from) values (p_id, who, 'remove',
    jsonb_build_object('target',cur.target,'warn',cur.warn,'dir',cur.dir));
  return jsonb_build_object('ok',true);
end $$;

/* ---------- 4. 사람별 첫 화면 설정 (법인 테넌시) ----------
 * home_view — exec(경영진) · lead(팀장) · field(현장). 비면 화면이 등급으로 고른다(관리자 → 팀장 · 그 밖 → 경영진).
 * home_op   — 내 운영단위(원문). 비면 전사.
 * lang      — 다음에 열 때의 언어. 비면 셸의 지금 규칙(세션 → 브라우저) 그대로.
 * ⚠ 이 셋은 «화면 정리»다. 볼 수 있는 자료를 좁히는 것이 아니다(권한은 RLS 그대로) — home_op 를 바꿔도 다른 법인을 볼 수 있다.
 * 자기 행만 바꾼다(pref_save · definer). allowed_users 에는 사용자 쓰기 정책이 없다 — 그대로 둔다. */
alter table public.allowed_users add column if not exists home_view text;
alter table public.allowed_users add column if not exists home_op   text;
alter table public.allowed_users add column if not exists lang      text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'allowed_users_home_view_chk') then
    alter table public.allowed_users add constraint allowed_users_home_view_chk check (home_view is null or home_view in ('exec','lead','field'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'allowed_users_lang_chk') then
    alter table public.allowed_users add constraint allowed_users_lang_chk check (lang is null or lang in ('ko','en','zh','ja'));
  end if;
end $$;

create or replace function public.pref_save(p_view text, p_op text, p_lang text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt()->>'email','')); n int;
begin
  if em = '' then return jsonb_build_object('error','login'); end if;
  if p_view is not null and p_view not in ('exec','lead','field') then return jsonb_build_object('error','bad_view'); end if;
  if p_lang is not null and p_lang not in ('ko','en','zh','ja') then return jsonb_build_object('error','bad_lang'); end if;
  if p_op is not null and length(p_op) > 120 then return jsonb_build_object('error','bad_op'); end if;
  update public.allowed_users set home_view = p_view, home_op = nullif(btrim(coalesce(p_op,'')),''), lang = p_lang
   where lower(email) = em;
  get diagnostics n = row_count;
  if n <> 1 then return jsonb_build_object('error','not_found'); end if;
  return jsonb_build_object('ok',true);
end $$;

/* ---------- 5. 권한 ----------
 * Supabase 는 public 함수에 기본 실행 권한을 준다 — 내부 판정 함수는 회수하고(v140 규율) RPC 셋만 authenticated 에 연다. */
revoke all on function public._tgt_who() from public, anon, authenticated;
revoke all on function public.target_save(text,text,text,numeric,numeric,text,text,timestamptz) from public, anon;
revoke all on function public.target_remove(bigint,timestamptz) from public, anon;
revoke all on function public.pref_save(text,text,text) from public, anon;
grant execute on function public.target_save(text,text,text,numeric,numeric,text,text,timestamptz) to authenticated;
grant execute on function public.target_remove(bigint,timestamptz) to authenticated;
grant execute on function public.pref_save(text,text,text) to authenticated;
notify pgrst, 'reload schema';
