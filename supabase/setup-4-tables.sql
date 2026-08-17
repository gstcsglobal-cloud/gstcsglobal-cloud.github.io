-- GST 대시보드 v77 (1단계) — 구글시트 미러 테이블
-- Supabase → SQL Editor → New query → 전체 붙여넣고 Run
--
-- 배경: 구글시트가 셀 한도(1,000만)에 가까워져 데이터를 더 못 넣는다.
--       이 표들은 시트를 **읽기 경로에서 대체**한다. 시트는 그대로 두고 원장으로 남는다
--       (2단계에서 시트를 최근 창으로 줄일 때 비로소 이 표가 원장이 된다).
--       되돌리려면 core.js의 gid→테이블 맵만 비우면 된다. 시트는 손대지 않았다.
--
-- 이 파일은 손으로 쓰지 않았다. assets/core.js의 `GST.SM.SPEC`에서 기계적으로 뽑았다.
-- SPEC이 정본이므로 열이 늘면 여기도 같이 늘려야 한다 — 재생성 스크립트는 supabase/gen-ddl.mjs.
--
-- 컬럼명은 시트 헤더가 아니라 **SPEC의 논리키를 snake_case로** 쓴다.
-- 시트 헤더에는 한국어·줄바꿈(`Scrubber⏎S/N`)·괄호(`총 이동시간(분)`)·슬래시(`유/무상`)가
-- 섞여 있어 SQL 식별자로 쓸 수 없다. 논리키는 이미 대시보드 코드 전체가 쓰는 이름이라
-- 새로 외울 것이 없고, 헤더가 바뀌어도 컬럼명은 안 흔들린다.
--
-- 타입은 전부 `text`다. 날짜·숫자 캐스팅은 적재가 안정된 뒤 뷰로 한다.
-- 섣불리 date를 박으면 `2026-02-31` 같은 값 하나에 그 배치 전체가 실패한다.

/* ============================================================
   기본키를 왜 src_row(시트 행번호)로 두는가 — 실측 근거
   ------------------------------------------------------------
   계획서에는 `wk`의 PK를 `rs_code`(실적코드), `inst`의 PK를 `code`로 적었다.
   실제 시트로 세어 보니 **둘 다 유일하지 않다**:

     wk   17,337행 · 실적코드 고유 16,894 · 빈값 246 · 중복키 197(394행)
     inst  1,490행 · Scrubber CODE 고유 1,322 · 빈값 162 · 중복키 4(10행, 최대 4중복)
     inst  1,490행 · S/N 고유 1,489 · 빈값 0 · 중복 1쌍

   그대로 PK를 박으면 적재가 통째로 실패하거나, upsert가 640행을 조용히 덮어써서
   화면 숫자가 줄어든다. 후자가 더 위험하다 — 에러가 안 난다.

   미러의 정체성은 **시트의 행 위치**다. 그래서 PK는 `src_row`로 둔다.
     · 시트 중간에 행이 끼면 그 아래가 전부 새 내용으로 upsert된다 — 결과는 여전히 정확하다
     · 끝에서 행이 지워지면 `delete where src_row >= (새 행수)`로 꼬리를 자른다
     · 행수 대조가 그대로 무결성 검사가 된다 (tests/t-mirror.mjs)

   실적코드·CODE·S/N은 평범한 인덱스 컬럼으로 남는다. 조인은 지금처럼 되지만
   **유일성을 가정하지 말 것** — 대시보드는 이미 다대다로 다루고 있다.
   ============================================================ */

/* ---------- wk — 수선실적 (gid 646668307 · 38열) ---------- */
create table if not exists public.sheet_wk (
  src_row    int primary key,      -- 시트 데이터 행번호(0부터). 파일 상단 주석 참조
  pg                         text,   -- 제품군
  op                         text,   -- 운영단위
  customer                   text,   -- 고객사
  campus                     text,   -- 단지
  line                       text,   -- 라인
  bay                        text,   -- BAY
  proc                       text,   -- 공정
  subproc                    text,   -- 세부공정
  model                      text,   -- MODEL(자사)
  rs_code                    text,   -- 실적코드
  status                     text,   -- 상태
  req_type                   text,   -- 의뢰유형
  stage                      text,   -- 작업단계
  chamber                    text,   -- 챔버
  wrs                        text,   -- WRS NO
  main_eq                    text,   -- 메인설비호기
  prod_code                  text,   -- 제품코드
  eq_no                      text,   -- 설비호기
  chpos                      text,   -- 채널위치
  sn_in                      text,   -- S/N(IN)
  sn_out                     text,   -- S/N(OUT)
  pf                         text,   -- 유/무상
  alarm                      text,   -- 알람유형
  phenom                     text,   -- 현상
  cause                      text,   -- 원인
  action                     text,   -- 조치
  action_detail              text,   -- 세부조치내용
  d_start                    text,   -- 작업시작일
  d_end                      text,   -- 작업종료일
  t_start                    text,   -- 작업시작시간
  t_end                      text,   -- 작업종료시간
  reg_date                   text,   -- 실적등록일
  ship_date                  text,   -- 출하일자
  move_min                   text,   -- 총 이동시간(분)
  work_min                   text,   -- 작업시간(분)
  man_min                    text,   -- 작업공수
  workers                    text,   -- 작업자
  worker_cnt                 text,   -- 작업자수
  extra      jsonb,                 -- SPEC 밖의 열 전부(헤더 이름을 키로). 시트를 지워도 안 잃게
  synced_at  timestamptz not null default now()
);
comment on table public.sheet_wk is '구글시트 «수선실적» 미러 (gid 646668307). 원장은 아직 시트다.';
create index if not exists sheet_wk_d_start_idx on public.sheet_wk (d_start);
create index if not exists sheet_wk_eq_no_idx on public.sheet_wk (eq_no);
create index if not exists sheet_wk_rs_code_idx on public.sheet_wk (rs_code);
create index if not exists sheet_wk_line_idx on public.sheet_wk (line);
create index if not exists sheet_wk_customer_idx on public.sheet_wk (customer);
create index if not exists sheet_wk_proc_idx on public.sheet_wk (proc);
create index if not exists sheet_wk_subproc_idx on public.sheet_wk (subproc);
create index if not exists sheet_wk_stage_idx on public.sheet_wk (stage);
create index if not exists sheet_wk_model_idx on public.sheet_wk (model);

/* ---------- mat — 자재실적 (gid 31302669 · 39열) ---------- */
create table if not exists public.sheet_mat (
  src_row    int primary key,      -- 시트 데이터 행번호(0부터). 파일 상단 주석 참조
  op                         text,   -- 운영단위
  customer                   text,   -- 고객사
  rs_code                    text,   -- 수선실적번호
  campus                     text,   -- 단지
  line                       text,   -- 라인
  bay                        text,   -- BAY
  proc                       text,   -- 공정
  detail                     text,   -- 세부공정
  main_eq                    text,   -- 메인설비호기
  eq                         text,   -- 설비호기
  chamber                    text,   -- 챔버
  sn                         text,   -- S/N
  wo                         text,   -- W/O번호
  model                      text,   -- 모델명
  mat_code                   text,   -- 자재코드
  cust_mat_code              text,   -- 고객사자재코드
  eq_pos                     text,   -- 설비위치
  unit                       text,   -- UNIT
  assembly                   text,   -- ASSEMBLY
  part                       text,   -- PART
  mat_pos                    text,   -- 자재위치
  qty                        text,   -- 사용수량
  mat_name                   text,   -- 자재명
  spec                       text,   -- 규격
  reason                     text,   -- 교체사유
  prev_paid_date             text,   -- 전유상교체일
  prev_date                  text,   -- 전교체일
  work_date                  text,   -- 자재실적일자
  days_paid                  text,   -- 사용일(유상기준)
  days_prev                  text,   -- 사용일(전교체일기준)
  pf                         text,   -- 유/무상
  free_reason                text,   -- 무상사유
  warranty_term              text,   -- 자재보증기간
  price                      text,   -- 단가
  kit_sn                     text,   -- KIT S/N
  sn_in                      text,   -- IN SN
  sn_out                     text,   -- OUT SN
  stock_chk                  text,   -- 재고체크여부
  store                      text,   -- 자재창고
  extra      jsonb,                 -- SPEC 밖의 열 전부(헤더 이름을 키로). 시트를 지워도 안 잃게
  synced_at  timestamptz not null default now()
);
comment on table public.sheet_mat is '구글시트 «자재실적» 미러 (gid 31302669). 원장은 아직 시트다.';
create index if not exists sheet_mat_work_date_idx on public.sheet_mat (work_date);
create index if not exists sheet_mat_eq_idx on public.sheet_mat (eq);
create index if not exists sheet_mat_rs_code_idx on public.sheet_mat (rs_code);
create index if not exists sheet_mat_line_idx on public.sheet_mat (line);
create index if not exists sheet_mat_customer_idx on public.sheet_mat (customer);
create index if not exists sheet_mat_proc_idx on public.sheet_mat (proc);
create index if not exists sheet_mat_detail_idx on public.sheet_mat (detail);
create index if not exists sheet_mat_mat_name_idx on public.sheet_mat (mat_name);
create index if not exists sheet_mat_model_idx on public.sheet_mat (model);

/* ---------- inst — 설치현황 (gid 891608329 · 26열) ---------- */
create table if not exists public.sheet_inst (
  src_row    int primary key,      -- 시트 데이터 행번호(0부터). 파일 상단 주석 참조
  pjt                        text,   -- PJT.
  country                    text,   -- Country
  customer                   text,   -- Customer
  div                        text,   -- 사업부
  location                   text,   -- Location
  code                       text,   -- Scrubber CODE
  sn                         text,   -- Scrubber S/N
  model                      text,   -- Scrubber Model
  burner                     text,   -- Burner Type
  fab                        text,   -- Line 1
  floor                      text,   -- Floor
  bay                        text,   -- Bay
  group1                     text,   -- Group_1
  group2                     text,   -- Group_2
  detail1                    text,   -- Detail_1
  detail2                    text,   -- Detail_2
  tool_id                    text,   -- Main Tool ID
  tool_maker                 text,   -- Main Tool Maker
  tool_model                 text,   -- Main Tool Model
  fab_in                     text,   -- FAB In
  start                      text,   -- Start
  turn_on                    text,   -- Turn On
  warranty_date              text,   -- Warranty date
  warranty                   text,   -- Warranty In/Out
  pm_cycle                   text,   -- Target PM Cycle
  type                       text,   -- Scrubber type
  extra      jsonb,                 -- SPEC 밖의 열 전부(헤더 이름을 키로). 시트를 지워도 안 잃게
  synced_at  timestamptz not null default now()
);
comment on table public.sheet_inst is '구글시트 «설치현황» 미러 (gid 891608329). 원장은 아직 시트다.';
create index if not exists sheet_inst_sn_idx on public.sheet_inst (sn);
create index if not exists sheet_inst_code_idx on public.sheet_inst (code);
create index if not exists sheet_inst_fab_idx on public.sheet_inst (fab);
create index if not exists sheet_inst_customer_idx on public.sheet_inst (customer);
create index if not exists sheet_inst_model_idx on public.sheet_inst (model);
begin;

/* ---------- 열 추가용 (이미 만든 표에 SPEC이 늘었을 때) ---------- */
set local client_min_messages = warning;
alter table public.sheet_wk
  add column if not exists pg text,
  add column if not exists op text,
  add column if not exists customer text,
  add column if not exists campus text,
  add column if not exists line text,
  add column if not exists bay text,
  add column if not exists proc text,
  add column if not exists subproc text,
  add column if not exists model text,
  add column if not exists rs_code text,
  add column if not exists status text,
  add column if not exists req_type text,
  add column if not exists stage text,
  add column if not exists chamber text,
  add column if not exists wrs text,
  add column if not exists main_eq text,
  add column if not exists prod_code text,
  add column if not exists eq_no text,
  add column if not exists chpos text,
  add column if not exists sn_in text,
  add column if not exists sn_out text,
  add column if not exists pf text,
  add column if not exists alarm text,
  add column if not exists phenom text,
  add column if not exists cause text,
  add column if not exists action text,
  add column if not exists action_detail text,
  add column if not exists d_start text,
  add column if not exists d_end text,
  add column if not exists t_start text,
  add column if not exists t_end text,
  add column if not exists reg_date text,
  add column if not exists ship_date text,
  add column if not exists move_min text,
  add column if not exists work_min text,
  add column if not exists man_min text,
  add column if not exists workers text,
  add column if not exists worker_cnt text,
  add column if not exists extra jsonb;
alter table public.sheet_mat
  add column if not exists op text,
  add column if not exists customer text,
  add column if not exists rs_code text,
  add column if not exists campus text,
  add column if not exists line text,
  add column if not exists bay text,
  add column if not exists proc text,
  add column if not exists detail text,
  add column if not exists main_eq text,
  add column if not exists eq text,
  add column if not exists chamber text,
  add column if not exists sn text,
  add column if not exists wo text,
  add column if not exists model text,
  add column if not exists mat_code text,
  add column if not exists cust_mat_code text,
  add column if not exists eq_pos text,
  add column if not exists unit text,
  add column if not exists assembly text,
  add column if not exists part text,
  add column if not exists mat_pos text,
  add column if not exists qty text,
  add column if not exists mat_name text,
  add column if not exists spec text,
  add column if not exists reason text,
  add column if not exists prev_paid_date text,
  add column if not exists prev_date text,
  add column if not exists work_date text,
  add column if not exists days_paid text,
  add column if not exists days_prev text,
  add column if not exists pf text,
  add column if not exists free_reason text,
  add column if not exists warranty_term text,
  add column if not exists price text,
  add column if not exists kit_sn text,
  add column if not exists sn_in text,
  add column if not exists sn_out text,
  add column if not exists stock_chk text,
  add column if not exists store text,
  add column if not exists extra jsonb;
alter table public.sheet_inst
  add column if not exists pjt text,
  add column if not exists country text,
  add column if not exists customer text,
  add column if not exists div text,
  add column if not exists location text,
  add column if not exists code text,
  add column if not exists sn text,
  add column if not exists model text,
  add column if not exists burner text,
  add column if not exists fab text,
  add column if not exists floor text,
  add column if not exists bay text,
  add column if not exists group1 text,
  add column if not exists group2 text,
  add column if not exists detail1 text,
  add column if not exists detail2 text,
  add column if not exists tool_id text,
  add column if not exists tool_maker text,
  add column if not exists tool_model text,
  add column if not exists fab_in text,
  add column if not exists start text,
  add column if not exists turn_on text,
  add column if not exists warranty_date text,
  add column if not exists warranty text,
  add column if not exists pm_cycle text,
  add column if not exists type text,
  add column if not exists extra jsonb;
commit;

/* ---------- 동기화 기록 ---------- */
-- 마지막 적재가 언제·몇 행이었는지. t-mirror가 시트와 대조할 때 기준으로 쓴다.
-- 이게 없으면 "DB가 비었는가, 아니면 시트가 원래 비었는가"를 구분할 수 없다.
create table if not exists public.sheet_sync_log (
  tbl        text primary key,          -- 'wk' · 'mat' · 'inst'
  gid        text not null,
  rows       int  not null,             -- 적재 후 테이블 행수
  sheet_rows int,                       -- 시트에서 읽은 데이터 행수 (같아야 정상)
  ms         int,                       -- 소요 시간
  err        text,                      -- 실패 사유. 성공 시 null
  synced_at  timestamptz not null default now()
);

/* ============================================================
   컬럼 매핑을 왜 표에 담는가 — 제2원칙(스펙 복제) 때문이다
   ------------------------------------------------------------
   시트 헤더 → 컬럼 대응을 sheet-sync 엣지펑션 안에 적으면, 같은 스펙의
   **네 번째 사본**이 생긴다(core.js · hr.js · sheet-write · sync).
   복제된 것은 반드시 갈라진다 — 그래서 t-sync가 있는 것이다.

   그래서 적지 않는다. `GST.SM.SPEC`에서 뽑아 아래 두 표에 넣고,
   엣지펑션은 **표를 읽어서** 헤더를 해석한다. 스펙은 여전히 한 곳(core.js)이고
   sync는 사본이 아니라 소비자가 된다.

   재생성: `node supabase/gen-ddl.mjs` → 나온 SQL을 다시 Run.
   ============================================================ */
create table if not exists public.sheet_spec (
  tbl   text primary key,                -- 'wk' · 'mat' · 'inst'
  gid   text not null,
  -- 헤더 행 찾기 힌트. `[["실적코드"],["자재코드","자재명"]]` 꼴 — 바깥은 AND, 안쪽은 OR.
  -- text[]가 아니라 jsonb인 이유: 힌트 하나가 별칭 여럿을 가질 수 있어 중첩이 필요한데
  -- text[]에 넣으면 ['자재코드','자재명']이 문자열 하나로 눌려 헤더를 영영 못 찾는다.
  -- 실제로 그렇게 눌려서 자재실적이 통째로 안 붙었다.
  hints jsonb not null,
  scan  int  not null default 6          -- 위에서 몇 줄까지 헤더를 찾아볼지
);
create table if not exists public.sheet_colmap (
  tbl      text not null references public.sheet_spec(tbl) on delete cascade,
  col      text not null,                -- DB 컬럼명 (snake_case)
  headers  text[] not null,              -- 시트 헤더 후보. 앞선 것이 우선
  optional boolean not null default false,  -- SPEC의 opt — 없어도 실패로 치지 않는다
  ord      int not null,                 -- SPEC에 적힌 순서
  primary key (tbl, col)
);

/* ---------- RLS ---------- */
-- 읽기: allowed_users에 있는 로그인 사용자만 (pm_adjust와 같은 규약)
-- 쓰기: 정책을 만들지 않는다 = anon/authenticated 전면 차단.
--       sheet-sync 엣지펑션의 service_role만 쓴다 (sheet_locks와 같은 규약).
--       브라우저가 미러를 고칠 수 있으면 그건 미러가 아니다.
do $$
declare t text;
begin
  foreach t in array array['sheet_wk','sheet_mat','sheet_inst',
                           'sheet_sync_log','sheet_spec','sheet_colmap'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "allowed read" on public.%I', t);
    execute format($f$create policy "allowed read" on public.%I
        for select to authenticated
        using ( exists (select 1 from public.allowed_users a
                        where lower(a.email) = lower(auth.jwt()->>'email')) )$f$, t);
  end loop;
end $$;

/* ---------- 컬럼 매핑 시드 (GST.SM.SPEC에서 자동 생성 · 손으로 고치지 말 것) ---------- */
-- 통째로 갈아끼운다. SPEC에서 열이 빠졌으면 여기서도 사라져야 하기 때문이다.
delete from public.sheet_colmap where tbl in ('wk','mat','inst');
delete from public.sheet_spec   where tbl in ('wk','mat','inst');

insert into public.sheet_spec(tbl, gid, hints, scan) values
  ('wk', '646668307', '[["실적코드"],["작업단계"]]'::jsonb, 6);
insert into public.sheet_colmap(tbl, col, headers, optional, ord) values
  ('wk', 'pg', array['제품군'], false, 0),
  ('wk', 'op', array['운영단위'], false, 1),
  ('wk', 'customer', array['고객사'], false, 2),
  ('wk', 'campus', array['단지'], false, 3),
  ('wk', 'line', array['라인'], false, 4),
  ('wk', 'bay', array['BAY'], false, 5),
  ('wk', 'proc', array['공정'], false, 6),
  ('wk', 'subproc', array['세부공정'], false, 7),
  ('wk', 'model', array['MODEL(자사)'], false, 8),
  ('wk', 'rs_code', array['실적코드'], false, 9),
  ('wk', 'status', array['상태'], false, 10),
  ('wk', 'req_type', array['의뢰유형'], true, 11),
  ('wk', 'stage', array['작업단계'], false, 12),
  ('wk', 'chamber', array['챔버'], true, 13),
  ('wk', 'wrs', array['WRS NO'], false, 14),
  ('wk', 'main_eq', array['메인설비호기'], false, 15),
  ('wk', 'prod_code', array['제품코드'], false, 16),
  ('wk', 'eq_no', array['설비호기'], false, 17),
  ('wk', 'chpos', array['채널위치'], false, 18),
  ('wk', 'sn_in', array['S/N(IN)'], false, 19),
  ('wk', 'sn_out', array['S/N(OUT)'], false, 20),
  ('wk', 'pf', array['유/무상'], false, 21),
  ('wk', 'alarm', array['알람유형'], true, 22),
  ('wk', 'phenom', array['현상'], true, 23),
  ('wk', 'cause', array['원인'], true, 24),
  ('wk', 'action', array['조치'], false, 25),
  ('wk', 'action_detail', array['세부조치내용'], true, 26),
  ('wk', 'd_start', array['작업시작일'], false, 27),
  ('wk', 'd_end', array['작업종료일'], false, 28),
  ('wk', 't_start', array['작업시작시간'], false, 29),
  ('wk', 't_end', array['작업종료시간'], false, 30),
  ('wk', 'reg_date', array['실적등록일'], false, 31),
  ('wk', 'ship_date', array['출하일자'], false, 32),
  ('wk', 'move_min', array['총 이동시간(분)'], false, 33),
  ('wk', 'work_min', array['작업시간(분)'], false, 34),
  ('wk', 'man_min', array['작업공수'], false, 35),
  ('wk', 'workers', array['작업자'], false, 36),
  ('wk', 'worker_cnt', array['작업자수'], false, 37);

insert into public.sheet_spec(tbl, gid, hints, scan) values
  ('mat', '31302669', '[["수선실적번호"],["자재코드","자재명"]]'::jsonb, 6);
insert into public.sheet_colmap(tbl, col, headers, optional, ord) values
  ('mat', 'op', array['운영단위'], false, 0),
  ('mat', 'customer', array['고객사'], false, 1),
  ('mat', 'rs_code', array['수선실적번호'], false, 2),
  ('mat', 'campus', array['단지'], false, 3),
  ('mat', 'line', array['라인'], false, 4),
  ('mat', 'bay', array['BAY'], false, 5),
  ('mat', 'proc', array['공정'], false, 6),
  ('mat', 'detail', array['세부공정'], false, 7),
  ('mat', 'main_eq', array['메인설비호기'], false, 8),
  ('mat', 'eq', array['설비호기'], false, 9),
  ('mat', 'chamber', array['챔버'], false, 10),
  ('mat', 'sn', array['S/N'], false, 11),
  ('mat', 'wo', array['W/O번호'], false, 12),
  ('mat', 'model', array['모델명'], false, 13),
  ('mat', 'mat_code', array['자재코드'], false, 14),
  ('mat', 'cust_mat_code', array['고객사자재코드'], true, 15),
  ('mat', 'eq_pos', array['설비위치'], false, 16),
  ('mat', 'unit', array['UNIT'], true, 17),
  ('mat', 'assembly', array['ASSEMBLY'], true, 18),
  ('mat', 'part', array['PART'], true, 19),
  ('mat', 'mat_pos', array['자재위치'], false, 20),
  ('mat', 'qty', array['사용수량'], false, 21),
  ('mat', 'mat_name', array['자재명'], false, 22),
  ('mat', 'spec', array['규격'], false, 23),
  ('mat', 'reason', array['교체사유'], false, 24),
  ('mat', 'prev_paid_date', array['전유상교체일'], false, 25),
  ('mat', 'prev_date', array['전교체일'], false, 26),
  ('mat', 'work_date', array['자재실적일자'], false, 27),
  ('mat', 'days_paid', array['사용일(유상기준)'], false, 28),
  ('mat', 'days_prev', array['사용일(전교체일기준)'], false, 29),
  ('mat', 'pf', array['유/무상'], false, 30),
  ('mat', 'free_reason', array['무상사유'], false, 31),
  ('mat', 'warranty_term', array['자재보증기간'], true, 32),
  ('mat', 'price', array['단가'], false, 33),
  ('mat', 'kit_sn', array['KIT S/N'], true, 34),
  ('mat', 'sn_in', array['IN SN'], true, 35),
  ('mat', 'sn_out', array['OUT SN'], true, 36),
  ('mat', 'stock_chk', array['재고체크여부'], false, 37),
  ('mat', 'store', array['자재창고'], false, 38);

insert into public.sheet_spec(tbl, gid, hints, scan) values
  ('inst', '891608329', '[["Scrubber S/N"]]'::jsonb, 6);
insert into public.sheet_colmap(tbl, col, headers, optional, ord) values
  ('inst', 'pjt', array['PJT.','Product code'], true, 0),
  ('inst', 'country', array['Country','운영단위'], false, 1),
  ('inst', 'customer', array['Customer','고객사'], false, 2),
  ('inst', 'div', array['사업부'], true, 3),
  ('inst', 'location', array['Location','Site'], true, 4),
  ('inst', 'code', array['Scrubber CODE'], false, 5),
  ('inst', 'sn', array['Scrubber S/N'], false, 6),
  ('inst', 'model', array['Scrubber Model'], false, 7),
  ('inst', 'burner', array['Burner Type'], true, 8),
  ('inst', 'fab', array['Line 1','FAB'], false, 9),
  ('inst', 'floor', array['Floor','Line'], true, 10),
  ('inst', 'bay', array['Bay'], true, 11),
  ('inst', 'group1', array['Group_1','Process'], false, 12),
  ('inst', 'group2', array['Group_2','Detail Process(HQ)'], true, 13),
  ('inst', 'detail1', array['Detail_1','Detail Process(Customer)'], false, 14),
  ('inst', 'detail2', array['Detail_2'], true, 15),
  ('inst', 'tool_id', array['Main Tool ID'], true, 16),
  ('inst', 'tool_maker', array['Main Tool Maker'], false, 17),
  ('inst', 'tool_model', array['Main Tool Model'], false, 18),
  ('inst', 'fab_in', array['FAB In','Receipt date'], true, 19),
  ('inst', 'start', array['Start','Setup date'], true, 20),
  ('inst', 'turn_on', array['Turn On','Turn-on date'], true, 21),
  ('inst', 'warranty_date', array['Warranty date'], true, 22),
  ('inst', 'warranty', array['Warranty In/Out'], true, 23),
  ('inst', 'pm_cycle', array['Target PM Cycle','PM CYCLE'], true, 24),
  ('inst', 'type', array['Scrubber type','Type2'], false, 25);
