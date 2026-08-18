-- GST 대시보드 — PM 일정 조정 쓰기 권한을 can_write 로 좁힌다
-- Supabase → SQL Editor → New query → 전체 붙여넣고 Run
--
-- 배경. setup-2 의 "allowed write" 는 «allowed_users 에 있으면 누구나» 쓰기다.
--       그런데 이 대시보드에는 읽기전용 계정이라는 개념이 이미 있다 —
--       allowed_users.can_write 가 그것이고, 인원·교육·휴가 쓰기(setup-7)는 그 열을 본다.
--       PM 일정만 그 검사가 빠져 있어서, **읽기전용으로 준 계정이 팀 일정을 영구히 바꾼다.**
--       화면에는 아무 표시도 없다 — 드래그가 그냥 저장된다.
--
-- ⚠ can_write 가 null 인 기존 행이 있으면 그 사람은 이 SQL 이후 «쓰기 불가»가 된다.
--    의도한 것이다(모르면 못 쓰게). 쓰게 하려면 아래 주석의 UPDATE 를 함께 돌린다.
--      update public.allowed_users set can_write = true where email = 'someone@x.com';

drop policy if exists "allowed write" on public.pm_adjust;

-- 읽기는 그대로: allowed_users 에 있으면 본다
-- 쓰기는 can_write = true 인 사람만
create policy "write when can_write" on public.pm_adjust
  for all to authenticated
  using      ( exists (select 1 from public.allowed_users a
                       where lower(a.email) = lower(auth.jwt()->>'email')
                         and coalesce(a.can_write, false) = true) )
  with check ( exists (select 1 from public.allowed_users a
                       where lower(a.email) = lower(auth.jwt()->>'email')
                         and coalesce(a.can_write, false) = true) );

-- 확인: 아래가 «쓰기 정책이 can_write 를 본다» 를 보여준다
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'pm_adjust'
order by policyname;
