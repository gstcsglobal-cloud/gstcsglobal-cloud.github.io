-- GST 대시보드 v77 (1단계) — 미러 적재용 함수
-- setup-4-tables.sql을 먼저 Run한 다음 이걸 Run한다.
--
-- 왜 엣지펑션이 PostgREST로 직접 upsert하지 않는가:
--   자재실적이 29,675행 × 39열이다. PostgREST upsert는 행마다 JSON을 왕복시키고
--   배치를 잘게 쪼개야 해서 엣지펑션 실행시간(무료 요금제 벽시계 제약)에 걸린다.
--   jsonb 한 덩이를 넘기고 Postgres 안에서 펼치면 왕복이 배치당 1회로 준다.
--
-- 표 이름을 문자열로 받아 EXECUTE하므로 **화이트리스트로 막는다.**
-- 여기를 열어두면 임의 테이블에 쓰기가 되는 구멍이 된다.

/* ---------- 1. 배치 upsert ---------- */
-- p_rows: [{"src_row":0,"pg":"...","op":"..."}, …] — 키는 DB 컬럼명 그대로.
-- 컬럼 목록은 카탈로그에서 읽는다. 여기에 열 이름을 적으면 SPEC의 네 번째 사본이 된다.
create or replace function public.sheet_sync_upsert(p_tbl text, p_rows jsonb)
returns int language plpgsql as $$
declare n int; t text; cols text; sets text;
begin
  if p_tbl not in ('wk','mat','inst') then
    raise exception 'sheet_sync_upsert: 허용되지 않은 표 %', p_tbl;
  end if;
  t := 'sheet_' || p_tbl;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(quote_ident(column_name) || ' = excluded.' || quote_ident(column_name),
                    ', ' order by ordinal_position)
    into cols, sets
    from information_schema.columns
   where table_schema = 'public' and table_name = t
     and column_name not in ('synced_at', 'src_row');

  execute format($f$
    insert into public.%1$I (src_row, %2$s, synced_at)
    select src_row, %2$s, now()
      from jsonb_populate_recordset(null::public.%1$I, $1)
    on conflict (src_row) do update set %3$s, synced_at = now()
  $f$, t, cols, sets) using p_rows;

  get diagnostics n = row_count;
  return n;
end $$;

/* ---------- 2. 마무리 — 꼬리 자르기 + 기록 ---------- */
-- 시트에서 끝 행이 지워지면 미러에는 남는다. src_row가 새 행수 이상인 것을 지운다.
-- 이 한 줄이 없으면 미러는 시트보다 영영 길어지기만 한다.
create or replace function public.sheet_sync_finish(
  p_tbl text, p_gid text, p_sheet_rows int, p_ms int, p_err text default null)
returns jsonb language plpgsql as $$
declare t text; cut int; n int;
begin
  if p_tbl not in ('wk','mat','inst') then
    raise exception 'sheet_sync_finish: 허용되지 않은 표 %', p_tbl;
  end if;
  t := 'sheet_' || p_tbl;

  if p_err is null then
    execute format('delete from public.%I where src_row >= $1', t) using p_sheet_rows;
    get diagnostics cut = row_count;
  else
    cut := 0;   -- 실패한 적재로 꼬리를 자르면 멀쩡한 행을 지운다
  end if;

  execute format('select count(*) from public.%I', t) into n;

  insert into public.sheet_sync_log(tbl, gid, rows, sheet_rows, ms, err, synced_at)
  values (p_tbl, p_gid, n, p_sheet_rows, p_ms, p_err, now())
  on conflict (tbl) do update set
    gid = excluded.gid, rows = excluded.rows, sheet_rows = excluded.sheet_rows,
    ms = excluded.ms, err = excluded.err, synced_at = excluded.synced_at;

  return jsonb_build_object('rows', n, 'trimmed', cut, 'sheet_rows', p_sheet_rows);
end $$;

/* ---------- 3. 권한 ---------- */
-- 브라우저에서 미러를 고칠 수 있으면 그건 미러가 아니다.
-- sheet-sync 엣지펑션의 service_role만 부른다 (sheet_locks와 같은 규약).
revoke execute on function public.sheet_sync_upsert(text, jsonb)            from public, anon, authenticated;
revoke execute on function public.sheet_sync_finish(text, text, int, int, text) from public, anon, authenticated;
