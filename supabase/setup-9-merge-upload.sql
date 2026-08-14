/* v87 — 구간 교체 업로드 (2026-08-14)
 *
 * 왜 필요한가. 실적을 «통째 교체»로만 올리면, 시스템 추출이 10만행 제한이라
 * 기간을 나눠 뽑는 순간 두 번째 파일이 첫 번째를 지운다. 그렇다고 그냥
 * 이어붙이면 겹치는 구간이 이중 계산된다 — 실측: 새 파일의 대만분 6,534행 중
 * **6,266건이 기존 표에도 있는 실적코드**였다.
 *
 * 그래서 «파일이 덮는 범위만» 교체한다:
 *   삭제 조건 = (운영단위 ∈ 파일의 운영단위 집합) AND (날짜 ∈ 파일의 날짜 범위)
 *   그 뒤 파일 전량을 넣는다.
 * 결과: 대만 2025-01~2026-01 은 그대로 남고, 겹치는 2026-02~08 만 새 것으로 바뀌며,
 * 나머지 사업부는 새로 들어온다. 중복이 원리적으로 생기지 않는다.
 *
 * 왜 키(실적코드) 기반이 아닌가. 자재실적에는 **자연키가 없다** — 실측으로
 * (수선실적번호+자재코드+자재위치+일자) 조합조차 중복 59건이다. 수선실적만
 * 키가 되는 반쪽 규칙을 만들면 두 표가 다른 규율로 갈라진다(제2원칙).
 * 날짜는 두 표 모두 'YYYY-MM-DD' 문자열로 저장돼 있어 그대로 비교하면 된다(실측 확인).
 *
 * 실행: SQL Editor 에 붙여넣고 Run. 여러 번 Run 해도 안전하다.
 * 선행: setup-8-csv-upload.sql (can_write 정책 · csv_upload_begin/finish)
 */

/* 표 → 날짜 컬럼. 여기 없는 표는 구간 교체를 지원하지 않는다(설치현황은 «그 시점의
   전체 명부»라 통째 교체가 맞다 — 구간이라는 개념 자체가 없다). */
create or replace function public._csv_datecol(p_tbl text)
returns text language sql immutable as $$
  select case p_tbl when 'sheet_wk' then 'd_start'
                    when 'sheet_mat' then 'work_date' end
$$;

/* 구간을 세거나(dry) 지운다. 미리보기와 실행이 **같은 조건식**을 쓰도록 한 함수에 둔다 —
   두 벌로 나누면 화면이 "삭제 예정 100행"이라 해놓고 실제로는 다른 수를 지우는 날이 온다. */
create or replace function public.csv_window(
  p_tbl text, p_from text, p_to text, p_ops text[], p_dry boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dc text; n int; tot int; nxt int; sql text;
begin
  if not exists (select 1 from public.allowed_users a
                 where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) then
    raise exception 'read_only';
  end if;
  dc := public._csv_datecol(p_tbl);
  if dc is null then raise exception 'bad_table: %', p_tbl; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad_range'; end if;

  /* 조건: 날짜가 범위 안 AND 운영단위가 파일에 든 것 중 하나.
     날짜 앞 10자만 본다 — 'YYYY-MM-DD hh:mm' 처럼 시각이 붙어 들어온 행이 섞여도
     같은 날로 취급해야 «그 날짜를 덮었다»는 약속이 지켜진다. */
  sql := format('from public.%I where left(coalesce(%I,''''),10) between $1 and $2
                 and coalesce(op,'''') = any($3)', p_tbl, dc);
  execute 'select count(*) ' || sql into n using p_from, p_to, p_ops;
  execute format('select count(*), coalesce(max(src_row),-1)+1 from public.%I', p_tbl) into tot, nxt;

  if not p_dry then
    execute 'delete ' || sql using p_from, p_to, p_ops;
    get diagnostics n = row_count;
    execute format('select count(*), coalesce(max(src_row),-1)+1 from public.%I', p_tbl) into tot, nxt;
  end if;

  -- next_src: 남은 행과 겹치지 않게 이어서 번호를 매긴다(PK 충돌 방지)
  return jsonb_build_object('hit', n, 'rows', tot, 'next_src', nxt, 'dry', p_dry);
end $$;

revoke execute on function public.csv_window(text, text, text, text[], boolean) from public, anon;
grant  execute on function public.csv_window(text, text, text, text[], boolean) to authenticated;

/* 확인 */
select 'csv_window' as rpc,
       (select count(*) from pg_proc where proname='csv_window')::text as 개수
union all select '_csv_datecol(sheet_wk)', coalesce(public._csv_datecol('sheet_wk'),'(없음)')
union all select '_csv_datecol(sheet_mat)', coalesce(public._csv_datecol('sheet_mat'),'(없음)')
union all select '_csv_datecol(sheet_inst)', coalesce(public._csv_datecol('sheet_inst'),'(없음 — 통째 교체만)');
