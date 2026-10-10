-- ============================================================================
-- setup-26 — 지도 위치: «이 사이트(지역·단지·FAB)는 지도 어디인가» (v171 · 사용자 요청 「나라를 누르면 그 나라 지도로」)
--
-- 통합 관제의 나라 지도는 설치현황의 지역(Location) · 단지 · FAB 로 설비를 놓는다. 그런데 그 값은 도시 이름이기도 하고(탕정·청주),
-- 고객사 단지 코드이기도 하다(P1·H2·K1). 코드는 이름만으로 위치를 알 수 없으므로 «사람이 정한다» — 화면이 짐작하지 않는다.
-- 행정구역 이름과 정확히 맞는 값(예: TAINAN ↔ Tainan City)은 화면이 저절로 놓고, 나머지는 이 표가 정한다.
-- 못 정한 값은 지도 아래 «위치 미지정» 목록에 대수와 함께 뜬다(조용히 빠지지 않는다).
--
-- ⚠ 열쇠는 정규화한 값(대문자 · 공백 제거)이다 — 'P1' 이 없으면 끝 숫자를 뗀 'P' 를 본다(같은 단지 코드 묶음을 한 번에 정한다).
-- ⚠ 지우지 않는다 — 좌표를 비우면(null) «미지정»으로 돌아간다. 이 파일에는 지우는 문장이 없다(MCP 로 들어간다).
-- ============================================================================

create table if not exists public.geo_places(
  key         text primary key check (key = upper(regexp_replace(key, '\s', '', 'g')) and length(key) between 1 and 60),
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  label       text,
  cc          text check (cc is null or cc ~ '^[A-Z]{2}$'),
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.geo_places enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='geo_places' and policyname='allowed read') then
    create policy "allowed read" on public.geo_places for select to authenticated
      using (exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')));
  end if;
end $$;
revoke all on public.geo_places from anon, authenticated;
grant select on public.geo_places to authenticated;

/* 정하기 — 관리자(쓰기 권한) 또는 쓰기 권한이 있는 사람. p_lat/p_lng 를 null 로 주면 «미지정»으로 돌린다. */
create or replace function public.geo_place_set(p_key text, p_lat double precision, p_lng double precision, p_label text default null, p_cc text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt()->>'email','')); k text := upper(regexp_replace(coalesce(p_key,''), '\s', '', 'g'));
begin
  if me = '' then raise exception 'login'; end if;
  if not exists (select 1 from public.allowed_users a where lower(a.email) = me and a.can_write) then raise exception 'forbidden'; end if;
  if length(k) not between 1 and 60 then raise exception 'bad_key'; end if;
  if (p_lat is null) <> (p_lng is null) then raise exception 'bad_point'; end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180) then raise exception 'bad_point'; end if;
  insert into public.geo_places(key, lat, lng, label, cc, updated_by, updated_at)
  values (k, p_lat, p_lng, nullif(btrim(coalesce(p_label,'')),''), nullif(upper(btrim(coalesce(p_cc,''))),''), me, now())
  on conflict (key) do update set lat = excluded.lat, lng = excluded.lng, label = coalesce(excluded.label, geo_places.label),
    cc = coalesce(excluded.cc, geo_places.cc), updated_by = me, updated_at = now();
  return jsonb_build_object('key', k, 'ok', true);
end $$;

revoke all on function public.geo_place_set(text,double precision,double precision,text,text) from public, anon;
grant execute on function public.geo_place_set(text,double precision,double precision,text,text) to authenticated;
notify pgrst, 'reload schema';
