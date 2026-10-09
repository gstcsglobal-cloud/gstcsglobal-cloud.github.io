-- ============================================================================
-- setup-21 — 데이터 품질 점검 (v155 · 사용자 요청)
--
-- 사용자: 「작업공수 35주차를 보면 허수의 값이 있는 것 같다 … 데이터 품질 표를 데이터 관리로 옮기고,
--          차트·데이터 정합성이 안 맞는 것을 고치라는 의미와 내게 알리는 의미로 기능을 하나 추가하고,
--          내가 직접 그 데이터를 확인하고 수정할 수 있게」.
--
-- 실측(운영 2026-10): 대만 35주차 공수 2,989h 중 1,898h 가 «두 행»이었다 — 작업시작 08-28 인데
-- 작업종료가 09-08 · 09-28 로 적혀 작업시간(분)이 15,990 · 44,700(= 11일 · 31일)이 된 행.
-- GST 시스템은 작업시간을 «시작 → 종료»로 계산하므로 종료일 한 칸의 오기입이 공수를 통째로 부풀린다.
--
-- 이 파일은 «읽기 전용»이다 — 행을 고치지 않는다. 고치는 일은 데이터 관리 화면이 하고(edit_* RPC ·
-- 이력·되돌리기 그대로), 여기는 «어느 행을 보라»만 말한다. 지우는 문장이 없어 MCP 로 바로 들어간다.
--
-- ⚠ 판정은 여기 «한 벌»이다(edit_dq · edit_dq_rows 가 같은 식을 쓴다 — 아래 _dq_w). 화면이 다시 세면
--   «점검은 3건인데 목록은 2행»이 된다(제2원칙).
-- ⚠ 해외·국내 «규칙»을 바꾸지 않는다(제3원칙) — 집계에서 빼지 않고 «확인하라»고만 한다.
--   국내 데모(kr_sheet_wk)는 v147 에서 24h 초과를 이미 뺀다. 여기는 둘 다 «보여 주기»만 한다.
-- ============================================================================

-- 점검 대상 행 — 두 함수(edit_dq · edit_dq_rows)가 «같은» 식을 쓰도록 SQL 글자를 한 곳(_dq_w)에서 만든다.
-- 시트 원문(text)에 이상한 값이 섞여 있어도 점검 전체가 죽지 않게 «형이 맞을 때만» 바꾼다(그 행만 null).
-- ⚠ 형 변환을 함수로 빼서 행마다 부르지 말 것 — plpgsql exception 블록은 행마다 하위 트랜잭션이라 호출당 13초,
--   SQL 함수도 인라인이 안 돼 6.8초였다(운영 16만 행 실측). 식을 문장 안에 펼치면 0.3초다.
--   날짜는 «2026-02-30» 도 던지지 않게, 29일 이상이면 그 달 1일에 날수를 더해 되돌려 찍은 글자가 같을 때만 받는다.
create or replace function public._dq_w(p_tbl text, p_from text) returns text
language plpgsql immutable as $f$
declare
  n text := '(case when %1$I ~ ''^-?[0-9,]+(\.[0-9]+)?$'' then replace(%1$I, '','', '''')::numeric end)';
  d text := '(case when left(%1$I, 10) ~ ''^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'' then case '
         || 'when substr(%1$I, 9, 2) <= ''28'' then left(%1$I, 10)::date '
         || 'when to_char((left(%1$I, 7) || ''-01'')::date + (substr(%1$I, 9, 2)::int - 1), ''YYYY-MM-DD'') = left(%1$I, 10) '
         || 'then left(%1$I, 10)::date end end)';
begin
  return format('select src_row, coalesce(op, '''') op, %s ds, %s de, %s wm, %s mm, %s wc from %I where d_start >= %L',
                format(d, 'd_start'), format(d, 'd_end'), format(n, 'work_min'), format(n, 'man_min'), format(n, 'worker_cnt'),
                p_tbl, p_from);
end $f$;

-- 점검 이름(id) → 판정. 화면의 문구는 /edit/ 의 DQ_CHECK 가 같은 id 로 든다.
--   work24  작업시간(분) > 1,440 — 한 건이 하루를 넘는다(종료일 오기입이 대부분)
--   endlt   작업종료일 < 작업시작일
--   future  작업시작일이 내일 이후
--   manmis  작업공수 ≠ 작업시간 × 작업자수 (차이가 30분 이상이고 절반 이상) — 실측 19,881/19,888 행이 정확히 곱이다(v147)
--   mannull 작업공수가 비었는데 작업시간은 있다 — 해외 주간현황은 그 행의 공수를 0 으로 센다
--   spike   운영단위 × 주(월요일 시작)의 공수 합이 앞뒤 8주 중앙값의 2배를 넘고 50h 이상 많다
create or replace function public.edit_dq(p_tbl text default 'sheet_wk', p_from date default null)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_from text := to_char(coalesce(p_from, current_date - 400), 'YYYY-MM-DD');
  v_tom date := current_date + 1;
  r jsonb; s jsonb;
begin
  if p_tbl not in ('sheet_wk', 'kr_sheet_wk') then raise exception 'bad_table: %', p_tbl; end if;
  execute format($q$
    with w as materialized (%s)
    select jsonb_build_object(
      'rows',    count(*),
      'work24',  count(*) filter (where wm > 1440),
      'endlt',   count(*) filter (where de < ds),
      'future',  count(*) filter (where ds > %L::date),
      'manmis',  count(*) filter (where mm is not null and wm is not null and wc > 0
                                   and abs(mm - wm * wc) >= greatest(30, wm * wc * 0.5)),
      'mannull', count(*) filter (where mm is null and wm > 0))
    from w $q$, public._dq_w(p_tbl, v_from), v_tom) into r;
  execute format($q$
    with w as materialized (%s),
    g as (
      select op, date_trunc('week', ds)::date wk, sum(mm) / 60.0 h, count(*) n,
             count(*) filter (where wm > 1440) nb
        from w where ds is not null and mm is not null group by 1, 2),
    b as (
      select g.*, (select percentile_cont(0.5) within group (order by g2.h) from g g2
                    where g2.op = g.op and g2.wk <> g.wk and g2.wk between g.wk - 56 and g.wk + 56) base
        from g)
    select coalesce(jsonb_agg(jsonb_build_object('op', op, 'wk', wk, 'h', round(h::numeric, 1),
                    'base', round(base::numeric, 1), 'n', n, 'nb', nb) order by h / base desc), '[]'::jsonb)
      from b where base > 0 and h > base * 2 and h - base >= 50 $q$, public._dq_w(p_tbl, v_from)) into s;
  return r || jsonb_build_object('spikes', s, 'from', v_from);
end $$;

-- 점검 하나의 «행 번호» — 최대 2,000(화면이 edit_get_many 로 행 전체를 읽는다).
-- spike 는 그 운영단위·주의 행을 공수 큰 순으로(허수는 대개 맨 위 몇 행이다).
create or replace function public.edit_dq_rows(p_tbl text, p_check text, p_op text default null, p_wk date default null, p_from date default null)
returns setof bigint
language plpgsql stable security invoker set search_path = public as $$
declare
  v_from text := to_char(coalesce(p_from, current_date - 400), 'YYYY-MM-DD');
  v_tom date := current_date + 1;
  v_cond text;
begin
  if p_tbl not in ('sheet_wk', 'kr_sheet_wk') then raise exception 'bad_table: %', p_tbl; end if;
  v_cond := case p_check
    when 'work24'  then 'wm > 1440'
    when 'endlt'   then 'de < ds'
    when 'future'  then format('ds > %L::date', v_tom)
    when 'manmis'  then 'mm is not null and wm is not null and wc > 0 and abs(mm - wm * wc) >= greatest(30, wm * wc * 0.5)'
    when 'mannull' then 'mm is null and wm > 0'
    when 'spike'   then format('op = %L and date_trunc(''week'', ds)::date = %L::date and mm is not null', coalesce(p_op, ''), p_wk)
    else null end;
  if v_cond is null then raise exception 'bad_check: %', p_check; end if;
  return query execute format($q$
    with w as materialized (%s)
    select src_row::bigint from w where %s order by coalesce(mm, wm, 0) desc, src_row desc limit 2000 $q$, public._dq_w(p_tbl, v_from), v_cond);
end $$;

revoke all on function public._dq_w(text, text) from public, anon;
grant execute on function public._dq_w(text, text) to authenticated;
revoke all on function public.edit_dq(text, date) from public, anon;
revoke all on function public.edit_dq_rows(text, text, text, date, date) from public, anon;
grant execute on function public.edit_dq(text, date) to authenticated;
grant execute on function public.edit_dq_rows(text, text, text, date, date) to authenticated;
