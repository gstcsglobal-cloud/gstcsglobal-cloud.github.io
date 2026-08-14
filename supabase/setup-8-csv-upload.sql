/* v81 — 시트 자동복사(cron) 정지 + CSV 업로드 권한 (2026-08-13)
 *
 * 사용자 결정: 신규 실적(수선·자재·설치)도 앞으로 CSV 수동 업로드로 넣는다.
 * 구글시트는 은퇴한다. 그러려면 순서가 있다:
 *
 *   ⚠ 이 SQL 을 «먼저» Run 한 뒤에 CSV 를 올려야 한다.
 *     cron 을 안 끄면 옛 시트 내용이 30분마다 업로드를 덮어쓴다.
 *
 * 하는 일 셋:
 *   1. sync-wk · sync-mat · sync-inst cron 정지 (sync-kakao-bot 은 남긴다 — 아래 주의)
 *   2. 미러 3종 + CIP·ABP 표에 can_write 쓰기 정책 (업로드 화면이 브라우저에서 넣는다)
 *   3. 업로드용 RPC 둘 — 비우기(csv_upload_begin)·마무리(csv_upload_finish)
 *
 * 여러 번 Run 해도 안전하다.
 *
 * ⚠ 카카오톡 챗봇은 아직 구글시트를 읽는다(sync-kakao-bot → sheet-proxy → 시트).
 *   시트 파일을 «지우기» 전에 봇을 DB 로 옮겨야 한다. 그 전까지 시트는 그대로 두면
 *   봇도 그대로 돈다(새 데이터만 없을 뿐). 봇 이관은 별도 작업이다.
 */

/* ---------- 1. cron 정지 — 없는 잡은 조용히 넘어간다 ---------- */
do $$
declare j text;
begin
  foreach j in array array['sync-wk','sync-mat','sync-inst'] loop
    begin
      perform cron.unschedule(j);
      raise notice '% 정지됨', j;
    exception when others then
      raise notice '% 없음 — 건너뜀', j;
    end;
  end loop;
end $$;

/* ---------- 2. 쓰기 정책 — setup-7 과 같은 규약 (can_write 만) ----------
 * 미러 3종은 지금까지 service_role 만 썼다("브라우저에서 미러를 고칠 수 있으면
 * 그건 미러가 아니다"). cron 이 죽고 CSV 업로드가 유일한 적재 경로가 되면
 * 그 문장의 전제가 사라진다 — 이제 브라우저 업로드가 곧 적재다. */
do $$
declare t text;
begin
  foreach t in array array['sheet_wk','sheet_mat','sheet_inst',
                           'sheet_cip_f11','sheet_cip_f16','sheet_abp'] loop
    if to_regclass('public.'||t) is null then
      raise notice '% 없음 — 건너뜀', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "allowed write" on public.%I', t);
    execute format($p$create policy "allowed write" on public.%I
        for all to authenticated
        using ( exists (select 1 from public.allowed_users a
                        where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) )
        with check ( exists (select 1 from public.allowed_users a
                        where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) )$p$, t);
  end loop;
end $$;

/* ---------- 3. 업로드 RPC ----------
 * begin: 표를 통째로 비운다. RLS delete 로도 되지만 3만 행을 지우는 것보다
 *        truncate 가 즉시 끝나고, 허용 표 목록·권한 검사를 서버에 둔다.
 * finish: 적재 기록(sheet_sync_log)을 갱신한다. rows 가 실제 행수와 달라지면
 *        dbRows 가 MIRROR_SHORT 로 화면을 막으므로 이 갱신이 없으면 업로드가 무효다.
 *        ms = -1 은 «수동 업로드 모드» 표식 — core.js 가 나이 경고를 끈다. */
create or replace function public.csv_upload_begin(p_tbl text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_users a
                 where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) then
    raise exception 'read_only';
  end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst','sheet_edu','sheet_roster',
                   'sheet_leave','sheet_cip_f11','sheet_cip_f16','sheet_abp') then
    raise exception 'bad_table: %', p_tbl;
  end if;
  execute format('truncate table public.%I', p_tbl);
end $$;

create or replace function public.csv_upload_finish(p_tbl text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text; n int;
begin
  if not exists (select 1 from public.allowed_users a
                 where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) then
    raise exception 'read_only';
  end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst') then
    -- Import 표(교육 등)는 sheet_sync_log 대조가 없으므로 마무리가 필요 없다
    return jsonb_build_object('rows', null, 'log', false);
  end if;
  k := replace(p_tbl, 'sheet_', '');
  execute format('select count(*) from public.%I', p_tbl) into n;
  insert into public.sheet_sync_log(tbl, gid, rows, sheet_rows, ms, err, synced_at)
  values (k, '', n, n, -1, null, now())
  on conflict (tbl) do update set
    rows = excluded.rows, sheet_rows = excluded.sheet_rows,
    ms = -1, err = null, synced_at = now();
  return jsonb_build_object('rows', n, 'log', true);
end $$;

/* 표의 실제 컬럼 목록 — 업로드 화면이 «비우기 전에» 대조하는 데 쓴다.
   한 행을 받아 키를 보는 방법은 표가 비어 있으면 통하지 않는데, 하필 그때가
   이 검사가 가장 필요한 순간이다(적재 실패로 비워진 직후). 그래서 서버에 묻는다.
   실제로 겪은 사고: 콘솔에서 extra 컬럼을 지운 채 업로드 → 비우기는 되고 적재가
   실패해 표가 빈 채로 남았다. 이제 비우기 전에 걸린다. */
create or replace function public.csv_table_cols(p_tbl text)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(column_name::text order by ordinal_position), '{}')
    from information_schema.columns
   where table_schema='public' and table_name=p_tbl
$$;

revoke execute on function public.csv_table_cols(text) from public, anon;
grant  execute on function public.csv_table_cols(text) to authenticated;

revoke execute on function public.csv_upload_begin(text)  from public, anon;
revoke execute on function public.csv_upload_finish(text) from public, anon;
grant  execute on function public.csv_upload_begin(text)  to authenticated;
grant  execute on function public.csv_upload_finish(text) to authenticated;

/* ---------- 확인 ---------- */
select 'cron 남은 sync 잡' as 항목,
       coalesce(string_agg(jobname, ', '), '없음(정상 — kakao-bot 만 남아야 함)') as 값
  from cron.job where jobname like 'sync-%'
union all
select 'RPC', string_agg(proname, ', ')
  from pg_proc where proname in ('csv_upload_begin','csv_upload_finish')
union all
select '쓰기 정책 붙은 표(9개여야 함)', count(*)::text
  from pg_policies where policyname = 'allowed write';
