-- setup-29-fse.sql — FSE 원장(작업·알람·부품 교체 이력)과 «알람 분석»의 기준 (v189 · 사용자 요청)
-- 사용자: 「FSE Data 있는 거 별도 분석 목적 페이지는 저 원장으로 분석하는 거로 할 거야 · 원장에 있는 거는 다 넣어도 돼 ·
--          지금은 엑셀 원장으로 하지만 추후에는 글로벌 관리 표준으로 할 거거든? · BFE 만을 타겟으로 하지 말고 필터로」
--
-- 무엇
--   1. sheet_fse      — FSE 원장 미러(수선·자재·설치와 같은 «미러» 꼴 · src_row PK · snake 열 · extra jsonb).
--                       열 정의의 정본은 assets/core.js GST.SM.SPEC.fse 다(제2원칙) — SPEC 밖 열은 전부 extra 로 간다(값은 잃지 않는다).
--                       ⚠ op = «적재 범위 열쇠» = SITE + LINE(예: 고객사 + FAB). 운영단위(법인)가 아니다 —
--                         FSE 파일은 FAB 마다 따로 온다. 구간 교체(csv_window)가 «날짜 × op»로 지우므로, 한 FAB 파일을 올려도
--                         다른 FAB 행은 한 줄도 안 지워진다. 운영단위는 화면이 S/N 으로 설치현황에 이어 얻는다(조직 축은 원장에 담지 않는다).
--                       ⚠ 글로벌 표준 양식에 «운영단위» 열이 생겨도 op 는 그대로 SITE + LINE 이다(그 열은 extra 또는 새 SPEC 필드로) —
--                         op 의 뜻을 바꾸면 옛 행이 구간 교체에 안 걸려 «표가 조용히 두 배»가 된다(v109·v133 의 자리).
--   2. fse_parts      — «관심 부품» 묶음(부품 코드 → 묶음 · 유체 · 제조사). MFC 버전 판정과 «교체 후 경과일»이 이 표를 본다.
--                       ⚠ 부품 코드는 저장소에 두지 않는다 — 이 표에만(씨앗은 SQL Editor·execute_sql 로). 화면에서 고친다.
--   3. 서버 함수 허용 목록 — _csv_datecol(구간 교체 날짜 열) · csv_upload_finish(캐시 도장) · csv_upload_begin(통째 교체).
--   4. param_save 의 값 범위 — MFC 판정 기준(S/N 날짜코드 YYMMDD · 예 250313)이 100,000 을 넘는다.
--
-- ⚠ 지우는 문장이 든 덩어리는 «5절» 하나다(csv_upload_begin — truncate). MCP 확인 창 뒤로 가므로 사람이 SQL Editor 에서 Run 한다.
--   그 전에는 FSE 원장의 «통째 교체»만 bad_table 로 멈추고, 「겹치는 구간만 교체」·「이어붙이기」는 된다(첫 업로드는 그것으로 충분하다).
-- ⚠ setup-8·9·10·17·23 을 다시 Run 하면 _csv_datecol·csv_upload_finish·csv_upload_begin 이 옛 판(FSE 없음)으로 되돌아간다 —
--   그 뒤에 이 파일을 한 번 더 Run 한다. (setup-28 다음이어야 한다 — 5절 끝의 실행 권한 회수가 setup-28 규약이다.)
-- 다시 Run 해도 안전하다(전부 if not exists · create or replace).

/* ---------- 1. FSE 원장 미러 ---------- */
create table if not exists public.sheet_fse (
  src_row       int primary key,   -- 빈 행을 걸러낸 뒤의 0부터의 순번(업로드 화면이 매긴다 · 파일 순서 = 작업 행 다음 부품 행)
  op            text,              -- 적재 범위 열쇠 = SITE + ' ' + LINE (위 주석)
  row_no        text,              -- NO
  site          text,              -- SITE (고객사)
  fab           text,              -- LINE (FAB)
  grp1          text,              -- Group_1 (공정)
  grp2          text,              -- Group_2
  det1          text,              -- Detail_1 (세부공정)
  det2          text,              -- Detail_2
  btype         text,              -- Type (버너 방식 — AB·Torch·LE …)
  turn_on       text,              -- Turn-on date (YYYY-MM-DD)
  warr_date     text,              -- Warranty date (유상 전환일)
  warr          text,              -- Warranty IN/OUT
  model         text,              -- Model
  code          text,              -- Scrubber Code
  work_date     text,              -- Work Date (YYYY-MM-DD) — 구간 교체의 날짜 열
  sn            text,              -- S/N
  mcode         text,              -- Maintenance Code (BM·CBM·TBM … · 부품 행은 '-')
  aw            text,              -- Alarm/Warning
  resp          text,              -- Responsible (GST · External)
  msg           text,              -- Alarm/Warning Message
  fcode         text,              -- fail Code
  ncode         text,              -- New fail Code (분류)
  ftype         text,              -- fail Type
  wkind         text,              -- Part Replace (Improvement) (작업 성격)
  chamber       text,              -- Chamber
  symptom       text,
  cause         text,              -- Deep rooted cause
  action        text,              -- Corrective action item
  part_code     text,              -- Part Code (replaced parts)
  part_qty      text,
  part_name     text,
  part_spec     text,
  comp          text,              -- Compensation (유/무상)
  remark        text,
  shutdown      text,              -- Shut down (By Pass …)
  sd_start      text,              -- Shut down Started time (YYYY-MM-DD HH:mm)
  sd_end        text,
  mttr          text,              -- MTTR (Minute)
  mfc_in        text,              -- In Part SN MFC (교체해 넣은 MFC S/N)
  mfc_out       text,              -- Out part SN MFC (떼어 낸 MFC S/N)
  extra         jsonb,             -- SPEC 밖 열 전부(작업자·측정값·고객사 보고 등) — 머리글 이름 그대로
  synced_at     timestamptz not null default now()
);
comment on table public.sheet_fse is 'FSE 원장 미러 (작업·알람·부품 교체 이력) — /upload/ 로 올린다. op = SITE+LINE(적재 범위 열쇠).';
create index if not exists sheet_fse_work_date_idx on public.sheet_fse (work_date);
create index if not exists sheet_fse_op_idx        on public.sheet_fse (op);
create index if not exists sheet_fse_sn_idx        on public.sheet_fse (sn);

alter table public.sheet_fse enable row level security;
revoke all on public.sheet_fse from anon;
grant select, insert, update, delete on public.sheet_fse to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sheet_fse' and policyname='allowed read') then
    create policy "allowed read" on public.sheet_fse for select to authenticated
      using ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')) );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sheet_fse' and policyname='allowed write') then
    create policy "allowed write" on public.sheet_fse for all to authenticated
      using ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) )
      with check ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) );
  end if;
end $$;

/* ---------- 2. 관심 부품 묶음 ----------
 * grp   — 묶음 이름(화면에 그대로 뜬다): 'MFC' · '버너 노즐' · '노즐 커버' … 사람이 정한다.
 *         ⚠ 이름에 «MFC» 낱말이 든 묶음(LNG MFC · O2 MFC …)이 «버전 판정»을 받는다(GST.FSE.isMfcGrp · v191 — 예전에는 정확히 'MFC' 만).
 * code  — 부품 코드(정확일치). name_re 를 쓰면 비워 둔다.
 * name_re — 부품 이름·규격에 거는 정규식(대소문자 무시) — 코드가 계속 느는 소모품용. 둘 다 있으면 코드가 먼저다.
 * fluid — MFC 의 유체: LNG · O2 · AIR (그 밖 묶음은 빈칸)
 * maker — MFC 제조사: MCA · MKP · HORIBA … (판정 규칙이 제조사로 갈린다 · 모르는 제조사는 «버전 미상»)
 * on    — false 면 판정·표에서 뺀다(지우지 않고 끈다 — 이력이 남는다). */
create table if not exists public.fse_parts (
  id         bigint generated always as identity primary key,
  grp        text not null check (length(grp) between 1 and 40),
  code       text,
  name_re    text check (name_re is null or length(name_re) <= 200),
  fluid      text,
  maker      text,
  label      text,
  note       text,
  ord        int not null default 0,
  on_        boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now(),
  check (coalesce(code,'') <> '' or coalesce(name_re,'') <> '')
);
create unique index if not exists fse_parts_code_uq on public.fse_parts (code) where code is not null and code <> '';
alter table public.fse_parts enable row level security;
revoke all on public.fse_parts from anon;
grant select, insert, update on public.fse_parts to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fse_parts' and policyname='fse parts read') then
    create policy "fse parts read" on public.fse_parts for select to authenticated
      using ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email')) );
  end if;
  -- 쓰기: 쓰기 권한자만 — 묶음은 MFC 판정과 «교체 후 경과일»을 바꾼다. 행은 지우지 않고 on_=false 로 끈다(insert·update 만 준다).
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fse_parts' and policyname='fse parts ins') then
    create policy "fse parts ins" on public.fse_parts for insert to authenticated
      with check ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fse_parts' and policyname='fse parts upd') then
    create policy "fse parts upd" on public.fse_parts for update to authenticated
      using ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) )
      with check ( exists (select 1 from public.allowed_users a where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) );
  end if;
end $$;

/* ---------- 3. 구간 교체의 날짜 열 · 캐시 도장 ---------- */
create or replace function public._csv_datecol(p_tbl text) returns text
language sql immutable as $$
  select case p_tbl when 'sheet_wk' then 'd_start'
                    when 'sheet_mat' then 'work_date'
                    when 'sheet_alarm' then 'occur_date'
                    when 'sheet_allbypass' then 'occur_date'
                    when 'sheet_fse' then 'work_date'
                    when 'kr_sheet_wk' then 'd_start'
                    when 'kr_sheet_alarm' then 'occur_date'
                    when 'kr_sheet_allbypass' then 'occur_date' end
$$;

-- 캐시 도장 — dbRows 가 sheet_sync_log 의 «행수 + 적재 시각»으로 캐시하고, 기록이 없으면 MIRROR_EMPTY 로 멈춘다. FSE 도 미러다.
create or replace function public.csv_upload_finish(p_tbl text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text; n int;
begin
  if not public._tbl_can_write(p_tbl) then raise exception 'read_only'; end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst','sheet_fse','kr_sheet_wk','kr_sheet_inst') then
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

/* ---------- 4. 판정 기준 값 범위 — MFC S/N 날짜코드(YYMMDD)를 받게 ----------
 * 화면의 허용 범위(min·max)는 JS GST.PARAMS 한 곳이고, 서버는 «말이 되는 수»만 본다(사본 금지 · setup-27 규약).
 * YYMMDD(250313)·YYYYMMDD(20250313) 둘 다 들어가도록 99,999,999 까지. */
create or replace function public.param_save(p_key text, p_value numeric, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare who text := public._tgt_who(); cur public.ops_params; nat timestamptz;
begin
  if coalesce(auth.jwt()->>'email','') = '' then return jsonb_build_object('error','login'); end if;
  if who is null then return jsonb_build_object('error','forbidden'); end if;
  if p_key is null or p_key !~ '^[a-z0-9_]{2,40}$' then return jsonb_build_object('error','bad_key'); end if;
  if p_value is not null and (p_value < 0 or p_value > 99999999) then return jsonb_build_object('error','bad_value'); end if;
  select * into cur from public.ops_params where key = p_key for update;
  if found then
    if p_at is distinct from cur.updated_at then return jsonb_build_object('error','conflict','updated_at',cur.updated_at); end if;
    update public.ops_params set value = p_value, updated_by = who, updated_at = clock_timestamp() where key = p_key returning updated_at into nat;
    insert into public.ops_param_log(key, by, v_from, v_to) values (p_key, who, cur.value, p_value);
  else
    if p_at is not null then return jsonb_build_object('error','conflict'); end if;
    insert into public.ops_params(key, value, updated_by) values (p_key, p_value, who) returning updated_at into nat;
    insert into public.ops_param_log(key, by, v_from, v_to) values (p_key, who, null, p_value);
  end if;
  return jsonb_build_object('ok',true,'updated_at',nat);
exception when unique_violation then
  return jsonb_build_object('error','conflict');
end $$;
revoke all on function public.param_save(text,numeric,timestamptz) from public, anon;
grant execute on function public.param_save(text,numeric,timestamptz) to authenticated;

/* ---------- 5. 통째 교체 허용 목록 — ⚠ truncate 가 든다: 사람이 SQL Editor 에서 Run ----------
 * 이 절이 없으면 FSE 원장의 «통째 교체»만 bad_table 로 멈춘다(구간 교체·이어붙이기는 된다). */
create or replace function public.csv_upload_begin(p_tbl text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._tbl_can_write(p_tbl) then raise exception 'read_only'; end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst','sheet_edu','sheet_roster',
                   'sheet_leave','sheet_cip_f11','sheet_cip_f16','sheet_abp',
                   'sheet_alarm','sheet_allbypass','sheet_fse',
                   'kr_sheet_wk','kr_sheet_inst','kr_sheet_roster','kr_sheet_edu','kr_sheet_leave',
                   'kr_sheet_alarm','kr_sheet_allbypass') and not public._cip_tbl(p_tbl) then
    raise exception 'bad_table: %', p_tbl;
  end if;
  execute format('truncate table public.%I', p_tbl);
end $$;
-- setup-28 규약 — 비우기는 csv_upload_full(비밀번호 승인표)로만. authenticated 가 직접 못 부른다.
revoke all on function public.csv_upload_begin(text) from public, anon, authenticated;

notify pgrst, 'reload schema';

/* 관심 부품 씨앗 — 저장소에 두지 않는다(부품 코드는 이 파일에 적지 않는다). 모양만:
 *   insert into public.fse_parts(grp, code, fluid, maker, label, ord, updated_by)
 *   values ('MFC', '<부품 코드>', 'LNG', 'MCA', '<모델 코드>', 1, '<이메일>');
 *   insert into public.fse_parts(grp, code, label, ord, updated_by) values ('버너 노즐', '<부품 코드>', '<재질>', 10, '<이메일>');
 * 화면(고장 분석 › 알람 분석 › 「부품 묶음」)에서 넣고 고칠 수 있다. */
