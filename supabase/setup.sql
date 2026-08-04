-- GST 대시보드 보안 D안 — 허용 사용자 목록 (Supabase SQL Editor에 붙여넣고 Run)
create table if not exists public.allowed_users (
  email      text primary key,
  note       text,                          -- 예: 이름/부서 메모
  created_at timestamptz default now()
);
alter table public.allowed_users enable row level security;

-- 로그인한 본인 행만 조회 가능 (sheet-proxy의 허용 확인용)
drop policy if exists "self read" on public.allowed_users;
create policy "self read" on public.allowed_users
  for select to authenticated
  using ( lower(email) = lower(auth.jwt()->>'email') );

-- 최초 관리자 등록 (이메일을 실제 값으로 바꾸세요)
insert into public.allowed_users(email, note)
values ('gstcsglobal@gmail.com', '관리자')
on conflict (email) do nothing;
