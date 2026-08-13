# kakao-bot 재배포

## v82 (2026-08-13) — 데이터 출처를 구글시트 → Supabase 로

구글시트가 은퇴했다(신규 데이터는 `/upload/` CSV 업로드). 봇이 계속 시트를 읽으면
**마지막 시트 상태에서 영원히 멈춘 답**을 하므로, `fetchCsv`가 시트(sheet-proxy) 대신
같은 Supabase 표를 읽어 «시트 모양 CSV»로 되살린다. 파서(hr.js)·캐시·라우팅은 무수정 —
**이번 배포는 `index.ts` 하나만 교체하면 된다** (hr.js 변경 없음).

- 배포: Edge Functions → kakao-bot → `index.ts` 전체 교체 → Deploy
- Secret: 추가·삭제 없음. `SHEET_PUB_URL`·`SHEET_PROXY_SLUG`는 더 이상 읽지 않지만
  지워도 되고 놔둬도 된다.
- **sync-kakao-bot cron 은 절대 끄지 말 것** — 이제 DB→bot_cache 갱신의 유일한 경로다.
- 배포 후 확인: `?op=sync` 한 번 돌리고(아래 5번 방식) 카톡에서
  "올해 F16 고장 TOP3" → 대시보드 고장분석 수치와 일치하면 성공.
- 검증 근거: `tests/t-botdb.mjs` — 원본 CSV 파싱과 표 복원 CSV 파싱을 레코드 단위로
  대조 (수선 17,091 · 설치 1,490 · CIP 4,700 전부 일치).

---

# (이전) 웹 챗봇 통합 버전

이 폴더의 `index.ts` + `hr.js`는 **현재 배포하신 kakao-bot(2026-08-11 전달본) 기준 수정본**입니다.
카카오톡 동작은 그대로 두고, 두 가지가 더해졌습니다:

1. **`hr.js` 교육 파서 수정 (긴급)** — 시트 B열 머리글이 `교육과정`→`Site`로 바뀐 뒤
   `parseEdu`가 `NO_HEADER`로 죽어서 **교육 데이터가 통째로 비어 있었습니다.**
   대시보드와 같은 머리글 자동 탐지로 교체했고, Scrubber Lv.2/Lv.3 완료일·비고도 읽습니다.
2. **웹 챗봇 입구 (`?op=web`)** — 대시보드 챗봇이 카카오봇과 같은 엔진(시트 미러링 `bot_cache`
   + 라우팅 + 분석)을 씁니다. 이제 "F16 W30 휴가 인원"처럼 라인×기간을 교차한 행 단위
   질문에도 답합니다. 모델은 기존 그대로(라우팅 Haiku · 분석 Sonnet) — 비용 증가 없습니다.

## 배포 방법 (웹 콘솔)

1. Supabase → Edge Functions → **kakao-bot** 함수 열기 (새로 만들지 않습니다)
2. `index.ts` 내용을 이 폴더의 `index.ts`로 전체 교체
3. 함수 안의 `hr.js` 파일도 이 폴더의 `hr.js`로 전체 교체
4. **Deploy**
5. 배포 후 한 번 실행: 브라우저에서
   `https://<프로젝트>.supabase.co/functions/v1/kakao-bot?op=sync&key=edu`
   에 `x-sync-secret` 헤더를 붙여 호출 (기존 sync 방식 그대로) → 교육 캐시가 새로 찹니다.

Secret은 기존 것 그대로 씁니다 — 새로 추가할 것 없습니다.
(`ANTHROPIC_API_KEY` · `SHEET_PUB_URL` · `SYNC_SECRET` · `KAKAO_SHARED_SECRET` 등)

## 확인

- **카카오톡**: 교육 관련 질문("W30 기준 LV1 미이수자") → 인원이 다시 잡히면 성공
- **웹**: 대시보드 챗봇에 "F16 W30 휴가 인원 현황" → 패널 제목 옆 **"AI 응답(시트 원본)"**
  표시와 함께 건수가 나오면 성공. (401이 나오면 대시보드 로그아웃 상태 → 재로그인)

## 웹 분기가 하는 일 (참고)

```
브라우저(로그인 JWT + 질문 + 화면 KPI 요약)
  → kakao-bot?op=web
  → JWT 검증 + allowed_users 대조        ← 대시보드와 같은 권한 체계
  → routeQuery(Haiku): 필요한 데이터셋 판단
  → bot_cache 로드 (10분 신선도, 낡으면 백그라운드 재동기화)
  → serializeData: 시트 원본 행 → 집계/샘플 직렬화
  → analyzeForWeb(Sonnet): 자연어 답변 (화면 값과 어긋나지 않게 화면 요약도 함께 참조)
  → {answer} JSON
```

카카오 경로와 다른 점: 5초 제한 없음(콜백 불필요) · 마크다운 허용 · 950자 제한 없음 ·
메뉴/QuickReply 없음 · `kakao_users` 테이블을 건드리지 않음.

## 함께 알아둘 것

- 기존에 배포하셨던 **`dash-chat` 함수는 이제 호출되지 않습니다.** 지워도 되고 둬도 무해합니다.
- `bot_query_log`에 웹 질의도 남습니다 (`bot_user_key = "web:이메일"`).
