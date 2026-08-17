/* 챗봇이 수선실적을 «질문할 때 직접 조회»하게 만든 뒤 필요한 인덱스 (v97)
 *
 * 왜 필요한가. v96 까지 봇은 sheet_wk 를 통째로 읽어 bot_cache 에 JSON 덩어리로
 * 담았다. 17,091행 시절의 구조인데 257,606행이 되자(2025 156,297 · 2026 100,806)
 * 엣지펑션 워커가 메모리 한도로 죽었다 — 실측 응답코드 546. 게다가 faults 는 sync
 * 순서상 leave·cip «앞»이라, 죽으면 뒤의 둘도 시도조차 안 된 채 옛 시각으로 남는다.
 * 워커가 죽으면 catch 가 못 도니 bot_cache.error 는 비어 있다 — 화면에 단서가 없다.
 * (실측: faults·leave·cip 가 3일간 2026-08-14 11:00 에 멈춰 있었고 에러는 전부 NULL.)
 *
 * v97 부터 봇은 질문에서 뽑은 조건(기간·작업단계·S/N)을 그대로 SQL 조건으로 보내
 * 필요한 행만 받는다. 그러면 «어떤 열로 거르는가»가 성능을 정한다 — 인덱스가 없으면
 * 질문 한 번에 25만 행을 훑는다.
 *
 * ⚠ 컬럼 이름은 sheet_colmap 에서 나온 것이지 여기서 정한 것이 아니다.
 *   스펙의 정본은 assets/core.js 의 GST.SM.SPEC.wk 다 — 열 이름이 바뀌면
 *   `node supabase/gen-ddl.mjs` 로 colmap 을 다시 뽑은 뒤 여기 인덱스도 같이 고친다.
 *
 * 실행: Supabase → SQL Editor → 전체 붙여넣고 Run. 여러 번 돌려도 안전하다.
 *       선행: setup-4-tables.sql (sheet_wk · sheet_colmap 이 있어야 한다)
 */

/* 기간 조건이 모든 조회에 붙는다 — 이 하나가 가장 크다.
   d_start 는 text 다(미러는 전부 text 로 시작한다 — 값 하나가 이상해도 적재가 안 죽게).
   값이 'YYYY-MM-DD' 로 시작하므로 사전순 비교가 곧 날짜 비교이고, 기본 B-tree 로 충분하다.
   ⚠ text_pattern_ops 를 쓰면 안 된다 — >=·<= 범위 비교에 안 쓰인다(LIKE 전용이다). */
create index if not exists sheet_wk_d_start_idx
  on public.sheet_wk (d_start);

/* 「BM 몇 건」류가 가장 흔하다. 기간 + 작업단계 복합이라야 두 조건이 한 번에 걸린다.
   순서가 규약이다 — 등호(stage) 가 앞, 범위(d_start) 가 뒤여야 인덱스를 끝까지 탄다. */
create index if not exists sheet_wk_stage_dstart_idx
  on public.sheet_wk (stage, d_start);

/* 설비 한 대의 이력(「DBW-0000 고장 언제」). 봇은 ilike '%…%' 로 찾으므로
   B-tree 는 안 쓰인다 → trigram 이 필요하다. 확장이 없으면 이 블록만 건너뛴다
   (인덱스가 없어도 «틀리지» 않는다. 느릴 뿐이다 — 그래서 실패로 막지 않는다). */
do $$
begin
  create extension if not exists pg_trgm;
  execute 'create index if not exists sheet_wk_sn_in_trgm_idx
             on public.sheet_wk using gin (sn_in gin_trgm_ops)';
exception when others then
  raise notice 'pg_trgm 을 못 켰습니다 — S/N 조회가 느려집니다(정확도는 그대로): %', sqlerrm;
end $$;

analyze public.sheet_wk;

/* 확인 — 셋이 다 잡혔는지. sn_in 것은 pg_trgm 이 없으면 빠질 수 있다(정상). */
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'sheet_wk'
   and indexname like 'sheet_wk_%'
 order by indexname;
