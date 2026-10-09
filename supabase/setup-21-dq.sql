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

-- ============================================================================
-- v156 — 걸러 보기 · 연결(조인) 길잡이 · 작업공수 자동 채우기 (사용자 요청)
--
-- 사용자: 「필터 잡아서 보고 싶은 것만 볼 수 있게」 · 「"실적 행에 사업부가 안 붙었습니다" 같은 것은 경고만 주지
--          어디서 어떻게 어떤 사이트를 수정해야 하는지 모르잖아 — 길잡이 역할을 하는 기능」 · 「작업공수 채우는 기능」.
-- ⚠ 지우는 문장이 없다(MCP 로 바로 들어간다). 옛 함수 시그니처는 그대로 두고 «새 이름»을 더한다 — 바꾸려면 DROP 이
--   필요하고(확인 창 · v140), 같은 이름 겹치기(overload)는 PostgREST 가 어느 쪽인지 못 가른다.
-- ============================================================================

-- ① edit_dq 에 «운영단위별» 건수를 싣는다 — 화면이 구분(국내·해외 · GST.ORG.region)·운영단위로 걸러 더한다.
--    구분 판정은 브라우저 정본이라 서버에 사본을 두지 않는다(제2원칙). 기간은 p_from 그대로.
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
    with w as materialized (%s),
    o as (
      select op,
        count(*) n,
        count(*) filter (where wm > 1440) work24,
        count(*) filter (where de < ds) endlt,
        count(*) filter (where ds > %L::date) future,
        count(*) filter (where mm is not null and wm is not null and wc > 0
                          and abs(mm - wm * wc) >= greatest(30, wm * wc * 0.5)) manmis,
        count(*) filter (where mm is null and wm > 0) mannull,
        count(*) filter (where mm is null and wm > 0 and wc > 0) mfill
      from w group by op)
    select jsonb_build_object(
      'rows', coalesce(sum(n), 0), 'work24', coalesce(sum(work24), 0), 'endlt', coalesce(sum(endlt), 0),
      'future', coalesce(sum(future), 0), 'manmis', coalesce(sum(manmis), 0), 'mannull', coalesce(sum(mannull), 0),
      'mfill', coalesce(sum(mfill), 0),
      'by_op', coalesce(jsonb_agg(jsonb_build_object('op', op, 'rows', n, 'work24', work24, 'endlt', endlt, 'future', future,
                        'manmis', manmis, 'mannull', mannull, 'mfill', mfill) order by n desc), '[]'::jsonb))
    from o $q$, public._dq_w(p_tbl, v_from), v_tom) into r;
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

-- ② 행 번호 — 운영단위 «여럿»(p_ops · null 이면 전부)과 상한(p_limit · 최대 20,000)을 받는다.
--    mfill = 작업공수가 비었고 작업시간·작업자수가 둘 다 있어 «작업시간 × 작업자수»로 채울 수 있는 행(v147 실측 근거).
create or replace function public.edit_dq_rows2(p_tbl text, p_check text, p_ops text[] default null, p_wk date default null,
                                                p_from date default null, p_limit int default 2000)
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
    when 'mfill'   then 'mm is null and wm > 0 and wc > 0'
    when 'spike'   then format('date_trunc(''week'', ds)::date = %L::date and mm is not null', p_wk)
    else null end;
  if v_cond is null then raise exception 'bad_check: %', p_check; end if;
  if p_ops is not null then v_cond := v_cond || format(' and op = any(%L::text[])', p_ops); end if;
  return query execute format($q$
    with w as materialized (%s)
    select src_row::bigint from w where %s order by coalesce(mm, wm, 0) desc, src_row desc limit %s $q$,
    public._dq_w(p_tbl, v_from), v_cond, least(greatest(coalesce(p_limit, 2000), 1), 20000));
end $$;

-- ③ 설치현황 연결(조인) 길잡이 — 대시보드의 GST.ORG.instIndex 와 «같은 순서»로 찾는다:
--    설비호기(eq_no · 자재는 eq) ↔ 설치현황 Scrubber CODE 먼저, 못 찾으면 S/N(sn_in · 자재는 sn) ↔ Scrubber S/N.
--    열쇠는 공백을 지우고 대문자(instIndex 의 key() — JS \s 의 흔한 글자: 공백·탭·줄바꿈·NBSP·전각 공백) — SPEC-SYNC: assets/core.js GST.ORG.instIndex.
--    ⚠ regexp_replace 는 26만 행에서 4초였다 — translate 로 쓴다.
--    ⚠ 설치현황에 같은 열쇠가 여럿이면 instIndex 는 «처음 것»을 쓴다 — 여기서도 src_row 가 가장 작은 행을 쓴다.
--    판정 넷:  nokey  설비호기·S/N 둘 다 빈칸 — 어느 설비인지 모른다(실적에서 고친다)
--              miss   값은 있는데 설치현황에 없다 — 실적의 표기가 틀렸거나 설치현황에 그 설비가 없다
--              nodiv  이어졌는데 설치현황의 사업부가 빈칸(국내 양식에만 있는 열 — 해외는 화면이 «문제 아님»으로 적는다)
--              nofloor 이어졌는데 설치현황의 Floor 가 빈칸
--    inst_refs = 사업부·Floor 가 빈 «설치현황 행»(ir = 그 행 번호)과 그 행을 가리키는 실적 수 — 고칠 곳은 설치현황이다.
--    p_from 이 있으면 그 날짜(작업시작일 · 자재는 자재실적일자) 이후만 본다 — 화면의 기간 칸.
create or replace function public._dq_jw(p_tbl text, p_from text) returns text
language plpgsql immutable as $f$
declare
  v_inst text := case when p_tbl like 'kr\_%' then 'kr_sheet_inst' else 'sheet_inst' end;
  v_eq text := case when p_tbl like '%sheet\_mat' then 'eq' else 'eq_no' end;
  v_sn text := case when p_tbl like '%sheet\_mat' then 'sn' else 'sn_in' end;
  v_d  text := case when p_tbl like '%sheet\_mat' then 'work_date' else 'd_start' end;
begin
  return format($q$
    with ic as materialized (select distinct on (k) k, src_row ir, div, floor from
             (select upper(translate(coalesce(code, ''), %6$L, '')) k, src_row, div, floor from %1$I) a where k <> '' order by k, src_row),
         isn as materialized (select distinct on (k) k, src_row ir, div, floor from
             (select upper(translate(coalesce(sn, ''), %6$L, '')) k, src_row, div, floor from %1$I) a where k <> '' order by k, src_row),
         w as materialized (select src_row, coalesce(op, '') op, coalesce(%3$I, '') eq, coalesce(%4$I, '') sn,
                   upper(translate(coalesce(%3$I, ''), %6$L, '')) ke, upper(translate(coalesce(%4$I, ''), %6$L, '')) ks
              from %2$I %5$s),
         j as materialized (select w.*, coalesce(ic.ir, isn.ir) ir,
                   case when ic.ir is not null then ic.div else isn.div end div,
                   case when ic.ir is not null then ic.floor else isn.floor end floor
              from w left join ic on ic.k = w.ke and w.ke <> '' left join isn on isn.k = w.ks and w.ks <> '' and ic.ir is null)
    $q$, v_inst, p_tbl, v_eq, v_sn,
    case when p_from is null then '' else format('where %I >= %L', v_d, p_from) end,
    ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(160) || chr(12288));
end $f$;

create or replace function public.edit_dq_join(p_tbl text default 'sheet_wk', p_from date default null)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_from text := case when p_from is null then null else to_char(p_from, 'YYYY-MM-DD') end;
  r jsonb;
begin
  if p_tbl not in ('sheet_wk', 'kr_sheet_wk', 'sheet_mat') then raise exception 'bad_table: %', p_tbl; end if;
  execute public._dq_jw(p_tbl, v_from) || $q$
    , o as (select op, count(*) n,
                   count(*) filter (where ke = '' and ks = '') nokey,
                   count(*) filter (where ir is null and (ke <> '' or ks <> '')) miss,
                   count(*) filter (where ir is not null and coalesce(trim(div), '') = '') nodiv,
                   count(*) filter (where ir is not null and coalesce(trim(floor), '') = '') nofloor
              from j group by op),
      m as (select * from (select op, eq, sn, count(*) n, row_number() over (partition by op order by count(*) desc, eq, sn) rn
                             from j where ir is null and (ke <> '' or ks <> '') group by op, eq, sn) a where rn <= 100),
      x as (select ir, op, count(*) n, count(*) filter (where coalesce(trim(div), '') = '') nd,
                   count(*) filter (where coalesce(trim(floor), '') = '') nf
              from j where ir is not null and (coalesce(trim(div), '') = '' or coalesce(trim(floor), '') = '') group by ir, op)
    select jsonb_build_object(
      'rows', (select coalesce(sum(n), 0) from o),
      'by_op', (select coalesce(jsonb_agg(jsonb_build_object('op', op, 'rows', n, 'nokey', nokey, 'miss', miss, 'nodiv', nodiv, 'nofloor', nofloor)
                        order by n desc), '[]'::jsonb) from o),
      'miss_top', (select coalesce(jsonb_agg(jsonb_build_object('op', op, 'eq', eq, 'sn', sn, 'n', n) order by n desc), '[]'::jsonb) from m),
      'inst_refs', (select coalesce(jsonb_agg(jsonb_build_object('ir', ir, 'op', op, 'n', n, 'nd', nd, 'nf', nf) order by n desc), '[]'::jsonb) from x))
    $q$ into r;
  return r || jsonb_build_object('tbl', p_tbl, 'from', v_from);
end $$;

-- 행 번호 — 판정 하나(nokey·miss·nodiv·nofloor) × 운영단위 여럿 × (miss 면) 그 설비호기·S/N 원문.
create or replace function public.edit_dq_join_rows(p_tbl text, p_kind text, p_ops text[] default null, p_eq text default null,
                                                    p_sn text default null, p_from date default null, p_limit int default 2000)
returns setof bigint
language plpgsql stable security invoker set search_path = public as $$
declare
  v_from text := case when p_from is null then null else to_char(p_from, 'YYYY-MM-DD') end;
  v_cond text;
begin
  if p_tbl not in ('sheet_wk', 'kr_sheet_wk', 'sheet_mat') then raise exception 'bad_table: %', p_tbl; end if;
  v_cond := case p_kind
    when 'nokey'   then 'ke = '''' and ks = '''''
    when 'miss'    then 'ir is null and (ke <> '''' or ks <> '''')'
    when 'nodiv'   then 'ir is not null and coalesce(trim(div), '''') = '''''
    when 'nofloor' then 'ir is not null and coalesce(trim(floor), '''') = '''''
    else null end;
  if v_cond is null then raise exception 'bad_kind: %', p_kind; end if;
  if p_ops is not null then v_cond := v_cond || format(' and op = any(%L::text[])', p_ops); end if;
  if p_eq is not null then v_cond := v_cond || format(' and eq = %L', p_eq); end if;
  if p_sn is not null then v_cond := v_cond || format(' and sn = %L', p_sn); end if;
  return query execute public._dq_jw(p_tbl, v_from)
    || format(' select src_row::bigint from j where %s order by src_row desc limit %s', v_cond, least(greatest(coalesce(p_limit, 2000), 1), 20000));
end $$;

revoke all on function public._dq_jw(text, text) from public, anon;
grant execute on function public._dq_jw(text, text) to authenticated;
revoke all on function public.edit_dq_rows2(text, text, text[], date, date, int) from public, anon;
revoke all on function public.edit_dq_join(text, date) from public, anon;
revoke all on function public.edit_dq_join_rows(text, text, text[], text, text, date, int) from public, anon;
grant execute on function public.edit_dq_rows2(text, text, text[], date, date, int) to authenticated;
grant execute on function public.edit_dq_join(text, date) to authenticated;
grant execute on function public.edit_dq_join_rows(text, text, text[], text, text, date, int) to authenticated;
