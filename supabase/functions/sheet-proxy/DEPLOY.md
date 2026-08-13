# sheet-proxy 배포 — 웹게시를 끄기 위한 것 (v78)

구글시트를 읽는 **유일한** 통로다. 예전에는 웹게시 CSV를 받아 넘겼고, 이제는
**서비스 계정(Sheets API v4)** 으로 읽는다.

## 왜 바꾸나

**웹게시(publish to web)에는 인증이 없다.** URL만 알면 누구나 전량을 받는다 —
작업자 실명·고객사·설비 S/N까지. 예전 주석은 *"시트 URL은 secret에만 존재 — 클라이언트에
노출되지 않음"* 이라고 적었는데, 그건 **URL을 가린 것이지 데이터를 보호한 게 아니다.**
대시보드에 로그인을 걸어둔 것과 무관한 뒷문이었다.

`sheet-write`가 이미 서비스 계정으로 시트를 **쓰고** 있었다. 같은 방식으로 **읽기만** 하면
웹게시를 끌 수 있다. 새로 만든 것은 없고 검증된 코드를 옮겼다.

## ⚠ 함수 «슬러그»가 표시 이름과 다르다

이 프로젝트의 프록시는 목록에 **`sheet-proxy`** 로 보이지만 URL은
**`/functions/v1/quick-responder`** 다. 콘솔에서 *Deploy a new function* 으로 만들면
`quick-responder` 같은 기본 이름이 붙고, 나중에 **표시 이름만 바꿔도 슬러그는 안 바뀐다.**

- **`quick-responder`를 «별도 함수»로 착각해 지우지 말 것.** 그게 곧 sheet-proxy다.
- 호출하는 쪽은 전부 두 슬러그를 시도한다 — `assets/core.js:163`(`GST.FN_SLUGS`) ·
  `sheet-sync`·`kakao-bot`의 `PROXY_SLUGS`. 하나로 박아두면 404로 조용히 멎는다.
- 고정하고 싶으면 시크릿 `SHEET_PROXY_SLUG`에 실제 슬러그를 넣는다(쉼표로 여러 개 가능).
- **코드를 붙여넣을 함수는 «목록에서 sheet-proxy 로 보이는 그 행»이다** — 새로 만들지 말 것.
  새로 만들면 또 다른 슬러그가 생기고, 옛 함수에 옛 코드가 남아 어느 쪽이 도는지 알 수 없게 된다.

## 순서가 중요하다 — sheet-proxy를 «먼저» 배포한다

`sheet-sync`·`kakao-bot`이 이제 구글이 아니라 **sheet-proxy를 호출한다.**
순서를 뒤집으면 새 `sheet-sync`가 옛 `sheet-proxy`를 부르고, 옛 쪽은 사용자 JWT를 요구하므로
**401로 전부 멎는다.**

1. **`sheet-proxy`** — 코드 교체 → Deploy
2. **`sheet-sync`** · **`kakao-bot`** — 코드 교체 → Deploy
3. **`sheet-write`** — write-through가 추가됐다(아래) → Deploy
4. 아래 자기점검이 전부 `same: true` 인 것을 확인
5. **그때 비로소** 스프레드시트에서 「웹에 게시」 해제

## Secret

새로 만들 것은 없다. 전부 이미 있는 값이고, `sheet-write`가 쓰던 것과 **같은 값**이다.

| 이름 | 쓰임 |
|---|---|
| `GS_SA_EMAIL` · `GS_SA_KEY` | 서비스 계정. `sheet-write`와 같은 값 |
| `GS_SHEET_ID` | 편집 주소의 `/d/<여기>/edit`. **웹게시 URL의 `/d/e/2PACX-…`가 아니다** — 넣으면 404 |
| `SYNC_SECRET` | `sheet-sync`·`kakao-bot`이 서버로서 부를 때 쓴다 |
| `SHEET_PUB_URL` | **아직 지우지 마라.** 4단계 자기점검이 이걸로 옛 경로와 대조한다 |

> ⚠ 서비스 계정에 **시트 열람 권한**이 있어야 한다. `sheet-write`가 이미 쓰고 있으므로
> 보통 이미 공유돼 있다. 아니라면 스프레드시트 공유에 `GS_SA_EMAIL` 주소를 뷰어로 추가한다.

## 웹게시를 끄기 «전에» — 두 경로가 같은지 증명한다

끄고 나면 대조할 기준이 사라진다. **반드시 먼저** 한다.
`op=selfcheck`가 같은 탭을 **웹게시로 한 번, API로 한 번** 읽어 **열별 SHA-256**을 맞춰본다.
행수만 맞춰서는 아무것도 증명되지 않는다 — 열이 한 칸 밀려도 행수는 그대로다.

콘솔 → Edge Functions → **sheet-proxy** → Test. **`gid`는 비워 둔다 — 아홉 개를 전부 돈다.**
목록을 사람이 외워 하나씩 넣게 두면 반드시 빠뜨린다.

```
Query Parameters:  op = selfcheck
Headers:           Authorization: Bearer <anon key>
                   x-sync-secret: <SYNC_SECRET>
```

```json
{ "checked": 9, "same_count": 9, "all_same": true,
  "summary": ["OK   646668307 수선실적", "OK   31302669 자재실적", … ],
  "results": [ { "gid":"646668307", "api":{"rows":17338,"cols":67},
                 "pub":{"rows":17338,"cols":67}, "same":true, "diff_cols":[], "ms":4100 }, … ] }
```

**`"all_same": true`** 하나만 보면 된다. 아니면 `summary`에서 `DIFF`/`ERR` 줄을 찾는다.
값은 응답에 나오지 않는다(열 번호와 체크섬만).

한 시트만 다시 보려면 `gid=646668307`, 몇 개만 보려면 쉼표로 `gid=0,1213453343`.
전체가 시간 초과로 끊기면(자재실적 3만 행이 무겁다) 그렇게 나눠 돌린다.

`same:false`면 `diff_cols`의 열 번호를 보고 원인을 가른다:

| 증상 | 원인 |
|---|---|
| 날짜 열만 어긋난다 | `valueRenderOption`이 `UNFORMATTED_VALUE`로 바뀌었다 → 시리얼 숫자(45000)가 온다. `FORMATTED_VALUE` 고정 |
| 마지막 열들만 어긋난다 | `values.get`이 꼬리 빈칸을 생략한다 → 직사각형 패딩이 빠졌다 |
| 행수가 다르다 | 웹게시 CSV가 아직 옛 스냅샷이다(웹게시는 수 분 지연된다). 잠시 뒤 다시 |

> 마지막 항목이 중요하다 — **웹게시는 지연되고 API는 라이브다.** 방금 시트를 고쳤다면
> `same:false`가 정상일 수 있다. 시트를 건드리지 않은 상태에서 재확인한다.

## 끈 뒤

`?via=pub`와 `op=selfcheck`는 502를 낸다(정상). 그때 `readPubCSV` 블록과 `SHEET_PUB_URL`
시크릿을 지운다. 그 전까지는 **되돌릴 길로 남겨둔다.**

## gid 허용목록

예전에는 `/^\d+$/`이면 무엇이든 통과시켰다. 지금은 아홉 개만 연다(`ALLOW_GID`).
새 탭을 읽으려면 **여기 먼저 추가**해야 한다 — 빠뜨리면 그 시트만 조용히 비고 화면에는
에러가 안 뜬다. `tests/t-mirror.mjs`의 [6]번이 페이지·kakao-bot·SPEC이 요구하는 gid를
모두 덮는지 대조하므로, 추가를 잊으면 **거기서 먼저 걸린다.**

## sheet-write의 write-through (같이 배포한다)

조회가 미러로 옮겨진 뒤(v77), 시트에만 쓰면 다음 `sheet-sync`까지 최대 30분 화면이 옛 값을 본다.
그래서 `sheet-write`가 시트에 쓴 값을 **미러에도 같이 넣는다**(`mirrorWrite`).

- 대상은 지금 **수선실적 하나뿐**이다(`sheet_wk`의 알람·현상·원인·조치).
- 행은 **업무 키(`rs_code`)로 찾고 정확히 한 행일 때만** 쓴다.
  미러 PK인 `src_row`는 `sheet-sync`가 **빈 행을 걸러낸 뒤의 순번**이라 A1 행번호에서
  유도하려면 그 필터 규칙을 복제해야 한다 — 갈라지는 순간 **남의 행을 덮는다.**
- 실패해도 저장은 성공으로 둔다. 응답의 `mirror` 필드에 결과가 실린다
  (`{ok:true,…}` · `{skipped:"no_rows"}` · `{skipped:"ambiguous_2"}` · `{error:…}`).
  `ambiguous_*`가 자주 보이면 실적코드 중복을 실제로 정리해야 한다는 신호다.
