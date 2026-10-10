# assets/geo — 통합 관제 지도 윤곽 (v171)

`tools/geo-build.mjs` 가 공개 자료에서 만든다(정수 좌표 · 델타 인코딩 · 단순화).

| 파일 | 원본 | 라이선스 |
|---|---|---|
| `world.json` | world-atlas `countries-50m.json` (Natural Earth 1:50m) | ISC · Natural Earth 는 public domain |
| `KR`·`TW`·`CN`·`JP`·`US`·`SG.json` | Natural Earth 10m `admin_1_states_provinces` | public domain |

다시 만들기:

```
node tools/geo-build.mjs <countries-50m.json> <ne_10m_admin_1_states_provinces.geojson> <mapshaper.js>
```

설비 «위치»(지역·단지·FAB → 좌표)는 여기 없다 — DB `geo_places`(setup-26)가 정본이고
데이터 관리 › 사이트 › 「지도 위치」에서 고친다. 실데이터라 저장소에 두지 않는다.
