-- GST 대시보드 63차 — 대시보드에서 구글시트 수정하기 (인력현황 샘플)
-- Supabase → SQL Editor → New query → 전체 붙여넣고 Run
--
-- 배경: 지금까지 대시보드는 읽기 전용이었다. 이 표들은 세 가지를 보장한다.
--   (1) 볼 수 있는 사람과 고칠 수 있는 사람을 분리한다
--   (2) 두 사람이 같은 행을 동시에 저장할 때 한쪽이 조용히 덮어써지지 않게 한다
--   (3) 누가 무엇을 언제 바꿨는지 나중에 되짚을 수 있게 한다

/* ---------- 1. 편집 권한 (조회 ≠ 편집) ---------- */
-- 기본값 false → 이 SQL을 실행해도 기존 사용자는 전원 그대로 "조회 전용"으로 남는다.
-- 편집을 허용할 직원만 Table Editor에서 can_write를 true로 바꾼다.
alter table public.allowed_users
  add column if not exists can_write boolean not null default false;
comment on column public.allowed_users.can_write is '대시보드에서 구글시트를 수정할 수 있는가 (기본 false)';

-- 관리자 1명에게만 우선 부여 (본인 이메일로 바꾸세요)
update public.allowed_users set can_write = true where lower(email) = 'gstcsglobal@gmail.com';

/* ---------- 2. 저장 직렬화용 리스(lease) 락 ---------- */
-- 서버는 "행을 읽고 → 바뀐 게 없는지 확인하고 → 쓴다". 이 사이 0.3~0.8초 틈에
-- 두 사람이 동시에 통과하면 둘 다 쓴다. 그 틈을 닫는다.
create table if not exists public.sheet_locks (
  resource   text primary key,          -- 예: 'gid:1213453343'
  holder     text,                      -- 락을 쥔 사람 이메일
  expires_at timestamptz not null       -- 함수가 도중에 죽어도 이 시간이 지나면 자동 해제
);
alter table public.sheet_locks enable row level security;
-- 정책을 만들지 않는다 = anon/authenticated 전면 차단.
-- Edge Function의 service_role만 접근할 수 있다.

create or replace function public.acquire_sheet_lock(
  p_resource text, p_holder text, p_ttl_sec int default 15)
returns boolean language plpgsql security definer
set search_path = public as $$
begin
  insert into public.sheet_locks(resource, holder, expires_at)
  values (p_resource, p_holder, now() + make_interval(secs => p_ttl_sec))
  on conflict (resource) do update
     set holder = excluded.holder, expires_at = excluded.expires_at
   where public.sheet_locks.expires_at < now();   -- 만료된 락만 뺏는다
  return found;                                   -- 못 얻으면 false → 함수가 503으로 응답
end $$;

create or replace function public.release_sheet_lock(p_resource text, p_holder text)
returns void language sql security definer
set search_path = public as $$
  delete from public.sheet_locks where resource = p_resource and holder = p_holder;
$$;

-- security definer 함수는 기본적으로 누구나 실행 가능 → 명시적으로 회수한다
revoke execute on function public.acquire_sheet_lock(text,text,int) from public, anon, authenticated;
revoke execute on function public.release_sheet_lock(text,text)     from public, anon, authenticated;

/* ---------- 3. 감사 로그 ---------- */
-- 인사 데이터를 고치는 기능이므로 "누가 바꿨나"를 남기는 것이 필수다.
create table if not exists public.sheet_edits (
  id         bigserial primary key,
  gid        text        not null,      -- 시트 탭 gid
  row_key    text        not null,      -- 사번 등 안정 키
  op         text        not null,      -- update / append / delete
  before     jsonb,                     -- 수정 전 행 전체
  after      jsonb,                     -- 수정 후 행 전체
  edited_by  text        not null,
  edited_at  timestamptz default now()
);
create index if not exists sheet_edits_gid_key_idx on public.sheet_edits(gid, row_key, edited_at desc);
alter table public.sheet_edits enable row level security;

drop policy if exists "allowed read" on public.sheet_edits;
create policy "allowed read" on public.sheet_edits
  for select to authenticated
  using ( exists (select 1 from public.allowed_users a
                  where lower(a.email) = lower(auth.jwt()->>'email')) );
-- insert 정책 없음 = 기록은 Edge Function(service_role)만 남길 수 있고 사용자는 위조할 수 없다
