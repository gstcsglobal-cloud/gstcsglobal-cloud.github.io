-- setup-18-colmap.sql — 사이트별 «열 맵핑 지정» (v149)
-- 왜: 사이트마다 양식이 달라 같은 항목(예: 설비 S/N)이 «S/N»·«시리얼»·«Serial No» 처럼 다른 머리글,
--     다른 열 위치에 있다. 업로드는 SPEC 별칭으로 자동 인식하지만, 못 찾거나 «잘못» 잡은 경우
--     사람이 «이 사이트의 이 항목은 이 머리글»이라고 지정해 두고 다음 업로드부터 그대로 쓰게 한다.
-- ⚠ 열 «번호»가 아니라 «머리글 이름»을 저장한다(제1원칙) — 열이 하나 끼어들어도 계속 맞는다.
-- ⚠ 지정은 SPEC 별칭보다 «먼저» 본다. 지정한 머리글이 파일에 없으면 자동 인식으로 돌아가고 화면이 그 사실을 적는다.
-- 지우는 문장이 없다 — MCP 로 적용 가능. 다시 Run 해도 안전하다.
create table if not exists public.colmap_site (
  site       text not null,              -- K·P·H·TW·KR · 관리자 전체 화면은 'ALL'
  tbl        text not null,              -- 업로드 대상 rid (wk·mat·inst …)
  field      text not null,              -- SPEC 필드 키 (snIn·sn·customer …)
  header     text not null,              -- 그 사이트 파일의 머리글 원문
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (site, tbl, field)
);
alter table public.colmap_site enable row level security;
grant select, insert, update, delete on public.colmap_site to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='colmap_site' and policyname='colmap read') then
    create policy "colmap read" on public.colmap_site for select to authenticated
      using ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')) );
  end if;
  -- 쓰기: 올릴 수 있는 사람이 자기 사이트의 지정을 고친다 — 쓰기 권한자 · 국내 데모(KR)는 kr 도.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='colmap_site' and policyname='colmap write') then
    create policy "colmap write" on public.colmap_site for all to authenticated
      using ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')
                       and (a.can_write or (a.role = 'kr' and site = 'KR'))) )
      with check ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')
                       and (a.can_write or (a.role = 'kr' and site = 'KR'))) );
  end if;
end $$;
