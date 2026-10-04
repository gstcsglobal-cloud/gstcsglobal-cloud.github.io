/* v146 — 주간현황(국내) 데모 · 국내 운영자(kr) 등급 (2026-10-04)
 *
 * 사용자: 「국내사이트는 DB 업로드를 내가 하지 않고 국내 담당자에게 맡긴다 · 주간현황(국내)를 데모로 만들어 담당자가
 *          운영해 보고 피드백을 주게 · 관리자 권한으로 할 수 있는 계정 하나 · 해외는 지금 문제없다 ·
 *          양식이 달라 우선 따로 가고, 데모 뒤에 통일된 주간현황에서 별도 맵핑으로 될지를 따진다」
 *   확정(AskUserQuestion): 데이터 = «데모 전용 표로 분리» · 권한 = «국내 전용 운영자» · 계정 = 이메일 없이 아이디·비밀번호.
 *
 * 왜 «따로 표»인가 — 지금 표를 같이 쓰면 국내 담당자의 업로드가 해외를 지울 수 있다:
 *   · 설치현황·인원·교육·휴가는 업로드가 «통째 교체»뿐이다 — 국내 파일만 올리면 해외 행이 같이 사라진다.
 *   · 서버의 쓰기 검사는 «can_write 인가» 하나뿐이라 «국내 계정이 해외 표를 비우는 것»을 막는 장치가 없다.
 *   데모 표(kr_*)에만 쓰게 하면 해외(지금 문제없는) 표·화면은 무엇을 올려도 한 글자도 안 움직인다.
 *
 * 권한 — 새 등급 'kr'(국내 운영자). ⚠ can_write 는 «꺼진 채»로 둔다(아래 제약이 강제한다):
 *   운영 표의 모든 쓰기 검사(RLS «allowed write» · csv_* · edit_note · dbWrite)가 can_write 를 보므로, 그 검사를
 *   한 줄도 안 고치고 «서버에서» 막힌다. 데모 표만 «관리자(admin·can_write) 또는 kr» 로 연다(_kr_can · _tbl_can_write).
 *   데이터 관리(edit_*)는 _edit_allow 가 kr 을 받고, _edit_key 가 kr 에게 «kr_ 표가 아니면 null(= bad_table)» 을 준다 —
 *   열여덟 함수의 본문을 안 고치고 범위를 건다(지우기 문장이 든 edit_delete·edit_restore 를 다시 깔 필요가 없다).
 *
 * 데모 표 일곱 — 주간현황이 읽는 것만: 수선실적·설치현황·인원·교육·휴가·국내 알람·국내 올바.
 *   자재·CIP·ABP 는 주간현황(국내)에 필요 없거나(자재) 해외 전용이라(CIP·ABP 크로스탭) 만들지 않는다.
 *   모양은 운영 표 그대로(create table … like … including all — 열·기본값·제약·식 인덱스·identity).
 *   ⚠ 운영 표에 열을 승격(alter)하면 데모 표에도 같이 해야 한다 — 데모 화면이 그 열을 «이 화면 미적용»으로 본다
 *     (core dbRows 가 실제 열의 교집합만 고르므로 죽지는 않는다).
 *
 * 처음 한 번 «지금의 국내 자료»를 복사해 둔다(표가 비어 있을 때만 — 다시 Run 해도 담당자가 올린 자료를 안 덮는다).
 *   국내 판정은 대시보드 정본(GST.ORG.region · GST.ALARM.region)으로 가린 «값 목록»이다(2026-10 운영 실측의 전 값) —
 *   SQL 에 판정 규칙을 새로 짜지 않는다. 인원·교육·휴가는 작아서(수백 행) 통째로 복사하고 화면의 «구분=국내» 고정이 가른다.
 *
 * 실행 — 1~6절(지우는 문장 없음)은 MCP 로 들어갔다. ⚠ 7절(csv_upload_begin · csv_window)은 본문에 truncate·delete 가 있어
 *   MCP 가 확인 창 뒤로 보낸다 — 사람이 Supabase SQL Editor 에서 «이 파일 통째로» Run 한다(전부 다시 Run 해도 안전하다).
 *   7절이 들어가기 전에는 데모 업로드가 «통째 교체·구간 교체»에서 bad_table 로 멈춘다(이어붙이기는 된다) — 화면이 그렇게 말한다.
 * 선행: setup-8 · setup-10 · setup-15 · setup-16. */

/* ---------- 1. 등급 'kr' ---------- */
alter table public.allowed_users drop constraint if exists allowed_users_role_chk;
alter table public.allowed_users add constraint allowed_users_role_chk check (role in ('viewer','editor','admin','kr'));
-- kr 은 can_write 를 «못» 켠다 — 켜는 순간 운영 표의 can_write 검사를 전부 통과해 해외를 지울 수 있게 된다
alter table public.allowed_users drop constraint if exists allowed_users_kr_ro_chk;
alter table public.allowed_users add constraint allowed_users_kr_ro_chk check (role <> 'kr' or not can_write);

/* ---------- 2. 권한 — 한 곳 ----------
 * _kr_can        : 데모 표에 쓸 수 있는가 = 관리자(admin · can_write) 또는 국내 운영자(kr)
 * _tbl_can_write : 표 이름으로 가른다 — kr_ 표는 _kr_can, 그 밖(운영 표)은 지금까지대로 can_write (한 글자도 안 바뀐다) */
create or replace function public._kr_can() returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.allowed_users a
                  where lower(a.email) = lower(auth.jwt()->>'email')
                    and ((a.role = 'admin' and a.can_write) or a.role = 'kr'))
$$;
create or replace function public._tbl_can_write(p_tbl text) returns boolean
language sql stable set search_path = public as $$
  select case when p_tbl like 'kr\_%' then public._kr_can()
              else exists (select 1 from public.allowed_users a
                            where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) end
$$;
create or replace function public._is_kr() returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.allowed_users a
                  where lower(a.email) = lower(auth.jwt()->>'email') and a.role = 'kr')
$$;

/* ---------- 3. 데모 표 ---------- */
create table if not exists public.kr_sheet_wk         (like public.sheet_wk         including all);
create table if not exists public.kr_sheet_inst       (like public.sheet_inst       including all);
create table if not exists public.kr_sheet_roster     (like public.sheet_roster     including all);
create table if not exists public.kr_sheet_edu        (like public.sheet_edu        including all);
create table if not exists public.kr_sheet_leave      (like public.sheet_leave      including all);
create table if not exists public.kr_sheet_alarm      (like public.sheet_alarm      including all);
create table if not exists public.kr_sheet_allbypass  (like public.sheet_allbypass  including all);

-- 읽기 = 허용된 로그인 사용자 누구나(운영 표와 같은 규약) · 쓰기 = _kr_can 과 같은 조건(정책 안에서 함수 대신 그대로 적는다 —
-- 내부 함수는 authenticated 실행 권한을 회수하므로 정책이 부르면 «permission denied» 로 읽기까지 막힌다)
do $$
declare t text;
begin
  foreach t in array array['kr_sheet_wk','kr_sheet_inst','kr_sheet_roster','kr_sheet_edu','kr_sheet_leave',
                           'kr_sheet_alarm','kr_sheet_allbypass'] loop
    execute format('alter table public.%I enable row level security', t);
    -- 표 권한은 명시한다 — Supabase 의 «새 표 기본 권한»에 기대면, 그 설정이 다른 프로젝트·복제본에서 «permission denied» 로 읽기부터 막힌다.
    -- 무엇을 읽고 쓰나는 아래 RLS 가 정한다(anon 은 주지 않는다 — 로그인 토큰이 없으면 RLS 가 어차피 막는다).
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'kr read') then
      execute format($p$create policy "kr read" on public.%I for select to authenticated
          using ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')) )$p$, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'kr write') then
      execute format($p$create policy "kr write" on public.%I for all to authenticated
          using ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')
                           and ((a.role = 'admin' and a.can_write) or a.role = 'kr')) )
          with check ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')
                           and ((a.role = 'admin' and a.can_write) or a.role = 'kr')) )$p$, t);
    end if;
  end loop;
  -- identity 열(인원·교육·휴가의 id)의 시퀀스 — 새 행을 넣을 때 쓴다
  for t in select pg_get_serial_sequence('public.' || c.table_name, c.column_name)
             from information_schema.columns c
            where c.table_schema = 'public' and c.table_name like 'kr\_sheet\_%' and c.is_identity = 'YES' loop
    if t is not null then execute format('grant usage, select on sequence %s to authenticated', t); end if;
  end loop;
end $$;

/* ---------- 4. 처음 한 번 — 지금의 국내 자료 복사 (표가 비어 있을 때만) ----------
 * identity 열(인원·교육·휴가의 id)은 빼고 넣는다 — 데모 표의 시퀀스가 새 번호를 준다(운영 번호를 들고 오면 다음 입력이 부딪힌다).
 * 미러(수선·설치)는 sheet_sync_log 에 «적재 기록»을 함께 남긴다 — 없으면 화면이 MIRROR_EMPTY 로 멈춘다(ms = -1 = 수동 업로드 표식). */
do $$
declare
  spec text[][] := array[
    ['kr_sheet_wk',        'sheet_wk',        $w$op = any(array['SEC Scrubber','SDC Scrubber','SK Scrubber','SEC Chiller','SDC Chiller','국내기타 SCRUBBER'])$w$],
    ['kr_sheet_inst',      'sheet_inst',      $w$country = any(array['SEC Scrubber','SDC Scrubber','SK Scrubber','국내기타 SCRUBBER','국내 기타 CHILLER'])$w$],
    ['kr_sheet_alarm',     'sheet_alarm',     $w$op = any(array['K운영','P운영','H운영'])$w$],
    ['kr_sheet_allbypass', 'sheet_allbypass', $w$op = any(array['K운영','P운영','H운영'])$w$],
    ['kr_sheet_roster',    'sheet_roster',    'true'],
    ['kr_sheet_edu',       'sheet_edu',       'true'],
    ['kr_sheet_leave',     'sheet_leave',     'true']];
  i int; dst text; src text; w text; cols text; empty boolean; n int;
begin
  for i in 1 .. array_length(spec, 1) loop
    dst := spec[i][1]; src := spec[i][2]; w := spec[i][3];
    execute format('select not exists (select 1 from public.%I)', dst) into empty;
    if not empty then raise notice '% — 이미 자료가 있어 건너뜀', dst; continue; end if;
    select string_agg(format('%I', column_name), ', ' order by ordinal_position) into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = dst and is_identity = 'NO' and is_generated = 'NEVER';
    execute format('insert into public.%I (%s) select %s from public.%I where %s', dst, cols, cols, src, w);
    get diagnostics n = row_count;
    raise notice '% ← % : %행', dst, src, n;
  end loop;
end $$;

insert into public.sheet_sync_log(tbl, gid, rows, sheet_rows, ms, err, synced_at)
select k, '', n, n, -1, null, now()
  from (select 'kr_wk' k, (select count(*) from public.kr_sheet_wk)::int n
        union all select 'kr_inst', (select count(*) from public.kr_sheet_inst)::int) z
 where n > 0
on conflict (tbl) do nothing;

/* ---------- 5. 업로드·데이터 관리 함수가 데모 표를 받는다 (지우는 문장 없음) ---------- */

-- 구간 교체의 날짜 열 — 데모 표도 같은 열
create or replace function public._csv_datecol(p_tbl text)
returns text language sql immutable as $$
  select case p_tbl when 'sheet_wk' then 'd_start'
                    when 'sheet_mat' then 'work_date'
                    when 'sheet_alarm' then 'occur_date'
                    when 'sheet_allbypass' then 'occur_date'
                    when 'kr_sheet_wk' then 'd_start'
                    when 'kr_sheet_alarm' then 'occur_date'
                    when 'kr_sheet_allbypass' then 'occur_date' end
$$;

-- 적재 기록(캐시 도장) — 데모 미러는 'kr_wk' · 'kr_inst' 로 남는다(core dbRows 가 같은 열쇠로 읽는다)
create or replace function public.csv_upload_finish(p_tbl text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text; n int;
begin
  if not public._tbl_can_write(p_tbl) then raise exception 'read_only'; end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst','kr_sheet_wk','kr_sheet_inst') then
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

-- 데이터 관리 — kr 도 들어온다(범위는 _edit_key 가 건다)
create or replace function public._edit_allow(p_op text) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.allowed_users a
                  where lower(a.email) = lower(auth.jwt()->>'email')
                    and ((a.can_write and a.role = 'admin') or a.role = 'kr'))
$$;

/* 표 사전 — 데모 표를 더하고, kr 에게는 «kr_ 표가 아니면 null» 을 준다.
 * null 은 모든 edit_* 에서 bad_table · 되돌리기에서 not_restorable 이다 — 국내 운영자가 운영 표를 고치거나 되돌릴 길이 없다.
 * ⚠ immutable → stable: 부르는 사람(로그인 토큰)에 따라 답이 달라지므로 immutable 이면 안 된다. */
create or replace function public._edit_key(p_tbl text) returns text
language sql stable set search_path = public as $$
  select case when p_tbl not like 'kr\_%' and public._is_kr() then null
         else case p_tbl when 'sheet_wk'           then 'src_row'
                         when 'sheet_mat'          then 'src_row'
                         when 'sheet_inst'         then 'src_row'
                         when 'sheet_alarm'        then 'src_row'
                         when 'sheet_allbypass'    then 'src_row'
                         when 'sheet_roster'       then 'id'
                         when 'sheet_edu'          then 'id'
                         when 'sheet_leave'        then 'id'
                         when 'kr_sheet_wk'        then 'src_row'
                         when 'kr_sheet_inst'      then 'src_row'
                         when 'kr_sheet_alarm'     then 'src_row'
                         when 'kr_sheet_allbypass' then 'src_row'
                         when 'kr_sheet_roster'    then 'id'
                         when 'kr_sheet_edu'       then 'id'
                         when 'kr_sheet_leave'     then 'id' end end
$$;

/* 인원 → 교육 연쇄 — 데모 인원을 고치면 «데모» 교육 표가 따라간다(운영 교육 표가 아니다).
 * 규칙은 그대로(사번으로, 없으면 옛 이름으로 · 정확히 한 행일 때만 — core GST.dbWrite cascade 와 SPEC-SYNC).
 * 옛 세 인자 함수는 운영 표 이름으로 이것을 부르는 얇은 껍데기로 남긴다(본문 한 벌). */
create or replace function public._edit_cascade_edu_t(p_old jsonb, p_new jsonb, p_ref bigint, p_edu text) returns jsonb
language plpgsql set search_path = public as $$
declare oid_ text; nid text; onm text; nnm text; n int := 0; eid bigint; eb jsonb; ea jsonb;
begin
  if p_edu not in ('sheet_edu','kr_sheet_edu') then raise exception 'bad_table: %', p_edu; end if;
  oid_ := coalesce(nullif(btrim(p_old->>'사원번호'),''), nullif(btrim(p_old->>'ID'),''));
  nid  := coalesce(nullif(btrim(p_new->>'사원번호'),''), nullif(btrim(p_new->>'ID'),''));
  onm  := coalesce(nullif(btrim(p_old->>'이름(영문)'),''), nullif(btrim(p_old->>'Name((영문)'),''));
  nnm  := coalesce(nullif(btrim(p_new->>'이름(영문)'),''), nullif(btrim(p_new->>'Name((영문)'),''));
  if oid_ is not distinct from nid and onm is not distinct from nnm then return null; end if;
  if oid_ ~ '^\d{1,18}$' then
    execute format('select count(*), min(id) from public.%I where "사원번호" = $1', p_edu) into n, eid using oid_::bigint;
  end if;
  if n <> 1 and onm is not null then
    execute format('select count(*), min(id) from public.%I where "인원" = $1', p_edu) into n, eid using onm;
  end if;
  if n <> 1 then return jsonb_build_object('done', false, 'n', n); end if;
  execute format('select to_jsonb(e) from public.%I e where id = $1', p_edu) into eb using eid;
  execute format('update public.%I set
      "사원번호" = case when $1 ~ ''^\d{1,18}$'' then $1::bigint else "사원번호" end,
      "인원"     = coalesce($2, "인원")
    where id = $3', p_edu) using nid, nnm, eid;
  execute format('select to_jsonb(e) from public.%I e where id = $1', p_edu) into ea using eid;
  perform public._edit_log(p_edu, eid::text, 'cascade', eb, ea, p_ref);
  return jsonb_build_object('done', true, 'edu', eid);
end $$;
create or replace function public._edit_cascade_edu(p_old jsonb, p_new jsonb, p_ref bigint) returns jsonb
language sql set search_path = public as $$ select public._edit_cascade_edu_t(p_old, p_new, p_ref, 'sheet_edu') $$;

/* 바뀐 열만 실제로 쓰고 이력을 남긴다 — v146: 데모 인원의 연쇄는 데모 교육 표로(그 밖은 setup-16 그대로) */
create or replace function public._edit_apply(p_tbl text, p_key bigint, p_cur jsonb, p_changes jsonb, p_op text, p_ref bigint)
returns jsonb language plpgsql set search_path = public as $$
declare kc text := public._edit_key(p_tbl); sets text; nxt jsonb; lid bigint; casc jsonb := null; stamp boolean;
begin
  stamp := exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = p_tbl and column_name = 'imported_at');
  p_changes := p_changes - 'imported_at';
  select string_agg(format('%I = r.%I', k, k), ', ') into sets from jsonb_object_keys(p_changes) k;
  if stamp then sets := sets || ', imported_at = now()'; end if;
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.%I = $2',
                 p_tbl, sets, p_tbl, kc) using (p_cur || p_changes), p_key;
  nxt := public._edit_row(p_tbl, p_key);
  lid := public._edit_log(p_tbl, p_key::text, p_op, p_cur - 'imported_at', nxt - 'imported_at', p_ref);
  if p_tbl in ('sheet_roster','kr_sheet_roster') then
    casc := public._edit_cascade_edu_t(p_cur, nxt, lid, case when p_tbl like 'kr\_%' then 'kr_sheet_edu' else 'sheet_edu' end);
  end if;
  return jsonb_build_object('ok', true, 'row', nxt, 'hash', public._edit_hash(nxt), 'log', lid, 'cascade', casc);
end $$;

-- 업로드 요약 기록 — 데모 표도 받는다 · 권한은 표 이름으로 가른다
create or replace function public.edit_note(p_tbl text, p_op text, p_key text, p_before jsonb, p_after jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not public._tbl_can_write(p_tbl) then raise exception 'read_only'; end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst','sheet_edu','sheet_roster','sheet_leave',
                   'sheet_cip_f11','sheet_cip_f16','sheet_abp','sheet_alarm','sheet_allbypass',
                   'kr_sheet_wk','kr_sheet_inst','kr_sheet_roster','kr_sheet_edu','kr_sheet_leave',
                   'kr_sheet_alarm','kr_sheet_allbypass') then
    raise exception 'bad_table: %', p_tbl;
  end if;
  if p_op !~ '^(upload:(full|win|add)|dbw:(update|append|delete))$' then raise exception 'bad_op: %', p_op; end if;
  if coalesce(pg_column_size(p_before), 0) + coalesce(pg_column_size(p_after), 0) > 262144 then
    raise exception 'too_large';
  end if;
  return public._edit_log(p_tbl, coalesce(nullif(p_key, ''), '*'), p_op, p_before, p_after, null);
end $$;

-- «데이터 관리에서 고친 행이 덮인다» 경고 — 데모 표 업로드에서도 뜬다(권한만 표 이름으로 가른다 · 식은 setup-16 6절 그대로)
create or replace function public.edit_overwrites(p_tbl text, p_from text default null, p_to text default null, p_ops text[] default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare kc text := public._edit_key(p_tbl); dc text; tc text; w text := 'true'; r jsonb;
begin
  if not public._tbl_can_write(p_tbl) then raise exception 'read_only'; end if;
  if kc is null then raise exception 'bad_table: %', p_tbl; end if;
  if p_from is not null then
    dc := public._csv_datecol(p_tbl);
    if dc is null then raise exception 'bad_table: %', p_tbl; end if;
    if p_to is null or p_from > p_to then raise exception 'bad_range'; end if;
    w := format('left(coalesce(t.%I::text,''''),10) between $1 and $2 and coalesce(t.op,'''') = any($3)', dc);
  end if;
  select c.column_name::text into tc from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_tbl and c.column_name in ('synced_at','imported_at')
   order by c.column_name desc limit 1;
  execute format(
    'with e as (
       select x.row_key, max(x.edited_at) at, array_agg(distinct x.edited_by) whos
         from public.sheet_edits x
        where x.tbl = %2$L and x.row_key ~ ''^[0-9]{1,18}$''
          and x.op in (''update'',''insert'',''restore'',''cascade'',''dbw:update'',''dbw:append'')
        group by x.row_key
     ), hit as (
       select t.%1$I k, e.at, e.whos from e join public.%2$I t on t.%1$I = e.row_key::bigint
        where %3$s %4$s
     )
     select jsonb_build_object(
       ''n'',    (select count(*) from hit),
       ''last'', (select max(at) from hit),
       ''keys'', coalesce((select to_jsonb((array_agg(k order by k))[1:20]) from hit), ''[]''::jsonb),
       ''who'',  coalesce((select jsonb_agg(distinct u) from hit, unnest(whos) u), ''[]''::jsonb))',
    kc, p_tbl, w, case when tc is null then '' else format('and e.at >= t.%I', tc) end)
    into r using p_from, p_to, p_ops;
  return r;
end $$;

/* 같은 S/N 의 직전 수선실적 — 어느 수선실적 표에서 찾나를 받는다(데모 화면은 데모 수선실적에서 찾아야 한다).
 * 본문은 setup-16 7절과 같은 식이다 — ⚠ 식이 식 인덱스와 «글자까지» 같아야 인덱스를 탄다(데모 표는 like … including all 로
 *   같은 식 인덱스를 받았다). t-editsql [11-0] 이 두 식을 글자로 대조한다. 한 인자 판(setup-16)은 운영 표 이름으로
 *   이것을 부르는 껍데기가 된다(본문 한 벌). */
create or replace function public.edit_last_wk(p_sns text[], p_tbl text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public._edit_allow('read') then raise exception 'forbidden'; end if;
  if p_tbl not in ('sheet_wk','kr_sheet_wk') or public._edit_key(p_tbl) is null then raise exception 'bad_table: %', p_tbl; end if;
  if coalesce(array_length(p_sns, 1), 0) > 2000 then raise exception 'too_many: %', array_length(p_sns, 1); end if;
  execute format($q$
    with ks as (
      select distinct upper(regexp_replace(coalesce(s, ''), '[^0-9A-Za-z]', '', 'g')) k
        from unnest(coalesce($1, '{}'::text[])) s
    ), w as (
      select z.k, z.src_row, z.rn from (
        select ks.k, t.src_row,
               row_number() over (partition by ks.k order by left(coalesce(t.d_start, ''), 19) desc, t.src_row desc) rn
          from ks join public.%1$I t on upper(regexp_replace(coalesce(t.sn_in, ''), '[^0-9A-Za-z]', '', 'g')) = ks.k
         where ks.k <> ''
      ) z where z.rn <= 2
    )
    select coalesce(jsonb_object_agg(a.k, a.rows), '{}'::jsonb) from (
      select w.k, jsonb_agg(to_jsonb(t) - 'extra' - 'synced_at' order by w.rn) rows
        from w join public.%1$I t on t.src_row = w.src_row
       group by w.k
    ) a$q$, p_tbl) into r using p_sns;
  return r;
end $$;
create or replace function public.edit_last_wk(p_sns text[]) returns jsonb
language sql stable security definer set search_path = public as $$ select public.edit_last_wk(p_sns, 'sheet_wk') $$;

/* ---------- 6. 실행 권한 ---------- */
do $$
declare f text;
begin
  foreach f in array array['public._kr_can()', 'public._tbl_can_write(text)', 'public._is_kr()',
                           'public._edit_cascade_edu_t(jsonb,jsonb,bigint,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.edit_last_wk(text[],text)', 'public.edit_last_wk(text[])'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

/* ---------- 7. 비우기·구간 교체가 데모 표를 받는다 (⚠ SQL Editor 에서 Run — 본문에 truncate·delete) ----------
 * 식은 setup-8·setup-10 그대로다. 바뀐 것은 둘뿐 — 허용 표에 데모 표 · 권한을 표 이름으로 가른다(_tbl_can_write). */
create or replace function public.csv_upload_begin(p_tbl text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._tbl_can_write(p_tbl) then raise exception 'read_only'; end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst','sheet_edu','sheet_roster',
                   'sheet_leave','sheet_cip_f11','sheet_cip_f16','sheet_abp',
                   'sheet_alarm','sheet_allbypass',
                   'kr_sheet_wk','kr_sheet_inst','kr_sheet_roster','kr_sheet_edu','kr_sheet_leave',
                   'kr_sheet_alarm','kr_sheet_allbypass') then
    raise exception 'bad_table: %', p_tbl;
  end if;
  execute format('truncate table public.%I', p_tbl);
end $$;

create or replace function public.csv_window(
  p_tbl text, p_from text, p_to text, p_ops text[], p_dry boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dc text; n int; tot int; nxt int; sql text;
begin
  if not public._tbl_can_write(p_tbl) then raise exception 'read_only'; end if;
  dc := public._csv_datecol(p_tbl);
  if dc is null then raise exception 'bad_table: %', p_tbl; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'bad_range'; end if;

  /* 날짜 앞 10자만 본다 — 'YYYY-MM-DD hh:mm' 처럼 시각이 붙어 들어온 행이 섞여도
     같은 날로 취급해야 «그 날짜를 덮었다»는 약속이 지켜진다.
     date 열은 ::text 로 캐스팅하면 정확히 'YYYY-MM-DD' 라 같은 식이 그대로 통한다. */
  sql := format('from public.%I where left(coalesce(%I::text,''''),10) between $1 and $2
                 and coalesce(op,'''') = any($3)', p_tbl, dc);
  execute 'select count(*) ' || sql into n using p_from, p_to, p_ops;
  execute format('select count(*), coalesce(max(src_row),-1)+1 from public.%I', p_tbl) into tot, nxt;

  if not p_dry then
    execute 'delete ' || sql using p_from, p_to, p_ops;
    get diagnostics n = row_count;
    execute format('select count(*), coalesce(max(src_row),-1)+1 from public.%I', p_tbl) into tot, nxt;
  end if;

  return jsonb_build_object('hit', n, 'rows', tot, 'next_src', nxt, 'dry', p_dry);
end $$;

revoke execute on function public.csv_window(text, text, text, text[], boolean) from public, anon;
grant  execute on function public.csv_window(text, text, text, text[], boolean) to authenticated;
revoke execute on function public.csv_upload_begin(text) from public, anon;
grant  execute on function public.csv_upload_begin(text) to authenticated;

/* ---------- 확인 ---------- */
select 'kr 데모 표' as 항목, string_agg(c.relname || ' ' || coalesce(s.n_live_tup, 0), ' · ' order by c.relname) as 값
  from pg_class c join pg_namespace n on n.oid = c.relnamespace left join pg_stat_user_tables s on s.relid = c.oid
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'kr\_sheet\_%'
union all
select '등급 제약', string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint
 where conrelid = 'public.allowed_users'::regclass and contype = 'c';
