# dash-chat 엣지펑션 배포 (대시보드 챗봇 AI 응답)

배포하지 않아도 챗봇은 동작합니다(기본 응답). 배포하면 자유로운 문장으로 답합니다.
페이지 코드는 손댈 필요가 없습니다 — 함수가 생기는 순간 자동으로 AI 경로를 씁니다.

---

## 1. 함수 만들기

Supabase 대시보드 → 왼쪽 메뉴 **Edge Functions** → **Deploy a new function**
→ **Via Editor**(브라우저에서 작성) 선택

- **Function name**: `dash-chat` ← 철자 정확히. 이 이름이 곧 호출 주소가 됩니다.
- 자동으로 만들어진 `index.ts`의 내용을 **전부 지우고**, 같은 폴더의 `index.ts` 내용을
  통째로 붙여넣습니다.
- **Deploy** 클릭.

> 폴더 경로(`supabase/functions/dash-chat/`)를 직접 만들 필요는 없습니다.
> 그 경로는 CLI로 배포할 때 쓰는 표준 위치일 뿐이고, 웹 콘솔은 이름만 맞으면 됩니다.

## 2. Secret 확인

Edge Functions → **Secrets**(또는 Project Settings → Edge Functions → Secrets)

| 이름 | 필수 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 필수 | 이미 등록돼 있으면 그대로 씁니다. 없으면 추가 |
| `DASH_CHAT_MODEL` | 선택 | 기본 `claude-sonnet-5`. 더 똑똑하게: `claude-opus-5` |

`SUPABASE_URL`·`SUPABASE_ANON_KEY`는 플랫폼이 자동으로 넣어주므로 등록하지 않습니다.

## 3. 동작 확인

대시보드를 새로고침하고 왼쪽 위 **대시보드 챗봇**에 아무거나 물어봅니다.
패널 제목 옆이 **"AI 응답"** 으로 바뀌면 연결된 것입니다.
(**"기본 응답(엣지펑션 미배포)"** 이면 아직 함수를 못 찾은 상태)

## 문제가 생기면

| 증상 | 원인 / 조치 |
|---|---|
| 계속 "기본 응답" | 함수 이름 오타. `dash-chat` 이어야 함 (대시보드 새로고침 후 재확인) |
| `unauthorized` | 대시보드에서 로그아웃 상태. 다시 로그인 |
| `ANTHROPIC_API_KEY 미설정` | Secret 이름 오타 또는 미등록 |
| `anthropic 401` | API 키가 잘못됐거나 만료 |
| `anthropic 404` | 모델 이름 오타 — `DASH_CHAT_MODEL`을 지우면 기본값으로 돌아감 |

로그는 Edge Functions → `dash-chat` → **Logs** 에서 볼 수 있습니다.

## 이 함수가 하는 일 / 하지 않는 일

- **하는 일**: 브라우저가 보낸 "지금 화면이 계산한 값"과 질문을 받아 Claude에게 넘기고,
  그 값 안에서만 답하도록 제약한 뒤 문장을 돌려줍니다.
- **하지 않는 일**: 구글 시트를 읽지 않습니다. 데이터를 저장하지 않습니다.
  카카오톡 봇(`kakao-bot`)과 완전히 별개이며 서로 영향을 주지 않습니다.

숫자는 항상 대시보드가 계산한 값 그대로라 화면과 어긋나지 않습니다.
