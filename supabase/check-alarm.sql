/* 국내 알람 원장이 «제대로 적재됐는지» 한 번에 판정한다 (v94)
 *
 * 왜 필요한가. 화면에 «Alarm Message 미기재»가 뜨거나 건수가 시트보다 적을 때,
 * 원인이 셋 중 어느 것인지 화면만 봐서는 못 가른다:
 *   ① 시트가 안 채워졌다   ② 적재가 덜 됐다   ③ 화면 코드가 못 읽는다
 * ①은 아니다 — 실측(2026-08-16 워크북): P·H 는 Alarm Comment 공란 0,
 *   K 는 249행이 Comment 대신 「알람」 열에만 있다(화면이 폴백한다).
 * ③도 아니다 — 같은 워크북을 그대로 DB 에 넣고 report 페이지를 렌더하면
 *   P1 8월 48건 · 미기재 0 · Alarm Message 원문 그대로가 나온다(JS 에러 0).
 * 그러므로 화면 숫자가 다르면 ②다. 이 쿼리가 그것을 숫자로 보여준다.
 *
 * 실행: Supabase → SQL Editor → 아래 전체를 붙여넣고 Run. 결과 한 장이면 판정된다.
 * 읽는 법: 「값」을 「항목」의 기대값과 비교한다. ③이 48 이면 적재는 정상이고
 *   배포본이 옛것이다(core.js → report 순으로 올리고 Ctrl+Shift+R).
 *   ③이 48 보다 작으면 /upload/ 로 알람 3시트를 다시 올린다.
 */
with a as (
  select * from public.sheet_alarm
), kr as (
  /* 화면의 「집계 대상만 (내부·내적)」과 같은 판정 — 시트가 적어 둔 열을 그대로 읽는다.
     P는 「내적 / 제외」, K·H는 「외부 / 내부」·「내적/외적」이라 incl 을 먼저 본다. */
  select * from a
   where coalesce(nullif(btrim(incl),''), nullif(btrim(inout),'')) in ('포함','내적','내부')
)
select 1 as "#", '① 알람 시트별 행수' as 항목, src_sheet as 구분, count(*)::text as 값
  from a group by src_sheet
union all
select 2, '① 알람 합계 (기대 21,193)', '-', count(*)::text from a
union all
/* alarm 과 alarm_name 이 «둘 다» 빈 행. 기대 0.
   K 의 「알람열로 폴백」은 정상이므로 여기서는 세지 않는다. */
select 3, '② Message 둘 다 공란 (기대 0)', src_sheet,
       count(*) filter (where coalesce(nullif(btrim(alarm),''),
                                       nullif(btrim(alarm_name),'')) is null)::text
  from a group by src_sheet
union all
/* 화면과 같은 조건. ⚠ 여기 site 는 «알람시트 Site» 다 —
   화면의 「관리담당 기준」을 «알람시트 Site 기준»으로 두었을 때와 같다.
   («설치현황 기준»은 설비 S/N 조인이라 SQL 로 재현되지 않는다.) */
select 4, '③ P1·내적·발생일 8월 (기대 48)', '건수', count(*)::text
  from kr where site = 'P1'
   and occur_date >= date '2026-08-01' and occur_date < date '2026-09-01'
union all
select 5, '③ 그중 Message 공란 (기대 0)', '건수',
       count(*) filter (where coalesce(nullif(btrim(alarm),''),
                                       nullif(btrim(alarm_name),'')) is null)::text
  from kr where site = 'P1'
   and occur_date >= date '2026-08-01' and occur_date < date '2026-09-01'
union all
/* occur_date 가 null 이면 그 행은 «발생일 기준» 어느 달에도 안 들어간다(조용히 빠진다). */
select 6, '④ 발생일 없음 (기대 0)', src_sheet, count(*)::text
  from a where occur_date is null group by src_sheet
union all
select 7, '⑤ 올바 합계 (기대 5,068)', '-', count(*)::text from public.sheet_allbypass
order by 1, 3;
