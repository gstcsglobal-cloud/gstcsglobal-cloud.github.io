/* v140 — 관리자 «데이터 관리»(/edit/) 쓰기 통로 + 변경 이력 (2026-10)
 *
 * 사용자 요청: 「설치·인원·수선실적을 화면에서 직접 검색해 고치고, 한 행씩 넣고, 지우고 …
 *              삭제된 것은 수파베이스에 기록돼야 역추적을 하지」. 우선은 관리자 한 명만.
 *
 * 왜 RPC(함수)인가 — 브라우저가 표를 직접 update/delete 해도 RLS 상으로는 된다(can_write).
 * 그런데 그렇게 하면 세 가지가 «따로» 일어나야 하고, 하나라도 빠지면 조용히 틀린다:
 *   ① 쓰기  ② 이력(sheet_edits)  ③ 캐시 도장(sheet_sync_log.synced_at)
 *   · ③ 이 빠지면 다른 사람 브라우저는 옛 캐시를 계속 쓴다(열쇠 = synced_at+행수 · v101).
 *     실제로 고장분석의 dq 편집이 이 상태였다 — 고친 값이 새로고침 뒤 옛 값으로 보였다.
 *   · 행 추가·삭제 뒤 ③ 이 빠지면 행수가 로그와 어긋나 MIRROR_SHORT 로 화면이 옛 시트로 폴백한다.
 * 그래서 셋을 «한 트랜잭션» 안에서 한다. 하나가 실패하면 전부 없던 일이 된다.
 *
 * 지키는 것:
 *   - 권한 판정은 _edit_allow(op) «한 곳»이다. 지금은 admin + can_write 만.
 *     나중에 LV 별로 나눌 때(사용자 예고) 여기 한 함수만 고친다 — op 인자를 미리 받아 둔 이유다.
 *   - 행은 업무 키가 아니라 PK 로 찾는다(src_row · id). 실적코드·CODE 는 빈값·중복이 실측으로 있다(setup-4).
 *   - 동시 수정은 «행 해시»로 막는다. 연 뒤에 누가(또는 재업로드가) 그 행을 바꿨으면 conflict 를 돌려준다.
 *     ⚠ 통째 재업로드는 src_row 를 0 부터 다시 매기므로, 같은 번호가 «다른 행»이 된다 — 해시가 그것도 잡는다.
 *   - 빈칸은 null 이다(업로드·sync 의 toRows 규약). '' 로 두면 같은 «빈 값»이 두 가지가 된다.
 *   - 이력은 «행 전체»를 담는다(before/after). 삭제도 전체를 담으므로 edit_restore 로 되살릴 수 있다.
 *
 * 이력 표는 새로 만들지 않는다 — 옛 sheet-write 엣지펑션이 쓰던 sheet_edits 를 그대로 쓴다
 * (읽기 정책·인덱스가 이미 있다). 옛 6행은 before/after 가 «배열»이고 tbl 이 비어 있다 — 화면이 둘 다 읽는다.
 * insert 정책은 여전히 «없다» — 이력은 아래 definer 함수만 남길 수 있고 사용자는 위조할 수 없다.
 *
 * 선행: setup-8(csv_upload_finish) · setup-15(role). 여러 번 Run 해도 안전하다.
 * v141 — 5절(엑셀 일괄 수정: edit_get_many · edit_bulk)을 더했다. 5절만 따로 Run 해도 된다(그 절에 지우는 문장이 없다).
 */

/* ---------- 0. 이력 표 보강 ---------- */
alter table public.sheet_edits add column if not exists tbl text;     -- 실제 표 이름 (gid 만으로는 Import·원장 표를 못 가른다)
alter table public.sheet_edits add column if not exists ref bigint;   -- 되돌리기·연쇄 수정이 «어느 이력»에서 나왔나
create index if not exists sheet_edits_tbl_at_idx on public.sheet_edits(tbl, edited_at desc);

/* ---------- 1. 권한 — 한 곳 ----------
 * p_op: read · update · insert · delete · restore · bulk(v141 엑셀 일괄). 지금은 전부 같은 규칙(admin)이다. */
create or replace function public._edit_allow(p_op text) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.allowed_users a
                  where lower(a.email) = lower(auth.jwt()->>'email')
                    and a.can_write and a.role = 'admin')
$$;

/* ---------- 2. 표 사전 ----------
 * 고칠 수 있는 표와 그 PK. 여기 없는 표는 모든 edit_* 가 bad_table 로 거절한다.
 * 미러 3종은 src_row, Import 표(인원·교육·휴가)는 id(identity). 원장(알람·올바)·CIP·ABP 는 아직 뺀다 —
 * 원장은 «구간 교체»가 행을 통째로 갈아끼우는 표라 한 행 편집이 다음 업로드에 그대로 덮인다. */
create or replace function public._edit_key(p_tbl text) returns text
language sql immutable as $$
  select case p_tbl when 'sheet_wk'     then 'src_row'
                    when 'sheet_mat'    then 'src_row'
                    when 'sheet_inst'   then 'src_row'
                    when 'sheet_roster' then 'id'
                    when 'sheet_edu'    then 'id'
                    when 'sheet_leave'  then 'id' end
$$;
-- 옛 이력과 같은 열(gid)에 시트 gid 를 적는다. 원장 표처럼 gid 가 없는 표는 표 이름 그대로.
create or replace function public._edit_gid(p_tbl text) returns text
language sql immutable as $$
  select case p_tbl when 'sheet_wk' then '646668307' when 'sheet_mat' then '31302669'
    when 'sheet_inst' then '891608329' when 'sheet_roster' then '1213453343'
    when 'sheet_edu' then '0' when 'sheet_leave' then '262805841'
    when 'sheet_cip_f11' then '2123129719' when 'sheet_cip_f16' then '1999732389'
    when 'sheet_abp' then '1263412805' else p_tbl end
$$;
-- 행 해시 — synced_at 은 «언제 적재했나»라 내용이 아니다. jsonb 의 글자 표현은 키 순서가 정해져 있어 안정적이다.
create or replace function public._edit_hash(r jsonb) returns text
language sql immutable as $$ select md5((r - 'synced_at')::text) $$;

create or replace function public._edit_row(p_tbl text, p_key bigint, p_lock boolean default false) returns jsonb
language plpgsql set search_path = public as $$
declare r jsonb; kc text := public._edit_key(p_tbl);
begin
  if kc is null then raise exception 'bad_table: %', p_tbl; end if;
  execute format('select to_jsonb(t) from public.%I t where %I = $1 %s', p_tbl, kc,
                 case when p_lock then 'for update' else '' end) into r using p_key;
  return r;
end $$;

/* 들어온 값 정리 — 실제 열만 · 키·관리 열은 못 바꾼다 · 빈 글자는 null */
create or replace function public._edit_clean(p_tbl text, p_vals jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare k text; v jsonb; out jsonb := '{}'::jsonb; cols text[];
begin
  if p_vals is null or jsonb_typeof(p_vals) <> 'object' then raise exception 'bad_values'; end if;
  select array_agg(column_name::text) into cols from information_schema.columns
   where table_schema = 'public' and table_name = p_tbl;
  for k, v in select * from jsonb_each(p_vals) loop
    if k in ('src_row','id','synced_at','imported_at','created_at') then raise exception 'locked_column: %', k; end if;
    if not (k = any(cols)) then raise exception 'bad_column: %', k; end if;
    if jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '' then v := 'null'::jsonb; end if;
    out := out || jsonb_build_object(k, v);
  end loop;
  return out;
end $$;

create or replace function public._edit_log(p_tbl text, p_key text, p_op text, p_before jsonb, p_after jsonb, p_ref bigint default null)
returns bigint language sql set search_path = public as $$
  insert into public.sheet_edits(gid, tbl, row_key, op, before, after, edited_by, ref)
  values (public._edit_gid(p_tbl), p_tbl, p_key, p_op, p_before, p_after,
          coalesce(auth.jwt()->>'email', '?'), p_ref)
  returning id
$$;

/* 인원 → 교육 연쇄 — 사번·이름이 바뀌면 교육 표의 짝 행도 같은 글자로(조인이 끊기지 않게).
 * ⚠ 규칙은 core.js GST.dbWrite 의 cascade 와 «같다»: 사번으로 찾고, 없으면 옛 이름으로,
 *   어느 쪽이든 정확히 한 행일 때만. 두 곳 중 하나만 고치면 hr 화면과 이 화면이 다른 행을 고친다. */
create or replace function public._edit_cascade_edu(p_old jsonb, p_new jsonb, p_ref bigint) returns jsonb
language plpgsql set search_path = public as $$
declare oid_ text; nid text; onm text; nnm text; n int := 0; eid bigint; eb jsonb; ea jsonb;
begin
  oid_ := coalesce(nullif(btrim(p_old->>'사원번호'),''), nullif(btrim(p_old->>'ID'),''));
  nid  := coalesce(nullif(btrim(p_new->>'사원번호'),''), nullif(btrim(p_new->>'ID'),''));
  onm  := coalesce(nullif(btrim(p_old->>'이름(영문)'),''), nullif(btrim(p_old->>'Name((영문)'),''));
  nnm  := coalesce(nullif(btrim(p_new->>'이름(영문)'),''), nullif(btrim(p_new->>'Name((영문)'),''));
  if oid_ is not distinct from nid and onm is not distinct from nnm then return null; end if;
  if oid_ ~ '^\d{1,18}$' then
    select count(*), min(id) into n, eid from public.sheet_edu where "사원번호" = oid_::bigint;
  end if;
  if n <> 1 and onm is not null then
    select count(*), min(id) into n, eid from public.sheet_edu where "인원" = onm;
  end if;
  if n <> 1 then return jsonb_build_object('done', false, 'n', n); end if;
  select to_jsonb(e) into eb from public.sheet_edu e where id = eid;
  update public.sheet_edu set
      "사원번호" = case when nid ~ '^\d{1,18}$' then nid::bigint else "사원번호" end,
      "인원"     = coalesce(nnm, "인원")
   where id = eid;
  select to_jsonb(e) into ea from public.sheet_edu e where id = eid;
  perform public._edit_log('sheet_edu', eid::text, 'cascade', eb, ea, p_ref);
  return jsonb_build_object('done', true, 'edu', eid);
end $$;

/* 바뀐 열만 실제로 쓰고 이력을 남긴다 (update · restore 공용) */
create or replace function public._edit_apply(p_tbl text, p_key bigint, p_cur jsonb, p_changes jsonb, p_op text, p_ref bigint)
returns jsonb language plpgsql set search_path = public as $$
declare kc text := public._edit_key(p_tbl); sets text; nxt jsonb; lid bigint; casc jsonb := null;
begin
  select string_agg(format('%I = r.%I', k, k), ', ') into sets from jsonb_object_keys(p_changes) k;
  -- jsonb_populate_record 가 열 타입으로 바꿔 준다(교육 표의 bigint 사번 등). 바꾸는 열만 set 한다.
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.%I = $2',
                 p_tbl, sets, p_tbl, kc) using (p_cur || p_changes), p_key;
  nxt := public._edit_row(p_tbl, p_key);
  lid := public._edit_log(p_tbl, p_key::text, p_op, p_cur, nxt, p_ref);
  if p_tbl = 'sheet_roster' then casc := public._edit_cascade_edu(p_cur, nxt, lid); end if;
  return jsonb_build_object('ok', true, 'row', nxt, 'hash', public._edit_hash(nxt), 'log', lid, 'cascade', casc);
end $$;

/* 새 행 넣기 (insert · 삭제 되돌리기 공용). 미러 표는 src_row = max+1 — 업로드 «이어붙이기»와 같은 규칙.
 * 원래 번호를 살리고 싶으면(되돌리기) p_keep 에 번호를 주고, 비어 있을 때만 쓴다. */
create or replace function public._edit_put(p_tbl text, p_vals jsonb, p_keep bigint default null)
returns bigint language plpgsql set search_path = public as $$
declare kc text := public._edit_key(p_tbl); v jsonb; nk bigint; cols text; ov text := ''; free boolean := false;
begin
  -- 지금 표에 있는 열만 — 이력의 행에는 그 뒤 사라진 열이 있을 수 있다
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v
    from jsonb_each(p_vals - 'synced_at' - kc) e
   where exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = p_tbl and c.column_name = e.key);
  if p_keep is not null then
    execute format('select not exists(select 1 from public.%I where %I = $1)', p_tbl, kc) into free using p_keep;
  end if;
  if kc = 'src_row' then
    perform pg_advisory_xact_lock(hashtext('gst-edit:'||p_tbl));
    if free then nk := p_keep;
    else execute format('select coalesce(max(src_row),-1)+1 from public.%I', p_tbl) into nk; end if;
    v := v || jsonb_build_object('src_row', nk);
  elsif free then
    v := v || jsonb_build_object(kc, p_keep);
    ov := 'overriding system value';          -- id 가 identity always 라 명시해야 원래 번호를 쓸 수 있다
  end if;
  select string_agg(format('%I', k), ', ') into cols from jsonb_object_keys(v) k;
  execute format('insert into public.%I (%s) %s select %s from jsonb_populate_record(null::public.%I, $1) returning %I',
                 p_tbl, cols, ov, cols, p_tbl, kc) into nk using v;
  return nk;
end $$;

/* ---------- 3. 화면이 부르는 함수 ---------- */

create or replace function public.edit_get(p_tbl text, p_key bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public._edit_allow('read') then raise exception 'forbidden'; end if;
  r := public._edit_row(p_tbl, p_key);
  if r is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'row', r, 'hash', public._edit_hash(r));
end $$;

create or replace function public.edit_update(p_tbl text, p_key bigint, p_hash text, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur jsonb; ch jsonb; res jsonb;
begin
  if not public._edit_allow('update') then raise exception 'forbidden'; end if;
  if public._edit_key(p_tbl) is null then raise exception 'bad_table: %', p_tbl; end if;
  ch := public._edit_clean(p_tbl, p_changes);
  cur := public._edit_row(p_tbl, p_key, true);
  if cur is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_hash is distinct from public._edit_hash(cur) then
    return jsonb_build_object('ok', false, 'error', 'conflict', 'row', cur, 'hash', public._edit_hash(cur));
  end if;
  -- 실제로 달라지는 열만 — 같은 값을 다시 쓰면 이력이 소음이 된다
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into ch
    from jsonb_each(ch) where (cur -> key) is distinct from value;
  if ch = '{}'::jsonb then
    return jsonb_build_object('ok', true, 'same', true, 'row', cur, 'hash', public._edit_hash(cur));
  end if;
  res := public._edit_apply(p_tbl, p_key, cur, ch, 'update', null);
  perform public.csv_upload_finish(p_tbl);     -- 캐시 도장 — 정본 규칙은 그 함수 한 곳(미러 3종만 기록한다)
  return res;
end $$;

create or replace function public.edit_insert(p_tbl text, p_row jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; nk bigint; r jsonb; lid bigint;
begin
  if not public._edit_allow('insert') then raise exception 'forbidden'; end if;
  if public._edit_key(p_tbl) is null then raise exception 'bad_table: %', p_tbl; end if;
  v := public._edit_clean(p_tbl, p_row);
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v from jsonb_each(v) where value <> 'null'::jsonb;
  if v = '{}'::jsonb then raise exception 'no_values'; end if;
  nk := public._edit_put(p_tbl, v, null);
  r := public._edit_row(p_tbl, nk);
  lid := public._edit_log(p_tbl, nk::text, 'insert', null, r, null);
  perform public.csv_upload_finish(p_tbl);
  return jsonb_build_object('ok', true, 'key', nk, 'row', r, 'hash', public._edit_hash(r), 'log', lid);
end $$;

create or replace function public.edit_delete(p_tbl text, p_key bigint, p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare kc text := public._edit_key(p_tbl); cur jsonb; lid bigint;
begin
  if not public._edit_allow('delete') then raise exception 'forbidden'; end if;
  if kc is null then raise exception 'bad_table: %', p_tbl; end if;
  cur := public._edit_row(p_tbl, p_key, true);
  if cur is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_hash is distinct from public._edit_hash(cur) then
    return jsonb_build_object('ok', false, 'error', 'conflict', 'row', cur, 'hash', public._edit_hash(cur));
  end if;
  execute format('delete from public.%I where %I = $1', p_tbl, kc) using p_key;
  lid := public._edit_log(p_tbl, p_key::text, 'delete', cur, null, null);   -- 행 전체를 남긴다 = 되살릴 수 있다
  perform public.csv_upload_finish(p_tbl);
  return jsonb_build_object('ok', true, 'log', lid);
end $$;

/* 되돌리기 — 이력 한 줄을 거꾸로 적용한다.
 *   delete → 그 행을 다시 넣는다(원래 번호가 비어 있으면 그 번호로)
 *   update → 바뀌었던 열만 옛 값으로. ⚠ 그 뒤 같은 열을 누가 또 바꿨으면 멈춘다 —
 *            덮어쓰면 그 사람의 수정을 조용히 지우는 것이다.
 *   insert → 넣었던 행을 지운다(그 뒤 바뀌지 않았을 때만)
 * 한 이력은 한 번만 되돌린다. */
create or replace function public.edit_restore(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.sheet_edits%rowtype; kc text; v_op text; cur jsonb; ch jsonb; nk bigint; r jsonb; lid bigint; res jsonb;
begin
  if not public._edit_allow('restore') then raise exception 'forbidden'; end if;
  select * into e from public.sheet_edits where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  kc := public._edit_key(e.tbl);
  -- hr·고장분석 편집(GST.dbWrite → edit_note)도 같은 모양(행 전체 before/after)이라 같이 되돌린다
  v_op := case e.op when 'dbw:update' then 'update' when 'dbw:append' then 'insert' when 'dbw:delete' then 'delete' else e.op end;
  if kc is null or v_op not in ('update','insert','delete') then raise exception 'not_restorable'; end if;
  if exists (select 1 from public.sheet_edits x where x.ref = p_id and x.op = 'restore') then
    raise exception 'already_restored';
  end if;

  if v_op = 'delete' then
    if e.before is null or jsonb_typeof(e.before) <> 'object' then raise exception 'not_restorable'; end if;
    nk := public._edit_put(e.tbl, e.before, (e.before->>kc)::bigint);
    r := public._edit_row(e.tbl, nk);
    lid := public._edit_log(e.tbl, nk::text, 'restore', null, r, p_id);
    res := jsonb_build_object('ok', true, 'key', nk, 'row', r, 'log', lid);

  elsif v_op = 'update' then
    if jsonb_typeof(e.before) <> 'object' or jsonb_typeof(e.after) <> 'object' then raise exception 'not_restorable'; end if;
    nk := e.row_key::bigint;
    cur := public._edit_row(e.tbl, nk, true);
    if cur is null then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
    select coalesce(jsonb_object_agg(a.key, coalesce(e.before -> a.key, 'null'::jsonb)), '{}'::jsonb) into ch
      from jsonb_each(e.after) a
     where a.key <> 'synced_at' and (e.before -> a.key) is distinct from a.value;
    if exists (select 1 from jsonb_each(ch) x where (cur -> x.key) is distinct from (e.after -> x.key)) then
      return jsonb_build_object('ok', false, 'error', 'conflict', 'row', cur);
    end if;
    if ch = '{}'::jsonb then return jsonb_build_object('ok', true, 'same', true); end if;
    res := public._edit_apply(e.tbl, nk, cur, ch, 'restore', p_id);

  else
    if e.after is null or jsonb_typeof(e.after) <> 'object' then raise exception 'not_restorable'; end if;
    nk := e.row_key::bigint;
    cur := public._edit_row(e.tbl, nk, true);
    if cur is null then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
    if public._edit_hash(cur) is distinct from public._edit_hash(e.after) then
      return jsonb_build_object('ok', false, 'error', 'conflict', 'row', cur);
    end if;
    execute format('delete from public.%I where %I = $1', e.tbl, kc) using nk;
    lid := public._edit_log(e.tbl, nk::text, 'restore', cur, null, p_id);
    res := jsonb_build_object('ok', true, 'log', lid);
  end if;

  perform public.csv_upload_finish(e.tbl);
  return res;
end $$;

/* 표의 실제 열과 타입(순서대로) — 새 행 입력 칸을 «표에서» 만든다(SPEC 에 없는 승격 열도 저절로 뜬다).
 * 타입은 입력값 검사용이다(교육·휴가의 bigint 사번 등) — 화면이 목록을 박아 두면 표가 바뀔 때 갈라진다. */
create or replace function public.edit_cols(p_tbl text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._edit_allow('read') then raise exception 'forbidden'; end if;
  if public._edit_key(p_tbl) is null then raise exception 'bad_table: %', p_tbl; end if;
  return (select coalesce(jsonb_agg(jsonb_build_array(column_name, data_type) order by ordinal_position), '[]'::jsonb)
            from information_schema.columns where table_schema = 'public' and table_name = p_tbl);
end $$;

/* 입력 보조 — 그 열에 «지금 실제로 있는 값»과 건수(많은 순). 정해진 값 목록을 코드에 박지 않는다(v89 규약). */
create or replace function public.edit_distinct(p_tbl text, p_col text, p_limit int default 60) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public._edit_allow('read') then raise exception 'forbidden'; end if;
  if public._edit_key(p_tbl) is null then raise exception 'bad_table: %', p_tbl; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = p_tbl and column_name = p_col) then
    raise exception 'bad_column: %', p_col;
  end if;
  execute format('select coalesce(jsonb_agg(jsonb_build_array(v, n) order by n desc, v), ''[]''::jsonb)
                    from (select %I::text v, count(*) n from public.%I where %I is not null
                           group by 1 order by 2 desc limit $1) s', p_col, p_tbl, p_col)
    into r using least(greatest(coalesce(p_limit, 60), 1), 300);
  return r;
end $$;

/* 업로드·기존 편집 경로의 «요약 기록» — 쓰기 권한(can_write)이면 남길 수 있다.
 *   upload:full|win|add  — 누가 언제 어느 표를 어떤 방식으로 몇 행 넣었나(행 내용은 안 담는다 · 26만 행이다)
 *   dbw:update|append|delete — hr·고장분석 편집(GST.dbWrite). 전에는 아무 기록도 안 남았다.
 * 누가(edited_by)는 인자가 아니라 로그인 토큰에서 읽는다 — 위조할 수 없다. */
create or replace function public.edit_note(p_tbl text, p_op text, p_key text, p_before jsonb, p_after jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_users a
                  where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) then
    raise exception 'read_only';
  end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst','sheet_edu','sheet_roster','sheet_leave',
                   'sheet_cip_f11','sheet_cip_f16','sheet_abp','sheet_alarm','sheet_allbypass') then
    raise exception 'bad_table: %', p_tbl;
  end if;
  if p_op !~ '^(upload:(full|win|add)|dbw:(update|append|delete))$' then raise exception 'bad_op: %', p_op; end if;
  if coalesce(pg_column_size(p_before), 0) + coalesce(pg_column_size(p_after), 0) > 262144 then
    raise exception 'too_large';
  end if;
  return public._edit_log(p_tbl, coalesce(nullif(p_key, ''), '*'), p_op, p_before, p_after, null);
end $$;

/* ---------- 4. 실행 권한 ----------
 * Supabase 는 public 스키마의 새 함수에 기본으로 anon·authenticated 실행을 준다.
 * 내부 함수(_edit_*)를 열어 두면 관리자 검사를 건너뛰고 _edit_apply 를 부르거나 이력을 위조할 수 있다 — 전부 닫는다. */
do $$
declare f text;
begin
  foreach f in array array[
    'public._edit_allow(text)', 'public._edit_key(text)', 'public._edit_gid(text)', 'public._edit_hash(jsonb)',
    'public._edit_row(text,bigint,boolean)', 'public._edit_clean(text,jsonb)',
    'public._edit_log(text,text,text,jsonb,jsonb,bigint)', 'public._edit_cascade_edu(jsonb,jsonb,bigint)',
    'public._edit_apply(text,bigint,jsonb,jsonb,text,bigint)', 'public._edit_put(text,jsonb,bigint)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.edit_get(text,bigint)', 'public.edit_update(text,bigint,text,jsonb)',
    'public.edit_insert(text,jsonb)', 'public.edit_delete(text,bigint,text)', 'public.edit_restore(bigint)',
    'public.edit_distinct(text,text,int)', 'public.edit_cols(text)', 'public.edit_note(text,text,text,jsonb,jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

/* ---------- 5. 엑셀 일괄 수정 (v141) ----------
 * 사용자 요청: 「목록에서 체크한 행을 엑셀 표준양식으로 받아 엑셀에서 한꺼번에 고치고, 올리면 덮어쓰게」.
 * 화면이 파일을 읽어 «무엇이 어떻게 바뀌나»를 먼저 보여 주고(미리보기), 사람이 「반영」을 누르면 여기로 온다.
 *
 *   - 행은 PK 로 찾고 행 해시로 동시 수정을 막는다 — 한 행 편집(edit_update)과 «같은 규칙»이다.
 *     업무 키(실적코드·S/N·사원번호)로 행을 고르는 일은 화면이 미리보기에서 하고(정확히 한 행일 때만),
 *     여기에는 언제나 PK 로 온다. 실적코드는 실측 197개가 두 행씩이라(2026-10) 키만으로는 못 고른다.
 *   - «전부 아니면 전무» — 먼저 전 행을 잠그고(for update) 해시를 대조한다. 하나라도 어긋나면 아무것도
 *     안 쓰고 어긋난 행 목록을 돌려준다. 반만 들어간 묶음은 «어디까지 들어갔나»를 사람이 맞혀야 하는 상태다.
 *   - 묶음 머리 이력(op='bulk') 한 줄 + 행마다 이력 한 줄(ref = 머리 번호). 「이 엑셀로 무엇을 바꿨나」를
 *     한 번에 찾고, 행 하나씩도 되돌릴 수 있다. 머리 줄은 쓰기 «전에» 결과 수를 담는다 — 이력은 고치지 않는다.
 *   - 캐시 도장은 묶음 끝에 한 번(csv_upload_finish) — 행마다 찍을 이유가 없다.
 *   - 한 번에 500 행까지 — 묶음이 곧 «전부 아니면 전무»의 단위이고, 그동안 그 행들을 잠근다.
 *     실측(2026-10 · 운영): 수선실적 500 행 = 5.4초. 문장 시간 제한은 authenticated 60초다(v129 에 올렸다 ·
 *     PostgREST 가 그 역할의 설정을 적용한다 — authenticator 의 8초가 아니다). 넉넉하지만 더 키우면 잠그는 시간과
 *     «한 번 막히면 통째로 다시» 의 범위가 같이 커진다. 더 많으면 화면이 500 행씩 나눠 부른다.
 *     ⚠ 함수 안에서 시간 제한을 늘려도 이미 시작된 문장의 시계는 안 바뀐다 — 줄 수로 다스린다.
 *   - 바뀐 것이 없는 줄은 이력도 안 남긴다(같은 값을 다시 쓰면 이력이 소음이 된다 — edit_update 와 같다).
 *   ⚠ 이 절에는 행을 «지우는» 문장이 없다. 일괄 되돌리기는 화면이 edit_restore 를 한 줄씩 부른다 —
 *     그래야 «그 뒤 같은 칸이 또 바뀌었으면 멈춘다»는 되돌리기 규칙이 한 벌로 남는다. */
create or replace function public.edit_get_many(p_tbl text, p_keys bigint[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare kc text := public._edit_key(p_tbl); r jsonb;
begin
  if not public._edit_allow('read') then raise exception 'forbidden'; end if;
  if kc is null then raise exception 'bad_table: %', p_tbl; end if;
  if coalesce(array_length(p_keys, 1), 0) > 2000 then raise exception 'too_many: %', array_length(p_keys, 1); end if;
  execute format('select coalesce(jsonb_agg(jsonb_build_object(''key'', t.%I, ''row'', to_jsonb(t), ''hash'', public._edit_hash(to_jsonb(t))) order by t.%I), ''[]''::jsonb)
                    from public.%I t where t.%I = any($1)', kc, kc, p_tbl, kc)
    into r using coalesce(p_keys, '{}'::bigint[]);
  return r;
end $$;

create or replace function public.edit_bulk(p_tbl text, p_items jsonb, p_note jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare kc text := public._edit_key(p_tbl); it jsonb; cur jsonb; ch jsonb; v jsonb; nk bigint; r jsonb; bid bigint;
        prep jsonb := '[]'::jsonb; conf jsonb := '[]'::jsonb; seen bigint[] := '{}'; nu int := 0; ni int := 0; ns int := 0;
begin
  if not public._edit_allow('bulk') then raise exception 'forbidden'; end if;
  if kc is null then raise exception 'bad_table: %', p_tbl; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'no_values'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'too_many: %', jsonb_array_length(p_items); end if;
  if p_note is not null and jsonb_typeof(p_note) <> 'object' then raise exception 'bad_note'; end if;
  if coalesce(pg_column_size(p_note), 0) > 65536 then raise exception 'too_large'; end if;

  /* 1) 확인 — 쓰기 전에 전 행을 잠그고 대조한다. 여기서는 아무것도 안 쓴다. */
  for it in select value from jsonb_array_elements(p_items) loop
    if it->>'op' = 'update' then
      nk := (it->>'key')::bigint;
      if nk = any(seen) then conf := conf || jsonb_build_array(jsonb_build_object('key', nk, 'error', 'dup')); continue; end if;
      seen := seen || nk;
      cur := public._edit_row(p_tbl, nk, true);
      if cur is null then conf := conf || jsonb_build_array(jsonb_build_object('key', nk, 'error', 'not_found')); continue; end if;
      if (it->>'hash') is distinct from public._edit_hash(cur) then
        conf := conf || jsonb_build_array(jsonb_build_object('key', nk, 'error', 'conflict')); continue;
      end if;
      ch := public._edit_clean(p_tbl, coalesce(it->'changes', '{}'::jsonb));
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into ch from jsonb_each(ch) where (cur -> key) is distinct from value;
      if ch = '{}'::jsonb then ns := ns + 1; continue; end if;
      prep := prep || jsonb_build_array(jsonb_build_object('op', 'update', 'key', nk, 'cur', cur, 'ch', ch));
    elsif it->>'op' = 'insert' then
      v := public._edit_clean(p_tbl, coalesce(it->'row', '{}'::jsonb));
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v from jsonb_each(v) where value <> 'null'::jsonb;
      if v = '{}'::jsonb then raise exception 'no_values'; end if;
      prep := prep || jsonb_build_array(jsonb_build_object('op', 'insert', 'row', v));
    else
      raise exception 'bad_op: %', coalesce(it->>'op', 'null');
    end if;
  end loop;
  if jsonb_array_length(conf) > 0 then
    return jsonb_build_object('ok', false, 'error', 'conflict', 'rows', conf);
  end if;
  select count(*) filter (where x->>'op' = 'update'), count(*) filter (where x->>'op' = 'insert')
    into nu, ni from jsonb_array_elements(prep) x;
  if nu + ni = 0 then
    return jsonb_build_object('ok', true, 'log', null, 'updated', 0, 'inserted', 0, 'same', ns);
  end if;

  /* 2) 묶음 머리 — 결과 수를 «쓰기 전에» 담는다(이력 줄은 나중에 고치지 않는다) */
  bid := public._edit_log(p_tbl, '*', 'bulk', null,
           coalesce(p_note, '{}'::jsonb) || jsonb_build_object('updated', nu, 'inserted', ni, 'same', ns), null);

  /* 3) 쓰기 — 행마다 이력 한 줄(ref = 머리). 인원 행이면 _edit_apply 가 교육 짝 행 연쇄까지 한다. */
  for it in select value from jsonb_array_elements(prep) loop
    if it->>'op' = 'update' then
      perform public._edit_apply(p_tbl, (it->>'key')::bigint, it->'cur', it->'ch', 'update', bid);
    else
      nk := public._edit_put(p_tbl, it->'row', null);
      r := public._edit_row(p_tbl, nk);
      perform public._edit_log(p_tbl, nk::text, 'insert', null, r, bid);
    end if;
  end loop;
  perform public.csv_upload_finish(p_tbl);
  return jsonb_build_object('ok', true, 'log', bid, 'updated', nu, 'inserted', ni, 'same', ns);
end $$;

/* 실행 권한 — 이 절의 두 함수만(4절의 목록은 그 절에서 만든 함수만 안다 · 이 절만 따로 Run 해도 되게) */
do $$
declare f text;
begin
  foreach f in array array['public.edit_get_many(text,bigint[])', 'public.edit_bulk(text,jsonb,jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- 확인
select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname like '%edit%' order by 1;
