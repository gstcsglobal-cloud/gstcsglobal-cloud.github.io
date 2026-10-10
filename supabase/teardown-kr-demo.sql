-- ============================================================================
-- teardown-kr-demo — 주간현황(국내) 데모 접기 (v176 · 사용자 확정 「국내 데모 페이지는 필요없다 · 전체 업로드 할 거라」)
--
-- ⚠ 사람이 Supabase SQL Editor 에서 Run 한다 — 지우는 문장(drop · delete)이 있어 MCP 확인 창 뒤로 간다(CLAUDE.md v140).
--   확인 창을 피하려고 이 파일을 고쳐 쓰지 않는다.
-- ⚠ 화면은 이미 데모 표를 안 부른다(/report-kr/ · 업로드·데이터 관리의 ?site=KR 을 걷어냈다). 그래서 이 파일은 «언제 Run 해도» 안전하다
--   — 운영 표(sheet_*)·해외 자료는 한 행도 안 건드린다. 실행 전 실측(2026-10-10): 데모 표 일곱 · 약 52MB(DB 371MB 중).
--
-- 무엇을 지우나
--   ① 데모 표 일곱(kr_sheet_*) — 그 안의 자료는 운영 표 국내분의 «복사본»이었다(setup-17 4절). 원본은 운영 표에 그대로 있다.
--      cascade 를 쓰지 않는다 — 다른 것이 그 표에 기대고 있으면 여기서 «멈춘다»(실측: 뷰·외래키·cron 0).
--   ② 적재 기록 두 줄(sheet_sync_log 의 kr_wk · kr_inst)
--   ③ 국내 데모 운영자 계정(allowed_users role='kr') 과 그 로그인 계정(auth.users) — 아이디 계정(@gstcs.view)만 지운다.
--      이메일 계정은 이 파일이 지우지 않는다(혹시 kr 등급을 받은 이메일 계정이 있으면 role 만 viewer 로 돌린다).
--
-- 남기는 것
--   · setup-17 의 함수들(_kr_can · _tbl_can_write · edit_last_wk(p_sns, p_tbl) …) — kr 갈래는 이제 아무도 안 타는 빈 갈래다.
--     edit_last_wk 의 두 인자 판은 데이터 관리가 지금도 부른다(p_tbl='sheet_wk') — 지우면 설비 칸 채우기가 멈춘다.
--   · 편집 이력(sheet_edits)의 kr_ 표 줄(실측 4줄) — 이력은 지우지 않는다.
--   ⚠ setup-17 을 다시 Run 하지 말 것 — 4절이 데모 표를 다시 만들고 운영 국내분을 또 복사한다(52MB).
-- ============================================================================

begin;

drop table if exists public.kr_sheet_wk, public.kr_sheet_inst, public.kr_sheet_roster, public.kr_sheet_edu,
                     public.kr_sheet_leave, public.kr_sheet_alarm, public.kr_sheet_allbypass;

delete from public.sheet_sync_log where tbl in ('kr_wk', 'kr_inst');

-- 로그인 계정 먼저(allowed_users 를 보고 고르므로) — auth.identities·sessions 는 auth 스키마 안에서 따라 지워진다
delete from auth.users
 where lower(email) like '%@gstcs.view'
   and lower(email) in (select lower(email) from public.allowed_users where role = 'kr');

update public.allowed_users set role = 'viewer' where role = 'kr' and lower(email) not like '%@gstcs.view';
delete from public.allowed_users where role = 'kr';

commit;

notify pgrst, 'reload schema';

-- 확인 — 셋 다 0 이면 끝났다
select (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname like 'kr\_sheet\_%' and c.relkind = 'r')      as demo_tables,
       (select count(*) from public.sheet_sync_log where tbl like 'kr\_%')                       as demo_sync_log,
       (select count(*) from public.allowed_users where role = 'kr')                            as kr_users;
