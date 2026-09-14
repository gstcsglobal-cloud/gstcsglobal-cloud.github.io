# 자체 호스팅 라이브러리 (v134)

사내망이 `cdn.jsdelivr.net` 을 막으면 PPT 내보내기 버튼이 **아무 일도 안 하는** 상태가 된다.
CDN 이 «거부»하지 않고 «묵살»하면 `onerror` 가 영영 안 오기 때문이다(CLAUDE.md v105 규율).
시간 제한을 둬서 «막다른 길»은 없앴지만, 그래도 그 환경에서는 기능 자체를 못 쓴다.

그래서 여기에 둔다. 로더는 **여기를 먼저 보고, 없으면 CDN 으로 간다.**

| 파일 | 버전 | 라이선스 | 원본 |
|---|---|---|---|
| `pptxgen.bundle.js` | 3.12.0 | MIT | `npm pptxgenjs@3.12.0` → `dist/pptxgen.bundle.js` |
| `jszip.min.js` | 3.10.1 | MIT / GPLv3 (dual) | `npm jszip@3.10.1` → `dist/jszip.min.js` |
| `xlsx.full.min.js` | 0.18.5 | Apache-2.0 | `npm xlsx@0.18.5` → `dist/xlsx.full.min.js` (v135 · `/upload/` 리더) |
| `supabase.min.js` | 2.116.0 | MIT | `npm @supabase/supabase-js@2.116.0` → `dist/umd/supabase.js` (v135 · 인증·모든 읽기의 현관문 — 예전에는 CDN `@2` 로 열려 있어 버전이 «어느 날 바뀌는» 유일한 의존성이었다) |

**두 파일 다 원본 그대로다 — 한 바이트도 고치지 않았다.** 고치면 다음 사람이
「왜 CDN 판과 다르지」로 돌아온다. 올릴 일이 생기면 npm 에서 받아 그대로 덮어쓰고
`GST.PPT_VENDOR`·`GST.ZIP_VENDOR`·`GST.XLSX_VENDOR`·`GST.SB_VENDOR`(+`GST.SB_VER`) 의 버전 주석도 같이 고친다.

⚠ **버전을 CDN 폴백과 어긋나게 두지 말 것.** 로더가 둘 중 아무거나 잡으므로,
버전이 다르면 «어떤 사람은 되고 어떤 사람은 안 되는» 상태가 된다.

## chart.js · papaparse · chartjs-plugin-zoom (v135 · 8단계)

**화면의 모든 차트**가 chart.js 에 달려 있는데, 여덟 페이지가 그것을 `<head>` 의 차단형 CDN
스크립트로만 받고 있었다 — 사내망이 `cdn.jsdelivr.net` 을 묵살하면 PPT 버튼이 아니라
**대시보드 자체가 빈 화면**이 된다(v134 가 pptxgen 을 옮긴 것과 같은 이유, 더 큰 규모).

- `chart.umd.min.js` ← `npm pack chart.js@4.4.1` 의 `dist/chart.umd.js`
  (npm 은 min 판을 싣지 않는다 — jsDelivr 가 자동 압축한 것이다. **버전은 같다**)
- `papaparse.min.js` ← `npm pack papaparse@5.4.1` 의 `papaparse.min.js`
- `chartjs-plugin-zoom.min.js` ← `npm pack chartjs-plugin-zoom@2.0.1` 의 `dist/chartjs-plugin-zoom.min.js`

**로더를 안 쓰고 `document.write` 폴백을 쓰는 이유.** 이 셋은 `<head>` 에서 «차단형»으로 실려
페이지 초기화 순서를 정한다. 비동기 로더(`GST._loadScript`)로 바꾸면 여덟 페이지의 초기화가
통째로 재배열된다 — 지금 고칠 것이 아니다. `document.write` 는 **파싱 중에만** 쓰므로 순서가
그대로 유지되고, 자체 사본이 열리면 아예 실행되지 않는다.
