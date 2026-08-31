/* v133 — 해외(대만) All By-Pass 를 «행 단위 원장»으로 받는다 (2026-08-31 · 사용자 제공 양식)
 *
 * 왜. 지금까지 해외 올바이패스는 ABP 크로스탭 시트(sheet_abp)로만 셌다. 크로스탭은
 * «건수»만 있고 «행»이 없어서, 차트 막대를 눌러도 세부내역이 안 나온다 —
 * CLAUDE.md v125 가 「없는 것을 알람 행으로 채우면 그게 거짓말이다」라고 적어 둔 그 자리다.
 * 사용자가 행 단위 리스트를 만들어 주면서 그 통로가 열렸다.
 *
 * 어디에 담나 — 국내 원장과 «같은 표»(public.sheet_allbypass) 다.
 *   · 스키마가 거의 그대로 맞물린다(별칭 배열로 흡수 — GST.SM.SPEC.abp2).
 *   · 집계 판정이 한 곳이 된다(GST.ALARM.counts) — 제2원칙.
 *   ⚠ «합치는 것»은 스키마뿐이고 규칙이 아니다(제3원칙). 국내/해외는 op → 설치현황
 *     조인으로 갈라지고, 화면은 각자 자기 계통으로 센다.
 *   ⚠ 그래서 «표에 행이 있다» 만으로 국내 원장이 켜졌다고 판정하면 안 된다.
 *     화면은 구분별로 본다(report 의 KR_ABP_ON · OS_ABP_ON).
 *
 * 이 파일이 하는 일 — 해외 양식에만 있는 다섯 열을 «승격»한다.
 * 승격 전에도 값은 안 잃는다(SPEC 밖 열은 extra jsonb 로 담긴다 · v121). 다만 extra 안에
 * 있는 동안은 화면·필터가 못 쓴다.
 *
 * 실행: SQL Editor 에 붙여넣고 Run. 여러 번 Run 해도 안전하다.
 * 순서: 이 파일 → 배포(core.js 먼저) → `/upload/` 에서 「해외 올바이패스」로 업로드.
 *   · 코드를 먼저 배포해도 화면은 안 죽는다(v121 — dbRows 가 표의 «실제» 컬럼만 고른다).
 *   · **업로드 전에는 값이 안 채워진다.** 승격은 자리를 만드는 일이다.
 */

/* ---------- ① 열을 만든다 ----------
 * grp     A열 Group — 한 사건(두 챔버)이 한 번호다. 건수는 이 번호로 센다.
 * proc    Process           · subproc Detail
 * ctype2  조치 유형(코드)    · atype2  고장 유형(한글 분류)
 * ⚠ 국내 워크북에는 이 열들이 없다 — SPEC 에서 optional 이라 옛 파일도 그대로 올라간다.
 */
alter table public.sheet_allbypass add column if not exists grp     text;
alter table public.sheet_allbypass add column if not exists proc    text;
alter table public.sheet_allbypass add column if not exists subproc text;
alter table public.sheet_allbypass add column if not exists ctype2  text;
alter table public.sheet_allbypass add column if not exists atype2  text;

/* 한 사건의 줄을 모아 보는 질의(세부내역·검산)가 흔하므로 색인을 둔다. */
create index if not exists sheet_allbypass_grp_idx on public.sheet_allbypass(src_sheet, grp);

/* ---------- ② 확인 ----------
 * 업로드 «전» 에는 채움 0 이 정상이다 — 자리를 만들었을 뿐이다.
 * 업로드 «후»:
 *   해외행 = 파일의 전체 행수(예: 50)
 *   해외_사건 = Group 개수(예: 25)   ← 화면의 건수는 이쪽이다
 *   해외_집계대상 = 그중 GST 책임 사건(예: 24)
 * 셋이 「행 = 사건 × 2」 로 맞지 않으면 파일에 짝이 안 맞는 Group 이 있다는 뜻이다.
 */
select
  (select count(*)                     from public.sheet_allbypass)                          as 전체행,
  (select count(*)                     from public.sheet_allbypass where src_sheet='OS')     as 해외행,
  (select count(distinct grp)          from public.sheet_allbypass where src_sheet='OS')     as 해외_사건,
  (select count(*)                     from public.sheet_allbypass where src_sheet='OS' and cnt) as 해외_집계대상,
  (select count(*)                     from public.sheet_allbypass where src_sheet<>'OS')    as 국내행,
  (select count(*)                     from public.sheet_allbypass where src_sheet<>'OS' and cnt) as 국내_집계대상;
