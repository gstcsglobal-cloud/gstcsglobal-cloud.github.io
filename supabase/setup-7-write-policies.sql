/* v80 — Import 표 쓰기 정책 (2026-08-13)
 *
 * 교육·인원·휴가의 읽기가 Import 표(Supabase)로 옮겨진 뒤(v79), 쓰기가 계속
 * 구글시트(sheet-write)로 가면 «저장했는데 새로고침하면 사라지는» 상태가 된다 —
 * 화면이 시트를 더 이상 안 보기 때문이다. 그래서 쓰기도 브라우저 → Import 표로
 * 직접 간다(core.js GST.dbWrite). pm_adjust 와 같은 규약이다: 엣지펑션 없이
 * RLS 가 최종 권한을 결정한다.
 *
 * 권한 기준은 sheet-write 와 동일하다 — allowed_users.can_write 가 참인 사람만.
 * 읽기 정책("allowed read")은 그대로 두고 쓰기 정책만 보탠다(정책은 OR 로 합쳐진다).
 *
 * 실행: SQL Editor 에 통째로 붙여넣고 Run. 여러 번 Run 해도 안전하다.
 */

/* ---------- 1. 쓰기 정책 — can_write 인 사람만 insert/update/delete ---------- */
do $$
declare t text;
begin
  foreach t in array array['sheet_roster','sheet_edu','sheet_leave'] loop
    if to_regclass('public.'||t) is null then
      raise notice '% 없음 — 건너뜀', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "allowed write" on public.%I', t);
    /* for all 은 select 도 포함하지만 정책이 OR 라 기존 "allowed read" 를 좁히지 않는다.
       with check 이 없으면 insert/update 가 검사 없이 통과하므로 반드시 둘 다 건다. */
    execute format($p$create policy "allowed write" on public.%I
        for all to authenticated
        using ( exists (select 1 from public.allowed_users a
                        where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) )
        with check ( exists (select 1 from public.allowed_users a
                        where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) )$p$, t);
  end loop;
end $$;

/* ---------- 2. allowed_users 자기 행 읽기 ----------
 * 브라우저가 편집 버튼을 보여줄지(can_write) 판단하려면 자기 행 하나는 읽어야 한다.
 * 남의 행은 안 보인다 — 명단 전체가 새는 정책을 만들지 않는다.
 * allowed_users 에 RLS 가 꺼져 있으면 이 정책은 있어도 효과가 없고(전부 읽힘),
 * 켜져 있으면 이 정책이 자기 행을 연다. 어느 쪽이든 해가 없다. */
do $$
begin
  if to_regclass('public.allowed_users') is null then
    raise notice 'allowed_users 없음 — 건너뜀';
    return;
  end if;
  drop policy if exists "self read" on public.allowed_users;
  create policy "self read" on public.allowed_users
    for select to authenticated
    using ( lower(email) = lower(auth.jwt()->>'email') );
end $$;

/* ---------- 확인 — 세 표 모두 정책 2개(read + write)여야 한다 ---------- */
select relname as 표, relrowsecurity as rls,
       (select count(*) from pg_policies p where p.tablename = c.relname) as 정책수
  from pg_class c
 where relkind = 'r' and relnamespace = 'public'::regnamespace
   and relname in ('sheet_roster','sheet_edu','sheet_leave')
 order by relname;
