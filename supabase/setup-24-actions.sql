-- ============================================================================
-- setup-24 — 처리함: 「누가 · 언제까지 · 무엇을 했나」를 남기는 할 일 목록 (v166 · 사용자 요청 「통합관리화면」 2단계)
--
-- 통합 관제(/hub/)는 «어디를 먼저 볼지»를 말하지만, 본 뒤의 일 — 담당자를 정하고, 확인했다고 표시하고, 메모를 남기고,
-- 끝냈다고 닫는 일 — 을 담을 자리가 없었다. 「처리할 일」 목록은 새로고침할 때마다 다시 계산되는 «신호»라
-- 오늘 누가 무엇을 맡았는지가 어디에도 안 남는다.
--
-- ⚠ 신호를 «자동으로» 담지 않는다. 화면이 열릴 때마다 모든 조회자의 브라우저가 쓰기를 하면 같은 일이 여럿 생기고,
--   누가 담았는지가 의미를 잃는다. 사람이 「처리함에 담기」를 눌러야 들어간다(같은 신호가 이미 열려 있으면 그 일을 돌려준다).
-- ⚠ 지우지 않는다 — 닫는다(done · dismissed). 이력(action_log)은 언제나 남는다. 그래서 이 파일에는 지우는 문장이 없다
--   (MCP 로 들어간다 · 정책도 drop 없이 «없으면 만든다»).
--
-- 1절 표 둘 · 2절 판정 함수 · 3절 RPC(담기 · 바꾸기 · 사람 목록) · 4절 권한
-- ============================================================================

/* ---------- 1. 표 ----------
 * ref    — 같은 신호를 두 번 담지 않게 하는 열쇠(예: 'risk:TWC1' · 'dq:fault.bm_unknown'). 직접 추가한 일은 null.
 *          «열려 있는» 일 사이에서만 유일하다 — 닫힌 뒤 같은 신호가 다시 뜨면 새 일로 담는다(재발은 새 사건이다).
 * kind   — risk(고장 위험 설비) · spike(운영단위 급증) · dq(자료 결함) · manual(직접 추가)
 * sev    — bad · warn · info
 * status — open(새로) → ack(확인) → doing(진행) → done(완료) · dismissed(보류·해당 없음) */
create table if not exists public.action_items(
  id          bigint generated always as identity primary key,
  kind        text not null default 'manual' check (kind in ('risk','spike','dq','manual')),
  ref         text,
  sev         text not null default 'warn' check (sev in ('bad','warn','info')),
  status      text not null default 'open' check (status in ('open','ack','doing','done','dismissed')),
  title       text not null check (length(btrim(title)) between 1 and 200),
  detail      text,
  op          text,
  page        text,
  assignee    text,
  due         date,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_by  text,
  updated_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create unique index if not exists action_items_open_ref on public.action_items(ref)
  where ref is not null and status not in ('done','dismissed');
create index if not exists action_items_status on public.action_items(status, updated_at desc);

create table if not exists public.action_log(
  id       bigint generated always as identity primary key,
  item_id  bigint not null references public.action_items(id),
  at       timestamptz not null default now(),
  by       text not null,
  op       text not null check (op in ('create','status','assign','due','memo','sev','reopen')),
  v_from   text,
  v_to     text,
  memo     text
);
create index if not exists action_log_item on public.action_log(item_id, at);

/* 읽기 — 허용 사용자 누구나(조회자도 «누가 맡았나»는 본다). 쓰기 정책은 «없다» — 쓰기는 3절 함수만 한다
   (표를 직접 고치면 이력이 안 남는다 · sheet_edits 와 같은 규율). */
alter table public.action_items enable row level security;
alter table public.action_log   enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='action_items' and policyname='allowed read') then
    create policy "allowed read" on public.action_items for select to authenticated
      using (exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='action_log' and policyname='allowed read') then
    create policy "allowed read" on public.action_log for select to authenticated
      using (exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')));
  end if;
end $$;
revoke all on public.action_items, public.action_log from anon, authenticated;
grant select on public.action_items, public.action_log to authenticated;

/* ---------- 2. 판정 — «처리함을 쓸 수 있는 사람» ----------
 * 쓰기 권한이 있거나(can_write) 등급이 관리자·사이트 담당자·국내 운영자인 사람. 조회자(viewer)는 읽기만.
 * 판정은 이 한 함수다 — 화면의 GST.actCan() 이 같은 규칙을 본다(화면은 길 안내, 막는 것은 서버). */
create or replace function public._act_who() returns text
language sql stable security definer set search_path = public as $$
  select a.email from public.allowed_users a
   where lower(a.email) = lower(coalesce(auth.jwt()->>'email',''))
     and (a.can_write or a.role in ('admin','editor','kr'))
   limit 1
$$;

/* ---------- 3. RPC ---------- */

/* 담기 — 같은 ref 의 일이 열려 있으면 그 일을 돌려준다(created=false). */
create or replace function public.action_add(p_kind text, p_ref text, p_sev text, p_title text,
  p_detail text default null, p_op text default null, p_page text default null,
  p_assignee text default null, p_due date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text; cur bigint; nid bigint; k text := coalesce(nullif(btrim(p_kind),''),'manual'); r text := nullif(btrim(coalesce(p_ref,'')),'');
begin
  if coalesce(auth.jwt()->>'email','') = '' then raise exception 'login'; end if;
  me := public._act_who(); if me is null then raise exception 'forbidden'; end if;
  if k not in ('risk','spike','dq','manual') then raise exception 'bad_kind'; end if;
  if coalesce(p_sev,'warn') not in ('bad','warn','info') then raise exception 'bad_sev'; end if;
  if length(btrim(coalesce(p_title,''))) not between 1 and 200 then raise exception 'bad_title'; end if;
  if p_assignee is not null and btrim(p_assignee) <> '' and not exists (select 1 from public.allowed_users a where lower(a.email) = lower(btrim(p_assignee))) then
    raise exception 'bad_assignee';
  end if;
  if r is not null then
    select id into cur from public.action_items where ref = r and status not in ('done','dismissed') limit 1;
    if cur is not null then return jsonb_build_object('id', cur, 'created', false); end if;
  end if;
  insert into public.action_items(kind, ref, sev, title, detail, op, page, assignee, due, created_by, updated_by)
  values (k, r, coalesce(p_sev,'warn'), btrim(p_title), nullif(btrim(coalesce(p_detail,'')),''), nullif(btrim(coalesce(p_op,'')),''),
          nullif(btrim(coalesce(p_page,'')),''), nullif(lower(btrim(coalesce(p_assignee,''))),''), p_due, me, me)
  returning id into nid;
  insert into public.action_log(item_id, by, op, v_to) values (nid, me, 'create', btrim(p_title));
  if nullif(btrim(coalesce(p_assignee,'')),'') is not null then
    insert into public.action_log(item_id, by, op, v_to) values (nid, me, 'assign', lower(btrim(p_assignee)));
  end if;
  return jsonb_build_object('id', nid, 'created', true);
exception when unique_violation then
  -- 두 사람이 같은 신호를 동시에 담았다 — 먼저 들어간 일을 돌려준다
  select id into cur from public.action_items where ref = r and status not in ('done','dismissed') limit 1;
  return jsonb_build_object('id', cur, 'created', false);
end $$;

/* 바꾸기 — 준 칸만 바꾸고 칸마다 이력 한 줄. p_set 의 열쇠: status · assignee('' = 담당 해제) · due('' = 해제) · sev · memo.
 * p_at(그 일의 updated_at 을 화면이 들고 있던 값)이 지금과 다르면 conflict — 남이 그새 바꾼 것을 조용히 덮지 않는다. */
create or replace function public.action_set(p_id bigint, p_set jsonb, p_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text; it public.action_items%rowtype; v text; changed int := 0; d date;
begin
  if coalesce(auth.jwt()->>'email','') = '' then raise exception 'login'; end if;
  me := public._act_who(); if me is null then raise exception 'forbidden'; end if;
  select * into it from public.action_items where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_at is not null and date_trunc('milliseconds', it.updated_at) <> date_trunc('milliseconds', p_at) then
    return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', it.updated_at, 'updated_by', it.updated_by);
  end if;
  if p_set ? 'status' then
    v := p_set->>'status';
    if v not in ('open','ack','doing','done','dismissed') then raise exception 'bad_status'; end if;
    if v <> it.status then
      -- 닫힌 일을 다시 여는데 같은 신호의 «새 일»이 이미 열려 있으면 둘이 된다 — 그 일을 알려 주고 멈춘다
      if it.status in ('done','dismissed') and v not in ('done','dismissed') and it.ref is not null
         and exists (select 1 from public.action_items x where x.ref = it.ref and x.id <> p_id and x.status not in ('done','dismissed')) then
        raise exception 'already_open';
      end if;
      insert into public.action_log(item_id, by, op, v_from, v_to)
      values (p_id, me, case when it.status in ('done','dismissed') and v not in ('done','dismissed') then 'reopen' else 'status' end, it.status, v);
      update public.action_items set status = v, closed_at = case when v in ('done','dismissed') then now() else null end where id = p_id;
      changed := changed + 1;
    end if;
  end if;
  if p_set ? 'assignee' then
    v := nullif(lower(btrim(coalesce(p_set->>'assignee',''))),'');
    if v is not null and not exists (select 1 from public.allowed_users a where lower(a.email) = v) then raise exception 'bad_assignee'; end if;
    if v is distinct from it.assignee then
      insert into public.action_log(item_id, by, op, v_from, v_to) values (p_id, me, 'assign', it.assignee, v);
      update public.action_items set assignee = v where id = p_id; changed := changed + 1;
    end if;
  end if;
  if p_set ? 'due' then
    d := nullif(btrim(coalesce(p_set->>'due','')),'')::date;
    if d is distinct from it.due then
      insert into public.action_log(item_id, by, op, v_from, v_to) values (p_id, me, 'due', it.due::text, d::text);
      update public.action_items set due = d where id = p_id; changed := changed + 1;
    end if;
  end if;
  if p_set ? 'sev' then
    v := p_set->>'sev';
    if v not in ('bad','warn','info') then raise exception 'bad_sev'; end if;
    if v <> it.sev then
      insert into public.action_log(item_id, by, op, v_from, v_to) values (p_id, me, 'sev', it.sev, v);
      update public.action_items set sev = v where id = p_id; changed := changed + 1;
    end if;
  end if;
  if nullif(btrim(coalesce(p_set->>'memo','')),'') is not null then
    if length(p_set->>'memo') > 2000 then raise exception 'memo_too_long'; end if;
    insert into public.action_log(item_id, by, op, memo) values (p_id, me, 'memo', btrim(p_set->>'memo'));
    changed := changed + 1;
  end if;
  if changed > 0 then
    update public.action_items set updated_by = me, updated_at = clock_timestamp() where id = p_id;
  end if;
  select * into it from public.action_items where id = p_id;
  return jsonb_build_object('ok', true, 'changed', changed, 'updated_at', it.updated_at, 'status', it.status);
end $$;

/* 담당자로 고를 수 있는 사람 — allowed_users 의 «자기 행 읽기» 정책 때문에 화면이 직접 못 읽는다.
   이메일만 돌려준다(등급·권한은 안 준다). 처리함을 쓸 수 있는 사람에게만. */
create or replace function public.action_people() returns setof text
language sql stable security definer set search_path = public as $$
  select lower(a.email) from public.allowed_users a
   where public._act_who() is not null
   order by 1
$$;

/* ---------- 4. 권한 ---------- */
revoke all on function public._act_who() from public, anon, authenticated;
revoke all on function public.action_add(text,text,text,text,text,text,text,text,date) from public, anon;
revoke all on function public.action_set(bigint,jsonb,timestamptz) from public, anon;
revoke all on function public.action_people() from public, anon;
grant execute on function public.action_add(text,text,text,text,text,text,text,text,date) to authenticated;
grant execute on function public.action_set(bigint,jsonb,timestamptz) to authenticated;
grant execute on function public.action_people() to authenticated;
notify pgrst, 'reload schema';
