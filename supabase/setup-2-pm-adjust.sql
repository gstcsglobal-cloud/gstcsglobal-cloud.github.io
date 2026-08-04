-- GST 대시보드 61차 (1단계) — PM 일정 조정을 인증 뒤로 이동
-- Supabase → SQL Editor → New query → 전체 붙여넣고 Run
--
-- 배경: 지금까지 PM 점검 일정 드래그 조정은 공개된 Apps Script 주소로 저장돼
--       주소만 알면 누구나 팀 일정을 변조할 수 있었다. 이 표로 옮기면
--       "로그인 + allowed_users 등록"된 사람만 읽고 쓸 수 있다.

create table if not exists public.pm_adjust (
  key        text primary key,          -- 점검 항목 키 (S/N 또는 S/N+챔버)
  new_date   date not null,             -- 조정된 예정일
  memo       text,
  updated_by text,                      -- 마지막 수정자 이메일
  updated_at timestamptz default now()
);
alter table public.pm_adjust enable row level security;

-- 허용된 로그인 사용자만 조회/수정 가능
drop policy if exists "allowed read"  on public.pm_adjust;
drop policy if exists "allowed write" on public.pm_adjust;

create policy "allowed read" on public.pm_adjust
  for select to authenticated
  using ( exists (select 1 from public.allowed_users a
                  where lower(a.email) = lower(auth.jwt()->>'email')) );

create policy "allowed write" on public.pm_adjust
  for all to authenticated
  using      ( exists (select 1 from public.allowed_users a
                       where lower(a.email) = lower(auth.jwt()->>'email')) )
  with check ( exists (select 1 from public.allowed_users a
                       where lower(a.email) = lower(auth.jwt()->>'email')) );
