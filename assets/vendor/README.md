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

**두 파일 다 원본 그대로다 — 한 바이트도 고치지 않았다.** 고치면 다음 사람이
「왜 CDN 판과 다르지」로 돌아온다. 올릴 일이 생기면 npm 에서 받아 그대로 덮어쓰고
`GST.PPT_VENDOR`·`GST.ZIP_VENDOR`·`GST.XLSX_VENDOR` 의 버전 주석도 같이 고친다.

⚠ **버전을 CDN 폴백과 어긋나게 두지 말 것.** 로더가 둘 중 아무거나 잡으므로,
버전이 다르면 «어떤 사람은 되고 어떤 사람은 안 되는» 상태가 된다.
