# sheet-sync 배포

구글시트 웹게시 CSV를 미러 표(`sheet_wk` · `sheet_mat` · `sheet_inst`)에 적재하는 함수다.
**GitHub에 올린다고 반영되지 않는다** — Supabase 콘솔에서 따로 배포해야 한다.

## 순서

### 1. SQL 먼저 (순서가 중요하다)

Supabase → SQL Editor → New query → 전체 붙여넣고 Run. **이 순서로.**

1. `supabase/setup-4-tables.sql` — 표 + RLS + 컬럼 매핑 시드
2. `supabase/setup-5-sync-rpc.sql` — 적재 함수 두 개

두 번째가 첫 번째의 표를 참조하므로 순서를 바꾸면 실패한다.
둘 다 **여러 번 돌려도 안전**하다(`if not exists` · `create or replace`).

### 2. 함수 배포

Edge Functions → Deploy a new function → 이름을 정확히 **`sheet-sync`** →
`index.ts` 내용을 통째로 붙여넣고 Deploy.

단일 파일이라 `../_shared` import 문제는 없다(웹 콘솔은 함수 폴더 밖을 못 읽는다).

### 3. Secret

Edge Functions → Secrets. **값이 아니라 이름만 여기 적는다.**

| 이름 | 비고 |
|---|---|
| `SYNC_SECRET` | 새로 만든다. 아무 긴 무작위 문자열. 미설정이면 함수가 500으로 거부한다 |
| `SHEET_PUB_URL` | **이미 있다** — `sheet-proxy`·`kakao-bot`이 쓰는 것과 같은 값 |
| `SUPABASE_URL` | 플랫폼이 자동 주입 |
| `SUPABASE_SERVICE_ROLE_KEY` | 플랫폼이 자동 주입 |

### 4. 손으로 한 번 돌려 본다

```bash
curl -X POST "https://<프로젝트>.supabase.co/functions/v1/sheet-sync?op=sync&key=inst" \
     -H "x-sync-secret: <SYNC_SECRET>"
```

가장 작은 표(설치현황 1,490행)부터 한다. 응답은 이런 모양이다:

```json
{ "ok": true, "result": [ { "tbl":"inst", "ok":true, "headerRow":0,
    "rows":1490, "trimmed":0, "sheet_rows":1490, "ms":3100 } ] }
```

`rows`와 `sheet_rows`가 같아야 정상이다. 다르면 적재가 덜 된 것이다.
그다음 `key=wk`, `key=mat` 순으로. 자재실적이 9MB로 가장 크고 가장 느리다.

실패하면 이유가 그대로 온다 — `NO_HEADER`(헤더 행을 못 찾음) ·
`NO_COL`(열 이름이 바뀜) · `SHEET_FETCH 4xx`(웹게시가 끊김).
같은 내용이 `sheet_sync_log.err`에도 남는다:

```
select * from sheet_sync_log;
```

### 5. pg_cron으로 자동화

SQL Editor에서. **표마다 따로, 시각을 어긋나게 건다.**
`key=all`로 한 번에 돌리면 자재실적 9MB가 앞을 막아 무료 요금제 실행시간에 걸릴 수 있다.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- <프로젝트>와 <SYNC_SECRET>을 실제 값으로 바꾼다
select cron.schedule('sync-inst', '5,35 * * * *', $$
  select net.http_post(
    url := 'https://<프로젝트>.supabase.co/functions/v1/sheet-sync?op=sync&key=inst',
    headers := '{"x-sync-secret":"<SYNC_SECRET>"}'::jsonb) $$);

select cron.schedule('sync-wk',   '10,40 * * * *', $$
  select net.http_post(
    url := 'https://<프로젝트>.supabase.co/functions/v1/sheet-sync?op=sync&key=wk',
    headers := '{"x-sync-secret":"<SYNC_SECRET>"}'::jsonb) $$);

select cron.schedule('sync-mat',  '20,50 * * * *', $$
  select net.http_post(
    url := 'https://<프로젝트>.supabase.co/functions/v1/sheet-sync?op=sync&key=mat',
    headers := '{"x-sync-secret":"<SYNC_SECRET>"}'::jsonb) $$);
```

30분 간격이다. 시트가 그보다 자주 바뀌지 않는다.
확인은 `select * from cron.job;` · `select * from cron.job_run_details order by start_time desc limit 10;`

되돌리려면 `select cron.unschedule('sync-mat');`

## 시트에 열이 늘었을 때

여기를 고치는 게 **아니다.** 열 이름은 이 함수 어디에도 없다.

1. `assets/core.js`의 `GST.SM.SPEC`에 필드를 추가한다 (정본)
2. `node supabase/gen-ddl.mjs` — `setup-4-tables.sql`이 다시 만들어진다
3. 그 SQL을 Run (열 추가 + 매핑 시드 갱신이 같이 들어 있다)
4. `cd tests && npm run mirror` 로 세 곳이 안 갈라졌는지 확인
5. 함수는 **재배포할 필요가 없다** — 매핑을 표에서 읽기 때문이다

## 주의

- **시트는 여전히 원장이다.** 이 함수는 한 방향(시트 → DB)으로만 흐른다.
  대시보드의 쓰기는 지금처럼 `sheet-write`로 시트에 간다. 그래야 한 방향이 유지된다.
- 실패한 적재는 **꼬리를 자르지 않는다**(`sheet_sync_finish`의 `p_err` 분기).
  자르면 시트를 못 읽었을 때 멀쩡한 미러가 통째로 지워진다.
- `key`는 화이트리스트다(`wk`·`mat`·`inst`). RPC 안에서도 한 번 더 막는다 —
  표 이름을 문자열로 받아 `EXECUTE`하기 때문이다.
