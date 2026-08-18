/* v121 — 설치현황 「Line 2」 승격 (2026-08-18 · 사용자 요청)
 *
 * 국내 설치현황은 라인이 «두 단»이다:  Site → Line 1 → Line 2 → Bay.
 * 지금까지 화면은 `Line 1` 만 「라인」 축으로 보고 있었고, `Line 2` 는 SPEC 밖이라
 * `extra` jsonb 에 담겨만 있었다 — 값은 잃지 않았지만 화면·필터·챗봇이 못 썼다.
 * 이 파일이 그 열을 «승격»한다.
 *
 * ⚠ 해외 118열 양식에는 `Line 2` 라는 열 자체가 없다. 그래서 optional 이고,
 *   화면에서는 loose 축이다(값이 빈 행은 그 축으로 안 거른다). 안 그러면
 *   「라인2 를 고르면 해외 설비가 통째로 사라진다」가 된다.
 *
 * ⚠ 이름이 셋 다 비슷하다 — `Line`(해외 Floor) · `Line 1`(라인) · `Line 2`(라인2).
 *   헤더 정규화가 공백·마침표를 지우므로 line / line1 / line2 로 갈린다.
 *   별칭을 늘려 섞으면 한 축에 두 차원이 들어간다(제1원칙).
 *
 * 실행: SQL Editor 에 붙여넣고 Run. 여러 번 Run 해도 안전하다.
 * 순서: 이 파일 → (선택) 배포 → `/upload/` 로 설치현황 재업로드.
 *   · 코드를 먼저 배포해도 화면은 안 죽는다(v121 부터 dbRows 가 표의 «실제» 컬럼만
 *     고른다). 그때까지 라인2 칸은 「전체 (이 화면 미적용)」으로 잠겨 있을 뿐이다.
 *   · 다만 **재업로드 전에는 값이 안 채워진다.** 승격은 자리를 만드는 일이고,
 *     옛 행의 line2 는 null 이다. 값은 파일에서 온다.
 */

/* ---------- ① 미러 표에 열을 만든다 ---------- */
alter table public.sheet_inst add column if not exists line2 text;

/* ---------- ② 챗봇이 미러에서 «시트 모양 CSV» 를 되살릴 때 쓸 머리글 ----------
 * 여기를 빠뜨리면 화면은 되는데 **봇만** 그 열을 못 본다(v89 가 경고한 자리).
 * ord 는 setup-4-tables.sql 이 GST.SM.SPEC 에서 뽑은 값과 같아야 한다 —
 * 라인2 가 들어오면서 floor 뒤쪽이 한 칸씩 밀렸다. 그래서 inst 는 통째로 다시 넣는다.
 */
delete from public.sheet_colmap where tbl = 'inst';
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
  ('inst', 'line2', array['Line 2'], true, 10),
  ('inst', 'floor', array['Floor','Line'], true, 11),
  ('inst', 'bay', array['Bay'], true, 12),
  ('inst', 'group1', array['Group_1','Process'], false, 13),
  ('inst', 'group2', array['Group_2','Detail Process(HQ)'], true, 14),
  ('inst', 'detail1', array['Detail_1','Detail Process(Customer)'], false, 15),
  ('inst', 'detail2', array['Detail_2'], true, 16),
  ('inst', 'tool_id', array['Main Tool ID'], true, 17),
  ('inst', 'tool_maker', array['Main Tool Maker'], false, 18),
  ('inst', 'tool_model', array['Main Tool Model'], false, 19),
  ('inst', 'fab_in', array['FAB In','Receipt date'], true, 20),
  ('inst', 'start', array['Start','Setup date'], true, 21),
  ('inst', 'turn_on', array['Turn On','Turn-on date'], true, 22),
  ('inst', 'warranty_date', array['Warranty date'], true, 23),
  ('inst', 'warranty', array['Warranty In/Out'], true, 24),
  ('inst', 'pm_cycle', array['Target PM Cycle','PM CYCLE'], true, 25),
  ('inst', 'type', array['Scrubber type','Type2'], false, 26),
  ('inst', 'state', array['설비상태','Equipment Status','Status'], true, 27);

/* ---------- ③ 확인 ----------
 * 재업로드 «전» 에는 채움 0 이 정상이다 — 자리를 만들었을 뿐이다.
 * 재업로드 «후» 에 여전히 0 이면 그때가 문제다(그때는 파일에 Line 2 열이 있는지 본다).
 */
select
  (select count(*) from public.sheet_inst)                            as 전체행,
  (select count(*) from public.sheet_inst where coalesce(line2,'')<>'') as 라인2_채움,
  (select count(*) from public.sheet_colmap where tbl='inst')         as 컬럼맵_항목수;
