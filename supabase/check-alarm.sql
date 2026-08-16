/* 국내 알람 원장이 «제대로 적재됐는지» 10초 만에 판정하는 쿼리 (v94)
 *
 * 왜 필요한가. 화면에 «Alarm Message 미기재»가 뜨거나 건수가 시트보다 적을 때,
 * 원인이 셋 중 어느 것인지 화면만 봐서는 못 가른다:
 *   ① 시트가 안 채워졌다   ② 적재가 덜 됐다   ③ 화면 코드가 못 읽는다
 * 실측으로 ①은 아니다(P·H 는 Alarm Comment 공란 0 · K 는 249행이 「알람」 열에만 있다).
 * 그리고 ③도 아니다 — 같은 워크북을 그대로 넣고 페이지를 렌더하면 미기재 0 · P1 8월 48건이 나온다.
 * 그러므로 숫자가 다르면 ②다. 이 쿼리가 그것을 숫자로 보여준다.
 *
 * 실행: Supabase SQL Editor 에 붙여넣고 Run.
 */

/* ---------- 1. 시트별 행수 — 기대값과 대조 ----------
   기대(2026-08-16 워크북): K 7,390 · P 9,992 · H 3,811 = 21,193
   하나라도 크게 모자라면 그 시트가 덜 올라간 것이다 → /upload/ 로 다시 올린다. */
select '① 시트별 행수' as 항목, src_sheet, count(*) as 행수
  from public.sheet_alarm group by src_sheet
union all
select '① 합계', '-', count(*) from public.sheet_alarm;

/* ---------- 2. Alarm Message 가 비는 행 ----------
   기대: alarm 과 alarm_name 이 «둘 다» 빈 행은 0 이어야 한다.
   K 는 249행이 alarm 대신 alarm_name 에 있다(그래서 화면이 폴백한다) — 정상이다.
   둘 다 빈 행이 있으면 그 시트의 Alarm Comment 열이 적재되지 않은 것이다. */
select '② Message 공란' as 항목, src_sheet,
       count(*) filter (where coalesce(nullif(btrim(alarm),''), nullif(btrim(alarm_name),'')) is null) as 둘다_공란,
       count(*) filter (where nullif(btrim(alarm),'') is null
                          and nullif(btrim(alarm_name),'') is not null)                                as 알람열로_폴백,
       count(*)                                                                                        as 전체
  from public.sheet_alarm group by src_sheet;

/* ---------- 3. 사용자가 본 화면과 같은 조건으로 세어 본다 ----------
   P1 · 내적 · 발생일 2026-08. 기대 48건 · Message 공란 0.
   ⚠ 여기 site 는 «알람시트 Site» 다. 화면의 「관리담당 기준」을 «알람시트 Site 기준»으로
     두었을 때와 같은 조건이다(설치현황 기준은 설비 S/N 조인이라 SQL 로 재현되지 않는다). */
select '③ P1 8월(발생일·내적)' as 항목,
       count(*)                                                                as 건수,
       count(*) filter (where coalesce(nullif(btrim(alarm),''),
                                       nullif(btrim(alarm_name),'')) is null)  as message_공란,
       min(occur_date) as 최초, max(occur_date) as 최종
  from public.sheet_alarm
 where site = 'P1'
   and coalesce(nullif(btrim(incl),''), nullif(btrim(inout),'')) in ('포함','내적','내부')
   and occur_date >= date '2026-08-01' and occur_date < date '2026-09-01';

/* ---------- 4. 발생일이 안 읽힌 행 ----------
   occur_date 가 null 이면 그 행은 «발생일 기준» 어느 달에도 안 들어간다(조용히 빠진다).
   기대 0. 0이 아니면 Occur Time 열의 서식이 시트마다 다른 것이다. */
select '④ 발생일 없음' as 항목, src_sheet, count(*) as 행수
  from public.sheet_alarm where occur_date is null group by src_sheet;

/* ---------- 5. 올바이패스도 같이 ----------
   기대(같은 워크북): 5,068행. 화면의 Table Editor 표시와 대조하면 된다. */
select '⑤ 올바이패스 행수' as 항목, src_sheet, count(*) as 행수
  from public.sheet_allbypass group by src_sheet
union all
select '⑤ 합계', '-', count(*) from public.sheet_allbypass;

/* ---------- 6. 업로드 모드 표식 ----------
   ms = -1 이면 수동 업로드 모드(정상). rows 가 위 ①의 합계와 같아야 한다. */
select '⑥ 적재 로그' as 항목, key, rows, ms, at
  from public.sheet_sync_log
 where key in ('sheet_alarm','sheet_allbypass','alarm','allbypass')
 order by at desc limit 10;
