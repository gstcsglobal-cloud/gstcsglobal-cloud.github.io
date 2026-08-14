/* v92 — 국내 알람 · 올바이패스 원장 (2026-08-15)
 *
 * 왜 별도 표인가. 사용자 결정: **국내는 BM·All By-Pass 건수를 수선실적에서 세지 않는다.**
 * 수선실적의 BM 정합성이 아직 안 맞아서, 현장이 실제로 쓰는 「CS 알람관리」 워크북을
 * 원장으로 삼는다. 대만은 지금까지대로 수선실적(BM)과 ABP 시트를 쓴다 — 두 계통이
 * 공존하므로 어느 쪽을 세는지가 화면에 드러나야 한다.
 *
 * ⚠ 한 워크북에 K·P·H 세 운영단위가 «각자 다른 양식»으로 들어 있다. 같은 뜻의 열이
 *   사이트마다 다른 이름이다(알람 유형 / 알람분류 / 대분류 …). 그 흡수는 브라우저
 *   업로드 화면이 `GST.SM.SPEC.alarm` · `.abp2` 로 한다 — 여기 표는 «눕혀진 뒤»의 모양이다.
 *   SPEC 을 고치면 이 DDL 도 같이 고친다(제2원칙).
 *
 * ⚠ 조직 축(구분·운영단위·고객사·단지·라인)은 **여기 담지 않는다.** 설비 S/N 으로
 *   설치현황을 조인해 얻는다(실측 조인율 99.9%). 담아 두면 설치현황이 갱신될 때
 *   두 벌이 갈라진다 — CIP 가 이미 그 규약이다.
 *
 * 실행: SQL Editor 에 붙여넣고 Run. 여러 번 Run 해도 안전하다.
 * 선행: setup-8-csv-upload.sql · setup-9-merge-upload.sql
 */

/* ---------- 1. 표 ---------- */
create table if not exists public.sheet_alarm (
  src_row    int primary key,          -- 업로드 순번. 세 시트를 이어서 매긴다
  src_sheet  text,                     -- 'K' · 'P' · 'H' (어느 운영단위 시트에서 왔나)
  op         text,                     -- 'K운영' · 'P운영' · 'H운영' — 구간 교체의 단위
  site text, line text, area text, bay text, eqp_id text,
  proc text, subproc text, chamber text, chpos text,
  sn text, sn_key text,                -- sn_key = 영숫자만. 설치현황 조인 키
  seqp_id text, status text, maker text, model text, ch text, alevel text,
  alarm text, alarm_name text,
  occur text, rel_time text, hold text,
  occur_date date,                     -- occur 를 파싱한 값. 시계열은 전부 이 열로 센다
  atype text,                          -- 현상 계열 (PRESSURE · FLAME · INLET P …)
  ctype text, ctype2 text,             -- 원인 계열 (POWDER · PART · HUMAN …)
  inout text, incl text,               -- 시트가 적어 둔 «내/외»·«포함/제외» 원문
  cnt boolean,                         -- 집계 대상 여부 (GST.ALARM.counts 가 낸 답)
  cause text, phenom text, action text, module text,
  src_month text, src_week text, src_year text,   -- 시트의 정산월·주차 원문
  fmonth text, fweek text,             -- 위를 'YYYY-MM' · 'YYYY-Www' 로 눕힌 값
  checker text,                        -- 담당자·확인자 (실명 — 화면에 안 쓴다)
  extra jsonb,
  imported_at timestamptz default now()
);

create table if not exists public.sheet_allbypass (
  src_row    int primary key,
  src_sheet  text,
  op         text,
  site text, line text, area text, eqp_id text, chamber text,
  sn text, sn_key text,
  model text, maker text,
  occur text, occur_t text, rel_time text, hold text,
  occur_date date,
  alarm text,
  seq text,                            -- All-ByPass Seq. H 는 한 사건이 1·2·3 세 줄이다
  real text,                           -- 진성/가성
  inout text, incl text,
  cnt boolean,
  atype text, ctype text,
  cause text, action text, phenom text,
  src_month text, src_week text, src_year text,
  fmonth text, fweek text,
  checker text,
  extra jsonb,
  imported_at timestamptz default now()
);

create index if not exists sheet_alarm_date_idx      on public.sheet_alarm(occur_date);
create index if not exists sheet_alarm_sn_idx        on public.sheet_alarm(sn_key);
create index if not exists sheet_allbypass_date_idx  on public.sheet_allbypass(occur_date);
create index if not exists sheet_allbypass_sn_idx    on public.sheet_allbypass(sn_key);

/* ---------- 2. RLS — setup-7·8 과 같은 규약 (can_write 만 쓴다) ---------- */
do $$
declare t text;
begin
  foreach t in array array['sheet_alarm','sheet_allbypass'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "allowed read" on public.%I', t);
    execute format($p$create policy "allowed read" on public.%I
        for select to authenticated
        using ( exists (select 1 from public.allowed_users a
                        where lower(a.email) = lower(auth.jwt()->>'email')) )$p$, t);
    execute format('drop policy if exists "allowed write" on public.%I', t);
    execute format($p$create policy "allowed write" on public.%I
        for all to authenticated
        using ( exists (select 1 from public.allowed_users a
                        where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) )
        with check ( exists (select 1 from public.allowed_users a
                        where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) )$p$, t);
  end loop;
end $$;

/* ---------- 3. 업로드 RPC 에 두 표를 등록 ----------
 * 허용 표 목록이 함수 안에 박혀 있어 «표를 만들었는데 비우기가 bad_table 로 막히는»
 * 상태가 된다. 목록을 늘린 판으로 갈아끼운다. */
create or replace function public.csv_upload_begin(p_tbl text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_users a
                 where lower(a.email) = lower(auth.jwt()->>'email') and a.can_write) then
    raise exception 'read_only';
  end if;
  if p_tbl not in ('sheet_wk','sheet_mat','sheet_inst','sheet_edu','sheet_roster',
                   'sheet_leave','sheet_cip_f11','sheet_cip_f16','sheet_abp',
                   'sheet_alarm','sheet_allbypass') then
    raise exception 'bad_table: %', p_tbl;
  end if;
  execute format('truncate table public.%I', p_tbl);
end $$;

/* 구간 교체의 날짜 열. 알람·올바이패스는 date 형이라 문자열 비교가 아니라
   날짜 비교가 된다 — csv_window 의 left(...,10) 은 text 를 전제하므로 캐스팅해 준다. */
create or replace function public._csv_datecol(p_tbl text)
returns text language sql immutable as $$
  select case p_tbl when 'sheet_wk' then 'd_start'
                    when 'sheet_mat' then 'work_date'
                    when 'sheet_alarm' then 'occur_date'
                    when 'sheet_allbypass' then 'occur_date' end
$$;

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
select '표' as 항목, string_agg(relname, ', ') as 값
  from pg_class where relname in ('sheet_alarm','sheet_allbypass') and relkind='r'
union all
select 'RLS 켜짐', count(*)::text from pg_class
  where relname in ('sheet_alarm','sheet_allbypass') and relkind='r' and relrowsecurity
union all
select '정책(표당 2개 → 4)', count(*)::text from pg_policies
  where tablename in ('sheet_alarm','sheet_allbypass')
union all
select '_csv_datecol(sheet_alarm)', coalesce(public._csv_datecol('sheet_alarm'),'(없음)')
union all
select '_csv_datecol(sheet_allbypass)', coalesce(public._csv_datecol('sheet_allbypass'),'(없음)')
union all
select 'sheet_alarm 열 수(기대 44)', count(*)::text from information_schema.columns
  where table_schema='public' and table_name='sheet_alarm'
union all
select 'sheet_allbypass 열 수(기대 36)', count(*)::text from information_schema.columns
  where table_schema='public' and table_name='sheet_allbypass';
