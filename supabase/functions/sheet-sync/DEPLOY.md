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
이미 Run했다면 **다시 할 필요 없다** — 아래 확인 쿼리로 상태만 보면 된다.

#### Run이 제대로 됐는지 확인

SQL Editor에 붙여넣고 Run. 아홉 줄이 **전부 `OK`** 여야 한다.

```sql
with cnt as (
  select t, case when to_regclass('public.'||t) is null then 0
    else (xpath('/row/c/text()',
          query_to_xml('select count(*) as c from public.'||t, false, true, '')))[1]::text::int end n
  from (values ('sheet_spec'),('sheet_colmap')) v(t)
)
select 항목, 실제, 기대, case when 실제 = 기대 then 'OK' else '<<< 다름' end 판정 from (
  select 1 ord, '표 sheet_'||t||' 열수' 항목,
         (select count(*) from information_schema.columns
           where table_schema='public' and table_name='sheet_'||t) 실제, e 기대
    from (values ('wk',40),('mat',41),('inst',27)) v(t,e)
  union all
  select 2, '매핑 colmap '||t,
         case when to_regclass('public.sheet_colmap') is null then 0
         else (xpath('/row/c/text()', query_to_xml(
                'select count(*) as c from public.sheet_colmap where tbl='''||t||'''',
                false, true, '')))[1]::text::int end, e
    from (values ('wk',38),('mat',39),('inst',25)) v(t,e)
  union all select 3, 'sheet_spec 행수',   (select n from cnt where t='sheet_spec'), 3
  union all select 4, '적재 함수 개수',    (select count(*)::int from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname in ('sheet_sync_upsert','sheet_sync_finish')), 2
  union all select 5, 'RLS 켜진 미러 표', (select count(*)::int from pg_class
     where relkind='r' and relnamespace='public'::regnamespace
       and relname in ('sheet_wk','sheet_mat','sheet_inst',
                       'sheet_sync_log','sheet_spec','sheet_colmap')
       and relrowsecurity), 6
) x order by ord, 항목;
```

표 이름을 직접 쓰지 않고 `to_regclass` + `query_to_xml`로 감싼 이유가 있다.
직접 쓰면 표가 하나도 없을 때 Postgres가 **파싱 단계에서 거부**해,
정작 진단이 가장 필요한 "아무것도 안 들어간 상태"에서 오류만 뜨고 아무것도 못 본다.

마지막 줄의 여섯 개 목록은 **`setup-4-tables.sql`의 `foreach ... array[...]`와 같아야 한다.**
표를 추가하면 둘 다 고친다. 예전에 여기가 `relname like 'sheet\_%'` 였는데,
시트쓰기가 쓰는 `sheet_edits`·`sheet_locks`까지 세어 **멀쩡한 배포에 8 ≠ 6으로 빨간불**이 켜졌다.
남의 이름공간에 와일드카드를 걸면 표가 하나 늘 때마다 거짓 경보가 난다 —
그리고 거짓 경보를 내는 검사는 곧 무시당한다.

`<<< 다름`이 나오면:

| 어디가 다른가 | 뜻 | 할 일 |
|---|---|---|
| 전부 0 | SQL을 아직 안 돌렸다 | `setup-4` → `setup-5` 순서로 Run |
| 표 열수는 맞는데 **colmap·spec이 0** | `setup-4`의 **끝부분(시드)** 이 안 들어갔다 | `setup-4`를 **통째로** 다시 Run |
| **함수 개수 0** | `setup-5`를 안 돌렸다 | `setup-5` Run |
| 열수가 기대보다 **적다** | 시트에 열이 늘어 SPEC이 앞서간 것 | 아래 「시트에 열이 늘었을 때」 |
| **RLS가 6보다 크게 나온다** | 옛 와일드카드 쿼리를 쓰고 있다 | 위 쿼리로 교체. `sheet_edits`·`sheet_locks`는 시트쓰기 표라 이 확인의 대상이 아니다 |

어느 쪽이든 **통째로 다시 Run해도 안전하다.**

### 2. 함수 배포

Edge Functions → Deploy a new function → 이름을 정확히 **`sheet-sync`** →
`index.ts` 내용을 통째로 붙여넣고 Deploy.

단일 파일이라 `../_shared` import 문제는 없다(웹 콘솔은 함수 폴더 밖을 못 읽는다).

### 3. Secret

Edge Functions → Secrets. **값이 아니라 이름만 여기 적는다.**

| 이름 | 상태 |
|---|---|
| `SYNC_SECRET` | **이미 있다** — `kakao-bot`이 `?op=sync` 인증에 쓰는 것과 같은 값 |
| `SHEET_PUB_URL` | **이미 있다** — `sheet-proxy`·`kakao-bot`이 쓰는 것과 같은 값 |
| `SUPABASE_URL` | 플랫폼이 자동 주입 |
| `SUPABASE_SERVICE_ROLE_KEY` | 플랫폼이 자동 주입 |

> **`SYNC_SECRET`을 새로 만들지 말 것.** Supabase 시크릿은 함수별이 아니라
> **프로젝트 전체 공용**이라 `sheet-sync`가 기존 값을 그대로 본다.
> 값을 바꾸면 `kakao-bot`의 기존 sync 호출이 같이 깨진다.
> 값을 모르겠으면 Secrets 화면에서 확인하거나, 바꾸려면 **두 함수의 호출부를 같이** 고친다.

### 4. 손으로 한 번 돌려 본다

```bash
curl -X POST "https://<프로젝트>.supabase.co/functions/v1/sheet-sync?op=sync&key=inst" \
     -H "Authorization: Bearer <anon key>" \
     -H "x-sync-secret: <SYNC_SECRET>"
```

콘솔의 **Edge Functions → sheet-sync → Test** 패널로도 같은 것을 할 수 있다.
Query Parameters에 `key`=`inst`, **Headers에 `x-sync-secret`** 을 넣는다
(`op`은 기본값이 `sync`라 생략해도 된다).

**401이 나오면 본문을 보고 원인을 가른다.** 두 가지가 전혀 다른 문제다:

| 응답 본문 | 누가 막았나 | 원인 · 할 일 |
|---|---|---|
| `{"error":"unauthorized"}` | **이 함수 코드** | `x-sync-secret` 헤더가 없거나 값이 틀렸다. Headers에 추가하라 |
| 그 밖의 401 (`Missing authorization header` 등) | **플랫폼 JWT 게이트** | `Authorization: Bearer <anon key>`를 추가하라 |

앞의 것이 나왔다면 **`SYNC_SECRET`이 프로젝트에 존재한다는 증거이기도 하다** —
미설정이면 이 함수는 401이 아니라 **500**(`SYNC_SECRET 미설정`)을 낸다.

**`Authorization` 헤더를 빠뜨리지 말 것.** 엣지펑션의 `Verify JWT` 설정이 기본 켜짐이라,
켜져 있으면 이 헤더가 없는 요청은 **함수 코드에 닿기도 전에** 플랫폼이 401로 끊는다
(콘솔 Test 패널은 자체적으로 붙여주므로 여기서는 안 걸릴 수 있다 — curl·pg_cron에서 걸린다).

anon key는 원래 공개값이다(Settings → API → `anon public`, 또는 `assets/core.js:42`에
그대로 들어 있다 — 대시보드가 브라우저에서 쓰는 값). 실제 권한 판정은 여전히
`SYNC_SECRET`이 한다. **service_role key를 쓰지 말 것** — 아래 cron 정의에 평문으로 남는다.

> Verify JWT를 끄는 방법도 있다(kakao-bot이 그 형태다 — 카카오 서버가 Supabase JWT를
> 못 만드니 필연). 다만 위 형태는 **켜져 있든 꺼져 있든 통과**하므로 설정을 건드릴 이유가 없다.

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

**`timeout_milliseconds`를 반드시 준다.** `net.http_post`의 기본값은 **5초**인데
자재실적은 CSV만 9MB에 배치가 20회라 5초에 절대 안 끝난다. 안 주면 매번 끊긴다.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- <프로젝트> · <anon key> · <SYNC_SECRET>을 실제 값으로 바꾼다
select cron.schedule('sync-inst', '5,35 * * * *', $$
  select net.http_post(
    url := 'https://<프로젝트>.supabase.co/functions/v1/sheet-sync?op=sync&key=inst',
    headers := '{"Authorization":"Bearer <anon key>","x-sync-secret":"<SYNC_SECRET>"}'::jsonb,
    timeout_milliseconds := 120000) $$);

select cron.schedule('sync-wk',   '10,40 * * * *', $$
  select net.http_post(
    url := 'https://<프로젝트>.supabase.co/functions/v1/sheet-sync?op=sync&key=wk',
    headers := '{"Authorization":"Bearer <anon key>","x-sync-secret":"<SYNC_SECRET>"}'::jsonb,
    timeout_milliseconds := 120000) $$);

select cron.schedule('sync-mat',  '20,50 * * * *', $$
  select net.http_post(
    url := 'https://<프로젝트>.supabase.co/functions/v1/sheet-sync?op=sync&key=mat',
    headers := '{"Authorization":"Bearer <anon key>","x-sync-secret":"<SYNC_SECRET>"}'::jsonb,
    timeout_milliseconds := 120000) $$);
```

30분 간격이다. 시트가 그보다 자주 바뀌지 않는다.
확인은 `select * from cron.job;` ·
`select * from cron.job_run_details order by start_time desc limit 10;`
(타임아웃에 걸렸다면 여기서 잡힌다. `sheet_sync_log`는 함수가 끝까지 갔을 때만 남으므로
**cron 쪽이 조용하고 log 쪽만 비어 있으면 타임아웃을 의심한다.**)

되돌리려면 `select cron.unschedule('sync-mat');`

## 시트에 열이 늘었을 때

여기를 고치는 게 **아니다.** 열 이름은 이 함수 어디에도 없다.

1. `assets/core.js`의 `GST.SM.SPEC`에 필드를 추가한다 (정본)
2. `node supabase/gen-ddl.mjs` — `setup-4-tables.sql`이 다시 만들어진다
3. 그 SQL을 Run (열 추가 + 매핑 시드 갱신이 같이 들어 있다)
   — 시드는 `delete` 후 다시 넣으므로 **매핑이 통째로 갈아끼워지는 것이 정상**이다.
   SPEC에서 열을 뺐다면 여기서도 사라져야 하기 때문에 그렇게 만들어 두었다.
4. `cd tests && npm run mirror` 로 세 곳이 안 갈라졌는지 확인
5. 함수는 **재배포할 필요가 없다** — 매핑을 표에서 읽기 때문이다

## 주의

- **시트는 여전히 원장이다.** 이 함수는 한 방향(시트 → DB)으로만 흐른다.
  대시보드의 쓰기는 지금처럼 `sheet-write`로 시트에 간다. 그래야 한 방향이 유지된다.
- 실패한 적재는 **꼬리를 자르지 않는다**(`sheet_sync_finish`의 `p_err` 분기).
  자르면 시트를 못 읽었을 때 멀쩡한 미러가 통째로 지워진다.
- `key`는 화이트리스트다(`wk`·`mat`·`inst`). RPC 안에서도 한 번 더 막는다 —
  표 이름을 문자열로 받아 `EXECUTE`하기 때문이다.
- **자재실적은 실행시간 여유가 크지 않다.** CSV 9MB를 받아 배치 20회(1,500행씩)를 돈다.
  무료 요금제 벽시계 안에 들어가긴 하지만 넉넉하진 않다.
  시간 초과가 나면 **`index.ts`의 `BATCH`를 1500 → 3000으로 올린다** — 왕복이 절반이 된다.
  더 올리면 jsonb 한 덩이가 커져 이번엔 메모리에 걸리므로 3000쯤에서 멈추는 게 좋다.
