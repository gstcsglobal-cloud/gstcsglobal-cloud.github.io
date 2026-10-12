-- ============================================================================
-- setup-31 — FSE 원장 «설비 속성»을 설비마다 한 줄로 (v191 · 사용자 「FSE 원장 넣으니까 너무 느려지네」)
--
-- 알람 분석 탭은 원장 89,265행을 받는다(실측 2026-10). 행마다 LINE·공정·세부공정·버너·모델·Scrubber Code·Turn-on 이
-- 같은 값으로 반복돼 JSON 10MB 를 차지했다. 이 함수가 «S/N × 챔버»마다 비어 있지 않은 마지막 값(원장 뒤쪽 = 최근)을
-- 한 번에 돌려주고, 화면은 행에서는 그 열을 빼고 받는다(GST.FSE.READ · GST.FSE.units).
--
-- · 읽기 전용 · security definer + 첫 줄에서 «허용 사용자인가»를 본다(sheet_fse 의 RLS «allowed read» 와 같은 조건 · 다른 RPC 와 같은 꼴).
--   실측(2026-10 · 89,265행 → 설비 1,899줄 · 208KB): 따뜻할 때 0.52초. 오래 쉰 뒤 첫 호출은 디스크에서 읽어 5초대까지 걸린다
--   (invoker 로 두어도 따뜻할 때 같은 0.52초였다 — RLS 가 비용을 만드는 것이 아니다).
-- · 결과는 jsonb 한 값(배열의 배열)이다 — 집합을 돌려주면 PostgREST 행수 상한(max-rows)에 잘린다(설비 ~2천 줄).
-- · 이 함수가 없으면 화면은 옛 방식(행마다 설비 열을 받는다)으로 돈다 — 읽기 실패가 아니다.
-- 지우는 문장이 없다(MCP 로 들어간다). 다시 Run 해도 안전하다.
-- ============================================================================

create or replace function public.fse_units()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if coalesce(auth.jwt()->>'email','') = '' then raise exception 'login'; end if;
  if not exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')) then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(jsonb_build_array(sn, chamber, last_row, site, fab, grp1, det1, btype, model, code, turn_on)), '[]'::jsonb)
  from (
    select sn, chamber, max(src_row) as last_row,
      (array_agg(site    order by src_row desc) filter (where coalesce(btrim(site),'')    <> ''))[1] as site,
      (array_agg(fab     order by src_row desc) filter (where coalesce(btrim(fab),'')     <> ''))[1] as fab,
      (array_agg(grp1    order by src_row desc) filter (where coalesce(btrim(grp1),'')    <> ''))[1] as grp1,
      (array_agg(det1    order by src_row desc) filter (where coalesce(btrim(det1),'')    <> ''))[1] as det1,
      (array_agg(btype   order by src_row desc) filter (where coalesce(btrim(btype),'')   <> ''))[1] as btype,
      (array_agg(model   order by src_row desc) filter (where coalesce(btrim(model),'')   <> ''))[1] as model,
      (array_agg(code    order by src_row desc) filter (where coalesce(btrim(code),'')    <> ''))[1] as code,
      (array_agg(turn_on order by src_row desc) filter (where coalesce(btrim(turn_on),'') <> ''))[1] as turn_on
    from public.sheet_fse
    where coalesce(btrim(sn),'') <> ''
    group by sn, chamber
  ) u into out;
  return out;
end $$;

revoke all on function public.fse_units() from public, anon;
grant execute on function public.fse_units() to authenticated;
notify pgrst, 'reload schema';
