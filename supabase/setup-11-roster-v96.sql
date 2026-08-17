/* v96 — 인원현황 양식 변경 (2026-08-17)
 *
 * 새 양식이 네 군데 달라졌다. `sheet_roster` 는 «컬럼 이름 = 시트 머리글» 인 Import 표라,
 * 시트에 열이 늘면 업로드가 «표에 없는 헤더» 로 막힌다(데이터는 안전하지만 일이 멈춘다).
 *
 *   ① 「구분」 신설            — 국내 477 · 해외 107. 지금까지 중문명·Dept·사번 다수결로
 *                                짐작하던 것을 시트가 직접 적어 준다. 짐작보다 언제나 낫다.
 *   ② 「사업부」 → 「운영단위」  — 이름만 바뀐 게 아니라 **값이 진짜가 됐다.**
 *                                옛 「사업부」는 고객사 복사본이었다(12종 완전 일치).
 *                                이제 SEC Scrubber · GST TAIWAN SCRUBBER · SEC CHILLER …
 *   ③ 「ID」 → 「사원번호」      — 파서가 헤더행을 'ID' 로 찾고 있어서, 이대로 올리면
 *                                **인원이 통째로 0명**이 된다(에러 없음). 파서는 v96 에서 고쳤다.
 *   ④ 고객사 표기 (주) → ㈜     — GST.ORG.customer 가 이미 같은 값으로 눕힌다(확인함).
 *
 * ⚠ 옛 열을 지우지 않는다. 옛 추출본을 다시 올릴 일이 있고, 파서는 양쪽을 다 읽는다.
 *   컬럼이 남아 있어도 값이 null 일 뿐 해가 없다.
 *
 * 실행: SQL Editor 에 붙여넣고 Run. 여러 번 Run 해도 안전하다.
 */
alter table public.sheet_roster add column if not exists "구분"     text;
alter table public.sheet_roster add column if not exists "운영단위" text;
alter table public.sheet_roster add column if not exists "사원번호" text;

/* ---------- 확인 ---------- */
select '① 새 열 3개가 생겼는지 (기대 3)' as 항목,
       count(*)::text as 값
  from information_schema.columns
 where table_schema='public' and table_name='sheet_roster'
   and column_name in ('구분','운영단위','사원번호')
union all
select '② 옛 열이 남아 있는지 (기대 2 — ID·사업부)',
       count(*)::text
  from information_schema.columns
 where table_schema='public' and table_name='sheet_roster'
   and column_name in ('ID','사업부')
union all
select '③ 현재 행수', count(*)::text from public.sheet_roster;
